import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { analyzeSourceBlock, classifyCopyfitVisualLines, getCopyfitVisualLineGateStatus, groupPageRendererVisualLines } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const pagePath = resolve(root, 'apps/web/public/pages/page_102/page_102_dom.json');
const inlineElementsPath = resolve(root, 'apps/web/public/pages/page_102/inline_elements.json');
const pageDom = JSON.parse(await readFile(pagePath, 'utf8'));
const inlineElements = JSON.parse(await readFile(inlineElementsPath, 'utf8')).elements;
const sourceBlock = pageDom.blocks.find(block => block.id === 'block_8');
assert.ok(sourceBlock, 'p.102 block_8 is missing');
const sourceUnit = sourceBlock.typographicUnits?.find(unit => unit.id === 'p102-conviction-value-example');
assert.ok(sourceUnit, 'The p.102 Conviction Value example unit is missing');
const sourceLines = sourceBlock.lines.filter(line => sourceUnit.field.lineIds.includes(line.id));
const measuredSource = analyzeSourceBlock({ ...sourceBlock, lines: sourceLines });
assert.equal(measuredSource.lineCount, 3, 'The PDF source visual rows must be grouped by baseline for the example unit');
const ownedSymbols = inlineElements.filter(element => element.anchor.blockId === 'block_8'
  && sourceUnit.field.lineIds.includes(element.anchor.lineId));
assert.deepEqual(ownedSymbols.map(element => element.symbolId).sort(), ['dice.orange', 'dice.red']);

const spanKey = 'page_102_unit_p102-conviction-value-example__pt-BR';
const frame = {
  schemaVersion: 2,
  spanKey,
  bbox: [...sourceUnit.field.bbox],
  textAlign: sourceUnit.field.frame.textAlign,
  lineHeight: sourceUnit.field.frame.lineHeight,
  lineHeightMode: 'source',
  managedSourceSymbols: ['dice.orange', 'dice.red'],
};
const colors = new Map(ownedSymbols.map(element => [element.symbolId, element]));
const normal = (text, size = 10) => ({ text, font: 'OptimaLTStd', size, color: '#ffffff', weight: 400, style: 'normal', disableLigatures: true });
const bold = (text, size = 10, font = 'OptimaLTStd-Bold') => ({ text, font, size, color: '#ffffff', weight: 700, style: 'normal', disableLigatures: true });
const symbol = id => {
  const element = colors.get(id);
  return {
    text: '\uFFFC', symbolId: id,
    symbolMetrics: {
      ...element.metrics,
      gapEm: element.anchor.gapPt / element.anchor.sizePt,
    },
    font: 'OptimaLTStd-Bold', size: element.anchor.sizePt, color: '#ffffff', weight: 700, style: 'normal', disableLigatures: true,
  };
};
const variants = [
  {
    id: 'se-a-miniatura-tivesse-um-dado',
    text: 'Exemplo: Se a miniatura tivesse um dado de Convicção laranja [dado laranja] e outro vermelho [dado vermelho], seu Valor de Convicção seria 8 (5 + 3).',
    segments: [
      bold('Exemplo: ', 12, 'AGaramondPro-Bold'),
      normal('Se a miniatura tivesse um dado de Convicção '), bold('laranja', 8.8477), symbol('dice.orange'),
      normal(' e outro '), bold('vermelho', 8.8477), symbol('dice.red'),
      normal(', seu Valor de Convicção seria '), bold('8'), normal(' ('), bold('5 + 3'), normal(').'),
    ],
  },
  {
    id: 'se-a-miniatura-tivesse-um-dado-redacao-compacta',
    text: 'Exemplo: Se a miniatura tivesse dados de Convicção laranja [dado laranja] e vermelho [dado vermelho], seu Valor de Convicção seria 8 (5 + 3).',
    segments: [
      bold('Exemplo: ', 12, 'AGaramondPro-Bold'),
      normal('Se a miniatura tivesse dados de Convicção '), bold('laranja', 8.8477), symbol('dice.orange'),
      normal(' e '), bold('vermelho', 8.8477), symbol('dice.red'),
      normal(', seu Valor de Convicção seria '), bold('8'), normal(' ('), bold('5 + 3'), normal(').'),
    ],
  },
  {
    id: 'com-um-dado-de-conviccao',
    text: 'Exemplo: Com um dado de Convicção laranja [dado laranja] e outro vermelho [dado vermelho], o Valor de Convicção da miniatura seria 8 (5 + 3).',
    segments: [
      bold('Exemplo: ', 12, 'AGaramondPro-Bold'),
      normal('Com um dado de Convicção '), bold('laranja', 8.8477), symbol('dice.orange'),
      normal(' e outro '), bold('vermelho', 8.8477), symbol('dice.red'),
      normal(', o Valor de Convicção da miniatura seria '), bold('8'), normal(' ('), bold('5 + 3'), normal(').'),
    ],
  },
];

const preflightUrl = new URL('/api/translations', apiUrl);
preflightUrl.searchParams.set('where[spanKey][equals]', spanKey);
preflightUrl.searchParams.set('where[language][equals]', 'pt-BR');
const preflight = await fetch(preflightUrl, { signal: AbortSignal.timeout(15000) });
assert.ok(preflight.ok, `Read-only Payload preflight failed: ${preflight.status}`);
const saved = await preflight.json();
assert.equal(saved.docs?.length ?? 0, 0, 'A human PT-BR translation already exists for this example; refusing to overlay it');

const outputDir = resolve(root, 'apps/web/output/p102-conviction-value-example-copyfit-v1');
await mkdir(outputDir, { recursive: true });
const resultRows = [];
const allRequests = [];
const blockedWrites = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const variant of variants) {
    const data = { ...frame, segments: variant.segments };
    const record = { id: `isolated-${variant.id}`, spanKey, language: 'pt-BR', data };
    for (const zoom of [100, 200]) {
      const context = await browser.newContext({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
      await context.route('**/*', async route => {
        const request = route.request();
        const method = request.method().toUpperCase();
        allRequests.push({ method, url: request.url() });
        if (method !== 'GET') {
          blockedWrites.push({ method, url: request.url(), variant: variant.id, zoom });
          await route.abort('blockedbyclient');
          return;
        }
        const url = new URL(request.url());
        if (url.pathname.endsWith('/api/translations')) {
          const language = url.searchParams.get('where[language][equals]')
            ?? url.searchParams.get('where[and][1][language][equals]');
          const requestedKey = url.searchParams.get('where[spanKey][equals]')
            ?? url.searchParams.get('where[and][0][spanKey][equals]');
          const docs = language && language !== 'pt-BR' ? []
            : requestedKey && requestedKey !== spanKey ? [] : [record];
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
      await page.waitForFunction(({ key, expected }) => {
        const element = document.querySelector(`[data-rendered-translation-key="${key}"]`);
        return element?.textContent?.includes(expected);
      }, { key: spanKey, expected: 'Exemplo:' });
      await page.evaluate(() => document.fonts.ready);

      const measurement = await page.evaluate(({ key, expectedSymbols }) => {
        const target = document.querySelector(`[data-rendered-translation-key="${key}"]`);
        const field = target?.closest('.credit-field');
        if (!target || !field) throw new Error('The candidate is not rendered in its PageRenderer unit frame');
        const range = document.createRange();
        range.selectNodeContents(target);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        const textRects = rects.map(rect => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }));
        const icons = Array.from(target.querySelectorAll('[data-symbol-id]')).map(element => {
          const rect = element.getBoundingClientRect();
          const slot = element.closest('.inline-semantic-symbol-slot');
          const slotRect = slot?.getBoundingClientRect();
          return {
            symbolId: element.getAttribute('data-symbol-id'),
            rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
            baselineY: slotRect?.top,
          };
        });
        const fieldRect = field.getBoundingClientRect();
        const grouped = window.__copyfitRows?.(textRects, icons) ?? null;
        const expectedIds = expectedSymbols.slice().sort();
        const actualIds = icons.map(icon => icon.symbolId).sort();
        return {
          text: target.textContent,
          visualRows: grouped,
          lineCount: grouped?.length ?? null,
          icons,
          semanticSymbolsMatch: JSON.stringify(actualIds) === JSON.stringify(expectedIds),
          fieldRect: { top: fieldRect.top, bottom: fieldRect.bottom, left: fieldRect.left, right: fieldRect.right },
          textAndIconRects: [...textRects, ...icons.map(icon => icon.rect)],
          fontStatus: document.fonts.status,
          fontChecks: Array.from(target.querySelectorAll('span')).map(span => ({ text: span.textContent, font: getComputedStyle(span).font }))
            .filter(check => check.font.trim())
            .map(check => ({ ...check, loaded: document.fonts.check(check.font) })),
          fontLoaded: Array.from(target.querySelectorAll('span')).map(span => getComputedStyle(span).font)
            .filter(font => font.trim()).every(font => document.fonts.check(font)),
        };
      }, { key: spanKey, expectedSymbols: ['dice.orange', 'dice.red'] });
      // Reuse the same Copyfit V3 visual-row grouper used by the prevalidator.
      const rows = groupPageRendererVisualLines(measurement.textAndIconRects.slice(0, measurement.textAndIconRects.length - measurement.icons.length),
        measurement.icons, 4.5);
      const field = measurement.fieldRect;
      const frameOverflow = measurement.textAndIconRects.some(rect => rect.left < field.left - 1 || rect.right > field.right + 1
        || rect.top < field.top - 1 || rect.bottom > field.bottom + 1);
      const lineClassification = classifyCopyfitVisualLines(measuredSource.lineCount, measurement.lineCount);
      const output = {
        page: 102,
        unit: sourceUnit.id,
        variant: variant.id,
        proposalText: variant.text,
        sourcePdfVisualLineCount: measuredSource.lineCount,
        pageRendererVisualLineCount: measurement.lineCount,
        classification: lineClassification,
        measurementBasis: 'PDF-extracted source span origins grouped by baseline; live PageRenderer DOM text and semantic-symbol rectangles grouped by the existing Copyfit V3 visual-row helper',
        environment: { viewport: '2400x1400 CSS px', devicePixelRatio: 1, language: 'pt-BR', zoom: `${zoom}%` },
        sourceUnitLineIds: sourceUnit.field.lineIds,
        sourceLineBaselinesPt: sourceLines.flatMap(line => line.spans.map(span => span.origin?.[1]).filter(Number.isFinite)),
        targetVisualRows: rows,
        semanticSymbolsMatch: measurement.semanticSymbolsMatch,
        semanticSymbols: measurement.icons,
        fieldRect: measurement.fieldRect,
        frameOverflow,
        fontLoaded: measurement.fontLoaded,
        renderedText: measurement.text,
        blockedWrites: blockedWrites.filter(write => write.variant === variant.id && write.zoom === zoom),
        pageErrors: pageErrors.filter(item => item.variant === variant.id && item.zoom === zoom),
      };
      output.pageRendererVisualLineCount = rows.length;
      output.classification = classifyCopyfitVisualLines(measuredSource.lineCount, rows.length);
      output.underCompositionJustification = String(variant.underCompositionJustification ?? '').trim() || null;
      output.copyfitLineCountGate = getCopyfitVisualLineGateStatus(measuredSource.lineCount, rows.length,
        variant.underCompositionJustification);
      output.result = output.copyfitLineCountGate === 'line-count-pass' && !frameOverflow && output.semanticSymbolsMatch
        && output.fontLoaded && output.blockedWrites.length === 0 && output.pageErrors.length === 0 ? 'PASS' : 'FAIL';
      resultRows.push(output);
      await page.locator(`[data-rendered-translation-key="${spanKey}"]`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(outputDir, `${variant.id}-${zoom}pct.png`), fullPage: true });
      await writeFile(resolve(outputDir, `${variant.id}-${zoom}pct.json`), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const summary = {
  schemaVersion: 1,
  page: 102,
  sourceUnit: sourceUnit.id,
  sourcePdfVisualLineCount: measuredSource.lineCount,
  sourceVisualBaselineCount: measuredSource.rows?.length ?? measuredSource.lineCount,
  measurementBasis: 'Original PDF extracted baselines and the existing Copyfit V3 PageRenderer fragment/symbol row grouper',
  attempts: resultRows,
  payloadHumanTranslationAbsentBefore: true,
  payloadWritesBlocked: allRequests.some(request => request.method !== 'GET'),
  result: resultRows.some(row => row.result === 'PASS') ? 'CANDIDATE_AVAILABLE_FOR_REVIEW' : 'DTP_EXCEPTION_REQUIRED',
};
await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
