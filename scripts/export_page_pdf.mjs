#!/usr/bin/env node
/** Export one persisted rulebook page/language through the same React viewer. */

import { chromium } from 'playwright';
import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative as relativePath, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifySnapshotRenderTargets } from './lib/snapshot-render-verification.mjs';
import { groupPageRendererVisualLines } from '../apps/web/src/editorialStructurePrevalidator.mjs';

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
    betaDiagnostic: false,
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
    if (key === '--beta-diagnostic') {
      result.betaDiagnostic = true;
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
  if (result.betaDiagnostic && result.language !== 'pt-BR') throw new Error('--beta-diagnostic is only valid with --language pt-BR.');
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

function sourceLineText(line) {
  return (line?.spans ?? [])
    .filter(span => !span.renderOnlyStrokePass)
    .map(span => span.displayOverride || span.text || '')
    .join('');
}

function listFlowTranslationKeys(block, pageNumber, blockIndex) {
  const lines = block.lines ?? [];
  const markerGlyphs = new Set(Array.from('•·▪■●○◦▫‣⁃'));
  const markerIndexes = new Set(block.listMarkerLineIndexes ?? []);
  if (block.disableAutoListMarkerDetection) return [];

  for (let index = 0; index < lines.length; index += 1) {
    if (markerIndexes.has(index)) continue;
    const markerText = Array.from(sourceLineText(lines[index]).replace(/[\s\u00a0]+/gu, ''));
    if (markerText.length !== 1 || !markerGlyphs.has(markerText[0])) continue;
    const nextTextLine = lines.slice(index + 1).find(candidate => sourceLineText(candidate).trim().length > 0);
    if (!nextTextLine) continue;
    const markerSize = lines[index].spans?.find(span => !span.renderOnlyStrokePass)?.size ?? 10;
    const horizontalGap = nextTextLine.bbox[0] - lines[index].bbox[0];
    const verticalDelta = Math.abs(nextTextLine.bbox[1] - lines[index].bbox[1]);
    if (horizontalGap <= markerSize * 0.6 || horizontalGap > markerSize * 3
      || verticalDelta > Math.max(2.5, markerSize * 0.25)) continue;
    markerIndexes.add(index);
  }

  const sortedMarkerIndexes = [...markerIndexes].sort((a, b) => a - b);
  const firstMarkerIndex = sortedMarkerIndexes[0] ?? -1;
  const shouldSplitListFlow = markerIndexes.size > 0
    && (markerIndexes.size > 1 || firstMarkerIndex > 0);
  const canSplitListFlow = shouldSplitListFlow
    && !block.adminReadOnly
    && !block.preserveLegacySpanOverrides
    && !block.typographicUnits?.length
    && !block.typographicSpanUnits?.length
    && !block.creditUnits?.length
    && !block.creditUnit;
  if (!canSplitListFlow) return [];

  const keys = [];
  let activeLines = [];
  let activeMarkerOrdinal;
  let markerOrdinal = -1;
  const flushText = () => {
    if (!activeLines.length) return;
    const firstLine = activeLines[0];
    const partKey = `${activeMarkerOrdinal === undefined ? 'prose' : `item-${activeMarkerOrdinal}`}-${firstLine.id}`;
    const sourceEditorKey = block.editorKey ?? `page_${pageNumber}_block_${blockIndex}`;
    keys.push(`${sourceEditorKey}__${partKey}__pt-BR`);
    activeLines = [];
    activeMarkerOrdinal = undefined;
  };
  lines.forEach((line, index) => {
    if (markerIndexes.has(index)) {
      flushText();
      markerOrdinal += 1;
      activeMarkerOrdinal = markerOrdinal;
      return;
    }
    activeLines.push(line);
  });
  flushText();
  return keys;
}

function rendererKeyForReviewCandidate(candidate, pageData) {
  const canonicalKey = String(candidate.copyfitCanonicalSpanKey ?? '');
  const blockFromCanonical = canonicalKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u);
  const blockFromProposal = String(candidate.spanKey ?? '').match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u);
  if (/^page_\d+_unit_/u.test(canonicalKey)) return canonicalKey.endsWith('__pt-BR') ? canonicalKey : `${canonicalKey}__pt-BR`;
  if (/^page_\d+_unit_/u.test(String(candidate.spanKey ?? ''))) {
    return candidate.spanKey.endsWith('__pt-BR') ? candidate.spanKey : `${candidate.spanKey}__pt-BR`;
  }
  const blockMatch = blockFromCanonical ?? blockFromProposal;
  const blockIndex = Number.isInteger(candidate.blockIndex) ? candidate.blockIndex
    : blockMatch ? Number(blockMatch[1]) : null;
  if (blockIndex !== null && blockIndex >= 0) {
    const block = pageData.blocks[blockIndex];
    return block?.editorKey ? `${block.editorKey}__pt-BR` : `page_${candidate.pageNumber}_block_${blockIndex}`;
  }
  return canonicalKey || String(candidate.spanKey ?? '');
}

function activePendingDraftsForPage(snapshot, pageData, pageNumber, translations) {
  const catalog = snapshot?.translationReviewCatalog;
  if (!catalog || !Array.isArray(catalog.proposals)) return [];
  const humanKeys = new Set(translations
    .filter(record => record.language === 'pt-BR')
    .flatMap(record => {
      const key = String(record.spanKey ?? '');
      return [key, key.replace(/__pt-BR$/u, '')];
    }));
  const records = (snapshot.translationReviews ?? []).filter(record => Number(record.pageNumber) === pageNumber);
  const candidates = catalog.proposals.flatMap(proposal => proposal.candidates ?? [])
    .filter(candidate => Number(candidate.pageNumber) === pageNumber);
  const eligible = [];
  for (const candidate of candidates) {
    const record = records.find(item => item.reviewKey === candidate.reviewKey
      && item.proposalId === candidate.proposalId
      && String(item.proposalVersion) === String(candidate.proposalVersion)
      && String(item.spanKey ?? '').replace(/__pt-BR$/u, '') === String(candidate.spanKey ?? '').replace(/__pt-BR$/u, ''));
    if (!record || record.approvalStatus !== 'pending' || record.reviewDisposition === 'archived'
      || record.publication || candidate.diagnosticBlank
      || String(candidate.copyfitClassification ?? '').toUpperCase() === 'OVER'
      || /^(?:blocked|failed)(?:[_-]|$)|(?:^|[_-])dtp[_-]exception[_-]open/iu.test(String(candidate.technicalStatus ?? ''))) continue;
    const rendererKey = rendererKeyForReviewCandidate(candidate, pageData);
    const ownershipKeys = [
      rendererKey,
      rendererKey.replace(/__pt-BR$/u, ''),
      candidate.spanKey,
      String(candidate.spanKey ?? '').replace(/__pt-BR$/u, ''),
      candidate.copyfitCanonicalSpanKey,
      String(candidate.copyfitCanonicalSpanKey ?? '').replace(/__pt-BR$/u, ''),
    ].filter(Boolean).map(String);
    if (ownershipKeys.some(key => humanKeys.has(key))) continue;
    const override = record.data ?? candidate.data;
    if (!Array.isArray(override?.segments)) continue;
    const renderedSpanKey = rendererKey.endsWith('__pt-BR') ? rendererKey : `${rendererKey}__pt-BR`;
    eligible.push({ ...record, spanKey: rendererKey, renderedSpanKey, data: override });
  }
  return eligible;
}

async function fetchCollectionSnapshot(apiUrl, slug) {
  const url = new URL(`/api/${slug}`, apiUrl);
  url.searchParams.set('limit', '5000');
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Payload returned ${response.status} while loading ${slug}.`);
  const body = await response.json();
  if (!Array.isArray(body.docs) || (Number.isInteger(body.totalDocs) && body.totalDocs > body.docs.length)) {
    throw new Error(`Payload ${slug} snapshot is incomplete.`);
  }
  return body.docs;
}

function normalizeText(value) {
  return value
    .replace(/\s+/gu, ' ')
    // List markers occupy a separate visual grid cell; DOM textContent can
    // concatenate the marker and the first word even though the page renders a gap.
    .replace(/•(?=\S)/gu, '• ')
    // Numbered phases use a source-positioned marker cell; the DOM text nodes
    // remain adjacent even though the fixed column supplies the visual gap.
    .replace(/(?<!\w)([1-4]\.)(?=[A-Z\u00c0-\u00de])/gu, '$1 ')
    .trim();
}

function normalizedOrigin(value) {
  return new URL(value).origin;
}

const config = argsFrom(process.argv.slice(2));
const immutableSnapshot = config.snapshot
  ? JSON.parse(await readFile(config.snapshot, 'utf8'))
  : null;
const snapshotDir = immutableSnapshot ? dirname(config.snapshot) : null;
const pageAssetSource = immutableSnapshot
  ? { kind: 'snapshot', path: config.snapshot }
  : { kind: 'viewer', origin: normalizedOrigin(config.baseUrl) };
console.log('[page-export] requested environment', JSON.stringify({
  viewerUrl: config.baseUrl,
  translationApiOrigin: normalizedOrigin(config.apiUrl),
  page: config.page,
  language: config.language,
  profile: config.profile,
  immutableSnapshot: !!immutableSnapshot,
  pageAssetSource,
}, null, 2));
const pageId = String(config.page).padStart(3, '0');
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
  const legacyBlockKeysSupersededByUnits = new Set();
  for (const [blockIndex, block] of (pageData.blocks ?? []).entries()) {
    const units = block.typographicUnits ?? [];
    const hasEveryUnit = units.length > 0 && units.every(unit => docs.some(doc =>
      doc.spanKey === `page_${config.page}_unit_${unit.id}__pt-BR`));
    const listFlowKeys = listFlowTranslationKeys(block, config.page, blockIndex);
    const hasEveryListFlowUnit = listFlowKeys.length > 0 && listFlowKeys.every(key =>
      docs.some(doc => doc.spanKey === key));
    if (hasEveryUnit || hasEveryListFlowUnit) {
      const blockKey = block.editorKey ?? `page_${config.page}_block_${blockIndex}`;
      legacyBlockKeysSupersededByUnits.add(`${blockKey}__pt-BR`);
    }
  }
  expectedTranslation = docs
    .filter(doc => !legacyBlockKeysSupersededByUnits.has(doc.spanKey))
    .map(doc => translationPlainText(doc.data))
    // Caption-only pages can have several valid short translations but no
    // paragraph-sized string. A short distinctive fragment is enough for the
    // live-viewer/PDF smoke check; snapshot verification checks every unit.
    .filter(text => text.length >= 4 && !Array.from(text).some(char => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0xE000 && code <= 0xF8FF;
    }))
    .sort((a, b) => b.length - a.length)[0] ?? '';
  let reviewSnapshot = immutableSnapshot;
  if (!reviewSnapshot) {
    const catalogUrl = new URL('/translation-review/catalog.json', config.baseUrl);
    const [translationReviews, catalogResponse] = await Promise.all([
      fetchCollectionSnapshot(config.apiUrl, 'translation-reviews'),
      fetch(catalogUrl, { signal: AbortSignal.timeout(20000) }),
    ]);
    if (!catalogResponse.ok) throw new Error(`Viewer review catalog returned ${catalogResponse.status}.`);
    reviewSnapshot = {
      translations: docs,
      translationReviews,
      translationReviewCatalog: await catalogResponse.json(),
    };
  }
  const reviewDrafts = activePendingDraftsForPage(reviewSnapshot, pageData, config.page,
    immutableSnapshot?.translations ?? docs);
  if (!expectedTranslation && reviewDrafts.length) {
    expectedTranslation = reviewDrafts
      .map(doc => translationPlainText(doc.data))
      .filter(text => text.length >= 4 && !Array.from(text).some(char => {
        const code = char.codePointAt(0) ?? 0;
        return code >= 0xE000 && code <= 0xF8FF;
      }))
      .sort((a, b) => b.length - a.length)[0] ?? '';
  }
  if (!expectedTranslation && !immutableSnapshot) throw new Error(`Page ${config.page} has no visible PT-BR translation or current pending review draft to verify.`);
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
      } else if (requestUrl.pathname === '/api/translation-reviews') {
        docs = immutableSnapshot.translationReviews ?? [];
      } else if (requestUrl.pathname === '/api/translation-review-requests') {
        docs = immutableSnapshot.translationReviewRequests ?? [];
      } else if (requestUrl.pathname === '/api/translation-glossary-decisions') {
        docs = immutableSnapshot.translationGlossaryDecisions ?? [];
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
    await context.route('**/translation-review/catalog.json', async route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== pageOrigin) {
        await route.continue();
        return;
      }
      const catalog = immutableSnapshot.translationReviewCatalog;
      if (!catalog) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) });
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
  const viewerUrl = new URL(config.baseUrl);
  if (config.betaDiagnostic) viewerUrl.searchParams.set('diagnosticBlankUntranslated', '1');
  const appResponse = await page.goto(viewerUrl.toString(), { waitUntil: 'domcontentloaded' });
  if (!appResponse?.ok()) throw new Error(`Viewer returned ${appResponse?.status() ?? 'no response'} at ${config.baseUrl}`);
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));

  const expectedApiOrigin = normalizedOrigin(config.apiUrl);

  const pageInput = page.locator('input.page-input');
  const waitForLayoutFrameResponse = (language) => page.waitForResponse(response => {
    const requestUrl = new URL(response.url());
    if (requestUrl.origin !== expectedApiOrigin || requestUrl.pathname !== '/api/layout-frames') return false;
    const params = requestUrl.searchParams;
    const requestedPage = params.get('where[and][0][pageNumber][equals]') ?? params.get('where[pageNumber][equals]');
    const requestedLanguage = params.get('where[and][1][language][equals]') ?? params.get('where[language][equals]');
    return requestedPage === String(config.page) && requestedLanguage === language;
  }, { timeout: 60000 });
  // Layout frames load independently from translations. Arm these before
  // changing pages/languages so the Viewer screenshot cannot capture source
  // geometry before its localized frame arrives (the print pass naturally
  // waits long enough to hide this race).
  const layoutFrameResponses = config.language === 'pt-BR'
    ? [waitForLayoutFrameResponse('en'), waitForLayoutFrameResponse('pt-BR')]
    : [waitForLayoutFrameResponse('en')];
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

  const localeLabel = config.language === 'pt-BR' ? 'Português (Brasil)' : 'English';
  const localeButton = page.locator(`.language-toggle button[aria-label="${localeLabel}"]`);
  await localeButton.click();
  await page.waitForFunction(
    expected => document.querySelector('.language-toggle button[aria-pressed="true"]')?.getAttribute('aria-label') === expected,
    localeLabel,
    { timeout: 10000 },
  );
  const loadedLayoutFrames = await Promise.all(layoutFrameResponses);
  for (const response of loadedLayoutFrames) {
    if (!response.ok()) throw new Error(`Payload returned ${response.status()} while loading page ${config.page} layout frames.`);
    await response.finished();
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (config.language === 'pt-BR') {
    const expectedFragment = normalizeText(expectedTranslation).slice(0, 48);
    await page.waitForFunction(fragment => {
      // `textContent` drops separators between sibling block boxes (for
      // example a label and the paragraph after it), even though the Viewer
      // visibly separates them. Use the rendered reading order for the live
      // export smoke check, then normalize its line breaks as spaces.
      const container = document.querySelector('.page-container');
      const content = normalizeText(container?.innerText ?? container?.textContent ?? '');
      return content.includes(fragment);
      function normalizeText(value) {
        return value
          .replace(/\s+/gu, ' ')
          .replace(/•(?=\S)/gu, '• ')
          .replace(/(?<!\w)([1-4]\.)(?=[A-Z\u00c0-\u00de])/gu, '$1 ')
          .trim();
      }
    }, expectedFragment, { timeout: 60000 });
  }

  const viewerLocale = await page.locator('.language-toggle button[aria-pressed="true"]').getAttribute('aria-label');
  if (viewerLocale !== localeLabel) {
    throw new Error(`Viewer locale ${viewerLocale} does not match requested export language ${localeLabel}.`);
  }
  if (config.betaDiagnostic) {
    await page.waitForFunction(() => document.querySelector('.app-container')?.getAttribute('data-ptbr-diagnostic-mode') === 'blank-untranslated');
    await page.waitForFunction(() => document.querySelector('.page-container')?.getAttribute('data-diagnostic-blank-keys') !== null);
  }

  const betaArtworkPendingLabels = config.betaDiagnostic && config.page === 100
    ? await page.locator('.page-container').evaluate(container => {
      const labels = [
        { id: 'table-11', text: 'ARTE EM INGLÊS — PT-BR PENDENTE', x: 286, y: 262, width: 104 },
        { id: 'table-13', text: 'ARTE EM INGLÊS — PT-BR PENDENTE', x: 675, y: 362, width: 140 },
      ];
      for (const label of labels) {
        const badge = document.createElement('div');
        badge.className = 'beta-artwork-pending-label';
        badge.dataset.betaArtworkPending = label.id;
        badge.textContent = label.text;
        Object.assign(badge.style, {
          position: 'absolute',
          left: `${label.x}pt`,
          top: `${label.y}pt`,
          width: `${label.width}pt`,
          boxSizing: 'border-box',
          zIndex: '1000002',
          display: 'block',
          padding: '1px 2px',
          border: '0.5pt solid #b78a2e',
          borderRadius: '2pt',
          background: 'rgba(255, 245, 211, 0.96)',
          color: '#5b430b',
          font: '600 5pt/1.05 Arial, sans-serif',
          letterSpacing: '0.1px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        });
        container.appendChild(badge);
      }
      return labels.length;
    })
    : 0;

  await page.evaluate(() => document.fonts.ready);
  await page.locator('button[title="Fit to Screen"], button[title*="Ajustar"], button:has(svg.lucide-maximize)').first().click();
  await page.waitForTimeout(300);

  if (immutableSnapshot?.verifyRenderedSnapshot) {
    const snapshotRecords=immutableSnapshot.translations??[];
    const pageSpanPrefix=`page_${config.page}_`;
    const snapshotKeys=new Set(snapshotRecords
      .filter(doc=>doc.language===config.language&&String(doc.spanKey??'').startsWith(pageSpanPrefix))
      .map(doc=>doc.spanKey));
    const supersededLegacyKeys=new Set();
    for(const [blockIndex,block] of (pageData.blocks??[]).entries()){
      const units=block.typographicUnits??[];
      const completeTypographicChildOverrides=units.length>0&&units.every(unit=>
        snapshotKeys.has(`page_${config.page}_unit_${unit.id}__${config.language}`),
      );
      const listFlowKeys=listFlowTranslationKeys(block,config.page,blockIndex);
      const completeListFlowChildOverrides=listFlowKeys.length>0&&listFlowKeys.every(key=>snapshotKeys.has(key));
      if(completeTypographicChildOverrides||completeListFlowChildOverrides){
        supersededLegacyKeys.add(`${block.editorKey??`page_${config.page}_block_${blockIndex}`}__${config.language}`);
      }
    }
    // Preserve legacy parent records in the snapshot, but don't require them
    // to render once every child editorial unit has its own active override.
    const expectedRecords=snapshotRecords.filter(doc=>
      doc.language===config.language
      &&String(doc.spanKey??'').startsWith(pageSpanPrefix)
      &&!supersededLegacyKeys.has(doc.spanKey),
    );
    const snapshotChecks=expectedRecords.map(doc=>({
      spanKey:doc.spanKey,
      expected:normalizeText((doc.data.segments??[]).map(s=>s.symbolId?`[symbol:${s.symbolId}]`:s.text||'').join('')),
    }));
    if (config.language === 'pt-BR') {
      const humanKeys = new Set(snapshotRecords.filter(doc => doc.language === 'pt-BR'&&String(doc.spanKey??'').startsWith(pageSpanPrefix)).flatMap(doc => [
        String(doc.spanKey ?? ''), String(doc.spanKey ?? '').replace(/__pt-BR$/u, ''),
      ]));
      for (const draft of activePendingDraftsForPage(immutableSnapshot, pageData, config.page, snapshotRecords)) {
        const key = String(draft.renderedSpanKey ?? draft.spanKey ?? '');
        if (humanKeys.has(key) || humanKeys.has(key.replace(/__pt-BR$/u, ''))) continue;
        snapshotChecks.push({
          spanKey: key,
          expected: normalizeText((draft.data.segments ?? []).map(segment => segment.symbolId ? `[symbol:${segment.symbolId}]` : segment.text || '').join('')),
        });
      }
    }
    const renderedTargets=await page.locator('.page-container').evaluate(container=>{
      const normalize=value=>value.replace(/\s+/gu,' ').trim();
      const walk=node=>{
        if(node.nodeType===Node.TEXT_NODE)return node.textContent||'';
        if(!(node instanceof Element))return '';
        if(node.getAttribute('aria-hidden')==='true'||getComputedStyle(node).visibility==='hidden')return '';
        if(node.tagName==='BR')return ' ';
        const id=node.getAttribute('data-symbol-id');if(id)return `[symbol:${id}]`;
        const children=[...node.childNodes].map(walk).join('');
        return node.classList.contains('credit-paragraph')?` ${children} `:children;
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
    console.log('[page-export] edited snapshot text/symbol order verified',verification.length);
  }

  const capturePageMetrics = async () => {
    const metrics = await page.locator('.page-container').evaluate(container => {
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
      // Measure text nodes individually. A Range over the whole rendered unit
      // can return the bounding boxes of block/grid paragraphs rather than
      // their wrapped text rows, which undercounts flowed lists in Copyfit.
      const fragments = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        const style = parent ? getComputedStyle(parent) : null;
        if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) fragments.push(rect);
        }
      }
      const bulletFlow = element.querySelector('[data-source-bullet-flow="true"]');
      return {
        spanKey: element.getAttribute('data-rendered-translation-key'),
        text: (element.textContent ?? '').replace(/\s+/gu, ' ').trim(),
        elementRectPt: toPtRect(element.getBoundingClientRect()),
        frameRectPt: frameRect,
        flowParagraphRectsPt: bulletFlow ? [...bulletFlow.children].flatMap(row => {
          const rect = row.getBoundingClientRect();
          if (!row.textContent?.trim() || rect.width <= 0 || rect.height <= 0) return [];
          const style = getComputedStyle(row);
          const textNode = row.querySelector('[data-source-bullet-flow-body], [data-source-bullet-flow-prose]') ?? row.firstElementChild;
          const textStyle = textNode instanceof HTMLElement ? getComputedStyle(textNode) : null;
          const segment = textNode?.querySelector('span');
          const segmentStyle = segment instanceof HTMLElement ? getComputedStyle(segment) : null;
          return [{
            x: (rect.left - pageRect.left) / (pageRect.width / Number(container.dataset.pdfPageWidth)),
            y: (rect.top - pageRect.top) / (pageRect.height / Number(container.dataset.pdfPageHeight)),
            width: rect.width / (pageRect.width / Number(container.dataset.pdfPageWidth)),
            height: rect.height / (pageRect.height / Number(container.dataset.pdfPageHeight)),
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            marginBottom: style.marginBottom,
            textStyle: textStyle ? {
              display: textStyle.display,
              fontFamily: textStyle.fontFamily,
              fontSize: textStyle.fontSize,
              lineHeight: textStyle.lineHeight,
            } : null,
            segmentStyle: segmentStyle ? {
              fontFamily: segmentStyle.fontFamily,
              fontSize: segmentStyle.fontSize,
              lineHeight: segmentStyle.lineHeight,
            } : null,
          }];
        }) : undefined,
        rangeFragments: fragments.map(fragment => ({
          top: fragment.top - pageRect.top,
          bottom: fragment.bottom - pageRect.top,
          left: fragment.left - pageRect.left,
          right: fragment.right - pageRect.left,
        })),
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
      contentsRowOverflows: [...container.querySelectorAll('.contents-label-field')].flatMap(field => {
        const flow = field.querySelector('.contents-row-flow[data-overflow="true"]');
        if (!flow) return [];
        const text = flow.querySelector('.contents-row-text');
        return [{
          unitId: field.getAttribute('data-rendered-translation-key') ?? field.getAttribute('data-editable-unit-key'),
          text: text?.textContent?.trim() ?? '',
          availableWidthPx: text?.clientWidth ?? 0,
          requiredWidthPx: text?.scrollWidth ?? 0,
        }];
      }),
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
    metrics.translationTargets = metrics.translationTargets.map(target => {
      // Count rows with Copyfit V3's shared grouper. Range bounds are retained
      // as geometric diagnostics, but they are not glyph-ink bounds and must
      // not be presented as proof of clipping.
      const lines = groupPageRendererVisualLines(target.rangeFragments);
      const left = lines.length ? Math.min(...lines.map(line => line.left)) : null;
      const top = lines.length ? Math.min(...lines.map(line => line.top)) : null;
      const right = lines.length ? Math.max(...lines.map(line => line.right)) : null;
      const bottom = lines.length ? Math.max(...lines.map(line => line.bottom)) : null;
      const contentBoundsPt = lines.length ? {
        x: left / metrics.scaleX,
        y: top / metrics.scaleY,
        width: (right - left) / metrics.scaleX,
        height: (bottom - top) / metrics.scaleY,
      } : null;
      const frame = target.frameRectPt;
      return {
        ...target,
        lineCount: lines.length,
        visualLineBoundsPt: lines.map(line => ({
          x: line.left / metrics.scaleX,
          y: line.top / metrics.scaleY,
          width: (line.right - line.left) / metrics.scaleX,
          height: (line.bottom - line.top) / metrics.scaleY,
        })),
        widestLinePt: lines.length
          ? Math.max(...lines.map(line => line.right - line.left)) / metrics.scaleX
          : 0,
        contentBoundsPt,
        contentBoundsBasis: 'union-of-Range.getClientRects; glyph-ink clipping is verified from the print raster',
        edgeExcessPt: contentBoundsPt ? {
          left: Math.max(0, frame.x - contentBoundsPt.x),
          top: Math.max(0, frame.y - contentBoundsPt.y),
          right: Math.max(0, contentBoundsPt.x + contentBoundsPt.width - frame.x - frame.width),
          bottom: Math.max(0, contentBoundsPt.y + contentBoundsPt.height - frame.y - frame.height),
        } : { left: 0, top: 0, right: 0, bottom: 0 },
        rangeFragments: undefined,
      };
    });
    return metrics;
  };
  const viewerMetrics = await capturePageMetrics();
  if (viewerMetrics.contentsRowOverflows.length) {
    throw new Error(`Viewer contents rows overflow their measured frames: ${JSON.stringify(viewerMetrics.contentsRowOverflows)}`);
  }
  const viewerStructure = await page.locator('.page-container').evaluate(container => ({
    sourceGeometryLines: container.querySelectorAll('[data-source-line-id]').length,
    semanticSymbols: container.querySelectorAll('svg[data-symbol-id], svg[data-source-symbol-id]').length,
    renderedImages: [...container.querySelectorAll('img')].filter(image => image.naturalWidth > 0).length,
    loadedFonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family),
  }));
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
    #global-navigation, .global-nav-slot, .editing-symbol-rail, .pdf-sidebar, .app-shell-header-actions, .app-shell-faq-actions,
    .floating-arrow, .toast-notification, .translation-editor, .rich-block-editor, .block-editor, .faq-dialog,
    .editorial-experiment-rail, .editorial-experiment-switcher {
      display: none !important;
    }
    .scroll-page-wrapper { box-shadow: none !important; border-radius: 0 !important; }
    .page-container {
      width: ${pageData.width}pt !important; height: ${pageData.height}pt !important;
      max-width: none !important; max-height: none !important; margin: 0 !important;
      box-shadow: none !important; transition: none !important; overflow: hidden !important;
    }
    .page-container img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    ${config.betaDiagnostic ? `
    /* Match the full-book beta's export-only missing-unit and page-status labels. */
    .translation-review-diagnostic-blank::after {
      content: "PT-BR PENDENTE";
      position: absolute; top: 0; left: 0; z-index: 1000000; display: block;
      padding: 1px 2px; border: 0.5px solid #b78a2e; border-radius: 2px;
      background: rgba(255, 245, 211, 0.96); color: #5b430b;
      font: 600 5px/1.05 Arial, sans-serif; letter-spacing: 0.1px;
      white-space: nowrap; pointer-events: none;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .page-container::after {
      content: "BETA PT-BR — unidades pendentes: " attr(data-diagnostic-blank-count);
      position: absolute; top: 2pt; left: 2pt; z-index: 1000001; display: block;
      padding: 2px 4px; border: 0.5px solid #b78a2e; border-radius: 2px;
      background: rgba(255, 245, 211, 0.96); color: #5b430b;
      font: 600 6px/1.05 Arial, sans-serif; letter-spacing: 0.1px;
      white-space: nowrap; pointer-events: none;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    ` : ''}
  ` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  const printMetrics = await capturePageMetrics();
  if (printMetrics.contentsRowOverflows.length) {
    throw new Error(`Print contents rows overflow their measured frames: ${JSON.stringify(printMetrics.contentsRowOverflows)}`);
  }
  if (config.printScreenshot) {
    await mkdir(dirname(resolve(config.printScreenshot)), { recursive: true });
    await page.locator('.page-container').screenshot({
      path: resolve(config.printScreenshot), scale: 'css', animations: 'disabled', caret: 'hide',
    });
  }
  if (config.metricsOutput) {
    await mkdir(dirname(resolve(config.metricsOutput)), { recursive: true });
    await writeFile(resolve(config.metricsOutput), JSON.stringify({
      page: config.page, language: config.language, betaArtworkPendingLabels,
      pageAssetSource,
      viewer: viewerMetrics, print: printMetrics,
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
    pageText: document.querySelector('.page-container')?.innerText
      ?? document.querySelector('.page-container')?.textContent ?? '',
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
