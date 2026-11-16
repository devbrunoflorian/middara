#!/usr/bin/env python3
"""Restore the p.38 second-table black header fill in the raster background.

The source PDF draws this table header as a solid vector rectangle and keeps
the white column names as live text. The generated page background omitted
the rectangle fill, leaving those editable white labels over beige. This
page-scoped repair paints only the audited vector fill into background.webp;
the text remains in the DOM for translation.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw
import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 38
EXPECTED_RECT = (86.82, 391.51, 733.92, 406.88)
EXPECTED_FILL = (0.13669031858444214, 0.12195010483264923, 0.1252918243408203)
BACKGROUND = ROOT / "apps/web/public/pages/page_038/background.webp"


def close(a: float, b: float, tolerance: float = 0.03) -> bool:
    return abs(a - b) <= tolerance


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="paint the audited vector fill into background.webp")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()
    if not args.apply:
        print(f"p.38 Table 2 header fill: preview only; source bbox={EXPECTED_RECT}")
        return
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    if not BACKGROUND.is_file():
        raise FileNotFoundError(BACKGROUND)

    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        page_rect = page.rect
        matches = []
        for shape in page.get_drawings():
            rect = shape["rect"]
            fill = shape.get("fill")
            actual_rect = (rect.x0, rect.y0, rect.x1, rect.y1)
            if fill and all(close(a, b) for a, b in zip(actual_rect, EXPECTED_RECT)):
                matches.append((actual_rect, fill))
        if len(matches) != 1:
            raise SystemExit(f"Expected one matching p.38 vector fill; found {len(matches)}")
        actual_rect, fill = matches[0]
        if any(abs(a - b) > 0.002 for a, b in zip(fill, EXPECTED_FILL)):
            raise SystemExit(f"Unexpected source fill color: {fill!r}")
        color = tuple(round(channel * 255) for channel in fill)

    with Image.open(BACKGROUND) as source:
        image = source.convert("RGB")
        scale_x = image.width / page_rect.width
        scale_y = image.height / page_rect.height
        x0, y0, x1, y1 = actual_rect
        pixel_box = (
            math.floor(x0 * scale_x),
            math.floor(y0 * scale_y),
            math.ceil(x1 * scale_x) - 1,
            math.ceil(y1 * scale_y) - 1,
        )
        ImageDraw.Draw(image).rectangle(pixel_box, fill=color)
        image.save(BACKGROUND, format="WEBP", lossless=True, quality=100, method=6)

    print(f"p.38: restored Table 2 header fill {color} at PDF bbox {actual_rect}; live labels unchanged")


if __name__ == "__main__":
    main()
