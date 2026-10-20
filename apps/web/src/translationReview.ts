import type { LayoutFrame, PageData } from './components/PageRenderer';
import type { Segment, SpanOverride } from './components/RichSpanEditor';
import { decodeOverrideData, encodeOverrideData } from './symbols/overrideData';
import { lineHeightModeForOverride } from './symbols/editorOverride';
import { payloadApiUrl } from './config/payloadApi';
import { loadLocalOverrides } from './localPersistence';

export interface ProposalReviewLayoutFrame extends LayoutFrame {
  y: number;
  height: number;
}

export interface TranslationReviewCandidate {
  reviewKey: string;
  pageNumber: number;
  proposalId: string;
  proposalVersion: string;
  proposalTitle: string;
  proposalFile: string;
  index: number;
  spanKey: string;
  blockIndex: number | null;
  sourceBlockId: string | null;
  sourceUnitId: string | null;
  sourceText: string;
  proposalText: string;
  sourceSegments?: Segment[];
  data: unknown;
  /** Explicit proposal-only frame, absent unless its geometry was measured and approved for preview. */
  reviewLayoutFrame?: ProposalReviewLayoutFrame | null;
  sourceBboxes?: Array<[number, number, number, number]>;
  technicalStatus: string;
  copyfitClassification?: 'EXACT' | 'UNDER' | 'OVER' | 'UNMEASURED' | null;
  copyfitSourcePdfLineCount?: number | null;
  copyfitPageRendererLineCount?: number | null;
  copyfitMeasurementFingerprint?: string | null;
  copyfitCanonicalSpanKey?: string | null;
  copyfitCanonicalBbox?: [number, number, number, number] | null;
  underCompositionJustification?: string | null;
  editorialStatus: string;
  diagnosticRendering: string;
  pendingTerms: string[];
  diagnosticBlank: { exceptionId: string; reason: string } | null;
}

/** Keep failed proposal text available in the review panel, but never paint it into the PT-BR diagnostic page. */
export function candidateRequiresDiagnosticBlank(candidate: Pick<TranslationReviewCandidate,
  'diagnosticBlank' | 'technicalStatus' | 'copyfitClassification' | 'underCompositionJustification'>): boolean {
  const technicalStatus = String(candidate.technicalStatus ?? '');
  return Boolean(candidate.diagnosticBlank)
    || candidate.copyfitClassification === 'OVER'
    || /changed[_-]since[_-]technical[_-]validation/iu.test(technicalStatus)
    || /^(?:blocked|failed)(?:[_-]|$)|(?:^|[_-])dtp[_-]exception[_-]open/iu.test(technicalStatus)
    || ((candidate.copyfitClassification === 'UNDER'
      || /pending-under-composition-justification/iu.test(technicalStatus))
      && !String(candidate.underCompositionJustification ?? '').trim());
}

export type CopyfitApprovalBlockReason = 'OVER' | 'UNDER_WITHOUT_COMPOSITION_RATIONALE' | 'UNMEASURED' | 'STALE_MEASUREMENT' | 'TECHNICAL_FAILURE' | 'MEASUREMENT_MISMATCH' | null;

export function copyfitApprovalBlockReason(
  classification?: string | null,
  technicalStatus?: string | null,
  underCompositionJustification?: string | null,
  sourcePdfLineCount?: number | null,
  pageRendererLineCount?: number | null,
): CopyfitApprovalBlockReason {
  if (/changed[_-]since[_-]technical[_-]validation|stale[_-]review[_-]version/iu.test(String(technicalStatus ?? ''))) return 'STALE_MEASUREMENT';
  const statusOver = /blocked[-_]line[-_]count[-_]over|blocked[-_]copyfit[-_]v3[-_]over/iu.test(String(technicalStatus ?? ''));
  const hasValidCounts = Number.isInteger(sourcePdfLineCount) && Number(sourcePdfLineCount) >= 1
    && Number.isInteger(pageRendererLineCount) && Number(pageRendererLineCount) >= 1;
  if (!hasValidCounts) return classification === 'OVER' || statusOver ? 'OVER' : 'UNMEASURED';
  if (!['EXACT', 'UNDER', 'OVER'].includes(String(classification ?? ''))) return statusOver ? 'OVER' : 'UNMEASURED';
  const measuredClassification = Number(pageRendererLineCount) === Number(sourcePdfLineCount) ? 'EXACT'
    : Number(pageRendererLineCount) < Number(sourcePdfLineCount) ? 'UNDER' : 'OVER';
  if (classification !== measuredClassification) return 'MEASUREMENT_MISMATCH';
  if (statusOver && measuredClassification !== 'OVER') return 'MEASUREMENT_MISMATCH';
  if (measuredClassification === 'OVER') return 'OVER';
  if (/^(?:blocked|failed)(?:[_-]|$)|(?:^|[_-])dtp[_-]exception[_-]open/iu.test(String(technicalStatus ?? ''))) return 'TECHNICAL_FAILURE';
  if ((classification === 'UNDER' || /pending-under-composition-justification/iu.test(String(technicalStatus ?? '')))
    && !String(underCompositionJustification ?? '').trim()) return 'UNDER_WITHOUT_COMPOSITION_RATIONALE';
  return null;
}

function canonicalCopyfitValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCopyfitValue).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalCopyfitValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function normalizeSpanKeyForComparison(key: unknown): string {
  return String(key ?? '').replace(/__pt-BR$/u, '');
}

function copyfitMeasurementSnapshot(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data) || !Array.isArray(data.segments)) return null;
  return {
    spanKey: normalizeSpanKeyForComparison(data.spanKey),
    bbox: data.bbox,
    textAlign: data.textAlign,
    lineHeight: data.lineHeight,
    lineHeightMode: data.lineHeightMode,
    managedSourceSymbols: data.managedSourceSymbols ?? [],
    segments: data.segments,
  };
}

/** Keep the review action disabled when the draft diverges from the server-built measurement. */
export function copyfitMeasurementDataMatches(measuredData: unknown, currentData: unknown): boolean {
  const measured = copyfitMeasurementSnapshot(measuredData);
  const current = copyfitMeasurementSnapshot(currentData);
  return !!measured && !!current && canonicalCopyfitValue(measured) === canonicalCopyfitValue(current);
}

/** Require the current review draft to match the catalog's canonical measurement before offering approval. */
export function copyfitCanonicalEvidenceBlockReason(
  candidate: TranslationReviewCandidate,
  currentData: unknown,
): CopyfitApprovalBlockReason {
  const bbox = candidate.copyfitCanonicalBbox;
  const hasCanonicalBbox = Array.isArray(bbox) && bbox.length === 4
    && bbox.every(value => typeof value === 'number' && Number.isFinite(value))
    && bbox[2] > bbox[0] && bbox[3] > bbox[1];
  if (!candidate.copyfitMeasurementFingerprint?.trim()
    || !candidate.copyfitCanonicalSpanKey
    || normalizeSpanKeyForComparison(candidate.copyfitCanonicalSpanKey) !== normalizeSpanKeyForComparison(candidate.spanKey)
    || !hasCanonicalBbox
    || !isRecord(candidate.data)
    || !Array.isArray(candidate.data.segments)) return 'UNMEASURED';

  const measuredData = {
    ...candidate.data,
    spanKey: candidate.copyfitCanonicalSpanKey,
    bbox: candidate.copyfitCanonicalBbox,
  };
  if (!copyfitMeasurementSnapshot(measuredData) || !copyfitMeasurementSnapshot(currentData)) return 'UNMEASURED';
  return copyfitMeasurementDataMatches(measuredData, currentData) ? null : 'STALE_MEASUREMENT';
}

export interface TranslationReviewProposal {
  proposalId: string;
  proposalVersion: string;
  proposalTitle: string;
  proposalFile: string;
  pageNumber: number;
  candidates: TranslationReviewCandidate[];
}

export interface TranslationReviewException {
  id: string;
  pageNumber: number;
  spanKey: string | null;
  sourceBlockId: string | null;
  category: string;
  status: string;
  reason: string;
  diagnosticRendering: string;
  sourceText: string;
  proposedText: string;
  evidence: string[];
  reviewKey: string | null;
  diagnosticBlank: boolean;
}

export function exceptionRequiresDiagnosticBlank(exception: Pick<TranslationReviewException, 'status' | 'diagnosticBlank'>): boolean {
  return exception.status !== 'resolved' && exception.diagnosticBlank;
}

export interface TranslationReviewCatalog {
  schemaVersion: number;
  generatedAt: string;
  proposalCount: number;
  candidateCount: number;
  exceptionCount: number;
  officialGlossaryTerms?: Array<{ sourceTerm: string; targetTerms: string[] }>;
  proposals: TranslationReviewProposal[];
  exceptions: TranslationReviewException[];
}

export interface TranslationReviewRecord {
  id: string | number;
  reviewKey: string;
  pageNumber: number;
  spanKey: string;
  proposalId: string;
  proposalVersion: string;
  sourceText?: string | null;
  proposalText?: string | null;
  data: unknown;
  technicalStatus: string;
  copyfitClassification?: 'EXACT' | 'UNDER' | 'OVER' | null;
  copyfitSourcePdfLineCount?: number | null;
  copyfitPageRendererLineCount?: number | null;
  copyfitMeasurementFingerprint?: string | null;
  underCompositionJustification?: string | null;
  approvalStatus: 'pending' | 'approved';
  reviewDisposition?: 'active' | 'archived';
  approvedAt?: string | null;
  publication?: {
    translationId: string | number;
    data: unknown;
    frame?: { frameId: string | number; frameKey: string; data: Record<string, unknown> };
    publishedAt: string;
    approvedAt?: string;
    history: Array<{
      translationId: string | number;
      data: unknown;
      publishedAt: string;
      approvedAt: string | null;
      proposalId: string;
      proposalVersion: string;
    }>;
  } | null;
  updatedAt?: string;
}

export type TranslationReviewRequestStatus = 'pending' | 'in_progress' | 'completed';

export interface TranslationReviewRequest {
  id: string | number;
  referenceType: 'proposal' | 'exception' | 'page';
  pageNumber: number;
  referenceTitle: string;
  reviewKey?: string | null;
  spanKey?: string | null;
  sourceBlockId?: string | null;
  exceptionId?: string | null;
  proposalId?: string | null;
  proposalVersion?: string | null;
  translationSpanKey?: string | null;
  requestText: string;
  requestContext?: Record<string, unknown> | null;
  status: TranslationReviewRequestStatus;
  resultNote?: string | null;
  handledAt?: string | null;
  completedBy?: 'ai' | 'user' | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Match a review request to the exact editorial unit it names. Legacy
 * block-level fallback is allowed only when neither key exists and the
 * candidate catalog proves that the block contains exactly one unit on that page.
 */
export function reviewRequestMatchesUnit(
  request: Pick<TranslationReviewRequest, 'reviewKey' | 'pageNumber' | 'spanKey' | 'sourceBlockId'>,
  candidate: Pick<TranslationReviewCandidate, 'reviewKey' | 'pageNumber' | 'spanKey' | 'sourceBlockId'>,
  candidates: readonly Pick<TranslationReviewCandidate, 'reviewKey' | 'pageNumber' | 'spanKey' | 'sourceBlockId'>[] = [],
): boolean {
  if (request.pageNumber !== candidate.pageNumber) return false;
  const requestSpanKey = request.spanKey?.replace(/__pt-BR$/u, '');
  if (requestSpanKey) {
    if (requestSpanKey !== candidate.spanKey.replace(/__pt-BR$/u, '')) return false;
    if (request.reviewKey) {
      const keyedUnit = candidates.find(unit => unit.reviewKey === request.reviewKey);
      if (keyedUnit && keyedUnit.spanKey.replace(/__pt-BR$/u, '') !== requestSpanKey) return false;
    }
    return true;
  }
  if (request.reviewKey) return request.reviewKey === candidate.reviewKey;
  if (!request.sourceBlockId || request.sourceBlockId !== candidate.sourceBlockId) return false;
  const blockUnits = candidates.filter(unit => unit.pageNumber === request.pageNumber
    && unit.sourceBlockId === request.sourceBlockId);
  return blockUnits.length === 1 && blockUnits[0].reviewKey === candidate.reviewKey;
}

export type NewTranslationReviewRequest = Omit<TranslationReviewRequest, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'handledAt' | 'resultNote'>;

export type TranslationGlossaryDecisionStatus = 'approved' | 'rejected';

export interface TranslationGlossaryOccurrence {
  pageNumber: number;
  reviewKey: string;
  proposalTitle: string;
  sourceText: string;
  proposalText: string;
}

export interface TranslationGlossaryDecision {
  id: string | number;
  decisionKey: string;
  sourceTerm: string;
  targetTerm: string;
  normalizedSourceTerm: string;
  normalizedTargetTerm: string;
  decisionStatus: TranslationGlossaryDecisionStatus;
  occurrences: TranslationGlossaryOccurrence[];
  decisionNote?: string | null;
  decidedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedPortugueseTranslations {
  texts: Map<string, string>;
  data: Map<string, unknown>;
  payload: Map<string, { id: string | number; spanKey: string; data: unknown }>;
}

export interface NewTranslationGlossaryDecision extends Omit<TranslationGlossaryDecision, 'id' | 'createdAt' | 'updatedAt' | 'decisionStatus' | 'decidedAt'> {
  decisionStatus: TranslationGlossaryDecisionStatus;
}

export interface ParsedGlossaryTermCandidate {
  sourceTerm: string;
  targetTerm: string;
  decisionKey: string;
  contextNote?: string;
}

export function normalizeGlossaryTerm(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
}

export function glossaryDecisionKey(sourceTerm: string, targetTerm: string): string {
  return `${normalizeGlossaryTerm(sourceTerm)}=>${normalizeGlossaryTerm(targetTerm)}`;
}

/**
 * Pending-term notes are free text. Expose term decisions only when explicit
 * EN → PT-BR pairs can be read conservatively from their clauses.
 */
export function parseGlossaryTermCandidates(note: string): ParsedGlossaryTermCandidate[] {
  const clauses: string[] = [];
  let clauseStart = 0;
  let parenthesesDepth = 0;
  for (let index = 0; index < note.length; index += 1) {
    if (note[index] === '(') parenthesesDepth += 1;
    if (note[index] === ')') parenthesesDepth = Math.max(0, parenthesesDepth - 1);
    if (note[index] === ';' && parenthesesDepth === 0) {
      clauses.push(note.slice(clauseStart, index).trim());
      clauseStart = index + 1;
    }
  }
  clauses.push(note.slice(clauseStart).trim());

  const parsed: ParsedGlossaryTermCandidate[] = [];
  for (const clause of clauses) {
    const arrowCount = (clause.match(/→/gu) ?? []).length;
    if (!arrowCount) continue;
    const pairs = arrowCount === 1
      ? [clause.match(/^\s*(.*?)\s*→\s*([\s\S]*)$/u)?.slice(1) ?? []]
      : [...clause.matchAll(/(?:^|,\s*|\s+(?:and|e)\s+)([^,;:]+?)\s*→\s*([\s\S]*?)(?=,\s*[^,;:]*?\s*→|\s+(?:and|e)\s+[^,;:]*?\s*→|$)/gu)].map(match => [match[1], match[2]]);
    for (const [leftRaw, rightRaw] of pairs) {
      if (!leftRaw || rightRaw === undefined) continue;
      let left = leftRaw.trim().replace(/^['“”]+|['“”]+$/gu, '');
      let right = rightRaw.trim();
      let contextNote = '';
      const parenthetical = right.match(/\s*\(([^()]*)\)\s*$/u);
      if (parenthetical) {
        contextNote = parenthetical[1].trim();
        right = right.slice(0, parenthetical.index).trim();
      }
      const contextualTail = right.match(/\s+(?:is|are|was|were|remain(?:s)?|follow(?:s)?|segue(?:m)?|são|sao|é|candidate|candidates|proposed|proposal|proposals|local usage|await(?:s)?|pending)\b[\s\S]*$/iu);
      if (contextualTail) {
        contextNote = [contextNote, contextualTail[0].trim()].filter(Boolean).join(' ');
        right = right.slice(0, contextualTail.index).trim();
      }
      const colonTail = right.match(/\s*:\s*([\s\S]*)$/u);
      if (colonTail) {
        contextNote = [contextNote, colonTail[1].trim()].filter(Boolean).join(' ');
        right = right.slice(0, colonTail.index).trim();
      }
      left = left.replace(/[.,!?]+$/u, '').trim();
      right = right.replace(/[.,!?]+$/u, '').trim().replace(/^['“”]+|['“”]+$/gu, '');
      if (!left || !right || right.includes('→') || /\s+e\s+/iu.test(right)) continue;

      // Slash-delimited alternatives are a clear one-to-one mapping. Keep
      // comma-separated prose conservative; it is too easy to split a term.
      const sourceTerms = left.split(/\s*\/\s*/u).map(term => term.trim()).filter(Boolean);
      const targetTerms = right.split(/\s*\/\s*/u).map(term => term.trim()).filter(Boolean);
      if (sourceTerms.length !== targetTerms.length || sourceTerms.some(term => /[;,:]/u.test(term))) continue;
      parsed.push(...sourceTerms.map((sourceTerm, index) => {
        const targetTerm = targetTerms[index];
        return {
          sourceTerm,
          targetTerm,
          decisionKey: glossaryDecisionKey(sourceTerm, targetTerm),
          ...(contextNote ? { contextNote } : {}),
        };
      }).filter(candidate => candidate.sourceTerm && candidate.targetTerm));
    }
  }
  return parsed;
}

export function clientSpanKey(spanKey: string, language: string): string {
  const suffix = `__${language}`;
  const base = spanKey.endsWith(suffix) ? spanKey.slice(0, -suffix.length) : spanKey;
  return language === 'pt-BR' && /^page_\d+_block_\d+$/u.test(base) ? base : spanKey;
}

function textFromStoredData(value: unknown): string {
  const decoded = decodeOverrideData(value);
  return decoded?.segments.map(segment => segment.text).join('') ?? '';
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, sortJsonKeys(value[key])]));
  return value;
}

export function translationDataMatches(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJsonKeys(left)) === JSON.stringify(sortJsonKeys(right));
}

async function fetchCollection<T>(slug: string, sort = 'id'): Promise<T[]> {
  const docs: T[] = [];
  for (let page = 1; ; page += 1) {
    const url = new URL(payloadApiUrl(slug));
    url.searchParams.set('depth', '0');
    url.searchParams.set('limit', '5000');
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', sort);
    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error(`Payload ${slug}: HTTP ${response.status}.`);
    const body = await response.json() as { docs?: T[]; totalPages?: number; totalDocs?: number };
    if (!Array.isArray(body.docs) || !Number.isInteger(body.totalPages)) {
      throw new Error(`Payload ${slug}: resposta de paginação inválida.`);
    }
    docs.push(...body.docs);
    if (page >= body.totalPages!) {
      if (Number.isInteger(body.totalDocs) && docs.length !== body.totalDocs) {
        throw new Error(`Payload ${slug}: resposta incompleta.`);
      }
      return docs;
    }
  }
}

export async function loadTranslationReviewCatalog(fetcher: typeof fetch = fetch): Promise<TranslationReviewCatalog> {
  const response = await fetcher('/translation-review/catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Catálogo de propostas: HTTP ${response.status}.`);
  const catalog = await response.json() as TranslationReviewCatalog;
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.proposals) || !Array.isArray(catalog.exceptions)) {
    throw new Error('O catálogo de propostas não tem o formato esperado.');
  }
  return catalog;
}

export async function loadTranslationReviewRecords(): Promise<TranslationReviewRecord[]> {
  return fetchCollection<TranslationReviewRecord>('translation-reviews');
}

export async function loadTranslationReviewRequests(): Promise<TranslationReviewRequest[]> {
  return fetchCollection<TranslationReviewRequest>('translation-review-requests', 'createdAt');
}

export async function loadTranslationGlossaryDecisions(): Promise<TranslationGlossaryDecision[]> {
  return fetchCollection<TranslationGlossaryDecision>('translation-glossary-decisions', 'createdAt');
}

export async function persistTranslationGlossaryDecision(
  input: NewTranslationGlossaryDecision,
  existing?: TranslationGlossaryDecision,
): Promise<TranslationGlossaryDecision> {
  const body = { ...input, decidedAt: new Date().toISOString() };
  const response = await fetch(payloadApiUrl(existing ? `translation-glossary-decisions/${existing.id}` : 'translation-glossary-decisions'), {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { doc?: TranslationGlossaryDecision; errors?: Array<{ message?: string }>; message?: string } | null;
  if (!response.ok || !payload?.doc) {
    const reason = payload?.errors?.map(error => error.message).filter(Boolean).join('; ')
      || payload?.message
      || `HTTP ${response.status}`;
    throw new Error(`Não foi possível registrar a decisão de glossário: ${reason}.`);
  }
  return payload.doc;
}

export async function persistTranslationReviewRequest(input: NewTranslationReviewRequest): Promise<TranslationReviewRequest> {
  const response = await fetch(payloadApiUrl('translation-review-requests'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, status: 'pending' }),
  });
  const payload = await response.json().catch(() => null) as { doc?: TranslationReviewRequest; errors?: Array<{ message?: string }>; message?: string } | null;
  if (!response.ok || !payload?.doc) {
    const reason = payload?.errors?.map(error => error.message).filter(Boolean).join('; ')
      || payload?.message
      || `HTTP ${response.status}`;
    throw new Error(`Não foi possível adicionar o pedido à fila: ${reason}.`);
  }
  return payload.doc;
}

export async function updateTranslationReviewRequest(
  request: TranslationReviewRequest,
  status: TranslationReviewRequestStatus,
  resultNote?: string,
): Promise<TranslationReviewRequest> {
  const response = await fetch(payloadApiUrl(`translation-review-requests/${request.id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      resultNote: resultNote ?? request.resultNote ?? '',
      handledAt: status === 'completed' ? new Date().toISOString() : null,
      completedBy: status === 'completed' ? 'ai' : null,
    }),
  });
  const payload = await response.json().catch(() => null) as { doc?: TranslationReviewRequest; errors?: Array<{ message?: string }>; message?: string } | null;
  if (!response.ok || !payload?.doc) {
    const reason = payload?.errors?.map(error => error.message).filter(Boolean).join('; ')
      || payload?.message
      || `HTTP ${response.status}`;
    throw new Error(`Não foi possível atualizar o pedido da fila: ${reason}.`);
  }
  return payload.doc;
}

export interface CompletedUserTranslationReviewRequest {
  request: TranslationReviewRequest;
  review: TranslationReviewRecord;
  translation: { id: string | number; spanKey: string; language: string; data: unknown };
}

export async function completeTranslationReviewRequestAsUser(
  request: TranslationReviewRequest,
  resultNote: string,
): Promise<CompletedUserTranslationReviewRequest> {
  const response = await fetch(payloadApiUrl('translation-review/complete-by-user'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: request.id,
      resultNote: resultNote.trim(),
      reviewKey: request.reviewKey ?? null,
      spanKey: request.spanKey ?? null,
      sourceBlockId: request.sourceBlockId ?? null,
      proposalId: request.proposalId ?? null,
      proposalVersion: request.proposalVersion ?? null,
      translationSpanKey: request.translationSpanKey ?? null,
      confirmLegacyCompletion: request.status === 'completed' && !request.completedBy,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null) as {
    request?: TranslationReviewRequest;
    review?: TranslationReviewRecord;
    translation?: CompletedUserTranslationReviewRequest['translation'];
    confirmed?: boolean;
    error?: string;
  } | null;
  const reviewData = payload?.review?.publication?.data;
  if (!response.ok || !payload?.confirmed || !payload.request || !payload.review || !payload.translation
    || payload.request.status !== 'completed' || payload.request.completedBy !== 'user'
    || payload.review.approvalStatus !== 'approved' || !payload.review.publication
    || String(payload.review.publication.translationId) !== String(payload.translation.id)
    || payload.translation.language !== 'pt-BR'
    || !translationDataMatches(payload.translation.data, reviewData)
    || !translationDataMatches(payload.review.data, reviewData)) {
    throw new Error(payload?.error || `O Payload não confirmou a conclusão humana e a aprovação (HTTP ${response.status}).`);
  }
  return { request: payload.request, review: payload.review, translation: payload.translation };
}

export async function loadSavedPortugueseTranslations(): Promise<SavedPortugueseTranslations> {
  const texts = new Map<string, string>();
  const data = new Map<string, unknown>();
  const payload = new Map<string, { id: string | number; spanKey: string; data: unknown }>();
  try {
    for (const [key, override] of loadLocalOverrides('pt-BR')) {
      texts.set(key, override.segments.map(segment => segment.text).join(''));
      data.set(key, override);
    }
  } catch { /* Browser-local storage can be unavailable; the remote read below remains useful. */ }
  const remote = await fetchCollection<{ id?: string | number; spanKey?: string; language?: string; data?: unknown }>('translations');
  for (const record of remote) {
    if (record.language !== 'pt-BR' || typeof record.spanKey !== 'string' || record.id === undefined) continue;
    const key = clientSpanKey(record.spanKey, 'pt-BR');
    const entry = { id: record.id, spanKey: record.spanKey, data: record.data };
    payload.set(key, entry);
    if (!payload.has(record.spanKey)) payload.set(record.spanKey, entry);
    const unSuffixed = record.spanKey.replace(/__pt-BR$/u, '');
    if (!payload.has(unSuffixed)) payload.set(unSuffixed, entry);
    if (data.has(key)) continue; // An unsynced local human edit is newer than the remote copy.
    const text = textFromStoredData(record.data);
    texts.set(key, text);
    data.set(key, record.data);
  }
  return { texts, data, payload };
}

export function rendererKeyForReviewCandidate(candidate: TranslationReviewCandidate, pageData?: PageData | null): string {
  if (typeof candidate.copyfitCanonicalSpanKey === 'string' && candidate.copyfitCanonicalSpanKey) {
    const plainMatch = candidate.copyfitCanonicalSpanKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u);
    if (plainMatch) {
      const index = Number(plainMatch[1]);
      const sourceBlock = pageData?.page_number === candidate.pageNumber ? pageData.blocks[index] : undefined;
      if (sourceBlock?.editorKey) return `${sourceBlock.editorKey}__pt-BR`;
      return `page_${candidate.pageNumber}_block_${index}`;
    }
    return candidate.copyfitCanonicalSpanKey;
  }
  if (/^page_\d+_unit_/u.test(candidate.spanKey)) {
    return candidate.spanKey.endsWith('__pt-BR') ? candidate.spanKey : `${candidate.spanKey}__pt-BR`;
  }
  const index = candidate.blockIndex
    ?? Number(candidate.spanKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u)?.[1]);
  if (Number.isInteger(index) && index >= 0) {
    const sourceBlock = pageData?.page_number === candidate.pageNumber ? pageData.blocks[index] : undefined;
    if (sourceBlock?.editorKey) return `${sourceBlock.editorKey}__pt-BR`;
    return `page_${candidate.pageNumber}_block_${index}`;
  }
  const plainMatch = candidate.spanKey.match(/^(page_\d+_block_\d+)__pt-BR$/u);
  if (plainMatch) return plainMatch[1];
  return candidate.spanKey;
}

export function spanOverrideForReviewCandidate(
  candidate: TranslationReviewCandidate,
  rendererKey: string,
  data: unknown = candidate.data,
  pageData?: PageData | null,
): SpanOverride | null {
  const decoded = decodeOverrideData(data);
  if (!decoded) return null;
  const candidateBox = (candidate.data as { bbox?: unknown } | null)?.bbox;
  const storedBox = (data as { bbox?: unknown } | null)?.bbox;
  const isBbox = (value: unknown): value is [number, number, number, number] =>
    Array.isArray(value) && value.length === 4
      && value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate));
  const blockIndexFromKey = Number(candidate.spanKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u)?.[1]);
  const blockIndex = candidate.blockIndex
    ?? (Number.isInteger(blockIndexFromKey) ? blockIndexFromKey : null)
    ?? (pageData?.page_number === candidate.pageNumber && candidate.sourceBlockId
      ? pageData.blocks.findIndex(block => block.id === candidate.sourceBlockId)
      : -1);
  const sourceBlock = pageData?.page_number === candidate.pageNumber && blockIndex !== null && blockIndex >= 0
    ? pageData.blocks[blockIndex]
    : undefined;
  const sourceUnitId = candidate.sourceUnitId
    ?? candidate.spanKey.match(/^page_\d+_unit_(.+?)(?:__pt-BR)?$/u)?.[1];
  const sourceUnit = sourceUnitId
    ? sourceBlock?.typographicUnits?.find(unit => unit.id === sourceUnitId)
    : undefined;
  const proposalSourceBox = candidate.sourceBboxes?.find(isBbox);
  const bbox = [storedBox, candidateBox, candidate.copyfitCanonicalBbox, proposalSourceBox, sourceUnit?.field.bbox, sourceBlock?.bbox].find(isBbox)
    ?? [0, 0, 0, 0];
  return { ...decoded, spanKey: rendererKey, bbox };
}

/** Convert explicitly measured proposal geometry into a viewer-only frame. */
export function layoutFrameForReviewOverride(
  reviewLayoutFrame: ProposalReviewLayoutFrame | null | undefined,
  override: Pick<SpanOverride, 'textAlign' | 'lineHeight'>,
): LayoutFrame | null {
  if (!reviewLayoutFrame) return null;
  const { x, y, width, height } = reviewLayoutFrame;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return {
    ...reviewLayoutFrame,
    textAlign: override.textAlign ?? reviewLayoutFrame.textAlign,
    lineHeight: override.lineHeight ?? reviewLayoutFrame.lineHeight,
  };
}

export function reviewRecordForCandidate(
  records: TranslationReviewRecord[],
  candidate: TranslationReviewCandidate,
): TranslationReviewRecord | undefined {
  const unitKey = candidate.spanKey.replace(/__pt-BR$/u, '');
  return records
    .filter(record => record.pageNumber === candidate.pageNumber
      && record.spanKey.replace(/__pt-BR$/u, '') === unitKey)
    .sort((left, right) => {
      const leftUpdated = Date.parse(left.updatedAt ?? '') || 0;
      const rightUpdated = Date.parse(right.updatedAt ?? '') || 0;
      return rightUpdated - leftUpdated
        || Number(right.reviewKey === candidate.reviewKey) - Number(left.reviewKey === candidate.reviewKey);
    })[0];
}

export function withUpdatedTranslationReviewRecord(
  records: TranslationReviewRecord[],
  saved: TranslationReviewRecord,
): TranslationReviewRecord[] {
  const unitKey = saved.spanKey.replace(/__pt-BR$/u, '');
  return [
    ...records.filter(record => record.id !== saved.id
      && !(record.pageNumber === saved.pageNumber && record.spanKey.replace(/__pt-BR$/u, '') === unitKey)
      && record.reviewKey !== saved.reviewKey),
    saved,
  ];
}

export function candidateForReviewException(
  candidates: TranslationReviewCandidate[],
  exception: TranslationReviewException,
): TranslationReviewCandidate | undefined {
  const exact = exception.reviewKey
    ? candidates.find(candidate => candidate.reviewKey === exception.reviewKey)
    : undefined;
  if (exact) return exact;
  const spanKey = exception.spanKey?.replace(/__pt-BR$/u, '');
  return candidates.find(candidate => candidate.pageNumber === exception.pageNumber
    && !!spanKey && candidate.spanKey.replace(/__pt-BR$/u, '') === spanKey)
    ?? candidates.find(candidate => candidate.pageNumber === exception.pageNumber
      && !!exception.sourceBlockId && candidate.sourceBlockId === exception.sourceBlockId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function fontFamilyKey(value: string): string {
  return value.toLowerCase().replace(/-(regular|bold|italic|black|extrablack)$/u, '').replace(/local$/u, '');
}

function matchScore(source: SpanOverride['segments'][number], edited: SpanOverride['segments'][number]): number {
  let score = 0;
  if (fontFamilyKey(source.font) === fontFamilyKey(edited.font)) score += 2;
  if (Math.abs(source.size - edited.size) < 0.01) score += 2;
  if (source.color === edited.color) score += 2;
  if (source.weight === edited.weight) score += 2;
  if (source.style === edited.style) score += 1;
  if (source.symbolId && source.symbolId === edited.symbolId) score += 100;
  const text = source.text.trim();
  if (text && edited.text.includes(text)) score += 4;
  return score;
}

function preserveReviewSegmentMetadata(
  sourceSegments: SpanOverride['segments'],
  editedSegments: SpanOverride['segments'],
): SpanOverride['segments'] {
  return editedSegments.map(edited => {
    const source = sourceSegments
      .filter(segment => edited.symbolId ? segment.symbolId === edited.symbolId : !segment.symbolId)
      .map(segment => ({ segment, score: matchScore(segment, edited) }))
      .sort((left, right) => right.score - left.score)[0];
    if (!source || (!edited.symbolId && source.score < 5 && sourceSegments.length > 1)) return { ...edited };
    // Editor-authored fields win. Missing metadata (ligature policy, symbol
    // metrics, outline data, and future schema fields) remains from the closest
    // original rich run instead of disappearing during a text edit.
    return { ...source.segment, ...edited };
  });
}

function encodeReviewData(override: SpanOverride, sourceData: unknown): Record<string, unknown> {
  const sourceObject = isRecord(sourceData) ? sourceData : {};
  const sourceOverride = decodeOverrideData(sourceData);
  const sourceMode = sourceOverride ? lineHeightModeForOverride(sourceOverride) : lineHeightModeForOverride(override);
  const editedMode = override.lineHeightMode ?? sourceMode;
  const lineHeightWasChanged = editedMode !== sourceMode
    || (editedMode === 'custom' && override.lineHeight !== sourceOverride?.lineHeight);
  const mergedOverride: SpanOverride = {
    ...override,
    segments: preserveReviewSegmentMetadata(sourceOverride?.segments ?? [], override.segments),
    lineHeight: lineHeightWasChanged ? override.lineHeight : sourceOverride ? sourceOverride.lineHeight : override.lineHeight,
    lineHeightMode: lineHeightWasChanged ? editedMode : sourceOverride ? sourceOverride.lineHeightMode : override.lineHeightMode,
  };
  return {
    ...sourceObject,
    ...encodeOverrideData(mergedOverride),
    // The renderer identity and source geometry are publication metadata too;
    // encodeOverrideData intentionally serializes only the rich text payload.
    spanKey: mergedOverride.spanKey,
    bbox: mergedOverride.bbox,
  };
}

export function textForReviewData(data: unknown): string {
  return textFromStoredData(data);
}

export function segmentsForReviewData(data: unknown): Segment[] | null {
  return decodeOverrideData(data)?.segments ?? null;
}

export async function persistTranslationReview(
  candidate: TranslationReviewCandidate,
  data: SpanOverride,
  existing: TranslationReviewRecord | undefined,
  approvalStatus: 'pending' | 'approved',
  technicalStatus = existing?.technicalStatus ?? candidate.technicalStatus,
): Promise<TranslationReviewRecord> {
  const copyfitIsStale = /changed[_-]since[_-]technical[_-]validation|stale[_-]review[_-]version/iu.test(technicalStatus);
  const body = {
    reviewKey: candidate.reviewKey,
    pageNumber: candidate.pageNumber,
    spanKey: candidate.spanKey,
    proposalId: candidate.proposalId,
    proposalVersion: candidate.proposalVersion,
    sourceText: candidate.sourceText,
    proposalText: candidate.proposalText,
    data: encodeReviewData(data, existing?.data ?? candidate.data),
    technicalStatus,
    copyfitClassification: !copyfitIsStale && (candidate.copyfitClassification === 'EXACT'
      || candidate.copyfitClassification === 'UNDER' || candidate.copyfitClassification === 'OVER'
      ) ? candidate.copyfitClassification : null,
    copyfitSourcePdfLineCount: copyfitIsStale ? null : candidate.copyfitSourcePdfLineCount ?? null,
    copyfitPageRendererLineCount: copyfitIsStale ? null : candidate.copyfitPageRendererLineCount ?? null,
    copyfitMeasurementFingerprint: copyfitIsStale ? null : candidate.copyfitMeasurementFingerprint ?? null,
    underCompositionJustification: copyfitIsStale ? null : candidate.underCompositionJustification ?? null,
    approvalStatus,
    approvedAt: approvalStatus === 'approved' ? new Date().toISOString() : null,
  };
  const response = await fetch(payloadApiUrl(existing ? `translation-reviews/${existing.id}` : 'translation-reviews'), {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { doc?: TranslationReviewRecord; errors?: Array<{ message?: string }>; message?: string } | null;
  if (!response.ok || !payload?.doc) {
    const reason = payload?.errors?.map(error => error.message).filter(Boolean).join('; ')
      || payload?.message
      || `HTTP ${response.status}`;
    throw new Error(`Não foi possível salvar a revisão: ${reason}.`);
  }
  return payload.doc;
}

/** Archive a proposal from the active review queue without changing its book content. */
export async function persistTranslationReviewDisposition(
  candidate: TranslationReviewCandidate,
  existing: TranslationReviewRecord | undefined,
  disposition: 'active' | 'archived',
): Promise<TranslationReviewRecord> {
  if (existing?.approvalStatus === 'approved') {
    throw new Error('Uma unidade aprovada e integrada não pode ser arquivada da revisão.');
  }
  if (!existing && (candidate.data === null || candidate.data === undefined)) {
    throw new Error('A proposta não contém dados ricos para registrar o arquivamento.');
  }
  const body = existing ? { reviewDisposition: disposition } : {
    reviewKey: candidate.reviewKey,
    pageNumber: candidate.pageNumber,
    spanKey: candidate.spanKey,
    proposalId: candidate.proposalId,
    proposalVersion: candidate.proposalVersion,
    sourceText: candidate.sourceText,
    proposalText: candidate.proposalText,
    data: candidate.data,
    technicalStatus: candidate.technicalStatus,
    copyfitClassification: candidate.copyfitClassification ?? null,
    copyfitSourcePdfLineCount: candidate.copyfitSourcePdfLineCount ?? null,
    copyfitPageRendererLineCount: candidate.copyfitPageRendererLineCount ?? null,
    copyfitMeasurementFingerprint: candidate.copyfitMeasurementFingerprint ?? null,
    underCompositionJustification: candidate.underCompositionJustification ?? null,
    approvalStatus: 'pending' as const,
    approvedAt: null,
    reviewDisposition: disposition,
  };
  const response = await fetch(payloadApiUrl(existing ? `translation-reviews/${existing.id}` : 'translation-reviews'), {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { doc?: TranslationReviewRecord; errors?: Array<{ message?: string }>; message?: string } | null;
  if (!response.ok || !payload?.doc) {
    const reason = payload?.errors?.map(error => error.message).filter(Boolean).join('; ')
      || payload?.message
      || `HTTP ${response.status}`;
    throw new Error(`Não foi possível atualizar a fila de revisão: ${reason}.`);
  }

  // A stale Payload build can silently ignore a newly added field while still
  // returning HTTP 200 and an updated document timestamp. Confirm the actual
  // stored value before the UI removes the proposal from the active queue.
  const confirmationResponse = await fetch(payloadApiUrl(`translation-reviews/${payload.doc.id}?depth=0`), {
    method: 'GET',
    cache: 'no-store',
  });
  const confirmation = await confirmationResponse.json().catch(() => null) as ({ doc?: TranslationReviewRecord; errors?: Array<{ message?: string }>; message?: string } & Partial<TranslationReviewRecord>) | null;
  const confirmedRecord = confirmation?.doc
    ?? (confirmation && confirmation.id !== undefined ? confirmation as TranslationReviewRecord : undefined);
  if (!confirmationResponse.ok || !confirmedRecord) {
    const reason = confirmation?.errors?.map(error => error.message).filter(Boolean).join('; ')
      || confirmation?.message
      || `HTTP ${confirmationResponse.status}`;
    const queueName = disposition === 'archived' ? 'Propostas' : 'Arquivadas';
    throw new Error(`A API não confirmou a alteração na fila: ${reason}. A unidade permanece em ${queueName}.`);
  }
  if (confirmedRecord.reviewDisposition !== disposition) {
    const queueName = disposition === 'archived' ? 'Propostas' : 'Arquivadas';
    throw new Error(`O armazenamento não confirmou ${disposition === 'archived' ? 'o arquivamento' : 'a restauração'} da unidade. Ela permanece em ${queueName}.`);
  }
  return confirmedRecord;
}

export interface PersistedTranslationApproval {
  review: TranslationReviewRecord;
  translation: { id: string | number; spanKey: string; language: string; data: unknown };
}

export async function persistTranslationReviewApproval(
  candidate: TranslationReviewCandidate,
  data: SpanOverride,
  existing: TranslationReviewRecord | undefined,
  technicalStatus = existing?.technicalStatus ?? candidate.technicalStatus,
): Promise<PersistedTranslationApproval> {
  const canonicalSpanKey = candidate.copyfitCanonicalSpanKey ?? candidate.spanKey;
  const canonicalBbox = candidate.copyfitCanonicalBbox ?? data.bbox;
  const canonicalOverride: SpanOverride = {
    ...data,
    spanKey: canonicalSpanKey,
    bbox: canonicalBbox,
  };
  const reviewData = encodeReviewData(canonicalOverride, existing?.data ?? candidate.data);
  const response = await fetch(payloadApiUrl('translation-review/approve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reviewKey: candidate.reviewKey,
      expectedUpdatedAt: existing?.updatedAt,
      pageNumber: candidate.pageNumber,
      spanKey: candidate.spanKey,
      proposalId: candidate.proposalId,
      proposalVersion: candidate.proposalVersion,
      sourceText: candidate.sourceText,
      proposalText: candidate.proposalText,
      data: reviewData,
      technicalStatus,
      copyfitClassification: candidate.copyfitClassification === 'EXACT'
        || candidate.copyfitClassification === 'UNDER' || candidate.copyfitClassification === 'OVER'
        ? candidate.copyfitClassification : null,
      copyfitSourcePdfLineCount: candidate.copyfitSourcePdfLineCount ?? null,
      copyfitPageRendererLineCount: candidate.copyfitPageRendererLineCount ?? null,
      copyfitMeasurementFingerprint: candidate.copyfitMeasurementFingerprint ?? null,
      underCompositionJustification: candidate.underCompositionJustification ?? null,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null) as {
    doc?: TranslationReviewRecord;
    translation?: PersistedTranslationApproval['translation'];
    confirmed?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !payload?.confirmed || !payload.doc || !payload.translation
    || !payload.doc.publication
    || String(payload.doc.publication.translationId) !== String(payload.translation.id)
    || !translationDataMatches(payload.doc.publication.data, reviewData)
    || !translationDataMatches(payload.translation.data, reviewData)) {
    throw new Error(payload?.error || `O Payload não confirmou a publicação da unidade (HTTP ${response.status}).`);
  }
  return { review: payload.doc, translation: payload.translation };
}
