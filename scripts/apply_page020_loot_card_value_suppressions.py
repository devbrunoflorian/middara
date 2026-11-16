"""Suppress the exact printed loot-card values duplicated by HTML on p. 20."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_020/page_020_dom.json"
AUDIT_ID = "page20-loot-card-printed-values-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-user-visual-ghost-audit-pages-20-43.md"
TARGETS = {
    "line_62_0": ("4", (199.7121, 180.6056, 206.2238, 199.3562)),
    "line_121_0": ("6", (199.5623, 537.1568, 206.2748, 555.2606)),
    "line_179_0": ("5", (199.9529, 355.0804, 205.6951, 372.5378)),
    "line_236_0": ("6", (327.9297, 180.1304, 334.6422, 198.2343)),
    "line_296_0": ("8", (328.5013, 539.0557, 334.9214, 557.1595)),
    "line_354_0": ("7", (328.6432, 355.0804, 334.5905, 372.5378)),
    "line_412_0": ("8", (456.8687, 182.0294, 463.2888, 200.1332)),
    "line_471_0": ("1010", (455.5437, 537.6317, 465.4644, 555.0889)),
    "line_530_0": ("9", (458.1161, 355.0804, 464.6017, 372.5378)),
    "line_597_0": ("5", (263.9522, 180.6053, 269.6944, 198.0626)),
    "line_656_0": ("7", (264.2750, 537.6317, 270.2223, 555.0889)),
    "line_714_0": ("6", (263.7979, 354.6056, 270.5104, 372.7095)),
    "line_771_0": ("7", (392.6424, 180.6053, 398.5897, 198.0626)),
    "line_831_0": ("9", (393.7480, 537.6317, 400.2336, 555.0889)),
    "line_890_0": ("8", (392.7368, 356.5045, 399.1569, 374.6084)),
    "line_949_0": ("9", (522.1154, 180.6053, 528.6010, 198.0626)),
    "line_1007_0": ("1212", (521.0197, 537.5325, 530.5345, 554.8808)),
    "line_1065_0": ("1010", (519.7793, 355.0804, 529.7000, 372.5378)),
    "line_1297_0": ("7", (199.8504, 707.7103, 205.7977, 725.1676)),
    "line_1358_0": ("9", (329.3488, 707.5289, 335.7603, 724.7868)),
    "line_1417_0": ("1212", (456.6147, 707.5289, 466.0799, 724.7868)),
    "line_1478_0": ("8", (263.9441, 709.1345, 270.3642, 727.2383)),
    "line_1538_0": ("1010", (391.0424, 707.5289, 400.8498, 724.7868)),
    "line_1596_0": ("1414", (520.8815, 707.5289, 530.4734, 724.7868)),
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
            raise ValueError(f"Stale target, refusing to suppress p.20 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line in found.values():
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "the loot-card value is legible in the source PDF and viewer background; "
            "the HTML value visibly doubles it in the app"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 20,
            "region": "24 numeric values printed inside repeated loot-card artwork",
            "rule": "hide only the 24 tested card-value line IDs; preserve captions/counts outside card images and Admin spans",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 20: marked {len(found)} exact duplicated loot-card values")


if __name__ == "__main__":
    main()
