import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Derive a concise v2 proposal from the immutable v1 snapshot. No canonical
// files or Payload records are changed.
const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH;
assert.ok(sourcePdfPath, 'Set MIDDARA_SOURCE_PDF_PATH to the official English source PDF');
const v1Dir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p044-damage-redistribution-v1');
const v2Dir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p044-damage-redistribution-v2');
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();
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

const sourceHashes = JSON.parse(await readFile(join(v1Dir, 'source-hashes.json'), 'utf8'));
assert.equal(sha256(await readFile(sourcePdfPath)), sourceHashes.sourcePdf, 'Official source PDF changed');
const pageDir = resolve(root, 'apps/web/public/pages/page_044');
for (const [name, expectedHash] of Object.entries({
  background: '2C3F3A69537BB35F37232CA4C8F4406229EE885DC1904F49FF5E9A93E347A61B',
  dom: '587058372551787043BFED9FE74D5CC9A6CB0A40025AA884A71343135DD47A34',
  layoutFrames: '04FE56C0D62B56F3C4C52F51BE194E735F6FCF6B7CD45841B8E3AF25790DF81E',
})) {
  const fileName = name === 'background' ? 'background.webp' : name === 'dom' ? 'page_044_dom.json' : 'layout_frames.json';
  assert.equal(sha256(await readFile(join(pageDir, fileName))), expectedHash, `Canonical p.44 ${name} changed`);
}

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
if (!translationsResponse.ok) throw new Error(`Payload read failed: ${translationsResponse.status}`);
const translationPayload = await translationsResponse.json();
const existing = (translationPayload.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_44_'));
assert.deepEqual(existing, [], 'p.44 now has saved PT-BR translations; preserve them and reassess before export');

const v1SnapshotPath = join(v1Dir, 'snapshot', 'snapshot-p044-damage-redistribution-v1-export.json');
const snapshot = JSON.parse(await readFile(v1SnapshotPath, 'utf8'));
assert.equal(snapshot.translations.length, 2, 'Unexpected v1 candidate count');
const [bodyCandidate, exampleCandidate] = structuredClone(snapshot.translations);
const makeSegment = (text, font = 'OptimaLTStd', size = 10, weight = 400, style = 'normal') => ({
  text, font, size, color: '#ffffff', weight, style,
});
const bodyText = 'Uma Habilidade que mova, redistribua ou altere o total de fichas de Dano de um Combatente sem mencionar especificamente a palavra “Dano” nem usar a Tag “CURAR” não conta como cura nem como Dano causado. Condições de Habilidade que exijam CURAR ou causar Dano para serem usadas também não podem ser usadas nessa redistribuição.';
bodyCandidate.data.segments = [
  makeSegment('Uma Habilidade que mova, redistribua ou altere o total de fichas de '),
  makeSegment('Dano', 'OptimaLTStd-Italic', 10, 400, 'italic'),
  makeSegment(' de um Combatente sem mencionar especificamente a palavra “'),
  makeSegment('Dano', 'OptimaLTStd-Bold', 10, 700),
  makeSegment('” nem usar a Tag “'),
  makeSegment('CURAR', 'OptimaLTStd-Bold', 10, 700),
  makeSegment('” '),
  makeSegment('não', 'OptimaLTStd-Bold', 10, 700),
  makeSegment(' conta como cura nem como Dano causado. Condições de Habilidade que exijam '),
  makeSegment('CURAR', 'OptimaLTStd-Bold', 10, 700),
  makeSegment(' ou causar Dano para serem usadas também não podem ser usadas nessa redistribuição.'),
];
const exampleText = 'Exemplo:\nZeke usa uma Vitality Juice Box em Nightingale. O Item permite que ela CURE 3. Nightingale tem atualmente 2 fichas de Dano em sua carta. O jogador de Nightingale removeria as 2 fichas de Dano, deixando-a com os PV completos. O 1 ponto de cura restante é perdido.';
exampleCandidate.data.segments = [
  makeSegment('Exemplo:\n', 'AGaramondPro-Bold', 12, 700),
  makeSegment('Zeke usa uma '),
  makeSegment('Vitality Juice Box', 'OptimaLTStd-BoldItalic', 10, 700, 'italic'),
  makeSegment(' em Nightingale. O Item permite que ela '),
  makeSegment('CURE 3', 'OptimaLTStd-Bold', 9, 700),
  makeSegment('. Nightingale tem atualmente '),
  makeSegment('2', 'OptimaLTStd-Bold', 9, 700),
  makeSegment(' fichas de '),
  makeSegment('Dano', 'OptimaLTStd-BoldItalic', 10, 700, 'italic'),
  makeSegment(' '),
  makeSegment('em sua', 'OptimaLTStd-BoldItalic', 10, 700, 'italic'),
  makeSegment(' carta. O jogador de Nightingale removeria as '),
  makeSegment('2', 'OptimaLTStd-Bold', 9, 700),
  makeSegment(' fichas de '),
  makeSegment('Dano', 'OptimaLTStd-Italic', 10, 400, 'italic'),
  makeSegment(', deixando-a com os PV completos. O '),
  makeSegment('1', 'OptimaLTStd-Bold', 9, 700),
  makeSegment(' ponto de cura restante é perdido.'),
];
assert.equal(bodyCandidate.data.segments.map(segment => segment.text).join(''), bodyText);
assert.equal(exampleCandidate.data.segments.map(segment => segment.text).join(''), exampleText);

const proposalV1 = JSON.parse(await readFile(join(v1Dir, 'proposal-p044-damage-redistribution-v1.json'), 'utf8'));
const proposal = {
  ...proposalV1,
  status: 'isolated-proposal-pending-copyfit-and-human-review',
  sourceHashes: proposalV1.sourceHashes,
  proposalText: { body: bodyText, example: exampleText },
  candidates: [bodyCandidate, exampleCandidate],
  revision: {
    basedOn: 'p044-damage-redistribution-v1',
    reason: 'v1 export clipped the example at the bottom page rule; v2 shortens wording while keeping source font, line height, and unit frames unchanged.',
  },
  copyfit: {
    sourceBodyLines: 5,
    sourceExampleLines: 5,
    lineHeight: 1.1,
    fontAndFrameUnchanged: true,
    status: 'pending-v2-render',
  },
};
snapshot.translations = [bodyCandidate, exampleCandidate];

const sourceAssetDir = join(v1Dir, 'snapshot', 'pages', 'page_044');
const targetAssetDir = join(v2Dir, 'snapshot', 'pages', 'page_044');
await mkdir(targetAssetDir, { recursive: true });
for (const name of (await readdir(sourceAssetDir)).sort()) {
  await immutableWrite(join(targetAssetDir, name), await readFile(join(sourceAssetDir, name)));
}
await immutableWrite(join(v2Dir, 'snapshot', 'snapshot-p044-damage-redistribution-v2-export.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(v2Dir, 'proposal-p044-damage-redistribution-v2.json'), `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(join(root, 'docs/translations/proposals/page-044-damage-redistribution-example-proposal-2026-10-15-v2.json'), `${JSON.stringify(proposal, null, 2)}\n`);
console.log(JSON.stringify({
  page: 44,
  candidateRecords: 2,
  uniqueKeys: new Set(snapshot.translations.map(record => record.spanKey)).size === 2,
  payloadRecords: existing.length,
  snapshot: join(v2Dir, 'snapshot', 'snapshot-p044-damage-redistribution-v2-export.json'),
  proposal: join(v2Dir, 'proposal-p044-damage-redistribution-v2.json'),
}, null, 2));
