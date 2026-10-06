"""Adapt the p.13 bounty skull image as one source-measured inline symbol.

Dry-run by default. The --apply mode writes only the combat.skull visual
variant, p.13 inline-element sidecar/mask and the extracted PNG asset. The
source PDF, page DOM and translation database are read-only.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages/page_013"
DOM_PATH = PAGE_DIR / "page_013_dom.json"
SIDECAR_PATH = PAGE_DIR / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
ASSET_NAME = "source-symbol-bounty-skull.png"
IMAGE_XREF = 54306
SMASK_XREF = 54305
VARIANT_ID = "bounty-red-raster"
EXPECTED_SOURCE_BBOX = fitz.Rect(544.67236328125, 560.719482421875, 558.524169921875, 581.182373046875)
FONT_SIZE = 10.0


def quarter_pt_box(rect: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(math.floor(rect.x0 * 4) / 4, math.floor(rect.y0 * 4) / 4,
                     math.ceil(rect.x1 * 4) / 4, math.ceil(rect.y1 * 4) / 4)


def get_icon_png(document: fitz.Document) -> fitz.Pixmap:
    base = fitz.Pixmap(document, IMAGE_XREF)
    alpha = fitz.Pixmap(document, SMASK_XREF)
    return fitz.Pixmap(fitz.csRGB, fitz.Pixmap(base, alpha))


def build_preview(source: fitz.Page, clean_patch: Image.Image, icon: Image.Image,
                  bbox: fitz.Rect, mask_box: fitz.Rect, output: Path) -> None:
    source_pix = source.get_pixmap(matrix=fitz.Matrix(4, 4), clip=mask_box, alpha=False)
    original = Image.frombytes("RGB", (source_pix.width, source_pix.height), source_pix.samples)
    composed = clean_patch.copy()
    symbol = icon.resize((round(bbox.width * 4), round(bbox.height * 4)), Image.Resampling.LANCZOS)
    xy = (round((bbox.x0 - mask_box.x0) * 4), round((bbox.y0 - mask_box.y0) * 4))
    composed.paste(symbol, xy, symbol)
    scale = 5
    panel_w, panel_h = original.width * scale, original.height * scale
    sheet = Image.new("RGB", (panel_w * 3 + 40, panel_h + 48), "#f4f0e8")
    draw = ImageDraw.Draw(sheet)
    for x, title, panel in ((8, "PDF original", original),
                            (panel_w + 16, "Patch sem imagem fonte", clean_patch),
                            (panel_w * 2 + 24, "Patch + PNG extraído", composed)):
        draw.text((x, 4), title, fill="#111111")
        sheet.paste(panel.resize((panel_w, panel_h), Image.Resampling.NEAREST), (x, 28))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the focused p.13 adaptation")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    skull = next((entry for entry in registry if entry.get("id") == "combat.skull"), None)
    if skull is None:
        raise ValueError("Expected the existing combat.skull semantic definition")
    if any(e.get("symbolId") == "combat.skull" and e.get("metrics", {}).get("renderVariant") == VARIANT_ID
           for e in sidecar["elements"]):
        raise ValueError("The p.13 bounty skull adapter already exists; inspect before reapplying")

    block_index = next(i for i, block in enumerate(dom["blocks"]) if block["id"] == "block_48")
    block = dom["blocks"][block_index]
    line = next(line for line in block["lines"] if line["id"] == "line_48_0")
    if len(line["spans"]) != 1 or not line["spans"][0]["text"].startswith(" symbol."):
        raise ValueError("The source text/anchor on p.13 changed; review the PDF and DOM first")
    expected_page = dom["page_number"]
    if expected_page != 13:
        raise ValueError(f"Unexpected DOM page number: {expected_page}")

    with fitz.open(PDF) as source:
        page = source[12]
        references = [(i + 1, image) for i, current in enumerate(source)
                      for image in current.get_images(full=True) if image[0] == IMAGE_XREF]
        if len(references) != 1 or references[0][0] != 13:
            raise ValueError(f"Expected one PDF reference to the source raster skull, got {references}")
        image = next((item for item in page.get_image_info(xrefs=True)
                      if item.get("xref") == IMAGE_XREF), None)
        if image is None or image["width"] != 58 or image["height"] != 86:
            raise ValueError("The p.13 skull image resource changed")
        bbox = fitz.Rect(image["bbox"])
        if any(abs(a - b) > .01 for a, b in zip(bbox, EXPECTED_SOURCE_BBOX)):
            raise ValueError(f"Unexpected p.13 source image bbox: {image['bbox']}")
        source_span = next((span for text_block in page.get_text(
            "dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]
            if text_block.get("type") == 0 for text_line in text_block["lines"]
            for span in text_line["spans"]
            if span["text"].lstrip().startswith("symbol. Players") and abs(span["size"] - FONT_SIZE) < .01), None)
        if source_span is None:
            raise ValueError("The source text span after the skull changed")
        baseline = source_span["origin"][1]

        mask_box = quarter_pt_box(bbox + (-0.8, -0.8, 0.8, 0.8))
        icon_pixmap = get_icon_png(source)
        icon = Image.frombytes("RGBA", (icon_pixmap.width, icon_pixmap.height), icon_pixmap.samples)
        del icon_pixmap

        with fitz.open(PDF) as mask_document:
            mask_page = mask_document[12]
            for text_block in mask_page.get_text("blocks"):
                if text_block[4].strip():
                    mask_page.add_redact_annot(fitz.Rect(text_block[:4]), fill=None)
            mask_page.apply_redactions(images=0, graphics=0, text=0)
            mask_page.delete_image(IMAGE_XREF)
            clean_pixmap = mask_page.get_pixmap(matrix=fitz.Matrix(4, 4), clip=mask_box, alpha=False)
            clean_patch = Image.frombytes("RGB", (clean_pixmap.width, clean_pixmap.height), clean_pixmap.samples)

        preview_path = (ROOT / "docs/project-progress/evidence/2026-10-05-p13-bounty-skull"
                        / "p13-bounty-skull-source-variant.png") if args.apply else (
                        ROOT / "tmp/symbol-audit-p13-skull/p13-bounty-skull-source-variant.png")
        build_preview(page, clean_patch, icon, bbox, mask_box, preview_path)

    size = FONT_SIZE
    render_variant = dict(
        assetUrl=f"/pages/page_013/{ASSET_NAME}",
        widthEm=bbox.width / size,
        heightEm=bbox.height / size,
        verticalAlignEm=(bbox.y1 - baseline) / size,
    )
    skull.setdefault("render", {}).setdefault("variants", {})[VARIANT_ID] = render_variant
    element = dict(
        symbolId="combat.skull",
        bbox=[bbox.x0, bbox.y0, bbox.x1, bbox.y1],
        drawingIndices=[],
        anchor=dict(blockId="block_48", blockIndex=block_index, lineId="line_48_0",
                    spanIndex=0, side="before", sizePt=size),
        metrics=dict(widthEm=render_variant["widthEm"], heightEm=render_variant["heightEm"],
                     verticalAlignEm=render_variant["verticalAlignEm"], renderVariant=VARIANT_ID),
    )
    existing_mask_names = {Path(e.get("mask", {}).get("url", "")).name for e in sidecar["elements"]}
    next_index = max([int(name.removeprefix("inline-element-mask-").removesuffix(".png"))
                      for name in existing_mask_names if name.startswith("inline-element-mask-")
                      and name.endswith(".png")] + [-1]) + 1
    mask_name = f"inline-element-mask-{next_index:03d}.png"
    element["mask"] = dict(url=f"/pages/page_013/{mask_name}", bbox=list(mask_box))
    sidecar["elements"].append(element)

    if args.apply:
        icon.save(PAGE_DIR / ASSET_NAME)
        # Save the actual background patch from the reviewed PDF raster.
        clean_patch.save(PAGE_DIR / mask_name)
        REGISTRY_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Applied one p.13 skull raster variant; mask {mask_name}; visual evidence: {preview_path}")
    else:
        print("Dry run passed: one source image, one anchor, no equivalent raster occurrences; no project files changed.")
        print(f"Variant metrics: {json.dumps(render_variant)}")
        print(f"Anchor: block_48 / line_48_0 before {line['spans'][0]['text']!r}")
        print(f"Visual evidence: {preview_path}")


if __name__ == "__main__":
    main()
