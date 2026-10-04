"""Build language-aware, source-PDF crops for the three item cards on p. 28.

English uses the full physical card. The PT-BR variant keeps the same English
artwork but punches transparent windows around printed text so database
translations remain visible. Both variants protect the live prose beside the
Etherium and Master Work cards. This is intentionally page-specific.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PAGE_DIR = ROOT / "apps/web/public/pages/page_028"
DOM_PATH = PAGE_DIR / "page_028_dom.json"
SIDECAR_PATH = PAGE_DIR / "fidelity_overlays.json"
AUDIT_ID = "2026-10-04-page28-item-card-localizable-v1"
AUDIT_REPORT = "docs/project-progress/2026-10-04-page28-item-card-text-overlay.md"
SOURCE_PAGE_NUMBER = 28
SCALE = 4.0
TEXT_WINDOW_PADDING_PT = 0.75

# Bounds follow the printed card shadows measured from the source PDF. The
# transparent gutter rectangles keep neighboring page prose live in both
# language variants; their intersections were checked against p.28 DOM lines.
TARGETS = [
    {
        "region": "great-hammer",
        "bbox": [500.0, 122.5, 665.2, 367.8],
        "shadowBBox": [500.361, 122.873, 664.808, 367.297],
        "safeWindows": [],
        "lineChecks": [
            ("block_45", "line_45_0", "Great Hammer"),
            ("block_100", "line_100_0", "30"),
            ("block_100", "line_100_1", "30"),
            ("block_100", "line_100_2", "BLUNT"),
            ("block_101", "line_101_0", "2"),
            ("block_102", "line_102_0", "+1 PHYSICAL DMG"),
            ("block_102", "line_102_1", "+1 PHYSICAL DMG"),
            ("block_103", "line_103_0", "EXHAUST"),
            ("block_104", "line_104_0", "FU:"),
            ("block_105", "line_105_0", "opponents"),
            ("block_106", "line_106_0", "FORCE 7"),
        ],
    },
    {
        "region": "etherium",
        "bbox": [444.0, 380.2, 565.5, 556.4],
        "shadowBBox": [444.245, 380.433, 565.231, 556.113],
        "safeWindows": [[563.0, 380.2, 565.5, 556.4]],
        "lineChecks": [
            ("block_113", "line_113_0", "Etherium"),
            ("block_114", "line_114_0", "UNIVERSAL UPGRADE"),
            ("block_115", "line_115_0", "+1"),
            ("block_115", "line_115_1", "+1"),
        ],
    },
    {
        "region": "master-work",
        "bbox": [617.5, 597.7, 739.1, 774.0],
        "shadowBBox": [617.875, 597.992, 738.861, 773.672],
        "safeWindows": [[617.5, 597.7, 633.0, 774.0]],
        "lineChecks": [
            ("block_120", "line_120_0", "Master Work"),
            ("block_122", "line_122_0", "WEAPON UPGRADE"),
            ("block_123", "line_123_0", "EXHAUST"),
            ("block_123", "line_123_1", "When making an Attack, add"),
            ("block_123", "line_123_2", "+1 TO THE ATK ROLL."),
        ],
    },
]


def bbox_intersection(a: list[float], b: list[float]) -> list[float] | None:
    result = [max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]
    return result if result[0] < result[2] and result[1] < result[3] else None


def validate_targets(page: pymupdf.Page, page_data: dict) -> dict[tuple[str, str], dict]:
    if not all(abs(actual - expected) < 0.01 for actual, expected in zip(page.rect, (0, 0, 820.346, 820.346))):
        raise ValueError(f"Unexpected p.28 source page dimensions: {page.rect}")

    lines: dict[tuple[str, str], dict] = {}
    for block in page_data.get("blocks", []):
        for line in block.get("lines", []):
            lines[(str(block.get("id")), str(line.get("id")))] = line

    image_boxes = [info["bbox"] for info in page.get_image_info(xrefs=True)]
    for target in TARGETS:
        shadow = target["shadowBBox"]
        found = any(
            all(abs(float(actual) - expected) <= 0.03 for actual, expected in zip(image_box, shadow))
            for image_box in image_boxes
        )
        if not found:
            raise ValueError(f"Source-PDF shadow geometry changed for {target['region']}: {shadow}")
        crop = target["bbox"]
        if not (crop[0] < shadow[0] and crop[1] < shadow[1] and crop[2] > shadow[2] and crop[3] > shadow[3]):
            raise ValueError(f"Crop does not fully contain the source shadow for {target['region']}")

    expected_keys = set()
    for target in TARGETS:
        box = target["bbox"]
        target_keys = set()
        for block_id, line_id, expected_text in target["lineChecks"]:
            key = (block_id, line_id)
            if key not in lines:
                raise ValueError(f"Missing audited line: {block_id}/{line_id}")
            line = lines[key]
            actual_text = "".join(str(span.get("text", "")) for span in line.get("spans", []))
            if expected_text not in actual_text:
                raise ValueError(f"Line drift at {block_id}/{line_id}: {actual_text!r}")
            line_box = [float(value) for value in line["bbox"]]
            center = ((line_box[0] + line_box[2]) / 2, (line_box[1] + line_box[3]) / 2)
            if not (box[0] <= center[0] <= box[2] and box[1] <= center[1] <= box[3]):
                raise ValueError(f"Audited text center left its card crop: {block_id}/{line_id}")
            target_keys.add(key)
            expected_keys.add(key)
        target["textLines"] = [lines[key] for key in sorted(target_keys)]

    # Any non-card line intersecting an opaque part of a crop would be hidden.
    # Require the whole intersection to fit inside one explicit live-text gutter.
    for target in TARGETS:
        box = target["bbox"]
        safe_windows = target["safeWindows"]
        for key, line in lines.items():
            if key in expected_keys:
                continue
            line_box = [float(value) for value in line.get("bbox", [])]
            if len(line_box) != 4:
                continue
            intersection = bbox_intersection(box, line_box)
            if not intersection:
                continue
            if not any(
                window[0] <= intersection[0]
                and window[1] <= intersection[1]
                and window[2] >= intersection[2]
                and window[3] >= intersection[3]
                for window in safe_windows
            ):
                block_id, line_id = key
                text = "".join(str(span.get("text", "")) for span in line.get("spans", []))
                raise ValueError(
                    f"Unprotected live text intersects {target['region']}: "
                    f"{block_id}/{line_id} {text!r} at {intersection}"
                )

    if len(expected_keys) != 20:
        raise ValueError(f"Expected 20 unique card text lines, found {len(expected_keys)}")
    return lines


def pt_rect_to_pixels(
    window: list[float],
    pixel_origin: tuple[int, int],
    image_size: tuple[int, int],
) -> tuple[int, int, int, int]:
    px0, py0 = pixel_origin
    width, height = image_size
    left = max(0, math.floor(window[0] * SCALE) - px0)
    top = max(0, math.floor(window[1] * SCALE) - py0)
    right = min(width, math.ceil(window[2] * SCALE) - px0)
    bottom = min(height, math.ceil(window[3] * SCALE) - py0)
    return left, top, right, bottom


def create_asset(
    page: pymupdf.Page,
    target: dict,
    lines: dict[tuple[str, str], dict],
    language: str,
) -> tuple[str, tuple[int, int]]:
    bbox = target["bbox"]
    pix = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(*bbox), alpha=False)
    source = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("RGBA")
    alpha = Image.new("L", source.size, 255)
    draw = ImageDraw.Draw(alpha)

    windows = [list(window) for window in target["safeWindows"]]
    if language == "pt-BR":
        for block_id, line_id, _ in target["lineChecks"]:
            line = lines[(block_id, line_id)]
            x0, y0, x1, y1 = (float(value) for value in line["bbox"])
            windows.append([
                max(bbox[0], x0 - TEXT_WINDOW_PADDING_PT),
                max(bbox[1], y0 - TEXT_WINDOW_PADDING_PT),
                min(bbox[2], x1 + TEXT_WINDOW_PADDING_PT),
                min(bbox[3], y1 + TEXT_WINDOW_PADDING_PT),
            ])

    for window in windows:
        left, top, right, bottom = pt_rect_to_pixels(window, (pix.x, pix.y), source.size)
        if right > left and bottom > top:
            draw.rectangle((left, top, right - 1, bottom - 1), fill=0)
    source.putalpha(alpha)

    suffix = "en" if language == "en" else "ptbr"
    asset_name = f"fidelity-overlay-component-page28-{target['region']}-{suffix}.png"
    source.save(PAGE_DIR / asset_name, optimize=True)
    return asset_name, source.size


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(f"Source PDF not found: {PDF_PATH}")
    if not DOM_PATH.is_file():
        raise FileNotFoundError(f"Page DOM not found: {DOM_PATH}")

    page_data = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    with pymupdf.open(PDF_PATH) as document:
        page = document[SOURCE_PAGE_NUMBER - 1]
        lines = validate_targets(page, page_data)

        sidecar = {"overlays": []}
        if SIDECAR_PATH.is_file():
            sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
            if not isinstance(sidecar, dict) or not isinstance(sidecar.get("overlays"), list):
                raise ValueError(f"Invalid overlay sidecar: {SIDECAR_PATH}")

        for target in TARGETS:
            for language in ("en", "pt-BR"):
                asset_name, size = create_asset(page, target, lines, language)
                url = f"/pages/page_028/{asset_name}"
                sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
                sidecar["overlays"].append({
                    "url": url,
                    "bbox": target["bbox"],
                    "widthPx": size[0],
                    "heightPx": size[1],
                    "language": language,
                    "languageInvariant": False,
                    "auditId": AUDIT_ID,
                    "category": "item-cards",
                    "sourcePdfPage": SOURCE_PAGE_NUMBER,
                    "region": target["region"],
                    "localizableCardText": True,
                    "evidenceRef": AUDIT_REPORT,
                })
                print(f"{language} {target['region']}: {size[0]}x{size[1]} bbox={target['bbox']}")

    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Registered {len(TARGETS) * 2} language-specific crops; validated 20 text lines and live-prose windows.")
    print("The page DOM and translation database were not modified.")


if __name__ == "__main__":
    main()
