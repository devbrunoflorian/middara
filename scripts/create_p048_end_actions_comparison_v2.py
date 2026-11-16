from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROOF_DIR = ROOT / "output/proofs/translation-readiness-2026-10-15/p048-end-actions-v2"
PDF_PATH = PROOF_DIR / "page-048-pt-BR-end-actions-proposal.pdf"
VIEWER_PATH = PROOF_DIR / "viewer-pt-BR.png"
EVIDENCE_DIR = ROOT / "docs/project-progress/evidence/2026-10-15-p048-end-actions"
EVIDENCE_PATH = EVIDENCE_DIR / "source-viewer-pdf-crop.png"
MANIFEST_PATH = EVIDENCE_DIR / "visual-comparison.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def immutable_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != content:
            raise RuntimeError(f"Refusing to replace changed evidence: {path}")
        return
    with path.open("xb") as stream:
        stream.write(content)


source_pdf = Path(os.environ.get("MIDDARA_SOURCE_PDF_PATH", "C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")).resolve()
source_hash = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
if sha256(source_pdf).lower() != source_hash:
    raise RuntimeError("Official source PDF hash changed.")

with pymupdf.open(source_pdf) as source_doc, pymupdf.open(PDF_PATH) as export_doc:
    if len(source_doc) < 48 or len(export_doc) != 1:
        raise RuntimeError("Expected source page 48 and one exported page.")
    source_page = source_doc[47]
    export_page = export_doc[0]
    if tuple(source_page.mediabox) != tuple(export_page.mediabox):
        raise RuntimeError("Source and export MediaBox differ.")
    scale = 1.57
    source_pixmap = source_page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    source_image = Image.frombytes("RGB", (source_pixmap.width, source_pixmap.height), source_pixmap.samples)
    export_pixmap = export_page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    export_image = Image.frombytes("RGB", (export_pixmap.width, export_pixmap.height), export_pixmap.samples)
    source_text = source_page.get_text()
    export_text = export_page.get_text()
    media_box = list(source_page.mediabox)
    page_rect = source_page.rect

viewer_image = Image.open(VIEWER_PATH).convert("RGB")
if source_image.size != export_image.size or viewer_image.size != source_image.size:
    raise RuntimeError(f"Raster dimensions differ: source={source_image.size}, viewer={viewer_image.size}, export={export_image.size}")

targets = (
    "Encerramento de Ações e Habilidades",
    "Quando uma Habilidade instrui uma miniatura",
    "Em seguida, a miniatura que",
)
fallbacks = (
    "Abilities that End Actions and Abilities",
    "When an Ability instructs a figure",
    "Then, the figure that ended the current Action",
)
target_counts = {target: export_text.count(target) for target in targets}
fallback_counts = {source: export_text.count(source) for source in fallbacks}
if any(count != 1 for count in target_counts.values()):
    raise RuntimeError(f"Target text is missing or duplicated in exported PDF: {target_counts}")
if any(fallback_counts.values()):
    raise RuntimeError(f"Source fallback remains in a translated unit: {fallback_counts}")

# Include the next English paragraph and Passive Conditions heading to inspect the gap.
scale_x = source_image.width / page_rect.width
crop_points = pymupdf.Rect(405, 284, 742, 455)
crop = tuple(round(value * scale_x) for value in (crop_points.x0, crop_points.y0, crop_points.x1, crop_points.y1))
images = [source_image.crop(crop), viewer_image.crop(crop), export_image.crop(crop)]
labels = ["FONTE EN", "VIEWER PT-BR", "PDF EXPORTADO PT-BR"]
label_height, gap = 38, 10
canvas = Image.new("RGB", (sum(image.width for image in images) + 2 * gap, images[0].height + label_height), "white")
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype("arial.ttf", 20)
except OSError:
    font = ImageFont.load_default()
x = 0
for image, label in zip(images, labels, strict=True):
    draw.text((x + 8, 8), label, fill="#202020", font=font)
    canvas.paste(image, (x, label_height))
    x += image.width + gap
buffer = io.BytesIO()
canvas.save(buffer, format="PNG", optimize=True)
image_bytes = buffer.getvalue()
immutable_write(EVIDENCE_PATH, image_bytes)

manifest = {
    "page": 48,
    "locale": "pt-BR",
    "sourcePdfSha256": sha256(source_pdf),
    "exportPdfSha256": sha256(PDF_PATH),
    "viewerScreenshotSha256": sha256(VIEWER_PATH),
    "comparisonCropSha256": hashlib.sha256(image_bytes).hexdigest(),
    "mediaBox": media_box,
    "rasterSize": list(source_image.size),
    "scale": scale,
    "cropPagePoints": list(crop_points),
    "targetTextOccurrences": target_counts,
    "sourceFallbackOccurrences": fallback_counts,
    "comparison": ["official source PDF page 48", "PageRenderer capture from immutable snapshot", "independent raster of the exported one-page PDF"],
}
immutable_write(MANIFEST_PATH, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
print(json.dumps(manifest, ensure_ascii=True, indent=2))
