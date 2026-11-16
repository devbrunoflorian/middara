import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Prepare two structurally validated p.46 editorial units for isolated
// translation preview. Payload is read-only; canonical sidecars are untouched.
const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p046-encounter-action-v1');
const snapshotDir = join(proofDir, 'snapshot');
const sourceDir = resolve(root, 'apps/web/public/pages/page_046');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH;
assert.ok(sourcePdfPath, 'Set MIDDARA_SOURCE_PDF_PATH to the official English source PDF');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const expected = {
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
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed proof artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

assert.equal(sha256(await readFile(sourcePdfPath)), expected.sourcePdf, 'Official source PDF changed');
const sourceFiles = {
  background: join(sourceDir, 'background.webp'),
  dom: join(sourceDir, 'page_046_dom.json'),
  inlineElements: join(sourceDir, 'inline_elements.json'),
  layoutFrames: join(sourceDir, 'layout_frames.json'),
  fidelityOverlays: join(sourceDir, 'fidelity_overlays.json'),
};
const sourceBytes = Object.fromEntries(await Promise.all(Object.entries(sourceFiles)
  .map(async ([key, path]) => [key, await readFile(path)])));
for (const [key, bytes] of Object.entries(sourceBytes)) {
  assert.equal(sha256(bytes), expected[key], `Canonical p.46 ${key} changed`);
}

const dom = JSON.parse(sourceBytes.dom.toString('utf8'));
const pageBlock = dom.blocks.find(block => block.id === 'block_14');
assert.ok(pageBlock, 'Missing p.46 Encounter Action block');
const bodyUnit = pageBlock.typographicUnits?.find(item => item.id === 'p46-encounter-action-body');
const exampleUnit = pageBlock.typographicUnits?.find(item => item.id === 'p46-encounter-action-example');
assert.ok(bodyUnit && exampleUnit, 'Missing structurally partitioned p.46 Body or Example unit');
const bodyLineIds = ['line_14_0', 'line_14_1', 'line_14_2', 'line_14_3'];
const exampleLineIds = ['line_14_4', 'line_14_5', 'line_14_6'];
assert.deepEqual(bodyUnit.field.lineIds, bodyLineIds, 'p.46 body line ownership changed');
assert.deepEqual(exampleUnit.field.lineIds, exampleLineIds, 'p.46 example line ownership changed');
const norm = value => String(value).replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1')
  .replace(/"\s+([^"\n]+?)\s+"/gu, '"$1"')
  .replace(/“\s+([^”\n]+?)\s+”/gu, '“$1”').trim();
const getSourceText = lineIds => norm(lineIds.flatMap(lineId => {
  const line = pageBlock.lines.find(item => item.id === lineId);
  return (line?.spans ?? []).filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '');
}).join(' '));
const bodySource = getSourceText(bodyLineIds);
const exampleSource = getSourceText(exampleLineIds);
assert.equal(bodySource,
  'In addition, an Encounter’s Special Encounter Rules will occasionally allow Adventurers to interact with Tiles in special ways. When this occurs, an Encounter will specifically say “As an Encounter Action” when referring to this Action.',
  'p.46 body source text changed');
assert.equal(exampleSource,
  'Example: In the example below, the Encounter’s Special Encounter Rules say:',
  'p.46 example source text changed');

const bodyKey = 'page_46_unit_p46-encounter-action-body__pt-BR';
const exampleKey = 'page_46_unit_p46-encounter-action-example__pt-BR';
const makeSegment = (text, font = 'OptimaLTStd', size = 10, weight = 400, style = 'normal') => ({
  text, font, size, color: '#ffffff', weight, style,
});
const bodyText = 'Além disso, as Regras Especiais de Encontro às vezes permitem que os Aventureiros interajam com Peças de formas especiais. Nesses casos, o Encontro dirá especificamente “Como uma Ação de Encontro” ao se referir a essa Ação.';
const bodyCandidate = {
  spanKey: bodyKey,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    spanKey: bodyKey,
    bbox: bodyUnit.field.bbox,
    textAlign: bodyUnit.field.frame?.textAlign ?? 'left',
    lineHeight: bodyUnit.field.frame?.lineHeight ?? 1.1,
    lineHeightMode: 'custom',
    segments: [
      makeSegment('Além disso, as Regras Especiais de Encontro às vezes permitem que os Aventureiros interajam com Peças de formas especiais. Nesses casos, o Encontro dirá especificamente “'),
      makeSegment('Como uma Ação de Encontro', 'OptimaLTStd-BoldItalic', 10, 700, 'italic'),
      makeSegment('” ao se referir a essa Ação.'),
    ],
    managedSourceSymbols: [],
  },
};
const exampleText = 'Exemplo:\nNo exemplo abaixo, as Regras Especiais de Encontro dizem:';
const exampleCandidate = {
  spanKey: exampleKey,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    spanKey: exampleKey,
    bbox: exampleUnit.field.bbox,
    textAlign: exampleUnit.field.frame?.textAlign ?? 'left',
    lineHeight: exampleUnit.field.frame?.lineHeight ?? 1.1,
    lineHeightMode: 'custom',
    segments: [
      makeSegment('Exemplo:', 'AGaramondPro-Bold', 12, 700),
      makeSegment('\n', 'OptimaLTStd-Bold', 10, 700),
      makeSegment('No exemplo abaixo, as Regras Especiais de Encontro dizem:'),
    ],
    managedSourceSymbols: [],
  },
};
assert.equal(bodyCandidate.data.segments.map(segment => segment.text).join(''), bodyText);
assert.equal(exampleCandidate.data.segments.map(segment => segment.text).join(''), exampleText);

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
if (!translationsResponse.ok) throw new Error(`Payload read failed: ${translationsResponse.status}`);
const translationPayload = await translationsResponse.json();
const existing = (translationPayload.docs ?? [])
  .filter(doc => String(doc.spanKey ?? '').startsWith('page_46_'))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.deepEqual(existing, [], 'p.46 now has saved PT-BR translations; preserve them and reassess before export');
assert.ok(!existing.some(doc => [bodyKey, exampleKey].includes(doc.spanKey)), 'Candidate key already exists in Payload');
const existingBaseline = existing.map(doc => ({
  id: doc.id,
  spanKey: doc.spanKey,
  updatedAt: doc.updatedAt,
  sha256: sha256(stable(doc)),
}));

const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[and][0][pageNumber][equals]', '46');
framesUrl.searchParams.set('limit', '1000');
const framesResponse = await fetch(framesUrl);
if (!framesResponse.ok) throw new Error(`Payload layout-frame read failed: ${framesResponse.status}`);
const framesPayload = await framesResponse.json();
const aliasesResponse = await fetch(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
if (!aliasesResponse.ok) throw new Error(`Payload symbol-alias read failed: ${aliasesResponse.status}`);
const aliasesPayload = await aliasesResponse.json();

const copiedHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', 'page_046');
await mkdir(snapshotPageDir, { recursive: true });
for (const name of (await readdir(sourceDir)).sort()) {
  const bytes = await readFile(join(sourceDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}
const boxResult = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '46',
], { encoding: 'utf8' });
if (boxResult.status !== 0) throw new Error(`Source PDF boxes failed: ${boxResult.stderr || boxResult.stdout}`);
const sourcePageBoxes = JSON.parse(boxResult.stdout);

const snapshot = {
  translations: [bodyCandidate, exampleCandidate],
  layoutFrames: (framesPayload.docs ?? []).filter(doc => Number(doc.pageNumber) === 46),
  symbolAliasSettings: aliasesPayload.docs ?? [],
  assetPages: [46], page: 46, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes,
};
const proposal = {
  page: 46,
  unit: ['p46-encounter-action-body', 'p46-encounter-action-example'],
  family: 'Example label + body',
  status: 'isolated-proposal-copyfit-verified-pending-human-review',
  sourceHashes: { sourcePdf: expected.sourcePdf, ...expected },
  existingPayloadRecords: existingBaseline,
  candidateRecordCount: 2,
  candidateKeysUnique: new Set([bodyKey, exampleKey]).size === 2,
  sourceText: { body: bodySource, example: exampleSource },
  proposalText: { body: bodyText, example: exampleText },
  terminologyPendingHumanReview: [
    'Encounter → Encontro, Action → Ação and Encounter Action → Ação de Encontro are local proposals; no approved glossary entries were found for these terms.',
    'Special Encounter Rules → Regras Especiais de Encontro and Tiles → Peças use the current approved glossary forms; Adventurers → Aventureiros is used in the glossary plural form.',
  ],
  copyfit: {
    sourceBodyLines: bodyLineIds.length,
    sourceExampleLines: exampleLineIds.length,
    lineHeight: 1.1,
    fontAndFrameUnchanged: true,
    revisionBudget: 2,
    currentAttempt: 1,
    status: 'verified-in-isolated-viewer-and-pdf',
  },
  note: 'Only the two structurally partitioned p.46 editorial units are proposed. The quotation is bold-italic in the source and remains so. No Payload, canonical sidecar, source PDF, or human translation was written.',
  candidates: [bodyCandidate, exampleCandidate],
};
const trackedPath = join(root, 'docs/translations/proposals/page-046-encounter-action-example-proposal-2026-10-15-v1.json');
await immutableWrite(join(snapshotDir, 'snapshot-p046-encounter-action-v1-export.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'proposal-p046-encounter-action-v1.json'), `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(trackedPath, `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(join(proofDir, 'preexisting-payload-records.json'), `${JSON.stringify({
  readOnlyCapture: true, page: 46, language: 'pt-BR', records: existingBaseline,
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({ sourcePdf: expected.sourcePdf, pageAssets: copiedHashes }, null, 2)}\n`);
console.log(JSON.stringify({
  page: 46,
  units: proposal.unit,
  candidateRecords: proposal.candidateRecordCount,
  uniqueKeys: proposal.candidateKeysUnique,
  existingPayloadRecords: existing.length,
  frames: snapshot.layoutFrames.length,
  aliases: snapshot.symbolAliasSettings.length,
  snapshot: join(snapshotDir, 'snapshot-p046-encounter-action-v1-export.json'),
  sourceHashes: expected,
}, null, 2));
