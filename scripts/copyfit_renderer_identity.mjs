/** Pure identity checks shared by Copyfit V3 and its focused regression tests. */
export function selectCopyfitMeasurementPath({ pageRendererMatchCount, reviewRowCount, requiresReviewFrame = false }) {
  if (requiresReviewFrame) {
    if (reviewRowCount === 1) return { path: 'review-row' };
    return { path: 'invalid', reason: 'candidate layout frame requires a uniquely selectable review row' };
  }
  if (pageRendererMatchCount > 1) return { path: 'invalid', reason: 'PageRenderer key did not resolve uniquely' };
  if (pageRendererMatchCount === 1) return { path: 'page-renderer-key' };
  if (reviewRowCount === 1) return { path: 'review-row' };
  return { path: 'unmatched', reason: 'review row identity did not resolve uniquely' };
}

export function validatePageRendererIdentity({ expectedText, actualText, expectedSymbolIds, actualSymbolIds }) {
  if (expectedText !== actualText) {
    return { valid: false, reason: 'PageRenderer text differs from candidate rich text' };
  }
  const expected = [...expectedSymbolIds].sort();
  const actual = [...actualSymbolIds].sort();
  if (expected.join('\n') !== actual.join('\n')) {
    return {
      valid: false,
      reason: 'semantic symbol render does not match candidate data',
      expectedSymbolIds: expected,
      actualSymbolIds: actual,
    };
  }
  return { valid: true };
}

/** Return a browser-only request list that exposes one open draft in Proposals for copyfit. */
export function exposeRequestForCopyfitPreview(payload, { requestId, reviewKey, spanKey }) {
  const records = Array.isArray(payload?.docs) ? payload.docs : Array.isArray(payload) ? payload : null;
  if (!records) throw new Error('Review request response has no document list.');
  const matches = records.filter(request => String(request.id) === String(requestId));
  if (matches.length !== 1) throw new Error(`Review request ${requestId} did not resolve uniquely.`);
  const request = matches[0];
  if (request.reviewKey !== reviewKey && request.spanKey !== spanKey) {
    throw new Error(`Review request ${requestId} does not match the selected proposal unit.`);
  }
  if (request.status === 'completed') return payload;
  const replacement = { ...request, status: 'completed', completedBy: 'ai' };
  const updated = records.map(item => item === request ? replacement : item);
  return Array.isArray(payload) ? updated : { ...payload, docs: updated };
}

/** Remove only the catalog's stale diagnostic blank so a saved failed draft can be measured in-page. */
export function exposeCandidateForCopyfitPreview(payload, { spanKey }) {
  if (!Array.isArray(payload?.proposals)) throw new Error('Translation review catalog has no proposal list.');
  const matches = payload.proposals.flatMap(proposal => (proposal.candidates ?? [])
    .filter(candidate => candidate.spanKey === spanKey));
  if (matches.length !== 1) throw new Error(`Copyfit candidate ${spanKey} did not resolve uniquely in the catalog.`);
  return {
    ...payload,
    proposals: payload.proposals.map(proposal => ({
      ...proposal,
      candidates: (proposal.candidates ?? []).map(candidate => candidate.spanKey === spanKey
        ? {
          ...candidate,
          diagnosticBlank: null,
          technicalStatus: 'pending_live_copyfit_viewer_and_pdf',
          copyfitClassification: null,
        }
        : candidate),
    })),
    exceptions: Array.isArray(payload.exceptions)
      ? payload.exceptions.map(exception => exception.spanKey === spanKey
        ? { ...exception, diagnosticBlank: false }
        : exception)
      : payload.exceptions,
  };
}

/** Override only pending review response data for an isolated browser-only candidate preview. */
export function exposeReviewDraftsForCopyfitPreview(payload, { candidates }) {
  const records = Array.isArray(payload?.docs) ? payload.docs : Array.isArray(payload) ? payload : null;
  if (!records) throw new Error('Translation review response has no document list.');
  const byReviewKey = new Map(candidates
    .filter(candidate => candidate?.reviewKey && candidate?.data)
    .map(candidate => [candidate.reviewKey, candidate]));
  const updated = records.map(record => {
    const candidate = byReviewKey.get(record.reviewKey);
    return candidate ? { ...record, data: candidate.data } : record;
  });
  return Array.isArray(payload) ? updated : { ...payload, docs: updated };
}

/** Make candidate layout frames visible to PageRenderer without writing Payload. */
export function exposeLayoutFramesForCopyfitPreview(payload, { pageNumber, candidates }) {
  const records = Array.isArray(payload?.docs) ? payload.docs : Array.isArray(payload) ? payload : null;
  if (!records) throw new Error('Layout frame response has no document list.');
  const pageFrames = candidates.flatMap(candidate => {
    const rawKey = String(candidate?.copyfitCanonicalSpanKey || candidate?.spanKey || '');
    const unitKey = rawKey.replace(/__(?:pt-BR|en)$/u, '');
    if (candidate?.pageNumber !== pageNumber || !candidate?.reviewLayoutFrame || !unitKey) return [];
    return [{ unitKey, language: 'pt-BR', data: candidate.reviewLayoutFrame }];
  });
  const frameByKey = new Map(pageFrames.map(frame => [`${frame.unitKey}::${frame.language}`, frame]));
  const present = new Set();
  const updated = records.map(record => {
    const key = `${record.unitKey}::${record.language}`;
    const frame = frameByKey.get(key);
    if (!frame || record.pageNumber !== pageNumber) return record;
    present.add(key);
    return { ...record, data: frame.data };
  });
  for (const [key, frame] of frameByKey) {
    if (present.has(key)) continue;
    updated.push({
      id: `copyfit-preview-${encodeURIComponent(key)}`,
      frameKey: key,
      unitKey: frame.unitKey,
      pageNumber,
      language: frame.language,
      data: frame.data,
    });
  }
  return Array.isArray(payload) ? updated : { ...payload, docs: updated };
}
