import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageDir = path.join(root, 'apps/web/public/pages/page_054');
const domPath = path.join(pageDir, 'page_054_dom.json');
const inlinePath = path.join(pageDir, 'inline_elements.json');
const backgroundPath = path.join(pageDir, 'background.webp');
const overlaysPath = path.join(pageDir, 'fidelity_overlays.json');
const sourcePdfPath = 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const adapterPath = path.join(root, 'docs/translations/proposals/page-054-casting-spells-review-2026-10-16-v1.json');
const exceptionIds = [
  'P054-SPELL-EXAMPLE-UNMAPPED-PURPLE-DIE',
  'P054-CONVICTION-UNMAPPED-TEAL-DIE',
  'P054-GORE-SHOT-CARD-EN-ARTWORK',
  'P054-ANIMATE-STAT-PANEL-EN-ARTWORK',
  'P054-ZEKE-MAGIC-STAFF-PANEL-EN-ARTWORK',
];

if (fs.existsSync(adapterPath)) throw new Error(`Refusing to overwrite ${adapterPath}`);
for (const file of [domPath, inlinePath, backgroundPath, overlaysPath, sourcePdfPath, queuePath]) {
  if (!fs.existsSync(file)) throw new Error(`Required source artifact is missing: ${file}`);
}

const dom = JSON.parse(fs.readFileSync(domPath, 'utf8'));
const inline = JSON.parse(fs.readFileSync(inlinePath, 'utf8')).elements ?? [];
const overlays = JSON.parse(fs.readFileSync(overlaysPath, 'utf8')).overlays ?? [];
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const relativeAdapter = path.relative(root, adapterPath).replaceAll('\\', '/');
if (dom.page_number !== 54 || !Array.isArray(dom.blocks) || dom.blocks.length !== 45) {
  throw new Error('Unexpected p.54 page identity or block count.');
}
if ((queue.sourceProposals ?? []).includes(relativeAdapter)) throw new Error('p.54 adapter already exists in the review queue.');
if ((queue.items ?? []).some(item => exceptionIds.includes(item.id))) throw new Error('A p.54 exception already exists.');

const requiredOverlays = [
  'gore-shot-card-walkthrough',
  'animate-combatant-stat-panel',
  'zeke-combatant-and-magic-staff-panel',
];
for (const region of requiredOverlays) {
  if (!overlays.some(item => item.region === region && item.languageInvariant === true)) {
    throw new Error(`The audited English fidelity overlay is missing: ${region}`);
  }
}

const database = new Database(path.join(root, 'apps/admin/apps-admin.db'), { readonly: true, fileMustExist: true });
const humanRecords = database.prepare('SELECT span_key AS spanKey FROM translations WHERE language = ?')
  .all('pt-BR').filter(record => String(record.spanKey ?? '').startsWith('page_54_'));
const reviewRecords = database.prepare('SELECT span_key AS spanKey FROM translation_reviews WHERE span_key LIKE ?')
  .all('page_54_%');
const openRequests = database.prepare("SELECT id FROM translation_review_requests WHERE page_number = ? AND status != 'completed'")
  .all(54);
database.close();
if (humanRecords.length) throw new Error(`Found ${humanRecords.length} human p.54 translations; refusing to shadow them.`);
if (reviewRecords.length) throw new Error(`Found ${reviewRecords.length} p.54 review records; refusing to shadow saved human review.`);
if (openRequests.length) throw new Error(`Found ${openRequests.length} open p.54 review requests; resolve their priority before staging agent proposals.`);

const palette = {
  body: { font: 'OptimaLTStd', size: 10, color: '#ffffff', weight: 400, style: 'normal' },
  bold: { font: 'OptimaLTStd-Bold', size: 9, color: '#ffffff', weight: 700, style: 'normal' },
  italic: { font: 'OptimaLTStd-Italic', size: 10, color: '#ffffff', weight: 400, style: 'italic' },
  boldItalic: { font: 'OptimaLTStd-BoldItalic', size: 10, color: '#ffffff', weight: 700, style: 'italic' },
  title18: { font: 'Cinzel-Regular', size: 18, color: '#ffffff', weight: 400, style: 'normal' },
};
const text = (value, style = 'body', extra = {}) => ({ text: value, ...palette[style], disableLigatures: true, ...extra });
const sourceTextForBlock = block => block.lines.flatMap(line => line.spans ?? []).map(span => span.text).join('').trim();
const sourceSymbol = (symbolId, blockId, lineId) => {
  const occurrence = inline.find(element => {
    const anchor = element.anchor ?? element;
    return element.symbolId === symbolId
      && (element.blockId ?? anchor.blockId) === blockId
      && (element.lineId ?? anchor.lineId) === lineId;
  });
  if (!occurrence) throw new Error(`Missing audited ${symbolId} occurrence at ${blockId}/${lineId}.`);
  const anchor = occurrence.anchor ?? occurrence;
  return {
    text: '\uFFFC', symbolId,
    font: 'OptimaLTStd', size: anchor.sizePt ?? 10, color: '#ffffff', weight: 400, style: 'normal',
    symbolMetrics: occurrence.metrics ?? undefined,
    disableLigatures: true,
  };
};
const sourceTextForBlocks = indices => indices.map(index => sourceTextForBlock(dom.blocks[index])).filter(Boolean).join('\n');
const candidates = [];
const addCandidate = ({ index, proposalText, segments, pendingTerms = [], managedSourceSymbols = [] }) => {
  const block = dom.blocks[index];
  if (!block) throw new Error(`Missing p.54 block index ${index}.`);
  const spanKey = `page_54_block_${index}__pt-BR`;
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

const terms = {
  spell: 'Spell → Feitiço (glossário oficial)',
  spellAction: 'Spell Action → Ação de Feitiço (proposta local; canon editorial pendente)',
  cast: 'cast → conjurar (glossário oficial)',
  exhaust: 'Exhaust → Exaustar (decisão humana registrada)',
  castingDie: 'Casting Die → Dado de Conjuração (glossário oficial)',
  conviction: 'Conviction → Convicção (glossário oficial)',
  convictionCheck: 'Conviction Check → Teste de Convicção (proposta local)',
  force: 'Force / Force Value → Força / Valor de Força (proposta local)',
  damage: 'Damage / DMG → Dano (proposta local; capitalização/categoria pendente)',
  figureNames: 'Zeke, Animate, Gore Shot e Magic Staff → nomes preservados; confirmar política de nomes próprios',
  soi: 'SOI → manter a sigla; nome por extenso está em revisão local',
  castingUpgrade: 'Casting Upgrade → Aprimoramento de Conjuração (composto não consta no glossário)',
  mechanics: 'Discipline, target parameters, spaces, Armor, CRUOR e LVL → formas/capitalização locais pendentes',
};

addCandidate({
  index: 0,
  proposalText: 'Zeke quer usar Gore Shot. Como ela não tem custo de SP, basta Exaustar a carta para usá-la. Como Gore Shot tem a Tag FEITIÇO 6, Zeke inicia uma Ação de Feitiço.',
  segments: [
    text('Zeke quer usar '), text('Gore Shot', 'boldItalic'), text('. Como ela não tem custo de '), text('SP', 'bold'),
    text(', basta Exaustar a carta para usá-la. Como '), text('Gore Shot', 'boldItalic'),
    text(' tem a Tag '), text('FEITIÇO 6', 'bold'), text(', Zeke inicia uma Ação de Feitiço.'),
  ],
  pendingTerms: [terms.spell, terms.spellAction, terms.exhaust, terms.figureNames],
});
addCandidate({
  index: 1,
  proposalText: 'Primeiro, Zeke deve escolher um alvo. Como Gore Shot não traz parâmetros especiais de alvo, ele pode escolher qualquer alvo dentro da SOI. Zeke verifica se o Animate está na SOI. Como está a 4 espaços de distância e dentro da SOI, pode ser alvo de Gore Shot.',
  segments: [
    text('Primeiro, Zeke deve escolher um alvo. Como '), text('Gore Shot', 'boldItalic'),
    text(' não traz parâmetros especiais de alvo, ele pode escolher qualquer alvo dentro da '), text('SOI', 'bold'),
    text('. Zeke verifica se o Animate está na '), text('SOI', 'bold'),
    text('. Como está a '), text('4', 'bold'), text(' espaços de distância e dentro da '), text('SOI', 'bold'),
    text(', pode ser alvo de '), text('Gore Shot', 'boldItalic'), text('.'),
  ],
  pendingTerms: [terms.figureNames, terms.soi, terms.mechanics],
});
addCandidate({
  index: 3,
  proposalText: 'O Magic Staff tem um Aprimoramento de Conjuração WHITE [dado branco], permitindo que Zeke use o dado melhor para aumentar o Valor de Força de Gore Shot.',
  segments: [
    text('O '), text('Magic Staff', 'italic'), text(' tem um Aprimoramento de Conjuração '), text('WHITE', 'bold'),
    sourceSymbol('dice.white', 'block_14', 'line_14_0'),
    text(', permitindo que Zeke use o dado melhor para aumentar o Valor de Força de '),
    text('Gore Shot', 'boldItalic'), text('.'),
  ],
  managedSourceSymbols: ['dice.white'],
  pendingTerms: [terms.castingUpgrade, terms.force, terms.figureNames],
});
addCandidate({
  index: 4,
  proposalText: 'Zeke tira 7. Como Gore Shot tem Força 6, ele soma esse resultado à Força do Feitiço.',
  segments: [
    text('Zeke tira '), text('7', 'bold'), text('. '), text('Gore Shot', 'boldItalic'),
    text(' tem Força '), text('6', 'bold'),
    text('. Zeke soma o resultado à Força de '), text('Gore Shot', 'boldItalic'), text('.'),
  ],
  pendingTerms: [terms.figureNames, terms.force],
});
addCandidate({
  index: 6,
  proposalText: 'Se o Animate tivesse tirado 13 ou mais, o Feitiço teria falhado e a Ação de Feitiço de Zeke teria terminado. Porém, como o Animate tirou menos que a Força do Feitiço, ele sofre o efeito do Feitiço.',
  segments: [
    text('Se o Animate tivesse tirado '), text('13', 'bold'),
    text(' ou mais, o Feitiço teria falhado e a Ação de Feitiço de Zeke teria terminado. Porém, como o Animate tirou menos que a Força do Feitiço, ele sofre o efeito do Feitiço.'),
  ],
  pendingTerms: [terms.spell, terms.spellAction, terms.force, terms.figureNames],
});
addCandidate({
  index: 7,
  proposalText: 'Como Gore Shot teve sucesso, o Animate sofre 2 DANO MÁGICO.',
  segments: [
    text('Como '), text('Gore Shot', 'boldItalic'), text(' teve sucesso, o Animate sofre '),
    text('2', 'bold'), text(' '), text('DANO MÁGICO', 'bold'), text('.'),
  ],
  pendingTerms: [terms.damage, terms.figureNames],
});
addCandidate({
  index: 8,
  proposalText: 'Zeke então decide usar a Habilidade impressa em Gore Shot: sofrer 2 DANO IRREDUTÍVEL para causar DANO MÁGICO adicional ao Animate. Ele coloca 2 fichas de Dano na própria carta.',
  segments: [
    text('Zeke então decide usar a Habilidade impressa em '), text('Gore Shot', 'boldItalic'),
    text(': sofrer '), text('2', 'bold'), text(' '), text('DANO IRREDUTÍVEL', 'bold'),
    text(' para causar '), text('DANO MÁGICO', 'bold'), text(' adicional ao Animate. Ele coloca '),
    text('2', 'bold'), text(' fichas de '), text('Dano', 'italic'), text(' na própria carta.'),
  ],
  pendingTerms: [terms.damage, terms.figureNames, terms.mechanics],
});
addCandidate({
  index: 9,
  proposalText: 'Como Gore Shot é a Disciplina CRUOR de NÍVEL mais alto de Zeke, ele causa mais 2 DANO MÁGICO ao Animate.',
  segments: [
    text('Como Gore Shot é a Disciplina '), text('CRUOR', 'bold'), text(' de '), text('NÍVEL', 'bold'),
    text(' mais alto de Zeke, ele causa mais '), text('2', 'bold'), text(' adicional de '),
    text('DANO MÁGICO', 'bold'), text(' ao Animate.'),
  ],
  pendingTerms: [terms.damage, terms.figureNames, terms.mechanics],
});
addCandidate({
  index: 10,
  proposalText: 'Ao terminar o Feitiço, Zeke causa um total de 4 DANO MÁGICO ao Animate. Como DANO MÁGICO não pode ser reduzido por Armadura, o Animate adiciona 4 fichas de Dano à sua carta.',
  segments: [
    text('Ao terminar o Feitiço, Zeke causa um total de '), text('4', 'bold'), text(' '),
    text('DANO MÁGICO', 'bold'), text(' ao Animate. Como '), text('DANO MÁGICO', 'bold'),
    text(' não pode ser reduzido por Armadura, o Animate adiciona '), text('4', 'bold'),
    text(' fichas de '), text('Dano', 'italic'), text(' à sua carta.'),
  ],
  pendingTerms: [terms.spell, terms.damage, terms.figureNames, terms.mechanics],
});
addCandidate({
  index: 42,
  proposalText: 'Conjurar Feitiços',
  segments: [text('Conjurar Feitiços', 'title18')],
  pendingTerms: [terms.cast, terms.spell],
});

const unmappedExceptions = [
  {
    id: exceptionIds[0], page: 54, spanKey: 'page_54_block_2__pt-BR', sourceBlockId: dom.blocks[2].id,
    category: 'source_symbol_identity', status: 'open',
    reason: 'O exemplo mostra um dado roxo após PURPLE, mas essa ocorrência não tem identidade semântica no sidecar. A unidade inteira fica em branco somente no Viewer de diagnóstico até que o dado seja mapeado.',
    diagnosticRendering: 'A unidade fica em branco somente no Viewer de diagnóstico; a fonte completa e a proposta com marcador permanecem nesta exceção. Nenhuma tradução é publicada.',
    sourceText: `${sourceTextForBlock(dom.blocks[2])} [dado roxo não mapeado]`,
    proposedText: 'Neste ponto, Zeke poderia opcionalmente FORTALECER este Feitiço, mas decide não fazê-lo. Em seguida, deve determinar a Força de Gore Shot, rolando seu Dado de Conjuração e somando o resultado à Força impressa do Feitiço (6). Normalmente, esse seria o dado ROXO [ícone de dado não mapeado] impresso no Cartão de Aventureiro de Zeke. Porém, Zeke está equipado com o Magic Staff.',
    evidence: [
      'PDF oficial, p. 54: há um dado roxo visível na linha após “PURPLE”.',
      'apps/web/public/pages/page_054/inline_elements.json: não há ocorrência ancorada em block_13/line_13_3 para esse dado.',
      'apps/web/public/pages/page_054/page_054_dom.json: block_13 preserva o texto, mas não associa symbolId ao glifo roxo.',
    ],
  },
  {
    id: exceptionIds[1], page: 54, spanKey: 'page_54_block_5__pt-BR', sourceBlockId: dom.blocks[5].id,
    category: 'source_symbol_identity', status: 'open',
    reason: 'O parágrafo dos Dados de Convicção contém dado branco mapeado e dado teal sem identidade no sidecar. Para não apresentar uma sequência incompleta, a unidade inteira fica em branco somente no Viewer de diagnóstico.',
    diagnosticRendering: 'A unidade fica em branco somente no Viewer de diagnóstico; a fonte completa, o dado branco mapeado e a proposta com marcador do dado teal permanecem nesta exceção. Nenhuma tradução é publicada.',
    sourceText: `${sourceTextForBlock(dom.blocks[5])} [dado branco mapeado] [dado teal não mapeado]`,
    proposedText: 'Isso deixa a Força final de Gore Shot em 13. Em seguida, o Animate faz um Teste de Convicção para determinar se foi afetado por Gore Shot. Os Combatentes têm os Dados de Convicção impressos em suas cartas. O Animate tem dados de Convicção BRANCO [dado mapeado] e TEAL [ícone de dado não mapeado]. Ele rola ambos e obtém um total de 7.',
    evidence: [
      'PDF oficial, p. 54: o dado branco e o dado teal aparecem após “WHITE” e “TEAL”.',
      'apps/web/public/pages/page_054/inline_elements.json: somente dice.white está mapeado em block_16/line_16_3; não há dice.teal em line_16_4.',
      'apps/web/public/pages/page_054/page_054_dom.json: block_16 não contém symbolId para o dado teal.',
    ],
  },
];

const overlayException = ({ id, region, title, indices, category, explanation }) => {
  const overlay = overlays.find(item => item.region === region && item.languageInvariant === true);
  return {
    id, page: 54, spanKey: null, sourceBlockId: null, category, status: 'open',
    reason: explanation,
    diagnosticRendering: 'Arte original em inglês preservada como overlay fiel; a prosa editável ao redor está nas propostas desta página. Nenhuma tradução PT-BR é pintada sobre a arte.',
    sourceText: sourceTextForBlocks(indices), proposedText: '',
    evidence: [
      `Overlay fiel ${title}: ${overlay.url}, bbox ${JSON.stringify(overlay.bbox)}.`,
      `Blocos extraídos associados ao componente: ${indices.map(index => dom.blocks[index].id).join(', ')}.`,
      'apps/web/public/pages/page_054/fidelity_overlays.json e PDF oficial, p. 54.',
    ],
  };
};

const artworkExceptions = [
  overlayException({
    id: exceptionIds[2], region: 'gore-shot-card-walkthrough', title: 'carta Gore Shot',
    indices: [11, 12, 13, 14, 15], category: 'component_artwork',
    explanation: 'A carta Gore Shot no walkthrough é texto incorporado à arte inglesa do componente. Ela precisa de uma variante PT-BR própria, sem reconstruir os ícones e o desenho como prosa.',
  }),
  overlayException({
    id: exceptionIds[3], region: 'animate-combatant-stat-panel', title: 'painel de atributos do Animate',
    indices: [16, 17, 18, 19, 20, 21, 22, 40, 41], category: 'component_artwork',
    explanation: 'O nome, os atributos e os rótulos do painel do Animate permanecem incorporados à arte inglesa preservada como overlay fiel; requerem localização do componente.',
  }),
  overlayException({
    id: exceptionIds[4], region: 'zeke-combatant-and-magic-staff-panel', title: 'painel de Zeke e carta Magic Staff',
    indices: [23, 24, 25, 26, 27, 28, 29, 30, 31], category: 'component_artwork',
    explanation: 'O painel de Zeke e a carta Magic Staff continuam como arte inglesa no overlay fiel. Texto, ícones, valores e hierarquia dependem de uma variante localizada do componente.',
  }),
];

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const exceptions = [...unmappedExceptions, ...artworkExceptions];
const adapter = {
  proposalId: 'p054-casting-spells-2026-10-16-v1',
  version: '1',
  title: 'Conjurar Feitiços — exemplo da Ação de Feitiço, página 54',
  page: 54,
  status: 'pending_human_review',
  sourcePdf: path.basename(sourcePdfPath),
  sourceHashes: {
    sourcePdf: hash(sourcePdfPath), pageDom: hash(domPath), inlineElements: hash(inlinePath),
    background: hash(backgroundPath), fidelityOverlays: hash(overlaysPath),
  },
  counts: {
    candidates: candidates.length,
    existingHumanTranslationsPreserved: humanRecords.length,
    priorReviewRecordsPreserved: reviewRecords.length,
    finalTranslationWrites: 0,
    openExceptions: exceptions.length,
  },
  sourceArtifacts: [
    'docs/translations/source-pages/page-054.md',
    'apps/web/public/pages/page_054/inline_elements.json',
    'apps/web/public/pages/page_054/page_054_dom.json',
    'apps/web/public/pages/page_054/fidelity_overlays.json',
  ],
  candidates,
};

queue.sourceProposals.push(relativeAdapter);
queue.items.push(...exceptions);
queue.updated = '2026-10-16';
fs.writeFileSync(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`, 'utf8');
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  adapter: relativeAdapter,
  candidates: candidates.length,
  preservedHumanRecords: humanRecords.length,
  preservedReviewRecords: reviewRecords.length,
  openExceptions: exceptionIds,
  finalTranslationWrites: 0,
  technicalStatus: 'not_recorded pending real Viewer and copyfit inspection',
}, null, 2));
