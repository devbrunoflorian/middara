#!/usr/bin/env node
/** Verify the p.44 damage-redistribution proposal in the normal Admin Editor without persistence. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const proofRoot = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p044-damage-redistribution-v2');
const outputDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p044-damage-redistribution-v2-current');
const proposal = JSON.parse(await readFile(resolve(root,
  'docs/translations/proposals/page-044-damage-redistribution-example-proposal-2026-10-15-v2.json'), 'utf8'));
const snapshot = JSON.parse(await readFile(resolve(proofRoot,
  'snapshot/snapshot-p044-damage-redistribution-v2-export.json'), 'utf8'));
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const digest = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const candidates = snapshot.translations ?? [];
assert.equal(candidates.length, 2, 'Expected only the two p.44 proposal units');
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, 2, 'Proposal keys must be unique');
assert.deepEqual(candidates.map(candidate => candidate.spanKey), proposal.candidates.map(candidate => candidate.spanKey));

const sourceTexts = {
  body: proposal.sourceText.body,
  example: proposal.sourceText.example,
};
const targetTexts = {
  body: proposal.proposalText.body,
  example: proposal.proposalText.example,
};
const apiMethods = [];
const apiOrigins = new Set();
const apiWriteAttempts = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    apiOrigins.add(url.origin);
    apiMethods.push(request.method());
    if (request.method() !== 'GET') {
      apiWriteAttempts.push({ method: request.method(), url: request.url() });
      await route.abort('blockedbyclient');
      return;
    }

    let docs = [];
    if (url.pathname === '/api/translations') {
      const language = url.searchParams.get('where[language][equals]');
      docs = candidates.filter(candidate => !language || candidate.language === language);
    } else if (url.pathname === '/api/layout-frames') {
      docs = snapshot.layoutFrames ?? [];
    } else if (url.pathname === '/api/symbol-alias-settings') {
      docs = snapshot.symbolAliasSettings ?? [];
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'Not included in the isolated p.44 editor fixture.' }] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ docs, totalDocs: docs.length, limit: docs.length, page: 1, totalPages: 1 }),
    });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, 'Normal Viewer did not load');
  await page.locator('input.page-input').waitFor();
  await page.locator('input.page-input').fill('44');
  await page.locator('input.page-input').press('Enter');
  await page.waitForFunction(() => !!document.querySelector('.page-container img'));
  await page.locator('.language-select').selectOption('pt-BR');
  await page.locator('button.admin-toggle').click();
  assert.ok((await page.locator('button.admin-toggle').getAttribute('class'))?.includes('active'), 'Admin mode did not activate');

  for (const name of ['body', 'example']) {
    const candidate = candidates.find(item => item.spanKey.endsWith(`p44-damage-redistribution-${name}__pt-BR`));
    assert.ok(candidate, `Missing ${name} candidate`);
    const expected = normalize(targetTexts[name]);
    await page.waitForFunction(text => String(document.querySelector('.page-container')?.textContent ?? '')
      .replace(/\s+/gu, ' ').trim().includes(text), expected);
    const hitTarget = page.locator(`[data-editable-unit-key="${candidate.spanKey}"]`);
    assert.equal(await hitTarget.count(), 1, `${candidate.spanKey} is not a single selectable editor target`);
    await hitTarget.click();
    await page.getByText('📝 Edit Text', { exact: true }).click();
    const editor = page.locator('textarea');
    await editor.waitFor();
    const editorText = normalize(await editor.inputValue());
    assert.equal(editorText, expected, `${candidate.spanKey} opened with different text`);
    await page.getByText('Cancelar', { exact: true }).click();
    await editor.waitFor({ state: 'detached' });
  }

  // Verify the normal locale switch still shows the untouched English source.
  await page.locator('.language-select').selectOption('en');
  await page.waitForFunction(text => String(document.querySelector('.page-container')?.textContent ?? '')
    .replace(/\s+/gu, ' ').trim().includes(text), normalize(sourceTexts.body));
  const renderedEnglish = normalize(await page.locator('.page-container').textContent());
  assert.ok(renderedEnglish.includes(normalize(sourceTexts.example)),
    `English example text missing after locale switch. Rendered excerpt: ${renderedEnglish.slice(-1000)}`);
  await page.locator('.language-select').selectOption('pt-BR');
  for (const target of Object.values(targetTexts)) {
    await page.waitForFunction(text => String(document.querySelector('.page-container')?.textContent ?? '')
      .replace(/\s+/gu, ' ').trim().includes(text), normalize(target));
  }

  assert.deepEqual(apiWriteAttempts, [], 'Editor attempted an API write; proposal must remain unsaved');
  assert.ok(apiMethods.length > 0, 'No API reads were observed');
  assert.ok(apiMethods.every(method => method === 'GET'), `Unexpected API method: ${apiMethods.join(',')}`);
  assert.deepEqual(pageErrors, [], `Browser errors: ${pageErrors.join('; ')}`);

  const receipt = {
    page: 44,
    locale: 'pt-BR',
    mode: 'normal Viewer with Admin Rich Block Editor; isolated browser context',
    apiOrigins: [...apiOrigins],
    apiMethods: [...new Set(apiMethods)],
    apiWriteAttempts,
    editorKeysOpened: candidates.map(candidate => candidate.spanKey),
    editorTextMatchedProposal: true,
    englishSourceRestoredOnLocaleSwitch: true,
    candidateKeysUnique: true,
    proposalSha256: digest(JSON.stringify(proposal)),
    snapshotSha256: digest(JSON.stringify(snapshot)),
    browserErrors: pageErrors,
  };
  await mkdir(outputDir, { recursive: true });
  const receiptPath = resolve(outputDir, 'editor-verification-receipt-v2.json');
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
  try {
    assert.equal(await readFile(receiptPath, 'utf8'), bytes, 'Refusing to replace a changed editor receipt');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(receiptPath, bytes, { flag: 'wx' });
  }
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}

