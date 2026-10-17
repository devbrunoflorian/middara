import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageDir = path.join(root, 'apps/web/public/pages/page_057');
const domPath = path.join(pageDir, 'page_057_dom.json');
const backgroundPath = path.join(pageDir, 'background.webp');
const inlinePath = path.join(pageDir, 'inline_elements.json');
const overlaysPath = path.join(pageDir, 'fidelity_overlays.json');
const sourcePdfPath = 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const adapterPath = path.join(root, 'docs/translations/proposals/page-057-same-name-combatants-review-2026-10-16-v1.json');
const relativeAdapter = path.relative(root, adapterPath).replaceAll('\\', '/');

if (fs.existsSync(adapterPath)) throw new Error(`Refusing to overwrite ${adapterPath}`);
for (const file of [domPath, backgroundPath, inlinePath, overlaysPath, sourcePdfPath, queuePath]) {
  if (!fs.existsSync(file)) throw new Error(`Required source artifact is missing: ${file}`);
}

const dom = JSON.parse(fs.readFileSync(domPath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
if (dom.page_number !== 57 || !Array.isArray(dom.blocks) || dom.blocks.length !== 39) throw new Error('Unexpected p.57 page identity or block count.');
if ((queue.sourceProposals ?? []).includes(relativeAdapter)) throw new Error('p.57 adapter already exists in the review queue.');

const headingBlockIndex = 19;
const headingBlock = dom.blocks[headingBlockIndex];
const headingUnit = headingBlock?.typographicUnits?.find(unit => unit.id === 'p57-block-64-paragraph-2');
if (!headingUnit) throw new Error('The p.57 heading unit was not found in block_64.');
const blockIndexes = [20, 21, 22];
const humanKeys = [
  'page_57_unit_p57-block-64-paragraph-2__pt-BR',
  ...blockIndexes.map(index => `page_57_block_${index}__pt-BR`),
];

const database = new Database(path.join(root, 'apps/admin/apps-admin.db'), { readonly: true, fileMustExist: true });
const humanRecords = database.prepare('SELECT span_key AS spanKey FROM translations WHERE language = ?')
  .all('pt-BR').filter(record => String(record.spanKey ?? '').startsWith('page_57_'));
const conflictingHumanRecords = humanRecords.filter(record => humanKeys.includes(String(record.spanKey ?? '')));
const allPageReviewRecords = database.prepare('SELECT span_key AS spanKey FROM translation_reviews WHERE span_key LIKE ?')
  .all('page_57_%');
const conflictingReviewRecords = allPageReviewRecords.filter(record => humanKeys.includes(String(record.spanKey ?? '')));
const openRequests = database.prepare("SELECT id FROM translation_review_requests WHERE page_number = ? AND status != 'completed'")
  .all(57);
database.close();
if (conflictingHumanRecords.length) throw new Error(`Found ${conflictingHumanRecords.length} human translations in the proposed p.57 family; refusing to shadow them.`);
if (conflictingReviewRecords.length) throw new Error(`Found ${conflictingReviewRecords.length} existing p.57 review records in the proposed family; preserve their priority.`);
if (openRequests.length) throw new Error(`Found ${openRequests.length} open p.57 review requests; resolve their priority before staging proposals.`);

const palette = {
  body10: { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' },
  bold9: { font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal' },
  heading12: { font: 'Cinzel-Regular', size: 12, color: '#231f20', weight: 400, style: 'normal' },
};
const text = (value, style = 'body10') => ({ text: value, ...palette[style] });
const sourceTextForBlock = block => (block?.lines ?? []).flatMap(line => line.spans ?? []).map(span => span.text ?? '').join('').replace(/\s+/gu, ' ').trim();
const sourceTextForUnit = (block, unit) => unit.field.lineIds
  .map(lineId => block.lines.find(line => line.id === lineId))
  .filter(Boolean)
  .flatMap(line => line.spans ?? [])
  .map(span => span.text ?? '')
  .join('')
  .replace(/\s+/gu, ' ')
  .trim();
const candidates = [];
const addCandidate = ({ blockIndex, spanKey, sourceText, proposalText, bbox, segments, lineHeight = 1.1, lineHeightMode = 'custom' }) => {
  const block = dom.blocks[blockIndex];
  if (!block) throw new Error(`Missing p.57 block index ${blockIndex}.`);
  candidates.push({
    blockIndex,
    sourceBlockId: block.id,
    spanKey,
    language: 'pt-BR',
    sourceText,
    proposalText,
    data: {
      schemaVersion: 2,
      spanKey,
      bbox,
      textAlign: 'left',
      lineHeight,
      lineHeightMode,
      segments: segments.map(segment => ({ ...segment, disableLigatures: true })),
      managedSourceSymbols: [],
    },
    technicalStatus: 'not_recorded',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    pendingTerms: [],
  });
};

const headingKey = 'page_57_unit_p57-block-64-paragraph-2__pt-BR';
addCandidate({
  blockIndex: headingBlockIndex,
  spanKey: headingKey,
  sourceText: sourceTextForUnit(headingBlock, headingUnit),
  proposalText: 'Combatentes com o Mesmo Nome',
  bbox: headingUnit.field.bbox,
  segments: [text('Combatentes com o Mesmo Nome', 'heading12')],
  lineHeight: headingUnit.field.frame.lineHeight ?? 1.1,
  lineHeightMode: 'custom',
});

const block66 = dom.blocks[20];
const source66 = sourceTextForBlock(block66);
const target66 = 'Muitos Combatentes têm mais de 1 Miniatura com o mesmo nome; elas compartilham 1 Carta de Iniciativa e 1 Carta de Combatente.';
addCandidate({
  blockIndex: 20,
  spanKey: 'page_57_block_20__pt-BR',
  sourceText: source66,
  proposalText: target66,
  bbox: block66.bbox,
  segments: [
    text('Muitos Combatentes têm mais de '), text('1', 'bold9'),
    text(' Miniatura com o mesmo nome; elas compartilham '), text('1', 'bold9'),
    text(' Carta de Iniciativa e '), text('1', 'bold9'), text(' Carta de Combatente.'),
  ],
});

const block67 = dom.blocks[21];
addCandidate({
  blockIndex: 21,
  spanKey: 'page_57_block_21__pt-BR',
  sourceText: sourceTextForBlock(block67),
  proposalText: 'Embora usem a mesma Carta de Iniciativa, cada Combatente é distinto dos demais de mesmo nome. Cada um é ativado separadamente, e seu Dano e seus Efeitos também são registrados separadamente. As regras tratam cada Miniatura como um indivíduo.',
  bbox: block67.bbox,
  segments: [text('Embora usem a mesma Carta de Iniciativa, cada Combatente é distinto dos demais de mesmo nome. Cada um é ativado separadamente, e seu Dano e seus Efeitos também são registrados separadamente. As regras tratam cada Miniatura como um indivíduo.')],
});

const block68 = dom.blocks[22];
addCandidate({
  blockIndex: 22,
  spanKey: 'page_57_block_22__pt-BR',
  sourceText: sourceTextForBlock(block68),
  proposalText: 'Quando Combatentes de mesmo nome realizam um turno, considera-se que cada um tem seu próprio turno. Cada um passa pelas Fases do Turno separadamente; a única diferença é que compartilham uma Carta de Combatente e, por isso, realizam Ações semelhantes.',
  bbox: block68.bbox,
  segments: [text('Quando Combatentes de mesmo nome realizam um turno, considera-se que cada um tem seu próprio turno. Cada um passa pelas Fases do Turno separadamente; a única diferença é que compartilham uma Carta de Combatente e, por isso, realizam Ações semelhantes.')],
});

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const adapter = {
  proposalId: 'p057-same-name-combatants-2026-10-16-v1',
  version: '1',
  title: 'Combatentes com o Mesmo Nome — p. 57',
  page: 57,
  status: 'pending_human_review',
  sourcePdf: path.basename(sourcePdfPath),
  sourceHashes: {
    sourcePdf: hash(sourcePdfPath),
    pageDom: hash(domPath),
    background: hash(backgroundPath),
    inlineElements: hash(inlinePath),
    fidelityOverlays: hash(overlaysPath),
  },
  counts: {
    candidates: candidates.length,
    existingHumanTranslationsPreserved: humanRecords.length,
    priorReviewRecordsPreserved: allPageReviewRecords.length,
    finalTranslationWrites: 0,
    openExceptions: 0,
  },
  sourceArtifacts: [
    'docs/translations/source-pages/page-057.md',
    'apps/web/public/pages/page_057/page_057_dom.json',
    'apps/web/public/pages/page_057/inline_elements.json',
    'apps/web/public/pages/page_057/fidelity_overlays.json',
  ],
  scopeLimits: [
    'This proposal covers only the heading and three paragraphs in the Multiple Combatants; Same Name family.',
    'Eight human p.57 translations in the loot sections remain untouched.',
    'The Shared Icons, Symbol Abilities, Combatant Loot and other page families remain outside this batch.',
  ],
  candidates,
};

queue.sourceProposals.push(relativeAdapter);
queue.updated = '2026-10-16';
fs.writeFileSync(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`, 'utf8');
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  adapter: relativeAdapter,
  candidates: candidates.length,
  existingHumanPageRecordsPreserved: humanRecords.length,
  preservedReviewRecords: allPageReviewRecords.length,
  conflictingHumanRecords: conflictingHumanRecords.length,
  finalTranslationWrites: 0,
  editorialStatus: 'pending_human_review',
}, null, 2));
