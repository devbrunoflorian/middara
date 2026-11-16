import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = resolve(root, 'docs/translations/proposals/important-family-manifest-2026-10-13.json');
const proofDir = resolve(root, 'output/proofs/important-family-validation-2026-10-15/p043-block22-v2');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const occurrence = manifest.occurrences.find(item => item.occurrenceId === 'p043-block_22');
assert.ok(occurrence, 'Missing p043-block_22');
assert.equal(occurrence.source.text, '[[symbol:tag.important.icon]]\nIMPORTANT: If an Adventurer equips 2 different Ranged Weapons \nwith 2 different Ranged Values, they may only make Attacks against \ntargets using the lowest of the two values.', 'Source text changed');

const oldPlain = 'IMPORTANTE: Se um Aventureiro equipar 2 Armas de Longo Alcance diferentes, com Valores de Alcance diferentes, só poderá atacar alvos usando o menor dos dois valores.';
const correctedPlain = 'IMPORTANTE: Se um Aventureiro equipar 2 Armas de Longo Alcance diferentes, com 2 Valores de Alcance diferentes, só poderá atacar alvos usando o menor dos dois valores.';
const marker = '[[symbol:tag.important.icon]]';
const v1Path = resolve(root, 'output/proofs/important-family-validation-2026-10-15/p043-batch-v1/p043-block_22-proposal-v1.json');
const v2Path = resolve(proofDir, 'p043-block_22-proposal-v2.json');

await mkdir(resolve(root, 'output/proofs/important-family-validation-2026-10-15/p043-batch-v1'), { recursive: true });
if (occurrence.proposal.targetPlainText === oldPlain) {
  const v1 = `${JSON.stringify(occurrence, null, 2)}\n`;
  try {
    await writeFile(v1Path, v1, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    assert.equal(await readFile(v1Path, 'utf8'), v1, 'Existing v1 proposal backup differs');
  }

  const symbolSegment = occurrence.proposal.segments.find(segment => segment.symbolId === 'tag.important.icon');
  const labelSegment = occurrence.proposal.segments.find(segment => segment.text === 'IMPORTANTE:');
  assert.ok(symbolSegment && labelSegment, 'Missing IMPORTANT symbol or label segment');
  const regular = text => ({ text, font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true });
  const boldNine = text => ({ text, font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true });
  const boldItalic = text => ({ text, font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true });
  const styleOf = ({ text: _text, ...style }) => style;

  occurrence.proposal.targetPlainText = correctedPlain;
  occurrence.proposal.targetText = `${marker}${correctedPlain}`;
  occurrence.proposal.textWithSymbols = `${marker}${correctedPlain}`;
  occurrence.proposal.segments = [
    symbolSegment,
    labelSegment,
    regular(' Se um Aventureiro equipar '),
    boldNine('2'),
    regular(' Armas de Longo Alcance diferentes, com '),
    boldNine('2'),
    regular(' Valores de Alcance '),
    boldItalic('diferentes'),
    regular(', só poderá atacar alvos usando o menor dos dois valores.'),
  ];
  const firstTwo = correctedPlain.indexOf('2');
  const secondTwo = correctedPlain.indexOf('2', firstTwo + 1);
  const different = correctedPlain.indexOf('diferentes', correctedPlain.indexOf('com 2'));
  const labelSpan = occurrence.proposal.explicitRichSpans.find(span => span.id === 'important-label');
  assert.ok(labelSpan, 'Missing IMPORTANT rich span');
  occurrence.proposal.explicitRichSpans = [
    labelSpan,
    { id: 'ranged-weapons-count', targetText: '2', start: firstTwo, end: firstTwo + 1, style: styleOf(boldNine('2')) },
    { id: 'ranged-values-count', targetText: '2', start: secondTwo, end: secondTwo + 1, style: styleOf(boldNine('2')) },
    { id: 'ranged-values-emphasis', targetText: 'diferentes', start: different, end: different + 'diferentes'.length, style: styleOf(boldItalic('diferentes')) },
  ];
  occurrence.proposal.version = 2;
  occurrence.proposal.proposalId = 'page_43_block_6__pt-BR__draft-2026-10-13-batch-003-v2';
  occurrence.proposal.copyfit.notes = [
    ...(occurrence.proposal.copyfit.notes ?? []),
    'Independent review correction: restored the second explicit numeral 2 and the source bold-italic emphasis on “different”; no frame or font-size change.',
  ];
  occurrence.proposal.fit = { status: 'p043-block22-v2-PDF-and-visual-review-pending' };
  occurrence.processing.status = 'proposal-revised-v2-pending-render';
  occurrence.processing.fit = 'p043-block22-v2-PDF-and-visual-review-pending';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
} else {
  assert.equal(occurrence.proposal.targetPlainText, correctedPlain, 'Proposal differs from both the expected v1 and v2 text');
  assert.equal(occurrence.proposal.version, 2, 'Corrected proposal version is inconsistent');
  const savedV1 = JSON.parse(await readFile(v1Path, 'utf8'));
  assert.equal(savedV1.proposal.targetPlainText, oldPlain, 'Saved v1 proposal is not the expected predecessor');
}

await mkdir(proofDir, { recursive: true });
const proposalV2Record = {
  occurrenceId: occurrence.occurrenceId,
  page: occurrence.page,
  source: occurrence.source,
  proposal: Object.fromEntries(Object.entries(occurrence.proposal).filter(([key]) => key !== 'fit')),
};
const proposalV2 = `${JSON.stringify(proposalV2Record, null, 2)}\n`;
try {
  await writeFile(v2Path, proposalV2, { flag: 'wx' });
} catch (error) {
  if (error?.code !== 'EEXIST') throw error;
  assert.equal(await readFile(v2Path, 'utf8'), proposalV2, 'Existing v2 proposal differs');
}
assert.equal(occurrence.proposal.targetPlainText, correctedPlain);
console.log(JSON.stringify({
  occurrence: occurrence.occurrenceId,
  version: occurrence.proposal.version,
  targetPlainText: occurrence.proposal.targetPlainText,
  richSpans: occurrence.proposal.explicitRichSpans.map(span => span.id),
  v1: v1Path,
  v2: v2Path,
}, null, 2));
