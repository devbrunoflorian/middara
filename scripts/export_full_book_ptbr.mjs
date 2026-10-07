#!/usr/bin/env node
/** Export all 102 PT-BR viewer pages, preserving each source page box. */

import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, argv) => {
  if (!value.startsWith('--')) return items;
  const key = value.slice(2);
  const next = argv[index + 1];
  if (!next || next.startsWith('--')) throw new Error(`Missing value for --${key}`);
  items.push([key, next]);
  return items;
}, []));

const config = {
  baseUrl: args['base-url'] ?? 'http://localhost:8080',
  apiUrl: args['api-url'] ?? process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000',
  sourcePdf: resolve(args['source-pdf'] ?? process.env.MIDDARA_SOURCE_PDF_PATH ??
    'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf'),
  output: resolve(args.output ?? 'output/pdf/middara-rulebook-pt-BR-full.pdf'),
  workDir: resolve(args['work-dir'] ?? 'tmp/document-wide-editorial-rollout/full-book-export'),
};
const pageDir = resolve(config.workDir, 'pages');
const parityDir = resolve(config.workDir, 'viewer-pages');
await mkdir(pageDir, { recursive: true });
await mkdir(parityDir, { recursive: true });

const normalizeText = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
const originOf = value => new URL(value).origin;
const pagePath = page => `apps/web/public/pages/page_${String(page).padStart(3, '0')}/page_${String(page).padStart(3, '0')}_dom.json`;
const pages = [];
for (let page = 1; page <= 102; page += 1) {
  const data = JSON.parse(await readFile(pagePath(page), 'utf8'));
  if (!(data.width > 0 && data.height > 0)) throw new Error(`Page ${page} lacks source dimensions.`);
  pages.push(data);
}

const apiUrl = new URL('/api/translations', config.apiUrl);
apiUrl.searchParams.set('limit', '5000');
const apiResponse = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
if (!apiResponse.ok) throw new Error(`Payload returned ${apiResponse.status} for translations.`);
const payload = await apiResponse.json();
if (payload.totalDocs > (payload.docs ?? []).length) throw new Error('Payload translation fetch was incomplete.');
const ptRecords = (payload.docs ?? []).filter(record => record.language === 'pt-BR');
const pageRecords = new Map(Array.from({ length: 102 }, (_, index) => [index + 1, []]));
for (const record of ptRecords) {
  const match = /^page_(\d+)_/.exec(String(record.spanKey ?? ''));
  if (match) pageRecords.get(Number(match[1]))?.push(record);
}
const translationTokens = record => new Set((record.data?.segments ?? [])
  .filter(segment => !segment.symbolId)
  .map(segment => String(segment.text ?? ''))
  .join(' ')
  .normalize('NFC')
  .match(/[\p{L}\p{N}]{4,}/gu)?.map(token => token.toLocaleLowerCase('pt-BR')) ?? []);

console.log('[full-ptbr-export] viewer/API', JSON.stringify({
  viewerUrl: config.baseUrl,
  apiOrigin: originOf(config.apiUrl),
  persistedPtBrRecords: ptRecords.length,
  pages: pages.length,
}, null, 2));

const launchOptions = { headless: true };
if (process.platform === 'win32') launchOptions.executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(launchOptions);
const report = {
  viewerUrl: config.baseUrl,
  apiOrigin: originOf(config.apiUrl),
  locale: 'pt-BR',
  pageCount: 102,
  persistedPtBrRecords: ptRecords.length,
  pages: [],
  networkFailures: [],
};
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const apiOrigins = new Set();
  page.on('requestfailed', request => {
    const failure = `${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`;
    report.networkFailures.push(failure);
  });
  page.on('request', request => {
    try {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) apiOrigins.add(url.origin);
    } catch {}
  });

  const appResponse = await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' });
  if (!appResponse?.ok()) throw new Error(`Viewer returned ${appResponse?.status() ?? 'no response'} at ${config.baseUrl}.`);
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  const env = page.locator('.dev-environment-indicator');
  const initialEnvironment = await env.evaluate(element => ({
    webOrigin: element.getAttribute('data-web-origin'),
    apiOrigin: element.getAttribute('data-api-origin'),
    locale: element.getAttribute('data-locale'),
    mode: element.getAttribute('data-mode'),
  }));
  if (initialEnvironment.apiOrigin && originOf(initialEnvironment.apiOrigin) !== originOf(config.apiUrl)) {
    throw new Error(`Viewer points to ${initialEnvironment.apiOrigin}, expected Payload ${originOf(config.apiUrl)}.`);
  }
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('.dev-environment-indicator')?.getAttribute('data-locale') === 'pt-BR');
  await page.locator('button[title="Fit to Screen"]').click();
  await page.waitForTimeout(250);

  const pageInput = page.locator('input.page-input');
  for (let pageNo = 1; pageNo <= 102; pageNo += 1) {
    if (pageNo > 1) {
      await page.emulateMedia({ media: 'screen' });
      await pageInput.fill(String(pageNo));
      await pageInput.press('Enter');
    }
    const pageData = pages[pageNo - 1];
    const pageId = String(pageNo).padStart(3, '0');
    await page.waitForFunction(expected => {
      const input = document.querySelector('input.page-input');
      const image = document.querySelector('.page-container img');
      return input?.value === String(expected)
        && !document.querySelector('.loading-spinner')
        && image?.getAttribute('src')?.includes(`/page_${String(expected).padStart(3, '0')}/background.webp`)
        && image.naturalWidth > 0;
    }, pageNo, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);

    const actualEnvironment = await env.evaluate(element => ({
      apiOrigin: element.getAttribute('data-api-origin'),
      locale: element.getAttribute('data-locale'),
      mode: element.getAttribute('data-mode'),
    }));
    if (actualEnvironment.locale !== 'pt-BR') throw new Error(`p.${pageNo}: viewer is in ${actualEnvironment.locale}.`);
    if (actualEnvironment.apiOrigin && originOf(actualEnvironment.apiOrigin) !== originOf(config.apiUrl)) {
      throw new Error(`p.${pageNo}: viewer API origin changed to ${actualEnvironment.apiOrigin}.`);
    }
    const containers = await page.locator('.page-container').count();
    if (containers !== 1) throw new Error(`p.${pageNo}: expected one live page container, found ${containers}.`);

    const expectedRecords = pageRecords.get(pageNo) ?? [];
    const pageText = normalizeText(await page.locator('.page-container').innerText());
    const invisibleTranslations = [];
    for (const record of expectedRecords) {
      const expectedTokens = translationTokens(record);
      if (expectedTokens.size < 3) continue;
      const renderedTokens = new Set(pageText.normalize('NFC')
        .match(/[\p{L}\p{N}]{4,}/gu)?.map(token => token.toLocaleLowerCase('pt-BR')) ?? []);
      const coverage = [...expectedTokens].filter(token => renderedTokens.has(token)).length / expectedTokens.size;
      // Rich styles, line wraps, and inline symbols fragment a translation in
      // innerText; use distinctive word coverage instead of a raw substring.
      if (coverage < 0.45) invisibleTranslations.push(String(record.spanKey));
    }

    await page.locator('button[title="Enter Admin"]').click();
    await page.waitForFunction(() => document.querySelector('.dev-environment-indicator')?.getAttribute('data-mode') === 'admin');
    await page.waitForTimeout(180);
    const diagnostics = await page.evaluate(() => {
      const root = document.querySelector('.page-container');
      const rootBox = root?.getBoundingClientRect();
      const overflowNodes = Array.from(document.querySelectorAll('.block-overflow'));
      const outOfPageNodes = Array.from(document.querySelectorAll('.credit-field, .block-container'))
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rootBox && (rect.left < rootBox.left - 2 || rect.top < rootBox.top - 2
            || rect.right > rootBox.right + 2 || rect.bottom > rootBox.bottom + 2);
        });
      const unknownSymbols = Array.from(document.querySelectorAll('.inline-symbol-unknown'))
        .map(element => element.getAttribute('title') || element.textContent || 'unknown');
      const symbolCounts = {};
      for (const element of document.querySelectorAll('.inline-semantic-symbol[data-symbol-id]')) {
        const id = element.getAttribute('data-symbol-id');
        symbolCounts[id] = (symbolCounts[id] ?? 0) + 1;
      }
      return {
        overflowCount: overflowNodes.length,
        overflowLabels: overflowNodes.map(element => element.getAttribute('data-editor-key')
          || element.getAttribute('data-block-id') || element.className).slice(0, 30),
        outOfPageCount: outOfPageNodes.length,
        outOfPageLabels: outOfPageNodes.map(element => element.getAttribute('data-editor-key')
          || element.getAttribute('data-block-id') || element.className).slice(0, 30),
        unknownSymbols,
        symbolCounts,
        pageText: root?.innerText ?? '',
        pageImageReady: !!root?.querySelector('img')?.naturalWidth,
      };
    });
    await page.locator('button[title="Exit Admin"]').click();
    await page.waitForFunction(() => document.querySelector('.dev-environment-indicator')?.getAttribute('data-mode') === 'viewer');
    if (!diagnostics.pageImageReady) throw new Error(`p.${pageNo}: background image not ready in viewer.`);

    const cssWidth = pageData.width * (96 / 72);
    const cssHeight = pageData.height * (96 / 72);
    const stageCssWidth = cssWidth + 48;
    const stageCssHeight = cssHeight + 48;
    const style = await page.addStyleTag({ content: `
      @page { size: ${pageData.width}pt ${pageData.height}pt; margin: 0; }
      html, body, #root, .app-container, .viewer-main, .page-wrapper, .page-renderer {
        width: ${cssWidth}px !important; height: ${cssHeight}px !important;
        min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important;
        margin: 0 !important; padding: 0 !important; overflow: hidden !important; box-sizing: border-box !important;
      }
      .page-stage {
        width: ${stageCssWidth}px !important; height: ${stageCssHeight}px !important;
        min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important;
        margin: 0 !important; padding: 0 !important; overflow: hidden !important; box-sizing: border-box !important;
      }
      .app-container, .viewer-main, .page-wrapper, .page-renderer, .page-stage { display: block !important; }
      .pdf-sidebar, .toast-notification, .translation-editor, .rich-block-editor, .block-editor { display: none !important; }
      .dev-environment-indicator { display: none !important; }
      .page-container {
        width: ${pageData.width}pt !important; height: ${pageData.height}pt !important;
        max-width: none !important; max-height: none !important; margin: 0 !important;
        box-shadow: none !important; transition: none !important; overflow: hidden !important;
      }
      .page-container img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    ` });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(80);
    const pagePdf = resolve(pageDir, `page-${pageId}.pdf`);
    const viewerImage = resolve(parityDir, `page-${pageId}.png`);
    await page.locator('.page-container').screenshot({ path: viewerImage, animations: 'disabled' });
    await page.pdf({
      path: pagePdf,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    const normalized = spawnSync('python', [
      resolve('scripts/normalize_export_page_box.py'), pagePdf,
      String(pageData.width), String(pageData.height), config.sourcePdf, String(pageNo),
    ], { encoding: 'utf8' });
    if (normalized.status !== 0) throw new Error(`p.${pageNo} page-box normalization failed: ${normalized.stderr || normalized.stdout}`);
    await style.evaluate(element => element.remove());
    report.pages.push({
      page: pageNo,
      widthPt: pageData.width,
      heightPt: pageData.height,
      translationRecords: expectedRecords.length,
      invisibleTranslations,
      sourceSymbolsRendered: Object.values(diagnostics.symbolCounts).reduce((sum, value) => sum + value, 0),
      symbolCounts: diagnostics.symbolCounts,
      unknownSymbols: diagnostics.unknownSymbols,
      overflowCount: diagnostics.overflowCount,
      overflowLabels: diagnostics.overflowLabels,
      outOfPageCount: diagnostics.outOfPageCount,
      outOfPageLabels: diagnostics.outOfPageLabels,
      viewerTextChars: pageText.length,
      viewerImage,
      pagePdf,
    });
    if (pageNo % 10 === 0 || pageNo === 102) console.log(`[full-ptbr-export] ${pageNo}/102`);
  }

  report.apiOrigins = [...apiOrigins].sort();
  if (report.apiOrigins.length !== 1 || report.apiOrigins[0] !== originOf(config.apiUrl)) {
    throw new Error(`Viewer queried API origins ${report.apiOrigins.join(', ') || '(none)'}.`);
  }
  const failed = report.networkFailures.filter(message => !message.includes('net::ERR_ABORTED'));
  if (failed.length) throw new Error(`Viewer network failures: ${failed.slice(0, 10).join('; ')}`);
  await context.close();
} finally {
  await browser.close();
}

await mkdir(dirname(config.output), { recursive: true });
const mergeCode = String.raw`
import json, sys
from pathlib import Path
import fitz
source_path, page_dir, output_path, report_path = map(Path, sys.argv[1:5])
source = fitz.open(source_path)
if source.page_count != 102: raise SystemExit(f'Expected 102 source pages, found {source.page_count}')
full = fitz.open()
page_reports = []
for number in range(1, 103):
    path = page_dir / f'page-{number:03d}.pdf'
    exported = fitz.open(path)
    if exported.page_count != 1: raise SystemExit(f'{path}: expected one page')
    src, out = source[number - 1], exported[0]
    for name in ('mediabox','cropbox','bleedbox','trimbox','artbox'):
        a, b = getattr(src, name), getattr(out, name)
        if any(abs(a[i]-b[i]) > 0.001 for i in range(4)):
            raise SystemExit(f'p.{number} {name} mismatch: {tuple(b)} vs {tuple(a)}')
    full.insert_pdf(exported)
    page_reports.append({'page':number,'mediaBox':list(src.mediabox),'cropBox':list(src.cropbox),
      'bleedBox':list(src.bleedbox),'trimBox':list(src.trimbox),'artBox':list(src.artbox)})
    exported.close()
full.save(output_path, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True)
full.close()
check = fitz.open(output_path)
if check.page_count != 102: raise SystemExit(f'Final PDF has {check.page_count} pages')
for number, item in enumerate(page_reports, 1):
    page = check[number - 1]
    for key, name in [('mediaBox','mediabox'),('cropBox','cropbox'),('bleedBox','bleedbox'),('trimBox','trimbox'),('artBox','artbox')]:
        a, b = getattr(page, name), item[key]
        if any(abs(a[i]-b[i]) > 0.001 for i in range(4)):
            raise SystemExit(f'final p.{number} {name} changed while merging')
check.close(); source.close()
report=json.loads(report_path.read_text(encoding='utf-8'))
report['finalPdf']=str(output_path.resolve())
report['finalPageCount']=102
report['pageBoxesVerified']=True
report['pageBoxes']=page_reports
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(output_path.resolve()),'pageCount':102,'pageBoxesVerified':True},ensure_ascii=False))
`;
const reportPath = resolve(config.workDir, 'viewer-export-report.json');
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
const merge = spawnSync('python', ['-c', mergeCode, config.sourcePdf, pageDir, config.output, reportPath], { encoding: 'utf8' });
if (merge.status !== 0) throw new Error(`Full-book merge/page-box verification failed: ${merge.stderr || merge.stdout}`);
console.log('[full-ptbr-export] completed', merge.stdout.trim());
