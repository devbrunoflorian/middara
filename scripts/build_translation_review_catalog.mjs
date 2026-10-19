import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queuePath = path.join(root, 'docs/translations/localization-exceptions.json');
const glossaryPath = path.join(root, 'docs/translations/glossary.md');
const defaultOutputPath = path.join(root, 'apps/web/public/translation-review/catalog.json');
const outputPath = process.argv[2] ? path.resolve(root, process.argv[2]) : defaultOutputPath;
if (!outputPath.startsWith(`${root}${path.sep}`)) throw new Error('Catalog output must stay inside the repository.');
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const glossaryText = fs.readFileSync(glossaryPath, 'utf8');
const officialGlossaryTerms = glossaryText.split(/\r?\n/u).flatMap(line => {
  const match = line.match(/^\|\s*\*\*(.+?)\*\*(?:\s*\*[^|]*\*)?\s*\|\s*(.*?)\s*\|\s*$/u);
  if (!match) return [];
  const sourceTerm = match[1].replace(/\*\*/gu, '').trim();
  const targetTerms = match[2].replace(/\*\*/gu, '').trim().split(/\s*\/\s*/u).map(term => term.trim()).filter(Boolean);
  return sourceTerm && targetTerms.length ? [{ sourceTerm, targetTerms }] : [];
});
const exceptionItems = Array.isArray(queue.items) ? queue.items : [];
const candidatesByFamily = new Map();
const pageDomCache = new Map();

function versionFromPath(value) {
  return Number(value.match(/-v(\d+)(?:-corrected)?\.json$/iu)?.[1] ?? 0);
}

function familyPath(value) {
  return value.replace(/-v\d+(?:-corrected)?\.json$/iu, '.json');
}

function isBlankDiagnostic(value) {
  return /\bblank\b|\bempty PT text region\b|fica(?:r)?\s+(?:inteir[oa]s?\s+)?em\s+branco|unidade\s+inteira\s+em\s+branco|regi[aã]o PT vazia/iu.test(String(value ?? ''));
}

function copyfitClassification(candidate) {
  const explicit = candidate.copyfitClassification ?? candidate.copyfitLineCountClassification;
  if (['EXACT', 'UNDER', 'OVER', 'UNMEASURED'].includes(explicit)) return explicit;
  const source = Number(candidate.sourcePdfVisualLineCount
    ?? candidate.copyfitMeasurement?.sourcePdfVisualLineCount);
  const target = Number(candidate.pageRendererVisualLineCount
    ?? candidate.copyfitMeasurement?.pageRendererVisualLineCount);
  if (!Number.isInteger(source) || source < 1 || !Number.isInteger(target) || target < 1) return null;
  return target === source ? 'EXACT' : target < source ? 'UNDER' : 'OVER';
}

function candidateCopyfitLineCounts(candidate) {
  const source = Number(candidate.sourcePdfVisualLineCount
    ?? candidate.copyfitMeasurement?.sourcePdfVisualLineCount);
  const target = Number(candidate.pageRendererVisualLineCount
    ?? candidate.copyfitMeasurement?.pageRendererVisualLineCount);
  return {
    source: Number.isInteger(source) && source > 0 ? source : null,
    target: Number.isInteger(target) && target > 0 ? target : null,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeSpanKeyForComparison(key) {
  return String(key ?? '').replace(/__pt-BR$/u, '');
}

function copyfitMeasurementFingerprint(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.segments)) return null;
  const snapshot = {
    spanKey: normalizeSpanKeyForComparison(data.spanKey),
    bbox: data.bbox,
    textAlign: data.textAlign,
    lineHeight: data.lineHeight,
    lineHeightMode: data.lineHeightMode,
    managedSourceSymbols: data.managedSourceSymbols ?? [],
    segments: data.segments,
  };
  return createHash('sha256').update(canonical(snapshot)).digest('hex');
}

function validBbox(value) {
  return Array.isArray(value) && value.length === 4
    && value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate))
    && value[2] > value[0] && value[3] > value[1];
}

function checkEditorialCrossReference(sourceText, proposalText) {
  const issues = [];
  if (/\bconsulte\b/iu.test(proposalText)) {
    if (/\bsee\b/iu.test(sourceText) || /\bconsulte\s+([A-ZÀ-Ú][^.,;]+,\s*(?:pág\.|p\.|pg\.)\s*\d+|\w+\s+\d+)/iu.test(proposalText)) {
      issues.push('Editorial cross-reference uses forbidden "Consulte". Regra canônica: use "Veja".');
    }
  }
  if (/\bveja\s+em\s+(?:pág|p\.|pg\.|tabela|seção|diagrama)/iu.test(proposalText)) {
    issues.push('Editorial cross-reference uses forbidden "Veja em". Regra canônica: utilize a forma direta "Veja".');
  }
  return issues;
}

function pageDom(pageNumber) {
  if (pageDomCache.has(pageNumber)) return pageDomCache.get(pageNumber);
  const pageDirectory = `page_${String(pageNumber).padStart(3, '0')}`;
  const pagePath = path.join(root, 'apps/web/public/pages', pageDirectory, `${pageDirectory}_dom.json`);
  try {
    const data = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
    pageDomCache.set(pageNumber, data);
    return data;
  } catch {
    pageDomCache.set(pageNumber, null);
    return null;
  }
}

/** Resolve the same persisted span identity and page-space box used by the Viewer before issuing Copyfit evidence. */
function canonicalCopyfitGeometry(candidate, pageNumber, spanKey) {
  const page = pageDom(pageNumber);
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  const keyBlockIndex = Number(spanKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u)?.[1]);
  const blockIndex = Number.isInteger(candidate.blockIndex)
    ? candidate.blockIndex
    : Number.isInteger(keyBlockIndex)
      ? keyBlockIndex
      : candidate.sourceBlockId ? blocks.findIndex(block => block?.id === candidate.sourceBlockId) : -1;
  const sourceBlock = blockIndex >= 0 && blockIndex < blocks.length ? blocks[blockIndex] : null;
  const sourceUnitKey = spanKey.match(/^page_\d+_unit_(.+?)(?:__pt-BR)?$/u)?.[1];
  const sourceUnitId = candidate.sourceUnitId ?? sourceUnitKey;
  const sourceUnit = sourceUnitId && Array.isArray(sourceBlock?.typographicUnits)
    ? sourceBlock.typographicUnits.find(unit => unit?.id === sourceUnitId)
    : null;
  const validBboxes = Array.isArray(candidate.sourceBboxes)
    ? candidate.sourceBboxes.filter(validBbox)
    : [];
  const sourceBboxUnion = validBboxes.length > 0
    ? [
        Math.min(...validBboxes.map(b => b[0])),
        Math.min(...validBboxes.map(b => b[1])),
        Math.max(...validBboxes.map(b => b[2])),
        Math.max(...validBboxes.map(b => b[3])),
      ]
    : null;
  const rawData = candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)
    ? candidate.data
    : null;
  const bbox = sourceUnit
    ? [sourceUnit.field?.bbox, sourceBboxUnion, rawData?.bbox, sourceBlock?.bbox].find(validBbox)
    : [sourceBlock?.bbox, sourceBboxUnion, rawData?.bbox].find(validBbox);

  let canonicalSpanKey = spanKey;
  if (/^page_\d+_unit_/u.test(spanKey)) {
    canonicalSpanKey = spanKey.endsWith('__pt-BR') ? spanKey : `${spanKey}__pt-BR`;
  } else if (blockIndex >= 0) {
    canonicalSpanKey = sourceBlock?.editorKey
      ? `${sourceBlock.editorKey}__pt-BR`
      : `page_${pageNumber}_block_${blockIndex}__pt-BR`;
  }

  return validBbox(bbox) ? { spanKey: canonicalSpanKey, bbox } : null;
}

for (const relativePath of queue.sourceProposals ?? []) {
  if (!relativePath.toLowerCase().endsWith('.json')) continue;
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolutePath)) continue;
  const proposal = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (!Array.isArray(proposal.candidates) || proposal.candidates.length === 0) continue;
  const pageNumber = Number(proposal.page ?? path.basename(relativePath).match(/page-(\d+)/iu)?.[1]);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 102) continue;
  const family = `${pageNumber}:${familyPath(relativePath)}`;
  const current = candidatesByFamily.get(family);
  if (!current || versionFromPath(relativePath) >= versionFromPath(current.relativePath)) {
    candidatesByFamily.set(family, { relativePath, absolutePath, proposal, pageNumber });
  }
}

const proposals = [...candidatesByFamily.values()]
  .sort((a, b) => a.pageNumber - b.pageNumber || a.relativePath.localeCompare(b.relativePath))
  .map(({ relativePath, proposal, pageNumber }) => {
    const fileTitle = path.basename(relativePath).replace(/\.json$/iu, '');
    const proposalId = String(proposal.proposalId ?? `${fileTitle}`);
    const proposalVersion = String(proposal.version ?? (versionFromPath(relativePath) || 'draft'));
    const candidates = proposal.candidates.flatMap((candidate, index) => {
      const spanKey = String(candidate.spanKey ?? candidate.spanKeys?.[0] ?? '');
      const sourceData = candidate.data;
      if (!spanKey || !sourceData || (!Array.isArray(sourceData) && !Array.isArray(sourceData.segments))) return [];
      const candidateKey = `${proposalId}@${proposalVersion}::${spanKey}`;
      const matchingExceptions = exceptionItems.filter(item => {
        if (item.page !== pageNumber) return false;
        if (item.spanKey) {
          if (item.spanKey === spanKey) return true;
          // A field-level exception must not blank sibling typographic units
          // that happen to share their source block. Legacy block keys remain
          // block-scoped for candidates produced from that same block.
          const blockScopedKey = /^page_\d+_block_\d+(?:__pt-BR)?$/u.test(item.spanKey);
          return blockScopedKey && item.sourceBlockId === candidate.sourceBlockId;
        }
        return !!item.sourceBlockId && item.sourceBlockId === candidate.sourceBlockId;
      });
      const blankException = matchingExceptions.find(item => item.status !== 'resolved'
        && isBlankDiagnostic(item.diagnosticRendering));
      const lineCounts = candidateCopyfitLineCounts(candidate);
      const geometry = canonicalCopyfitGeometry(candidate, pageNumber, spanKey);
      const data = geometry && !Array.isArray(sourceData)
        ? { ...sourceData, spanKey: geometry.spanKey, bbox: geometry.bbox }
        : sourceData;
      const measuredClassification = lineCounts.source && lineCounts.target && geometry
        ? copyfitClassification(candidate)
        : lineCounts.source && lineCounts.target ? 'UNMEASURED' : copyfitClassification(candidate);
      const sourceText = String(candidate.sourceText ?? '');
      const proposalText = String(candidate.proposalText ?? candidate.proposedText ?? '');
      const termIssues = checkEditorialCrossReference(sourceText, proposalText);
      for (const issue of termIssues) {
        console.warn(`[TERMINOLOGY WARNING] ${candidateKey}: ${issue}`);
      }
      return [{
        reviewKey: candidateKey,
        pageNumber,
        proposalId,
        proposalVersion,
        proposalTitle: String(proposal.title ?? fileTitle),
        proposalFile: relativePath.replaceAll('\\', '/'),
        index,
        spanKey,
        blockIndex: Number.isInteger(candidate.blockIndex) ? candidate.blockIndex : null,
        sourceBlockId: candidate.sourceBlockId ?? null,
        sourceUnitId: candidate.sourceUnitId ?? null,
        sourceText,
        proposalText,
        data,
        reviewLayoutFrame: candidate.reviewLayoutFrame && typeof candidate.reviewLayoutFrame === 'object'
          ? candidate.reviewLayoutFrame : null,
        sourceBboxes: Array.isArray(candidate.sourceBboxes) ? candidate.sourceBboxes : [],
        technicalStatus: String(candidate.technicalStatus ?? 'not_recorded'),
        copyfitClassification: measuredClassification,
        copyfitSourcePdfLineCount: lineCounts.source,
        copyfitPageRendererLineCount: lineCounts.target,
        copyfitCanonicalSpanKey: geometry?.spanKey ?? null,
        copyfitCanonicalBbox: geometry?.bbox ?? null,
        copyfitMeasurementFingerprint: lineCounts.source && lineCounts.target && geometry
          ? copyfitMeasurementFingerprint(data) : null,
        underCompositionJustification: String(candidate.underCompositionJustification ?? ''),
        editorialStatus: String(candidate.editorialStatus ?? candidate.status ?? 'pending_human_review'),
        diagnosticRendering: String(candidate.diagnosticRendering ?? ''),
        pendingTerms: Array.isArray(candidate.pendingTerms) ? candidate.pendingTerms : [],
        diagnosticBlank: blankException ? {
          exceptionId: String(blankException.id),
          reason: String(blankException.reason ?? blankException.diagnosticRendering ?? 'Bloque vazio somente no diagnóstico.'),
        } : null,
      }];
    });
    return {
      proposalId,
      proposalVersion,
      proposalTitle: String(proposal.title ?? fileTitle),
      proposalFile: relativePath.replaceAll('\\', '/'),
      pageNumber,
      candidates,
    };
  })
  .filter(proposal => proposal.candidates.length > 0);

const candidateBySource = new Map();
for (const proposal of proposals) {
  for (const candidate of proposal.candidates) {
    if (candidate.sourceBlockId) candidateBySource.set(`${candidate.pageNumber}:${candidate.sourceBlockId}`, candidate.reviewKey);
    candidateBySource.set(`${candidate.pageNumber}:${candidate.spanKey}`, candidate.reviewKey);
  }
}

const exceptions = exceptionItems.map(item => ({
  id: String(item.id ?? ''),
  pageNumber: Number(item.page ?? 0),
  spanKey: item.spanKey ?? null,
  sourceBlockId: item.sourceBlockId ?? null,
  category: String(item.category ?? 'unclassified'),
  status: String(item.status ?? 'open'),
  reason: String(item.reason ?? ''),
  diagnosticRendering: String(item.diagnosticRendering ?? ''),
  sourceText: String(item.sourceText ?? ''),
  proposedText: String(item.proposedText ?? ''),
  evidence: Array.isArray(item.evidence) ? item.evidence : [],
  reviewKey: candidateBySource.get(`${item.page}:${item.spanKey ?? item.id}`)
    ?? candidateBySource.get(`${item.page}:${item.sourceBlockId}`)
    ?? null,
  diagnosticBlank: item.status !== 'resolved' && isBlankDiagnostic(item.diagnosticRendering),
}));

const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceQueue: 'docs/translations/localization-exceptions.json',
  proposalCount: proposals.length,
  candidateCount: proposals.reduce((total, proposal) => total + proposal.candidates.length, 0),
  exceptionCount: exceptions.length,
  officialGlossaryTerms,
  proposals,
  exceptions,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(catalog)}\n`, 'utf8');
console.log(`Generated ${path.relative(root, outputPath)}: ${catalog.candidateCount} units, ${exceptions.length} exceptions.`);
