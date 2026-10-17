import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-full-page-v2');
const sourceSnapshotPath = resolve(proofDir, 'snapshot/snapshot-p056-full-page-v2-export.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-056-full-page-text-proposal-2026-10-15-v2.json');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
async function immutableWrite(path, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  try {
    assert.ok(bytes.equals(await readFile(path)), 'Refusing to replace changed artifact: ' + path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

const proposal = await readJson(proposalPath);
const snapshot = await readJson(sourceSnapshotPath);
assert.equal(proposal.page, 56);
assert.equal(proposal.attempt, 2, 'Only the declared final copyfit attempt can be closed here');
assert.equal(proposal.revisionBudget, 2);
assert.equal(proposal.candidateCount, 23);
assert.equal(snapshot.translations.length, 23);
const blockedKey = 'page_56_block_36__pt-BR';
const blockedCandidate = proposal.candidates.find(item => item.spanKey === blockedKey);
assert.ok(blockedCandidate, 'Expected the Combatant Tags heading candidate to remain inspectable');
assert.ok(snapshot.translations.some(item => item.spanKey === blockedKey), 'v2 evidence snapshot must preserve the failed attempt');

const finalSnapshot = {
  ...snapshot,
  translations: snapshot.translations.filter(item => item.spanKey !== blockedKey),
  patched: true,
  verifyRenderedSnapshot: true,
  note: 'Final copyfit fallback: the p.56 Combatant Tags heading candidate is retained in the proposal but omitted from this render because attempt 2/2 collides with the source divider; English source fallback is shown for that heading.',
};
assert.equal(finalSnapshot.translations.length, 22);
assert.ok(!finalSnapshot.translations.some(item => item.spanKey.includes('__en')));
const uniqueKeys = finalSnapshot.translations.map(item => item.spanKey);
assert.equal(new Set(uniqueKeys).size, 22);

const snapshotPath = resolve(proofDir, 'snapshot/snapshot-p056-full-page-v2-final-fallback.json');
await immutableWrite(snapshotPath, finalSnapshot);
const status = {
  schemaVersion: 1,
  page: 56,
  proposal: proposalPath,
  revisionAttempt: '2/2',
  outcome: 'partial-page-text-proposal-with-one-dtp-block',
  candidateCount: 23,
  finalPdfOverrideCount: 22,
  blockedUnit: {
    blockId: 'block_104',
    spanKey: blockedKey,
    sourceText: blockedCandidate.sourceText,
    fullCandidatePreserved: blockedCandidate.proposalText,
    status: 'blocked-by-copyfit; source fallback retained in final render',
    observedIssue: 'The 12 pt Cinzel candidate wraps to two lines and its second line crosses the source divider immediately above the component card.',
    nextActionProposalOnly: 'DTP review may consider a page-local heading width sufficient for one line while preserving x/y/font/size; do not change the canonical frame without review.',
  },
  scope: {
    componentArtRemainsEnglishByProjectPolicy: true,
    payloadWritten: false,
    canonicalTranslationWritten: false,
    humanTranslationOverwritten: false,
    canonicalPageAssetsWritten: false,
  },
  finalSnapshot: snapshotPath,
};
await immutableWrite(resolve(proofDir, 'copyfit-finalization-v2.json'), status);
console.log(JSON.stringify({
  status: status.outcome,
  candidateCount: status.candidateCount,
  finalPdfOverrideCount: status.finalPdfOverrideCount,
  blockedUnit: status.blockedUnit,
  finalSnapshot: snapshotPath,
}, null, 2));
