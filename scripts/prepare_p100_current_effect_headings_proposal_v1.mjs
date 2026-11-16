import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const pageDomPath = resolve(root, 'apps/web/public/pages/page_100/page_100_dom.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-100-current-effect-headings-proposal-2026-10-17-v1.json');
const pageDom = JSON.parse(await readFile(pageDomPath, 'utf8'));
const block = pageDom.blocks.find(candidate => candidate.id === 'block_11');
assert.ok(block, 'Missing source block_11 for the two current-effect column headings');
assert.deepEqual(block.lines.map(line => line.spans.map(span => span.text).join('')), [
  'NOT MOVED BY CURRENTS',
  'MOVED BY CURRENTS',
], 'Source heading text changed; stop before creating an outdated proposal');
const proposalExists = await readFile(proposalPath, 'utf8').then(() => true).catch(() => false);

const sourcePdfVisualLineCount = 1;
const units = [
  {
    id: 'p100-not-moved-by-currents-heading',
    label: 'Not moved by Currents table heading',
    line: block.lines[0],
    text: 'NÃO MOVIDOS PELAS CORRENTES',
    rationale: 'Plural agreement refers to the categorized tokens/items. The table heading supplies the omitted subject and mechanic context; the local Current(s) → Correntes form remains pending human terminology review.',
  },
  {
    id: 'p100-moved-by-currents-heading',
    label: 'Moved by Currents table heading',
    line: block.lines[1],
    text: 'MOVIDOS PELAS CORRENTES',
    rationale: 'Plural agreement refers to the categorized tokens/items. The local Current(s) → Correntes form remains pending human terminology review.',
  },
];

// Derive each fixed heading envelope from the corresponding table column's
// existing explanatory text frame. Source glyph coordinates are not changed.
const leftColumnRight = pageDom.blocks.find(candidate => candidate.id === 'block_12')?.bbox?.[2];
const rightColumnRight = pageDom.blocks.find(candidate => candidate.id === 'block_13')?.bbox?.[2];
assert.ok(Number.isFinite(leftColumnRight) && Number.isFinite(rightColumnRight), 'Missing table-column bounds');
for (const [index, columnRight] of [[0, leftColumnRight], [1, rightColumnRight]]) {
  const line = block.lines[index];
  const sourceX = line.bbox[0];
  line.availableX = sourceX;
  line.availableWidth = columnRight - sourceX;
  assert.ok(line.availableWidth > 0, 'Derived heading column width must be positive');
}
const expectedUnits = units.map(({ id, label, line }) => ({
  id,
  label,
  spanRefs: [`${line.id}:0`],
}));
if (block.typographicSpanUnits?.length) {
  assert.deepEqual(block.typographicSpanUnits, expectedUnits, 'Existing heading units differ from the expected source mapping');
} else {
  block.typographicSpanUnits = expectedUnits;
}

const sourcePdfHash = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';
const backgroundHash = '40372696A229A9E0C1E211C5D36DE4971B4AF38369FA9514210D497ED0C1DF7E';
const candidates = units.map(({ id, line, text, rationale }, index) => {
  const sourceText = line.spans[0].text;
  const spanKey = `page_100_unit_${id}__pt-BR`;
  return {
    blockIndex: 0,
    sourceBlockId: block.id,
    sourceUnitId: id,
    sourceLineIds: [line.id],
    spanKey,
    language: 'pt-BR',
    sourceText,
    sourcePdfVisualLineCount,
    sourceBboxes: [line.spans[0].bbox],
    proposalText: text,
    data: {
      schemaVersion: 2,
      spanKey,
      bbox: line.bbox,
      textAlign: 'left',
      lineHeight: 1,
      lineHeightMode: 'source',
      segments: [{
        text,
        font: line.spans[0].font,
        size: line.spans[0].size,
        weight: 700,
        style: 'normal',
        color: line.spans[0].color,
        disableLigatures: true,
      }],
      managedSourceSymbols: [],
    },
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    copyfitClassification: 'UNMEASURED',
    pageRendererVisualLineCount: null,
    technicalStatus: 'pending_live_viewer_copyfit_v3',
    pendingTerms: [
      'Current(s) → Corrente(s) is a local proposal based on this page’s moving-water mechanic; it is not an approved glossary decision.',
      rationale,
    ],
    sourceCell: index === 0 ? 'left' : 'right',
  };
});

await writeFile(pageDomPath, `${JSON.stringify(pageDom, null, 2)}\n`, 'utf8');
const pageDomHash = createHash('sha256').update(await readFile(pageDomPath)).digest('hex').toUpperCase();
const proposal = {
  proposalId: 'p100-current-effect-headings',
  version: '1',
  title: 'Cabeçalhos de efeitos das Correntes — p. 100',
  page: 100,
  status: 'pending_copyfit_v3',
  copyfitRevisionBudget: {
    naturalRevisionAttempts: 2,
    initialDraftAttempt: 1,
    revisionsUsed: 0,
    rule: 'Render every complete natural alternative with the same original typography and source column frame before retaining it. Do not omit meaning, change fonts, resize frames, or add artificial spacing to force a line count.',
  },
  sourcePdf: 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf',
  sourceHashes: { sourcePdf: sourcePdfHash, background: backgroundHash, pageDom: pageDomHash },
  counts: { candidates: candidates.length, existingHumanTranslationsPreserved: 0, finalTranslationWrites: 0, openExceptions: 0 },
  scopeLimits: [
    'This proposal covers only the two independent Table 10 column headings in block_11. No neighboring prose, art, or final translation is changed.',
    'Each heading stays on its original baseline and retains its Optima Bold 8 pt, white color, capitalization, source glyph origin, and column-specific available frame.',
    'Correntes is a local contextual term proposal, not a glossary decision.',
    'These are review candidates. Payload is read-only during measurement; human approval and final translation writes are not part of this proposal.',
  ],
  candidates,
  note: 'The headings classify the two Table 10 columns. Measure the two units separately against their respective source PDF visual baselines and the live PageRenderer.',
};
if (proposalExists) {
  const existing = JSON.parse(await readFile(proposalPath, 'utf8'));
  assert.equal(existing.proposalId, proposal.proposalId, 'Existing proposal ID differs; preserve it for manual reconciliation');
  existing.sourceHashes.pageDom = pageDomHash;
  await writeFile(proposalPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
} else {
  await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
}

const proposalDir = resolve(root, 'docs/translations/proposals');
const names = await readdir(proposalDir);
let updatedProposalHashes = 0;
for (const name of names.filter(file => /^page-100-.*\.json$/u.test(file) && file !== 'page-100-current-effect-headings-proposal-2026-10-17-v1.json')) {
  const path = resolve(proposalDir, name);
  const raw = await readFile(path, 'utf8');
  const existing = JSON.parse(raw);
  if (!existing.sourceHashes?.pageDom) continue;
  existing.sourceHashes.pageDom = pageDomHash;
  await writeFile(path, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  updatedProposalHashes += 1;
}
console.log(JSON.stringify({ proposalPath: proposalPath.slice(root.length + 1), pageDomHash, updatedProposalHashes, cellWidthsPt: block.lines.map(line => line.availableWidth) }, null, 2));
