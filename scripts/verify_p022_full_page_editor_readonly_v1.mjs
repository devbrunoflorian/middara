#!/usr/bin/env node
/** Read-only p.22 Viewer/Admin Editor check for visible v7 proposal units. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 22;
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p022-full-page-proposal-v9');
const proposalPath = resolve(root, 'docs/translations/proposals/page-022-full-page-proposal-2026-10-16-v9.json');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot.json');
const receiptPath = resolve(proofDir, 'editor-readonly-receipt-v1.json');
const screenshotPath = resolve(proofDir, 'editor-readonly-v1.png');
const pageAssetDir = resolve(root, 'apps/web/public/pages/page_022');
const assetNames = ['page_022_dom.json', 'background.webp', 'inline_elements.json', 'layout_frames.json', 'inline-element-mask-000.png', 'inline-element-mask-001.png'];
const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadOrigin = new URL(payloadUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\[\[[^\]]+\]\]/gu, ' ').replace(/[\uFFFC\uFFFD]/gu, ' ').replace(/\s+/gu, ' ').trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const candidates = proposal.candidates.filter(candidate => candidate.diagnosticRendering === 'proposal');
const records = snapshot.translations ?? [];
assert.equal(candidates.length, 4);
assert.equal(records.length, 5);

const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadPageRecords = async () => {
  const response = await fetch(translationsUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_22_'));
};
const payloadBefore = await readPayloadPageRecords();
assert.equal(payloadBefore.length, 0, 'A saved page-22 PT-BR record appeared after proposal preflight.');
const beforeAssets = {};
for (const name of assetNames) beforeAssets[name] = digest(await readFile(resolve(pageAssetDir, name)));

const requests = [];
const blockedMutations = [];
const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/pages/page_022/page_022_dom.json', async route => {
    await route.fulfill({ path: resolve(proofDir, 'snapshot/pages/page_022/page_022_dom.json') });
  });
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
    await route.continue();
  });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  await page.locator('input.page-input').fill('22');
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '22' && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_022/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  const viewerText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = candidates.map(candidate => ({ spanKey: candidate.spanKey, visible: viewerText.includes(normalize(candidate.proposalText)) }));
  assert.ok(viewerChecks.every(check => check.visible), `Viewer omitted candidate text: ${JSON.stringify(viewerChecks.filter(check => !check.visible))}`);
  await page.screenshot({ path: resolve(proofDir, 'viewer-pt-BR-v9-rechecked.png'), fullPage: false });
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  for (const candidate of candidates) {
    const uiKey = candidate.spanKey.replace(/__pt-BR$/u, '');
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
    assert.equal(await target.count(), 1, `${uiKey} must map to one Editor selection target.`);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert.ok(box, `No Editor target box for ${uiKey}`);
    let selected = false;
    for (const position of [{ x: box.width / 2, y: box.height / 2 }, { x: box.width - 3, y: box.height / 2 }, { x: 3, y: box.height / 2 }]) {
      await target.click({ force: true, position });
      await page.waitForTimeout(60);
      selected = await target.evaluate(element => element.matches('.credit-field-selected, .block-selected, .span-selected'));
      if (selected) break;
    }
    assert.ok(selected, `${uiKey} did not select in Admin Editor.`);
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor({ state: 'visible' });
    assert.equal(normalize(await editor.inputValue()), normalize(candidate.proposalText), `Editor content mismatch for ${uiKey}`);
    assert.ok(await editor.evaluate(element => !element.disabled && !element.readOnly), `${uiKey} is not editable.`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
    await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    editorChecks.push({ spanKey: candidate.spanKey, uiKey, selected: true, proposalMatched: true, editable: true, cancelled: true });
  }
  assert.deepEqual(blockedMutations, []);
  assert.deepEqual(pageErrors, []);
  const payloadAfter = await readPayloadPageRecords();
  assert.deepEqual(payloadAfter, payloadBefore);
  const afterAssets = {};
  for (const name of assetNames) afterAssets[name] = digest(await readFile(resolve(pageAssetDir, name)));
  assert.deepEqual(afterAssets, beforeAssets);
  const receipt = {
    status: 'passed-readonly-viewer-editor-cancel-for-four-visible-units', page: pageNumber, locale: 'pt-BR',
    proposalSha256: digest(await readFile(proposalPath)), candidateCount: candidates.length,
    viewerChecks, editorChecks, intentionallyBlankBlock: 'page_22_block_2__pt-BR',
    snapshotSourceDomUsed: resolve(proofDir, 'snapshot/pages/page_022/page_022_dom.json'),
    payload: { beforeCount: payloadBefore.length, afterCount: payloadAfter.length, unchanged: true },
    observedApiMethods: [...new Set(requests.map(request => request.method))], blockedMutations,
    consoleErrors, pageErrors, canonicalAssetsUnchanged: true, saveClicked: false,
    screenshots: { viewer: resolve(proofDir, 'viewer-pt-BR-v9-rechecked.png'), editor: screenshotPath },
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); }

