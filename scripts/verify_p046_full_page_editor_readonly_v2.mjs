#!/usr/bin/env node
/** Verify every p.46 v2 proposal in the normal Viewer/Admin with all API writes blocked. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p046-full-page-proposal-v2');
const pageDir = resolve(root, 'apps/web/public/pages/page_046');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_WEB_URL ?? 'http://127.0.0.1:8080';
const apiOrigin = new URL(apiUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const hashFile = async path => sha(await readFile(path));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

const proposal = await readJson(resolve(root, 'docs/translations/proposals/page-046-full-page-proposal-2026-10-16-v2.json'));
const manifest = await readJson(resolve(proofDir, 'source-hashes.json'));
const snapshot = await readJson(resolve(proofDir, 'snapshot/snapshot-p046-full-page-v2-export.json'));
const candidates = proposal.candidates;
const records = snapshot.translations ?? [];
assert.equal(proposal.page, 46);
assert.equal(proposal.candidateRecordCount, 12);
assert.equal(candidates.length, 12);
assert.equal(records.length, 12);
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, 12);
assert.deepEqual(new Set(records.map(record => record.spanKey)), new Set(candidates.map(candidate => candidate.spanKey)));

const pageHashesBefore = {};
for (const [name, expectedHash] of Object.entries(manifest.pageAssets)) {
  pageHashesBefore[name] = await hashFile(resolve(pageDir, name));
  assert.equal(pageHashesBefore[name], expectedHash, `Canonical p.46 asset changed since proposal: ${name}`);
}

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadP46 = async () => {
  const response = await fetch(translationsUrl);
  assert.ok(response.ok, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_46_'))
    .map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt }));
};
const payloadBefore = await readPayloadP46();
assert.deepEqual(payloadBefore, [], 'A PT-BR p.46 record exists; preserve it and stop.');

const aliases = Object.assign({}, ...(snapshot.symbolAliasSettings ?? []).map(record => record.aliases ?? {}));
const checks = candidates.map(candidate => {
  const record = records.find(item => item.spanKey === candidate.spanKey);
  assert.ok(record, `Snapshot record missing for ${candidate.spanKey}`);
  const symbolIds = [];
  const expectedEditorText = record.data.segments.map(segment => {
    if (!segment.symbolId) return segment.text;
    const alias = aliases[segment.symbolId];
    assert.ok(alias, `Missing Editor alias for ${segment.symbolId}`);
    symbolIds.push(segment.symbolId);
    return `[[${alias}]]`;
  }).join('');
  const expectedViewerText = record.data.segments.filter(segment => !segment.symbolId).map(segment => segment.text).join('');
  const uiKey = candidate.spanKey.startsWith('page_46_block_')
    ? candidate.spanKey.replace(/__pt-BR$/u, '')
    : candidate.spanKey;
  return { candidate, record, uiKey, expectedEditorText, expectedViewerText, symbolIds };
});
const expectedSymbolIds = checks.flatMap(check => check.symbolIds).sort();

const requests = [];
const blockedRequests = [];
const consoleErrors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    requests.push({ method, path: url.pathname });
    if (url.origin !== apiOrigin || method !== 'GET') {
      blockedRequests.push({ method, path: url.pathname });
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/api/translations') {
      let docs = records;
      const language = url.searchParams.get('where[language][equals]');
      if (language) docs = docs.filter(record => record.language === language);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    if (url.pathname === '/api/symbol-alias-settings') {
      const docs = snapshot.symbolAliasSettings ?? [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    if (url.pathname === '/api/layout-frames') {
      const docs = snapshot.layoutFrames ?? [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    return route.continue();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('46');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '46'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_046/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, undefined, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');

  const viewerText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = checks.map(check => ({
    spanKey: check.record.spanKey,
    visible: viewerText.includes(normalize(check.expectedViewerText)),
  }));
  assert.ok(viewerChecks.every(check => check.visible), 'Viewer did not display every p.46 proposal record.');
  const initialSymbolIds = await page.locator('.page-container [data-symbol-id]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-symbol-id')).filter(Boolean).sort());
  assert.deepEqual(initialSymbolIds, expectedSymbolIds, 'Viewer symbol IDs do not match the isolated proposal.');
  const viewerScreenshotPath = resolve(proofDir, 'page-046-pt-BR-editor-preview-v2.png');
  await page.screenshot({ path: viewerScreenshotPath, fullPage: true });

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  const symbolCycles = [];
  for (const check of checks) {
    const target = page.locator(`[data-editable-unit-key="${check.uiKey}"]`);
    assert.equal(await target.count(), 1, `${check.record.spanKey} must map to exactly one Editor target.`);
    await target.click({ force: true });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = page.locator('textarea').last();
    await textarea.waitFor({ state: 'visible' });
    const actual = normalize(await textarea.inputValue());
    assert.equal(actual, normalize(check.expectedEditorText), `Editor text mismatch for ${check.record.spanKey}.`);
    assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), `${check.record.spanKey} is not editable.`);

    for (const symbolId of check.symbolIds) {
      const token = `[[${aliases[symbolId]}]]`;
      const initialText = await textarea.inputValue();
      assert.ok(initialText.includes(token), `Editor token ${token} missing from ${check.record.spanKey}.`);
      const symbolSelector = `.page-container [data-symbol-id="${symbolId}"]`;
      const baseline = await page.locator(symbolSelector).count();
      assert.equal(baseline, 1, `Expected exactly one ${symbolId} before editing.`);
      await textarea.fill(initialText.replace(token, ''));
      await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count - 1, { selector: symbolSelector, count: baseline });
      const undo = page.getByRole('button', { name: 'Desfazer' });
      assert.equal(await undo.isDisabled(), false, 'Undo was not enabled after symbol removal.');
      await undo.click();
      await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: symbolSelector, count: baseline });
      assert.equal(normalize(await textarea.inputValue()), normalize(initialText), 'Undo did not restore the symbol token.');
      const redo = page.getByRole('button', { name: 'Refazer' });
      assert.equal(await redo.isDisabled(), false, 'Redo was not enabled after Undo.');
      await redo.click();
      await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count - 1, { selector: symbolSelector, count: baseline });
      await textarea.fill(initialText);
      await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: symbolSelector, count: baseline });
      symbolCycles.push({ spanKey: check.record.spanKey, symbolId, removed: true, undoRestored: true, redoRemoved: true, reinsertedOnce: true });
    }

    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    editorChecks.push({ spanKey: check.record.spanKey, uiKey: check.uiKey, proposalMatched: true, editable: true, cancelled: true });
  }

  const finalSymbolIds = await page.locator('.page-container [data-symbol-id]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-symbol-id')).filter(Boolean).sort());
  assert.deepEqual(finalSymbolIds, initialSymbolIds, 'Cancel did not restore the original proposal symbol.');
  const payloadAfter = await readPayloadP46();
  assert.deepEqual(payloadAfter, payloadBefore, 'Payload page 46 changed during read-only Editor verification.');
  assert.equal(blockedRequests.length, 0, 'The app attempted a non-GET API request.');
  const pageHashesAfter = {};
  for (const name of Object.keys(pageHashesBefore)) pageHashesAfter[name] = await hashFile(resolve(pageDir, name));
  assert.deepEqual(pageHashesAfter, pageHashesBefore, 'Canonical p.46 files changed during verification.');

  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 46,
    method: 'Normal Viewer/Admin; immutable proposal served only through intercepted GET API responses; all non-GET API calls blocked.',
    candidateCount: checks.length,
    viewer: { allCandidatesVisible: viewerChecks.every(check => check.visible), checks: viewerChecks, initialSymbolIds },
    editor: {
      allCandidatesMatchedAndEditable: editorChecks.length === 12 && editorChecks.every(check => check.proposalMatched && check.editable),
      cancelClosedEveryDraft: editorChecks.every(check => check.cancelled),
      checks: editorChecks,
    },
    symbols: { cycles: symbolCycles, finalSymbolIds },
    payloadPage46PtBrRecordsBeforeAndAfter: { before: payloadBefore, after: payloadAfter },
    blockedNonGetApiRequests: blockedRequests,
    observedApiMethods: [...new Set(requests.map(request => request.method))],
    consoleErrors,
    canonicalPageHashesBefore: pageHashesBefore,
    canonicalPageHashesAfter: pageHashesAfter,
    canonicalPageFilesUnchanged: true,
    viewerScreenshotPath,
    saveClicked: false,
    note: 'This verifies the 12 isolated proposal records in the existing app Editor; Cancel was tested for every candidate. The payload currently has no p.46 PT-BR records and remained unchanged.'
  };
  const receiptPath = resolve(proofDir, 'editor-readonly-receipt-v2.json');
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: String(error), blockedRequests, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
