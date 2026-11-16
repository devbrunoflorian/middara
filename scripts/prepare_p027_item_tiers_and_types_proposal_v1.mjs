#!/usr/bin/env node
/** Prepare a recoverable full-page p.27 proposal and isolated viewer snapshot. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const pageNumber = 27;
const pageDir = resolve(root, 'apps/web/public/pages/page_027');
const pageDomRel = 'apps/web/public/pages/page_027/page_027_dom.json';
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1';
const proposalRel = 'docs/translations/proposals/page-027-item-tiers-and-types-proposal-2026-10-16-v1.json';
const markdownRel = 'docs/translations/proposals/page-027-item-tiers-and-types-proposal-2026-10-16-v1.md';
const snapshotRel = proofRel + '/snapshot-diagnostic-v1/snapshot.json';
const sourcePdfRel = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const dom = JSON.parse(await readFile(resolve(root, pageDomRel), 'utf8'));
const sourcePdf = await readFile(sourcePdfRel);
const readJson = async rel => JSON.parse(await readFile(resolve(root, rel), 'utf8'));
const oldSnapshotDir = resolve(root, 'output/proofs/important-family-validation-2026-10-13/p027-block_13/snapshot');
const oldSnapshot = await readJson('output/proofs/important-family-validation-2026-10-13/p027-block_13/snapshot/snapshot.json');
assert.equal(dom.page_number, pageNumber);
assert.equal(oldSnapshot.translations.length, 1);
const priorImportantRecord = oldSnapshot.translations[0];
assert.equal(priorImportantRecord.spanKey, 'page_27_block_2__pt-BR');

const plainBlockText = block => block.lines.map(line => line.spans.map(span => span.text ?? '').join('')).join(' ').replace(/\s+/gu, ' ').trim();
const blockById = new Map(dom.blocks.map((block, index) => [block.id, { ...block, index }]));
const block = id => {
  const value = blockById.get(id);
  assert.ok(value, 'Missing source block ' + id);
  return value;
};
const sourceSpans = value => value.lines.flatMap(line => line.spans).filter(span => (span.text ?? '').trim());
const firstStyle = value => {
  const span = sourceSpans(value).find(item => !/Bold|Black/u.test(item.font ?? '')) ?? sourceSpans(value)[0];
  const font = span.font ?? 'OptimaLTStd';
  const size = span.size ?? 10;
  const color = span.color ?? '#231f20';
  const weight = /Black/u.test(font) ? 900 : /Bold/u.test(font) || size >= 16 ? 700 : 400;
  return { font, size, color, weight, style: /Italic/u.test(font) ? 'italic' : 'normal', disableLigatures: true };
};
const segment = (text, style, overrides = {}) => ({ ...style, ...overrides, text });
const basicData = (text, source, emphasis = []) => {
  const base = firstStyle(source);
  const entries = [...emphasis].sort((a, b) => b.text.length - a.text.length);
  const segments = [];
  let cursor = 0;
  while (cursor < text.length) {
    let match = null;
    for (const entry of entries) {
      const index = text.indexOf(entry.text, cursor);
      if (index >= 0 && (!match || index < match.index || index === match.index && entry.text.length > match.entry.text.length)) {
        match = { index, entry };
      }
    }
    if (!match) {
      segments.push(segment(text.slice(cursor), base));
      break;
    }
    if (match.index > cursor) segments.push(segment(text.slice(cursor, match.index), base));
    segments.push(segment(match.entry.text, base, match.entry.style));
    cursor = match.index + match.entry.text.length;
  }
  return {
    schemaVersion: 2,
    segments: segments.filter(item => item.text.length),
    textAlign: 'left',
    lineHeight: 1.1,
    lineHeightMode: 'source',
    managedSourceSymbols: [],
  };
};
const style = (font, size, color, weight = 400, fontStyle = 'normal') => ({
  font, size, color, weight, style: fontStyle, disableLigatures: true,
});
const body = style('OptimaLTStd', 10, '#231f20');
const bold = style('OptimaLTStd-Bold', 10, '#231f20', 700);
const bold9 = style('OptimaLTStd-Bold', 9, '#231f20', 700);
const boldItalic = style('OptimaLTStd-BoldItalic', 10, '#231f20', 700, 'italic');
const cinzelLabel = style('Cinzel-Regular', 10, '#ffffff');
const tierPrefixData = (label, rest) => ({
  schemaVersion: 2,
  segments: [segment(label, bold9), segment(':', bold), segment(' ' + rest, body)],
  textAlign: 'left',
  lineHeight: 1.1,
  lineHeightMode: 'source',
  managedSourceSymbols: [],
});
const priceData = (tier, amount, unique = false) => {
  const prefix = unique ? 'ÚNICO ' + tier : tier;
  return {
    schemaVersion: 2,
    segments: [segment(prefix, bold9), segment(' = ', body), segment(String(amount), bold), segment(' de Ouro.', body)],
    textAlign: 'left',
    lineHeight: 1.05,
    lineHeightMode: 'source',
    managedSourceSymbols: [],
  };
};
const typeDescriptions = [
  ['Armas', 'Estas cartas aumentam a reserva de Dados de Combate do Aventureiro e servem para realizar Ataques.'],
  ['Armaduras', 'Estas cartas concedem Armadura aos Aventureiros e podem mantê-los vivos durante Encontros.'],
  ['Núcleos', 'Estes dispositivos mágicos ampliam a capacidade do Aventureiro de evitar dano e geralmente aumentam seu Valor de Defesa.'],
  ['Consumíveis', 'Estes Itens podem ser usados uma vez antes de serem descartados.'],
  ['Relíquias', 'As Relíquias oferecem vários benefícios quando equipadas.'],
  ['Acessórios', 'Estas cartas também ampliam a capacidade do Aventureiro de evitar dano e têm propriedades únicas.'],
];
const typeSegments = [];
typeDescriptions.forEach(([label, description], index) => {
  typeSegments.push(segment(label, cinzelLabel));
  typeSegments.push(segment(':', bold));
  typeSegments.push(segment(' ' + description + (index < typeDescriptions.length - 1 ? '\n' : ''), body));
});
const block31Data = {
  schemaVersion: 2,
  segments: typeSegments,
  textAlign: 'left',
  lineHeight: 1.1,
  lineHeightMode: 'source',
  managedSourceSymbols: [],
};

const translations = {
  block_11: {
    text: 'Com um Item que tenha Tag DOUBLE, o Aventureiro pode escolher qual lado equipar, seguindo as regras e limitações aplicáveis a qualquer outra Arma. Ao realizar uma Ação de Reequipar, jogadores podem reequipar Itens com Tag DOUBLE como se fossem duas cartas diferentes. Assim, podem virar o Item de duas faces para o lado oposto.',
    emphasis: [{ text: 'DOUBLE', style: { font: 'OptimaLTStd-Bold', size: 9, weight: 700 } }],
    terms: ['Item/Itens', 'Tag DOUBLE', 'Ação de Reequipar', 'Reequipar', 'Arma', 'Item de duas faces'],
  },
  block_12: {
    text: 'Alguns Itens de duas faces têm tipos diferentes conforme o lado equipado. Alguns deles podem ser Armas em ambos os lados; outros podem ter uma Arma de um lado e uma Relíquia do outro.',
    terms: ['Item', 'Item de duas faces', 'Arma', 'Relíquia'],
  },
  block_13: {
    text: priorImportantRecord.data.segments.filter(item => !item.symbolId).map(item => item.text ?? '').join(''),
    data: priorImportantRecord.data,
    markup: '[[symbol:tag.important.icon]]IMPORTANTE: Muitos Itens em Middara têm dois lados, mas não a Tag DOUBLE! Só Itens com a Tag DOUBLE podem ser tratados como dois Itens diferentes. Cuidado para não confundir Itens com Tag DOUBLE com Itens com a Tag [[symbol:marker.arrow]]VIRAR.',
    terms: ['DOUBLE, FLIP/VIRAR e Item aguardam validação no glossário; o rótulo IMPORTANTE e os dois símbolos seguem a proposta técnica reutilizada da validação anterior.'],
  },
  block_14: {
    text: 'À medida que o jogo avança, Aventureiros podem descobrir que alguns de seus Itens já não são úteis. Eles podem vender Itens antigos sempre que puderem Comprar e Treinar. Consulte Rodadas de História, p. 13. Use a tabela abaixo para determinar quanto Ouro é recebido por cada Item vendido.',
    emphasis: [{ text: 'Comprar e Treinar', style: { font: 'OptimaLTStd-Bold', size: 10, weight: 700 } }, { text: 'Rodadas de História', style: { font: 'OptimaLTStd-BoldItalic', size: 10, weight: 700, style: 'italic' } }],
    terms: ['Item', 'Aventureiros', 'Comprar e Treinar', 'Rodadas de História', 'Ouro', 'Gained'],
  },
  block_15: {
    text: '• Aprimoramentos de Item concedem 5 de Ouro extra por Aprimoramento equipado. Para vender um Aprimoramento de Item, também é preciso vender o Item ao qual está equipado.\n• Itens Consumíveis podem ser vendidos por 1 de Ouro, independentemente do Nível de Saque. Consumíveis que não estiverem equipados em um Aventureiro ou não forem vendidos durante uma Rodada de História são descartados ao fim de Comprar e Treinar.\n• Para o preço de venda do Saque de Monstro, consulte Desbloqueando Aprimoramentos de Item, p. 28.\n• Acessórios podem ser vendidos pelo preço de um Item do Nível de Saque atual ou pelo custo em Ouro impresso na carta, o que for menor.\n• Depois de vendidos, Itens Únicos são removidos da Aventura.\n• Itens de História nunca podem ser vendidos.',
    emphasis: [
      { text: '5', style: { font: 'OptimaLTStd-Bold', size: 10, weight: 700 } },
      { text: '1', style: { font: 'OptimaLTStd-Bold', size: 10, weight: 700 } },
      { text: 'Comprar e Treinar', style: { font: 'OptimaLTStd-Bold', size: 10, weight: 700 } },
      { text: 'Saque de Monstro', style: { font: 'OptimaLTStd-Bold', size: 10, weight: 700 } },
      { text: 'Desbloqueando Aprimoramentos de Item', style: { font: 'OptimaLTStd-BoldItalic', size: 10, weight: 700, style: 'italic' } },
      { text: 'Itens de História', style: { font: 'OptimaLTStd-Bold', size: 10, weight: 700 } },
    ],
    terms: ['Aprimoramento de Item (glossário)', 'Consumível', 'Nível de Saque', 'Aventureiro', 'Rodada de História', 'Comprar e Treinar (glossário)', 'Saque de Monstro', 'Acessório', 'Item Único', 'Item de História'],
  },
  block_16: {
    text: 'A Espada Longa tem Tag DOUBLE e pode ser equipada por qualquer uma das faces. A face traseira usa duas Mãos; a frontal, uma. Assim, quem usa uma Espada Longa tem muitas opções, conforme seu estilo de jogo.',
    emphasis: [{ text: 'DOUBLE', style: { font: 'OptimaLTStd-Bold', size: 9, weight: 700 } }],
    terms: ['Long Sword → Espada Longa', 'Tag DOUBLE', '2-Handed/1-Handed → duas Mãos/uma Mão'],
  },
  block_17: { text: 'MUNDANO = 5 de Ouro.', data: priceData('MUNDANO', 5), terms: ['Mundane → Mundano', 'Gold → Ouro'] },
  block_18: { text: 'COMUM = 10 de Ouro.', data: priceData('COMUM', 10), terms: ['Common → Comum', 'Gold → Ouro'] },
  block_19: { text: 'INCOMUM = 15 de Ouro.', data: priceData('INCOMUM', 15), terms: ['Uncommon → Incomum', 'Gold → Ouro'] },
  block_20: { text: 'RARO = 20 de Ouro.', data: priceData('RARO', 20), terms: ['Rare → Raro', 'Gold → Ouro'] },
  block_21: { text: 'Níveis', terms: ['Tier → Nível (candidato contextual)'] },
  block_23: { text: 'Há 4 Níveis diferentes de Itens no Ato 1 de Middara.', terms: ['Tier → Nível', 'Act → Ato', 'Item'] },
  block_24: { text: 'MUNDANO: Estes Itens estão disponíveis por todo o mundo de Middara.', data: tierPrefixData('MUNDANO', 'Estes Itens estão disponíveis por todo o mundo de Middara.'), terms: ['Mundane → Mundano', 'Item'] },
  block_25: { text: 'COMUM: Estes Itens são mágicos por natureza. São comuns o bastante para que muitas pessoas possam obtê-los.', data: tierPrefixData('COMUM', 'Estes Itens são mágicos por natureza. São comuns o bastante para que muitas pessoas possam obtê-los.'), terms: ['Common → Comum', 'Item'] },
  block_26: { text: 'INCOMUM: Estes Itens são bem mais raros, e só Aventureiros que frequentam masmorras e tumbas perdidas provavelmente os encontrarão.', data: tierPrefixData('INCOMUM', 'Estes Itens são bem mais raros, e só Aventureiros que frequentam masmorras e tumbas perdidas provavelmente os encontrarão.'), terms: ['Uncommon → Incomum', 'Adventurer → Aventureiro', 'dungeon → masmorra'] },
  block_27: { text: 'RARO: Estes Itens são especiais e têm história própria. Com o tempo, é comum que Aventureiros bem-sucedidos consigam Itens Raros.', data: tierPrefixData('RARO', 'Estes Itens são especiais e têm história própria. Com o tempo, é comum que Aventureiros bem-sucedidos consigam Itens Raros.'), terms: ['Rare → Raro', 'Adventurer → Aventureiro'] },
  block_28: { text: 'ÚNICO: Há versões Únicas disponíveis para todas as categorias acima. Itens Únicos têm uma história própria. Consulte Saque Único, p. 57.', data: tierPrefixData('ÚNICO', 'Há versões Únicas disponíveis para todas as categorias acima. Itens Únicos têm uma história própria. Consulte Saque Único, p. 57.'), terms: ['Unique → Único', 'Tier → Nível', 'Unique Loot → Saque Único'] },
  block_29: { text: 'Tipos', terms: ['Type → Tipo'] },
  block_31: {
    text: typeDescriptions.map(([label, description]) => label + ': ' + description).join('\n'),
    data: block31Data,
    terms: ['Weapon → Arma', 'Armor → Armadura', 'Core → Núcleo', 'Consumable → Consumível', 'Relic → Relíquia', 'Accessory → Acessório', 'Combat Dice Pool', 'Attack', 'Defense Value'],
  },
  block_32: { text: 'Itens com Tag DOUBLE', terms: ['DOUBLE Tag → Tag DOUBLE', 'Item'] },
  block_34: {
    text: 'Muitos Itens em Middara têm duas faces. Alguns têm Tag DOUBLE e funções e Habilidades diferentes conforme o lado que fica voltado para cima quando equipados.',
    emphasis: [{ text: 'DOUBLE', style: { font: 'OptimaLTStd-Bold', size: 9, weight: 700 } }],
    terms: ['Item', 'DOUBLE Tag → Tag DOUBLE', 'Ability → Habilidade'],
  },
  block_35: {
    text: 'Níveis e Tipos de Itens',
    data: {
      schemaVersion: 2,
      segments: [segment('Níveis e Tipos de Itens', style('Cinzel-Regular', 18, '#231f20', 700))],
      textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [],
    },
    terms: ['Tier → Nível', 'Item(s)'],
  },
  block_37: { text: 'Venda de Itens', terms: ['Selling → Venda', 'Item'] },
  block_39: { text: 'ÚNICO MUNDANO = 10 de Ouro.', data: priceData('MUNDANO', 10, true), terms: ['Unique Mundane', 'Gold → Ouro'] },
  block_40: { text: 'ÚNICO COMUM = 20 de Ouro.', data: priceData('COMUM', 20, true), terms: ['Unique Common', 'Gold → Ouro'] },
  block_41: { text: 'ÚNICO INCOMUM = 30 de Ouro.', data: priceData('INCOMUM', 30, true), terms: ['Unique Uncommon', 'Gold → Ouro'] },
  block_42: { text: 'ÚNICO RARO = 40 de Ouro.', data: priceData('RARO', 40, true), terms: ['Unique Rare', 'Gold → Ouro'] },
  block_111: {
    text: 'Cartas com Tag DOUBLE',
    data: {
      schemaVersion: 2,
      segments: [segment('Cartas com Tag DOUBLE', style('Cinzel-Regular', 14, '#ffffff', 700))],
      textAlign: 'center', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [],
    },
    terms: ['Double Tag → Tag DOUBLE', 'Card → Carta'],
  },
  block_384: {
    text: 'A Varinha de Mísseis também tem Tag DOUBLE, mas, ao contrário da Espada Longa, pode ser equipada como Arma ou Relíquia.',
    emphasis: [{ text: 'DOUBLE', style: { font: 'OptimaLTStd-Bold', size: 9, weight: 700 } }],
    terms: ['Wand of Missiles → Varinha de Mísseis', 'Tag DOUBLE', 'Weapon → Arma', 'Relic → Relíquia'],
  },
  block_385: {
    text: 'O Núcleo de Deflexão não tem Tag DOUBLE; por isso, só pode ser equipado pela face frontal, a menos que tenha sido Virado antes. A face frontal indica que a Habilidade do Núcleo de passar em um Teste de Convicção ainda não foi usada. Quando o Aventureiro usa essa Habilidade, o Item vira.',
    emphasis: [
      { text: 'DOUBLE', style: { font: 'OptimaLTStd-Bold', size: 9, weight: 700 } },
      { text: 'não', style: { font: 'OptimaLTStd-Bold', size: 10, weight: 700 } },
    ],
    terms: ['Deflection Core → Núcleo de Deflexão', 'DOUBLE Tag', 'Flip/Flipped → virar/virado', 'Conviction Check → Teste de Convicção'],
  },
};

const candidates = Object.entries(translations).map(([blockId, spec]) => {
  const source = block(blockId);
  const spanKey = 'page_27_block_' + source.index;
  let data = spec.data ?? basicData(spec.text, source, spec.emphasis ?? []);
  if (blockId === 'block_35') data = { ...data, textAlign: 'left' };
  return {
    sourceBlockId: blockId,
    sourceUnitIds: source.typographicSpanUnits?.map(unit => unit.id) ?? [],
    blockIndex: source.index,
    sourceText: plainBlockText(source),
    proposalText: spec.text,
    proposalMarkup: spec.markup ?? spec.text,
    spanKey,
    legacyBlockSpanKey: spanKey + '__pt-BR',
    language: 'pt-BR',
    data,
    diagnosticData: data,
    status: 'draft_pending_viewer_editor_pdf_copyfit_human_review',
    technicalStatus: 'pending_viewer_editor_pdf_copyfit',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    sourceLineCount: source.lines.length,
    sourceBboxes: source.lines.map(line => line.bbox),
    pendingTerms: spec.terms ?? [],
    editorUnitKey: spanKey,
  };
});
assert.equal(candidates.length, 30);

const overlayGroups = [
  {
    id: 'p27-double-tag-long-sword-art',
    title: 'Long Sword',
    sourceBlockIds: ['block_45','block_100','block_101','block_102','block_104','block_106','block_109','block_114','block_169','block_170','block_171','block_172','block_174','block_175','block_177'],
    overlayUrl: '/pages/page_027/fidelity-overlay-component-long-sword-double-tag-pair.png',
    spanKeys: ['page_27_block_27','page_27_block_28','page_27_block_29','page_27_block_30','page_27_block_31','page_27_block_32','page_27_block_33','page_27_block_35','page_27_block_36','page_27_block_37','page_27_block_38','page_27_block_39','page_27_block_40','page_27_block_41','page_27_block_42'],
    proposedText: 'ESPADA LONGA; ESPADA • ESPADA LONGA • DUPLA; valores 18 e 1 preservados; COMBO: LEVE; FINESSE: LARANJA; COMBO: ESPADA — Seus Ataques recebem +1 DANO FÍSICO; COMBO: ESPADA LONGA — Seus Ataques recebem +2 DANO FÍSICO; +2 DANO FÍSICO; +1 DANO FÍSICO. ESPADA LONGA; ESPADA • ESPADA LONGA • DUPLA; PASSIVA — Você pode CONTRA-ATACAR o primeiro Ataque de cada rodada que não causar Dano ou errar você; este Item não pode ter mais de 1 Aprimoramento; EXAUSTAR — ESQUIVA; ARMA MUNDANA; valores e número de série preservados.',
    terms: ['Long Sword, Double, Combo, Finesse, Counter, Dodge, Physical Damage e a nomenclatura dos valores aguardam revisão humana.'],
  },
  {
    id: 'p27-double-tag-wand-of-missiles-art',
    title: 'Wand of Missiles',
    sourceBlockIds: ['block_181','block_236','block_237','block_240','block_241','block_243','block_244','block_248','block_249','block_251','block_306','block_307','block_308'],
    overlayUrl: '/pages/page_027/fidelity-overlay-component-wand-double-tag-pair.png',
    spanKeys: ['page_27_block_43','page_27_block_44','page_27_block_45','page_27_block_46','page_27_block_47','page_27_block_48','page_27_block_49','page_27_block_50','page_27_block_51','page_27_block_52','page_27_block_53','page_27_block_54','page_27_block_55'],
    proposedText: 'VARINHA DE MÍSSEIS; FEITIÇARIA • VARINHA • DUPLA; valor 18 preservado; COMBO: VARINHA; EXAUSTAR — Ao escolher o(s) alvo(s) de um Feitiço, aumente sua SOI em +2; COMBO: FEITIÇARIA; POR ENCONTRO — Ao escolher o(s) alvo(s) de um Feitiço, aumente sua SOI em +2; ARMA MUNDANA; RELÍQUIA MUNDANA; valores e números de série preservados.',
    terms: ['Wand of Missiles, Spellcraft, Double, Exhaust, Spell, target(s), SOI e rótulos de raridade aguardam revisão humana.'],
  },
  {
    id: 'p27-deflection-core-double-tag-art',
    title: 'Deflection Core',
    sourceBlockIds: ['block_312','block_367','block_368','block_370','block_372','block_376','block_378','block_379','block_380','block_382','block_386'],
    overlayUrl: '/pages/page_027/fidelity-overlay-component-deflection-core-double-tag-pair.png',
    spanKeys: ['page_27_block_56','page_27_block_57','page_27_block_58','page_27_block_59','page_27_block_60','page_27_block_61','page_27_block_62','page_27_block_63','page_27_block_64','page_27_block_65','page_27_block_68'],
    proposedText: 'NÚCLEO DE DEFLEXÃO; valor 20 preservado; NÚCLEO DE DEFLEXÃO; PASSIVA — Aprimoramento de Convicção: BRANCO; VIRAR — Ao fazer um Teste de Convicção, passe em um Teste de Convicção; valores +1 preservados; NÚCLEO MUNDANO; valores e número de série preservados. O X vermelho do diagrama é um símbolo impresso, sem tradução.',
    terms: ['Deflection, Core, Passive, Conviction Upgrade, WHITE, FLIP, Conviction Check e Mundane aguardam revisão humana.'],
  },
];
const sourceReview = {
  status: 'official_pdf_static_review_reused_and_current_english_viewer_export_reviewed_2026-10-16',
  page: 27,
  sourcePdf: sourcePdfRel,
  sourcePdfSha256: sha256(sourcePdf),
  sourceRaster: 'output/proofs/full-symbol-integrity-2026-10-13/pages/p027/source.webp',
  englishViewer: proofRel + '/viewer-en-source-v1.png',
  englishExport: proofRel + '/page-027-en-source-v1.pdf',
  fidelityNote: 'The existing p.27 static review classified the three sample-card pairs as artwork crops and preserved the foreground explanatory text. The current English Viewer and one-page export were captured; the explanatory line after the Deflection Core crop begins 0.066 pt below its boundary and was visually inspected with no collision in the full-page Viewer. Card text remains artwork and is kept out of editable prose.',
  sourceDomSha256: sha256(await readFile(resolve(root, pageDomRel))),
  backgroundSha256: sha256(await readFile(resolve(pageDir, 'background.webp'))),
  layoutFramesSha256: sha256(await readFile(resolve(pageDir, 'layout_frames.json'))),
  fidelityOverlaysSha256: sha256(await readFile(resolve(pageDir, 'fidelity_overlays.json'))),
  inlineElementsSha256: sha256(await readFile(resolve(pageDir, 'inline_elements.json'))),
  existingPayloadTranslations: 0,
  existingPayloadLayoutFrames: 0,
  staticSourceReview: 'docs/project-progress/2026-10-04-page27-visual-recheck.md',
  payloadWrites: 0,
};
const artworkExceptions = overlayGroups.map(group => {
  const sourceBlocks = group.sourceBlockIds.map(id => block(id));
  const boxes = sourceBlocks.map(item => item.bbox);
  return {
    ...group,
    category: 'printed_artwork_localization',
    sourceText: sourceBlocks.map(item => plainBlockText(item)).join(' | '),
    bboxPt: [
      Math.min(...boxes.map(box => box[0])), Math.min(...boxes.map(box => box[1])),
      Math.max(...boxes.map(box => box[2])), Math.max(...boxes.map(box => box[3])),
    ],
    reason: 'The complete item-card pair is restored by a source-art fidelity overlay and its extracted strings are marked rasterized duplicates; a PT-BR text overlay would duplicate words inside the card art.',
    requiredAction: 'Localize the complete card-pair artwork while preserving stats, costs, symbols and serial marks, then verify the localized cards against the full page.',
    status: 'pending_human_review',
  };
});

const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const transUrl = new URL('/api/translations', payloadUrl);
transUrl.searchParams.set('where[language][equals]', 'pt-BR');
transUrl.searchParams.set('limit', '5000');
const transResponse = await fetch(transUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(transResponse.ok, 'Payload translations GET failed: ' + transResponse.status);
const transDocs = (await transResponse.json()).docs ?? [];
const preexistingTranslations = transDocs.filter(item => String(item.spanKey ?? '').startsWith('page_27_'));
const framesUrl = new URL('/api/layout-frames', payloadUrl);
framesUrl.searchParams.set('limit', '5000');
const framesResponse = await fetch(framesUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(framesResponse.ok, 'Payload layout-frames GET failed: ' + framesResponse.status);
const frameDocs = (await framesResponse.json()).docs ?? [];
const preexistingFrames = frameDocs.filter(item => Number(item.pageNumber) === pageNumber);
assert.equal(preexistingTranslations.length, 0);
assert.equal(preexistingFrames.length, 0);

const snapshotDir = resolve(root, proofRel + '/snapshot-diagnostic-v1');
await mkdir(resolve(root, proofRel), { recursive: true });
await cp(oldSnapshotDir, snapshotDir, { recursive: true, errorOnExist: true });
const snapshotPageDir = resolve(snapshotDir, 'pages/page_027');
await cp(pageDir, snapshotPageDir, { recursive: true, force: true });
const snapshot = JSON.parse(await readFile(resolve(snapshotDir, 'snapshot.json'), 'utf8'));
snapshot.translations = candidates.map(candidate => ({
  spanKey: candidate.legacyBlockSpanKey,
  language: 'pt-BR',
  data: candidate.data,
}));
snapshot.diagnosticOnly = { proposalId: 'page-027-item-tiers-and-types-2026-10-16-v1', blankedSpanKeys: [] };
await writeFile(resolve(snapshotDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');

const proposal = {
  schemaVersion: 1,
  proposalId: 'page-027-item-tiers-and-types-2026-10-16-v1',
  page: 27,
  locale: 'pt-BR',
  title: 'Níveis e Tipos de Itens',
  sourcePdf: sourcePdfRel,
  sourcePdfSha256: sourceReview.sourcePdfSha256,
  sourceDomSha256: sourceReview.sourceDomSha256,
  backgroundSha256: sourceReview.backgroundSha256,
  layoutFramesSha256: sourceReview.layoutFramesSha256,
  fidelityOverlaysSha256: sourceReview.fidelityOverlaysSha256,
  inlineElementsSha256: sourceReview.inlineElementsSha256,
  status: 'draft_pending_viewer_editor_pdf_copyfit_human_review_artwork_review',
  counts: {
    candidates: candidates.length,
    verifiedInViewer: 0,
    verifiedInEditor: 0,
    verifiedInPdf: 0,
    preservedHumanRecords: 0,
    artworkExceptions: artworkExceptions.length,
    technicalExceptions: 0,
  },
  sourceReview,
  preservedHumanRecords: [],
  candidates,
  artworkExceptions,
  unchangedSourceContent: [
    { sourceText: 'The six restored sample-card faces, their icons, statistics, costs and serial marks.', reason: 'They remain part of the source artwork; the three card-pair images are tracked as artwork localization groups.' },
    { sourceText: 'Page number 27 and all printed numeric values.', reason: 'Language-independent page numbers, stats and costs remain unchanged in localized artwork.' },
  ],
  payload: {
    readOnlyMethod: 'GET',
    existingPageRecords: preexistingTranslations.length,
    existingPageLayoutFrames: preexistingFrames.length,
    writes: 0,
  },
  diagnosticFailurePolicy: 'In the PT-BR diagnostic snapshot, blank only a failed text unit. Never display English fallback or partial translated prose in a failed region. Preserve the full source and proposed translation in the proposal and exception queue; keep source artwork visible. Do not persist a blank value to Payload.',
};
await writeFile(resolve(root, proposalRel), JSON.stringify(proposal, null, 2) + '\n');

const md = [
  '# p.27 — proposta PT-BR “Níveis e Tipos de Itens” v1',
  '',
  '**Estado:** 30 unidades textuais têm proposta; Viewer, Editor, copyfit e PDF de uma página ainda precisam ser verificados. Três pares de cartas seguem como exceções de arte. Zero traduções humanas preexistentes e zero writes no Payload.',
  '',
  '## Unidades editáveis',
  '',
  ...candidates.flatMap(candidate => [
    '### ' + candidate.sourceBlockId + ' / ' + candidate.spanKey,
    '',
    '**EN:** ' + candidate.sourceText,
    '',
    '**PT-BR proposto:** ' + candidate.proposalText,
    '',
    '**Revisão pendente:** ' + candidate.pendingTerms.join('; '),
    '',
  ]),
  '## Texto impresso na arte',
  '',
  ...artworkExceptions.flatMap(item => [
    '### ' + item.id,
    '',
    '**EN:** ' + item.sourceText,
    '',
    '**PT-BR proposto:** ' + item.proposedText,
    '',
    '**Ação:** ' + item.requiredAction,
    '',
  ]),
  '## Fonte',
  '',
  'A captura integral atual do Viewer EN e o PDF isolado de uma página foram comparados visualmente ao render oficial preservado no histórico da p.27. Os pares de cartas usam crops de arte já registrados; a prosa explicativa permanece viva fora deles.',
  '',
].join('\n');
await writeFile(resolve(root, markdownRel), md);

console.log(JSON.stringify({
  status: 'p027_full_page_translation_proposal_and_diagnostic_snapshot_prepared',
  candidateCount: candidates.length,
  artworkExceptionCount: artworkExceptions.length,
  sourcePdfSha256: sourceReview.sourcePdfSha256,
  sourceDomSha256: sourceReview.sourceDomSha256,
  preexistingPayloadTranslations: preexistingTranslations.length,
  preexistingPayloadFrames: preexistingFrames.length,
  snapshot: snapshotRel,
  proposal: proposalRel,
  payloadWrites: 0,
}, null, 2));
