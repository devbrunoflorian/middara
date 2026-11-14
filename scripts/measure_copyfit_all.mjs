#!/usr/bin/env node
/**
 * Automated Copyfit V3 visual-line measurement runner across all pages.
 *
 *   node scripts/measure_copyfit_all.mjs [--from <page>] [--to <page>] [--dry-run]
 *   node scripts/measure_copyfit_all.mjs --page <page> --span-keys <key1,key2,...> [--force]
 *
 * Reuses a single Playwright browser instance, measures both the official source PDF
 * (PyMuPDF baselines) and live PageRenderer (Playwright client rects inside the review highlight).
 * Writes measurement evidence to the respective proposal JSON files and rebuilds the catalog at the end.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const toIdx = args.indexOf('--to');
const pageIdx = args.indexOf('--page');
const spanKeysIdx = args.indexOf('--span-keys');
const selectedSpanKeys = spanKeysIdx >= 0
  ? new Set(String(args[spanKeysIdx + 1] ?? '').split(',').filter(Boolean)) : null;
const specificPage = pageIdx >= 0 ? Number(args[pageIdx + 1]) : null;
const fromPage = specificPage ?? (fromIdx >= 0 ? Number(args[fromIdx + 1]) : 1);
const toPage = specificPage ?? (toIdx >= 0 ? Number(args[toIdx + 1]) : 102);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const zoomPercent = 200;

const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const pdfPath = process.env.MIDDARA_SOURCE_PDF ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const normalize = value => String(value ?? '').replace(/\[\[[^\]]+\]\]/gu, ' ').replace(/[\uFFFC\uFFFD]/gu, ' ').replace(/\s+/gu, ' ').trim();

// Ensure catalog is fresh
spawnSync('node', ['scripts/build_translation_review_catalog.mjs'], { stdio: 'inherit' });
const catalog = JSON.parse(readFileSync(resolve(root, 'apps/web/public/translation-review/catalog.json'), 'utf8'));

// Identify target pages with pending unmeasured candidates (or all candidates if force)
const targetPages = [];
for (let p = fromPage; p <= toPage; p += 1) {
  const pageCandidates = catalog.proposals.flatMap(pr => pr.candidates).filter(c => c.pageNumber === p
    && (!selectedSpanKeys || selectedSpanKeys.has(c.spanKey)));
  const pending = force
    ? pageCandidates
    : pageCandidates.filter(c => !(c.copyfitSourcePdfLineCount && c.copyfitPageRendererLineCount));
  if (pending.length > 0) {
    targetPages.push({ pageNumber: p, total: pageCandidates.length, pending });
  }
}

console.log(`Found ${targetPages.length} pages with pending copyfit candidates between p.${fromPage} and p.${toPage}.`);

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const viewport = { width: 1280, height: 720 };
const dpr = 1.25;

let totalWritten = 0;
const overallResults = { EXACT: 0, UNDER: 0, OVER: 0, UNMEASURED: 0 };

try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await context.route('**/api/**', async route => {
    if (route.request().method().toUpperCase() !== 'GET') {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  const ptLanguageToggle = page.getByRole('button', { name: 'Português (Brasil)', exact: true });
  if (await ptLanguageToggle.count()) await ptLanguageToggle.click();
  else await page.locator('select').filter({ has: page.locator('option[value="pt-BR"]') }).selectOption('pt-BR', { force: true });

  // Set zoom to 200%
  const zoomLabel = page.locator('.zoom-level');
  for (let i = 0; i < 20 && parseInt(await zoomLabel.innerText(), 10) !== zoomPercent; i += 1) {
    const current = parseInt(await zoomLabel.innerText(), 10);
    await page.locator(current < zoomPercent ? 'button[title="Zoom In"], button[title*="Aumentar"], button:has(svg.lucide-zoom-in)' : 'button[title="Zoom Out"], button[title*="Diminuir"], button:has(svg.lucide-zoom-out)').first().click();
    await page.waitForTimeout(100);
  }
  const zoomActual = await zoomLabel.innerText();

  // Open review panel if not already open
  const isPanelOpen = await page.locator('.translation-review-layout').isVisible().catch(() => false);
  if (!isPanelOpen) {
    await page.locator('button.global-nav-action', { hasText: /Revisar traduções|Review translations/u }).first().dispatchEvent('click');
    await page.waitForSelector('.translation-review-layout', { timeout: 10000 }).catch(() => null);
  }
  await page.getByRole('tab', { name: /Propostas/u }).click().catch(() => null);

  for (const { pageNumber, pending } of targetPages) {
    console.log(`\n========================================`);
    console.log(`Processing Page ${pageNumber}: ${pending.length} pending candidate(s)...`);

    try {
      // 1. PyMuPDF measurement
      const pdfRequest = JSON.stringify({
        pdf: pdfPath,
        page: pageNumber - 1,
        boxes: pending.map(candidate => candidate.copyfitCanonicalBbox),
      });
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
      if (pdfRun.status !== 0) {
        console.error(`PyMuPDF failed on p.${pageNumber}:`, pdfRun.stderr);
        continue;
      }
      const pdfResults = JSON.parse(pdfRun.stdout).results;
      const pdfPageWidth = JSON.parse(pdfRun.stdout).page_width;

      // 2. Navigate to page in Viewer
      const pageInput = page.locator('input.page-input');
      await pageInput.fill(String(pageNumber));
      await pageInput.press('Enter');
      await page.waitForFunction(n => document.querySelector('input.page-input')?.value === String(n)
        && (document.querySelector('.page-container img')?.naturalWidth ?? 0) > 0, pageNumber, { timeout: 15000 });

      // Select page in translation review panel filter
      await page.locator('#translation-review-page').selectOption(String(pageNumber)).catch(() => null);
      await page.waitForTimeout(400);

      let isApprovedTab = false;
      let rowCount = await page.locator('.translation-review-row-wrap .translation-review-row').count();
      if (rowCount === 0) {
        await page.getByRole('tab', { name: /Aprovad[ao]s|Approved/u }).click().catch(() => null);
        await page.locator('#translation-review-page').selectOption(String(pageNumber)).catch(() => null);
        await page.waitForTimeout(300);
        rowCount = await page.locator('.translation-review-row').count();
        if (rowCount > 0) isApprovedTab = true;
      }
      const rowSelector = isApprovedTab ? '.translation-review-row' : '.translation-review-row-wrap .translation-review-row';
      const headings = await page.locator(isApprovedTab ? '.translation-review-row .translation-review-row-heading' : '.translation-review-row-wrap .translation-review-row-heading').allInnerTexts();

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
          if (last && Math.abs(centre - last.centre) <= medianHeight * 0.5) {
            last.centre = (last.centre * last.n + centre) / (last.n + 1);
            last.n += 1;
          } else {
            clustered.push({ centre, top: rect.top, n: 1 });
          }
        }
        return clustered;
      };

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
              rects.push({ top: rect.top, height: rect.height, left: rect.left });
              used = true;
            }
          }
          if (used) text += node.textContent;
        }
        return { rects, text };
      }, { bbox, pageWidth: pdfPageWidth });

      const measurements = new Map();

      for (let index = 0; index < rowCount; index += 1) {
        const rowLocator = page.locator(rowSelector).nth(index);
        const rowReviewKey = await rowLocator.getAttribute('data-review-key');
        await rowLocator.click();
        await page.waitForTimeout(300);
        await page.waitForSelector('[data-translation-review-highlight]', { state: 'attached', timeout: 2000 }).catch(() => null);
        await page.waitForTimeout(150);

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
        let matches = rowReviewKey ? pending.filter(candidate => candidate.reviewKey === rowReviewKey) : undefined;
        let data = snapshot;

        if ((!matches || matches.length === 0) && snapshot && !snapshot.empty && snapshot.rects?.length) {
          matches = byText.get(normalize(snapshot.text));
        }

        if (!matches || matches.length === 0) {
          const heading = normalize(headings[index]?.replace(/^p\.\s*\d+\s*·\s*/u, '') ?? '').replace(/…$/u, '');
          const byHeading = pending.filter(candidate => normalize(candidate.proposalText).startsWith(heading));
          if (byHeading.length === 1) {
            matches = byHeading;
            if (!snapshot || snapshot.empty || !snapshot.rects?.length) {
              data = { ...(await geometricRects(matches[0].copyfitCanonicalBbox)), key: null, frameHeight: null };
              method = 'geometric';
            }
          }
        }

        if (!matches || matches.length !== 1 || !data?.rects?.length) {
          continue;
        }

        const clustered = clusterRows(data.rects);
        measurements.set(matches[0].reviewKey, {
          method,
          rendererKey: data.key,
          rangeRectFragments: data.rects.length,
          rows: clustered.length,
          rowTops: clustered.map(row => Number(row.top.toFixed(2))),
          frameHeight: data.frameHeight === null ? null : Number(data.frameHeight.toFixed(1)),
        });
      }

      const hasSymbols = candidate => /\[\[[^\]]+\]\]/u.test(JSON.stringify(candidate.data ?? ''));
      const rows = pending.map((candidate, i) => {
        const pdf = pdfResults[i];
        const viewer = measurements.get(candidate.reviewKey);
        const source = pdf?.rows ?? 0;
        const target = viewer?.rows ?? 0;
        const classification = source && target ? (target === source ? 'EXACT' : target < source ? 'UNDER' : 'OVER') : 'UNMEASURED';
        return { candidate, pdf, viewer, source, target, classification, symbols: hasSymbols(candidate) };
      });

      const pageSummary = { EXACT: 0, UNDER: 0, OVER: 0, UNMEASURED: 0 };
      for (const row of rows) {
        pageSummary[row.classification] = (pageSummary[row.classification] ?? 0) + 1;
        overallResults[row.classification] = (overallResults[row.classification] ?? 0) + 1;
        console.log(`  ${row.classification.padEnd(10)} pdf=${String(row.source).padStart(2)} viewer=${String(row.target).padStart(2)} ${row.symbols ? '[symbols] ' : ''}${row.candidate.spanKey}`);
      }
      console.log(`Summary p.${pageNumber}:`, pageSummary);

      if (!dryRun) {
        const byFile = new Map();
        for (const row of rows) {
          if (row.classification === 'UNMEASURED' || row.symbols) continue;
          byFile.set(row.candidate.proposalFile, [...(byFile.get(row.candidate.proposalFile) ?? []), row]);
        }
        for (const [file, fileRows] of byFile) {
          const filePath = resolve(root, file);
          const original = readFileSync(filePath, 'utf8');
          const doc = JSON.parse(original);
          const eol = original.includes('\r\n') ? '\r\n' : '\n';
          const serialize = value => `${JSON.stringify(value, null, 2)}${eol === '\r\n' ? '\n' : '\n'}`.replace(/\n/gu, eol);

          for (const row of fileRows) {
            const targetCandidate = doc.candidates[row.candidate.index];
            if (String(targetCandidate.spanKey ?? targetCandidate.spanKeys?.[0]) !== row.candidate.spanKey) {
              console.warn(`Index mismatch in ${file} for ${row.candidate.spanKey}, searching by spanKey...`);
              const found = doc.candidates.find(c => String(c.spanKey ?? c.spanKeys?.[0]) === row.candidate.spanKey);
              if (!found) continue;
              applyMeasurement(found, row, pageNumber, zoomActual, viewport, dpr);
            } else {
              applyMeasurement(targetCandidate, row, pageNumber, zoomActual, viewport, dpr);
            }
          }
          writeFileSync(filePath, serialize(doc), 'utf8');
          console.log(`Wrote ${fileRows.length} measurement(s) to ${file}`);
          totalWritten += fileRows.length;
        }
      }
      if (isApprovedTab) {
        await page.getByRole('tab', { name: /Propostas/u }).click().catch(() => null);
      }
    } catch (pageErr) {
      console.error(`Error processing page ${pageNumber}:`, pageErr.message);
    }
  }
} finally {
  await browser.close();
}

function applyMeasurement(target, row, pageNumber, zoomActual, viewport, dpr) {
  if (!force && target.sourcePdfVisualLineCount && target.pageRendererVisualLineCount && target.copyfitMeasurement) return;
  target.sourcePdfVisualLineCount = row.source;
  target.pageRendererVisualLineCount = row.target;
  target.copyfitClassification = row.classification;
  target.copyfitMeasurement = {
    status: 'measured_copyfit_v3_script_visual_rows',
    sourcePdfVisualLineCount: row.source,
    pageRendererVisualLineCount: row.target,
    classification: row.classification,
    method: 'scripts/measure_copyfit_all.mjs: PyMuPDF text spans inside canonical bbox clustered by baseline (1 pt); live PT-BR PageRenderer Range client rects inside review highlight clustered by vertical centre. No character count, string newline count or frame-height estimate was used.',
    environment: {
      pageNumber,
      pdfDocumentPageIndex: pageNumber - 1,
      language: 'pt-BR',
      viewerZoom: zoomActual,
      viewportCssPixels: `${viewport.width}x${viewport.height}`,
      devicePixelRatio: dpr,
    },
    sourceEvidence: {
      bboxPt: row.candidate.copyfitCanonicalBbox,
      visualBaselinesPt: row.pdf.baselines,
      spans: row.pdf.spans,
      visualRows: row.source,
    },
    pageRendererEvidence: {
      spanKey: row.viewer.rendererKey,
      readingMethod: row.viewer.method === 'geometric' ? 'text rects inside canonical bbox (renderer did not mark unit)' : 'text rects of review-highlighted unit',
      rangeRectFragments: row.viewer.rangeRectFragments,
      distinctVisualRows: row.target,
      visualRowTopsCssPx: row.viewer.rowTops,
      frameHeightCssPx: row.viewer.frameHeight,
    },
    editorialStatus: 'Pending human editorial approval; Copyfit V3 measurement does not approve or publish the translation. Not visually reviewed by a human.',
  };
}

console.log(`\n========================================`);
console.log(`BATCH COMPLETE. Total measurements written: ${totalWritten}`);
console.log('Overall classifications in this run:', overallResults);

// Rebuild catalog and run inventory
console.log('\nRebuilding translation review catalog...');
spawnSync('node', ['scripts/build_translation_review_catalog.mjs'], { stdio: 'inherit' });
spawnSync('node', ['scripts/inventory_copyfit_evidence.mjs'], { stdio: 'inherit' });
