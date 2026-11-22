#!/usr/bin/env node
/** Export all 102 PT-BR viewer pages, preserving each source page box. */

import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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
  betaCatalog: args['beta-catalog'] ? resolve(args['beta-catalog']) : null,
  betaHolds: args['beta-hold-keys'] ? resolve(args['beta-hold-keys']) : null,
  betaReader: args['beta-reader'] === 'true',
};
const betaMode = !!config.betaCatalog;
if (config.betaReader && !betaMode) throw new Error('--beta-reader requires --beta-catalog.');
const viewerUrl = new URL(config.baseUrl);
const requestedStrictDiagnostic = viewerUrl.searchParams.get('diagnosticBlankUntranslated') === '1';
const strictDiagnosticMode = requestedStrictDiagnostic || (betaMode && !config.betaReader);
if (betaMode && !config.betaReader) viewerUrl.searchParams.set('diagnosticBlankUntranslated', '1');
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

async function fetchPayloadCollection(slug) {
  const url = new URL(`/api/${slug}`, config.apiUrl);
  url.searchParams.set('limit', '5000');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Payload returned ${response.status} for ${slug}.`);
  const body = await response.json();
  if (body.totalDocs > (body.docs ?? []).length) throw new Error(`Payload ${slug} fetch was incomplete.`);
  return body.docs ?? [];
}

const [payloadTranslations, payloadFrames] = await Promise.all([
  fetchPayloadCollection('translations'),
  betaMode ? fetchPayloadCollection('layout-frames') : Promise.resolve([]),
]);
const payloadDigest = createHash('sha256').update(JSON.stringify(payloadTranslations)).digest('hex');
const persistedPtRecords = payloadTranslations.filter(record => record.language === 'pt-BR');
  let ptRecords = [...persistedPtRecords];
let layoutFrameRecords = payloadFrames;
let betaManifest = null;
let betaProposalFrames = [];
if (betaMode) {
  const catalogBytes = await readFile(config.betaCatalog);
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  if (!Array.isArray(catalog.proposals) || !Array.isArray(catalog.exceptions)) {
    throw new Error(`Beta catalog is missing proposals/exceptions: ${config.betaCatalog}`);
  }
  const reviewerHolds = config.betaHolds
    ? JSON.parse(await readFile(config.betaHolds, 'utf8'))
    : { holds: [] };
  const holdByKey = new Map((reviewerHolds.holds ?? []).map(item => [
    String(item.spanKey ?? '').replace(/__pt-BR$/u, ''), item,
  ]));
  const keyWithoutLocale = key => String(key ?? '').replace(/__(?:pt-BR|en)$/u, '');
  const translationKeys = new Set(persistedPtRecords.flatMap(record => [
    String(record.spanKey ?? ''), keyWithoutLocale(record.spanKey),
  ]));
  const frameKeys = new Set(payloadFrames.filter(record => record.language === 'pt-BR')
    .map(record => keyWithoutLocale(record.unitKey)));
  const exceptionByKey = new Map();
  for (const exception of catalog.exceptions) {
    if (exception.status === 'resolved') continue;
    const key = keyWithoutLocale(exception.spanKey);
    if (!key) continue;
    const prior = exceptionByKey.get(key) ?? [];
    prior.push(exception);
    exceptionByKey.set(key, prior);
  }
  const skipped = [];
  const included = [];
  const proposalFrameRecords = [];
  const candidates = catalog.proposals.flatMap(proposal => proposal.candidates ?? []);
  const candidateKeysSeen = new Set();
  const rendererKeysSeen = new Set();
  const visibleCandidateText = candidate => (candidate.data?.segments ?? [])
    .filter(segment => !segment.symbolId)
    .map(segment => String(segment.text ?? '').replace(/\uFFFC/gu, ''))
    // Segment boundaries can mark style changes inside a word or before punctuation.
    // Rich-text data already carries visible whitespace; inserting one here corrupts
    // the comparison and falsely excludes otherwise complete proposals from beta.
    .join('');
  const normalizeCandidateText = value => normalizeText(String(value ?? '')
    .replace(/\uFFFC/gu, '').replace(/\[\[[^\]]+\]\]/gu, ''));
  const candidateTextForComparison = candidate => {
    let text = String(candidate.proposalText ?? '');
    const symbolLabels = new Map([['dice.green', ['Dado verde']]]);
    for (const segment of candidate.data?.segments ?? []) {
      if (!segment.symbolId) continue;
      for (const label of symbolLabels.get(segment.symbolId) ?? []) {
        text = text.replace(new RegExp(`\\[${label}\\]`, 'giu'), '');
      }
    }
    return text;
  };
  const rendererKeyForCandidate = (candidate, pageData) => {
    const canonicalKey = String(candidate.copyfitCanonicalSpanKey ?? '');
    const canonicalBlockMatch = canonicalKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u);
    if (canonicalBlockMatch) {
      const index = Number(canonicalBlockMatch[1]);
      const sourceBlock = pageData.blocks[index];
      return sourceBlock?.editorKey
        ? `${sourceBlock.editorKey}__pt-BR`
        : `page_${candidate.pageNumber}_block_${index}`;
    }
    if (canonicalKey) return canonicalKey;
    const spanKey = String(candidate.spanKey ?? '');
    if (/^page_\d+_unit_/u.test(spanKey)) {
      return spanKey.endsWith('__pt-BR') ? spanKey : `${spanKey}__pt-BR`;
    }
    const index = candidate.blockIndex
      ?? Number(spanKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u)?.[1]);
    if (Number.isInteger(index) && index >= 0) {
      const sourceBlock = pageData.blocks[index];
      return sourceBlock?.editorKey
        ? `${sourceBlock.editorKey}__pt-BR`
        : `page_${candidate.pageNumber}_block_${index}`;
    }
    return spanKey;
  };
  const humanKeyExists = (candidate, rendererKey) => {
    const keys = [
      candidate.spanKey,
      keyWithoutLocale(candidate.spanKey),
      candidate.copyfitCanonicalSpanKey,
      keyWithoutLocale(candidate.copyfitCanonicalSpanKey),
      rendererKey,
      keyWithoutLocale(rendererKey),
    ].filter(Boolean).map(String);
    return keys.some(key => translationKeys.has(key));
  };
  for (const candidate of candidates) {
    const key = String(candidate.spanKey ?? '');
    const baseKey = keyWithoutLocale(key);
    const skip = reason => skipped.push({ spanKey: key, proposalId: candidate.proposalId, reason });
    if (!key || !baseKey) { skip('missing spanKey'); continue; }
    if (candidateKeysSeen.has(baseKey)) { skip('duplicate proposal unit key'); continue; }
    candidateKeysSeen.add(baseKey);
    const hold = holdByKey.get(baseKey);
    if (hold) { skip(`critical reviewer hold: ${hold.reason ?? 'review required'}`); continue; }
    const pageNo = Number(candidate.pageNumber);
    const pageData = pages[pageNo - 1];
    if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > 102 || !pageData) {
      skip('page is outside the 102-page source'); continue;
    }
    if (Number.isInteger(candidate.blockIndex) && candidate.blockIndex >= 0) {
      const sourceBlock = pageData.blocks[candidate.blockIndex];
      if (!sourceBlock || (candidate.sourceBlockId && sourceBlock.id !== candidate.sourceBlockId)) {
        skip('candidate no longer maps to its source block'); continue;
      }
    }
    const rendererKey = rendererKeyForCandidate(candidate, pageData);
    const rendererBaseKey = keyWithoutLocale(rendererKey);
    if (humanKeyExists(candidate, rendererKey)) { skip('persisted PT-BR translation has priority'); continue; }
    if (rendererKeysSeen.has(rendererBaseKey)) { skip('multiple proposals map to the same PageRenderer unit'); continue; }
    const exception = exceptionByKey.get(baseKey) ?? [];
    if (candidate.diagnosticBlank === true
      || exception.some(item => item.diagnosticBlank === true)) {
      skip('explicit diagnostic blank / preserved source content'); continue;
    }
    if (String(candidate.copyfitClassification ?? '').toUpperCase() === 'OVER') {
      skip('Copyfit V3 OVER'); continue;
    }
    if (/\b(?:blocked|failed|stale|DTP exception|unrenderable)\b/iu.test(String(candidate.technicalStatus ?? ''))
      || /(?:preserved whole-unit blank|collision|unmapped symbol|missing (?:symbol|occurrence)|not visible|hidden proposal|cannot replace visible|unreadable)/iu.test(String(candidate.editorialStatus ?? ''))
      || exception.some(item => item.status !== 'resolved' && /(?:artwork overlay|collision|symbol|unrenderable|missing occurrence)/iu.test(`${item.category ?? ''} ${item.reason ?? ''}`))) {
      skip('known technical, structural, or source-artwork blocker'); continue;
    }
    const data = candidate.data;
    if (data?.schemaVersion !== 2 || !Array.isArray(data.segments) || !data.segments.length
      || !Array.isArray(data.bbox) || data.bbox.length !== 4 || data.bbox.some(value => !Number.isFinite(value))) {
      skip('proposal lacks complete rich-text/bbox data'); continue;
    }
    const visibleText = visibleCandidateText(candidate);
    const proposalText = String(candidate.proposalText ?? '');
    if (!normalizeCandidateText(visibleText) || !normalizeCandidateText(proposalText)
      || normalizeCandidateText(visibleText) !== normalizeCandidateText(candidateTextForComparison(candidate))) {
      skip('proposal label differs from rich-text data'); continue;
    }
    const requiredSymbols = new Set((candidate.sourceSegments ?? [])
      .map(segment => segment.symbolId).filter(Boolean));
    const proposedSymbols = new Set(data.segments.map(segment => segment.symbolId).filter(Boolean));
    const missingSymbols = [...requiredSymbols].filter(symbolId => !proposedSymbols.has(symbolId));
    if (missingSymbols.length) {
      skip(`essential source symbols missing: ${missingSymbols.join(', ')}`); continue;
    }

    const record = {
      id: `beta-proposal-${included.length + 1}`,
      spanKey: rendererKey,
      language: 'pt-BR',
      data,
      betaProposal: {
        proposalId: candidate.proposalId,
        proposalVersion: candidate.proposalVersion,
        copyfitClassification: candidate.copyfitClassification ?? 'UNMEASURED',
        copyfitSourcePdfLineCount: candidate.copyfitSourcePdfLineCount ?? null,
        copyfitPageRendererLineCount: candidate.copyfitPageRendererLineCount ?? null,
        pendingTerms: candidate.pendingTerms ?? [],
      },
    };
    included.push({
      spanKey: key,
      rendererKey,
      pageNumber: pageNo,
      proposalId: candidate.proposalId,
      proposalVersion: candidate.proposalVersion,
      proposalTitle: candidate.proposalTitle,
      proposalText,
      copyfitClassification: candidate.copyfitClassification ?? 'UNMEASURED',
      sourcePdfLines: candidate.copyfitSourcePdfLineCount ?? null,
      pageRendererLines: candidate.copyfitPageRendererLineCount ?? null,
      pendingTerms: candidate.pendingTerms ?? [],
      technicalStatus: candidate.technicalStatus ?? 'not_recorded',
      editorialStatus: candidate.editorialStatus ?? '',
    });
    ptRecords.push(record);
    rendererKeysSeen.add(rendererBaseKey);
    if (candidate.reviewLayoutFrame && !frameKeys.has(rendererBaseKey)) {
      const rawFrame = candidate.reviewLayoutFrame;
      const total = Number.isFinite(rawFrame.total) ? rawFrame.total : rawFrame.width;
      const totalHeight = Number.isFinite(rawFrame.totalHeight) ? rawFrame.totalHeight : rawFrame.height;
      const frame = {
        ...rawFrame,
        total,
        width: rawFrame.x + total,
        totalHeight,
        height: rawFrame.y + totalHeight,
      };
      if ([frame.x, frame.y, frame.width, frame.height, frame.total, frame.totalHeight].every(Number.isFinite)
        && frame.total > 0 && frame.totalHeight > 0) {
        const frameRecord = {
          id: `beta-proposal-frame-${proposalFrameRecords.length + 1}`,
          unitKey: rendererBaseKey,
          pageNumber: pageNo,
          language: 'pt-BR',
          data: frame,
          frameKey: `${rendererBaseKey}::pt-BR`,
          betaProposal: true,
        };
        proposalFrameRecords.push(frameRecord);
        betaProposalFrames.push({ unitKey: rendererBaseKey, pageNumber: pageNo, frame });
      }
    }
  }
  layoutFrameRecords = [...payloadFrames, ...proposalFrameRecords];
  betaManifest = {
    mode: 'unapproved proposal preview over persisted human translations',
    createdAt: new Date().toISOString(),
    catalogGeneratedAt: catalog.generatedAt ?? null,
    catalogPath: config.betaCatalog,
    catalogSha256: createHash('sha256').update(catalogBytes).digest('hex'),
    payloadTranslationSha256: payloadDigest,
    persistedPtBrTranslationCount: persistedPtRecords.length,
    persistedPtBrTranslationKeys: persistedPtRecords.map(record => record.spanKey),
    provisionalProposalCount: included.length,
    provisionalProposalFrames: betaProposalFrames.length,
    classificationCounts: included.reduce((counts, item) => {
      const classification = item.copyfitClassification ?? 'UNMEASURED';
      counts[classification] = (counts[classification] ?? 0) + 1;
      return counts;
    }, {}),
    pendingTermProposalCount: included.filter(item => item.pendingTerms.length).length,
    included,
    skipped,
  };
  const snapshot = {
    schemaVersion: 1,
    label: 'BETA — proposals remain unapproved and are overlaid only in this immutable export snapshot',
    translations: ptRecords,
    layoutFrames: layoutFrameRecords,
  };
  const snapshotText = JSON.stringify(snapshot, null, 2) + '\n';
  betaManifest.translationSnapshotSha256 = createHash('sha256').update(snapshotText).digest('hex');
  await writeFile(resolve(config.workDir, 'beta-translation-snapshot.json'), snapshotText, 'utf8');
  await writeFile(resolve(config.workDir, 'beta-manifest.json'), JSON.stringify(betaManifest, null, 2) + '\n', 'utf8');
}

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
  persistedPtBrRecords: persistedPtRecords.length,
  betaProvisionalRecords: betaManifest?.provisionalProposalCount ?? 0,
  pages: pages.length,
}, null, 2));

const launchOptions = { headless: true };
if (process.platform === 'win32') launchOptions.executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(launchOptions);
const report = {
  viewerUrl: viewerUrl.toString(),
  apiOrigin: originOf(config.apiUrl),
  locale: 'pt-BR',
  translationRendering: betaMode
    ? config.betaReader
      ? strictDiagnosticMode
        ? 'BETA reader preview with the explicitly requested strict diagnostic blanking'
        : 'BETA reader preview: proposals over persisted human PT-BR; original EN source remains visible where no translation exists'
      : 'BETA proposal preview over persisted human PT-BR translations; unresolved units blanked'
    : strictDiagnosticMode
      ? 'localhost PT-BR Viewer strict diagnostic route: persisted translations plus current active pending Payload review drafts'
      : 'localhost PT-BR Viewer normal route: persisted translations plus current active pending Payload review drafts',
  strictDiagnosticMode,
  pageCount: 102,
  persistedPtBrRecords: persistedPtRecords.length,
  betaProvisionalRecords: betaManifest?.provisionalProposalCount ?? 0,
  betaManifest: betaManifest ? `${config.workDir}/beta-manifest.json` : null,
  pages: [],
  networkFailures: [],
  blockedApiMutationAttempts: [],
};
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  if (betaMode) {
    const pageOrigin = originOf(config.baseUrl);
    const apiOrigin = originOf(config.apiUrl);
    await context.route('**/api/**', async route => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (requestUrl.origin !== apiOrigin || request.method() !== 'GET') {
        if (request.method() !== 'GET') report.blockedApiMutationAttempts.push({
          method: request.method(), url: request.url(),
        });
        await route.abort('blockedbyclient');
        return;
      }
      if (requestUrl.pathname === '/api/translations') {
        const language = requestUrl.searchParams.get('where[language][equals]');
        let docs = ptRecords;
        if (language) docs = docs.filter(record => record.language === language);
        const spanKey = requestUrl.searchParams.get('where[spanKey][equals]')
          ?? requestUrl.searchParams.get('where[and][0][spanKey][equals]');
        if (spanKey) docs = docs.filter(record => record.spanKey === spanKey);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' },
          body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }),
        });
        return;
      }
      if (requestUrl.pathname === '/api/layout-frames') {
        let docs = layoutFrameRecords;
        const pageNumber = Number(requestUrl.searchParams.get('where[and][0][pageNumber][equals]')
          ?? requestUrl.searchParams.get('where[pageNumber][equals]'));
        const language = requestUrl.searchParams.get('where[and][1][language][equals]')
          ?? requestUrl.searchParams.get('where[language][equals]');
        const frameKey = requestUrl.searchParams.get('where[frameKey][equals]');
        if (Number.isFinite(pageNumber) && pageNumber > 0) docs = docs.filter(record => Number(record.pageNumber) === pageNumber);
        if (language) docs = docs.filter(record => record.language === language);
        if (frameKey) docs = docs.filter(record => record.frameKey === frameKey);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' },
          body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }),
        });
        return;
      }
      await route.continue();
    });
  }
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

  const appResponse = await page.goto(viewerUrl.toString(), { waitUntil: 'domcontentloaded' });
  if (!appResponse?.ok()) throw new Error(`Viewer returned ${appResponse?.status() ?? 'no response'} at ${config.baseUrl}.`);
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  await page.waitForFunction(expected => {
    const actual = document.querySelector('.app-container')?.getAttribute('data-ptbr-diagnostic-mode') ?? null;
    return actual === (expected ? 'blank-untranslated' : null);
  }, strictDiagnosticMode);
  const ptBrLanguageButton = page.locator('button[aria-label="Português (Brasil)"]');
  await ptBrLanguageButton.waitFor({ state: 'visible' });
  await ptBrLanguageButton.click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Português (Brasil)"]')?.getAttribute('aria-pressed') === 'true');
  await page.waitForFunction(() => document.querySelector('.app-container') !== null);
  await page.locator('button[title="Fit to Screen"], button[title*="Ajustar"], button:has(svg.lucide-maximize)').first().click();
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
    await page.waitForFunction(() => document.querySelector('.page-container')
      ?.getAttribute('data-translation-overrides-language') === 'pt-BR', undefined, { timeout: 60000 });
    if (strictDiagnosticMode) {
      await page.waitForFunction(() => {
        const page = document.querySelector('.page-container');
        return page?.getAttribute('data-diagnostic-blank-keys') !== null;
      }, undefined, { timeout: 30000 });
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);

    const isPtBr = await ptBrLanguageButton.getAttribute('aria-pressed');
    if (isPtBr !== 'true') throw new Error(`p.${pageNo}: viewer is not in PT-BR.`);
    if (await page.locator('.app-container').evaluate(element => element.classList.contains('admin-mode'))) {
      throw new Error(`p.${pageNo}: viewer unexpectedly remained in Admin mode.`);
    }
    const containers = await page.locator('.page-container').count();
    if (containers !== 1) throw new Error(`p.${pageNo}: expected one live page container, found ${containers}.`);

    const expectedRecords = pageRecords.get(pageNo) ?? [];
    const diagnosticBlankKeys = !strictDiagnosticMode ? []
      : JSON.parse(await page.locator('.page-container').getAttribute('data-diagnostic-blank-keys') ?? '[]');
    const declaredDiagnosticBlankCount = !strictDiagnosticMode ? 0
      : Number(await page.locator('.page-container').getAttribute('data-diagnostic-blank-count'));
    if (!Array.isArray(diagnosticBlankKeys) || diagnosticBlankKeys.length !== declaredDiagnosticBlankCount) {
      throw new Error(`p.${pageNo}: strict diagnostic blank-key manifest is inconsistent.`);
    }
    if (strictDiagnosticMode && pageNo === 22 && expectedRecords.length === 0 && diagnosticBlankKeys.length === 0) {
      throw new Error('p.22 has no saved PT-BR records but strict diagnostic mode did not blank any editorial unit.');
    }
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

    await page.locator('button.admin-toggle').click();
    await page.waitForFunction(() => document.querySelector('.app-container')?.classList.contains('admin-mode'));
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
        renderedDiagnosticBlankNodes: root?.querySelectorAll('[data-translation-review-diagnostic-blank]').length ?? 0,
      };
    });
    await page.locator('button.admin-toggle').click();
    await page.waitForFunction(() => !document.querySelector('.app-container')?.classList.contains('admin-mode'));
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
      #global-navigation, .pdf-sidebar, .toast-notification, .translation-editor, .rich-block-editor, .block-editor { display: none !important; }
      .dev-environment-status { display: none !important; }
      .scroll-page-wrapper { box-shadow: none !important; border-radius: 0 !important; }
      .page-container {
        width: ${pageData.width}pt !important; height: ${pageData.height}pt !important;
        max-width: none !important; max-height: none !important; margin: 0 !important;
        box-shadow: none !important; transition: none !important; overflow: hidden !important;
      }
      ${betaMode && !config.betaReader ? `
      /* The beta is intentionally incomplete: mark every missing unit in this
         export-only render, without changing Payload, page data, or the app. */
      .translation-review-diagnostic-blank::after {
        content: "PT-BR PENDENTE";
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1000000;
        display: block;
        padding: 1px 2px;
        border: 0.5px solid #b78a2e;
        border-radius: 2px;
        background: rgba(255, 245, 211, 0.96);
        color: #5b430b;
        font: 600 5px/1.05 Arial, sans-serif;
        letter-spacing: 0.1px;
        white-space: nowrap;
        pointer-events: none;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page-container::after {
        content: "BETA PT-BR — unidades pendentes: " attr(data-diagnostic-blank-count);
        position: absolute;
        top: 2pt;
        left: 2pt;
        z-index: 1000001;
        display: block;
        padding: 2px 4px;
        border: 0.5px solid #b78a2e;
        border-radius: 2px;
        background: rgba(255, 245, 211, 0.96);
        color: #5b430b;
        font: 600 6px/1.05 Arial, sans-serif;
        letter-spacing: 0.1px;
        white-space: nowrap;
        pointer-events: none;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      ` : ''}
      .page-container img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    ` });
    const betaArtworkPendingLabels = betaMode && !config.betaReader && pageNo === 100
      ? await page.evaluate(() => {
        const root = document.querySelector('.page-container');
        if (!root) return 0;
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
          root.appendChild(badge);
        }
        return labels.length;
      })
      : 0;
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
      persistedTranslationRecords: expectedRecords.filter(record => !record.betaProposal).length,
      provisionalProposalRecords: expectedRecords.filter(record => !!record.betaProposal).length,
      diagnosticBlankCount: diagnosticBlankKeys.length,
      diagnosticBlankKeys,
      renderedDiagnosticBlankNodes: diagnostics.renderedDiagnosticBlankNodes,
      betaArtworkPendingLabels,
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
  if (report.blockedApiMutationAttempts.length) {
    throw new Error(`Viewer attempted ${report.blockedApiMutationAttempts.length} API mutation(s) during read-only beta export.`);
  }
  const failed = report.networkFailures.filter(message => !message.includes('net::ERR_ABORTED'));
  if (failed.length) throw new Error(`Viewer network failures: ${failed.slice(0, 10).join('; ')}`);
  report.pagesWithNoSavedTranslations = report.pages.filter(item => item.persistedTranslationRecords === 0).length;
  report.pagesWithNoPtBrRecords = report.pages.filter(item => item.translationRecords === 0).length;
  report.pagesWithOnlyProvisionalProposals = report.pages.filter(item => item.persistedTranslationRecords === 0
    && item.provisionalProposalRecords > 0).length;
  report.pagesWithDiagnosticBlanks = report.pages.filter(item => item.diagnosticBlankCount > 0).length;
  report.totalDiagnosticBlankUnits = report.pages.reduce((sum, item) => sum + item.diagnosticBlankCount, 0);
  if (betaManifest) {
    report.beta = {
      label: config.betaReader
        ? 'BETA READER — unapproved proposals with original English source preserved where PT-BR is not yet available'
        : 'BETA — unapproved proposals rendered provisionally for human editing; missing units are blank',
      certified: false,
      payloadWasWritten: false,
      originalEnglishSourcePreservedForUntranslatedUnits: !strictDiagnosticMode,
      unresolvedUnitsBlanked: strictDiagnosticMode,
      persistedPtBrRecords: persistedPtRecords.length,
      provisionalProposalRecords: betaManifest.provisionalProposalCount,
      provisionalProposalFrames: betaManifest.provisionalProposalFrames,
      classificationCounts: betaManifest.classificationCounts,
      pendingTermProposalCount: betaManifest.pendingTermProposalCount,
      skippedCandidateCount: betaManifest.skipped.length,
    proposalSnapshotFile: resolve(config.workDir, 'beta-translation-snapshot.json'),
      proposalSnapshotSha256: betaManifest.translationSnapshotSha256,
      manifestFile: resolve(config.workDir, 'beta-manifest.json'),
    };
  }
  await context.close();
} finally {
  await browser.close();
}

await mkdir(dirname(config.output), { recursive: true });
const mergeCode = String.raw`
import json, re, sys
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
toc_page=full[2]
heading_rows=[]
number_rows=[]
for block in toc_page.get_text('dict').get('blocks',[]):
    if block.get('type')!=0: continue
    for line in block.get('lines',[]):
        text=''.join(span.get('text','') for span in line.get('spans',[])).strip()
        if not text: continue
        x,y=line['bbox'][0],line['bbox'][1]
        if y<100 or y>780: continue
        if x<240: heading_rows.append({'x':x,'y':y,'text':text})
        elif x>600 and re.fullmatch(r'\d{1,3}',text): number_rows.append({'y':y,'page':int(text)})
toc=[]
for heading in heading_rows:
    nearest=min(number_rows,key=lambda row:abs(row['y']-heading['y']),default=None)
    if not nearest or abs(nearest['y']-heading['y'])>3.5: continue
    target=nearest['page']
    if not 1<=target<=102: continue
    toc.append([1 if heading['x']<160 else 2,heading['text'],target])
if len(toc)<30: raise SystemExit(f'Expected at least 30 TOC bookmarks from page 3, found {len(toc)}')
full.set_toc(toc)
report=json.loads(report_path.read_text(encoding='utf-8'))
if report.get('beta'):
    full.set_metadata({'title': 'Middara Rulebook PT-BR — BETA' + (' Reader (EN source preserved)' if report.get('beta', {}).get('originalEnglishSourcePreservedForUntranslatedUnits') else ' Diagnostic'),
      'subject': 'Incomplete provisional preview. Proposals are not editorial approvals; untranslated English source is explicitly preserved only in reader mode.',
      'keywords': 'Middara, PT-BR, BETA, provisional translation, incomplete'})
else:
    full.set_metadata({'title': 'Middara Rulebook — PT-BR (fan translation)',
      'subject': 'Community fan translation of the Middara rulebook.',
      'keywords': 'Middara, rulebook, PT-BR, community translation'})
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
report['finalPdf']=str(output_path.resolve())
report['finalPageCount']=102
report['pageBoxesVerified']=True
report['pageBoxes']=page_reports
report['bookmarksCount']=len(toc)
report['bookmarksSourcePage']=3
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(output_path.resolve()),'pageCount':102,'pageBoxesVerified':True,'bookmarks':len(toc)},ensure_ascii=False))
`;
const reportPath = resolve(config.workDir, 'viewer-export-report.json');
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
const merge = spawnSync('python', ['-c', mergeCode, config.sourcePdf, pageDir, config.output, reportPath], { encoding: 'utf8' });
if (merge.status !== 0) throw new Error(`Full-book merge/page-box verification failed: ${merge.stderr || merge.stdout}`);
console.log('[full-ptbr-export] completed', merge.stdout.trim());
