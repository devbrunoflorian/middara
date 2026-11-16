"""Suppress the exact duplicated title and level passes on five p. 32 cards."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_032/page_032_dom.json"
AUDIT_ID = "page32-discipline-card-title-level-duplicates-v1"
LEGACY_AUDIT_IDS = {"page32-subterfuge-card-title-duplicate-v1"}
EVIDENCE_REF = "docs/project-progress/2026-10-02-page32-subterfuge-card-tracer.md"
TARGETS = {
    "line_12_0": ("Assemblage", (128.8300, 281.0900, 201.6900, 300.9400)),
    "line_12_1": ("LVL 1", (173.7300, 298.0200, 185.8500, 304.8900)),
    "line_37_0": ("Subterfuge", (131.7185, 707.6112, 198.8048, 727.4573)),
    "line_37_1": ("LVL 1", (158.2400, 724.5400, 170.3600, 731.4100)),
    "line_18_0": ("Cruor", (640.5800, 388.4100, 677.4700, 410.2400)),
    "line_18_1": ("LVL 1", (660.7800, 405.6400, 672.9000, 412.5100)),
    "line_25_0": ("Martial", (142.9300, 495.7900, 187.5900, 515.6400)),
    "line_25_1": ("LVL 1", (165.9800, 513.2300, 178.1100, 520.1100)),
    "line_31_0": ("Sanctus", (635.4800, 602.6100, 682.5600, 622.4600)),
    "line_31_1": ("LVL 1", (660.7800, 619.5400, 672.9000, 626.4100)),
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
            raise ValueError(f"Stale target, refusing to suppress p.32 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") not in {AUDIT_ID, *LEGACY_AUDIT_IDS}:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line_id, line in found.items():
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "the title and level are already legible in the discipline card artwork; the HTML copies "
            "are visibly offset and double the printed text"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 32,
            "region": "five discipline card title and level labels",
            "rule": "hide only the ten tested title/level line IDs; retain the art, card footers and Admin spans",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 32: marked {len(found)} exact discipline-card title/level copies")


if __name__ == "__main__":
    main()
