"""Add two independently editable, different-size headings to page 3.

This is an opt-in production-data change for the exact verified Contents
block. Existing block-level translations remain the rendering fallback.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_JSON = ROOT / "apps/web/public/pages/page_003/page_003_dom.json"
EXPECTED = {
    "ADVENTURE MODE": ("OptimaLTStd-Bold", 9.0),
    "Playing Encounters": ("Cinzel-Regular", 12.0),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the exact page-3 field definitions")
    args = parser.parse_args()

    data = json.loads(PAGE_JSON.read_text(encoding="utf-8"))
    matches = [block for block in data.get("blocks", []) if block.get("id") == "block_13"]
    if len(matches) != 1:
        raise SystemExit(f"Expected one p. 3 block_13; found {len(matches)}")
    block = matches[0]
    units = []
    found: set[str] = set()
    for line in block.get("lines", []):
        spans = line.get("spans", [])
        text = "".join(span.get("text", "") for span in spans).strip()
        if text not in EXPECTED:
            continue
        if len(spans) != 1:
            raise SystemExit(f"Expected one style span for {text!r}; found {len(spans)}")
        span = spans[0]
        expected_font, expected_size = EXPECTED[text]
        if span.get("font") != expected_font or float(span.get("size", -1)) != expected_size:
            raise SystemExit(f"Signature mismatch for {text!r}: {span.get('font')} {span.get('size')}pt")
        found.add(text)
        available_x = float(line.get("availableX", line["bbox"][0]))
        available_width = float(line.get("availableWidth", line["bbox"][2] - line["bbox"][0]))
        unit_id = "p3-" + ("adventure-mode" if text == "ADVENTURE MODE" else "playing-encounters")
        units.append({
            "id": unit_id,
            "field": {
                "id": unit_id + "-field",
                "lineIds": [line["id"]],
                "bbox": [float(value) for value in line["bbox"]],
                "frame": {
                    "x": available_x,
                    "width": available_width,
                    "textAlign": "center",
                    "lineHeight": 1,
                },
            },
        })
    if found != set(EXPECTED):
        raise SystemExit(f"Could not confirm exact source lines: found {sorted(found)}")

    print("Verified page 3 different-size headings:")
    for unit in units:
        print(f"  {unit['id']}: line {unit['field']['lineIds'][0]} bbox={unit['field']['bbox']}")
    existing = block.get("typographicUnits")
    if existing is not None and existing != units:
        raise SystemExit("Existing typographicUnits differ from the verified source definitions")
    print(f"Separate edit targets: {len(units)}; already applied={existing is not None}; apply={args.apply}")
    if args.apply and existing is None:
        block["typographicUnits"] = units
        PAGE_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Added page-local typographic units; source lines, spans, IDs, and bboxes are unchanged.")


if __name__ == "__main__":
    main()
