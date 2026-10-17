#!/usr/bin/env node
/** Make an isolated p.26 diagnostic snapshot that blanks the blocked body units. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const root = process.cwd();
const proposalPath = resolve(root, 'docs/translations/proposals/page-026-item-card-types-proposal-2026-10-16-v1.json');
const sourceSnapshotDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/snapshot');
const diagnosticSnapshotDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/snapshot-diagnostic-v4');
const receiptPath = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/diagnostic-blank-receipt-v1.json');
const domPath = resolve(root, 'apps/web/public/pages/page_026/page_026_dom.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

await cp(sourceSnapshotDir, diagnosticSnapshotDir, { recursive: true, errorOnExist: true, force: false });
const proposal = await readJson(proposalPath);
const snapshotPath = resolve(diagnosticSnapshotDir, 'snapshot.json');
const snapshot = await readJson(snapshotPath);
const dom = await readJson(domPath);
const exception = proposal.technicalExceptions.find(item => item.id === 'p26-block-478-symbol-abilities-body');
assert.ok(exception, 'Missing the documented p.26 body-unit exception.');
const block = dom.blocks.find(item => item.id === 'block_478');
assert.ok(block, 'Missing canonical source block_478.');
const bodyUnitIds = block.typographicSpanUnits.filter(unit => unit.id !== 'p26-block-478-font-size-9pt-unit-00').map(unit => unit.id);
assert.equal(bodyUnitIds.length, 3, 'The source body-unit partition changed.');
const bodyKeys = bodyUnitIds.map(id => `page_26_unit_${id}__pt-BR`);
assert.deepEqual(bodyKeys, exception.spanKeys.slice(0, 3), 'The technical exception keys no longer match the source body units.');
assert.ok(bodyKeys.every(key => !snapshot.translations.some(doc => doc.spanKey === key)), 'Refusing to replace an existing snapshot translation.');

// Plain block records use the language-qualified Payload key in snapshots,
// while the proposal keeps its unsuffixed editor-facing block key.
snapshot.translations = snapshot.translations.map(doc => ({
  ...doc,
  spanKey: doc.language === 'pt-BR' && /^page_\d+_block_\d+$/u.test(doc.spanKey)
    ? `${doc.spanKey}__pt-BR`
    : doc.spanKey,
}));

// The English source labels occupy narrow, one-line slots. These PT-only
// unit frames give the longer strings room while preserving their baselines.
const expandedUnitFrames = [
  ['p26-block-473-first-size-9pt', 100],
  ['p26-block-473-remaining-size-10pt', 100],
  ['p26-block-474-first-size-9pt', 292],
  ['p26-block-474-remaining-size-10pt', 292],
  ['p26-block-479-first-size-9pt', 296.89447021484375],
  ['p26-block-479-remaining-size-10pt', 296.89447021484375],
].map(([unitId, width]) => {
  const unit = dom.blocks.flatMap(item => item.typographicUnits ?? []).find(item => item.id === unitId);
  assert.ok(unit, 'Missing source typographic unit ' + unitId);
  const unitKey = `page_26_unit_${unitId}`;
  return {
    frameKey: `${unitKey}::pt-BR`,
    unitKey,
    pageNumber: 26,
    language: 'pt-BR',
    data: {
      x: unit.field.frame.x,
      y: unit.field.bbox[1],
      width,
      height: Math.max(1, unit.field.bbox[3] - unit.field.bbox[1]),
      rotation: 0,
      textAlign: 'left',
    },
  };
});
const replacedBlockFrameKeys = new Set(['page_26_block_48::pt-BR', 'page_26_block_53::pt-BR']);
snapshot.layoutFrames = [
  ...snapshot.layoutFrames.filter(frame => !replacedBlockFrameKeys.has(frame.frameKey)),
  ...expandedUnitFrames,
];

const blankOverrides = bodyKeys.map(spanKey => ({
  spanKey,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    segments: [],
    textAlign: 'left',
    lineHeight: 1,
    lineHeightMode: 'source',
    managedSourceSymbols: [],
  },
}));
snapshot.translations.push(...blankOverrides);
snapshot.diagnosticOnly = {
  mode: 'blank_failed_units',
  purpose: 'Keep the unresolved source body from appearing as English in the PT-BR diagnostic view.',
  blankedSpanKeys: bodyKeys,
  persistence: 'snapshot_only_never_payload',
};
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
const snapshotBytes = await readFile(snapshotPath);
const receipt = {
  status: 'prepared_snapshot_only_empty_overrides_for_blocked_body_units',
  page: 26,
  locale: 'pt-BR',
  sourceSnapshot: 'output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/snapshot/snapshot.json',
  diagnosticSnapshot: 'output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1/snapshot-diagnostic-v4/snapshot.json',
  sourceDomSha256: sha256(await readFile(domPath)),
  sourceProposalSha256: sha256(await readFile(proposalPath)),
  diagnosticSnapshotSha256: sha256(snapshotBytes),
  blankedSpanKeys: bodyKeys,
  blankOverrideSegmentCounts: blankOverrides.map(item => item.data.segments.length),
  expandedUnitFrames,
  removedUnusedBlockFrameKeys: [...replacedBlockFrameKeys],
  preservedProposalText: exception.proposedText,
  payloadWrites: 0,
};
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
