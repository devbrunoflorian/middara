#!/usr/bin/env node
/** Read-only normal Viewer/Admin proof for the isolated p.48 v3 proposal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p048-full-editable-text-v3-corrected');
const pageDir = resolve(root, 'apps/web/public/pages/page_048');
const snapshotPageDir = resolve(proofDir, 'snapshot/pages/page_048');
const snapshot = JSON.parse(await readFile(resolve(proofDir, 'snapshot/snapshot.json'), 'utf8'));
const proposal = JSON.parse(await readFile(resolve(root, 'docs/translations/proposals/page-048-full-editable-text-proposal-2026-10-15-v3-corrected.json'), 'utf8'));
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_WEB_URL ?? 'http://127.0.0.1:8080';
const apiOrigin = new URL(apiUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const aliasMap = snapshot.symbolAliasSettings?.[0]?.aliases ?? {};
const targetKeys = new Set(proposal.units.map(unit => unit.spanKey));
const expectedSymbols = ['attack.melee', 'attack.ranged', 'attack.melee', 'attack.melee', 'attack.melee', 'attack.melee'];
assert.equal(proposal.units.length, 15);
assert.equal(snapshot.translations.length, 15);
assert.equal(snapshot.assetPages.includes(48), true);

async function listFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(path));
    else if (entry.isFile()) output.push(path);
  }
  return output.sort();
}

async function canonicalPageHashes() {
  const files = await listFiles(pageDir);
  return Object.fromEntries(await Promise.all(files.map(async path => [relative(pageDir, path), sha(await readFile(path))])));
}

async function readPayloadTargetRecords() {
  const url = new URL('/api/translations', apiUrl);
  url.searchParams.set('where[language][equals]', 'pt-BR');
  url.searchParams.set('limit', '5000');
  const response = await fetch(url);
  assert.ok(response.ok, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(record => targetKeys.has(record.spanKey))
    .map(record => ({ id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt }));
}

const canonicalBefore = await canonicalPageHashes();
const payloadBefore = await readPayloadTargetRecords();
assert.deepEqual(payloadBefore, [], 'A canonical PT-BR record exists for a p.48 proposal key; stop before Editor interaction');

const requests = [];
const blockedRequests = [];
const consoleErrors = [];
const pageAssets = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});

function editorText(record) {
  let symbolIndex = 0;
  const text = record.data.segments.map(segment => segment.text.replace(/\uFFFC/gu, () => {
    const symbolId = record.data.managedSourceSymbols[symbolIndex++];
    const alias = aliasMap[symbolId];
    assert.ok(alias, `Editor alias missing for ${symbolId} in ${record.spanKey}`);
    return `[[${alias}]]`;
  })).join('');
  assert.equal(symbolIndex, record.data.managedSourceSymbols.length, `Unmatched semantic symbols in ${record.spanKey}`);
  return text;
}

async function pageSymbols(page) {
  return page.locator('.page-container [data-symbol-id]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-symbol-id')));
}

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
      const docs = snapshot.symbolAliasSettings ?? [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    if (url.pathname === '/api/layout-frames') {
      const docs = (snapshot.layoutFrames ?? []).filter(frame => frame.pageNumber === 48);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    return route.continue();
  });

  await context.route('**/pages/page_048/**', async route => {
    const url = new URL(route.request().url());
    const prefix = '/pages/page_048/';
    if (!url.pathname.startsWith(prefix)) return route.continue();
    const requested = decodeURIComponent(url.pathname.slice(prefix.length));
    const relativePath = requested.split('/').join(sep);
    const safeRelative = relative(snapshotPageDir, resolve(snapshotPageDir, relativePath));
    if (safeRelative.startsWith(`..${sep}`) || safeRelative === '..') return route.abort('blockedbyclient');
    let assetPath = resolve(snapshotPageDir, relativePath);
    try { await stat(assetPath); }
    catch { assetPath = resolve(pageDir, relativePath); }
    try {
      const bytes = await readFile(assetPath);
      const mime = ({ '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[extname(assetPath).toLowerCase()] ?? 'application/octet-stream';
      pageAssets.push({ path: relativePath, source: assetPath.startsWith(snapshotPageDir) ? 'isolated-snapshot' : 'canonical-static-asset' });
      await route.fulfill({ status: 200, contentType: mime, body: bytes });
    } catch {
      await route.continue();
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('48');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '48'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_048/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await page.locator('button[title="Fit to Screen"]').click();
  await page.waitForFunction(() => document.querySelector('.zoom-level')?.textContent?.trim() === '100%');

  const viewerText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = proposal.units.map(unit => ({
    spanKey: unit.spanKey,
    visible: viewerText.includes(normalize(unit.targetText)),
  }));
  assert.ok(viewerChecks.every(check => check.visible), 'Normal Viewer failed to display one or more p.48 proposal units');
  const initialSymbols = await pageSymbols(page);
  assert.deepEqual(initialSymbols, expectedSymbols, 'Normal Viewer symbol count/order differs from the six source occurrences');
  const viewerScreenshot = resolve(proofDir, 'normal-viewer-p048-pt-BR-v3-corrected-fit.png');
  await page.screenshot({ path: viewerScreenshot, fullPage: true });

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  const symbolCycles = [];
  for (const record of snapshot.translations) {
    const expected = editorText(record);
    const uiKey = record.spanKey.includes('_unit_') ? record.spanKey : record.spanKey.replace(/__pt-BR$/u, '');
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
    assert.equal(await target.count(), 1, `${record.spanKey} should map to exactly one normal Editor target (${uiKey})`);
    await target.scrollIntoViewIfNeeded();
    await target.click({ force: true });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = page.locator('textarea').last();
    await textarea.waitFor({ state: 'visible' });
    assert.equal(normalize(await textarea.inputValue()), normalize(expected), `Editor text mismatch for ${record.spanKey}`);
    assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), `${record.spanKey} is not editable`);
    if (editorChecks.length === 0) {
      await page.screenshot({ path: resolve(proofDir, 'normal-editor-p048-readonly-v3-corrected-fit.png'), fullPage: true });
    }

    const tokens = [...expected.matchAll(/\[\[([^\]]+)\]\]/gu)].map(match => match[0]);
    for (const token of tokens) {
      const baseline = await pageSymbols(page);
      assert.deepEqual(baseline, expectedSymbols, `Unexpected initial semantic-symbol state while editing ${record.spanKey}`);
      const removedText = expected.replace(token, '');
      await textarea.fill(removedText);
      await page.waitForFunction(count => document.querySelectorAll('.page-container [data-symbol-id]').length === count - 1, baseline.length);
      const removed = await pageSymbols(page);
      assert.equal(removed.length, baseline.length - 1, `Removing ${token} did not remove exactly one symbol`);
      const undo = page.getByRole('button', { name: 'Desfazer' });
      assert.equal(await undo.isDisabled(), false, `Undo is unavailable after removing ${token}`);
      await undo.click();
      await page.waitForFunction(count => document.querySelectorAll('.page-container [data-symbol-id]').length === count, baseline.length);
      assert.equal(normalize(await textarea.inputValue()), normalize(expected), `Undo did not restore ${token} text`);
      const redo = page.getByRole('button', { name: 'Refazer' });
      assert.equal(await redo.isDisabled(), false, `Redo is unavailable after undoing ${token}`);
      await redo.click();
      await page.waitForFunction(count => document.querySelectorAll('.page-container [data-symbol-id]').length === count - 1, baseline.length);
      await textarea.fill(expected);
      await page.waitForFunction(count => document.querySelectorAll('.page-container [data-symbol-id]').length === count, baseline.length);
      assert.deepEqual(await pageSymbols(page), expectedSymbols, `Reinserting ${token} duplicated or misplaced a symbol`);
      symbolCycles.push({ spanKey: record.spanKey, token, removed: true, undoRestored: true, redoRemoved: true, reinsertedOnce: true });
    }

    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    assert.deepEqual(await pageSymbols(page), expectedSymbols, `Cancel changed symbols for ${record.spanKey}`);
    editorChecks.push({ spanKey: record.spanKey, uiKey, proposalMatched: true, editable: true, cancelled: true });
  }

  await pageInput.fill('49');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '49');
  await pageInput.fill('48');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '48'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_048/background.webp')
    && document.querySelectorAll('.page-container [data-symbol-id]').length === 6, { timeout: 30000 });
  const reopenedText = normalize(await page.locator('.page-container').innerText());
  assert.ok(proposal.units.every(unit => reopenedText.includes(normalize(unit.targetText))), 'Proposal text did not survive normal page re-open');

  const payloadAfter = await readPayloadTargetRecords();
  assert.deepEqual(payloadAfter, [], 'A canonical p.48 PT-BR record appeared during the read-only Editor proof');
  const canonicalAfter = await canonicalPageHashes();
  assert.deepEqual(canonicalAfter, canonicalBefore, 'Canonical p.48 page files changed during the read-only proof');
  assert.equal(blockedRequests.length, 0, 'A non-GET or off-origin API request was attempted');
  assert.equal(consoleErrors.length, 0, `Viewer/Admin console errors: ${consoleErrors.join('; ')}`);
  assert.equal(editorChecks.length, 15);
  assert.equal(symbolCycles.length, 6);
  assert.ok(pageAssets.some(asset => asset.path === 'inline_elements.json' && asset.source === 'isolated-snapshot'));
  assert.ok(pageAssets.some(asset => asset.path.startsWith('audit-source-p048-') && asset.source === 'isolated-snapshot'));

  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 48,
    mode: 'Normal Viewer/Admin; immutable translations, symbol aliases, sidecar and assets supplied by read-only browser interception',
    proposalId: proposal.proposalId,
    viewer: { all15ProposalUnitsVisible: true, symbolIds: initialSymbols, screenshot: relative(root, viewerScreenshot) },
    editor: { all15UnitsMatchedAndEditable: true, all15Cancelled: true, checks: editorChecks },
    symbolLifecycle: { removeUndoRedoReinsertCancelPassed: true, cycleCount: symbolCycles.length, checks: symbolCycles },
    pageReopen: { proposalTextsPresent: true, symbols: await pageSymbols(page) },
    payloadTargetRecordsBefore: payloadBefore,
    payloadTargetRecordsAfter: payloadAfter,
    canonicalPageHashesBefore: canonicalBefore,
    canonicalPageHashesAfter: canonicalAfter,
    canonicalPageFilesUnchanged: true,
    apiMethods: [...new Set(requests.map(request => request.method))],
    blockedRequests: blockedRequests,
    snapshotAssetsServed: pageAssets,
    consoleErrors,
    saveClicked: false,
    limitations: [
      'No translation was saved and no post-save persistence path was exercised.',
      'The proposal is technical copyfit evidence only; terminology and human wording approval remain pending.',
      'The four semantic symbol patches were supplied from the immutable isolated snapshot; the canonical p.48 sidecar remains unchanged.',
    ],
  };
  const receiptPath = resolve(proofDir, 'normal-editor-readonly-receipt-v3-corrected-fit.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: String(error), blockedRequests, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
