#!/usr/bin/env node
/** Read-only Admin proof that a long inline override stays within its indented source frame. */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const proofDir = resolve('output/proofs/translation-readiness-2026-10-16/p047-inline-current-1579-v1');
const key = 'page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR';
const oneLineEnglishDraft = 'Unless otherwise stated, there is no limit to how many times Abilities that require Symbols can be used, so long as the figure has the Symbols to spend.';
const unexpectedWrites = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined,
});

try {
  const page = await browser.newPage({ viewport: { width: 1579, height: 900 }, deviceScaleFactor: 1 });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/translations' && !['GET', 'OPTIONS'].includes(request.method())) {
      unexpectedWrites.push({ method: request.method(), url: url.origin + url.pathname });
    }
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));
  const pageInput = page.locator('input.page-input');
  await pageInput.fill('47');
  await pageInput.press('Enter');
  await page.waitForFunction(() => document.querySelector('.page-container img')?.getAttribute('src')?.includes('page_047/background.webp'));
  await page.locator('.language-select').selectOption('pt-BR');
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.locator('.admin-mode').waitFor();

  const target = page.locator(`[data-editable-unit-key="${key}"]`).last();
  await target.waitFor();
  await target.click({ position: { x: 10, y: 5 } });
  const selectedEditorKey = await page.locator('.rse-subtitle').innerText();
  assert.ok(selectedEditorKey.includes(key), `Selected the wrong editor unit: ${selectedEditorKey}`);
  await page.getByText('📝 Edit Text').click();

  const editor = page.locator('.rse-edit-text textarea').last();
  await editor.waitFor();
  const textBeforeDraft = await editor.inputValue();
  assert.ok(textBeforeDraft.includes('Unless otherwise stated'), `Unexpected saved editor value: ${textBeforeDraft.slice(0, 120)}`);
  await editor.fill(oneLineEnglishDraft);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const geometry = await page.evaluate(({ unitKey, expectedBoundaryPt, sourceLineTopPt, pageWidthPt }) => {
    const unit = document.querySelector(`[data-inline-unit-flow-key="${unitKey}"]`);
    if (!unit) return null;
    const line = unit.parentElement;
    const block = unit.closest('.block-container');
    const canvas = unit.closest('.page-container');
    const range = document.createRange();
    range.selectNodeContents(unit);
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    const lineRect = line.getBoundingClientRect();
    const unitRect = unit.getBoundingClientRect();
    const blockRect = block?.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    const scale = (canvasRect?.width ?? 0) / pageWidthPt;
    const maxRight = Math.max(...rects.map(rect => rect.right));
    const maxBottom = Math.max(...rects.map(rect => rect.bottom));
    const sourceBoundaryY = lineRect.top + (expectedBoundaryPt - sourceLineTopPt) * scale;
    return {
      unitStyle: { width: unit.style.width, maxWidth: unit.style.maxWidth, display: unit.style.display },
      unitFlowBottomPt: Number(unit.dataset.inlineUnitFlowBottomPt),
      lineRect: { x: lineRect.x, right: lineRect.right, top: lineRect.top, bottom: lineRect.bottom, width: lineRect.width },
      unitRect: { x: unitRect.x, right: unitRect.right, width: unitRect.width },
      frameRect: blockRect ? { x: blockRect.x, right: blockRect.right, width: blockRect.width } : null,
      fragmentRects: rects.map(rect => ({ x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, width: rect.width, height: rect.height })),
      maxTextRight: maxRight,
      rightClearancePx: lineRect.right - maxRight,
      selectionOutlineClearancePx: lineRect.right - unitRect.right - 2,
      maxTextBottom: maxBottom,
      sourceNextItemBoundaryY: sourceBoundaryY,
      bottomClearancePx: sourceBoundaryY - maxBottom,
      scale,
      overflowClass: unit.classList.contains('span-inline-overflow'),
    };
  }, { unitKey: key, expectedBoundaryPt: 368.3218, sourceLineTopPt: 332.6525, pageWidthPt: 820.3460083007812 });

  assert.ok(geometry, 'The selected inline override is not painted in the live Viewer.');
  assert.ok(geometry.fragmentRects.length >= 2, `Expected automatic wrapping, got ${geometry.fragmentRects.length} text fragments.`);
  assert.ok(geometry.rightClearancePx >= -0.5, `Inline text crossed the source frame by ${-geometry.rightClearancePx}px.`);
  assert.ok(geometry.selectionOutlineClearancePx >= 1.5, `Admin selection outline is too close to the frame (${geometry.selectionOutlineClearancePx}px).`);
  assert.ok(geometry.bottomClearancePx >= -0.5, `Inline text crossed the next-item boundary by ${-geometry.bottomClearancePx}px.`);
  assert.equal(geometry.overflowClass, false, 'Admin marked this inline unit as overflowing.');
  assert.deepEqual(unexpectedWrites, [], `Unexpected Payload write: ${JSON.stringify(unexpectedWrites)}`);

  await mkdir(proofDir, { recursive: true });
  const screenshotPath = resolve(proofDir, 'admin-unsaved-draft.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const result = {
    viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio, fontStatus: document.fonts.status, optimaAvailable: document.fonts.check('10px OptimaLTStd') })),
    status: 'passed-read-only-live-admin-draft',
    viewerUrl: page.url(),
    targetKey: key,
    selectedEditorKey,
    persistedEditorTextBeforeDraft: textBeforeDraft,
    testDraft: oneLineEnglishDraft,
    geometry,
    payloadWrites: unexpectedWrites,
    screenshotPath,
  };
  await writeFile(resolve(proofDir, 'admin-unsaved-draft-verification.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });

  const cancel = page.getByRole('button', { name: /Cancelar|Cancel/i }).last();
  if (await cancel.count()) await cancel.click();
  assert.deepEqual(unexpectedWrites, [], 'Cancel triggered an unexpected Payload write.');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
