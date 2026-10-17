import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Rebuilds the p.41 PT-BR proposal and its immutable PageRenderer snapshot.
// This script only reads Payload and writes proposal/proof artifacts; it never
// sends a mutation request to Payload or edits canonical page assets.
const root = process.cwd();
const attempt = Number(process.argv[2] ?? 1);
assert.ok(Number.isInteger(attempt) && attempt >= 1 && attempt <= 3, 'Use a fixed copyfit attempt from 1 to 3');
const proofDir = resolve(root, `output/proofs/translation-readiness-2026-10-15/p041-attack-v${attempt + 3}`);
const snapshotDir = join(proofDir, 'snapshot');
const sourceDir = resolve(root, 'apps/web/public/pages/page_041');
const sourcePdfPath = 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const apiUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const expected = {
  sourcePdf: 'A64E04BD7ADDB8BCA2B5F3BFA84BAD3FF2E6D2F8DDA200F5D14FE0734E543351',
  dom: 'B8009CBD5FBAF8DAC91ED3751DA9442F9F79AD2E414DA03817A1339F662D5F7B',
  inlineElements: 'E81E095AE8770F6263EEC6DA1FDC1574E763CBBFAFDB504C407205B29E30C3DD',
  background: '8137ABFCC30BF179C08EBE32DE4E072E439C763045DFF3CB3436CF1BE5C200CE',
};
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

async function immutableWrite(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  try {
    assert.ok(bytes.equals(await readFile(path)), `Refusing to replace changed proof artifact: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }
}

const pageFiles = {
  dom: join(sourceDir, 'page_041_dom.json'),
  inlineElements: join(sourceDir, 'inline_elements.json'),
  background: join(sourceDir, 'background.webp'),
};
const sourceBytes = Object.fromEntries(await Promise.all(Object.entries(pageFiles).map(async ([key, path]) => [key, await readFile(path)])));
for (const key of Object.keys(pageFiles)) assert.equal(sha256(sourceBytes[key]), expected[key], `Canonical p.41 ${key} changed`);
const sourcePdfBytes = await readFile(sourcePdfPath);
assert.equal(sha256(sourcePdfBytes), expected.sourcePdf, 'Official EN source PDF changed');
const dom = JSON.parse(sourceBytes.dom.toString('utf8'));
const inline = JSON.parse(sourceBytes.inlineElements.toString('utf8'));
assert.equal(dom.page_number, 41);
assert.equal(inline.elements.length, 13, 'Expected the 13 p.41 semantic inline elements');

const copiedHashes = {};
const snapshotPageDir = join(snapshotDir, 'pages', 'page_041');
await mkdir(snapshotPageDir, { recursive: true });
for (const name of (await readdir(sourceDir)).sort()) {
  const bytes = await readFile(join(sourceDir, name));
  await immutableWrite(join(snapshotPageDir, name), bytes);
  copiedHashes[name] = sha256(bytes);
}

const translationsUrl = new URL('/api/translations', apiUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
if (!translationsResponse.ok) throw new Error(`Payload read failed: ${translationsResponse.status}`);
const translationPayload = await translationsResponse.json();
const existing = (translationPayload.docs ?? [])
  .filter(doc => String(doc.spanKey ?? '').startsWith('page_41_'))
  .sort((a, b) => Number(a.id) - Number(b.id));
assert.deepEqual(existing.map(doc => [doc.id, doc.spanKey, doc.updatedAt]), [
  [242, 'page_41_unit_p41-step-4-substep-b__pt-BR', '2026-10-07T13:14:11.622Z'],
  [247, 'page_41_unit_p41-step-4-substep-b-important__pt-BR', '2026-10-07T15:43:53.144Z'],
], 'Saved p.41 translation state differs from the captured source data');
const originalRecords = existing.map(doc => ({
  id: doc.id, spanKey: doc.spanKey, updatedAt: doc.updatedAt,
  sha256: sha256(stable(doc)), record: doc,
}));
await immutableWrite(join(proofDir, `preexisting-payload-records-v${attempt}.json`), `${JSON.stringify({
  readOnlyCapture: true, page: 41, language: 'pt-BR', records: originalRecords,
}, null, 2)}\n`);

const framesResponse = await fetch(new URL('/api/layout-frames?where%5Band%5D%5B0%5D%5BpageNumber%5D%5Bequals%5D=41&limit=1000', apiUrl));
if (!framesResponse.ok) throw new Error(`Payload layout-frame read failed: ${framesResponse.status}`);
const framesPayload = await framesResponse.json();
const aliasResponse = await fetch(new URL('/api/symbol-alias-settings?limit=500', apiUrl));
if (!aliasResponse.ok) throw new Error(`Payload symbol-alias read failed: ${aliasResponse.status}`);
const aliasPayload = await aliasResponse.json();

const findBlock = blockId => {
  const block = dom.blocks.find(candidate => candidate.id === blockId);
  assert.ok(block, `Missing source block ${blockId}`);
  return block;
};
const norm = value => String(value).replace(/\s+/gu, ' ').replace(/\s+([,.;:])/gu, '$1').trim();
const sourceText = block => norm((block.lines ?? []).map(line => (line.spans ?? [])
  .filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
  .map(span => span.text ?? '').join('')).join(' '));
const sourceUnitText = (block, lineIds) => norm(lineIds.flatMap(lineId => {
  const line = block.lines.find(candidate => candidate.id === lineId);
  return (line?.spans ?? []).filter(span => !span.renderOnlyStrokePass && span.font !== 'Webdings')
    .map(span => span.text ?? '');
}).join(' '));
const seg = (text, font = 'OptimaLTStd', size = 10, color = '#231f20', weight = 400, style = 'normal') =>
  ({ text, font, size, color, weight, style });
const regular = text => seg(text);
const bold = (text, size = 10) => seg(text, 'OptimaLTStd-Bold', size, '#231f20', 700);
const black = text => seg(text, 'OptimaLTStd-Black', 10, '#b91d23', 900);
const italic = text => seg(text, 'OptimaLTStd-Italic', 10, '#231f20', 400, 'italic');
const boldItalic = text => seg(text, 'OptimaLTStd-BoldItalic', 10, '#231f20', 700, 'italic');
const cinzel = (text, size) => seg(text, 'Cinzel-Regular', size, '#231f20', 400);
const sectionHeading = text => seg(text, 'OptimaLTStd-Bold', 9, '#231f20', 700);
const marker = (blockId, lineId, spanIndex, expectedId) => {
  const element = inline.elements.find(item => item.anchor.blockId === blockId
    && item.anchor.lineId === lineId && item.anchor.spanIndex === spanIndex);
  assert.ok(element, `Missing p.41 inline element ${blockId}/${lineId}/${spanIndex}`);
  assert.equal(element.symbolId, expectedId, `Unexpected p.41 symbol at ${blockId}/${lineId}/${spanIndex}`);
  const sourceSpan = findBlock(blockId).lines.find(line => line.id === lineId)?.spans?.[spanIndex];
  assert.ok(sourceSpan, `Missing p.41 source span ${blockId}/${lineId}/${spanIndex}`);
  return {
    text: '\uFFFC', font: 'OptimaLTStd', size: element.anchor.sizePt,
    color: sourceSpan.color ?? '#231f20', weight: 400, style: 'normal',
    symbolId: element.symbolId, symbolMetrics: element.metrics,
  };
};
const managedSymbols = segments => [...new Set(segments.flatMap(item => item.symbolId ? [item.symbolId] : []))];
const unitRecord = (blockId, unitId, lineIds, segments) => {
  const block = findBlock(blockId);
  const unit = (block.typographicUnits ?? []).find(candidate => candidate.id === unitId);
  assert.ok(unit, `Missing p.41 typographic unit ${unitId}`);
  assert.deepEqual(unit.field.lineIds, lineIds, `Source line ownership changed for ${unitId}`);
  const key = `page_41_unit_${unitId}__pt-BR`;
  const lineHeight = unit.field.frame?.lineHeight ?? 1;
  const data = {
    schemaVersion: 2, spanKey: key, bbox: unit.field.bbox,
    textAlign: unit.field.frame?.textAlign ?? 'left', lineHeight,
    lineHeightMode: Math.abs(lineHeight - 1) > 0.001 ? 'custom' : 'source',
    segments, managedSourceSymbols: managedSymbols(segments),
  };
  return { record: { spanKey: key, language: 'pt-BR', data }, sourceText: sourceUnitText(block, lineIds), kind: 'unit', blockId, lineIds };
};
const blockRecord = (blockId, segments, lineHeight = 1.1) => {
  const block = findBlock(blockId);
  const blockIndex = dom.blocks.indexOf(block);
  const key = `page_41_block_${blockIndex}__pt-BR`;
  const data = {
    schemaVersion: 2, spanKey: key, bbox: block.bbox, textAlign: 'left', lineHeight,
    lineHeightMode: Math.abs(lineHeight - 1) > 0.001 ? 'custom' : 'source',
    segments, managedSourceSymbols: managedSymbols(segments),
  };
  return { record: { spanKey: key, language: 'pt-BR', data }, sourceText: sourceText(block), kind: 'block', blockId };
};

const rows = [
  blockRecord('block_9', [cinzel('A Ação de Ataque', 18)], 1),
  unitRecord('block_19', 'p41-block-19-first-size-12pt', ['line_19_0'], [cinzel('Etapas para realizar um Ataque', 12)]),
  unitRecord('block_19', 'p41-block-19-remaining-size-10pt', ['line_19_2'], [regular('Sempre que um Ataque for realizado, a Miniatura atacante seguirá estas etapas.')]),
  unitRecord('block_22', 'p41-block-22-first-size-9pt', ['line_22_0'], [sectionHeading('1.\u00A0\u00A0ESCOLHER O ALVO')]),
  unitRecord('block_22', 'p41-block-22-remaining-size-10pt', ['line_22_1', 'line_22_2'], [
    regular('Escolha como alvo uma Miniatura ao seu Alcance e na sua Linha de Visão. Algumas Habilidades podem alterar esses parâmetros.'),
  ]),
  unitRecord('block_23', 'p41-block-23-first-size-9pt', ['line_23_0'], [sectionHeading('2.\u00A0\u00A0MONTAR A RESERVA DE DADOS DE COMBATE:')]),
  unitRecord('block_23', 'p41-block-23-remaining-size-10pt', ['line_23_1', 'line_23_2', 'line_23_3', 'line_23_4'], [
    regular('Armas de 1 mão têm um Dado de Combate impresso nelas. Armas de 2 mãos têm dois Dados de Combate impressos nelas. Ao realizar um Ataque, Aventureiros usam em conjunto os Dados de todas as Armas equipadas para formar a Reserva de Dados de Combate.'),
  ]),
  blockRecord('block_24', [
    regular('Um Aventureiro que adicione apenas um Dado de Combate da Arma equipada adiciona '),
    marker('block_24', 'line_24_1', 1, 'dice.purple'),
    regular(' à sua Reserva de Dados de Combate. Se um Aventureiro não tiver Armas equipadas, adiciona 2 '),
    marker('block_24', 'line_24_3', 3, 'dice.purple'),
    regular(' à sua Reserva de Dados de Combate.'),
  ]),
  blockRecord('block_25', [regular('Ao contrário dos Aventureiros, os Combatentes têm seus Dados de Combate impressos em sua carta. Quando atacam, usam os Dados de Combate impressos em sua Carta de Combatente para formar sua Reserva de Dados de Combate.')]),
  blockRecord('block_26', [
    marker('block_26', 'line_26_0', 0, 'tag.important.icon'),
    black('IMPORTANTE:'), bold(' '),
    regular('Dados adicionais à Reserva de Combate concedidos por Habilidades (como '), italic('Fortalecer'),
    regular(') contam como Dados de Combate.'),
  ]),
  unitRecord('block_27', 'p41-block-27-paragraph-1', ['line_27_0'], [sectionHeading('3.\u00A0\u00A0FORTALECER: '), regular('Escolha Fortalecer a Reserva de Dados.')]),
  unitRecord('block_27', 'p41-block-27-paragraph-2', ['line_27_1', 'line_27_2', 'line_27_3', 'line_27_4'], [
    regular('Após montar sua Reserva de Dados de Combate, o Atacante pode escolher Fortalecer o Ataque gastando '), bold('1 SP', 9),
    regular(' para adicionar o dado '), bold('PRETO', 9), marker('block_27', 'line_27_2', 5, 'dice.black'),
    regular(' à Reserva de Dados de Combate.'),
  ]),
  blockRecord('block_28', [regular('Combatentes Inteligentes só Fortalecem se tiverem uma Habilidade que permita isso especificamente.')]),
  blockRecord('block_29', [
    marker('block_29', 'line_29_0', 0, 'tag.important.icon'), black('IMPORTANTE:'), bold(' '),
    regular('Algumas Armas têm o dado '), bold('PRETO', 9), marker('block_29', 'line_29_1', 3, 'dice.black'),
    regular(' representado como parte de seus Dados de Combate. Ataques realizados com essas Armas são sempre Fortalecidos. Da mesma forma, alguns Combatentes têm o dado '),
    bold('PRETO', 9), marker('block_29', 'line_29_4', 1, 'dice.black'),
    regular(' como parte de seus Dados de Combate. Seus Ataques são sempre Fortalecidos. Consulte '),
    boldItalic('Fortalecer'), regular(', pág. '), bold('52'), regular('.'),
  ]),
  unitRecord('block_30', 'p41-step-4-heading', ['line_30_0'], [sectionHeading('4.\u00A0\u00A0ESQUIVA:')]),
  unitRecord('block_30', 'p41-step-4-substep-a', ['line_30_1', 'line_30_2', 'line_30_3'], [
    bold('a.\u00A0Verifique se usa ESQUIVA:'), regular(' Uma Miniatura alvo de Ataque pode gastar '), bold('1 SP', 9),
    regular(' para usar Esquiva. Combatentes Inteligentes só usam ESQUIVA se sua carta permitir.'),
  ]),
  {
    record: existing.find(doc => doc.id === 242), sourceText: sourceUnitText(findBlock('block_30'), ['line_30_4', 'line_30_5', 'line_30_6', 'line_30_7', 'line_30_8']),
    kind: 'existing-record-preserved-in-snapshot', blockId: 'block_30', lineIds: ['line_30_4', 'line_30_5', 'line_30_6', 'line_30_7', 'line_30_8'],
  },
  unitRecord('block_30', 'p41-step-4-substep-b-important', ['line_30_9', 'line_30_10', 'line_30_11'], [
    bold('Importante: '), regular('Habilidades podem dar bônus à rolagem, mas, se sair '),
    marker('block_30', 'line_30_10', 0, 'combat.skull'), regular(', os bônus são anulados.'),
  ]),
  unitRecord('block_33', 'p41-step-5-heading', ['line_33_0'], [sectionHeading('5.\u00A0\u00A0ROLAR PARA ACERTAR:')]),
  unitRecord('block_33', 'p41-step-5-substep-a', ['line_33_1', 'line_33_2'], [
    bold('a.\tFaça uma Rolagem de Ataque:'), regular(' Para realizar uma rolagem de Ataque, o Atacante rola sua Reserva de Dados de Combate.'),
  ]),
  unitRecord('block_33', 'p41-step-5-substep-b', ['line_33_3', 'line_33_4', 'line_33_5'], [
    bold('b.\u00A0Gaste Símbolos e use Habilidades no TESTE DE ATAQUE:'),
    regular(' Algumas Habilidades aumentam a rolagem. Nesta etapa, o Atacante pode gastar Símbolos e usar as que concedem bônus ao TESTE DE ATAQUE.'),
  ]),
  unitRecord('block_33', 'p41-step-5-substep-c', ['line_33_6', 'line_33_7', 'line_33_8', 'line_33_9', 'line_33_10', 'line_33_11'], [
    bold('c.\u00A0Verifique o acerto:'), regular(' Se a soma da Reserva de Dados de Combate, com bônus de Habilidades, igualar ou superar o Valor de Defesa do alvo, o Ataque acerta. Siga para a etapa '), bold('6. Determinar o Dano'),
    regular('. Se errar, vá direto à etapa '), bold('6e. Verificar o Contra-ataque'), regular('.'),
  ]),
  unitRecord('block_37', 'p41-step-6-heading', ['line_37_0'], [sectionHeading('6.\u00A0\u00A0DETERMINAR O DANO:')]),
  unitRecord('block_37', 'p41-step-6-substep-a', ['line_37_1', 'line_37_2', 'line_37_3'], [
    bold('a.\u00A0Calcule a margem do acerto:'), regular(' Cada ponto acima do Valor de Defesa do alvo acrescenta +1 de '), bold('DANO FÍSICO', 9), regular(' ao Ataque.'),
  ]),
  unitRecord('block_37', 'p41-step-6-substep-b', ['line_37_4', 'line_37_5', 'line_37_6', 'line_37_7'], [
    bold('b.\u00A0Gaste Símbolos e use Habilidades de Dano:'), regular(' Aventureiros e Combatentes podem gastar Símbolos e usar Habilidades que aumentam o Dano. Consulte '),
    boldItalic('Ícones, Condições, Tags e Símbolos'), regular(', pág. '), bold('30'), regular('.'),
  ]),
  unitRecord('block_37', 'p41-step-6-substep-c', ['line_37_8', 'line_37_9', 'line_37_10', 'line_37_11', 'line_37_12', 'line_37_13'], [
    bold('c.\u00A0Subtraia a Armadura:'), regular(' Do total de '), bold('DANO FÍSICO', 9), regular(', subtraia o Valor de Armadura do alvo. Cada Tag '), bold('+(X) PERFURAÇÃO DE ARMADURA', 9),
    regular(' ignora os primeiros (X) pontos de Armadura na redução do '), bold('DANO FÍSICO', 9), regular('. Tags de várias fontes se acumulam.'),
  ]),
  unitRecord('block_37', 'p41-step-6-substep-d', ['line_37_14', 'line_37_15', 'line_37_16', 'line_37_17', 'line_37_18', 'line_37_19'], [
    bold('d.\u00A0Calcule o Dano Final:'), regular(' O Dano restante após subtrair a Armadura é o Dano Final do Ataque. O alvo adiciona à sua Carta de Aventureiro ou de Combatente fichas de Dano iguais a esse total. Habilidades que citam o Dano Final são usadas nesta etapa.'),
  ]),
  unitRecord('block_37', 'p41-step-6-substep-e', ['line_37_20', 'line_37_21', 'line_37_22', 'line_37_23', 'line_37_24', 'line_37_25'], [
    bold('e.\u00A0Verifique o Contra-ataque:'), regular(' Se o Ataque errar ou não causar Dano Final, verifique se o alvo usa '), bold('CONTRA-ATACAR', 9), regular('. Se usar, o Ataque termina imediatamente (consulte '), boldItalic('Contra-atacar'), regular(', pág. '), bold('49'),
    regular('). Se errar e o alvo não contra-atacar, pule a etapa '), bold('7. Usar Habilidades de Continuação'), regular(' e siga para a '), bold('8. Resolver o Ataque'), regular('.'),
  ]),
  blockRecord('block_43', [
    marker('block_43', 'line_43_0', 0, 'tag.important.icon'), black('IMPORTANTE:'), bold(' '),
    regular('Escolher Contra-atacar ou usar uma Habilidade que conceda um Contra-ataque interrompe e cancela qualquer outra Ação ou Habilidade em andamento, exceto a Habilidade que concedeu o Contra-ataque.'),
  ]),
  unitRecord('block_44', 'p41-block-44-paragraph-1', ['line_44_0'], [sectionHeading('7.\u00A0\u00A0USAR HABILIDADES DE CONTINUAÇÃO (FU):')]),
  unitRecord('block_44', 'p41-block-44-paragraph-2', ['line_44_1', 'line_44_2', 'line_44_3', 'line_44_4'], [
    regular('O Atacante pode usar Habilidades que ocorrem durante a etapa de Continuação do Ataque. Se uma Habilidade FU iniciar um novo Ataque ou uma Ação de Feitiço, o Ataque atual termina imediatamente, e o jogador pode iniciar a nova Ação normalmente.'),
  ]),
  unitRecord('block_44', 'p41-block-44-paragraph-3', ['line_44_5', 'line_44_6', 'line_44_7'], [
    regular('Salvo indicação contrária, uma Habilidade FU que não inicia nova Ação deve ser usada por você e ter você ou a Miniatura atacada como alvo. Alcance, SOI e Linha de Visão não importam.'),
  ]),
  blockRecord('block_45', [regular('Se uma Habilidade FU exigir Força (X) para afetar o alvo, ela também é uma Habilidade Semelhante a Feitiço. Consulte '), boldItalic('Habilidades Semelhantes a Feitiço'), regular(', pág. '), bold('53'), regular('.')]),
  blockRecord('block_46', [
    marker('block_46', 'line_46_0', 0, 'tag.important.icon'), black('IMPORTANTE:'), bold(' '),
    regular('Os jogadores podem usar várias Habilidades FU após o mesmo Ataque, desde que não iniciem outra Ação Padrão ou Ação de Feitiço, nem movam uma Miniatura. Assim que o jogador decide usar uma Habilidade FU que inicia uma nova Ação de Ataque, uma Ação de Feitiço ou move uma Miniatura de qualquer maneira, a Ação de Ataque atual termina e ele não pode mais usar Habilidades FU.'),
  ]),
  unitRecord('block_47', 'p41-block-47-first-size-9pt', ['line_47_0'], [sectionHeading('8.\u00A0\u00A0RESOLVER O ATAQUE:')]),
  unitRecord('block_47', 'p41-block-47-remaining-size-10pt', ['line_47_1', 'line_47_2', 'line_47_3', 'line_47_4'], [
    regular('O Ataque atual termina. Agora podem ser usadas as Habilidades que ocorrem “ao resolver um Ataque”. Muitas Habilidades só podem ser usadas após “resolver” um Ataque. Se o jogador chegar a esta etapa de uma Ação de Ataque, o Ataque foi resolvido com sucesso.'),
  ]),
];

const candidateRecords = rows.map(row => row.record);
const keys = candidateRecords.map(record => record.spanKey);
assert.equal(candidateRecords.length, 36);
assert.equal(new Set(keys).size, candidateRecords.length, 'Duplicate p.41 translation keys');
assert.equal(candidateRecords.filter(record => record.spanKey === 'page_41_unit_p41-step-4-substep-b__pt-BR')[0]?.id, 242,
  'Existing Dodge Roll record must remain the exact preserved record');
const proposalOnlyRecords = rows.filter(row => row.kind !== 'existing-record-preserved-in-snapshot');
const renderedSymbols = candidateRecords.flatMap(record => record.data.segments.filter(item => item.symbolId).map(item => item.symbolId));
const expectedSymbols = inline.elements.slice().sort((a, b) =>
  a.anchor.blockIndex - b.anchor.blockIndex
  || String(a.anchor.lineId).localeCompare(String(b.anchor.lineId), undefined, { numeric: true })
  || a.anchor.spanIndex - b.anchor.spanIndex,
).map(item => item.symbolId);
assert.equal(renderedSymbols.length, 13, 'Every p.41 source inline symbol must be present once');
assert.deepEqual(renderedSymbols, expectedSymbols, 'p.41 semantic symbol order differs from source order');

const snapshotRecords = candidateRecords.map(record => {
  const source = existing.find(doc => doc.spanKey === record.spanKey);
  return source && record.id === source.id ? source : record;
});
const pageBox = {
  mediaBox: [0, 0, 820.3460083007812, 820.3460083007812],
  cropBox: [0, 0, 820.3460083007812, 820.3460083007812],
  bleedBox: [0, 0, 820.3460083007812, 820.3460083007812],
  trimBox: [14.173199653625488, 14.17303466796875, 806.1729736328125, 806.1728086471558],
  artBox: [14.173199653625488, 14.17303466796875, 806.1729736328125, 806.1728086471558],
};
const snapshot = {
  translations: snapshotRecords,
  layoutFrames: (framesPayload.docs ?? []).filter(doc => Number(doc.pageNumber) === 41),
  symbolAliasSettings: aliasPayload.docs ?? [],
  assetPages: [41], page: 41, patched: true, verifyRenderedSnapshot: true,
  sourcePageBoxes: { 41: pageBox },
};
const symbols = rows.flatMap(row => row.record.data.segments.filter(item => item.symbolId).map(item => item.symbolId));
const sourceHashes = {
  sourcePdf: expected.sourcePdf, dom: expected.dom,
  inlineElements: expected.inlineElements, background: expected.background,
};
const proposal = {
  page: 41, attempt, status: 'isolated-proposal-pending-human-review',
  sourceHashes, recordCount: candidateRecords.length, uniqueKeys: new Set(keys).size,
  newlyProposedRecordCount: proposalOnlyRecords.length,
  preservedExistingPayloadRecord: {
    id: 242, spanKey: 'page_41_unit_p41-step-4-substep-b__pt-BR',
    sha256: originalRecords.find(record => record.id === 242).sha256,
    action: 'preserved byte-for-byte in the export snapshot',
  },
  isolatedCandidateReplacement: {
    replacesExistingIdOnlyInSnapshot: 247,
    spanKey: 'page_41_unit_p41-step-4-substep-b-important__pt-BR',
    originalSha256: originalRecords.find(record => record.id === 247).sha256,
    action: 'candidate replacement in isolated snapshot; no Payload write',
  },
  sourceSymbolCount: inline.elements.length,
  embeddedSymbolCount: symbols.length,
  symbolCounts: symbols.reduce((count, id) => ({ ...count, [id]: (count[id] ?? 0) + 1 }), {}),
  sourceAssetHashes: copiedHashes,
  layoutFrames: snapshot.layoutFrames.length,
  symbolAliasSettings: snapshot.symbolAliasSettings.length,
  terminologyPendingHumanReview: [
    'Attack / Attack Action → Ataque / Ação de Ataque (local usage exists; broader canon review pending)',
    'Combat Dice Pool / Combat Pool → Reserva de Dados de Combate / Reserva de Combate',
    'Empower → Fortalecer; Counter → Contra-atacar; Follow Up Abilities → Habilidades de Continuação',
    'Combatant(s), Intelligent Combatant(s), Attacker, Defense Value, Armor Value, Final Damage, Armor Piercing, Physical DMG',
    'Spell Action, Spell-Like Ability, SOI, Target, Symbols, Tags, SP and capitalized game terms',
  ],
  copyfit: {
    attemptsAllowed: 3, attemptsUsed: attempt,
    status: attempt === 1
      ? 'first real Viewer/PDF render pending inspection'
      : 'second copyfit attempt after visible overflow in attempt 1',
    noFontOrFrameChanges: true,
  },
  records: rows.map(row => ({
    spanKey: row.record.spanKey, sourceText: row.sourceText,
    lineIds: row.lineIds, kind: row.kind, blockId: row.blockId,
    proposalText: row.record.data.segments.map(item => item.symbolId ? `[[symbol:${item.symbolId}]]` : item.text).join(''),
  })),
  translations: candidateRecords,
};
await immutableWrite(join(snapshotDir, `snapshot-p041-attack-action-v${attempt}-export.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
await immutableWrite(join(proofDir, `proposal-p041-attack-action-v${attempt}.json`), `${JSON.stringify(proposal, null, 2)}\n`);
const trackedProposalName = attempt === 1
  ? 'page-041-attack-action-proposal-2026-10-15.json'
  : `page-041-attack-action-proposal-2026-10-15-v${attempt}.json`;
await immutableWrite(join(root, 'docs/translations/proposals', trackedProposalName), `${JSON.stringify(proposal, null, 2)}\n`);
await immutableWrite(join(proofDir, `source-hashes-v${attempt}.json`), `${JSON.stringify({ sourcePdf: expected.sourcePdf, pageAssets: copiedHashes }, null, 2)}\n`);

console.log(JSON.stringify({
  page: 41, candidateRecords: candidateRecords.length, uniqueKeys: new Set(keys).size,
  sourceSymbols: inline.elements.length, embeddedSymbols: symbols.length,
  preexistingSavedRecords: originalRecords.map(({ id, spanKey, sha256: hash }) => ({ id, spanKey, sha256: hash })),
  layoutFrames: snapshot.layoutFrames.length, aliases: snapshot.symbolAliasSettings.length,
  snapshot: join(snapshotDir, `snapshot-p041-attack-action-v${attempt}-export.json`), sourceHashes,
}, null, 2));
