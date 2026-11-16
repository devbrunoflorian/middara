#!/usr/bin/env node
/** Reconcile p.23 Viewer, Editor, and snapshot-PDF evidence into the recoverable proposal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const page = 23;
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3');
const proposalPath = resolve(root, 'docs/translations/proposals/page-023-tile-breakdown-2026-10-16-v3.json');
const proposalMdPath = resolve(root, 'docs/translations/proposals/page-023-tile-breakdown-2026-10-16-v3.md');
const proposalRelative = 'docs/translations/proposals/page-023-tile-breakdown-2026-10-16-v3.json';
const progressPath = resolve(root, 'docs/project-progress/2026-10-16-p023-tile-breakdown-proposal-v3.md');
const exceptionPath = resolve(root, 'docs/translations/localization-exceptions.json');
const statusPath = resolve(root, 'docs/translations/page-status.csv');
const pdfPath = resolve(proofDir, 'page-023-pt-BR-v3.pdf');
const receiptPath = resolve(proofDir, 'pdf-export-receipt-v3.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const viewerEditor = JSON.parse(await readFile(resolve(proofDir, 'viewer-editor-receipt-v3.json'), 'utf8'));
const metrics = JSON.parse(await readFile(resolve(proofDir, 'pdf-metrics-v3.json'), 'utf8'));
const sourceHashes = JSON.parse(await readFile(resolve(proofDir, 'source-hashes-v3.json'), 'utf8'));
const exceptions = JSON.parse(await readFile(exceptionPath, 'utf8'));
assert.equal(proposal.candidates.length, 17);
assert.equal(viewerEditor.status, 'passed-live-viewer-readonly-editor-check-for-all-proposed-units');
assert.equal(viewerEditor.candidateCount, proposal.candidates.length);
assert.equal(viewerEditor.viewerChecks.filter(item => item.visible).length, proposal.candidates.length);
assert.equal(viewerEditor.editorChecks.filter(item => item.selected && item.proposalMatched && item.editable && item.cancelled).length, proposal.candidates.length);
assert.equal(viewerEditor.payload.beforeCount, 0);
assert.equal(viewerEditor.payload.afterCount, 0);
assert.equal(viewerEditor.saveClicked, false);
assert.equal(viewerEditor.canonicalAssetsUnchanged, true);
assert.deepEqual(viewerEditor.blockedMutations, []);
assert.deepEqual(viewerEditor.pageErrors, []);
assert.equal(viewerEditor.observedApiMethods.join(','), 'GET');

const pdfMetrics = metrics.print.translationTargets;
assert.equal(pdfMetrics.length, proposal.candidates.length);
for (const candidate of proposal.candidates) {
  const target = pdfMetrics.find(item => item.spanKey === candidate.spanKey);
  assert.ok(target, `PDF metrics omitted ${candidate.spanKey}`);
  assert.ok(target.lineCount > 0, `No PDF text lines for ${candidate.spanKey}`);
  assert.ok(target.widestLinePt <= target.frameRectPt.width + 0.01, `PDF line exceeds its field for ${candidate.spanKey}`);
  assert.equal(target.edgeExcessPt.left, 0, `Left overflow for ${candidate.spanKey}`);
  assert.equal(target.edgeExcessPt.right, 0, `Right overflow for ${candidate.spanKey}`);
  assert.equal(target.edgeExcessPt.bottom, 0, `Bottom overflow for ${candidate.spanKey}`);
}

const verify = spawnSync('python', [
  'scripts/verify_page_pdf_export.py', pdfPath, '--page', String(page), '--contains', 'Detalhamento da Peça',
], { cwd: root, encoding: 'utf8' });
assert.equal(verify.status, 0, `PT-BR PDF verification failed: ${verify.stderr || verify.stdout}`);
const pdfVerification = JSON.parse(verify.stdout);
assert.equal(pdfVerification.pages, 1);
assert.equal(pdfVerification.replacementCharacters, 0);
assert.equal(pdfVerification.privateUseCharacters, 0);
const snapshotSha256 = sha256(await readFile(resolve(proofDir, 'snapshot/snapshot.json')));
assert.equal(sourceHashes.snapshotSha256, snapshotSha256);

proposal.status = 'editable_text_proposal_v3_17_units_viewer_editor_pdf_copyfit_verified_human_review_pending_artwork_exception_open';
proposal.counts = {
  ...proposal.counts,
  verifiedInViewer: proposal.candidates.length,
  verifiedInEditor: proposal.candidates.length,
  verifiedInPdf: proposal.candidates.length,
};
proposal.candidates = proposal.candidates.map(candidate => ({
  ...candidate,
  status: 'draft_pending_human_review',
  technicalStatus: 'passed_viewer_editor_pdf_copyfit_v3',
  editorialStatus: 'pending_human_review',
}));
proposal.copyfit = {
  engine: 'PageRenderer and existing snapshot-based visual PDF exporter',
  status: 'passed_viewer_editor_and_pdf_for_all_17_targets',
  viewerEditorReceipt: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/viewer-editor-receipt-v3.json',
  pdfReceipt: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/pdf-export-receipt-v3.json',
  pdfMetrics: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/pdf-metrics-v3.json',
  result: 'All 17 targets were rendered exactly once in the immutable snapshot PDF. Every text line remains within its field width; no left, right, or bottom overflow was measured. The maximum ink-top excess is 0.75 pt and is visually clear in the print capture.',
  diagnosticFailurePolicy: 'If a proposed unit fails live copyfit or composition, blank only that unit in the diagnostic snapshot; preserve the full translation and source data in this proposal.',
};
proposal.sourceReview = {
  ...proposal.sourceReview,
  englishViewerAndPdf: 'full_page_compared_visually_with_official_source_pdf; 39 source-geometry lines and the source art/background rendered',
  englishEvidence: [
    'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-v1/source-en-page-023.png',
    'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/en-viewer-v3.png',
    'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/page-023-en-source-v3.pdf',
  ],
};
proposal.evidence = {
  viewerEditorReceipt: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/viewer-editor-receipt-v3.json',
  ptBrViewer: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/viewer-pt-BR-v3.png',
  ptBrPrintCapture: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/print-v3.png',
  ptBrPdf: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/page-023-pt-BR-v3.pdf',
  pdfMetrics: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/pdf-metrics-v3.json',
};

await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
const proposalSha256 = sha256(await readFile(proposalPath));
const pdfReceipt = {
  status: 'passed_snapshot_page_export_and_independent_pdf_verification',
  page, language: 'pt-BR', profile: 'visual',
  proposal: proposalRelative, proposalSha256,
  snapshotSha256,
  sourcePdfSha256: proposal.sourcePdfSha256,
  pdf: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/page-023-pt-BR-v3.pdf',
  pages: pdfVerification.pages,
  pageSizePt: pdfVerification.pageSizePt,
  selectableCharacters: pdfVerification.selectableCharacters,
  replacementCharacters: pdfVerification.replacementCharacters,
  privateUseCharacters: pdfVerification.privateUseCharacters,
  embeddedImageObjects: pdfVerification.embeddedImageObjects,
  targetCount: pdfMetrics.length,
  targets: pdfMetrics.map(target => ({
    spanKey: target.spanKey, lineCount: target.lineCount,
    widestLinePt: target.widestLinePt, frameWidthPt: target.frameRectPt.width,
    edgeExcessPt: target.edgeExcessPt,
  })),
  independentVerification: pdfVerification,
  observedNetworkMethods: viewerEditor.observedApiMethods,
  payloadTranslationRecordsBefore: 0,
  payloadTranslationRecordsAfter: 0,
  payloadWrites: 0,
  canonicalAssetsUnchanged: true,
};
await writeFile(receiptPath, `${JSON.stringify(pdfReceipt, null, 2)}\n`, { flag: 'wx' });

let markdown = await readFile(proposalMdPath, 'utf8');
markdown = markdown.replace(
  '**Estado:** 17 unidades propostas em snapshot isolado; Viewer, Editor, PDF e copyfit ainda pendentes. A página fonte foi conferida diretamente no PDF oficial. As alterações de composição existem apenas no snapshot diagnóstico; nenhum registro foi gravado no Payload.',
  '**Estado:** 17 unidades propostas e verificadas no Viewer, Editor read-only e PDF visual de uma página, sem overflow horizontal ou inferior. A comparação da página EN com o PDF-fonte foi conferida. Terminologia e revisão editorial humana seguem pendentes; as labels de elevação em arte permanecem em inglês como exceção aberta. Nenhuma tradução foi gravada no Payload; alterações de composição existem apenas no snapshot diagnóstico.',
);
markdown = markdown.replace('## Unidades propostas',
  `## Validação técnica\n\n`+
  `- **Viewer PT-BR:** 17/17 candidatos visíveis; medições a 200% e captura completa em zoom de página.\n`+
  `- **Editor Admin read-only:** 17/17 alvos selecionados; o texto conferiu com a proposta, e todos os diálogos foram cancelados sem salvar.\n`+
  `- **PDF PT-BR:** uma página, MediaBox 820,346 × 820,346 pt, 965 caracteres selecionáveis, zero caracteres de substituição e zero caracteres de uso privado. Os 17 alvos aparecem uma vez cada; nenhuma linha excede a largura do campo.\n`+
  `- **Fonte EN:** Viewer e PDF foram comparados com o raster do PDF oficial; os 39 segmentos de geometria-fonte, o fundo e a arte aparecem.\n`+
  `- **Persistência:** zero registros PT-BR encontrados antes/depois; chamadas observadas somente GET; zero gravações; hashes dos assets canônicos iguais.\n`+
  `- Recibos: [Viewer/Editor](../../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/viewer-editor-receipt-v3.json), [PDF](../../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/pdf-export-receipt-v3.json), [métricas](../../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/pdf-metrics-v3.json).\n\n`+
  '## Unidades propostas',
);
await writeFile(proposalMdPath, markdown);

const humanReviewCandidates = proposal.candidates.filter(candidate => candidate.pendingTerms.length > 0);
assert.equal(humanReviewCandidates.length, 11);
const bboxUnion = boxes => {
  const valid = boxes.filter(box => Array.isArray(box) && box.length === 4);
  return [Math.min(...valid.map(box => box[0])), Math.min(...valid.map(box => box[1])),
    Math.max(...valid.map(box => box[2])), Math.max(...valid.map(box => box[3]))];
};
const proofEvidence = [
  proposalRelative,
  'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-v1/source-en-page-023.png',
  'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/viewer-pt-BR-v3.png',
  'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/page-023-pt-BR-v3.pdf',
];
const addedExceptionIds = [];
for (const candidate of humanReviewCandidates) {
  const id = `${candidate.spanKey}::human-review`;
  addedExceptionIds.push(id);
  if (exceptions.items.some(item => item.id === id)) continue;
  exceptions.items.push({
    id, page, sourceBlockId: candidate.sourceBlockId, spanKey: candidate.spanKey,
    bboxPt: bboxUnion(candidate.sourceBboxes), category: 'human_terminology_editorial_review',
    status: 'pending_human_review', reason: candidate.pendingTerms.join(' '),
    sourceText: candidate.sourceText, proposedText: candidate.proposalText,
    verifiedIn: ['source PDF and English Viewer', 'PT-BR Viewer v3', 'Admin Editor read-only v3', 'isolated PDF v3'],
    editor: 'Proposal was confirmed in the text editor; no save was performed.',
    evidence: proofEvidence,
  });
}
const artwork = proposal.artworkExceptionGroups[0];
const artworkExceptionId = 'page_23_elevation_labels_artwork_text__pt-BR';
if (!exceptions.items.some(item => item.id === artworkExceptionId)) {
  exceptions.items.push({
    id: artworkExceptionId, page,
    sourceBlockId: 'page_023/background.webp', spanKey: artworkExceptionId,
    bboxPt: artwork.sourceImageBbox, category: 'artwork_text_localization', status: 'open_human_review',
    reason: artwork.reason,
    sourceText: artwork.sourceText, proposedText: artwork.proposedText,
    diagnosticRendering: 'English elevation labels remain in the original diagram; no localized art is claimed.',
    verifiedIn: ['official source PDF page 23', 'English Viewer v3', 'PT-BR Viewer v3', 'PT-BR PDF v3'],
    editor: 'The labels are embedded in diagram artwork and have no editable text control; no image change was attempted.',
    evidence: proofEvidence,
  });
}
exceptions.sourceProposals = [...new Set([...exceptions.sourceProposals, proposalRelative])];
exceptions.updated = '2026-10-16';
const exceptionIds = exceptions.items.map(item => item.id);
assert.equal(new Set(exceptionIds).size, exceptionIds.length, 'Exception queue contains duplicate IDs.');
await writeFile(exceptionPath, `${JSON.stringify(exceptions, null, 2)}\n`);

let statusCsv = await readFile(statusPath, 'utf8');
const csvField = value => `"${String(value).replaceAll('"', '""')}"`;
const statusRow = [
  '23', '23', 'raw_pdf_transcript_generated_unreviewed', 'pdf_vs_viewer_visual_reviewed_2026-10-16',
  'partial_editable_text_proposal_v3_17_units_viewer_editor_pdf_verified_human_review_pending_artwork_exception_open',
  'Source PDF and English Viewer/PDF visually reviewed. PT-BR proposal v3 covers all 17 editable targets; 17/17 passed Viewer, read-only Editor, and isolated one-page PDF checks with no horizontal or bottom overflow. Eleven terminology/editorial decisions and elevation text embedded in diagram art remain open. Snapshot-only composition; zero Payload writes or canonical asset changes. See docs/project-progress/2026-10-16-p023-tile-breakdown-proposal-v3.md.',
].map(csvField).join(',');
const statusPattern = /^"23","23",.*$/mu;
assert.match(statusCsv, statusPattern, 'p.23 row missing from page-status.csv');
statusCsv = statusCsv.replace(statusPattern, statusRow);
await writeFile(statusPath, statusCsv);

const progress = `# p.23 — proposta PT-BR de Tile Breakdown v3\n\n`+
  `**Data:** 2026-10-16  \n**Estado:** fidelidade EN conferida; proposta PT-BR recuperável tecnicamente verificada em 17/17 unidades nas três superfícies. Aprovação editorial humana pendente; não publicada.\n\n`+
  `## Fonte e estrutura\n\n`+
  `A página completa do PDF oficial foi rasterizada e conferida com o sidecar; o Viewer EN e seu PDF de uma página também foram comparados com a fonte. O PDF oficial tem SHA-256 \`${proposal.sourcePdfSha256}\`. Título, cinco seções explicativas, sete rótulos de legenda, callouts A–E, código UM1 e fólio 23 aparecem nos lugares esperados. “ELEVATION 2 / ELEVATION 1” está incorporado à imagem do diagrama e continua como exceção aberta de arte.\n\n`+
  `## Proposta e validação\n\n`+
  `A proposta cobre 17 alvos: título, headings e corpos das seções, o campo recomposto “Número da Peça” e sete rótulos de legenda. A recomposição de block_13 e a divisão da legenda em caixas centradas existem apenas no snapshot isolado. Os IDs e assets canônicos não mudaram.\n\n`+
  `- Viewer PT-BR: 17/17 textos aparecem; medições do renderer a 200% não indicam overflow e a captura em zoom de página mostra o layout inteiro.\n`+
  `- Rich Block Editor/Admin: 17/17 chaves foram selecionadas e conferidas contra a proposta; cada diálogo foi cancelado, sem salvar.\n`+
  `- Exportação snapshot PDF: 17 alvos verificados exatamente uma vez. PDF de uma página, ${pdfVerification.pageSizePt[0]} × ${pdfVerification.pageSizePt[1]} pt, ${pdfVerification.selectableCharacters} caracteres selecionáveis, sem U+FFFD nem caracteres de uso privado. As linhas permanecem dentro da largura dos campos e a inspeção da captura print não mostrou cortes.\n`+
  `- Fonte EN: Viewer e PDF reproduzem 39 linhas de geometria fonte junto com o background; inspeção lado a lado não mostrou perda ou colisão de conteúdo.\n`+
  `- Payload: zero traduções PT-BR antes/depois, somente GET observado, zero writes. Hashes dos assets canônicos iguais.\n\n`+
  `## Exceções e revisão humana\n\n`+
  `A fila consolidada ganhou ${humanReviewCandidates.length} itens de terminologia/editorial e um item de texto-em-arte (${exceptions.items.length} itens únicos no total). As decisões abertas cobrem os termos Range e Line of Sight, a forma singular/plural de Terrain, os compostos e as abreviações de legenda, além do título. O nome Unintentional Malum permanece em inglês como nome próprio; a composição da frase foi mantida para revisão. A tradução das elevações exige tratamento da arte; nenhum pixel de fundo foi alterado.\n\n`+
  `Evidências: [proposta JSON](../translations/proposals/page-023-tile-breakdown-2026-10-16-v3.json), [proposta Markdown](../translations/proposals/page-023-tile-breakdown-2026-10-16-v3.md), [Viewer/Editor receipt](../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/viewer-editor-receipt-v3.json), [PDF receipt](../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/pdf-export-receipt-v3.json), [PDF de uma página](../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/page-023-pt-BR-v3.pdf), [Viewer PT-BR](../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v3/viewer-pt-BR-v3.png), [PDF oficial rasterizado](../../output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-v1/source-en-page-023.png).\n`;
await writeFile(progressPath, progress, { flag: 'wx' });

console.log(JSON.stringify({
  proposalPath, proposalSha256, receiptPath, pdfPages: pdfVerification.pages,
  verifiedTargets: pdfMetrics.length, humanReviewExceptionsAdded: addedExceptionIds.length,
  artworkExceptionAdded: exceptions.items.some(item => item.id === artworkExceptionId),
  exceptionCount: exceptions.items.length, statusPath, progressPath,
  payloadWrites: 0, canonicalAssetsUnchanged: true,
}, null, 2));
