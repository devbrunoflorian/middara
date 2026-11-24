"""Preview or clean source composite symbols left in page background rasters.

The configured capsules already have semantic compound elements, so the
Viewer redraws them inline. The source vector can still be baked into the
page's background raster at its old anchor. Preview is the default; `--apply`
replaces only measured crops with the underlay from a textless source render.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    37: [
        (109, (243.9921112060547, 136.19219970703125, 288.6430969238281, 145.377197265625)),
    ],
    58: [
        (107, (597.9517822265625, 662.9556884765625, 654.2647705078125, 674.5386962890625)),
    ],
    90: [
        (97, (460.9351806640625, 652.99951171875, 520.1571655273438, 669.0625)),
        (105, (465.4671936035156, 743.99951171875, 520.1572265625, 760.0625)),
        (106, (106.18890380859375, 720.99951171875, 168.65890502929688, 737.0625)),
        (109, (109.43669891357422, 687.99951171875, 168.65869140625, 704.0625)),
    ],
    95: [
        (154, (155.08689880371094, 85.02532958984375, 193.44088745117188, 94.2103271484375)),
        (164, (155.08689880371094, 147.77532958984375, 197.77789306640625, 156.9603271484375)),
        (169, (155.08689880371094, 285.743896484375, 193.44088745117188, 294.92889404296875)),
        (183, (155.08689880371094, 427.54241943359375, 197.77789306640625, 436.7274169921875)),
        (194, (155.08689880371094, 475.2506103515625, 193.44088745117188, 484.43560791015625)),
        (280, (519.9059448242188, 76.23919677734375, 558.2599487304688, 85.4241943359375)),
        (282, (519.9059448242188, 161.7142333984375, 558.2599487304688, 170.89923095703125)),
        (284, (519.9059448242188, 229.05029296875, 558.2599487304688, 238.23529052734375)),
    ],
    100: [
        (218, (583.6747436523438, 127.44598388671875, 628.3257446289062, 136.6309814453125)),
    ],
}
COMPOSITE_GROUPS = {
    52: [
        ([111, 112], [
            (264.3368225097656, 175.5431365966797, 272.6728210449219, 184.59213256835938),
            (265.9496765136719, 183.35569763183594, 271.2176818847656, 187.09669494628906),
        ]),
    ],
}
BACKGROUND_DIR = ROOT / "apps/web/public/pages"
PREVIEW = ROOT / "tmp/compound-tag-background-preview.png"


def build_page_plan(document: fitz.Document, page_number: int) -> dict:
    page = document[page_number - 1]
    drawings = page.get_drawings()
    targets = []
    for drawing_index, expected_rect in PAGES.get(page_number, []):
        if len(drawings) <= drawing_index:
            raise ValueError(f"PDF page {page_number} has no drawing {drawing_index}")
        drawing = drawings[drawing_index]
        rect = fitz.Rect(drawing["rect"])
        if drawing["type"] != "f" or max(
            abs(a - b) for a, b in zip(rect, expected_rect)
        ) > 0.002:
            raise ValueError(
                f"Refusing unexpected page-{page_number} drawing {drawing_index}: {rect}"
            )
        targets.append({"drawingIndexes": [drawing_index], "sourceRects": [rect], "rect": rect})

    for drawing_indexes, expected_rects in COMPOSITE_GROUPS.get(page_number, []):
        if len(drawing_indexes) != len(expected_rects):
            raise ValueError(f"Page {page_number}: composite source map is incomplete")
        source_rects = []
        for drawing_index, expected_rect in zip(drawing_indexes, expected_rects):
            if len(drawings) <= drawing_index:
                raise ValueError(f"PDF page {page_number} has no drawing {drawing_index}")
            drawing = drawings[drawing_index]
            rect = fitz.Rect(drawing["rect"])
            if drawing["type"] != "f" or max(
                abs(a - b) for a, b in zip(rect, expected_rect)
            ) > 0.002:
                raise ValueError(
                    f"Refusing unexpected page-{page_number} drawing {drawing_index}: {rect}"
                )
            source_rects.append(rect)
        union_rect = fitz.Rect(source_rects[0])
        for rect in source_rects[1:]:
            union_rect |= rect
        targets.append({"drawingIndexes": drawing_indexes, "sourceRects": source_rects, "rect": union_rect})

    # Redact source text only in the in-memory PDF copy. Its raster is used as
    # a local texture donor, never as a replacement for the product page.
    for block in page.get_text("blocks"):
        if len(block) >= 5 and block[4].strip():
            page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
    page.apply_redactions(images=0, graphics=0, text=0)
    for target in targets:
        rect = target["rect"]
        page.add_redact_annot(rect + (-0.02, -0.02, 0.02, 0.02), fill=None)
    page.apply_redactions(images=0, graphics=1, text=0)

    remaining_rects = [fitz.Rect(item["rect"]) for item in page.get_drawings()]
    for target in targets:
        for drawing_index, source_rect in zip(target["drawingIndexes"], target["sourceRects"]):
            if any(max(abs(a - b) for a, b in zip(item, source_rect)) < 0.002 for item in remaining_rects):
                raise ValueError(f"Page {page_number} drawing {drawing_index} remains after local removal")

    background_path = BACKGROUND_DIR / f"page_{page_number:03d}" / "background.webp"
    with Image.open(background_path) as image:
        old = image.convert("RGB")
    sx, sy = old.width / page.rect.width, old.height / page.rect.height
    pix = page.get_pixmap(matrix=fitz.Matrix(sx, sy), alpha=False)
    source_clean = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    if source_clean.size != old.size:
        raise ValueError(
            f"Unexpected p.{page_number} background dimensions: {old.size} vs {source_clean.size}"
        )

    clean = old.copy()
    boxes = []
    for target in targets:
        rect = target["rect"]
        pad = 0.5
        box = (
            max(0, round((rect.x0 - pad) * sx)),
            max(0, round((rect.y0 - pad) * sy)),
            min(old.width, round((rect.x1 + pad) * sx)),
            min(old.height, round((rect.y1 + pad) * sy)),
        )
        clean.paste(source_clean.crop(box), box[:2])
        boxes.append(box)

    mask = Image.new("L", old.size, 255)
    draw = ImageDraw.Draw(mask)
    for box in boxes:
        draw.rectangle(box, fill=0)
    diff = np.abs(np.asarray(old, dtype=np.int16) - np.asarray(clean, dtype=np.int16))
    outside = np.asarray(mask) > 0
    outside_mae = float(diff[outside].mean())
    inside_mae = float(diff[~outside].mean())
    if outside_mae != 0:
        raise ValueError(
            f"Page {page_number}: changed pixels outside capsule crops ({outside_mae})"
        )

    crops = []
    for index, box in enumerate(boxes, start=1):
        before = old.crop(box)
        after = clean.crop(box)
        scale = 3
        before = before.resize((before.width * scale, before.height * scale))
        after = after.resize((after.width * scale, after.height * scale))
        crops.append((page_number, index, before, after))

    return {
        "page": page_number,
        "drawingIndexes": [index for target in targets for index in target["drawingIndexes"]],
        "drawingBboxesPt": [list(rect) for target in targets for rect in target["sourceRects"]],
        "patchBboxesPt": [list(target["rect"]) for target in targets],
        "patchPixelBoxes": boxes,
        "outsideCropMeanAbsoluteChannelChange": round(outside_mae, 6),
        "capsuleCropsMeanAbsoluteChannelChange": round(inside_mae, 6),
        "alreadyClean": inside_mae == 0,
        "backgroundPath": background_path,
        "old": old,
        "clean": clean,
        "crops": crops,
    }


def write_preview(crops: list[tuple[int, int, Image.Image, Image.Image]]) -> None:
    label_width = 120
    panel_width = max(max(before.width, after.width) for _, _, before, after in crops)
    row_height = max(before.height + after.height for _, _, before, after in crops) + 36
    sheet = Image.new("RGB", (label_width + panel_width, row_height * len(crops)), "white")
    draw = ImageDraw.Draw(sheet)
    y = 0
    for page_number, index, before, after in crops:
        draw.text((4, y + 5), f"p.{page_number} tag {index}\nantes / depois", fill="black")
        sheet.paste(before, (label_width, y))
        sheet.paste(after, (label_width, y + before.height))
        y += row_height
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    sheet.crop((0, 0, sheet.width, y)).save(PREVIEW)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-pdf", required=True, type=Path)
    parser.add_argument("--pages", type=int, nargs="+", choices=sorted(set(PAGES) | set(COMPOSITE_GROUPS)), default=[90, 95])
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    plans = []
    with fitz.open(args.source_pdf) as document:
        for page_number in args.pages:
            plans.append(build_page_plan(document, page_number))

    if args.apply:
        for plan in plans:
            if not plan["alreadyClean"]:
                plan["clean"].save(plan["backgroundPath"], "WEBP", lossless=True, method=4)
    else:
        write_preview([crop for plan in plans for crop in plan["crops"]])

    output = []
    for plan in plans:
        item = {key: value for key, value in plan.items() if key not in {"old", "clean", "crops"}}
        item["backgroundPath"] = str(item["backgroundPath"])
        output.append(item)
    if not args.apply:
        for item in output:
            item["output"] = str(PREVIEW)
    print(json.dumps({"applied": args.apply, "pages": output}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
