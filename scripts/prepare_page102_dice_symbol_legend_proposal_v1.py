"""Prepare the p.102 dice-symbol legend as four geometry-preserving units.

The extracted PDF stores four labels as separate text fragments on one shared
baseline. The v2 proposal models each existing source fragment as a typographic
unit, so PT-BR can preserve its original x slots without spacing hacks.

Dry-run by default. --apply writes only additive source-unit metadata, the local
proposal, and proposal queue; it does not write Payload translations, human
reviews, or glossary decisions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = ROOT / "apps/web/public/pages/page_102"
DOM_PATH = PAGE_DIR / "page_102_dom.json"
BACKGROUND_PATH = PAGE_DIR / "background.webp"
PDF_PATH = Path(r"C:\Users\bruno\Middara\Rulebook 1.2\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
PROPOSAL_PATH = ROOT / "docs/translations/proposals/page-102-dice-symbol-legend-proposal-2026-10-17-v2.json"
QUEUE_PATH = ROOT / "docs/translations/localization-exceptions.json"
PROPOSAL_REL = PROPOSAL_PATH.relative_to(ROOT).as_posix()
BURST_EXCEPTION_ID = "P102-DTP-COPYFIT-DICE-BURST-1"
BLOCK_ID = "block_21"
EXPECTED_LABELS = ("DICE SYMBOLS:", "BOOK", "SHIELD", "BURST")
UNIT_IDS = (
    "p102-dice-symbols-title",
    "p102-dice-symbol-book",
    "p102-dice-symbol-shield",
    "p102-dice-symbol-burst",
)
TARGETS = ("SÍMBOLOS DOS DADOS:", "LIVRO", "ESCUDO", "EXPLOSÃO")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def visual_baseline_count(pdf_path: Path) -> tuple[int, list[float]]:
    expected = set(EXPECTED_LABELS)
    baselines: list[float] = []
    with pymupdf.open(pdf_path) as document:
        page = document[101]
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = " ".join(span.get("text", "").strip() for span in line.get("spans", [])).strip()
                if text not in expected:
                    continue
                if tuple(round(value, 2) for value in line.get("dir", (1, 0))) != (1, 0):
                    raise ValueError(f"Unexpected text direction for source line {text!r}")
                visible_spans = [span for span in line.get("spans", []) if span.get("text", "").strip()]
                if len(visible_spans) != 1:
                    raise ValueError(f"Unexpected PDF visible-span grouping for source line {text!r}")
                baselines.append(float(visible_spans[0]["origin"][1]))
    groups: list[float] = []
    for baseline in sorted(baselines):
        if not groups or abs(baseline - groups[-1]) > 0.5:
            groups.append(baseline)
    if len(baselines) != len(expected) or len(groups) != 1:
        raise ValueError(f"Expected four source fragments on one visual baseline; got {baselines}")
    return len(groups), groups


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if not PDF_PATH.is_file():
        raise FileNotFoundError(PDF_PATH)
    dom = json.loads(DOM_PATH.read_text(encoding="utf-8"))
    block_index = next((index for index, block in enumerate(dom["blocks"]) if block["id"] == BLOCK_ID), None)
    if block_index is None:
        raise ValueError(f"Source block {BLOCK_ID} is missing")
    block = dom["blocks"][block_index]
    lines = block.get("lines", [])
    if len(lines) != 4 or tuple(
        " ".join(span.get("text", "").split())
        for line in lines
        for span in line.get("spans", [])
        if span.get("text", "").strip()
    ) != EXPECTED_LABELS:
        raise ValueError("Unexpected source line order or labels in the DOM")
    dom_baselines = {
        round(next(span["origin"][1] for span in line["spans"] if span.get("origin")), 2)
        for line in lines
    }
    if len(dom_baselines) != 1:
        raise ValueError("The source DOM fragments no longer share one visual baseline")
    source_line_count, source_baselines = visual_baseline_count(PDF_PATH)
    if source_line_count != 1:
        raise ValueError(f"Expected one source visual line, found {source_line_count}")

    word_boxes: dict[str, tuple[float, float, float, float]] = {}
    with pymupdf.open(PDF_PATH) as document:
        for word in document[101].get_text("words"):
            normalized = word[4].upper().strip()
            same_row = abs(float(word[1]) - float(block["bbox"][1])) <= 0.5
            if same_row and normalized in {"DICE", "SYMBOLS:", "BOOK", "SHIELD", "BURST"}:
                word_boxes[normalized] = tuple(float(value) for value in word[:4])
    required_words = {"DICE", "SYMBOLS:", "BOOK", "SHIELD", "BURST"}
    if set(word_boxes) != required_words:
        raise ValueError(f"Could not isolate the source label word boxes: {sorted(word_boxes)}")
    title_bbox = (
        word_boxes["DICE"][0], word_boxes["DICE"][1],
        word_boxes["SYMBOLS:"][2], word_boxes["DICE"][3],
    )
    visible_bboxes = [title_bbox, word_boxes["BOOK"], word_boxes["SHIELD"], word_boxes["BURST"]]
    starts = [bbox[0] for bbox in visible_bboxes]
    right_edge = float(block["bbox"][2])
    widths = [starts[index + 1] - starts[index] for index in range(3)] + [right_edge - starts[-1]]
    if any(width <= 0 for width in widths):
        raise ValueError(f"Invalid source slot widths: {widths}")

    page_dom_changed = False
    units = []
    candidates = []
    for index, (line, label, unit_id, target, visible_bbox, slot_x, slot_width) in enumerate(
        zip(lines, EXPECTED_LABELS, UNIT_IDS, TARGETS, visible_bboxes, starts, widths, strict=True)
    ):
        unit = {
            "id": unit_id,
            "label": f"p.102 · {label}",
            "fixedPosition": True,
            "field": {
                "id": f"{unit_id}-field",
                "lineIds": [line["id"]],
                "bbox": line["bbox"],
                "frame": {
                    "x": slot_x,
                    "width": slot_width,
                    "textAlign": "left",
                    "lineHeight": 1,
                },
            },
        }
        units.append(unit)
        span_key = f"page_{dom['page_number']}_unit_{unit_id}__pt-BR"
        primary_span = next(span for span in line.get("spans", []) if span.get("text", "").strip())
        source_text = label
        segments = [{
            "text": target,
            "font": primary_span["font"],
            "size": primary_span["size"],
            "weight": 700,
            "style": "normal",
            "color": primary_span["color"],
            "disableLigatures": True,
        }]
        candidate = {
            "blockIndex": block_index,
            "sourceBlockId": BLOCK_ID,
            "sourceUnitId": unit_id,
            "spanKey": span_key,
            "language": "pt-BR",
            "sourceText": source_text,
            "sourcePdfVisualLineCount": 1,
            "sourcePdfBaselineGroupId": "p102-dice-symbols-legend-row",
            "sourcePdfLineIds": [[line["id"]]],
            "sourceBboxes": [list(visible_bbox)],
            "proposalText": target,
            "data": {
                "schemaVersion": 2,
                "spanKey": span_key,
                "bbox": line["bbox"],
                "textAlign": "left",
                "lineHeight": 1,
                "lineHeightMode": "source",
                "segments": segments,
                "managedSourceSymbols": [],
            },
            "technicalStatus": "validated_live_viewer_exact_line_count_and_frame_fit_100_200"
                if label != "BURST" else "pending_live_viewer_copyfit_v3_editor_pdf",
            "editorialStatus": "pending_human_review",
            "diagnosticRendering": "proposal",
            "pendingTerms": [
                f"{label} → {target} is a local proposal, not an approved glossary decision."
            ],
            "sourceSlotPt": {"x": slot_x, "width": slot_width, "visibleSourceTextBbox": list(visible_bbox)},
        }
        if label != "BURST":
            candidate["pageRendererVisualLineCount"] = 1
            candidate["copyfitClassification"] = "EXACT"
            candidate["copyfitEvidence"] = [
                "Official source PDF and PT-BR PageRenderer each render this label on one visual baseline (EXACT).",
                "The live Viewer at 100% and 200% keeps the translated label inside its source slot without clipping or collision.",
                "Source font family, 10 pt size, weight, color, x/y slot, and sibling ordering are preserved.",
            ]
        candidates.append(candidate)

    if block.get("typographicUnits"):
        if block["typographicUnits"] != units:
            prior_without_position = json.loads(json.dumps(block["typographicUnits"]))
            for prior_unit in prior_without_position:
                prior_unit.pop("fixedPosition", None)
            expected_without_position = json.loads(json.dumps(units))
            for expected_unit in expected_without_position:
                expected_unit.pop("fixedPosition", None)
            if prior_without_position != expected_without_position:
                raise ValueError("block_21 already has different typographic units; refusing to replace them")
            block["typographicUnits"] = units
            page_dom_changed = True
    else:
        block["typographicUnits"] = units
        page_dom_changed = True
    proposal = {
        "proposalId": "p102-dice-symbol-legend",
        "version": "2",
        "title": "Símbolos dos Dados — legenda da p.102",
        "page": 102,
        "status": "pending_live_viewer_copyfit_v3_editor_pdf_human_review",
        "copyfitRevisionBudget": {
            "naturalRevisionAttempts": 3,
            "initialDraftAttempt": 1,
            "revisionsUsed": 0,
        },
        "sourcePdf": PDF_PATH.name,
        "sourceHashes": {
            "sourcePdf": sha256(PDF_PATH),
            "background": sha256(BACKGROUND_PATH),
            "pageDom": sha256(DOM_PATH),
        },
        "counts": {
            "candidates": len(candidates),
            "existingHumanTranslationsPreserved": 0,
            "priorReviewRecordsPreserved": 0,
            "finalTranslationWrites": 0,
            "openExceptions": 0,
        },
        "scopeLimits": [
            "This proposal covers only the DICE SYMBOLS / BOOK / SHIELD / BURST legend row. Other p.102 labels, diagram symbols, and prose remain separate units.",
            "Four existing source fragments are grouped as separate typographic units on one shared baseline; each PT frame starts at the source word x-coordinate and ends at the next source word slot. No spacing characters or font/frame edits force line count.",
            "The original 10 pt Optima hierarchy, color, source block ID, line IDs, and source glyph geometry are preserved. Three translated siblings pass one-line frame fit in the live Viewer; the BURST PT diagnostic region is blank under an open DTP exception. PDF export remains pending.",
            "No human translation, human decision, final PT-BR value, or Payload record was modified.",
        ],
        "candidates": candidates,
        "note": f"The source PDF and DOM fragments group to one visual baseline at y={source_baselines[0]:.2f} pt. Three PT-BR labels pass exact line-count and source-slot fit; BURST remains a complete proposal with a blank diagnostic PT region because EXPLOSÃO overflows its original slot.",
        "revisions": [{
            "revision": 1,
            "result": "v1 single-frame layout failed Copyfit V3: one source baseline became two PageRenderer rows; EXPLOSÃO escaped the frame at 100% and 200%.",
            "decision": "Split the already separate source text fragments into four existing typographic-unit structures, preserving their source x slots and shared baseline. This is an additive metadata change; no source text, IDs, art, existing translation, or Payload record is changed.",
            "rollback": "Remove the added typographicUnits array from block_21 and use the preserved v1 proposal; no other source DOM fields were modified.",
        }],
    }

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    if PROPOSAL_REL not in queue.setdefault("sourceProposals", []):
        queue["sourceProposals"].append(PROPOSAL_REL)
    queue_items = queue.setdefault("items", [])
    if any(candidate["sourceUnitId"] == "p102-dice-symbol-burst" for candidate in candidates):
        burst_candidate = next(candidate for candidate in candidates if candidate["sourceUnitId"] == "p102-dice-symbol-burst")
        burst_candidate["technicalStatus"] = "failed_dtp_frame_overflow"
        burst_candidate["diagnosticRendering"] = "blank PT-BR field in the diagnostic Viewer; no English fallback; the complete proposal remains available in review."
        burst_candidate["pageRendererVisualLineCount"] = 1
        burst_candidate["copyfitClassification"] = "EXACT line count; failed horizontal frame fit"
        proposal["counts"]["openExceptions"] = 1
        proposal["status"] = "pending_dtp_exception_and_human_review"
        proposal["revisions"].append({
            "revision": 2,
            "result": "The live Viewer confirmed the four source fragments share one baseline. Initial PT measurement exposed cumulative vertical reflow and horizontal overflow for EXPLOSÃO.",
            "decision": "Mark the four same-baseline typographic units fixed-position so they do not flow sequentially. Keep the full EXPLOSÃO proposal, open a unit-scoped DTP exception, and blank only that PT diagnostic field.",
            "measurement": "PDF 1 visual line; PageRenderer PT-BR 1 visual line (EXACT). At 200%, the source slot is 19.60 CSS px and EXPLOSÃO measures about 30.075 px; no font or frame change is permitted.",
            "rollback": "Remove the p.102 burst exception by ID and restore the proposal candidate's previous diagnosticRendering/technicalStatus. Remove fixedPosition from the four p.102 legend units only if the units are no longer co-baseline fixed labels."
        })
        queue_items[:] = [item for item in queue_items if item.get("id") != BURST_EXCEPTION_ID]
        queue_items.append({
            "id": BURST_EXCEPTION_ID,
            "page": 102,
            "spanKey": burst_candidate["spanKey"],
            "sourceBlockId": BLOCK_ID,
            "bboxPt": [burst_candidate["sourceBboxes"][0]],
            "category": "dtp_copyfit_frame_overflow",
            "status": "open",
            "priority": 2,
            "reason": "A proposta semanticamente completa EXPLOSÃO ocupa uma linha visual, mas ultrapassa em 16,8 pt a moldura original de 31,56 pt. Não reduzir a fonte nem alterar a moldura para esconder o problema; manter a redação integral para decisão editorial/DTP.",
            "diagnosticRendering": "blank whole PT-BR unit only in the diagnostic Viewer; no English fallback; preserve the complete proposal in the review panel.",
            "sourceText": burst_candidate["sourceText"],
            "proposedText": burst_candidate["proposalText"],
            "evidence": [
                "Source PDF visual-line count: 1; PageRenderer PT-BR visual-line count: 1 (EXACT), measured from rendered text rectangles grouped by visual row.",
                "At 100%: frame 9.80 CSS px, rendered text about 15.04 px (+5.24 px). At 200%: frame 19.60 px, rendered text about 30.075 px (+10.475 px); equivalent text width about 48.5 pt against the 31.56 pt source slot.",
                "No collision observed. Overflow alone fails technical fit; the proposal is not approved and no final translation or Payload value was written.",
                "No font, size, source geometry, human translation, or approval was changed."
            ]
        })
    queue["updated"] = date.today().isoformat()

    proposal["sourceHashes"] = {
        "sourcePdf": sha256(PDF_PATH),
        "background": sha256(BACKGROUND_PATH),
        "pageDom": hashlib.sha256(json.dumps(dom, ensure_ascii=False, indent=2).encode("utf-8")).hexdigest().upper(),
    }
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "proposal": PROPOSAL_REL,
                      "sourceUnitCount": source_line_count, "sourceBaselinePt": source_baselines[0],
                      "addedTypographicUnits": page_dom_changed, "sourceSlotWidthsPt": widths,
                      "proposalCandidates": [{"sourceUnitId": c["sourceUnitId"], "spanKey": c["spanKey"], "proposalText": c["proposalText"]} for c in candidates],
                      "payloadWrites": 0}, ensure_ascii=False, indent=2))
    if args.apply:
        if page_dom_changed:
            DOM_PATH.write_text(json.dumps(dom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            proposal["sourceHashes"]["pageDom"] = sha256(DOM_PATH)
        PROPOSAL_PATH.write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
