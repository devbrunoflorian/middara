"""Apply the visually verified, exact-occurrence Loot-title suppressions on p. 20.

The allowlist is limited to the 12 card-title lines compared against the source
PDF at the same scale. It deliberately does not suppress other text in these
cards or other pages. Source lines remain in the JSON and Admin editor.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOM_PATH = ROOT / "apps/web/public/pages/page_020/page_020_dom.json"
AUDIT_ID = "page20-card-loot-titles-v1"
EVIDENCE_REF = "docs/project-progress/2026-10-02-page20-loot-title-tracer.md"

# Stable source line IDs, exact text and PDF-point bboxes. Do not expand this
# list by card/region: neighboring labels and values include legitimate passes.
TARGETS = {
    "line_538_0": ("Monster Loot", (636.0305, 189.2062, 675.0430, 198.2582)),
    "line_1073_0": ("Unique Loot", (702.0187, 189.2062, 737.7148, 198.2582)),
    "line_1126_0": ("Item Loot", (575.8409, 165.0468, 603.8143, 174.0988)),
    "line_1137_0": ("Monster Loot", (636.2217, 363.9033, 674.8515, 372.8665)),
    "line_1147_0": ("Unique Loot", (702.1937, 363.9033, 737.5397, 372.8665)),
    "line_1162_0": ("Item Loot", (575.9781, 337.0102, 603.6772, 345.9734)),
    "line_1173_0": ("Monster Loot", (637.4899, 547.6315, 673.5835, 556.0062)),
    "line_1183_0": ("Unique Loot", (703.2984, 547.8550, 736.4348, 556.2579)),
    "line_1198_0": ("Item Loot", (576.8438, 522.6429, 602.8112, 531.0458)),
    "line_1209_0": ("Monster Loot", (636.0305, 715.7731, 675.0430, 724.8251)),
    "line_1219_0": ("Unique Loot", (701.8147, 716.0529, 737.9185, 725.2082)),
    "line_1234_0": ("Item Loot", (576.2065, 691.4531, 603.4490, 700.2685)),
}
TOLERANCE_PT = 0.02


def text_of(line: dict) -> str:
    return "".join(span.get("text", "") for span in line.get("spans", []))


def bbox_matches(actual: list[float], expected: tuple[float, ...]) -> bool:
    return len(actual) == 4 and all(
        abs(value - target) <= TOLERANCE_PT
        for value, target in zip(actual, expected)
    )


def main() -> None:
    data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    lines = [line for block in data.get("blocks", []) for line in block.get("lines", [])]
    by_id: dict[str, list[dict]] = {}
    for line in lines:
        by_id.setdefault(line.get("id", ""), []).append(line)

    for line_id, (expected_text, expected_bbox) in TARGETS.items():
        matches = by_id.get(line_id, [])
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one {line_id}; found {len(matches)}")
        line = matches[0]
        if text_of(line) != expected_text or not bbox_matches(line.get("bbox", []), expected_bbox):
            raise ValueError(f"Stale target; refusing to suppress changed line {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    # A known two-pass value is a hard counterexample to line-level suppression.
    counterexample = by_id.get("line_471_0", [])
    if len(counterexample) != 1 or text_of(counterexample[0]) != "1010":
        raise ValueError("Page-20 hard counterexample changed; review before applying")
    if counterexample[0].get("rasterizedDuplicate"):
        raise ValueError("Refusing to alter hard counterexample line_471_0")

    reason = (
        "HTML title duplicates the single title already present in the page-20 card artwork; "
        "confirmed by same-scale source-PDF/app comparison"
    )
    for line_id in TARGETS:
        line = by_id[line_id][0]
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = reason
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 20,
            "region": "exact Loot card-title lines only",
            "rule": "suppress only the HTML pass shown duplicated against the source PDF",
            "evidenceRef": EVIDENCE_REF,
        }

    DOM_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page 20: applied {len(TARGETS)} exact Loot-title suppressions")
    print("Counterexample line_471_0 (two coincident 10 passes): preserved")


if __name__ == "__main__":
    main()
