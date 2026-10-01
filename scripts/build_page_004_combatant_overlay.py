"""Restore the printed text on page 4's three tilted Combatant cards.

The background extractor removes text operators from the card artwork. The
remaining vector spans are tilted in the PDF, but the current HTML renderer
only supports axis-aligned lines, so those spans cannot reproduce the cards
faithfully. This page-local patch restores source PDF pixels inside the three
audited transformed card-image polygons and marks only their HTML lines as
rasterized duplicates for the normal English view.
"""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(
    r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
)
PAGE_DIR = ROOT / "apps/web/public/pages/page_004"
DOM_PATH = PAGE_DIR / "page_004_dom.json"
BACKGROUND_PATH = PAGE_DIR / "background.webp"
OVERLAY_PATH = PAGE_DIR / "fidelity-overlay-combatant-cards.png"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"

PAGE_INDEX = 3
CARD_IMAGES = {
    35472: (598.223, 102.839, 713.351, 204.427),
    35492: (598.247, 123.919, 712.895, 225.423),
    63153: (598.726, 145.121, 712.484, 246.120),
}
CARD_TEXT_REGION_PT = (590.0, 98.0, 720.0, 256.0)
EXPECTED_HTML_LINES = 210


def close_bbox(actual: tuple[float, ...], expected: tuple[float, ...]) -> bool:
    return all(abs(a - e) <= 0.05 for a, e in zip(actual, expected))


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(f"Source PDF not found: {PDF_PATH}")

    document = pymupdf.open(PDF_PATH)
    page = document[PAGE_INDEX]
    background = Image.open(BACKGROUND_PATH).convert("RGB")
    scale = background.width / page.rect.width
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    source = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    if source.size != background.size:
        raise ValueError(
            f"Source/background size mismatch: {source.size} != {background.size}"
        )

    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    for xref, expected_bbox in CARD_IMAGES.items():
        placements = page.get_image_rects(xref, transform=True)
        if len(placements) != 1:
            raise ValueError(f"Expected one placement for xref {xref}, found {len(placements)}")
        rect, matrix = placements[0]
        actual_bbox = tuple(rect)
        if not close_bbox(actual_bbox, expected_bbox):
            raise ValueError(
                f"Unexpected card xref {xref} bbox: {actual_bbox}; expected {expected_bbox}"
            )
        corners = [
            (
                (matrix.a * x + matrix.c * y + matrix.e) * scale,
                (matrix.b * x + matrix.d * y + matrix.f) * scale,
            )
            for x, y in ((0, 0), (1, 0), (1, 1), (0, 1))
        ]
        draw.polygon(corners, fill=255)

    # Expand a single output pixel to retain antialiased text/card edges.
    mask = mask.filter(ImageFilter.MaxFilter(3))
    bounds = mask.getbbox()
    if not bounds:
        raise ValueError("Card mask is empty")

    overlay = Image.new("RGBA", source.size, (0, 0, 0, 0))
    overlay.paste(source, (0, 0))
    overlay.putalpha(mask)
    overlay = overlay.crop(bounds)
    overlay.save(OVERLAY_PATH, optimize=True)

    page_data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    x0, y0, x1, y1 = CARD_TEXT_REGION_PT
    marked_lines = 0
    for block in page_data["blocks"]:
        for line in block.get("lines", []):
            bx0, by0, bx1, by1 = line["bbox"]
            cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
            if x0 <= cx <= x1 and y0 <= cy <= y1 and line.get("renderTinyText"):
                line["rasterizedDuplicate"] = True
                marked_lines += 1
    if marked_lines != EXPECTED_HTML_LINES:
        raise ValueError(
            f"Expected {EXPECTED_HTML_LINES} audited tiny card lines, found {marked_lines}; "
            "review line classification before regenerating the overlay"
        )

    DOM_PATH.write_text(
        json.dumps(page_data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    bbox_pt = [round(value / scale, 5) for value in bounds]
    sidecar = {
        "overlays": [
            {
                "url": "/pages/page_004/fidelity-overlay-combatant-cards.png",
                "bbox": bbox_pt,
                "widthPx": overlay.width,
                "heightPx": overlay.height,
                "language": "en",
                "hideInAdmin": True,
            }
        ]
    }
    SIDECAR_PATH.write_text(
        json.dumps(sidecar, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(
        f"Wrote {OVERLAY_PATH} ({overlay.width}x{overlay.height}) and "
        f"{SIDECAR_PATH}; masked {len(CARD_IMAGES)} transformed card placements; "
        f"marked {marked_lines} source lines as rasterized duplicates; bbox_pt={bbox_pt}"
    )


if __name__ == "__main__":
    main()
