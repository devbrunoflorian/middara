#!/usr/bin/env python3
"""Restore page 9's saved heading/body translation keys without changing text."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_PATH = ROOT / "apps/web/public/pages/page_009/page_009_dom.json"
BLOCK_ID = "block_34"
EXPECTED_IDS = [
    "p9-block-34-font-size-12pt-unit-00",
    "p9-block-34-font-size-10pt-unit-01",
    "p9-block-34-font-size-10pt-unit-02",
    "p9-block-34-font-size-10pt-unit-03",
    "p9-block-34-font-size-10pt-unit-04",
    "p9-block-34-font-size-10pt-unit-05",
]
LEGACY_HEADING_ID = "p9-block-34-first-size-12pt"
LEGACY_BODY_ID = "p9-block-34-remaining-size-10pt"


def read_newline(path: Path) -> str:
    raw = path.read_bytes()
    return "\r\n" if b"\r\n" in raw else "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the verified unit-id alias to page JSON")
    args = parser.parse_args()

    newline = read_newline(PAGE_PATH)
    page = json.loads(PAGE_PATH.read_text(encoding="utf-8"))
    block = next((item for item in page.get("blocks", []) if item.get("id") == BLOCK_ID), None)
    if block is None:
        raise SystemExit(f"Expected {BLOCK_ID} in {PAGE_PATH}")

    units = block.get("typographicSpanUnits", [])
    ids = [unit.get("id") for unit in units]
    if ids == [LEGACY_HEADING_ID, LEGACY_BODY_ID]:
        print("Legacy IDs already restored; no change.")
        return
    if ids != EXPECTED_IDS:
        raise SystemExit(f"Unexpected unit IDs in {BLOCK_ID}: {ids!r}")

    spans = {
        f"{line['id']}:{index}": span
        for line in block.get("lines", [])
        for index, span in enumerate(line.get("spans", []))
    }
    heading_refs = units[0].get("spanRefs", [])
    body_refs = [ref for unit in units[1:] for ref in unit.get("spanRefs", [])]
    if len(heading_refs) != 1 or not heading_refs or not body_refs:
        raise SystemExit("Heading/body unit shape does not match the saved translation split")
    if len(set(heading_refs + body_refs)) != len(heading_refs) + len(body_refs):
        raise SystemExit("Duplicate spanRefs would be introduced")

    for ref in heading_refs:
        if ref not in spans or abs(float(spans[ref]["size"]) - 12.0) > 1e-6:
            raise SystemExit(f"Heading ref is missing or not 12 pt: {ref}")
    for ref in body_refs:
        if ref not in spans or abs(float(spans[ref]["size"]) - 10.0) > 1e-6:
            raise SystemExit(f"Body ref is missing or not 10 pt: {ref}")

    nonempty_refs = {
        ref for ref, span in spans.items()
        if str(span.get("text", "")).strip()
    }
    if set(heading_refs + body_refs) != nonempty_refs:
        raise SystemExit("The remapped units must cover each non-empty source span exactly once")

    block["typographicSpanUnits"] = [
        {"id": LEGACY_HEADING_ID, "spanRefs": heading_refs},
        {"id": LEGACY_BODY_ID, "spanRefs": body_refs},
    ]
    print(
        f"Verified {BLOCK_ID}: 1 heading span at 12 pt and {len(body_refs)} body spans at 10 pt; "
        f"the two unit IDs now match the existing Payload translations."
    )
    if not args.apply:
        print("Dry run only. Re-run with --apply to write the page JSON.")
        return

    rendered = json.dumps(page, ensure_ascii=False, indent=2) + "\n"
    if newline == "\r\n":
        rendered = rendered.replace("\n", "\r\n")
    PAGE_PATH.write_text(rendered, encoding="utf-8", newline="")
    print(f"Updated {PAGE_PATH.relative_to(ROOT)}; no translation or source span text changed.")


if __name__ == "__main__":
    main()
