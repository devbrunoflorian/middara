#!/usr/bin/env node
/** Read-only p.32 Viewer/Editor verification against the isolated full-page proposal snapshot. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pageNumber = 32;
const pageId = '032';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p032-full-page-v1');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot.json');
const proposalPath = resolve(proofDir, 'proposal-candidates.json');
const sourceHashesPath = resolve(proofDir, 'source-hashes.json');
const receiptPath = resolve(proofDir, 'editor-readonly-receipt-v1.json');
const screenshotPath = resolve(proofDir, 'editor-readonly-v1.png');
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
const exampleKey = 'page_32_unit_p32-discipline-levels-example__pt-BR';
const preservedExample = records.find(record => record.spanKey === exampleKey);
assert.equal(candidates.length, 15, 'Expected 15 new p.32 proposal targets.');
assert.equal(records.length, 16, 'Expected 15 candidates plus the pre-existing Example.');
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, 15, 'Candidate keys must be unique.');
assert.equal(new Set(records.map(record => record.spanKey)).size, 16, 'Snapshot keys must be unique.');
assert.ok(preservedExample, 'The previously saved human Example record must remain in the snapshot.');
assert.deepEqual(
  new Set(records.map(record => record.spanKey)),
  new Set([...candidates.map(candidate => candidate.spanKey), exampleKey]),
  'Snapshot records must be exactly the proposal candidates plus the preserved Example.',
);

const pageDir = resolve(root, 'apps/web/public/pages', `page_${pageId}`);
const currentHashes = {};
for (const name of Object.keys(sourceHashes.pageAssets).sort()) {
  currentHashes[name] = digest(await readFile(resolve(pageDir, name)));
  assert.equal(currentHashes[name], sourceHashes.pageAssets[name], `Canonical p.32 asset changed: ${name}`);
}

const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadPageRecords = async () => {
  const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Read-only Payload GET failed: ${response.status}`);
  const body = await response.json();
  assert.ok((body.docs ?? []).length >= Number(body.totalDocs ?? 0), 'Payload baseline is paginated.');
  return (body.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_32_'));
};
const payloadBefore = await readPayloadPageRecords();
assert.equal(payloadBefore.length, 1, 'Expected only the pre-existing human Example record in Payload for p.32.');
assert.equal(payloadBefore[0].id, 300, 'Unexpected p.32 Payload record identity.');
assert.equal(payloadBefore[0].spanKey, exampleKey);
assert.equal(jsonDigest(payloadBefore[0].data), sourceHashes.apiRead.dataSha256);
assert.equal(jsonDigest(preservedExample.data), sourceHashes.apiRead.dataSha256, 'Snapshot did not preserve the existing Example data exactly.');

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
    if (url.pathname === '/api/symbol-alias-settings') {
      const docs = snapshot.symbolAliasSettings ?? [];
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
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '32'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_032/background.webp')
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
  assert.ok(viewerChecks.every(check => check.visible), `Viewer omitted proposed copy: ${JSON.stringify(viewerChecks.filter(check => !check.visible))}`);
  assert.ok(visibleTextBeforeEditor.includes(normalize(payloadBefore[0].data.segments.map(segment => segment.text).join(''))),
    'Viewer did not retain the pre-existing Example text.');

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const editorChecks = [];
  const roundTripKey = 'page_32_block_13__pt-BR';
  const editorTargets = [
    ...candidates.map(candidate => ({ spanKey: candidate.spanKey, expectedText: candidate.proposalText })),
    { spanKey: exampleKey, expectedText: payloadBefore[0].data.segments.map(segment => segment.text).join(''), preserved: true },
  ];

  for (const targetInfo of editorTargets) {
    const uiKey = targetInfo.spanKey.startsWith('page_32_block_')
      ? targetInfo.spanKey.replace(/__pt-BR$/u, '')
      : targetInfo.spanKey;
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
    assert.equal(await target.count(), 1, `${targetInfo.spanKey} must map to exactly one Editor target (${uiKey}).`);
    const expectedSubtitle = uiKey === 'page_32_unit_p32-discipline-levels-body__pt-BR'
      ? 'Page 32 · Body'
      : uiKey === exampleKey
        ? 'Page 32 · Example'
        : `Page 32 · ${uiKey}`;
    await target.scrollIntoViewIfNeeded();
    const targetBox = await target.boundingBox();
    assert.ok(targetBox, `Editor target is not measurable: ${targetInfo.spanKey}`);
    const clickPositions = [
      { x: targetBox.width / 2, y: targetBox.height / 2 },
      { x: targetBox.width - 3, y: targetBox.height / 2 },
      { x: targetBox.width / 2, y: targetBox.height - 3 },
      { x: 3, y: targetBox.height / 2 },
      { x: targetBox.width - 3, y: targetBox.height - 3 },
      { x: 3, y: targetBox.height - 3 },
    ];
    let selectedSubtitle = '';
    let selectedPosition = null;
    for (const position of clickPositions) {
      await target.click({ force: true, position });
      await page.waitForTimeout(80);
      selectedSubtitle = await page.locator('.rse-subtitle').innerText();
      if (selectedSubtitle === expectedSubtitle) {
        selectedPosition = position;
        break;
      }
    }
    assert.ok(selectedPosition, `Wrong Editor target selected for ${targetInfo.spanKey}; last selection was ${selectedSubtitle}`);
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor({ state: 'visible' });
    const rawText = await editor.inputValue();
    assert.equal(normalize(rawText), normalize(targetInfo.expectedText), `Editor text differs for ${targetInfo.spanKey}`);
    assert.ok(await editor.evaluate(element => !element.disabled && !element.readOnly), `${targetInfo.spanKey} is not editable.`);
    if (targetInfo.spanKey === 'page_32_block_10__pt-BR') {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    if (targetInfo.spanKey === roundTripKey) {
      const changed = `${rawText} teste`;
      await editor.fill(changed);
      await page.waitForFunction(value => document.querySelector('.rse-edit-text textarea')?.value === value, changed);
      const undo = page.getByRole('button', { name: 'Desfazer' }).last();
      const redo = page.getByRole('button', { name: 'Refazer' }).last();
      assert.equal(await undo.isDisabled(), false, 'Undo did not enable after editing a proposal draft.');
      await undo.click();
      assert.equal(await editor.inputValue(), rawText, 'Undo did not restore the isolated proposal text.');
      assert.equal(await redo.isDisabled(), false, 'Redo did not enable after Undo.');
      await redo.click();
      assert.equal(await editor.inputValue(), changed, 'Redo did not restore the temporary draft edit.');
      await undo.click();
      assert.equal(await editor.inputValue(), rawText, 'Second Undo did not restore the snapshot text.');
    }

    const cancel = page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last();
    await cancel.click();
    await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    editorChecks.push({ spanKey: targetInfo.spanKey, uiKey, proposalMatched: true, editable: true, textEditCancelled: true, preserved: !!targetInfo.preserved, selectedPosition });
  }

  const roundTripCandidate = candidates.find(candidate => candidate.spanKey === roundTripKey);
  const roundTripUiKey = roundTripKey.replace(/__pt-BR$/u, '');
  const roundTripPosition = editorChecks.find(check => check.spanKey === roundTripKey).selectedPosition;
  const roundTripTarget = page.locator(`[data-editable-unit-key="${roundTripUiKey}"]`);
  await roundTripTarget.scrollIntoViewIfNeeded();
  await roundTripTarget.click({ force: true, position: roundTripPosition });
  await page.getByRole('button', { name: '📝 Edit Text' }).click();
  const reopenedEditor = page.locator('.rse-edit-text textarea').last();
  await reopenedEditor.waitFor({ state: 'visible' });
  assert.equal(normalize(await reopenedEditor.inputValue()), normalize(roundTripCandidate.proposalText), 'Reopened Editor did not restore the original snapshot proposal after Cancel.');
  await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
  await page.locator('.rse-close').click();
  await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
  await readFile(screenshotPath);

  const afterHashes = {};
  for (const name of Object.keys(sourceHashes.pageAssets).sort()) {
    afterHashes[name] = digest(await readFile(resolve(pageDir, name)));
  }
  assert.deepEqual(afterHashes, currentHashes, 'Canonical p.32 assets changed during the Editor proof.');
  assert.deepEqual(blockedMutations, [], `A mutating API request was attempted: ${JSON.stringify(blockedMutations)}`);
  const payloadAfter = await readPayloadPageRecords();
  assert.deepEqual(payloadAfter, payloadBefore, 'The Editor proof changed the existing Payload record set.');
  assert.deepEqual(pageErrors, [], `Browser page errors occurred: ${JSON.stringify(pageErrors)}`);

  const receipt = {
    status: 'passed-readonly-viewer-editor-cancel-reopen-undo-redo',
    page: pageNumber,
    locale: 'pt-BR',
    proposalSha256: digest(await readFile(proposalPath)),
    snapshotSha256: digest(await readFile(snapshotPath)),
    candidateCount: candidates.length,
    snapshotRecordCount: records.length,
    viewer: { allCandidatesVisible: viewerChecks.every(check => check.visible), checks: viewerChecks, preservedExampleVisible: true },
    editor: {
      allCandidatesAndPreservedExampleMatchedAndEditable: editorChecks.length === 16 && editorChecks.every(check => check.proposalMatched && check.editable),
      allTextEditsCancelled: editorChecks.every(check => check.textEditCancelled),
      undoRedoSampleKey: roundTripKey,
      reopenedAfterCancelMatchesSnapshot: true,
      checks: editorChecks,
    },
    payload: {
      existingPageRecordCountBeforeAndAfter: [payloadBefore.length, payloadAfter.length],
      existingExampleDataSha256: jsonDigest(payloadAfter[0].data),
      unchanged: true,
    },
    blockedMutationRequests: blockedMutations,
    observedApiMethods: [...new Set(requests.map(request => request.method))],
    consoleErrors,
    pageErrors,
    canonicalPageAssetsBeforeAndAfter: { before: currentHashes, after: afterHashes },
    saveClicked: false,
    screenshot: screenshotPath,
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
