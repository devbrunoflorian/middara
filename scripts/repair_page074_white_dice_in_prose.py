"""Restore p.74's two inline white dice from their exact source-PDF paths.

The source PDF draws these inline dice as white vector shapes, but the
web-exported background raster turns them into black cubes.  Keep the prose
editable and overlay only the two confirmed pictograms from the PDF.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 74
AUDIT_ID = "2026-10-04-p074-white-dice-in-prose-v1"
PAGE_DIR = ROOT / "apps/web/public/pages/page_074"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"

# Exact vector drawing boxes measured from the source PDF.  Each region gets a
# small 0.25pt margin so antialiased edge pixels replace the incorrect raster.
OVERLAYS = {
    "white-cube-after-gain-white": {
        "drawing_bbox": [631.6878662109375, 600.5233154296875, 643.1759033203125, 613.7823486328125],
        "bbox": [631.4378662109375, 600.2733154296875, 643.4259033203125, 614.0323486328125],
        "region": "inline WHITE combat-die symbol after 'Gain WHITE'",
    },
    "white-cube-after-combat-dice": {
        "drawing_bbox": [490.6260070800781, 614.5199584960938, 502.1139831542969, 627.7789916992188],
        "bbox": [490.3760070800781, 614.2699584960938, 502.3639831542969, 628.0289916992188],
        "region": "inline WHITE casting-die symbol after 'gain a WHITE'",
    },
}


def near_bbox(left: list[float] | tuple[float, ...], right: list[float], tolerance: float = 0.04) -> bool:
    return len(left) == len(right) == 4 and all(abs(float(a) - float(b)) <= tolerance for a, b in zip(left, right))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write source-PDF crops and update the p.74 overlay sidecar")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()

    sidecar = json.loads(SIDECAR.read_text(encoding="utf-8")) if SIDECAR.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid p.74 overlay sidecar: {SIDECAR}")
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    changes: list[str] = []
    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        drawings = page.get_drawings()
        for name, config in OVERLAYS.items():
            match = next((
                drawing for drawing in drawings
                if drawing.get("fill") is not None
                and tuple(round(float(c), 5) for c in drawing["fill"]) == (1.0, 1.0, 1.0)
                and near_bbox(tuple(drawing["rect"]), config["drawing_bbox"])
            ), None)
            if match is None:
                raise SystemExit(f"Source PDF no longer contains the confirmed white die path: {name}")

            filename = f"fidelity-overlay-inline-{name}.png"
            asset = PAGE_DIR / filename
            url = f"/pages/page_074/{filename}"
            existing = next((item for item in sidecar["overlays"] if item.get("url") == url), None)
            if existing is None or not near_bbox(existing.get("bbox", []), config["bbox"]):
                changes.append(f"source icon crop {name}")

            if args.apply:
                pixmap = page.get_pixmap(
                    matrix=pymupdf.Matrix(args.scale, args.scale),
                    clip=pymupdf.Rect(*config["bbox"]),
                    alpha=False,
                )
                pixmap.save(str(asset))
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": config["bbox"],
                    "widthPx": pixmap.width,
                    "heightPx": pixmap.height,
                    "language": "en",
                    "languageInvariant": True,
                    "auditId": AUDIT_ID,
                    "category": "component-icons",
                    "sourcePdfPage": PAGE,
                    "region": config["region"],
                })

    if args.apply:
        SIDECAR.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"p.74 plannedOverlays={len(changes)} applied={args.apply}")
    for change in changes:
        print(f"  {change}")


if __name__ == "__main__":
    main()
