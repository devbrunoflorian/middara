#!/usr/bin/env node
/** Regenerate the p.47 Condition 4 copyfit candidate from the preserved v4 snapshot. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const v4Path = resolve(root, 'docs/translations/proposals/page-047-condition-definitions-example-2026-10-15-v4.json');
const v4 = JSON.parse(await readFile(v4Path, 'utf8'));
const v4SnapshotPath = resolve(root, v4.evidence.snapshot);
const v4Snapshot = JSON.parse(await readFile(v4SnapshotPath, 'utf8'));
const sourceDir = resolve(root, 'apps/web/public/pages/page_047');
const sourcePdfPath = resolve(root, v4.source.pdfPath);
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_047');
const pdfPath = resolve(proofDir, 'page-047-condition4-v5.pdf');
const viewerPath = resolve(proofDir, 'viewer-pt-BR.png');
const printPath = resolve(proofDir, 'print-pt-BR.png');
const metricsPath = resolve(proofDir, 'export-metrics.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-047-condition-definitions-example-2026-10-16-v5.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const shaFile = async path => sha(await readFile(path));

const source = {
  pdf: v4.source.pdfSha256,
  dom: v4.source.pageDomSha256,
  inline: v4.source.pageInlineElementsSha256,
  assets: v4.source.pageAssetHashes,
};
assert.equal(await shaFile(sourcePdfPath), source.pdf, 'Official source PDF changed since v4.');
assert.equal(await shaFile(resolve(sourceDir, 'page_047_dom.json')), source.dom, 'Canonical p.47 DOM changed since v4.');
assert.equal(await shaFile(resolve(sourceDir, 'inline_elements.json')), source.inline, 'Canonical p.47 inline elements changed since v4.');
assert.deepEqual((await readdir(sourceDir)).sort(), Object.keys(source.assets).sort(), 'Canonical p.47 asset inventory changed.');
for (const [name, expected] of Object.entries(source.assets)) {
  assert.equal(await shaFile(resolve(sourceDir, name)), expected, `Canonical p.47 asset changed: ${name}`);
}

const spanKey = 'page_47_block_6__pt-BR';
const targetText = '4.\t Condições de Símbolos: Símbolos a gastar. Essas Habilidades só podem ser usadas na etapa “Gastar Símbolos e usar Habilidades que adicionam Dano” do Ataque (ver Ação de Ataque, pág. 41).';
const segments = [
  { text: '4.\t Condições de Símbolos:', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
  { text: ' Símbolos a gastar. Essas Habilidades só podem ser usadas na etapa “', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
  { text: 'Gastar Símbolos e usar Habilidades que adicionam Dano', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
  { text: '” do Ataque (ver ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
  { text: 'Ação de Ataque', font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true },
  { text: ', pág. 41).', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
];
assert.equal(segments.map(segment => segment.text).join(''), targetText, 'Rich text segments differ from the approved candidate string.');
assert.equal((await fetch(`${apiUrl}/api/translations?language=pt-BR&limit=5000`).then(response => response.json())).docs
  .filter(record => record.spanKey === spanKey).length, 0, 'A human PT-BR record already exists for this key; stop.');

const candidate = v4Snapshot.translations.filter(record => record.spanKey === spanKey);
assert.equal(candidate.length, 1, 'v4 snapshot must contain exactly one Condition 4 record.');
const translations = v4Snapshot.translations.map(record => record.spanKey !== spanKey ? record : ({
  ...record,
  data: { ...record.data, segments },
}));
assert.equal(new Set(translations.map(record => record.spanKey)).size, translations.length, 'Snapshot contains duplicate keys.');
assert.deepEqual(translations.filter(record => record.spanKey !== spanKey), v4Snapshot.translations.filter(record => record.spanKey !== spanKey),
  'This revision may change only Condition 4.');

await mkdir(dirname(snapshotPageDir), { recursive: true });
await cp(resolve(dirname(v4SnapshotPath), 'pages/page_047'), snapshotPageDir, { recursive: true, errorOnExist: true });
await mkdir(snapshotDir, { recursive: true });
const snapshot = { ...v4Snapshot, translations };
const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '47'], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);
snapshot.sourcePageBoxes = JSON.parse(boxes.stdout);
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });

const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '47', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', pdfPath, '--metrics-output', metricsPath,
  '--viewer-screenshot', viewerPath, '--print-screenshot', printPath, '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error(`Official isolated export failed with exit ${exportResult.status}.`);
const pdfRasterPath = resolve(proofDir, 'page-047-condition4-v5-pdf-raster.png');
const pdfLayoutPath = resolve(proofDir, 'condition4-layout-verification-v5.json');
const verification = spawnSync('python', [
  resolve(root, 'scripts/verify_p047_condition4_copyfit_v5.py'), pdfPath, pdfRasterPath,
], { encoding: 'utf8' });
if (verification.status !== 0) throw new Error(`Condition 4 PDF verification failed: ${verification.stderr || verification.stdout}`);
const pdfLayout = JSON.parse(verification.stdout.trim());
assert.equal(pdfLayout.condition4TargetLineCount, 3, 'Condition 4 must fit in three lines.');

const proposal = structuredClone(v4);
proposal.proposalId = 'p047-condition-definitions-example-2026-10-16-v5';
proposal.status = 'targeted-condition-4-copyfit-pending-visual-review-and-human-editorial-review';
const unit = proposal.units.find(item => item.spanKey === spanKey);
assert.ok(unit, 'v4 proposal is missing Condition 4.');
unit.targetText = targetText;
unit.segments = segments;
unit.terminology = [
  { source: 'Symbol Conditions', draft: 'Condições de Símbolos', status: 'pending-human-review', note: 'Termo mecânico sem forma aprovada no glossário.' },
  { source: 'Spend Symbols and use Abilities that add Damage', draft: 'Gastar Símbolos e usar Habilidades que adicionam Dano', status: 'pending-human-review', note: 'Nome da etapa citada no fluxo de Ataque; confirmar na p.41.' },
  { source: 'The Attack Action', draft: 'Ação de Ataque', status: 'pending-human-review', note: 'Referência cruzada; conservar pág. 41.' },
  { source: 'Ability / Attack / Damage', draft: 'Habilidade / Ataque / Dano', status: 'pending-human-review', note: 'Capitalização mecânica segue para revisão humana.' },
];
proposal.copyfit = {
  previousAttempts: ['v1', 'v2', 'v3', 'v4'],
  currentAttempt: 'one targeted wording revision requested by the user on 2026-10-16',
  status: 'three-line-copyfit-pass-no-frame-or-font-changes; human terminology review pending',
  targetLineCount: pdfLayout.condition4TargetLineCount,
  sourceLineCount: unit.sourceLineCount,
  frameAndFontChanges: false,
  frameRightPt: pdfLayout.frameRightPt,
  rightClearancesPt: pdfLayout.rightClearancesPt,
  verticalGapToImportantHeadingPt: pdfLayout.verticalGapToImportantHeadingPt,
};
proposal.evidence = {
  proofDirectory: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5',
  snapshot: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5/snapshot/snapshot.json',
  snapshotSha256: await shaFile(snapshotPath),
  pdf: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5/page-047-condition4-v5.pdf',
  pdfSha256: await shaFile(pdfPath),
  viewerScreenshot: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5/viewer-pt-BR.png',
  viewerScreenshotSha256: await shaFile(viewerPath),
  printScreenshot: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5/print-pt-BR.png',
  exportMetrics: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5/export-metrics.json',
  pdfRaster: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5/page-047-condition4-v5-pdf-raster.png',
  pdfRasterSha256: await shaFile(pdfRasterPath),
  pdfLayoutVerification: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v5/condition4-layout-verification-v5.json',
  pdfLayoutVerificationSha256: await shaFile(pdfLayoutPath),
  payloadWrites: 0,
};
proposal.note = 'This revision changes only Condition 4 wording in the isolated v4 proposal. It preserves the cited step, emphasis, and page 41 reference. It does not resolve the separate IMPORTANT editor overflow or certify the full p.47 page.';
await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' });

console.log(JSON.stringify({ spanKey, targetText, proofDir, proposalPath, pdfSha256: proposal.evidence.pdfSha256 }, null, 2));
