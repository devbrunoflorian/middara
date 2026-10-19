#!/usr/bin/env node
/**
 * Copyfit V3 visual-line measurement for the active proposal candidates of one page.
 *
 *   node scripts/measure_copyfit_page.mjs <page> [--write] [--zoom 200]
 *
 * PDF side:  PyMuPDF text spans inside the candidate's canonical bbox, clustered by baseline.
 * Viewer side: live PT-BR PageRenderer with the review panel selecting each candidate; text-node
 *              Range client rects inside the highlighted element, clustered by vertical centre.
 *
 * Default is a dry run that only prints the table. --write stores the measurement metadata
 * (counts, classification, method, environment, evidence) on the candidate in the proposal file.
 * Text, rich data and geometry are never touched. Candidates that already carry counts are kept.
 * Units with inline symbol placeholders are reported, never written (rows can hide icon-only lines).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const args = process.argv.slice(2);
const pageNumber = Number(args.find(arg => /^\d+$/u.test(arg)));
const write = args.includes('--write');
const zoomIdx = args.indexOf('--zoom');
const zoomPercent = zoomIdx >= 0 ? Number(args[zoomIdx + 1]) : 200;
if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('Usage: measure_copyfit_page.mjs <page> [--write] [--zoom 200]');

const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const pdfPath = process.env.MIDDARA_SOURCE_PDF ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const normalize = value => String(value ?? '').replace(/\[\[[^\]]+\]\]/gu, ' ').replace(/[\uFFFC\uFFFD]/gu, ' ').replace(/\s+/gu, ' ').trim();

const catalog = JSON.parse(readFileSync(resolve(root, 'apps/web/public/translation-review/catalog.json'), 'utf8'));
const candidates = catalog.proposals.flatMap(proposal => proposal.candidates).filter(candidate => candidate.pageNumber === pageNumber);
if (!candidates.length) throw new Error(`No active candidates on p.${pageNumber}.`);
const pending = args.includes('--all')
  ? candidates
  : candidates.filter(candidate => !(candidate.copyfitSourcePdfLineCount && candidate.copyfitPageRendererLineCount));

// ---- PDF side -------------------------------------------------------------------------------
const pdfRequest = JSON.stringify({ pdf: pdfPath, page: pageNumber - 1, boxes: pending.map(candidate => candidate.copyfitCanonicalBbox) });
const pdfScript = `
import sys, json, pymupdf
req = json.load(sys.stdin)
doc = pymupdf.open(req["pdf"])
page = doc[req["page"]]
spans = []
for block in page.get_text("dict")["blocks"]:
    for line in block.get("lines", []):
        for span in line["spans"]:
            if span["text"].strip():
                x0, y0, x1, y1 = span["bbox"]
                spans.append((((x0 + x1) / 2), ((y0 + y1) / 2), span["origin"][1], span["text"]))
out = []
for box in req["boxes"]:
    if not box:
        out.append(None); continue
    pad = 1.0
    inside = [s for s in spans if box[0] - pad <= s[0] <= box[2] + pad and box[1] - pad <= s[1] <= box[3] + pad]
    baselines = []
    for base in sorted(round(s[2], 3) for s in inside):
        if not baselines or base - baselines[-1] > 1.0:
            baselines.append(base)
    out.append({"rows": len(baselines), "baselines": baselines, "spans": len(inside)})
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
  await context.route('**/api/**', async route => {
    const method = route.request().method().toUpperCase();
    if (method !== 'GET') { blocked.push(`${method} ${route.request().url()}`); await route.abort('blockedbyclient'); return; }
    await route.continue();
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill(String(pageNumber));
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(n => document.querySelector('input.page-input')?.value === String(n)
    && (document.querySelector('.page-container img')?.naturalWidth ?? 0) > 0, pageNumber, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  const zoomLabel = page.locator('.zoom-level');
  for (let i = 0; i < 20 && parseInt(await zoomLabel.innerText(), 10) !== zoomPercent; i += 1) {
    const current = parseInt(await zoomLabel.innerText(), 10);
    await page.locator(current < zoomPercent ? 'button[title="Zoom In"]' : 'button[title="Zoom Out"]').click();
    await page.waitForTimeout(120);
  }
  const zoomActual = await zoomLabel.innerText();

  await page.locator('button.global-nav-action', { hasText: /Revisar traduções|Review translations/u }).first().dispatchEvent('click');
  await page.getByRole('tab', { name: /Propostas/u }).click();
  await page.locator('#translation-review-page').selectOption(String(pageNumber));
  await page.waitForTimeout(400);
  const rowCount = await page.locator('.translation-review-row-wrap .translation-review-row').count();
  console.log('panel rows:', rowCount, JSON.stringify(await page.locator('.translation-review-row-wrap .translation-review-row-heading').allInnerTexts()));

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
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const style = node.parentElement && getComputedStyle(node.parentElement);
      if (!style || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
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
    return { rects, text };
  }, { bbox, pageWidth: pdfPageWidth });
  const headings = await page.locator('.translation-review-row-wrap .translation-review-row-heading').allInnerTexts();

  for (let index = 0; index < rowCount; index += 1) {
    await page.locator('.translation-review-row-wrap .translation-review-row').nth(index).click();
    await page.waitForTimeout(450);
    await page.waitForSelector('[data-translation-review-highlight]', { state: 'attached', timeout: 2500 }).catch(() => null);
    await page.waitForTimeout(200);
    const snapshot = await page.evaluate(() => {
      const hits = Array.from(document.querySelectorAll('[data-translation-review-highlight]'));
      const outer = hits.find(el => !hits.some(other => other !== el && other.contains(el))) ?? null;
      if (!outer) return { empty: true, hits: hits.length };
      const target = outer.querySelector('.realbox') ?? outer;
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const rects = [];
      let text = '';
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const parent = node.parentElement;
        const style = parent && getComputedStyle(parent);
        if (!style || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
        text += node.textContent;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0.5 && rect.height > 1) rects.push({ top: rect.top, height: rect.height, left: rect.left });
        }
      }
      const frame = outer.getBoundingClientRect();
      return { key: outer.getAttribute('data-translation-review-highlight'), text, rects, frameHeight: frame.height };
    });
    let method = 'highlight';
    let matches;
    let data = snapshot;
    if (snapshot && !snapshot.empty && snapshot.rects.length) {
      matches = byText.get(normalize(snapshot.text));
      if (!matches) {
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
    } else {
      // The renderer did not mark this unit: identify it by the panel heading and read the page geometrically.
      const heading = normalize(headings[index].replace(/^p\.\s*\d+\s*·\s*/u, '')).replace(/…$/u, '');
      const byHeading = pending.filter(candidate => normalize(candidate.proposalText).startsWith(heading));
      matches = byHeading.length === 1 ? byHeading : undefined;
      if (matches) {
        data = { ...(await geometricRects(matches[0].copyfitCanonicalBbox)), key: null, frameHeight: null };
        method = 'geometric';
        if (normalize(data.text) !== normalize(matches[0].proposalText)) { unmatchedRows.push({ index, reason: 'geometric text mismatch', got: normalize(data.text).slice(0, 80) }); continue; }
      }
    }
    if (!matches || matches.length !== 1 || !data.rects.length) { unmatchedRows.push({ index, reason: 'unidentified row', heading: headings[index].slice(0, 60) }); continue; }
    const clustered = clusterRows(data.rects);
    measurements.set(matches[0].reviewKey, {
      method, rendererKey: data.key, rangeRectFragments: data.rects.length, rows: clustered.length,
      rowTops: clustered.map(row => Number(row.top.toFixed(2))), frameHeight: data.frameHeight === null ? null : Number(data.frameHeight.toFixed(1)),
    });
  }
  if (blocked.length) console.warn('Blocked mutations:', blocked);
  var environment = { zoomActual, fontLoaded: await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('12px OptimaLTStd'); }) };
} finally {
  await browser.close();
}

// ---- Report / write -------------------------------------------------------------------------
const hasSymbols = candidate => /\[\[[^\]]+\]\]/u.test(JSON.stringify(candidate.data ?? ''));
const rows = pending.map((candidate, i) => {
  const pdf = pdfResults[i];
  const viewer = measurements.get(candidate.reviewKey);
  const source = pdf?.rows ?? 0;
  const target = viewer?.rows ?? 0;
  const classification = source && target ? (target === source ? 'EXACT' : target < source ? 'UNDER' : 'OVER') : 'UNMEASURED';
  return { candidate, pdf, viewer, source, target, classification, symbols: hasSymbols(candidate) };
});
for (const row of rows) {
  console.log(`${row.classification.padEnd(10)} pdf=${String(row.source).padStart(2)} viewer=${String(row.target).padStart(2)} ${row.symbols ? '[symbols] ' : ''}${row.candidate.spanKey}`);
}
if (unmatchedRows.length) console.log('Unmatched panel rows:', JSON.stringify(unmatchedRows));
const summary = rows.reduce((acc, row) => { acc[row.classification] = (acc[row.classification] ?? 0) + 1; return acc; }, {});
console.log(`p.${pageNumber}: ${candidates.length - pending.length} already measured; this run`, summary);

if (write) {
  const byFile = new Map();
  for (const row of rows) {
    if (row.classification === 'UNMEASURED' || row.symbols) continue;
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
      if (target.sourcePdfVisualLineCount || target.copyfitMeasurement?.sourcePdfVisualLineCount) continue;
      target.sourcePdfVisualLineCount = row.source;
      target.pageRendererVisualLineCount = row.target;
      target.copyfitClassification = row.classification;
      target.copyfitMeasurement = {
        status: 'measured_copyfit_v3_script_visual_rows',
        sourcePdfVisualLineCount: row.source,
        pageRendererVisualLineCount: row.target,
        classification: row.classification,
        method: 'scripts/measure_copyfit_page.mjs: PyMuPDF text spans inside the canonical bbox clustered by baseline (1 pt); live PT-BR PageRenderer Range client rects of the review-highlighted unit clustered by vertical centre (0.5 x median rect height). No character count, string newline count or frame-height estimate was used.',
        environment: { pageNumber, pdfDocumentPageIndex: pageNumber - 1, language: 'pt-BR', viewerZoom: environment.zoomActual, viewportCssPixels: `${viewport.width}x${viewport.height}`, devicePixelRatio: dpr, fontLoaded: environment.fontLoaded },
        sourceEvidence: { bboxPt: row.candidate.copyfitCanonicalBbox, visualBaselinesPt: row.pdf.baselines, spans: row.pdf.spans, visualRows: row.source },
        pageRendererEvidence: { spanKey: row.viewer.rendererKey, readingMethod: row.viewer.method === 'geometric' ? 'text rects inside the canonical bbox (renderer did not mark the unit)' : 'text rects of the review-highlighted unit', rangeRectFragments: row.viewer.rangeRectFragments, distinctVisualRows: row.target, visualRowTopsCssPx: row.viewer.rowTops, frameHeightCssPx: row.viewer.frameHeight },
        editorialStatus: 'Pending human editorial approval; Copyfit V3 measurement does not approve or publish the translation. Not visually reviewed by a human.',
      };
    }
    writeFileSync(path, serialize(doc), 'utf8');
    console.log(`Wrote ${fileRows.length} measurement(s) to ${file}`);
  }
}

