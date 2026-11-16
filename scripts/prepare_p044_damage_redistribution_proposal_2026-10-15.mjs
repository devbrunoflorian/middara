import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Prepare a recoverable, isolated proposal for the structurally partitioned
// p.44 damage-redistribution paragraph and its example. Payload is read-only.
const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p044-damage-redistribution-v1');
const snapshotDir = join(proofDir, 'snapshot');
const sourceDir = resolve(root, 'apps/web/public/pages/page_044');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH;
assert.ok(sourcePdfPath, 'Set MIDDARA_SOURCE_PDF_PATH to the official English source PDF');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const expected = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  background: '2C3F3A69537BB35F37232CA4C8F4406229EE885DC1904F49FF5E9A93E347A61B',
  dom: '587058372551787043BFED9FE74D5CC9A6CB0A40025AA884A71343135DD47A34',
  layoutFrames: '04FE56C0D62B56F3C4C52F51BE194E735F6FCF6B7CD45841B8E3AF25790DF81E',
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

const sourcePdf = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdf), expected.sourcePdf, 'Official source PDF changed');
const sourceFiles = {
  background: join(sourceDir, 'background.webp'),
  dom: join(sourceDir, 'page_044_dom.json'),
  layoutFrames: join(sourceDir, 'layout_frames.json'),
};
const sourceBytes = Object.fromEntries(await Promise.all(Object.entries(sourceFiles)
  .map(async ([key, path]) => [key, await readFile(path)])));
for (const [key, bytes] of Object.entries(sourceBytes)) {
  assert.equal(sha256(bytes), expected[key], `Canonical p.44 ${key} changed`);
}
assert.ok(!(await readdir(sourceDir)).includes('inline_elements.json'), 'p.44 now has inline_elements.json; recheck semantics before proposing');

const dom = JSON.parse(sourceBytes.dom.toString('utf8'));
const pageBlock = dom.blocks.find(block => block.id === 'block_13');
assert.ok(pageBlock, 'Missing p.44 damage-redistribution block');
const bodyUnit = pageBlock.typographicUnits?.find(item => item.id === 'p44-damage-redistribution-body');
const exampleUnit = pageBlock.typographicUnits?.find(item => item.id === 'p44-damage-redistribution-example');
assert.ok(bodyUnit && exampleUnit, 'Missing structurally partitioned p.44 body or example unit');
const bodyLineIds = ['line_13_0', 'line_13_1', 'line_13_2', 'line_13_3', 'line_13_4'];
const exampleLineIds = ['line_13_5', 'line_13_6', 'line_13_7', 'line_13_8', 'line_13_9'];
assert.deepEqual(bodyUnit.field.lineIds, bodyLineIds, 'p.44 body line ownership changed');
assert.deepEqual(exampleUnit.field.lineIds, exampleLineIds, 'p.44 example line ownership changed');
const norm = value => String(value).replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1')
  .replace(/"\s+([^"\n]+?)\s+"/gu, '"$1"').trim();
const getSourceText = lineIds => norm(lineIds.flatMap(lineId => {
  const line = pageBlock.lines.find(item => item.id === lineId);
  return (line?.spans ?? []).filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '');
}).join(' '));
const bodySource = getSourceText(bodyLineIds);
const exampleSource = getSourceText(exampleLineIds);
assert.equal(bodySource,
  'An Ability that redistributes, moves, or otherwise changes Damage token totals on a Combatant without specifically using the word "Damage" or the Tag "HEAL" does not count as healing or dealing Damage. Likewise, Ability Conditions that require you to HEAL or deal Damage to be used cannot be used with such redistribution of Damage tokens.',
  'p.44 body source text changed');
assert.equal(exampleSource,
  "Example: Zeke uses a Vitality Juice Box on Nightingale. This Item allows Nightingale to HEAL 3. Nightingale currently has 2 Damage tokens on her card. Nightingale's player would remove the 2 Damage tokens from her card, bringing her to full HP. The 1 point of unused healing is lost.",
  'p.44 example source text changed');

const bodyKey = 'page_44_unit_p44-damage-redistribution-body__pt-BR';
const exampleKey = 'page_44_unit_p44-damage-redistribution-example__pt-BR';
const makeSegment = (text, font = 'OptimaLTStd', size = 10, weight = 400, style = 'normal') => ({
  text, font, size, color: '#ffffff', weight, style,
});
const bodyText = 'Uma Habilidade que redistribua, mova ou altere de outra forma o total de fichas de Dano de um Combatente sem usar especificamente a palavra “Dano” ou a Tag “CURAR” não conta como curar nem causar Dano. Da mesma forma, Condições de Habilidade que exijam que você CURE ou cause Dano para serem usadas não podem ser usadas com essa redistribuição de fichas de Dano.';
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
      makeSegment('Uma Habilidade que redistribua, mova ou altere de outra forma o total de fichas de '),
      makeSegment('Dano', 'OptimaLTStd-Italic', 10, 400, 'italic'),
      makeSegment(' de um Combatente sem usar especificamente a palavra “'),
      makeSegment('Dano', 'OptimaLTStd-Bold', 10, 700),
      makeSegment('” ou a Tag “'),
      makeSegment('CURAR', 'OptimaLTStd-Bold', 10, 700),
      makeSegment('” '),
      makeSegment('não', 'OptimaLTStd-Bold', 10, 700),
      makeSegment(' conta como curar nem causar Dano. Da mesma forma, Condições de Habilidade que exijam que você '),
      makeSegment('CURE', 'OptimaLTStd-Bold', 10, 700),
      makeSegment(' ou cause Dano para serem usadas não podem ser usadas com essa redistribuição de fichas de '),
      makeSegment('Dano', 'OptimaLTStd-Italic', 10, 400, 'italic'),
      makeSegment('.'),
    ],
    managedSourceSymbols: [],
  },
};
const exampleText = 'Exemplo:\nZeke usa uma Vitality Juice Box em Nightingale. Esse Item permite que Nightingale CURE 3. Atualmente, Nightingale tem 2 fichas de Dano em sua carta. O jogador de Nightingale removeria as 2 fichas de Dano da carta dela, deixando-a com os PV completos. O 1 ponto de cura não utilizado é perdido.';
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
      makeSegment('Exemplo:\n', 'AGaramondPro-Bold', 12, 700),
      makeSegment('Zeke usa uma '),
      makeSegment('Vitality Juice Box', 'OptimaLTStd-BoldItalic', 10, 700, 'italic'),
      makeSegment(' em Nightingale. Esse Item permite que Nightingale '),
      makeSegment('CURE 3', 'OptimaLTStd-Bold', 9, 700),
      makeSegment('. Atualmente, Nightingale tem '),
      makeSegment('2', 'OptimaLTStd-Bold', 9, 700),
      makeSegment(' fichas de '),
      makeSegment('Dano', 'OptimaLTStd-BoldItalic', 10, 700, 'italic'),
      makeSegment(' '),
      makeSegment('em sua', 'OptimaLTStd-BoldItalic', 10, 700, 'italic'),
      makeSegment(' carta'),
      makeSegment('. O jogador de Nightingale removeria as '),
      makeSegment('2', 'OptimaLTStd-Bold', 9, 700),
      makeSegment(' fichas de '),
      makeSegment('Dano', 'OptimaLTStd-Italic', 10, 400, 'italic'),
      makeSegment(' da carta dela, deixando-a com os PV completos. O '),
      makeSegment('1', 'OptimaLTStd-Bold', 9, 700),
      makeSegment(' ponto de cura não utilizado é perdido.'),
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
  .filter(doc => String(doc.spanKey ?? '').startsWith('page_44_'))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.deepEqual(existing, [], 'p.44 now has saved PT-BR translations; preserve them and reassess before export');
assert.ok(!existing.some(doc => [bodyKey, exampleKey].includes(doc.spanKey)), 'Candidate key already exists in Payload');
const existingBaseline = existing.map(doc => ({
  id: doc.id,
  spanKey: doc.spanKey,
  updatedAt: doc.updatedAt,
  sha256: sha256(stable(doc)),
}));

const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[and][0][pageNumber][equals]', '44');
framesUrl.searchParams.set('limit', '1000');
const framesResponse = await fetch(framesUrl);
if (!framesResponse.ok) throw new Error(`Payload layout-frame read failed: ${framesResponse.status}`);
const framesPayload = await framesResponse.json();
const aliasesResponse = await fetch(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
if (!aliasesResponse.ok) throw new Error(`Payload symbol-alias read failed: ${aliasesResponse.status}`);
const aliasesPayload = await aliasesResponse.json();

const copiedHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', 'page_044');
await mkdir(snapshotPageDir, { recursive: true });
for (const name of (await readdir(sourceDir)).sort()) {
  const bytes = await readFile(join(sourceDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}
const boxResult = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '44',
], { encoding: 'utf8' });
if (boxResult.status !== 0) throw new Error(`Source PDF boxes failed: ${boxResult.stderr || boxResult.stdout}`);
const sourcePageBoxes = JSON.parse(boxResult.stdout);

const snapshot = {
  translations: [bodyCandidate, exampleCandidate],
  layoutFrames: (framesPayload.docs ?? []).filter(doc => Number(doc.pageNumber) === 44),
  symbolAliasSettings: aliasesPayload.docs ?? [],
  assetPages: [44], page: 44, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes,
};
const proposal = {
  page: 44,
  unit: ['p44-damage-redistribution-body', 'p44-damage-redistribution-example'],
  family: 'Example label + body',
  status: 'isolated-proposal-pending-copyfit-and-human-review',
  sourceHashes: { sourcePdf: expected.sourcePdf, ...expected },
  existingPayloadRecords: existingBaseline,
  candidateRecordCount: 2,
  candidateKeysUnique: true,
  sourceText: { body: bodySource, example: exampleSource },
  proposalText: { body: bodyText, example: exampleText },
  terminologyPendingHumanReview: [
    'Ability → Habilidade, Combatant → Combatente, Damage → Dano, Ability Conditions → Condições de Habilidade, healing → cura and deal Damage → causar Dano remain local proposals; Token → Ficha is confirmed in the current glossary, while the other cited terms were not found there.',
    'HEAL tag/action → CURAR is a local proposal used elsewhere but is not confirmed in the current glossary.',
    'HP → PV is proposed in the p.30 draft but is still marked for human confirmation.',
    'Vitality Juice Box is preserved in English as a named Item pending terminology review; Nightingale is preserved as a source name.',
  ],
  copyfit: {
    sourceBodyLines: bodyLineIds.length,
    sourceExampleLines: exampleLineIds.length,
    lineHeight: 1.1,
    fontAndFrameUnchanged: true,
    status: 'not-yet-rendered',
  },
  note: 'Two structurally partitioned p.44 units are proposed in an isolated snapshot. No Payload, canonical sidecar, source PDF, or human translation was written.',
  candidates: [bodyCandidate, exampleCandidate],
};
const trackedPath = join(root, 'docs/translations/proposals/page-044-damage-redistribution-example-proposal-2026-10-15.json');
await immutableWrite(join(snapshotDir, 'snapshot-p044-damage-redistribution-v1-export.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'proposal-p044-damage-redistribution-v1.json'), `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(trackedPath, `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(join(proofDir, 'preexisting-payload-records.json'), `${JSON.stringify({
  readOnlyCapture: true, page: 44, language: 'pt-BR', records: existingBaseline,
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({ sourcePdf: expected.sourcePdf, pageAssets: copiedHashes }, null, 2)}\n`);
console.log(JSON.stringify({
  page: 44,
  units: proposal.unit,
  candidateRecords: 2,
  uniqueKeys: true,
  existingPayloadRecords: existing.length,
  frames: snapshot.layoutFrames.length,
  aliases: snapshot.symbolAliasSettings.length,
  snapshot: join(snapshotDir, 'snapshot-p044-damage-redistribution-v1-export.json'),
  sourceHashes: expected,
}, null, 2));
