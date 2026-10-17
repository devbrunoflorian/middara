#!/usr/bin/env node
/** Build a source-first, read-only p.26 PT-BR proposal and diagnostic snapshot. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const page = 26;
const sourceDir = resolve(root, 'apps/web/public/pages/page_026');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p026-item-card-types-proposal-v1');
const sourceReviewDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1');
const snapshotDir = join(proofDir, 'snapshot');
const proposalRel = 'docs/translations/proposals/page-026-item-card-types-proposal-2026-10-16-v1.json';
const markdownRel = 'docs/translations/proposals/page-026-item-card-types-proposal-2026-10-16-v1.md';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const mustNotExist = async path => {
  try { await access(path); throw new Error('Refusing to overwrite existing artifact: ' + path); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
};
for (const path of [proofDir, resolve(root, proposalRel), resolve(root, markdownRel)]) await mustNotExist(path);

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const dom = await readJson(join(sourceDir, 'page_026_dom.json'));
const layoutFramesSidecar = await readJson(join(sourceDir, 'layout_frames.json'));
const norm = value => String(value ?? '').replace(/[\u0000-\u001f\u007f\u00a0]+/gu, ' ').replace(/\s+/gu, ' ').trim();
const sourceBlock = id => {
  const block = dom.blocks.find(item => item.id === id);
  assert.ok(block, 'Missing p.26 source block ' + id);
  return block;
};
const blockText = block => norm(block.lines.flatMap(line => line.spans.map(span => span.text)).join(''));
const blockIndex = id => {
  const index = dom.blocks.findIndex(item => item.id === id);
  assert.ok(index >= 0, 'Missing rendered block index for ' + id);
  return index;
};
const blockBoxes = block => block.lines.flatMap(line => line.spans
  .filter(span => span.text.trim() && !span.sourceEditorOnly)
  .map(span => span.bbox));
const bboxUnion = boxes => {
  const valid = boxes.filter(box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite));
  assert.ok(valid.length, 'Expected source text boxes.');
  return [
    Math.min(...valid.map(box => box[0])), Math.min(...valid.map(box => box[1])),
    Math.max(...valid.map(box => box[2])), Math.max(...valid.map(box => box[3])),
  ];
};
const spanRefs = (block, unit) => unit.spanRefs.map(reference => {
  const separator = reference.lastIndexOf(':');
  const lineId = reference.slice(0, separator);
  const spanIndex = Number(reference.slice(separator + 1));
  const line = block.lines.find(item => item.id === lineId);
  assert.ok(line, 'Missing source line ' + lineId);
  const span = line.spans.find((item, index) => (item.sourceSpanIndex ?? index) === spanIndex);
  assert.ok(span, 'Missing source span ' + reference);
  return { line, span, spanIndex };
});
const unitParts = (block, unitId) => {
  const editorialUnit = block.typographicUnits?.find(item => item.id === unitId);
  if (editorialUnit) {
    const lines = editorialUnit.field.lineIds.map(id => {
      const line = block.lines.find(item => item.id === id);
      assert.ok(line, 'Missing source line ' + id);
      return line;
    });
    return {
      parts: lines.flatMap(line => line.spans.filter(span => span.text.trim()).map((span, index) => ({ line, span, spanIndex: index }))),
      lineCount: lines.length,
    };
  }
  const spanUnit = block.typographicSpanUnits?.find(item => item.id === unitId);
  assert.ok(spanUnit, 'Missing p.26 typographic unit ' + unitId);
  const parts = spanRefs(block, spanUnit);
  return { parts, lineCount: new Set(parts.map(part => part.line.id)).size };
};
const styleFrom = span => ({
  font: span.font ?? 'OptimaLTStd',
  size: span.size ?? 10,
  color: span.color ?? '#ffffff',
  weight: span.renderWeightOverride ?? ((span.flags ?? 0) & 16 ? 700 : 400),
  style: /Italic/iu.test(span.font ?? '') || ((span.flags ?? 0) & 2) ? 'italic' : 'normal',
  disableLigatures: true,
});
const segment = (text, style) => ({ ...style, text });
const candidateUnit = ({ block, unitId, proposalText, pendingTerms, richSegments, copyfitNote = null }) => {
  const { parts, lineCount } = unitParts(block, unitId);
  const sourceText = norm(parts.map(part => part.span.text).join(''));
  const sourceBboxes = parts.map(part => part.span.bbox);
  const anchor = parts.find(part => part.span.text.trim())?.span ?? parts[0].span;
  const data = {
    schemaVersion: 2,
    segments: richSegments ?? [segment(proposalText, styleFrom(anchor))],
    textAlign: 'left',
    lineHeight: 1,
    lineHeightMode: 'source',
    managedSourceSymbols: [],
  };
  const spanKey = `page_${page}_unit_${unitId}__pt-BR`;
  return {
    sourceBlockId: block.id,
    sourceUnitId: unitId,
    blockIndex: blockIndex(block.id),
    sourceText,
    proposalText,
    proposalMarkup: proposalText,
    spanKey,
    legacyBlockSpanKey: `page_${page}_block_${blockIndex(block.id)}__pt-BR`,
    language: 'pt-BR',
    data,
    diagnosticData: data,
    status: 'draft_pending_viewer_editor_pdf_human_review',
    technicalStatus: 'pending_viewer_editor_and_pdf',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    sourceLineCount: lineCount,
    sourceBboxes,
    pendingTerms,
    notes: copyfitNote ? [copyfitNote] : [],
    editorUnitKey: spanKey,
  };
};
const candidateBlock = ({ block, proposalText, pendingTerms, textAlign = 'center', weight = 700 }) => {
  const sourceSpan = block.lines.flatMap(line => line.spans).find(span => span.text.trim());
  assert.ok(sourceSpan, 'Title has no source span: ' + block.id);
  const spanKey = `page_${page}_block_${blockIndex(block.id)}`;
  const data = {
    schemaVersion: 2,
    segments: [segment(proposalText, { ...styleFrom(sourceSpan), weight })],
    textAlign,
    lineHeight: 1.1,
    lineHeightMode: 'source',
    managedSourceSymbols: [],
  };
  return {
    sourceBlockId: block.id,
    sourceUnitId: null,
    blockIndex: blockIndex(block.id),
    sourceText: blockText(block),
    proposalText,
    proposalMarkup: proposalText,
    spanKey,
    legacyBlockSpanKey: `${spanKey}__pt-BR`,
    language: 'pt-BR',
    data,
    diagnosticData: data,
    status: 'draft_pending_viewer_editor_pdf_human_review',
    technicalStatus: 'pending_viewer_editor_and_pdf',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    sourceLineCount: block.lines.length,
    sourceBboxes: blockBoxes(block),
    pendingTerms,
    notes: [],
    editorUnitKey: spanKey,
  };
};

const candidates = [
  candidateBlock({ block: sourceBlock('block_12'), proposalText: 'Tipos de Cartas de Item', pendingTerms: ['Item Card → Carta de Item é uma proposta de composto; confirmar “Item” e capitalização no glossário.'] }),
  candidateBlock({ block: sourceBlock('block_14'), proposalText: 'Componentes da Carta de Item', pendingTerms: ['Item Card Breakdown → Componentes da Carta de Item mantém a forma “Componentes da Carta” usada na p.25; confirmar o composto.'] }),
  candidateUnit({ block: sourceBlock('block_473'), unitId: 'p26-block-473-first-size-9pt', proposalText: 'NOME DO ITEM:', pendingTerms: ['Item → Item e a capitalização funcional do rótulo aguardam revisão humana.'] }),
  candidateUnit({ block: sourceBlock('block_473'), unitId: 'p26-block-473-remaining-size-10pt', proposalText: 'Nome do Item.', pendingTerms: ['Item → Item e a capitalização do termo no corpo aguardam revisão humana.'] }),
  candidateUnit({ block: sourceBlock('block_474'), unitId: 'p26-block-474-first-size-9pt', proposalText: 'CUSTO:', pendingTerms: ['A capitalização do rótulo é uma proposta editorial.'] }),
  candidateUnit({ block: sourceBlock('block_474'), unitId: 'p26-block-474-remaining-size-10pt', proposalText: 'Custo em Ouro para comprar o Item.', pendingTerms: ['Gold → Ouro e Item → Item são propostas locais; confirmar capitalização mecânica.'] }),
  candidateUnit({ block: sourceBlock('block_475'), unitId: 'p26-block-475-first-size-9pt', proposalText: 'ÍCONES DO ITEM:', pendingTerms: ['Item → Item e a capitalização de Ícones são propostas locais.'] }),
  candidateUnit({
    block: sourceBlock('block_475'), unitId: 'p26-block-475-remaining-size-10pt',
    proposalText: 'A maioria dos Itens contém Ícones. Os Ícones exibidos variam conforme o tipo do Item e suas propriedades exclusivas. Consulte Ícones, Condições, Tags e Símbolos, p. 30.',
    richSegments: [
      segment('A maioria dos Itens contém Ícones. Os Ícones exibidos variam conforme o tipo do Item e suas propriedades exclusivas. Consulte ', { ...styleFrom(sourceBlock('block_475').lines[1].spans[0]), size: 10 }),
      segment('Ícones, Condições, Tags e Símbolos', { font: 'OptimaLTStd-BoldItalic', size: 10, color: '#ffffff', weight: 700, style: 'italic', disableLigatures: true }),
      segment(', p. 30.', { font: 'OptimaLTStd', size: 10, color: '#ffffff', weight: 400, style: 'normal', disableLigatures: true }),
    ],
    pendingTerms: ['Item → Item, Icon → Ícone e Tag → Tag são propostas locais; confirmar capitalização e o nome da referência.'],
    copyfitNote: 'Preserve o título da referência em negrito e itálico como no original.',
  }),
  candidateUnit({ block: sourceBlock('block_476'), unitId: 'p26-block-476-first-size-9pt', proposalText: 'TAGS DO ITEM:', pendingTerms: ['Item → Item e a capitalização de Tag são propostas locais.'] }),
  candidateUnit({ block: sourceBlock('block_476'), unitId: 'p26-block-476-remaining-size-10pt', proposalText: 'As Tags listadas aqui descrevem o tipo de Arma. Elas são Passivas e permanecem sempre ativas enquanto esses Itens estiverem em uso.', pendingTerms: ['Tag, Weapon → Arma, Passive → Passiva e Item → Item são propostas locais, ausentes do glossário oficial.'] }),
  candidateUnit({ block: sourceBlock('block_477'), unitId: 'p26-block-477-first-size-9pt', proposalText: 'TEXTO DO ITEM:', pendingTerms: ['Item → Item e a capitalização do rótulo aguardam revisão humana.'] }),
  candidateUnit({ block: sourceBlock('block_477'), unitId: 'p26-block-477-remaining-size-10pt', proposalText: 'Esta seção da carta contém Habilidades que podem ser usadas enquanto o Item estiver equipado.', pendingTerms: ['Ability → Habilidade e Item → Item são propostas locais; confirmar capitalização.'] }),
  candidateUnit({ block: sourceBlock('block_478'), unitId: 'p26-block-478-font-size-9pt-unit-00', proposalText: 'HABILIDADES COM SÍMBOLOS:', pendingTerms: ['Symbol Abilities → Habilidades com Símbolos é uma proposta de rótulo; revisar capitalização.'] }),
  candidateUnit({ block: sourceBlock('block_479'), unitId: 'p26-block-479-first-size-9pt', proposalText: 'NÍVEL E TIPO DO ITEM:', pendingTerms: ['Tier → Nível segue a proposta contextual de glossary-candidates.md e continua sem aprovação.'] }),
  candidateUnit({ block: sourceBlock('block_479'), unitId: 'p26-block-479-remaining-size-10pt', proposalText: 'O Nível e o tipo do Item estão indicados aqui.', pendingTerms: ['Tier → Nível permanece candidato contextual; Item → Item aguarda decisão humana.'] }),
];
assert.equal(candidates.length, 15);
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, candidates.length);

const sourceBody478 = sourceBlock('block_478').lines.slice(1).flatMap(line => line.spans.map(span => span.text)).join('');
const technicalExceptions = [{
  id: 'p26-block-478-symbol-abilities-body',
  category: 'editable_unit_structure_or_renderer_mapping',
  status: 'open',
  sourceBlockIds: ['block_478'],
  spanKeys: [
    'page_26_unit_p26-block-478-font-size-10pt-unit-01__pt-BR',
    'page_26_unit_p26-block-478-font-size-9pt-unit-02__pt-BR',
    'page_26_unit_p26-block-478-font-size-10pt-unit-03__pt-BR',
    'page_26_block_52__pt-BR',
  ],
  sourceText: norm(sourceBody478),
  proposedText: 'Algumas Habilidades em Itens exigem Símbolos. Salvo indicação em contrário, Símbolos que adicionam à ROLAGEM DE ATAQUE só podem ser gastos na etapa de um Ataque para Gastar Símbolos e usar Habilidades que somem à Rolagem de Ataque. Símbolos que adicionam Dano só podem ser gastos na etapa de um Ataque para Gastar Símbolos e usar Habilidades que somem Dano. Consulte a seção 6, A Ação de Ataque, p. 41.',
  reason: 'The long body is split into three non-contiguous typographic span units around the bold “TO THE ATK ROLL” and “may only” runs. The visible parent key page_26_block_52 does not select in the Admin Editor. A partial override would separate the sentence around those runs and risks incoherent flow or overlap; the body remains in source English until one body unit and selection boundary are available.',
  requiredAction: 'Provide one selectable editorial unit for the full body while retaining its inline emphasis, then verify the complete translation in Viewer, read-only Editor and one-page PDF.',
  evidence: [
    'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/en-viewer-v1.png',
    'scripts/inspect_p026_editor_keys_v1.mjs',
    'scripts/inspect_p026_editor_selection_v1.mjs',
  ],
}];

const artworkPendingTerms = [
  'Item → Item, Weapon → Arma, Armor → Armadura, Core → Núcleo, Accessory → Acessório, Relic → Relíquia e Consumable → Consumível são candidatos de nomenclatura; confirmar no glossário.',
];
const allTopBlocks = dom.blocks.filter(block => {
  const [x0, y0, x1, y1] = block.bbox;
  return y0 >= 120 && y0 < 270 && y1 < 280 && (x1 - x0) >= 1;
});
const bands = [
  { id: 'long-sword', title: 'Espada Longa', minX: 85, maxX: 200,
    proposed: 'ESPADA LONGA\nESPADA • ESPADA LONGA • DUPLA\nCOMBO: LEVE; FINESSE: LARANJA\nCOMBO: ESPADA — Seus Ataques recebem +1 DANO FÍSICO.\nCOMBO: ESPADA LONGA — Seus Ataques recebem +2 DANO FÍSICO.\n+2 DANO FÍSICO; +1 DANO FÍSICO.',
    source: 'Long Sword; SWORD • LONG SWORD • DOUBLE; COMBO: LIGHT; FINESSE: ORANGE; COMBO: SWORD — Your Attacks Gain +1 PHYSICAL DMG.; COMBO: LONG SWORD — Your Attacks Gain +2 PHYSICAL DMG.; +2 PHYSICAL DMG; +1 PHYSICAL DMG.',
    terms: ['Long Sword → Espada Longa, Combo, Finesse, Light, Physical Damage e a capitalização de Attack aguardam revisão humana.'] },
  { id: 'bad-ass-leather-jacket', title: 'Jaqueta de Couro Bad-Ass', minX: 200, maxX: 310,
    proposed: 'JAQUETA DE COURO BAD-ASS\nCOURO\nEXAUSTAR — Ao fazer uma Esquiva, se você não rolar [ícone], pode rolar novamente o dado de Esquiva.\nPASSIVA — Reduza em 2 o DANO FÍSICO causado por Ataques [ícone] contra você.\nValores impressos preservados: 15; +1; +4.',
    source: 'Bad-Ass Leather Jacket; LEATHER; EXHAUST — When making a Dodge, so long as you did not roll [icon], you may re-roll your Dodge roll.; PASSIVE — Reduce PHYSICAL DMG dealt to you from [icon] Attacks by 2.; printed values 15, +1, +4.',
    terms: ['Bad-Ass, Leather, Dodge, Physical Damage e Passive são candidatos locais; EXHAUSTAR segue a decisão aprovada do glossário.'] },
  { id: 'utility-core', title: 'Núcleo de Utilidade', minX: 310, maxX: 420,
    proposed: 'NÚCLEO DE UTILIDADE\nNÚCLEO DE UTILIDADE\nPASSIVA — Aprimoramento de Convicção: BRANCO.\nEXAUSTAR — Mova 1 espaço. Esse movimento não provoca Ataques de Oportunidade. Ao fazê-lo, você pode gastar 1 SP para mover-se 1 espaço adicional.\nValores impressos preservados: 15; +1.',
    source: 'Utility Core; UTILITY CORE; PASSIVE — Conviction Upgrade: WHITE; EXHAUST — Move 1 space. This movement does not provoke Break Attacks. When making this movement, you may spend 1 SP to move an additional space.; printed values 15, +1.',
    terms: ['Core → Núcleo, Utility → Utilidade, Conviction Upgrade, Space, Move, SP e Break Attack aguardam revisão; Ataque de Oportunidade segue o glossário para Breaking Attack.'] },
  { id: 'cloak', title: 'Manto', minX: 420, maxX: 530,
    proposed: 'MANTO\nEXAUSTAR — ESQUIVA\nPASSIVA — 1 SP: A qualquer momento, ganhe PROTEÇÃO até o fim do turno.\nValor impresso preservado: 90.',
    source: 'Cloak; EXHAUST — DODGE; PASSIVE — 1 SP: At any time, Gain PROTECTION until end of turn.; printed value 90.',
    terms: ['Cloak → Manto, Dodge → Esquiva, Passive → Passiva, Protection → Proteção e Gain → ganhar aguardam revisão.'] },
  { id: 'enchanted-piercings', title: 'Piercings Encantados', minX: 530, maxX: 640,
    proposed: 'PIERCINGS ENCANTADOS\nPASSIVA — Aprimoramento de Convicção: BRANCO.\nPOR ENCONTRO — Após fazer uma rolagem, role novamente quaisquer dados seus.\nValor impresso preservado: 15.',
    source: 'Enchanted Piercings; PASSIVE — Conviction Upgrade: WHITE; PER ENCOUNTER — After making a roll, re-roll any of your dice.; printed value 15.',
    terms: ['Piercings Encantados, Passive, Conviction Upgrade, Per Encounter e roll aguardam revisão humana.'] },
  { id: 'vitality-juice-box', title: 'Suco de Vitalidade', minX: 640, maxX: 750,
    proposed: 'SUCO DE VITALIDADE\nPOÇÃO\nDESCARTAR — Você ou um aliado adjacente CURA 3, mais 1 por NÍVEL DE SAQUE acima de MUNDANO.\n“Uma garrafa de vidro é uma péssima ideia.”\nValor impresso preservado: 4.',
    source: 'Vitality Juice Box; POTION; DISCARD — You or an adjacent ally HEALS 3 plus 1 per LOOT LEVEL beyond MUNDANE.; “A glass bottle is actually a terrible idea.”; printed value 4.',
    terms: ['Vitality Juice Box, Potion, Discard, Heal, Loot Level e Mundane são propostas locais; Loot → Saque segue o glossário oficial.'] },
];
const artworkExceptions = [];
const typeBlock = sourceBlock('block_488');
artworkExceptions.push({
  id: 'p26-card-item-type-labels', sourceBlockIds: [typeBlock.id], spanKeys: [`page_${page}_block_${blockIndex(typeBlock.id)}`],
  sourceText: 'WEAPON / ARMOR / CORE / ACCESSORY / RELIC / CONSUMABLE',
  proposedText: 'ARMA / ARMADURA / NÚCLEO / ACESSÓRIO / RELÍQUIA / CONSUMÍVEL',
  pendingTerms: artworkPendingTerms,
  reason: 'The six type headings are printed in the sample-card artwork and are not Viewer text units.',
  requiredAction: 'Localize these headings in the page artwork and verify the full card row in Viewer and PDF.', status: 'open',
});
for (const band of bands) {
  const members = allTopBlocks.filter(block => {
    const centerX = (block.bbox[0] + block.bbox[2]) / 2;
    return centerX >= band.minX && centerX < band.maxX;
  });
  assert.ok(members.length, 'No source blocks found for item art group ' + band.id);
  artworkExceptions.push({
    id: 'p26-card-' + band.id,
    sourceBlockIds: members.map(block => block.id),
    spanKeys: members.map(block => `page_${page}_block_${blockIndex(block.id)}`),
    bboxPt: bboxUnion(members.flatMap(blockBoxes)),
    sourceText: band.source,
    proposedText: band.proposed,
    pendingTerms: band.terms,
    reason: 'This complete sample-item text is already printed inside the card image; overlaying the extracted text would duplicate it and break the designed card composition.',
    requiredAction: 'Prepare a localized card-art variant while preserving printed values and symbols, then verify the complete card in Viewer and PDF.',
    status: 'open',
  });
}
const diagramMembers = dom.blocks.filter(block => {
  const [x0, y0, x1, y1] = block.bbox;
  const centerX = (x0 + x1) / 2;
  return y0 >= 330 && y1 < 590 && ((centerX >= 195 && centerX < 345) || (centerX >= 510 && centerX < 635));
});
assert.ok(diagramMembers.some(block => block.id === 'block_17') && diagramMembers.some(block => block.id === 'block_81'));
artworkExceptions.push({
  id: 'p26-war-axe-front-back-art',
  sourceBlockIds: diagramMembers.map(block => block.id),
  spanKeys: diagramMembers.map(block => `page_${page}_block_${blockIndex(block.id)}`),
  bboxPt: bboxUnion(diagramMembers.flatMap(blockBoxes)),
  sourceText: 'FRONT; WAR AXE; 30; AXE • WAR AXE; EXHAUST — When determining the Damage of an Attack, this Attack Gains: +1 PHYSICAL DMG.; +1 PHYSICAL DMG; +1 PHYSICAL DMG; BACK; MUNDANE WEAPON.',
  proposedText: 'FRENTE; MACHADO DE GUERRA; 30; MACHADO • MACHADO DE GUERRA; EXAUSTAR — Ao determinar o Dano de um Ataque, esse Ataque recebe +1 DANO FÍSICO.; +1 DANO FÍSICO; +1 DANO FÍSICO; VERSO; ARMA MUNDANA.',
  pendingTerms: ['War Axe, Axe, Mundane, Attack, Damage, Physical Damage e o tratamento das Tags aguardam revisão humana; EXAUSTAR e Ataque de Oportunidade seguem decisões registradas no glossário.'],
  reason: 'Both sides of the War Axe example and their labels are printed in the source card artwork; the extracted text is not shown as an editable Viewer layer.',
  requiredAction: 'Localize the front/back card artwork while preserving its cost, stats, symbols and serial marking, then verify Viewer and PDF.',
  status: 'open',
});
assert.equal(artworkExceptions.length, 8);

const apiBase = 'http://localhost:3000';
const translationsUrl = new URL('/api/translations', apiBase);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(translationsResponse.ok, `Payload GET failed: ${translationsResponse.status}`);
const translationsPayload = await translationsResponse.json();
const existingPageRecords = (translationsPayload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith('page_26_'));
assert.equal(existingPageRecords.length, 0, 'p.26 saved-record baseline changed; stop and preserve before snapshot creation.');
const layoutUrl = new URL('/api/layout-frames', apiBase);
layoutUrl.searchParams.set('where[pageNumber][equals]', String(page));
layoutUrl.searchParams.set('limit', '500');
const layoutResponse = await fetch(layoutUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(layoutResponse.ok, `Layout-frame GET failed: ${layoutResponse.status}`);
const layoutPayload = await layoutResponse.json();
const existingPageFrames = (layoutPayload.docs ?? []).filter(record => Number(record.pageNumber) === page);
assert.equal(existingPageFrames.length, 0, 'p.26 Payload frame baseline changed; preserve and review it before continuing.');
assert.equal(Object.keys(layoutFramesSidecar).length, 4, 'Static p.26 frame sidecar changed since visual inspection.');

const sourcePdf = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sourcePdfSha256 = sha256(await readFile(sourcePdf));
const sourceEnPage = {
  mediaBox: [0, 0, 820.3460083007812, 820.3460083007812],
  cropBox: [0, 0, 820.3460083007812, 820.3460083007812],
  bleedBox: [0, 0, 820.3460083007812, 820.3460083007812],
  trimBox: [14.173199653625488, 14.17303466796875, 806.1729736328125, 806.1728086471558],
  artBox: [14.173199653625488, 14.17303466796875, 806.1729736328125, 806.1728086471558],
};
const additionalFrames = [
  { unitKey: `page_${page}_block_${blockIndex('block_12')}`, data: { x: 85.17323303222656, y: 56.69243621826172, width: 615, height: 24.263999938964844, rotation: 0, textAlign: 'center' } },
  { unitKey: `page_${page}_block_${blockIndex('block_14')}`, data: { x: 85.17323303222656, y: 298.4457092285156, width: 615, height: 24.263999938964844, rotation: 0, textAlign: 'center' } },
  { unitKey: `page_${page}_block_${blockIndex('block_474')}`, data: { x: 110.76374816894531, y: 627.5745239257812, width: 292.0440216064453, height: 22.9200439453125, rotation: 0, textAlign: 'left' } },
  { unitKey: `page_${page}_block_${blockIndex('block_479')}`, data: { x: 440.431884765625, y: 731.8599853515625, width: 296.89447021484375, height: 34.9200439453125, rotation: 0, textAlign: 'left' } },
].map(frame => ({
  frameKey: `${frame.unitKey}::pt-BR`, unitKey: frame.unitKey, pageNumber: page, language: 'pt-BR', data: frame.data,
}));
const candidateRecords = candidates.map(candidate => ({ spanKey: candidate.spanKey, language: 'pt-BR', data: candidate.diagnosticData }));
const snapshot = {
  translations: [...existingPageRecords, ...candidateRecords],
  layoutFrames: [...existingPageFrames, ...additionalFrames],
  symbolAliasSettings: [],
  assetPages: [page],
  page,
  patched: false,
  verifyRenderedSnapshot: true,
  sourcePageBoxes: { [page]: sourceEnPage },
};
await mkdir(join(snapshotDir, 'pages'), { recursive: true });
await cp(sourceDir, join(snapshotDir, 'pages/page_026'), { recursive: true, errorOnExist: true });
await writeFile(join(snapshotDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });

const sourceHashes = {};
for (const name of ['page_026_dom.json', 'background.webp', 'layout_frames.json']) {
  sourceHashes[name] = sha256(await readFile(join(sourceDir, name)));
}
sourceHashes.sourcePdfSha256 = sourcePdfSha256;
sourceHashes.snapshotSha256 = sha256(await readFile(join(snapshotDir, 'snapshot.json')));
sourceHashes.snapshotDomSha256 = sha256(await readFile(join(snapshotDir, 'pages/page_026/page_026_dom.json')));
sourceHashes.payloadRecordsBefore = existingPageRecords.length;
sourceHashes.payloadLayoutFramesBefore = existingPageFrames.length;
sourceHashes.staticSourceFrames = Object.keys(layoutFramesSidecar).length;
sourceHashes.payloadWrites = 0;
await writeFile(join(proofDir, 'source-hashes-v1.json'), JSON.stringify(sourceHashes, null, 2) + '\n', { flag: 'wx' });

const sourceReview = {
  status: 'official_pdf_and_english_viewer_visual_reviewed_2026-10-16',
  page,
  sourcePdf,
  sourcePdfSha256,
  sourceRaster: 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/source-en-page-026.png',
  englishViewer: 'output/proofs/translation-readiness-2026-10-16/p026-source-review-v1/en-viewer-v1.png',
  englishViewerCapture: 'scripts/capture_p026_english_viewer_v1.mjs',
  fidelityNote: 'Official source raster and the full-page English Viewer were visually compared. The two editable titles and A–G explanatory units align with source geometry. Six example item cards, their type captions, and the War Axe front/back diagram are printed in the card artwork; extracted text in those regions is not an editable Viewer layer. The page has 4 static source frames, no Payload PT translations, and no Payload frames.',
  sourceDomSha256: sourceHashes['page_026_dom.json'],
  backgroundSha256: sourceHashes['background.webp'],
  staticFrameSidecarSha256: sourceHashes['layout_frames.json'],
  existingPayloadTranslations: 0,
  existingPayloadLayoutFrames: 0,
  staticSourceFrames: 4,
  payloadWrites: 0,
};
await writeFile(join(sourceReviewDir, 'source-review-v1.json'), JSON.stringify(sourceReview, null, 2) + '\n');

const proposal = {
  schemaVersion: 1,
  proposalId: 'page-026-item-card-types-2026-10-16-v1',
  page,
  locale: 'pt-BR',
  title: 'Tipos de Cartas de Item',
  sourcePdf,
  sourcePdfSha256,
  canonicalDomSha256: sourceHashes['page_026_dom.json'],
  backgroundSha256: sourceHashes['background.webp'],
  canonicalLayoutFramesSha256: sourceHashes['layout_frames.json'],
  status: 'draft_pending_viewer_editor_pdf_copyfit_human_review_artwork_and_structure_exception',
  counts: {
    candidates: candidates.length,
    verifiedInViewer: 0,
    verifiedInEditor: 0,
    verifiedInPdf: 0,
    preservedHumanRecords: existingPageRecords.length,
    artworkExceptions: artworkExceptions.length,
    technicalExceptions: technicalExceptions.length,
  },
  sourceReview,
  preservedHumanRecords: [],
  candidates,
  diagnosticLayoutFrames: {
    status: 'snapshot_only',
    preservedPayloadFrames: existingPageFrames.length,
    staticSourceFrames: Object.keys(layoutFramesSidecar).length,
    frames: additionalFrames.map(record => ({ unitKey: record.unitKey, data: record.data })),
    reason: 'Use full title banners for the two headings, widen the COST body to the adjacent left-column width, and give the final right-column body space before the footer. Frames exist only in the immutable diagnostic snapshot.',
  },
  artworkExceptions,
  unchangedSourceContent: [
    { sourceText: 'Card costs, stat bonuses, dice quantities, SP values, page numbers, serial marks and item symbols.', reason: 'Language-independent values or semantic symbols; retain their exact positions and quantities in each localized art variant.' },
    { sourceText: 'A–G callout markers.', reason: 'Diagram references shared with the explanatory text; the Latin-letter identifiers are unchanged.' },
  ],
  payload: { readOnlyMethod: 'GET', existingPageRecords: 0, existingPageLayoutFrames: 0, writes: 0 },
  technicalExceptions,
  diagnosticFailurePolicy: 'If an active editable proposal duplicates, collides, overflows or fails exact Editor selection, remove only that proposal from the diagnostic snapshot and keep its source-English text visible. Preserve the complete PT-BR candidate in the proposal and exception queue. Do not overlay PT text on card words already printed in the page artwork.',
};
await mkdir(dirname(resolve(root, proposalRel)), { recursive: true });
await writeFile(resolve(root, proposalRel), JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' });

const markdown = [
  '# p.26 — proposta PT-BR “Tipos de Cartas de Item” v1',
  '',
  `**Estado:** ${candidates.length} candidatos; Viewer, Editor, PDF e copyfit pendentes. O corpo SYMBOL ABILITIES permanece em inglês no diagnóstico até resolver a unidade fragmentada. Oito grupos de texto em arte aguardam localização. Nenhum registro humano existente; zero writes no Payload.`,
  '',
  '## Unidades editáveis',
  '',
  candidates.map(candidate => `### ${candidate.sourceBlockId}${candidate.sourceUnitId ? ' / ' + candidate.sourceUnitId : ''}\n\n**EN:** ${candidate.sourceText}\n\n**PT-BR:** ${candidate.proposalText}\n\n**Revisão pendente:** ${(candidate.pendingTerms ?? []).join(' ') || 'Nenhum termo identificado.'}`).join('\n\n'),
  '',
  '## Texto impresso na arte',
  '',
  'O Viewer EN confirma seis cartas de exemplo, os rótulos de tipo e o cartão War Axe frente/verso como texto incorporado à arte. As propostas abaixo registram o texto para futura composição localizada sem duplicar o original.',
  '',
  artworkExceptions.map(item => `### ${item.id}\n\n**EN:** ${item.sourceText}\n\n**PT-BR proposto:** ${item.proposedText}\n\n**Revisão pendente:** ${(item.pendingTerms ?? []).join(' ')}\n\n**Ação:** ${item.requiredAction}`).join('\n\n'),
  '',
  '## Exceção de estrutura',
  '',
  technicalExceptions.map(item => `### ${item.id}\n\n**EN:** ${item.sourceText}\n\n**PT-BR proposto:** ${item.proposedText}\n\n**Motivo:** ${item.reason}\n\n**Ação:** ${item.requiredAction}`).join('\n\n'),
  '',
  '## Fonte e persistência',
  '',
  `PDF oficial SHA-256: \`${sourcePdfSha256}\`. DOM SHA-256: \`${sourceHashes['page_026_dom.json']}\`. Quatro molduras estáticas foram preservadas; não há traduções PT-BR nem molduras salvas no Payload para esta página. O snapshot é separado do Viewer canônico e registra zero writes.`,
].join('\n');
await writeFile(resolve(root, markdownRel), markdown + '\n', { flag: 'wx' });

console.log(JSON.stringify({
  proposal: proposalRel,
  candidates: candidates.length,
  activeCandidatesInSnapshot: candidateRecords.length,
  artworkExceptions: artworkExceptions.length,
  technicalExceptions: technicalExceptions.length,
  preservedPayloadRecords: existingPageRecords.length,
  payloadFrames: existingPageFrames.length,
  staticSourceFrames: Object.keys(layoutFramesSidecar).length,
  sourcePdfSha256,
  snapshotSha256: sourceHashes.snapshotSha256,
}, null, 2));
