#!/usr/bin/env node
/** Validate the isolated p.20 proposal in the live Viewer and a session-only Admin Editor recompose. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p020-loot-deck-title-v1');
const proposalPath = resolve(root, 'docs/translations/proposals/page-020-loot-deck-title-2026-10-16-v1.json');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot.json');
const receiptPath = resolve(proofDir, 'editor-readonly-receipt-v1.json');
const screenshotPath = resolve(proofDir, 'editor-readonly-v1.png');
const pageAssetDir = resolve(root, 'apps/web/public/pages/page_020');
const assetNames = await readdir(pageAssetDir);
const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadOrigin = new URL(payloadUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\[\[[^\]]+\]\]/gu, ' ').replace(/[\uFFFC\uFFFD]/gu, ' ').replace(/\s+/gu, ' ').trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const candidate = proposal.candidates[0];
assert.equal(proposal.candidates.length, 1);

const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadPageRecords = async () => {
  const response = await fetch(translationsUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_20_'));
};
const payloadBefore = await readPayloadPageRecords();
assert.equal(payloadBefore.length, 0, 'A saved page-20 translation appeared after proposal preflight.');
const beforeAssets = {};
for (const name of assetNames) beforeAssets[name] = digest(await readFile(resolve(pageAssetDir, name)));

const requests = [];
const blockedMutations = [];
const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/pages/page_020/page_020_dom.json', async route => {
    await route.fulfill({ path: resolve(proofDir, 'snapshot/pages/page_020/page_020_dom.json') });
  });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    requests.push({ method, origin: url.origin, path: url.pathname });
    if (url.origin !== payloadOrigin || method !== 'GET') {
      blockedMutations.push({ method, origin: url.origin, path: url.pathname });
      await route.abort('blockedbyclient');
      return;
    }
    const headers = { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' };
    if (url.pathname === '/api/translations') {
      const language = url.searchParams.get('where[language][equals]');
      const spanKey = url.searchParams.get('where[spanKey][equals]');
      const docs = snapshot.translations.filter(record => (!language || record.language === language) && (!spanKey || record.spanKey === spanKey));
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: 5000, hasNextPage: false }) });
      return;
    }
    if (url.pathname === '/api/layout-frames') {
      const docs = snapshot.layoutFrames ?? [];
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: docs.length }) });
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  await page.locator('input.page-input').fill('20');
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '20' && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_020/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  const viewerText = normalize(await page.locator('.page-container').innerText());
  assert.ok(viewerText.includes(normalize(candidate.proposalText)), 'The PT-BR Viewer did not render the proposed title.');
  const viewerCount = await page.locator('.page-container').getByText(candidate.proposalText, { exact: true }).count();
  assert.ok(viewerCount > 0, 'The PT-BR title text node is missing from the live Viewer DOM.');
  await page.screenshot({ path: resolve(proofDir, 'viewer-pt-BR-live-v1.png'), fullPage: false });
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const uiKey = candidate.spanKey.replace(/__pt-BR$/u, '');
  const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
  assert.equal(await target.count(), 1, `${uiKey} must map to one Editor selection target.`);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  assert.ok(box, 'No Editor target box.');
  let selected = false;
  for (const position of [{ x: box.width / 2, y: box.height / 2 }, { x: box.width - 3, y: box.height / 2 }, { x: 3, y: box.height / 2 }]) {
    await target.click({ force: true, position });
    await page.waitForTimeout(60);
    selected = await target.evaluate(element => element.matches('.credit-field-selected, .block-selected, .span-selected'));
    if (selected) break;
  }
  assert.ok(selected, `${uiKey} did not select in the Admin Editor.`);
  await page.getByRole('button', { name: '📝 Edit Text' }).click();
  const editor = page.locator('.rse-edit-text textarea').last();
  await editor.waitFor({ state: 'visible' });
  assert.equal(normalize(await editor.inputValue()), normalize(candidate.proposalText), 'Editor text did not match the proposal.');
  assert.ok(await editor.evaluate(element => !element.disabled && !element.readOnly), 'The candidate is not editable.');
  const insertedText = `${candidate.proposalText} PT`;
  await editor.fill(insertedText);
  await page.getByRole('button', { name: /^\s*Confirmar\s*$/ }).last().click();
  await page.waitForFunction(expected => (document.querySelector('.page-container')?.innerText ?? '').replace(/\s+/gu, ' ').trim().includes(expected), normalize(insertedText));
  const reflowMeasure = await target.evaluate(element => {
    const textWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textRanges = [];
    while (textWalker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(textWalker.currentNode);
      textRanges.push(range);
    }
    const frame = element.getBoundingClientRect();
    // Measure leaf text ranges so the containing realbox is never counted as a text line.
    const rects = textRanges.flatMap(range => [...range.getClientRects()]).filter(rect => rect.width > 0 && rect.height > 0);
    const lines = [...new Set(rects.map(rect => Math.round(rect.top * 10) / 10))];
    const style = getComputedStyle(element);
    const lineWidths = lines.map(top => {
      const onLine = rects.filter(rect => Math.round(rect.top * 10) / 10 === top);
      return { top, width: Math.max(...onLine.map(rect => rect.right)) - Math.min(...onLine.map(rect => rect.left)) };
    });
    return {
      lineCount: lines.length,
      rectCount: rects.length,
      lineTops: lines,
      lineWidths,
      frameBox: { left: frame.left, top: frame.top, width: frame.width, height: frame.height, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth },
      textRects: rects.map(rect => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })),
      computed: { fontSize: style.fontSize, lineHeight: style.lineHeight, fontFamily: style.fontFamily, whiteSpace: style.whiteSpace, display: style.display, textAlign: style.textAlign },
      html: element.innerHTML,
      text: element.innerText,
    };
  });
  await page.screenshot({ path: resolve(proofDir, 'editor-recompose-debug-v1.png'), fullPage: false });
  assert.equal(reflowMeasure.lineCount, 1, `Inserted title text wrapped unexpectedly: ${JSON.stringify(reflowMeasure)}`);
  assert.ok(reflowMeasure.lineWidths[0].width < reflowMeasure.frameBox.width, 'Inserted title exceeds the available frame width.');
  await page.screenshot({ path: resolve(proofDir, 'editor-recompose-v1.png'), fullPage: false });
  await page.getByRole('button', { name: '📝 Edit Text' }).click();
  const shortenedEditor = page.locator('.rse-edit-text textarea').last();
  await shortenedEditor.waitFor({ state: 'visible' });
  await shortenedEditor.fill(candidate.proposalText);
  await page.getByRole('button', { name: /^\s*Confirmar\s*$/ }).last().click();
  await page.waitForFunction(expected => (document.querySelector('.page-container')?.innerText ?? '').replace(/\s+/gu, ' ').trim().includes(expected), normalize(candidate.proposalText));
  const restoredProposal = normalize(await page.locator('.page-container').innerText()).includes(normalize(candidate.proposalText));
  assert.ok(restoredProposal, 'Restoring the proposal text did not recompose the page.');
  await page.locator('.rse-close').click();
  await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
  assert.deepEqual(blockedMutations, []);
  assert.deepEqual(pageErrors, []);
  const payloadAfter = await readPayloadPageRecords();
  assert.deepEqual(payloadAfter, payloadBefore);
  const afterAssets = {};
  for (const name of assetNames) afterAssets[name] = digest(await readFile(resolve(pageAssetDir, name)));
  assert.deepEqual(afterAssets, beforeAssets);
  const receipt = {
    status: 'passed-live-viewer-session-only-editor-recompose-for-one-unit', page: 20, locale: 'pt-BR',
    proposalSha256: digest(await readFile(proposalPath)), spanKey: candidate.spanKey,
    viewerProposalVisible: true, viewerTranslationTargets: viewerCount,
    editorSelected: selected, editorProposalMatched: true, editorEditable: true,
    temporaryInsertionRendered: true, temporaryRemovalRendered: restoredProposal,
    temporaryReflow: reflowMeasure,
    payload: { beforeCount: payloadBefore.length, afterCount: payloadAfter.length, unchanged: true },
    observedApiMethods: [...new Set(requests.map(request => request.method))], blockedMutations,
    consoleErrors, pageErrors, canonicalAssetsUnchanged: true, saveClicked: false,
    screenshots: { viewer: resolve(proofDir, 'viewer-pt-BR-live-v1.png'), editor: screenshotPath, recomposedTemporaryText: resolve(proofDir, 'editor-recompose-v1.png') },
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); }
