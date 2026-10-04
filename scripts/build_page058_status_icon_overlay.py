"""Extract the p.58 STATUS pill's white inline symbol as a transparent crop.

The PDF's underlying pill is already present in the page background raster;
only the white glyph is missing there. A luminance-derived alpha mask restores
the source glyph without covering the black pill or nearby translatable text.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
BBOX = [605.0576171875, 664.0321044921875, 614.3456420898438, 673.0321044921875]
PAGE = 58
REGION = "status-tag-inline-symbol"
AUDIT_ID = "2026-10-03-p58-inline-glyph-audit-v1"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write transparent PNG and overlay sidecar")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()

    page_dir = ROOT / f"apps/web/public/pages/page_{PAGE:03d}"
    asset = page_dir / f"fidelity-overlay-{REGION}.png"
    sidecar = page_dir / "fidelity_overlays.json"
    if not args.apply:
        print(f"p.{PAGE} {REGION}: transparent source glyph ready; bbox={BBOX}; apply=False")
        return

    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(args.scale, args.scale), clip=pymupdf.Rect(*BBOX), alpha=False)
        source = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    gray = source.convert("L")
    # The glyph is white on the pill's near-black fill. Preserve anti-aliased
    # white edge pixels while dropping the dark pill itself to transparency.
    # The source pill fill is near-black. Ignore that dark backing and retain
    # only the brighter white glyph, with antialiased edges above a safe cutoff.
    alpha = gray.point(lambda value: max(0, min(255, round((value - 48) * 255 / 207))))
    overlay = Image.new("RGBA", source.size, (255, 255, 255, 0))
    overlay.putalpha(alpha)
    page_dir.mkdir(parents=True, exist_ok=True)
    overlay.save(asset)

    data = {"overlays": []}
    if sidecar.is_file():
        data = json.loads(sidecar.read_text(encoding="utf-8"))
    url = f"/pages/page_{PAGE:03d}/{asset.name}"
    data["overlays"] = [item for item in data.get("overlays", []) if item.get("url") != url]
    data["overlays"].append({
        "url": url,
        "bbox": BBOX,
        "widthPx": pixmap.width,
        "heightPx": pixmap.height,
        "language": "en",
        "languageInvariant": True,
        "auditId": AUDIT_ID,
        "category": "component-icons",
        "sourcePdfPage": PAGE,
        "region": REGION,
        "alphaMask": "source white glyph; dark pill fill removed from alpha mask",
    })
    sidecar.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    preview = Image.new("RGBA", overlay.size, (23, 31, 32, 255))
    preview.alpha_composite(overlay)
    preview.save(ROOT / "tmp/visual-followup/p058-status-icon-mask-preview.png")
    print(f"p.{PAGE} {REGION}: wrote {asset.relative_to(ROOT)} ({pixmap.width}x{pixmap.height})")


if __name__ == "__main__":
    main()
