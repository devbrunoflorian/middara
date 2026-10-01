"""Restore page 63's Wingdings U+0088 item markers using the local font cmap.

The PDF text layer stores these symbols as byte U+0088, while the bundled
Wingdings font exposes the matching glyph at U+F088. The script is deliberately
limited to this exact page/font/source character and is dry-run by default.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_JSON = ROOT / "apps/web/public/pages/page_063/page_063_dom.json"
SOURCE_FONT = "Wingdings-Regular"
SOURCE_CHAR = "\u0088"
DISPLAY_CHAR = "\uf088"
DISPLAY_FONT = "MiddaraWingdingsP63"
EXPECTED_COUNT = 114


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write display overrides to the exact matching spans")
    parser.add_argument("--limit", type=int, default=0, help="limit the number of changes for a tracer-bullet preview")
    args = parser.parse_args()

    data = json.loads(PAGE_JSON.read_text(encoding="utf-8"))
    if data.get("page_number") != 63:
        raise SystemExit(f"Refusing unexpected page_number={data.get('page_number')!r}")
    matches = [
        span
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
        for span in line.get("spans", [])
        if span.get("font") == SOURCE_FONT and span.get("text") == SOURCE_CHAR
    ]
    already = [span for span in matches if span.get("pictogramDisplayOverride") == DISPLAY_CHAR and span.get("pictogramFontOverride") == DISPLAY_FONT]
    pending = [span for span in matches if span.get("pictogramDisplayOverride") is None and span.get("pictogramFontOverride") is None]
    unexpected = [span for span in matches if span not in already and span not in pending]
    if len(matches) != EXPECTED_COUNT or unexpected:
        raise SystemExit(f"Refusing mismatch: exact candidates={len(matches)} (expected {EXPECTED_COUNT}), unexpected overrides={len(unexpected)}")
    limit = args.limit if args.limit > 0 else len(pending)
    selected = pending[:limit]
    print(f"Page 63 exact candidates: {len(matches)}; already mapped: {len(already)}; pending: {len(pending)}; selected: {len(selected)}")
    print(f"Mapping embedded PDF glyph 136 -> derived cmap U+F088 / {DISPLAY_FONT}; apply={args.apply}")
    if args.apply and selected:
        for span in selected:
            span["pictogramDisplayOverride"] = DISPLAY_CHAR
            span["pictogramFontOverride"] = DISPLAY_FONT
        PAGE_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {len(selected)} display overrides; source text, IDs, bboxes, and styles are unchanged.")


if __name__ == "__main__":
    main()
