import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeSourceBlock, groupPageRendererVisualLines } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const proposalPath = resolve(root, 'docs/translations/proposals/page-102-rating-color-rows-proposal-2026-10-17-v1.json');
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const pageDom = JSON.parse(await readFile(resolve(root, 'apps/web/public/pages/page_102/page_102_dom.json'), 'utf8'));
const pageData = pageDom.blocks;

const sourceLineCounts = new Map();
for (const candidate of proposal.candidates) {
  const block = pageData.find(item => item.id === candidate.sourceBlockId);
  assert.ok(block, `Source block ${candidate.sourceBlockId} is missing`);
  const lineIds = candidate.sourcePdfLineIds ?? candidate.data.lineIds ?? [];
  const sourceLines = block.lines.filter(line => lineIds.includes(line.id));
  const measured = analyzeSourceBlock({ ...block, lines: sourceLines });
  assert.equal(measured.lineCount, 1, `${candidate.sourceText} must be one actual source visual line`);
  sourceLineCounts.set(candidate.spanKey, measured.lineCount);
}

const sourceLanguageRows = [
  ['1  -  PURPLE', '1 - Roxo', '1 - roxo', '1. roxo'],
  ['2  -  WHITE', '2 - Branco', '2 - branco', '2. branco'],
  ['3  -  ORANGE', '3 - Laranja', '3 - laranja', '3. laranja'],
  ['4  -  TEAL', '4 - Turquesa', '4 - turquesa', '4. turquesa'],
  ['5  -  RED', '5 - Vermelho', '5 - vermelho', '5. vermelho'],
  ['6  -  GREEN', '6 - Verde', '6 - verde', '6. verde'],
  ['7  -  GREY', '7 - Cinza', '7 - cinza', '7. cinza'],
  ['8  -  BLUE', '8 - Azul', '8 - azul', '8. azul'],
];
const variants = [
  { id: 'existing-uppercase', getText: candidate => candidate.proposalText },
  { id: 'sentence-case-hyphen', index: 1 },
  { id: 'lowercase-hyphen', index: 2 },
  { id: 'lowercase-period', index: 3 },
  {
    id: 'sentence-case-standard-abbreviations',
    getText: (candidate, index) => ['1 - Roxo', '2 - Branco', '3 - Laranja', '4 - Turq.', '5 - Verm.', '6 - Verde', '7 - Cinza', '8 - Azul'][index],
  },
];

const apiRecords = [];
for (const [index, candidate] of proposal.candidates.entries()) {
  const preflightUrl = new URL('/api/translations', apiUrl);
  preflightUrl.searchParams.set('where[spanKey][equals]', candidate.spanKey);
  preflightUrl.searchParams.set('where[language][equals]', 'pt-BR');
  const response = await fetch(preflightUrl, { signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `Read-only Payload preflight failed for ${candidate.spanKey}: ${response.status}`);
  const saved = await response.json();
  assert.equal(saved.docs?.length ?? 0, 0, `A human translation exists for ${candidate.spanKey}; refusing to overlay it`);
  for (const variant of variants) {
    const text = variant.index === undefined ? variant.getText(candidate, index) : sourceLanguageRows[index][variant.index];
    const data = structuredClone(candidate.data);
    data.segments = (data.segments ?? []).map(segment => ({ ...segment, text }));
    apiRecords.push({ id: `isolated-${variant.id}-${index}`, spanKey: candidate.spanKey, language: 'pt-BR', data, variantId: variant.id });
  }
}

const outputDir = resolve(root, 'apps/web/output/p102-rating-color-rows-copyfit-v1');
await mkdir(outputDir, { recursive: true });
const attempts = [];
const blockedWrites = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const variant of variants) {
    const records = apiRecords.filter(record => record.variantId === variant.id).map(({ variantId, ...record }) => record);
    for (const zoom of [100, 200]) {
      const context = await browser.newContext({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
      await context.route('**/api/**', async route => {
        const request = route.request();
        const method = request.method().toUpperCase();
        if (method !== 'GET') {
          blockedWrites.push({ method, url: request.url(), variant: variant.id, zoom });
          await route.abort('blockedbyclient');
          return;
        }
        const url = new URL(request.url());
        if (url.pathname.endsWith('/api/translations')) {
          const language = url.searchParams.get('where[language][equals]')
            ?? url.searchParams.get('where[and][1][language][equals]');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': new URL(viewerUrl).origin, 'Access-Control-Allow-Credentials': 'true' },
            body: JSON.stringify({ docs: language && language !== 'pt-BR' ? [] : records, totalDocs: records.length, limit: records.length, page: 1, totalPages: 1 }),
          });
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
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const currentZoom = Number((await zoomLabel.innerText()).replace('%', '').trim());
        if (currentZoom === zoom) break;
        await page.locator(currentZoom > zoom ? 'button[title="Zoom Out"]' : 'button[title="Zoom In"]').click();
      }
      assert.equal(Number((await zoomLabel.innerText()).replace('%', '').trim()), zoom);
      await page.evaluate(() => document.fonts.ready);
      const measurements = [];
      for (const candidate of proposal.candidates) {
        const target = page.locator(`[data-rendered-translation-key="${candidate.spanKey}"]`);
        await target.waitFor({ state: 'visible', timeout: 20000 });
        const dom = await target.evaluate(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
            .map(rect => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }));
          // Credit-unit records are wrapped by .credit-field; legacy block
          // overrides expose their actual PageRenderer frame on .realbox.
          const fieldRect = (element.closest('.credit-field') ?? element).getBoundingClientRect();
          if (!fieldRect) throw new Error('A rating row has no measured source frame');
          return {
            text: element.textContent,
            rects,
            field: { top: fieldRect.top, bottom: fieldRect.bottom, left: fieldRect.left, right: fieldRect.right },
            fontLoaded: Array.from(element.querySelectorAll('span')).map(span => getComputedStyle(span).font)
              .filter(font => font.trim()).every(font => document.fonts.check(font)),
          };
        });
        const rows = groupPageRendererVisualLines(dom.rects, [], 4.5);
        // The original single-line PDF fields are font-size high in the
        // PageRenderer DOM, while glyph Range boxes include normal ascender/
        // descender ink beyond that CSS line box. Keep the pixel comparison,
        // with a 3px rendered-ink allowance; row count and neighbor checks
        // catch actual wraps that intrude into the next source row.
        const renderScale = zoom / 100;
        const frameOverflow = dom.rects.some(rect => rect.left < dom.field.left - renderScale || rect.right > dom.field.right + renderScale
          || rect.top < dom.field.top - 3 * renderScale || rect.bottom > dom.field.bottom + 3 * renderScale);
        const otherFrames = await page.evaluate(keys => keys.map(key => {
          const node = document.querySelector(`[data-rendered-translation-key="${key}"]`);
          const rect = node ? (node.closest('.credit-field') ?? node).getBoundingClientRect() : null;
          return rect ? { key, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null;
        }).filter(Boolean), proposal.candidates.filter(item => item.spanKey !== candidate.spanKey).map(item => item.spanKey));
        const intersectsNeighbor = dom.rects.some(rect => otherFrames.some(other =>
          rect.top < other.bottom - 1 && rect.bottom > other.top + 1 && rect.left < other.right && rect.right > other.left));
        const sourceCount = sourceLineCounts.get(candidate.spanKey);
        const classification = rows.length === sourceCount ? 'EXACT' : rows.length < sourceCount ? 'UNDER' : 'OVER';
        measurements.push({
          spanKey: candidate.spanKey,
          sourceText: candidate.sourceText,
          proposalText: dom.text,
          sourcePdfVisualLineCount: sourceCount,
          pageRendererVisualLineCount: rows.length,
          classification,
          renderedRows: rows,
          frame: dom.field,
          frameOverflow,
          intersectsNeighbor,
          fontLoaded: dom.fontLoaded,
        });
      }
      const result = {
        page: 102,
        variant: variant.id,
        zoomPercent: zoom,
        measurementBasis: 'Source PDF span origins grouped by baseline through Copyfit V3 analyzeSourceBlock; live PageRenderer text rects grouped by the existing Copyfit V3 visual-row grouper',
        rows: measurements,
        allRowsPass: measurements.every(row => row.classification !== 'OVER' && !row.frameOverflow && !row.intersectsNeighbor && row.fontLoaded),
        blockedWrites: blockedWrites.filter(item => item.variant === variant.id && item.zoom === zoom),
        pageErrors: pageErrors.filter(item => item.variant === variant.id && item.zoom === zoom),
      };
      result.allRowsPass = result.allRowsPass && result.blockedWrites.length === 0 && result.pageErrors.length === 0;
      attempts.push(result);
      await page.locator(`[data-rendered-translation-key="${proposal.candidates[0].spanKey}"]`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(outputDir, `${variant.id}-${zoom}pct.png`), fullPage: true });
      await writeFile(resolve(outputDir, `${variant.id}-${zoom}pct.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const summary = {
  schemaVersion: 1,
  page: 102,
  sourceUnitCount: proposal.candidates.length,
  sourceLinesPerUnit: 1,
  payloadHumanTranslationsAbsentBefore: true,
  payloadWriteRequestsBlocked: blockedWrites.length,
  noPayloadWrites: blockedWrites.length === 0,
  attempts,
};
await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  outputDir,
  attempts: attempts.map(attempt => ({ variant: attempt.variant, zoomPercent: attempt.zoomPercent, allRowsPass: attempt.allRowsPass,
    classifications: Object.fromEntries(attempt.rows.map(row => [row.proposalText, row.classification])),
    frameOverflows: attempt.rows.filter(row => row.frameOverflow).map(row => row.proposalText),
  })),
  blockedWrites: blockedWrites.length,
  pageErrors: pageErrors.length,
}, null, 2));
