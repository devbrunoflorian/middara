/**
 * Candidate-specific Viewer and isolated-PDF proof for exact PDF-native
 * vector-removal crops. Writes only to output/proofs and uses the lab's
 * in-memory editor; API requests are blocked.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = process.cwd();
const sourcePdf = resolve('../Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const preparedRoot = resolve('output/proofs/full-symbol-integrity-2026-10-13/patches');
const experimentRoot = resolve('output/proofs/symbol-activation-2026-10-13/batch-95/mask-reconstruction-lab/native-vector-crops-p064-pending-v1-2026-10-14');
const reportPath = join(experimentRoot, 'experiment-report.json');
const outputRoot = resolve('output/proofs/translation-readiness-2026-10-14/native-vector-mask-p064-pending-proof-v1');
const sourcePdfSha256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351';
const baseUrl = 'http://localhost:8080';
const apiUrl = 'http://localhost:3000';

const targets = [
  { candidateId: 'p064-v205-208-n4', page: 64, symbolId: 'dice.white', leftContext: 'WHITE', rightContext: '6' },
];

const sha = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const throwIfExists = async (path) => {
  try { await access(path); throw new Error(`Refusing to overwrite existing evidence: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
};
const noChrome = '.rse-overlay,.rse-resize-handle{display:none!important}.block-selected,.span-selected{outline:none!important;background-color:transparent!important;box-shadow:none!important}.block-editable:hover,.span-editable:hover,.block-container:hover{outline:none!important;background-color:transparent!important;box-shadow:none!important}';

await throwIfExists(outputRoot);
const pdfBytes = await readFile(sourcePdf);
assert.equal(sha(pdfBytes), sourcePdfSha256, 'The exact source PDF used by the frozen experiment is required.');
const experimentReport = await readJson(reportPath);
assert.equal(experimentReport.canonicalWrites, 0);
assert.equal(experimentReport.payloadWrites, 0);
assert.equal(experimentReport.translationWrites, 0);
await mkdir(outputRoot, { recursive: true });

const results = [];
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ viewport: { width: 2000, height: 1800 }, deviceScaleFactor: 1, acceptDownloads: true });
  let apiRequests = 0;
  await context.route('**/api/**', async (route) => { apiRequests += 1; await route.abort('blockedbyclient'); });

  for (const target of targets) {
    const id = String(target.page).padStart(3, '0');
    const pageDir = join(outputRoot, target.candidateId);
    const captureDir = join(pageDir, 'capture');
    const snapshotDir = join(pageDir, 'snapshot');
    const snapshotAssets = join(snapshotDir, 'pages', `page_${id}`);
    await mkdir(captureDir, { recursive: true });

    const stagedSidecarPath = join(preparedRoot, 'pages', `page_${id}`, 'inline_elements.json');
    const sourcePageData = await readJson(join(root, 'apps/web/public/pages', `page_${id}`, `page_${id}_dom.json`));
    const stagedSidecar = await readJson(stagedSidecarPath);
    const element = stagedSidecar.elements.find((entry) => entry.provenance?.candidateId === target.candidateId);
    assert.ok(element, `${target.candidateId} exists in the isolated prepared sidecar.`);
    assert.equal(element.symbolId, target.symbolId);
    const sourceBlock = sourcePageData.blocks.find((block) => block.id === element.anchor.blockId);
    assert.ok(sourceBlock, `${target.candidateId}: source owner block exists.`);
    const median = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    };
    const sourceBaselines = [...new Set(sourceBlock.lines.flatMap((line) => line.spans.flatMap((span) => span.origin ? [span.origin[1]] : [])))].sort((a, b) => a - b);
    const sourceLineSteps = sourceBaselines.slice(1).map((baseline, index) => baseline - sourceBaselines[index]).filter((step) => step > 8 && step < 30);
    const sourceTextSizes = sourceBlock.lines.flatMap((line) => line.spans
      .filter((span) => span.text?.trim() && span.origin && !span.semanticSymbolId)
      .map((span) => span.size));
    assert.ok(sourceLineSteps.length && sourceTextSizes.length, `${target.candidateId}: source leading can be derived from PDF geometry.`);
    const sourceLineHeight = median(sourceLineSteps) / median(sourceTextSizes);
    assert.ok(sourceLineHeight >= 0.9 && sourceLineHeight <= 1.6, `${target.candidateId}: derived source line height is plausible.`);

    const experimentTarget = experimentReport.targets.find((entry) => entry.candidateId === target.candidateId);
    assert.ok(experimentTarget, `${target.candidateId} has a source-vector removal result.`);
    assert.equal(experimentTarget.collateralChangedPixelsOutsideMask, 0);
    if (!experimentTarget.imageXrefsPreserved) {
      assert.equal(target.candidateId, 'p084-v185', 'Only p.84 has a separately reviewed xref-identity change.');
      assert.equal(experimentTarget.collateralChangedPixelsOutsideMask, 0, 'Crop-only use requires zero rendered changes outside the target mask.');
    }
    assert.deepEqual(experimentTarget.sourcePdfSha256, sourcePdfSha256);

    const cleanMaskPath = join(experimentRoot, target.candidateId, 'native-vector-clean-mask.png');
    const cleanMaskBytes = await readFile(cleanMaskPath);
    const originalMaskPath = join(preparedRoot, 'pages', `page_${id}`, element.mask.url.split('/').at(-1));
    const originalMaskBytes = await readFile(originalMaskPath);
    const targetProof = {
      candidateId: target.candidateId,
      page: target.page,
      symbolId: target.symbolId,
      anchor: element.anchor,
      bbox: element.bbox,
      mask: element.mask,
      metrics: element.metrics,
      originalMaskSha256: sha(originalMaskBytes),
      exactCleanMaskSha256: sha(cleanMaskBytes),
      sourcePdfSha256,
      sourceLineHeight,
      sourcePatchSha256: sha(await readFile(stagedSidecarPath)),
      experiment: experimentTarget,
    };
    await writeFile(join(pageDir, 'candidate-input.json'), JSON.stringify(targetProof, null, 2));
    await writeFile(join(pageDir, 'native-vector-clean-mask.png'), cleanMaskBytes);
    await writeFile(join(pageDir, 'prepared-inline-elements.json'), JSON.stringify(stagedSidecar, null, 2));

    // The isolated lab uses the frozen source sidecar and patch endpoint. Replace
    // only this candidate's cleanup image in the browser response.
    const maskUrl = `http://127.0.0.1:8091/patches/pages/page_${id}/${element.mask.url.split('/').at(-1)}`;
    await context.route(maskUrl, async (route) => route.fulfill({ status: 200, contentType: 'image/png', body: cleanMaskBytes }));

    const page = await context.newPage();
    const session = () => page.getByTestId('lab-session-data').evaluate((node) => JSON.parse(node.textContent));
    const countSourceOccurrence = async () => page.locator('.page-container').evaluate((root, expected) => {
      const matchesAsset = (url) => typeof url === 'string' && url.split(/[/?#]/u).at(-1) === expected.asset;
      const closeToSourceBbox = (bbox) => bbox.length === 4
        && bbox.every((value, index) => Number.isFinite(value) && Math.abs(value - expected.bbox[index]) < 0.25);
      const sourceSvgs = [...root.querySelectorAll('svg[data-source-symbol-id]')].filter((node) => {
        if (node.getAttribute('data-source-symbol-id') !== expected.symbolId) return false;
        const bbox = (node.getAttribute('data-source-bbox') || '').split(',').map(Number);
        const hrefs = [...node.querySelectorAll('image')].flatMap((image) => [image.getAttribute('href'), image.getAttribute('xlink:href')]);
        return closeToSourceBbox(bbox) && hrefs.some(matchesAsset);
      });
      if (sourceSvgs.length) return new Set(sourceSvgs).size;

      // Some source placements use the editor's semantic IMG path instead of
      // SOURCE GEOMETRY SVG. Compare its DOM rect against the source PDF bbox.
      const pageRect = root.getBoundingClientRect();
      const scale = pageRect.width / expected.pageWidth;
      const sourceImages = [...root.querySelectorAll('img.inline-semantic-symbol')].filter((node) => {
        if (node.getAttribute('data-symbol-id') !== expected.symbolId || !matchesAsset(node.getAttribute('src'))) return false;
        const rect = node.getBoundingClientRect();
        const bbox = [
          (rect.left - pageRect.left) / scale,
          (rect.top - pageRect.top) / scale,
          (rect.right - pageRect.left) / scale,
          (rect.bottom - pageRect.top) / scale,
        ];
        return closeToSourceBbox(bbox);
      });
      return new Set(sourceImages).size;
    }, { bbox: element.bbox, pageWidth: sourcePageData.width, symbolId: target.symbolId, asset: sourceAsset });
    const settle = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const loadLab = async () => {
      await page.goto(`${baseUrl}/symbol-integrity-lab.html?page=${target.page}&patch=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        const image = document.querySelector('.page-container img');
        return Boolean(image?.complete && image.naturalWidth > 0);
      });
      await page.evaluate(() => document.fonts.ready);
      await page.getByLabel('Idioma da prova').selectOption('en');
      await settle();
    };
    const selectOwner = async () => {
      const owner = element.anchor.blockId;
      const options = await page.getByLabel('Bloco completo').locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, text: node.textContent || '' })));
      const option = options.find((item) => item.text.includes(`· ${owner} ·`));
      assert.ok(option, `${target.candidateId}: source owner ${owner} is selectable.`);
      await page.getByLabel('Bloco completo').selectOption(option.value);
      return option.value;
    };
    const enterEdit = async () => {
      await page.getByRole('button', { name: '📝 Edit Text', exact: true }).click();
      const textarea = page.locator('textarea:visible').first();
      await textarea.waitFor({ state: 'visible', timeout: 5000 });
      return textarea;
    };
    const sourceRows = async (textarea, currentText) => {
      await textarea.fill(`${currentText} `);
      await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records.length > 0);
      return (await session()).records[0].segments;
    };
    const capturePage = async (name) => {
      const path = join(captureDir, name);
      await page.locator('.page-container').screenshot({ path, scale: 'css', animations: 'disabled', caret: 'hide', style: noChrome });
      return path;
    };

    await loadLab();
    await capturePage('viewer-source-with-clean-vector-mask.png');
    const sourceAsset = element.metrics.sourceAssetUrl.split('/').at(-1);
    assert.equal(await countSourceOccurrence(), 1, 'The intended source occurrence is painted once at its PDF bbox.');

    await selectOwner();
    const emptyTextarea = await enterEdit();
    const emptySourceText = await emptyTextarea.inputValue();
    const emptySourceRuns = await sourceRows(emptyTextarea, emptySourceText);
    const emptySymbols = emptySourceRuns.filter((run) => run.symbolId);
    const candidateSourceSymbols = emptySymbols.filter((run) => run.symbolId === target.symbolId
      && run.symbolMetrics?.sourceAppearanceKey === element.metrics.sourceAppearanceKey);
    assert.equal(candidateSourceSymbols.length, 1, 'The target source occurrence is unique in its owner block.');
    const emptyTokens = [...emptySourceText.matchAll(/\[\[[^\]]+\]\]/gu)];
    assert.equal(emptyTokens.length, emptySymbols.length, 'The editor token sequence is one-to-one with source symbols.');
    const emptySymbolIndex = emptySymbols.findIndex((run) => run === candidateSourceSymbols[0]);
    const emptyMatch = emptyTokens[emptySymbolIndex];
    assert.ok(emptyMatch);
    const emptyText = emptySourceText.slice(0, emptyMatch.index) + emptySourceText.slice(emptyMatch.index + emptyMatch[0].length);
    await emptyTextarea.fill(emptyText);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await settle();
    const emptyState = (await session()).records[0];
    assert.ok(emptyState.managedSourceSymbols?.includes(target.symbolId), 'Deleting the alias still owns and masks its source paint.');
    assert.equal(emptyState.segments.filter((run) => run.symbolId === target.symbolId).length, 0, 'The candidate symbol is absent from the empty override.');
    await page.getByRole('button', { name: 'Aplicar à prova', exact: true }).click();
    await settle();
    await capturePage('viewer-empty-clean-mask.png');
    assert.equal(await countSourceOccurrence(), 0, 'The source target is absent in the empty state.');
    const emptySnapshot = await session();
    await writeFile(join(pageDir, 'empty-state.json'), JSON.stringify({ page: target.page, language: 'en', ownerKey: emptySnapshot.records[0]?.key, records: emptySnapshot.records }, null, 2));

    // Reload source state before movement so the proof is independent of the
    // intentional empty-state edit above.
    await loadLab();
    await selectOwner();
    const moveTextarea = await enterEdit();
    const originalText = await moveTextarea.inputValue();
    const originalRuns = await sourceRows(moveTextarea, originalText);
    const originalRecord = structuredClone((await session()).records[0]);
    assert.deepEqual(originalRecord.segments, originalRuns, 'The source-position record is captured before movement.');
    const originalSymbols = originalRuns.filter((run) => run.symbolId);
    const targetIndexes = originalSymbols.flatMap((run, index) => run.symbolId === target.symbolId
      && run.symbolMetrics?.sourceAppearanceKey === element.metrics.sourceAppearanceKey ? [index] : []);
    assert.equal(targetIndexes.length, 1, 'The target source appearance has a unique editable token.');
    const moveIndex = targetIndexes[0];
    const sourceSymbolIndex = originalRuns.findIndex((run) => run.symbolId === target.symbolId
      && run.symbolMetrics?.sourceAppearanceKey === element.metrics.sourceAppearanceKey);
    const sourceLeftText = originalRuns.slice(0, sourceSymbolIndex).map((run) => run.text || '').join('');
    const sourceRightText = originalRuns.slice(sourceSymbolIndex + 1).map((run) => run.text || '').join('');
    assert.ok(sourceLeftText.trimEnd().endsWith(target.leftContext), `${target.candidateId}: source slot precedes the expected PDF text.`);
    assert.ok(sourceRightText.trimStart().startsWith(target.rightContext), `${target.candidateId}: source slot follows the expected PDF text.`);
    const sourceSlot = {
      segmentIndex: sourceSymbolIndex,
      precedingText: sourceLeftText.slice(-80),
      followingText: sourceRightText.slice(0, 100),
      expectedLeftContext: target.leftContext,
      expectedRightContext: target.rightContext,
    };
    const moveTokens = [...originalText.matchAll(/\[\[[^\]]+\]\]/gu)];
    assert.equal(moveTokens.length, originalSymbols.length, 'The movement maps every token to one source symbol.');
    const moveMatch = moveTokens[moveIndex];
    const remainingText = originalText.slice(0, moveMatch.index) + originalText.slice(moveMatch.index + moveMatch[0].length);
    const moveToStart = moveIndex === moveTokens.length - 1;
    const movedText = moveToStart ? `${moveMatch[0]} ${remainingText.trimStart()}` : `${remainingText.trimEnd()} ${moveMatch[0]}`;
    await moveTextarea.fill(movedText);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await settle();
    const movedRuns = (await session()).records[0].segments;
    const symbolKey = (run) => `${run.symbolId}:${run.symbolMetrics?.sourceAppearanceKey || ''}:${run.symbolMetrics?.sourceAssetUrl || ''}`;
    const expectedKeys = originalSymbols.map(symbolKey);
    const [movedKey] = expectedKeys.splice(moveIndex, 1);
    moveToStart ? expectedKeys.unshift(movedKey) : expectedKeys.push(movedKey);
    assert.deepEqual(movedRuns.filter((run) => run.symbolId).map(symbolKey), expectedKeys, 'Moving the symbol preserves each occurrence appearance.');
    const movedTarget = movedRuns.find((run) => run.symbolId === target.symbolId && run.symbolMetrics?.sourceAppearanceKey === element.metrics.sourceAppearanceKey);
    assert.ok(movedTarget, 'The candidate remains in the moved segments.');
    assert.equal(movedTarget.symbolMetrics?.sourceAssetUrl?.split('/').at(-1), element.metrics.sourceAssetUrl.split('/').at(-1), 'The exact source asset remains attached.');

    let restored = false;
    for (let count = 0; count < 4; count += 1) {
      const undo = page.getByRole('button', { name: 'Undo', exact: true });
      if (!(await undo.count())) break;
      await undo.click();
      await settle();
      const records = (await session()).records;
      if (!records.length || JSON.stringify(records[0].segments) === JSON.stringify(originalRuns)) { restored = true; break; }
    }
    assert.ok(restored, 'Undo returns to the original source segments.');
    const undoCount = 1;
    for (let count = 0; count < undoCount; count += 1) {
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await settle();
    }
    // Redo until the exact movement is present; the text edit and Confirm can
    // be separate history items depending on editor state.
    let redoRestored = false;
    for (let count = 0; count < 4; count += 1) {
      const records = (await session()).records;
      if (records.length && JSON.stringify(records[0].segments) === JSON.stringify(movedRuns)) { redoRestored = true; break; }
      const redo = page.getByRole('button', { name: 'Redo', exact: true });
      if (!(await redo.count())) break;
      await redo.click();
      await settle();
    }
    assert.ok(redoRestored, 'Redo returns the exact moved segments.');

    await page.getByRole('button', { name: 'Aplicar à prova', exact: true }).click();
    await settle();
    await capturePage('viewer-moved-clean-mask.png');
    const movedSymbolLocator = page.locator(`.page-container img.inline-semantic-symbol[src$="${sourceAsset}"]`);
    assert.equal(await movedSymbolLocator.count(), 1, 'The moved source appearance is painted exactly once.');
    const movedBox = await movedSymbolLocator.boundingBox();
    assert.ok(movedBox);
    const pageBox = await page.locator('.page-container').boundingBox();
    assert.ok(pageBox);
    const scale = pageBox.width / sourcePageData.width;
    const movedPageBboxPt = [
      (movedBox.x - pageBox.x) / scale,
      (movedBox.y - pageBox.y) / scale,
      (movedBox.x + movedBox.width - pageBox.x) / scale,
      (movedBox.y + movedBox.height - pageBox.y) / scale,
    ];
    const originalCenter = [(element.bbox[0] + element.bbox[2]) / 2, (element.bbox[1] + element.bbox[3]) / 2];
    const movedCenter = [(movedPageBboxPt[0] + movedPageBboxPt[2]) / 2, (movedPageBboxPt[1] + movedPageBboxPt[3]) / 2];
    assert.ok(Math.hypot(movedCenter[0] - originalCenter[0], movedCenter[1] - originalCenter[1]) >= 0.5, 'The occurrence moved to a distinct location.');

    const makeTranslationRecords = (sessionRecords) => sessionRecords.map((record) => ({
      spanKey: record.key.replace(/__en$/u, ''),
      language: 'en',
      data: { schemaVersion: 2, segments: record.segments, textAlign: 'left', lineHeight: sourceLineHeight, lineHeightMode: 'custom', managedSourceSymbols: record.managedSourceSymbols },
    }));
    const originalRecords = makeTranslationRecords([originalRecord]);
    const movedSession = await session();
    const movedRecords = makeTranslationRecords(movedSession.records);
    assert.ok(originalRecords.every((record) => !record.spanKey.endsWith('__en')), 'Original-position snapshot serialization must normalize the __en key.');
    assert.ok(movedRecords.every((record) => !record.spanKey.endsWith('__en')), 'Moved-state snapshot serialization must normalize the __en key.');
    const sourceBoxes = spawnSync('python', ['scripts/snapshot_export_source_boxes.py', sourcePdf, String(target.page)], { cwd: root, encoding: 'utf8' });
    assert.equal(sourceBoxes.status, 0, `${target.candidateId}: source page boxes could not be extracted.`);
    const snapshotBase = { version: 1, layoutFrames: [], symbolAliasSettings: [], assetPages: [1, target.page], pages: [target.page], sourcePageBoxes: JSON.parse(sourceBoxes.stdout), page: target.page, patched: true, verifyRenderedSnapshot: true };
    await mkdir(snapshotAssets, { recursive: true });
    await cp(join(root, 'apps/web/public/pages', 'page_001'), join(snapshotDir, 'pages', 'page_001'), { recursive: true });
    await cp(join(root, 'apps/web/public/pages', `page_${id}`), snapshotAssets, { recursive: true });
    await cp(join(preparedRoot, 'pages', `page_${id}`), snapshotAssets, { recursive: true });
    await writeFile(join(snapshotAssets, element.mask.url.split('/').at(-1)), cleanMaskBytes);
    const originalSnapshotPath = join(snapshotDir, 'original-position-snapshot.json');
    const movedSnapshotPath = join(snapshotDir, 'moved-test-snapshot.json');
    const originalSnapshot = { ...snapshotBase, translations: originalRecords };
    const movedSnapshot = { ...snapshotBase, translations: movedRecords };
    await writeFile(originalSnapshotPath, JSON.stringify(originalSnapshot, null, 2));
    await writeFile(movedSnapshotPath, JSON.stringify(movedSnapshot, null, 2));
    // Keep snapshot.json as the canonical evidence path, and make it the source-position state.
    const snapshotPath = join(snapshotDir, 'snapshot.json');
    await writeFile(snapshotPath, JSON.stringify(originalSnapshot, null, 2));
    await writeFile(join(pageDir, 'movement.json'), JSON.stringify({ originalSymbolKeys: originalSymbols.map(symbolKey), movedSymbolKeys: movedRuns.filter((run) => run.symbolId).map(symbolKey), originalBboxPt: element.bbox, movedBboxPt: movedPageBboxPt, undoRestored: restored, redoRestored, sourceAliasCount: moveTokens.length, targetSourceAppearanceKey: element.metrics.sourceAppearanceKey }, null, 2));
    await writeFile(join(pageDir, 'source-slot.json'), JSON.stringify(sourceSlot, null, 2));

    const pdfPath = join(pageDir, `p${id}-en-mask-v1.pdf`);
    const exportArgs = [
      'scripts/export_page_pdf.mjs', '--page', String(target.page), '--language', 'en', '--output', pdfPath,
      '--base-url', baseUrl, '--api-url', apiUrl, '--source-pdf', sourcePdf, '--snapshot', originalSnapshotPath,
      '--viewer-screenshot', join(captureDir, 'export-viewer.png'), '--print-screenshot', join(captureDir, 'export-print.png'),
      '--metrics-output', join(captureDir, 'export-metrics.json'),
    ];
    const exported = spawnSync(process.execPath, exportArgs, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    await writeFile(join(pageDir, 'export.log'), `${exported.stdout || ''}${exported.stderr || ''}`);
    assert.equal(exported.status, 0, `${target.candidateId}: isolated PDF export failed; see export.log.`);

    await page.getByRole('button', { name: 'Cancelar toda a prova', exact: true }).click();
    await settle();
    const cancelled = await session();
    assert.equal(cancelled.records.length, 0, 'Cancel removes the isolated in-memory override.');
    assert.equal(await countSourceOccurrence(), 1, 'Cancel restores the source appearance.');
    await writeFile(join(pageDir, 'cancel-check.json'), JSON.stringify({ recordsAfterCancel: cancelled.records.length, sourceAppearanceRestored: true, apiRequestsAtCheckpoint: apiRequests }, null, 2));
    await page.close();

    results.push({
      candidateId: target.candidateId,
      page: target.page,
      status: 'source-position proof exported; promotion pending visual review',
      originalMaskSha256: targetProof.originalMaskSha256,
      replacementMaskSha256: targetProof.exactCleanMaskSha256,
      sourcePdfSha256,
      collateralChangedPixelsOutsideMask: experimentTarget.collateralChangedPixelsOutsideMask,
      imageXrefsPreserved: experimentTarget.imageXrefsPreserved,
      apiRequests,
      emptyCapture: join(captureDir, 'viewer-empty-clean-mask.png'),
      movedCapture: join(captureDir, 'viewer-moved-clean-mask.png'),
      pdfPath,
      pdfMetrics: join(captureDir, 'export-metrics.json'),
      snapshotPath: originalSnapshotPath,
      movedSnapshotPath,
      sourceSlotPath: join(pageDir, 'source-slot.json'),
      cancelCheck: join(pageDir, 'cancel-check.json'),
    });
  }

  assert.equal(apiRequests, 0, 'The proof may not request Payload/API data.');
  const report = {
    schemaVersion: 1,
    status: 'candidate-specific source-position and movement proofs complete; no canonical activation',
    sourcePdfSha256,
    canonicalWrites: 0,
    payloadWrites: 0,
    translationWrites: 0,
    apiRequests,
    candidates: results,
  };
  await writeFile(join(outputRoot, 'proof-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ candidates: results.length, apiRequests, report: join(outputRoot, 'proof-report.json') }));
} finally {
  await browser.close();
}
