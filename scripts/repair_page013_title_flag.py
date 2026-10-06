"""Cover the isolated decorative flag beside the p.13 FLAGS heading.

The source PDF's three orange flag drawing paths are baked into the page
background. A small language-invariant white artwork overlay hides only that
heading ornament; the separate story.flag inline symbol remains untouched.
Run without --apply to validate and print the measured patch.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages/page_013"
BACKGROUND = PAGE_DIR / "background.webp"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"
ASSET_NAME = "page-013-flags-title-cleanup.png"
AUDIT_ID = "2026-10-05-page13-flags-title-flag-removal-v1"
SOURCE_PAGE_NUMBER = 13

# PDF-point rectangle with 1.5-2.3 pt clear margins around the vector artwork.
# The word ends at x=122.425 pt and the divider begins at y=104.46 pt.
PATCH_BBOX = [124.0, 88.75, 136.5, 102.5]
TITLE_WORD_BBOX = [86.173, 87.212, 122.426, 103.389]
DIVIDER_Y = 104.46


def inspect_source() -> tuple[int, float, float]:
    if not SOURCE_PDF.exists():
        raise FileNotFoundError(f"Source PDF not found: {SOURCE_PDF}")
    document = fitz.open(SOURCE_PDF)
    page = document[SOURCE_PAGE_NUMBER - 1]
    if abs(page.rect.width - 820.346) > 0.02 or abs(page.rect.height - 820.346) > 0.02:
        raise ValueError(f"Unexpected source page size: {page.rect}")

    flag_paths = [
        drawing for drawing in page.get_drawings()
        if drawing["rect"].x0 >= 124 and drawing["rect"].x1 <= 136
        and drawing["rect"].y0 >= 90 and drawing["rect"].y1 <= 101
        and drawing.get("fill") is not None
    ]
    if len(flag_paths) != 3:
        raise ValueError(f"Expected 3 separate title-flag paths, found {len(flag_paths)}")

    if TITLE_WORD_BBOX[2] >= PATCH_BBOX[0]:
        raise ValueError("The cleanup patch would overlap the editable FLAGS heading")
    if PATCH_BBOX[3] >= DIVIDER_Y:
        raise ValueError("The cleanup patch would overlap the horizontal divider")
    document.close()
    return len(flag_paths), 820.3460083007812, 820.3460083007812


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the PNG patch and overlay sidecar")
    args = parser.parse_args()

    components, page_width, page_height = inspect_source()
    background = Image.open(BACKGROUND).convert("RGB")
    sx, sy = background.width / page_width, background.height / page_height
    width_px = round((PATCH_BBOX[2] - PATCH_BBOX[0]) * sx)
    height_px = round((PATCH_BBOX[3] - PATCH_BBOX[1]) * sy)
    overlay = {
        "url": f"/pages/page_013/{ASSET_NAME}",
        "bbox": PATCH_BBOX,
        "widthPx": width_px,
        "heightPx": height_px,
        "language": "en",
        "languageInvariant": True,
        "zIndex": 2,
        "auditId": AUDIT_ID,
        "category": "fixed-artwork-cleanup",
        "sourcePdfPage": SOURCE_PAGE_NUMBER,
        "region": "decorative-flag-beside-flags-heading",
        "evidenceRef": "docs/project-progress/2026-10-05-admin-ruler-and-symbol-alias-settings.md",
    }

    print(f"p.13 title-only vector family: {components} source paths, 1 occurrence")
    print(f"Patch PDF bbox: {PATCH_BBOX}; raster size: {width_px}x{height_px}px")
    print("Separate story.flag in the New Story Flag example is outside the patch and remains semantic.")
    if not args.apply:
        print("Dry run only. Pass --apply to write the localized overlay.")
        return

    PAGE_DIR.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (width_px, height_px), "white").save(PAGE_DIR / ASSET_NAME, format="PNG", optimize=True)
    data = json.loads(SIDECAR.read_text(encoding="utf-8")) if SIDECAR.exists() else {"overlays": []}
    overlays = [item for item in data.get("overlays", []) if item.get("auditId") != AUDIT_ID]
    overlays.append(overlay)
    SIDECAR.write_text(json.dumps({**data, "overlays": overlays}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {PAGE_DIR / ASSET_NAME} and {SIDECAR}")


if __name__ == "__main__":
    main()
