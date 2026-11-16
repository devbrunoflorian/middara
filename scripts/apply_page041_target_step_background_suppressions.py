"""Hide only the two p. 41 step-1 lines already legible in its background."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_041/page_041_dom.json"
AUDIT_ID = "page41-target-step-background-text-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-user-visual-ghost-audit-pages-20-43.md"
TARGETS = {
    "line_22_1": (
        "Select a figure within Line of Sight and Range as the target. Some",
        (100.3462, 147.8048, 382.1161, 159.7048),
    ),
    "line_22_2": (
        "Abilities have specific targeting parameters that may override this.",
        (100.3462, 158.8048, 382.1262, 170.7048),
    ),
}


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != 41:
        raise ValueError("Page signature changed; refusing to suppress text")
    found = {
        line.get("id"): (block, line)
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
        if line.get("id") in TARGETS
    }
    if set(found) != set(TARGETS):
        raise ValueError(f"Expected {len(TARGETS)} exact lines, found {len(found)}")

    for line_id, (expected_text, expected_bbox) in TARGETS.items():
        block, line = found[line_id]
        text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
        bbox = line.get("bbox", [])
        if (
            block.get("id") != "block_22"
            or text != expected_text
            or len(bbox) != 4
            or any(abs(actual - expected) > 0.03 for actual, expected in zip(bbox, expected_bbox))
        ):
            raise ValueError(f"Stale target, refusing to suppress p. 41 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line in (line for _block, line in found.values()):
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "this exact description is already legible in the p. 41 background; "
            "painting the extracted HTML copy makes the viewer visibly double it"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 41,
            "region": "description lines below CHOOSE THE TARGET",
            "rule": "suppress only the two background-confirmed description lines; keep the HTML heading line visible",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 41: marked {len(found)} exact background-duplicated description lines")


if __name__ == "__main__":
    main()
