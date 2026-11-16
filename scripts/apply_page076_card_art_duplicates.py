"""Suppress only line-level duplicates proven to be printed in p. 76 card artwork."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_076/page_076_dom.json"
AUDIT_ID = "page76-card-art-raster-duplicates-v1"
LEGACY_AUDIT_IDS = {"page76-yuxa-card-raster-duplicates-v1"}
EVIDENCE_REF = "docs/project-progress/2026-10-02-page76-card-art-tracer.md"
TARGETS = {
    # Yuxa Familiar: its title is absent from the background, so keep line_59_0.
    "line_57_0": ("EXHAUST", (661.4873, 319.0690, 679.4510, 323.9735)),
    "line_57_1": ("When you deal Damage", (644.9072, 324.6486, 693.8774, 329.9266)),
    "line_57_2": ("to an opponent, HEAL 1.", (644.5790, 329.7093, 692.9730, 334.9961)),
    "line_58_0": ("➤FLIP", (661.8245, 337.2706, 674.4942, 342.1751)),
    "line_58_1": ("DODGE and Gain +1 SP.", (643.8555, 342.8068, 692.4629, 348.4086)),
    # Tatva Familiar: the card artwork already includes the name and these labels.
    "line_40_0": ("✤PASSIVE", (472.2787, 317.6652, 492.6266, 322.5489)),
    "line_40_1": ("+1", (475.9639, 324.1387, 482.3235, 329.7166)),
    "line_42_0": ("➤FLIP", (476.1446, 331.9840, 488.7604, 336.8676)),
    "line_42_1": ("You do not provoke Break", (457.8904, 338.1345, 508.2416, 343.3900)),
    "line_42_2": ("Attacks until end of turn.", (459.0475, 343.1825, 505.8568, 348.4380)),
    "line_44_0": ("Tatva", (473.1799, 303.0094, 491.5460, 311.5142)),
    # Animism Familiar: its name is absent from the background, so keep line_52_0.
    "line_49_0": ("✤PASSIVE", (564.8708, 320.9180, 585.7411, 325.9270)),
    "line_50_0": ("+4", (568.4673, 328.2049, 574.9904, 333.9261)),
    "line_51_0": ("➤FLIP", (568.8360, 337.5460, 581.7756, 342.5550)),
    "line_51_1": ("THROW : PURPLE", (554.0601, 343.5239, 590.1782, 349.2451)),
    # Felled Afterlife command card.
    "line_23_0": ("✤PASSIVE", (243.4420, 555.2158, 272.4696, 562.6342)),
    "line_23_2": ("When an opponent within your SOI is", (206.3687, 562.6532, 311.2741, 570.6500)),
    "line_23_3": ("Defeated, this card Gains 1 Energy token.", (202.1955, 568.8827, 315.4499, 576.8795)),
    "line_23_4": ("(Limit 2). When determining the Force of a", (200.9890, 575.1122, 316.6523, 583.1089)),
    "line_23_5": ("Spell, if you have 2 Energy tokens on this card,", (195.2767, 581.3417, 322.3650, 589.3384)),
    "line_23_6": ("Gain +1 to the Force.", (229.1342, 587.5712, 288.5092, 595.5679)),
    "line_23_7": ("PER ENCOUNTER", (235.6181, 597.3452, 296.8334, 607.0685)),
    "line_23_8": ("Discard 2 Energy tokens from this card to", (201.6762, 604.8220, 315.9672, 612.8188)),
    "line_23_9": ("Gain 2 Enslaved Spirits.", (226.4306, 611.5307, 289.4825, 619.5275)),
    "line_27_0": ("Felled Afterlife", (207.6348, 523.4449, 308.2766, 538.9477)),
    "line_27_1": ("XP:9+", (165.4284, 522.3583, 182.3222, 530.1097)),
    "line_28_0": ("ASSEMBLAGE • LVL 4", (225.4964, 542.8304, 290.2420, 550.8271)),
    # Lo & Palden Exalted Esper card; retain its unchanged footer/icon.
    "line_67_0": ("Exalted Esper", (484.3731, 678.5557, 530.9962, 685.9113)),
    "line_68_0": ("Roll the BLACK", (486.4925, 691.2937, 519.5788, 697.3208)),
    "line_68_2": ("For each", (454.6281, 698.8909, 474.5734, 704.9180)),
    "line_68_3": ("rolled, an ally within SOI may either", (479.9114, 698.8909, 560.6443, 704.9180)),
    "line_68_4": ("Gain Haste, Barrier, or Courage. Or, an opponent", (453.1439, 705.2016, 562.1286, 711.2490)),
    "line_68_5": ("may be Inflicted by Wilt, Darkness, or Poison.", (457.3882, 711.5326, 556.4767, 717.5800)),
    "line_70_0": ("Lo & Palden", (468.6663, 660.3096, 545.2005, 680.1421)),
    # Minos the Contractor Exalted Esper card; retain its unchanged footer.
    "line_75_0": ("Exalted Esper", (622.0848, 688.3885, 668.7079, 695.7441)),
    "line_76_0": ("An opponent within SOI is dealt MAGIC DMG equal", (590.9278, 700.4933, 699.7699, 706.5204)),
    "line_76_1": ("to the number rolled using both of their Conviction", (589.4534, 705.8722, 701.2441, 711.8993)),
    "line_76_2": ("Dice. Then, Inflict Condemn.", (613.1516, 711.5498, 676.1376, 717.5972)),
    "line_78_0": ("Minos", (626.8889, 663.0289, 663.1781, 680.2746)),
    "line_78_1": ("the Contractor", (614.8286, 675.9031, 672.4524, 688.8373)),
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
            raise ValueError(f"Stale target, refusing to suppress p.76 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") not in {AUDIT_ID, *LEGACY_AUDIT_IDS}:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line_id, line in found.items():
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "this exact label/rules span is already legible in its card artwork and the extra HTML pass "
            "visibly doubles it; card names absent from the background and unrelated page/footer text are preserved"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 76,
            "region": "six selected Familiar, Command, and Exalted Esper cards",
            "rule": "hide only the forty tested line IDs backed by their individual artwork; retain absent title text, tiny labels, footers, and Admin spans",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 76: marked {len(found)} exact card-art text duplicates")


if __name__ == "__main__":
    main()
