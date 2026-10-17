import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Build an immutable, single-unit p.102 translation proof. This deliberately
// leaves the Example (which contains two source dice icons) in English.
const root = process.cwd();
const page = 102;
const pageId = '102';
const pageDir = resolve(root, 'apps/web/public/pages/page_102');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p102-conviction-value-body-v1');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', 'page_102');
const snapshotPath = join(snapshotDir, 'snapshot-p102-conviction-value-body-v1-export.json');
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
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace divergent proof artifact: ${path}`);
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

assert.equal(sha256(await readFile(sourcePdfPath)), expectedHashes.sourcePdf, 'Official source PDF hash changed');
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
assert.ok(!pageFiles.includes('inline_elements.json'), 'p.102 unexpectedly gained inline_elements.json; re-check symbol dependencies');

const domBytes = await readFile(join(pageDir, 'page_102_dom.json'));
const dom = JSON.parse(domBytes.toString('utf8'));
const block = dom.blocks.find(item => item.id === 'block_8');
assert.ok(block, 'Missing p.102 block_8');
const unit = block.typographicUnits?.find(item => item.id === 'p102-conviction-value-body');
assert.ok(unit, 'Missing the pre-existing p.102 Conviction Value body unit');
const sourceText = normalize(unit.field.lineIds.flatMap(lineId => {
  const line = block.lines.find(item => item.id === lineId);
  assert.ok(line, `Missing source line ${lineId}`);
  return line.spans.filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings').map(span => span.text ?? '');
}).join(' '));
assert.equal(sourceText,
  "Some Abilities, Conditions, or AI Steps may reference a figure's Conviction Value or Casting Value. The Conviction Value or Casting Value is calculated by adding the figure's best dice of the appropriate type according to the rating list on the left.",
  'p.102 body source text or ownership changed');
assert.deepEqual(unit.field.lineIds, ['line_8_0', 'line_8_1', 'line_8_2', 'line_8_3', 'line_8_4', 'line_8_5'],
  'p.102 body line ownership changed');

const key = 'page_102_unit_p102-conviction-value-body__pt-BR';
const translations = await getJson('/api/translations', { 'where[language][equals]': 'pt-BR', limit: '5000' });
const existingPageRecords = (translations.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_102_'));
assert.ok(!existingPageRecords.some(doc => doc.spanKey === key), 'Candidate p.102 PT-BR key already exists in Payload');
const existingBaseline = existingPageRecords.map(doc => ({
  id: doc.id,
  spanKey: doc.spanKey,
  updatedAt: doc.updatedAt,
  sha256: sha256(stable(doc)),
}));
const framePayload = await getJson('/api/layout-frames', {
  'where[and][0][pageNumber][equals]': String(page),
  limit: '1000',
});
const layoutFrames = (framePayload.docs ?? []).filter(doc => Number(doc.pageNumber) === page);
const aliasPayload = await getJson('/api/symbol-alias-settings', { limit: '500' });
const symbolAliasSettings = aliasPayload.docs ?? [];

const makeSegment = (text, font = 'OptimaLTStd', size = 10, weight = 400) => ({
  text, font, size, color: '#ffffff', weight, style: 'normal',
});
const targetText = 'Algumas Habilidades, Condições ou Etapas de IA podem se referir ao Valor de Convicção ou ao Valor de Conjuração de uma miniatura. Esse valor é calculado somando os melhores dados da miniatura do tipo adequado, conforme a lista de classificações à esquerda.';
const segments = [
  makeSegment('Algumas Habilidades, Condições ou Etapas de '),
  makeSegment('IA', 'OptimaLTStd-Bold', 10, 700),
  makeSegment(' podem se referir ao Valor de Convicção ou ao Valor de Conjuração de uma miniatura. Esse valor é calculado somando os melhores dados da miniatura do tipo adequado, conforme a lista de classificações à esquerda.'),
];
assert.equal(segments.map(segment => segment.text).join(''), targetText);
const candidate = {
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
};

await mkdir(snapshotPageDir, { recursive: true });
for (const name of pageFiles) {
  await immutableWrite(join(snapshotPageDir, name), await readFile(join(pageDir, name)));
}
const boxesResult = spawnSync('python', [
  resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, String(page),
], { encoding: 'utf8' });
if (boxesResult.status !== 0) throw new Error(`Source page box extraction failed: ${boxesResult.stderr || boxesResult.stdout}`);
const snapshot = {
  translations: [...existingPageRecords, candidate],
  layoutFrames,
  symbolAliasSettings,
  assetPages: [page],
  page,
  patched: true,
  verifyRenderedSnapshot: true,
  sourcePageBoxes: JSON.parse(boxesResult.stdout),
};
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

const stageDir = join(proofDir, '_staging');
await rm(stageDir, { recursive: true, force: true });
await mkdir(stageDir, { recursive: true });
const stagedPdf = join(stageDir, 'page-102-pt-BR-proposal.pdf');
const stagedViewer = join(stageDir, 'viewer-page-102-pt-BR.png');
const stagedPrint = join(stageDir, 'print-page-102-pt-BR.png');
const stagedMetrics = join(stageDir, 'export-metrics.json');
const exporter = resolve(root, 'scripts/export_page_pdf.mjs');
const exportResult = spawnSync(process.execPath, [
  exporter,
  '--page', String(page), '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', stagedPdf,
  '--base-url', baseUrl, '--api-url', apiUrl, '--source-pdf', sourcePdfPath,
  '--viewer-screenshot', stagedViewer, '--print-screenshot', stagedPrint,
  '--metrics-output', stagedMetrics,
], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (exportResult.status !== 0) throw new Error(`Official page exporter failed: ${exportResult.stderr || exportResult.stdout}`);

const finalPdf = join(proofDir, 'page-102-pt-BR-proposal.pdf');
const finalViewer = join(proofDir, 'viewer-page-102-pt-BR.png');
const finalPrint = join(proofDir, 'print-page-102-pt-BR.png');
const finalMetrics = join(proofDir, 'export-metrics.json');
await immutableWrite(finalPdf, await readFile(stagedPdf));
await immutableWrite(finalViewer, await readFile(stagedViewer));
await immutableWrite(finalPrint, await readFile(stagedPrint));
await immutableWrite(finalMetrics, await readFile(stagedMetrics));

const verificationCode = String.raw`
import fitz, hashlib, json, re, sys
source_path, export_path, output_dir, candidate_text, source_text = sys.argv[1:]
norm = lambda value: re.sub(r'\s+', ' ', value).strip()
source_doc = fitz.open(source_path)
source = source_doc[101]
export_doc = fitz.open(export_path)
assert len(export_doc) == 1, f'expected one exported page, got {len(export_doc)}'
page = export_doc[0]
plain = page.get_text('text')
normalized_pdf = norm(plain)
assert norm(candidate_text) in normalized_pdf, 'the actual PDF is missing the full PT-BR override'
assert norm(source_text) not in normalized_pdf, 'the PDF contains the complete EN body fallback'
assert plain.count('\ufffd') == 0, 'PDF text extraction contains U+FFFD'

lines = []
for block in page.get_text('dict')['blocks']:
    for line in block.get('lines', []):
        spans = line.get('spans', [])
        text = ''.join(span.get('text', '') for span in spans)
        if text.strip():
            lines.append({'text': text, 'bbox': [float(x) for x in line['bbox']]})
start = next(i for i, line in enumerate(lines) if norm(line['text']).startswith('Algumas Habilidades'))
target_lines, collected = [], ''
for line in lines[start:]:
    if target_lines and line['bbox'][1] > 695:
        break
    target_lines.append(line)
    collected = norm(f'{collected} {line["text"]}')
    if norm(candidate_text) in collected:
        break
assert norm(candidate_text) in collected, f'text lines did not reconstruct target: {collected}'
frame = [419.74951171875, 623.8046875, 630.7799072265625, 690.7247314453125]
x0 = min(line['bbox'][0] for line in target_lines)
y0 = min(line['bbox'][1] for line in target_lines)
x1 = max(line['bbox'][2] for line in target_lines)
y1 = max(line['bbox'][3] for line in target_lines)
fits = x0 >= frame[0] - .5 and y0 >= frame[1] - .5 and x1 <= frame[2] + .5 and y1 <= frame[3] + .5
example = next(line for line in lines if norm(line['text']).startswith('Example:'))
clearance = float(example['bbox'][1]) - y1
fits = fits and len(target_lines) <= 6 and clearance > 0

zoom = fitz.Matrix(2.0, 2.0)
clip = fitz.Rect(185, 610, 645, 767)
for label, doc_page in [('source', source), ('export', page)]:
    pix = doc_page.get_pixmap(matrix=zoom, clip=clip, alpha=False)
    pix.save(f'{output_dir}/{label}-crop.png')
pix = page.get_pixmap(matrix=fitz.Matrix(150/72, 150/72), alpha=False)
pix.save(f'{output_dir}/page-102-pt-BR-pdf-raster.png')
metrics = {
  'pageCount': len(export_doc), 'pageSizePt': [float(page.rect.width), float(page.rect.height)],
  'candidateTextOccurrences': normalized_pdf.count(norm(candidate_text)),
  'sourceFallbackOccurrences': normalized_pdf.count(norm(source_text)),
  'replacementCharacterCount': plain.count('\ufffd'),
  'bodyLineCount': len(target_lines), 'bodyFramePt': frame,
  'bodyExportBboxPt': [x0, y0, x1, y1], 'exampleTopPt': float(example['bbox'][1]),
  'clearanceToExamplePt': clearance, 'copyfitPass': fits,
  'bodyLineTexts': [line['text'] for line in target_lines],
  'pdfSha256': hashlib.sha256(open(export_path, 'rb').read()).hexdigest().upper(),
}
with open(f'{output_dir}/pdf-verification.json', 'x', encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(json.dumps(metrics, ensure_ascii=False, indent=2))
`;
const verification = spawnSync('python', ['-c', verificationCode,
  sourcePdfPath, finalPdf, proofDir, targetText, sourceText,
], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (verification.status !== 0) throw new Error(`PDF text/copyfit verification failed: ${verification.stderr || verification.stdout}`);

const afterHashes = {};
for (const name of pageFiles) afterHashes[name] = sha256(await readFile(join(pageDir, name)));
assert.deepEqual(afterHashes, Object.fromEntries(Object.entries(sourceAssets).map(([name, value]) => [name, value.sha256])),
  'Canonical p.102 page files changed during isolated export');
const afterPayload = await getJson('/api/translations', { 'where[language][equals]': 'pt-BR', limit: '5000' });
const afterPageRecords = (afterPayload.docs ?? []).filter(doc => String(doc.spanKey ?? '').startsWith('page_102_'));
const afterBaseline = afterPageRecords.map(doc => ({ id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt, sha256: sha256(stable(doc)) }));
assert.deepEqual(afterBaseline, existingBaseline, 'Existing p.102 Payload records changed during the read-only export');

const pdfVerification = JSON.parse(await readFile(join(proofDir, 'pdf-verification.json'), 'utf8'));
const exportMetrics = JSON.parse(await readFile(finalMetrics, 'utf8'));
const report = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  page,
  candidateKey: key,
  status: pdfVerification.copyfitPass ? 'isolated-copyfit-passed-visual-review-pending' : 'copyfit-failed-preserved-for-review',
  candidateText: targetText,
  sourceText,
  sourceHashes: { sourcePdf: expectedHashes.sourcePdf, canonicalPageFiles: sourceAssets },
  preservedPayloadRecords: existingBaseline,
  preservedPayloadRecordCount: existingBaseline.length,
  candidateKeyAbsentFromPayload: true,
  isolatedSnapshot: snapshotPath,
  snapshotCandidateCount: 1,
  layoutFrameCount: layoutFrames.length,
  symbolAliasSettingsCount: symbolAliasSettings.length,
  visualExport: exportMetrics,
  pdfVerification,
  canonicalPageFilesUnchanged: true,
  payloadUnchanged: true,
  noPayloadWriteRequests: true,
  note: 'Only the p.102 body is proposed. The Example containing orange and red source dice remains English and unchanged; the separate following paragraph is also untouched. No Payload, canonical sidecar, PDF source, or human translation was written.',
};
await immutableWrite(join(proofDir, 'proof-report-v1.json'), `${JSON.stringify(report, null, 2)}\n`);
await rm(stageDir, { recursive: true, force: true });
console.log(JSON.stringify({
  status: report.status,
  page,
  candidateKey: key,
  payloadPreservedRecords: existingBaseline.length,
  sourceAssetFilesCopied: pageFiles.length,
  exportMetrics,
  pdfVerification,
  proofDir,
}, null, 2));
