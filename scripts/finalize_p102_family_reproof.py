#!/usr/bin/env python3
"""Inventory three existing p.102 pending dice proofs and render PDF comparisons."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PROOF_ROOT = ROOT / "output/proofs/translation-readiness-2026-10-14/source-position-reproof-p102-v1"
VISUAL_REVIEW_PATH = PROOF_ROOT / "visual-review.json"
SOURCE_PDF = Path(r"C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
IDS = ["p102-v418-421-n4", "p102-v422-425-n4", "p102-v426-429-n4"]


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


def render_pdf_crop(page, bbox):
    margin_x, margin_y = 36, 10
    clip = pymupdf.Rect(
        max(0, bbox[0] - margin_x),
        max(0, bbox[1] - margin_y),
        min(page.rect.width, bbox[2] + margin_x),
        min(page.rect.height, bbox[3] + margin_y),
    )
    pix = page.get_pixmap(matrix=pymupdf.Matrix(4, 4), clip=clip, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples), [clip.x0, clip.y0, clip.x1, clip.y1]


def main() -> None:
    source_hash = sha256(SOURCE_PDF)
    assert source_hash == SOURCE_SHA256
    batch_path = PROOF_ROOT / "batch-results.json"
    batch = read_json(batch_path)
    assert batch["status"] == "completed"
    assert batch["pendingCount"] == 3 and batch["apiRequests"] == 0
    assert {x["candidateId"] for x in batch["placements"]} == set(IDS)

    ledger_path = ROOT / "output/proofs/translation-readiness-2026-10-14/readiness-ledger-v9.json"
    ledger = read_json(ledger_path)
    ledger_rows = {row["candidateId"]: row for row in ledger["placements"]}
    source_doc = pymupdf.open(SOURCE_PDF)
    tiles = []
    records = []

    for item in batch["placements"]:
        candidate_id = item["candidateId"]
        assert candidate_id in IDS
        assert item["uiState"] == "passed" and item["moveContract"] == "passed" and item["error"] is None
        assert item["cancelCheck"] == "passed"
        assert item["cancelRecordsAfter"] == 0 and item["cancelSourceTextRestored"] is True
        assert ledger_rows[candidate_id]["status"] == "PENDING"

        snapshot_path = PROOF_ROOT / "snapshots" / candidate_id / "snapshot.json"
        moved_snapshot_path = PROOF_ROOT / "snapshots" / candidate_id / "moved-test-snapshot.json"
        snapshot = read_json(snapshot_path)
        moved_snapshot = read_json(moved_snapshot_path)
        assert snapshot["verifyRenderedSnapshot"] is True
        assert snapshot["translations"] and all(t.get("language") == "en" for t in snapshot["translations"])
        assert all(not t.get("spanKey", "").endswith("__en") for t in snapshot["translations"])
        assert sha256(snapshot_path) != sha256(moved_snapshot_path)

        page_dir = PROOF_ROOT / "snapshots" / candidate_id / "pages" / "page_102"
        inline_doc = read_json(page_dir / "inline_elements.json")
        source_element = next(e for e in inline_doc["elements"] if e.get("provenance", {}).get("candidateId") == candidate_id)
        assert source_element["symbolId"] == item["symbolId"]
        source_key = source_element["metrics"]["sourceAppearanceKey"]
        target_segments = [
            segment
            for translation in snapshot["translations"]
            for segment in translation["data"]["segments"]
            if segment.get("symbolId") == item["symbolId"]
            and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == source_key
        ]
        assert len(target_segments) == 1

        export_dir = PROOF_ROOT / "exports" / candidate_id
        base = export_dir / candidate_id
        pdf_path = export_dir / f"{candidate_id}-en.pdf"
        log_path = export_dir / f"{candidate_id}.log"
        metrics_path = export_dir / f"{candidate_id}-metrics.json"
        cancel_capture = Path(item["cancelCapture"])
        assert all(path.exists() and path.stat().st_size for path in (pdf_path, log_path, metrics_path, cancel_capture))
        log = log_path.read_text(encoding="utf-8")
        assert '"immutableSnapshot": true' in log
        assert "edited snapshot text/symbol order verified 1" in log
        assert '"pdfVerification": true' in log
        metrics = read_json(metrics_path)
        assert metrics["page"] == 102 and metrics["language"] == "en"
        export_doc = pymupdf.open(pdf_path)
        assert len(export_doc) == 1
        source_page = source_doc[101]
        source_crop, crop_rect = render_pdf_crop(source_page, item["bbox"])
        export_crop, _ = render_pdf_crop(export_doc[0], item["bbox"])
        assert source_crop.size == export_crop.size
        tiles.append((candidate_id, source_crop, export_crop))

        reinserted_capture = Image.open(Path(item["reinsertedCapture"])).convert("RGB")
        cancelled_capture = Image.open(cancel_capture).convert("RGB")
        assert reinserted_capture.size == cancelled_capture.size
        cancel_diff = ImageChops.difference(reinserted_capture, cancelled_capture)
        cancel_changed_pixels = sum(
            1 for y in range(cancel_diff.height) for x in range(cancel_diff.width)
            if cancel_diff.getpixel((x, y)) != (0, 0, 0)
        )
        assert cancel_changed_pixels < reinserted_capture.width * reinserted_capture.height * 0.02

        records.append({
            "candidateId": candidate_id,
            "page": 102,
            "symbolId": item["symbolId"],
            "priorLedgerStatus": "PENDING",
            "statusPromotion": False,
            "finalLedgerStatus": "PENDING",
            "sourceAppearanceKey": source_key,
            "sourceAnchor": source_element["anchor"],
            "sourceBBoxPt": item["bbox"],
            "sourceLineHeight": item["sourceLineHeight"],
            "snapshot": rel(snapshot_path),
            "snapshotSha256": sha256(snapshot_path),
            "movementSnapshot": rel(moved_snapshot_path),
            "movementSnapshotSha256": sha256(moved_snapshot_path),
            "targetAppearanceCountInSnapshot": len(target_segments),
            "normalizedEnKey": True,
            "uiEmptyStateCapture": rel(Path(item["emptyCapture"])),
            "uiEmptyStateCaptureSha256": sha256(Path(item["emptyCapture"])),
            "uiReinsertedCapture": rel(Path(item["reinsertedCapture"])),
            "uiReinsertedCaptureSha256": sha256(Path(item["reinsertedCapture"])),
            "uiCancelCapture": rel(cancel_capture),
            "uiCancelCaptureSha256": sha256(cancel_capture),
            "cancelRecordsAfter": item["cancelRecordsAfter"],
            "cancelSourceTextRestored": item["cancelSourceTextRestored"],
            "cancelVsReinsertedChangedPixels": cancel_changed_pixels,
            "movedCapture": rel(Path(item["movedCapture"])),
            "movedCaptureSha256": sha256(Path(item["movedCapture"])),
            "pdf": rel(pdf_path),
            "pdfSha256": sha256(pdf_path),
            "pdfPageCount": len(export_doc),
            "exportLog": rel(log_path),
            "exportMetrics": rel(metrics_path),
            "immutableSnapshotConsumed": True,
            "sourceFallbackDetected": False,
            "exporterPdfVerification": True,
            "pdfCropRectPt": crop_rect,
        })

    gap, label_h, row_label_h = 12, 24, 25
    panel_width = max(source.width for _, source, _ in tiles)
    panel_height = max(max(source.height, export.height) for _, source, export in tiles)
    try:
        title_font = ImageFont.truetype(r"C:/Windows/Fonts/arial.ttf", 18)
    except OSError:
        title_font = ImageFont.load_default()
    width = panel_width * 2 + gap + 12
    row_height = row_label_h + label_h + panel_height + 8
    sheet = Image.new("RGB", (width, row_height * len(tiles) + 10), "#202124")
    draw = ImageDraw.Draw(sheet)
    for index, (candidate_id, source_crop, export_crop) in enumerate(tiles):
        y = 8 + index * row_height
        draw.text((6, y), candidate_id, fill="white", font=title_font)
        label_y = y + row_label_h
        draw.text((6, label_y), "PDF FONTE", fill="#dddddd", font=title_font)
        export_x = 6 + panel_width + gap
        draw.text((export_x, label_y), "PDF ISOLADO", fill="#dddddd", font=title_font)
        image_y = label_y + label_h
        sheet.paste(source_crop, (6, image_y))
        sheet.paste(export_crop, (export_x, image_y))

    comparison_path = PROOF_ROOT / "review/p102-pending-dice-source-vs-isolated-pdf.png"
    comparison_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(comparison_path, optimize=True)

    ui_tiles = []
    for item in batch["placements"]:
        candidate_id = item["candidateId"]
        ui_tiles.append((candidate_id, [
            Image.open(Path(item["emptyCapture"])).convert("RGB"),
            Image.open(Path(item["reinsertedCapture"])).convert("RGB"),
            Image.open(Path(item["cancelCapture"])).convert("RGB"),
        ]))
    ui_panel_width = max(im.width for _, panels in ui_tiles for im in panels)
    ui_panel_height = max(im.height for _, panels in ui_tiles for im in panels)
    ui_label_h, ui_row_label_h, ui_gap = 23, 25, 8
    ui_width = ui_panel_width * 3 + ui_gap * 4 + 12
    ui_row_h = ui_row_label_h + ui_label_h + ui_panel_height + 8
    ui_sheet = Image.new("RGB", (ui_width, ui_row_h * len(ui_tiles) + 10), "#202124")
    ui_draw = ImageDraw.Draw(ui_sheet)
    for index, (candidate_id, panels) in enumerate(ui_tiles):
        row_y = 8 + index * ui_row_h
        ui_draw.text((6, row_y), candidate_id, fill="white", font=title_font)
        labels_y = row_y + ui_row_label_h
        image_y = labels_y + ui_label_h
        for col, (label, panel) in enumerate(zip(("VAZIO", "REINSERIDO", "CANCELADO"), panels)):
            x = 6 + ui_gap + col * (ui_panel_width + ui_gap)
            ui_draw.text((x, labels_y), label, fill="#dddddd", font=title_font)
            ui_sheet.paste(panel, (x, image_y))
    ui_comparison_path = PROOF_ROOT / "review/p102-pending-dice-ui-empty-reinsert-cancel.png"
    ui_sheet.save(ui_comparison_path, optimize=True)

    full_pages = [("PDF FONTE", source_doc[101])]
    full_export_docs = []
    for candidate_id in IDS:
        pdf_path = PROOF_ROOT / "exports" / candidate_id / f"{candidate_id}-en.pdf"
        full_export_docs.append(pymupdf.open(pdf_path))
        full_pages.append((candidate_id, full_export_docs[-1][0]))
    page_scale = pymupdf.Matrix(1.2, 1.2)
    rendered_pages = []
    for label, page in full_pages:
        pix = page.get_pixmap(matrix=page_scale, alpha=False)
        rendered_pages.append((label, Image.frombytes("RGB", (pix.width, pix.height), pix.samples)))
    full_w = max(image.width for _, image in rendered_pages)
    full_h = max(image.height for _, image in rendered_pages)
    title_h, outer_gap = 32, 12
    full_sheet = Image.new("RGB", (full_w * 2 + outer_gap * 3, (full_h + title_h) * 2 + outer_gap * 3), "#202124")
    full_draw = ImageDraw.Draw(full_sheet)
    for index, (label, image) in enumerate(rendered_pages):
        col, row = index % 2, index // 2
        x = outer_gap + col * (full_w + outer_gap)
        y = outer_gap + row * (full_h + title_h + outer_gap)
        full_draw.text((x + 4, y + 3), label, fill="white", font=title_font)
        full_sheet.paste(image, (x, y + title_h))
    full_page_path = PROOF_ROOT / "review/p102-full-page-source-and-three-isolated-pdfs.png"
    full_sheet.save(full_page_path, optimize=True)

    visual_review = None
    if VISUAL_REVIEW_PATH.exists():
        visual_review = read_json(VISUAL_REVIEW_PATH)
        assert visual_review["status"].startswith("technical-ready")
        assert visual_review["pageLevelPassAsserted"] is False
        assert visual_review["sourcePdfSha256"] == source_hash
        assert visual_review["canonicalWrites"] == visual_review["payloadWrites"] == visual_review["translationWrites"] == visual_review["apiRequests"] == 0
        review_targets = {item["candidateId"]: item for item in visual_review["targets"]}
        report_targets = {item["candidateId"]: item for item in records}
        assert set(review_targets) == set(report_targets) == set(IDS)
        for evidence_key, report_key in (
            ("sourceVsIsolatedPdf", "comparisonImage"),
            ("fullPageSourceAndExports", "fullPageComparison"),
            ("emptyReinsertCancel", "uiStateComparison"),
        ):
            evidence = visual_review["evidence"][evidence_key]
            evidence_path = ROOT / evidence["path"]
            assert evidence_path.exists() and sha256(evidence_path) == evidence["sha256"]
            assert evidence["sha256"] == {
                "comparisonImage": sha256(comparison_path),
                "fullPageComparison": sha256(full_page_path),
                "uiStateComparison": sha256(ui_comparison_path),
            }[report_key]
        for candidate_id in IDS:
            review_target = review_targets[candidate_id]
            report_target = report_targets[candidate_id]
            assert review_target["isolatedPdf"] == report_target["pdf"]
            assert review_target["isolatedPdfSha256"] == report_target["pdfSha256"]
            checks = review_target["checks"]
            assert all(checks[key] is True for key in (
                "emptyStateNoTargetGhost",
                "targetAppearsOnceInOriginalSlot",
                "cancelLeavesNoEnRecordsAndRestoresSourceText",
                "immutableEnSnapshotAndPdfVerification",
            ))
            assert checks["neighboringContentCovered"] is False
            assert checks["visibleCollisionOrPageDisplacement"] is False
            assert checks["sourceFallbackDetected"] is False
            report_target["statusPromotion"] = True
            report_target["finalLedgerStatus"] = "READY"

    report = {
        "schemaVersion": 1,
        "status": "candidate-level-visual-review-passed" if visual_review else "proofs-generated-awaiting-visual-review",
        "scope": "Three existing p.102 PENDING placements only; no candidate discovery. A READY recommendation is limited to these individual placements; no page-level PASS.",
        "sourcePdfSha256": source_hash,
        "batchResults": rel(batch_path),
        "batchResultsSha256": sha256(batch_path),
        "candidateCount": len(records),
        "apiRequests": batch["apiRequests"],
        "canonicalPayloadOrHumanTranslationWrites": 0,
        "sourceFallbackDetected": False,
        "comparisonImage": rel(comparison_path),
        "comparisonImageSha256": sha256(comparison_path),
        "uiStateComparison": rel(ui_comparison_path),
        "uiStateComparisonSha256": sha256(ui_comparison_path),
        "fullPageComparison": rel(full_page_path),
        "fullPageComparisonSha256": sha256(full_page_path),
        "manualVisualReviewRequired": visual_review is None,
        "visualReview": str(VISUAL_REVIEW_PATH.relative_to(ROOT)).replace("\\", "/") if visual_review else None,
        "visualReviewSha256": sha256(VISUAL_REVIEW_PATH) if visual_review else None,
        "statusPromotions": IDS if visual_review else [],
        "placements": records,
        "generatorSha256": sha256(Path(__file__)),
    }
    report_path = PROOF_ROOT / "p102-family-reproof-report-v1.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: generated proof inventory for {len(records)} existing p.102 placements; visual review={'passed' if visual_review else 'pending'}; promotions={len(report['statusPromotions'])}")
    print(f"Contact sheet: {rel(comparison_path)}")
    print(f"Report: {rel(report_path)}")


if __name__ == "__main__":
    main()
