#!/usr/bin/env node
/** Export one manifest proposal through the isolated one-page PageRenderer path. */

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const relativePath = path => relative(root, path).split(sep).join('/');
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/u, '').split('=');
  return [key, rest.join('=') || true];
}));
if (!args.occurrence) throw new Error('Use --occurrence=p100-block_27.');
const manifestPath = resolve(String(args.manifest || 'docs/translations/proposals/important-family-manifest-2026-10-13.json'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const occurrence = manifest.occurrences.find(item => item.occurrenceId === args.occurrence);
if (!occurrence?.proposal?.targetText || !Array.isArray(occurrence.proposal.segments)) {
  throw new Error(`No complete segment proposal found for ${args.occurrence}.`);
}
const page = occurrence.page;
const pageId = String(page).padStart(3, '0');
const baseDir = resolve(String(args.outputDir || `output/proofs/important-family-validation-2026-10-13/${occurrence.occurrenceId}`));
const snapshotDir = resolve(baseDir, 'snapshot');
const pageDir = resolve(snapshotDir, 'pages', `page_${pageId}`);
await mkdir(pageDir, { recursive: true });
await cp(resolve(root, `apps/web/public/pages/page_${pageId}`), pageDir, { recursive: true, force: true });

const pdfPath = resolve(root, manifest.source.pdfPath);
const boxesResult = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'), pdfPath, String(page),
], { encoding: 'utf8' });
if (boxesResult.status !== 0) throw new Error(`Source PDF boxes failed: ${boxesResult.stderr || boxesResult.stdout}`);
const sourcePageBoxes = JSON.parse(boxesResult.stdout);
const segments = occurrence.proposal.segments.map(segment => Object.fromEntries(
  ['text', 'font', 'size', 'color', 'weight', 'style', 'disableLigatures', 'textStrokeWidthPt', 'textStrokeColor',
    'symbolId', 'symbolMetrics', 'sourceRendering']
    .filter(key => segment[key] !== undefined)
    .map(key => [key, segment[key]]),
));
const translation = {
  spanKey: `${occurrence.source.editorialKey}__pt-BR`,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    segments,
    textAlign: 'left',
    lineHeight: 1.1,
    lineHeightMode: 'custom',
    managedSourceSymbols: occurrence.proposal.symbolIds ?? [],
  },
};
const snapshot = {
  translations: [translation],
  // Proposal-local frames are isolated with the translation snapshot. They do
  // not update Payload or the canonical page data.
  layoutFrames: occurrence.proposal.layoutFrame ? [{
    unitKey: occurrence.source.editorialKey,
    pageNumber: page,
    language: 'pt-BR',
    data: occurrence.proposal.layoutFrame,
  }] : [],
  symbolAliasSettings: [],
  assetPages: [page],
  sourcePageBoxes,
};
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

const proofRoot = resolve(baseDir, '..');
await mkdir(proofRoot, { recursive: true });
const pdfPathOut = resolve(baseDir, `page-${pageId}-pt-BR-proposal.pdf`);
const metricsPath = resolve(baseDir, 'metrics.json');
const viewerPath = resolve(baseDir, 'viewer-pt-BR.png');
const printPath = resolve(baseDir, 'print-pt-BR.png');
const exportArgs = [
  resolve(root, 'scripts/export_page_pdf.mjs'),
  '--page', String(page), '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', pdfPathOut,
  '--metrics-output', metricsPath, '--viewer-screenshot', viewerPath, '--print-screenshot', printPath,
  '--base-url', String(args['base-url'] || 'http://127.0.0.1:8080'),
  '--api-url', String(args['api-url'] || 'http://localhost:3000'),
];
if (args['capture-only']) exportArgs.push('--capture-only');
const exported = spawnSync(process.execPath, exportArgs, { cwd: root, stdio: 'inherit' });
if (exported.status !== 0) throw new Error(`One-page export failed for ${occurrence.occurrenceId} (exit ${exported.status}).`);
occurrence.proposal.fit = {
  status: args['capture-only']
    ? 'PageRenderer-viewer-and-print-captured; PDF omitted for batch validation'
    : 'PageRenderer-viewer-print-and-one-page-PDF-captured; requires visual/semantic review',
  artifactDirectory: relativePath(baseDir),
  pdf: args['capture-only'] ? null : relativePath(pdfPathOut),
  viewerScreenshot: relativePath(viewerPath),
  printScreenshot: relativePath(printPath),
  metrics: relativePath(metricsPath),
};
occurrence.processing.fit = args['capture-only'] ? 'rendered-viewer-and-print; automated-and-visual-review-pending' : 'rendered-viewer-print-pdf; visual-review-pending';
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ occurrenceId: occurrence.occurrenceId, pdf: pdfPathOut, viewer: viewerPath, print: printPath, metrics: metricsPath }, null, 2));
