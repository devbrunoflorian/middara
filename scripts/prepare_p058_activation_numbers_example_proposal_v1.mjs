import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Prepare the structurally separated p.58 body and Example as an isolated
// PT-BR proposal. Payload is read-only; canonical page data is not modified.
const root = process.cwd();
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p058-activation-numbers-v1');
const snapshotDir = join(proofDir, 'snapshot');
const trackedEvidenceDir = 'docs/project-progress/evidence/2026-10-15-p058-activation-numbers-v1';
const sourceDir = resolve(root, 'apps/web/public/pages/page_058');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const expected = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  background: '32F147D3705A0564F2551A4B02D3172D51B7CD022F241A984D1E9C42D1F87001',
  dom: 'EE07048D46427E0919E0AB341298D3D0A16274A9B31F9EFE59C33A2CB3FAA375',
  inlineElements: '75D82BA8996F7698F21FFBE5F6899E556A69C9D8158BC265ADF58E2171882C46',
  layoutFrames: 'E96213AF53CFADD3A4AAAAC3057E36003BD199149DA538F5DC7A658D26D9BFA1',
  fidelityOverlays: 'E3567A4A6637DDF8211EE236CC8D908A0B6D84DF9A8FAD4B45665DE107925671',
};
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed proof artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

assert.equal(sha256(await readFile(sourcePdfPath)), expected.sourcePdf, 'Official source PDF changed');
const sourceFiles = {
  background: join(sourceDir, 'background.webp'),
  dom: join(sourceDir, 'page_058_dom.json'),
  inlineElements: join(sourceDir, 'inline_elements.json'),
  layoutFrames: join(sourceDir, 'layout_frames.json'),
  fidelityOverlays: join(sourceDir, 'fidelity_overlays.json'),
};
const sourceBytes = Object.fromEntries(await Promise.all(Object.entries(sourceFiles)
  .map(async ([key, path]) => [key, await readFile(path)])));
for (const [key, bytes] of Object.entries(sourceBytes)) {
  assert.equal(sha256(bytes), expected[key], `Canonical p.58 ${key} changed`);
}

const dom = JSON.parse(sourceBytes.dom.toString('utf8'));
const pageBlock = dom.blocks.find(block => block.id === 'block_23');
assert.ok(pageBlock, 'Missing p.58 Activation Numbers block');
const bodyUnit = pageBlock.typographicUnits?.find(item => item.id === 'p58-activation-numbers-body');
const exampleUnit = pageBlock.typographicUnits?.find(item => item.id === 'p58-activation-numbers-example');
assert.ok(bodyUnit && exampleUnit, 'Missing the separate p.58 body and Example editorial units');
const bodyLineIds = ['line_23_0', 'line_23_1', 'line_23_2', 'line_23_3', 'line_23_4'];
const exampleLineIds = ['line_23_5', 'line_23_6', 'line_23_7', 'line_23_8', 'line_23_9'];
assert.deepEqual(bodyUnit.field.lineIds, bodyLineIds, 'p.58 body line ownership changed');
assert.deepEqual(exampleUnit.field.lineIds, exampleLineIds, 'p.58 Example line ownership changed');
const norm = value => String(value).replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1').trim();
const getSourceText = lineIds => norm(lineIds.flatMap(lineId => {
  const line = pageBlock.lines.find(item => item.id === lineId);
  return (line?.spans ?? []).filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '');
}).join(' '));
const bodySource = getSourceText(bodyLineIds);
const exampleSource = getSourceText(exampleLineIds);
assert.equal(bodySource,
  'Intelligent Combatants with more than 3 copies of the same figure will have 2 or more copies of their Combatant Card. These cards will have a different set of Activation Numbers on each Combatant Card. In addition, these Combatant Cards will have 2 or more different Initiative Cards with matching Activation Numbers.',
  'p.58 body source text changed');
assert.equal(exampleSource,
  'Example: 6 Cave Sickles start on the board during an Encounter. One player would manage the Combatant Card for Cave Sickles 1, 2, and 3, and another player would manage the card for Cave Sickles 4, 5, and 6. Since each Cave Sickle Group has a different Initiative Card, Cave Sickle 1, 2, and 3 will activate at a different time than Cave Sickle 4, 5, and 6.',
  'p.58 Example source text changed');

const bodyKey = 'page_58_unit_p58-activation-numbers-body__pt-BR';
const exampleKey = 'page_58_unit_p58-activation-numbers-example__pt-BR';
const makeSegment = (text, font = 'OptimaLTStd', size = 10, weight = 400) => ({
  text, font, size, color: '#231f20', weight, style: 'normal',
});
const boldNumber = value => makeSegment(String(value), 'OptimaLTStd-Bold', 9, 700);
const bodySegments = [
  makeSegment('Combatentes Inteligentes com mais de '),
  boldNumber(3),
  makeSegment(' cópias da mesma miniatura terão '),
  boldNumber(2),
  makeSegment(' ou mais cópias de sua Carta de Combatente. Cada Carta de Combatente terá um conjunto diferente de Números de Ativação. Além disso, essas Cartas de Combatente terão '),
  boldNumber(2),
  makeSegment(' ou mais Cartas de Iniciativa distintas, com Números de Ativação correspondentes.'),
];
const exampleSegments = [
  makeSegment('Exemplo:', 'AGaramondPro-Bold', 12, 700),
  makeSegment(' ', 'OptimaLTStd-Bold', 10, 700),
  boldNumber(6),
  makeSegment(' Cave Sickles começam no tabuleiro durante um Encontro. Um jogador cuidaria da Carta de Combatente dos Cave Sickles '),
  boldNumber(1), makeSegment(', '), boldNumber(2), makeSegment(' e '), boldNumber(3),
  makeSegment(', e outro cuidaria da carta dos Cave Sickles '),
  boldNumber(4), makeSegment(', '), boldNumber(5), makeSegment(' e '), boldNumber(6),
  makeSegment('. Como cada grupo de Cave Sickles tem uma Carta de Iniciativa diferente, os Cave Sickles '),
  boldNumber(1), makeSegment(', '), boldNumber(2), makeSegment(' e '), boldNumber(3),
  makeSegment(' serão ativados em um momento diferente dos Cave Sickles '),
  boldNumber(4), makeSegment(', '), boldNumber(5), makeSegment(' e '), boldNumber(6),
  makeSegment('.'),
];
const bodyText = bodySegments.map(segment => segment.text).join('');
const exampleText = exampleSegments.map(segment => segment.text).join('');
const candidate = (key, unit, segments) => ({
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
    managedSourceSymbols: [],
  },
});
const bodyCandidate = candidate(bodyKey, bodyUnit, bodySegments);
const exampleCandidate = candidate(exampleKey, exampleUnit, exampleSegments);
assert.equal(bodyText,
  'Combatentes Inteligentes com mais de 3 cópias da mesma miniatura terão 2 ou mais cópias de sua Carta de Combatente. Cada Carta de Combatente terá um conjunto diferente de Números de Ativação. Além disso, essas Cartas de Combatente terão 2 ou mais Cartas de Iniciativa distintas, com Números de Ativação correspondentes.');
assert.equal(exampleText,
  'Exemplo: 6 Cave Sickles começam no tabuleiro durante um Encontro. Um jogador cuidaria da Carta de Combatente dos Cave Sickles 1, 2 e 3, e outro cuidaria da carta dos Cave Sickles 4, 5 e 6. Como cada grupo de Cave Sickles tem uma Carta de Iniciativa diferente, os Cave Sickles 1, 2 e 3 serão ativados em um momento diferente dos Cave Sickles 4, 5 e 6.');

// Require the generated Viewer/PDF evidence and the read-only Editor check
// before recording copyfit as verified in the proposal inventory.
const exportPdfPath = join(proofDir, 'page-058-pt-BR-proposal-v1.pdf');
const metricsPath = join(proofDir, 'page-058-pt-BR-proposal-metrics-v1.json');
const editorReceiptPath = join(proofDir, 'normal-editor-units-v1.json');
const viewerEvidence = [
  'page-058-pt-BR-viewer-v1.png',
  'page-058-pt-BR-print-v1.png',
  'page-058-source-vs-export-family-crop-v2.png',
];
for (const fileName of [...viewerEvidence, 'page-058-pdf-family-crop.png']) {
  const bytes = await readFile(join(proofDir, fileName));
  assert.ok(bytes.length > 50_000, `Missing or incomplete visual proof: ${fileName}`);
}
const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
assert.equal(metrics.page, 58, 'Viewer/print evidence is not for p.58');
assert.equal(metrics.language, 'pt-BR', 'Viewer/print evidence is not PT-BR');
assert.ok(metrics.viewer?.rect?.width > 0 && metrics.print?.rect?.width > 0,
  'Viewer/print metrics are incomplete');

const editorReceipt = JSON.parse(await readFile(editorReceiptPath, 'utf8'));
assert.equal(editorReceipt.page, 58, 'Normal Editor receipt is not for p.58');
assert.equal(editorReceipt.nonGetRequestsAttempted, 0, 'Normal Editor attempted a write request');
assert.equal(editorReceipt.canonicalPageFilesUnchanged, true, 'Normal Editor changed canonical page files');
assert.deepEqual(editorReceipt.canonicalPageHashesBefore, editorReceipt.canonicalPageHashesAfter,
  'Normal Editor canonical hashes differ before/after');
assert.deepEqual(editorReceipt.trials.map(trial => trial.key).sort(), [
  'page_58_unit_p58-activation-numbers-body__en',
  'page_58_unit_p58-activation-numbers-example__en',
].sort(), 'Normal Editor did not exercise both p.58 semantic units');
assert.ok(editorReceipt.trials.every(trial => trial.distinctHitTarget && trial.sourceTextMatched
  && trial.editable && trial.cancelReturnedWithoutSave), 'Normal Editor unit checks did not all pass');

const pdfTextResult = spawnSync('python', ['-c', [
  'import json, pymupdf, sys',
  'doc = pymupdf.open(sys.argv[1])',
  'text = "\\n".join(page.get_text() for page in doc)',
  // Escape non-ASCII in Python stdout to avoid Windows console code-page loss.
  'print(json.dumps({"pageCount": len(doc), "text": text}, ensure_ascii=True))',
].join('\n'), exportPdfPath], { encoding: 'utf8' });
if (pdfTextResult.status !== 0) throw new Error(`Exported PDF text extraction failed: ${pdfTextResult.stderr || pdfTextResult.stdout}`);
const exportedPdf = JSON.parse(pdfTextResult.stdout);
const exportedPdfText = norm(exportedPdf.text);
assert.equal(exportedPdf.pageCount, 1, 'Proposal PDF must contain exactly p.58');
assert.equal(exportedPdf.text.includes('\uFFFD'), false, 'Proposal PDF text extraction contains U+FFFD');
assert.ok(exportedPdfText.includes(norm(bodyText)), 'Exported PDF does not contain the complete proposed body override');
assert.ok(exportedPdfText.includes(norm(exampleText)), 'Exported PDF does not contain the complete proposed Example override');
const pdfVerification = {
  page: 58,
  language: 'pt-BR',
  pageCount: exportedPdf.pageCount,
  exportedPdfSha256: sha256(await readFile(exportPdfPath)),
  replacementCharacterCount: [...exportedPdf.text].filter(character => character === '\uFFFD').length,
  bodyOverrideTextPresent: exportedPdfText.includes(norm(bodyText)),
  exampleOverrideTextPresent: exportedPdfText.includes(norm(exampleText)),
  sourceFallbackOnly: false,
};
const trackedEvidenceFiles = [
  { source: 'page-058-pt-BR-viewer-v1.png', destination: `${trackedEvidenceDir}/viewer-page-058-pt-BR.png` },
  { source: 'page-058-source-vs-export-family-crop-v2.png', destination: `${trackedEvidenceDir}/source-vs-export-family-crop.png` },
  { source: 'page-058-pt-BR-proposal-v1.pdf', destination: `${trackedEvidenceDir}/proposal-page-058-pt-BR.pdf` },
  { source: 'normal-editor-units-v1.json', destination: `${trackedEvidenceDir}/normal-editor-receipt.json` },
  { source: 'pdf-text-verification-v1.json', destination: `${trackedEvidenceDir}/pdf-text-verification.json` },
];
await immutableWrite(join(proofDir, 'pdf-text-verification-v1.json'), `${JSON.stringify(pdfVerification, null, 2)}\n`);
for (const file of trackedEvidenceFiles) {
  await immutableWrite(resolve(root, file.destination), await readFile(join(proofDir, file.source)));
}

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
if (!translationsResponse.ok) throw new Error(`Payload read failed: ${translationsResponse.status}`);
const translationsPayload = await translationsResponse.json();
const existing = (translationsPayload.docs ?? [])
  .filter(doc => String(doc.spanKey ?? '').startsWith('page_58_'))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.deepEqual(existing, [], 'p.58 has saved PT-BR translations; preserve and reassess before export');
assert.ok(!existing.some(doc => [bodyKey, exampleKey].includes(doc.spanKey)), 'Candidate key already exists in Payload');
const existingBaseline = existing.map(doc => ({
  id: doc.id,
  spanKey: doc.spanKey,
  updatedAt: doc.updatedAt,
  sha256: sha256(stable(doc)),
}));

const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[and][0][pageNumber][equals]', '58');
framesUrl.searchParams.set('limit', '1000');
const framesResponse = await fetch(framesUrl);
if (!framesResponse.ok) throw new Error(`Payload layout-frame read failed: ${framesResponse.status}`);
const framesPayload = await framesResponse.json();
const aliasesResponse = await fetch(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
if (!aliasesResponse.ok) throw new Error(`Payload symbol-alias read failed: ${aliasesResponse.status}`);
const aliasesPayload = await aliasesResponse.json();

const copiedHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', 'page_058');
await mkdir(snapshotPageDir, { recursive: true });
for (const name of (await readdir(sourceDir)).sort()) {
  const bytes = await readFile(join(sourceDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}
const boxResult = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '58',
], { encoding: 'utf8' });
if (boxResult.status !== 0) throw new Error(`Source PDF boxes failed: ${boxResult.stderr || boxResult.stdout}`);
const sourcePageBoxes = JSON.parse(boxResult.stdout);

const snapshot = {
  translations: [bodyCandidate, exampleCandidate],
  layoutFrames: (framesPayload.docs ?? []).filter(doc => Number(doc.pageNumber) === 58),
  symbolAliasSettings: aliasesPayload.docs ?? [],
  assetPages: [58], page: 58, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes,
};
const proposal = {
  page: 58,
  unit: ['p58-activation-numbers-body', 'p58-activation-numbers-example'],
  family: 'Example label + body',
  status: 'isolated-proposal-copyfit-verified-pending-human-review',
  sourceHashes: { sourcePdf: expected.sourcePdf, ...expected },
  existingPayloadRecords: existingBaseline,
  candidateRecordCount: 2,
  candidateKeysUnique: new Set([bodyKey, exampleKey]).size === 2,
  sourceText: { body: bodySource, example: exampleSource },
  proposalText: { body: bodyText, example: exampleText },
  terminologyPendingHumanReview: [
    'Carta de Combatente, Combatente Inteligente, Números de Ativação, Carta de Iniciativa, Encounter → Encontro and Cave Sickle Group → grupo de Cave Sickles are proposed forms; no approved glossary entries were found for these exact game terms.',
    'Figure → miniatura follows the approved glossary entry Figures → Miniaturas. Cave Sickles remains the printed creature name, matching the existing page 83 terminology in the source.',
  ],
  richText: {
    sourceBoldNumbers: [3, 2, 2, 6, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6],
    preservedBoldNumbers: true,
    exampleLabelStylePreserved: true,
    fontAndFrameUnchanged: true,
  },
  copyfit: {
    sourceBodyLines: bodyLineIds.length,
    sourceExampleLines: exampleLineIds.length,
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
  note: 'Only the two structurally partitioned p.58 editorial units are proposed. The 16 bold numbers and the Example label styling are retained. No Payload, canonical sidecar, source PDF, or human translation was written.',
  candidates: [bodyCandidate, exampleCandidate],
};
const trackedPath = join(root, 'docs/translations/proposals/page-058-activation-numbers-example-proposal-2026-10-15-v1.json');
await immutableWrite(join(snapshotDir, 'snapshot-p058-activation-numbers-v1-export.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'proposal-p058-activation-numbers-v1.json'), `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(trackedPath, `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(join(proofDir, 'preexisting-payload-records.json'), `${JSON.stringify({
  readOnlyCapture: true, page: 58, language: 'pt-BR', records: existingBaseline,
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({ sourcePdf: expected.sourcePdf, pageAssets: copiedHashes }, null, 2)}\n`);
console.log(JSON.stringify({
  page: 58,
  units: proposal.unit,
  candidateRecords: proposal.candidateRecordCount,
  uniqueKeys: proposal.candidateKeysUnique,
  existingPayloadRecords: existing.length,
  frames: snapshot.layoutFrames.length,
  aliases: snapshot.symbolAliasSettings.length,
  snapshot: join(snapshotDir, 'snapshot-p058-activation-numbers-v1-export.json'),
  sourceHashes: expected,
}, null, 2));
