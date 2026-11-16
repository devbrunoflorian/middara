#!/usr/bin/env node
/** Build the export-ready isolated PT-BR proposal for page 24; v1-v3 remain preserved. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const page = 24;
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdf = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sourceDir = resolve(root, 'apps/web/public/pages/page_024');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p024-adventurers-items-proposal-v4');
const snapshotDir = join(proofDir, 'snapshot');
const proposalPath = resolve(root, 'docs/translations/proposals/page-024-adventurers-items-proposal-2026-10-16-v4.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-024-adventurers-items-proposal-2026-10-16-v4.md');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const mustNotExist = async path => {
  try { await access(path); throw new Error(`Refusing to overwrite existing artifact: ${path}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
};
for (const path of [join(proofDir, 'source-hashes-v4.json'), proposalPath, markdownPath]) await mustNotExist(path);

const dom = JSON.parse(await readFile(join(sourceDir, 'page_024_dom.json'), 'utf8'));
const pdfBytes = await readFile(sourcePdf);
const sourcePdfSha256 = sha256(pdfBytes);
const norm = value => String(value).replace(/[\u0000-\u001f\u007f\u00a0]+/gu, ' ').replace(/\s+/gu, ' ').trim();
const blockById = id => {
  const block = dom.blocks.find(item => item.id === id);
  assert.ok(block, `Missing source block ${id}`);
  return block;
};
const blockIndex = id => dom.blocks.indexOf(blockById(id));
const lineById = (block, id) => {
  const line = block.lines.find(item => item.id === id);
  assert.ok(line, `Missing line ${id} in ${block.id}`);
  return line;
};
const sourceTextForBlock = (block, { important = false } = {}) => norm(block.lines.flatMap(line => line.spans)
  .filter(span => !['Webdings'].includes(span.font) && span.color?.toLowerCase() !== '#ffffff')
  .filter(span => !important || !/^\s*IMPORTANT:\s*$/u.test(span.text))
  .map(span => span.text).join(''));
const sourceTextForUnit = (block, unit) => norm(unit.field.lineIds
  .flatMap(id => lineById(block, id).spans)
  .filter(span => span.color?.toLowerCase() !== '#ffffff' && span.font !== 'Webdings')
  .map(span => span.text).join(''));
const sourceBboxesForBlock = block => block.lines.map(line => line.bbox);
const sourceBboxesForUnit = (block, unit) => unit.field.lineIds.map(id => lineById(block, id).bbox);

const regular = (text, size = 10) => ({ text, font: 'OptimaLTStd', size, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true });
const styled = (text, style, size = 10) => {
  const font = style === 'bold' || style === 'bold9' ? 'OptimaLTStd-Bold' : style === 'italic' ? 'OptimaLTStd-Italic' : 'OptimaLTStd-BoldItalic';
  return { text, font, size, color: '#231f20', weight: style === 'italic' ? 400 : 700, style: style.includes('italic') ? 'italic' : 'normal', disableLigatures: true };
};
const parseMarked = value => {
  const parts = [];
  const re = /\{\{b9:([^}]+)\}\}|\{\{b10:([^}]+)\}\}|\*\*\*([^*]+?)\*\*\*|\*\*([^*]+?)\*\*|\*([^*]+?)\*/gu;
  let cursor = 0;
  for (const match of value.matchAll(re)) {
    if (match.index > cursor) parts.push(regular(value.slice(cursor, match.index)));
    const text = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (match[1] !== undefined) parts.push(styled(text, 'bold9', 9));
    else if (match[2] !== undefined) parts.push(styled(text, 'bold', 10));
    else {
      const kind = match[3] !== undefined ? 'bolditalic' : match[4] !== undefined ? 'bold' : 'italic';
      parts.push(styled(text, kind));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push(regular(value.slice(cursor)));
  return parts.filter(part => part.text.length > 0);
};
const segmentsPlain = segments => segments.map(segment => segment.symbolId ? '' : segment.text).join('');
const dataFor = (segments, { textAlign = 'left', lineHeight = 1.1, managedSourceSymbols = [] } = {}) => ({
  schemaVersion: 2, segments, textAlign, lineHeight, lineHeightMode: 'source', managedSourceSymbols,
});
const candidates = [];
const addCandidate = ({ blockId, unitId = null, markup, important = false, heading = false, title = false, textAlign = 'left', pendingTerms = [], notes = [] }) => {
  const block = blockById(blockId);
  const idx = blockIndex(blockId);
  let sourceText;
  let sourceBboxes;
  let sourceLineCount;
  let spanKey;
  if (unitId) {
    const unit = block.typographicUnits?.find(item => item.id === unitId);
    assert.ok(unit, `Missing unit ${unitId}`);
    sourceText = sourceTextForUnit(block, unit);
    sourceBboxes = sourceBboxesForUnit(block, unit);
    sourceLineCount = unit.field.lineIds.length;
    spanKey = `page_${page}_unit_${unitId}__pt-BR`;
  } else {
    sourceText = sourceTextForBlock(block, { important });
    sourceBboxes = sourceBboxesForBlock(block);
    sourceLineCount = block.lines.length;
    spanKey = `page_${page}_block_${idx}`;
  }
  let proposalText = markup.replace(/\{\{b(?:9|10):([^}]+)\}\}/gu, '$1').replace(/\*\*\*|\*\*/gu, '').replace(/\*/gu, '');
  if (important) proposalText = `IMPORTANTE: ${proposalText}`;
  const segments = [];
  if (important) {
    segments.push({ text: '\uFFFC', symbolId: 'tag.important.icon', symbolMetrics: { widthEm: 1, heightEm: 1, verticalAlignEm: 0.2 }, sourceRendering: 'semantic-inline', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true });
    segments.push({ text: 'IMPORTANTE:', font: 'OptimaLTStd-Black', size: 10, color: '#b91d23', weight: 900, style: 'normal', textStrokeWidthPt: 2, textStrokeColor: '#ffffff', disableLigatures: true });
    segments.push(regular(' '));
    segments.push(...parseMarked(markup));
  } else if (title) {
    segments.push({ text: proposalText, font: 'EsmeraldaPro', size: 30, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true });
  } else if (heading) {
    const sourceSpan = block.lines[0]?.spans?.find(span => span.color?.toLowerCase() !== '#ffffff' && span.font !== 'Webdings');
    const font = sourceSpan?.font ?? 'Cinzel-Regular';
    const size = sourceSpan?.size ?? 12;
    segments.push({ text: proposalText, font, size, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true });
  } else {
    segments.push(...parseMarked(markup));
  }
  const data = dataFor(segments, { textAlign, managedSourceSymbols: important ? ['tag.important.icon'] : [] });
  assert.equal(norm(segmentsPlain(segments)), norm(proposalText), `Rich segments differ from target for ${spanKey}`);
  candidates.push({
    sourceBlockId: blockId,
    sourceUnitId: unitId,
    blockIndex: idx,
    sourceText,
    proposalText,
    proposalMarkup: markup,
    spanKey,
    legacyBlockSpanKey: `page_${page}_block_${idx}__pt-BR`,
    language: 'pt-BR',
    data,
    diagnosticData: structuredClone(data),
    status: 'draft_pending_live_copyfit_and_human_review',
    technicalStatus: 'pending_viewer_editor_and_pdf',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    sourceLineCount,
    sourceBboxes,
    pendingTerms,
    notes,
    textAlign,
  });
};

// Left column: setup, adventurer selection and equipment.
addCandidate({ blockId: 'block_16', markup: 'Ao iniciar uma nova Aventura ou jogar um novo Cenário do Modo Crawl, os jogadores receberão instruções para selecionar e preparar os Aventureiros.', pendingTerms: ['Crawl Mode → Modo Crawl: termo de modo sem decisão oficial; manter a proposta local pendente.'] });
addCandidate({ blockId: 'block_17', markup: 'No Modo Aventura, o Livro de Aventura determinará quais Aventureiros farão parte do grupo e quando outros Aventureiros se juntarão a ele.', pendingTerms: ['Adventure Mode → Modo Aventura e Adventure Book → Livro de Aventura são formas locais pendentes de harmonização.'] });
addCandidate({ blockId: 'block_18', markup: 'No Modo Crawl, escolha qualquer Aventureiro disponível.', pendingTerms: ['Crawl Mode → Modo Crawl: termo de modo sem decisão oficial; manter a proposta local pendente.'] });
addCandidate({ blockId: 'block_19', markup: 'Independentemente do Modo de Jogo, o Livro de Aventura ou o Livro Crawl correspondente explicará como preparar os Aventureiros pela primeira vez.', pendingTerms: ['Adventure Book / Crawl Book → Livro de Aventura / Livro Crawl são formas locais propostas; confirmar a nomenclatura dos livros.'] });
addCandidate({ blockId: 'block_20', markup: 'Ao jogar ***Middara***, os jogadores controlam os Aventureiros. Os Aventureiros disponíveis para escolha mudam de acordo com o Modo de Jogo.', pendingTerms: ['Game Mode → Modo de Jogo é proposta contextual; harmonizar com o nome oficial dos modos.'] });
addCandidate({ blockId: 'block_21', markup: 'Independentemente do Modo de Jogo, ao longo de ***Middara***, os Aventureiros evoluem tanto na quantidade de Disciplinas quanto na qualidade dos Itens equipados.', pendingTerms: ['Disciplines / Items → Disciplinas / Itens: capitalização de termos de jogo pendente de revisão editorial.'] });
addCandidate({ blockId: 'block_22', markup: 'Selecionar Aventureiros', heading: true });
addCandidate({ blockId: 'block_24', markup: 'No Modo Aventura, a história determinará quais Aventureiros estão disponíveis e quando devem ser preparados.', pendingTerms: ['Adventure Mode → Modo Aventura: forma local pendente de harmonização.'] });
addCandidate({ blockId: 'block_25', markup: 'No Modo Crawl, pode-se jogar com qualquer miniatura que tenha uma Carta de Aventureiro, inclusive as de qualquer produto ***Middara***.', pendingTerms: ['Crawl Mode → Modo Crawl e Adventurer Card → Carta de Aventureiro são formas locais pendentes de harmonização.'] });
addCandidate({ blockId: 'block_26', markup: 'Equipar e Guardar Itens', heading: true });
addCandidate({ blockId: 'block_28', unitId: 'p24-block-28-paragraph-1', markup: 'Os Aventureiros têm limites para a quantidade de Itens que podem carregar e equipar. Ao equipar Itens, o Aventureiro não pode exceder os limites abaixo.', pendingTerms: ['Equip / carry → equipar / carregar: revisar a distinção mecânica entre carregar e manter equipado.'] });
addCandidate({ blockId: 'block_28', unitId: 'p24-block-28-paragraph-2', markup: 'LIMITES DE ITENS:', pendingTerms: ['Item Limits → Limites de Itens: forma local de cabeçalho.'] });
addCandidate({ blockId: 'block_29', markup: 'Além disso, cada Aventureiro tem uma Mochila onde pode guardar 3 Itens extras. Esses Itens ficam armazenados e não podem ser usados até serem equipados. Os Itens na Mochila do Aventureiro não afetam os outros limites de Itens.', pendingTerms: ['Pack → Mochila e Stored → armazenado são candidatos locais já usados em outras propostas; confirmar harmonização.'] });
addCandidate({ blockId: 'block_30', important: true, markup: 'Itens virados ou exaustos guardados na Mochila continuam assim. São desvirados e desexaustados como qualquer outra carta. Fichas de Usado permanecem na carta e só são removidas quando os Aventureiros recebem instruções para Restaurar.', pendingTerms: ['Pack → Mochila; Exhausted / Un-Exhaust → exausto / desexaustar; Used tokens → fichas de Usado são termos mecânicos candidatos.'], notes: ['A ocorrência Webdings é representada pela identidade semântica tag.important.icon; a palavra-fonte duplicada em branco foi excluída do texto visível.'] });
addCandidate({ blockId: 'block_31', important: true, markup: 'O Aventureiro só pode ter 1 cópia de cada Relíquia equipada ou na Mochila a qualquer momento. Ou seja, não pode ter mais de 1 Relíquia com o mesmo nome equipada ou na Mochila ao mesmo tempo. No entanto, pode guardar quantas Relíquias quiser no Estoque do Grupo.', pendingTerms: ['Relic → Relíquia; Pack → Mochila; Party Stash → Estoque do Grupo segue o glossário oficial.'], notes: ['A ocorrência Webdings é representada pela identidade semântica tag.important.icon; a palavra-fonte duplicada em branco foi excluída do texto visível.'] });

// Right column: shared storage, XP/Gold and buying/learning.
addCandidate({ blockId: 'block_32', markup: 'Estoque do Grupo', heading: true });
addCandidate({ blockId: 'block_34', markup: 'O Estoque do Grupo reúne os Itens que o grupo possui, mas não quer equipar agora. Ele não tem limite de espaço, então os jogadores podem guardar nele quantos Itens quiserem. Podem acrescentar Itens a qualquer momento, mas só retirá-los durante as Rodadas de História.', pendingTerms: ['Party Stash → Estoque do Grupo segue o glossário oficial; equipar/guardar Item e capitalização de termos de jogo precisam de revisão local.'] });
addCandidate({ blockId: 'block_35', important: true, markup: 'Durante uma Rodada de História, todos os Itens Consumíveis que não forem vendidos ou equipados são descartados. Consulte *Venda de Itens*, pág. 27.', pendingTerms: ['Consumable Items → Itens Consumíveis e Selling Items → Venda de Itens são formas locais; Story Round → Rodada de História segue o glossário oficial.'], notes: ['A ocorrência Webdings é representada pela identidade semântica tag.important.icon; a palavra-fonte duplicada em branco foi excluída do texto visível.'] });
addCandidate({ blockId: 'block_39', markup: 'Ao ganhar **XP**, cada Aventureiro do grupo recebe a quantidade indicada. O XP é individual e não é compartilhado. O **Ouro** pertence ao grupo. Combinem entre si ao comprar **Itens**!', pendingTerms: ['Gain/Gained → ganhar/receber: confirmar capitalização da ação mecânica em prosa.'] });
addCandidate({ blockId: 'block_40', markup: 'Por exemplo, uma recompensa por concluir um Encontro pode dizer:', pendingTerms: ['Encounter → Encontro é uma forma local já usada; conferir capitalização de recompensa.'] });
addCandidate({ blockId: 'block_41', markup: 'Cada Aventureiro ganha **1 XP**.', pendingTerms: ['Gain → ganhar: confirmar capitalização da ação mecânica em prosa.'] });
addCandidate({ blockId: 'block_42', markup: 'Quando um Aventureiro encontra Ouro, as instruções podem dizer algo como:', pendingTerms: ['Adventure → Aventura e Ouro seguem o uso local; confirmar capitalização dos termos do jogo.'] });
addCandidate({ blockId: 'block_43', markup: 'Grupo ganha **20 Ouro**.', pendingTerms: ['Gain → ganhar: forma compacta para caber no exemplo; confirmar no fluxo humano de revisão.'] });
addCandidate({ blockId: 'block_44', markup: 'Ativar uma Ficha de Saque pode render:', pendingTerms: ['Loot / Token → Saque / Ficha seguem o glossário oficial; revisar o composto Ficha de Saque e o verbo render neste contexto.'] });
addCandidate({ blockId: 'block_45', markup: 'Ganhe **10** Ouro + **2** Consumíveis Mundanos.', pendingTerms: ['Mundane Consumables → Consumíveis Mundanos: composto ainda não definido no glossário.'] });
addCandidate({ blockId: 'block_46', markup: 'Assim, o grupo ganha 10 Ouro, e o Aventureiro que ativou a ficha de Saque ganha 2 Consumíveis.', pendingTerms: ['Loot / Token → Saque / Ficha seguem o glossário oficial; revisar composto e capitalização de Consumíveis.'] });
addCandidate({ blockId: 'block_47', markup: 'Comprar Itens e Aprender Disciplinas', heading: true });
addCandidate({ blockId: 'block_49', markup: 'Durante a partida, os Aventureiros poderão gastar o Ouro e o XP que ganharam para comprar Itens e aprender Disciplinas. Isso só pode ser feito quando receberem instruções específicas. A forma mais comum é receber a opção Comprar e Treinar.', pendingTerms: ['Shop and Train → Comprar e Treinar segue o glossário oficial; revisar a construção do nome da opção como texto de regra.'] });
addCandidate({ blockId: 'block_50', markup: 'No Modo Aventura, isso costuma ocorrer na Fase de Comprar e Treinar da Rodada de História. Consulte *Rodadas de História*, pág. 13.', pendingTerms: ['Adventure Mode → Modo Aventura é forma local; Shop and Train e Story Round seguem o glossário oficial.'] });
addCandidate({ blockId: 'block_51', markup: 'No Modo Crawl, Comprar e Treinar costuma ser uma recompensa por concluir um Encontro ou Cenário. Consulte *Recompensas de Encontro*, pág. 9.', pendingTerms: ['Crawl Mode → Modo Crawl e Encounter Rewards → Recompensas de Encontro são formas locais propostas; Shop and Train segue o glossário oficial.'] });
addCandidate({ blockId: 'block_52', unitId: 'p24-discipline-learning-body', markup: 'Em qualquer Modo de Jogo, você pode gastar XP para aprender Disciplinas de qualquer Árvore de Disciplinas disponível. Para aprender uma Disciplina de nível superior em uma Árvore, você já precisa ter aprendido uma Disciplina do nível anterior na mesma Árvore.', pendingTerms: ['Discipline Tree → Árvore de Disciplinas e Level/LVL → nível são formas locais propostas; confirmar equivalência e tratamento da sigla LVL.'], notes: ['A unidade de exemplo adjacente já tem uma tradução humana parcial. Ela foi preservada e registrada à parte para revisão.'] });
addCandidate({ blockId: 'block_53', important: true, markup: 'Um Aventureiro não pode aprender a mesma Disciplina duas vezes.', pendingTerms: ['Disciplina e a flexão de personagem seguem os candidatos locais; revisar consistência de capitalização.'], notes: ['A ocorrência Webdings é representada pela identidade semântica tag.important.icon; a palavra-fonte duplicada em branco foi excluída do texto visível.'] });
addCandidate({ blockId: 'block_55', markup: 'Aventureiros e Itens', title: true, textAlign: 'center' });
addCandidate({ blockId: 'block_56', markup: 'Preparação', heading: true });
addCandidate({ blockId: 'block_58', markup: 'Jogando com Aventureiros', heading: true });

// Item-limit list: each source bullet remains one editor target and keeps its source marker.
addCandidate({ blockId: 'block_60', markup: '{{b10:2 }}{{b9:MÃOS DE ARMAS}} +\n{{b10:1 }}Aprimoramento de Arma por mão', pendingTerms: ['Weapon Upgrade → Aprimoramento de Arma follows Item Upgrade → Aprimoramento de Item; check this compact wording and item-type emphasis.'] });
addCandidate({ blockId: 'block_61', markup: '{{b10:1 }}{{b9:ARMADURA}} + {{b10:1}} Aprimoramento', pendingTerms: ['Armor Upgrade → Aprimoramento de Armadura is a candidate compound; the compact line relies on the preceding item label.'] });
addCandidate({ blockId: 'block_62', markup: '{{b10:1 }}{{b9:NÚCLEO}} + {{b10:1}} Aprimoramento', pendingTerms: ['Core → Núcleo and Core Upgrade → Aprimoramento de Núcleo are candidate item names; the compact line relies on the preceding item label.'] });
addCandidate({ blockId: 'block_63', markup: '{{b10:1 }}{{b9:ACESSÓRIO}}', pendingTerms: ['Accessory → Acessório is a candidate item-type name.'] });
addCandidate({ blockId: 'block_64', markup: '{{b10:3 }}{{b9:RELÍQUIAS}}', pendingTerms: ['Relic → Relíquia is a candidate item-type name.'] });
addCandidate({ blockId: 'block_65', markup: '{{b10:3 }}{{b9:CONSUMÍVEIS}}', pendingTerms: ['Consumable → Consumível is a candidate item-type name.'] });
addCandidate({ blockId: 'block_66', markup: '{{b10:1 }}{{b9:FAMILIAR}}', pendingTerms: ['Familiar → Familiar is used in prior drafts but remains absent from the official glossary.'] });
addCandidate({ blockId: 'block_67', markup: '{{b10:1 }}{{b9:COMPANHEIRO}}', pendingTerms: ['Companion → Companheiro is a candidate term used in other proposals, not a glossary decision.'] });

assert.equal(candidates.length, 43, 'Unexpected p.24 proposal coverage count.');
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, candidates.length, 'Duplicate candidate keys.');
const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(response.ok, `Payload GET failed: ${response.status}`);
const payload = await response.json();
const existingPageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_24_'));
assert.equal(existingPageRecords.length, 3, 'p.24 saved-record baseline changed; stop before snapshot creation and re-review.');
assert.deepEqual(existingPageRecords.map(record => Number(record.id)).sort((a, b) => a - b), [244, 248, 249]);
assert.ok(existingPageRecords.some(record => record.spanKey === 'page_24_unit_p24-block-36-heading-size-12pt__pt-BR' && record.data?.segments?.map(s => s.text).join('') === 'Ganhando XP e Ouro'));
assert.ok(existingPageRecords.some(record => record.spanKey === 'page_24_unit_p24-block-36-body-size-10pt__pt-BR' && record.data?.segments?.map(s => s.text).join('').includes('Ficha de Aventura')));
assert.ok(existingPageRecords.some(record => record.spanKey === 'page_24_unit_p24-discipline-learning-example__pt-BR' && record.data?.segments?.map(s => s.text).join('').includes('To learn a LVL 2')));
assert.ok(!candidates.some(candidate => existingPageRecords.some(record => record.spanKey === candidate.spanKey)), 'A candidate would replace a preexisting saved translation.');

const framesUrl = new URL('/api/layout-frames', apiUrl);
framesUrl.searchParams.set('where[pageNumber][equals]', String(page));
framesUrl.searchParams.set('limit', '500');
const framesResponse = await fetch(framesUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(framesResponse.ok, `Layout frame GET failed: ${framesResponse.status}`);
const framesPayload = await framesResponse.json();
const existingPageLayoutFrames = (framesPayload.docs ?? []).filter(record => Number(record.pageNumber) === page);
assert.equal(existingPageLayoutFrames.length, 1, 'p.24 saved layout-frame baseline changed; stop and re-review.');
assert.equal(existingPageLayoutFrames[0].unitKey, 'page_24_block_32');
const listFrameLayout = ['block_60', 'block_61', 'block_62', 'block_63', 'block_64', 'block_65', 'block_66', 'block_67'].map(id => {
  const block = blockById(id);
  const index = blockIndex(id);
  const leftColumn = index <= blockIndex('block_63');
  const [x, y, , bottom] = block.bbox;
  const unitKey = `page_${page}_block_${index}`;
  const frame = { x: block.lines[0]?.availableX ?? x, y, width: leftColumn ? 170 : 125, height: bottom - y, rotation: 0, textAlign: 'left' };
  return { frameKey: `${unitKey}::pt-BR`, unitKey, pageNumber: page, language: 'pt-BR', data: frame };
});
const snapshotLayoutFrames = [...existingPageLayoutFrames, ...listFrameLayout];

const proposal = {
  schemaVersion: 1,
  proposalId: 'page-024-adventurers-items-2026-10-16-v4',
  page: 24,
  locale: 'pt-BR',
  title: 'Aventureiros e Itens',
  sourcePdf,
  sourcePdfSha256,
  canonicalDomSha256: sha256(await readFile(join(sourceDir, 'page_024_dom.json'))),
  canonicalInlineElementsSha256: sha256(await readFile(join(sourceDir, 'inline_elements.json'))),
  status: 'draft_pending_viewer_editor_pdf_copyfit_and_human_review',
  counts: { candidates: candidates.length, verifiedInViewer: 0, verifiedInEditor: 0, verifiedInPdf: 0, preservedHumanRecords: existingPageRecords.length },
  sourceReview: {
    status: 'official_pdf_and_english_viewer_visual_reviewed_2026-10-16',
    sourceRaster: 'output/proofs/translation-readiness-2026-10-16/p024-source-review-v1/source-en-page-024.png',
    englishViewer: 'output/proofs/translation-readiness-2026-10-16/p024-source-review-v1/en-viewer-v1.png',
    englishPdf: 'output/proofs/translation-readiness-2026-10-16/p024-source-review-v1/page-024-en-source-v1.pdf',
    fidelityNote: 'Full official source raster, current English Viewer, and English one-page PDF were visually compared. All four tag.important.icon occurrences and their blank callout panels are mapped; source artwork and all DOM blocks remain present.',
  },
  preservedHumanRecords: existingPageRecords.map(record => ({
    id: record.id, spanKey: record.spanKey, updatedAt: record.updatedAt,
    text: (record.data?.segments ?? []).map(segment => segment.text ?? '').join(''),
    disposition: record.spanKey.includes('discipline-learning-example')
      ? 'preserved_as_saved_human_text; mixed-language example flagged for review'
      : 'preserved_as_saved_human_translation; no candidate overrides this key',
  })),
  candidates,
  diagnosticLayoutFrames: {
    status: 'snapshot_only',
    preservedHumanFrames: existingPageLayoutFrames.length,
    itemLimitListFrames: listFrameLayout.map(record => ({ unitKey: record.unitKey, data: record.data })),
    reason: 'Widen the two narrow source list columns within their existing column bounds so translated item labels remain on their source rows. Frames are included only in this immutable diagnostic snapshot.',
  },
  artworkExceptions: [],
  payload: { readOnlyMethod: 'GET', existingPageRecords: existingPageRecords.length, existingPageLayoutFrames: existingPageLayoutFrames.length, writes: 0 },
  diagnosticFailurePolicy: 'If a candidate fails copyfit or semantic rendering, blank only that candidate in the diagnostic snapshot; retain the complete source and proposal text in this file.',
};

const snapshot = {
  translations: [...existingPageRecords, ...candidates.map(candidate => ({ spanKey: candidate.spanKey.endsWith('__pt-BR') ? candidate.spanKey : `${candidate.spanKey}__pt-BR`, language: 'pt-BR', data: candidate.diagnosticData }))],
  layoutFrames: snapshotLayoutFrames, symbolAliasSettings: [], assetPages: [page], page, patched: false, verifyRenderedSnapshot: true,
  sourcePageBoxes: { [page]: {
    mediaBox: [0, 0, dom.width, dom.height], cropBox: [0, 0, dom.width, dom.height],
    bleedBox: [0, 0, dom.width, dom.height], trimBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173],
    artBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173],
  } },
};
const snapshotPath = join(snapshotDir, 'snapshot.json');
const snapshotPageDir = join(snapshotDir, 'pages/page_024');
await mkdir(join(snapshotDir, 'pages'), { recursive: true });
await cp(sourceDir, snapshotPageDir, { recursive: true, errorOnExist: true });
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
const assetNames = ['page_024_dom.json', 'background.webp', 'inline_elements.json', 'layout_frames.json', ...Array.from({ length: 4 }, (_, i) => `inline-element-mask-${String(i).padStart(3, '0')}.png`)];
const sourceHashes = {};
for (const name of assetNames) sourceHashes[name] = sha256(await readFile(join(sourceDir, name)));
sourceHashes.sourcePdfSha256 = sourcePdfSha256;
sourceHashes.snapshotSha256 = sha256(await readFile(snapshotPath));
sourceHashes.payloadRecordsBefore = existingPageRecords.length;
sourceHashes.payloadLayoutFramesBefore = existingPageLayoutFrames.length;
sourceHashes.payloadWrites = 0;
await writeFile(join(proofDir, 'source-hashes-v4.json'), `${JSON.stringify(sourceHashes, null, 2)}\n`, { flag: 'wx' });
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' });

const markdown = `# p.24 — proposta PT-BR “Aventureiros e Itens” v4\n\n`+
  + `**Estado:** ${candidates.length} unidades editáveis em snapshot isolado; Viewer, Editor, PDF e copyfit pendentes. A página EN foi comparada visualmente com o PDF oficial. Três traduções humanas salvas foram preservadas, incluindo um exemplo parcialmente em inglês que segue aberto para revisão. Nenhuma alteração foi gravada no Payload ou nos arquivos canônicos.\n\n`
  + `## Unidades propostas\n\n`
  + candidates.map(candidate => `### ${candidate.sourceBlockId}${candidate.sourceUnitId ? ` / ${candidate.sourceUnitId}` : ''}\n\n**EN:** ${candidate.sourceText}\n\n**PT-BR:** ${candidate.proposalText}\n\n**Revisão pendente:** ${candidate.pendingTerms.length ? candidate.pendingTerms.join(' ') : 'Nenhum termo adicional identificado.'}`).join('\n\n')
  + `\n\n## Registros humanos preservados\n\n`
  + proposal.preservedHumanRecords.map(record => `- **${record.spanKey}** (ID ${record.id}): ${record.disposition}. Texto salvo: “${record.text}”`).join('\n')
  + `\n\n## Fonte e persistência\n\n`
  + `- PDF oficial SHA-256: ${sourcePdfSha256}. Raster fonte: ${proposal.sourceReview.sourceRaster}.\n`
  + `- Snapshot e hashes: ${snapshotPath} e ${join(proofDir, 'source-hashes-v4.json')}.\n`
  + `- p.24: ${existingPageRecords.length} registros PT-BR salvos preservados; nenhuma gravação no Payload.\n`;
await writeFile(markdownPath, markdown, { flag: 'wx' });
console.log(JSON.stringify({
  proposalId: proposal.proposalId, candidates: candidates.length, spanKeys: candidates.map(candidate => candidate.spanKey),
  preservedPayloadRecords: existingPageRecords.map(record => ({ id: record.id, spanKey: record.spanKey })),
  payloadWrites: 0, sourcePdfSha256, snapshotSha256: sourceHashes.snapshotSha256,
  proposalPath, markdownPath, snapshotPath,
}, null, 2));
