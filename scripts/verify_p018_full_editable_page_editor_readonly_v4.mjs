#!/usr/bin/env node
/** Verify p.18 proposal visibility, Editor identity, Cancel/reopen, and local undo/redo without saving. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 18;
const pageId = '018';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v4-reconciled');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot.json');
const proposalPath = resolve(proofDir, 'proposal-candidates.json');
const sourceHashesPath = resolve(proofDir, 'source-hashes.json');
const receiptPath = resolve(proofDir, 'editor-readonly-receipt-v4-reconciled.json');
const viewerScreenshotPath = resolve(proofDir, 'admin-viewer-full-v4-reconciled.png');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const apiOrigin = new URL(apiUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const sourceHashes = JSON.parse(await readFile(sourceHashesPath, 'utf8'));
const candidates = proposal.candidates;
const records = snapshot.translations ?? [];
assert.equal(candidates.length, 29);
assert.equal(records.length, 29);
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, 29);
assert.deepEqual(new Set(records.map(record => record.spanKey)), new Set(candidates.map(candidate => candidate.spanKey)));

const pageDir = resolve(root, 'apps/web/public/pages', `page_${pageId}`);
const currentHashes = {};
for (const name of Object.keys(sourceHashes.pageAssets).sort()) {
  currentHashes[name] = digest(await readFile(resolve(pageDir, name)));
  assert.equal(currentHashes[name], sourceHashes.pageAssets[name], `Canonical p.18 asset changed: ${name}`);
}

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPageRecords = async () => {
  const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Read-only Payload GET failed: ${response.status}`);
  const payload = await response.json();
  assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload baseline is paginated.');
  return (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_18_'));
};
const payloadBefore = await readPageRecords();
assert.equal(payloadBefore.length, 0, 'A PT-BR p.18 record already exists; stop before opening the proof.');

const requests = [];
const blockedWrites = [];
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
    requests.push({ method, origin: url.origin, path: url.pathname });
    if (url.origin !== apiOrigin || method !== 'GET') {
      blockedWrites.push({ method, origin: url.origin, path: url.pathname });
      await route.abort('blockedbyclient');
      return;
    }
    if (url.pathname === '/api/translations') {
      const language = url.searchParams.get('where[language][equals]');
      const docs = language ? records.filter(record => record.language === language) : records;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: 5000, hasNextPage: false }),
      });
      return;
    }
    if (url.pathname === '/api/layout-frames') {
      const requestedPage = Number(url.searchParams.get('where[and][0][pageNumber][equals]') ?? url.searchParams.get('where[pageNumber][equals]'));
      const language = url.searchParams.get('where[and][1][language][equals]') ?? url.searchParams.get('where[language][equals]');
      const docs = (snapshot.layoutFrames ?? []).filter(frame =>
        (!Number.isFinite(requestedPage) || Number(frame.pageNumber) === requestedPage)
        && (!language || frame.language === language));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: docs.length }),
      });
      return;
    }
    if (url.pathname === '/api/symbol-alias-settings') {
      const docs = snapshot.symbolAliasSettings ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: docs.length }),
      });
      return;
    }
    await route.continue();
  });

  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  await page.locator('input.page-input').fill(String(pageNumber));
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '18'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_018/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');

  const visibleText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = candidates.map(candidate => ({
    spanKey: candidate.spanKey,
    visible: visibleText.includes(normalize(candidate.proposalText)),
  }));
  assert.ok(viewerChecks.every(check => check.visible), `Viewer omitted candidates: ${JSON.stringify(viewerChecks.filter(check => !check.visible))}`);

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  await page.screenshot({ path: viewerScreenshotPath, fullPage: true });

  const editorChecks = [];
  const roundTripKey = 'page_18_block_101__pt-BR';
  for (const candidate of candidates) {
    const uiKey = candidate.spanKey.startsWith('page_18_block_')
      ? candidate.spanKey.replace(/__pt-BR$/u, '')
      : candidate.spanKey;
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
    assert.equal(await target.count(), 1, `${candidate.spanKey} should map to one Editor target (${uiKey})`);
    await target.click({ force: true });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor({ state: 'visible' });
    const rawText = await editor.inputValue();
    const actual = normalize(rawText.replace(/\[\[[^\]]+\]\]/gu, '').replace(/\uFFFC/gu, ''));
    const expected = normalize(candidate.proposalText);
    assert.equal(actual, expected, `Editor text differs from proposal for ${candidate.spanKey}`);
    assert.ok(await editor.evaluate(element => !element.disabled && !element.readOnly), `${candidate.spanKey} is not editable`);

    if (candidate.spanKey === roundTripKey) {
      const changed = `${rawText} teste`;
      await editor.fill(changed);
      await page.waitForFunction(expectedValue => document.querySelector('.rse-edit-text textarea')?.value === expectedValue, changed);
      const undo = page.getByRole('button', { name: 'Desfazer' }).last();
      const redo = page.getByRole('button', { name: 'Refazer' }).last();
      assert.equal(await undo.isDisabled(), false, 'Undo did not enable after a local edit.');
      await undo.click();
      assert.equal(await editor.inputValue(), rawText, 'Undo did not restore the original editor text.');
      assert.equal(await redo.isDisabled(), false, 'Redo did not enable after Undo.');
      await redo.click();
      assert.equal(await editor.inputValue(), changed, 'Redo did not restore the local edit.');
      await undo.click();
      assert.equal(await editor.inputValue(), rawText, 'Second Undo did not restore the original text.');
    }

    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    editorChecks.push({ spanKey: candidate.spanKey, uiKey, proposalMatched: true, editable: true, textEditCancelled: true });
  }

  const roundTripCandidate = candidates.find(candidate => candidate.spanKey === roundTripKey);
  const roundTripTarget = page.locator('[data-editable-unit-key="page_18_block_101"]');
  await roundTripTarget.click({ force: true });
  await page.getByRole('button', { name: '📝 Edit Text' }).click();
  const reopenedEditor = page.locator('.rse-edit-text textarea').last();
  await reopenedEditor.waitFor({ state: 'visible' });
  const reopenedText = normalize((await reopenedEditor.inputValue()).replace(/\[\[[^\]]+\]\]/gu, '').replace(/\uFFFC/gu, ''));
  assert.equal(reopenedText, normalize(roundTripCandidate.proposalText), 'Reopening after Cancel did not preserve the original snapshot text.');
  await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
  await page.locator('.rse-close').click();
  await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));

  assert.deepEqual(blockedWrites, [], `A mutation request was attempted: ${JSON.stringify(blockedWrites)}`);
  const payloadAfter = await readPageRecords();
  assert.deepEqual(payloadAfter, [], 'The Editor proof created or changed a p.18 Payload record.');
  const afterHashes = {};
  for (const name of Object.keys(sourceHashes.pageAssets).sort()) {
    afterHashes[name] = digest(await readFile(resolve(pageDir, name)));
  }
  assert.deepEqual(afterHashes, currentHashes, 'Canonical p.18 assets changed during the Editor proof.');

  const receipt = {
    status: 'passed-readonly-viewer-editor-cancel-reopen-undo-redo',
    page: pageNumber,
    locale: 'pt-BR',
    candidateCount: candidates.length,
    viewer: { allCandidatesVisible: viewerChecks.every(check => check.visible), checks: viewerChecks },
    editor: {
      allCandidatesMatchedAndEditable: editorChecks.length === 29 && editorChecks.every(check => check.proposalMatched && check.editable),
      allTextEditsCancelled: editorChecks.every(check => check.textEditCancelled),
      undoRedoSampleKey: roundTripKey,
      reopenedAfterCancelMatchesSnapshot: true,
      checks: editorChecks,
    },
    payloadPtBrRecordsBeforeAndAfter: { before: payloadBefore, after: payloadAfter },
    blockedMutationRequests: blockedWrites,
    observedApiMethods: [...new Set(requests.map(request => request.method))],
    consoleErrors,
    canonicalPageAssetsBeforeAndAfter: { before: currentHashes, after: afterHashes },
    saveClicked: false,
    screenshot: viewerScreenshotPath,
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed-readonly-editor-proof', error: String(error), blockedWrites, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
