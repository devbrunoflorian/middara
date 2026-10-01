"""Add title/body edit units to the 14 verified page-4 component entries.

The original PDF lines/spans remain untouched. Existing block-level edits take
precedence in the renderer, so the old key remains a lossless fallback.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_JSON = ROOT / "apps/web/public/pages/page_004/page_004_dom.json"
HEADINGS = [
    "Rulebook", "Adventure Book", "Diagram Book", "Crawl Book", "Bounty Book",
    "Plastic Figures", "Custom Dice", "Adventurer Cards", "Combatant Cards",
    "Discipline Cards", "Familiar Cards", "Item Cards", "Combatant Loot Cards",
    "Monster Loot Cards",
]
BLOCK_IDS = ["block_8", "block_9", "block_10", "block_11", "block_12", "block_13", "block_14", "block_15",
             "block_18", "block_19", "block_20", "block_21", "block_22", "block_23"]


def union_bbox(lines: list[dict]) -> list[float]:
    return [
        min(float(line["bbox"][0]) for line in lines),
        min(float(line["bbox"][1]) for line in lines),
        max(float(line["bbox"][2]) for line in lines),
        max(float(line["bbox"][3]) for line in lines),
    ]


def make_field(block: dict, lines: list[dict], unit_id: str, align: str) -> dict:
    first = lines[0]
    return {
        "id": unit_id + "-field",
        "lineIds": [line["id"] for line in lines],
        "bbox": union_bbox(lines),
        "frame": {
            "x": float(first.get("availableX", first["bbox"][0])),
            "width": float(first.get("availableWidth", block["bbox"][2] - block["bbox"][0])),
            "textAlign": align,
            "lineHeight": 1,
        },
    }


def build_units(block: dict, heading: str) -> list[dict]:
    lines = block.get("lines", [])
    heading_matches = [
        line for line in lines
        if "".join(span.get("text", "") for span in line.get("spans", [])).strip() == heading
    ]
    if len(heading_matches) != 1:
        raise SystemExit(f"Expected exactly one {heading!r} heading in {block['id']}; found {len(heading_matches)}")
    heading_line = heading_matches[0]
    if not heading_line.get("spans") or any(
        span.get("font") != "Cinzel-Regular" or float(span.get("size", -1)) != 12.0
        for span in heading_line["spans"]
    ):
        raise SystemExit(f"Heading signature mismatch in {block['id']}: {heading_line['id']}")
    heading_index = lines.index(heading_line)
    if heading_index != 0:
        raise SystemExit(f"Expected heading to lead {block['id']}; got line index {heading_index}")
    body_lines = lines[1:]
    if not body_lines:
        raise SystemExit(f"Missing body in {block['id']}")
    for line in body_lines:
        if not line.get("spans") or any(float(span.get("size", -1)) != 10.0 for span in line["spans"]):
            raise SystemExit(f"Unexpected body signature in {block['id']}:{line.get('id')}")

    base = "p4-" + heading.casefold().replace(" ", "-")
    return [
        {"id": base + "-heading", "field": make_field(block, [heading_line], base + "-heading", "left")},
        {"id": base + "-body", "field": make_field(block, body_lines, base + "-body", "left")},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write exact page-4 field definitions")
    args = parser.parse_args()
    data = json.loads(PAGE_JSON.read_text(encoding="utf-8"))
    blocks = data.get("blocks", [])
    if len(blocks) < 14:
        raise SystemExit(f"Expected at least 14 page-4 blocks; found {len(blocks)}")

    verified = []
    for index, (heading, expected_id) in enumerate(zip(HEADINGS, BLOCK_IDS)):
        block = next((candidate for candidate in blocks if candidate.get("id") == expected_id), None)
        if block is None:
            raise SystemExit(f"Missing expected editorial block {expected_id}")
        if block.get("id") != expected_id:
            raise SystemExit(f"Block sequence changed at index {index}: expected {expected_id}, got {block.get('id')}")
        units = build_units(block, heading)
        existing = block.get("typographicUnits")
        if existing is not None and existing != units:
            raise SystemExit(f"Existing unit definitions differ for {block['id']}")
        verified.append((block, units, existing is not None))

    print("Verified page 4 component heading/body pairs:")
    for block, units, already_applied in verified:
        print(f"  {block['id']}: {units[0]['id']} + {units[1]['id']}; already applied={already_applied}")
    print(f"Separate edit targets: {len(verified) * 2}; apply={args.apply}")
    if args.apply:
        for block, units, already_applied in verified:
            if not already_applied:
                block["typographicUnits"] = units
        PAGE_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Added verified page-local edit units; source text, spans, bboxes, and IDs are unchanged.")


if __name__ == "__main__":
    main()
