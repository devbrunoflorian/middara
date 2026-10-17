#!/usr/bin/env node
/** Prepare a recoverable p.28 PT-BR proposal and immutable diagnostic snapshot. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const pageNumber = 28;
const pageDirRel = 'apps/web/public/pages/page_028';
const pageDomRel = pageDirRel + '/page_028_dom.json';
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1';
const proposalRel = 'docs/translations/proposals/page-028-item-upgrades-proposal-2026-10-16-v1.json';
const markdownRel = 'docs/translations/proposals/page-028-item-upgrades-proposal-2026-10-16-v1.md';
const snapshotRel = proofRel + '/snapshot-diagnostic-v1/snapshot.json';
const snapshotDirRel = proofRel + '/snapshot-diagnostic-v1';
const sourcePdfRel = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const templateSnapshotRel = 'output/proofs/translation-readiness-2026-10-16/p027-item-tiers-types-proposal-v1/snapshot-diagnostic-v10/snapshot.json';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const dom = JSON.parse(await readFile(resolve(root, pageDomRel), 'utf8'));
const sourcePdf = await readFile(sourcePdfRel);
const readJson = async rel => JSON.parse(await readFile(resolve(root, rel), 'utf8'));
assert.equal(dom.page_number, pageNumber);

const plainBlockText = block => block.lines.map(line => line.spans.map(span => span.text ?? '').join('')).join(' ').replace(/\s+/gu, ' ').trim();
const blockById = new Map(dom.blocks.map((block, index) => [block.id, { ...block, index }]));
const block = id => {
  const value = blockById.get(id);
  assert.ok(value, 'Missing source block ' + id);
  return value;
};
const sourceSpans = value => value.lines.flatMap(line => line.spans).filter(span => (span.text ?? '').trim());
const makeStyle = (font, size, color, weight = 400, style = 'normal') => ({ font, size, color, weight, style, disableLigatures: true });
const firstTextStyle = value => {
  const span = sourceSpans(value).find(item => !/Bold|Black/u.test(item.font ?? '')) ?? sourceSpans(value)[0];
  const font = span.font ?? 'OptimaLTStd';
  const size = span.size ?? 10;
  const color = span.color ?? '#231f20';
  const weight = /Black/u.test(font) ? 900 : /Bold/u.test(font) || size >= 16 ? 700 : 400;
  return makeStyle(font, size, color, weight, /Italic/u.test(font) ? 'italic' : 'normal');
};
const bodyStyle = value => sourceSpans(value).find(span => /Optima/u.test(span.font ?? '') && !/Bold|Black/u.test(span.font ?? ''))
  ? (() => { const span = sourceSpans(value).find(item => /Optima/u.test(item.font ?? '') && !/Bold|Black/u.test(item.font ?? '')); return makeStyle(span.font ?? 'OptimaLTStd', span.size ?? 10, span.color ?? '#231f20'); })()
  : firstTextStyle(value);
const segment = (text, style, overrides = {}) => ({ ...style, ...overrides, text });
const boldStyleFor = (base, size = base.size) => makeStyle('OptimaLTStd-Bold', size, base.color, 700);
const italicBoldStyleFor = base => makeStyle('OptimaLTStd-BoldItalic', base.size, base.color, 700, 'italic');
const textSegments = (text, base, emphasis = []) => {
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
    if (!match) { segments.push(segment(text.slice(cursor), base)); break; }
    if (match.index > cursor) segments.push(segment(text.slice(cursor, match.index), base));
    segments.push(segment(match.entry.text, match.entry.style));
    cursor = match.index + match.entry.text.length;
  }
  return segments.filter(item => item.text.length);
};
const basicData = (text, source, emphasis = [], lineHeight = 1.1) => ({
  schemaVersion: 2,
  segments: textSegments(text, bodyStyle(source), emphasis),
  textAlign: 'left', lineHeight, lineHeightMode: 'source', managedSourceSymbols: [],
});
const headingBodyData = (title, body, source, emphasis = []) => {
  const titleSpan = sourceSpans(source).find(span => /Cinzel/u.test(span.font ?? ''));
  const titleStyle = makeStyle(titleSpan?.font ?? 'Cinzel-Regular', titleSpan?.size ?? 12, titleSpan?.color ?? '#231f20', 700);
  const base = bodyStyle(source);
  return {
    schemaVersion: 2,
    segments: [segment(title + '\n', titleStyle), ...textSegments(body, base, emphasis)],
    textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [],
  };
};
const headingData = (text, source, align = 'left') => {
  const span = sourceSpans(source)[0];
  const style = makeStyle(span?.font ?? 'Cinzel-Regular', span?.size ?? 16, span?.color ?? '#231f20', 700);
  return { schemaVersion: 2, segments: [segment(text, style)], textAlign: align, lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [] };
};
const priceData = (label, amount, source) => {
  const spans = sourceSpans(source);
  const labelSource = spans.find(span => /Bold/u.test(span.font ?? ''));
  const amountSource = spans.find(span => /Bold/u.test(span.font ?? '') && span.size >= 10);
  const body = bodyStyle(source);
  const labelStyle = makeStyle(labelSource?.font ?? 'OptimaLTStd-Bold', labelSource?.size ?? 9, labelSource?.color ?? body.color, 700);
  const amountStyle = makeStyle(amountSource?.font ?? 'OptimaLTStd-Bold', amountSource?.size ?? 10, amountSource?.color ?? body.color, 700);
  return {
    schemaVersion: 2,
    segments: [segment(label, labelStyle), segment(' = ', body), segment(String(amount), amountStyle), segment(' Ouro.', body)],
    textAlign: 'left', lineHeight: 1.05, lineHeightMode: 'source', managedSourceSymbols: [],
  };
};
const bold = (source, size = null) => boldStyleFor(bodyStyle(source), size ?? bodyStyle(source).size);
const boldItalic = source => italicBoldStyleFor(bodyStyle(source));
const emph = (source, entries) => entries.map(([text, kind = 'bold', size = null]) => ({
  text,
  style: kind === 'boldItalic' ? boldItalic(source) : bold(source, size),
}));

const translations = {
  block_8: {
    text: 'Remi quer comprar e equipar Aprimoramentos de Item para seu novo Martelo Grande. Como é uma Arma de duas Mãos, ela pode equipar 2 Aprimoramentos de Item nele.',
    emphasis: [['Martelo Grande', 'boldItalic'], ['2', 'bold']],
    terms: ['Great Hammer → Martelo Grande (nome impresso na arte; forma na prosa é proposta local).', 'Weapon Upgrade → Aprimoramento de Arma (termo ainda não aprovado).'],
  },
  block_9: {
    text: 'Remi escolhe comprar Etherium. Esse Aprimoramento de Arma permite compensar a penalidade de movimento causada pela Tag HEAVY indicada no Martelo Grande.',
    emphasis: [['Etherium', 'boldItalic'], ['HEAVY', 'bold', 9], ['Martelo Grande', 'boldItalic']],
    terms: ['Etherium é nome próprio e permanece sem tradução.', 'Weapon Upgrade → Aprimoramento de Arma; HEAVY é nome de Tag e aguarda decisão terminológica.'],
  },
  block_10: {
    text: 'Como o Grupo já desbloqueou o Aprimoramento de Item Etherium, Remi pode comprá-lo. Ela quer aprimorar uma Arma Mundana, então o custo será 15 de Ouro.',
    emphasis: [['15', 'bold']],
    terms: ['Party → Grupo; Mundane → Mundano; a redação do nome Etherium como modificador aguarda revisão humana.'],
  },
  block_11: {
    text: 'Por fim, Remi quer comprar Obra-Prima. Como seu Martelo Grande é uma Arma de duas Mãos, ela pode equipar 2 Aprimoramentos de Item à sua escolha!',
    emphasis: [['Obra-Prima', 'boldItalic'], ['2', 'bold', 9]],
    terms: ['Master Work → Obra-Prima é proposta contextual, pendente de revisão.', '2-Handed → duas Mãos; a relação com o tipo de Arma aguarda revisão humana.'],
  },
  block_12: {
    text: 'Felizmente, o Grupo obteve recentemente uma Carta de Saque de Monstro com a Tag MATERIAL. Ao entregar essa carta, Remi pode comprar o Aprimoramento de Arma Obra-Prima por mais 15 de Ouro.',
    emphasis: [['MATERIAL', 'bold', 9], ['Obra-Prima', 'boldItalic'], ['15', 'bold']],
    terms: ['Monster Loot Card → Carta de Saque de Monstro e MATERIAL permanecem propostas até revisão humana.', 'Master Work → Obra-Prima; Weapon Upgrade → Aprimoramento de Arma.'],
  },
  block_13: {
    text: 'Com seu novo Martelo Grande de Etherium e Obra-Prima, Remi está pronta para derrotar seus inimigos!',
    emphasis: [['Martelo Grande', 'boldItalic'], ['Etherium', 'boldItalic'], ['Obra-Prima', 'boldItalic']],
    terms: ['Great Hammer, Etherium e Master Work são nomes impressos na arte; as formas traduzidas na prosa são propostas locais.'],
  },
  block_14: {
    title: 'O que são Aprimoramentos de Item?',
    body: 'Durante as Fases de Comprar e Treinar de uma Aventura, Aprimoramentos de Item desbloqueados podem ser comprados. Os Aprimoramentos de Item são anexados à Carta de Item correspondente e concedem novas Habilidades a esse Item.',
    emphasis: [['Comprar e Treinar', 'bold']],
    terms: ['Shop and Train → Comprar e Treinar (glossário).', 'Adventure, Item Card e Ability aguardam revisão contextual.'],
  },
  block_17: {
    text: 'No início de uma Aventura, os jogadores não terão Aprimoramentos de Item disponíveis para comprar. Ao derrotar oponentes e comprar a Carta de Saque de Monstro, poderão desbloquear Aprimoramentos de Item.',
    terms: ['Defeating → derrotar, Monster Loot Card → Carta de Saque de Monstro; nomes dos termos aguardam revisão contextual.'],
  },
  block_18: {
    title: 'Desbloquear Aprimoramentos de Item',
    body: 'Todas as Cartas de Saque de Monstro têm a Tag MATERIAL. Qualquer carta com essa Tag pode ser entregue durante Comprar e Treinar para obter 1 de 3 benefícios:',
    emphasis: [['MATERIAL', 'bold', 9], ['Comprar e Treinar', 'bold'], ['1', 'bold', 9], ['3', 'bold', 9]],
    terms: ['Monster Loot Card e MATERIAL aguardam revisão humana; Shop and Train → Comprar e Treinar (glossário).'],
  },
  block_21: { text: '• Ganhe 25 de Ouro.', emphasis: [['25', 'bold']], terms: ['Gold → Ouro; forma verbal de Gain aguarda revisão editorial.'] },
  block_22: {
    text: '• Ganhe e equipe gratuitamente um único Aprimoramento de Item, à sua escolha, em um Item. (Mesmo que ainda não tenha sido desbloqueado.)',
    emphasis: [['qualquer', 'bold']],
    terms: ['Gain, equip e “any single” têm decisão editorial pendente.'],
  },
  block_23: { text: '• Desbloqueie um Aprimoramento de Item à sua escolha.', terms: ['Unlock → desbloquear; forma verbal aguarda revisão editorial.'] },
  block_24: {
    text: 'Depois que um Aprimoramento de Item for desbloqueado, marque-o na Ficha de Aventureiro. Esse Aprimoramento de Item poderá ser comprado durante a atual Fase de Comprar e Treinar e em todas as futuras Fases de Comprar e Treinar da Aventura.',
    emphasis: [['Comprar e Treinar', 'bold']],
    terms: ['Adventurer Sheet → Ficha de Aventureiro é proposta contextual; Shop and Train → Comprar e Treinar (glossário).'],
  },
  block_25: {
    text: 'As Cartas de Saque de Monstro têm Habilidades que podem ser muito úteis aos Aventureiros. Porém, se forem entregues para obter qualquer um dos benefícios acima, o Grupo perderá a carta e deverá devolvê-la ao baralho de Saque de Monstro.',
    terms: ['Monster Loot Card, Party, Monster Loot deck e “trade in” aguardam revisão contextual.'],
  },
  block_26: {
    title: 'O Custo dos Aprimoramentos de Item',
    body: 'Quando um Aprimoramento de Item é desbloqueado, qualquer Aventureiro pode comprar os Aprimoramentos de Item com aquele nome.',
    emphasis: [['qualquer', 'bold']],
    terms: ['Tier não aparece neste bloco; Item Upgrade segue o glossário como Aprimoramento de Item.'],
  },
  block_29: {
    text: 'O custo para aplicar um Aprimoramento de Item a um Item varia conforme o Nível do Item aprimorado. Itens Únicos não custam mais para serem aprimorados que seus equivalentes não Únicos. Itens de História e Itens de Saque de Monstro são considerados Itens do seu Nível de Saque atual.',
    emphasis: [['Nível de Saque', 'bold']],
    terms: ['Tier → Nível é candidato contextual; Unique, Story Item, Monster Loot Item e Loot LVL aguardam revisão humana.'],
  },
  block_30: {
    text: 'A tabela abaixo mostra o custo em Ouro para aplicar a um Item qualquer Aprimoramento de Item desbloqueado, conforme o Nível do Item.',
    terms: ['Gold → Ouro; Tier → Nível (candidato contextual); “Unlocked” modifica Aprimoramento de Item.'],
  },
  block_31: { text: 'MUNDANO = 15 Ouro.', data: priceData('MUNDANO', 15, block('block_31')), terms: ['Mundane → Mundano; Gold → Ouro.'] },
  block_32: { text: 'COMUM = 30 Ouro.', data: priceData('COMUM', 30, block('block_32')), terms: ['Common → Comum; Gold → Ouro.'] },
  block_33: { text: 'INCOMUM = 50 Ouro.', data: priceData('INCOMUM', 50, block('block_33')), terms: ['Uncommon → Incomum; Gold → Ouro.'] },
  block_34: { text: 'RARO = 75 Ouro.', data: priceData('RARO', 75, block('block_34')), terms: ['Rare → Raro; Gold → Ouro.'] },
  block_35: {
    title: 'Equipar Aprimoramentos de Item',
    body: 'Aprimoramentos de Item com a Tag WEAPON, ARMOR ou CORE só podem ser equipados em Itens dos tipos correspondentes. Aprimoramentos de Item com a Tag UNIVERSAL podem ser equipados em qualquer Arma, Núcleo ou Armadura.',
    emphasis: [['WEAPON', 'bold', 9], ['ARMOR', 'bold', 9], ['CORE', 'bold', 9], ['UNIVERSAL', 'bold', 9], ['qualquer', 'bold']],
    terms: ['WEAPON, ARMOR, CORE e UNIVERSAL são nomes de Tag mantidos em inglês, aguardando decisão humana.'],
  },
  block_38: {
    text: 'Armas de 1 Mão só podem equipar 1 Aprimoramento de Item; Armas de 2 Mãos podem equipar 2.',
    emphasis: [['1', 'bold', 9], ['2', 'bold', 10]],
    terms: ['1-Handed/2-Handed → uma/duas Mãos; quantidade de Aprimoramentos de Item preservada.'],
  },
  block_39: {
    text: 'Embora estejam anexados a um Item, os Aprimoramentos de Item e suas Habilidades são usados independentemente do Item ao qual estão anexados. Ou seja, se você aprimorar um Item com um Aprimoramento que tenha uma Habilidade de Virar, ao usá-la, apenas esse Aprimoramento será Virado, e não o Item ao qual está anexado.',
    terms: ['Flip Ability, Flip, Upgrade e a flexão de Virar/Virado seguem pendentes no contexto desta regra.'],
  },
  block_40: {
    text: 'Se uma Habilidade fizer referência a um Ícone de um Item com Aprimoramento, os bônus de Ícone desse Aprimoramento também se aplicam ao Item aprimorado.',
    terms: ['Ability e Icon aguardam revisão contextual; Item Upgrade segue o glossário.'],
  },
  block_41: {
    text: 'Aprimoramentos de Item',
    data: headingData('Aprimoramentos de Item', block('block_41')),
    terms: ['Item Upgrade → Aprimoramento de Item (glossário oficial).'],
  },
  block_109: {
    text: 'Equipar Aprimoramentos de Item',
    data: headingData('Equipar Aprimoramentos de Item', block('block_109'), 'center'),
    terms: ['Equipping Item Upgrades: cabeçalho localizado na prosa viva; o título permanece dentro do frame delimitado pelos ornamentos fixos.'],
  },
};

const preservedSourceBlocks = new Set(['block_14', 'block_18', 'block_26', 'block_35']);
const candidates = Object.entries(translations).filter(([sourceBlockId]) => !preservedSourceBlocks.has(sourceBlockId)).map(([sourceBlockId, spec]) => {
  const source = block(sourceBlockId);
  const spanKey = 'page_28_block_' + source.index;
  const data = spec.data ?? (spec.title
    ? headingBodyData(spec.title, spec.body, source, emph(source, spec.emphasis ?? []))
    : basicData(spec.text, source, emph(source, spec.emphasis ?? [])));
  return {
    sourceBlockId,
    sourceUnitIds: source.typographicSpanUnits?.map(unit => unit.id) ?? [],
    blockIndex: source.index,
    sourceText: plainBlockText(source),
    proposalText: spec.text ?? (spec.title + '\n' + spec.body),
    proposalMarkup: spec.text ?? (spec.title + '\n' + spec.body),
    spanKey,
    legacyBlockSpanKey: spanKey + '__pt-BR',
    editorUnitKey: spanKey,
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
  };
});
assert.equal(candidates.length, 23);
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, candidates.length);

const overlaySidecar = await readJson(pageDirRel + '/fidelity_overlays.json');
const sharedArtwork = overlaySidecar.overlays.filter(item => item.category === 'item-cards').map(item => ({
  sourceText: item.region,
  overlayUrl: item.url,
  bboxPt: item.bbox,
  languageInvariant: item.languageInvariant === true,
  authorizationNote: 'Existing page-28 review records the user instruction to share complete English physical-card artwork across EN/PT-BR; no translation or card-mask edits are made in this proposal.',
}));
assert.equal(sharedArtwork.length, 3);
assert.ok(sharedArtwork.every(item => item.languageInvariant));

const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(translationsResponse.ok, 'Payload translations GET failed: ' + translationsResponse.status);
const translationDocs = (await translationsResponse.json()).docs ?? [];
const preexistingTranslations = translationDocs.filter(item => String(item.spanKey ?? '').startsWith('page_28_'));
const framesUrl = new URL('/api/layout-frames', payloadUrl);
framesUrl.searchParams.set('limit', '5000');
const framesResponse = await fetch(framesUrl, { method: 'GET', signal: AbortSignal.timeout(20000) });
assert.ok(framesResponse.ok, 'Payload layout-frames GET failed: ' + framesResponse.status);
const frameDocs = (await framesResponse.json()).docs ?? [];
const preexistingFrames = frameDocs.filter(item => Number(item.pageNumber) === pageNumber);
assert.equal(preexistingTranslations.length, 8);
assert.equal(preexistingFrames.length, 0);
const preservedHumanRecords = preexistingTranslations.map(record => {
  const match = String(record.spanKey).match(/^page_28_unit_p28-block-(\d+)-/u);
  assert.ok(match, 'Unexpected existing p.28 record key: ' + record.spanKey);
  const sourceBlockId = 'block_' + match[1];
  const source = block(sourceBlockId);
  return {
    existingRecordId: record.id,
    spanKey: record.spanKey,
    sourceBlockId,
    sourceUnitId: String(record.spanKey).replace(/^page_28_unit_/u, '').replace(/__pt-BR$/u, ''),
    sourceUnitIds: source.typographicSpanUnits?.map(unit => unit.id) ?? [],
    sourceText: plainBlockText(source),
    proposedText: (record.data?.segments ?? []).filter(segment => !segment.symbolId).map(segment => segment.text ?? '').join(''),
    data: record.data,
    editorUnitKey: record.spanKey,
    status: 'preserved_existing_Payload_record',
    editorialStatus: 'unchanged_pending_no_new_review_item',
  };
});

const templateSnapshot = await readJson(templateSnapshotRel);
assert.ok(templateSnapshot.assetPages?.includes(27));
const snapshotDir = resolve(root, snapshotDirRel);
await mkdir(resolve(snapshotDir, 'pages'), { recursive: true });
await mkdir(resolve(snapshotDir, 'pages/page_028'), { recursive: true });
await import('node:fs/promises').then(fs => fs.cp(resolve(root, pageDirRel), resolve(snapshotDir, 'pages/page_028'), { recursive: true, force: true }));
const sourcePageBox = templateSnapshot.sourcePageBoxes?.['27'];
assert.ok(sourcePageBox, 'Missing source page box template.');
const snapshot = {
  ...templateSnapshot,
  translations: [
    ...preservedHumanRecords.map(record => ({ spanKey: record.spanKey, language: 'pt-BR', data: record.data })),
    ...candidates.map(candidate => ({ spanKey: candidate.legacyBlockSpanKey, language: 'pt-BR', data: candidate.data })),
  ],
  layoutFrames: [],
  assetPages: [28],
  sourcePageBoxes: { 28: sourcePageBox },
  diagnosticOnly: { proposalId: 'page-028-item-upgrades-2026-10-16-v1', blankedSpanKeys: [] },
};
await writeFile(resolve(snapshotDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');

const sourceDomBytes = await readFile(resolve(root, pageDomRel));
const backgroundBytes = await readFile(resolve(root, pageDirRel + '/background.webp'));
const layoutBytes = await readFile(resolve(root, pageDirRel + '/layout_frames.json'));
const overlayBytes = await readFile(resolve(root, pageDirRel + '/fidelity_overlays.json'));
const sourceReview = {
  status: 'official_pdf_page_28_compared_with_current_english_viewer_export_2026-10-16',
  page: pageNumber,
  sourcePdf: sourcePdfRel,
  sourcePdfSha256: sha256(sourcePdf),
  sourcePdfPageCount: 102,
  officialSourceRaster: proofRel + '/source-official-p028.png',
  englishViewerScreenshot: proofRel + '/viewer-en-source-v1.png',
  englishExportPdf: proofRel + '/page-028-en-source-v1.pdf',
  englishExportRaster: proofRel + '/print-en-source-v1.png',
  sourceDomSha256: sha256(sourceDomBytes),
  backgroundSha256: sha256(backgroundBytes),
  layoutFramesSha256: sha256(layoutBytes),
  fidelityOverlaysSha256: sha256(overlayBytes),
  staticSharedArtworkReview: 'docs/project-progress/2026-10-04-page28-shared-artwork-followup.md',
  fidelityNote: 'The official 102-page PDF page 28 was rendered and compared visually with the current English Viewer export. All page prose, the three complete item-card crops, the brown side panel, source flourishes, and page number align. The existing three physical-card crops remain language-invariant English by the prior user instruction; they contain printed card text and are not editable prose candidates. The right-panel heading remains live editable text in the DOM, separate from the two fixed white ornaments.',
  existingPayloadTranslations: preexistingTranslations.length,
  existingPayloadLayoutFrames: 0,
  payloadWrites: 0,
};

const proposal = {
  schemaVersion: 1,
  proposalId: 'page-028-item-upgrades-2026-10-16-v1',
  page: pageNumber,
  locale: 'pt-BR',
  title: 'Aprimoramentos de Item',
  sourcePdf: sourcePdfRel,
  sourcePdfSha256: sourceReview.sourcePdfSha256,
  sourceDomSha256: sourceReview.sourceDomSha256,
  backgroundSha256: sourceReview.backgroundSha256,
  layoutFramesSha256: sourceReview.layoutFramesSha256,
  fidelityOverlaysSha256: sourceReview.fidelityOverlaysSha256,
  status: 'draft_pending_viewer_editor_pdf_copyfit_human_review',
  counts: { candidates: candidates.length, verifiedInViewer: 0, verifiedInEditor: 0, verifiedInPdf: 0, preservedHumanRecords: preservedHumanRecords.length, artworkExceptions: 0, sharedLanguageInvariantArtwork: sharedArtwork.length, technicalExceptions: 0 },
  sourceReview,
  preservedHumanRecords,
  candidates,
  artworkExceptions: [],
  sharedLanguageInvariantArtwork: sharedArtwork,
  technicalExceptions: [],
  unchangedSourceContent: [
    { sourceText: 'Complete English Great Hammer, Etherium and Master Work physical-card artwork.', reason: 'The prior user instruction and documented p.28 review require the original card artwork to remain shared across EN/PT-BR. Extracted text remains attached to the existing image regions; no duplicate HTML copy is added.' },
    { sourceText: 'The fixed white flourishes around the brown-panel heading and the gold page-number treatment.', reason: 'The p.28 canonical fidelity repairs remain unchanged and are preserved in the full-page snapshot.' },
    { sourceText: 'Page number 28 and all printed item values, tags and symbols.', reason: 'Language-invariant values and game symbols remain as printed in the source artwork.' },
  ],
  payload: { readOnlyMethod: 'GET', existingPageRecords: preexistingTranslations.length, existingPageLayoutFrames: preexistingFrames.length, writes: 0 },
  diagnosticFailurePolicy: 'In the PT-BR diagnostic snapshot, blank only a failed whole editable unit. Never show English fallback or partial PT-BR in a failed unit. Preserve the full source and proposal in the proposal and exception queue; keep the original artwork visible. Do not persist blanks to Payload.',
};
await writeFile(resolve(root, proposalRel), JSON.stringify(proposal, null, 2) + '\n');

const md = [
  '# p.28 — proposta PT-BR “Aprimoramentos de Item” v1', '',
  '**Estado:** 23 unidades novas têm proposta; oito registros PT-BR preexistentes foram preservados sem alteração. Validação Viewer, Editor, copyfit e PDF pendente. Os três crops de cartas físicas continuam integralmente em inglês, compartilhados entre idiomas conforme a instrução registrada para a página. Revisão humana pendente; zero writes no Payload.', '',
  '## Registros humanos preservados', '',
  ...preservedHumanRecords.flatMap(record => [
    '### ' + record.spanKey + ' (ID ' + record.existingRecordId + ')', '',
    '**PT-BR salvo:** ' + record.proposedText.replace(/\n/gu, '<br>'), '',
    '**Ação:** registro preservado sem alteração; não é substituído por esta proposta.', '',
  ]),
  '## Unidades editáveis', '',
  ...candidates.flatMap(candidate => [
    '### ' + candidate.sourceBlockId + ' / ' + candidate.spanKey, '',
    '**EN:** ' + candidate.sourceText, '',
    '**PT-BR proposto:** ' + candidate.proposalText.replace(/\n/gu, '<br>'), '',
    '**Revisão pendente:** ' + candidate.pendingTerms.join('; '), '',
  ]),
  '## Arte compartilhada', '',
  'As cartas físicas completas Great Hammer, Etherium e Master Work permanecem em inglês nos dois idiomas, conforme o histórico de autorização e revisão da página 28. Os crops existentes, as duas florzinhas brancas do painel e o contorno do fólio não foram alterados. O texto externo do painel é prosa editável e recebe proposta separada.', '',
  '## Fonte', '',
  'O PDF oficial de 102 páginas, página 28, foi renderizado e comparado ao Viewer EN e ao PDF exportado de uma página. Prosa, painel marrom, três crops completos, ornamentos e fólio alinham; os arquivos e hashes de origem estão registrados no JSON.', '',
].join('\n');
await writeFile(resolve(root, markdownRel), md);

console.log(JSON.stringify({
  status: 'p028_full_page_text_proposal_prepared_before_copyfit_validation',
  candidateCount: candidates.length,
  sharedLanguageInvariantArtwork: sharedArtwork.length,
  existingPageTranslations: preexistingTranslations.length,
  existingPageFrames: preexistingFrames.length,
  proposal: proposalRel,
  snapshot: snapshotRel,
  payloadWrites: 0,
}, null, 2));
