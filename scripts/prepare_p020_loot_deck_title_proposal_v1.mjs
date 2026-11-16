#!/usr/bin/env node
/** Prepare a recoverable, isolated PT-BR proposal for the p.20 title. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const page = 20;
const sourceDir = resolve(root, 'apps/web/public/pages/page_020');
const proofDir = resolve(root, 'output/proofs/translation-readiness-2026-10-16/p020-loot-deck-title-v1');
const snapshotDir = join(proofDir, 'snapshot');
const proposalPath = resolve(root, 'docs/translations/proposals/page-020-loot-deck-title-2026-10-16-v1.json');
const markdownPath = resolve(root, 'docs/translations/proposals/page-020-loot-deck-title-2026-10-16-v1.md');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

for (const path of [proofDir, proposalPath, markdownPath]) {
  try { await readFile(path); throw new Error(`Refusing to overwrite existing artifact: ${path}`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const domBytes = await readFile(join(sourceDir, 'page_020_dom.json'));
const dom = JSON.parse(domBytes);
const sourceBlockId = 'block_1117';
const sourceBlock = dom.blocks.find(block => block.id === sourceBlockId);
assert.ok(sourceBlock, `Missing source block ${sourceBlockId}`);
const blockIndex = dom.blocks.indexOf(sourceBlock);
const spanKey = `page_${page}_block_${blockIndex}__pt-BR`;
const sourceText = sourceBlock.lines.flatMap(line => line.spans.map(span => span.text)).join('').replace(/\s+/gu, ' ').trim();
assert.equal(sourceText, 'Combatant Loot Deck Setup');

const apiUrl = new URL('/api/translations', process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000');
apiUrl.searchParams.set('limit', '5000');
const apiResponse = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
assert.ok(apiResponse.ok, `Payload GET failed: ${apiResponse.status}`);
const payload = await apiResponse.json();
const pageRecords = (payload.docs ?? []).filter(record => String(record.spanKey ?? '').startsWith(`page_${page}_`) && record.language === 'pt-BR');
assert.equal(pageRecords.filter(record => record.spanKey === spanKey).length, 0, 'A human record already owns the title key; do not overwrite it.');

// The localized title is longer than the English source. Its isolated PT-BR
// frame uses the full existing banner width and keeps the original center and baseline.
const title = 'Preparação do Baralho de Saque dos Combatentes';
const data = {
  schemaVersion: 2,
  segments: [{ text: title, font: 'Cinzel-Regular', size: 18, color: '#ffffff', weight: 700, style: 'normal', disableLigatures: true }],
  textAlign: 'center', lineHeight: 1.1, lineHeightMode: 'source', managedSourceSymbols: [],
};
const candidate = {
  blockIndex, sourceBlockId, sourceText, proposalText: title, proposalMarkup: title,
  spanKey, spanKeys: [spanKey], language: 'pt-BR', data, diagnosticData: structuredClone(data),
  status: 'draft_pending_copyfit_review_and_human_review',
  technicalStatus: 'pending_real_viewer_editor_and_pdf_review', editorialStatus: 'pending_human_review',
  diagnosticRendering: 'proposal', sourceBboxes: sourceBlock.lines.map(line => line.bbox), sourceLineCount: sourceBlock.lines.length,
  pendingTerms: ['Combatant Loot Deck → Baralho de Saque dos Combatentes; composto não cadastrado integralmente no glossário; revisar contra “Cartas de Saque de Combatente” da p.4.'],
  notes: ['Setup → Preparação and Loot → Saque follow the official glossary. The isolated PT-BR frame is centered on the decorative banner and uses its available width; it is a locale-specific reframe, not an expansion preserving the source text center or baseline. Typeface, size, color, and weight match the source.'],
};

const snapshotDom = structuredClone(dom);
const snapshot = {
  translations: [...pageRecords, { spanKey, language: 'pt-BR', data }],
  layoutFrames: [{
    unitKey: `page_${page}_block_${blockIndex}`, pageNumber: page, language: 'pt-BR',
    data: { x: 110.173, y: sourceBlock.bbox[1], width: 600, height: sourceBlock.bbox[3] - sourceBlock.bbox[1], rotation: 0, textAlign: 'center', lineHeight: 1.1 },
  }],
  symbolAliasSettings: [], assetPages: [page], page, patched: false, verifyRenderedSnapshot: true,
  sourcePageBoxes: { [page]: { mediaBox: [0, 0, dom.width, dom.height], cropBox: [0, 0, dom.width, dom.height], bleedBox: [0, 0, dom.width, dom.height], trimBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173], artBox: [14.1732, 14.173, dom.width - 14.173, dom.height - 14.173] } },
};

await mkdir(join(snapshotDir, 'pages'), { recursive: true });
await cp(sourceDir, join(snapshotDir, 'pages/page_020'), { recursive: true, errorOnExist: true });
await writeFile(join(snapshotDir, 'pages/page_020/page_020_dom.json'), `${JSON.stringify(snapshotDom, null, 2)}\n`, { flag: 'w' });
const snapshotPath = join(snapshotDir, 'snapshot.json');
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });

const sourceHashes = {};
for (const name of (await readdir(sourceDir)).sort()) sourceHashes[name] = sha256(await readFile(join(sourceDir, name)));
sourceHashes.snapshotSha256 = sha256(await readFile(snapshotPath));
sourceHashes.payloadPageRecordsBefore = pageRecords.length;
sourceHashes.payloadWrites = 0;
await writeFile(join(proofDir, 'source-hashes.json'), `${JSON.stringify(sourceHashes, null, 2)}\n`, { flag: 'wx' });

const proposal = {
  proposalId: 'page-020-loot-deck-title-2026-10-16-v1',
  status: 'one_editable_unit_proposed_copyfit_review_pending_art_text_exception_open',
  page, sourcePdf: 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf',
  counts: { editableTargets: 1, proposedInDiagnosticViewer: 1, blankBlockedUnits: 0, verifiedInViewer: 0, verifiedInEditor: 0, verifiedInPdf: 0, artworkExceptionGroups: 1 },
  candidates: [candidate],
  artworkExceptionGroups: [{
    id: 'page_20_loot_table_artwork_text_pt-BR',
    sourceBlocks: dom.blocks.filter(block => block.hiddenFromPage || block.lines.some(line => line.rasterizedDuplicate)).map(block => block.id),
    sourceText: 'Four Loot Level rows (MUNDANE, COMMON, UNCOMMON, RARE), card headings and card-face rules (ITEM / MONSTER / UNIQUE; Item Loot; Roll 2 WHITE; Accessory; Armor; Relic; Core; Weapon), plus numeric loot values and counts are printed in the page artwork.',
    proposedText: 'NÍVEL DE SAQUE: MUNDANO / COMUM / INCOMUM / RARO; ITEM / MONSTRO / ÚNICO; Saque de Item; Saque de Monstro; Saque Único; Role 2 BRANCOS [pictograma de dado branco]; Acessório; Armadura; Relíquia; Núcleo; Arma. Numeric values, quantities, and serial numbers remain unchanged.',
    category: 'artwork_localization_copyfit', status: 'open',
    reason: 'The current background image contains the four level labels, card captions and item-table text. Existing duplicate DOM title/value lines are suppressed from normal rendering, but no Portuguese artwork replacement exists. Preserve the source art until a page-faithful localized overlay or rebuilt asset is validated.',
    evidence: ['apps/web/public/pages/page_020/background.webp', 'docs/project-progress/2026-10-02-page20-loot-title-tracer.md', 'docs/project-progress/2026-10-04-page20-candidates-and-folio-outline.md'],
  }],
  payloadPageRecordsBefore: pageRecords.length, payloadWrites: 0, humanApproved: false,
  sourceScope: { canonicalInputsModified: false, translationRecordKeysPreserved: true, pageBlockIds: [sourceBlockId] },
  copyfit: { engine: 'PageRenderer live typography and Copyfit V3 layout frame', status: 'pending_export_and_viewer_inspection', diagnosticFailurePolicy: 'If the title fails its isolated 600 pt frame, blank only its diagnostic PT-BR copy and preserve source/proposal text and keys.' },
};
await mkdir(dirname(proposalPath), { recursive: true });
await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' });
const markdown = `# p.20 — proposta PT-BR do título v1\n\n**Estado:** um bloco editável traduzido; revisão visual no Viewer/Editor/PDF pendente. A imagem de fundo contém texto de tabelas e cartas em inglês, mantido como exceção de arte aberta. Payload writes = 0.\n\n## Texto proposto\n\n**EN:** ${sourceText}\n\n**PT-BR:** ${title}\n\n**Chave:** \`${spanKey}\`. O frame PT isolado mede 600 pt, centraliza o título no banner e difere do frame fonte (615 pt, alinhado à esquerda); a inspeção mediu deslocamentos de -5,684 pt no centro e -0,870 pt na baseline. Tipografia fonte preservada.\n\n## Exceção de texto na arte\n\nRótulos de níveis, títulos de cartas e tabela de itens seguem impressos no fundo em inglês. As traduções propostas e a classificação estão no JSON. A imagem-fonte permanece preservada até validar uma solução visual que substitua esse texto sem apagar elementos da arte.\n\n## Rastreabilidade\n\n- Snapshot: \`output/proofs/translation-readiness-2026-10-16/p020-loot-deck-title-v1/snapshot/snapshot.json\`.\n- Hashes e contagem de registros Payload antes: \`output/proofs/translation-readiness-2026-10-16/p020-loot-deck-title-v1/source-hashes.json\`.\n- Nenhum registro PT-BR existente na p.20 foi encontrado; nenhuma gravação ocorreu.\n`;
await writeFile(markdownPath, markdown, { flag: 'wx' });
console.log(JSON.stringify({ proposalId: proposal.proposalId, spanKey, payloadPageRecordsBefore: pageRecords.length, snapshotSha256: sourceHashes.snapshotSha256, proposalPath, markdownPath, snapshotPath, payloadWrites: 0 }, null, 2));
