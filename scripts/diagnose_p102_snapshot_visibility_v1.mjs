import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot-p102-conviction-value-body-v1-export.json');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const apiOrigin = 'http://localhost:3000';
const baseUrl = 'http://127.0.0.1:8080';
const pageOrigin = new URL(baseUrl).origin;
const requests = [];
const failures = [];
const consoleErrors = [];
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), path: url.pathname, query: url.search });
    if (url.origin !== apiOrigin || request.method() !== 'GET') return route.abort('blockedbyclient');
    const params = url.searchParams;
    let docs = [];
    if (url.pathname === '/api/translations') {
      const language = params.get('where[language][equals]');
      docs = snapshot.translations ?? [];
      if (language) docs = docs.filter(doc => doc.language === language);
    } else if (url.pathname === '/api/layout-frames') {
      const requestedPage = Number(params.get('where[and][0][pageNumber][equals]') ?? params.get('where[pageNumber][equals]'));
      docs = (snapshot.layoutFrames ?? []).filter(doc => !Number.isFinite(requestedPage) || Number(doc.pageNumber) === requestedPage);
    } else if (url.pathname === '/api/symbol-alias-settings') docs = snapshot.symbolAliasSettings ?? [];
    else return route.fulfill({ status: 404, body: 'Not included in snapshot' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
      body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
    });
  });
  await context.route('**/pages/page_*/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== pageOrigin) return route.continue();
    const match = requestUrl.pathname.match(/^\/pages\/(page_\d{3})\/(.+)$/u);
    if (!match || !snapshot.assetPages?.includes(Number(match[1].slice(-3)))) return route.fulfill({ status: 404, body: 'Not included' });
    const filePath = resolve(proofDir, 'snapshot', 'pages', match[1], decodeURIComponent(match[2]));
    try { await route.fulfill({ path: filePath }); }
    catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  const page = await context.newPage();
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('102');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_102/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  const locale = page.locator('select.language-select');
  await locale.selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => {
    const container = document.querySelector('.page-container');
    return {
      page: document.querySelector('input.page-input')?.value,
      locale: document.querySelector('select.language-select')?.value,
      text: container?.innerText,
      pageText: container?.textContent,
      blocks: [...(container?.querySelectorAll('.block-container') ?? [])].map((el, index) => ({
        index,
        text: (el.innerText ?? '').replace(/\s+/gu, ' ').trim(),
        mode: el.getAttribute('data-render-mode'),
        bbox: (() => { const r=el.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; })(),
      })).filter(item => item.text.includes('Algumas') || item.text.includes('Conviction') || item.text.includes('Casting')),
      imageReady: !!container?.querySelector('img')?.naturalWidth,
    };
  });
  await page.screenshot({ path: resolve(proofDir, 'viewer-visibility-debug.png'), fullPage: true });
  const result = { createdAt: new Date().toISOString(), state, requests, failures, consoleErrors };
  await writeFile(resolve(proofDir, 'visibility-debug.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
