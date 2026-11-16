import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageDir = path.join(root, 'apps/web/public/pages/page_055');
const domPath = path.join(pageDir, 'page_055_dom.json');
const backgroundPath = path.join(pageDir, 'background.webp');
const overlaysPath = path.join(pageDir, 'fidelity_overlays.json');
const sourcePdfPath = 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const adapterPath = path.join(root, 'docs/translations/proposals/page-055-spell-like-abilities-review-2026-10-16-v1.json');
const exceptionIds = [
  'P055-COMBAT-DICE-UNMAPPED-RESULTS',
  'P055-DAMAGE-ROLL-UNMAPPED-SYMBOLS',
  'P055-SPELL-LIKE-COMPONENT-EN-ARTWORK',
];

if (fs.existsSync(adapterPath)) throw new Error(`Refusing to overwrite ${adapterPath}`);
for (const file of [domPath, backgroundPath, overlaysPath, sourcePdfPath, queuePath]) {
  if (!fs.existsSync(file)) throw new Error(`Required source artifact is missing: ${file}`);
}

const dom = JSON.parse(fs.readFileSync(domPath, 'utf8'));
const overlays = JSON.parse(fs.readFileSync(overlaysPath, 'utf8')).overlays ?? [];
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const relativeAdapter = path.relative(root, adapterPath).replaceAll('\\', '/');
if (dom.page_number !== 55 || !Array.isArray(dom.blocks) || dom.blocks.length !== 43) {
  throw new Error('Unexpected p.55 page identity or block count.');
}
if ((queue.sourceProposals ?? []).includes(relativeAdapter)) throw new Error('p.55 adapter already exists in the review queue.');
if ((queue.items ?? []).some(item => exceptionIds.includes(item.id))) throw new Error('A p.55 exception already exists.');
const panelOverlay = overlays.find(item => item.region === 'spell-like-combatant-panels' && item.languageInvariant === true);
if (!panelOverlay) throw new Error('The audited English combatant-panel overlay is missing.');

const database = new Database(path.join(root, 'apps/admin/apps-admin.db'), { readonly: true, fileMustExist: true });
const humanRecords = database.prepare('SELECT span_key AS spanKey FROM translations WHERE language = ?')
  .all('pt-BR').filter(record => String(record.spanKey ?? '').startsWith('page_55_'));
const reviewRecords = database.prepare('SELECT span_key AS spanKey FROM translation_reviews WHERE span_key LIKE ?')
  .all('page_55_%');
const openRequests = database.prepare("SELECT id FROM translation_review_requests WHERE page_number = ? AND status != 'completed'")
  .all(55);
database.close();
if (humanRecords.length) throw new Error(`Found ${humanRecords.length} human p.55 translations; refusing to shadow them.`);
if (reviewRecords.length) throw new Error(`Found ${reviewRecords.length} p.55 review records; refusing to shadow saved human review.`);
if (openRequests.length) throw new Error(`Found ${openRequests.length} open p.55 review requests; resolve their priority before staging agent proposals.`);

const palette = {
  body10: { font: 'OptimaLTStd', size: 10, color: '#ffffff', weight: 400, style: 'normal' },
  body8: { font: 'OptimaLTStd', size: 8.4728, color: '#231f20', weight: 400, style: 'normal' },
  bold9: { font: 'OptimaLTStd-Bold', size: 9, color: '#ffffff', weight: 700, style: 'normal' },
  bold10: { font: 'OptimaLTStd-Bold', size: 10, color: '#ffffff', weight: 700, style: 'normal' },
  boldCallout: { font: 'OptimaLTStd-Bold', size: 7.8676, color: '#231f20', weight: 700, style: 'normal' },
  labelCallout: { font: 'OptimaLTStd-DemiBold', size: 7.8676, color: '#ffffff', weight: 600, style: 'normal' },
  italic10: { font: 'OptimaLTStd-Italic', size: 10, color: '#ffffff', weight: 400, style: 'italic' },
  italicCallout: { font: 'OptimaLTStd-Italic', size: 8.4728, color: '#231f20', weight: 400, style: 'italic' },
  boldItalic10: { font: 'OptimaLTStd-BoldItalic', size: 10, color: '#ffffff', weight: 700, style: 'italic' },
  title18: { font: 'Cinzel-Regular', size: 18, color: '#ffffff', weight: 400, style: 'normal' },
};
const text = (value, style = 'body10', extra = {}) => ({ text: value, ...palette[style], disableLigatures: true, ...extra });
const sourceTextForBlock = block => block.lines.flatMap(line => line.spans ?? []).map(span => span.text).join('').trim();
const sourceTextForBlocks = indices => indices.map(index => sourceTextForBlock(dom.blocks[index])).filter(Boolean).join('\n');

const candidates = [];
const addCandidate = ({ index, proposalText, segments, pendingTerms = [] }) => {
  const block = dom.blocks[index];
  if (!block) throw new Error(`Missing p.55 block index ${index}.`);
  const spanKey = `page_55_block_${index}__pt-BR`;
  candidates.push({
    blockIndex: index,
    sourceBlockId: block.id,
    sourceText: sourceTextForBlock(block),
    spanKey,
    language: 'pt-BR',
    proposalText,
    data: {
      schemaVersion: 2, spanKey, bbox: block.bbox, textAlign: 'left',
      lineHeight: 1, lineHeightMode: 'source', segments: segments.map(segment => ({ ...segment, disableLigatures: true })),
      managedSourceSymbols: [],
    },
    technicalStatus: 'not_recorded',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    pendingTerms,
  });
};

const terms = {
  spellLike: 'Spell-Like Ability → Habilidade Semelhante a Feitiço(s) (proposta local; canon pendente)',
  attack: 'Attack → Ataque (uso mecânico/capitalização local em revisão)',
  combatDice: 'Combat Dice → Dados de Combate (composto local)',
  defense: 'Defense Value → Valor de Defesa (proposta local)',
  damage: 'Damage / DMG → Dano (proposta local; categoria/capitalização pendente)',
  armor: 'Armor / Armor Piercing → Armadura / Perfuração de Armadura (propostas locais)',
  followUp: 'Follow Up / FU → Continuação / FU (proposta local)',
  pushPull: 'Push / Pull / Pushed → Empurrar / Puxar / Empurrado (mecânica local)',
  paralyze: 'Paralyze → Paralisia (rótulo de condição proposto)',
  force: 'Force → Força (proposta local)',
  difference: 'Difference Hit → Diferença do Acerto (proposta local)',
  breakAttack: 'Break Attack → Ataque de Oportunidade (forma de fonte distinta da entrada “Breaking Attack”; revisar)',
  names: 'Remi, Animate e Great Hammer → nomes preservados; conferir convenção editorial',
};

addCandidate({
  index: 0,
  proposalText: 'Remi realiza um Ataque contra o Animate usando um Great Hammer.',
  segments: [text('Remi realiza um Ataque contra o Animate usando um '), text('Great Hammer', 'italic10'), text('.')],
  pendingTerms: [terms.attack, terms.names],
});
addCandidate({
  index: 2,
  proposalText: 'A rolagem de Ataque resulta em 13. Isso acerta o Valor de Defesa 9 do Animate com uma diferença de 4.',
  segments: [
    text('A rolagem de Ataque resulta em '), text('13', 'bold9'),
    text('. Isso acerta o Valor de Defesa '), text('9', 'bold9'),
    text(' do Animate com uma diferença de '), text('4', 'bold9'), text('.'),
  ],
  pendingTerms: [terms.attack, terms.defense, terms.difference, terms.names],
});
addCandidate({
  index: 4,
  proposalText: 'O Animate tem 3 de Armadura. Como Remi não tem PERFURAÇÃO DE ARMADURA na Arma, o DANO FÍSICO que ela causa é reduzido em 3. O Dano Final é 8. O Animate adiciona 8 fichas de Dano à própria carta.',
  segments: [
    text('O Animate tem '), text('3', 'bold9'), text(' de Armadura. Como Remi não tem '), text('PERFURAÇÃO DE ARMADURA', 'bold9'),
    text(' na Arma, o '), text('DANO FÍSICO', 'bold9'), text(' que ela causa é reduzido em '), text('3', 'bold9'),
    text('. O Dano Final é '), text('8', 'bold10'), text('. O Animate adiciona '), text('8', 'bold9'),
    text(' fichas de '), text('Dano', 'italic10'), text(' à própria carta.'),
  ],
  pendingTerms: [terms.damage, terms.armor, terms.names],
});
addCandidate({
  index: 5,
  proposalText: 'Por fim, Remi chega à etapa de Continuação de seu Ataque.',
  segments: [text('Por fim, Remi chega à etapa de '), text('Continuação', 'bold10'), text(' de seu Ataque.')],
  pendingTerms: [terms.followUp, terms.attack, terms.names],
});
addCandidate({
  index: 6,
  proposalText: 'EXAUSTAR',
  segments: [text('EXAUSTAR', 'labelCallout')],
});
addCandidate({
  index: 7,
  proposalText: 'FU: Gaste 1 SP para EMPURRAR 1 contra todos os oponentes adjacentes e inflija Paralisia; FORÇA 7 + DIFERENÇA DO ACERTO.',
  segments: [
    text('FU:', 'boldCallout'), text(' Gaste ', 'body8'), text('1 SP', 'boldCallout'), text(' para ', 'body8'),
    text('EMPURRAR 1', 'boldCallout'), text(' contra todos os oponentes adjacentes e inflija ', 'body8'),
    text('Paralisia', 'italicCallout'), text('; ', 'body8'), text('FORÇA 7 + DIFERENÇA DO ACERTO.', 'boldCallout'),
  ],
  pendingTerms: [terms.followUp, terms.pushPull, terms.paralyze, terms.force, terms.difference],
});
addCandidate({
  index: 8,
  proposalText: 'A Habilidade de Continuação da Great Hammer diz: FU: gaste 1 SP para EMPURRAR 1 contra todos os oponentes adjacentes e infligir Paralisia; FORÇA 7 + DIFERENÇA DO ACERTO.',
  segments: [
    text('A Habilidade de Continuação da '), text('Great Hammer', 'italic10'), text(' diz: '), text('FU', 'bold9'), text(': Gaste '),
    text('1 SP', 'bold9'), text(' para '), text('EMPURRAR 1', 'bold10'),
    text(' contra todos os oponentes adjacentes e infligir '), text('Paralisia', 'italic10'), text('; '),
    text('FORÇA 7 + DIFERENÇA DO ACERTO.', 'bold9'),
  ],
  pendingTerms: [terms.followUp, terms.names, terms.pushPull, terms.paralyze, terms.force, terms.difference],
});
addCandidate({
  index: 9,
  proposalText: 'A Força da Habilidade Semelhante a Feitiços (7) + a DIFERENÇA DO ACERTO de Remi (4) = 11.',
  segments: [
    text('A Força da Habilidade Semelhante a Feitiços ('), text('7', 'bold9'), text(') + a '),
    text('DIFERENÇA DO ACERTO', 'bold9'), text(' de Remi ('), text('4', 'bold9'), text(') = '), text('11', 'bold9'), text('.'),
  ],
  pendingTerms: [terms.spellLike, terms.force, terms.difference],
});
addCandidate({
  index: 11,
  proposalText: 'O Animate deve fazer agora um Teste de Convicção contra a Força 11 da Habilidade Semelhante a Feitiços.',
  segments: [
    text('O Animate deve fazer agora um Teste de Convicção contra a Força '),
    text('11', 'bold9'), text(' da Habilidade Semelhante a Feitiços.'),
  ],
  pendingTerms: [terms.spellLike, 'Conviction Check → Teste de Convicção (proposta local)', terms.force, terms.names],
});
addCandidate({
  index: 13,
  proposalText: 'O Animate tira 7 e falha no Teste de Convicção: é EMPURRADO 1 espaço e recebe Paralisia. Assim se resolve o Ataque, e Remi continua seu turno.',
  segments: [
    text('O Animate tira '), text('7', 'bold9'), text(' e falha no Teste de Convicção: é Empurrado '),
    text('1', 'bold9'), text(' espaço e recebe '), text('Paralisia', 'italic10'),
    text('. Assim se resolve o Ataque, e Remi continua seu turno.'),
  ],
  pendingTerms: [terms.pushPull, terms.paralyze, terms.attack, terms.names],
});
addCandidate({
  index: 14,
  proposalText: 'Observação: Normalmente, se o Animate se afastasse de um espaço adjacente a um oponente, provocaria um Ataque de Oportunidade dele. Porém, Habilidades como Empurrar e Puxar só provocam esses Ataques de Oportunidade de Miniaturas diferentes da que usou a Habilidade. Assim, Remi não poderia realizar esse Ataque de Oportunidade.',
  segments: [
    text('Observação:', 'bold10'), text(' Normalmente, se o Animate se afastasse de um espaço adjacente a um oponente, provocaria um Ataque de Oportunidade dele. Porém, Habilidades como Empurrar e Puxar só provocam esses Ataques de Oportunidade de Miniaturas diferentes da que usou a Habilidade. Assim, Remi não poderia realizar esse Ataque de Oportunidade.'),
  ],
  pendingTerms: [terms.breakAttack, terms.pushPull, terms.names],
});
addCandidate({
  index: 41,
  proposalText: 'Usando Habilidades Semelhantes a Feitiços',
  segments: [text('Usando Habilidades Semelhantes a Feitiços', 'title18')],
  pendingTerms: [terms.spellLike],
});

const blankExceptions = [
  {
    id: exceptionIds[0], page: 55, spanKey: 'page_55_block_1__pt-BR', sourceBlockId: dom.blocks[1].id,
    category: 'source_symbol_identity', status: 'open',
    reason: 'O parágrafo dos Dados de Combate contém resultados associados a símbolos de faces de dado que não têm identidade/âncora semântica nesta página. A unidade inteira fica em branco somente no Viewer de diagnóstico.',
    diagnosticRendering: 'A unidade fica em branco somente no Viewer de diagnóstico; a fonte completa e a proposta com marcadores permanecem nesta exceção. Nenhuma tradução é publicada.',
    sourceText: `${sourceTextForBlock(dom.blocks[1])} [símbolos de face de dado não mapeados]`,
    proposedText: 'Remi rola os Dados de Combate e obtém 6 e 7. Além disso, rola 6 [símbolo de face de dado não mapeado] e 4 [símbolo de face de dado não mapeado].',
    evidence: [
      'PDF oficial, p. 55: resultados de 6 e 4 aparecem associados a ícones de combate desenhados após os números.',
      'apps/web/public/pages/page_055/page_055_dom.json: block_3 conserva texto e números, sem symbolId para as faces desenhadas.',
      'apps/web/public/pages/page_055/ não contém inline_elements.json; os desenhos permanecem no background/overlays originais.',
    ],
  },
  {
    id: exceptionIds[1], page: 55, spanKey: 'page_55_block_3__pt-BR', sourceBlockId: dom.blocks[3].id,
    category: 'source_symbol_identity', status: 'open',
    reason: 'A etapa de dano gasta duas faces de dado desenhadas, mas suas identidades/âncoras não estão modeladas como elementos semânticos nesta página. O parágrafo inteiro fica em branco apenas no diagnóstico.',
    diagnosticRendering: 'A unidade fica em branco somente no Viewer de diagnóstico; a fonte completa e a proposta com marcadores permanecem nesta exceção. Nenhuma tradução é publicada.',
    sourceText: `${sourceTextForBlock(dom.blocks[3])} [símbolo de combate após 6] [símbolo de combate após 1]`,
    proposedText: 'Durante a etapa Determinar Dano do Ataque, Remi gasta 6 [símbolo de combate não mapeado] e 1 [símbolo de combate não mapeado] para adicionar +7 DANO FÍSICO. O Dano adicionado (7), somado à diferença obtida (4), totaliza 11 de Dano até aqui.',
    evidence: [
      'PDF oficial, p. 55: os números 6 e 1 estão ligados a faces de dado específicas antes de “to add +7 PHYSICAL DMG”.',
      'apps/web/public/pages/page_055/page_055_dom.json: block_5 omite os glifos-fonte e mantém somente os espaços entre o texto.',
      'apps/web/public/pages/page_055/ não contém inline_elements.json para identificar/ancorar essas ocorrências.',
    ],
  },
];

const artworkIndices = Array.from({ length: 26 }, (_, offset) => offset + 15);
const artException = {
  id: exceptionIds[2], page: 55, spanKey: null, sourceBlockId: null,
  category: 'component_artwork', status: 'open',
  reason: 'O painel composto em inglês contém o cartão do Animate, o painel/cartão de Remi e o texto da carta Great Hammer. Esses componentes precisam de variante localizada própria; nenhum texto PT-BR é pintado sobre a arte inglesa.',
  diagnosticRendering: 'Overlay inglês preservado; as unidades de prosa editável aparecem nas propostas da página. A arte do mapa e as imagens de dado permanecem intactas.',
  sourceText: sourceTextForBlocks(artworkIndices), proposedText: '',
  evidence: [
    `Overlay fiel: ${panelOverlay.url}, bbox ${JSON.stringify(panelOverlay.bbox)}.`,
    `Blocos de texto extraídos sob o overlay: ${artworkIndices.map(index => dom.blocks[index].id).join(', ')}.`,
    'apps/web/public/pages/page_055/fidelity_overlays.json e PDF oficial, p. 55.',
  ],
};

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const exceptions = [...blankExceptions, artException];
const adapter = {
  proposalId: 'p055-spell-like-abilities-2026-10-16-v1',
  version: '1',
  title: 'Habilidades Semelhantes a Feitiços — resolução do exemplo, página 55',
  page: 55,
  status: 'pending_human_review',
  sourcePdf: path.basename(sourcePdfPath),
  sourceHashes: {
    sourcePdf: hash(sourcePdfPath), pageDom: hash(domPath), background: hash(backgroundPath), fidelityOverlays: hash(overlaysPath),
  },
  counts: {
    candidates: candidates.length,
    existingHumanTranslationsPreserved: humanRecords.length,
    priorReviewRecordsPreserved: reviewRecords.length,
    finalTranslationWrites: 0,
    openExceptions: exceptions.length,
  },
  sourceArtifacts: [
    'docs/translations/source-pages/page-055.md',
    'apps/web/public/pages/page_055/page_055_dom.json',
    'apps/web/public/pages/page_055/fidelity_overlays.json',
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
