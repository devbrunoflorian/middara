"""Suppress only the duplicated HTML color passes for the printed p. 15 START label."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_015/page_015_dom.json"
AUDIT_ID = "page15-start-label-duplicate-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-page15-start-label-tracer.md"
EXPECTED_BBOX = (155.6185, 274.5773, 176.5550, 284.0173)
TARGETS = {
    "line_38_0": "#231f20",
    "line_38_1": "#ffffff",
}


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    matches = {
        line.get("id"): line
        for block in data.get("blocks", [])
        for line in block.get("lines", [])
        if line.get("id") in TARGETS
    }
    if set(matches) != set(TARGETS):
        raise ValueError(f"Expected exact targets {sorted(TARGETS)}, found {sorted(matches)}")

    for line_id, expected_color in TARGETS.items():
        line = matches[line_id]
        text = "".join(span.get("text", "") for span in line.get("spans", []))
        bbox = line.get("bbox", [])
        color = line.get("spans", [{}])[0].get("color")
        if (
            text != "Start"
            or len(bbox) != 4
            or any(abs(actual - expected) > 0.02 for actual, expected in zip(bbox, EXPECTED_BBOX))
            or color != expected_color
        ):
            raise ValueError(f"Stale p.15 target; refusing to suppress {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line_id, line in matches.items():
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "the START label is already legible in the map artwork; same-scale viewer test "
            "confirmed these two coincident HTML color passes add a second, misaligned label"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 15,
            "region": "START label in the Bombing the Sickles encounter map",
            "rule": "hide only the two exact HTML style passes; retain the source art and Admin spans",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 15: applied {len(matches)} exact START-label style-pass suppressions")


if __name__ == "__main__":
    main()
