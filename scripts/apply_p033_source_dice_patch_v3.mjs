#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const pageDir = resolve(root, 'apps/web/public/pages/page_033');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p033-full-prose-proposal-v3');
const snapshotPageDir = join(proofDir, 'snapshot/pages/page_033');
const backupDir = join(proofDir, 'canonical-rollback');
const receiptPath = join(backupDir, 'receipt.json');
const rollbackReceiptPath = join(backupDir, 'rollback-receipt.json');
const canonicalSidecarPath = join(pageDir, 'inline_elements.json');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const readHash = async path => sha256(await readFile(path));
const mode = process.argv.includes('--rollback') ? 'rollback' : 'apply';

const proofHashes = JSON.parse(await readFile(join(proofDir, 'source-hashes.json'), 'utf8'));
assert.equal(proofHashes.sourcePdf.sha256, 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351');
assert.equal(proofHashes.pageDomSha256, '881A9E6F8D759907140BC42CD47DFF820AE2C9489B10F23D044171D19464955D');
assert.equal(proofHashes.pageAssets['inline_elements.json'], '22602E811036B9399DE32753566A776E8182F74D79C5C1E8F052E70BEA57C24C');
assert.equal(proofHashes.pageAssets['background.webp'], '4CF4E279A3BD2744CE3A109075360E26170134920F937CA2E42CA48425151EC8');
assert.equal(proofHashes.payloadRead.matchingPage33Records, 0);

const patchFiles = [
  'inline-element-mask-002.png', 'inline-element-mask-003.png', 'inline-element-mask-004.png',
  'inline-element-mask-005.png', 'inline-element-mask-006.png', 'source-dice-purple-p33.svg',
];
const expectedAfterSidecarHash = proofHashes.isolatedPageAssets['inline_elements.json'];
const expectedCreatedFiles = Object.fromEntries(patchFiles.map(name => [name, proofHashes.isolatedPageAssets[name]]));

async function rollback() {
  assert.ok(await exists(receiptPath), 'No canonical application receipt exists; nothing to roll back.');
  assert.equal(await exists(rollbackReceiptPath), false, 'A rollback receipt already exists.');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'applied');
  const currentSidecarHash = await readHash(canonicalSidecarPath);
  assert.equal(currentSidecarHash, receipt.after.inlineSidecarSha256,
    'Canonical sidecar changed after this patch; refusing to overwrite it during rollback.');
  for (const [name, expectedHash] of Object.entries(receipt.createdFiles)) {
    assert.equal(await readHash(join(pageDir, name)), expectedHash,
      `Created asset ${name} changed after this patch; refusing to remove it during rollback.`);
  }

  const backupBytes = await readFile(join(backupDir, 'inline_elements.json'));
  assert.equal(sha256(backupBytes), receipt.before.inlineSidecarSha256, 'Saved sidecar backup hash does not match receipt.');
  const tempPath = `${canonicalSidecarPath}.rollback-v3.tmp`;
  assert.equal(await exists(tempPath), false, 'Rollback temp path already exists.');
  await writeFile(tempPath, backupBytes, { flag: 'wx' });
  await rename(tempPath, canonicalSidecarPath);
  for (const name of Object.keys(receipt.createdFiles)) await unlink(join(pageDir, name));

  const after = {
    inlineSidecarSha256: await readHash(canonicalSidecarPath),
    remainingCreatedFiles: await Promise.all(Object.keys(receipt.createdFiles).map(async name => ({
      name, exists: await exists(join(pageDir, name)),
    }))),
  };
  assert.equal(after.inlineSidecarSha256, receipt.before.inlineSidecarSha256);
  assert.ok(after.remainingCreatedFiles.every(file => !file.exists));
  const rollbackReceipt = {
    schemaVersion: 1,
    status: 'rolled-back',
    rolledBackAt: new Date().toISOString(),
    originalApplicationReceipt: receiptPath,
    beforeRollback: { inlineSidecarSha256: currentSidecarHash, createdFiles: receipt.createdFiles },
    after,
  };
  await writeFile(rollbackReceiptPath, JSON.stringify(rollbackReceipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(rollbackReceipt, null, 2));
}

async function apply() {
  if (await exists(receiptPath)) {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    const assetMatches = await Promise.all(Object.entries(receipt.createdFiles).map(async ([name, expected]) =>
      await readHash(join(pageDir, name)).catch(() => '') === expected));
    const alreadyApplied = await readHash(canonicalSidecarPath) === receipt.after.inlineSidecarSha256
      && assetMatches.every(Boolean);
    assert.ok(alreadyApplied, 'Existing application receipt does not match current canonical files.');
    console.log(JSON.stringify({ status: 'already-applied', receipt: receiptPath }, null, 2));
    return;
  }

  assert.equal(await exists(backupDir), false, 'Rollback directory already exists without a matching application receipt.');
  const domHash = await readHash(join(pageDir, 'page_033_dom.json'));
  const sidecarHash = await readHash(canonicalSidecarPath);
  const backgroundHash = await readHash(join(pageDir, 'background.webp'));
  const overlaysHash = await readHash(join(pageDir, 'fidelity_overlays.json'));
  assert.equal(domHash, proofHashes.pageDomSha256, 'p.33 DOM changed since proof creation.');
  assert.equal(sidecarHash, proofHashes.pageAssets['inline_elements.json'], 'p.33 inline sidecar changed since proof creation.');
  assert.equal(backgroundHash, proofHashes.pageAssets['background.webp'], 'p.33 background changed since proof creation.');
  assert.equal(overlaysHash, proofHashes.pageAssets['fidelity_overlays.json'], 'p.33 fidelity overlays changed since proof creation.');
  assert.equal(sha256(await readFile(sourcePdfPath)), proofHashes.sourcePdf.sha256, 'Official source PDF changed since proof creation.');

  const apiUrl = (process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000').replace(/\/+$/u, '');
  const translationsUrl = new URL('/api/translations', apiUrl);
  translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
  translationsUrl.searchParams.set('limit', '5000');
  const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Read-only Payload preflight failed: ${response.status}`);
  const payload = await response.json();
  assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload baseline is paginated.');
  const savedPageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_33_'));
  assert.equal(savedPageRecords.length, 0, 'p.33 now has saved PT-BR records; refusing canonical symbol activation.');

  const proposedSidecarBytes = await readFile(join(snapshotPageDir, 'inline_elements.json'));
  assert.equal(sha256(proposedSidecarBytes), expectedAfterSidecarHash, 'Isolated patch sidecar changed after proof review.');
  const proposedSidecar = JSON.parse(proposedSidecarBytes.toString('utf8'));
  assert.equal(proposedSidecar.elements.length, 7, 'Expected the two existing white dice plus five purple dice.');
  assert.equal(proposedSidecar.elements.filter(element => element.symbolId === 'dice.purple').length, 5);
  const missingFiles = patchFiles.filter(name => !Object.hasOwn(expectedCreatedFiles, name));
  assert.equal(missingFiles.length, 0, 'Patch file list and hash manifest disagree.');
  for (const name of patchFiles) {
    assert.equal(await exists(join(pageDir, name)), false, `Canonical target ${name} already exists; refusing to replace it.`);
    assert.equal(await readHash(join(snapshotPageDir, name)), expectedCreatedFiles[name], `Proof asset ${name} changed.`);
  }

  const originalSidecarBytes = await readFile(canonicalSidecarPath);
  await mkdir(backupDir, { recursive: false });
  await writeFile(join(backupDir, 'inline_elements.json'), originalSidecarBytes, { flag: 'wx' });
  const before = {
    inlineSidecarSha256: sha256(originalSidecarBytes),
    pageDomSha256: domHash,
    backgroundSha256: backgroundHash,
    fidelityOverlaysSha256: overlaysHash,
    sourcePdfSha256: proofHashes.sourcePdf.sha256,
    payloadPage33Records: savedPageRecords.length,
    targetAssetsAbsent: patchFiles,
  };
  await writeFile(join(backupDir, 'before.json'), JSON.stringify(before, null, 2) + '\n', { flag: 'wx' });

  const created = [];
  const tempPath = `${canonicalSidecarPath}.apply-v3.tmp`;
  try {
    for (const name of patchFiles) {
      await copyFile(join(snapshotPageDir, name), join(pageDir, name), constants.COPYFILE_EXCL);
      created.push(name);
    }
    assert.equal(await readHash(canonicalSidecarPath), before.inlineSidecarSha256,
      'p.33 inline sidecar changed during application; refusing to overwrite it.');
    assert.equal(await exists(tempPath), false, 'Application temp path already exists.');
    await writeFile(tempPath, proposedSidecarBytes, { flag: 'wx' });
    await rename(tempPath, canonicalSidecarPath);

    const after = { inlineSidecarSha256: await readHash(canonicalSidecarPath) };
    assert.equal(after.inlineSidecarSha256, expectedAfterSidecarHash, 'Canonical sidecar hash differs from the reviewed patch.');
    const createdFiles = {};
    for (const name of created) {
      createdFiles[name] = await readHash(join(pageDir, name));
      assert.equal(createdFiles[name], expectedCreatedFiles[name]);
    }
    const receipt = {
      schemaVersion: 1,
      status: 'applied',
      appliedAt: new Date().toISOString(),
      page: 33,
      patch: 'five source-traced dice.purple inline placements and their flat cleanup masks/source SVG',
      filesChanged: ['inline_elements.json', ...created],
      before,
      after,
      createdFiles,
      rollbackCommand: 'node scripts/apply_p033_source_dice_patch_v3.mjs --rollback',
      rollbackBackup: join(backupDir, 'inline_elements.json'),
    };
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    if (await exists(tempPath)) await unlink(tempPath);
    if (await readHash(canonicalSidecarPath).catch(() => '') === expectedAfterSidecarHash) {
      const restorePath = `${canonicalSidecarPath}.recovery-v3.tmp`;
      await writeFile(restorePath, originalSidecarBytes, { flag: 'wx' });
      await rename(restorePath, canonicalSidecarPath);
    }
    for (const name of created) {
      if (await readHash(join(pageDir, name)).catch(() => '') === expectedCreatedFiles[name]) await unlink(join(pageDir, name));
    }
    throw error;
  }
}

if (mode === 'rollback') await rollback();
else await apply();
