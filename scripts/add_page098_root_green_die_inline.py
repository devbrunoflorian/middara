"""Source-check and optionally register the inline green die in p.98 Root prose.

Dry-run by default. With --apply, writes only the p.98 semantic sidecar and its
source-local cleanup crop; the official PDF and translated Payload stay read-only.
"""
from __future__ import annotations

import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_098"
DOM_PATH = PAGE / "page_098_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
EVIDENCE = ROOT / "apps/web/output/p98-root-symbol-investigation"

# Confirmed in the official PDF. The two text spans on line_17_4/line_17_5
# flank this one vector: GREEN + source gap -> die -> source gap + " of".
TARGET = {
    "symbolId": "dice.green",
    "bbox": [208.2425994873047, 243.81593322753906, 218.63259887695312, 255.5529327392578],
    "drawingIndices": [212, 213, 214, 215],
    "blockId": "block_17",
    "lineId": "line_17_4",
    "spanIndex": 1,
    "ownerSpanIndex": 0,
    "expectedLineText": "GREEN ",
}
ROOT_ROW_BOTTOM_PT = 261.991


def render_symbol(entry: dict, width_pt: float, height_pt: float, pad_pt: float = .75) -> Image.Image:
    view = entry["render"]["viewBox"]
    width, height = width_pt + 2 * pad_pt, height_pt + 2 * pad_pt
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=str(round(width * 4)),
                      height=str(round(height * 4)), viewBox=f"0 0 {width} {height}")
    group = ET.SubElement(root, "g", transform=f"translate({pad_pt} {pad_pt}) scale({width_pt/view[2]} {height_pt/view[3]})")
    names = {"strokeWidth": "stroke-width", "fillRule": "fill-rule", "strokeLinecap": "stroke-linecap", "strokeLinejoin": "stroke-linejoin"}
    for path in entry["render"]["paths"]:
        ET.SubElement(group, "path", {names.get(key, key): str(value) for key, value in path.items()})
    svg = pymupdf.open("svg", ET.tostring(root, encoding="utf-8"))
    pix = svg[0].get_pixmap(alpha=True)
    return Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    symbols = {entry["id"]: entry for entry in registry}
    if TARGET["symbolId"] not in symbols:
        raise ValueError("dice.green is missing from the existing semantic registry")

    source_block_index = next((i for i, block in enumerate(dom["blocks"]) if block["id"] == TARGET["blockId"]), -1)
    if source_block_index < 0:
        raise ValueError("Source block moved: block_17")
    source_block = dom["blocks"][source_block_index]
    source_line = next((line for line in source_block["lines"] if line["id"] == TARGET["lineId"]), None)
    if source_line is None or "".join(span["text"] for span in source_line["spans"]) != TARGET["expectedLineText"]:
        raise ValueError("Source text anchor changed; refusing to attach the die")
    anchor_span = source_line["spans"][TARGET["spanIndex"]]
    owner_span = source_line["spans"][TARGET["ownerSpanIndex"]]
    if anchor_span["text"].strip() or owner_span["text"] != "GREEN" or anchor_span["size"] != 10:
        raise ValueError("Unexpected font, whitespace, or semantic owner at the p.98 anchor")

    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"schemaVersion": 1, "elements": []}
    existing_mappings = [item for item in sidecar["elements"] if item.get("drawingIndices") == TARGET["drawingIndices"]]
    if len(existing_mappings) > 1:
        raise ValueError("The source die is mapped more than once")

    with pymupdf.open(PDF) as source, pymupdf.open(PDF) as mask_doc:
        source_page, mask_page = source[97], mask_doc[97]
        drawings = source_page.get_drawings()
        if max(TARGET["drawingIndices"]) >= len(drawings):
            raise ValueError("Source drawing sequence changed")
        target_box = pymupdf.Rect(TARGET["bbox"])
        selected = [drawings[index] for index in TARGET["drawingIndices"]]
        if any(not (target_box + (-.02, -.02, .02, .02)).contains(drawing["rect"]) for drawing in selected):
            raise ValueError("One or more source paths no longer belong to the measured green die bbox")
        if selected[0]["fill"] is None or selected[0]["fill"][1] < .7 or selected[0]["fill"][0] < .6:
            raise ValueError("The target vector is no longer the source green die")

        # The PDF's stroked-path paint bounds extend beyond the nominal
        # drawing bbox. Inflate each source path by half its stroke width and
        # include a small antialias margin; the narrower crop left edge slivers.
        # Text can share this crop because PageRenderer paints editable source
        # text above the page-background cleanup patch.
        paint_bounds = source_page.get_bboxlog()
        paint_area = pymupdf.Rect(TARGET["bbox"])
        redaction_area = pymupdf.Rect(TARGET["bbox"])
        for drawing in selected:
            path_bounds = pymupdf.Rect(drawing["rect"])
            stroke = float(drawing.get("width") or 0) / 2
            if stroke:
                path_bounds += (-stroke, -stroke, stroke, stroke)
            paint_area |= path_bounds
            seq = drawing["seqno"]
            redaction_area |= pymupdf.Rect(paint_bounds[seq][1])
            if drawing["type"] == "fs" and seq + 1 < len(paint_bounds) and paint_bounds[seq + 1][0] == "stroke-path":
                redaction_area |= pymupdf.Rect(paint_bounds[seq + 1][1])
        mask_box = paint_area + (-.12, -.12, .12, .12)
        if not mask_box.contains(target_box):
            raise ValueError("Cleanup crop does not cover the measured semantic symbol")
        if mask_box.y1 > ROOT_ROW_BOTTOM_PT - 1.0:
            raise ValueError("Cleanup crop enters the following table row's one-point safety margin")

        # Redaction takes place only in a temporary in-memory copy of the PDF.
        # Source text is removed before the small crop is rasterized; the live
        # PageRenderer paints source text above this page-background patch.
        for text_block in mask_page.get_text("blocks"):
            if text_block[4].strip():
                mask_page.add_redact_annot(pymupdf.Rect(text_block[:4]), fill=None)
        mask_page.apply_redactions(images=0, graphics=0, text=0)
        mask_page.add_redact_annot(redaction_area + (-.15, -.15, .15, .15), fill=None)
        mask_page.apply_redactions(images=0, graphics=1, text=1)
        for index in TARGET["drawingIndices"]:
            rect = tuple(round(value, 3) for value in drawings[index]["rect"])
            if any(tuple(round(value, 3) for value in remaining["rect"]) == rect for remaining in mask_page.get_drawings()):
                raise ValueError(f"Source vector path {index} remains after cleanup")

        full = mask_page.get_pixmap(matrix=pymupdf.Matrix(4, 4), alpha=False)
        background = Image.frombytes("RGB", (full.width, full.height), full.samples)
        crop_box = tuple(round(value * 4) for value in mask_box)
        patch = background.crop(crop_box)
        original_pix = source_page.get_pixmap(matrix=pymupdf.Matrix(4, 4), clip=mask_box, alpha=False)
        original = Image.frombytes("RGB", (original_pix.width, original_pix.height), original_pix.samples)
        rendered = render_symbol(symbols[TARGET["symbolId"]], target_box.width, target_box.height)
        composed = patch.copy()
        composed.paste(rendered, (round((target_box.x0-mask_box.x0-.75)*4), round((target_box.y0-mask_box.y0-.75)*4)), rendered)
        source_diff = ImageChops.difference(original, patch).convert("L").point(lambda value: 255 if value > 24 else 0)
        registry_diff = ImageChops.difference(composed, patch).convert("L").point(lambda value: 255 if value > 24 else 0)
        source_pixels = {(x, y) for y in range(source_diff.height) for x in range(source_diff.width) if source_diff.getpixel((x, y))}
        registry_pixels = {(x, y) for y in range(registry_diff.height) for x in range(registry_diff.width) if registry_diff.getpixel((x, y))}
        union = source_pixels | registry_pixels
        iou = len(source_pixels & registry_pixels) / len(union) if union else 1.0

        element = {
            "symbolId": TARGET["symbolId"],
            "bbox": list(TARGET["bbox"]),
            "drawingIndices": list(TARGET["drawingIndices"]),
            "anchor": {
                "blockId": TARGET["blockId"], "blockIndex": source_block_index,
                "lineId": TARGET["lineId"], "spanIndex": TARGET["spanIndex"], "side": "after",
                "sizePt": float(anchor_span["size"]),
                "gapPt": round(TARGET["bbox"][0] - anchor_span["bbox"][2], 6),
                "ownerSpanRef": {"lineId": TARGET["lineId"], "spanIndex": TARGET["ownerSpanIndex"]},
            },
            "metrics": {
                "widthEm": target_box.width / float(anchor_span["size"]),
                "heightEm": target_box.height / float(anchor_span["size"]),
                "verticalAlignEm": (target_box.y1 - float(owner_span["origin"][1])) / float(anchor_span["size"]),
            },
            "mask": {"url": "/pages/page_098/inline-element-mask-000.png", "bbox": list(mask_box)},
        }
        already_mapped = existing_mappings[0] if existing_mappings else None
        if already_mapped and json.dumps(already_mapped, sort_keys=True) != json.dumps(element, sort_keys=True):
            previous = json.loads(json.dumps(already_mapped))
            proposed = json.loads(json.dumps(element))
            previous_mask = previous.pop("mask", None)
            proposed_mask = proposed.pop("mask", None)
            known_old_masks = [
                {"url": "/pages/page_098/inline-element-mask-000.png", "bbox": [207.99, 243.56, 218.88, 255.8]},
                {"url": "/pages/page_098/inline-element-mask-000.png", "bbox": [204.12259948730468, 239.69593322753906, 222.75259887695313, 259.67291748046875]},
            ]
            if previous != proposed or previous_mask not in known_old_masks:
                raise ValueError("The existing source-die mapping differs beyond the known undersized cleanup crop")
            existing_mappings[0].update(element)

        # Side-by-side evidence distinguishes the original vector, cleanup
        # patch, and existing registry reconstruction at the same raster scale.
        scale = 12
        row = Image.new("RGB", (max(original.width, patch.width)*scale*3+48, max(original.height, patch.height)*scale+34), "#f4f0e8")
        draw = ImageDraw.Draw(row)
        draw.text((8, 4), "Official PDF crop", fill="#111111")
        draw.text((16+original.width*scale, 4), "Vector removed", fill="#111111")
        draw.text((24+(original.width+patch.width)*scale, 4), f"dice.green · IoU {iou:.3f}", fill="#111111")
        row.paste(original.resize((original.width*scale, original.height*scale), Image.Resampling.NEAREST), (8, 22))
        row.paste(patch.resize((patch.width*scale, patch.height*scale), Image.Resampling.NEAREST), (16+original.width*scale, 22))
        row.paste(composed.resize((composed.width*scale, composed.height*scale), Image.Resampling.NEAREST),
                  (24+(original.width+patch.width)*scale, 22))
        full_source_crop = source_page.get_pixmap(matrix=pymupdf.Matrix(5,5), clip=pymupdf.Rect(170,225,330,260), alpha=False)
        source_context = Image.frombytes("RGB", (full_source_crop.width, full_source_crop.height), full_source_crop.samples)

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    preview_path = EVIDENCE / "p98-green-die-sidecar-dry-run.png"
    context_path = EVIDENCE / "source-p98-root-green-die-crop.png"
    source_context.save(context_path)
    if args.apply:
        if sidecar.get("elements") and not already_mapped:
            raise ValueError("Unexpected existing p.98 inline sidecar; review before merging")
        if not already_mapped:
            sidecar["elements"].append(element)
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        patch.save(PAGE / "inline-element-mask-000.png")
        proof_path = EVIDENCE / "p98-green-die-source-patch-registry.png"
        row.save(proof_path)
    else:
        row.save(preview_path)
    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run", "element": element,
        "registrySource": symbols[TARGET["symbolId"]].get("source"),
        "sourcePixelCount": len(source_pixels), "registryPixelCount": len(registry_pixels),
        "threshold24IoU": round(iou, 4), "crop": list(mask_box),
        "sourcePaintBounds": list(paint_area), "sourceRedactionBounds": list(redaction_area),
        "rootRowBottomPt": ROOT_ROW_BOTTOM_PT,
        "cropToRootRowClearancePt": round(ROOT_ROW_BOTTOM_PT - mask_box.y1, 3),
        "evidence": str(EVIDENCE.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
