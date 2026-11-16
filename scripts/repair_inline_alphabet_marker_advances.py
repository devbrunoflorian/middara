"""Align inline A-K callout lettering with its source PDF vector boxes.

Browser font advances were narrower than the source PDF runs on multiple pages.
Because the callout letters share a prose line, the width loss accumulated until
the label appeared before its white vector box. These allowlisted lines use the
source advances through the last marker in the English viewer, then return to
natural text flow; translated text keeps natural copyfit throughout.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "apps/web/public/pages"
TARGETS: dict[int, dict[str, dict[int, str]]] = {
    47: {
        "line_41_1": {5: "A"},
        "line_41_2": {0: "B"},
        "line_41_4": {0: "C"},
    },
    74: {
        "line_12_0": {2: "A"},
        "line_13_2": {2: "B"},
        "line_14_1": {2: "C"},
        "line_14_3": {3: "D", 5: "D"},
        "line_15_0": {1: "E"},
        "line_15_6": {1: "F"},
        "line_16_0": {2: "G"},
        "line_16_3": {2: "G"},
        "line_18_1": {1: "E"},
    },
    84: {
        "line_11_1": {1: "A"},
        "line_70_3": {2: "B"},
    },
    40: {
        "line_8_3": {1: "B", 4: "D"},
        "line_9_0": {1: "B", 4: "C"},
        "line_9_1": {4: "D"},
        "line_10_0": {1: "B"},
        "line_10_2": {3: "A"},
        "line_10_3": {1: "A"},
        "line_37_8": {3: "A"},
        "line_37_11": {1: "B"},
    },
    66: {
        "line_11_1": {1: "C"},
        "line_12_0": {5: "D"},
        "line_13_1": {6: "E"},
        "line_16_0": {2: "I"},
        "line_17_1": {2: "K", 4: "A"},
        "line_17_2": {1: "B"},
        "line_19_3": {2: "I"},
        "line_22_1": {6: "E"},
    },
    67: {
        "line_7_2": {5: "K"},
        "line_8_0": {1: "H"},
        "line_8_1": {5: "B"},
        "line_11_6": {6: "I"},
        "line_11_8": {4: "G"},
        "line_13_3": {2: "A"},
        "line_13_7": {1: "H"},
        "line_17_1": {8: "E"},
        "line_19_5": {3: "J"},
        "line_20_3": {4: "C"},
        "line_21_10": {3: "G"},
        "line_25_1": {7: "E"},
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write source-advance alignment flags")
    args = parser.parse_args()
    updated = 0

    for page_number, expected_lines in TARGETS.items():
        path = PAGES / f"page_{page_number:03d}" / f"page_{page_number:03d}_dom.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        lines = {
            line.get("id"): line
            for block in data.get("blocks", [])
            for line in block.get("lines", [])
        }
        page_changed = False
        for line_id, markers in expected_lines.items():
            line = lines.get(line_id)
            if line is None:
                raise SystemExit(f"p.{page_number} missing expected line {line_id}")
            spans = line.get("spans", [])
            for index, expected_text in markers.items():
                if index >= len(spans) or str(spans[index].get("text", "")).strip() != expected_text:
                    actual = spans[index].get("text") if index < len(spans) else "<missing>"
                    raise SystemExit(f"p.{page_number} {line_id} span {index}: expected {expected_text!r}, got {actual!r}")
            joined = "".join(str(span.get("text", "")) for span in spans)
            if not joined.strip():
                raise SystemExit(f"p.{page_number} {line_id} has no source text")
            geometry_through_span = max(markers)
            if (
                not line.get("renderSourceSpanGeometry")
                or line.get("renderSourceGeometryThroughSpan") != geometry_through_span
            ):
                updated += 1
                if args.apply:
                    line["renderSourceSpanGeometry"] = True
                    line["renderSourceGeometryThroughSpan"] = geometry_through_span
                    page_changed = True
            print(
                f"p.{page_number} {line_id}: markers={','.join(markers.values())}; "
                f"source advances through span {geometry_through_span} {'set' if args.apply else 'ready'}"
            )
        if args.apply and page_changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"lines={sum(len(lines) for lines in TARGETS.values())} updated={updated} applied={args.apply}")


if __name__ == "__main__":
    main()
