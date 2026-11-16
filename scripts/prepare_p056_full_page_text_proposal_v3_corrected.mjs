import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const page = 56;
const pageId = 'page_056';
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const expectedPdfSha256 = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';
const v2ProposalPath = resolve(root, 'docs/translations/proposals/page-056-full-page-text-proposal-2026-10-15-v2.json');
const v2SnapshotPath = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-full-page-v2/snapshot/snapshot-p056-full-page-v2-export.json');
const v3ProposalPath = resolve(root, 'docs/translations/proposals/page-056-full-page-text-proposal-2026-10-15-v3-corrected.json');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p056-full-page-v3-corrected');
const snapshotDir = resolve(proofDir, 'snapshot');
const sourcePageDir = resolve(root, 'apps/web/public/pages', pageId);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeNewJson = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

assert.equal(await (async () => { try { await readFile(resolve(proofDir, 'proof-exists')); return true; } catch { return false; } })(), false);
try {
  await readdir(proofDir);
  throw new Error(`Refusing to overwrite existing proof directory: ${proofDir}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const pdfBytes = await readFile(sourcePdfPath);
assert.equal(sha256(pdfBytes), expectedPdfSha256, 'Official source PDF changed');
const proposal = await readJson(v2ProposalPath);
const priorSnapshot = await readJson(v2SnapshotPath);
assert.equal(proposal.page, page);
assert.equal(proposal.candidateCount, 23);
assert.equal(proposal.candidates.length, 23);
assert.equal(priorSnapshot.translations.length, 23);
assert.deepEqual(proposal.sourceHashes.payloadBaseline, [], 'Recorded Payload baseline is no longer empty');

const names = (await readdir(sourcePageDir)).sort();
assert.deepEqual(names, Object.keys(proposal.sourceHashes.pageFiles).sort(), 'p.56 canonical asset inventory changed');
const assets = {};
for (const name of names) {
  const bytes = await readFile(resolve(sourcePageDir, name));
  assert.equal(sha256(bytes), proposal.sourceHashes.pageFiles[name], `p.56 source hash changed: ${name}`);
  assets[name] = bytes;
}
const dom = JSON.parse(assets['page_056_dom.json'].toString('utf8'));
const headingBlock = dom.blocks.find(block => block.id === 'block_104');
assert.equal(headingBlock.lines[0].spans.map(span => span.text).join('').trim(), 'Combatant Tags');
const headingCandidate = proposal.candidates.find(candidate => candidate.spanKey === 'page_56_block_36__pt-BR');
assert.ok(headingCandidate, 'Missing Combatant Tags heading candidate');
assert.equal(headingCandidate.proposalText, 'Tags: Combatentes');
assert.equal(headingCandidate.candidate.data.segments.length, 1);
assert.equal(headingCandidate.candidate.data.segments[0].font, 'Cinzel-Regular');
assert.equal(headingCandidate.candidate.data.segments[0].size, 12);

const payloadUrl = new URL('/api/translations', apiUrl);
payloadUrl.searchParams.set('where[language][equals]', 'pt-BR');
payloadUrl.searchParams.set('limit', '5000');
const payloadResponse = await fetch(payloadUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(payloadResponse.ok, `Read-only Payload check failed: ${payloadResponse.status}`);
const payload = await payloadResponse.json();
const pageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_56_'));
assert.deepEqual(pageRecords, [], 'A p.56 now has PT-BR Payload records; preserve and reassess');

const v3 = structuredClone(proposal);
const v3HeadingCandidate = v3.candidates.find(candidate => candidate.spanKey === 'page_56_block_36__pt-BR');
assert.ok(v3HeadingCandidate, 'Missing cloned heading candidate');
assert.equal(v3HeadingCandidate.proposalText, 'Tags: Combatentes');
v3HeadingCandidate.proposalText = 'Tags de Combatente';
v3HeadingCandidate.candidate.data.segments[0].text = 'Tags de Combatente';
v3.family = 'p.56 — proposta de todas as unidades textuais editáveis, v3 com moldura isolada';
v3.status = 'isolated-page-text-proposal-v3-awaiting-viewer-editor-pdf-validation';
v3.attempt = 3;
v3.revisionBudget = 3;
v3.sourceHashes.previousFullPageProposalV2 = 'docs/translations/proposals/page-056-full-page-text-proposal-2026-10-15-v2.json';
v3.layoutFrameProposal = {
  status: 'isolated-experiment-only',
  unitKey: 'page_56_block_36',
  language: 'pt-BR',
  sourceText: 'Combatant Tags',
  targetText: 'Tags de Combatente',
  sourceFrame: {
    x: headingBlock.bbox[0], y: headingBlock.bbox[1],
    width: headingBlock.bbox[2] - headingBlock.bbox[0],
    height: headingBlock.bbox[3] - headingBlock.bbox[1],
  },
  proposedFrame: {
    x: headingBlock.bbox[0], y: headingBlock.bbox[1], width: 136,
    height: headingBlock.bbox[3] - headingBlock.bbox[1], rotation: 0, textAlign: 'left',
  },
  fontMeasurement: { font: 'Cinzel-Regular', sizePt: 12, phraseAdvancePt: 131.56, sourceWidthPt: headingBlock.bbox[2] - headingBlock.bbox[0] },
  rationale: 'A proposta anterior usava uma tradução semanticamente incompleta e ainda quebrava. O termo coerente com o corpo da página, Tags de Combatente, mede aproximadamente 131,56 pt a 12 pt; uma moldura PT-BR isolada de 136 pt conserva fonte/tamanho e evita a quebra. O enquadramento é um experimento local, não altera o sidecar canônico nem o frame EN.',
  canonicalFrameWritten: false,
};
v3.copyfit = {
  ...v3.copyfit,
  status: 'isolated page-local heading frame proposed; render and visual validation pending',
  evidence: [
    ...(v3.copyfit.evidence ?? []),
    'v3 corrected: page_56_block_36 uses the consistent term Tags de Combatente in a 136 pt PT-BR-only frame at the source x/y/height; all 23 candidate translations are included.',
  ],
};
headingCandidate.proposalText = 'Tags de Combatente';
headingCandidate.candidate.data.segments[0].text = 'Tags de Combatente';

const snapshot = structuredClone(priorSnapshot);
snapshot.translations = v3.candidates.map(candidate => candidate.candidate);
snapshot.layoutFrames = (snapshot.layoutFrames ?? []).filter(frame => frame.unitKey !== 'page_56_block_36');
snapshot.layoutFrames.push({
  id: 11,
  frameKey: 'page_56_block_36::pt-BR',
  unitKey: 'page_56_block_36',
  pageNumber: page,
  language: 'pt-BR',
  data: v3.layoutFrameProposal.proposedFrame,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
snapshot.page = page;
snapshot.patched = true;
snapshot.verifyRenderedSnapshot = true;
assert.equal(snapshot.translations.length, 23);
assert.equal(new Set(snapshot.translations.map(item => item.spanKey)).size, 23);
assert.ok(snapshot.translations.every(item => item.language === 'pt-BR' && item.spanKey.endsWith('__pt-BR')));
assert.ok(!snapshot.translations.some(item => item.spanKey.includes('__en')));

await mkdir(resolve(snapshotDir, 'pages', pageId), { recursive: true });
for (const [name, bytes] of Object.entries(assets)) {
  const destination = resolve(snapshotDir, 'pages', pageId, name);
  await copyFile(resolve(sourcePageDir, name), destination, 1);
  assert.equal(sha256(await readFile(destination)), proposal.sourceHashes.pageFiles[name], `Copied proof asset differs: ${name}`);
}
await writeNewJson(resolve(snapshotDir, 'snapshot-p056-full-page-v3.json'), snapshot);
await writeNewJson(v3ProposalPath, v3);
await writeNewJson(resolve(proofDir, 'source-hashes.json'), {
  sourcePdfSha256: expectedPdfSha256,
  pageFiles: proposal.sourceHashes.pageFiles,
  payloadPageRecords: [],
  priorProposal: v2ProposalPath,
  frameOverride: v3.layoutFrameProposal,
  copiedFromCurrentCanonicalPage: true,
});
await writeNewJson(resolve(proofDir, 'preflight.json'), {
  page,
  result: 'passed',
  checkedSourcePdfSha256: expectedPdfSha256,
  checkedPageAssetCount: names.length,
  candidateCount: v3.candidates.length,
  payloadPtBrPageRecordCount: pageRecords.length,
  canonicalWrites: 0,
  proposalPath: v3ProposalPath,
  snapshotPath: resolve(snapshotDir, 'snapshot-p056-full-page-v3.json'),
});

console.log(JSON.stringify({
  status: v3.status,
  page,
  candidateCount: v3.candidates.length,
  changedUnit: { key: v3HeadingCandidate.spanKey, source: v3HeadingCandidate.sourceText, target: v3HeadingCandidate.proposalText },
  sourceFrame: v3.layoutFrameProposal.sourceFrame,
  proposedFrame: v3.layoutFrameProposal.proposedFrame,
  payloadPageRecords: pageRecords.length,
  proposalPath: v3ProposalPath,
  snapshotPath: resolve(snapshotDir, 'snapshot-p056-full-page-v3.json'),
  canonicalWrites: 0,
}, null, 2));
