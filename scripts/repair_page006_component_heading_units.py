"""Keep wrapped page 6 component headings together and separate from body copy."""

from __future__ import annotations

import json
from pathlib import Path


DOM_PATH = Path("apps/web/public/pages/page_006/page_006_dom.json")
COMPONENTS = {
    "block_102": {
        "heading_unit": "p6-block-102-heading-size-12pt",
        "body_unit": "p6-block-102-body-size-10pt",
        "heading_line_ids": ["line_102_0", "line_102_1"],
        "heading_text": "Stamina Point (SP) tokens",
        "body_first_line": "During the Refresh Phase of a",
    },
    "block_106": {
        "heading_unit": "p6-block-106-heading-size-12pt",
        "body_unit": "p6-block-106-body-size-10pt",
        "heading_line_ids": ["line_106_0", "line_106_1"],
        "heading_text": "Cardboard Figure Standups",
        "body_first_line": "Some Combatant Cards in the",
    },
}


def line_text(line: dict) -> str:
    return "".join(span.get("text", "") for span in line.get("spans", []))


def normalized(text: str) -> str:
    return " ".join(text.replace("\n", " ").split())


def union_bbox(lines: list[dict]) -> list[float]:
    boxes = [line["bbox"] for line in lines]
    return [
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    ]


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    blocks = {block["id"]: block for block in data["blocks"]}

    for block_id, spec in COMPONENTS.items():
        block = blocks[block_id]
        lines = {line["id"]: line for line in block.get("lines", [])}
        units = {unit["id"]: unit for unit in block.get("typographicUnits", [])}
        heading = units[spec["heading_unit"]]["field"]
        body = units[spec["body_unit"]]["field"]

        actual_heading = normalized(
            " ".join(line_text(lines[line_id]) for line_id in spec["heading_line_ids"])
        )
        if actual_heading.casefold() != spec["heading_text"].casefold():
            raise ValueError(f"Unexpected {block_id} heading: {actual_heading!r}")
        heading_line_ids = set(spec["heading_line_ids"])
        remaining_body_ids = [
            line_id for line_id in body["lineIds"] if line_id not in heading_line_ids
        ]
        if not remaining_body_ids or normalized(line_text(lines[remaining_body_ids[0]])) != spec["body_first_line"]:
            raise ValueError(f"Unexpected {block_id} body start")

        heading_spans = [
            span
            for line_id in spec["heading_line_ids"]
            for span in lines[line_id].get("spans", [])
            if span.get("text", "").strip()
        ]
        if not heading_spans or any(
            span.get("font") != "Cinzel-Regular" or abs(span.get("size", 0) - 12) > 0.01
            for span in heading_spans
        ):
            raise ValueError(f"{block_id} heading typography changed; re-audit before splitting")

        heading["lineIds"] = spec["heading_line_ids"]
        heading["bbox"] = union_bbox([lines[line_id] for line_id in heading["lineIds"]])

        heading_ids = set(heading["lineIds"])
        body["lineIds"] = [
            line_id for line_id in body["lineIds"] if line_id not in heading_ids
        ]
        if not body["lineIds"]:
            raise ValueError(f"{block_id} body became empty")
        body["bbox"] = union_bbox([lines[line_id] for line_id in body["lineIds"]])

    DOM_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Separated the wrapped 12 pt headings from the 10 pt copy in page 6 blocks 102 and 106.")


if __name__ == "__main__":
    main()
