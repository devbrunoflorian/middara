import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeSourceBlock, classifyCopyfitVisualLines, getCopyfitVisualLineGateStatus, groupPageRendererVisualLines } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const proposal = JSON.parse(await readFile(resolve(root, 'docs/translations/proposals/page-102-conviction-casting-values-proposal-2026-10-16-v1.json'), 'utf8'));
const dom = JSON.parse(await readFile(resolve(root, 'apps/web/public/pages/page_102/page_102_dom.json'), 'utf8'));
assert.equal(proposal.candidates.length, 2, 'Expected the two p.102 Conviction/Casting body units');

const candidates = proposal.candidates.map(candidate => {
  const sourceBlock = dom.blocks.find(block => block.id === candidate.sourceBlockId);
  assert.ok(sourceBlock, `Source block ${candidate.sourceBlockId} is missing`);
  const sourceFramePt = candidate.data.bbox ?? sourceBlock.bbox;
  const sourceLines = sourceBlock.lines.filter(line => line.bbox[1] < sourceFramePt[3] + 0.1
    && line.bbox[3] > sourceFramePt[1] - 0.1);
  assert.ok(sourceLines.length > 0, `No PDF source rows overlap the editorial unit frame for ${candidate.spanKey}`);
  const unitSourceBlock = { ...sourceBlock, bbox: sourceFramePt, lines: sourceLines };
  return { candidate, sourceBlock, sourceFramePt, sourceCount: analyzeSourceBlock(unitSourceBlock).lineCount,
    record: { id: `isolated-${candidate.spanKey}`, spanKey: candidate.spanKey, language: 'pt-BR', data: candidate.data } };
});

for (const { candidate } of candidates) {
  const preflight = new URL('/api/translations', apiUrl);
  preflight.searchParams.set('where[spanKey][equals]', candidate.spanKey);
  preflight.searchParams.set('where[language][equals]', 'pt-BR');
  const response = await fetch(preflight, { signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `Read-only Payload preflight failed for ${candidate.spanKey}: ${response.status}`);
  const saved = await response.json();
  assert.equal(saved.docs?.length ?? 0, 0, `A human translation exists for ${candidate.spanKey}; refusing to overlay it`);
}

const outputDir = resolve(root, 'apps/web/output/p102-conviction-values-body-copyfit-v1');
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
        const docs = language && language !== 'pt-BR' ? [] : candidates.filter(item => !key || item.candidate.spanKey === key).map(item => item.record);
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

    for (const { candidate, sourceBlock, sourceFramePt, sourceCount } of candidates) {
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
        const fonts = Array.from(element.querySelectorAll('*')).map(child => {
          const style = getComputedStyle(child);
          return style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        });
        if (fonts.length === 0) {
          const style = getComputedStyle(element);
          fonts.push(style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
        }
        return { text: element.textContent, rects,
          frame: frame && { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right },
          fonts, allFontsLoaded: fonts.every(font => document.fonts.check(font)) };
      });
      assert.ok(measured.frame, `Source .realbox frame unavailable for ${candidate.spanKey}`);
      const rows = groupPageRendererVisualLines(measured.rects, [], 4.5);
      const classification = classifyCopyfitVisualLines(sourceCount, rows.length);
      const underCompositionJustification = String(candidate.underCompositionJustification ?? '').trim();
      const copyfitLineCountGate = getCopyfitVisualLineGateStatus(sourceCount, rows.length, underCompositionJustification);
      const scale = zoom / 100;
      const rangeBoxOverrun = {
        left: Math.max(0, measured.frame.left - Math.min(...measured.rects.map(rect => rect.left))),
        right: Math.max(0, Math.max(...measured.rects.map(rect => rect.right)) - measured.frame.right),
        top: Math.max(0, measured.frame.top - Math.min(...measured.rects.map(rect => rect.top))),
        bottom: Math.max(0, Math.max(...measured.rects.map(rect => rect.bottom)) - measured.frame.bottom),
      };
      const rangeBoxesExtendPastFrame = Object.values(rangeBoxOverrun).some(excess => excess > 0.5 * scale);
      const result = { sourceText: candidate.sourceText, proposalText: candidate.proposalText,
        sourceBlockId: candidate.sourceBlockId, sourcePdfVisualLineCount: sourceCount,
        pageRendererVisualLineCount: rows.length, classification, zoomPercent: zoom,
        underCompositionJustification: underCompositionJustification || null, copyfitLineCountGate,
        measurementMethod: 'Source PDF visual baselines and PageRenderer DOM Range rows using the shared Copyfit V3 grouper; source .realbox bounds checked with subpixel-only tolerance',
        sourceFramePt, measured, renderedRows: rows, rangeBoxOverrun, rangeBoxesExtendPastFrame,
        geometryMetricNote: 'DOM Range rectangles include line-box extents and are diagnostic only for ink containment; use PDF glyph-bbox comparison and same-scale visual review for the independent geometry gate.',
        blockedWrites: blockedWrites.filter(item => item.zoom === zoom),
        pageErrors: pageErrors.filter(item => item.zoom === zoom) };
      result.lineCountAndRenderingPass = copyfitLineCountGate === 'line-count-pass' && measured.allFontsLoaded
        && result.blockedWrites.length === 0 && result.pageErrors.length === 0;
      attempts.push(result);
      await target.scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(outputDir, `block-${candidate.sourceBlockId}-${zoom}pct.png`), fullPage: true });
      await writeFile(resolve(outputDir, `block-${candidate.sourceBlockId}-${zoom}pct.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
    await context.close();
  }
} finally {
  await browser.close();
}
const summary = { page: 102, sourceProposals: proposal.candidates.length,
  humanTranslationPreflight: 'no matching saved Payload translations', attempts, blockedWrites, pageErrors };
await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputDir, results: attempts.map(item => ({ sourceBlockId: item.sourceBlockId,
  zoomPercent: item.zoomPercent, source: item.sourcePdfVisualLineCount, target: item.pageRendererVisualLineCount,
  classification: item.classification, rangeBoxesExtendPastFrame: item.rangeBoxesExtendPastFrame,
  lineCountAndRenderingPass: item.lineCountAndRenderingPass })),
  blockedWrites: blockedWrites.length, pageErrors: pageErrors.length }, null, 2));
