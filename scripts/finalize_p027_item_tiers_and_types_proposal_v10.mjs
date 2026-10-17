#!/usr/bin/env node
/** Record the verified p.27 proposal, snapshot-only failures, and queue state. */
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const proof = 'output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1';
const proposalRel = 'docs/translations/proposals/page-027-item-tiers-and-types-proposal-2026-10-16-v10.json';
const markdownRel = 'docs/translations/proposals/page-027-item-tiers-and-types-proposal-2026-10-16-v10.md';
const pdfRel = proof + '/page-027-pt-BR-diagnostic-v10.pdf';
const viewerReceiptRel = proof + '/viewer-editor-receipt-v3.json';
const pdfReceiptRel = proof + '/pdf-verification-v2.json';
const metricsRel = proof + '/metrics-pt-BR-diagnostic-v10.json';
const snapshotRel = proof + '/snapshot-diagnostic-v10/snapshot.json';
const exceptionRel = 'docs/translations/localization-exceptions.json';
const statusRel = 'docs/translations/page-status.csv';
const progressRel = 'docs/translations/localization-goal-progress.md';
const projectStateRel = 'docs/PROJECT_STATE.md';
const handoffRel = 'PROJECT-HANDOFF.md';
const progressIndexRel = 'docs/project-progress/README.md';
const reportRel = 'docs/project-progress/2026-10-16-p027-item-tiers-and-types-proposal-v10.md';
const readJson = async rel => JSON.parse(await readFile(resolve(root, rel), 'utf8'));
const writeJson = async (rel, value) => writeFile(resolve(root, rel), JSON.stringify(value, null, 2) + '\n');
const union = boxes => {
  const valid = boxes.filter(box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite));
  assert.ok(valid.length, 'Expected source bounding boxes.');
  return [Math.min(...valid.map(box => box[0])), Math.min(...valid.map(box => box[1])), Math.max(...valid.map(box => box[2])), Math.max(...valid.map(box => box[3]))];
};
const replaceLine = (text, predicate, replacement, label) => {
  const lines = text.split(/\r?\n/u);
  const hits = lines.map((line, index) => predicate(line) ? index : -1).filter(index => index >= 0);
  assert.equal(hits.length, 1, `Expected exactly one ${label} line.`);
  lines[hits[0]] = replacement;
  return lines.join('\n');
};
const evidence = [
  proposalRel, markdownRel,
  proof + '/viewer-readonly-pt-BR-diagnostic-v10.png',
  proof + '/editor-readonly-v3.png', viewerReceiptRel,
  pdfRel, pdfReceiptRel, metricsRel,
  proof + '/print-pt-BR-diagnostic-v10.png',
];

const [proposal, viewer, pdfReceipt, metrics, snapshot, queue] = await Promise.all([
  readJson(proposalRel), readJson(viewerReceiptRel), readJson(pdfReceiptRel),
  readJson(metricsRel), readJson(snapshotRel), readJson(exceptionRel),
]);
assert.equal(proposal.page, 27);
assert.equal(proposal.candidates.length, 30);
assert.equal(proposal.artworkExceptions.length, 3);
assert.equal(proposal.technicalExceptions.length, 3);
assert.equal(viewer.status, 'passed_live_viewer_readonly_editor_with_diagnostic_blank_units');
assert.equal(viewer.candidateCount, 30);
assert.equal(viewer.renderedCandidateCount, 27);
assert.equal(viewer.editorVerifiedCandidateCount, 27);
assert.equal(viewer.editorBoundaryMismatchCount, 0);
assert.deepEqual(viewer.viewerMissing, []);
assert.deepEqual(viewer.blockedEnglishPresent, []);
assert.deepEqual(viewer.failedProposalPresent, []);
assert.ok(viewer.editorChecks.every(item => item.proposalMatched && item.editable && item.cancelled));
assert.equal(viewer.payload.beforeCount, 0);
assert.equal(viewer.payload.afterCount, 0);
assert.equal(viewer.payload.unchanged, true);
assert.equal(viewer.payloadLayoutFrames.beforeCount, 0);
assert.equal(viewer.payloadLayoutFrames.afterCount, 0);
assert.equal(viewer.payloadLayoutFrames.unchanged, true);
assert.deepEqual(viewer.observedApiMethods, ['GET']);
assert.deepEqual(viewer.blockedMutations, []);
assert.deepEqual(viewer.consoleErrors, []);
assert.deepEqual(viewer.pageErrors, []);
assert.equal(viewer.canonicalAssetsUnchanged, true);
assert.equal(viewer.saveClicked, false);
assert.equal(pdfReceipt.status, 'passed_single_page_pdf_with_three_diagnostic_blank_units');
assert.equal(pdfReceipt.pages, 1);
assert.deepEqual(pdfReceipt.pageSizePt, [820.346, 820.346]);
assert.equal(pdfReceipt.verifiedCandidateCount, 27);
assert.deepEqual(pdfReceipt.missingCandidateSpanKeys, []);
assert.equal(pdfReceipt.failedSourceFallbackAbsent, true);
assert.equal(pdfReceipt.failedProposalTextAbsent, true);
assert.equal(pdfReceipt.replacementCharacters, 0);
assert.equal(pdfReceipt.privateUseCharacters, 0);
assert.equal(pdfReceipt.technicalExceptionCount, 3);
assert.equal(metrics.page, 27);
assert.equal(metrics.language, 'pt-BR');
assert.equal(metrics.viewer.pageWidthPt, 820.3460083007812);
assert.equal(metrics.print.pageWidthPt, 820.3460083007812);
assert.equal(snapshot.diagnosticOnly.blankedSpanKeys.length, 3);
assert.deepEqual([...snapshot.diagnosticOnly.blankedSpanKeys].sort(), [...pdfReceipt.failedSpanKeys].sort());
assert.equal(queue.items.length, 164);

const visibleCandidates = proposal.candidates.filter(candidate => candidate.diagnosticRendering === 'proposal');
const blankCandidates = proposal.candidates.filter(candidate => candidate.diagnosticRendering !== 'proposal');
assert.equal(visibleCandidates.length, 27);
assert.equal(blankCandidates.length, 3);
assert.deepEqual(blankCandidates.map(item => item.legacyBlockSpanKey).sort(), [...pdfReceipt.failedSpanKeys].sort());
const targetByKey = new Map(metrics.print.translationTargets.map(item => [item.spanKey, item]));
const printedTargets = visibleCandidates.map(candidate => {
  const target = targetByKey.get(candidate.legacyBlockSpanKey);
  assert.ok(target, `Missing printed copyfit measurement for ${candidate.legacyBlockSpanKey}`);
  assert.equal(target.text, candidate.proposalText, `Copyfit text mismatch for ${candidate.legacyBlockSpanKey}`);
  return target;
});
const rightBottomExcessPt = Math.max(...printedTargets.flatMap(target => [target.edgeExcessPt.right, target.edgeExcessPt.bottom]));
assert.ok(rightBottomExcessPt <= 0.01, `Visible candidate exceeds a right/bottom frame edge by ${rightBottomExcessPt} pt.`);
const visibleKeys = new Set(viewer.editorChecks.filter(item => item.proposalMatched && item.editable && item.cancelled).map(item => item.spanKey));
assert.equal(visibleKeys.size, 27);
assert.ok(visibleCandidates.every(candidate => visibleKeys.has(candidate.spanKey)));

const technicalStatusByBlock = new Map([
  ['block_15', 'failed_list_row_height_and_copyfit'],
  ['block_31', 'failed_source_art_label_and_body_copyfit'],
  ['block_385', 'failed_caption_frame_right_edge_copyfit'],
]);
for (const candidate of proposal.candidates) {
  if (candidate.diagnosticRendering === 'proposal') {
    candidate.status = 'technically_verified_pending_human_review';
    candidate.technicalStatus = 'verified_in_viewer_readonly_editor_copyfit_and_pdf';
    candidate.editorialStatus = 'pending_human_review';
    candidate.verifiedIn = ['PT-BR Viewer v10', 'read-only Admin Editor v3', 'Copyfit V3 metrics v10', 'isolated PT-BR PDF v10 and raster'];
  } else {
    candidate.status = 'diagnostic_blank_pending_dtp_human_review';
    candidate.technicalStatus = technicalStatusByBlock.get(candidate.sourceBlockId);
    candidate.editorialStatus = 'pending_human_review';
    candidate.diagnosticRendering = 'blanked_after_copyfit_failure';
    candidate.verifiedIn = ['unit confirmed blank in PT-BR Viewer v10', 'failed English fallback and proposed text absent from PDF v10'];
  }
}

proposal.status = 'partial_editable_text_proposal_v10_27_units_viewer_editor_copyfit_pdf_verified_3_diagnostic_blanks_human_review_pending_artwork_and_dtp_exceptions';
proposal.counts = {
  candidates: 30,
  verifiedInViewer: 27,
  verifiedInEditor: 27,
  verifiedInPdf: 27,
  preservedHumanRecords: 0,
  artworkExceptions: 3,
  technicalExceptions: 3,
};
proposal.sourceReview.status = 'official_pdf_static_review_reused_and_current_english_viewer_export_reviewed_2026-10-16';
proposal.sourceReview.existingPayloadTranslations = 0;
proposal.sourceReview.existingPayloadLayoutFrames = 0;
proposal.sourceReview.payloadWrites = 0;
proposal.payload = { readOnlyMethod: 'GET', existingPageRecords: 0, existingPageLayoutFrames: 0, writes: 0 };
proposal.copyfit = {
  status: 'passed_for_27_visible_candidates_with_three_snapshot_only_diagnostic_blanks',
  diagnosticSnapshot: snapshotRel,
  metrics: metricsRel,
  viewerCandidateCount: 27,
  printCandidateCount: 27,
  rightAndBottomEdgeExcessPt: rightBottomExcessPt,
  failedCandidates: blankCandidates.map(candidate => ({ spanKey: candidate.legacyBlockSpanKey, sourceBlockId: candidate.sourceBlockId, reason: candidate.technicalStatus })),
  revisionHistory: {
    sourceSizedRevision: 'One concise source-sized revision was made to block_12, block_34 and block_385 after v8 measured right-edge excesses. No font-size or line-height reductions were used.',
    block12: { priorRightExcessPt: 1.373347, finalStatus: 'fits_in_v10' },
    block34: { priorRightExcessPt: 1.960503, finalStatus: 'fits_in_v10' },
    block385: { revisedRightExcessPt: 2.3203409851654726, finalStatus: 'entire_unit_blank_in_v10_diagnostic_pending_dtp' },
  },
  rasterReview: 'The v10 Viewer and PDF raster show the complete page, 27 visible PT-BR candidates, and all three failed units blank. No visible candidate exceeds its right or bottom frame edge in Copyfit V3 metrics.',
};
proposal.validation = {
  viewerEditorReceipt: viewerReceiptRel,
  pdfReceipt: pdfReceiptRel,
  pdf: pdfRel,
  viewerScreenshot: proof + '/viewer-readonly-pt-BR-diagnostic-v10.png',
  printScreenshot: proof + '/print-pt-BR-diagnostic-v10.png',
  editorScreenshot: proof + '/editor-readonly-v3.png',
  copyfitMetrics: metricsRel,
  verifiedCandidateSpanKeys: [...visibleKeys],
  blankedSpanKeys: viewer.blankTargetChecks.map(item => item.spanKey),
  failedEnglishFallbackCount: viewer.blockedEnglishPresent.length,
  payloadTranslationsBefore: viewer.payload.beforeCount,
  payloadTranslationsAfter: viewer.payload.afterCount,
  payloadLayoutFramesBefore: viewer.payloadLayoutFrames.beforeCount,
  payloadLayoutFramesAfter: viewer.payloadLayoutFrames.afterCount,
  observedApiMethods: viewer.observedApiMethods,
  payloadWrites: 0,
  canonicalAssetsUnchangedDuringReadOnlyVerification: viewer.canonicalAssetsUnchanged,
};
await writeJson(proposalRel, proposal);

let proposalMarkdown = await readFile(resolve(root, markdownRel), 'utf8');
proposalMarkdown = replaceLine(proposalMarkdown, line => line.startsWith('**Estado:**'),
  '**Estado:** 27/30 unidades passaram no Viewer, Editor read-only, Copyfit V3 e PDF de uma página; três falhas ficam totalmente em branco apenas no snapshot diagnóstico. Três grupos de cartas seguem como exceções de arte. Revisão humana pendente; zero writes no Payload.', 'proposal status');
if (!proposalMarkdown.includes('## Verificação técnica v10')) {
  proposalMarkdown = proposalMarkdown.replace('## Unidades editáveis',
    '## Verificação técnica v10\n\n- Viewer PT-BR: 27/27 unidades visíveis correspondem à proposta; os três alvos bloqueados têm uma unidade vazia cada e não mostram fallback inglês nem proposta parcial.\n- Editor read-only: 27/27 unidades selecionadas e conferidas com correspondência exata; todos os diálogos foram cancelados.\n- Copyfit V3/PDF: 27 candidatos visíveis; excesso máximo à direita/abaixo igual a ' + rightBottomExcessPt.toFixed(3) + ' pt. A página exportada tem 820,346 × 820,346 pt e não contém caracteres de substituição nem de uso privado.\n- Persistência: zero traduções e zero frames PT-BR antes/depois; somente chamadas GET, sem saves, mutações bloqueadas, erros de console ou erros de página.\n- Os tamanhos de fonte da proposta foram mantidos; não houve redução tipográfica para forçar encaixe. As propostas integrais das três unidades bloqueadas continuam neste arquivo.\n\n## Unidades editáveis');
}
await writeFile(resolve(root, markdownRel), proposalMarkdown);

const exceptionIdsBefore = new Set(queue.items.map(item => item.id));
const humanExceptions = proposal.candidates.map(candidate => ({
  id: candidate.spanKey + '::human-review', page: 27,
  sourceBlockId: candidate.sourceBlockId, sourceUnitIds: candidate.sourceUnitIds,
  spanKey: candidate.spanKey, bboxPt: union(candidate.sourceBboxes),
  category: 'human_terminology_editorial_review', status: 'pending_human_review',
  reason: (candidate.pendingTerms ?? []).join('; '),
  sourceText: candidate.sourceText, proposedText: candidate.proposalText,
  verifiedIn: candidate.diagnosticRendering === 'proposal'
    ? ['official source review', 'PT-BR Viewer v10', 'read-only Admin Editor v3', 'one-page PDF v10 and Copyfit V3 metrics']
    : ['source and full PT-BR proposal preserved', 'failed unit blank in diagnostic Viewer and PDF'],
  editor: candidate.diagnosticRendering === 'proposal' ? 'Exact proposal confirmed in the read-only editor; the dialog was cancelled without saving.' : 'Human review is pending; the complete source and proposed text are preserved while the diagnostic unit stays blank.',
  evidence,
}));
const artworkExceptions = proposal.artworkExceptions.map(item => ({
  id: item.id + '::artwork-localization', page: 27,
  sourceBlockIds: item.sourceBlockIds, sourceBlockId: item.sourceBlockIds[0],
  spanKeys: item.spanKeys, bboxPt: item.bboxPt,
  category: 'printed_artwork_localization', status: 'pending_human_review',
  reason: item.reason, sourceText: item.sourceText, proposedText: item.proposedText,
  pendingTerms: item.terms, requiredAction: item.requiredAction,
  verifiedIn: ['official source review and full-page Viewer/PDF confirm these strings remain inside printed card artwork'],
  evidence,
}));
const technicalExceptions = proposal.technicalExceptions.map(item => ({
  id: item.id + '::dtp-copyfit', page: 27,
  sourceBlockId: item.sourceBlockId, sourceBlockIds: [item.sourceBlockId],
  spanKey: item.spanKey, bboxPt: item.sourceBboxPt,
  category: item.category, status: 'open', reason: item.reason,
  sourceText: item.sourceText, proposedText: item.proposedText,
  diagnosticRendering: 'blank_in_snapshot_only', blankedSpanKeys: [item.spanKey + '__pt-BR'],
  requiredAction: item.requiredAction,
  verifiedIn: ['failed unit blank in Viewer/PDF diagnostic; source and full translation preserved in the proposal'],
  evidence,
}));
const additions = [...humanExceptions, ...artworkExceptions, ...technicalExceptions];
assert.equal(additions.length, 36);
for (const item of additions) assert.ok(!exceptionIdsBefore.has(item.id), `Duplicate exception id ${item.id}`);
queue.items.push(...additions);
queue.sourceProposals.push(proposalRel, markdownRel);
assert.equal(queue.items.length, 200);
assert.equal(new Set(queue.items.map(item => item.id)).size, queue.items.length);
await writeJson(exceptionRel, queue);

const csvPath = resolve(root, statusRel);
const csvText = await readFile(csvPath, 'utf8');
const csvLines = csvText.trimEnd().split(/\r?\n/u);
const parseCsv = line => {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { cells.push(value); value = ''; }
    else value += character;
  }
  cells.push(value);
  return cells;
};
const csvEncode = fields => fields.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',');
const p27Index = csvLines.findIndex((line, index) => index > 0 && parseCsv(line)[0] === '27' && parseCsv(line)[1] === '27');
assert.ok(p27Index > 0, 'Missing p.27 row in page-status.csv');
const p27 = parseCsv(csvLines[p27Index]);
assert.equal(p27.length, 6);
p27[3] = 'official_pdf_static_review_reused_and_current_english_viewer_export_reviewed_2026-10-16';
p27[4] = 'partial_editable_text_proposal_v10_27_units_viewer_editor_copyfit_pdf_verified_3_diagnostic_blanks_human_review_pending_artwork_and_dtp_exceptions';
p27[5] = 'Proposta PT-BR v10: 30 unidades com tradução proposta; 27/27 passaram no Viewer, Editor read-only, Copyfit V3 e PDF. Três unidades ficam totalmente em branco apenas no snapshot: lista de venda com colisão entre linhas, rótulos de tipos que excedem as faixas coloridas e legenda do Núcleo de Deflexão que ainda ultrapassa o frame em 2,320 pt após uma revisão. Três pares de cartas aguardam localização da arte. Revisão humana pendente; zero traduções, frames ou writes no Payload. Ver ' + reportRel + '.';
csvLines[p27Index] = csvEncode(p27);
await writeFile(csvPath, csvLines.join('\n') + '\n');

const queueLine = '- Fila deste conjunto: 200 itens únicos — 19 p.18; 31 p.19; 8 p.21; 2 p.22; 1 grupo de arte p.20; 11 decisões humanas e 1 exceção de arte p.23; 36 decisões humanas e 1 exemplo misto salvo p.24; 12 propostas humanas, 14 grupos de arte e 3 reparos técnicos p.25; 15 decisões humanas, 8 grupos de arte, 1 reparo estrutural e 1 restauração de fidelidade resolvida p.26; 30 decisões humanas, 3 grupos de arte e 3 exceções técnicas de copyfit p.27. A reconciliação de exceções para as demais páginas ainda não foi feita.';
let progress = await readFile(resolve(root, progressRel), 'utf8');
progress = progress.replace(
  '- **p.26:** proposta v1 cobre 15 unidades editáveis; 15/15 passaram Viewer, Editor read-only, copyfit e PDF. Três subunidades do corpo bloqueado ficam vazias apenas no snapshot; texto e tradução integral permanecem preservados. Oito grupos de arte e um reparo estrutural aguardam ação, e quatro ornamentos vetoriais dos banners foram restaurados com rollback disponível. Zero Payload writes. Ver [relatório v1](project-progress/2026-10-16-p026-item-card-types-proposal-v1.md).',
  '- **p.26:** proposta v1 cobre 15 unidades editáveis; 15/15 passaram Viewer, Editor read-only, copyfit e PDF. Três subunidades do corpo bloqueado ficam vazias apenas no snapshot; texto e tradução integral permanecem preservados. Oito grupos de arte e um reparo estrutural aguardam ação, e quatro ornamentos vetoriais dos banners foram restaurados com rollback disponível. Zero Payload writes. Ver [relatório v1](project-progress/2026-10-16-p026-item-card-types-proposal-v1.md).\n- **p.27:** proposta v10 cobre 30 unidades; 27/27 passaram Viewer, Editor read-only, Copyfit V3 e PDF. Três unidades ficam vazias apenas no snapshot: lista de venda, painel de tipos com rótulos fora das faixas e legenda do Núcleo de Deflexão com 2,320 pt de excesso após uma revisão. Três pares de cartas aguardam localização de arte; revisão humana pendente. Zero Payload writes. Ver [relatório v10](../project-progress/2026-10-16-p027-item-tiers-and-types-proposal-v10.md).');
progress = replaceLine(progress, line => line.startsWith('- Conteúdo localizável com proposta recuperável neste lote:'),
  '- Conteúdo localizável com proposta recuperável neste lote: p.18 (29 unidades), p.19 (28), p.21 (22; 2 bloqueadas no diagnóstico), p.22 (5; 1 bloqueada), p.20 (1 título editável; grupo de texto-em-arte pendente), p.23 (17), p.24 (43), p.25 (12 propostas; 9 verificadas e 3 bloqueadas), p.26 (15 verificadas; 1 bloqueio estrutural e 8 exceções de arte) e p.27 (30 propostas; 27 verificadas, 3 bloqueadas e 3 grupos de arte).', 'coverage summary');
progress = replaceLine(progress, line => line.startsWith('- Nove páginas têm algum conteúdo proposto.'),
  '- Dez páginas têm algum conteúdo proposto. Viewer/Editor/PDF cobrem as propostas das p.18/p.19, quatro unidades da p.22, o título da p.20, 17/17 unidades da p.23, 43/43 candidatos da p.24, 9/9 candidatos ativos da p.25, 15/15 candidatos da p.26 e 27/27 candidatos ativos da p.27; p.21 ainda aguarda Editor. A página 27 tem três unidades em branco somente no diagnóstico. As verificações técnicas não equivalem a aprovação editorial nem a cobertura integral dessas páginas.','surface coverage');
progress = replaceLine(progress, line => line.startsWith('- Revisão editorial humana:'), '- Revisão editorial humana: pendente nas dez páginas. Aprovado editorialmente: nenhuma.', 'human review coverage');
progress = replaceLine(progress, line => line.startsWith('- Fila deste conjunto:'), queueLine, 'exception queue summary');
await writeFile(resolve(root, progressRel), progress);

const p27StateBullet = '- **p.27:** proposta v10 cobre 30 unidades; 27/27 verificadas no Viewer, Editor read-only, Copyfit V3 e PDF. Lista de venda, painel de tipos e legenda do Núcleo de Deflexão ficam totalmente vazios apenas no snapshot por falhas de altura/faixa/frame; texto integral preservado. Três pares de cartas aguardam localização de arte. Revisão humana pendente; zero Payload writes. Ver [relatório v10](project-progress/2026-10-16-p027-item-tiers-and-types-proposal-v10.md).';
let projectState = await readFile(resolve(root, projectStateRel), 'utf8');
projectState = projectState.replace('e p.26 (15 candidatos verificados, um reparo estrutural e arte pendentes).', 'p.26 (15 candidatos verificados, um reparo estrutural e arte pendentes) e p.27 (27 candidatos verificados, três unidades em branco no diagnóstico e três grupos de arte pendentes).');
projectState = projectState.replace('## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n', '## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n\n' + p27StateBullet + '\n');
await writeFile(resolve(root, projectStateRel), projectState);

const p27HandoffBullet = '- **p.27:** proposta v10 de 30 unidades; 27 passaram Viewer/Editor read-only/Copyfit V3/PDF. Três unidades ficam em branco somente no snapshot por falhas de faixa, altura e frame; três grupos de cartas e revisão humana aguardam ação. Zero Payload writes. Ver [relatório v10](docs/project-progress/2026-10-16-p027-item-tiers-and-types-proposal-v10.md).';
let handoff = await readFile(resolve(root, handoffRel), 'utf8');
handoff = handoff.replace('e p.26 (15 unidades verificadas, um bloqueio estrutural e oito grupos de arte pendentes).', 'p.26 (15 unidades verificadas, um bloqueio estrutural e oito grupos de arte pendentes) e p.27 (27 unidades verificadas, três blocos em branco no snapshot e três grupos de arte pendentes).');
handoff = handoff.replace('e 15/15 candidatos da p.26;', '15/15 candidatos da p.26 e 27/27 candidatos ativos da p.27;');
handoff = handoff.replace('## Execução mais recente — 16/10/2026\n', '## Execução mais recente — 16/10/2026\n\n' + p27HandoffBullet + '\n');
await writeFile(resolve(root, handoffRel), handoff);

let index = await readFile(resolve(root, progressIndexRel), 'utf8');
index = '- [2026-10-16 — p.27: proposta “Níveis e Tipos de Itens” v10](2026-10-16-p027-item-tiers-and-types-proposal-v10.md): 27/30 unidades verificadas no Viewer, Editor read-only, Copyfit V3 e PDF; três falhas ficam em branco apenas no snapshot, três pares de cartas aguardam localização e a revisão humana está pendente.\n' + index;
await writeFile(resolve(root, progressIndexRel), index);

const report = `# 2026-10-16 — p.27: proposta “Níveis e Tipos de Itens” v10\n\n## Resultado\n\nA proposta cobre 30 unidades editáveis da página 27. Vinte e sete passaram por Viewer PT-BR, Editor read-only, Copyfit V3 e PDF de uma página. Três unidades falharam e ficam integralmente em branco somente no snapshot diagnóstico; o texto-fonte e a proposta completa estão preservados no JSON e na fila. Três pares de cartas permanecem como exceções de localização da arte. Revisão humana e terminológica continua pendente.\n\n## Exceções técnicas\n\n- **Lista de venda (block_15):** linhas fixas da fonte não comportam as quebras dos bullets traduzidos 2 e 3; há colisão vertical com os bullets seguintes. A unidade completa fica em branco no diagnóstico.\n- **Painel de tipos (block_31):** seis rótulos não cabem nas faixas coloridas da fonte e a descrição de Acessórios invade a faixa magenta. O texto completo fica em branco no diagnóstico.\n- **Legenda do Núcleo de Deflexão (block_385):** após uma revisão concisa em tamanho de fonte original, o Copyfit V3 ainda mediu 2,320 pt de excesso à direita. O texto completo fica em branco no diagnóstico e aguarda tratamento DTP.\n\nBlock 12 e block 34 foram encurtados uma vez mantendo os tamanhos tipográficos. As métricas v10 não mostram excesso à direita ou abaixo em nenhum dos 27 candidatos visíveis. Não houve redução de fonte ou line-height para forçar encaixe.\n\n## Verificações\n\n- Viewer: 27/27 propostas visíveis; nenhum fallback inglês ou proposta parcial nos três alvos em branco.\n- Editor read-only: 27/27 textos correspondem exatamente; os 27 diálogos foram cancelados.\n- PDF: uma página, 820,346 × 820,346 pt; 27 candidatos conferidos; zero caracteres de substituição ou de uso privado; os três textos-fonte e propostas bloqueados estão ausentes.\n- Payload: zero traduções e zero frames antes/depois; somente GET; nenhum save, mutação ou erro. Os assets canônicos permaneceram inalterados.\n\n## Fila e continuidade\n\nForam adicionados 30 itens de revisão humana, três grupos de arte e três exceções técnicas. A fila total passou de 164 para 200 itens únicos: 199 abertos e um resolvido. O progresso agora registra dez páginas com proposta. Nada foi aprovado editorialmente nem gravado no Payload.\n\n## Evidências\n\n- Proposta: [JSON](../translations/proposals/page-027-item-tiers-and-types-proposal-2026-10-16-v10.json) e [Markdown](../translations/proposals/page-027-item-tiers-and-types-proposal-2026-10-16-v10.md).\n- [Viewer v10](../../output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/viewer-readonly-pt-BR-diagnostic-v10.png), [raster de impressão v10](../../output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/print-pt-BR-diagnostic-v10.png), [recibo Viewer/Editor](../../output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/viewer-editor-receipt-v3.json).\n- [PDF v10](../../output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/page-027-pt-BR-diagnostic-v10.pdf), [recibo PDF](../../output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/pdf-verification-v2.json), [métricas Copyfit V3](../../output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/metrics-pt-BR-diagnostic-v10.json).\n`;
await writeFile(resolve(root, reportRel), report);

console.log(JSON.stringify({
  status: 'p027_proposal_v10_finalized_with_27_verified_units_and_three_diagnostic_only_blanks',
  queueItems: queue.items.length,
  unresolved: queue.items.filter(item => item.status !== 'resolved').length,
  resolved: queue.items.filter(item => item.status === 'resolved').length,
  pageStatusRow: p27,
  proposal: proposalRel,
  report: reportRel,
}, null, 2));
