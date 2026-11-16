#!/usr/bin/env node
/** Read-only inspection of page 26 Admin unit selection keys. */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
    return route.continue();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill('26');
  await page.locator('input.page-input').press('Enter');
  await page.waitForTimeout(900);
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForTimeout(500);
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const keys = await page.locator('[data-editable-unit-key]').evaluateAll(nodes => nodes.map(node => ({
    key: node.getAttribute('data-editable-unit-key'),
    text: (node.innerText || '').replace(/\s+/gu, ' ').trim().slice(0, 220),
  })));
  const targetElements = await page.locator('[data-editable-unit-key]').evaluateAll(nodes => {
    const selected = nodes.filter(node => /block_52|p26-block-478/u.test(node.getAttribute('data-editable-unit-key') ?? ''));
    return [...new Set(selected.map(node => node.getAttribute('data-editable-unit-key')))].map(key => {
      const matches = selected.filter(node => node.getAttribute('data-editable-unit-key') === key);
      return {
        key,
        count: matches.length,
        samples: matches.slice(0, 3).map(node => ({
          text: (node.innerText || '').replace(/\s+/gu, ' ').trim().slice(0, 100),
          box: (() => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
          parentText: (node.parentElement?.innerText || '').replace(/\s+/gu, ' ').trim().slice(0, 100),
        })),
      };
    });
  });
  console.log(JSON.stringify({ page: 26, editorKeys: keys.filter(item => /page_26_block_(0|1|52)$/u.test(item.key ?? '') || /p26-block-47[3-9]/u.test(item.key ?? '')), targetElements, pageErrors }, null, 2));
} finally {
  await browser.close();
}
