import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const pageDir = resolve(root, 'apps/web/public/pages/page_102');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1');
const snapshotPath = resolve(proofDir, 'snapshot/snapshot-p102-conviction-casting-family-v1-export.json');
const sourceBody = "Some Abilities, Conditions, or AI Steps may reference a figure's Conviction Value or Casting Value. The Conviction Value or Casting Value is calculated by adding the figure's best dice of the appropriate type according to the rating list on the left.";
const bodyTarget = 'Algumas Habilidades, Condições ou Etapas de IA podem se referir ao Valor de Convicção ou ao Valor de Conjuração de uma miniatura. Esse valor é calculado somando os melhores dados da miniatura do tipo adequado, conforme a lista de classificações à esquerda.';
const sourceCasting = 'Since Casting only uses 1 die, the Casting Value is simply the value of the single die.';
const castingTarget = 'Como a Conjuração usa só 1 dado, o Valor de Conjuração é simplesmente o valor desse dado.';
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase();
const pageFiles = ['page_102_dom.json', 'background.webp', 'layout_frames.json', 'fidelity_overlays.json'];
const hashesBefore = Object.fromEntries(await Promise.all(pageFiles.map(async name => [name, await sha(resolve(pageDir, name))])));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const candidates = snapshot.translations;
assert.equal(candidates.length, 2, 'Expected exactly the two isolated p.102 translation candidates');
assert.equal(new Set(candidates.map(doc => doc.spanKey)).size, 2, 'Candidate serialization keys are not unique');
assert.ok(candidates.every(doc => doc.language === 'pt-BR'), 'Snapshot contains a non-PT-BR candidate');
assert.ok(candidates.every(doc => !doc.spanKey.endsWith('__en')), 'Unexpected __en serialization key');
const legacy = candidates.find(doc => doc.spanKey === 'page_102_block_1__pt-BR');
assert.ok(legacy, 'Legacy p.102 block lacks the expected language-qualified Payload key');
assert.equal(legacy.data.segments.map(segment => segment.text).join(''), castingTarget);

const baselineResponse = await fetch(`${apiUrl}/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=5000`, { signal: AbortSignal.timeout(20000) });
assert.ok(baselineResponse.ok, `Payload GET failed: ${baselineResponse.status}`);
const livePayload = await baselineResponse.json();
const liveDocs = livePayload.docs ?? [];
assert.equal(liveDocs.filter(doc => String(doc.spanKey ?? '').startsWith('page_102_')).length, 0,
  'p.102 has gained saved translations; stop before mocking over them');
const responseDocs = [...liveDocs, ...candidates.map((doc, index) => ({ ...doc, id: `isolated-p102-candidate-${index + 1}` }))];
const requests = [];
const blockedWrites = [];
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/*', async route => {
    const request = route.request();
    const method = request.method().toUpperCase();
    requests.push({ method, url: request.url() });
    if (method !== 'GET') {
      blockedWrites.push({ method, url: request.url() });
      return route.abort('blockedbyclient');
    }
    const url = new URL(request.url());
    if (url.origin === new URL(apiUrl).origin && url.pathname === '/api/translations') {
      const exactKey = url.searchParams.get('where[and][0][spanKey][equals]')
        ?? url.searchParams.get('where[spanKey][equals]');
      const language = url.searchParams.get('where[and][1][language][equals]')
        ?? url.searchParams.get('where[language][equals]');
      let docs = responseDocs;
      if (language) docs = docs.filter(doc => doc.language === language);
      if (exactKey) docs = docs.filter(doc => doc.spanKey === exactKey);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': new URL(viewerUrl).origin,
          'Access-Control-Allow-Credentials': 'true',
          Vary: 'Origin',
        },
        body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }),
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('102');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '102'
    && document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_102/background.webp')
    && document.querySelector('.page-container img')?.naturalWidth > 0);
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(({ body, casting }) => {
    const text = document.querySelector('.page-container')?.innerText ?? '';
    return text.includes(body) && text.includes(casting);
  }, { body: bodyTarget, casting: castingTarget }, { timeout: 15000 });
  const rendered = normalize(await page.locator('.page-container').innerText());
  assert.equal(rendered.split(normalize(bodyTarget)).length - 1, 1, 'Viewer has a missing or duplicate body candidate');
  assert.equal(rendered.split(normalize(castingTarget)).length - 1, 1, 'Viewer has a missing or duplicate Casting candidate');
  assert.ok(!rendered.includes(normalize(sourceBody)), 'Viewer fell back to the full English body');
  assert.ok(!rendered.includes(normalize(sourceCasting)), 'Viewer fell back to the English Casting paragraph');
  await page.screenshot({ path: resolve(proofDir, 'normal-viewer-page-102-pt-BR-family-v1.png'), fullPage: true });

  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const markIsolatedPreview = async () => {
    await page.evaluate(() => {
      const banner = document.createElement('div');
      banner.textContent = 'QA PREVIEW ISOLADO · API GET INTERCEPTADO · NÃO SALVO NO PAYLOAD';
      Object.assign(banner.style, {
        position: 'fixed', top: '8px', left: '8px', zIndex: '2147483647',
        padding: '8px 12px', background: '#8b1e1e', color: '#fff',
        border: '1px solid #fff', borderRadius: '4px',
        font: 'bold 13px Arial, sans-serif', letterSpacing: '.3px',
      });
      document.body.appendChild(banner);
    });
  };
  const inspectTarget = async (selector, expectedText, screenshotPath) => {
    const target = page.locator(selector);
    assert.equal(await target.count(), 1, `Expected one Editor target for ${selector}`);
    await target.click({ force: true });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = page.locator('textarea').last();
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(normalize(await textarea.inputValue()), normalize(expectedText), `Editor loaded a fallback or wrong text for ${selector}`);
    await markIsolatedPreview();
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await page.locator('.rse-close').click();
    return true;
  };
  await inspectTarget('[data-editable-unit-key="page_102_unit_p102-conviction-value-body__pt-BR"]', bodyTarget,
    resolve(proofDir, 'normal-editor-page-102-body-pt-BR-readonly-v2.png'));
  await inspectTarget('[data-editable-unit-key="page_102_block_1"]', castingTarget,
    resolve(proofDir, 'normal-editor-page-102-casting-pt-BR-readonly-v2.png'));
  const afterCancel = normalize(await page.locator('.page-container').innerText());
  assert.ok(afterCancel.includes(normalize(bodyTarget)) && afterCancel.includes(normalize(castingTarget)), 'Cancel changed the isolated candidate preview');

  await pageInput.fill('101');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '101');
  await pageInput.fill('102');
  await pageInput.press('Enter');
  await page.waitForFunction(({ body, casting }) => {
    const text = document.querySelector('.page-container')?.innerText ?? '';
    return document.querySelector('input.page-input')?.value === '102' && text.includes(body) && text.includes(casting);
  }, { body: bodyTarget, casting: castingTarget }, { timeout: 15000 });
  const finalHashes = Object.fromEntries(await Promise.all(pageFiles.map(async name => [name, await sha(resolve(pageDir, name))])));
  assert.deepEqual(finalHashes, hashesBefore, 'Canonical p.102 assets changed during read-only Editor check');
  assert.equal(blockedWrites.length, 0, 'A write request was attempted (and blocked)');
  assert.deepEqual(errors, [], 'Browser reported page errors during isolated Editor check');
  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 102,
    mode: 'normal Viewer/Admin Editor with API GET overlay from immutable snapshot; writes blocked',
    payloadBaselinePageRecords: 0,
    candidatesLoaded: candidates.map(doc => ({ spanKey: doc.spanKey, language: doc.language })),
    legacyBlockPayloadKey: 'page_102_block_1__pt-BR',
    legacyBlockClientEditorKey: 'page_102_block_1',
    editorTargetsMatched: [
      'page_102_unit_p102-conviction-value-body__pt-BR',
      'page_102_block_1',
    ],
    editorLoadedCandidateText: true,
    cancelKeptSnapshotCandidatePreview: true,
    pageReopenKeptSnapshotCandidatePreview: true,
    saveClicked: false,
    blockedWrites,
    observedMethods: [...new Set(requests.map(request => request.method))],
    pageErrors: errors,
    canonicalHashesBefore: hashesBefore,
    canonicalHashesAfter: finalHashes,
    canonicalFilesUnchanged: true,
  };
  await writeFile(resolve(proofDir, 'normal-editor-family-readonly-receipt-v2.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
