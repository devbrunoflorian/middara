"""Preserve source PDF advances around the inline DISCARD/EXHAUST tags on p.47."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/public/pages/page_047/page_047_dom.json"
EXPECTED = {
    "line_14_0": "1.\t Condition Tags: Tags such as ✘DISCARD or ",
    "line_14_1": "EXHAUST . See ",
}


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next((item for item in data["blocks"] if item.get("id") == "block_14"), None)
    lines = {line.get("id"): line for line in (block or {}).get("lines", [])}
    for line_id, expected_text in EXPECTED.items():
        line = lines.get(line_id)
        if line is None:
            raise SystemExit(f"p.47 expected block_14/{line_id} was not found")
        spans = line.get("spans", [])
        actual_text = "".join(str(span.get("text", "")) for span in spans)
        if actual_text != expected_text:
            raise SystemExit(f"p.47 {line_id} changed; expected {expected_text!r}, got {actual_text!r}")
        if line.get("renderSourceSpanGeometry") and line.get("renderSourceGeometryThroughSpan") != len(spans) - 1:
            raise SystemExit(f"p.47 {line_id} has unexpected existing source geometry metadata")
        line["renderSourceSpanGeometry"] = True
        line["renderSourceGeometryThroughSpan"] = len(spans) - 1
        print(f"p.47 {line_id}: preserve source advances through span {len(spans) - 1}")
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
