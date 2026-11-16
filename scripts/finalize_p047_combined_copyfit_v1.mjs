#!/usr/bin/env node
/** Finalize the already-exported p.47 focused proof without rerunning export or writing Payload. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1';
const proofDir = resolve(root, proofRel);
const pdfRel = `${proofRel}/page-047-important-term-combined-v1.pdf`;
const snapshotRel = `${proofRel}/snapshot/snapshot.json`;
const viewerRel = `${proofRel}/viewer-pt-BR-v1.png`;
const printRel = `${proofRel}/print-pt-BR-v1.png`;
const rasterRel = `${proofRel}/pdf-raster-v1.png`;
const v6Path = resolve(root, 'docs/translations/proposals/page-047-condition-definitions-example-2026-10-16-v6.json');
const marginPath = resolve(root, 'docs/translations/proposals/page-047-important-margin-fix-2026-10-15-v2.json');
const combinedProposalRel = 'docs/translations/proposals/page-047-important-term-combined-2026-10-16-v1.json';
const combinedProposalPath = resolve(root, combinedProposalRel);
const receiptRel = `${proofRel}/finalization-v1.json`;
const receiptPath = resolve(root, receiptRel);
const marginGeometryRel = `${proofRel}/important-bullet-layout-v1.json`;
const marginGeometryPath = resolve(root, marginGeometryRel);
const exampleGeometryRel = `${proofRel}/example-layout-v1.json`;
const exampleGeometryPath = resolve(root, exampleGeometryRel);
const marginKey = 'page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR';
const sourceDir = resolve(root, 'apps/web/public/pages/page_047');
const sourcePdfPath = resolve(root, '../Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const systemPython = process.env.MIDDARA_PYTHON_SYSTEM ?? 'python';
const pdfPlumberPython = process.env.MIDDARA_PYTHON_PDFPLUMBER ?? 'C:/Users/bruno/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fileSha = async path => sha(await readFile(path));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeOnce = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  try {
    const prior = await readFile(path);
    assert.ok(prior.equals(Buffer.from(value)), `Refusing to replace a changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(path, value, { flag: 'wx' });
  }
};
const runJson = (exe, args, description) => {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${description} failed (${result.status}): ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
};
const getSavedRecord = async () => {
  const url = new URL('/api/translations', apiUrl);
  url.searchParams.set('where[language][equals]', 'pt-BR');
  url.searchParams.set('where[spanKey][equals]', marginKey);
  url.searchParams.set('limit', '10');
  const response = await fetch(url);
  assert.equal(response.status, 200, `Read-only Payload GET failed: ${response.status}`);
  const body = await response.json();
  assert.equal(body.docs?.length, 1, `Expected exactly one saved record for ${marginKey}.`);
  assert.equal(body.docs[0].id, 327);
  return body.docs[0];
};
const priorReceipt = await readJson(receiptPath).catch(error => {
  if (error?.code === 'ENOENT') return null;
  throw error;
});

const [v6, margin, snapshot] = await Promise.all([
  readJson(v6Path),
  readJson(marginPath),
  readJson(resolve(root, snapshotRel)),
]);
assert.equal(v6.page, 47);
assert.equal(margin.page, 47);
assert.equal(v6.source.pdfSha256.toLowerCase(), margin.source.pdfSha256.toLowerCase());
assert.equal(v6.source.pageDomSha256.toLowerCase(), margin.source.pageDomSha256.toLowerCase());
assert.equal((await fileSha(sourcePdfPath)).toLowerCase(), v6.source.pdfSha256.toLowerCase());
assert.equal((await fileSha(resolve(sourceDir, 'page_047_dom.json'))).toLowerCase(), v6.source.pageDomSha256.toLowerCase());
for (const [name, expected] of Object.entries(v6.source.pageAssetHashes)) {
  assert.equal((await fileSha(resolve(sourceDir, name))).toLowerCase(), expected.toLowerCase(), `Canonical page asset changed: ${name}`);
}

const v6Snapshot = await readJson(resolve(root, v6.evidence.snapshot));
const v6SnapshotHash = await fileSha(resolve(root, v6.evidence.snapshot));
assert.equal(v6SnapshotHash.toLowerCase(), v6.evidence.snapshotSha256.toLowerCase());
assert.equal(v6Snapshot.translations.some(record => record.spanKey === marginKey), false);
assert.equal(snapshot.translations.length, v6Snapshot.translations.length + 1);
assert.equal(new Set(snapshot.translations.map(record => record.spanKey)).size, snapshot.translations.length);
assert.deepEqual(
  snapshot.translations.filter(record => record.spanKey !== marginKey),
  v6Snapshot.translations,
  'Combined proof changed a pre-existing v6 translation.'
);
const savedOverride = snapshot.translations.find(record => record.spanKey === marginKey);
assert.deepEqual(savedOverride, margin.translation, 'Combined PDF does not contain the intended PT-BR override.');
const example = snapshot.translations.find(record => record.spanKey === 'page_47_block_19__pt-BR');
assert.ok(example?.data?.segments?.some(segment => segment.text.includes('EXAUSTAR') && segment.text.includes('exauste esta Disciplina')));

const pdfPath = resolve(root, pdfRel);
const rasterPath = resolve(root, rasterRel);
const pdfProbe = spawnSync(systemPython, ['-c', 'import pymupdf,sys; d=pymupdf.open(sys.argv[1]); assert len(d)==1; p=d[0]; print(p.rect.width,p.rect.height)', pdfPath], { cwd: root, encoding: 'utf8' });
assert.equal(pdfProbe.status, 0, `PDF probe failed: ${pdfProbe.stderr || pdfProbe.stdout}`);
const [width, height] = pdfProbe.stdout.trim().split(/\s+/).map(Number);
assert.ok(width > 0 && height > 0);
const rasterExists = await access(rasterPath).then(() => true, () => false);
if (!rasterExists) {
  const raster = spawnSync(systemPython, ['-c', 'import pymupdf,sys; d=pymupdf.open(sys.argv[1]); assert len(d)==1; p=d[0].get_pixmap(matrix=pymupdf.Matrix(1.57,1.57),alpha=False); p.save(sys.argv[2]); print(p.width,p.height)', pdfPath, rasterPath], { cwd: root, encoding: 'utf8' });
  assert.equal(raster.status, 0, `PDF raster failed: ${raster.stderr || raster.stdout}`);
}
for (const rel of [pdfRel, snapshotRel, viewerRel, printRel, rasterRel]) await access(resolve(root, rel));

const marginLayout = runJson(systemPython, [
  resolve(root, 'scripts/verify_p047_important_margin_copyfit.py'),
  pdfPath,
  '404.4532165527',
], 'IMPORTANT bullet PDF geometry verification');
assert.equal(marginLayout.verified, true);
assert.deepEqual(marginLayout.rightClearancePt, [11.282, 13.371]);

const exampleLayout = runJson(pdfPlumberPython, [
  resolve(root, 'scripts/verify_p047_condition4_copyfit_v6.py'),
  pdfPath,
  resolve(root, snapshotRel),
], 'Condition 4 PDF geometry verification');
assert.equal(exampleLayout.targetTextPresent, true);
assert.equal(exampleLayout.withinMeasurementTolerance, true);

const payloadBefore = await getSavedRecord();
const expectedPersistedText = margin.payloadBaseline.persistedText;
assert.equal(payloadBefore.updatedAt, margin.payloadBaseline.updatedAt);
assert.equal(payloadBefore.data.segments.map(segment => segment.text).join(''), expectedPersistedText);
assert.equal(sha(Buffer.from(expectedPersistedText)), margin.payloadBaseline.persistedTextSha256);

const pdfHash = await fileSha(pdfPath);
const snapshotHash = await fileSha(resolve(root, snapshotRel));
const viewerHash = await fileSha(resolve(root, viewerRel));
const printHash = await fileSha(resolve(root, printRel));
const rasterHash = await fileSha(rasterPath);
const persistedTextSha256 = sha(Buffer.from(expectedPersistedText));
const payloadAfter = await getSavedRecord();
assert.deepEqual(payloadAfter, payloadBefore, 'Saved Payload record changed during read-only finalization.');

const combinedUnit = {
  sourceEditorialKey: marginKey,
  spanKey: marginKey,
  sourceBlockId: 'block_20',
  sourceText: margin.sourceText,
  targetText: margin.targetText,
  sourceLineCount: margin.copyfit.sourceLineCount,
  targetLineCount: marginLayout.targetLineCount,
  segments: margin.translation.data.segments,
  copyfit: margin.copyfit,
  terminology: margin.terminology,
};
const proposal = {
  proposalId: 'p047-important-term-combined-2026-10-16-v1',
  page: 47,
  locale: 'pt-BR',
  status: 'focused-isolated-proposal-human-review-pending-full-page-review-pending',
  units: [...v6.units, combinedUnit],
  source: v6.source,
  baseProposals: [v6.proposalId, margin.proposalId],
  payloadBaseline: {
    readOnly: true,
    existingRecordId: payloadBefore.id,
    spanKey: marginKey,
    updatedAt: payloadBefore.updatedAt,
    persistedTextSha256,
    unchangedAfterExportAndFinalization: true,
    payloadWrites: 0,
  },
  copyfit: {
    importantBullet: {
      status: 'two-line-fit-with-positive-source-frame-clearance',
      targetLineCount: marginLayout.targetLineCount,
      rightClearancePt: marginLayout.rightClearancePt,
      frameAndFontChanges: false,
    },
    example: {
      status: 'visual-pass-within-0.05-pt-pdf-measurement-tolerance',
      rightClearancePt: exampleLayout.rightClearancePt,
      measurementTolerancePt: exampleLayout.measurementTolerancePt,
      frameAndFontChanges: false,
    },
    otherUnits: 'Inherited v6 proposal results; not promoted beyond their scoped evidence.',
  },
  evidence: {
    proofDirectory: proofRel,
    snapshot: snapshotRel,
    snapshotSha256: snapshotHash,
    pdf: pdfRel,
    pdfSha256: pdfHash,
    pageCount: 1,
    pageSizePt: [width, height],
    officialExportExitCode: 0,
    verifiedTranslationRecords: snapshot.translations.length,
    pdfVerification: true,
    viewerScreenshot: viewerRel,
    viewerScreenshotSha256: viewerHash,
    printScreenshot: printRel,
    printScreenshotSha256: printHash,
    pdfRaster: rasterRel,
    pdfRasterSha256: rasterHash,
    importantGeometry: marginGeometryRel,
    exampleGeometry: exampleGeometryRel,
    finalizationReceipt: receiptRel,
  },
  integrity: {
    payloadWritten: false,
    existingUserRecordUnchanged: true,
    canonicalSidecarsChanged: false,
    sourcePdfChanged: false,
    humanTranslationOverwritten: false,
  },
  note: 'Focused isolated proof for the p.47 IMPORTANT bullet crossing the blue frame and the user-approved exaustar terminology in the example. This does not certify the whole page: other English blocks and hardprinted artwork remain open. The saved Payload record remains an English override and was not changed.',
};

const receipt = {
  status: 'focused-p047-proof-finalized',
  generatedAt: priorReceipt?.generatedAt ?? new Date().toISOString(),
  exportRegenerated: false,
  sourceHashesMatched: true,
  combinedSnapshotTranslationCount: snapshot.translations.length,
  combinedSnapshotUniqueSpanKeys: new Set(snapshot.translations.map(record => record.spanKey)).size,
  intendedOverridePresent: true,
  oldEnglishOverrideFallbackPresent: marginLayout.sourceEnglishFallbackPresent,
  importantBullet: {
    verified: marginLayout.verified,
    targetLineCount: marginLayout.targetLineCount,
    frameRightPt: marginLayout.frameRightPt,
    rightClearancePt: marginLayout.rightClearancePt,
  },
  example: {
    targetTextPresent: exampleLayout.targetTextPresent,
    rightClearancePt: exampleLayout.rightClearancePt,
    measurementTolerancePt: exampleLayout.measurementTolerancePt,
    withinMeasurementTolerance: exampleLayout.withinMeasurementTolerance,
  },
  pdf: { sha256: pdfHash, pageCount: 1, pageSizePt: [width, height], rasterSha256: rasterHash },
  payload: {
    readOnlyGets: 2,
    writes: 0,
    recordId: payloadBefore.id,
    updatedAt: payloadBefore.updatedAt,
    persistedTextLanguage: 'English text stored under pt-BR locale',
    persistedTextSha256,
    unchanged: true,
  },
  viewerAndPrintScreenshots: { viewerSha256: viewerHash, printSha256: printHash },
  scope: 'Focused candidate proof only; human review and full page review remain pending.',
};

await writeOnce(marginGeometryPath, `${JSON.stringify(marginLayout, null, 2)}\n`);
await writeOnce(exampleGeometryPath, `${JSON.stringify(exampleLayout, null, 2)}\n`);
await writeOnce(combinedProposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
await writeOnce(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ combinedProposalPath, receiptPath, pdfRel, pdfHash, importantRightClearancesPt: marginLayout.rightClearancePt, exampleRightClearancePt: exampleLayout.rightClearancePt, savedRecordId: payloadBefore.id, savedRecordUnchanged: true, payloadWrites: 0 }, null, 2));
