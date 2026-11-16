#!/usr/bin/env node
/** Read-only reproduction of the currently persisted p.47 IMPORTANT override in the normal Viewer. */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadUrl = process.env.MIDDARA_PAYLOAD_URL ?? 'http://localhost:3000';
const key = 'page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR';
const proofDir = resolve('output/proofs/translation-readiness-2026-10-16/p047-saved-override-reproduction-v1');
const unexpectedWrites = [];

async function getSavedRecord() {
  const response = await fetch(`${payloadUrl}/api/translations?language=pt-BR&limit=5000`);
  assert.equal(response.status, 200, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  const matches = body.docs.filter(record => record.id === 327 && record.spanKey === key);
  assert.equal(matches.length, 1, `Expected one persisted record 327 for ${key}; got ${matches.length}`);
  return matches[0];
}

const persistedBefore = await getSavedRecord();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined,
});

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') && !['GET', 'OPTIONS'].includes(request.method())) {
      unexpectedWrites.push({ method: request.method(), path: url.pathname });
    }
  });

  await page.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  await page.locator('input.page-input').fill('47');
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_047/background.webp'));
  await page.locator('.language-select').selectOption('pt-BR');
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.locator('.admin-mode').waitFor();

  const unitSelector = `[data-editable-unit-key="${key}"]`;
  const unitTarget = page.locator(unitSelector).last();
  await unitTarget.waitFor();
  await unitTarget.click({ position: { x: 8, y: 5 } });
  await page.waitForTimeout(350);

  const geometry = await page.evaluate(unitKey => {
    const unit = document.querySelector(`[data-inline-unit-flow-key="${unitKey}"]`);
    if (!unit) return null;
    const line = unit.parentElement;
    const block = unit.closest('.block-container');
    const range = document.createRange();
    range.selectNodeContents(unit);
    const textRects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    const rectData = rect => ({ x: rect.x, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height });
    const style = getComputedStyle(unit);
    const lineRect = line.getBoundingClientRect();
    const blockRect = block?.getBoundingClientRect();
    const unitRect = unit.getBoundingClientRect();
    const maxTextRight = Math.max(...textRects.map(rect => rect.right));
    return {
      text: unit.innerText,
      className: unit.className,
      overflowFlag: unit.classList.contains('span-inline-overflow'),
      unitStyle: { width: style.width, maxWidth: style.maxWidth, whiteSpace: style.whiteSpace, letterSpacing: style.letterSpacing },
      lineRect: rectData(lineRect),
      blockRect: blockRect ? rectData(blockRect) : null,
      unitRect: rectData(unitRect),
      textRects: textRects.map(rectData),
      textRangeRight: maxTextRight,
      lineClearancePx: lineRect.right - maxTextRight,
      blockClearancePx: blockRect ? blockRect.right - maxTextRight : null,
      outlineRightPx: unitRect.right + 2,
      sourceLineAvailableX: line.dataset.sourceLineAvailableX,
      sourceLineAvailableWidth: line.dataset.sourceLineAvailableWidth,
      sourceLineRight: lineRect.right,
    };
  }, key);

  assert.ok(geometry, 'The saved override is not painted in the normal Viewer.');
  assert.equal(geometry.text, persistedBefore.data.segments.map(segment => segment.text).join(''), 'Viewer text differs from Payload GET.');

  await page.getByText('📝 Edit Text').click();
  const editor = page.locator('.rse-edit-text textarea').last();
  await editor.waitFor();
  const editorText = await editor.inputValue();
  assert.equal(editorText, geometry.text, 'Editor text differs from the currently painted saved override.');
  const selectedEditorKey = await page.locator('.rse-subtitle').innerText();
  assert.ok(selectedEditorKey.includes(key), `Wrong Editor unit selected: ${selectedEditorKey}`);

  await mkdir(proofDir, { recursive: true });
  const screenshotPath = resolve(proofDir, 'admin-saved-override.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const cancel = page.getByRole('button', { name: /Cancelar|Cancel/i }).last();
  if (await cancel.count()) await cancel.click();

  const persistedAfter = await getSavedRecord();
  assert.deepEqual(persistedAfter, persistedBefore, 'Payload record changed during the read-only reproduction.');
  assert.deepEqual(unexpectedWrites, [], `Unexpected API write: ${JSON.stringify(unexpectedWrites)}`);

  const result = {
    status: 'read-only-saved-override-reproduced',
    page: 47,
    locale: 'pt-BR',
    viewerUrl,
    payloadRecord: { id: persistedBefore.id, spanKey: persistedBefore.spanKey, language: persistedBefore.language, updatedAt: persistedBefore.updatedAt },
    persistedText: geometry.text,
    selectedEditorKey,
    geometry,
    payloadRecordUnchanged: true,
    payloadWrites: unexpectedWrites,
    screenshotPath,
  };
  await writeFile(resolve(proofDir, 'verification.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
