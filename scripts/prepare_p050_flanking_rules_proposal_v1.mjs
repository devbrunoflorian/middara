#!/usr/bin/env node
// Build a read-only p.50 PT-BR proposal snapshot with all existing human
// example records carried through unchanged. Nothing is written to Payload.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const version = process.env.P050_PROPOSAL_VERSION ?? 'v1';
assert.ok(['v1', 'v2'].includes(version), `Unsupported p.50 proposal generation: ${version}`);
const resumeExistingProof = process.env.P050_RESUME === '1';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const sourcePdf = resolve(process.env.MIDDARA_SOURCE_PDF_PATH ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const sourcePdfSha256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351';
const page = 50;
const sourceDir = resolve(root, 'apps/web/public/pages/page_050');
const proofDir = resolve(root, `output/proofs/translation-readiness-2026-10-15/p050-flanking-rules-${version}`);
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages/page_050');
const snapshotPath = join(snapshotDir, 'snapshot.json');
const pdfPath = join(proofDir, `page-050-pt-BR-flanking-rules-proposal-${version}.pdf`);
const viewerPath = join(proofDir, `viewer-pt-BR-${version}.png`);
const printPath = join(proofDir, `print-pt-BR-${version}.png`);
const metricsPath = join(proofDir, `metrics-${version}.json`);
const manifestPath = join(proofDir, `copyfit-reconciliation-${version}.json`);
const proposalJsonPath = resolve(root, `docs/translations/proposals/page-050-flanking-rules-proposal-2026-10-15-${version}.json`);
const proposalMdPath = resolve(root, `docs/translations/proposals/page-050-flanking-rules-proposal-2026-10-15-${version}.md`);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => digest(await readFile(path));
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
async function writeNew(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to overwrite changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
async function getJson(url) {
  const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Read-only GET failed (${response.status}): ${url}`);
  return response.json();
}
const regular = text => ({ text, font: 'OptimaLTStd', size: 10, color: '#ffffff', weight: 400, style: 'normal', disableLigatures: true });
const bold = text => ({ text, font: 'OptimaLTStd-Bold', size: 10, color: '#ffffff', weight: 700, style: 'normal', disableLigatures: true });
const object = metrics => ({ text: '\uFFFC', font: 'OptimaLTStd', size: 10, color: '#ffffff', weight: 400, style: 'normal', disableLigatures: true, symbolId: metrics.symbolId, symbolMetrics: { ...metrics.metrics } });

const definitions = [
  {
    id: 'p50-block-13-paragraph-1',
    source: 'When 2 allies are on opposite sides or corners of an opponent, so long as they are not under an effect that would prevent them from making an Attack and they each also have an equipped \uFFFC Weapon, they are both considered to be Flanking that opponent. Figures making a \uFFFCAttack against a target they are Flanking Gain +1 TO THE ATK ROLL.',
    target: 'Quando 2 aliados estão em lados ou cantos opostos de um oponente, desde que nenhum esteja sob um efeito que o impeça de realizar um Ataque e cada um também tenha uma \uFFFC Arma equipada, ambos flanqueiam esse oponente. Miniaturas que realizam um \uFFFC Ataque contra um alvo que flanqueiam recebem +1 na ROLAGEM DE ATAQUE.',
    segments: [
      regular('Quando '), bold('2'), regular(' aliados estão em lados ou cantos opostos de um oponente, desde que nenhum esteja sob um efeito que o impeça de realizar um Ataque e cada um também tenha uma '),
      null,
      regular(' Arma equipada, ambos flanqueiam esse oponente. Miniaturas que realizam um '), null, regular(' Ataque contra um alvo que flanqueiam recebem '), bold('+1'), regular(' na '), bold('ROLAGEM DE ATAQUE'), regular('.'),
    ],
    symbols: ['attack.melee', 'attack.melee'],
  },
  {
    id: 'p50-block-13-paragraph-2',
    source: 'Some Abilities give Adventurers and Combatants bonuses only when they are Flanking a target. For example, figures with the BACKSTAB Tag Gain +3 PHYSICAL DMG when making a \uFFFC Attack against a target they are Flanking.',
    target: 'Algumas Habilidades concedem bônus a Aventureiros e Combatentes apenas quando flanqueiam um alvo. Por exemplo, miniaturas com a Tag BACKSTAB recebem +3 de DANO FÍSICO ao realizar um \uFFFC Ataque contra um alvo que flanqueiam.',
    segments: [
      regular('Algumas Habilidades concedem bônus a Aventureiros e Combatentes apenas quando flanqueiam um alvo. Por exemplo, miniaturas com a Tag '), bold('BACKSTAB'), regular(' recebem '), bold('+3 de DANO FÍSICO'), regular(' ao realizar um '), null, regular(' Ataque contra um alvo que flanqueiam.'),
    ],
    symbols: ['attack.melee'],
  },
  {
    id: 'p50-block-13-paragraph-3',
    source: 'Weapons with the \uFFFCIcon cannot Gain the Flanking bonus. Figures with equipped \uFFFCWeapons cannot grant another figure the Flanking bonus.',
    target: 'Armas com o Ícone \uFFFC não recebem o bônus de flanqueio. Miniaturas equipadas com Armas que exibem o Ícone \uFFFC não podem conceder o bônus de flanqueio a outra miniatura.',
    segments: [
      regular('Armas com o Ícone '), null, regular(' não recebem o bônus de flanqueio. Miniaturas equipadas com Armas que exibem o Ícone '), null, regular(' não podem conceder o bônus de flanqueio a outra miniatura.'),
    ],
    symbols: ['attack.ranged', 'attack.ranged'],
  },
  {
    id: 'p50-block-13-paragraph-4',
    source: 'Weapons with the Reach Tag may also Flank and provide opportunities for allies to Backstab. So long as a figure with Reach is attacking an opponent while there is also another ally who is within Melee Range (or the Range of their own Reach Tag) of your target and on the opposite side or corner of that same target, you Gain the Flanking bonus.',
    target: 'Armas com a Tag Alcance também podem flanquear e criar oportunidades para aliados usarem BACKSTAB. Se uma miniatura com Alcance estiver atacando um oponente enquanto houver outro aliado que esteja ao Alcance Corpo a Corpo (ou ao Alcance da própria Tag Alcance desse aliado) do alvo e em um lado ou canto oposto do mesmo alvo, você recebe o bônus de flanqueio.',
    segments: [
      regular('Armas com a Tag Alcance também podem flanquear e criar oportunidades para aliados usarem '), bold('BACKSTAB'), regular('. Se uma miniatura com Alcance estiver atacando um oponente enquanto houver outro aliado que esteja ao Alcance Corpo a Corpo (ou ao Alcance da própria Tag Alcance desse aliado) do alvo '), bold('e'), regular(' em um lado ou canto oposto do mesmo alvo, você recebe o bônus de flanqueio.'),
    ],
    symbols: [],
  },
  {
    id: 'p50-block-13-paragraph-5',
    source: 'Below are some Diagrams to help explain this better:',
    target: 'Os diagramas abaixo ajudam a explicar melhor:',
    segments: [regular('Os diagramas abaixo ajudam a explicar melhor:')],
    symbols: [],
  },
];

if (version === 'v2') {
  definitions[1].target = 'Algumas Habilidades só concedem bônus a Aventureiros e Combatentes quando flanqueiam um alvo. Por exemplo, miniaturas com a Tag BACKSTAB recebem +3 de DANO FÍSICO ao realizar um \uFFFC Ataque contra um alvo que flanqueiam.';
  definitions[1].segments = [
    regular('Algumas Habilidades só concedem bônus a Aventureiros e Combatentes quando flanqueiam um alvo. Por exemplo, miniaturas com a Tag '), bold('BACKSTAB'), regular(' recebem '), bold('+3 de DANO FÍSICO'), regular(' ao realizar um '), null, regular(' Ataque contra um alvo que flanqueiam.'),
  ];
  definitions[2].target = 'Armas com o Ícone \uFFFC não recebem bônus de flanqueio. Miniaturas equipadas com Armas que exibem o Ícone \uFFFC não podem conceder esse bônus a outra miniatura.';
  definitions[2].segments = [
    regular('Armas com o Ícone '), null, regular(' não recebem bônus de flanqueio. Miniaturas equipadas com Armas que exibem o Ícone '), null, regular(' não podem conceder esse bônus a outra miniatura.'),
  ];
  definitions[3].target = 'Armas com a Tag Alcance também podem flanquear e abrir oportunidades para aliados usarem BACKSTAB. Quando uma miniatura com Alcance ataca um oponente, você também recebe o bônus de flanqueio se outro aliado estiver ao Alcance Corpo a Corpo do alvo (ou ao Alcance da própria Tag Alcance desse aliado) e em um lado ou canto oposto do mesmo alvo.';
  definitions[3].segments = [
    regular('Armas com a Tag Alcance também podem flanquear e abrir oportunidades para aliados usarem '), bold('BACKSTAB'), regular('. Quando uma miniatura com Alcance ataca um oponente, você também recebe o bônus de flanqueio se outro aliado estiver ao Alcance Corpo a Corpo do alvo (ou ao Alcance da própria Tag Alcance desse aliado) '), bold('e'), regular(' em um lado ou canto oposto do mesmo alvo.'),
  ];
}

assert.equal(await hashFile(sourcePdf), sourcePdfSha256, 'Official source PDF changed');
const canonicalNames = (await readdir(sourceDir, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name).sort();
const canonicalHashesBefore = Object.fromEntries(await Promise.all(canonicalNames.map(async name => [name, await hashFile(join(sourceDir, name))])));
assert.equal(canonicalHashesBefore['page_050_dom.json'], '057dcca65d19bf8f4dd74c2c4b1e7f175250faaf0fac2177fe85793884c76179', 'p.50 DOM diverged from activated checkpoint');
assert.equal(canonicalHashesBefore['inline_elements.json'], 'deda8ffa70575075993c80c908fe0e14291248c3b649f05a0c0e5799eb561c0a', 'p.50 sidecar diverged from activated checkpoint');
const dom = JSON.parse(await readFile(join(sourceDir, 'page_050_dom.json'), 'utf8'));
const block = dom.blocks.find(item => item.id === 'block_13');
assert.ok(block, 'Missing p.50 block_13');
const units = block.typographicUnits ?? [];
assert.deepEqual(units.map(unit => unit.id), definitions.map(unit => unit.id), 'p.50 editorial unit IDs/order changed');
const inline = JSON.parse(await readFile(join(sourceDir, 'inline_elements.json'), 'utf8'));
const occurrences = (inline.elements ?? []).filter(element => element.anchor?.blockId === 'block_13');
const occurrenceByUnit = new Map();
for (const unit of units) {
  const lineIds = new Set(unit.field.lineIds);
  occurrenceByUnit.set(unit.id, occurrences.filter(element => lineIds.has(element.anchor.lineId)));
}
for (const [index, definition] of definitions.entries()) {
  const unit = units[index];
  const lineIds = new Set(unit.field.lineIds);
  const lineOrder = new Map(unit.field.lineIds.map((lineId, lineIndex) => [lineId, lineIndex]));
  const unitOccurrences = occurrenceByUnit.get(unit.id).sort((a, b) =>
    lineOrder.get(a.anchor.lineId) - lineOrder.get(b.anchor.lineId) || a.anchor.spanIndex - b.anchor.spanIndex);
  let raw = '';
  for (const lineId of unit.field.lineIds) {
    const line = block.lines.find(item => item.id === lineId);
    assert.ok(line, `Missing source line ${lineId}`);
    for (const [spanIndex, span] of line.spans.entries()) {
      for (const element of unitOccurrences.filter(item => item.anchor.lineId === lineId && item.anchor.spanIndex === spanIndex && item.anchor.side === 'before')) raw += '\uFFFC';
      if (!span.renderOnlyStrokePass && span.font !== 'ZapfDingbatsStd') raw += span.text ?? '';
      for (const element of unitOccurrences.filter(item => item.anchor.lineId === lineId && item.anchor.spanIndex === spanIndex && item.anchor.side === 'after')) raw += '\uFFFC';
    }
  }
  assert.equal(normalize(raw), normalize(definition.source), `Source/occurrence topology changed for ${definition.id}`);
  assert.equal(normalize(definition.segments.map(segment => segment?.text ?? '\uFFFC').join('')), normalize(definition.target), `Text segments diverge from candidate ${definition.id}`);
  assert.equal(unitOccurrences.length, definition.symbols.length, `Unexpected source symbol count for ${definition.id}`);
  assert.deepEqual(unitOccurrences.map(element => element.symbolId), definition.symbols, `Source symbol order/identity changed for ${definition.id}`);
  let symbolIndex = 0;
  definition.segments = definition.segments.map(segment => segment ?? object(unitOccurrences[symbolIndex++]));
  assert.equal(symbolIndex, unitOccurrences.length, `Draft did not consume every source symbol in ${definition.id}`);
}
assert.equal(new Set(definitions.map(item => `page_50_unit_${item.id}__pt-BR`)).size, 5, 'Duplicate candidate identity');

const translationResponse = await getJson(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=5000', apiUrl));
const allPtRecords = translationResponse.docs ?? [];
assert.ok(allPtRecords.length >= Number(translationResponse.totalDocs ?? 0), 'Payload PT-BR records are paginated');
const pageRecords = allPtRecords.filter(record => String(record.spanKey ?? '').startsWith('page_50_'));
const humanExampleKeys = Array.from({ length: 10 }, (_, index) => `page_50_unit_p50-flanking-example-${index + 1}__pt-BR`).sort();
assert.deepEqual(pageRecords.map(record => record.spanKey).sort(), humanExampleKeys, 'p.50 human translation inventory changed');
const candidateKeys = definitions.map(unit => `page_50_unit_${unit.id}__pt-BR`);
assert.deepEqual(allPtRecords.filter(record => candidateKeys.includes(record.spanKey)), [], 'A candidate key now exists in Payload');
const payloadBaseline = pageRecords.map(record => ({ id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt, sha256: digest(Buffer.from(stable(record))) })).sort((a, b) => a.spanKey.localeCompare(b.spanKey));
const framesResponse = await getJson(new URL('/api/layout-frames?where%5Band%5D%5B0%5D%5BpageNumber%5D%5Bequals%5D=50&limit=1000', apiUrl));
const layoutFrames = (framesResponse.docs ?? []).filter(record => Number(record.pageNumber) === page);
assert.equal(layoutFrames.length, 0, 'Unexpected server layout-frame overrides for p.50');
const aliasesResponse = await getJson(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
const candidates = definitions.map((definition, index) => {
  const segments = definition.segments.map(segment => ({ ...segment, color: '#ffffff' }));
  const managedSourceSymbols = [...new Set(segments.flatMap(segment => segment.symbolId ? [segment.symbolId] : []))];
  return {
    spanKey: candidateKeys[index], language: 'pt-BR',
    data: { schemaVersion: 2, segments, textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'custom', managedSourceSymbols },
  };
});
const translations = [...pageRecords, ...candidates];
assert.equal(translations.length, 15, 'Snapshot must preserve 10 human examples plus five isolated candidates');
assert.equal(new Set(translations.map(record => record.spanKey)).size, 15, 'Snapshot contains duplicate translation keys');

let proofDirExists = false;
try { await access(proofDir); proofDirExists = true; }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
assert.ok(!proofDirExists || resumeExistingProof, `Refusing to reuse existing proof generation: ${proofDir}`);
try { await access(proposalJsonPath); throw new Error(`Proposal file already exists: ${proposalJsonPath}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
try { await access(proposalMdPath); throw new Error(`Proposal file already exists: ${proposalMdPath}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

await mkdir(snapshotPageDir, { recursive: true });
for (const name of canonicalNames) await writeNew(join(snapshotPageDir, name), await readFile(join(sourceDir, name)));
const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdf, String(page)], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page-box extraction failed: ${boxes.stderr || boxes.stdout}`);
const snapshot = {
  translations,
  layoutFrames,
  symbolAliasSettings: aliasesResponse.docs ?? [],
  assetPages: [page], page, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes: JSON.parse(boxes.stdout),
};
await writeNew(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await writeNew(join(proofDir, `payload-baseline-${version}.json`), `${JSON.stringify({
  page, locale: 'pt-BR', humanPageRecordCount: pageRecords.length,
  humanRecords: payloadBaseline,
  proposedKeysAbsent: candidateKeys,
  payloadWriteRequests: 0,
}, null, 2)}\n`);
await writeNew(join(proofDir, `canonical-page-hashes-${version}.json`), `${JSON.stringify({ sourcePdfSha256, canonicalPageFiles: canonicalHashesBefore }, null, 2)}\n`);

if (resumeExistingProof) {
  for (const artifact of [pdfPath, viewerPath, printPath, metricsPath]) {
    try { await access(artifact); }
    catch { throw new Error(`Cannot resume incomplete proof; missing exported artifact: ${artifact}`); }
  }
} else {
  const exported = spawnSync(process.execPath, [
    resolve(root, 'scripts/export_page_pdf.mjs'), '--page', String(page), '--language', 'pt-BR', '--profile', 'visual',
    '--snapshot', snapshotPath, '--output', pdfPath, '--metrics-output', metricsPath,
    '--viewer-screenshot', viewerPath, '--print-screenshot', printPath,
    '--base-url', baseUrl, '--api-url', apiUrl, '--source-pdf', sourcePdf,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (exported.status !== 0) throw new Error(`Official isolated p.50 PDF export failed: ${exported.stderr || exported.stdout}`);
}
const reconciled = spawnSync('python', [
  resolve(root, 'scripts/reconcile_p050_flanking_rules_proposal_v1.py'), sourcePdf, pdfPath, viewerPath, proofDir, manifestPath, snapshotPath,
], { cwd: root, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 });
if (reconciled.status !== 0) throw new Error(`Independent p.50 proposal reconciliation failed: ${reconciled.stderr || reconciled.stdout}`);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
assert.equal(metrics.page, page, 'Export metrics belong to a different page');
assert.equal(metrics.language, 'pt-BR', 'Export metrics belong to a different locale');
assert.deepEqual(manifest.candidateTextOccurrences, Object.fromEntries(definitions.map(unit => [unit.id, 1])), 'Candidate missing/duplicated in PDF');
assert.ok(Object.values(manifest.sourceFallbackOccurrences).every(count => count === 0), 'Source prose fallback appeared for a proposed unit');
assert.ok(manifest.humanPageRecordsPreserved, 'The 10 preexisting human p.50 records changed in the snapshot');
assert.equal(manifest.sourcePdfSha256, sourcePdfSha256, 'Different source PDF used in comparison');
const verifier = spawnSync('python', [
  resolve(root, 'scripts/verify_page_pdf_export.py'), pdfPath, '--page', String(page), '--contains', 'Quando 2 aliados', '--reject', '\uFFFD',
], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (verifier.status !== 0) throw new Error(`Independent PDF verifier failed: ${verifier.stderr || verifier.stdout}`);
const pdfVerification = JSON.parse(verifier.stdout);
assert.equal(pdfVerification.pages, 1, 'p.50 proposal PDF must contain one page');
assert.deepEqual(pdfVerification.pageSizePt, [820.346, 820.346], 'p.50 proposal PDF MediaBox differs from source');
assert.equal(pdfVerification.replacementCharacters, 0, 'p.50 proposal PDF has replacement characters');

const canonicalHashesAfter = Object.fromEntries(await Promise.all(canonicalNames.map(async name => [name, await hashFile(join(sourceDir, name))])));
assert.deepEqual(canonicalHashesAfter, canonicalHashesBefore, 'Canonical p.50 page assets changed during isolated proposal/export');
const copyfitPass = manifest.allTextInsideSourceFrames && manifest.noInterUnitCollision;
const proposal = {
  proposalId: `p050-flanking-rules-2026-10-15-${version}`, page, locale: 'pt-BR',
  family: 'five consecutive Flanking and Backstab rule paragraphs',
  status: copyfitPass ? 'isolated-copyfit-verified-pending-human-editorial-review' : 'copyfit-blocked-not-ready-for-approval',
  revision: version === 'v1'
    ? 'Initial complete draft, rendered in the real PageRenderer and official one-page PDF export. No source frame, sidecar, canonical translation, or Payload record was changed.'
    : 'Revision 2 shortens p.50 paragraphs 2–4 after the first measured export. It retains source frames, fonts, symbol identities, and human translations; no canonical translation or Payload record was changed.',
  units: definitions.map((unit, index) => ({
    id: unit.id, key: candidateKeys[index], sourceText: unit.source, ptBR: unit.target,
    segments: candidates[index].data.segments,
    sourceVisualLines: manifest.sourceVisualLineCounts[unit.id],
    targetVisualLines: manifest.targetVisualLineCounts[unit.id],
    frameFit: manifest.frameFitByUnit[unit.id],
    overflowByEdge: manifest.overflowByUnit[unit.id],
  })),
  terminologyPending: [
    'Flanking / Flank / Flanking bonus → flanquear / flanqueio, guided by saved p.50 human wording; no glossary approval.',
    'Reach / Reach Tag → Alcance / Tag Alcance; p.50 human usage is local evidence only.',
    'Melee Range → Alcance Corpo a Corpo; preserve saved page usage, pending glossary/terminology review.',
    'BACKSTAB remains an untranslated Tag name; confirm house treatment.',
    'Ability / Weapon / Attack / Icon / Physical DMG require consistency review against the broader book; no glossary decision is inferred here.',
  ],
  copyfit: {
    status: copyfitPass ? 'pass-in-source-sized-frames' : 'failed-source-frame-fit',
    sourceVisualLineCounts: manifest.sourceVisualLineCounts,
    targetVisualLineCounts: manifest.targetVisualLineCounts,
    frameFitByUnit: manifest.frameFitByUnit,
    noInterUnitCollision: manifest.noInterUnitCollision,
    collisions: manifest.collisions,
  },
  verification: {
    officialIsolatedPdfExported: true,
    snapshotTranslationKeysVerified: true,
    candidateTextManifestVerified: true,
    independentPdfVerification: pdfVerification,
    candidateTextOccurrences: manifest.candidateTextOccurrences,
    sourceFallbackOccurrences: manifest.sourceFallbackOccurrences,
    humanPageRecordCountBefore: pageRecords.length,
    humanPageRecordsPreserved: manifest.humanPageRecordsPreserved,
    payloadWriteRequests: 0,
    canonicalPageAssetsUnchanged: true,
    sourcePdfSha256, exportPdfSha256: manifest.exportPdfSha256,
    snapshotSha256: await hashFile(snapshotPath),
  },
  evidence: {
    proofDir: `output/proofs/translation-readiness-2026-10-15/p050-flanking-rules-${version}/`,
    pdf: `output/proofs/translation-readiness-2026-10-15/p050-flanking-rules-${version}/page-050-pt-BR-flanking-rules-proposal-${version}.pdf`,
    viewer: `output/proofs/translation-readiness-2026-10-15/p050-flanking-rules-${version}/viewer-pt-BR-${version}.png`,
    print: `output/proofs/translation-readiness-2026-10-15/p050-flanking-rules-${version}/print-pt-BR-${version}.png`,
    comparison: `output/proofs/translation-readiness-2026-10-15/p050-flanking-rules-${version}/source-viewer-pdf-crop-${version}.png`,
    manifest: `output/proofs/translation-readiness-2026-10-15/p050-flanking-rules-${version}/copyfit-reconciliation-${version}.json`,
    snapshot: `output/proofs/translation-readiness-2026-10-15/p050-flanking-rules-${version}/snapshot/snapshot.json`,
  },
  limits: [
    'Proposal is isolated and awaits human linguistic and terminology review; it is not a saved translation.',
    'The 10 existing example translations were included unchanged only to prevent fallback in the rest of p.50.',
    'No Payload writes or changes to canonical page assets occurred.',
    'This proposal does not certify page-level structural readiness or other pages.',
  ],
};
await writeNew(proposalJsonPath, `${JSON.stringify(proposal, null, 2)}\n`);
const toReadable = value => value.replaceAll('\uFFFC', '[símbolo inline]');
const markdown = `# p.50 — Flanqueio e BACKSTAB, proposta ${version}\n\n**Estado:** ${proposal.status}. Proposta experimental, não gravada nem aprovada editorialmente.\n\n${definitions.map((unit, index) => `## Unidade ${index + 1} — \`${unit.id}\`\n\n**Fonte EN:** ${unit.source.replaceAll('\uFFFC', '[símbolo]')}\n\n**Proposta PT-BR:** ${toReadable(unit.target)}\n\n- Símbolos semânticos: ${unit.symbols.length ? unit.symbols.join(', ') : 'nenhum'}.\n- Linhas visuais EN/PT: ${manifest.sourceVisualLineCounts[unit.id]} / ${manifest.targetVisualLineCounts[unit.id]}.\n- Dentro do frame-fonte: ${manifest.frameFitByUnit[unit.id] ? 'sim' : 'não'}.\n`).join('\n')}\n## Revisão pendente\n\n${proposal.terminologyPending.map(item => `- ${item}`).join('\n')}\n\n## Copyfit e integridade\n\n- PDF isolado oficial: SHA-256 \`${manifest.exportPdfSha256}\`.\n- O PDF contém cada uma das cinco propostas uma vez e nenhum trecho-fallback EN dos parágrafos propostos.\n- Colisões entre unidades propostas: ${manifest.collisions.length}.\n- As 10 traduções humanas de exemplos foram copiadas sem alteração para o snapshot; nenhum pedido de escrita foi enviado ao Payload.\n- Hashes canônicos da p.50 conferidos antes/depois; sem mudança.\n- PDF-fonte SHA-256: \`${sourcePdfSha256}\`.\n\n## Evidências\n\n- PDF: \`${proposal.evidence.pdf}\`.\n- Comparação legível Fonte EN / Viewer PT-BR / PDF: \`${proposal.evidence.comparison}\`.\n- Screenshot do Viewer: \`${proposal.evidence.viewer}\`.\n- Reconciliação geométrica: \`${proposal.evidence.manifest}\`.\n- Snapshot reproduzível: \`${proposal.evidence.snapshot}\`.\n`;
await writeNew(proposalMdPath, markdown);
console.log(JSON.stringify({ proposal: proposalJsonPath, status: proposal.status, copyfit: proposal.copyfit, pdfVerification, manifest }, null, 2));
