"""Restore nine color names and the white die beside the p.102 dice chart.

Labels are rasterized in the official PDF artwork and have no editable DOM
spans. This extracts only the white lettering onto transparent PNGs. It also
restores the separate white die icon as a tight opaque crop from the source;
the chart cells and neighboring dice remain untouched. Dry-run default.
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
PAGE = 102
PAGE_DIR = ROOT / f"apps/web/public/pages/page_{PAGE:03d}"
DOM_PATH = PAGE_DIR / f"page_{PAGE:03d}_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-04-p102-dice-color-labels-v1"
CUBE_AUDIT_ID = "2026-10-04-p102-white-die-v1"
SCALE = 8.0
CUBE_BBOX = (249.6, 163.3, 267.2, 181.3)

# Tight point-coordinate crops measured from the official PDF render at 1.25×.
# The right edge ends before the separate color-cube pictograms.
LABELS = [
    ("black", "BLACK", (214.7, 112.3, 244.5, 120.5)),
    ("white", "WHITE", (208.3, 168.3, 245.3, 177.3)),
    ("teal", "TEAL", (219.5, 215.5, 245.3, 224.5)),
    ("green", "GREEN", (209.1, 262.7, 244.5, 271.7)),
    ("blue", "BLUE", (218.7, 309.9, 245.3, 318.9)),
    ("purple", "PURPLE", (205.1, 365.9, 245.3, 374.9)),
    ("orange", "ORANGE", (197.1, 413.9, 245.3, 422.9)),
    ("red", "RED", (224.3, 461.9, 245.3, 470.9)),
    ("grey", "GREY", (217.1, 509.9, 245.3, 518.9)),
]


def has_overlap(a: tuple[float, ...], b: tuple[float, ...]) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def make_alpha_crop(page: pymupdf.Page, bbox: tuple[float, ...], label: str) -> Image.Image:
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(*bbox), alpha=False)
    rgb = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
    gray = np.rint(rgb @ np.array([0.299, 0.587, 0.114])).astype(np.float32)
    bright_pixels = int(np.count_nonzero(gray > 185))
    if bright_pixels < len(label) * 3:
        raise SystemExit(f"Source crop for {label} has too little white ink ({bright_pixels} pixels)")

    border = np.concatenate((gray[0], gray[-1], gray[:, 0], gray[:, -1]))
    if float(np.median(border)) > 16:
        raise SystemExit(f"Source crop for {label} is no longer surrounded by black chart background")

    # Luminance on the black chart gives a natural antialias alpha mask. Paint
    # the isolated foreground white while leaving every background pixel clear.
    alpha = np.rint(np.clip((gray - 8.0) * (255.0 / 247.0), 0, 255)).astype(np.uint8)
    rgba = np.zeros((pixmap.height, pixmap.width, 4), dtype=np.uint8)
    rgba[:, :, :3] = 255
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def make_white_die_crop(page: pymupdf.Page) -> Image.Image:
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(*CUBE_BBOX), alpha=False)
    rgb = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3).copy()
    gray = np.rint(rgb @ np.array([0.299, 0.587, 0.114])).astype(np.float32)
    bright_pixels = int(np.count_nonzero(gray > 205))
    if bright_pixels < 250:
        raise SystemExit(f"Source crop for WHITE die has too little white ink ({bright_pixels} pixels)")

    border = np.concatenate((gray[0], gray[-1], gray[:, 0], gray[:, -1]))
    if float(np.median(border)) > 24:
        raise SystemExit("WHITE die crop is not surrounded by the expected black chart background")
    return Image.fromarray(rgb, "RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the validated label crops, white die crop, and sidecar entries")
    parser.add_argument("--pdf", type=Path, default=PDF)
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    if dom.get("page_number") != PAGE or abs(float(dom.get("width", 0)) - 820.346) > 0.05:
        raise SystemExit("Unexpected p.102 DOM identity or page geometry")

    source_spans = []
    for block in dom.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if span.get("bbox") and span.get("text"):
                    source_spans.append((span["text"], tuple(span["bbox"])))
    for slug, label, bbox in LABELS:
        if any(label in text.upper() and has_overlap(bbox, span_bbox) for text, span_bbox in source_spans):
            raise SystemExit(f"{label} now has an editable DOM span at the raster label position; do not add a duplicate")
    if any(has_overlap(CUBE_BBOX, span_bbox) for _text, span_bbox in source_spans):
        raise SystemExit("WHITE die source crop overlaps an editable DOM span; do not add an image over text")

    sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
    if not isinstance(sidecar.get("overlays"), list):
        raise SystemExit("Invalid p.102 fidelity overlay sidecar")

    crops = []
    with pymupdf.open(args.pdf) as document:
        page = document[PAGE - 1]
        if abs(page.rect.width - float(dom["width"])) > 0.05 or abs(page.rect.height - float(dom["height"])) > 0.05:
            raise SystemExit("p.102 PDF geometry no longer matches the page DOM")
        for slug, label, bbox in LABELS:
            crop = make_alpha_crop(page, bbox, label)
            crops.append((slug, label, bbox, crop))
        white_die = make_white_die_crop(page)

    new_overlays = []
    for slug, label, bbox, crop in crops:
        filename = f"fidelity-overlay-component-dice-color-label-{slug}.png"
        url = f"/pages/page_{PAGE:03d}/{filename}"
        new_overlays.append({
            "url": url,
            "bbox": list(bbox),
            "widthPx": crop.width,
            "heightPx": crop.height,
            "language": "en",
            "auditId": AUDIT_ID,
            "category": "chart-row-label",
            "sourcePdfPage": PAGE,
            "region": f"{label} label beside the corresponding dice chart row",
            "alphaMask": "white lettering isolated from the black chart background",
        })

    cube_filename = "fidelity-overlay-component-dice-white-row-cube.png"
    cube_overlay = {
        "url": f"/pages/page_{PAGE:03d}/{cube_filename}",
        "bbox": list(CUBE_BBOX),
        "widthPx": white_die.width,
        "heightPx": white_die.height,
        "language": "en",
        "languageInvariant": True,
        "auditId": CUBE_AUDIT_ID,
        "category": "component-icons",
        "sourcePdfPage": PAGE,
        "region": "white die icon in the WHITE row of the dice chart",
        "sourceCrop": "opaque crop over the chart's black background",
    }

    print(f"Verified {len(crops)} white source labels and the WHITE die; confirmed no editable spans occupy their positions.")
    for slug, label, bbox, crop in crops:
        print(f"  {label}: bbox={tuple(round(v, 2) for v in bbox)}, png={crop.width}x{crop.height}")
    if not args.apply:
        print("Dry run only. Would restore BLACK, WHITE, TEAL, GREEN, BLUE, PURPLE, ORANGE, RED, GREY, and the WHITE die icon.")
        return

    for (slug, _label, _bbox, crop), overlay in zip(crops, new_overlays):
        crop.save(PAGE_DIR / Path(overlay["url"]).name)
    white_die.save(PAGE_DIR / cube_filename)
    keep = [
        item for item in sidecar["overlays"]
        if item.get("auditId") not in {AUDIT_ID, CUBE_AUDIT_ID}
    ]
    sidecar["overlays"] = keep + new_overlays + [cube_overlay]
    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("p.102: restored nine English-only color labels and the white die; other dice and editable lower legend are unchanged")


if __name__ == "__main__":
    main()
