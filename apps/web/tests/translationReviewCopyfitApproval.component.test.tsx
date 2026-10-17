import { describe, expect, it, vi } from 'vitest';
import { candidateRequiresDiagnosticBlank, copyfitApprovalBlockReason, exceptionRequiresDiagnosticBlank, layoutFrameForReviewOverride, persistTranslationReview, reviewRequestMatchesUnit, type TranslationReviewCandidate } from '../src/translationReview';

describe('translation review proposal geometry', () => {
  it('maps proposal bbox to a viewer frame without changing alignment or line height', () => {
    expect(layoutFrameForReviewOverride({
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
    })).toEqual({
      x: 243.724,
      y: 572.84,
      width: 332.498,
      height: 24.264,
      rotation: 0,
      textAlign: 'center',
      lineHeight: 1.1,
    });
  });

  it('rejects invalid proposal geometry rather than resizing the Viewer', () => {
    expect(layoutFrameForReviewOverride({ x: 10, y: 20, width: 0, height: 10 }, {})).toBeNull();
    expect(layoutFrameForReviewOverride({ x: 0, y: 0, width: Number.NaN, height: 10 }, {})).toBeNull();
    expect(layoutFrameForReviewOverride(null, {})).toBeNull();
  });
});

describe('translation review copyfit approval guard', () => {
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
    expect(copyfitApprovalBlockReason('EXACT', 'blocked_dtp_geometry_after_exact_line_count', null, 1, 1)).toBe('TECHNICAL_FAILURE');
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
});
