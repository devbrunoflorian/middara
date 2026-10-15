#!/usr/bin/env node
/** Build and export the isolated p.47 Stamina Points proposal. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const tipProposalPath = resolve(root, 'docs/translations/proposals/page-047-tip-callout-proposal-2026-10-15-v1.json');
const tipProposal = JSON.parse(await readFile(tipProposalPath, 'utf8'));
const proposalPath = resolve(root, 'docs/translations/proposals/page-047-stamina-points-proposal-2026-10-15-v1.json');
const sourcePageDir = resolve(root, 'apps/web/public/pages/page_047');
const pageDomPath = resolve(sourcePageDir, 'page_047_dom.json');
const sourcePdfPath = resolve(root, tipProposal.source.pdfPath);
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p047-stamina-proposal-v1');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_047');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => hash(await readFile(path));
const normalize = value => value.replace(/\s+/gu, ' ').trim();
const immutableWrite = async (path, value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace a changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
};

const source = {
  sourcePdfSha256: tipProposal.source.pdfSha256,
  pageDomSha256: tipProposal.source.pageDomSha256,
  inlineElementsSha256: tipProposal.source.pageInlineElementsSha256,
  pageAssetHashes: tipProposal.source.pageAssetHashes,
};
assert.equal(await hashFile(sourcePdfPath), source.sourcePdfSha256, 'Official PDF changed.');
assert.equal(await hashFile(pageDomPath), source.pageDomSha256, 'p.47 DOM changed.');
assert.equal(await hashFile(resolve(sourcePageDir, 'inline_elements.json')), source.inlineElementsSha256, 'p.47 inline sidecar changed.');
assert.deepEqual((await readdir(sourcePageDir)).sort(), Object.keys(source.pageAssetHashes).sort(), 'p.47 asset inventory changed.');
for (const [name, expectedHash] of Object.entries(source.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(sourcePageDir, name)), expectedHash, `p.47 asset changed: ${name}`);
}

const pageDom = JSON.parse(await readFile(pageDomPath, 'utf8'));
const definitions = [
  {
    key: 'page_47_block_10',
    blockId: 'block_23',
    sourceText: 'Stamina Points on Abilities',
    targetText: 'Pontos de Vigor em Habilidades',
    lineHeight: 1.1,
    sourceFontSizePt: 12,
    sourceLineCount: 1,
    segments: [
      { text: 'Pontos de Vigor em Habilidades', font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
    ],
  },
  {
    key: 'page_47_block_11',
    blockId: 'block_25',
    sourceText: "Some Abilities have an SP Cost as a Condition. This is especially true of many Disciplines. These Disciplines can be used for the listed (SP) Cost. If the Discipline doesn't have other Conditions barring it from being used more than once, then an Adventurer may use the Discipline's Ability as many times as they have the SP to spend for it.",
    targetText: 'Algumas Habilidades têm um custo em SP como Condição, algo comum em muitas Disciplinas. Para usá-las, paga-se o custo em SP indicado. Se a Disciplina não tiver outras Condições que impeçam seu uso mais de uma vez, um Aventureiro pode usar a Habilidade da Disciplina tantas vezes quantas puder pagar com SP.',
    lineHeight: 1.1,
    sourceFontSizePt: 10,
    sourceLineCount: 5,
    segments: [
      { text: 'Algumas Habilidades têm um custo em ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'SP', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' como Condição, algo comum em muitas Disciplinas. Para usá-las, paga-se o custo em ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'SP', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' indicado. Se a Disciplina não tiver outras Condições que impeçam seu uso mais de uma vez, um Aventureiro pode usar a Habilidade da Disciplina tantas vezes quantas puder pagar com ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'SP', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: '.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
  },
];

const translationFromUnit = unit => {
  const index = Number(unit.key.match(/^page_47_block_(\d+)$/u)?.[1]);
  assert.ok(Number.isInteger(index), `Bad editorial key: ${unit.key}`);
  const block = pageDom.blocks[index];
  assert.equal(block?.id, unit.blockId, `Editorial key/block ID mismatch: ${unit.key}`);
  const actualSource = normalize(block.lines.flatMap(line => line.spans
    .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '')).join(''));
  assert.equal(actualSource, normalize(unit.sourceText), `Source wording changed: ${unit.key}`);
  assert.equal(unit.segments.map(segment => segment.text).join(''), unit.targetText, `Rich segments differ from target: ${unit.key}`);
  const spanKey = `${unit.key}__pt-BR`;
  return {
    sourceEditorialKey: unit.key,
    spanKey,
    sourceBlockId: unit.blockId,
    sourceText: actualSource,
    targetText: unit.targetText,
    lineHeight: unit.lineHeight,
    sourceFontSizePt: unit.sourceFontSizePt,
    sourceLineCount: unit.sourceLineCount,
    segments: unit.segments,
    translation: {
      spanKey,
      language: 'pt-BR',
      data: { schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight, lineHeightMode: 'custom', managedSourceSymbols: [] },
    },
  };
};

const units = definitions.map(translationFromUnit);
const candidateKeys = units.map(unit => unit.spanKey);
assert.equal(new Set(candidateKeys).size, candidateKeys.length, 'Duplicate candidate keys.');

const payloadResponse = await fetch(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=1000', apiUrl));
assert.ok(payloadResponse.ok, `Read-only Payload translation lookup failed: ${payloadResponse.status}`);
const payload = await payloadResponse.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload page is incomplete; refusing to infer key absence.');
const pageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_47_'));
const conflicts = (payload.docs ?? []).filter(record => candidateKeys.includes(record.spanKey));
assert.deepEqual(conflicts, [], 'A candidate key already exists in Payload; preserve and reconcile before preparing this draft.');
const existingPayloadRecords = pageRecords.map(record => ({
  id: record.id,
  spanKey: record.spanKey,
  updatedAt: record.updatedAt,
  sha256: hash(Buffer.from(JSON.stringify(record))),
}));

await mkdir(snapshotDir, { recursive: true });
try {
  await access(snapshotPageDir);
} catch {
  await mkdir(resolve(snapshotDir, 'pages'), { recursive: true });
  await cp(sourcePageDir, snapshotPageDir, { recursive: true, errorOnExist: true });
}
assert.deepEqual((await readdir(snapshotPageDir)).sort(), Object.keys(source.pageAssetHashes).sort(), 'Isolated asset inventory mismatch.');
for (const [name, expectedHash] of Object.entries(source.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(snapshotPageDir, name)), expectedHash, `Isolated copy mismatch: ${name}`);
}

const contextTranslations = [
  ...tipProposal.contextOverrides.map(unit => ({
    spanKey: unit.spanKey,
    language: 'pt-BR',
    data: { schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight, lineHeightMode: 'custom', managedSourceSymbols: unit.managedSourceSymbols ?? [] },
  })),
  ...tipProposal.units.map(unit => ({
    spanKey: unit.spanKey,
    language: 'pt-BR',
    data: { schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight, lineHeightMode: 'custom', managedSourceSymbols: [] },
  })),
];
const translations = [...contextTranslations, ...units.map(unit => unit.translation)];
const allKeys = translations.map(record => record.spanKey);
assert.equal(new Set(allKeys).size, allKeys.length, 'Snapshot contains duplicate span keys.');

const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '47'], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);
const snapshot = { translations, layoutFrames: [], symbolAliasSettings: [], assetPages: [47], page: 47, patched: true, verifyRenderedSnapshot: true, sourcePageBoxes: JSON.parse(boxes.stdout) };
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(resolve(proofDir, 'payload-baseline.json'), `${JSON.stringify({ readOnly: true, page: 47, locale: 'pt-BR', records: existingPayloadRecords, candidateKeys, candidateKeysAbsent: true }, null, 2)}\n`);

const proposal = {
  proposalId: 'p047-stamina-points-2026-10-15-v1', page: 47, locale: 'pt-BR',
  family: 'section heading + explanatory paragraph', status: 'draft-pending-human-editorial-review',
  source: { pdfPath: tipProposal.source.pdfPath, pdfSha256: source.sourcePdfSha256, pageDom: tipProposal.source.pageDom, pageDomSha256: source.pageDomSha256, pageInlineElementsSha256: source.inlineElementsSha256, pageAssetHashes: source.pageAssetHashes },
  payloadBaseline: { candidateKeysAbsent: true, pageRecordCount: existingPayloadRecords.length, readOnlyReceipt: 'output/proofs/translation-readiness-2026-10-15/p047-stamina-proposal-v1/payload-baseline.json' },
  units: units.map(({ translation, ...unit }) => unit),
  terminologyReview: {
    status: 'pending-human-review',
    terms: [
      { source: 'Stamina Point(s)', draft: 'Ponto(s) de Vigor', reason: 'Escolha consistente com propostas locais nas páginas 33, 35 e 38; ainda não é entrada aprovada do glossário oficial.' },
      { source: 'Ability / Condition / Discipline', draft: 'Habilidade / Condição / Disciplina', reason: 'Conceitos mantidos em maiúscula conforme a prática observada nas propostas; confirmar consistência editorial humana.' },
    ],
  },
  copyfit: {
    revisionBudget: 3,
    revision: 0,
    status: 'technically-fit-verified-in-isolated-viewer-and-pdf',
    sourceLineCounts: { page_47_block_10: 1, page_47_block_11: 5 },
    targetLineCounts: { page_47_block_10: 1, page_47_block_11: 5 },
    noVisibleCollision: true,
    frameAndFontChanges: false,
  },
  evidence: {
    proofDirectory: 'output/proofs/translation-readiness-2026-10-15/p047-stamina-proposal-v1',
    snapshot: 'output/proofs/translation-readiness-2026-10-15/p047-stamina-proposal-v1/snapshot/snapshot.json',
    snapshotSha256: '69449e7b05025678b244c0bb7d44085b8a19e9472f904d92253c7e2e285cedaa',
    comparisonManifest: 'docs/project-progress/evidence/2026-10-15-p047-stamina/visual-comparison.json',
    exportPdfSha256: '94f44d3f6696eaeaf26671b156bb8039acc46209b2ebf7a8cb5dd794d181e1cc',
    viewerScreenshotSha256: 'cdc10aacd009327d874a537b7bb227f451ba7891a378b131355b9e71cb7be8ce',
    comparisonCropSha256: 'b7ba0a997a7373af6d75882b63849a07eea14732aafc9e4f16b710d860b10f15',
  },
  note: 'Isolated proposal only. The three p.47 TIP/IMPORTANT records are included as previously verified visual context; this work does not replace them, write Payload, or alter canonical page data.',
};

const exported = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '47', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', resolve(proofDir, 'page-047-pt-BR-stamina-proposal.pdf'),
  '--metrics-output', resolve(proofDir, 'metrics.json'), '--viewer-screenshot', resolve(proofDir, 'viewer-pt-BR.png'),
  '--print-screenshot', resolve(proofDir, 'print-pt-BR.png'), '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exported.status !== 0) throw new Error(`One-page p.47 export failed with exit ${exported.status}.`);
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);

console.log(JSON.stringify({ page: 47, candidateKeys, candidateCount: units.length, contextCount: contextTranslations.length, payloadPageRecords: existingPayloadRecords.length, snapshotPath, proposalPath, proofDir }, null, 2));
