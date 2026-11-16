#!/usr/bin/env python3
"""Map the source terrain legend pictograms on p.21 and p.23 as semantic inline symbols.

Default mode only produces source/raster comparisons. --apply adds five source
symbol identities, occurrence sidecars, and local pre-text underlay patches; it
does not alter the source PDF, translated text, Payload, or existing symbols.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops, ImageFilter, ImageDraw

from build_inline_symbol_registry import native_paint_colors, vector_path

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
EXPECTED_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
EVIDENCE = ROOT / "output/proofs/terrain-legend-semantic-icons-2026-10-26"
REGISTRY = ROOT / "apps/web/src/symbols/sourceSymbols.json"
SPECS = {
    "terrain.hindering.icon": {
        "en": "Hindering terrain icon", "pt": "Ícone de Terreno Difícil",
        "enTerms": ["hindering", "terrain", "icon", "chevrons"],
        "ptTerms": ["terreno difícil", "difícil", "ícone", "setas"],
    },
    "terrain.water.icon": {
        "en": "Water terrain icon", "pt": "Ícone de Terreno de Água",
        "enTerms": ["water", "terrain", "icon", "droplet"],
        "ptTerms": ["água", "terreno", "ícone", "gota"],
    },
    "terrain.muck.icon": {
        "en": "Muck terrain icon", "pt": "Ícone de Terreno de Lodo",
        "enTerms": ["muck", "terrain", "icon"],
        "ptTerms": ["lodo", "terreno", "ícone"],
    },
    "terrain.dangerous.icon": {
        "en": "Dangerous terrain icon", "pt": "Ícone de Terreno Perigoso",
        "enTerms": ["dangerous", "terrain", "icon", "warning"],
        "ptTerms": ["perigoso", "terreno", "ícone", "alerta"],
    },
    "terrain.special.icon": {
        "en": "Special terrain icon", "pt": "Ícone de Terreno Especial",
        "enTerms": ["special", "terrain", "icon", "star"],
        "ptTerms": ["especial", "terreno", "ícone", "estrela"],
    },
}
TARGETS = [
    {"page": 21, "symbolId": "terrain.hindering.icon", "blockId": "block_76", "lineId": "line_23_1", "text": "HINDERING", "drawings": [232, 233, 234, 235], "contentXref": 55511},
    {"page": 21, "symbolId": "terrain.water.icon", "blockId": "block_25", "lineId": "line_25_0", "text": "WATER", "drawings": [236, 237], "contentXref": 55511},
    {"page": 21, "symbolId": "terrain.muck.icon", "blockId": "block_78", "lineId": "line_25_1", "text": "MUCK", "drawings": [238, 239], "contentXref": 55511},
    {"page": 21, "symbolId": "terrain.dangerous.icon", "blockId": "block_24", "lineId": "line_24_0", "text": "DANGEROUS", "drawings": [240, 241], "contentXref": 55511},
    {"page": 21, "symbolId": "terrain.special.icon", "blockId": "block_77", "lineId": "line_24_1", "text": "SPECIAL", "drawings": [242], "contentXref": 55511},
    {"page": 23, "symbolId": "terrain.hindering.icon", "blockId": "block_26", "lineId": "line_18_1", "text": "HINDERING", "drawings": [231, 232, 233, 234], "contentXref": 55585},
    {"page": 23, "symbolId": "terrain.water.icon", "blockId": "block_20", "lineId": "line_20_0", "text": "WATER", "drawings": [235, 236], "contentXref": 55585},
    {"page": 23, "symbolId": "terrain.muck.icon", "blockId": "block_28", "lineId": "line_20_1", "text": "MUCK", "drawings": [237, 238], "contentXref": 55585},
    {"page": 23, "symbolId": "terrain.dangerous.icon", "blockId": "block_19", "lineId": "line_19_0", "text": "DANGEROUS", "drawings": [239, 240], "contentXref": 55585},
    {"page": 23, "symbolId": "terrain.special.icon", "blockId": "block_27", "lineId": "line_19_1", "text": "SPECIAL", "drawings": [241], "contentXref": 55585},
]
ARTIFACT_BBOX = re.compile(rb"/Artifact\s*<<\s*/BBox\s*\[([^\]]+)\]\s*/O\s*/Layout\s*>>BDC")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def dump(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="")


def rgb(value):
    if value is None:
        return "none"
    return "#" + "".join(f"{round(channel * 255):02x}" for channel in value)


def full_paths(page: fitz.Page, drawings: list[dict], indices: list[int], box: fitz.Rect) -> list[dict]:
    paths = []
    for index in indices:
        drawing = drawings[index]
        if drawing["type"] not in {"f", "s", "fs"}:
            raise ValueError(f"Unexpected terrain icon drawing type p{page.number + 1}/d{index}: {drawing['type']}")
        paths.append({
            "d": vector_path(drawing),
            "transform": f"translate({-box.x0:.8f} {-box.y0:.8f})",
            "fill": rgb(drawing.get("fill")),
            "stroke": rgb(drawing.get("color")),
            "strokeWidth": drawing.get("width") or 0,
            "fillRule": "evenodd" if drawing.get("even_odd") else "nonzero",
            "strokeLinecap": ["butt", "round", "square"][max(drawing.get("lineCap") or (0, 0, 0))],
            "strokeLinejoin": ["miter", "round", "bevel"][round(drawing.get("lineJoin") or 0)],
        })
    calibrated = native_paint_colors(page, box, copy.deepcopy(paths))
    # native_paint_colors prefixes a crop offset only for its temporary ownership
    # map; retain the source-symbol-local transform while using its measured paint.
    for original, measured in zip(paths, calibrated):
        original["fill"] = measured["fill"]
        original["stroke"] = measured["stroke"]
    return paths


def svg_doc(paths: list[dict], symbol_box: fitz.Rect, crop_box: fitz.Rect, alpha_only: bool = False) -> bytes:
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=f"{crop_box.width:.8f}pt",
                      height=f"{crop_box.height:.8f}pt", viewBox=f"0 0 {crop_box.width:.8f} {crop_box.height:.8f}")
    group = ET.SubElement(root, "g", transform=f"translate({symbol_box.x0 - crop_box.x0:.8f} {symbol_box.y0 - crop_box.y0:.8f})")
    names = {"strokeWidth": "stroke-width", "fillRule": "fill-rule", "strokeLinecap": "stroke-linecap", "strokeLinejoin": "stroke-linejoin"}
    for path in paths:
        attrs = {names.get(key, key): str(value) for key, value in path.items()}
        if alpha_only:
            attrs["fill"] = "white" if path.get("fill") not in (None, "none") else "none"
            attrs["stroke"] = "white" if path.get("stroke") not in (None, "none") else "none"
        ET.SubElement(group, "path", attrs)
    return ET.tostring(root, encoding="utf-8")


def render_svg(svg: bytes, sx: float, sy: float) -> Image.Image:
    doc = fitz.open("svg", svg)
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(sx, sy), alpha=True)
    image = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
    doc.close()
    return image


def max_diff(a: Image.Image, b: Image.Image) -> Image.Image:
    channels = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).split()
    return ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])


def outside_diffs(a: Image.Image, b: Image.Image, allowed: Image.Image, threshold: int = 16) -> int:
    binary = max_diff(a, b).point(lambda value: 255 if value > threshold else 0)
    return ImageChops.multiply(binary, ImageChops.invert(allowed.convert("L"))).histogram()[255]


def remove_marked_source_drawings(stream: bytes, page: fitz.Page, drawings: list[dict], targets: list[dict]):
    """Remove only PDF Artifact paint groups that own the named icon vectors."""
    objects = []
    for match in ARTIFACT_BBOX.finditer(stream):
        values = [float(value) for value in match.group(1).split()]
        if len(values) != 4:
            continue
        # PDF BBox uses bottom-left coordinates; PyMuPDF drawing rectangles
        # use top-left coordinates. The Artifact BBoxes include 0.25pt padding.
        bbox = fitz.Rect(values[0], page.rect.height - values[3], values[2], page.rect.height - values[1])
        end = re.search(rb"\bEMC\b", stream[match.end():])
        if end is None:
            raise ValueError("Unclosed source Artifact paint group")
        objects.append({"bbox": bbox, "start": match.start(), "end": match.end() + end.end()})

    removals = {}
    for target in targets:
        source_box = fitz.Rect(drawings[target["drawings"][0]]["rect"])
        for index in target["drawings"][1:]:
            source_box |= fitz.Rect(drawings[index]["rect"])
        center = fitz.Point((source_box.x0 + source_box.x1) / 2, (source_box.y0 + source_box.y1) / 2)
        nearby = []
        for obj in objects:
            obj_center = fitz.Point((obj["bbox"].x0 + obj["bbox"].x1) / 2, (obj["bbox"].y0 + obj["bbox"].y1) / 2)
            distance = math.hypot(obj_center.x - center.x, obj_center.y - center.y)
            if distance < 4.0:
                nearby.append((obj["start"], distance, obj))
        source_indices = sorted(target["drawings"], key=lambda index: drawings[index]["seqno"])
        nearby.sort(key=lambda row: row[0])
        if len(nearby) != len(source_indices):
            raise ValueError(f"Cannot uniquely map p{target['page']} {target['symbolId']} drawings to nearby source Artifacts: expected {len(source_indices)}, found {len(nearby)}")
        # Source drawing seqno and PDF stream order are monotonic. Some PDF
        # Artifact BBoxes have extra editorial padding (especially outlined
        # droplets), so map the local groups by verified order, not bbox equality.
        for index, (start, distance, obj) in zip(source_indices, nearby):
            if distance >= 4.0:
                raise ValueError(f"Source Artifact is not local to p{target['page']} {target['symbolId']} drawing {index}")
            key = (obj["start"], obj["end"])
            if key in removals:
                raise ValueError(f"One source Artifact matched more than one terrain drawing: {key}")
            removals[key] = {"page": target["page"], "symbolId": target["symbolId"], "drawingIndex": index,
                             "artifactBBoxPt": list(obj["bbox"]), "centerDistancePt": round(distance, 6),
                             "sourceDrawingRectPt": list(drawings[index]["rect"]), "streamRange": [obj["start"], obj["end"]]}
    updated = stream
    for start, end in sorted(removals, reverse=True):
        updated = updated[:start] + b" " + updated[end:]
    if updated.count(b"/Artifact") != stream.count(b"/Artifact") - len(removals):
        raise ValueError("Source Artifact removal count did not match the verified target objects")
    return updated, list(removals.values())


def normalized_signature(drawings: list[dict], indices: list[int], box: fitz.Rect) -> list[dict]:
    signature = []
    for i in indices:
        drawing = drawings[i]
        items = []
        for item in drawing["items"]:
            normalized = [item[0]]
            for value in item[1:]:
                if isinstance(value, fitz.Point):
                    normalized.append([round((value.x - box.x0) / box.width, 4), round((value.y - box.y0) / box.height, 4)])
                elif isinstance(value, fitz.Rect):
                    normalized.append([round((value.x0 - box.x0) / box.width, 4), round((value.y0 - box.y0) / box.height, 4), round((value.x1 - box.x0) / box.width, 4), round((value.y1 - box.y0) / box.height, 4)])
                elif isinstance(value, fitz.Quad):
                    normalized.append([[round((p.x - box.x0) / box.width, 4), round((p.y - box.y0) / box.height, 4)] for p in [value.ul, value.ur, value.lr, value.ll]])
                else:
                    normalized.append(value)
            items.append(normalized)
        signature.append({"type": drawing["type"], "items": items,
                          "fill": drawing.get("fill"), "color": drawing.get("color"), "width": drawing.get("width"),
                          "even_odd": drawing.get("even_odd"), "lineCap": drawing.get("lineCap"), "lineJoin": drawing.get("lineJoin")})
    return signature


def same_signature(left, right, tolerance: float = .0005) -> bool:
    if isinstance(left, (int, float)) and not isinstance(left, bool) and isinstance(right, (int, float)) and not isinstance(right, bool):
        return abs(left - right) <= tolerance
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(same_signature(left[key], right[key], tolerance) for key in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(same_signature(a, b, tolerance) for a, b in zip(left, right))
    return left == right


def make_definition(symbol_id: str, first: dict, box: fitz.Rect, baseline: float, paths: list[dict]) -> dict:
    spec = SPECS[symbol_id]
    size = 9.0
    return {
        "id": symbol_id,
        "category": "Terrenos",
        "labels": {"en": spec["en"], "pt-BR": spec["pt"]},
        "description": {"en": spec["en"] + " — pictogram from the source PDF.",
                        "pt-BR": spec["pt"] + " — pictograma do PDF original."},
        "searchTerms": {"en": spec["enTerms"], "pt-BR": spec["ptTerms"]},
        "editorTokens": {"en": f"⟦{spec['en']}⟧", "pt-BR": f"⟦{spec['pt']}⟧"},
        "allowedBlockTypes": ["paragraph", "typographic-field", "span-unit", "credit-field"],
        "source": {"pdf": PDF.name, "page": first["page"], "bboxPt": [box.x0, box.y0, box.x1, box.y1], "assetSizePx": [0, 0]},
        "sourceRendering": "semantic-inline",
        "render": {"viewBox": [0, 0, box.width, box.height], "paths": paths,
                   "widthEm": box.width / size, "heightEm": box.height / size,
                   "verticalAlignEm": (box.y1 - baseline) / size},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply sidecars, registry definitions and local underlay crops.")
    args = parser.parse_args()
    pdf_bytes = PDF.read_bytes()
    if sha(pdf_bytes) != EXPECTED_PDF_SHA256:
        raise ValueError("The source PDF hash changed; refusing to map stale drawing indices.")
    registry_bytes = REGISTRY.read_bytes()
    registry = json.loads(registry_bytes.decode("utf-8"))
    existing_ids = {symbol["id"] for symbol in registry}
    duplicate_symbols = existing_ids.intersection(SPECS)
    if duplicate_symbols:
        raise ValueError(f"Semantic symbol already exists; inspect before reuse: {sorted(duplicate_symbols)}")
    pages = {}
    backgrounds = {}
    doms = {}
    sidecars = {}
    scales = {}
    source = fitz.open(PDF)
    for number in (21, 23):
        page_dir = ROOT / f"apps/web/public/pages/page_{number:03d}"
        dom_path = page_dir / f"page_{number:03d}_dom.json"
        sidecar_path = page_dir / "inline_elements.json"
        doms[number] = json.loads(dom_path.read_text(encoding="utf-8"))
        sidecars[number] = json.loads(sidecar_path.read_text(encoding="utf-8")) if sidecar_path.exists() else {"schemaVersion": 1, "elements": []}
        backgrounds[number] = Image.open(page_dir / "background.webp").convert("RGB")
        pages[number] = source[number - 1]
        page = pages[number]
        if backgrounds[number].size != (1710, 1710):
            raise ValueError(f"Unexpected p{number} raster size {backgrounds[number].size}")
        scales[number] = (backgrounds[number].width / page.rect.width, backgrounds[number].height / page.rect.height)

    indexed = {}
    placements = []
    for target in TARGETS:
        n = target["page"]
        page = pages[n]
        drawings = page.get_drawings()
        if any(e.get("id") == f"p{n}-terrain-{target['symbolId'].split('.')[1]}" for e in sidecars[n]["elements"]):
            raise ValueError(f"Duplicate occurrence on p{n}: {target['symbolId']}")
        dom = doms[n]
        block_index = next((i for i, b in enumerate(dom["blocks"]) if b["id"] == target["blockId"]), None)
        if block_index is None:
            raise ValueError(f"Missing label block p{n}/{target['blockId']}")
        block = dom["blocks"][block_index]
        line = next((l for l in block["lines"] if l["id"] == target["lineId"]), None)
        if not line or len(line["spans"]) != 1 or line["spans"][0]["text"] != target["text"]:
            raise ValueError(f"Source label changed p{n}/{target['blockId']}: {line}")
        span = line["spans"][0]
        if span.get("font") != "OptimaLTStd-Bold" or abs(span.get("size", 0) - 9) > .02 or not span.get("origin"):
            raise ValueError(f"Unexpected source label style/anchor p{n}/{target['blockId']}")
        if target["drawings"][-1] >= len(drawings):
            raise ValueError(f"Drawing index out of range p{n}/{target['symbolId']}")
        box = fitz.Rect(drawings[target["drawings"][0]]["rect"])
        for index in target["drawings"][1:]:
            box |= fitz.Rect(drawings[index]["rect"])
        layout_frame = block.get("layoutFrame")
        frame = fitz.Rect(layout_frame["x"], layout_frame["y"],
                          layout_frame["x"] + layout_frame["width"],
                          layout_frame["y"] + layout_frame["height"]) if layout_frame else fitz.Rect(block["bbox"])
        if not frame.contains(box) or box.x1 >= span["bbox"][0] or abs((box.y0 + box.y1) / 2 - (span["bbox"][1] + span["bbox"][3]) / 2) > .75:
            raise ValueError(f"Icon does not occupy the source label row p{n}/{target['symbolId']}")
        gap = span["bbox"][0] - box.x1
        if not .5 <= gap <= 4.0:
            raise ValueError(f"Unreviewed icon/label gap p{n}/{target['symbolId']}: {gap:.3f}pt")
        label_text = target["text"]
        element_id = f"p{n}-terrain-{target['symbolId'].split('.')[1]}"
        px = scales[n]
        pixel_box = (math.floor(box.x0 * px[0]) - 2, math.floor(box.y0 * px[1]) - 2,
                     math.ceil(box.x1 * px[0]) + 2, math.ceil(box.y1 * px[1]) + 2)
        mask_box = [pixel_box[0] / px[0], pixel_box[1] / px[1], pixel_box[2] / px[0], pixel_box[3] / px[1]]
        paths = full_paths(page, drawings, target["drawings"], box)
        placement = {**target, "id": element_id, "blockIndex": block_index, "spanIndex": 0,
                     "bbox": [box.x0, box.y0, box.x1, box.y1], "frame": list(frame), "baseline": span["origin"][1],
                     "gapPt": gap, "pixelBox": pixel_box, "maskBBox": mask_box, "paths": paths,
                     "signature": normalized_signature(drawings, target["drawings"], box)}
        placements.append(placement)
        indexed[(n, target["symbolId"])] = placement

    for symbol_id in SPECS:
        a, b = indexed[(21, symbol_id)], indexed[(23, symbol_id)]
        if abs((a["bbox"][2] - a["bbox"][0]) - (b["bbox"][2] - b["bbox"][0])) > .02 \
                or abs((a["bbox"][3] - a["bbox"][1]) - (b["bbox"][3] - b["bbox"][1])) > .02:
            raise ValueError(f"Same-family source dimensions differ: {symbol_id}")
        if not same_signature(a["signature"], b["signature"]):
            raise ValueError(f"Source shapes or paint differ across pages: {symbol_id}")

    # Build disposable exact-source renders. Text is removed through PyMuPDF's
    # text-only redaction. Target vectors are removed surgically by deleting
    # only their own tagged Artifact paint groups from the copied content
    # streams; graphics redaction would also erase nearby dashed badge pieces.
    before_icons, underlays, removed_artifacts = {}, {}, []
    with fitz.open(PDF) as source_doc, fitz.open(PDF) as before_doc, fitz.open(PDF) as underlay_doc:
        for n in (21, 23):
            source_page = source_doc[n - 1]
            targets_on_page = [item for item in placements if item["page"] == n]
            content_xrefs = source_page.get_contents()
            expected_xref = targets_on_page[0]["contentXref"]
            if content_xrefs != [expected_xref]:
                raise ValueError(f"Unexpected source content stream p{n}: {content_xrefs}")
            stream = source_doc.xref_stream(expected_xref) or b""
            updated, removed = remove_marked_source_drawings(stream, source_page,
                                                             source_page.get_drawings(), targets_on_page)
            if updated == stream:
                raise ValueError(f"No target Artifact drawings removed for p{n}")
            underlay_doc.update_stream(expected_xref, updated)
            removed_artifacts.extend(removed)

        for n in (21, 23):
            source_page = source_doc[n - 1]
            before_page = before_doc[n - 1]
            underlay_page = underlay_doc[n - 1]
            for text_block in source_page.get_text("blocks"):
                if text_block[4].strip():
                    rect = fitz.Rect(text_block[:4])
                    before_page.add_redact_annot(rect, fill=None)
                    underlay_page.add_redact_annot(rect, fill=None)
            before_page.apply_redactions(images=0, graphics=0, text=0)
            underlay_page.apply_redactions(images=0, graphics=0, text=0)
            before_pix = before_page.get_pixmap(matrix=fitz.Matrix(*scales[n]), alpha=False)
            clean_pix = underlay_page.get_pixmap(matrix=fitz.Matrix(*scales[n]), alpha=False)
            before_icons[n] = Image.frombytes("RGB", (before_pix.width, before_pix.height), before_pix.samples)
            underlays[n] = Image.frombytes("RGB", (clean_pix.width, clean_pix.height), clean_pix.samples)
            if before_icons[n].size != backgrounds[n].size or underlays[n].size != backgrounds[n].size:
                raise ValueError(f"Exact-source render does not align with p{n} background")

    metrics = []
    mask_crops = []
    rebuilt = {n: backgrounds[n].copy() for n in (21, 23)}
    comparison_rows = []
    for target in placements:
        n = target["page"]
        box, bbox = target["pixelBox"], target["maskBBox"]
        original_crop = before_icons[n].crop(box)
        clean_crop = underlays[n].crop(box)
        svg = svg_doc(target["paths"], fitz.Rect(target["bbox"]), fitz.Rect(bbox))
        alpha = render_svg(svg_doc(target["paths"], fitz.Rect(target["bbox"]), fitz.Rect(bbox), alpha_only=True), *scales[n])
        symbol = render_svg(svg, *scales[n])
        if alpha.size != clean_crop.size or symbol.size != clean_crop.size:
            raise ValueError(f"SVG and source grid do not align p{n}/{target['symbolId']}")
        silhouette = alpha.getchannel("A").point(lambda value: 255 if value > 8 else 0).filter(ImageFilter.MaxFilter(3))
        if silhouette.histogram()[255] <= 5:
            raise ValueError(f"Vacuous silhouette comparison p{n}/{target['symbolId']}")
        # The vector-removal proof must change pixels only within the icon
        # silhouette. The separately derived WebP may differ slightly from a
        # lossless source raster due to compression; report that delta below.
        underlay_outside = outside_diffs(original_crop, clean_crop, silhouette)
        rebuilt_crop = Image.alpha_composite(clean_crop.convert("RGBA"), symbol).convert("RGB")
        # Compare visible source paint after compositing, not raw SVG alpha:
        # dark outline pixels over the dark terrain panel can be visually
        # indistinguishable from the underlay and therefore are not source ink.
        source_ink = max_diff(original_crop, clean_crop).point(lambda value: 255 if value > 40 else 0)
        svg_ink = max_diff(rebuilt_crop, clean_crop).point(lambda value: 255 if value > 40 else 0)
        intersection = ImageChops.darker(source_ink, svg_ink).histogram()[255]
        union = ImageChops.lighter(source_ink, svg_ink).histogram()[255]
        iou = intersection / union if union else 0
        diff_pixels = max_diff(original_crop, rebuilt_crop).point(lambda value: 255 if value > 24 else 0).histogram()[255]
        pad_x, pad_y = round(8 * scales[n][0]), round(8 * scales[n][1])
        ctx = (max(0, box[0] - pad_x), max(0, box[1] - pad_y), min(backgrounds[n].width, box[2] + pad_x), min(backgrounds[n].height, box[3] + pad_y))
        original_context, underlay_context = before_icons[n].crop(ctx), underlays[n].crop(ctx)
        ctx_points = [ctx[0] / scales[n][0], ctx[1] / scales[n][1], ctx[2] / scales[n][0], ctx[3] / scales[n][1]]
        context_alpha = render_svg(svg_doc(target["paths"], fitz.Rect(target["bbox"]), fitz.Rect(ctx_points), alpha_only=True), *scales[n])
        context_silhouette = context_alpha.getchannel("A").point(lambda value: 255 if value > 8 else 0).filter(ImageFilter.MaxFilter(3))
        context_outside = outside_diffs(original_context, underlay_context, context_silhouette)
        if underlay_outside or context_outside or iou < .86:
            raise ValueError(f"Source preflight failed p{n}/{target['symbolId']}: patchOutside={underlay_outside}, contextOutside={context_outside}, IoU={iou:.4f}")
        rebuilt[n].paste(rebuilt_crop, (box[0], box[1]))
        mask_name = f"inline-element-mask-terrain-{target['symbolId'].split('.')[1]}-p{n}.png"
        mask_crops.append((ROOT / f"apps/web/public/pages/page_{n:03d}" / mask_name, clean_crop))
        metrics.append({"page": n, "id": target["id"], "symbolId": target["symbolId"],
                        "drawingIndices": target["drawings"], "sourceBBoxPt": target["bbox"],
                        "sourceLabel": target["text"], "labelBlockId": target["blockId"],
                        "frameBBoxPt": target["frame"], "baselinePt": target["baseline"],
                        "trailingGapPt": round(target["gapPt"], 5), "pixelCrop": list(box),
                        "underlayOutsideDifferences": underlay_outside, "contextOutsideDifferences": context_outside,
                        "sourceSemanticIoU": round(iou, 5), "sourceSemanticDifferencePixels": diff_pixels})
        scale = 8
        row = Image.new("RGB", (original_crop.width * scale * 3 + 48, original_crop.height * scale + 48), "#f4f0e8")
        draw = ImageDraw.Draw(row)
        draw.text((8, 4), "Original PDF raster", fill="#111111")
        draw.text((16 + original_crop.width * scale, 4), "Recovered pre-text underlay", fill="#111111")
        draw.text((24 + original_crop.width * scale * 2, 4), "Underlay + semantic vector", fill="#111111")
        row.paste(original_crop.resize((original_crop.width * scale, original_crop.height * scale), Image.Resampling.NEAREST), (8, 24))
        row.paste(clean_crop.resize((clean_crop.width * scale, clean_crop.height * scale), Image.Resampling.NEAREST), (16 + original_crop.width * scale, 24))
        row.paste(rebuilt_crop.resize((rebuilt_crop.width * scale, rebuilt_crop.height * scale), Image.Resampling.NEAREST), (24 + original_crop.width * scale * 2, 24))
        comparison_rows.append(row)

    definitions = []
    for symbol_id in SPECS:
        first = indexed[(21, symbol_id)]
        definitions.append(make_definition(symbol_id, first, fitz.Rect(first["bbox"]), first["baseline"], first["paths"]))
    registry_text = registry_bytes.decode("utf-8")
    newline = "\r\n" if "\r\n" in registry_text else "\n"
    close_bracket = registry_text.rfind("]")
    if close_bracket < 0:
        raise ValueError("Could not find source-symbol registry delimiter")
    entry_text = "," + newline + ("," + newline).join(
        newline.join("  " + line for line in json.dumps(definition, ensure_ascii=False, indent=2).splitlines()) for definition in definitions)
    registry_after = registry_text[:close_bracket].rstrip() + entry_text + newline + registry_text[close_bracket:]

    per_page = {}
    for n in (21, 23):
        existing = sidecars[n]["elements"]
        additions = []
        for target in [p for p in placements if p["page"] == n]:
            label_block = next(b for b in doms[n]["blocks"] if b["id"] == target["blockId"])
            line = next(l for l in label_block["lines"] if l["id"] == target["lineId"])
            span = line["spans"][0]
            metrics_for_symbol = make_definition(target["symbolId"], indexed[(21, target["symbolId"])],
                fitz.Rect(indexed[(21, target["symbolId"])]["bbox"]), indexed[(21, target["symbolId"])]["baseline"],
                indexed[(21, target["symbolId"])]["paths"])["render"]
            element = {
                "id": target["id"], "symbolId": target["symbolId"], "sourceRendering": "semantic-inline",
                "bbox": target["bbox"], "drawingIndices": target["drawings"],
                "anchor": {"blockId": target["blockId"], "blockIndex": target["blockIndex"],
                           "lineId": target["lineId"], "spanIndex": 0, "side": "before", "sizePt": 9.0,
                           "trailingGapPt": round(target["gapPt"], 5),
                           "ownerSpanRef": {"lineId": target["lineId"], "spanIndex": 0}},
                "metrics": {**metrics_for_symbol, "advanceEm": metrics_for_symbol["widthEm"]},
                "mask": {"url": f"/pages/page_{n:03d}/inline-element-mask-terrain-{target['symbolId'].split('.')[1]}-p{n}.png",
                         "bbox": target["maskBBox"]},
                "provenance": {"auditId": "terrain-legend-inline-2026-10-26", "candidateId": f"p{n:03d}-{target['symbolId']}",
                               "sourcePdfSha256": EXPECTED_PDF_SHA256, "sourceObjects": target["drawings"],
                               "underlayStreamXref": target["contentXref"], "sourceMeaning": target["symbolId"]},
            }
            if existing and any(e.get("id") == target["id"] for e in existing):
                raise ValueError(f"Duplicate inline occurrence ID {target['id']}")
            additions.append(element)
        per_page[n] = {"schemaVersion": 1, "elements": [*existing, *additions]}

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    comparison = Image.new("RGB", (max(row.width for row in comparison_rows), sum(row.height for row in comparison_rows)), "#f4f0e8")
    y = 0
    for row in comparison_rows:
        comparison.paste(row, (0, y)); y += row.height
    comparison.save(EVIDENCE / "source-icon-underlay-reconstruction.png")
    for n in (21, 23):
        rebuilt[n].save(EVIDENCE / f"page-{n:03d}-background-with-semantic-icons.webp", quality=95)
    manifest = {
        "status": "preflight_passed" if not args.apply else "applied_source_inline_mapping",
        "pages": [21, 23], "sourcePdfSha256": EXPECTED_PDF_SHA256,
        "contentStreams": {"21": 55511, "23": 55585},
        "backgroundSha256": {str(n): sha((ROOT / f"apps/web/public/pages/page_{n:03d}/background.webp").read_bytes()) for n in (21, 23)},
        "symbolIds": list(SPECS), "reusedExistingTerrainRedBorder": False,
        "starIdentityNote": "The five-point filled terrain star does not share the geometry of marker.star (four-point glint); no icon was aliased to a non-matching symbol.",
        "method": "Suppress extracted text on disposable source-PDF copies; remove only the ten icon-owned tagged Artifact paint groups from copied content streams; render exact underlay patches on the background.webp pixel grid; compare source and semantic composites and assert zero changed pixels outside each symbol silhouette and its context.",
        "mappings": metrics,
        "removedSourceArtifacts": removed_artifacts,
        "filesChanged": (["apps/web/src/symbols/sourceSymbols.json", *[f"apps/web/public/pages/page_{n:03d}/inline_elements.json" for n in (21, 23)],
                          *[str(path.relative_to(ROOT)) for path, _ in mask_crops]] if args.apply else []),
        "translationsOrPayloadChanged": False,
        "rollback": "Remove only the ten named inline occurrences and mask PNGs, plus the five terrain.*.icon definitions appended by this change. Restore the prior p.21/p.23 inline_elements sidecars and sourceSymbols.json snapshots recorded before apply.",
    }
    dump(EVIDENCE / "manifest.json", manifest)
    if args.apply:
        for path, crop in mask_crops:
            crop.save(path)
        for n in (21, 23):
            dump(ROOT / f"apps/web/public/pages/page_{n:03d}/inline_elements.json", per_page[n])
        REGISTRY.write_text(registry_after, encoding="utf-8", newline="")
    source.close()
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "evidence": str(EVIDENCE),
                      "mappings": metrics, "registeredSymbols": len(definitions)}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
