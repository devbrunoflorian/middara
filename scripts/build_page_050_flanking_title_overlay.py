"""Restore the exact p. 50 Flanking title where the background extractor removed it."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages/page_050"
BACKGROUND_PATH = PAGE_DIR / "background.webp"
DOM_PATH = PAGE_DIR / "page_050_dom.json"
OVERLAY_PATH = PAGE_DIR / "fidelity-overlay-flanking-title.png"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "page50-flanking-title-pdf-pixel-overlay-v1"
TARGETS = {
    "line_12_0": ("Flanking and Backstab", (311.9358, 255.4145, 540.6978, 279.6785)),
    "line_16_0": ("Flanking and Backstab", (294.6592, 257.9523, 523.4213, 282.2163)),
}
TEXT_COLOR = "#ffffff"
PAD_PT = 3.0
DIFF_THRESHOLD = 8


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(PDF_PATH)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    lines = {
        line["id"]: line
        for block in dom.get("blocks", [])
        for line in block.get("lines", [])
    }
    for line_id, (expected_text, expected_bbox) in TARGETS.items():
        line = lines.get(line_id)
        text = "".join(span.get("text", "") for span in (line or {}).get("spans", []))
        bbox = (line or {}).get("bbox", [])
        spans = (line or {}).get("spans", [])
        if (
            line is None
            or text != expected_text
            or len(bbox) != 4
            or any(abs(actual - expected) > 0.02 for actual, expected in zip(bbox, expected_bbox))
            or any(span.get("font") != "Cinzel-Regular" or span.get("color") != TEXT_COLOR for span in spans)
        ):
            raise ValueError(f"Stale source target; refusing to build overlay for {line_id}")
        evidence = line.get("rasterizedDuplicateEvidence") or {}
        if line.get("rasterizedDuplicate") and evidence.get("auditId") != AUDIT_ID:
            raise ValueError(f"{line_id} already has an unrelated suppression marker")

    background = Image.open(BACKGROUND_PATH).convert("RGB")
    document = pymupdf.open(PDF_PATH)
    page = document[49]
    sx, sy = background.width / page.rect.width, background.height / page.rect.height
    pix = page.get_pixmap(matrix=pymupdf.Matrix(sx, sy), alpha=False)
    source = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    if source.size != background.size:
        raise ValueError(f"PDF/background size mismatch: {source.size} != {background.size}")

    boxes = [lines[line_id]["bbox"] for line_id in TARGETS]
    crop_box = (
        max(0, round((min(b[0] for b in boxes) - PAD_PT) * sx)),
        max(0, round((min(b[1] for b in boxes) - PAD_PT) * sy)),
        min(source.width, round((max(b[2] for b in boxes) + PAD_PT) * sx)),
        min(source.height, round((max(b[3] for b in boxes) + PAD_PT) * sy)),
    )
    source_crop = source.crop(crop_box).convert("RGBA")
    difference = ImageChops.difference(source.crop(crop_box), background.crop(crop_box)).convert("L")
    mask = difference.point(lambda value: 255 if value > DIFF_THRESHOLD else 0)
    # Include the antialiased edge immediately around the detected ink, while
    # keeping the crop constrained to this one title band.
    mask = mask.filter(ImageFilter.MaxFilter(3))
    ink = mask.getbbox()
    if not ink:
        raise ValueError("No PDF/background title pixels found in the guarded title crop")
    source_crop = source_crop.crop(ink)
    mask = mask.crop(ink)
    source_crop.putalpha(mask)
    source_crop.save(OVERLAY_PATH, optimize=True)

    bounds = (crop_box[0] + ink[0], crop_box[1] + ink[1], crop_box[0] + ink[2], crop_box[1] + ink[3])
    bbox_pt = [round(bounds[0] / sx, 5), round(bounds[1] / sy, 5), round(bounds[2] / sx, 5), round(bounds[3] / sy, 5)]
    sidecar = {
        "overlays": [
            {
                "url": "/pages/page_050/fidelity-overlay-flanking-title.png",
                "bbox": bbox_pt,
                "widthPx": source_crop.width,
                "heightPx": source_crop.height,
                "language": "en",
                "hideInAdmin": True,
            }
        ]
    }
    SIDECAR_PATH.write_text(json.dumps(sidecar, indent=2) + "\n", encoding="utf-8")

    for line_id, line in ((line_id, lines[line_id]) for line_id in TARGETS):
        line["rasterizedDuplicate"] = True
        line["rasterizedDuplicateReason"] = (
            "the PDF-cleaned background has no title pixels here; this exact source-PDF pixel overlay "
            "reproduces the published heading instead of the two misaligned HTML passes"
        )
        line["rasterizedDuplicateEvidence"] = {
            "auditId": AUDIT_ID,
            "sourcePdfPage": 50,
            "region": "Flanking and Backstab title band above the rules text",
            "rule": "hide only the two exact HTML passes backed by a title-local source-PDF pixel overlay",
            "evidenceRef": "docs/project-progress/2026-10-02-page50-flanking-title-tracer.md",
        }
    DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OVERLAY_PATH} ({source_crop.width}x{source_crop.height}), bbox_pt={bbox_pt}; suppressed {len(TARGETS)} guarded source lines")


if __name__ == "__main__":
    main()
