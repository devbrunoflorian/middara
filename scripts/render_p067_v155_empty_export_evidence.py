#!/usr/bin/env python3
"""Render source, reinserted, and empty p.67 PDFs at identical geometry."""
from __future__ import annotations

import hashlib
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = Path(r"C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p067-v155-pending-proof-v1/p067-v155-158-n4"
REINSERTED_PDF = PROOF / "p067-en-mask-v1.pdf"
EMPTY_PDF = PROOF / "empty-position-en-mask-v1.pdf"
CAPTURE = PROOF / "capture"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_immutable(path: Path, image: Image.Image) -> None:
    if path.exists():
        raise SystemExit(f"Refusing to overwrite existing evidence: {path}")
    image.save(path, optimize=True)


def render_page(path: Path, page_index: int, scale: float) -> Image.Image:
    doc = pymupdf.open(path)
    try:
        page = doc[page_index]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    finally:
        doc.close()


def render_crop(path: Path, page_index: int, clip: pymupdf.Rect, scale: float) -> Image.Image:
    doc = pymupdf.open(path)
    try:
        page = doc[page_index]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    finally:
        doc.close()


def main() -> None:
    assert sha256(SOURCE_PDF) == SOURCE_SHA256, "The audited source PDF hash changed."
    for path in (REINSERTED_PDF, EMPTY_PDF):
        assert path.is_file(), f"Missing isolated export: {path}"
    CAPTURE.mkdir(parents=True, exist_ok=True)

    docs = [pymupdf.open(path) for path in (SOURCE_PDF, REINSERTED_PDF, EMPTY_PDF)]
    try:
        assert len(docs[0]) == 102
        assert len(docs[1]) == len(docs[2]) == 1
        rects = [tuple(round(v, 3) for v in doc[66 if index == 0 else 0].rect) for index, doc in enumerate(docs)]
        assert rects[0] == rects[1] == rects[2], f"Page geometry differs: {rects}"
    finally:
        for doc in docs:
            doc.close()

    source_crop = render_crop(SOURCE_PDF, 66, pymupdf.Rect(470, 519, 640, 568), 3.2)
    reinserted_crop = render_crop(REINSERTED_PDF, 0, pymupdf.Rect(470, 519, 640, 568), 3.2)
    empty_crop = render_crop(EMPTY_PDF, 0, pymupdf.Rect(470, 519, 640, 568), 3.2)
    labels = ["SOURCE PDF", "ISOLATED EN — SYMBOL REINSERTED", "ISOLATED EN — EMPTY OVERRIDE"]
    width = max(source_crop.width, reinserted_crop.width, empty_crop.width)
    header_height = 38
    canvas = Image.new("RGB", (width * 3, source_crop.height + header_height), "white")
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    for index, (label, crop) in enumerate(zip(labels, (source_crop, reinserted_crop, empty_crop), strict=True)):
        x = index * width
        draw.text((x + 8, 8), label, fill="black", font=font)
        canvas.paste(crop, (x, header_height))
    write_immutable(CAPTURE / "p067-source-vs-reinserted-vs-empty-crop-v1.png", canvas)

    write_immutable(CAPTURE / "p067-reinserted-pdf-page-v1.png", render_page(REINSERTED_PDF, 0, 1.6))
    write_immutable(CAPTURE / "p067-empty-pdf-page-v1.png", render_page(EMPTY_PDF, 0, 1.6))
    print({
        "sourcePdfSha256": sha256(SOURCE_PDF),
        "reinsertedPdfSha256": sha256(REINSERTED_PDF),
        "emptyPdfSha256": sha256(EMPTY_PDF),
        "sourceAndExportMediaBoxEqual": True,
        "cropPt": [470, 519, 640, 568],
        "cropScale": 3.2,
        "evidence": [
            str((CAPTURE / "p067-source-vs-reinserted-vs-empty-crop-v1.png").relative_to(ROOT)),
            str((CAPTURE / "p067-reinserted-pdf-page-v1.png").relative_to(ROOT)),
            str((CAPTURE / "p067-empty-pdf-page-v1.png").relative_to(ROOT)),
        ],
    })


if __name__ == "__main__":
    main()
