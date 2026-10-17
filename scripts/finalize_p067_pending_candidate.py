#!/usr/bin/env python3
"""Close one existing p.67 dice.white candidate without canonical writes."""

from __future__ import annotations

import csv
import copy
import hashlib
import io
import json
from collections import Counter
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/proofs/translation-readiness-2026-10-14"
PROOF_ROOT = OUTPUT / "native-vector-mask-p067-v99-pending-proof-v1"
TARGET_ROOT = PROOF_ROOT / "p067-v99-102-n4"
SOURCE_PDF = Path(r"C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf")
SOURCE_SHA256 = "a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351"
CANDIDATE_ID = "p067-v99-102-n4"
TARGET_SYMBOL = "dice.white"
SOURCE_APPEARANCE_KEY = "f922eb3ea21fad7fb0736645fa6fad858c9972cd0530707d62d2efe71fd392e1"
EXPECTED_CLEAN_MASK_SHA256 = "149e1c69402435751d37a9b004d4120133edd13f0b28035a69c7ac1a5f1b0568"
OUTLIER_ID = "p067-static-purple-die-text-reflow-collision"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def write_immutable(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != content:
            raise SystemExit(f"Refusing to overwrite different evidence: {rel(path)}")
        return
    path.write_bytes(content)


def union_rect(rectangles: list[pymupdf.Rect]) -> list[float]:
    return [
        min(rect.x0 for rect in rectangles),
        min(rect.y0 for rect in rectangles),
        max(rect.x1 for rect in rectangles),
        max(rect.y1 for rect in rectangles),
    ]


def intersection(first: list[float], second: list[float]) -> list[float] | None:
    x0, y0 = max(first[0], second[0]), max(first[1], second[1])
    x1, y1 = min(first[2], second[2]), min(first[3], second[3])
    return [x0, y0, x1, y1] if x1 > x0 and y1 > y0 else None


def find_word_bbox(page: pymupdf.Page, word: str, region: pymupdf.Rect) -> list[float]:
    matches = [
        list(item[:4])
        for item in page.get_text("words")
        if item[4] == word and pymupdf.Rect(item[:4]).intersects(region)
    ]
    if len(matches) != 1:
        raise SystemExit(f"Expected one {word!r} word in {tuple(region)}; found {len(matches)}")
    return matches[0]


def main() -> None:
    source_sha = sha256(SOURCE_PDF)
    assert source_sha == SOURCE_SHA256, "The exact source PDF used by the prepared patch is required."

    prior_path = OUTPUT / "readiness-ledger-v12.json"
    prior = read_json(prior_path)
    assert prior.get("scope", "").startswith("v12:")
    assert len(prior["placements"]) == 111
    assert prior["summary"]["canonicalPlacementsApplied"] == 0
    assert prior["summary"]["specialCompositionCasesExcluded"] == 6
    prior_rows = {item["candidateId"]: item for item in prior["placements"]}
    row = prior_rows[CANDIDATE_ID]
    assert row["status"] == "PENDING" and row["identityAndSlotConfirmed"] is False
    assert row["canonicalApplied"] is False

    candidate_input_path = TARGET_ROOT / "candidate-input.json"
    candidate_input = read_json(candidate_input_path)
    assert candidate_input["candidateId"] == CANDIDATE_ID
    assert candidate_input["symbolId"] == TARGET_SYMBOL
    assert candidate_input["sourcePdfSha256"] == source_sha
    assert candidate_input["exactCleanMaskSha256"] == EXPECTED_CLEAN_MASK_SHA256
    assert candidate_input["experiment"]["collateralChangedPixelsOutsideMask"] == 0
    assert candidate_input["experiment"]["imageXrefsPreserved"] is True

    original_snapshot_path = TARGET_ROOT / "snapshot/original-position-snapshot.json"
    snapshot = read_json(original_snapshot_path)
    assert snapshot["page"] == 67
    assert len(snapshot["translations"]) == 1
    translation = snapshot["translations"][0]
    assert translation["spanKey"] == "page_67_block_5"
    assert translation["language"] == "en"
    assert not translation["spanKey"].endswith("__en")
    assert abs(translation["data"]["lineHeight"] - 1.2) < 1e-9
    source_symbols = [
        segment for segment in translation["data"]["segments"]
        if segment.get("symbolId") == TARGET_SYMBOL
        and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == SOURCE_APPEARANCE_KEY
    ]
    assert len(source_symbols) == 1

    empty_state = read_json(TARGET_ROOT / "empty-state.json")
    empty_symbols = [
        segment
        for record in empty_state.get("records", [])
        for segment in record.get("segments", [])
        if segment.get("symbolId") == TARGET_SYMBOL
        and segment.get("symbolMetrics", {}).get("sourceAppearanceKey") == SOURCE_APPEARANCE_KEY
    ]
    assert not empty_symbols, "The target semantic token must be absent in the empty override."

    movement = read_json(TARGET_ROOT / "movement.json")
    assert movement["targetSourceAppearanceKey"] == SOURCE_APPEARANCE_KEY
    assert movement["undoRestored"] is True and movement["redoRestored"] is True
    assert movement["originalBboxPt"] != movement["movedBboxPt"]
    assert movement["originalSymbolKeys"][0].startswith(TARGET_SYMBOL + ":")
    assert movement["movedSymbolKeys"][-1].startswith(TARGET_SYMBOL + ":")
    cancel = read_json(TARGET_ROOT / "cancel-check.json")
    assert cancel == {"recordsAfterCancel": 0, "sourceAppearanceRestored": True, "apiRequestsAtCheckpoint": 0}

    proof_report = read_json(PROOF_ROOT / "proof-report.json")
    assert proof_report["sourcePdfSha256"] == source_sha
    assert proof_report["canonicalWrites"] == proof_report["payloadWrites"] == proof_report["translationWrites"] == 0
    assert proof_report["apiRequests"] == 0
    export_log = (TARGET_ROOT / "export.log").read_text(encoding="utf-8")
    assert '"immutableSnapshot": true' in export_log
    assert "edited snapshot text/symbol order verified 1" in export_log
    assert '"pdfVerification": true' in export_log
    export_metrics = read_json(TARGET_ROOT / "capture/export-metrics.json")
    assert export_metrics["page"] == 67 and export_metrics["language"] == "en"

    expected_capture_names = [
        "p067-isolated-pdf-page.png",
        "p067-source-vs-isolated-pdf-block-2_4x.png",
        "p067-source-target-search-crop.png",
        "p067-empty-target-search-crop.png",
        "viewer-empty-clean-mask.png",
        "viewer-moved-clean-mask.png",
        "export-viewer.png",
        "export-print.png",
    ]
    for name in expected_capture_names:
        assert (TARGET_ROOT / "capture" / name).is_file(), f"Missing reviewed visual evidence: {name}"

    source_doc = pymupdf.open(SOURCE_PDF)
    export_pdf_path = TARGET_ROOT / "p067-en-mask-v1.pdf"
    export_doc = pymupdf.open(export_pdf_path)
    try:
        assert len(source_doc) == 102 and len(export_doc) == 1
        source_page, export_page = source_doc[66], export_doc[0]
        assert tuple(round(v, 4) for v in source_page.rect) == tuple(round(v, 4) for v in export_page.rect)
        drawing_indices = [103, 104, 105]
        drawings = source_page.get_drawings()
        assert max(drawing_indices) < len(drawings)
        purple_rect = union_rect([drawings[index]["rect"] for index in drawing_indices])
        assert abs(purple_rect[0] - 287.93) < 0.05 and abs(purple_rect[2] - 299.42) < 0.05
        target_line = pymupdf.Rect(280, 455, 315, 480)
        source_two = find_word_bbox(source_page, "2", target_line)
        export_two = find_word_bbox(export_page, "2", target_line)
        overlap = intersection(purple_rect, export_two)
        assert overlap is not None
        overlap_area = (overlap[2] - overlap[0]) * (overlap[3] - overlap[1])
        assert overlap_area > 50
    finally:
        source_doc.close()
        export_doc.close()

    # There is no registered dice.purple placement on p.67 in the frozen 111.
    assert not any(item["page"] == 67 and item["symbolId"] == "dice.purple" for item in prior["placements"])
    outlier_path = PROOF_ROOT / "final-review/p067-static-purple-die-outlier.json"
    outlier = {
        "id": OUTLIER_ID,
        "classification": "confirmed export collision from a preserved source vector; outside the frozen 111 placement IDs; ownership unresolved",
        "report": rel(outlier_path),
        "candidateId": None,
        "page": 67,
        "sourceDrawingIndices": drawing_indices,
        "sourceDieBboxPt": purple_rect,
        "sourceText2BboxPt": source_two,
        "isolatedPdfText2BboxPt": export_two,
        "collisionIntersectionBboxPt": overlap,
        "collisionAreaPt2": overlap_area,
        "visualEvidence": rel(TARGET_ROOT / "capture/p067-source-vs-isolated-pdf-block-2_4x.png"),
        "remediated": False,
        "blocksPageLevelPass": True,
        "note": "The white-die patch is unrelated; the purple die remains fixed while the numeral 2 reflows into its bbox.",
    }
    write_immutable(outlier_path, json_bytes(outlier))

    visual_review = {
        "schemaVersion": 1,
        "candidateId": CANDIDATE_ID,
        "page": 67,
        "status": "READY in candidate scope; page-level PASS withheld",
        "reviewMethod": "Source PDF geometry, prepared sidecar, isolated Viewer/PDF, aligned source/empty crops, and independent read-only review.",
        "sourcePdfSha256": source_sha,
        "sourcePositionSnapshotSha256": sha256(original_snapshot_path),
        "isolatedPdfSha256": sha256(export_pdf_path),
        "replacementMaskSha256": sha256(TARGET_ROOT / "native-vector-clean-mask.png"),
        "originalMaskSha256": candidate_input["originalMaskSha256"],
        "sourceSlot": "WHITE | dice.white | 6",
        "emptyState": {
            "semanticTargetOccurrences": 0,
            "visualEvidence": [
                rel(TARGET_ROOT / "capture/p067-source-target-search-crop.png"),
                rel(TARGET_ROOT / "capture/p067-empty-target-search-crop.png"),
            ],
            "review": "The aligned source crop shows the target; the empty crop shows WHITE 6 with no target die or reliable mask rectangle.",
        },
        "reinsertion": "The immutable one-page EN PDF shows one target after WHITE and before 6.",
        "movementUndoRedoCancel": "passed; exact sourceAppearanceKey retained, undo/redo restore expected states, Cancel leaves no records and restores source appearance.",
        "nativeMask": {
            "collateralChangedPixelsOutsideMask": 0,
            "imageXrefsPreserved": True,
        },
        "independentReview": {
            "reviewer": "review_dice_families",
            "status": "READY recommended for this candidate only",
            "separateFinding": "The neighboring purple die overlaps the reflowed numeral 2; this does not change the white-die candidate status and blocks p.67 structural PASS.",
        },
        "pageLevelPassAsserted": False,
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "apiRequests": 0,
    }
    visual_review_path = PROOF_ROOT / "final-review/visual-review.json"
    write_immutable(visual_review_path, json_bytes(visual_review))

    closeout = {
        "schemaVersion": 1,
        "status": "one existing p.67 dice.white candidate promoted to READY; no page-level PASS",
        "candidateId": CANDIDATE_ID,
        "sourcePdfSha256": source_sha,
        "candidateInputSha256": sha256(candidate_input_path),
        "snapshotSha256": sha256(original_snapshot_path),
        "isolatedPdfSha256": sha256(export_pdf_path),
        "sourceSlot": "WHITE | dice.white | 6",
        "sourceLineHeight": candidate_input["sourceLineHeight"],
        "normalizedSnapshotKey": translation["spanKey"],
        "targetOccurrencesInSnapshot": len(source_symbols),
        "targetOccurrencesInEmptyOverride": len(empty_symbols),
        "movement": movement,
        "cancel": cancel,
        "mask": {
            "oldSha256": candidate_input["originalMaskSha256"],
            "replacementSha256": candidate_input["exactCleanMaskSha256"],
            "collateralChangedPixelsOutsideMask": 0,
            "imageXrefsPreserved": True,
        },
        "export": {
            "immutableSnapshot": True,
            "editedSnapshotTextSymbolOrderVerified": 1,
            "pdfVerification": True,
            "pages": 1,
            "language": "en",
        },
        "pageLevelFinding": outlier,
        "evidence": {
            "visualReview": rel(visual_review_path),
            "emptyCrop": rel(TARGET_ROOT / "capture/p067-empty-target-search-crop.png"),
            "sourceCrop": rel(TARGET_ROOT / "capture/p067-source-target-search-crop.png"),
            "sourceVsIsolatedPdf": rel(TARGET_ROOT / "capture/p067-source-vs-isolated-pdf-block-2_4x.png"),
            "fullIsolatedPdfPage": rel(TARGET_ROOT / "capture/p067-isolated-pdf-page.png"),
            "isolatedPdf": rel(export_pdf_path),
        },
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "pageLevelPassAsserted": False,
    }
    closeout_path = PROOF_ROOT / "final-review/p067-family-closeout-v1.json"
    write_immutable(closeout_path, json_bytes(closeout))

    updated = copy.deepcopy(prior)
    updated["scope"] = "v13: the same frozen 111 placements only; one existing p.67 placement gained candidate-specific evidence; no canonical activation."
    updated["generatedAt"] = "2026-10-14"
    updated["summary"]["candidateScopePlacementPromotionsThisLedger"] = [CANDIDATE_ID]
    updated["summary"]["candidateScopePlacementPromotionsInV13"] = [CANDIDATE_ID]
    updated["summary"]["sourceIdentityAndSlotConfirmed"] += 1
    updated["summary"]["technicallyReadyAndVisuallyValidated"] += 1
    updated["summary"]["technicallyPending"] -= 1
    updated["summary"]["confirmedOutliersOutside111"] += 1
    updated["summary"]["pageLevelStructuralPassWithheld"] = sorted(
        set(updated["summary"]["pageLevelStructuralPassWithheld"]) | {67}
    )
    updated["summary"]["pageLevelStructuralFindings"].append({
        "page": 67,
        "classification": "confirmed collision from a preserved purple source vector against reflowed text; vector ownership remains unresolved",
        "finding": (
            f"The fixed purple die at {purple_rect} pt overlaps the reflowed numeral 2 at {export_two} pt "
            f"by {overlap_area:.4f} pt². The target white die p067-v99-102-n4 passes only in candidate scope; "
            "this separate vector remains unremediated and blocks page-level structural PASS."
        ),
        "blocksPageLevelPass": True,
        "evidence": rel(TARGET_ROOT / "capture/p067-source-vs-isolated-pdf-block-2_4x.png"),
    })
    updated["summary"]["p067PendingFamilyProofCount"] = 1
    updated["summary"]["p067PendingFamilyProofCandidateIds"] = [CANDIDATE_ID]
    updated["summary"]["p067CandidateLevelVisualReviewPassed"] = True
    updated["summary"]["p067PageLevelStructuralPassAsserted"] = False
    updated["pageLevelOutliersOutside111"].append(outlier)
    updated["summary"]["confirmedOutliersOutside111"] = len(updated["pageLevelOutliersOutside111"])

    promoted = next(item for item in updated["placements"] if item["candidateId"] == CANDIDATE_ID)
    promoted["status"] = "READY"
    promoted["identityAndSlotConfirmed"] = True
    promoted["visualStatus"] = "technical-visual-validation-passed-with-neighbor-outlier-open"
    promoted["statusOrigin"] = "candidate-specific p.67 original-position proof and independent visual review; v13 promotion"
    promoted["reason"] = (
        "Promoted from PENDING after the exact native-vector mask changed zero pixels outside its area and preserved image xrefs; "
        "the normalized EN source-position snapshot retains exactly one dice.white with its sourceAppearanceKey in "
        "WHITE | dice.white | 6, and the aligned empty-state crop shows the slot cleared. The immutable one-page EN PDF "
        "passed exporter verification and shows the target once in the original slot. Movement, undo/redo and Cancel passed. "
        "A separate fixed purple die overlaps the reflowed numeral 2; it is outside this white-die patch and keeps p.67 "
        "without page-level structural PASS. Candidate-level READY only."
    )
    promoted["newProof"] = {
        "candidateInput": rel(candidate_input_path),
        "sourcePositionSnapshot": rel(original_snapshot_path),
        "isolatedPdf": rel(export_pdf_path),
        "exportLog": rel(TARGET_ROOT / "export.log"),
        "exportMetrics": rel(TARGET_ROOT / "capture/export-metrics.json"),
        "emptyState": rel(TARGET_ROOT / "empty-state.json"),
        "movement": rel(TARGET_ROOT / "movement.json"),
        "cancel": rel(TARGET_ROOT / "cancel-check.json"),
        "visualReview": rel(visual_review_path),
        "familyCloseout": rel(closeout_path),
    }
    promoted["candidateVisualReview"] = {
        "reviewer": "root plus independent read-only review_dice_families",
        "status": "candidate-ready; neighboring p.67 outlier remains open",
        "evidence": closeout["evidence"],
        "pageLevelPassAsserted": False,
    }

    counts = Counter(item["status"] for item in updated["placements"])
    assert counts == Counter({"READY": 76, "AESTHETIC_APPROVAL_PENDING": 3, "PENDING": 14, "BLOCKED": 18})
    assert sum(item["identityAndSlotConfirmed"] for item in updated["placements"]) == 79
    assert len({item["candidateId"] for item in updated["placements"]}) == 111
    assert updated["summary"]["canonicalPlacementsApplied"] == 0
    assert updated["summary"]["specialCompositionCasesExcluded"] == 6
    assert updated["summary"]["pageLevelStructuralPassWithheld"] == [45, 64, 65, 67, 68, 102]
    updated["verification"]["p067CandidateProof"] = {
        "status": "candidate_ready_page_pass_withheld",
        "proofReport": rel(PROOF_ROOT / "proof-report.json"),
        "visualReview": rel(visual_review_path),
        "familyCloseout": rel(closeout_path),
        "outlierReport": rel(outlier_path),
        "applicationTestsRerun": False,
        "reasonTestsNotRerun": "This proof-only slice changed no application code.",
    }

    json_path = OUTPUT / "readiness-ledger-v13.json"
    csv_path = OUTPUT / "readiness-ledger-v13.csv"
    markdown_path = OUTPUT / "readiness-ledger-v13.md"
    write_immutable(json_path, json_bytes(updated))
    fields = [
        "candidateId", "page", "symbolId", "status", "identityAndSlotConfirmed",
        "isolatedPatchPrepared", "appliedInDryRunSimulation", "canonicalApplied",
        "visualStatus", "statusOrigin", "reason",
    ]
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for item in updated["placements"]:
        writer.writerow({key: item.get(key, "") for key in fields})
    write_immutable(csv_path, buffer.getvalue().encode("utf-8"))

    summary = updated["summary"]
    markdown = f"""# MIDDARA — Ledger de prontidão para tradução (v13)

Atualizado em 2026-10-14. O ledger parte do v12 e mantém os mesmos 111 placements; não grava no canônico.

## Estado dos placements

- **{summary['technicallyReadyAndVisuallyValidated']} READY** no escopo individual dos candidatos.
- **{summary['aestheticApprovalPending']} aguardando aceite estético humano**, todos da p.92; textura sintética aproximada, não recuperação exata da arte.
- **{summary['technicallyPending']} pendentes** de evidência própria.
- **{summary['evidenceBlockedWithin111']} bloqueados**.
- **{summary['sourceIdentityAndSlotConfirmed']}** com identidade e slot confirmados.
- Total congelado: **{summary['totalPreparedPlacements']}**. As seis composições especiais continuam separadas e bloqueadas.

## Promoção individual da p.67

- `{CANDIDATE_ID}` (`{TARGET_SYMBOL}`): `WHITE` → dado → `6`. Já era PENDING entre os 111; nenhuma nova descoberta foi adicionada ao inventário.
- A máscara nativa substituta `{candidate_input['exactCleanMaskSha256']}` alterou zero pixels fora da região e preservou os image xrefs. O snapshot fonte EN usa `page_67_block_5`, sem `__en`, `lineHeight` derivado de **1,2**, uma ocorrência com o `sourceAppearanceKey` fonte e export imutável de uma página com `pdfVerification: true`.
- O recorte fonte mostra o dado no slot; o recorte vazio alinhado mostra `WHITE 6`, sem o alvo ou retângulo confiável. A reinserção aparece uma vez no PDF EN. Movimento, undo/redo e Cancel passaram; Cancel deixou zero registros e restaurou a aparência fonte. A revisão independente recomenda READY apenas para esse candidato.
- Evidências: [comparação legível fonte/estado vazio](native-vector-mask-p067-v99-pending-proof-v1/p067-v99-102-n4/capture/p067-source-target-search-crop.png), [slot vazio](native-vector-mask-p067-v99-pending-proof-v1/p067-v99-102-n4/capture/p067-empty-target-search-crop.png), [fonte/PDF isolado](native-vector-mask-p067-v99-pending-proof-v1/p067-v99-102-n4/capture/p067-source-vs-isolated-pdf-block-2_4x.png), [página PDF isolada](native-vector-mask-p067-v99-pending-proof-v1/p067-v99-102-n4/capture/p067-isolated-pdf-page.png), [PDF](native-vector-mask-p067-v99-pending-proof-v1/p067-v99-102-n4/p067-en-mask-v1.pdf), [fechamento](native-vector-mask-p067-v99-pending-proof-v1/final-review/p067-family-closeout-v1.json).

**A p.67 permanece sem PASS estrutural.** Um dado roxo fixo no fundo, sem placement `dice.purple` entre os 111 desta página, colide com o numeral `2` refluído: interseção de **{overlap_area:.4f} pt²**. O vetor e a palavra não foram alterados nesta prova. A colisão está registrada separadamente em [relatório do outlier](native-vector-mask-p067-v99-pending-proof-v1/final-review/p067-static-purple-die-outlier.json) e [recorte ampliado](native-vector-mask-p067-v99-pending-proof-v1/p067-v99-102-n4/capture/p067-source-vs-isolated-pdf-block-2_4x.png). Os demais placements e o `p067-v129-132-n4` bloqueado não foram aprovados por associação.

## Reconciliação preservada

- Detector: {summary['unmatchedSourceGlyphCandidatesDetected']} candidatos de glifo não correspondidos.
- {summary['initialPlacementCandidates']} candidatos iniciais + {summary['reconciledPlacementCandidates']} reconciliados = {summary['potentialPlacementsAfterReconciliation']} possibilidades.
- {summary['potentialPlacementsAfterReconciliation']} − {summary['specialCompositionCasesExcluded']} composições especiais = {summary['isolatedPatchPlacementsPrepared']} patches isolados preparados.
- O placement da p.67 já estava entre os 111: nenhum total de descoberta/patch foi incrementado. Aplicações canônicas: zero.

## Escopo e testes

Esta fatia alterou provas, ledger e a instrução de QA sobre checagem visual rasterizada; não alterou código do aplicativo, Payload, sidecars canônicos, PDF-fonte ou traduções humanas. A suíte não foi repetida porque não houve alteração de aplicação. O último resultado registrado continua: Web serial **203 aprovados, 2 ignorados, 0 falhas**, incluindo p.41 aprovado; build web/TypeScript passou com avisos; Admin integration 18/18. Admin E2E e lint permanecem sem confirmação, e a suíte inteira não está declarada aprovada. Veja o [resumo dos testes](native-vector-mask-p065-pending-proof-v2/final-review/test-summary-v1.json).

O script [`finalize_p067_pending_candidate.py`](../../scripts/finalize_p067_pending_candidate.py) valida o PDF-fonte, hashes, snapshot, export, movimento, Cancel, estado vazio e colisão da página; produz ledger JSON/CSV/Markdown imutáveis e o fechamento. Nenhum patch canônico, Payload ou tradução humana foi gravado; sem commit/push.
"""
    write_immutable(markdown_path, markdown.encode("utf-8"))

    print(json.dumps({
        "promoted": CANDIDATE_ID,
        "counts": {key: summary[key] for key in (
            "technicallyReadyAndVisuallyValidated", "aestheticApprovalPending", "technicallyPending",
            "evidenceBlockedWithin111", "sourceIdentityAndSlotConfirmed", "totalPreparedPlacements",
            "confirmedOutliersOutside111", "pageLevelStructuralPassWithheld",
        )},
        "ledger": rel(json_path),
        "closeout": rel(closeout_path),
        "outlier": rel(outlier_path),
        "canonicalWrites": 0,
        "payloadWrites": 0,
        "translationWrites": 0,
        "page67StructuralPassAsserted": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
