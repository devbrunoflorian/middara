"""Audit and restore missing white A-H callout boxes in page backgrounds.

The PDF source contains these rounded rectangles as white vector fills. The
background extraction can drop some fills while leaving the A-H text in the
HTML layer, which makes the letter disappear on dark or illustrated areas.
This script pairs only white 8-30pt rectangles with a centered, single-letter
A-H PDF text word, compares a glyph-free interior patch, and restores the
source fill when the extracted background is not white there.
"""

from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageStat


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages"
SAMPLE_INSET = (0.8, 3.5, 2.5, 5.0)


def is_white(fill: object) -> bool:
    return isinstance(fill, (tuple, list)) and len(fill) == 3 and all(float(value) >= 0.95 for value in fill)


def marker_labels(page: pymupdf.Page) -> list[tuple[str, pymupdf.Rect]]:
    labels: list[tuple[str, pymupdf.Rect]] = []
    for word in page.get_text("words"):
        text = str(word[4]).strip().upper()
        if len(text) == 1 and text in "ABCDEFGH":
            labels.append((text, pymupdf.Rect(word[:4])))
    return labels


def sample_median(image: Image.Image, box: pymupdf.Rect, sx: float, sy: float) -> tuple[float, float, float]:
    ix0, iy0, ix1, iy1 = SAMPLE_INSET
    rect = (
        round((box.x0 + ix0) * sx),
        round((box.y0 + iy0) * sy),
        round((box.x0 + ix1) * sx),
        round((box.y0 + iy1) * sy),
    )
    return tuple(float(value) for value in ImageStat.Stat(image.crop(rect).convert("RGB")).median)  # type: ignore[return-value]


def patch_boxes(image: Image.Image, boxes: list[pymupdf.Rect], sx: float, sy: float) -> Image.Image:
    # Draw at 4x so rounded corners stay smooth in the 1710px page assets.
    factor = 4
    enlarged = image.convert("RGB").resize((image.width * factor, image.height * factor), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(enlarged)
    for box in boxes:
        bounds = tuple(round(value * factor) for value in (box.x0 * sx, box.y0 * sy, box.x1 * sx, box.y1 * sy))
        radius = round(min(box.width * sx, box.height * sy) * factor * 0.16)
        draw.rounded_rectangle(bounds, radius=radius, fill=(255, 255, 255))
    return enlarged.resize(image.size, Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--out", type=Path, default=ROOT / "tmp/component-audit/alphabet-marker-fill-repair.csv")
    parser.add_argument("--apply", action="store_true", help="write the corrected background.webp files")
    args = parser.parse_args()

    rows: list[dict[str, object]] = []
    by_page: dict[int, list[pymupdf.Rect]] = {}
    with pymupdf.open(args.pdf) as document:
        for page_number, page in enumerate(document, start=1):
            background_path = PAGE_DIR / f"page_{page_number:03d}" / "background.webp"
            if not background_path.is_file():
                continue
            background = Image.open(background_path).convert("RGB")
            sx = background.width / page.rect.width
            sy = background.height / page.rect.height
            labels = marker_labels(page)
            seen: set[tuple[int, int, int, int]] = set()
            for drawing in page.get_drawings():
                box = drawing.get("rect")
                if box is None or not is_white(drawing.get("fill")):
                    continue
                if not (8 <= box.width <= 30 and 8 <= box.height <= 30):
                    continue
                if box.x0 < 0 or box.y0 < 0 or box.x1 > page.rect.width or box.y1 > page.rect.height:
                    continue
                key = tuple(round(value * 1000) for value in box)
                if key in seen:
                    continue
                seen.add(key)

                center = pymupdf.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)
                matches = [(center.distance_to(pymupdf.Point((label_box.x0 + label_box.x1) / 2, (label_box.y0 + label_box.y1) / 2)), label) for label, label_box in labels]
                if not matches:
                    continue
                gap, label = min(matches)
                if gap > 1.5:
                    continue

                median = sample_median(background, box, sx, sy)
                healthy = all(value >= 232 for value in median)
                if not healthy:
                    by_page.setdefault(page_number, []).append(box)
                rows.append({
                    "page": page_number,
                    "label": label,
                    "box": ",".join(f"{value:.3f}" for value in box),
                    "labelCenterGapPt": round(gap, 3),
                    "backgroundSampleMedianRgb": ",".join(str(round(value, 1)) for value in median),
                    "fillPreserved": healthy,
                    "repairApplied": bool(args.apply and not healthy),
                })

            if args.apply and by_page.get(page_number):
                corrected = patch_boxes(background, by_page[page_number], sx, sy)
                corrected.save(background_path, format="WEBP", lossless=True, method=6)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8-sig") as stream:
        fields = list(rows[0]) if rows else ["page", "label", "box"]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    repairs = [row for row in rows if not row["fillPreserved"]]
    summary = {
        "pairedMarkersAudited": len(rows),
        "missingWhiteFills": len(repairs),
        "affectedPages": sorted({int(row["page"]) for row in repairs}),
        "repaired": args.apply,
    }
    print(summary)
    for row in repairs:
        print(f"p{int(row['page']):03} {row['label']} box={row['box']} rgb={row['backgroundSampleMedianRgb']}")
    print(f"CSV: {args.out.resolve()}")


if __name__ == "__main__":
    main()
