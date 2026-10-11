#!/usr/bin/env node
/** Export one persisted rulebook page/language through the same React viewer. */

import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function argsFrom(argv) {
  const result = {
    page: undefined,
    language: 'en',
    output: undefined,
    baseUrl: 'http://127.0.0.1:8080',
    apiUrl: process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000',
    sourcePdf: process.env.MIDDARA_SOURCE_PDF_PATH ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf',
    executablePath: undefined,
    debugScreenshot: undefined,
    viewerScreenshot: undefined,
    printScreenshot: undefined,
    metricsOutput: undefined,
    captureOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith('--')) continue;
    if (key === '--capture-only') {
      result.captureOnly = true;
      continue;
    }
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    const name = ({ '--page': 'page', '--language': 'language', '--output': 'output', '--base-url': 'baseUrl', '--api-url': 'apiUrl', '--source-pdf': 'sourcePdf', '--browser': 'executablePath', '--debug-screenshot': 'debugScreenshot', '--viewer-screenshot': 'viewerScreenshot', '--print-screenshot': 'printScreenshot', '--metrics-output': 'metricsOutput' })[key];
    if (!name) throw new Error(`Unknown option: ${key}`);
    result[name] = name === 'page' ? Number(value) : value;
    i += 1;
  }
  if (!Number.isInteger(result.page) || result.page < 1 || result.page > 102) throw new Error('Use --page with an integer from 1 to 102.');
  if (!['en', 'pt-BR'].includes(result.language)) throw new Error('Use --language en or pt-BR.');
  if (!result.output) result.output = `output/pdf/page-${String(result.page).padStart(3, '0')}-${result.language}-editavel.pdf`;
  result.output = resolve(result.output);
  return result;
}

function translationPlainText(data) {
  const segments = Array.isArray(data?.segments) ? data.segments : [];
  // Inline SVGs/images intentionally have no textContent. Verify ordinary
  // prose without expecting the object-replacement marker in that content.
  return segments.map(segment => segment.symbolId ? '' : String(segment.text ?? '')).join('');
}

function normalizeText(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizedOrigin(value) {
  return new URL(value).origin;
}

const config = argsFrom(process.argv.slice(2));
console.log('[page-export] requested environment', JSON.stringify({
  viewerUrl: config.baseUrl,
  translationApiOrigin: normalizedOrigin(config.apiUrl),
  page: config.page,
  language: config.language,
}, null, 2));
const pageId = String(config.page).padStart(3, '0');
const pageDataPath = resolve(`apps/web/public/pages/page_${pageId}/page_${pageId}_dom.json`);
const pageData = JSON.parse(await readFile(pageDataPath, 'utf8'));
if (!(pageData.width > 0 && pageData.height > 0)) throw new Error(`Missing page dimensions in ${pageDataPath}`);

let expectedTranslation = '';
if (config.language === 'pt-BR') {
  const url = new URL('/api/translations', config.apiUrl);
  url.searchParams.set('where[language][equals]', 'pt-BR');
  url.searchParams.set('limit', '5000');
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Payload returned ${response.status} while loading PT-BR translations.`);
  const payload = await response.json();
  const prefix = `page_${config.page}_`;
  const docs = (payload.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith(prefix));
  if (!docs.length) throw new Error(`No saved PT-BR translation records found for page ${config.page}.`);
  expectedTranslation = docs
    .map(doc => translationPlainText(doc.data))
    .filter(text => text.length >= 20 && !Array.from(text).some(char => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0xE000 && code <= 0xF8FF;
    }))
    .sort((a, b) => b.length - a.length)[0] ?? '';
  if (!expectedTranslation) throw new Error(`Page ${config.page} has no ordinary PT-BR prose to verify in the viewer.`);
}

const launchOptions = { headless: true };
if (config.executablePath) launchOptions.executablePath = config.executablePath;
else if (process.platform === 'win32') launchOptions.executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(launchOptions);
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const failedRequests = [];
  const apiRequestOrigins = new Set();
  page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => {
    try {
      const requestUrl = new URL(request.url());
      if (requestUrl.pathname.startsWith('/api/')) apiRequestOrigins.add(requestUrl.origin);
    } catch {}
  });
  const appResponse = await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' });
  if (!appResponse?.ok()) throw new Error(`Viewer returned ${appResponse?.status() ?? 'no response'} at ${config.baseUrl}`);
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));

  const expectedApiOrigin = normalizedOrigin(config.apiUrl);

  const pageInput = page.locator('input.page-input');
  await pageInput.fill(String(config.page));
  await pageInput.press('Enter');
  await page.waitForFunction(expected => {
    const input = document.querySelector('input.page-input');
    const image = document.querySelector('.page-container img');
    return input?.value === String(expected)
      && !document.querySelector('.loading-spinner')
      && image?.getAttribute('src')?.includes(`page_${String(expected).padStart(3, '0')}/background.webp`)
      && image.naturalWidth > 0;
  }, config.page, { timeout: 60000 });

  const localeSelect = page.locator('select.language-select');
  await localeSelect.selectOption(config.language);
  await page.waitForFunction(
    expected => document.querySelector('select.language-select')?.value === expected,
    config.language,
    { timeout: 10000 },
  );
  if (config.language === 'pt-BR') {
    const expectedFragment = normalizeText(expectedTranslation).slice(0, 48);
    await page.waitForFunction(fragment => {
      const content = normalizeText(document.querySelector('.page-container')?.textContent ?? '');
      return content.includes(fragment);
      function normalizeText(value) { return value.replace(/\s+/gu, ' ').trim(); }
    }, expectedFragment, { timeout: 60000 });
  }

  const viewerLocale = await localeSelect.inputValue();
  if (viewerLocale !== config.language) {
    throw new Error(`Viewer locale ${viewerLocale} does not match requested export language ${config.language}.`);
  }

  await page.evaluate(() => document.fonts.ready);
  await page.getByTitle('Fit to Screen').click();
  await page.waitForTimeout(300);

  const capturePageMetrics = () => page.locator('.page-container').evaluate(container => {
    const pageRect = container.getBoundingClientRect();
    const relativeRect = element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left - pageRect.left, y: rect.top - pageRect.top, width: rect.width, height: rect.height };
    };
    const styleFor = element => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing, wordSpacing: style.wordSpacing, margin: style.margin,
        padding: style.padding, transform: style.transform, zIndex: style.zIndex,
        clipPath: style.clipPath, maskImage: style.maskImage, width: style.width, height: style.height,
      };
    };
    return {
      rect: { x: pageRect.x, y: pageRect.y, width: pageRect.width, height: pageRect.height },
      pageWidthPt: Number(container.dataset.pdfPageWidth),
      pageHeightPt: Number(container.dataset.pdfPageHeight),
      scaleX: pageRect.width / Number(container.dataset.pdfPageWidth),
      scaleY: pageRect.height / Number(container.dataset.pdfPageHeight),
      inlineWidth: container.style.width,
      inlineHeight: container.style.height,
      containerStyle: styleFor(container),
      lines: [...container.querySelectorAll('[data-source-line-id]')].map(element => ({
        id: element.getAttribute('data-source-line-id'),
        baseline: element.getAttribute('data-source-baseline-y'),
        rect: relativeRect(element),
      })),
      symbols: [...container.querySelectorAll('[data-symbol-id], [data-source-symbol-id]')].map(element => ({
        id: element.getAttribute('data-symbol-id') ?? element.getAttribute('data-source-symbol-id'),
        tag: element.tagName.toLowerCase(), rect: relativeRect(element), style: styleFor(element),
      })),
      images: [...container.querySelectorAll('img')].map(element => ({
        src: element.getAttribute('src'),
        className: typeof element.className === 'string' ? element.className : element.className.baseVal,
        rect: relativeRect(element), style: styleFor(element),
        naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight,
      })),
    };
  });
  const viewerMetrics = await capturePageMetrics();
  if (config.viewerScreenshot) {
    await mkdir(dirname(resolve(config.viewerScreenshot)), { recursive: true });
    await page.locator('.page-container').screenshot({
      path: resolve(config.viewerScreenshot), scale: 'css', animations: 'disabled', caret: 'hide',
    });
  }

  await page.emulateMedia({ media: 'print' });
  // PageRenderer converts points to CSS pixels at 96/72 and reserves 48 CSS
  // px when fitting. Keep that fitting gutter inside the printable root by
  // centering an unshrunk stage and offsetting its 24 px margin on each side.
  const cssWidth = pageData.width * (96 / 72);
  const cssHeight = pageData.height * (96 / 72);
  const stageCssWidth = cssWidth + 48;
  const stageCssHeight = cssHeight + 48;
  await page.addStyleTag({ content: `
    @page { size: ${pageData.width}pt ${pageData.height}pt; margin: 0; }
    html, body, #root, .app-container, .viewer-main, .page-wrapper, .page-renderer {
      width: ${cssWidth}px !important; height: ${cssHeight}px !important;
      min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important;
      margin: 0 !important; padding: 0 !important; overflow: hidden !important; box-sizing: border-box !important;
    }
    .page-stage {
      width: ${stageCssWidth}px !important; height: ${stageCssHeight}px !important;
      min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important;
      flex: 0 0 auto !important; position: relative !important; left: -24px !important; top: -24px !important;
      align-items: center !important; justify-content: center !important;
      margin: 0 !important; padding: 0 !important; overflow: hidden !important; scrollbar-gutter: auto !important;
      box-sizing: border-box !important;
    }
    .app-container { display: flex !important; flex-direction: row !important; }
    .viewer-main.single, .page-wrapper, .page-renderer, .page-stage { display: flex !important; }
    .global-nav-slot, .editing-symbol-rail, .pdf-sidebar, .app-shell-header-actions, .app-shell-faq-actions,
    .floating-arrow, .toast-notification, .translation-editor, .rich-block-editor, .block-editor, .faq-dialog {
      display: none !important;
    }
    .page-container {
      width: ${pageData.width}pt !important; height: ${pageData.height}pt !important;
      max-width: none !important; max-height: none !important; margin: 0 !important;
      box-shadow: none !important; transition: none !important; overflow: hidden !important;
    }
    .page-container img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  ` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  const printMetrics = await capturePageMetrics();
  if (config.printScreenshot) {
    await mkdir(dirname(resolve(config.printScreenshot)), { recursive: true });
    await page.locator('.page-container').screenshot({
      path: resolve(config.printScreenshot), scale: 'css', animations: 'disabled', caret: 'hide',
    });
  }
  if (config.metricsOutput) {
    await mkdir(dirname(resolve(config.metricsOutput)), { recursive: true });
    await writeFile(resolve(config.metricsOutput), JSON.stringify({
      page: config.page, language: config.language, viewer: viewerMetrics, print: printMetrics,
    }, null, 2));
  }
  const printLayout = await page.evaluate(() => Object.fromEntries(
    ['.app-container', '.viewer-main', '.page-wrapper', '.page-renderer', '.page-stage', '.page-container', '.page-container img']
      .map(selector => {
        const element = document.querySelector(selector);
        if (!element) return [selector, null];
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return [selector, {
          rect: [rect.x, rect.y, rect.width, rect.height],
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          position: style.position,
          transform: style.transform,
        }];
      }),
  ));
  if (config.debugScreenshot) await page.screenshot({ path: resolve(config.debugScreenshot), fullPage: false });
  console.log('[page-export] print layout diagnostic', JSON.stringify(printLayout));

  const textSanity = await page.evaluate(() => ({
    pageText: document.querySelector('.page-container')?.textContent ?? '',
    pageImageReady: !!document.querySelector('.page-container img')?.naturalWidth,
  }));
  if (!textSanity.pageImageReady) throw new Error('The page background image is not ready.');
  if (expectedTranslation && !normalizeText(textSanity.pageText).includes(normalizeText(expectedTranslation).slice(0, 48))) {
    throw new Error('Saved PT-BR text is not visible in the rendered page; refusing to export English fallback.');
  }
  if (failedRequests.length) throw new Error(`Page has failed network assets: ${failedRequests.slice(0, 5).join('; ')}`);
  const actualApiOrigins = [...apiRequestOrigins].sort();
  if (actualApiOrigins.length !== 1 || actualApiOrigins[0] !== expectedApiOrigin) {
    throw new Error(`Expected one Payload/API origin ${expectedApiOrigin}; viewer queried ${actualApiOrigins.join(', ') || 'none'}.`);
  }

  const viewerStructure = await page.locator('.page-container').evaluate(container => ({
    sourceGeometryLines: container.querySelectorAll('[data-source-line-id]').length,
    semanticSymbols: container.querySelectorAll('svg[data-symbol-id], svg[data-source-symbol-id]').length,
    renderedImages: [...container.querySelectorAll('img')].filter(image => image.naturalWidth > 0).length,
    loadedFonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family),
  }));

  let pdfVerification = null;
  if (!config.captureOnly) {
    await mkdir(dirname(config.output), { recursive: true });
    await page.pdf({
      path: config.output,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  const normalizePageBox = spawnSync('python', [
    resolve('scripts/normalize_export_page_box.py'),
    config.output,
    String(pageData.width),
    String(pageData.height),
    config.sourcePdf,
    String(config.page),
  ], { encoding: 'utf8' });
  if (normalizePageBox.status !== 0) {
    throw new Error(`Could not normalize the exported MediaBox: ${normalizePageBox.stderr || normalizePageBox.stdout}`);
  }
  const verificationArgs = [resolve('scripts/verify_page_pdf_export.py'), config.output, '--page', String(config.page)];
  if (expectedTranslation) verificationArgs.push('--contains', normalizeText(expectedTranslation).slice(0, 48));
  const verification = spawnSync('python', verificationArgs, { encoding: 'utf8' });
  if (verification.status !== 0) {
    throw new Error(`Exported PDF failed text/geometry verification: ${verification.stderr || verification.stdout}`);
  }
    pdfVerification = true;
  }
  const summarizeMetrics = metrics => ({
    rect: metrics.rect,
    scale: [metrics.scaleX, metrics.scaleY],
    inlineSize: [metrics.inlineWidth, metrics.inlineHeight],
    lineCount: metrics.lines.length,
    symbolCount: metrics.symbols.length,
    imageCount: metrics.images.length,
  });
  console.log('[page-export] completed environment and result', JSON.stringify({
    viewerUrl: page.url(),
    viewerOrigin: normalizedOrigin(page.url()),
    viewerLocale,
    viewerStructure,
    viewerMetrics: summarizeMetrics(viewerMetrics),
    printMetrics: summarizeMetrics(printMetrics),
    printLayout: Object.fromEntries(Object.entries(printLayout).filter(([key]) => ['.page-stage', '.page-container'].includes(key))),
    translationApiOrigin: expectedApiOrigin,
    actualApiOrigins,
    sourcePdf: config.sourcePdf,
    output: config.output,
    page: config.page,
    language: config.language,
    pageSizePt: [pageData.width, pageData.height],
    normalizedMediaBox: !config.captureOnly,
    verifiedTranslationRecords: config.language === 'pt-BR' ? true : undefined,
    pdfVerification,
  }, null, 2));
} finally {
  await browser.close();
}
