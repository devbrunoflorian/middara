#!/usr/bin/env node
/** Inspect live Admin selection keys for the isolated p.25 snapshot; never saves. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v2');
const snapshot = JSON.parse(await readFile(resolve(proofDir, 'snapshot/snapshot.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/pages/page_025/page_025_dom.json', route =>
    route.fulfill({ path: resolve(proofDir, 'snapshot/pages/page_025/page_025_dom.json') }));
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') { await route.abort('blockedbyclient'); return; }
    const docs = url.pathname === '/api/translations' ? snapshot.translations
      : url.pathname === '/api/layout-frames' ? snapshot.layoutFrames
      : url.pathname === '/api/symbol-alias-settings' ? snapshot.symbolAliasSettings : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ docs, totalDocs: docs.length }) });
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill('25');
  await page.locator('input.page-input').press('Enter');
  await page.waitForTimeout(800);
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForTimeout(500);
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const keys = await page.locator('[data-editable-unit-key]').evaluateAll(nodes =>
    nodes.map(node => ({
      key: node.getAttribute('data-editable-unit-key'),
      text: (node.innerText || '').replace(/\s+/gu, ' ').trim().slice(0, 120),
    })),
  );
  console.log(JSON.stringify({ keys }, null, 2));
} finally {
  await browser.close();
}
