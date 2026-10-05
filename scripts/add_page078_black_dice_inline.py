"""Add three source-confirmed black dice to page 78's inline symbol adapters.

Dry-run by default. The source PDF and page DOM are read-only; --apply writes
only p.78 inline metadata and its three conditional erasure masks.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_078"
DOM_PATH = PAGE / "page_078_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
EVIDENCE = ROOT / "docs/project-progress/evidence/2026-10-05-inline-elements-followup"

TARGETS = [
    dict(bbox=[210.05589294433594,477.099609375,220.1259002685547,488.7236022949219],
         drawingIndices=[124,125,126,127], blockIndex=8, blockId="block_20", lineId="line_20_4", spanIndex=2),
    dict(bbox=[188.19589233398438,488.099609375,198.26589965820312,499.7236022949219],
         drawingIndices=[128,129,130,131], blockIndex=8, blockId="block_20", lineId="line_20_6", spanIndex=2),
    dict(bbox=[569.801513671875,742.6187744140625,578.8895263671875,753.1098022460938],
         drawingIndices=[177,178,179,180], blockIndex=10, blockId="block_22", lineId="line_22_21", spanIndex=1),
]


def source_baseline(page: fitz.Page, span: dict) -> float:
    for block in page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]:
        for line in block.get("lines", []):
            for candidate in line["spans"]:
                if (candidate["font"] == span["font"] and abs(candidate["size"] - span["size"]) < .02
                    and abs(candidate["bbox"][1] - span["bbox"][1]) < .03
                    and abs(candidate["bbox"][3] - span["bbox"][3]) < .03
                    and candidate["bbox"][0] >= span["bbox"][0] - .05
                    and candidate["bbox"][0] <= span["bbox"][2] + .05):
                    return candidate["origin"][1]
    raise ValueError(f"No source baseline for {span['font']} {span['bbox']}")


def mask_box(target: dict, drawings: list[dict]) -> fitz.Rect:
    pad = max(.4, max((drawings[i].get("width") or 0) / 2 + .3 for i in target["drawingIndices"]))
    r = fitz.Rect(target["bbox"]) + (-pad, -pad, pad, pad)
    return fitz.Rect(math.floor(r.x0 * 4) / 4, math.floor(r.y0 * 4) / 4,
                     math.ceil(r.x1 * 4) / 4, math.ceil(r.y1 * 4) / 4)


def render_symbol(entry: dict, width_pt: float, height_pt: float, pad_pt: float = .75) -> Image.Image:
    view = entry["render"]["viewBox"]
    width=width_pt+2*pad_pt; height=height_pt+2*pad_pt
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=str(round(width*4)), height=str(round(height*4)),
                      viewBox=f"0 0 {width} {height}")
    # The app's SVG uses overflow:visible. Give the comparison raster a pad so
    # the die's outer white stroke is not clipped at the SVG viewBox boundary.
    group = ET.SubElement(root, "g", transform=f"translate({pad_pt} {pad_pt}) scale({width_pt/view[2]} {height_pt/view[3]})")
    names = {"strokeWidth":"stroke-width", "fillRule":"fill-rule", "strokeLinecap":"stroke-linecap", "strokeLinejoin":"stroke-linejoin"}
    for path in entry["render"]["paths"]:
        ET.SubElement(group, "path", {names.get(key,key):str(value) for key,value in path.items()})
    doc = fitz.open("svg", ET.tostring(root, encoding="utf-8"))
    pix = doc[0].get_pixmap(alpha=True)
    return Image.frombytes("RGBA", (pix.width,pix.height), pix.samples)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    die = next((entry for entry in registry if entry["id"] == "dice.black"), None)
    if die is None:
        raise ValueError("The existing source-PDF dice.black definition is required")
    if any(item.get("symbolId") == "dice.black" and item.get("anchor", {}).get("lineId") in
           {target["lineId"] for target in TARGETS} for item in sidecar["elements"]):
        raise ValueError("A target line already has a dice.black source adapter; inspect before reapplying")

    with fitz.open(PDF) as source, fitz.open(PDF) as mask_doc:
        source_page = source[77]
        mask_page = mask_doc[77]
        drawings = source_page.get_drawings()
        for target in TARGETS:
            block = dom["blocks"][target["blockIndex"]]
            if block["id"] != target["blockId"]:
                raise ValueError(f"DOM block moved: {target['blockId']}")
            line = next((line for line in block["lines"] if line["id"] == target["lineId"]), None)
            if line is None or target["spanIndex"] >= len(line["spans"]):
                raise ValueError(f"DOM anchor moved: {target['lineId']}:{target['spanIndex']}")
            span = line["spans"][target["spanIndex"]]
            expected = " " if target["lineId"] != "line_22_21" else "BLACK "
            if span["text"] != expected or abs(span["size"] - 9) > .02:
                raise ValueError(f"Unexpected source text at {target['lineId']}: {span['text']!r} {span['size']}")
            for index in target["drawingIndices"]:
                if not (fitz.Rect(target["bbox"]) + (-.02,-.02,.02,.02)).contains(drawings[index]["rect"]):
                    raise ValueError(f"Source drawing changed at index {index}")
            baseline = source_baseline(source_page, span)
            target["metrics"] = dict(widthEm=(target["bbox"][2]-target["bbox"][0])/span["size"],
                                     heightEm=(target["bbox"][3]-target["bbox"][1])/span["size"],
                                     verticalAlignEm=(target["bbox"][3]-baseline)/span["size"])
            target["anchor"] = dict(blockId=target["blockId"],blockIndex=target["blockIndex"],
                                     lineId=target["lineId"],spanIndex=target["spanIndex"],side="after",sizePt=span["size"])
            target["maskBox"] = mask_box(target, drawings)

        # Match the established adapter pipeline: remove text from the patch,
        # then erase each reviewed vector component using its actual paint bounds.
        for text_block in mask_page.get_text("blocks"):
            if text_block[4].strip():
                mask_page.add_redact_annot(fitz.Rect(text_block[:4]), fill=None)
        mask_page.apply_redactions(images=0, graphics=0, text=0)
        paint_bounds = source_page.get_bboxlog()
        for target in TARGETS:
            removal = fitz.Rect(target["bbox"])
            for index in target["drawingIndices"]:
                drawing = drawings[index]
                seq = drawing["seqno"]
                removal |= fitz.Rect(paint_bounds[seq][1])
                if drawing["type"] == "fs" and seq + 1 < len(paint_bounds) and paint_bounds[seq + 1][0] == "stroke-path":
                    removal |= fitz.Rect(paint_bounds[seq + 1][1])
            mask_page.add_redact_annot(removal + (-.3,-.3,.3,.3), fill=None)
            mask_page.apply_redactions(images=0, graphics=1, text=1)

        for target in TARGETS:
            for index in target["drawingIndices"]:
                rect = tuple(round(v, 2) for v in drawings[index]["rect"])
                if any(tuple(round(v, 2) for v in remaining["rect"]) == rect for remaining in mask_page.get_drawings()):
                    raise ValueError(f"Vector path remains after erasure: drawing {index}")

        full = mask_page.get_pixmap(matrix=fitz.Matrix(4,4), alpha=False)
        image = Image.frombytes("RGB", (full.width,full.height), full.samples)
        existing_names = {e.get("mask", {}).get("url", "").rsplit("/",1)[-1] for e in sidecar["elements"]}
        next_index = max([int(name.removeprefix("inline-element-mask-").removesuffix(".png"))
                          for name in existing_names if name.startswith("inline-element-mask-") and name.endswith(".png")] + [-1]) + 1
        placements=[]
        for offset, target in enumerate(TARGETS):
            box=target["maskBox"]
            filename=f"inline-element-mask-{next_index+offset:03d}.png"
            target["mask"]={"url":f"/pages/page_078/{filename}","bbox":list(box)}
            target["symbolId"]="dice.black"
            crop=image.crop(tuple(round(v*4) for v in box))
            placements.append((target,crop,filename))

        # Visual evidence: source PDF crop, clean erasure patch, and the
        # existing registry die rendered at the exact source occurrence size.
        rows=[]
        comparisons=[]
        source_pix=[source_page.get_pixmap(matrix=fitz.Matrix(4,4),clip=target["maskBox"],alpha=False) for target in TARGETS]
        for (target,patch,_),pix in zip(placements,source_pix):
            original=Image.frombytes("RGB",(pix.width,pix.height),pix.samples)
            rendered_patch=patch.copy()
            bbox=fitz.Rect(target["bbox"]); box=target["maskBox"]
            pad_pt=.75
            svg=render_symbol(die,bbox.width,bbox.height,pad_pt)
            rendered_patch.paste(svg,(round((bbox.x0-box.x0-pad_pt)*4),round((bbox.y0-box.y0-pad_pt)*4)),svg)
            source_diff=ImageChops.difference(original,patch).convert("L")
            symbol_diff=ImageChops.difference(rendered_patch,patch).convert("L")
            source_mask=source_diff.point(lambda pixel:255 if pixel>24 else 0)
            symbol_mask=symbol_diff.point(lambda pixel:255 if pixel>24 else 0)
            source_bounds=source_mask.getbbox(); symbol_bounds=symbol_mask.getbbox()
            source_pixels=set((x,y) for y in range(source_mask.height) for x in range(source_mask.width) if source_mask.getpixel((x,y)))
            symbol_pixels=set((x,y) for y in range(symbol_mask.height) for x in range(symbol_mask.width) if symbol_mask.getpixel((x,y)))
            union=source_pixels | symbol_pixels
            comparisons.append(dict(sourcePaintBounds=source_bounds,registryPaintBounds=symbol_bounds,
                threshold24IoU=round(len(source_pixels & symbol_pixels)/len(union),4) if union else 1.0))
            scale=3
            row=Image.new("RGB",(max(original.width,patch.width)*scale*3+50, max(original.height,patch.height)*scale+34),"#f4f0e8")
            draw=ImageDraw.Draw(row)
            draw.text((8,4),"PDF original",fill="#111111")
            draw.text((16+original.width*scale,4),"Máscara sem símbolo",fill="#111111")
            draw.text((24+(original.width+patch.width)*scale,4),"Máscara + registry dice.black",fill="#111111")
            row.paste(original.resize((original.width*scale,original.height*scale),Image.Resampling.NEAREST),(8,22))
            row.paste(patch.resize((patch.width*scale,patch.height*scale),Image.Resampling.NEAREST),(16+original.width*scale,22))
            row.paste(rendered_patch.resize((rendered_patch.width*scale,rendered_patch.height*scale),Image.Resampling.NEAREST),(24+(original.width+patch.width)*scale,22))
            rows.append(row)
        comparison=Image.new("RGB",(max(row.width for row in rows),sum(row.height for row in rows)),"#f4f0e8")
        y=0
        for row in rows:
            comparison.paste(row,(0,y)); y+=row.height

    if args.apply:
        EVIDENCE.mkdir(parents=True,exist_ok=True)
        comparison.save(EVIDENCE/"page78-black-dice-source-patch-registry.png")
        for target,crop,filename in placements:
            crop.save(PAGE/filename)
        sidecar["elements"].extend({key:value for key,value in target.items() if key!="maskBox"} for target,_,_ in placements)
        SIDECAR_PATH.write_text(json.dumps(sidecar,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    else:
        preview=ROOT/"tmp/page78-black-dice-dry-run.png"
        preview.parent.mkdir(parents=True,exist_ok=True)
        comparison.save(preview)
    print(json.dumps({"mode":"apply" if args.apply else "dry-run","count":len(TARGETS),
        "anchors":[{k:t[k] for k in ("symbolId","bbox","anchor","metrics","mask")} for t,_,_ in placements],
        "rasterComparison":comparisons,
        "output":str(EVIDENCE/"page78-black-dice-source-patch-registry.png") if args.apply else "tmp/page78-black-dice-dry-run.png"},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
