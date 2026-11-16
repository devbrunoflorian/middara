import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proposalDir = path.join(root, 'docs/translations/proposals');
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');

// Preserve the old p.102 measurement record by adding a new proposal revision.
const p102 = readJson(path.join(proposalDir, 'page-102-conviction-casting-value-heading-proposal-2026-10-17-v3.json'));
p102.version = '4';
p102.title = 'Valor de Convicção e Conjuração — cabeçalho da p.102 (v4)';
p102.status = 'pending_human_review';
p102.counts.openExceptions = 0;
p102.scopeLimits = p102.scopeLimits.filter(scope =>
  !scope.includes('Three complete, natural PT-BR variants were tested in the live Viewer at 100% and 200%; all measured OVER')
  && !scope.includes('The rendered text boxes overrun the source realbox at both scales'));
p102.scopeLimits.push(
  'A semantic-width preflight established a centered 332.4979 pt candidate frame inside the evidence-bounded corridor; the candidate now measures EXACT (1/1 visual rows) at 100% and 200%.',
  'Only the proposal candidate frame X/width changed; the original font, size, rich segments, text, vertical geometry, and final Payload translation remain untouched. Editorial approval is still pending.'
);
const p102Candidate = p102.candidates.find(candidate => candidate.sourceBlockId === 'block_27');
if (!p102Candidate) throw new Error('p.102 block_27 candidate missing');
const originalP102Bbox = [...p102Candidate.data.bbox];
const selectedX = 243.7240482639524;
const selectedWidth = 332.49790347209523;
const selectedBbox = [selectedX, originalP102Bbox[1], selectedX + selectedWidth, originalP102Bbox[3]];
p102Candidate.data.bbox = selectedBbox;
p102Candidate.reviewLayoutFrame = {
  x: selectedBbox[0],
  y: selectedBbox[1],
  width: selectedBbox[2] - selectedBbox[0],
  height: selectedBbox[3] - selectedBbox[1],
  rotation: 0,
  textAlign: p102Candidate.data.textAlign ?? 'center',
  lineHeight: p102Candidate.data.lineHeight ?? 1,
};
p102Candidate.sourcePdfVisualLineCount = 1;
p102Candidate.pageRendererVisualLineCount = 1;
p102Candidate.copyfitLineCount = '1/1 (EXACT)';
p102Candidate.copyfitLineCountClassification = 'EXACT';
p102Candidate.copyfitClassification = 'EXACT';
p102Candidate.technicalStatus = 'validated_copyfit_v3_semantic_width_exact_pending_human_review';
p102Candidate.diagnosticRendering = 'Normal PT-BR proposal preview; candidate-only semantic frame; not published; editorial approval pending.';
p102Candidate.copyfitMeasurement = {
  sourcePdfVisualLineCount: 1,
  pageRendererVisualLineCount: 1,
  classification: 'EXACT',
  method: 'Live PageRenderer DOM Range line rectangles grouped with the shared Copyfit V3 visual-row grouper; semantic corridor boundaries and obstacles checked against the official PDF and page raster.',
  candidateFramePt: {
    x: selectedBbox[0],
    y: selectedBbox[1],
    width: selectedBbox[2] - selectedBbox[0],
    height: selectedBbox[3] - selectedBbox[1],
    centerX: (selectedBbox[0] + selectedBbox[2]) / 2,
  },
  rollbackFramePt: originalP102Bbox,
  zoomMeasurements: [
    {
      zoomPercent: 100,
      sourceLines: 1,
      pageRendererLines: 1,
      classification: 'EXACT',
      fontLoaded: true,
      geometryPass: true,
      overflow: false,
      collision: false,
      screenshot: 'apps/web/output/p102-block_27-copyfit-v1/viewer-ptbr-valor-de-convic-o-e-conjura-o-semantic-width-selected-100pct.png',
      measurement: 'apps/web/output/p102-block_27-copyfit-v1/valor-de-convic-o-e-conjura-o-100pct-measurement.json',
    },
    {
      zoomPercent: 200,
      sourceLines: 1,
      pageRendererLines: 1,
      classification: 'EXACT',
      fontLoaded: true,
      geometryPass: true,
      overflow: false,
      collision: false,
      screenshot: 'apps/web/output/p102-block_27-copyfit-v1/viewer-ptbr-valor-de-convic-o-e-conjura-o-semantic-width-selected-200pct.png',
      measurement: 'apps/web/output/p102-block_27-copyfit-v1/valor-de-convic-o-e-conjura-o-200pct-measurement.json',
    },
  ],
  semanticFlowRegion: 'p102-conviction-casting-header-band',
  candidateTextAndRichSegmentsUnchanged: true,
  payloadWrite: false,
};
p102Candidate.copyfitAttempts = Array.isArray(p102Candidate.copyfitAttempts) ? p102Candidate.copyfitAttempts : [];
p102Candidate.copyfitAttempts.push({
  proposalVersion: '4-semantic-width-preflight',
  proposalText: p102Candidate.proposalText,
  sourcePdfVisualLineCount: 1,
  pageRendererVisualLineCount: 1,
  classification: 'EXACT',
  selectedFramePt: p102Candidate.copyfitMeasurement.candidateFramePt,
  rollbackFramePt: originalP102Bbox,
  measurement: 'Live PageRenderer at 100% and 200%; same text/font/segments; centered in measured safe semantic flow corridor; no collision or overflow.',
  evidence: p102Candidate.copyfitMeasurement.zoomMeasurements.map(measurement => ({
    zoomPercent: measurement.zoomPercent,
    screenshot: measurement.screenshot,
    measurement: measurement.measurement,
  })),
});
p102.note = 'Copyfit V3 semantic-width preflight changed only the unapproved proposal frame: the candidate is now EXACT at both zooms with the source font and rich segments intact, no overflow/collision, and the preserved center anchor. The original frame is recorded for rollback. Editorial and terminology review remain pending; no final translation or Payload record was written.';
p102.revisions = Array.isArray(p102.revisions) ? p102.revisions : [];
p102.revisions.push({
  version: '4',
  date: '2026-10-17',
  summary: 'Retrospective semantic-width preflight found a safe centered candidate frame that restores EXACT 1/1 visual-row parity at 100% and 200%; previous OVER measurements are retained, with original-frame rollback evidence.',
});
const p102v4Path = path.join(proposalDir, 'page-102-conviction-casting-value-heading-proposal-2026-10-17-v4.json');
writeJson(p102v4Path, p102);

// Preserve p.100 v1 and add the measured maximum-safe-width result as v2.
const p100 = readJson(path.join(proposalDir, 'page-100-table10-terrain-figure-notes-proposal-2026-10-17-v1.json'));
p100.version = '2';
p100.title = 'Notas da Tabela 10 — Terreno e Miniaturas — p. 100 (v2)';
p100.status = 'pending_copyfit_v3_dtp_intervention';
const p100Candidate = p100.candidates.find(candidate => candidate.sourceBlockId === 'block_12');
if (!p100Candidate) throw new Error('p.100 block_12 candidate missing');
p100Candidate.sourcePdfVisualLineCount = 3;
p100Candidate.pageRendererVisualLineCount = 4;
p100Candidate.copyfitLineCount = '4/3 (OVER after maximum safe width)';
p100Candidate.copyfitLineCountClassification = 'OVER';
p100Candidate.copyfitClassification = 'OVER';
p100Candidate.technicalStatus = 'blocked_copyfit_v3_over_after_maximum_safe_semantic_width_dtp_exception_open';
p100Candidate.copyfitMeasurement = {
  sourcePdfVisualLineCount: 3,
  pageRendererVisualLineCount: 4,
  classification: 'OVER_AFTER_SAFE_WIDTH',
  method: 'Live PageRenderer DOM Range rows grouped with shared Copyfit V3 grouper; maximum safe left-cell corridor measured against source table vectors, divider, and independent Figures-cell text.',
  maximumSafeFramePt: { x: 61.52197, y: 94.0, width: 158.99903, right: 220.521 },
  originalFramePt: p100Candidate.data.bbox,
  zoomMeasurements: [
    {
      zoomPercent: 100,
      sourceLines: 3,
      pageRendererLines: 4,
      fontLoaded: true,
      geometryPass: true,
      overflow: false,
      collision: false,
      measurement: 'apps/web/output/p100-block_12-copyfit-v1/fichas-de-terreno-fichas-e-itens-que-contam-como-terreno-ex-fichas-de-prancha-n-o-s-o-movidos-pelas-correntes-100pct-measurement.json',
      screenshot: 'apps/web/output/p100-block_12-copyfit-v1/viewer-ptbr-fichas-de-terreno-fichas-e-itens-que-contam-como-terreno-ex-fichas-de-prancha-n-o-s-o-movidos-pelas-correntes-semantic-width-maximum-safe-width-100pct.png',
    },
    {
      zoomPercent: 200,
      sourceLines: 3,
      pageRendererLines: 4,
      fontLoaded: true,
      geometryPass: true,
      overflow: false,
      collision: false,
      measurement: 'apps/web/output/p100-block_12-copyfit-v1/fichas-de-terreno-fichas-e-itens-que-contam-como-terreno-ex-fichas-de-prancha-n-o-s-o-movidos-pelas-correntes-200pct-measurement.json',
      screenshot: 'apps/web/output/p100-block_12-copyfit-v1/viewer-ptbr-fichas-de-terreno-fichas-e-itens-que-contam-como-terreno-ex-fichas-de-prancha-n-o-s-o-movidos-pelas-correntes-semantic-width-maximum-safe-width-200pct.png',
    },
  ],
  payloadWrite: false,
};
p100Candidate.copyfitAttempts = Array.isArray(p100Candidate.copyfitAttempts) ? p100Candidate.copyfitAttempts : [];
p100Candidate.copyfitAttempts.push({
  proposalVersion: '2-semantic-width-preflight',
  proposalText: p100Candidate.proposalText,
  sourcePdfVisualLineCount: 3,
  pageRendererVisualLineCount: 4,
  classification: 'OVER_AFTER_SAFE_WIDTH',
  maximumSafeWidthPt: 158.99903,
  measurements: p100Candidate.copyfitMeasurement.zoomMeasurements,
  decision: 'Retain as open DTP exception; do not modify font, text, or neighboring cell geometry.',
});
p100.counts.openExceptions = 1;
p100.note = 'The measured 158.999 pt maximum safe left-cell corridor still yields 4 PT-BR visual rows against 3 source rows at 100% and 200%. The full candidate remains preserved and blank in diagnostic rendering; DTP intervention remains required. No neighboring cell, final translation, or Payload record was changed.';
p100.revisions = Array.isArray(p100.revisions) ? p100.revisions : [];
p100.revisions.push({
  version: '2',
  date: '2026-10-17',
  summary: 'Retrospective preflight explicitly tested the measured maximum safe semantic width; both zooms remain OVER 4/3, so the DTP exception stays open.',
});
const p100v2Path = path.join(proposalDir, 'page-100-table10-terrain-figure-notes-proposal-2026-10-17-v2.json');
writeJson(p100v2Path, p100);

// Update queue statuses only after evidence is in the proposal records.
const queue = readJson(queuePath);
const p102Item = queue.items.find(item => item.id === 'P102-DTP-COPYFIT-VALUE-HEADING-16');
const p100Item = queue.items.find(item => item.id === 'P100-DTP-COPYFIT-TERRAIN-TOKENS-1');
if (!p102Item || !p100Item) throw new Error('Expected p.100/p.102 exception records missing');
p102Item.status = 'resolved';
p102Item.category = 'dtp_copyfit_semantic_width_resolved';
p102Item.reason = 'Exceção técnica resolvida por ajuste horizontal semântico registrado somente na proposta: frame centralizado de 332,4979 pt, centro preservado em x=409,973 pt, 1 linha PT-BR para 1 linha-fonte em 100% e 200%, sem overflow ou colisões. Aprovação editorial e terminologia continuam pendentes; nenhuma tradução final foi publicada.';
p102Item.diagnosticRendering = 'Normal PT-BR proposal preview after the technical copyfit resolution; the proposal is still unapproved and is not published as a human translation.';
p102Item.evidence = Array.isArray(p102Item.evidence) ? p102Item.evidence : [];
p102Item.evidence.push(
  'Retrospective Copyfit V3 semantic-width preflight: selected frame x=243.724 pt, width=332.498 pt, center=409.973 pt; original frame preserved in proposal v4 as rollback evidence.',
  '100% and 200% PageRenderer measurements each report one real visual row, fontLoaded=true, geometryPass=true, overflow=false, collision=false; both latest screenshots show the selected frame and target heading.',
  'Independent critical-agent review inspected both regenerated screenshots and measurement JSONs; confirmed the heading clears the divider, ornament, artwork, and neighboring content.'
);
p102Item.resolution = {
  resolvedAt: '2026-10-17',
  method: 'Copyfit V3 semantic horizontal width preflight',
  classification: 'EXACT',
  sourcePdfVisualLineCount: 1,
  pageRendererVisualLineCount: 1,
  framePt: { x: selectedBbox[0], y: selectedBbox[1], width: selectedWidth, height: selectedBbox[3] - selectedBbox[1], centerX: (selectedBbox[0] + selectedBbox[2]) / 2 },
  rollbackBboxPt: originalP102Bbox,
  zooms: [100, 200],
  richTextAndCandidateTextChanged: false,
  humanApprovalChanged: false,
  finalTranslationWrite: false,
};
p100Item.reason = 'O preflight testou o maior corredor horizontal seguro da célula esquerda (158,999 pt), mantendo 4 linhas visuais PT-BR contra 3 no PDF-fonte em 100% e 200%. O texto fica dentro do corredor, sem colisão; ainda assim OVER reprova copyfit. A unidade completa permanece preservada e DTP segue necessária.';
p100Item.evidence = Array.isArray(p100Item.evidence) ? p100Item.evidence : [];
p100Item.evidence.push(
  'Maximum safe left-cell corridor x=61.522..220.521 pt, width=158.999 pt, with the adjacent Figures cell and an 8 pt clearance preserved.',
  'At 100% and 200%, PageRenderer measured 4 visual rows against 3 source rows; no overflow or collision. The candidate therefore remains OVER_AFTER_SAFE_WIDTH.',
  'Latest outlined screenshots visibly show the tested safe frame; the independent critical-agent review confirmed the divider clearance and persistent 4/3 row count.'
);
queue.sourceProposals = Array.isArray(queue.sourceProposals) ? queue.sourceProposals : [];
for (const relativePath of [
  'docs/translations/proposals/page-102-conviction-casting-value-heading-proposal-2026-10-17-v4.json',
  'docs/translations/proposals/page-100-table10-terrain-figure-notes-proposal-2026-10-17-v2.json',
]) if (!queue.sourceProposals.includes(relativePath)) queue.sourceProposals.push(relativePath);
queue.updated = new Date().toISOString();
writeJson(queuePath, queue);

// Add an append-only delta to the active goal tracker.
const progressPath = path.join(root, 'docs/translations/localization-goal-progress.md');
const marker = '## Copyfit V3 semantic-width retrospective — 2026-10-17';
const progress = fs.readFileSync(progressPath, 'utf8');
if (!progress.includes(marker)) {
  fs.appendFileSync(progressPath,
    '\n\n' + marker + '\n\n' +
    '- Escopo direcionado: três unidades elegíveis com exceção explícita/medição de copyfit e evidência de corredor semântico; nenhuma auditoria global ou retranslação foi feita. A p.100 block_20 (Table 10 title) já estava recuperada como EXACT; a p.102 block_27 agora também recuperou EXACT (1/1) em 100% e 200%, sem colisão/overflow, preservando fonte, rich segments e centro do título. A moldura alterada existe somente na proposta v4 e tem rollback para o frame original; aprovação editorial continua pendente.\n' +
    '- A p.100 block_12 foi testada no máximo seguro de 158,999 pt: continua OVER (4 linhas PT-BR / 3 fonte) em ambas as escalas, sem colisão. Mantida aberta para intervenção DTP; proposta completa preservada e diagnóstico PT-BR em branco, sem fallback.\n' +
    '- Resultado retrospectivo acumulado: 2 unidades recuperadas; 2 EXACT; 0 UNDER; 1 ainda requer DTP. Não houve escrita no Payload nem alteração de conteúdo humano aprovado. Ver fila de exceções, proposta p.102 v4, proposta p.100 v2 e evidências em apps/web/output/p100-block_12-copyfit-v1/ e apps/web/output/p102-block_27-copyfit-v1/.\n',
    'utf8');
}

console.log(JSON.stringify({
  p102Proposal: path.relative(root, p102v4Path),
  p100Proposal: path.relative(root, p100v2Path),
  exceptionItems: queue.items.length,
  openExceptions: queue.items.filter(item => item.status !== 'resolved').length,
  resolvedExceptions: queue.items.filter(item => item.status === 'resolved').length,
}, null, 2));
