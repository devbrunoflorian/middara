"""Restore p.34's two word-free white title ornaments from the source PDF.

The existing component diagram remains untouched. Crops are shared by EN,
PT-BR and Admin, and must not intersect any extracted text, including hidden
component text. Validate all source paths before writing assets.
"""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages/page_034"
AUDIT_ID = "2026-10-04-page34-fixed-artwork-v1"
TARGETS = [
    ("left-white-flourish", [86.75, 61.0, 113.25, 83.25], [87.4871, 61.5990, 112.5051, 82.5030]),
    ("right-white-flourish", [709.0, 61.0, 735.25, 83.25], [709.5580, 61.5990, 734.5760, 82.5030]),
]


def main() -> None:
    data = json.loads((PAGE_DIR / "page_034_dom.json").read_text(encoding="utf-8"))
    sidecar_path = PAGE_DIR / "fidelity_overlays.json"
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    if data.get("page_number") != 34 or not isinstance(sidecar.get("overlays"), list):
        raise ValueError("Unexpected p.34 DOM or sidecar")

    with pymupdf.open(PDF) as document:
        page = document[33]
        if abs(page.rect.width - 820.346) > 0.01 or abs(page.rect.height - 820.346) > 0.01:
            raise ValueError(f"Unexpected source page dimensions: {page.rect}")
        drawings = page.get_drawings()
        validated = []
        for region, bounds, vector_bounds in TARGETS:
            found = [drawing for drawing in drawings if
                     max(abs(a - b) for a, b in zip(drawing["rect"], vector_bounds)) < 0.005]
            if len(found) != 1 or found[0]["fill"] != (1.0, 1.0, 1.0) or len(found[0]["items"]) != 60:
                raise ValueError(f"Source white ornament changed: {region}")
            crop = pymupdf.Rect(bounds)
            if not crop.contains(found[0]["rect"]):
                raise ValueError(f"Crop truncates source vector: {region}")
            for block in data["blocks"]:
                for line in block.get("lines", []):
                    if crop.intersects(pymupdf.Rect(line["bbox"])):
                        raise ValueError(f"Crop intersects text: {region} {block['id']}/{line['id']}")
            pix = page.get_pixmap(matrix=pymupdf.Matrix(4, 4), clip=crop, alpha=False)
            extent = [pix.x / 4, pix.y / 4, (pix.x + pix.width) / 4, (pix.y + pix.height) / 4]
            if extent != bounds:
                raise ValueError(f"Crop is not on the 4x raster grid: {region} {extent}")
            validated.append((region, extent, pix))

        for region, extent, pix in validated:
            filename = f"fidelity-overlay-component-page34-{region}.png"
            pix.save(PAGE_DIR / filename)
            url = f"/pages/page_034/{filename}"
            sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
            sidecar["overlays"].append({
                "url": url, "bbox": extent, "widthPx": pix.width, "heightPx": pix.height,
                "language": "en", "languageInvariant": True,
                "auditId": AUDIT_ID, "category": "fixed-artwork", "sourcePdfPage": 34,
                "region": region,
                "evidenceRef": "docs/project-progress/2026-10-04-page34-source-review.md",
            })
            print(f"{region}: {pix.width}x{pix.height} bbox={extent}")

    updated = json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n"
    if sidecar_path.read_text(encoding="utf-8") != updated:
        sidecar_path.write_text(updated, encoding="utf-8")
    print("2 shared word-free source crops; diagram, DOM and translations unchanged.")


if __name__ == "__main__":
    main()
