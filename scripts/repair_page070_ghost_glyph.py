"""Hide the single extracted letter that leaks above the p.70 card crop.

The PDF's final render contains only a tiny clipped residue at this position;
the page DOM turns it into a fully readable lowercase "g" over the card edge.
The page-scoped line flag hides that rendering artifact without deleting or
rewriting its source text or any translation data.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/public/pages/page_070/page_070_dom.json"
BLOCK_ID = "block_35"
LINE_ID = "line_35_0"
EXPECTED_BBOX = [172.0019, 557.2141, 176.1961, 566.5109]
REASON = (
    "extracted lowercase glyph is clipped by the p.70 printed card edge in the "
    "source PDF and must not render as a standalone letter"
)
AUDIT_ID = "2026-10-03-p070-clipped-glyph-v1"


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    block = next((item for item in data.get("blocks", []) if item.get("id") == BLOCK_ID), None)
    line = next((item for item in (block or {}).get("lines", []) if item.get("id") == LINE_ID), None)
    if line is None:
        raise SystemExit(f"Expected p.70 line {BLOCK_ID}/{LINE_ID} was not found")

    text = "".join(str(span.get("text", "")) for span in line.get("spans", [])).strip()
    if text != "g":
        raise SystemExit(f"Expected only the audited lowercase g, found {text!r}")
    bbox = line.get("bbox") or []
    if len(bbox) != 4 or any(abs(float(actual) - expected) > 0.03 for actual, expected in zip(bbox, EXPECTED_BBOX)):
        raise SystemExit(f"p.70 glyph moved from audited bbox: {bbox!r}")

    line["rasterizedDuplicate"] = True
    line["rasterizedDuplicateReason"] = REASON
    line["rasterizedDuplicateEvidence"] = {
        "auditId": AUDIT_ID,
        "sourcePdfPage": 70,
        "region": "top edge of the Protect the Smallest card under Component Limits",
        "rule": "suppress the extracted full glyph when the source page paints only a clipped residue at the card edge",
        "evidenceRef": "docs/QA/drafts/2026-10-03-bookwide-visual-review-batch.md",
    }
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"p.70 {BLOCK_ID}/{LINE_ID}: hid standalone clipped glyph; source text remains intact")


if __name__ == "__main__":
    main()
