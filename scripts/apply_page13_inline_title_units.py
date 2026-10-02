"""Split the two verified p.13 title runs into independent editor targets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_JSON = ROOT / "apps/web/public/pages/page_013/page_013_dom.json"
EXPECTED = [
    {"text": "Adventure Mode ", "size": 18.0},
    {"text": "Continued", "size": 11.0},
]
UNITS = [
    {"id": "p13-adventure-mode-title", "spanRefs": ["line_53_0:0"]},
    {"id": "p13-adventure-mode-continued", "spanRefs": ["line_53_0:1"]},
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    data = json.loads(PAGE_JSON.read_text(encoding="utf-8"))
    blocks = [block for block in data.get("blocks", []) if block.get("id") == "block_53"]
    if len(blocks) != 1:
        raise SystemExit(f"Expected one p.13 block_53, found {len(blocks)}")
    lines = [line for line in blocks[0].get("lines", []) if line.get("id") == "line_53_0"]
    if len(lines) != 1:
        raise SystemExit(f"Expected one p.13 line_53_0, found {len(lines)}")
    spans = [span for span in lines[0].get("spans", []) if span.get("text", "").strip()]
    actual = [{"text": span.get("text"), "size": float(span.get("size", -1))} for span in spans]
    if actual != EXPECTED or any(span.get("font") != "Cinzel-Regular" for span in spans):
        raise SystemExit(f"P.13 title run signature changed: {actual}")
    existing = blocks[0].get("typographicSpanUnits")
    if existing is not None and existing != UNITS:
        raise SystemExit("Existing p.13 typographicSpanUnits conflict with verified run refs")
    print("Verified p.13 inline title runs: Cinzel 18 pt `Adventure Mode` + Cinzel 11 pt `Continued`.")
    print(f"Separate inline edit keys: {len(UNITS)}; already applied={existing is not None}; apply={args.apply}")
    if args.apply and existing is None:
        blocks[0]["typographicSpanUnits"] = UNITS
        PAGE_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Added run-level edit units without changing source spans, glyphs, bboxes, or line IDs.")


if __name__ == "__main__":
    main()
