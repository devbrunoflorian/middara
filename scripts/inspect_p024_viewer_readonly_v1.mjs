#!/usr/bin/env node
/** Capture current p.24 PT-BR editor target keys and preserve the saved-record baseline. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p024-source-review-v1');
const pageAssetDir = resolve(root, 'apps/web/public/pages/page_024');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const apiOrigin = new URL(apiUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const requests = [];
const blocked = [];
const consoleErrors = [];
const pageErrors = [];
const beforeRecords = await fetch(new URL('/api/translations?limit=5000', apiUrl), { method: 'GET' })
  .then(response => { assert.ok(response.ok); return response.json(); })
  .then(body => (body.docs ?? []).filter(record => record.language === 'pt-BR' && String(record.spanKey ?? '').startsWith('page_24_')));
assert.equal(beforeRecords.length, 3, 'Expected to preserve the three saved p.24 PT-BR records.');
const browser = await chromium.launch({ headless: true, executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    requests.push({ method, origin: url.origin, path: url.pathname });
    if (url.origin !== apiOrigin || method !== 'GET') {
      blocked.push({ method, origin: url.origin, path: url.pathname });
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill('24');
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_024/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0);
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  const viewerTargets = await page.locator('.page-container [data-rendered-translation-key]').evaluateAll(nodes => nodes.map(node => ({
    key: node.getAttribute('data-rendered-translation-key'), text: (node.textContent ?? '').replace(/\s+/gu, ' ').trim(),
  })));
  await page.screenshot({ path: resolve(proofDir, 'pt-BR-existing-records-v1.png'), fullPage: true });
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorKeys = await page.locator('.page-container [data-editable-unit-key]').evaluateAll(nodes => [...new Set(nodes
    .map(node => node.getAttribute('data-editable-unit-key')).filter(Boolean))].sort());
  const payloadAfter = await fetch(new URL('/api/translations?limit=5000', apiUrl), { method: 'GET' })
    .then(response => { assert.ok(response.ok); return response.json(); })
    .then(body => (body.docs ?? []).filter(record => record.language === 'pt-BR' && String(record.spanKey ?? '').startsWith('page_24_')));
  assert.deepEqual(payloadAfter, beforeRecords);
  assert.deepEqual(blocked, []);
  assert.deepEqual(pageErrors, []);
  const receipt = {
    status: 'read-only-baseline-passed', page: 24, locale: 'pt-BR',
    savedRecordCountBefore: beforeRecords.length, savedRecordCountAfter: payloadAfter.length,
    savedRecords: beforeRecords.map(record => ({
      id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt,
      text: (record.data?.segments ?? []).map(segment => segment.text ?? '').join(''),
    })),
    viewerTargets, editorKeys,
    observedApiMethods: [...new Set(requests.map(request => request.method))], blockedMutations: blocked,
    canonicalDomHash: await (async () => {
      const crypto = await import('node:crypto');
      return crypto.createHash('sha256').update(await readFile(resolve(pageAssetDir, 'page_024_dom.json'))).digest('hex');
    })(),
    consoleErrors, pageErrors, saveClicked: false,
    screenshot: resolve(proofDir, 'pt-BR-existing-records-v1.png'),
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(resolve(proofDir, 'current-payload-editor-keys-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); }
