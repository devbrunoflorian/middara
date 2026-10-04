"""Restore audited word-free white title ornaments on p.34 and p.35.

The original filename/default p.34 selection are retained. Select p.35 only
after its independent source review. Existing component diagrams stay untouched.
Crops are shared by EN,
PT-BR and Admin, and must not intersect any extracted text, including hidden
component text. Validate all source paths before writing assets.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
TARGETS_BY_PAGE = {34: [
    ("left-white-flourish", [86.75, 61.0, 113.25, 83.25], [87.4871, 61.5990, 112.5051, 82.5030]),
    ("right-white-flourish", [709.0, 61.0, 735.25, 83.25], [709.5580, 61.5990, 734.5760, 82.5030]),
], 35: [
    ("left-white-flourish", [87.75, 335.25, 114.0, 357.5], [88.4241, 335.9594, 113.4421, 356.8634]),
    ("right-white-flourish", [709.75, 335.25, 736.25, 357.5], [710.4950, 335.9594, 735.5130, 356.8634]),
]}


def repair_page(page_number: int) -> None:
    page_dir = ROOT / f"apps/web/public/pages/page_{page_number:03d}"
    audit_id = f"2026-10-04-page{page_number}-fixed-artwork-v1"
    data = json.loads((page_dir / f"page_{page_number:03d}_dom.json").read_text(encoding="utf-8"))
    sidecar_path = page_dir / "fidelity_overlays.json"
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    if data.get("page_number") != page_number or not isinstance(sidecar.get("overlays"), list):
        raise ValueError(f"Unexpected p.{page_number} DOM or sidecar")

    with pymupdf.open(PDF) as document:
        page = document[page_number - 1]
        if abs(page.rect.width - 820.346) > 0.01 or abs(page.rect.height - 820.346) > 0.01:
            raise ValueError(f"Unexpected source page dimensions: {page.rect}")
        drawings = page.get_drawings()
        validated = []
        for region, bounds, vector_bounds in TARGETS_BY_PAGE[page_number]:
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
            filename = f"fidelity-overlay-component-page{page_number}-{region}.png"
            pix.save(page_dir / filename)
            url = f"/pages/page_{page_number:03d}/{filename}"
            sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
            sidecar["overlays"].append({
                "url": url, "bbox": extent, "widthPx": pix.width, "heightPx": pix.height,
                "language": "en", "languageInvariant": True,
                "auditId": audit_id, "category": "fixed-artwork", "sourcePdfPage": page_number,
                "region": region,
                "evidenceRef": f"docs/project-progress/2026-10-04-page{page_number}-source-review.md",
            })
            print(f"{region}: {pix.width}x{pix.height} bbox={extent}")

    updated = json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n"
    if sidecar_path.read_text(encoding="utf-8") != updated:
        sidecar_path.write_text(updated, encoding="utf-8")
    print(f"p.{page_number}: 2 shared word-free source crops; diagram, DOM and translations unchanged.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages", type=int, nargs="+", choices=sorted(TARGETS_BY_PAGE), default=[34])
    args = parser.parse_args()
    for page_number in sorted(set(args.pages)):
        repair_page(page_number)


if __name__ == "__main__":
    main()
