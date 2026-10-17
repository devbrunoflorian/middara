#!/usr/bin/env node
/** Record the completed read-only p.25 Viewer/Editor/PDF verification. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const proposalRel = 'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v7.json';
const markdownRel = 'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v7.md';
const exceptionRel = 'docs/translations/localization-exceptions.json';
const statusRel = 'docs/translations/page-status.csv';
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v7';
const progressRel = 'docs/project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md';
const finalizationRel = proofRel + '/finalization-v7.json';
const pdfReceiptRel = proofRel + '/pdf-verification-v7.json';
const proofFiles = {
  viewer: proofRel + '/viewer-pt-BR-v7.png',
  editor: proofRel + '/editor-readonly-v7.png',
  viewerEditorReceipt: proofRel + '/viewer-editor-receipt-v7.json',
  pdf: proofRel + '/page-025-pt-BR-v7.pdf',
  pdfRaster: proofRel + '/page-025-pt-BR-v7-raster.png',
  pdfMetrics: proofRel + '/pdf-metrics-v7.json',
  pdfVerification: pdfReceiptRel,
  sourceReview: 'output/proofs/translation-readiness-2026-10-16/p025-source-review-v1',
};
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

const proposal = await readJson(proposalRel);
const viewerEditor = await readJson(proofRel + '/viewer-editor-receipt-v7.json');
const pdfReceipt = await readJson(pdfReceiptRel);
const sourceHashes = await readJson(proofRel + '/source-hashes-v2.json');
const snapshotBytes = await readFile(resolve(root, proofRel + '/snapshot/snapshot.json'));
const queue = await readJson(exceptionRel);
const dom = await readJson('apps/web/public/pages/page_025/page_025_dom.json');
const snapshot = JSON.parse(snapshotBytes.toString('utf8'));

assert.equal(proposal.page, 25);
assert.equal(proposal.candidates.length, 12);
assert.equal(viewerEditor.status, 'passed-live-viewer-readonly-editor-check-for-all-editable-proposed-units');
assert.equal(viewerEditor.candidateCount, 12);
assert.equal(viewerEditor.renderedCandidateCount, 9);
assert.equal(viewerEditor.editorVerifiedCandidateCount, 9);
assert.equal(viewerEditor.editorBoundaryMismatchCount, 0);
assert.equal(viewerEditor.viewerMissing.length, 0);
assert.equal(viewerEditor.payload.unchanged, true);
assert.equal(viewerEditor.canonicalAssetsUnchanged, true);
assert.equal(viewerEditor.saveClicked, false);
assert.equal(viewerEditor.blockedMutations.length, 0);
assert.equal(pdfReceipt.status, 'passed_single_page_pdf_export_and_raster_visual_review');
assert.equal(pdfReceipt.verifier.pages, 1);
assert.deepEqual(pdfReceipt.verifier.pageSizePt, [820.346, 820.346]);
assert.equal(pdfReceipt.verifier.replacementCharacters, 0);
assert.equal(pdfReceipt.verifier.privateUseCharacters, 0);
assert.equal(pdfReceipt.snapshotTranslationRecords, 13);
assert.equal(pdfReceipt.selectableSnapshotTextsFound, 13);
assert.deepEqual(pdfReceipt.missingSnapshotTextKeys, []);
assert.equal(sourceHashes.snapshotSha256, sha256(snapshotBytes));
assert.equal(proposal.canonicalDomSha256, sourceHashes['page_025_dom.json']);
assert.equal(proposal.backgroundSha256, sourceHashes['background.webp']);
assert.equal(proposal.canonicalLayoutFramesSha256, sourceHashes['layout_frames.json']);
assert.equal(proposal.sourcePdfSha256, sourceHashes.sourcePdfSha256);
assert.equal(snapshot.translations.length, 13);

for (const rel of Object.values(proofFiles).filter(value => value.startsWith(proofRel))) await mustExist(rel);
await mustExist(proposalRel);

const verifiedCandidateKeys = new Set(viewerEditor.editorChecks
  .filter(check => check.selected && check.proposalMatched && check.editable && check.cancelled)
  .map(check => check.spanKey));
assert.equal(verifiedCandidateKeys.size, 9);
const verifiedCandidates = proposal.candidates.filter(candidate => verifiedCandidateKeys.has(candidate.spanKey));
assert.equal(verifiedCandidates.length, 9);
const structuralCandidates = proposal.candidates.filter(candidate => !verifiedCandidateKeys.has(candidate.spanKey));
assert.equal(structuralCandidates.length, 3);

for (const candidate of proposal.candidates) {
  if (verifiedCandidateKeys.has(candidate.spanKey)) {
    candidate.status = 'technically_verified_pending_human_review';
    candidate.technicalStatus = 'verified_in_viewer_readonly_editor_and_pdf';
    candidate.diagnosticRendering = 'proposal';
    candidate.verifiedIn = [
      'PT-BR Viewer v7', 'read-only Admin Editor v7', 'isolated PT-BR PDF v7 and raster',
    ];
  } else {
    candidate.status = 'source_english_fallback_pending_structure_repair_and_human_review';
    candidate.technicalStatus = 'blocked_by_verified_viewer_and_editor_unit_boundary_failure';
    candidate.diagnosticRendering = 'source_english_fallback';
  }
}
proposal.status = 'technically_verified_pending_human_review_artwork_localization_and_three_structure_repairs';
proposal.counts = {
  candidates: 12,
  verifiedInViewer: 9,
  verifiedInEditor: 9,
  verifiedInPdf: 9,
  preservedHumanRecords: 4,
  artworkExceptions: 14,
  technicalExceptions: 3,
};
proposal.sourceReview.fidelityNote = 'The official raster, English Viewer and one-page English export were compared. The complete Nightingale card, including labels, ability copy, stats, values and name, is already printed in background.webp. Nine text units render as PT-BR and pass Viewer, read-only Editor and one-page PDF verification. Three units with duplicate or overlapping output remain in source English in the diagnostic, with their complete PT-BR proposals retained as technical exceptions. Four saved human translations are unchanged.';
proposal.validation = {
  viewerEditorReceipt: proofFiles.viewerEditorReceipt,
  pdfReceipt: pdfReceiptRel,
  verifiedCandidateSpanKeys: verifiedCandidates.map(candidate => candidate.spanKey),
  structuralExceptionIds: proposal.technicalExceptions.map(item => item.id),
  pdfSnapshotTranslationRecords: 13,
  pdfSelectableSnapshotTextsFound: 13,
  payloadWrites: 0,
  canonicalAssetsUnchanged: true,
};
await writeFile(resolve(root, proposalRel), JSON.stringify(proposal, null, 2) + '\n');

let proposalMarkdown = await readFile(resolve(root, markdownRel), 'utf8');
proposalMarkdown = proposalMarkdown.replace(
  /^\*\*Estado:\*\*.*$/mu,
  '**Estado:** 12 unidades editáveis têm proposta; 9/9 unidades ativas passaram Viewer, Editor read-only e PDF de uma página. Três unidades permanecem em fallback inglês por duplicação/colisão confirmada e incompatibilidade de seleção no Editor. Quatorze grupos impressos no card aguardam localização de arte. Quatro traduções humanas (IDs 320–323) foram mantidas; zero writes no Payload e nenhuma alteração canônica.',
);
proposalMarkdown = proposalMarkdown.replaceAll(
  '**Diagnóstico:** proposal',
  '**Diagnóstico:** Viewer, Editor read-only e PDF verificados; revisão humana pendente',
);
const technicalSection = `\n## Verificações técnicas\n\n- Viewer PT-BR: 9/9 candidatos ativos visíveis; nenhuma unidade ativa ausente.\n- Editor read-only: 9/9 unidades selecionadas e conferidas; todos os diálogos cancelados sem salvar.\n- PDF PT-BR: uma página de 820,346 × 820,346 pt; 9 candidatos e 4 traduções humanas salvos (13 registros) com texto selecionável. Sem caracteres de substituição ou de uso privado.\n- Raster do PDF: p.83 cabe em uma linha; p.85 ocupa três linhas e termina antes da legenda. Nenhuma colisão ou corte visual observado.\n- Payload: quatro registros antes e depois, IDs 320–323 intactos; zero writes. Hashes da DOM, arte, molduras e snapshot-fonte conferem com os recibos.\n- A cópia concisa de p.83 foi a segunda tentativa planejada e cabe sem overflow; a proposta de p.85 também cabe no frame.\n`;
if (!proposalMarkdown.includes('## Verificações técnicas')) {
  proposalMarkdown = proposalMarkdown.replace('## Unidades de página editáveis', technicalSection + '\n## Unidades de página editáveis');
}
await writeFile(resolve(root, markdownRel), proposalMarkdown);

const exceptionIdsBefore = new Set(queue.items.map(item => item.id));
assert.equal(queue.items.length, 110);
assert.equal(queue.items.filter(item => item.page === 25).length, 0);
const evidence = [proposalRel, markdownRel, proofFiles.viewer, proofFiles.viewerEditorReceipt, proofFiles.pdf, proofFiles.pdfRaster, pdfReceiptRel];
const candidateExceptions = proposal.candidates.map(candidate => ({
  id: candidate.spanKey + '::human-review',
  page: 25,
  sourceBlockId: candidate.sourceBlockId,
  spanKey: candidate.spanKey,
  bboxPt: union(candidate.sourceBboxes),
  category: 'human_terminology_editorial_review',
  status: 'pending_human_review',
  reason: (candidate.pendingTerms ?? []).join(' '),
  sourceText: candidate.sourceText,
  proposedText: candidate.proposalText,
  verifiedIn: verifiedCandidateKeys.has(candidate.spanKey)
    ? ['official source PDF and English Viewer', 'PT-BR Viewer v7', 'read-only Admin Editor v7', 'isolated PT-BR PDF v7 and raster']
    : ['official source PDF and English Viewer', 'PT-BR v7 diagnostic retains source English pending structure repair'],
  editor: verifiedCandidateKeys.has(candidate.spanKey)
    ? 'Proposal confirmed in the read-only editor; dialog cancelled without saving.'
    : 'The Editor does not select this exact source unit; do not save until the selection boundary is corrected.',
  evidence,
}));
const artworkExceptions = proposal.artworkExceptions.map(item => ({
  id: item.id + '::artwork-localization',
  page: 25,
  sourceBlockId: item.sourceBlockIds[0],
  sourceBlockIds: item.sourceBlockIds,
  spanKeys: item.spanKeys,
  bboxPt: domBlockUnion(dom, item.sourceBlockIds),
  category: item.category ?? 'printed_artwork_localization',
  status: 'pending_human_review',
  reason: item.reason,
  sourceText: item.sourceText,
  proposedText: item.proposedText,
  requiredAction: item.requiredAction,
  verifiedIn: ['official source PDF and English Viewer', 'PT-BR Viewer v7 and exported PDF raster confirm source artwork remains printed in English'],
  evidence: [...new Set([...(item.evidence ?? []), ...evidence])],
}));
const technicalExceptions = proposal.technicalExceptions.map(item => {
  const candidate = proposal.candidates.find(value => item.spanKeys.includes(value.spanKey));
  assert.ok(candidate, 'Missing related candidate for structural exception ' + item.id);
  return {
    id: item.id + '::structure-repair',
    page: 25,
    sourceBlockId: item.sourceBlockIds[0],
    sourceBlockIds: item.sourceBlockIds,
    spanKeys: item.spanKeys,
    bboxPt: union(candidate.sourceBboxes),
    category: item.category,
    status: 'open',
    reason: item.reason,
    sourceText: item.sourceText,
    proposedText: item.proposedText,
    requiredAction: item.requiredAction,
    verifiedIn: ['v5 reproduced duplicate/overlap and incorrect Editor boundary', 'v7 confirmed source-English fallback is stable in Viewer, Editor and PDF'],
    editor: 'Exact translated unit remains unverified; source-English fallback is retained until the source span and Admin selection boundary are corrected.',
    evidence: [...new Set([...(item.evidence ?? []), ...evidence])],
  };
});
const additions = [...candidateExceptions, ...artworkExceptions, ...technicalExceptions];
assert.equal(candidateExceptions.length, 12);
assert.equal(artworkExceptions.length, 14);
assert.equal(technicalExceptions.length, 3);
for (const item of additions) {
  assert.ok(!exceptionIdsBefore.has(item.id), 'Exception already exists: ' + item.id);
  queue.items.push(item);
}
queue.sourceProposals = [...new Set([...queue.sourceProposals, proposalRel])];
queue.updated = '2026-10-16';
assert.equal(queue.items.length, 139);
assert.equal(new Set(queue.items.map(item => item.id)).size, queue.items.length);
await writeFile(resolve(root, exceptionRel), JSON.stringify(queue, null, 2) + '\n');

let statusCsv = await readFile(resolve(root, statusRel), 'utf8');
const statusRow = [
  '25', '25', 'raw_pdf_transcript_generated_unreviewed', 'official_pdf_vs_viewer_visual_reviewed_2026-10-16',
  'partial_editable_text_proposal_v7_9_units_viewer_editor_pdf_raster_verified_human_review_pending',
  'The official PDF, English Viewer and one-page EN export were compared. PT-BR v7 proposes 12 editable units; 9/9 active candidates passed Viewer and read-only Editor, and all 9 plus 4 preserved saved translations were found in the one-page PDF. Raster review shows no visible collision; p.83 fits on one line and p.85 on three. Three source units remain English in the diagnostic pending exact span/Admin selection repair. Four saved records (IDs 320–323) are unchanged. Fourteen card-art localization exceptions and human terminology/editorial review remain open. Zero Payload writes; canonical page assets unchanged. See docs/project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md.',
].map(csvField).join(',');
assert.match(statusCsv, /^"25","25",.*$/mu);
statusCsv = statusCsv.replace(/^"25","25",.*$/mu, statusRow);
await writeFile(resolve(root, statusRel), statusCsv);

const report = `# p.25 — proposta PT-BR “Componentes da Carta de Aventureiro” v7\n\n**Data:** 2026-10-16  \n**Estado:** 9 de 12 candidatos editáveis passaram as verificações técnicas; 3 permanecem em fallback inglês para reparo de estrutura. Revisão terminológica/editorial humana e localização da arte pendentes.\n\n## Fonte e escopo\n\nA página oficial, o Viewer EN e a exportação EN de uma página foram comparados. O PDF-fonte tem SHA-256 \`${proposal.sourcePdfSha256}\`. O card completo de Nightingale — rótulos, habilidade, atributos, valores e nome — está impresso em \`background.webp\`; esses textos não foram reconstruídos sobre a imagem. Quatro traduções humanas existentes (IDs 320–323) foram preservadas.\n\n## Verificação da proposta\n\nA proposta v7 contém 12 unidades editáveis. Nove renderizam sem duplicação e foram confirmadas no Viewer PT-BR e no Editor somente leitura; os nove diálogos foram cancelados sem salvar. As outras três traduções completas permanecem recuperáveis no JSON, mas o diagnóstico usa o texto-fonte inglês até a correção das referências de ocorrência e da seleção no Admin.\n\n- Viewer: 9/9 candidatos ativos visíveis; zero ausentes.\n- Editor: 9/9 selecionados, correspondência exata com a proposta; zero divergências de limite.\n- Copyfit: p.83 cabe em uma linha na segunda tentativa planejada; p.85 cabe em três linhas sem invadir a legenda.\n- PDF: uma página de 820,346 × 820,346 pt; 9 propostas ativas mais os 4 registros humanos salvos têm texto selecionável (13/13). O verificador encontrou 1.243 caracteres, zero caracteres de substituição e zero caracteres de uso privado.\n- Raster: nenhum texto ativo foi cortado ou colidiu com a unidade seguinte. Os três fallbacks estruturais permanecem em inglês.\n- Persistência: quatro traduções antes/depois, mesmos IDs 320–323; zero writes no Payload; hashes da DOM, arte e molduras canônicas inalterados.\n\n## Exceções abertas\n\nA fila recebeu 12 propostas para revisão humana, 14 grupos de texto impresso na arte e 3 reparos técnicos de unidade/seleção. A fila passou de 110 para 139 IDs únicos. Terminologia, capitalização mecânica e redação continuam pendentes de revisão humana; a proposta não foi publicada.\n\nEvidências: [proposta JSON](../translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v7.json), [proposta Markdown](../translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v7.md), [recibo Viewer/Editor](../../${proofFiles.viewerEditorReceipt}), [recibo de verificação PDF](../../${pdfReceiptRel}), [PDF](../../${proofFiles.pdf}), [raster](../../${proofFiles.pdfRaster}) e [revisão da fonte EN](../../${proofFiles.sourceReview}/source-en-page-025.png).\n`;
await writeFile(resolve(root, progressRel), report, { flag: 'wx' });

const pageSummary = '- **p.25:** proposta v7 cobre 12 unidades editáveis; 9/9 candidatos ativos passaram Viewer, Editor read-only e PDF, e três ficam em fallback inglês até reparar limites de unidade/seleção. O raster não mostra colisões; p.83 cabe em uma linha e p.85 em três. Quatro traduções humanas foram preservadas; 14 grupos em arte, três reparos técnicos e a revisão humana seguem pendentes. Zero writes no Payload. Ver [relatório v7](project-progress/2026-10-16-p025-adventurer-card-proposal-v7.md).';
const goalRel = 'docs/translations/localization-goal-progress.md';
let goal = await readFile(resolve(root, goalRel), 'utf8');
if (!goal.includes('2026-10-16-p025-adventurer-card-proposal-v7.md')) {
  goal = goal.replace(
    /(- \*\*p\.24:\*\*[^\n]*\n)/u,
    '$1' + pageSummary + '\n',
  );
}
goal = goal.replace(
  'p.24 (43 unidades verificadas; decisões humanas pendentes).',
  'p.24 (43 unidades verificadas; decisões humanas pendentes), p.25 (12 propostas; 9 verificadas e 3 bloqueadas por estrutura/seleção).',
);
goal = goal.replace('Sete páginas têm algum conteúdo proposto.', 'Oito páginas têm algum conteúdo proposto.');
goal = goal.replace('e 43/43 candidatos da p.24;', 'e 43/43 candidatos da p.24 e 9/9 candidatos ativos da p.25;');
goal = goal.replace('pendente nas sete páginas.', 'pendente nas oito páginas.');
goal = goal.replace(
  '36 decisões humanas e 1 exemplo misto salvo p.24.',
  '36 decisões humanas e 1 exemplo misto salvo p.24; 12 propostas humanas, 14 grupos de arte e 3 reparos técnicos p.25.',
);
goal = goal.replace('Fila deste conjunto: 110 itens únicos —', 'Fila deste conjunto: 139 itens únicos —');
await writeFile(resolve(root, goalRel), goal);

let projectState = await readFile(resolve(root, 'docs/PROJECT_STATE.md'), 'utf8');
projectState = projectState.replace(
  'e p.24 (43 candidatos verificados nas três superfícies; decisões humanas pendentes).',
  'e p.24 (43 candidatos verificados nas três superfícies; decisões humanas pendentes) e p.25 (9 candidatos verificados nas três superfícies, três reparos estruturais e arte pendentes).',
);
projectState = projectState.replace(
  '- **p.24:** proposta PT-BR v5 cobre 43 unidades editáveis; 43/43 passaram Viewer, Editor read-only e PDF de uma página. O raster não mostra colisões; quatro limites direitos e a expansão do callout IMPORTANT estão documentados. Três registros salvos foram preservados; 36 decisões humanas e o exemplo ID 244 parcialmente em inglês seguem na fila. Frames de oito itens da lista existem apenas no snapshot; zero writes no Payload. Ver [relatório v5](project-progress/2026-10-16-p024-adventurers-items-proposal-v5.md).',
  '- **p.25:** ' + pageSummary.slice('- **p.25:** '.length).replace('project-progress/', 'project-progress/') + '\n\n- **p.24:** proposta PT-BR v5 cobre 43 unidades editáveis; 43/43 passaram Viewer, Editor read-only e PDF de uma página. O raster não mostra colisões; quatro limites direitos e a expansão do callout IMPORTANT estão documentados. Três registros salvos foram preservados; 36 decisões humanas e o exemplo ID 244 parcialmente em inglês seguem na fila. Frames de oito itens da lista existem apenas no snapshot; zero writes no Payload. Ver [relatório v5](project-progress/2026-10-16-p024-adventurers-items-proposal-v5.md).',
);
projectState = projectState.replace(
  '36 decisões sobre candidatos da p.24 e o exemplo humano parcialmente em inglês da p.24 aguardam revisão.',
  '36 decisões sobre candidatos da p.24, o exemplo humano parcialmente em inglês da p.24 e as decisões humanas/arte da p.25 aguardam revisão; três reparos estruturais da p.25 continuam abertos.',
);
await writeFile(resolve(root, 'docs/PROJECT_STATE.md'), projectState);

let handoff = await readFile(resolve(root, 'PROJECT-HANDOFF.md'), 'utf8');
handoff = handoff.replace(
  'e p.24 (43 unidades verificadas nas três superfícies, com revisão humana pendente).',
  'e p.24 (43 unidades verificadas nas três superfícies, com revisão humana pendente) e p.25 (9 candidatos ativos verificados, três unidades em fallback estrutural e arte/revisão humana pendentes).',
);
handoff = handoff.replace(
  'os 43 candidatos da p.24; p.21 ainda precisa do Editor,',
  'os 43 candidatos da p.24 e 9/9 candidatos ativos da p.25; p.21 ainda precisa do Editor,',
);
if (!handoff.includes('2026-10-16-p025-adventurer-card-proposal-v7.md')) {
  handoff = handoff.replace(
    /(- \*\*p\.24:\*\*[^\n]*\n)/u,
    '$1' + pageSummary.replace('project-progress/', 'docs/project-progress/') + '\n',
  );
}
await writeFile(resolve(root, 'PROJECT-HANDOFF.md'), handoff);

let progressReadme = await readFile(resolve(root, 'docs/project-progress/README.md'), 'utf8');
if (!progressReadme.includes('2026-10-16-p025-adventurer-card-proposal-v7.md')) {
  progressReadme = '- [2026-10-16 — p.25: proposta “Componentes da Carta de Aventureiro” v7](2026-10-16-p025-adventurer-card-proposal-v7.md): 9/9 candidatos ativos passaram Viewer/Editor/PDF; três unidades ficam em fallback inglês para reparo de limites, 14 grupos de arte e quatro registros humanos permanecem preservados; 29 novas exceções; zero Payload writes.\n' + progressReadme;
}
await writeFile(resolve(root, 'docs/project-progress/README.md'), progressReadme);

const finalization = {
  status: 'p025_proposal_v7_technical_review_complete_human_review_pending',
  page: 25,
  proposal: proposalRel,
  proposalSha256: sha256(await readFile(resolve(root, proposalRel))),
  sourcePdfSha256: proposal.sourcePdfSha256,
  snapshotSha256: sourceHashes.snapshotSha256,
  candidateCount: proposal.candidates.length,
  verifiedInViewer: viewerEditor.renderedCandidateCount,
  verifiedInEditor: viewerEditor.editorVerifiedCandidateCount,
  verifiedInPdf: pdfReceipt.snapshotTranslationRecords - proposal.preservedHumanRecords.length,
  pdfRecordCount: pdfReceipt.snapshotTranslationRecords,
  preservedHumanRecordIds: proposal.preservedHumanRecords.map(record => record.id),
  humanTerminologyExceptionsAdded: candidateExceptions.length,
  artworkExceptionsAdded: artworkExceptions.length,
  technicalExceptionsAdded: technicalExceptions.length,
  addedExceptionIds: additions.map(item => item.id),
  totalExceptionQueueItems: queue.items.length,
  payloadRecordsBefore: viewerEditor.payload.beforeCount,
  payloadRecordsAfter: viewerEditor.payload.afterCount,
  payloadRecordIds: viewerEditor.payload.ids,
  payloadWrites: 0,
  canonicalAssetsUnchanged: viewerEditor.canonicalAssetsUnchanged,
  pdf: proofFiles.pdf,
  pdfRaster: proofFiles.pdfRaster,
  pdfReceipt: pdfReceiptRel,
  pageProgress: progressRel,
};
await writeFile(resolve(root, finalizationRel), JSON.stringify(finalization, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(finalization, null, 2));
