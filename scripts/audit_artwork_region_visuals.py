"""Build read-only PDF/background comparison sheets for artwork ghost candidates.

Each output shows the source PDF and the viewer's stored background at equal
pixel dimensions, with candidate line bboxes drawn on both. Pixel differences
are evidence for review only; this tool never labels a ghost or edits the book.
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    parts = tuple(float(part) for part in value.split(","))
    if len(parts) != 4:
        raise ValueError(f"Expected four bbox coordinates, got: {value!r}")
    return parts


def crop_rect(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = bbox
    return image.crop((max(0, x0), max(0, y0), min(image.width, x1), min(image.height, y1)))


def region_key(row: dict) -> tuple[int, int, str]:
    return (int(row["page"]), int(row["imageSeq"]), str(row["imageBBox"]))


def render_region(
    source: Image.Image,
    background: Image.Image,
    region: dict,
    lines: list[dict],
    scale_x: float,
    scale_y: float,
    out_path: Path,
    max_panel_size: int,
) -> dict:
    x0, y0, x1, y1 = parse_bbox(region["imageBBox"])
    pad = 8
    region_pixels = (
        round(x0 * scale_x) - pad,
        round(y0 * scale_y) - pad,
        round(x1 * scale_x) + pad,
        round(y1 * scale_y) + pad,
    )
    pdf_crop = crop_rect(source, region_pixels).convert("RGB")
    bg_crop = crop_rect(background, region_pixels).convert("RGB")
    panel_width = max(pdf_crop.width, bg_crop.width)
    panel_height = max(pdf_crop.height, bg_crop.height)
    pdf_crop = pdf_crop.resize((panel_width, panel_height))
    bg_crop = bg_crop.resize((panel_width, panel_height))

    # Draw the exact candidate line bounds on both images. The labels are visual
    # locators only; the CSV retains the stable line ids and full text.
    for panel in (pdf_crop, bg_crop):
        draw = ImageDraw.Draw(panel)
        for index, line in enumerate(lines, start=1):
            lx0, ly0, lx1, ly1 = parse_bbox(line["bbox"])
            box = (
                round(lx0 * scale_x) - region_pixels[0],
                round(ly0 * scale_y) - region_pixels[1],
                round(lx1 * scale_x) - region_pixels[0],
                round(ly1 * scale_y) - region_pixels[1],
            )
            draw.rectangle(box, outline="#ff1744", width=2)
            if index <= 99:
                draw.text((box[0], max(0, box[1] - 11)), str(index), fill="#ff1744")

    diff = ImageEnhance.Contrast(ImageChops.difference(pdf_crop, bg_crop)).enhance(3.0)
    metric_values = []
    line_metrics = []
    for line in lines:
        lx0, ly0, lx1, ly1 = parse_bbox(line["bbox"])
        left = crop_rect(source, (
            round(lx0 * scale_x), round(ly0 * scale_y),
            round(lx1 * scale_x), round(ly1 * scale_y),
        ))
        right = crop_rect(background, (
            round(lx0 * scale_x), round(ly0 * scale_y),
            round(lx1 * scale_x), round(ly1 * scale_y),
        ))
        if left.size != right.size:
            right = right.resize(left.size)
        diff_line = ImageChops.difference(left.convert("RGB"), right.convert("RGB"))
        pixel_bytes = diff_line.tobytes()
        pixel_count = len(pixel_bytes) // 3
        delta_sum = 0.0
        gt8 = gt24 = gt64 = 0
        for offset in range(0, len(pixel_bytes), 3):
            delta = sum(pixel_bytes[offset:offset + 3]) / 3
            delta_sum += delta
            gt8 += delta > 8
            gt24 += delta > 24
            gt64 += delta > 64
        if pixel_count:
            mean_diff = delta_sum / pixel_count
            metric_values.append(mean_diff)
        else:
            mean_diff = ""
        line_metrics.append({
            "page": int(line["page"]),
            "blockId": line["block_id"],
            "lineId": line["line_id"],
            "text": line["text"],
            "bbox": line["bbox"],
            "suspectedGhost": line["suspectedGhost"],
            "alreadyRasterizedDuplicate": line["alreadyRasterizedDuplicate"],
            "meanLineCropDiffRgb": round(mean_diff, 3) if mean_diff != "" else "",
            "pixelsDiffGt8Pct": round(100 * gt8 / pixel_count, 2) if pixel_count else "",
            "pixelsDiffGt24Pct": round(100 * gt24 / pixel_count, 2) if pixel_count else "",
            "pixelsDiffGt64Pct": round(100 * gt64 / pixel_count, 2) if pixel_count else "",
        })

    zoom = min(1.0, max_panel_size / max(panel_width, panel_height, 1))
    if zoom < 1:
        size = (max(1, round(panel_width * zoom)), max(1, round(panel_height * zoom)))
        pdf_crop = pdf_crop.resize(size, Image.Resampling.LANCZOS)
        bg_crop = bg_crop.resize(size, Image.Resampling.LANCZOS)
        diff = diff.resize(size, Image.Resampling.LANCZOS)

    font = ImageFont.load_default()
    gap, header, footer = 12, 42, 128
    label_w = pdf_crop.width
    output = Image.new(
        "RGB", (label_w * 3 + gap * 4, pdf_crop.height + header + footer), "white"
    )
    draw = ImageDraw.Draw(output)
    page = int(region["page"])
    title = (
        f"p{page:03d} {region['regionId']} | {len(lines)} candidate lines | "
        f"mean line-crop diff={sum(metric_values) / len(metric_values):.1f}"
        if metric_values else f"p{page:03d} {region['regionId']} | {len(lines)} candidate lines"
    )
    draw.text((gap, 4), title, fill="black", font=font)
    images = (pdf_crop, bg_crop, diff)
    labels = ("SOURCE PDF", "VIEWER BACKGROUND", "3x ABSOLUTE DIFF")
    for index, (panel, label) in enumerate(zip(images, labels)):
        x = gap + index * (label_w + gap)
        draw.text((x, 23), label, fill="#222222", font=font)
        output.paste(panel, (x, header))

    # Keep the page/line text visible in the same artifact to make batch review
    # possible without consulting the full 5k-row candidate spreadsheet.
    text_lines = []
    for index, line in enumerate(lines[:8], start=1):
        marks = []
        if line.get("suspectedGhost", "").casefold() == "true":
            marks.append("suspectedGhost")
        if line.get("alreadyRasterizedDuplicate", "").casefold() == "true":
            marks.append("confirmed duplicate")
        text_lines.append(f"{index}. {line['text'][:90]}" + (f" [{', '.join(marks)}]" if marks else ""))
    if len(lines) > 8:
        text_lines.append(f"… and {len(lines) - 8} more lines in this region; see CSV")
    for index, text in enumerate(text_lines):
        draw.text((gap, header + pdf_crop.height + 4 + index * 12), text, fill="#222222", font=font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(out_path, "JPEG", quality=88, optimize=True)
    return {
        "page": page,
        "regionId": region["regionId"],
        "candidateLineCount": len(lines),
        "meanLineCropDiff": round(sum(metric_values) / len(metric_values), 3) if metric_values else "",
        "visualStatus": "visual-review-required",
        "image": out_path.name,
        "lineMetrics": line_metrics,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--json-dir", type=Path, default=PAGE_DIR)
    parser.add_argument("--lines-csv", required=True, type=Path)
    parser.add_argument("--regions-csv", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--pages", help="Optional comma-separated 1-based page numbers")
    parser.add_argument("--max-panel-size", type=int, default=900)
    parser.add_argument(
        "--include-confirmed",
        action="store_true",
        help="Render explicit-duplicate regions too, for calibrating the comparison against known positives",
    )
    args = parser.parse_args()

    selected = {int(value) for value in args.pages.split(",")} if args.pages else None
    with args.lines_csv.open(encoding="utf-8-sig", newline="") as handle:
        candidate_rows = list(csv.DictReader(handle))
    with args.regions_csv.open(encoding="utf-8-sig", newline="") as handle:
        region_rows = list(csv.DictReader(handle))
    candidates_by_region: dict[tuple[int, int, str], list[dict]] = defaultdict(list)
    for row in candidate_rows:
        candidates_by_region[region_key(row)].append(row)

    doc = pymupdf.open(args.pdf)
    results = []
    line_metrics = []
    regions_by_page: dict[int, list[dict]] = defaultdict(list)
    for region in region_rows:
        page_number = int(region["page"])
        selected_page = selected is None or page_number in selected
        is_reviewable = region["reviewStatus"] == "needs-visual-review" or args.include_confirmed
        if selected_page and is_reviewable:
            regions_by_page[page_number].append(region)

    for page_number, page_regions in sorted(regions_by_page.items()):
        page_dir = args.json_dir / f"page_{page_number:03d}"
        json_path = page_dir / f"page_{page_number:03d}_dom.json"
        background_path = page_dir / "background.webp"
        if not json_path.is_file() or not background_path.is_file():
            continue
        pdf_page = doc[page_number - 1]
        background = Image.open(background_path).convert("RGB")
        sx = background.width / pdf_page.rect.width
        sy = background.height / pdf_page.rect.height
        pix = pdf_page.get_pixmap(matrix=pymupdf.Matrix(sx, sy), alpha=False)
        source = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        for region in page_regions:
            key = region_key(region)
            line_rows = candidates_by_region.get(key, [])
            if not line_rows:
                continue
            image_path = args.out_dir / f"{region['regionId']}.jpg"
            result = render_region(
                source, background, region, line_rows, sx, sy, image_path, args.max_panel_size
            )
            results.append({key: value for key, value in result.items() if key != "lineMetrics"})
            line_metrics.extend(result["lineMetrics"])

    args.out_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.out_dir / "artwork-region-visual-review.csv"
    with report_path.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["page", "regionId", "candidateLineCount", "meanLineCropDiff", "visualStatus", "image"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(results)
    line_report_path = args.out_dir / "artwork-line-pixel-diffs.csv"
    with line_report_path.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = [
            "page", "blockId", "lineId", "text", "bbox", "suspectedGhost",
            "alreadyRasterizedDuplicate", "meanLineCropDiffRgb", "pixelsDiffGt8Pct",
            "pixelsDiffGt24Pct", "pixelsDiffGt64Pct",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(line_metrics)
    print(f"Visual review sheets: {len(results)}")
    print(f"Review CSV: {report_path.resolve()}")
    print(f"Line pixel-diff CSV: {line_report_path.resolve()}")


if __name__ == "__main__":
    main()
