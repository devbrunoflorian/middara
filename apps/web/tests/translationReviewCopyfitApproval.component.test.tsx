import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, getQueriesForElement } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';
import { candidateRequiresDiagnosticBlank, copyfitApprovalBlockReason, copyfitCanonicalEvidenceBlockReason, copyfitMeasurementDataMatches, exceptionRequiresDiagnosticBlank, hasUnapprovedPublishedRevisionDraft, isCurrentActivePendingReviewDraft, layoutFrameForReviewOverride, normalizeGlossarySearchText, normalizeGlossaryTerm, persistTranslationReview, persistTranslationReviewApproval, rendererKeyForReviewCandidate, reviewRequestMatchesUnit, spanOverrideForReviewCandidate, type TranslationReviewCandidate, unresolvedReviewExceptions } from '../src/translationReview';
import { TranslationReviewPanel } from '../src/components/TranslationReviewPanel';
import type { PageData } from '../src/components/PageRenderer';
import { decodeOverrideData, encodeOverrideData } from '../src/symbols/overrideData';
import { hasLegacyTypographicUnitOverride } from '../src/editorUnitCompatibility';
import translationReviewCatalog from '../public/translation-review/catalog.json';
import { resolveCanonicalCopyfitEvidence } from '../../admin/src/endpoints/approveTranslationReview';

describe('translation review proposal geometry', () => {
  it('uses the measured canonical unit box when proposal data inherits its source geometry', () => {
    const unitKey = 'page_19_unit_p19-block-21-paragraph-3__pt-BR';
    const canonicalBbox: [number, number, number, number] = [418.67, 279.4, 739.5, 347.2];
    const candidate: TranslationReviewCandidate = {
      reviewKey: `p19-test@1::${unitKey}`,
      pageNumber: 19,
      proposalId: 'p19-test',
      proposalVersion: '1',
      proposalTitle: 'Page 19 test',
      proposalFile: 'p19-test.json',
      index: 0,
      spanKey: unitKey,
      blockIndex: 3,
      sourceBlockId: 'block_21',
      sourceUnitId: null,
      sourceText: 'Source',
      proposalText: 'Translation',
      data: { schemaVersion: 2, segments: [{ text: 'Translation', font: 'Test', size: 10 }] },
      technicalStatus: 'fit-awaiting-human-review',
      copyfitClassification: 'EXACT',
      copyfitSourcePdfLineCount: 6,
      copyfitPageRendererLineCount: 6,
      copyfitMeasurementFingerprint: 'canonical-measurement',
      copyfitCanonicalSpanKey: unitKey,
      copyfitCanonicalBbox: canonicalBbox,
      editorialStatus: 'pending_human_review',
      diagnosticRendering: 'proposal',
      pendingTerms: [],
      diagnosticBlank: null,
    };
    const pageData = {
      page_number: 19,
      blocks: [{ id: 'block_21', bbox: [400, 210, 750, 420], typographicUnits: [] }],
    } as unknown as PageData;
    const rendererKey = rendererKeyForReviewCandidate(candidate, pageData);
    const override = spanOverrideForReviewCandidate(candidate, rendererKey, candidate.data, pageData);

    expect(rendererKey).toBe(unitKey);
    expect(override?.bbox).toEqual(canonicalBbox);
  });

  it('maps proposal bbox to a viewer frame without changing alignment or line height', () => {
    const frame = layoutFrameForReviewOverride({
      x: 243.724,
      y: 572.84,
      width: 332.498,
      height: 24.264,
      rotation: 0,
      textAlign: 'left',
      lineHeight: 1,
    }, {
      textAlign: 'center',
      lineHeight: 1.1,
    });
    expect(frame).toMatchObject({
      x: 243.724,
      y: 572.84,
      total: 332.498,
      totalHeight: 24.264,
      rotation: 0,
      textAlign: 'center',
      lineHeight: 1.1,
    });
    expect(frame?.width).toBeCloseTo(576.222, 3);
    expect(frame?.height).toBeCloseTo(597.104, 3);
  });

  it('rejects invalid proposal geometry rather than resizing the Viewer', () => {
    expect(layoutFrameForReviewOverride({ x: 10, y: 20, width: 0, height: 10 }, {})).toBeNull();
    expect(layoutFrameForReviewOverride({ x: 0, y: 0, width: Number.NaN, height: 10 }, {})).toBeNull();
    expect(layoutFrameForReviewOverride(null, {})).toBeNull();
  });
});

describe('strict PT-BR diagnostics for preserved legacy span units', () => {
  it('requires a legacy override to cover this semantic unit, not merely another unit in its block', () => {
    const block = {
      typographicUnits: [
        { id: 'heading', field: { lineIds: ['heading-line'] } },
        { id: 'body', field: { lineIds: ['body-line-1', 'body-line-2'] } },
      ],
      typographicSpanUnits: [
        { id: 'legacy-heading', spanRefs: ['heading-line:0'] },
        { id: 'legacy-body', spanRefs: ['body-line-1:0', 'body-line-2:0'] },
      ],
    };
    const savedHeading = (key: string) => key === 'page_4_unit_legacy-heading__pt-BR';
    const savedBody = (key: string) => key === 'page_4_unit_legacy-body__pt-BR';

    expect(hasLegacyTypographicUnitOverride(block, block.typographicUnits[1], 4, 'pt-BR', savedHeading)).toBe(false);
    expect(hasLegacyTypographicUnitOverride(block, block.typographicUnits[1], 4, 'pt-BR', savedBody)).toBe(true);
  });
});

describe('translation review published revision state', () => {
  const published = {
    schemaVersion: 2,
    spanKey: 'page_48_block_0__pt-BR',
    bbox: [10, 20, 200, 40],
    segments: [{ text: 'Encerramento de Ações e Habilidades', font: 'Cinzel-Regular', size: 12 }],
  };
  const editedDraft = {
    ...published,
    segments: [{ text: 'Habilidades que encerram Ações e Habilidades', font: 'Cinzel-Regular', size: 12 }],
  };

  it('keeps the published version in Aprovados while exposing a changed draft in Propostas', () => {
    expect(hasUnapprovedPublishedRevisionDraft({
      approvalStatus: 'pending',
      publication: { translationId: 528, data: published } as any,
      data: editedDraft,
    })).toBe(true);
    expect(hasUnapprovedPublishedRevisionDraft({
      approvalStatus: 'pending',
      publication: { translationId: 528, data: published } as any,
      data: published,
    })).toBe(false);
    expect(hasUnapprovedPublishedRevisionDraft({
      approvalStatus: 'approved',
      publication: { translationId: 528, data: published } as any,
      data: editedDraft,
    })).toBe(false);
  });

  it('opens the published Payload version from Aprovados and clears that Viewer selection on tab exit', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpenApprovedViewer = vi.fn();
    const onSelectCandidate = vi.fn();
    const onClearSelection = vi.fn();
    const candidate = {
      reviewKey: 'page-048-v3::page_48_block_0__pt-BR',
      pageNumber: 48,
      proposalId: 'page-048-v3',
      proposalVersion: 'v3',
      proposalTitle: 'Heading review',
      proposalFile: 'page-048-v3.json',
      index: 0,
      spanKey: 'page_48_block_0__pt-BR',
      blockIndex: 0,
      sourceBlockId: 'page_48_block_0',
      sourceUnitId: null,
      sourceText: 'Abilities that End Actions and Abilities',
      proposalText: 'Encerramento de Ações e Habilidades',
      data: published,
      technicalStatus: 'verified_isolated_viewer_pdf',
      editorialStatus: 'approved',
      diagnosticRendering: '',
      pendingTerms: [],
      diagnosticBlank: null,
    } satisfies TranslationReviewCandidate;
    const record = {
      id: 199,
      reviewKey: candidate.reviewKey,
      pageNumber: 48,
      spanKey: candidate.spanKey,
      proposalId: candidate.proposalId,
      proposalVersion: candidate.proposalVersion,
      sourceText: candidate.sourceText,
      proposalText: candidate.proposalText,
      data: editedDraft,
      technicalStatus: 'changed_since_technical_validation',
      approvalStatus: 'pending',
      publication: { translationId: 528, data: published, publishedAt: '2026-10-23T00:00:00.000Z', history: [] },
    };

    act(() => root.render(<TranslationReviewPanel
      open
      onClose={vi.fn()}
      catalog={{ schemaVersion: 1, generatedAt: '', proposalCount: 1, candidateCount: 1, exceptionCount: 0, proposals: [{ proposalId: candidate.proposalId, proposalVersion: candidate.proposalVersion, proposalTitle: candidate.proposalTitle, proposalFile: candidate.proposalFile, pageNumber: candidate.pageNumber, candidates: [candidate] }], exceptions: [] }}
      catalogError={null}
      records={[record] as any}
      requests={[]}
      glossaryDecisions={[]}
      persistenceError={null}
      persistenceAvailable
      pageData={null}
      savedHumanTranslations={new Map([[candidate.spanKey, 'Encerramento de Ações e Habilidades']])}
      savedPayloadTranslations={new Map([[candidate.spanKey, { id: 528, spanKey: candidate.spanKey, data: published }]])}
      selectedPage={48}
      selectedReviewKey={candidate.reviewKey}
      busyReviewKey={null}
      hasUnsavedDraft={false}
      reviewStatus={null}
      onSelectCandidate={onSelectCandidate}
      onOpenApprovedViewer={onOpenApprovedViewer}
      onOpenEditor={vi.fn()}
      onOpenExceptionPage={vi.fn()}
      onApprove={vi.fn(async () => false)}
      onSetArchived={vi.fn(async () => {})}
      onClearSelection={onClearSelection}
      onReopen={vi.fn()}
      onCreateAIRequest={vi.fn(async request => ({ ...request, id: 1, status: 'pending' as const }))}
      onUpdateAIRequest={vi.fn(async () => {})}
      onCompleteAIRequestAsUser={vi.fn(async () => {})}
      onDecideGlossaryTerm={vi.fn(async () => {})}
    />));

    try {
      const queries = getQueriesForElement(container);
      act(() => fireEvent.click(queries.getByRole('tab', { name: /Aprovados/ })));
      expect(queries.getByText('PT-BR · integrado ao livro')).toBeTruthy();
      expect(queries.getByText('PT-BR · nova revisão em rascunho')).toBeTruthy();
      act(() => fireEvent.click(queries.getByRole('button', { name: /Encerramento de Ações e Habilidades/ })));
      expect(onOpenApprovedViewer).toHaveBeenCalledOnce();
      expect(onOpenApprovedViewer.mock.calls[0][0]).toMatchObject({
        reviewKey: candidate.reviewKey,
        proposalText: 'Encerramento de Ações e Habilidades',
        data: published,
        editorialStatus: 'approved',
      });
      expect(onSelectCandidate).not.toHaveBeenCalled();
      act(() => fireEvent.click(queries.getByRole('tab', { name: /Propostas/ })));
      expect(onClearSelection).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});

describe('persisted pending review drafts in the PT-BR viewer', () => {
  const candidate = {
    reviewKey: 'page-027-v11::page_27_unit_item-tiers__pt-BR',
    pageNumber: 27,
    proposalId: 'page-027-v11',
    proposalVersion: 'v11',
    diagnosticBlank: null,
    technicalStatus: 'changed_since_technical_validation',
    copyfitClassification: 'EXACT',
  } as TranslationReviewCandidate;
  const record = {
    id: 808,
    reviewKey: candidate.reviewKey,
    pageNumber: candidate.pageNumber,
    spanKey: candidate.spanKey,
    proposalId: candidate.proposalId,
    proposalVersion: candidate.proposalVersion,
    data: { segments: [{ text: 'Rascunho editado' }] },
    technicalStatus: 'changed_since_technical_validation',
    approvalStatus: 'pending',
    reviewDisposition: 'active',
    publication: null,
  } as any;

  it('shows the exact active pending draft even though technical approval is stale', () => {
    expect(isCurrentActivePendingReviewDraft(record, candidate)).toBe(true);
  });

  it('does not overlay archived, published, approved, stale-version, or OVER records', () => {
    expect(isCurrentActivePendingReviewDraft({ ...record, reviewDisposition: 'archived' }, candidate)).toBe(false);
    expect(isCurrentActivePendingReviewDraft({ ...record, publication: { translationId: 12 } }, candidate)).toBe(false);
    expect(isCurrentActivePendingReviewDraft({ ...record, approvalStatus: 'approved' }, candidate)).toBe(false);
    expect(isCurrentActivePendingReviewDraft({ ...record, proposalVersion: 'v10' }, candidate)).toBe(false);
    expect(isCurrentActivePendingReviewDraft(record, { ...candidate, copyfitClassification: 'OVER' })).toBe(false);
  });
});

describe('translation review structured terminology notes', () => {
  it('renders structured kept-term notes without crashing or treating them as glossary decisions', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const candidate: TranslationReviewCandidate = {
      reviewKey: 'page-098-poppet-v1::page_98_block_1__pt-BR',
      pageNumber: 98,
      proposalId: 'page-098-poppet-v1',
      proposalVersion: 'v1',
      proposalTitle: 'Poppet terminology review',
      proposalFile: 'page-098-poppet-v1.json',
      index: 0,
      spanKey: 'page_98_block_1__pt-BR',
      blockIndex: 1,
      sourceBlockId: 'page_98_block_1',
      sourceUnitId: null,
      sourceText: 'Poppet',
      proposalText: 'Poppet',
      data: { schemaVersion: 2, spanKey: 'page_98_block_1__pt-BR', segments: [{ text: 'Poppet', font: 'OptimaLTStd', size: 10 }] },
      technicalStatus: 'pending_live_copyfit_v3',
      copyfitClassification: 'UNMEASURED',
      editorialStatus: 'pending_human_review',
      diagnosticRendering: 'proposal',
      pendingTerms: [{ source: 'Poppet', proposal: 'kept in English as a named token; glossary decision pending' }],
      diagnosticBlank: null,
    };

    act(() => root.render(<TranslationReviewPanel
      open
      onClose={vi.fn()}
      catalog={{ schemaVersion: 1, generatedAt: '', proposalCount: 1, candidateCount: 1, exceptionCount: 0, proposals: [{ proposalId: candidate.proposalId, proposalVersion: candidate.proposalVersion, proposalTitle: candidate.proposalTitle, proposalFile: candidate.proposalFile, pageNumber: candidate.pageNumber, candidates: [candidate] }], exceptions: [] }}
      catalogError={null}
      records={[]}
      requests={[]}
      glossaryDecisions={[]}
      persistenceError={null}
      persistenceAvailable
      pageData={null}
      savedHumanTranslations={new Map()}
      savedPayloadTranslations={new Map()}
      selectedPage={98}
      selectedReviewKey={candidate.reviewKey}
      busyReviewKey={null}
      hasUnsavedDraft={false}
      reviewStatus={null}
      onSelectCandidate={vi.fn()}
      onOpenApprovedViewer={vi.fn()}
      onOpenEditor={vi.fn()}
      onOpenExceptionPage={vi.fn()}
      onApprove={vi.fn(async () => false)}
      onSetArchived={vi.fn(async () => {})}
      onClearSelection={vi.fn()}
      onReopen={vi.fn()}
      onCreateAIRequest={vi.fn(async request => ({ ...request, id: 1, status: 'pending' as const }))}
      onUpdateAIRequest={vi.fn(async () => {})}
      onCompleteAIRequestAsUser={vi.fn(async () => {})}
      onDecideGlossaryTerm={vi.fn(async () => {})}
    />));

    try {
      const queries = getQueriesForElement(container);
      expect(queries.getByText('Poppet: kept in English as a named token; glossary decision pending')).toBeTruthy();
      expect(queries.queryByRole('button', { name: /aprovar.*Poppet/i })).toBeNull();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});

describe('translation review glossary search', () => {
  it('finds accented decisions without changing canonical term identity', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const decision = {
      id: 72,
      decisionKey: 'mechanic=>mecânica',
      sourceTerm: 'Mechanic',
      targetTerm: 'Mecânica',
      normalizedSourceTerm: 'mechanic',
      normalizedTargetTerm: 'mecânica',
      decisionStatus: 'approved' as const,
      semanticMetadata: { category: 'mechanic' as const, context: 'Regra de Mecânica' },
      occurrences: [],
    };

    act(() => root.render(<TranslationReviewPanel
      open
      onClose={vi.fn()}
      catalog={{ schemaVersion: 1, generatedAt: '', proposalCount: 0, candidateCount: 0, exceptionCount: 0, proposals: [], exceptions: [] }}
      catalogError={null}
      records={[]}
      requests={[]}
      glossaryDecisions={[decision]}
      persistenceError={null}
      persistenceAvailable
      pageData={null}
      savedHumanTranslations={new Map()}
      savedPayloadTranslations={new Map()}
      selectedPage={1}
      selectedReviewKey={null}
      busyReviewKey={null}
      hasUnsavedDraft={false}
      reviewStatus={null}
      onSelectCandidate={vi.fn()}
      onOpenApprovedViewer={vi.fn()}
      onOpenEditor={vi.fn()}
      onOpenExceptionPage={vi.fn()}
      onApprove={vi.fn(async () => false)}
      onSetArchived={vi.fn(async () => {})}
      onClearSelection={vi.fn()}
      onReopen={vi.fn()}
      onCreateAIRequest={vi.fn(async request => ({ ...request, id: 1, status: 'pending' as const }))}
      onUpdateAIRequest={vi.fn(async () => {})}
      onCompleteAIRequestAsUser={vi.fn(async () => {})}
      onDecideGlossaryTerm={vi.fn(async () => {})}
    />));

    try {
      const queries = getQueriesForElement(container);
      act(() => fireEvent.click(queries.getByRole('tab', { name: /Glossário/ })));
      const search = queries.getByRole('searchbox', { name: /Buscar termos/ });
      act(() => fireEvent.change(search, { target: { value: 'MECANICA' } }));
      expect(queries.getByRole('heading', { name: /Mechanic.*Mecânica/ })).toBeTruthy();
      expect(queries.getByText('Exibindo 1 de 1 decisões.')).toBeTruthy();
      expect(normalizeGlossarySearchText('MECÂNICA')).toBe('mecanica');
      expect(normalizeGlossaryTerm('Mecânica')).not.toBe(normalizeGlossaryTerm('Mecanica'));
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});

describe('translation review copyfit approval guard', () => {
  it('shows the recorded source and Viewer line counts used for Copyfit approval', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const candidate: TranslationReviewCandidate = {
      reviewKey: 'copyfit-metrics::page_42_block_0__pt-BR',
      pageNumber: 42,
      proposalId: 'copyfit-metrics',
      proposalVersion: '1',
      proposalTitle: 'Copyfit metrics fixture',
      proposalFile: 'copyfit-metrics.json',
      index: 0,
      spanKey: 'page_42_block_0__pt-BR',
      blockIndex: 0,
      sourceBlockId: 'block_0',
      sourceUnitId: null,
      sourceText: 'Source text',
      proposalText: 'Texto da proposta',
      data: { schemaVersion: 2, spanKey: 'page_42_block_0__pt-BR', bbox: [10, 20, 210, 40], segments: [{ text: 'Texto da proposta', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' }] },
      technicalStatus: 'fit-awaiting-human-review',
      copyfitClassification: 'EXACT',
      copyfitSourcePdfLineCount: 2,
      copyfitPageRendererLineCount: 2,
      copyfitMeasurementFingerprint: 'canonical-measurement',
      copyfitCanonicalSpanKey: 'page_42_block_0__pt-BR',
      copyfitCanonicalBbox: [10, 20, 210, 40],
      editorialStatus: 'pending_human_review',
      diagnosticRendering: 'proposal',
      pendingTerms: [],
      diagnosticBlank: null,
    };
    act(() => root.render(<TranslationReviewPanel
      open onClose={vi.fn()}
      catalog={{ schemaVersion: 1, generatedAt: '', proposalCount: 1, candidateCount: 1, exceptionCount: 0, proposals: [{ proposalId: candidate.proposalId, proposalVersion: candidate.proposalVersion, proposalTitle: candidate.proposalTitle, proposalFile: candidate.proposalFile, pageNumber: candidate.pageNumber, candidates: [candidate] }], exceptions: [] }}
      catalogError={null} records={[]} requests={[]} glossaryDecisions={[]} persistenceError={null} persistenceAvailable
      pageData={null} savedHumanTranslations={new Map()} savedPayloadTranslations={new Map()} selectedPage={42}
      selectedReviewKey={candidate.reviewKey} busyReviewKey={null} hasUnsavedDraft={false} reviewStatus={null}
      onSelectCandidate={vi.fn()} onOpenApprovedViewer={vi.fn()} onOpenEditor={vi.fn()} onOpenExceptionPage={vi.fn()}
      onApprove={vi.fn(async () => false)} onSetArchived={vi.fn(async () => {})} onClearSelection={vi.fn()}
      onReopen={vi.fn()} onCreateAIRequest={vi.fn(async request => ({ ...request, id: 1, status: 'pending' as const }))}
      onUpdateAIRequest={vi.fn(async () => {})} onCompleteAIRequestAsUser={vi.fn(async () => {})} onDecideGlossaryTerm={vi.fn(async () => {})}
    />));

    try {
      const metrics = getQueriesForElement(container).getByRole('region', { name: 'Medição Copyfit V3' });
      expect(metrics.textContent).toContain('PDF-fonte2 linhas');
      expect(metrics.textContent).toContain('Viewer PT-BR2 linhas');
      expect(metrics.textContent).toContain('EXACT');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('preserves paragraph spacing in rich overrides and includes it in Copyfit V3 identity', () => {
    const measured = {
      schemaVersion: 2,
      spanKey: 'page_27_block_3__pt-BR',
      bbox: [418.41, 241.51, 739.03, 300.24],
      paragraphSpacingPt: 2.83,
      segments: [{ text: 'Paragraph one.\nParagraph two.', font: 'OptimaLTStd', size: 10, weight: 400, style: 'normal' as const }],
    };
    const decoded = decodeOverrideData(measured);
    expect(decoded?.paragraphSpacingPt).toBe(2.83);
    expect(encodeOverrideData({ ...decoded!, spanKey: measured.spanKey, bbox: measured.bbox as [number, number, number, number] }))
      .toMatchObject({ paragraphSpacingPt: 2.83 });
    expect(copyfitMeasurementDataMatches(measured, measured)).toBe(true);
    expect(copyfitMeasurementDataMatches(measured, { ...measured, paragraphSpacingPt: 2.82 })).toBe(false);
  });

  it('does not treat an approved sibling unit as approval of a queued span request', () => {
    const request = {
      reviewKey: 'p19-v2::paragraph-2',
      pageNumber: 19,
      spanKey: 'page_19_unit_p19-block-21-paragraph-2__pt-BR',
      sourceBlockId: 'block_21',
    };
    const requestedUnit = {
      reviewKey: request.reviewKey,
      pageNumber: 19,
      spanKey: request.spanKey,
      sourceBlockId: 'block_21',
    };
    const approvedSibling = {
      reviewKey: 'p19-v2::paragraph-1',
      pageNumber: 19,
      spanKey: 'page_19_unit_p19-block-21-paragraph-1__pt-BR',
      sourceBlockId: 'block_21',
    };

    expect(reviewRequestMatchesUnit(request, requestedUnit, [requestedUnit, approvedSibling])).toBe(true);
    expect(reviewRequestMatchesUnit(request, approvedSibling, [requestedUnit, approvedSibling])).toBe(false);
    expect(reviewRequestMatchesUnit({
      ...request,
      reviewKey: 'p19-v2::paragraph-1',
    }, requestedUnit, [requestedUnit, approvedSibling])).toBe(false);
    expect(reviewRequestMatchesUnit({
      ...request,
      reviewKey: 'page-019-full-page-proposal-2026-10-16-v1@1::paragraph-2',
    }, requestedUnit, [requestedUnit])).toBe(true);
    const legacyRequest = {
      reviewKey: null,
      pageNumber: 19,
      spanKey: null,
      sourceBlockId: 'block_21',
    };
    expect(reviewRequestMatchesUnit(legacyRequest, approvedSibling, [requestedUnit, approvedSibling])).toBe(false);
    expect(reviewRequestMatchesUnit(legacyRequest, requestedUnit, [requestedUnit])).toBe(true);
  });

  it('never allows an OVER line-count result to be approved', () => {
    expect(copyfitApprovalBlockReason('OVER', 'fit-awaiting-human-review', null, 1, 2)).toBe('OVER');
    expect(copyfitApprovalBlockReason(null, 'blocked-line-count-over')).toBe('OVER');
    expect(copyfitApprovalBlockReason(null, 'blocked_copyfit_v3_over_source_1_target_2')).toBe('OVER');
  });

  it('blocks a displayed classification that disagrees with the measured line counts', () => {
    expect(copyfitApprovalBlockReason('EXACT', 'fit-awaiting-human-review', null, 1, 2)).toBe('MEASUREMENT_MISMATCH');
    expect(copyfitApprovalBlockReason('UNDER', 'fit-awaiting-human-review', 'Composition is intact.', 2, 2)).toBe('MEASUREMENT_MISMATCH');
    expect(copyfitApprovalBlockReason('OVER', 'fit-awaiting-human-review', null, 2, 1)).toBe('MEASUREMENT_MISMATCH');
  });

  it('keeps EXACT and UNDER separate from editorial approval', () => {
    expect(copyfitApprovalBlockReason('EXACT', 'fit-awaiting-human-review', null, 1, 1)).toBeNull();
    expect(copyfitApprovalBlockReason('UNDER', 'fit-awaiting-human-review', null, 2, 1)).toBe('UNDER_WITHOUT_COMPOSITION_RATIONALE');
    expect(copyfitApprovalBlockReason('UNDER', 'fit-awaiting-human-review', 'The shorter line preserves the full composition.', 2, 1)).toBeNull();
  });

  it('blocks a DTP geometry failure without misclassifying it as line-count OVER', () => {
    expect(copyfitApprovalBlockReason('EXACT', 'blocked-dtp-geometry-overflow', null, 1, 1)).toBe('TECHNICAL_FAILURE');
  });

  it('blocks an unmeasured unit and invalidates measurements after text edits', () => {
    expect(copyfitApprovalBlockReason(null, 'pending-live-viewer-copyfit-v3')).toBe('UNMEASURED');
    expect(copyfitApprovalBlockReason('EXACT', 'changed_since_technical_validation', null, 1, 1)).toBe('STALE_MEASUREMENT');
    expect(copyfitApprovalBlockReason('EXACT', 'stale_review_version', null, 1, 1)).toBe('STALE_MEASUREMENT');
    expect(copyfitApprovalBlockReason('EXACT', 'blocked_dtp_geometry_after_exact_line_count', null, 1, 1)).toBe('TECHNICAL_FAILURE');
  });

  it('requires canonical Copyfit evidence and exact draft data before approval', () => {
    const measuredData = {
      spanKey: 'page_19_unit_test__pt-BR',
      bbox: [10, 20, 210, 40],
      textAlign: 'left',
      lineHeight: 1.1,
      lineHeightMode: 'source',
      managedSourceSymbols: [],
      segments: [{ text: 'Measured proposal', font: 'Test', size: 10 }],
    };
    const candidate: TranslationReviewCandidate = {
      reviewKey: 'p19-test@1::unit', pageNumber: 19, proposalId: 'p19-test', proposalVersion: '1',
      proposalTitle: 'Page 19 test', proposalFile: 'p19-test.json', index: 0,
      spanKey: 'page_19_unit_test__pt-BR', blockIndex: 1, sourceBlockId: 'block_1', sourceUnitId: 'unit',
      sourceText: 'Source', proposalText: 'Measured proposal', data: measuredData,
      technicalStatus: 'fit-awaiting-human-review', copyfitClassification: 'EXACT',
      copyfitSourcePdfLineCount: 1, copyfitPageRendererLineCount: 1,
      copyfitMeasurementFingerprint: 'canonical-measurement',
      copyfitCanonicalSpanKey: 'page_19_unit_test__pt-BR',
      copyfitCanonicalBbox: [10, 20, 210, 40],
      editorialStatus: 'pending_human_review', diagnosticRendering: 'proposal', pendingTerms: [], diagnosticBlank: null,
    };

    expect(copyfitMeasurementDataMatches(measuredData, measuredData)).toBe(true);
    expect(copyfitCanonicalEvidenceBlockReason(candidate, measuredData)).toBeNull();
    expect(copyfitCanonicalEvidenceBlockReason(candidate, {
      ...measuredData,
      segments: [{ text: 'Human-edited proposal', font: 'Test', size: 10 }],
    })).toBe('STALE_MEASUREMENT');
    expect(copyfitCanonicalEvidenceBlockReason(candidate, {
      ...measuredData,
      bbox: [10, 20, 220, 40],
    })).toBe('STALE_MEASUREMENT');
    expect(copyfitCanonicalEvidenceBlockReason({
      ...candidate,
      copyfitMeasurementFingerprint: null,
    }, measuredData)).toBe('UNMEASURED');
    expect(copyfitCanonicalEvidenceBlockReason({
      ...candidate,
      copyfitCanonicalBbox: null,
    }, measuredData)).toBe('UNMEASURED');
  });

  it('sends the catalog-measured p.14 location label unchanged to the approval endpoint', async () => {
    const catalog = translationReviewCatalog as unknown as {
      proposals: Array<{ candidates: TranslationReviewCandidate[] }>;
    };
    const candidate = catalog.proposals.flatMap(proposal => proposal.candidates)
      .find(item => item.spanKey === 'page_14_unit_p14-location-type-dungeon__pt-BR');
    expect(candidate).toBeDefined();
    if (!candidate) throw new Error('The measured p.14 location-label candidate is missing from the review catalog.');

    const rendererKey = rendererKeyForReviewCandidate(candidate, null);
    const data = spanOverrideForReviewCandidate(candidate, rendererKey, candidate.data, null);
    expect(data).not.toBeNull();
    expect(copyfitCanonicalEvidenceBlockReason(candidate, data)).toBeNull();

    let requestBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return {
        ok: false,
        status: 409,
        json: async () => ({ error: 'probe only' }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(persistTranslationReviewApproval(candidate, data!, undefined)).rejects.toThrow('probe only');
      expect(requestBody).not.toBeNull();
      const body = requestBody!;
      expect(resolveCanonicalCopyfitEvidence(catalog, {
        reviewKey: String(body.reviewKey),
        pageNumber: Number(body.pageNumber),
        spanKey: String(body.spanKey),
        proposalId: String(body.proposalId),
        proposalVersion: String(body.proposalVersion),
        data: body.data,
      })).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('blanks failed PT-BR diagnostics even when the catalog omitted diagnosticBlank metadata', () => {
    const base = {
      diagnosticBlank: null,
      technicalStatus: 'fit-awaiting-human-review',
      copyfitClassification: 'EXACT' as const,
      underCompositionJustification: null,
    };
    expect(candidateRequiresDiagnosticBlank({ ...base, technicalStatus: 'blocked_copyfit_v3_over_dtp_exception_open' })).toBe(true);
    expect(candidateRequiresDiagnosticBlank({ ...base, copyfitClassification: 'OVER' })).toBe(true);
    expect(candidateRequiresDiagnosticBlank({ ...base, copyfitClassification: 'UNDER' })).toBe(true);
    expect(candidateRequiresDiagnosticBlank({ ...base, diagnosticBlank: { exceptionId: 'DTP-1', reason: 'No fit.' } })).toBe(true);
    expect(candidateRequiresDiagnosticBlank(base)).toBe(false);
    expect(candidateRequiresDiagnosticBlank({ ...base, copyfitClassification: 'UNDER', underCompositionJustification: 'Shorter composition preserves the entire rule.' })).toBe(false);
    expect(candidateRequiresDiagnosticBlank({ ...base, technicalStatus: 'pending-live-validation', copyfitClassification: null })).toBe(false);
  });

  it('does not let a resolved exception blank a successfully revalidated proposal', () => {
    expect(exceptionRequiresDiagnosticBlank({ status: 'open', diagnosticBlank: true })).toBe(true);
    expect(exceptionRequiresDiagnosticBlank({ status: 'resolved', diagnosticBlank: true })).toBe(false);
    expect(exceptionRequiresDiagnosticBlank({ status: 'resolved', diagnosticBlank: false })).toBe(false);
  });

  it('removes resolved exceptions from the active review queue while retaining unresolved page filters', () => {
    const exceptions = [
      { id: 'resolved', pageNumber: 23, status: 'resolved' },
      { id: 'open-23', pageNumber: 23, status: 'open' },
      { id: 'open-24', pageNumber: 24, status: 'open' },
    ] as any;

    expect(unresolvedReviewExceptions(exceptions, '23').map(exception => exception.id)).toEqual(['open-23']);
    expect(unresolvedReviewExceptions(exceptions, 'all').map(exception => exception.id)).toEqual(['open-23', 'open-24']);
  });

  it('does not persist a pre-edit measurement with an edited review draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ doc: { id: 1, reviewKey: 'p14-test', approvalStatus: 'pending' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const candidate: TranslationReviewCandidate = {
      reviewKey: 'p14-test', pageNumber: 14, proposalId: 'p14', proposalVersion: '1',
      proposalTitle: 'Test', proposalFile: 'test.json', index: 0, spanKey: 'page_14_block_1__pt-BR',
      blockIndex: 1, sourceBlockId: 'block_1', sourceUnitId: null, sourceText: 'Source',
      proposalText: 'Original draft', data: { schemaVersion: 2, spanKey: 'page_14_block_1__pt-BR',
        bbox: [1, 1, 100, 20], segments: [{ text: 'Original draft', font: 'Test', size: 10 }] },
      technicalStatus: 'fit-awaiting-human-review', copyfitClassification: 'EXACT',
      copyfitSourcePdfLineCount: 1, copyfitPageRendererLineCount: 1,
      copyfitMeasurementFingerprint: 'measurement-for-original-text', underCompositionJustification: null,
      editorialStatus: 'pending_human_review', diagnosticRendering: 'proposal', pendingTerms: [], diagnosticBlank: null,
    };

    try {
      await persistTranslationReview(candidate, {
        spanKey: candidate.spanKey, bbox: [1, 1, 100, 20], segments: [{ text: 'Edited draft', font: 'Test', size: 10 }],
      } as any, undefined, 'pending', 'changed_since_technical_validation');
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(requestBody).toMatchObject({
        technicalStatus: 'changed_since_technical_validation',
        copyfitClassification: null,
        copyfitSourcePdfLineCount: null,
        copyfitPageRendererLineCount: null,
        copyfitMeasurementFingerprint: null,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clears a newer proposal measurement when preserving an older human draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ doc: { id: 1, reviewKey: 'p14-test', approvalStatus: 'pending' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const candidate: TranslationReviewCandidate = {
      reviewKey: 'p14-test', pageNumber: 14, proposalId: 'p14-new', proposalVersion: '2',
      proposalTitle: 'Test', proposalFile: 'test.json', index: 0, spanKey: 'page_14_block_1__pt-BR',
      blockIndex: 1, sourceBlockId: 'block_1', sourceUnitId: null, sourceText: 'Source',
      proposalText: 'New proposal', data: { schemaVersion: 2, spanKey: 'page_14_block_1__pt-BR',
        bbox: [1, 1, 100, 20], segments: [{ text: 'New proposal', font: 'Test', size: 10 }] },
      technicalStatus: 'fit-awaiting-human-review', copyfitClassification: 'EXACT',
      copyfitSourcePdfLineCount: 1, copyfitPageRendererLineCount: 1,
      copyfitMeasurementFingerprint: 'measurement-for-new-proposal',
      editorialStatus: 'pending_human_review', diagnosticRendering: 'proposal', pendingTerms: [], diagnosticBlank: null,
    };
    const preservedDraft = { spanKey: candidate.spanKey, bbox: [1, 1, 100, 20],
      segments: [{ text: 'Human draft from v1', font: 'Test', size: 10 }] };

    try {
      await persistTranslationReview(candidate, preservedDraft as any, {
        id: 1, reviewKey: 'p14-test', pageNumber: 14, spanKey: candidate.spanKey,
        proposalId: 'p14-old', proposalVersion: '1', data: preservedDraft,
      } as any, 'pending', 'stale_review_version');
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(requestBody.data.segments[0].text).toBe('Human draft from v1');
      expect(requestBody).toMatchObject({
        technicalStatus: 'stale_review_version',
        copyfitClassification: null,
        copyfitSourcePdfLineCount: null,
        copyfitPageRendererLineCount: null,
        copyfitMeasurementFingerprint: null,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
