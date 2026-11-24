"""Remove only the source-position STATUS capsule from page 100 artwork.

Preview is the default. `--apply` updates the page background only after the
PDF drawing identity is verified and decoded pixels outside the measured crop
remain unchanged. The semantic STATUS capsule is rendered by the page data.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages/page_100"
BACKGROUND = PAGE_DIR / "background.webp"
PREVIEW = ROOT / "tmp/page100-status-background-preview.png"
DRAWING_ID = 218
EXPECTED_RECT = (
    583.6747436523,
    127.4459838867,
    628.3257446289,
    136.6309814453,
)


def repair(source_pdf: Path, *, apply: bool) -> dict:
    with fitz.open(source_pdf) as document:
        page = document[99]
        drawings = page.get_drawings()
        if len(drawings) <= DRAWING_ID:
            raise ValueError(f"PDF has no page-100 drawing {DRAWING_ID}")
        drawing = drawings[DRAWING_ID]
        rect = fitz.Rect(drawing["rect"])
        if drawing["type"] != "f" or max(
            abs(a - b) for a, b in zip(rect, EXPECTED_RECT)
        ) > 0.002:
            raise ValueError(
                f"Refusing unexpected page-100 drawing {DRAWING_ID}: {rect}"
            )

        # Remove text only in the temporary source render so the local patch
        # contains the original page texture, without the semantic label.
        for block in page.get_text("blocks"):
            if len(block) >= 5 and block[4].strip():
                page.add_redact_annot(fitz.Rect(block[:4]), fill=None)
        page.apply_redactions(images=0, graphics=0, text=0)
        page.add_redact_annot(rect + (-0.02, -0.02, 0.02, 0.02), fill=None)
        page.apply_redactions(images=0, graphics=1, text=0)
        if any(
            max(abs(a - b) for a, b in zip(item["rect"], rect)) < 0.002
            for item in page.get_drawings()
        ):
            raise ValueError("Source capsule path remains after localized removal")

        with Image.open(BACKGROUND) as image:
            old = image.convert("RGB")
        sx, sy = old.width / page.rect.width, old.height / page.rect.height
        pix = page.get_pixmap(matrix=fitz.Matrix(sx, sy), alpha=False)
        source_clean = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if source_clean.size != old.size:
            raise ValueError(
                f"Unexpected page asset dimensions: {source_clean.size} vs {old.size}"
            )

        pad = 0.5
        box = (
            max(0, round((rect.x0 - pad) * sx)),
            max(0, round((rect.y0 - pad) * sy)),
            min(old.width, round((rect.x1 + pad) * sx)),
            min(old.height, round((rect.y1 + pad) * sy)),
        )
        clean = old.copy()
        clean.paste(source_clean.crop(box), box[:2])

        mask = Image.new("L", old.size, 255)
        ImageDraw.Draw(mask).rectangle(box, fill=0)
        diff = np.abs(np.asarray(old, dtype=np.int16) - np.asarray(clean, dtype=np.int16))
        outside = np.asarray(mask) > 0
        outside_mae = float(diff[outside].mean())
        inside_mae = float(diff[~outside].mean())
        if apply and outside_mae != 0:
            raise ValueError(
                f"Refusing write: pixels outside capsule crop changed ({outside_mae})"
            )

        output = PREVIEW
        PREVIEW.parent.mkdir(parents=True, exist_ok=True)
        if apply:
            clean.save(BACKGROUND, "WEBP", lossless=True, method=4)
            output = BACKGROUND
        else:
            clean.save(PREVIEW)

        return {
            "page": 100,
            "removedPdfDrawingIndex": DRAWING_ID,
            "removedDrawingBboxPt": list(rect),
            "patchPixelBox": list(box),
            "outsideCapsuleMeanAbsoluteChannelChange": round(outside_mae, 6),
            "capsuleCropMeanAbsoluteChannelChange": round(inside_mae, 6),
            "alreadyClean": inside_mae == 0,
            "output": str(output),
            "applied": apply,
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-pdf", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(repair(args.source_pdf, apply=args.apply), ensure_ascii=False, indent=2))
