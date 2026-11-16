"""Restore p.70 vector attack icons and the black EXHAUST capsule.

Five attack icons are visible vector paths in the reference PDF but render as
empty white circles in the web page background. Restore only those icon gaps
as language-independent PDF crops, keeping nearby ATK text editable. The
EXHAUST capsule is a confirmed dark vector path over a purple base image; paint
that exact path (and its white arrow) back into the page background so the
editable white EXHAUST label stays live.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages/page_070"
BACKGROUND = PAGE_DIR / "background.webp"
SIDECAR = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-03-p070-attack-icons-exhaust-v1"

ATTACK_ICONS = {
    "redirect-adjacent-attack-1": [502.2750, 178.5690, 511.7220, 187.3680],
    "redirect-adjacent-attack-2": [551.7470, 187.0510, 561.1950, 195.8500],
    "redirect-adjacent-attack-3": [614.2590, 195.5330, 623.7060, 204.3320],
    "redirect-range-attack-1": [486.8240, 383.9366, 495.0272, 391.5986],
    "redirect-range-attack-2": [507.7117, 408.6502, 515.9145, 416.2896],
}

PILL_PATH = {
    "bbox": [272.79730224609375, 570.8878784179688, 319.2807312011719, 579.8575439453125],
    "fill": (0.13669031858444214, 0.12195010483264923, 0.1252918243408203),
}
ARROW_PATH = {
    "bbox": [276.47784423828125, 572.6134643554688, 282.9222412109375, 578.2120361328125],
    "fill": (1.0, 1.0, 1.0),
}


def close_values(actual, expected, tolerance: float = 0.025) -> bool:
    return len(actual) == len(expected) and all(
        abs(float(a) - float(e)) <= tolerance for a, e in zip(actual, expected)
    )


def cubic_points(p0, p1, p2, p3, steps: int):
    for index in range(1, steps + 1):
        t = index / steps
        u = 1 - t
        yield (
            u**3 * p0.x + 3 * u**2 * t * p1.x + 3 * u * t**2 * p2.x + t**3 * p3.x,
            u**3 * p0.y + 3 * u**2 * t * p1.y + 3 * u * t**2 * p2.y + t**3 * p3.y,
        )


def drawing_mask(drawing, crop_rect: pymupdf.Rect, scale_x: float, scale_y: float,
                 pixel_box: tuple[int, int, int, int], supersample: int = 4) -> Image.Image:
    px0, py0, px1, py1 = pixel_box
    mask = Image.new("L", ((px1 - px0) * supersample, (py1 - py0) * supersample), 0)
    draw = ImageDraw.Draw(mask)

    def to_local(point):
        return (
            (point[0] * scale_x - px0) * supersample,
            (point[1] * scale_y - py0) * supersample,
        )

    points = []
    for item in drawing["items"]:
        if item[0] == "l":
            start, end = item[1], item[2]
            if not points:
                points.append(to_local(start))
            elif math.dist(points[-1], to_local(start)) > 0.1:
                points.append(to_local(start))
            points.append(to_local(end))
        elif item[0] == "c":
            start, control1, control2, end = item[1:5]
            if not points:
                points.append(to_local(start))
            elif math.dist(points[-1], to_local(start)) > 0.1:
                points.append(to_local(start))
            nsteps = max(8, math.ceil((math.dist((start.x, start.y), (end.x, end.y))
                                       * max(scale_x, scale_y) * supersample) / 3))
            points.extend(to_local(point) for point in cubic_points(start, control1, control2, end, nsteps))
        else:
            raise SystemExit(f"Unexpected vector command in p.70 repair path: {item[0]!r}")
    if len(points) < 3:
        raise SystemExit("Source vector path was empty or incomplete")
    draw.polygon(points, fill=255)
    return mask.resize((px1 - px0, py1 - py0), Image.Resampling.LANCZOS)


def find_source_path(drawings, record, description):
    matches = [
        drawing for drawing in drawings
        if drawing.get("fill") is not None
        and close_values(drawing["rect"], record["bbox"])
        and close_values(drawing["fill"], record["fill"], tolerance=0.001)
    ]
    if len(matches) != 1:
        raise SystemExit(f"Expected one source {description} path, found {len(matches)}")
    return matches[0]


def apply_badge_background(page, args) -> None:
    background = Image.open(BACKGROUND).convert("RGB")
    scale_x = background.width / page.rect.width
    scale_y = background.height / page.rect.height
    crop_rect = pymupdf.Rect(271.5, 569.8, 320.5, 581.0)
    px0 = math.floor(crop_rect.x0 * scale_x)
    py0 = math.floor(crop_rect.y0 * scale_y)
    px1 = math.ceil(crop_rect.x1 * scale_x)
    py1 = math.ceil(crop_rect.y1 * scale_y)
    pixel_box = (px0, py0, px1, py1)
    patch = background.crop(pixel_box)
    drawings = page.get_drawings()
    for record, color, name in ((PILL_PATH, (35, 31, 32), "capsule"),
                                (ARROW_PATH, (255, 255, 255), "arrow")):
        drawing = find_source_path(drawings, record, f"EXHAUST {name}")
        mask = drawing_mask(drawing, crop_rect, scale_x, scale_y, pixel_box)
        patch = Image.composite(Image.new("RGB", patch.size, color), patch, mask)
    background.paste(patch, pixel_box[:2])
    if args.apply:
        background.save(BACKGROUND, "WEBP", lossless=True, quality=100, method=6)
    else:
        preview = ROOT / "tmp/visual-followup/page-by-page-070/exhaust-capsule-preview.png"
        patch.resize((patch.width * 8, patch.height * 8), Image.Resampling.NEAREST).save(preview)
        print(f"badge preview: {preview.relative_to(ROOT)}")


def add_icon_crops(page, args) -> None:
    sidecar = {"overlays": []}
    if SIDECAR.exists():
        sidecar = json.loads(SIDECAR.read_text(encoding="utf-8"))
    existing = sidecar.get("overlays")
    if not isinstance(existing, list):
        raise SystemExit(f"Invalid fidelity overlay sidecar: {SIDECAR}")

    for name, bbox in ATTACK_ICONS.items():
        url = f"/pages/page_070/fidelity-overlay-component-{name}.png"
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(args.scale, args.scale),
                                 clip=pymupdf.Rect(*bbox), alpha=False)
        target = PAGE_DIR / Path(url).name
        if args.apply:
            pixmap.save(str(target))
            existing[:] = [item for item in existing if item.get("url") != url]
            existing.append({
                "url": url,
                "bbox": bbox,
                "widthPx": pixmap.width,
                "heightPx": pixmap.height,
                "language": "en",
                "languageInvariant": True,
                "auditId": AUDIT_ID,
                "category": "component-icons",
                "sourcePdfPage": 70,
                "region": name,
            })
        else:
            print(f"preview crop {name}: bbox={bbox}, pixels={pixmap.width}x{pixmap.height}")
    if args.apply:
        sidecar["overlays"] = existing
        SIDECAR.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write p.70 icons and background correction")
    parser.add_argument("--pdf", type=Path, default=PDF)
    parser.add_argument("--scale", type=float, default=8.0)
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)
    if not BACKGROUND.is_file():
        raise FileNotFoundError(BACKGROUND)

    with pymupdf.open(args.pdf) as document:
        page = document[69]
        apply_badge_background(page, args)
        add_icon_crops(page, args)

    if args.apply:
        print("p.70: restored five source attack icons and the black EXHAUST capsule; text remains editable")


if __name__ == "__main__":
    main()
