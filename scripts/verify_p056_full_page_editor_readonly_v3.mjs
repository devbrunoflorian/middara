import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-full-page-v3-corrected');
const pageDir = resolve(root, 'apps/web/public/pages/page_056');
const pageFiles = [
  'page_056_dom.json',
  'background.webp',
  'layout_frames.json',
  'fidelity_overlays.json',
  'fidelity-overlay-component-combatant-type-tags.png',
  'fidelity-overlay-component-intelligent-combatant-tag-card.png',
  'fidelity-overlay-source-vector-p056-d0960.svg',
  'fidelity-overlay-source-vector-p056-d0962.svg',
];
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_WEB_URL ?? 'http://127.0.0.1:8080';
const apiOrigin = new URL(apiUrl).origin;
const pageOrigin = new URL(baseUrl).origin;
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase();
const hashFiles = async () => Object.fromEntries(await Promise.all(pageFiles.map(async name => [
  name,
  await sha(resolve(pageDir, name)),
])));

const proposal = JSON.parse(await readFile(resolve(root, 'docs/translations/proposals/page-056-full-page-text-proposal-2026-10-15-v3-corrected.json'), 'utf8'));
const snapshot = JSON.parse(await readFile(resolve(proofDir, 'snapshot/snapshot-p056-full-page-v3.json'), 'utf8'));
const records = snapshot.translations ?? [];
const candidates = proposal.candidates;
const isolatedFrame = snapshot.layoutFrames.find(frame => frame.unitKey === 'page_56_block_36' && frame.language === 'pt-BR');
assert.equal(candidates.length, 23);
assert.equal(records.length, 23);
assert.ok(isolatedFrame, 'Snapshot must include the isolated PT-BR heading frame');
assert.equal(isolatedFrame.data.width, 136);
assert.equal(candidates.find(candidate => candidate.blockId === 'block_104')?.proposalText, 'Tags de Combatente');
assert.deepEqual(new Set(records.map(record => record.spanKey)), new Set(candidates.map(candidate => candidate.spanKey)));

const before = await hashFiles();
for (const [name, expectedHash] of Object.entries(proposal.sourceHashes.pageFiles)) {
  assert.equal(before[name], expectedHash, `Canonical p.56 file changed since proposal generation: ${name}`);
}
const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const readPayloadP56 = async () => {
  const response = await fetch(translationsUrl);
  assert.ok(response.ok, `Payload read failed: ${response.status}`);
  const body = await response.json();
  return (body.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_56_'))
    .map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt }));
};
const payloadBefore = await readPayloadP56();
assert.deepEqual(payloadBefore, [], 'A PT-BR p.56 record already exists; do not alter it');

const requests = [];
const blockedRequests = [];
const consoleErrors = [];
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
    requests.push({ method, url: request.url() });
    if (url.origin !== apiOrigin || method !== 'GET') {
      blockedRequests.push({ method, url: request.url() });
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/api/translations') {
      let docs = records;
      const language = url.searchParams.get('where[language][equals]');
      if (language) docs = docs.filter(record => record.language === language);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    if (url.pathname === '/api/layout-frames') {
      const requestedPage = Number(url.searchParams.get('where[and][0][pageNumber][equals]') ?? url.searchParams.get('where[pageNumber][equals]'));
      const language = url.searchParams.get('where[and][1][language][equals]') ?? url.searchParams.get('where[language][equals]');
      const docs = (snapshot.layoutFrames ?? []).filter(frame =>
        (!Number.isFinite(requestedPage) || frame.pageNumber === requestedPage)
        && (!language || frame.language === language));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
      });
    }
    return route.continue();
  });

  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('56');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '56'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_056/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0, { timeout: 30000 });
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');

  const pageText = normalize(await page.locator('.page-container').innerText());
  const viewerChecks = candidates.map(candidate => ({
    spanKey: candidate.spanKey,
    visible: pageText.includes(normalize(candidate.proposalText)),
  }));
  assert.ok(viewerChecks.every(result => result.visible), 'The Viewer did not display every proposal candidate');
  assert.ok(pageText.includes('Tags de Combatente'), 'The translated heading did not render');
  assert.ok(!pageText.includes('Tags: Combatentes'), 'The superseded heading wording unexpectedly appeared');

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const frameElement = page.locator('[data-admin-geometry-key="page_56_block_36"]');
  assert.equal(await frameElement.count(), 1, 'The heading must have one Admin geometry target');
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-admin-geometry-key="page_56_block_36"]');
    return element?.getAttribute('data-admin-geometry-width') === '136';
  }, { timeout: 15000 });
  const measuredFrame = await frameElement.evaluate(element => ({
    x: Number(element.getAttribute('data-admin-geometry-x')),
    y: Number(element.getAttribute('data-admin-geometry-y')),
    width: Number(element.getAttribute('data-admin-geometry-width')),
    height: Number(element.getAttribute('data-admin-geometry-height')),
  }));
  assert.equal(measuredFrame.width, 136, 'The isolated PT-BR width was not loaded into the normal Viewer');
  await page.screenshot({
    path: resolve(proofDir, 'normal-admin-viewer-p056-pt-BR-v3-corrected.png'),
    fullPage: true,
  });

  const editorChecks = [];
  for (const candidate of candidates) {
    const spanKey = candidate.spanKey;
    const uiKey = spanKey.startsWith('page_56_block_') ? spanKey.replace(/__pt-BR$/u, '') : spanKey;
    const target = page.locator(`[data-editable-unit-key="${uiKey}"]`);
    assert.equal(await target.count(), 1, `${spanKey} should map to exactly one Editor target (${uiKey})`);
    await target.click({ force: true });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = page.locator('textarea').last();
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
    const actual = normalize(await textarea.inputValue());
    const expected = normalize(candidate.proposalText);
    assert.equal(actual, expected, `Editor proposal mismatch for ${spanKey}`);
    assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), `${spanKey} is not editable`);
    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForFunction(() => !document.querySelector('.rich-editor-panel'));
    editorChecks.push({ spanKey, uiKey, proposalMatched: true, editable: true, cancelled: true });
  }

  const payloadAfter = await readPayloadP56();
  assert.deepEqual(payloadAfter, [], 'Read-only Editor check created or changed a p.56 PT-BR Payload record');
  assert.equal(blockedRequests.length, 0, 'A non-GET API request was attempted');
  const after = await hashFiles();
  assert.deepEqual(after, before, 'Canonical p.56 files changed during Editor check');

  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 56,
    method: 'Normal Viewer/Admin UI; immutable proposal and PT-BR-only frame supplied through intercepted GET /api/translations and GET /api/layout-frames',
    candidateCount: candidates.length,
    isolatedFrame: { unitKey: isolatedFrame.unitKey, language: isolatedFrame.language, expected: isolatedFrame.data, measured: measuredFrame },
    viewer: { allCandidatesVisible: viewerChecks.every(result => result.visible), checks: viewerChecks },
    editor: {
      allCandidatesMatchedAndEditable: editorChecks.length === 23 && editorChecks.every(result => result.proposalMatched && result.editable),
      cancelClosedEveryDraft: editorChecks.every(result => result.cancelled),
      checks: editorChecks,
    },
    heading: { translatedHeadingVisible: true, supersededWordingAbsent: true },
    payloadPtBrRecordsBeforeAndAfter: { before: payloadBefore, after: payloadAfter },
    blockedNonGetApiRequests: blockedRequests,
    observedApiMethods: [...new Set(requests.map(request => request.method))],
    consoleErrors,
    canonicalPageHashesBefore: before,
    canonicalPageHashesAfter: after,
    canonicalPageFilesUnchanged: true,
    saveClicked: false,
    note: 'The app received all immutable proposal records and one PT-BR-only frame through browser-only GET overlays. No proposal or frame was persisted; Cancel was tested for every candidate.',
  };
  const receiptPath = resolve(proofDir, 'normal-editor-readonly-receipt-v3.json');
  await mkdir(proofDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: String(error), blockedRequests, consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
