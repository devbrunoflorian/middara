#!/usr/bin/env node
/** Read-only Viewer/Admin Editor check for the isolated p.25 proposal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 25;
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v7');
const proposalPath = resolve(root, 'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v7.json');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot.json');
const receiptPath = resolve(proofDir, 'viewer-editor-receipt-v7.json');
const pageAssetDir = resolve(root, 'apps/web/public/pages/page_025');
const assetNames = ['page_025_dom.json', 'background.webp', 'layout_frames.json'];
const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadOrigin = new URL(payloadUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\[\[[^\]]+\]\]/gu, ' ').replace(/[\uFFFC\uFFFD]/gu, ' ').replace(/\s+/gu, ' ').trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const candidates = proposal.candidates;
const renderableCandidates = candidates.filter(candidate => candidate.diagnosticRendering === 'proposal');
assert.equal(candidates.length, 12);
assert.equal(renderableCandidates.length, 9);
const records = snapshot.translations ?? [];
assert.equal(records.length, 13);

const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadPageRecords = async () => {
  const response = await fetch(translationsUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_25_'));
};
const payloadBefore = await readPayloadPageRecords();
  assert.equal(payloadBefore.length, 4, 'The saved p.25 translation baseline changed after preflight.');
assert.deepEqual(payloadBefore.map(record => Number(record.id)).sort((a, b) => a - b), [320, 321, 322, 323]);
const beforeAssets = {};
for (const name of assetNames) beforeAssets[name] = digest(await readFile(resolve(pageAssetDir, name)));

const requests = [];
const blockedMutations = [];
const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/pages/page_025/page_025_dom.json', async route => {
    await route.fulfill({ path: resolve(proofDir, 'snapshot/pages/page_025/page_025_dom.json') });
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
    if (url.pathname === '/api/symbol-alias-settings') {
      const docs = snapshot.symbolAliasSettings ?? [];
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
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_025/background.webp') && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await page.waitForTimeout(400);
  const viewerText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = renderableCandidates.map(candidate => ({ spanKey: candidate.spanKey, visible: viewerText.includes(normalize(candidate.proposalText)) }));
  const viewerMissing = viewerChecks.filter(check => !check.visible);
  const measurements = await page.evaluate(keys => keys.map(key => {
    const nodes = [...document.querySelectorAll('[data-rendered-translation-key]')].filter(node => node.getAttribute('data-rendered-translation-key') === key);
    const target = nodes[0];
    if (!target) return { key, rendered: false, targetCount: nodes.length };
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
    return {
      key, rendered: true, text: target.innerText.replace(/\s+/gu, ' ').trim(),
      lineCount: tops.length, lineWidthsPx: lineWidths,
      frameBox: frameBox ? { left: frameBox.left, top: frameBox.top, width: frameBox.width, height: frameBox.height } : null,
      overflow: !!frame?.matches('.block-overflow') || !!frame?.closest('[data-reflow-overflow-pt]'),
      targetCount: nodes.length,
    };
  }), renderableCandidates.map(candidate => candidate.spanKey.endsWith('__pt-BR') ? candidate.spanKey : `${candidate.spanKey}__pt-BR`));
  for (let i = 0; i < 4; i++) await page.locator('button[title="Zoom Out"]').click();
  await page.waitForFunction(() => document.querySelector('.zoom-level')?.textContent?.trim() === '100%');
  await page.locator('.page-container').screenshot({ path: resolve(proofDir, 'viewer-pt-BR-v7.png'), animations: 'disabled' });
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  let editorScreenshotWritten = false;
  for (const candidate of renderableCandidates) {
    const uiKey = candidate.editorUnitKey ?? (candidate.sourceUnitId ? candidate.spanKey : candidate.spanKey.replace(/__pt-BR$/u, ''));
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`).first();
    assert.ok(await target.count() > 0, `No Editor target for ${uiKey}`);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert.ok(box, `No Editor target box for ${uiKey}`);
    await target.click({ force: true, position: { x: Math.min(box.width / 2, Math.max(1, box.width - 1)), y: Math.min(box.height / 2, Math.max(1, box.height - 1)) } });
    try {
      await page.waitForFunction(key => {
        const element = [...document.querySelectorAll('[data-editable-unit-key]')].find(node => node.getAttribute('data-editable-unit-key') === key);
        return !!element && (element.matches('.credit-field-selected, .block-selected, .span-selected') || !!element.closest('.credit-field-selected, .block-selected, .span-selected'));
      }, uiKey, { timeout: 5000 });
    } catch (error) {
      const debug = await target.evaluate(element => ({ html: element.outerHTML.slice(0, 700), className: element.className, selected: !!element.closest('.credit-field-selected, .block-selected, .span-selected') })).catch(() => null);
      throw new Error(`Admin Editor selection timed out for ${uiKey}: ${JSON.stringify(debug)}; ${error}`);
    }
    const selected = await target.evaluate(element => element.matches('.credit-field-selected, .block-selected, .span-selected') || !!element.closest('.credit-field-selected, .block-selected, .span-selected'));
    assert.ok(selected, `${uiKey} did not select in Admin Editor.`);
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor({ state: 'visible' });
    const editorText = normalize(await editor.inputValue());
    const matched = editorText === normalize(candidate.proposalText);
    const editable = await editor.evaluate(element => !element.disabled && !element.readOnly);
    if (!editorScreenshotWritten) {
      await page.screenshot({ path: resolve(proofDir, 'editor-readonly-v7.png'), fullPage: false });
      editorScreenshotWritten = true;
    }
    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
    await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    editorChecks.push({ spanKey: candidate.spanKey, uiKey, selected: true, proposalMatched: matched, editable, editorText, cancelled: true, disposition: matched ? 'verified_read_only_editor_unit' : 'parent_or_source_boundary_mismatch' });
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
    status: editorChecks.every(check => check.proposalMatched && check.editable) ? 'passed-live-viewer-readonly-editor-check-for-all-editable-proposed-units' : 'viewer_passed_editor_opened_with_documented_unit_boundary_mismatches',
    page: pageNumber, locale: 'pt-BR', proposalSha256: digest(await readFile(proposalPath)),
    candidateCount: candidates.length, renderedCandidateCount: renderableCandidates.length, viewerChecks, viewerMissing, measurements, editorChecks, editorVerifiedCandidateCount: editorChecks.filter(check => check.proposalMatched && check.editable).length, editorBoundaryMismatchCount: editorChecks.filter(check => !check.proposalMatched).length,
    payload: { beforeCount: payloadBefore.length, afterCount: payloadAfter.length, unchanged: true, ids: payloadBefore.map(record => record.id).sort((a, b) => a - b) },
    observedApiMethods: [...new Set(requests.map(request => request.method))], blockedMutations,
    consoleErrors, pageErrors, canonicalAssetsUnchanged: true, saveClicked: false,
    screenshots: { viewer: resolve(proofDir, 'viewer-pt-BR-v7.png'), editor: resolve(proofDir, 'editor-readonly-v7.png') },
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  assert.equal(viewerMissing.length, 0, `Viewer omitted proposal text: ${JSON.stringify(viewerMissing)}`);
  assert.ok(measurements.every(measurement => measurement.rendered), 'Some proposal units lack rendered translation targets.');
} finally { await browser.close(); }


