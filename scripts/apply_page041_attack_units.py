#!/usr/bin/env python3
"""Add source-backed editorial fields for the p.41 attack procedure.

The existing visual blocks remain the parent containers. Unit IDs and editor
labels retain step/substep ownership; physical PDF lines are only the source
geometry backing each translated editorial unit.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_PATH = ROOT / "apps/web/public/pages/page_041/page_041_dom.json"


DEFINITIONS = {
    "block_30": [
        ("p41-step-4-heading", "Step 4 — heading", [0], None),
        ("p41-step-4-substep-a", "Step 4 — substep a", [1, 2, 3], "paragraph"),
        ("p41-step-4-substep-b", "Step 4 — substep b", [4, 5, 6, 7, 8], "paragraph"),
        ("p41-step-4-substep-b-important", "Step 4 — substep b — Important", [9, 10, 11], "paragraph"),
    ],
    "block_33": [
        ("p41-step-5-heading", "Step 5 — heading", [0], None),
        ("p41-step-5-substep-a", "Step 5 — substep a", [1, 2], "paragraph"),
        ("p41-step-5-substep-b", "Step 5 — substep b", [3, 4, 5], "paragraph"),
        ("p41-step-5-substep-c", "Step 5 — substep c", [6, 7, 8, 9, 10, 11], "paragraph"),
    ],
    "block_37": [
        ("p41-step-6-heading", "Step 6 — heading", [0], None),
        ("p41-step-6-substep-a", "Step 6 — substep a", [1, 2, 3], "paragraph"),
        ("p41-step-6-substep-b", "Step 6 — substep b", [4, 5, 6, 7], "paragraph"),
        ("p41-step-6-substep-c", "Step 6 — substep c", [8, 9, 10, 11, 12, 13], "paragraph"),
        ("p41-step-6-substep-d", "Step 6 — substep d", [14, 15, 16, 17, 18, 19], "paragraph"),
        ("p41-step-6-substep-e", "Step 6 — substep e", [20, 21, 22, 23, 24, 25], "paragraph"),
    ],
}


def bbox_union(lines: list[dict[str, Any]], fallback: list[float]) -> list[float]:
    boxes = [line.get("bbox") or fallback for line in lines]
    return [
        min(float(box[0]) for box in boxes),
        min(float(box[1]) for box in boxes),
        max(float(box[2]) for box in boxes),
        max(float(box[3]) for box in boxes),
    ]


def field(block: dict[str, Any], lines: list[dict[str, Any]], unit_id: str) -> dict[str, Any]:
    first = lines[0]
    first_text_span = next(
        (span for span in first.get("spans", []) if str(span.get("text", "")).strip()),
        None,
    )
    first_box = (first_text_span or {}).get("bbox") or first.get("bbox") or block["bbox"]
    frame_x = float(first_box[0])
    block_right = float(block["bbox"][2])
    return {
        "id": f"{unit_id}-field",
        "lineIds": [str(line["id"]) for line in lines],
        "bbox": bbox_union(lines, block["bbox"]),
        "frame": {
            "x": frame_x,
            "width": max(1.0, block_right - frame_x),
            "textAlign": "left",
            "lineHeight": 1.1,
        },
    }


def build_units(block: dict[str, Any]) -> list[dict[str, Any]]:
    definitions = DEFINITIONS[block["id"]]
    lines = block.get("lines", [])
    units = []
    covered: list[int] = []
    for unit_id, label, indexes, kind in definitions:
        if any(index < 0 or index >= len(lines) for index in indexes):
            raise SystemExit(f"{block['id']} is missing source lines for {unit_id}")
        selected = [lines[index] for index in indexes]
        if any(not str(line.get("id", "")) for line in selected):
            raise SystemExit(f"{block['id']} has an unidentifiable source line in {unit_id}")
        if any(not any(str(span.get("text", "")).strip() for span in line.get("spans", [])) for line in selected):
            raise SystemExit(f"{block['id']} {unit_id} includes an empty-only source line")
        covered.extend(indexes)
        unit = {"id": unit_id, "label": label, "field": field(block, selected, unit_id)}
        if kind:
            unit["kind"] = kind
        units.append(unit)
    nonempty = [index for index, line in enumerate(lines)
                if any(str(span.get("text", "")).strip() for span in line.get("spans", []))]
    if sorted(covered) != nonempty:
        raise SystemExit(f"{block['id']} units do not cover every editorial source line exactly once")
    return units


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the reviewed p.41 unit metadata")
    args = parser.parse_args()
    page = json.loads(PAGE_PATH.read_text(encoding="utf-8"))
    by_id = {block.get("id"): block for block in page.get("blocks", [])}
    summary = []
    for block_id in DEFINITIONS:
        block = by_id.get(block_id)
        if block is None:
            raise SystemExit(f"Source page is missing {block_id}")
        units = build_units(block)
        existing = block.get("typographicUnits")
        needs_kind = existing is not None and len(existing) == len(units) and all(
            current == expected
            or (expected.get("kind") == "paragraph" and "kind" not in current
                and {**current, "kind": "paragraph"} == expected)
            for current, expected in zip(existing, units)
        ) and existing != units
        if existing is not None and existing != units and not needs_kind:
            raise SystemExit(f"{block_id} has conflicting typographicUnits; inspect before replacing")
        summary.append({"block": block_id, "units": [unit["id"] for unit in units]})
        if args.apply and (existing is None or needs_kind):
            block["typographicUnits"] = units
    if args.apply:
        PAGE_PATH.write_text(json.dumps(page, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"apply": args.apply, "page": 41, "blocks": summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
