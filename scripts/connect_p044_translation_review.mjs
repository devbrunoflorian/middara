import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'docs/translations/proposals/page-044-damage-redistribution-example-proposal-2026-10-15-v2.json');
const outputPath = path.join(root, 'docs/translations/proposals/page-044-damage-redistribution-review-2026-10-16-v1.json');
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const progressPath = path.join(root, 'docs/translations/localization-goal-progress.md');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const progress = fs.readFileSync(progressPath, 'utf8');

const sourceTextByUnit = {
  'p44-damage-redistribution-body': source.sourceText.body,
  'p44-damage-redistribution-example': source.sourceText.example,
};
const unitIds = new Set(Object.keys(sourceTextByUnit));
if (source.page !== 44 || !Array.isArray(source.candidates) || source.candidates.length !== 2) {
  throw new Error('Expected the verified two-unit p.44 v2 proposal.');
}

const candidates = source.candidates.map(candidate => {
  const unitId = candidate.spanKey.match(/^page_44_unit_(.+)__pt-BR$/u)?.[1];
  if (!unitId || !unitIds.has(unitId) || !candidate.data?.segments?.length) {
    throw new Error(`Unexpected p.44 review candidate: ${candidate.spanKey}`);
  }
  return {
    blockIndex: null,
    sourceBlockId: null,
    sourceUnitId: unitId,
    sourceText: sourceTextByUnit[unitId],
    spanKey: candidate.spanKey,
    language: candidate.language ?? 'pt-BR',
    proposalText: source.proposalText[unitId.endsWith('-body') ? 'body' : 'example'],
    proposalMarkup: source.proposalText[unitId.endsWith('-body') ? 'body' : 'example'],
    data: candidate.data,
    technicalStatus: 'verified_viewer_and_pdf_proof',
    editorialStatus: 'pending_human_review',
    diagnosticRendering: 'proposal',
    pendingTerms: source.terminologyPendingHumanReview,
  };
});

const adapter = {
  proposalId: 'page-044-damage-redistribution-review',
  version: '1',
  title: 'Redistribuição de Dano — p.44',
  page: 44,
  status: 'partial_page_proposal_pending_human_review',
  sourceProposal: path.relative(root, sourcePath).replaceAll('\\', '/'),
  sourceHashes: source.sourceHashes,
  counts: { candidates: candidates.length, existingHumanTranslationsPreserved: 0, blockedUnitsIncluded: 0 },
  candidateSourceArtifacts: [
    path.relative(root, sourcePath).replaceAll('\\', '/'),
    'docs/project-progress/2026-10-15-localization-checkpoint-p041-p046.md',
    'output/proofs/translation-readiness-2026-10-15/p044-damage-redistribution-v2/page-044-pt-BR-viewer-v2.png',
    'output/proofs/translation-readiness-2026-10-15/p044-damage-redistribution-v2/page-044-pt-BR-pdf-raster-v2.png',
    'output/proofs/translation-readiness-2026-10-15/p044-damage-redistribution-v2/page-044-pt-BR-proposal-v2.pdf',
  ],
  candidates,
};

fs.writeFileSync(outputPath, `${JSON.stringify(adapter, null, 2)}\n`, 'utf8');
queue.sourceProposals ??= [];
const relativeAdapter = path.relative(root, outputPath).replaceAll('\\', '/');
if (!queue.sourceProposals.includes(relativeAdapter)) queue.sourceProposals.push(relativeAdapter);
queue.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');

const paragraph = '- **p.44:** duas unidades da proposta v2 de Redistribuição de Dano e exemplo agora aparecem na central. A prova anterior conferiu Viewer, print e raster do PDF isolado, sem colisão visível e com uma página; a proposta permanece pendente de revisão editorial humana para termos como `Damage`, `HEAL`, `HP` e nomes de Item. Não há tradução humana preexistente nem alteração na coleção final. Ver [adapter da central v1](proposals/page-044-damage-redistribution-review-2026-10-16-v1.json), [proposta isolada v2](proposals/page-044-damage-redistribution-example-proposal-2026-10-15-v2.json) e [checkpoint p.41–46](../project-progress/2026-10-15-localization-checkpoint-p041-p046.md).';
if (!progress.includes('**p.44:** duas unidades da proposta v2 de Redistribuição')) {
  const anchor = '- O catálogo carregado pela central de revisão agora mostra **395 candidatos e 286 exceções**';
  if (!progress.includes(anchor)) throw new Error('Could not find the progress summary anchor.');
  fs.writeFileSync(progressPath, progress.replace(anchor, `${paragraph}\n${anchor.replace('395 candidatos', '397 candidatos')}`), 'utf8');
}

console.log(`Connected ${candidates.length} p.44 units to the translation review queue.`);
