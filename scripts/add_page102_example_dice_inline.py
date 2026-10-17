"""Prepare the two source-confirmed inline dice in the p.102 example.

The script is dry-run by default. With --apply it writes only p.102 inline
symbol metadata and local mask crops; the official PDF remains read-only.
"""
from __future__ import annotations

import argparse
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_102"
DOM_PATH = PAGE / "page_102_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
PREVIEW = ROOT / "tmp/p102-example-dice-inline-proof.png"

TARGETS = [
    dict(symbolId="dice.orange", bbox=[578.21, 694.74, 589.62, 706.51], drawingIndices=[40, 41, 42, 43],
         lineId="line_8_6", spanIndex=3, expectedSpan="ORANGE", maskRightPt=590.0),
    dict(symbolId="dice.red", bbox=[440.08, 708.51, 450.90, 720.28], drawingIndices=[44, 45, 46, 47],
         lineId="line_8_8", spanIndex=0, expectedSpan="RED", maskRightPt=451.25),
]


def mask_box(target: dict, drawings: list[dict]) -> pymupdf.Rect:
    pad = max(.4, max((drawings[index].get("width") or 0) / 2 + .3 for index in target["drawingIndices"]))
    rect = pymupdf.Rect(target["bbox"]) + (-pad, -pad, pad, pad)
    return pymupdf.Rect(math.floor(rect.x0 * 4) / 4, math.floor(rect.y0 * 4) / 4,
                        min(math.ceil(rect.x1 * 4) / 4, target["maskRightPt"]),
                        math.ceil(rect.y1 * 4) / 4)


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
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"elements": []}
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    symbols = {entry["id"]: entry for entry in registry}
    page_index = 101
    new_elements = []
    target_drawing_groups = {tuple(target["drawingIndices"]) for target in TARGETS}
    sidecar["elements"] = [item for item in sidecar["elements"]
                           if tuple(item.get("drawingIndices", [])) not in target_drawing_groups]

    with pymupdf.open(PDF) as source, pymupdf.open(PDF) as mask_doc:
        source_page, mask_page = source[page_index], mask_doc[page_index]
        drawings = source_page.get_drawings()
        for target in TARGETS:
            block = next(block for block in dom["blocks"] if block["id"] == "block_8")
            block_index = dom["blocks"].index(block)
            line = next(line for line in block["lines"] if line["id"] == target["lineId"])
            span = line["spans"][target["spanIndex"]]
            if span["text"].strip() != target["expectedSpan"]:
                raise ValueError(f"Unexpected source anchor {target['lineId']}:{target['spanIndex']}: {span['text']!r}")
            if not (8.8 <= span["size"] <= 9.0):
                raise ValueError(f"Unexpected source size for {target['symbolId']}: {span['size']}")
            if any(existing.get("drawingIndices") == target["drawingIndices"] for existing in sidecar["elements"]):
                raise ValueError(f"Source drawings already mapped: {target['drawingIndices']}")
            for index in target["drawingIndices"]:
                if not (pymupdf.Rect(target["bbox"]) + (-.02, -.02, .02, .02)).contains(drawings[index]["rect"]):
                    raise ValueError(f"Drawing {index} moved outside the verified icon bbox")
            target["anchor"] = {
                "blockId": "block_8", "blockIndex": block_index,
                "lineId": target["lineId"], "spanIndex": target["spanIndex"], "side": "after",
                "sizePt": span["size"],
                "gapPt": round(target["bbox"][0] - span["bbox"][2], 6),
            }
            baseline = span["origin"][1]
            target["metrics"] = {
                "widthEm": (target["bbox"][2] - target["bbox"][0]) / span["size"],
                "heightEm": (target["bbox"][3] - target["bbox"][1]) / span["size"],
                "verticalAlignEm": (target["bbox"][3] - baseline) / span["size"],
            }
            target["maskBox"] = mask_box(target, drawings)

        # The mask crop is a source-page patch with only the selected icon paths
        # removed. Every crop is limited to the icon ink and its stroke padding.
        for text_block in mask_page.get_text("blocks"):
            if text_block[4].strip():
                mask_page.add_redact_annot(pymupdf.Rect(text_block[:4]), fill=None)
        mask_page.apply_redactions(images=0, graphics=0, text=0)
        paint_bounds = source_page.get_bboxlog()
        for target in TARGETS:
            removal = pymupdf.Rect(target["bbox"])
            for index in target["drawingIndices"]:
                drawing = drawings[index]
                seq = drawing["seqno"]
                removal |= pymupdf.Rect(paint_bounds[seq][1])
                if drawing["type"] == "fs" and seq + 1 < len(paint_bounds) and paint_bounds[seq + 1][0] == "stroke-path":
                    removal |= pymupdf.Rect(paint_bounds[seq + 1][1])
            mask_page.add_redact_annot(removal + (-.3, -.3, .3, .3), fill=None)
            mask_page.apply_redactions(images=0, graphics=1, text=1)
        for target in TARGETS:
            for index in target["drawingIndices"]:
                rect = tuple(round(value, 2) for value in drawings[index]["rect"])
                if any(tuple(round(value, 2) for value in item["rect"]) == rect for item in mask_page.get_drawings()):
                    raise ValueError(f"Vector path remains after masking drawing {index}")

        full = mask_page.get_pixmap(matrix=pymupdf.Matrix(4, 4), alpha=False)
        image = Image.frombytes("RGB", (full.width, full.height), full.samples)
        existing_names = {item.get("mask", {}).get("url", "").rsplit("/", 1)[-1] for item in sidecar["elements"]}
        next_index = max([int(name.removeprefix("inline-element-mask-").removesuffix(".png"))
                          for name in existing_names if name.startswith("inline-element-mask-") and name.endswith(".png")] + [-1]) + 1
        proof_rows = []
        for offset, target in enumerate(TARGETS):
            filename = f"inline-element-mask-{next_index + offset:03d}.png"
            target["mask"] = {"url": f"/pages/page_102/{filename}", "bbox": list(target["maskBox"])}
            box = target["maskBox"]
            patch = image.crop(tuple(round(value * 4) for value in box))
            crop_pix = source_page.get_pixmap(matrix=pymupdf.Matrix(4, 4), clip=box, alpha=False)
            original = Image.frombytes("RGB", (crop_pix.width, crop_pix.height), crop_pix.samples)
            rendered = render_symbol(symbols[target["symbolId"]], target["bbox"][2] - target["bbox"][0],
                                     target["bbox"][3] - target["bbox"][1])
            composed = patch.copy()
            composed.paste(rendered, (round((target["bbox"][0] - box.x0 - .75) * 4),
                                      round((target["bbox"][1] - box.y0 - .75) * 4)), rendered)
            src = ImageChops.difference(original, patch).convert("L").point(lambda value: 255 if value > 24 else 0)
            reg = ImageChops.difference(composed, patch).convert("L").point(lambda value: 255 if value > 24 else 0)
            src_pixels = {(x, y) for y in range(src.height) for x in range(src.width) if src.getpixel((x, y))}
            reg_pixels = {(x, y) for y in range(reg.height) for x in range(reg.width) if reg.getpixel((x, y))}
            union = src_pixels | reg_pixels
            iou = len(src_pixels & reg_pixels) / len(union) if union else 1
            scale = 5
            row = Image.new("RGB", (max(original.width, patch.width) * scale * 3 + 50,
                                     max(original.height, patch.height) * scale + 34), "#f4f0e8")
            draw = ImageDraw.Draw(row)
            draw.text((8, 4), "PDF original", fill="#111111")
            draw.text((16 + original.width * scale, 4), "Patch", fill="#111111")
            draw.text((24 + (original.width + patch.width) * scale, 4), f"{target['symbolId']} · IoU {iou:.3f}", fill="#111111")
            row.paste(original.resize((original.width * scale, original.height * scale), Image.Resampling.NEAREST), (8, 22))
            row.paste(patch.resize((patch.width * scale, patch.height * scale), Image.Resampling.NEAREST), (16 + original.width * scale, 22))
            row.paste(composed.resize((composed.width * scale, composed.height * scale), Image.Resampling.NEAREST),
                      (24 + (original.width + patch.width) * scale, 22))
            proof_rows.append(row)
            target.pop("maskBox")
            target.pop("expectedSpan")
            target.pop("lineId")
            target.pop("spanIndex")
            target.pop("maskRightPt")
            new_elements.append(target)

        proof = Image.new("RGB", (max(row.width for row in proof_rows), sum(row.height for row in proof_rows)), "#f4f0e8")
        y = 0
        for row in proof_rows:
            proof.paste(row, (0, y)); y += row.height

    if args.apply:
        for target, offset in zip(new_elements, range(len(new_elements))):
            source_target = TARGETS[offset]
            filename = source_target["mask"]["url"].rsplit("/", 1)[-1]
            box = source_target["mask"]["bbox"]
            crop = image.crop(tuple(round(value * 4) for value in box))
            crop.save(PAGE / filename)
        sidecar["elements"].extend(new_elements)
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        PREVIEW.parent.mkdir(parents=True, exist_ok=True)
        proof.save(PREVIEW)
        output = str(SIDECAR_PATH)
    else:
        PREVIEW.parent.mkdir(parents=True, exist_ok=True)
        proof.save(PREVIEW)
        output = str(PREVIEW)
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "newElements": new_elements,
                      "proof": output}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
