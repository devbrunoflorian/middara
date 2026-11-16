import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1');
const pageDir = resolve(root, 'apps/web/public/pages/page_102');
const pageFiles = ['page_102_dom.json', 'background.webp', 'layout_frames.json', 'fidelity_overlays.json'];
const source = "Some Abilities, Conditions, or AI Steps may reference a figure's Conviction Value or Casting Value. The Conviction Value or Casting Value is calculated by adding the figure's best dice of the appropriate type according to the rating list on the left.";
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase();
const hashFiles = async () => Object.fromEntries(await Promise.all(pageFiles.map(async name => [name, await sha(resolve(pageDir, name))])));
const before = await hashFiles();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const payloadBeforeResponse = await fetch(translationsUrl);
assert.ok(payloadBeforeResponse.ok, `Payload read failed: ${payloadBeforeResponse.status}`);
const payloadBefore = await payloadBeforeResponse.json();
const candidateKey = 'page_102_unit_p102-conviction-value-body__pt-BR';
const candidateBefore = (payloadBefore.docs ?? []).filter(doc => doc.spanKey === candidateKey);
assert.equal(candidateBefore.length, 0, 'Candidate unexpectedly exists in Payload before read-only Editor check');

const requests = [];
const blockedRequests = [];
const consoleErrors = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/*', async route => {
    const request = route.request();
    const method = request.method().toUpperCase();
    requests.push({ method, url: request.url() });
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      blockedRequests.push({ method, url: request.url() });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('102');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '102'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_102/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0);
  await page.locator('select.language-select').selectOption('en');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'en');
  const viewerSource = normalize(await page.locator('.page-container').innerText());
  assert.ok(viewerSource.includes(normalize(source).slice(0, 90)), 'Normal Viewer source body did not match the official EN text');

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const key = 'page_102_unit_p102-conviction-value-body__en';
  const hitTarget = page.locator(`.credit-field[data-editable-unit-key="${key}"]`);
  await hitTarget.waitFor({ state: 'attached', timeout: 10000 });
  assert.equal(await hitTarget.count(), 1, 'p.102 body should expose exactly one Editor hit target');
  await hitTarget.click({ force: true });
  await page.getByRole('button', { name: '📝 Edit Text' }).click();
  const textarea = page.locator('textarea').last();
  await textarea.waitFor({ state: 'visible', timeout: 10000 });
  const editorSource = normalize(await textarea.inputValue());
  assert.equal(editorSource, normalize(source), 'Editor did not load the exact p.102 English body');
  assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), 'Source field is not editable');
  await page.screenshot({ path: resolve(proofDir, 'normal-editor-page-102-source-unit.png'), fullPage: true });
  await page.getByRole('button', { name: /^\s*Cancel\s*$/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
  await page.locator('.rse-close').click();
  const afterCancel = normalize(await page.locator('.page-container').innerText());
  assert.ok(afterCancel.includes(normalize(source).slice(0, 90)), 'Cancel did not restore the original English body');
  assert.equal(afterCancel.includes('Algumas Habilidades, Condições'), false, 'Unexpected PT draft remained visible after Cancel');
  await page.locator('button[title="Exit Admin"]').click();
  await pageInput.fill('101');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '101');
  await pageInput.fill('102');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '102'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_102/background.webp'));
  await page.waitForTimeout(250);
  const reopened = normalize(await page.locator('.page-container').innerText());
  assert.ok(reopened.includes(normalize(source).slice(0, 90)), 'Original EN body changed after page re-open');
  await page.screenshot({ path: resolve(proofDir, 'normal-viewer-page-102-after-cancel-reopen.png'), fullPage: true });

  const after = await hashFiles();
  assert.deepEqual(after, before, 'Canonical p.102 files changed during Editor check');
  const payloadAfterResponse = await fetch(translationsUrl);
  assert.ok(payloadAfterResponse.ok, `Payload re-read failed: ${payloadAfterResponse.status}`);
  const payloadAfter = await payloadAfterResponse.json();
  const candidateAfter = (payloadAfter.docs ?? []).filter(doc => doc.spanKey === candidateKey);
  assert.equal(candidateAfter.length, 0, 'Read-only Editor check created the PT-BR candidate');
  assert.equal(blockedRequests.length, 0, 'Editor attempted a write request');

  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 102,
    route: 'normal Viewer/Admin UI at http://127.0.0.1:8080; source locale en',
    candidateKey,
    sourceUnitKey: key,
    sourceTextMatched: true,
    distinctEditorHitTargetCount: 1,
    fieldEditable: true,
    cancelRestoredEnglish: true,
    reopenPreservedEnglish: true,
    candidateAbsentBeforeAndAfter: true,
    blockedWriteRequests: blockedRequests,
    observedRequestMethods: [...new Set(requests.map(item => item.method))],
    consoleErrors,
    canonicalPageHashesBefore: before,
    canonicalPageHashesAfter: after,
    canonicalPageFilesUnchanged: true,
    saveClicked: false,
    note: 'This read-only Editor check proves source-unit identity/editability and Cancel/reopen safety. The PT-BR candidate was neither inserted into Payload nor typed/saved here; its rendering is proven separately by the isolated snapshot and actual PDF.',
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
