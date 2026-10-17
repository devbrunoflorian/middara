#!/usr/bin/env node
/** Export one persisted rulebook page/language through the same React viewer. */

import { chromium } from 'playwright';
import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative as relativePath, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifySnapshotRenderTargets } from './lib/snapshot-render-verification.mjs';

function argsFrom(argv) {
  const result = {
    page: undefined,
    language: 'en',
    profile: 'visual',
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
    snapshot: undefined,
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
    const name = ({ '--page': 'page', '--language': 'language', '--profile': 'profile', '--output': 'output', '--base-url': 'baseUrl', '--api-url': 'apiUrl', '--source-pdf': 'sourcePdf', '--browser': 'executablePath', '--debug-screenshot': 'debugScreenshot', '--viewer-screenshot': 'viewerScreenshot', '--print-screenshot': 'printScreenshot', '--metrics-output': 'metricsOutput', '--snapshot': 'snapshot' })[key];
    if (!name) throw new Error(`Unknown option: ${key}`);
    result[name] = name === 'page' ? Number(value) : value;
    i += 1;
  }
  if (!Number.isInteger(result.page) || result.page < 1 || result.page > 102) throw new Error('Use --page with an integer from 1 to 102.');
  if (!['en', 'pt-BR'].includes(result.language)) throw new Error('Use --language en or pt-BR.');
  if (result.profile !== 'visual') throw new Error('Only the visual PDF profile is currently available.');
  if (!result.output) result.output = `output/pdf/page-${String(result.page).padStart(3, '0')}-${result.language}-visual.pdf`;
  result.output = resolve(result.output);
  if (result.snapshot) result.snapshot = resolve(result.snapshot);
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
const immutableSnapshot = config.snapshot
  ? JSON.parse(await readFile(config.snapshot, 'utf8'))
  : null;
console.log('[page-export] requested environment', JSON.stringify({
  viewerUrl: config.baseUrl,
  translationApiOrigin: normalizedOrigin(config.apiUrl),
  page: config.page,
  language: config.language,
  profile: config.profile,
  immutableSnapshot: !!immutableSnapshot,
}, null, 2));
const pageId = String(config.page).padStart(3, '0');
const snapshotDir = immutableSnapshot ? dirname(config.snapshot) : null;
const pageDataPath = immutableSnapshot
  ? resolve(snapshotDir, 'pages', `page_${pageId}`, `page_${pageId}_dom.json`)
  : resolve(`apps/web/public/pages/page_${pageId}/page_${pageId}_dom.json`);
const pageData = JSON.parse(await readFile(pageDataPath, 'utf8'));
if (!(pageData.width > 0 && pageData.height > 0)) throw new Error(`Missing page dimensions in ${pageDataPath}`);

let expectedTranslation = '';
if (config.language === 'pt-BR') {
  const prefix = `page_${config.page}_`;
  let docs;
  if (immutableSnapshot) {
    docs = (immutableSnapshot.translations ?? []).filter(doc => doc.language === 'pt-BR' && String(doc.spanKey ?? '').startsWith(prefix));
  } else {
    const url = new URL('/api/translations', config.apiUrl);
    url.searchParams.set('where[language][equals]', 'pt-BR');
    url.searchParams.set('limit', '5000');
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Payload returned ${response.status} while loading PT-BR translations.`);
    const payload = await response.json();
    docs = (payload.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith(prefix));
  }
  if (!docs.length && !immutableSnapshot) throw new Error(`No saved PT-BR translation records found for page ${config.page}.`);
  expectedTranslation = docs
    .map(doc => translationPlainText(doc.data))
    .filter(text => text.length >= 20 && !Array.from(text).some(char => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0xE000 && code <= 0xF8FF;
    }))
    .sort((a, b) => b.length - a.length)[0] ?? '';
  if (!expectedTranslation && !immutableSnapshot) throw new Error(`Page ${config.page} has no ordinary PT-BR prose to verify in the viewer.`);
}

const launchOptions = { headless: true };
if (config.executablePath) launchOptions.executablePath = config.executablePath;
else if (process.platform === 'win32') launchOptions.executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(launchOptions);
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  if (immutableSnapshot) {
    const pageOrigin = normalizedOrigin(config.baseUrl);
    const apiOrigin = normalizedOrigin(config.apiUrl);
    await context.route('**/api/**', async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== apiOrigin || route.request().method() !== 'GET') {
        await route.abort('blockedbyclient');
        return;
      }
      const params = requestUrl.searchParams;
      let docs = [];
      if (requestUrl.pathname === '/api/translations') {
        const language = params.get('where[language][equals]');
        docs = immutableSnapshot.translations ?? [];
        if (language) docs = docs.filter(doc => doc.language === language);
      } else if (requestUrl.pathname === '/api/layout-frames') {
        const requestedPage = Number(params.get('where[and][0][pageNumber][equals]') ?? params.get('where[pageNumber][equals]'));
        const language = params.get('where[and][1][language][equals]') ?? params.get('where[language][equals]');
        docs = (immutableSnapshot.layoutFrames ?? []).filter(doc =>
          (!Number.isFinite(requestedPage) || Number(doc.pageNumber) === requestedPage)
          && (!language || doc.language === language));
      } else if (requestUrl.pathname === '/api/symbol-alias-settings') {
        docs = immutableSnapshot.symbolAliasSettings ?? [];
      } else {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Not included in export snapshot.' }] }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }),
      });
    });
    await context.route('**/pages/page_*/*', async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== pageOrigin) {
        await route.continue();
        return;
      }
      const match = requestUrl.pathname.match(/^\/pages\/(page_\d{3})\/(.+)$/u);
      if (!match || !immutableSnapshot.assetPages?.includes(Number(match[1].slice(-3)))) {
        // Snapshot exports intentionally omit unrelated pages. Return the
        // static server's ordinary not-found response instead of aborting the
        // request, so the exporter does not treat its own isolation boundary
        // (for example the viewer's initial page-1 bootstrap) as a network
        // failure.
        await route.fulfill({ status: 404, body: 'Not included in export snapshot.' });
        return;
      }
      const filePath = resolve(snapshotDir, 'pages', match[1], decodeURIComponent(match[2]));
      const allowedRoot = resolve(snapshotDir, 'pages', match[1]);
      const relative = relativePath(allowedRoot, filePath);
      if (!relative || relative.startsWith(`..${sep}`) || relative === '..') {
        await route.abort('blockedbyclient');
        return;
      }
      try {
        await access(filePath);
        await route.fulfill({ path: filePath });
      } catch {
        // Keep missing optional page sidecars equivalent to the static
        // server's normal HTTP 404; aborting them becomes a browser
        // requestfailed event and incorrectly fails an otherwise valid export.
        await route.fulfill({ status: 404, body: 'Not found' });
      }
    });
  }
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

  if (immutableSnapshot?.verifyRenderedSnapshot) {
    const snapshotRecords=immutableSnapshot.translations??[];
    const snapshotKeys=new Set(snapshotRecords
      .filter(doc=>doc.language===config.language)
      .map(doc=>doc.spanKey));
    const supersededLegacyKeys=new Set();
    for(const [blockIndex,block] of (pageData.blocks??[]).entries()){
      const units=block.typographicUnits??[];
      if(!units.length)continue;
      const completeChildOverrides=units.every(unit=>
        snapshotKeys.has(`page_${config.page}_unit_${unit.id}__${config.language}`),
      );
      if(completeChildOverrides){
        supersededLegacyKeys.add(`${block.editorKey??`page_${config.page}_block_${blockIndex}`}__${config.language}`);
      }
    }
    // Preserve legacy parent records in the snapshot, but don't require them
    // to render once every child editorial unit has its own active override.
    const expectedRecords=snapshotRecords.filter(doc=>
      doc.language===config.language&&!supersededLegacyKeys.has(doc.spanKey),
    );
    const snapshotChecks=expectedRecords.map(doc=>({
      spanKey:doc.spanKey,
      expected:normalizeText((doc.data.segments??[]).map(s=>s.symbolId?`[symbol:${s.symbolId}]`:s.text||'').join('')),
    }));
    const renderedTargets=await page.locator('.page-container').evaluate(container=>{
      const normalize=value=>value.replace(/\s+/gu,' ').trim();
      const walk=node=>{
        if(node.nodeType===Node.TEXT_NODE)return node.textContent||'';
        if(!(node instanceof Element))return '';
        if(node.getAttribute('aria-hidden')==='true'||getComputedStyle(node).visibility==='hidden')return '';
        const id=node.getAttribute('data-symbol-id');if(id)return `[symbol:${id}]`;
        return [...node.childNodes].map(walk).join('');
      };
      return [...container.querySelectorAll('[data-rendered-translation-key]')].map(element=>({
        spanKey:element.getAttribute('data-rendered-translation-key'),
        text:normalize(walk(element)),
      }));
    });
    const verification=verifySnapshotRenderTargets(snapshotChecks,renderedTargets);
    for(const check of verification){
      if(check.matchCount!==1){
        throw new Error(`Requested snapshot ${check.spanKey} is not rendered exactly once with the expected text/symbol order; refusing source fallback. ${JSON.stringify(check)}`);
      }
    }
    console.log('[page-export] edited snapshot text/symbol order verified',expectedRecords.length);
  }

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
    const toPtRect = rect => ({
      x: (rect.left - pageRect.left) / (pageRect.width / Number(container.dataset.pdfPageWidth)),
      y: (rect.top - pageRect.top) / (pageRect.height / Number(container.dataset.pdfPageHeight)),
      width: rect.width / (pageRect.width / Number(container.dataset.pdfPageWidth)),
      height: rect.height / (pageRect.height / Number(container.dataset.pdfPageHeight)),
    });
    const translationTargets = [...container.querySelectorAll('[data-rendered-translation-key]')].map(element => {
      const frame = element.closest('.block-container,.credit-field') ?? element;
      const frameRect = toPtRect(frame.getBoundingClientRect());
      const range = document.createRange();
      range.selectNodeContents(element);
      const fragments = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
      const lines = [];
      for (const fragment of fragments) {
        const top = fragment.top - pageRect.top;
        let line = lines.find(candidate => Math.abs(candidate.topPx - top) < 1);
        if (!line) {
          line = { topPx: top, leftPx: fragment.left - pageRect.left, rightPx: fragment.right - pageRect.left,
            bottomPx: fragment.bottom - pageRect.top };
          lines.push(line);
        } else {
          line.leftPx = Math.min(line.leftPx, fragment.left - pageRect.left);
          line.rightPx = Math.max(line.rightPx, fragment.right - pageRect.left);
          line.bottomPx = Math.max(line.bottomPx, fragment.bottom - pageRect.top);
        }
      }
      const contentBounds = lines.length ? toPtRect({
        left: pageRect.left + Math.min(...lines.map(line => line.leftPx)),
        top: pageRect.top + Math.min(...lines.map(line => line.topPx)),
        right: pageRect.left + Math.max(...lines.map(line => line.rightPx)),
        bottom: pageRect.top + Math.max(...lines.map(line => line.bottomPx)),
        width: Math.max(...lines.map(line => line.rightPx)) - Math.min(...lines.map(line => line.leftPx)),
        height: Math.max(...lines.map(line => line.bottomPx)) - Math.min(...lines.map(line => line.topPx)),
      }) : null;
      return {
        spanKey: element.getAttribute('data-rendered-translation-key'),
        text: (element.textContent ?? '').replace(/\s+/gu, ' ').trim(),
        elementRectPt: toPtRect(element.getBoundingClientRect()),
        frameRectPt: frameRect,
        lineCount: lines.length,
        widestLinePt: lines.length ? Math.max(...lines.map(line => line.rightPx - line.leftPx))
          / (pageRect.width / Number(container.dataset.pdfPageWidth)) : 0,
        contentBoundsPt: contentBounds,
        edgeExcessPt: contentBounds ? {
          left: Math.max(0, frameRect.x - contentBounds.x),
          top: Math.max(0, frameRect.y - contentBounds.y),
          right: Math.max(0, contentBounds.x + contentBounds.width - frameRect.x - frameRect.width),
          bottom: Math.max(0, contentBounds.y + contentBounds.height - frameRect.y - frameRect.height),
        } : { left: 0, top: 0, right: 0, bottom: 0 },
      };
    });
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
      translationTargets,
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
    .floating-arrow, .toast-notification, .translation-editor, .rich-block-editor, .block-editor, .faq-dialog,
    .editorial-experiment-rail, .editorial-experiment-switcher {
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
  const normalizeArgs = [
    resolve('scripts/normalize_export_page_box.py'),
    config.output,
    String(pageData.width),
    String(pageData.height),
  ];
  if (immutableSnapshot) {
    normalizeArgs.push('--source-page-boxes-json', config.snapshot, '--source-page', String(config.page));
  } else {
    normalizeArgs.push(config.sourcePdf, String(config.page));
  }
  const normalizePageBox = spawnSync('python', normalizeArgs, { encoding: 'utf8' });
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
