"""Suppress eight exact HTML copies printed in the p. 25 Adventurer card art."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_025/page_025_dom.json"
AUDIT_ID = "page25-adventurer-card-printed-text-duplicates-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-page25-adventurer-card-tracer.md"
TARGETS = {
    "line_69_0": ("Ambitious", (234.3693, 264.5672, 289.4978, 277.5366)),
    "line_69_1": ("PER ENCOUNTER", (302.7786, 267.7331, 358.7689, 275.1805)),
    "line_69_2": ("Nightingale’s commanding personality", (234.3693, 275.1174, 351.8217, 285.3808)),
    "line_69_3": ("makes her a natural leader.", (234.3693, 283.7779, 317.7677, 294.0413)),
    "line_69_4": ("All other allies Gain +1 SP. Nightingale Gains +2 SP.", (234.3693, 293.7130, 401.6131, 302.9032)),
    "line_70_0": ("Conviction:", (234.3693, 315.2414, 301.3713, 328.2108)),
    "line_70_2": ("Casting:", (234.3693, 329.5141, 281.2437, 342.4835)),
    "line_71_0": ("Nightingale Arsen", (234.3693, 189.9513, 448.2168, 229.2635)),
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
            raise ValueError(f"Stale target, refusing to suppress p.25 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line in found.values():
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "the exact card text is present in the viewer background; this HTML copy visibly doubles it"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 25,
            "region": "Nightingale Arsen Adventurer card title, Ambitious ability and Conviction/Casting labels",
            "rule": "hide only the eight tested line IDs; retain ADVENTURER label, icons, stats and Admin spans",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 25: marked {len(found)} exact Adventurer-card text copies")


if __name__ == "__main__":
    main()
