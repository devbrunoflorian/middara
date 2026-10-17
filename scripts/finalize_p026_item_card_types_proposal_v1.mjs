#!/usr/bin/env node
/** Close out the read-only p.26 proposal while preserving the snapshot-only blocked body. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const proposalRel = 'docs/translations/proposals/page-026-item-card-types-proposal-2026-10-16-v1.json';
const markdownRel = 'docs/translations/proposals/page-026-item-card-types-proposal-2026-10-16-v1.md';
const exceptionRel = 'docs/translations/localization-exceptions.json';
const statusRel = 'docs/translations/page-status.csv';
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1';
const progressRel = 'docs/project-progress/2026-10-16-p026-item-card-types-proposal-v1.md';
const finalizationRel = proofRel + '/finalization-v1.json';
const pdfRel = proofRel + '/page-026-pt-BR-diagnostic-v6.pdf';
const pdfReceiptRel = proofRel + '/pdf-verification-v1.json';
const pdfVerifierRel = 'scripts/verify_p026_item_card_types_pdf_v1.py';
const sidecarRel = 'apps/web/public/pages/page_026/fidelity_overlays.json';
const readJson = async rel => JSON.parse(await readFile(resolve(root, rel), 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const mustExist = async rel => access(resolve(root, rel));
const union = boxes => {
  const valid = boxes.filter(box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite));
  assert.ok(valid.length, 'Expected at least one source box.');
  return [
    Math.min(...valid.map(box => box[0])), Math.min(...valid.map(box => box[1])),
    Math.max(...valid.map(box => box[2])), Math.max(...valid.map(box => box[3])),
  ];
};
const domBlockUnion = (dom, ids) => union(ids.map(id => {
  const block = dom.blocks.find(item => item.id === id);
  assert.ok(block, 'Missing source DOM block ' + id);
  return block.bbox;
}));
const csvField = value => '"' + String(value).replaceAll('"', '""') + '"';
const replaceOnce = (source, needle, replacement, label) => {
  assert.equal(source.split(needle).length - 1, 1, 'Expected one ' + label + ' match.');
  return source.replace(needle, replacement);
};

const proposal = await readJson(proposalRel);
const viewerEditor = await readJson(proofRel + '/viewer-editor-receipt-v3.json');
const metrics = await readJson(proofRel + '/pdf-metrics-diagnostic-v6.json');
const blankReceipt = await readJson(proofRel + '/diagnostic-blank-receipt-v1.json');
const overlayApplication = await readJson(proofRel + '/ornament-overlay-canonical-application-v1.json');
const overlayPreparation = await readJson(proofRel + '/ornament-overlay-receipt-v1.json');
const queue = await readJson(exceptionRel);
const dom = await readJson('apps/web/public/pages/page_026/page_026_dom.json');
const canonicalSidecarBytes = await readFile(resolve(root, sidecarRel));
const snapshotBytes = await readFile(resolve(root, proofRel + '/snapshot-diagnostic-v5/snapshot.json'));

execFileSync('python', [resolve(root, pdfVerifierRel), resolve(root, pdfRel)], { cwd: root, stdio: 'inherit' });
const pdfReceipt = await readJson(pdfReceiptRel);

assert.equal(proposal.page, 26);
assert.equal(proposal.candidates.length, 15);
assert.equal(proposal.artworkExceptions.length, 8);
assert.equal(proposal.technicalExceptions.length, 1);
assert.equal(viewerEditor.status, 'passed_live_viewer_readonly_editor_with_diagnostic_blank_units');
assert.equal(viewerEditor.candidateCount, 15);
assert.equal(viewerEditor.renderedCandidateCount, 15);
assert.equal(viewerEditor.editorVerifiedCandidateCount, 15);
assert.equal(viewerEditor.editorBoundaryMismatchCount, 0);
assert.equal(viewerEditor.viewerMissing.length, 0);
assert.equal(viewerEditor.blockedEnglishPresent.length, 0);
assert.equal(viewerEditor.blankTargetChecks.length, 3);
assert.ok(viewerEditor.blankTargetChecks.every(item => item.targetCount === 1 && item.visibleText.length === 0));
assert.equal(viewerEditor.payload.beforeCount, 0);
assert.equal(viewerEditor.payload.afterCount, 0);
assert.equal(viewerEditor.payload.unchanged, true);
assert.equal(viewerEditor.payloadLayoutFrames.beforeCount, 0);
assert.equal(viewerEditor.payloadLayoutFrames.afterCount, 0);
assert.equal(viewerEditor.observedApiMethods.join(','), 'GET');
assert.equal(viewerEditor.blockedMutations.length, 0);
assert.equal(viewerEditor.consoleErrors.length, 0);
assert.equal(viewerEditor.pageErrors.length, 0);
assert.equal(viewerEditor.saveClicked, false);
assert.equal(viewerEditor.canonicalAssetsUnchanged, true);
assert.equal(blankReceipt.payloadWrites, 0);
assert.deepEqual(blankReceipt.blankedSpanKeys, viewerEditor.blankTargetChecks.map(item => item.spanKey));
assert.equal(overlayApplication.status, 'applied_and_rollback_preserved');
assert.equal(overlayApplication.sourcePdfSha256, proposal.sourcePdfSha256);
assert.equal(sha256(canonicalSidecarBytes), overlayApplication.sidecarSha256After);
assert.equal(pdfReceipt.status, 'passed_single_page_pdf_export_and_blocked_body_absence_check');
assert.equal(pdfReceipt.pages, 1);
assert.deepEqual(pdfReceipt.pageSizePt, [820.346, 820.346]);
assert.equal(pdfReceipt.verifiedCandidateCount, 15);
assert.deepEqual(pdfReceipt.missingCandidateSpanKeys, []);
assert.equal(pdfReceipt.blockedEnglishBodyAbsent, true);
assert.equal(pdfReceipt.blockedProposedBodyAbsent, true);
assert.equal(pdfReceipt.replacementCharacters, 0);
assert.equal(pdfReceipt.privateUseCharacters, 0);
assert.equal(metrics.page, 26);
assert.equal(metrics.language, 'pt-BR');
assert.equal(metrics.viewer.pageWidthPt, 820.3460083007812);
assert.equal(metrics.print.pageWidthPt, 820.3460083007812);
assert.equal(queue.items.length, 139);
assert.equal(queue.items.filter(item => item.page === 26).length, 0);
assert.equal(new Set(queue.items.map(item => item.id)).size, queue.items.length);
assert.equal(proposal.sourcePdfSha256, 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351');

const candidateKeys = new Set(viewerEditor.editorChecks
  .filter(check => check.selected && check.proposalMatched && check.editable && check.cancelled)
  .map(check => check.spanKey));
assert.equal(candidateKeys.size, 15);
assert.ok(proposal.candidates.every(candidate => candidateKeys.has(candidate.spanKey)));
const printTargetsByKey = new Map(metrics.print.translationTargets.map(item => [item.spanKey, item]));
const printCandidateTargets = proposal.candidates.map(candidate => {
  const key = candidate.spanKey.endsWith('__pt-BR') ? candidate.spanKey : candidate.spanKey + '__pt-BR';
  const target = printTargetsByKey.get(key);
  assert.ok(target && target.text === candidate.proposalText, 'Missing copyfit measurement for ' + candidate.spanKey);
  return target;
});
const rightBottomExcess = Math.max(...printCandidateTargets.flatMap(target => [
  target.edgeExcessPt.right, target.edgeExcessPt.bottom,
]));
assert.ok(rightBottomExcess <= 0.01, 'A candidate extends beyond the right/bottom frame edge.');
for (const candidate of proposal.candidates) {
  candidate.status = 'technically_verified_pending_human_review';
  candidate.technicalStatus = 'verified_in_viewer_readonly_editor_copyfit_and_pdf';
  candidate.editorialStatus = 'pending_human_review';
  candidate.diagnosticRendering = 'proposal';
  candidate.verifiedIn = ['PT-BR Viewer v6', 'read-only Admin Editor v3', 'isolated PT-BR PDF v6 and raster'];
}

const blankedSpanKeys = viewerEditor.blankTargetChecks.map(item => item.spanKey);
const bodyException = proposal.technicalExceptions[0];
bodyException.reason = 'A proposta integral em PT-BR está preservada neste JSON e será registrada na fila. O Editor não seleciona o corpo completo como uma unidade, e a unidade-fonte divide o texto em três regiões tipográficas não contíguas. No snapshot diagnóstico PT-BR, somente essas três regiões ficam vazias: não aparece fallback em inglês nem tradução parcial, e o fundo original permanece visível.';
bodyException.requiredAction = 'Disponibilizar uma unidade editável selecionável para o corpo completo, preservando a ênfase inline; então validar no Viewer, Editor somente leitura e PDF de uma página.';
bodyException.diagnosticRendering = 'blank_in_snapshot_only';
bodyException.blankedSpanKeys = blankedSpanKeys;
bodyException.fullProposedTextPreserved = true;
bodyException.sourceBboxPt = domBlockUnion(dom, bodyException.sourceBlockIds);

proposal.status = 'partial_editable_text_proposal_v1_15_units_viewer_editor_pdf_copyfit_verified_human_review_pending_artwork_and_structure_exception';
proposal.counts = {
  candidates: 15,
  verifiedInViewer: 15,
  verifiedInEditor: 15,
  verifiedInPdf: 15,
  preservedHumanRecords: 0,
  artworkExceptions: 8,
  technicalExceptions: 1,
};
proposal.sourceReview.status = 'official_pdf_viewer_and_single_page_english_export_compared_2026-10-16';
proposal.sourceReview.fidelityNote = 'A página oficial foi comparada ao Viewer EN e ao PDF EN de uma página antes e depois da restauração de fidelidade. Os ornamentos vetoriais brancos dos dois banners estavam escuros no fundo canônico; duas sobreposições derivadas dos desenhos vetoriais 186/188 e 190/192 corrigiram essa diferença e foram conferidas contra o PDF oficial. Os títulos editáveis e as explicações A–G seguem a geometria da fonte. Seis cartas de exemplo, seus rótulos de tipo e o diagrama frente/verso de War Axe continuam impressos na arte. A página tinha zero traduções e zero frames PT-BR no Payload.';
proposal.sourceReview.existingPayloadTranslations = 0;
proposal.sourceReview.existingPayloadLayoutFrames = 0;
proposal.sourceReview.payloadWrites = 0;
proposal.sourceReview.fidelityRestoration = {
  status: 'resolved_and_verified_against_official_pdf',
  sidecar: sidecarRel,
  sidecarSha256Before: overlayApplication.sidecarSha256Before,
  sidecarSha256After: overlayApplication.sidecarSha256After,
  sidecarBackup: overlayApplication.sidecarBackup,
  addedOverlays: overlayApplication.addedOverlays,
  sourceDrawingIndices: overlayPreparation.sourceDrawingIndices,
  sourceDrawingRegions: [
    { indices: [186, 188], bboxPt: overlayPreparation.overlays[0].bbox, region: 'title-banner-ornaments-top' },
    { indices: [190, 192], bboxPt: overlayPreparation.overlays[1].bbox, region: 'title-banner-ornaments-breakdown' },
  ],
  evidence: [
    'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/official-vs-export-en-p026-canonical-v1.png',
    'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/official-export-en-p026-fidelity-overlay-diff-v1.png',
    proofRel + '/ornament-overlay-canonical-application-v1.json',
  ],
  rollback: overlayApplication.rollback,
};
proposal.copyfit = {
  status: 'verified_in_snapshot_viewer_editor_pdf_and_raster',
  diagnosticSnapshot: proofRel + '/snapshot-diagnostic-v5/snapshot.json',
  pdfMetrics: proofRel + '/pdf-metrics-diagnostic-v6.json',
  viewerCandidateCount: 15,
  printCandidateCount: 15,
  rightAndBottomEdgeExcessPt: rightBottomExcess,
  failedBodySpanKeysBlankedOnlyInSnapshot: blankedSpanKeys,
  copyfitFrames: blankReceipt.expandedUnitFrames.map(frame => frame.frameKey),
  rasterReview: 'The Viewer and PDF raster show all 15 active PT-BR candidates with no visible collision or clipping. The three failed body regions remain empty in the diagnostic; no English fallback or partial body is visible.',
};
proposal.validation = {
  viewerEditorReceipt: proofRel + '/viewer-editor-receipt-v3.json',
  pdfReceipt: pdfReceiptRel,
  pdf: pdfRel,
  pdfRaster: proofRel + '/page-026-pt-BR-diagnostic-v6-raster.png',
  viewerScreenshot: proofRel + '/viewer-pt-BR-diagnostic-v6.png',
  editorScreenshot: proofRel + '/editor-readonly-v3.png',
  diagnosticBlankReceipt: proofRel + '/diagnostic-blank-receipt-v1.json',
  verifiedCandidateSpanKeys: [...candidateKeys],
  blockedBodyBlankSpanKeys: blankedSpanKeys,
  failedEnglishFallbackCount: viewerEditor.blockedEnglishPresent.length,
  payloadTranslationsBefore: viewerEditor.payload.beforeCount,
  payloadTranslationsAfter: viewerEditor.payload.afterCount,
  payloadLayoutFramesBefore: viewerEditor.payloadLayoutFrames.beforeCount,
  payloadLayoutFramesAfter: viewerEditor.payloadLayoutFrames.afterCount,
  payloadWrites: 0,
  canonicalAssetsUnchangedDuringReadOnlyVerification: viewerEditor.canonicalAssetsUnchanged,
  canonicalFidelityOverlayAppliedBeforeVerification: true,
  canonicalFidelityOverlaySidecarSha256: overlayApplication.sidecarSha256After,
};
proposal.diagnosticFailurePolicy = 'For the PT-BR diagnostic snapshot, blank only the failed text units. Do not show English fallback or a partial translation in the failed region. Preserve the complete source and proposed translation in the proposal and exception record, and keep the original background visible. Never persist the blank state as a translation.';
await writeFile(resolve(root, proposalRel), JSON.stringify(proposal, null, 2) + '\n');

let proposalMarkdown = await readFile(resolve(root, markdownRel), 'utf8');
proposalMarkdown = proposalMarkdown.replace(
  /^\*\*Estado:\*\*.*$/mu,
  '**Estado:** 15/15 candidatos editáveis passaram Viewer, Editor read-only, copyfit e PDF de uma página. O corpo SYMBOL ABILITIES não é exibido no diagnóstico enquanto a unidade editável estiver fragmentada; o texto-fonte e a proposta integral seguem preservados. Oito grupos de texto em arte aguardam localização. Zero registros ou writes no Payload.',
);
proposalMarkdown = proposalMarkdown.replace(
  '## Unidades editáveis',
  '## Verificações técnicas\n\n- Viewer PT-BR: 15/15 propostas visíveis; os três trechos do corpo bloqueado aparecem vazios e o fallback inglês está ausente.\n- Editor read-only: 15/15 unidades selecionadas com correspondência exata; todos os diálogos foram cancelados.\n- Copyfit/PDF: exportação isolada de uma página (820,346 × 820,346 pt); 15/15 textos candidatos selecionáveis, sem caracteres de substituição ou uso privado. O raster não mostra colisão ou corte.\n- Persistência: zero traduções e zero frames PT-BR antes/depois; somente chamadas GET, sem saves ou erros de console/página.\n- Fidelidade da fonte: comparação com o PDF oficial levou à restauração dos ornamentos brancos dos dois banners por sobreposições vetoriais reversíveis.\n\n## Unidades editáveis',
);
proposalMarkdown = proposalMarkdown.replaceAll('Localize these headings in the page artwork and verify the full card row in Viewer and PDF.', 'Localizar esses títulos na arte e verificar a fileira completa de cartas no Viewer e no PDF.');
proposalMarkdown = proposalMarkdown.replaceAll('Prepare a localized card-art variant while preserving printed values and symbols, then verify the complete card in Viewer and PDF.', 'Preparar uma versão localizada da arte, preservando valores e símbolos impressos; depois, verificar a carta completa no Viewer e no PDF.');
proposalMarkdown = proposalMarkdown.replaceAll('Localize the front/back card artwork while preserving its cost, stats, symbols and serial marking, then verify Viewer and PDF.', 'Localizar a arte das faces da carta, preservando custo, atributos, símbolos e número de série; depois, verificar no Viewer e no PDF.');
assert.ok(proposalMarkdown.includes('## Verificações técnicas'));
await writeFile(resolve(root, markdownRel), proposalMarkdown);

const exceptionIdsBefore = new Set(queue.items.map(item => item.id));
const evidence = [
  proposalRel, markdownRel, proofRel + '/viewer-pt-BR-diagnostic-v6.png',
  proofRel + '/editor-readonly-v3.png', proofRel + '/viewer-editor-receipt-v3.json',
  pdfRel, proofRel + '/page-026-pt-BR-diagnostic-v6-raster.png', pdfReceiptRel,
];
const candidateExceptions = proposal.candidates.map(candidate => ({
  id: candidate.spanKey + '::human-review',
  page: 26,
  sourceBlockId: candidate.sourceBlockId,
  sourceUnitId: candidate.sourceUnitId,
  spanKey: candidate.spanKey,
  bboxPt: union(candidate.sourceBboxes),
  category: 'human_terminology_editorial_review',
  status: 'pending_human_review',
  reason: (candidate.pendingTerms ?? []).join(' '),
  sourceText: candidate.sourceText,
  proposedText: candidate.proposalText,
  verifiedIn: ['official source PDF and English Viewer', 'PT-BR Viewer v6', 'read-only Admin Editor v3', 'isolated PT-BR PDF v6 and raster'],
  editor: 'Exact proposal confirmed in the read-only editor; the dialog was cancelled without saving.',
  evidence,
}));
const artworkExceptions = proposal.artworkExceptions.map(item => ({
  id: item.id + '::artwork-localization',
  page: 26,
  sourceBlockId: item.sourceBlockIds[0],
  sourceBlockIds: item.sourceBlockIds,
  spanKeys: item.spanKeys,
  bboxPt: item.bboxPt ?? domBlockUnion(dom, item.sourceBlockIds),
  category: 'printed_artwork_localization',
  status: 'pending_human_review',
  reason: item.reason,
  sourceText: item.sourceText,
  proposedText: item.proposedText,
  pendingTerms: item.pendingTerms,
  requiredAction: item.requiredAction,
  verifiedIn: ['official source PDF, English Viewer and PT-BR diagnostic confirm the words remain printed in page artwork'],
  evidence: [...new Set([...(item.evidence ?? []), ...evidence])],
}));
const technicalExceptions = proposal.technicalExceptions.map(item => ({
  id: item.id + '::structure-repair',
  page: 26,
  sourceBlockId: item.sourceBlockIds[0],
  sourceBlockIds: item.sourceBlockIds,
  spanKeys: item.spanKeys,
  bboxPt: item.sourceBboxPt,
  category: item.category,
  status: 'open',
  reason: item.reason,
  sourceText: item.sourceText,
  proposedText: item.proposedText,
  diagnosticRendering: item.diagnosticRendering,
  blankedSpanKeys: item.blankedSpanKeys,
  requiredAction: item.requiredAction,
  verifiedIn: ['Viewer and one-page PDF confirm all three failed body regions are blank in the diagnostic and no English fallback is visible', 'read-only Editor confirms the parent key does not select the complete body unit'],
  editor: 'The three body subunits remain unselectable as one complete sentence; the full source and PT-BR proposal are preserved, and the diagnostic shows only the background behind the blank region.',
  evidence: [...new Set([proofRel + '/diagnostic-blank-receipt-v1.json', 'scripts/inspect_p026_editor_keys_v1.mjs', 'scripts/inspect_p026_editor_selection_v1.mjs', ...evidence])],
}));
const resolvedFidelityException = {
  id: 'p26-source-vector-banner-ornaments-v1::fidelity-restoration',
  page: 26,
  sourceBlockId: null,
  sourceBlockIds: [],
  spanKeys: [],
  bboxPt: union(overlayApplication.addedOverlays.map(item => item.bbox)),
  bboxesPt: [
    { sourceDrawingIndices: [186, 188], region: 'title-banner-ornaments-top', bboxPt: overlayApplication.addedOverlays[0].bbox },
    { sourceDrawingIndices: [190, 192], region: 'title-banner-ornaments-breakdown', bboxPt: overlayApplication.addedOverlays[1].bbox },
  ],
  category: 'source_vector_page_furniture_restoration',
  status: 'resolved',
  sourceText: 'The official PDF draws white vector flourishes in both title banners; the canonical page background showed those flourishes in dark blue.',
  proposedText: 'Restore the four source vector ornaments in white using two transparent vector-derived overlay images.',
  reason: 'The source PDF and canonical export showed a clear color mismatch in page furniture. White overlays for drawing indices 186/188 and 190/192 were applied with rollback assets preserved, then the official PDF and export were compared again.',
  requiredAction: 'Resolved: keep the overlays and their recorded rollback path.',
  sourceDrawingIndices: [186, 188, 190, 192],
  verifiedIn: ['official source PDF', 'canonical English Viewer and one-page export after overlay', 'side-by-side comparison after overlay'],
  evidence: [
    'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/official-vs-export-en-p026-canonical-v1.png',
    'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/official-export-en-p026-fidelity-overlay-diff-v1.png',
    proofRel + '/ornament-overlay-receipt-v1.json', proofRel + '/ornament-overlay-canonical-application-v1.json',
    proofRel + '/fidelity-overlays-canonical-before-v1.json', 'scripts/apply_p026_banner_ornament_overlay_v1.py',
  ],
  rollback: overlayApplication.rollback,
};
const additions = [...candidateExceptions, ...artworkExceptions, ...technicalExceptions, resolvedFidelityException];
assert.equal(candidateExceptions.length, 15);
assert.equal(artworkExceptions.length, 8);
assert.equal(technicalExceptions.length, 1);
assert.equal(additions.length, 25);
for (const item of additions) {
  assert.ok(!exceptionIdsBefore.has(item.id), 'Exception already exists: ' + item.id);
  queue.items.push(item);
}
queue.sourceProposals = [...new Set([...queue.sourceProposals, proposalRel])];
queue.updated = '2026-10-16';
assert.equal(queue.items.length, 164);
assert.equal(queue.items.filter(item => item.status !== 'resolved').length, 163);
assert.equal(new Set(queue.items.map(item => item.id)).size, queue.items.length);
await writeFile(resolve(root, exceptionRel), JSON.stringify(queue, null, 2) + '\n');

let statusCsv = await readFile(resolve(root, statusRel), 'utf8');
const statusRow = [
  '26', '26', 'raw_pdf_transcript_generated_unreviewed', 'official_pdf_viewer_and_single_page_export_compared_2026-10-16',
  'partial_editable_text_proposal_v1_15_units_viewer_editor_pdf_copyfit_verified_human_review_pending_artwork_and_structure_exception',
  'A proposta v1 cobre 15 unidades editáveis; 15/15 passaram no Viewer, Editor read-only, copyfit e PDF de uma página. O corpo SYMBOL ABILITIES permanece vazio somente em três unidades do snapshot diagnóstico; texto-fonte e tradução integral estão preservados, sem fallback inglês ou tradução parcial. Oito grupos de arte e um reparo de unidade permanecem abertos. Quatro ornamentos vetoriais dos banners foram restaurados em overlays reversíveis e comparados ao PDF oficial. Zero traduções ou frames PT-BR no Payload; zero Payload writes. Ver docs/project-progress/2026-10-16-p026-item-card-types-proposal-v1.md.',
].map(csvField).join(',');
assert.match(statusCsv, /^"26","26",.*$/mu);
statusCsv = statusCsv.replace(/^"26","26",.*$/mu, statusRow);
await writeFile(resolve(root, statusRel), statusCsv);

const report = [
  '# p.26 — proposta PT-BR “Tipos de Cartas de Item” v1',
  '',
  '**Data:** 2026-10-16  ',
  '**Estado:** 15 unidades editáveis verificadas em Viewer, Editor read-only, copyfit e PDF. Revisão humana, localização de arte e um reparo estrutural continuam pendentes.',
  '',
  '## Fonte e fidelidade',
  '',
  'A página oficial foi comparada ao Viewer EN e ao PDF exportado de uma página. A comparação encontrou quatro ornamentos vetoriais brancos escuros no fundo canônico; os desenhos 186/188 e 190/192 foram restaurados por dois overlays reversíveis. A comparação depois da correção está registrada no [relatório da fonte](../../output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/official-vs-export-en-p026-canonical-v1.png). O sidecar anterior e o procedimento de rollback estão preservados.',
  '',
  'As seis cartas de exemplo, seus rótulos de tipo e o diagrama frente/verso da War Axe são texto impresso na arte, não unidades editáveis do Viewer. Os oito grupos estão separados na fila com suas traduções propostas; a arte segue pendente.',
  '',
  '## Proposta e verificação',
  '',
  'A proposta contém 15 unidades editáveis. Todas foram conferidas no Viewer PT-BR e no Editor somente leitura; os diálogos foram cancelados sem salvar. Os 15 textos também aparecem na exportação PDF isolada de uma página.',
  '',
  '- Viewer: 15/15 candidatos visíveis; nenhum texto inglês do corpo bloqueado foi encontrado.',
  '- Editor: 15/15 seleções exatas; zero divergências de limite.',
  '- Copyfit/PDF: 820,346 × 820,346 pt; 15/15 candidatos presentes, zero caracteres de substituição e de uso privado. O raster não mostra colisões ou cortes.',
  '- O corpo SYMBOL ABILITIES tem um bloqueio real de seleção/unidade. Somente suas três subunidades ficam vazias no snapshot PT-BR; nenhuma frase inglesa ou tradução parcial é exibida. O texto-fonte e a tradução completa permanecem na proposta e na fila.',
  '- Payload: zero traduções e zero frames PT-BR antes/depois; somente chamadas GET, nenhum save, zero writes.',
  '',
  '## Exceções e cobertura',
  '',
  'A fila recebeu 15 decisões terminológicas/editoriais, oito grupos de localização de arte, um reparo estrutural e uma ocorrência de fidelidade já resolvida. Ela passou de 139 para 164 IDs únicos; 163 permanecem pendentes/abertos e um está resolvido. Nenhuma proposta foi gravada no Payload.',
  '',
  'Evidências: [proposta JSON](../translations/proposals/page-026-item-card-types-proposal-2026-10-16-v1.json), [proposta Markdown](../translations/proposals/page-026-item-card-types-proposal-2026-10-16-v1.md), [recibo Viewer/Editor](../../' + proofRel + '/viewer-editor-receipt-v3.json), [PDF](../../' + pdfRel + '), [raster do PDF](../../' + proofRel + '/page-026-pt-BR-diagnostic-v6-raster.png), [verificação PDF](../../' + pdfReceiptRel + ') e [fila consolidada](../translations/localization-exceptions.json).',
  '',
].join('\n');
await writeFile(resolve(root, progressRel), report, { flag: 'wx' });

const p26Summary = '- **p.26:** proposta v1 cobre 15 unidades editáveis; 15/15 passaram Viewer, Editor read-only, copyfit e PDF. Três subunidades do corpo bloqueado ficam vazias apenas no snapshot; texto e tradução integral permanecem preservados. Oito grupos de arte e um reparo estrutural aguardam ação, e quatro ornamentos vetoriais dos banners foram restaurados com rollback disponível. Zero Payload writes. Ver [relatório v1](project-progress/2026-10-16-p026-item-card-types-proposal-v1.md).';
const goalRel = 'docs/translations/localization-goal-progress.md';
let goal = await readFile(resolve(root, goalRel), 'utf8');
goal = replaceOnce(goal, '- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](../project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).', p26Summary + '\n- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](../project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).', 'p.25 progress bullet');
goal = replaceOnce(goal, 'p.25 (12 propostas; 9 verificadas e 3 bloqueadas por estrutura/seleção).', 'p.25 (12 propostas; 9 verificadas e 3 bloqueadas por estrutura/seleção), p.26 (15 verificadas; 1 bloqueio estrutural e 8 exceções de arte).', 'goal coverage p.25');
goal = replaceOnce(goal, 'Oito páginas têm algum conteúdo proposto.', 'Nove páginas têm algum conteúdo proposto.', 'goal proposed-page count');
goal = replaceOnce(goal, 'e 9/9 candidatos ativos da p.25;', 'e 9/9 candidatos ativos da p.25 e 15/15 candidatos da p.26;', 'goal surface coverage');
goal = replaceOnce(goal, 'pendente nas oito páginas.', 'pendente nas nove páginas.', 'goal human review count');
goal = replaceOnce(goal, 'Fila deste conjunto: 139 itens únicos —', 'Fila deste conjunto: 164 itens únicos —', 'goal exception count');
goal = replaceOnce(goal, '12 propostas humanas, 14 grupos de arte e 3 reparos técnicos p.25.', '12 propostas humanas, 14 grupos de arte e 3 reparos técnicos p.25; 15 decisões humanas, 8 grupos de arte, 1 reparo estrutural e 1 restauração de fidelidade resolvida p.26.', 'goal exception breakdown');
await writeFile(resolve(root, goalRel), goal);

const stateRel = 'docs/PROJECT_STATE.md';
let state = await readFile(resolve(root, stateRel), 'utf8');
state = replaceOnce(state, 'p.25 (9 candidatos verificados nas três superfícies, três reparos estruturais e arte pendentes).', 'p.25 (9 candidatos verificados nas três superfícies, três reparos estruturais e arte pendentes) e p.26 (15 candidatos verificados, um reparo estrutural e arte pendentes).', 'project state initial page count');
state = replaceOnce(state, '- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).', '- **p.26:** proposta v1 cobre 15 unidades editáveis, todas verificadas no Viewer, Editor read-only, copyfit e PDF. Três subunidades do corpo SYMBOL ABILITIES ficam vazias apenas no snapshot, sem inglês ou texto parcial; a proposta integral está preservada. Oito grupos de arte e um reparo de unidade aguardam ação. A fidelidade dos banners foi corrigida com rollback registrado; zero Payload writes. Ver [relatório v1](project-progress/2026-10-16-p026-item-card-types-proposal-v1.md).\n\n- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).', 'project state p.25 bullet');
state = replaceOnce(state, 'três reparos estruturais da p.25 continuam abertos.', 'três reparos estruturais da p.25 e um da p.26 continuam abertos; a ocorrência de fidelidade dos ornamentos da p.26 foi resolvida.', 'project state open exceptions');
await writeFile(resolve(root, stateRel), state);

const handoffRel = 'PROJECT-HANDOFF.md';
let handoff = await readFile(resolve(root, handoffRel), 'utf8');
handoff = replaceOnce(handoff, 'p.25 (9 candidatos ativos verificados, três unidades em fallback estrutural e arte/revisão humana pendentes).', 'p.25 (9 candidatos ativos verificados, três unidades em fallback estrutural e arte/revisão humana pendentes) e p.26 (15 unidades verificadas, um bloqueio estrutural e oito grupos de arte pendentes).', 'handoff page coverage');
handoff = replaceOnce(handoff, 'e 9/9 candidatos ativos da p.25;', 'e 9/9 candidatos ativos da p.25 e 15/15 candidatos da p.26;', 'handoff surface coverage');
handoff = replaceOnce(handoff, '- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](docs/project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).', p26Summary.replace('(project-progress/', '(docs/project-progress/') + '\n- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](docs/project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).', 'handoff p.25 bullet');
await writeFile(resolve(root, handoffRel), handoff);

const progressReadmeRel = 'docs/project-progress/README.md';
let progressReadme = await readFile(resolve(root, progressReadmeRel), 'utf8');
const progressReadmeLine = '- [2026-10-16 — p.26: proposta “Tipos de Cartas de Item” v1](2026-10-16-p026-item-card-types-proposal-v1.md): 15/15 unidades verificadas em Viewer/Editor/PDF; corpo bloqueado em branco apenas no snapshot, oito grupos de arte pendentes e restauração dos ornamentos dos banners registrada; 25 novas ocorrências, uma resolvida; zero Payload writes.\n';
progressReadme = progressReadmeLine + progressReadme;
await writeFile(resolve(root, progressReadmeRel), progressReadme);

const sourceReviewV2 = {
  status: 'official_pdf_viewer_and_english_single_page_export_compared_after_fidelity_restoration',
  page: 26,
  sourcePdfSha256: proposal.sourcePdfSha256,
  sourcePdfPageSizePt: [820.346, 820.346],
  officialSourceRaster: 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/official-source-en-p026-1.4.png',
  englishViewer: 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/en-viewer-canonical-fidelity-v1.png',
  englishExportPdf: 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/page-026-en-canonical-fidelity-v1.pdf',
  comparison: 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/official-vs-export-en-p026-canonical-v1.png',
  finding: 'Four white vector flourishes in two page title banners rendered dark in the canonical background.',
  sourceDrawingIndices: overlayPreparation.sourceDrawingIndices,
  sourceDrawingPathItemCounts: overlayPreparation.sourcePathItemCounts,
  restoredRegions: proposal.sourceReview.fidelityRestoration.sourceDrawingRegions,
  sidecarSha256Before: overlayApplication.sidecarSha256Before,
  sidecarSha256After: overlayApplication.sidecarSha256After,
  canonicalDomSha256: proposal.canonicalDomSha256,
  backgroundSha256: proposal.backgroundSha256,
  canonicalLayoutFramesSha256: proposal.canonicalLayoutFramesSha256,
  payloadWrites: 0,
  rollback: overlayApplication.rollback,
};
await writeFile(resolve(root, proofRel + '/source-review-v2.json'), JSON.stringify(sourceReviewV2, null, 2) + '\n', { flag: 'wx' });

const finalization = {
  status: 'p026_proposal_v1_technical_review_complete_human_review_and_structure_artwork_work_pending',
  page: 26,
  proposal: proposalRel,
  proposalSha256: sha256(await readFile(resolve(root, proposalRel))),
  sourcePdfSha256: proposal.sourcePdfSha256,
  diagnosticSnapshotSha256: sha256(snapshotBytes),
  candidateCount: 15,
  verifiedInViewer: 15,
  verifiedInEditor: 15,
  verifiedInPdf: 15,
  blockedBodyBlankSpanKeys: blankedSpanKeys,
  artworkExceptionsAdded: artworkExceptions.length,
  humanReviewExceptionsAdded: candidateExceptions.length,
  technicalExceptionsAdded: technicalExceptions.length,
  resolvedFidelityExceptionsAdded: 1,
  addedExceptionIds: additions.map(item => item.id),
  totalExceptionQueueItems: queue.items.length,
  unresolvedExceptionQueueItems: queue.items.filter(item => item.status !== 'resolved').length,
  payloadTranslationsBefore: viewerEditor.payload.beforeCount,
  payloadTranslationsAfter: viewerEditor.payload.afterCount,
  payloadLayoutFramesBefore: viewerEditor.payloadLayoutFrames.beforeCount,
  payloadLayoutFramesAfter: viewerEditor.payloadLayoutFrames.afterCount,
  payloadWrites: 0,
  canonicalFidelitySidecarSha256: overlayApplication.sidecarSha256After,
  canonicalFidelityRollback: overlayApplication.rollback,
  pdf: pdfRel,
  pdfRaster: proofRel + '/page-026-pt-BR-diagnostic-v6-raster.png',
  pdfReceipt: pdfReceiptRel,
  pageProgress: progressRel,
};
await writeFile(resolve(root, finalizationRel), JSON.stringify(finalization, null, 2) + '\n', { flag: 'wx' });

for (const rel of [proposalRel, markdownRel, exceptionRel, statusRel, progressRel, finalizationRel, pdfReceiptRel, proofRel + '/source-review-v2.json']) await mustExist(rel);
console.log(JSON.stringify(finalization, null, 2));
