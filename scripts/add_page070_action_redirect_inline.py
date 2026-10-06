"""Attach editable action.redirect symbols to the three audited PDF vectors.

The default run is a read-only dry run of the p.70 textRange tracer.  Use
``--apply-tracer`` after reviewing its source/patch/registry comparison, then
``--apply-family`` to add the two structurally equivalent before-whitespace
anchors on p.70 and p.93. No translations or database rows are read or written.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import pymupdf as fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
EVIDENCE = ROOT / "docs/project-progress/evidence/2026-10-06-action-redirect"

TARGETS = [
    {
        "page": 70, "bbox": [294.5599365234375, 597.6905517578125, 301.0426025390625, 604.7592163085938],
        "drawingIndices": [190, 191, 192, 193], "blockId": "block_36", "lineId": "line_36_4",
        "side": "replace-text", "spanIndex": 1, "textRange": [32, 33],
        "expectedSpan": "from a Spell made against them,  ", "expectedStyle": ("OptimaLTStd", 8.0952787399292),
        "baselineText": "from a Spell made against them,  ", "baselineFont": "OptimaLTStd",
        "sizePt": 8.0952787399292, "color": "#231f20", "followingText": "REDIRECT",
        "gapAfterPt": 303.35369873046875 - 301.0426025390625,
        "maskPad": 0.55,
    },
    {
        "page": 70, "bbox": [239.22080993652344, 643.7495727539062, 245.40341186523438, 650.98828125],
        "drawingIndices": [209, 210, 211, 212], "blockId": "block_39", "lineId": "line_39_2",
        "side": "before", "spanIndex": 2, "expectedSpan": " ", "expectedStyle": ("OptimaLTStd", 10.0),
        "baselineText": "REDIRECT", "baselineFont": "OptimaLTStd-Bold",
        "sizePt": 10.0, "color": "#231f20", "maskPad": 0.55,
    },
    {
        "page": 93, "bbox": [415.5443115234375, 371.6910095214844, 423.2720031738281, 380.73870849609375],
        "drawingIndices": [123, 124, 125, 126], "blockId": "block_21", "lineId": "line_21_0",
        "side": "before", "spanIndex": 0, "expectedSpan": " ", "expectedStyle": ("OptimaLTStd", 8.0),
        "baselineText": "REDIRECT", "baselineFont": "OptimaLTStd-Bold",
        "sizePt": 10.0, "color": "#ffffff", "maskPad": 0.55,
    },
]


def find_block(dom: dict, block_id: str) -> tuple[int, dict]:
    for index, block in enumerate(dom["blocks"]):
        if block["id"] == block_id:
            return index, block
    raise ValueError(f"DOM block disappeared: {block_id}")


def find_baseline(page: fitz.Page, target: dict) -> float:
    data = page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)
    matches = []
    for block in data["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if (span["font"] == target["baselineFont"]
                    and span["text"] == target["baselineText"]
                    and abs(span["size"] - target["sizePt"]) < 0.02):
                    matches.append(span["origin"][1])
    if len(matches) != 1:
        raise ValueError(f"Expected one source baseline for {target['baselineText']!r}; found {len(matches)}")
    return matches[0]


def quarter_pt_box(bbox: list[float], pad: float) -> fitz.Rect:
    r = fitz.Rect(bbox) + (-pad, -pad, pad, pad)
    return fitz.Rect(math.floor(r.x0 * 4) / 4, math.floor(r.y0 * 4) / 4,
                     math.ceil(r.x1 * 4) / 4, math.ceil(r.y1 * 4) / 4)


def validate_target(target: dict, dom: dict, page: fitz.Page) -> tuple[int, dict, dict, float, dict]:
    block_index, block = find_block(dom, target["blockId"])
    line = next((line for line in block["lines"] if line["id"] == target["lineId"]), None)
    if line is None or target["spanIndex"] >= len(line["spans"]):
        raise ValueError(f"DOM anchor changed: {target['blockId']} / {target['lineId']} / {target['spanIndex']}")
    span = line["spans"][target["spanIndex"]]
    if span["text"] != target["expectedSpan"] or span["font"] != target["expectedStyle"][0] or abs(span["size"] - target["expectedStyle"][1]) > .02:
        raise ValueError(f"Unexpected owner span at {target['lineId']}: {span}")
    if target["side"] == "replace-text":
        start, end = target["textRange"]
        if span["text"][start:end] != " " or not span["text"].endswith("  "):
            raise ValueError("The p.70 tracer no longer has two trailing source spaces at [32,33]")
        if line["spans"][2]["text"] != target["followingText"]:
            raise ValueError("The p.70 tracer's following REDIRECT label moved")
    elif target["side"] == "before" and target["page"] == 70:
        if target["spanIndex"] != 2 or line["spans"][1]["text"] != " " or line["spans"][3]["text"] != "REDIRECT":
            raise ValueError("The second p.70 icon no longer lies between two whitespace spans and REDIRECT")
    elif target["page"] == 93:
        if span["text"] != " " or line["spans"][1]["text"] != "REDIRECT":
            raise ValueError("The p.93 icon no longer precedes the REDIRECT label through a whitespace anchor")

    drawings = page.get_drawings()
    if max(target["drawingIndices"]) >= len(drawings):
        raise ValueError(f"Drawing sequence changed on p.{target['page']}")
    actual = [drawings[index] for index in target["drawingIndices"]]
    union = fitz.Rect(actual[0]["rect"])
    for drawing in actual[1:]:
        union |= fitz.Rect(drawing["rect"])
    if any(abs(a - b) > .03 for a, b in zip(tuple(union), target["bbox"])):
        raise ValueError(f"Source path bounds moved on p.{target['page']}: {tuple(union)}")
    expected_ink = (0.0, 0.0, 0.0) if target["color"] == "#231f20" else (1.0, 1.0, 1.0)
    if len(actual) != 4 or any(d["type"] != "f" or d.get("fill") is None
                                or any(abs(a - b) > .002 for a, b in zip(d["fill"], expected_ink)) for d in actual):
        raise ValueError(f"Expected four matching monochrome filled paths on p.{target['page']}")
    baseline = find_baseline(page, target)
    return block_index, block, line, baseline, {"bbox": list(union), "drawings": actual}


def mask_box_for(target: dict) -> fitz.Rect:
    return quarter_pt_box(target["bbox"], target["maskPad"])


def render_registry_icon(entry: dict, width_pt: float, height_pt: float, ink: str, pad_pt: float = .6) -> Image.Image:
    view = entry["render"]["viewBox"]
    width, height = width_pt + 2 * pad_pt, height_pt + 2 * pad_pt
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=str(round(width * 4)),
                      height=str(round(height * 4)), viewBox=f"0 0 {width} {height}")
    group = ET.SubElement(root, "g", transform=f"translate({pad_pt} {pad_pt}) scale({width_pt/view[2]} {height_pt/view[3]})")
    names = {"strokeWidth": "stroke-width", "fillRule": "fill-rule", "strokeLinecap": "stroke-linecap", "strokeLinejoin": "stroke-linejoin"}
    for path in entry["render"]["paths"]:
        attributes = {names.get(key, key): str(value) for key, value in path.items()}
        if attributes.get("fill") == "currentColor":
            attributes["fill"] = ink
        ET.SubElement(group, "path", attributes)
    doc = fitz.open("svg", ET.tostring(root, encoding="utf-8"))
    pix = doc[0].get_pixmap(alpha=True)
    return Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)


def make_clean_patches(source: fitz.Document, targets: list[dict]) -> dict[tuple[int, int], Image.Image]:
    patches: dict[tuple[int, int], Image.Image] = {}
    page_numbers = sorted({target["page"] for target in targets})
    for page_no in page_numbers:
        source_page = source[page_no - 1]
        with fitz.open(PDF) as mask_doc:
            mask_page = mask_doc[page_no - 1]
            # The crop must show the printed paper/art under the original path,
            # with no source text baked into the editable-region patch.
            for text_block in mask_page.get_text("blocks"):
                if text_block[4].strip():
                    mask_page.add_redact_annot(fitz.Rect(text_block[:4]), fill=None)
            mask_page.apply_redactions(images=0, graphics=0, text=0)
            drawings = source_page.get_drawings()
            paint_bounds = source_page.get_bboxlog()
            for target_index, target in enumerate(targets):
                if target["page"] != page_no:
                    continue
                removal = fitz.Rect(target["bbox"])
                for drawing_index in target["drawingIndices"]:
                    drawing = drawings[drawing_index]
                    seq = drawing["seqno"]
                    removal |= fitz.Rect(paint_bounds[seq][1])
                    if drawing["type"] == "fs" and seq + 1 < len(paint_bounds) and paint_bounds[seq + 1][0] == "stroke-path":
                        removal |= fitz.Rect(paint_bounds[seq + 1][1])
                mask_page.add_redact_annot(removal + (-.3, -.3, .3, .3), fill=None)
            mask_page.apply_redactions(images=0, graphics=1, text=1)
            for target_index, target in enumerate(targets):
                if target["page"] != page_no:
                    continue
                mask = mask_box_for(target)
                pix = mask_page.get_pixmap(matrix=fitz.Matrix(4, 4), clip=mask, alpha=False)
                patch = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                expected = (round(mask.width * 4), round(mask.height * 4))
                if patch.size != expected:
                    raise ValueError(f"Patch resolution mismatch p.{page_no}: {patch.size} vs {expected}")
                patches[(page_no, target_index)] = patch
    return patches


def create_comparison(source: fitz.Document, targets: list[dict], patches: dict, symbol: dict) -> Image.Image:
    rows = []
    labels = ("PDF original", "source patch / icon removed", "patch + transparent registry SVG")
    for index, target in enumerate(targets):
        page = source[target["page"] - 1]
        box = mask_box_for(target)
        original_pix = page.get_pixmap(matrix=fitz.Matrix(4, 4), clip=box, alpha=False)
        original = Image.frombytes("RGB", (original_pix.width, original_pix.height), original_pix.samples)
        patch = patches[(target["page"], index)]
        icon = render_registry_icon(symbol, target["bbox"][2] - target["bbox"][0],
                                    target["bbox"][3] - target["bbox"][1], target["color"])
        # Registry viewBox coordinates are local to the icon crop; keep the
        # requested occurrence bounds independent of any box/background.
        with_symbol = patch.copy().convert("RGBA")
        left = round((target["bbox"][0] - box.x0 - .6) * 4)
        top = round((target["bbox"][1] - box.y0 - .6) * 4)
        with_symbol.alpha_composite(icon, (left, top))
        with_symbol = with_symbol.convert("RGB")
        scale = 4
        cell_w = max(original.width, patch.width, with_symbol.width) * scale + 16
        cell_h = max(original.height, patch.height, with_symbol.height) * scale + 42
        row = Image.new("RGB", (cell_w * 3, cell_h), "#eee9e2")
        draw = ImageDraw.Draw(row)
        for col, (label, image) in enumerate(zip(labels, (original, patch, with_symbol))):
            x = col * cell_w + 8
            draw.text((x, 5), f"p.{target['page']} · {label}", fill="#171717")
            row.paste(image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST), (x, 24))
        rows.append(row)
    sheet = Image.new("RGB", (max(row.width for row in rows), sum(row.height for row in rows)), "#eee9e2")
    y = 0
    for row in rows:
        sheet.paste(row, (0, y))
        y += row.height
    return sheet


def build_placement(target: dict, block_index: int, baseline: float) -> dict:
    x0, y0, x1, y1 = target["bbox"]
    size = target["sizePt"]
    anchor = {"blockId": target["blockId"], "blockIndex": block_index, "lineId": target["lineId"],
              "spanIndex": target["spanIndex"], "side": target["side"], "sizePt": size}
    if "textRange" in target:
        anchor["textRange"] = target["textRange"]
    metrics = {"widthEm": (x1 - x0) / size, "heightEm": (y1 - y0) / size,
               "verticalAlignEm": (y1 - baseline) / size}
    if "gapAfterPt" in target:
        metrics["trailingGapEm"] = target["gapAfterPt"] / size
    element = {"symbolId": "action.redirect", "bbox": target["bbox"], "drawingIndices": target["drawingIndices"],
               "anchor": anchor, "metrics": metrics, "color": target["color"]}
    mask = mask_box_for(target)
    element["mask"] = {"url": f"/pages/page_{target['page']:03d}/inline-element-mask-{{index:03d}}.png",
                       "bbox": list(mask)}
    return element


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply-tracer", action="store_true", help="write only the complex p.70 textRange tracer")
    group.add_argument("--apply-family", action="store_true", help="write the two additional before-whitespace equivalents")
    group.add_argument("--dry-run-family", action="store_true", help="validate and preview only the two remaining anchors")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    registry_path = ROOT / "apps/web/src/symbols/sourceSymbols.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    symbol = next((entry for entry in registry if entry["id"] == "action.redirect"), None)
    if symbol is None:
        raise ValueError("The existing action.redirect registry definition is required")
    if any(path.get("fill") != "currentColor" for path in symbol["render"].get("paths", [])):
        raise ValueError("action.redirect paths must keep transparent backgrounds and use the occurrence ink color")

    scope = "family" if args.apply_family or args.dry_run_family else "tracer"
    targets = TARGETS[:1] if scope == "tracer" else TARGETS[1:]
    validations = []
    with fitz.open(PDF) as source:
        for target in targets:
            page_no = target["page"]
            page_dir = ROOT / f"apps/web/public/pages/page_{page_no:03d}"
            dom = json.loads((page_dir / f"page_{page_no:03d}_dom.json").read_text(encoding="utf-8"))
            block_index, block, line, baseline, source_info = validate_target(target, dom, source[page_no - 1])
            sidecar_path = page_dir / "inline_elements.json"
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
            if any(e.get("symbolId") == "action.redirect" and e.get("drawingIndices") == target["drawingIndices"]
                   for e in sidecar.get("elements", [])):
                raise ValueError(f"p.{page_no} target already has a redirect adapter")
            validations.append((target, block_index, line, baseline, sidecar_path, sidecar, source_info))

        patches = make_clean_patches(source, targets)
        comparison = create_comparison(source, targets, patches, symbol)
        mode = "apply-family" if args.apply_family else "apply-tracer" if args.apply_tracer else "dry-run"
        out_dir = EVIDENCE if mode != "dry-run" else ROOT / "tmp/action-redirect-audit"
        out_dir.mkdir(parents=True, exist_ok=True)
        comparison_path = out_dir / f"action-redirect-{scope}-source-patch-registry.png"
        comparison.save(comparison_path)

        placement_report = []
        next_indices: dict[int, int] = {}
        prepared = []
        for target_index, (target, block_index, line, baseline, sidecar_path, sidecar, _) in enumerate(validations):
            names = {Path(e.get("mask", {}).get("url", "")).name for e in sidecar.get("elements", [])}
            next_index = max([int(name.removeprefix("inline-element-mask-").removesuffix(".png"))
                              for name in names if name.startswith("inline-element-mask-") and name.endswith(".png")] + [-1]) + 1
            while next_indices.get(target["page"], next_index) > next_index:
                next_index += 1
            next_indices[target["page"]] = next_index + 1
            element = build_placement(target, block_index, baseline)
            filename = f"inline-element-mask-{next_index:03d}.png"
            element["mask"]["url"] = f"/pages/page_{target['page']:03d}/{filename}"
            prepared.append((target, element, filename, patches[(target["page"], target_index)], sidecar_path, sidecar))
            placement_report.append(element)

    if args.apply_tracer or args.apply_family:
        for target, element, filename, patch, sidecar_path, _sidecar in prepared:
            page_dir = ROOT / f"apps/web/public/pages/page_{target['page']:03d}"
            patch.save(page_dir / filename)
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
            sidecar["elements"].append(element)
            sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"mode": mode, "familyCount": 3, "scopeCount": len(targets),
                      "pattern": "one whitespace slot replaced in a prose span; two icons inserted before standalone whitespace spans",
                      "placements": placement_report, "comparison": str((EVIDENCE if mode != 'dry-run' else ROOT/'tmp/action-redirect-audit') / comparison_path.name)},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
