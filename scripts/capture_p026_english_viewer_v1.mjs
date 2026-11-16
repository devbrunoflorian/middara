#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1');
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1600 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() !== 'GET') return route.abort('blockedbyclient');
    return route.continue();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill('26');
  await page.locator('input.page-input').press('Enter');
  await page.waitForSelector('.page-container img');
  await page.waitForTimeout(1200);
  const language = page.locator('select.language-select');
  const options = await language.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, label: node.textContent?.trim() })));
  if (options.some(option => option.value === 'en')) await language.selectOption('en');
  await page.getByTitle('Fit to Screen').click();
  await page.waitForTimeout(600);
  const details = await page.evaluate(() => ({
    pageText: document.querySelector('.page-container')?.innerText ?? '',
    imageCount: document.querySelectorAll('.page-container img').length,
    renderedTranslationKeys: [...document.querySelectorAll('[data-rendered-translation-key]')].map(node => node.getAttribute('data-rendered-translation-key')),
  }));
  await page.screenshot({ path: resolve(outDir, 'en-viewer-v1.png'), fullPage: false });
  console.log(JSON.stringify({ page: 26, locale: await language.inputValue(), options, imageCount: details.imageCount, renderedTranslationKeys: details.renderedTranslationKeys, pageErrors, screenshot: 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/en-viewer-v1.png', textSample: details.pageText.slice(0, 500) }, null, 2));
} finally {
  await browser.close();
}
