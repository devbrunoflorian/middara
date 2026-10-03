"""Restore the source PDF's white inline A marker on page 83.

The text extractor correctly keeps the A as editable HTML, but the background
extractor leaves a dark fill where the source PDF has a white rounded square.
This paints only the verified vector shape's white fill into background.webp;
the HTML A remains untouched.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


BACKGROUND = Path("apps/web/public/pages/page_083/background.webp")
PAGE_WIDTH_PT = 820.3460083007812
BOX = (173.077392578125, 116.25152587890625, 184.41639709472656, 127.59052276611328)
CORNER_RADIUS_PT = 2.835


def main() -> None:
    image = Image.open(BACKGROUND).convert("RGB")
    scale = image.width / PAGE_WIDTH_PT
    x0, y0, x1, y1 = BOX
    left, top = round(x0 * scale), round(y0 * scale)
    right, bottom = round(x1 * scale), round(y1 * scale)
    width, height = right - left, bottom - top

    supersample = 8
    mask = Image.new("L", (width * supersample, height * supersample), 0)
    draw = ImageDraw.Draw(mask)
    rect = (
        x0 * scale * supersample - left * supersample,
        y0 * scale * supersample - top * supersample,
        x1 * scale * supersample - left * supersample,
        y1 * scale * supersample - top * supersample,
    )
    draw.rounded_rectangle(rect, radius=CORNER_RADIUS_PT * scale * supersample, fill=255)
    mask = mask.resize((width, height), Image.Resampling.LANCZOS)
    white = Image.new("RGB", (width, height), "white")
    image.paste(white, (left, top), mask)
    image.save(BACKGROUND, format="WEBP", quality=95, method=6)
    print(f"restored page 83 inline A marker fill at {BOX}; scale={scale:.6f}")


if __name__ == "__main__":
    main()
