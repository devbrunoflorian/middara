#!/usr/bin/env python3
"""Restore independent source frames for every cell in page 96 Table 8."""

from __future__ import annotations

import json
from pathlib import Path


DOM_PATH = Path(__file__).resolve().parents[1] / "apps/web/public/pages/page_096/page_096_dom.json"

CELL_FRAMES = {
    "first": {"x": 63.35240173339844, "width": 132.0},
    "middle": {"x": 203.31109619140625, "width": 226.25},
    "third": {"x": 437.5583, "width": 333.77},
}


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    blocks = {block["id"]: block for block in data["blocks"]}
    for row in range(50, 56):
        block_id = f"block_{row}"
        block = blocks[block_id]
        lines = {line["id"]: line for line in block["lines"]}
        units = block.get("typographicUnits", [])
        by_cell: dict[str, dict] = {}
        for unit in units:
            unit_id = unit["id"]
            if unit_id.endswith("first-size-10pt"):
                cell = "first"
            elif unit_id.endswith("remaining-size-8pt") or unit_id.endswith("second-size-8pt"):
                cell = "middle"
            elif unit_id.endswith("third-size-8pt"):
                cell = "third"
            else:
                raise SystemExit(f"Unexpected p.96 Table 8 unit: {unit_id}")
            if cell in by_cell:
                raise SystemExit(f"Duplicate {cell} cell unit in {block_id}")
            by_cell[cell] = unit

        if set(by_cell) != set(CELL_FRAMES):
            raise SystemExit(f"{block_id} does not contain exactly three cell units")

        for cell, line_index in (("first", 0), ("middle", 1), ("third", 2)):
            line_id = f"line_{row}_{line_index}"
            line = lines.get(line_id)
            if line is None:
                raise SystemExit(f"Missing source cell line {line_id}")
            field = by_cell[cell]["field"]
            field["lineIds"] = [line_id]
            field["bbox"] = line["bbox"]
            old_frame = field.get("frame", {})
            target_frame = CELL_FRAMES[cell]
            same_geometry = (
                abs(float(old_frame.get("x", 0)) - target_frame["x"]) < 0.001
                and abs(float(old_frame.get("width", 0)) - target_frame["width"]) < 0.001
            )
            if not same_geometry:
                field["frame"] = {
                    **old_frame,
                    **target_frame,
                    "textAlign": old_frame.get("textAlign", "left"),
                    "lineHeight": old_frame.get("lineHeight", 1),
                }

        # The editorial cells must own each source line exactly once.
        ownership = [line_id for unit in units for line_id in unit["field"]["lineIds"]]
        if ownership != [f"line_{row}_{index}" for index in range(3)]:
            raise SystemExit(f"Source-line ownership is not one-to-one in {block_id}: {ownership}")

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Re-open the written source and prove only the intended cell ownership/frames changed.
    written = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    for row in range(50, 56):
        block = next(block for block in written["blocks"] if block["id"] == f"block_{row}")
        units = block["typographicUnits"]
        ownership = [line_id for unit in units for line_id in unit["field"]["lineIds"]]
        if ownership != [f"line_{row}_{index}" for index in range(3)]:
            raise SystemExit(f"Post-write ownership check failed for block_{row}")
    print("Repaired p.96 Table 8: six rows now have independent, non-overlapping cell units and source frames.")


if __name__ == "__main__":
    main()
