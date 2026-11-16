import { useMemo, useState } from 'react';
import { Archive, Check, ChevronRight, FileDown, RotateCcw, X } from 'lucide-react';
import {
  pendingTranslationTermNote,
  type TranslationReviewCandidate,
  type TranslationReviewCatalog,
  type TranslationReviewException,
  type TranslationReviewRecord,
  type TranslationReviewRequest,
  type TranslationReviewRequestStatus,
  type NewTranslationReviewRequest,
  type TranslationGlossaryDecision,
  type TranslationGlossaryDecisionStatus,
  type TranslationPendingTerm,
} from '../translationReview';
import type { PageData } from './PageRenderer';
import { mapPdfFont, renderSegmentContent, segFontToCSS } from './PageRenderer';
import type { Segment } from './RichSpanEditor';
import { candidateForReviewException, clientSpanKey, copyfitApprovalBlockReason, copyfitCanonicalEvidenceBlockReason, glossaryDecisionKey, hasUnapprovedPublishedRevisionDraft, normalizeGlossarySearchText, normalizeGlossaryTerm, parseGlossaryTermCandidates, rendererKeyForReviewCandidate, reviewRecordForCandidate, reviewRequestMatchesUnit, segmentsForReviewData, spanOverrideForReviewCandidate, textForReviewData, translationDataMatches, unresolvedReviewExceptions } from '../translationReview';
import './TranslationReviewPanel.css';

interface TranslationReviewPanelProps {
  open: boolean;
  onClose: () => void;
  catalog: TranslationReviewCatalog | null;
  catalogError: string | null;
  records: TranslationReviewRecord[];
  requests: TranslationReviewRequest[];
  glossaryDecisions: TranslationGlossaryDecision[];
  persistenceError: string | null;
  persistenceAvailable: boolean;
  pageData: PageData | null;
  savedHumanTranslations: Map<string, string>;
  savedPayloadTranslations: Map<string, { id: string | number; spanKey: string; data: unknown }>;
  selectedPage: number;
  selectedReviewKey: string | null;
  busyReviewKey: string | null;
  hasUnsavedDraft: boolean;
  reviewStatus: string | null;
  language?: 'en' | 'pt-BR';
  onToggleLanguage?: (language: 'en' | 'pt-BR') => void;
  onSelectCandidate: (candidate: TranslationReviewCandidate) => void;
  onOpenViewer?: (candidate: TranslationReviewCandidate, diagnosticBlank: boolean) => void;
  onOpenApprovedViewer?: (candidate: TranslationReviewCandidate) => void;
  onOpenEditor: (candidate: TranslationReviewCandidate) => void;
  onOpenExceptionPage: (exception: TranslationReviewException) => void;
  onApprove: (candidate: TranslationReviewCandidate) => Promise<boolean>;
  onSetArchived: (candidate: TranslationReviewCandidate, archived: boolean) => Promise<void>;
  onClearSelection: () => void;
  onReopen: (candidate: TranslationReviewCandidate) => void;
  onCreateAIRequest: (request: NewTranslationReviewRequest) => Promise<TranslationReviewRequest>;
  onUpdateAIRequest: (request: TranslationReviewRequest, status: TranslationReviewRequestStatus, resultNote?: string) => Promise<void>;
  onCompleteAIRequestAsUser: (request: TranslationReviewRequest, resultNote: string) => Promise<void>;
  onDecideGlossaryTerm: (sourceTerm: string, targetTerm: string, status: TranslationGlossaryDecisionStatus) => Promise<void>;
}

type PanelTab = 'proposals' | 'exceptions' | 'requests' | 'approved' | 'glossary';
type RequestTarget = Omit<NewTranslationReviewRequest, 'requestText'>;

const glossaryStatusLabels: Record<TranslationGlossaryDecisionStatus, string> = {
  approved: 'Aprovado',
  observed_standard: 'Padrão observado',
  experimental: 'Experimental',
  hypothesis: 'Hipótese',
  rejected: 'Rejeitado',
};

const glossaryTypeLabels = {
  terminology: 'Terminologia',
  editorial_style: 'Estilo editorial',
  writing_pattern: 'Padrão de redação',
} as const;

const glossaryCategoryLabels = {
  unclassified: 'Sem classificação',
  component: 'Componente',
  game_mode: 'Modo de jogo',
  mechanic: 'Mecânica',
  action_phase: 'Ação ou fase',
  resource_attribute: 'Recurso ou atributo',
  status_effect: 'Estado ou efeito',
  keyword_tag: 'Tag ou palavra-chave',
  game_entity: 'Entidade do jogo',
  lore_identifier: 'Nome próprio ou identificador',
  editorial_convention: 'Convenção editorial',
} as const;

function csvCell(value: unknown): string {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function pageRequestTarget(pageNumber: number): RequestTarget {
  return { referenceType: 'page', pageNumber, referenceTitle: `Página ${pageNumber}` };
}

function targetForCandidate(candidate: TranslationReviewCandidate, pageData: PageData | null): RequestTarget {
  return {
    referenceType: 'proposal',
    pageNumber: candidate.pageNumber,
    referenceTitle: candidate.proposalTitle,
    reviewKey: candidate.reviewKey,
    spanKey: candidate.spanKey,
    translationSpanKey: rendererKeyForReviewCandidate(candidate, pageData),
    sourceBlockId: candidate.sourceBlockId,
    proposalId: candidate.proposalId,
    proposalVersion: candidate.proposalVersion,
    requestContext: { sourceText: candidate.sourceText, proposalText: candidate.proposalText },
  };
}

function targetForException(exception: TranslationReviewException, candidate: TranslationReviewCandidate | null | undefined, pageData: PageData | null): RequestTarget {
  return {
    referenceType: 'exception',
    pageNumber: exception.pageNumber,
    referenceTitle: exception.reason || exception.category.replaceAll('_', ' '),
    reviewKey: candidate?.reviewKey,
    spanKey: exception.spanKey ?? candidate?.spanKey,
    ...(candidate ? { translationSpanKey: rendererKeyForReviewCandidate(candidate, pageData) } : {}),
    sourceBlockId: exception.sourceBlockId,
    exceptionId: exception.id,
    proposalId: candidate?.proposalId,
    proposalVersion: candidate?.proposalVersion,
    requestContext: {
      category: exception.category,
      reason: exception.reason,
      sourceText: exception.sourceText,
      proposedText: exception.proposedText,
      evidence: exception.evidence,
    },
  };
}

function requestStatusLabel(status: TranslationReviewRequestStatus): string {
  if (status === 'in_progress') return 'Em andamento';
  if (status === 'completed') return 'Concluído';
  return 'Na fila';
}

function technicalLabel(value: string): string {
  if (value === 'verified_viewer_layout_symbol_no_fallback') return 'Prévia do Viewer verificada';
  if (value === 'changed_since_technical_validation') return 'Revalidar após edição';
  if (value === 'stale_review_version') return 'Validar versão atual';
  if (value.startsWith('verified')) return 'Validada';
  if (value.startsWith('blocked')) return 'Bloqueada';
  if (value.startsWith('pending') || value.startsWith('draft')) return 'Pendente';
  return value.replaceAll('_', ' ');
}

function candidateHeading(candidate: TranslationReviewCandidate): string {
  const heading = candidate.proposalText.split(/\r?\n/u).find(line => line.trim());
  return heading?.trim() || candidate.sourceBlockId || candidate.spanKey;
}

function reviewUnitIdentity(candidate: Pick<TranslationReviewCandidate, 'pageNumber' | 'spanKey'>): string {
  return `${candidate.pageNumber}:${candidate.spanKey.replace(/__pt-BR$/u, '')}`;
}

type PendingGlossaryRow =
  | { kind: 'note'; key: string; note: string }
  | { kind: 'term'; key: string; sourceTerm: string; targetTerm: string; note: string; contextNote?: string; conflictingTarget?: string };

function pendingGlossaryRows(
  notes: readonly TranslationPendingTerm[],
  decisions: TranslationGlossaryDecision[],
  officialGlossaryTerms: NonNullable<TranslationReviewCatalog['officialGlossaryTerms']>,
): PendingGlossaryRow[] {
  const rows: PendingGlossaryRow[] = [];
  const seen = new Set<string>();
  for (const [index, value] of notes.entries()) {
    const note = pendingTranslationTermNote(value);
    const terms = parseGlossaryTermCandidates(note);
    if (!terms.length) {
      rows.push({ kind: 'note', key: `note-${index}-${note}`, note });
      continue;
    }
    for (const term of terms) {
      if (seen.has(term.decisionKey)) continue;
      seen.add(term.decisionKey);
      if (decisions.some(decision => decision.decisionKey === term.decisionKey)) continue;
      const official = officialGlossaryTerms.find(entry => normalizeGlossaryTerm(entry.sourceTerm) === normalizeGlossaryTerm(term.sourceTerm));
      if (official?.targetTerms.some(target => normalizeGlossaryTerm(target) === normalizeGlossaryTerm(term.targetTerm))) continue;
      const conflict = decisions.find(decision => decision.decisionStatus === 'approved'
        && decision.normalizedSourceTerm === normalizeGlossaryTerm(term.sourceTerm)
        && decision.normalizedTargetTerm !== normalizeGlossaryTerm(term.targetTerm));
      rows.push({
        ...term,
        kind: 'term',
        key: term.decisionKey,
        note,
        conflictingTarget: conflict?.targetTerm
          ?? (official && !official.targetTerms.some(target => normalizeGlossaryTerm(target) === normalizeGlossaryTerm(term.targetTerm))
            ? official.targetTerms.join(' / ')
            : undefined),
      });
    }
    // Term decisions may remove every actionable pair above. Keep the complete
    // authored note visible as review context so structural cautions and the
    // rationale around an already-approved term are never silently dropped.
    rows.push({ kind: 'note', key: `context-${index}-${note}`, note: `Contexto da revisão: ${note}` });
  }
  return rows;
}

interface TypographicPreviewProps {
  segments?: Segment[] | null;
  fallbackText: string;
  language: 'en' | 'pt-BR';
  emptyMessage?: string;
}

function TypographicPreview({ segments, fallbackText, language, emptyMessage }: TypographicPreviewProps) {
  if (!segments || segments.length === 0) {
    return (
      <div className="translation-review-typographic-preview is-fallback">
        <p>{fallbackText || emptyMessage || 'Texto não registrado nesta unidade.'}</p>
      </div>
    );
  }

  const sizes = segments
    .map(s => s.size)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s > 0);
  const minSize = sizes.length > 0 ? Math.min(...sizes) : 10;
  const maxSize = sizes.length > 0 ? Math.max(...sizes) : 10;
  const hasVaryingSizes = maxSize - minSize > 1.5;

  return (
    <div className="translation-review-typographic-preview">
      {segments.map((seg, idx) => {
        const mapped = mapPdfFont(seg.font);
        const relSize = hasVaryingSizes
          ? Math.max(12, Math.min(20, Math.round((seg.size / minSize) * 13)))
          : 13;

        const style: React.CSSProperties = {
          fontFamily: segFontToCSS(seg.font),
          fontWeight: seg.weight,
          fontStyle: seg.style,
          fontVariantCaps: mapped.variantCaps,
          fontSize: `${relSize}px`,
          lineHeight: 1.5,
        };

        return (
          <span key={idx} style={style}>
            {renderSegmentContent({ ...seg, size: relSize, color: 'currentColor' }, 1, language, 'inline')}
          </span>
        );
      })}
    </div>
  );
}

export function TranslationReviewPanel({
  open, onClose, catalog, catalogError, records, requests, glossaryDecisions, persistenceError, persistenceAvailable,
  pageData,
  savedHumanTranslations, savedPayloadTranslations, selectedPage, selectedReviewKey, busyReviewKey, hasUnsavedDraft,
  reviewStatus, language = 'pt-BR', onToggleLanguage, onSelectCandidate, onOpenApprovedViewer, onOpenEditor, onOpenExceptionPage, onApprove, onSetArchived, onClearSelection, onReopen,
  onCreateAIRequest, onUpdateAIRequest, onCompleteAIRequestAsUser, onDecideGlossaryTerm,
}: TranslationReviewPanelProps) {
  const [tab, setTab] = useState<PanelTab>('proposals');
  const [pageFilter, setPageFilter] = useState('current');
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<RequestTarget>(() => pageRequestTarget(selectedPage));
  const [requestDraft, setRequestDraft] = useState('');
  const [requestResultDraft, setRequestResultDraft] = useState('');
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [glossaryError, setGlossaryError] = useState<string | null>(null);
  const [glossaryBusyKey, setGlossaryBusyKey] = useState<string | null>(null);
  const [glossarySearch, setGlossarySearch] = useState('');
  const [glossaryStatusFilter, setGlossaryStatusFilter] = useState('all');
  const [glossaryCategoryFilter, setGlossaryCategoryFilter] = useState('all');
  const [glossaryTypeFilter, setGlossaryTypeFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const allCandidates = useMemo(() => catalog?.proposals.flatMap(proposal => proposal.candidates) ?? [], [catalog]);
  const visibleGlossaryDecisions = useMemo(() => {
    const query = normalizeGlossarySearchText(glossarySearch.trim());
    return [...glossaryDecisions]
      .filter(decision => glossaryStatusFilter === 'all' || decision.decisionStatus === glossaryStatusFilter)
      .filter(decision => glossaryCategoryFilter === 'all' || (decision.semanticMetadata?.category ?? 'unclassified') === glossaryCategoryFilter)
      .filter(decision => glossaryTypeFilter === 'all' || (decision.semanticMetadata?.decisionType ?? 'terminology') === glossaryTypeFilter)
      .filter(decision => !query || normalizeGlossarySearchText(JSON.stringify(decision)).includes(query))
      .sort((left, right) => left.sourceTerm.localeCompare(right.sourceTerm, 'pt-BR'));
  }, [glossaryDecisions, glossarySearch, glossaryStatusFilter, glossaryCategoryFilter, glossaryTypeFilter]);
  const approvedCandidates = useMemo(() => {
    const list: TranslationReviewCandidate[] = [];
    const seenUnits = new Set<string>();

    for (const record of records) {
      if (!record.publication) continue;
      const publicationKey = (record.publication.data as { spanKey?: string } | null)?.spanKey ?? record.spanKey;
      if (typeof publicationKey !== 'string') continue;

      // Find in savedPayloadTranslations by translationId or by span key variants
      const payloadById = [...savedPayloadTranslations.values()].find(
        p => String(p.id) === String(record.publication?.translationId)
      );
      const payloadByKey = savedPayloadTranslations.get(publicationKey)
        ?? savedPayloadTranslations.get(clientSpanKey(publicationKey, 'pt-BR'))
        ?? savedPayloadTranslations.get(publicationKey.replace(/__pt-BR$/u, ''))
        ?? savedPayloadTranslations.get(record.spanKey)
        ?? savedPayloadTranslations.get(clientSpanKey(record.spanKey, 'pt-BR'))
        ?? savedPayloadTranslations.get(record.spanKey.replace(/__pt-BR$/u, ''));

      const payloadTranslation = payloadById ?? payloadByKey;
      if (!payloadTranslation) continue; // Inconsistent: not found in Payload

      // If both publication translationId and payloadTranslation.id exist, ensure they don't conflict
      if (record.publication.translationId && payloadTranslation.id && String(record.publication.translationId) !== String(payloadTranslation.id)) {
        const normalizedPayloadKey = payloadTranslation.spanKey.replace(/__pt-BR$/u, '');
        const normalizedRecordKey = record.spanKey.replace(/__pt-BR$/u, '');
        if (normalizedPayloadKey !== normalizedRecordKey) continue;
      }

      const unitId = `${record.pageNumber}:${record.spanKey.replace(/__pt-BR$/u, '')}`;
      if (seenUnits.has(unitId)) continue;
      seenUnits.add(unitId);

      const source = allCandidates.find(candidate => {
        const rec = reviewRecordForCandidate(records, candidate);
        return rec?.id === record.id || candidate.reviewKey === record.reviewKey;
      });

      const blockIndex = Number(record.spanKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u)?.[1]);
      const activeData = payloadTranslation.data ?? record.publication.data;
      const proposalText = textForReviewData(activeData);

      list.push({
        ...(source ?? {}),
        reviewKey: record.reviewKey,
        pageNumber: record.pageNumber,
        proposalId: record.proposalId,
        proposalVersion: record.proposalVersion,
        proposalTitle: source?.proposalTitle ?? 'Unidade aprovada',
        proposalFile: source?.proposalFile ?? '',
        index: source?.index ?? 0,
        spanKey: record.spanKey,
        blockIndex: source?.blockIndex ?? (Number.isInteger(blockIndex) ? blockIndex : null),
        sourceBlockId: source?.sourceBlockId ?? null,
        sourceUnitId: source?.sourceUnitId ?? null,
        sourceText: record.sourceText ?? source?.sourceText ?? '',
        proposalText,
        sourceSegments: source?.sourceSegments,
        data: activeData,
        technicalStatus: record.technicalStatus,
        editorialStatus: 'approved',
        diagnosticRendering: source?.diagnosticRendering ?? '',
        pendingTerms: source?.pendingTerms ?? [],
        diagnosticBlank: source?.diagnosticBlank ?? null,
      } satisfies TranslationReviewCandidate);
    }
    return list;
  }, [records, savedPayloadTranslations, allCandidates]);
  const pageNumbers = useMemo(() => [...new Set([
    ...allCandidates.map(candidate => candidate.pageNumber),
    ...approvedCandidates.map(candidate => candidate.pageNumber),
    ...(catalog?.exceptions.map(exception => exception.pageNumber) ?? []),
  ].filter(page => page > 0))].sort((a, b) => a - b), [allCandidates, approvedCandidates, catalog]);
  const pageValue = pageFilter === 'current'
    ? pageNumbers.includes(selectedPage) ? String(selectedPage) : 'all'
    : pageFilter;
  const approvedKeys = new Set(approvedCandidates.map(candidate => candidate.reviewKey));
  const publishedUnits = new Set(approvedCandidates.map(reviewUnitIdentity));

  const isCandidateApproved = (candidate: TranslationReviewCandidate) => {
    const record = reviewRecordForCandidate(records, candidate);
    if (hasUnapprovedPublishedRevisionDraft(record)) return false;
    return approvedKeys.has(candidate.reviewKey)
      || publishedUnits.has(reviewUnitIdentity(candidate))
      || (record?.approvalStatus === 'approved' && (approvedKeys.has(record.reviewKey) || publishedUnits.has(`${record.pageNumber}:${record.spanKey.replace(/__pt-BR$/u, '')}`)));
  };

  // A unit with an open (pending / in progress) review request belongs to the
  // Pedidos de Revisão queue and returns to Propostas once the request completes.
  const openRequests = requests.filter(request => request.status !== 'completed');
  const hasOpenRequest = (candidate: TranslationReviewCandidate) =>
    openRequests.some(request => reviewRequestMatchesUnit(request, candidate, allCandidates));
  const proposalRemainingCount = allCandidates.filter(candidate => {
    const record = reviewRecordForCandidate(records, candidate);
    return !isCandidateApproved(candidate)
      && record?.reviewDisposition !== 'archived'
      && !hasOpenRequest(candidate);
  }).length;
  const visibleCandidates = allCandidates.filter(candidate => {
    if (pageValue !== 'all' && candidate.pageNumber !== Number(pageValue)) return false;
    const record = reviewRecordForCandidate(records, candidate);
    return !isCandidateApproved(candidate)
      && record?.reviewDisposition !== 'archived'
      && !hasOpenRequest(candidate);
  });
  const archivedCandidates = allCandidates.filter(candidate => {
    const record = reviewRecordForCandidate(records, candidate);
    return record?.reviewDisposition === 'archived'
      && record.approvalStatus !== 'approved';
  });
  const visibleArchivedCandidates = archivedCandidates.filter(candidate =>
    pageValue === 'all' || candidate.pageNumber === Number(pageValue));
  const visibleApproved = approvedCandidates.filter(candidate => pageValue === 'all' || candidate.pageNumber === Number(pageValue));
  const visibleExceptions = unresolvedReviewExceptions(catalog?.exceptions ?? [], pageValue);
  const visibleRequests = [...requests]
    .filter(request => pageValue === 'all' || request.pageNumber === Number(pageValue))
    .sort((left, right) => {
      const leftDone = left.status === 'completed' ? 1 : 0;
      const rightDone = right.status === 'completed' ? 1 : 0;
      return leftDone - rightDone || (Date.parse(left.createdAt ?? '') || 0) - (Date.parse(right.createdAt ?? '') || 0);
    });
  const activeRequestCount = requests.filter(request => request.status !== 'completed').length;
  const selectedRequest = visibleRequests.find(request => String(request.id) === selectedRequestId) ?? null;
  const selectedRequestCandidate = selectedRequest
    ? (selectedRequest.reviewKey
      ? allCandidates.find(candidate => candidate.reviewKey === selectedRequest.reviewKey
        && reviewRequestMatchesUnit(selectedRequest, candidate, allCandidates))
      : undefined)
      ?? allCandidates.find(candidate => reviewRequestMatchesUnit(selectedRequest, candidate, allCandidates))
      ?? null
    : null;
  const selectedRequestAlreadyApproved = !!selectedRequest && approvedCandidates.some(candidate =>
    reviewRequestMatchesUnit(selectedRequest, candidate, allCandidates));
  const legacyUserApprovalConfirmation = !!selectedRequest
    && selectedRequest.status === 'completed'
    && !selectedRequest.completedBy
    && !!selectedRequest.resultNote?.trim()
    && !!selectedRequestCandidate
    && !selectedRequestAlreadyApproved;
  const selectedException = visibleExceptions.find(exception => exception.id === selectedExceptionId) ?? null;
  const selectedExceptionCandidate = selectedException
    ? candidateForReviewException(allCandidates, selectedException) ?? null
    : null;
  const selectedCandidate = (tab === 'exceptions' && selectedException) || tab === 'requests'
    ? null
    : (tab === 'approved' ? approvedCandidates : allCandidates)
      .find(candidate => candidate.reviewKey === selectedReviewKey) ?? null;
  const visiblePendingTerms = pendingGlossaryRows(selectedCandidate?.pendingTerms ?? [], glossaryDecisions, catalog?.officialGlossaryTerms ?? []);
  const selectedRecord = selectedCandidate ? reviewRecordForCandidate(records, selectedCandidate) : undefined;
  const selectedIsArchived = selectedRecord?.reviewDisposition === 'archived';
  const latestAIRevisionRequest = selectedCandidate && tab === 'proposals'
    ? requests.filter(request => request.status === 'completed'
      && request.completedBy === 'ai'
      && reviewRequestMatchesUnit(request, selectedCandidate, allCandidates)
      && !!request.resultNote?.trim())
      .sort((left, right) => (Date.parse(right.handledAt ?? right.updatedAt ?? '') || 0)
        - (Date.parse(left.handledAt ?? left.updatedAt ?? '') || 0))[0]
    : null;
  const selectedText = tab === 'approved' && selectedRecord?.publication
    ? textForReviewData(selectedRecord.publication.data)
    : selectedRecord ? textForReviewData(selectedRecord.data) : selectedCandidate?.proposalText ?? '';
  const selectedRecordFromEarlierProposal = !!selectedRecord && !!selectedCandidate
    && (selectedRecord.proposalId !== selectedCandidate.proposalId
      || selectedRecord.proposalVersion !== selectedCandidate.proposalVersion);
  const currentReviewData = selectedCandidate
    ? spanOverrideForReviewCandidate(
      selectedCandidate,
      rendererKeyForReviewCandidate(selectedCandidate, pageData),
      selectedRecord?.data ?? selectedCandidate.data,
      pageData,
    )
    : null;
  const copyfitBlockReason = selectedCandidate
    ? copyfitCanonicalEvidenceBlockReason(selectedCandidate, currentReviewData)
      ?? copyfitApprovalBlockReason(
        selectedRecord && !selectedRecordFromEarlierProposal
          ? selectedRecord.copyfitClassification ?? selectedCandidate.copyfitClassification
          : selectedCandidate.copyfitClassification,
        selectedRecordFromEarlierProposal
          ? 'stale_review_version'
          : selectedRecord ? selectedRecord.technicalStatus : selectedCandidate.technicalStatus,
        selectedRecord && !selectedRecordFromEarlierProposal
          ? selectedRecord.underCompositionJustification ?? selectedCandidate.underCompositionJustification
          : selectedCandidate.underCompositionJustification,
        selectedRecord && !selectedRecordFromEarlierProposal
          ? selectedRecord.copyfitSourcePdfLineCount ?? selectedCandidate.copyfitSourcePdfLineCount
          : selectedCandidate.copyfitSourcePdfLineCount,
        selectedRecord && !selectedRecordFromEarlierProposal
          ? selectedRecord.copyfitPageRendererLineCount ?? selectedCandidate.copyfitPageRendererLineCount
          : selectedCandidate.copyfitPageRendererLineCount,
      )
    : null;
  const currentCopyfitRecord = selectedRecord && !selectedRecordFromEarlierProposal ? selectedRecord : null;
  const copyfitSourceLineCount = currentCopyfitRecord?.copyfitSourcePdfLineCount
    ?? selectedCandidate?.copyfitSourcePdfLineCount ?? null;
  const copyfitViewerLineCount = currentCopyfitRecord?.copyfitPageRendererLineCount
    ?? selectedCandidate?.copyfitPageRendererLineCount ?? null;
  const copyfitClassification = currentCopyfitRecord?.copyfitClassification
    ?? selectedCandidate?.copyfitClassification ?? null;
  const humanText = selectedCandidate ? savedHumanTranslations.get(selectedCandidate.spanKey)
    ?? savedHumanTranslations.get(selectedCandidate.spanKey.replace(/__pt-BR$/u, '')) : undefined;
  const isBusy = selectedCandidate !== null && busyReviewKey === selectedCandidate.reviewKey;
  const queuePosition = selectedRequest && selectedRequest.status !== 'completed'
    ? visibleRequests.filter(request => request.status !== 'completed').findIndex(request => String(request.id) === String(selectedRequest.id)) + 1
    : null;

  const approveCandidate = async (candidate: TranslationReviewCandidate) => {
    if (await onApprove(candidate)) {
      setSelectedExceptionId(null);
      const index = visibleCandidates.findIndex(item => item.reviewKey === candidate.reviewKey);
      const next = index >= 0 ? visibleCandidates[index + 1] : undefined;
      if (next) onSelectCandidate(next);
      else onClearSelection();
    }
  };

  const setCandidateArchived = async (candidate: TranslationReviewCandidate, archived: boolean) => {
    setArchiveError(null);
    setArchiveNotice(null);
    const wasSelected = selectedReviewKey === candidate.reviewKey;
    const index = visibleCandidates.findIndex(item => item.reviewKey === candidate.reviewKey);
    const next = wasSelected && archived && index >= 0 ? visibleCandidates[index + 1] : undefined;
    try {
      await onSetArchived(candidate, archived);
      setArchiveNotice(archived ? 'Unidade arquivada da revisão; conteúdo do livro preservado.' : 'Unidade restaurada na fila de revisão.');
      setShowArchived(false);
      if (archived) {
        if (next) onSelectCandidate(next);
        else if (wasSelected) onClearSelection();
      } else {
        onSelectCandidate(candidate);
      }
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Não foi possível atualizar a fila.');
    }
  };

  const startAIRequest = (target: RequestTarget) => {
    setPageFilter('all');
    setRequestTarget(target);
    setRequestDraft('');
    setRequestResultDraft('');
    setRequestStatus(null);
    setRequestError(null);
    setSelectedRequestId(null);
    setSelectedExceptionId(null);
    setTab('requests');
  };

  const submitAIRequest = async () => {
    const requestText = requestDraft.trim();
    if (!requestText || requestBusy || !persistenceAvailable) return;
    setRequestBusy(true);
    setRequestStatus(null);
    setRequestError(null);
    try {
      const saved = await onCreateAIRequest({ ...requestTarget, requestText });
      setSelectedRequestId(String(saved.id));
      setRequestDraft('');
      setRequestStatus('Pedido salvo no início da fila. O próximo lote da IA começará por ele.');
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Não foi possível salvar o pedido.');
    } finally {
      setRequestBusy(false);
    }
  };

  const updateAIRequest = async (request: TranslationReviewRequest, status: TranslationReviewRequestStatus) => {
    if (requestBusy || !persistenceAvailable) return;
    if (status === 'completed' && !requestResultDraft.trim()) {
      setRequestError('Registre o resultado antes de concluir o pedido.');
      return;
    }
    setRequestBusy(true);
    setRequestStatus(null);
    setRequestError(null);
    try {
      await onUpdateAIRequest(request, status, requestResultDraft.trim());
      setRequestStatus(status === 'completed' ? 'Pedido concluído; a localização normal pode continuar.' : 'Pedido iniciado.');
      setRequestResultDraft('');
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Não foi possível atualizar o pedido.');
    } finally {
      setRequestBusy(false);
    }
  };

  const completeAIRequestAsUser = async (request: TranslationReviewRequest) => {
    if (requestBusy || !persistenceAvailable) return;
    if (!request.reviewKey || !request.spanKey || (!request.translationSpanKey && !selectedRequestCandidate)) {
      setRequestError('Este pedido não está ligado a uma unidade específica com tradução PT-BR verificável.');
      return;
    }
    if (!requestResultDraft.trim()) {
      setRequestError('Registre o ajuste humano antes de concluir.');
      return;
    }
    setRequestBusy(true);
    setRequestStatus(null);
    setRequestError(null);
    try {
      await onCompleteAIRequestAsUser({
        ...request,
        ...(selectedRequestCandidate ? {
          reviewKey: selectedRequestCandidate.reviewKey,
          spanKey: selectedRequestCandidate.spanKey,
          proposalId: selectedRequestCandidate.proposalId,
          proposalVersion: selectedRequestCandidate.proposalVersion,
        } : {}),
        translationSpanKey: request.translationSpanKey ?? (selectedRequestCandidate
          ? rendererKeyForReviewCandidate(selectedRequestCandidate, pageData?.page_number === selectedRequestCandidate.pageNumber ? pageData : null)
          : null),
      }, requestResultDraft.trim());
      setRequestStatus('Concluído por você. A tradução PT-BR foi confirmada no Payload e a unidade aparece em Aprovados.');
      setRequestResultDraft('');
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Não foi possível confirmar a tradução PT-BR salva.');
    } finally {
      setRequestBusy(false);
    }
  };

  const decideGlossaryTerm = async (sourceTerm: string, targetTerm: string, status: TranslationGlossaryDecisionStatus) => {
    const decisionKey = glossaryDecisionKey(sourceTerm, targetTerm);
    if (glossaryBusyKey) return;
    setGlossaryBusyKey(decisionKey);
    setGlossaryError(null);
    try {
      await onDecideGlossaryTerm(sourceTerm, targetTerm, status);
    } catch (error) {
      setGlossaryError(error instanceof Error ? error.message : 'Não foi possível salvar a decisão do glossário.');
    } finally {
      setGlossaryBusyKey(null);
    }
  };

  const exportGlossaryJSON = () => {
    const document = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      sourceOfTruth: 'Payload collection translation-glossary-decisions',
      decisions: [...glossaryDecisions].sort((left, right) => left.sourceTerm.localeCompare(right.sourceTerm, 'pt-BR')),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `middara-glossario-semantico-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportGlossaryCSV = () => {
    const columns = [
      'id', 'decisionKey', 'sourceTerm', 'preferredForm', 'status', 'decisionType', 'category', 'subtype',
      'context', 'alternatives', 'rejectedForms', 'distinctFrom', 'printedIdentifierPolicy', 'evidence',
      'examples', 'humanLocked', 'version', 'reconciliationStatus', 'reconciliationNote', 'decisionNote', 'occurrences',
    ];
    const rows = [...glossaryDecisions].sort((left, right) => left.sourceTerm.localeCompare(right.sourceTerm, 'pt-BR')).map(decision => {
      const metadata = decision.semanticMetadata;
      const values: Record<string, unknown> = {
        id: decision.id,
        decisionKey: decision.decisionKey,
        sourceTerm: decision.sourceTerm,
        preferredForm: decision.targetTerm,
        status: decision.decisionStatus,
        decisionType: metadata?.decisionType,
        category: metadata?.category,
        subtype: metadata?.subtype,
        context: metadata?.context,
        alternatives: metadata?.alternatives,
        rejectedForms: metadata?.rejectedForms,
        distinctFrom: metadata?.distinctFrom,
        printedIdentifierPolicy: metadata?.printedIdentifierPolicy,
        evidence: metadata?.evidence,
        examples: metadata?.examples,
        humanLocked: metadata?.humanLocked,
        version: metadata?.version,
        reconciliationStatus: metadata?.reconciliationStatus,
        reconciliationNote: metadata?.reconciliationNote,
        decisionNote: decision.decisionNote,
        occurrences: decision.occurrences,
      };
      return columns.map(column => csvCell(values[column])).join(',');
    });
    const csv = `\uFEFF${columns.join(',')}\r\n${rows.join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `middara-glossario-semantico-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportGlossaryDecisionDocument = () => {
    const renderSection = (title: string, items: TranslationGlossaryDecision[]) => [
      `## ${title}`,
      '',
      items.length ? items.map(decision => {
        const metadata = decision.semanticMetadata;
        const references = decision.occurrences.map(occurrence => `p. ${occurrence.pageNumber} · ${occurrence.proposalTitle} (${occurrence.reviewKey})`);
        return [
          `### ${decision.sourceTerm} → ${decision.targetTerm}`,
          '',
          `- Estado: ${glossaryStatusLabels[decision.decisionStatus]}`,
          `- Tipo/categoria: ${metadata?.decisionType ? glossaryTypeLabels[metadata.decisionType] : 'Terminologia'} / ${metadata?.category ? glossaryCategoryLabels[metadata.category] : 'Sem classificação'}`,
          ...(metadata?.context ? [`- Contexto: ${metadata.context}`] : []),
          ...(metadata?.alternatives?.length ? [`- Alternativas: ${metadata.alternatives.join('; ')}`] : []),
          ...(metadata?.distinctFrom?.length ? [`- Distinto de: ${metadata.distinctFrom.map(relation => `${relation.sourceTerm}${relation.preferredForm ? ` → ${relation.preferredForm}` : ''}${relation.note ? ` (${relation.note})` : ''}`).join('; ')}`] : []),
          ...(metadata?.evidence?.length ? [`- Evidências: ${metadata.evidence.join('; ')}`] : []),
          ...(metadata?.reconciliationStatus === 'needs_review' ? [`- Reconciliação pendente: ${metadata.reconciliationNote ?? 'revisar'}`] : []),
          `- Decisão registrada: ${decision.decidedAt ?? decision.updatedAt ?? decision.createdAt ?? 'data indisponível'}`,
          `- Ocorrências vinculadas: ${references.length ? references.join('; ') : 'nenhuma no catálogo atual'}`,
          ...decision.occurrences.slice(0, 3).flatMap(occurrence => [
            '',
            `**EN (p. ${occurrence.pageNumber}):** ${occurrence.sourceText}`,
            `**PT-BR:** ${occurrence.proposalText}`,
          ]),
        ].join('\n');
      }).join('\n\n') : '_Nenhuma decisão registrada._',
      '',
    ];
    const document = [
      '# Middara — registro de decisões terminológicas',
      '',
      `Exportado em ${new Date().toISOString()}. Este documento prova decisões humanas registradas na central; não publica traduções.`,
      '',
      ...Object.entries(glossaryStatusLabels).flatMap(([status, label]) => renderSection(label, glossaryDecisions.filter(decision => decision.decisionStatus === status))),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([document], { type: 'text/markdown;charset=utf-8' }));
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `middara-glossario-decisoes-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!open) return null;

  return (
    <aside className="translation-review-panel" aria-label="Revisão das traduções PT-BR">
      <header className="translation-review-header">
        <div>
          <p className="translation-review-eyebrow">REVISÃO PT-BR</p>
          <h2>Propostas e exceções</h2>
        </div>
        <button type="button" className="translation-review-close" onClick={onClose} aria-label="Fechar revisão" title="Fechar revisão">
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <p className="translation-review-notice">
        Propostas ficam em revisão. Aprovar grava e confirma a unidade no PT-BR; edições posteriores abrem uma nova revisão.
      </p>

      <div className="translation-review-tabs" role="tablist" aria-label="Conteúdo de revisão">
        <button type="button" role="tab" aria-selected={tab === 'proposals'} className={tab === 'proposals' ? 'active' : ''} onClick={() => { if (tab === 'approved') onClearSelection(); setTab('proposals'); setShowArchived(false); setSelectedExceptionId(null); }}>
          Propostas <span>{catalog ? proposalRemainingCount : '…'}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'exceptions'} className={tab === 'exceptions' ? 'active' : ''} onClick={() => { if (tab === 'approved') onClearSelection(); setTab('exceptions'); }}>
          Exceções <span>{catalog?.exceptionCount ?? '…'}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'active' : ''} onClick={() => { if (tab === 'approved') onClearSelection(); setTab('requests'); setPageFilter('all'); setSelectedExceptionId(null); }}>
          Pedidos de Revisão <span>{activeRequestCount}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'approved'} className={tab === 'approved' ? 'active' : ''} onClick={() => { setTab('approved'); setSelectedExceptionId(null); }}>
          Aprovados <span>{approvedCandidates.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'glossary'} className={tab === 'glossary' ? 'active' : ''} onClick={() => { setTab('glossary'); setSelectedExceptionId(null); }}>
          Glossário <span>{glossaryDecisions.length}</span>
        </button>
      </div>

      {tab !== 'glossary' && <div className="translation-review-page-filter">
        <label htmlFor="translation-review-page">Página</label>
        <select id="translation-review-page" value={pageFilter} onChange={event => setPageFilter(event.target.value)}>
          <option value="current">Página atual{pageNumbers.includes(selectedPage) ? ` · ${selectedPage}` : ''}</option>
          <option value="all">Todas</option>
          {pageNumbers.map(page => <option key={page} value={page}>p. {page}</option>)}
        </select>
        {tab === 'proposals' && (
          <button
            type="button"
            className={`translation-review-archive-toggle ${showArchived ? 'active' : ''}`}
            aria-pressed={showArchived}
            onClick={() => { setShowArchived(value => !value); setArchiveError(null); setArchiveNotice(null); }}
          >
            {showArchived ? 'Voltar à fila' : 'Arquivadas'} <span>{visibleArchivedCandidates.length}</span>
          </button>
        )}
      </div>}

      {catalogError && <p className="translation-review-error" role="alert">{catalogError}</p>}
      {persistenceError && <p className="translation-review-error" role="status">Revisões persistentes indisponíveis: {persistenceError}</p>}
      {!persistenceError && !persistenceAvailable && <p className="translation-review-status">Conectando ao armazenamento de revisão…</p>}
      {archiveError && <p className="translation-review-error" role="alert">{archiveError}</p>}
      {archiveNotice && <p className="translation-review-status" role="status">{archiveNotice}</p>}

      <div className={`translation-review-layout ${tab === 'glossary' ? 'is-glossary' : ''}`}>
        {tab === 'glossary' ? (
          <section className="translation-review-glossary-browser" role="tabpanel" aria-label="Glossário semântico">
            <div className="translation-review-glossary-heading">
              <div>
                <p className="translation-review-eyebrow">DECISÕES LINGUÍSTICAS · PAYLOAD</p>
                <h3>Glossário semântico</h3>
                <p>Consulta os registros persistidos. As decisões orientam traduções futuras e não alteram páginas automaticamente.</p>
              </div>
              <div className="translation-review-glossary-exports">
                <button type="button" onClick={exportGlossaryJSON}>Exportar JSON</button>
                <button type="button" onClick={exportGlossaryCSV}>Exportar CSV</button>
                <button type="button" onClick={exportGlossaryDecisionDocument}>Exportar Markdown</button>
              </div>
            </div>
            <div className="translation-review-glossary-filters">
              <label>Buscar termos, contexto ou evidência
                <input type="search" value={glossarySearch} onChange={event => setGlossarySearch(event.target.value)} placeholder="Ex.: Crawl Book, componente, p. 24…" />
              </label>
              <label>Tipo
                <select value={glossaryTypeFilter} onChange={event => setGlossaryTypeFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {Object.entries(glossaryTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Categoria
                <select value={glossaryCategoryFilter} onChange={event => setGlossaryCategoryFilter(event.target.value)}>
                  <option value="all">Todas</option>
                  {Object.entries(glossaryCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Status
                <select value={glossaryStatusFilter} onChange={event => setGlossaryStatusFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {Object.entries(glossaryStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <p className="translation-review-glossary-count" aria-live="polite">Exibindo {visibleGlossaryDecisions.length} de {glossaryDecisions.length} decisões.</p>
            <ul className="translation-review-glossary-list">
              {visibleGlossaryDecisions.map(decision => {
                const metadata = decision.semanticMetadata;
                const category = metadata?.category ?? 'unclassified';
                return (
                  <li key={decision.decisionKey} className={`translation-review-glossary-entry is-${decision.decisionStatus}`}>
                    <div className="translation-review-glossary-entry-title">
                      <div><h4>{decision.sourceTerm} <span aria-hidden="true">→</span> {decision.targetTerm}</h4><small>id {decision.id} · {decision.decisionKey}</small></div>
                      <div className="translation-review-glossary-badges">
                        <span className={`translation-review-badge ${decision.decisionStatus === 'approved' ? 'is-approved' : ''}`}>{glossaryStatusLabels[decision.decisionStatus]}</span>
                        <span className="translation-review-badge">{metadata?.decisionType ? glossaryTypeLabels[metadata.decisionType] : 'Terminologia'}</span>
                        <span className="translation-review-badge">{glossaryCategoryLabels[category]}</span>
                      </div>
                    </div>
                    {metadata?.reconciliationStatus === 'needs_review' && <p className="translation-review-glossary-conflict" role="note">Precisa de reconciliação: {metadata.reconciliationNote || 'revisar contra as decisões existentes.'}</p>}
                    {metadata?.context && <p><strong>Contexto:</strong> {metadata.context}</p>}
                    {metadata?.subtype && <p><strong>Subtipo:</strong> {metadata.subtype}</p>}
                    {metadata?.alternatives?.length ? <p><strong>Alternativas:</strong> {metadata.alternatives.join(' · ')}</p> : null}
                    {metadata?.rejectedForms?.length ? <p><strong>Formas rejeitadas:</strong> {metadata.rejectedForms.join(' · ')}</p> : null}
                    {metadata?.distinctFrom?.length ? <p><strong>Distinto de:</strong> {metadata.distinctFrom.map(relation => `${relation.sourceTerm}${relation.preferredForm ? ` → ${relation.preferredForm}` : ''}${relation.note ? ` — ${relation.note}` : ''}`).join('; ')}</p> : null}
                    {metadata?.printedIdentifierPolicy && <p><strong>Identificador impresso:</strong> {metadata.printedIdentifierPolicy}</p>}
                    {metadata?.evidence?.length ? <p><strong>Evidência:</strong> {metadata.evidence.join(' · ')}</p> : null}
                    {metadata?.examples?.length ? <ul className="translation-review-glossary-examples">{metadata.examples.map((example, index) => <li key={`${decision.decisionKey}-example-${index}`}><span>EN: {example.sourceText}</span><span>PT-BR: {example.targetText}</span>{example.pageNumber && <small>p. {example.pageNumber}</small>}{example.note && <small>{example.note}</small>}</li>)}</ul> : null}
                    {metadata?.humanLocked && <small>Protegida por decisão humana · v{metadata.version ?? 1}</small>}
                    {decision.decisionNote && <p><strong>Nota:</strong> {decision.decisionNote}</p>}
                    <small>{decision.occurrences.length} ocorrência(s) vinculada(s) · atualizado em {decision.updatedAt ? new Date(decision.updatedAt).toLocaleDateString('pt-BR') : 'data indisponível'}</small>
                  </li>
                );
              })}
              {!visibleGlossaryDecisions.length && <li className="translation-review-empty">Nenhuma decisão corresponde a esses filtros.</li>}
            </ul>
          </section>
        ) : (
          <>
        <div className="translation-review-list" role="tabpanel" aria-label={tab === 'proposals' ? showArchived ? 'Unidades arquivadas da revisão' : 'Unidades propostas' : tab === 'exceptions' ? 'Fila de exceções' : tab === 'approved' ? 'Unidades integradas ao livro' : 'Fila de pedidos de revisão'}>
          {tab === 'approved' ? visibleApproved.map(candidate => {
            const active = selectedReviewKey === candidate.reviewKey;
            return (
              <button
                type="button"
                key={`approved-${candidate.reviewKey}`}
                data-review-key={candidate.reviewKey}
                className={`translation-review-row ${active ? 'is-selected' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  setSelectedExceptionId(null);
                  if (onOpenApprovedViewer) onOpenApprovedViewer(candidate);
                  else onSelectCandidate(candidate);
                }}
              >
                <span className="translation-review-row-heading">p. {candidate.pageNumber} · {candidateHeading(candidate)}</span>
                <span className="translation-review-row-meta">
                  <span className="translation-review-badge is-approved">Integrada ao PT-BR</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </span>
              </button>
            );
          }) : tab === 'proposals' ? (showArchived ? visibleArchivedCandidates : visibleCandidates).map(candidate => {
            const record = reviewRecordForCandidate(records, candidate);
            const active = selectedReviewKey === candidate.reviewKey;
            return (
              <div className="translation-review-row-wrap" key={candidate.reviewKey} data-review-key={candidate.reviewKey}>
                <button
                  type="button"
                  data-review-key={candidate.reviewKey}
                  className={`translation-review-row ${active ? 'is-selected' : ''}`}
                  aria-pressed={active}
                  onClick={() => { setSelectedExceptionId(null); onSelectCandidate(candidate); }}
                >
                  <span className="translation-review-row-heading">p. {candidate.pageNumber} · {candidateHeading(candidate)}</span>
                  <span className="translation-review-row-meta">
                    {candidate.diagnosticBlank && <span className="translation-review-badge is-blank">Vazio no diagnóstico</span>}
                    {showArchived
                      ? <span className="translation-review-badge is-archived">Arquivada</span>
                      : <span className={`translation-review-badge ${record?.approvalStatus === 'approved' ? 'is-approved' : ''}`}>
                        {record?.approvalStatus === 'approved' ? 'Aprovada' : 'Pendente'}
                      </span>}
                    <ChevronRight size={14} aria-hidden="true" />
                  </span>
                </button>
                <button
                  type="button"
                  className="translation-review-row-action"
                  aria-label={showArchived ? `Restaurar p. ${candidate.pageNumber} na fila` : `Arquivar p. ${candidate.pageNumber} da revisão`}
                  title={showArchived ? 'Restaurar na fila' : 'Arquivar da revisão'}
                  disabled={!persistenceAvailable || busyReviewKey !== null || hasUnsavedDraft || record?.approvalStatus === 'approved'}
                  onClick={() => void setCandidateArchived(candidate, !showArchived)}
                >
                  {showArchived ? <RotateCcw size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
                </button>
              </div>
            );
          }) : tab === 'exceptions' ? visibleExceptions.map(exception => {
            const active = selectedExceptionId === exception.id;
            return (
              <button
                type="button"
                key={`${exception.id}-${exception.pageNumber}`}
                className={`translation-review-row ${active ? 'is-selected' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  setSelectedExceptionId(exception.id);
                  const linked = allCandidates.find(candidate => candidate.reviewKey === exception.reviewKey);
                  if (linked) onSelectCandidate(linked);
                }}
              >
                <span className="translation-review-row-heading">p. {exception.pageNumber} · {exception.reason || exception.category.replaceAll('_', ' ')}</span>
                <span className="translation-review-row-meta">
                  {exception.diagnosticBlank && <span className="translation-review-badge is-blank">Região vazia</span>}
                  <span className="translation-review-badge">{exception.status.replaceAll('_', ' ')}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </span>
              </button>
            );
          }) : visibleRequests.map((request, index) => {
            const active = String(request.id) === selectedRequestId;
            const pendingPosition = request.status === 'completed' ? null
              : visibleRequests.slice(0, index + 1).filter(item => item.status !== 'completed').length;
            return (
              <button
                type="button"
                key={request.id}
                className={`translation-review-row ${active ? 'is-selected' : ''}`}
                aria-pressed={active}
                onClick={() => { setSelectedRequestId(String(request.id)); setRequestResultDraft(request.resultNote ?? ''); setRequestStatus(null); setRequestError(null); }}
              >
                <span className="translation-review-row-heading">{pendingPosition ? `#${pendingPosition} · ` : ''}p. {request.pageNumber} · {request.referenceTitle}</span>
                <span className="translation-review-row-meta">
                  <span className={`translation-review-badge ${request.status === 'completed' ? 'is-complete' : 'is-queued'}`}>{requestStatusLabel(request.status)}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </span>
              </button>
            );
          })}
          {tab === 'proposals' && showArchived && !visibleArchivedCandidates.length && !catalogError && <p className="translation-review-empty">Não há unidades arquivadas nesta página.</p>}
          {tab === 'proposals' && !showArchived && !visibleCandidates.length && !catalogError && <p className="translation-review-empty">Não há propostas nesta página.</p>}
          {tab === 'approved' && !visibleApproved.length && !catalogError && <p className="translation-review-empty">Não há unidades publicadas nesta página.</p>}
          {tab === 'exceptions' && !visibleExceptions.length && !catalogError && <p className="translation-review-empty">Não há exceções nesta página.</p>}
          {tab === 'requests' && !visibleRequests.length && <p className="translation-review-empty">Ainda não há pedidos de revisão nesta fila.</p>}
        </div>

        <section className="translation-review-detail" aria-label="Comparação e ações de revisão">
          {tab === 'requests' && selectedRequest ? (
            <>
              <div className="translation-review-detail-heading">
                <p className="translation-review-eyebrow">PEDIDO DE REVISÃO · p. {selectedRequest.pageNumber}</p>
                <h3>{selectedRequest.referenceTitle}</h3>
              </div>
              {queuePosition && <p className="translation-review-queue-position">Posição {queuePosition}: pedidos desta fila são tratados antes do próximo lote normal, em ordem de entrada.</p>}
              <section className="translation-review-request-copy"><h4>Instrução do usuário</h4><p>{selectedRequest.requestText}</p></section>
              {selectedRequest.requestContext?.sourceText && <section className="translation-review-exception-text"><h4>EN · contexto</h4><p>{String(selectedRequest.requestContext.sourceText)}</p></section>}
              {selectedRequest.requestContext?.proposalText && <section className="translation-review-exception-text"><h4>PT-BR · proposta atual</h4><p>{String(selectedRequest.requestContext.proposalText)}</p></section>}
              {selectedRequest.resultNote && <section className="translation-review-request-result"><h4>Resultado registrado</h4><p>{selectedRequest.resultNote}</p></section>}
              <p className="translation-review-status">Estado: {requestStatusLabel(selectedRequest.status)}</p>
              {(selectedRequest.status === 'in_progress' || (selectedRequest.status === 'completed' && selectedRequest.completedBy === 'ai') || legacyUserApprovalConfirmation) && (
                <label className="translation-review-request-field">
                  {legacyUserApprovalConfirmation ? 'Confirme o resultado humano já concluído' : selectedRequest.completedBy === 'ai' ? 'Resultado do ajuste humano / aprovação' : 'Resultado do ajuste'}
                  <textarea value={requestResultDraft} onChange={event => setRequestResultDraft(event.target.value)} maxLength={2000} rows={3} />
                </label>
              )}
              {(selectedRequest.status === 'in_progress' || (selectedRequest.status === 'completed' && selectedRequest.completedBy === 'ai') || legacyUserApprovalConfirmation) && selectedRequestCandidate && <p className="translation-review-request-result">A confirmação verifica o PT-BR já salvo e registra a aprovação. Ela não regrava a tradução nem altera o quadro existente; se a verificação falhar, o pedido permanece disponível.</p>}
              {selectedRequest.status === 'in_progress' && <p className="translation-review-queue-position">Depois que a IA ajustar a proposta, registre aqui o que mudou. O retorno aparecerá em Propostas e ainda precisará da sua aprovação.</p>}
              {requestStatus && <p className="translation-review-status" role="status">{requestStatus}</p>}
              {requestError && <p className="translation-review-error" role="alert">{requestError}</p>}
              <div className="translation-review-actions">
                {selectedRequest.status === 'pending' && <button type="button" disabled={!persistenceAvailable || requestBusy} onClick={() => void updateAIRequest(selectedRequest, 'in_progress')}>Começar a resolver</button>}
                {(selectedRequest.status === 'in_progress' || (selectedRequest.status === 'completed' && selectedRequest.completedBy === 'ai')) && selectedRequestCandidate && <button type="button" disabled={!persistenceAvailable || requestBusy} onClick={() => onOpenEditor(selectedRequestCandidate)}>Abrir unidade no Rich Block Editor</button>}
                {selectedRequest.status === 'in_progress' && <button type="button" className="is-approve" disabled={!persistenceAvailable || requestBusy || !requestResultDraft.trim()} onClick={() => void updateAIRequest(selectedRequest, 'completed')}>Registrar retorno da IA</button>}
                {(selectedRequest.status === 'in_progress' || (selectedRequest.status === 'completed' && selectedRequest.completedBy === 'ai')) && selectedRequestCandidate && <button type="button" className="is-approve" disabled={!persistenceAvailable || requestBusy || !requestResultDraft.trim()} onClick={() => void completeAIRequestAsUser(selectedRequest)}>Concluir como usuário e aprovar</button>}
                {legacyUserApprovalConfirmation && <button type="button" className="is-approve" disabled={!persistenceAvailable || requestBusy || !requestResultDraft.trim()} onClick={() => void completeAIRequestAsUser(selectedRequest)}>Confirmar em Aprovados</button>}
                {selectedRequest.status === 'completed' && !legacyUserApprovalConfirmation && <p className="translation-review-status">{selectedRequestAlreadyApproved ? 'Aprovação confirmada no livro · unidade disponível em Aprovados.' : selectedRequest.completedBy === 'user' ? 'Concluído por você · aprovação confirmada no livro.' : selectedRequest.completedBy === 'ai' ? 'Atendimento concluído pela IA · a aprovação editorial continua separada.' : 'Pedido concluído.'}</p>}
              </div>
            </>
          ) : tab === 'requests' ? (
            <>
              <div className="translation-review-detail-heading">
                <p className="translation-review-eyebrow">NOVO PEDIDO DE REVISÃO</p>
                <h3>{requestTarget.referenceTitle}</h3>
              </div>
              <p className="translation-review-queue-position">A fila é atendida em ordem de entrada antes do próximo lote normal. Quando a IA concluir, a versão volta a Propostas com o comentário; a aprovação continua sendo sua.</p>
              <label className="translation-review-request-field">
                O que precisa de revisão?
                <textarea value={requestDraft} onChange={event => setRequestDraft(event.target.value)} placeholder="Descreva o ajuste que você quer que a IA investigue…" maxLength={4000} rows={7} />
              </label>
              <p className="translation-review-request-counter">{requestDraft.length}/4000</p>
              {requestStatus && <p className="translation-review-status" role="status">{requestStatus}</p>}
              {requestError && <p className="translation-review-error" role="alert">{requestError}</p>}
              <div className="translation-review-actions">
                <button type="button" onClick={() => startAIRequest(pageRequestTarget(selectedPage))}>Novo pedido para a página atual</button>
                <button type="button" className="is-approve" disabled={!persistenceAvailable || requestBusy || !requestDraft.trim()} onClick={() => void submitAIRequest()}>{requestBusy ? 'Salvando…' : 'Adicionar à fila'}</button>
              </div>
            </>
          ) : selectedCandidate ? (
            <>
              <div className="translation-review-detail-heading">
                <p className="translation-review-eyebrow">p. {selectedCandidate.pageNumber} · {selectedCandidate.proposalTitle} · v{selectedCandidate.proposalVersion}</p>
                <h3>{candidateHeading(selectedCandidate)}</h3>
              </div>
              {tab === 'proposals' && selectedIsArchived && <p className="translation-review-queue-position">Arquivada da fila. O conteúdo desta unidade no livro foi preservado; você pode restaurá-la abaixo.</p>}
              <div className="translation-review-comparison">
                <section>
                  <h4>EN · texto-fonte</h4>
                  <TypographicPreview
                    segments={selectedCandidate.sourceSegments}
                    fallbackText={selectedCandidate.sourceText}
                    language="en"
                    emptyMessage="Texto-fonte não registrado nesta unidade."
                  />
                </section>
                <section>
                  <h4>PT-BR · {tab === 'approved' ? 'integrado ao livro' : 'proposta'}</h4>
                  <TypographicPreview
                    segments={segmentsForReviewData(selectedCandidate.data)}
                    fallbackText={selectedCandidate.proposalText}
                    language="pt-BR"
                    emptyMessage="A unidade não tem texto simples; os segmentos ricos permanecem disponíveis no Editor."
                  />
                </section>
                {selectedRecord && (selectedText !== selectedCandidate.proposalText || selectedRecordFromEarlierProposal
                  || (tab === 'approved' && !!selectedRecord.publication && !translationDataMatches(selectedRecord.data, selectedRecord.publication.data))) && (
                  <section className="translation-review-edited-text">
                    <h4>PT-BR · {tab === 'approved' ? 'nova revisão em rascunho' : selectedRecord.approvalStatus === 'approved' ? 'decisão humana salva' : 'rascunho salvo'}</h4>
                    {selectedRecordFromEarlierProposal && (
                      <p className="translation-review-priority-note">
                        Revisão da proposta {selectedRecord.proposalVersion} preservada e prioritária. A proposta atual é {selectedCandidate.proposalVersion}; a validação técnica exibida pertence à revisão salva.
                      </p>
                    )}
                    <TypographicPreview
                      segments={segmentsForReviewData(selectedRecord.data)}
                      fallbackText={selectedText}
                      language="pt-BR"
                    />
                  </section>
                )}
                {humanText && tab !== 'approved' && (
                  <section className="translation-review-human-text">
                    <h4>Tradução humana salva · preservada</h4>
                    <p>{humanText}</p>
                  </section>
                )}
              </div>
              {latestAIRevisionRequest?.resultNote && <section className="translation-review-request-result"><h4>Retorno do pedido de revisão · aguardando sua aprovação</h4><p>{latestAIRevisionRequest.resultNote}</p></section>}

              <dl className="translation-review-states">
                <div><dt>Validação técnica</dt><dd>{technicalLabel(selectedRecord?.technicalStatus ?? selectedCandidate.technicalStatus)}{selectedRecordFromEarlierProposal ? ` · v${selectedRecord?.proposalVersion}` : ''}</dd></div>
                <div><dt>Aprovação editorial</dt><dd>{tab === 'approved'
                  ? selectedRecord?.approvalStatus === 'pending'
                    ? selectedIsArchived ? 'Versão anterior integrada · nova revisão arquivada' : 'Versão anterior integrada · nova revisão pendente'
                    : 'Aprovada e integrada ao livro'
                  : selectedIsArchived ? 'Arquivada da revisão'
                    : selectedRecord?.approvalStatus === 'approved' ? 'Aprovada e integrada ao livro' : 'Pendente'}</dd></div>
              </dl>
              <section className="translation-review-copyfit" aria-label="Medição Copyfit V3">
                <h4>Medição Copyfit V3</h4>
                <dl>
                  <div><dt>PDF-fonte</dt><dd>{copyfitSourceLineCount ? `${copyfitSourceLineCount} ${copyfitSourceLineCount === 1 ? 'linha' : 'linhas'}` : 'Não medido'}</dd></div>
                  <div><dt>Viewer PT-BR</dt><dd>{copyfitViewerLineCount ? `${copyfitViewerLineCount} ${copyfitViewerLineCount === 1 ? 'linha' : 'linhas'}` : 'Não medido'}</dd></div>
                  <div className="translation-review-copyfit-result"><dt>Resultado</dt><dd>{copyfitClassification ?? 'Não classificado'}</dd></div>
                </dl>
              </section>
              {visiblePendingTerms.length > 0 && (
                <details className="translation-review-pending" open>
                  <summary>Pendências para revisão <span>{visiblePendingTerms.length}</span></summary>
                  <ul>
                    {visiblePendingTerms.map(row => (
                      <li key={`${selectedCandidate.reviewKey}-pending-${row.key}`} className={row.kind === 'term' ? 'translation-review-term-row' : undefined}>
                        {row.kind === 'note' ? row.note : (
                          <>
                            <span><strong>{row.sourceTerm} → {row.targetTerm}</strong></span>
                            {row.contextNote && <small>{row.contextNote}</small>}
                            {row.conflictingTarget && <small>Glossário já aprovado: {row.conflictingTarget}. Esta forma permanece pendente.</small>}
                            <span className="translation-review-term-actions">
                              <button type="button" title={`Rejeitar ${row.sourceTerm} → ${row.targetTerm}`} aria-label={`Rejeitar ${row.sourceTerm} → ${row.targetTerm}`} disabled={!persistenceAvailable || glossaryBusyKey !== null} onClick={() => void decideGlossaryTerm(row.sourceTerm, row.targetTerm, 'rejected')}><X size={13} aria-hidden="true" /></button>
                              <button type="button" className="is-approve" title={`Adicionar ${row.targetTerm} ao glossário`} aria-label={`Aprovar ${row.sourceTerm} → ${row.targetTerm} no glossário`} disabled={!persistenceAvailable || !!row.conflictingTarget || glossaryBusyKey !== null} onClick={() => void decideGlossaryTerm(row.sourceTerm, row.targetTerm, 'approved')}><Check size={13} aria-hidden="true" /></button>
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {selectedCandidate.pendingTerms.length > 0 && visiblePendingTerms.length === 0 && <p className="translation-review-glossary-resolved">Os termos explícitos desta unidade já têm decisão registrada no glossário.</p>}
              {glossaryError && <p className="translation-review-error" role="alert">{glossaryError}</p>}
              <div className="translation-review-actions">
                <button type="button" onClick={exportGlossaryDecisionDocument}><FileDown size={14} aria-hidden="true" /> Exportar documento de decisões · {glossaryDecisions.length}</button>
              </div>
              {glossaryDecisions.length > 0 && (
                <details className="translation-review-glossary-record">
                  <summary>Glossário complementar · {glossaryDecisions.filter(decision => decision.decisionStatus === 'approved').length} aprovados · {glossaryDecisions.filter(decision => decision.decisionStatus === 'rejected').length} rejeitados</summary>
                  <ul>
                    {[...glossaryDecisions].sort((left, right) => left.sourceTerm.localeCompare(right.sourceTerm, 'pt-BR')).map(decision => (
                      <li key={decision.decisionKey} className={decision.decisionStatus === 'approved' ? 'is-approved' : 'is-rejected'}>
                        <span>{decision.sourceTerm} → {decision.targetTerm}</span>
                        <small>{decision.decisionStatus === 'approved' ? 'Aprovado' : 'Rejeitado'} · {decision.occurrences.length} ocorrência(s) vinculada(s)</small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {selectedCandidate.diagnosticBlank && (
                <div className="translation-review-blank-note" role="status">
                  <strong>Vazia somente no diagnóstico do Viewer.</strong>
                  <span>{selectedCandidate.diagnosticBlank.reason}</span>
                  <span>O texto PT-BR integral permanece acima e na proposta original.</span>
                </div>
              )}
              {reviewStatus && <p className={`translation-review-status ${reviewStatus.startsWith('Erro ao aprovar.') ? 'is-error' : ''}`} role={reviewStatus.startsWith('Erro ao aprovar.') ? 'alert' : 'status'}>{reviewStatus}</p>}
              {hasUnsavedDraft && <p className="translation-review-status is-warning" role="status">Salve ou descarte as alterações no Editor antes de aprovar esta unidade.</p>}
              {copyfitBlockReason === 'OVER' && <p className="translation-review-error" role="alert">Copyfit V3: OVER — esta versão tem mais linhas visuais que o PDF-fonte e não pode ser aprovada. Ajuste a proposta e valide a nova versão.</p>}
              {copyfitBlockReason === 'MEASUREMENT_MISMATCH' && <p className="translation-review-error" role="alert">A classificação Copyfit V3 não corresponde às contagens de linhas registradas. Atualize a medição antes de aprovar.</p>}
              {copyfitBlockReason === 'UNDER_WITHOUT_COMPOSITION_RATIONALE' && <p className="translation-review-error" role="alert">Copyfit V3: UNDER — registre uma justificativa explícita de composição antes de aprovar esta versão.</p>}
              {copyfitBlockReason === 'UNMEASURED' && <p className="translation-review-error" role="alert">Copyfit V3 ainda não mediu as linhas visuais do PDF-fonte e do PageRenderer para esta unidade. A aprovação permanece bloqueada.</p>}
              {copyfitBlockReason === 'STALE_MEASUREMENT' && <p className="translation-review-error" role="alert">A proposta, o texto ou a geometria mudou depois da medição. A contagem anterior não vale para esta versão; valide novamente antes de aprovar.</p>}
              {copyfitBlockReason === 'TECHNICAL_FAILURE' && <p className="translation-review-error" role="alert">A validação técnica desta proposta está bloqueada. Corrija a falha registrada antes de aprovar.</p>}

              <div className="translation-review-actions">
                <div className="translation-review-lang-toggle" role="group" aria-label="Alternar idioma">
                  <button
                    type="button"
                    className={`translation-review-lang-btn ${language === 'en' ? 'is-active' : ''}`}
                    onClick={() => onToggleLanguage?.('en')}
                    title="Visualizar original EN/US"
                  >
                    EN/US
                  </button>
                  <span className="translation-review-lang-divider">↔</span>
                  <button
                    type="button"
                    className={`translation-review-lang-btn ${language === 'pt-BR' ? 'is-active' : ''}`}
                    onClick={() => onToggleLanguage?.('pt-BR')}
                    title="Visualizar tradução PT/BR"
                  >
                    PT/BR
                  </button>
                </div>
                <button type="button" onClick={() => onOpenEditor(selectedCandidate)}>
                  {tab === 'approved' ? 'Editar em nova revisão no Rich Block Editor' : 'Abrir no Rich Block Editor'}
                </button>
                <button type="button" onClick={() => startAIRequest(targetForCandidate(selectedCandidate, pageData?.page_number === selectedCandidate.pageNumber ? pageData : null))}>Pedir revisão</button>
                {tab === 'proposals' && (
                  <button type="button" className="is-secondary" disabled={!persistenceAvailable || busyReviewKey !== null || hasUnsavedDraft || (!selectedIsArchived && selectedRecord?.approvalStatus === 'approved')} onClick={() => void setCandidateArchived(selectedCandidate, !selectedIsArchived)}>
                    {selectedIsArchived ? <RotateCcw size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
                    {selectedIsArchived ? 'Restaurar na fila' : 'Arquivar da revisão'}
                  </button>
                )}
                {tab === 'approved' || selectedIsArchived ? null : selectedRecord?.approvalStatus === 'approved' ? (
                  <button type="button" className="is-secondary" disabled={!persistenceAvailable || isBusy || hasUnsavedDraft} onClick={() => onReopen(selectedCandidate)}>
                    Reabrir revisão
                  </button>
                ) : (
                  <button type="button" className="is-approve" disabled={!persistenceAvailable || isBusy || hasUnsavedDraft || copyfitBlockReason !== null} onClick={() => void approveCandidate(selectedCandidate)}>
                    <Check size={15} aria-hidden="true" /> Aprovar unidade
                  </button>
                )}
              </div>
              <p className="translation-review-no-publish">A publicação só ocorre após confirmação no Payload. Validação técnica e aprovação editorial continuam separadas; edições criam uma nova revisão e preservam a versão integrada.</p>
            </>
          ) : selectedException ? (
            <>
              <div className="translation-review-detail-heading">
                <p className="translation-review-eyebrow">EXCEÇÃO · p. {selectedException.pageNumber}</p>
                <h3>{selectedException.category.replaceAll('_', ' ')}</h3>
              </div>
              <p className="translation-review-exception-reason">{selectedException.reason || 'Sem descrição adicional.'}</p>
              {selectedException.diagnosticRendering && <p className="translation-review-diagnostic-copy">Diagnóstico: {selectedException.diagnosticRendering}</p>}
              {selectedException.sourceText && <section className="translation-review-exception-text"><h4>EN · texto-fonte</h4><p>{selectedException.sourceText}</p></section>}
              {selectedException.proposedText && <section className="translation-review-exception-text"><h4>PT-BR · tradução preservada</h4><p>{selectedException.proposedText}</p></section>}
              {selectedException.evidence.length > 0 && <details className="translation-review-evidence"><summary>Evidências</summary><ul>{selectedException.evidence.map(item => <li key={item}>{item}</li>)}</ul></details>}
              {selectedException.diagnosticBlank && <p className="translation-review-blank-note"><strong>O Viewer mostra esta região vazia na prévia diagnóstica.</strong> O texto acima continua preservado para revisão.</p>}
              <div className="translation-review-actions">
                <button type="button" onClick={() => onOpenExceptionPage(selectedException)}>Abrir página no Viewer</button>
                {selectedExceptionCandidate && <button type="button" onClick={() => onOpenEditor(selectedExceptionCandidate)}>Editar a proposta no Editor</button>}
                <button type="button" onClick={() => startAIRequest(targetForException(selectedException, selectedExceptionCandidate, pageData?.page_number === selectedException.pageNumber ? pageData : null))}>Pedir revisão</button>
              </div>
            </>
          ) : (
            <>
              {reviewStatus && <p className={`translation-review-status ${reviewStatus.startsWith('Erro ao aprovar.') ? 'is-error' : ''}`} role="status">{reviewStatus}</p>}
              <p className="translation-review-empty">Selecione uma proposta ou exceção para comparar e revisar.</p>
            </>
          )}
        </section>
          </>
        )}
      </div>
    </aside>
  );
}
