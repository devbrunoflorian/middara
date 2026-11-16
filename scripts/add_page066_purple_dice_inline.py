"""Map four prose purple dice on p.66 to semantic inline objects.

The source PDF and its existing page background are read-only. A clean local
patch is rendered from the page's original pre-text Form XObject invocation;
the registry stores the matching vector variant. Dry-run writes evidence only
under tmp. --apply updates the p.66 sidecar, registry variant, and four masks.
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
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = ROOT / "apps/web/public/pages/page_066"
BACKGROUND = PAGE / "background.webp"
DOM_PATH = PAGE / "page_066_dom.json"
SIDECAR_PATH = PAGE / "inline_elements.json"
REGISTRY_PATH = ROOT / "apps/web/src/symbols/sourceSymbols.json"
EVIDENCE = ROOT / "output/proofs/translation-readiness-2026-10-23/p66-semantic-dice-v2"
DRY_RUN = ROOT / "tmp/p66-semantic-dice-dry-run-v2"
EXPECTED_PDF_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
EXPECTED_CONTENT_XREF = 58163
VARIANT = "purple-p66-prose-die-source"
APPEARANCE_KEY = "purple-p66-prose-die-source-v1"
OUTER_STROKE_PT = 1.2640000581741333

TARGETS = [
    dict(id="p66-purple-001", candidateId="p066-v188-191-n4",
         bbox=[416.4739990234375, 409.0299072265625, 427.96197509765625, 422.2889099121094],
         drawingIndices=[188, 189, 190, 191], blockId="block_16", lineId="line_16_0",
         spanIndex=0, ownerSpanIndex=0, side="before", expectedSpan=" Conviction Dice (", sizePt=10.0),
    dict(id="p66-purple-002", candidateId="p066-v196-199-n4",
         bbox=[665.9085083007812, 570.3762817382812, 677.3965454101562, 583.6353149414062],
         drawingIndices=[196, 197, 198, 199], blockId="block_19", lineId="line_19_2",
         spanIndex=2, ownerSpanIndex=1, side="after", expectedSpan="2 PURPLE", sizePt=9.0),
    dict(id="p66-purple-003", candidateId="p066-v201-204-n4",
         bbox=[504.3844909667969, 641.053466796875, 515.8724975585938, 654.3125],
         drawingIndices=[201, 202, 203, 204], blockId="block_20", lineId="line_20_0",
         spanIndex=1, ownerSpanIndex=1, side="after", expectedSpan="PURPLE ", sizePt=9.0),
    dict(id="p66-purple-004", candidateId="p066-v205-208-n4",
         bbox=[580.6107788085938, 641.053466796875, 592.0988159179688, 654.3125],
         drawingIndices=[205, 206, 207, 208], blockId="block_20", lineId="line_20_1",
         spanIndex=3, ownerSpanIndex=3, side="after", expectedSpan="PURPLE ", sizePt=9.0),
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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


def fmt(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")


def drawing_path(drawing: dict, origin: tuple[float, float]) -> str:
    ox, oy = origin
    commands = []
    current = None
    first_point = None
    last_point = None
    for item in drawing["items"]:
        kind, *points = item
        point = points[0]
        if first_point is None:
            first_point = point
        if current is None or abs(current.x - point.x) > .001 or abs(current.y - point.y) > .001:
            commands.append(f"M {fmt(point.x-ox)} {fmt(point.y-oy)}")
        if kind == "l":
            end = points[1]
            commands.append(f"L {fmt(end.x-ox)} {fmt(end.y-oy)}")
            current = end
        elif kind == "c":
            c1, c2, end = points[1:]
            commands.append(f"C {fmt(c1.x-ox)} {fmt(c1.y-oy)} {fmt(c2.x-ox)} {fmt(c2.y-oy)} {fmt(end.x-ox)} {fmt(end.y-oy)}")
            current = end
        elif kind == "re":
            rect = points[0]
            commands.append(f"M {fmt(rect.x0-ox)} {fmt(rect.y0-oy)} h {fmt(rect.width)} v {fmt(rect.height)} h {fmt(-rect.width)} Z")
            current = None
        elif kind == "qu":
            quad = points[0]
            commands.append(f"M {fmt(quad.ul.x-ox)} {fmt(quad.ul.y-oy)} L {fmt(quad.ur.x-ox)} {fmt(quad.ur.y-oy)} L {fmt(quad.lr.x-ox)} {fmt(quad.lr.y-oy)} L {fmt(quad.ll.x-ox)} {fmt(quad.ll.y-oy)} Z")
            current = quad.ll
        else:
            raise ValueError(f"Unsupported source drawing operator {kind!r}")
        last_point = current
    # A path that returns exactly to its start uses a join rather than two
    # unrelated caps; this also keeps the outer contour's miter consistent.
    if first_point is not None and last_point is not None and abs(first_point.x-last_point.x) < .001 and abs(first_point.y-last_point.y) < .001:
        commands.append("Z")
    return " ".join(commands)


def color_string(value: tuple[float, float, float] | None) -> str:
    if value is None:
        return "none"
    return "rgb(" + ",".join(f"{channel*255:.4f}" for channel in value) + ")"


def variant_from_pdf(drawings: list[dict], target: dict) -> dict:
    x0, y0, x1, y1 = target["bbox"]
    paths = []
    for index in target["drawingIndices"]:
        drawing = drawings[index]
        attrs = {"d": drawing_path(drawing, (x0, y0)), "fill": color_string(drawing.get("fill"))}
        if drawing.get("even_odd"):
            attrs["fillRule"] = "evenodd"
        if drawing.get("color") is not None:
            attrs.update(stroke=color_string(drawing["color"]), strokeWidth=drawing.get("width") or 1,
                         strokeLinecap={0: "butt", 1: "round", 2: "square"}.get((drawing.get("lineCap") or [0])[0], "butt"),
                         strokeLinejoin="round" if drawing.get("lineJoin") == 1 else "miter")
        paths.append(attrs)
    return {"viewBox": [0, 0, x1-x0, y1-y0], "paths": paths,
            "widthEm": (x1-x0)/10, "heightEm": (y1-y0)/10,
            "verticalAlignEm": (y1-y0)/10}


def verify_same_vector_family(drawings: list[dict], target: dict, variant: dict) -> None:
    box = fitz.Rect(target["bbox"])
    outer = drawings[target["drawingIndices"][0]]
    if outer["type"] != "fs" or outer["fill"] is None or outer["color"] is None:
        raise ValueError(f"Expected filled and stroked outer vector in {target['candidateId']}.")
    if not box.contains(outer["rect"]) and not outer["rect"].contains(box):
        raise ValueError(f"PDF outer vector bounds changed for {target['candidateId']}.")
    if abs(outer["rect"].width - variant["viewBox"][2]) > .003 or abs(outer["rect"].height - variant["viewBox"][3]) > .003:
        raise ValueError(f"PDF vector size differs from the p.66 source variant for {target['candidateId']}.")
    base = variant_from_pdf(drawings, target)
    expected_fill = tuple(drawings[TARGETS[0]["drawingIndices"][0]]["fill"])
    fill = tuple(outer["fill"])
    if max(abs(a - b) for a, b in zip(fill, expected_fill)) > .002:
        raise ValueError(f"PDF vector fill differs within the p.66 prose family for {target['candidateId']}.")
    if abs((outer.get("width") or 0) - OUTER_STROKE_PT) > .002:
        raise ValueError(f"PDF vector stroke differs from the audited p.66 source appearance for {target['candidateId']}.")
    # The three PDF line drawings must remain within the measured die path.
    for index in target["drawingIndices"][1:]:
        drawing = drawings[index]
        if drawing["type"] != "s" or drawing.get("fill") is not None or not box.contains(drawing["rect"]):
            raise ValueError(f"Unexpected die-face line drawing {index} in {target['candidateId']}.")
        if abs((drawing.get("width") or 0) - .663) > .002:
            raise ValueError(f"PDF die-face line width changed in {target['candidateId']}.")
    if len(base["paths"]) != len(variant["paths"]):
        raise ValueError(f"PDF die path count differs in {target['candidateId']}.")
    for actual, expected in zip(base["paths"], variant["paths"]):
        if actual.keys() != expected.keys() or actual.get("fill") != expected.get("fill") or actual.get("stroke") != expected.get("stroke"):
            raise ValueError(f"PDF die appearance differs within the p.66 prose family for {target['candidateId']}.")
        actual_numbers = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", actual["d"])]
        expected_numbers = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", expected["d"])]
        if len(actual_numbers) != len(expected_numbers) or any(abs(a-b) > .003 for a,b in zip(actual_numbers,expected_numbers)):
            raise ValueError(f"PDF die face geometry differs within the p.66 prose family for {target['candidateId']}.")


def insert_variant_text(registry_bytes: bytes, variant: dict) -> bytes:
    text = registry_bytes.decode("utf-8")
    newline = "\r\n" if "\r\n" in text else "\n"
    normalized = text.replace("\r\n", "\n")
    registry = json.loads(normalized)
    symbol = next((item for item in registry if item.get("id") == "dice.purple"), None)
    if not symbol:
        raise ValueError("Existing dice.purple semantic identity is required.")
    current = symbol["render"].setdefault("variants", {}).get(VARIANT)
    if current is not None:
        if current != variant:
            raise ValueError(f"Registry variant {VARIANT} exists with a different appearance.")
        return registry_bytes
    symbol_pos = normalized.index('"id": "dice.purple"')
    variants_pos = normalized.index('"variants": {\n', symbol_pos) + len('"variants": {\n')
    serialized = json.dumps({VARIANT: variant}, ensure_ascii=False, indent=2)
    inner = serialized.splitlines()[1:-1]
    inserted = "\n".join("        " + line for line in inner) + ",\n"
    updated = normalized[:variants_pos] + inserted + normalized[variants_pos:]
    json.loads(updated)
    return updated.replace("\n", newline).encode("utf-8")


def content_prefix(doc: fitz.Document) -> tuple[int, bytes]:
    page = doc[65]
    contents = page.get_contents()
    if contents != [EXPECTED_CONTENT_XREF]:
        raise ValueError(f"Unexpected p.66 content streams: {contents}")
    stream = doc.xref_stream(contents[0])
    if not stream or b"/Fm0 Do Q EMC" not in stream[:300]:
        raise ValueError("The pre-text artwork Form XObject invocation changed.")
    marker = re.search(rb"/OC BMC\s+BT\s+/P", stream)
    if not marker:
        raise ValueError("Cannot identify the first source text paint after the background form.")
    prefix = stream[:marker.start()]
    if b"/Fm0 Do Q EMC" not in prefix or b" BT " in prefix:
        raise ValueError("The extracted prefix is not the verified pre-text page layer.")
    return contents[0], prefix


def crop_box_for_background(path_box: fitz.Rect, scale_x: float, scale_y: float) -> tuple[list[float], tuple[int, int, int, int]]:
    # Include the complete outer stroke plus one page-background raster pixel
    # for antialiasing. Snap the crop to the immutable background pixel grid.
    margin = OUTER_STROKE_PT / 2
    x0 = math.floor((path_box.x0 - margin) * scale_x) - 1
    y0 = math.floor((path_box.y0 - margin) * scale_y) - 1
    x1 = math.ceil((path_box.x1 + margin) * scale_x) + 1
    y1 = math.ceil((path_box.y1 + margin) * scale_y) + 1
    pixel_box = (x0, y0, x1, y1)
    points = [x0 / scale_x, y0 / scale_y, x1 / scale_x, y1 / scale_y]
    return points, pixel_box


def context_box_for_background(path_box: fitz.Rect, scale_x: float, scale_y: float,
                                margin_pt: float = 8.0) -> tuple[list[float], tuple[int, int, int, int]]:
    """Return a snapped context crop large enough to measure the true exterior ring."""
    x0 = math.floor((path_box.x0 - margin_pt) * scale_x)
    y0 = math.floor((path_box.y0 - margin_pt) * scale_y)
    x1 = math.ceil((path_box.x1 + margin_pt) * scale_x)
    y1 = math.ceil((path_box.y1 + margin_pt) * scale_y)
    pixel_box = (x0, y0, x1, y1)
    return [x0 / scale_x, y0 / scale_y, x1 / scale_x, y1 / scale_y], pixel_box


def svg_for_target(variant: dict, target: dict, crop_bbox: list[float]) -> bytes:
    left, top, _, _ = crop_bbox
    width = crop_bbox[2] - left
    height = crop_bbox[3] - top
    root = ET.Element("svg", xmlns="http://www.w3.org/2000/svg",
                      width=f"{width:.8f}pt", height=f"{height:.8f}pt",
                      viewBox=f"0 0 {width:.8f} {height:.8f}", overflow="visible")
    group = ET.SubElement(root, "g", transform=f"translate({target['bbox'][0]-left:.8f} {target['bbox'][1]-top:.8f})")
    for path in variant["paths"]:
        attrs = {"d": path["d"], "fill": path["fill"]}
        if "stroke" in path:
            attrs.update(stroke=path["stroke"], **{"stroke-width": str(path["strokeWidth"]),
                "stroke-linecap": path.get("strokeLinecap", "butt"),
                "stroke-linejoin": path.get("strokeLinejoin", "miter")})
        if "fillRule" in path:
            attrs["fill-rule"] = path["fillRule"]
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
    diff = max_rgb_diff(a, b)
    binary = diff.point(lambda value: 255 if value > threshold else 0)
    outside = ImageChops.invert(allowed.convert("L"))
    return ImageChops.multiply(binary, outside).histogram()[255]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not PDF.is_file() or not BACKGROUND.is_file():
        raise FileNotFoundError(PDF if not PDF.is_file() else BACKGROUND)
    pdf_bytes = PDF.read_bytes()
    if sha256(pdf_bytes) != EXPECTED_PDF_SHA256:
        raise ValueError("The source PDF hash differs from the audit evidence; re-check all targets.")

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    sidecar_bytes = SIDECAR_PATH.read_bytes()
    sidecar = json.loads(sidecar_bytes)
    registry_bytes = REGISTRY_PATH.read_bytes()
    registry = json.loads(registry_bytes.decode("utf-8"))
    background = Image.open(BACKGROUND).convert("RGB")
    if background.size != (1710, 1710):
        raise ValueError(f"p.66 background pixel dimensions changed: {background.size}")
    if any((element.get("provenance") or {}).get("candidateId") == target["candidateId"]
           or element.get("id") == target["id"] for element in sidecar["elements"] for target in TARGETS):
        raise ValueError("Refusing to duplicate one of the four p.66 semantic mappings.")
    with fitz.open(PDF) as source:
        source_page = source[65]
        page_width, page_height = source_page.rect.width, source_page.rect.height
        scale_x, scale_y = background.width / page_width, background.height / page_height
        drawings = source_page.get_drawings()
        variant = variant_from_pdf(drawings, TARGETS[0])
        current_variant = next(symbol for symbol in registry if symbol["id"] == "dice.purple")["render"].get("variants", {}).get(VARIANT)
        if current_variant is not None and current_variant != variant:
            raise ValueError(f"Registry variant {VARIANT} exists but differs from the p.66 source vector.")
        dom_indices = {block["id"]: index for index, block in enumerate(dom["blocks"])}
        for target in TARGETS:
            if target["blockId"] not in dom_indices:
                raise ValueError(f"Missing DOM owner block {target['blockId']}")
            target["blockIndex"] = dom_indices[target["blockId"]]
            block = dom["blocks"][target["blockIndex"]]
            line = next((line for line in block["lines"] if line["id"] == target["lineId"]), None)
            if line is None or target["spanIndex"] >= len(line["spans"]):
                raise ValueError(f"DOM anchor moved: {target['blockId']}/{target['lineId']}:{target['spanIndex']}")
            owner_span = line["spans"][target["ownerSpanIndex"]]
            if owner_span.get("text") != target["expectedSpan"] or abs(owner_span.get("size", 0) - target["sizePt"]) > .02:
                raise ValueError(f"Unexpected source anchor at {target['lineId']}:{target['ownerSpanIndex']}: {owner_span.get('text')!r}")
            if target["side"] == "after" and not line["spans"][target["spanIndex"]].get("text", "").isspace():
                if target["spanIndex"] != target["ownerSpanIndex"]:
                    raise ValueError(f"Expected the separately extracted source space before {target['candidateId']}.")
            if any(index >= len(drawings) for index in target["drawingIndices"]):
                raise ValueError(f"Missing source drawings for {target['candidateId']}.")
            path_box = fitz.Rect(target["bbox"])
            if not path_box.contains(drawings[target["drawingIndices"][0]]["rect"]):
                raise ValueError(f"Source path geometry moved for {target['candidateId']}.")
            verify_same_vector_family(drawings, target, variant)
            target["metrics"] = dict(widthEm=path_box.width / target["sizePt"],
                heightEm=path_box.height / target["sizePt"],
                verticalAlignEm=(path_box.y1 - source_baseline(source_page, owner_span)) / target["sizePt"],
                advanceEm=path_box.width / target["sizePt"], renderVariant=VARIANT,
                sourceAppearanceKey=APPEARANCE_KEY)
            target["anchor"] = dict(blockId=target["blockId"], blockIndex=target["blockIndex"],
                lineId=target["lineId"], spanIndex=target["spanIndex"], side=target["side"],
                sizePt=target["sizePt"], ownerSpanRef={"lineId": target["lineId"], "spanIndex": target["ownerSpanIndex"]})
            if target["side"] == "after":
                prior = line["spans"][target["spanIndex"]]
                target["anchor"]["gapPt"] = round(path_box.x0 - prior["bbox"][2], 6)
                if abs(target["anchor"]["gapPt"] - .632) > .02:
                    raise ValueError(f"Unexpected post-text gap for {target['candidateId']}: {target['anchor']['gapPt']}")
            else:
                following = line["spans"][target["spanIndex"]]
                target["anchor"]["trailingGapPt"] = round(following["bbox"][0] - path_box.x1, 6)
                if abs(target["anchor"]["trailingGapPt"] - .632) > .02:
                    raise ValueError(f"Unexpected pre-text gap for {target['candidateId']}: {target['anchor']['trailingGapPt']}")
            target["maskBBox"], target["pixelBox"] = crop_box_for_background(path_box, scale_x, scale_y)

        xref, prefix = content_prefix(source)
        with fitz.open(PDF) as underlay_doc:
            underlay_doc.update_stream(xref, prefix)
            underlay_pix = underlay_doc[65].get_pixmap(matrix=fitz.Matrix(scale_x, scale_y), alpha=False)
            clean_background = Image.frombytes("RGB", (underlay_pix.width, underlay_pix.height), underlay_pix.samples)
        if clean_background.size != background.size:
            raise ValueError(f"Pre-text layer dimensions differ from the page background: {clean_background.size}")

        all_results = []
        rows = []
        mask_crops = []
        mask_files = []
        rebuilt_page = background.copy()
        for target in TARGETS:
            box = target["pixelBox"]
            bbox = target["maskBBox"]
            clean_crop = clean_background.crop(box)
            original_crop = background.crop(box)
            overlay = render_svg(svg_for_target(variant, target, bbox), scale_x, scale_y)
            overlay_size = overlay.size
            if overlay.size != clean_crop.size:
                raise ValueError(f"SVG raster dimensions {overlay.size} do not match source-grid crop {clean_crop.size}; refusing to rescale symbol geometry.")
            rebuilt = Image.alpha_composite(clean_crop.convert("RGBA"), overlay).convert("RGB")
            # Inspect a wider context for adjacent content, then enforce that
            # every changed underlay pixel inside the actual rectangular patch
            # belongs to the antialiased outer-die silhouette. A bbox allowance
            # can cover the whole crop and make a zero-diff result meaningless.
            context_bbox, context_pixels = context_box_for_background(fitz.Rect(target["bbox"]), scale_x, scale_y)
            original_context = background.crop(context_pixels)
            clean_context = clean_background.crop(context_pixels)
            outer_only = {**variant, "paths": variant["paths"][:1]}
            alpha_context = render_svg(svg_for_target(outer_only, target, context_bbox), scale_x, scale_y).getchannel("A")
            if alpha_context.size != clean_context.size:
                raise ValueError(f"Outer-path alpha dimensions {alpha_context.size} do not match context {clean_context.size} for {target['candidateId']}.")
            # Include antialias fringe and one source-grid pixel around the real
            # vector ink. Require a nonempty exterior ring both in the patch and
            # the surrounding context, and measure them separately.
            die_ink_context = alpha_context.point(lambda value: 255 if value > 8 else 0).filter(ImageFilter.MaxFilter(3))
            context_exterior_pixels = ImageChops.invert(die_ink_context).histogram()[255]
            if context_exterior_pixels <= 100:
                raise ValueError(f"Exterior context check is vacuous for {target['candidateId']}: only {context_exterior_pixels} pixels outside the rendered die silhouette.")
            context_outside_diffs = masked_diff_pixels(original_context, clean_context, die_ink_context, threshold=16)
            x0, y0 = box[0] - context_pixels[0], box[1] - context_pixels[1]
            patch_alpha = alpha_context.crop((x0, y0, x0 + clean_crop.width, y0 + clean_crop.height))
            if patch_alpha.size != clean_crop.size:
                raise ValueError(f"Patch alpha dimensions {patch_alpha.size} do not match cleanup patch {clean_crop.size} for {target['candidateId']}.")
            die_ink_patch = patch_alpha.point(lambda value: 255 if value > 8 else 0).filter(ImageFilter.MaxFilter(3))
            patch_exterior_pixels = ImageChops.invert(die_ink_patch).histogram()[255]
            if patch_exterior_pixels <= 100:
                raise ValueError(f"Cleanup patch exterior check is vacuous for {target['candidateId']}: only {patch_exterior_pixels} pixels outside the rendered die silhouette.")
            underlay_outside_diffs = masked_diff_pixels(original_crop, clean_crop, die_ink_patch, threshold=16)
            source_delta = max_rgb_diff(original_crop, clean_crop)
            source_mask = source_delta.point(lambda value: 255 if value > 40 else 0)
            overlay_mask = overlay.getchannel("A").point(lambda value: 255 if value > 24 else 0)
            # Source image and overlay have the same pixel coordinates after the
            # full page transform. Count source-vs-patch symbol ink agreement.
            union = ImageChops.lighter(source_mask, overlay_mask).histogram()[255]
            intersection = ImageChops.darker(source_mask, overlay_mask).histogram()[255]
            iou = intersection / union if union else 0.0
            pixel_diff = max_rgb_diff(original_crop, rebuilt)
            changed_pixels = pixel_diff.point(lambda value: 255 if value > 24 else 0).histogram()[255]
            target["mask"] = {"url": f"/pages/page_066/inline-element-mask-{len(sidecar['elements']) + len(mask_crops):03d}.png",
                              "bbox": bbox}
            filename = target["mask"]["url"].rsplit("/", 1)[-1]
            mask_crops.append((target, clean_crop, filename))
            mask_files.append(filename)
            rebuilt_page.paste(rebuilt, (box[0], box[1]))
            all_results.append(dict(candidateId=target["candidateId"], pixelBox=box, maskBBox=bbox,
                sourcePixelsDifferingFromCleanPatch=source_mask.histogram()[255],
                semanticVectorIoU=round(iou, 4), underlayDiffPixelsOutsideDie=underlay_outside_diffs,
                exteriorPixelsChecked=patch_exterior_pixels,
                contextExteriorPixelsChecked=context_exterior_pixels,
                contextOutsideMaskDiffPixels=context_outside_diffs,
                contextPixelBox=context_pixels, contextPixelSize=clean_context.size,
                sourceVsSemanticDiffPixelsAt24=changed_pixels,
                vectorOverlaySize=overlay_size,cleanPatchSize=clean_crop.size,
                sourceInkBounds=source_mask.getbbox(),semanticInkBounds=overlay_mask.getbbox(),
                sourceInkPixels=source_mask.histogram()[255],semanticInkPixels=overlay_mask.histogram()[255],
                sourcePageBBox=target["bbox"], drawingIndices=target["drawingIndices"]))

            scale = 6
            row = Image.new("RGB", (clean_crop.width * scale * 3 + 48, clean_crop.height * scale + 48), "#f4f0e8")
            draw = ImageDraw.Draw(row)
            draw.text((8, 4), "PDF source", fill="#111111")
            draw.text((16 + clean_crop.width * scale, 4), "Original PDF underlay", fill="#111111")
            draw.text((24 + clean_crop.width * scale * 2, 4), "Underlay + semantic SVG", fill="#111111")
            row.paste(original_crop.resize((clean_crop.width * scale, clean_crop.height * scale), Image.Resampling.NEAREST), (8, 24))
            row.paste(clean_crop.resize((clean_crop.width * scale, clean_crop.height * scale), Image.Resampling.NEAREST),
                      (16 + clean_crop.width * scale, 24))
            row.paste(rebuilt.resize((clean_crop.width * scale, clean_crop.height * scale), Image.Resampling.NEAREST),
                      (24 + clean_crop.width * scale * 2, 24))
            rows.append(row)
            if not args.apply and target is TARGETS[0]:
                row.save(ROOT / "tmp/p66-semantic-dice-debug-first.png")
                original_crop.save(ROOT / "tmp/p66-semantic-dice-debug-source.png")
                clean_crop.save(ROOT / "tmp/p66-semantic-dice-debug-underlay.png")
                overlay.save(ROOT / "tmp/p66-semantic-dice-debug-overlay.png")
                source_mask.save(ROOT / "tmp/p66-semantic-dice-debug-sourcemask.png")
                overlay_mask.save(ROOT / "tmp/p66-semantic-dice-debug-vectormask.png")

        # Confirm the composited symbol layer doesn't alter other page pixels.
        total_outside_diffs = sum(result["underlayDiffPixelsOutsideDie"] for result in all_results)
        min_iou = min(result["semanticVectorIoU"] for result in all_results)
        if total_outside_diffs != 0 or min_iou < .86:
            raise ValueError(f"P.66 visual preflight failed closed: outside-die diffs={total_outside_diffs}, min IoU={min_iou}; metrics={all_results}.")

    registry_after = insert_variant_text(registry_bytes, variant)
    updated_registry = json.loads(registry_after.decode("utf-8"))
    registered_variant = next(s for s in updated_registry if s["id"] == "dice.purple")["render"]["variants"][VARIANT]
    if registered_variant != variant:
        raise ValueError("The prepared source vector variant failed its registry round-trip.")

    evidence_dir = EVIDENCE if args.apply else DRY_RUN
    evidence_dir.mkdir(parents=True, exist_ok=True)
    comparison = Image.new("RGB", (max(row.width for row in rows), sum(row.height for row in rows)), "#f4f0e8")
    y = 0
    for row in rows:
        comparison.paste(row, (0, y))
        y += row.height
    comparison.save(evidence_dir / "p66-purple-dice-underlay-comparison.png")
    clean_background.save(evidence_dir / "p66-original-pretext-underlay.png")
    rebuilt_page.save(evidence_dir / "p66-background-with-semantic-dice.png", quality=95)
    manifest = {"status": "preflight_passed" if not args.apply else "applied_source_inline_mapping",
        "page": 66, "symbolId": "dice.purple", "variant": VARIANT, "appearanceKey": APPEARANCE_KEY,
        "sourcePdfSha256": EXPECTED_PDF_SHA256, "contentStreamXref": EXPECTED_CONTENT_XREF,
        "preTextForm": "Fm0", "p66PageBackgroundSha256": sha256(BACKGROUND.read_bytes()),
        "registryVectorSource": "p66 PDF drawings 188-191; remaining occurrences independently checked for matching faces/fill/strokes",
        "noTranslationProposalOrPayloadWrite": True, "mappings": all_results,
        "maskFiles": mask_files, "svgVariant": variant,
        "filesChanged": ([str(SIDECAR_PATH.relative_to(ROOT)), str(REGISTRY_PATH.relative_to(ROOT)),
                          *[str(PAGE.joinpath(name).relative_to(ROOT)) for name in mask_files]] if args.apply else [])}
    (evidence_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.apply:
        sidecar["elements"].extend({"id": target["id"], "symbolId": "dice.purple", "sourceRendering": "semantic-inline",
            "bbox": target["bbox"], "drawingIndices": target["drawingIndices"], "anchor": target["anchor"],
            "metrics": target["metrics"], "mask": target["mask"],
            "provenance": {"auditId": "manual-source-mapping-2026-10-23-p66", "candidateId": target["candidateId"],
                "sourcePdfSha256": EXPECTED_PDF_SHA256, "sourceObjects": target["drawingIndices"],
                "underlayStreamXref": EXPECTED_CONTENT_XREF, "appearanceKey": APPEARANCE_KEY}}
            for target, _, _ in mask_crops)
        # All checks finish before any project file is changed.
        for target, crop, filename in mask_crops:
            crop.save(PAGE / filename)
        REGISTRY_PATH.write_bytes(registry_after)
        SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "count": len(TARGETS),
        "variant": VARIANT, "comparison": all_results, "evidence": str(evidence_dir)}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
