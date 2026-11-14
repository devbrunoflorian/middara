import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Focused live regression: start the Payload API and Vite Viewer, then run:
// node --test scripts/tests/copyfit-typography-live.test.mjs
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const apiUrl = process.env.MIDDARA_PAYLOAD_URL ?? 'http://localhost:3000/api';
const chromePath = process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function loadPage(page, pageNumber) {
  const input = page.locator('input.page-input');
  await input.fill(String(pageNumber));
  await input.press('Enter');
  const pagePrefix = `page_${String(pageNumber).padStart(3, '0')}`;
  await page.waitForFunction(({ number, prefix }) => document.querySelector('input.page-input')?.value === String(number)
    && document.querySelector('.page-container img')?.src.includes(`/${prefix}/`),
  { number: pageNumber, prefix: pagePrefix }, { timeout: 30000 });
}

async function measureKey(page, pageNumber, pageWidth, key) {
  await page.waitForFunction(expectedKey => Array.from(document.querySelectorAll('[data-rendered-translation-key]'))
    .some(element => element.getAttribute('data-rendered-translation-key') === expectedKey), key, { timeout: 45000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  return page.evaluate(({ expectedKey, pdfPageWidth }) => {
    const matches = Array.from(document.querySelectorAll('[data-rendered-translation-key]'))
      .filter(element => element.getAttribute('data-rendered-translation-key') === expectedKey);
    if (matches.length !== 1) return { count: matches.length };
    const target = matches[0];
    const rects = [];
    const fonts = new Map();
    let text = '';
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const style = node.parentElement && getComputedStyle(node.parentElement);
      if (!style || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      text += node.textContent ?? '';
      if (!node.textContent?.trim()) continue;
      const sample = {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        fontLoaded: document.fonts.check(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`),
      };
      fonts.set(JSON.stringify(sample), sample);
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0.5 && rect.height > 1) rects.push({ top: rect.top, height: rect.height });
      }
    }
    const sorted = rects.sort((a, b) => (a.top + a.height / 2) - (b.top + b.height / 2));
    const medianHeight = [...sorted].map(rect => rect.height).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
    const rows = [];
    for (const rect of sorted) {
      const centre = rect.top + rect.height / 2;
      const previous = rows.at(-1);
      if (previous && Math.abs(centre - previous.centre) <= medianHeight * 0.5) {
        previous.centre = (previous.centre * previous.fragments + centre) / (previous.fragments + 1);
        previous.fragments += 1;
      } else rows.push({ centre, fragments: 1 });
    }
    const image = document.querySelector('.page-container img');
    const pageScale = image && pdfPageWidth ? image.getBoundingClientRect().width / pdfPageWidth : null;
    return {
      count: 1,
      text: text.replace(/\s+/gu, ' ').trim(),
      rows: rows.length,
      intervalsPt: pageScale ? rows.slice(1).map((row, index) => (row.centre - rows[index].centre) / pageScale) : [],
      fontSamples: [...fonts.values()],
    };
  }, { expectedKey: key, pdfPageWidth: pageWidth });
}

test('PageRenderer keeps the p.2 AGaramond leading and p.17 Optima control aligned to PDF baselines', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.25 });
    const page = await context.newPage();
    await context.route('**/api/**', async route => {
      if (route.request().method().toUpperCase() !== 'GET') { await route.abort('blockedbyclient'); return; }
      await route.continue();
    });
    await page.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input.page-input');

    await loadPage(page, 2);
    const ptFrameResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/layout-frames')
        && url.searchParams.get('where[and][0][pageNumber][equals]') === '2'
        && url.searchParams.get('where[and][1][language][equals]') === 'pt-BR';
    }, { timeout: 30000 });
    await page.locator('select.language-select').selectOption('pt-BR');
    await ptFrameResponse;
    await page.waitForTimeout(300);
    const page2 = JSON.parse(readFileSync(resolve(`apps/web/public/pages/page_002/page_002_dom.json`), 'utf8'));
    const p2 = await measureKey(page, 2, page2.width, 'page_2_block_5__pt-BR');
    assert.equal(p2.count, 1, 'p.2 AGaramond translation must resolve to one PageRenderer unit');
    assert.equal(p2.rows, 4, 'p.2 translation remains four visual rows');
    assert.ok(p2.fontSamples.some(sample => sample.fontFamily.includes('AGaramondPro') && sample.fontLoaded),
      'the p.2 measurement must use the loaded AGaramond font');
    for (const interval of p2.intervalsPt) assert.ok(Math.abs(interval - 14.755) <= 0.12, `p.2 leading ${interval} pt should match 14.755 pt PDF baseline spacing`);

    const frameQuery = new URLSearchParams({ 'where[frameKey][equals]': 'page_2_block_5::pt-BR', limit: '2' });
    const frameResponse = await fetch(`${apiUrl}/layout-frames?${frameQuery}`);
    assert.equal(frameResponse.status, 200, 'the Payload frame should be readable');
    const frameDocs = (await frameResponse.json()).docs ?? [];
    assert.equal(frameDocs.length, 1, 'the per-unit PT-BR frame must stay unique');
    assert.equal(frameDocs[0].data.lineHeight, 1.135, 'the stored frame must preserve the measured AGaramond leading ratio');

    await loadPage(page, 17);
    const page17 = JSON.parse(readFileSync(resolve('apps/web/public/pages/page_017/page_017_dom.json'), 'utf8'));
    for (const [key, expectedRows] of [['page_17_block_6__pt-BR', 9], ['page_17_block_7__pt-BR', 5]]) {
      const p17 = await measureKey(page, 17, page17.width, key);
      assert.equal(p17.count, 1, `${key} must resolve uniquely`);
      assert.equal(p17.rows, expectedRows, `${key} keeps its PDF row count`);
      assert.ok(p17.fontSamples.some(sample => sample.fontFamily.includes('OptimaLTStd') && sample.fontLoaded),
        `${key} must use the loaded Optima font`);
      for (const interval of p17.intervalsPt) assert.ok(Math.abs(interval - 11) <= 0.12, `${key} leading ${interval} pt should match the 11 pt PDF baselines`);
    }
    console.log(JSON.stringify({ p2: { rows: p2.rows, intervalsPt: p2.intervalsPt }, p17: '9 and 5 Optima rows at 11 pt leading' }));
  } finally {
    await browser.close();
  }
});
