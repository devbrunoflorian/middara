"""Make p.63 ability-list names individual no-wrap translation blocks.

Each source group currently combines an LVL heading, 3–11 checkbox rows, and
all row names in one Admin selection. Preserve each legacy group block hidden
in the DOM JSON, render its LVL heading and checkbox glyphs as read-only source
furniture, and give each name a stable independent editor key and the rest of
its column as a one-line translation frame.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM = ROOT / "apps/web/public/pages/page_063/page_063_dom.json"

# source block -> (discipline, level, column index)
GROUPS = {
    "block_2": ("assemblage", 1, 0),
    "block_95": ("assemblage", 2, 1),
    "block_45": ("assemblage", 3, 2),
    "block_75": ("assemblage", 4, 3),
    "block_13": ("cruor", 1, 0),
    "block_103": ("cruor", 2, 1),
    "block_51": ("cruor", 3, 2),
    "block_79": ("cruor", 4, 3),
    "block_21": ("martial", 1, 0),
    "block_111": ("martial", 2, 1),
    "block_57": ("martial", 3, 2),
    "block_83": ("martial", 4, 3),
    "block_29": ("sanctus", 1, 0),
    "block_119": ("sanctus", 2, 1),
    "block_63": ("sanctus", 3, 2),
    "block_87": ("sanctus", 4, 3),
    "block_37": ("subterfuge", 1, 0),
    "block_127": ("subterfuge", 2, 1),
    "block_69": ("subterfuge", 3, 2),
    "block_91": ("subterfuge", 4, 3),
}

# Inferred from the source column starts and the gutters visible in the PDF.
# The last column ends before the right-side ornament.
COLUMN_RIGHTS = [276.5, 415.2, 554.0, 672.0]
EXPECTED_CHECKBOX_ROWS = 114


def slugify(text: str) -> str:
    value = text.casefold().replace("’", "'")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def nonempty_line_text(line: dict) -> str:
    return "".join(span.get("text", "") for span in line.get("spans", [])).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the p.63 layout repair")
    args = parser.parse_args()

    data = json.loads(DOM.read_text(encoding="utf-8"))
    blocks = data.get("blocks", [])
    block_by_id = {block.get("id"): block for block in blocks}

    if all(block_by_id.get(block_id, {}).get("hiddenFromPage") for block_id in GROUPS):
        generated = [block for block in blocks if block.get("id", "").startswith("p63-item-")]
        if len(generated) == EXPECTED_CHECKBOX_ROWS:
            print(f"p.63 already split: {len(GROUPS)} legacy groups hidden, {len(generated)} item blocks")
            return
        raise SystemExit("p.63 is partially transformed; inspect the page DOM before retrying")

    if any(block.get("id", "").startswith(("p63-item-", "p63-fixed-")) for block in blocks):
        raise SystemExit("p.63 generated blocks already exist but legacy state is not complete")

    generated_blocks: list[dict] = []
    checkbox_count = 0
    header_count = 0
    column_lefts: dict[int, list[float]] = {i: [] for i in range(4)}

    for block_id, (discipline, level, column_index) in GROUPS.items():
        source_block = block_by_id.get(block_id)
        if source_block is None or source_block.get("hiddenFromPage"):
            raise SystemExit(f"Missing visible p.63 source group {block_id}")

        column_lefts[column_index].append(source_block["bbox"][0])
        visible_lines = [
            line for line in source_block.get("lines", [])
            if nonempty_line_text(line)
        ]
        headers = [line for line in visible_lines if nonempty_line_text(line).startswith("LVL ")]
        item_lines = [
            line for line in visible_lines
            if line.get("spans") and line["spans"][0].get("font", "").startswith("Wingdings")
        ]
        if len(headers) != 1:
            raise SystemExit(f"Expected one fixed LVL header in {block_id}; found {len(headers)}")
        if not item_lines:
            raise SystemExit(f"No checkbox rows found in {block_id}")

        fixed_lines: list[dict] = []
        header = copy.deepcopy(headers[0])
        header["id"] = f"p63-{block_id}-fixed-header"
        header["availableX"] = header["bbox"][0]
        header["availableWidth"] = header["bbox"][2] - header["bbox"][0]
        fixed_lines.append(header)
        header_count += 1

        item_specs: list[tuple[dict, dict, str]] = []
        for ordinal, source_line in enumerate(item_lines, 1):
            spans = source_line.get("spans", [])
            if len(spans) != 3 or spans[1].get("text") != " ":
                raise SystemExit(f"Unexpected checkbox/name span structure in {block_id}/{source_line.get('id')}")
            icon, _, name = spans
            if not icon.get("pictogramDisplayOverride") or not name.get("text", "").strip():
                raise SystemExit(f"Missing fixed checkbox or editable name in {block_id}/{source_line.get('id')}")

            # The source glyph remains rendered at its exact advance, but lives
            # in a non-editable static block separate from the text field.
            fixed_line = copy.deepcopy(source_line)
            fixed_line["id"] = f"p63-{block_id}-fixed-checkbox-{ordinal:02d}"
            fixed_line["spans"] = [copy.deepcopy(icon)]
            fixed_line["availableX"] = icon["bbox"][0]
            fixed_line["availableWidth"] = icon["bbox"][2] - icon["bbox"][0]
            fixed_lines.append(fixed_line)

            item_specs.append((source_line, copy.deepcopy(name), name["text"].strip()))
            checkbox_count += 1

        fixed_bounds = [line["bbox"] for line in fixed_lines]
        fixed_block = {
            "id": f"p63-fixed-{block_id}",
            "editorKey": f"p63_fixed_{discipline}_lvl{level}",
            "adminReadOnly": True,
            "bbox": [
                min(box[0] for box in fixed_bounds),
                min(box[1] for box in fixed_bounds),
                max(box[2] for box in fixed_bounds),
                max(box[3] for box in fixed_bounds),
            ],
            "zIndex": source_block.get("zIndex", 10),
            "lines": fixed_lines,
        }
        generated_blocks.append(fixed_block)

        right_edge = COLUMN_RIGHTS[column_index]
        for ordinal, (source_line, name_span, name) in enumerate(item_specs, 1):
            name_x = name_span["bbox"][0]
            line_y0, line_y1 = source_line["bbox"][1], source_line["bbox"][3]
            width = right_edge - name_x
            if width <= 0 or right_edge < source_line["bbox"][2]:
                raise SystemExit(f"Invalid no-wrap column frame for {block_id}/{source_line.get('id')}")

            key_part = f"{discipline}_lvl{level}_{slugify(name)}"
            item_line = copy.deepcopy(source_line)
            item_line["id"] = f"p63-{block_id}-name-{ordinal:02d}"
            item_line["bbox"] = [name_x, line_y0, name_span["bbox"][2], line_y1]
            item_line["availableX"] = name_x
            item_line["availableWidth"] = width
            item_line["spans"] = [name_span]

            item_block = {
                "id": f"p63-item-{key_part}",
                "editorKey": f"p63_discipline_{key_part}",
                "noWrap": True,
                "bbox": [name_x, line_y0, right_edge, line_y1],
                "layoutFrame": {
                    "x": name_x,
                    "width": width,
                    "textAlign": "left",
                    "lineHeight": 1,
                },
                "zIndex": source_block.get("zIndex", 10) + 1000 + ordinal,
                "lines": [item_line],
            }
            generated_blocks.append(item_block)

        source_block["hiddenFromPage"] = True

    if checkbox_count != EXPECTED_CHECKBOX_ROWS or header_count != len(GROUPS):
        raise SystemExit(
            f"Unexpected p.63 inventory: {checkbox_count} checkbox rows, {header_count} LVL headers"
        )
    for column_index, starts in column_lefts.items():
        if max(starts) - min(starts) > 0.6:
            raise SystemExit(f"Source blocks in column {column_index + 1} do not share an aligned x origin")

    if args.apply:
        data["blocks"].extend(generated_blocks)
        DOM.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"p.63 fixed layout: groups={len(GROUPS)}, headers={header_count}, "
        f"fixed checkboxes={checkbox_count}, separate item blocks={checkbox_count}, apply={args.apply}"
    )


if __name__ == "__main__":
    main()
