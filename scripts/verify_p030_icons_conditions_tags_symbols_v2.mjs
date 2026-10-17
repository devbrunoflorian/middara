#!/usr/bin/env node
/** Read-only Viewer and Admin Editor checks for the isolated p.30 proposal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 30;
const pageId = 'page_030';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2');
const snapshotPath = resolve(proofDir, 'snapshot-diagnostic-v2/snapshot.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.json');
const receiptPath = resolve(proofDir, 'viewer-editor-receipt-v2.json');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const candidates = proposal.candidates;
const blankKeys = snapshot.diagnosticOnly?.blankedSpanKeys ?? [];
const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadOrigin = new URL(payloadUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const snapshotPageDir = resolve(dirname(snapshotPath), 'pages', pageId);
const normalize = value => String(value)
  .replace(/\[symbol:[^\]]+\]/gu, ' ')
  .replace(/\[\[(?:symbol|source-symbol):[^\]]+\]\]/gu, ' ')
  .replace(/\[\[[a-z0-9-]+\]\]/giu, ' ')
  .replace(/[\uFFFC\uFFFD]/gu, ' ')
  .replace(/[\u2000-\u200B\u00A0]/gu, ' ')
  .replace(/\s+/gu, ' ').trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const dataText = data => (data?.segments ?? []).map(segment => segment.text ?? '').join('');
assert.equal(proposal.page, pageNumber);
assert.equal(candidates.length, 19);
assert.deepEqual(blankKeys, ['page_30_block_17__pt-BR']);
assert.equal(snapshot.translations.length, candidates.length);
assert.equal(snapshot.translations.find(item => item.spanKey === blankKeys[0]).data.segments.length, 0);
assert.notEqual(normalize(dataText(candidates.find(item => item.legacyBlockSpanKey === blankKeys[0]).data)), '', 'Full block_41 proposal was lost.');

async function listFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(resolve(directory, entry.name), rel));
    else result.push(rel);
  }
  return result.sort();
}
const canonicalDir = resolve(root, 'apps/web/public/pages', pageId);
const assetNames = await listFiles(canonicalDir);
const hashAssets = async () => Object.fromEntries(await Promise.all(assetNames.map(async name => [
  name, digest(await readFile(resolve(canonicalDir, name))),
])));
const assetsBefore = await hashAssets();
const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const framesUrl = new URL('/api/layout-frames', payloadUrl);
framesUrl.searchParams.set('limit', '5000');
const readBaseline = async () => {
  const [trResponse, frResponse] = await Promise.all([fetch(translationsUrl), fetch(framesUrl)]);
  assert.ok(trResponse.ok && frResponse.ok, `Payload GET failed (${trResponse.status}/${frResponse.status}).`);
  const [tr, fr] = await Promise.all([trResponse.json(), frResponse.json()]);
  return {
    translations: (tr.docs ?? []).filter(item => String(item.spanKey ?? '').startsWith('page_30_')),
    frames: (fr.docs ?? []).filter(item => Number(item.pageNumber) === pageNumber),
  };
};
const payloadBefore = await readBaseline();
assert.equal(payloadBefore.translations.length, 0);
assert.equal(payloadBefore.frames.length, 0);

const browser = await chromium.launch({ headless: true, executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const blockedMutations = [];
const requestLog = [];
const consoleErrors = [];
const pageErrors = [];
const viewerChecks = [];
const editorChecks = [];
let viewerScreenshot = null;
let editorScreenshot = null;

const configure = async (context, mode) => {
  await context.route('**/pages/page_*/*', async route => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/pages\/(page_\d{3})\/(.+)$/u);
    if (!match || match[1] !== pageId) return route.fulfill({ status: 404, body: 'Only the p.30 diagnostic assets are included.' });
    const filePath = resolve(snapshotPageDir, decodeURIComponent(match[2]));
    const relativePath = relative(snapshotPageDir, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) return route.abort('blockedbyclient');
    try { await access(filePath); await route.fulfill({ path: filePath }); }
    catch { await route.fulfill({ status: 404, body: 'Optional page asset not included.' }); }
  });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    requestLog.push({ method, path: url.pathname, mode });
    if (url.origin !== payloadOrigin || method !== 'GET') {
      if (method !== 'GET') blockedMutations.push({ method, path: url.pathname, mode });
      return route.abort('blockedbyclient');
    }
    const headers = { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
    const params = url.searchParams;
    let docs = [];
    if (url.pathname === '/api/translations') {
      const source = mode === 'editor'
        ? candidates.map(candidate => ({ spanKey: candidate.legacyBlockSpanKey, language: 'pt-BR', data: candidate.data }))
        : snapshot.translations ?? [];
      const language = params.get('where[language][equals]');
      const requestedKey = params.get('where[spanKey][equals]');
      docs = source.filter(item => (!language || item.language === language) && (!requestedKey || item.spanKey === requestedKey));
    } else if (url.pathname === '/api/layout-frames') {
      docs = snapshot.layoutFrames ?? [];
      const requestedPage = Number(params.get('where[and][0][pageNumber][equals]') ?? params.get('where[pageNumber][equals]'));
      const language = params.get('where[and][1][language][equals]') ?? params.get('where[language][equals]');
      docs = docs.filter(item => (!Number.isFinite(requestedPage) || Number(item.pageNumber) === requestedPage) && (!language || item.language === language));
    } else if (url.pathname === '/api/symbol-alias-settings') docs = snapshot.symbolAliasSettings ?? [];
    await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: Math.max(1, docs.length), totalPages: 1, hasNextPage: false, hasPrevPage: false }) });
  });
};

try {
  const viewerContext = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await configure(viewerContext, 'viewer');
  const viewer = await viewerContext.newPage();
  viewer.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  viewer.on('pageerror', error => pageErrors.push(String(error)));
  await viewer.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await viewer.waitForSelector('input.page-input');
  await viewer.locator('input.page-input').fill(String(pageNumber));
  await viewer.locator('input.page-input').press('Enter');
  await viewer.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_030/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await viewer.locator('select.language-select').selectOption('pt-BR');
  await viewer.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await viewer.waitForTimeout(300);
  const rendered = await viewer.locator('.page-container').evaluate(container => {
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
      if (!(node instanceof Element)) return '';
      if (node.getAttribute('aria-hidden') === 'true' || getComputedStyle(node).visibility === 'hidden') return '';
      const symbolId = node.getAttribute('data-symbol-id');
      if (symbolId) return `[symbol:${symbolId}]`;
      return [...node.childNodes].map(walk).join('');
    };
    return [...container.querySelectorAll('[data-rendered-translation-key]')].map(node => ({
      spanKey: node.getAttribute('data-rendered-translation-key'), text: walk(node),
    }));
  });
  for (const candidate of candidates) {
    const key = candidate.legacyBlockSpanKey;
    const matches = rendered.filter(item => item.spanKey === key);
    const expected = normalize(dataText(candidate.diagnosticData));
    const actual = normalize(matches[0]?.text ?? '');
    const textMatches = matches.length === 1 && expected === actual;
    const diagnosticBlankOnly = blankKeys.includes(key) && expected === '' && actual === '';
    assert.ok(textMatches, `Viewer target mismatch ${key}: expected ${expected}; actual ${actual}; targets=${matches.length}`);
    viewerChecks.push({ spanKey: key, expectedText: expected, actualText: actual, targetCount: matches.length, textMatches, wholeUnitBlankDiagnosticOnly: diagnosticBlankOnly });
  }
  viewerScreenshot = resolve(proofDir, 'viewer-readonly-pt-BR-diagnostic-v2.png');
  await viewer.getByTitle('Fit to Screen').click();
  await viewer.locator('.page-container').screenshot({ path: viewerScreenshot, animations: 'disabled' });
  await viewerContext.close();

  const editorContext = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await configure(editorContext, 'editor');
  const editor = await editorContext.newPage();
  editor.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  editor.on('pageerror', error => pageErrors.push(String(error)));
  await editor.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await editor.waitForSelector('input.page-input');
  await editor.locator('input.page-input').fill(String(pageNumber));
  await editor.locator('input.page-input').press('Enter');
  await editor.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_030/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await editor.locator('select.language-select').selectOption('pt-BR');
  await editor.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await editor.getByTitle('Enter Admin').click();
  await editor.waitForSelector('.app-container.admin-mode');
  for (const candidate of candidates) {
    const target = editor.locator(`[data-editable-unit-key="${candidate.editorUnitKey}"]`).first();
    assert.ok(await target.count(), `Missing Editor target ${candidate.editorUnitKey}`);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert.ok(box, `Missing target geometry ${candidate.editorUnitKey}`);
    await target.click({ force: true, position: { x: Math.max(1, Math.min(box.width / 2, box.width - 1)), y: Math.max(1, Math.min(box.height / 2, box.height - 1)) } });
    await editor.waitForFunction(key => {
      const node = [...document.querySelectorAll('[data-editable-unit-key]')].find(item => item.getAttribute('data-editable-unit-key') === key);
      return !!node && (node.matches('.credit-field-selected, .block-selected, .span-selected') || !!node.closest('.credit-field-selected, .block-selected, .span-selected'));
    }, candidate.editorUnitKey, { timeout: 5000 });
    await editor.getByRole('button', { name: '📝 Edit Text' }).click();
    const input = editor.locator('.rse-edit-text textarea').last();
    await input.waitFor({ state: 'visible' });
    const actual = normalize(await input.inputValue());
    const expected = normalize(dataText(candidate.data));
    const editable = await input.evaluate(node => !node.disabled && !node.readOnly);
    if (!editorScreenshot) {
      editorScreenshot = resolve(proofDir, 'editor-readonly-v2.png');
      await editor.screenshot({ path: editorScreenshot, fullPage: false });
    }
    await editor.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
    await editor.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    assert.ok(actual === expected && editable, `Editor proposal mismatch ${candidate.legacyBlockSpanKey}: ${actual}`);
    editorChecks.push({ spanKey: candidate.legacyBlockSpanKey, expectedText: expected, editorText: actual, proposalMatched: true, editable, cancelled: true, diagnosticBlankInViewer: blankKeys.includes(candidate.legacyBlockSpanKey) });
  }
  await editor.locator('.rse-close').click();
  await editor.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
  await editorContext.close();

  assert.deepEqual(blockedMutations, []);
  assert.deepEqual(pageErrors, []);
  assert.ok(editorChecks.length === 19 && viewerChecks.length === 19);
  const payloadAfter = await readBaseline();
  assert.deepEqual(payloadAfter, payloadBefore);
  const assetsAfter = await hashAssets();
  assert.deepEqual(assetsAfter, assetsBefore);
  const receipt = {
    status: 'p030_viewer_editor_readonly_verified_with_one_whole_unit_diagnostic_blank',
    page: pageNumber,
    locale: 'pt-BR',
    candidateCount: candidates.length,
    viewerCandidateTextCount: viewerChecks.filter(check => check.textMatches && !check.wholeUnitBlankDiagnosticOnly).length,
    viewerDiagnosticBlankCount: viewerChecks.filter(check => check.wholeUnitBlankDiagnosticOnly).length,
    viewerChecks,
    editorVerifiedCandidateCount: editorChecks.filter(check => check.proposalMatched && check.editable).length,
    editorChecks,
    technicalExceptions: proposal.technicalExceptions,
    payload: { beforeTranslationCount: payloadBefore.translations.length, afterTranslationCount: payloadAfter.translations.length, beforeFrameCount: payloadBefore.frames.length, afterFrameCount: payloadAfter.frames.length, unchanged: true, writes: 0 },
    observedApiMethods: [...new Set(requestLog.map(item => item.method))],
    blockedMutations,
    consoleErrors,
    pageErrors,
    canonicalAssetsUnchanged: true,
    saveClicked: false,
    screenshots: { viewer: relative(root, viewerScreenshot).replaceAll('\\', '/'), editor: relative(root, editorScreenshot).replaceAll('\\', '/') },
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ status: receipt.status, candidates: candidates.length, viewerTextCount: receipt.viewerCandidateTextCount, viewerDiagnosticBlankCount: receipt.viewerDiagnosticBlankCount, editorVerifiedCandidateCount: receipt.editorVerifiedCandidateCount, payload: receipt.payload, observedApiMethods: receipt.observedApiMethods, canonicalAssetsUnchanged: receipt.canonicalAssetsUnchanged, screenshots: receipt.screenshots }, null, 2));
} finally {
  await browser.close();
}
