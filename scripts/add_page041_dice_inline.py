"""Add source-confirmed dice and combat glyphs as editable inline objects on p.41.

Dry-run by default. The source PDF and page DOM are read-only; --apply writes
only p.41 inline metadata/mask crops and the comparison evidence image.
"""
from __future__ import annotations

import argparse
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_041"
DOM_PATH = PAGE / "page_041_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
EVIDENCE = ROOT / "docs/project-progress/evidence/2026-10-05-inline-elements-followup"

# Drawing groups and DOM anchors were read from the same source PDF. The final
# Dodge die is painted on the next visual line before its comma; lineStartX
# preserves both that die's source position and the following text's x.
TARGETS = [
    dict(symbolId="dice.purple", bbox=[247.917,251.463,257.831,262.944], drawingIndices=[115,116,117,118],
         blockIndex=4, blockId="block_24", lineId="line_24_1", spanIndex=1, side="after", expectedSpan="PURPLE", gapPt=3.4114),
    dict(symbolId="dice.purple", bbox=[353.161,262.463,363.074,273.944], drawingIndices=[119,120,121,122],
         blockIndex=4, blockId="block_24", lineId="line_24_3", spanIndex=3, side="after", expectedSpan="PURPLE", gapPt=3.4115),
    dict(symbolId="dice.black", bbox=[360.512,396.068,370.582,407.692], drawingIndices=[123,124,125,126],
         blockIndex=7, blockId="block_27", lineId="line_27_2", spanIndex=5, side="after", expectedSpan="BLACK", gapPt=2.7857),
    dict(symbolId="dice.black", bbox=[319.672,457.076,329.742,468.7], drawingIndices=[127,128,129,130],
         blockIndex=9, blockId="block_29", lineId="line_29_1", spanIndex=3, side="after", expectedSpan="BLACK", gapPt=2.7855),
    dict(symbolId="dice.black", bbox=[385.582,479.076,395.652,490.7], drawingIndices=[131,132,133,134],
         blockIndex=9, blockId="block_29", lineId="line_29_4", spanIndex=1, side="after", expectedSpan="BLACK", gapPt=2.7857),
    dict(symbolId="dice.black", bbox=[112.239,584.084,122.309,595.708], drawingIndices=[135,136,137,138],
         blockIndex=10, blockId="block_30", lineId="line_30_5", spanIndex=0, side="before", expectedSpan=" , ",
         lineStartX=112.239, ownerSpanRef=dict(lineId="line_30_4",spanIndex=5)),
    dict(symbolId="combat.shield", bbox=[183.870,585.022,193.224,595.026], drawingIndices=[139,140,141],
         blockIndex=10, blockId="block_30", lineId="line_30_6", spanIndex=0, side="before", expectedSpan=" rolled, adds ",
         ownerSpanRef=dict(lineId="line_30_5",spanIndex=3)),
    dict(symbolId="combat.skull", bbox=[361.388,583.480,369.724,595.034], drawingIndices=[142,143],
         blockIndex=10, blockId="block_30", lineId="line_30_6", spanIndex=3, side="after",
         expectedSpan=" to their Defense. If the ", ownerSpanRef=dict(lineId="line_30_6",spanIndex=3)),
    dict(symbolId="combat.skull", bbox=[135.945,619.315,144.281,630.868], drawingIndices=[144,145],
         blockIndex=10, blockId="block_30", lineId="line_30_10", spanIndex=0, side="after", expectedSpan="if the ",
         ownerSpanRef=dict(lineId="line_30_10",spanIndex=0)),
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
    rect = fitz.Rect(target["bbox"]) + (-pad, -pad, pad, pad)
    return fitz.Rect(math.floor(rect.x0 * 4) / 4, math.floor(rect.y0 * 4) / 4,
                     math.ceil(rect.x1 * 4) / 4, math.ceil(rect.y1 * 4) / 4)


def render_symbol(entry: dict, width_pt: float, height_pt: float, pad_pt: float = .75) -> Image.Image:
    view = entry["render"]["viewBox"]
    width, height = width_pt + 2 * pad_pt, height_pt + 2 * pad_pt
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=str(round(width * 4)),
                      height=str(round(height * 4)), viewBox=f"0 0 {width} {height}")
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
    symbols = {entry["id"]:entry for entry in registry}
    target_boxes={tuple(round(value,2) for value in target["bbox"]) for target in TARGETS}
    sidecar["elements"]=[item for item in sidecar["elements"] if not (
        item.get("symbolId") in {"dice.black","dice.purple"} and
        tuple(round(value,2) for value in item.get("bbox",[])) in target_boxes)]

    with fitz.open(PDF) as source, fitz.open(PDF) as mask_doc:
        source_page, mask_page = source[40], mask_doc[40]
        drawings = source_page.get_drawings()
        for target in TARGETS:
            block = dom["blocks"][target["blockIndex"]]
            if block["id"] != target["blockId"]:
                raise ValueError(f"DOM block moved: {target['blockId']}")
            line = next((line for line in block["lines"] if line["id"] == target["lineId"]), None)
            if line is None or target["spanIndex"] >= len(line["spans"]):
                raise ValueError(f"DOM anchor moved: {target['lineId']}:{target['spanIndex']}")
            span = line["spans"][target["spanIndex"]]
            if span["text"] != target["expectedSpan"] or span["size"] < 8 or span["size"] > 10:
                raise ValueError(f"Unexpected source anchor at {target['lineId']}: {span['text']!r} {span['size']}")
            for index in target["drawingIndices"]:
                if not (fitz.Rect(target["bbox"]) + (-.02,-.02,.02,.02)).contains(drawings[index]["rect"]):
                    raise ValueError(f"Source drawing changed at index {index}")
            baseline = source_baseline(source_page, span)
            target["metrics"] = dict(widthEm=(target["bbox"][2]-target["bbox"][0])/span["size"],
                                     heightEm=(target["bbox"][3]-target["bbox"][1])/span["size"],
                                     verticalAlignEm=(target["bbox"][3]-baseline)/span["size"])
            target["anchor"] = dict(blockId=target["blockId"],blockIndex=target["blockIndex"],
                lineId=target["lineId"],spanIndex=target["spanIndex"],side=target["side"],sizePt=span["size"],
                **({"gapPt":target["gapPt"]} if "gapPt" in target else {}),
                **({"ownerSpanRef":target["ownerSpanRef"]} if "ownerSpanRef" in target else {}),
                **({"lineStartX":target["lineStartX"]} if "lineStartX" in target else {}))
            target["maskBox"] = mask_box(target, drawings)

        # Produce local source patches: remove extracted text first, then only
        # the reviewed dice paths. Everything outside each crop remains source PDF.
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
                rect = tuple(round(v,2) for v in drawings[index]["rect"])
                if any(tuple(round(v,2) for v in remaining["rect"]) == rect for remaining in mask_page.get_drawings()):
                    raise ValueError(f"Vector path remains after erasure: drawing {index}")

        full = mask_page.get_pixmap(matrix=fitz.Matrix(4,4), alpha=False)
        image = Image.frombytes("RGB", (full.width,full.height), full.samples)
        names = {e.get("mask",{}).get("url","").rsplit("/",1)[-1] for e in sidecar["elements"]}
        next_index = max([int(name.removeprefix("inline-element-mask-").removesuffix(".png"))
                          for name in names if name.startswith("inline-element-mask-") and name.endswith(".png")] + [-1]) + 1
        placements=[]
        for offset,target in enumerate(TARGETS):
            filename=f"inline-element-mask-{next_index+offset:03d}.png"
            target["mask"]={"url":f"/pages/page_041/{filename}","bbox":list(target["maskBox"])}
            crop=image.crop(tuple(round(v*4) for v in target["maskBox"]))
            placements.append((target,crop,filename))

        rows=[]
        comparisons=[]
        source_crops=[source_page.get_pixmap(matrix=fitz.Matrix(4,4),clip=target["maskBox"],alpha=False) for target in TARGETS]
        for (target,patch,_),pix in zip(placements,source_crops):
            original=Image.frombytes("RGB",(pix.width,pix.height),pix.samples)
            rendered_patch=patch.copy()
            box=target["maskBox"]; bbox=fitz.Rect(target["bbox"]); pad_pt=.75
            rendered=render_symbol(symbols[target["symbolId"]],bbox.width,bbox.height,pad_pt)
            rendered_patch.paste(rendered,(round((bbox.x0-box.x0-pad_pt)*4),round((bbox.y0-box.y0-pad_pt)*4)),rendered)
            source_diff=ImageChops.difference(original,patch).convert("L").point(lambda value:255 if value>24 else 0)
            symbol_diff=ImageChops.difference(rendered_patch,patch).convert("L").point(lambda value:255 if value>24 else 0)
            source_pixels={(x,y) for y in range(source_diff.height) for x in range(source_diff.width) if source_diff.getpixel((x,y))}
            symbol_pixels={(x,y) for y in range(symbol_diff.height) for x in range(symbol_diff.width) if symbol_diff.getpixel((x,y))}
            union=source_pixels|symbol_pixels
            comparisons.append(dict(symbolId=target["symbolId"],bbox=target["bbox"],
                sourcePixels=len(source_pixels),registryPixels=len(symbol_pixels),
                threshold24IoU=round(len(source_pixels&symbol_pixels)/len(union),4) if union else 1.0))
            scale=3
            row=Image.new("RGB",(max(original.width,patch.width)*scale*3+50,max(original.height,patch.height)*scale+34),"#f4f0e8")
            draw=ImageDraw.Draw(row)
            draw.text((8,4),"PDF original",fill="#111111")
            draw.text((16+original.width*scale,4),"Patch sans dé",fill="#111111")
            draw.text((24+(original.width+patch.width)*scale,4),target["symbolId"],fill="#111111")
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
        comparison.save(EVIDENCE/"page41-dice-source-patch-registry.png")
        for target,crop,filename in placements:
            crop.save(PAGE/filename)
        sidecar["elements"].extend({key:value for key,value in target.items() if key!="maskBox"}
                                   for target,_,_ in placements)
        SIDECAR_PATH.write_text(json.dumps(sidecar,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    else:
        preview=ROOT/"tmp/page41-dice-dry-run.png"
        preview.parent.mkdir(parents=True,exist_ok=True)
        comparison.save(preview)
    print(json.dumps({"mode":"apply" if args.apply else "dry-run","count":len(TARGETS),
        "anchors":[{key:target[key] for key in ("symbolId","bbox","anchor","metrics","mask")} for target,_,_ in placements],
        "rasterComparison":comparisons,
        "output":str(EVIDENCE/"page41-dice-source-patch-registry.png") if args.apply else "tmp/page41-dice-dry-run.png"},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
