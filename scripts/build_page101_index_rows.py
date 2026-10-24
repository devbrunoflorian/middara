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
INLINE_LABELS = {
    ("block_9", "line_9_278"): ("Double-Tag Items", "27,92"),
    ("block_9", "line_9_335"): ("Ending all Actions and Abilities", "48,60"),
    ("block_10", "line_10_214"): ("Materials", "93,57"),
}
UNNUMBERED_LABELS = {
    ("block_9", "line_9_214"): "Values",
    ("block_10", "line_10_51"): "Gaining",
    ("block_10", "line_10_276"): "Phases",
    ("block_10", "line_10_329"): "Removing",
    ("block_11", "line_11_190"): "Upgrades",
}


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


def line_visible_chars(raw_lines: list[dict], line: dict) -> list[dict]:
    box = line["bbox"]
    chars = raw_chars_for_line(raw_lines, (box[1] + box[3]) / 2, box[0] - 1, box[2] + 1)
    return sorted(chars, key=lambda char: (char["bbox"][0], char["bbox"][1]))


def find_row_leader(leaders: list[dict], center: float, ref_x: float | None = None,
                    after_x: float | None = None) -> dict | None:
    candidates = leaders
    if after_x is not None:
        candidates = [leader for leader in candidates if leader["x0"] >= after_x - 2 and leader["x1"] - leader["x0"] >= 30]
    matches = sorted(candidates, key=lambda leader: abs(leader["y"] - center)
                     + (abs(leader["x1"] - ref_x) if ref_x is not None else 0))
    if not matches or abs(matches[0]["y"] - center) > 5:
        return None
    if ref_x is not None and abs(matches[0]["x1"] - ref_x) > 1.25:
        return None
    return matches[0]


def leader_record(leader: dict) -> dict:
    return {
        "bbox": [leader["x0"], leader["y"] - leader["widthPt"] / 2,
                 leader["x1"], leader["y"] + leader["widthPt"] / 2],
        "style": "solid",
        "periodPt": 0,
        "widthPt": leader["widthPt"],
        "yPt": leader["y"],
    }


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
            leader = find_row_leader(leaders, center, ref_x=ref_x0)
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
                "leader": leader_record(leader),
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

    # Some entries are printed on one source line instead of a label line plus
    # a page-number line. Append them after the original 189 IDs so none of the
    # stable row keys above move when this extraction rule is improved.
    blocks_by_id = {block["id"]: (index, block) for index, block in enumerate(dom["blocks"][:3])}
    lines_by_key = {
        (block["id"], line["id"]): line
        for block in dom["blocks"][:3] for line in block.get("lines", [])
    }
    for (block_id, line_id), (expected_label, expected_reference) in INLINE_LABELS.items():
        line = lines_by_key.get((block_id, line_id))
        block_index, block = blocks_by_id[block_id]
        if line is None:
            failures.append(f"p.101 inline index row missing {block_id}/{line_id}")
            continue
        text = text_of_line(line)
        match = re.fullmatch(r"(.+?)\s+(\d+(?:\s*[-,;]\s*\d+)*)", text)
        if not match or (match.group(1), re.sub(r"\s+", "", match.group(2))) != (
            expected_label, re.sub(r"\s+", "", expected_reference)
        ):
            failures.append(f"p.101 inline index source changed at {line_id}: {text!r}")
            continue
        label_text, reference_text = match.group(1), match.group(2)
        visible_chars = line_visible_chars(raw_lines, line)
        ref_chars = visible_chars[-len(re.sub(r"\s+", "", reference_text)):]
        label_chars = visible_chars[:-len(ref_chars)]
        if ("".join(char["c"] for char in label_chars) != re.sub(r"\s+", "", label_text)
                or "".join(char["c"] for char in ref_chars) != re.sub(r"\s+", "", reference_text)):
            failures.append(f"p.101 inline label/reference glyph split failed at {line_id}")
            continue
        label_box = line["bbox"]
        label_x0 = min(char["bbox"][0] for char in label_chars)
        label_x1 = max(char["bbox"][2] for char in label_chars)
        ref_x0 = min(char["bbox"][0] for char in ref_chars)
        ref_x1 = max(char["bbox"][2] for char in ref_chars)
        center = (label_box[1] + label_box[3]) / 2
        leader = find_row_leader(leaders, center, ref_x=ref_x0)
        if not leader:
            failures.append(f"p.101 inline index leader missing at {line_id}")
            continue

        ordinal = len(rows)
        mask_bbox = [max(0, label_x0 - 0.4), label_box[1] - 0.2, max(label_x0 + 1, ref_x0 - 0.2), label_box[3] + 0.2]
        mask_name = f"contents-paper-index-{ordinal:03d}.png"
        row = {
            "id": f"index-{ordinal:03d}", "blockId": block_id, "blockIndex": block_index,
            "lineId": line_id, "keyStem": f"page_101_unit_p101-index-{ordinal:03d}",
            "legacyCombinedKeyStems": [], "overlaySource": True,
            "labelBBox": [label_x0, label_box[1], label_x1, label_box[3]],
            "numberLineId": line_id,
            "numberBBox": [ref_x0, label_box[1], ref_x1, label_box[3]],
            "labelWidthPt": max(0, ref_x0 - label_x0 - 3),
            "targetPage": int(re.match(r"\d+", reference_text).group()),
            "leader": leader_record(leader),
            "mask": {"url": f"/pages/page_101/{mask_name}", "bbox": mask_bbox},
            "sourceText": label_text, "sourceReference": reference_text,
        }
        rows.append(row)
        masks.append((row, mask_name, leader))

    # These index headings have no numeric reference. Preserve their source
    # line baselines and give translation text the remaining column corridor.
    for (block_id, line_id), expected_text in UNNUMBERED_LABELS.items():
        line = lines_by_key.get((block_id, line_id))
        block_index, block = blocks_by_id[block_id]
        if line is None or text_of_line(line).strip() != expected_text:
            failures.append(f"p.101 unnumbered index heading changed or missing: {block_id}/{line_id}")
            continue
        visible_chars = line_visible_chars(raw_lines, line)
        if "".join(char["c"] for char in visible_chars) != expected_text.replace(" ", ""):
            failures.append(f"p.101 unnumbered index glyph metrics missing at {line_id}")
            continue
        label_box = line["bbox"]
        label_x0 = min(char["bbox"][0] for char in visible_chars)
        label_x1 = max(char["bbox"][2] for char in visible_chars)
        center = (label_box[1] + label_box[3]) / 2
        # “Values” has a source leader leading to a nonnumeric outlined “Back”
        # artifact. Rebuild only the line and retain “Back” as source evidence.
        leader = find_row_leader(leaders, center, after_x=label_x1) if line_id == "line_9_214" else None
        if line_id == "line_9_214" and not leader:
            failures.append("p.101 Values source leader missing before the nonnumeric Back artifact")
            continue
        reference_line = lines_by_key.get((block_id, "line_9_217")) if line_id == "line_9_214" else None
        reference_chars = line_visible_chars(raw_lines, reference_line) if reference_line else []
        if line_id == "line_9_214" and (not reference_line or text_of_line(reference_line).strip() != "Back" or not reference_chars):
            failures.append("p.101 Values nonnumeric source reference 'Back' changed or is missing")
            continue
        column_right = max(candidate["bbox"][2] for candidate in block.get("lines", []) if candidate.get("bbox"))
        corridor_right = leader["x1"] if leader else column_right
        ordinal = len(rows)
        mask_bbox = [max(0, label_x0 - 0.4), label_box[1] - 0.2,
                     max(label_x0 + 1, corridor_right - 0.2 if leader else label_x1 + 0.4), label_box[3] + 0.2]
        mask_name = f"contents-paper-index-{ordinal:03d}.png"
        row = {
            "id": f"index-{ordinal:03d}", "blockId": block_id, "blockIndex": block_index,
            "lineId": line_id, "keyStem": f"page_101_unit_p101-index-{ordinal:03d}",
            "legacyCombinedKeyStems": [], "overlaySource": True,
            "labelBBox": [label_x0, label_box[1], label_x1, label_box[3]],
            "labelWidthPt": max(0, corridor_right - label_x0 - 3),
            "leader": leader_record(leader) if leader else {
                "bbox": [label_x1, label_box[1], label_x1, label_box[3]],
                "style": "none", "periodPt": 0, "widthPt": 0, "yPt": center,
            },
            "mask": {"url": f"/pages/page_101/{mask_name}", "bbox": mask_bbox},
            "sourceText": expected_text,
        }
        if line_id == "line_9_214":
            row["numberLineId"] = reference_line["id"]
            row["numberBBox"] = [min(char["bbox"][0] for char in reference_chars),
                                 reference_line["bbox"][1],
                                 max(char["bbox"][2] for char in reference_chars),
                                 reference_line["bbox"][3]]
            row["sourceReference"] = "Back"
        rows.append(row)
        masks.append((row, mask_name, leader))

    if failures:
        raise RuntimeError("\n".join(failures))
    if len(rows) != 197:
        raise RuntimeError(f"Expected 189 existing plus eight newly identified index rows; found {len(rows)}.")
    payload = {"schemaVersion": 1, "overlaySource": True, "rows": rows}
    generated_masks = {}
    for row, mask_name, leader in masks:
        patch = rgb_crop_without_leader(background, row["mask"]["bbox"], sx, sy, leader)
        generated_masks[FOLDER / mask_name] = patch

    if apply or verify:
        for destination, patch in generated_masks.items():
            if destination.exists():
                with Image.open(destination) as saved:
                    if saved.size != patch.size or ImageChops.difference(saved.convert("RGB"), patch).getbbox() is not None:
                        raise AssertionError(f"Existing mask differs from regenerated source background; refusing overwrite: {destination}")
            elif apply:
                patch.save(destination)
            else:
                raise AssertionError(f"Missing source-derived mask: {destination}")
        if apply:
            if ROWS_PATH.exists():
                saved = json.loads(ROWS_PATH.read_text(encoding="utf-8"))
                old_rows = saved.get("rows", [])
                if old_rows[:189] != rows[:189]:
                    mismatch = next((index for index, (old, new) in enumerate(zip(old_rows[:189], rows[:189])) if old != new), None)
                    raise AssertionError(f"An original stable row changed at row {mismatch}; refusing to rewrite it.")
                for index, (old, new) in enumerate(zip(old_rows[189:], rows[189:]), start=189):
                    if old == new:
                        continue
                    # Repair only the Values row produced by this run's first
                    # extraction pass, before its separate “Back” line was mapped.
                    if (index == 192 and old.get("id") == "index-192" and old.get("lineId") == "line_9_214"
                            and old.get("sourceReference") == "Back" and "numberLineId" not in old):
                        continue
                    raise AssertionError(f"Generated appended row {index} differs; refusing to overwrite it.")
            ROWS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        else:
            saved = json.loads(ROWS_PATH.read_text(encoding="utf-8"))
            if saved != payload:
                raise AssertionError("contents_rows.json differs from regenerated source rows")

    result = {
        "rows": len(rows),
        "solidLeadersMatched": len(masks),
        "newRows": len(INLINE_LABELS) + len(UNNUMBERED_LABELS),
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
