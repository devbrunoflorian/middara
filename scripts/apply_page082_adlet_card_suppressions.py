"""Hide exact HTML copies and clipped scraps already covered by the p. 82 Adlet card art."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_082/page_082_dom.json"
AUDIT_ID = "page82-adlet-priest-card-duplicate-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-page82-adlet-priest-card-tracer.md"
TARGETS = {
    "line_13_0": ("Adlet Priest", (108.0585, 223.7134, 206.7966, 251.1312)),
    "line_18_0": ("1", (138.9713, 217.4474, 140.8761, 223.3901)),
    "line_18_1": ("2", (189.1333, 217.4474, 192.1265, 223.3901)),
    "line_18_2": ("3", (239.9683, 217.4474, 242.7040, 223.3901)),
    "line_18_3": ("INTELLIGENT", (342.2593, 217.9471, 380.4433, 225.4314)),
    "line_18_4": ("TYPE: ADLET", (348.6511, 224.1646, 380.4432, 230.7840)),
    "line_18_5": ("ALTERNATE", (351.6331, 229.7178, 380.4432, 236.3372)),
    "line_21_0": ("SWARM", (360.3850, 235.2711, 380.4431, 241.8905)),
    "line_26_0": ("y", (95.8345, 248.0562, 98.8896, 255.3275)),
    "line_26_1": ("p", (169.1825, 248.0562, 172.5798, 255.3275)),
    "line_26_2": ("p", (188.8821, 248.0562, 192.2794, 255.3275)),
    "line_26_3": ("g", (297.1261, 248.0562, 300.1813, 255.3275)),
    "line_26_4": ("g", (315.3898, 248.0562, 318.4450, 255.3275)),
    "line_26_5": ("y", (330.6717, 248.0562, 333.7268, 255.3275)),
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
            raise ValueError(f"Stale target, refusing to suppress p.82 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line_id, line in found.items():
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "the Adlet Priest card art already contains these title/type/number pixels; the six isolated "
            "letters are hidden scraps under the card. The same-scale viewer test showed the HTML passes "
            "were misaligned duplicates absent from the final source page"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 82,
            "region": "Adlet Priest card, printed title/type/tab labels and clipped text fragments under its lower edge",
            "rule": "hide only the fourteen tested line IDs; retain artwork and Admin spans",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 82: marked {len(found)} exact Adlet-card HTML copies/scraps")


if __name__ == "__main__":
    main()
