#!/usr/bin/env node
/** Prepare an isolated PT-BR proposal for the four normal-text Counter rules on p.49. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const sourcePdfPath = resolve(process.env.MIDDARA_SOURCE_PDF_PATH ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const sourcePageDir = resolve(root, 'apps/web/public/pages/page_049');
const pageDomPath = resolve(sourcePageDir, 'page_049_dom.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-049-counter-rules-proposal-2026-10-15-v2.json');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v2');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_049');
const comparisonScript = resolve(root, 'scripts/create_p049_counter_rules_comparison_v2.py');
const sourcePdfSha256 = 'a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351';
const pageAssetHashes = {
  'background.webp': '7d6af89c2dfd36098072515d202219c09201ab9309943c40251c3eb4e4f11848',
  'fidelity_overlays.json': 'f02b83ded76bb5c1b53732fc4b6fd37fc59e4c6289639f19183642e498f737c5',
  'fidelity-overlay-source-vector-p049-d0118.svg': '96010acf4bdf551a7f917725887a1b2cbd8d3efeb5ce46f410856dcd0224d75f',
  'fidelity-overlay-source-vector-p049-d0120.svg': '676522b0ae0c97af55c2c059df6657a9de6573e1c9dc5f2642bd5173a9f44de8',
  'fidelity-overlay-source-vector-p049-d0152.svg': 'be740d560ac1aedbd32a00b192984fd8b4bd88722a95096594af8373bf0ce3b6',
  'fidelity-overlay-source-vector-p049-d0153.svg': '8d0c672cee8f4259836ce474fdfc0ba380fd8085cb318deb90e26899619b7d1d',
  'fidelity-overlay-source-vector-p049-d0165.svg': 'c2d2b66e22df4f4369ebd398f6a1131269ed0888232d763ac115e9cafdbd5a07',
  'fidelity-overlay-source-vector-p049-d0166.svg': 'a35dfd79d4b06401ba5bec06fce33919b02b537c9dd0061d3e6824edb74b4908',
  'fidelity-overlay-source-vector-p049-d0167.svg': 'a6fd74dd61233648d1de658433184bcd086f3b59276aa8f1e6f9154e996c46df',
  'fidelity-overlay-source-vector-p049-d0168.svg': 'e9c4b0b20e10063a4b2e5674384a6f81cbb65c5bf181202eccca75a8289a968b',
  'inline_elements.json': '6d41483875fe7c3f0a83e8337d60c1e16f7ede4997b030106385fdf065e498c5',
  'inline-element-mask-000.png': '80c392f806ac23ab69b3ed7d23e853a457b9b0eefe78552818ea0c0e4e05c79c',
  'inline-element-mask-001.png': '5f7acbe5f6ad0478a3592e1b6c376e650414c72b19d43259733c9882de688969',
  'inline-element-mask-002.png': '2898967983199cee924fca6b30fd17621530f0d76e5a51eff81c0896311665a8',
  'inline-element-mask-003.png': '2898967983199cee924fca6b30fd17621530f0d76e5a51eff81c0896311665a8',
  'layout_frames.json': '9e4928930dd5085f9e08e82427bcbde300f5b066acd480a3f4ce332d68764f08',
  'page_049_dom.json': 'bf7755a493cb02d63414a32f28fb225a01fe1673fbe71b9fca77e042be0f7041',
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => digest(await readFile(path));
const normalize = value => value.replace(/\s+/gu, ' ').trim();
const text = (value, font = 'OptimaLTStd', size = 10, weight = 400, style = 'normal') => ({
  text: value, font, size, color: '#ffffff', weight, style, disableLigatures: true,
});
const regular = value => text(value);
const bold = value => text(value, 'OptimaLTStd-Bold', 10, 700);
const counter = () => text('CONTRA-ATACAR', 'OptimaLTStd-Bold', 9, 700);
const counterNoun = () => text('Contra-ataque', 'OptimaLTStd-Bold', 9, 700);
const boldIt = value => text(value, 'OptimaLTStd-BoldItalic', 10, 700, 'italic');

async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

const definitions = [
  {
    index: 0, blockId: 'block_20', sourceLineCount: 4,
    sourceText: 'If a figure Attacks a target and the Attack misses or deals no Final Damage, the target may use the COUNTER Ability during the Check if the Target Counters step of the Attack. See The Attack Action Pg. 41.',
    targetText: 'Se uma miniatura atacar um alvo e o Ataque errar ou não causar Dano Final, o alvo pode usar a Habilidade CONTRA-ATACAR durante a etapa Verifique o Contra-ataque do Ataque. Consulte Ação de Ataque, p. 41.',
    segments: [
      regular('Se uma miniatura atacar um alvo e o Ataque errar '), bold('ou'),
      regular(' não causar Dano Final, o alvo pode usar a Habilidade '), counter(),
      regular(' durante a etapa '), bold('Verifique o Contra-ataque'),
      regular(' do Ataque. Consulte '), boldIt('Ação de Ataque'), regular(', p. 41.'),
    ],
  },
  {
    index: 1, blockId: 'block_21', sourceLineCount: 7,
    sourceText: 'Adventurers and Command Combatants may use the COUNTER Ability for 2 SP. However, if they successfully Dodged the Attack being Countered, they may reduce the cost of the Counter by 1 SP. Some Items and Disciplines also have the COUNTER Tag listed as an Ability. In cases where there is an SP cost on a COUNTER Tag this SP cost may also be reduced by 1. Intelligent Combatants will only COUNTER if their Combatant Card instructs them to.',
    targetText: "Aventureiros e Combatentes de Comando podem usar a Habilidade CONTRA-ATACAR por 2 SP. Se esquivarem com sucesso do Ataque, podem reduzir em 1 SP o custo do Contra-ataque. Alguns Itens e Disciplinas também listam a Tag CONTRA-ATACAR como Habilidade. Se houver custo de SP na Tag, ele também pode ser reduzido em 1. Combatentes Inteligentes só usam essa Habilidade se sua Carta de Combatente instruir.",
    segments: [
      regular('Aventureiros e Combatentes de Comando podem usar a Habilidade '), counter(),
      regular(' por '), text('2 SP', 'OptimaLTStd-Bold', 9, 700),
      regular('. Se esquivarem com sucesso do Ataque, podem reduzir em '), text('1 SP', 'OptimaLTStd-Bold', 9, 700),
      regular(' o custo do Contra-ataque. Alguns Itens e Disciplinas também listam a Tag '), counter(),
      regular(' como Habilidade. Se houver custo de '), text('SP', 'OptimaLTStd-Bold', 9, 700),
      regular(' na Tag, ele também pode ser reduzido em '), text('1', 'OptimaLTStd-Bold', 9, 700),
      regular('. Combatentes Inteligentes só usam essa Habilidade se sua Carta de Combatente instruir.'),
    ],
  },
  {
    index: 2, blockId: 'block_22', sourceLineCount: 7,
    sourceText: 'To COUNTER, the target being Attacked must have Line of Sight and be within Range of the figure making the Attack Action. If the initial figure that made the Attack Action is blocked by a different opposing figure, that figure may be chosen as the target of the Counter instead. If these requirements are met, the current Attack Action immediately ends and the target being Attacked makes an Attack Action targeting the Attacker.',
    targetText: 'Para CONTRA-ATACAR, a miniatura atacada precisa ter Linha de Visão e estar ao Alcance da miniatura que realiza a Ação de Ataque. Se uma miniatura adversária diferente bloquear a miniatura que iniciou a Ação de Ataque, ela poderá ser escolhida como alvo do Contra-ataque. Se esses requisitos forem atendidos, a Ação de Ataque atual termina imediatamente, e a miniatura atacada realiza uma Ação de Ataque contra o atacante.',
    segments: [
      regular('Para '), counter(),
      regular(', a miniatura atacada precisa ter Linha de Visão e estar ao Alcance da miniatura que realiza a Ação de Ataque. Se uma miniatura adversária diferente bloquear a miniatura que iniciou a Ação de Ataque, ela poderá ser escolhida como alvo do Contra-ataque. Se esses requisitos forem atendidos, a Ação de Ataque atual termina imediatamente, e a miniatura atacada realiza uma Ação de Ataque contra o atacante.'),
    ],
  },
  {
    index: 3, blockId: 'block_23', sourceLineCount: 5,
    sourceText: "It is possible for some back and forth to occur when a figure makes a COUNTER during the Check if the Target Counters step of another figure's COUNTER. In these cases, after resolving all Attacks granted by the COUNTER Ability, the figure whose turn it was when the initial Action was made, would resume their turn.",
    targetText: "Pode haver contra-ataques em sequência quando uma miniatura usa CONTRA-ATACAR durante a etapa Verifique o Contra-ataque do Contra-ataque de outra miniatura. Depois de resolver todos os Ataques concedidos pela Habilidade CONTRA-ATACAR, a miniatura cujo turno estava em andamento ao iniciar a Ação inicial retoma o turno.",
    segments: [
      regular('Pode haver contra-ataques em sequência quando uma miniatura usa '), counter(),
      regular(' durante a etapa '), bold('Verifique o Contra-ataque'), regular(' do '), counterNoun(),
      regular(' de outra miniatura. Depois de resolver todos os Ataques concedidos pela Habilidade '), counter(),
      regular(', a miniatura cujo turno estava em andamento ao iniciar a Ação inicial retoma o turno.'),
    ],
  },
];

assert.equal(await hashFile(sourcePdfPath), sourcePdfSha256, 'Official source PDF changed.');
assert.deepEqual((await readdir(sourcePageDir)).sort(), Object.keys(pageAssetHashes).sort(), 'p.49 asset inventory changed.');
for (const [name, expectedHash] of Object.entries(pageAssetHashes)) {
  assert.equal(await hashFile(resolve(sourcePageDir, name)), expectedHash, `p.49 asset changed: ${name}`);
}

const pageDom = JSON.parse(await readFile(pageDomPath, 'utf8'));
const units = definitions.map(unit => {
  const block = pageDom.blocks[unit.index];
  assert.equal(block?.id, unit.blockId, `Editorial key/block mismatch at page_49_block_${unit.index}.`);
  const actualSource = normalize(block.lines.flatMap(line => line.spans
    .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '')).join(''));
  assert.equal(actualSource, normalize(unit.sourceText), `Source wording changed at page_49_block_${unit.index}.`);
  assert.equal(unit.segments.map(segment => segment.text).join(''), unit.targetText, `Rich segments do not reproduce target at page_49_block_${unit.index}.`);
  const key = `page_49_block_${unit.index}`;
  const spanKey = `${key}__pt-BR`;
  const sourceFonts = block.lines.flatMap(line => line.spans).filter(span => span.text?.trim()).map(span => span.font);
  const sourceColor = block.lines.flatMap(line => line.spans).find(span => span.text?.trim())?.color ?? '#ffffff';
  const segments = unit.segments.map(segment => ({ ...segment, color: sourceColor }));
  return {
    sourceEditorialKey: key, spanKey, sourceBlockId: unit.blockId, sourceText: actualSource,
    targetText: unit.targetText, sourceLineCount: unit.sourceLineCount, segments, sourceFonts: [...new Set(sourceFonts)],
    translation: { spanKey, language: 'pt-BR', data: { schemaVersion: 2, segments, textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'custom', managedSourceSymbols: [] } },
  };
});
const candidateKeys = units.map(unit => unit.spanKey);
assert.equal(new Set(candidateKeys).size, candidateKeys.length, 'Duplicate candidate keys.');

const translationResponse = await fetch(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=1000', apiUrl));
assert.ok(translationResponse.ok, `Read-only Payload lookup failed: ${translationResponse.status}`);
const translationPayload = await translationResponse.json();
assert.ok((translationPayload.docs ?? []).length >= Number(translationPayload.totalDocs ?? 0), 'Payload lookup is paginated; cannot prove candidate-key absence.');
const pageRecords = (translationPayload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_49_'));
assert.deepEqual((translationPayload.docs ?? []).filter(record => candidateKeys.includes(record.spanKey)), [], 'A candidate key already exists in Payload; stop and reconcile.');

const frameResponse = await fetch(new URL('/api/layout-frames?where%5Band%5D%5B0%5D%5BpageNumber%5D%5Bequals%5D=49&limit=1000', apiUrl));
assert.ok(frameResponse.ok, `Read-only layout-frame lookup failed: ${frameResponse.status}`);
const framePayload = await frameResponse.json();
const layoutFrames = (framePayload.docs ?? []).filter(doc => Number(doc.pageNumber) === 49);
const aliasResponse = await fetch(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
assert.ok(aliasResponse.ok, `Read-only symbol-alias lookup failed: ${aliasResponse.status}`);
const aliasPayload = await aliasResponse.json();
const payloadBaseline = { readOnly: true, page: 49, locale: 'pt-BR', candidateKeys, candidateKeysAbsent: true, pageTranslationRecordCount: pageRecords.length, layoutFrameCount: layoutFrames.length, symbolAliasSettingCount: (aliasPayload.docs ?? []).length };

await mkdir(snapshotDir, { recursive: true });
try { await access(snapshotPageDir); } catch {
  await mkdir(resolve(snapshotDir, 'pages'), { recursive: true });
  await cp(sourcePageDir, snapshotPageDir, { recursive: true, errorOnExist: true });
}
assert.deepEqual((await readdir(snapshotPageDir)).sort(), Object.keys(pageAssetHashes).sort(), 'Snapshot p.49 asset inventory mismatch.');
for (const [name, expectedHash] of Object.entries(pageAssetHashes)) {
  assert.equal(await hashFile(resolve(snapshotPageDir, name)), expectedHash, `Snapshot asset mismatch: ${name}`);
}

const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '49'], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);
const translations = units.map(unit => unit.translation);
const snapshot = { translations, layoutFrames, symbolAliasSettings: aliasPayload.docs ?? [], assetPages: [49], page: 49, patched: true, verifyRenderedSnapshot: true, sourcePageBoxes: JSON.parse(boxes.stdout) };
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(resolve(proofDir, 'payload-baseline.json'), `${JSON.stringify(payloadBaseline, null, 2)}\n`);

const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '49', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', resolve(proofDir, 'page-049-pt-BR-counter-rules-proposal.pdf'),
  '--metrics-output', resolve(proofDir, 'metrics.json'), '--viewer-screenshot', resolve(proofDir, 'viewer-pt-BR.png'),
  '--print-screenshot', resolve(proofDir, 'print-pt-BR.png'), '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error(`p.49 isolated PDF export failed with exit ${exportResult.status}.`);
const comparison = spawnSync('python', [comparisonScript], { cwd: root, stdio: 'inherit' });
if (comparison.status !== 0) throw new Error(`p.49 visual comparison failed with exit ${comparison.status}.`);

const comparisonManifest = JSON.parse(await readFile(resolve(root, 'docs/project-progress/evidence/2026-10-15-p049-counter-rules-v2/visual-comparison.json'), 'utf8'));
const targetLineCounts = comparisonManifest.targetLineCounts;
assert.deepEqual(Object.keys(targetLineCounts).sort(), units.map(unit => unit.sourceEditorialKey).sort(), 'Independent PDF line-count audit is incomplete.');
assert.equal(comparisonManifest.allTextInsideSourceFrames, true, 'Translation exceeds a source editorial frame; proposal not finalized.');
assert.equal(comparisonManifest.noInterUnitCollision, true, 'Translated text collides with another unit; proposal not finalized.');
const snapshotSha256 = await hashFile(snapshotPath);
const proposal = {
  proposalId: 'p049-counter-rules-2026-10-15-v2', page: 49, locale: 'pt-BR',
  family: 'four consecutive counter-rule paragraphs', status: 'draft-pending-human-editorial-review',
  source: { pdfPath: sourcePdfPath.replaceAll('\\', '/'), pdfSha256: sourcePdfSha256, pageDom: 'apps/web/public/pages/page_049/page_049_dom.json', pageDomSha256: pageAssetHashes['page_049_dom.json'], inlineElementsSha256: pageAssetHashes['inline_elements.json'], pageAssetHashes },
  payloadBaseline,
  units: units.map(({ translation, sourceFonts, ...unit }) => ({ ...unit, renderedLineCount: targetLineCounts[unit.sourceEditorialKey] })),
  terminologyReview: {
    status: 'pending-human-review',
    terms: [
      { source: 'COUNTER', draft: 'CONTRA-ATACAR / contra-ataque', reason: 'Consistent with nearby p.41 and p.48 proposals; not approved in the official glossary.' },
      { source: 'DODGE / Dodged', draft: 'ESQUIVA / se esquivar', reason: 'The p.41 proposal uses ESQUIVA; the mechanic term remains subject to human glossary review.' },
      { source: 'Command Combatant / Intelligent Combatant / Combatant Card', draft: 'Combatente de Comando / Combatente Inteligente / Carta do Combatente', reason: 'Forms follow the p.41 draft but are not separate approved glossary entries.' },
      { source: 'Tag / Line of Sight / Range', draft: 'Tag / Linha de Visão / Alcance', reason: 'Forms follow nearby draft usage and require editorial consistency review.' },
    ],
  },
  copyfit: {
    status: 'isolated-render-and-export-fit-pending-human-editorial-review',
    sourceLineCounts: Object.fromEntries(units.map(unit => [unit.sourceEditorialKey, unit.sourceLineCount])),
    targetLineCounts, frameAndFontChanges: false, noVisibleCollision: comparisonManifest.noInterUnitCollision,
  },
  evidence: {
    proofDirectory: 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v2',
    snapshot: 'output/proofs/translation-readiness-2026-10-15/p049-counter-rules-v2/snapshot/snapshot.json',
    snapshotSha256, exportPdfSha256: comparisonManifest.exportPdfSha256,
    viewerScreenshotSha256: comparisonManifest.viewerScreenshotSha256,
    comparisonCropSha256: comparisonManifest.comparisonCropSha256,
    comparisonManifest: 'docs/project-progress/evidence/2026-10-15-p049-counter-rules-v2/visual-comparison.json',
  },
  note: 'Only the four normal-text paragraphs in the left rules column are proposed. The page title, IMPORTANT callouts, card text, dice, other artwork and all symbol placements are outside this proposal. No canonical sidecar, Payload record, human translation, frame or font is written.',
};
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
console.log(JSON.stringify({ page: 49, candidateKeys, targetLineCounts, snapshotPath, proposalPath, proofDir }, null, 2));
