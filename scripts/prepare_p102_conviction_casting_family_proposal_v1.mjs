import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Build an isolated p.102 family snapshot from the already verified body
// proposal plus the separate legacy Casting Value paragraph. Payload and
// canonical page assets are read-only throughout this script.
const root = process.cwd();
const page = 102;
const pageDir = resolve(root, 'apps/web/public/pages/page_102');
const proposalPath = resolve(root, 'docs/translations/proposals/page-102-conviction-value-body-proposal-2026-10-15-v1.json');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', 'page_102');
const snapshotPath = join(snapshotDir, 'snapshot-p102-conviction-casting-family-v1-export.json');
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const expectedHashes = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  background: '9F6EE3306F10136DB1CCD7DABDEAC994C322D6DFAA807B14382962A180CCA2DD',
  dom: '97EA10EB5B36E0A36A4DA1339C2D7D72892DB7F3142D92BC8DA01169F89C5548',
  fidelityOverlays: 'CCF43B9D51F4EF0475ECC1D732B23D0F2B82C2E6B98E78AD626F37E4BDEFF0F3',
  layoutFrames: '8226ACCEBF5C6BEF5463CDAA2A42F34DAD7FBF165B30A89FE7C6A67AFF2C2F4E',
};
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();

async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace divergent artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

async function getJson(path, params = {}) {
  const url = new URL(path, apiUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Read-only API GET ${url.pathname} failed: HTTP ${response.status}`);
  return response.json();
}

const sourcePdfBytes = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdfBytes), expectedHashes.sourcePdf, 'Official source PDF hash changed');
const pageFiles = (await readdir(pageDir)).sort();
const sourceAssets = {};
for (const name of pageFiles) {
  const bytes = await readFile(join(pageDir, name));
  sourceAssets[name] = { sha256: sha256(bytes), size: bytes.length };
}
for (const [name, expected] of Object.entries({
  'background.webp': expectedHashes.background,
  'page_102_dom.json': expectedHashes.dom,
  'fidelity_overlays.json': expectedHashes.fidelityOverlays,
  'layout_frames.json': expectedHashes.layoutFrames,
})) assert.equal(sourceAssets[name]?.sha256, expected, `Canonical p.102 ${name} changed`);
assert.ok(!pageFiles.includes('inline_elements.json'), 'p.102 unexpectedly gained inline_elements.json');

const dom = JSON.parse((await readFile(join(pageDir, 'page_102_dom.json'))).toString('utf8'));
const bodyBlock = dom.blocks.find(item => item.id === 'block_8');
const castingBlock = dom.blocks.find(item => item.id === 'block_9');
assert.ok(bodyBlock && castingBlock, 'Expected separate source blocks 8 and 9');
const bodyUnit = bodyBlock.typographicUnits?.find(item => item.id === 'p102-conviction-value-body');
assert.ok(bodyUnit, 'Missing existing semantic body unit');
assert.equal(castingBlock.editorKey ?? null, null, 'Legacy block key contract changed; do not assume serialization');
assert.equal(castingBlock.lines.length, 2, 'Source paragraph line structure changed');

function sourceTextForLines(block, ids) {
  return normalize(ids.flatMap(id => {
    const line = block.lines.find(item => item.id === id);
    assert.ok(line, `Missing source line ${id}`);
    return line.spans.filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings').map(span => span.text ?? '');
  }).join(' '));
}
const bodySourceText = sourceTextForLines(bodyBlock, bodyUnit.field.lineIds);
const bodyEnglish = "Some Abilities, Conditions, or AI Steps may reference a figure's Conviction Value or Casting Value. The Conviction Value or Casting Value is calculated by adding the figure's best dice of the appropriate type according to the rating list on the left.";
assert.equal(bodySourceText, bodyEnglish, 'Body source text changed');
assert.deepEqual(bodyUnit.field.lineIds, ['line_8_0', 'line_8_1', 'line_8_2', 'line_8_3', 'line_8_4', 'line_8_5']);
const castingLineIds = castingBlock.lines.map(line => line.id);
const castingSourceText = sourceTextForLines(castingBlock, castingLineIds);
const expectedCastingSource = 'Since Casting only uses 1 die, the Casting Value is simply the value of the single die.';
assert.equal(castingSourceText, expectedCastingSource, 'Casting paragraph source or ownership changed');

const bodyProposal = JSON.parse(await readFile(proposalPath, 'utf8'));
assert.equal(bodyProposal.status, 'isolated-proposal-copyfit-verified-pending-human-review');
assert.equal(bodyProposal.candidateKey, 'page_102_unit_p102-conviction-value-body__pt-BR');
assert.equal(bodyProposal.candidateRecord.data.segments.map(segment => segment.text).join(''), bodyProposal.sourceText.ptBR);

const castingCandidateKey = 'page_102_block_1__pt-BR';
const castingTargetText = 'Como a Conjuração usa só 1 dado, o Valor de Conjuração é simplesmente o valor desse dado.';
const makeSegment = (text, font = 'OptimaLTStd', size = 10, weight = 400) => ({
  text, font, size, color: '#ffffff', weight, style: 'normal',
});
const castingSegments = [
  makeSegment('Como a Conjuração usa só '),
  makeSegment('1', 'OptimaLTStd-Bold', 10, 700),
  makeSegment(' dado, o Valor de Conjuração é simplesmente o valor desse dado.'),
];
assert.equal(castingSegments.map(segment => segment.text).join(''), castingTargetText);
const castingCandidate = {
  spanKey: castingCandidateKey,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    spanKey: castingCandidateKey,
    bbox: castingBlock.bbox,
    textAlign: 'left',
    lineHeight: 1.1,
    lineHeightMode: 'custom',
    segments: castingSegments,
    managedSourceSymbols: [],
  },
};

const translationsPayload = await getJson('/api/translations', { 'where[language][equals]': 'pt-BR', limit: '5000' });
const existingPageRecords = (translationsPayload.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_102_'));
assert.equal(existingPageRecords.length, 0, 'p.102 now has saved PT-BR records; stop and reconcile instead of hiding them');
assert.ok(!existingPageRecords.some(doc => doc.spanKey === castingCandidateKey), 'Casting candidate key already exists in Payload');
const payloadBaseline = existingPageRecords.map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt, sha256: sha256(stable(doc)) }));
const framePayload = await getJson('/api/layout-frames', {
  'where[and][0][pageNumber][equals]': String(page), limit: '1000',
});
const layoutFrames = (framePayload.docs ?? []).filter(doc => Number(doc.pageNumber) === page);
const aliasPayload = await getJson('/api/symbol-alias-settings', { limit: '500' });
const symbolAliasSettings = aliasPayload.docs ?? [];

await mkdir(snapshotPageDir, { recursive: true });
for (const name of pageFiles) await immutableWrite(join(snapshotPageDir, name), await readFile(join(pageDir, name)));
const boxResult = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, String(page)], {
  cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (boxResult.status !== 0) throw new Error(`Source page-box extraction failed: ${boxResult.stderr || boxResult.stdout}`);
const snapshot = {
  translations: [...existingPageRecords, bodyProposal.candidateRecord, castingCandidate],
  layoutFrames,
  symbolAliasSettings,
  assetPages: [page],
  page,
  patched: true,
  verifyRenderedSnapshot: true,
  sourcePageBoxes: JSON.parse(boxResult.stdout),
};
const snapshotBytes = `${JSON.stringify(snapshot, null, 2)}\n`;
await immutableWrite(snapshotPath, snapshotBytes);

const stageDir = join(proofDir, '_staging');
await mkdir(stageDir, { recursive: true });
const stagedPdf = join(stageDir, 'page-102-pt-BR-conviction-casting-family-v1.pdf');
const stagedViewer = join(stageDir, 'viewer-page-102-pt-BR-conviction-casting-family-v1.png');
const stagedPrint = join(stageDir, 'print-page-102-pt-BR-conviction-casting-family-v1.png');
const stagedMetrics = join(stageDir, 'export-metrics-v1.json');
const exporter = resolve(root, 'scripts/export_page_pdf.mjs');
const exportResult = spawnSync(process.execPath, [
  exporter, '--page', String(page), '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', stagedPdf,
  '--base-url', baseUrl, '--api-url', apiUrl, '--source-pdf', sourcePdfPath,
  '--viewer-screenshot', stagedViewer, '--print-screenshot', stagedPrint,
  '--metrics-output', stagedMetrics,
], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (exportResult.status !== 0) throw new Error(`Official page exporter failed: ${exportResult.stderr || exportResult.stdout}`);

const finalPdf = join(proofDir, 'page-102-pt-BR-conviction-casting-family-v1.pdf');
const finalViewer = join(proofDir, 'viewer-page-102-pt-BR-conviction-casting-family-v1.png');
const finalPrint = join(proofDir, 'print-page-102-pt-BR-conviction-casting-family-v1.png');
const finalMetrics = join(proofDir, 'export-metrics-v1.json');
const finalVerification = join(proofDir, 'pdf-verification-v1.json');
const finalSourceCrop = join(proofDir, 'source-crop-v1.png');
const finalExportCrop = join(proofDir, 'export-crop-v1.png');
const finalComparison = join(proofDir, 'source-vs-export-crop-v1.png');
const verifyPython = String.raw`
import fitz, hashlib, json, re, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
source_path, export_path, out_dir, body_target, body_source, casting_target, casting_source = sys.argv[1:]
out = Path(out_dir)
norm = lambda value: re.sub(r'\s+', ' ', value).strip()
src_doc = fitz.open(source_path)
pdf_doc = fitz.open(export_path)
assert len(pdf_doc) == 1, f'expected one exported page, got {len(pdf_doc)}'
src, page = src_doc[101], pdf_doc[0]
plain = page.get_text('text')
normalized = norm(plain)
assert norm(body_target) in normalized, 'actual PDF missing the p.102 body override'
assert norm(casting_target) in normalized, 'actual PDF missing the Casting override'
assert norm(body_source) not in normalized, 'actual PDF fell back to the complete English body'
assert norm(casting_source) not in normalized, 'actual PDF fell back to the complete English Casting paragraph'
assert plain.count('\ufffd') == 0, 'actual PDF has replacement characters'
for phrase in ['Example:', 'If the figure had', 'ORANGE', 'RED', 'Conviction dice', 'their Conviction Value', 'would be 8 (5 + 3).']:
    assert phrase in normalized, f'unchanged English Example is incomplete: {phrase}'

lines = []
for block in page.get_text('dict')['blocks']:
    for line in block.get('lines', []):
        text = ''.join(span.get('text', '') for span in line.get('spans', []))
        if text.strip(): lines.append({'text': text, 'bbox': [float(v) for v in line['bbox']]})
def collect(target, start_text):
    target_n = norm(target)
    start = next(i for i, line in enumerate(lines) if norm(line['text']).startswith(start_text))
    got, collected = [], ''
    for line in lines[start:]:
        if got and line['bbox'][1] > got[-1]['bbox'][3] + 25: break
        got.append(line)
        collected = norm(f'{collected} {line["text"]}')
        if target_n in collected: return got
    raise AssertionError(f'could not reconstruct target from PDF lines: {collected}')
body_lines = collect(body_target, 'Algumas Habilidades')
casting_lines = collect(casting_target, 'Como a Conjuração')
assert norm(body_target) in norm(' '.join(line['text'] for line in body_lines))
assert norm(casting_target) in norm(' '.join(line['text'] for line in casting_lines))
assert len(body_lines) == 6, f'body changed from six lines to {len(body_lines)}'
body_bbox = [min(l['bbox'][0] for l in body_lines), min(l['bbox'][1] for l in body_lines), max(l['bbox'][2] for l in body_lines), max(l['bbox'][3] for l in body_lines)]
casting_bbox = [min(l['bbox'][0] for l in casting_lines), min(l['bbox'][1] for l in casting_lines), max(l['bbox'][2] for l in casting_lines), max(l['bbox'][3] for l in casting_lines)]
assert casting_bbox[3] < 785, f'Casting paragraph approaches page bottom: {casting_bbox}'
example_last = max((l for l in lines if 693 <= l['bbox'][1] < 734), key=lambda l:l['bbox'][3])
example_to_casting_gap = casting_bbox[1] - example_last['bbox'][3]
assert example_to_casting_gap > 0, f'Casting paragraph collides with the Example: {example_to_casting_gap}'

clip = fitz.Rect(410, 615, 640, 782)
zoom = fitz.Matrix(2.4, 2.4)
source_crop = src.get_pixmap(matrix=zoom, clip=clip, alpha=False)
export_crop = page.get_pixmap(matrix=zoom, clip=clip, alpha=False)
source_path_out, export_path_out = out/'source-crop-v1.png', out/'export-crop-v1.png'
source_crop.save(str(source_path_out)); export_crop.save(str(export_path_out))
left, right = Image.open(source_path_out).convert('RGB'), Image.open(export_path_out).convert('RGB')
pad, label_h = 22, 36
canvas = Image.new('RGB', (left.width + right.width + pad*3, max(left.height, right.height) + label_h + pad*2), 'white')
draw = ImageDraw.Draw(canvas)
draw.text((pad, 8), 'PDF-fonte EN', fill='#222')
draw.text((pad*2 + left.width, 8), 'PDF isolado PT-BR', fill='#222')
canvas.paste(left, (pad, label_h))
canvas.paste(right, (pad*2 + left.width, label_h))
comparison_path = out/'source-vs-export-crop-v1.png'
canvas.save(comparison_path)
metrics = {
 'pageCount': len(pdf_doc), 'pageSizePt': [float(page.rect.width), float(page.rect.height)],
 'bodyCandidateOccurrences': normalized.count(norm(body_target)), 'bodyEnglishFallbackOccurrences': normalized.count(norm(body_source)),
 'castingCandidateOccurrences': normalized.count(norm(casting_target)), 'castingEnglishFallbackOccurrences': normalized.count(norm(casting_source)),
 'replacementCharacterCount': plain.count('\ufffd'), 'exampleRequiredPhrasesPresent': True,
 'bodyLineCount': len(body_lines), 'bodyBboxPt': body_bbox,
 'castingLineCount': len(casting_lines), 'castingBboxPt': casting_bbox,
 'sourceCastingBlockBboxPt': [419.7532043457031,736.1439819335938,627.2736206054688,759.0640258789062],
 'exampleToCastingGapPt': example_to_casting_gap, 'castingBelowSourceFramePt': max(0, casting_bbox[3]-759.0640258789062),
 'pdfSha256': hashlib.sha256(Path(export_path).read_bytes()).hexdigest().upper(),
 'comparisonImage': comparison_path.name,
}
(out/'pdf-verification-v1.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(metrics, ensure_ascii=False, indent=2))
`;
const verification = spawnSync('python', ['-c', verifyPython,
  sourcePdfPath, stagedPdf, proofDir, bodyProposal.sourceText.ptBR, bodyEnglish, castingTargetText, expectedCastingSource,
], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (verification.status !== 0) throw new Error(`PDF content/copyfit verification failed: ${verification.stderr || verification.stdout}`);

for (const [from, to] of [
  [stagedPdf, finalPdf], [stagedViewer, finalViewer], [stagedPrint, finalPrint],
  [stagedMetrics, finalMetrics], [join(proofDir, 'pdf-verification-v1.json'), finalVerification],
  [join(proofDir, 'source-crop-v1.png'), finalSourceCrop], [join(proofDir, 'export-crop-v1.png'), finalExportCrop],
  [join(proofDir, 'source-vs-export-crop-v1.png'), finalComparison],
]) await immutableWrite(to, await readFile(from));

const afterHashes = {};
for (const name of pageFiles) afterHashes[name] = sha256(await readFile(join(pageDir, name)));
assert.deepEqual(afterHashes, Object.fromEntries(Object.entries(sourceAssets).map(([name, value]) => [name, value.sha256])),
  'Canonical p.102 page assets changed during isolated export');
const afterPayload = await getJson('/api/translations', { 'where[language][equals]': 'pt-BR', limit: '5000' });
const afterPageRecords = (afterPayload.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_102_'));
assert.deepEqual(afterPageRecords.map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt, sha256: sha256(stable(doc)) })), payloadBaseline,
  'Existing p.102 Payload baseline changed during isolated export');

const metrics = JSON.parse(await readFile(finalVerification, 'utf8'));
const exportMetrics = JSON.parse(await readFile(finalMetrics, 'utf8'));
const proposal = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  page: 102,
  family: 'Conviction and Casting Value',
  status: 'isolated-family-proposal-copyfit-verified-pending-human-review',
  candidates: [
    { ...bodyProposal, candidateRecord: undefined },
    {
      unit: 'p102-casting-value-sentence',
      key: castingCandidateKey,
      clientEditorKey: 'page_102_block_1',
      sourceText: expectedCastingSource,
      ptBR: castingTargetText,
      candidateRecord: castingCandidate,
      sourceLines: 2,
      exportedLines: metrics.castingLineCount,
      boldTextPreserved: '1',
      terminologyPending: ['Casting → Conjuração', 'Casting Value → Valor de Conjuração'],
    },
  ],
  serialization: {
    payloadSpanKey: castingCandidateKey,
    clientEditorKey: 'page_102_block_1',
    language: 'pt-BR',
    note: 'The legacy block key is language-qualified in persisted PT-BR records and normalized to the plain key in the Viewer/Editor. No __en key is included.',
  },
  verification: {
    officialPdfExported: true,
    exporterVerifiedTranslationRecords: exportMetrics.verifiedTranslationRecords,
    pageCount: metrics.pageCount,
    pageSizePt: metrics.pageSizePt,
    bodyCandidateOccurrences: metrics.bodyCandidateOccurrences,
    bodyEnglishFallbackOccurrences: metrics.bodyEnglishFallbackOccurrences,
    bodyLineCount: metrics.bodyLineCount,
    castingCandidateOccurrences: metrics.castingCandidateOccurrences,
    castingEnglishFallbackOccurrences: metrics.castingEnglishFallbackOccurrences,
    castingSourceLines: metrics.sourceCastingBlockBboxPt ? 2 : null,
    castingExportLines: metrics.castingLineCount,
    castingBelowSourceFramePt: metrics.castingBelowSourceFramePt,
    exampleRequiredPhrasesPresent: metrics.exampleRequiredPhrasesPresent,
    exampleToCastingGapPt: metrics.exampleToCastingGapPt,
    replacementCharacterCount: metrics.replacementCharacterCount,
    pdfSha256: metrics.pdfSha256,
  },
  preservation: {
    existingPagePayloadRecordsBeforeAndAfter: existingPageRecords.length,
    payloadWriteRequests: 0,
    canonicalPageAssetsUnchanged: true,
    canonicalPageAssetHashes: afterHashes,
    sourcePdfSha256: expectedHashes.sourcePdf,
    snapshotSha256: sha256(snapshotBytes),
  },
  evidence: {
    pdf: 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/page-102-pt-BR-conviction-casting-family-v1.pdf',
    viewer: 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/viewer-page-102-pt-BR-conviction-casting-family-v1.png',
    comparison: 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/source-vs-export-crop-v1.png',
    editorSourceReceipt: 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1/normal-editor-casting-value-readonly-receipt-v1.json',
  },
  limits: [
    'The proposal is isolated and awaits human editorial and terminology review; it was not saved to Payload.',
    'The Example with orange/red dice remains in English and is preserved unchanged.',
    'The Rich Block Editor was previously verified to expose this source paragraph and Cancel/reopen preserve EN; this export does not save or approve the PT-BR proposal.',
    'The p.102 page-level structural status is not certified by these two paragraph overrides.',
  ],
};
const proposalJsonPath = resolve(root, 'docs/translations/proposals/page-102-conviction-and-casting-value-proposal-2026-10-15-v1.json');
await immutableWrite(proposalJsonPath, `${JSON.stringify(proposal, null, 2)}\n`);

const md = `# p.102 — proposta da família Conviction and Casting Value (2026-10-15)\n\n`+
`## Proposta isolada\n\n`+
`- **Corpo:** ${bodyProposal.sourceText.ptBR}\n`+
`- **Since Casting:** ${castingTargetText} (o numeral **1** permanece em negrito).\n`+
`- **Example:** permanece em inglês, com os dados laranja e vermelho da fonte.\n\n`+
`## Resultado da exportação\n\n`+
`O exportador oficial gerou um PDF de uma página (${metrics.pageSizePt.map(value => value.toFixed(3)).join(' × ')} pt). Os dois overrides aparecem uma vez cada; os textos EN completos desses alvos não aparecem como fallback; o Example mantém os trechos ORANGE/RED e a conta 8 (5 + 3). O corpo permanece em seis linhas. O parágrafo curto ocupa ${metrics.castingLineCount} linhas, contra duas na fonte, e termina ${metrics.castingBelowSourceFramePt.toFixed(3)} pt abaixo do bbox original, sem colisão visual com o Example nem com o limite inferior da página.\n\n`+
`**Atenção:** os termos “Conjuração” e “Valor de Conjuração” continuam candidatos locais para revisão humana; esta proposta não os aprova no glossário.\n\n`+
`## Estado de edição e preservação\n\n`+
`A verificação do Editor normal feita antes desta proposta reconheceu o bloco legado \`page_102_block_1\` como editável e Cancel/reabertura preservaram EN. O snapshot usa a chave persistida correta \`${castingCandidateKey}\`, sem \`__en\`; a prova exportada é isolada e nenhum Save foi executado. Payload continuou sem registros p.102, e todos os hashes canônicos da página permaneceram iguais.\n\n`+
`## Evidências reproduzíveis\n\n`+
`- Proposta estruturada: \`docs/translations/proposals/page-102-conviction-and-casting-value-proposal-2026-10-15-v1.json\`.\n`+
`- Gerador/exportador: \`scripts/prepare_p102_conviction_casting_family_proposal_v1.mjs\`.\n`+
`- PDF: \`${proposal.evidence.pdf}\` (SHA-256 \`${metrics.pdfSha256}\`).\n`+
`- Captura do Viewer no snapshot: \`${proposal.evidence.viewer}\`.\n`+
`- Comparação PDF-fonte ↔ PDF exportado: \`${proposal.evidence.comparison}\`.\n`+
`- Recibo de hashes e extração: \`output/proofs/translation-readiness-2026-10-15/p102-conviction-value-family-v1/pdf-verification-v1.json\`.\n`;
const proposalMdPath = resolve(root, 'docs/translations/proposals/page-102-conviction-and-casting-value-proposal-2026-10-15-v1.md');
await immutableWrite(proposalMdPath, md);

console.log(JSON.stringify({
  proofDir,
  proposalJsonPath,
  proposalMdPath,
  snapshotPath,
  metrics,
  exporterVerifiedTranslationRecords: exportMetrics.verifiedTranslationRecords,
  p102PayloadRecordCountBeforeAndAfter: [existingPageRecords.length, afterPageRecords.length],
  canonicalPageAssetsUnchanged: true,
  exportStdout: exportResult.stdout,
}, null, 2));
