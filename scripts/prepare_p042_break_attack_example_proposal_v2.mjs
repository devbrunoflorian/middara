import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Prepare one structurally validated Example unit on p.42 as an isolated
// translation proposal. Payload is read-only; canonical files are not edited.
const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p042-break-attack-v2');
const snapshotDir = join(proofDir, 'snapshot');
const sourceDir = resolve(root, 'apps/web/public/pages/page_042');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH;
assert.ok(sourcePdfPath, 'Set MIDDARA_SOURCE_PDF_PATH to the official English source PDF');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const expected = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  background: '67EF2B3B06C4E6894D2969229A91A7D21428EBB80A48A9C7528BF9EEB0F04EDA',
  dom: '48FEB0B5EA48CECBE7BC6808E6C4C752B9C0331A17B54AC4DACB8B965B4E9DEA',
  inlineElements: '39A48ACDAFB30404B965DE74C250E96C87153F7B7F2117858FA2EB86FD36B97D',
  layoutFrames: '38C442B9B97BCF9FA34551001AE9357D229B29A31747BF08C57487A6EEF8AB10',
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
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

const sourcePdf = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdf), expected.sourcePdf, 'Official source PDF changed');
const sourceFiles = {
  background: join(sourceDir, 'background.webp'),
  dom: join(sourceDir, 'page_042_dom.json'),
  inlineElements: join(sourceDir, 'inline_elements.json'),
  layoutFrames: join(sourceDir, 'layout_frames.json'),
};
const sourceBytes = Object.fromEntries(await Promise.all(Object.entries(sourceFiles)
  .map(async ([key, path]) => [key, await readFile(path)])));
for (const [key, bytes] of Object.entries(sourceBytes)) {
  assert.equal(sha256(bytes), expected[key], `Canonical p.42 ${key} changed`);
}
const dom = JSON.parse(sourceBytes.dom.toString('utf8'));
const pageBlock = dom.blocks.find(block => block.id === 'block_18');
assert.ok(pageBlock, 'Missing p.42 break-attack example block');
const unit = pageBlock.typographicUnits?.find(item => item.id === 'p42-break-attack-example');
assert.ok(unit, 'Missing structurally validated p.42 Example unit');
const lineIds = ['line_18_2', 'line_18_3', 'line_18_4'];
assert.deepEqual(unit.field.lineIds, lineIds, 'p.42 Example source line ownership changed');
const norm = value => String(value).replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1').trim();
const sourceText = norm(lineIds.flatMap(lineId => {
  const line = pageBlock.lines.find(item => item.id === lineId);
  return (line?.spans ?? []).filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '');
}).join(' '));
const expectedSource = 'Example: So long as they had not already made a Break Attack this turn, Nightingale would provoke a separate Break Attack from both Cave Sickles if she moved into any space.';
assert.equal(sourceText, expectedSource, 'p.42 Example text changed');

const candidate = {
  spanKey: 'page_42_unit_p42-break-attack-example__pt-BR',
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    spanKey: 'page_42_unit_p42-break-attack-example__pt-BR',
    bbox: unit.field.bbox,
    textAlign: unit.field.frame?.textAlign ?? 'left',
    lineHeight: unit.field.frame?.lineHeight ?? 1.1,
    lineHeightMode: 'custom',
    segments: [
      { text: 'Exemplo: ', font: 'AGaramondPro-Bold', size: 12, color: '#ffffff', weight: 700, style: 'normal' },
      { text: 'Se ainda não tiver feito um Ataque de Oportunidade neste turno, Nightingale provocaria um Ataque de Oportunidade de cada um dos dois Cave Sickles ao entrar em qualquer espaço.', font: 'OptimaLTStd', size: 10, color: '#ffffff', weight: 400, style: 'normal' },
    ],
    managedSourceSymbols: [],
  },
};

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
if (!translationsResponse.ok) throw new Error(`Payload read failed: ${translationsResponse.status}`);
const translationPayload = await translationsResponse.json();
const existing = (translationPayload.docs ?? [])
  .filter(doc => String(doc.spanKey ?? '').startsWith('page_42_'))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.deepEqual(existing.map(doc => [doc.id, doc.spanKey, doc.updatedAt]), [
  [298, 'page_42_unit_p42-hindering-terrain-example__pt-BR', '2026-10-07T21:42:18.676Z'],
], 'Saved p.42 translation state differs from the captured baseline');
assert.ok(!existing.some(doc => doc.spanKey === candidate.spanKey), 'Candidate key already exists in Payload');
const existingBaseline = existing.map(doc => ({
  id: doc.id,
  spanKey: doc.spanKey,
  updatedAt: doc.updatedAt,
  sha256: sha256(stable(doc)),
}));
await immutableWrite(join(proofDir, 'preexisting-payload-records.json'), `${JSON.stringify({
  readOnlyCapture: true, page: 42, language: 'pt-BR', records: existingBaseline,
}, null, 2)}\n`);

const framesResponse = await fetch(new URL('/api/layout-frames?where%5Band%5D%5B0%5D%5BpageNumber%5D%5Bequals%5D=42&limit=1000', apiUrl));
if (!framesResponse.ok) throw new Error(`Payload layout-frame read failed: ${framesResponse.status}`);
const framesPayload = await framesResponse.json();
const aliasResponse = await fetch(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
if (!aliasResponse.ok) throw new Error(`Payload symbol-alias read failed: ${aliasResponse.status}`);
const aliasPayload = await aliasResponse.json();

const copiedHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', 'page_042');
await mkdir(snapshotPageDir, { recursive: true });
for (const name of (await readdir(sourceDir)).sort()) {
  const bytes = await readFile(join(sourceDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}

const pageBox = {
  mediaBox: [0, 0, 820.3460083007812, 820.3460083007812],
  cropBox: [0, 0, 820.3460083007812, 820.3460083007812],
  bleedBox: [0, 0, 820.3460083007812, 820.3460083007812],
  trimBox: [14.173199653625488, 14.17303466796875, 806.1729736328125, 806.1728086471558],
  artBox: [14.173199653625488, 14.17303466796875, 806.1729736328125, 806.1728086471558],
};
const snapshot = {
  translations: [...existing, candidate],
  layoutFrames: (framesPayload.docs ?? []).filter(doc => Number(doc.pageNumber) === 42),
  symbolAliasSettings: aliasPayload.docs ?? [],
  assetPages: [42], page: 42, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes: { 42: pageBox },
};
const proposal = {
  page: 42,
  unit: 'p42-break-attack-example',
  family: 'Example label + body',
  status: 'isolated-proposal-pending-human-review',
  sourceHashes: { sourcePdf: expected.sourcePdf, ...expected },
  existingPayloadRecords: existingBaseline,
  candidateRecordCount: 1,
  candidateKeyUnique: true,
  sourceText,
  proposalText: candidate.data.segments.map(segment => segment.text).join(''),
  terminologyPendingHumanReview: [
    'Break Attack → Ataque de Oportunidade: glossary maps “Breaking Attack”; exact variant relation still needs editorial confirmation.',
    'Nightingale and Cave Sickle are preserved as source names pending glossary confirmation.',
  ],
  copyfit: { sourceLines: lineIds.length, sourceLeading: candidate.data.lineHeight, fontAndFrameUnchanged: true },
  note: 'Only the structurally validated Example unit is proposed. Existing Payload translation id 298 is preserved in the isolated export snapshot and is not modified.',
  candidate,
};
const tracked = join(root, 'docs/translations/proposals/page-042-break-attack-example-proposal-2026-10-15-v2.json');
await immutableWrite(join(snapshotDir, 'snapshot-p042-break-attack-example-v2-export.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'proposal-p042-break-attack-example-v2.json'), `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(tracked, `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({ sourcePdf: expected.sourcePdf, pageAssets: copiedHashes }, null, 2)}\n`);
console.log(JSON.stringify({
  page: 42, unit: unit.id, candidateRecords: 1, uniqueKeys: true,
  existingPayloadRecordIds: existing.map(record => record.id),
  frames: snapshot.layoutFrames.length, aliases: snapshot.symbolAliasSettings.length,
  snapshot: join(snapshotDir, 'snapshot-p042-break-attack-example-v2-export.json'),
  sourceHashes: expected,
}, null, 2));
