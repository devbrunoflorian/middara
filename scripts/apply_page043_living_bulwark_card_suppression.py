"""Hide only Living Bulwark card text already printed in the p. 43 artwork."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_043/page_043_dom.json"
AUDIT_ID = "page43-living-bulwark-card-background-text-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-user-visual-ghost-audit-pages-20-43.md"
TARGETS = {
    "line_46_0": ("block_46", "XP:3+", (163.9330, 272.8200, 180.4860, 280.6470)),
    "line_47_0": ("block_47", "MARTIAL • LVL 1", (230.6200, 292.8050, 283.4130, 300.8790)),
    "line_48_0": ("block_48", "PER ENCOUNTER", (233.8460, 311.7160, 293.7700, 321.5340)),
    "line_48_1": ("block_48", "At any time, Gain RESISTANCE: PHYSICAL", (193.4870, 321.5880, 321.1900, 329.6620)),
    "line_48_2": ("block_48", "DMG until the end of your next turn.", (202.6180, 329.7160, 312.0590, 337.7900)),
    "line_50_0": ("block_50", "In addition, you may COUNTER for free", (198.0250, 340.2020, 318.5410, 348.2760)),
    "line_50_1": ("block_50", "until the end of your next turn.", (211.8440, 348.3430, 300.9570, 356.4040)),
    "line_52_0": ("block_52", "Living Bulwark", (208.9030, 273.9170, 305.3060, 289.5700)),
}


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != 43:
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
            raise ValueError(f"Stale target, refusing to suppress p. 43 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line in (line for _block, line in found.values()):
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "this exact Living Bulwark card text is already legible in the p. 43 background; "
            "painting the extracted HTML copy doubles the card"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 43,
            "region": "Living Bulwark card in left column",
            "rule": "suppress only the eight lines inside the card; preserve the neighboring Example prose",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 43: marked {len(found)} exact Living Bulwark card-copy lines")


if __name__ == "__main__":
    main()
