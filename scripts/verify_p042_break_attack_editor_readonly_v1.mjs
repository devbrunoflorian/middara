import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p042-break-attack-v2');
const pageDir = resolve(root, 'apps/web/public/pages/page_042');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_WEB_URL ?? 'http://127.0.0.1:8080';
const apiOrigin = new URL(apiUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const hashFile = async path => sha(await readFile(path));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeNew = async (path, contents) => writeFile(path, contents, { flag: 'wx' });

const proposal = await readJson(resolve(root, 'docs/translations/proposals/page-042-break-attack-example-proposal-2026-10-15-v2.json'));
const snapshot = await readJson(resolve(proofDir, 'snapshot/snapshot-p042-break-attack-example-v2-export.json'));
const manifest = await readJson(resolve(proofDir, 'source-hashes.json'));
const expectedPayload = await readJson(resolve(proofDir, 'preexisting-payload-records.json'));
const candidateKey = 'page_42_unit_p42-break-attack-example__pt-BR';
assert.equal(proposal.page, 42);
assert.equal(proposal.candidate.spanKey, candidateKey);
assert.equal(proposal.candidate.data.segments[0].color, '#ffffff');
assert.equal(snapshot.translations.some(record => record.spanKey === candidateKey), true);
assert.deepEqual(expectedPayload.records.map(({ id, spanKey, updatedAt, sha256 }) => ({ id, spanKey, updatedAt, sha256 })), proposal.existingPayloadRecords);

const expectedText = proposal.candidate.data.segments.map(segment => segment.text).join('');
// Typographic-unit fields carry the locale-qualified key in the normal Editor DOM.
const uiKey = candidateKey;
const pageAssetHashesBefore = {};
for (const [name, expected] of Object.entries(manifest.pageAssets)) {
  pageAssetHashesBefore[name] = await hashFile(resolve(pageDir, name));
  assert.equal(pageAssetHashesBefore[name], expected, `Canonical p.42 asset changed: ${name}`);
}

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readActualP42Payload = async () => {
  const response = await fetch(translationsUrl);
  assert.ok(response.ok, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_42_'))
    .map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt, sha256: sha(stable(doc)) }));
};
const payloadBefore = await readActualP42Payload();
assert.deepEqual(payloadBefore, expectedPayload.records, 'Current Payload p.42 state differs from the captured read-only baseline');
assert.ok(!payloadBefore.some(record => record.spanKey === candidateKey), 'Candidate translation already exists in Payload');

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
        status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    if (url.pathname === '/api/symbol-alias-settings') {
      const docs = snapshot.symbolAliasSettings ?? [];
      return route.fulfill({
        status: 200, contentType: 'application/json',
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
  await pageInput.fill('42');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '42'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_042/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, undefined, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  const pageText = page.locator('.page-container');
  await page.waitForFunction(expected => document.querySelector('.page-container')?.innerText.replace(/\s+/gu, ' ').includes(expected), expectedText);
  const viewerText = normalize(await pageText.innerText());
  assert.ok(viewerText.includes(normalize(expectedText)), 'The normal Viewer did not render the proposed p.42 text');
  await page.screenshot({ path: resolve(proofDir, 'normal-viewer-readonly-v1.png'), fullPage: true });

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
  assert.equal(await target.count(), 1, 'The p.42 candidate must map to one normal Editor unit');
  await target.click({ force: true });
  await page.getByRole('button', { name: /Edit Text/ }).click();
  const textarea = page.locator('textarea').last();
  await textarea.waitFor({ state: 'visible' });
  assert.equal(normalize(await textarea.inputValue()), normalize(expectedText), 'Editor text differs from the proposal');
  assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), 'Editor field is not editable');
  await page.screenshot({ path: resolve(proofDir, 'normal-editor-readonly-v1.png'), fullPage: true });

  const draftText = `${expectedText} rascunho local`;
  await textarea.fill(draftText);
  assert.equal(normalize(await textarea.inputValue()), normalize(draftText), 'Session draft did not accept editing');
  await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
  await page.locator('.rse-close').click();
  await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
  assert.ok(normalize(await pageText.innerText()).includes(normalize(expectedText)), 'Cancel did not restore the proposed Viewer text');

  await pageInput.fill('43');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '43'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_043/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, undefined, { timeout: 30000 });
  await pageInput.fill('42');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '42'
    && document.querySelector('select.language-select')?.value === 'pt-BR'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_042/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, undefined, { timeout: 30000 });
  await page.waitForFunction(expected => document.querySelector('.page-container')?.innerText.replace(/\s+/gu, ' ').includes(expected), expectedText);
  assert.ok(normalize(await pageText.innerText()).includes(normalize(expectedText)), 'Reopening p.42 lost the isolated proposal preview');

  assert.deepEqual(blockedRequests, [], 'A non-GET API request was attempted and blocked');
  const payloadAfter = await readActualP42Payload();
  assert.deepEqual(payloadAfter, payloadBefore, 'Payload p.42 records changed during the read-only Editor exercise');
  const pageAssetHashesAfter = {};
  for (const name of Object.keys(pageAssetHashesBefore)) pageAssetHashesAfter[name] = await hashFile(resolve(pageDir, name));
  assert.deepEqual(pageAssetHashesAfter, pageAssetHashesBefore, 'Canonical p.42 assets changed during the read-only Editor exercise');

  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 42,
    method: 'Normal Viewer/Admin UI; immutable snapshot supplied only through intercepted GET /api/translations; all non-GET API requests blocked',
    candidateKey,
    viewer: { candidateVisible: true, textColor: proposal.candidate.data.segments[0].color },
    editor: { mapsToSingleEditableUnit: true, exactTextLoaded: true, sessionDraftAccepted: true, cancelRestoredText: true, pageReopenPreservedPreview: true },
    payload: { before: payloadBefore, after: payloadAfter, unchanged: true },
    canonicalPageAssetHashes: { before: pageAssetHashesBefore, after: pageAssetHashesAfter, unchanged: true },
    requests: { count: requests.length, nonGetBlocked: blockedRequests },
    consoleErrors,
    screenshots: ['normal-viewer-readonly-v1.png', 'normal-editor-readonly-v1.png'],
  };
  await writeNew(resolve(proofDir, 'editor-readonly-receipt-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  await context.close();
} finally {
  await browser.close();
}
