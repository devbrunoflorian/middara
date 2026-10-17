#!/usr/bin/env python3
"""Record the p.68 static die collision exposed by the serialized empty EN override."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = ROOT.parent / "Rulebook 1.2" / "Rulebook 1p2 Final Version 05-19-23 Optimized.pdf"
PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/native-vector-mask-p068-proof-v5"
CANDIDATE = PROOF_ROOT / "p068-v113-114-n2"
EMPTY_PDF = CANDIDATE / "p068-en-empty-override-v2.pdf"
EMPTY_REPORT = CANDIDATE / "empty-override-export-report.json"
OUTLIER_JSON = PROOF_ROOT / "p068-black-die-outlier.json"
COMPARISON_PNG = PROOF_ROOT / "p068-black-die-source-vs-empty-override.png"
EXPECTED_SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
EXPECTED_EMPTY_PDF_SHA256 = "dac3306c64cf3d9fc73a0af7a5b18ddeb92516b83b44578f06c4300b3699b4cb"
PAGE_NUMBER = 68
SOURCE_PAGE_INDEX = 67
DIE_RECT = fitz.Rect(384.5, 452.73, 395.98, 465.99)
RENDER_CLIP = fitz.Rect(75, 447, 410, 480)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def box(rect: fitz.Rect) -> list[float]:
    return [round(value, 4) for value in (rect.x0, rect.y0, rect.x1, rect.y1)]


def render_clip(page: fitz.Page, clip: fitz.Rect, scale: float = 3.2) -> Image.Image:
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def main() -> None:
    assert SOURCE_PDF.exists() and EMPTY_PDF.exists() and EMPTY_REPORT.exists()
    source_hash = sha256(SOURCE_PDF)
    empty_pdf_hash = sha256(EMPTY_PDF)
    assert source_hash == EXPECTED_SOURCE_SHA256, source_hash
    assert empty_pdf_hash == EXPECTED_EMPTY_PDF_SHA256, empty_pdf_hash

    export_report = json.loads(EMPTY_REPORT.read_text(encoding="utf-8"))
    assert export_report["candidateId"] == "p068-v113-114-n2"
    assert export_report["sourcePdfSha256"] == source_hash
    assert export_report["semanticSkullSegmentsInOverride"] == 0
    assert export_report["spanKey"] == "page_68_block_5"
    assert export_report["suffixEnSerialized"] is False
    assert export_report["exporterVerifiedSnapshotTextAndSymbolOrder"] is True
    assert export_report["livePayloadRequests"] == export_report["canonicalWrites"] == 0

    source_doc = fitz.open(SOURCE_PDF)
    empty_doc = fitz.open(EMPTY_PDF)
    source_page = source_doc[SOURCE_PAGE_INDEX]
    empty_page = empty_doc[0]
    assert empty_doc.page_count == 1

    matching_drawings = []
    for index, drawing in enumerate(source_page.get_drawings()):
        rect = drawing["rect"]
        if rect.intersects(DIE_RECT) and 0.5 < rect.width < 20 and 0.5 < rect.height < 20:
            matching_drawings.append((index, drawing))
    assert matching_drawings, "Pinned source die vector not found near its recorded position."
    die_index, die_drawing = min(
        matching_drawings,
        key=lambda item: abs(item[1]["rect"].x0 - DIE_RECT.x0)
        + abs(item[1]["rect"].y0 - DIE_RECT.y0),
    )
    source_die_rect = die_drawing["rect"]

    def words_near_die(page: fitz.Page) -> list[fitz.Rect]:
        result = []
        for x0, y0, x1, y1, word, *_ in page.get_text("words"):
            word_rect = fitz.Rect(x0, y0, x1, y1)
            if word.casefold() == "than" and 440 <= y0 <= 480 and word_rect.intersects(RENDER_CLIP):
                result.append(word_rect)
        return result

    source_than = words_near_die(source_page)
    empty_than = words_near_die(empty_page)
    assert source_than and empty_than
    source_collisions = [word for word in source_than if word.intersects(source_die_rect)]
    empty_collisions = [word for word in empty_than if word.intersects(source_die_rect)]
    assert not source_collisions, [box(item) for item in source_collisions]
    assert len(empty_collisions) == 1, [box(item) for item in empty_collisions]

    # The source art is baked into the isolated export background while the EN text is reflowed.
    source_crop = render_clip(source_page, RENDER_CLIP)
    empty_crop = render_clip(empty_page, RENDER_CLIP)
    row_height = max(source_crop.height, empty_crop.height)
    margin, label_h = 20, 46
    canvas = Image.new("RGB", (max(source_crop.width, empty_crop.width) + 2 * margin, 2 * row_height + 2 * margin + 2 * label_h), "white")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype("arial.ttf", 25)
    y = margin
    draw.text((margin, y), "PDF-fonte oficial · p.68", fill="#202124", font=font)
    y += label_h
    canvas.paste(source_crop, (margin, y))
    y += row_height + margin
    draw.text((margin, y), "PDF isolado · override EN vazio (sem fallback)", fill="#202124", font=font)
    y += label_h
    canvas.paste(empty_crop, (margin, y))
    canvas.save(COMPARISON_PNG)

    empty_than_rect = empty_collisions[0]
    intersection = empty_than_rect & source_die_rect
    report = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "id": "p068-static-black-die-text-reflow-collision",
        "page": PAGE_NUMBER,
        "classification": "confirmed export collision outside frozen 111 placement IDs",
        "candidatePlacementId": "p068-v113-114-n2",
        "notPartOfPrepared111": True,
        "sourcePdfSha256": source_hash,
        "emptyOverridePdf": str(EMPTY_PDF.relative_to(ROOT)).replace("\\", "/"),
        "emptyOverridePdfSha256": empty_pdf_hash,
        "emptyOverrideSnapshotSha256": export_report["emptyOverrideSnapshotSha256"],
        "serializedOverride": {
            "spanKey": export_report["spanKey"],
            "language": export_report["language"],
            "suffixEnSerialized": export_report["suffixEnSerialized"],
            "semanticSkullSegments": export_report["semanticSkullSegmentsInOverride"],
            "exporterVerifiedSnapshotTextAndSymbolOrder": export_report["exporterVerifiedSnapshotTextAndSymbolOrder"],
        },
        "sourceBlackDie": {
            "sourceDrawingIndex": die_index,
            "bboxPt": box(source_die_rect),
            "fill": die_drawing.get("fill"),
            "stroke": die_drawing.get("color"),
        },
        "sourceThanWordBboxesPt": [box(rect) for rect in source_than],
        "emptyOverrideThanWordBboxesPt": [box(rect) for rect in empty_than],
        "emptyOverrideCollision": {
            "word": "than",
            "dieBboxPt": box(source_die_rect),
            "textBboxPt": box(empty_than_rect),
            "intersectionBboxPt": box(intersection),
            "intersectionAreaPt2": round(intersection.get_area(), 4),
        },
        "visualEvidence": str(COMPARISON_PNG.relative_to(ROOT)).replace("\\", "/"),
        "visualEvidenceSha256": sha256(COMPARISON_PNG),
        "remediated": False,
        "blocksPageLevelStructuralPass": True,
        "scopeNote": "The skull cleanup remains candidate-scope READY. This outlier is separate from the prepared placement, has no invented placement ID, and is not remediated here.",
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "humanTranslationWrites": 0,
        "sourcePdfWrittenOrModified": False,
    }
    OUTLIER_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(OUTLIER_JSON), "reportSha256": sha256(OUTLIER_JSON), "visual": str(COMPARISON_PNG), "visualSha256": sha256(COMPARISON_PNG), "sourceDieBboxPt": box(source_die_rect), "sourceThan": [box(x) for x in source_than], "emptyThan": [box(x) for x in empty_than], "collisionAreaPt2": report["emptyOverrideCollision"]["intersectionAreaPt2"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
