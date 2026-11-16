#!/usr/bin/env node
/** Build an immutable, read-only full editable-text proposal for printed p.19. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const page = 19;
const pageId = '019';
const language = 'pt-BR';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const pageDir = resolve(root, 'apps/web/public/pages', `page_${pageId}`);
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p019-full-page-proposal-v1');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', `page_${pageId}`);
const proposalPath = resolve(root, 'docs/translations/proposals/page-019-full-page-proposal-2026-10-16-v1.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-019-full-page-proposal-2026-10-16-v1.md');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const normalize = value => String(value ?? '').replace(/[\s\u00a0]+/gu, ' ').trim();
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  await mkdir(dirname(path), { recursive: true });
  try {
    assert.deepEqual(await readFile(path), bytes, `Refusing to overwrite a different artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
const writeJson = (path, value) => immutableWrite(path, `${JSON.stringify(value, null, 2)}\n`);
const base = (text, size = 10, extra = {}) => ({
  text, font: 'OptimaLTStd', size, color: '#231f20', weight: 400, style: 'normal',
  disableLigatures: true, ...extra,
});
const bold = (text, size = 10, extra = {}) => base(text, size, { font: 'OptimaLTStd-Bold', weight: 700, ...extra });
const italic = (text, size = 10, extra = {}) => base(text, size, { font: 'OptimaLTStd-Italic', style: 'italic', ...extra });
const boldItalic = (text, size = 10, extra = {}) => base(text, size, {
  font: 'OptimaLTStd-BoldItalic', weight: 700, style: 'italic', ...extra,
});
const cinzel = (text, size, extra = {}) => ({
  text, font: 'Cinzel-Regular', size, color: '#231f20', weight: 700, style: 'normal',
  disableLigatures: true, ...extra,
});
const tokenWhite = (text, extra = {}) => ({
  text, font: 'Cinzel-Black', size: 11.7, color: '#ffffff', weight: 900, style: 'normal',
  disableLigatures: true, ...extra,
});
const importantIcon = {
  text: '\uFFFC', symbolId: 'tag.important.icon',
  symbolMetrics: { widthEm: 1, heightEm: 1, verticalAlignEm: 0.2 },
  sourceRendering: 'semantic-inline', font: 'OptimaLTStd', size: 10,
  color: '#231f20', weight: 400, style: 'normal', disableLigatures: true,
};
const importantLabel = {
  text: 'IMPORTANTE:', font: 'OptimaLTStd-Black', size: 10, color: '#b91d23', weight: 900,
  style: 'normal', textStrokeWidthPt: 2, textStrokeColor: '#ffffff', disableLigatures: true,
};
const importantPrefix = () => [importantIcon, importantLabel, base(' ')];

const drafts = [
  {
    blockIndex: 0, blockId: 'block_17', target: 'Surgimento', lineHeight: 1,
    segments: [cinzel('Surgimento', 11)],
    pendingTerms: ['Spawning → Surgimento: forma candidata para o título; a forma aprovada do glossário é Spawn → Surgir/Faça Surgir.'],
  },
  {
    blockIndex: 1, blockId: 'block_19', target: 'Os Encontros podem instruir os jogadores a fazer surgir miniaturas ou outros componentes. Nesses casos, coloque nos espaços indicados pelo texto até o número instruído de componentes (ou o máximo possível). Miniaturas e componentes que surjam por instrução devem ser colocados na ordem em que são indicados.', lineHeight: 1.1,
    segments: [base('Os Encontros podem instruir os jogadores a fazer surgir miniaturas ou outros componentes. Nesses casos, coloque nos espaços indicados pelo texto até o número instruído de componentes (ou o máximo possível). Miniaturas e componentes que surjam por instrução devem ser colocados na ordem em que são indicados.')],
    pendingTerms: ['Spawn → fazer surgir/surgir usa o glossário; revisar a construção impessoal “número instruído”.', 'Component(s) → componente(s) é candidato contextual.'],
  },
  {
    blockIndex: 2, blockId: 'block_20', target: 'Exemplo: Se a instrução disser “Faça Surgir um Cave Sickle e um Water Loa”, faça surgir primeiro o Cave Sickle.', lineHeight: 1.1,
    segments: [bold('Exemplo: '), base('Se a instrução disser “Faça Surgir um Cave Sickle e um Water Loa”, faça surgir primeiro o Cave Sickle.')],
    pendingTerms: ['Cave Sickle e Water Loa são nomes próprios mantidos em inglês; revisar a decisão editorial.', 'O original traz “a Cave Sickles”, mas a frase seguinte especifica um Cave Sickle; a proposta expressa o singular usado pela regra.'],
  },
  {
    blockIndex: 3, blockId: 'block_21', unitId: 'p19-block-21-paragraph-1', target: 'Quando um Combatente surgir, os jogadores colocam sua miniatura na mesa conforme indicado pelo texto ou pelo Diagrama.', lineHeight: 1.1,
    segments: [base('Quando um Combatente surgir, os jogadores colocam sua miniatura na mesa conforme indicado pelo texto ou pelo Diagrama.')],
    pendingTerms: ['Combatant → Combatente é forma de proposta local; Diagram → Diagrama.'],
  },
  {
    blockIndex: 3, blockId: 'block_21', unitId: 'p19-block-21-paragraph-2', target: 'Se um jogador fizer surgir um Combatente por meio de um Totem ou de outra forma, e a Carta de Iniciativa dele ainda não estiver na Trilha de Iniciativa, coloque-a imediatamente após a Carta de Iniciativa da miniatura cujo turno está em andamento. Se não estiver claro qual é o turno, coloque-a no fim da Trilha. A miniatura terá seu turno na próxima vez em que sua Carta de Iniciativa normalmente indicar o início dele.', lineHeight: 1.1,
    segments: [base('Se um jogador fizer surgir um Combatente por meio de um Totem ou de outra forma, e a Carta de Iniciativa dele ainda não estiver na Trilha de Iniciativa, coloque-a imediatamente após a Carta de Iniciativa da miniatura cujo turno está em andamento. Se não estiver claro qual é o turno, coloque-a no fim da Trilha. A miniatura terá seu turno na próxima vez em que sua Carta de Iniciativa normalmente indicar o início dele.')],
    pendingTerms: ['Combatant, Initiative Card, Initiative Track e Figure → Combatente, Carta de Iniciativa, Trilha de Iniciativa e miniatura são formas propostas, não novas aprovações globais.'],
  },
  {
    blockIndex: 3, blockId: 'block_21', unitId: 'p19-block-21-paragraph-3', target: 'Alguns Combatentes têm várias Cartas de Iniciativa. Se elas tiverem o mesmo Número do Grupo e/ou nome, coloque todas as cartas correspondentes na Trilha como descrito acima. As Cartas de Iniciativa de cada Combatente sempre correspondem ao seu nome e ao(s) Número(s) do Grupo. Consulte Números de Ativação e Grupos, pág. 56.', lineHeight: 1.1,
    segments: [base('Alguns Combatentes têm várias Cartas de Iniciativa. Se elas tiverem o mesmo Número do Grupo e/ou nome, coloque todas as cartas correspondentes na Trilha como descrito acima. As Cartas de Iniciativa de cada Combatente sempre correspondem ao seu nome e ao(s) Número(s) do Grupo. Consulte '), boldItalic('Números de Ativação e Grupos'), base(', pág. 56.')],
    pendingTerms: ['Group Number → Número do Grupo e Activation Numbers And Groups → Números de Ativação e Grupos são candidatos locais; revisar o título oficial da p.56.'],
  },
  {
    blockIndex: 3, blockId: 'block_21', unitId: 'p19-block-21-paragraph-4', target: 'Salvo indicação expressa em contrário, os Combatentes que surgirem são sempre considerados oponentes.', lineHeight: 1.1,
    segments: [base('Salvo indicação expressa em contrário, os Combatentes que surgirem são sempre considerados oponentes.')],
    pendingTerms: ['Opponent → oponente é forma contextual proposta.'],
  },
  {
    blockIndex: 4, blockId: 'block_22', target: 'IMPORTANTE: Se outra miniatura ocupar o espaço e impedir o surgimento de uma miniatura, faça-a surgir no espaço desocupado mais próximo que não seja perigoso. Consulte Miniaturas de Base Grande para ver as exceções, pág. 71.', lineHeight: 1.1, symbols: ['tag.important.icon'],
    segments: [...importantPrefix(), base('Se outra miniatura ocupar o espaço e impedir o surgimento de uma miniatura, faça-a surgir no espaço desocupado mais próximo que não seja '), bold('perigoso'), base('. Consulte '), boldItalic('Miniaturas de Base Grande'), base(' para ver as exceções, pág. 71.')],
    pendingTerms: ['Dangerous → perigoso e Large Based Figures → Miniaturas de Base Grande são formas locais; revisar contra a terminologia das p.70–71.'],
  },
  {
    blockIndex: 5, blockId: 'block_23', target: 'IMPORTANTE: Ao fazer surgir miniaturas do mesmo Grupo, comece sempre pela disponível de menor número. Exemplo: se as Cave Sickles 2 e 3 já estiverem na mesa e a instrução pedir mais duas, faça surgir as Cave Sickles 1 e 4.', lineHeight: 1.1, symbols: ['tag.important.icon'],
    segments: [...importantPrefix(), base('Ao fazer surgir miniaturas do mesmo Grupo, comece sempre pela disponível de menor número. Exemplo: se as Cave Sickles '), bold('2'), base(' e '), bold('3'), base(' já estiverem na mesa e a instrução pedir mais duas, faça surgir as Cave Sickles '), bold('1'), base(' e '), bold('4'), base('.')],
    pendingTerms: ['Cave Sickle permanece como nome de criatura em inglês; Group → Grupo e Figure → miniatura seguem candidatos contextuais.'],
  },
  {
    blockIndex: 6, blockId: 'block_24', target: 'IMPORTANTE: Os Combatentes têm o LVL de Saque impresso na frente e no verso. Quando uma instrução mandar fazer surgir Combatentes durante um Encontro, use sempre o Nível de Saque indicado nas cartas que corresponder ao Nível de Saque do Encontro atual. Consulte Alternativas, Variações e Nível de Saque, pág. 79.', lineHeight: 1.1, symbols: ['tag.important.icon'],
    segments: [...importantPrefix(), base('Os Combatentes têm o '), bold('LVL'), base(' de Saque impresso na frente '), bold('e'), base(' no verso. Quando uma instrução mandar fazer surgir Combatentes durante um Encontro, use sempre o Nível de Saque indicado nas cartas que corresponder ao Nível de Saque do Encontro atual. Consulte '), boldItalic('Alternativas, Variações e Nível de Saque'), base(', pág. 79.')],
    pendingTerms: ['Loot LVL → Nível de Saque (LVL) e Alternate, Variations, and Loot LVL → Alternativas, Variações e Nível de Saque são candidatos de título, pendentes de revisão contra a p.79.'],
  },
  {
    blockIndex: 7, blockId: 'block_25', target: 'Surgimento de Combatentes de História', lineHeight: 1,
    segments: [cinzel('Surgimento de Combatentes de História', 12)],
    pendingTerms: ['Story Combatants → Combatentes de História é forma contextual proposta.'],
  },
  {
    blockIndex: 8, blockId: 'block_27', unitId: 'p19-block-27-paragraph-1', target: 'Middara tem muitos Combatentes que representam personagens da narrativa. Em geral, são Cartas Ocultas de chefes, Espers ou personagens aliados ou adversários dos jogadores. Essas Cartas de Combatente sempre têm nomes únicos e pelo menos uma Carta de Iniciativa correspondente. Elas representam miniaturas únicas ou miniaturas de papel exclusivas. Assim, salvo quando uma regra exigir, não é preciso controlar esses componentes com Presilhas de Base Coloridas ou Números de Ativação.', lineHeight: 1.1,
    segments: [base('Middara tem muitos Combatentes que representam personagens da narrativa. Em geral, são Cartas Ocultas de chefes, Espers ou personagens aliados ou adversários dos jogadores. Essas Cartas de Combatente sempre têm nomes únicos e pelo menos uma Carta de Iniciativa correspondente. Elas representam miniaturas únicas ou miniaturas de papel exclusivas. Assim, salvo quando uma regra exigir, não é preciso controlar esses componentes com Presilhas de Base Coloridas ou Números de Ativação.')],
    pendingTerms: ['Hidden Cards → Cartas Ocultas usa decisão terminológica prévia; Colored Base Snaps → Presilhas de Base Coloridas é candidato sem decisão global.', 'O original contém “Combatant’s” e “In anycase”; a proposta traduz o sentido sem reproduzir erros tipográficos.'],
  },
  {
    blockIndex: 8, blockId: 'block_27', unitId: 'p19-block-27-paragraph-2', target: 'Combatentes de História não funcionam de modo diferente dos demais Combatentes que surgem. Ao receber instruções para fazer surgir um deles, use todas as regras acima.', lineHeight: 1.1,
    segments: [base('Combatentes de História não funcionam de modo diferente dos demais Combatentes que surgem. Ao receber instruções para fazer surgir um deles, use todas as regras acima.')],
    pendingTerms: ['Story Combatant → Combatente de História permanece forma contextual proposta.'],
  },
  {
    blockIndex: 9, blockId: 'block_28', target: 'Diagramas', lineHeight: 1,
    segments: [cinzel('Diagramas', 12)], pendingTerms: [],
  },
  {
    blockIndex: 10, blockId: 'block_32', unitId: 'p19-block-32-paragraph-1', target: 'Às vezes, os Encontros instruem os jogadores a consultar um Diagrama para revelar informações ocultas especiais ou determinar como os componentes surgem. Nesses casos, consultam o Livro de Diagramas, independentemente do Modo de Jogo.', lineHeight: 1.1,
    segments: [base('Às vezes, os Encontros instruem os jogadores a consultar um '), bold('Diagrama'), base(' para revelar informações ocultas especiais ou determinar como os componentes surgem. Nesses casos, consultam o Livro de Diagramas, independentemente do Modo de Jogo.')],
    pendingTerms: ['Game Mode → Modo de Jogo é candidato contextual.'],
  },
  {
    blockIndex: 10, blockId: 'block_32', unitId: 'p19-block-32-paragraph-2', target: 'Encontros de Jogos Base (como Unintentional Malum: Ato 1), Pacotes de Aventura ou Pacotes de Recompensa indicam os Diagramas dos Livros de Diagramas correspondentes.', lineHeight: 1.1,
    segments: [base('Encontros de Jogos Base (como '), boldItalic('Unintentional Malum: Ato 1'), base('), Pacotes de Aventura ou Pacotes de Recompensa indicam os Diagramas dos Livros de Diagramas correspondentes.')],
    pendingTerms: ['Base Game, Adventure Pack e Bounty Pack → Jogo Base, Pacote de Aventura e Pacote de Recompensa são formas locais; o nome Unintentional Malum foi preservado.'],
  },
  {
    blockIndex: 10, blockId: 'block_32', unitId: 'p19-block-32-paragraph-3', target: 'Uma Aventura de um Jogo Base ou Pacote de Aventura terá um Livro de Diagramas próprio, com seu nome, ou terá seus Diagramas impressos nas páginas finais.', lineHeight: 1.1,
    segments: [base('Uma Aventura de um Jogo Base ou Pacote de Aventura terá um Livro de Diagramas próprio, com seu nome, ou terá seus Diagramas impressos nas páginas finais.')],
    pendingTerms: ['Adventure Pack → Pacote de Aventura é forma local; confirmar “páginas finais” pelo livro físico.'],
  },
  {
    blockIndex: 10, blockId: 'block_32', unitId: 'p19-block-32-paragraph-4', target: 'Os Pacotes de Recompensa sempre trazem seus Diagramas nas páginas finais do respectivo Livro de Recompensas.', lineHeight: 1.1,
    segments: [base('Os Pacotes de Recompensa sempre trazem seus Diagramas nas páginas finais do respectivo Livro de Recompensas.')],
    pendingTerms: ['Bounty Pack / Bounty Book → Pacote de Recompensa / Livro de Recompensas são formas locais propostas.'],
  },
  {
    blockIndex: 11, blockId: 'block_33', target: 'Remoção de Componentes Durante o Jogo', lineHeight: 1,
    segments: [cinzel('Remoção de Componentes Durante o Jogo', 12)],
    pendingTerms: ['During the Game → Durante o Jogo é candidato de título.'],
  },
  {
    blockIndex: 12, blockId: 'block_35', unitId: 'p19-block-35-paragraph-1', target: 'Às vezes, os Encontros instruem os jogadores a retirar algo do jogo. Nesse caso, coloque na caixa do jogo a ficha, miniatura ou carta retirada. Ela não será usada novamente nesse Encontro; isso vale apenas para o Encontro em andamento.\n• Fichas de Encontro: sempre que uma Ficha de Encontro for retirada do Tabuleiro por qualquer motivo, coloque-a na caixa do jogo. Ela não será usada novamente nesse Encontro.', lineHeight: 1.1,
    segments: [base('Às vezes, os Encontros instruem os jogadores a retirar algo do jogo. Nesse caso, coloque na caixa do jogo a ficha, miniatura ou carta retirada. Ela não será usada novamente nesse Encontro; isso vale apenas para o Encontro em andamento.\n'), bold('• '), bold('Fichas de Encontro:'), base(' sempre que uma Ficha de Encontro for retirada do Tabuleiro por qualquer motivo, coloque-a na caixa do jogo. Ela não será usada novamente nesse Encontro.')],
    pendingTerms: ['Game Board → Tabuleiro é candidato contextual. A fonte junta “Encounter” e “being played” sem espaço; a proposta expressa “Encontro em andamento”.'],
  },
  {
    blockIndex: 12, blockId: 'block_35', unitId: 'p19-block-35-paragraph-2', target: 'Por exemplo, se um Aventureiro receber instrução para remover do jogo uma Ficha de Saque ativada, ela não estará disponível quando o Encontro revelar outra Ficha de Saque aleatória mais tarde; nesse caso, retire a nova ficha de Saque das restantes.\n• Cartas de Item: as Cartas de Item que não estejam com um Aventureiro nem no Estoque do Grupo ficam disponíveis para compra no monte correspondente.\n• Remoção Permanente: se um componente for removido permanentemente, ele não será usado novamente e deve ficar na caixa do jogo até o fim da Aventura.', lineHeight: 1.1,
    segments: [base('Por exemplo, se um Aventureiro receber instrução para remover do jogo uma Ficha de '), italic('Saque'), base(' ativada, ela não estará disponível quando o Encontro revelar outra Ficha de '), italic('Saque'), base(' aleatória mais tarde; nesse caso, retire a nova ficha de '), italic('Saque'), base(' das restantes.\n'), bold('• '), bold('Cartas de Item:'), base(' as Cartas de Item que não estejam com um Aventureiro nem no Estoque do Grupo ficam disponíveis para compra no monte correspondente.\n'), bold('• '), bold('Remoção Permanente:'), base(' se um componente for removido '), italic('permanentemente'), base(', ele não será usado novamente e deve ficar na caixa do jogo até o fim da Aventura.')],
    pendingTerms: ['Loot → Saque segue o glossário; Draw → comprar segue a forma mecânica já usada nas propostas. Item Cards, Party Stash e Permanent Removal são candidatos contextuais.'],
  },
  {
    blockIndex: 13, blockId: 'block_36', target: 'Fichas de Saída', lineHeight: 1,
    segments: [cinzel('Fichas de Saída', 12)], pendingTerms: ['Exit Token → Ficha de Saída combina o glossário Exit → Saída com Token → Ficha.'],
  },
  {
    blockIndex: 14, blockId: 'block_39', target: 'SAÍDA\nAZUL', lineHeight: 1, textAlign: 'center',
    segments: [tokenWhite('SA'), tokenWhite('Í', { color: '#00c0f3' }), tokenWhite('DA'), base('\n'), base('AZUL', 4.31, { font: 'OptimaLTStd-ExtraBlack', color: '#00c0f3', weight: 900 })],
    pendingTerms: ['EXIT → SAÍDA e BLUE → AZUL são candidatos localizados. A letra colorida que substitui o X decorativo é uma proposta visual a conferir no token.'],
  },
  {
    blockIndex: 16, blockId: 'block_43', target: 'SAÍDA\nVERMELHO', lineHeight: 1, textAlign: 'center',
    segments: [tokenWhite('SA'), tokenWhite('Í', { color: '#da2128' }), tokenWhite('DA'), base('\n'), base('VERMELHO', 4.31, { font: 'OptimaLTStd-ExtraBlack', color: '#da2128', weight: 900 })],
    pendingTerms: ['EXIT → SAÍDA e RED → VERMELHO são candidatos localizados. A letra colorida que substitui o X decorativo é uma proposta visual a conferir no token.'],
  },
  {
    blockIndex: 18, blockId: 'block_47', target: 'SAÍDA\nVERDE', lineHeight: 1, textAlign: 'center',
    segments: [tokenWhite('SA'), tokenWhite('Í', { color: '#bfd730' }), tokenWhite('DA'), base('\n'), base('VERDE', 4.31, { font: 'OptimaLTStd-ExtraBlack', color: '#add136', weight: 900 })],
    pendingTerms: ['EXIT → SAÍDA e GREEN → VERDE são candidatos localizados. A letra colorida que substitui o X decorativo é uma proposta visual a conferir no token.'],
  },
  {
    blockIndex: 20, blockId: 'block_51', target: 'SAÍDA\nAMARELO', lineHeight: 1, textAlign: 'center',
    segments: [tokenWhite('SA'), tokenWhite('Í', { color: '#ffcb04' }), tokenWhite('DA'), base('\n'), base('AMARELO', 4.31, { font: 'OptimaLTStd-ExtraBlack', color: '#ffcb04', weight: 900 })],
    pendingTerms: ['EXIT → SAÍDA e YELLOW → AMARELO são candidatos localizados. A letra colorida que substitui o X decorativo é uma proposta visual a conferir no token.'],
  },
  {
    blockIndex: 21, blockId: 'block_53', target: 'Essas fichas representam uma forma de sair do Encontro. Nem todos os Encontros as usam, mas muitos sim. Na maioria dos casos, um Encontro termina quando um Aventureiro encerra seu turno sobre uma Ficha de Saída. Isso será indicado como Condição Final.', lineHeight: 1.1,
    segments: [base('Essas fichas representam uma forma de sair do Encontro. Nem todos os Encontros as usam, mas muitos sim. Na maioria dos casos, um Encontro termina quando um Aventureiro encerra seu turno sobre uma Ficha de '), italic('Saída'), base('. Isso será indicado como Condição Final.')],
    pendingTerms: ['Exit Token → Ficha de Saída e End Condition → Condição Final seguem o glossário; revisar capitalização de “Condição Final”.'],
  },
  {
    blockIndex: 22, blockId: 'block_54', target: 'Lendo Encontros (continuação)', lineHeight: 1,
    segments: [cinzel('Lendo Encontros ', 18), cinzel('(continuação)', 11)],
    pendingTerms: ['Reading Encounters → Lendo Encontros é candidato de título local.'],
  },
];

for (const path of [proofDir, proposalPath, markdownPath]) {
  try { await access(path); throw new Error(`Refusing to overwrite an existing output: ${path}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const pdfBytes = await readFile(sourcePdfPath);
const sourcePdfSha256 = sha256(pdfBytes);
assert.equal(sourcePdfSha256, 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351', 'Official PDF source changed.');
const domBytes = await readFile(join(pageDir, `page_${pageId}_dom.json`));
const dom = JSON.parse(domBytes);
assert.equal(dom.page_number, page);
assert.equal(dom.blocks.length, 24, 'p.19 DOM block count changed.');
const currentAssetNames = (await readdir(pageDir)).sort();
assert.deepEqual(currentAssetNames, [
  'background.webp', 'inline-element-mask-000.png', 'inline-element-mask-001.png', 'inline-element-mask-002.png',
  'inline_elements.json', 'layout_frames.json', 'page_019_dom.json',
], 'p.19 page asset inventory changed.');
const pageAssetHashes = {};
for (const name of currentAssetNames) {
  pageAssetHashes[name] = sha256(await readFile(join(pageDir, name)));
}

const unitLines = (block, unitId) => {
  const unit = unitId ? block.typographicUnits?.find(item => item.id === unitId) : null;
  if (unitId) assert.ok(unit, `Missing p.19 typographic unit ${unitId}`);
  return unit ? unit.field.lineIds : block.lines.map(line => line.id);
};
const sourceFor = (block, lineIds) => lineIds.map(lineId => {
  const line = block.lines.find(item => item.id === lineId);
  assert.ok(line, `Missing source line ${lineId}`);
  return line.spans.filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '').join('').replace(/[\r\n]+/gu, ' ');
}).join(' ');
const candidates = drafts.map(draft => {
  const block = dom.blocks[draft.blockIndex];
  assert.equal(block?.id, draft.blockId, `p.19 block index changed for ${draft.blockId}`);
  const sourceLines = unitLines(block, draft.unitId);
  const sourceText = normalize(sourceFor(block, sourceLines));
  const proposalText = draft.segments.filter(segment => !segment.symbolId).map(segment => segment.text ?? '').join('');
  assert.equal(proposalText, draft.target, `Rich text differs from target for ${draft.unitId ?? draft.blockId}`);
  const editorKey = draft.unitId ? `page_19_unit_${draft.unitId}` : `page_19_block_${draft.blockIndex}`;
  const spanKey = `${editorKey}__pt-BR`;
  return {
    blockIndex: draft.blockIndex,
    sourceBlockId: draft.blockId,
    ...(draft.unitId ? { unitId: draft.unitId } : {}),
    label: draft.unitId ?? draft.blockId,
    sourceText,
    proposalText,
    spanKey,
    language,
    data: {
      schemaVersion: 2,
      segments: draft.segments,
      textAlign: draft.textAlign ?? 'left',
      lineHeight: draft.lineHeight,
      lineHeightMode: 'source',
      managedSourceSymbols: draft.symbols ?? [],
    },
    status: 'proposal_pending_human_editorial_review',
    semanticSymbols: draft.symbols ?? [],
    pendingTerms: draft.pendingTerms,
    sourceLineCount: sourceLines.length,
  };
});
assert.equal(candidates.length, 28);
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, candidates.length, 'Duplicate p.19 candidate keys.');
assert.equal(new Set(candidates.map(candidate => candidate.sourceBlockId + ':' + (candidate.unitId ?? 'whole'))).size, candidates.length,
  'Duplicate source editorial units.');

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', language);
translationsUrl.searchParams.set('limit', '5000');
const response = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(response.ok, `Read-only Payload GET failed: ${response.status}`);
const payload = await response.json();
assert.ok((payload.docs ?? []).length >= Number(payload.totalDocs ?? 0), 'Payload GET is paginated.');
const existingPageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_19_'));
assert.equal(existingPageRecords.length, 0, 'p.19 has existing Payload records; stop and reconcile instead of replacing them.');

const boxesResult = spawnSync('python', [resolve(root, 'scripts/snapshot_export_source_boxes.py'), sourcePdfPath, String(page)], { encoding: 'utf8' });
assert.equal(boxesResult.status, 0, `Source PDF page-box read failed: ${boxesResult.stderr || boxesResult.stdout}`);
const sourcePageBoxes = JSON.parse(boxesResult.stdout);
await mkdir(snapshotPageDir, { recursive: true });
for (const name of currentAssetNames) {
  await immutableWrite(join(snapshotPageDir, name), await readFile(join(pageDir, name)));
}
const translations = candidates.map(({ spanKey, language: recordLanguage, data }) => ({ spanKey, language: recordLanguage, data }));
const snapshot = {
  translations,
  layoutFrames: [],
  symbolAliasSettings: [],
  assetPages: [page],
  page,
  patched: false,
  verifyRenderedSnapshot: true,
  sourcePageBoxes,
};
await writeJson(join(snapshotDir, 'snapshot.json'), snapshot);
await writeJson(join(proofDir, 'source-hashes.json'), {
  sourcePdf: sourcePdfSha256,
  pageAssets: pageAssetHashes,
  payloadPreflight: { method: 'GET only', pageRecords: existingPageRecords.length, candidatesAbsent: true, writes: 0 },
  candidateCount: candidates.length,
  uniqueCandidateKeys: true,
});
await writeJson(join(proofDir, 'proposal-candidates.json'), {
  status: 'full-editable-text-proposal-v1-pending-viewer-editor-pdf-validation-and-human-review',
  page,
  scope: '28 editable headings, paragraphs, IMPORTANT callouts and EXIT token labels. Diagram booklet, page ornament, token circles and page number remain source artwork or fixed page furniture.',
  candidateCount: candidates.length,
  candidates,
  artworkScope: {
    preserved: ['green Diagram Book image and its lettering', 'page background and ornament', 'four EXIT token circle illustrations', 'page number'],
    translatedAsEditableText: ['four SAÍDA labels', 'four token color labels'],
    notes: ['the accent/color treatment in SAÍDA replaces the source decorative X and needs visual review', 'no canonical sidecar or asset was changed'],
  },
  payloadWrites: 0,
  humanApproved: false,
});
const markdown = [
  '# p.19 — proposta integral do texto editável v1',
  '',
  '**Estado:** rascunho PT-BR completo para validação no Viewer, Editor e PDF isolado; revisão terminológica humana pendente. Não foi salvo no Payload nem ativado canonicamente.',
  '',
  '## Escopo',
  '',
  'A proposta cobre 28 unidades editáveis: títulos, prosa, três callouts IMPORTANT com seus símbolos semânticos, e os quatro rótulos SAÍDA/cores dos tokens. O livreto verde com texto impresso, os círculos/arte dos tokens, os ornamentos e o fólio permanecem no fundo original. Os rótulos SAÍDA são tratados como texto editável; o Í colorido substitui experimentalmente o X decorativo e precisa passar por revisão visual.',
  '',
  '## Propostas por unidade',
  '',
  ...candidates.flatMap(candidate => [
    `### ${candidate.spanKey}`,
    '',
    `**Fonte:** ${candidate.sourceText}`,
    '',
    `**PT-BR proposto:** ${candidate.proposalText.replace(/\n/gu, ' ↵ ')}`,
    '',
    ...(candidate.pendingTerms.length ? [`**Revisão pendente:** ${candidate.pendingTerms.join(' ')}`, ''] : []),
  ]),
  '## Integridade',
  '',
  `- PDF-fonte SHA-256: \`${sourcePdfSha256}\`.`,
  '- O preflight GET encontrou zero registros PT-BR da p.19; não foi feita nenhuma escrita no Payload.',
  '- A proposta usa snapshot isolado e copia os assets canônicos com hashes. Não alterou sidecars, fundo, arte, PDF-fonte ou tradução humana.',
  '- Os nomes próprios e termos sem entrada aprovada estão identificados por unidade e aguardam revisão.',
  '- A proposta só poderá ser considerada pronta para revisão humana depois da validação visual/Editor/PDF; não equivale a tradução aprovada ou publicação.',
  '',
].join('\n');
await immutableWrite(proposalPath, `${JSON.stringify({ proposalId: 'page-019-full-page-proposal-2026-10-16-v1', ...JSON.parse(await readFile(join(proofDir, 'proposal-candidates.json'), 'utf8')) }, null, 2)}\n`);
await immutableWrite(markdownPath, markdown);
console.log(JSON.stringify({
  status: 'p019-isolated-proposal-snapshot-prepared', page, proposedUnits: candidates.length,
  uniqueSpanKeys: new Set(candidates.map(candidate => candidate.spanKey)).size,
  payloadRecordsBefore: existingPageRecords.length, payloadWrites: 0,
  sourcePdfSha256, pageAssetHashes,
  snapshot: resolve(join(snapshotDir, 'snapshot.json')),
  proposal: proposalPath, proofDir,
}, null, 2));
