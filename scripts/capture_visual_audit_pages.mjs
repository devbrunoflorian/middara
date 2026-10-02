/** Capture the English viewer at Fit to Screen without loading saved translations. */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function optionsFromArgs(args) {
  const options = {
    start: 1,
    end: 102,
    url: process.env.RULEBOOK_APP_URL ?? 'http://127.0.0.1:8080/',
    output: 'tmp/ghost-audit/app-captures',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--start') options.start = Number(args[++i]);
    else if (arg === '--end') options.end = Number(args[++i]);
    else if (arg === '--url') options.url = args[++i];
    else if (arg === '--output') options.output = args[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.start) || !Number.isInteger(options.end)
      || options.start < 1 || options.end > 102 || options.start > options.end) {
    throw new Error('--start/--end must be a valid inclusive range from 1 to 102');
  }
  return options;
}

const options = optionsFromArgs(process.argv.slice(2));
const outputDir = path.resolve(options.output);
await mkdir(outputDir, { recursive: true });

// Prefer the installed stable Chrome on Windows; Playwright's managed Chromium
// remains the fallback on machines where it is installed.
const executablePath = process.env.RULEBOOK_CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath });
} catch (error) {
  if (process.env.RULEBOOK_CHROME_PATH) throw error;
  browser = await chromium.launch({ headless: true });
}

try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1400 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Fidelity review does not need translations or user drafts. A fresh context
  // has empty storage, and this route prevents the viewer from querying Payload.
  await page.route('**/api/translations**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ docs: [], totalDocs: 0 }),
  }));

  await page.goto(options.url, { waitUntil: 'networkidle' });
  await page.getByTitle('Fit to Screen').click();
  const captured = [];

  for (let number = options.start; number <= options.end; number += 1) {
    const pageId = String(number).padStart(3, '0');
    const input = page.locator('input.page-input');
    await input.fill(String(number));
    await input.press('Enter');
    await page.waitForFunction((expected) => {
      const pageInput = document.querySelector('input.page-input');
      const background = document.querySelector('.page-container img');
      const spinner = document.querySelector('.loading-spinner');
      const pageId = String(expected).padStart(3, '0');
      return pageInput?.value === String(expected)
        && !spinner
        && background?.getAttribute('src')?.includes(`page_${pageId}/background.webp`)
        && background.naturalWidth > 0;
    }, number, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);

    const imagePath = path.join(outputDir, `app-page-${pageId}.jpg`);
    await page.locator('.page-container').screenshot({
      path: imagePath,
      type: 'jpeg',
      quality: 90,
    });
    const dimensions = await page.locator('.page-container').evaluate(element => {
      const { width, height } = element.getBoundingClientRect();
      return { width: Math.round(width), height: Math.round(height) };
    });
    captured.push({ page: number, file: path.basename(imagePath), ...dimensions });
    if (number % 5 === 0 || number === options.end) {
      console.log(`Captured page ${number}/${options.end}`);
    }
  }

  const manifest = {
    appUrl: options.url,
    viewport: { width: 1600, height: 1400 },
    deviceScaleFactor: 1,
    zoom: 'Fit to Screen',
    language: 'EN',
    translationApi: 'intercepted with an empty response',
    browserStorage: 'fresh, isolated context',
    capturedAt: new Date().toISOString(),
    pages: captured,
  };
  await writeFile(path.join(outputDir, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await context.close();
} finally {
  await browser.close();
}
