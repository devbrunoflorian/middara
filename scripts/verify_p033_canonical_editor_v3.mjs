#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3');
const sidecarPath = resolve(root, 'apps/web/public/pages/page_033/inline_elements.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const expectedSidecarHash = '9F8FFBE7AC252A7A9AAF73E47AE7E5EB8AF72F2FA8EFF1F60CC51156C16300BD';
const spanKey = 'page_33_unit_p33-block-35-default-dice-paragraph__pt-BR';
const sidecarBytes = await readFile(sidecarPath);
assert.equal(sha256(sidecarBytes), expectedSidecarHash, 'Canonical p.33 sidecar changed since the verified patch.');

const writes = [];
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1120 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') {
      writes.push({ method: route.request().method(), url: route.request().url() });
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  const requestFailures = [];
  page.on('requestfailed', request => requestFailures.push(`${request.url()}: ${request.failure()?.errorText}`));
  const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  assert.ok(response?.ok(), 'Normal Viewer did not load.');
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('33');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_033/background.webp'));
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForFunction(() => document.querySelector('select.language-select')?.value === 'pt-BR');
  await page.evaluate(() => document.fonts.ready);

  const symbolsBefore = await page.locator('.page-container [data-symbol-id], .page-container [data-source-symbol-id]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-symbol-id') ?? element.getAttribute('data-source-symbol-id')));
  assert.ok(symbolsBefore.length === 0 || symbolsBefore.length === 7,
    `Unexpected semantic symbol count in untranslated PT-BR fallback: ${symbolsBefore.length}`);
  await mkdir(proofDir, { recursive: true });
  await page.locator('.page-container').screenshot({
    path: resolve(proofDir, 'canonical-viewer-ptbr-fallback-editor-v3.png'), scale: 'css', animations: 'disabled', caret: 'hide',
  });

  await page.locator('button.admin-toggle').click();
  const editableUnit = page.locator(`[data-editable-unit-key="${spanKey}"]`).first();
  await editableUnit.waitFor({ state: 'visible', timeout: 15000 });
  await editableUnit.click();
  const editor = page.locator('.rse-panel').first();
  await editor.waitFor({ state: 'visible', timeout: 15000 });
  const editorState = await editor.evaluate(element => ({
    heading: element.querySelector('h3')?.textContent?.trim() ?? '',
    subtitle: element.querySelector('.rse-subtitle')?.innerText?.trim() ?? '',
    symbolIds: [...element.querySelectorAll('[data-symbol-id]')].map(symbol => symbol.getAttribute('data-symbol-id')),
    segmentCount: element.querySelectorAll('.rse-segment-chip').length,
  }));
  assert.equal(editorState.heading, 'Rich Block Editor');
  assert.ok(editorState.subtitle.includes('Default Conviction and Casting dice'));
  assert.deepEqual(editorState.symbolIds, ['dice.purple', 'dice.purple'], 'Editor did not retain both source purple-die objects.');
  assert.ok(editorState.segmentCount > 0, 'Editor has no parsed source segments.');
  await page.screenshot({ path: resolve(proofDir, 'canonical-rich-editor-page33-v3.png'), fullPage: false, animations: 'disabled', caret: 'hide' });

  await editor.locator('button.rse-close').click();
  await page.waitForTimeout(150);
  assert.equal(writes.length, 0, `Unexpected API write(s): ${JSON.stringify(writes)}`);
  assert.equal(await page.locator('.rse-panel').count(), 0, 'Editor did not close cleanly.');
  assert.equal(requestFailures.length, 0, `Viewer request failures: ${requestFailures.join('; ')}`);

  const result = {
    status: 'p033-canonical-editor-open-cancel-readonly-verified',
    page: 33,
    locale: 'pt-BR',
    fallbackSemanticSymbols: {
      purple: symbolsBefore.filter(id => id === 'dice.purple').length,
      white: symbolsBefore.filter(id => id === 'dice.white').length,
    },
    editableSpanKey: spanKey,
    editorOpenedOnEnglishFallback: true,
    editorState,
    apiWrites: writes,
    requestFailures,
    payloadTranslationChanges: 0,
  };
  await (await import('node:fs/promises')).writeFile(resolve(proofDir, 'editor-check-v3.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  await context.close();
} finally {
  await browser.close();
}
