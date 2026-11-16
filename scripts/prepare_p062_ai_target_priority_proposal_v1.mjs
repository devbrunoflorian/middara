import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Prepare an isolated translation for the p.62 AI Target Priority Body+Example.
// Existing PT-BR records are read and copied byte-for-byte into the snapshot;
// neither Payload nor canonical page data is written.
const root = process.cwd();
const mode = process.argv.includes('--finalize') ? 'finalize' : 'prepare';
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p062-ai-target-priority-v1');
const snapshotDir = join(proofDir, 'snapshot');
const sourceDir = resolve(root, 'apps/web/public/pages/page_062');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
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
const norm = value => String(value).replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1').trim();
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

assert.equal(sha256(await readFile(sourcePdfPath)), expected.sourcePdf, 'Official source PDF changed');
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
const block = dom.blocks.find(item => item.id === 'block_16');
const bodyUnit = block?.typographicUnits?.find(item => item.id === 'p62-ai-target-priority-body');
const exampleUnit = block?.typographicUnits?.find(item => item.id === 'p62-ai-target-priority-example');
assert.ok(bodyUnit && exampleUnit, 'The p.62 Body and Example editorial units must both exist');
assert.deepEqual(bodyUnit.field.lineIds, ['line_16_0', 'line_16_1', 'line_16_2'], 'p.62 Body line ownership changed');
assert.deepEqual(exampleUnit.field.lineIds, ['line_16_3', 'line_16_4', 'line_16_5', 'line_16_6', 'line_16_7', 'line_16_8'], 'p.62 Example line ownership changed');
const bodySource = norm(bodyUnit.field.lineIds.flatMap(lineId => {
  const line = block.lines.find(item => item.id === lineId);
  return (line?.spans ?? []).filter(span => !span.renderOnlyStrokePass).map(span => span.text ?? '');
}).join(' '));
const exampleTextOnlySource = norm(exampleUnit.field.lineIds.flatMap(lineId => {
  const line = block.lines.find(item => item.id === lineId);
  return (line?.spans ?? []).filter(span => !span.renderOnlyStrokePass).map(span => span.text ?? '');
}).join(' '));
assert.equal(bodySource,
  'If a specific target is never mentioned, or if there are ever multiple eligible targets even after a more specific target is identified, Combatants will prioritize the target that is closer to the front of the Initiative Track.',
  'p.62 target-priority Body source text changed');
assert.equal(exampleTextOnlySource,
  'Example: An AI Step instructs a Cave Sickle to make a ATK against the target with the most Damage. There are 2 eligible targets, both are within Range, which is adjacent, and they both have the same amount of Damage. Out of the two, the target closer to the front of the Initiative Track would be the target of the Attack.',
  'p.62 target-priority Example source text changed');

const inline = JSON.parse(sourceBytes.inlineElements.toString('utf8'));
const targetLineIds = new Set(exampleUnit.field.lineIds);
const targetSymbols = (inline.elements ?? []).filter(item => targetLineIds.has(item.anchor?.lineId));
assert.equal(targetSymbols.length, 1, 'Expected exactly one source inline symbol in the Example');
const sourceSymbol = targetSymbols[0];
assert.equal(sourceSymbol.symbolId, 'attack.melee', 'The Example source symbol changed');
assert.deepEqual({ lineId: sourceSymbol.anchor.lineId, spanIndex: sourceSymbol.anchor.spanIndex, side: sourceSymbol.anchor.side },
  { lineId: 'line_16_4', spanIndex: 0, side: 'before' }, 'The source symbol anchor changed');

const candidateKeys = {
  body: 'page_62_unit_p62-ai-target-priority-body__pt-BR',
  example: 'page_62_unit_p62-ai-target-priority-example__pt-BR',
};
const makeSegment = (text, font = 'OptimaLTStd', size = 10, weight = 400, style = 'normal') => ({
  text, font, size, color: '#231f20', weight, style,
});
const objectSymbol = {
  ...makeSegment('\uFFFC', 'OptimaLTStd', sourceSymbol.anchor.sizePt, 400),
  symbolId: sourceSymbol.symbolId,
  symbolMetrics: sourceSymbol.metrics,
};
const bodyText = 'Se nenhum alvo específico for mencionado, ou se ainda houver vários alvos elegíveis mesmo depois de um alvo mais específico ser identificado, os Combatentes priorizam o alvo que estiver mais à frente na Trilha de Iniciativa.';
const exampleSegments = [
  makeSegment('Exemplo:', 'AGaramondPro-Bold', 12, 700),
  makeSegment(' ', 'OptimaLTStd-Bold', 10, 700),
  makeSegment('Uma Etapa de '),
  makeSegment('IA', 'OptimaLTStd-Bold', 9, 700),
  makeSegment(' ', 'OptimaLTStd-Bold', 10, 700),
  makeSegment('instrui um '),
  makeSegment('Cave Sickle', 'OptimaLTStd-BoldItalic', 10, 700, 'italic'),
  makeSegment(' a realizar um '),
  objectSymbol,
  makeSegment(' ', 'OptimaLTStd-Bold', 9, 700),
  makeSegment('ATQ', 'OptimaLTStd-Bold', 9, 700),
  makeSegment(' ', 'OptimaLTStd-Bold', 9, 700),
  makeSegment('contra o alvo com mais Dano. Há '),
  makeSegment('2', 'OptimaLTStd-Bold', 9, 700),
  makeSegment(' alvos elegíveis; ambos estão no Alcance adjacente e têm a mesma quantidade de Dano. Entre os dois, o alvo mais à frente na Trilha de Iniciativa será escolhido para o Ataque.'),
];
const exampleText = exampleSegments.map(segment => segment.symbolId ? '' : segment.text).join('');
assert.equal(bodyText,
  'Se nenhum alvo específico for mencionado, ou se ainda houver vários alvos elegíveis mesmo depois de um alvo mais específico ser identificado, os Combatentes priorizam o alvo que estiver mais à frente na Trilha de Iniciativa.');
assert.ok(exampleSegments.some(segment => segment.symbolId === 'attack.melee'), 'The semantic melee symbol must be preserved');

const candidate = (key, unit, segments, managedSourceSymbols = []) => ({
  spanKey: key,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    spanKey: key,
    bbox: unit.field.bbox,
    textAlign: unit.field.frame?.textAlign ?? 'left',
    lineHeight: unit.field.frame?.lineHeight ?? 1.1,
    lineHeightMode: 'custom',
    segments,
    managedSourceSymbols,
  },
});
const candidates = [
  candidate(candidateKeys.body, bodyUnit, [makeSegment(bodyText)]),
  candidate(candidateKeys.example, exampleUnit, exampleSegments, ['attack.melee']),
];
assert.equal(new Set(candidates.map(item => item.spanKey)).size, 2, 'Candidate keys are not unique');

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
if (!translationsResponse.ok) throw new Error(`Payload read failed: ${translationsResponse.status}`);
const translationsPayload = await translationsResponse.json();
const existingRecords = (translationsPayload.docs ?? [])
  .filter(doc => String(doc.spanKey ?? '').startsWith('page_62_'))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.ok(existingRecords.length >= 1, 'Expected p.62 human-authored PT-BR records to preserve');
assert.ok(!existingRecords.some(doc => Object.values(candidateKeys).includes(doc.spanKey)),
  'A candidate key is already saved in Payload; preserve it and reassess instead of replacing it');
const existingBaseline = existingRecords.map(doc => ({
  id: doc.id,
  spanKey: doc.spanKey,
  updatedAt: doc.updatedAt,
  sha256: sha256(stable(doc)),
}));

const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[and][0][pageNumber][equals]', '62');
framesUrl.searchParams.set('limit', '1000');
const framesResponse = await fetch(framesUrl);
if (!framesResponse.ok) throw new Error(`Payload layout-frame read failed: ${framesResponse.status}`);
const framesPayload = await framesResponse.json();
const aliasesResponse = await fetch(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
if (!aliasesResponse.ok) throw new Error(`Payload symbol-alias read failed: ${aliasesResponse.status}`);
const aliasesPayload = await aliasesResponse.json();

const copiedHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', 'page_062');
await mkdir(snapshotPageDir, { recursive: true });
for (const name of (await readdir(sourceDir)).sort()) {
  const bytes = await readFile(join(sourceDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}
const boxResult = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '62',
], { encoding: 'utf8' });
if (boxResult.status !== 0) throw new Error(`Source PDF boxes failed: ${boxResult.stderr || boxResult.stdout}`);
const sourcePageBoxes = JSON.parse(boxResult.stdout);
const snapshot = {
  translations: [...existingRecords, ...candidates].sort((a, b) => String(a.spanKey).localeCompare(String(b.spanKey))),
  layoutFrames: (framesPayload.docs ?? []).filter(doc => Number(doc.pageNumber) === 62),
  symbolAliasSettings: aliasesPayload.docs ?? [],
  assetPages: [62], page: 62, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes,
};
const snapshotPath = join(snapshotDir, 'snapshot-p062-ai-target-priority-v1-export.json');
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'preexisting-payload-records.json'), `${JSON.stringify({
  readOnlyCapture: true,
  page: 62,
  language: 'pt-BR',
  recordCount: existingBaseline.length,
  records: existingBaseline,
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({ sourcePdf: expected.sourcePdf, pageAssets: copiedHashes }, null, 2)}\n`);

if (mode === 'prepare') {
  console.log(JSON.stringify({
    status: 'prepared-isolated-snapshot',
    page: 62,
    units: Object.values(candidateKeys),
    newCandidates: candidates.length,
    preservedPayloadRecords: existingBaseline.length,
    candidateKeysUnique: true,
    targetSourceSymbol: sourceSymbol.symbolId,
    snapshot: snapshotPath,
    sourceHashes: expected,
  }, null, 2));
  process.exit(0);
}

const exportPdfPath = join(proofDir, 'page-062-pt-BR-proposal-v1.pdf');
const metricsPath = join(proofDir, 'page-062-pt-BR-proposal-metrics-v1.json');
const editorReceiptPath = join(proofDir, 'normal-editor-units-v1.json');
const viewerEvidence = [
  'page-062-pt-BR-viewer-v1.png',
  'page-062-pt-BR-print-v1.png',
  'source-vs-export-family-crop-v1.png',
];
for (const fileName of [...viewerEvidence, 'normal-viewer-page-062-en.png']) {
  const bytes = await readFile(join(proofDir, fileName));
  assert.ok(bytes.length > 50_000, `Missing or incomplete visual proof: ${fileName}`);
}
const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
assert.equal(metrics.page, 62, 'Viewer/print evidence is not for p.62');
assert.equal(metrics.language, 'pt-BR', 'Viewer/print evidence is not PT-BR');
assert.ok(metrics.viewer?.rect?.width > 0 && metrics.print?.rect?.width > 0, 'Viewer/print metrics are incomplete');
assert.deepEqual(metrics.viewer?.symbols?.map(item => item.id), ['attack.melee'], 'Viewer did not render exactly the source melee symbol');
assert.deepEqual(metrics.print?.symbols?.map(item => item.id), ['attack.melee'], 'Print did not render exactly the source melee symbol');

const editorReceipt = JSON.parse(await readFile(editorReceiptPath, 'utf8'));
assert.equal(editorReceipt.page, 62, 'Normal Editor receipt is not for p.62');
assert.equal(editorReceipt.nonGetRequestsAttempted, 0, 'Normal Editor attempted a write request');
assert.equal(editorReceipt.canonicalPageFilesUnchanged, true, 'Normal Editor changed canonical page files');
assert.deepEqual(editorReceipt.canonicalPageHashesBefore, editorReceipt.canonicalPageHashesAfter,
  'Normal Editor canonical hashes differ before/after');
assert.deepEqual(editorReceipt.trials.map(trial => trial.key).sort(), [
  'page_62_unit_p62-ai-target-priority-body__en',
  'page_62_unit_p62-ai-target-priority-example__en',
].sort(), 'Normal Editor did not exercise both p.62 semantic units');
assert.ok(editorReceipt.trials.every(trial => trial.distinctHitTarget && trial.sourceTextMatched
  && trial.editable && trial.cancelReturnedWithoutSave), 'Normal Editor unit checks did not all pass');

const pdfTextResult = spawnSync('python', ['-c', [
  'import json, pymupdf, sys',
  'doc = pymupdf.open(sys.argv[1])',
  'text = "\\n".join(page.get_text() for page in doc)',
  'print(json.dumps({"pageCount": len(doc), "text": text}, ensure_ascii=True))',
].join('\n'), exportPdfPath], { encoding: 'utf8' });
if (pdfTextResult.status !== 0) throw new Error(`Exported PDF text extraction failed: ${pdfTextResult.stderr || pdfTextResult.stdout}`);
const exportedPdf = JSON.parse(pdfTextResult.stdout);
const exportedPdfText = norm(exportedPdf.text);
const expectedExamplePdfText = norm(exampleText);
assert.equal(exportedPdf.pageCount, 1, 'Proposal PDF must contain exactly p.62');
assert.equal(exportedPdf.text.includes('\uFFFD'), false, 'Proposal PDF text extraction contains U+FFFD');
assert.ok(exportedPdfText.includes(norm(bodyText)), 'Exported PDF does not contain the complete proposed Body override');
assert.ok(exportedPdfText.includes(expectedExamplePdfText), 'Exported PDF does not contain the complete proposed Example override');
const pdfVerification = {
  page: 62,
  language: 'pt-BR',
  pageCount: exportedPdf.pageCount,
  exportedPdfSha256: sha256(await readFile(exportPdfPath)),
  replacementCharacterCount: [...exportedPdf.text].filter(character => character === '\uFFFD').length,
  bodyOverrideTextPresent: exportedPdfText.includes(norm(bodyText)),
  exampleOverrideTextPresent: exportedPdfText.includes(expectedExamplePdfText),
  sourceFallbackOnly: false,
  semanticSymbol: sourceSymbol.symbolId,
  exporterVerifiedSnapshotRecordCount: snapshot.translations.length,
};
const trackedEvidenceDir = 'docs/project-progress/evidence/2026-10-15-p062-ai-target-priority-v1';
const trackedEvidenceFiles = [
  { source: 'normal-viewer-page-062-en.png', destination: `${trackedEvidenceDir}/normal-viewer-page-062-en.png` },
  { source: 'page-062-pt-BR-viewer-v1.png', destination: `${trackedEvidenceDir}/viewer-page-062-pt-BR.png` },
  { source: 'source-vs-export-family-crop-v1.png', destination: `${trackedEvidenceDir}/source-vs-export-family-crop.png` },
  { source: 'page-062-pt-BR-proposal-v1.pdf', destination: `${trackedEvidenceDir}/proposal-page-062-pt-BR.pdf` },
  { source: 'normal-editor-units-v1.json', destination: `${trackedEvidenceDir}/normal-editor-receipt.json` },
  { source: 'pdf-text-verification-v1.json', destination: `${trackedEvidenceDir}/pdf-text-verification.json` },
];
await immutableWrite(join(proofDir, 'pdf-text-verification-v1.json'), `${JSON.stringify(pdfVerification, null, 2)}\n`);
for (const file of trackedEvidenceFiles) {
  await immutableWrite(resolve(root, file.destination), await readFile(join(proofDir, file.source)));
}
await immutableWrite(
  resolve(root, `${trackedEvidenceDir}/payload-preservation-receipt.json`),
  await readFile(join(proofDir, 'payload-preservation-v1.json')),
);

const proposal = {
  page: 62,
  units: ['p62-ai-target-priority-body', 'p62-ai-target-priority-example'],
  family: 'Body + Example — AI Target Priority',
  status: 'isolated-proposal-copyfit-verified-pending-human-review',
  sourceHashes: { sourcePdf: expected.sourcePdf, ...expected },
  existingPayloadRecords: existingBaseline,
  preservedExistingRecordCount: existingBaseline.length,
  candidateRecordCount: candidates.length,
  candidateKeysUnique: new Set(candidates.map(item => item.spanKey)).size === candidates.length,
  sourceText: {
    body: bodySource,
    example: exampleTextOnlySource.replace('to make a ATK', 'to make a [[symbol:attack.melee]] ATK'),
  },
  proposalText: { body: bodyText, example: exampleText },
  richText: {
    exampleLabelStylePreserved: true,
    aiAbbreviationBoldPreservedAsIA: true,
    creatureNameBoldItalicPreserved: true,
    atqAbbreviationBoldPreserved: true,
    numeral2BoldPreserved: true,
    semanticSymbolOrder: ['attack.melee'],
    sourceFontsAndFramesUnchanged: true,
  },
  terminologyPendingHumanReview: [
    'Initiative Track → Trilha de Iniciativa appears as a repeated candidate in glossary-candidates.md but is not official glossary terminology.',
    'ATK → ATQ follows the saved p.50 local form; Range → Alcance follows saved p.50 usage. Neither is approved as a global glossary decision.',
    'AI Step → Etapa de IA follows existing p.62 saved usage. Damage → Dano and the positional wording “mais à frente” remain proposed local forms.',
    'Cave Sickle remains the printed creature name, matching saved p.50 examples.',
  ],
  copyfit: {
    sourceBodyLines: bodyUnit.field.lineIds.length,
    sourceExampleLines: exampleUnit.field.lineIds.length,
    lineHeight: bodyUnit.field.frame?.lineHeight ?? 1.1,
    revisionBudget: 2,
    currentAttempt: 1,
    status: 'verified-in-isolated-viewer-pdf-and-normal-editor',
    evidence: trackedEvidenceFiles.map(file => file.destination),
    pdfVerification,
    normalEditorVerification: {
      bothUnitsEditable: true,
      cancelReturnedWithoutSave: true,
      writeRequestsAttempted: 0,
      canonicalPageFilesUnchanged: true,
    },
  },
  note: 'Only the two p.62 AI Target Priority units are proposed. The Example’s source attack.melee symbol, rich emphasis, and number styling are retained. Existing p.62 Payload records are included unchanged in the isolated snapshot. No Payload, canonical sidecar, source PDF, or human translation was written.',
  candidates,
};
const trackedProposalPath = join(root, 'docs/translations/proposals/page-062-ai-target-priority-example-proposal-2026-10-15-v1.json');
await immutableWrite(join(proofDir, 'proposal-p062-ai-target-priority-v1.json'), `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(trackedProposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
console.log(JSON.stringify({
  status: 'finalized-isolated-proposal',
  page: 62,
  units: proposal.units,
  newCandidates: proposal.candidateRecordCount,
  preservedPayloadRecords: proposal.preservedExistingRecordCount,
  uniqueKeys: proposal.candidateKeysUnique,
  sourceSymbol: sourceSymbol.symbolId,
  pdfVerification,
  evidence: [...trackedEvidenceFiles.map(file => file.destination), `${trackedEvidenceDir}/payload-preservation-receipt.json`],
}, null, 2));
