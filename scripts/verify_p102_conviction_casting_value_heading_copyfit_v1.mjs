import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeSourceBlock, groupPageRendererVisualLines } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const proposal = JSON.parse(await readFile(resolve(root, 'docs/translations/proposals/page-102-conviction-casting-value-heading-proposal-2026-10-17-v2.json'), 'utf8'));
const dom = JSON.parse(await readFile(resolve(root, 'apps/web/public/pages/page_102/page_102_dom.json'), 'utf8'));
const candidate = proposal.candidates.find(item => item.spanKey === 'page_102_block_16__pt-BR');
const sourceBlock = dom.blocks.find(block => block.id === candidate?.sourceBlockId);
assert.ok(candidate && sourceBlock, 'p.102 Conviction and Casting Value candidate/source block is missing');
const sourceCount = analyzeSourceBlock(sourceBlock).lineCount;
assert.equal(sourceCount, 1, 'The original PDF heading must group to one visual baseline');
const sourceSpan = sourceBlock.lines.flatMap(line => line.spans).find(span => span.text === candidate.sourceText);
assert.ok(sourceSpan, 'The source heading span is missing');
const variants = [
  { id: 'valor-de-conviccao-e-conjuracao', text: 'Valor de Convicção e Conjuração' },
  { id: 'valor-de-conviccao-conjuracao', text: 'Valor de Convicção/Conjuração' },
  { id: 'conviccao-e-valor-de-conjuracao', text: 'Convicção e Valor de Conjuração' },
];
const spanKey = candidate.spanKey;
const records = new Map(variants.map(variant => [variant.id, {
  id: `isolated-p102-heading-${variant.id}`,
  spanKey,
  language: 'pt-BR',
  data: {
    ...candidate.data,
    bbox: [...sourceBlock.bbox],
    // This PDF heading is centered in the source page; preserve that composition
    // while keeping the source frame and all type properties unchanged.
    textAlign: 'center',
    segments: [{ ...candidate.data.segments[0], text: variant.text,
      font: sourceSpan.font, size: sourceSpan.size, weight: sourceSpan.renderWeightOverride ?? candidate.data.segments[0].weight,
      color: sourceSpan.color }],
  },
}]));

const preflight = new URL('/api/translations', apiUrl);
preflight.searchParams.set('where[spanKey][equals]', spanKey);
preflight.searchParams.set('where[language][equals]', 'pt-BR');
const savedResponse = await fetch(preflight, { signal: AbortSignal.timeout(15000) });
assert.ok(savedResponse.ok, `Read-only Payload preflight failed: ${savedResponse.status}`);
const saved = await savedResponse.json();
assert.equal(saved.docs?.length ?? 0, 0, 'A human translation exists; refusing to overlay this heading');

const outputDir = resolve(root, 'apps/web/output/p102-conviction-casting-value-heading-copyfit-v1');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const attempts = [];
const blockedWrites = [];
const pageErrors = [];
try {
  for (const variant of variants) {
    const record = records.get(variant.id);
    for (const zoom of [100, 200]) {
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
          const docs = language && language !== 'pt-BR' ? [] : key && key !== spanKey ? [] : [record];
          await route.fulfill({ status: 200, contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': new URL(viewerUrl).origin, 'Access-Control-Allow-Credentials': 'true' },
            body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }) });
          return;
        }
        await route.continue();
      });

      const page = await context.newPage();
      page.on('pageerror', error => pageErrors.push({ variant: variant.id, zoom, error: String(error) }));
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
        const field = (realbox ?? element.closest('.credit-field') ?? element).getBoundingClientRect();
        const style = getComputedStyle(element.firstElementChild ?? element);
        const font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return { text: element.textContent, rects,
          field: { top: field.top, bottom: field.bottom, left: field.left, right: field.right },
          frameElement: realbox ? 'realbox' : 'fallback', font, fontLoaded: document.fonts.check(font), color: style.color };
      });
      const rows = groupPageRendererVisualLines(measured.rects, [], 4.5);
      const classification = rows.length === sourceCount ? 'EXACT' : rows.length < sourceCount ? 'UNDER' : 'OVER';
      const scale = zoom / 100;
      const frameOverrun = {
        left: Math.max(0, measured.field.left - Math.min(...measured.rects.map(rect => rect.left))),
        right: Math.max(0, Math.max(...measured.rects.map(rect => rect.right)) - measured.field.right),
        top: Math.max(0, measured.field.top - Math.min(...measured.rects.map(rect => rect.top))),
        bottom: Math.max(0, Math.max(...measured.rects.map(rect => rect.bottom)) - measured.field.bottom),
      };
      // Allow only subpixel rounding. The prior multi-pixel tolerance hid real
      // ink-box overrun against the immutable source frame at 100% and 200%.
      const frameOverflow = Object.values(frameOverrun).some(excess => excess > 0.5 * scale);
      const result = { proposalText: variant.text, sourcePdfVisualLineCount: sourceCount,
        pageRendererVisualLineCount: rows.length, classification, zoomPercent: zoom,
        measurementMethod: 'source PDF baseline geometry and Copyfit V3 PageRenderer DOM Range rows; source .realbox frame',
        measured, renderedRows: rows, frameOverrun, frameOverflow,
        blockedWrites: blockedWrites.filter(item => item.variant === variant.id && item.zoom === zoom),
        pageErrors: pageErrors.filter(item => item.variant === variant.id && item.zoom === zoom) };
      result.pass = classification === 'EXACT' && !frameOverflow && measured.fontLoaded
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
const summary = { page: 102, sourceText: candidate.sourceText, sourcePdfVisualLineCount: sourceCount,
  sourceFramePt: sourceBlock.bbox, humanTranslationPreflight: 'no matching saved Payload translation',
  attempts, blockedWrites, pageErrors };
await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputDir, results: attempts.map(item => ({ variant: item.variant,
  proposalText: item.proposalText, zoomPercent: item.zoomPercent, source: item.sourcePdfVisualLineCount,
  target: item.pageRendererVisualLineCount, classification: item.classification, frameOverflow: item.frameOverflow, pass: item.pass })),
  blockedWrites: blockedWrites.length, pageErrors: pageErrors.length }, null, 2));
