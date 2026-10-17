"""Attach eight source-confirmed inline symbols omitted from p.52 placements.

The PDF and page DOM are read-only. Dry-run is the default; --apply writes only
p.52's inline-element placements and the eight local erasure patches.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_052"
DOM_PATH = PAGE / "page_052_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"

# Each vector was matched to the rendered p.52 source glyph and its adjacent
# extracted text. The two square result marks near "rolled" and "spent" are
# deliberately excluded: their semantic IDs are not established in registry.
TARGETS = [
    dict(symbolId="dice.black", bbox=[298.40,165.15,308.47,176.77], drawingIndices=[104],
         blockId="block_15", blockIndex=2, lineId="line_15_0", spanIndex=4, side="after",
         ownerSpanRef={"lineId":"line_15_0","spanIndex":3}, expected=" "),
    dict(symbolId="combat.shield", bbox=[353.04,166.09,362.39,176.09], drawingIndices=[108],
         blockId="block_15", blockIndex=2, lineId="line_15_2", spanIndex=0, side="before",
         ownerSpanRef={"lineId":"line_15_2","spanIndex":0}, expected=" rolled, "),
    dict(symbolId="combat.skull", bbox=[264.34,175.54,272.67,184.59], drawingIndices=[111],
         blockId="block_15", blockIndex=2, lineId="line_15_4", spanIndex=1, side="before",
         ownerSpanRef={"lineId":"line_15_4","spanIndex":1}, expected="is rolled, no additional "),
    dict(symbolId="combat.skull", bbox=[206.48,246.88,214.81,255.93], drawingIndices=[113],
         blockId="block_17", blockIndex=4, lineId="line_17_3", spanIndex=1, side="before",
         ownerSpanRef={"lineId":"line_17_3","spanIndex":1}, expected="is rolled, these Abilities provide no bonus."),
    dict(symbolId="dice.black", bbox=[146.15,398.62,156.22,410.25], drawingIndices=[126],
         blockId="block_20", blockIndex=6, lineId="line_20_11", spanIndex=2, side="after",
         ownerSpanRef={"lineId":"line_20_11","spanIndex":1}, expected=" "),
    dict(symbolId="combat.skull", bbox=[253.69,423.69,262.03,432.74], drawingIndices=[132],
         blockId="block_20", blockIndex=6, lineId="line_20_16", spanIndex=1, side="before",
         ownerSpanRef={"lineId":"line_20_16","spanIndex":1}, expected="Symbol does when rolled. "),
    dict(symbolId="combat.skull", bbox=[149.87,441.03,158.21,450.08], drawingIndices=[134],
         blockId="block_21", blockIndex=7, lineId="line_21_1", spanIndex=1, side="before",
         ownerSpanRef={"lineId":"line_21_1","spanIndex":1}, expected="is rolled during an Attack, the Attack misses, regardless "),
    dict(symbolId="combat.skull", bbox=[142.78,470.37,151.12,479.42], drawingIndices=[136],
         blockId="block_22", blockIndex=8, lineId="line_22_1", spanIndex=1, side="before",
         ownerSpanRef={"lineId":"line_22_1","spanIndex":1}, expected="is rolled during a Spell, the Spell fails to affect the target "),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true")
    modes.add_argument("--verify-existing", action="store_true",
                       help="regenerate each mask in memory and verify the existing sidecar/assets without writing")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    existing = {(e.get("symbolId"), e.get("anchor", {}).get("lineId")) for e in sidecar["elements"]}
    if not args.verify_existing and any((t["symbolId"], t["lineId"]) in existing for t in TARGETS):
        raise ValueError("At least one target line already has its semantic adapter; inspect before retrying")

    page_dir = PAGE
    with fitz.open(PDF) as source, fitz.open(PDF) as mask_doc:
        source_page, mask_page = source[51], mask_doc[51]
        drawings = source_page.get_drawings()
        paint_bounds = source_page.get_bboxlog()
        for target in TARGETS:
            block = dom["blocks"][target["blockIndex"]]
            if block["id"] != target["blockId"]:
                raise ValueError(f"DOM block moved: {target['blockId']}")
            line = next((line for line in block["lines"] if line["id"] == target["lineId"]), None)
            if line is None or target["spanIndex"] >= len(line["spans"]):
                raise ValueError(f"DOM anchor moved: {target['lineId']}:{target['spanIndex']}")
            span = line["spans"][target["spanIndex"]]
            if target["expected"] not in span["text"]:
                raise ValueError(f"Source text changed at {target['lineId']}: {span['text']!r}")
            target_rect = fitz.Rect(target["bbox"])
            for index in target["drawingIndices"]:
                if index >= len(drawings) or not (target_rect + (-.03,-.03,.03,.03)).contains(drawings[index]["rect"]):
                    raise ValueError(f"Source vector changed at drawing {index}")
            baseline = span.get("origin", [0, span["bbox"][3]])[1]
            width, height = target_rect.width, target_rect.height
            target["metrics"] = dict(widthEm=width / span["size"], heightEm=height / span["size"],
                                     verticalAlignEm=(target_rect.y1 - baseline) / span["size"])
            target["anchor"] = dict(blockId=target["blockId"], blockIndex=target["blockIndex"],
                lineId=target["lineId"], spanIndex=target["spanIndex"], side=target["side"],
                sizePt=span["size"], ownerSpanRef=target["ownerSpanRef"])
            pad = max(.4, max((drawings[i].get("width") or 0) / 2 + .3 for i in target["drawingIndices"]))
            box = target_rect + (-pad,-pad,pad,pad)
            target["maskBox"] = fitz.Rect(math.floor(box.x0*4)/4, math.floor(box.y0*4)/4,
                                             math.ceil(box.x1*4)/4, math.ceil(box.y1*4)/4)

        # Remove only text from the working copy before erasing each reviewed
        # vector's exact paint bounds, following the established source patch flow.
        for text_block in mask_page.get_text("blocks"):
            if text_block[4].strip():
                mask_page.add_redact_annot(fitz.Rect(text_block[:4]), fill=None)
        mask_page.apply_redactions(images=0, graphics=0, text=0)
        for target in TARGETS:
            removal = fitz.Rect(target["bbox"])
            for index in target["drawingIndices"]:
                drawing = drawings[index]
                seq = drawing["seqno"]
                removal |= fitz.Rect(paint_bounds[seq][1])
                if drawing["type"] == "fs" and seq + 1 < len(paint_bounds) and paint_bounds[seq+1][0] == "stroke-path":
                    removal |= fitz.Rect(paint_bounds[seq+1][1])
            mask_page.add_redact_annot(removal + (-.3,-.3,.3,.3), fill=None)
            mask_page.apply_redactions(images=0, graphics=1, text=1)
        for target in TARGETS:
            for index in target["drawingIndices"]:
                rect = tuple(round(v,2) for v in drawings[index]["rect"])
                if any(tuple(round(v,2) for v in item["rect"]) == rect for item in mask_page.get_drawings()):
                    raise ValueError(f"Source vector remains after patching drawing {index}")

        full = mask_page.get_pixmap(matrix=fitz.Matrix(4,4), alpha=False)
        cleaned = Image.frombytes("RGB", (full.width, full.height), full.samples)
        names = {Path(e.get("mask", {}).get("url", "")).name for e in sidecar["elements"]}
        next_index = max([int(name.removeprefix("inline-element-mask-").removesuffix(".png"))
                          for name in names if name.startswith("inline-element-mask-") and name.endswith(".png")] + [-1]) + 1
        output = []
        for offset, target in enumerate(TARGETS):
            if args.verify_existing:
                matches = [entry for entry in sidecar["elements"]
                           if entry.get("symbolId") == target["symbolId"]
                           and entry.get("lineId") == target["lineId"]
                           and entry.get("drawingIndices") == target["drawingIndices"]]
                if len(matches) != 1:
                    raise ValueError(f"Expected one existing sidecar target for {target['lineId']}")
                filename = Path(matches[0].get("mask", {}).get("url", "")).name
                if not filename:
                    raise ValueError(f"Existing target has no mask asset path: {target['lineId']}")
            else:
                filename = f"inline-element-mask-{next_index+offset:03d}.png"
            box = target["maskBox"]
            target["mask"] = dict(url=f"/pages/page_052/{filename}", bbox=list(box))
            crop = cleaned.crop(tuple(round(v*4) for v in box))
            output.append((target, filename, crop))

    if args.verify_existing:
        verified = []
        for target, filename, crop in output:
            expected_entry = {k: v for k, v in target.items() if k != "maskBox"}
            matches = [entry for entry in sidecar["elements"]
                       if entry.get("symbolId") == target["symbolId"]
                       and entry.get("lineId") == target["lineId"]
                       and entry.get("drawingIndices") == target["drawingIndices"]]
            if len(matches) != 1 or matches[0] != expected_entry:
                raise ValueError(f"Existing sidecar does not exactly match source-derived target {filename}")
            mask_path = page_dir / filename
            if not mask_path.is_file():
                raise FileNotFoundError(mask_path)
            with Image.open(mask_path) as existing_mask:
                existing_pixels = existing_mask.convert("RGB")
            if existing_pixels.size != crop.size or ImageChops.difference(existing_pixels, crop).getbbox() is not None:
                raise ValueError(f"Existing mask pixels differ from regenerated source crop: {filename}")
            verified.append({
                "symbolId": target["symbolId"],
                "lineId": target["lineId"],
                "drawingIndices": target["drawingIndices"],
                "mask": filename,
                "maskSha256": hashlib.sha256(mask_path.read_bytes()).hexdigest(),
                "pixelIdenticalToRegeneratedCrop": True,
                "size": list(existing_pixels.size),
            })
        print(json.dumps({
            "mode": "verify-existing",
            "status": "passed",
            "sourcePdfSha256": hashlib.sha256(PDF.read_bytes()).hexdigest(),
            "domSha256": hashlib.sha256(DOM_PATH.read_bytes()).hexdigest(),
            "sidecarSha256": hashlib.sha256(SIDECAR_PATH.read_bytes()).hexdigest(),
            "verifiedCount": len(verified),
            "targets": verified,
        }, ensure_ascii=False, indent=2))
        return

    if args.apply:
        for target, filename, crop in output:
            crop.save(page_dir / filename)
            sidecar["elements"].append({k:v for k,v in target.items() if k != "maskBox"})
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"mode":"apply" if args.apply else "dry-run", "count":len(output),
        "symbols":[{k:t[k] for k in ("symbolId","bbox","anchor","metrics","mask")} for t,_,_ in output]},
        ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
