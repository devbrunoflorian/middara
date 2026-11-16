"""Restore reviewed PDF vector paint missing from the 49–102 viewer layer.

The manifest is a manually classified list derived from the approved object
mapper. This script does not discover, classify, or suppress candidates.
Default mode validates and prints the plan; pass --apply to write transparent
SVG overlays and append them to the existing page fidelity sidecars.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
MANIFEST = ROOT / "docs/project-progress/evidence/2026-10-08-global-audit-49-102/source-vector-overlay-plan.json"
PAGES = ROOT / "apps/web/public/pages"
TOLERANCE_PT = 0.02
ASSET_SCALE = 8


def color_hex(value: tuple[float, ...] | None) -> str:
    if value is None:
        return "none"
    channels = [max(0, min(255, round(float(channel) * 255))) for channel in value[:3]]
    if len(channels) == 1:
        channels *= 3
    if len(channels) != 3:
        raise ValueError(f"Unsupported source paint color: {value!r}")
    return "#" + "".join(f"{channel:02X}" for channel in channels)


def near_point(a: pymupdf.Point, b: pymupdf.Point) -> bool:
    return abs(a.x - b.x) <= 1e-5 and abs(a.y - b.y) <= 1e-5


def svg_path_data(drawing: dict[str, Any], origin: pymupdf.Rect) -> str:
    commands: list[str] = []
    current: pymupdf.Point | None = None

    def xy(point: pymupdf.Point) -> tuple[float, float]:
        return point.x - origin.x0, point.y - origin.y0

    def move_to(point: pymupdf.Point) -> None:
        x, y = xy(point)
        commands.append(f"M {x:.6f} {y:.6f}")

    for item in drawing["items"]:
        kind, *points = item
        if kind == "l":
            start, end = points
            if current is None or not near_point(current, start):
                move_to(start)
            x, y = xy(end)
            commands.append(f"L {x:.6f} {y:.6f}")
            current = end
        elif kind == "c":
            start, control1, control2, end = points
            if current is None or not near_point(current, start):
                move_to(start)
            x1, y1 = xy(control1)
            x2, y2 = xy(control2)
            x3, y3 = xy(end)
            commands.append(f"C {x1:.6f} {y1:.6f} {x2:.6f} {y2:.6f} {x3:.6f} {y3:.6f}")
            current = end
        elif kind == "re":
            rect: pymupdf.Rect = points[0]
            corners = [pymupdf.Point(rect.x0, rect.y0), pymupdf.Point(rect.x1, rect.y0),
                       pymupdf.Point(rect.x1, rect.y1), pymupdf.Point(rect.x0, rect.y1)]
            if len(points) > 1 and points[1] < 0:
                corners.reverse()
            move_to(corners[0])
            for corner in corners[1:]:
                x, y = xy(corner)
                commands.append(f"L {x:.6f} {y:.6f}")
            commands.append("Z")
            current = None
        elif kind == "qu":
            quad: pymupdf.Quad = points[0]
            corners = [quad.ul, quad.ur, quad.lr, quad.ll]
            if len(points) > 1 and points[1] < 0:
                corners.reverse()
            move_to(corners[0])
            for corner in corners[1:]:
                x, y = xy(corner)
                commands.append(f"L {x:.6f} {y:.6f}")
            commands.append("Z")
            current = None
        else:
            raise ValueError(f"Unsupported source vector operation {kind!r} in drawing {drawing.get('seqno')}")

    if drawing.get("closePath"):
        commands.append("Z")
    if not commands:
        raise ValueError(f"Source drawing has no serializable path items: {drawing.get('seqno')}")
    return " ".join(commands)


def svg_path(drawing: dict[str, Any], origin: pymupdf.Rect) -> str:
    if drawing.get("scissor") is not None:
        raise ValueError(f"Per-drawing scissor needs explicit clip serialization: {drawing.get('seqno')}")
    if drawing.get("fill_opacity") not in (None, 1.0) or drawing.get("stroke_opacity") not in (None, 1.0):
        raise ValueError(f"Non-opaque source drawing needs explicit opacity serialization: {drawing.get('seqno')}")
    if drawing.get("dashes") not in (None, "[] 0"):
        raise ValueError(f"Dashed source drawing needs explicit dash serialization: {drawing.get('seqno')}")
    attributes = [f'd="{escape(svg_path_data(drawing, origin))}"', f'fill="{color_hex(drawing.get("fill"))}"']
    if drawing.get("color") is not None:
        attributes.extend([
            f'stroke="{color_hex(drawing["color"])}"',
            f'stroke-width="{float(drawing.get("width") or 0):.6f}"',
        ])
        caps = {0: "butt", 1: "round", 2: "square"}
        joins = {0: "miter", 1: "round", 2: "bevel"}
        cap = (drawing.get("lineCap") or (0,))[0]
        join = drawing.get("lineJoin") or 0
        attributes.extend([f'stroke-linecap="{caps.get(cap, "butt")}"', f'stroke-linejoin="{joins.get(join, "miter")}"'])
    else:
        attributes.append('stroke="none"')
    if drawing.get("even_odd"):
        attributes.append('fill-rule="evenodd"')
    return "<path " + " ".join(attributes) + "/>"


def active_source_context(page: pymupdf.Page) -> tuple[dict[int, list[dict[str, Any]]], dict[int, list[dict[str, Any]]]]:
    clips: list[dict[str, Any]] = []
    groups: list[dict[str, Any]] = []
    clips_by_seq: dict[int, list[dict[str, Any]]] = {}
    groups_by_seq: dict[int, list[dict[str, Any]]] = {}
    for item in page.get_drawings(extended=True):
        kind = item.get("type")
        level = int(item.get("level", 0))
        clips = [clip for clip in clips if int(clip.get("level", 0)) < level]
        groups = [group for group in groups if int(group.get("level", 0)) < level]
        if kind == "clip":
            clips.append(item)
        elif kind == "group":
            groups.append(item)
        elif item.get("seqno") is not None:
            seqno = int(item["seqno"])
            clips_by_seq[seqno] = list(clips)
            groups_by_seq[seqno] = list(groups)
    return clips_by_seq, groups_by_seq


def clip_path_signature(clip: dict[str, Any], origin: pymupdf.Rect) -> str:
    payload = json.dumps({
        "path": svg_path_data(clip, origin),
        "evenOdd": bool(clip.get("even_odd")),
    }, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def overlay_svg(
    drawing: dict[str, Any], bbox: pymupdf.Rect, clip_paths: list[dict[str, Any]],
) -> tuple[str, int, int]:
    width = bbox.width
    height = bbox.height
    if width <= 0 or height <= 0:
        raise ValueError(f"Invalid source drawing bbox: {bbox}")
    path = svg_path(drawing, bbox)
    width_px = max(1, math.ceil(width * ASSET_SCALE))
    height_px = max(1, math.ceil(height * ASSET_SCALE))
    clip_defs: list[str] = []
    wrapped_path = path
    for index, clip in enumerate(clip_paths):
        clip_id = f"sourceClip{index}"
        clip_data = svg_path_data(clip, bbox)
        clip_defs.append(
            f'<clipPath id="{clip_id}" clipPathUnits="userSpaceOnUse">'
            f'<path d="{escape(clip_data)}" clip-rule="{"evenodd" if clip.get("even_odd") else "nonzero"}"/></clipPath>'
        )
        wrapped_path = f'<g clip-path="url(#{clip_id})">{wrapped_path}</g>'
    definitions = f'<defs>{"".join(clip_defs)}</defs>' if clip_defs else ""
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_px}" height="{height_px}" '
        f'viewBox="0 0 {width:.6f} {height:.6f}" preserveAspectRatio="none">{definitions}{wrapped_path}</svg>\n'
    )
    return svg, width_px, height_px


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write validated transparent SVG overlays and sidecars")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("auditId") != "2026-10-08-global-audit-49-102":
        raise ValueError("Unexpected source-vector overlay audit ID")
    if manifest.get("exclusions", [{}])[0].get("sourceObjectId") != "pdf:p100:drawing:219":
        raise ValueError("The p. 100 table/raster holdout must remain explicitly excluded")

    sidecars: dict[int, tuple[Path, dict[str, Any]]] = {}
    plans: list[tuple[dict[str, Any], Path, dict[str, Any], str, int, int]] = []
    with pymupdf.open(args.pdf) as document:
        for entry in manifest["entries"]:
            page_no = int(entry["page"])
            if not 49 <= page_no <= 102:
                raise ValueError(f"Overlay escaped audit scope: p.{page_no}")
            if page_no not in sidecars:
                page_dir = PAGES / f"page_{page_no:03d}"
                sidecar_path = page_dir / "fidelity_overlays.json"
                sidecar = json.loads(sidecar_path.read_text(encoding="utf-8")) if sidecar_path.is_file() else {"overlays": []}
                if not isinstance(sidecar.get("overlays"), list):
                    raise ValueError(f"Invalid fidelity overlay sidecar: {sidecar_path}")
                sidecars[page_no] = (sidecar_path, sidecar)

            page = document[page_no - 1]
            drawings = page.get_drawings()
            clips_by_seq, groups_by_seq = active_source_context(page)
            index = int(entry["drawingIndex"])
            if index >= len(drawings):
                raise ValueError(f"Missing p.{page_no} drawing {index}")
            drawing = drawings[index]
            bbox = pymupdf.Rect(drawing["rect"])
            expected = pymupdf.Rect(entry["bboxPt"])
            if drawing["type"] != entry["expectedType"] or len(drawing["items"]) != entry["expectedPathItemCount"]:
                raise ValueError(f"PDF drawing identity changed: p.{page_no} drawing {index}")
            if int(drawing["seqno"]) != entry["expectedSeqno"]:
                raise ValueError(f"PDF paint order changed: p.{page_no} drawing {index}")
            if any(abs(a - b) > TOLERANCE_PT for a, b in zip(bbox, expected)):
                raise ValueError(f"PDF drawing bbox changed: p.{page_no} drawing {index}: {bbox} != {expected}")

            asset_bbox = pymupdf.Rect(entry.get("assetBboxPt", list(bbox)))
            if (asset_bbox.x0 > bbox.x0 or asset_bbox.y0 > bbox.y0
                    or asset_bbox.x1 < bbox.x1 or asset_bbox.y1 < bbox.y1):
                raise ValueError(f"Overlay asset bbox must contain its source path: p.{page_no} drawing {index}")

            clip_paths = clips_by_seq.get(int(drawing["seqno"]), [])
            active_groups = groups_by_seq.get(int(drawing["seqno"]), [])
            unsupported_groups = [group for group in active_groups
                                  if group.get("blendmode") not in (None, "Normal")
                                  or group.get("opacity") not in (None, 1.0)
                                  or group.get("knockout")]
            if unsupported_groups:
                raise ValueError(f"Source drawing has an unmodeled transparency group: p.{page_no} drawing {index}")
            clip_signatures = [clip_path_signature(clip, bbox) for clip in clip_paths]
            expected_clip_signatures = entry.get("clipPathSignatures", clip_signatures)
            if clip_signatures != expected_clip_signatures:
                raise ValueError(f"Source clip path changed: p.{page_no} drawing {index}")
            entry["clipPathSignatures"] = clip_signatures

            page_dir = PAGES / f"page_{page_no:03d}"
            asset_name = f"fidelity-overlay-{entry['overlayId']}.svg"
            asset_path = page_dir / asset_name
            url = f"/pages/page_{page_no:03d}/{asset_name}"
            sidecar_path, sidecar = sidecars[page_no]
            existing_overlay = next((item for item in sidecar["overlays"] if item.get("url") == url), None)
            if existing_overlay and existing_overlay.get("auditId") != manifest["auditId"]:
                raise ValueError(f"Refusing to replace an overlay owned by another audit: {url}")

            svg, width_px, height_px = overlay_svg(drawing, asset_bbox, clip_paths)
            overlay = {
                "url": url,
                "bbox": [float(value) for value in asset_bbox],
                "widthPx": width_px,
                "heightPx": height_px,
                "language": "en",
                "languageInvariant": True,
                "zIndex": int(entry["zIndex"]),
                "auditId": manifest["auditId"],
                "category": entry["category"],
                "sourcePdfPage": page_no,
                "region": entry["overlayId"],
                "sourceDrawingIds": [entry["sourceObjectId"], f"pdf:p{page_no}:drawing:{index}"],
                "sourcePaintSequence": int(drawing["seqno"]),
                "family": entry["family"],
            }
            plans.append((entry, asset_path, sidecar, svg, width_px, height_px))
            entry["_overlayRecord"] = overlay
            entry["_existingOverlay"] = existing_overlay
            entry["_sidecarPath"] = str(sidecar_path)

    print(f"Validated {len(plans)} source drawings across {len(sidecars)} pages; apply={args.apply}")
    for entry, asset_path, _sidecar, _svg, _width, _height in plans:
        print(f"  p.{entry['page']} drawing {entry['drawingIndex']} {entry['family']} z={entry['zIndex']} -> {asset_path.relative_to(ROOT)}")

    if not args.apply:
        clean_manifest = {**manifest, "entries": [
            {key: value for key, value in entry.items() if not key.startswith("_")}
            for entry in manifest["entries"]
        ]}
        MANIFEST.write_text(json.dumps(clean_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return

    for entry, asset_path, sidecar, svg, _width, _height in plans:
        asset_path.write_text(svg, encoding="utf-8")
        existing = entry["_existingOverlay"]
        if existing:
            existing.clear()
            existing.update(entry["_overlayRecord"])
        else:
            sidecar["overlays"].append(entry["_overlayRecord"])
    for sidecar_path, sidecar in sidecars.values():
        sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    clean_manifest = {**manifest, "entries": [
        {key: value for key, value in entry.items() if not key.startswith("_")}
        for entry in manifest["entries"]
    ]}
    MANIFEST.write_text(json.dumps(clean_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {len(plans)} transparent source-vector overlays.")


if __name__ == "__main__":
    main()
