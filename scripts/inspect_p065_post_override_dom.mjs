import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outDir = resolve('output/proofs/translation-readiness-2026-10-14/native-vector-mask-p065-proof-v5/dom-inspection');
await mkdir(outDir, { recursive: true });
const sidecar = JSON.parse(await readFile(resolve('output/proofs/full-symbol-integrity-2026-10-13/patches/pages/page_065/inline_elements.json'), 'utf8'));
const candidate = sidecar.elements.find((e) => e.provenance?.candidateId === 'p065-v110-112-n3');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1600 }, deviceScaleFactor: 1 });
  let apiRequests = 0;
  await context.route('**/api/**', async (route) => { apiRequests += 1; await route.abort('blockedbyclient'); });
  const page = await context.newPage();
  await page.goto('http://localhost:8080/symbol-integrity-lab.html?page=65&patch=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const img = document.querySelector('.page-container img'); return Boolean(img?.complete && img.naturalWidth); });
  await page.evaluate(() => document.fonts.ready);
  await page.getByLabel('Idioma da prova').selectOption('en');
  const options = await page.getByLabel('Bloco completo').locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, text: node.textContent || '' })));
  const option = options.find((item) => item.text.includes('· block_5 ·'));
  await page.getByLabel('Bloco completo').selectOption(option.value);
  await page.getByRole('button', { name: '📝 Edit Text', exact: true }).click();
  const textarea = page.locator('textarea:visible').first();
  const currentText = await textarea.inputValue();
  const session = () => page.getByTestId('lab-session-data').evaluate((node) => JSON.parse(node.textContent));
  await textarea.fill(`${currentText} `);
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records.length > 0);
  const rows = await session();
  const symbols = rows.records[0].segments.filter((run) => run.symbolId);
  const tokens = [...currentText.matchAll(/\[\[[^\]]+\]\]/gu)];
  const symbolIndex = symbols.findIndex((run) => run.symbolId === candidate.symbolId && run.symbolMetrics?.sourceAppearanceKey === candidate.metrics.sourceAppearanceKey);
  const token = tokens[symbolIndex];
  await textarea.fill(currentText.slice(0, token.index) + currentText.slice(token.index + token[0].length));
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar à prova', exact: true }).click();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.locator('.page-stage').evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const diagnostics = await page.locator('.page-container').evaluate((root) => {
    const info = (node) => {
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { tag: node.tagName, className: String(node.className?.baseVal ?? node.className ?? ''), text: (node.textContent || '').slice(0, 50),
        x: r.x, y: r.y, width: r.width, height: r.height, display: style.display, position: style.position,
        background: style.backgroundColor, color: style.color, border: style.border, src: node.getAttribute('src'),
        symbolId: node.getAttribute('data-source-symbol-id') || node.getAttribute('data-symbol-id'),
        sourceBbox: node.getAttribute('data-source-bbox') };
    };
    const stage = document.querySelector('.page-stage');
    const block = root.querySelector('[data-editable-unit-key="page_65_block_2"]');
    return {
      stageScrollTop: stage.scrollTop, stageScrollHeight: stage.scrollHeight, stageClientHeight: stage.clientHeight,
      semanticImages: [...root.querySelectorAll('img.inline-semantic-symbol')].map(info),
      sourceSymbolSvgs: [...root.querySelectorAll('svg[data-source-symbol-id]')].map(info),
      whiteOrFilledNodes: [...root.querySelectorAll('*')].map(info).filter((x) => x.background !== 'rgba(0, 0, 0, 0)' && x.background !== 'transparent' && x.display !== 'none'),
      blockNodes: block ? [...block.querySelectorAll('*')].map(info) : [],
      hitTests: [[500, 1470], [500, 1480], [500, 1490], [520, 1470], [520, 1480], [520, 1490]].map(([x, y]) => {
        const node = document.elementFromPoint(x, y);
        const before = node ? getComputedStyle(node, '::before') : null;
        const after = node ? getComputedStyle(node, '::after') : null;
        return { x, y, hit: node ? info(node) : null,
          before: before ? { content: before.content, display: before.display, background: before.backgroundColor, border: before.border, width: before.width, height: before.height } : null,
          after: after ? { content: after.content, display: after.display, background: after.backgroundColor, border: after.border, width: after.width, height: after.height } : null };
      }),
    };
  });
  diagnostics.apiRequests = apiRequests;
  diagnostics.candidateId = candidate.provenance.candidateId;
  await writeFile(join(outDir, 'shield-empty-dom.json'), JSON.stringify(diagnostics, null, 2));
  await page.screenshot({ path: join(outDir, 'shield-empty-viewport.png'), fullPage: false });
  console.log(JSON.stringify({ candidate: candidate.provenance.candidateId, apiRequests, semanticImages: diagnostics.semanticImages.length, sourceSymbols: diagnostics.sourceSymbolSvgs.length, whiteOrFilledNodes: diagnostics.whiteOrFilledNodes.length }));
  await page.close();
  await context.close();
} finally {
  await browser.close();
}
