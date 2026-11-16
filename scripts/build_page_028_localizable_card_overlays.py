"""Restore p.28's complete English card artwork in both viewer languages.

The filename is retained for existing commands. Physical card text stays in
the PDF artwork; only neighboring live page prose gets transparent windows.
Source guards and quarter-point bounds keep this repair specific to p.28.
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
AUDIT_ID = "2026-10-04-page28-shared-artwork-v2"
AUDIT_REPORT = "docs/project-progress/2026-10-04-page28-shared-artwork-followup.md"
SOURCE_PAGE_NUMBER = 28
SCALE = 4.0
PROSE_PADDING_PT = 0.25

# Bounds include printed shadows and align to the 4x raster grid. Windows
# follow only the exact neighboring prose lines, never the physical card frame.
TARGETS = [
    {
        "region": "great-hammer",
        "bbox": [500.0, 122.5, 665.25, 367.75],
        "shadowBBox": [500.361, 122.873, 664.808, 367.297],
        "frameBBox": [503.79, 131.211, 657.51, 363.051],
        "proseLines": [],
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
        "bbox": [444.0, 380.25, 565.5, 556.5],
        "shadowBBox": [444.245, 380.433, 565.231, 556.113],
        "frameBBox": [447.775, 387.746, 557.935, 552.626],
        "proseLines": [(f"block_{block}", f"line_{block}_{line}")
                       for block in (8, 9, 10) for line in range(5)],
        "lineChecks": [
            ("block_113", "line_113_0", "Etherium"),
            ("block_114", "line_114_0", "UNIVERSAL UPGRADE"),
            ("block_115", "line_115_0", "+1"),
            ("block_115", "line_115_1", "+1"),
        ],
    },
    {
        "region": "master-work",
        "bbox": [617.5, 597.75, 739.25, 774.0],
        "shadowBBox": [617.875, 597.992, 738.861, 773.672],
        "frameBBox": [621.405, 605.305, 731.565, 770.185],
        "proseLines": [("block_11", "line_11_0"), ("block_12", "line_12_4")],
        "lineChecks": [
            ("block_120", "line_120_0", "Master Work"),
            ("block_122", "line_122_0", "WEAPON UPGRADE"),
            ("block_123", "line_123_0", "EXHAUST"),
            ("block_123", "line_123_1", "When making an Attack, add"),
            ("block_123", "line_123_2", "+1 TO THE ATK ROLL."),
        ],
    },
]

FLOURISHES = [
    {"region": "left-white-flourish", "bbox": [438.5, 94.0, 465.25, 116.5],
     "vectorBBox": [439.37, 94.7248, 464.388, 115.6288]},
    {"region": "right-white-flourish", "bbox": [698.75, 94.0, 725.25, 116.5],
     "vectorBBox": [699.488, 94.7248, 724.506, 115.6288]},
]


def bbox_intersection(a: list[float], b: list[float]) -> list[float] | None:
    result = [max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]
    return result if result[0] < result[2] and result[1] < result[3] else None


def validate_folio(page: pymupdf.Page, data: dict) -> tuple[dict, dict]:
    """Keep the PDF's gold outline and dark fill as one visible numeral."""
    block = next(b for b in data["blocks"] if b["id"] == "block_125")
    spans = []
    for line_id, color in [("line_125_0", "#fff574"), ("line_125_1", "#231f20")]:
        line = next(line for line in block["lines"] if line["id"] == line_id)
        if len(line["spans"]) != 1:
            raise ValueError(f"Folio span structure changed: {line_id}")
        span = line["spans"][0]
        expected = [49.3425, 775.7185, 61.2025, 787.9785]
        if (span["text"] != "28" or span["font"] != "OptimaLTStd-ExtraBlack"
                or span["size"] != 10 or span["color"] != color
                or any(abs(a - b) > 0.005 for a, b in zip(line["bbox"], expected))):
            raise ValueError(f"Source folio DOM changed: {line_id}")
        spans.append(span)
    traces = [t for t in page.get_texttrace() if t["font"] == "OptimaLTStd-ExtraBlack"
              and "".join(chr(c[0]) for c in t["chars"]) == "28"]
    if len(traces) != 2:
        raise ValueError("Expected exactly two p.28 folio paint passes")
    for role, rgb in [(1, (1.0, 0.9612879, 0.4567483)), (0, (0.1366903, 0.1219501, 0.1252918))]:
        passes = [t for t in traces if t["type"] == role]
        if (len(passes) != 1
                or any(abs(a - b) > 0.0001 for a, b in zip(passes[0]["color"], rgb))
                or any(abs(a - b) > 0.005 for a, b in
                       zip(passes[0]["bbox"], [49.3425, 777.49, 61.2025, 787.49]))):
            raise ValueError(f"Source folio paint changed: role={role}")
        if role == 1 and passes[0]["linewidth"] != 1.5:
            raise ValueError("Source folio stroke width changed")
    return spans[0], spans[1]


def validate_targets(page: pymupdf.Page, page_data: dict) -> dict[tuple[str, str], dict]:
    if not all(abs(actual - expected) < 0.01 for actual, expected in zip(page.rect, (0, 0, 820.346, 820.346))):
        raise ValueError(f"Unexpected p.28 source page dimensions: {page.rect}")

    lines: dict[tuple[str, str], dict] = {}
    for block in page_data.get("blocks", []):
        for line in block.get("lines", []):
            lines[(str(block.get("id")), str(line.get("id")))] = line

    image_boxes = [info["bbox"] for info in page.get_image_info(xrefs=True)]
    drawings = page.get_drawings()
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
        if not any(all(abs(a - b) < 0.005 for a, b in zip(d["rect"], target["frameBBox"]))
                   for d in drawings):
            raise ValueError(f"Source card frame changed: {target['region']}")
        target["safeWindows"] = []
        for key in target["proseLines"]:
            if key not in lines:
                raise ValueError(f"Missing neighboring prose line: {key}")
            line_box = [float(value) for value in lines[key]["bbox"]]
            padded = [line_box[0] - PROSE_PADDING_PT, line_box[1] - PROSE_PADDING_PT,
                      line_box[2] + PROSE_PADDING_PT, line_box[3] + PROSE_PADDING_PT]
            window = bbox_intersection(crop, padded)
            if window is None or bbox_intersection(window, target["frameBBox"]):
                raise ValueError(f"Prose window would cut the card frame: {target['region']} {key}")
            target["safeWindows"].append(window)

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
    for target in FLOURISHES:
        matches = [d for d in drawings if
                   all(abs(a - b) < 0.005 for a, b in zip(d["rect"], target["vectorBBox"]))]
        if len(matches) != 1 or matches[0]["fill"] != (1.0, 1.0, 1.0):
            raise ValueError(f"White source ornament changed: {target['region']}")
        if any(bbox_intersection(target["bbox"], line["bbox"]) for line in lines.values()):
            raise ValueError(f"Ornament crop intersects live text: {target['region']}")
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
) -> tuple[str, tuple[int, int]]:
    bbox = target["bbox"]
    pix = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(*bbox), alpha=False)
    actual_bbox = [pix.x / SCALE, pix.y / SCALE,
                   (pix.x + pix.width) / SCALE, (pix.y + pix.height) / SCALE]
    if actual_bbox != bbox:
        raise ValueError(f"Crop must align with the raster grid: {actual_bbox} != {bbox}")
    source = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("RGBA")
    alpha = Image.new("L", source.size, 255)
    draw = ImageDraw.Draw(alpha)

    for window in target.get("safeWindows", []):
        left, top, right, bottom = pt_rect_to_pixels(window, (pix.x, pix.y), source.size)
        if right > left and bottom > top:
            draw.rectangle((left, top, right - 1, bottom - 1), fill=0)
    source.putalpha(alpha)

    suffix = "-en" if "shadowBBox" in target else ""
    asset_name = f"fidelity-overlay-component-page28-{target['region']}{suffix}.png"
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
        validate_targets(page, page_data)
        stroke, fill = validate_folio(page, page_data)

        sidecar = {"overlays": []}
        if SIDECAR_PATH.is_file():
            sidecar = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
            if not isinstance(sidecar, dict) or not isinstance(sidecar.get("overlays"), list):
                raise ValueError(f"Invalid overlay sidecar: {SIDECAR_PATH}")

        # Remove only the six variants created by v1, retaining unrelated assets.
        obsolete_urls = {f"/pages/page_028/fidelity-overlay-component-page28-{t['region']}-{suffix}.png"
                         for t in TARGETS for suffix in ("en", "ptbr")}
        sidecar["overlays"] = [item for item in sidecar["overlays"]
                               if item.get("url") not in obsolete_urls]
        for target in TARGETS + FLOURISHES:
            asset_name, size = create_asset(page, target)
            url = f"/pages/page_028/{asset_name}"
            sidecar["overlays"] = [item for item in sidecar["overlays"] if item.get("url") != url]
            sidecar["overlays"].append({
                "url": url, "bbox": target["bbox"], "widthPx": size[0], "heightPx": size[1],
                "language": "en", "languageInvariant": True, "auditId": AUDIT_ID,
                "category": "item-cards" if "shadowBBox" in target else "fixed-artwork",
                "sourcePdfPage": SOURCE_PAGE_NUMBER, "region": target["region"],
                "evidenceRef": AUDIT_REPORT,
            })
            print(f"EN/PT-BR {target['region']}: {size[0]}x{size[1]} bbox={target['bbox']}")

    stroke.update(renderOnlyStrokePass=True, sourcePaintRole="stroke-only", sourcePaintAuditId=AUDIT_ID)
    fill.update(renderTextStrokeWidthPt=1.5, renderTextStrokeColor="#fff574",
                sourcePaintRole="fill-with-source-stroke", sourcePaintAuditId=AUDIT_ID)
    updated_dom = json.dumps(page_data, ensure_ascii=False, indent=2) + "\n"
    if DOM_PATH.read_text(encoding="utf-8") != updated_dom:
        backup = ROOT / "tmp/page28-shared-artwork/page_028_dom-before.json"
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            backup.write_bytes(DOM_PATH.read_bytes())
        DOM_PATH.write_text(updated_dom, encoding="utf-8")

    SIDECAR_PATH.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Registered 5 shared source crops; validated 20 card lines and 17 neighboring prose windows.")
    print("Only folio paint metadata changed in the DOM; the translation database was not modified.")


if __name__ == "__main__":
    main()
