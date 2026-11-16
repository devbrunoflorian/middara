"""Render p.57 COMMAND / INTELLIGENT labels as one outlined color pass.

The source PDF paints these labels with a 2 pt dark stroke followed by a
colored fill. PyMuPDF splits the green INTELLIGENT fill so the first "I" is
folded into the dark stroke span, while the remaining letters are a separate
green span. Keep the stroke pass visual-only, restore the complete editable
green label, and render the PDF's source advances on just these audited lines.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM = ROOT / "apps/web/public/pages/page_057/page_057_dom.json"

STROKE_PASSES = {
    ("block_55", "line_55_0", 1): "INTELLIGENT",
    ("block_55", "line_55_1", 2): "COMMAND",
    ("block_64", "line_64_0", 1): "INTELLIGENT",
    ("block_64", "line_64_1", 3): "COMMAND",
}

FILL_PASSES = {
    # PyMuPDF assigned the first green I to the overlapping dark stroke run.
    # Rejoin that I with the remaining green letters using source PDF bounds.
    ("block_55", "line_55_1", 0): {
        "expected": {"NTELLIGENT ", "INTELLIGENT "},
        "text": "INTELLIGENT ",
        "color": "#b5d333",
        "bbox": [201.78280639648438, 145.59913635253906, 259.04071044921875, 156.38113403320312],
        "old_bbox": [204.77980041503906, 145.59913635253906, 259.04071044921875, 156.38113403320312],
        "line_x": 201.78280639648438,
    },
    ("block_55", "line_55_2", 0): {
        "expected": {"COMMAND"},
        "text": "COMMAND",
        "color": "#f8951d",
    },
    ("block_64", "line_64_1", 0): {
        "expected": {"NTELLIGENT", "INTELLIGENT"},
        "text": "INTELLIGENT",
        "color": "#b5d333",
        "bbox": [201.78280639648438, 331.7958984375, 256.7908020019531, 342.5779113769531],
        "old_bbox": [204.77980041503906, 331.7958984375, 256.7908020019531, 342.5779113769531],
        "line_x": 201.78280639648438,
    },
    ("block_64", "line_64_2", 0): {
        "expected": {"COMMAND"},
        "text": "COMMAND",
        "color": "#f8951d",
    },
}

SOURCE_GEOMETRY_LINES = {
    ("block_55", "line_55_0"),
    ("block_55", "line_55_1"),
    ("block_55", "line_55_2"),
    ("block_64", "line_64_0"),
    ("block_64", "line_64_1"),
    ("block_64", "line_64_2"),
}


def close_bbox(actual: list[float], expected: list[float], tolerance: float = 0.02) -> bool:
    return len(actual) == len(expected) and all(
        abs(a - e) <= tolerance for a, e in zip(actual, expected)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the p.57 DOM repair")
    args = parser.parse_args()

    data = json.loads(DOM.read_text(encoding="utf-8"))
    block_by_id = {block.get("id"): block for block in data.get("blocks", [])}
    line_by_ref = {
        (block.get("id"), line.get("id")): line
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
    }
    changes: list[str] = []
    stroke_refs: set[str] = set()

    for (block_id, line_id, index), expected_text in STROKE_PASSES.items():
        line = line_by_ref.get((block_id, line_id))
        spans = line.get("spans", []) if line else []
        if index >= len(spans) or spans[index].get("text") != expected_text:
            actual = spans[index].get("text") if index < len(spans) else "<missing>"
            raise SystemExit(f"Stale p.57 stroke target {block_id}/{line_id}:{index}: {actual!r}")
        span = spans[index]
        if span.get("color", "").lower() != "#231f20" or span.get("font") != "OptimaLTStd-Black":
            raise SystemExit(f"Unexpected p.57 stroke styling at {block_id}/{line_id}:{index}")
        if not span.get("renderOnlyStrokePass"):
            changes.append(f"paint-only {block_id}/{line_id}:{index} {expected_text}")
            if args.apply:
                span["renderOnlyStrokePass"] = True
        stroke_refs.add(f"{line_id}:{index}")

    for (block_id, line_id, index), target in FILL_PASSES.items():
        line = line_by_ref.get((block_id, line_id))
        spans = line.get("spans", []) if line else []
        if index >= len(spans) or spans[index].get("text") not in target["expected"]:
            actual = spans[index].get("text") if index < len(spans) else "<missing>"
            raise SystemExit(f"Stale p.57 fill target {block_id}/{line_id}:{index}: {actual!r}")
        span = spans[index]
        if span.get("color", "").lower() != target["color"]:
            raise SystemExit(f"Unexpected p.57 fill color at {block_id}/{line_id}:{index}")
        expected_source_bbox = target.get("old_bbox", target.get("bbox"))
        if "bbox" in target and not (
            close_bbox(span["bbox"], target["bbox"])
            or close_bbox(span["bbox"], expected_source_bbox)
        ):
            raise SystemExit(f"Unexpected source advance at {block_id}/{line_id}:{index}: {span['bbox']}")
        if span.get("text") != target["text"]:
            changes.append(f"restore full editable fill text at {block_id}/{line_id}:{index}")
            if args.apply:
                span["text"] = target["text"]
        if "bbox" in target and span.get("bbox") != target["bbox"]:
            changes.append(f"restore source bbox including leading I at {block_id}/{line_id}:{index}")
            if args.apply:
                span["bbox"] = target["bbox"]
                line["bbox"][0] = target["line_x"]
        if span.get("renderTextStrokeWidthPt") != 2.0 or span.get("renderTextStrokeColor") != "#231f20":
            changes.append(f"outlined color fill at {block_id}/{line_id}:{index}")
            if args.apply:
                span["renderTextStrokeWidthPt"] = 2.0
                span["renderTextStrokeColor"] = "#231f20"

    for block_id, line_id in SOURCE_GEOMETRY_LINES:
        line = line_by_ref.get((block_id, line_id))
        if line is None:
            raise SystemExit(f"Missing p.57 source-geometry target {block_id}/{line_id}")
        if not line.get("renderSourceSpanGeometry"):
            changes.append(f"source advances {block_id}/{line_id}")
            if args.apply:
                line["renderSourceSpanGeometry"] = True

    if args.apply:
        for block_id in {block for block, _, _ in STROKE_PASSES}:
            block = block_by_id[block_id]
            kept_units = []
            for unit in block.get("typographicSpanUnits", []):
                refs = [ref for ref in unit.get("spanRefs", []) if ref not in stroke_refs]
                if refs:
                    unit["spanRefs"] = refs
                    kept_units.append(unit)
            block["typographicSpanUnits"] = kept_units
        DOM.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"p.57 changes={len(changes)} apply={args.apply}")
    for change in changes:
        print(f"  {change}")


if __name__ == "__main__":
    main()
