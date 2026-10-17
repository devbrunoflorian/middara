import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeSourceBlock, classifyCopyfitVisualLines, getCopyfitVisualLineGateStatus, groupPageRendererVisualLines } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://localhost:8080';
const proposalPath = resolve(root, 'docs/translations/proposals/page-101-index-title-proposal-2026-10-16-v1.json');
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const candidate = proposal.candidates.find(item => item.spanKey === 'page_101_block_3__pt-BR');
assert.ok(candidate, 'The p.101 Index title proposal is missing');
const pageData = JSON.parse(await readFile(resolve(root, 'apps/web/public/pages/page_101/page_101_dom.json'), 'utf8'));
const sourceBlock = pageData.blocks.find(block => block.id === candidate.sourceBlockId);
assert.ok(sourceBlock, 'The p.101 source Index title is missing');
const sourcePdfVisualLineCount = analyzeSourceBlock(sourceBlock).lineCount;
assert.ok(sourcePdfVisualLineCount > 0, 'The source PDF has no measurable visual baseline for Index');

const preflightUrl = new URL('/api/translations', apiUrl);
preflightUrl.searchParams.set('where[spanKey][equals]', candidate.spanKey);
preflightUrl.searchParams.set('where[language][equals]', 'pt-BR');
const preflight = await fetch(preflightUrl, { signal: AbortSignal.timeout(15000) });
assert.ok(preflight.ok, `Read-only Payload preflight failed: ${preflight.status}`);
const saved = await preflight.json();
assert.equal(saved.docs?.length ?? 0, 0, 'A human translation exists; refusing to overlay the title proposal');

const outputDir = resolve(root, 'apps/web/output/p101-index-title-copyfit-v1');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const blockedWrites = [];
const pageErrors = [];
try {
  for (const zoom of [100, 200]) {
    const context = await browser.newContext({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
    await context.route('**/api/**', async route => {
      const request = route.request();
      if (request.method().toUpperCase() !== 'GET') {
        blockedWrites.push({ method: request.method(), url: request.url(), zoom });
        await route.abort('blockedbyclient');
        return;
      }
      const url = new URL(request.url());
      if (url.pathname.endsWith('/api/translations')) {
        const key = url.searchParams.get('where[spanKey][equals]')
          ?? url.searchParams.get('where[and][0][spanKey][equals]');
        const language = url.searchParams.get('where[language][equals]')
          ?? url.searchParams.get('where[and][1][language][equals]');
        const docs = language && language !== 'pt-BR' ? []
          : (!key || key === candidate.spanKey ? [{
            id: 'isolated-p101-index-title', spanKey: candidate.spanKey, language: 'pt-BR', data: candidate.data,
          }] : []);
        await route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': new URL(viewerUrl).origin, 'Access-Control-Allow-Credentials': 'true' },
          body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }) });
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push({ zoom, error: String(error) }));
    await page.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('input.page-input').fill('101');
    await page.locator('input.page-input').press('Enter');
    await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '101'
      && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_101/background.webp')
      && document.querySelector('.page-container img')?.naturalWidth > 0);
    await page.locator('select.language-select').selectOption('pt-BR');
    for (let step = 0; step < 8; step += 1) {
      const current = Number((await page.locator('.zoom-level').innerText()).replace('%', '').trim());
      if (current === zoom) break;
      await page.locator(current > zoom ? 'button[title="Zoom Out"]' : 'button[title="Zoom In"]').click();
    }
    await page.waitForFunction(expectedKey => Boolean(document.querySelector(`[data-rendered-translation-key="${expectedKey}"]`)), candidate.spanKey);
    await page.evaluate(() => document.fonts.ready);
    const target = page.locator(`[data-rendered-translation-key="${candidate.spanKey}"]`);
    const measured = await target.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
        .map(rect => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }));
      const frame = element.closest('.realbox')?.getBoundingClientRect();
      const text = element.querySelector('span') ?? element;
      const style = getComputedStyle(text);
      const font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return { text: element.textContent, rects,
        frame: frame && { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right },
        font, fontLoaded: document.fonts.check(font) };
    });
    assert.equal(measured.text?.trim(), candidate.proposalText, 'The Viewer did not render the complete proposed title');
    assert.ok(measured.frame, 'The PageRenderer frame is missing');
    assert.ok(measured.rects.length, 'The PageRenderer produced no visual text geometry');
    const rows = groupPageRendererVisualLines(measured.rects);
    const classification = classifyCopyfitVisualLines(sourcePdfVisualLineCount, rows.length);
    const copyfitLineCountGate = getCopyfitVisualLineGateStatus(sourcePdfVisualLineCount, rows.length,
      candidate.underCompositionJustification);
    const tolerance = zoom / 100;
    const rangeBoxOverrun = {
      left: Math.max(0, measured.frame.left - Math.min(...measured.rects.map(rect => rect.left))),
      right: Math.max(0, Math.max(...measured.rects.map(rect => rect.right)) - measured.frame.right),
      top: Math.max(0, measured.frame.top - Math.min(...measured.rects.map(rect => rect.top))),
      bottom: Math.max(0, Math.max(...measured.rects.map(rect => rect.bottom)) - measured.frame.bottom),
    };
    const rangeBoxOutsideFrame = Object.values(rangeBoxOverrun).some(excess => excess > tolerance);
    const result = { page: 101, sourceBlockId: candidate.sourceBlockId, spanKey: candidate.spanKey,
      sourceText: candidate.sourceText, proposalText: candidate.proposalText,
      sourcePdfVisualLineCount, pageRendererVisualLineCount: rows.length, classification, copyfitLineCountGate,
      zoomPercent: zoom, environment: { viewport: '2400x1400 CSS px', devicePixelRatio: 1, locale: 'pt-BR' },
      measurementMethod: 'PDF-derived source span baselines and live PageRenderer DOM Range rectangles grouped by the shared Copyfit V3 visual-row helper',
      frameSource: 'Original proposal bbox and source font size retained',
      frame: measured.frame, renderedRangeRects: measured.rects,
      rangeBoxOverrun, rangeBoxOutsideFrame,
      geometryNote: 'DOM Range rectangles include font line-box metrics and are not glyph-ink bounds; inspect the same-scale screenshots before deciding visible clipping.',
      font: measured.font,
      fontLoaded: measured.fontLoaded, renderedRows: rows,
      blockedWrites: blockedWrites.filter(item => item.zoom === zoom), pageErrors: pageErrors.filter(item => item.zoom === zoom),
      result: copyfitLineCountGate === 'line-count-pass' && measured.fontLoaded
        && blockedWrites.every(item => item.zoom !== zoom) && pageErrors.every(item => item.zoom !== zoom)
        ? 'PASS_LINE_COUNT_PENDING_VISUAL_GEOMETRY_REVIEW' : 'FAIL' };
    results.push(result);
    await page.screenshot({ path: resolve(outputDir, `viewer-ptbr-index-title-${zoom}pct.png`), fullPage: true });
    await writeFile(resolve(outputDir, `index-title-${zoom}pct-measurement.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await context.close();
  }
} finally {
  await browser.close();
}

const summary = { proposalFile: proposalPath.slice(root.length + 1), page: 101, sourcePdfVisualLineCount,
  humanTranslationPreflight: 'no matching saved Payload translation', blockedWrites: blockedWrites.length,
  pageErrors, results,
  result: results.length === 2 && results.every(item => item.result === 'PASS_LINE_COUNT_PENDING_VISUAL_GEOMETRY_REVIEW')
    ? 'PASS_LINE_COUNT_PENDING_VISUAL_GEOMETRY_REVIEW' : 'FAIL' };
await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
