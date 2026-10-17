#!/usr/bin/env node
/** Build an isolated, full editable-prose proposal for p.48 with the four existing v22 symbol patches. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const baseUrl = process.env.MIDDARA_VIEWER_URL ?? 'http://127.0.0.1:8080';
const sourcePdfPath = 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sourcePageDir = resolve(root, 'apps/web/public/pages/page_048');
const sourceDomPath = resolve(sourcePageDir, 'page_048_dom.json');
const sourceSidecarPath = resolve(sourcePageDir, 'inline_elements.json');
const baseProposalPath = resolve(root, 'docs/translations/proposals/page-048-end-actions-proposal-2026-10-15-v2.json');
const baseSnapshotPath = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p048-end-actions-v2/snapshot/snapshot.json');
const patchedPageDir = resolve(root, 'output/proofs/translation-readiness-2026-10-14/p048-alias-reproof-v1/snapshots/p048-v192-193-n2/pages/page_048');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-15/p048-full-editable-text-v3-corrected');
const snapshotDir = resolve(proofDir, 'snapshot');
const snapshotPageDir = resolve(snapshotDir, 'pages/page_048');
const snapshotPath = resolve(snapshotDir, 'snapshot.json');
const proposalPath = resolve(root, 'docs/translations/proposals/page-048-full-editable-text-proposal-2026-10-15-v3-corrected.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-048-full-editable-text-proposal-2026-10-15-v3-corrected.md');
const exportPdfPath = resolve(proofDir, 'page-048-pt-BR-full-editable-v3-corrected.pdf');
const metricsPath = resolve(proofDir, 'page-048-pt-BR-full-editable-v3-corrected-metrics.json');
const viewerPath = resolve(proofDir, 'viewer-pt-BR-v3-corrected.png');
const printPath = resolve(proofDir, 'print-pt-BR-v3-corrected.png');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const hashFile = async path => hash(await readFile(path));
const sourcePdfHash = 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351';
const sourceDomHash = 'A1B7F2FDF4CB12EF491F49FA1402ED04B10903EDA35E5C9AD48451CAC6E6CD80';
const canonicalSidecarHash = 'F2D7539F34756CF30F4779457D7255D451199782C519FC3BD084348A9CE77342';
const requiredPatchIds = [
  'p048-v125-126-n2',
  'p048-v127-128-n2',
  'p048-v192-193-n2',
  'p048-v214-215-n2',
];

async function immutableWrite(path, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace a changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

assert.equal(await hashFile(sourcePdfPath), sourcePdfHash, 'Official source PDF changed.');
assert.equal(await hashFile(sourceDomPath), sourceDomHash, 'p.48 DOM changed.');
assert.equal(await hashFile(sourceSidecarPath), canonicalSidecarHash, 'Canonical p.48 sidecar changed.');

const baseProposal = JSON.parse(await readFile(baseProposalPath, 'utf8'));
assert.equal(baseProposal.units.length, 3, 'Existing v2 proposal no longer contains the three expected units.');
const baseSnapshot = JSON.parse(await readFile(baseSnapshotPath, 'utf8'));
const dom = JSON.parse(await readFile(sourceDomPath, 'utf8'));
const patchedSidecar = JSON.parse(await readFile(resolve(patchedPageDir, 'inline_elements.json'), 'utf8'));
const patchedIds = patchedSidecar.elements.map(element => element.provenance?.candidateId).filter(Boolean).sort();
assert.deepEqual(patchedIds, [...requiredPatchIds].sort(), 'Isolated p.48 snapshot has a different symbol-patch set.');
assert.equal(patchedSidecar.elements.length, 7, 'Expected three existing elements plus four prepared placements.');

const blockIndex = new Map(dom.blocks.map((block, index) => [block.id, index]));
const blockById = new Map(dom.blocks.map(block => [block.id, block]));
const normalize = text => String(text ?? '').replace(/\s+/gu, ' ').trim();
function blockText(block) {
  return normalize(block.lines.map(line => line.spans.map(span => span.text).join('')).join(' '));
}
function unitText(block, unit) {
  const lineIds = new Set(unit.field.lineIds);
  return normalize(block.lines.filter(line => lineIds.has(line.id)).map(line => line.spans.map(span => span.text).join('')).join(' '));
}
function segment(text, font = 'OptimaLTStd', size = 10, options = {}) {
  return {
    text,
    font,
    size,
    color: options.color ?? '#231f20',
    weight: options.weight ?? 400,
    style: options.style ?? 'normal',
    ...(options.disableLigatures === undefined ? {} : { disableLigatures: options.disableLigatures }),
  };
}
function sidecarSymbols(blockId) {
  const block = blockById.get(blockId);
  const linePosition = new Map(block.lines.map((line, index) => [line.id, index]));
  return patchedSidecar.elements
    .filter(element => element.anchor?.blockId === blockId)
    .sort((a, b) => (linePosition.get(a.anchor.lineId) ?? 0) - (linePosition.get(b.anchor.lineId) ?? 0)
      || (a.anchor.spanIndex ?? 0) - (b.anchor.spanIndex ?? 0)
      || (a.anchor.side === 'before' ? -1 : 1))
    .map(element => ({
      symbolId: element.symbolId,
      sourceAnchor: element.anchor,
      symbolMetrics: {
        widthEm: element.metrics.advanceEm ?? element.metrics.widthEm,
        heightEm: element.metrics.heightEm,
        verticalAlignEm: element.metrics.verticalAlignEm,
      },
    }));
}
function symbolSegment(entry, size = 10) {
  return {
    text: '\uFFFC', font: 'OptimaLTStd', size, color: '#231f20', weight: 400, style: 'normal',
    symbolId: entry.symbolId, symbolMetrics: entry.symbolMetrics,
  };
}
function record(spanKey, segments, { lineHeight = 1.1, lineHeightMode = 'custom', textAlign = 'left', managedSourceSymbols = [] } = {}) {
  return {
    spanKey,
    language: 'pt-BR',
    data: { schemaVersion: 2, segments, textAlign, lineHeight, lineHeightMode, managedSourceSymbols },
  };
}
function blockRecord(sourceBlockId, segments, options = {}) {
  const index = blockIndex.get(sourceBlockId);
  assert.ok(Number.isInteger(index), `Unknown p.48 source block: ${sourceBlockId}`);
  return record(`page_48_block_${index}__pt-BR`, segments, options);
}
function typographicUnitRecord(sourceBlockId, unitId, segments) {
  const block = blockById.get(sourceBlockId);
  const unit = block.typographicUnits?.find(candidate => candidate.id === unitId);
  assert.ok(unit, `Missing source typographic unit: ${unitId}`);
  return record(`page_48_unit_${unitId}__pt-BR`, segments, {
    lineHeight: unit.field.frame.lineHeight ?? 1.1,
    lineHeightMode: 'custom',
    textAlign: unit.field.frame.textAlign ?? 'left',
  });
}

const block27Symbols = sidecarSymbols('block_27');
assert.deepEqual(block27Symbols.map(item => item.symbolId), ['attack.melee', 'attack.ranged']);
const block100Symbols = sidecarSymbols('block_100');
assert.deepEqual(block100Symbols.map(item => item.symbolId), ['attack.melee', 'attack.melee', 'attack.melee']);
const block118Symbols = sidecarSymbols('block_118');
assert.deepEqual(block118Symbols.map(item => item.symbolId), ['attack.melee']);
const block12 = blockById.get('block_12');
const block12Paragraph = block12.typographicUnits.find(unit => unit.id === 'p48-block-12-paragraph-1');
const block12Heading = block12.typographicUnits.find(unit => unit.id === 'p48-block-12-paragraph-2');
assert.match(unitText(block12, block12Paragraph), /AI Steps/u, 'The first child must include the cross-reference paragraph.');
assert.equal(unitText(block12, block12Heading), 'Passive Conditions', 'The second child is the Passive Conditions heading.');

const additions = [
  blockRecord('block_120', [
    segment('Habilidades', 'Cinzel-Regular', 18, { weight: 700 }),
    segment(' (continuação)', 'Cinzel-Regular', 11, { weight: 700 }),
  ]),
  typographicUnitRecord('block_12', 'p48-block-12-paragraph-1', [
    segment('Concluída esta Habilidade, o turno interrompido é retomado. Veja como os Passos de IA são afetados em '),
    segment('Ações e Habilidades', 'OptimaLTStd-BoldItalic', 10, { weight: 700, style: 'italic' }),
    segment(', pág. 60.'),
  ]),
  typographicUnitRecord('block_12', 'p48-block-12-paragraph-2', [
    segment('Condições Passivas', 'Cinzel-Regular', 12, { weight: 700 }),
  ]),
  blockRecord('block_14', [
    segment('O Marcador de Condição Passiva concede ao Aventureiro Habilidades sempre ativas. Habilidades Passivas que contenham outra Habilidade sujeita a um Marcador de Condição — como um custo adicional de '),
    segment('SP', 'OptimaLTStd-Bold', 10, { weight: 700 }),
    segment(' — só permanecem ativas se esse custo for pago. Algumas Habilidades com o Marcador de Condição Passiva exigem requisitos específicos para que o Aventureiro se beneficie delas.'),
  ]),
  blockRecord('block_15', [
    segment('Uma carta com '),
    segment('2', 'OptimaLTStd-Bold', 9, { weight: 700 }),
    segment(' Habilidades diferentes — '),
    segment('1', 'OptimaLTStd-Bold', 9, { weight: 700 }),
    segment(' com um Marcador de Condição Passiva e '),
    segment('1', 'OptimaLTStd-Bold', 9, { weight: 700 }),
    segment(' com uma Condição diferente — concede a Habilidade sob o Marcador de Condição Passiva, independentemente de a outra Condição ter sido cumprida. Habilidades com esse Marcador '),
    segment('podem', 'OptimaLTStd-Bold', 10, { weight: 700 }),
    segment(' ser usadas mesmo que a carta esteja Exaurida.'),
  ]),
  blockRecord('block_25', [segment('Habilidades que Iniciam Ações', 'Cinzel-Regular', 12, { weight: 700 })]),
  blockRecord('block_27', [
    segment('Algumas Habilidades usam Marcadores para permitir que os jogadores realizem Ações, como as Ações de Movimento, Ataque ou Feitiço. Marcadores que iniciam Ações e também exigem Ícones específicos em Armas equipadas (como o ícone '),
    symbolSegment(block27Symbols[0]),
    segment(' ATK ou o Marcador '),
    symbolSegment(block27Symbols[1]),
    segment(' ATK) só podem ser usados se o Aventureiro tiver uma Arma equipada com o Ícone correspondente. Veja '),
    segment('Marcadores', 'OptimaLTStd-BoldItalic', 10, { weight: 700, style: 'italic' }),
    segment(', págs. 92–93, para determinar se a Habilidade inicia uma Ação. Habilidades que iniciam Ações não podem ser usadas durante outra Ação sem antes encerrá-la.'),
  ], { managedSourceSymbols: block27Symbols.map(item => item.symbolId) }),
  blockRecord('block_100', [
    segment('Exemplo: ', 'AGaramondPro-Bold', 12, { weight: 700 }),
    segment('Ao usar a Habilidade de '),
    segment('False Idol', 'OptimaLTStd-BoldItalic', 10, { weight: 700, style: 'italic' }),
    segment(', um Aventureiro exaure a Carta de Disciplina e realiza um '),
    symbolSegment(block100Symbols[0]),
    segment(' ATK. Essa Ação de Ataque exige que ele tenha o ícone '),
    symbolSegment(block100Symbols[1]),
    segment(' em uma Arma equipada. Como está usando '),
    segment('War Axe', 'OptimaLTStd-Italic', 10, { style: 'italic' }),
    segment(', pode usar essa Habilidade, pois essa Arma tem o ícone '),
    symbolSegment(block100Symbols[2]),
    segment('.'),
  ], { managedSourceSymbols: block100Symbols.map(item => item.symbolId) }),
  blockRecord('block_102', [segment('Habilidades que Encerram Turnos', 'Cinzel-Regular', 12, { weight: 700 })]),
  blockRecord('block_104', [
    segment('Algumas Habilidades podem instruir uma miniatura a encerrar o turno atual em certas circunstâncias (por exemplo, '),
    segment('ao causar Dano', 'OptimaLTStd-Bold', 10, { weight: 700 }),
    segment('). Se uma miniatura usar uma Habilidade que instrua a encerrar o turno, não poderá mais realizar Ações nem usar Habilidades depois de resolver a circunstância em questão. No entanto, o turno só termina depois que forem resolvidas quaisquer Ações ou Habilidades de outras miniaturas que estejam reagindo à Ação ou Habilidade.'),
  ]),
  blockRecord('block_117', [
    segment('Exemplo: ', 'AGaramondPro-Bold', 12, { weight: 700 }),
    segment('A habilidade de '),
    segment("Abbadon's Subtlety", 'OptimaLTStd-Italic', 10, { style: 'italic' }),
    segment(' encerra o turno depois de causar Dano. Se o Dano for causado, o alvo ainda poderá usar quaisquer Ações ou Habilidades para evitá-lo, redirecioná-lo ou concluir sua reação antes do fim do turno.'),
  ]),
  blockRecord('block_118', [
    segment('Exemplo: ', 'AGaramondPro-Bold', 12, { weight: 700 }),
    segment('A Habilidade de '),
    segment('Hammer Helm', 'OptimaLTStd-Italic', 10, { style: 'italic' }),
    segment(' concede ao Aventureiro '),
    segment('+1 de DANO FÍSICO', 'OptimaLTStd-Bold', 9, { weight: 700 }),
    segment(' nos Ataques. Além disso, ele pode exaurir a Disciplina para rerrolar quaisquer dados da Reserva de Combate ao realizar um '),
    symbolSegment(block118Symbols[0]),
    segment(' Ataque com uma Arma de '),
    segment('2', 'OptimaLTStd-Bold', 10, { weight: 700 }),
    segment(' mãos. Mesmo com a carta Exaurida, o Aventureiro ainda recebe o bônus de '),
    segment('DANO FÍSICO', 'OptimaLTStd-Bold', 9, { weight: 700 }),
    segment(' da Habilidade Passiva.'),
  ], { managedSourceSymbols: block118Symbols.map(item => item.symbolId) }),
];

const allTranslations = [...baseSnapshot.translations.map(item => structuredClone(item)), ...additions];
const keys = allTranslations.map(item => item.spanKey);
assert.equal(new Set(keys).size, keys.length, 'Proposal has duplicate translation keys.');
assert.equal(allTranslations.length, 15, 'Expected all 15 editable text and heading units.');

const apiResponse = await fetch(new URL('/api/translations?where%5Blanguage%5D%5Bequals%5D=pt-BR&limit=5000', apiUrl), { signal: AbortSignal.timeout(20000) });
assert.ok(apiResponse.ok, `Read-only Payload lookup failed: ${apiResponse.status}`);
const payload = await apiResponse.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload result is paginated; cannot prove key absence.');
const conflicts = (payload.docs ?? []).filter(item => keys.includes(item.spanKey));
assert.deepEqual(conflicts, [], 'A proposed translation key already exists in Payload; stop and reconcile.');

const sourcePageBoxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, '48'], { encoding: 'utf8' });
if (sourcePageBoxes.status !== 0) throw new Error(`Source PDF boxes failed: ${sourcePageBoxes.stderr || sourcePageBoxes.stdout}`);
const snapshot = {
  ...baseSnapshot,
  translations: allTranslations,
  sourcePageBoxes: JSON.parse(sourcePageBoxes.stdout),
  verifyRenderedSnapshot: true,
};

await mkdir(snapshotDir, { recursive: true });
try { await access(resolve(snapshotPageDir, 'page_048_dom.json')); }
catch {
  await mkdir(resolve(snapshotDir, 'pages'), { recursive: true });
  await cp(patchedPageDir, snapshotPageDir, { recursive: true, errorOnExist: true });
}
const snapshotPageFiles = (await readdir(snapshotPageDir)).sort();
const requiredPageFiles = (await readdir(patchedPageDir)).sort();
assert.deepEqual(snapshotPageFiles, requiredPageFiles, 'Snapshot page asset inventory differs from the prepared symbol patch.');
const snapshotSidecar = JSON.parse(await readFile(resolve(snapshotPageDir, 'inline_elements.json'), 'utf8'));
assert.deepEqual(snapshotSidecar.elements.map(element => element.provenance?.candidateId).filter(Boolean).sort(), [...requiredPatchIds].sort());
await immutableWrite(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

const translationsByKey = new Map(allTranslations.map(item => [item.spanKey, item]));
function plainText(data) { return data.segments.map(item => item.symbolId ? '' : String(item.text ?? '')).join(''); }
const proposalUnits = [...baseProposal.units];
for (const item of additions) {
  const isUnit = item.spanKey.includes('_unit_');
  const sourceMatch = item.spanKey.match(/^page_48_(?:block_(\d+)|unit_(.+))__pt-BR$/u);
  assert.ok(sourceMatch, `Unexpected key: ${item.spanKey}`);
  let sourceBlock;
  let sourceText;
  let sourceBlockId;
  let editorialKey = item.spanKey.replace('__pt-BR', '');
  if (isUnit) {
    const unitId = sourceMatch[2];
    sourceBlock = blockById.get('block_12');
    const unit = sourceBlock.typographicUnits.find(candidate => candidate.id === unitId);
    sourceText = unitText(sourceBlock, unit);
    sourceBlockId = sourceBlock.id;
  } else {
    const index = Number(sourceMatch[1]);
    sourceBlock = dom.blocks[index];
    sourceText = blockText(sourceBlock);
    sourceBlockId = sourceBlock.id;
  }
  proposalUnits.push({
    sourceEditorialKey: editorialKey,
    spanKey: item.spanKey,
    sourceBlockId,
    sourceText,
    targetText: plainText(item.data),
    segments: item.data.segments,
    managedSourceSymbols: item.data.managedSourceSymbols,
    sourceSymbolSequence: item.data.managedSourceSymbols,
  });
}
assert.equal(proposalUnits.length, 15);

const proposal = {
  proposalId: 'p048-full-editable-text-2026-10-15-v3-corrected',
  page: 48,
  locale: 'pt-BR',
  family: 'complete-editable-prose-and-headings',
  status: 'isolated-proposal-awaiting-visual-and-editor-verification',
  source: {
    pdfPath: sourcePdfPath,
    pdfSha256: sourcePdfHash,
    pageDom: 'apps/web/public/pages/page_048/page_048_dom.json',
    pageDomSha256: sourceDomHash,
    canonicalInlineElementsSha256: canonicalSidecarHash,
    isolatedPatchSnapshot: 'output/proofs/translation-readiness-2026-10-14/p048-alias-reproof-v1/snapshots/p048-v192-193-n2',
  },
  units: proposalUnits,
  unitCoverage: {
    editableTextAndHeadings: 15,
    proposed: 15,
    existingV2Units: 3,
    addedUnits: 12,
    sourceInlineSymbolSequence: ['attack.melee', 'attack.ranged', 'attack.melee', 'attack.melee', 'attack.melee', 'attack.melee'],
    preparedPatchIds: requiredPatchIds,
    excludedComponentArtwork: ['False Idol card', 'War Axe card', 'Abbadon\'s Subtlety card', 'Hammer Helm card'],
  },
  terminologyReview: [
    { source: 'Passive Condition Tag / Condition Tag', candidate: 'Marcador de Condição Passiva / Marcador de Condição', status: 'pending-human-review' },
    { source: 'Passive Ability / Exhausted / Exhaust', candidate: 'Habilidade Passiva / Exaurido(a) / exaurir', status: 'pending-human-review' },
    { source: 'AI Steps / AI Instruction', candidate: 'Passos de IA / Instrução de IA', status: 'pending-human-review' },
    { source: 'ATK Tag / Tags', candidate: 'Marcador ATK / Marcadores', status: 'pending-human-review' },
    { source: 'counter', candidate: 'contra-ataque', status: 'pending-human-review' },
    { source: 'Combat Dice Pool / PHYSICAL DMG', candidate: 'Reserva de Dados de Combate / DANO FÍSICO', status: 'pending-human-review' },
  ],
  copyfit: { status: 'awaiting-official-viewer-and-pdf-measurements', sourcePageFramesChanged: false, canonicalDataChanged: false },
  evidence: {
    proofDirectory: 'output/proofs/translation-readiness-2026-10-15/p048-full-editable-text-v3-corrected',
    snapshot: 'output/proofs/translation-readiness-2026-10-15/p048-full-editable-text-v3-corrected/snapshot/snapshot.json',
  },
  note: 'This is an experimental, recoverable proposal. No Payload, canonical translation, canonical sidecar, or human-authored translation is written. The four card images remain source artwork; candidate wording is not editorial approval.',
};

const markdown = [
  '# p.48 — proposta integral do texto editável v3',
  '',
  '**Status:** proposta isolada; revisão humana pendente. Nenhuma tradução foi salva no Payload ou em sidecar canônico.',
  '',
  'Esta versão inclui as 15 unidades editoriais de texto e headings editáveis da página. Os quatro placements preparados no ledger v22 foram incorporados somente ao snapshot de prova: `p048-v125-126-n2`, `p048-v127-128-n2`, `p048-v192-193-n2` e `p048-v214-215-n2`. Eles preservam seis ocorrências inline entre `attack.melee` e `attack.ranged`; não são novas descobertas nem ativação canônica. A unidade `block_12` mantém o parágrafo de retomada/IA e o heading “Condições Passivas” em seus dois campos distintos.',
  '',
  'A proposta mantém os nomes das quatro cartas como arte incorporada em inglês. Os termos `Passive Condition Tag`, `Condition Tag`, `Exhausted`, `AI Steps`, `ATK Tag`, `counter`, `Combat Dice Pool` e `PHYSICAL DMG` continuam candidatos experimentais para revisão humana.',
  '',
  'O [JSON estruturado](page-048-full-editable-text-proposal-2026-10-15-v3-corrected.json), o [snapshot reproduzível](../../../output/proofs/translation-readiness-2026-10-15/p048-full-editable-text-v3-corrected/snapshot/snapshot.json) e as capturas Viewer/print/PDF ficam associados ao relatório de progresso.',
  '',
].join('\n');

await immutableWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(markdownPath, markdown);

await mkdir(proofDir, { recursive: true });
await immutableWrite(resolve(proofDir, 'payload-baseline.json'), `${JSON.stringify({ readOnly: true, page: 48, locale: 'pt-BR', candidateKeys: keys, candidateKeysAbsent: true, conflictCount: 0 }, null, 2)}\n`);
const exportResult = spawnSync(process.execPath, [
  resolve(root, 'scripts/export_page_pdf.mjs'), '--page', '48', '--language', 'pt-BR', '--profile', 'visual',
  '--snapshot', snapshotPath, '--output', exportPdfPath, '--metrics-output', metricsPath,
  '--viewer-screenshot', viewerPath, '--print-screenshot', printPath,
  '--base-url', baseUrl, '--api-url', apiUrl,
], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error(`Official isolated p.48 export failed with exit ${exportResult.status}.`);

const output = {
  page: 48,
  proposedUnits: proposalUnits.length,
  existingUnitsReused: 3,
  additions: additions.length,
  uniqueKeys: keys.length,
  payloadConflicts: 0,
  preparedPatchIds: requiredPatchIds,
  snapshotPath,
  proposalPath,
  markdownPath,
  exportPdfPath,
  metricsPath,
  viewerPath,
  printPath,
  sourcePdfSha256: await hashFile(sourcePdfPath),
  canonicalSidecarSha256: await hashFile(sourceSidecarPath),
  exportedPdfSha256: await hashFile(exportPdfPath),
};
await immutableWrite(resolve(proofDir, 'prepare-receipt-v3.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
