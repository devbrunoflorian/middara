import test from 'node:test';
import assert from 'node:assert/strict';
import { exposeCandidateForCopyfitPreview, exposeLayoutFramesForCopyfitPreview, exposeRequestForCopyfitPreview, exposeReviewDraftsForCopyfitPreview, selectCopyfitMeasurementPath, validatePageRendererIdentity } from '../copyfit_renderer_identity.mjs';

test('measures a keyed PageRenderer unit even while its review row is absent from Proposals', () => {
  assert.deepEqual(selectCopyfitMeasurementPath({ pageRendererMatchCount: 1, reviewRowCount: 0 }), {
    path: 'page-renderer-key',
  });
});

test('falls back only when the exact PageRenderer key is absent and a review row is unique', () => {
  assert.deepEqual(selectCopyfitMeasurementPath({ pageRendererMatchCount: 0, reviewRowCount: 1 }), {
    path: 'review-row',
  });
});

test('selects the review row when candidate geometry must be applied before measuring', () => {
  assert.deepEqual(selectCopyfitMeasurementPath({
    pageRendererMatchCount: 1,
    reviewRowCount: 1,
    requiresReviewFrame: true,
  }), { path: 'review-row' });
});

test('fails closed when candidate geometry cannot be applied through one review row', () => {
  assert.deepEqual(selectCopyfitMeasurementPath({
    pageRendererMatchCount: 1,
    reviewRowCount: 0,
    requiresReviewFrame: true,
  }), {
    path: 'invalid',
    reason: 'candidate layout frame requires a uniquely selectable review row',
  });
});

test('fails closed for duplicate PageRenderer keys', () => {
  assert.deepEqual(selectCopyfitMeasurementPath({ pageRendererMatchCount: 2, reviewRowCount: 0 }), {
    path: 'invalid',
    reason: 'PageRenderer key did not resolve uniquely',
  });
});

test('rejects a keyed unit whose rendered text differs from the candidate', () => {
  assert.deepEqual(validatePageRendererIdentity({
    expectedText: 'Fichas de Terreno',
    actualText: 'Fichas do Terreno',
    expectedSymbolIds: [],
    actualSymbolIds: [],
  }), { valid: false, reason: 'PageRenderer text differs from candidate rich text' });
});

test('rejects a keyed unit whose semantic symbols differ from the candidate', () => {
  assert.deepEqual(validatePageRendererIdentity({
    expectedText: 'Texto',
    actualText: 'Texto',
    expectedSymbolIds: ['tag.important.icon'],
    actualSymbolIds: ['terrain.red-border'],
  }), {
    valid: false,
    reason: 'semantic symbol render does not match candidate data',
    expectedSymbolIds: ['tag.important.icon'],
    actualSymbolIds: ['terrain.red-border'],
  });
});

test('exposes only the matching open request as AI-returned in an isolated copyfit response', () => {
  const payload = { docs: [
    { id: 20, status: 'in_progress', reviewKey: 'p21@2::block2', spanKey: 'block2__pt-BR' },
    { id: 21, status: 'pending', reviewKey: 'p21@2::block3', spanKey: 'block3__pt-BR' },
  ], totalDocs: 2 };
  const result = exposeRequestForCopyfitPreview(payload, {
    requestId: 20,
    reviewKey: 'p21@2::block2',
    spanKey: 'block2__pt-BR',
  });
  assert.equal(result.docs[0].status, 'completed');
  assert.equal(result.docs[0].completedBy, 'ai');
  assert.equal(result.docs[1].status, 'pending');
  assert.equal(payload.docs[0].status, 'in_progress');
});

test('rejects a browser-only request override for a different proposal unit', () => {
  assert.throws(() => exposeRequestForCopyfitPreview({ docs: [
    { id: 20, status: 'in_progress', reviewKey: 'p21@2::block2', spanKey: 'block2__pt-BR' },
  ] }, { requestId: 20, reviewKey: 'p21@2::block9', spanKey: 'block9__pt-BR' }), /does not match/u);
});

test('clears only the selected candidate and exception diagnostic blanks in the browser-only catalog copy', () => {
  const catalog = { proposals: [{ candidates: [
    { spanKey: 'block2__pt-BR', diagnosticBlank: { exceptionId: 'old-over' }, technicalStatus: 'changed_since_technical_validation', copyfitClassification: 'OVER' },
    { spanKey: 'block3__pt-BR', diagnosticBlank: { exceptionId: 'other' } },
  ] }], exceptions: [
    { spanKey: 'block2__pt-BR', diagnosticBlank: true },
    { spanKey: 'block3__pt-BR', diagnosticBlank: true },
  ] };
  const result = exposeCandidateForCopyfitPreview(catalog, { spanKey: 'block2__pt-BR' });
  assert.equal(result.proposals[0].candidates[0].diagnosticBlank, null);
  assert.equal(result.proposals[0].candidates[0].technicalStatus, 'pending_live_copyfit_viewer_and_pdf');
  assert.equal(result.proposals[0].candidates[0].copyfitClassification, null);
  assert.deepEqual(result.proposals[0].candidates[1].diagnosticBlank, { exceptionId: 'other' });
  assert.equal(result.exceptions[0].diagnosticBlank, false);
  assert.equal(result.exceptions[1].diagnosticBlank, true);
  assert.deepEqual(catalog.proposals[0].candidates[0].diagnosticBlank, { exceptionId: 'old-over' });
  assert.equal(catalog.exceptions[0].diagnosticBlank, true);
});

test('fails closed when a browser-only catalog override cannot identify one candidate', () => {
  assert.throws(() => exposeCandidateForCopyfitPreview({ proposals: [{ candidates: [] }] }, { spanKey: 'missing' }), /did not resolve uniquely/u);
});

test('exposes only matching review draft data in an isolated copyfit response', () => {
  const payload = { docs: [
    { reviewKey: 'p53::title', data: { text: 'old title' }, publication: { data: { text: 'published' } } },
    { reviewKey: 'p53::other', data: { text: 'keep' } },
  ], totalDocs: 2 };
  const candidate = { reviewKey: 'p53::title', data: { text: 'candidate title' } };
  const result = exposeReviewDraftsForCopyfitPreview(payload, { candidates: [candidate] });
  assert.equal(result.docs[0].data.text, 'candidate title');
  assert.deepEqual(result.docs[0].publication, payload.docs[0].publication);
  assert.equal(result.docs[1].data.text, 'keep');
  assert.equal(payload.docs[0].data.text, 'old title');
});

test('exposes candidate PT-BR frames while preserving other frame records', () => {
  const payload = { docs: [
    { id: 10, pageNumber: 53, unitKey: 'page_53_block_32', language: 'en', data: { x: 1, width: 10 } },
    { id: 11, pageNumber: 53, unitKey: 'page_53_block_32', language: 'pt-BR', data: { x: 2, width: 10 } },
  ], totalDocs: 2 };
  const result = exposeLayoutFramesForCopyfitPreview(payload, {
    pageNumber: 53,
    candidates: [{
      pageNumber: 53,
      spanKey: 'page_53_block_32__pt-BR',
      reviewLayoutFrame: { x: 470, y: 499, width: 700, total: 230 },
    }],
  });
  assert.equal(result.docs.length, 2);
  assert.deepEqual(result.docs.find(doc => doc.language === 'pt-BR').data, { x: 470, y: 499, width: 700, total: 230 });
  assert.deepEqual(result.docs.find(doc => doc.language === 'en').data, { x: 1, width: 10 });
  assert.equal(payload.docs[1].data.x, 2);
});
