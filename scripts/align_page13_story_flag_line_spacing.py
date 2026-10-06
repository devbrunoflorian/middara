#!/usr/bin/env python3
"""Set the source-matched editable line-height for the p.13 Story Flag example.

This is the regression/example for the pattern-first line-spacing fix: a short
standalone label line followed by one instruction line, with source symbols
anchored on both rows. It records source geometry only; it never edits text or
translation records.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"
PAGE_JSON = PAGE_ROOT / "page_013" / "page_013_dom.json"
INLINE_JSON = PAGE_ROOT / "page_013" / "inline_elements.json"
EXPECTED_LINES = {
    "line_19_0": " New Story Flag:",
    "line_19_1": "Mark the Story Flag ",
    "line_19_2": " Experienced Guide on the Adventure Sheet.",
}
EXPECTED_ICON_ANCHORS = {
    ("story.pencil", "line_19_0", "before"),
    ("story.flag", "line_19_1", "after"),
}


def text(line: dict[str, Any]) -> str:
    return "".join(str(span.get("text", "")) for span in line.get("spans", []))


def exact_pattern_occurrences() -> list[tuple[int, str]]:
    matches: list[tuple[int, str]] = []
    for page_file in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        data = json.loads(page_file.read_text(encoding="utf-8"))
        sidecar = page_file.with_name("inline_elements.json")
        elements = json.loads(sidecar.read_text(encoding="utf-8")).get("elements", []) if sidecar.exists() else []
        for block in data.get("blocks", []):
            lines = [line for line in block.get("lines", []) if text(line).strip()]
            if len(lines) < 2 or not text(lines[0]).strip().endswith(":"):
                continue
            refs = {(element.get("anchor", {}).get("lineId"), element.get("anchor", {}).get("side"))
                    for element in elements if element.get("anchor", {}).get("blockId") == block.get("id")}
            first_line_id = lines[0].get("id")
            later_line_ids = {line.get("id") for line in lines[1:]}
            first_has_symbol = any(line_id == first_line_id and side in {"before", "replace"}
                                   for line_id, side in refs)
            later_has_symbol = any(line_id in later_line_ids and side in {"before", "after", "replace"}
                                   for line_id, side in refs)
            if first_has_symbol and later_has_symbol and len(lines) <= 4:
                matches.append((int(data.get("page_number", 0)), str(block.get("id", ""))))
    return matches


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the verified source-matched default")
    args = parser.parse_args()

    matches = exact_pattern_occurrences()
    expected_match = (13, "block_19")
    if matches != [expected_match]:
        raise SystemExit(f"Expected exactly one equivalent source family member {expected_match}; found {matches}")

    page = json.loads(PAGE_JSON.read_text(encoding="utf-8"))
    blocks = [(index, block) for index, block in enumerate(page.get("blocks", [])) if block.get("id") == "block_19"]
    if len(blocks) != 1 or blocks[0][0] != 5:
        raise SystemExit(f"Expected p.13 block_19 at stable editor index 5; found {[(i, b.get('id')) for i, b in blocks]}")
    block = blocks[0][1]
    line_map = {line.get("id"): line for line in block.get("lines", [])}
    actual = {line_id: text(line_map[line_id]) for line_id in EXPECTED_LINES if line_id in line_map}
    if actual != EXPECTED_LINES:
        raise SystemExit(f"p.13 source line signature changed: {actual}")
    if any(
        span.get("font") not in {"OptimaLTStd", "OptimaLTStd-Bold"} or abs(float(span.get("size", 0)) - 10) > 0.05
        for line in line_map.values() for span in line.get("spans", []) if span.get("text", "").strip()
    ):
        raise SystemExit("p.13 Story Flag text is no longer 10 pt Optima; review before applying")

    elements = json.loads(INLINE_JSON.read_text(encoding="utf-8")).get("elements", [])
    actual_anchors = {
        (element.get("symbolId"), element.get("anchor", {}).get("lineId"), element.get("anchor", {}).get("side"))
        for element in elements if element.get("anchor", {}).get("blockId") == "block_19"
    }
    if not EXPECTED_ICON_ANCHORS.issubset(actual_anchors):
        raise SystemExit(f"Expected the pencil and flag anchors on their original rows; found {actual_anchors}")

    header_top = float(line_map["line_19_0"]["bbox"][1])
    body_top = min(float(line_map[line_id]["bbox"][1]) for line_id in ("line_19_1", "line_19_2"))
    body_size = 10.0
    source_line_height = round((body_top - header_top) / body_size, 4)
    if not 1.0 < source_line_height < 2.0:
        raise SystemExit(f"Unexpected p.13 source interline ratio: {source_line_height}")
    old = block.get("defaultLineHeight")
    if old is not None and abs(float(old) - source_line_height) > 0.01:
        raise SystemExit(f"Existing defaultLineHeight {old} conflicts with measured source ratio {source_line_height}")

    print(f"Pattern count: {len(matches)} exact match: p.13 block_19 (stable key page_13_block_5)")
    print(f"Measured source row pitch: {body_top - header_top:.4f} pt / {body_size:g} pt = line-height {source_line_height:g}")
    print(f"Existing source default: {old}; apply={args.apply}")
    if args.apply and old is None:
        block["defaultLineHeight"] = source_line_height
        PAGE_JSON.write_text(json.dumps(page, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Saved the measured default line-height to p.13 source metadata; no translation data was changed.")


if __name__ == "__main__":
    main()
