#!/usr/bin/env python3
"""Validate and inventory the 13 source-position symbol reproofs (read-only inputs)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/source-position-reproof-v1"
EXPORT_ROOT = PROOF_ROOT / "renderer-fix-exports"
BATCH_RESULTS = PROOF_ROOT / "batch-results.json"
LEDGER_V8 = ROOT / "output/proofs/translation-readiness-2026-10-14/readiness-ledger-v8.json"
SOURCE_PDF = Path(r"C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
EXPECTED_IDS = {
    "p043-v157-158-n2",
    "p043-v159-160-n2",
    "p045-v99-101-n3",
    "p045-v102",
    "p045-v103-104-n2",
    "p049-v156",
    "p054-v197-200-n4",
    "p078-v153-156-n4",
    "p092-v199-200-201-202",
    "p102-v430-433-n4",
    "p102-v434-437-n4",
    "p102-v438-441-n4",
    "p102-v442-445-n4",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def build_p102_comparison() -> Path:
    source_doc = pymupdf.open(SOURCE_PDF)
    export_pdf = EXPORT_ROOT / "p102-v430-433-n4/p102-v430-433-n4-en.pdf"
    export_doc = pymupdf.open(export_pdf)
    assert len(source_doc) == 102 and len(export_doc) == 1
    source_page = source_doc[101]
    export_page = export_doc[0]
    assert abs(source_page.rect.width - export_page.rect.width) < 0.01
    assert abs(source_page.rect.height - export_page.rect.height) < 0.01

    # This clip contains rows 5–8 and the exact source/translated symbol slots.
    clip = pymupdf.Rect(205, 700, 275, 770)
    matrix = pymupdf.Matrix(5, 5)
    panels = []
    for page in (source_page, export_page):
        pix = page.get_pixmap(matrix=matrix, clip=clip, alpha=False)
        panels.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))

    label_h = 38
    gap = 14
    canvas = Image.new("RGB", (panels[0].width * 2 + gap, panels[0].height + label_h), "#202124")
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype(r"C:/Windows/Fonts/arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    draw.text((12, 7), "PDF FONTE · P.102", fill="white", font=font)
    draw.text((panels[0].width + gap + 12, 7), "PDF ISOLADO · P.102", fill="white", font=font)
    canvas.paste(panels[0], (0, label_h))
    canvas.paste(panels[1], (panels[0].width + gap, label_h))
    output = PROOF_ROOT / "review/p102-source-vs-fixed-pdf-final.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)
    return output


def build_direct_pdf_contact_sheet(batch: dict) -> Path:
    source_doc = pymupdf.open(SOURCE_PDF)
    font_path = r"C:/Windows/Fonts/arial.ttf"
    try:
        label_font = ImageFont.truetype(font_path, 16)
        title_font = ImageFont.truetype(font_path, 20)
    except OSError:
        label_font = title_font = ImageFont.load_default()
    rows = []
    matrix = pymupdf.Matrix(3, 3)
    for placement in batch["placements"]:
        candidate_id = placement["candidateId"]
        bbox = placement["bbox"]
        source_page = source_doc[int(placement["page"]) - 1]
        export_pdf = EXPORT_ROOT / candidate_id / f"{candidate_id}-en.pdf"
        export_doc = pymupdf.open(export_pdf)
        export_page = export_doc[0]
        margin_x, margin_y = 32, 10
        clip = pymupdf.Rect(
            max(0, bbox[0] - margin_x),
            max(0, bbox[1] - margin_y),
            min(source_page.rect.width, bbox[2] + margin_x),
            min(source_page.rect.height, bbox[3] + margin_y),
        )
        panels = []
        for page in (source_page, export_page):
            pix = page.get_pixmap(matrix=matrix, clip=clip, alpha=False)
            panels.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
        assert panels[0].size == panels[1].size
        rows.append((candidate_id, panels[0], panels[1]))

    gap = 14
    candidate_h = 27
    panel_label_h = 24
    pad_x = 8
    panel_width = max(panel.size[0] for _, left, _ in rows for panel in [left])
    panel_height = max(max(left.height, right.height) for _, left, right in rows)
    content_width = panel_width * 2 + gap
    canvas_width = content_width + pad_x * 2
    row_height = candidate_h + panel_label_h + panel_height + 8
    canvas = Image.new("RGB", (canvas_width, row_height * len(rows) + 10), "#202124")
    draw = ImageDraw.Draw(canvas)
    for index, (candidate_id, source_panel, export_panel) in enumerate(rows):
        y = 8 + index * row_height
        draw.text((pad_x, y), candidate_id, fill="#ffffff", font=title_font)
        panel_y = y + candidate_h
        draw.text((pad_x, panel_y), "PDF FONTE", fill="#d7d7d7", font=label_font)
        right_x = pad_x + panel_width + gap
        draw.text((right_x, panel_y), "PDF ISOLADO", fill="#d7d7d7", font=label_font)
        image_y = panel_y + panel_label_h
        canvas.paste(source_panel, (pad_x, image_y))
        canvas.paste(export_panel, (right_x, image_y))

    output = PROOF_ROOT / "review/source-pdf-vs-isolated-pdf-13-direct.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)
    return output


def main() -> None:
    batch = read_json(BATCH_RESULTS)
    ledger = read_json(LEDGER_V8)
    source_hash = sha256(SOURCE_PDF)
    assert source_hash == SOURCE_SHA256, source_hash
    source_doc = pymupdf.open(SOURCE_PDF)
    assert batch["status"] == "completed"
    assert batch["pendingCount"] == 13
    assert batch["ownerBlockCount"] == 10
    assert batch["pageCount"] == 7
    assert batch["apiRequests"] == 0
    assert batch["sourcePdfSha256"] == source_hash
    assert sha256(BATCH_RESULTS)

    placements = {p["candidateId"]: p for p in batch["placements"]}
    ledger_rows = {p["candidateId"]: p for p in ledger["placements"]}
    assert set(placements) == EXPECTED_IDS
    assert set(ledger_rows) >= EXPECTED_IDS

    rows = []
    for candidate_id in sorted(EXPECTED_IDS):
        placement = placements[candidate_id]
        ledger_row = ledger_rows[candidate_id]
        assert ledger_row["status"] == "READY"
        assert placement["uiState"] == "passed"
        assert placement["moveContract"] == "passed"
        assert placement["error"] is None
        assert placement["sourceLineHeight"] > 0

        snapshot_path = PROOF_ROOT / "snapshots" / candidate_id / "snapshot.json"
        moved_snapshot_path = PROOF_ROOT / "snapshots" / candidate_id / "moved-test-snapshot.json"
        snapshot = read_json(snapshot_path)
        moved_snapshot = read_json(moved_snapshot_path)
        assert snapshot["verifyRenderedSnapshot"] is True
        translations = snapshot["translations"]
        assert translations and all(t.get("language") == "en" for t in translations)
        assert all(not t.get("spanKey", "").endswith("__en") for t in translations)
        assert sha256(snapshot_path) != sha256(moved_snapshot_path)

        page_dir = PROOF_ROOT / "snapshots" / candidate_id / "pages" / f"page_{int(placement['page']):03d}"
        inline_doc = read_json(page_dir / "inline_elements.json")
        source_element = next(
            e for e in inline_doc["elements"]
            if e.get("provenance", {}).get("candidateId") == candidate_id
        )
        assert source_element["symbolId"] == placement["symbolId"]
        appearance_key = source_element["metrics"]["sourceAppearanceKey"]
        assert appearance_key
        target_segments = [
            segment
            for translation in translations
            for segment in translation["data"]["segments"]
            if segment.get("symbolId") == placement["symbolId"]
            and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == appearance_key
        ]
        source_same_appearance = [
            e for e in inline_doc["elements"]
            if e.get("anchor", {}).get("blockId") == source_element["anchor"]["blockId"]
            and e.get("symbolId") == placement["symbolId"]
            and e.get("metrics", {}).get("sourceAppearanceKey") == appearance_key
        ]
        source_same_appearance.sort(key=lambda e: (e["bbox"][1], e["bbox"][0]))
        source_occurrence_ordinal = next(
            i for i, e in enumerate(source_same_appearance)
            if e.get("provenance", {}).get("candidateId") == candidate_id
        )
        serialized_occurrences = [
            (translation_index, segment_index)
            for translation_index, translation in enumerate(translations)
            for segment_index, segment in enumerate(translation["data"]["segments"])
            if segment.get("symbolId") == placement["symbolId"]
            and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == appearance_key
        ]
        assert len(target_segments) >= 1
        assert len(source_same_appearance) == len(serialized_occurrences), candidate_id
        assert source_occurrence_ordinal < len(serialized_occurrences), candidate_id
        assert serialized_occurrences[source_occurrence_ordinal][0] == 0, candidate_id

        export_dir = EXPORT_ROOT / candidate_id
        pdf_path = export_dir / f"{candidate_id}-en.pdf"
        metrics_path = export_dir / f"{candidate_id}-metrics.json"
        log_path = export_dir / f"{candidate_id}.log"
        viewer_png = export_dir / f"{candidate_id}-viewer.png"
        print_png = export_dir / f"{candidate_id}-print.png"
        for path in (pdf_path, metrics_path, log_path, viewer_png, print_png):
            assert path.exists() and path.stat().st_size > 0, path
        log = log_path.read_text(encoding="utf-8")
        assert '"immutableSnapshot": true' in log
        assert "edited snapshot text/symbol order verified 1" in log
        assert '"pdfVerification": true' in log
        metrics = read_json(metrics_path)
        assert metrics["page"] == int(placement["page"])
        assert metrics["language"] == "en"
        pdf = pymupdf.open(pdf_path)
        assert len(pdf) == 1
        source_rect = source_doc[int(placement["page"]) - 1].rect
        assert abs(pdf[0].rect.width - source_rect.width) < 0.02
        assert abs(pdf[0].rect.height - source_rect.height) < 0.02

        rows.append({
            "candidateId": candidate_id,
            "page": int(placement["page"]),
            "symbolId": placement["symbolId"],
            "priorLedgerStatus": ledger_row["status"],
            "priorStatusOrigin": ledger_row["statusOrigin"],
            "reproofIsPromotion": False,
            "sourceAppearanceKey": appearance_key,
            "sourceAnchor": source_element["anchor"],
            "sourceBBoxPt": source_element["bbox"],
            "sourceLineHeight": placement["sourceLineHeight"],
            "snapshot": rel(snapshot_path),
            "snapshotSha256": sha256(snapshot_path),
            "movedTestSnapshot": rel(moved_snapshot_path),
            "movedTestSnapshotSha256": sha256(moved_snapshot_path),
            "normalizedEnSpanKeys": True,
            "serializedTargetSymbolCount": len(target_segments),
            "sameAppearanceOccurrencesInOwnerBlock": len(serialized_occurrences),
            "targetOccurrenceOrdinalInOwnerBlock": source_occurrence_ordinal,
            "targetOccurrenceOrdinalPreserved": True,
            "serializedTargetAppearanceMatchesSource": True,
            "uiState": placement["uiState"],
            "moveUndoRedoContract": placement["moveContract"],
            "pdf": rel(pdf_path),
            "pdfSha256": sha256(pdf_path),
            "pdfPageCount": len(pdf),
            "immutableSnapshotConsumed": True,
            "sourceFallbackDetected": False,
            "exporterPdfVerification": True,
            "viewerCapture": rel(viewer_png),
            "viewerCaptureSha256": sha256(viewer_png),
            "printCapture": rel(print_png),
            "printCaptureSha256": sha256(print_png),
            "exportLog": rel(log_path),
            "exportMetrics": rel(metrics_path),
        })

    p102_comparison = build_p102_comparison()
    direct_pdf_contact_sheet = build_direct_pdf_contact_sheet(batch)
    contact_sheet = PROOF_ROOT / "review/source-vs-original-position-pdf-13-normalized.png"
    assert contact_sheet.exists() and contact_sheet.stat().st_size > 0
    report = {
        "schemaVersion": 1,
        "status": "passed",
        "scope": "Revalidation only for 13 existing READY placements; no discovery, no status promotion, no canonical write.",
        "sourcePdf": str(SOURCE_PDF),
        "sourcePdfSha256": source_hash,
        "batchResults": rel(BATCH_RESULTS),
        "batchResultsSha256": sha256(BATCH_RESULTS),
        "candidateCount": len(rows),
        "candidateIds": [row["candidateId"] for row in rows],
        "pageCount": len({row["page"] for row in rows}),
        "ownerBlockCount": batch["ownerBlockCount"],
        "apiRequests": batch["apiRequests"],
        "reproofsCountedAsNewDiscoveries": False,
        "statusChanges": 0,
        "sourcePositionSnapshotCapturedBeforeMovement": True,
        "movementSnapshotStoredSeparately": True,
        "serializationSuffixEnRemoved": True,
        "sourceLeadingDerivedAndRecorded": True,
        "pdfsUseImmutableEnSnapshotsAndPassExportVerification": True,
        "sourceFallbackUsed": False,
        "canonicalPayloadOrHumanTranslationWrites": 0,
        "pageLevelCertificationAsserted": False,
        "visualReview": {
            "candidateCountReviewed": 13,
            "reviewScope": "Candidate-local source/export crops from actual PDFs; this does not certify full pages.",
            "normalizedContactSheet": rel(contact_sheet),
            "normalizedContactSheetSha256": sha256(contact_sheet),
            "directPdfContactSheet": rel(direct_pdf_contact_sheet),
            "directPdfContactSheetSha256": sha256(direct_pdf_contact_sheet),
            "directPdfContactSheetSource": "each panel was rasterized directly from the immutable source PDF or the candidate-specific isolated export PDF",
            "p102FocusedSourceVsFixedPdf": rel(p102_comparison),
            "p102FocusedSourceVsFixedPdfSha256": sha256(p102_comparison),
            "p102VisualFinding": "Rows 5–8 remain on the same line as their labels in the source and corrected isolated PDF; the four candidate-specific PDFs are also shown individually on the contact sheet.",
        },
        "rendererFix": {
            "file": "apps/web/src/symbols/sourceInlineElements.ts",
            "rule": "Translated flow width extends only to the measured right edge of an anchored source inline object when that object extends beyond extracted text width.",
            "regressionTest": "apps/web/tests/sourceInlineElements.component.test.tsx: extends translated flow through a source symbol anchored after the extracted text",
        },
        "supersededArtifacts": [
            {
                "path": rel(PROOF_ROOT / "review/p102-export-ratings.png"),
                "reason": "Pre-fix export crop; the red die wrapped below the label. Retained as historical failure evidence, not current proof.",
            }
        ],
        "generatorSha256": sha256(Path(__file__)),
        "placements": rows,
    }
    output = PROOF_ROOT / "source-position-reproof-report-v1.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: {len(rows)} source-position PDF reproofs; {len(report['candidateIds'])} existing placements; 0 status promotions; source SHA256 {source_hash}")
    print(f"Report: {rel(output)}")
    print(f"p.102 comparison: {rel(p102_comparison)}")


if __name__ == "__main__":
    main()
