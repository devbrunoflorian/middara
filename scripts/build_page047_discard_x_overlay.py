"""Restore the white cross in the p.47 DISCARD pill as a transparent source crop."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE = 47
BBOX = [234.02040100097656, 161.31259155273438, 240.1134033203125, 170.3125762939453]
REGION = "discard-tag-x-symbol"
AUDIT_ID = "2026-10-03-p47-inline-condition-tag-audit-v1"


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the transparent crop and overlay entry")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()
    if not args.apply:
        print(f"p.{PAGE} {REGION}: source glyph ready; bbox={BBOX}; apply=False")
        return

    page_dir = ROOT / f"apps/web/public/pages/page_{PAGE:03d}"
    asset = page_dir / f"fidelity-overlay-{REGION}.png"
    sidecar = page_dir / "fidelity_overlays.json"
    with pymupdf.open(args.pdf) as document:
        pixmap = document[PAGE - 1].get_pixmap(
            matrix=pymupdf.Matrix(args.scale, args.scale),
            clip=pymupdf.Rect(*BBOX),
            alpha=False,
        )
    source = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    gray = source.convert("L")
    # Retain the white anti-aliased glyph while making the dark pill transparent.
    alpha = gray.point(lambda value: max(0, min(255, round((value - 48) * 255 / 207))))
    overlay = Image.new("RGBA", source.size, (255, 255, 255, 0))
    overlay.putalpha(alpha)
    page_dir.mkdir(parents=True, exist_ok=True)
    overlay.save(asset)

    data = json.loads(sidecar.read_text(encoding="utf-8")) if sidecar.is_file() else {"overlays": []}
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
        "alphaMask": "source white glyph; dark pill fill removed",
    })
    sidecar.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    preview = Image.new("RGBA", overlay.size, (23, 31, 32, 255))
    preview.alpha_composite(overlay)
    preview.save(ROOT / "tmp/visual-followup/p047-discard-x-mask-preview.png")
    print(f"p.{PAGE} {REGION}: wrote {asset.relative_to(ROOT)} ({pixmap.width}x{pixmap.height})")


if __name__ == "__main__":
    main()
