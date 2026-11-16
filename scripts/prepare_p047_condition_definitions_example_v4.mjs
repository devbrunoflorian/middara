#!/usr/bin/env node
/** Prepare v4 of the isolated p.47 condition-definitions and example proposal. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const sourceDir = resolve(root, 'apps/web/public/pages/page_047');
const pageDomPath = resolve(sourceDir, 'page_047_dom.json');
const tipPath = resolve(root, 'docs/translations/proposals/page-047-tip-callout-proposal-2026-10-15-v1.json');
const staminaPath = resolve(root, 'docs/translations/proposals/page-047-stamina-points-proposal-2026-10-15-v1.json');
const tipProposal = JSON.parse(await readFile(tipPath, 'utf8'));
const staminaProposal = JSON.parse(await readFile(staminaPath, 'utf8'));
const sourcePdfPath = resolve(root, tipProposal.source.pdfPath);
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p047-condition-definitions-example-v4');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_047');
const proposalPath = resolve(root, 'docs/translations/proposals/page-047-condition-definitions-example-2026-10-15-v4.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => hash(await readFile(path));
const normalize = value => value.replace(/\s+/gu, ' ').trim();
const marker = '\uFFFC';

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

const source = {
  pdfSha256: tipProposal.source.pdfSha256,
  pageDomSha256: tipProposal.source.pageDomSha256,
  pageInlineElementsSha256: tipProposal.source.pageInlineElementsSha256,
  pageAssetHashes: tipProposal.source.pageAssetHashes,
};
assert.equal(await hashFile(sourcePdfPath), source.pdfSha256, 'Official source PDF changed.');
assert.equal(await hashFile(pageDomPath), source.pageDomSha256, 'p.47 DOM changed.');
assert.equal(await hashFile(resolve(sourceDir, 'inline_elements.json')), source.pageInlineElementsSha256, 'p.47 inline sidecar changed.');
assert.deepEqual((await readdir(sourceDir)).sort(), Object.keys(source.pageAssetHashes).sort(), 'p.47 asset inventory changed.');
for (const [name, expectedHash] of Object.entries(source.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(sourceDir, name)), expectedHash, `p.47 asset changed: ${name}`);
}

const pageDom = JSON.parse(await readFile(pageDomPath, 'utf8'));
const compoundElements = JSON.parse(await readFile(resolve(sourceDir, 'compound_elements.json'), 'utf8')).elements;
const sourceBlock = (blockIndex, blockId) => {
  const block = pageDom.blocks[blockIndex];
  assert.equal(block?.id, blockId, `Editorial key/block mismatch at page_47_block_${blockIndex}.`);
  return block;
};
const blockText = block => normalize(block.lines.flatMap(line => line.spans
  .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
  .map(span => span.text ?? '')).join(''));
const sourceUnitText = (block, unit) => normalize(block.lines
  .filter(line => unit.field.lineIds.includes(line.id))
  .flatMap(line => line.spans.filter(span => !span.renderOnlyStrokePass).map(span => span.text ?? '')).join(''));

const tagDiscard = compoundElements.find(element => element.symbolId === 'tag.discard' && element.anchor.blockId === 'block_14');
const tagExhaust = compoundElements.find(element => element.symbolId === 'tag.exhaust' && element.anchor.blockId === 'block_14');
assert.ok(tagDiscard && tagExhaust, 'The two source condition-tag compounds must remain available.');

const defs = [
  {
    key: 'page_47_block_2', sourceKind: 'block', blockIndex: 2, blockId: 'block_14',
    sourceText: '1. Condition Tags: Tags such as ✘DISCARD or EXHAUST . See Condition Tags Pg. 30.',
    targetText: '1. Tags de Condição: Tags como [[symbol:tag.discard]] ou [[symbol:tag.exhaust]]. Veja Tags de Condição, pág. 30.',
    sourceLineCount: 3, lineHeight: 1.1, sourceFontSizePt: 10,
    managedSourceSymbols: ['tag.discard', 'tag.exhaust'],
    segments: [
      { text: '1.\t Tags de Condição:', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' Tags como ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: marker, symbolId: 'tag.discard', symbolMetrics: tagDiscard.metrics, font: 'OptimaLTStd-DemiBold', size: tagDiscard.sizePt, color: '#ffffff', weight: 600, style: 'normal', disableLigatures: true },
      { text: ' ou ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: marker, symbolId: 'tag.exhaust', symbolMetrics: tagExhaust.metrics, font: 'OptimaLTStd-DemiBold', size: tagExhaust.sizePt, color: '#ffffff', weight: 600, style: 'normal', disableLigatures: true },
      { text: '. Veja ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'Tags de Condição', font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true },
      { text: ', pág. 30.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
    terminology: [
      { source: 'Condition Tags', draft: 'Tags de Condição', status: 'pending-human-review', note: 'Termo não está no glossário oficial.' },
      { source: 'Discard / Exhaust', draft: 'DESCARTAR / EXAURIR', status: 'pending-human-review', note: 'Rótulos localizados pelo registry como tags completas; confirmar a terminologia do jogo.' },
    ],
  },
  {
    key: 'page_47_unit_p47-block-15-paragraph-1', sourceKind: 'typographicUnit', blockIndex: 3, blockId: 'block_15',
    unitId: 'p47-block-15-paragraph-1',
    targetText: '2.\t Custo em SP: A quantidade de SP que o jogador deve gastar.',
    lineHeight: 1.1, sourceFontSizePt: 10, sourceLineCount: 1,
    segments: [
      { text: '2.\t Custo em ', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: 'SP', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ': A quantidade de ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'SP', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' que o jogador deve gastar.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
    terminology: [
      { source: 'Stamina Point Cost', draft: 'Custo em SP', status: 'pending-human-review', note: 'Mantém a sigla da fonte; a expansão de SP não foi inventada.' },
    ],
  },
  {
    key: 'page_47_unit_p47-block-15-paragraph-2', sourceKind: 'typographicUnit', blockIndex: 3, blockId: 'block_15',
    unitId: 'p47-block-15-paragraph-2', targetText: 'Costuma aparecer como',
    lineHeight: 1.1, sourceFontSizePt: 10, sourceLineCount: 1,
    segments: [{ text: 'Costuma aparecer como', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true }],
    terminology: [],
  },
  {
    key: 'page_47_block_4', sourceKind: 'block', blockIndex: 4, blockId: 'block_17',
    sourceText: 'and may be listed multiple times.', targetText: 'e pode aparecer mais de uma vez.',
    lineHeight: 1.1, sourceFontSizePt: 10, sourceLineCount: 1,
    segments: [{ text: 'e pode aparecer mais de uma vez.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true }],
    terminology: [],
  },
  {
    key: 'page_47_block_5', sourceKind: 'block', blockIndex: 5, blockId: 'block_18',
    sourceText: '3. Text Conditions: Any condition or requirement listed in the text of the Ability. This could be a variety of requirements or costs.',
    targetText: '3. Condições de Texto: Requisitos e custos no texto da Habilidade.',
    lineHeight: 1.1, sourceFontSizePt: 10, sourceLineCount: 2,
    segments: [
      { text: '3.\t Condições de Texto:', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' Requisitos e custos no texto da Habilidade.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
    terminology: [
      { source: 'Text Conditions', draft: 'Condições de Texto', status: 'pending-human-review', note: 'Termo mecânico sem forma aprovada no glossário.' },
      { source: 'Ability', draft: 'Habilidade', status: 'pending-human-review', note: 'Forma usada em propostas locais; confirmar capitalização e consistência.' },
    ],
  },
  {
    key: 'page_47_block_6', sourceKind: 'block', blockIndex: 6, blockId: 'block_19',
    sourceText: '4. Symbol Conditions: The symbols a player must spend. These Abilities may only be used during the "Spend Symbols and use Abilities that add Damage" step of an attack. See The Attack Action Pg. 41.',
    targetText: '4. Condições de Símbolos: Símbolos que o jogador deve gastar. Essas Habilidades só podem ser usadas na etapa “Gastar Símbolos e usar Habilidades que adicionam Dano” de um Ataque (Ação de Ataque, pág. 41).',
    lineHeight: 1.1, sourceFontSizePt: 10, sourceLineCount: 3,
    segments: [
      { text: '4.\t Condições de Símbolos:', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' Símbolos que o jogador deve gastar. Essas Habilidades só podem ser usadas na etapa “', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'Gastar Símbolos e usar Habilidades que adicionam Dano', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: '” de um Ataque (', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'Ação de Ataque', font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true },
      { text: ', pág. 41).', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
    terminology: [
      { source: 'Symbol Conditions', draft: 'Condições de Símbolos', status: 'pending-human-review', note: 'Termo mecânico sem forma aprovada no glossário.' },
      { source: 'Spend Symbols and use Abilities that add Damage', draft: 'Gastar Símbolos e usar Habilidades que adicionam Dano', status: 'pending-human-review', note: 'Nome da etapa citado no fluxo de Ataque; confirmar com a p.41.' },
      { source: 'The Attack Action', draft: 'A Ação de Ataque', status: 'pending-human-review', note: 'Referência cruzada; conservar pág. 41.' },
      { source: 'Ability / Attack / Damage', draft: 'Habilidade / Ataque / Dano', status: 'pending-human-review', note: 'Capitalização mecânica segue para revisão humana.' },
    ],
  },
  {
    key: 'page_47_block_19', sourceKind: 'block', blockIndex: 19, blockId: 'block_41',
    sourceText: 'Example: The Discipline Intervention, depicted above, has an Ability with 3 of the 4 Condition types. A depicts an SP Cost of 1. B depicts the Exhaust Condition Tag, which will require the Adventurer to Exhaust this Discipline when its Ability is used. C shows a Text Condition that specifies that the target must be within SOI.',
    targetText: 'Exemplo: A Disciplina Intervention, ilustrada acima, tem uma Habilidade com 3 dos 4 tipos de Condição. A representa um custo de SP de 1. B mostra a Tag de Condição EXAURIR, que exige que o Aventureiro Exaura esta Disciplina quando sua Habilidade é usada. C mostra uma Condição de Texto que determina que o alvo deve estar dentro da SOI.',
    lineHeight: 1.1, sourceFontSizePt: 10, sourceLineCount: 6,
    segments: [
      { text: 'Exemplo:', font: 'AGaramondPro-Bold', size: 12, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' A Disciplina ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'Intervention,', font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic', disableLigatures: true },
      { text: ' ilustrada acima, tem uma Habilidade com ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: '3', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' dos ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: '4', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' tipos de Condição. ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'A', font: 'OptimaLTStd-Bold', size: 8, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' representa um custo de ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'SP', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' de ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: '1', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: '. ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'B', font: 'OptimaLTStd-Bold', size: 8, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' mostra a Tag de Condição EXAURIR, que exige que o Aventureiro Exaura esta Disciplina quando sua Habilidade é usada. ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'C', font: 'OptimaLTStd-Bold', size: 8, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: ' mostra uma Condição de Texto que determina que o alvo deve estar dentro da ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
      { text: 'SOI', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: '.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    ],
    terminology: [
      { source: 'Discipline / Intervention', draft: 'Disciplina / Intervention', status: 'pending-human-review', note: 'Nome próprio do card preservado em inglês.' },
      { source: 'Exhaust Condition Tag / Exhaust', draft: 'Tag de Condição EXAURIR / Exaurir', status: 'pending-human-review', note: 'O registry marca a tradução do rótulo como provisória.' },
      { source: 'SOI', draft: 'SOI', status: 'pending-human-review', note: 'Sigla mantida; expansão/localização não inferida.' },
    ],
  },
  {
    key: 'page_47_block_25', sourceKind: 'block', blockIndex: 25, blockId: 'block_60',
    sourceText: 'Using Abilities', targetText: 'Uso de Habilidades',
    lineHeight: 1.1, sourceFontSizePt: 18, sourceLineCount: 1,
    segments: [{ text: 'Uso de Habilidades', font: 'Cinzel-Regular', size: 18, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true }],
    terminology: [{ source: 'Using Abilities', draft: 'Uso de Habilidades', status: 'pending-human-review', note: 'Título proposto; revisão editorial pendente.' }],
  },
];

const units = defs.map(def => {
  const block = sourceBlock(def.blockIndex, def.blockId);
  let actualSource;
  let actualLineCount = def.sourceLineCount;
  let lineHeight = def.lineHeight;
  let sourceFontSizePt = def.sourceFontSizePt;
  if (def.sourceKind === 'typographicUnit') {
    const unit = block.typographicUnits?.find(candidate => candidate.id === def.unitId);
    assert.ok(unit, `Missing typographic unit ${def.unitId}.`);
    actualSource = sourceUnitText(block, unit);
    actualLineCount = unit.field.lineIds.length;
    lineHeight = unit.field.frame.lineHeight;
    sourceFontSizePt = block.lines.find(line => unit.field.lineIds.includes(line.id))?.spans.find(span => span.size >= 9)?.size ?? def.sourceFontSizePt;
  } else {
    actualSource = blockText(block);
  }
  if (def.sourceText) assert.equal(actualSource, normalize(def.sourceText), `Source wording changed: ${def.key}`);
  assert.equal(normalize(def.segments.map(segment => segment.symbolId ? `[[symbol:${segment.symbolId}]]` : segment.text).join('')), normalize(def.targetText),
    `Rich segments do not reproduce target notation: ${def.key}`);
  const spanKey = `${def.key}__pt-BR`;
  const unitRecord = {
    sourceEditorialKey: def.key, spanKey, sourceBlockId: def.blockId, sourceText: actualSource,
    targetText: def.targetText, lineHeight, sourceFontSizePt, sourceLineCount: actualLineCount,
    managedSourceSymbols: def.managedSourceSymbols ?? [], segments: def.segments,
    translation: {
      spanKey, language: 'pt-BR', data: {
        schemaVersion: 2, segments: def.segments, textAlign: 'left', lineHeight,
        lineHeightMode: 'custom', managedSourceSymbols: def.managedSourceSymbols ?? [],
      },
    },
    terminology: def.terminology ?? [],
  };
  return unitRecord;
});

const candidateKeys = units.map(unit => unit.spanKey);
assert.equal(new Set(candidateKeys).size, candidateKeys.length, 'Duplicate candidate keys.');
const payloadResponse = await fetch(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=1000', apiUrl));
assert.ok(payloadResponse.ok, `Read-only Payload lookup failed: ${payloadResponse.status}`);
const payload = await payloadResponse.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload lookup is paginated; cannot prove key absence.');
const existing = (payload.docs ?? []).filter(record => candidateKeys.includes(record.spanKey));
assert.deepEqual(existing, [], 'A candidate key already exists in Payload; stop and reconcile.');
const payloadBaseline = {
  readOnly: true, page: 47, locale: 'pt-BR', candidateKeys, candidateKeysAbsent: true,
  matchingPageRecords: (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_47_')).length,
};

await mkdir(snapshotDir, { recursive: true });
try {
  await access(snapshotPageDir);
} catch {
  await mkdir(resolve(snapshotDir, 'pages'), { recursive: true });
  await cp(sourceDir, snapshotPageDir, { recursive: true, errorOnExist: true });
}
for (const [name, expectedHash] of Object.entries(source.pageAssetHashes)) {
  assert.equal(await hashFile(resolve(snapshotPageDir, name)), expectedHash, `Isolated page copy mismatch: ${name}`);
}

const contextRecords = [
  ...tipProposal.contextOverrides.map(unit => ({
    spanKey: unit.spanKey, language: 'pt-BR', data: {
      schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight,
      lineHeightMode: 'custom', managedSourceSymbols: unit.managedSourceSymbols ?? [],
    },
  })),
  ...tipProposal.units.map(unit => ({
    spanKey: unit.spanKey, language: 'pt-BR', data: {
      schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight,
      lineHeightMode: 'custom', managedSourceSymbols: [],
    },
  })),
  ...staminaProposal.units.map(unit => ({
    spanKey: unit.spanKey, language: 'pt-BR', data: {
      schemaVersion: 2, segments: unit.segments, textAlign: 'left', lineHeight: unit.lineHeight,
      lineHeightMode: 'custom', managedSourceSymbols: [],
    },
  })),
];
const translations = [...contextRecords, ...units.map(unit => unit.translation)];
const allKeys = translations.map(record => record.spanKey);
assert.equal(new Set(allKeys).size, allKeys.length, 'Snapshot contains duplicate span keys.');
const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '47'], { encoding: 'utf8' });
if (boxes.status !== 0) throw new Error(`Source page boxes failed: ${boxes.stderr || boxes.stdout}`);
const snapshot = {
  translations, layoutFrames: [], symbolAliasSettings: [], assetPages: [47], page: 47,
  patched: true, verifyRenderedSnapshot: true, sourcePageBoxes: JSON.parse(boxes.stdout),
};
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(resolve(proofDir, 'payload-baseline.json'), `${JSON.stringify(payloadBaseline, null, 2)}\n`);

const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '47', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', resolve(proofDir, 'page-047-pt-BR-condition-definitions-example-v4.pdf'),
  '--metrics-output', resolve(proofDir, 'metrics.json'), '--viewer-screenshot', resolve(proofDir, 'viewer-pt-BR.png'),
  '--print-screenshot', resolve(proofDir, 'print-pt-BR.png'), '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error(`p.47 isolated export failed with exit ${exportResult.status}.`);

const pdfPath = resolve(proofDir, 'page-047-pt-BR-condition-definitions-example-v4.pdf');
const proposal = {
  proposalId: 'p047-condition-definitions-example-2026-10-15-v4', page: 47, locale: 'pt-BR',
  family: 'condition definitions 1–4 + explanatory example + page title', status: 'draft-pending-human-editorial-review',
  source: {
    pdfPath: tipProposal.source.pdfPath, pdfSha256: source.pdfSha256, pageDom: tipProposal.source.pageDom,
    pageDomSha256: source.pageDomSha256, pageInlineElementsSha256: source.pageInlineElementsSha256,
    pageAssetHashes: source.pageAssetHashes,
  },
  payloadBaseline,
  units: units.map(({ translation, ...unit }) => unit),
  contextOnly: contextRecords.map(record => record.spanKey),
  terminologyReview: {
    status: 'pending-human-review',
    terms: [...new Map(units.flatMap(unit => unit.terminology).map(item => [`${item.source}|${item.draft}`, item])).values()],
  },
  copyfit: {
    revisionBudget: 3, revision: 3, status: 'official-page-export-generated-pending-independent-visual-review',
    sourceLineCounts: Object.fromEntries(units.map(unit => [unit.sourceEditorialKey, unit.sourceLineCount])),
    targetLineCounts: null, frameAndFontChanges: false,
  },
  integrity: {
    payloadWritten: false, canonicalSidecarsChanged: false, humanTranslationsOverwritten: false,
    sourceFramesChanged: false, sourcePdfChanged: false,
  },
  evidence: {
    proofDirectory: 'output/proofs/translation-readiness-2026-10-15/p047-condition-definitions-example-v4',
    snapshot: 'output/proofs/translation-readiness-2026-10-15/p047-condition-definitions-example-v4/snapshot/snapshot.json',
    snapshotSha256: await hashFile(snapshotPath),
    exportPdf: 'output/proofs/translation-readiness-2026-10-15/p047-condition-definitions-example-v4/page-047-pt-BR-condition-definitions-example-v4.pdf',
    exportPdfSha256: await hashFile(pdfPath),
    viewerScreenshot: 'output/proofs/translation-readiness-2026-10-15/p047-condition-definitions-example-v4/viewer-pt-BR.png',
    printScreenshot: 'output/proofs/translation-readiness-2026-10-15/p047-condition-definitions-example-v4/print-pt-BR.png',
    metrics: 'output/proofs/translation-readiness-2026-10-15/p047-condition-definitions-example-v4/metrics.json',
    payloadBaseline: 'output/proofs/translation-readiness-2026-10-15/p047-condition-definitions-example-v4/payload-baseline.json',
  },
  note: 'The separate IMPORTANT Ability Rules bullet list and English text embedded in card artwork are outside this proposal. This proposal does not certify the full page.',
};
await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
console.log(JSON.stringify({
  page: 47, candidateKeys, candidateCount: units.length, contextCount: contextRecords.length,
  snapshotPath, proposalPath, proofDir, pdfSha256: proposal.evidence.exportPdfSha256,
}, null, 2));
