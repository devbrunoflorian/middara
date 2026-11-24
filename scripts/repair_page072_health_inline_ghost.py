"""Replace the stale p.72 health icon in the language-neutral background.

The source PDF combines the target paths with large grouped vector drawings,
so deleting the glyph via PDF graphics redaction would damage unrelated art.
Instead, copy a clean underlay from the same parchment panel and feather only
the patch edge. Preview is the default; no pixels outside the measured crop may
change.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PAGE_NUMBER = 72
PAGE_DIR = ROOT / "apps/web/public/pages/page_072"
BACKGROUND = PAGE_DIR / "background.webp"
PREVIEW = ROOT / "tmp/p072-health-inline-ghost-preview.png"
DRAWING_INDICES = [363, 364, 365, 366]
SOURCE_BBOX = (295.2658996582031, 546.826904296875,
               307.8938903808594, 559.4279174804688)
PATCH_PAD_PT = 4.0
DONOR_SHIFT_PT = 34.0
FEATHER_PX = 6


def build_plan(source_pdf: Path) -> dict:
    with fitz.open(source_pdf) as document:
        page = document[PAGE_NUMBER - 1]
        drawings = page.get_drawings()
        if len(drawings) <= max(DRAWING_INDICES):
            raise ValueError("The page 72 drawing sequence has changed")

        targets = [drawings[index] for index in DRAWING_INDICES]
        union = fitz.Rect(targets[0]["rect"])
        for drawing in targets[1:]:
            union |= fitz.Rect(drawing["rect"])
        if max(abs(a - b) for a, b in zip(union, SOURCE_BBOX)) > 0.01:
            raise ValueError(f"Unexpected p.72 health-icon bbox: {tuple(union)}")
        with Image.open(BACKGROUND) as background_file:
            original = background_file.convert("RGB")
        sx, sy = original.width / page.rect.width, original.height / page.rect.height

        crop_pt = union + (-PATCH_PAD_PT, -PATCH_PAD_PT, PATCH_PAD_PT, PATCH_PAD_PT)
        box = (max(0, round(crop_pt.x0 * sx)), max(0, round(crop_pt.y0 * sy)),
               min(original.width, round(crop_pt.x1 * sx)), min(original.height, round(crop_pt.y1 * sy)))
        shift_x = round(DONOR_SHIFT_PT * sx)
        donor_box = (box[0] + shift_x, box[1], box[2] + shift_x, box[3])
        if donor_box[2] > original.width or donor_box[3] > original.height:
            raise ValueError(f"Donor underlay is outside the p.72 page: {donor_box}")

        donor = original.crop(donor_box)
        alpha = Image.new("L", donor.size, 0)
        alpha_pixels = np.asarray(alpha, dtype=np.uint8).copy()
        for y in range(donor.height):
            for x in range(donor.width):
                edge_distance = min(x + 1, y + 1, donor.width - x, donor.height - y)
                alpha_pixels[y, x] = min(255, round(255 * edge_distance / FEATHER_PX))
        alpha = Image.fromarray(alpha_pixels, mode="L")
        repaired = original.copy()
        repaired.paste(donor, box[:2], alpha)

        mask = Image.new("L", original.size, 255)
        ImageDraw.Draw(mask).rectangle(box, fill=0)
        delta = np.abs(np.asarray(original, dtype=np.int16) - np.asarray(repaired, dtype=np.int16))
        outside = np.asarray(mask) > 0
        outside_mae = float(delta[outside].mean())
        crop_mae = float(delta[~outside].mean())
        if outside_mae != 0:
            raise ValueError(f"Refusing patch: outside-crop pixel change is {outside_mae}")
        return {"original": original, "repaired": repaired, "box": box,
                "donorPixelBox": donor_box, "bboxPt": list(union),
                "outsideMae": outside_mae, "cropMae": crop_mae}


def write_preview(plan: dict) -> None:
    box = plan["box"]
    before = plan["original"].crop(box).resize(((box[2] - box[0]) * 8, (box[3] - box[1]) * 8), Image.Resampling.NEAREST)
    after = plan["repaired"].crop(box).resize(before.size, Image.Resampling.NEAREST)
    sheet = Image.new("RGB", (max(before.width, after.width), before.height + after.height + 30), "white")
    ImageDraw.Draw(sheet).text((4, 2), "background before / repaired underlay", fill="black")
    sheet.paste(before, (0, 15))
    sheet.paste(after, (0, 15 + before.height))
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(PREVIEW)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-pdf", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    plan = build_plan(args.source_pdf)
    if args.apply:
        plan["repaired"].save(BACKGROUND, "WEBP", lossless=True, method=4)
        output = str(BACKGROUND)
    else:
        write_preview(plan)
        output = str(PREVIEW)
    print(json.dumps({"page": PAGE_NUMBER, "verifiedSourceDrawings": DRAWING_INDICES,
                      "sourceBboxPt": plan["bboxPt"], "patchPixelBox": plan["box"],
                      "donorPixelBox": plan["donorPixelBox"],
                      "outsideCropMeanAbsoluteChannelChange": plan["outsideMae"],
                      "targetCropMeanAbsoluteChannelChange": plan["cropMae"],
                      "applied": args.apply, "output": output}, indent=2))


if __name__ == "__main__":
    main()
