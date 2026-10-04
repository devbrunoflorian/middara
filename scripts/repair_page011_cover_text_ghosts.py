"""Remove the three confirmed editable ghosts over the printed p.11 book cover.

The user-facing keys page_11_block_1, page_11_block_3, and page_11_block_4
map to zero-based DOM indices 1, 3, and 4. Keep the original blocks in place so
all later page_N_block_N keys and any saved translation records remain stable.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM = ROOT / "apps/web/public/pages/page_011/page_011_dom.json"

# editor index -> (stable source block id, required content fragment)
TARGETS = {
    1: ("block_11725", "Unintentional Malum:"),
    3: ("block_11727", "ACT I"),
    4: ("block_11732", "By Kristopher Miles & Brooklynn Lundberg"),
}


def block_text(block: dict) -> str:
    return " ".join(
        "".join(span.get("text", "") for span in line.get("spans", []))
        for line in block.get("lines", [])
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="hide the three confirmed ghost blocks")
    args = parser.parse_args()

    data = json.loads(DOM.read_text(encoding="utf-8"))
    blocks = data.get("blocks", [])
    if max(TARGETS) >= len(blocks):
        raise SystemExit(f"Expected at least {max(TARGETS) + 1} source blocks on p.11")

    to_hide = []
    for index, (expected_id, fragment) in TARGETS.items():
        block = blocks[index]
        actual_text = block_text(block)
        if block.get("id") != expected_id or fragment not in actual_text:
            raise SystemExit(
                f"p.11 DOM changed at editor index {index}: "
                f"expected {expected_id!r} containing {fragment!r}; "
                f"found {block.get('id')!r} with {actual_text!r}"
            )
        to_hide.append((index, block, actual_text))

    if all(block.get("hiddenFromPage") is True for _, block, _ in to_hide):
        print("p.11 cover ghosts already hidden: page_11_block_1, _3, _4")
        return

    print("p.11 confirmed duplicate blocks:")
    for index, block, actual_text in to_hide:
        print(f"  page_11_block_{index}: {block['id']} — {actual_text}")

    if args.apply:
        for _, block, _ in to_hide:
            block["hiddenFromPage"] = True
        DOM.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Applied hiddenFromPage to the three named blocks; DOM entries and editor indices remain stable.")
    else:
        print("Dry run only. Re-run with --apply to hide the three blocks.")


if __name__ == "__main__":
    main()
