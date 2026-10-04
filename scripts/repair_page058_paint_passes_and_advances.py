"""Keep p.58 outlined keywords semantic and restore source inline spacing.

The PDF paints COMMAND and INTELLIGENT twice at identical coordinates: a
2-point dark stroke pass followed by an orange/green fill pass. The stroke pass
is a visual effect, not a second word. This page-local repair marks that pass
as non-semantic, transfers its appearance to the fill span, and opts only the
confirmed p.58 lines into source-PDF span advances.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM = ROOT / "apps/web/public/pages/page_058/page_058_dom.json"

STROKE_PASSES = {
    ("block_8", "line_8_1", 1): ("COMMAND", "#231f20"),
    ("block_13", "line_13_0", 1): ("INTELLIGENT", "#231f20"),
}
FILL_PASSES = {
    ("block_8", "line_8_2", 0): ("COMMAND", "#f8951d"),
    ("block_13", "line_13_1", 0): ("INTELLIGENT", "#b5d333"),
}
SOURCE_GEOMETRY_LINES = {
    "line_8_1", "line_8_2", "line_13_0", "line_13_1",
    "line_11_41", "line_11_42", "line_11_43", "line_11_44",
    "line_11_45", "line_11_46", "line_28_2",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the page DOM repairs")
    args = parser.parse_args()
    data = json.loads(DOM.read_text(encoding="utf-8"))
    block_by_id = {block.get("id"): block for block in data.get("blocks", [])}
    line_by_ref = {
        (block.get("id"), line.get("id")): line
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
    }
    stroke_refs: set[str] = set()
    changes: list[str] = []

    for targets, property_name in ((STROKE_PASSES, "renderOnlyStrokePass"),):
        for (block_id, line_id, index), (expected_text, _) in targets.items():
            line = line_by_ref.get((block_id, line_id))
            spans = line.get("spans", []) if line else []
            if index >= len(spans) or spans[index].get("text") != expected_text:
                actual = spans[index].get("text") if index < len(spans) else "<missing>"
                raise SystemExit(f"Stale p.58 target {block_id}/{line_id}:{index}: {actual!r}")
            span = spans[index]
            if span.get("color", "").lower() != "#231f20":
                raise SystemExit(f"Unexpected stroke-pass color at {block_id}/{line_id}:{index}")
            if not span.get(property_name):
                changes.append(f"paint-only {block_id}/{line_id}:{index} {expected_text}")
                if args.apply:
                    span[property_name] = True
            stroke_refs.add(f"{line_id}:{index}")

    for (block_id, line_id, index), (expected_text, expected_color) in FILL_PASSES.items():
        line = line_by_ref.get((block_id, line_id))
        spans = line.get("spans", []) if line else []
        if index >= len(spans) or spans[index].get("text") != expected_text:
            actual = spans[index].get("text") if index < len(spans) else "<missing>"
            raise SystemExit(f"Stale p.58 fill target {block_id}/{line_id}:{index}: {actual!r}")
        span = spans[index]
        if span.get("color", "").lower() != expected_color:
            raise SystemExit(f"Unexpected fill-pass color at {block_id}/{line_id}:{index}")
        if span.get("renderTextStrokeWidthPt") != 2.0 or span.get("renderTextStrokeColor") != "#231f20":
            changes.append(f"outlined fill {block_id}/{line_id}:{index} {expected_text}")
            if args.apply:
                span["renderTextStrokeWidthPt"] = 2.0
                span["renderTextStrokeColor"] = "#231f20"

    all_lines = {
        line.get("id"): line
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
    }
    for line_id in SOURCE_GEOMETRY_LINES:
        line = all_lines.get(line_id)
        if line is None:
            raise SystemExit(f"Missing p.58 source-geometry line: {line_id}")
        if not line.get("renderSourceSpanGeometry"):
            changes.append(f"source advances {line_id}")
            if args.apply:
                line["renderSourceSpanGeometry"] = True

    if args.apply:
        # A black stroke copy must not be a separately editable translation unit.
        for block in block_by_id.values():
            units = block.get("typographicSpanUnits", [])
            kept_units = []
            for unit in units:
                refs = [ref for ref in unit.get("spanRefs", []) if ref not in stroke_refs]
                if refs:
                    unit["spanRefs"] = refs
                    kept_units.append(unit)
            block["typographicSpanUnits"] = kept_units
        DOM.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"p.58 changes={len(changes)} apply={args.apply}")
    for change in changes:
        print(f"  {change}")


if __name__ == "__main__":
    main()
