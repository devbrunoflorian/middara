#!/usr/bin/env node
/** Read-only Admin Editor round-trip for the isolated p.49 v2 snapshot. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot.json');
const receiptPath = resolve(proofDir, 'editor-readonly-receipt-v1.json');
const screenshotPath = resolve(proofDir, 'editor-example-readonly-v1.png');
const writes = [];
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();

const apiBeforeResponse = await fetch(`${apiUrl}/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=5000`);
assert.ok(apiBeforeResponse.ok, `Read-only Payload baseline GET failed: ${apiBeforeResponse.status}`);
const apiBefore = await apiBeforeResponse.json();
assert.ok((apiBefore.docs ?? []).length >= Number(apiBefore.totalDocs ?? 0), 'Payload baseline is paginated');
const beforePageRecords = (apiBefore.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_49_'));
assert.equal(beforePageRecords.length, 0, 'Do not run the editor proof over unexpected saved p.49 records');

const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
assert.equal(snapshot.translations.length, 7);
const translations = snapshot.translations;
const keys = translations.map(doc => doc.spanKey);
const expectedTexts = new Map(translations.map(doc => [
  doc.spanKey,
  doc.data.segments.filter(segment => !segment.symbolId).map(segment => segment.text ?? '').join(''),
]));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined,
});

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['GET', 'OPTIONS'].includes(request.method())) {
      writes.push({ method: request.method(), path: url.pathname });
      await route.abort('blockedbyclient');
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/api/translations') {
      const language = url.searchParams.get('where[language][equals]');
      const docs = language ? translations.filter(doc => doc.language === language) : translations;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: 5000, hasNextPage: false }) });
      return;
    }
    await route.continue();
  });

  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  await page.locator('input.page-input').fill('49');
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_049/background.webp'));
  await page.locator('.language-select').selectOption('pt-BR');
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.locator('.admin-mode').waitFor();
  const editableKeys = await page.locator('[data-editable-unit-key]').evaluateAll(elements => elements
    .map(element => ({ key: element.getAttribute('data-editable-unit-key'), text: (element.textContent ?? '').slice(0, 60) })));
  const checks = [];

  for (const key of keys) {
    // Legacy block editor targets omit the locale suffix in the DOM; the
    // selected RichSpanEditor identity still resolves to the locale key.
    const domKey = key.replace(/__pt-BR$/u, '');
    const selector = `[data-editable-unit-key="${domKey}"]`;
    const target = page.locator(selector).last();
    try {
      await target.waitFor({ timeout: 10000 });
    } catch (error) {
      throw new Error(`No editable DOM target for ${key}; observed targets: ${JSON.stringify(editableKeys)}`, { cause: error });
    }
    await target.click({ position: { x: 8, y: 5 } });
    await page.getByText('📝 Edit Text').click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor();
    const editorText = await editor.inputValue();
    const subtitle = await page.locator('.rse-subtitle').innerText();
    assert.ok(subtitle.includes(domKey), `Editor selected the wrong identity for ${key}: ${subtitle}`);
    const expected = normalize(expectedTexts.get(key));
    assert.ok(normalize(editorText).includes(expected.replace(/^\uFFFC\s*/u, '')),
      `Editor text differs from the isolated snapshot for ${key}`);
    checks.push({ key, editorIdentityMatched: true, textMatchedSnapshot: true, textLength: editorText.length });
    if (key === 'page_49_block_8__pt-BR') await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForFunction(() => !document.querySelector('.rse-edit-text'));
  }

  assert.deepEqual(writes, [], `Unexpected write requests were attempted: ${JSON.stringify(writes)}`);
  const apiAfterResponse = await fetch(`${apiUrl}/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=5000`);
  assert.ok(apiAfterResponse.ok, `Read-only Payload postflight GET failed: ${apiAfterResponse.status}`);
  const apiAfter = await apiAfterResponse.json();
  const afterPageRecords = (apiAfter.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_49_'));
  assert.equal(afterPageRecords.length, 0, 'The read-only Editor proof changed the real Payload');
  const receipt = {
    status: 'passed-readonly-editor-identity-and-snapshot-check',
    page: 49,
    locale: 'pt-BR',
    viewerUrl: baseUrl,
    snapshotPath: 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2/snapshot/snapshot.json',
    checks,
    writesBlocked: writes,
    payloadRecordsBefore: beforePageRecords.length,
    payloadRecordsAfter: afterPageRecords.length,
    screenshot: 'output/proofs/translation-readiness-2026-10-16/p049-full-prose-v2/editor-example-readonly-v1.png',
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
