"""Create PDF/background comparison strips for suppressed pictogram spans.

The report never classifies or changes page data automatically. Each strip
shows the source PDF crop, the app's actual background crop, and their absolute
pixel difference so that an auditor can confirm whether suppression is safe.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages"
PICTOGRAM_FONTS = ("ZapfDingbats", "Wingdings", "Webdings")


def compact(text: str) -> str:
    return " ".join(text.encode("unicode_escape").decode("ascii").split())[:64]


def span_rows(page_json: dict, page_number: int) -> list[dict]:
    rows = []
    seen: set[tuple] = set()
    for block_index, block in enumerate(page_json.get("blocks", [])):
        for line_index, line in enumerate(block.get("lines", [])):
            for span_index, span in enumerate(line.get("spans", [])):
                font = span.get("font", "")
                text = span.get("text", "")
                if not text.strip() or not any(name in font for name in PICTOGRAM_FONTS):
                    continue
                bbox = span.get("bbox", line.get("bbox", []))
                signature = (font, text, tuple(round(float(v), 2) for v in bbox))
                if signature in seen:
                    continue
                seen.add(signature)
                rows.append({
                    "page": page_number,
                    "blockIndex": block_index,
                    "lineIndex": line_index,
                    "spanIndex": span_index,
                    "font": font,
                    "textCodepoints": compact(text),
                    "text": text,
                    "sizePt": round(float(span.get("size", 0)), 3),
                    "bbox": [float(v) for v in bbox],
                    "rasterizedDuplicate": bool(line.get("rasterizedDuplicate", False)),
                })
    return rows


def crop_with_pad(image: Image.Image, bbox: tuple[int, int, int, int], pad: int) -> Image.Image:
    x0, y0, x1, y1 = bbox
    return image.crop((max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad), min(image.height, y1 + pad)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--pages", type=int, nargs="+", required=True)
    parser.add_argument("--json-dir", type=Path, default=PAGE_DIR)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--scale", type=float, default=2.0, help="PDF render pixels per PDF point")
    parser.add_argument("--pad-pt", type=float, default=4.0, help="Context around each span in source PDF points")
    parser.add_argument("--max-per-page", type=int, default=0, help="Optional cap for visual strips and CSV rows per page; default is unlimited")
    args = parser.parse_args()

    doc = pymupdf.open(args.pdf)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    rows_out = []
    font = ImageFont.load_default()
    for page_number in args.pages:
        json_path = args.json_dir / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        bg_path = json_path.parent / "background.webp"
        if not json_path.is_file() or not bg_path.is_file():
            print(f"Page {page_number}: skipped (missing JSON or local WebP background)")
            continue
        page_json = json.loads(json_path.read_text(encoding="utf-8"))
        pdf_page = doc[page_number - 1]
        bg = Image.open(bg_path).convert("RGB")
        sx, sy = bg.width / float(page_json["width"]), bg.height / float(page_json["height"])
        # Render PDF to the exact background dimensions for a fair pixel comparison.
        pix = pdf_page.get_pixmap(matrix=pymupdf.Matrix(bg.width / pdf_page.rect.width, bg.height / pdf_page.rect.height), alpha=False)
        source = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        scale_x, scale_y = pix.width / float(page_json["width"]), pix.height / float(page_json["height"])
        pad_x, pad_y = round(args.pad_pt * scale_x), round(args.pad_pt * scale_y)
        strips = []
        candidates = span_rows(page_json, page_number)
        if args.max_per_page > 0:
            candidates = candidates[:args.max_per_page]
        for row in candidates:
            x0, y0, x1, y1 = row["bbox"]
            pixel_bbox = (
                round(x0 * scale_x), round(y0 * scale_y),
                round(x1 * scale_x), round(y1 * scale_y),
            )
            pdf_crop = crop_with_pad(source, pixel_bbox, max(pad_x, pad_y))
            bg_crop = crop_with_pad(bg, pixel_bbox, max(pad_x, pad_y))
            if pdf_crop.size != bg_crop.size:
                width, height = max(pdf_crop.width, bg_crop.width), max(pdf_crop.height, bg_crop.height)
                pdf_crop = pdf_crop.resize((width, height))
                bg_crop = bg_crop.resize((width, height))
            diff = ImageChops.difference(pdf_crop, bg_crop)
            mae = sum(ImageStat.Stat(diff).mean) / 3
            row["cropMaeRgb"] = round(mae, 3)
            row["classification"] = "visual-review-required"
            rows_out.append({key: value for key, value in row.items() if key != "bbox"} | {"bbox": ",".join(f"{v:.2f}" for v in row["bbox"])})

            panel_w = max(pdf_crop.width, bg_crop.width, diff.width, 140)
            zoom = max(1, min(5, 120 // max(pdf_crop.height, 1)))
            panels = [img.resize((img.width * zoom, img.height * zoom), Image.Resampling.NEAREST) for img in (pdf_crop, bg_crop, diff)]
            panel_h = max(img.height for img in panels)
            strip = Image.new("RGB", (panel_w * 3 + 24, panel_h + 40), "white")
            draw = ImageDraw.Draw(strip)
            label = f"p{page_number} {row['font']} {row['textCodepoints']} {row['sizePt']}pt  MAE={mae:.1f}"
            draw.text((0, 0), label, fill="black", font=font)
            for index, (img, title) in enumerate(zip(panels, ("PDF", "APP BG", "DIFF"))):
                x = index * (panel_w + 8)
                draw.text((x, 13), title, fill="black", font=font)
                strip.paste(img, (x, 26))
            strips.append(strip)

        if strips:
            rows_per_sheet = 20
            for part, start in enumerate(range(0, len(strips), rows_per_sheet), start=1):
                chunk = strips[start:start + rows_per_sheet]
                width = max(strip.width for strip in chunk)
                height = sum(strip.height for strip in chunk)
                sheet = Image.new("RGB", (width, height), "#d8d8d8")
                y = 0
                for strip in chunk:
                    sheet.paste(strip, (0, y))
                    y += strip.height
                out_image = args.out_dir / f"page-{page_number:03d}-pictograms-{part:02d}.png"
                sheet.save(out_image)
            print(f"Page {page_number}: {len(strips)} spans in {(len(strips) + rows_per_sheet - 1) // rows_per_sheet} strips files")
        else:
            print(f"Page {page_number}: no local pictogram spans")

    csv_path = args.out_dir / "pictogram-background-comparisons.csv"
    fields = ["page", "blockIndex", "lineIndex", "spanIndex", "font", "textCodepoints", "text", "sizePt", "bbox", "rasterizedDuplicate", "cropMaeRgb", "classification"]
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows_out)
    print(f"Candidate spans: {len(rows_out)}; visual classification left to reviewer")
    print(f"CSV: {csv_path.resolve()}")


if __name__ == "__main__":
    main()
