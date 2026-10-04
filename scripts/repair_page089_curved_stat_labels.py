#!/usr/bin/env python3
"""Restore the four curved stat labels from p.89 as precise PDF crops.

The source PDF paints HEALTH, DEFENSE, MOVEMENT, and ARMOR as small curved
letters above their icons. Text extraction splits each letter into an
independent line, which the browser lays out horizontally. Keep the text in
the DOM for provenance/Admin inspection, suppress only its page rendering,
and replace each complete icon/label unit with a source-PDF crop.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 89
AUDIT_ID = "2026-10-03-p089-curved-stat-icon-labels-v1"
DOM = ROOT / "apps/web/public/pages/page_089/page_089_dom.json"
SIDECAR = ROOT / "apps/web/public/pages/page_089/fidelity_overlays.json"

# Include the small curved label, its colored stat icon, and the white icon
# caption space; stay left of the live explanatory label beginning at x=456.
REGIONS = {
    "health": {
        "bbox": [418.0, 95.0, 451.0, 136.0],
        "blocks": {"block_28": ["line_28_0", "line_28_1", "line_28_2"],
                   "block_31": ["line_31_0", "line_31_1", "line_31_2"]},
        "expected": "HEALTH",
    },
    "defense": {
        "bbox": [418.0, 138.0, 451.0, 180.0],
        "blocks": {"block_34": ["line_34_0", "line_34_1", "line_34_2"],
                   "block_37": ["line_37_0"],
                   "block_38": ["line_38_0", "line_38_1", "line_38_2"]},
        "expected": "DEFENSE",
    },
    "movement": {
        "bbox": [415.0, 182.0, 454.0, 226.0],
        "blocks": {"block_41": [f"line_41_{i}" for i in range(8)]},
        "expected": "MOVEMENT",
    },
    "armor": {
        "bbox": [418.0, 229.0, 451.0, 273.0],
        "blocks": {"block_49": [f"line_49_{i}" for i in range(5)]},
        "expected": "ARMOR",
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the four crops and suppress source-only extracted letters")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()
    if not args.apply:
        print("p.89 curved stat labels: preview only; pass --apply to write overlays")
        return
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    dom = json.loads(DOM.read_text(encoding="utf-8"))
    by_id = {block.get("id"): block for block in dom.get("blocks", [])}
    sidecar = json.loads(SIDECAR.read_text(encoding="utf-8")) if SIDECAR.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid overlay sidecar: {SIDECAR}")

    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        for name, config in REGIONS.items():
            collected = ""
            for block_id, line_ids in config["blocks"].items():
                block = by_id.get(block_id)
                if block is None:
                    raise SystemExit(f"Missing p.89 block {block_id}")
                for line_id in line_ids:
                    line = next((item for item in block.get("lines", []) if item.get("id") == line_id), None)
                    if line is None:
                        raise SystemExit(f"Missing p.89 line {block_id}/{line_id}")
                    text = "".join(str(span.get("text", "")) for span in line.get("spans", [])).strip()
                    collected += text
                    line["rasterizedDuplicate"] = True
                    line["rasterizedDuplicateReason"] = f"curved {config['expected']} stat-icon label is restored from the source PDF crop"
                    line["rasterizedDuplicateEvidence"] = {
                        "auditId": AUDIT_ID,
                        "sourcePdfPage": PAGE,
                        "region": f"{name} stat icon with curved label",
                        "rule": "retain extracted characters as source data but suppress their uncurved browser layout",
                        "evidenceRef": "docs/QA/drafts/2026-10-03-bookwide-visual-review-batch.md",
                    }
            if collected != config["expected"]:
                raise SystemExit(f"p.89 {name} label mismatch: expected {config['expected']!r}, got {collected!r}")

            bbox = config["bbox"]
            pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(args.scale, args.scale),
                clip=pymupdf.Rect(*bbox),
                alpha=False,
            )
            filename = f"fidelity-overlay-component-stat-icon-{name}-curved-label.png"
            asset = ROOT / "apps/web/public/pages/page_089" / filename
            pixmap.save(str(asset))
            url = f"/pages/page_089/{filename}"
            sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
            sidecar["overlays"].append({
                "url": url,
                "bbox": bbox,
                "widthPx": pixmap.width,
                "heightPx": pixmap.height,
                "language": "en",
                "languageInvariant": True,
                "auditId": AUDIT_ID,
                "category": "component-icons",
                "sourcePdfPage": PAGE,
                "region": f"{name} stat icon with curved label",
            })

    DOM.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SIDECAR.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"p.89: restored {len(REGIONS)} curved stat icon labels and suppressed the extracted straight-letter duplicates")


if __name__ == "__main__":
    main()
