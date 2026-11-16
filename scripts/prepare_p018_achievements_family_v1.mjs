#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Prepare the isolated, complete Achievements editorial family on p.18.
// Reads Payload and canonical assets; writes only an isolated snapshot package.
const root = process.cwd();
const page = 18;
const pageId = '018';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const pageDir = resolve(root, 'apps/web/public/pages', `page_${pageId}`);
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', `page_${pageId}`);
const expectedHashes = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  background: 'D7462DED18644ACB0E10C6CFDA0BF7CA4385D08D24362718F7E44D83D2D8E463',
  dom: '9D13BA6EEFDA190CA6D28ECF13D5686225E778064D5A1F254C6573AE1436826A',
  inlineElements: 'D69AC6AF6943B77D56A16EFE60FC149ED472CD713B82F5E78FC423578466774F',
  inlineMask000: '5795EE7435A54589E64608AB7C72F29CEDCB175CB8BD5C23FAFA078949BE793C',
  inlineMask001: 'D5EBABE2C1A88014B7E7444B6FE14BB470F2A65A33C2B6667AD6D522EFA97110',
  inlineMask002: 'BCC58E298F3AE403D6A54DBDA7DD76D27F11245BF9DF82E0E1DD0AE51E6C0F50',
  layoutFrames: '4A35EA98B246E0AE6D0CFC440C74DFAEAC1846D91C8A6A450E6464B6315E976F',
};
const familyBlocks = [
  {
    blockId: 'block_140',
    proposalText: 'Conquistas',
    pendingTerms: ['Achievement → Conquista: candidate form, not approved in the official glossary.'],
  },
  {
    blockId: 'block_142',
    proposalText: 'Alguns Encontros têm Conquistas. São recompensas especiais que os jogadores podem obter ao fazer algo extraordinário. Quando a Condição de uma Conquista é cumprida, leia o texto oculto ao lado dela. Cada Conquista só pode ser concluída uma vez. Salvo indicação em contrário, somente o Aventureiro que concluiu a Conquista recebe a recompensa.',
    pendingTerms: [
      'Achievement → Conquista: candidate form, not approved in the official glossary.',
      'Condition → Condição: capitalization and mechanical use need human terminology review.',
      'Gain/reward → obter/receber recompensa: contextually equivalent draft; global wording remains under review.',
    ],
  },
  {
    blockId: 'block_143',
    proposalText: 'Muitas Conquistas são difíceis de alcançar e podem exigir combinações específicas de Habilidades ou Itens para serem concluídas.',
    pendingTerms: [
      'Achievement → Conquista: candidate form, not approved in the official glossary.',
      'Ability/Item → Habilidade/Item: capitalization in this rules context needs human review.',
    ],
  },
  {
    blockId: 'block_144',
    proposalText: 'No final do Livro de Regras, há uma Ficha de Aventura com uma lista para os jogadores marcarem as Conquistas que tentam completar!',
    pendingTerms: [
      'Adventure Sheet → Ficha de Aventura: matches p.11 human usage, but glossary candidates list competing forms; approval pending.',
      'Achievement → Conquista: candidate form, not approved in the official glossary.',
    ],
  },
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const normalize = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
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
assert.equal(sha256(sourcePdf), expectedHashes.sourcePdf, 'Official source PDF changed.');
const sourceAssetNames = {
  background: 'background.webp',
  dom: `page_${pageId}_dom.json`,
  inlineElements: 'inline_elements.json',
  inlineMask000: 'inline-element-mask-000.png',
  inlineMask001: 'inline-element-mask-001.png',
  inlineMask002: 'inline-element-mask-002.png',
  layoutFrames: 'layout_frames.json',
};
const sourceAssets = Object.fromEntries(await Promise.all(Object.entries(sourceAssetNames).map(
  async ([key, name]) => [key, await readFile(join(pageDir, name))],
)));
for (const [key, bytes] of Object.entries(sourceAssets)) {
  assert.equal(sha256(bytes), expectedHashes[key], `Canonical p.18 asset changed: ${sourceAssetNames[key]}`);
}
const dom = JSON.parse(sourceAssets.dom.toString('utf8'));
assert.equal(dom.page_number, page);
const indexedBlocks = new Map(dom.blocks.map((block, index) => [block.id, { block, index }]));
const expectedFamily = ['block_140', 'block_142', 'block_143', 'block_144'];
assert.deepEqual(familyBlocks.map(item => item.blockId), expectedFamily);
const baselineOf = span => {
  if (Array.isArray(span?.origin)) return Number(span.origin[1]);
  const parts = String(span?.origin ?? '').trim().split(/\s+/u);
  return Number(parts[1]);
};
const bodyLineSteps = [];
for (const blockId of ['block_142', 'block_143', 'block_144']) {
  const { block } = indexedBlocks.get(blockId) ?? {};
  assert.ok(block, `Missing family member ${blockId}`);
  const baselines = block.lines.map(line => baselineOf(line.spans.find(span => span.origin && span.text.trim())))
    .filter(Number.isFinite);
  for (let index = 1; index < baselines.length; index += 1) bodyLineSteps.push(baselines[index] - baselines[index - 1]);
}
bodyLineSteps.sort((a, b) => a - b);
const sourceLeadingPt = bodyLineSteps[Math.floor(bodyLineSteps.length / 2)];
const bodyLineHeight = Number((sourceLeadingPt / 10).toFixed(3));
assert.ok(Math.abs(bodyLineHeight - 1.1) <= 0.02, `Unexpected body line height ${bodyLineHeight}`);

const candidates = familyBlocks.map(spec => {
  const { block, index } = indexedBlocks.get(spec.blockId) ?? {};
  assert.ok(block, `Missing block ${spec.blockId}`);
  const sourceRuns = block.lines.flatMap(line => line.spans ?? [])
    .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings' && span.text?.trim());
  assert.ok(sourceRuns.length, `No visible source text for ${spec.blockId}`);
  const sourceText = normalize(sourceRuns.map(span => span.text).join(' '));
  const isHeading = spec.blockId === 'block_140';
  const base = sourceRuns[0];
  const weight = Number(base.renderWeightOverride ?? (base.font?.includes('Bold') ? 700 : 400));
  const style = base.font?.includes('Italic') ? 'italic' : 'normal';
  const spanKey = `page_${page}_block_${index}__pt-BR`;
  const segment = {
    text: spec.proposalText,
    font: base.font,
    size: Number(base.size),
    color: base.color ?? '#231f20',
    weight,
    style,
    disableLigatures: true,
  };
  return {
    spanKey,
    sourceEditorialKey: `page_${page}_block_${index}`,
    blockIndex: index,
    blockId: spec.blockId,
    sourceText,
    proposalText: spec.proposalText,
    sourceLineCount: block.lines.length,
    pendingTerms: spec.pendingTerms,
    language: 'pt-BR',
    data: {
      schemaVersion: 2,
      spanKey,
      bbox: block.bbox,
      textAlign: 'left',
      lineHeight: isHeading ? 1 : bodyLineHeight,
      lineHeightMode: 'custom',
      segments: [segment],
      managedSourceSymbols: [],
    },
  };
});
assert.equal(candidates.length, 4);
assert.equal(new Set(candidates.map(item => item.spanKey)).size, candidates.length, 'Duplicate translation keys.');
assert.ok(candidates.every(item => item.spanKey.endsWith('__pt-BR') && !item.spanKey.includes('__en')));

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsPayload = await getJson(translationsUrl.pathname + translationsUrl.search);
const existingPageRecords = (translationsPayload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith(`page_${page}_`));
assert.deepEqual(existingPageRecords, [], 'p.18 has saved PT-BR records; preserve and reassess before this isolated snapshot.');
for (const candidate of candidates) {
  assert.ok(!existingPageRecords.some(record => record.spanKey === candidate.spanKey), `Payload already contains ${candidate.spanKey}`);
}

const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[and][0][pageNumber][equals]', String(page));
framesUrl.searchParams.set('limit', '1000');
const frames = await getJson(framesUrl.pathname + framesUrl.search);
const aliases = await getJson('/api/symbol-alias-settings?limit=500');

const copiedHashes = {};
await mkdir(snapshotPageDir, { recursive: true });
for (const name of (await readdir(pageDir)).sort()) {
  const bytes = await readFile(join(pageDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}
const sourcePageBoxes = {
  '18': {
    mediaBox: [0, 0, 820.3460083007812, 820.3460083007812],
    cropBox: [0, 0, 820.3460083007812, 820.3460083007812],
    bleedBox: [0, 0, 820.3460083007812, 820.3460083007812],
    trimBox: [14.173199653625488, 14.17303466796875, 806.1729736328125, 806.1728086471558],
    artBox: [14.173199653625488, 14.17303466796875, 806.1729736328125, 806.1728086471558],
  },
};
const snapshot = {
  translations: candidates.map(({ spanKey, language, data }) => ({ spanKey, language, data })),
  layoutFrames: (frames.docs ?? []).filter(record => Number(record.pageNumber) === page),
  symbolAliasSettings: aliases.docs ?? [],
  assetPages: [page],
  page,
  patched: true,
  verifyRenderedSnapshot: true,
  sourcePageBoxes,
};
const snapshotPath = join(snapshotDir, 'snapshot.json');
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({
  sourcePdf: expectedHashes.sourcePdf,
  pageAssets: copiedHashes,
  payloadPageTranslationRecords: existingPageRecords,
  payloadWrites: 0,
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'proposal-candidates.json'), `${JSON.stringify({
  status: 'draft-family-candidate-awaiting-live-render',
  page,
  family: 'Achievements heading and three prose units',
  scope: expectedFamily,
  sourcePageHashes: expectedHashes,
  sourceLineHeight: { method: 'median adjacent 10 pt source baselines', sourceLeadingPt, bodyLineHeight },
  candidates,
  artworkBoundary: 'This family covers only the Achievements heading and its three editable prose blocks. Page 18 card artwork and the remaining page text are out of scope.',
}, null, 2)}\n`);

console.log(JSON.stringify({
  status: 'isolated-family-snapshot-prepared',
  page,
  family: 'Achievements',
  candidates: candidates.map(({ spanKey, sourceText, proposalText }) => ({ spanKey, sourceText, proposalText })),
  payloadPageRecordsBefore: existingPageRecords.length,
  payloadWrites: 0,
  sourcePdfSha256: expectedHashes.sourcePdf,
  pageAssetHashes: copiedHashes,
  snapshotPath: resolve(snapshotPath),
}, null, 2));
