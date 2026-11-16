"""Keep p.68 COMMAND / INTELLIGENT labels as editable outlined color text.

The reference PDF paints each label twice at the same bbox: a dark 2 pt
outline pass, followed by its orange or green fill. The outline copy is visual
styling, not a second word. This page-local repair suppresses only those dark
copies, transfers the outline to the editable colored spans, and opts the
affected lines into the source advances verified against the PDF.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM = ROOT / "apps/web/public/pages/page_068/page_068_dom.json"

# (block, line, span index): visible text painted in the PDF's dark pass.
STROKE_PASSES = {
    ("block_12", "line_12_4", 0): "INTELLIGENT",
    ("block_19", "line_19_0", 1): "COMMAND",
    ("block_19", "line_19_3", 1): "INTELLIGENT ",
    ("block_19", "line_19_5", 1): "INTELLIGENT",
    ("block_20", "line_20_1", 2): "INTELLIGENT",
}

# Each colored fill counterpart and its PDF-confirmed color.
FILL_PASSES = {
    ("block_12", "line_12_5", 0): ("INTELLIGENT", "#b5d333"),
    ("block_19", "line_19_1", 0): ("COMMAND", "#f8951d"),
    ("block_19", "line_19_4", 0): ("INTELLIGENT ", "#b5d333"),
    ("block_19", "line_19_6", 0): ("INTELLIGENT", "#b5d333"),
    ("block_20", "line_20_2", 0): ("INTELLIGENT", "#b5d333"),
}

SOURCE_GEOMETRY_LINES = {
    ("block_12", "line_12_4"), ("block_12", "line_12_5"),
    ("block_19", "line_19_0"), ("block_19", "line_19_1"),
    ("block_19", "line_19_3"), ("block_19", "line_19_4"),
    ("block_19", "line_19_5"), ("block_19", "line_19_6"),
    ("block_20", "line_20_1"), ("block_20", "line_20_2"),
}


def close_bbox(left: list[float], right: list[float], tolerance: float = 0.05) -> bool:
    return len(left) == len(right) == 4 and all(
        abs(a - b) <= tolerance for a, b in zip(left, right)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the p.68 DOM repair")
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
            raise SystemExit(f"Stale p.68 stroke target {block_id}/{line_id}:{index}: {actual!r}")
        span = spans[index]
        if span.get("color", "").lower() != "#231f20" or span.get("font") != "OptimaLTStd-Black":
            raise SystemExit(f"Unexpected p.68 stroke styling at {block_id}/{line_id}:{index}")
        if not span.get("renderOnlyStrokePass"):
            changes.append(f"paint-only {block_id}/{line_id}:{index} {expected_text}")
            if args.apply:
                span["renderOnlyStrokePass"] = True
        stroke_refs.add(f"{line_id}:{index}")

    for (block_id, line_id, index), (expected_text, expected_color) in FILL_PASSES.items():
        line = line_by_ref.get((block_id, line_id))
        spans = line.get("spans", []) if line else []
        if index >= len(spans) or spans[index].get("text") != expected_text:
            actual = spans[index].get("text") if index < len(spans) else "<missing>"
            raise SystemExit(f"Stale p.68 fill target {block_id}/{line_id}:{index}: {actual!r}")
        fill = spans[index]
        if fill.get("color", "").lower() != expected_color:
            raise SystemExit(f"Unexpected p.68 fill color at {block_id}/{line_id}:{index}")
        if fill.get("font") != "OptimaLTStd-Black":
            raise SystemExit(f"Unexpected p.68 fill font at {block_id}/{line_id}:{index}")

    pairs = zip(STROKE_PASSES.items(), FILL_PASSES.items(), strict=True)
    for ((stroke_block, stroke_line, stroke_index), _), ((fill_block, fill_line, fill_index), _) in pairs:
        stroke = line_by_ref[(stroke_block, stroke_line)]["spans"][stroke_index]
        fill = line_by_ref[(fill_block, fill_line)]["spans"][fill_index]
        if not close_bbox(stroke["bbox"], fill["bbox"]):
            raise SystemExit(f"p.68 paint pair has mismatched source bboxes: {stroke['bbox']} / {fill['bbox']}")
        if fill.get("renderTextStrokeWidthPt") != 2.0 or fill.get("renderTextStrokeColor") != "#231f20":
            changes.append(f"outlined color fill {fill_block}/{fill_line}:{fill_index}")
            if args.apply:
                fill["renderTextStrokeWidthPt"] = 2.0
                fill["renderTextStrokeColor"] = "#231f20"

    for block_id, line_id in SOURCE_GEOMETRY_LINES:
        line = line_by_ref.get((block_id, line_id))
        if line is None:
            raise SystemExit(f"Missing p.68 source-geometry target {block_id}/{line_id}")
        if not line.get("renderSourceSpanGeometry"):
            changes.append(f"source advances {block_id}/{line_id}")
            if args.apply:
                line["renderSourceSpanGeometry"] = True

    if args.apply:
        for block_id in {block_id for block_id, _, _ in STROKE_PASSES}:
            block = block_by_id[block_id]
            units = []
            for unit in block.get("typographicSpanUnits", []):
                kept_refs = [ref for ref in unit.get("spanRefs", []) if ref not in stroke_refs]
                if kept_refs:
                    unit["spanRefs"] = kept_refs
                    units.append(unit)
            block["typographicSpanUnits"] = units
        DOM.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"p.68 changes={len(changes)} apply={args.apply}")
    for change in changes:
        print(f"  {change}")


if __name__ == "__main__":
    main()
