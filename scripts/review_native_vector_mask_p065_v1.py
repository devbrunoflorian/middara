#!/usr/bin/env python3
"""Render target-local source, Viewer and isolated-PDF evidence for p65."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p065-proof-v1"
OUT = PROOF / "rendered"
SOURCE_PDF = ROOT.parent / "Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
SOURCE_SHA = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
PAGE_WIDTH_PT = 820.3460083007812
CLIP = (75, 730, 420, 805)
TARGETS = ["p065-v110-112-n3", "p065-v115"]
SCALE = 2.5


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render(pdf_path: Path, page_index: int, clip: tuple[float, float, float, float]) -> Image.Image:
    doc = pymupdf.open(pdf_path)
    try:
        page = doc[page_index]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), clip=pymupdf.Rect(clip), alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    finally:
        doc.close()


def capture_crop(path: Path, clip: tuple[float, float, float, float]) -> Image.Image:
    image = Image.open(path).convert("RGB")
    scale = image.width / PAGE_WIDTH_PT
    return image.crop(tuple(round(x * scale) for x in clip))


def main() -> None:
    if sha(SOURCE_PDF) != SOURCE_SHA:
        raise SystemExit("Source PDF hash changed since the frozen audit")
    OUT.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 28)
    source_crop = render(SOURCE_PDF, 64, CLIP)
    results = []
    for candidate_id in TARGETS:
        folder = PROOF / candidate_id
        capture = folder / "capture"
        export_crop = render(folder / "p065-en-mask-v1.pdf", 0, CLIP)
        rows = [
            ("Official source PDF", source_crop),
            ("Viewer: source position", capture_crop(capture / "viewer-source-with-clean-vector-mask.png", CLIP)),
            ("Viewer: target removed", capture_crop(capture / "viewer-empty-clean-mask.png", CLIP)),
            ("Isolated exported PDF", export_crop),
            ("Viewer: moved once", capture_crop(capture / "viewer-moved-clean-mask.png", CLIP)),
        ]
        width = max(image.width for _, image in rows)
        row_height = max(image.height for _, image in rows) + 46
        montage = Image.new("RGB", (width, row_height * len(rows)), "white")
        draw = ImageDraw.Draw(montage)
        for index, (label, image) in enumerate(rows):
            y = index * row_height
            draw.text((8, y + 5), label, fill=(20, 20, 20), font=font)
            montage.paste(image, (0, y + 42))
        image_path = OUT / f"{candidate_id}-source-empty-export-moved.png"
        montage.save(image_path, optimize=True)
        pdf = folder / "p065-en-mask-v1.pdf"
        results.append({
            "candidateId": candidate_id,
            "comparisonImage": str(image_path.relative_to(ROOT)).replace("\\", "/"),
            "isolatedPdf": str(pdf.relative_to(ROOT)).replace("\\", "/"),
            "isolatedPdfSha256": sha(pdf),
        })
    if sha(SOURCE_PDF) != SOURCE_SHA:
        raise SystemExit("Source PDF hash changed unexpectedly during review")
    report = {
        "status": "read-only source/export visual review complete; no activation",
        "sourcePdfSha256": SOURCE_SHA,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
        "sourcePageCropPt": list(CLIP),
        "imageXrefsPreservedInNativeExperiment": True,
        "collateralChangedPixelsOutsideMask": 0,
        "sourcePdfSaved": False,
        "visualComparisons": results,
    }
    (OUT / "review-diagnostics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"comparisons": len(results), "sourceHashUnchanged": True, "report": str((OUT / "review-diagnostics.json").relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
