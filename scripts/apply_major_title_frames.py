#!/usr/bin/env python3
"""Add layout frames for page titles and unframed section headings.

The first book-wide pass concentrated on prose blocks.  This pass handles the
other recurring family that is visible in the editor: banner titles, CONTINUED
titles, and the Cinzel section heads at the top of a column.  It intentionally
leaves raster-backed labels and confirmed duplicate text alone.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PAGE_ROOT = ROOT / "apps" / "web" / "public" / "pages"

LEFT_X = 86.1732
RIGHT_X = 415.8425
COLUMN_W = 318.3310
FULL_W = 615.0

# A small number of source dividers are vector-only rather than extracted as
# raster strips.  Keep these source-backed coordinates explicit so the same
# rule still governs the app and the audit script can explain the exception.
VECTOR_RULE_FRAMES: dict[tuple[int, str], dict[str, Any]] = {
    # Combatant Loot Cards, p. 57: divider from x=86.2 to x=404.2.
    (57, "block_69"): {"x": LEFT_X, "width": COLUMN_W, "textAlign": "left"},
}


def spans(block: dict[str, Any]) -> list[dict[str, Any]]:
    return [span for line in block.get("lines", []) for span in line.get("spans", [])]


def text_of(block: dict[str, Any]) -> str:
    return "".join(str(span.get("text", "")) for span in spans(block)).replace("\n", " ").strip()


def has_raster_duplicate(block: dict[str, Any]) -> bool:
    return any(line.get("rasterizedDuplicate") for line in block.get("lines", []))


def finite_images(dom: dict[str, Any]) -> list[list[float]]:
    width = float(dom.get("width", 820.346))
    height = float(dom.get("height", 820.346))
    result: list[list[float]] = []
    for image in dom.get("images", []):
        if image.get("role") != "content" or len(image.get("bbox", [])) != 4:
            continue
        bbox = [float(value) for value in image["bbox"]]
        image_width = bbox[2] - bbox[0]
        image_height = bbox[3] - bbox[1]
        if image_width >= width * 0.85 or image_height >= height * 0.82:
            continue
        if image_width >= width * 0.30 and image_height <= height * 0.05:
            continue
        result.append(bbox)
    return result


def title_rule_images(dom: dict[str, Any]) -> list[list[float]]:
    """Return the narrow raster strips that carry a heading divider/ornament."""
    result: list[list[float]] = []
    for image in dom.get("images", []):
        if image.get("role") != "content" or len(image.get("bbox", [])) != 4:
            continue
        bbox = [float(value) for value in image["bbox"]]
        x1, y1, x2, y2 = bbox
        width, height = x2 - x1, y2 - y1
        if width >= 250 and height >= 2 and height <= 55 and y1 >= 20 and y1 <= 70 and y2 <= 112:
            result.append(bbox)
    return result


def overlaps(a: list[float], b: list[float]) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def intersects_raster_title(block: dict[str, Any], images: list[list[float]]) -> bool:
    bbox = [float(value) for value in block.get("bbox", [])]
    return len(bbox) == 4 and any(overlaps(bbox, image) for image in images)


def looks_like_small_heading(block: dict[str, Any], page: int) -> bool:
    block_spans = spans(block)
    if not block_spans:
        return False
    text = text_of(block)
    if not text or len(text) > 95 or len(block.get("lines", [])) != 1:
        return False
    fonts = {str(span.get("font", "")) for span in block_spans}
    sizes = [float(span.get("size", 0)) for span in block_spans]
    if not any("Cinzel" in font for font in fonts):
        return False
    size = max(sizes)
    if size < 11.5 or size >= 18 or any(float(span.get("size", 0)) < 11.5 for span in block_spans):
        return False
    x, y = float(block["bbox"][0]), float(block["bbox"][1])
    if y >= 220:
        return False
    # Avoid numbered prose, card labels, and the tiny labels inside diagrams.
    lowered = text.lower()
    if lowered[0].isdigit() or "animate" in lowered or "nightingale" in lowered:
        return False
    if lowered in {"blue", "red", "green", "yellow", "white", "summoning"}:
        return False
    if x < 60 or (250 < x < 390) or x > 700:
        return False
    # These are table captions/reference labels, not editable prose rails.
    if page >= 95:
        return False
    return x <= 115 or 400 <= x <= 430


def looks_like_large_column_heading(block: dict[str, Any]) -> bool:
    block_spans = spans(block)
    if not block_spans or len(block.get("lines", [])) != 1:
        return False
    text = text_of(block)
    if not text or len(text) > 80:
        return False
    if not all("Cinzel" in str(span.get("font", "")) for span in block_spans):
        return False
    x, y = float(block["bbox"][0]), float(block["bbox"][1])
    return y < 220 and (x <= 115 or 400 <= x <= 430)


def looks_like_major_title(block: dict[str, Any]) -> bool:
    block_spans = spans(block)
    if not block_spans:
        return False
    text = text_of(block)
    if not text or len(text) > 80 or len(block.get("lines", [])) != 1:
        return False
    sizes = [float(span.get("size", 0)) for span in block_spans]
    fonts = {str(span.get("font", "")) for span in block_spans}
    y = float(block["bbox"][1])
    # Esmeralda banner titles are 30pt; Cinzel banner/section titles are 18pt.
    return y < 90 and (max(sizes) >= 18 or (max(sizes) >= 28 and any("Esmeralda" in font for font in fonts)))


def is_column_pair(block: dict[str, Any], blocks: list[dict[str, Any]]) -> bool:
    x, y = float(block["bbox"][0]), float(block["bbox"][1])
    if not (x <= 115 or x >= 400):
        return False
    for other in blocks:
        if other is block or not other.get("lines"):
            continue
        spans_other = spans(other)
        if not spans_other:
            continue
        if not looks_like_major_title(other):
            continue
        ox, oy = float(other["bbox"][0]), float(other["bbox"][1])
        if abs(oy - y) <= 5 and abs(ox - x) > 200:
            return True
    return False


def rule_frame_for(block: dict[str, Any], dom: dict[str, Any]) -> dict[str, Any] | None:
    bbox = [float(value) for value in block.get("bbox", [])]
    if len(bbox) != 4:
        return None
    bx1, by1, bx2, by2 = bbox
    candidates = []
    for rule in title_rule_images(dom):
        rx1, ry1, rx2, ry2 = rule
        if rx1 < bx2 + 35 and bx1 < rx2 + 35 and ry1 <= by2 + 24 and ry2 >= by1 - 24:
            overlap = max(0.0, min(bx2, rx2) - max(bx1, rx1))
            center_distance = abs(((ry1 + ry2) / 2) - ((by1 + by2) / 2))
            candidates.append((overlap, center_distance, rx2 - rx1, rule))
    if not candidates:
        return None
    # A centered title can have both a short decorative crop and the actual
    # page-wide strip in the extracted images (notably the Counter panel).
    centered = (bx1 + bx2) / 2
    if centered > 250 and centered < 570:
        broad = [row for row in candidates if row[2] >= 500]
        if broad:
            candidates = broad
    _, _, rule_width, rule = max(candidates, key=lambda row: (row[0], -row[1], row[2]))
    rx1 = rule[0]
    if rule_width >= 500:
        return {"x": rx1, "width": FULL_W, "textAlign": "left"}
    return {"x": rx1, "width": rule_width, "textAlign": "left"}


def proposed_frame(block: dict[str, Any], blocks: list[dict[str, Any]], dom: dict[str, Any], page: int) -> tuple[dict[str, Any], str] | None:
    if has_raster_duplicate(block):
        return None
    # suspectedGhost is a source-extraction hint, not a blanket exclusion:
    # several real column headings carry it.  Only reject it when the same
    # title is duplicated at nearly the same location.
    if block.get("suspectedGhost"):
        title = text_of(block).lower()
        x, y = float(block["bbox"][0]), float(block["bbox"][1])
        for other in blocks:
            if other is block:
                continue
            if text_of(other).lower() == title:
                ox, oy = float(other["bbox"][0]), float(other["bbox"][1])
                if abs(ox - x) < 20 and abs(oy - y) < 8:
                    return None
    vector_rule = VECTOR_RULE_FRAMES.get((page, str(block.get("id"))))
    if vector_rule:
        return vector_rule, "vector-rule-heading"
    # A title printed inside a preserved encounter/card/map image must remain
    # governed by the image overlay.  The independent page title still passes.
    if looks_like_major_title(block):
        rule_frame = rule_frame_for(block, dom)
        if is_column_pair(block, blocks):
            x = float(block["bbox"][0])
            if rule_frame and rule_frame["width"] < 500:
                return rule_frame, "paired-column-title"
            if x <= 115:
                return ({"x": LEFT_X, "width": COLUMN_W, "textAlign": "left"}, "paired-column-title")
            return ({"x": RIGHT_X, "width": COLUMN_W, "textAlign": "left"}, "paired-column-title")
        if rule_frame:
            return rule_frame, "page-title"
        return ({"x": LEFT_X, "width": FULL_W, "textAlign": "left"}, "page-title")
    if looks_like_small_heading(block, page) or looks_like_large_column_heading(block):
        x = float(block["bbox"][0])
        if x <= 115:
            return ({"x": LEFT_X, "width": COLUMN_W, "textAlign": "left"}, "column-heading")
        return ({"x": RIGHT_X, "width": COLUMN_W, "textAlign": "left"}, "column-heading")
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rewrite-existing", action="store_true")
    args = parser.parse_args()
    rows: list[dict[str, Any]] = []
    for dom_path in sorted(PAGE_ROOT.glob("page_*/page_*_dom.json")):
        page = int(dom_path.parent.name.split("_")[1])
        dom = json.loads(dom_path.read_text(encoding="utf-8"))
        blocks = list(dom.get("blocks", []))
        sidecar_path = dom_path.parent / "layout_frames.json"
        sidecar = json.loads(sidecar_path.read_text(encoding="utf-8")) if sidecar_path.exists() else {}
        images = finite_images(dom)
        changed = False
        for block in blocks:
            block_id = str(block.get("id"))
            proposal = proposed_frame(block, blocks, dom, page)
            if not proposal:
                continue
            frame, kind = proposal
            if block_id in sidecar and not (args.apply and args.rewrite_existing and kind in {"page-title", "paired-column-title"}):
                continue
            if kind == "column-heading" and intersects_raster_title(block, images):
                continue
            sidecar[block_id] = frame
            changed = True
            rows.append({"page": page, "blockId": block_id, "kind": kind, "text": text_of(block), **frame})
        if changed and args.apply:
            sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"apply": args.apply, "added": len(rows), "pages": sorted({row["page"] for row in rows})}, indent=2))
    for row in rows:
        print(f"{row['page']:>3} {row['blockId']:<14} {row['kind']:<20} x={row['x']:.1f} w={row['width']:.1f} {row['text'][:90]}")


if __name__ == "__main__":
    main()
