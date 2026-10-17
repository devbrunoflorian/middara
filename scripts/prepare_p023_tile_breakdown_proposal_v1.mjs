#!/usr/bin/env node
/** Prepare an isolated, recoverable PT-BR proposal for page 23. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const page = 23;
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const pdfPath = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sourceDir = resolve(root, 'apps/web/public/pages/page_023');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v1');
const snapshotDir = join(proofDir, 'snapshot');
const proposalPath = resolve(root, 'docs/translations/proposals/page-023-tile-breakdown-2026-10-16-v1.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-023-tile-breakdown-2026-10-16-v1.md');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const mustNotExist = async path => {
  try { await access(path); throw new Error(`Refusing to overwrite existing artifact: ${path}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
};
for (const path of [join(proofDir, 'source-hashes-v1.json'), proposalPath, markdownPath]) await mustNotExist(path);

const dom = JSON.parse(await readFile(join(sourceDir, 'page_023_dom.json'), 'utf8'));
const sourcePdf = await readFile(pdfPath);
const blockById = id => {
  const block = dom.blocks.find(item => item.id === id);
  assert.ok(block, `Missing source block ${id}`);
  return block;
};
const lineById = (block, id) => {
  const line = block.lines.find(item => item.id === id);
  assert.ok(line, `Missing source line ${id}`);
  return line;
};
const regular = (text, size = 10) => ({ text, font: 'OptimaLTStd', size, color: '#ffffff', weight: 400, style: 'normal', disableLigatures: true });
const bold = (text, size = 10) => ({ text, font: 'OptimaLTStd-Bold', size, color: '#ffffff', weight: 700, style: 'normal', disableLigatures: true });
const titleStyle = text => ({ text, font: 'Cinzel-Regular', size: 18, color: '#ffffff', weight: 700, style: 'normal', disableLigatures: true });
const dataFor = (segments, textAlign = 'left', lineHeight = 1.1) => ({
  schemaVersion: 2, segments, textAlign, lineHeight, lineHeightMode: 'source', managedSourceSymbols: [],
});
const plain = segments => segments.map(segment => segment.text).join('');
const sourceTextForUnit = (block, unit) => unit.field.lineIds
  .flatMap(id => lineById(block, id).spans.map(span => span.text))
  .join('').replace(/\s+/gu, ' ').trim();
const sourceLinesForUnit = (block, unit) => unit.field.lineIds.map(id => lineById(block, id).bbox);
const candidates = [];
const add = ({ blockId, unitId = null, spanKey, legacyBlockSpanKey, sourceText, proposalText, segments, sourceBboxes, sourceLineCount, pendingTerms = [], notes = [], textAlign = 'left' }) => {
  assert.equal(plain(segments), proposalText, `Rich segments do not match target for ${spanKey}`);
  const sourceBlock = blockById(blockId);
  const data = dataFor(segments, textAlign);
  candidates.push({
    sourceBlockId: blockId, sourceUnitId: unitId, blockIndex: dom.blocks.indexOf(sourceBlock),
    sourceText, proposalText, proposalMarkup: proposalText, spanKey, legacyBlockSpanKey,
    language: 'pt-BR', data, diagnosticData: structuredClone(data),
    status: 'draft_pending_live_copyfit_and_human_review',
    technicalStatus: 'pending_viewer_editor_and_pdf', editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal', sourceLineCount, sourceBboxes, pendingTerms, notes,
  });
};
const addSourceUnit = ({ blockId, unitId, proposalText, segments, pendingTerms = [], notes = [] }) => {
  const block = blockById(blockId);
  const unit = block.typographicUnits?.find(item => item.id === unitId);
  assert.ok(unit, `Missing typographic unit ${unitId}`);
  add({
    blockId, unitId, spanKey: `page_23_unit_${unitId}__pt-BR`,
    legacyBlockSpanKey: `page_23_block_${dom.blocks.indexOf(block)}__pt-BR`,
    sourceText: sourceTextForUnit(block, unit), proposalText, segments,
    sourceBboxes: sourceLinesForUnit(block, unit), sourceLineCount: unit.field.lineIds.length,
    pendingTerms, notes,
  });
};

const titleBlock = blockById('block_24');
const titleText = 'Detalhamento da Peça';
add({
  blockId: 'block_24', spanKey: `page_23_block_${dom.blocks.indexOf(titleBlock)}__pt-BR`,
  legacyBlockSpanKey: `page_23_block_${dom.blocks.indexOf(titleBlock)}__pt-BR`,
  sourceText: titleBlock.lines.flatMap(line => line.spans.map(span => span.text)).join('').replace(/\s+/gu, ' ').trim(),
  proposalText: titleText, segments: [titleStyle(titleText)], sourceBboxes: titleBlock.lines.map(line => line.bbox), sourceLineCount: 1,
  pendingTerms: ['Tile Breakdown → Detalhamento da Peça: título proposto, sujeito à revisão editorial humana.'],
});

const unitIds = {
  'block_9': ['p23-block-9-first-size-9pt', 'p23-block-9-remaining-size-10pt'],
  'block_10': ['p23-block-10-first-size-9pt', 'p23-block-10-remaining-size-10pt'],
  'block_11': ['p23-block-11-first-size-9pt', 'p23-block-11-remaining-size-10pt'],
  'block_12': ['p23-block-12-first-size-9pt', 'p23-block-12-remaining-size-10pt'],
};
const existingUnitProposals = {
  'p23-block-9-first-size-9pt': { text: 'PEÇA', segments: [bold('PEÇA', 9)] },
  'p23-block-9-remaining-size-10pt': {
    text: 'Uma Peça é um componente grande e individual do tabuleiro, que se combina a outras Peças para formar o tabuleiro de um Encontro.',
    segments: [regular('Uma '), bold('Peça'), regular(' é um componente grande e individual do tabuleiro, que se combina a outras Peças para formar o tabuleiro de um Encontro.')],
  },
  'p23-block-10-first-size-9pt': { text: 'ESPAÇOS', segments: [bold('ESPAÇOS', 9)] },
  'p23-block-10-remaining-size-10pt': {
    text: 'Cada quadrado da Peça é um espaço. Os espaços são usados para movimento, Alcance e para determinar efeitos de área.',
    segments: [regular('Cada quadrado da '), bold('Peça'), regular(' é um espaço. Os espaços são usados para movimento, Alcance e para determinar efeitos de área.')],
    pendingTerms: ['Range → Alcance é uma proposta contextual ainda pendente de decisão humana; conferir com os usos já registrados.'],
  },
  'p23-block-11-first-size-9pt': { text: 'BORDA', segments: [bold('BORDA', 9)] },
  'p23-block-11-remaining-size-10pt': {
    text: 'A borda de cada Peça bloqueia a Linha de Visão e impede a passagem, salvo se estiver conectada a outra Peça.',
    segments: [regular('A borda de cada '), bold('Peça'), regular(' bloqueia a Linha de Visão e impede a passagem, salvo se estiver conectada a outra '), bold('Peça'), regular('.')],
    pendingTerms: ['Line of Sight → Linha de Visão é uma proposta contextual ainda pendente de decisão humana.'],
  },
  'p23-block-12-first-size-9pt': { text: 'TERRENOS', segments: [bold('TERRENOS', 9)] },
  'p23-block-12-remaining-size-10pt': {
    text: 'Alguns espaços têm efeitos de área especiais chamados Terrenos (consulte “Tipos de Terreno”, p. 21). Os espaços com Terreno exibem uma borda colorida e hachurada ao redor do quadrado e um pequeno símbolo que indica o tipo de Terreno.',
    segments: [
      regular('Alguns espaços têm efeitos de área especiais chamados '), bold('Terrenos'),
      regular(' (consulte “Tipos de Terreno”, p. 21). Os espaços com '), bold('Terreno'),
      regular(' exibem uma borda colorida e hachurada ao redor do quadrado e um pequeno símbolo que indica o tipo de '),
      bold('Terreno'), regular('.'),
    ],
    pendingTerms: ['Terrain → Terrenos segue o glossário; revisar o singular “Terreno” no contexto da frase e o título citado “Tipos de Terreno”.'],
  },
};
for (const [blockId, ids] of Object.entries(unitIds)) {
  for (const unitId of ids) {
    const proposal = existingUnitProposals[unitId];
    addSourceUnit({
      blockId, unitId, proposalText: proposal.text, segments: proposal.segments,
      pendingTerms: proposal.pendingTerms ?? [],
    });
  }
}

// This sentence is split across overlapping size-specific fields around the
// invariant code UM1. The snapshot joins the sentence into one rich field while
// retaining the canonical block and every source unit in the untouched source.
const numberBlock = blockById('block_13');
const originalNumberUnitIds = (numberBlock.typographicUnits ?? []).concat(numberBlock.typographicSpanUnits ?? []).map(unit => unit.id);
const numberUnitId = 'p23-block-13-combined-tile-number';
delete numberBlock.typographicSpanUnits;
numberBlock.typographicUnits = [{
  id: numberUnitId, kind: 'paragraph', label: 'Número da Peça',
  field: {
    id: `${numberUnitId}-field`, lineIds: numberBlock.lines.map(line => line.id),
    bbox: numberBlock.bbox,
    frame: { x: numberBlock.bbox[0], width: 285.87088, textAlign: 'left', lineHeight: 1.1 },
  },
}];
const numberSegments = [
  bold('NÚMERO DA PEÇA\n', 9),
  regular('Cada '), bold('Peça'),
  regular(' é identificada por um código de duas letras seguido de um número, que indica o jogo ou a expansão de origem e ajuda na preparação dos Encontros. Por exemplo, o código '),
  bold('UM1', 9), regular(' identifica a '), bold('Peça'), regular(' 1 de Unintentional Malum.'),
];
const numberText = plain(numberSegments);
add({
  blockId: 'block_13', unitId: numberUnitId,
  spanKey: `page_23_unit_${numberUnitId}__pt-BR`,
  legacyBlockSpanKey: `page_23_block_${dom.blocks.indexOf(numberBlock)}__pt-BR`,
  sourceText: numberBlock.lines.flatMap(line => line.spans.map(span => span.text)).join('').replace(/\s+/gu, ' ').trim(),
  proposalText: numberText, segments: numberSegments,
  sourceBboxes: numberBlock.lines.map(line => line.bbox), sourceLineCount: numberBlock.lines.length,
  pendingTerms: ['Unintentional Malum é preservado como nome próprio conforme uso humano já documentado; confirmar a composição completa na revisão editorial.'],
  notes: [`Composition exists only in the diagnostic snapshot. The four canonical source units (${originalNumberUnitIds.join(', ')}) and the block ID remain unchanged.`],
});

// Split the grouped diagram legend into one snapshot-only field per label.
// Each field is centered on the corresponding source label's measured center.
const legendLabels = {
  'block_18': ['NORMAL', 'DIFÍCIL'],
  'block_19': ['PERIGOSO', 'ESPECIAL'],
  'block_20': ['ÁGUA', 'LODO'],
  'block_21': ['OBSTRUÍDO'],
};
const legendPending = {
  NORMAL: [],
  DIFÍCIL: ['Hindering Terrain → Terreno Difícil segue o glossário; “Difícil” é uma forma abreviada proposta para o rótulo da legenda.'],
  PERIGOSO: ['Dangerous como rótulo abreviado: candidato sujeito à revisão humana.'],
  ESPECIAL: ['Special como rótulo abreviado: candidato sujeito à revisão humana.'],
  ÁGUA: ['Water Terrain → Terreno de Água segue o glossário; “Água” é uma forma abreviada proposta para o rótulo.'],
  LODO: ['Muck Terrain → Terreno de Lodo segue o glossário; “Lodo” é uma forma abreviada proposta para o rótulo.'],
  OBSTRUÍDO: ['Obstructing Terrain → Terreno Obstruído segue o glossário; “Obstruído” é uma forma abreviada proposta para o rótulo.'],
};
const legendUnitIds = [];
for (const [blockId, labels] of Object.entries(legendLabels)) {
  const block = blockById(blockId);
  block.typographicUnits = [];
  block.lines.forEach((line, index) => {
    const sourceSpan = line.spans.find(span => span.text.trim());
    assert.ok(sourceSpan, `Missing source label span ${line.id}`);
    const id = `p23-${blockId}-legend-${index + 1}`;
    const frameWidth = 96;
    const center = (sourceSpan.bbox[0] + sourceSpan.bbox[2]) / 2;
    const field = {
      id: `${id}-field`, lineIds: [line.id], bbox: line.bbox,
      frame: { x: center - frameWidth / 2, width: frameWidth, textAlign: 'center', lineHeight: 1 },
    };
    block.typographicUnits.push({ id, kind: 'diagram-label', label: labels[index], fixedPosition: true, field });
    legendUnitIds.push(id);
    const legacyKey = `page_23_block_${dom.blocks.indexOf(block)}__pt-BR`;
    add({
      blockId, unitId: id, spanKey: `page_23_unit_${id}__pt-BR`, legacyBlockSpanKey: legacyKey,
      sourceText: sourceSpan.text.trim(), proposalText: labels[index], segments: [bold(labels[index], 9)],
      sourceBboxes: [line.bbox], sourceLineCount: 1, pendingTerms: legendPending[labels[index]], textAlign: 'center',
      notes: ['Independent centered text fields exist only in the isolated PT snapshot so neighboring graphic labels keep their own boxes; the canonical source block and legacy key are unchanged.'],
    });
  });
}

const response = await fetch(new URL('/api/translations', apiUrl), { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(response.ok, `Payload GET failed: ${response.status}`);
const allRecords = (await response.json()).docs ?? [];
const existingPageRecords = allRecords.filter(record => String(record.spanKey ?? '').startsWith('page_23_') && record.language === 'pt-BR');
assert.equal(existingPageRecords.length, 0, 'Existing p.23 human translations were found; preserve and reconcile before preparing the snapshot.');

const sourcePdfSha256 = sha256(sourcePdf);
const proposal = {
  proposalId: 'page-023-tile-breakdown-2026-10-16-v1',
  status: 'full_editable_text_proposal_v1_copyfit_pending_1_artwork_localization_exception_open',
  page, sourcePdf: 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf', sourcePdfSha256,
  sourceReview: {
    status: 'official_pdf_checked_against_sidecar',
    visibleTextUnits: candidates.length,
    evidence: 'The official PDF page 23 raster was compared with the page sidecar: the title, five explanatory sections, seven diagram labels, A–E callouts, page folio, and tile code UM1 match the source. ELEVATION 2/1 remains part of a non-editable diagram image.',
    pageRaster: 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-v1/source-en-page-023.png',
  },
  counts: {
    editableTargets: candidates.length, proposedTargets: candidates.length,
    verifiedInViewer: 0, verifiedInEditor: 0, verifiedInPdf: 0,
    languageInvariantCallouts: ['A', 'B', 'C', 'D', 'E', 'UM1', 'folio 23'],
    snapshotOnlyCompositionChanges: ['block_13 combined into one rich text field', ...Object.keys(legendLabels).map(id => `${id} diagram labels split into centered fields`)],
  },
  candidates,
  artworkExceptionGroups: [{
    id: 'page_23_elevation_labels_artwork_text_pt-BR',
    sourceBlockIds: [], sourceImageBbox: [529.8400268554688, 718.386962890625, 628.1150512695312, 760.6270141601562],
    sourceText: 'ELEVATION 2 / ELEVATION 1',
    proposedText: 'ELEVAÇÃO 2 / ELEVAÇÃO 1',
    category: 'artwork_text_localization', status: 'open_human_review',
    reason: 'The elevation labels are embedded in the diagram image rather than represented by editable text. Keep the source image intact until a localized replacement is validated in context.',
    evidence: ['apps/web/public/pages/page_023/background.webp', 'output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-v1/source-en-page-023.png'],
  }],
  payloadRecordsBefore: existingPageRecords.length, payloadWrites: 0, humanApproved: false,
  sourceScope: {
    canonicalInputsModified: false, translationRecordKeysPreserved: true,
    pageBlockIds: [...new Set(candidates.map(candidate => candidate.sourceBlockId))],
    compatibilityNote: 'No saved PT-BR p.23 records existed. Original block IDs and legacy block keys remain unchanged in canonical data. New typographic units are isolated to the diagnostic snapshot and each proposal records its legacy parent key.',
  },
  copyfit: {
    engine: 'Existing PageRenderer with Copyfit V3 source typography and frames',
    status: 'pending_viewer_editor_pdf_and_full_page_visual_review',
    diagnosticFailurePolicy: 'If a proposed unit fails live copyfit or composition, blank only that unit in the diagnostic snapshot; preserve the full translation and source data in this proposal.',
  },
};
const snapshot = {
  translations: [...existingPageRecords, ...candidates.map(candidate => ({ spanKey: candidate.spanKey, language: 'pt-BR', data: candidate.diagnosticData }))],
  layoutFrames: [], symbolAliasSettings: [], assetPages: [page], page, patched: false, verifyRenderedSnapshot: true,
  sourcePageBoxes: { [page]: {
    mediaBox: [0, 0, dom.width, dom.height], cropBox: [0, 0, dom.width, dom.height],
    bleedBox: [0, 0, dom.width, dom.height], trimBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173],
    artBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173],
  } },
};
const savedSnapshotPath = join(snapshotDir, 'snapshot.json');
const savedPageDir = join(snapshotDir, 'pages/page_023');
let reuseExistingSnapshot = false;
try {
  assert.deepEqual(JSON.parse(await readFile(savedSnapshotPath, 'utf8')), snapshot, 'Existing partial snapshot differs from the current proposal.');
  assert.deepEqual(JSON.parse(await readFile(join(savedPageDir, 'page_023_dom.json'), 'utf8')), dom, 'Existing diagnostic DOM differs from the current proposal.');
  for (const name of ['background.webp', 'layout_frames.json']) {
    assert.equal(sha256(await readFile(join(savedPageDir, name))), sha256(await readFile(join(sourceDir, name))), `Snapshot source asset changed: ${name}`);
  }
  reuseExistingSnapshot = true;
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
if (!reuseExistingSnapshot) {
  await mkdir(join(snapshotDir, 'pages'), { recursive: true });
  await cp(sourceDir, savedPageDir, { recursive: true, errorOnExist: true });
  await writeFile(join(savedPageDir, 'page_023_dom.json'), `${JSON.stringify(dom, null, 2)}\n`, { flag: 'w' });
  await writeFile(savedSnapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
}
const sourceHashes = {};
for (const name of ['page_023_dom.json', 'background.webp', 'layout_frames.json']) {
  sourceHashes[name] = sha256(await readFile(join(sourceDir, name)));
}
sourceHashes.sourcePdfSha256 = sourcePdfSha256;
sourceHashes.snapshotSha256 = sha256(await readFile(join(snapshotDir, 'snapshot.json')));
sourceHashes.payloadRecordsBefore = existingPageRecords.length;
sourceHashes.payloadWrites = 0;
await writeFile(join(proofDir, 'source-hashes-v1.json'), `${JSON.stringify(sourceHashes, null, 2)}\n`, { flag: 'wx' });
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' });
const markdown = `# p.23 — proposta PT-BR “Detalhamento da Peça” v1\n\n`+
`**Estado:** ${candidates.length} unidades propostas em snapshot isolado; Viewer, Editor, PDF e copyfit ainda pendentes. A página fonte foi conferida diretamente no PDF oficial. As alterações de composição existem apenas no snapshot diagnóstico; nenhum registro foi gravado no Payload.\n\n`+
`## Unidades propostas\n\n`+candidates.map(candidate => `### ${candidate.sourceBlockId}${candidate.sourceUnitId ? ` / ${candidate.sourceUnitId}` : ''}\n\n**EN:** ${candidate.sourceText}\n\n**PT-BR:** ${candidate.proposalText}\n\n**Termos pendentes:** ${candidate.pendingTerms.length ? candidate.pendingTerms.join(' ') : 'Nenhum termo de glossário pendente identificado.'}`).join('\n\n')+`\n\n## Exceção de texto na arte\n\n- **ELEVATION 2 / ELEVATION 1 → ELEVAÇÃO 2 / ELEVAÇÃO 1:** texto incorporado à imagem do diagrama; a imagem-fonte foi preservada e a substituição permanece aberta.\n- **UM1**, marcadores A–E e o folio 23 permanecem invariantes.\n- Chaves legadas de bloco e IDs canônicos não foram alterados. As unidades de legenda e a recomposição do block_13 são exclusivas do snapshot e documentam a estrutura proposta para revisão.\n\n## Evidência\n\n- PDF oficial: ${proposal.sourcePdf}; SHA-256: ${sourcePdfSha256}.\n- Raster da fonte: output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-v1/source-en-page-023.png.\n- Snapshot e hashes: output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v1/snapshot/snapshot.json e output/proofs/translation-readiness-2026-10-16/p023-tile-breakdown-proposal-v1/source-hashes-v1.json.\n- Registros PT-BR encontrados: 0; Payload writes: 0.\n`;
await writeFile(markdownPath, markdown, { flag: 'wx' });
console.log(JSON.stringify({
  proposalId: proposal.proposalId, candidates: candidates.length,
  spanKeys: candidates.map(candidate => candidate.spanKey),
  payloadRecordsBefore: existingPageRecords.length, payloadWrites: 0,
  sourcePdfSha256, snapshotSha256: sourceHashes.snapshotSha256,
  proposalPath, markdownPath, snapshotPath: join(snapshotDir, 'snapshot.json'),
}, null, 2));
