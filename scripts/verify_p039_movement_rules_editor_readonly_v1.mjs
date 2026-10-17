import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p039-movement-rules-v2');
const pageDir = resolve(root, 'apps/web/public/pages/page_039');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_WEB_URL ?? 'http://127.0.0.1:8080';
const apiOrigin = new URL(apiUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const hashFile = async path => sha(await readFile(path));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

const manifest = await readJson(resolve(proofDir, 'source-hashes-v2.json'));
const proposal = await readJson(resolve(root, 'docs/translations/proposals/page-039-movement-rules-proposal-2026-10-15.json'));
const snapshot = await readJson(resolve(proofDir, 'snapshot/snapshot-movement-rules-v2-export.json'));
assert.equal(proposal.page, 39);
assert.equal(proposal.status, 'isolated-proposal-pending-human-review');
assert.equal(proposal.translations.length, 22);
assert.equal(snapshot.translations.length, 22);
assert.equal(new Set(proposal.translationKeys).size, 22);
assert.deepEqual(new Set(snapshot.translations.map(record => record.spanKey)), new Set(proposal.translationKeys));
assert.deepEqual(snapshot.symbolAliasSettings ?? [], [], 'Snapshot expects default editor symbol aliases');

const before = {};
for (const [name, expected] of Object.entries(manifest.pageAssets)) {
  before[name] = await hashFile(resolve(pageDir, name));
  assert.equal(before[name], expected, `Canonical p.39 asset changed since the proposal: ${name}`);
}
const sourcePdf = await readFile(manifest.sourcePdf.path);
assert.equal(sha(sourcePdf), manifest.sourcePdf.sha256, 'Official source PDF changed');

const editorAliases = {
  'terrain.red-border': 'red-terrain-border',
  'tag.important.icon': 'lightning',
};
const displayText = record => record.data.segments.map(segment => segment.text).join('');
const editorText = record => {
  const symbols = [...(record.data.managedSourceSymbols ?? [])];
  let symbolIndex = 0;
  const result = record.data.segments.map(segment => segment.text.replace(/\uFFFC/gu, () => {
    const id = symbols[symbolIndex++];
    assert.ok(id && editorAliases[id], `No default Editor alias recorded for symbol ${id}`);
    return `[[${editorAliases[id]}]]`;
  })).join('');
  assert.equal(symbolIndex, symbols.length, `${record.spanKey} symbol metadata does not match its marker count`);
  return result;
};
const recordByKey = new Map(snapshot.translations.map(record => [record.spanKey, record]));
const checks = proposal.translations.map(candidate => {
  const record = recordByKey.get(candidate.spanKey);
  assert.ok(record, `Snapshot is missing ${candidate.spanKey}`);
  const hasSymbol = (record.data.managedSourceSymbols ?? []).length > 0;
  const uiKey = candidate.spanKey.startsWith('page_39_block_')
    ? candidate.spanKey.replace(/__pt-BR$/u, '')
    : candidate.spanKey;
  return { record, uiKey, hasSymbol, display: displayText(record), editor: editorText(record) };
});

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadP39 = async () => {
  const response = await fetch(translationsUrl);
  assert.ok(response.ok, `Payload read failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_39_'))
    .map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt }));
};
const payloadBefore = await readPayloadP39();
assert.deepEqual(payloadBefore, [], 'A PT-BR p.39 record already exists; do not alter it');

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
      let docs = snapshot.translations;
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
    return route.continue();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('39');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '39'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_039/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, undefined, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await page.waitForFunction(() => document.querySelectorAll('.page-container [data-symbol-id]').length === 4, undefined, { timeout: 15000 });

  const viewerText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = checks.map(check => ({
    spanKey: check.record.spanKey,
    visible: viewerText.includes(normalize(check.display.replace(/\uFFFC/gu, ''))),
  }));
  assert.ok(viewerChecks.every(item => item.visible), 'Viewer did not display every proposal text unit');
  const initialSymbols = await page.locator('.page-container [data-symbol-id]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-symbol-id')));
  assert.equal(initialSymbols.filter(id => id === 'terrain.red-border').length, 1);
  assert.equal(initialSymbols.filter(id => id === 'tag.important.icon').length, 3);
  await page.screenshot({ path: resolve(proofDir, 'normal-viewer-p039-pt-BR-snapshot-overlay-v1.png'), fullPage: true });

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  const symbolCycleChecks = [];
  for (const check of checks) {
    const { record, uiKey, editor: expected, hasSymbol } = check;
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
    assert.equal(await target.count(), 1, `${record.spanKey} must map to one Editor target`);
    await target.click({ force: true });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = page.locator('textarea').last();
    await textarea.waitFor({ state: 'visible' });
    assert.equal(normalize(await textarea.inputValue()), normalize(expected), `Editor mismatch for ${record.spanKey}`);
    assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), `${record.spanKey} is not editable`);

    if (hasSymbol) {
      const marker = expected.match(/\[\[[^\]]+\]\]/u)?.[0];
      assert.ok(marker, `Missing editor token for ${record.spanKey}`);
      const symbolId = record.data.managedSourceSymbols[0];
      const countSymbol = () => page.locator(`.page-container [data-symbol-id="${symbolId}"]`).count();
      const baseline = await countSymbol();
      assert.ok(baseline > 0, `Expected visible ${symbolId} before edit`);
      const without = expected.replace(marker, '');
      await textarea.fill(without);
      await page.waitForFunction(({ id, count }) => document.querySelectorAll(`.page-container [data-symbol-id="${id}"]`).length === count - 1,
        { id: symbolId, count: baseline });
      const undo = page.getByRole('button', { name: 'Desfazer' });
      assert.equal(await undo.isDisabled(), false, `Undo was not enabled after removing ${symbolId}`);
      await undo.click();
      await page.waitForFunction(({ id, count }) => document.querySelectorAll(`.page-container [data-symbol-id="${id}"]`).length === count,
        { id: symbolId, count: baseline });
      assert.equal(normalize(await textarea.inputValue()), normalize(expected), `Undo did not restore ${symbolId} text`);
      const redo = page.getByRole('button', { name: 'Refazer' });
      assert.equal(await redo.isDisabled(), false, `Redo was not enabled after undoing ${symbolId}`);
      await redo.click();
      await page.waitForFunction(({ id, count }) => document.querySelectorAll(`.page-container [data-symbol-id="${id}"]`).length === count - 1,
        { id: symbolId, count: baseline });
      await textarea.fill(expected);
      await page.waitForFunction(({ id, count }) => document.querySelectorAll(`.page-container [data-symbol-id="${id}"]`).length === count,
        { id: symbolId, count: baseline });
      symbolCycleChecks.push({ spanKey: record.spanKey, symbolId, removed: true, undoRestored: true, redoRemoved: true, reinsertedOnce: true });
    }

    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    editorChecks.push({ spanKey: record.spanKey, uiKey, proposalMatched: true, editable: true, cancelled: true });
  }

  const finalSymbols = await page.locator('.page-container [data-symbol-id]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-symbol-id')));
  assert.deepEqual(finalSymbols.sort(), [...initialSymbols].sort(), 'Cancel did not restore all p.39 symbols');
  const payloadAfter = await readPayloadP39();
  assert.deepEqual(payloadAfter, [], 'Read-only Editor check created or changed a p.39 PT-BR record');
  assert.equal(blockedRequests.length, 0, 'A non-GET API request was attempted');
  const after = {};
  for (const name of Object.keys(before)) after[name] = await hashFile(resolve(pageDir, name));
  assert.deepEqual(after, before, 'Canonical p.39 assets changed during Editor check');

  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 39,
    method: 'Normal Viewer/Admin UI; immutable proposal supplied only by intercepted GET /api/translations',
    candidateCount: checks.length,
    viewer: { allProposalUnitsVisible: viewerChecks.every(item => item.visible), checks: viewerChecks },
    editor: {
      allProposalTextsMatchedEditableFields: editorChecks.length === 22 && editorChecks.every(item => item.proposalMatched && item.editable),
      cancelRestoredEveryUnit: editorChecks.every(item => item.cancelled),
      checks: editorChecks,
    },
    symbols: { initialIds: initialSymbols, cycles: symbolCycleChecks, finalIds: finalSymbols },
    payloadPtBrRecordsBeforeAndAfter: { before: payloadBefore, after: payloadAfter },
    blockedNonGetApiRequests: blockedRequests,
    observedApiMethods: [...new Set(requests.map(request => request.method))],
    consoleErrors,
    sourcePdfSha256: manifest.sourcePdf.sha256,
    canonicalPageHashesBefore: before,
    canonicalPageHashesAfter: after,
    canonicalPageFilesUnchanged: true,
    saveClicked: false,
    note: 'All 22 draft fields were supplied by a browser-only immutable snapshot overlay. Four symbol placements were removed, undo/redo tested and reinserted once before Cancel; no PT-BR record was persisted.',
  };
  const receiptPath = resolve(proofDir, 'editor-readonly-receipt-v1.json');
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: String(error), blockedRequests, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
