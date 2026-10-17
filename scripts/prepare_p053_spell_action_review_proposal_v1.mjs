import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageDir = path.join(root, 'apps/web/public/pages/page_053');
const domPath = path.join(pageDir, 'page_053_dom.json');
const inlinePath = path.join(pageDir, 'inline_elements.json');
const backgroundPath = path.join(pageDir, 'background.webp');
const overlaysPath = path.join(pageDir, 'fidelity_overlays.json');
const sourcePdfPath = 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const adapterPath = path.join(root, 'docs/translations/proposals/page-053-spell-action-review-2026-10-16-v1.json');
const exceptionIds = [
  'P053-EMPOWER-UNMAPPED-BLACK-DIE',
  'P053-GORE-SHOT-CARD-EN-ARTWORK',
];
if (fs.existsSync(adapterPath)) throw new Error(`Refusing to overwrite ${adapterPath}`);

const dom = JSON.parse(fs.readFileSync(domPath, 'utf8'));
const inline = JSON.parse(fs.readFileSync(inlinePath, 'utf8')).elements ?? [];
const overlays = JSON.parse(fs.readFileSync(overlaysPath, 'utf8')).overlays ?? [];
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const relativeAdapter = path.relative(root, adapterPath).replaceAll('\\', '/');
if ((queue.sourceProposals ?? []).includes(relativeAdapter)) throw new Error('p.53 adapter already exists in the review queue.');
if ((queue.items ?? []).some(item => exceptionIds.includes(item.id))) throw new Error('A p.53 exception already exists.');
if (dom.page_number !== 53 || !Array.isArray(dom.blocks) || dom.blocks.length !== 34) {
  throw new Error('Unexpected p.53 page identity or block count.');
}
if (!fs.existsSync(sourcePdfPath)) throw new Error('Official source PDF is missing.');
const goreShotOverlay = overlays.find(item => item.region === 'gore-shot-card' && item.languageInvariant === true);
if (!goreShotOverlay) throw new Error('The audited English Gore Shot card overlay is missing.');

const database = new Database(path.join(root, 'apps/admin/apps-admin.db'), { readonly: true, fileMustExist: true });
const humanRecords = database.prepare('SELECT span_key AS spanKey FROM translations WHERE language = ?')
  .all('pt-BR').filter(record => String(record.spanKey ?? '').startsWith('page_53_'));
const reviewRecords = database.prepare('SELECT span_key AS spanKey FROM translation_reviews WHERE span_key LIKE ?')
  .all('page_53_%');
const openRequests = database.prepare("SELECT id FROM translation_review_requests WHERE page_number = ? AND status != 'completed'")
  .all(53);
database.close();
if (humanRecords.length) throw new Error(`Found ${humanRecords.length} human p.53 translations; refusing to shadow them.`);
if (reviewRecords.length) throw new Error(`Found ${reviewRecords.length} p.53 review records; refusing to shadow saved human review.`);
if (openRequests.length) throw new Error(`Found ${openRequests.length} open p.53 review requests; resolve their priority before staging agent proposals.`);

const palette = {
  body: { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' },
  body9: { font: 'OptimaLTStd', size: 9, color: '#231f20', weight: 400, style: 'normal' },
  bold: { font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal' },
  bold10: { font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', weight: 700, style: 'normal' },
  italic: { font: 'OptimaLTStd-Italic', size: 10, color: '#231f20', weight: 400, style: 'italic' },
  boldItalic: { font: 'OptimaLTStd-BoldItalic', size: 10, color: '#231f20', weight: 700, style: 'italic' },
  title12: { font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 400, style: 'normal' },
  title14: { font: 'Cinzel-Regular', size: 14, color: '#231f20', weight: 400, style: 'normal' },
  title18: { font: 'Cinzel-Regular', size: 18, color: '#231f20', weight: 400, style: 'normal' },
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
    font: 'OptimaLTStd', size: anchor.sizePt ?? 10, color: '#231f20', weight: 400, style: 'normal',
    symbolMetrics: occurrence.metrics ?? undefined,
    disableLigatures: true,
  };
};
const importantLabel = () => ({
  text: 'IMPORTANTE:', font: 'OptimaLTStd-Black', size: 10, color: '#b91d23', weight: 900,
  style: 'normal', textStrokeWidthPt: 2, textStrokeColor: '#ffffff', disableLigatures: true,
});

const candidates = [];
const addCandidate = ({ index, proposalText, segments, pendingTerms = [], managedSourceSymbols = [] }) => {
  const block = dom.blocks[index];
  if (!block) throw new Error(`Missing p.53 block index ${index}.`);
  const spanKey = `page_53_block_${index}__pt-BR`;
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

const p = {
  spell: 'Spell → Feitiço (glossário oficial)',
  cast: 'cast → conjurar (glossário oficial)',
  castingDie: 'Casting Die → Dado de Conjuração (glossário oficial)',
  conviction: 'Conviction → Convicção (glossário oficial)',
  empower: 'Empower → Fortalecer; forma ainda pendente de canonização humana',
  spellLike: 'Spell-Like Ability → Habilidade Semelhante a Feitiço (proposta local; canon pendente)',
  force: 'Force / Force Pool / Force Value → Força / Reserva de Força / Valor de Força (formas propostas)',
  convictionCheck: 'Conviction Check → Teste de Convicção (forma proposta)',
  figure: 'figure → Miniatura (glossário oficial)',
  action: 'Action → Ação (capitalização mecânica ainda requer revisão)',
};

addCandidate({
  index: 0, proposalText: 'Etapas para conjurar um Feitiço',
  segments: [text('Etapas para conjurar um Feitiço', 'title12')],
  pendingTerms: [p.cast, p.spell],
});
addCandidate({
  index: 1,
  proposalText: 'Muitas Habilidades permitem que uma Miniatura conjure Feitiços. Sempre que uma Miniatura usa uma Habilidade que instrui a “Conjurar FEITIÇO (X)”, ela realiza uma Ação de Feitiço para determinar se o Feitiço afetou o alvo. Sempre que um Feitiço é indicado, a Miniatura que o conjura segue estas etapas.',
  segments: [
    text('Muitas Habilidades permitem que uma Miniatura conjure Feitiços. Sempre que uma Miniatura usa uma Habilidade que instrui a “Conjurar '),
    text('FEITIÇO (X)', 'bold'),
    text('”, ela realiza uma Ação de Feitiço para determinar se o Feitiço afetou o alvo. Sempre que um Feitiço é indicado, a Miniatura que o conjura segue estas etapas.'),
  ],
  pendingTerms: [p.figure, p.spell, p.cast, 'Spell Action → Ação de Feitiço; forma local, revisar caixa do termo mecânico'],
});
addCandidate({
  index: 2,
  proposalText: '1. ESCOLHER O(S) ALVO(S): Selecione uma Miniatura dentro da SOI como alvo. Algumas Habilidades têm parâmetros específicos de alvo que podem substituir esta regra ou permitir que você escolha mais de 1 Miniatura. Veja SOI, pág. 43.',
  segments: [
    text('1.  ', 'bold'), text('ESCOLHER O(S) ALVO(S): ', 'bold'),
    text('Selecione uma Miniatura dentro da '), text('SOI', 'bold'),
    text(' como alvo. Algumas Habilidades têm parâmetros específicos de alvo que podem substituir esta regra ou permitir que você escolha mais de '),
    text('1', 'bold'), text(' Miniatura. Veja '), text('SOI', 'boldItalic'), text(', pág. 43.'),
  ],
  pendingTerms: [p.figure, 'SOI → Sphere of Influence; manter sigla e revisar nome por extenso'],
});
addCandidate({
  index: 3,
  proposalText: '2. DETERMINAR A FORÇA: A Força de um FEITIÇO determina o grau de dificuldade para resistir aos efeitos do Feitiço.',
  segments: [
    text('2.  ', 'bold'), text('DETERMINAR A FORÇA: ', 'bold'), text('A Força de um '),
    text('FEITIÇO', 'bold'), text(' determina o grau de dificuldade para resistir aos efeitos do Feitiço.'),
  ],
  pendingTerms: [p.spell, p.force],
});
addCandidate({
  index: 4,
  proposalText: 'a. MONTAR A RESERVA DE FORÇA: Uma Reserva de Força consiste no Dado de Conjuração ou no Aprimoramento impresso da Miniatura.',
  segments: [
    text('a.  ', 'bold'), text('MONTAR A RESERVA DE FORÇA: ', 'bold'),
    text('Uma Reserva de Força consiste no Dado de Conjuração ou no Aprimoramento impresso da Miniatura.'),
  ],
  pendingTerms: [p.force, p.castingDie, p.figure, 'Upgrade → Aprimoramento (forma contextual proposta)'],
});
addCandidate({
  index: 6,
  proposalText: 'Combatentes Inteligentes só podem FORTALECER se tiverem uma Habilidade que permita isso especificamente. Veja Fortalecer, pág. 52.',
  segments: [
    text('Combatentes Inteligentes só podem '), text('FORTALECER', 'bold'),
    text(' se tiverem uma Habilidade que permita isso especificamente. Veja '), text('Fortalecer', 'boldItalic'), text(', pág. 52.'),
  ],
  pendingTerms: [p.empower, 'Intelligent Combatants → Combatentes Inteligentes (uso existente; canon global pendente)'],
});
addCandidate({
  index: 7,
  proposalText: 'c. ROLAR PARA DETERMINAR SUA FORÇA: Por fim, a Miniatura que conjura o FEITIÇO rola seu Dado de Conjuração e o Dado de Fortalecimento, se aplicável, e soma ao resultado o valor de X impresso no Feitiço (geralmente 6).',
  segments: [
    text('c.  ', 'bold'), text('ROLAR PARA DETERMINAR SUA FORÇA: ', 'bold'),
    text('Por fim, a Miniatura que conjura o '), text('FEITIÇO', 'bold'),
    text(' rola seu Dado de Conjuração e o Dado de Fortalecimento, se aplicável, e soma ao resultado o valor de X impresso no Feitiço (geralmente 6).'),
  ],
  pendingTerms: [p.cast, p.spell, p.castingDie, p.empower, p.force],
});
addCandidate({
  index: 8,
  proposalText: '3. CADA ALVO FAZ UM TESTE DE CONVICÇÃO: O Cartão de Combatente de cada Miniatura mostra seus Dados de Convicção. Esses 2 dados determinam o quanto uma Miniatura resiste a Feitiços. Nesta etapa, cada alvo do Feitiço faz um Teste de Convicção separado para resistir aos efeitos. Para isso, cada Miniatura alvo rola os dados de Convicção impressos em seu cartão. Se o resultado total for igual ou maior que o Valor de Força do Feitiço, essa Miniatura resiste ao Feitiço. Se for menor, os efeitos impressos do Feitiço ocorrem. A Ação de Feitiço termina depois que todos os alvos fizerem seu Teste de Convicção.',
  segments: [
    text('3.  ', 'bold'), text('CADA ALVO FAZ UM TESTE DE CONVICÇÃO: ', 'bold'),
    text('O Cartão de Combatente de cada Miniatura mostra seus Dados de Convicção. Esses '), text('2', 'bold'),
    text(' dados determinam o quanto uma Miniatura resiste a Feitiços. Nesta etapa, cada alvo do Feitiço faz um Teste de Convicção separado para resistir aos efeitos.\n\nPara isso, cada Miniatura alvo rola os dados de Convicção impressos em seu cartão. Se o resultado total for igual ou maior que o Valor de Força do Feitiço, essa Miniatura resiste ao Feitiço. Se for menor, os efeitos impressos do Feitiço ocorrem. A Ação de Feitiço termina depois que todos os alvos fizerem seu Teste de Convicção.'),
  ],
  pendingTerms: [p.figure, p.spell, p.conviction, p.convictionCheck, p.force, 'Combatant Card → Cartão de Combatente (forma proposta)'],
});
addCandidate({
  index: 9,
  proposalText: '4. RESOLVER O EFEITO DO FEITIÇO: Cada alvo que falhou no Teste de Convicção resolve separadamente os efeitos do Feitiço, na ordem em que fez o teste. Os efeitos do Feitiço estão descritos na Habilidade que iniciou a Ação de Feitiço, depois de “Conjurar FEITIÇO (X)”.',
  segments: [
    text('4.  ', 'bold'), text('RESOLVER O EFEITO DO FEITIÇO: ', 'bold'),
    text('Cada alvo que falhou no Teste de Convicção resolve separadamente os efeitos do Feitiço, na ordem em que fez o teste. Os efeitos do Feitiço estão descritos na Habilidade que iniciou a Ação de Feitiço, depois de “Conjurar '),
    text('FEITIÇO (X)', 'bold'), text('”.'),
  ],
  pendingTerms: [p.spell, p.convictionCheck, p.action, 'Spell Action → Ação de Feitiço; forma local'],
});
addCandidate({
  index: 10,
  proposalText: 'REGRAS IMPORTANTES SOBRE FEITIÇOS:\n• Itens e Habilidades podem aprimorar os dados de Conjuração e de Convicção de um Aventureiro para aumentar suas chances de infligir e resistir a Feitiços. Veja Aprimoramentos de Convicção e Conjuração, pág. 33.\n• A Ação de Feitiço não é uma Ação Padrão e só pode ser realizada quando uma Habilidade a solicitar especificamente por meio da Tag FEITIÇO.\n• Habilidades que usam a Ação de Feitiço não exigem Ícones de Arma específicos.\n• Feitiços compartilham um tipo especial de Alcance e Linha de Visão chamado Esfera de Influência (SOI). Veja Esfera de Influência (SOI), pág. 43.\n• Feitiços têm etapas próprias, que uma Miniatura deve seguir quando instruída a “Conjurar FEITIÇO (X)”.\n• O Valor de Força de um Feitiço deve ser superado pelo alvo em um Teste de Convicção para resistir aos efeitos.\n• Aliados podem escolher falhar em Testes de Convicção quando forem alvos de outros aliados.',
  segments: [
    text('REGRAS IMPORTANTES SOBRE FEITIÇOS:', 'bold'),
    text('\n• Itens e Habilidades podem aprimorar os dados de Conjuração e de Convicção de um Aventureiro para aumentar suas chances de infligir e resistir a Feitiços. Veja Aprimoramentos de Convicção e Conjuração, pág. 33.'),
    text('\n• A Ação de Feitiço não é uma Ação Padrão e só pode ser realizada quando uma Habilidade a solicitar especificamente por meio da Tag '), text('FEITIÇO', 'bold'),
    text('.\n• Habilidades que usam a Ação de Feitiço não exigem Ícones de Arma específicos.'),
    text('\n• Feitiços compartilham um tipo especial de Alcance e Linha de Visão chamado Esfera de Influência ('), text('SOI', 'bold'), text('). Veja '),
    text('Esfera de Influência (SOI)', 'boldItalic'), text(', pág. 43.'),
    text('\n• Feitiços têm etapas próprias, que uma Miniatura deve seguir quando instruída a “Conjurar '), text('FEITIÇO (X)', 'bold'), text('”.'),
    text('\n• O Valor de Força de um Feitiço deve ser superado pelo alvo em um Teste de Convicção para resistir aos efeitos.'),
    text('\n• Aliados podem escolher falhar em Testes de Convicção quando forem alvos de outros aliados.'),
  ],
  pendingTerms: [p.spell, p.conviction, p.convictionCheck, p.force, 'Standard Action → Ação Padrão (forma proposta)', 'Weapon Icon → Ícone de Arma (forma proposta)', 'Sphere of Influence → Esfera de Influência (forma proposta)'],
});
addCandidate({
  index: 11, proposalText: 'Habilidades Semelhantes a Feitiços',
  segments: [text('Habilidades Semelhantes a Feitiços', 'title12')],
  pendingTerms: [p.spellLike],
});
addCandidate({
  index: 12,
  proposalText: 'Muitas Habilidades têm FORÇA (X) impressa nelas. Elas são chamadas de Habilidades Semelhantes a Feitiços. Quando um Aventureiro usa uma Habilidade ou Habilidade de Continuação com um Valor de Força indicado, segue as etapas abaixo.',
  segments: [
    text('Muitas Habilidades têm '), text('FORÇA (X)', 'bold'), text(' impressa nelas. Elas são chamadas de Habilidades Semelhantes a Feitiços. Quando um Aventureiro usa uma Habilidade ou Habilidade de Continuação com um Valor de Força indicado, segue as etapas abaixo.'),
  ],
  pendingTerms: [p.spellLike, p.force, 'Follow Up Ability → Habilidade de Continuação (forma proposta)'],
});
addCandidate({
  index: 13,
  proposalText: '1. IDENTIFICAR OS ALVOS: Habilidades Semelhantes a Feitiços impressas em Habilidades de Continuação sempre devem ser usadas contra a Miniatura que foi alvo do Ataque. Habilidades Semelhantes a Feitiços usadas sob outras Condições sempre especificam seu(s) alvo(s).',
  segments: [
    text('1.  ', 'bold'), text('IDENTIFICAR OS ALVOS: ', 'bold'),
    text('Habilidades Semelhantes a Feitiços impressas em Habilidades de Continuação sempre devem ser usadas contra a Miniatura que foi alvo do Ataque. Habilidades Semelhantes a Feitiços usadas sob outras Condições sempre especificam seu(s) alvo(s).'),
  ],
  pendingTerms: [p.spellLike, p.figure, 'Follow Up Ability → Habilidade de Continuação (forma proposta)'],
});
addCandidate({
  index: 14,
  proposalText: '2. IDENTIFICAR A FORÇA: A Força de uma Habilidade Semelhante a Feitiço sempre é indicada de uma das seguintes formas.',
  segments: [text('2.  ', 'bold'), text('IDENTIFICAR A FORÇA: ', 'bold'), text('A Força de uma Habilidade Semelhante a Feitiço sempre é indicada de uma das seguintes formas.')],
  pendingTerms: [p.spellLike, p.force],
});
addCandidate({
  index: 15,
  proposalText: 'a. FORÇA (X) + DIFERENÇA DO ACERTO: Essas Habilidades Semelhantes a Feitiços representam efeitos que ocorrem após Ataques com Armas e só aparecem em Habilidades de Continuação. Para determinar a Força da Habilidade Semelhante a Feitiço, a Miniatura que fez o Ataque soma à Força impressa na Habilidade a diferença pela qual seu Ataque acertou o alvo.',
  segments: [
    text('a.  ', 'bold'), text('FORÇA (X) + DIFERENÇA DO ACERTO: ', 'bold'),
    text('Essas Habilidades Semelhantes a Feitiços representam efeitos que ocorrem após Ataques com Armas e só aparecem em Habilidades de Continuação. Para determinar a Força da Habilidade Semelhante a Feitiço, a Miniatura que fez o Ataque soma à Força impressa na Habilidade a diferença pela qual seu Ataque acertou o alvo.'),
  ],
  pendingTerms: [p.spellLike, p.force, p.figure, 'Follow Up Ability → Habilidade de Continuação (forma proposta)', 'Difference Hit → Diferença do Acerto (forma proposta)'],
});
addCandidate({
  index: 16,
  proposalText: 'b. FORÇA (X): Se a Habilidade não indicar + DIFERENÇA DO ACERTO, a Miniatura que a usa não adiciona nada ao Valor de Força.',
  segments: [text('b.  ', 'bold'), text('FORÇA (X): ', 'bold'), text('Se a Habilidade não indicar '), text('+ DIFERENÇA DO ACERTO', 'bold'), text(', a Miniatura que a usa não adiciona nada ao Valor de Força.')],
  pendingTerms: [p.figure, p.force, 'Difference Hit → Diferença do Acerto (forma proposta)'],
});
addCandidate({
  index: 17,
  proposalText: 'IMPORTANTE: Você não pode FORTALECER Habilidades Semelhantes a Feitiços.',
  segments: [sourceSymbol('tag.important.icon', 'block_37', 'line_37_0'), importantLabel(), text(' Você não pode '), text('FORTALECER', 'bold'), text(' Habilidades Semelhantes a Feitiços.')],
  managedSourceSymbols: ['tag.important.icon'],
  pendingTerms: [p.empower, p.spellLike],
});
addCandidate({
  index: 18,
  proposalText: '3. CADA ALVO FAZ UM TESTE DE CONVICÇÃO: Cada alvo deve fazer um Teste de Convicção separado, conforme detalhado na etapa 3 da Ação de Feitiço.',
  segments: [text('3.  ', 'bold'), text('CADA ALVO FAZ UM TESTE DE CONVICÇÃO: ', 'bold'), text('Cada alvo deve fazer um Teste de Convicção separado, conforme detalhado na etapa 3 da Ação de Feitiço.')],
  pendingTerms: [p.convictionCheck, 'Spell Action → Ação de Feitiço (forma proposta)'],
});
addCandidate({
  index: 19,
  proposalText: '4. RESOLVER O EFEITO DA HABILIDADE: Se um alvo da Habilidade Semelhante a Feitiço falhou no Teste de Convicção, sofre o efeito indicado pela Habilidade.',
  segments: [text('4.  ', 'bold'), text('RESOLVER O EFEITO DA HABILIDADE: ', 'bold'), text('Se um alvo da Habilidade Semelhante a Feitiço falhou no Teste de Convicção, sofre o efeito indicado pela Habilidade.')],
  pendingTerms: [p.spellLike, p.convictionCheck],
});
addCandidate({
  index: 20,
  proposalText: 'IMPORTANTE: Habilidades Semelhantes a Feitiços não contam como uma Ação.',
  segments: [sourceSymbol('tag.important.icon', 'block_40', 'line_40_0'), importantLabel(), text(' Habilidades Semelhantes a Feitiços não contam como uma Ação.')],
  managedSourceSymbols: ['tag.important.icon'],
  pendingTerms: [p.spellLike, p.action],
});
addCandidate({
  index: 22,
  proposalText: 'Exemplo de Feitiço: Gore Shot é uma Disciplina sem custo de SP. Ao ser Exaustada, permite que um Aventureiro conjure FEITIÇO 6.',
  segments: [text('Exemplo de Feitiço: ', 'bold10'), text('Gore Shot', 'boldItalic'), text(' é uma Disciplina sem custo de '), text('SP', 'bold'), text('. Ao ser Exaustada, permite que um Aventureiro conjure '), text('FEITIÇO 6', 'bold'), text('.')],
  pendingTerms: [p.spell, p.cast, 'Exhaust → Exaustar (decisão humana registrada)', 'Gore Shot → nome próprio de Disciplina; preservar até haver canon'],
});
addCandidate({
  index: 23,
  proposalText: 'Exemplo de Habilidade Semelhante a Feitiço: A Habilidade do Great Hammer permite que um Aventureiro mova alvos que falharem no Teste de Convicção contra o Valor de Força impresso nela. Como é uma Habilidade Semelhante a Feitiço, não conta como Ação.',
  segments: [text('Exemplo de Habilidade Semelhante a Feitiço: ', 'bold10'), text('A Habilidade do '), text('Great Hammer', 'italic'), text(' permite que um Aventureiro mova alvos que falharem no Teste de Convicção contra o Valor de Força impresso nela. Como é uma Habilidade Semelhante a Feitiço, não conta como Ação.')],
  pendingTerms: [p.spellLike, p.convictionCheck, p.force, p.action, 'Great Hammer → nome próprio de Arma; preservar até haver canon'],
});
addCandidate({
  index: 24, proposalText: 'A Ação de Feitiço',
  segments: [text('A Ação de Feitiço', 'title18')],
  pendingTerms: ['Spell Action → Ação de Feitiço (forma local; revisar canon editorial)'],
});
addCandidate({
  index: 32, proposalText: 'Feitiços vs. Habilidades Semelhantes a Feitiços',
  segments: [text('Feitiços vs. Habilidades Semelhantes a Feitiços', 'title14')],
  pendingTerms: [p.spell, p.spellLike],
});

const unmappedBlock = dom.blocks[5];
const unmappedException = {
  id: exceptionIds[0],
  page: 53,
  spanKey: 'page_53_block_5__pt-BR',
  sourceBlockId: unmappedBlock.id,
  category: 'source_symbol_identity',
  status: 'open',
  reason: 'O PDF mostra um ícone de dado preto depois de BLACK na regra EMPOWER, mas a extração e o sidecar de p. 53 não registram esse símbolo. A unidade PT-BR fica em branco no diagnóstico até a ocorrência semântica ser incorporada com a geometria correta.',
  diagnosticRendering: 'A unidade fica em branco somente no Viewer de diagnóstico; a fonte completa e a proposta com marcador permanecem nesta exceção. Nenhuma tradução é publicada.',
  sourceText: sourceTextForBlock(unmappedBlock),
  proposedText: 'b. FORTALECER: Ao conjurar um FEITIÇO, um Aventureiro pode escolher gastar 1 SP para FORTALECER o Feitiço. Ao Fortalecer um Feitiço, adicione o dado PRETO [ícone de dado não mapeado] à Reserva de Força.',
  diagnosticBlank: true,
  evidence: [
    'PDF oficial, p. 53: a linha após “add the BLACK” contém um ícone de dado preto visível.',
    'apps/web/public/pages/page_053/inline_elements.json: não há ocorrência de dice.black ancorada em block_20.',
    'apps/web/public/pages/page_053/page_053_dom.json: block_20 conserva o texto, mas não contém um symbolId para o ícone.',
  ],
};
const cardBlocks = [25, 26, 27, 28, 29, 30, 31].map(index => dom.blocks[index]);
const cardSource = cardBlocks.map(sourceTextForBlock).filter(Boolean).join('\n');
const cardException = {
  id: exceptionIds[1],
  page: 53,
  spanKey: null,
  sourceBlockId: null,
  category: 'component_artwork',
  status: 'open',
  reason: 'O texto da carta Gore Shot permanece incorporado à arte inglesa preservada como overlay fiel. A localização exige uma variante PT-BR da carta, mantendo ícones, siglas, curvas e hierarquia visual.',
  diagnosticRendering: 'Overlay original em inglês preservado; sem texto PT-BR fictício sobre a carta. A prosa explicativa externa à carta está nas propostas da mesma página.',
  sourceText: cardSource,
  proposedText: '',
  evidence: [
    `Overlay fiel: ${goreShotOverlay.url}, região ${goreShotOverlay.region}, bbox ${JSON.stringify(goreShotOverlay.bbox)}.`,
    'Blocos 25–31 do DOM identificam os textos extraídos da carta, mas a imagem de componente cobre esses spans no Viewer.',
    'Arquivo raster oficial: apps/web/public/pages/page_053/fidelity-overlay-component-gore-shot-card.png.',
  ],
};

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const adapter = {
  proposalId: 'p053-spell-action-2026-10-16-v1',
  version: '1',
  title: 'Ação de Feitiço e Habilidades Semelhantes — página 53',
  page: 53,
  status: 'pending_human_review',
  sourcePdf: path.basename(sourcePdfPath),
  sourceHashes: {
    sourcePdf: hash(sourcePdfPath),
    pageDom: hash(domPath),
    inlineElements: hash(inlinePath),
    background: hash(backgroundPath),
    fidelityOverlays: hash(overlaysPath),
  },
  counts: {
    candidates: candidates.length,
    existingHumanTranslationsPreserved: humanRecords.length,
    priorReviewRecordsPreserved: reviewRecords.length,
    finalTranslationWrites: 0,
    openExceptions: 2,
  },
  sourceArtifacts: [
    'docs/translations/source-pages/page-053.md',
    'apps/web/public/pages/page_053/inline_elements.json',
    'apps/web/public/pages/page_053/page_053_dom.json',
    'apps/web/public/pages/page_053/fidelity_overlays.json',
  ],
  candidates,
};

queue.sourceProposals.push(relativeAdapter);
queue.items.push(unmappedException, cardException);
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
  technicalStatus: 'not_recorded pending real Viewer inspection',
}, null, 2));
