"""Suppress only the 30 confirmed HTML copies printed in p. 48 card artwork."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_048/page_048_dom.json"
AUDIT_ID = "page48-card-art-printed-text-duplicates-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-page48-card-text-tracer.md"
TARGETS = {
    # Hammer Helm: printed card text is visible in the art and doubled by HTML.
    "line_20_0": ("XP:3+", (495.58, 598.90, 511.96, 606.65)),
    "line_21_0": ("✤PASSIVE", (573.28, 632.28, 602.29, 639.70)),
    "line_21_2": ("Your Attacks Gain:", (561.21, 640.67, 616.23, 648.66)),
    "line_21_3": ("+1 PHYSICAL DMG", (558.46, 650.25, 617.12, 658.24)),
    "line_22_0": ("EXHAUST", (577.84, 661.42, 604.71, 668.84)),
    "line_22_1": ("When making a", (533.10, 671.01, 580.78, 678.99)),
    "line_22_2": ("Attack, if you have", (587.11, 671.01, 646.20, 679.95)),
    "line_22_3": ("a 2-handed Weapon equipped, you may", (529.58, 678.66, 649.72, 687.61)),
    "line_22_4": ("re-roll any dice in your Combat Dice Pool.", (526.40, 686.34, 649.17, 694.31)),
    "line_23_0": ("Hammer Helm", (544.65, 599.99, 630.92, 615.48)),
    "line_24_0": ("MARTIAL • LVL 1", (561.58, 618.68, 613.82, 626.67)),
    # False Idol: its rotated artwork already prints these title/rule spans.
    "line_95_0": ("XP:5+", (215.94, 229.34, 223.04, 244.32)),
    "line_96_0": ("EXHAUST", (179.87, 304.76, 186.67, 329.40)),
    "line_96_1": ("Make a", (170.56, 260.71, 177.87, 281.89)),
    "line_96_2": ("ATK. This Attack has -1 to the", (169.68, 287.70, 177.89, 368.75)),
    "line_96_3": ("Attack Roll.", (163.53, 298.56, 170.85, 329.20)),
    "line_97_0": ("False Idol", (207.84, 285.06, 222.04, 342.69)),
    "line_98_0": ("“It is easier to fool people, than to convince", (142.51, 260.30, 149.86, 368.23)),
    "line_98_1": ("them they have been fooled.\"", (136.36, 278.07, 143.71, 348.98)),
    "line_99_0": ("SUBTERFUGE • LVL 2", (196.95, 283.98, 204.28, 345.32)),
    # Abbadon's Subtlety: the full rules panel is already rasterized in the card.
    "line_108_0": ("XP:9+", (164.95, 601.32, 181.98, 609.13)),
    "line_110_0": ("EXHAUST", (248.20, 635.72, 275.31, 643.19)),
    "line_111_0": ("After resolving an Attack or Spell you made,", (194.43, 645.78, 323.90, 653.83)),
    "line_111_1": ("cast a SPELL 6.", (236.75, 653.88, 281.32, 661.94)),
    "line_111_2": ("Deal your target MAGIC DMG equal to the", (195.31, 662.42, 323.03, 670.48)),
    "line_111_3": ("amount of Damage the previous Attack or", (197.53, 670.55, 320.81, 678.59)),
    "line_111_4": ("Spell dealt. After dealing this Damage, end", (196.15, 678.66, 322.19, 686.71)),
    "line_111_5": ("your turn.", (244.00, 686.78, 272.45, 694.83)),
    "line_115_0": ("Abbadon's Subtlety", (196.47, 602.41, 319.99, 618.04)),
    "line_116_0": ("CRUOR • LVL 4", (234.17, 621.95, 282.12, 630.02)),
}


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    found = {
        line.get("id"): line
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
        if line.get("id") in TARGETS
    }
    if set(found) != set(TARGETS):
        raise ValueError(f"Expected {len(TARGETS)} exact lines, found {len(found)}")

    for line_id, (expected_text, expected_bbox) in TARGETS.items():
        line = found[line_id]
        text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
        bbox = line.get("bbox", [])
        if (
            text != expected_text
            or len(bbox) != 4
            or any(abs(actual - expected) > 0.03 for actual, expected in zip(bbox, expected_bbox))
        ):
            raise ValueError(f"Stale target, refusing to suppress p.48 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line_id, line in found.items():
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "the exact text is already present in the app's card artwork; this HTML pass is visibly "
            "misaligned or doubles the printed copy"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 48,
            "region": "False Idol, Hammer Helm, and Abbadon's Subtlety cards",
            "rule": "hide only the 30 tested line IDs; preserve War Axe text, other artwork labels, and Admin spans",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 48: marked {len(found)} exact card-art text copies")


if __name__ == "__main__":
    main()
