"""Attach source-PDF render variants to structurally verified inline dice.

Dry-run by default. --apply changes only sourceSymbols.json and the matching
inline_elements.json metrics; it does not alter translations or mask images.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGES = ROOT / "apps/web/public/pages"
REGISTRY = ROOT / "apps/web/src/symbols/sourceSymbols.json"

# Representatives were selected only after a read-only scan of all 22 dice
# adapters. The signatures include path topology/geometry, normalized stroke
# weights, colors, caps and joins. Counts prevent a stale audit from changing a
# different-looking occurrence silently.
FAMILIES = [
    dict(name="purple-p41-heavy-outline", symbolId="dice.purple", page=41,
         bbox=(247.917, 251.463, 257.831, 262.944), expectedCount=2),
    dict(name="black-p67-heavy-face-lines", symbolId="dice.black", page=67,
         bbox=(579.65, 330.64, 591.14, 343.9), expectedCount=2),
    dict(name="black-p78-compact-lines", symbolId="dice.black", page=78,
         bbox=(569.8015, 742.6188, 578.8895, 753.1098), expectedCount=1),
]
BASE_REPRESENTATIVES = {
    "dice.black": (52, (244.157394, 333.248596, 255.645401, 346.507599), 16),
    "dice.purple": (85, (133.419601, 165.496292, 142.507599, 175.987289), 1),
}


def color_hex(color) -> str | None:
    if color is None:
        return None
    channels = [round(max(0.0, min(1.0, float(channel))) * 255) for channel in color]
    return "#" + "".join(f"{channel:02x}" for channel in channels)


def opacity(value) -> float:
    """PDF defaults omitted alpha values to fully opaque paint."""
    return 1.0 if value is None else round(float(value), 6)


def dash_pattern(drawing: dict) -> str:
    return " ".join((drawing.get("dashes") or "[] 0").split())


def drawing_group(drawings: list[dict], bbox: tuple[float, ...]) -> list[dict]:
    box = fitz.Rect(bbox)
    found = []
    for drawing in drawings:
        rect = fitz.Rect(drawing["rect"])
        if (rect.x0 >= box.x0 - 0.08 and rect.y0 >= box.y0 - 0.08
                and rect.x1 <= box.x1 + 0.08 and rect.y1 <= box.y1 + 0.08):
            found.append(drawing)
    if len(found) != 4 or sum(d["type"] == "fs" for d in found) != 1 or sum(d["type"] == "s" for d in found) != 3:
        raise ValueError(f"Expected one filled/stroked body and three face lines in {bbox}; found {len(found)} operations")
    return found


def vector_signature(group: list[dict], bbox: tuple[float, ...]) -> tuple:
    x0, y0, x1, y1 = bbox
    width, height = x1 - x0, y1 - y0
    signature = []
    for drawing in group:
        operations = []
        for item in drawing["items"]:
            kind, *points = item
            normalized = tuple(
                (round((point.x - x0) / width, 6), round((point.y - y0) / height, 6))
                for point in points
            )
            operations.append((kind, normalized))
        line_cap = drawing.get("lineCap") or (0, 0, 0)
        signature.append((
            drawing["type"], tuple(operations),
            round((drawing.get("width") or 0) / width, 4),
            round((drawing.get("width") or 0) / height, 4),
            color_hex(drawing.get("fill")), color_hex(drawing.get("color")),
            tuple(line_cap), round(drawing.get("lineJoin") or 0, 4),
            bool(drawing.get("even_odd")), opacity(drawing.get("fill_opacity")),
            opacity(drawing.get("stroke_opacity")), dash_pattern(drawing),
        ))
    return tuple(signature)


def same_family(first: tuple, second: tuple) -> bool:
    """Require matching path structure, near-identical geometry and paint."""
    if len(first) != len(second):
        return False
    for a, b in zip(first, second):
        if (a[0], *a[4:]) != (b[0], *b[4:]):
            return False
        if abs(a[2] - b[2]) > 0.00002 or abs(a[3] - b[3]) > 0.00002:
            return False
        if len(a[1]) != len(b[1]):
            return False
        for op_a, op_b in zip(a[1], b[1]):
            if op_a[0] != op_b[0] or len(op_a[1]) != len(op_b[1]):
                return False
            for point_a, point_b in zip(op_a[1], op_b[1]):
                if max(abs(x - y) for x, y in zip(point_a, point_b)) > 0.0005:
                    return False
    return True


def svg_path(drawing: dict, origin: fitz.Rect) -> dict:
    # Do not silently drop PDF paint semantics the SVG serializer does not
    # currently encode. For these source dice, both paints are opaque and
    # strokes are solid; the transparent area is the absence of painted paths.
    if opacity(drawing.get("fill_opacity")) != 1.0:
        raise ValueError("Non-opaque PDF fill needs explicit SVG fillOpacity serialization")
    if opacity(drawing.get("stroke_opacity")) != 1.0:
        raise ValueError("Non-opaque PDF stroke needs explicit SVG strokeOpacity serialization")
    if dash_pattern(drawing) != "[] 0":
        raise ValueError(f"Dashed PDF stroke needs explicit SVG dash serialization: {drawing.get('dashes')}")

    commands = []
    current = None
    for item in drawing["items"]:
        kind, *points = item

        def xy(point: fitz.Point) -> tuple[float, float]:
            return point.x - origin.x0, point.y - origin.y0

        if kind == "l":
            start, end = points
            if current is None:
                x, y = xy(start)
                commands.append(f"M {x:.6f} {y:.6f}")
            x, y = xy(end)
            commands.append(f"L {x:.6f} {y:.6f}")
            current = end
        elif kind == "c":
            start, control1, control2, end = points
            if current is None:
                x, y = xy(start)
                commands.append(f"M {x:.6f} {y:.6f}")
            x1, y1 = xy(control1)
            x2, y2 = xy(control2)
            x3, y3 = xy(end)
            commands.append(f"C {x1:.6f} {y1:.6f} {x2:.6f} {y2:.6f} {x3:.6f} {y3:.6f}")
            current = end
        else:
            raise ValueError(f"Unsupported PDF vector operation: {kind}")
    if drawing.get("closePath"):
        commands.append("Z")
    caps = {0: "butt", 1: "round", 2: "square"}
    joins = {0: "miter", 1: "round", 2: "bevel"}
    path = {"d": " ".join(commands), "fill": color_hex(drawing.get("fill")) or "none"}
    if drawing.get("color"):
        path.update(
            stroke=color_hex(drawing["color"]),
            strokeWidth=drawing["width"],
            strokeLinecap=caps.get((drawing.get("lineCap") or (0,))[0], "butt"),
            strokeLinejoin=joins.get(drawing.get("lineJoin") or 0, "miter"),
        )
    else:
        path["stroke"] = "none"
    if drawing.get("even_odd"):
        path["fillRule"] = "evenodd"
    return path


def source_group(pdf: fitz.Document, page_number: int, bbox: tuple[float, ...]) -> tuple[list[dict], fitz.Rect]:
    group = drawing_group(pdf[page_number - 1].get_drawings(), bbox)
    body = next(drawing for drawing in group if drawing["type"] == "fs")
    return group, fitz.Rect(body["rect"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not PDF.is_file():
        raise FileNotFoundError(PDF)

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    symbols = {symbol["id"]: symbol for symbol in registry}
    sidecars = {int(path.parent.name.split("_")[1]): (path, json.loads(path.read_text(encoding="utf-8")))
                for path in PAGES.glob("page_*/inline_elements.json")}

    with fitz.open(PDF) as pdf:
        observations = []
        for page_number, (path, sidecar) in sidecars.items():
            drawings = pdf[page_number - 1].get_drawings()
            for element in sidecar.get("elements", []):
                if element.get("symbolId") not in ("dice.black", "dice.purple"):
                    continue
                box = tuple(element["bbox"])
                group = drawing_group(drawings, box)
                observations.append((element["symbolId"], page_number, box,
                                     vector_signature(group, box), group))
        if len(observations) != 22:
            raise ValueError(f"Dice inventory changed: expected 22 source adapters, found {len(observations)}")

        plans = []
        for family in FAMILIES:
            page_number, bbox = family["page"], family["bbox"]
            group, origin = source_group(pdf, page_number, bbox)
            signature = vector_signature(group, bbox)
            members = [(page, box, drawings) for symbol_id, page, box, sig, drawings in observations
                       if symbol_id == family["symbolId"] and same_family(sig, signature)]
            if len(members) != family["expectedCount"]:
                raise ValueError(f"{family['name']}: expected {family['expectedCount']} equivalent placements, found {len(members)}")
            base_page, base_bbox, expected_count = BASE_REPRESENTATIVES[family["symbolId"]]
            base_group, _ = source_group(pdf, base_page, base_bbox)
            base_signature = vector_signature(base_group, base_bbox)
            if same_family(signature, base_signature):
                raise ValueError(f"{family['name']} unexpectedly matches the registry base; no variant is needed")
            for previous, previous_signature, _, _ in plans:
                if previous["symbolId"] == family["symbolId"] and same_family(signature, previous_signature):
                    raise ValueError(f"Render families overlap: {family['name']} and {previous['name']}")
            path_list = [svg_path(drawing, origin) for drawing in group]
            symbol = symbols[family["symbolId"]]
            base_render = symbol["render"]
            variant = {
                "viewBox": [0, 0, origin.width, origin.height],
                "paths": path_list,
                "widthEm": base_render["widthEm"],
                "heightEm": base_render.get("heightEm", base_render["widthEm"]),
                "verticalAlignEm": base_render["verticalAlignEm"],
            }
            existing = symbol["render"].setdefault("variants", {}).get(family["name"])
            if existing != variant:
                symbol["render"]["variants"][family["name"]] = variant
            plans.append((family, signature, members, variant))

        for symbol_id, (page_number, bbox, expected_count) in BASE_REPRESENTATIVES.items():
            group, _ = source_group(pdf, page_number, bbox)
            signature = vector_signature(group, bbox)
            count = sum(1 for candidate_id, _, _, candidate_signature, _ in observations
                        if candidate_id == symbol_id and same_family(candidate_signature, signature))
            if count != expected_count:
                raise ValueError(f"Base family {symbol_id} changed: expected {expected_count}, found {count}")
        planned_count = sum(len(members) for _, _, members, _ in plans)
        base_count = sum(expected_count for _, _, expected_count in BASE_REPRESENTATIVES.values())
        if planned_count + base_count != len(observations):
            raise ValueError(f"Unclassified dice remain: {base_count} base + {planned_count} variant != {len(observations)}")

    updates = []
    for family, _, members, _ in plans:
        for page_number, bbox, _ in members:
            path, sidecar = sidecars[page_number]
            matches = [element for element in sidecar["elements"]
                       if element.get("symbolId") == family["symbolId"] and tuple(element["bbox"]) == bbox]
            if len(matches) != 1:
                raise ValueError(f"Expected one sidecar record for {family['name']} at page {page_number} {bbox}")
            element = matches[0]
            metrics = element.setdefault("metrics", {})
            if metrics.get("renderVariant") not in (None, family["name"]):
                raise ValueError(f"Conflicting renderVariant on page {page_number}: {metrics['renderVariant']}")
            metrics["renderVariant"] = family["name"]
            updates.append((page_number, path, sidecar, bbox, family["name"]))

    if args.apply:
        REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for _, path, sidecar, _, _ in updates:
            path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    result = []
    for family, _, members, variant in plans:
        result.append({
            "renderVariant": family["name"],
            "symbolId": family["symbolId"],
            "count": len(members),
            "pages": sorted(page for page, _, _ in members),
            "pathOperations": len(variant["paths"]),
            "colors": sorted({path.get("fill", "none") for path in variant["paths"]
                              if path.get("fill") != "none"}),
        })
    result.append({"mode": "apply" if args.apply else "dry-run", "diceAdapters": len(observations),
                   "baseFamilies": {symbol_id: expected for symbol_id, (_, _, expected) in BASE_REPRESENTATIVES.items()},
                   "variantOccurrences": len(updates)})
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
