import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageDir = path.join(root, 'apps/web/public/pages/page_052');
const domPath = path.join(pageDir, 'page_052_dom.json');
const inlinePath = path.join(pageDir, 'inline_elements.json');
const backgroundPath = path.join(pageDir, 'background.webp');
const sourcePdfPath = 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const adapterPath = path.join(root, 'docs/translations/proposals/page-052-dodge-empower-review-2026-10-16-v1.json');
const exceptionId = 'P052-EMPOWER-SPELL-UNMAPPED-DICE-RESULT-GLYPHS';
if (fs.existsSync(adapterPath)) throw new Error(`Refusing to overwrite ${adapterPath}`);

const dom = JSON.parse(fs.readFileSync(domPath, 'utf8'));
const inline = JSON.parse(fs.readFileSync(inlinePath, 'utf8')).elements ?? [];
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const relativeAdapter = path.relative(root, adapterPath).replaceAll('\\', '/');
if ((queue.sourceProposals ?? []).includes(relativeAdapter)) throw new Error('p.52 adapter already exists in the review queue.');
if ((queue.items ?? []).some(item => item.id === exceptionId)) throw new Error(`Exception ${exceptionId} already exists.`);

const database = new Database(path.join(root, 'apps/admin/apps-admin.db'), { readonly: true });
const humanRecords = database.prepare('SELECT span_key AS spanKey FROM translations WHERE language = ?')
  .all('pt-BR').filter(record => String(record.spanKey ?? '').startsWith('page_52_'));
database.close();
if (humanRecords.length) throw new Error(`Found ${humanRecords.length} human p.52 translations; refusing to shadow them.`);

const sourcePdfPage = (() => {
  if (!fs.existsSync(sourcePdfPath)) throw new Error('Official source PDF is missing.');
  return true;
})();
if (dom.page_number !== 52 || !Array.isArray(dom.blocks) || dom.blocks.length !== 14) {
  throw new Error('Unexpected p.52 page identity or block count.');
}

const palette = {
  body: { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' },
  bodySmall: { font: 'OptimaLTStd', size: 9, color: '#231f20', weight: 400, style: 'normal' },
  bold: { font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal' },
  bold10: { font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal' },
  boldItalic: { font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic' },
};
const text = (value, style = 'body', extra = {}) => ({ text: value, ...palette[style], disableLigatures: true, ...extra });
const occurrenceFor = (symbolId, blockId, lineId) => inline.find(element => {
  const anchor = element.anchor ?? element;
  return element.symbolId === symbolId
    && (element.blockId ?? anchor.blockId) === blockId
    && (element.lineId ?? anchor.lineId) === lineId;
});
const symbol = (symbolId, blockId, lineId) => {
  const occurrence = occurrenceFor(symbolId, blockId, lineId);
  if (!occurrence) throw new Error(`Missing audited ${symbolId} occurrence at ${blockId}/${lineId}.`);
  const anchor = occurrence.anchor ?? occurrence;
  return {
    text: '\uFFFC', symbolId,
    font: 'OptimaLTStd', size: anchor.sizePt ?? 10, color: '#231f20', weight: 400, style: 'normal',
    symbolMetrics: occurrence.metrics ?? undefined,
    disableLigatures: true,
  };
};
const importantLabel = () => ({
  text: 'IMPORTANTE:', font: 'OptimaLTStd-Black', size: 10, color: '#b91d23', weight: 900,
  style: 'normal', textStrokeWidthPt: 2, textStrokeColor: '#ffffff', disableLigatures: true,
});
const sourceTextForBlock = block => block.lines.flatMap(line => line.spans ?? []).map(span => span.text).join('').trim();
const sourceTextForUnit = (block, unit) => unit.field.lineIds
  .flatMap(lineId => block.lines.find(line => line.id === lineId)?.spans ?? [])
  .map(span => span.text).join('').trim();
const bboxForUnit = unit => unit.field.bbox;

const candidates = [];
const blockCandidate = ({ index, proposalText, segments, pendingTerms = [], managedSourceSymbols = [] }) => {
  const block = dom.blocks[index];
  const spanKey = `page_52_block_${index}__pt-BR`;
  candidates.push({
    blockIndex: index,
    sourceBlockId: block.id,
    sourceText: sourceTextForBlock(block),
    spanKey,
    language: 'pt-BR',
    proposalText,
    data: {
      schemaVersion: 2, spanKey, bbox: block.bbox, textAlign: 'left',
      lineHeight: 1, lineHeightMode: 'source', segments,
      managedSourceSymbols,
    },
    technicalStatus: 'not_recorded',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    pendingTerms,
  });
};
const unitCandidate = ({ blockIndex, unitId, proposalText, segments, pendingTerms = [], managedSourceSymbols = [] }) => {
  const block = dom.blocks[blockIndex];
  const unit = block.typographicUnits?.find(item => item.id === unitId);
  if (!unit) throw new Error(`Missing p.52 typographic unit ${unitId}.`);
  const spanKey = `page_52_unit_${unitId}__pt-BR`;
  candidates.push({
    sourceBlockId: block.id,
    sourceUnitId: unitId,
    sourceText: sourceTextForUnit(block, unit),
    spanKey,
    language: 'pt-BR',
    proposalText,
    data: {
      schemaVersion: 2, spanKey, bbox: bboxForUnit(unit), textAlign: 'left',
      lineHeight: 1, lineHeightMode: 'source', segments,
      managedSourceSymbols,
    },
    technicalStatus: 'not_recorded',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    pendingTerms,
  });
};

blockCandidate({
  index: 12,
  proposalText: 'Habilidades em Uso (continuação)',
  segments: [
    { text: 'Habilidades em Uso ', font: 'Cinzel-Regular', size: 18, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
    { text: '(continuação)', font: 'Cinzel-Regular', size: 11, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true },
  ],
  pendingTerms: [],
});
blockCandidate({
  index: 0,
  proposalText: 'Esquiva',
  segments: [{ text: 'Esquiva', font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true }],
  pendingTerms: ['Dodge → Esquiva (uso humano localizado na p. 41; canon amplo ainda pendente)'],
});
blockCandidate({
  index: 1,
  proposalText: 'Quando é alvo de um Ataque, uma Miniatura pode realizar uma ESQUIVA durante a etapa de Esquiva de uma Ação de Ataque. Para Combatentes Comandados e Aventureiros, a ESQUIVA custa 1 SP. Combatentes Inteligentes não realizam ESQUIVA, a menos que uma Habilidade indique o contrário.',
  segments: [
    text('Quando é alvo de um Ataque, uma Miniatura pode realizar uma '),
    text('ESQUIVA', 'bold'),
    text(' durante a etapa de Esquiva de uma Ação de Ataque. Para Combatentes Comandados e Aventureiros, a '),
    text('ESQUIVA', 'bold'), text(' custa '), text('1', 'bold'), text(' '), text('SP', 'bold'),
    text('. Combatentes Inteligentes não realizam '), text('ESQUIVA', 'bold'),
    text(', a menos que uma Habilidade indique o contrário.'),
  ],
  pendingTerms: [
    'Dodge → Esquiva (uso humano localizado na p. 41; canon amplo ainda pendente)',
    'Command Combatants → Combatentes Comandados (forma provisória; comparar com o rótulo da p. 58)',
    'Attack Action → Ação de Ataque',
    'Intelligent Combatants → Combatentes Inteligentes (uso salvo na p. 7; canon amplo pendente)',
  ],
});
blockCandidate({
  index: 2,
  proposalText: 'Quando uma Miniatura faz uma ESQUIVA, rola o dado PRETO [dado preto]. Cada [escudo] obtido acrescenta +1 à sua Defesa. Se sair a [caveira], a Defesa não aumenta.',
  segments: [
    text('Quando uma Miniatura faz uma '), text('ESQUIVA', 'bold'), text(', rola o dado '), text('PRETO', 'bold'),
    symbol('dice.black', 'block_15', 'line_15_0'), text('. Cada '), symbol('combat.shield', 'block_15', 'line_15_2'),
    text(' obtido acrescenta '), text('+1', 'bold10'), text(' à sua Defesa. Se sair a '),
    symbol('combat.skull', 'block_15', 'line_15_4'), text(', a Defesa não aumenta.'),
  ],
  managedSourceSymbols: ['dice.black', 'combat.shield', 'combat.skull'],
  pendingTerms: [
    'Dodge → Esquiva (uso humano localizado na p. 41; canon amplo ainda pendente)',
    'BLACK die → dado PRETO',
    'Defense → Defesa',
    'figure → Miniatura',
  ],
});
blockCandidate({
  index: 3,
  proposalText: 'Se uma Habilidade mencionar “Esquivar-se de um Ataque com sucesso”, isso significa que você realizou a Ação de Esquiva e que o Ataque feito contra você errou.',
  segments: [
    text('Se uma Habilidade mencionar “'),
    text('Esquivar-se de um Ataque com sucesso', 'boldItalic'),
    text('”, isso significa que você realizou a Ação de '), text('ESQUIVA', 'bold'),
    text(' e que o Ataque feito contra você errou.'),
  ],
  pendingTerms: [
    'Dodge Action → Ação de Esquiva',
    'Successfully Dodging an Attack → Esquivar-se de um Ataque com sucesso (frase mecânica; revisão de canon pendente)',
  ],
});
blockCandidate({
  index: 4,
  proposalText: 'IMPORTANTE: Habilidades e Aprimoramentos de Esquiva podem conceder bônus durante uma ESQUIVA. Porém, se sair a [caveira], essas Habilidades não concedem bônus.',
  segments: [
    symbol('tag.important.icon', 'block_17', 'line_17_0'), importantLabel(),
    text(' Habilidades e Aprimoramentos de Esquiva podem conceder bônus durante uma '),
    text('ESQUIVA', 'bold'), text('. Porém, se sair a '),
    symbol('combat.skull', 'block_17', 'line_17_3'),
    text(', essas Habilidades não concedem bônus.'),
  ],
  managedSourceSymbols: ['tag.important.icon', 'combat.skull'],
  pendingTerms: [
    'Dodge → Esquiva (uso humano localizado na p. 41; canon amplo ainda pendente)',
    'Dodge Upgrades → Aprimoramentos de Esquiva',
  ],
});
blockCandidate({
  index: 5,
  proposalText: 'Fortalecer',
  segments: [{ text: 'Fortalecer', font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true }],
  pendingTerms: ['Empower → Fortalecer (forma usada em proposta local da p. 50; canon ainda pendente)'],
});
unitCandidate({
  blockIndex: 6, unitId: 'p52-block-20-paragraph-1',
  proposalText: 'Durante a etapa de Fortalecimento de um Ataque ou Feitiço, um Aventureiro pode usar a Habilidade FORTALECER.',
  segments: [text('Durante a etapa de Fortalecimento de um Ataque ou Feitiço, um Aventureiro pode usar a Habilidade '), text('FORTALECER', 'bold'), text('.')],
  pendingTerms: ['Empower → Fortalecer (Habilidade) / Fortalecimento (etapa; canon ainda pendente)'],
});
unitCandidate({
  blockIndex: 6, unitId: 'p52-block-20-paragraph-2',
  proposalText: 'Para Fortalecer um Ataque, o Aventureiro gasta 1 SP ao montar sua Reserva de Dados de Combate para adicionar o dado PRETO [dado preto]. Esse dado concede Símbolos adicionais, que podem ser usados em Habilidades de Símbolo durante o Ataque.',
  segments: [
    text('Para Fortalecer um Ataque, o Aventureiro gasta '), text('1', 'bold'), text(' '), text('SP', 'bold'),
    text(' ao montar sua Reserva de Dados de Combate para adicionar o dado '), text('PRETO', 'bold'),
    symbol('dice.black', 'block_20', 'line_20_3'),
    text('. Esse dado concede Símbolos adicionais, que podem ser usados em Habilidades de Símbolo durante o Ataque.'),
  ],
  managedSourceSymbols: ['dice.black'],
  pendingTerms: [
    'Empower → Fortalecer (canon ainda pendente)',
    'Combat Dice Pool → Reserva de Dados de Combate',
    'BLACK die → dado PRETO',
    'Symbol Abilities → Habilidades de Símbolo',
  ],
});
unitCandidate({
  blockIndex: 6, unitId: 'p52-block-20-paragraph-4',
  proposalText: 'O efeito da [caveira] quando obtida depende de o Aventureiro ter usado a Habilidade FORTALECER durante um Ataque ou um Feitiço.',
  segments: [
    text('O efeito da '), symbol('combat.skull', 'block_20', 'line_20_16'),
    text(' quando obtida depende de o Aventureiro ter usado a Habilidade '), text('FORTALECER', 'bold'),
    text(' durante um Ataque ou um Feitiço.'),
  ],
  managedSourceSymbols: ['combat.skull'],
  pendingTerms: ['Empower → Fortalecer (canon ainda pendente)'],
});
blockCandidate({
  index: 7,
  proposalText: 'Ataque: Se a [caveira] sair durante um Ataque, o Ataque erra, independentemente dos resultados dos Dados de Combate.',
  segments: [
    text('Ataque: ', 'bold10'), text('Se a '), symbol('combat.skull', 'block_21', 'line_21_1'),
    text(' sair durante um Ataque, o Ataque erra, independentemente dos resultados dos Dados de Combate.'),
  ],
  managedSourceSymbols: ['combat.skull'],
  pendingTerms: ['Combat Dice → Dados de Combate'],
});
blockCandidate({
  index: 8,
  proposalText: 'Feitiço: Se a [caveira] sair durante um Feitiço, o Feitiço não afeta o alvo, e o conjurador sofre 3 DANO IRREDUTÍVEL.',
  segments: [
    text('Feitiço: ', 'bold10'), text('Se a '), symbol('combat.skull', 'block_22', 'line_22_1'),
    text(' sair durante um Feitiço, o Feitiço não afeta o alvo, e o conjurador sofre '),
    text('3 DANO IRREDUTÍVEL', 'bold'), text('.'),
  ],
  managedSourceSymbols: ['combat.skull'],
  pendingTerms: ['IRREDUCIBLE DMG → DANO IRREDUTÍVEL'],
});
blockCandidate({
  index: 9,
  proposalText: 'Algumas Armas também incluem o dado PRETO [dado preto] entre seus Dados de Combate ou como parte do Aprimoramento de Conjuração. Ataques com uma Arma que inclua um dado PRETO [dado preto] entre seus Dados de Combate estão sempre Fortalecidos. Da mesma forma, Feitiços conjurados com uma Arma que inclua um dado PRETO [dado preto] no Aprimoramento de Conjuração também estão sempre Fortalecidos. Fortalecer dessa forma não custa SP adicional.',
  segments: [
    text('Algumas Armas também incluem o dado '), text('PRETO', 'bold'), symbol('dice.black', 'block_23', 'line_23_0'),
    text(' entre seus Dados de Combate ou como parte do Aprimoramento de Conjuração. Ataques com uma Arma que inclua um dado '),
    text('PRETO', 'bold'), symbol('dice.black', 'block_23', 'line_23_2'),
    text(' entre seus Dados de Combate estão sempre Fortalecidos. Da mesma forma, Feitiços conjurados com uma Arma que inclua um dado '),
    text('PRETO', 'bold'), symbol('dice.black', 'block_23', 'line_23_5'),
    text(' no Aprimoramento de Conjuração também estão sempre Fortalecidos. Fortalecer dessa forma não custa '),
    text('SP', 'bold'), text(' adicional.'),
  ],
  managedSourceSymbols: ['dice.black'],
  pendingTerms: [
    'Empower → Fortalecer (canon ainda pendente)',
    'Combat Dice → Dados de Combate',
    'Casting Upgrade → Aprimoramento de Conjuração',
  ],
});
blockCandidate({
  index: 10,
  proposalText: 'Um Feitiço ou Ataque nunca pode ser Fortalecido mais de uma vez.',
  segments: [text('Um Feitiço ou Ataque nunca pode ser Fortalecido mais de uma vez.')],
  pendingTerms: ['Empowered → Fortalecido (forma derivada de Empower; canon ainda pendente)'],
});
blockCandidate({
  index: 11,
  proposalText: 'IMPORTANTE: Algumas Habilidades podem incluir o dado PRETO [dado preto] como parte do próprio texto. Nesses casos, a Habilidade listada não conta como um uso de Fortalecer e especificará o que o dado PRETO [dado preto] faz.',
  segments: [
    symbol('tag.important.icon', 'block_25', 'line_25_0'), importantLabel(),
    text(' Algumas Habilidades podem incluir o dado '), text('PRETO', 'bold'), symbol('dice.black', 'block_25', 'line_25_1'),
    text(' como parte do próprio texto. Nesses casos, a Habilidade listada não conta como um uso de Fortalecer e especificará o que o dado '),
    text('PRETO', 'bold'), symbol('dice.black', 'block_25', 'line_25_4'), text(' faz.'),
  ],
  managedSourceSymbols: ['tag.important.icon', 'dice.black'],
  pendingTerms: ['Empowering → uso de Fortalecer (canon ainda pendente)', 'BLACK die → dado PRETO'],
});

const unresolvedUnit = dom.blocks[6].typographicUnits.find(unit => unit.id === 'p52-block-20-paragraph-3');
if (!unresolvedUnit) throw new Error('Missing p.52 Empower Spell paragraph.');
const unresolvedSource = sourceTextForUnit(dom.blocks[6], unresolvedUnit);
const exception = {
  id: exceptionId,
  page: 52,
  spanKey: `page_52_unit_${unresolvedUnit.id}__pt-BR`,
  category: 'source_symbol_identity',
  status: 'open',
  reason: 'O PDF mostra dois glifos quadrados de resultado de dado no parágrafo sobre Fortalecer um Feitiço, mas a extração e o sidecar de p. 52 não os identificam. A tradução fica preservada no EN até que a identidade semântica dos glifos seja confirmada.',
  diagnosticRendering: 'O trecho original permanece visível; o preview PT-BR foi suspenso para evitar trocar ou remover os dois símbolos.',
  sourceText: unresolvedSource,
  proposedText: '',
  evidence: [
    'PDF oficial, página 52: dois glifos quadrados após “may spend” e “per”; ambos afetam a mecânica do dado.',
    'apps/web/public/pages/page_052/inline_elements.json: não há ocorrência ancorada em line_20_9 ou line_20_10.',
    'apps/web/public/pages/page_052/page_052_dom.json: o parágrafo editorial p52-block-20-paragraph-3 não contém symbolId para esses glifos.',
  ],
};

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const adapter = {
  proposalId: 'p052-dodge-empower-2026-10-16-v1',
  version: '1',
  title: 'Esquiva e Fortalecer — página 52',
  page: 52,
  status: 'pending_human_review',
  sourcePdf: path.basename(sourcePdfPath),
  sourceHashes: {
    sourcePdf: hash(sourcePdfPath),
    pageDom: hash(domPath),
    inlineElements: hash(inlinePath),
    background: hash(backgroundPath),
  },
  counts: {
    candidates: candidates.length,
    existingHumanTranslationsPreserved: humanRecords.length,
    finalTranslationWrites: 0,
    openSourceSymbolExceptions: 1,
  },
  sourceArtifacts: [
    'docs/translations/source-pages/page-052.md',
    'apps/web/public/pages/page_052/inline_elements.json',
    'apps/web/public/pages/page_052/page_052_dom.json',
  ],
  candidates,
};

queue.sourceProposals.push(relativeAdapter);
queue.items.push(exception);
queue.updated = '2026-10-16';
fs.writeFileSync(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`, 'utf8');
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  adapter: relativeAdapter,
  candidates: candidates.length,
  preservedHumanRecords: humanRecords.length,
  unresolvedSymbolException: exceptionId,
  finalTranslationWrites: 0,
  technicalStatus: 'not_recorded pending real Viewer inspection',
  sourcePdfPageVerified: sourcePdfPage,
}, null, 2));
