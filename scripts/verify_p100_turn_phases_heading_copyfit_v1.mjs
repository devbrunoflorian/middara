import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { analyzeSourceBlock, classifyCopyfitVisualLines, getCopyfitVisualLineGateStatus, groupPageRendererVisualLines, resolveSemanticTextFlowCorridor, searchSemanticFlowWidth } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://localhost:8080';
const pageNumber = Number(process.argv[7] ?? 100);
assert.ok(Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 102, 'Use a PDF page number from 1 to 102');
const pageTag = String(pageNumber).padStart(3, '0');
const pageData = JSON.parse(await readFile(resolve(root, `apps/web/public/pages/page_${pageTag}/page_${pageTag}_dom.json`), 'utf8'));
const sourceBlockId = process.argv[4] ?? 'block_22';
const proposalPath = process.argv[5] ? resolve(root, process.argv[5]) : null;
const sourceUnitId = process.argv[6]?.startsWith('--') ? null : process.argv[6] ?? null;
const includeAllProposalUnits = process.argv.includes('--include-all-proposal-units');
const runSemanticWidthPreflight = process.argv.includes('--semantic-width-preflight');
const sourceBlock = pageData.blocks.find(block => block.id === sourceBlockId);
assert.ok(sourceBlock, `The p.${pageNumber} source block ${sourceBlockId} is missing`);
const blockIndex = pageData.blocks.indexOf(sourceBlock);
const sourceUnit = sourceUnitId
  ? sourceBlock.typographicSpanUnits?.find(unit => unit.id === sourceUnitId)
  : null;
assert.ok(!sourceUnitId || sourceUnit, `The typographic source unit ${sourceUnitId} is missing`);
const sourceUnitLineIds = new Set(sourceUnit?.spanRefs.map(reference => reference.slice(0, reference.lastIndexOf(':'))) ?? []);
const measuredSourceBlock = sourceUnit
  ? { ...sourceBlock, lines: sourceBlock.lines.filter(line => sourceUnitLineIds.has(line.id)) }
  : sourceBlock;
const sourcePdfVisualLineCount = analyzeSourceBlock(measuredSourceBlock).lineCount;
assert.ok(sourcePdfVisualLineCount > 0, 'The source block has no measured PDF visual baselines');
const spanKey = sourceUnit
  ? `page_${pageNumber}_unit_${sourceUnit.id}__pt-BR`
  : `page_${pageNumber}_block_${blockIndex}__pt-BR`;
const targetText = process.argv[2] ?? (sourceBlockId === 'block_30'
  ? 'Tabela 12: Fases do Turno do Aventureiro'
  : 'FASES DO TURNO DE UM AVENTUREIRO');
const zoom = Number(process.argv[3] ?? 100);
assert.ok([100, 125, 150, 175, 200].includes(zoom), 'Use a supported 25% zoom step between 100% and 200%');
const sourceSpan = sourceBlock.lines[0].spans[0];
const sourceFrameReferenceLine = sourceBlock.lines[0];
const sourceUnitFrameLines = sourceUnit ? measuredSourceBlock.lines.map(line => ({
  id: line.id,
  bbox: line.bbox,
  availableX: line.availableX ?? line.bbox[0],
  availableWidth: line.availableWidth ?? sourceBlock.bbox[2] - line.bbox[0],
})) : [];
const defaultData = {
  schemaVersion: 2,
  spanKey,
  bbox: sourceBlock.bbox,
  textAlign: 'left',
  lineHeight: 1,
  lineHeightMode: 'source',
  segments: [{
    text: targetText,
    font: sourceSpan.font,
    size: sourceSpan.size,
    weight: sourceSpan.font.includes('Bold') ? 700 : 400,
    style: sourceSpan.font.includes('Italic') ? 'italic' : 'normal',
    color: sourceSpan.color,
    disableLigatures: true,
  }],
  managedSourceSymbols: [],
};
let data = defaultData;
let proposalCandidate = null;
let proposalCandidates = [];
if (proposalPath) {
  assert.ok(proposalPath.startsWith(`${root}${sep}`), 'Proposal path must stay inside the repository');
  const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
  proposalCandidates = proposal.candidates;
  const candidate = proposal.candidates.find(item => sourceUnitId
    ? item.sourceUnitId === sourceUnitId
    : item.sourceBlockId === sourceBlockId);
  assert.ok(candidate, `The proposal candidate for ${sourceBlockId} is missing`);
  assert.ok(candidate.data && candidate.data.spanKey === spanKey, 'The proposal rich data must preserve this source unit key');
  assert.equal(targetText, candidate.proposalText, 'Do not reflow or rewrite the rich proposal candidate during measurement');
  proposalCandidate = candidate;
  data = candidate.data;
} else if (pageNumber === 100 && sourceBlockId === 'block_30') {
  const existingProposal = JSON.parse(await readFile(resolve(root, 'docs/translations/proposals/page-100-table12-title-proposal-2026-10-16-v1.json'), 'utf8'));
  const existingCandidate = existingProposal.candidates.find(candidate => candidate.sourceBlockId === sourceBlockId);
  assert.ok(existingCandidate, 'The existing p.100 Table 12 title proposal is missing');
  assert.equal(targetText, existingCandidate.proposalText, 'Do not reflow or rewrite the rich title candidate in this measurement');
  data = existingCandidate.data;
}
const renderedTargetText = (data.segments ?? []).filter(segment => !segment.symbolId
  && !String(segment.text ?? '').includes('\uFFFC')).map(segment => String(segment.text ?? '')).join('');
const expectedSymbolIds = (data.segments ?? []).flatMap(segment => segment.symbolId
  ? Array.from(String(segment.text || '\uFFFC')).map(() => segment.symbolId) : []);

const existingResponse = await fetch(`${apiUrl}/api/translations?where%5BspanKey%5D%5Bequals%5D=${encodeURIComponent(spanKey)}&where%5Blanguage%5D%5Bequals%5D=pt-BR`, {
  signal: AbortSignal.timeout(15000),
});
assert.ok(existingResponse.ok, `Read-only Payload preflight failed: ${existingResponse.status}`);
const existing = await existingResponse.json();
assert.equal(existing.docs?.length ?? 0, 0, 'A saved human translation exists; refusing to mask it with this proposal');
if (includeAllProposalUnits) {
  for (const candidate of proposalCandidates) {
    const preflight = await fetch(`${apiUrl}/api/translations?where%5BspanKey%5D%5Bequals%5D=${encodeURIComponent(candidate.spanKey)}&where%5Blanguage%5D%5Bequals%5D=pt-BR`, {
      signal: AbortSignal.timeout(15000),
    });
    assert.ok(preflight.ok, `Read-only Payload preflight failed for ${candidate.spanKey}: ${preflight.status}`);
    const payload = await preflight.json();
    assert.equal(payload.docs?.length ?? 0, 0, `A saved human translation exists for ${candidate.spanKey}; refusing to mask it with this proposal`);
  }
}

const outputDir = resolve(root, `apps/web/output/p${pageNumber}-${sourceBlockId}-copyfit-v1`);
await mkdir(outputDir, { recursive: true });
const slug = targetText.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 48).replace(/-$/u, '');
const blockedWrites = [];
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.method().toUpperCase() !== 'GET') {
      blockedWrites.push({ method: request.method(), url: request.url() });
      await route.abort('blockedbyclient');
      return;
    }
    const url = new URL(request.url());
    if (url.pathname.endsWith('/api/translations')) {
      const lang = url.searchParams.get('where[language][equals]')
        ?? url.searchParams.get('where[and][1][language][equals]');
      const key = url.searchParams.get('where[spanKey][equals]')
        ?? url.searchParams.get('where[and][0][spanKey][equals]');
      const candidatesToRender = includeAllProposalUnits ? proposalCandidates : [proposalCandidate].filter(Boolean);
      const matchingCandidates = key
        ? candidatesToRender.filter(candidate => candidate.spanKey === key)
        : candidatesToRender;
      const docs = lang && lang !== 'pt-BR' ? [] : matchingCandidates.map(candidate => ({
        id: `isolated-${candidate.spanKey}`,
        spanKey: candidate.spanKey,
        language: 'pt-BR',
        data: candidate.data,
      }));
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
  await pageInput.fill(String(pageNumber));
  await pageInput.press('Enter');
  await page.waitForFunction(({ expectedPage, expectedBackground }) => document.querySelector('input.page-input')?.value === expectedPage
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes(expectedBackground)
    && document.querySelector('.page-container img')?.naturalWidth > 0, {
      expectedPage: String(pageNumber),
      expectedBackground: `page_${pageTag}/background.webp`,
    });
  await page.locator('select.language-select').selectOption('pt-BR');
  const zoomLabel = page.locator('.zoom-level');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentZoom = Number((await zoomLabel.innerText()).replace('%', '').trim());
    if (currentZoom === zoom) break;
    await page.locator(currentZoom > zoom ? 'button[title="Zoom Out"]' : 'button[title="Zoom In"]').click();
  }
  const actualZoom = Number((await zoomLabel.innerText()).replace('%', '').trim());
  assert.equal(actualZoom, zoom, `Could not set app zoom to ${zoom}%`);
  try {
    await page.waitForFunction(({ expectedKey, expectedText }) => {
      const normalize = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
      return normalize(document.querySelector(`[data-rendered-translation-key="${expectedKey}"]`)?.textContent)
        .includes(normalize(expectedText));
    },
    { expectedKey: spanKey, expectedText: renderedTargetText });
  } catch (error) {
    const diagnostic = await page.evaluate(({ expectedKey, expectedPage }) => ({
      page: document.querySelector('input.page-input')?.value ?? null,
      requestedKey: expectedKey,
      matchingElementText: document.querySelector(`[data-rendered-translation-key="${expectedKey}"]`)?.textContent ?? null,
      renderedKeysOnPage: Array.from(document.querySelectorAll('[data-rendered-translation-key]'))
        .map(node => node.getAttribute('data-rendered-translation-key'))
      .filter(key => key?.startsWith(`page_${expectedPage}_`)).slice(0, 80),
      matchingLocalDraftKeys: Object.keys(localStorage).filter(key => key.includes(expectedKey.replace(/__pt-BR$/u, ''))),
    }), { expectedKey: spanKey, expectedPage: pageNumber });
    console.error(`PageRenderer candidate was not observable: ${JSON.stringify(diagnostic)}`);
    throw error;
  }

  const measured = await page.evaluate(({ expectedKey, expectedText, sourceFrame, expectedSymbolIds }) => {
    const text = document.querySelector(`[data-rendered-translation-key="${expectedKey}"]`);
    const field = text?.closest('.credit-field, .block-container');
    const normalize = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
    if (!text || !field || !normalize(text.textContent).includes(normalize(expectedText))) {
      throw new Error('Candidate is not rendered in a PageRenderer field');
    }
    const actualSymbolIds = Array.from(text.querySelectorAll('[data-symbol-id]'))
      .map(node => node.getAttribute('data-symbol-id')).filter(Boolean);
    const counts = values => Object.fromEntries([...new Set(values)].sort().map(id => [id, values.filter(value => value === id).length]));
    const expectedSymbolCounts = counts(expectedSymbolIds);
    const actualSymbolCounts = counts(actualSymbolIds);
    const symbolIntegrity = JSON.stringify(expectedSymbolCounts) === JSON.stringify(actualSymbolCounts);
    const range = document.createRange();
    range.selectNodeContents(text);
    const rects = Array.from(range.getClientRects())
      .filter(rect => rect.width > 0 && rect.height > 0)
      .filter((rect, index, all) => all.findIndex(candidate => Math.abs(candidate.left - rect.left) < 0.25
        && Math.abs(candidate.top - rect.top) < 0.25 && Math.abs(candidate.right - rect.right) < 0.25
        && Math.abs(candidate.bottom - rect.bottom) < 0.25) === index);
    const symbolRects = Array.from(text.querySelectorAll('[data-symbol-id]')).map(node => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }).filter(rect => rect.right > rect.left && rect.bottom > rect.top);
    const inlineSymbolRects = symbolRects.map(rect => {
      const line = rects.reduce((best, candidate) => {
        const overlap = Math.max(0, Math.min(candidate.bottom, rect.bottom) - Math.max(candidate.top, rect.top));
        return overlap > (best?.overlap ?? 0) ? { top: candidate.top, overlap } : best;
      }, null);
      return { rect, lineTop: line?.top ?? null };
    });
    const fieldRect = field.getBoundingClientRect();
    const measureBox = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      return {
        tagName: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        display: computed.display,
        boxSizing: computed.boxSizing,
        width: computed.width,
        minWidth: computed.minWidth,
        maxWidth: computed.maxWidth,
        paddingLeft: computed.paddingLeft,
        paddingRight: computed.paddingRight,
        columnGap: computed.columnGap,
        flex: computed.flex,
        whiteSpace: computed.whiteSpace,
      };
    };
    const sourceLine = text.closest('[data-source-line-id]');
    const pageContainer = text.closest('.page-container');
    const ancestorBoxes = [];
    for (let node = text, depth = 0; node && depth < 5; node = node.parentElement, depth += 1) {
      ancestorBoxes.push(measureBox(node));
    }
    const sourceLineScale = sourceFrame?.unitLines?.length && sourceFrame.referenceAvailableWidth > 0
      ? fieldRect.width / sourceFrame.referenceAvailableWidth
      : 0;
    const sourceUnitFrame = sourceLineScale > 0
      ? {
          left: fieldRect.left + (Math.min(...sourceFrame.unitLines.map(line => line.availableX)) - sourceFrame.referenceX) * sourceLineScale,
          top: fieldRect.top + (Math.min(...sourceFrame.unitLines.map(line => line.bbox[1])) - sourceFrame.referenceY) * sourceLineScale,
          right: fieldRect.left + (Math.max(...sourceFrame.unitLines.map(line => line.availableX + line.availableWidth)) - sourceFrame.referenceX) * sourceLineScale,
          bottom: fieldRect.top + (Math.max(...sourceFrame.unitLines.map(line => line.bbox[3])) - sourceFrame.referenceY) * sourceLineScale,
        }
      : null;
    const frameRect = sourceUnitFrame ?? fieldRect;
    const escapes = [...rects, ...symbolRects].some(rect => {
      // DOM Range text boxes include the font's line box and can start a few
      // pixels above the source field's PDF bbox without visible ink clipping.
      const fontMetricAllowancePx = Math.max(2.25, rect.height * 0.14);
      return rect.left < frameRect.left - 1 || rect.right > frameRect.right + 1
        || rect.top < frameRect.top - fontMetricAllowancePx
        || rect.bottom > frameRect.bottom + fontMetricAllowancePx;
    });
    const style = getComputedStyle(text.firstElementChild ?? text);
    const wrapperStyle = getComputedStyle(text);
    return {
      text: text.textContent,
      wrapperTextStroke: wrapperStyle.webkitTextStroke,
      wrapperTextStrokeWidth: Number.parseFloat(wrapperStyle.webkitTextStrokeWidth) || 0,
      segmentNodes: Array.from(text.children).map(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          text: node.textContent,
          display: style.display,
          whiteSpace: style.whiteSpace,
          textStroke: style.webkitTextStroke,
          textStrokeWidth: Number.parseFloat(style.webkitTextStrokeWidth) || 0,
          color: style.color,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }),
      inkRects: rects.map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })),
      inlineSymbolRects,
      expectedSymbolIds,
      actualSymbolIds,
      expectedSymbolCounts,
      actualSymbolCounts,
      symbolIntegrity,
      frame: {
        x: frameRect.left,
        y: frameRect.top,
        width: frameRect.right - frameRect.left,
        height: frameRect.bottom - frameRect.top,
      },
      pageRendererContainerFrame: { x: fieldRect.x, y: fieldRect.y, width: fieldRect.width, height: fieldRect.height },
      renderedUnitBox: measureBox(text),
      sourceLineBox: measureBox(sourceLine),
      sourceLineAvailableX: sourceLine?.getAttribute('data-source-line-available-x') ?? null,
      sourceLineAvailableWidth: sourceLine?.getAttribute('data-source-line-available-width') ?? null,
      ancestorBoxes,
      pageContainerFrame: measureBox(pageContainer),
      frameDerivedFromSourceUnitLines: Boolean(sourceUnitFrame),
      textEscapesFrame: escapes,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontLoaded: document.fonts.check('700 8px OptimaLTStd'),
    };
  }, {
    expectedKey: spanKey,
    expectedText: renderedTargetText,
    expectedSymbolIds,
    sourceFrame: sourceUnit ? {
      referenceX: sourceFrameReferenceLine.availableX ?? sourceFrameReferenceLine.bbox[0],
      referenceY: sourceFrameReferenceLine.bbox[1],
      referenceAvailableWidth: sourceFrameReferenceLine.availableWidth
        ?? sourceBlock.bbox[2] - sourceFrameReferenceLine.bbox[0],
      unitLines: sourceUnitFrameLines,
    } : null,
  });

  let semanticWidthPreflight = null;
  if (runSemanticWidthPreflight) {
    assert.ok(proposalCandidate && !sourceUnit, 'Semantic width preflight currently requires a block-level proposal candidate');
    assert.ok(proposalCandidate.copyfitSemanticFlow, 'Candidate must include measured copyfitSemanticFlow evidence');
    assert.ok(Array.isArray(data.bbox) && data.bbox.length === 4, 'Candidate must retain a PDF-space bbox');
    const pageScale = measured.pageContainerFrame.rect.width / pageData.width;
    assert.ok(Number.isFinite(pageScale) && pageScale > 0, 'Could not derive CSS pixels per PDF point from the live Viewer page');
    const currentFrame = {
      xPt: (measured.pageRendererContainerFrame.x - measured.pageContainerFrame.rect.x) / pageScale,
      yPt: (measured.pageRendererContainerFrame.y - measured.pageContainerFrame.rect.y) / pageScale,
      widthPt: measured.pageRendererContainerFrame.width / pageScale,
      heightPt: measured.pageRendererContainerFrame.height / pageScale,
    };
    const corridor = resolveSemanticTextFlowCorridor({
      currentFrame,
      ...proposalCandidate.copyfitSemanticFlow,
    });

    const frameXAtWidth = widthPt => corridor.alignmentAnchor === 'center'
      ? (corridor.preservedCenterAnchorPt ?? (currentFrame.xPt + currentFrame.widthPt / 2)) - widthPt / 2
      : corridor.alignmentAnchor === 'right'
        ? currentFrame.xPt + currentFrame.widthPt - widthPt
        : currentFrame.xPt;
    const measureAtWidth = async (widthPt, xPt = currentFrame.xPt) => page.evaluate(({ expectedKey, expectedText, expectedSymbolIds, widthPt, xPt, pageScale }) => {
      const text = document.querySelector(`[data-rendered-translation-key="${expectedKey}"]`);
      const field = text?.closest('.credit-field, .block-container');
      const pageContainer = text?.closest('.page-container');
      if (!text || !field || !pageContainer) throw new Error('Candidate or PageRenderer field is unavailable during width probe');
      const cssWidth = `${widthPt * pageScale}px`;
      const cssLeft = `${xPt * pageScale}px`;
      // This is a proposal-only in-memory measurement. The width is applied to
      // both the field and its actual flow box. Center/right anchors move the
      // frame edge while preserving its measured anchor; Y, height, font and spans stay fixed.
      field.style.setProperty('left', cssLeft, 'important');
      field.style.setProperty('width', cssWidth, 'important');
      text.style.setProperty('width', cssWidth, 'important');
      const rangeRects = node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
          .map(rect => ({ x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
            width: rect.width, height: rect.height, top: rect.top, left: rect.left }));
      };
      const dedupe = rects => rects.filter((rect, index, all) => all.findIndex(other =>
        Math.abs(other.left - rect.left) < 0.25 && Math.abs(other.top - rect.top) < 0.25
        && Math.abs(other.right - rect.right) < 0.25 && Math.abs(other.bottom - rect.bottom) < 0.25) === index);
      const inkRects = dedupe(rangeRects(text));
      const symbolNodes = Array.from(text.querySelectorAll('[data-symbol-id]'));
      const actualSymbolIds = symbolNodes.map(node => node.getAttribute('data-symbol-id')).filter(Boolean);
      const counts = values => Object.fromEntries([...new Set(values)].sort().map(id => [id, values.filter(value => value === id).length]));
      const expectedSymbolCounts = counts(expectedSymbolIds);
      const actualSymbolCounts = counts(actualSymbolIds);
      const symbolIntegrity = JSON.stringify(expectedSymbolCounts) === JSON.stringify(actualSymbolCounts);
      const symbolRects = dedupe(symbolNodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }).filter(rect => rect.right > rect.left && rect.bottom > rect.top));
      const inlineSymbolRects = symbolRects.map(rect => {
        const line = inkRects.reduce((best, candidate) => {
          const overlap = Math.max(0, Math.min(candidate.bottom, rect.bottom) - Math.max(candidate.top, rect.top));
          return overlap > (best?.overlap ?? 0) ? { top: candidate.top, overlap } : best;
        }, null);
        return { rect, lineTop: line?.top ?? null };
      });
      const fieldRect = field.getBoundingClientRect();
      const pageRect = pageContainer.getBoundingClientRect();
      const fontMetricAllowancePx = Math.max(2.25, ...inkRects.map(rect => rect.height * 0.14));
      const textEscapesFrame = [...inkRects, ...symbolRects].some(rect => rect.left < fieldRect.left - 1 || rect.right > fieldRect.right + 1
        || rect.top < fieldRect.top - fontMetricAllowancePx || rect.bottom > fieldRect.bottom + fontMetricAllowancePx);
      const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      const otherTextNodes = Array.from(pageContainer.querySelectorAll('text, [data-rendered-translation-key]'))
        .filter(node => node !== text && !text.contains(node) && !node.contains(text));
      const collidingNodes = otherTextNodes.flatMap(node => {
        const key = node.getAttribute('data-rendered-translation-key') ?? node.closest('[data-rendered-translation-key]')?.getAttribute('data-rendered-translation-key') ?? null;
        const overlap = dedupe(rangeRects(node)).some(other => [...inkRects, ...symbolRects].some(ink => intersects(ink, other)));
        return overlap ? [{ key, text: String(node.textContent ?? '').slice(0, 100) }] : [];
      });
      const segmentNodes = Array.from(text.children);
      const fontLoaded = segmentNodes.length > 0 && segmentNodes.every(node => {
        const style = getComputedStyle(node);
        return document.fonts.check(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
      });
      return {
        text: text.textContent,
        lineRects: inkRects,
        inlineSymbolRects,
        frame: { x: fieldRect.x, y: fieldRect.y, width: fieldRect.width, height: fieldRect.height,
          xInPagePt: (fieldRect.left - pageRect.left) / pageScale },
        textEscapesFrame,
        overflow: textEscapesFrame,
        collidingNodes,
        collision: collidingNodes.length > 0,
        expectedSymbolIds,
        actualSymbolIds,
        expectedSymbolCounts,
        actualSymbolCounts,
        symbolIntegrity,
        fontLoaded,
        geometryPass: !textEscapesFrame && collidingNodes.length === 0 && fontLoaded && symbolIntegrity,
      };
    }, { expectedKey: spanKey, expectedText: renderedTargetText, expectedSymbolIds, widthPt, xPt, pageScale });

    const initialWidthMeasurement = await measureAtWidth(currentFrame.widthPt, currentFrame.xPt);
    const initialVisualLineCount = groupPageRendererVisualLines(initialWidthMeasurement.lineRects.map(rect => ({
      top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
    })), initialWidthMeasurement.inlineSymbolRects).length;
    if (initialVisualLineCount > sourcePdfVisualLineCount) {
      assert.equal(corridor.confidence, 'high', `Unsafe semantic corridor: ${JSON.stringify(corridor)}`);
      assert.equal(corridor.automaticProposalAllowed, true, 'Semantic width changes require high-confidence boundaries');
    }
    await page.locator(`[data-rendered-translation-key="${spanKey}"]`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(outputDir, `viewer-ptbr-${slug}-${actualZoom}pct.png`), fullPage: true });
    semanticWidthPreflight = await searchSemanticFlowWidth({
      corridor,
      sourceLineCount: sourcePdfVisualLineCount,
      initialMeasurement: { ...initialWidthMeasurement, lineCount: initialVisualLineCount },
      measureAtWidth: async widthPt => {
        const measurement = await measureAtWidth(widthPt, frameXAtWidth(widthPt));
        return {
          ...measurement,
          lineCount: groupPageRendererVisualLines(measurement.lineRects.map(rect => ({
            top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
          })), measurement.inlineSymbolRects).length,
        };
      },
      maxProbes: 8,
      widthTolerancePt: 0.25,
    });
    semanticWidthPreflight.corridor = corridor;
    semanticWidthPreflight.originalFrame = currentFrame;
    semanticWidthPreflight.rollbackFrame = currentFrame;
    if (semanticWidthPreflight.maximumMeasurement?.frame) {
      const maximumFrame = corridor.maximumFrame;
      const measuredMaximum = semanticWidthPreflight.maximumMeasurement.frame;
      const measuredWidthPt = measuredMaximum.width / pageScale;
      semanticWidthPreflight.measuredMaximumFramePt = {
        xPt: measuredMaximum.xInPagePt,
        yPt: (measuredMaximum.y - measured.pageContainerFrame.rect.y) / pageScale,
        widthPt: measuredWidthPt,
        heightPt: currentFrame.heightPt,
      };
      assert.ok(Math.abs(measuredWidthPt - maximumFrame.widthPt) <= 0.5,
        `Live PageRenderer did not apply the maximum safe width: ${measuredWidthPt} pt vs ${maximumFrame.widthPt} pt`);
      assert.ok(Math.abs(measuredMaximum.xInPagePt - maximumFrame.xPt) <= 0.5,
        `Live PageRenderer did not apply the maximum safe X: ${measuredMaximum.xInPagePt} pt vs ${maximumFrame.xPt} pt`);
    }
    if (semanticWidthPreflight.selectedWidthPt) {
      semanticWidthPreflight.selectedMeasurement = await measureAtWidth(
        semanticWidthPreflight.selectedWidthPt,
        semanticWidthPreflight.selectedFrame?.xPt ?? frameXAtWidth(semanticWidthPreflight.selectedWidthPt),
      );
      semanticWidthPreflight.selectedMeasurement.lineCount = groupPageRendererVisualLines(
        semanticWidthPreflight.selectedMeasurement.lineRects.map(rect => ({
          top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        })), semanticWidthPreflight.selectedMeasurement.inlineSymbolRects,
      ).length;
      const selectedFrameXPt = semanticWidthPreflight.selectedMeasurement.frame.xInPagePt;
      assert.ok(Math.abs(selectedFrameXPt - (semanticWidthPreflight.selectedFrame?.xPt ?? frameXAtWidth(semanticWidthPreflight.selectedWidthPt))) <= 0.5,
        `Live PageRenderer did not preserve the ${corridor.alignmentAnchor} anchor: ${selectedFrameXPt} pt`);
      assert.ok(Math.abs(semanticWidthPreflight.selectedMeasurement.frame.width / pageScale
        - semanticWidthPreflight.selectedFrame.widthPt) <= 0.5, 'Selected width did not match the live PageRenderer frame');
    }
    const proofWidthPt = semanticWidthPreflight.selectedWidthPt ?? semanticWidthPreflight.maximumWidthPt;
    const proofFrame = semanticWidthPreflight.selectedFrame ?? corridor.maximumFrame;
    if (Number.isFinite(proofWidthPt) && proofFrame) {
      await page.evaluate(({ expectedKey, widthPt, xPt, selectedScale }) => {
        const text = document.querySelector(`[data-rendered-translation-key="${expectedKey}"]`);
        const field = text?.closest('.credit-field, .block-container');
        if (!text || !field) throw new Error('Semantic width proof frame cannot be applied in the Viewer');
        field.style.setProperty('left', `${xPt * selectedScale}px`, 'important');
        field.style.setProperty('width', `${widthPt * selectedScale}px`, 'important');
        text.style.setProperty('width', `${widthPt * selectedScale}px`, 'important');
        field.style.setProperty('outline', '2px dashed rgb(0, 170, 255)', 'important');
        field.style.setProperty('outline-offset', '-1px', 'important');
      }, { expectedKey: spanKey, widthPt: proofWidthPt, xPt: proofFrame.xPt, selectedScale: pageScale });
      await page.locator(`[data-rendered-translation-key="${spanKey}"]`).scrollIntoViewIfNeeded();
      const suffix = !semanticWidthPreflight.widthPreflightNeeded ? 'current-frame'
        : semanticWidthPreflight.selectedWidthPt ? 'selected' : 'maximum-safe-width';
      await page.screenshot({ path: resolve(outputDir, `viewer-ptbr-${slug}-semantic-width-${suffix}-${actualZoom}pct.png`), fullPage: true });
  }
  }

  const groupedRows = groupPageRendererVisualLines(measured.inkRects.map(rect => ({
    top: rect.y, bottom: rect.y + rect.height, left: rect.x, right: rect.x + rect.width,
  })), measured.inlineSymbolRects);
  const metrics = {
    ...measured,
    sourcePdfVisualLineCount,
    pageRendererVisualLineCount: groupedRows.length,
    classification: classifyCopyfitVisualLines(sourcePdfVisualLineCount, groupedRows.length),
  };
  const underCompositionJustification = String(proposalCandidate?.underCompositionJustification ?? '').trim();
  const initialCopyfitLineCountGate = getCopyfitVisualLineGateStatus(sourcePdfVisualLineCount, groupedRows.length,
    underCompositionJustification);
  const selectedSemanticMeasurement = semanticWidthPreflight?.selectedMeasurement;
  const semanticWidthPass = semanticWidthPreflight?.status === 'WIDTH_RESOLVED'
    && ['EXACT', 'UNDER'].includes(semanticWidthPreflight.classification)
    && selectedSemanticMeasurement?.fontLoaded === true
    && selectedSemanticMeasurement?.geometryPass === true
    && selectedSemanticMeasurement?.textEscapesFrame === false
    && selectedSemanticMeasurement?.overflow === false
    && selectedSemanticMeasurement?.collision === false
    && selectedSemanticMeasurement.lineCount <= sourcePdfVisualLineCount;
  const copyfitLineCountGate = semanticWidthPass ? 'line-count-pass' : initialCopyfitLineCountGate;
  const effectiveTextEscapesFrame = semanticWidthPass ? selectedSemanticMeasurement.textEscapesFrame : metrics.textEscapesFrame;
  const effectiveGeometryPass = semanticWidthPass ? selectedSemanticMeasurement.geometryPass : !metrics.textEscapesFrame;
  const lineCountPass = copyfitLineCountGate === 'line-count-pass';
  const strokeIsolationPass = metrics.wrapperTextStrokeWidth <= 0.01;
  if (!runSemanticWidthPreflight) {
    await page.locator(`[data-rendered-translation-key="${spanKey}"]`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(outputDir, `viewer-ptbr-${slug}-${actualZoom}pct.png`), fullPage: true });
  }
  const result = {
    page: pageNumber,
    sourceBlockId,
    sourceUnitId,
    spanKey,
    candidateText: targetText,
    measurementSource: `live PageRenderer DOM Range client rects grouped by shared V3 baseline helper; source count from PDF-derived page_${pageTag}_dom.json geometry`,
    proposalFile: proposalPath ? proposalPath.slice(root.length + 1).replaceAll(sep, '/') : null,
    renderedProposalUnits: includeAllProposalUnits ? proposalCandidates.map(candidate => candidate.sourceUnitId) : [sourceUnitId].filter(Boolean),
    environment: { viewport: '2400x1400 CSS px', devicePixelRatio: 1, language: 'pt-BR', zoom: `${actualZoom}%` },
    ...metrics,
    semanticWidthPreflight,
    underCompositionJustification: underCompositionJustification || null,
    initialCopyfitLineCountGate,
    effectiveFrame: semanticWidthPass ? semanticWidthPreflight.selectedFrame
      : (semanticWidthPreflight?.measuredMaximumFramePt ?? semanticWidthPreflight?.originalFrame ?? null),
    effectiveVisualLineCount: semanticWidthPass ? selectedSemanticMeasurement.lineCount
      : (semanticWidthPreflight?.maximumMeasurement?.lineCount ?? groupedRows.length),
    copyfitLineCountGate,
    translatedWrapperStrokeIsolation: strokeIsolationPass ? 'PASS' : 'FAIL',
    blockedWrites,
    pageErrors: errors,
    humanTranslationPreflight: 'no matching saved Payload translation',
    result: lineCountPass && strokeIsolationPass && !effectiveTextEscapesFrame && effectiveGeometryPass && metrics.fontLoaded
      && measured.symbolIntegrity === true && blockedWrites.length === 0 && errors.length === 0 ? 'PASS' : 'FAIL',
  };
  await writeFile(resolve(outputDir, `${slug}-${actualZoom}pct-measurement.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
