#!/usr/bin/env python3
"""Restore two confirmed small symbols whose app colors differ from the PDF.

The p.89 Stamina Point token and the p.92 white Arcane star are clipped from
their source PDF positions. Both are small, language-independent page symbols;
the crop leaves neighboring text editable and intact.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
AUDIT_ID = "2026-10-03-inline-icon-color-review-v1"
REGIONS = {
    89: ("stamina-point-token", [416.0, 359.0, 451.0, 399.0]),
    92: ("arcane-star-symbol", [367.0, 260.0, 385.0, 278.0]),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the two source crops and overlay entries")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()
    if not args.apply:
        print("p.89 SP token and p.92 Arcane star: preview only; pass --apply to write overlays")
        return
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    with pymupdf.open(args.pdf) as document:
        for page_number, (region, bbox) in REGIONS.items():
            page_dir = ROOT / "apps/web/public/pages" / f"page_{page_number:03d}"
            sidecar_path = page_dir / "fidelity_overlays.json"
            if not sidecar_path.is_file():
                raise FileNotFoundError(sidecar_path)
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
            if not isinstance(sidecar.get("overlays"), list):
                raise SystemExit(f"Invalid overlay sidecar: {sidecar_path}")

            pixmap = document[page_number - 1].get_pixmap(
                matrix=pymupdf.Matrix(args.scale, args.scale),
                clip=pymupdf.Rect(*bbox),
                alpha=False,
            )
            filename = f"fidelity-overlay-component-{region}.png"
            pixmap.save(str(page_dir / filename))
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
                "category": "component-icons",
                "sourcePdfPage": page_number,
                "region": region,
            })
            sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"p.{page_number}: restored {region} from source bbox {bbox}")


if __name__ == "__main__":
    main()
