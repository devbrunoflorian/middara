#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Assemble the existing p.18 Achievements family with the remaining editable
// headings and prose. Card/deck lettering embedded in component artwork stays
// language-invariant under the project policy. This script is read-only toward
// Payload and canonical page assets; it writes an isolated proof package.
const root = process.cwd();
const page = 18;
const pageId = '018';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const sourcePdfPath = process.env.MIDDARA_SOURCE_PDF_PATH
  ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const pageDir = resolve(root, 'apps/web/public/pages', `page_${pageId}`);
const baseProofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p018-achievements-family-v1');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p018-full-editable-page-v3');
const snapshotDir = join(proofDir, 'snapshot');
const snapshotPageDir = join(snapshotDir, 'pages', `page_${pageId}`);
const expectedHashes = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  pageAssets: {
    'background.webp': 'D7462DED18644ACB0E10C6CFDA0BF7CA4385D08D24362718F7E44D83D2D8E463',
    'page_018_dom.json': '9D13BA6EEFDA190CA6D28ECF13D5686225E778064D5A1F254C6573AE1436826A',
    'inline_elements.json': 'D69AC6AF6943B77D56A16EFE60FC149ED472CD713B82F5E78FC423578466774F',
    'inline-element-mask-000.png': '5795EE7435A54589E64608AB7C72F29CEDCB175CB8BD5C23FAFA078949BE793C',
    'inline-element-mask-001.png': 'D5EBABE2C1A88014B7E7444B6FE14BB470F2A65A33C2B6667AD6D522EFA97110',
    'inline-element-mask-002.png': 'BCC58E298F3AE403D6A54DBDA7DD76D27F11245BF9DF82E0E1DD0AE51E6C0F50',
    'layout_frames.json': '4A35EA98B246E0AE6D0CFC440C74DFAEAC1846D91C8A6A450E6464B6315E976F',
  },
};

const baseText = (text, font = 'OptimaLTStd', size = 10, extra = {}) => ({
  text, font, size, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true, ...extra,
});
const bold = (text, size = 10, extra = {}) => baseText(text, 'OptimaLTStd-Bold', size, { weight: 700, ...extra });
const italic = (text, size = 10, extra = {}) => baseText(text, 'OptimaLTStd-Italic', size, { style: 'italic', ...extra });
const boldItalic = (text, size = 10, extra = {}) => baseText(text, 'OptimaLTStd-BoldItalic', size, { weight: 700, style: 'italic', ...extra });
const cinzelHeading = text => ({ text, font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true });
const listColumnRightPt = 397.56317138671875;
const importantIcon = {
  text: '\uFFFC', symbolId: 'tag.important.icon', symbolMetrics: { widthEm: 1, heightEm: 1, verticalAlignEm: 0.2 },
  font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true,
};
const importantLabel = {
  text: 'IMPORTANTE:', font: 'OptimaLTStd-Black', size: 10, color: '#b91d23', weight: 900, style: 'normal',
  textStrokeWidthPt: 2, textStrokeColor: '#ffffff', disableLigatures: true,
};
const importantPrefix = [importantIcon, importantLabel, baseText(' ')];

const specs = [
  {
    blockId: 'block_185', blockIndex: 110, target: 'Lendo Encontros (continuação)', lineHeight: 1,
    segments: [
      { text: 'Lendo Encontros ', font: 'Cinzel-Regular', size: 18, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
      { text: '(continuação)', font: 'Cinzel-Regular', size: 11, color: '#231f20', weight: 700, style: 'normal', disableLigatures: true },
    ],
    pendingTerms: [],
  },
  {
    blockId: 'block_12', blockIndex: 0, target: 'Texto Oculto', lineHeight: 1,
    segments: [cinzelHeading('Texto Oculto')], pendingTerms: [],
  },
  {
    blockId: 'block_18', blockIndex: 1,
    target: 'Durante os Encontros, algumas informações precisam ficar ocultas dos jogadores até o momento de revelá-las. O processo Red Reveal esconde texto verde sob uma tela vermelha. Os componentes incluem um Decodificador Red Reveal para os jogadores lerem o texto oculto. Quando receberem instruções, basta colocá-lo sobre o texto e ler.',
    lineHeight: 1.1,
    segments: [baseText('Durante os Encontros, algumas informações precisam ficar ocultas dos jogadores até o momento de revelá-las. O processo Red Reveal esconde texto verde sob uma tela vermelha. Os componentes incluem um Decodificador Red Reveal para os jogadores lerem o texto oculto. Quando receberem instruções, basta colocá-lo sobre o texto e ler.')],
    pendingTerms: ['Red Reveal / Red Reveal Decoder: proper-name treatment awaits terminology review.'],
  },
  {
    blockId: 'block_19', blockIndex: 2,
    target: 'IMPORTANTE: Os jogadores nunca devem ler o texto oculto sem receber instruções para isso.',
    lineHeight: 1.1,
    segments: [...importantPrefix, baseText('Os jogadores nunca devem ler o texto oculto sem receber instruções para isso.')],
    symbols: ['tag.important.icon'], pendingTerms: [],
  },
  {
    blockId: 'block_20', blockIndex: 3, target: 'Baralhos Secretos', lineHeight: 1,
    segments: [cinzelHeading('Baralhos Secretos')],
    pendingTerms: [],
  },
  {
    blockId: 'block_131', blockIndex: 87,
    target: 'Às vezes, uma Regra Especial de Encontro ou Mecânica de Aventura instrui os jogadores a revelar Cartas Ocultas. Essas Cartas Ocultas vêm em três tamanhos — Pequena, Média e Grande — e podem conter diversas coisas, mas o principal é que são secretas!',
    lineHeight: 1.1,
    segments: [
      baseText('Às vezes, uma Regra Especial de Encontro ou Mecânica de Aventura instrui os jogadores a revelar '),
      bold('Cartas Ocultas'), baseText('. Essas '), bold('Cartas Ocultas'), baseText(' vêm em três tamanhos — '),
      bold('Pequena'), baseText(', '), bold('Média'), baseText(' e '), bold('Grande'),
      baseText(' — e podem conter diversas coisas, mas o principal é que são secretas!'),
    ],
    pendingTerms: [
      'Adventure Mechanic → Mecânica de Aventura: candidate term.',
      'Hidden Card → Carta Oculta: contextual form pending review.',
      'Small/Medium/Large → Pequena/Média/Grande: size agreement candidate.',
    ],
  },
  {
    blockId: 'block_132', blockIndex: 88,
    target: 'Quando receberem instruções para isso, os jogadores localizarão a Carta Oculta indicada procurando no canto superior esquerdo do baralho correspondente para encontrar a carta correta.',
    lineHeight: 1.1,
    segments: [
      baseText('Quando receberem instruções para isso, os jogadores localizarão a '), bold('Carta Oculta'),
      baseText(' indicada procurando no '), bold('canto superior esquerdo'),
      baseText(' do baralho correspondente para encontrar a carta correta.'),
    ],
    pendingTerms: ['Hidden Card → Carta Oculta: contextual form pending review.'],
  },
  {
    unitId: 'p18-block-133-paragraph-1', blockId: 'block_133', blockIndex: 89,
    target: 'Por exemplo, uma Mecânica de Aventura pode dizer: “Revele Carta Oculta Média UM3”. Nesse caso, os jogadores procuram no canto superior esquerdo do baralho de Cartas Ocultas Médias e localizam a carta identificada como UM3. Depois, a Regra Especial de Encontro ou a Mecânica de Aventura instruirá os jogadores sobre o que fazer com ela.',
    lineHeight: 1.1,
    segments: [
      baseText('Por exemplo, uma Mecânica de Aventura pode dizer: “Revele '), bold('Carta Oculta Média'), bold(' UM3', 9),
      baseText('”. Nesse caso, os jogadores procuram no canto superior esquerdo do baralho de '),
      bold('Cartas Ocultas Médias'), baseText(' e localizam a carta identificada como '), bold('UM3', 9),
      baseText('. Depois, a Regra Especial de Encontro ou a Mecânica de Aventura instruirá os jogadores sobre o que fazer com ela.'),
    ],
    pendingTerms: [
      'Adventure Mechanic → Mecânica de Aventura: candidate term.',
      'Hidden Card → Carta Oculta: contextual form pending review.',
      'UM3 is preserved as a component identifier.',
    ],
  },
  {
    unitId: 'p18-block-133-paragraph-2', blockId: 'block_133', blockIndex: 89,
    target: 'Cartas Ocultas dos Pacotes de Aventura e de Recompensa devem permanecer ocultas até serem reveladas durante uma História ou Recompensa. Ao começar uma nova Aventura, o jogador deve ocultar novamente todas as cartas marcadas “UMX”, mesmo que as tenha revelado na Aventura anterior. O mesmo vale para cartas reveladas em Aventuras anteriores.',
    lineHeight: 1.1,
    segments: [
      baseText('Cartas Ocultas dos Pacotes de Aventura e de Recompensa devem permanecer ocultas até serem reveladas durante uma História ou Recompensa. Ao começar uma '),
      bold('nova'), baseText(' Aventura, o jogador deve ocultar novamente todas as cartas marcadas “'), bold('UMX'),
      baseText('”, mesmo que as tenha revelado na Aventura anterior. O mesmo vale para cartas reveladas em Aventuras anteriores.'),
    ],
    pendingTerms: [
      'Adventure Pack / Bounty Pack → Pacote de Aventura / Pacote de Recompensa: candidate compound forms.',
      'Story / Bounty → História / Recompensa: contextual forms pending review.',
      'Hidden Card → Carta Oculta: contextual form pending review.',
    ],
  },
  {
    unitId: 'p18-block-133-paragraph-3', blockId: 'block_133', blockIndex: 89,
    target: 'Itens marcados como “Itens de História” nunca são usados em uma Aventura até serem revelados pelas regras daquela Aventura.',
    lineHeight: 1.1,
    segments: [baseText('Itens marcados como “Itens de História” nunca são usados em uma Aventura até serem revelados pelas regras daquela Aventura.')],
    pendingTerms: ['Story Items → Itens de História: candidate term pending review.'],
  },
  {
    blockId: 'block_134', blockIndex: 90,
    target: 'IMPORTANTE: NÃO revele nenhuma Carta Oculta até receber instruções para isso.',
    lineHeight: 1.1,
    segments: [
      ...importantPrefix, bold('NÃO', 9), baseText(' revele nenhuma '), bold('Carta Oculta'),
      baseText(' até receber instruções para isso.'),
    ],
    symbols: ['tag.important.icon'],
    pendingTerms: ['Hidden Card → Carta Oculta: contextual form pending review.'],
  },
  {
    blockId: 'block_145', blockIndex: 96, target: 'Restaurar Aventureiros', lineHeight: 1,
    segments: [cinzelHeading('Restaurar Aventureiros')],
    pendingTerms: ['Restore → Restaurar is in the official glossary; heading form awaits page-level editorial review.'],
  },
  {
    blockId: 'block_147', blockIndex: 97,
    target: 'Uma Condição Final ou, mais raramente, uma Mecânica de Aventura pode instruir os jogadores a Restaurar Aventureiros como recompensa.',
    lineHeight: 1.1, segments: [baseText('Uma Condição Final ou, mais raramente, uma Mecânica de Aventura pode instruir os jogadores a Restaurar Aventureiros como recompensa.')],
    pendingTerms: ['Adventure Mechanic → Mecânica de Aventura: candidate term.'],
  },
  {
    blockId: 'block_148', blockIndex: 98,
    target: 'Narrativamente, a Restauração dos Aventureiros representa um período de descanso.',
    lineHeight: 1.1, segments: [baseText('Narrativamente, a Restauração dos Aventureiros representa um período de descanso.')],
    pendingTerms: [],
  },
  {
    blockId: 'block_149', blockIndex: 99,
    target: 'Para Restaurar Aventureiros, cada Aventureiro passa pelas seguintes Fases:',
    lineHeight: 1.1, segments: [baseText('Para Restaurar Aventureiros, cada Aventureiro passa pelas seguintes Fases:')],
    pendingTerms: [],
  },
  {
    blockId: 'block_150', blockIndex: 100,
    target: '1. Remova cada ficha de Dano.', lineHeight: 1.1,
    segments: [bold('1.'), baseText('\t '), baseText('Remova cada ficha de '), italic('Dano'), baseText('.')],
    pendingTerms: [],
  },
  {
    blockId: 'block_151', blockIndex: 101,
    target: '2. Desvire e desexauste cada carta em jogo e no Estoque do Grupo.', lineHeight: 1.1,
    segments: [bold('2.'), baseText('\t '), baseText('Desvire e desexauste cada carta em jogo e no Estoque do Grupo.')],
    pendingTerms: ['Un-Exhaust → desexaustar follows the user-approved exaustar decision; imperative awaits editorial review.'],
  },
  {
    blockId: 'block_152', blockIndex: 102,
    target: '3. Remova cada ficha de Efeito e Habilidade.', lineHeight: 1.1,
    segments: [bold('3.'), baseText('\t '), baseText('Remova cada ficha de '), italic('Efeito'), baseText(' e '), italic('Habilidade'), baseText('.')],
    pendingTerms: [],
  },
  {
    blockId: 'block_153', blockIndex: 103,
    target: '4. Todos os Aventureiros podem trocar Itens como se estivessem adjacentes e tivessem feito uma Ação de Reequipar. Veja Ações, pág. 38.',
    lineHeight: 1.1,
    segments: [bold('4.'), baseText('\t '), baseText('Todos os Aventureiros podem trocar Itens como se estivessem adjacentes e tivessem feito uma Ação de Reequipar. Veja '), bold('Ações'), baseText(', pág. 38.')],
    pendingTerms: ['Re-Equip Action → Ação de Reequipar: candidate compound; `Actions` → Ações awaits glossary check.'],
  },
  {
    blockId: 'block_154', blockIndex: 104,
    target: 'Depois da Restauração de cada Aventureiro, os jogadores devem embaralhar de volta no Baralho de Saque de Combatentes todas as cartas compradas desse baralho. Veja Cartas de Saque de Combatentes, pág. 57.',
    lineHeight: 1.1,
    segments: [
      baseText('Depois da Restauração de cada Aventureiro, os jogadores devem embaralhar de volta no Baralho de Saque de Combatentes todas as cartas compradas desse baralho. Veja '),
      boldItalic('Cartas de Saque de Combatentes'), baseText(', pág. 57.'),
    ],
    pendingTerms: ['Combatant Loot Cards / Combatant Loot Deck → Cartas/Baralho de Saque de Combatentes: compound terminology pending review.'],
  },
  {
    unitId: 'p18-block-155-paragraph-1', blockId: 'block_155', blockIndex: 105,
    target: 'IMPORTANTE: Em geral, Restaurar é a única forma de, durante uma Aventura, os jogadores desvirarem cartas e se CURAREM naturalmente. Se não receberem instruções para Restaurar Aventureiros, não removerão todas as fichas de Dano nem desvirarão cartas. Por isso, recomendamos atenção redobrada ao procurar oportunidades de Restaurar.',
    lineHeight: 1.1,
    segments: [
      ...importantPrefix,
      baseText('Em geral, Restaurar é a única forma de, durante uma Aventura, os jogadores desvirarem cartas e se '),
      bold('CURAREM', 9), baseText(' naturalmente. Se os jogadores '), bold('não'),
      baseText(' receberem instruções para Restaurar Aventureiros, '), bold('não'),
      baseText(' removerão todas as fichas de '), italic('Dano'),
      baseText(' nem desvirarão cartas. Por isso, recomendamos atenção redobrada ao procurar oportunidades de Restaurar.'),
    ],
    symbols: ['tag.important.icon'],
    pendingTerms: ['HEAL → CURAR/curar-se: capitalization and mechanical meaning await terminology review.'],
  },
  {
    unitId: 'p18-block-155-paragraph-2', blockId: 'block_155', blockIndex: 105,
    target: 'Fichas de Urgência', lineHeight: 1,
    segments: [cinzelHeading('Fichas de Urgência')],
    pendingTerms: ['Urgency Tokens → Fichas de Urgência: repeated proposal; not yet added to the official glossary.'],
  },
  {
    blockId: 'block_182', blockIndex: 107,
    target: 'As Fichas de Urgência representam a corrida dos Aventureiros contra o tempo. Elas ajudam a manter o jogo em andamento e impedem que os jogadores abusem de certas Habilidades.',
    lineHeight: 1.1,
    segments: [baseText('As '), italic('Fichas de Urgência'), baseText(' representam a corrida dos Aventureiros contra o tempo. Elas ajudam a manter o jogo em andamento e impedem que os jogadores abusem de certas Habilidades.')],
    pendingTerms: ['Urgency Tokens → Fichas de Urgência: repeated proposal; not yet added to the official glossary.'],
  },
  {
    blockId: 'block_183', blockIndex: 108,
    target: 'Ao final de uma rodada em que nenhum oponente tenha tido uma Etapa de IA com condição verdadeira, nenhum oponente tenha sido Derrotado e nenhum tenha Surgido, acrescente uma Ficha de Urgência ao final da Trilha de Iniciativa. Habilidades Passivas usadas por oponentes não contam como condição verdadeira para calcular a Urgência. Assim, mesmo que haja oponentes no tabuleiro, a ficha será acrescentada se eles não fizerem nada. Combatentes afetados por um Efeito de Aventureiro que os impeça de realizar um turno ou Ações (como Paralisar) contam como tendo realizado um turno ao calcular a Urgência.',
    lineHeight: 1.1,
    segments: [
      baseText('Ao final de uma rodada em que nenhum oponente tenha tido uma Etapa de '), bold('IA', 9),
      baseText(' com condição verdadeira, nenhum oponente tenha sido Derrotado e nenhum tenha Surgido, acrescente uma Ficha de '),
      italic('Urgência'), baseText(' ao final da Trilha de Iniciativa. Habilidades Passivas usadas por oponentes não contam como condição verdadeira para calcular a '),
      italic('Urgência'), baseText('. Assim, mesmo que haja oponentes no tabuleiro, a ficha será acrescentada se eles não fizerem nada. Combatentes afetados por um '),
      italic('Efeito'), baseText(' de Aventureiro que os impeça de realizar um turno ou Ações (como '),
      italic('Paralisar'), baseText(') contam como tendo realizado um turno ao calcular a '), italic('Urgência'), baseText('.'),
    ],
    pendingTerms: [
      'AI Step → Etapa de IA: candidate term.',
      'Initiative Track → Trilha de Iniciativa and Urgency → Urgência: repeated candidates, not official glossary decisions.',
      'Defeated / Spawned → Derrotado / Surgir follow existing glossary entries; inflected forms remain local.',
      'Paralyze → Paralisar: action name pending review.',
    ],
  },
  {
    blockId: 'block_184', blockIndex: 109,
    target: 'Se o grupo obtiver uma 4ª Ficha de Urgência, todos os Aventureiros serão Derrotados. Remova as Fichas de Urgência ao fim de cada Encontro. Para saber mais, consulte Etapas de IA, pág. 60.',
    lineHeight: 1.1,
    segments: [
      baseText('Se o grupo obtiver uma '), bold('4ª'), baseText(' Ficha de '), italic('Urgência'),
      baseText(', todos os Aventureiros serão Derrotados. Remova as Fichas de Urgência ao fim de cada Encontro. Para saber mais, consulte '),
      bold('Etapas de '), boldItalic('IA'), baseText(', pág. 60.'),
    ],
    pendingTerms: ['Urgency → Urgência and AI Steps → Etapas de IA are candidate forms pending terminology review.'],
  },
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const normalize = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}
async function getJson(url) {
  const response = await fetch(new URL(url, apiUrl), { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Read-only GET ${url} failed: ${response.status}`);
  return response.json();
}
function sourceSpans(block, lineIds = null) {
  const wanted = lineIds ? new Set(lineIds) : null;
  return (block.lines ?? []).filter(line => !wanted || wanted.has(line.id)).flatMap(line => line.spans ?? [])
    .filter(span => span.text?.trim() && span.font !== 'Webdings' && span.color !== '#ffffff' && !span.renderOnlyStrokePass);
}
function sourceText(block, lineIds = null) {
  return normalize(sourceSpans(block, lineIds).map(span => span.text).join(' '));
}
function sourceBaseline(line) {
  const span = (line.spans ?? []).find(item => item.text?.trim() && Array.isArray(item.origin));
  return span ? Number(span.origin[1]) : NaN;
}
function derivedLineHeight(block, lineIds, sourceFontSize, fallback) {
  const selected = lineIds ? new Set(lineIds) : null;
  const baselines = (block.lines ?? []).filter(line => !selected || selected.has(line.id))
    .map(sourceBaseline).filter(Number.isFinite);
  const steps = baselines.slice(1).map((baseline, index) => baseline - baselines[index])
    .filter(step => step > 0.2).sort((a, b) => a - b);
  if (!steps.length || !(sourceFontSize > 0)) return fallback;
  const leading = steps[Math.floor(steps.length / 2)];
  return Number((leading / sourceFontSize).toFixed(3));
}
function derivedWeight(span) {
  return Number(span.renderWeightOverride ?? (String(span.font ?? '').includes('Bold') ? 700 : 400));
}

const sourcePdf = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdf), expectedHashes.sourcePdf, 'Official source PDF changed.');
const sourceAssetBytes = Object.fromEntries(await Promise.all(Object.keys(expectedHashes.pageAssets).map(async name => [name, await readFile(join(pageDir, name))])));
for (const [name, bytes] of Object.entries(sourceAssetBytes)) {
  assert.equal(sha256(bytes), expectedHashes.pageAssets[name], `Canonical page asset changed: ${name}`);
}
const dom = JSON.parse(sourceAssetBytes['page_018_dom.json'].toString('utf8'));
assert.equal(dom.page_number, page);
const blockById = new Map(dom.blocks.map((block, index) => [block.id, { block, index }]));
const baseCandidates = JSON.parse(await readFile(join(baseProofDir, 'proposal-candidates.json'), 'utf8'));
const baseSnapshot = JSON.parse(await readFile(join(baseProofDir, 'snapshot', 'snapshot.json'), 'utf8'));
assert.equal(baseCandidates.candidates.length, 4);
assert.equal(baseSnapshot.translations.length, 4);

const newCandidates = specs.map(spec => {
  const located = blockById.get(spec.blockId);
  assert.ok(located, `Missing source block ${spec.blockId}`);
  const { block, index } = located;
  assert.equal(index, spec.blockIndex, `Source block index changed for ${spec.blockId}`);
  const unit = spec.unitId ? (block.typographicUnits ?? []).find(item => item.id === spec.unitId) : null;
  if (spec.unitId) assert.ok(unit, `Missing editorial unit ${spec.unitId}`);
  const lineIds = unit?.field?.lineIds ?? null;
  const visibleSpans = sourceSpans(block, lineIds);
  assert.ok(visibleSpans.length, `No visible source text in ${spec.unitId ?? spec.blockId}`);
  const sourceEditorialKey = spec.unitId ? `page_${page}_unit_${spec.unitId}` : `page_${page}_block_${index}`;
  const spanKey = `${sourceEditorialKey}__pt-BR`;
  const bbox = unit?.field?.bbox ?? block.bbox;
  const lineCount = lineIds?.length ?? block.lines.length;
  const first = visibleSpans[0];
  const data = {
    schemaVersion: 2,
    spanKey,
    bbox,
    textAlign: unit?.field?.frame?.textAlign ?? 'left',
    lineHeight: derivedLineHeight(block, lineIds, Number(first.size), spec.lineHeight),
    lineHeightMode: 'custom',
    segments: spec.segments,
    managedSourceSymbols: spec.symbols ?? [],
  };
  return {
    spanKey,
    sourceEditorialKey,
    blockIndex: index,
    blockId: spec.blockId,
    ...(spec.unitId ? { sourceUnitId: spec.unitId } : {}),
    sourceText: sourceText(block, lineIds),
    proposalText: spec.target,
    sourceLineCount: lineCount,
    sourceLeadingRatio: data.lineHeight,
    pendingTerms: spec.pendingTerms,
    language: 'pt-BR',
    data,
    sourceStyle: { font: first.font, size: Number(first.size), color: first.color ?? '#231f20', weight: derivedWeight(first) },
  };
});

const candidates = [...baseCandidates.candidates, ...newCandidates];
assert.equal(candidates.length, 29, 'Expected all visible prose and headings except language-invariant component artwork.');
assert.equal(new Set(candidates.map(item => item.spanKey)).size, candidates.length, 'Duplicate translation key.');
assert.ok(candidates.every(item => item.spanKey.endsWith('__pt-BR') && !item.spanKey.includes('__en')));

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsPayload = await getJson(translationsUrl.pathname + translationsUrl.search);
const existingPageRecords = (translationsPayload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith(`page_${page}_`));
assert.deepEqual(existingPageRecords, [], 'p.18 now has saved PT-BR records; preserve and reassess before export.');

const files = await readdir(pageDir);
const copiedHashes = {};
await mkdir(snapshotPageDir, { recursive: true });
for (const name of files.sort()) {
  const bytes = await readFile(join(pageDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}
const snapshot = {
  ...baseSnapshot,
  translations: candidates.map(({ spanKey, language, data }) => ({ spanKey, language, data })),
  layoutFrames: [
    ...(baseSnapshot.layoutFrames ?? []),
    ...['block_150', 'block_151', 'block_152'].map(blockId => {
      const { block, index } = blockById.get(blockId);
      const x = block.lines[0].availableX ?? block.bbox[0];
      assert.ok(Math.abs(x - 86.17320251464844) < 0.01, `Unexpected list X for ${blockId}`);
      assert.ok(listColumnRightPt > x && listColumnRightPt < 415.8392, 'Proposed list width must end before the right column.');
      return {
        unitKey: `page_${page}_block_${index}`,
        pageNumber: page,
        language: 'pt-BR',
        data: {
          x,
          y: block.bbox[1],
          width: listColumnRightPt - x,
          height: block.bbox[3] - block.bbox[1],
          rotation: 0,
          textAlign: 'left',
          lineHeight: 1.1,
        },
      };
    }),
  ],
};
await immutableWrite(join(snapshotDir, 'snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, 'source-hashes.json'), `${JSON.stringify({
  sourcePdf: expectedHashes.sourcePdf,
  pageAssets: copiedHashes,
  payloadPageTranslationRecords: existingPageRecords,
  payloadWrites: 0,
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'proposal-candidates.json'), `${JSON.stringify({
  status: 'full-editable-page-proposal-v3-first-copyfit-iteration-awaiting-viewer-and-pdf-validation',
  page,
  scope: 'All visible editorial prose and headings; text printed in component artwork and the UM3/UMX card identifiers remain language-invariant. Translation frame proposals for the numbered list are isolated and PT-BR-only.',
  candidates,
  candidateCount: candidates.length,
  sourceHashes: expectedHashes,
  payloadPageRecordsBefore: existingPageRecords.length,
  payloadWrites: 0,
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'revision-budget.json'), `${JSON.stringify({
  declaredBeforeRender: true,
  totalCopyfitIterations: 2,
  thisProposalIteration: 1,
  remainingIterations: 1,
  priorV2Disposition: 'rejected-after-Viewer-and-PDF-overlaps; retained unchanged',
  stopCondition: 'If iteration 2 still collides or loses meaning, retain unresolved units with source fallback and block page readiness.',
}, null, 2)}\n`);
await immutableWrite(join(proofDir, 'pt-br-list-frame-proposals.json'), `${JSON.stringify({
  status: 'isolated-layout-proposal-only', page,
  sourceRightEdgePt: listColumnRightPt,
  sourceColumnBoundaryPt: 415.8392028808594,
  rationale: 'Blocks 150–152 are consecutive numbered-list steps at the same x as the two-line step 4. Their extracted text bboxes were shorter than the demonstrated list-column frame, causing Portuguese text to wrap into neighboring fixed rows. Candidate frames expand only the PT-BR text width and preserve each source x/y/height.',
  frames: snapshot.layoutFrames.filter(frame => ['page_18_block_100', 'page_18_block_101', 'page_18_block_102'].includes(frame.unitKey)),
  canonicalWrites: 0,
}, null, 2)}\n`);

console.log(JSON.stringify({
  status: 'isolated-page-v3-snapshot-prepared', page, candidateCount: candidates.length,
  newCandidates: newCandidates.map(({ spanKey, proposalText }) => ({ spanKey, proposalText })),
  payloadPageRecordsBefore: existingPageRecords.length, payloadWrites: 0,
  sourcePdfSha256: expectedHashes.sourcePdf, pageAssetHashes: copiedHashes,
  proposedPtBrLayoutFrames: snapshot.layoutFrames.filter(frame => frame.language === 'pt-BR').length,
  snapshotPath: resolve(join(snapshotDir, 'snapshot.json')),
}, null, 2));
