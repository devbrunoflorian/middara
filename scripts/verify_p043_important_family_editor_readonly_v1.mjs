#!/usr/bin/env node
/** Verify the three isolated p.43 IMPORTANT proposals in the normal Viewer/Admin without writes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/important-family-validation-2026-10-15/p043-combined-v1');
const pageDir = resolve(root, 'apps/web/public/pages/page_043');
const snapshot = JSON.parse(await readFile(resolve(proofDir, 'snapshot/snapshot-p043-important-family-v1.json'), 'utf8'));
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_WEB_URL ?? 'http://127.0.0.1:8080';
const apiOrigin = new URL(apiUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const hashFiles = async () => Object.fromEntries(await Promise.all((await readdir(pageDir)).sort().map(async name => {
  const path = resolve(pageDir, name);
  if (!(await stat(path)).isFile()) return [name, null];
  return [name, hash(await readFile(path))];
})));

const expected = new Map([
  ['page_43_block_6__pt-BR', 'IMPORTANTE: Se um Aventureiro equipar 2 Armas de Longo Alcance diferentes, com 2 Valores de Alcance diferentes, só poderá atacar alvos usando o menor dos dois valores.'],
  ['page_43_block_9__pt-BR', 'IMPORTANTE: Ao contrário do movimento, todos os tipos de Alcance são contados na diagonal e na ortogonal.'],
  ['page_43_block_31__pt-BR', 'IMPORTANTE: Uma Ação de Ataque exige que o alvo do Ataque esteja dentro do Alcance e da Linha de Visão.'],
]);
assert.equal(snapshot.translations.length, 3);
assert.deepEqual(new Set(snapshot.translations.map(record => record.spanKey)), new Set(expected.keys()));
assert.ok(snapshot.translations.every(record => record.language === 'pt-BR' && record.spanKey.endsWith('__pt-BR') && !record.spanKey.includes('__en')));
for (const record of snapshot.translations) {
  const plain = record.data.segments.filter(segment => !segment.symbolId).map(segment => segment.text).join('');
  assert.equal(plain, expected.get(record.spanKey), `Wrong candidate text for ${record.spanKey}`);
  assert.equal(record.data.managedSourceSymbols.filter(id => id === 'tag.important.icon').length, 1);
}

const canonicalBefore = await hashFiles();
const payloadUrl = new URL('/api/translations', apiUrl);
payloadUrl.searchParams.set('where[language][equals]', 'pt-BR');
payloadUrl.searchParams.set('limit', '5000');
const keys = [...expected.keys()];
const readPayload = async () => {
  const response = await fetch(payloadUrl);
  assert.ok(response.ok, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(doc => keys.includes(doc.spanKey)).map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt }));
};
const payloadBefore = await readPayload();
assert.deepEqual(payloadBefore, [], 'A PT-BR canonical record already exists for a target key; stop without changing it');

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
    requests.push({ method, url: request.url() });
    if (url.origin !== apiOrigin || method !== 'GET') {
      blockedRequests.push({ method, url: request.url() });
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/api/translations') {
      const language = url.searchParams.get('where[language][equals]');
      const docs = language ? snapshot.translations.filter(record => record.language === language) : snapshot.translations;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    if (url.pathname === '/api/symbol-alias-settings') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ docs: [], totalDocs: 0, limit: 0, page: 1, totalPages: 1 }) });
    }
    return route.continue();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('43');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '43'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_043/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await page.waitForFunction(() => document.querySelectorAll('.page-container [data-symbol-id="tag.important.icon"]').length === 3, { timeout: 15000 });
  const viewerText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = [...expected].map(([spanKey, text]) => ({ spanKey, visible: viewerText.includes(normalize(text)) }));
  assert.ok(viewerChecks.every(check => check.visible), 'Normal Viewer did not show all three PT-BR proposals');
  await page.screenshot({ path: resolve(proofDir, 'normal-admin-viewer-p043-pt-BR-combined.png'), fullPage: true });

  const initialSymbols = await page.locator('.page-container [data-symbol-id]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-symbol-id')));
  assert.equal(initialSymbols.filter(id => id === 'tag.important.icon').length, 3);
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');

  const editorChecks = [];
  const symbolCycles = [];
  for (const record of snapshot.translations) {
    const spanKey = record.spanKey;
    const uiKey = spanKey.replace(/__pt-BR$/u, '');
    const aliasById = { 'tag.important.icon': 'lightning' };
    let symbolIndex = 0;
    const editorExpected = record.data.segments.map(segment => segment.text.replace(/\uFFFC/gu, () => {
      const id = record.data.managedSourceSymbols[symbolIndex++];
      assert.ok(id && aliasById[id], `Missing Editor alias for ${id}`);
      return `[[${aliasById[id]}]]`;
    })).join('');
    assert.equal(symbolIndex, record.data.managedSourceSymbols.length);
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
    assert.equal(await target.count(), 1, `${uiKey} must resolve to one normal Editor unit`);
    await target.click({ force: true });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = page.locator('textarea').last();
    await textarea.waitFor({ state: 'visible' });
    assert.equal(normalize(await textarea.inputValue()), normalize(editorExpected), `${spanKey} did not hydrate exact PT-BR text`);
    assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), `${spanKey} is not editable`);

    const countSymbols = () => page.locator('.page-container [data-symbol-id="tag.important.icon"]').count();
    const baseline = await countSymbols();
    assert.equal(baseline, 3);
    await textarea.fill(editorExpected.replace('[[lightning]]', ''));
    await page.waitForFunction(count => document.querySelectorAll('.page-container [data-symbol-id="tag.important.icon"]').length === count - 1, baseline);
    const undo = page.getByRole('button', { name: 'Desfazer' });
    assert.equal(await undo.isDisabled(), false);
    await undo.click();
    await page.waitForFunction(count => document.querySelectorAll('.page-container [data-symbol-id="tag.important.icon"]').length === count, baseline);
    assert.equal(normalize(await textarea.inputValue()), normalize(editorExpected));
    const redo = page.getByRole('button', { name: 'Refazer' });
    assert.equal(await redo.isDisabled(), false);
    await redo.click();
    await page.waitForFunction(count => document.querySelectorAll('.page-container [data-symbol-id="tag.important.icon"]').length === count - 1, baseline);
    await textarea.fill(editorExpected);
    await page.waitForFunction(count => document.querySelectorAll('.page-container [data-symbol-id="tag.important.icon"]').length === count, baseline);
    assert.equal(await countSymbols(), baseline, `${spanKey} reinsertion duplicated or lost the symbol`);
    symbolCycles.push({ spanKey, symbolId: 'tag.important.icon', removed: true, undoRestored: true, redoRemoved: true, reinsertedOnce: true });

    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    assert.equal(await countSymbols(), 3, `${spanKey} Cancel did not restore its source symbol`);
    editorChecks.push({ spanKey, uiKey, candidateMatched: true, editable: true, cancelled: true });
  }

  const finalSymbols = await page.locator('.page-container [data-symbol-id]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-symbol-id')));
  assert.deepEqual(finalSymbols.sort(), [...initialSymbols].sort(), 'Final symbol state differs from initial state');
  await pageInput.fill('42');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '42');
  await pageInput.fill('43');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '43'
    && document.querySelectorAll('.page-container [data-symbol-id="tag.important.icon"]').length === 3);
  const payloadAfter = await readPayload();
  assert.deepEqual(payloadAfter, [], 'A canonical p.43 translation record appeared during read-only Editor validation');
  assert.equal(blockedRequests.length, 0, 'A non-GET API request was attempted');
  assert.deepEqual(await hashFiles(), canonicalBefore, 'Canonical p.43 page files changed during validation');
  assert.equal(consoleErrors.length, 0, `Viewer/Admin console errors: ${consoleErrors.join('; ')}`);

  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 43,
    viewer: { host: pageOrigin, apiOrigin, locale: 'pt-BR', mode: 'normal PageRenderer with immutable snapshot delivered only by intercepted GET' },
    viewerChecks,
    editorChecks,
    symbolCycles,
    finalSymbols,
    payloadTargetKeysBefore: payloadBefore,
    payloadTargetKeysAfter: payloadAfter,
    apiMethods: [...new Set(requests.map(request => request.method))],
    blockedNonGetRequests: blockedRequests,
    consoleErrors,
    canonicalPageHashesUnchanged: true,
    saveClicked: false,
    limitations: ['No Save, persistence, or post-save reload was attempted; proposal remains isolated and awaits human terminology review.'],
  };
  const receiptPath = resolve(proofDir, 'normal-editor-readonly-receipt-v1.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: String(error), blockedRequests, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
