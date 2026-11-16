#!/usr/bin/env python3
"""Restore the two white decorative header flourishes on page 63."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PAGE = 63
PAGE_DIR = ROOT / "apps/web/public/pages/page_063"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-03-page063-vector-chrome-v1"
REGIONS = [
    ("header-left-flourish", [70.0, 45.0, 130.0, 100.0]),
    ("header-right-flourish", [690.0, 45.0, 750.0, 100.0]),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pdf",
        type=Path,
        default=Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"),
    )
    parser.add_argument("--scale", type=float, default=4.0)
    args = parser.parse_args()
    with pymupdf.open(args.pdf) as document:
        if len(document) < PAGE:
            raise ValueError(f"Source PDF has only {len(document)} pages")
        page = document[PAGE - 1]
        overlays = json.loads(SIDECAR.read_text(encoding="utf-8")) if SIDECAR.exists() else {"overlays": []}
        if not isinstance(overlays.get("overlays"), list):
            raise ValueError(f"Invalid overlay sidecar: {SIDECAR}")
        for name, bbox in REGIONS:
            filename = f"fidelity-overlay-decoration-page063-{name}.png"
            pix = page.get_pixmap(matrix=pymupdf.Matrix(args.scale, args.scale), clip=pymupdf.Rect(*bbox), alpha=False)
            pix.save(str(PAGE_DIR / filename))
            url = f"/pages/page_{PAGE:03d}/{filename}"
            overlays["overlays"] = [item for item in overlays["overlays"] if item.get("url") != url]
            overlays["overlays"].append({
                "url": url,
                "bbox": bbox,
                "widthPx": pix.width,
                "heightPx": pix.height,
                "language": "en",
                "languageInvariant": True,
                "auditId": AUDIT_ID,
                "category": "decorative-page-chrome",
                "sourcePdfPage": PAGE,
                "region": name,
            })
        SIDECAR.write_text(json.dumps(overlays, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Page {PAGE}: restored {len(REGIONS)} ornamental crops")


if __name__ == "__main__":
    main()
