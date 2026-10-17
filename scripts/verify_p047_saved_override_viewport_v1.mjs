#!/usr/bin/env node
/** Read-only p.47 reproduction at the user's narrow viewport with the Viewer at 200%. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const viewerUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const payloadUrl = process.env.MIDDARA_PAYLOAD_URL ?? 'http://localhost:3000';
const key = 'page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR';
const proofDir = resolve('output/proofs/translation-readiness-2026-10-16/p047-saved-override-viewport-v1');
const writes = [];

async function getRecord() {
  const url = new URL('/api/translations', payloadUrl);
  url.searchParams.set('where[language][equals]', 'pt-BR');
  url.searchParams.set('where[spanKey][equals]', key);
  url.searchParams.set('limit', '10');
  const response = await fetch(url);
  assert.equal(response.status, 200, `Payload GET failed: ${response.status}`);
  const body = await response.json();
  assert.equal(body.docs?.length, 1);
  assert.equal(body.docs[0].id, 327);
  return body.docs[0];
}

const recordBefore = await getRecord();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 1579, height: 900 }, deviceScaleFactor: 1 });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') && !['GET', 'OPTIONS'].includes(request.method())) writes.push({ method: request.method(), path: url.pathname });
  });
  await page.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  await page.locator('input.page-input').fill('47');
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_047/background.webp'));
  await page.locator('.language-select').selectOption('pt-BR');
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.locator('.admin-mode').waitFor();
  const unit = page.locator(`[data-editable-unit-key="${key}"]`).last();
  await unit.waitFor();
  await unit.click({ position: { x: 8, y: 5 } });
  await page.waitForTimeout(300);
  const geometry = await page.evaluate(unitKey => {
    const flowUnit = document.querySelector(`[data-inline-unit-flow-key="${unitKey}"]`);
    if (!flowUnit) return null;
    const line = flowUnit.parentElement;
    const block = flowUnit.closest('.block-container');
    const range = document.createRange();
    range.selectNodeContents(flowUnit);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    const rect = value => ({ x: value.x, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height });
    const lineRect = line.getBoundingClientRect();
    const blockRect = block?.getBoundingClientRect();
    const unitRect = flowUnit.getBoundingClientRect();
    const maxTextRight = Math.max(...rects.map(item => item.right));
    return {
      text: flowUnit.innerText,
      overflowFlag: flowUnit.classList.contains('span-inline-overflow'),
      unitRect: rect(unitRect),
      lineRect: rect(lineRect),
      blockRect: blockRect ? rect(blockRect) : null,
      textRects: rects.map(rect),
      textRangeRight: maxTextRight,
      lineClearancePx: lineRect.right - maxTextRight,
      blockClearancePx: blockRect ? blockRect.right - maxTextRight : null,
      outlineRightPx: unitRect.right + 2,
      zoomLabel: document.querySelector('.zoom-level')?.textContent?.trim() ?? null,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    };
  }, key);
  assert.ok(geometry);
  assert.equal(geometry.text, recordBefore.data.segments.map(segment => segment.text).join(''));
  assert.equal(geometry.zoomLabel, '200%');

  await page.getByText('📝 Edit Text').click();
  const editor = page.locator('.rse-edit-text textarea').last();
  await editor.waitFor();
  assert.equal(await editor.inputValue(), geometry.text);
  const selectedEditorKey = await page.locator('.rse-subtitle').innerText();
  assert.ok(selectedEditorKey.includes(key));

  await mkdir(proofDir, { recursive: true });
  const screenshotPath = resolve(proofDir, 'viewer-editor-200pct-1579x900.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const recordAfter = await getRecord();
  assert.deepEqual(recordAfter, recordBefore);
  assert.deepEqual(writes, []);
  const result = {
    status: 'read-only-200-percent-viewport-reproduction',
    page: 47,
    locale: 'pt-BR',
    viewport: geometry.viewport,
    zoom: geometry.zoomLabel,
    payloadRecord: { id: recordBefore.id, spanKey: recordBefore.spanKey, updatedAt: recordBefore.updatedAt },
    selectedEditorKey,
    geometry,
    payloadRecordUnchanged: true,
    payloadWrites: writes,
    screenshotPath,
  };
  await writeFile(resolve(proofDir, 'verification.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
