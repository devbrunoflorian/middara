#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Build an isolated PT-BR proposal for every editable prose unit on p.46.
// Canonical page assets and Payload are read-only inputs.
const root = process.cwd();
const page = 46;
const pageId = '046';
const attempt = Number(process.argv[2] ?? 1);
assert.ok([1, 2].includes(attempt), 'Use attempt 1 or 2; the copyfit revision budget is two.');
const version = `v${attempt}`;
const proofDir = resolve(root, `output/proofs/translation-readiness-2026-10-16/p046-full-page-proposal-${version}`);
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', `page_${pageId}`);
const pageDir = resolve(root, 'apps/web/public/pages', `page_${pageId}`);
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const expectedHashes = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  background: '9BC239D68098C5C70D0DA0D4F4AEF46F01B4254822E10238C9B5B6673E4A7447',
  dom: '638D0DA3D290B8D6834B1F49615BAC16507A9AD46C0F13BEF0BB932EEEAA1AEF',
  inlineElements: 'A70C035BD66FE703032B829D065CE7D93C596145BC1779DAACDC2A5C67D8D710',
  layoutFrames: '28DEBAAF1A99A8BEE710CC706E3A0FB1174B86E433687CE0B51BFB299DD59C59',
  fidelityOverlays: '942C9A27CD1DB849A30EA4FADF6BC645B0411A15E48514EB5722F9C97E663736',
};

const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
async function getJson(path) {
  const response = await fetch(new URL(path, apiUrl), { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Read-only GET ${path} failed: ${response.status}`);
  return response.json();
}

const sourcePdf = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdf), expectedHashes.sourcePdf, 'Official source PDF changed');
const sourceNames = {
  background: 'background.webp',
  dom: `page_${pageId}_dom.json`,
  inlineElements: 'inline_elements.json',
  layoutFrames: 'layout_frames.json',
  fidelityOverlays: 'fidelity_overlays.json',
};
const sourceBytes = Object.fromEntries(await Promise.all(Object.entries(sourceNames)
  .map(async ([key, name]) => [key, await readFile(join(pageDir, name))])));
for (const [key, bytes] of Object.entries(sourceBytes)) {
  assert.equal(sha256(bytes), expectedHashes[key], `Canonical p.46 ${key} changed`);
}
const dom = JSON.parse(sourceBytes.dom.toString('utf8'));
assert.equal(dom.page_number, page);
const expectedTextBlockIds = ['block_12', 'block_13', 'block_14', 'block_15', 'block_16', 'block_22', 'block_25', 'block_26', 'block_27', 'block_28', 'block_29'];
assert.deepEqual(dom.blocks.filter(block => block.id !== 'block_30').map(block => block.id), expectedTextBlockIds,
  'p.46 visible text-block inventory changed');

const previousProposal = JSON.parse(await readFile(resolve(root,
  'docs/translations/proposals/page-046-encounter-action-example-proposal-2026-10-15-v1.json'), 'utf8'));
assert.equal(previousProposal.candidateRecordCount, 2);
const existingUnitCandidates = previousProposal.candidates;
assert.deepEqual(existingUnitCandidates.map(candidate => candidate.spanKey).sort(), [
  'page_46_unit_p46-encounter-action-body__pt-BR',
  'page_46_unit_p46-encounter-action-example__pt-BR',
].sort());

const sourceText = block => (block.lines ?? []).flatMap(line => line.spans ?? [])
  .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
  .map(span => span.text ?? '').join(' ').replace(/\s+/gu, ' ').trim();
const byId = new Map(dom.blocks.map((block, index) => [block.id, { block, index }]));
const baselineStepsPt = [];
for (const blockId of ['block_12', 'block_13', 'block_15', 'block_16', 'block_26', 'block_28']) {
  const { block } = byId.get(blockId);
  const baselines = (block.lines ?? []).map(line => {
    const span = (line.spans ?? []).find(item => String(item.text ?? '').trim()
      && !item.renderOnlyStrokePass && item.font !== 'Webdings' && Number(item.size) === 10);
    return span?.origin?.[1];
  }).filter(Number.isFinite);
  for (let index = 1; index < baselines.length; index += 1) {
    const delta = Math.abs(baselines[index] - baselines[index - 1]);
    if (delta > 9 && delta < 13) baselineStepsPt.push(delta);
  }
}
baselineStepsPt.sort((a, b) => a - b);
const sourceLeadingPt = baselineStepsPt[Math.floor(baselineStepsPt.length / 2)];
assert.ok(Number.isFinite(sourceLeadingPt), 'Could not derive p.46 source leading from text baselines');
const sourceLineHeight = Number((sourceLeadingPt / 10).toFixed(3));
assert.ok(Math.abs(sourceLineHeight - 1.1) <= 0.01, `Unexpected p.46 body line-height ${sourceLineHeight}`);
const plainSegment = (blockId, text, style = {}) => {
  const { block } = byId.get(blockId);
  const base = block.lines.flatMap(line => line.spans ?? [])
    .find(span => String(span.text ?? '').trim() && span.font !== 'Webdings' && !span.renderOnlyStrokePass);
  assert.ok(base, `No base source span for ${blockId}`);
  return {
    text,
    font: style.font ?? base.font,
    size: style.size ?? base.size,
    color: style.color ?? base.color,
    weight: style.weight ?? (base.font?.includes('Black') ? 900 : base.font?.includes('Bold') ? 700 : 400),
    style: style.style ?? (base.font?.includes('Italic') ? 'italic' : 'normal'),
    disableLigatures: true,
    ...(style.symbolId ? { symbolId: style.symbolId, symbolMetrics: style.symbolMetrics } : {}),
  };
};
const normal = (blockId, text, size) => plainSegment(blockId, text, size ? { size } : {});
const bold = (blockId, text, size = 10) => plainSegment(blockId, text, { font: size === 9 ? 'OptimaLTStd-Bold' : 'OptimaLTStd-Bold', size, weight: 700 });
const italic = (blockId, text, size = 10) => plainSegment(blockId, text, { font: 'OptimaLTStd-Italic', size, weight: 400, style: 'italic' });
const boldItalic = (blockId, text, size = 10) => plainSegment(blockId, text, { font: 'OptimaLTStd-BoldItalic', size, weight: 700, style: 'italic' });

const proposedBlocks = [
  {
    blockId: 'block_12',
    text: 'Uma Ação de Encontro é usada sempre que uma Regra Especial de Encontro a exigir ou para interagir com uma ficha de Saque.',
    segments: [normal('block_12', 'Uma Ação de Encontro é usada sempre que uma Regra Especial de Encontro a exigir ou para interagir com uma ficha de '), italic('block_12', 'Saque'), normal('block_12', '.')],
    pending: ['Ação de Encontro'],
  },
  {
    blockId: 'block_13',
    text: 'Muitos Encontros usam fichas de Saque. Um Aventureiro pode ativar uma ficha ao realizar uma Ação de Encontro estando no espaço dela ou em um espaço adjacente.',
    segments: [normal('block_13', 'Muitos Encontros usam fichas de '), italic('block_13', 'Saque'), normal('block_13', '. Um Aventureiro pode ativar uma ficha ao realizar uma Ação de Encontro estando no espaço dela ou em um espaço adjacente.')],
    pending: ['Ação de Encontro'],
  },
  {
    blockId: 'block_15',
    text: '“Rocha Móvel: Como uma Ação de Encontro, um Aventureiro adjacente à ficha de Terreno Obstruído na Peça UM1 pode realizar um Teste de Força 10. Se passar, poderá mover a ficha de Terreno Obstruído para qualquer espaço adjacente desocupado.”',
    segments: [
      normal('block_15', '“'), bold('block_15', 'Rocha Móvel:'), normal('block_15', ' Como uma Ação de Encontro, um Aventureiro adjacente à ficha de '),
      italic('block_15', 'Terreno Obstruído'), normal('block_15', ' na '), bold('block_15', 'Peça UM1'),
      normal('block_15', ' pode realizar um '), bold('block_15', 'Teste de Força 10'), normal('block_15', '. Se passar, poderá mover a ficha de '),
      italic('block_15', 'Terreno Obstruído'), normal('block_15', ' para qualquer espaço adjacente desocupado.”'),
    ],
    pending: ['Ação de Encontro', 'Rocha Móvel', 'Força 10'],
  },
  {
    blockId: 'block_16',
    text: 'Isso significa que Rook pode gastar 1 SP para realizar uma Ação de Encontro adjacente à ficha de Terreno Obstruído. Se passar em um Teste de Força 10 (veja Testes de Habilidade, pág. 68), ele pode mover a ficha para fora do caminho. Porém, só pode movê-la para um espaço adjacente desocupado, não para o espaço ocupado por ele ou pela Cave Sickle.',
    segments: [
      normal('block_16', 'Isso significa que Rook pode gastar '), bold('block_16', '1 SP', 9),
      normal('block_16', ' para realizar uma Ação de Encontro adjacente à ficha de '), italic('block_16', 'Terreno Obstruído'),
      normal('block_16', '. Se passar em um '), bold('block_16', 'Teste de Força 10'), normal('block_16', ' (veja '),
      bold('block_16', 'Testes de Habilidade'), normal('block_16', ', pág. 68), ele pode mover a ficha para fora do caminho. Porém, só pode movê-la para um espaço adjacente desocupado, não para o espaço ocupado por ele ou pela Cave Sickle.'),
    ],
    pending: ['Ação de Encontro', 'Força 10', 'Cave Sickle'],
  },
  {
    blockId: 'block_22',
    text: 'Ação de Reequipar',
    segments: [plainSegment('block_22', 'Ação de Reequipar')],
    pending: ['Re-Equip Action → Ação de Reequipar'],
  },
  {
    blockId: 'block_25',
    text: 'Ações de Encontro',
    segments: [plainSegment('block_25', 'Ações de Encontro')],
    pending: ['Encounter Action(s) → Ação(ões) de Encontro'],
    textAlign: 'center',
  },
  {
    blockId: 'block_26',
    text: 'Por 1 SP, a Ação de Reequipar permite equipar Itens da Mochila e guardar Itens nela. Também se pode pegar Itens e Companheiros de Aventureiros adjacentes, mas nunca dá-los a outro Aventureiro. O Aventureiro de quem algo for pego também pode reequipar seus Itens nesta Ação, mas não pode pegar Itens ou Companheiros de outro Aventureiro.',
    segments: [
      normal('block_26', 'Por '), bold('block_26', '1 SP', 9),
      normal('block_26', ', a Ação de Reequipar permite equipar Itens da Mochila e guardar Itens nela. Também se pode pegar Itens e Companheiros de Aventureiros adjacentes, mas '),
      bold('block_26', 'nunca'), normal('block_26', ' dá-los a outro Aventureiro. O Aventureiro de quem algo for pego também pode reequipar seus Itens nesta Ação, mas não pode pegar Itens ou Companheiros de outro Aventureiro.'),
    ],
    pending: ['Re-Equip Action → Ação de Reequipar', 'Pack → Mochila', 'Companion(s) → Companheiro(s)'],
  },
  {
    blockId: 'block_27',
    text: 'Por 1 SP, pode-se equipar, desequipar ou pegar sem limite.',
    segments: [normal('block_27', 'Por '), bold('block_27', '1 SP', 9), normal('block_27', ', pode-se equipar, desequipar ou pegar sem limite.')],
    pending: ['Equip / unequip → equipar / desequipar'],
  },
  {
    blockId: 'block_28',
    text: 'Itens guardados na Mochila mantêm o estado em que estavam ao serem guardados (por exemplo, virados, usados ou exaustos). Fora isso, são virados, desexaustados e têm as fichas removidas conforme as regras normais.',
    segments: [normal('block_28', 'Itens guardados na Mochila mantêm o estado em que estavam ao serem guardados (por exemplo, virados, usados ou exaustos). Fora isso, são virados, desexaustados e têm as fichas removidas conforme as regras normais.')],
    pending: ['Pack → Mochila', 'Exhausted / Un-Exhaust → exausto / desexaustar (escopo de aprovação humana)'],
  },
  {
    blockId: 'block_29',
    text: 'IMPORTANTE: Um Aventureiro só pode usar Habilidades de Itens que estejam equipados.',
    segments: [
      plainSegment('block_29', '\uFFFC', {
        font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal',
        symbolId: 'tag.important.icon', symbolMetrics: { widthEm: 1, heightEm: 1, verticalAlignEm: 0.2 },
      }),
      plainSegment('block_29', 'IMPORTANTE:', { font: 'OptimaLTStd-Black', size: 10, color: '#231f20', weight: 900, style: 'normal' }),
      plainSegment('block_29', ' Um Aventureiro só pode usar Habilidades de Itens que estejam equipados.', {
        font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal',
      }),
    ],
    pending: [],
    managedSourceSymbols: ['tag.important.icon'],
  },
];

if (attempt === 2) {
  const storageRule = proposedBlocks.find(spec => spec.blockId === 'block_28');
  storageRule.text = 'Na Mochila, os Itens mantêm o estado em que foram guardados (por exemplo, virados, usados ou exaustos). De resto, são virados, desexaustados e têm as fichas removidas conforme as regras normais.';
  storageRule.segments = [normal('block_28', storageRule.text)];
}

function makeBlockCandidate(spec) {
  const { block } = byId.get(spec.blockId);
  const blockIndex = byId.get(spec.blockId).index;
  const spanKey = `page_${page}_block_${blockIndex}__pt-BR`;
  return {
    spanKey,
    blockIndex,
    blockId: spec.blockId,
    unitId: null,
    sourceText: sourceText(block),
    proposalText: spec.text,
    pendingTerms: spec.pending,
    language: 'pt-BR',
    data: {
      schemaVersion: 2,
      spanKey,
      bbox: block.bbox,
      textAlign: spec.textAlign ?? 'left',
      lineHeight: sourceLineHeight,
      lineHeightMode: 'custom',
      segments: spec.segments,
      managedSourceSymbols: spec.managedSourceSymbols ?? [],
    },
  };
}

const newBlockCandidates = proposedBlocks.map(makeBlockCandidate);
assert.equal(newBlockCandidates.length, expectedTextBlockIds.length - 1);
assert.equal(newBlockCandidates.length, 10, 'Expected 10 non-editorial-unit text blocks besides the two block_14 units');
const allCandidates = [...existingUnitCandidates, ...newBlockCandidates];
assert.equal(allCandidates.length, 12);
assert.equal(new Set(allCandidates.map(candidate => candidate.spanKey)).size, allCandidates.length, 'Duplicate translation keys');
assert.ok(allCandidates.every(candidate => candidate.spanKey.endsWith('__pt-BR') && !candidate.spanKey.includes('__en')));
for (const candidate of allCandidates) {
  const text = candidate.data.segments.map(segment => segment.symbolId ? '' : segment.text).join('');
  const expected = candidate.proposalText ?? previousProposal.proposalText[
    candidate.spanKey.endsWith('p46-encounter-action-body__pt-BR') ? 'body' : 'example'
  ];
  assert.equal(text, expected, `Serialized rich text differs from proposal: ${candidate.spanKey}`);
}

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const payload = await getJson(translationsUrl.pathname + translationsUrl.search);
const existingRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith(`page_${page}_`));
assert.deepEqual(existingRecords, [], 'p.46 has saved PT-BR records; preserve and reassess before export');

const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[and][0][pageNumber][equals]', String(page));
framesUrl.searchParams.set('limit', '1000');
const frames = await getJson(framesUrl.pathname + framesUrl.search);
const aliases = await getJson('/api/symbol-alias-settings?limit=500');
const previousSnapshot = JSON.parse(await readFile(resolve(root,
  'output/proofs/translation-readiness-2026-10-15/p046-encounter-action-v1/snapshot/snapshot-p046-encounter-action-v1-export.json'), 'utf8'));
assert.ok(previousSnapshot.sourcePageBoxes?.pages?.some(item => Number(item.page) === page)
  || previousSnapshot.sourcePageBoxes?.['46']
  || previousSnapshot.sourcePageBoxes?.page === page,
'Existing source-page box evidence for p.46 changed shape');

const copiedHashes = {};
await mkdir(snapshotPageDir, { recursive: true });
for (const name of (await readdir(pageDir)).sort()) {
  const bytes = await readFile(join(pageDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}
for (const [key, name] of Object.entries(sourceNames)) {
  assert.equal(copiedHashes[name], expectedHashes[key], `Snapshot source asset differs: ${name}`);
}

const snapshot = {
  translations: allCandidates.map(({ spanKey, language, data }) => ({ spanKey, language, data })),
  layoutFrames: (frames.docs ?? []).filter(record => Number(record.pageNumber) === page),
  symbolAliasSettings: aliases.docs ?? [],
  assetPages: [page], page, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes: previousSnapshot.sourcePageBoxes,
};
const snapshotPath = join(snapshotDir, `snapshot-p046-full-page-${version}-export.json`);
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

const proposal = {
  page,
  status: attempt === 1
    ? 'complete-editable-prose-proposal-first-copyfit-attempt; visual-review-failed-block-28-overlaps-important'
    : 'complete-editable-prose-proposal-second-and-final-copyfit-attempt; human-terminology-review-pending',
  editableSourceBlocks: expectedTextBlockIds,
  pageNumberBlockExcluded: 'block_30',
  sourceHashes: { sourcePdf: expectedHashes.sourcePdf, ...expectedHashes },
  existingPayloadRecords: [],
  readOnlyPayloadQuery: { page, language: 'pt-BR', matchedRecords: 0 },
  candidateRecordCount: allCandidates.length,
  uniqueKeys: new Set(allCandidates.map(candidate => candidate.spanKey)).size === allCandidates.length,
  unitCoverage: allCandidates.map(candidate => ({
    spanKey: candidate.spanKey,
    blockId: candidate.blockId ?? (candidate.spanKey.includes('encounter-action-body') || candidate.spanKey.includes('encounter-action-example') ? 'block_14' : null),
    unitId: candidate.unitId ?? (candidate.spanKey.includes('_unit_') ? candidate.spanKey.split('_unit_')[1].replace(/__pt-BR$/u, '') : null),
    sourceText: candidate.sourceText ?? previousProposal.sourceText[
      candidate.spanKey.endsWith('p46-encounter-action-body__pt-BR') ? 'body' : 'example'
    ],
    proposalText: candidate.proposalText ?? previousProposal.proposalText[
      candidate.spanKey.endsWith('p46-encounter-action-body__pt-BR') ? 'body' : 'example'
    ],
    pendingTerms: candidate.pendingTerms ?? [],
    data: candidate.data,
  })),
  copyfit: {
    attemptsAllowed: 2,
    currentAttempt: attempt,
    derivedSourceLeading: {
      method: 'median adjacent PDF-derived text baselines in current p.46 DOM, 10 pt body runs',
      sourceStepPt: sourceLeadingPt,
      sourceFontSizePt: 10.0,
      lineHeight: sourceLineHeight,
    },
    fontAndCanonicalFrameChanges: false,
    status: 'awaiting-live-Viewer-and-isolated-PDF-render',
  },
  terminologyReview: [
    'Encounter / Encounter Action / Re-Equip Action / Action: use local candidate forms Encontro / Ação de Encontro / Ação de Reequipar / Ação; human approval remains pending.',
    'Pack / Store / equip / Companion: Mochila / guardar / equipar / Companheiro are proposal forms, not glossary decisions.',
    'Rook is retained as a proper name. Cave Sickle remains English pending the creature-name decision.',
    'Strength 10 Check → Teste de Força 10 and Un-Exhaust → desexaustar require human glossary review in context.',
  ],
  artworkPolicy: 'The page illustration and board example remain as source artwork; the proposal covers all editable prose/headings and the semantic IMPORTANT symbol.',
  candidates: allCandidates.map(({ spanKey, blockIndex, blockId, unitId, sourceText: original, proposalText: target, pendingTerms, language, data }) => ({
    spanKey, blockIndex, blockId, unitId, sourceText: original, proposalText: target, pendingTerms, language, data,
  })),
  integrity: {
    payloadWrites: 0,
    canonicalPageWrites: 0,
    humanTranslationWrites: 0,
    sourcePdfWrites: 0,
    commitOrPush: false,
  },
};

const proposalPath = resolve(root, `docs/translations/proposals/page-046-full-page-proposal-2026-10-16-${version}.json`);
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({
  sourcePdf: expectedHashes.sourcePdf,
  pageAssets: copiedHashes,
  payloadPageTranslationRecords: existingRecords,
}, null, 2)}\n`);

const output = {
  pdf: join(proofDir, `page-046-pt-BR-full-page-${version}.pdf`),
  viewer: join(proofDir, `page-046-pt-BR-viewer-${version}.png`),
  print: join(proofDir, `page-046-pt-BR-print-${version}.png`),
  metrics: join(proofDir, `export-metrics-${version}.json`),
};
const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', String(page), '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', output.pdf, '--metrics-output', output.metrics,
  '--viewer-screenshot', output.viewer, '--print-screenshot', output.print,
  '--base-url', 'http://127.0.0.1:8080', '--api-url', apiUrl,
], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (exportResult.stdout) process.stdout.write(exportResult.stdout);
if (exportResult.stderr) process.stderr.write(exportResult.stderr);
if (exportResult.status !== 0) throw new Error(`Isolated official page export failed (${exportResult.status ?? exportResult.error})`);
const exportSummaryMatch = exportResult.stdout.match(/\[page-export\] completed environment and result\s+(\{[\s\S]+\})\s*$/u);
assert.ok(exportSummaryMatch, 'Official exporter did not emit its completion receipt');
const exportSummary = JSON.parse(exportSummaryMatch[1]);
assert.equal(exportSummary.page, page);
assert.equal(exportSummary.language, 'pt-BR');
assert.equal(exportSummary.verifiedTranslationRecords, true, 'Not every proposed record was verified in the Viewer');
assert.equal(exportSummary.pdfVerification, true, 'Official PDF verification failed');

const exportMetrics = JSON.parse(await readFile(output.metrics, 'utf8'));
assert.equal(exportMetrics.page, page);
assert.equal(exportMetrics.language, 'pt-BR');
const outputHashes = Object.fromEntries(await Promise.all(Object.entries(output)
  .map(async ([key, path]) => [key, { path: relative(root, path), sha256: sha256(await readFile(path)) }])));
await immutableWrite(join(proofDir, `export-receipt-${version}.json`), `${JSON.stringify({
  status: 'official-isolated-export-succeeded; visual review pending',
  page, language: 'pt-BR', sourceHashes: { sourcePdf: expectedHashes.sourcePdf, ...expectedHashes },
  copiedAssets: copiedHashes,
  translationKeys: allCandidates.map(candidate => candidate.spanKey),
  recordCount: allCandidates.length,
  verifiedTranslationRecords: exportSummary.verifiedTranslationRecords,
  pdfVerification: exportSummary.pdfVerification,
  viewerMetrics: exportMetrics,
  outputHashes,
  persistence: { payloadWrites: 0, canonicalPageWrites: 0, humanTranslationWrites: 0 },
}, null, 2)}\n`);
console.log(JSON.stringify({
  page, attempt, status: 'isolated-full-page-proposal-exported',
  editableProseUnits: allCandidates.length,
  payloadRecordsBefore: existingRecords.length,
  sourceHashes: expectedHashes,
  output: outputHashes,
}, null, 2));
