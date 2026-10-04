"""Match p.76's inline Force asterisk to its small source-PDF appearance.

The extractor reports an 18pt font box for this single `*`, even though the
source glyph is visually about the size of the surrounding 10pt prose.  Keep
the original span/bbox for editing, render it at 10pt, and lock the line to its
measured source advances so following words do not shift.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/public/pages/page_076/page_076_dom.json"
BLOCK_ID = "block_8"
LINE_ID = "line_8_27"
EXPECTED_SIZE_PT = 18.0
TARGET_RENDER_SIZE_PT = 10.0


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next((item for item in data["blocks"] if item.get("id") == BLOCK_ID), None)
    line = next((item for item in block["lines"] if item.get("id") == LINE_ID), None) if block else None
    glyph = next((span for span in line.get("spans", []) if span.get("text") == "*"), None) if line else None
    if glyph is None or abs(float(glyph.get("size", 0)) - EXPECTED_SIZE_PT) > 0.2:
        raise SystemExit("p.76 target line no longer has the source-confirmed 18pt Force asterisk")
    if not ("Force" in "".join(span.get("text", "") for span in line["spans"]) and "these Espers" in "".join(span.get("text", "") for span in line["spans"])):
        raise SystemExit("p.76 target line text changed; refusing stale asterisk repair")

    glyph["renderSizeOverridePt"] = TARGET_RENDER_SIZE_PT
    line["renderSourceSpanGeometry"] = True
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("p.76 block_8/line_8_27 '*' browser size 18pt -> 10pt; source span geometry preserved")


if __name__ == "__main__":
    main()
