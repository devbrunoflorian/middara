#!/usr/bin/env node
/** Read-only p.19 Viewer/Editor verification against the isolated full-page proposal v2 snapshot. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 19;
const pageId = '019';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p019-full-page-proposal-v2');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot.json');
const proposalPath = resolve(proofDir, 'proposal-candidates.json');
const sourceHashesPath = resolve(proofDir, 'source-hashes.json');
const receiptPath = resolve(proofDir, 'editor-readonly-receipt-v2.json');
const screenshotPath = resolve(proofDir, 'editor-readonly-v2.png');
const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadOrigin = new URL(payloadUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value)
  .replace(/\[\[[^\]]+\]\]/gu, ' ')
  .replace(/[\uFFFC\uFFFD]/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const jsonDigest = value => digest(Buffer.from(JSON.stringify(value)));

const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const sourceHashes = JSON.parse(await readFile(sourceHashesPath, 'utf8'));
const candidates = proposal.candidates;
const records = snapshot.translations ?? [];
assert.equal(candidates.length, 28, 'Expected all 28 p.19 proposal targets.');
assert.equal(records.length, 28, 'Snapshot must contain exactly the 28 proposal records.');
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, 28, 'Candidate keys must be unique.');
assert.equal(new Set(records.map(record => record.spanKey)).size, 28, 'Snapshot keys must be unique.');
assert.deepEqual(
  new Set(records.map(record => record.spanKey)),
  new Set(candidates.map(candidate => candidate.spanKey)),
  'Snapshot records must be exactly the proposal candidates.',
);
assert.equal(sourceHashes.candidateCount, 28);
assert.equal(sourceHashes.payloadPreflight.pageRecords, 0, 'Proposal baseline expected no p.19 Payload records.');

const pageDir = resolve(root, 'apps/web/public/pages', `page_${pageId}`);
const currentHashes = {};
for (const name of Object.keys(sourceHashes.pageAssets).sort()) {
  currentHashes[name] = digest(await readFile(resolve(pageDir, name)));
  assert.equal(currentHashes[name], sourceHashes.pageAssets[name], `Canonical p.19 asset changed: ${name}`);
}

const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadPageRecords = async () => {
  const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Read-only Payload GET failed: ${response.status}`);
  const body = await response.json();
  assert.ok((body.docs ?? []).length >= Number(body.totalDocs ?? 0), 'Payload baseline is paginated.');
  return (body.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_19_'));
};
const payloadBefore = await readPayloadPageRecords();
assert.equal(payloadBefore.length, 0, 'Live Payload p.19 state differs from the isolated proposal preflight.');

const requests = [];
const blockedMutations = [];
const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.MIDDARA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
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
      const docs = records.filter(record => (!language || record.language === language)
        && (!spanKey || record.spanKey === spanKey));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: 5000, hasNextPage: false }),
      });
      return;
    }
    if (url.pathname === '/api/layout-frames') {
      const docs = snapshot.layoutFrames ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({ docs, totalDocs: docs.length, page: 1, limit: docs.length }),
      });
      return;
    }
    await route.continue();
  });

  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  const pageInput = page.locator('input.page-input');
  await pageInput.fill(String(pageNumber));
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '19'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_019/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  const zoomLabel = page.locator('.zoom-level');
  for (let attempt = 0; attempt < 8 && await zoomLabel.innerText() !== '100%'; attempt += 1) {
    await page.locator('button[title="Zoom Out"]').click();
    await page.waitForTimeout(100);
  }
  assert.equal(await zoomLabel.innerText(), '100%', 'Could not set a legible normal-view zoom for the Editor proof.');

  const visibleTextBeforeEditor = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = candidates.map(candidate => ({
    spanKey: candidate.spanKey,
    visible: visibleTextBeforeEditor.includes(normalize(candidate.proposalText)),
  }));
  assert.ok(viewerChecks.every(check => check.visible), `Viewer omitted proposal copy: ${JSON.stringify(viewerChecks.filter(check => !check.visible))}`);
  await page.screenshot({ path: resolve(proofDir, 'viewer-pt-BR-v2-rechecked.png'), fullPage: false });

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  const roundTripKey = 'page_19_block_1__pt-BR';
  for (const candidate of candidates) {
    const uiKey = candidate.spanKey.startsWith('page_19_block_')
      ? candidate.spanKey.replace(/__pt-BR$/u, '')
      : candidate.spanKey;
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
    assert.equal(await target.count(), 1, `${candidate.spanKey} must map to exactly one Editor target (${uiKey}).`);
    await target.scrollIntoViewIfNeeded();
    const targetBox = await target.boundingBox();
    assert.ok(targetBox, `Editor target is not measurable: ${candidate.spanKey}`);
    const clickPositions = [
      { x: targetBox.width / 2, y: targetBox.height / 2 },
      { x: targetBox.width - 3, y: targetBox.height / 2 },
      { x: targetBox.width / 2, y: targetBox.height - 3 },
      { x: 3, y: targetBox.height / 2 },
      { x: targetBox.width - 3, y: targetBox.height - 3 },
      { x: 3, y: targetBox.height - 3 },
    ];
    let selectedPosition = null;
    for (const position of clickPositions) {
      await target.click({ force: true, position });
      await page.waitForTimeout(60);
      // The Editor replaces the span key in its subtitle with a generic unit label
      // (for example, "Paragraph"). Verify the selected renderer target itself.
      const selectedKey = await target.evaluate(element => {
        const selected = element.matches('.credit-field-selected, .block-selected, .span-selected');
        return selected ? element.getAttribute('data-editable-unit-key') ?? '' : '';
      });
      if (selectedKey === uiKey) {
        selectedPosition = position;
        break;
      }
    }
    assert.ok(selectedPosition, `Editor did not select exact key ${uiKey}.`);
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor({ state: 'visible' });
    const rawText = await editor.inputValue();
    assert.equal(normalize(rawText), normalize(candidate.proposalText), `Editor text differs for ${candidate.spanKey}`);
    assert.ok(await editor.evaluate(element => !element.disabled && !element.readOnly), `${candidate.spanKey} is not editable.`);
    if (candidate.spanKey === roundTripKey) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const changed = `${rawText} teste`;
      await editor.fill(changed);
      await page.waitForFunction(value => document.querySelector('.rse-edit-text textarea')?.value === value, changed);
      const undo = page.getByRole('button', { name: 'Desfazer' }).last();
      const redo = page.getByRole('button', { name: 'Refazer' }).last();
      assert.equal(await undo.isDisabled(), false, 'Undo did not enable after editing an isolated proposal draft.');
      await undo.click();
      assert.equal(await editor.inputValue(), rawText, 'Undo did not restore the isolated proposal text.');
      assert.equal(await redo.isDisabled(), false, 'Redo did not enable after Undo.');
      await redo.click();
      assert.equal(await editor.inputValue(), changed, 'Redo did not restore the temporary draft edit.');
      await undo.click();
      assert.equal(await editor.inputValue(), rawText, 'Second Undo did not restore the snapshot text.');
    }
    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
    await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    editorChecks.push({ spanKey: candidate.spanKey, uiKey, proposalMatched: true, editable: true, textEditCancelled: true, selectedPosition });
  }

  const roundTripCandidate = candidates.find(candidate => candidate.spanKey === roundTripKey);
  const roundTripPosition = editorChecks.find(check => check.spanKey === roundTripKey).selectedPosition;
  const roundTripTarget = page.locator('[data-editable-unit-key="page_19_block_1"]');
  await roundTripTarget.scrollIntoViewIfNeeded();
  await roundTripTarget.click({ force: true, position: roundTripPosition });
  await page.getByRole('button', { name: '📝 Edit Text' }).click();
  const reopenedEditor = page.locator('.rse-edit-text textarea').last();
  await reopenedEditor.waitFor({ state: 'visible' });
  assert.equal(normalize(await reopenedEditor.inputValue()), normalize(roundTripCandidate.proposalText), 'Reopened Editor did not restore snapshot proposal after Cancel.');
  await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
  await page.locator('.rse-close').click();
  await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));

  const afterHashes = {};
  for (const name of Object.keys(sourceHashes.pageAssets).sort()) {
    afterHashes[name] = digest(await readFile(resolve(pageDir, name)));
  }
  assert.deepEqual(afterHashes, currentHashes, 'Canonical p.19 assets changed during the Editor proof.');
  assert.deepEqual(blockedMutations, [], `A mutating API request was attempted: ${JSON.stringify(blockedMutations)}`);
  const payloadAfter = await readPayloadPageRecords();
  assert.deepEqual(payloadAfter, payloadBefore, 'The Editor proof changed live p.19 Payload records.');
  assert.deepEqual(pageErrors, [], `Browser page errors occurred: ${JSON.stringify(pageErrors)}`);

  const receipt = {
    status: 'passed-readonly-viewer-editor-cancel-reopen-undo-redo',
    page: pageNumber,
    locale: 'pt-BR',
    proposalSha256: digest(await readFile(proposalPath)),
    snapshotSha256: digest(await readFile(snapshotPath)),
    candidateCount: candidates.length,
    snapshotRecordCount: records.length,
    viewer: { allCandidatesVisible: viewerChecks.every(check => check.visible), checks: viewerChecks },
    editor: {
      allCandidatesMatchedAndEditable: editorChecks.length === candidates.length && editorChecks.every(check => check.proposalMatched && check.editable),
      allTextEditsCancelled: editorChecks.every(check => check.textEditCancelled),
      undoRedoSampleKey: roundTripKey,
      reopenedAfterCancelMatchesSnapshot: true,
      checks: editorChecks,
    },
    payload: { pageRecordCountBeforeAndAfter: [payloadBefore.length, payloadAfter.length], unchanged: true },
    blockedMutationRequests: blockedMutations,
    observedApiMethods: [...new Set(requests.map(request => request.method))],
    consoleErrors,
    pageErrors,
    canonicalPageAssetsBeforeAndAfter: { before: currentHashes, after: afterHashes },
    saveClicked: false,
    screenshots: {
      viewer: resolve(proofDir, 'viewer-pt-BR-v2-rechecked.png'),
      editor: screenshotPath,
    },
  };
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed-readonly-editor-proof', error: String(error), blockedMutations, consoleErrors, pageErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
