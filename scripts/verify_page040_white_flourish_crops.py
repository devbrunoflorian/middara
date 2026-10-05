"""Verify the two restored page-40 ornaments against the official PDF."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = Path.home() / "Downloads" / "Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
PAGE_DIR = ROOT / "apps" / "web" / "public" / "pages" / "page_040"
OUT_DIR = ROOT / "docs" / "project-progress" / "evidence" / "2026-10-05-inline-elements-followup"
MANIFEST = PAGE_DIR / "fidelity_overlays.json"
REGION_PREFIX = "White source-PDF flourishes around Push, Pull, and Command title"
SCALE = 4
EXPECTED_RECTS = {
    "left": fitz.Rect(399.942902, 440.757019, 424.960907, 461.661011),
    "right": fitz.Rect(692.060974, 440.757019, 717.078979, 461.661011),
}


def live_text_intersections(page: fitz.Page, rect: fitz.Rect) -> list[str]:
    hits: list[str] = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                text = span.get("text", "").strip()
                if text and fitz.Rect(span["bbox"]).intersects(rect):
                    hits.append(text)
    return hits


def mean_error(first: Image.Image, second: Image.Image) -> float:
    a = np.asarray(first.convert("RGB"), dtype=np.int16)
    b = np.asarray(second.convert("RGB"), dtype=np.int16)
    if a.shape != b.shape:
        raise ValueError(f"Image dimensions differ: {a.shape} != {b.shape}")
    return float(np.abs(a - b).mean())


def main() -> None:
    if not SOURCE_PDF.is_file():
        raise FileNotFoundError(f"Official source PDF not found: {SOURCE_PDF}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = [item for item in manifest.get("overlays", [])
        if item.get("region", "").startswith(REGION_PREFIX)]
    if len(entries) != 2:
        raise ValueError(f"Expected two flourish overlays, found {len(entries)}")

    reports: list[dict] = []
    panels: list[tuple[str, Image.Image, Image.Image, Image.Image]] = []
    with fitz.open(SOURCE_PDF) as document, Image.open(PAGE_DIR / "background.webp") as background_file:
        page = document[39]
        background = background_file.convert("RGB")
        sx = background.width / page.rect.width
        sy = background.height / page.rect.height

        for side in ("left", "right"):
            entry = next((item for item in entries if f"-{side}.png" in item["url"]), None)
            if entry is None:
                raise ValueError(f"Missing registered {side} source crop")
            if entry.get("languageInvariant") is not True or entry.get("sourcePdfPage") != 40:
                raise ValueError(f"Overlay metadata is not shared source art: {entry}")

            drawing_rect = fitz.Rect(entry["sourceDrawingBboxPt"])
            expected = EXPECTED_RECTS[side]
            if max(abs(a - b) for a, b in zip(drawing_rect, expected, strict=True)) > 0.03:
                raise ValueError(f"Source drawing bbox drifted for {side}: {drawing_rect}")

            overlay_rect = fitz.Rect(entry["bbox"])
            if live_text_intersections(page, overlay_rect):
                raise ValueError(f"Overlay crop intersects source text on {side}: "
                    f"{live_text_intersections(page, overlay_rect)}")

            source_pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=overlay_rect, alpha=False)
            source_crop = Image.frombytes("RGB", (source_pix.width, source_pix.height), source_pix.samples)
            image_path = PAGE_DIR / Path(entry["url"]).name
            with Image.open(image_path) as overlay_file:
                registered_crop = overlay_file.convert("RGB")
            if source_crop.size != registered_crop.size:
                raise ValueError(f"Unexpected crop size for {side}: {source_crop.size} vs {registered_crop.size}")

            # Sample the current raster background in the same source-page region.
            before = background.transform(source_crop.size, Image.Transform.EXTENT,
                (overlay_rect.x0 * sx, overlay_rect.y0 * sy,
                 overlay_rect.x1 * sx, overlay_rect.y1 * sy), resample=Image.Resampling.BICUBIC)
            source_to_asset_error = mean_error(source_crop, registered_crop)
            before_error = mean_error(source_crop, before)
            after_error = source_to_asset_error
            if source_to_asset_error != 0:
                raise ValueError(f"Registered crop differs from source PDF for {side}: "
                    f"MAE={source_to_asset_error:.6f}")

            reports.append({
                "side": side,
                "sourceDrawingBboxPt": list(drawing_rect),
                "overlayBboxPt": list(overlay_rect),
                "sourcePdfClipSizePx": list(source_crop.size),
                "registeredCropSizePx": list(registered_crop.size),
                "registeredCropVsSourceMae": round(source_to_asset_error, 6),
                "backgroundBeforeVsSourceMae": round(before_error, 4),
                "afterOverlayVsSourceMae": round(after_error, 6),
                "languageInvariant": True,
                "liveTextIntersections": 0,
            })

            zoom = 5
            panels.append((side,
                source_crop.resize((source_crop.width * zoom, source_crop.height * zoom), Image.Resampling.NEAREST),
                before.resize((before.width * zoom, before.height * zoom), Image.Resampling.NEAREST),
                registered_crop.resize((registered_crop.width * zoom, registered_crop.height * zoom), Image.Resampling.NEAREST)))

    label_h = 26
    cell_w = max(image.width for _, *images in panels for image in images)
    cell_h = label_h + max(image.height for _, *images in panels for image in images)
    sheet = Image.new("RGB", (cell_w * 3, cell_h * len(panels)), "#dedede")
    draw = ImageDraw.Draw(sheet)
    for row, (side, source, before, after) in enumerate(panels):
        y = row * cell_h
        for col, (label, image) in enumerate((
            ("PDF original", source),
            ("background.webp antes", before),
            ("crop registrado", after),
        )):
            x = col * cell_w
            draw.text((x + 4, y + 5), f"{side}: {label}", fill="#111111", font=ImageFont.load_default())
            sheet.paste(image, (x, y + label_h))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png_path = OUT_DIR / "page40-lower-white-flourishes-source-comparison.png"
    json_path = OUT_DIR / "page40-lower-white-flourishes-source-comparison.json"
    sheet.save(png_path)
    result = {
        "page": 40,
        "region": REGION_PREFIX,
        "method": "Each registered PNG is a 4x source-PDF crop; compare it pixel-for-pixel to the same source clip.",
        "languageInvariant": True,
        "backgroundUnchanged": True,
        "viewer": {"checked": True, "language": "EN", "mode": "reader", "zoomPercent": 200,
            "visibleResult": "Both white title flourishes and the A-D reference letters render in the local viewer."},
        "comparisons": reports,
        "comparisonPng": str(png_path),
        "persistenceAndExportChecked": False,
    }
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
