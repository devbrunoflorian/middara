"""Hide only the Avian Flight and Like the Shadows card copy baked into p. 39 art."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_039/page_039_dom.json"
AUDIT_ID = "page39-card-art-background-text-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-user-visual-ghost-audit-pages-20-43.md"

# Both cards are visible and legible in the source PDF and the viewer background.
# Preserve the adjoining Example prose, callouts, diagram labels, and section text.
TARGETS = {
    "line_21_0": ("block_21", "Move 1 space in any direction (including diagonally).", (127.2034, 255.0132, 302.4696, 264.1880)),
    "line_22_0": ("block_22", "Avian Flight", (127.2034, 268.3482, 195.0810, 281.3176)),
    "line_22_1": ("block_22", "Remi is gifted with feathered wings that allow her to fly.", (127.2034, 278.8983, 294.1164, 289.1617)),
    "line_22_2": ("block_22", "Make a MOVE. Remi has FLIGHT for the duration of", (127.2034, 288.8657, 297.3986, 298.0251)),
    "line_22_3": ("block_22", "this movement. This Ability may only be used if Remi", (127.2001, 297.0091, 305.8783, 306.1993)),
    "line_22_4": ("block_22", "has less Damage than half of her total HP.", (127.2001, 305.2141, 264.2895, 314.3812)),
    "line_25_0": ("block_25", "2", (110.7015, 269.8864, 115.0311, 280.2600)),
    "line_29_0": ("block_29", "XP:3+", (163.4483, 605.4040, 180.3373, 613.3894)),
    "line_30_0": ("block_30", "EXHAUST", (248.2606, 646.2932, 275.9615, 653.9354)),
    "line_30_1": ("block_30", "Move up to 2 spaces. This movement does", (195.7093, 656.1669, 323.2346, 664.4050)),
    "line_30_2": ("block_30", "not provoke Break Attacks.", (218.8618, 664.0803, 298.1609, 672.3046)),
    "line_32_0": ("block_32", "Like the Shadows", (202.2765, 606.5233, 314.7486, 622.4942)),
    "line_33_0": ("block_33", "SUBTERFUGE • LVL 1", (224.8997, 626.4941, 291.9453, 634.7323)),
    "line_34_0": ("block_34", "“Improve upon the silence.”", (219.3984, 694.5903, 296.8454, 702.8491)),
}


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != 39:
        raise ValueError("Page signature changed; refusing to suppress text")

    found = {
        line.get("id"): (block, line)
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
        if line.get("id") in TARGETS
    }
    if set(found) != set(TARGETS):
        raise ValueError(f"Expected {len(TARGETS)} exact lines, found {len(found)}")

    for line_id, (expected_block, expected_text, expected_bbox) in TARGETS.items():
        block, line = found[line_id]
        text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
        bbox = line.get("bbox", [])
        if (
            block.get("id") != expected_block
            or text != expected_text
            or len(bbox) != 4
            or any(abs(actual - expected) > 0.03 for actual, expected in zip(bbox, expected_bbox))
        ):
            raise ValueError(f"Stale target, refusing to suppress p. 39 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line in (line for _block, line in found.values()):
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "this exact ability-card copy is already legible in the p. 39 background; "
            "the extracted HTML copy visibly doubles it"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 39,
            "region": "Avian Flight callout card and Like the Shadows Discipline card",
            "rule": "suppress only the fourteen confirmed card-copy lines; preserve neighboring explanations and examples",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 39: marked {len(found)} exact lines within two confirmed card-art regions")


if __name__ == "__main__":
    main()
