#!/usr/bin/env node
/** Build a read-only, source-keyed census of the IMPORTANT family. */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { analyzeSourcePages } from '../apps/web/src/editorialStructurePrevalidator.mjs';

const root = process.cwd();
const defaultOutput = resolve(root, 'docs/translations/proposals/important-family-manifest-2026-10-13.json');
const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, ...rest] = argument.replace(/^--/u, '').split('=');
  return [key, rest.join('=') || true];
}));
const outputPath = resolve(String(options.output || defaultOutput));
const apiUrl = String(options['api-url'] || process.env.VITE_PAYLOAD_API_URL || 'http://127.0.0.1:3000');
const sourcePdfPath = resolve(String(options['source-pdf'] || 'C:/Users/bruno/Middara/Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf'));
const pages = [];
const pageFiles = [];
for (let number = 1; number <= 102; number += 1) {
  const pageId = String(number).padStart(3, '0');
  const dir = resolve(root, `apps/web/public/pages/page_${pageId}`);
  const domPath = resolve(dir, `page_${pageId}_dom.json`);
  const domText = await readFile(domPath, 'utf8');
  pages.push(JSON.parse(domText));
  pageFiles.push({ page: number, path: relative(root, domPath).split(sep).join('/'), sha256: createHash('sha256').update(domText).digest('hex') });
}

const sourcePdfHash = await readFile(sourcePdfPath).then(bytes => createHash('sha256').update(bytes).digest('hex')).catch(() => null);
const structural = analyzeSourcePages(pages);
const candidates = structural.pages.flatMap(page => page.blocks
  .filter(block => block.role === 'important-callout')
  .map(block => ({ page: page.page, blockId: block.blockId, blockIndex: block.blockIndex })));
const payloadRecords = [];
let payloadRead = { status: 'unavailable', url: apiUrl, error: null };
try {
  const endpoint = new URL('/api/translations', apiUrl);
  endpoint.searchParams.set('where[language][equals]', 'pt-BR');
  endpoint.searchParams.set('limit', '5000');
  endpoint.searchParams.set('depth', '0');
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.docs) || !Number.isInteger(body.totalDocs) || body.docs.length !== body.totalDocs) {
    throw new Error('Payload returned an incomplete translation collection.');
  }
  payloadRecords.push(...body.docs);
  payloadRead = { status: 'read-only-complete', url: apiUrl, recordsRead: body.totalDocs };
} catch (error) {
  payloadRead.error = error instanceof Error ? error.message : String(error);
}

const records = [];
const nonFamilyCandidates = [];
let semanticIconCount = 0;
let standardOutlinedCount = 0;
let specialHeaderCount = 0;
let additionalSymbolCount = 0;
const sourceKey = (page, index) => `page_${page}_block_${index}`;
const compactStyle = span => Object.fromEntries([
  'font', 'size', 'color', 'flags', 'weight', 'style', 'renderTextStrokeWidthPt', 'renderTextStrokeColor',
  'textStrokeWidthPt', 'textStrokeColor', 'renderOnlyStrokePass', 'sourcePaintRole',
].filter(key => span[key] !== undefined).map(key => [key, span[key]]));

for (const candidate of candidates) {
  const page = pages[candidate.page - 1];
  const block = page.blocks.find(item => item.id === candidate.blockId);
  if (!block) throw new Error(`Missing source block p.${candidate.page}/${candidate.blockId}.`);
  const pageId = String(candidate.page).padStart(3, '0');
  const inlinePath = resolve(root, `apps/web/public/pages/page_${pageId}/inline_elements.json`);
  const inline = await readFile(inlinePath, 'utf8').then(JSON.parse).catch(() => ({ elements: [] }));
  const blockSymbols = inline.elements.filter(element => element.anchor?.blockId === block.id);
  const icon = blockSymbols.filter(element => element.symbolId === 'tag.important.icon');
  const fillLabels = block.lines.flatMap(line => line.spans).filter(span =>
    /^IMPORTANT\s*:/iu.test(span.text)
      && String(span.color).toLowerCase() === '#b91d23'
      && span.renderTextStrokeWidthPt === 2,
  );
  const specialHeader = icon.length === 1 && fillLabels.length === 0
    && /IMPORTANT POSSIBLE SPAWN RULES/iu.test(block.lines.flatMap(line => line.spans).map(span => span.text).join(' '));
  if (fillLabels.length !== 1 && !specialHeader) {
    nonFamilyCandidates.push({ page: candidate.page, blockId: candidate.blockId, blockIndex: candidate.blockIndex,
      detectorText: structural.pages[candidate.page - 1].blocks.find(item => item.blockId === block.id)?.text ?? '' });
    continue;
  }

  semanticIconCount += icon.length;
  standardOutlinedCount += fillLabels.length;
  specialHeaderCount += Number(specialHeader);
  additionalSymbolCount += blockSymbols.filter(element => element.symbolId !== 'tag.important.icon').length;
  const lineSegments = [];
  const completeSourceLines = [];
  for (const line of block.lines) {
    const segments = [];
    for (const [spanIndex, span] of line.spans.entries()) {
      if (span.renderOnlyStrokePass) continue;
      const anchored = blockSymbols.filter(element => element.anchor?.lineId === line.id
        && (element.anchor.spanIndex ?? element.anchor.spanStartIndex) === spanIndex);
      for (const element of anchored.filter(item => item.anchor.side === 'before')) {
        segments.push({ kind: 'symbol', text: '\uFFFC', symbolId: element.symbolId, anchor: element.anchor, metrics: element.metrics ?? null });
      }
      const replacement = anchored.find(element => element.anchor.side === 'replace');
      if (replacement) {
        segments.push({ kind: 'symbol', text: '\uFFFC', symbolId: replacement.symbolId,
          anchor: replacement.anchor, metrics: replacement.metrics ?? null });
      } else if (String(span.text ?? '').length) {
        segments.push({ kind: 'text', text: span.displayOverride ?? span.text, sourceStyle: compactStyle(span),
          sourceSpanRef: `${line.id}:${spanIndex}` });
      }
      for (const element of anchored.filter(item => item.anchor.side === 'after')) {
        segments.push({ kind: 'symbol', text: '\uFFFC', symbolId: element.symbolId, anchor: element.anchor, metrics: element.metrics ?? null });
      }
    }
    lineSegments.push({ lineId: line.id, bbox: line.bbox, segments });
    completeSourceLines.push(segments.map(segment => segment.kind === 'symbol'
      ? `[[symbol:${segment.symbolId}]]` : segment.text).join(''));
  }

  const directKeys = [
    `${sourceKey(candidate.page, candidate.blockIndex)}__pt-BR`,
    sourceKey(candidate.page, candidate.blockIndex),
  ];
  const existing = payloadRecords.filter(document => directKeys.includes(document.spanKey));
  const sourceHash = pageFiles[candidate.page - 1].sha256;
  const sourceText = completeSourceLines.join('\n');
  const sourceUnits = Array.isArray(block.typographicSpanUnits) ? block.typographicSpanUnits : [];
  records.push({
    occurrenceId: `p${String(candidate.page).padStart(3, '0')}-${block.id}`,
    page: candidate.page,
    source: {
      blockIds: [block.id],
      blockIndex: candidate.blockIndex,
      editorialKey: sourceKey(candidate.page, candidate.blockIndex),
      relatedSourceUnitIds: sourceUnits.map(unit => unit.id ?? unit.unitId ?? null).filter(Boolean),
      lineIds: block.lines.map(line => line.id),
      text: sourceText,
      lines: lineSegments,
      bboxPt: block.bbox,
      blockSha256: createHash('sha256').update(JSON.stringify(block)).digest('hex'),
      pageSidecarSha256: sourceHash,
    },
    classification: specialHeader ? 'special-important-heading' : 'outlined-important-callout',
    typography: {
      labelRuns: fillLabels.map(compactStyle),
      allSourceRuns: lineSegments.flatMap(line => line.segments)
        .filter(segment => segment.kind === 'text')
        .map(segment => ({ text: segment.text, ...segment.sourceStyle, sourceSpanRef: segment.sourceSpanRef })),
    },
    symbols: blockSymbols.map(element => ({
      symbolId: element.symbolId,
      sourceRendering: element.sourceRendering ?? null,
      anchor: element.anchor,
      bboxPt: element.bbox,
      metrics: element.metrics ?? null,
      renderVariant: element.metrics?.renderVariant ?? null,
    })),
    existingPT: existing.map(document => ({
      spanKey: document.spanKey,
      language: document.language,
      updatedAt: document.updatedAt ?? null,
      data: document.data,
      status: 'persisted-human-or-existing-override-review-required',
    })),
    proposal: null,
    processing: {
      status: existing.length ? 'existing-override-protected' : 'inventory-only',
      fit: 'not-measured-for-proposal',
      editorialReview: 'pending',
      terminology: 'not-yet-audited',
      blockers: specialHeader ? ['Estrutura especial sem contrato de callout padrão; validar antes de traduzir.'] : [],
    },
  });
}

if (semanticIconCount !== 62 || standardOutlinedCount !== 61 || specialHeaderCount !== 1 || nonFamilyCandidates.length !== 3) {
  throw new Error(`Unexpected census reconciliation: tag icons=${semanticIconCount}, outlined=${standardOutlinedCount}, special=${specialHeaderCount}, non-family=${nonFamilyCandidates.length}.`);
}
const manifest = {
  schemaVersion: 1,
  manifestId: 'middara-important-family-2026-10-13',
  generatedAt: new Date().toISOString(),
  status: 'inventory-and-representative-validation-in-progress',
  scope: 'All 102 Rulebook 1.2 pages; family IMPORTANT only. No Payload writes, source JSON/sidecar/frame edits, or canonical translation changes.',
  source: {
    pdfPath: relative(root, sourcePdfPath).split(sep).join('/'),
    pdfSha256: sourcePdfHash,
    pageSidecars: pageFiles,
  },
  persistence: {
    proposalStore: 'versioned JSON manifest; import/review integration not present in the current Admin workflow',
    payloadRead,
    payloadWrite: false,
    existingPTOverrides: records.reduce((sum, record) => sum + record.existingPT.length, 0),
  },
  reconciliation: {
    pagesRead: pages.length,
    structuralPrevalidatorCandidates: candidates.length,
    semanticImportantIcons: semanticIconCount,
    standardOutlinedImportantCallouts: standardOutlinedCount,
    specialImportantHeading: specialHeaderCount,
    nonFamilyFalsePositives: nonFamilyCandidates,
    nonFamilyFalsePositiveCount: nonFamilyCandidates.length,
    additionalInlineSymbolsAcrossCallouts: additionalSymbolCount,
    historicalCountCrosswalk: '65 structural candidates = 62 semantic tag.important.icon occurrences (61 standard outlined callouts + p.82 special IMPORTANT POSSIBLE SPAWN RULES heading) + 3 non-family false positives.',
  },
  processing: {
    completedProposalCount: 0,
    readyForEditorialReview: 0,
    blockedOnRepresentativeGate: true,
    batches: [],
  },
  occurrences: records,
};
try {
  const previous = JSON.parse(await readFile(outputPath, 'utf8'));
  if (previous.manifestId === manifest.manifestId) {
    for (const current of manifest.occurrences) {
      const saved = previous.occurrences?.find(item => item.occurrenceId === current.occurrenceId);
      if (!saved) continue;
      if (saved.source?.blockSha256 !== current.source.blockSha256
        || saved.source?.pageSidecarSha256 !== current.source.pageSidecarSha256) {
        throw new Error(`Source changed for ${current.occurrenceId}; refusing to refresh and overwrite its saved proposal.`);
      }
      current.proposal = saved.proposal ?? current.proposal;
      current.processing = saved.processing ?? current.processing;
      const currentKeys = new Set(current.existingPT.map(item => item.spanKey));
      current.existingPT.push(...(saved.existingPT ?? []).filter(item => !currentKeys.has(item.spanKey)));
      if (saved.proposal && current.existingPT.length) {
        current.processing.blockers = [...new Set([...(current.processing.blockers ?? []),
          'Há override PT-BR persistido nesta identidade; revisar conflito antes de usar a proposta.'])];
        current.processing.status = 'existing-override-protected';
      }
    }
    manifest.status = previous.status ?? manifest.status;
    manifest.processing = previous.processing ?? manifest.processing;
    manifest.processing.completedProposalCount = manifest.occurrences.filter(item => item.proposal?.targetText).length;
    manifest.persistence.existingPTOverrides = manifest.occurrences.reduce((sum, item) => sum + item.existingPT.length, 0);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, summary: manifest.reconciliation, payloadRead, existingPTOverrides: manifest.persistence.existingPTOverrides }, null, 2));
