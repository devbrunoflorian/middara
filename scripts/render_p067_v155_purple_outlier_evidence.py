#!/usr/bin/env python3
"""Create a same-geometry crop for the untracked purple die beside p.67 v155."""
from __future__ import annotations

from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p067-v155-pending-proof-v1/p067-v155-158-n4"
PDFS = [
    ("SOURCE PDF", SOURCE, 66),
    ("ISOLATED EN — REINSERTED", PROOF / "p067-en-mask-v1.pdf", 0),
    ("ISOLATED EN — EMPTY OVERRIDE", PROOF / "empty-position-en-mask-v1.pdf", 0),
]
OUT = PROOF / "capture/p067-purple-die-source-vs-reflow-v1.png"
CLIP = pymupdf.Rect(570, 519, 660, 550)


def render(path: Path, page_index: int) -> Image.Image:
    doc = pymupdf.open(path)
    try:
        pix = doc[page_index].get_pixmap(matrix=pymupdf.Matrix(4, 4), clip=CLIP, alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    finally:
        doc.close()


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"Refusing to overwrite existing evidence: {OUT}")
    crops = [render(path, index) for _, path, index in PDFS]
    width = max(crop.width for crop in crops)
    header = 36
    canvas = Image.new("RGB", (width * len(crops), header + crops[0].height), "white")
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    for i, (label, _, _) in enumerate(PDFS):
        x = i * width
        draw.text((x + 8, 8), label, fill="black", font=font)
        canvas.paste(crops[i], (x, header))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, optimize=True)
    print({"evidence": str(OUT.relative_to(ROOT)), "clipPt": list(CLIP), "scale": 4})


if __name__ == "__main__":
    main()
