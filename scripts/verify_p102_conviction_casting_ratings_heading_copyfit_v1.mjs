import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeSourceBlock, classifyCopyfitVisualLines, getCopyfitVisualLineGateStatus, groupPageRendererVisualLines } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const proposal = JSON.parse(await readFile(resolve(root, 'docs/translations/proposals/page-102-conviction-casting-ratings-heading-proposal-2026-10-17-v2.json'), 'utf8'));
const dom = JSON.parse(await readFile(resolve(root, 'apps/web/public/pages/page_102/page_102_dom.json'), 'utf8'));
const candidate = proposal.candidates.find(item => item.spanKey === 'page_102_block_14__pt-BR');
const sourceBlock = dom.blocks.find(block => block.id === candidate?.sourceBlockId);
assert.ok(candidate && sourceBlock, 'p.102 Conviction and Casting Ratings candidate/source block is missing');
const sourceCount = analyzeSourceBlock(sourceBlock).lineCount;
assert.equal(sourceCount, candidate.sourcePdfVisualLineCount, 'Candidate source-line count must match the PDF baseline grouping');
const sourceSpan = sourceBlock.lines.flatMap(line => line.spans).find(span => span.text.trim());
assert.ok(sourceSpan, 'The first source heading span is missing');

const record = {
  id: 'isolated-p102-conviction-casting-ratings-heading',
  spanKey: candidate.spanKey,
  language: 'pt-BR',
  data: {
    ...candidate.data,
    bbox: [...sourceBlock.bbox],
    segments: [{ ...candidate.data.segments[0],
      font: sourceSpan.font,
      size: sourceSpan.size,
      weight: sourceSpan.renderWeightOverride ?? candidate.data.segments[0].weight,
      color: sourceSpan.color }],
  },
};

const preflight = new URL('/api/translations', apiUrl);
preflight.searchParams.set('where[spanKey][equals]', candidate.spanKey);
preflight.searchParams.set('where[language][equals]', 'pt-BR');
const savedResponse = await fetch(preflight, { signal: AbortSignal.timeout(15000) });
assert.ok(savedResponse.ok, `Read-only Payload preflight failed: ${savedResponse.status}`);
const saved = await savedResponse.json();
assert.equal(saved.docs?.length ?? 0, 0, 'A human translation exists; refusing to overlay this heading');

const outputDir = resolve(root, 'apps/web/output/p102-conviction-casting-ratings-heading-copyfit-v1');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const attempts = [];
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
        const language = url.searchParams.get('where[language][equals]')
          ?? url.searchParams.get('where[and][1][language][equals]');
        const key = url.searchParams.get('where[spanKey][equals]')
          ?? url.searchParams.get('where[and][0][spanKey][equals]');
        const docs = language && language !== 'pt-BR' ? [] : key && key !== candidate.spanKey ? [] : [record];
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
    await page.locator('input.page-input').fill('102');
    await page.locator('input.page-input').press('Enter');
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
    const target = page.locator(`[data-rendered-translation-key="${candidate.spanKey}"]`);
    await target.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(({ key, text }) => document.querySelector(`[data-rendered-translation-key="${key}"]`)?.textContent?.includes(text),
      { key: candidate.spanKey, text: candidate.proposalText });
    const measured = await target.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
        .map(rect => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }));
      const frame = element.closest('.realbox')?.getBoundingClientRect();
      const style = getComputedStyle(element.firstElementChild ?? element);
      const font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return { text: element.textContent, rects,
        frame: frame && { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right },
        font, fontLoaded: document.fonts.check(font), color: style.color };
    });
    assert.ok(measured.frame, 'The source .realbox frame is unavailable');
    const rows = groupPageRendererVisualLines(measured.rects, [], 4.5);
    const classification = classifyCopyfitVisualLines(sourceCount, rows.length);
    const underCompositionJustification = String(candidate.underCompositionJustification ?? '').trim();
    const copyfitLineCountGate = getCopyfitVisualLineGateStatus(sourceCount, rows.length, underCompositionJustification);
    const scale = zoom / 100;
    const frameOverrun = {
      left: Math.max(0, measured.frame.left - Math.min(...measured.rects.map(rect => rect.left))),
      right: Math.max(0, Math.max(...measured.rects.map(rect => rect.right)) - measured.frame.right),
      top: Math.max(0, measured.frame.top - Math.min(...measured.rects.map(rect => rect.top))),
      bottom: Math.max(0, Math.max(...measured.rects.map(rect => rect.bottom)) - measured.frame.bottom),
    };
    const frameOverflow = Object.values(frameOverrun).some(excess => excess > 0.5 * scale);
    const result = { proposalText: candidate.proposalText, sourcePdfVisualLineCount: sourceCount,
      pageRendererVisualLineCount: rows.length, classification, zoomPercent: zoom,
      underCompositionJustification: underCompositionJustification || null, copyfitLineCountGate,
      measurementMethod: 'Source PDF visual baselines and PageRenderer DOM Range rows using the shared Copyfit V3 grouper; source .realbox frame with subpixel-only tolerance',
      measured, renderedRows: rows, frameOverrun, frameOverflow,
      blockedWrites: blockedWrites.filter(item => item.zoom === zoom),
      pageErrors: pageErrors.filter(item => item.zoom === zoom) };
    result.pass = copyfitLineCountGate === 'line-count-pass' && !frameOverflow && measured.fontLoaded
      && result.blockedWrites.length === 0 && result.pageErrors.length === 0;
    attempts.push(result);
    await target.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(outputDir, `ratings-heading-${zoom}pct.png`), fullPage: true });
    await writeFile(resolve(outputDir, `ratings-heading-${zoom}pct.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await context.close();
  }
} finally {
  await browser.close();
}
const summary = { page: 102, sourceText: candidate.sourceText, sourcePdfVisualLineCount: sourceCount,
  sourceFramePt: sourceBlock.bbox, humanTranslationPreflight: 'no matching saved Payload translation',
  attempts, blockedWrites, pageErrors };
await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputDir, results: attempts.map(item => ({ zoomPercent: item.zoomPercent,
  source: item.sourcePdfVisualLineCount, target: item.pageRendererVisualLineCount,
  classification: item.classification, frameOverflow: item.frameOverflow, pass: item.pass })),
  blockedWrites: blockedWrites.length, pageErrors: pageErrors.length }, null, 2));
