#!/usr/bin/env node
/** Revalidate the user-approved Exhaust -> exaustar wording in the p.47 example. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const python = process.env.MIDDARA_PYTHON ?? 'C:/Users/bruno/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const baseProposalPath = resolve(root, 'docs/translations/proposals/page-047-condition-definitions-example-2026-10-16-v5.json');
const baseProposal = JSON.parse(await readFile(baseProposalPath, 'utf8'));
const baseSnapshotPath = resolve(root, baseProposal.evidence.snapshot);
const baseSnapshot = JSON.parse(await readFile(baseSnapshotPath, 'utf8'));
const sourceDir = resolve(root, 'apps/web/public/pages/page_047');
const sourcePdfPath = resolve(root, baseProposal.source.pdfPath);
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v6');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_047');
const pdfPath = resolve(proofDir, 'page-047-condition4-v6.pdf');
const viewerPath = resolve(proofDir, 'viewer-pt-BR-v6.png');
const printPath = resolve(proofDir, 'print-pt-BR-v6.png');
const metricsPath = resolve(proofDir, 'export-metrics-v6.json');
const geometryPath = resolve(proofDir, 'example-layout-v6-unclipped.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-047-condition-definitions-example-2026-10-16-v6.json');
const verifierPath = resolve(root, 'scripts/verify_p047_condition4_copyfit_v6.py');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const shaFile = async path => sha(await readFile(path));
const fileExists = async path => { try { await access(path); return true; } catch { return false; } };
const immutableWrite = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  try {
    const prior = await readFile(path);
    assert.ok(prior.equals(Buffer.from(value)), 'Refusing to replace a changed artifact: ' + path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(path, value, { flag: 'wx' });
  }
};

assert.equal(baseProposal.page, 47);
assert.equal(baseProposal.evidence.snapshotSha256, await shaFile(baseSnapshotPath), 'The preserved v5 snapshot changed.');
assert.equal((await shaFile(sourcePdfPath)).toLowerCase(), baseProposal.source.pdfSha256.toLowerCase(), 'Official source PDF changed.');
assert.equal((await shaFile(resolve(sourceDir, 'page_047_dom.json'))).toLowerCase(), baseProposal.source.pageDomSha256.toLowerCase(), 'Canonical p.47 DOM changed.');
assert.equal((await shaFile(resolve(sourceDir, 'inline_elements.json'))).toLowerCase(), baseProposal.source.pageInlineElementsSha256.toLowerCase(), 'Canonical p.47 inline sidecar changed.');
const currentAssets = (await readdir(sourceDir)).sort();
assert.deepEqual(currentAssets, Object.keys(baseProposal.source.pageAssetHashes).sort(), 'Canonical p.47 asset inventory changed.');
for (const [name, expected] of Object.entries(baseProposal.source.pageAssetHashes)) {
  assert.equal((await shaFile(resolve(sourceDir, name))).toLowerCase(), expected.toLowerCase(), 'Canonical p.47 asset changed: ' + name);
}
const priorV6Proposal = await fileExists(proposalPath) ? JSON.parse(await readFile(proposalPath, 'utf8')) : null;
if (priorV6Proposal) assert.equal(priorV6Proposal.proposalId, 'p047-condition-definitions-example-2026-10-16-v6', 'Refusing to replace an unrelated proposal.');

const targetUrl = new URL('/api/translations', apiUrl);
targetUrl.searchParams.set('where[language][equals]', 'pt-BR');
targetUrl.searchParams.set('where[spanKey][equals]', 'page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR');
targetUrl.searchParams.set('limit', '10');
const payloadBeforeResponse = await fetch(targetUrl);
assert.ok(payloadBeforeResponse.ok, 'Read-only Payload lookup failed: ' + payloadBeforeResponse.status);
const payloadBefore = await payloadBeforeResponse.json();
assert.equal(payloadBefore.docs?.length, 1, 'Expected the existing user record 327; refusing to mutate anything.');
const savedRecordBefore = payloadBefore.docs[0];
assert.equal(savedRecordBefore.id, 327);

const exampleKey = 'page_47_block_19__pt-BR';
const sourceRecord = baseSnapshot.translations.find(record => record.spanKey === exampleKey);
const proposalUnit = baseProposal.units.find(unit => unit.spanKey === exampleKey);
assert.ok(sourceRecord && proposalUnit, 'The preserved v5 proposal is missing the p.47 example.');
const oldSegment = ' mostra a Tag de Condição EXAURIR, que exige que o Aventureiro Exaura esta Disciplina quando sua Habilidade é usada. ';
const newSegment = ' mostra a Tag de Condição EXAUSTAR, que exige que o Aventureiro exauste esta Disciplina quando sua Habilidade é usada. ';
const segment = sourceRecord.data.segments.find(item => item.text === oldSegment);
assert.ok(segment, 'The v5 source example wording changed; refusing to apply a fuzzy replacement.');
const translatedRecord = structuredClone(sourceRecord);
segment.text = newSegment;
const translatedTarget = proposalUnit.targetText.replace('EXAURIR', 'EXAUSTAR').replace('Exaura esta', 'exauste esta');
assert.equal(sourceRecord.data.segments.map(item => item.text).join(''), translatedTarget, 'Updated rich runs do not reproduce the exact target.');
assert.equal(translatedTarget, proposalUnit.targetText.replace(oldSegment.trim(), newSegment.trim()), 'Unexpected target wording change.');
const nextSnapshot = structuredClone(baseSnapshot);
nextSnapshot.translations = nextSnapshot.translations.map(record => record.spanKey === exampleKey ? sourceRecord : record);
assert.equal(nextSnapshot.translations.length, baseSnapshot.translations.length);
assert.equal(new Set(nextSnapshot.translations.map(record => record.spanKey)).size, nextSnapshot.translations.length, 'Duplicate translation keys in snapshot.');
assert.deepEqual(nextSnapshot.translations.filter(record => record.spanKey !== exampleKey), baseSnapshot.translations.filter(record => record.spanKey !== exampleKey), 'The revision changed another translation.');

await mkdir(snapshotDir, { recursive: true });
if (await fileExists(snapshotPageDir)) {
  for (const [name, expected] of Object.entries(baseProposal.source.pageAssetHashes)) {
    assert.equal((await shaFile(resolve(snapshotPageDir, name))).toLowerCase(), expected.toLowerCase(), 'Existing isolated asset changed: ' + name);
  }
} else {
  await cp(resolve(dirname(baseSnapshotPath), 'pages/page_047'), snapshotPageDir, { recursive: true, errorOnExist: true });
}
await immutableWrite(snapshotPath, JSON.stringify(nextSnapshot, null, 2) + '\n');

let exportExitCode = 0;
if (await fileExists(pdfPath)) {
  for (const path of [viewerPath, printPath, metricsPath]) assert.ok(await fileExists(path), 'Incomplete existing export output: ' + path);
  const existingMetrics = JSON.parse(await readFile(metricsPath, 'utf8'));
  assert.equal(existingMetrics.page, 47);
  assert.equal(existingMetrics.language, 'pt-BR');
} else {
  const exportResult = spawnSync(process.execPath, [
    resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '47', '--language', 'pt-BR', '--profile', 'visual',
    '--snapshot', snapshotPath, '--output', pdfPath, '--metrics-output', metricsPath,
    '--viewer-screenshot', viewerPath, '--print-screenshot', printPath,
    '--base-url', baseUrl, '--api-url', apiUrl,
  ], { cwd: root, stdio: 'inherit' });
  exportExitCode = exportResult.status ?? 1;
  if (exportExitCode !== 0) throw new Error('Official isolated p.47 export failed with exit ' + exportExitCode + '.');
}

const geometryResult = spawnSync(python, [verifierPath, pdfPath, snapshotPath], { cwd: root, encoding: 'utf8' });
if (geometryResult.status !== 0) throw new Error('p.47 example geometry verification failed: ' + (geometryResult.stderr || geometryResult.stdout));
const exampleLayout = JSON.parse(geometryResult.stdout.trim());
assert.equal(exampleLayout.targetTextPresent, true, 'The PDF does not contain the exact proposed example text.');
assert.equal(exampleLayout.withinMeasurementTolerance, true, 'The example exceeds the 0.05 pt PDF measurement tolerance.');
await immutableWrite(geometryPath, JSON.stringify(exampleLayout, null, 2) + '\n');

const payloadAfterResponse = await fetch(targetUrl);
assert.ok(payloadAfterResponse.ok, 'Read-only Payload postflight lookup failed: ' + payloadAfterResponse.status);
const payloadAfter = await payloadAfterResponse.json();
assert.deepEqual(payloadAfter.docs?.[0], savedRecordBefore, "The export changed the user's saved record.");

const proposal = structuredClone(baseProposal);
proposal.proposalId = 'p047-condition-definitions-example-2026-10-16-v6';
proposal.status = 'condition4-copyfit-pass-and-user-approved-exaustar-term-revalidated-pending-full-page-review';
proposal.parentProposal = baseProposal.proposalId;
proposal.units = proposal.units.map(unit => {
  if (unit.spanKey !== exampleKey) return unit;
  const updated = structuredClone(unit);
  updated.targetText = translatedTarget;
  updated.segments = sourceRecord.data.segments;
  updated.terminology = updated.terminology.map(term => term.source === 'Exhaust Condition Tag / Exhaust'
    ? { ...term, draft: 'Tag de Condição EXAUSTAR / exaustar', status: 'user-approved-2026-10-15', note: 'O usuário determinou usar exaustar; esta conjugação é exauste.' }
    : term);
  return updated;
});
proposal.evidence = {
  ...baseProposal.evidence,
  proofDirectory: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v6',
  snapshot: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v6/snapshot/snapshot.json',
  snapshotSha256: await shaFile(snapshotPath),
  pdf: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v6/page-047-condition4-v6.pdf',
  pdfSha256: await shaFile(pdfPath),
  viewerScreenshot: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v6/viewer-pt-BR-v6.png',
  viewerScreenshotSha256: await shaFile(viewerPath),
  printScreenshot: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v6/print-pt-BR-v6.png',
  exportMetrics: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v6/export-metrics-v6.json',
  exampleLayout: 'output/proofs/translation-readiness-2026-10-16/p047-condition4-copyfit-v6/example-layout-v6.json',
  exampleLayoutSha256: await shaFile(geometryPath),
  payloadWrites: 0,
  savedUserRecordId: savedRecordBefore.id,
  savedUserRecordUnchanged: true,
  officialExportProcessExitCode: exportExitCode,
};
proposal.copyfit.exampleBlock19 = {
  status: 'visual-pass-within-0.05-pt-pdf-measurement-tolerance',
  targetTextPresent: exampleLayout.targetTextPresent,
  rightClearancePt: exampleLayout.rightClearancePt,
  measurementTolerancePt: exampleLayout.measurementTolerancePt,
  frameAndFontChanges: false,
};
proposal.integrity = { ...proposal.integrity, payloadWritten: false, canonicalSidecarsChanged: false, sourcePdfChanged: false, humanTranslationOverwritten: false };
proposal.note = 'This isolated revision synchronizes only the example wording with the user-approved term exaustar and revalidates the full page export. The initial geometry receipt used cropped characters and was superseded by the unclipped PDF character bounds in example-layout-v6-unclipped.json. It does not alter the saved English string in the PT-BR Payload record, canonical sidecars, or other page units.';
const proposalBytes = JSON.stringify(proposal, null, 2) + '\n';
if (priorV6Proposal) {
  const backupPath = resolve(dirname(proposalPath), 'page-047-condition-definitions-example-2026-10-16-v6-initial-measurement.json');
  await immutableWrite(backupPath, JSON.stringify(priorV6Proposal, null, 2) + '\n');
  await writeFile(proposalPath, proposalBytes, 'utf8');
} else {
  await immutableWrite(proposalPath, proposalBytes);
}

console.log(JSON.stringify({
  proposalPath,
  snapshotPath,
  pdfPath,
  pdfSha256: proposal.evidence.pdfSha256,
  savedPayloadRecordId: savedRecordBefore.id,
  payloadRecordUnchanged: true,
  payloadWrites: 0,
  exampleLayout,
}, null, 2));
