"""Keep page 9 reward bullets fixed and give every reward item the full column frame."""

from __future__ import annotations

import json
from pathlib import Path


DOM_PATH = Path("apps/web/public/pages/page_009/page_009_dom.json")
EXPECTED = {
    "block_24": "RESTORE ADVENTURERS:",
    "block_25": "GAIN XP",
    "block_26": "SHOP AND TRAIN:",
    "block_27": "CONTINUE:",
}
MARKER = "\u2022\t"


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    blocks = {block["id"]: block for block in data["blocks"]}
    reference = blocks["block_23"]
    reference_text = "".join(
        span.get("text", "") for span in reference["lines"][0].get("spans", [])
    )
    if not reference_text.startswith("Once you complete an Encounter"):
        raise ValueError("The full-width Encounter Rewards paragraph changed")
    frame_x = reference["lines"][0]["availableX"]
    frame_width = reference["lines"][0]["availableWidth"]

    for block_id, expected_label in EXPECTED.items():
        block = blocks[block_id]
        lines = block.get("lines", [])
        if len(lines) < 2:
            raise ValueError(f"{block_id} no longer has a separate marker line and text line")

        marker = "".join(span.get("text", "") for span in lines[0].get("spans", []))
        first_text = "".join(span.get("text", "") for span in lines[1].get("spans", []))
        if marker != MARKER or not first_text.startswith(expected_label):
            raise ValueError(
                f"Unexpected source content in {block_id}: marker={marker!r}, text={first_text[:50]!r}"
            )
        block["staticEditorLineIndexes"] = [0]
        block["layoutFrame"] = {"x": frame_x, "width": frame_width}

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Marked four page 9 reward bullets as static and assigned their shared "
        f"{frame_width:.2f} pt column frame: {', '.join(EXPECTED)}"
    )


if __name__ == "__main__":
    main()
