import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeSourceBlock, groupPageRendererVisualLines } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const dom = JSON.parse(await readFile(resolve(root, 'apps/web/public/pages/page_102/page_102_dom.json'), 'utf8'));
const sourceBlock = dom.blocks.find(block => block.id === 'block_25');
assert.ok(sourceBlock, 'p.102 Dice Breakdown source block is missing');
const sourceMeasurement = analyzeSourceBlock(sourceBlock);
assert.equal(sourceMeasurement.lineCount, 1, 'The source title must be grouped as one visual PDF line');

const spanKey = 'page_102_block_15__pt-BR';
const sourceSpan = sourceBlock.lines.flatMap(line => line.spans).find(span => span.text === 'Dice Breakdown');
assert.ok(sourceSpan, 'The exact title span is missing from the p.102 source geometry');

const variants = [
  { id: 'dados-em-detalhe', text: 'Dados em Detalhe' },
  { id: 'detalhes-dos-dados', text: 'Detalhes dos Dados' },
  { id: 'detalhamento-dos-dados', text: 'Detalhamento dos Dados' },
];
const records = variants.map(({ text }) => ({
  id: `isolated-p102-title-${text.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`,
  spanKey,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    spanKey,
    // Keep the source PDF frame and alignment. The previous draft widened this frame,
    // which is not a valid Copyfit V3 wording comparison.
    bbox: [...sourceBlock.bbox],
    textAlign: 'center',
    lineHeight: 1,
    lineHeightMode: 'source',
    segments: [{
      text,
      font: sourceSpan.font,
      size: sourceSpan.size,
      weight: sourceSpan.renderWeightOverride ?? 400,
      style: 'normal',
      color: sourceSpan.color,
      disableLigatures: true,
    }],
    managedSourceSymbols: [],
  },
}));

const preflight = new URL('/api/translations', apiUrl);
preflight.searchParams.set('where[spanKey][equals]', spanKey);
preflight.searchParams.set('where[language][equals]', 'pt-BR');
const savedResponse = await fetch(preflight, { signal: AbortSignal.timeout(15000) });
assert.ok(savedResponse.ok, `Read-only Payload preflight failed: ${savedResponse.status}`);
const saved = await savedResponse.json();
assert.equal(saved.docs?.length ?? 0, 0, 'A human translation exists; refusing to overlay the title proposal');

const outputDir = resolve(root, 'apps/web/output/p102-dice-breakdown-title-copyfit-v1');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const attempts = [];
const blockedWrites = [];
const errors = [];
try {
  for (const variant of variants) {
    for (const zoom of [100, 200]) {
      const record = records.find(item => item.data.segments[0].text === variant.text);
      const context = await browser.newContext({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
      await context.route('**/api/**', async route => {
        const request = route.request();
        if (request.method().toUpperCase() !== 'GET') {
          blockedWrites.push({ method: request.method(), url: request.url(), variant: variant.id, zoom });
          await route.abort('blockedbyclient');
          return;
        }
        const url = new URL(request.url());
        if (url.pathname.endsWith('/api/translations')) {
          const language = url.searchParams.get('where[language][equals]')
            ?? url.searchParams.get('where[and][1][language][equals]');
          const key = url.searchParams.get('where[spanKey][equals]')
            ?? url.searchParams.get('where[and][0][spanKey][equals]');
          const docs = language && language !== 'pt-BR' ? []
            : key && key !== spanKey ? [] : [record];
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
      page.on('pageerror', error => errors.push({ variant: variant.id, zoom, error: String(error) }));
      await page.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
      const pageInput = page.locator('input.page-input');
      await pageInput.fill('102');
      await pageInput.press('Enter');
      await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '102'
        && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_102/background.webp')
        && document.querySelector('.page-container img')?.naturalWidth > 0);
      await page.locator('select.language-select').selectOption('pt-BR');
      const zoomLabel = page.locator('.zoom-level');
      for (let step = 0; step < 8; step += 1) {
        const current = Number((await zoomLabel.innerText()).replace('%', '').trim());
        if (current === zoom) break;
        await page.locator(current > zoom ? 'button[title="Zoom Out"]' : 'button[title="Zoom In"]').click();
      }
      assert.equal(Number((await zoomLabel.innerText()).replace('%', '').trim()), zoom);
      await page.evaluate(() => document.fonts.ready);
      const target = page.locator(`[data-rendered-translation-key="${spanKey}"]`);
      await target.waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForFunction(({ key, text }) => document.querySelector(`[data-rendered-translation-key="${key}"]`)?.textContent?.includes(text),
        { key: spanKey, text: variant.text });
      const measured = await target.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
          .map(rect => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }));
        const realbox = element.closest('.realbox');
        const creditField = element.closest('.credit-field');
        const field = (realbox ?? creditField ?? element).getBoundingClientRect();
        const sourceStyle = getComputedStyle(element.firstElementChild ?? element);
        const font = sourceStyle.font || `${sourceStyle.fontWeight} ${sourceStyle.fontSize} ${sourceStyle.fontFamily}`;
        return {
          text: element.textContent,
          rects,
          field: { top: field.top, bottom: field.bottom, left: field.left, right: field.right },
          frameElement: realbox ? 'realbox' : creditField ? 'credit-field' : 'rendered-text',
          creditFieldRect: creditField ? (() => {
            const rect = creditField.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
          })() : null,
          frameInlineStyle: realbox?.getAttribute('style') ?? null,
          renderedFont: font,
          renderedColor: sourceStyle.color,
          fontLoaded: document.fonts.check(font),
        };
      });
      const renderedLines = groupPageRendererVisualLines(measured.rects, [], 4.5);
      const scale = zoom / 100;
      const frameOverflow = measured.rects.some(rect => rect.left < measured.field.left - scale
        || rect.right > measured.field.right + scale || rect.top < measured.field.top - 3 * scale
        || rect.bottom > measured.field.bottom + 3 * scale);
      const result = {
        page: 102,
        sourceText: 'Dice Breakdown',
        proposalText: variant.text,
        sourcePdfVisualLineCount: sourceMeasurement.lineCount,
        pageRendererVisualLineCount: renderedLines.length,
        classification: renderedLines.length === sourceMeasurement.lineCount ? 'EXACT'
          : renderedLines.length < sourceMeasurement.lineCount ? 'UNDER' : 'OVER',
        frameSource: 'unchanged source PDF block_25 bbox and centered alignment',
        zoomPercent: zoom,
        measured,
        renderedLines,
        frameOverflow,
        fontLoaded: measured.fontLoaded,
        blockedWrites: blockedWrites.filter(item => item.variant === variant.id && item.zoom === zoom),
        pageErrors: errors.filter(item => item.variant === variant.id && item.zoom === zoom),
      };
      result.pass = result.classification === 'EXACT' && !frameOverflow && result.fontLoaded
        && result.blockedWrites.length === 0 && result.pageErrors.length === 0;
      attempts.push({ variant: variant.id, ...result });
      await target.scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(outputDir, `${variant.id}-${zoom}pct.png`), fullPage: true });
      await writeFile(resolve(outputDir, `${variant.id}-${zoom}pct.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const summary = {
  page: 102,
  sourceText: 'Dice Breakdown',
  sourcePdfVisualLineCount: sourceMeasurement.lineCount,
  sourceFramePt: sourceBlock.bbox,
  humanTranslationPreflight: 'no matching saved Payload translation',
  attemptedVariants: variants.map(({ id, text }) => ({ id, text })),
  attempts,
  blockedWrites,
  pageErrors: errors,
};
await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  outputDir,
  results: attempts.map(item => ({ variant: item.variant, proposalText: item.proposalText, zoomPercent: item.zoomPercent,
    source: item.sourcePdfVisualLineCount, target: item.pageRendererVisualLineCount, classification: item.classification,
    frameOverflow: item.frameOverflow, pass: item.pass })),
  blockedWrites: blockedWrites.length,
  pageErrors: errors.length,
}, null, 2));
