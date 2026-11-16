import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeSourceBlock } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const pageDomPath = resolve(root, 'apps/web/public/pages/page_098/page_098_dom.json');
const backgroundPath = resolve(root, 'apps/web/public/pages/page_098/background.webp');
const proposalPath = resolve(root, 'docs/translations/proposals/page-098-table9-header-labels-proposal-2026-10-17-v1.json');
const priorTitlePath = resolve(root, 'docs/translations/proposals/page-098-table9-continuation-title-proposal-2026-10-16-v2.json');
const queuePath = resolve(root, 'docs/translations/localization-exceptions.json');
const sourcePdfPath = resolve(root, '..', 'Rulebook 1.2', 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdfName = 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const unitSpecs = [
  { id: 'p98-table9-name-header', lineId: 'line_11_0', sourceText: 'NAME', proposalText: 'NOME' },
  { id: 'p98-table9-token-header', lineId: 'line_11_1', sourceText: 'TOKEN', proposalText: 'FICHA' },
  { id: 'p98-table9-effect-header', lineId: 'line_11_2', sourceText: 'EFFECT', proposalText: 'EFEITO' },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function writePrettyJson(path, value) {
  const previous = await readFile(path, 'utf8').catch(() => '');
  const newline = previous.includes('\r\n') ? '\r\n' : '\n';
  await writeFile(path, `${JSON.stringify(value, null, 2).replaceAll('\n', newline)}${newline}`, 'utf8');
}

const pageDomBytesBefore = await readFile(pageDomPath);
const pageDom = JSON.parse(pageDomBytesBefore.toString('utf8'));
const sourceBlock = pageDom.blocks.find(block => block.id === 'block_11');
assert.ok(sourceBlock, 'p.98 Table 9 header source block is missing');

for (const spec of unitSpecs) {
  const line = sourceBlock.lines.find(candidate => candidate.id === spec.lineId);
  assert.ok(line, `Source line ${spec.lineId} is missing`);
  assert.equal(line.spans.length, 1, `${spec.lineId} must have one source span`);
  assert.equal(line.spans[0].text, spec.sourceText, `${spec.lineId} source text changed`);
  assert.equal(line.spans[0].font, 'OptimaLTStd-Bold', `${spec.lineId} source font changed`);
  assert.equal(line.spans[0].size, 8, `${spec.lineId} source size changed`);
}

const previousUnits = sourceBlock.typographicSpanUnits ?? [];
for (const spec of unitSpecs) {
  const existingUnit = previousUnits.find(unit => unit.id === spec.id);
  if (existingUnit) {
    assert.deepEqual(existingUnit.spanRefs, [`${spec.lineId}:0`], `${spec.id} already points to different source content`);
  }
}
sourceBlock.typographicSpanUnits = [
  ...previousUnits.filter(unit => !unitSpecs.some(spec => spec.id === unit.id)),
  ...unitSpecs.map(spec => ({ id: spec.id, spanRefs: [`${spec.lineId}:0`] })),
];

const sourcePdfBytes = await readFile(sourcePdfPath);
const backgroundBytes = await readFile(backgroundPath);
await writePrettyJson(pageDomPath, pageDom);
const pageDomBytes = await readFile(pageDomPath);
const sourceHashes = {
  sourcePdf: sha256(sourcePdfBytes),
  background: sha256(backgroundBytes),
  pageDom: sha256(pageDomBytes),
};
const blockIndex = pageDom.blocks.indexOf(sourceBlock);
const candidates = [];

for (const spec of unitSpecs) {
  const sourceUnit = sourceBlock.typographicSpanUnits.find(unit => unit.id === spec.id);
  const lineId = sourceUnit.spanRefs[0].slice(0, sourceUnit.spanRefs[0].lastIndexOf(':'));
  const sourceUnitBlock = {
    ...sourceBlock,
    lines: sourceBlock.lines.filter(line => line.id === lineId),
  };
  const sourcePdfVisualLineCount = analyzeSourceBlock(sourceUnitBlock).lineCount;
  assert.equal(sourcePdfVisualLineCount, 1, `${spec.id} must map to one real PDF baseline`);

  const spanKey = `page_98_unit_${spec.id}__pt-BR`;
  candidates.push({
    blockIndex,
    sourceBlockId: sourceBlock.id,
    sourceUnitId: spec.id,
    spanKey,
    language: 'pt-BR',
    sourceText: spec.sourceText,
    proposalText: spec.proposalText,
    data: {
      schemaVersion: 2,
      spanKey,
      textAlign: 'left',
      lineHeight: 1,
      lineHeightMode: 'source',
      segments: [{
        text: spec.proposalText,
        font: 'OptimaLTStd-Bold',
        size: 8,
        weight: 700,
        style: 'normal',
        color: '#ffffff',
        disableLigatures: true,
      }],
      managedSourceSymbols: [],
    },
    technicalStatus: 'pending_live_viewer_copyfit_v3_editor_pdf',
    copyfitClassification: 'UNMEASURED',
    copyfitSourcePdfLineCount: sourcePdfVisualLineCount,
    copyfitPageRendererLineCount: null,
    copyfitMeasurementFingerprint: null,
    underCompositionJustification: '',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    pendingTerms: [],
    diagnosticBlank: null,
  });
}

const existingCounts = [];
for (const candidate of candidates) {
  const query = new URL('/api/translations', apiUrl);
  query.searchParams.set('where[spanKey][equals]', candidate.spanKey);
  query.searchParams.set('where[language][equals]', 'pt-BR');
  const response = await fetch(query, { signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `Read-only Payload preflight failed for ${candidate.spanKey}: ${response.status}`);
  const payload = await response.json();
  const count = payload.docs?.length ?? 0;
  assert.equal(count, 0, `A saved human translation exists for ${candidate.spanKey}; refusing to stage a proposal over it`);
  existingCounts.push(count);
}

const proposal = {
  proposalId: 'p098-table9-header-labels',
  version: '1',
  title: 'Cabeçalhos da Tabela 9 — p. 98 (v1)',
  page: 98,
  status: 'pending_live_validation',
  sourcePdf: sourcePdfName,
  sourceHashes,
  counts: {
    candidates: candidates.length,
    exactSourcePdfVisualBaselines: candidates.length,
    existingHumanTranslationsPreserved: existingCounts.reduce((sum, count) => sum + count, 0),
    finalTranslationWrites: 0,
  },
  preservation: {
    existingHumanTranslationCount: 0,
    existingHumanTranslationSpanKeys: [],
    existingHumanTranslationDataSha256: sha256(Buffer.from('[]')),
  },
  scopeLimits: [
    'This batch covers only the NAME, TOKEN, and EFFECT header labels in the p.98 Table 9 continuation.',
    'The official PDF source confirms each header is an independent 8 pt OptimaLTStd-Bold text unit on one visual baseline, painted white on the existing table header band.',
    'TOKEN uses the approved glossary term Ficha. NAME and EFFECT are direct table-label translations; no glossary term was added or approved by this proposal.',
    'The PageDOM change adds three source-span unit identities only; it does not modify PDF-derived font, size, source text, baselines, or geometry.',
    'Viewer copyfit, Editor round-trip, and PDF export remain pending. No Payload translation or editorial approval is written by this proposal.',
  ],
  candidates,
  note: 'Three independent, uppercase column headings for Table 9. The complete p.98 table rules and artwork remain outside this batch.',
  revisions: [],
};

await writePrettyJson(proposalPath, proposal);
const priorTitle = JSON.parse(await readFile(priorTitlePath, 'utf8'));
priorTitle.sourceHashes.pageDom = sourceHashes.pageDom;
await writePrettyJson(priorTitlePath, priorTitle);
const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const relativeProposalPath = 'docs/translations/proposals/page-098-table9-header-labels-proposal-2026-10-17-v1.json';
if (!queue.sourceProposals.includes(relativeProposalPath)) {
  const priorIndex = queue.sourceProposals.indexOf('docs/translations/proposals/page-098-table9-continuation-title-proposal-2026-10-16-v2.json');
  queue.sourceProposals.splice(priorIndex >= 0 ? priorIndex + 1 : queue.sourceProposals.length, 0, relativeProposalPath);
}
queue.updated = new Date().toISOString();
await writePrettyJson(queuePath, queue);

console.log(JSON.stringify({
  proposalPath: proposalPath.slice(root.length + 1),
  proposalQueued: queue.sourceProposals.includes(relativeProposalPath),
  sourceHashes,
  candidates: candidates.map(candidate => ({
    spanKey: candidate.spanKey,
    sourceText: candidate.sourceText,
    proposalText: candidate.proposalText,
    sourcePdfVisualLineCount: candidate.copyfitSourcePdfLineCount,
    existingHumanTranslationCount: 0,
  })),
  pageDomBytesBeforeSha256: sha256(pageDomBytesBefore),
  pageDomBytesAfterSha256: sourceHashes.pageDom,
  finalTranslationWrites: 0,
}, null, 2));
