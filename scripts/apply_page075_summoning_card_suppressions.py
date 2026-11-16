"""Suppress the ten HTML lines already legible on the p. 75 Summoning card art."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_075/page_075_dom.json"
AUDIT_ID = "page75-summoning-card-raster-copy-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-page75-summoning-card-tracer.md"
TARGETS = {
    "line_20_0": ("PER ENCOUNTER", (173.6758, 192.1428, 232.6434, 201.4202)),
    "line_20_1": ("Summon a LOYAL ESPER within your SOI.", (133.8704, 201.4753, 261.2164, 209.6782)),
    "line_20_2": ("Then, Gain 1 Summon token.", (152.9464, 209.7195, 242.1403, 217.9363)),
    "line_22_0": ("✤PASSIVE", (181.7015, 220.4983, 211.4776, 228.1079)),
    "line_22_1": ("At anytime, ✘DISCARD a Summon token to", (131.6774, 229.2188, 263.4074, 237.4356)),
    "line_22_2": ("reduce any non-irreducible Damage being", (133.7424, 237.1121, 261.3499, 245.3013)),
    "line_22_3": ("dealt to a LOYAL ESPER you control by 2.", (135.4009, 245.3554, 259.4184, 253.5594)),
    "line_25_0": ("Summoning", (158.8032, 158.7570, 234.3772, 174.6597)),
    "line_25_1": ("XP:5+", (101.9591, 157.6425, 118.7229, 165.5938)),
    "line_26_0": ("ASSEMBLAGE • LVL 2", (163.2931, 178.6425, 229.7084, 186.8455)),
}


def main() -> None:
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    found = {
        line.get("id"): line
        for block in dom.get("blocks", [])
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
            raise ValueError(f"Stale target, refusing to suppress p.75 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line_id, line in found.items():
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "the card text is already present and legible in the source artwork; the extra HTML pass "
            "causes visibly doubled, misaligned text in the viewer"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 75,
            "region": "one Summoning card, including its title and printed rules",
            "rule": "hide only the ten tested line IDs backed by the exact card art",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 75: marked {len(found)} exact Summoning-card HTML copies")


if __name__ == "__main__":
    main()
