#!/usr/bin/env python3
"""Restore confirmed white header flourishes missing from brown-page backgrounds.

Each region was checked against its own source PDF page and served background.
The crops contain decorative chrome only; title text and body content remain live.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
AUDIT_ID = "2026-10-03-bookwide-decorative-chrome-v1"
REGIONS: dict[int, list[tuple[str, list[float]]]] = {
    42: [
        ("header-left-flourish", [80.0, 55.0, 120.0, 90.0]),
        ("header-right-flourish", [704.0, 55.0, 744.0, 90.0]),
    ],
    44: [
        ("line-of-sight-header-left-flourish", [80.0, 55.0, 120.0, 90.0]),
        ("line-of-sight-header-right-flourish", [704.0, 55.0, 744.0, 90.0]),
        ("damage-healing-header-left-flourish", [80.0, 497.0, 120.0, 532.0]),
        ("damage-healing-header-right-flourish", [704.0, 497.0, 744.0, 532.0]),
    ],
    45: [
        ("header-left-flourish", [80.0, 55.0, 120.0, 90.0]),
        ("header-right-flourish", [704.0, 55.0, 744.0, 90.0]),
    ],
    54: [
        ("header-left-flourish", [80.0, 55.0, 120.0, 90.0]),
        ("header-right-flourish", [704.0, 55.0, 744.0, 90.0]),
    ],
    84: [
        ("header-left-flourish", [80.0, 55.0, 120.0, 90.0]),
        ("header-right-flourish", [704.0, 55.0, 744.0, 90.0]),
    ],
    89: [
        ("header-left-flourish", [80.0, 55.0, 120.0, 90.0]),
        ("header-right-flourish", [704.0, 55.0, 744.0, 90.0]),
    ],
    92: [
        ("header-left-flourish", [80.0, 55.0, 120.0, 90.0]),
        ("header-right-flourish", [704.0, 55.0, 744.0, 90.0]),
    ],
    93: [
        ("header-left-flourish", [80.0, 55.0, 120.0, 90.0]),
        ("header-right-flourish", [704.0, 55.0, 744.0, 90.0]),
    ],
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--scale", type=float, default=4.0)
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    count = 0
    with pymupdf.open(args.pdf) as document:
        for page_number, regions in REGIONS.items():
            if len(document) < page_number:
                raise ValueError(f"Source PDF has only {len(document)} pages")
            page = document[page_number - 1]
            page_dir = ROOT / "apps" / "web" / "public" / "pages" / f"page_{page_number:03d}"
            sidecar_path = page_dir / "fidelity_overlays.json"
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8")) if sidecar_path.exists() else {"overlays": []}
            if not isinstance(sidecar.get("overlays"), list):
                raise ValueError(f"Invalid overlay sidecar: {sidecar_path}")

            for name, bbox in regions:
                filename = f"fidelity-overlay-decoration-page{page_number:03d}-{name}.png"
                output_path = page_dir / filename
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(args.scale, args.scale),
                    clip=pymupdf.Rect(*bbox),
                    alpha=False,
                )
                pixmap.save(str(output_path))
                url = f"/pages/page_{page_number:03d}/{filename}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": bbox,
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "languageInvariant": True,
                    "auditId": AUDIT_ID,
                    "category": "decorative-page-chrome",
                    "sourcePdfPage": page_number,
                    "region": name,
                })
                count += 1
            sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Restored {count} confirmed white header flourishes on pages {', '.join(str(page) for page in REGIONS)}")


if __name__ == "__main__":
    main()
