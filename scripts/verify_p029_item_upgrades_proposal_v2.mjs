#!/usr/bin/env node
/** Read-only Viewer and Admin Editor checks for the isolated p.29 proposal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 29;
const pageId = 'page_029';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2');
const proposalPath = resolve(root, 'docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.json');
const snapshotPath = resolve(proofDir, 'snapshot-diagnostic-v2/snapshot.json');
const receiptPath = resolve(proofDir, 'viewer-editor-receipt-v2.json');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const candidates = proposal.candidates;
const blankKeys = snapshot.diagnosticOnly?.blankedSpanKeys ?? [];
const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadOrigin = new URL(payloadUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const snapshotDir = dirname(snapshotPath);
const pageAssetsSnapshotDir = resolve(snapshotDir, 'pages', pageId);
const normalize = value => String(value).replace(/\[\[(?:symbol|source-symbol):[^\]]+\]\]/gu, ' ')
  // The rich editor serializes preserved semantic symbols as aliases such as
  // [[lightning]] while the proposal stores them as U+FFFC plus symbolId.
  .replace(/\[\[[a-z0-9-]+\]\]/giu, ' ')
  .replace(/[\uFFFC\uFFFD]/gu, ' ').replace(/[\u2000-\u200B\u00A0]/gu, ' ')
  .replace(/\s+/gu, ' ').trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const candidateByKey = new Map(candidates.map(candidate => [candidate.legacyBlockSpanKey, candidate]));
assert.equal(proposal.page, pageNumber);
assert.equal(proposal.locale, 'pt-BR');
assert.equal(candidates.length, 21);
assert.equal(blankKeys.length, 1);
assert.equal(blankKeys[0], 'page_29_block_6__pt-BR');
assert.equal(snapshot.translations.length, candidates.length);
assert.equal(snapshot.diagnosticOnly.blankedSpanKeys[0], blankKeys[0]);

const snapshotText = candidate => normalize((candidate.diagnosticData?.segments ?? []).map(segment =>
  segment.symbolId ? `[symbol:${segment.symbolId}]` : segment.text ?? '').join(''));
const proposalText = candidate => normalize((candidate.data?.segments ?? []).map(segment =>
  segment.symbolId ? '' : segment.text ?? '').join(''));
for (const candidate of candidates) {
  const stored = snapshot.translations.find(record => record.spanKey === candidate.legacyBlockSpanKey && record.language === 'pt-BR');
  assert.ok(stored, `Missing diagnostic snapshot record ${candidate.legacyBlockSpanKey}`);
  const actual = normalize((stored.data?.segments ?? []).map(segment => segment.symbolId ? `[symbol:${segment.symbolId}]` : segment.text ?? '').join(''));
  assert.equal(actual, snapshotText(candidate), `Snapshot translation mismatch ${candidate.legacyBlockSpanKey}`);
  if (blankKeys.includes(candidate.legacyBlockSpanKey)) {
    assert.equal(actual, '', `Failed whole unit is not blank in the diagnostic snapshot: ${candidate.legacyBlockSpanKey}`);
    assert.notEqual(proposalText(candidate), '', `Full proposal text was lost for ${candidate.legacyBlockSpanKey}`);
  } else {
    assert.notEqual(actual, '', `Unexpected blank in the diagnostic snapshot: ${candidate.legacyBlockSpanKey}`);
  }
}

async function listFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(resolve(directory, entry.name), rel));
    else result.push(rel);
  }
  return result.sort();
}
const canonicalAssetDir = resolve(root, 'apps/web/public/pages', pageId);
const assetNames = await listFiles(canonicalAssetDir);
const hashCanonicalAssets = async () => Object.fromEntries(await Promise.all(assetNames.map(async name => [
  name, digest(await readFile(resolve(canonicalAssetDir, name))),
])));
const assetsBefore = await hashCanonicalAssets();

const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const framesUrl = new URL('/api/layout-frames', payloadUrl);
framesUrl.searchParams.set('limit', '5000');
const readPayloadBaseline = async () => {
  const [translationResponse, frameResponse] = await Promise.all([
    fetch(translationsUrl, { signal: AbortSignal.timeout(20000) }),
    fetch(framesUrl, { signal: AbortSignal.timeout(20000) }),
  ]);
  assert.ok(translationResponse.ok, `Payload translation GET failed: ${translationResponse.status}`);
  assert.ok(frameResponse.ok, `Payload frame GET failed: ${frameResponse.status}`);
  const [translationBody, frameBody] = await Promise.all([translationResponse.json(), frameResponse.json()]);
  return {
    translations: (translationBody.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_29_')),
    frames: (frameBody.docs ?? []).filter(record => Number(record.pageNumber) === pageNumber),
  };
};
const payloadBefore = await readPayloadBaseline();
assert.equal(payloadBefore.translations.length, 0, 'The p.29 Payload baseline changed before verification.');
assert.equal(payloadBefore.frames.length, 0, 'The p.29 layout-frame Payload baseline changed before verification.');

const browser = await chromium.launch({ headless: true, executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const blockedMutations = [];
const requestLog = [];
const consoleErrors = [];
const pageErrors = [];
let viewerChecks = [];
let editorChecks = [];
let viewerScreenshot = null;
let editorScreenshot = null;

const configurePage = async (context, mode) => {
  await context.route('**/pages/page_*/*', async route => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/pages\/(page_\d{3})\/(.+)$/u);
    if (!match || match[1] !== pageId) {
      await route.fulfill({ status: 404, body: 'Not included in p.29 diagnostic snapshot.' });
      return;
    }
    const filePath = resolve(pageAssetsSnapshotDir, decodeURIComponent(match[2]));
    const relativePath = relative(pageAssetsSnapshotDir, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
      await route.abort('blockedbyclient');
      return;
    }
    try { await access(filePath); await route.fulfill({ path: filePath }); }
    catch { await route.fulfill({ status: 404, body: 'Optional page asset not included.' }); }
  });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    requestLog.push({ method, origin: url.origin, path: url.pathname, mode });
    if (url.origin !== payloadOrigin || method !== 'GET') {
      if (method !== 'GET') blockedMutations.push({ method, origin: url.origin, path: url.pathname, mode });
      await route.abort('blockedbyclient');
      return;
    }
    const headers = { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
    const params = url.searchParams;
    let docs = [];
    if (url.pathname === '/api/translations') {
      const language = params.get('where[language][equals]');
      const records = mode === 'editor'
        ? candidates.map(candidate => ({ spanKey: candidate.legacyBlockSpanKey, language: 'pt-BR', data: candidate.data }))
        : snapshot.translations ?? [];
      const requestedKey = params.get('where[spanKey][equals]');
      docs = records.filter(record => (!language || record.language === language) && (!requestedKey || record.spanKey === requestedKey));
    } else if (url.pathname === '/api/layout-frames') {
      docs = snapshot.layoutFrames ?? [];
      const requestedPage = Number(params.get('where[and][0][pageNumber][equals]') ?? params.get('where[pageNumber][equals]'));
      const language = params.get('where[and][1][language][equals]') ?? params.get('where[language][equals]');
      docs = docs.filter(doc => (!Number.isFinite(requestedPage) || Number(doc.pageNumber) === requestedPage) && (!language || doc.language === language));
    } else if (url.pathname === '/api/symbol-alias-settings') {
      docs = snapshot.symbolAliasSettings ?? [];
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Not included in p.29 proof.' }] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: Math.max(1, docs.length), totalPages: 1, hasNextPage: false, hasPrevPage: false }) });
  });
};

try {
  // Viewer check uses the diagnostic-only blank for the star-affected card unit.
  const viewerContext = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await configurePage(viewerContext, 'viewer');
  const viewerPage = await viewerContext.newPage();
  viewerPage.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  viewerPage.on('pageerror', error => pageErrors.push(String(error)));
  await viewerPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await viewerPage.waitForSelector('input.page-input');
  await viewerPage.locator('input.page-input').fill(String(pageNumber));
  await viewerPage.locator('input.page-input').press('Enter');
  await viewerPage.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_029/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await viewerPage.locator('select.language-select').selectOption('pt-BR');
  await viewerPage.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await viewerPage.waitForTimeout(400);
  const expectedViewer = candidates.map(candidate => ({
    candidate,
    spanKey: candidate.legacyBlockSpanKey,
    expectedText: snapshotText(candidate),
  }));
  const renderedTargets = await viewerPage.locator('.page-container').evaluate(container => {
    const normalizeText = value => value.replace(/\s+/gu, ' ').trim();
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
      if (!(node instanceof Element)) return '';
      if (node.getAttribute('aria-hidden') === 'true' || getComputedStyle(node).visibility === 'hidden') return '';
      const symbolId = node.getAttribute('data-symbol-id');
      if (symbolId) return `[symbol:${symbolId}]`;
      return [...node.childNodes].map(walk).join('');
    };
    return [...container.querySelectorAll('[data-rendered-translation-key]')].map(element => ({
      spanKey: element.getAttribute('data-rendered-translation-key'), text: normalizeText(walk(element)),
    }));
  });
  const viewerChecksRaw = expectedViewer.map(unit => {
    const matches = renderedTargets.filter(target => target.spanKey === unit.spanKey);
    return { spanKey: unit.spanKey, expectedText: unit.expectedText, targetCount: matches.length, actualText: matches[0]?.text ?? '' };
  });
  viewerChecks = viewerChecksRaw.map(check => ({
    ...check,
    textMatches: check.targetCount === 1 && normalize(check.actualText) === normalize(check.expectedText),
    wholeUnitBlankDiagnosticOnly: blankKeys.includes(check.spanKey) && normalize(check.expectedText) === '',
  }));
  assert.ok(viewerChecks.every(check => check.targetCount === 1 && check.textMatches), 'Viewer target or diagnostic blank mismatch.');
  await viewerPage.locator('button[title="Fit to Screen"]').click();
  await viewerPage.waitForTimeout(250);
  viewerScreenshot = resolve(proofDir, 'viewer-readonly-pt-BR-diagnostic-v2.png');
  await viewerPage.locator('.page-container').screenshot({ path: viewerScreenshot, animations: 'disabled' });
  await viewerContext.close();

  // Editor check supplies complete candidate data to read-only dialogs, including
  // the preserved full p.29 proposal for the star exception. Every dialog is cancelled.
  const editorContext = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await configurePage(editorContext, 'editor');
  const editorPage = await editorContext.newPage();
  editorPage.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  editorPage.on('pageerror', error => pageErrors.push(String(error)));
  await editorPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await editorPage.waitForSelector('input.page-input');
  await editorPage.locator('input.page-input').fill(String(pageNumber));
  await editorPage.locator('input.page-input').press('Enter');
  await editorPage.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_029/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await editorPage.locator('select.language-select').selectOption('pt-BR');
  await editorPage.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await editorPage.locator('button[title="Enter Admin"]').click();
  await editorPage.waitForSelector('.app-container.admin-mode');
  for (const candidate of candidates) {
    const target = editorPage.locator(`[data-editable-unit-key="${candidate.editorUnitKey}"]`).first();
    assert.ok(await target.count(), `No Editor target for ${candidate.editorUnitKey}`);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert.ok(box, `No Editor target box for ${candidate.editorUnitKey}`);
    await target.click({ force: true, position: { x: Math.min(box.width / 2, Math.max(1, box.width - 1)), y: Math.min(box.height / 2, Math.max(1, box.height - 1)) } });
    await editorPage.waitForFunction(key => {
      const element = [...document.querySelectorAll('[data-editable-unit-key]')].find(node => node.getAttribute('data-editable-unit-key') === key);
      return !!element && (element.matches('.credit-field-selected, .block-selected, .span-selected') || !!element.closest('.credit-field-selected, .block-selected, .span-selected'));
    }, candidate.editorUnitKey, { timeout: 5000 });
    await editorPage.getByRole('button', { name: '📝 Edit Text' }).click();
    const input = editorPage.locator('.rse-edit-text textarea').last();
    await input.waitFor({ state: 'visible' });
    const editorText = normalize(await input.inputValue());
    const expected = proposalText(candidate);
    const editable = await input.evaluate(element => !element.disabled && !element.readOnly);
    if (!editorScreenshot) {
      editorScreenshot = resolve(proofDir, 'editor-readonly-v2.png');
      await editorPage.screenshot({ path: editorScreenshot, fullPage: false });
    }
    await editorPage.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
    await editorPage.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    editorChecks.push({ spanKey: candidate.legacyBlockSpanKey, editorUnitKey: candidate.editorUnitKey, expectedText: expected, editorText, proposalMatched: editorText === expected, editable, cancelled: true, diagnosticBlankInViewer: blankKeys.includes(candidate.legacyBlockSpanKey) });
  }
  await editorPage.locator('.rse-close').click();
  await editorPage.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
  await editorContext.close();

  assert.deepEqual(blockedMutations, [], `Unexpected Payload mutation attempts: ${JSON.stringify(blockedMutations)}`);
  assert.deepEqual(pageErrors, []);
  assert.ok(editorChecks.every(check => check.proposalMatched && check.editable && check.cancelled), `An Editor proposal did not match or a dialog was not cancelled: ${JSON.stringify(editorChecks.filter(check => !check.proposalMatched || !check.editable || !check.cancelled))}`);
  const payloadAfter = await readPayloadBaseline();
  assert.equal(payloadAfter.translations.length, payloadBefore.translations.length);
  assert.deepEqual(payloadAfter, payloadBefore);
  const assetsAfter = await hashCanonicalAssets();
  assert.deepEqual(assetsAfter, assetsBefore, 'Canonical p.29 assets changed during read-only verification.');
  const receipt = {
    status: 'p029_viewer_editor_readonly_verified_with_one_whole_unit_diagnostic_blank',
    page: pageNumber,
    locale: 'pt-BR',
    proposalSha256: digest(await readFile(proposalPath)),
    snapshotSha256: digest(await readFile(snapshotPath)),
    candidateCount: candidates.length,
    viewerCandidateTextCount: viewerChecks.filter(check => check.textMatches && !check.wholeUnitBlankDiagnosticOnly).length,
    viewerDiagnosticBlankCount: viewerChecks.filter(check => check.wholeUnitBlankDiagnosticOnly).length,
    viewerChecks,
    editorVerifiedCandidateCount: editorChecks.filter(check => check.proposalMatched && check.editable).length,
    editorChecks,
    technicalException: proposal.technicalExceptions,
    payload: { beforeTranslationCount: payloadBefore.translations.length, afterTranslationCount: payloadAfter.translations.length, beforeFrameCount: payloadBefore.frames.length, afterFrameCount: payloadAfter.frames.length, unchanged: true, writes: 0 },
    observedApiMethods: [...new Set(requestLog.map(request => request.method))],
    blockedMutations,
    consoleErrors,
    pageErrors,
    canonicalAssetsUnchanged: true,
    saveClicked: false,
    screenshots: {
      viewer: relative(root, viewerScreenshot).replaceAll('\\', '/'),
      editor: relative(root, editorScreenshot).replaceAll('\\', '/'),
    },
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); }
