#!/usr/bin/env python3
"""Independently verify p.43 combined IMPORTANT PDF text, boxes, and visual crops."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "output/proofs/important-family-validation-2026-10-15/p043-combined-v1"
MANIFEST = ROOT / "docs/translations/proposals/important-family-manifest-2026-10-13.json"
manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
source_pdf = (ROOT / manifest["source"]["pdfPath"]).resolve()
exporter_source_pdf = Path(r"C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
export_pdf = PROOF / "p043-pt-BR-important-family-v1.pdf"
metrics_path = PROOF / "export-metrics.json"
EXPECTED_PDF_SHA = manifest["source"]["pdfSha256"].lower()

TARGETS = {
    "p043-block_22": {
        "text": "IMPORTANTE: Se um Aventureiro equipar 2 Armas de Longo Alcance diferentes, com 2 Valores de Alcance diferentes, só poderá atacar alvos usando o menor dos dois valores.",
        "body": "Se um Aventureiro equipar 2 Armas de Longo Alcance diferentes, com 2 Valores de Alcance diferentes, só poderá atacar alvos usando o menor dos dois valores.",
        "sourceBody": "If an Adventurer equips 2 different Ranged Weapons with 2 different Ranged Values, they may only make Attacks against targets using the lowest of the two values.",
        "crop": (405, 307, 740, 371),
    },
    "p043-block_26": {
        "text": "IMPORTANTE: Ao contrário do movimento, todos os tipos de Alcance são contados na diagonal e na ortogonal.",
        "body": "Ao contrário do movimento, todos os tipos de Alcance são contados na diagonal e na ortogonal.",
        "sourceBody": "Unlike movement, all types of Range are counted diagonally as well as orthogonally.",
        "crop": (405, 437, 730, 492),
    },
    "p043-block_60": {
        "text": "IMPORTANTE: Uma Ação de Ataque exige que o alvo do Ataque esteja dentro do Alcance e da Linha de Visão.",
        "body": "Uma Ação de Ataque exige que o alvo do Ataque esteja dentro do Alcance e da Linha de Visão.",
        "sourceBody": "An Attack Action requires the target of the Attack to be within Range and Line of Sight.",
        "crop": (75, 581, 408, 638),
    },
}

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def normalized(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

assert sha256(source_pdf) == EXPECTED_PDF_SHA, "Manifest source PDF hash changed"
assert sha256(exporter_source_pdf) == EXPECTED_PDF_SHA, "Exporter used a different source PDF"
metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
assert metrics["page"] == 43
assert metrics["language"] == "pt-BR"
assert len([item for item in metrics["viewer"]["symbols"] if item["id"] == "tag.important.icon"]) == 3

source_doc = pymupdf.open(source_pdf)
export_doc = pymupdf.open(export_pdf)
assert source_doc.page_count == 102
assert export_doc.page_count == 1
source_page, export_page = source_doc[42], export_doc[0]
for box_name in ("mediabox", "cropbox"):
    source_box, export_box = getattr(source_page, box_name), getattr(export_page, box_name)
    assert max(abs(a - b) for a, b in zip(source_box, export_box)) <= 0.02, (box_name, list(source_box), list(export_box))

export_text = normalized(export_page.get_text("text"))
body_checks, fallback_checks, label_paint_passes = {}, {}, {}
for occurrence_id, expected in TARGETS.items():
    body_checks[occurrence_id] = export_text.count(normalized(expected["body"]))
    assert body_checks[occurrence_id] == 1, (occurrence_id, "PT body not extracted exactly once")
    assert export_text.count(normalized(expected["text"])) == 1, (occurrence_id, "PT callout not found exactly once")
    fallback_checks[occurrence_id] = export_text.count(normalized(expected["sourceBody"]))
    assert fallback_checks[occurrence_id] == 0, (occurrence_id, "English body fallback detected")
    clip = pymupdf.Rect(*expected["crop"])
    lines = [
        "".join(span.get("text", "") for span in line.get("spans", []))
        for block in export_page.get_text("dict", clip=clip)["blocks"]
        for line in block.get("lines", [])
    ]
    label_paint_passes[occurrence_id] = sum(line.count("IMPORTANTE:") for line in lines)
    # Source paints the outlined label in two coincident passes (white stroke, then red fill).
    assert label_paint_passes[occurrence_id] == 2, (occurrence_id, lines)
assert "\ufffd" not in export_text

source_pix = source_page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
export_pix = export_page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
source_image = Image.frombytes("RGB", (source_pix.width, source_pix.height), source_pix.samples)
export_image = Image.frombytes("RGB", (export_pix.width, export_pix.height), export_pix.samples)
font_path = Path(r"C:\Windows\Fonts\arial.ttf")
font = ImageFont.truetype(str(font_path), 22) if font_path.exists() else ImageFont.load_default()

pad, header, gap = 18, 38, 12
full_comparison = Image.new(
    "RGB", (source_image.width + export_image.width + gap + 2 * pad, max(source_image.height, export_image.height) + header + 2 * pad), "white"
)
draw = ImageDraw.Draw(full_comparison)
draw.text((pad, pad), "PDF fonte EN — p.43", font=font, fill="#222222")
draw.text((pad + source_image.width + gap, pad), "PDF exportado — 3 IMPORTANT PT-BR", font=font, fill="#222222")
full_comparison.paste(source_image, (pad, pad + header))
full_comparison.paste(export_image, (pad + source_image.width + gap, pad + header))
full_comparison.save(PROOF / "source-vs-export-full-page.png")
export_pix.save(PROOF / "p043-export-pdf-raster.png")

rows = []
for occurrence_id, expected in TARGETS.items():
    clip = pymupdf.Rect(*expected["crop"])
    zoom = pymupdf.Matrix(3, 3)
    left_pix = source_page.get_pixmap(matrix=zoom, clip=clip, alpha=False)
    right_pix = export_page.get_pixmap(matrix=zoom, clip=clip, alpha=False)
    left = Image.frombytes("RGB", (left_pix.width, left_pix.height), left_pix.samples)
    right = Image.frombytes("RGB", (right_pix.width, right_pix.height), right_pix.samples)
    row = Image.new("RGB", (left.width + right.width + 24, max(left.height, right.height) + 44), "white")
    row_draw = ImageDraw.Draw(row)
    row_draw.text((0, 0), f"{occurrence_id} — fonte EN", font=font, fill="#222222")
    row_draw.text((left.width + 24, 0), f"{occurrence_id} — export PT-BR", font=font, fill="#222222")
    row.paste(left, (0, 40))
    row.paste(right, (left.width + 24, 40))
    rows.append(row)
contact = Image.new("RGB", (max(row.width for row in rows), sum(row.height for row in rows) + 18 * (len(rows) - 1)), "#eeeeee")
y = 0
for row in rows:
    contact.paste(row, (0, y))
    y += row.height + 18
contact.save(PROOF / "source-vs-export-callouts.png")

verification = {
    "status": "independent-pdf-check-passed; visual-review-required",
    "sourcePdfSha256": sha256(source_pdf),
    "exporterSourcePdfSha256": sha256(exporter_source_pdf),
    "exportPdfSha256": sha256(export_pdf),
    "pageCount": export_doc.page_count,
    "mediaBoxPt": list(export_page.mediabox),
    "cropBoxPt": list(export_page.cropbox),
    "translatedBodyOccurrencesInPdf": body_checks,
    "englishBodyFallbackOccurrences": fallback_checks,
    "outlinePaintPassesExtractedPerCallout": label_paint_passes,
    "outlinePassNote": "The source and export use coincident stroke/fill passes for IMPORTANT labels; text extraction lists both while raster appearance is judged separately.",
    "replacementCharacters": export_text.count("\ufffd"),
    "viewerSemanticSymbols": len([item for item in metrics["viewer"]["symbols"] if item["id"] == "tag.important.icon"]),
    "visualArtifacts": {
        "fullPageComparison": "source-vs-export-full-page.png",
        "calloutComparison": "source-vs-export-callouts.png",
        "exportPdfRaster": "p043-export-pdf-raster.png",
        "viewerScreenshot": "viewer-p043-pt-BR-important-family-v1.png",
        "printScreenshot": "print-p043-pt-BR-important-family-v1.png",
    },
}
(PROOF / "pdf-independent-verification.json").write_text(json.dumps(verification, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(verification, ensure_ascii=False, indent=2))
source_doc.close()
export_doc.close()
