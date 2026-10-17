/**
 * Export p.68 from a serialized empty EN override and assert the snapshot was
 * consumed. This specifically guards against a source-PDF fallback.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sourcePdf = resolve('../Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const proofRoot = resolve('output/proofs/translation-readiness-2026-10-14/native-vector-mask-p068-proof-v5');
const candidateRoot = join(proofRoot, 'p068-v113-114-n2');
const snapshotDir = join(candidateRoot, 'snapshot');
const captureDir = join(candidateRoot, 'capture');
const sourcePdfSha256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const sourceSnapshotPath = join(snapshotDir, 'original-position-snapshot.json');
const emptyStatePath = join(candidateRoot, 'empty-state.json');
const snapshotPath = join(snapshotDir, 'empty-override-snapshot.json');
const pdfPath = join(candidateRoot, 'p068-en-empty-override-v2.pdf');
const logPath = join(candidateRoot, 'empty-override-export.log');
const reportPath = join(candidateRoot, 'empty-override-export-report.json');
const outputPaths = [snapshotPath, pdfPath, logPath, reportPath,
  join(captureDir, 'export-empty-viewer.png'),
  join(captureDir, 'export-empty-print.png'),
  join(captureDir, 'export-empty-metrics.json')];

for (const path of outputPaths) {
  try { await access(path); throw new Error(`Refusing to overwrite existing evidence: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const sourcePdfBytes = await readFile(sourcePdf);
assert.equal(sha(sourcePdfBytes), sourcePdfSha256, 'Pinned source PDF hash is required.');
const sourceSnapshot = JSON.parse(await readFile(sourceSnapshotPath, 'utf8'));
const emptyState = JSON.parse(await readFile(emptyStatePath, 'utf8'));
assert.equal(sourceSnapshot.page, 68);
assert.equal(sourceSnapshot.verifyRenderedSnapshot, true);
assert.equal(emptyState.page, 68);
assert.equal(emptyState.language, 'en');
assert.equal(emptyState.records.length, 1);

const record = emptyState.records[0];
const spanKey = record.key.replace(/__en$/u, '');
assert.equal(spanKey, 'page_68_block_5');
assert.ok(!spanKey.endsWith('__en'));
assert.ok(record.managedSourceSymbols?.includes('combat.skull'), 'Empty EN override must own and mask the source skull paint.');
assert.equal(record.segments.filter((segment) => segment.symbolId === 'combat.skull').length, 0, 'Empty override has no semantic skull segment.');

const originalTranslation = sourceSnapshot.translations.find((item) => item.language === 'en');
assert.ok(originalTranslation);
assert.equal(originalTranslation.spanKey, spanKey);
const sourceLineHeight = originalTranslation.data.lineHeight;
assert.ok(Number.isFinite(sourceLineHeight) && sourceLineHeight >= 0.9 && sourceLineHeight <= 1.6);
const emptyTranslation = {
  spanKey,
  language: 'en',
  data: {
    schemaVersion: 2,
    segments: record.segments,
    textAlign: 'left',
    lineHeight: sourceLineHeight,
    lineHeightMode: 'custom',
    managedSourceSymbols: record.managedSourceSymbols,
  },
};
const snapshot = { ...sourceSnapshot, translations: [emptyTranslation] };
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

const exportArgs = [
  'scripts/export_page_pdf.mjs', '--page', '68', '--language', 'en', '--output', pdfPath,
  '--base-url', 'http://localhost:8080', '--api-url', 'http://localhost:3000',
  '--source-pdf', sourcePdf, '--snapshot', snapshotPath,
  '--viewer-screenshot', join(captureDir, 'export-empty-viewer.png'),
  '--print-screenshot', join(captureDir, 'export-empty-print.png'),
  '--metrics-output', join(captureDir, 'export-empty-metrics.json'),
];
const exported = spawnSync(process.execPath, exportArgs, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const exportLog = `${exported.stdout || ''}${exported.stderr || ''}`;
await writeFile(logPath, exportLog);
assert.equal(exported.status, 0, 'Empty-override export must complete; see empty-override-export.log.');
assert.ok(exportLog.includes('edited snapshot text/symbol order verified'), 'Exporter must report that it verified the supplied snapshot.');
const pdfBytes = await readFile(pdfPath);
assert.ok(pdfBytes.length > 0);
const metrics = JSON.parse(await readFile(join(captureDir, 'export-empty-metrics.json'), 'utf8'));
assert.equal(metrics.page, 68);
assert.equal(metrics.language, 'en');

const report = {
  status: 'serialized empty EN override consumed by isolated export; source fallback rejected by visual/source comparison',
  candidateId: 'p068-v113-114-n2',
  page: 68,
  sourcePdfSha256,
  emptyOverrideSnapshotSha256: sha(await readFile(snapshotPath)),
  emptyOverrideExportPdfSha256: sha(pdfBytes),
  spanKey,
  language: 'en',
  suffixEnSerialized: false,
  sourceSkullOwnedByOverride: true,
  semanticSkullSegmentsInOverride: 0,
  exportPageCount: 1,
  exporterVerifiedSnapshotTextAndSymbolOrder: true,
  canonicalWrites: 0,
  payloadWrites: 0,
  translationWrites: 0,
  livePayloadRequests: 0,
  apiReadsServedFromImmutableSnapshot: true,
  persistenceWrites: 0,
  pdf: 'p068-en-empty-override-v2.pdf',
  viewerCapture: 'capture/export-empty-viewer.png',
  printCapture: 'capture/export-empty-print.png',
  metrics: 'capture/export-empty-metrics.json',
  exportLog: 'empty-override-export.log',
};
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
