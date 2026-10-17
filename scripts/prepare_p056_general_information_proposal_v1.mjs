import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Build an immutable, read-only PT-BR proposal for the two Combatant-type
// definitions and their concluding transition on printed p.56.
const root = process.cwd();
const page = 56;
const pageId = `page_${String(page).padStart(3, '0')}`;
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-general-information-v1');
const snapshotDir = join(proofDir, 'snapshot');
const sourceDir = resolve(root, 'apps/web/public/pages', pageId);
const proposalPath = resolve(root, 'docs/translations/proposals/page-056-general-information-proposal-2026-10-15-v1.json');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://127.0.0.1:3000';
const expectedSourcePdfSha256 = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
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
async function fetchJson(path, params = {}) {
  const url = new URL(path, apiUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Read-only API request failed (${response.status}): ${url}`);
  return response.json();
}

const sourcePdfBytes = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdfBytes), expectedSourcePdfSha256, 'Official source PDF changed');

const pageFileNames = (await readdir(sourceDir)).sort();
const pageAssets = {};
for (const name of pageFileNames) {
  const bytes = await readFile(join(sourceDir, name));
  pageAssets[name] = bytes;
}
const domBytes = pageAssets[`${pageId}_dom.json`];
assert.ok(domBytes, `Missing ${pageId} DOM`);
const dom = JSON.parse(domBytes.toString('utf8'));
const expectedSources = {
  block_12: '1. Command Combatants: Players directly control Command Combatants. Usually Command Combatants represent characters that temporarily join the characters on their Adventure.',
  block_13: '2. Intelligent Combatants: These type of Combatants are used to automate figures on the board, meaning, no player chooses their Actions. Instead, these figures will make their own decisions.',
  block_14: 'Regardless of which type of Combatant a player is using, both share much of the same information. Below is the information and rules that both types share.',
};
const sourceBlocks = Object.fromEntries(Object.keys(expectedSources).map(id => {
  const block = dom.blocks.find(item => item.id === id);
  assert.ok(block, `Missing source block ${id}`);
  const text = normalize(block.lines.flatMap(line => (line.spans ?? [])
    .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '')).join(' '));
  assert.equal(text, normalize(expectedSources[id]), `Source text changed in ${id}`);
  return [id, block];
}));

const bold = text => ({ text, font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal' });
const regular = text => ({ text, font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' });
const definitions = [
  {
    blockId: 'block_12',
    spanKey: 'page_56_block_2__pt-BR',
    lineHeight: 1.2,
    segments: [
      bold('1.\tCombatentes de Comando:'),
      regular(' Os jogadores controlam diretamente os Combatentes de Comando. Em geral, eles representam personagens que se juntam temporariamente aos personagens durante a Aventura.'),
    ],
  },
  {
    blockId: 'block_13',
    spanKey: 'page_56_block_3__pt-BR',
    lineHeight: 1.2,
    segments: [
      bold('2.\tCombatentes Inteligentes:'),
      regular(' Esses Combatentes automatizam as miniaturas no tabuleiro: nenhum jogador escolhe suas Ações; eles tomam as próprias decisões.'),
    ],
  },
  {
    blockId: 'block_14',
    spanKey: 'page_56_block_4__pt-BR',
    lineHeight: 1.1,
    segments: [
      regular('Independentemente do tipo de Combatente que o jogador usa, ambos compartilham muitas das mesmas informações. A seguir estão as informações e regras compartilhadas pelos dois tipos.'),
    ],
  },
].map(item => {
  const block = sourceBlocks[item.blockId];
  const text = item.segments.map(segment => segment.text).join('');
  const candidate = {
    spanKey: item.spanKey,
    language: 'pt-BR',
    data: {
      schemaVersion: 2,
      spanKey: item.spanKey,
      bbox: block.bbox,
      textAlign: 'left',
      lineHeight: item.lineHeight,
      lineHeightMode: 'custom',
      segments: item.segments,
      managedSourceSymbols: [],
    },
  };
  return { ...item, sourceText: normalize(expectedSources[item.blockId]), text, candidate };
});

assert.equal(new Set(definitions.map(item => item.spanKey)).size, definitions.length, 'Duplicate candidate keys');
const payload = await fetchJson('/api/translations', {
  'where[language][equals]': 'pt-BR', limit: '5000',
});
const existingPageRecords = (payload.docs ?? [])
  .filter(record => String(record.spanKey ?? '').startsWith('page_56_'))
  .map(record => ({ id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt, sha256: sha256(Buffer.from(stable(record))) }))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.deepEqual(existingPageRecords, [], 'A PT-BR record already exists for p.56; preserve it and reassess');
assert.ok(!definitions.some(item => existingPageRecords.some(record => record.spanKey === item.spanKey)), 'Candidate key already exists');

const frames = await fetchJson('/api/layout-frames', {
  'where[and][0][pageNumber][equals]': String(page), limit: '1000',
});
const aliases = await fetchJson('/api/symbol-alias-settings', { limit: '500' });
const boxResult = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, String(page),
], { encoding: 'utf8' });
if (boxResult.status !== 0) throw new Error(`Could not read source PDF page boxes: ${boxResult.stderr || boxResult.stdout}`);
const sourcePageBoxes = JSON.parse(boxResult.stdout);

const copiedAssetHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', pageId);
await mkdir(snapshotPageDir, { recursive: true });
for (const [name, bytes] of Object.entries(pageAssets)) {
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedAssetHashes[name] = sha256(bytes);
}

const snapshot = {
  translations: definitions.map(item => item.candidate),
  layoutFrames: (frames.docs ?? []).filter(record => Number(record.pageNumber) === page),
  symbolAliasSettings: aliases.docs ?? [],
  assetPages: [page], page, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes,
};
const proposal = {
  page,
  family: 'General Information — definições de Combatentes de Comando e Combatentes Inteligentes',
  status: 'isolated-proposal-awaiting-copyfit-and-human-editorial-review',
  attempt: 1,
  revisionBudget: 2,
  sourceHashes: {
    sourcePdf: expectedSourcePdfSha256,
    pageFiles: copiedAssetHashes,
    payloadBaseline: existingPageRecords,
  },
  candidateKeysUnique: true,
  candidates: definitions.map(({ blockId, spanKey, lineHeight, sourceText, text, candidate }) => ({
    blockId, spanKey, sourceText, proposalText: text, lineHeight, candidate,
  })),
  scopeLimits: [
    'Only block_12 (Combatants de Comando), block_13 (Combatants Inteligentes) and block_14 (transition) are proposed.',
    'The heading, introduction, Activation Numbers and Groups section, card artwork, and all other p.56 content remain in English.',
    'No translation was written to Payload, localStorage, or canonical page data.',
  ],
  terminologyPendingHumanReview: [
    'Combatant → Combatente, Command Combatant → Combatente de Comando, Intelligent Combatant → Combatente Inteligente, Figure → miniatura, Action → Ação, and Adventure → Aventura are proposal forms, not new glossary approvals.',
  ],
  richText: {
    boldListLabelsAndNumbersPreserved: true,
    sourceListTabMarkersPreserved: true,
    sourceFontFamiliesAndSizesPreserved: true,
    semanticSymbolsInScope: 0,
  },
  copyfit: {
    sourceLines: { block_12: 3, block_13: 3, block_14: 3 },
    sourceBaselineLineHeights: { block_12: 1.2, block_13: 1.2, block_14: 1.1 },
    status: 'awaiting-first-render',
    evidence: [],
  },
  editorSourceCheck: {
    openedKeys: ['page_56_block_2', 'page_56_block_3', 'page_56_block_4'],
    sourceTextShown: true,
    cancelledWithoutSave: true,
    unsyncedLocalRecords: 0,
    ptBrPayloadRecordsBeforeProposal: 0,
  },
};

await immutableWrite(join(snapshotDir, 'snapshot-p056-general-information-v1-export.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'proposal-p056-general-information-v1.json'), `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({
  sourcePdfSha256: expectedSourcePdfSha256,
  pageFiles: copiedAssetHashes,
  payloadPtBrRecords: existingPageRecords,
  layoutFrameCount: snapshot.layoutFrames.length,
}, null, 2)}\n`);

console.log(JSON.stringify({
  page, keys: definitions.map(item => item.spanKey),
  sourceUnitCount: definitions.length,
  payloadPageRecords: existingPageRecords.length,
  layoutFrames: snapshot.layoutFrames.length,
  snapshot: join(snapshotDir, 'snapshot-p056-general-information-v1-export.json'),
  proposal: proposalPath,
  sourcePageBoxes,
}, null, 2));
