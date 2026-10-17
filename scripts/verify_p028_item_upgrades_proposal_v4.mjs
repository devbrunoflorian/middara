#!/usr/bin/env node
/** Read-only PT-BR Viewer and Admin Editor check for the isolated p.28 proposal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 28;
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1');
const proposalPath = resolve(root, 'docs/translations/proposals/page-028-item-upgrades-proposal-2026-10-16-v4.json');
const snapshotPath = resolve(proofDir, 'snapshot-diagnostic-v4/snapshot.json');
const receiptPath = resolve(proofDir, 'viewer-editor-receipt-v1.json');
const pageAssetDir = resolve(root, 'apps/web/public/pages/page_028');
const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadOrigin = new URL(payloadUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\[\[[^\]]+\]\]/gu, ' ').replace(/[\uFFFC\uFFFD]/gu, ' ').replace(/\s+/gu, ' ').trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonEqual = value => JSON.stringify(value);
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const candidates = proposal.candidates;
const preserved = proposal.preservedHumanRecords;
assert.equal(proposal.page, pageNumber);
assert.equal(proposal.locale, 'pt-BR');
assert.equal(candidates.length, 23);
assert.equal(preserved.length, 8);
assert.equal(snapshot.translations.length, 31);
assert.equal((snapshot.layoutFrames ?? []).length, 3);
assert.equal(snapshot.diagnosticOnly.blankedSpanKeys.length, 0);

const expectedUnits = [
  ...candidates.map(candidate => ({
    kind: 'new_candidate', spanKey: candidate.legacyBlockSpanKey,
    editorUnitKey: candidate.editorUnitKey, expectedText: candidate.proposalText,
    candidate,
  })),
  ...preserved.map(record => ({
    kind: 'preserved_human_record', spanKey: record.spanKey,
    // This legacy heading key predates the page's semantic heading field ID.
    // Open the same source heading field in Admin Editor; keep the original
    // saved Payload key and data unchanged in the Viewer snapshot.
    editorUnitKey: record.sourceUnitId === 'p28-block-18-font-size-12pt-unit-00'
      ? 'page_28_unit_p28-block-18-heading-size-12pt__pt-BR' : record.editorUnitKey,
    expectedText: record.proposedText,
    record,
  })),
];
assert.equal(new Set(expectedUnits.map(item => item.spanKey)).size, expectedUnits.length);
const snapshotRecords = snapshot.translations ?? [];
for (const unit of expectedUnits) {
  const stored = snapshotRecords.find(record => record.spanKey === unit.spanKey && record.language === 'pt-BR');
  assert.ok(stored, `Missing snapshot translation for ${unit.spanKey}`);
  const storedText = (stored.data?.segments ?? []).filter(segment => !segment.symbolId).map(segment => segment.text ?? '').join('');
  assert.equal(normalize(storedText), normalize(unit.expectedText), `Snapshot text mismatch for ${unit.spanKey}`);
}

const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadPageRecords = async () => {
  const response = await fetch(translationsUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Payload translations GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_28_'));
};
const framesUrl = new URL('/api/layout-frames', payloadUrl);
framesUrl.searchParams.set('limit', '5000');
const readPayloadPageFrames = async () => {
  const response = await fetch(framesUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Payload layout-frames GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(record => Number(record.pageNumber) === pageNumber);
};
const pageRecordsForComparison = records => records.map(record => ({ id: record.id, spanKey: record.spanKey, language: record.language, data: record.data })).sort((a, b) => a.id - b.id);
const payloadBefore = await readPayloadPageRecords();
const payloadFramesBefore = await readPayloadPageFrames();
assert.equal(payloadBefore.length, 8, 'The saved p.28 translation baseline changed.');
assert.equal(payloadFramesBefore.length, 0, 'The saved p.28 layout-frame baseline changed.');
assert.deepEqual(pageRecordsForComparison(payloadBefore), pageRecordsForComparison(preserved.map(record => ({ id: record.existingRecordId, spanKey: record.spanKey, language: 'pt-BR', data: record.data }))));

async function listFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(resolve(directory, entry.name), rel));
    else result.push(rel);
  }
  return result.sort();
}
const assetNames = await listFiles(pageAssetDir);
const hashAssets = async () => Object.fromEntries(await Promise.all(assetNames.map(async name => [name, digest(await readFile(resolve(pageAssetDir, name)))])));
const beforeAssets = await hashAssets();

const records = snapshotRecords;
const requests = [];
const blockedMutations = [];
const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/pages/page_028/page_028_dom.json', async route => {
    await route.fulfill({ path: resolve(snapshotPath, '../pages/page_028/page_028_dom.json') });
  });
  await context.route('**/pages/page_028/fidelity_overlays.json', async route => {
    await route.fulfill({ path: resolve(snapshotPath, '../pages/page_028/fidelity_overlays.json') });
  });
  for (const name of assetNames.filter(name => name.includes('fidelity-overlay-component-'))) {
    await context.route(`**/pages/page_028/${name}`, async route => {
      await route.fulfill({ path: resolve(snapshotPath, `../pages/page_028/${name}`) });
    });
  }
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    requests.push({ method, origin: url.origin, path: url.pathname });
    if (url.origin !== payloadOrigin || method !== 'GET') {
      blockedMutations.push({ method, origin: url.origin, path: url.pathname });
      await route.abort('blockedbyclient');
      return;
    }
    const headers = { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' };
    if (url.pathname === '/api/translations') {
      const language = url.searchParams.get('where[language][equals]');
      const spanKey = url.searchParams.get('where[spanKey][equals]');
      const docs = records.filter(record => (!language || record.language === language) && (!spanKey || record.spanKey === spanKey));
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: 5000, hasNextPage: false }) });
      return;
    }
    if (url.pathname === '/api/layout-frames') {
      const docs = snapshot.layoutFrames ?? [];
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: docs.length }) });
      return;
    }
    if (url.pathname === '/api/symbol-alias-settings') {
      const docs = snapshot.symbolAliasSettings ?? [];
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: docs.length }) });
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill(String(pageNumber));
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_028/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await page.waitForTimeout(400);
  const viewerText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = expectedUnits.map(unit => ({ spanKey: unit.spanKey, kind: unit.kind, visible: viewerText.includes(normalize(unit.expectedText)) }));
  const viewerMissing = viewerChecks.filter(check => !check.visible);
  const viewerTargetChecks = await page.evaluate(units => units.map(unit => {
    const nodes = [...document.querySelectorAll('[data-rendered-translation-key]')].filter(node => node.getAttribute('data-rendered-translation-key') === unit.spanKey);
    return { spanKey: unit.spanKey, targetCount: nodes.length, texts: nodes.map(node => node.innerText.replace(/\s+/gu, ' ').trim()) };
  }), expectedUnits.map(unit => ({ spanKey: unit.spanKey })));
  const targetMismatches = viewerTargetChecks.filter((check, index) => check.targetCount !== 1 || normalize(check.texts[0] ?? '') !== normalize(expectedUnits[index].expectedText));
  await page.locator('button[title="Fit to Screen"]').click();
  await page.waitForTimeout(250);
  const viewerScreenshot = resolve(proofDir, 'viewer-readonly-pt-BR-diagnostic-v4.png');
  await page.locator('.page-container').screenshot({ path: viewerScreenshot, animations: 'disabled' });
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  const editorScreenshot = resolve(proofDir, 'editor-readonly-v1.png');
  let editorScreenshotWritten = false;
  for (const unit of expectedUnits) {
    const target = page.locator(`[data-editable-unit-key="${unit.editorUnitKey}"]`).first();
    const targetCount = await target.count();
    if (!targetCount) {
      const available = await page.locator('[data-editable-unit-key]').evaluateAll(nodes => nodes.map(node => ({ key: node.getAttribute('data-editable-unit-key'), label: node.getAttribute('aria-label'), title: node.getAttribute('title') })).filter(item => String(item.key).includes('p28-block-18')));
      assert.ok(false, `No Editor target for ${unit.editorUnitKey}; available block-18 targets: ${JSON.stringify(available)}`);
    }
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert.ok(box, `No Editor target box for ${unit.editorUnitKey}`);
    await target.click({ force: true, position: { x: Math.min(box.width / 2, Math.max(1, box.width - 1)), y: Math.min(box.height / 2, Math.max(1, box.height - 1)) } });
    await page.waitForFunction(key => {
      const element = [...document.querySelectorAll('[data-editable-unit-key]')].find(node => node.getAttribute('data-editable-unit-key') === key);
      return !!element && (element.matches('.credit-field-selected, .block-selected, .span-selected') || !!element.closest('.credit-field-selected, .block-selected, .span-selected'));
    }, unit.editorUnitKey, { timeout: 5000 });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor({ state: 'visible' });
    const editorText = normalize(await editor.inputValue());
    const matched = editorText === normalize(unit.expectedText);
    const editable = await editor.evaluate(element => !element.disabled && !element.readOnly);
    if (!editorScreenshotWritten) {
      await page.screenshot({ path: editorScreenshot, fullPage: false });
      editorScreenshotWritten = true;
    }
    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
    await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    editorChecks.push({ spanKey: unit.spanKey, editorUnitKey: unit.editorUnitKey, kind: unit.kind, selected: true, proposalMatched: matched, editable, editorText, cancelled: true });
  }
  await page.locator('.rse-close').click();
  await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
  assert.deepEqual(blockedMutations, []);
  assert.deepEqual(pageErrors, []);
  const payloadAfter = await readPayloadPageRecords();
  const payloadFramesAfter = await readPayloadPageFrames();
  assert.deepEqual(pageRecordsForComparison(payloadAfter), pageRecordsForComparison(payloadBefore));
  assert.deepEqual(payloadFramesAfter, payloadFramesBefore);
  const afterAssets = await hashAssets();
  assert.deepEqual(afterAssets, beforeAssets);
  const editorMismatches = editorChecks.filter(check => !check.proposalMatched);
  const editorVerifiedCandidateCount = editorChecks.filter(check => check.kind === 'new_candidate' && check.proposalMatched && check.editable).length;
  const editorVerifiedPreservedRecordCount = editorChecks.filter(check => check.kind === 'preserved_human_record' && check.proposalMatched && check.editable).length;
  assert.equal(editorVerifiedCandidateCount, 23);
  assert.equal(editorVerifiedPreservedRecordCount, 7);
  assert.deepEqual(editorMismatches.map(check => check.spanKey), ['page_28_unit_p28-block-18-font-size-12pt-unit-00__pt-BR']);
  assert.equal(editorMismatches[0].editorText, 'Unlocking Item Upgrades');
  const receipt = {
    status: 'viewer_and_new_candidates_verified_legacy_saved_heading_editor_key_mismatch',
    page: pageNumber, locale: 'pt-BR', proposalSha256: digest(await readFile(proposalPath)), snapshotSha256: digest(await readFile(snapshotPath)),
    candidateCount: candidates.length, preservedHumanRecordCount: preserved.length, viewerChecks, viewerMissing, viewerTargetChecks, targetMismatches,
    editorChecks, editorVerifiedCandidateCount, editorVerifiedPreservedRecordCount,
    editorBoundaryMismatchCount: editorMismatches.length,
    editorBoundaryMismatches: editorMismatches,
    technicalException: {
      spanKey: 'page_28_unit_p28-block-18-font-size-12pt-unit-00__pt-BR',
      payloadRecordId: 232,
      savedText: 'Desbloqueando Aprimoramentos de Item',
      editorFieldKey: 'page_28_unit_p28-block-18-heading-size-12pt__pt-BR',
      editorText: 'Unlocking Item Upgrades',
      action: 'Preserve the existing Payload record; do not save or replace it. The semantic Editor field currently does not resolve this legacy span key.',
    },
    payload: { beforeCount: payloadBefore.length, afterCount: payloadAfter.length, unchanged: jsonEqual(pageRecordsForComparison(payloadAfter)) === jsonEqual(pageRecordsForComparison(payloadBefore)) },
    payloadLayoutFrames: { beforeCount: payloadFramesBefore.length, afterCount: payloadFramesAfter.length, unchanged: true },
    observedApiMethods: [...new Set(requests.map(request => request.method))], blockedMutations,
    consoleErrors, pageErrors, canonicalAssetsUnchanged: true, saveClicked: false,
    screenshots: { viewer: relative(root, viewerScreenshot).replaceAll('\\', '/'), editor: relative(root, editorScreenshot).replaceAll('\\', '/') },
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  assert.deepEqual(viewerMissing, [], `Viewer omitted proposal or preserved text: ${JSON.stringify(viewerMissing)}`);
  assert.deepEqual(targetMismatches, [], `Viewer target boundary or text mismatch: ${JSON.stringify(targetMismatches)}`);
  assert.ok(editorChecks.every(check => check.editable && check.cancelled), 'An Editor dialog was not editable and cancelled as expected.');
  assert.ok(editorChecks.filter(check => check.kind === 'new_candidate').every(check => check.proposalMatched), 'A new proposal did not match in Admin Editor.');
  assert.deepEqual(pageRecordsForComparison(payloadAfter), pageRecordsForComparison(payloadBefore));
  assert.equal(receipt.payload.unchanged, true);
  assert.deepEqual(consoleErrors, []);
} finally { await browser.close(); }
