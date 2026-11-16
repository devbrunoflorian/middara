#!/usr/bin/env node
/** Combine the existing p.47 IMPORTANT margin candidate with the user-approved exaustar correction. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const python = process.env.MIDDARA_PYTHON ?? 'C:/Users/bruno/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const v6ProposalPath = resolve(root, 'docs/translations/proposals/page-047-condition-definitions-example-2026-10-16-v6.json');
const marginProposalPath = resolve(root, 'docs/translations/proposals/page-047-important-margin-fix-2026-10-15-v2.json');
const v6Proposal = JSON.parse(await readFile(v6ProposalPath, 'utf8'));
const marginProposal = JSON.parse(await readFile(marginProposalPath, 'utf8'));
const v6SnapshotPath = resolve(root, v6Proposal.evidence.snapshot);
const snapshot = JSON.parse(await readFile(v6SnapshotPath, 'utf8'));
const sourceDir = resolve(root, 'apps/web/public/pages/page_047');
const sourcePdfPath = resolve(root, v6Proposal.source.pdfPath);
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_047');
const pdfPath = resolve(proofDir, 'page-047-important-term-combined-v1.pdf');
const viewerPath = resolve(proofDir, 'viewer-pt-BR-v1.png');
const printPath = resolve(proofDir, 'print-pt-BR-v1.png');
const rasterPath = resolve(proofDir, 'pdf-raster-v1.png');
const metricsPath = resolve(proofDir, 'export-metrics-v1.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-047-important-term-combined-2026-10-16-v1.json');
const importantGeometryPath = resolve(proofDir, 'important-bullet-layout-v1.json');
const exampleGeometryPath = resolve(proofDir, 'example-layout-v1.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const shaFile = async path => sha(await readFile(path));
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const writeOnce = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  try {
    const prior = await readFile(path);
    assert.ok(prior.equals(Buffer.from(value)), 'Refusing to replace a changed artifact: ' + path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(path, value, { flag: 'wx' });
  }
};

assert.equal(v6Proposal.page, 47);
assert.equal((await shaFile(v6SnapshotPath)).toLowerCase(), v6Proposal.evidence.snapshotSha256.toLowerCase(), 'p.47 v6 snapshot changed.');
assert.equal(marginProposal.page, 47);
assert.equal(marginProposal.source.pdfSha256.toLowerCase(), v6Proposal.source.pdfSha256.toLowerCase(), 'The source PDF baselines differ.');
assert.equal(marginProposal.source.pageDomSha256.toLowerCase(), v6Proposal.source.pageDomSha256.toLowerCase(), 'The p.47 DOM baselines differ.');
assert.equal((await shaFile(sourcePdfPath)).toLowerCase(), v6Proposal.source.pdfSha256.toLowerCase(), 'Official source PDF changed.');
assert.equal((await shaFile(resolve(sourceDir, 'page_047_dom.json'))).toLowerCase(), v6Proposal.source.pageDomSha256.toLowerCase(), 'Canonical p.47 DOM changed.');
assert.deepEqual((await readdir(sourceDir)).sort(), Object.keys(v6Proposal.source.pageAssetHashes).sort(), 'Canonical p.47 asset inventory changed.');
for (const [name, expected] of Object.entries(v6Proposal.source.pageAssetHashes)) {
  assert.equal((await shaFile(resolve(sourceDir, name))).toLowerCase(), expected.toLowerCase(), 'Canonical p.47 asset changed: ' + name);
}
assert.equal(await exists(proofDir), false, 'Refusing to replace an existing combined proof.');
assert.equal(await exists(proposalPath), false, 'Refusing to replace an existing combined proposal.');

const marginKey = marginProposal.translation.spanKey;
assert.equal(marginKey, 'page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR');
assert.equal(snapshot.translations.some(record => record.spanKey === marginKey), false, 'The v6 baseline already contains the IMPORTANT candidate.');
const combined = structuredClone(snapshot);
combined.translations.push(structuredClone(marginProposal.translation));
assert.equal(new Set(combined.translations.map(record => record.spanKey)).size, combined.translations.length, 'Combined snapshot contains duplicate keys.');
assert.equal(combined.translations.length, snapshot.translations.length + 1);
const example = combined.translations.find(record => record.spanKey === 'page_47_block_19__pt-BR');
assert.ok(example.data.segments.some(segment => segment.text.includes('EXAUSTAR') && segment.text.includes('exauste esta Disciplina')));

const lookup = new URL('/api/translations', apiUrl);
lookup.searchParams.set('where[language][equals]', 'pt-BR');
lookup.searchParams.set('where[spanKey][equals]', marginKey);
lookup.searchParams.set('limit', '10');
const payloadBeforeResponse = await fetch(lookup);
assert.ok(payloadBeforeResponse.ok, 'Read-only Payload lookup failed: ' + payloadBeforeResponse.status);
const payloadBefore = await payloadBeforeResponse.json();
assert.equal(payloadBefore.docs?.length, 1, "Expected the user's existing record 327.");
const savedRecordBefore = payloadBefore.docs[0];
assert.equal(savedRecordBefore.id, 327);

await mkdir(snapshotDir, { recursive: true });
await cp(resolve(dirname(v6SnapshotPath), 'pages/page_047'), snapshotPageDir, { recursive: true, errorOnExist: true });
await writeOnce(snapshotPath, JSON.stringify(combined, null, 2) + '\n');
const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '47', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', pdfPath, '--metrics-output', metricsPath,
  '--viewer-screenshot', viewerPath, '--print-screenshot', printPath,
  '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error('Combined p.47 PDF export failed with exit ' + exportResult.status + '.');

const rasterCode = 'import pymupdf,sys; d=pymupdf.open(sys.argv[1]); assert len(d)==1; p=d[0].get_pixmap(matrix=pymupdf.Matrix(1.57,1.57),alpha=False); p.save(sys.argv[2]); print(p.width,p.height)';
const rasterResult = spawnSync(python, ['-c', rasterCode, pdfPath, rasterPath], { cwd: root, encoding: 'utf8' });
if (rasterResult.status !== 0) throw new Error('Independent PDF raster failed: ' + (rasterResult.stderr || rasterResult.stdout));

const marginResult = spawnSync(python, [resolve(root, 'scripts/verify_p047_important_margin_copyfit.py'), pdfPath, '404.4532165527'], { cwd: root, encoding: 'utf8' });
if (marginResult.status !== 0) throw new Error('IMPORTANT bullet PDF verification failed: ' + (marginResult.stderr || marginResult.stdout));
const marginLayout = JSON.parse(marginResult.stdout.trim());
assert.equal(marginLayout.verified, true);
assert.deepEqual(marginLayout.rightClearancePt, [11.282, 13.371]);
await writeOnce(importantGeometryPath, JSON.stringify(marginLayout, null, 2) + '\n');

const exampleResult = spawnSync(python, [resolve(root, 'scripts/verify_p047_condition4_copyfit_v6.py'), pdfPath, snapshotPath], { cwd: root, encoding: 'utf8' });
if (exampleResult.status !== 0) throw new Error('Example term PDF verification failed: ' + (exampleResult.stderr || exampleResult.stdout));
const exampleLayout = JSON.parse(exampleResult.stdout.trim());
assert.equal(exampleLayout.targetTextPresent, true);
assert.equal(exampleLayout.withinMeasurementTolerance, true);
await writeOnce(exampleGeometryPath, JSON.stringify(exampleLayout, null, 2) + '\n');

const payloadAfterResponse = await fetch(lookup);
assert.ok(payloadAfterResponse.ok, 'Read-only Payload postflight lookup failed: ' + payloadAfterResponse.status);
const payloadAfter = await payloadAfterResponse.json();
assert.deepEqual(payloadAfter.docs?.[0], savedRecordBefore, "The user's saved record changed during the isolated export.");

const combinedUnit = {
  sourceEditorialKey: marginKey,
  spanKey: marginKey,
  sourceBlockId: 'block_20',
  sourceText: marginProposal.sourceText,
  targetText: marginProposal.targetText,
  sourceLineCount: marginProposal.copyfit.sourceLineCount,
  targetLineCount: marginLayout.targetLineCount,
  segments: marginProposal.translation.data.segments,
  copyfit: marginProposal.copyfit,
  terminology: marginProposal.terminology,
};
const proposal = {
  proposalId: 'p047-important-term-combined-2026-10-16-v1',
  page: 47,
  locale: 'pt-BR',
  status: 'combined-isolated-proposal-two-targeted-proofs-human-review-pending',
  units: [...v6Proposal.units, combinedUnit],
  source: v6Proposal.source,
  baseProposals: [v6Proposal.proposalId, marginProposal.proposalId],
  payloadBaseline: {
    readOnly: true,
    existingRecordId: savedRecordBefore.id,
    spanKey: marginKey,
    updatedAt: savedRecordBefore.updatedAt,
    persistedTextSha256: sha(Buffer.from((savedRecordBefore.data?.segments ?? []).map(segment => segment.text ?? '').join(''))),
    unchangedAfterExport: true,
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
    proofDirectory: 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1',
    snapshot: 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1/snapshot/snapshot.json',
    snapshotSha256: await shaFile(snapshotPath),
    pdf: 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1/page-047-important-term-combined-v1.pdf',
    pdfSha256: await shaFile(pdfPath),
    officialExportProcessExitCode: exportResult.status,
    verifiedTranslationRecords: combined.translations.length,
    pdfVerification: true,
    viewerScreenshot: 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1/viewer-pt-BR-v1.png',
    viewerScreenshotSha256: await shaFile(viewerPath),
    printScreenshot: 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1/print-pt-BR-v1.png',
    independentPdfRaster: 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1/pdf-raster-v1.png',
    importantGeometry: 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1/important-bullet-layout-v1.json',
    exampleGeometry: 'output/proofs/translation-readiness-2026-10-16/p047-important-term-combined-v1/example-layout-v1.json',
  },
  integrity: {
    payloadWritten: false,
    existingUserRecordUnchanged: true,
    canonicalSidecarsChanged: false,
    sourcePdfChanged: false,
    humanTranslationOverwritten: false,
  },
  note: 'This combined proof reuses the existing two-line IMPORTANT bullet candidate and the p.47 user-approved exaustar wording. It is a focused page export, not a complete p.47 translation; the other English bullets, the hardprinted SP orb, and A/B/C backing labels remain outstanding.',
};
await writeOnce(proposalPath, JSON.stringify(proposal, null, 2) + '\n');

console.log(JSON.stringify({
  proposalPath,
  snapshotPath,
  pdfPath,
  pdfSha256: proposal.evidence.pdfSha256,
  translationCount: combined.translations.length,
  savedUserRecordId: savedRecordBefore.id,
  payloadRecordUnchanged: true,
  payloadWrites: 0,
  importantClearancesPt: marginLayout.rightClearancePt,
  exampleRightClearancePt: exampleLayout.rightClearancePt,
  exampleTolerancePt: exampleLayout.measurementTolerancePt,
  raster: rasterResult.stdout.trim(),
}, null, 2));
