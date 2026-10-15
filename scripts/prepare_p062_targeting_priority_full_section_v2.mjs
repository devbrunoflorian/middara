import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Add the two preceding legacy blocks to the already verified p.62 snapshot.
// This is an isolated proposal pipeline; it never writes Payload or sidecars.
const root = process.cwd();
const finalize = process.argv.includes('--finalize');
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdf = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sourceDir = resolve(root, 'apps/web/public/pages/page_062');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p062-ai-target-priority-v2');
const snapshotDir = join(proofDir, 'snapshot');
const v1ProofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p062-ai-target-priority-v1');
const v1SnapshotPath = join(v1ProofDir, 'snapshot', 'snapshot-p062-ai-target-priority-v1-export.json');
const v1ProposalPath = resolve(root, 'docs/translations/proposals/page-062-ai-target-priority-example-proposal-2026-10-15-v1.json');
const exportPdfPath = join(proofDir, 'page-062-pt-BR-full-section-v2.pdf');
const metricsPath = join(proofDir, 'page-062-pt-BR-full-section-v2-metrics.json');
const snapshotPath = join(snapshotDir, 'snapshot-p062-ai-target-priority-full-section-v2-export.json');
const expected = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  background: 'E941F79E8A569A729FDDC9F6024723C61D3368F9A15431F97FE9D5CC7AC42A04',
  dom: '9CC260B9C0494EE428545C71E5E9CD86183E752C378409303B2A6DCC3B7CE02F',
  inlineElements: 'A39ABF5925DD6D04A3FFEBCB68B0FA816EC0E0AE5C69A3921FD377595B506DE1',
  layoutFrames: '92C0B4F23C7589EE29413450AFA2EBABE7C054BE9EA39698FACCE4B2BFA78AFD',
  fidelityOverlays: '84061610D789FE73528537CCA78791BAB2699774CD4ED190D3ACACCE293724A0',
};
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const normalize = value => String(value).replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1').trim();
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
function deriveSourceLineHeight(block) {
  const rows = (block.lines ?? []).map(line => {
    const span = line.spans.find(item => !item.renderOnlyStrokePass && item.text?.trim());
    return span?.origin && Number.isFinite(span.origin[1]) && Number.isFinite(span.size)
      ? { baselinePt: span.origin[1], fontSizePt: span.size }
      : null;
  }).filter(Boolean);
  assert.ok(rows.length >= 2, `${block.id}: source baselines are insufficient to derive leading`);
  const leadingIntervalsPt = rows.slice(1).map((row, index) => row.baselinePt - rows[index].baselinePt);
  const leadingPt = median(leadingIntervalsPt);
  const fontSizePt = median(rows.map(row => row.fontSizePt));
  assert.ok(leadingIntervalsPt.every(interval => Math.abs(interval - leadingPt) < 0.002),
    `${block.id}: source leading is not uniform; do not infer a single translated line height`);
  const lineHeight = Math.round((leadingPt / fontSizePt) * 1000) / 1000;
  return {
    baselineYsPt: rows.map(row => row.baselinePt),
    leadingIntervalsPt,
    leadingPt,
    fontSizePt,
    translatedFlowLineHeight: lineHeight,
    derivation: 'median adjacent source PDF baseline interval divided by median source font size',
  };
}
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
async function replaceKnownGeneratedArtifact(path, value, previousSha256) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    const existing = await readFile(path);
    if (existing.equals(bytes)) return;
    assert.equal(sha256(existing), previousSha256, `Refusing to replace unexpected artifact: ${path}`);
    await writeFile(path, bytes);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

assert.equal(sha256(await readFile(sourcePdf)), expected.sourcePdf, 'Official source PDF changed');
const sourceFiles = {
  background: join(sourceDir, 'background.webp'),
  dom: join(sourceDir, 'page_062_dom.json'),
  inlineElements: join(sourceDir, 'inline_elements.json'),
  layoutFrames: join(sourceDir, 'layout_frames.json'),
  fidelityOverlays: join(sourceDir, 'fidelity_overlays.json'),
};
const sourceBytes = Object.fromEntries(await Promise.all(Object.entries(sourceFiles)
  .map(async ([key, path]) => [key, await readFile(path)])));
for (const [key, bytes] of Object.entries(sourceBytes)) {
  assert.equal(sha256(bytes), expected[key], `Canonical p.62 ${key} changed`);
}

const dom = JSON.parse(sourceBytes.dom.toString('utf8'));
const targets = [
  { blockIndex: 1, blockId: 'block_14', key: 'page_62_block_1', label: 'Targeting Priority opening paragraph' },
  { blockIndex: 2, blockId: 'block_15', key: 'page_62_block_2', label: 'Targeting Priority eligibility paragraph' },
];
for (const target of targets) {
  target.block = dom.blocks[target.blockIndex];
  assert.equal(target.block?.id, target.blockId, `${target.label}: source block moved`);
  assert.equal((target.block.typographicUnits ?? []).length, 0, `${target.label}: semantic units were added; reassess keys`);
  assert.equal(target.block.typographicSpanUnits.length, 5, `${target.label}: inline style group map changed`);
  target.lineIds = target.block.lines.map(line => line.id);
  target.source = normalize(target.block.lines.flatMap(line => line.spans
    .filter(span => !span.renderOnlyStrokePass).map(span => span.text ?? '')).join(''));
  target.sourceLineHeight = deriveSourceLineHeight(target.block);
}
assert.equal(targets[0].source,
  'An Intelligent Combatants AI Steps will usually specify which figure will be targeted when an Intelligent Combatant takes an Action or uses Abilities. Sometimes, this will be something specific like the opponent with the lowest HP, or the target with the lowest Armor Value. Other times, it simply doesn’t specify.',
  'Opening paragraph source changed');
assert.equal(targets[1].source,
  'In both cases, players will refer to the specific Action being used to determine eligible targets. For Attack Actions, targets must be within the listed Range and within Line of Sight. For Spell Actions, targets must be within SOI. If the AI Step of an Intelligent Combatant further specifies a target, targets meeting the specific criteria are considered the eligible targets for that Action.',
  'Eligibility paragraph source changed');

const inline = JSON.parse(sourceBytes.inlineElements.toString('utf8'));
const targetLineIds = new Set(targets.flatMap(target => target.lineIds));
assert.equal((inline.elements ?? []).filter(item => targetLineIds.has(item.anchor?.lineId)).length, 0,
  'A semantic source symbol appeared in the two legacy blocks; preserve it before proposing text');

const v1Snapshot = JSON.parse(await readFile(v1SnapshotPath, 'utf8'));
const v1Proposal = JSON.parse(await readFile(v1ProposalPath, 'utf8'));
assert.equal(v1Proposal.status, 'isolated-proposal-copyfit-verified-pending-human-review');
assert.deepEqual(v1Proposal.sourceHashes, expected, 'p.62 v1 source hashes changed');
const baseline = JSON.parse(await readFile(join(v1ProofDir, 'preexisting-payload-records.json'), 'utf8'));
const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`Payload read failed: ${response.status}`);
const payload = await response.json();
const currentRecords = (payload.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_62_'))
  .sort((a, b) => Number(a.id) - Number(b.id));
const currentBaseline = currentRecords.map(doc => ({
  id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt, sha256: sha256(stable(doc)),
}));
assert.deepEqual(currentBaseline, baseline.records, 'Existing p.62 Payload records changed');
const newKeys = targets.map(target => target.key);
assert.ok(!currentRecords.some(doc => newKeys.includes(doc.spanKey)), 'A new legacy key is already present in Payload');
const payloadPreservation = {
  method: 'Payload API GET only',
  page: 62,
  baselineRecordCount: baseline.records.length,
  currentRecordCount: currentBaseline.length,
  recordsMatchByIdKeyTimestampAndSha256: true,
  newCandidateKeysAbsent: true,
  candidateKeys: newKeys,
  writesAttempted: 0,
  records: currentBaseline,
};

const makeSegment = (text, font = 'OptimaLTStd', size = 10, weight = 400, style = 'normal') => ({
  text, font, size, color: '#231f20', weight, style,
});
const candidates = [
  {
    spanKey: targets[0].key,
    language: 'pt-BR',
    data: {
      schemaVersion: 2,
      spanKey: targets[0].key,
      textAlign: 'left',
      lineHeight: targets[0].sourceLineHeight.translatedFlowLineHeight,
      lineHeightMode: 'custom',
      segments: [
        makeSegment('As Etapas de '),
        makeSegment('IA', 'OptimaLTStd-Bold', 9, 700),
        makeSegment(' dos Combatentes Inteligentes geralmente indicam qual Miniatura será alvo quando um Combatente Inteligente realiza uma Ação ou usa Habilidades. Às vezes, especificam o alvo, como o oponente com menos '),
        makeSegment('HP', 'OptimaLTStd-Bold', 9, 700),
        makeSegment(' ou o alvo com menor Valor de Armadura. Em outros casos, não especificam o alvo.'),
      ],
      managedSourceSymbols: [],
    },
  },
  {
    spanKey: targets[1].key,
    language: 'pt-BR',
    data: {
      schemaVersion: 2,
      spanKey: targets[1].key,
      textAlign: 'left',
      lineHeight: targets[1].sourceLineHeight.translatedFlowLineHeight,
      lineHeightMode: 'custom',
      segments: [
        makeSegment('Nos dois casos, os jogadores devem consultar a Ação em questão para determinar os alvos elegíveis. Em Ações de Ataque, os alvos devem estar dentro do Alcance indicado e da Linha de Visão. Em Ações de Feitiço, os alvos devem estar dentro de '),
        makeSegment('SOI', 'OptimaLTStd-Bold', 9, 700),
        makeSegment('. Se a Etapa de '),
        makeSegment('IA', 'OptimaLTStd-Bold', 9, 700),
        makeSegment(' de um Combatente Inteligente especificar o alvo com mais detalhes, os alvos que atenderem aos critérios indicados serão elegíveis para aquela Ação.'),
      ],
      managedSourceSymbols: [],
    },
  },
];
const candidateTexts = candidates.map(candidate => candidate.data.segments.map(segment => segment.text).join(''));
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, 2, 'Candidate keys are duplicated');
assert.equal(normalize(candidateTexts[0]), normalize(
  'As Etapas de IA dos Combatentes Inteligentes geralmente indicam qual Miniatura será alvo quando um Combatente Inteligente realiza uma Ação ou usa Habilidades. Às vezes, especificam o alvo, como o oponente com menos HP ou o alvo com menor Valor de Armadura. Em outros casos, não especificam o alvo.',
));
assert.equal(normalize(candidateTexts[1]), normalize(
  'Nos dois casos, os jogadores devem consultar a Ação em questão para determinar os alvos elegíveis. Em Ações de Ataque, os alvos devem estar dentro do Alcance indicado e da Linha de Visão. Em Ações de Feitiço, os alvos devem estar dentro de SOI. Se a Etapa de IA de um Combatente Inteligente especificar o alvo com mais detalhes, os alvos que atenderem aos critérios indicados serão elegíveis para aquela Ação.',
));

const snapshotPageDir = join(snapshotDir, 'pages', 'page_062');
await mkdir(snapshotPageDir, { recursive: true });
const copiedHashes = {};
for (const name of (await readdir(sourceDir)).sort()) {
  const bytes = await readFile(join(sourceDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}
const sourceBoxes = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdf, '62',
], { encoding: 'utf8' });
if (sourceBoxes.status !== 0) throw new Error(`Source page boxes failed: ${sourceBoxes.stderr || sourceBoxes.stdout}`);
const snapshot = {
  ...v1Snapshot,
  translations: [...v1Snapshot.translations, ...candidates]
    .sort((a, b) => String(a.spanKey).localeCompare(String(b.spanKey))),
  assetPages: [62], page: 62, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes: JSON.parse(sourceBoxes.stdout),
};
assert.equal(new Set(snapshot.translations.map(item => item.spanKey)).size, snapshot.translations.length,
  'Snapshot contains duplicate span keys');
assert.equal(snapshot.translations.length, baseline.records.length + v1Proposal.candidateRecordCount + candidates.length,
  'Snapshot should contain eight preserved records and four proposal candidates');
await replaceKnownGeneratedArtifact(
  snapshotPath,
  `${JSON.stringify(snapshot, null, 2)}\n`,
  '5C88BEBA393345FAA18625971736209A954216B8966A1D28B66C31F151B83647',
);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({ sourcePdf: expected.sourcePdf, pageAssets: copiedHashes }, null, 2)}\n`);
await immutableWrite(join(proofDir, 'payload-baseline.json'), `${JSON.stringify({
  readOnlyCapture: true, page: 62, recordCount: currentBaseline.length, records: currentBaseline,
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'payload-preservation-v2.json'), `${JSON.stringify(payloadPreservation, null, 2)}\n`);
const bodyReadOnly = JSON.parse(await readFile(join(v1ProofDir, 'normal-editor-units-v1.json'), 'utf8'));
const legacyReadOnly = JSON.parse(await readFile(join(v1ProofDir, 'preceding-blocks-editor-readonly-v2.json'), 'utf8'));
assert.equal(bodyReadOnly.nonGetRequestsAttempted, 0);
assert.equal(bodyReadOnly.canonicalPageFilesUnchanged, true);
assert.ok(bodyReadOnly.trials.every(trial => trial.sourceTextMatched && trial.editable && trial.cancelReturnedWithoutSave));
assert.equal(legacyReadOnly.blockedWriteRequestCount, 0);
assert.equal(legacyReadOnly.canonicalPageFilesUnchanged, true);
assert.deepEqual(legacyReadOnly.targets.map(target => target.key).sort(), newKeys.sort());

if (!finalize) {
  console.log(JSON.stringify({
    status: 'prepared-isolated-full-section-snapshot',
    page: 62,
    newCandidates: candidates.map(candidate => candidate.spanKey),
    preservedPayloadRecords: currentBaseline.length,
    carriedForwardV1Candidates: v1Proposal.candidateRecordCount,
    totalSnapshotRecords: snapshot.translations.length,
    candidateKeysUnique: true,
    semanticSymbolsInNewBlocks: 0,
    sourceHashes: expected,
    snapshot: snapshotPath,
  }, null, 2));
  process.exit(0);
}

const viewerShot = join(proofDir, 'viewer-page-062-pt-BR-v2.png');
const printShot = join(proofDir, 'print-page-062-pt-BR-v2.png');
const cropShot = join(proofDir, 'source-vs-export-full-section-v2.png');
for (const path of [exportPdfPath, viewerShot, printShot, cropShot]) {
  const bytes = await readFile(path);
  assert.ok(bytes.length > 50_000, `Missing or incomplete p.62 full-section evidence: ${path}`);
}
assert.ok((await readFile(metricsPath)).length > 1_000, 'Viewer/print metrics JSON is missing or incomplete');
const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
assert.equal(metrics.page, 62);
assert.equal(metrics.language, 'pt-BR');
assert.deepEqual(metrics.viewer?.symbols?.map(item => item.id), ['attack.melee']);
assert.deepEqual(metrics.print?.symbols?.map(item => item.id), ['attack.melee']);
assert.equal(legacyReadOnly.targets.every(target => target.sourceMatched && target.editable && target.cancelReturnedWithoutSave), true);

const pdfTextResult = spawnSync('python', ['-c', [
  'import json, pymupdf, sys',
  'doc=pymupdf.open(sys.argv[1])',
  'text="\\n".join(page.get_text() for page in doc)',
  'print(json.dumps({"pageCount":len(doc),"text":text},ensure_ascii=True))',
].join('\n'), exportPdfPath], { encoding: 'utf8' });
if (pdfTextResult.status !== 0) throw new Error(`PDF text extraction failed: ${pdfTextResult.stderr || pdfTextResult.stdout}`);
const pdf = JSON.parse(pdfTextResult.stdout);
const pdfText = normalize(pdf.text);
assert.equal(pdf.pageCount, 1, 'Expected a single-page p.62 PDF');
assert.equal(pdf.text.includes('\uFFFD'), false, 'PDF extraction contains U+FFFD');
for (let index = 0; index < candidates.length; index += 1) {
  assert.ok(pdfText.includes(normalize(candidateTexts[index])), `PDF omitted full proposal override ${candidates[index].spanKey}`);
  assert.ok(!pdfText.includes(targets[index].source), `PDF fell back to the English source for ${candidates[index].spanKey}`);
}
for (const oldCandidate of v1Proposal.candidates) {
  const text = normalize(oldCandidate.data.segments.map(segment => segment.symbolId ? '' : segment.text).join(''));
  assert.ok(pdfText.includes(text), `PDF did not carry forward p.62 v1 candidate ${oldCandidate.spanKey}`);
}
const pdfVerification = {
  page: 62,
  language: 'pt-BR',
  pageCount: pdf.pageCount,
  exportedPdfSha256: sha256(await readFile(exportPdfPath)),
  replacementCharacterCount: [...pdf.text].filter(character => character === '\uFFFD').length,
  allFourTargetOverridesPresent: true,
  englishFallbackAbsentForNewBlocks: true,
  carriedForwardV1BodyAndExample: true,
  semanticSymbolInViewerAndPrint: 'attack.melee',
  viewerSymbolCount: metrics.viewer.symbols.length,
  printSymbolCount: metrics.print.symbols.length,
  snapshotRecordCount: snapshot.translations.length,
};

const evidenceRoot = 'docs/project-progress/evidence/2026-10-15-p062-ai-target-priority-v2';
await replaceKnownGeneratedArtifact(
  join(proofDir, 'pdf-text-verification-v2.json'),
  `${JSON.stringify(pdfVerification, null, 2)}\n`,
  'FD835E4C5F9227B03DAF101C5D1D87AD20C2FC5D53536CEFC999444E359E2A94',
);
const editorReceipt = {
  scope: 'Normal Viewer/Admin source-Editor checks; no proposed PT-BR translation saved',
  p62UnitReceipt: bodyReadOnly,
  precedingLegacyBlocksReceipt: legacyReadOnly,
};
const editorReceiptBytes = `${JSON.stringify(editorReceipt, null, 2)}\n`;
await replaceKnownGeneratedArtifact(
  join(proofDir, 'editor-readonly-v2.json'),
  editorReceiptBytes,
  'EEB487BD798232EFC95E162B80F14EEA9F5E51F67CC8530BDD6850103B44EB00',
);
const trackedEvidence = [
  ['normal-viewer-page-062-en.png', join(v1ProofDir, 'normal-viewer-page-062-en.png')],
  ['viewer-page-062-pt-BR.png', viewerShot],
  ['print-page-062-pt-BR.png', printShot],
  ['source-vs-export-full-section.png', cropShot],
  ['proposal-page-062-pt-BR.pdf', exportPdfPath],
  ['editor-readonly-receipt.json', join(proofDir, 'editor-readonly-v2.json')],
  ['payload-preservation-receipt.json', join(proofDir, 'payload-preservation-v2.json')],
  ['pdf-text-verification.json', join(proofDir, 'pdf-text-verification-v2.json')],
];
const previousEvidenceHashes = {
  'viewer-page-062-pt-BR.png': '5E88300C85D9B2A05251AB89D93090B4A44C36372BE8258FAF13AEBD685F598C',
  'print-page-062-pt-BR.png': 'CA4CE123860F13B6875BE7EB78A95EC1808ABE0D911D0F06F6B2AF2779138569',
  'source-vs-export-full-section.png': 'AA4F8B0B9A70ACB7F623DD55D813C0C1A05B81E52EF9251631E9E3A5780700CD',
  'proposal-page-062-pt-BR.pdf': '570D126ADCF011DC4BB3A94CE0F534D19D39FF72D57612574AD5A4119312D002',
  'pdf-text-verification.json': 'FD835E4C5F9227B03DAF101C5D1D87AD20C2FC5D53536CEFC999444E359E2A94',
};
for (const [destination, source] of trackedEvidence) {
  const bytes = await readFile(source);
  if (destination === 'editor-readonly-receipt.json') {
    await replaceKnownGeneratedArtifact(
      resolve(root, `${evidenceRoot}/${destination}`),
      bytes,
      'EEB487BD798232EFC95E162B80F14EEA9F5E51F67CC8530BDD6850103B44EB00',
    );
  } else if (previousEvidenceHashes[destination]) {
    await replaceKnownGeneratedArtifact(
      resolve(root, `${evidenceRoot}/${destination}`),
      bytes,
      previousEvidenceHashes[destination],
    );
  } else {
    await immutableWrite(resolve(root, `${evidenceRoot}/${destination}`), bytes);
  }
}

const proposal = {
  page: 62,
  family: 'Complete “Targeting Priority” section — four paragraphs including the previously verified Body+Example pair',
  status: 'isolated-full-section-proposal-copyfit-verified-pending-human-review',
  sourceHashes: { sourcePdf: expected.sourcePdf, ...expected },
  preservedPayloadRecordCount: currentBaseline.length,
  previousCandidateCount: v1Proposal.candidateRecordCount,
  newCandidateCount: candidates.length,
  totalCandidateCount: v1Proposal.candidateRecordCount + candidates.length,
  candidateKeysUnique: true,
  newSources: targets.map(target => ({ blockIndex: target.blockIndex, blockId: target.blockId, key: target.key, text: target.source })),
  newProposals: candidates.map((candidate, index) => ({
    spanKey: candidate.spanKey, text: candidateTexts[index], segments: candidate.data.segments,
  })),
  sourceLineHeightEvidence: targets.map(target => ({ key: target.key, ...target.sourceLineHeight })),
  richTextPreserved: {
    aiAbbreviationsBold9Pt: true,
    hpAndSoiBold9Pt: true,
    sourceSymbolsInNewBlocks: 0,
    priorExampleAttackMeleePreserved: true,
  },
  terminologyPendingHumanReview: [
    'Combatante(s) Inteligente(s), Etapa(s) de IA, Ação/Habilidade, Ações de Ataque, Ações de Feitiço, Alcance, Linha de Visão e Valor de Armadura are consistent with current local proposals but are not all in the official glossary.',
    'HP and SOI remain unchanged as printed stat/mechanic abbreviations; that local choice is pending human review.',
  ],
  editorVerification: {
    allFourSourceUnitsOrBlocksEditable: true,
    cancelReturnedWithoutSave: true,
    writeRequestsAttempted: 0,
    canonicalPageFilesUnchanged: true,
    proposalLoadedIntoNormalEditor: false,
  },
  pdfVerification,
  evidence: trackedEvidence.map(([name]) => `${evidenceRoot}/${name}`),
  note: 'The two earlier paragraphs now have confirmed whole-block legacy Editor targets. Their translation remains isolated with the existing Body+Example proposals. No Payload, canonical sidecar, human translation, source PDF, or approved terminology was written.',
  candidates: [...v1Proposal.candidates, ...candidates],
};
const proposalPath = resolve(root, 'docs/translations/proposals/page-062-targeting-priority-full-section-proposal-2026-10-15-v2.json');
const proposalBytes = `${JSON.stringify(proposal, null, 2)}\n`;
await replaceKnownGeneratedArtifact(
  join(proofDir, 'proposal-p062-targeting-priority-full-section-v2.json'),
  proposalBytes,
  '1705A7CD4F5264734E363FDE29C46E80C004DA1649FDBEFE34F75B4D26BC4C01',
);
await replaceKnownGeneratedArtifact(
  proposalPath,
  proposalBytes,
  '1705A7CD4F5264734E363FDE29C46E80C004DA1649FDBEFE34F75B4D26BC4C01',
);
console.log(JSON.stringify({
  status: 'finalized-isolated-full-section-proposal',
  page: 62,
  newCandidates: candidates.length,
  totalCandidates: proposal.totalCandidateCount,
  preservedPayloadRecords: currentBaseline.length,
  pdfVerification,
  proposal: proposalPath,
  evidence: trackedEvidence.map(([name]) => `${evidenceRoot}/${name}`),
}, null, 2));
