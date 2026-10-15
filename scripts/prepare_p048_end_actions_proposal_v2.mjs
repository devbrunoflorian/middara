#!/usr/bin/env node
/** Revise the p.48 End Actions heading and preserve the v1 copyfit trial. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const v1ProposalPath = resolve(root, 'docs/translations/proposals/page-048-end-actions-proposal-2026-10-15-v1.json');
const v1Proposal = JSON.parse(await readFile(v1ProposalPath, 'utf8'));
const v1ProofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p048-end-actions-v1');
const v1Snapshot = JSON.parse(await readFile(resolve(v1ProofDir, 'snapshot/snapshot.json'), 'utf8'));
const pageDir = resolve(root, 'apps/web/public/pages/page_048');
const pageDomPath = resolve(pageDir, 'page_048_dom.json');
const sourcePdfPath = v1Proposal.source.pdfPath;
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p048-end-actions-v2');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_048');
const proposalPath = resolve(root, 'docs/translations/proposals/page-048-end-actions-proposal-2026-10-15-v2.json');
const comparisonScript = resolve(root, 'scripts/create_p048_end_actions_comparison_v2.py');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => hash(await readFile(path));
const immutableWrite = async (path, value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
};

assert.equal(await hashFile(sourcePdfPath), v1Proposal.source.pdfSha256, 'Source PDF changed since v1.');
assert.equal(await hashFile(pageDomPath), v1Proposal.source.pageDomSha256, 'p.48 DOM changed since v1.');
for (const [name, expectedHash] of Object.entries(v1Proposal.source.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(pageDir, name)), expectedHash.toLowerCase(), `p.48 asset changed: ${name}`);
}

const translations = v1Snapshot.translations.map(record => structuredClone(record));
const title = translations.find(record => record.spanKey === 'page_48_block_0__pt-BR');
assert.ok(title, 'Missing v1 heading candidate.');
title.data.segments = [{ text: 'Encerramento de Ações e Habilidades', font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true }];
const candidateKeys = translations.map(record => record.spanKey);
assert.equal(new Set(candidateKeys).size, candidateKeys.length, 'v2 snapshot contains duplicate keys.');

const payloadResponse = await fetch(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=1000', apiUrl));
assert.ok(payloadResponse.ok, `Read-only Payload lookup failed: ${payloadResponse.status}`);
const payload = await payloadResponse.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload lookup is paginated; cannot prove key absence.');
const conflicts = (payload.docs ?? []).filter(record => candidateKeys.includes(record.spanKey));
assert.deepEqual(conflicts, [], 'A candidate key already exists in Payload; stop and reconcile.');

await mkdir(snapshotDir, { recursive: true });
try { await access(snapshotPageDir); } catch {
  await mkdir(resolve(snapshotDir, 'pages'), { recursive: true });
  await cp(pageDir, snapshotPageDir, { recursive: true, errorOnExist: true });
}
assert.deepEqual((await readdir(snapshotPageDir)).sort(), Object.keys(v1Proposal.source.pageAssetHashes).sort(), 'v2 asset inventory mismatch.');
for (const [name, expectedHash] of Object.entries(v1Proposal.source.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(snapshotPageDir, name)), expectedHash.toLowerCase(), `v2 asset copy mismatch: ${name}`);
}

const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '48'], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);
const snapshot = { ...v1Snapshot, translations, sourcePageBoxes: JSON.parse(boxes.stdout) };
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
const payloadBaseline = { readOnly: true, page: 48, locale: 'pt-BR', candidateKeys, candidateKeysAbsent: true, pageTranslationRecordCount: 0, preservedContextRecordCount: 0 };
await immutableWrite(resolve(proofDir, 'payload-baseline.json'), `${JSON.stringify(payloadBaseline, null, 2)}\n`);

const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '48', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', resolve(proofDir, 'page-048-pt-BR-end-actions-proposal.pdf'),
  '--metrics-output', resolve(proofDir, 'metrics.json'), '--viewer-screenshot', resolve(proofDir, 'viewer-pt-BR.png'),
  '--print-screenshot', resolve(proofDir, 'print-pt-BR.png'), '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error(`p.48 v2 isolated export failed with exit ${exportResult.status}.`);
const comparison = spawnSync('python', [comparisonScript], { cwd: root, stdio: 'inherit' });
if (comparison.status !== 0) throw new Error(`p.48 v2 comparison failed with exit ${comparison.status}.`);
const comparisonManifest = JSON.parse(await readFile(resolve(root, 'docs/project-progress/evidence/2026-10-15-p048-end-actions/visual-comparison.json'), 'utf8'));

const proposal = structuredClone(v1Proposal);
proposal.proposalId = 'p048-end-actions-2026-10-15-v2';
proposal.status = 'draft-pending-human-editorial-review';
proposal.units[0].targetText = 'Encerramento de Ações e Habilidades';
proposal.units[0].segments = translations[0].data.segments;
proposal.copyfit = {
  revisionBudget: 3, revision: 1,
  status: 'technically-fit-verified-in-isolated-viewer-and-pdf',
  sourceLineCounts: { page_48_block_0: 1, page_48_block_1: 5, page_48_block_2: 2 },
  targetLineCounts: { page_48_block_0: 1, page_48_block_1: 5, page_48_block_2: 2 },
  noVisibleCollision: true, frameAndFontChanges: false,
  v1HeadingTrial: 'Rejected for copyfit: the literal heading wrapped to two lines and left inadequate visual separation from the following paragraph; preserved in p048-end-actions-v1.',
};
proposal.evidence = {
  proofDirectory: 'output/proofs/translation-readiness-2026-10-15/p048-end-actions-v2',
  snapshot: 'output/proofs/translation-readiness-2026-10-15/p048-end-actions-v2/snapshot/snapshot.json',
  comparisonManifest: 'docs/project-progress/evidence/2026-10-15-p048-end-actions/visual-comparison.json',
  snapshotSha256: await hashFile(snapshotPath),
  exportPdfSha256: comparisonManifest.exportPdfSha256,
  viewerScreenshotSha256: comparisonManifest.viewerScreenshotSha256,
  comparisonCropSha256: comparisonManifest.comparisonCropSha256,
};
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
console.log(JSON.stringify({ page: 48, candidateKeys, revision: 1, snapshotPath, proposalPath, proofDir }, null, 2));
