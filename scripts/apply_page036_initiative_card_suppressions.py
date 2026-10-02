"""Hide only card labels already printed in the p. 36 initiative-card art."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_036/page_036_dom.json"
AUDIT_ID = "page36-initiative-card-background-text-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-user-visual-ghost-audit-pages-20-43.md"

# Each of the six initiative cards appears twice. Card name and tiny card ID
# are legible in the artwork; the turn labels below them remain live text.
TARGETS = {
    "line_15_0": ("block_15", "Remi", (288.8290, 714.3728, 305.5215, 723.4313)),
    "line_16_0": ("block_16", "585 / 873  V1.2  UM1-", (299.9557, 727.1996, 322.4901, 729.8787)),
    "line_20_0": ("block_20", "Nightingale", (425.4092, 714.3728, 470.9036, 723.4313)),
    "line_21_0": ("block_21", "586 / 873  V1.2  UM1-", (450.9309, 727.1996, 473.4720, 729.8787)),
    "line_25_0": ("block_25", "Rook", (513.8492, 714.3728, 533.4447, 723.4313)),
    "line_26_0": ("block_26", "587 / 873  V1.2  UM1-", (526.4537, 727.1996, 548.9634, 729.8787)),
    "line_30_0": ("block_30", "Cave Sickle 1-3", (347.2676, 715.6429, 398.0647, 724.7014)),
    "line_31_0": ("block_31", "589 / 873  V1.2  UM1-", (375.4514, 727.1996, 397.9813, 729.8787)),
    "line_35_0": ("block_35", "Zeke", (590.8499, 714.3728, 607.1661, 723.4313)),
    "line_36_0": ("block_36", "588 / 873  V1.2  UM1-", (601.7604, 727.1996, 624.3239, 729.8787)),
    "line_40_0": ("block_40", "Water Loa 1-2", (198.0642, 715.4678, 245.3058, 724.5263)),
    "line_41_0": ("block_41", "591 / 873  V1.2  UM1-", (224.5384, 727.0245, 247.0011, 729.7035)),
    "line_47_0": ("block_47", "Remi", (288.8290, 537.5842, 305.5215, 546.6428)),
    "line_48_0": ("block_48", "585 / 873  V1.2  UM1-", (299.9557, 550.4111, 322.4901, 553.0901)),
    "line_52_0": ("block_52", "Nightingale", (425.4092, 537.5842, 470.9036, 546.6428)),
    "line_53_0": ("block_53", "586 / 873  V1.2  UM1-", (450.9309, 550.4111, 473.4720, 553.0901)),
    "line_57_0": ("block_57", "Rook", (513.8492, 537.5842, 533.4447, 546.6428)),
    "line_58_0": ("block_58", "587 / 873  V1.2  UM1-", (526.4537, 550.4111, 548.9634, 553.0901)),
    "line_62_0": ("block_62", "Cave Sickle 1-3", (347.2676, 538.8542, 398.0647, 547.9128)),
    "line_63_0": ("block_63", "589 / 873  V1.2  UM1-", (375.4514, 550.4111, 397.9813, 553.0901)),
    "line_67_0": ("block_67", "Zeke", (590.8499, 537.5842, 607.1661, 546.6428)),
    "line_68_0": ("block_68", "588 / 873  V1.2  UM1-", (601.7604, 550.4111, 624.3239, 553.0901)),
    "line_72_0": ("block_72", "Water Loa 1-2", (198.0642, 538.6792, 245.3058, 547.7377)),
    "line_73_0": ("block_73", "591 / 873  V1.2  UM1-", (224.5384, 550.2359, 247.0011, 552.9149)),
}


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != 36:
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
            raise ValueError(f"Stale target, refusing to suppress p. 36 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line in (line for _block, line in found.values()):
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "this card name/ID is already legible in both p. 36 initiative-card images; "
            "painting the extracted HTML copy doubles the print"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 36,
            "region": "six card names and card IDs in both initiative-track rows",
            "rule": "suppress only card artwork copy; preserve the ROUND/FRONT/BACK and 1st–6th TURN labels",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 36: marked {len(found)} exact initiative-card copy lines")


if __name__ == "__main__":
    main()
