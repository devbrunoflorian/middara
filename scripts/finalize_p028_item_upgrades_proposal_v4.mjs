#!/usr/bin/env node
/** Record the verified p.28 proposal, legacy Editor key issue, and queue state. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const proof = 'output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1';
const proposalRel = 'docs/translations/proposals/page-028-item-upgrades-proposal-2026-10-16-v4.json';
const markdownRel = 'docs/translations/proposals/page-028-item-upgrades-proposal-2026-10-16-v4.md';
const snapshotRel = proof + '/snapshot-diagnostic-v4/snapshot.json';
const metricsRel = proof + '/metrics-pt-BR-diagnostic-v4.json';
const viewerReceiptRel = proof + '/viewer-editor-receipt-v1.json';
const pdfReceiptRel = proof + '/pdf-verification-v1.json';
const pdfRel = proof + '/page-028-pt-BR-diagnostic-v4.pdf';
const exceptionRel = 'docs/translations/localization-exceptions.json';
const statusRel = 'docs/translations/page-status.csv';
const progressRel = 'docs/translations/localization-goal-progress.md';
const projectStateRel = 'docs/PROJECT_STATE.md';
const handoffRel = 'PROJECT-HANDOFF.md';
const progressIndexRel = 'docs/project-progress/README.md';
const reportRel = 'docs/project-progress/2026-10-16-p028-item-upgrades-proposal-v4.md';
const readJson = async rel => JSON.parse(await readFile(resolve(root, rel), 'utf8'));
const writeJson = async (rel, value) => writeFile(resolve(root, rel), JSON.stringify(value, null, 2) + '\n');
const replaceLine = (text, predicate, replacement, label) => {
  const lines = text.split(/\r?\n/u);
  const hits = lines.map((line, index) => predicate(line) ? index : -1).filter(index => index >= 0);
  assert.equal(hits.length, 1, `Expected exactly one ${label} line.`);
  lines[hits[0]] = replacement;
  return lines.join('\n');
};
const union = boxes => {
  const valid = boxes.filter(box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite));
  assert.ok(valid.length, 'Expected source bounding boxes.');
  return [Math.min(...valid.map(box => box[0])), Math.min(...valid.map(box => box[1])), Math.max(...valid.map(box => box[2])), Math.max(...valid.map(box => box[3]))];
};
const evidence = [
  proposalRel, markdownRel,
  proof + '/viewer-readonly-pt-BR-diagnostic-v4.png',
  proof + '/editor-readonly-v1.png', viewerReceiptRel,
  pdfRel, pdfReceiptRel, metricsRel, proof + '/print-pt-BR-diagnostic-v4.png',
];

const [proposal, viewer, pdfReceipt, metrics, snapshot, queue] = await Promise.all([
  readJson(proposalRel), readJson(viewerReceiptRel), readJson(pdfReceiptRel),
  readJson(metricsRel), readJson(snapshotRel), readJson(exceptionRel),
]);
assert.equal(proposal.page, 28);
assert.equal(proposal.candidates.length, 23);
assert.equal(proposal.preservedHumanRecords.length, 8);
assert.equal(proposal.artworkExceptions.length, 0);
assert.equal(viewer.candidateCount, 23);
assert.equal(viewer.preservedHumanRecordCount, 8);
assert.deepEqual(viewer.viewerMissing, []);
assert.deepEqual(viewer.targetMismatches, []);
assert.equal(viewer.editorVerifiedCandidateCount, 23);
assert.equal(viewer.editorVerifiedPreservedRecordCount, 7);
assert.equal(viewer.editorBoundaryMismatchCount, 1);
assert.ok(viewer.editorChecks.every(item => item.editable && item.cancelled));
assert.ok(viewer.editorChecks.filter(item => item.kind === 'new_candidate').every(item => item.proposalMatched));
assert.deepEqual(viewer.editorBoundaryMismatches.map(item => item.spanKey), ['page_28_unit_p28-block-18-font-size-12pt-unit-00__pt-BR']);
assert.equal(viewer.payload.beforeCount, 8);
assert.equal(viewer.payload.afterCount, 8);
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
assert.equal(pdfReceipt.status, 'passed_single_page_pdf_all_23_candidates_and_8_saved_records_verified');
assert.equal(pdfReceipt.pages, 1);
assert.deepEqual(pdfReceipt.pageSizePt, [820.346, 820.346]);
assert.equal(pdfReceipt.verifiedCandidateCount, 23);
assert.equal(pdfReceipt.verifiedPreservedHumanRecordCount, 8);
assert.deepEqual(pdfReceipt.missingUnitKeys, []);
assert.equal(pdfReceipt.replacementCharacters, 0);
assert.equal(pdfReceipt.privateUseCharacters, 0);
assert.equal(pdfReceipt.printCopyfitOverflowCount, 0);
assert.equal(snapshot.diagnosticOnly.blankedSpanKeys.length, 0);
assert.equal(snapshot.layoutFrames.length, 3);
assert.ok([200, 224].includes(queue.items.length), `Unexpected starting queue size ${queue.items.length}`);

const candidateKeys = new Set(proposal.candidates.map(candidate => candidate.legacyBlockSpanKey));
const printedTargets = metrics.print.translationTargets.filter(target => candidateKeys.has(target.spanKey));
const viewerTargets = metrics.viewer.translationTargets.filter(target => candidateKeys.has(target.spanKey));
assert.equal(printedTargets.length, 23);
assert.equal(viewerTargets.length, 23);
const printedOverflowPt = Math.max(...printedTargets.flatMap(target => [target.edgeExcessPt.right, target.edgeExcessPt.bottom]));
assert.ok(printedOverflowPt <= 0.01, `Printed copyfit overflow is ${printedOverflowPt} pt.`);
const viewerSubpixelExcess = viewerTargets.flatMap(target => [
  { spanKey: target.spanKey, edge: 'right', excessPt: target.edgeExcessPt.right },
  { spanKey: target.spanKey, edge: 'bottom', excessPt: target.edgeExcessPt.bottom },
]).filter(item => item.excessPt > 0.01);
assert.deepEqual(viewerSubpixelExcess.map(item => [item.spanKey, item.edge]), [['page_28_block_5__pt-BR', 'bottom']]);
assert.ok(viewerSubpixelExcess[0].excessPt < 0.1);

for (const candidate of proposal.candidates) {
  candidate.status = 'technically_verified_pending_human_review';
  candidate.technicalStatus = 'verified_in_viewer_readonly_editor_copyfit_and_pdf';
  candidate.editorialStatus = 'pending_human_review';
  candidate.diagnosticRendering = 'proposal';
  candidate.verifiedIn = ['PT-BR Viewer v4', 'read-only Admin Editor v1', 'Copyfit V3 v4 metrics', 'isolated one-page PT-BR PDF v4 and raster'];
}
for (const record of proposal.preservedHumanRecords) {
  record.status = 'preserved_existing_Payload_record';
  record.editorialStatus = 'unchanged_pending_no_new_review_item';
  record.verifiedIn = ['PT-BR Viewer v4 exact rendered target', 'PDF v4 extracted text'];
  record.payloadUnchanged = true;
  record.editorStatus = record.existingRecordId === 232
    ? 'legacy_span_key_mismatch_in_current_semantic_heading_editor_field; source text shown there; no save performed'
    : 'exact saved PT-BR value confirmed in read-only semantic field; dialog cancelled';
}

const dom = await readJson('apps/web/public/pages/page_028/page_028_dom.json');
const headingBlock = dom.blocks.find(block => block.id === 'block_18');
const legacyHeadingUnit = headingBlock.typographicSpanUnits.find(unit => unit.id === 'p28-block-18-font-size-12pt-unit-00');
const headingSpanRefs = new Set(legacyHeadingUnit.spanRefs);
const headingSourceBoxes = headingBlock.lines.flatMap((line, lineIndex) => line.spans.map((span, spanIndex) => ({
  line, span, lineIndex, spanIndex,
}))).filter(({ line, span, spanIndex }) => headingSpanRefs.has(`${line.id}:${span.sourceSpanIndex ?? spanIndex}`))
  .map(({ span }) => span.bbox);
proposal.technicalExceptions = [{
  id: 'p28-item-upgrade-saved-heading-key',
  sourceBlockId: 'block_18',
  sourceBlockIds: ['block_18'],
  spanKey: 'page_28_unit_p28-block-18-font-size-12pt-unit-00__pt-BR',
  payloadRecordId: 232,
  currentEditorUnitKey: 'page_28_unit_p28-block-18-heading-size-12pt__pt-BR',
  sourceUnitId: legacyHeadingUnit.id,
  sourceBboxPt: union(headingSourceBoxes),
  category: 'legacy_saved_record_editor_key_mismatch',
  status: 'open',
  reason: 'The saved Portuguese heading is visible in the Viewer and PDF under its legacy span key. Selecting the corresponding semantic heading field in Admin Editor opens the English source text because that field uses a different key. The existing Payload record remains unchanged.',
  sourceText: 'Unlocking Item Upgrades',
  proposedText: 'Desbloqueando Aprimoramentos de Item',
  requiredAction: 'Review a separate, reversible mapping or migration from the existing legacy span key to the semantic heading field. Do not overwrite or delete the saved record before human review.',
  diagnosticRendering: 'existing saved translation remains visible and preserved; no blank or replacement is applied',
  verifiedIn: ['Viewer and PDF show the exact saved Portuguese text', 'read-only Admin Editor reproduces English source in the newer semantic heading field', 'all Editor dialogs cancelled; no Payload writes'],
}];
proposal.status = 'partial_editable_text_proposal_v4_23_units_viewer_editor_copyfit_pdf_verified_8_saved_records_preserved_1_legacy_editor_key_exception_human_review_pending';
proposal.counts = {
  candidates: 23, verifiedInViewer: 23, verifiedInEditor: 23, verifiedInPdf: 23,
  preservedHumanRecords: 8, preservedInViewer: 8, preservedInEditor: 7, preservedInPdf: 8,
  artworkExceptions: 0, sharedLanguageInvariantArtwork: 3, technicalExceptions: 1,
};
proposal.payload = {
  readOnlyMethod: 'GET', existingPageRecords: 8, existingPageLayoutFrames: 0,
  beforeAfterRecordEquality: true, writes: 0,
};
proposal.copyfit = {
  status: 'printed_candidates_pass_v3_viewer_subpixel_measurement_documented',
  diagnosticSnapshot: snapshotRel,
  metrics: metricsRel,
  viewerCandidateCount: 23,
  printCandidateCount: 23,
  maximumPrintedRightOrBottomExcessPt: printedOverflowPt,
  viewerSubpixelExcessPt: viewerSubpixelExcess,
  snapshotLayoutFrames: 3,
  failedCandidates: [],
  rasterReview: 'Viewer and PDF raster show the complete page. The 23 new PT-BR candidates and all eight pre-existing PT-BR records are visible. The caption in block_5 has a 0.080 pt viewer-only bottom measurement, no printed excess, and no visible clipping in the Viewer or PDF raster.',
};
proposal.validation = {
  viewerEditorReceipt: viewerReceiptRel,
  pdfReceipt: pdfReceiptRel,
  pdf: pdfRel,
  viewerScreenshot: proof + '/viewer-readonly-pt-BR-diagnostic-v4.png',
  printScreenshot: proof + '/print-pt-BR-diagnostic-v4.png',
  editorScreenshot: proof + '/editor-readonly-v1.png',
  copyfitMetrics: metricsRel,
  verifiedCandidateSpanKeys: proposal.candidates.map(candidate => candidate.legacyBlockSpanKey),
  preservedHumanRecordSpanKeys: proposal.preservedHumanRecords.map(record => record.spanKey),
  legacyEditorMismatchSpanKeys: [proposal.technicalExceptions[0].spanKey],
  payloadTranslationsBefore: 8, payloadTranslationsAfter: 8,
  payloadLayoutFramesBefore: 0, payloadLayoutFramesAfter: 0,
  observedApiMethods: viewer.observedApiMethods,
  payloadWrites: 0,
  canonicalAssetsUnchangedDuringReadOnlyVerification: true,
};
proposal.sourceReview.existingPayloadTranslations = 8;
proposal.sourceReview.existingPayloadLayoutFrames = 0;
proposal.sourceReview.payloadWrites = 0;
await writeJson(proposalRel, proposal);

let proposalMarkdown = await readFile(resolve(root, markdownRel), 'utf8');
proposalMarkdown = replaceLine(proposalMarkdown, line => line.startsWith('**Estado:**'),
  '**Estado:** 23 unidades novas passaram no Viewer, Editor read-only, Copyfit V3 de impressão e PDF. Oito traduções humanas preexistentes foram preservadas; sete correspondem no Editor. O heading salvo sob uma chave antiga aparece corretamente no Viewer/PDF, mas a caixa semântica atual abre o inglês. Revisão humana e exceção técnica de chave pendentes; zero writes no Payload.', 'proposal status');
if (!proposalMarkdown.includes('## Verificação técnica v4')) {
  proposalMarkdown = proposalMarkdown.replace('## Unidades editáveis',
    '## Verificação técnica v4\n\n- Viewer PT-BR: 23/23 novas propostas e 8/8 registros salvos renderizam exatamente.\n- Editor read-only: 23/23 propostas novas e 7/8 registros salvos correspondem. O registro ID 232 usa uma chave de span legada; a caixa semântica atual abre “Unlocking Item Upgrades”. O diálogo foi cancelado e o Payload permaneceu intacto.\n- Copyfit V3/PDF: os 23 candidatos têm zero excesso à direita/abaixo no PDF. Uma medição exclusiva do Viewer registra 0,080 pt abaixo no block_5, sem corte visível no raster. PDF de uma página, 820,346 × 820,346 pt, com 23 propostas e 8 registros salvos; zero caracteres de substituição ou uso privado.\n- Persistência: os oito registros PT-BR do Payload e zero frames da página permaneceram idênticos antes/depois; só chamadas GET, sem saves, mutações bloqueadas, erros de console ou de página.\n- Três frames da lista existem somente no snapshot. As três cartas físicas completas permanecem compartilhadas em inglês conforme autorização anterior; não são novas exceções de localização.\n\n## Unidades editáveis');
}
await writeFile(resolve(root, markdownRel), proposalMarkdown);

const queueIdsBefore = new Set(queue.items.map(item => item.id));
const humanEvidence = evidence;
const humanItems = proposal.candidates.map(candidate => ({
  id: candidate.spanKey + '::human-review', page: 28,
  sourceBlockId: candidate.sourceBlockId, sourceUnitIds: candidate.sourceUnitIds,
  spanKey: candidate.spanKey, bboxPt: union(candidate.sourceBboxes),
  category: 'human_terminology_editorial_review', status: 'pending_human_review',
  reason: (candidate.pendingTerms ?? []).join('; '),
  sourceText: candidate.sourceText, proposedText: candidate.proposalText,
  verifiedIn: ['official source page 28 review', 'PT-BR Viewer v4', 'read-only Admin Editor v1', 'one-page PDF v4 and Copyfit V3 metrics'],
  editor: 'Exact candidate confirmed in the read-only editor; the dialog was cancelled without saving.',
  evidence: humanEvidence,
}));
const technical = proposal.technicalExceptions[0];
const technicalItem = {
  id: technical.id + '::legacy-editor-key', page: 28,
  sourceBlockId: technical.sourceBlockId, sourceBlockIds: technical.sourceBlockIds,
  spanKey: technical.spanKey, bboxPt: technical.sourceBboxPt,
  category: technical.category, status: 'open', reason: technical.reason,
  payloadRecordId: technical.payloadRecordId,
  sourceText: technical.sourceText, proposedText: technical.proposedText,
  requiredAction: technical.requiredAction,
  diagnosticRendering: technical.diagnosticRendering,
  verifiedIn: technical.verifiedIn,
  evidence: humanEvidence,
};
const additions = [...humanItems, technicalItem];
assert.equal(additions.length, 24);
const existingAdditionIds = additions.filter(item => queueIdsBefore.has(item.id)).map(item => item.id);
if (queue.items.length === 200) {
  assert.deepEqual(existingAdditionIds, []);
  queue.items.push(...additions);
} else {
  assert.equal(queue.items.length, 224);
  assert.equal(existingAdditionIds.length, additions.length, 'Partial p.28 queue write detected.');
}
queue.sourceProposals ??= [];
for (const item of [proposalRel, markdownRel]) if (!queue.sourceProposals.includes(item)) queue.sourceProposals.push(item);
assert.equal(queue.items.length, 224);
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
const p28Index = csvLines.findIndex((line, index) => index > 0 && parseCsv(line)[0] === '28' && parseCsv(line)[1] === '28');
assert.ok(p28Index > 0, 'Missing p.28 row in page-status.csv');
const p28 = parseCsv(csvLines[p28Index]);
assert.equal(p28.length, 6);
p28[3] = 'official_pdf_page_28_compared_with_current_english_viewer_export_2026-10-16';
p28[4] = 'partial_editable_text_proposal_v4_23_units_viewer_editor_copyfit_pdf_verified_8_saved_records_preserved_1_legacy_editor_key_exception_human_review_pending';
p28[5] = 'Proposta PT-BR v4 cobre 23 novas unidades; 23/23 foram verificadas no Viewer, Editor read-only, Copyfit V3 de impressão e PDF. Oito registros humanos existentes foram preservados e aparecem no Viewer/PDF; sete correspondem no Editor. O registro id 232 fica aberto porque a chave de span antiga não corresponde ao campo semântico atual, que abre o inglês. Três frames de lista existem só no snapshot; as três cartas físicas permanecem compartilhadas em inglês conforme autorização anterior. Zero Payload writes. Ver ' + reportRel + '.';
csvLines[p28Index] = csvEncode(p28);
await writeFile(csvPath, csvLines.join('\n') + '\n');

const p28Bullet = '- **p.28:** proposta v4 cobre 23 novas unidades; 23/23 passaram no Viewer, Editor read-only, Copyfit V3 de impressão e PDF. Oito traduções humanas salvas foram preservadas e aparecem no Viewer/PDF; sete correspondem no Editor. O registro 232 permanece intacto, com uma exceção de chave legada que abre o inglês na caixa semântica atual. Três frames de lista existem somente no snapshot; três cartas permanecem compartilhadas em inglês conforme autorização anterior. Revisão humana pendente; zero Payload writes. Ver [relatório v4](../project-progress/2026-10-16-p028-item-upgrades-proposal-v4.md).';
const p27Bullet = '- **p.27:** proposta v10 cobre 30 unidades; 27/27 passaram no Viewer, Editor read-only, Copyfit V3 e PDF. Três unidades ficam vazias só no snapshot por colisões em lista, faixas e legenda; três pares de cartas aguardam localização de arte. Revisão humana pendente; zero Payload writes. Ver [relatório v10](../project-progress/2026-10-16-p027-item-tiers-and-types-proposal-v10.md).';
let progress = await readFile(resolve(root, progressRel), 'utf8');
if (!progress.includes('- **p.28:**')) progress = progress.replace('- **p.27:**', p28Bullet + '\n- **p.27:**');
progress = replaceLine(progress, line => line.startsWith('- Conteúdo localizável com proposta recuperável neste lote:'),
  '- Conteúdo localizável com proposta recuperável neste lote: p.18 (29 unidades), p.19 (28), p.21 (22; 2 bloqueadas), p.22 (5; 1 bloqueada), p.20 (1 título e grupo de arte), p.23 (17), p.24 (43), p.25 (12 propostas; 9 verificadas e 3 bloqueadas), p.26 (15 verificadas; 1 bloqueio estrutural e 8 exceções de arte), p.27 (30 propostas; 27 verificadas e 3 bloqueadas) e p.28 (23 novas propostas, 8 registros salvos preservados e 1 exceção de chave no Editor).', 'coverage summary');
progress = replaceLine(progress, line => line.startsWith('- Dez páginas têm algum conteúdo proposto.') || line.startsWith('- Onze páginas têm algum conteúdo proposto.'),
  '- Onze páginas têm algum conteúdo proposto. Viewer/Editor/PDF cobrem propostas nas p.18/p.19, quatro unidades da p.22, o título da p.20, 17/17 unidades da p.23, 43/43 da p.24, 9/9 candidatas ativas da p.25, 15/15 da p.26, 27/30 da p.27 e 23/23 unidades novas da p.28. Na p.28, oito registros salvos também aparecem no Viewer/PDF; sete correspondem no Editor, e a chave legada do registro 232 segue em exceção técnica. P.21 ainda aguarda Editor; p.27 tem três unidades em branco apenas no diagnóstico. As verificações técnicas não equivalem a aprovação editorial nem a cobertura integral das páginas.', 'surface coverage');
progress = replaceLine(progress, line => line.startsWith('- Revisão editorial humana:'), '- Revisão editorial humana: pendente nas onze páginas. Aprovado editorialmente: nenhuma.', 'human review coverage');
progress = replaceLine(progress, line => line.startsWith('- Fila deste conjunto:'),
  '- Fila deste conjunto: 224 itens únicos — 19 p.18; 31 p.19; 8 p.21; 2 p.22; 1 grupo de arte p.20; 11 decisões humanas e 1 exceção de arte p.23; 36 decisões humanas e 1 exemplo misto salvo p.24; 12 propostas humanas, 14 grupos de arte e 3 reparos técnicos p.25; 15 decisões humanas, 8 grupos de arte, 1 reparo estrutural e 1 restauração resolvida p.26; 30 decisões humanas, 3 grupos de arte e 3 exceções técnicas p.27; 23 decisões humanas e 1 exceção de chave no Editor p.28. A reconciliação de exceções para as demais páginas ainda não foi feita.', 'exception queue summary');
await writeFile(resolve(root, progressRel), progress);

let projectState = await readFile(resolve(root, projectStateRel), 'utf8');
projectState = projectState.replace('e p.27 (27 candidatos verificados, três unidades em branco no diagnóstico e três grupos de arte pendentes).', 'p.27 (27 candidatos verificados, três unidades em branco no diagnóstico e três grupos de arte pendentes) e p.28 (23 novas propostas verificadas, oito registros humanos preservados e uma exceção técnica de chave legada).');
if (!projectState.includes('- **p.28:**')) projectState = projectState.replace('## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n',
  '## Atualização corrente — ativações técnicas e propostas (15 e 16/10/2026)\n\n' + p28Bullet.replace('../project-progress/', 'project-progress/') + '\n\n');
await writeFile(resolve(root, projectStateRel), projectState);

let handoff = await readFile(resolve(root, handoffRel), 'utf8');
handoff = handoff.replace('e p.27 (27 unidades verificadas, três blocos em branco no snapshot e três grupos de arte pendentes).', 'p.27 (27 unidades verificadas, três blocos em branco no snapshot e três grupos de arte pendentes) e p.28 (23 unidades novas verificadas, oito registros preservados e uma chave legada de Editor em exceção).');
if (!handoff.includes('- **p.28:**')) {
  const recentMarker = '## Execução mais recente — 16/10/2026';
  assert.ok(handoff.includes(recentMarker));
  handoff = handoff.replace(recentMarker, recentMarker + '\n' + p28Bullet.replace('../project-progress/', 'docs/project-progress/') + '\n' + p27Bullet.replace('../project-progress/', 'docs/project-progress/') + '\n');
}
await writeFile(resolve(root, handoffRel), handoff);

let index = await readFile(resolve(root, progressIndexRel), 'utf8');
if (!index.includes('p.28: proposta “Aprimoramentos de Item” v4')) {
  index = '- [2026-10-16 — p.28: proposta “Aprimoramentos de Item” v4](2026-10-16-p028-item-upgrades-proposal-v4.md): 23/23 novas unidades validadas no Viewer, Editor read-only, Copyfit V3 de impressão e PDF; oito registros salvos preservados, com uma exceção de chave legada no Editor; zero Payload writes.\n' + index;
}
await writeFile(resolve(root, progressIndexRel), index);

const report = `# 2026-10-16 — p.28: proposta “Aprimoramentos de Item” v4

## Resultado

A proposta v4 contém 23 novas unidades editáveis e preserva oito traduções PT-BR que já estavam no Payload. As 23 novas propostas foram conferidas no Viewer, Editor read-only, Copyfit V3 de impressão e PDF. Os oito registros salvos aparecem exatamente no Viewer e no PDF. Sete também correspondem no Editor; o registro 232 segue uma chave de span legada que a caixa semântica atual não resolve.

O PDF tem uma página de 820,346 × 820,346 pt; as 23 novas unidades e os oito registros salvos foram encontrados no texto extraído. Não há caracteres de substituição ou de uso privado. O Copyfit V3 não mede excesso à direita ou abaixo no PDF. No Viewer, block_5 mede 0,080 pt além da borda inferior, abaixo de um décimo de ponto e sem corte visível no raster. Não houve redução de tipografia.

## Exceção técnica

O registro Payload id 232, page_28_unit_p28-block-18-font-size-12pt-unit-00__pt-BR, guarda “Desbloqueando Aprimoramentos de Item” e aparece assim no Viewer/PDF. A unidade de heading atual no Editor usa page_28_unit_p28-block-18-heading-size-12pt__pt-BR; abrir essa caixa mostra o original em inglês, “Unlocking Item Upgrades”. O diálogo foi cancelado. O registro salvo permanece intacto e deve ser preservado até uma revisão separada de mapeamento/migração da chave.

## Arte, frames e persistência

As três cartas físicas completas continuam compartilhadas em inglês entre EN/PT-BR por instrução anterior; não são novas exceções de localização. Três frames maiores para os bullets existem somente no snapshot diagnóstico, dentro da coluna esquerda. O Payload manteve os mesmos oito registros de tradução e zero frames antes/depois. Todas as chamadas observadas foram GET; nenhum save foi executado. Os hashes dos assets canônicos da página permaneceram iguais.

## Revisão humana e continuidade

Foram adicionados 23 itens de revisão terminológica/editorial e uma exceção técnica de chave. A fila passou de 200 para 224 itens únicos: 223 abertos e um resolvido. Onze páginas têm conteúdo proposto no acompanhamento; nenhuma proposta foi aprovada editorialmente ou gravada no Payload. A continuação do Goal permanece aberta para a página 29 e as páginas restantes.

## Evidências

- Proposta: [JSON](../translations/proposals/page-028-item-upgrades-proposal-2026-10-16-v4.json) e [Markdown](../translations/proposals/page-028-item-upgrades-proposal-2026-10-16-v4.md).
- Viewer PT-BR: [captura v4](../../output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/viewer-readonly-pt-BR-diagnostic-v4.png). Editor: [captura read-only](../../output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/editor-readonly-v1.png) e [recibo](../../output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/viewer-editor-receipt-v1.json).
- PDF: [export v4](../../output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/page-028-pt-BR-diagnostic-v4.pdf), [raster](../../output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/print-pt-BR-diagnostic-v4.png), [verificação](../../output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/pdf-verification-v1.json) e [métricas Copyfit V3](../../output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/metrics-pt-BR-diagnostic-v4.json).
`;
await writeFile(resolve(root, reportRel), report);

console.log(JSON.stringify({
  status: 'p028_proposal_v4_finalized_23_candidates_8_records_preserved_legacy_editor_key_exception_open',
  queueItems: queue.items.length,
  unresolved: queue.items.filter(item => item.status !== 'resolved').length,
  resolved: queue.items.filter(item => item.status === 'resolved').length,
  pageStatusRow: p28,
  proposal: proposalRel,
  report: reportRel,
}, null, 2));
