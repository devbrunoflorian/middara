#!/usr/bin/env node
/** Prepare an isolated, recoverable PT-BR proposal for p.29. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const pageNumber = 29;
const pageId = 'page_029';
const pageDirRel = `apps/web/public/pages/${pageId}`;
const pageDomRel = `${pageDirRel}/${pageId}_dom.json`;
const proofRel = 'output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v2';
const snapshotDirRel = `${proofRel}/snapshot-diagnostic-v2`;
const snapshotRel = `${snapshotDirRel}/snapshot.json`;
const proposalRel = 'docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.json';
const markdownRel = 'docs/translations/proposals/page-029-item-upgrades-proposal-2026-10-16-v2.md';
const sourcePdfRel = 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const templateSnapshotRel = 'output/proofs/translation-readiness-2026-10-16/p028-item-upgrades-proposal-v1/snapshot-diagnostic-v4/snapshot.json';
const isolatedStarSidecarRel = 'output/proofs/translation-readiness-2026-10-16/p029-damage-star-semantic-v1/snapshot/pages/page_029/inline_elements.json';
const isolatedStarMaskRel = 'output/proofs/translation-readiness-2026-10-16/p029-damage-star-semantic-v1/snapshot/pages/page_029/inline-element-mask-002.png';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const normalize = value => String(value).replace(/\s+/gu, ' ').trim();
const readJson = async rel => JSON.parse(await readFile(resolve(root, rel), 'utf8'));
const dom = await readJson(pageDomRel);
const sourcePdf = await readFile(sourcePdfRel);
assert.equal(dom.page_number, pageNumber);

const blockById = new Map(dom.blocks.map((value, index) => [value.id, { ...value, index }]));
const block = id => {
  const value = blockById.get(id);
  assert.ok(value, `Missing source block ${id}`);
  return value;
};
const sourceSpans = value => value.lines.flatMap(line => line.spans).filter(span => (span.text ?? '').trim());
const sourceText = value => normalize(value.lines.map(line => line.spans.map(span => span.text ?? '').join('')).join(' '));
const makeStyle = (font, size, color, weight = 400, style = 'normal') => ({ font, size, color, weight, style, disableLigatures: true });
const segment = (text, style, extra = {}) => ({ ...style, ...extra, text });
const baseBody = value => {
  const span = sourceSpans(value).find(item => /Optima/u.test(item.font ?? '') && !/Bold|Black|DemiBold/u.test(item.font ?? '')) ?? sourceSpans(value)[0];
  return makeStyle(span?.font ?? 'OptimaLTStd', span?.size ?? 10, span?.color ?? '#231f20');
};
const emphStyle = (value, kind = 'bold', size = null) => {
  const base = baseBody(value);
  if (kind === 'boldItalic') return makeStyle('OptimaLTStd-BoldItalic', size ?? base.size, base.color, 700, 'italic');
  if (kind === 'italic') return makeStyle('OptimaLTStd-Italic', size ?? base.size, base.color, 400, 'italic');
  if (kind === 'black') return makeStyle('OptimaLTStd-Black', size ?? base.size, '#b91d23', 900);
  return makeStyle('OptimaLTStd-Bold', size ?? base.size, base.color, 700);
};
const richTextSegments = (text, base, emphasis = []) => {
  const entries = [...emphasis].sort((a, b) => b.text.length - a.text.length);
  const segments = [];
  let cursor = 0;
  while (cursor < text.length) {
    let match = null;
    for (const entry of entries) {
      const index = text.indexOf(entry.text, cursor);
      if (index >= 0 && (!match || index < match.index || (index === match.index && entry.text.length > match.entry.text.length))) {
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
const simpleData = (text, source, { emphasis = [], align = 'left', lineHeight = 1.1, base = baseBody(source) } = {}) => ({
  schemaVersion: 2,
  segments: richTextSegments(text, base, emphasis.map(([value, kind = 'bold', size = null]) => ({ text: value, style: emphStyle(source, kind, size) }))),
  textAlign: align,
  lineHeight,
  lineHeightMode: 'source',
  managedSourceSymbols: [],
});
const labelData = (text, source, font, size, color, weight, align = 'center') => ({
  schemaVersion: 2,
  segments: [segment(text, makeStyle(font, size, color, weight))],
  textAlign: align,
  lineHeight: 1.05,
  lineHeightMode: 'source',
  managedSourceSymbols: [],
});
const calloutData = (body, source, emphases = []) => {
  const base = makeStyle('OptimaLTStd', 10, '#231f20');
  const icon = { text: '\uFFFC', symbolId: 'tag.important.icon', symbolMetrics: { widthEm: 1, heightEm: 1, verticalAlignEm: 0.2 }, ...base };
  const label = segment('IMPORTANTE:', makeStyle('OptimaLTStd-Black', 10, '#b91d23', 900), { textStrokeWidthPt: 2, textStrokeColor: '#ffffff' });
  const parts = [icon, label, segment(' ', makeStyle('OptimaLTStd-Bold', 10, '#231f20', 700)), ...richTextSegments(body, base, emphases.map(value => ({ text: value, style: makeStyle('OptimaLTStd-Bold', 10, '#231f20', 700) })))];
  return { schemaVersion: 2, segments: parts, textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'custom', managedSourceSymbols: ['tag.important.icon'] };
};
const headingData = text => ({
  schemaVersion: 2,
  segments: [segment(text, makeStyle('Cinzel-Regular', 12, '#231f20', 700))],
  textAlign: 'left', lineHeight: 1, lineHeightMode: 'source', managedSourceSymbols: [],
});

const specs = [
  { blockId: 'block_10', text: 'Tipos de Aprimoramento de Item', align: 'center', lineHeight: 1, base: makeStyle('Cinzel-Regular', 18, '#ffffff', 700), terms: ['Item Upgrade Types → Tipos de Aprimoramento de Item; o frame diagnóstico se amplia centralizado sobre os cards para manter o título em uma linha.'], frame: { x: 199.7, y: 570.5471, width: 420, height: 24.264 } },
  { blockId: 'block_13', text: 'Obra-Prima', align: 'center', base: makeStyle('Cinzel-Regular', 7.9548, '#ffffff', 400), terms: ['Master Work → Obra-Prima; nome do aprimoramento sujeito a revisão editorial.'], frame: { x: 204.702, y: 640.4916, width: 78.921, height: 10.723 } },
  { blockId: 'block_15', text: 'APRIMORAMENTO DE ARMA', align: 'center', base: makeStyle('OptimaLTStd-Bold', 4.7729, '#231f20', 700), terms: ['Weapon Upgrade → Aprimoramento de Arma; frame ampliado somente até a área interna do card.'], frame: { x: 204.702, y: 657.2903, width: 78.921, height: 5.690 } },
  { blockId: 'block_16', text: 'EXAUSTAR\nAo atacar, adicione +1 à rolagem de ATQ.', align: 'center', terms: ['Exhaust → Exaustar segue decisão do glossário. ATK ROLL → rolagem de ATQ é proposta contextual.'] },
  { blockId: 'block_20', text: 'Refinado', align: 'center', base: makeStyle('Cinzel-Regular', 7.9548, '#ffffff', 400), terms: ['Refined → Refinado; nome do aprimoramento sujeito a revisão editorial.'], frame: { x: 316.330, y: 640.4916, width: 78.921, height: 10.723 } },
  { blockId: 'block_21', text: 'APRIMORAMENTO DE ARMADURA', align: 'center', base: makeStyle('OptimaLTStd-Bold', 4.7729, '#231f20', 700), terms: ['Armor Upgrade → Aprimoramento de Armadura; frame ampliado somente até a área interna do card.'], frame: { x: 316.330, y: 657.2903, width: 78.921, height: 5.690 } },
  { blockId: 'block_22', text: 'EXAUSTAR\nSe um Ataque for feito contra\nvocê, ignore um único   Símbolo.', align: 'left', damageStarEffect: true, frame: { x: 317.105, y: 746.3815, width: 78.9194, height: 23.5044, textAlign: 'left', lineHeight: 1.1 }, terms: ['Exhaust → Exaustar segue o glossário. A estrela preta combat.damage-star fica como símbolo-fonte independente na posição original entre “único” e “Símbolo”.'] },
  { blockId: 'block_27', text: 'Vidência', align: 'center', base: makeStyle('Cinzel-Regular', 7.9548, '#ffffff', 400), terms: ['Scrying → Vidência; nome do aprimoramento sujeito a revisão editorial.'], frame: { x: 426.985, y: 640.4916, width: 78.921, height: 10.723 } },
  { blockId: 'block_28', text: 'EXAUSTAR\nNo Teste de Convicção, some +1 à rolagem.', align: 'center', terms: ['Conviction Check → Teste de Convicção é candidato. Exaustar segue o glossário.'] },
  { blockId: 'block_30', text: 'APRIMORAMENTO DE NÚCLEO', align: 'center', base: makeStyle('OptimaLTStd-Bold', 4.7729, '#231f20', 700), terms: ['Core Upgrade → Aprimoramento de Núcleo; frame ampliado somente até a área interna do card.'], frame: { x: 426.985, y: 657.2903, width: 78.921, height: 5.690 } },
  { blockId: 'block_34', text: 'Etherium', align: 'center', base: makeStyle('Cinzel-Regular', 7.9548, '#ffffff', 400), terms: ['Etherium permanece como nome próprio.'], frame: { x: 534.825, y: 640.4916, width: 90.016, height: 10.723 } },
  { blockId: 'block_35', text: 'APRIMORAMENTO UNIVERSAL', align: 'center', base: makeStyle('OptimaLTStd-Bold', 4.7729, '#231f20', 700), terms: ['Universal Upgrade → Aprimoramento Universal; frame ampliado somente até a área interna do card.'], frame: { x: 534.825, y: 657.2903, width: 90.016, height: 5.690 } },
  { blockId: 'block_38', text: 'ARMA / ARMADURA / NÚCLEO', align: 'center', base: makeStyle('OptimaLTStd-Bold', 9, '#ffffff', 700), terms: ['Weapon / Armor / Core → Arma / Armadura / Núcleo; nomes de Tag permanecem candidatos a revisão.'] },
  { blockId: 'block_43', text: 'UNIVERSAL', align: 'center', base: makeStyle('OptimaLTStd-Bold', 9, '#ffffff', 700), terms: ['Universal permanece como nome de Tag traduzido.'] },
  { blockId: 'block_45', unitId: 'p29-block-45-first-size-12pt', text: 'Transferir e substituir Aprimoramentos de Item', key: 'page_29_unit_p29-block-45-first-size-12pt', editorKey: 'page_29_unit_p29-block-45-first-size-12pt__pt-BR', heading: true, terms: ['Item Upgrade → Aprimoramento de Item conforme o glossário.'] },
  { blockId: 'block_45', unitId: 'p29-block-45-remaining-size-10pt', text: 'Desbloqueado um tipo de Aprimoramento de Item, é possível comprar quantas cópias quiser, desde que não ultrapasse o total de cartas disponíveis daquele Aprimoramento.', key: 'page_29_unit_p29-block-45-remaining-size-10pt', editorKey: 'page_29_unit_p29-block-45-remaining-size-10pt__pt-BR', terms: ['Item Upgrade → Aprimoramento de Item conforme o glossário; redação concisa preserva o limite de cópias disponíveis.'] },
  { blockId: 'block_48', text: 'Se um jogador quiser equipar um Aprimoramento de Item, mas não houver cópias disponíveis por estarem equipadas em outras Cartas de Item, poderá pagar o custo em Ouro para transferi-lo para outro Item.', key: 'page_29_block_16', terms: ['Item Upgrade → Aprimoramento de Item; Gold → Ouro; regra de transferência preservada.'] },
  { blockId: 'block_49', text: 'Para substituir um Aprimoramento de Item equipado, o jogador deve pagar novamente seu custo em Ouro.', terms: ['Item Upgrade → Aprimoramento de Item; Gold → Ouro; texto encurtado para preservar o frame original.'] },
  { blockId: 'block_50', text: 'IMPORTANTE: Para fins de Aprimoramento, Itens de Saque de História e de Monstro contam como Itens do Nível de Saque atual.', key: 'page_29_block_18', callout: true, terms: ['Story and Monster Loot Items → Itens de Saque de História e de Monstro; Loot LVL → Nível de Saque, candidato contextual.'] },
  { blockId: 'block_51', text: 'IMPORTANTE: Itens com a Tag DUPLO têm dois lados distintos. Se você aprimorar um lado, o outro também será aprimorado. Se o outro lado não for elegível para esse Aprimoramento, não será possível usá-lo, mas ele continuará anexado ao Item.', key: 'page_29_block_19', callout: true, bold: ['DUPLO'], terms: ['DOUBLE → DUPLO; forma da Tag e flexão de Upgrade ainda requerem revisão terminológica humana.'] },
  { blockId: 'block_52', text: 'Por exemplo: Remi quer aprimorar seu Top-Heavy Axe (Arma Comum) com o Aprimoramento de Item Obra-Prima, mas sua War Axe (Arma Mundana) já está aprimorada com a última cópia disponível de Obra-Prima. (Seus companheiros de grupo já usaram todas, avidamente.) Ela terá de pagar 30 de Ouro para transferir Obra-Prima da War Axe para o Top-Heavy Axe.', key: 'page_29_block_20', emphasis: [['Por exemplo:', 'bold'], ['Top-Heavy Axe', 'boldItalic'], ['War Axe', 'boldItalic'], ['Obra-Prima', 'boldItalic'], ['Arma Comum', 'bold'], ['Arma Mundana', 'bold'], ['30', 'bold']], frame: { x: 81.1732, y: 320.4014, width: 319, height: 66.92, textAlign: 'left', lineHeight: 1.1 }, terms: ['Master Work → Obra-Prima; Common Weapon → Arma Comum; Mundane Weapon → Arma Mundana. Top-Heavy Axe e War Axe mantidos em inglês como nomes de carta até revisão.'] },
];

const dataFor = spec => {
  const source = block(spec.blockId);
  if (spec.callout) return calloutData(spec.text.replace(/^IMPORTANTE:\s*/u, ''), source, spec.bold ?? []);
  if (spec.damageStarEffect) {
    const [tag, ...bodyLines] = spec.text.split('\n');
    const body = bodyLines.join('\n');
    return { schemaVersion: 2, segments: [segment(`${'\u00a0'.repeat(16)}${tag}`, makeStyle('OptimaLTStd-DemiBold', 5.2049, '#ffffff', 600)), segment('\n', makeStyle('OptimaLTStd', 5.5683, '#231f20')), segment(body, makeStyle('OptimaLTStd', 5.5683, '#231f20'))], textAlign: 'left', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [] };
  }
  if (spec.blockId === 'block_16') {
    const tag = segment('EXAUSTAR', makeStyle('OptimaLTStd-DemiBold', 5.2049, '#ffffff', 600));
    const body = richTextSegments('Ao atacar, adicione +1 à rolagem de ATQ.', makeStyle('OptimaLTStd', 5.5683, '#231f20'), [{ text: '+1 à rolagem de ATQ.', style: makeStyle('OptimaLTStd-Bold', 5.1706, '#231f20', 700) }]);
    return { schemaVersion: 2, segments: [tag, segment('\n', makeStyle('OptimaLTStd', 5.5683, '#231f20')), ...body], textAlign: 'center', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [] };
  }
  if (spec.blockId === 'block_28') {
    const tag = segment('EXAUSTAR', makeStyle('OptimaLTStd-DemiBold', 5.2049, '#ffffff', 600));
    const body = richTextSegments('No Teste de Convicção, some +1 à rolagem.', makeStyle('OptimaLTStd', 5.5683, '#231f20'), [{ text: '+1', style: makeStyle('OptimaLTStd-Bold', 5.1706, '#231f20', 700) }]);
    return { schemaVersion: 2, segments: [tag, segment('\n', makeStyle('OptimaLTStd', 5.5683, '#231f20')), ...body], textAlign: 'center', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [] };
  }
  if (spec.heading) return headingData(spec.text);
  if (spec.blockId === 'block_10') return { schemaVersion: 2, segments: [segment(spec.text, spec.base)], textAlign: spec.align, lineHeight: spec.lineHeight ?? 1, lineHeightMode: 'source', managedSourceSymbols: [] };
  if (spec.blockId === 'block_52') return simpleData(spec.text, source, { align: 'left', emphasis: spec.emphasis.map(([text, kind]) => [text, kind]) });
  return simpleData(spec.text, source, { align: spec.align ?? 'left', lineHeight: spec.lineHeight ?? 1.1, base: spec.base ?? baseBody(source) });
};

const candidates = specs.map(spec => {
  const source = block(spec.blockId);
  const spanKey = spec.unitId ? spec.key : `page_29_block_${source.index}`;
  const data = spec.data ?? dataFor(spec);
  return {
    sourceBlockId: spec.blockId,
    sourceUnitIds: spec.unitId ? [spec.unitId] : source.typographicSpanUnits?.map(unit => unit.id) ?? [],
    blockIndex: source.index,
    sourceText: sourceText(source),
    proposalText: spec.text,
    proposalMarkup: spec.damageStarEffect ? 'EXAUSTAR\nSe um Ataque for feito contra [[source-symbol:combat.damage-star]] você, ignore um único Símbolo.' : spec.callout ? `[[symbol:tag.important.icon]]${spec.text}` : spec.text,
    sourceSymbolsPreserved: spec.damageStarEffect ? ['combat.damage-star'] : [],
    spanKey,
    legacyBlockSpanKey: `${spanKey}__pt-BR`,
    editorUnitKey: spec.unitId ? (spec.editorKey ?? spanKey) : spanKey,
    language: 'pt-BR',
    data,
    diagnosticData: spec.damageStarEffect ? { ...data, segments: [] } : data,
    status: 'draft_pending_viewer_editor_copyfit_pdf_human_review',
    technicalStatus: 'pending_viewer_editor_copyfit_pdf',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: spec.damageStarEffect ? 'whole_unit_blank_due_to_unresolved_star_rendering_exception' : 'proposal',
    sourceLineCount: source.lines.length,
    sourceBboxes: source.lines.map(line => line.bbox),
    pendingTerms: spec.terms ?? [],
  };
});
assert.equal(candidates.length, 21);
assert.equal(new Set(candidates.map(candidate => candidate.spanKey)).size, candidates.length);

const payloadUrl = process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000';
const translationsUrl = new URL('/api/translations', payloadUrl);
translationsUrl.searchParams.set('where[language][equals]', 'pt-BR');
translationsUrl.searchParams.set('limit', '5000');
const translationsResponse = await fetch(translationsUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(translationsResponse.ok, `Payload translations GET failed: ${translationsResponse.status}`);
const docs = (await translationsResponse.json()).docs ?? [];
const existingPageTranslations = docs.filter(item => String(item.spanKey ?? '').startsWith('page_29_'));
const framesUrl = new URL('/api/layout-frames', payloadUrl);
framesUrl.searchParams.set('limit', '5000');
const framesResponse = await fetch(framesUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(framesResponse.ok, `Payload layout-frames GET failed: ${framesResponse.status}`);
const frameDocs = (await framesResponse.json()).docs ?? [];
const existingPageFrames = frameDocs.filter(item => Number(item.pageNumber) === pageNumber);

const proofDir = resolve(root, proofRel);
const snapshotDir = resolve(root, snapshotDirRel);
const snapshotPageDir = resolve(snapshotDir, 'pages', pageId);
await mkdir(snapshotPageDir, { recursive: true });
await cp(resolve(root, pageDirRel), snapshotPageDir, { recursive: true, force: true });
await cp(resolve(root, isolatedStarSidecarRel), resolve(snapshotPageDir, 'inline_elements.json'));
await cp(resolve(root, isolatedStarMaskRel), resolve(snapshotPageDir, 'inline-element-mask-002.png'));
const templateSnapshot = await readJson(templateSnapshotRel);
const snapshot = {
  ...templateSnapshot,
  translations: candidates.map(candidate => ({ spanKey: candidate.legacyBlockSpanKey, language: 'pt-BR', data: candidate.diagnosticData })),
  layoutFrames: candidates.filter(candidate => {
    const spec = specs.find(item => (item.unitId ? item.key : `page_29_block_${block(item.blockId).index}`) === candidate.spanKey);
    return Boolean(spec?.frame);
  }).map(candidate => {
    const spec = specs.find(item => (item.unitId ? item.key : `page_29_block_${block(item.blockId).index}`) === candidate.spanKey);
    return { unitKey: candidate.spanKey, pageNumber, language: 'pt-BR', data: { ...spec.frame, rotation: 0, textAlign: spec.frame.textAlign ?? 'center', lineHeight: spec.frame.lineHeight ?? 1 } };
  }),
  assetPages: [pageNumber],
  sourcePageBoxes: { [pageNumber]: templateSnapshot.sourcePageBoxes?.['28'] ?? templateSnapshot.sourcePageBoxes?.['27'] },
  diagnosticOnly: { proposalId: 'page-029-item-upgrades-2026-10-16-v2', blankedSpanKeys: candidates.filter(candidate => candidate.diagnosticRendering.startsWith('whole_unit_blank')).map(candidate => candidate.legacyBlockSpanKey) },
  verifyRenderedSnapshot: true,
};
assert.ok(snapshot.sourcePageBoxes[pageNumber], 'Missing page-size metadata in the immutable export template.');
await writeFile(resolve(snapshotDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');

const sourceDomBytes = await readFile(resolve(root, pageDomRel));
const backgroundBytes = await readFile(resolve(root, `${pageDirRel}/background.webp`));
const overlayBytes = await readFile(resolve(root, `${pageDirRel}/fidelity_overlays.json`));
const sidecarBytes = await readFile(resolve(root, isolatedStarSidecarRel));
const sourceReview = {
  status: 'official-pdf-and-viewer-source-checked; isolated-star-sidecar-applied-to-diagnostic-snapshot-only',
  page: pageNumber,
  sourcePdf: sourcePdfRel,
  sourcePdfSha256: sha256(sourcePdf),
  sourcePdfPageCount: 102,
  sourceDomSha256: sha256(sourceDomBytes),
  backgroundSha256: sha256(backgroundBytes),
  canonicalInlineElementsSha256: sha256(await readFile(resolve(root, `${pageDirRel}/inline_elements.json`))),
  isolatedPatchedInlineElementsSha256: sha256(sidecarBytes),
  fidelityOverlaysSha256: sha256(overlayBytes),
  officialSourceRaster: 'output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v1/source-official-p029.png',
  englishViewerScreenshot: 'output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v1/viewer-en-source-v1.png',
  englishExportPdf: 'output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v1/page-029-en-source-v1.pdf',
  sourceStarDetail: 'output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v1/source-star-detail.png',
  viewerStarDetail: 'output/proofs/translation-readiness-2026-10-16/p029-item-upgrades-proposal-v1/viewer-star-detail.png',
  isolatedPatchedStarPdfDetail: 'output/proofs/translation-readiness-2026-10-16/p029-damage-star-semantic-v1/pdf-star-detail-patched.png',
  starFinding: 'The official source and isolated patched PDF show the same black combat.damage-star; the current canonical Viewer shows a white star. The patch remains confined to this diagnostic snapshot.',
  payloadTranslations: existingPageTranslations.length,
  payloadLayoutFrames: existingPageFrames.length,
  payloadWrites: 0,
};

const proposal = {
  schemaVersion: 1,
  proposalId: 'page-029-item-upgrades-2026-10-16-v2',
  page: pageNumber,
  locale: 'pt-BR',
  title: 'Aprimoramentos de Item',
  sourcePdf: sourcePdfRel,
  sourcePdfSha256: sourceReview.sourcePdfSha256,
  sourceDomSha256: sourceReview.sourceDomSha256,
  backgroundSha256: sourceReview.backgroundSha256,
  canonicalInlineElementsSha256: sourceReview.canonicalInlineElementsSha256,
  isolatedPatchedInlineElementsSha256: sourceReview.isolatedPatchedInlineElementsSha256,
  fidelityOverlaysSha256: sourceReview.fidelityOverlaysSha256,
  status: 'draft_pending_viewer_editor_copyfit_pdf_human_review; isolated_star_symbol_exception',
  counts: { candidates: candidates.length, verifiedInViewer: 0, verifiedInEditor: 0, verifiedInPdf: 0, diagnosticBlankUnits: snapshot.diagnosticOnly.blankedSpanKeys.length, artworkExceptions: 0, technicalExceptions: 1 },
  sourceReview,
  candidates,
  artworkExceptions: [],
  technicalExceptions: [{
    id: 'p29-damage-star-current-viewer-render',
    sourceBlockId: 'block_22',
    sourceUnitId: 'combat.damage-star',
    bboxPt: [366.276, 760.487, 373.432, 768.614],
    classification: 'technical_symbol_color_mismatch',
    sourceAppearance: 'black',
    currentViewerAppearance: 'white',
    diagnosticRepair: 'A previously verified isolated semantic-symbol patch and donor mask are applied only to this page diagnostic snapshot.',
    diagnosticTextTreatment: 'The entire editable block_22 copy is blank in the PT-BR diagnostic snapshot because the star still renders white there. Full proposed PT-BR text remains in candidates[block_22].data and is not discarded.',
    canonicalRepairStatus: 'pending preflight hash correction and explicit integration review; canonical sidecar unchanged',
    userVisibleImpact: 'The icon within the translated armor-upgrade effect must render black to match the official source PDF.',
  }],
  unchangedSourceContent: [
    { sourceText: 'Printed values +1 / +1 on the Universal upgrade card.', reason: 'Values are language-invariant printed content and remain unchanged.' },
    { sourceText: 'Page number 29.', reason: 'The page-number treatment remains unchanged.' },
    { sourceText: 'Original card illustrations and page artwork.', reason: 'The proposal changes only editable page text and the isolated star symbol rendering.' },
  ],
  payload: { readOnlyMethod: 'GET', existingPageTranslations: existingPageTranslations.length, existingPageLayoutFrames: existingPageFrames.length, writes: 0 },
  diagnosticFailurePolicy: 'Blank only a whole failed editable unit in this isolated diagnostic snapshot. Never use English fallback or partial PT-BR in a failed unit. Preserve source and proposal text; keep original background visible. Do not persist blanks to Payload.',
};
await writeFile(resolve(root, proposalRel), JSON.stringify(proposal, null, 2) + '\n');

const md = [
  '# p.29 — proposta PT-BR “Aprimoramentos de Item” v2', '',
  '**Estado:** 21 unidades localizáveis têm proposta inicial. Copyfit V3, Viewer, Editor read-only e PDF de uma página estão pendentes. Revisão humana pendente. Nenhuma tradução ou frame foi gravado no Payload.', '',
  '## Texto proposto', '',
  '| Unidade | EN | PT-BR |', '|---|---|---|',
  ...candidates.map(candidate => `| ${candidate.sourceBlockId}${candidate.sourceUnitIds.length ? ` / ${candidate.sourceUnitIds[0]}` : ''} | ${candidate.sourceText.replace(/\|/gu, '\\|')} | ${candidate.proposalText.replace(/\|/gu, '\\|')} |`),
  '',
  '## Revisão terminológica', '',
  ...[...new Set(candidates.flatMap(candidate => candidate.pendingTerms))].map(term => `- ${term}`), '',
  '## Exceção técnica do símbolo', '',
  `A fonte oficial mostra uma estrela preta entre “single” e “Symbol”; o Viewer canônico atual a mostra branca. O sidecar semântico e a máscara já verificados foram copiados somente para o snapshot de diagnóstico v2. Nenhum arquivo canônico foi alterado. A integração da correção permanece pendente.`, '',
  '## Evidência de origem', '',
  `A página oficial, o Viewer EN e o PDF EN foram comparados em ${sourceReview.officialSourceRaster}, ${sourceReview.englishViewerScreenshot} e ${sourceReview.englishExportPdf}. Os hashes de origem e do snapshot ficam no JSON desta proposta.`, '',
  '## Copyfit e falhas', '',
  'O frame do título da página é ampliado somente no snapshot diagnóstico, centralizado sobre a linha de cards. Se qualquer outra unidade falhar no Copyfit V3, a unidade inteira ficará em branco somente nesse snapshot até uma revisão de redação ou geometria; o original e a proposta permanecerão registrados.', '',
].join('\n');
await writeFile(resolve(root, markdownRel), md);

console.log(JSON.stringify({
  status: 'p029_proposal_v2_prepared_pending_copyfit_and_readonly_validation',
  candidates: candidates.length,
  pendingReviewTerms: new Set(candidates.flatMap(candidate => candidate.pendingTerms)).size,
  payloadTranslations: existingPageTranslations.length,
  payloadFrames: existingPageFrames.length,
  snapshot: snapshotRel,
  proposal: proposalRel,
  canonicalInlineElementsUnchanged: true,
  payloadWrites: 0,
}, null, 2));
