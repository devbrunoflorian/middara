"""Rebuild inline-source cleanup patches on the exact background.webp pixel grid.

The PDF page is rendered after removing each catalogued inline symbol. Crops
then use the same pixel dimensions and point-to-pixel scale as background.webp,
so translated-flow cleanup does not leave antialias rings around source ink.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pymupdf as fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGES = ROOT / "apps/web/public/pages"


def drawing_removal_rects(
    source_page: fitz.Page, elements: list[dict]
) -> list[tuple[dict, fitz.Rect]]:
    drawings = source_page.get_drawings()
    paint_bounds = source_page.get_bboxlog()
    rects: list[tuple[dict, fitz.Rect]] = []
    for element in elements:
        # Text-glyph symbols were already removed by the text redaction above.
        # Only erase source vector elements here; a bbox by itself is not a
        # license to remove unrelated artwork or nearby drawing operations.
        if not element.get("drawingIndices"):
            continue
        rect = fitz.Rect(element["bbox"])
        for index in element.get("drawingIndices", []):
            if index >= len(drawings):
                raise ValueError(f"Invalid drawing index {index} in {element['symbolId']}")
            drawing = drawings[index]
            seq = drawing["seqno"]
            if seq < len(paint_bounds):
                rect |= fitz.Rect(paint_bounds[seq][1])
            if (drawing.get("type") == "fs" and seq + 1 < len(paint_bounds)
                    and paint_bounds[seq + 1][0] == "stroke-path"):
                rect |= fitz.Rect(paint_bounds[seq + 1][1])
        rects.append((element, rect + (-0.3, -0.3, 0.3, 0.3)))
    return rects


def rebuild_page(page_number: int) -> dict:
    page_dir = PAGES / f"page_{page_number:03d}"
    sidecar_path = page_dir / "inline_elements.json"
    background_path = page_dir / "background.webp"
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    elements = sidecar.get("elements", [])
    targets = [element for element in elements if element.get("mask", {}).get("clipShape") == "circle"]
    if not targets:
        return {"page": page_number, "masks": 0, "skipped": "no circular cleanup masks"}

    with Image.open(background_path) as background:
        background_size = background.size
    source_doc = fitz.open(PDF)
    mask_doc = fitz.open(PDF)
    try:
        source_page = source_doc[page_number - 1]
        page = mask_doc[page_number - 1]
        scale_x = background_size[0] / page.rect.width
        scale_y = background_size[1] / page.rect.height

        # Mirror background.webp's text-free page, then remove catalogued
        # source vectors before rendering on that same raster grid.
        for block in page.get_text("blocks"):
            if block[4].strip():
                page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)

        for element, rect in drawing_removal_rects(source_page, elements):
            page.add_redact_annot(rect, fill=None)
            page.apply_redactions(images=0, graphics=1, text=1)

        pix = page.get_pixmap(matrix=fitz.Matrix(scale_x, scale_y), alpha=False)
        clean_page = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if clean_page.size != background_size:
            raise ValueError(
                f"p{page_number}: source render {clean_page.size} does not match background {background_size}"
            )

        updated = 0
        for element in targets:
            mask = element.get("mask")
            if not mask:
                continue
            x0, y0, x1, y1 = mask["bbox"]
            left = max(0, math.floor(x0 * scale_x))
            top = max(0, math.floor(y0 * scale_y))
            right = min(background_size[0], math.ceil(x1 * scale_x))
            bottom = min(background_size[1], math.ceil(y1 * scale_y))
            if right <= left or bottom <= top:
                raise ValueError(f"p{page_number}: empty mask crop for {element['symbolId']}")
            clean_page.crop((left, top, right, bottom)).save(page_dir / Path(mask["url"]).name)
            # Align the CSS box to the source raster pixels; this makes the
            # patch edges coincide with background.webp after scaling.
            mask["bbox"] = [left / scale_x, top / scale_y, right / scale_x, bottom / scale_y]
            updated += 1

        sidecar_path.write_text(
            json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return {
            "page": page_number,
            "masks": updated,
            "backgroundPixels": list(background_size),
            "pageSizePt": [page.rect.width, page.rect.height],
            "gridScale": [scale_x, scale_y],
        }
    finally:
        source_doc.close()
        mask_doc.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, nargs="+", required=True)
    args = parser.parse_args()
    print(json.dumps([rebuild_page(page) for page in args.pages], indent=2))


if __name__ == "__main__":
    main()
