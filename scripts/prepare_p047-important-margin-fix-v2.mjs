#!/usr/bin/env node
/** Build an isolated copyfit proof for the p.47 IMPORTANT second bullet. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const pageDir = resolve(root, 'apps/web/public/pages/page_047');
const proposalPath = resolve(root, 'docs/translations/proposals/page-047-important-margin-fix-2026-10-15-v2.json');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p047-important-margin-fix-v2');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_047');
const sourcePdfPath = resolve(root, '../Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const sourcePage = JSON.parse(await readFile(resolve(pageDir, 'page_047_dom.json'), 'utf8'));
const v4Proposal = JSON.parse(await readFile(resolve(root, 'docs/translations/proposals/page-047-condition-definitions-example-2026-10-15-v4.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => hash(await readFile(path));
const immutableWrite = async (path, value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
};

const sourceHashes = {
  pdf: v4Proposal.source.pdfSha256,
  dom: v4Proposal.source.pageDomSha256,
  assets: v4Proposal.source.pageAssetHashes,
};
assert.equal(await hashFile(sourcePdfPath), sourceHashes.pdf, 'Official source PDF changed.');
assert.equal(await hashFile(resolve(pageDir, 'page_047_dom.json')), sourceHashes.dom, 'Canonical p.47 DOM changed.');
assert.deepEqual((await readdir(pageDir)).sort(), Object.keys(sourceHashes.assets).sort(), 'Canonical p.47 asset inventory changed.');
for (const [name, expectedHash] of Object.entries(sourceHashes.assets)) {
  assert.equal(await hashFile(resolve(pageDir, name)), expectedHash, `Canonical p.47 asset changed: ${name}`);
}

const spanKey = 'page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR';
const recordUrl = new URL('/api/translations', apiUrl);
recordUrl.searchParams.set('where[language][equals]', 'pt-BR');
recordUrl.searchParams.set('where[spanKey][equals]', spanKey);
recordUrl.searchParams.set('limit', '10');
const payloadResponse = await fetch(recordUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(payloadResponse.ok, `Read-only Payload lookup failed: ${payloadResponse.status}`);
const payload = await payloadResponse.json();
assert.equal(payload.docs?.length, 1, 'Expected exactly one saved PT-BR record for the target unit.');
assert.ok(payload.docs.length >= Number(payload.totalDocs ?? 0), 'Target lookup is paginated; cannot prove record count.');
const existingRecord = payload.docs[0];
const existingText = (existingRecord.data?.segments ?? []).map(segment => segment.text ?? '').join('');
assert.equal(existingText.trim(), 'Unless otherwise stated, there is no limit to how many times Abilities \nthat require Symbols can be used, so long as the figure has the Symbols\nto spend.', 'Persisted p.47 record changed; stop before producing a comparison.');

const targetText = 'Salvo indicação em contrário, não há limite de usos para Habilidades\nque exigem Símbolos, desde que a figura tenha Símbolos para gastar.';
const translation = {
  spanKey,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    segments: [{
      text: targetText, font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400,
      style: 'normal', disableLigatures: true,
    }],
    textAlign: 'left', lineHeight: 1, lineHeightMode: 'source', managedSourceSymbols: [],
  },
};
assert.equal(translation.data.segments.map(segment => segment.text).join(''), targetText);
assert.equal(new Set([translation.spanKey]).size, 1, 'Duplicate target span key.');

await mkdir(dirname(snapshotPageDir), { recursive: true });
try {
  await readdir(snapshotPageDir);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  await cp(pageDir, snapshotPageDir, { recursive: true, errorOnExist: true });
}
assert.deepEqual((await readdir(snapshotPageDir)).sort(), (await readdir(pageDir)).sort(), 'Isolated p.47 snapshot asset inventory changed.');
for (const [name, expectedHash] of Object.entries(sourceHashes.assets)) {
  assert.equal(await hashFile(resolve(snapshotPageDir, name)), expectedHash, `Isolated p.47 asset copy mismatch: ${name}`);
}
const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '47'], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);

const snapshot = {
  translations: [translation], layoutFrames: [], symbolAliasSettings: [], assetPages: [47], page: 47,
  patched: true, verifyRenderedSnapshot: true, sourcePageBoxes: JSON.parse(boxes.stdout),
};
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
const payloadBaseline = {
  readOnly: true, page: 47, locale: 'pt-BR', spanKey,
  existingRecordId: existingRecord.id, updatedAt: existingRecord.updatedAt,
  persistedText: existingText, persistedTextSha256: hash(Buffer.from(existingText)),
  snapshotOverridesExistingRecord: true, payloadWritten: false,
};
await immutableWrite(resolve(proofDir, 'payload-baseline.json'), `${JSON.stringify(payloadBaseline, null, 2)}\n`);

const outputs = {
  pdf: resolve(proofDir, 'page-047-pt-BR-important-margin-fix-v2.pdf'),
  viewer: resolve(proofDir, 'viewer-pt-BR.png'),
  print: resolve(proofDir, 'print-pt-BR.png'),
  metrics: resolve(proofDir, 'metrics.json'),
};
const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '47', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', outputs.pdf, '--metrics-output', outputs.metrics,
  '--viewer-screenshot', outputs.viewer, '--print-screenshot', outputs.print,
  '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error(`p.47 isolated copyfit export failed with exit ${exportResult.status}.`);

const layoutResult = spawnSync('python', [
  resolve(root, 'scripts/verify_p047_important_margin_copyfit.py'), outputs.pdf, '404.4532165527',
], { encoding: 'utf8' });
if (layoutResult.status !== 0) throw new Error(`p.47 exported PDF geometry failed: ${layoutResult.stderr || layoutResult.stdout}`);
const pdfTextLayout = JSON.parse(layoutResult.stdout.trim());
const pdfTextLayoutPath = resolve(proofDir, 'pdf-text-layout.json');
await immutableWrite(pdfTextLayoutPath, `${JSON.stringify(pdfTextLayout, null, 2)}\n`);

const proposal = {
  proposalId: 'p047-important-margin-fix-2026-10-15-v2', page: 47, locale: 'pt-BR',
  family: 'IMPORTANT ABILITY RULES — second bullet', status: 'isolated-two-line-copyfit-pending-human-review',
  source: { pdfSha256: sourceHashes.pdf, pageDomSha256: sourceHashes.dom, pageAssetHashes: sourceHashes.assets },
  sourceText: 'Unless otherwise stated, there is no limit to how many times Abilities that require Symbols can be used, so long as the figure has the Symbols to spend.',
  targetText, translation, payloadBaseline,
  copyfit: {
    sourceLineCount: 3, targetLineCount: pdfTextLayout.targetLineCount, frameWidthPt: 318.28, fontSizePt: 10,
    lineHeightMode: 'source', frameAndFontChanges: false,
    status: 'two-line-fit-and-pdf-frame-clearance-verified-pending-human-editorial-review',
    frameRightPt: pdfTextLayout.frameRightPt, lineRightClearancePt: pdfTextLayout.rightClearancePt,
    noVisibleOverflow: pdfTextLayout.verified,
  },
  evidence: {
    proofDirectory: 'output/proofs/translation-readiness-2026-10-15/p047-important-margin-fix-v2',
    snapshot: 'output/proofs/translation-readiness-2026-10-15/p047-important-margin-fix-v2/snapshot/snapshot.json',
    snapshotSha256: await hashFile(snapshotPath),
    pdf: 'output/proofs/translation-readiness-2026-10-15/p047-important-margin-fix-v2/page-047-pt-BR-important-margin-fix-v2.pdf',
    pdfSha256: await hashFile(outputs.pdf),
    viewerScreenshot: 'output/proofs/translation-readiness-2026-10-15/p047-important-margin-fix-v2/viewer-pt-BR.png',
    viewerScreenshotSha256: await hashFile(outputs.viewer),
    printScreenshot: 'output/proofs/translation-readiness-2026-10-15/p047-important-margin-fix-v2/print-pt-BR.png',
    metrics: 'output/proofs/translation-readiness-2026-10-15/p047-important-margin-fix-v2/metrics.json',
    pdfTextLayout: 'output/proofs/translation-readiness-2026-10-15/p047-important-margin-fix-v2/pdf-text-layout.json',
    pdfTextLayoutSha256: await hashFile(pdfTextLayoutPath),
    verifiedSnapshotTranslationCount: 1,
    exportProcessExitCode: exportResult.status,
  },
  integrity: { payloadWritten: false, canonicalSidecarsChanged: false, sourcePdfChanged: false, humanTranslationOverwritten: false },
  terminology: { status: 'pending-human-review', terms: ['Habilidade', 'Símbolos', 'figura'] },
  note: 'Explicit line breaks are required for this translated typographic unit; the isolated exporter does not auto-wrap the whole paragraph into its three source lines. Two target lines were measured inside the source frame in the exported PDF. This proposal replaces only the existing English PT-BR record in a snapshot. It does not alter Payload or approve the rest of p.47.',
};
const proposalBytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`);
try {
  assert.ok(proposalBytes.equals(await readFile(proposalPath)), 'Refusing to replace a proposal that changed outside this generator.');
} catch (error) {
  if (error?.code !== 'ENOENT') {
    const priorProposal = JSON.parse(await readFile(proposalPath, 'utf8'));
    assert.equal(priorProposal.proposalId, proposal.proposalId, 'Unexpected proposal id while recording visual review.');
    assert.ok([
      'official-viewer-and-pdf-export-generated-with-explicit-two-line-breaks-pending-visual-review',
      'two-line-fit-and-pdf-frame-clearance-verified-pending-human-editorial-review',
    ].includes(priorProposal.copyfit?.status), 'Proposal was edited after generation; refusing to replace it.');
    assert.equal(priorProposal.targetText, targetText, 'Proposal target text changed; refusing to replace it.');
    assert.deepEqual(priorProposal.translation, translation, 'Proposal translation changed; refusing to replace it.');
    assert.equal(priorProposal.source?.pdfSha256, sourceHashes.pdf, 'Proposal source changed; refusing to replace it.');
    assert.equal(priorProposal.evidence?.snapshotSha256, proposal.evidence.snapshotSha256, 'Proposal snapshot changed; refusing to replace it.');
    assert.equal(priorProposal.payloadBaseline?.persistedTextSha256, payloadBaseline.persistedTextSha256, 'Payload baseline changed; refusing to replace it.');
    await writeFile(proposalPath, proposalBytes);
  } else {
    await writeFile(proposalPath, proposalBytes, { flag: 'wx' });
  }
}
console.log(JSON.stringify({
  page: 47, spanKey, targetText, targetCharacters: [...targetText.replaceAll('\n', ' ')].length,
  persistedEnglishRecord: payloadBaseline.existingRecordId, snapshotPath, proposalPath, proofDir,
  pdfSha256: proposal.evidence.pdfSha256, viewerScreenshotSha256: proposal.evidence.viewerScreenshotSha256,
}, null, 2));
