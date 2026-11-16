#!/usr/bin/env node
/** Prepare and export the isolated p.48 End Actions section proposal. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const sourcePdfPath = resolve(process.env.MIDDARA_SOURCE_PDF_PATH ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const sourcePageDir = resolve(root, 'apps/web/public/pages/page_048');
const pageDomPath = resolve(sourcePageDir, 'page_048_dom.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-048-end-actions-proposal-2026-10-15-v1.json');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p048-end-actions-v1');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_048');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => hash(await readFile(path));
const normalize = value => value.replace(/\s+/gu, ' ').trim();
const expected = {
  sourcePdfSha256: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  pageDomSha256: 'A1B7F2FDF4CB12EF491F49FA1402ED04B10903EDA35E5C9AD48451CAC6E6CD80',
  inlineElementsSha256: 'F2D7539F34756CF30F4779457D7255D451199782C519FC3BD084348A9CE77342',
  pageAssetHashes: {
    'background.webp': '37CD29B785C498D1D6FDF7B2E8A6F1EE7FD245E956C5A7694455F47CE449CDED',
    'fidelity_overlays.json': '236696146EFD34F304016562C4A3CFAB200FC130CF8B2423451000C37B06B70B',
    'fidelity-overlay-component-physical-card-abbadons-subtlety.png': '7B353325A2DCCB7256627359709F87B39A0614AE8CEFE5A8799EA3BEDB28E93E',
    'fidelity-overlay-component-physical-card-false-idol.png': 'D1DE7522699FE7277E93DB64D3D483A66AC8F810374DB8AC1CB450713A07681C',
    'fidelity-overlay-component-physical-card-hammer-helm.png': 'A08BD662B09BE8BB58F74BCA3FA5C17DF258FEDB8814E17CBE1DC954036B8449',
    'fidelity-overlay-component-physical-card-war-axe.png': '2EC8B4AD8E994A6401ACF3A2D601A53E3971C1B56B4918CDA3A9568592CE1419',
    'inline_elements.json': 'F2D7539F34756CF30F4779457D7255D451199782C519FC3BD084348A9CE77342',
    'inline-element-mask-000.png': 'FB31AACDBB526BD5A6846D27B156EAF049302F6147603F91BDFE75F3D83BDF2D',
    'inline-element-mask-001.png': '48E95B0E669B15C0FC1F5725E847F66F07BB86F906D1977CCD17E320D0A88051',
    'inline-element-mask-002.png': 'B0A8E191FA082D669CE25D9F1BBC8BBA1E9FFCBADD66871C482011ECEF47BB8C',
    'layout_frames.json': 'FB2275F7C7D4D383A6A0C37C14CAD1926F193477E87CFEDFCF9CAC77D74CF03D',
    'page_048_dom.json': 'A1B7F2FDF4CB12EF491F49FA1402ED04B10903EDA35E5C9AD48451CAC6E6CD80',
  },
};

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

assert.equal(await hashFile(sourcePdfPath), expected.sourcePdfSha256.toLowerCase(), 'Official source PDF changed.');
assert.equal(await hashFile(pageDomPath), expected.pageDomSha256.toLowerCase(), 'p.48 DOM changed.');
assert.equal(await hashFile(resolve(sourcePageDir, 'inline_elements.json')), expected.inlineElementsSha256.toLowerCase(), 'p.48 inline sidecar changed.');
assert.deepEqual((await readdir(sourcePageDir)).sort(), Object.keys(expected.pageAssetHashes).sort(), 'p.48 asset inventory changed.');
for (const [name, expectedHash] of Object.entries(expected.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(sourcePageDir, name)), expectedHash.toLowerCase(), `p.48 asset changed: ${name}`);
}

const definitions = [
  {
    key: 'page_48_block_0', blockId: 'block_8',
    sourceText: 'Abilities that End Actions and Abilities',
    targetText: 'Habilidades que Encerram Ações e Habilidades',
    lineHeight: 1.1, sourceLineCount: 1, sourceFontSizePt: 12,
    segments: [{ text: 'Habilidades que Encerram Ações e Habilidades', font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true }],
  },
  {
    key: 'page_48_block_1', blockId: 'block_10',
    sourceText: 'When an Ability instructs a figure to “end the current Action and all Abilities”, every other Action and Ability that is currently happening immediately ends. Any Ability, Action, AI Instruction, or Special Rule that would require the current Ability or Action to occur (such as counter), can no longer be used.',
    targetText: 'Quando uma Habilidade instrui uma miniatura a “encerrar a Ação atual e todas as Habilidades”, as demais Ações e Habilidades em andamento terminam imediatamente. Qualquer Habilidade, Ação, Instrução de IA ou Regra Especial que dependa da Habilidade ou Ação atual (como um contra-ataque) não poderá mais ser usada.',
    lineHeight: 1.1, sourceLineCount: 5, sourceFontSizePt: 10,
    segments: [
      { text: 'Quando uma Habilidade instrui uma miniatura a “', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'encerrar a Ação atual e todas as Habilidades', font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true },
      { text: '”, as demais Ações e Habilidades em andamento terminam imediatamente. Qualquer Habilidade, Ação, Instrução de IA ou Regra Especial que dependa da Habilidade ou Ação atual (como um contra-ataque) não poderá mais ser usada.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
  },
  {
    key: 'page_48_block_2', blockId: 'block_11',
    sourceText: 'Then, the figure that ended the current Action and all Abilities follows the proceeding instructions of their Ability, if any.',
    targetText: 'Em seguida, a miniatura que encerrou a Ação atual e todas as Habilidades segue as instruções seguintes da sua Habilidade, se houver.',
    lineHeight: 1.1, sourceLineCount: 2, sourceFontSizePt: 10,
    segments: [
      { text: 'Em seguida, a miniatura que ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'encerrou a Ação atual e todas as Habilidades', font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true },
      { text: ' segue as instruções seguintes da sua Habilidade, se houver.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
  },
];

const pageDom = JSON.parse(await readFile(pageDomPath, 'utf8'));
const units = definitions.map(unit => {
  const index = Number(unit.key.match(/^page_48_block_(\d+)$/u)?.[1]);
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
    sourceEditorialKey: unit.key, spanKey, sourceBlockId: unit.blockId, sourceText: actualSource,
    targetText: unit.targetText, lineHeight: unit.lineHeight, sourceFontSizePt: unit.sourceFontSizePt,
    sourceLineCount: unit.sourceLineCount, segments: unit.segments,
    translation: { spanKey, language: 'pt-BR', data: { schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight, lineHeightMode: 'custom', managedSourceSymbols: [] } },
  };
});
const candidateKeys = units.map(unit => unit.spanKey);
assert.equal(new Set(candidateKeys).size, candidateKeys.length, 'Duplicate candidate keys.');

const translationResponse = await fetch(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=1000', apiUrl));
assert.ok(translationResponse.ok, `Read-only Payload lookup failed: ${translationResponse.status}`);
const translationPayload = await translationResponse.json();
assert.ok((translationPayload.docs ?? []).length >= Number(translationPayload.totalDocs ?? 0), 'Payload lookup is paginated; cannot prove key absence.');
const pageRecords = (translationPayload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_48_'));
assert.deepEqual((translationPayload.docs ?? []).filter(record => candidateKeys.includes(record.spanKey)), [], 'A candidate key already exists in Payload; stop and reconcile.');

const frameResponse = await fetch(new URL('/api/layout-frames?where%5Band%5D%5B0%5D%5BpageNumber%5D%5Bequals%5D=48&limit=1000', apiUrl));
assert.ok(frameResponse.ok, `Read-only layout-frame lookup failed: ${frameResponse.status}`);
const framePayload = await frameResponse.json();
const layoutFrames = (framePayload.docs ?? []).filter(doc => Number(doc.pageNumber) === 48);
const aliasResponse = await fetch(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
assert.ok(aliasResponse.ok, `Read-only symbol-alias lookup failed: ${aliasResponse.status}`);
const aliasPayload = await aliasResponse.json();

const snapshotPayload = { readOnly: true, page: 48, locale: 'pt-BR', candidateKeys, candidateKeysAbsent: true, pageTranslationRecordCount: pageRecords.length, layoutFrameCount: layoutFrames.length, symbolAliasSettingCount: (aliasPayload.docs ?? []).length };
await immutableWrite(resolve(proofDir, 'payload-baseline.json'), `${JSON.stringify(snapshotPayload, null, 2)}\n`);

await mkdir(snapshotDir, { recursive: true });
try { await access(snapshotPageDir); } catch {
  await mkdir(resolve(snapshotDir, 'pages'), { recursive: true });
  await cp(sourcePageDir, snapshotPageDir, { recursive: true, errorOnExist: true });
}
assert.deepEqual((await readdir(snapshotPageDir)).sort(), Object.keys(expected.pageAssetHashes).sort(), 'Snapshot asset inventory mismatch.');
for (const [name, expectedHash] of Object.entries(expected.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(snapshotPageDir, name)), expectedHash.toLowerCase(), `Snapshot asset mismatch: ${name}`);
}

const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '48'], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);
const translations = units.map(unit => unit.translation);
const snapshot = {
  translations, layoutFrames, symbolAliasSettings: aliasPayload.docs ?? [], assetPages: [48], page: 48,
  patched: true, verifyRenderedSnapshot: true, sourcePageBoxes: JSON.parse(boxes.stdout),
};
const keys = translations.map(record => record.spanKey);
assert.equal(new Set(keys).size, keys.length, 'Snapshot contains duplicate span keys.');
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

const proposal = {
  proposalId: 'p048-end-actions-2026-10-15-v1', page: 48, locale: 'pt-BR',
  family: 'section heading + two explanatory paragraphs', status: 'draft-pending-human-editorial-review',
  source: { pdfPath: sourcePdfPath.replaceAll('\\', '/'), pdfSha256: expected.sourcePdfSha256.toLowerCase(), pageDom: 'apps/web/public/pages/page_048/page_048_dom.json', pageDomSha256: expected.pageDomSha256.toLowerCase(), pageInlineElementsSha256: expected.inlineElementsSha256.toLowerCase(), pageAssetHashes: expected.pageAssetHashes },
  payloadBaseline: snapshotPayload,
  units: units.map(({ translation, ...unit }) => unit),
  terminologyReview: {
    status: 'pending-human-review',
    terms: [
      { source: 'counter', draft: 'contra-ataque', reason: 'The source uses lowercase “counter”; no exact approved glossary entry or local decision was found in the reviewed translation sources.' },
      { source: 'AI Instruction / Special Rule', draft: 'Instrução de IA / Regra Especial', reason: 'Mechanic names kept close to source capitalization; terminology should be confirmed before approval.' },
      { source: 'Ability / Action', draft: 'Habilidade / Ação', reason: 'Consistent with nearby proposals, but not separate entries in the official glossary.' },
    ],
  },
  copyfit: { revisionBudget: 3, revision: 0, status: 'rendered-awaiting-visual-review', sourceLineCounts: { page_48_block_0: 1, page_48_block_1: 5, page_48_block_2: 2 }, frameAndFontChanges: false },
  evidence: { proofDirectory: 'output/proofs/translation-readiness-2026-10-15/p048-end-actions-v1', snapshot: 'output/proofs/translation-readiness-2026-10-15/p048-end-actions-v1/snapshot/snapshot.json' },
  note: 'Only these three editable source blocks are proposed. The following block combines a paragraph and the Passive Conditions heading, so it is not included in this simple-unit batch. No canonical data or human translation is written.',
};

const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '48', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', resolve(proofDir, 'page-048-pt-BR-end-actions-proposal.pdf'),
  '--metrics-output', resolve(proofDir, 'metrics.json'), '--viewer-screenshot', resolve(proofDir, 'viewer-pt-BR.png'),
  '--print-screenshot', resolve(proofDir, 'print-pt-BR.png'), '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error(`p.48 isolated PDF export failed with exit ${exportResult.status}.`);
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
console.log(JSON.stringify({ page: 48, candidateKeys, candidateCount: units.length, snapshotPath, proposalPath, proofDir }, null, 2));
