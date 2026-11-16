import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p062-ai-target-priority-v1');
const pageDir = resolve(root, 'apps/web/public/pages/page_062');
const pageFiles = ['page_062_dom.json', 'background.webp', 'inline_elements.json', 'layout_frames.json', 'fidelity_overlays.json'];
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase();
const hashesBefore = Object.fromEntries(await Promise.all(pageFiles.map(async name => [name, await sha(resolve(pageDir, name))])));
const expected = [
  {
    label: 'AI Target Priority body',
    key: 'page_62_unit_p62-ai-target-priority-body__en',
    source: 'If a specific target is never mentioned, or if there are ever multiple eligible targets even after a more specific target is identified, Combatants will prioritize the target that is closer to the front of the Initiative Track.',
  },
  {
    label: 'AI Target Priority example',
    key: 'page_62_unit_p62-ai-target-priority-example__en',
    source: 'Example: An AI Step instructs a Cave Sickle to make a ATK against the target with the most Damage. There are 2 eligible targets, both are within Range, which is adjacent, and they both have the same amount of Damage. Out of the two, the target closer to the front of the Initiative Track would be the target of the Attack.',
    editorSource: 'Example: An AI Step instructs a Cave Sickle to make a [[melee]] ATK against the target with the most Damage. There are 2 eligible targets, both are within Range, which is adjacent, and they both have the same amount of Damage. Out of the two, the target closer to the front of the Initiative Track would be the target of the Attack.',
  },
];
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const requests = [];
const blockedRequests = [];
const dialogs = [];
const trials = [];
const browser = await chromium.launch({ headless: true });
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1250 }, deviceScaleFactor: 1 });
  await context.route('**/*', async route => {
    const method = route.request().method().toUpperCase();
    requests.push({ method, url: route.request().url() });
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      blockedRequests.push({ method, url: route.request().url() });
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  page = await context.newPage();
  page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('62');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '62');
  await page.locator('select.language-select').selectOption('en');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'en');
  await page.waitForTimeout(350);
  const viewerText = normalize(await page.locator('.page-container').innerText());
  assert.ok(viewerText.includes('Targeting Priority'), 'Normal Viewer did not load p.62 source family');
  assert.ok(viewerText.includes(expected[0].source.slice(0, 75)), 'Normal Viewer source copy did not match the target family');
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');

  for (const item of expected) {
    const hitTarget = page.locator(`.credit-field[data-editable-unit-key="${item.key}"]`);
    await hitTarget.waitFor({ state: 'attached', timeout: 5000 });
    assert.equal(await hitTarget.count(), 1, `${item.label} should have one distinct normal-editor hit target`);
    await hitTarget.click({ force: true });
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = page.locator('textarea').last();
    await textarea.waitFor({ state: 'visible' });
    assert.equal(normalize(await textarea.inputValue()), item.editorSource ?? item.source, `${item.label} loaded incorrect source text`);
    assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly), `${item.label} textarea is not editable`);
    await page.getByRole('button', { name: /^\s*Cancel\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await page.locator('.rse-close').click();
    await page.waitForTimeout(100);
    trials.push({ label: item.label, key: item.key, distinctHitTarget: true, sourceTextMatched: true, editable: true, cancelReturnedWithoutSave: true });
  }

  await page.locator('button[title="Exit Admin"]').click();
  await page.waitForTimeout(200);
  await pageInput.fill('61');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '61');
  await pageInput.fill('62');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '62');
  await page.waitForTimeout(350);
  const reopenedText = normalize(await page.locator('.page-container').innerText());
  for (const item of expected) assert.ok(reopenedText.includes(item.source.slice(0, 70)), `${item.label} changed after Cancel/reopen`);
  await page.locator('button[title="Fit to Screen"]').click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(proofDir, 'normal-viewer-page-062-after-cancel-reopen.png'), fullPage: true });
  const hashesAfter = Object.fromEntries(await Promise.all(pageFiles.map(async name => [name, await sha(resolve(pageDir, name))])));
  const result = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    page: 62,
    route: 'http://127.0.0.1:8080/ (normal Viewer/Admin UI; source language en)',
    beforeTextMatched: true,
    trials,
    reopenedSourceContentPreserved: true,
    nonGetRequestsAttempted: blockedRequests.length,
    blockedRequests,
    observedRequestMethods: [...new Set(requests.map(request => request.method))],
    dialogs,
    canonicalPageHashesBefore: hashesBefore,
    canonicalPageHashesAfter: hashesAfter,
    canonicalPageFilesUnchanged: pageFiles.every(name => hashesBefore[name] === hashesAfter[name]),
    saveClicked: false,
    proposalNote: 'The proposal is isolated and is not present in Payload; this normal Editor check verifies source-unit editability and Cancel safety without saving a translation.',
  };
  assert.equal(blockedRequests.length, 0, 'A write request was attempted');
  assert.ok(result.canonicalPageFilesUnchanged, 'A canonical p.62 file changed during the read-only Editor check');
  await writeFile(resolve(proofDir, 'normal-editor-units-v1.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', result }, null, 2));
} catch (error) {
  const failure = { status: 'failed', message: String(error), blockedRequests, dialogs, hashesBefore };
  if (page) {
    try {
      failure.currentState = await page.evaluate(() => ({
        page: document.querySelector('input.page-input')?.value,
        admin: document.querySelector('.app-container')?.classList.contains('admin-mode'),
        textareas: document.querySelectorAll('textarea').length,
      }));
      await page.screenshot({ path: resolve(proofDir, 'normal-editor-verification-failure.png'), fullPage: true });
    } catch {}
  }
  console.error(JSON.stringify(failure, null, 2));
  await writeFile(resolve(proofDir, `normal-editor-units-failure-${Date.now()}.json`), `${JSON.stringify(failure, null, 2)}\n`, { flag: 'wx' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
