"""Hide the single Nightingale name already printed in the p. 37 stat art."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_037/page_037_dom.json"
AUDIT_ID = "page37-nightingale-name-background-text-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-user-visual-ghost-audit-pages-20-43.md"
TARGET = ("block_29", "line_29_0", "Nightingale Arsen", (135.3337, 631.8312, 353.0569, 671.8572))


def main() -> None:
    block_id, line_id, expected_text, expected_bbox = TARGET
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != 37:
        raise ValueError("Page signature changed; refusing to suppress text")

    found = [
        (block, line)
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
        if line.get("id") == line_id
    ]
    if len(found) != 1:
        raise ValueError(f"Expected one exact line, found {len(found)}")
    block, line = found[0]
    text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
    bbox = line.get("bbox", [])
    if (
        block.get("id") != block_id
        or text != expected_text
        or len(bbox) != 4
        or any(abs(actual - expected) > 0.03 for actual, expected in zip(bbox, expected_bbox))
    ):
        raise ValueError("Stale target, refusing to suppress p. 37 Nightingale name")
    evidence = line.get("rasterizedDuplicateEvidence") or {}
    if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
        raise ValueError("Target already has an unrelated suppression marker")

    line["rasterizedDuplicate"] = True
    line["rasterizedDuplicateReason"] = (
        "Nightingale Arsen is already legible in the p. 37 stat-card background; "
        "the extracted HTML copy visibly doubles the name"
    )
    line["rasterizedDuplicateEvidence"] = {
        "auditId": AUDIT_ID,
        "sourcePdfPage": 37,
        "region": "name within the Nightingale stamina-bar art at lower left",
        "rule": "suppress only the printed name; surrounding Example prose remains live",
        "evidenceRef": EVIDENCE_REF,
    }
    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Page 37: marked the exact Nightingale Arsen name line")


if __name__ == "__main__":
    main()
