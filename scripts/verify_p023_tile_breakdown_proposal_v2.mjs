#!/usr/bin/env node
/** Read-only Viewer/Admin Editor check for the isolated p.23 text proposal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 23;
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v2');
const proposalPath = resolve(root, 'docs/translations/proposals/page-023-tile-breakdown-2026-10-16-v2.json');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot.json');
const receiptPath = resolve(proofDir, 'viewer-editor-receipt-v2.json');
const pageAssetDir = resolve(root, 'apps/web/public/pages/page_023');
const assetNames = ['page_023_dom.json', 'background.webp', 'layout_frames.json'];
const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadOrigin = new URL(payloadUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\[\[[^\]]+\]\]/gu, ' ').replace(/[\uFFFC\uFFFD]/gu, ' ').replace(/\s+/gu, ' ').trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const candidates = proposal.candidates;
assert.equal(candidates.length, 17);
const records = snapshot.translations ?? [];

const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadPageRecords = async () => {
  const response = await fetch(translationsUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_23_'));
};
const payloadBefore = await readPayloadPageRecords();
assert.equal(payloadBefore.length, 0, 'A saved p.23 PT-BR translation appeared after proposal preflight.');
const beforeAssets = {};
for (const name of assetNames) beforeAssets[name] = digest(await readFile(resolve(pageAssetDir, name)));

const requests = [];
const blockedMutations = [];
const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/pages/page_023/page_023_dom.json', async route => {
    await route.fulfill({ path: resolve(proofDir, 'snapshot/pages/page_023/page_023_dom.json') });
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
      const docs = records.filter(record => (!language || record.language === language) && (!spanKey || record.spanKey === spanKey));
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
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill(String(pageNumber));
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_023/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  const viewerText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = candidates.map(candidate => ({
    spanKey: candidate.spanKey,
    visible: viewerText.includes(normalize(candidate.proposalText)),
  }));
  assert.ok(viewerChecks.every(check => check.visible), `Viewer omitted candidate text: ${JSON.stringify(viewerChecks.filter(check => !check.visible))}`);
  const measurements = await page.evaluate(keys => keys.map(key => {
    const nodes = [...document.querySelectorAll('[data-rendered-translation-key]')].filter(node => node.getAttribute('data-rendered-translation-key') === key);
    const target = nodes[0];
    if (!target) return { key, rendered: false };
    const frame = target.closest('.credit-field, .block-container') ?? target.parentElement;
    const frameBox = frame?.getBoundingClientRect();
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const rects = [];
    while (walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      rects.push(...[...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0));
    }
    const tops = [...new Set(rects.map(rect => Math.round(rect.top * 10) / 10))];
    const lineWidths = tops.map(top => {
      const line = rects.filter(rect => Math.round(rect.top * 10) / 10 === top);
      return Math.max(...line.map(rect => rect.right)) - Math.min(...line.map(rect => rect.left));
    });
    const fieldBox = frameBox ? { left: frameBox.left, top: frameBox.top, width: frameBox.width, height: frameBox.height } : null;
    return {
      key, rendered: true, text: target.innerText.replace(/\s+/gu, ' ').trim(),
      lineCount: tops.length, lineWidthsPx: lineWidths, fieldBox,
      overflow: !!frame?.matches('.block-overflow') || !!frame?.closest('[data-reflow-overflow-pt]'),
      targetCount: nodes.length,
    };
  }), candidates.map(candidate => candidate.spanKey));
  assert.ok(measurements.every(measurement => measurement.rendered), 'Some units have no rendered translation target.');
  for (let i = 0; i < 4; i++) await page.locator('button[title="Zoom Out"]').click();
  await page.waitForFunction(() => document.querySelector('.zoom-level')?.textContent?.trim() === '100%');
  await page.locator('.page-container').screenshot({ path: resolve(proofDir, 'viewer-pt-BR-v2.png'), animations: 'disabled' });
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  let editorScreenshotWritten = false;
  for (const candidate of candidates) {
    const uiKey = candidate.sourceUnitId
      ? candidate.spanKey
      : candidate.spanKey.replace(/__pt-BR$/u, '');
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`).first();
    assert.ok(await target.count() > 0, `No Editor target for ${uiKey}; observed keys: ${JSON.stringify(await page.locator('[data-editable-unit-key]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-editable-unit-key')).filter(Boolean).slice(0, 80)))}`);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert.ok(box, `No Editor target box for ${uiKey}`);
    await target.click({ force: true, position: { x: Math.min(box.width / 2, Math.max(1, box.width - 1)), y: Math.min(box.height / 2, Math.max(1, box.height - 1)) } });
    await page.waitForTimeout(60);
    const selected = await target.evaluate(element => element.matches('.credit-field-selected, .block-selected, .span-selected') || !!element.closest('.credit-field-selected, .block-selected, .span-selected'));
    assert.ok(selected, `${uiKey} did not select in Admin Editor.`);
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor({ state: 'visible' });
    const matched = normalize(await editor.inputValue()) === normalize(candidate.proposalText);
    assert.ok(matched, `Editor content mismatch for ${uiKey}: ${normalize(await editor.inputValue())}`);
    assert.ok(await editor.evaluate(element => !element.disabled && !element.readOnly), `${uiKey} is not editable.`);
    if (!editorScreenshotWritten) {
      await page.screenshot({ path: resolve(proofDir, 'editor-readonly-v2.png'), fullPage: false });
      editorScreenshotWritten = true;
    }
    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
    await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    editorChecks.push({ spanKey: candidate.spanKey, uiKey, selected: true, proposalMatched: true, editable: true, cancelled: true });
  }
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
    status: 'passed-live-viewer-readonly-editor-check-for-all-proposed-units',
    page: pageNumber, locale: 'pt-BR', proposalSha256: digest(await readFile(proposalPath)),
    candidateCount: candidates.length, viewerChecks, measurements, editorChecks,
    payload: { beforeCount: payloadBefore.length, afterCount: payloadAfter.length, unchanged: true },
    observedApiMethods: [...new Set(requests.map(request => request.method))], blockedMutations,
    consoleErrors, pageErrors, canonicalAssetsUnchanged: true, saveClicked: false,
    screenshots: {
      viewer: resolve(proofDir, 'viewer-pt-BR-v2.png'),
      editor: resolve(proofDir, 'editor-readonly-v2.png'),
    },
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); }
