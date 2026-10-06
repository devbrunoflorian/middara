"""Adapt the two editable p78 hand icons, preserving their overlap with 1/2.

Dry-run by default. The source PDF and extracted DOM are read-only; --apply
writes only p.78 inline metadata and its two conditional erasure masks.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_078"
DOM_PATH = PAGE / "page_078_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
AUDIT_PATH = ROOT / "docs/project-progress/evidence/2026-10-04-inline-elements/inventory.json"
EVIDENCE = ROOT / "docs/project-progress/evidence/2026-10-05-inline-elements-followup"

sys.path.insert(0, str(ROOT / "scripts"))
from build_inline_symbol_registry import complete_component, same_component  # noqa: E402

PROTOTYPE = {
    "bbox": [520.7333984375, 193.50100708007812, 534.7404174804688, 207.50900268554688],
    "drawingIndices": [129, 130],
}
TARGETS = [
    dict(bbox=[304.728912353516, 139.369522094727, 318.646911621094, 152.269515991211],
         drawingIndices=[185, 186], blockIndex=12, blockId="block_25", lineId="line_25_2", spanIndex=2,
         expectedText=" Ability may equip ", followingLineId="line_25_3", followingText="2"),
    dict(bbox=[336.199279785156, 151.369522094727, 350.118286132812, 164.269515991211],
         drawingIndices=[193, 194], blockIndex=12, blockId="block_25", lineId="line_25_5", spanIndex=0,
         expectedText=" (Melee/Ranged) Weapons as if they were ", followingLineId="line_25_6", followingText="1"),
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


def symbol_pixels(entry: dict, width_pt: float, height_pt: float, pad_pt: float = .75) -> Image.Image:
    view = entry["render"]["viewBox"]
    width, height = width_pt + 2 * pad_pt, height_pt + 2 * pad_pt
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=str(round(width * 4)),
                      height=str(round(height * 4)), viewBox=f"0 0 {width} {height}")
    group = ET.SubElement(root, "g", transform=f"translate({pad_pt} {pad_pt}) scale({width_pt/view[2]} {height_pt/view[3]})")
    names = {"strokeWidth": "stroke-width", "fillRule": "fill-rule", "strokeLinecap": "stroke-linecap", "strokeLinejoin": "stroke-linejoin"}
    for path in entry["render"]["paths"]:
        ET.SubElement(group, "path", {names.get(key, key): str(value) for key, value in path.items()})
    doc = fitz.open("svg", ET.tostring(root, encoding="utf-8"))
    pix = doc[0].get_pixmap(alpha=True)
    return Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)


def all_exact_family_matches(source: fitz.Document, audit: dict) -> list[dict]:
    prototype_page = source[27]
    matches = []
    for group in audit["inlineVectorCandidates"]:
        for occurrence in group["occurrences"]:
            page = source[occurrence["page"] - 1]
            component = complete_component(page, occurrence)
            if same_component(page, component, prototype_page, PROTOTYPE):
                matches.append({**component, "page": occurrence["page"], "matches": occurrence.get("matches", [])})
    return matches


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    symbol = next((entry for entry in registry if entry["id"] == "weapon.hand"), None)
    if symbol is None:
        raise ValueError("The existing weapon.hand registry entry is required")

    with fitz.open(PDF) as source, fitz.open(PDF) as mask_doc:
        family = all_exact_family_matches(source, audit)
        counts = Counter(item["page"] for item in family)
        if len(family) != 6 or counts != Counter({28: 1, 48: 1, 49: 1, 55: 1, 78: 2}):
            raise ValueError(f"Hand family structure changed: {dict(counts)} / {len(family)} matches")
        p78 = [item for item in family if item["page"] == 78]
        if {tuple(item["drawingIndices"]) for item in p78} != {tuple(t["drawingIndices"]) for t in TARGETS}:
            raise ValueError("The reviewed p78 hand objects no longer match the two planned targets")

        source_page, mask_page = source[77], mask_doc[77]
        drawings = source_page.get_drawings()
        block = dom["blocks"][12]
        if block["id"] != "block_25":
            raise ValueError("DOM block moved: block_25")
        existing_lines = {line["id"]: line for line in block["lines"]}
        occupied = {(e.get("anchor", {}).get("lineId"), e.get("anchor", {}).get("spanIndex"), e.get("anchor", {}).get("side"))
                    for e in sidecar["elements"]}
        if any((target["lineId"], target["spanIndex"], "after") in occupied for target in TARGETS):
            raise ValueError("A target anchor already has a source adapter; inspect before reapplying")

        for target in TARGETS:
            line = existing_lines.get(target["lineId"])
            following = existing_lines.get(target["followingLineId"])
            if line is None or target["spanIndex"] >= len(line["spans"]):
                raise ValueError(f"DOM anchor moved: {target['lineId']}:{target['spanIndex']}")
            owner = line["spans"][target["spanIndex"]]
            if owner["text"] != target["expectedText"] or abs(owner["size"] - 10) > .02:
                raise ValueError(f"Unexpected owner text: {target['lineId']} {owner['text']!r}")
            if following is None or following["spans"][0]["text"] != target["followingText"]:
                raise ValueError(f"Expected editable count moved: {target['followingLineId']}")
            number_span = following["spans"][0]
            target["trailingGapPt"] = number_span["bbox"][0] - target["bbox"][2]
            if not -4 < target["trailingGapPt"] < -1:
                raise ValueError(f"Unexpected hand/count overlap: {target['trailingGapPt']:.4f} pt")
            if abs(owner["bbox"][2] - target["bbox"][0]) > .02:
                raise ValueError(f"Owner span no longer ends at icon x: {target['lineId']}")
            for index in target["drawingIndices"]:
                if not (fitz.Rect(target["bbox"]) + (-.02, -.02, .02, .02)).contains(drawings[index]["rect"]):
                    raise ValueError(f"Source drawing changed at index {index}")

            baseline = source_baseline(source_page, owner)
            target["metrics"] = dict(widthEm=(target["bbox"][2] - target["bbox"][0]) / owner["size"],
                                     heightEm=(target["bbox"][3] - target["bbox"][1]) / owner["size"],
                                     verticalAlignEm=(target["bbox"][3] - baseline) / owner["size"])
            target["anchor"] = dict(blockId=target["blockId"], blockIndex=target["blockIndex"],
                                     lineId=target["lineId"], spanIndex=target["spanIndex"],
                                     side="after", sizePt=owner["size"], trailingGapPt=target["trailingGapPt"])
            target["maskBox"] = mask_box(target, drawings)

        # Remove source text from the patch first so the adjacent 1/2 remain
        # editable PDF text rather than becoming a raster ghost in the mask.
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
            mask_page.add_redact_annot(removal + (-.3, -.3, .3, .3), fill=None)
            mask_page.apply_redactions(images=0, graphics=1, text=1)

        for target in TARGETS:
            for index in target["drawingIndices"]:
                rect = tuple(round(v, 2) for v in drawings[index]["rect"])
                if any(tuple(round(v, 2) for v in remaining["rect"]) == rect for remaining in mask_page.get_drawings()):
                    raise ValueError(f"Vector path remains after erasure: drawing {index}")

        full = mask_page.get_pixmap(matrix=fitz.Matrix(4, 4), alpha=False)
        clean_page = Image.frombytes("RGB", (full.width, full.height), full.samples)
        original_pix = source_page.get_pixmap(matrix=fitz.Matrix(4, 4), alpha=False)
        original_page = Image.frombytes("RGB", (original_pix.width, original_pix.height), original_pix.samples)
        existing_names = {e.get("mask", {}).get("url", "").rsplit("/", 1)[-1] for e in sidecar["elements"]}
        next_index = max([int(name.removeprefix("inline-element-mask-").removesuffix(".png"))
                          for name in existing_names if name.startswith("inline-element-mask-") and name.endswith(".png")] + [-1]) + 1
        placements = []
        for offset, target in enumerate(TARGETS):
            box = target["maskBox"]
            filename = f"inline-element-mask-{next_index + offset:03d}.png"
            target["mask"] = {"url": f"/pages/page_078/{filename}", "bbox": list(box)}
            target["symbolId"] = "weapon.hand"
            crop_box = tuple(round(value * 4) for value in box)
            patch = clean_page.crop(crop_box)
            source_crop = original_page.crop(crop_box)
            with_symbol = patch.copy()
            icon = symbol_pixels(symbol, fitz.Rect(target["bbox"]).width, fitz.Rect(target["bbox"]).height)
            local_x = round((target["bbox"][0] - box.x0 - .75) * 4)
            local_y = round((target["bbox"][1] - box.y0 - .75) * 4)
            with_symbol.paste(icon, (local_x, local_y), icon)
            placements.append((target, patch, source_crop, with_symbol, filename))

    if args.apply:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        rows = []
        for target, patch, source_crop, with_symbol, filename in placements:
            patch.save(PAGE / filename)
            scale = 3
            row = Image.new("RGB", (source_crop.width * scale * 3 + 50, source_crop.height * scale + 34), "#f4f0e8")
            draw = ImageDraw.Draw(row)
            draw.text((8, 4), "PDF original", fill="#111111")
            draw.text((16 + source_crop.width * scale, 4), "Patch without vector/text", fill="#111111")
            draw.text((24 + source_crop.width * scale * 2, 4), "Patch + registry hand", fill="#111111")
            row.paste(source_crop.resize((source_crop.width * scale, source_crop.height * scale), Image.Resampling.NEAREST), (8, 22))
            row.paste(patch.resize((patch.width * scale, patch.height * scale), Image.Resampling.NEAREST), (16 + source_crop.width * scale, 22))
            row.paste(with_symbol.resize((with_symbol.width * scale, with_symbol.height * scale), Image.Resampling.NEAREST), (24 + source_crop.width * scale * 2, 22))
            rows.append(row)
        comparison = Image.new("RGB", (max(row.width for row in rows), sum(row.height for row in rows)), "#f4f0e8")
        y = 0
        for row in rows:
            comparison.paste(row, (0, y)); y += row.height
        comparison.save(EVIDENCE / "page78-hand-source-patch-registry.png")
        sidecar["elements"].extend({key: value for key, value in target.items() if key not in {"maskBox", "trailingGapPt"}}
                                   for target, *_ in placements)
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        output = EVIDENCE / "page78-hand-source-patch-registry.png"
    else:
        preview = ROOT / "tmp/page78-hand-dry-run.png"
        preview.parent.mkdir(parents=True, exist_ok=True)
        rows = []
        for target, patch, source_crop, with_symbol, _ in placements:
            scale = 3
            row = Image.new("RGB", (source_crop.width * scale * 3 + 50, source_crop.height * scale + 34), "#f4f0e8")
            draw = ImageDraw.Draw(row)
            draw.text((8, 4), "PDF original", fill="#111111")
            draw.text((16 + source_crop.width * scale, 4), "Patch without vector/text", fill="#111111")
            draw.text((24 + source_crop.width * scale * 2, 4), "Patch + registry hand", fill="#111111")
            row.paste(source_crop.resize((source_crop.width * scale, source_crop.height * scale), Image.Resampling.NEAREST), (8, 22))
            row.paste(patch.resize((patch.width * scale, patch.height * scale), Image.Resampling.NEAREST), (16 + source_crop.width * scale, 22))
            row.paste(with_symbol.resize((with_symbol.width * scale, with_symbol.height * scale), Image.Resampling.NEAREST), (24 + source_crop.width * scale * 2, 22))
            rows.append(row)
        comparison = Image.new("RGB", (max(row.width for row in rows), sum(row.height for row in rows)), "#f4f0e8")
        y = 0
        for row in rows:
            comparison.paste(row, (0, y)); y += row.height
        comparison.save(preview)
        output = preview

    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "pattern": "weapon.hand: dark circular field + white hand; full normalized paths and paint compared",
        "familyMatches": len(family), "matchesByPage": dict(sorted(counts.items())),
        "placements": [{k: t[k] for k in ("symbolId", "bbox", "anchor", "metrics", "mask")} for t, *_ in placements],
        "manualReview": {"p28_p48_p49": "printed weapon-card artwork; excluded", "p55": "candidate path is not a visible hand in the rendered PDF; excluded"},
        "output": str(output),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
