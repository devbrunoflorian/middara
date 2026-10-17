import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const proposalPath = resolve(root, 'docs/translations/proposals/page-102-skull-label-proposal-2026-10-17-v1.json');
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const candidate = proposal.candidates.find(item => item.spanKey === 'page_102_unit_p102-skull-vertical-label__pt-BR');
assert.ok(candidate, 'The p.102 SKULL candidate is missing');
assert.equal(candidate.sourcePdfVisualLineCount, 1, 'The source baseline must remain one visual line');
const targetText = process.argv[2] ?? candidate.proposalText;
const isolatedData = {
  ...candidate.data,
  segments: candidate.data.segments.map(segment => ({ ...segment, text: targetText })),
};
const slug = targetText.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
const requestedZoom = Number(process.argv[3] ?? 100);
assert.ok([100, 125, 150, 175, 200].includes(requestedZoom), 'Use a supported 25% zoom step between 100% and 200%');

const existingResponse = await fetch(`${apiUrl}/api/translations?where%5BspanKey%5D%5Bequals%5D=${encodeURIComponent(candidate.spanKey)}&where%5Blanguage%5D%5Bequals%5D=pt-BR`, {
  signal: AbortSignal.timeout(15000),
});
assert.ok(existingResponse.ok, `Read-only Payload preflight failed: ${existingResponse.status}`);
const existing = await existingResponse.json();
assert.equal(existing.docs?.length ?? 0, 0, 'A saved human translation exists; refusing to mask it with this proposal');

const outputDir = resolve(root, 'apps/web/output/p102-skull-label-copyfit-v1');
await mkdir(outputDir, { recursive: true });
const requests = [];
const blockedWrites = [];
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/*', async route => {
    const request = route.request();
    const method = request.method().toUpperCase();
    requests.push({ method, url: request.url() });
    if (method !== 'GET') {
      blockedWrites.push({ method, url: request.url() });
      await route.abort('blockedbyclient');
      return;
    }
    const url = new URL(request.url());
    if (url.pathname.endsWith('/api/translations')) {
      const lang = url.searchParams.get('where[language][equals]')
        ?? url.searchParams.get('where[and][1][language][equals]');
      const key = url.searchParams.get('where[spanKey][equals]')
        ?? url.searchParams.get('where[and][0][spanKey][equals]');
      const docs = lang && lang !== 'pt-BR' ? []
        : key && key !== candidate.spanKey ? []
          : [{ id: 'isolated-p102-skull-proposal', spanKey: candidate.spanKey, language: 'pt-BR', data: isolatedData }];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': new URL(viewerUrl).origin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
      return;
    }
    await route.continue();
  });

  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('102');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '102'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_102/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0);
  await page.locator('select.language-select').selectOption('pt-BR');
  const zoomLabel = page.locator('.zoom-level');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentZoom = Number((await zoomLabel.innerText()).replace('%', '').trim());
    if (currentZoom === requestedZoom) break;
    await page.locator(currentZoom > requestedZoom ? 'button[title="Zoom Out"]' : 'button[title="Zoom In"]').click();
  }
  const actualZoom = Number((await zoomLabel.innerText()).replace('%', '').trim());
  assert.equal(actualZoom, requestedZoom, `Could not set app zoom to ${requestedZoom}%`);
  const key = candidate.spanKey;
  await page.waitForFunction(({ expectedKey, expectedText }) =>
    document.querySelector(`[data-rendered-translation-key="${expectedKey}"]`)?.textContent?.includes(expectedText),
  { expectedKey: key, expectedText: targetText });

  const metrics = await page.evaluate(({ expectedKey, expectedText }) => {
    const text = document.querySelector(`[data-rendered-translation-key="${expectedKey}"]`);
    const field = text?.closest('.credit-field');
    if (!text || !field || !text.textContent?.includes(expectedText)) throw new Error('The proposed text is not rendered in a PageRenderer field');
    const range = document.createRange();
    range.selectNodeContents(text);
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    const fieldRect = field.getBoundingClientRect();
    const transform = getComputedStyle(field).transform;
    const rotated = /matrix\(0,\s*1,\s*-1,\s*0|rotate\(90deg\)/u.test(transform);
    const axis = rotated ? 'left' : 'top';
    const rows = [];
    for (const rect of [...rects].sort((a, b) => a[axis] - b[axis])) {
      if (!rows.some(value => Math.abs(value - rect[axis]) <= 1.5)) rows.push(rect[axis]);
    }
    const outside = rects.some(rect => rect.left < fieldRect.left - 1
      || rect.right > fieldRect.right + 1 || rect.top < fieldRect.top - 1 || rect.bottom > fieldRect.bottom + 1);
    const style = getComputedStyle(text.firstElementChild ?? text);
    return {
      text: text.textContent,
      transform,
      rotated,
      sourceLineCount: 1,
      targetVisualLineCount: rows.length,
      classification: rows.length === 1 ? 'EXACT' : rows.length < 1 ? 'UNDER' : 'OVER',
      rowAxis: axis,
      fragmentRects: rects.map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })),
      fieldRect: { x: fieldRect.x, y: fieldRect.y, width: fieldRect.width, height: fieldRect.height },
      textEscapesField: outside,
      frameStyle: { width: field.style.width, minHeight: field.style.minHeight },
      renderedFont: style.font,
      renderedFontFamily: style.fontFamily,
      fontStatus: document.fonts.status,
      fontLoaded: document.fonts.check('700 8px OptimaLTStd'),
    };
  }, { expectedKey: key, expectedText: targetText });
  await page.screenshot({ path: resolve(outputDir, `viewer-ptbr-${slug}-${actualZoom}pct.png`), fullPage: true });
  const result = {
    proposalId: proposal.proposalId,
    spanKey: candidate.spanKey,
    page: 102,
    candidateText: targetText,
    measurementSource: 'live PageRenderer DOM Range client rects grouped on the rendered line axis; source count from original PDF line geometry',
    environment: { viewport: '2400x1400 CSS px', devicePixelRatio: 1, language: 'pt-BR', zoom: `${actualZoom}%` },
    ...metrics,
    blockedWrites,
    pageErrors: errors,
    humanTranslationPreflight: 'no matching saved Payload translation',
    result: metrics.classification === 'EXACT' && !metrics.textEscapesField && blockedWrites.length === 0 && errors.length === 0 ? 'PASS' : 'FAIL',
  };
  await writeFile(resolve(outputDir, `${slug}-${actualZoom}pct-measurement.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
