#!/usr/bin/env python3
"""Map detected SOURCE↔viewer delta regions to structural object candidates.

This QA mapper does not read annotations or family labels. Geometry finds
candidates; persistent IDs, explicit DOM attributes, text evidence, drawing
sequence, and object metadata decide whether an association is usable.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
import unicodedata

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SIDEcars = ROOT / "apps/web/public/pages"
DEFAULT_PDF = Path("C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
REFERENCE_DARK = (0.13669, 0.12195, 0.12529)
WHITE = (1.0, 1.0, 1.0)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def norm_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", value).strip()


def bbox_area(box: list[float] | tuple[float, ...] | None) -> float:
    if not box or len(box) != 4:
        return 0.0
    return max(0.0, float(box[2]) - float(box[0])) * max(0.0, float(box[3]) - float(box[1]))


def overlap_metrics(region: list[float], box: list[float] | tuple[float, ...] | None) -> dict[str, float]:
    if not box or len(box) != 4:
        return {"intersectionPt2": 0.0, "regionCoverage": 0.0, "objectCoverage": 0.0, "iou": 0.0}
    ix0, iy0 = max(region[0], box[0]), max(region[1], box[1])
    ix1, iy1 = min(region[2], box[2]), min(region[3], box[3])
    intersection = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
    region_area = bbox_area(region)
    object_area = bbox_area(box)
    union = region_area + object_area - intersection
    return {
        "intersectionPt2": round(intersection, 6),
        "regionCoverage": round(intersection / region_area, 6) if region_area else 0.0,
        "objectCoverage": round(intersection / object_area, 6) if object_area else 0.0,
        "iou": round(intersection / union, 6) if union else 0.0,
    }


def bbox_union(boxes: list[list[float]]) -> list[float] | None:
    boxes = [box for box in boxes if box and len(box) == 4]
    if not boxes:
        return None
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def colour_close(value: Any, expected: tuple[float, float, float], tolerance: float = 0.035) -> bool:
    return bool(value and len(value) >= 3 and max(abs(float(value[i]) - expected[i]) for i in range(3)) <= tolerance)


def drawing_record(page_number: int, index: int, drawing: dict[str, Any]) -> dict[str, Any]:
    rect = drawing.get("rect")
    box = [round(float(v), 6) for v in rect] if rect else None
    return {
        "id": f"pdf:p{page_number}:drawing:{index}",
        "objectType": "SOURCE_DRAWING",
        "identityPersistent": True,
        "bboxPt": box,
        "drawingIndex": index,
        "paintSequence": drawing.get("seqno"),
        "pathCount": len(drawing.get("items", [])),
        "drawingType": drawing.get("type"),
        "fill": list(drawing["fill"]) if drawing.get("fill") is not None else None,
        "stroke": list(drawing["color"]) if drawing.get("color") is not None else None,
        "fillOpacity": drawing.get("fill_opacity"),
        "strokeOpacity": drawing.get("stroke_opacity"),
        "evidence": ["PDF drawing index", "paint sequence", "bbox", "path/fill/stroke metadata"],
    }


def drawing_group_candidates(page_number: int, drawings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Identify candidate glyph groups only when white paths are enclosed by a small dark backing in paint order.

    This creates SOURCE_DRAWING_GROUP with semanticIdentity UNKNOWN. It never
    assigns a registry symbol ID from appearance.
    """
    candidates: list[dict[str, Any]] = []
    for backing_index, backing in enumerate(drawings):
        backing_box = drawing_record(page_number, backing_index, backing)["bboxPt"]
        if not backing_box:
            continue
        width = backing_box[2] - backing_box[0]
        height = backing_box[3] - backing_box[1]
        if not (5.0 <= width <= 22.0 and 5.0 <= height <= 22.0 and 0.72 <= width / max(height, 0.001) <= 1.38):
            continue
        if not colour_close(backing.get("fill"), REFERENCE_DARK) or backing.get("color") is not None:
            continue
        seq = backing.get("seqno")
        if seq is None:
            continue
        children = []
        child_indices = []
        for index, child in enumerate(drawings):
            if index == backing_index or child.get("seqno") is None:
                continue
            child_box = drawing_record(page_number, index, child)["bboxPt"]
            if not child_box or not colour_close(child.get("fill"), WHITE) or child.get("color") is not None:
                continue
            if not (seq < child["seqno"] <= seq + 12):
                continue
            margin = 0.85
            contained = (
                child_box[0] >= backing_box[0] - margin
                and child_box[1] >= backing_box[1] - margin
                and child_box[2] <= backing_box[2] + margin
                and child_box[3] <= backing_box[3] + margin
            )
            if not contained:
                continue
            child_indices.append(index)
            children.append({"drawingIndex": index, "paintSequence": child.get("seqno"), "bboxPt": child_box, "pathCount": len(child.get("items", []))})
        if not children:
            continue
        candidates.append({
            "id": f"pdf:p{page_number}:drawing-group:backing-{backing_index}",
            "objectType": "SOURCE_DRAWING_GROUP",
            "identityPersistent": True,
            "semanticIdentity": "UNKNOWN",
            "bboxPt": backing_box,
            "backingDrawingIndex": backing_index,
            "backingPaintSequence": seq,
            "memberDrawingIndices": [backing_index, *child_indices],
            "children": children,
            "evidence": ["small dark backing drawing", "white path drawings contained by backing", "ordered PDF paint sequence"],
        })
    return candidates


def trace_spans(page: pymupdf.Page) -> list[dict[str, Any]]:
    result = []
    for trace_index, trace in enumerate(page.get_texttrace()):
        chars = trace.get("chars", [])
        text = "".join(chr(item[0]) for item in chars if item and isinstance(item[0], int))
        if not text:
            continue
        origin = list(chars[0][2]) if chars and len(chars[0]) > 2 else None
        result.append({
            "traceIndex": trace_index,
            "text": text,
            "normalizedText": norm_text(text),
            "bboxPt": [round(float(v), 6) for v in trace["bbox"]],
            "originPt": [round(float(v), 6) for v in origin] if origin else None,
            "font": trace.get("font"),
            "sizePt": round(float(trace.get("size", 0)), 6),
            "flags": trace.get("flags"),
            "paintSequence": trace.get("seqno"),
            "characterCount": len(chars),
        })
    return result


def span_trace_match(span: dict[str, Any], traces: list[dict[str, Any]]) -> dict[str, Any] | None:
    text = norm_text(span.get("text", ""))
    bbox = span.get("bbox")
    ranked = []
    for trace in traces:
        similarity = SequenceMatcher(None, text, trace["normalizedText"]).ratio() if text else 0.0
        if text and text in trace["normalizedText"]:
            similarity = max(similarity, 0.95)
        if norm_text(span.get("font", "")) == norm_text(trace.get("font", "")) and abs(float(span.get("size", 0)) - trace["sizePt"]) <= 0.2:
            similarity += 0.05
        metrics = overlap_metrics(bbox, trace["bboxPt"])
        ranked.append((similarity + metrics["iou"] * 0.2, trace))
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    if not ranked or ranked[0][0] < 0.55:
        return None
    trace = ranked[0][1]
    return {key: trace[key] for key in ("traceIndex", "originPt", "font", "sizePt", "paintSequence", "characterCount", "bboxPt")}


def text_source_objects(page_number: int, sidecar: dict[str, Any], traces: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    line_objects = []
    span_objects = []
    for block_index, block in enumerate(sidecar.get("blocks", [])):
        block_id = block.get("id")
        block_box = block.get("bbox")
        block_object_id = f"sidecar:p{page_number}:block:{block_id}" if block_id else f"sidecar:p{page_number}:block-index:{block_index}"
        for line_index, line in enumerate(block.get("lines", [])):
            line_id = line.get("id")
            source_line_id = f"sidecar:p{page_number}:block:{block_id}:line:{line_id}" if block_id and line_id else None
            line_spans = line.get("spans", [])
            span_text = "".join(span.get("text", "") for span in line_spans)
            line_boxes = [span.get("bbox") for span in line_spans if span.get("bbox")]
            line_box = line.get("bbox") or bbox_union(line_boxes) or block_box
            line_objects.append({
                "id": source_line_id or f"sidecar:p{page_number}:unknown-line:{block_index}:{line_index}",
                "objectType": "TEXT_LINE" if source_line_id else "UNKNOWN",
                "identityPersistent": bool(source_line_id),
                "bboxPt": [round(float(v), 6) for v in line_box] if line_box else None,
                "blockId": block_id,
                "lineId": line_id,
                "text": span_text,
                "normalizedText": norm_text(span_text),
                "spanCount": len(line_spans),
                "rich": len({(s.get("font"), s.get("size"), s.get("color"), s.get("flags")) for s in line_spans}) > 1,
                "availableX": line.get("availableX"),
                "availableWidth": line.get("availableWidth"),
                "evidence": ["sidecar block ID", "sidecar line ID", "source text", "line bbox"],
                "sourceSpanIds": [],
            })
            for span_index, span in enumerate(line_spans):
                span_id = f"{source_line_id}:span:{span_index}" if source_line_id else None
                flags = int(span.get("flags", 0) or 0)
                rich = bool(flags & (2 | 16)) or "bold" in span.get("font", "").casefold() or "italic" in span.get("font", "").casefold()
                candidate = {
                    "id": span_id or f"sidecar:p{page_number}:unknown-span:{block_index}:{line_index}:{span_index}",
                    "objectType": "RICH_TEXT_RUN" if rich else "TEXT_RUN",
                    "identityPersistent": bool(span_id),
                    "bboxPt": [round(float(v), 6) for v in span["bbox"]] if span.get("bbox") else None,
                    "blockId": block_id,
                    "lineId": line_id,
                    "spanIndex": span_index,
                    "text": span.get("text", ""),
                    "normalizedText": norm_text(span.get("text", "")),
                    "font": span.get("font"),
                    "sizePt": span.get("size"),
                    "color": span.get("color"),
                    "flags": flags,
                    "trace": span_trace_match(span, traces),
                    "evidence": ["sidecar block/line/span position", "source span bbox", "font/style metadata"],
                }
                span_objects.append(candidate)
                if source_line_id:
                    line_objects[-1]["sourceSpanIds"].append(span_id)
    return line_objects, span_objects


def editorial_block_candidates(page_number: int, sidecar: dict[str, Any]) -> list[dict[str, Any]]:
    """Expose stable source blocks as container candidates without selecting them over line/span objects."""
    result = []
    for index, block in enumerate(sidecar.get("blocks", [])):
        block_id = block.get("id")
        lines = block.get("lines", [])
        boxes = [line.get("bbox") for line in lines if line.get("bbox")]
        if not boxes:
            boxes = [span.get("bbox") for line in lines for span in line.get("spans", []) if span.get("bbox")]
        block_box = block.get("bbox") or bbox_union(boxes)
        text = " ".join("".join(span.get("text", "") for span in line.get("spans", [])) for line in lines)
        result.append({
            "id": f"sidecar:p{page_number}:block:{block_id}" if block_id else f"sidecar:p{page_number}:unknown-block:{index}",
            "objectType": "EDITORIAL_BLOCK" if block_id else "UNKNOWN",
            "identityPersistent": bool(block_id),
            "bboxPt": [round(float(v), 6) for v in block_box] if block_box else None,
            "blockId": block_id,
            "text": text,
            "candidateRole": "CONTAINER_ONLY; line/span candidates retain selection priority",
            "evidence": ["sidecar block ID" if block_id else "block index only", "block bbox", "contained source lines/spans"],
        })
    return result


def sidecar_nontext_objects(page_number: int, sidecars_root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    page_dir = sidecars_root / f"page_{page_number:03d}"
    objects = []
    inline = page_dir / "inline_elements.json"
    if inline.exists():
        data = load_json(inline)
        for index, element in enumerate(data.get("elements", [])):
            anchor = element.get("anchor", {})
            objects.append({
                "id": f"sidecar:p{page_number}:inline:{element.get('symbolId','unknown')}:{anchor.get('blockId')}:{anchor.get('lineId')}:{anchor.get('spanIndex', index)}",
                "objectType": "INLINE_SYMBOL",
                "identityPersistent": bool(element.get("symbolId")),
                "semanticIdentity": element.get("symbolId", "UNKNOWN"),
                "bboxPt": element.get("bbox"),
                "drawingIndices": element.get("drawingIndices", []),
                "anchor": anchor,
                "metrics": element.get("metrics"),
                "evidence": ["inline sidecar symbolId", "anchor block/line/span", "source occurrence bbox"],
            })
    images = page_dir / f"page_{page_number:03d}_dom.json"
    if images.exists():
        data = load_json(images)
        for index, image in enumerate(data.get("images", [])):
            role = (image.get("role") or "").casefold()
            typ = (
                "PAGE_FURNITURE" if role in {"background", "page-background", "page-furniture", "furniture"}
                else "DIAGRAM_ELEMENT" if "diagram" in role
                else "CARD_ARTWORK" if "card" in role or "component" in role
                else "RASTER_IMAGE"
            )
            objects.append({
                "id": f"sidecar:p{page_number}:image-placement:{index}",
                "objectType": typ,
                "identityPersistent": True,
                "bboxPt": image.get("bbox"),
                "assetUrl": image.get("url"),
                "role": image.get("role"),
                "zIndex": image.get("zIndex"),
                "evidence": ["page sidecar image placement ID", "source bbox", "role"],
            })
    return objects, []


def viewer_sidecar_candidates(page_number: int, sidecars_root: Path, overlay_override: Path | None = None) -> list[dict[str, Any]]:
    page_dir = sidecars_root / f"page_{page_number:03d}"
    candidates = []
    path = overlay_override if overlay_override and page_number == 67 else page_dir / "fidelity_overlays.json"
    if path.exists():
        data = load_json(path)
        for index, overlay in enumerate(data.get("overlays", [])):
            url = overlay.get("url", "")
            candidates.append({
                "id": f"overlay:p{page_number}:{overlay.get('region') or overlay.get('auditId') or index}:{url}",
                "objectType": "SVG_OVERLAY" if url.casefold().endswith(".svg") else "RASTER_IMAGE",
                "identityPersistent": bool(url),
                "assetUrl": url,
                "bboxPt": overlay.get("bbox"),
                "region": overlay.get("region"),
                "auditId": overlay.get("auditId"),
                "sourcePdfPage": overlay.get("sourcePdfPage"),
                "category": overlay.get("category"),
                "evidence": ["fidelity overlay ID/asset reference", "declared bbox", "audit/region metadata"],
            })
    return candidates


def read_runtime_manifest(manifest_path: Path | None) -> tuple[dict[int, dict[str, Any]], Path | None]:
    if not manifest_path or not manifest_path.exists():
        return {}, None
    manifest = load_json(manifest_path)
    root = manifest_path.parent
    by_page = {}
    for entry in manifest.get("captures", []):
        object_file = entry.get("objectManifest")
        if not object_file:
            continue
        obj_path = root / object_file
        if obj_path.exists():
            by_page[entry["page"]] = load_json(obj_path)
    return by_page, root


def runtime_viewer_objects(page_number: int, runtime_page: dict[str, Any] | None, page_width_pt: float, sidecars_root: Path) -> list[dict[str, Any]]:
    if not runtime_page:
        return []
    css_width = float(runtime_page.get("pageRectCssPx", {}).get("width", 0))
    css_height = float(runtime_page.get("pageRectCssPx", {}).get("height", 0))
    scale_x = page_width_pt / css_width if css_width else 1.0
    sidecars = sidecars_root / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
    page_data = load_json(sidecars) if sidecars.exists() else {}
    page_height_pt = float(page_data.get("height", page_width_pt))
    scale_y = page_height_pt / css_height if css_height else 1.0

    def convert_box(box: dict[str, float]) -> list[float]:
        return [
            round(box["x"] * scale_x, 6), round(box["y"] * scale_y, 6),
            round((box["x"] + box["width"]) * scale_x, 6), round((box["y"] + box["height"]) * scale_y, 6),
        ]

    objects = []
    for node in runtime_page.get("objects", []):
        objects.append({
            "id": node.get("id"), "objectType": node.get("objectType", "UNKNOWN"),
            "identityPersistent": node.get("idPersistence") == "EXPLICIT_ATTRIBUTE" or bool(node.get("src")),
            "bboxPt": convert_box(node["bboxCssPx"]) if node.get("bboxCssPx") else None,
            "assetUrl": node.get("src"), "text": node.get("text", ""),
            "selector": node.get("selector"), "attrs": node.get("attrs", {}), "refs": node.get("refs", []),
            "computedStyle": node.get("computedStyle", {}), "idPersistence": node.get("idPersistence"),
            "evidence": ["captured runtime DOM element", "bbox", "data attributes/asset reference", "computed style"],
        })
    for node in runtime_page.get("textNodes", []):
        for box in node.get("bboxCssPx", []):
            objects.append({
                "id": node.get("id"), "objectType": node.get("objectType", "TEXT_RUN"),
                "identityPersistent": node.get("idPersistence") == "EXPLICIT_ATTRIBUTE",
                "bboxPt": convert_box(box), "text": node.get("text", ""),
                "selector": node.get("selector"), "sourceLineId": node.get("sourceLineId"),
                "sourceSpanKey": node.get("sourceSpanKey"), "refs": node.get("refs", []),
                "computedStyle": node.get("computedStyle", {}), "idPersistence": node.get("idPersistence"),
                "evidence": ["captured DOM text Range rect", "normalized source/data attributes when present", "computed text style"],
            })
    return objects


def candidate_with_metrics(candidate: dict[str, Any], region_box: list[float]) -> dict[str, Any]:
    metrics = overlap_metrics(region_box, candidate.get("bboxPt"))
    return {**candidate, "intersection": metrics}


def best_candidate(candidates: list[dict[str, Any]], min_coverage: float = 0.55, tie_margin: float = 0.08) -> tuple[dict[str, Any] | None, str]:
    eligible = [c for c in candidates if c["intersection"]["regionCoverage"] >= min_coverage and c.get("identityPersistent", False)]
    eligible.sort(key=lambda c: (c["intersection"]["regionCoverage"], c["intersection"]["iou"]), reverse=True)
    if not eligible:
        return None, "UNKNOWN"
    if len(eligible) > 1:
        a, b = eligible[0]["intersection"], eligible[1]["intersection"]
        coverage_gap = a["regionCoverage"] - b["regionCoverage"]
        iou_ratio = a["iou"] / max(b["iou"], 1e-6)
        if abs(coverage_gap) <= tie_margin and iou_ratio < 2.0:
            return None, "AMBIGUOUS"
    return eligible[0], "STRONG"


def _source_candidates(region_box: list[float], page_number: int, sidecar: dict[str, Any], lines: list[dict[str, Any]], spans: list[dict[str, Any]], editorial_blocks: list[dict[str, Any]], nontext: list[dict[str, Any]], drawings: list[dict[str, Any]], groups: list[dict[str, Any]], image_placements: list[dict[str, Any]], page_area: float) -> tuple[list[dict[str, Any]], dict[str, Any] | None, str, dict[str, Any] | None]:
    all_objects = [*lines, *spans, *editorial_blocks, *nontext, *drawings, *groups, *image_placements]
    candidates = [candidate_with_metrics(obj, region_box) for obj in all_objects if obj.get("bboxPt") and overlap_metrics(region_box, obj["bboxPt"])["intersectionPt2"] > 0]
    span_candidates = [c for c in candidates if c["objectType"] in {"TEXT_RUN", "RICH_TEXT_RUN"}]
    line_candidates = [c for c in candidates if c["objectType"] == "TEXT_LINE"]
    semantic_candidates = [c for c in candidates if c["objectType"] == "INLINE_SYMBOL"]
    group_candidates = [c for c in candidates if c["objectType"] == "SOURCE_DRAWING_GROUP"]
    drawing_candidates = [c for c in candidates if c["objectType"] == "SOURCE_DRAWING"]
    image_candidates = [c for c in candidates if c["objectType"] in {"RASTER_IMAGE", "CARD_ARTWORK", "DIAGRAM_ELEMENT", "PAGE_FURNITURE"}]

    # Broad page/background drawings and images remain visible evidence but do
    # not become object identity merely because the region lies inside them.
    local_drawings = [c for c in drawing_candidates if bbox_area(c.get("bboxPt")) <= page_area * 0.08]
    local_images = [c for c in image_candidates if bbox_area(c.get("bboxPt")) <= page_area * 0.55]
    for candidate in drawing_candidates:
        if candidate not in local_drawings:
            candidate["candidateRole"] = "BROAD_OVERLAP_ONLY"
    for candidate in image_candidates:
        if candidate not in local_images:
            candidate["candidateRole"] = "PAGE_OR_LARGE_IMAGE_OVERLAP_ONLY"

    def choose(cands: list[dict[str, Any]], minimum: float = 0.55) -> tuple[dict[str, Any] | None, str]:
        return best_candidate(cands, minimum)

    # Explicit inline adapter identity is strongest when its occurrence bbox
    # matches the raw region. Otherwise source line/span identity takes priority.
    selected, status = choose(semantic_candidates, 0.35)
    focused_span = None
    if selected is None and status != "AMBIGUOUS":
        # Partial intersection remains useful when the viewer overrun creates
        # part of the pixel delta beyond the source line's right edge.
        selected, status = choose(line_candidates, 0.25)
        focused_span, _ = choose(span_candidates, 0.35)
    if selected is None and status != "AMBIGUOUS":
        # Drawing groups are structural enclosure/paint-order candidates; their
        # semantic symbol identity intentionally stays UNKNOWN.
        selected, status = choose(group_candidates, 0.55)
    if selected is None and status != "AMBIGUOUS":
        selected, status = choose(local_drawings, 0.55)
    if selected is None and status != "AMBIGUOUS":
        selected, status = choose(local_images, 0.65)

    # A delta may cover both white label text and the filled vector capsule
    # behind it. If the raw region tightly follows one persistent, painted
    # drawing more closely than the selected text bbox, prefer that drawing.
    # Keep the text as a candidate; this only resolves a unique, structurally
    # specific bbox match, never a nearest-object guess.
    tight_drawing_matches = []
    if selected and selected.get("objectType") in {"TEXT_LINE", "TEXT_RUN", "RICH_TEXT_RUN"}:
        text_iou = selected["intersection"]["iou"]
        for drawing in local_drawings:
            metrics = drawing["intersection"]
            has_paint_identity = drawing.get("drawingIndex") is not None and drawing.get("paintSequence") is not None
            has_paint = drawing.get("fill") is not None or drawing.get("stroke") is not None
            if (
                has_paint_identity and has_paint
                and metrics["regionCoverage"] >= 0.90
                and metrics["iou"] >= 0.70
                and metrics["iou"] >= text_iou * 1.50
            ):
                tight_drawing_matches.append(drawing)
        tight_drawing_matches.sort(key=lambda c: c["intersection"]["iou"], reverse=True)
        if tight_drawing_matches:
            top_iou = tight_drawing_matches[0]["intersection"]["iou"]
            if len(tight_drawing_matches) == 1 or top_iou >= tight_drawing_matches[1]["intersection"]["iou"] * 1.50:
                selected = tight_drawing_matches[0]
                status = "STRONG"
                focused_span = None
            else:
                selected, status = None, "AMBIGUOUS"
                focused_span = None

    # If independent structural candidates are both strong, retain the
    # ambiguity instead of letting category ordering make an identity claim.
    grouped_drawing_ids = {
        member_id
        for candidate in group_candidates
        for member_id in candidate.get("memberDrawingIndices", [])
        if candidate["intersection"]["regionCoverage"] >= 0.55
    }
    ungrouped_local_drawings = [c for c in local_drawings if c.get("drawingIndex") not in grouped_drawing_ids]
    # Paths already included in a source-drawing group are not competing
    # objects. For remaining overlapping object types, reject only if neither
    # candidate is structurally more specific; a broad card/page drawing is a
    # candidate but cannot defeat a uniquely intersecting text span/drawing.
    competing = [
        *[c for c in semantic_candidates if c["intersection"]["regionCoverage"] >= 0.35],
        *[c for c in line_candidates if c["intersection"]["regionCoverage"] >= 0.25],
        *[c for c in group_candidates if c["intersection"]["regionCoverage"] >= 0.55],
        *[c for c in ungrouped_local_drawings if c["intersection"]["regionCoverage"] >= 0.55],
        *[c for c in local_images if c["intersection"]["regionCoverage"] >= 0.65],
    ]
    if selected and selected["objectType"] != "INLINE_SYMBOL":
        selected_metrics = selected["intersection"]
        for other in competing:
            if other["id"] == selected["id"] or other["objectType"] == selected["objectType"]:
                continue
            other_metrics = other["intersection"]
            coverage_close = abs(selected_metrics["regionCoverage"] - other_metrics["regionCoverage"]) <= 0.08
            specificity_ratio = selected_metrics["iou"] / max(other_metrics["iou"], 1e-6)
            other_specificity_ratio = other_metrics["iou"] / max(selected_metrics["iou"], 1e-6)
            tight_drawing_dominates_text = (
                selected.get("objectType") == "SOURCE_DRAWING"
                and other.get("objectType") in {"TEXT_LINE", "TEXT_RUN", "RICH_TEXT_RUN"}
                and specificity_ratio >= 1.50
                and selected_metrics["regionCoverage"] >= 0.90
                and selected_metrics["iou"] >= 0.70
            )
            if coverage_close and max(specificity_ratio, other_specificity_ratio) < 2.0 and not tight_drawing_dominates_text:
                selected, status = None, "AMBIGUOUS"
                break

    return candidates, selected, status, focused_span


def match_viewer_object(source: dict[str, Any] | None, focused_span: dict[str, Any] | None, candidates: list[dict[str, Any]], region_box: list[float], source_status: str) -> tuple[dict[str, Any] | None, str, list[dict[str, Any]]]:
    enriched = [candidate_with_metrics(obj, region_box) for obj in candidates if obj.get("bboxPt") and overlap_metrics(region_box, obj["bboxPt"])["intersectionPt2"] > 0]
    if source:
        # Explicit source IDs on the DOM are proof of correspondence.
        line_id = source.get("lineId")
        span_key = f"{line_id}:{source.get('spanIndex')}" if source.get("spanIndex") is not None else None
        symbol_id = source.get("semanticIdentity")
        exact = []
        for candidate in candidates:
            refs = candidate.get("refs", [])
            all_attrs = {}
            for ref in refs:
                all_attrs.update(ref.get("attrs", {}))
            attrs = candidate.get("attrs", {})
            all_attrs.update(attrs)
            if line_id and all_attrs.get("data-source-line-id") == line_id:
                exact.append(candidate)
            elif span_key and all_attrs.get("data-source-span") == span_key:
                exact.append(candidate)
            elif symbol_id and all_attrs.get("data-symbol-id", all_attrs.get("data-source-inline-semantic")) == symbol_id:
                exact.append(candidate)
        if len(exact) == 1:
            return exact[0], "EXACT", enriched
        if len(exact) > 1:
            return None, "AMBIGUOUS", enriched

    if source and source.get("objectType") in {"TEXT_LINE", "TEXT_RUN", "RICH_TEXT_RUN"}:
        target_text = (focused_span or source).get("normalizedText", "")
        scored = []
        for candidate in enriched:
            if candidate.get("objectType") not in {"TEXT_LINE", "TEXT_RUN", "RICH_TEXT_RUN"}:
                continue
            candidate_text = norm_text(candidate.get("text", ""))
            similarity = SequenceMatcher(None, target_text, candidate_text).ratio() if target_text and candidate_text else 0.0
            if target_text and (target_text in candidate_text or candidate_text in target_text):
                similarity = max(similarity, 0.9)
            coverage = candidate["intersection"]["regionCoverage"]
            if coverage >= 0.25 and similarity >= 0.45:
                scored.append((similarity * 0.65 + min(coverage, 1.0) * 0.35, candidate))
        scored.sort(key=lambda item: item[0], reverse=True)
        if scored:
            if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) <= 0.04:
                return None, "AMBIGUOUS", enriched
            return scored[0][1], "STRONG", enriched

    if source:
        # Overlay/asset correspondence by tight bbox is a strong geometric
        # relationship; without a shared source ID it is never labelled EXACT.
        same_asset = [c for c in enriched if source.get("bboxPt") and c.get("bboxPt")
                      and overlap_metrics(source["bboxPt"], c["bboxPt"])["iou"] >= 0.95
                      and c.get("objectType") in {"SVG_OVERLAY", "RASTER_IMAGE", "INLINE_SYMBOL"}]
        if len(same_asset) == 1:
            return same_asset[0], "STRONG", enriched
        if len(same_asset) > 1:
            return None, "AMBIGUOUS", enriched
    return None, "UNKNOWN", enriched


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--delta-report", type=Path, required=True)
    parser.add_argument("--source-pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--sidecars-root", type=Path, default=DEFAULT_SIDEcars)
    parser.add_argument("--viewer-manifest", type=Path)
    parser.add_argument("--historical-overlay-sidecar", type=Path)
    parser.add_argument("--pages", help="Comma-separated page numbers; omit for every result in the detector artifact")
    parser.add_argument("--states", help="Comma-separated states, e.g. current or historical-no-pill,current")
    parser.add_argument("--region-ids", help="Optional comma-separated region IDs for a narrow controlled replay")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    delta = load_json(args.delta_report)
    wanted_pages = {int(value) for value in args.pages.split(",")} if args.pages else None
    wanted_states = {value.strip() for value in args.states.split(",")} if args.states else None
    wanted_regions = {value.strip() for value in args.region_ids.split(",")} if args.region_ids else None
    viewer_pages, viewer_root = read_runtime_manifest(args.viewer_manifest)
    result_pages = [result for result in delta.get("results", [])
                    if (wanted_pages is None or result["page"] in wanted_pages)
                    and (wanted_states is None or result.get("state") in wanted_states)]
    raw_items = []
    for result in result_pages:
        for region in result.get("regions", []):
            if wanted_regions is not None and region["regionId"] not in wanted_regions:
                continue
            raw_items.append({"page": result["page"], "state": result.get("state", "current"), **region})
    if wanted_regions and {item["regionId"] for item in raw_items} != wanted_regions:
        absent = sorted(wanted_regions - {item["regionId"] for item in raw_items})
        raise ValueError(f"Requested region IDs absent from selected detector results: {absent}")

    page_objects: dict[int, dict[str, Any]] = {}
    with pymupdf.open(args.source_pdf) as doc:
        for page_number in sorted({item["page"] for item in raw_items}):
            page = doc[page_number - 1]
            sidecar_path = args.sidecars_root / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
            if not sidecar_path.exists():
                page_objects[page_number] = {"unavailable": f"missing sidecar {sidecar_path}"}
                continue
            sidecar = load_json(sidecar_path)
            traces = trace_spans(page)
            lines, spans = text_source_objects(page_number, sidecar, traces)
            editorial_blocks = editorial_block_candidates(page_number, sidecar)
            nontext, _ = sidecar_nontext_objects(page_number, args.sidecars_root)
            drawings = [drawing_record(page_number, index, drawing) for index, drawing in enumerate(page.get_drawings())]
            raw_drawings = page.get_drawings()
            groups = drawing_group_candidates(page_number, raw_drawings)
            inline = [obj for obj in nontext if obj["objectType"] == "INLINE_SYMBOL"]
            images = [obj for obj in nontext if obj["objectType"] in {"RASTER_IMAGE", "CARD_ARTWORK", "DIAGRAM_ELEMENT"}]
            source_images = []
            for index, image in enumerate(page.get_image_info(xrefs=True)):
                source_images.append({
                    "id": f"pdf:p{page_number}:image:{index}:xref-{image.get('xref',0)}",
                    "objectType": "RASTER_IMAGE", "identityPersistent": True,
                    "bboxPt": [round(float(v), 6) for v in image.get("bbox", [])],
                    "xref": image.get("xref"), "widthPx": image.get("width"), "heightPx": image.get("height"),
                    "evidence": ["PDF image placement index", "xref", "source bbox"],
                })
            runtime = runtime_viewer_objects(page_number, viewer_pages.get(page_number), float(sidecar.get("width", page.rect.width)), args.sidecars_root)
            sidecar_candidates = viewer_sidecar_candidates(page_number, args.sidecars_root, args.historical_overlay_sidecar if any(i["state"] == "historical-no-pill" and i["page"] == page_number for i in raw_items) else None)
            # Keep current and historical viewer evidence separate. A historical
            # delta must not be matched against today's live DOM, which could
            # make a removed overlay look present in the historical state.
            current_viewer_candidates = [*runtime, *sidecar_candidates, *inline]
            page_objects[page_number] = {
                "pageWidthPt": float(sidecar.get("width", page.rect.width)),
                "pageHeightPt": float(sidecar.get("height", page.rect.height)),
                "pageAreaPt2": float(sidecar.get("width", page.rect.width)) * float(sidecar.get("height", page.rect.height)),
                "sourceLineObjects": lines,
                "sourceSpanObjects": spans,
                "sourceEditorialBlocks": editorial_blocks,
                "sourceSidecarObjects": nontext,
                "sourceDrawingObjects": drawings,
                "sourceDrawingGroups": groups,
                "sourcePdfImages": source_images,
                "currentViewerCandidates": current_viewer_candidates,
                "historicalViewerCandidates": sidecar_candidates,
            }

    regions = []
    source_groups: dict[str, list[str]] = defaultdict(list)
    group_objects: dict[str, dict[str, Any]] = {}
    status_counts: dict[str, int] = defaultdict(int)
    for raw in raw_items:
        page_number = raw["page"]
        objs = page_objects.get(page_number, {})
        box = raw.get("bboxPt")
        if not box or objs.get("unavailable"):
            region_output = {
                "regionId": raw["regionId"], "page": page_number, "state": raw["state"], "bboxPt": box,
                "classificationState": "candidate", "sourceCandidates": [], "viewerCandidates": [],
                "association": {"status": "UNKNOWN", "sourceObject": None, "viewerObject": None, "evidence": [objs.get("unavailable", "missing bbox")]},
            }
            regions.append(region_output); status_counts["UNKNOWN"] += 1
            continue
        sources, source_object, source_status, focused_span = _source_candidates(
            box, page_number, load_json(args.sidecars_root / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"),
            objs["sourceLineObjects"], objs["sourceSpanObjects"], objs["sourceEditorialBlocks"], objs["sourceSidecarObjects"],
            objs["sourceDrawingObjects"], objs["sourceDrawingGroups"], objs["sourcePdfImages"], objs["pageAreaPt2"],
        )
        # Viewer candidates are allowed to be discovered by intersection for
        # review; only shared explicit attributes/text/asset evidence can pair
        # them with a source candidate.
        viewer_candidates = (
            objs["historicalViewerCandidates"]
            if raw["state"] == "historical-no-pill"
            else objs["currentViewerCandidates"]
        )
        viewer, viewer_status, viewer_intersecting = match_viewer_object(
            source_object, focused_span, viewer_candidates, box, source_status,
        )
        overall = "UNKNOWN"
        evidence = []
        if source_status == "AMBIGUOUS":
            overall = "AMBIGUOUS"; evidence.append("multiple source candidates have indistinguishable structural intersection evidence")
        elif source_object and viewer_status == "EXACT":
            overall = "EXACT"; evidence.append("persistent source identity matched an explicit viewer data attribute")
        elif source_object and source_status == "STRONG":
            overall = "STRONG"; evidence.extend(source_object.get("evidence", []))
            if viewer_status == "STRONG": evidence.append("viewer candidate also matched text or a tightly coincident asset bbox")
            elif viewer_status == "UNKNOWN": evidence.append("source object is known; no viewer object correspondence was established")
        elif viewer_status == "AMBIGUOUS":
            overall = "AMBIGUOUS"; evidence.append("viewer candidates overlap without a unique identity")

        source_relevant = [c for c in sources if c["intersection"]["regionCoverage"] >= 0.1]
        viewer_relevant = [c for c in viewer_intersecting if c["intersection"]["regionCoverage"] >= 0.1]
        group_id = source_object.get("id") if source_object and source_status in {"EXACT", "STRONG"} else None
        region_output = {
            "regionId": raw["regionId"], "page": page_number, "state": raw["state"],
            "bboxPt": box, "structuralAreaPx": raw.get("structuralAreaPx"),
            "classificationState": "candidate",
            "sourceCandidates": sorted(source_relevant, key=lambda c: (c["intersection"]["regionCoverage"], c["intersection"]["iou"]), reverse=True)[:16],
            "viewerCandidates": sorted(viewer_relevant, key=lambda c: (c["intersection"]["regionCoverage"], c["intersection"]["iou"]), reverse=True)[:16],
            "sourceFocusSpanCandidate": candidate_with_metrics(focused_span, box) if focused_span else None,
            "association": {
                "status": overall,
                "sourceStatus": source_status,
                "viewerStatus": viewer_status,
                "sourceObject": {key: source_object.get(key) for key in ("id", "objectType", "semanticIdentity", "bboxPt", "blockId", "lineId", "text", "drawingIndex", "paintSequence", "memberDrawingIndices", "children", "drawingIndices", "anchor") if source_object and key in source_object} if source_object else None,
                "viewerObject": {key: viewer.get(key) for key in ("id", "objectType", "bboxPt", "assetUrl", "text", "selector", "attrs", "refs", "idPersistence", "computedStyle", "region", "category") if viewer and key in viewer} if viewer else None,
                "candidateInstanceId": f"instance-candidate:{group_id}" if group_id else None,
                "evidence": evidence,
            },
        }
        regions.append(region_output)
        status_counts[overall] += 1
        if group_id:
            source_groups[group_id].append(raw["regionId"])
            group_objects[group_id] = source_object

    instance_candidates = []
    for object_id, children in sorted(source_groups.items()):
        obj = group_objects[object_id]
        instance_candidates.append({
            "id": f"instance-candidate:{object_id}",
            "classification": "UNCLASSIFIED_CANDIDATE",
            "objectType": obj.get("objectType", "UNKNOWN"),
            "sourceObject": obj,
            "rawRegions": children,
            "evidence": ["all child regions share the same stable source object ID"],
            "family": "UNCLASSIFIED",
        })

    result = {
        "schema": "post-detection-object-mapper/v1",
        "objectTypeVocabulary": ["TEXT_RUN", "TEXT_LINE", "RICH_TEXT_RUN", "SOURCE_DRAWING", "SOURCE_DRAWING_GROUP", "INLINE_SYMBOL", "SVG_OVERLAY", "RASTER_IMAGE", "CARD_ARTWORK", "DIAGRAM_ELEMENT", "PAGE_FURNITURE", "EDITORIAL_BLOCK", "UNKNOWN"],
        "input": {"deltaReport": str(args.delta_report), "sourcePdf": str(args.source_pdf), "viewerManifest": str(args.viewer_manifest) if args.viewer_manifest else None},
        "annotationInputUsed": False,
        "scope": sorted({(item["page"], item["state"]) for item in raw_items}),
        "summary": {
            "rawRegionCount": len(regions), "associationStatusCounts": dict(status_counts),
            "candidateInstanceCount": len(instance_candidates),
            "unknownRate": round(status_counts["UNKNOWN"] / len(regions), 6) if regions else 0,
            "ambiguousRate": round(status_counts["AMBIGUOUS"] / len(regions), 6) if regions else 0,
        },
        "regions": regions,
        "instanceCandidates": instance_candidates,
        "limitations": [
            "Bboxes identify intersection candidates, not identity by proximity.",
            "Capture-local DOM node order is not persistent identity; explicit source/data/asset IDs are distinguished.",
            "No family assignment or defect confirmation is attempted.",
            "Large page/background drawings and images remain low-priority overlap candidates and cannot establish object identity.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
