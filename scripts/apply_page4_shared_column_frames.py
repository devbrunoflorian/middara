"""Set p. 4 repeated text units to the measured maximum frame per column.

The source ink bboxes and line lineage remain untouched. By default this is a
dry-run; --apply writes only the 28 unit frame widths in page_004_dom.json.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE_JSON = ROOT / "apps/web/public/pages/page_004/page_004_dom.json"
LEFT_IDS = [f"block_{index}" for index in range(8, 16)]
RIGHT_IDS = [f"block_{index}" for index in range(18, 24)]
EXPECTED_X = {"left": 86.52749633789062, "right": 419.7499084472656}
EXPECTED_WIDTH = {"left": 144.42996215820312, "right": 157.75015258789062}
EPSILON = 0.02


def close(a: float, b: float) -> bool:
    return abs(a - b) <= EPSILON


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the guarded frame widths")
    args = parser.parse_args()

    data = json.loads(PAGE_JSON.read_text(encoding="utf-8"))
    if data.get("page_number") != 4 or not close(float(data.get("width", 0)), 820.346):
        raise SystemExit("Page signature mismatch; refusing to modify the file")
    blocks = {block.get("id"): block for block in data.get("blocks", [])}
    changes: list[tuple[dict, float, str]] = []

    for column, ids in (("left", LEFT_IDS), ("right", RIGHT_IDS)):
        selected = []
        for block_id in ids:
            block = blocks.get(block_id)
            if block is None or len(block.get("typographicUnits", [])) != 2:
                raise SystemExit(f"Missing verified heading/body units in {block_id}")
            lines = block.get("lines", [])
            units = block["typographicUnits"]
            if not lines or len(units[0]["field"].get("lineIds", [])) != 1:
                raise SystemExit(f"Unexpected heading/body lineage in {block_id}")
            if units[0]["id"] != units[1]["id"].removesuffix("-body") + "-heading":
                raise SystemExit(f"Unexpected unit IDs in {block_id}")
            x = float(units[0]["field"]["frame"]["x"])
            if not close(x, EXPECTED_X[column]):
                raise SystemExit(f"Unexpected {column} column x in {block_id}: {x}")
            line_by_id = {line["id"]: line for line in lines}
            for unit in units:
                field = unit["field"]
                if not field.get("lineIds") or any(line_id not in line_by_id for line_id in field["lineIds"]):
                    raise SystemExit(f"Unknown source line in {block_id}/{unit['id']}")
                if field["frame"].get("textAlign") != "left":
                    raise SystemExit(f"Unexpected alignment in {block_id}/{unit['id']}")
                if not close(float(field["frame"]["x"]), EXPECTED_X[column]):
                    raise SystemExit(f"Heading/body x differ in {block_id}/{unit['id']}")
                ink_width = max(float(line_by_id[line_id].get("availableWidth", 0)) for line_id in field["lineIds"])
                selected.append((block, unit, ink_width, column))

        measured_max = max(item[2] for item in selected)
        if not close(measured_max, EXPECTED_WIDTH[column]):
            raise SystemExit(f"Measured {column} maximum changed: {measured_max}")
        for block, unit, ink_width, _ in selected:
            frame = unit["field"]["frame"]
            old_width = float(frame["width"])
            if not (close(old_width, ink_width) or close(old_width, EXPECTED_WIDTH[column])):
                raise SystemExit(f"Unexpected existing frame width in {block['id']}/{unit['id']}: {old_width}")
            if not close(float(frame["x"]) + EXPECTED_WIDTH[column], EXPECTED_X[column] + EXPECTED_WIDTH[column]):
                raise SystemExit("Frame endpoint invariant failed")
            changes.append((frame, EXPECTED_WIDTH[column], f"{block['id']}/{unit['id']}"))

    print("Page 4 shared-column frame dry run:")
    print(f"  left:  x={EXPECTED_X['left']:.2f} pt, width={EXPECTED_WIDTH['left']:.2f} pt, units=16")
    print(f"  right: x={EXPECTED_X['right']:.2f} pt, width={EXPECTED_WIDTH['right']:.2f} pt, units=12")
    print("  source line IDs, ink bboxes, text alignment and line-height remain unchanged")
    print(f"  write={args.apply}")
    if args.apply:
        for frame, width, _label in changes:
            frame["width"] = width
        PAGE_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {len(changes)} frame widths in {PAGE_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
