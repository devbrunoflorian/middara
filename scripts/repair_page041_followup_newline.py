"""Remove the p.41 Follow Up paragraph's extraction-only leading newline.

The newline is present in PyMuPDF's first text span even though it is not
printed on that PDF line. In the browser it forces the first span onto a second
baseline, where it collides with the next line. Preserve source text and use a
render-only text override plus the normal sibling-span line box.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/public/pages/page_041/page_041_dom.json"
BLOCK_ID = "block_44"
LINE_ID = "line_44_5"
EXPECTED_PREFIX = "\nUnless otherwise specified, an "


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next((item for item in data["blocks"] if item.get("id") == BLOCK_ID), None)
    line = next((item for item in (block or {}).get("lines", []) if item.get("id") == LINE_ID), None)
    if line is None:
        raise SystemExit(f"p.41 expected {BLOCK_ID}/{LINE_ID} was not found")

    spans = line.get("spans", [])
    if not spans or not str(spans[0].get("text", "")).startswith(EXPECTED_PREFIX):
        raise SystemExit("p.41 line_44_5 no longer has the audited leading newline; re-inspect before applying")

    first = spans[0]
    visible = str(first["text"]).lstrip("\r\n")
    existing_override = first.get("renderTextOverride")
    if existing_override is not None and existing_override != visible:
        raise SystemExit(f"Unexpected existing renderTextOverride: {existing_override!r}")

    sibling_boxes = [
        span.get("bbox")
        for span in spans[1:]
        if str(span.get("text", "")).strip() and isinstance(span.get("bbox"), list)
    ]
    if not sibling_boxes:
        raise SystemExit("p.41 line_44_5 has no sibling spans for line-box normalization")
    y0 = min(float(box[1]) for box in sibling_boxes)
    y1 = max(float(box[3]) for box in sibling_boxes)
    if not 557 <= y0 <= 564 or not 568 <= y1 <= 576:
        raise SystemExit(f"Unexpected sibling line box: {y0:.3f}..{y1:.3f}")

    first["renderTextOverride"] = visible
    old_y0, old_y1 = float(line["bbox"][1]), float(line["bbox"][3])
    line["bbox"][1] = y0
    line["bbox"][3] = y1
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"p.41 {BLOCK_ID}/{LINE_ID}: stripped leading newline for rendering only; "
        f"line y={old_y0:.3f}..{old_y1:.3f} -> {y0:.3f}..{y1:.3f}pt"
    )


if __name__ == "__main__":
    main()
