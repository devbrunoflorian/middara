import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const outDir = resolve('output/proofs/translation-readiness-2026-10-14/native-vector-mask-p065-proof-v4/viewport-diagnostic');
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto('http://localhost:8080/symbol-integrity-lab.html?page=65&patch=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const image = document.querySelector('.page-container img');
    return Boolean(image?.complete && image.naturalWidth > 0);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.getByLabel('Idioma da prova').selectOption('en');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const metrics = await page.evaluate(() => {
    const container = document.querySelector('.page-container');
    const stage = document.querySelector('.page-stage');
    const allBlocks = [...document.querySelectorAll('.block-container[data-editable-unit-key]')].map((node) => ({
      key: node.getAttribute('data-editable-unit-key'),
      text: (node.textContent || '').slice(0, 120),
      rect: (() => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; })(),
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      overflow: getComputedStyle(node).overflow,
    }));
    const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      document: { scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, scrollTop: scrollY },
      container: { rect: rect(container), scrollHeight: container.scrollHeight, clientHeight: container.clientHeight, overflow: getComputedStyle(container).overflow },
      stage: { rect: rect(stage), scrollHeight: stage.scrollHeight, clientHeight: stage.clientHeight, scrollTop: stage.scrollTop, overflow: getComputedStyle(stage).overflow },
      blocks: allBlocks,
      semanticImages: [...document.querySelectorAll('.page-container img.inline-semantic-symbol')].map((node) => ({
        symbolId: node.getAttribute('data-symbol-id'), src: node.getAttribute('src'),
        rect: rect(node), alt: node.getAttribute('alt'),
      })),
      sourceGeometrySymbols: [...document.querySelectorAll('.page-container svg[data-source-symbol-id]')].map((node) => ({
        symbolId: node.getAttribute('data-source-symbol-id'), sourceBbox: node.getAttribute('data-source-bbox'),
        rect: rect(node), asset: [...node.querySelectorAll('image')].map((image) => image.getAttribute('href')),
      })),
      block5Nodes: (() => {
        const block = document.querySelector('.block-container[data-editable-unit-key="page_65_block_2"]');
        return block ? [...block.querySelectorAll('*')].map((node) => ({
          tag: node.tagName, text: (node.textContent || '').slice(0, 80), className: String(node.className || ''),
          rect: rect(node), src: node.getAttribute('src'), symbolId: node.getAttribute('data-symbol-id'),
          symbolKey: node.getAttribute('data-source-appearance-key'),
        })) : [];
      })(),
    };
  });
  await writeFile(resolve(outDir, 'layout-metrics.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: resolve(outDir, 'viewport-top.png') });
  await page.locator('.page-stage').evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.screenshot({ path: resolve(outDir, 'viewport-stage-bottom.png') });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.screenshot({ path: resolve(outDir, 'viewport-document-bottom.png') });
  console.log(JSON.stringify({ outDir, viewport: metrics.viewport, blockCount: metrics.blocks.length }));
  await page.close();
  await context.close();
} finally {
  await browser.close();
}
