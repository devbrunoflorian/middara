import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1');
const pageDir = resolve(root, 'apps/web/public/pages/page_102');
const pageFiles = ['page_102_dom.json', 'background.webp', 'layout_frames.json', 'fidelity_overlays.json'];
const source = 'Since Casting only uses 1 die, the Casting Value is simply the value of the single die.';
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase();
const hashesBefore = Object.fromEntries(await Promise.all(pageFiles.map(async name => [name, await sha(resolve(pageDir, name))])));
const requests = [];
const blockedRequests = [];
const errors = [];
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
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('102');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '102'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_102/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0);
  await page.locator('select.language-select').selectOption('en');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'en');
  assert.ok(normalize(await page.locator('.page-container').innerText()).includes(normalize(source)),
    'Normal Viewer does not show the exact separate Casting Value paragraph');
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');

  const candidates = page.locator('[data-editable-unit-key]').filter({ hasText: 'Since Casting only uses' });
  assert.equal(await candidates.count(), 1, 'Expected exactly one Editor hit target for the lower paragraph');
  const hitTarget = candidates.first();
  const editorKey = await hitTarget.getAttribute('data-editable-unit-key');
  assert.equal(editorKey, 'page_102_block_1', 'The separate paragraph no longer maps to the expected legacy block index');
  await hitTarget.click({ force: true });
  await page.getByRole('button', { name: '📝 Edit Text' }).click();
  const textarea = page.locator('textarea').last();
  await textarea.waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(normalize(await textarea.inputValue()), normalize(source), 'Editor loaded different text for the lower paragraph');
  assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), 'Lower paragraph is not editable');
  await page.screenshot({ path: resolve(proofDir, 'normal-editor-page-102-casting-value-source-unit.png'), fullPage: true });
  await page.getByRole('button', { name: /^\s*Cancel\s*$/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
  await page.locator('.rse-close').click();
  assert.ok(normalize(await page.locator('.page-container').innerText()).includes(normalize(source)), 'Cancel did not restore the lower source paragraph');
  await page.locator('button[title="Exit Admin"]').click();
  await pageInput.fill('101');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '101');
  await pageInput.fill('102');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '102'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_102/background.webp'));
  assert.ok(normalize(await page.locator('.page-container').innerText()).includes(normalize(source)), 'Reopened page lost the lower source paragraph');
  const hashesAfter = Object.fromEntries(await Promise.all(pageFiles.map(async name => [name, await sha(resolve(pageDir, name))])));
  assert.deepEqual(hashesAfter, hashesBefore, 'Canonical page files changed during the read-only Editor check');
  assert.equal(blockedRequests.length, 0, 'A write request was attempted');
  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 102,
    sourceUnit: 'page_102_block_1',
    sourceTextMatched: true,
    uniqueEditorHitTarget: true,
    fieldEditable: true,
    cancelRestoredSource: true,
    reopenPreservedSource: true,
    writeRequestsBlocked: blockedRequests,
    observedRequestMethods: [...new Set(requests.map(request => request.method))],
    pageErrors: errors,
    canonicalPageHashesBefore: hashesBefore,
    canonicalPageHashesAfter: hashesAfter,
    canonicalPageFilesUnchanged: true,
    saveClicked: false,
    note: 'Read-only source-unit check only. No PT-BR draft was typed or saved; the separate proposal must be verified by its own immutable snapshot and PDF.',
  };
  await writeFile(resolve(proofDir, 'normal-editor-casting-value-readonly-receipt-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
