#!/usr/bin/env node
/** Static safety checks for resumable IMPORTANT proposal batches. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve(process.argv[2] || 'docs/translations/proposals/important-family-manifest-2026-10-13.json');
const manifest = JSON.parse(await readFile(path, 'utf8'));
const errors = [];
const duplicateIds = manifest.occurrences.map(item => item.occurrenceId)
  .filter((id, index, ids) => ids.indexOf(id) !== index);
for (const id of duplicateIds) errors.push(`duplicate occurrence id: ${id}`);
let draftCount = 0;
let segmentValidatedCount = 0;
let symbolValidatedCount = 0;
let richSpanValidatedCount = 0;
const statuses = { technical: {}, editorial: {} };

for (const occurrence of manifest.occurrences) {
  const expectedIconCount = occurrence.symbols.filter(symbol => symbol.symbolId === 'tag.important.icon').length;
  if (expectedIconCount !== 1) errors.push(`${occurrence.occurrenceId}: expected exactly one source IMPORTANT symbol, got ${expectedIconCount}`);
  const proposal = occurrence.proposal;
  if (!proposal?.targetText) continue;
  draftCount += 1;
  const review = proposal.reviewStates ?? occurrence.reviewStates;
  if (!review?.technical?.status || !review?.editorial?.status) errors.push(`${occurrence.occurrenceId}: missing separated technical/editorial states`);
  if (review?.editorial?.status === 'APROVADO' && review.editorial.approved !== true) errors.push(`${occurrence.occurrenceId}: approved state lacks explicit human acceptance`);
  statuses.technical[review?.technical?.status ?? 'MISSING'] = (statuses.technical[review?.technical?.status ?? 'MISSING'] ?? 0) + 1;
  statuses.editorial[review?.editorial?.status ?? 'MISSING'] = (statuses.editorial[review?.editorial?.status ?? 'MISSING'] ?? 0) + 1;
  if (occurrence.existingPT?.length) errors.push(`${occurrence.occurrenceId}: proposal collides with a pre-existing PT-BR record`);
  if (proposal.status !== 'existing-experimental-proof' && proposal.sourceBlockSha256 !== occurrence.source.blockSha256) errors.push(`${occurrence.occurrenceId}: proposal source-block hash mismatch`);
  if (!Array.isArray(proposal.segments)) continue;
  const renderedText = proposal.segments.filter(segment => !segment.symbolId).map(segment => String(segment.text ?? '')).join('');
  if (renderedText !== proposal.targetPlainText) errors.push(`${occurrence.occurrenceId}: segment text does not equal targetPlainText`);
  else segmentValidatedCount += 1;
  const actualSymbols = proposal.segments.filter(segment => segment.symbolId).map(segment => segment.symbolId).sort();
  const declaredSymbols = [...(proposal.symbolIds ?? [])].sort();
  if (JSON.stringify(actualSymbols) !== JSON.stringify(declaredSymbols)) errors.push(`${occurrence.occurrenceId}: missing, duplicated, or undeclared proposal symbol`);
  else symbolValidatedCount += 1;
  for (const span of proposal.explicitRichSpans ?? []) {
    const slice = proposal.targetPlainText.slice(span.start, span.end);
    if (span.start < 0 || span.end > proposal.targetPlainText.length || slice !== span.targetText) {
      errors.push(`${occurrence.occurrenceId}: rich span ${span.id} resolves to ${JSON.stringify(slice)}, expected ${JSON.stringify(span.targetText)}`);
    } else richSpanValidatedCount += 1;
  }
  const forbiddenFallback = proposal.containsFallbackEnglish === true || proposal.status?.includes('fallback');
  if (forbiddenFallback) errors.push(`${occurrence.occurrenceId}: fallback English is presented as proposal output`);
}

manifest.processing.proposalDraftCount = draftCount;
manifest.processing.completedProposalCount = 0;
manifest.processing.editoriallyApprovedProposalCount = 0;
const report = { occurrenceCount: manifest.occurrences.length, draftCount, segmentValidatedCount, symbolValidatedCount, richSpanValidatedCount, statuses, errors };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
