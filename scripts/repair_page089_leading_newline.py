"""Remove the p.89 line-start newline artifact from rendering geometry only.

The extracted paragraph line begins with a literal newline in its first span.
The browser paints that as a blank line inside the absolute line box, colliding
with the next line. Keep the source text untouched for editing/translation;
strip the control character only for display and size the line from sibling
prose spans that have normal text metrics.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/public/pages/page_089/page_089_dom.json"
BLOCK_ID = "block_21"
LINE_ID = "line_21_9"
EXPECTED_PREFIX = "\nAbilities with this Icon are referencing "


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next((item for item in data["blocks"] if item.get("id") == BLOCK_ID), None)
    line = next((item for item in (block or {}).get("lines", []) if item.get("id") == LINE_ID), None)
    if line is None:
        raise SystemExit(f"p.89 expected {BLOCK_ID}/{LINE_ID} was not found")

    spans = line.get("spans", [])
    if not spans or not str(spans[0].get("text", "")).startswith(EXPECTED_PREFIX):
        raise SystemExit("p.89 line_21_9 no longer has the audited leading newline; re-inspect before applying")

    first = spans[0]
    visible = str(first["text"]).lstrip("\r\n")
    first_override = first.get("renderTextOverride")
    if first_override is not None and first_override != visible:
        raise SystemExit(f"Unexpected existing renderTextOverride: {first_override!r}")

    # The sibling spans carry the normal source line box; the first span's
    # bbox includes the preceding newline's extra vertical advance.
    sibling_boxes = [
        span.get("bbox")
        for span in spans[1:]
        if str(span.get("text", "")).strip() and isinstance(span.get("bbox"), list)
    ]
    if not sibling_boxes:
        raise SystemExit("p.89 line_21_9 has no sibling prose spans for a safe line-box normalization")
    y0 = min(float(box[1]) for box in sibling_boxes)
    y1 = max(float(box[3]) for box in sibling_boxes)
    if not 410 <= y0 <= 420 or not 420 <= y1 <= 435:
        raise SystemExit(f"Unexpected sibling line box: {y0:.3f}..{y1:.3f}")

    first["renderTextOverride"] = visible
    old_y0, old_y1 = float(line["bbox"][1]), float(line["bbox"][3])
    line["bbox"][1] = y0
    line["bbox"][3] = y1
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"p.89 {BLOCK_ID}/{LINE_ID}: stripped leading newline for rendering only; "
        f"line y={old_y0:.3f}..{old_y1:.3f} -> {y0:.3f}..{y1:.3f}pt"
    )


if __name__ == "__main__":
    main()
