import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageDir = path.join(root, 'apps/web/public/pages/page_056');
const domPath = path.join(pageDir, 'page_056_dom.json');
const backgroundPath = path.join(pageDir, 'background.webp');
const overlaysPath = path.join(pageDir, 'fidelity_overlays.json');
const sourcePdfPath = 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf';
const sourceProposalPath = path.join(root, 'docs/translations/proposals/page-056-general-information-proposal-2026-10-15-v2.json');
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const adapterPath = path.join(root, 'docs/translations/proposals/page-056-general-information-review-2026-10-16-v1.json');
const exceptionId = 'P056-COMBATANT-CARDS-AND-DIAGRAMS-EN-ARTWORK';
const indices = [0, 1, 2, 3, 4];

if (fs.existsSync(adapterPath)) throw new Error(`Refusing to overwrite ${adapterPath}`);
for (const file of [domPath, backgroundPath, overlaysPath, sourcePdfPath, sourceProposalPath, queuePath]) {
  if (!fs.existsSync(file)) throw new Error(`Required source artifact is missing: ${file}`);
}

const dom = JSON.parse(fs.readFileSync(domPath, 'utf8'));
const sourceProposal = JSON.parse(fs.readFileSync(sourceProposalPath, 'utf8'));
const overlays = JSON.parse(fs.readFileSync(overlaysPath, 'utf8')).overlays ?? [];
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const relativeAdapter = path.relative(root, adapterPath).replaceAll('\\', '/');
if (dom.page_number !== 56 || !Array.isArray(dom.blocks) || dom.blocks.length !== 43) {
  throw new Error('Unexpected p.56 page identity or block count.');
}
if (!sourceProposal.copyfit?.allFiveCandidateOverridesPresentExactlyOnce || sourceProposal.copyfit?.targetEnglishFallbackAbsent !== true) {
  throw new Error('The isolated p.56 General Information copyfit proof is incomplete.');
}
if ((queue.sourceProposals ?? []).includes(relativeAdapter)) throw new Error('p.56 adapter already exists in the review queue.');
if ((queue.items ?? []).some(item => item.id === exceptionId)) throw new Error('The p.56 artwork exception already exists.');

const sourceCandidates = (sourceProposal.candidates ?? []).filter(candidate => indices.includes(candidate.blockIndex));
if (sourceCandidates.length !== indices.length) throw new Error('The isolated p.56 proposal does not contain exactly the five scoped candidates.');
const database = new Database(path.join(root, 'apps/admin/apps-admin.db'), { readonly: true, fileMustExist: true });
const spanKeys = sourceCandidates.map(candidate => candidate.spanKey);
const humanRecords = database.prepare('SELECT span_key AS spanKey FROM translations WHERE language = ?')
  .all('pt-BR').filter(record => spanKeys.includes(String(record.spanKey ?? '')));
const reviewRecords = database.prepare('SELECT span_key AS spanKey FROM translation_reviews WHERE span_key LIKE ?')
  .all('page_56_%').filter(record => spanKeys.includes(String(record.spanKey ?? '')));
const openRequests = database.prepare("SELECT id FROM translation_review_requests WHERE page_number = ? AND status != 'completed'")
  .all(56);
database.close();
if (humanRecords.length) throw new Error(`Found ${humanRecords.length} human p.56 translations in the scoped family; refusing to shadow them.`);
if (reviewRecords.length) throw new Error(`Found ${reviewRecords.length} p.56 review records in the scoped family; refusing to shadow saved human review.`);
if (openRequests.length) throw new Error(`Found ${openRequests.length} open p.56 review requests; resolve their priority before staging proposals.`);

const candidates = sourceCandidates.map(source => {
  const block = dom.blocks[source.blockIndex];
  if (!block || block.id !== source.blockId || source.spanKey !== `page_56_block_${source.blockIndex}__pt-BR`) {
    throw new Error(`Source identity mismatch for p.56 block ${source.blockIndex}.`);
  }
  return {
    blockIndex: source.blockIndex,
    sourceBlockId: source.blockId,
    spanKey: source.spanKey,
    language: 'pt-BR',
    sourceText: source.sourceText,
    proposalText: source.proposalText,
    data: source.candidate.data,
    technicalStatus: 'not_recorded',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    pendingTerms: [],
  };
});

const artworkOverlays = overlays.filter(item => ['combatant-type-tags', 'intelligent-combatant-tag-card'].includes(item.region));
if (artworkOverlays.length !== 2 || artworkOverlays.some(item => item.languageInvariant !== true)) {
  throw new Error('Expected p.56 English combatant-tag artwork overlays are missing or changed.');
}
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const artworkException = {
  id: exceptionId,
  page: 56,
  spanKey: null,
  sourceBlockId: null,
  category: 'component_artwork',
  status: 'open',
  reason: 'Cartas e diagramas da página contêm rótulos em inglês incorporados à arte-fonte. Os cinco textos da família General Information podem ser propostos separadamente; estes componentes continuam preservados sem pintura PT-BR sobre o inglês.',
  diagnosticRendering: 'Arte original em inglês preservada; nenhuma tradução é publicada por esta exceção.',
  sourceText: 'Combatant type-tag cards; Cave Sickle Combatant and Initiative Card artwork; Activation Number diagrams; printed Cave Sickle labels.',
  proposedText: '',
  evidence: [
    'PDF oficial, p. 56: cards, map/activation diagrams, and printed Cave Sickle labels are part of the source artwork.',
    ...artworkOverlays.map(item => `Overlay fiel: ${item.url}, bbox ${JSON.stringify(item.bbox)}.`),
    'apps/web/public/pages/page_056/fidelity_overlays.json and background.webp.',
    'The scoped General Information candidates and copyfit proof are recorded in page-056-general-information-proposal-2026-10-15-v2.json.',
  ],
};

const adapter = {
  proposalId: 'p056-general-information-2026-10-16-v1',
  version: '1',
  title: 'Informações gerais e tipos de Combatente — p. 56',
  page: 56,
  status: 'pending_human_review',
  sourcePdf: path.basename(sourcePdfPath),
  sourceHashes: {
    sourcePdf: hash(sourcePdfPath),
    pageDom: hash(domPath),
    background: hash(backgroundPath),
    fidelityOverlays: hash(overlaysPath),
  },
  counts: {
    candidates: candidates.length,
    existingHumanTranslationsPreserved: humanRecords.length,
    priorReviewRecordsPreserved: reviewRecords.length,
    finalTranslationWrites: 0,
    openExceptions: 1,
  },
  sourceArtifacts: [
    'docs/translations/source-pages/page-056.md',
    'apps/web/public/pages/page_056/page_056_dom.json',
    'apps/web/public/pages/page_056/fidelity_overlays.json',
    'docs/translations/proposals/page-056-general-information-proposal-2026-10-15-v2.json',
  ],
  scopeLimits: [
    'Only the five-unit General Information family is in this proposal.',
    'Activation Numbers and Groups, printed artwork, Combatant Tags and other p.56 families remain outside this batch.',
    'Technical fit evidence is separate from human editorial approval.',
  ],
  copyfitEvidence: sourceProposal.copyfit,
  candidates,
};

queue.sourceProposals.push(relativeAdapter);
queue.items.push(artworkException);
queue.updated = '2026-10-16';
fs.writeFileSync(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`, 'utf8');
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  adapter: relativeAdapter,
  candidates: candidates.length,
  preservedHumanRecords: humanRecords.length,
  preservedReviewRecords: reviewRecords.length,
  openExceptions: [exceptionId],
  finalTranslationWrites: 0,
  priorProof: 'two copyfit revisions; normal Viewer and official PDF export',
  editorialStatus: 'pending_human_review',
}, null, 2));
