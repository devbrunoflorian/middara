#!/usr/bin/env node
/** Prepare an isolated, recoverable PT-BR proposal for p.30. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const pageNumber = 30;
const pageId = 'page_030';
const pageDirRel = `apps/web/public/pages/${pageId}`;
const domRel = `${pageDirRel}/${pageId}_dom.json`;
const sourcePdfRel = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v2';
const snapshotDirRel = `${proofRel}/snapshot-diagnostic-v2`;
const proposalRel = 'docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.json';
const markdownRel = 'docs/translations/proposals/page-030-icons-conditions-tags-symbols-2026-10-16-v2.md';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const readJson = async rel => JSON.parse(await readFile(resolve(root, rel), 'utf8'));
const norm = value => String(value).replace(/\s+/gu, ' ').trim();
const makeStyle = (font, size, color = '#231f20', weight = 400, style = 'normal') => ({ font, size, color, weight, style, disableLigatures: true });
const segment = (text, style, extra = {}) => ({ ...style, ...extra, text });
const simpleData = (text, style, { align = 'left', lineHeight = 1.1, emphasis = [] } = {}) => {
  const parts = [];
  let cursor = 0;
  const markers = [...emphasis].sort((a, b) => b.text.length - a.text.length);
  while (cursor < text.length) {
    let match = null;
    for (const marker of markers) {
      const index = text.indexOf(marker.text, cursor);
      if (index >= 0 && (!match || index < match.index)) match = { index, marker };
    }
    if (!match) { parts.push(segment(text.slice(cursor), style)); break; }
    if (match.index > cursor) parts.push(segment(text.slice(cursor, match.index), style));
    parts.push(segment(match.marker.text, match.marker.style));
    cursor = match.index + match.marker.text.length;
  }
  return { schemaVersion: 2, segments: parts, textAlign: align, lineHeight, lineHeightMode: 'source', managedSourceSymbols: [] };
};

const dom = await readJson(domRel);
const blockById = new Map(dom.blocks.map((value, index) => [value.id, { ...value, index }]));
const block = id => {
  const found = blockById.get(id);
  assert.ok(found, `Missing source block ${id}`);
  return found;
};
const sourceText = value => norm(value.lines.map(line => line.spans.map(span => span.text ?? '').join('')).join(' '));
const colWidth = x => x < 410 ? 408.5 - x : 738.5 - x;
const frameFrom = (source, text, { x = source.bbox[0], y = source.bbox[1], width = colWidth(source.bbox[0]), height = null, align = 'left' } = {}) => ({
  x, y, width,
  height: height ?? Math.max(source.bbox[3] - source.bbox[1] + 4, Math.ceil(text.length / 64) * 12 + 4),
  rotation: 0, textAlign: align, lineHeight: 1.1,
});
const baseFor = source => {
  const span = source.lines.flatMap(line => line.spans).find(item => item.font?.startsWith('Optima'));
  return makeStyle(span?.font ?? 'OptimaLTStd', span?.size ?? 10, '#231f20');
};
const bold = source => makeStyle('OptimaLTStd-Bold', 10, '#231f20', 700);
const italic = source => makeStyle('OptimaLTStd-Italic', 10, '#231f20', 400, 'italic');
const boldItalic = source => makeStyle('OptimaLTStd-BoldItalic', 10, '#231f20', 700, 'italic');

const specs = [
  { blockId: 'block_43', text: 'Ícones, Condições, Tags e Símbolos', style: makeStyle('Cinzel-Regular', 18, '#231f20', 700), frame: { x: 86.0275, y: 56.9258, width: 615, height: 26, rotation: 0, textAlign: 'left', lineHeight: 1 } },
  { blockId: 'block_19', text: 'Ícones', heading: true },
  { blockId: 'block_21', text: 'Ícones aparecem em quase todas as cartas de Middara.', emphasis: [{ text: 'Middara', style: boldItalic() }], terms: ['Icon → Ícone; registro oficial específico não localizado.'] },
  { blockId: 'block_22', text: 'Nos Itens, indicam quais benefícios você obtém ao equipá-los.', terms: ['Gain → obter é candidato contextual.'] },
  { blockId: 'block_23', text: 'Nas Armas, os Ícones indicam o Alcance e os Dados de Combate usados. Nas Armaduras, indicam o bônus no Valor de Armadura; nos Núcleos, o bônus no Valor de Defesa.', terms: ['Range, Combat Dice, Armor Value e Defense Value aguardam harmonização terminológica humana.'] },
  { blockId: 'block_24', text: 'Nas Cartas de Aventureiro e de Combatente, os Ícones indicam atributos das Miniaturas, como PV, Movimento e Defesa.', terms: ['Combatant → Combatente; HP → PV; harmonizar com termos de atributos.'] },
  { blockId: 'block_25', text: 'Nas Cartas de Disciplina, indicam quais tipos de Arma precisam estar equipados para usar a carta de Habilidade.', terms: ['Ability → Habilidade; Weapon → Arma, candidatos contextuais.'] },
  { blockId: 'block_26', text: 'Veja a lista de Ícones, pág. 89.', emphasis: [{ text: 'Ícones', style: italic() }], terms: ['Verbo de remissão “See” → “Veja”; revisar o título referenciado na p.89.'] },
  { blockId: 'block_27', text: 'Toda Habilidade tem uma Condição. Tags de Condição indicam quando ela pode ser usada. Pontos de Vigor e Símbolos exigidos para usá-la também são Condições. Antes de usá-la, cumpra as Condições e pague os custos.', header: 'Condições', compound: true, terms: ['Condition → Condição; Condition Tag → Tag de Condição; Stamina Points → Pontos de Vigor são candidatos sem entrada específica no glossário.'] },
  { blockId: 'block_30', text: 'Veja Tags de Condição, pág. 90.', emphasis: [{ text: 'Tags de Condição', style: italic() }], terms: ['Condition Tags → Tags de Condição; remissão à p.90.'] },
  { blockId: 'block_31', text: 'Tags', heading: true },
  { blockId: 'block_33', text: 'Tags são regras especiais resumidas em palavras curtas. Elas sempre aparecem em CAIXA ALTA (por exemplo, VOO e INCANSÁVEL).', emphasis: [{ text: 'CAIXA ALTA', style: bold() }, { text: 'VOO', style: bold() }, { text: 'INCANSÁVEL', style: bold() }], terms: ['RELENTLESS → INCANSÁVEL segue o glossário; FLIGHT → VOO aguarda validação.'] },
  { blockId: 'block_34', text: 'Tags produzem vários efeitos para os Aventureiros. Algumas não têm efeito, a menos que outra regra faça referência a elas. Outras têm regras especiais e Habilidades próprias.', terms: ['Tags e Habilidades são capitalizados como termos de jogo; revisar o uso contextual.'] },
  { blockId: 'block_35', text: 'As Tags no canto superior direito das Cartas de Item são consideradas Passivas e estão sempre em vigor.', emphasis: [{ text: 'Passivas', style: italic() }], terms: ['Passive → Passiva como nome de Tag aguarda revisão.'] },
  { blockId: 'block_36', text: 'Veja Tags, págs. 92–94.', emphasis: [{ text: 'Tags', style: italic() }], terms: ['“See Tags” → “Veja Tags”; referências ao intervalo 92–94 preservadas.'] },
  { blockId: 'block_37', text: 'Símbolos', heading: true },
  { blockId: 'block_40', text: 'Os 4 Símbolos acima são produzidos ao rolar os dados personalizados do jogo. Dados diferentes podem produzir Símbolos diferentes, que podem ser gastos para usar Habilidades. Salvo indicação em contrário, Habilidades que usam Símbolos como Condição podem ser usadas sem limite, desde que haja Símbolos para gastar.', emphasis: [{ text: '4', style: bold() }], terms: ['Custom dice → dados personalizados e a redação de “no limit” aguardam revisão.'] },
  { blockId: 'block_41', text: 'Algumas Habilidades que usam Símbolos como Condição podem ter vários Símbolos impressos. ⟦preservar aqui os glifos originais de Escudo e Livro com o número 3⟧ Nesses casos, usar a Habilidade uma vez custa 1 Livro e 1 Escudo. Em outros casos, pode haver Símbolos demais para caber na carta; por isso, eles são impressos com números. Por exemplo, (3) significa que um Aventureiro deve gastar 3 Livros para usar essa Habilidade.', blocked: true, terms: ['O exemplo tem glifos-fonte de Escudo e Livro/3 sem placements semânticos. A identidade da composição combat.page com o número 3 está bloqueada no ledger; o reflow PT exige preservar e ancorar esses glifos.'] },
  { blockId: 'block_42', text: 'Normalmente, os Símbolos só podem ser gastos durante uma Ação de Ataque, embora algumas Habilidades permitam gastar Símbolos em rolagens que não sejam de Ataque.', callout: true, emphasis: [{ text: 'só', style: bold() }], terms: ['Ação de Ataque e “rolagens que não sejam de Ataque” são candidatos contextuais.'], frame: { x: 421.5114, y: 467.502, width: 318, height: 45, rotation: 0, textAlign: 'left', lineHeight: 1.1 } },
];

const candidates = specs.map(spec => {
  const source = block(spec.blockId);
  let data;
  if (spec.heading) data = { schemaVersion: 2, segments: [segment(spec.text, makeStyle('Cinzel-Regular', 12, '#231f20', 700))], textAlign: 'left', lineHeight: 1, lineHeightMode: 'source', managedSourceSymbols: [] };
  else if (spec.compound) {
    const bodyStyle = baseFor(source);
    data = { schemaVersion: 2, segments: [segment(`${spec.header}\n\n`, makeStyle('Cinzel-Regular', 12, '#231f20', 700)), segment(spec.text, bodyStyle)], textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [] };
  } else if (spec.callout) {
    const base = makeStyle('OptimaLTStd', 10, '#231f20');
    const icon = segment('\uFFFC', base, { symbolId: 'tag.important.icon', symbolMetrics: { widthEm: 1, heightEm: 1, verticalAlignEm: 0.2 } });
    const label = segment('IMPORTANTE:', makeStyle('OptimaLTStd-Black', 10, '#b91d23', 900), { textStrokeWidthPt: 2, textStrokeColor: '#ffffff' });
    data = { ...simpleData(spec.text, base, { align: 'left', emphasis: spec.emphasis }), segments: [icon, label, segment(' ', bold(source)), ...simpleData(spec.text, base, { align: 'left', emphasis: spec.emphasis }).segments], lineHeight: 1.1, lineHeightMode: 'custom', managedSourceSymbols: ['tag.important.icon'] };
  } else data = simpleData(spec.text, spec.style ?? baseFor(source), { align: 'left', emphasis: spec.emphasis ?? [] });
  const key = `page_30_block_${source.index}`;
  const frame = spec.frame ?? (source.index === 19 ? null : frameFrom(source, spec.text, { height: spec.blockId === 'block_27' ? 78 : spec.blockId === 'block_42' ? 45 : null }));
  const bbox = source.lines.map(line => line.bbox);
  return {
    sourceBlockId: spec.blockId,
    sourceUnitIds: spec.blockId === 'block_41' ? ['p030-v116-117-n2'] : source.typographicSpanUnits?.map(unit => unit.id) ?? [],
    blockIndex: source.index,
    sourceText: sourceText(source),
    proposalText: spec.callout ? `IMPORTANTE: ${spec.text}` : spec.text,
    proposalMarkup: spec.blockId === 'block_41' ? spec.text : spec.callout ? `[[symbol:tag.important.icon]] IMPORTANTE: ${spec.text}` : spec.text,
    sourceSymbolsPreserved: spec.callout ? ['tag.important.icon'] : spec.blockId === 'block_41' ? ['source artwork: shield icon', 'source artwork: book icon with printed 3', 'bold numeral 3'] : [],
    spanKey: key,
    legacyBlockSpanKey: `${key}__pt-BR`,
    editorUnitKey: key,
    language: 'pt-BR',
    data,
    diagnosticData: spec.blocked ? { schemaVersion: 2, segments: [], textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [] } : data,
    status: 'draft_pending_viewer_editor_copyfit_pdf_human_review',
    technicalStatus: spec.blocked ? 'whole_unit_diagnostic_blank_source_symbol_composition_exception' : 'pending_viewer_editor_copyfit_pdf',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: spec.blocked ? 'whole_unit_blank_due_to_unresolved_source_symbol_composition_exception' : 'proposal',
    sourceLineCount: source.lines.length,
    sourceBboxes: bbox,
    snapshotLayoutFrame: frame,
    pendingTerms: spec.terms ?? [],
  };
});
assert.equal(candidates.length, 19);
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, candidates.length);

const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const framesUrl = new URL('/api/layout-frames', payloadUrl);
framesUrl.searchParams.set('limit', '5000');
const [trResponse, frResponse] = await Promise.all([
  fetch(translationsUrl, { signal: AbortSignal.timeout(20000) }),
  fetch(framesUrl, { signal: AbortSignal.timeout(20000) }),
]);
assert.ok(trResponse.ok && frResponse.ok, `Payload GET failed: translations=${trResponse.status}, frames=${frResponse.status}`);
const [trBody, frBody] = await Promise.all([trResponse.json(), frResponse.json()]);
const existingTranslations = (trBody.docs ?? []).filter(item => String(item.spanKey ?? '').startsWith('page_30_'));
const existingFrames = (frBody.docs ?? []).filter(item => Number(item.pageNumber) === pageNumber);
assert.equal(existingTranslations.length, 0, 'Existing p.30 translations need preservation before continuing.');
assert.equal(existingFrames.length, 0, 'Existing p.30 frames need preservation before continuing.');

const snapshotDir = resolve(root, snapshotDirRel);
const snapshotPageDir = resolve(snapshotDir, 'pages', pageId);
await mkdir(snapshotPageDir, { recursive: true });
await cp(resolve(root, pageDirRel), snapshotPageDir, { recursive: true, force: true });
const template = await readJson('output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/snapshot-diagnostic-v4/snapshot.json');
const snapshot = {
  ...template,
  translations: candidates.map(candidate => ({ spanKey: candidate.legacyBlockSpanKey, language: 'pt-BR', data: candidate.diagnosticData })),
  layoutFrames: candidates.filter(candidate => candidate.snapshotLayoutFrame).map(candidate => ({
    unitKey: candidate.spanKey,
    pageNumber,
    language: 'pt-BR',
    data: candidate.snapshotLayoutFrame,
  })),
  assetPages: [pageNumber],
  sourcePageBoxes: { [pageNumber]: template.sourcePageBoxes?.['28'] },
  diagnosticOnly: { proposalId: 'page-030-icons-conditions-tags-symbols-2026-10-16-v2', blankedSpanKeys: candidates.filter(candidate => candidate.diagnosticRendering.startsWith('whole_unit_blank')).map(candidate => candidate.legacyBlockSpanKey) },
  verifyRenderedSnapshot: true,
};
assert.ok(snapshot.sourcePageBoxes[pageNumber]);
await writeFile(resolve(snapshotDir, 'snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`);

const sourcePdfBytes = await readFile(sourcePdfRel);
const sourceDomBytes = await readFile(resolve(root, domRel));
const bgBytes = await readFile(resolve(root, `${pageDirRel}/background.webp`));
const sidecarBytes = await readFile(resolve(root, `${pageDirRel}/inline_elements.json`));
const proofDir = resolve(root, proofRel);
await mkdir(proofDir, { recursive: true });
const proposal = {
  schemaVersion: 1,
  proposalId: 'page-030-icons-conditions-tags-symbols-2026-10-16-v2',
  page: pageNumber,
  locale: 'pt-BR',
  title: 'Ícones, Condições, Tags e Símbolos',
  sourcePdf: sourcePdfRel,
  sourcePdfSha256: sha256(sourcePdfBytes),
  sourceDomSha256: sha256(sourceDomBytes),
  backgroundSha256: sha256(bgBytes),
  inlineElementsSha256: sha256(sidecarBytes),
  status: 'proposal_v2_pending_viewer_editor_copyfit_pdf_human_review_with_one_symbol_composition_exception',
  counts: { candidates: candidates.length, verifiedInViewer: 0, verifiedInEditor: 0, verifiedInCopyfit: 0, verifiedInPdf: 0, diagnosticBlankUnits: 1, preservedHumanRecords: 0, artworkExceptions: 0, technicalExceptions: 1 },
  sourceReview: {
    status: 'official_pdf_and_english_viewer_compared_2026-10-16',
    sourcePdfPageCount: 102,
    officialSourceRaster: 'output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/source-official-p030.png',
    englishViewerScreenshot: 'output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/viewer-en-source-v1.png',
    viewerFinding: 'PDF and English Viewer agree on title, two columns, headings, the four-symbol artwork panel, inline example glyphs, IMPORTANT callout and background art. The title is editable despite suspectedGhost metadata and previously passed a one-line PT preview.',
    sourceSymbolFinding: 'The prose example block_41 contains source Book/3 and Shield artwork that has no semantic placements. The existing symbol audit blocks p030-v116-117-n2 because combat.page contains the printed number 3. This candidate is blank as a whole in the PT diagnostic until composition/anchoring is resolved.',
    payloadTranslations: existingTranslations.length,
    payloadLayoutFrames: existingFrames.length,
  },
  candidates,
  artworkExceptions: [],
  technicalExceptions: [{
    id: 'p030-example-source-inline-symbol-composition',
    sourceBlockId: 'block_41',
    sourceUnitId: 'p030-v116-117-n2',
    bboxPt: block('block_41').bbox,
    classification: 'unmapped_inline_source_symbol_composition',
    sourceSymbols: ['shield', 'book icon with printed 3', 'bold numeric 3'],
    diagnosticTextTreatment: 'The entire block_41 is blank only in the PT-BR diagnostic. Full proposed PT prose and source-symbol placement notes remain in this candidate JSON and Markdown.',
    canonicalRepairStatus: 'pending occurrence identity and placement review; canonical sidecar unchanged',
    userVisibleImpact: 'The translated example cannot be certified until the Shield/Book glyphs and their source spacing reflow with the text without duplication or loss.',
  }],
  unchangedSourceContent: [
    { sourceText: 'Four symbols in the Symbols panel.', reason: 'The panel is complete language-invariant artwork.' },
    { sourceText: 'Page number 30 and background illustration.', reason: 'Artwork and folio are unchanged.' },
  ],
  payload: { readOnlyMethod: 'GET', existingPageTranslations: existingTranslations.length, existingPageLayoutFrames: existingFrames.length, writes: 0 },
  diagnosticFailurePolicy: 'Blank only a whole failed editable unit in this isolated diagnostic snapshot. Never use English fallback or partial PT-BR in a failed unit. Preserve source and full proposal; keep original background visible. Do not persist blanks to Payload.',
};
await writeFile(resolve(root, proposalRel), `${JSON.stringify(proposal, null, 2)}\n`);

const md = `# p.30 — proposta PT-BR “Ícones, Condições, Tags e Símbolos” v2\n\n**Estado:** proposta estruturada em 19 unidades. A validação de Viewer, Editor read-only, Copyfit V3 e PDF está pendente. A unidade do exemplo inline fica inteira em branco somente no snapshot por uma exceção de composição de símbolos. Revisão humana pendente. Nenhuma tradução ou frame foi gravado no Payload. A v1 permanece preservada.\n\n## Proposta de texto\n\n${candidates.map(candidate => `### ${candidate.sourceBlockId} — ${candidate.proposalMarkup}\n\n${candidate.pendingTerms.map(term => `- Revisão: ${term}`).join('\n')}`).join('\n\n')}\n\n## Exceção de símbolos inline\n\nO bloco block_41 contém glifos-fonte de Escudo e Livro com número 3 entre trechos do exemplo. Eles não têm placements semânticos ativos. A auditoria de símbolos preserva a ocorrência p030-v116-117-n2 porque combat.page tem o número impresso 3. Para não deixar um fluxo PT ocupar as posições fixas, o bloco inteiro fica vazio somente no Viewer/PDF diagnóstico. O texto completo continua acima e no JSON; nenhuma arte ou fundo é removido.\n\n## Fonte e evidências\n\nO PDF oficial e o Viewer EN foram comparados. Ver [PDF raster](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/source-official-p030.png), [Viewer EN](../../../output/proofs/translation-readiness-2026-10-16/p030-icons-conditions-tags-symbols-proposal-v1/viewer-en-source-v1.png) e a [proposta v1](page-030-icons-conditions-tags-symbols-v1.md). Os hashes ficam no [JSON v2](page-030-icons-conditions-tags-symbols-2026-10-16-v2.json).\n`;
await writeFile(resolve(root, markdownRel), md);
console.log(JSON.stringify({ proposal: proposalRel, candidates: candidates.length, blankedSpanKeys: snapshot.diagnosticOnly.blankedSpanKeys, layoutFrames: snapshot.layoutFrames.length, payloadTranslations: existingTranslations.length, payloadFrames: existingFrames.length, snapshot: `${snapshotDirRel}/snapshot.json` }, null, 2));
