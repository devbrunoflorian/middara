#!/usr/bin/env node
/** Record verified p.24 proposal evidence without changing Payload or canonical assets. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const page = 24;
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p024-adventurers-items-proposal-v5';
const proofDir = resolve(root, proofRel);
const proposalRel = 'docs/translations/proposals/page-024-adventurers-items-proposal-2026-10-16-v5.json';
const proposalPath = resolve(root, proposalRel);
const markdownPath = resolve(root, proposalRel.replace(/\.json$/u, '.md'));
const receiptPath = resolve(proofDir, 'pdf-export-receipt-v5.json');
const finalizationPath = resolve(proofDir, 'finalization-receipt-v5.json');
const progressPath = resolve(root, 'docs/project-progress/2026-10-16-p024-adventurers-items-proposal-v5.md');
const exceptionPath = resolve(root, 'docs/translations/localization-exceptions.json');
const statusPath = resolve(root, 'docs/translations/page-status.csv');
const pdfRel = proofRel + '/page-024-pt-BR-v5.pdf';
const rasterRel = proofRel + '/page-024-pt-BR-v5-raster.png';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

const proposal = await readJson(proposalPath);
const viewerEditor = await readJson(resolve(proofDir, 'viewer-editor-receipt-v5.json'));
const metrics = await readJson(resolve(proofDir, 'pdf-metrics-v5.json'));
const sourceHashes = await readJson(resolve(proofDir, 'source-hashes-v5.json'));
const snapshotBytes = await readFile(resolve(proofDir, 'snapshot/snapshot.json'));
assert.equal(proposal.proposalId, 'page-024-adventurers-items-2026-10-16-v5');
assert.equal(proposal.candidates.length, 43);
assert.equal(viewerEditor.status, 'passed-live-viewer-readonly-editor-check-for-all-proposed-units');
assert.equal(viewerEditor.candidateCount, 43);
assert.equal(viewerEditor.viewerChecks.filter(item => item.visible).length, 43);
assert.equal(viewerEditor.editorChecks.filter(item => item.selected && item.proposalMatched && item.editable && item.cancelled).length, 43);
assert.equal(viewerEditor.saveClicked, false);
assert.equal(viewerEditor.payload.beforeCount, 3);
assert.equal(viewerEditor.payload.afterCount, 3);
assert.equal(viewerEditor.payload.unchanged, true);
assert.deepEqual(viewerEditor.payload.ids.map(Number).sort((a, b) => a - b), [244, 248, 249]);
assert.equal(viewerEditor.observedApiMethods.join(','), 'GET');
assert.deepEqual(viewerEditor.blockedMutations, []);
assert.deepEqual(viewerEditor.pageErrors, []);
assert.equal(viewerEditor.canonicalAssetsUnchanged, true);
assert.equal(viewerEditor.measurements.length, 43);
assert.equal(viewerEditor.measurements.filter(item => item.rendered && !item.overflow).length, 43);

const pdfTargets = metrics.print.translationTargets;
assert.equal(pdfTargets.length, 46, 'PDF should contain 43 proposal records and three preserved human records.');
const normalizedKey = key => key.endsWith('__pt-BR') ? key : key + '__pt-BR';
const candidateMetrics = proposal.candidates.map(candidate => {
  const metric = pdfTargets.find(item => item.spanKey === normalizedKey(candidate.spanKey));
  assert.ok(metric, 'PDF metrics omitted ' + candidate.spanKey);
  assert.ok(metric.lineCount > 0, 'No PDF text lines for ' + candidate.spanKey);
  return { candidate, metric };
});
assert.equal(candidateMetrics.length, 43);
const rightEdgeExceptions = candidateMetrics.filter(item => item.metric.edgeExcessPt.right > 0);
const bottomEdgeExceptions = candidateMetrics.filter(item => item.metric.edgeExcessPt.bottom > 0);
assert.equal(rightEdgeExceptions.length, 4);
assert.ok(Math.max(...rightEdgeExceptions.map(item => item.metric.edgeExcessPt.right)) < 2.5);
assert.deepEqual(bottomEdgeExceptions.map(item => item.metric.spanKey), ['page_24_block_16__pt-BR']);
assert.ok(Math.abs(bottomEdgeExceptions[0].metric.edgeExcessPt.bottom - 10.277469919142106) < 0.01);
assert.equal(pdfTargets.find(item => item.spanKey === 'page_24_block_29__pt-BR').lineCount, 2);
await readFile(resolve(root, rasterRel));

const verify = spawnSync('python', [
  'scripts/verify_page_pdf_export.py', resolve(root, pdfRel), '--page', String(page), '--contains', 'Aventureiros e Itens',
], { cwd: root, encoding: 'utf8' });
assert.equal(verify.status, 0, 'PT-BR PDF verification failed: ' + (verify.stderr || verify.stdout));
const pdfVerification = JSON.parse(verify.stdout);
assert.equal(pdfVerification.pages, 1);
assert.equal(pdfVerification.replacementCharacters, 0);
assert.equal(pdfVerification.privateUseCharacters, 0);
assert.equal(sourceHashes.snapshotSha256, sha256(snapshotBytes));
assert.equal(sourceHashes.payloadWrites, 0);

proposal.status = 'editable_text_proposal_v5_43_units_viewer_editor_pdf_checked_visual_reviewed_human_review_pending';
proposal.counts = {
  ...proposal.counts,
  verifiedInViewer: 43,
  verifiedInEditor: 43,
  verifiedInPdf: 43,
  preservedHumanRecords: 3,
};
proposal.candidates = proposal.candidates.map(candidate => ({
  ...candidate,
  status: 'draft_pending_human_review',
  technicalStatus: 'passed_viewer_editor_pdf_raster_review_v5',
  editorialStatus: 'pending_human_review',
}));
proposal.copyfit = {
  engine: 'PageRenderer, read-only Rich Block Editor, and existing snapshot-based visual PDF exporter',
  status: 'viewer_editor_pdf_and_full_page_raster_reviewed_with_documented_frame_metrics',
  viewerEditorReceipt: proofRel + '/viewer-editor-receipt-v5.json',
  pdfReceipt: proofRel + '/pdf-export-receipt-v5.json',
  pdfMetrics: proofRel + '/pdf-metrics-v5.json',
  pdfRaster: rasterRel,
  result: 'All 43 candidates were visible in the Viewer, selected and matched in the read-only Editor, and verified in the one-page PDF. Browser measurements report no overflow flags. The full PDF raster was inspected: the shortened block_29 paragraph now clears the following discipline rules, and no visible text collisions or clipping remain. Four lines extend 1.18–2.46 pt beyond their measured source frame right edges while staying clear of adjacent content. The block_16 IMPORTANT callout grows to three lines, 10.28 pt below its first-line frame; its rendered panel expands with the text and retains visible padding. These geometry metrics are recorded as review evidence rather than hidden.',
  diagnosticFailurePolicy: proposal.diagnosticFailurePolicy,
};
proposal.sourceReview = {
  ...proposal.sourceReview,
  status: 'official_pdf_english_viewer_and_pdf_compared_2026-10-16',
  englishEvidence: [
    'output/proofs/translation-readiness-2026-10-16/p024-source-review-v1/source-en-page-024.png',
    'output/proofs/translation-readiness-2026-10-16/p024-source-review-v1/en-viewer-v1.png',
    'output/proofs/translation-readiness-2026-10-16/p024-source-review-v1/page-024-en-source-v1.pdf',
  ],
};
proposal.evidence = {
  viewerEditorReceipt: proofRel + '/viewer-editor-receipt-v5.json',
  ptBrViewer: proofRel + '/viewer-pt-BR-v5.png',
  ptBrEditor: proofRel + '/editor-readonly-v5.png',
  ptBrPrintCapture: proofRel + '/print-v5.png',
  ptBrPdf: pdfRel,
  ptBrPdfRaster: rasterRel,
  pdfMetrics: proofRel + '/pdf-metrics-v5.json',
  sourceHashes: proofRel + '/source-hashes-v5.json',
};
await writeFile(proposalPath, JSON.stringify(proposal, null, 2) + '\n');
const proposalSha256 = sha256(await readFile(proposalPath));
const snapshotSha256 = sha256(snapshotBytes);

const pdfReceipt = {
  status: 'passed_snapshot_page_export_and_independent_pdf_verification_visual_raster_reviewed',
  page, language: 'pt-BR', profile: 'visual', proposal: proposalRel, proposalSha256,
  snapshotSha256, sourcePdfSha256: proposal.sourcePdfSha256, pdf: pdfRel,
  raster: rasterRel,
  pages: pdfVerification.pages, pageSizePt: pdfVerification.pageSizePt,
  selectableCharacters: pdfVerification.selectableCharacters,
  replacementCharacters: pdfVerification.replacementCharacters,
  privateUseCharacters: pdfVerification.privateUseCharacters,
  embeddedImageObjects: pdfVerification.embeddedImageObjects,
  candidateCount: 43, verifiedTranslationRecordCount: pdfTargets.length,
  rightEdgeFrameMetrics: rightEdgeExceptions.map(item => ({ spanKey: item.metric.spanKey, excessPt: item.metric.edgeExcessPt.right })),
  expandingCalloutFrameMetric: {
    spanKey: bottomEdgeExceptions[0].metric.spanKey,
    bottomExcessPt: bottomEdgeExceptions[0].metric.edgeExcessPt.bottom,
    lineCount: bottomEdgeExceptions[0].metric.lineCount,
    renderedPanelVisuallyReviewed: true,
  },
  disciplineCopyfit: {
    spanKey: 'page_24_block_29__pt-BR',
    lineCount: pdfTargets.find(item => item.spanKey === 'page_24_block_29__pt-BR').lineCount,
    rasterReview: 'paragraph clears the following discipline rules',
  },
  independentVerification: pdfVerification,
  observedNetworkMethods: viewerEditor.observedApiMethods,
  payloadTranslationRecordsBefore: 3,
  payloadTranslationRecordsAfter: 3,
  payloadRecordIdsUnchanged: [244, 248, 249],
  payloadWrites: 0,
  canonicalAssetsUnchanged: true,
};
await writeFile(receiptPath, JSON.stringify(pdfReceipt, null, 2) + '\n', { flag: 'wx' });

let markdown = await readFile(markdownPath, 'utf8');
markdown = markdown.replace(/^NaN## Unidades propostas$/mu, [
  '**Estado:** 43 unidades propostas e conferidas no Viewer PT-BR, no Editor read-only e no PDF visual de uma página. A rasterização completa não mostra colisões; quatro limites de linha e o crescimento de um callout são documentados nas métricas. As 36 decisões de terminologia/editorial e um exemplo humano parcialmente em inglês permanecem para revisão. Os três registros salvos foram preservados; nada foi gravado no Payload.',
  '',
  '## Validação técnica',
  '',
  '- Viewer PT-BR: 43/43 candidatos visíveis; 43/43 medições sem flags de overflow.',
  '- Rich Block Editor/Admin read-only: 43/43 candidatos selecionados e conferidos com a proposta; todos os diálogos foram cancelados sem salvar.',
  '- PDF PT-BR: uma página, ' + pdfVerification.pageSizePt[0] + ' × ' + pdfVerification.pageSizePt[1] + ' pt, 46 registros verificados (43 candidatos e 3 traduções humanas preservadas), ' + pdfVerification.selectableCharacters + ' caracteres selecionáveis, zero caracteres de substituição ou de uso privado.',
  '- Raster PDF: o parágrafo de block_29 cabe em duas linhas e não encosta nas regras seguintes. Não há colisões ou cortes aparentes. Quatro linhas excedem o limite direito medido dos frames em 1,18–2,46 pt, sem invadir conteúdo adjacente; o callout block_16 se expande para três linhas e mantém espaço visível dentro do painel.',
  '- Persistência: somente GET observado; os IDs 244, 248 e 249 foram mantidos sem alteração; zero gravações. Os assets canônicos permaneceram inalterados.',
  '- Evidências: [Viewer/Editor](../../../' + proofRel + '/viewer-editor-receipt-v5.json), [métricas PDF](../../../' + proofRel + '/pdf-metrics-v5.json), [PDF](../../../' + pdfRel + '), [raster PDF](../../../' + rasterRel + ').',
  '',
  '## Unidades propostas',
].join('\n'));
assert.ok(markdown.startsWith('# p.24'));
assert.ok(!markdown.includes('NaN'));
markdown = markdown.replace(
  '- p.24: 3 registros PT-BR salvos preservados; nenhuma gravação no Payload.',
  '- PDF oficial SHA-256: ' + proposal.sourcePdfSha256 + '. Viewer EN e PDF EN isolado foram comparados com a página oficial.\n' +
  '- Snapshot isolado: 43 candidatos e 3 registros humanos preservados; os frames de oito itens da lista e o frame de título existente são exclusivos da proposta diagnóstica.\n' +
  '- Persistência: somente GET observado; IDs 244, 248 e 249 inalterados; zero gravações no Payload e assets canônicos inalterados.\n' +
  '- Recibos: [PDF](../../../' + proofRel + '/pdf-export-receipt-v5.json), [finalização](../../../' + proofRel + '/finalization-receipt-v5.json), [hashes da fonte](../../../' + proofRel + '/source-hashes-v5.json).',
);
await writeFile(markdownPath, markdown);

const exceptions = await readJson(exceptionPath);
const humanCandidates = proposal.candidates.filter(candidate => candidate.pendingTerms && candidate.pendingTerms.length > 0);
assert.equal(humanCandidates.length, 36);
const bboxUnion = boxes => {
  const valid = (boxes || []).filter(box => Array.isArray(box) && box.length === 4);
  assert.ok(valid.length > 0, 'Exception requires source bbox evidence.');
  return [
    Math.min(...valid.map(box => box[0])),
    Math.min(...valid.map(box => box[1])),
    Math.max(...valid.map(box => box[2])),
    Math.max(...valid.map(box => box[3])),
  ];
};
const proofEvidence = [proposalRel, proofRel + '/viewer-pt-BR-v5.png', pdfRel, rasterRel];
const addedExceptionIds = [];
for (const candidate of humanCandidates) {
  const id = candidate.spanKey + '::human-review';
  addedExceptionIds.push(id);
  if (exceptions.items.some(item => item.id === id)) continue;
  exceptions.items.push({
    id, page, sourceBlockId: candidate.sourceBlockId, spanKey: candidate.spanKey,
    bboxPt: bboxUnion(candidate.sourceBboxes), category: 'human_terminology_editorial_review',
    status: 'pending_human_review', reason: candidate.pendingTerms.join(' '),
    sourceText: candidate.sourceText, proposedText: candidate.proposalText,
    verifiedIn: ['official source PDF and English Viewer', 'PT-BR Viewer v5', 'read-only Admin Editor v5', 'isolated PT-BR PDF v5 and raster'],
    editor: 'The proposal was confirmed in the read-only editor; all dialogs were cancelled without saving.',
    evidence: proofEvidence,
  });
}
const savedExample = proposal.preservedHumanRecords.find(record => record.id === 244);
const savedMetric = pdfTargets.find(item => item.spanKey === savedExample.spanKey);
assert.ok(savedExample.text.startsWith('Exemplo: To learn a LVL 2'));
const savedExampleId = savedExample.spanKey + '::mixed-language-human-review';
addedExceptionIds.push(savedExampleId);
if (!exceptions.items.some(item => item.id === savedExampleId)) {
  const rect = savedMetric.elementRectPt;
  exceptions.items.push({
    id: savedExampleId, page, sourceBlockId: 'block_52', spanKey: savedExample.spanKey,
    bboxPt: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    category: 'saved_human_translation_mixed_language_review', status: 'pending_human_review',
    reason: 'O registro humano salvo traduz o rótulo “Example:” como “Exemplo:”, mas mantém o corpo do exemplo em inglês. O texto foi preservado sem edição; revisar a unidade completa.',
    sourceText: 'To learn a LVL 2 Martial Discipline, you must have already learned a LVL 1 Martial Discipline. You may always learn LVL 1 Disciplines from any Tree and there is no limit to the amount of Disciplines you may learn.',
    proposedText: savedExample.text,
    verifiedIn: ['official source PDF page 24', 'PT-BR Viewer v5 with saved record intact', 'isolated PT-BR PDF v5 and raster', 'Payload GET read-back for record 244'],
    editor: 'Saved human translation ID 244 was not edited or overwritten.',
    evidence: [...proofEvidence, proofRel + '/viewer-editor-receipt-v5.json'],
  });
}
exceptions.sourceProposals = [...new Set([...exceptions.sourceProposals, proposalRel])];
exceptions.updated = '2026-10-16';
const exceptionIds = exceptions.items.map(item => item.id);
assert.equal(new Set(exceptionIds).size, exceptionIds.length, 'Exception queue contains duplicate IDs.');
assert.equal(exceptions.items.length, 110);
await writeFile(exceptionPath, JSON.stringify(exceptions, null, 2) + '\n');

let statusCsv = await readFile(statusPath, 'utf8');
const csvField = value => '"' + String(value).replaceAll('"', '""') + '"';
const statusRow = [
  '24', '24', 'raw_pdf_transcript_generated_unreviewed', 'pdf_vs_viewer_visual_reviewed_2026-10-16',
  'partial_editable_text_proposal_v5_43_units_viewer_editor_pdf_raster_reviewed_human_review_pending',
  'Source PDF, English Viewer and one-page English PDF visually compared. PT-BR proposal v5 covers 43 editable candidates; 43/43 passed Viewer and read-only Editor checks, and all 43 plus three saved human records were verified in the one-page PDF. Raster review shows no visible collisions; four right-edge frame metrics are 1.18–2.46 pt and one auto-height IMPORTANT callout grows 10.28 pt beyond its first-line frame with visible panel padding. Thirty-six terminology/editorial candidates and saved mixed-language example ID 244 remain open. Eight item-list frames are snapshot-only. Saved records unchanged; zero Payload writes or canonical asset changes. See docs/project-progress/2026-10-16-p024-adventurers-items-proposal-v5.md.',
].map(csvField).join(',');
assert.match(statusCsv, /^"24","24",.*$/mu, 'p.24 row missing from page-status.csv');
statusCsv = statusCsv.replace(/^"24","24",.*$/mu, statusRow);
await writeFile(statusPath, statusCsv);

const pageProgress = '# p.24 — proposta PT-BR “Aventureiros e Itens” v5\n\n' +
  '**Data:** 2026-10-16  \n**Estado:** fonte EN revisada; 43 candidatos verificados tecnicamente em Viewer, Editor read-only e PDF de uma página. Revisão editorial humana pendente; proposta não publicada.\n\n' +
  '## Fonte e estrutura\n\n' +
  'A rasterização da página oficial foi comparada com o Viewer EN e com um PDF EN isolado. O PDF oficial tem SHA-256 `' + proposal.sourcePdfSha256 + '`. Os 44 blocos de texto DOM, o título, quatro símbolos semânticos `tag.important.icon`, painéis de callout, fundo e fólio foram reconciliados. Nenhum rótulo diagramático precisa de localização nesta página.\n\n' +
  '## Proposta e validação\n\n' +
  'A proposta cobre 43 unidades editáveis. As 3 traduções humanas salvas — IDs 244, 248 e 249 — foram copiadas sem alterações; o exemplo ID 244, que conserva o corpo em inglês depois de “Exemplo:”, permanece aberto para revisão. O título já salvo continua no seu frame canônico; a proposta usa oito frames de lista apenas no snapshot isolado.\n\n' +
  '- Viewer PT-BR: 43/43 candidatos visíveis; 43/43 medições sem flags de overflow.\n' +
  '- Rich Block Editor/Admin read-only: 43/43 candidatos selecionados e conferidos; todos os diálogos foram cancelados sem salvar.\n' +
  '- PDF PT-BR: uma página de ' + pdfVerification.pageSizePt[0] + ' × ' + pdfVerification.pageSizePt[1] + ' pt; 46 registros verificados (43 candidatos e 3 registros humanos), ' + pdfVerification.selectableCharacters + ' caracteres selecionáveis, sem caracteres de substituição ou de uso privado.\n' +
  '- Raster PDF: a proposta block_29 agora cabe em duas linhas e termina antes das regras de Disciplinas. Nenhuma colisão ou corte visual foi encontrado. As métricas registram quatro limites direitos de 1,18–2,46 pt e o crescimento do callout block_16 para três linhas, 10,28 pt abaixo do frame da primeira linha; a tinta está dentro do painel que se expande e mantém padding visível.\n' +
  '- Payload: somente GET; três registros antes e depois, mesmos IDs 244/248/249; zero writes. Hashes dos assets canônicos iguais.\n\n' +
  '## Exceções abertas\n\n' +
  'A fila recebeu 36 unidades com decisões terminológicas/editoriais pendentes e uma exceção do exemplo humano parcialmente em inglês. Total da fila após a inclusão: ' + exceptions.items.length + ' IDs únicos. O Glossário oficial foi preservado como referência; compostos locais, modos, itens e capitalização mecânica seguem para revisão humana.\n\n' +
  'Evidências: [proposta JSON](../translations/proposals/page-024-adventurers-items-proposal-2026-10-16-v5.json), [proposta Markdown](../translations/proposals/page-024-adventurers-items-proposal-2026-10-16-v5.md), [Viewer/Editor](../../' + proofRel + '/viewer-editor-receipt-v5.json), [métricas PDF](../../' + proofRel + '/pdf-metrics-v5.json), [recibo PDF](../../' + proofRel + '/pdf-export-receipt-v5.json), [PDF](../../' + pdfRel + '), [raster PT-BR](../../' + rasterRel + '), [revisão da fonte EN](../../output/proofs/translation-readiness-2026-10-16/p024-source-review-v1/source-en-page-024.png).\n';
await writeFile(progressPath, pageProgress, { flag: 'wx' });

const summaryLine = '- **p.24:** proposta PT-BR v5 cobre 43 unidades editáveis; 43/43 passaram Viewer, Editor read-only e PDF de uma página. O raster não mostra colisões; quatro limites direitos e a expansão do callout IMPORTANT estão documentados. Três registros salvos foram preservados; 36 decisões humanas e o exemplo ID 244 parcialmente em inglês seguem na fila. Frames de oito itens da lista existem apenas no snapshot; zero writes no Payload. Ver [relatório v5](project-progress/2026-10-16-p024-adventurers-items-proposal-v5.md).';
let projectState = await readFile(resolve(root, 'docs/PROJECT_STATE.md'), 'utf8');
projectState = projectState.replace(
  'e p.23 (17 alvos verificáveis nas três superfícies; decisões humanas e texto em arte pendentes).',
  'e p.23 (17 alvos verificáveis nas três superfícies; decisões humanas e texto em arte pendentes) e p.24 (43 candidatos verificados nas três superfícies; decisões humanas pendentes).',
);
projectState = projectState.replace(
  'onze decisões humanas mais os rótulos de elevação da p.23 aguardam revisão.',
  'onze decisões humanas mais os rótulos de elevação da p.23, 36 decisões sobre candidatos da p.24 e o exemplo humano parcialmente em inglês da p.24 aguardam revisão.',
);
projectState = projectState.replace('- **p.23:** proposta v3 cobre', summaryLine + '\n\n- **p.23:** proposta v3 cobre');
await writeFile(resolve(root, 'docs/PROJECT_STATE.md'), projectState);

let handoff = await readFile(resolve(root, 'PROJECT-HANDOFF.md'), 'utf8');
handoff = handoff.replace(
  'e p.23 (17 unidades editáveis verificadas mais decisões humanas/arte pendentes).',
  'e p.23 (17 unidades editáveis verificadas mais decisões humanas/arte pendentes) e p.24 (43 unidades verificadas nas três superfícies, com revisão humana pendente).',
);
handoff = handoff.replace('- **p.23:** proposta v3 de', summaryLine.replace('project-progress/2026-10-16-p024', 'docs/project-progress/2026-10-16-p024') + '\n\n- **p.23:** proposta v3 de');
await writeFile(resolve(root, 'PROJECT-HANDOFF.md'), handoff);

let goalProgress = await readFile(resolve(root, 'docs/translations/localization-goal-progress.md'), 'utf8');
goalProgress = goalProgress.replace(
  '- **p.23:** proposta v3 cobre 17 alvos editáveis; os 17 foram conferidos no Viewer PT-BR, Editor read-only e PDF de uma página. A fonte EN foi comparada visualmente com PDF oficial, Viewer e PDF exportado. Block_13 e os sete rótulos da legenda usam recomposição exclusiva do snapshot. Onze decisões terminológicas/editoriais e os rótulos de elevação dentro da arte aguardam revisão; sem mudança canônica nem Payload writes. Ver [relatório v3](../project-progress/2026-10-16-p023-tile-breakdown-proposal-v3.md).',
  '- **p.23:** proposta v3 cobre 17 alvos editáveis; os 17 foram conferidos no Viewer PT-BR, Editor read-only e PDF de uma página. A fonte EN foi comparada visualmente com PDF oficial, Viewer e PDF exportado. Block_13 e os sete rótulos da legenda usam recomposição exclusiva do snapshot. Onze decisões terminológicas/editoriais e os rótulos de elevação dentro da arte aguardam revisão; sem mudança canônica nem Payload writes. Ver [relatório v3](../project-progress/2026-10-16-p023-tile-breakdown-proposal-v3.md).\n' + summaryLine.replace('project-progress/2026-10-16-p024', '../project-progress/2026-10-16-p024'),
);
goalProgress = goalProgress.replace(
  'e p.23 (17 unidades verificadas; decisões humanas e arte pendentes).',
  'e p.23 (17 unidades verificadas; decisões humanas e arte pendentes), p.24 (43 unidades verificadas; decisões humanas pendentes).',
);
goalProgress = goalProgress.replace(
  'Seis páginas têm algum conteúdo proposto. Viewer/Editor/PDF cobrem as propostas das p.18/p.19, quatro unidades da p.22, o título da p.20 e 17/17 unidades da p.23; p.21 tem Viewer/PDF e exceções, mas Editor pendente.',
  'Sete páginas têm algum conteúdo proposto. Viewer/Editor/PDF cobrem as propostas das p.18/p.19, quatro unidades da p.22, o título da p.20, 17/17 unidades da p.23 e 43/43 candidatos da p.24; p.21 tem Viewer/PDF e exceções, mas Editor pendente.',
);
goalProgress = goalProgress.replace('pendente nas seis páginas.', 'pendente nas sete páginas.');
goalProgress = goalProgress.replace(
  'Fila deste conjunto: 73 itens únicos — 19 p.18; 31 p.19; 8 p.21; 2 p.22; 1 grupo de arte p.20; 11 decisões humanas e 1 exceção de arte p.23.',
  'Fila deste conjunto: 110 itens únicos — 19 p.18; 31 p.19; 8 p.21; 2 p.22; 1 grupo de arte p.20; 11 decisões humanas e 1 exceção de arte p.23; 36 decisões humanas e 1 exemplo misto salvo p.24.',
);
await writeFile(resolve(root, 'docs/translations/localization-goal-progress.md'), goalProgress);

let progressReadme = await readFile(resolve(root, 'docs/project-progress/README.md'), 'utf8');
progressReadme = '- [2026-10-16 — p.24: proposta Aventureiros e Itens v5](2026-10-16-p024-adventurers-items-proposal-v5.md): 43/43 candidatos verificados no Viewer, Editor read-only e PDF; raster sem colisões aparentes, métricas de frame documentadas, três registros humanos preservados e 37 exceções abertas.\n' + progressReadme;
await writeFile(resolve(root, 'docs/project-progress/README.md'), progressReadme);

const finalization = {
  status: 'p024_proposal_v5_finalized_technical_review_complete_human_review_pending',
  page, proposal: proposalRel, proposalSha256, sourcePdfSha256: proposal.sourcePdfSha256,
  snapshotSha256, candidateCount: 43, verifiedInViewer: 43, verifiedInEditor: 43,
  verifiedInPdf: 43, pdfRecordCount: pdfTargets.length,
  humanTerminologyExceptionsAdded: humanCandidates.length,
  mixedLanguageSavedRecordExceptionAdded: true,
  totalExceptionQueueItems: exceptions.items.length,
  payloadRecordsBefore: 3, payloadRecordsAfter: 3, payloadRecordIds: [244, 248, 249],
  payloadWrites: 0, canonicalAssetsUnchanged: true,
  pdf: pdfRel, pdfRaster: rasterRel, pdfReceipt: proofRel + '/pdf-export-receipt-v5.json',
  pageProgress: 'docs/project-progress/2026-10-16-p024-adventurers-items-proposal-v5.md',
};
await writeFile(finalizationPath, JSON.stringify(finalization, null, 2) + '\n', { flag: 'wx' });

console.log(JSON.stringify({ ...finalization, exceptionIdsAdded: addedExceptionIds }, null, 2));

