#!/usr/bin/env node
/**
 * Copyfit V3 visual-line measurement for the active proposal candidates of one page.
 *
 *   node scripts/measure_copyfit_page.mjs <page> [--write] [--zoom 200]
 *   node scripts/measure_copyfit_page.mjs <page> --refresh-span-key <key> [--write]
 *   Repeat --refresh-span-key to batch selected units in one Viewer session.
 *
 * PDF side:  PyMuPDF text spans inside the candidate's canonical bbox, grouped by visual text-line box.
 * Viewer side: live PT-BR PageRenderer with the review panel selecting each candidate; text-node
 *              Range client rects inside the highlighted element, clustered by vertical centre.
 *
 * Default is a dry run that only prints the table. --write stores the measurement metadata
 * (counts, classification, method, environment, evidence) on the candidate in the proposal file.
 * Text, rich data and geometry are never touched. Candidates that already carry counts are kept.
 * Semantic object IDs must match the rendered Viewer IDs. Their visible rectangles are used only
 * when an object occupies a visual row without text; unresolved [[token]] values are never written.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { exposeCandidateForCopyfitPreview, exposeLayoutFramesForCopyfitPreview, exposeRequestForCopyfitPreview, exposeReviewDraftsForCopyfitPreview, selectCopyfitMeasurementPath, validatePageRendererIdentity } from './copyfit_renderer_identity.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const pageNumber = Number(args.find(arg => /^\d+$/u.test(arg)));
const write = args.includes('--write');
const previewDrafts = args.includes('--preview-drafts');
const refreshSpanKeys = args.flatMap((arg, index) => arg === '--refresh-span-key' ? [args[index + 1]] : []);
if (refreshSpanKeys.some(key => !key)) throw new Error('--refresh-span-key requires a span key.');
const requestIdIdx = args.indexOf('--request-id');
const previewRequestId = requestIdIdx >= 0 ? args[requestIdIdx + 1] : null;
if (requestIdIdx >= 0 && (!previewRequestId || !/^\d+$/u.test(previewRequestId))) {
  throw new Error('--request-id requires a numeric open-request ID and one --refresh-span-key.');
}
if (previewRequestId && refreshSpanKeys.length !== 1) {
  throw new Error('--request-id requires exactly one --refresh-span-key so the preview override stays scoped.');
}
const zoomIdx = args.indexOf('--zoom');
const zoomPercent = zoomIdx >= 0 ? Number(args[zoomIdx + 1]) : 200;
if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('Usage: measure_copyfit_page.mjs <page> [--write] [--zoom 200]');

const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const pdfPath = process.env.MIDDARA_SOURCE_PDF ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const fulfillJsonPreview = (route, upstream, payload) => route.fulfill({
  status: upstream.status(),
  contentType: 'application/json',
  body: JSON.stringify(payload),
});
const rendererKeyForCandidate = candidate => {
  const key = String(candidate.copyfitCanonicalSpanKey || candidate.spanKey || '');
  // PageRenderer emits Payload translation keys. PT-BR block overrides are
  // locale-scoped too (`page_N_block_N__pt-BR`); canonical source keys without
  // a locale suffix must be qualified before probing the live DOM.
  if (key.endsWith('__pt-BR')) return key;
  if (key.endsWith('__en')) return `${key.slice(0, -4)}__pt-BR`;
  return `${key}__pt-BR`;
};
const normalize = value => String(value ?? '')
  .replace(/\[\[[^\]]+\]\]/gu, ' ')
  // Proposal text describes these source-backed inline glyphs by semantic key,
  // while PageRenderer exposes an object replacement character. Remove that
  // object without inventing a word gap; any real spaces remain in adjacent runs.
  .replace(/\[(?:tag\.important\.icon|terrain\.red-border)\]/gu, ' ')
  .replace(/\uFFFC/gu, '')
  .replace(/\uFFFD/gu, ' ')
  .replace(/\s+/gu, ' ')
  // PageRenderer can position a list marker in a separate hanging column, so
  // Range text extraction may omit the visual gap after the bullet. Restore
  // that separator for proposal identity only; line counts still come from
  // the measured PDF and PageRenderer rectangles below.
  .replace(/•(?=\S)/gu, '• ')
  // A source-backed numbered phase uses a fixed 18 pt grid column. Its two
  // text nodes have no literal separator because the column supplies the
  // visible advance; restore that separator only for proposal identity.
  .replace(/(?<!\w)((?:[1-4]|[a-z])\.)(?=[A-Z\u00c0-\u00de])/giu, '$1 ')
  .trim();
const candidateTextForRenderer = (candidate, staticMarkerText = '', actualRenderedText = '') => {
  let text = normalize((candidate.data?.segments ?? []).map(segment => segment.text ?? '').join(''));
  const staticMarker = String(staticMarkerText).replace(/[\s\u00a0]+/gu, '');
  // Source list markers remain independently painted at the hanging indent;
  // PageRenderer removes the duplicate marker from the translated body.
  if (staticMarker && text.startsWith(staticMarker)) text = text.slice(staticMarker.length).replace(/^[\s\u00a0]+/u, '');
  else if (!staticMarker && actualRenderedText) {
    const bodyText = normalize(actualRenderedText);
    const leadingMarker = text.match(/^(?:•|(?:\d{1,2}|[a-z])\.)\s/iu)?.[0];
    if (leadingMarker && !bodyText.startsWith(leadingMarker.trim())) {
      text = text.slice(leadingMarker.length).replace(/^[\s\u00a0]+/u, '');
    }
  }
  return normalize(text);
};

const catalog = JSON.parse(readFileSync(resolve(root, 'apps/web/public/translation-review/catalog.json'), 'utf8'));
const pageCandidates = catalog.proposals.flatMap(proposal => proposal.candidates).filter(candidate => candidate.pageNumber === pageNumber);
const candidates = refreshSpanKeys.length
  ? pageCandidates.filter(candidate => refreshSpanKeys.includes(candidate.spanKey))
  : pageCandidates;
const missingRefreshKeys = refreshSpanKeys.filter(key => !candidates.some(candidate => candidate.spanKey === key));
if (missingRefreshKeys.length) throw new Error(`No candidate(s) ${missingRefreshKeys.join(', ')} on p.${pageNumber}.`);
if (!candidates.length) throw new Error(refreshSpanKeys.length
  ? `No candidate ${refreshSpanKeys.join(', ')} on p.${pageNumber}.`
  : `No active candidates on p.${pageNumber}.`);
const pending = refreshSpanKeys.length || args.includes('--all')
  ? candidates
  : candidates.filter(candidate => !(candidate.copyfitSourcePdfLineCount && candidate.copyfitPageRendererLineCount));
if (!pending.length) {
  console.log(`p.${pageNumber}: reused Copyfit V3 visual-row measurements for all ${candidates.length} candidates; skipped redundant Viewer traversal.`);
  process.exit(0);
}

// A review candidate may carry a frame that is already saved in Payload. In
// that case the live PageRenderer already uses the candidate geometry, so a
// panel-row click is unnecessary and can race with the asynchronous review
// list refresh. Only bypass selection when the persisted frame matches every
// geometric field used by canonicalCopyfitGeometry.
const persistedFrameMatches = new Map();
const framedCandidates = pending.filter(candidate => candidate.reviewLayoutFrame);
if (framedCandidates.length) {
  try {
    const url = new URL('/api/layout-frames', apiUrl);
    url.searchParams.set('where[pageNumber][equals]', String(pageNumber));
    url.searchParams.set('where[language][equals]', 'pt-BR');
    url.searchParams.set('limit', '5000');
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const payload = await response.json();
      const records = Array.isArray(payload?.docs) ? payload.docs : Array.isArray(payload) ? payload : [];
      for (const candidate of framedCandidates) {
        const canonicalKey = String(candidate.copyfitCanonicalSpanKey || candidate.spanKey || '')
          .replace(/__(?:pt-BR|en)$/u, '');
        const matching = records.filter(record => record?.frameKey === `${canonicalKey}::pt-BR`);
        if (matching.length !== 1 || !matching[0]?.data) continue;
        const saved = matching[0].data;
        const proposed = candidate.reviewLayoutFrame;
        const expected = [
          proposed.x,
          proposed.y,
          Number.isFinite(proposed.total) ? proposed.total : proposed.width,
          Number.isFinite(proposed.totalHeight) ? proposed.totalHeight : proposed.height,
        ];
        const actual = [
          saved.x,
          saved.y,
          Number.isFinite(saved.total) ? saved.total : saved.width,
          Number.isFinite(saved.totalHeight) ? saved.totalHeight : saved.height,
        ];
        const geometryMatches = expected.every((value, index) => Number.isFinite(value)
          && Number.isFinite(actual[index]) && Math.abs(value - actual[index]) <= 0.01);
        const alignmentMatches = !proposed.textAlign || proposed.textAlign === saved.textAlign;
        if (geometryMatches && alignmentMatches) persistedFrameMatches.set(candidate.reviewKey, true);
      }
    }
  } catch (error) {
    if (process.env.MIDDARA_COPYFIT_DEBUG === '1') {
      console.warn('Could not compare saved PT-BR layout frames; review rows remain required.', String(error));
    }
  }
}

// ---- PDF side -------------------------------------------------------------------------------
const pdfRequest = JSON.stringify({
  pdf: pdfPath,
  page: pageNumber - 1,
  boxes: pending.map(candidate => candidate.copyfitCanonicalBbox),
  semanticSymbols: pending.map(candidate => candidate.semanticSymbols
    ?? candidate.data?.managedSourceSymbols
    ?? candidate.data?.segments?.map(segment => segment.symbolId).filter(Boolean)
    ?? []),
});
const pdfScript = `
import sys, json, pymupdf
import re
req = json.load(sys.stdin)
doc = pymupdf.open(req["pdf"])
page = doc[req["page"]]
spans = []
for block_index, block in enumerate(page.get_text("dict")["blocks"]):
    for line_index, line in enumerate(block.get("lines", [])):
        lx0, ly0, lx1, ly1 = line["bbox"]
        for span in line["spans"]:
            if span["text"].strip():
                x0, y0, x1, y1 = span["bbox"]
                # Inline glyphs, punctuation, and trimmed whitespace can make
                # PyMuPDF split one visual baseline into separate line boxes
                # whose bbox centres differ by about 1 pt. Use the actual text
                # baseline from each span; keep the line-box centre only as a
                # fallback for spans without an origin.
                origin = span.get("origin")
                baseline = origin[1] if origin and len(origin) > 1 else (ly0 + ly1) / 2
                # Keep the source line identity: PyMuPDF can assign different
                # baselines to rich runs in one visual row (for example around
                # inline emphasis), even though they share one line box.
                spans.append((((x0 + x1) / 2), ((y0 + y1) / 2), baseline, span["text"], y0, y1, span.get("font", ""), span.get("size", 0), (block_index, line_index)))
out = []
for box_index, box in enumerate(req["boxes"]):
    if not box:
        out.append(None); continue
    pad = 1.0
    inside = [s for s in spans if box[0] - pad <= s[0] <= box[2] + pad and box[1] - pad <= s[1] <= box[3] + pad]
    # Source alphabet callout glyphs and some semantic icons are separate PDF
    # text spans from the prose. Their baselines can be shifted by their larger
    # glyph boxes even though the ink belongs to the same visual row. Fold
    # only marker spans whose vertical ink box overlaps a prose span; retain a
    # marker as its own row when no neighbouring text proves an inline
    # relationship. The star exception is scoped to candidates that declare
    # stat.scaling-star, since the OG encodes this icon as a large bold '*'.
    semantic_symbols = req.get("semanticSymbols", [[]] * len(req["boxes"]))[box_index]
    marker_spans = [s for s in inside if (
        (re.fullmatch(r"[A-Z]", s[3].strip()) and "Bold" in s[6] and 0 < s[7] <= 8.5)
        # The PDF places the Cinzel count printed beside weapon-hand icon
        # vectors on its own text baseline, offset from the surrounding
        # Optima row. When the candidate identifies a hand icon, treat that
        # standalone quantity as inline only if its ink overlaps prose.
        or (bool({"weapon.hand.one", "weapon.hand.two"} & set(semantic_symbols))
            and re.fullmatch(r"\\d{1,2}", s[3].strip())
            and s[6].startswith("Cinzel") and 0 < s[7] <= 12)
        or ("stat.scaling-star" in semantic_symbols and s[3].strip() == "*" and "Bold" in s[6] and s[7] >= 18)
    )]
    prose_spans = [s for s in inside if s not in marker_spans]
    folded_markers = 0
    standalone_markers = []
    for marker in marker_spans:
        marker_height = marker[5] - marker[4]
        overlaps_prose_row = any(
            min(prose[5], marker[5]) - max(prose[4], marker[4]) >= min(2.0, marker_height * 0.25)
            for prose in prose_spans
        )
        if overlaps_prose_row:
            folded_markers += 1
        else:
            standalone_markers.append(marker)
    row_spans = prose_spans + standalone_markers
    # First collapse rich spans belonging to the same source line object.
    # Then group distinct line objects whose representative baselines are
    # within 1 pt, covering inline objects emitted as separate PDF lines.
    source_line_baselines = {}
    for span in row_spans:
        source_line_baselines.setdefault(span[8], []).append(span[2])
    line_baselines = sorted(round(sum(values) / len(values), 3) for values in source_line_baselines.values())
    row_baselines = []
    for baseline in line_baselines:
        if not row_baselines or baseline - row_baselines[-1] > 1.0:
            row_baselines.append(baseline)
    out.append({"rows": len(row_baselines), "row_baselines": row_baselines, "source_line_objects": len(source_line_baselines), "spans": len(inside), "inline_markers_folded": folded_markers})
print(json.dumps({"page_index": req["page"], "page_width": page.rect.width, "results": out}))
`;
const pdfRun = spawnSync('python', ['-c', pdfScript], { input: pdfRequest, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (pdfRun.status !== 0) throw new Error(`PyMuPDF measurement failed: ${pdfRun.stderr}`);
const pdfResults = JSON.parse(pdfRun.stdout).results;
const pdfPageWidth = JSON.parse(pdfRun.stdout).page_width;

// ---- Viewer side ----------------------------------------------------------------------------
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const viewport = { width: 1280, height: 720 };
const dpr = 1.25;
const measurements = new Map();
const unmatchedRows = [];
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const blocked = [];
  if (previewRequestId || refreshSpanKeys.length) {
    await context.route('**/translation-review/catalog.json*', async route => {
      try {
        const upstream = await route.fetch();
        const payload = JSON.parse((await upstream.body()).toString('utf8'));
        let previewPayload = payload;
        for (const spanKey of refreshSpanKeys) {
          previewPayload = exposeCandidateForCopyfitPreview(previewPayload, { spanKey });
        }
        console.log(`Browser-only copyfit preview: cleared stale diagnostic blanks for ${refreshSpanKeys.join(', ')}; source catalog remains unchanged.`);
        await fulfillJsonPreview(route, upstream, previewPayload);
      } catch (error) {
        if (/Request context disposed|Target page, context or browser has been closed/iu.test(String(error?.message ?? error))) return;
        throw error;
      }
    });
  }
  await context.route('**/api/**', async route => {
    try {
      const method = route.request().method().toUpperCase();
      if (method !== 'GET') { blocked.push(`${method} ${route.request().url()}`); await route.abort('blockedbyclient'); return; }
      const requestUrl = new URL(route.request().url());
      if (previewDrafts && requestUrl.pathname.endsWith('/api/translation-reviews')) {
        const upstream = await route.fetch();
        const payload = JSON.parse((await upstream.body()).toString('utf8'));
        const previewPayload = exposeReviewDraftsForCopyfitPreview(payload, { candidates: pending });
        console.log(`Browser-only preview: exposed ${pending.length} proposal drafts to the review renderer; Payload remains unchanged.`);
        await fulfillJsonPreview(route, upstream, previewPayload);
        return;
      }
      if (previewDrafts && requestUrl.pathname.endsWith('/api/layout-frames')) {
        const upstream = await route.fetch();
        const payload = JSON.parse((await upstream.body()).toString('utf8'));
        const previewPayload = exposeLayoutFramesForCopyfitPreview(payload, { pageNumber, candidates: pending });
        console.log(`Browser-only preview: exposed candidate PT-BR layout frames; Payload remains unchanged.`);
        await fulfillJsonPreview(route, upstream, previewPayload);
        return;
      }
      if (previewDrafts && /\/api\/translations\/?$/u.test(requestUrl.pathname)) {
        const upstream = await route.fetch();
        const payload = JSON.parse((await upstream.body()).toString('utf8'));
        const sourceDocs = Array.isArray(payload?.docs) ? payload.docs : Array.isArray(payload) ? payload : null;
        if (!sourceDocs) throw new Error('Translations response has no document list for browser-only draft preview.');
        const docs = [...sourceDocs];
        for (const candidate of pending) {
          if (!candidate.data || !candidate.spanKey) continue;
          const index = docs.findIndex(doc => doc.spanKey === candidate.spanKey);
          const existing = index >= 0 ? docs[index] : null;
          const replacement = {
            ...(existing ?? {}),
            id: existing?.id ?? `copyfit-preview-${encodeURIComponent(candidate.spanKey)}`,
            spanKey: candidate.spanKey,
            language: 'pt-BR',
            data: candidate.data,
          };
          if (index >= 0) docs[index] = replacement;
          else docs.push(replacement);
        }
        const previewPayload = Array.isArray(payload) ? docs : { ...payload, docs };
        console.log(`Browser-only preview: exposed ${pending.length} proposal drafts to PageRenderer; Payload remains unchanged.`);
        await fulfillJsonPreview(route, upstream, previewPayload);
        return;
      }
      if (previewRequestId && requestUrl.pathname.endsWith('/api/translation-review-requests')) {
        const candidate = pending[0];
        const upstream = await route.fetch();
          const payload = JSON.parse((await upstream.body()).toString('utf8'));
        const previewPayload = exposeRequestForCopyfitPreview(payload, {
          requestId: previewRequestId,
          reviewKey: candidate.reviewKey,
          spanKey: candidate.spanKey,
        });
        console.log(`Browser-only copyfit preview: request ${previewRequestId} is treated as returned by AI; Payload remains unchanged.`);
          await fulfillJsonPreview(route, upstream, previewPayload);
        return;
      }
      await route.continue();
    } catch (error) {
      if (/Request context disposed|Target page, context or browser has been closed/iu.test(String(error?.message ?? error))) return;
      throw error;
    }
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill(String(pageNumber));
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(n => document.querySelector('input.page-input')?.value === String(n)
    && (document.querySelector('.page-container img')?.naturalWidth ?? 0) > 0, pageNumber, { timeout: 30000 });
  await page.locator('button.language-toggle-option[aria-label="Português (Brasil)"]').click();
  const zoomLabel = page.locator('.zoom-level');
  if (zoomPercent === 100 && Number.parseInt(await zoomLabel.innerText(), 10) !== zoomPercent) {
    // The Viewer has an explicit 100% control; use it instead of racing four
    // asynchronous 25% zoom clicks through the edge toolbar.
    await page.locator('button[title="Fit to Screen"], button[title="Ajustar à tela"]')
      .dispatchEvent('click');
    await page.waitForFunction(target => Number.parseInt(document.querySelector('.zoom-level')?.textContent ?? '', 10) === target,
      zoomPercent, { timeout: 5000 });
  } else {
    for (let i = 0; i < 20; i += 1) {
      const current = Number.parseInt(await zoomLabel.innerText(), 10);
      if (current === zoomPercent) break;
      await page.locator(current < zoomPercent
        ? 'button[title="Zoom In"], button[title="Aumentar zoom"]'
        : 'button[title="Zoom Out"], button[title="Diminuir zoom"]')
        .dispatchEvent('click');
      await page.waitForFunction(previous => {
        const next = Number.parseInt(document.querySelector('.zoom-level')?.textContent ?? '', 10);
        return Number.isFinite(next) && next !== previous;
      }, current, { timeout: 5000 });
    }
  }
  const zoomActual = await zoomLabel.innerText();

  if (!previewDrafts) {
    await page.locator('button.global-nav-action', { hasText: /Revisar traduções|Review translations/u }).first().dispatchEvent('click');
    await page.getByRole('tab', { name: /Propostas/u }).click();
    await page.locator('#translation-review-page').selectOption(String(pageNumber));
    // The persisted review records load asynchronously and can replace the
    // proposal list after the page filter changes. Do not select a row while
    // that replacement is still in flight; otherwise the PageRenderer highlight
    // can identify the source unit before its temporary PT-BR preview settles.
    try {
      await page.waitForFunction(() => document.querySelector('.translation-review-row-action:not(:disabled)') !== null,
        null, { timeout: 8000 });
    } catch {
      // Persisted PageRenderer overrides can be measured by their exact renderer
      // key even when a request owns the candidate and no proposal row is shown.
      console.warn('No selectable review row loaded; checking exact PageRenderer keys before marking candidates unmatched.');
    }
  }
  await page.evaluate(async () => { await document.fonts.ready; });
  if (previewDrafts) {
    const expectedRendererKeys = pending.map(rendererKeyForCandidate);
    await page.waitForFunction(keys => {
      const present = new Set(Array.from(document.querySelectorAll('[data-rendered-translation-key]'))
        .map(element => element.getAttribute('data-rendered-translation-key')));
      return keys.every(key => present.has(key));
    }, expectedRendererKeys, { timeout: 20000 });
  }
  const rowCount = previewDrafts ? 0 : await page.locator('.translation-review-row-wrap .translation-review-row').count();
  if (!previewDrafts) {
    console.log('panel rows:', rowCount, JSON.stringify(await page.locator('.translation-review-row-wrap .translation-review-row-heading').allInnerTexts()));
  }

  const byText = new Map();
  for (const candidate of pending) {
    const key = normalize(candidate.proposalText);
    byText.set(key, [...(byText.get(key) ?? []), candidate]);
  }

  const clusterRows = rects => {
    const sorted = [...rects].sort((a, b) => (a.top + a.height / 2) - (b.top + b.height / 2));
    const medianHeight = [...sorted].map(r => r.height).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
    const clustered = [];
    for (const rect of sorted) {
      const centre = rect.top + rect.height / 2;
      const last = clustered[clustered.length - 1];
      if (last && Math.abs(centre - last.centre) <= medianHeight * 0.5) { last.centre = (last.centre * last.n + centre) / (last.n + 1); last.n += 1; }
      else clustered.push({ centre, top: rect.top, n: 1 });
    }
    return clustered;
  };
  const pageRendererSnapshot = async spanKey => page.evaluate(({ key, pageWidth }) => {
    const matches = Array.from(document.querySelectorAll('[data-rendered-translation-key]'))
      .filter(element => element.getAttribute('data-rendered-translation-key') === key);
    if (matches.length !== 1) return { count: matches.length };
    const target = matches[0];
    const rects = [];
    const fontSamples = new Map();
    let text = '';
    let previousParagraph = null;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent) continue;
      const parent = node.parentElement;
      const style = parent && getComputedStyle(parent);
      if (!style || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      if (node.textContent.trim()) {
        const fontSample = {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          color: style.color,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          fontKerning: style.fontKerning,
          fontVariantLigatures: style.fontVariantLigatures,
          fontFeatureSettings: style.fontFeatureSettings,
          fontLoaded: document.fonts.check(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`),
        };
        fontSamples.set(JSON.stringify(fontSample), fontSample);
      }
      const paragraph = parent?.closest(
        '.credit-paragraph, [data-source-bullet-flow-row], [data-source-bullet-flow-prose], [data-source-numbered-list-row]',
      ) ?? null;
      if (paragraph && previousParagraph && paragraph !== previousParagraph) text += ' ';
      // Keep the block boundary across whitespace-only text nodes without a
      // paragraph wrapper so adjacent rich paragraphs retain their separator.
      if (paragraph) previousParagraph = paragraph;
      if (!node.textContent.trim()) { text += node.textContent; continue; }
      text += node.textContent;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0.5 && rect.height > 1) rects.push({ top: rect.top, height: rect.height, left: rect.left });
      }
    }
    const symbolIds = [];
    let symbolOnlyRows = 0;
    const symbols = [
      ...(target.matches('[data-symbol-id]') ? [target] : []),
      ...target.querySelectorAll('[data-symbol-id]'),
    ];
    for (const symbol of symbols) {
      const style = getComputedStyle(symbol);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const rect = symbol.getBoundingClientRect();
      if (rect.width <= 0.5 || rect.height <= 1) continue;
      const symbolId = symbol.getAttribute('data-symbol-id');
      symbolIds.push(symbolId);
      const overlapsTextRow = rects.some(textRect =>
        Math.min(rect.bottom, textRect.top + textRect.height) - Math.max(rect.top, textRect.top)
          >= Math.min(rect.height, textRect.height) * 0.35);
      if (!overlapsTextRow) {
        rects.push({ top: rect.top, height: rect.height, left: rect.left, semanticSymbolId: symbolId });
        symbolOnlyRows += 1;
      }
    }
    const frame = target.getBoundingClientRect();
    const pageImage = document.querySelector('.page-container img');
    const pageScaleCssPxPerPt = pageImage && pageWidth ? pageImage.getBoundingClientRect().width / pageWidth : null;
    const marker = target.querySelector('[data-list-marker-line]')?.textContent ?? '';
    return {
      count: 1,
      key: target.getAttribute('data-rendered-translation-key'),
      text,
      staticMarkerText: marker,
      rects,
      symbolIds,
      symbolOnlyRows,
      frameHeight: frame.height,
      frameWidth: frame.width,
      fontSamples: [...fontSamples.values()],
      pageScaleCssPxPerPt,
    };
  }, { key: spanKey, pageWidth: pdfPageWidth });
  const expectedSymbolIdsFor = candidate => (candidate.data?.segments ?? []).flatMap(segment => {
    if (!segment.symbolId) return [];
    const count = (String(segment.text ?? '').match(/\uFFFC/gu) ?? []).length || 1;
    return Array.from({ length: count }, () => segment.symbolId);
  });
  // Geometric reading of the rendered page: every visible text rect whose centre lies in the canonical bbox.
  const geometricRects = async bbox => page.evaluate(({ bbox: box, pageWidth }) => {
    const container = document.querySelector('.page-container');
    const image = container?.querySelector('img');
    if (!container || !image) return { rects: [], text: '' };
    const frame = image.getBoundingClientRect();
    const scale = frame.width / pageWidth;
    const left = frame.left + box[0] * scale - 2;
    const right = frame.left + box[2] * scale + 2;
    const top = frame.top + box[1] * scale - 2;
    const bottom = frame.top + box[3] * scale + 2;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const rects = [];
    let text = '';
    let previousParagraph = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent) continue;
      const style = node.parentElement && getComputedStyle(node.parentElement);
      if (!style || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const paragraph = node.parentElement?.closest(
        '.credit-paragraph, [data-source-bullet-flow-row], [data-source-bullet-flow-prose], [data-source-numbered-list-row]',
      ) ?? null;
      if (paragraph && previousParagraph && paragraph !== previousParagraph) text += ' ';
      if (paragraph) previousParagraph = paragraph;
      if (!node.textContent.trim()) {
        // A whitespace-only styled span can supply the visible word gap while
        // exposing no text rect; keep it for identity without counting a row.
        text += node.textContent;
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      let used = false;
      for (const rect of range.getClientRects()) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        if (rect.width > 0.5 && rect.height > 1 && cx >= left && cx <= right && cy >= top && cy <= bottom) {
          rects.push({ top: rect.top, height: rect.height, left: rect.left }); used = true;
        }
      }
      if (used) text += node.textContent;
    }
    const symbolIds = [];
    let symbolOnlyRows = 0;
    for (const symbol of container.querySelectorAll('[data-symbol-id]')) {
      const style = getComputedStyle(symbol);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const rect = symbol.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (rect.width <= 0.5 || rect.height <= 1 || cx < left || cx > right || cy < top || cy > bottom) continue;
      symbolIds.push(symbol.getAttribute('data-symbol-id'));
      // Text rectangles already represent the visual row when an icon is
      // inline with prose. Add only a symbol that occupies a row by itself.
      const overlapsTextRow = rects.some(textRect =>
        Math.min(rect.bottom, textRect.top + textRect.height) - Math.max(rect.top, textRect.top)
          >= Math.min(rect.height, textRect.height) * 0.35);
      if (!overlapsTextRow) {
        rects.push({ top: rect.top, height: rect.height, left: rect.left, semanticSymbolId: symbol.getAttribute('data-symbol-id') });
        symbolOnlyRows += 1;
      }
    }
    const staticMarkerText = target.querySelector(
      '[data-list-marker-line], [data-source-bullet-flow-marker], [data-source-numbered-list-marker]',
    )?.textContent ?? target.parentElement?.querySelector('[data-list-marker-line]')?.textContent ?? '';
    return { count: 1, rects, text, symbolIds, symbolOnlyRows, staticMarkerText };
  }, { bbox, pageWidth: pdfPageWidth });
  const headings = previewDrafts ? [] : await page.locator('.translation-review-row-wrap .translation-review-row-heading').allInnerTexts();
  if (process.env.MIDDARA_COPYFIT_DEBUG === '1') {
    console.log('review row keys:', JSON.stringify(await page.locator('.translation-review-row-wrap').evaluateAll(rows =>
      rows.map(row => row.getAttribute('data-review-key')))));
  }

  for (const candidate of pending) {
    const index = pageCandidates.indexOf(candidate);
    const rowSelector = `.translation-review-row-wrap[data-review-key=${JSON.stringify(candidate.reviewKey)}] .translation-review-row`;
    const candidateRow = page.locator(rowSelector);
    const directSnapshot = await pageRendererSnapshot(rendererKeyForCandidate(candidate));
    const rowCountForCandidate = await candidateRow.count();
    const directExpectedText = directSnapshot.count === 1
      ? candidateTextForRenderer(candidate, directSnapshot.staticMarkerText, directSnapshot.text)
      : null;
    const directIdentity = directExpectedText === null ? null : validatePageRendererIdentity({
      expectedText: directExpectedText,
      actualText: normalize(directSnapshot.text),
      expectedSymbolIds: expectedSymbolIdsFor(candidate),
      actualSymbolIds: directSnapshot.symbolIds ?? [],
    });
    const savedReviewFrameMatches = persistedFrameMatches.get(candidate.reviewKey) === true;
    const measurementPath = selectCopyfitMeasurementPath({
      // A keyed unit may still be showing its older integrated translation
      // while the proposal row holds the new pending draft. Measure the draft
      // through its review overlay in that case; only use the direct key when
      // its rendered text and semantic symbols match this exact candidate.
      pageRendererMatchCount: directIdentity?.valid ? directSnapshot.count : directSnapshot.count > 1 ? directSnapshot.count : 0,
      reviewRowCount: rowCountForCandidate,
      // A direct PageRenderer key may match the candidate's text while still
      // using the source frame. Select the review row so its proposed PT-BR
      // layout frame is materialized before collecting live line rectangles.
      // The browser-only preview API has already materialized proposed frames
      // through /api/layout-frames. Outside that isolated route, the review row
      // must still be selected to apply an unsaved candidate frame.
      // A matching frame is already present in the live PageRenderer (either
      // persisted or exposed by this read-only preview route). In that case,
      // selecting a review row would add no geometry and can race with the
      // asynchronous replacement of the proposal list.
      requiresReviewFrame: Boolean(candidate.reviewLayoutFrame && !previewDrafts && !savedReviewFrameMatches),
    });
    if (measurementPath.path === 'invalid' || measurementPath.path === 'unmatched') {
      unmatchedRows.push({ index, spanKey: candidate.spanKey, reason: directIdentity?.reason ?? measurementPath.reason });
      continue;
    }
    if (process.env.MIDDARA_COPYFIT_DEBUG === '1') {
      console.log('copyfit candidate:', candidate.spanKey, candidate.reviewKey,
        'rendererKey=', rendererKeyForCandidate(candidate), 'snapshotCount=', directSnapshot.count,
        'rowCount=', rowCountForCandidate, 'directIdentity=', directIdentity?.reason ?? (directIdentity ? 'valid' : 'not checked'),
        'savedReviewFrameMatches=', savedReviewFrameMatches,
        'actual=', normalize(directSnapshot.text).slice(0, 180), 'expected=', directExpectedText?.slice(0, 180));
    }
    if (measurementPath.path === 'page-renderer-key') {
      if (!directSnapshot.rects.length) {
        unmatchedRows.push({ index, spanKey: candidate.spanKey, reason: 'keyed PageRenderer unit has no visible text or symbol rectangles' });
        continue;
      }
      const clustered = clusterRows(directSnapshot.rects);
      measurements.set(candidate.reviewKey, {
        method: 'page-renderer-key',
        rendererKey: directSnapshot.key,
        rangeRectFragments: directSnapshot.rects.length,
        rows: clustered.length,
        symbolIds: directSnapshot.symbolIds ?? [],
        symbolOnlyRows: directSnapshot.symbolOnlyRows ?? 0,
        rowTops: clustered.map(row => Number(row.top.toFixed(2))),
        rowIntervalsPt: Number.isFinite(directSnapshot.pageScaleCssPxPerPt)
          ? clustered.slice(1).map((row, rowIndex) => Number(((row.centre - clustered[rowIndex].centre) / directSnapshot.pageScaleCssPxPerPt).toFixed(2)))
          : [],
        frameHeight: Number(directSnapshot.frameHeight.toFixed(1)),
        frameWidth: Number(directSnapshot.frameWidth.toFixed(1)),
        fontSamples: directSnapshot.fontSamples,
        pageScaleCssPxPerPt: directSnapshot.pageScaleCssPxPerPt,
      });
      continue;
    }
    if (rowCountForCandidate !== 1) {
      unmatchedRows.push({
        index,
        spanKey: candidate.spanKey,
        reason: `expected one selectable review row, found ${rowCountForCandidate}`,
        directText: normalize(directSnapshot.text).slice(0, 180),
        candidateText: directExpectedText?.slice(0, 180) ?? null,
      });
      continue;
    }
    const expectedRendererKey = rendererKeyForCandidate(candidate);
    try {
      await candidateRow.click({ timeout: 3000 });
    } catch {
      unmatchedRows.push({
        index,
        spanKey: candidate.spanKey,
        reason: 'review row disappeared before selection',
        reviewKey: candidate.reviewKey,
      });
      continue;
    }
    const staticMarkerLocator = page.locator(
      `[data-translation-review-highlight=${JSON.stringify(expectedRendererKey)}] [data-list-marker-line]`,
    ).first();
    const staticMarkerText = await staticMarkerLocator.count()
      ? await staticMarkerLocator.textContent() ?? ''
      : '';
    const expectedText = candidateTextForRenderer(candidate, staticMarkerText);
    if (expectedText) {
      try {
        await page.waitForFunction(({ expectedKey, expectedText: expected }) => {
          const highlights = Array.from(document.querySelectorAll('[data-translation-review-highlight]'))
            .filter(element => element.getAttribute('data-translation-review-highlight') === expectedKey);
          const roots = highlights.filter(element => !highlights.some(other => other !== element && other.contains(element)));
          if (!roots.length) return false;
          const textWithParagraphBoundaries = target => {
            const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
            let text = '';
            let previousParagraph = null;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (!node.textContent) continue;
              const paragraph = node.parentElement?.closest(
                '.credit-paragraph, [data-source-bullet-flow-row], [data-source-bullet-flow-prose], [data-source-numbered-list-row]',
              ) ?? null;
              if (paragraph && previousParagraph && paragraph !== previousParagraph) text += ' ';
              if (paragraph) previousParagraph = paragraph;
              text += node.textContent;
            }
            return text;
          };
          const actual = roots.map(root => textWithParagraphBoundaries(root.querySelector('.realbox') ?? root)).join(' ')
            .replace(/\uFFFC/gu, '').replace(/\uFFFD/gu, ' ').replace(/\s+/gu, ' ')
            // Match normalize(): numbered phase markers occupy a fixed grid column,
            // so textContent can concatenate the marker and heading without a gap.
            .replace(/(?<!\w)([1-4]\.)(?=[A-Z\u00c0-\u00de])/gu, '$1 ')
            .replace(/•(?=\S)/gu, '• ').trim();
          const wanted = expected.replace(/\uFFFC/gu, '').replace(/\uFFFD/gu, ' ').replace(/\s+/gu, ' ')
            .replace(/(?<!\w)([1-4]\.)(?=[A-Z\u00c0-\u00de])/gu, '$1 ')
            .replace(/•(?=\S)/gu, '• ').trim();
          return actual === wanted;
        }, { expectedKey: expectedRendererKey, expectedText }, { timeout: 7000 });
      } catch (error) {
        const actual = await page.evaluate(expectedKey => {
          const hits = Array.from(document.querySelectorAll('[data-translation-review-highlight]'))
            .filter(element => element.getAttribute('data-translation-review-highlight') === expectedKey);
          const roots = hits.filter(element => !hits.some(other => other !== element && other.contains(element)));
          return roots.map(root => (root.querySelector('.realbox') ?? root).textContent ?? '').join(' ');
        }, expectedRendererKey);
        const normalizedActual = normalize(actual);
        const firstDifference = Array.from({ length: Math.max(expectedText.length, normalizedActual.length) })
          .findIndex((_value, index) => expectedText[index] !== normalizedActual[index]);
        const differenceStart = firstDifference < 0 ? 0 : Math.max(0, firstDifference - 50);
        throw new Error(`Copyfit renderer identity mismatch for ${candidate.spanKey}. `
          + `Lengths expected/rendered ${expectedText.length}/${normalizedActual.length}; `
          + `difference at ${firstDifference}: expected "${expectedText.slice(differenceStart, differenceStart + 140)}"; `
          + `rendered "${normalizedActual.slice(differenceStart, differenceStart + 140)}". `
          + `${error instanceof Error ? error.message : error}`);
      }
    }
    // PageRenderer's block highlight key is the canonical span key without its
    // locale suffix. Duplicate editorial headings (for example the three ATK
    // units on p.92) can leave the prior unit's highlight mounted briefly after
    // a row click, so wait for the exact renderer key before reading anything.
    await page.waitForFunction(expectedKey => Array.from(
      document.querySelectorAll('[data-translation-review-highlight]'),
    ).some(element => element.getAttribute('data-translation-review-highlight') === expectedKey),
    expectedRendererKey, { timeout: 5000 });
    const snapshot = await page.evaluate(() => {
      const hits = Array.from(document.querySelectorAll('[data-translation-review-highlight]'));
      const roots = hits.filter(el => !hits.some(other => other !== el && other.contains(el)));
      if (!roots.length) return { empty: true, hits: hits.length };
      const targets = roots.map(root => root.querySelector('.realbox') ?? root);
      const rects = [];
      const fontSamples = new Map();
      let text = '';
      for (const [targetIndex, target] of targets.entries()) {
        if (targetIndex > 0) text += ' ';
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
        let previousParagraph = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent) continue;
          const parent = node.parentElement;
          const style = parent && getComputedStyle(parent);
          if (!style || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
          if (node.textContent.trim()) {
            const fontSample = {
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
              color: style.color,
              lineHeight: style.lineHeight,
              letterSpacing: style.letterSpacing,
              fontKerning: style.fontKerning,
              fontVariantLigatures: style.fontVariantLigatures,
              fontFeatureSettings: style.fontFeatureSettings,
              fontLoaded: document.fonts.check(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`),
            };
            fontSamples.set(JSON.stringify(fontSample), fontSample);
          }
          const paragraph = parent?.closest(
            '.credit-paragraph, [data-source-bullet-flow-row], [data-source-bullet-flow-prose], [data-source-numbered-list-row]',
          ) ?? null;
          if (paragraph && previousParagraph && paragraph !== previousParagraph) text += ' ';
          if (paragraph) previousParagraph = paragraph;
          if (!node.textContent.trim()) { text += node.textContent; continue; }
          text += node.textContent;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width > 0.5 && rect.height > 1) rects.push({ top: rect.top, height: rect.height, left: rect.left });
          }
        }
      }
      const symbolIds = [];
      let symbolOnlyRows = 0;
      const seenSymbols = new Set();
      for (const symbol of targets.flatMap(target => Array.from(target.querySelectorAll('[data-symbol-id]')))) {
        if (seenSymbols.has(symbol)) continue;
        seenSymbols.add(symbol);
        const style = getComputedStyle(symbol);
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
        const rect = symbol.getBoundingClientRect();
        if (rect.width <= 0.5 || rect.height <= 1) continue;
        symbolIds.push(symbol.getAttribute('data-symbol-id'));
        const overlapsTextRow = rects.some(textRect =>
          Math.min(rect.bottom, textRect.top + textRect.height) - Math.max(rect.top, textRect.top)
            >= Math.min(rect.height, textRect.height) * 0.35);
        if (!overlapsTextRow) {
          rects.push({ top: rect.top, height: rect.height, left: rect.left, semanticSymbolId: symbol.getAttribute('data-symbol-id') });
          symbolOnlyRows += 1;
        }
      }
      const frameRects = roots.map(root => root.getBoundingClientRect()).filter(rect => rect.width || rect.height);
      const frameTop = frameRects.length ? Math.min(...frameRects.map(rect => rect.top)) : 0;
      const frameBottom = frameRects.length ? Math.max(...frameRects.map(rect => rect.bottom)) : frameTop;
      return { key: roots[0].getAttribute('data-translation-review-highlight'), text, rects, symbolIds, symbolOnlyRows, frameHeight: frameBottom - frameTop, fontSamples: [...fontSamples.values()] };
    });
    let method = 'highlight';
    let matches;
    let data = snapshot;
    if (snapshot && !snapshot.empty && snapshot.rects.length) {
      const highlightedCandidate = pending.find(candidate => rendererKeyForCandidate(candidate) === snapshot.key);
      matches = highlightedCandidate
        ? [highlightedCandidate]
        : byText.get(normalize(snapshot.text));
      if (!matches) {
        const alreadyMeasured = pageCandidates.some(candidate => normalize(candidate.proposalText) === normalize(snapshot.text)
          && !pending.some(item => item.spanKey === candidate.spanKey));
        if (alreadyMeasured) continue;
        const heading = normalize(headings[index].replace(/^p\.\s*\d+\s*·\s*/u, '')).replace(/…$/u, '');
        const cand = pending.find(candidate => normalize(candidate.proposalText).startsWith(heading));
        unmatchedRows.push({
          index,
          reason: 'highlight text mismatch',
          snapshotSample: normalize(snapshot.text).slice(0, 100),
          expectedSample: cand ? normalize(cand.proposalText).slice(0, 100) : 'none',
        });
        continue;
      }
      const renderedProposalText = candidateTextForRenderer(matches[0], staticMarkerText);
      if (normalize(snapshot.text) !== renderedProposalText) {
        unmatchedRows.push({
          index,
          reason: 'highlight differs from candidate rich text',
          spanKey: matches[0].spanKey,
          renderedSample: normalize(snapshot.text).slice(0, 100),
          candidateSample: renderedProposalText.slice(0, 100),
        });
        continue;
      }
      const expectedSymbolIds = (matches[0].data?.segments ?? []).flatMap(segment => {
        if (!segment.symbolId) return [];
        const count = (String(segment.text ?? '').match(/\uFFFC/gu) ?? []).length || 1;
        return Array.from({ length: count }, () => segment.symbolId);
      }).sort();
      const actualSymbolIds = [...(snapshot.symbolIds ?? [])].sort();
      if (expectedSymbolIds.join('\n') !== actualSymbolIds.join('\n')) {
        unmatchedRows.push({
          index,
          reason: 'semantic symbol render does not match candidate data',
          spanKey: matches[0].spanKey,
          expectedSymbolIds,
          actualSymbolIds,
        });
        continue;
      }
    } else {
      // The renderer did not mark this unit: identify it by the panel heading and read the page geometrically.
      const heading = normalize(headings[index].replace(/^p\.\s*\d+\s*·\s*/u, '')).replace(/…$/u, '');
      const byHeading = pending.filter(candidate => normalize(candidate.proposalText).startsWith(heading));
      matches = byHeading.length === 1 ? byHeading : undefined;
      if (matches) {
        data = { ...(await geometricRects(matches[0].copyfitCanonicalBbox)), key: null, frameHeight: null };
        method = 'geometric';
        if (normalize(data.text) !== normalize(matches[0].proposalText)) { unmatchedRows.push({ index, reason: 'geometric text mismatch', got: normalize(data.text).slice(0, 80) }); continue; }
        const expectedSymbolIds = (matches[0].data?.segments ?? []).flatMap(segment => {
          if (!segment.symbolId) return [];
          const count = (String(segment.text ?? '').match(/\uFFFC/gu) ?? []).length || 1;
          return Array.from({ length: count }, () => segment.symbolId);
        }).sort();
        const actualSymbolIds = [...(data.symbolIds ?? [])].sort();
        if (expectedSymbolIds.join('\n') !== actualSymbolIds.join('\n')) {
          unmatchedRows.push({ index, reason: 'semantic symbol render does not match candidate data', expectedSymbolIds, actualSymbolIds });
          continue;
        }
      }
    }
    if (!matches || matches.length !== 1 || !data.rects.length) { unmatchedRows.push({ index, reason: 'unidentified row', heading: headings[index].slice(0, 60) }); continue; }
    const clustered = clusterRows(data.rects);
    measurements.set(matches[0].reviewKey, {
      method, rendererKey: data.key, rangeRectFragments: data.rects.length, rows: clustered.length,
      symbolIds: data.symbolIds ?? [], symbolOnlyRows: data.symbolOnlyRows ?? 0,
      fontSamples: data.fontSamples ?? [],
      rowTops: clustered.map(row => Number(row.top.toFixed(2))), frameHeight: data.frameHeight === null ? null : Number(data.frameHeight.toFixed(1)),
    });
  }
  if (blocked.length) console.warn('Blocked mutations:', blocked);
  var environment = { zoomActual, fontLoaded: await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('12px OptimaLTStd'); }) };
} finally {
  await browser.close();
}

// ---- Report / write -------------------------------------------------------------------------
const hasSymbols = candidate => /\[\[[^\]]+\]\]/u.test(JSON.stringify(candidate.data ?? ''))
  || (candidate.data?.segments ?? []).some(segment => segment.symbolId || String(segment.text ?? '').includes('\uFFFC'));
const hasUnresolvedSymbolTokens = candidate => /\[\[[^\]]+\]\]/u.test(JSON.stringify(candidate.data ?? ''));
const rows = pending.map((candidate, i) => {
  const pdf = pdfResults[i];
  const viewer = measurements.get(candidate.reviewKey);
  // Some source-PDF blocks intentionally restore English through a cropped
  // raster overlay; their selectable text spans can contain only part of the
  // visible paragraph. A candidate may carry a visually verified row count
  // for that source crop, with its evidence recorded next to the override.
  const source = Number.isInteger(candidate.sourceVisualLineCountOverride)
    ? candidate.sourceVisualLineCountOverride
    : (pdf?.rows ?? 0);
  const target = viewer?.rows ?? 0;
  const classification = source && target ? (target === source ? 'EXACT' : target < source ? 'UNDER' : 'OVER') : 'UNMEASURED';
  return { candidate, pdf, viewer, source, target, classification, symbols: hasSymbols(candidate), unresolvedSymbols: hasUnresolvedSymbolTokens(candidate) };
});
for (const row of rows) {
  const sourceLabel = Number.isInteger(row.candidate.sourceVisualLineCountOverride)
    ? `source=${String(row.source).padStart(2)} (PDF text=${String(row.pdf?.rows ?? 0).padStart(2)}; visual override)`
    : `pdf=${String(row.source).padStart(2)}`;
  console.log(`${row.classification.padEnd(10)} ${sourceLabel} viewer=${String(row.target).padStart(2)} ${row.symbols ? '[symbols] ' : ''}${row.candidate.spanKey}`);
  if (args.includes('--typography') && row.viewer) {
    console.log(`  typography ${JSON.stringify({
      sourceBaselinesPt: row.pdf?.row_baselines ?? [],
      viewerRowTopsCssPx: row.viewer.rowTops,
      viewerRowIntervalsPt: row.viewer.rowIntervalsPt,
      pageScaleCssPxPerPt: row.viewer.pageScaleCssPxPerPt,
      requestedFontLoaded: environment.fontLoaded,
      fontSamples: row.viewer.fontSamples,
    })}`);
  }
}
if (unmatchedRows.length) console.log('Unmatched panel rows:', JSON.stringify(unmatchedRows));
const summary = rows.reduce((acc, row) => { acc[row.classification] = (acc[row.classification] ?? 0) + 1; return acc; }, {});
console.log(`p.${pageNumber}: ${candidates.length - pending.length} already measured; this run`, summary);

if (write) {
  const byFile = new Map();
  for (const row of rows) {
    if (row.classification === 'UNMEASURED' || row.unresolvedSymbols) continue;
    byFile.set(row.candidate.proposalFile, [...(byFile.get(row.candidate.proposalFile) ?? []), row]);
  }
  for (const [file, fileRows] of byFile) {
    const path = resolve(root, file);
    const original = readFileSync(path, 'utf8');
    const doc = JSON.parse(original);
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const serialize = value => `${JSON.stringify(value, null, 2)}${eol === '\r\n' ? '\n' : '\n'}`.replace(/\n/gu, eol);
    if (!args.includes('--reformat') && serialize(JSON.parse(original)) !== original) { console.error(`Skipping ${file}: formatting would change beyond the measurement fields (re-run with --reformat to accept JSON.stringify formatting).`); continue; }
    for (const row of fileRows) {
      const target = doc.candidates[row.candidate.index];
      if (String(target.spanKey ?? target.spanKeys?.[0]) !== row.candidate.spanKey) throw new Error(`Index mismatch in ${file}`);
      if (!refreshSpanKeys.length && !args.includes('--all')
        && (target.sourcePdfVisualLineCount || target.copyfitMeasurement?.sourcePdfVisualLineCount)) continue;
      target.sourcePdfVisualLineCount = row.source;
      target.pageRendererVisualLineCount = row.target;
      target.copyfitClassification = row.classification;
      const measurement = {
        status: 'measured_copyfit_v3_script_visual_rows',
        sourcePdfVisualLineCount: row.source,
        pageRendererVisualLineCount: row.target,
        classification: row.classification,
        method: 'scripts/measure_copyfit_page.mjs: PyMuPDF spans are first grouped by their source line object, then distinct source lines are grouped by representative baseline (1 pt tolerance). Rich runs in one line object remain one visual row. Inline uppercase callout markers and a separate Cinzel quantity glyph beside a declared weapon-hand symbol are folded into the adjacent prose row only when their ink boxes overlap. Live PT-BR PageRenderer text rects plus visible semantic-symbol rects for symbol-only rows are clustered by vertical centre (0.5 x median rect height); inline symbols overlapping a text row count with that row, not as extra lines. Candidate text and symbol IDs must match the selected renderer unit. For image-backed/raster-restored source text whose PDF extraction is incomplete, a candidate-scoped sourceVisualLineCountOverride may be used only with documented visual evidence. No character count, string newline count or frame-height estimate was used.',
        environment: { pageNumber, pdfDocumentPageIndex: pageNumber - 1, language: 'pt-BR', viewerZoom: environment.zoomActual, viewportCssPixels: `${viewport.width}x${viewport.height}`, devicePixelRatio: dpr, fontLoaded: environment.fontLoaded },
        sourceEvidence: { bboxPt: row.candidate.copyfitCanonicalBbox, extractedPdfTextVisualRows: row.pdf.rows, visualRowBaselinesPt: row.pdf.row_baselines, spans: row.pdf.spans, inlineMarkersFoldedIntoTextRows: row.pdf.inline_markers_folded ?? 0, sourceVisualLineCountOverride: row.candidate.sourceVisualLineCountOverride ?? null, sourceVisualLineCountEvidence: row.candidate.sourceVisualLineCountEvidence ?? null, visualRows: row.source },
        pageRendererEvidence: { spanKey: row.viewer.rendererKey, readingMethod: row.viewer.method === 'geometric' ? 'text rects inside the canonical bbox plus visible semantic-symbol rects for symbol-only rows (renderer did not mark the unit)' : row.viewer.method === 'page-renderer-key' ? 'text rects of the unique PageRenderer data-rendered-translation-key unit plus its visible semantic-symbol rects' : 'text rects of the review-highlighted unit plus visible semantic-symbol rects for symbol-only rows', rangeRectFragments: row.viewer.rangeRectFragments, renderedSymbolIds: row.viewer.symbolIds ?? [], semanticSymbolOnlyRows: row.viewer.symbolOnlyRows ?? 0, distinctVisualRows: row.target, visualRowTopsCssPx: row.viewer.rowTops, visualRowIntervalsPt: row.viewer.rowIntervalsPt ?? null, pageScaleCssPxPerPt: row.viewer.pageScaleCssPxPerPt ?? null, renderedFontSamples: row.viewer.fontSamples ?? [], frameHeightCssPx: row.viewer.frameHeight, frameWidthCssPx: row.viewer.frameWidth },
        editorialStatus: 'Pending human editorial approval; Copyfit V3 measurement does not approve or publish the translation. Not visually reviewed by a human.',
      };
      const measurementsByZoom = { ...(target.copyfitMeasurementsByZoom ?? {}) };
      const previousMeasurement = target.copyfitMeasurement;
      const previousZoom = previousMeasurement?.environment?.viewerZoom;
      if (previousZoom && previousZoom !== environment.zoomActual && !measurementsByZoom[previousZoom]) {
        measurementsByZoom[previousZoom] = previousMeasurement;
      }
      measurementsByZoom[environment.zoomActual] = measurement;
      target.copyfitMeasurementsByZoom = {
        ...measurementsByZoom,
      };
      target.copyfitMeasurement = measurement;
    }
    writeFileSync(path, serialize(doc), 'utf8');
    console.log(`Wrote ${fileRows.length} measurement(s) to ${file}`);
  }
}

