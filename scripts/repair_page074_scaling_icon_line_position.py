"""Correct the browser size of p.74's oversized inline asterisk.

The PDF reports a 19pt box for the asterisk, but its large browser flex-item
baseline pushes 10pt prose down into the following line. Render this glyph at
10pt while preserving the source size and glyph bboxes for editing.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/public/pages/page_074/page_074_dom.json"
BLOCK_ID = "block_13"
LINE_ID = "line_13_2"


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next(item for item in data["blocks"] if item.get("id") == BLOCK_ID)
    line = next(item for item in block["lines"] if item.get("id") == "line_13_1")
    glyph = next((span for span in line["spans"] if span.get("text") == "*"), None)
    if glyph is None or abs(float(glyph.get("size", 0)) - 19.0) > 0.2:
        raise SystemExit("p.74 line_13_1 no longer contains the verified 19pt asterisk")
    glyph["renderSizeOverridePt"] = 10.0
    trailing_line = next(item for item in block["lines"] if item.get("id") == "line_13_2")
    trailing_line.pop("renderTopOffsetPt", None)
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("p.74 line_13_1 '*' browser size 19pt -> 10pt; source font size and bbox preserved")


if __name__ == "__main__":
    main()
