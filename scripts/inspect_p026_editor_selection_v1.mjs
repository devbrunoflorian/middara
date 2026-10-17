#!/usr/bin/env node
/** Open p.26 Admin Editor selections in read-only mode and record their text. */
import { chromium } from 'playwright';

const keys = [
  'page_26_block_52',
  'page_26_unit_p26-block-478-font-size-9pt-unit-00__pt-BR',
  'page_26_unit_p26-block-478-font-size-10pt-unit-01__pt-BR',
  'page_26_unit_p26-block-478-font-size-9pt-unit-02__pt-BR',
  'page_26_unit_p26-block-478-font-size-10pt-unit-03__pt-BR',
];
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => route.request().method() === 'GET'
    ? route.continue() : route.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.page-input');
  await page.locator('input.page-input').fill('26');
  await page.locator('input.page-input').press('Enter');
  await page.waitForTimeout(800);
  await page.locator('select.language-select').selectOption('pt-BR');
  await page.waitForTimeout(500);
  await page.locator('button[title="Enter Admin"]').click();
  await page.waitForSelector('.app-container.admin-mode');
  const results = [];
  for (const key of keys) {
    const target = page.locator(`[data-editable-unit-key="${key}"]`).first();
    if (await target.count() === 0) {
      results.push({ key, found: false });
      continue;
    }
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    await target.click({ force: true, position: { x: Math.min(box.width / 2, Math.max(1, box.width - 1)), y: Math.min(box.height / 2, Math.max(1, box.height - 1)) } });
    try {
      await page.waitForFunction(value => {
        const element = [...document.querySelectorAll('[data-editable-unit-key]')].find(node => node.getAttribute('data-editable-unit-key') === value);
        return !!element && (element.matches('.credit-field-selected, .block-selected, .span-selected') || !!element.closest('.credit-field-selected, .block-selected, .span-selected'));
      }, key, { timeout: 5000 });
    } catch {
      results.push({ key, found: true, selected: false });
      continue;
    }
    await page.getByRole('button', { name: '📝 Edit Text' }).click();
    const editor = page.locator('.rse-edit-text textarea').last();
    await editor.waitFor({ state: 'visible' });
    results.push({ key, found: true, selectedText: (await editor.inputValue()).replace(/\s+/gu, ' ').trim(), editable: await editor.evaluate(element => !element.disabled && !element.readOnly) });
    await page.getByRole('button', { name: /^\s*Cancelar\s*$/ }).last().click();
    await page.waitForFunction(() => document.querySelectorAll('.rse-edit-text textarea').length === 0);
  }
  await page.locator('.rse-close').click();
  console.log(JSON.stringify({ page: 26, results }, null, 2));
} finally {
  await browser.close();
}
