"""Keep p.83 prose clear of the inline blue token crop.

The PDF line starts with a 2pt `BLUE` label inside the token image. The normal
viewer hides spans below 4pt because this label is already part of the full
token crop. The remaining `Blue Totem` span must keep its source x advance, so
the line renderer gets a local, rendering-only text offset.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/public/pages/page_083/page_083_dom.json"
BLOCK_ID = "block_6"
LINE_ID = "line_6_1"
LABEL_TEXT = "BLUE"
PROSE_TEXT = " Blue Totem. "


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next(item for item in data["blocks"] if item.get("id") == BLOCK_ID)
    line = next(item for item in block["lines"] if item.get("id") == LINE_ID)
    spans = line.get("spans", [])
    label = next((span for span in spans if span.get("text") == LABEL_TEXT), None)
    prose = next((span for span in spans if span.get("text") == PROSE_TEXT), None)
    if label is None or prose is None:
        raise SystemExit("p.83 line_6_1 no longer has the audited BLUE token label and Blue Totem prose spans")
    if float(label.get("size", 0)) >= 4:
        raise SystemExit("The BLUE label is no longer filtered as an in-image micro-label; reassess before applying this offset")
    line_x = float(line["bbox"][0])
    offset = float(prose["bbox"][0]) - line_x
    if not 8.0 <= offset <= 18.0:
        raise SystemExit(f"Unexpected source gap before Blue Totem: {offset:.3f}pt")
    current = line.get("renderTextOffsetPt")
    if current is not None and abs(float(current) - offset) > 0.01:
        raise SystemExit(f"Unexpected previous rendering offset: {current}")
    line["renderTextOffsetPt"] = offset
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"p.83 {LINE_ID}: preserved {offset:.3f}pt source advance after the cropped BLUE token label")


if __name__ == "__main__":
    main()
