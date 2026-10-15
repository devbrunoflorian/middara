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
const normalize = value => String(value).replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1').trim();
const dom = JSON.parse(await readFile(resolve(pageDir, 'page_062_dom.json'), 'utf8'));
const targets = [
  { blockIndex: 1, label: 'Targeting Priority opening paragraph', key: 'page_62_block_1' },
  { blockIndex: 2, label: 'Targeting Priority eligibility paragraph', key: 'page_62_block_2' },
].map(target => {
  const block = dom.blocks[target.blockIndex];
  assert.ok(block, `${target.label}: block index missing`);
  target.blockId = block.id;
  target.typographicUnits = (block.typographicUnits ?? []).length;
  target.source = normalize(block.lines.flatMap(line => line.spans
    .filter(span => !span.renderOnlyStrokePass).map(span => span.text ?? '')).join(' '));
  return target;
});
assert.equal(targets[0].source,
  'An Intelligent Combatants AI Steps will usually specify which figure will be targeted when an Intelligent Combatant takes an Action or uses Abilities. Sometimes, this will be something specific like the opponent with the lowest HP, or the target with the lowest Armor Value. Other times, it simply doesn’t specify.');
assert.equal(targets[1].source,
  'In both cases, players will refer to the specific Action being used to determine eligible targets. For Attack Actions, targets must be within the listed Range and within Line of Sight. For Spell Actions, targets must be within SOI. If the AI Step of an Intelligent Combatant further specifies a target, targets meeting the specific criteria are considered the eligible targets for that Action.');

const requests = [];
const blockedRequests = [];
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
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('62');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '62');
  await page.waitForFunction(() => {
    const image = document.querySelector('.page-container img');
    return image?.naturalWidth > 0 && !document.querySelector('.loading-spinner');
  }, undefined, { timeout: 20000 });
  await page.locator('select.language-select').selectOption('en');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'en');
  await page.waitForTimeout(300);
  const viewerText = normalize(await page.locator('.page-container').innerText());
  assert.ok(viewerText.includes(targets[0].source.slice(0, 80)));
  assert.ok(viewerText.includes(targets[1].source.slice(0, 80)));
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');

  const trials = [];
  for (const target of targets) {
    const selector = `.block-container[data-editable-unit-key="${target.key}"]`;
    const hitTarget = page.locator(selector);
    assert.equal(await hitTarget.count(), 1, `${target.label}: no unique normal-Editor hit target ${target.key}`);
    // Dispatch on the container itself; a pointer click at its center can land
    // on a nested typographicSpanUnit hit target instead of the whole block.
    await hitTarget.evaluate(element => element.click());
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const textarea = page.locator('textarea').last();
    await textarea.waitFor({ state: 'visible' });
    const editorSource = normalize(await textarea.inputValue());
    assert.equal(editorSource, target.source, `${target.label}: Editor source differs from page data`);
    assert.ok(await textarea.evaluate(element => !element.disabled && !element.readOnly));
    await page.getByRole('button', { name: /^\s*Cancel\s*$/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('textarea').length === 0);
    await page.locator('.rse-close').click();
    trials.push({ ...target, sourceMatched: true, editable: true, cancelReturnedWithoutSave: true });
  }

  await page.locator('button[title="Exit Admin"]').click();
  await page.waitForTimeout(150);
  await pageInput.fill('61');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '61');
  await pageInput.fill('62');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('input.page-input')?.value === '62');
  await page.waitForFunction(expected => {
    const image = document.querySelector('.page-container img');
    const text = (document.querySelector('.page-container')?.innerText ?? '')
      .replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1').trim();
    return image?.getAttribute('src')?.includes('page_062/background.webp')
      && image.naturalWidth > 0 && text.includes(expected);
  }, targets[0].source.slice(0, 60), { timeout: 20000 });
  const reopenedText = normalize(await page.locator('.page-container').innerText());
  for (const target of targets) {
    assert.ok(reopenedText.includes(target.source.slice(0, 70)), `${target.label}: source changed after Cancel/reopen`);
  }
  await page.locator('button[title="Fit to Screen"]').click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(proofDir, 'normal-viewer-page-062-after-legacy-cancel-v2.png'), fullPage: true });
  const hashesAfter = Object.fromEntries(await Promise.all(pageFiles.map(async name => [name, await sha(resolve(pageDir, name))])));
  const receipt = {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    page: 62,
    route: 'http://127.0.0.1:8080/ (normal Viewer/Admin UI, language en)',
    targets: trials,
    sourcePreservedAfterReopen: true,
    blockedWriteRequestCount: blockedRequests.length,
    observedRequestMethods: [...new Set(requests.map(request => request.method))],
    canonicalPageHashesBefore: hashesBefore,
    canonicalPageHashesAfter: hashesAfter,
    canonicalPageFilesUnchanged: pageFiles.every(name => hashesBefore[name] === hashesAfter[name]),
    saveClicked: false,
    scopeNote: 'Read-only source-editor check only. No PT-BR override was created or saved.',
  };
  assert.equal(blockedRequests.length, 0, 'A write request was attempted');
  assert.ok(receipt.canonicalPageFilesUnchanged, 'A canonical p.62 file changed');
  const receiptPath = resolve(proofDir, 'preceding-blocks-editor-readonly-v2.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ status: 'passed', receipt }, null, 2));
} catch (error) {
  const failure = {
    status: 'failed',
    message: String(error),
    blockedRequests,
    hashesBefore,
  };
  if (page) {
    try {
      failure.currentState = await page.evaluate(() => ({
        page: document.querySelector('input.page-input')?.value,
        language: document.querySelector('select.language-select')?.value,
        admin: document.querySelector('.app-container')?.classList.contains('admin-mode'),
        text: document.querySelector('.page-container')?.innerText?.slice(0, 1200),
      }));
      await page.screenshot({ path: resolve(proofDir, 'preceding-blocks-editor-failure.png'), fullPage: true });
    } catch {}
  }
  console.error(JSON.stringify(failure, null, 2));
  const failurePath = resolve(proofDir, `preceding-blocks-editor-failure-${Date.now()}.json`);
  await writeFile(failurePath, `${JSON.stringify(failure, null, 2)}\n`, { flag: 'wx' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
