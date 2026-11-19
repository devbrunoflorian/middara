#!/usr/bin/env node
/** Capture a page background and component artwork with editable prose hidden. */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const options = {
    page: undefined,
    language: 'pt-BR',
    baseUrl: 'http://127.0.0.1:8080',
    output: undefined,
    executablePath: process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help' || key === '-h') {
      console.log('Usage: node scripts/capture_textless_page.mjs --page 74 [--language pt-BR|en] [--output tmp/page-074-textless.png] [--base-url http://127.0.0.1:8080]');
      process.exit(0);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + key);
    const name = ({ '--page': 'page', '--language': 'language', '--base-url': 'baseUrl', '--output': 'output', '--browser': 'executablePath' })[key];
    if (!name) throw new Error('Unknown option: ' + key);
    options[name] = name === 'page' ? Number(value) : value;
    index += 1;
  }
  if (!Number.isInteger(options.page) || options.page < 1 || options.page > 102) throw new Error('Use --page with a number from 1 to 102.');
  if (!['en', 'pt-BR'].includes(options.language)) throw new Error('Use --language en or --language pt-BR.');
  options.output = resolve(options.output ?? ('tmp/page-' + String(options.page).padStart(3, '0') + '-textless-' + options.language + '.png'));
  return options;
}

const options = parseArgs(process.argv.slice(2));
const browser = await chromium.launch({ headless: true, ...(options.executablePath ? { executablePath: options.executablePath } : {}) });
try {
  // Keep the full square page visible and large enough to inspect without
  // capturing the viewer's sidebars or a clipped 200% zoom viewport.
  const context = await browser.newContext({ viewport: { width: 1800, height: 1800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const response = await page.goto(options.baseUrl, { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) throw new Error('Viewer returned ' + (response?.status() ?? 'no response') + ' at ' + options.baseUrl);
  await page.waitForFunction(() => !!document.querySelector('input.page-input') && !!document.querySelector('.page-container img'));

  const pageInput = page.locator('input.page-input');
  await pageInput.fill(String(options.page));
  await pageInput.press('Enter');
  const paddedPage = String(options.page).padStart(3, '0');
  await page.waitForFunction(expected => {
    const input = document.querySelector('input.page-input');
    const image = document.querySelector('.page-container > img');
    return input?.value === String(Number(expected))
      && image?.getAttribute('src')?.includes('page_' + expected + '/background.webp')
      && image.complete && image.naturalWidth > 0;
  }, paddedPage, { timeout: 60000 });

  await page.locator('.zoom-group button').nth(2).click();
  await page.waitForFunction(() => document.querySelector('.zoom-level')?.textContent?.trim() === '100%');

  const localeLabel = options.language === 'pt-BR' ? 'Português (Brasil)' : 'English';
  const localeButton = page.locator('.language-toggle button[aria-label="' + localeLabel + '"]');
  await localeButton.click();
  await page.waitForFunction(expected => document.querySelector('.language-toggle button[aria-pressed="true"]')?.getAttribute('aria-label') === expected, localeLabel);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.page-container img')).every(image => image.complete && image.naturalWidth > 0));

  await page.addStyleTag({ content: [
    '.page-container .block-container,',
    '.page-container .contents-label-field,',
    '.page-container .credit-field,',
    '.page-container .admin-created-translation-block,',
    '.page-container [data-source-inline-hit-target],',
    '.page-container img.inline-semantic-symbol,',
    '.page-container svg.inline-semantic-symbol,',
    '.page-container img[src*="fidelity-overlay-inline-"],',
    '.page-container [data-source-inline-semantic],',
    '.page-container [data-source-inline-placeholder] {',
    '  visibility: hidden !important;',
    '}',
    '.page-container .span-selected,',
    '.page-container .proposal-review-highlight { outline: none !important; box-shadow: none !important; }',
  ].join('\n') });
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  await page.mouse.move(1580, 1380);
  await mkdir(dirname(options.output), { recursive: true });
  await page.locator('.page-container').screenshot({ path: options.output, animations: 'disabled' });
  console.log(JSON.stringify({ page: options.page, language: options.language, output: options.output, hidden: 'editable prose and inline text symbols', preserved: 'page background and component artwork' }, null, 2));
} finally {
  await browser.close();
}
