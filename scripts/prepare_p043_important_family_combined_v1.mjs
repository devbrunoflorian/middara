#!/usr/bin/env node
/** Create a read-only one-page proof with all three p.43 IMPORTANT drafts. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';

const root = process.cwd();
const manifestPath = resolve(root, 'docs/translations/proposals/important-family-manifest-2026-10-13.json');
const sourcePdf = resolve(root, '../Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const pageDir = resolve(root, 'apps/web/public/pages/page_043');
const outputDir = resolve(root, 'output/proofs/important-family-validation-2026-10-15/p043-combined-v1');
const snapshotDir = resolve(outputDir, 'snapshot');
const sourcePdfHash = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351';
const domHash = '57828186a9018973a6957f3e5a6ead3ce5d62737040e55b637d1e4cc07409157';
const ids = ['p043-block_22', 'p043-block_26', 'p043-block_60'];
const targetTexts = {
  'p043-block_22': 'IMPORTANTE: Se um Aventureiro equipar 2 Armas de Longo Alcance diferentes, com 2 Valores de Alcance diferentes, só poderá atacar alvos usando o menor dos dois valores.',
  'p043-block_26': 'IMPORTANTE: Ao contrário do movimento, todos os tipos de Alcance são contados na diagonal e na ortogonal.',
  'p043-block_60': 'IMPORTANTE: Uma Ação de Ataque exige que o alvo do Ataque esteja dentro do Alcance e da Linha de Visão.',
};

const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const run = (cmd, args, input) => {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', input, maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
const rel = path => relative(root, path).split(sep).join('/');

assert.equal(await stat(outputDir).then(() => true).catch(() => false), false,
  `Refusing to overwrite existing proof: ${rel(outputDir)}`);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(manifest.source.pdfSha256, sourcePdfHash, 'Manifest source PDF hash changed');
assert.equal(await hash(sourcePdf), sourcePdfHash, 'Official PDF hash changed');
const domRecord = manifest.source.pageSidecars.find(item => item.page === 43);
assert.equal(domRecord?.sha256, domHash, 'Manifest p.43 DOM hash changed');
assert.equal(await hash(resolve(root, domRecord.path)), domHash, 'Current p.43 DOM differs from the audited source');

const proposals = ids.map(id => {
  const item = manifest.occurrences.find(record => record.occurrenceId === id);
  assert.ok(item, `Missing ${id}`);
  assert.equal(item.page, 43);
  assert.equal(item.proposal.locale, 'pt-BR');
  assert.equal(item.proposal.sourceBlockSha256, item.source.blockSha256);
  assert.equal(item.source.pageSidecarSha256, domHash);
  assert.equal(item.proposal.targetPlainText, targetTexts[id], `${id} text changed`);
  assert.equal(item.proposal.targetText, `[[symbol:tag.important.icon]]${targetTexts[id]}`);
  assert.equal(item.existingPT?.length ?? 0, 0, `${id} conflicts with existing human PT-BR`);
  assert.equal(item.proposal.segments.filter(s => s.symbolId === 'tag.important.icon').length, 1);
  assert.equal(item.proposal.segments.filter(s => !s.symbolId).map(s => s.text).join(''), targetTexts[id]);
  for (const span of item.proposal.explicitRichSpans ?? []) {
    assert.equal(item.proposal.targetPlainText.slice(span.start, span.end), span.targetText, `${id}:${span.id} span mismatch`);
  }
  return item;
});
assert.equal(new Set(proposals.map(item => item.source.editorialKey)).size, 3);

// Measure source line leading directly from the official PDF, not a guessed CSS default.
const measureSource = String.raw`
import json, sys, pymupdf
doc = pymupdf.open(sys.argv[1]); page = doc[42]
needles = {
 "p043-block_22": ["If an Adventurer equips", "with 2 different Ranged Values", "targets using the lowest of the two values."],
 "p043-block_26": ["Unlike movement, all types of Range are counted", "diagonally as well as orthogonally."],
 "p043-block_60": ["An Attack Action requires the target of the Attack to", "be within Range and Line of Sight."],
}
result = {}
for key, expected in needles.items():
 rows = []
 for block in page.get_text("dict")["blocks"]:
  for line in block.get("lines", []):
   spans = line.get("spans", []); text = "".join(s.get("text", "") for s in spans)
   if any(n in text for n in expected):
    body = next(s for s in spans if s.get("origin") and s.get("text", "").strip() and s.get("text", "").strip() != "IMPORTANT:")
    rows.append({"sourceLine": text, "baselinePt": float(body["origin"][1]), "fontSizePt": float(body["size"])})
 rows.sort(key=lambda row: row["baselinePt"])
 assert len(rows) == len(expected), (key, rows)
 leading = [round(rows[i+1]["baselinePt"] - rows[i]["baselinePt"], 6) for i in range(len(rows)-1)]
 assert all(abs(row["fontSizePt"] - 10) < 0.02 for row in rows), (key, rows)
 assert leading and all(abs(value - 11) < 0.02 for value in leading), (key, leading)
 result[key] = {"rows": rows, "leadingPt": leading, "bodySizePt": 10, "lineHeightRatio": 1.1}
print(json.dumps({"pdfPageIndex": 42, "printedPage": 43, "groups": result}, ensure_ascii=False))
`;
const sourceLeading = JSON.parse(run('py', ['-X', 'utf8', '-', sourcePdf], measureSource));

await mkdir(snapshotDir, { recursive: true });
const snapshotPageDir = resolve(snapshotDir, 'pages/page_043');
await cp(pageDir, snapshotPageDir, { recursive: true, force: false, errorOnExist: true });
const sourceBoxes = JSON.parse(run('py', [
  '-X', 'utf8', resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdf, '43',
]));
const translations = proposals.map(item => ({
  spanKey: `${item.source.editorialKey}__pt-BR`,
  language: 'pt-BR',
  data: {
    schemaVersion: 2,
    segments: item.proposal.segments.map(segment => Object.fromEntries(
      ['text', 'font', 'size', 'color', 'weight', 'style', 'disableLigatures', 'textStrokeWidthPt', 'textStrokeColor',
        'symbolId', 'symbolMetrics', 'sourceRendering']
        .filter(key => segment[key] !== undefined)
        .map(key => [key, segment[key]]),
    )),
    textAlign: 'left',
    lineHeight: 1.1,
    lineHeightMode: 'custom',
    managedSourceSymbols: item.proposal.symbolIds ?? [],
  },
}));
assert.equal(new Set(translations.map(item => item.spanKey)).size, 3);
assert.ok(translations.every(item => item.language === 'pt-BR' && item.spanKey.endsWith('__pt-BR') && !item.spanKey.includes('__en')));
const snapshot = { translations, layoutFrames: [], symbolAliasSettings: [], assetPages: [43], sourcePageBoxes: sourceBoxes };
const snapshotPath = resolve(snapshotDir, 'snapshot-p043-important-family-v1.json');
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
await writeFile(resolve(outputDir, 'source-leading-measurements.json'), `${JSON.stringify(sourceLeading, null, 2)}\n`, { flag: 'wx' });

const sourceAssets = {};
for (const name of (await readdir(pageDir)).sort()) {
  const path = resolve(pageDir, name);
  if ((await stat(path)).isFile()) sourceAssets[name] = await hash(path);
}
for (const [name, digest] of Object.entries(sourceAssets)) {
  assert.equal(await hash(resolve(snapshotPageDir, name)), digest, `Snapshot asset differs: ${name}`);
}
await writeFile(resolve(outputDir, 'source-hashes.json'), `${JSON.stringify({ sourcePdfSha256: sourcePdfHash, page043DomSha256: domHash, sourceAssets }, null, 2)}\n`, { flag: 'wx' });

const outputs = {
  pdf: resolve(outputDir, 'p043-pt-BR-important-family-v1.pdf'),
  viewer: resolve(outputDir, 'viewer-p043-pt-BR-important-family-v1.png'),
  print: resolve(outputDir, 'print-p043-pt-BR-important-family-v1.png'),
  metrics: resolve(outputDir, 'export-metrics.json'),
};
const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '43', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', outputs.pdf, '--metrics-output', outputs.metrics,
  '--viewer-screenshot', outputs.viewer, '--print-screenshot', outputs.print,
  '--base-url', 'http://127.0.0.1:8080', '--api-url', 'http://localhost:3000',
], { cwd: root, stdio: 'inherit', maxBuffer: 20 * 1024 * 1024 });
if (exportResult.status !== 0) throw new Error(`Official export failed (${exportResult.status ?? exportResult.error})`);

const metrics = JSON.parse(await readFile(outputs.metrics, 'utf8'));
const receipt = {
  status: 'combined-isolated-exported; visual inspection and human terminology review pending',
  generatedAt: new Date().toISOString(),
  officialSourcePdfSha256: sourcePdfHash,
  page043DomSha256: domHash,
  sourceLeading,
  translations: translations.map(item => ({ spanKey: item.spanKey, language: item.language, text: item.data.segments.filter(s => !s.symbolId).map(s => s.text).join('') })),
  sourceAssets,
  metrics,
  outputs: Object.fromEntries(await Promise.all(Object.entries(outputs).map(async ([label, path]) => [label, { path: rel(path), sha256: await hash(path) }]))),
  persistence: { payloadWrites: 0, canonicalPageWrites: 0, humanTranslationWrites: 0 },
};
await writeFile(resolve(outputDir, 'combined-proof-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ outputDir: rel(outputDir), status: receipt.status, keys: translations.map(item => item.spanKey), pdf: receipt.outputs.pdf }, null, 2));
