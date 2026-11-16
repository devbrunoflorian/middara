"""Rank artwork text candidates by same-scale PDF/background/app differences.

The CSV scores prioritize review only. This tool never classifies or mutates a
line. Exact visual comparison is still required before any suppression/overlay.
"""

from __future__ import annotations

import argparse
import csv
import statistics
from collections import defaultdict
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageStat


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    coords = tuple(float(part) for part in value.split(","))
    if len(coords) != 4:
        raise ValueError(f"Expected four bbox values: {value!r}")
    return coords


def gray_mean_difference(a: Image.Image, b: Image.Image) -> float:
    if a.size != b.size:
        raise ValueError(f"Crop dimensions differ: {a.size} != {b.size}")
    return ImageStat.Stat(ImageChops.difference(a, b).convert("L")).mean[0]


def crop_bbox(image: Image.Image, bbox: tuple[float, ...], sx: float, sy: float) -> Image.Image | None:
    x0, y0, x1, y1 = bbox
    box = (
        max(0, round(x0 * sx)),
        max(0, round(y0 * sy)),
        min(image.width, round(x1 * sx)),
        min(image.height, round(y1 * sy)),
    )
    if box[2] <= box[0] or box[3] <= box[1]:
        return None
    return image.crop(box)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--lines-csv", required=True, type=Path, help="all-pages-v2 output from audit_artwork_text_overlays.py")
    parser.add_argument("--regions-csv", required=True, type=Path, help="all-regions-v2 output from audit_artwork_text_overlays.py")
    parser.add_argument("--captures", required=True, type=Path, help="Directory from capture_visual_audit_pages.mjs")
    parser.add_argument("--json-dir", required=True, type=Path, help="Page JSON/background root")
    parser.add_argument("--out-dir", required=True, type=Path, help="Ignored directory for triage CSVs")
    args = parser.parse_args()

    regions = [row for row in read_csv(args.regions_csv) if row["reviewStatus"] == "needs-visual-review"]
    lines = read_csv(args.lines_csv)
    allowed = {
        (int(row["page"]), row["imageSeq"], row["imageBBox"]): row
        for row in regions
    }
    grouped: dict[tuple[int, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in lines:
        key = (int(row["page"]), row["imageSeq"], row["imageBBox"])
        if key in allowed:
            grouped[key].append(row)
    missing = set(allowed) - set(grouped)
    if missing:
        raise ValueError(f"Candidate input is missing line rows for {len(missing)} pending regions")

    document = pymupdf.open(args.pdf)
    line_results: list[dict[str, object]] = []
    region_results: list[dict[str, object]] = []
    skipped_out_of_frame_lines = 0

    for page_number in sorted({key[0] for key in allowed}):
        capture_path = args.captures / f"app-page-{page_number:03}.jpg"
        if not capture_path.is_file():
            raise FileNotFoundError(f"Missing app capture for page {page_number}: {capture_path}")
        app = Image.open(capture_path).convert("RGB")
        pdf_page = document[page_number - 1]
        sx, sy = app.width / pdf_page.rect.width, app.height / pdf_page.rect.height
        pix = pdf_page.get_pixmap(matrix=pymupdf.Matrix(sx, sy), alpha=False)
        source = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if source.size != app.size:
            raise ValueError(f"Page {page_number} PDF/app size mismatch: {source.size} != {app.size}")
        background_path = args.json_dir / f"page_{page_number:03d}" / "background.webp"
        if not background_path.is_file():
            raise FileNotFoundError(background_path)
        background = Image.open(background_path).convert("RGB")
        if background.size != app.size:
            background = background.resize(app.size, Image.Resampling.LANCZOS)

        for key, region in allowed.items():
            if key[0] != page_number:
                continue
            region_crop = crop_bbox(source, parse_bbox(region["imageBBox"]), sx, sy)
            app_region = crop_bbox(app, parse_bbox(region["imageBBox"]), sx, sy)
            bg_region = crop_bbox(background, parse_bbox(region["imageBBox"]), sx, sy)
            if region_crop is None or app_region is None or bg_region is None:
                raise ValueError(f"Region crop falls outside the page: {region['regionId']}")
            line_deltas: list[float] = []
            for row in grouped[key]:
                bbox = parse_bbox(row["bbox"])
                src_line = crop_bbox(source, bbox, sx, sy)
                app_line = crop_bbox(app, bbox, sx, sy)
                bg_line = crop_bbox(background, bbox, sx, sy)
                if src_line is None or app_line is None or bg_line is None:
                    skipped_out_of_frame_lines += 1
                    continue
                app_diff = gray_mean_difference(src_line, app_line)
                bg_diff = gray_mean_difference(src_line, bg_line)
                delta = app_diff - bg_diff
                line_deltas.append(delta)
                line_results.append({
                    "page": page_number,
                    "regionId": region["regionId"],
                    "imageSeq": region["imageSeq"],
                    "lineId": row["line_id"],
                    "text": row["text"],
                    "bbox": row["bbox"],
                    "suspectedGhost": row["suspectedGhost"],
                    "alreadyRasterizedDuplicate": row["alreadyRasterizedDuplicate"],
                    "appSourceMeanGrayDiff": round(app_diff, 3),
                    "backgroundSourceMeanGrayDiff": round(bg_diff, 3),
                    "appMinusBackground": round(delta, 3),
                    "evidence": "triage only; inspect source PDF, background, and rendered app",
                })

            region_results.append({
                "page": page_number,
                "regionId": region["regionId"],
                "imageSeq": region["imageSeq"],
                "candidateLines": len(line_deltas),
                "suspectedGhostLines": region["suspectedGhostLineCount"],
                "sourceVsAppRegionMeanGrayDiff": round(gray_mean_difference(region_crop, app_region), 3),
                "sourceVsBackgroundRegionMeanGrayDiff": round(gray_mean_difference(region_crop, bg_region), 3),
                "meanLineAppMinusBackground": round(statistics.fmean(line_deltas), 3) if line_deltas else "",
                "maxLineAppMinusBackground": round(max(line_deltas), 3) if line_deltas else "",
                "lineDeltasAtLeast8": sum(delta >= 8 for delta in line_deltas),
                "interpretation": "priority score only; not a ghost verdict",
            })

    args.out_dir.mkdir(parents=True, exist_ok=True)
    outputs = [
        (
            "bookwide-region-app-pdf-triage.csv",
            region_results,
            ["page", "regionId", "imageSeq", "candidateLines", "suspectedGhostLines", "sourceVsAppRegionMeanGrayDiff", "sourceVsBackgroundRegionMeanGrayDiff", "meanLineAppMinusBackground", "maxLineAppMinusBackground", "lineDeltasAtLeast8", "interpretation"],
        ),
        (
            "bookwide-line-app-pdf-triage.csv",
            line_results,
            ["page", "regionId", "imageSeq", "lineId", "text", "bbox", "suspectedGhost", "alreadyRasterizedDuplicate", "appSourceMeanGrayDiff", "backgroundSourceMeanGrayDiff", "appMinusBackground", "evidence"],
        ),
    ]
    for filename, rows, fields in outputs:
        with (args.out_dir / filename).open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    mapped_lines = sum(len(group) for group in grouped.values())
    print(f"Compared {len(line_results)} valid candidate line crops in {len(region_results)} regions across {len({int(r['page']) for r in regions})} pages")
    print(f"Skipped {skipped_out_of_frame_lines} line boxes outside the screenshot frame ({mapped_lines} candidates mapped)")
    print("Outputs are triage rankings only; no source classification or mutation was performed.")


if __name__ == "__main__":
    main()
