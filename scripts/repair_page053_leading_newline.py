"""Strip an extraction-only leading newline from the p.53 conviction example."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/public/pages/page_053/page_053_dom.json"
BLOCK_ID = "block_25"
LINE_ID = "line_25_6"
EXPECTED_PREFIX = "\nTo make a Conviction Check, each figure targeted by the Spell rolls "


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next((item for item in data["blocks"] if item.get("id") == BLOCK_ID), None)
    line = next((item for item in (block or {}).get("lines", []) if item.get("id") == LINE_ID), None)
    if line is None:
        raise SystemExit(f"p.53 expected {BLOCK_ID}/{LINE_ID} was not found")
    spans = line.get("spans", [])
    if not spans or not str(spans[0].get("text", "")).startswith(EXPECTED_PREFIX):
        raise SystemExit("p.53 line_25_6 no longer has the audited leading newline; re-inspect before applying")
    visible = str(spans[0]["text"]).lstrip("\r\n")
    existing = spans[0].get("renderTextOverride")
    if existing is not None and existing != visible:
        raise SystemExit(f"Unexpected existing renderTextOverride: {existing!r}")
    spans[0]["renderTextOverride"] = visible
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"p.53 {BLOCK_ID}/{LINE_ID}: stripped leading newline for rendering only")


if __name__ == "__main__":
    main()
