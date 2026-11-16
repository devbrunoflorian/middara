import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const page = 56;
const pageId = 'page_056';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-general-information-v2');
const pageDir = resolve(root, 'apps/web/public/pages', pageId);
const pageFiles = [
  'page_056_dom.json',
  'background.webp',
  'layout_frames.json',
  'fidelity_overlays.json',
];
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase();
const hashFiles = async () => Object.fromEntries(await Promise.all(pageFiles.map(async name => [
  name,
  await sha(resolve(pageDir, name)),
])));
const sourceBlockText = block => normalize((block.lines ?? []).flatMap(line => (line.spans ?? [])
  .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
  .map(span => span.text ?? '')).join(' '));

const before = await hashFiles();
const dom = JSON.parse(await readFile(resolve(pageDir, 'page_056_dom.json'), 'utf8'));
const sourceByKey = new Map(dom.blocks.map((block, index) => [
  'page_56_block_' + index,
  sourceBlockText(block),
]));
const editorialKeys = [
  'page_56_block_0',
  'page_56_block_1',
  'page_56_block_2',
  'page_56_block_3',
  'page_56_block_4',
];
assert.ok(editorialKeys.every(key => sourceByKey.get(key)), 'One or more family source blocks are missing');

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadKeys = async () => {
  const response = await fetch(translationsUrl);
  assert.ok(response.ok, 'Payload read failed: ' + response.status);
  const body = await response.json();
  return (body.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_56_'))
    .map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt }));
};
const payloadBefore = await readPayloadKeys();
assert.deepEqual(payloadBefore, [], 'A PT-BR p.56 record already exists; do not alter it');

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
  const pageTab = await context.newPage();
  pageTab.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  pageTab.on('pageerror', error => consoleErrors.push(String(error)));
  await pageTab.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  const pageInput = pageTab.locator('input.page-input');
  await pageInput.fill(String(page));
  await pageInput.press('Enter');
  await pageTab.waitForFunction(() => document.querySelector('input.page-input')?.value === '56'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_056/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0);
  await pageTab.locator('select.language-select').selectOption('en');
  await pageTab.waitForFunction(() => document.querySelector('select.language-select')?.value === 'en');
  await pageTab.locator('button[title="Enter Admin"]').click();
  await pageTab.waitForSelector('.app-container.admin-mode');

  const checked = [];
  for (const key of editorialKeys) {
    const hitTarget = pageTab.locator('.block-container[data-editable-unit-key="' + key + '"]');
    await hitTarget.waitFor({ state: 'attached', timeout: 10000 });
    assert.equal(await hitTarget.count(), 1, key + ' should expose one whole-block Editor target');
    await hitTarget.click({ force: true });
    await pageTab.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = pageTab.locator('textarea').last();
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
    const actual = normalize(await textarea.evaluate(element => element.value));
    assert.equal(actual, sourceByKey.get(key), 'Editor source mismatch for ' + key);
    assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), key + ' is not editable');
    if (key === 'page_56_block_0' || key === 'page_56_block_1') {
      await pageTab.screenshot({
        path: resolve(proofDir, 'normal-editor-' + key + '-source-v2.png'),
        fullPage: true,
      });
    }
    await pageTab.getByRole('button', { name: /^\s*Cancel\s*$/ }).click();
    await pageTab.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await pageTab.locator('.rse-close').click();
    await pageTab.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    checked.push({ key, sourceMatched: true, editable: true, cancelled: true });
  }

  const payloadAfter = await readPayloadKeys();
  assert.deepEqual(payloadAfter, [], 'Read-only Editor check created or changed a p.56 PT-BR record');
  assert.equal(blockedRequests.length, 0, 'Editor attempted a blocked write request');
  const after = await hashFiles();
  assert.deepEqual(after, before, 'Canonical p.56 assets changed during Editor check');

  const receipt = {
    schemaVersion: 1,
    page,
    family: 'General Information',
    route: 'normal Viewer/Admin UI at http://127.0.0.1:8080; source locale en',
    editorialKeys: checked,
    allSourceBlocksMatchedAndEditable: checked.length === 5 && checked.every(item => item.sourceMatched && item.editable),
    cancelClosedEveryDraft: checked.every(item => item.cancelled),
    payloadPtBrRecordsBeforeAndAfter: { before: payloadBefore, after: payloadAfter },
    blockedWriteRequests: blockedRequests,
    observedRequestMethods: [...new Set(requests.map(item => item.method))],
    consoleErrors,
    canonicalPageHashesBefore: before,
    canonicalPageHashesAfter: after,
    canonicalPageFilesUnchanged: true,
    saveClicked: false,
    note: 'This verifies normal Editor identity and source editability for the complete five-block family, plus Cancel safety. PT-BR remains an isolated Viewer/PDF proposal and was not inserted or saved in the Editor.',
  };
  await mkdir(proofDir, { recursive: true });
  const receiptPath = resolve(proofDir, 'normal-editor-readonly-receipt-v2.json');
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: String(error), blockedRequests, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
