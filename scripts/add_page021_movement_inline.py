#!/usr/bin/env python3
"""Map the two source-PDF movement pictograms on p.21 as semantic inline symbols.

The source PDF is read-only. The cleanup crops use the page's verified pre-text
PDF layer, and only the two source vector silhouettes are replaced. Dry-run
writes comparison evidence under tmp; --apply updates the p.21 sidecar, symbol
registry, and local cleanup crops. It does not alter translation proposals or
Payload records.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_021"
BACKGROUND = PAGE / "background.webp"
DOM_PATH = PAGE / "page_021_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
EVIDENCE = ROOT / "output/proofs/translation-readiness-2026-10-23/p021-movement-symbol-v1"
DRY_RUN = ROOT / "tmp/p021-movement-symbol-dry-run-v1"
EXPECTED_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
EXPECTED_CONTENT_XREF = 55511
SYMBOL_ID = "resource.movement"
TARGETS = [
    {"id": "p21-movement-001", "candidateId": "p021-v106-107-n2",
     "bbox": [86.84210205078125, 653.6865234375, 97.46510314941406, 664.3084716796875],
     "drawingIndices": [106, 107], "blockId": "block_16", "lineId": "line_16_3",
     "spanIndex": 1, "expectedSpan": "MOVEMENT", "previousSpan": " ", "sizePt": 9.0,
     "precedingSourceText": "It costs 2"},
    {"id": "p21-movement-002", "candidateId": "p021-v108-109-n2",
     "bbox": [309.9249267578125, 681.3558349609375, 320.54791259765625, 691.977783203125],
     "drawingIndices": [108, 109], "blockId": "block_18", "lineId": "line_18_1",
     "spanIndex": 1, "expectedSpan": "MOVEMENT", "previousSpan": " ", "sizePt": 9.0,
     "precedingSourceText": "costs 2"},
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def color_string(value: tuple[float, float, float] | None) -> str:
    if value is None:
        return "none"
    return "rgb(" + ",".join(f"{channel * 255:.4f}" for channel in value) + ")"


def drawing_path(drawing: dict, origin: tuple[float, float]) -> str:
    ox, oy = origin
    commands: list[str] = []
    current = None
    first_point = None
    last_point = None
    for item in drawing["items"]:
        kind, *points = item
        point = points[0]
        if first_point is None:
            first_point = point
        if current is None or abs(current.x - point.x) > .001 or abs(current.y - point.y) > .001:
            commands.append(f"M {point.x - ox:.6f} {point.y - oy:.6f}")
        if kind == "c":
            c1, c2, end = points[1:]
            commands.append(f"C {c1.x - ox:.6f} {c1.y - oy:.6f} {c2.x - ox:.6f} {c2.y - oy:.6f} {end.x - ox:.6f} {end.y - oy:.6f}")
            current = end
        elif kind == "l":
            end = points[1]
            commands.append(f"L {end.x - ox:.6f} {end.y - oy:.6f}")
            current = end
        else:
            raise ValueError(f"Unexpected p.21 movement vector operator {kind!r}.")
        last_point = current
    if first_point is not None and last_point is not None and abs(first_point.x - last_point.x) < .001 and abs(first_point.y - last_point.y) < .001:
        commands.append("Z")
    return " ".join(commands)


def vector_paths(drawings: list[dict], target: dict) -> list[dict]:
    x0, y0, _, _ = target["bbox"]
    paths = []
    for index in target["drawingIndices"]:
        drawing = drawings[index]
        if drawing["type"] != "f" or drawing.get("fill") is None or drawing.get("color") is not None:
            raise ValueError(f"Drawing {index} is not a filled, un-stroked source path.")
        paths.append({"d": drawing_path(drawing, (x0, y0)), "fill": color_string(drawing["fill"])})
    return paths


def point_numbers(path: str) -> list[float]:
    return [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", path)]


def verify_same_family(drawings: list[dict]) -> list[dict]:
    first = TARGETS[0]
    variant = vector_paths(drawings, first)
    outer_first, glyph_first = (drawings[i] for i in first["drawingIndices"])
    if len(outer_first["items"]) != 4 or len(glyph_first["items"]) != 15:
        raise ValueError("Unexpected p.21 movement-icon path topology.")
    for target in TARGETS:
        outer, glyph = (drawings[i] for i in target["drawingIndices"])
        expected = fitz.Rect(target["bbox"])
        if abs(outer["rect"].x0 - expected.x0) > .01 or abs(outer["rect"].y0 - expected.y0) > .01 \
                or abs(outer["rect"].x1 - expected.x1) > .01 or abs(outer["rect"].y1 - expected.y1) > .01:
            raise ValueError(f"The measured source bbox changed for {target['candidateId']}.")
        if outer["type"] != "f" or glyph["type"] != "f" or len(outer["items"]) != 4 or len(glyph["items"]) != 15:
            raise ValueError(f"The source icon paths changed for {target['candidateId']}.")
        actual = vector_paths(drawings, target)
        if [p["fill"] for p in actual] != [p["fill"] for p in variant]:
            raise ValueError(f"The source fill colors differ for {target['candidateId']}.")
        for a, b in zip(actual, variant):
            aa, bb = point_numbers(a["d"]), point_numbers(b["d"])
            if len(aa) != len(bb) or any(abs(x - y) > .003 for x, y in zip(aa, bb)):
                raise ValueError(f"The source vector geometry differs for {target['candidateId']}.")
    return variant


def source_baseline(page: fitz.Page, span: dict) -> float:
    for block in page.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]:
        for line in block.get("lines", []):
            for candidate in line["spans"]:
                if (candidate["font"] == span["font"] and abs(candidate["size"] - span["size"]) < .02
                    and abs(candidate["bbox"][1] - span["bbox"][1]) < .03
                    and abs(candidate["bbox"][3] - span["bbox"][3]) < .03
                    and candidate["text"] == span["text"]):
                    return candidate["origin"][1]
    raise ValueError("Could not measure the source text baseline for the movement label.")


def content_prefix(doc: fitz.Document) -> tuple[int, bytes]:
    page = doc[20]
    contents = page.get_contents()
    if contents != [EXPECTED_CONTENT_XREF]:
        raise ValueError(f"Unexpected p.21 content streams: {contents}.")
    stream = doc.xref_stream(contents[0])
    if not stream or b"/Fm0 Do" not in stream[:150] or b"/Fm1 Do" not in stream[:200] or b"/Fm2 Do" not in stream[:250]:
        raise ValueError("The p.21 page-art forms changed; refusing underlay extraction.")
    marker = re.search(rb"\sBT\s", stream)
    if not marker:
        raise ValueError("Cannot identify the first text paint in the p.21 content stream.")
    prefix = stream[:marker.start()]
    if b"BT" in prefix or b"/Fm0 Do" not in prefix:
        raise ValueError("The selected stream prefix is not a pre-text page layer.")
    return contents[0], prefix


def svg_for_target(paths: list[dict], target: dict, crop_bbox: list[float], *, alpha_only: bool = False) -> bytes:
    left, top, right, bottom = crop_bbox
    width, height = right - left, bottom - top
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg", width=f"{width:.8f}pt", height=f"{height:.8f}pt",
                      viewBox=f"0 0 {width:.8f} {height:.8f}", overflow="visible")
    group = ET.SubElement(root, "g", transform=f"translate({target['bbox'][0] - left:.8f} {target['bbox'][1] - top:.8f})")
    for path in paths:
        attrs = {"d": path["d"], "fill": "white" if alpha_only else path["fill"]}
        ET.SubElement(group, "path", attrs)
    return ET.tostring(root, encoding="utf-8")


def render_svg(svg: bytes, scale_x: float, scale_y: float) -> Image.Image:
    doc = fitz.open("svg", svg)
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(scale_x, scale_y), alpha=True)
    return Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)


def max_rgb_diff(a: Image.Image, b: Image.Image) -> Image.Image:
    channels = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).split()
    return ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])


def masked_diff_pixels(a: Image.Image, b: Image.Image, allowed: Image.Image, threshold: int = 16) -> int:
    binary = max_rgb_diff(a, b).point(lambda value: 255 if value > threshold else 0)
    return ImageChops.multiply(binary, ImageChops.invert(allowed.convert("L"))).histogram()[255]


def source_symbol(variant: list[dict], first: dict, baseline: float) -> dict:
    x0, y0, x1, y1 = first["bbox"]
    size = first["sizePt"]
    return {
        "id": SYMBOL_ID,
        "category": "Ações e recursos",
        "labels": {"en": "Movement icon", "pt-BR": "Ícone de Movimento"},
        "searchTerms": {"en": ["movement", "movement icon", "movement points"],
                        "pt-BR": ["movimento", "ícone de movimento", "pontos de movimento"]},
        "editorTokens": {"en": "⟦Movement⟧", "pt-BR": "⟦Movimento⟧"},
        "source": {"pdf": PDF.name, "page": 21, "bboxPt": first["bbox"], "assetSizePx": [0, 0]},
        "sourceRendering": "semantic-inline",
        "render": {"viewBox": [0, 0, x1 - x0, y1 - y0], "paths": variant,
                   "widthEm": (x1 - x0) / size, "heightEm": (y1 - y0) / size,
                   "verticalAlignEm": (y1 - baseline) / size},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not PDF.is_file() or not BACKGROUND.is_file():
        raise FileNotFoundError(PDF if not PDF.is_file() else BACKGROUND)
    pdf_bytes = PDF.read_bytes()
    if sha256(pdf_bytes) != EXPECTED_PDF_SHA256:
        raise ValueError("The official source PDF hash differs from the inspected source.")

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.exists() else {"schemaVersion": 1, "elements": []}
    registry_bytes = REGISTRY_PATH.read_bytes()
    registry = json.loads(registry_bytes.decode("utf-8"))
    background = Image.open(BACKGROUND).convert("RGB")
    if background.size != (1710, 1710):
        raise ValueError(f"Unexpected p.21 background dimensions: {background.size}.")
    if any(e.get("id") in {t["id"] for t in TARGETS} for e in sidecar["elements"]):
        raise ValueError("A p.21 movement mapping already exists; refusing to duplicate it.")
    if any(s.get("id") == SYMBOL_ID for s in registry):
        raise ValueError(f"Symbol {SYMBOL_ID} already exists; verify its source identity before reusing it.")

    with fitz.open(PDF) as source:
        source_page = source[20]
        scale_x, scale_y = background.width / source_page.rect.width, background.height / source_page.rect.height
        drawings = source_page.get_drawings()
        variant = verify_same_family(drawings)
        block_indices = {block["id"]: index for index, block in enumerate(dom["blocks"])}
        placements = []
        for target in TARGETS:
            if target["blockId"] not in block_indices:
                raise ValueError(f"Missing owner block {target['blockId']} in p.21 DOM.")
            block_index = block_indices[target["blockId"]]
            block = dom["blocks"][block_index]
            line = next((line for line in block.get("lines", []) if line["id"] == target["lineId"]), None)
            if not line or target["spanIndex"] >= len(line["spans"]):
                raise ValueError(f"Source line or anchor moved: {target['blockId']}/{target['lineId']}.")
            span = line["spans"][target["spanIndex"]]
            previous = line["spans"][target["spanIndex"] - 1]
            if span.get("text") != target["expectedSpan"] or abs(span.get("size", 0) - target["sizePt"]) > .02:
                raise ValueError(f"Unexpected source text anchor on {target['lineId']}: {span.get('text')!r}.")
            if previous.get("text") != target["previousSpan"] or abs(previous["bbox"][0] - target["bbox"][2]) > .02:
                raise ValueError(f"The source spacing before {target['expectedSpan']} changed.")
            if target["precedingSourceText"] not in " ".join(
                    "".join(s.get("text", "") for s in ln.get("spans", [])) for ln in block.get("lines", [])):
                raise ValueError(f"Cannot verify the movement cost context in {target['blockId']}.")
            bbox = fitz.Rect(target["bbox"])
            if not bbox.contains(drawings[target["drawingIndices"][0]]["rect"]) or not bbox.contains(drawings[target["drawingIndices"][1]]["rect"]):
                raise ValueError(f"The source paths escaped the inspected bbox in {target['candidateId']}.")
            baseline = source_baseline(source_page, span)
            target["sourceBaselinePt"] = baseline
            target["blockIndex"] = block_index
            target["metrics"] = {"widthEm": bbox.width / target["sizePt"],
                                  "heightEm": bbox.height / target["sizePt"],
                                  "verticalAlignEm": (bbox.y1 - baseline) / target["sizePt"],
                                  "advanceEm": bbox.width / target["sizePt"]}
            target["anchor"] = {"blockId": target["blockId"], "blockIndex": block_index,
                                "lineId": target["lineId"], "spanIndex": target["spanIndex"],
                                "side": "before", "sizePt": target["sizePt"],
                                "ownerSpanRef": {"lineId": target["lineId"], "spanIndex": target["spanIndex"]}}
            # Snap to the immutable p.21 raster grid and include two pixels of
            # original underlay around the complete vector antialias fringe.
            pixel_box = (math.floor(bbox.x0 * scale_x) - 2, math.floor(bbox.y0 * scale_y) - 2,
                         math.ceil(bbox.x1 * scale_x) + 2, math.ceil(bbox.y1 * scale_y) + 2)
            target["pixelBox"] = pixel_box
            target["maskBBox"] = [pixel_box[0] / scale_x, pixel_box[1] / scale_y,
                                  pixel_box[2] / scale_x, pixel_box[3] / scale_y]
            target["mask"] = {"url": f"/pages/page_021/inline-element-mask-movement-{len(placements) + 1:03d}.png",
                              "bbox": target["maskBBox"]}
            placements.append(target)

        xref, prefix = content_prefix(source)
        with fitz.open(PDF) as underlay_doc:
            underlay_doc.update_stream(xref, prefix)
            pix = underlay_doc[20].get_pixmap(matrix=fitz.Matrix(scale_x, scale_y), alpha=False)
            clean_background = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if clean_background.size != background.size:
            raise ValueError("Pre-text underlay and p.21 background raster dimensions differ.")

        metrics = []
        mask_crops = []
        rebuilt_page = background.copy()
        visual_rows = []
        for target in placements:
            box, bbox = target["pixelBox"], target["maskBBox"]
            original_crop, clean_crop = background.crop(box), clean_background.crop(box)
            ink_rgba = render_svg(svg_for_target(variant, target, bbox, alpha_only=True), scale_x, scale_y)
            symbol_rgba = render_svg(svg_for_target(variant, target, bbox), scale_x, scale_y)
            if ink_rgba.size != clean_crop.size or symbol_rgba.size != clean_crop.size:
                raise ValueError(f"Source-grid crop dimensions do not match the p.21 semantic vector for {target['candidateId']}.")
            ink = ink_rgba.getchannel("A").point(lambda value: 255 if value > 8 else 0).filter(ImageFilter.MaxFilter(3))
            outside = ImageChops.invert(ink)
            outside_pixels = outside.histogram()[255]
            if outside_pixels <= 100:
                raise ValueError(f"Outside-silhouette check is vacuous for {target['candidateId']}.")
            underlay_outside_diffs = masked_diff_pixels(original_crop, clean_crop, ink)
            source_ink = max_rgb_diff(original_crop, clean_crop).point(lambda value: 255 if value > 40 else 0)
            svg_ink = symbol_rgba.getchannel("A").point(lambda value: 255 if value > 24 else 0)
            source_hist, svg_hist = source_ink.histogram()[255], svg_ink.histogram()[255]
            intersect = ImageChops.darker(source_ink, svg_ink).histogram()[255]
            union = ImageChops.lighter(source_ink, svg_ink).histogram()[255]
            iou = intersect / union if union else 0.0
            rebuilt = Image.alpha_composite(clean_crop.convert("RGBA"), symbol_rgba).convert("RGB")
            changed = max_rgb_diff(original_crop, rebuilt).point(lambda value: 255 if value > 24 else 0).histogram()[255]
            # Compare neighboring page pixels in an 8pt context, outside the exact
            # antialiased vector silhouette, so a rectangular patch cannot hide spill.
            ctx_pad_x, ctx_pad_y = round(8 * scale_x), round(8 * scale_y)
            ctx_box = (max(0, box[0] - ctx_pad_x), max(0, box[1] - ctx_pad_y),
                       min(background.width, box[2] + ctx_pad_x), min(background.height, box[3] + ctx_pad_y))
            original_context, clean_context = background.crop(ctx_box), clean_background.crop(ctx_box)
            context_ink = Image.new("L", original_context.size, 0)
            context_left, context_top = bbox[0] - ctx_box[0] / scale_x, bbox[1] - ctx_box[1] / scale_y
            ctx_bbox = [ctx_box[0] / scale_x, ctx_box[1] / scale_y,
                        ctx_box[2] / scale_x, ctx_box[3] / scale_y]
            context_rgba = render_svg(svg_for_target(variant, target, ctx_bbox, alpha_only=True), scale_x, scale_y)
            if context_rgba.size != original_context.size:
                raise ValueError("Movement context evidence did not align with the source raster.")
            context_ink = context_rgba.getchannel("A").point(lambda value: 255 if value > 8 else 0).filter(ImageFilter.MaxFilter(3))
            context_outside_diffs = masked_diff_pixels(original_context, clean_context, context_ink)
            if underlay_outside_diffs or context_outside_diffs or iou < .86:
                raise ValueError(f"p.21 local underlay check failed: outside patch diffs={underlay_outside_diffs}, context diffs={context_outside_diffs}, vector IoU={iou:.4f}.")
            filename = target["mask"]["url"].rsplit("/", 1)[-1]
            mask_crops.append((filename, clean_crop))
            rebuilt_page.paste(rebuilt, (box[0], box[1]))
            metrics.append({"candidateId": target["candidateId"], "drawingIndices": target["drawingIndices"],
                            "bboxPt": target["bbox"], "maskBBoxPt": bbox, "pixelBox": box,
                            "sourceInkPixels": source_hist, "semanticInkPixels": svg_hist,
                            "semanticVectorIoU": round(iou, 5), "underlayDiffPixelsOutsideSilhouette": underlay_outside_diffs,
                            "contextOutsideMaskDiffPixels": context_outside_diffs,
                            "checkedOutsidePixels": outside_pixels, "sourceVsSemanticDiffPixels": changed,
                            "sourceBaselinePt": target["sourceBaselinePt"], "blockId": target["blockId"], "lineId": target["lineId"]})
            scale = 8
            row = Image.new("RGB", (original_crop.width * scale * 3 + 48, original_crop.height * scale + 48), "#f4f0e8")
            from PIL import ImageDraw
            draw = ImageDraw.Draw(row)
            draw.text((8, 4), "Original PDF raster", fill="#111111")
            draw.text((16 + original_crop.width * scale, 4), "Original pre-text underlay", fill="#111111")
            draw.text((24 + original_crop.width * scale * 2, 4), "Underlay + semantic vector", fill="#111111")
            row.paste(original_crop.resize((original_crop.width * scale, original_crop.height * scale), Image.Resampling.NEAREST), (8, 24))
            row.paste(clean_crop.resize((clean_crop.width * scale, clean_crop.height * scale), Image.Resampling.NEAREST),
                      (16 + original_crop.width * scale, 24))
            row.paste(rebuilt.resize((rebuilt.width * scale, rebuilt.height * scale), Image.Resampling.NEAREST),
                      (24 + original_crop.width * scale * 2, 24))
            visual_rows.append(row)

    first = placements[0]
    source_symbol_def = source_symbol(variant, first, first["sourceBaselinePt"])
    registry_text = registry_bytes.decode("utf-8")
    newline = "\r\n" if "\r\n" in registry_text else "\n"
    close_bracket = registry_text.rfind("]")
    if close_bracket < 0:
        raise ValueError("Could not find the source symbol registry's final array delimiter.")
    entry_text = json.dumps(source_symbol_def, ensure_ascii=False, indent=2)
    entry_text = newline.join("  " + line for line in entry_text.splitlines())
    registry_after = registry_text[:close_bracket].rstrip() + "," + newline + entry_text + newline + registry_text[close_bracket:]
    new_elements = [
        {"id": target["id"], "symbolId": SYMBOL_ID, "sourceRendering": "semantic-inline",
         "bbox": target["bbox"], "drawingIndices": target["drawingIndices"], "anchor": target["anchor"],
         "metrics": target["metrics"], "mask": target["mask"],
         "provenance": {"auditId": "source-pdf-mapping-2026-10-23-p21", "candidateId": target["candidateId"],
                        "sourcePdfSha256": EXPECTED_PDF_SHA256, "sourceObjects": target["drawingIndices"],
                        "underlayStreamXref": EXPECTED_CONTENT_XREF, "sourceMeaning": "Movement cost pictogram"}}
        for target in placements]
    sidecar_after = {"schemaVersion": 1, "elements": [*sidecar["elements"], *new_elements]}
    evidence_dir = EVIDENCE if args.apply else DRY_RUN
    evidence_dir.mkdir(parents=True, exist_ok=True)
    comparison = Image.new("RGB", (max(row.width for row in visual_rows), sum(row.height for row in visual_rows)), "#f4f0e8")
    y = 0
    for row in visual_rows:
        comparison.paste(row, (0, y)); y += row.height
    comparison.save(evidence_dir / "p021-movement-before-after-same-scale.png")
    clean_background.save(evidence_dir / "p021-original-pretext-underlay.png", quality=95)
    rebuilt_page.save(evidence_dir / "p021-background-with-semantic-movement.png", quality=95)
    manifest = {"status": "preflight_passed" if not args.apply else "applied_source_inline_mapping",
                "page": 21, "symbolId": SYMBOL_ID, "symbolName": "Movement icon",
                "sourcePdfSha256": EXPECTED_PDF_SHA256, "contentStreamXref": EXPECTED_CONTENT_XREF,
                "preTextForms": ["Fm0", "Fm1", "Fm2"], "backgroundSha256": sha256(BACKGROUND.read_bytes()),
                "hypothesis": "Both red Movement pictograms are separate PDF vector paths painted into the p.21 page raster at the matching Movement labels.",
                "method": "Replace only each confirmed vector silhouette with its original pre-text PDF underlay crop and a semantic SVG reconstructed from the exact source paths.",
                "filesChanged": ([str(SIDECAR_PATH.relative_to(ROOT)), str(REGISTRY_PATH.relative_to(ROOT)),
                                  *[str(PAGE / name) for name, _ in mask_crops]] if args.apply else []),
                "noPayloadOrTranslationProposalWrite": True, "mappings": metrics,
                "rollback": "Restore the prior (absent) p.21 inline_elements.json and sourceSymbols.json from version control; remove the two named mask PNGs. Original PDF and background.webp are unchanged."}
    (evidence_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.apply:
        for filename, crop in mask_crops:
            crop.save(PAGE / filename)
        REGISTRY_PATH.write_text(registry_after, encoding="utf-8", newline="")
        SIDECAR_PATH.write_text(json.dumps(sidecar_after, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="")
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "symbolId": SYMBOL_ID,
                      "evidence": str(evidence_dir), "mappings": metrics,
                      "registeredPaths": len(variant)}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
