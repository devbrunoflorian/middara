"""Hide only Quick Blow card copy confirmed in the page 33 background."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_033/page_033_dom.json"
AUDIT_ID = "page33-quick-blow-card-background-text-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-user-visual-ghost-audit-pages-20-43.md"

# Exact extracted lines painted on top of the already complete card in the
# page background. The callout letters and explanatory text are outside this
# manifest and remain live HTML.
TARGETS = {
    "line_13_0": ("block_13", "XP:5+", (335.2536, 561.4719, 350.6612, 568.7799)),
    "line_15_0": ("block_15", "Quick Blow", (387.6621, 562.4963, 456.7964, 577.1125)),
    "line_16_0": (
        "block_16",
        "“Lightning shall be slow to my hasting.”",
        (371.0710, 643.0939, 472.6682, 650.6522),
    ),
    "line_17_0": ("block_17", "SUBTERFUGE • LVL 2", (391.4691, 580.7737, 452.8280, 588.3130)),
    "line_18_0": (
        "block_18",
        "During the Follow Up step of your Attack,",
        (365.5114, 596.4090, 480.7024, 603.9357),
    ),
    "line_18_1": (
        "block_18",
        "other than your Attack made with Quick",
        (367.5670, 603.6132, 478.6531, 611.1652),
    ),
    "line_18_2": (
        "block_18",
        "Blow, make another",
        (371.5328, 610.8427, 427.7621, 618.3947),
    ),
    "line_18_3": (
        "block_18",
        "ATK. You may",
        (433.7367, 610.8533, 474.6848, 619.2972),
    ),
    "line_18_4": (
        "block_18",
        "choose a new target for this Attack.",
        (374.6549, 618.0954, 469.8083, 625.6221),
    ),
}


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if data.get("page_number") != 33:
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
            raise ValueError(f"Stale target, refusing to suppress p. 33 {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    for line in (line for _block, line in found.values()):
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "this exact card copy is already legible in the p. 33 background; "
            "painting its extracted HTML copy makes the card text visibly double"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 33,
            "region": "Quick Blow card: XP label, name, level, ability and flavor text",
            "rule": "suppress only the nine card-copy lines; keep explanatory callout labels and prose visible",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 33: marked {len(found)} exact Quick Blow card-copy lines")


if __name__ == "__main__":
    main()
