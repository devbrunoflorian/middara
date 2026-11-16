#!/usr/bin/env node
/** Build an isolated, recoverable PT-BR proposal for p.25; preserve saved human records. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const page = 25;
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdf = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sourceDir = resolve(root, 'apps/web/public/pages/page_025');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v1');
const snapshotDir = join(proofDir, 'snapshot');
const proposalPath = resolve(root, 'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v1.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v1.md');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const mustNotExist = async path => {
  try { await access(path); throw new Error('Refusing to overwrite existing artifact: ' + path); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
};
for (const path of [join(proofDir, 'source-hashes-v1.json'), proposalPath, markdownPath]) await mustNotExist(path);

const dom = JSON.parse(await readFile(join(sourceDir, 'page_025_dom.json'), 'utf8'));
const pdfBytes = await readFile(sourcePdf);
const sourcePdfSha256 = sha256(pdfBytes);
const norm = value => String(value ?? '').replace(/[\u0000-\u001f\u007f\u00a0]+/gu, ' ').replace(/\s+/gu, ' ').trim();
const blockById = id => {
  const block = dom.blocks.find(item => item.id === id);
  assert.ok(block, 'Missing source block ' + id);
  return block;
};
const blockIndex = id => dom.blocks.indexOf(blockById(id));
const spanByRef = (block, ref) => {
  const split = ref.lastIndexOf(':');
  const lineId = ref.slice(0, split);
  const index = Number(ref.slice(split + 1));
  const line = block.lines.find(item => item.id === lineId);
  assert.ok(line && Number.isInteger(index) && line.spans[index], 'Missing span ref ' + ref);
  return line.spans[index];
};
const blockRefs = (block, predicate = () => true) => block.lines.flatMap(line =>
  line.spans.flatMap((span, index) => predicate(span, line, index)
    ? [line.id + ':' + String(span.sourceSpanIndex ?? index)] : []),
);
const sourceTextForBlock = block => norm(block.lines.flatMap(line => line.spans.map(span => span.text)).join(''));
const sourceBboxesForBlock = block => block.lines.map(line => line.bbox);
const sourceTextForRefs = (block, refs) => norm(refs.map(ref => spanByRef(block, ref).text).join(''));
const sourceBboxesForRefs = (block, refs) => refs.map(ref => spanByRef(block, ref).bbox);
const regular = (text, size = 10, color = '#ffffff') => ({ text, font: 'OptimaLTStd', size, color, weight: 400, style: 'normal', disableLigatures: true });
const bold = (text, size = 10, color = '#ffffff') => ({ text, font: 'OptimaLTStd-Bold', size, color, weight: 700, style: 'normal', disableLigatures: true });
const italic = (text, size = 10, color = '#ffffff') => ({ text, font: 'OptimaLTStd-Italic', size, color, weight: 400, style: 'italic', disableLigatures: true });
const parseMarkup = value => {
  const parts = [];
  const re = /\{\{b9:([^}]+)\}\}|\{\{b10:([^}]+)\}\}|\*\*\*([^*]+?)\*\*\*|\*\*([^*]+?)\*\*|\*([^*]+?)\*/gu;
  let cursor = 0;
  for (const match of value.matchAll(re)) {
    if (match.index > cursor) parts.push(regular(value.slice(cursor, match.index)));
    const text = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (match[1] !== undefined) parts.push(bold(text, 9));
    else if (match[2] !== undefined) parts.push(bold(text, 10));
    else {
      const style = match[3] !== undefined ? 'bolditalic' : match[4] !== undefined ? 'bold' : 'italic';
      parts.push({
        text,
        font: style.includes('italic') ? 'OptimaLTStd-Italic' : 'OptimaLTStd-Bold',
        size: 10, color: '#ffffff', weight: style === 'italic' ? 400 : 700,
        style: style.includes('italic') ? 'italic' : 'normal', disableLigatures: true,
      });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push(regular(value.slice(cursor)));
  return parts.filter(part => part.text.length > 0);
};
const dataFor = (segments, { textAlign = 'left', lineHeight = 1.1 } = {}) => ({
  schemaVersion: 2, segments, textAlign, lineHeight, lineHeightMode: 'source', managedSourceSymbols: [],
});
const candidates = [];
const addCandidate = ({ blockId, unitId = null, refs = null, markup, segments = null, pendingTerms = [], notes = [], textAlign = 'left', genericStyle = null }) => {
  const block = blockById(blockId);
  const idx = blockIndex(blockId);
  let sourceText, sourceBboxes, sourceLineCount, spanKey;
  if (unitId) {
    const unit = block.typographicSpanUnits.find(item => item.id === unitId);
    assert.ok(unit, 'Missing typographic span unit ' + unitId + ' in ' + blockId);
    refs = refs ?? unit.spanRefs;
    sourceText = sourceTextForRefs(block, refs);
    sourceBboxes = sourceBboxesForRefs(block, refs);
    sourceLineCount = new Set(refs.map(ref => ref.slice(0, ref.lastIndexOf(':')))).size;
    spanKey = 'page_' + page + '_unit_' + unitId + '__pt-BR';
  } else if (refs) {
    sourceText = sourceTextForRefs(block, refs);
    sourceBboxes = sourceBboxesForRefs(block, refs);
    sourceLineCount = new Set(refs.map(ref => ref.slice(0, ref.lastIndexOf(':')))).size;
    spanKey = 'page_' + page + '_unit_' + unitId + '__pt-BR';
  } else {
    sourceText = sourceTextForBlock(block);
    sourceBboxes = sourceBboxesForBlock(block);
    sourceLineCount = block.lines.length;
    spanKey = 'page_' + page + '_block_' + idx;
  }
  const plainText = markup.replace(/\{\{b(?:9|10):([^}]+)\}\}/gu, '$1').replace(/\*\*\*|\*\*/gu, '').replace(/\*/gu, '');
  const resolvedSegments = segments ?? (genericStyle ? [{ text: plainText, ...genericStyle }] : parseMarkup(markup));
  const proposalText = resolvedSegments.map(segment => segment.symbolId ? '' : String(segment.text ?? '')).join('');
  assert.equal(norm(proposalText), norm(plainText), 'Rich segment text mismatch for ' + spanKey);
  const data = dataFor(resolvedSegments, { textAlign });
  candidates.push({
    sourceBlockId: blockId, sourceUnitId: unitId, blockIndex: idx,
    sourceText, proposalText, proposalMarkup: markup, spanKey,
    legacyBlockSpanKey: 'page_' + page + '_block_' + idx + '__pt-BR',
    language: 'pt-BR', data, diagnosticData: structuredClone(data),
    status: 'draft_pending_live_copyfit_and_human_review',
    technicalStatus: 'pending_viewer_editor_and_pdf',
    editorialStatus: 'pending_human_review', diagnosticRendering: 'proposal',
    sourceLineCount, sourceBboxes, pendingTerms, notes, textAlign,
  });
};

const unit = (blockId, includes) => {
  const block = blockById(blockId);
  const found = block.typographicSpanUnits.find(item => item.id.includes(includes));
  assert.ok(found, 'Missing source unit ' + includes);
  return found.id;
};
const cardTitle = blockById('block_91').lines[0].spans[0];
addCandidate({
  blockId: 'block_91', markup: 'Componentes da Carta de Aventureiro',
  genericStyle: { text: 'Componentes da Carta de Aventureiro', font: cardTitle.font, size: cardTitle.size, color: cardTitle.color, weight: 400, style: 'normal', disableLigatures: true },
  pendingTerms: ['Adventurer Card → Carta de Aventureiro é o composto proposto para o título; confirmar com o glossário.'],
  textAlign: 'center',
});
const cardLabel = (blockId, text, pendingTerms = []) => {
  const span = blockById(blockId).lines[0].spans[0];
  addCandidate({
    blockId, markup: text,
    genericStyle: { text, font: span.font, size: span.size, color: span.color, weight: 700, style: 'normal', disableLigatures: true },
    pendingTerms,
  });
};
cardLabel('block_5', 'AVENTUREIRO', []);
cardLabel('block_6', 'S A Ú D E', ['Health → Saúde é uma proposta para o atributo; confirmar a terminologia de personagem.']);
cardLabel('block_12', 'M O V I M E N T O', ['Movement → Movimento é a forma usada para o atributo; harmonizar o nome da estatística.']);
cardLabel('block_20', 'D E F E S A', ['Defense → Defesa é uma proposta para o atributo; harmonizar o nome da estatística.']);
cardLabel('block_28', 'P R E S', ['Presence → Presença é dividida entre dois alvos de texto; revisar o mapeamento visual conjunto.']);
cardLabel('block_32', 'E N Ç A', ['Presence → Presença; este é o segundo fragmento do rótulo dividido.']);
cardLabel('block_36', 'A G I', ['Agility → Agilidade é dividida entre dois alvos de texto; revisar o mapeamento visual conjunto.']);
cardLabel('block_39', 'L I D A D E', ['Agility → Agilidade; este é o segundo fragmento do rótulo dividido e pode ampliar a área.']);
cardLabel('block_43', 'P E R C E P Ç Ã O', ['Perception → Percepção é uma proposta para o atributo; harmonizar o nome da estatística.']);
cardLabel('block_53', 'F O R Ç A', ['Strength → Força é uma proposta para o atributo; harmonizar o nome da estatística.']);
cardLabel('block_61', 'S A', ['Lore → Saber é uma adaptação curta para o atributo; confirmar a equivalência semântica.']);
cardLabel('block_63', 'B E R', ['Lore → Saber; este é o segundo fragmento do rótulo dividido.']);

const ability = blockById('block_69');
const abilityUnit = includes => unit('block_69', includes);
const abilityTitleId = abilityUnit('font-size-9.62pt-unit-00');
const abilityEncounterId = abilityUnit('font-size-6.3pt-unit-01');
const abilityDescriptionId = abilityUnit('font-size-8.18pt-unit-02');
const abilityEffectPrefixId = abilityUnit('font-size-7.7pt-unit-03');
const abilityEffectSecondId = abilityUnit('font-size-7.7pt-unit-05');
addCandidate({
  blockId: 'block_69', unitId: abilityTitleId, markup: 'Ambiciosa',
  segments: [{ text: 'Ambiciosa', font: 'Cinzel-Regular', size: 9.6212, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true }],
  pendingTerms: ['Ambitious é o nome de uma Habilidade; confirmar a tradução do rótulo como Ambiciosa.'],
});
addCandidate({
  blockId: 'block_69', unitId: abilityEncounterId, markup: 'POR ENCONTRO',
  segments: [{ text: 'POR ENCONTRO', font: 'OptimaLTStd-DemiBold', size: 6.2953, color: '#ffffff', weight: 700, style: 'normal', disableLigatures: true }],
  pendingTerms: ['PER ENCOUNTER → POR ENCONTRO é proposta de rótulo mecânico; confirmar Encounter.'],
});
addCandidate({
  blockId: 'block_69', unitId: abilityDescriptionId,
  markup: 'A personalidade imponente de Nightingale faz dela uma líder natural.',
  segments: [{ text: 'A personalidade imponente de Nightingale faz dela uma líder natural.', font: 'AGaramondPro-Italic', size: 8.178, color: '#231f20', weight: 400, style: 'italic', disableLigatures: true }],
  pendingTerms: ['Commanding personality → personalidade imponente; conferir nuance editorial.'],
});
addCandidate({
  blockId: 'block_69', unitId: abilityEffectPrefixId, markup: 'Demais aliados: ',
  segments: [{ text: 'Demais aliados: ', font: 'OptimaLTStd', size: 7.697, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true }],
  pendingTerms: ['Gain → ganham; a frase foi reestruturada para manter o efeito completo e caber antes de +1 SP.'],
});
addCandidate({
  blockId: 'block_69', unitId: abilityEffectSecondId, markup: '. Nightingale ganha ',
  segments: [
    { text: '. ', font: 'OptimaLTStd', size: 7.697, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    { text: 'Nightingale', font: 'OptimaLTStd-Italic', size: 7.697, color: '#231f20', weight: 400, style: 'italic', disableLigatures: true },
    { text: ' ganha ', font: 'OptimaLTStd', size: 7.697, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
  ],
  pendingTerms: ['Gains → ganha é proposta de ação mecânica; confirmar capitalização de ganhos.'],
});

addCandidate({
  blockId: 'block_70', markup: 'CONVICÇÃO:\nCONJURAÇÃO:',
  genericStyle: { text: 'CONVICÇÃO:\nCONJURAÇÃO:', font: 'Cinzel-Regular', size: 9.6212, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
  pendingTerms: ['Conviction → Convicção segue o glossário; Casting → Conjuração é proposta contextual.'],
});

const bodyUnit = (blockId, contains) => unit(blockId, contains);
addCandidate({
  blockId: 'block_83', unitId: bodyUnit('block_83', 'font-size-10pt-unit-01'),
  markup: 'A Habilidade Especial a que este Aventureiro tem acesso.',
  pendingTerms: ['Special Ability → Habilidade Especial é forma local para revisão de caixa e capitalização.'],
});

const addMergedUnit = (blockId, newUnitId, excludeLineZero = false) => {
  const block = blockById(blockId);
  const refs = blockRefs(block, (span, line) => (!excludeLineZero || line.id !== block.lines[0].id) && span.text !== '');
  const retained = excludeLineZero
    ? block.typographicSpanUnits.filter(item => item.spanRefs.every(ref => ref.slice(0, ref.lastIndexOf(':')) === block.lines[0].id))
    : [];
  block.typographicSpanUnits = [...retained, { id: newUnitId, spanRefs: refs }];
  return refs;
};
const diceBodyId = 'p25-block-84-localized-body-v1';
const diceBodyRefs = addMergedUnit('block_84', diceBodyId, true);
addCandidate({
  blockId: 'block_84', unitId: diceBodyId, refs: diceBodyRefs,
  markup: 'Os dados base do Aventureiro são usados em Testes de Convicção e para conjurar {{b9:FEITIÇO}}. Durante a partida, os Aventureiros recebem Itens e Habilidades que aprimoram esses dados.',
  pendingTerms: ['Base Dice → dados base; Conviction Checks → Testes de Convicção são formas propostas. Spell → Feitiço segue o glossário; revisar caixa alta de FEITIÇO e Gain/receive.'],
});
const diceHeadId = unit('block_84', 'font-size-9pt-unit-00');
addCandidate({
  blockId: 'block_84', unitId: diceHeadId, markup: 'DADOS BASE:',
  segments: [bold('DADOS BASE:', 9)],
  pendingTerms: ['BASE DICE → DADOS BASE é proposta de rótulo; confirmar a nomenclatura.'],
});

addCandidate({
  blockId: 'block_85', unitId: bodyUnit('block_85', 'font-size-10pt-unit-01'),
  markup: 'Estas 5 Perícias são usadas em Testes de Habilidade quando houver instrução das Mecânicas da Aventura ou das Regras Especiais de Encontro, como ao desviar de armadilhas ou convencer um guarda a deixá-lo passar.',
  pendingTerms: ['Adventure Mechanics → Mecânicas da Aventura e Special Encounter Rules → Regras Especiais de Encontro seguem o glossário; harmonizar Perícias/Perícia e maiúsculas.'],
});

const legendId = 'p25-block-86-localized-legend-v1';
const legendRefs = addMergedUnit('block_86', legendId, false);
addCandidate({
  blockId: 'block_86', unitId: legendId, refs: legendRefs,
  markup: '{{b9:D}}: Presença; {{b9:E}}: Saber; {{b9:F}}: Agilidade; {{b9:G}}: Percepção; {{b9:H}}: Força.',
  pendingTerms: ['Lore → Saber é adaptação curta; Presença, Agilidade, Percepção e Força não constam do glossário; harmonizar os cinco atributos.'],
});

const healthHead = unit('block_87', 'font-size-9pt-unit-00');
addCandidate({
  blockId: 'block_87', unitId: healthHead, markup: 'SAÚDE (HP):',
  segments: [bold('SAÚDE (HP):', 9)],
  pendingTerms: ['Health → Saúde é proposta de nome para o atributo; HP fica como sigla original.'],
});
const healthBodyId = 'p25-block-87-localized-body-v1';
const healthBodyRefs = addMergedUnit('block_87', healthBodyId, true);
addCandidate({
  blockId: 'block_87', unitId: healthBodyId, refs: healthBodyRefs,
  markup: 'Este é o {{b9:HP}} máximo base do Aventureiro. Fichas de Dano são adicionadas à carta do Aventureiro; quando o Dano atinge seu {{b9:HP}} máximo, ele é Derrotado.',
  pendingTerms: ['Damage token → Ficha de Dano, Maximum HP → HP máximo e Defeated → Derrotado são formas locais; revisar precisão das condições de derrota.'],
});
const defenseHead = unit('block_88', 'font-size-9pt-unit-00');
addCandidate({
  blockId: 'block_88', unitId: defenseHead, markup: 'DEFESA:',
  segments: [bold('DEFESA:', 9)],
  pendingTerms: ['Defense → Defesa é proposta para o atributo e heading.'],
});
const defenseBodyId = 'p25-block-88-localized-body-v1';
const defenseBodyRefs = addMergedUnit('block_88', defenseBodyId, true);
addCandidate({
  blockId: 'block_88', unitId: defenseBodyId, refs: defenseBodyRefs,
  markup: 'Este é o Valor de Defesa base do Aventureiro e determina o quão difícil é acertá-lo.',
  pendingTerms: ['Defense Value → Valor de Defesa é proposta local; conferir uso em regras.'],
});
const moveHead = unit('block_89', 'font-size-9pt-unit-00');
addCandidate({
  blockId: 'block_89', unitId: moveHead, markup: 'MOVIMENTO:',
  segments: [bold('MOVIMENTO:', 9)],
  pendingTerms: ['Movement → Movimento é proposta para o atributo e heading.'],
});
const moveBodyId = 'p25-block-89-localized-body-v1';
const moveBodyRefs = addMergedUnit('block_89', moveBodyId, true);
addCandidate({
  blockId: 'block_89', unitId: moveBodyId, refs: moveBodyRefs,
  markup: 'Este é o Valor de Movimento base do Aventureiro e determina quantos espaços ele pode mover ao realizar uma Ação de Movimento.',
  pendingTerms: ['Movement Value → Valor de Movimento e Move Action → Ação de Movimento são formas locais; revisar a terminologia mecânica.'],
});

const pageDomForSnapshot = structuredClone(dom);
for (const block of pageDomForSnapshot.blocks) {
  const sourceBlock = dom.blocks.find(item => item.id === block.id);
  if (['block_84', 'block_86', 'block_87', 'block_88', 'block_89'].includes(block.id)) {
    block.typographicSpanUnits = structuredClone(sourceBlock.typographicSpanUnits);
  }
}
const snapshotTranslationsUrl = new URL('/api/translations', apiUrl);
snapshotTranslationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
snapshotTranslationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(snapshotTranslationsUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(translationsResponse.ok, 'Payload translation GET failed: ' + translationsResponse.status);
const translationsPayload = await translationsResponse.json();
const existingPageRecords = (translationsPayload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_25_'));
assert.equal(existingPageRecords.length, 4, 'Saved p.25 translation baseline changed; stop before proposal creation.');
assert.deepEqual(existingPageRecords.map(record => Number(record.id)).sort((a, b) => a - b), [320, 321, 322, 323]);
assert.ok(!candidates.some(candidate => existingPageRecords.some(record => record.spanKey === candidate.spanKey)));
const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[pageNumber][equals]', String(page));
framesUrl.searchParams.set('limit', '500');
const framesResponse = await fetch(framesUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(framesResponse.ok, 'Payload layout-frame GET failed: ' + framesResponse.status);
const framesPayload = await framesResponse.json();
const existingPageLayoutFrames = (framesPayload.docs ?? []).filter(record => Number(record.pageNumber) === page);
assert.equal(existingPageLayoutFrames.length, 0, 'Unexpected saved p.25 frames; stop and inspect before proceeding.');
const block70Index = blockIndex('block_70');
const diagnosticFrames = [{
  frameKey: 'page_25_block_' + block70Index + '::pt-BR',
  unitKey: 'page_25_block_' + block70Index,
  pageNumber: page, language: 'pt-BR',
  data: { x: 214, y: 315.2414, width: 64, height: 27.5, rotation: 0, textAlign: 'left' },
}];

const proposal = {
  schemaVersion: 1,
  proposalId: 'page-025-adventurer-card-2026-10-16-v1',
  page, locale: 'pt-BR', title: 'Componentes da Carta de Aventureiro', sourcePdf,
  sourcePdfSha256,
  canonicalDomSha256: sha256(await readFile(join(sourceDir, 'page_025_dom.json'))),
  canonicalLayoutFramesSha256: sha256(await readFile(join(sourceDir, 'layout_frames.json'))),
  backgroundSha256: sha256(await readFile(join(sourceDir, 'background.webp'))),
  status: 'draft_pending_viewer_editor_pdf_copyfit_and_human_review',
  counts: { candidates: candidates.length, verifiedInViewer: 0, verifiedInEditor: 0, verifiedInPdf: 0, preservedHumanRecords: existingPageRecords.length },
  sourceReview: {
    status: 'official_pdf_and_english_viewer_visual_reviewed_2026-10-16',
    sourceRaster: 'output/proofs/translation-readiness-2026-10-16/p025-source-review-v1/source-en-page-025.png',
    englishViewer: 'output/proofs/translation-readiness-2026-10-16/p025-source-review-v1/en-viewer-v1.png',
    englishPdf: 'output/proofs/translation-readiness-2026-10-16/p025-source-review-v1/page-025-en-source-v1.pdf',
    fidelityNote: 'The official PDF raster and current English Viewer/one-page export were compared full-page. The card illustration, stat symbols, callout markers, 37 text blocks, ten image regions and folio are present. Character name, values and callout letters are preserved; editable labels and explanatory prose are proposed.',
  },
  preservedHumanRecords: existingPageRecords.map(record => ({
    id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt,
    text: (record.data?.segments ?? []).map(segment => segment.text ?? '').join(''),
    disposition: 'preserved_as_saved_human_translation; no candidate replaces this key',
  })),
  candidates,
  diagnosticLayoutFrames: {
    status: 'snapshot_only',
    preservedHumanFrames: existingPageLayoutFrames.length,
    frames: diagnosticFrames,
    reason: 'Move the two-line Conviction/Casting label left within the card panel so the longer Portuguese label clears the source dice artwork. This frame is restricted to the immutable diagnostic snapshot.',
  },
  artworkExceptions: [],
  unchangedSourceContent: [
    { sourceBlockId: 'block_27', sourceText: '6 7 12', reason: 'Numerical character-card values are language-independent.' },
    { sourceBlockId: 'block_65', sourceText: '6 3 5 2 2', reason: 'Numerical character-card values are language-independent.' },
    { sourceBlockId: 'block_71', sourceText: 'Nightingale Arsen', reason: 'Character proper name retained.' },
    { sourceBlockId: 'block_72 and callout blocks', sourceText: 'A–K', reason: 'Callout labels identify diagram locations and remain stable references.' },
  ],
  payload: { readOnlyMethod: 'GET', existingPageRecords: existingPageRecords.length, existingPageLayoutFrames: existingPageLayoutFrames.length, writes: 0 },
  diagnosticFailurePolicy: 'If a candidate fails copyfit or semantic rendering, blank only that candidate in the diagnostic snapshot; retain the complete source and proposal text in this file.',
};

const snapshot = {
  translations: [
    ...existingPageRecords,
    ...candidates.map(candidate => ({
      spanKey: candidate.spanKey.endsWith('__pt-BR') ? candidate.spanKey : candidate.spanKey + '__pt-BR',
      language: 'pt-BR', data: candidate.diagnosticData,
    })),
  ],
  layoutFrames: diagnosticFrames, symbolAliasSettings: [], assetPages: [page],
  page, patched: false, verifyRenderedSnapshot: true,
  sourcePageBoxes: { [page]: {
    mediaBox: [0, 0, dom.width, dom.height], cropBox: [0, 0, dom.width, dom.height],
    bleedBox: [0, 0, dom.width, dom.height],
    trimBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173],
    artBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173],
  } },
};
await mkdir(join(snapshotDir, 'pages'), { recursive: true });
const snapshotPageDir = join(snapshotDir, 'pages/page_025');
await cp(sourceDir, snapshotPageDir, { recursive: true, errorOnExist: true });
await writeFile(join(snapshotPageDir, 'page_025_dom.json'), JSON.stringify(pageDomForSnapshot, null, 2) + '\n', { flag: 'w' });
await writeFile(join(snapshotDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
const assetNames = ['page_025_dom.json', 'background.webp', 'layout_frames.json'];
const sourceHashes = {};
for (const name of assetNames) sourceHashes[name] = sha256(await readFile(join(sourceDir, name)));
sourceHashes.sourcePdfSha256 = sourcePdfSha256;
sourceHashes.snapshotSha256 = sha256(await readFile(join(snapshotDir, 'snapshot.json')));
sourceHashes.snapshotDomSha256 = sha256(await readFile(join(snapshotPageDir, 'page_025_dom.json')));
sourceHashes.payloadRecordsBefore = existingPageRecords.length;
sourceHashes.payloadLayoutFramesBefore = existingPageLayoutFrames.length;
sourceHashes.payloadWrites = 0;
await writeFile(join(proofDir, 'source-hashes-v1.json'), JSON.stringify(sourceHashes, null, 2) + '\n', { flag: 'wx' });
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' });
const markdown = '# p.25 — proposta PT-BR “Componentes da Carta de Aventureiro” v1\n\n' +
  '**Estado:** ' + candidates.length + ' unidades editáveis em snapshot isolado; Viewer, Editor, PDF e copyfit pendentes. A página EN foi comparada visualmente com o PDF oficial. Quatro traduções humanas salvas foram preservadas. Nenhuma alteração foi gravada no Payload ou nos arquivos canônicos.\n\n' +
  '## Unidades propostas\n\n' +
  candidates.map(candidate => '### ' + candidate.sourceBlockId + (candidate.sourceUnitId ? ' / ' + candidate.sourceUnitId : '') + '\n\n**EN:** ' + candidate.sourceText + '\n\n**PT-BR:** ' + candidate.proposalText + '\n\n**Revisão pendente:** ' + (candidate.pendingTerms.length ? candidate.pendingTerms.join(' ') : 'Nenhum termo adicional identificado.')).join('\n\n') +
  '\n\n## Registros humanos preservados\n\n' +
  proposal.preservedHumanRecords.map(record => '- **' + record.spanKey + '** (ID ' + record.id + '): ' + record.disposition + '. Texto salvo: “' + record.text + '”').join('\n') +
  '\n\n## Conteúdo preservado\n\n' +
  proposal.unchangedSourceContent.map(item => '- **' + item.sourceBlockId + ':** ' + item.sourceText + ' — ' + item.reason).join('\n') +
  '\n\n## Fonte e persistência\n\n' +
  '- PDF oficial SHA-256: ' + sourcePdfSha256 + '.\n' +
  '- Viewer EN, PDF EN isolado e raster oficial foram comparados visualmente; veja ' + proposal.sourceReview.sourceRaster + '.\n' +
  '- Snapshot isolado: ' + snapshotDir + '; frames temporários apenas para o bloco de Convicção/Conjuração.\n' +
  '- p.25: ' + existingPageRecords.length + ' registros PT-BR salvos preservados; nenhuma gravação no Payload.\n';
await writeFile(markdownPath, markdown, { flag: 'wx' });
console.log(JSON.stringify({
  proposalId: proposal.proposalId, candidates: candidates.length,
  spanKeys: candidates.map(candidate => candidate.spanKey),
  preservedPayloadRecords: existingPageRecords.map(record => ({ id: record.id, spanKey: record.spanKey })),
  payloadWrites: 0, sourcePdfSha256, snapshotSha256: sourceHashes.snapshotSha256,
  proposalPath, markdownPath, snapshotPath: join(snapshotDir, 'snapshot.json'),
}, null, 2));

