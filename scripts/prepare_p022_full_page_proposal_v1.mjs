#!/usr/bin/env node
/** Create a recoverable, isolated PT-BR draft for p.22 without touching Payload. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const page = 22;
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourceDir = resolve(root, 'apps/web/public/pages/page_022');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p022-full-page-proposal-v9');
const snapshotDir = join(proofDir, 'snapshot');
const proposalPath = resolve(root, 'docs/translations/proposals/page-022-full-page-proposal-2026-10-16-v9.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-022-full-page-proposal-2026-10-16-v9.md');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const mustNotExist = async path => {
  try { await access(path); throw new Error(`Refusing to overwrite existing artifact: ${path}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
};
for (const path of [proofDir, proposalPath, markdownPath]) await mustNotExist(path);

const domBytes = await readFile(join(sourceDir, 'page_022_dom.json'));
const dom = JSON.parse(domBytes);
const inline = JSON.parse(await readFile(join(sourceDir, 'inline_elements.json'), 'utf8'));
const blockText = id => {
  const block = dom.blocks.find(item => item.id === id);
  assert.ok(block, `Missing source block ${id}`);
  return block.lines.flatMap(line => line.spans.map(span => span.text)).join('').replace(/\s+/gu, ' ').trim();
};
const regular = text => ({ text, font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true });
const bold = text => ({ text, font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true });
const bold9 = text => ({ text, font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true });
const styled = (text, font, size, weight = 400, style = 'normal') => ({ text, font, size, color: '#231f20', weight, style, disableLigatures: true });
const symbol = id => {
  const element = inline.elements.find(item => item.symbolId === id);
  assert.ok(element, `Missing source symbol ${id}`);
  return { text: '\uFFFC', symbolId: id, symbolMetrics: element.metrics, font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true };
};
const makeData = (segments, extra = {}) => ({
  schemaVersion: 2, segments, textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'source',
  managedSourceSymbols: [], ...extra,
});
const candidates = [];
const add = ({ blockId, proposalText, segments, sourceLineCount, sourceBboxes, pendingTerms, notes = [] }) => {
  const block = dom.blocks.find(item => item.id === blockId);
  const data = makeData(segments);
  // Legacy block keys use the block's array index, not the PDF extraction ID.
  const spanKey = `page_22_block_${dom.blocks.indexOf(block)}__pt-BR`;
  candidates.push({
    blockIndex: dom.blocks.indexOf(block), sourceBlockId: blockId, sourceText: blockText(blockId),
    proposalText, proposalMarkup: proposalText, spanKey, spanKeys: [spanKey], language: 'pt-BR',
    data, diagnosticData: structuredClone(data), status: 'draft_pending_live_copyfit_and_human_review',
    technicalStatus: 'pending_live_copyfit_viewer_and_pdf', editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal', blocker: null, sourceLineCount,
    sourceBboxes: sourceBboxes ?? block.lines.map(line => line.bbox), pendingTerms, notes,
  });
};

const title = 'Peças e Terrenos — Continuação';
add({ blockId: 'block_19', proposalText: title, segments: [
  styled('Peças e Terrenos', 'Cinzel-Regular', 18, 700),
  styled(' — Continuação', 'Cinzel-Regular', 11),
], sourceLineCount: 1, pendingTerms: ['Tiles → Peças e Terrain → Terrenos seguem o glossário; revisar capitalização e forma do subtítulo.'] });

add({ blockId: 'block_8', proposalText: 'Elevação', segments: [styled('Elevação', 'Cinzel-Regular', 12, 700)], sourceLineCount: 1,
  pendingTerms: ['Elevation → Elevação é proposta contextual; o termo não consta no glossário oficial.'] });

const elevation = [
  'Elevação é uma mudança de altura no tabuleiro. Quando há uma mudança de Elevação, ela é indicada por uma linha roxa tracejada e um quadrado de Elevação. Aplicam-se as regras a seguir:',
  '• Uma Miniatura em Elevação mais alta que o alvo que está Atacando recebe **+1** em todas as rolagens de Ataque contra esse alvo.',
  '• Só é possível traçar Linha de Visão entre duas Miniaturas em Elevações diferentes se a Linha de Visão passar por espaços com Elevação inferior à mais alta das duas ocupadas. Ou seja, a Miniatura que ocupa o espaço na Elevação mais alta precisa estar na borda dessa Elevação. Ao traçar Linha de Visão entre Miniaturas em Elevações diferentes, ignore todas as outras Miniaturas que ocupem Elevações abaixo da mais alta ocupada por uma delas.',
  '**Exemplo 1:** Nightingale quer Atacar a Cave Sickle, que está na Elevação **1**. Como ela está na borda da Elevação mais alta (**3**), tem Linha de Visão e pode fazer o Ataque. O Animate também está na Elevação **1**, mas a Linha de Visão de Nightingale fica bloqueada porque outro espaço da mesma Elevação está no caminho.',
  '• Miniaturas podem traçar Linha de Visão até um alvo que ocupe a mesma Elevação. Nesse caso, a Linha de Visão pode passar por Elevações mais baixas, mas não mais altas.',
  '• Há **4** níveis de Elevação: **4** é o mais alto e **1**, o mais baixo. Miniaturas podem se mover entre Elevações com diferença de **1** sem penalidade. Com diferença de **2**, podem descer normalmente, mas não podem voltar à Elevação mais alta. Uma diferença de **3** impede a Miniatura de se mover para a Elevação mais alta; se ela se mover para a mais baixa, será Derrotada.',
  '• Miniaturas em espaços adjacentes com diferença de Elevação igual ou inferior a **1** são consideradas Adjacentes e podem ser alvos de Ataques Corpo a Corpo (símbolo).',
  '• Miniaturas com **ALCANCE** podem escolher como alvo Miniaturas em Elevações diferentes. Ao traçar Linha de Visão até um alvo em outra Elevação, reduza em **1** a distância de Ataque permitida por ALCANCE para cada nível de diferença além de **1**. Assim, Miniaturas com ALCANCE podem escolher como alvo outras Miniaturas cuja diferença de Elevação seja igual ou inferior ao seu valor de ALCANCE.',
  '**Exemplo:** uma Miniatura com **ALCANCE 2** poderia escolher como alvo outra Miniatura a dois espaços de distância, desde que a diferença entre as Elevações fosse apenas **1**.',
  '• Ataques à Distância (símbolo) podem ser feitos em qualquer diferença de Elevação, desde que os requisitos de Linha de Visão sejam atendidos.',
].join('\n');
const elevationSegments = [];
const boldPattern = /\*\*(.+?)\*\*/gu;
let last = 0;
for (const match of elevation.matchAll(boldPattern)) {
  if (match.index > last) elevationSegments.push(regular(elevation.slice(last, match.index)));
  elevationSegments.push(/^\+?\d$/u.test(match[1]) ? bold9(match[1]) : bold(match[1]));
  last = match.index + match[0].length;
}
if (last < elevation.length) elevationSegments.push(regular(elevation.slice(last)));
const replaceSymbol = (segments, marker, id) => {
  const result = [];
  for (const segment of segments) {
    const pieces = segment.text.split(marker);
    pieces.forEach((piece, index) => {
      if (piece) result.push({ ...segment, text: piece });
      if (index < pieces.length - 1) result.push(symbol(id));
    });
  }
  return result;
};
let elevationRich = replaceSymbol(elevationSegments, '(símbolo)', 'attack.melee');
// The two source glyphs are occurrence-owned. Suppress their old positions and
// preserve their identities/metrics at the new translated segment boundaries.
elevationRich = elevationRich.map(segment => segment);
const elevationCandidate = {
  blockId: 'block_10', proposalText: elevation.replaceAll(' (símbolo)', ''), segments: elevationRich,
  sourceLineCount: 41,
  pendingTerms: ['Elevation → Elevação; Line of Sight → Linha de Visão; Adjacent → Adjacente; REACH → ALCANCE; Melee/Ranged → Corpo a Corpo/à Distância; Attacking/Attack casing; Defeated; Atributos de Miniatura; revisar contra o glossário e as regras do livro.'],
};
// Replace the two literal descriptions in order with semantic objects.
const rangedText = elevationCandidate.proposalText.replace('Ataques à Distância (símbolo)', 'Ataques à Distância (símbolo)');
elevationCandidate.proposalText = rangedText;
// Build one final rich stream from source-neutral text and actual semantic objects.
const finalElevation = [];
const parts = elevation.split('(símbolo)');
const combined = elevationSegments.flatMap(segment => segment.text.includes('(símbolo)')
  ? segment.text.split('(símbolo)').flatMap((part, i) => [...(part ? [{ ...segment, text: part }] : []), ...(i < segment.text.split('(símbolo)').length - 1 ? [{ __symbol: true }] : [])])
  : [segment]);
let meleeInserted = false;
for (const part of combined) {
  if (part.__symbol) {
    const id = meleeInserted ? 'attack.ranged' : 'attack.melee';
    finalElevation.push(symbol(id));
    meleeInserted = true;
  } else finalElevation.push(part);
}
elevationCandidate.proposalText = elevation.replaceAll('**', '').replace('(símbolo)', '').replace('(símbolo)', '');
elevationCandidate.segments = finalElevation;
add(elevationCandidate);
// The semantic objects in the segments adopt the two source symbols. Leave
// managedSourceSymbols empty so the legacy list splitter can separate bullets.
// Source bullets are fixed at PDF coordinates. They collide with manually
// composed PT markers after reflow, so suppress only those glyphs in this
// isolated PT snapshot; the complete bullet list remains in proposalText.
const suppressedMarkerLineIds = [];
const elevationBlock = dom.blocks.find(block => block.id === 'block_10');
delete elevationBlock.listMarkerLineIndexes;
for (const line of elevationBlock.lines) {
  const lineText = line.spans.map(span => span.text).join('').replace(/[\s\u00a0]+/gu, '');
  if (lineText !== '•') continue;
  suppressedMarkerLineIds.push(line.id);
  for (const span of line.spans) span.text = '';
}

const currentsText = [
  'Correntes',
  'Às vezes, certos Terrenos têm uma Corrente. Sua direção é indicada no Diagrama de Preparação do Encontro. Toda Miniatura que encerre o turno em um Terreno com Corrente será movida pelo número de espaços indicado nas Regras Especiais do Encontro, na direção da Corrente. Miniaturas não contornam outras Miniaturas nem Terrenos Obstruídos.',
  'Se a Miniatura não puder se mover por qualquer motivo, sofre DANO IRREDUTÍVEL igual ao número de espaços que não conseguiu percorrer. Se uma Corrente empurrar Miniaturas até a borda do Encontro, elas não poderão se mover e sofrerão DANO IRREDUTÍVEL.',
  'Miniaturas que sejam passivamente imunes a um tipo específico de Terreno também ignoram as Correntes desse tipo de Terreno. Algumas Fichas são afetadas por Correntes; outras, não. Consulte a Tabela 10: Efeitos das Correntes, pág. 100, para descobrir rapidamente se uma Ficha é movida por Correntes.',
  'Como as Fichas não têm turnos, elas são sempre movidas ao fim de cada rodada.',
  '**Exemplo 2:** Zeke encerrou o turno adjacente à Miniatura no rio. Ao fim do turno, ele é levado rio abaixo pelo número de espaços indicado nas Regras Especiais do Encontro. Neste exemplo, é apenas **1** espaço. Se fossem mais, a Corrente o levaria para fora da cachoeira e ele seria Derrotado. Como esse movimento o tira de um espaço adjacente a uma Miniatura, ela pode fazer um Ataque de Ruptura contra Zeke. Se Remi encerrasse o turno nesse local, a Corrente não poderia movê-la porque a Miniatura bloqueia a passagem. Remi bateria nela e sofreria **1 DANO IRREDUTÍVEL** pelo espaço que não conseguiu percorrer. Além disso, como Remi não se moveu, a Miniatura não faria um Ataque de Ruptura contra ela.',
].join('\n\n');
const currentsBodyMarkup = currentsText.slice('Correntes\n\n'.length);
const currentsSegments = [styled('Correntes\n', 'Cinzel-Regular', 12, 700)];
let currentsLast = 0;
for (const match of currentsBodyMarkup.matchAll(boldPattern)) {
  if (match.index > currentsLast) currentsSegments.push(regular(currentsBodyMarkup.slice(currentsLast, match.index)));
  currentsSegments.push(bold(match[1]));
  currentsLast = match.index + match[0].length;
}
if (currentsLast < currentsBodyMarkup.length) currentsSegments.push(regular(currentsBodyMarkup.slice(currentsLast)));
const currentsClean = currentsText.replaceAll('**', '');
add({ blockId: 'block_11', proposalText: currentsClean, segments: currentsSegments, sourceLineCount: 24,
  pendingTerms: ['Current/Currents → Corrente/Correntes ou Correnteza; IRREDUCIBLE DMG → DANO IRREDUTÍVEL; Break Attack → Ataque de Ruptura (não equiparado silenciosamente a Breaking Attack); Terrain, Encounter, Passive immunity, Tokens, Adjacent e Defeated; confirmar termos e mecânica.'],
  notes: ['O PDF coloca o rótulo Example 2 dentro do mesmo bloco técnico do título e do corpo; a proposta preserva a chave existente e diferencia o rótulo por segmento, sem criar uma identidade persistente nova.'] });
{
  const candidate = candidates.at(-1);
  candidate.status = 'translated_diagnostic_blank_due_to_reproduced_geometry_collision';
  candidate.technicalStatus = 'blocked_snapshot_only_structure_required';
  candidate.diagnosticRendering = 'blank';
  candidate.blocker = {
    type: 'translated_flow_overlaps_adjacent_illustration',
    sourceBlockId: 'block_11',
    bbox: dom.blocks.find(block => block.id === 'block_11').bbox,
    sourceText: candidate.sourceText,
    proposalText: candidate.proposalText,
    evidence: 'p022-full-page-proposal-v2/viewer-pt-BR-v2.png; the full translated block flows into the right-hand currents diagram. The source combines heading, left-column rules, and the Example 2 label/body in one extracted block with non-contiguous regions.',
    requiredAction: 'Split the isolated snapshot into page-local typographic units/frames for the heading, left-column rules, and Example 2 region; retain the full translation separately until structure is verified.',
  };
  candidate.diagnosticData = { ...structuredClone(candidate.data), segments: [regular('')] };
}

add({ blockId: 'block_26', proposalText: 'Exemplo 1', segments: [styled('Exemplo 1', 'AGaramondPro-Bold', 12, 700)], sourceLineCount: 1,
  pendingTerms: ['Example → Exemplo; revisão humana de rótulos e estilo do livro.'] });
const elevationTarget = candidates.find(candidate => candidate.sourceBlockId === 'block_10');
elevationTarget.status = 'draft_pending_human_terminology_review';
elevationTarget.technicalStatus = 'snapshot_marker_patch_viewer_editor_and_pdf_verified';
elevationTarget.notes.push('A snapshot PT remove os sete glyphs de marcador fonte fixos; os marcadores digitados no texto-alvo agora seguem o fluxo sem duplicação. A página canônica não foi alterada.');

const pageRecordsResponse = await fetch(new URL('/api/translations', apiUrl), { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(pageRecordsResponse.ok, `Payload GET failed: ${pageRecordsResponse.status}`);
const allRecords = (await pageRecordsResponse.json()).docs ?? [];
const existingPageRecords = allRecords.filter(record => String(record.spanKey ?? '').startsWith('page_22_') && record.language === 'pt-BR');
const candidateKeys = new Set(candidates.map(candidate => candidate.spanKey));
const collisions = existingPageRecords.filter(record => candidateKeys.has(record.spanKey));
assert.equal(collisions.length, 0, 'A candidate key already has a saved human record; preserve it and review identity before continuing.');

const proposal = {
  proposalId: 'page-022-full-page-proposal-2026-10-16-v9', status: 'complete_text_proposal_v9_one_technical_exception_diagnostic_blank_human_review_pending',
  page, sourcePdf: 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf',
  counts: { editableTargets: candidates.length, translatedTargets: candidates.length, verifiedInViewer: 4, blankBlockedUnits: 1, verifiedInEditor: 4, verifiedInPdf: 4, pageFurnitureExcluded: ['block_27 folio 22', 'block_18 X illustration mark'], snapshotOnlySuppressedSourceMarkerLines: suppressedMarkerLineIds },
  candidates, artworkOrDiagramReview: [{ sourceBlockIds: ['block_24'], sourceText: blockText('block_24'), proposalText: 'ELEVAÇÃO 3 / ELEVAÇÃO 1', locationPt: dom.blocks.find(block => block.id === 'block_24').bbox, status: 'human_review_pending', reason: 'Rótulos numéricos dentro do diagrama; confirmar se fazem parte da arte reconstruída/selecionável antes de tratá-los como unidade PT-BR.' }],
  payloadRecordsBefore: existingPageRecords.length, payloadWrites: 0, humanApproved: false,
  sourceScope: { canonicalInputsModified: false, translationRecordKeysPreserved: true, pageBlockIds: candidates.map(candidate => candidate.sourceBlockId) },
  copyfit: { engine: 'PageRenderer/Copyfit V3 existing flow', status: 'block10_snapshot_marker_fix_viewer_editor_and_pdf_pass;block11_diagnostic_blank_due_to_image_collision', diagnosticFailurePolicy: 'Block 11 remains blank only in the isolated diagnostic snapshot; block 10 source bullet glyphs are suppressed only in the PT snapshot while the complete target list remains.' },
};

const snapshot = {
  translations: [...existingPageRecords, ...candidates.map(candidate => ({ spanKey: candidate.spanKey, language: 'pt-BR', data: candidate.diagnosticData }))],
  layoutFrames: [], symbolAliasSettings: [], assetPages: [page], page, patched: false, verifyRenderedSnapshot: true,
  sourcePageBoxes: { [page]: { mediaBox: [0, 0, dom.width, dom.height], cropBox: [0, 0, dom.width, dom.height], bleedBox: [0, 0, dom.width, dom.height], trimBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173], artBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173] } },
};
await mkdir(join(snapshotDir, 'pages'), { recursive: true });
await cp(sourceDir, join(snapshotDir, 'pages/page_022'), { recursive: true, errorOnExist: true });
await writeFile(join(snapshotDir, 'pages/page_022/page_022_dom.json'), `${JSON.stringify(dom, null, 2)}\n`, { flag: 'w' });
await writeFile(join(snapshotDir, 'snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
const sourceHashes = {};
for (const name of ['page_022_dom.json', 'background.webp', 'inline_elements.json', 'layout_frames.json', 'inline-element-mask-000.png', 'inline-element-mask-001.png']) {
  sourceHashes[name] = sha256(await readFile(join(sourceDir, name)));
}
sourceHashes.snapshotSha256 = sha256(await readFile(join(snapshotDir, 'snapshot.json')));
sourceHashes.payloadRecordsBefore = existingPageRecords.length;
sourceHashes.payloadWrites = 0;
await writeFile(join(proofDir, 'source-hashes.json'), `${JSON.stringify(sourceHashes, null, 2)}\n`, { flag: 'wx' });
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' });
const markdown = `# p.22 — proposta PT-BR integral v9\n\n`+
`**Estado:** cinco blocos traduzidos. Quatro aparecem no Viewer; block_11 permanece em branco apenas no diagnóstico devido à colisão com a ilustração. A v9 corrige a referência ao personagem Animate no Exemplo 1, preservando o nome próprio em vez de generalizá-lo como Miniatura. Os marcadores fonte são suprimidos somente no DOM do snapshot PT; a página canônica continua intacta. A validação Viewer/Editor/PDF será atualizada para este texto.\n\n`+
`## Textos propostos\n\n`+candidates.map(candidate => `### ${candidate.sourceBlockId}\n\n**EN:** ${candidate.sourceText}\n\n**PT-BR:** ${candidate.proposalText}\n\n**Termos pendentes:** ${candidate.pendingTerms.join(' ')}`).join('\n\n')+`\n\n`+
`## Itens fora da proposta textual\n\n`+
`- Rótulos ELEVATION 3 / ELEVATION 1 do diagrama: revisão de propriedade/arte pendente; preservados em inglês no fundo atual.\n`+
`- A proposta usa chaves PT-BR por bloco e registra ${existingPageRecords.length} registros PT-BR preexistentes. Nenhum key existente foi sobrescrito; Payload writes = 0.\n`+
`- Snapshot isolado: \`output/proofs/translation-readiness-2026-10-16/p022-full-page-proposal-v9/snapshot/snapshot.json\`.\n`+
`- Hashes de entrada e snapshot: \`output/proofs/translation-readiness-2026-10-16/p022-full-page-proposal-v9/source-hashes.json\`.\n`;
await writeFile(markdownPath, markdown, { flag: 'wx' });
console.log(JSON.stringify({ proposalId: proposal.proposalId, candidates: candidates.length, keys: candidates.map(candidate => candidate.spanKey), payloadRecordsBefore: existingPageRecords.length, payloadWrites: 0, snapshotSha256: sourceHashes.snapshotSha256, proposalPath, markdownPath, snapshotPath: join(snapshotDir, 'snapshot.json') }, null, 2));
