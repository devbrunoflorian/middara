"""Hide the extracted running header that is not present on source PDF page 88.

Page 88 is a full-page illustration. Its source render has only the artwork and
folio 88; `Variants Continued` belongs to page 87 and appears as an unwanted
HTML overlay on page 88. Keep the DOM block and its index stable for saved keys.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM = ROOT / "apps/web/public/pages/page_088/page_088_dom.json"
BLOCK_ID = "block_8"
EXPECTED_TEXT = "Variants Continued"
EXPECTED_BBOX = [85.88189697265625, 56.69243621826172, 242.97328186035156, 80.95643615722656]


def block_text(block: dict) -> str:
    return "".join(
        span.get("text", "")
        for line in block.get("lines", [])
        for span in line.get("spans", [])
    ).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="hide the confirmed unprinted heading")
    args = parser.parse_args()

    data = json.loads(DOM.read_text(encoding="utf-8"))
    block = next((item for item in data.get("blocks", []) if item.get("id") == BLOCK_ID), None)
    if block is None:
        raise SystemExit(f"Expected p.88 block {BLOCK_ID} was not found")
    if block_text(block) != EXPECTED_TEXT or block.get("bbox") != EXPECTED_BBOX:
        raise SystemExit(
            f"p.88 target changed: expected {EXPECTED_TEXT!r} at {EXPECTED_BBOX}; "
            f"found {block_text(block)!r} at {block.get('bbox')}"
        )
    if block.get("hiddenFromPage") is True:
        print("p.88 running heading is already hidden")
        return

    print(f"Confirmed p.88 heading ghost: {BLOCK_ID} — {EXPECTED_TEXT!r}; bbox={EXPECTED_BBOX}")
    if args.apply:
        block["hiddenFromPage"] = True
        DOM.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Applied hiddenFromPage to block_8; block index and text record remain stable.")
    else:
        print("Dry run only. Re-run with --apply to hide the unprinted heading.")


if __name__ == "__main__":
    main()
