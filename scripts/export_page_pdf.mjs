#!/usr/bin/env node
/** Export one persisted rulebook page/language through the same React viewer. */

import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
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
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith('--')) continue;
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    const name = ({ '--page': 'page', '--language': 'language', '--output': 'output', '--base-url': 'baseUrl', '--api-url': 'apiUrl', '--source-pdf': 'sourcePdf', '--browser': 'executablePath' })[key];
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

  const initialDevEnvironment = await page.locator('.dev-environment-indicator').evaluate(element => ({
    webOrigin: element.getAttribute('data-web-origin'),
    apiOrigin: element.getAttribute('data-api-origin'),
    locale: element.getAttribute('data-locale'),
    mode: element.getAttribute('data-mode'),
  })).catch(() => null);
  const expectedApiOrigin = normalizedOrigin(config.apiUrl);
  if (initialDevEnvironment?.apiOrigin && normalizedOrigin(initialDevEnvironment.apiOrigin) !== expectedApiOrigin) {
    throw new Error(`Viewer API origin ${initialDevEnvironment.apiOrigin} does not match export translation API ${expectedApiOrigin}.`);
  }

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

  if (config.language === 'pt-BR') {
    await page.locator('select.language-select').selectOption('pt-BR');
    await page.waitForFunction(
      expected => document.querySelector('.dev-environment-indicator')?.getAttribute('data-locale') === expected,
      config.language,
      { timeout: 10000 },
    );
    const expectedFragment = normalizeText(expectedTranslation).slice(0, 48);
    await page.waitForFunction(fragment => {
      const content = normalizeText(document.querySelector('.page-container')?.textContent ?? '');
      return content.includes(fragment);
      function normalizeText(value) { return value.replace(/\s+/gu, ' ').trim(); }
    }, expectedFragment, { timeout: 60000 });
  }

  const devEnvironment = await page.locator('.dev-environment-indicator').evaluate(element => ({
    webOrigin: element.getAttribute('data-web-origin'),
    apiOrigin: element.getAttribute('data-api-origin'),
    locale: element.getAttribute('data-locale'),
    mode: element.getAttribute('data-mode'),
  }));
  if (devEnvironment.locale !== config.language) {
    throw new Error(`Viewer locale ${devEnvironment.locale} does not match requested export language ${config.language}.`);
  }
  if (devEnvironment.apiOrigin && normalizedOrigin(devEnvironment.apiOrigin) !== expectedApiOrigin) {
    throw new Error(`Viewer API origin ${devEnvironment.apiOrigin} does not match export translation API ${expectedApiOrigin}.`);
  }

  await page.evaluate(() => document.fonts.ready);
  await page.getByTitle('Fit to Screen').click();
  await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'print' });
  // PageRenderer converts source points to CSS pixels at 96/72 and reserves
  // 48 CSS px when fitting a page to its stage. Keep that extra room on the
  // stage only; growing the printable root makes Chromium shrink the whole
  // page to fit and exposes the app's dark background as an edge strip.
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
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);

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
  console.log('[page-export] completed environment and result', JSON.stringify({
    viewerUrl: page.url(),
    devEnvironment,
    translationApiOrigin: expectedApiOrigin,
    actualApiOrigins,
    sourcePdf: config.sourcePdf,
    output: config.output,
    page: config.page,
    language: config.language,
    pageSizePt: [pageData.width, pageData.height],
    normalizedMediaBox: true,
    verifiedTranslationRecords: config.language === 'pt-BR' ? true : undefined,
  }, null, 2));
} finally {
  await browser.close();
}
