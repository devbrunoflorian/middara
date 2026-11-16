/**
 * Deterministic EN viewer captures for the SOURCE delta pilot.
 * This script reads the live local viewer and writes page-only PNG evidence.
 * It never enters Admin or submits mutations. P67 historical mode serves one
 * exact old overlay sidecar from git as an isolated visual control.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const APP_URL = process.env.RULEBOOK_APP_URL ?? 'http://localhost:8080/';
const ALLOWED_ORIGIN = 'http://localhost:8080';
const OUTPUT_DIR = path.resolve(process.env.DELTA_PILOT_OUTPUT
  ?? 'docs/project-progress/evidence/2026-10-08-delta-driven-viewer-capture');
const PDF_PATH = process.env.RULEBOOK_SOURCE_PDF
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const PAGES = [49, 51, 56, 67, 87];
// With the viewer's 40px page padding and 48px fit safety margin, a 947px
// viewport height yields an 819px page-stage fit slot (exact CSS pixel grid).
const VIEWPORT = { width: 1600, height: 947 };
const DEVICE_SCALE_FACTOR = 1;
const HISTORICAL_REVISION = 'b5aac5dd5af42502280bdbd7f11abc0438861597';
const HISTORICAL_SIDECAR = 'apps/web/public/pages/page_067/fidelity_overlays.json';
const CURRENT_P67_SIDECAR = 'apps/web/public/pages/page_067/fidelity_overlays.json';
const CURRENT_P67_PILL_ASSET = 'apps/web/public/pages/page_067/per-encounter-pill.svg';
const SIDECAR_URL = `${ALLOWED_ORIGIN}/pages/page_067/fidelity_overlays.json`;

if (new URL(APP_URL).origin !== ALLOWED_ORIGIN) {
  throw new Error(`Capture URL must stay on the authorized viewer origin ${ALLOWED_ORIGIN}`);
}

const historicalSidecarText = execFileSync('git', [
  'show', `${HISTORICAL_REVISION}:${HISTORICAL_SIDECAR}`,
], { encoding: 'utf8' });
const historicalSidecar = JSON.parse(historicalSidecarText);
if ((historicalSidecar.overlays ?? []).some(overlay => overlay.region === 'per-encounter-pill-background')) {
  throw new Error('Historical p67 fixture unexpectedly contains the PER ENCOUNTER capsule');
}

await mkdir(OUTPUT_DIR, { recursive: true });

const executablePath = process.env.RULEBOOK_CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath });
} catch (error) {
  if (process.env.RULEBOOK_CHROME_PATH) throw error;
  browser = await chromium.launch({ headless: true });
}

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const blockedMutations = [];
const captures = [];

async function createViewerContext({ historicalP67 = false } = {}) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    locale: 'en-US',
    colorScheme: 'light',
  });
  await context.route('**/*', async route => {
    const request = route.request();
    if (!safeMethods.has(request.method())) {
      blockedMutations.push({ method: request.method(), url: request.url() });
      await route.abort();
      return;
    }
    if (historicalP67 && request.url() === SIDECAR_URL) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: historicalSidecarText,
      });
      return;
    }
    await route.continue();
  });
  return context;
}

async function waitForStablePage(page, pageNumber) {
  await page.waitForFunction(expected => {
    const id = String(expected).padStart(3, '0');
    const input = document.querySelector('input.page-input');
    const background = document.querySelector('.page-container > img');
    return input?.value === String(expected)
      && !document.querySelector('.loading-spinner')
      && background?.getAttribute('src')?.includes(`page_${id}/background.webp`)
      && background.complete && background.naturalWidth > 0;
  }, pageNumber, { timeout: 60_000 });

  await page.waitForFunction(() =>
    [...document.querySelectorAll('.page-container img')]
      .every(image => image.complete && image.naturalWidth > 0),
  null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const element = document.querySelector('.page-container');
    return !!element && element.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.target === element)
      .every(animation => animation.playState !== 'running');
  }, null, { timeout: 15_000 });

  const stable = await page.locator('.page-container').evaluate(async element => {
    const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    let previous = null;
    let stableFrames = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      await waitFrame();
      const rect = element.getBoundingClientRect();
      const current = [rect.x, rect.y, rect.width, rect.height];
      if (previous && current.every((value, index) => Math.abs(value - previous[index]) < 0.01)) {
        stableFrames += 1;
        if (stableFrames >= 3) return current;
      } else {
        stableFrames = 0;
      }
      previous = current;
    }
    throw new Error('Page geometry did not settle within 120 animation frames');
  });
  return stable;
}

function trackNetworkQuiet(page) {
  let lastActivity = Date.now();
  const markActivity = () => { lastActivity = Date.now(); };
  page.on('request', markActivity);
  page.on('requestfinished', markActivity);
  page.on('requestfailed', markActivity);
  return {
    async wait(quietMs = 750, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await page.waitForTimeout(50);
        if (Date.now() - lastActivity >= quietMs) return;
      }
      throw new Error(`Page requests did not become quiet for ${quietMs}ms within ${timeoutMs}ms`);
    },
    dispose() {
      page.off('request', markActivity);
      page.off('requestfinished', markActivity);
      page.off('requestfailed', markActivity);
    },
  };
}

async function capturePage(page, pageNumber, { historicalP67 = false } = {}) {
  const pageId = String(pageNumber).padStart(3, '0');
  const input = page.locator('input.page-input');
  const network = trackNetworkQuiet(page);
  try {
    await input.fill(String(pageNumber));
    await input.press('Enter');
    await waitForStablePage(page, pageNumber);
    await network.wait();
    await waitForStablePage(page, pageNumber);
  } finally {
    network.dispose();
  }

  const badge = (await page.locator('.dev-environment-indicator').innerText()).replace(/\s+/gu, ' ').trim();
  if (!badge.includes('WEB localhost:8080')
      || !badge.includes('API http://localhost:3000')
      || !badge.includes('en')
      || !badge.includes('viewer')) {
    throw new Error(`Unexpected viewer state for p${pageId}: ${badge}`);
  }
  const zoom = (await page.locator('.zoom-level').innerText()).trim();
  if (zoom !== '100%') throw new Error(`Expected the fixed 100% fit multiplier, got ${zoom}`);

  const filename = historicalP67
    ? `viewer-en-page-${pageId}-historical-no-pill.png`
    : `viewer-en-page-${pageId}.png`;
  const filePath = path.join(OUTPUT_DIR, filename);
  await page.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1);
  await page.locator('.page-container').screenshot({
    path: filePath,
    type: 'png',
    scale: 'css',
    animations: 'disabled',
    caret: 'hide',
  });

  const dimensions = await page.locator('.page-container').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const images = [...element.querySelectorAll('img')].map(image => ({
      src: new URL(image.getAttribute('src'), location.href).pathname,
      width: image.naturalWidth,
      height: image.naturalHeight,
      complete: image.complete,
    }));
    const fontFaces = [...document.fonts].map(face => ({ family: face.family, status: face.status }));
    return {
      cssRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      devicePixelRatio: window.devicePixelRatio,
      images,
      fontFaces,
      fontSetStatus: document.fonts.status,
      pageInput: document.querySelector('input.page-input')?.value ?? null,
      currentSourceBackground: element.querySelector(':scope > img')?.getAttribute('src') ?? null,
    };
  });
  const png = await readFile(filePath);
  const pngWidth = png.readUInt32BE(16);
  const pngHeight = png.readUInt32BE(20);
  if (pngWidth !== pngHeight) {
    throw new Error(`Expected square page image for p${pageId}; got ${pngWidth}x${pngHeight}, CSS rect=${JSON.stringify(dimensions.cssRect)}`);
  }
  if (dimensions.devicePixelRatio !== DEVICE_SCALE_FACTOR) {
    throw new Error(`Unexpected DPR on p${pageId}: ${dimensions.devicePixelRatio}`);
  }
  const hasPill = dimensions.images.some(image => image.src.endsWith('/page_067/per-encounter-pill.svg'));
  if (pageNumber === 67 && historicalP67 && hasPill) {
    throw new Error('Historical p67 screenshot unexpectedly loaded the capsule overlay');
  }
  if (pageNumber === 67 && !historicalP67 && !hasPill) {
    throw new Error('Current p67 screenshot did not load the capsule overlay');
  }

  captures.push({
    page: pageNumber,
    state: historicalP67 ? 'historical-no-pill' : 'current',
    file: filename,
    sha256: createHash('sha256').update(png).digest('hex'),
    imagePx: { width: pngWidth, height: pngHeight },
    viewport: VIEWPORT,
    deviceScaleFactor: dimensions.devicePixelRatio,
    zoomMultiplier: zoom,
    badge,
    ...dimensions,
  });
}

try {
  const appCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const appVersion = browser.version();
  const context = await createViewerContext();
  try {
    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    const language = page.locator('select.language-select');
    await language.selectOption('en');
    await page.getByRole('button', { name: 'Fit to Screen' }).click();
    await page.waitForFunction(() => document.querySelector('.zoom-level')?.textContent?.trim() === '100%');
    for (const pageNumber of PAGES) await capturePage(page, pageNumber);
  } finally {
    await context.close();
  }

  const historicalContext = await createViewerContext({ historicalP67: true });
  try {
    const page = await historicalContext.newPage();
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('select.language-select').selectOption('en');
    await page.getByRole('button', { name: 'Fit to Screen' }).click();
    await page.waitForFunction(() => document.querySelector('.zoom-level')?.textContent?.trim() === '100%');
    await capturePage(page, 67, { historicalP67: true });
  } finally {
    await historicalContext.close();
  }

  if (blockedMutations.length) {
    throw new Error(`Unexpected write-like request(s) were blocked: ${JSON.stringify(blockedMutations)}`);
  }

  const manifest = {
    appUrl: APP_URL,
    apiOrigin: 'http://localhost:3000',
    appCommit,
    appWorktreeDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
    browser: `Chromium ${appVersion}`,
    mode: 'viewer',
    locale: 'en',
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    zoom: 'Fit to Screen button; fixed 100% fit multiplier at fixed viewport',
    capture: 'Playwright locator screenshot of .page-container only; PNG scale=css',
    waits: ['networkidle at initial app navigation', 'page data/background loaded', 'all page img assets loaded', 'document.fonts.ready', 'page requests quiet for 750ms after selection', 'page rectangle stable for 3 animation frames before and after request quiet'],
    api: 'real local API; read-only GET/HEAD/OPTIONS allowed, write-like methods blocked',
    browserStorage: 'fresh isolated contexts; no Admin/edit interaction',
    historicalP67: {
      sidecarPath: HISTORICAL_SIDECAR,
      sidecarRevision: HISTORICAL_REVISION,
      sidecarSha256: execFileSync('git', ['show', `${HISTORICAL_REVISION}:${HISTORICAL_SIDECAR}`], { encoding: 'buffer' }),
      method: 'isolated network fixture for this single sidecar response; all other local viewer/API requests unchanged',
    },
    currentP67Files: {
      sidecarPath: CURRENT_P67_SIDECAR,
      sidecarSha256: createHash('sha256').update(await readFile(CURRENT_P67_SIDECAR)).digest('hex'),
      pillAssetPath: CURRENT_P67_PILL_ASSET,
      pillAssetSha256: createHash('sha256').update(await readFile(CURRENT_P67_PILL_ASSET)).digest('hex'),
    },
    pdfPath: PDF_PATH,
    capturedAt: new Date().toISOString(),
    captures,
  };
  manifest.historicalP67.sidecarSha256 = createHash('sha256')
    .update(manifest.historicalP67.sidecarSha256).digest('hex');
  await writeFile(path.join(OUTPUT_DIR, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    outputDir: OUTPUT_DIR,
    browser: manifest.browser,
    viewport: VIEWPORT,
    captures: captures.map(({ page, state, file, imagePx, cssRect, devicePixelRatio, badge }) => ({
      page, state, file, imagePx, cssRect, devicePixelRatio, badge,
    })),
    blockedMutations,
  }, null, 2));
} finally {
  await browser.close();
}
