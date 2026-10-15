#!/usr/bin/env node
/** Build an immutable p.47 snapshot for the existing IMPORTANT and TIP drafts. */

import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const proposalPath = resolve(root, 'docs/translations/proposals/page-047-tip-callout-proposal-2026-10-15-v1.json');
const outputDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p047-tip-proposal-v1');
const snapshotPath = resolve(outputDir, 'snapshot.json');
const sourcePageDir = resolve(root, 'apps/web/public/pages/page_047');
const snapshotPageDir = resolve(outputDir, 'pages/page_047');

const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
const pageDomPath = resolve(root, proposal.source.pageDom);
const sourcePdfPath = resolve(root, proposal.source.pdfPath);
const pageDom = JSON.parse(await readFile(pageDomPath, 'utf8'));
const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const normalized = value => value.replace(/\s+/gu, ' ').trim();

if (await sha256(sourcePdfPath) !== proposal.source.pdfSha256) throw new Error('Source PDF hash changed.');
if (await sha256(pageDomPath) !== proposal.source.pageDomSha256) throw new Error('Page DOM hash changed.');
if (await sha256(resolve(sourcePageDir, 'inline_elements.json')) !== proposal.source.pageInlineElementsSha256) {
  throw new Error('Page inline-elements sidecar hash changed.');
}

const expectedAssets = proposal.source.pageAssetHashes;
const expectedAssetNames = Object.keys(expectedAssets).sort();
const currentAssetNames = (await readdir(sourcePageDir)).sort();
if (JSON.stringify(currentAssetNames) !== JSON.stringify(expectedAssetNames)) {
  throw new Error('Page asset inventory changed.');
}
for (const [name, expectedHash] of Object.entries(expectedAssets)) {
  if (await sha256(resolve(sourcePageDir, name)) !== expectedHash) throw new Error(`Source page asset changed: ${name}`);
}

async function ensureIsolatedPageCopy() {
  await mkdir(outputDir, { recursive: true });
  let exists = true;
  try { await access(snapshotPageDir); } catch { exists = false; }
  if (!exists) {
    await mkdir(resolve(outputDir, 'pages'), { recursive: true });
    await cp(sourcePageDir, snapshotPageDir, { recursive: true, errorOnExist: true });
  }
  const copiedNames = (await readdir(snapshotPageDir)).sort();
  if (JSON.stringify(copiedNames) !== JSON.stringify(expectedAssetNames)) throw new Error('Isolated page file inventory differs.');
  for (const [name, expectedHash] of Object.entries(expectedAssets)) {
    if (await sha256(resolve(snapshotPageDir, name)) !== expectedHash) throw new Error(`Isolated page copy mismatch: ${name}`);
  }
}

function translationFromUnit(unit, isContext = false) {
  const blockIndex = pageDom.blocks.findIndex(block => block.id === unit.sourceBlockId);
  const keyMatch = unit.sourceEditorialKey.match(/^page_47_block_(\d+)$/u);
  if (blockIndex < 0 || !keyMatch || Number(keyMatch[1]) !== blockIndex) {
    throw new Error(`Editorial key/block index mismatch for ${unit.sourceBlockId}.`);
  }
  if (!isContext) {
    const block = pageDom.blocks[blockIndex];
    const actualSource = normalized(block.lines.flatMap(line => line.spans.map(span => span.text)).join(''));
    if (actualSource !== unit.sourceText) throw new Error(`Source text changed for ${unit.sourceBlockId}.`);
  }
  const segmentsText = unit.segments.map(segment => segment.text).join('');
  const expectedText = isContext
    ? unit.targetText.replace(/^\[\[symbol:tag\.important\.icon\]\]/u, '\uFFFC')
    : unit.targetText;
  if (segmentsText !== expectedText) throw new Error(`Rich segments do not reproduce target for ${unit.sourceBlockId}.`);
  return {
    spanKey: unit.spanKey,
    language: 'pt-BR',
    data: {
      schemaVersion: 2,
      segments: unit.segments,
      textAlign: 'left',
      lineHeight: unit.lineHeight,
      lineHeightMode: 'custom',
      managedSourceSymbols: unit.managedSourceSymbols ?? [],
    },
  };
}

await ensureIsolatedPageCopy();
const translations = [
  ...proposal.contextOverrides.map(unit => translationFromUnit(unit, true)),
  ...proposal.units.map(unit => translationFromUnit(unit)),
];
const spanKeys = translations.map(translation => translation.spanKey);
if (new Set(spanKeys).size !== spanKeys.length) throw new Error('Duplicate translation span keys.');

const boxes = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'),
  sourcePdfPath,
  String(proposal.page),
], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);

const snapshot = {
  translations,
  layoutFrames: [],
  symbolAliasSettings: [],
  assetPages: [proposal.page],
  sourcePageBoxes: JSON.parse(boxes.stdout),
};
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ snapshotPath, translationCount: translations.length, spanKeys }, null, 2));
