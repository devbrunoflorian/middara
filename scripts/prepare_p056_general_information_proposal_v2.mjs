import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Build the complete, isolated "General Information" family for printed p.56.
// The v1 artifacts remain immutable; this version adds the heading and intro,
// and uses literal spaces after the numbered labels.
const root = process.cwd();
const page = 56;
const pageId = 'page_056';
const v1Dir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-general-information-v1');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-general-information-v2');
const snapshotDir = join(proofDir, 'snapshot');
const sourceDir = resolve(root, 'apps/web/public/pages', pageId);
const proposalPath = resolve(root, 'docs/translations/proposals/page-056-general-information-proposal-2026-10-15-v2.json');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://127.0.0.1:3000';
const expectedSourcePdfSha256 = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), 'Refusing to replace changed artifact: ' + path);
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
  if (!response.ok) throw new Error('Read-only API request failed (' + response.status + '): ' + url);
  return response.json();
}
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sourceText = block => normalize((block.lines ?? []).flatMap(line => (line.spans ?? [])
  .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
  .map(span => span.text ?? '')).join(' '));

const sourcePdfBytes = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdfBytes), expectedSourcePdfSha256, 'Official source PDF changed');

const oldHashes = await readJson(join(v1Dir, 'source-hashes.json'));
const pageFileNames = (await readdir(sourceDir)).sort();
const pageAssets = {};
for (const name of pageFileNames) {
  const bytes = await readFile(join(sourceDir, name));
  assert.equal(sha256(bytes), oldHashes.pageFiles[name], 'Page asset changed since v1: ' + name);
  pageAssets[name] = bytes;
}
const dom = JSON.parse(pageAssets[pageId + '_dom.json'].toString('utf8'));
const sources = {
  block_8: 'General Information',
  block_10: 'Combatant information is printed on cards that contain the rules for all the figures other than Adventurers. There are 2 types of Combatants.',
  block_12: '1. Command Combatants: Players directly control Command Combatants. Usually Command Combatants represent characters that temporarily join the characters on their Adventure.',
  block_13: '2. Intelligent Combatants: These type of Combatants are used to automate figures on the board, meaning, no player chooses their Actions. Instead, these figures will make their own decisions.',
  block_14: 'Regardless of which type of Combatant a player is using, both share much of the same information. Below is the information and rules that both types share.',
};
const blocks = {};
for (const [id, expected] of Object.entries(sources)) {
  const block = dom.blocks.find(item => item.id === id);
  assert.ok(block, 'Missing source block ' + id);
  assert.equal(sourceText(block), normalize(expected), 'Source text changed in ' + id);
  blocks[id] = block;
}

const regular = (text, size = 10, font = 'OptimaLTStd') => ({
  text, font, size, color: '#231f20', weight: 400, style: 'normal',
});
const bold = (text, size = 10, font = 'OptimaLTStd-Bold') => ({
  text, font, size, color: '#231f20', weight: 700, style: 'normal',
});
function candidate(blockId, blockIndex, lineHeight, segments) {
  const block = blocks[blockId];
  const spanKey = 'page_56_block_' + blockIndex + '__pt-BR';
  const text = segments.map(segment => segment.text).join('');
  return {
    blockId,
    blockIndex,
    spanKey,
    sourceText: normalize(sources[blockId]),
    proposalText: text,
    lineHeight,
    candidate: {
      spanKey,
      language: 'pt-BR',
      data: {
        schemaVersion: 2,
        spanKey,
        bbox: block.bbox,
        textAlign: 'left',
        lineHeight,
        lineHeightMode: 'custom',
        segments,
        managedSourceSymbols: [],
      },
    },
  };
}

const candidates = [
  candidate('block_8', 0, 1, [
    regular('Informações Gerais', 12, 'Cinzel-Regular'),
  ]),
  candidate('block_10', 1, 1.1, [
    regular('As cartas trazem informações sobre os Combatentes e regras para todas as miniaturas, exceto as dos Aventureiros. Há '),
    bold('2', 9),
    regular(' tipos de Combatentes.'),
  ]),
  candidate('block_12', 2, 1.2, [
    bold('1. Combatentes de Comando:'),
    regular(' Os jogadores controlam diretamente os Combatentes de Comando. Em geral, eles representam personagens que se juntam temporariamente aos personagens durante a Aventura.'),
  ]),
  candidate('block_13', 3, 1.2, [
    bold('2. Combatentes Inteligentes:'),
    regular(' Esses Combatentes automatizam as miniaturas no tabuleiro: nenhum jogador escolhe as Ações dessas miniaturas; elas tomam as próprias decisões.'),
  ]),
  candidate('block_14', 4, 1.1, [
    regular('Independentemente do tipo de Combatente que o jogador usa, os dois tipos compartilham muitas informações. A seguir estão as informações e regras comuns a ambos.'),
  ]),
];

assert.equal(new Set(candidates.map(item => item.spanKey)).size, candidates.length, 'Duplicate candidate keys');
const payload = await fetchJson('/api/translations', {
  'where[language][equals]': 'pt-BR',
  limit: '5000',
});
const existingPageRecords = (payload.docs ?? [])
  .filter(record => String(record.spanKey ?? '').startsWith('page_56_'))
  .map(record => ({ id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt }))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.deepEqual(existingPageRecords, [], 'A PT-BR record already exists for p.56; preserve it and reassess');

const baseSnapshot = await readJson(join(v1Dir, 'snapshot', 'snapshot-p056-general-information-v1-export.json'));
const snapshot = {
  ...baseSnapshot,
  translations: candidates.map(item => item.candidate),
  page,
  patched: true,
  verifyRenderedSnapshot: true,
};
const copiedAssetHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', pageId);
await mkdir(snapshotPageDir, { recursive: true });
for (const [name, bytes] of Object.entries(pageAssets)) {
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedAssetHashes[name] = sha256(bytes);
}

const proposal = {
  page,
  family: 'General Information — família completa de informação geral e tipos de Combatente',
  status: 'isolated-complete-family-proposal-awaiting-final-copyfit-and-human-editorial-review',
  attempt: 2,
  revisionBudget: 2,
  sourceHashes: {
    sourcePdf: expectedSourcePdfSha256,
    pageFiles: copiedAssetHashes,
    payloadBaseline: existingPageRecords,
  },
  candidateKeysUnique: true,
  candidates: candidates.map(({ blockId, blockIndex, spanKey, lineHeight, sourceText: src, proposalText, candidate: record }) => ({
    blockId, blockIndex, spanKey, sourceText: src, proposalText, lineHeight, candidate: record,
  })),
  familyCompleteness: {
    heading: 'block_8',
    openingParagraph: 'block_10',
    numberedDefinitions: ['block_12', 'block_13'],
    transitionToNextFamily: 'block_14',
    complete: true,
    excludedNextFamily: 'Activation Numbers and Groups (block_15 and following)',
  },
  scopeLimits: [
    'This proposal completes only the General Information editorial family on p.56.',
    'Activation Numbers and Groups, card artwork, Combatant Tags, and all other p.56 families remain in English.',
    'No translation was written to Payload, localStorage, or canonical translation data.',
  ],
  terminologyPendingHumanReview: [
    'Combatant → Combatente, Command Combatant → Combatente de Comando, Intelligent Combatant → Combatente Inteligente, Figure → miniatura, Action → Ação, and Adventure → Aventura remain proposal forms, not new glossary approvals.',
  ],
  richText: {
    headingFontPreserved: true,
    listNumberAndLabelBoldPreserved: true,
    introNumeralTwoBoldAtNinePointsPreserved: true,
    bodyFontFamiliesAndSizesPreserved: true,
    listMarkerSpacingUsesLiteralSpace: true,
    semanticSymbolsInScope: 0,
  },
  copyfit: {
    status: 'awaiting-final-viewer-and-pdf-verification',
    sourceLineCounts: Object.fromEntries(candidates.map(item => [item.blockId, blocks[item.blockId].lines.length])),
    sourceBaselineLineHeights: { block_10: 1.1, block_12: 1.2, block_13: 1.2, block_14: 1.1 },
    evidence: [],
  },
  editorCheck: {
    p56PagePtBrPayloadRecordsBeforeProposal: existingPageRecords.length,
    sourceUnitsPreviouslyOpenedReadOnly: ['page_56_block_2', 'page_56_block_3', 'page_56_block_4'],
    newlyIncludedHeadingAndOpeningParagraphNeedNormalEditorVerification: true,
    noSavePerformed: true,
  },
};

await immutableWrite(join(snapshotDir, 'snapshot-p056-general-information-v2-export.json'), JSON.stringify(snapshot, null, 2) + '\n');
await immutableWrite(join(proofDir, 'proposal-p056-general-information-v2.json'), JSON.stringify(proposal, null, 2) + '\n');
await immutableWrite(proposalPath, JSON.stringify(proposal, null, 2) + '\n');
await immutableWrite(join(proofDir, 'source-hashes.json'), JSON.stringify({
  sourcePdfSha256: expectedSourcePdfSha256,
  pageFiles: copiedAssetHashes,
  payloadPtBrRecords: existingPageRecords,
  reusedV1PageAssets: true,
  candidateKeys: candidates.map(item => item.spanKey),
}, null, 2) + '\n');

console.log(JSON.stringify({
  page,
  family: proposal.family,
  attempt: proposal.attempt + '/' + proposal.revisionBudget,
  candidateKeys: candidates.map(item => item.spanKey),
  sourceUnitCount: candidates.length,
  familyComplete: proposal.familyCompleteness.complete,
  payloadPageRecords: existingPageRecords.length,
  snapshot: join(snapshotDir, 'snapshot-p056-general-information-v2-export.json'),
  proposal: proposalPath,
}, null, 2));
