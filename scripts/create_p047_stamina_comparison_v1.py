from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-047-stamina-points-proposal-2026-10-15-v1.json"
PROOF_DIR = ROOT / "output/proofs/translation-readiness-2026-10-15/p047-stamina-proposal-v1"
VIEWER_PATH = PROOF_DIR / "viewer-pt-BR.png"
PDF_PATH = PROOF_DIR / "page-047-pt-BR-stamina-proposal.pdf"
EVIDENCE_DIR = ROOT / "docs/project-progress/evidence/2026-10-15-p047-stamina"
EVIDENCE_PATH = EVIDENCE_DIR / "source-viewer-pdf-crop.png"
MANIFEST_PATH = PROOF_DIR / "visual-comparison.json"
TRACKED_MANIFEST_PATH = EVIDENCE_DIR / "visual-comparison.json"


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


proposal = json.loads(PROPOSAL_PATH.read_text(encoding="utf-8"))
source_pdf = Path(os.environ.get("MIDDARA_SOURCE_PDF_PATH", ROOT / proposal["source"]["pdfPath"])).resolve()
if sha256(source_pdf).lower() != proposal["source"]["pdfSha256"].lower():
    raise RuntimeError("Official source PDF hash differs from the proposal baseline.")

with fitz.open(source_pdf) as source_doc, fitz.open(PDF_PATH) as export_doc:
    if len(source_doc) < 47 or len(export_doc) != 1:
        raise RuntimeError("Expected source page 47 and a one-page export.")
    source_page = source_doc[46]
    export_page = export_doc[0]
    if tuple(source_page.mediabox) != tuple(export_page.mediabox):
        raise RuntimeError("Source and export MediaBox differ.")
    scale = 1.57
    source_pixmap = source_page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    source_image = Image.frombytes("RGB", (source_pixmap.width, source_pixmap.height), source_pixmap.samples)
    pdf_pixmap = export_page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    pdf_image = Image.frombytes("RGB", (pdf_pixmap.width, pdf_pixmap.height), pdf_pixmap.samples)
    source_text = source_page.get_text()
    export_text = export_page.get_text()
    source_media_box = list(source_page.mediabox)
    source_page_rect = source_page.rect

viewer_image = Image.open(VIEWER_PATH).convert("RGB")
if viewer_image.size != source_image.size or pdf_image.size != source_image.size:
    raise RuntimeError(f"Raster sizes differ: source={source_image.size}, viewer={viewer_image.size}, pdf={pdf_image.size}")

for target in ("Pontos de Vigor em Habilidades", "Algumas Habilidades têm um custo em"):
    if export_text.count(target) != 1:
        raise RuntimeError(f"Export does not contain the expected target exactly once: {target}")
for fallback in ("Stamina Points on Abilities", "Some Abilities have an SP Cost as a Condition"):
    if fallback in export_text:
        raise RuntimeError(f"Export contains source fallback in a translated unit: {fallback}")

# Crop the heading, five-line paragraph and the top of its neighboring card.
page_scale = source_image.width / source_page_rect.width
crop_points = fitz.Rect(400, 80, 755, 230)
crop = tuple(round(value * page_scale) for value in (crop_points.x0, crop_points.y0, crop_points.x1, crop_points.y1))
images = [source_image.crop(crop), viewer_image.crop(crop), pdf_image.crop(crop)]
labels = ["FONTE EN", "VIEWER PT-BR", "PDF EXPORTADO PT-BR"]
label_height = 38
gap = 10
canvas = Image.new("RGB", (sum(image.width for image in images) + gap * 2, images[0].height + label_height), "white")
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

import io
buffer = io.BytesIO()
canvas.save(buffer, format="PNG", optimize=True)
image_bytes = buffer.getvalue()
immutable_write(EVIDENCE_PATH, image_bytes)
immutable_write(PROOF_DIR / "source-viewer-pdf-crop.png", image_bytes)

manifest = {
    "page": 47,
    "locale": "pt-BR",
    "sourcePdfSha256": sha256(source_pdf),
    "exportPdfSha256": sha256(PDF_PATH),
    "viewerScreenshotSha256": sha256(VIEWER_PATH),
    "comparisonCropSha256": hashlib.sha256(image_bytes).hexdigest(),
    "mediaBox": source_media_box,
    "rasterSize": list(source_image.size),
    "scale": scale,
    "cropPagePoints": list(crop_points),
    "targetTextOccurrences": {
        "Pontos de Vigor em Habilidades": export_text.count("Pontos de Vigor em Habilidades"),
        "Algumas Habilidades têm um custo em": export_text.count("Algumas Habilidades têm um custo em"),
    },
    "sourceFallbackOccurrences": {
        "Stamina Points on Abilities": export_text.count("Stamina Points on Abilities"),
        "Some Abilities have an SP Cost as a Condition": export_text.count("Some Abilities have an SP Cost as a Condition"),
    },
    "comparison": ["official source PDF page 47", "normal PageRenderer capture from isolated snapshot", "independent raster of the exported one-page PDF"],
}
immutable_write(MANIFEST_PATH, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
immutable_write(TRACKED_MANIFEST_PATH, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
print(json.dumps(manifest, ensure_ascii=False, indent=2))
