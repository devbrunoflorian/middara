"""Restore the two lower page-40 flourishes from small source-PDF crops."""
from __future__ import annotations

import json
from pathlib import Path

import pymupdf as fitz


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = Path.home() / "Downloads" / "Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
PAGE_DIR = ROOT / "apps" / "web" / "public" / "pages" / "page_040"
OLD_ASSET = PAGE_DIR / "fidelity-overlay-p40-white-flourishes.svg"
REGION_PREFIX = "White source-PDF flourishes around Push, Pull, and Command title"
EXPECTED_RECTS = (
    (399.9430, 440.7570, 424.9609, 461.6610),
    (692.0610, 440.7570, 717.0790, 461.6610),
)
RENDER_SCALE = 4
PAD_PT = 0.5


def spans_in(page: fitz.Page, rect: fitz.Rect) -> list[str]:
    hits = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                text = span.get("text", "").strip()
                if text and fitz.Rect(span["bbox"]).intersects(rect):
                    hits.append(text)
    return hits


def main() -> None:
    if not SOURCE_PDF.is_file():
        raise FileNotFoundError(f"Official source PDF not found: {SOURCE_PDF}")

    manifest_path = PAGE_DIR / "fidelity_overlays.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    overlays = [item for item in manifest.get("overlays", [])
        if not item.get("region", "").startswith(REGION_PREFIX)]
    generated = []

    with fitz.open(SOURCE_PDF) as document:
        page = document[39]
        drawings = [
            drawing for drawing in page.get_drawings()
            if drawing.get("type") == "f" and drawing.get("fill") == (1.0, 1.0, 1.0)
            and 24.9 <= fitz.Rect(drawing["rect"]).width <= 25.1
            and 20.8 <= fitz.Rect(drawing["rect"]).height <= 21.1
            and 439.0 <= fitz.Rect(drawing["rect"]).y0 <= 442.0
        ]
        drawings.sort(key=lambda item: item["rect"].x0)
        if len(drawings) != len(EXPECTED_RECTS):
            raise ValueError(f"Expected two source flourishes, found {len(drawings)}")

        for side, drawing, expected in zip(("left", "right"), drawings, EXPECTED_RECTS, strict=True):
            source_rect = fitz.Rect(drawing["rect"])
            actual = tuple(float(v) for v in source_rect)
            if max(abs(a - b) for a, b in zip(actual, expected, strict=True)) > 0.03:
                raise ValueError(f"Source flourish bbox drifted: expected {expected}, got {actual}")
            clip = fitz.Rect(source_rect.x0 - PAD_PT, source_rect.y0 - PAD_PT,
                source_rect.x1 + PAD_PT, source_rect.y1 + PAD_PT)
            text_hits = spans_in(page, clip)
            if text_hits:
                raise ValueError(f"Source flourish crop would cover text: {text_hits}")

            pix = page.get_pixmap(matrix=fitz.Matrix(RENDER_SCALE, RENDER_SCALE), clip=clip, alpha=False)
            filename = f"fidelity-overlay-p40-white-flourish-{side}.png"
            pix.save(PAGE_DIR / filename)
            pixel_bbox = [pix.x / RENDER_SCALE, pix.y / RENDER_SCALE,
                (pix.x + pix.width) / RENDER_SCALE, (pix.y + pix.height) / RENDER_SCALE]
            generated.append({
                "url": f"/pages/page_040/{filename}",
                "bbox": [round(v, 6) for v in pixel_bbox],
                "widthPx": pix.width,
                "heightPx": pix.height,
                "language": "en",
                "languageInvariant": True,
                "zIndex": 2,
                "sourcePdfPage": 40,
                "sourceDrawingBboxPt": [round(v, 6) for v in source_rect],
                "region": f"{REGION_PREFIX} ({side} source crop)",
            })

    overlays.extend(generated)
    manifest["overlays"] = overlays
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    OLD_ASSET.unlink(missing_ok=True)
    print(json.dumps({"page": 40, "restoredSourceCrops": len(generated), "renderScale": RENDER_SCALE,
        "languageInvariant": True, "overlays": generated}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
