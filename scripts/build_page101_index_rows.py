"""Build editable p.101 index rows and clean leader patches; dry run by default."""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
FOLDER = ROOT / "apps/web/public/pages/page_101"
DOM_PATH = FOLDER / "page_101_dom.json"
ROWS_PATH = FOLDER / "contents_rows.json"
BACKGROUND_PATH = FOLDER / "background.webp"
REF_RE = re.compile(r"^\d+(?:\s*[-,;]\s*\d+)*$")


def rgb_crop_without_leader(background: Image.Image, bbox: list[float], sx: float, sy: float,
                             leader: dict | None) -> Image.Image:
    left = round(bbox[0] * sx)
    top = round(bbox[1] * sy)
    right = round(bbox[2] * sx)
    bottom = round(bbox[3] * sy)
    crop = background.crop((left, top, right, bottom)).convert("RGB")
    if not leader:
        return crop

    # The source leaders are 0.4 pt vector strokes baked into the page background.
    # Rebuild the narrow stripe from its adjacent paper pixels before drawing the
    # responsive leader in the Viewer.
    x0 = max(left, round(leader["x0"] * sx)) - left
    x1 = min(right, round(leader["x1"] * sx)) - left
    y = round(leader["y"] * sy) - top
    if x1 <= x0 or y < 2 or y + 2 >= crop.height:
        return crop
    pixels = crop.load()
    for py in range(max(0, y - 1), min(crop.height, y + 2)):
        amount = (py - (y - 2)) / 4
        for px in range(x0, x1):
            above = pixels[px, y - 2]
            below = pixels[px, y + 2]
            pixels[px, py] = tuple(round(a * (1 - amount) + b * amount) for a, b in zip(above, below))
    return crop


def raw_chars_for_line(raw_lines: list[dict], y_center: float, x0: float, x1: float) -> list[dict]:
    chars = []
    for line in raw_lines:
        line_box = line["bbox"]
        if abs((line_box[1] + line_box[3]) / 2 - y_center) > 0.35:
            continue
        for span in line["spans"]:
            for char in span["chars"]:
                if char["c"].isspace():
                    continue
                box = char["bbox"]
                if box[0] >= x0 - 0.75 and box[2] <= x1 + 0.75:
                    chars.append(char)
    return chars


def page_raw_lines(page: fitz.Page) -> list[dict]:
    return [line for block in page.get_text("rawdict")["blocks"] if block.get("type") == 0
            for line in block.get("lines", [])]


def text_of_line(line: dict) -> str:
    return re.sub(r"\s+", " ", "".join(span.get("text", "") for span in line.get("spans", [])).strip()).strip()


def drawing_leaders(page: fitz.Page) -> list[dict]:
    result = []
    for drawing in page.get_drawings():
        width = float(drawing.get("width") or 0)
        for item in drawing.get("items", []):
            if item[0] != "l":
                continue
            p0, p1 = item[1], item[2]
            if abs(p0.y - p1.y) > 0.02 or p1.x - p0.x < 30:
                continue
            result.append({"x0": float(p0.x), "x1": float(p1.x), "y": float(p0.y), "widthPt": width})
    return result


def build(apply: bool, verify: bool = False) -> dict:
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    source_pdf = fitz.open(PDF)
    page = source_pdf[100]
    raw_lines = page_raw_lines(page)
    leaders = drawing_leaders(page)
    background = Image.open(BACKGROUND_PATH).convert("RGB")
    sx = background.width / page.rect.width
    sy = background.height / page.rect.height

    rows = []
    masks = []
    failures = []
    for block_index, block in enumerate(dom["blocks"][:3]):
        grouped: dict[float, list[dict]] = defaultdict(list)
        for line in block.get("lines", []):
            y = round((line["bbox"][1] + line["bbox"][3]) / 2, 1)
            text = text_of_line(line)
            if text:
                grouped[y].append(line)

        row_in_block = 0
        for y_center, lines in sorted(grouped.items()):
            labels = [line for line in lines if not REF_RE.fullmatch(text_of_line(line))]
            refs = [line for line in lines if REF_RE.fullmatch(text_of_line(line))]
            if not labels or not refs:
                continue
            label_line = labels[0]
            number_line = refs[-1]
            label_text = text_of_line(label_line)
            number_text = text_of_line(number_line)
            label_box = label_line["bbox"]
            number_box = number_line["bbox"]
            label_chars = raw_chars_for_line(raw_lines, y_center, label_box[0], label_box[2])
            ref_chars = raw_chars_for_line(raw_lines, y_center, number_box[0], number_box[2])
            if not label_chars or not ref_chars:
                failures.append(f"p.101 block {block_index} y={y_center}: source glyph metrics missing")
                continue
            label_x0 = min(char["bbox"][0] for char in label_chars)
            label_x1 = max(char["bbox"][2] for char in label_chars)
            ref_x0 = min(char["bbox"][0] for char in ref_chars)
            ref_x1 = max(char["bbox"][2] for char in ref_chars)
            center = (label_box[1] + label_box[3]) / 2
            matches = sorted(leaders, key=lambda line: abs(line["y"] - center) + abs(line["x1"] - ref_x0))
            leader = matches[0] if matches and abs(matches[0]["y"] - center) <= 5 and abs(matches[0]["x1"] - ref_x0) <= 1.25 else None
            if not leader:
                failures.append(f"p.101 block {block_index} y={y_center}: matching solid leader missing")
                continue

            ordinal = len(rows)
            top = label_box[1] - 0.2
            bottom = label_box[3] + 0.2
            left = max(0, label_x0 - 0.4)
            right = max(left + 1, ref_x0 - 0.2)
            mask_bbox = [left, top, right, bottom]
            mask_name = f"contents-paper-index-{ordinal:03d}.png"
            block_id = block["id"]
            stem = f"page_101_unit_p101-index-{ordinal:03d}"
            row = {
                "id": f"index-{ordinal:03d}",
                "blockId": block_id,
                "blockIndex": block_index,
                "lineId": label_line["id"],
                "keyStem": stem,
                "legacyCombinedKeyStems": [],
                "overlaySource": True,
                "labelBBox": [label_x0, label_box[1], label_x1, label_box[3]],
                "numberLineId": number_line["id"],
                "numberBBox": [ref_x0, number_box[1], ref_x1, number_box[3]],
                "targetPage": int(re.search(r"\d+", number_text).group()),
                "leader": {
                    "bbox": [leader["x0"], leader["y"] - leader["widthPt"] / 2,
                             leader["x1"], leader["y"] + leader["widthPt"] / 2],
                    "style": "solid",
                    "periodPt": 0,
                    "widthPt": leader["widthPt"],
                    "yPt": leader["y"],
                },
                "mask": {
                    "url": f"/pages/page_101/{mask_name}",
                    "bbox": mask_bbox,
                },
                "sourceText": label_text,
                "sourceReference": number_text,
            }
            rows.append(row)
            masks.append((row, mask_name, leader))
            row_in_block += 1

    if failures:
        raise RuntimeError("\n".join(failures))
    if len(rows) < 180:
        raise RuntimeError(f"Expected the index entries across three columns; found only {len(rows)}.")
    payload = {"schemaVersion": 1, "overlaySource": True, "rows": rows}
    generated_masks = {}
    for row, mask_name, leader in masks:
        patch = rgb_crop_without_leader(background, row["mask"]["bbox"], sx, sy, leader)
        generated_masks[FOLDER / mask_name] = patch

    if apply or verify:
        for destination, patch in generated_masks.items():
            if apply:
                patch.save(destination)
            else:
                with Image.open(destination) as saved:
                    if saved.size != patch.size or ImageChops.difference(saved.convert("RGB"), patch).getbbox() is not None:
                        raise AssertionError(f"Mask differs from source background: {destination}")
        if apply:
            ROWS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        else:
            saved = json.loads(ROWS_PATH.read_text(encoding="utf-8"))
            if saved != payload:
                raise AssertionError("contents_rows.json differs from regenerated source rows")

    result = {
        "rows": len(rows),
        "solidLeadersMatched": len(masks),
        "uniqueKeys": len({row["keyStem"] for row in rows}),
        "masks": len(generated_masks),
        "mode": "verify" if verify else "apply" if apply else "dry-run",
    }
    print(json.dumps(result, ensure_ascii=False))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    build(args.apply, args.verify)
