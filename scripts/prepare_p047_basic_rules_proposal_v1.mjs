#!/usr/bin/env node
/** Prepare the opening p.47 rules paragraph and heading in an isolated snapshot. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const tipPath = resolve(root, 'docs/translations/proposals/page-047-tip-callout-proposal-2026-10-15-v1.json');
const staminaPath = resolve(root, 'docs/translations/proposals/page-047-stamina-points-proposal-2026-10-15-v1.json');
const tipProposal = JSON.parse(await readFile(tipPath, 'utf8'));
const staminaProposal = JSON.parse(await readFile(staminaPath, 'utf8'));
const sourcePageDir = resolve(root, 'apps/web/public/pages/page_047');
const pageDomPath = resolve(sourcePageDir, 'page_047_dom.json');
const sourcePdfPath = resolve(root, tipProposal.source.pdfPath);
const proposalPath = resolve(root, 'docs/translations/proposals/page-047-basic-rules-proposal-2026-10-15-v1.json');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p047-basic-rules-proposal-v1');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_047');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => hash(await readFile(path));
const normalize = value => value.replace(/\s+/gu, ' ').trim();

async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

const source = {
  pdfSha256: tipProposal.source.pdfSha256,
  pageDomSha256: tipProposal.source.pageDomSha256,
  pageInlineElementsSha256: tipProposal.source.pageInlineElementsSha256,
  pageAssetHashes: tipProposal.source.pageAssetHashes,
};
assert.equal(await hashFile(sourcePdfPath), source.pdfSha256, 'Official source PDF changed.');
assert.equal(await hashFile(pageDomPath), source.pageDomSha256, 'p.47 DOM changed.');
assert.equal(await hashFile(resolve(sourcePageDir, 'inline_elements.json')), source.pageInlineElementsSha256, 'p.47 inline sidecar changed.');
assert.deepEqual((await readdir(sourcePageDir)).sort(), Object.keys(source.pageAssetHashes).sort(), 'p.47 asset inventory changed.');
for (const [name, expectedHash] of Object.entries(source.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(sourcePageDir, name)), expectedHash, `p.47 asset changed: ${name}`);
}

const definitions = [
  {
    key: 'page_47_block_0', blockId: 'block_11',
    sourceText: 'Basic Ability Rules', targetText: 'Regras Básicas de Habilidades',
    lineHeight: 1.1, sourceFontSizePt: 12, sourceLineCount: 1,
    segments: [{ text: 'Regras Básicas de Habilidades', font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true }],
  },
  {
    key: 'page_47_block_1', blockId: 'block_13',
    sourceText: 'An Ability is anything on an Item, Discipline, Adventurer, Combatant, or token that a figure may do. Many cards will have 1 or more Abilities printed on them. Abilities can be used when their Conditions are met. There are 4 types of Conditions.',
    targetText: 'Uma Habilidade é algo que uma miniatura pode fazer, listado em um Item, uma Disciplina, um Aventureiro, um Combatente ou uma ficha. Muitas cartas trazem 1 ou mais Habilidades impressas. Elas podem ser usadas quando suas Condições são atendidas. Há 4 tipos de Condições.',
    lineHeight: 1.1, sourceFontSizePt: 10, sourceLineCount: 4,
    segments: [
      { text: 'Uma Habilidade é algo que uma miniatura pode fazer, listado em um Item, uma Disciplina, um Aventureiro, um Combatente ou uma ficha. Muitas cartas trazem ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: '1', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' ou mais Habilidades impressas. Elas podem ser usadas quando suas Condições são atendidas. Há ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: '4', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' tipos de Condições.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
  },
];
const pageDom = JSON.parse(await readFile(pageDomPath, 'utf8'));
const units = definitions.map(unit => {
  const index = Number(unit.key.match(/^page_47_block_(\d+)$/u)?.[1]);
  assert.ok(Number.isInteger(index), `Invalid editorial key: ${unit.key}`);
  const block = pageDom.blocks[index];
  assert.equal(block?.id, unit.blockId, `Editorial key/block mismatch: ${unit.key}`);
  const actualSource = normalize(block.lines.flatMap(line => line.spans
    .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '')).join(''));
  assert.equal(actualSource, normalize(unit.sourceText), `Source wording changed: ${unit.key}`);
  assert.equal(unit.segments.map(segment => segment.text).join(''), unit.targetText, `Rich segments do not reproduce target: ${unit.key}`);
  const spanKey = `${unit.key}__pt-BR`;
  return {
    sourceEditorialKey: unit.key, spanKey, sourceBlockId: unit.blockId,
    sourceText: actualSource, targetText: unit.targetText, lineHeight: unit.lineHeight,
    sourceFontSizePt: unit.sourceFontSizePt, sourceLineCount: unit.sourceLineCount, segments: unit.segments,
    translation: { spanKey, language: 'pt-BR', data: { schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight, lineHeightMode: 'custom', managedSourceSymbols: [] } },
  };
});

const candidateKeys = units.map(unit => unit.spanKey);
assert.equal(new Set(candidateKeys).size, candidateKeys.length, 'Duplicate candidate keys.');
const payloadResponse = await fetch(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=1000', apiUrl));
assert.ok(payloadResponse.ok, `Read-only Payload lookup failed: ${payloadResponse.status}`);
const payload = await payloadResponse.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload lookup is paginated; cannot prove key absence.');
const existing = (payload.docs ?? []).filter(record => candidateKeys.includes(record.spanKey));
assert.deepEqual(existing, [], 'A candidate key already exists in Payload; stop and reconcile.');
const payloadBaseline = {
  readOnly: true, page: 47, locale: 'pt-BR', candidateKeys, candidateKeysAbsent: true,
  matchingPageRecords: (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_47_')).length,
};

await mkdir(snapshotDir, { recursive: true });
try {
  await access(snapshotPageDir);
} catch {
  await mkdir(resolve(snapshotDir, 'pages'), { recursive: true });
  await cp(sourcePageDir, snapshotPageDir, { recursive: true, errorOnExist: true });
}
for (const [name, expectedHash] of Object.entries(source.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(snapshotPageDir, name)), expectedHash, `Isolated page copy mismatch: ${name}`);
}
const priorContext = [
  ...tipProposal.contextOverrides.map(unit => ({ spanKey: unit.spanKey, language: 'pt-BR', data: { schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight, lineHeightMode: 'custom', managedSourceSymbols: unit.managedSourceSymbols ?? [] } })),
  ...tipProposal.units.map(unit => ({ spanKey: unit.spanKey, language: 'pt-BR', data: { schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight, lineHeightMode: 'custom', managedSourceSymbols: [] } })),
  ...staminaProposal.units.map(unit => ({ spanKey: unit.spanKey, language: 'pt-BR', data: { schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight, lineHeightMode: 'custom', managedSourceSymbols: [] } })),
];
const translations = [...priorContext, ...units.map(unit => unit.translation)];
const allKeys = translations.map(record => record.spanKey);
assert.equal(new Set(allKeys).size, allKeys.length, 'Snapshot contains duplicate span keys.');

const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '47'], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);
const snapshot = { translations, layoutFrames: [], symbolAliasSettings: [], assetPages: [47], page: 47, patched: true, verifyRenderedSnapshot: true, sourcePageBoxes: JSON.parse(boxes.stdout) };
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(resolve(proofDir, 'payload-baseline.json'), `${JSON.stringify(payloadBaseline, null, 2)}\n`);

const proposal = {
  proposalId: 'p047-basic-rules-2026-10-15-v1', page: 47, locale: 'pt-BR',
  family: 'section heading + introductory paragraph', status: 'draft-pending-human-editorial-review',
  source: { pdfPath: tipProposal.source.pdfPath, pdfSha256: source.pdfSha256, pageDom: tipProposal.source.pageDom, pageDomSha256: source.pageDomSha256, pageInlineElementsSha256: source.pageInlineElementsSha256, pageAssetHashes: source.pageAssetHashes },
  payloadBaseline,
  units: units.map(({ translation, ...unit }) => unit),
  terminologyReview: {
    status: 'pending-human-review',
    terms: [
      { source: 'Ability', draft: 'Habilidade', reason: 'Uso consistente com propostas locais nas páginas 30–48; ainda não é uma entrada própria do glossário oficial.' },
      { source: 'Item / Discipline / Adventurer / Combatant', draft: 'Item / Disciplina / Aventureiro / Combatente', reason: 'Capitalização segue o tratamento local dos nomes de componentes; confirmar editorialmente.' },
    ],
  },
  copyfit: {
    revisionBudget: 3,
    revision: 0,
    status: 'technically-fit-verified-in-isolated-viewer-and-pdf',
    sourceLineCounts: { page_47_block_0: 1, page_47_block_1: 4 },
    targetLineCounts: { page_47_block_0: 1, page_47_block_1: 4 },
    noVisibleCollision: true,
    frameAndFontChanges: false,
  },
  evidence: {
    proofDirectory: 'output/proofs/translation-readiness-2026-10-15/p047-basic-rules-proposal-v1',
    snapshot: 'output/proofs/translation-readiness-2026-10-15/p047-basic-rules-proposal-v1/snapshot/snapshot.json',
    snapshotSha256: '3906d99ecf71f5b0f51c2a260f3ef3be8caf5ff07bbb6237a0b15f870c05a454',
    comparisonManifest: 'docs/project-progress/evidence/2026-10-15-p047-basic-rules/visual-comparison.json',
    exportPdfSha256: '91fe60b35e614773c1119b3d504351b3fef8b7118aae3db47d12810047e81f59',
    viewerScreenshotSha256: 'ecac3889da874a972afe24dab962a2fc480fc8de4fdd6e41669dc221ed11e4f4',
    comparisonCropSha256: 'ced2a47807ec0d3c5fc14b682b8eca91271f27b93a8a4bfef446e9a4b057efca',
  },
  note: 'Only the heading and introductory paragraph are new candidates. Previously verified p.47 TIP/IMPORTANT and Stamina Point proposals are included as snapshot context; no canonical data or human translation is written.',
};

const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '47', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', resolve(proofDir, 'page-047-pt-BR-basic-rules-proposal.pdf'),
  '--metrics-output', resolve(proofDir, 'metrics.json'), '--viewer-screenshot', resolve(proofDir, 'viewer-pt-BR.png'),
  '--print-screenshot', resolve(proofDir, 'print-pt-BR.png'), '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error(`p.47 isolated export failed with exit ${exportResult.status}.`);
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
console.log(JSON.stringify({ page: 47, candidateKeys, candidateCount: units.length, contextCount: priorContext.length, snapshotPath, proposalPath, proofDir }, null, 2));
