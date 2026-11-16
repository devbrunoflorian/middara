"""Restore nine Table 6 pictograms erased from the p.96 text background.

Each crop is tightly bounded to a source-PDF vector icon gap. No printed text
is covered. Dry-run is the default; pass --apply to write PNG crops and the
page-local fidelity overlay sidecar.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 96
PAGE_DIR = ROOT / f"apps/web/public/pages/page_{PAGE:03d}"
DOM_PATH = PAGE_DIR / f"page_{PAGE:03d}_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-04-p096-table6-pictograms-v1"
SCALE = 8.0

# Crops are the exact union of the vector drawings at each missing icon.
COMPONENTS = [
    ("dodge-black-die", (363.733, 206.031, 373.803, 217.655), ((230, (363.733, 206.031, 373.803, 217.655)),)),
    ("dodge-roll-symbol", (414.533, 206.970, 423.887, 216.974), ((234, (414.533, 206.970, 423.887, 216.974)),)),
    ("dodge-skull", (184.005, 218.427, 192.341, 229.981), (
        (237, (184.005, 218.427, 192.341, 227.476)),
        (238, (185.618, 226.240, 190.886, 229.981)),
    )),
    ("empower-black-die", (738.232, 236.472, 748.302, 248.096), ((239, (738.232, 236.472, 748.302, 248.096)),)),
    ("empower-attack-skull", (649.448, 249.703, 657.784, 261.257), (
        (243, (649.448, 249.703, 657.784, 258.752)),
        (244, (651.061, 257.516, 656.329, 261.257)),
    )),
    ("empower-spell-roll-symbol", (337.852, 276.912, 347.270, 287.084), (
        (245, (337.852, 276.912, 347.270, 287.084)),
        (246, (338.973, 285.711, 346.322, 286.156)),
    )),
    ("empower-spell-black-die", (437.817, 277.142, 447.887, 288.765), ((247, (437.817, 277.142, 447.887, 288.765)),)),
    ("empower-spell-spent-symbol", (613.443, 276.912, 622.861, 287.084), (
        (251, (613.443, 276.912, 622.861, 287.084)),
        (252, (614.564, 285.711, 621.913, 286.156)),
    )),
    ("empower-spell-skull", (675.527, 276.539, 683.863, 288.092), (
        (253, (675.527, 276.539, 683.863, 285.587)),
        (254, (677.140, 284.350, 682.408, 288.092)),
    )),
]


def rect_values(rect: pymupdf.Rect) -> tuple[float, float, float, float]:
    return tuple(round(value, 3) for value in (rect.x0, rect.y0, rect.x1, rect.y1))


def close_rect(left: tuple[float, ...], right: tuple[float, ...], tolerance: float = 0.02) -> bool:
    return len(left) == len(right) == 4 and all(abs(a - b) <= tolerance for a, b in zip(left, right))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write exact source crops and fidelity sidecar")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if dom.get("page_number") != PAGE:
        raise SystemExit("p.96 DOM page number mismatch")

    prepared = []
    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        if abs(page.rect.width - float(dom["width"])) > 0.05 or abs(page.rect.height - float(dom["height"])) > 0.05:
            raise SystemExit("p.96 PDF geometry no longer matches the page DOM")
        drawings = page.get_drawings()
        for name, bbox, expected_drawings in COMPONENTS:
            for drawing_index, expected_rect in expected_drawings:
                if drawing_index >= len(drawings) or not close_rect(rect_values(drawings[drawing_index]["rect"]), expected_rect):
                    actual = rect_values(drawings[drawing_index]["rect"]) if drawing_index < len(drawings) else None
                    raise SystemExit(f"Stale p.96 {name} drawing {drawing_index}: {actual!r}")
            rect = pymupdf.Rect(*bbox)
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=rect, alpha=False)
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            asset = PAGE_DIR / f"fidelity-overlay-component-{name}.png"
            prepared.append((name, rect, image, asset))

    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid overlay sidecar: {SIDECAR_PATH}")

    overlays = []
    for name, rect, image, asset in prepared:
        overlays.append({
            "url": f"/pages/page_{PAGE:03d}/{asset.name}",
            "bbox": [rect.x0, rect.y0, rect.x1, rect.y1],
            "widthPx": image.width,
            "heightPx": image.height,
            "language": "en",
            "languageInvariant": True,
            "auditId": AUDIT_ID,
            "category": "component-icons",
            "sourcePdfPage": PAGE,
            "region": name,
            "sourceCrop": "Exact PDF crop containing only an inline vector pictogram and its table-cell background",
        })
    urls = {item["url"] for item in overlays}

    if not args.apply:
        print(f"Verified {len(prepared)} source-PDF pictogram regions and their drawing coordinates; dry run only.")
        for name, rect, image, asset in prepared:
            print(f"PNG: {asset.relative_to(ROOT)} {image.width}x{image.height}; bbox={list(rect)}")
        return

    for name, rect, image, asset in prepared:
        image.save(asset)
    sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") not in urls] + overlays
    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"p.96: restored {len(prepared)} Table 6 pictograms; editable text spans remain unchanged")


if __name__ == "__main__":
    main()
