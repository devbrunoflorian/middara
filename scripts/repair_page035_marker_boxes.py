"""Restore the white A/E callout boxes on page 35's raster background.

The PDF keeps the marker letters as editable text, but the background extractor
turned the first and last white boxes of this rail dark.  A clean white box from
the same rail is copied without its letter, leaving the A/E HTML glyphs intact.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


PAGE_WIDTH_PT = 820.3460083007812

# PDF-point rectangles from the source page's vector drawings.
CLEAN_BOX = (87.874, 120.328, 105.244, 137.698)  # B
TARGET_BOXES = [
    (88.078, 83.220, 105.448, 100.590),  # A
    (88.078, 235.244, 105.448, 252.614),  # E
]


def pixel_rect(rect: tuple[float, float, float, float], scale: float) -> tuple[int, int, int, int]:
    return tuple(round(value * scale) for value in rect)  # type: ignore[return-value]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--background",
        type=Path,
        default=Path("apps/web/public/pages/page_035/background.webp"),
    )
    args = parser.parse_args()
    image = Image.open(args.background).convert("RGB")
    scale = image.width / PAGE_WIDTH_PT
    clean = pixel_rect(CLEAN_BOX, scale)
    patch = image.crop(clean)
    for target in TARGET_BOXES:
        destination = pixel_rect(target, scale)
        image.paste(patch.resize((destination[2] - destination[0], destination[3] - destination[1])), destination[:2])
    image.save(args.background, format="WEBP", quality=95, method=6)
    print(f"patched page 35 marker boxes A/E using B; scale={scale:.6f}")


if __name__ == "__main__":
    main()
