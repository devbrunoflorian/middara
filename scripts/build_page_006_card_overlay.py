"""Build the page 6 shared fidelity patch from the source PDF.

This restores PDF-rendered card pixels over the viewer's imperfect image/text
recomposition. The mask is constrained to embedded image placements, audited
card-label blocks, and five confirmed vector backings. The patch contains only
physical components and card-printed labels, so it is shared by EN and PT-BR.
Do not generalize it to other pages without a new visual audit.
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
PAGE_DIR = ROOT / "apps/web/public/pages/page_006"
DOM_PATH = PAGE_DIR / "page_006_dom.json"
OVERLAY_PATH = PAGE_DIR / "fidelity-overlay-hidden-cards.png"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"

# Card image placements are clustered here; page-wide texture images are
# excluded by the maximum rectangle area.
CARD_REGION_PT = (545.0, 185.0, 795.0, 420.0)
MAX_IMAGE_AREA_PT2 = 16_000.0
# White-filled vector backings left visible in the extracted background even
# though the source PDF's final composition covers them with card artwork.
# Keep these two confirmed paths local to this audited card group.
CARD_VECTOR_BACKING_BBOXES_PT = (
    (586.34, 253.64, 630.42, 313.20),
    (607.79, 360.89, 649.12, 414.64),
)
CARD_DARK_BACKING_BBOXES_PT = (
    (609.00, 191.10, 728.90, 298.00),
    (636.20, 245.30, 756.10, 352.20),
    (666.40, 298.00, 786.30, 404.90),
)
CARD_DARK_FILL = (0.13669031858444214, 0.12195010483264923, 0.1252918243408203)
PATCHED_TEXT_BLOCK_IDS = {
    "block_10", "block_94", "block_95", "block_96", "block_98",
    "block_235", "block_239", "block_243", "block_250", "block_254",
    "block_257", "block_261", "block_266", "block_267", "block_271",
    # A vector label overlaps a rasterized token; the PDF displays EXIT once.
    "block_115",
}


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(f"Source PDF not found: {PDF_PATH}")

    page_data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    background = Image.open(PAGE_DIR / "background.webp").convert("RGB")
    document = pymupdf.open(PDF_PATH)
    page = document[5]  # Printed page 6 is physical PDF page 6.
    scale = background.width / page.rect.width

    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    source = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    if source.size != background.size:
        raise ValueError(
            f"Source/background size mismatch: {source.size} != {background.size}"
        )

    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    x0, y0, x1, y1 = CARD_REGION_PT
    placements = 0

    for image_info in page.get_images(full=True):
        xref = image_info[0]
        for rect, matrix in page.get_image_rects(xref, transform=True):
            if (
                rect.x1 < x0
                or rect.x0 > x1
                or rect.y1 < y0
                or rect.y0 > y1
                or rect.width * rect.height > MAX_IMAGE_AREA_PT2
            ):
                continue
            corners = [
                ((matrix.a * x + matrix.c * y + matrix.e) * scale,
                 (matrix.b * x + matrix.d * y + matrix.f) * scale)
                for x, y in ((0, 0), (1, 0), (1, 1), (0, 1))
            ]
            draw.polygon(corners, fill=255)
            placements += 1

    vector_backings = []
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        rect = drawing["rect"]
        if fill is None or not all(abs(channel - 1.0) < 1e-6 for channel in fill):
            continue
        for expected in CARD_VECTOR_BACKING_BBOXES_PT:
            if all(abs(actual - target) <= 0.05 for actual, target in zip(rect, expected)):
                draw.rectangle(tuple(value * scale for value in expected), fill=255)
                vector_backings.append(expected)

    if len(vector_backings) != len(CARD_VECTOR_BACKING_BBOXES_PT):
        raise ValueError(
            f"Expected {len(CARD_VECTOR_BACKING_BBOXES_PT)} white vector backings, "
            f"found {len(vector_backings)}"
        )

    dark_backings = []
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        rect = drawing["rect"]
        if fill is None or not all(
            abs(channel - target) < 1e-5
            for channel, target in zip(fill, CARD_DARK_FILL)
        ):
            continue
        for expected in CARD_DARK_BACKING_BBOXES_PT:
            if all(abs(actual - target) <= 0.05 for actual, target in zip(rect, expected)):
                draw.rectangle(tuple(value * scale for value in expected), fill=255)
                dark_backings.append(expected)

    if len(dark_backings) != len(CARD_DARK_BACKING_BBOXES_PT):
        raise ValueError(
            f"Expected {len(CARD_DARK_BACKING_BBOXES_PT)} dark card backings, "
            f"found {len(dark_backings)}"
        )

    text_blocks = 0
    for block in page_data["blocks"]:
        if block["id"] not in PATCHED_TEXT_BLOCK_IDS:
            continue
        bx0, by0, bx1, by1 = block["bbox"]
        padding_pt = 1.5
        draw.rectangle(
            (
                (bx0 - padding_pt) * scale,
                (by0 - padding_pt) * scale,
                (bx1 + padding_pt) * scale,
                (by1 + padding_pt) * scale,
            ),
            fill=255,
        )
        text_blocks += 1

    if placements != 19 or text_blocks != len(PATCHED_TEXT_BLOCK_IDS):
        raise ValueError(
            f"Unexpected mask inputs: {placements} image placements, "
            f"{text_blocks} text blocks"
        )

    # A one-pixel dilation protects antialiasing along the card silhouettes.
    mask = mask.filter(ImageFilter.MaxFilter(3))
    bounds = mask.getbbox()
    if not bounds or bounds == (0, 0, source.width, source.height):
        raise ValueError(f"Invalid overlay bounds: {bounds}")

    overlay = Image.new("RGBA", source.size, (0, 0, 0, 0))
    overlay.paste(source, (0, 0))
    overlay.putalpha(mask)
    overlay = overlay.crop(bounds)
    overlay.save(OVERLAY_PATH, optimize=True)

    bbox_pt = [round(value / scale, 5) for value in bounds]
    sidecar = {
        "overlays": [],
    }
    if SIDECAR_PATH.is_file():
        sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    overlays = sidecar.setdefault("overlays", [])
    entry = {
        "url": "/pages/page_006/fidelity-overlay-hidden-cards.png",
        "bbox": bbox_pt,
        "widthPx": overlay.width,
        "heightPx": overlay.height,
        "language": "en",
        "languageInvariant": True,
    }
    existing = next((item for item in overlays if item.get("url") == entry["url"]), None)
    if existing is None:
        overlays.append(entry)
    else:
        overlays[overlays.index(existing)] = entry
    SIDECAR_PATH.write_text(
        json.dumps(sidecar, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote {OVERLAY_PATH} ({overlay.width}x{overlay.height}) and "
        f"{SIDECAR_PATH}; PDF placements={placements}, "
        f"vector backings={len(vector_backings)}, "
        f"dark backings={len(dark_backings)}, text blocks={text_blocks}, "
        f"bbox_pt={bbox_pt}"
    )


if __name__ == "__main__":
    main()
