#!/usr/bin/env node
/** Build an isolated p.21 PT-BR proposal with blank diagnostics for source-art blockers. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd(), page = 21, pageId = '021', language = 'pt-BR';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const pdfPath = process.env.MIDDARA_SOURCE_PDF_PATH ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const pageDir = resolve(root, 'apps/web/public/pages/page_021');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p021-full-page-proposal-v1');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages/page_021');
const proposalPath = resolve(root, 'docs/translations/proposals/page-021-full-page-proposal-2026-10-16-v1.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-021-full-page-proposal-2026-10-16-v1.md');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const norm = value => String(value ?? '').replace(/[\s\u00a0]+/gu, ' ').trim();
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  await mkdir(dirname(path), { recursive: true });
  try { assert.deepEqual(await readFile(path), bytes, 'Refusing to overwrite different artifact: ' + path); }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
const writeJson = (path, value) => immutableWrite(path, JSON.stringify(value, null, 2) + '\n');
const seg = (text, font = 'OptimaLTStd', size = 10, color = '#231f20', extra = {}) => ({
  text, font, size, color, weight: font.includes('Bold') || font.includes('Black') ? 700 : 400,
  style: font.includes('Italic') ? 'italic' : 'normal', disableLigatures: true, ...extra,
});
const body = (text, color = '#231f20', size = 10) => seg(text, 'OptimaLTStd', size, color);
const bold = (text, color = '#231f20', size = 10) => seg(text, 'OptimaLTStd-Bold', size, color, { weight: 700 });
const ital = (text, color = '#231f20', size = 10) => seg(text, 'OptimaLTStd-Italic', size, color, { style: 'italic' });
const boldItal = (text, color = '#231f20', size = 10) => seg(text, 'OptimaLTStd-BoldItalic', size, color, { weight: 700, style: 'italic' });
const title = (text, size, color = '#231f20') => seg(text, 'Cinzel-Regular', size, color, { weight: 700 });
const white = text => body(text, '#ffffff');
const wbold = (text, size = 10) => bold(text, '#ffffff', size);
const label = text => wbold(text, 9);
const blankData = (color, size = 10, lineHeight = 1.1) => ({
  schemaVersion: 2, segments: [body('', color, size)], textAlign: 'left',
  lineHeight, lineHeightMode: 'source', managedSourceSymbols: [],
});

const drafts = [
  { id: 'block_42', text: 'Peças e Terrenos', runs: [title('Peças e Terrenos', 18)], lh: 1, terms: ['Tiles → Peças; Terrain → Terrenos (glossário); revisar capitalização do título.'] },
  { id: 'block_27', text: 'Movimento e Fichas', runs: [title('Movimento e Fichas', 12)], lh: 1, terms: ['Token → Ficha segue o glossário; Movimento é uso contextual observado.'] },
  { id: 'block_29', text: 'É possível mover-se para espaços ocupados por fichas de qualquer tipo, exceto fichas de Terreno Obstruído. Fichas circulares, como as de Saída, Totens, Saque e Objetivo, não bloqueiam a Linha de Visão e podem ocupar o mesmo espaço que Miniaturas, outras fichas circulares ou fichas de Terreno, salvo indicação em contrário no Encontro.', runs: [body('É possível mover-se para espaços ocupados por fichas de qualquer tipo, exceto fichas de '), ital('Terreno Obstruído'), body('. Fichas circulares, como as de '), ital('Saída'), body(', Totens, '), ital('Saque'), body(' e '), ital('Objetivo'), body(', '), boldItal('não'), body(' bloqueiam a Linha de Visão e podem ocupar o mesmo espaço que Miniaturas, outras fichas circulares ou fichas de '), ital('Terreno'), body(', salvo indicação em contrário no Encontro.')], lh: 1.1, terms: ['A primeira frase explicita Miniaturas como agente de “can be moved onto”; confirmar leitura mecânica.', 'Ficha de Terreno é composto pendente no glossary-candidates.md.'] },
  { id: 'block_30', text: 'Fichas de Terreno', runs: [title('Fichas de Terreno', 12)], lh: 1, terms: ['Terrain Token → Ficha de Terreno é candidato pendente de confirmação.'] },
  { id: 'block_40', text: 'As Fichas de Terreno são usadas para colocar diferentes tipos de Terreno nas Peças. Aventureiros e Combatentes podem se mover até essas fichas e interagir com elas como se estivessem impressas na Peça.', runs: [ital('As Fichas de Terreno'), body(' são usadas para colocar diferentes tipos de Terreno nas Peças. Aventureiros e Combatentes podem se mover até essas fichas e interagir com elas como se estivessem impressas na '), bold('Peça'), body('.')], lh: 1.1, terms: ['Ficha de Terreno é composto pendente de confirmação.'] },
  { id: 'block_41', text: 'Os diferentes tipos de Terreno e as regras correspondentes estão listados no diagrama abaixo.', runs: [body('Os diferentes tipos de Terreno e as regras correspondentes estão listados no diagrama abaixo.')], lh: 1.1, terms: [] },
  { id: 'block_14', text: 'Terreno é um efeito sobre uma Peça. Ele pode alterar aspectos como Movimento e Linha de Visão, mas seus efeitos variam bastante.', runs: [body('Terreno é um efeito sobre uma '), bold('Peça'), body('. Ele pode alterar aspectos como Movimento e Linha de Visão, mas seus efeitos variam bastante.')], lh: 1.1, terms: [] },
  { id: 'block_15', text: 'NORMAL: Sem efeitos especiais. Pode ser colocado sobre qualquer tipo de Terreno e substituído por qualquer tipo de Terreno.', runs: [label('NORMAL:'), white(' Sem efeitos especiais. Pode ser colocado sobre qualquer tipo de Terreno e substituído por qualquer tipo de Terreno.')], lh: 1.1, terms: [] },
  { id: 'block_16', text: 'DIFÍCIL: Ataques feitos através de Terreno Difícil ou contra alvos dentro dele sofrem −1 na rolagem de Ataque. Essa penalidade não pode ser aplicada mais de uma vez, mas se acumula com a penalidade de −1 na rolagem de Ataque causada por espaços que contenham Aliados. Sair de um espaço de Terreno Difícil custa 2 pontos de Movimento. Habilidades que colocam Terreno Difícil só podem substituir espaços de Terreno Normal.', runs: [label('DIFÍCIL:'), white(' Ataques feitos através de Terreno Difícil ou contra alvos dentro dele sofrem '), wbold('−1'), white(' na rolagem de Ataque. Essa penalidade não pode ser aplicada mais de uma vez, mas se acumula com a penalidade de '), wbold('−1'), white(' na rolagem de Ataque causada por espaços que contenham Aliados. Sair de um espaço de Terreno Difícil custa '), wbold('2'), white(' pontos de Movimento. Habilidades que colocam Terreno Difícil só podem substituir espaços de Terreno Normal.')], lh: 1.1, blank: true, blocker: 'Ícone vermelho de Movimento sem mapeamento semântico/avanço por ocorrência; origem no fundo, sem caixa no sidecar.', terms: ['Movement → Movimento é candidato contextual.', 'A proposta completa permanece no inventário; no diagnóstico, o texto fica em branco até resolver a ocorrência do ícone.'] },
  { id: 'block_18', text: 'ÁGUA: Miniaturas na Água não podem usar ESQUIVA. Sair de um espaço de Água custa 2 pontos de Movimento. Habilidades que colocam Terreno de Água podem substituir Terreno Normal, Terreno Difícil e Terreno de Lodo. Fichas de Água colocadas por uma Habilidade não têm Corrente.', runs: [label('ÁGUA:'), white(' Miniaturas na Água não podem usar '), wbold('ESQUIVA'), white('. Sair de um espaço de Água custa '), wbold('2'), white(' pontos de Movimento. Habilidades que colocam Terreno de Água podem substituir Terreno Normal, Terreno Difícil e Terreno de Lodo. Fichas de Água colocadas por uma Habilidade não têm Corrente.')], lh: 1.1, blank: true, blocker: 'Ícone vermelho de Movimento sem mapeamento semântico/avanço por ocorrência; origem no fundo, sem caixa no sidecar.', terms: ['Dodge → Esquiva e Current → Corrente são candidatos locais, não aprovados.', 'A proposta completa permanece no inventário; no diagnóstico, o texto fica em branco até resolver a ocorrência do ícone.'] },
  { id: 'block_19', text: 'LODO: Miniaturas no Terreno de Lodo devem gastar 1 Ponto de Stamina (SP) adicional em todas as Ações e Habilidades que custem 1 SP ou mais. Habilidades que colocam Terreno de Lodo só podem substituir Terreno Normal e Terreno Difícil.', runs: [label('LODO:'), white(' Miniaturas no Terreno de Lodo devem gastar '), wbold('1'), white(' Ponto de Stamina ('), wbold('SP'), white(') adicional em todas as Ações e Habilidades que custem '), wbold('1'), white(' '), wbold('SP'), white(' ou mais. Habilidades que colocam Terreno de Lodo só podem substituir Terreno Normal e Terreno Difícil.')], lh: 1.1, terms: ['Stamina Point → Ponto de Stamina é forma local; conferir a tradução de mecânica salva no livro.'] },
  { id: 'block_20', text: 'OBSTRUÍDO: Miniaturas não podem atravessar nem entrar em espaços de Terreno Obstruído. Não se pode traçar Linha de Visão através de nenhuma parte dele (por exemplo, uma linha vermelha). Só é possível interagir com esses espaços ou contorná-los usando Habilidades que indiquem isso especificamente (por exemplo, IMPARÁVEL; veja Marcadores, pág. 92). Habilidades que colocam Terreno Obstruído podem substituir qualquer Terreno, exceto Terreno Perigoso. Se uma regra especial ou Habilidade colocar esse Terreno sobre uma Miniatura, a menos que a própria regra ou Habilidade indique o contrário, ela deve fazer um Teste de Salto para o espaço vazio mais próximo que não tenha Terreno Perigoso ou será Derrotada.', runs: [label('OBSTRUÍDO:'), white(' Miniaturas não podem atravessar nem entrar em espaços de Terreno Obstruído. Não se pode traçar Linha de Visão através de nenhuma parte dele (por exemplo, uma linha vermelha). Só é possível interagir com esses espaços ou contorná-los usando Habilidades que indiquem isso especificamente (por exemplo, '), wbold('IMPARÁVEL'), white('; veja '), boldItal('Marcadores', '#ffffff'), white(', pág. 92). Habilidades que colocam Terreno Obstruído podem substituir qualquer Terreno, exceto Terreno Perigoso. Se uma regra especial ou Habilidade colocar esse Terreno sobre uma Miniatura, a menos que a própria regra ou Habilidade indique o contrário, ela deve fazer um Teste de Salto para o espaço vazio mais próximo que não tenha Terreno Perigoso ou será Derrotada.')], lh: 1.1, terms: ['Tags → Marcadores segue uso observado e aguarda revisão terminológica.'] },
  { id: 'block_21', text: 'PERIGOSO: Miniaturas que encerrarem o turno em um espaço Perigoso, terminarem o Movimento nesse espaço ou saírem dele serão Derrotadas. Fichas movidas para um espaço de Terreno Perigoso são descartadas. Habilidades que colocam Terreno Perigoso podem substituir qualquer tipo de Terreno, exceto Terreno Obstruído.', runs: [label('PERIGOSO:'), white(' Miniaturas que encerrarem o turno em um espaço Perigoso, terminarem o Movimento nesse espaço ou saírem dele serão Derrotadas. Fichas movidas para um espaço de Terreno Perigoso são descartadas. Habilidades que colocam Terreno Perigoso podem substituir qualquer tipo de Terreno, exceto Terreno Obstruído.')], lh: 1.1, terms: [] },
  { id: 'block_22', text: 'ESPECIAL: Os efeitos deste Terreno variam conforme o Encontro. As regras desses espaços estão especificadas nas Regras Especiais de Encontro de cada Encontro.', runs: [label('ESPECIAL:'), white(' Os efeitos deste Terreno variam conforme o Encontro. As regras desses espaços estão especificadas nas Regras Especiais de Encontro de cada Encontro.')], lh: 1.1, terms: [] },
  { id: 'block_74', text: 'Tipos de Terreno', runs: [title('Tipos de Terreno', 18, '#ffffff')], lh: 1, terms: [] },
  { unit: 'p21-block23-normal-label', parent: 'block_23', line: 0, text: 'NORMAL', runs: [label('NORMAL')], lh: 1, align: 'center', terms: [] },
  { unit: 'p21-block23-hindering-label', parent: 'block_23', line: 1, text: 'DIFÍCIL', runs: [label('DIFÍCIL')], lh: 1, align: 'center', terms: ['Hindering Terrain → Terreno Difícil segue o glossário; forma curta proposta.'] },
  { unit: 'p21-block25-water-label', parent: 'block_25', line: 0, text: 'ÁGUA', runs: [label('ÁGUA')], lh: 1, align: 'center', terms: ['Water Terrain → Terreno de Água segue o glossário; forma curta proposta.'] },
  { unit: 'p21-block25-muck-label', parent: 'block_25', line: 1, text: 'LODO', runs: [label('LODO')], lh: 1, align: 'center', terms: ['Muck Terrain → Terreno de Lodo segue o glossário; forma curta proposta.'] },
  { unit: 'p21-block24-dangerous-label', parent: 'block_24', line: 0, text: 'PERIGOSO', runs: [label('PERIGOSO')], lh: 1, align: 'center', terms: ['Dangerous Terrain → Terreno Perigoso segue o glossário; forma curta proposta.'] },
  { unit: 'p21-block24-special-label', parent: 'block_24', line: 1, text: 'ESPECIAL', runs: [label('ESPECIAL')], lh: 1, align: 'center', terms: [] },
  { unit: 'p21-block26-obstructing-label', parent: 'block_26', line: 0, text: 'OBSTRUÍDO', runs: [label('OBSTRUÍDO')], lh: 1, align: 'center', terms: ['Obstructing Terrain → Terreno Obstruído segue o glossário; forma curta proposta.'] },
];
const artGroups = [
  { group: 'token-blue', ids: ['block_45'], source: 'BLUE', target: 'AZUL', terms: ['Blue → Azul é sugestão; o texto está dentro da arte original.'] },
  { group: 'token-red', ids: ['block_49'], source: 'RED', target: 'VERMELHO', terms: ['Red → Vermelho é sugestão; o texto está dentro da arte original.'] },
  { group: 'token-loot', ids: ['block_53'], source: 'LOOT', target: 'SAQUE', terms: ['Loot → Saque segue o glossário; o texto está dentro da arte original.'] },
  { group: 'token-exit-green', ids: ['block_58'], source: 'EXIT / GREEN', target: 'SAÍDA / VERDE', terms: ['Exit → Saída segue o glossário; Green → Verde é sugestão local.'] },
  { group: 'token-yellow-bottom', ids: ['block_61', 'block_66'], source: 'YELLOW', target: 'AMARELO', terms: ['Yellow → Amarelo é sugestão; a inscrição curva está dividida entre block_61 e block_66.'] },
  { group: 'token-yellow-top', ids: ['block_67'], source: 'YELLOW', target: 'AMARELO', terms: ['Yellow → Amarelo é sugestão; o texto está dentro da arte original.'] },
];

for (const path of [proofDir, proposalPath, markdownPath]) {
  try { await access(path); throw new Error('Refusing to overwrite existing output: ' + path); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
const pdfBytes = await readFile(pdfPath), sourcePdfSha256 = hash(pdfBytes);
assert.equal(sourcePdfSha256, 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351', 'Official source PDF hash changed.');
const assetNames = (await readdir(pageDir)).sort();
assert.deepEqual(assetNames, ['background.webp', 'fidelity-overlay-token-icons.png', 'fidelity_overlays.json', 'layout_frames.json', 'page_021_dom.json']);
const pageAssetHashes = {};
for (const name of assetNames) pageAssetHashes[name] = hash(await readFile(join(pageDir, name)));
const canonicalDomBytes = await readFile(join(pageDir, 'page_021_dom.json'));
const canonicalDom = JSON.parse(canonicalDomBytes);
assert.equal(canonicalDom.page_number, page);
assert.equal(canonicalDom.blocks.length, 30);
const snapshotDom = structuredClone(canonicalDom);
const findBlock = id => {
  const index = snapshotDom.blocks.findIndex(block => block.id === id);
  assert.notEqual(index, -1, 'Missing source block: ' + id);
  return { block: snapshotDom.blocks[index], index };
};
const sourceText = (block, lineIds) => {
  const lines = lineIds ? lineIds.map(id => block.lines.find(line => line.id === id)) : block.lines;
  assert.ok(lines.every(Boolean), 'Source line mapping changed.');
  return norm(lines.map(line => line.spans.filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings').map(span => span.text ?? '').join('')).join(' '));
};

// Add snapshot-only editorial splits so each lower diagram label remains centered in its own box.
for (const parent of new Set(drafts.filter(item => item.unit).map(item => item.parent))) {
  assert.equal(findBlock(parent).block.typographicUnits?.length ?? 0, 0, 'Unexpected canonical typed units in ' + parent);
}
for (const draft of drafts.filter(item => item.unit)) {
  const block = findBlock(draft.parent).block, line = block.lines[draft.line];
  assert.ok(line, 'Missing label line.');
  block.typographicUnits ??= [];
  assert.ok(!block.typographicUnits.some(item => item.id === draft.unit), 'Duplicate proposed typed unit: ' + draft.unit);
  const [x1, , x2] = line.bbox, width = x2 - x1 + 12;
  block.typographicUnits.push({
    id: draft.unit, label: draft.text, kind: 'label',
    field: { id: draft.unit + '-field', lineIds: [line.id], bbox: [...line.bbox],
      frame: { x: (x1 + x2 - width) / 2, width, textAlign: 'center', lineHeight: 1 } },
  });
}
const candidates = drafts.map(draft => {
  const sourceId = draft.parent ?? draft.id, found = findBlock(sourceId), block = found.block, index = found.index;
  const lineIds = draft.unit ? [block.lines[draft.line].id] : null;
  const source = sourceText(block, lineIds), target = draft.runs.map(run => run.text ?? '').join('');
  assert.equal(target, draft.text, 'Rich text differs for ' + (draft.unit ?? draft.id));
  const spanKey = draft.unit ? 'page_21_unit_' + draft.unit + '__pt-BR' : 'page_21_block_' + index + '__pt-BR';
  const color = draft.runs.find(run => run.text)?.color ?? '#231f20';
  const data = { schemaVersion: 2, segments: draft.runs, textAlign: draft.align ?? 'left',
    lineHeight: draft.lh, lineHeightMode: 'source', managedSourceSymbols: [] };
  return {
    blockIndex: index, sourceBlockId: sourceId, ...(draft.unit ? { unitId: draft.unit, sourceLineId: lineIds[0] } : {}),
    sourceText: source, proposalText: target, spanKey, spanKeys: [spanKey], language, data,
    diagnosticData: draft.blank ? blankData(color, 10, draft.lh) : data,
    status: draft.blank ? 'blocked_blank_in_diagnostic' : 'draft_pending_live_copyfit_and_human_review',
    technicalStatus: draft.blank ? 'blocked_missing_occurrence_specific_symbol' : 'pending_live_copyfit_viewer_and_pdf',
    editorialStatus: 'pending_human_review', diagnosticRendering: draft.blank ? 'blank' : 'proposal',
    blocker: draft.blocker ?? null, sourceLineCount: lineIds ? 1 : block.lines.length,
    sourceBboxes: lineIds ? [block.lines.find(line => line.id === lineIds[0]).bbox] : block.lines.map(line => line.bbox),
    pendingTerms: draft.terms,
  };
});
const artworkExceptions = artGroups.map(group => {
  const blocks = group.ids.map(id => {
    const found = findBlock(id);
    return { id, index: found.index, key: 'page_21_block_' + found.index + '__pt-BR', bbox: found.block.bbox, text: sourceText(found.block) };
  });
  return {
    group: group.group, sourceBlockIds: group.ids, spanKeys: blocks.map(item => item.key),
    sourceText: group.source, proposalText: group.target,
    locationPt: [Math.min(...blocks.map(item => item.bbox[0])), Math.min(...blocks.map(item => item.bbox[1])),
      Math.max(...blocks.map(item => item.bbox[2])), Math.max(...blocks.map(item => item.bbox[3]))],
    status: 'blocked_language_invariant_artwork',
    evidence: 'fidelity_overlays.json marks fidelity-overlay-token-icons.png languageInvariant=true; original labels remain visible in the image.',
    pendingTerms: group.terms,
  };
});
const allKeys = [...candidates.map(item => item.spanKey), ...artworkExceptions.flatMap(item => item.spanKeys)];
assert.equal(new Set(allKeys).size, allKeys.length, 'Duplicate snapshot keys.');
const apiResponse = await fetch(new URL('/api/translations?where[language][equals]=pt-BR&limit=5000', apiUrl), { signal: AbortSignal.timeout(20000) });
assert.ok(apiResponse.ok, 'Read-only Payload GET failed: ' + apiResponse.status);
const payload = await apiResponse.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload GET is paginated.');
const existingPageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_21_'));
assert.equal(existingPageRecords.length, 0, 'p.21 has Payload records; stop rather than replace human work.');
const boxes = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), pdfPath, String(page)], { encoding: 'utf8' });
assert.equal(boxes.status, 0, 'Could not read PDF page boxes: ' + (boxes.stderr || boxes.stdout));
await mkdir(snapshotPageDir, { recursive: true });
for (const name of assetNames) if (name !== 'page_021_dom.json') await immutableWrite(join(snapshotPageDir, name), await readFile(join(pageDir, name)));
await immutableWrite(join(snapshotPageDir, 'page_021_dom.json'), JSON.stringify(snapshotDom, null, 2) + '\n');
const artBlank = blankData('#231f20', 5, 1);
const translations = [
  ...candidates.map(item => ({ spanKey: item.spanKey, language, data: item.diagnosticData })),
  ...artworkExceptions.flatMap(item => item.spanKeys.map(spanKey => ({ spanKey, language, data: artBlank }))),
];
const snapshot = { translations, layoutFrames: [], symbolAliasSettings: [], assetPages: [page], page,
  patched: false, verifyRenderedSnapshot: true, sourcePageBoxes: JSON.parse(boxes.stdout) };
await writeJson(join(snapshotDir, 'snapshot.json'), snapshot);
await writeJson(join(proofDir, 'source-hashes.json'), {
  sourcePdf: sourcePdfSha256, canonicalPageAssets: pageAssetHashes, canonicalDomSha256: hash(canonicalDomBytes),
  snapshotDomSha256: hash(Buffer.from(JSON.stringify(snapshotDom, null, 2) + '\n')),
  payloadPreflight: { method: 'GET only', pageRecords: existingPageRecords.length, writes: 0 },
  editableUnitCount: candidates.length, translatedInDiagnostic: candidates.filter(item => item.diagnosticRendering === 'proposal').length,
  blankBlockedCount: candidates.filter(item => item.diagnosticRendering === 'blank').length,
  artworkExceptionCount: artworkExceptions.length, snapshotRecordCount: translations.length, structuralSplitSnapshotOnly: true,
});
const proposal = {
  proposalId: 'page-021-full-page-proposal-2026-10-16-v1',
  status: 'proposal-v1-pending-live-copyfit-viewer-editor-and-pdf-review',
  page,
  counts: { editableTargets: candidates.length, proposedInDiagnosticViewer: candidates.filter(item => item.diagnosticRendering === 'proposal').length,
    blankBlockedUnits: candidates.filter(item => item.diagnosticRendering === 'blank').length,
    artworkExceptionGroups: artworkExceptions.length, pageFurnitureExcluded: ['block_75 folio 21'] },
  candidates, artworkExceptions,
  structuralSplitSnapshotOnly: {
    affectedBlocks: ['block_23', 'block_24', 'block_25', 'block_26'],
    newUnitIds: drafts.filter(item => item.unit).map(item => item.unit),
    preservation: 'Existing block and line IDs unchanged; added units refer to existing source lines.',
    rollback: 'Remove typographicUnits from the isolated snapshot; canonical page files are unchanged.',
  },
  payloadWrites: 0, humanApproved: false,
};
await writeJson(proposalPath, proposal);
const md = [
  '# p.21 — proposta PT-BR integral v1', '',
  '**Estado:** rascunho isolado; copyfit e revisão humana pendentes. Dois parágrafos com símbolo sem mapeamento e rótulos sobre arte invariável ficam em branco no diagnóstico; o fundo original continua visível.',
  '', '## Cobertura e exceções', '',
  '- ' + candidates.length + ' unidades editoriais inventariadas; ' + proposal.counts.proposedInDiagnosticViewer + ' aparecem traduzidas no diagnóstico e ' + proposal.counts.blankBlockedUnits + ' ficam em branco por símbolo de Movimento sem identidade/avanço confiável.',
  '- ' + artworkExceptions.length + ' grupos de rótulos nos tokens estão bloqueados pela sobreposição de ícones, marcada languageInvariant=true; as propostas PT separadas não alteram a arte.',
  '- Os sete rótulos do diagrama têm IDs próprios só no snapshot isolado. A adição referencia linhas existentes e é reversível sem tocar no DOM canônico.',
  '- O fólio 21 é mobiliário fixo e fica fora da tradução.',
  '', '## Propostas', '',
  ...candidates.flatMap(item => ['### ' + item.spanKey, '', '**EN:** ' + item.sourceText, '', '**PT-BR:** ' + item.proposalText,
    '**Diagnóstico:** ' + item.diagnosticRendering + '; ' + item.technicalStatus + '.',
    ...(item.pendingTerms.length ? ['**Revisão pendente:** ' + item.pendingTerms.join(' ')] : []), '']),
  '## Rótulos em arte', '',
  ...artworkExceptions.map(item => '- **' + item.group + '** (' + item.sourceBlockIds.join(', ') + '; PDF pt ' + item.locationPt.join(', ') + '): ' + item.sourceText + ' → ' + item.proposalText + '; ' + item.status + '.'),
  '', '## Integridade', '',
  '- PDF-fonte SHA-256: ' + sourcePdfSha256 + '.',
  '- Payload GET-only: zero registros da p.21; nenhuma escrita.',
  '- As propostas completas dos dois blocos bloqueados ficam no JSON; os overrides diagnósticos têm texto vazio. Sem alteração canônica, tradução humana, Payload ou PDF-fonte.',
  '- Viewer, Editor read-only e PDF isolado ainda precisam de verificação; export não equivale a aprovação editorial.',
  '',
].join('\n');
await immutableWrite(markdownPath, md);
console.log(JSON.stringify({
  status: proposal.status, page, editableUnitCount: candidates.length,
  translatedInDiagnostic: proposal.counts.proposedInDiagnosticViewer, blankBlockedUnits: proposal.counts.blankBlockedUnits,
  artworkExceptionGroups: artworkExceptions.length, snapshotRecords: translations.length,
  payloadRecordsBefore: existingPageRecords.length, payloadWrites: 0, sourcePdfSha256,
  canonicalDomSha256: hash(canonicalDomBytes), snapshot: join(snapshotDir, 'snapshot.json'),
  proposal: proposalPath, proofDir,
}, null, 2));
