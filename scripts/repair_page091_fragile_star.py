"""Restore the oversized p.91 FRAGILE health symbol without reflowing prose.

The PDF prints a white 28 pt star between two 10 pt lines. Its extracted `*`
span is clipped by the browser line box, so this script retains the span for
editing and substitutes an exact source-PDF alpha crop for screen rendering.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 91
AUDIT_ID = "2026-10-04-p091-fragile-health-symbol-v1"
PAGE_DIR = ROOT / f"apps/web/public/pages/page_{PAGE:03d}"
DOM_PATH = PAGE_DIR / f"page_{PAGE:03d}_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
BLOCK_ID, LINE_ID, SPAN_INDEX = "block_16", "line_16_1", 2
EXPECTED_TEXT = "*"
EXPECTED_FONT = "OptimaLTStd-Bold"
EXPECTED_SIZE = 28.0
BBOX = [185.04, 747.5623, 198.0724, 781.5383]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write exact transparent PNG, DOM flag and overlay sidecar")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()

    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    block = next((item for item in dom.get("blocks", []) if item.get("id") == BLOCK_ID), None)
    line = next((item for item in (block or {}).get("lines", []) if item.get("id") == LINE_ID), None)
    spans = (line or {}).get("spans", [])
    if SPAN_INDEX >= len(spans):
        raise SystemExit(f"Missing p.91 {BLOCK_ID}/{LINE_ID} span {SPAN_INDEX}")
    star = spans[SPAN_INDEX]
    if star.get("text") != EXPECTED_TEXT or star.get("font") != EXPECTED_FONT or abs(float(star.get("size", 0)) - EXPECTED_SIZE) > 0.01:
        raise SystemExit(f"p.91 FRAGILE icon span changed: {star}")
    if any(abs(float(a) - float(b)) > 0.05 for a, b in zip(star.get("bbox", []), [185.3404, 747.8623, 197.7724, 781.2383])):
        raise SystemExit(f"p.91 FRAGILE icon bbox changed: {star.get('bbox')}")

    background_path = PAGE_DIR / "background.webp"
    background = np.asarray(Image.open(background_path).convert("RGB"), dtype=np.float32)
    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        if background.shape[0] != background.shape[1]:
            raise SystemExit(f"Unexpected p.91 background dimensions: {background.shape}")
        scale = background.shape[1] / page.rect.width
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        source = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3).astype(np.float32)

    if source.shape != background.shape:
        raise SystemExit(f"Source/background render sizes differ: {source.shape} / {background.shape}")
    x0, y0, x1, y1 = [int(round(value * scale)) for value in BBOX]
    source_crop = source[y0:y1, x0:x1]
    base_crop = background[y0:y1, x0:x1]
    foreground = np.full_like(base_crop, 255.0)
    delta = source_crop - base_crop
    white_delta = foreground - base_crop
    alpha = np.sum(delta * white_delta, axis=2) / np.maximum(np.sum(white_delta * white_delta, axis=2), 1.0)
    alpha = np.clip(alpha, 0, 1)
    # Remove low-level resampling/texture differences while retaining the soft
    # antialiased white outline of the printed symbol.
    alpha[alpha < 0.075] = 0
    rgba = np.zeros((alpha.shape[0], alpha.shape[1], 4), dtype=np.uint8)
    rgba[:, :, :3] = 255
    rgba[:, :, 3] = np.rint(alpha * 255).astype(np.uint8)
    image = Image.fromarray(rgba, "RGBA")
    quantized_bbox = [x0 / scale, y0 / scale, x1 / scale, y1 / scale]

    asset = PAGE_DIR / "fidelity-overlay-component-fragile-health-symbol.png"
    url = f"/pages/page_{PAGE:03d}/{asset.name}"
    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8")) if SIDECAR_PATH.is_file() else {"overlays": []}
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit(f"Invalid overlay sidecar: {SIDECAR_PATH}")
    overlay = {
        "url": url,
        "bbox": quantized_bbox,
        "widthPx": image.width,
        "heightPx": image.height,
        "language": "en",
        "languageInvariant": True,
        "auditId": AUDIT_ID,
        "category": "component-icons",
        "sourcePdfPage": PAGE,
        "region": "FRAGILE total HP inline star",
        "alphaMask": "white source star separated from the source page texture",
    }

    if not args.apply:
        print(f"Dry run: span {BLOCK_ID}/{LINE_ID}:{SPAN_INDEX} retained, render duplicate suppressed")
        print(f"PNG: {asset.relative_to(ROOT)} {image.width}x{image.height}; bbox={quantized_bbox}; alpha pixels={np.count_nonzero(alpha)}")
        return

    image.save(asset)
    star["renderAsSourceOverlayDuplicate"] = True
    star["renderSourceOverlayLanguage"] = "all"
    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
    sidecar["overlays"].append(overlay)
    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"p.91: restored exact FRAGILE star overlay; source span remains available to the editor")


if __name__ == "__main__":
    main()
