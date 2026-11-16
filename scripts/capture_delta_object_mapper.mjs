/**
 * Read-only, fixed-viewport capture for the post-detection object mapper.
 * Captures page pixels plus runtime DOM candidates without changing page
 * styles, inserting markers, entering Admin, or sending write-like requests.
 */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const APP_URL = process.env.RULEBOOK_APP_URL ?? 'http://localhost:8080/';
const ALLOWED_ORIGIN = 'http://localhost:8080';
const OUTPUT_DIR = path.resolve(process.env.DELTA_OBJECT_OUTPUT
  ?? 'docs/project-progress/evidence/2026-10-08-delta-object-association-mapper');
const VIEWPORT = { width: 1600, height: 947 };
const DEVICE_SCALE_FACTOR = 1;
const HOLDOUT_SELECTION = path.join(OUTPUT_DIR, 'holdout-selection.json');
const HOLDOUT_SEED = 'middara-object-mapper-holdout-v1';
const EXCLUDED_PILOT_PAGES = new Set([49, 56, 67]);
const HOLDOUT_PAGES = Array.from({ length: 54 }, (_, index) => index + 49)
  .filter(pageNumber => !EXCLUDED_PILOT_PAGES.has(pageNumber))
  .sort((left, right) => {
    const hashLeft = createHash('sha256').update(`${HOLDOUT_SEED}:${left}`).digest('hex');
    const hashRight = createHash('sha256').update(`${HOLDOUT_SEED}:${right}`).digest('hex');
    return hashLeft.localeCompare(hashRight);
  })
  .slice(0, 5);
const PILOT_METADATA_PAGES = [49, 56, 67];

if (new URL(APP_URL).origin !== ALLOWED_ORIGIN) {
  throw new Error(`Capture URL must stay on the authorized viewer origin ${ALLOWED_ORIGIN}`);
}

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const blockedMutations = [];
const captures = [];
const objectManifests = [];

async function stablePage(page, pageNumber) {
  await page.waitForFunction(expected => {
    const id = String(expected).padStart(3, '0');
    const input = document.querySelector('input.page-input');
    const background = document.querySelector('.page-container > img');
    return input?.value === String(expected)
      && !document.querySelector('.loading-spinner')
      && background?.getAttribute('src')?.includes(`page_${id}/background.webp`)
      && background.complete && background.naturalWidth > 0;
  }, pageNumber, { timeout: 60_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.page-container img')]
    .every(image => image.complete && image.naturalWidth > 0), null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const element = document.querySelector('.page-container');
    return !!element && element.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.target === element)
      .every(animation => animation.playState !== 'running');
  }, null, { timeout: 15_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('.page-container');
    return !!element && element.getBoundingClientRect().width > 0;
  });
}

function waitForNetworkQuiet(page) {
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

function readRuntimeObjects(page, pageNumber) {
  return page.locator('.page-container').evaluate((container, pageNumber) => {
    const pageRect = container.getBoundingClientRect();
    const referenceAttributes = [
      'data-source-line-id', 'data-source-span', 'data-source-inline-semantic',
      'data-source-inline-placeholder', 'data-source-compound', 'data-source-geometry',
      'data-source-covered-by', 'data-source-covered-span', 'data-source-overlay-advance',
      'data-symbol-id', 'data-overlay-id', 'data-asset-id',
    ];
    const cssPath = element => {
      const parts = [];
      let current = element;
      while (current && current !== container && parts.length < 8) {
        let part = current.tagName.toLowerCase();
        if (current.id) {
          part += `#${current.id}`;
          parts.unshift(part);
          break;
        }
        const classes = [...current.classList].slice(0, 2);
        if (classes.length) part += `.${classes.join('.')}`;
        const parent = current.parentElement;
        if (parent) {
          const sameTag = [...parent.children].filter(child => child.tagName === current.tagName);
          if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return `.page-container>${parts.join('>')}`;
    };
    const rectRecord = rect => ({
      x: rect.left - pageRect.left,
      y: rect.top - pageRect.top,
      width: rect.width,
      height: rect.height,
    });
    const attrsFor = element => Object.fromEntries([...element.attributes]
      .filter(attribute => attribute.name.startsWith('data-') || ['id', 'class', 'role', 'aria-label'].includes(attribute.name))
      .map(attribute => [attribute.name, attribute.value]));
    const refsFor = element => {
      const refs = [];
      let current = element;
      while (current && container.contains(current)) {
        const refsAtNode = Object.fromEntries(referenceAttributes
          .filter(name => current.hasAttribute(name))
          .map(name => [name, current.getAttribute(name)]));
        if (Object.keys(refsAtNode).length) refs.push({ selector: cssPath(current), attrs: refsAtNode });
        if (current === container) break;
        current = current.parentElement;
      }
      return refs;
    };
    const styleFor = element => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        letterSpacing: style.letterSpacing,
        color: style.color,
        fill: style.fill,
        stroke: style.stroke,
        opacity: style.opacity,
        transform: style.transform,
        backgroundColor: style.backgroundColor,
      };
    };

    const elements = [];
    const nodes = [...container.querySelectorAll('*')];
    for (let index = 0; index < nodes.length; index += 1) {
      const element = nodes[index];
      const tag = element.tagName.toLowerCase();
      const attrs = attrsFor(element);
      const hasReference = Object.keys(attrs).some(name => name.startsWith('data-'));
      if (!['img', 'svg', 'canvas'].includes(tag) && !hasReference && element.getAttribute('role') !== 'img') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || getComputedStyle(element).display === 'none') continue;
      let type = tag === 'img' ? 'RASTER_IMAGE' : tag === 'svg' ? 'SVG_OVERLAY' : 'DOM_ELEMENT';
      if (attrs['data-symbol-id'] || attrs['data-source-inline-semantic']) type = 'INLINE_SYMBOL';
      if (attrs['data-source-geometry'] === 'pdf-coordinates') type = 'TEXT_LINE';
      const explicit = referenceAttributes.some(name => attrs[name] !== undefined);
      elements.push({
        id: explicit ? `viewer:p${pageNumber}:${referenceAttributes.filter(name => attrs[name] !== undefined).map(name => `${name}=${attrs[name]}`).join('|')}` : `viewer:p${pageNumber}:node:${index}`,
        idPersistence: explicit ? 'EXPLICIT_ATTRIBUTE' : 'CAPTURE_LOCAL_NODE_ORDER',
        objectType: type,
        tag,
        selector: cssPath(element),
        bboxCssPx: rectRecord(rect),
        attrs,
        refs: refsFor(element),
        text: (element.getAttribute('aria-label') ?? '').slice(0, 240),
        src: element instanceof HTMLImageElement ? new URL(element.getAttribute('src'), location.href).pathname : (element.getAttribute('href') ?? null),
        naturalSize: element instanceof HTMLImageElement ? { width: element.naturalWidth, height: element.naturalHeight } : null,
        computedStyle: styleFor(element),
      });
    }

    const textNodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) {
      const text = textNode.nodeValue ?? '';
      if (!text.trim()) continue;
      const parent = textNode.parentElement;
      if (!parent || getComputedStyle(parent).display === 'none') continue;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const boxes = [...range.getClientRects()]
        .filter(rect => rect.width > 0 && rect.height > 0)
        .map(rectRecord);
      if (!boxes.length) continue;
      const refs = refsFor(parent);
      const sourceLine = refs.find(ref => ref.attrs['data-source-line-id'])?.attrs['data-source-line-id'] ?? null;
      const sourceSpan = refs.find(ref => ref.attrs['data-source-span'])?.attrs['data-source-span'] ?? null;
      const explicit = !!(sourceLine || sourceSpan);
      const ordinal = textNodes.length;
      textNodes.push({
        id: explicit
          ? `viewer:p${pageNumber}:text:${sourceSpan ?? sourceLine}`
          : `viewer:p${pageNumber}:text-node:${ordinal}`,
        idPersistence: explicit ? 'EXPLICIT_ATTRIBUTE' : 'CAPTURE_LOCAL_TEXT_NODE_ORDER',
        objectType: sourceSpan ? 'RICH_TEXT_RUN' : sourceLine ? 'TEXT_LINE' : 'TEXT_RUN',
        selector: cssPath(parent),
        bboxCssPx: boxes,
        text: text.trim().slice(0, 500),
        sourceLineId: sourceLine,
        sourceSpanKey: sourceSpan,
        refs,
        computedStyle: styleFor(parent),
      });
    }

    return {
      page: pageNumber,
      coordinateSpace: 'page-local CSS px; origin=top-left of .page-container',
      pageRectCssPx: { width: pageRect.width, height: pageRect.height },
      devicePixelRatio: window.devicePixelRatio,
      objects: elements,
      textNodes,
    };
  }, pageNumber);
}

async function capturePage(page, pageNumber, kind) {
  const input = page.locator('input.page-input');
  const network = waitForNetworkQuiet(page);
  try {
    await input.fill(String(pageNumber));
    await input.press('Enter');
    await stablePage(page, pageNumber);
    await network.wait();
    await stablePage(page, pageNumber);
  } finally {
    network.dispose();
  }

  const badge = (await page.locator('.dev-environment-indicator').innerText()).replace(/\s+/gu, ' ').trim();
  if (!badge.includes('WEB localhost:8080') || !badge.includes('API http://localhost:3000') || !badge.includes('en') || !badge.includes('viewer')) {
    throw new Error(`Unexpected viewer state on p${pageNumber}: ${badge}`);
  }
  const zoom = (await page.locator('.zoom-level').innerText()).trim();
  if (zoom !== '100%') throw new Error(`Expected fixed 100% fit multiplier, got ${zoom}`);

  const pageId = String(pageNumber).padStart(3, '0');
  const filename = `${kind}-viewer-en-page-${pageId}.png`;
  const filePath = path.join(OUTPUT_DIR, filename);
  await page.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1);
  await page.locator('.page-container').screenshot({ path: filePath, type: 'png', scale: 'css', animations: 'disabled', caret: 'hide' });
  const png = await readFile(filePath);
  const pngSize = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const runtimeObjects = await readRuntimeObjects(page, pageNumber);
  if (runtimeObjects.devicePixelRatio !== DEVICE_SCALE_FACTOR || pngSize.width !== 819 || pngSize.height !== 819) {
    throw new Error(`Unexpected page capture p${pageNumber}: ${JSON.stringify({ pngSize, dpr: runtimeObjects.devicePixelRatio })}`);
  }
  const objectsPath = `${kind}-viewer-objects-page-${pageId}.json`;
  await writeFile(path.join(OUTPUT_DIR, objectsPath), `${JSON.stringify(runtimeObjects, null, 2)}\n`, 'utf8');
  const entry = {
    page: pageNumber,
    state: 'current',
    kind,
    file: filename,
    sha256: createHash('sha256').update(png).digest('hex'),
    imagePx: pngSize,
    viewport: VIEWPORT,
    devicePixelRatio: runtimeObjects.devicePixelRatio,
    zoomMultiplier: zoom,
    badge,
    cssRect: runtimeObjects.pageRectCssPx,
    objectManifest: objectsPath,
    objectManifestSha256: createHash('sha256').update(JSON.stringify(runtimeObjects)).digest('hex'),
  };
  captures.push(entry);
  objectManifests.push({ page: pageNumber, kind, file: objectsPath, sha256: entry.objectManifestSha256 });
}

await mkdir(OUTPUT_DIR, { recursive: true });
const selection = {
  schema: 'delta-object-mapper-holdout-selection/v1',
  status: 'selected-before-new-detector-run',
  method: 'Sort pages 49-102 excluding only pilot pages 49/56/67 by SHA-256 of seed + page number; take first five. No detector result or annotation is used to rank the five.',
  seed: HOLDOUT_SEED,
  excludedPilotPages: [...EXCLUDED_PILOT_PAGES].sort((a, b) => a - b),
  selectedPages: HOLDOUT_PAGES,
  sha256Rank: HOLDOUT_PAGES.map(pageNumber => ({
    page: pageNumber,
    rankHash: createHash('sha256').update(`${HOLDOUT_SEED}:${pageNumber}`).digest('hex'),
  })),
  requirementCheckAfterDetection: 'At least one selected page must have zero retained structural regions and at least two must have one or more; if not, report the holdout as insufficient rather than changing the sample page-by-page.',
};
await writeFile(HOLDOUT_SELECTION, `${JSON.stringify(selection, null, 2)}\n`, 'utf8');
const browserPath = process.env.RULEBOOK_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: browserPath });
} catch (error) {
  if (process.env.RULEBOOK_CHROME_PATH) throw error;
  browser = await chromium.launch({ headless: true });
}

try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR, locale: 'en-US', colorScheme: 'light' });
  await context.route('**/*', async route => {
    const request = route.request();
    if (!safeMethods.has(request.method())) {
      blockedMutations.push({ method: request.method(), url: request.url() });
      await route.abort();
      return;
    }
    await route.continue();
  });
  try {
    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('select.language-select').selectOption('en');
    await page.getByRole('button', { name: 'Fit to Screen' }).click();
    await page.waitForFunction(() => document.querySelector('.zoom-level')?.textContent?.trim() === '100%');
    for (const pageNumber of PILOT_METADATA_PAGES) await capturePage(page, pageNumber, 'pilot-metadata');
    for (const pageNumber of HOLDOUT_PAGES) await capturePage(page, pageNumber, 'holdout');
  } finally {
    await context.close();
  }
  if (blockedMutations.length) throw new Error(`Unexpected write-like requests blocked: ${JSON.stringify(blockedMutations)}`);

  const manifest = {
    appUrl: APP_URL,
    apiOrigin: 'http://localhost:3000',
    mode: 'viewer',
    locale: 'en',
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    capture: 'page-only PNG plus read-only DOM metadata; no DOM/style injection or visual instrumentation',
    networkPolicy: 'GET/HEAD/OPTIONS only; write-like requests blocked',
    capturedAt: new Date().toISOString(),
    captures,
    objectManifests,
    blockedMutations,
  };
  await writeFile(path.join(OUTPUT_DIR, 'object-mapper-capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputDir: OUTPUT_DIR, holdoutPages: HOLDOUT_PAGES, pilotMetadataPages: PILOT_METADATA_PAGES, captures: captures.length, objectManifests: objectManifests.length, blockedMutations }, null, 2));
} finally {
  await browser.close();
}
