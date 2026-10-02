#!/usr/bin/env python3
"""Build a diagnostic contact sheet for page-local gutter candidates."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PAGES = (4, 5, 13, 43)
INPUT_ROOT = ROOT / "tmp" / "ghost-audit"
CANDIDATE_CSV = INPUT_ROOT / "page-gutters" / "gutter-candidates.csv"
OUTPUT_PATH = INPUT_ROOT / "gutter-layout-classes-contact-sheet.png"
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
COLORS = ((245, 42, 54), (255, 160, 25), (40, 190, 225))


def font(size: int) -> ImageFont.ImageFont:
    for name in ("arial.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main() -> None:
    with CANDIDATE_CSV.open(encoding="utf-8-sig", newline="") as handle:
        all_rows = list(csv.DictReader(handle))

    page_panels = []
    for page_number in PAGES:
        page_key = f"{page_number:03}"
        dom_path = PAGE_ROOT / f"page_{page_key}" / f"page_{page_key}_dom.json"
        screenshot_path = INPUT_ROOT / f"p{page_key}-gutter-viewer-base.png"
        data = json.loads(dom_path.read_text(encoding="utf-8"))
        page_image = Image.open(screenshot_path).convert("RGB")
        draw = ImageDraw.Draw(page_image, "RGBA")
        page_rows = [row for row in all_rows if int(row["page"]) == page_number][:3]
        sx = page_image.width / float(data["width"])
        sy = page_image.height / float(data["height"])

        for index, row in enumerate(page_rows):
            color = COLORS[index % len(COLORS)]
            x0 = float(row["x0"]) * sx
            y0 = float(row["vertical_start"]) * sy
            y1 = float(row["vertical_end"]) * sy
            draw.line((x0, y0, x0, y1), fill=(*color, 235), width=3)
            text = f"x0 {float(row['x0']):.1f} pt / gap {float(row['gutter_width_pt']):.1f} / {row['coactive_bands']} bands"
            label_y = 6 + index * 22
            box = draw.textbbox((8, label_y), text, font=font(16))
            draw.rectangle((box[0] - 4, box[1] - 2, box[2] + 4, box[3] + 2), fill=(255, 255, 255, 220))
            draw.text((8, label_y), text, fill=(*color, 255), font=font(16))

        page_panels.append((page_number, page_image))

    panel_width, panel_height = page_panels[0][1].size
    header_height = 54
    sheet = Image.new("RGB", (panel_width * 2, (panel_height + header_height) * 2), "white")
    sheet_draw = ImageDraw.Draw(sheet)
    for index, (page_number, image) in enumerate(page_panels):
        x = (index % 2) * panel_width
        y = (index // 2) * (panel_height + header_height)
        sheet_draw.text((x + 12, y + 8), f"PAGE {page_number} — candidate corridors, segment limited to detected y range", fill=(25, 25, 25), font=font(19))
        sheet.paste(image, (x, y + header_height))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_PATH)
    print(f"Contact sheet: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
