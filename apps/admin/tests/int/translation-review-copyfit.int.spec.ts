import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const payloadState = vi.hoisted(() => ({
  reviews: [] as Array<Record<string, any>>,
  translations: [] as Array<Record<string, any>>,
}))

vi.mock('payload', () => ({
  initTransaction: vi.fn(async () => true),
  commitTransaction: vi.fn(async () => undefined),
  killTransaction: vi.fn(async () => undefined),
}))

import { approveTranslationReviewEndpoint } from '../../src/endpoints/approveTranslationReview'

type CopyfitClass = 'EXACT' | 'UNDER' | 'OVER'
type CandidateFixture = {
  reviewKey: string
  proposalId: string
  proposalVersion: string
  pageNumber: number
  spanKey: string
  data: Record<string, any>
  sourceLines: number | null
  renderedLines: number | null
  classification: CopyfitClass | null
  fingerprint: string | null
  canonicalSpanKey: string
  canonicalBbox: number[]
  requestData?: Record<string, unknown> | null
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(data: Record<string, unknown>): string {
  const snapshot = {
    spanKey: String(data.spanKey ?? '').replace(/__pt-BR$/u, ''),
    bbox: data.bbox,
    textAlign: data.textAlign,
    lineHeight: data.lineHeight,
    lineHeightMode: data.lineHeightMode,
    paragraphSpacingPt: data.paragraphSpacingPt ?? null,
    managedSourceSymbols: data.managedSourceSymbols ?? [],
    segments: data.segments,
  }
  return createHash('sha256').update(canonical(snapshot)).digest('hex')
}

function candidate(
  name: string,
  sourceLines: number | null,
  renderedLines: number | null,
  classification: CopyfitClass | null,
): CandidateFixture {
  const spanKey = `page_100_block_${name}__pt-BR`
  const data = {
    schemaVersion: 2,
    spanKey,
    bbox: [40, 50, 180, 64],
    textAlign: 'left',
    lineHeight: 1,
    lineHeightMode: 'source',
    segments: [{ text: `${name} candidate`, font: 'AGaramondPro-Regular', size: 10 }],
    managedSourceSymbols: [],
  }
  return {
    reviewKey: `p100-test@1::${spanKey}`,
    proposalId: 'p100-test',
    proposalVersion: '1',
    pageNumber: 100,
    spanKey,
    data,
    sourceLines,
    renderedLines,
    classification,
    fingerprint: sourceLines && renderedLines ? fingerprint(data) : null,
    canonicalSpanKey: spanKey,
    canonicalBbox: data.bbox,
    requestData: null as Record<string, unknown> | null,
  }
}

function catalogFor(candidates: CandidateFixture[]) {
  return {
    proposals: [{
      proposalId: 'p100-test',
      proposalVersion: '1',
      pageNumber: 100,
      candidates: candidates.map(item => ({
        reviewKey: item.reviewKey,
        proposalId: item.proposalId,
        proposalVersion: item.proposalVersion,
        pageNumber: item.pageNumber,
        spanKey: item.spanKey,
        data: item.data,
        copyfitSourcePdfLineCount: item.sourceLines,
        copyfitPageRendererLineCount: item.renderedLines,
        copyfitClassification: item.classification,
        copyfitMeasurementFingerprint: item.fingerprint,
        copyfitCanonicalSpanKey: item.canonicalSpanKey,
        copyfitCanonicalBbox: item.canonicalBbox,
        technicalStatus: item.classification ? 'fit-awaiting-human-review' : 'pending-live-viewer-copyfit-v3',
      })),
    }],
  }
}

async function setCatalog(value: unknown) {
  await writeFile(catalogPath, JSON.stringify(value), 'utf8')
}

function fakePayload() {
  return {
    find: vi.fn(async ({ collection, where }: { collection: string; where: Record<string, any> }) => {
      if (collection === 'translation-reviews') {
        const key = where.reviewKey?.equals
        return { docs: payloadState.reviews.filter(doc => doc.reviewKey === key) }
      }
      const conditions = where.and ?? []
      const spanKeyCondition = conditions.find((condition: any) => condition.spanKey)?.spanKey
      const spanKeys = spanKeyCondition?.in ?? (spanKeyCondition?.equals ? [spanKeyCondition.equals] : [])
      const language = conditions.find((condition: any) => condition.language)?.language?.equals
      return { docs: payloadState.translations.filter(doc => spanKeys.includes(doc.spanKey) && doc.language === language) }
    }),
    create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, any> }) => {
      const doc = { id: `${collection}-${payloadState.reviews.length + payloadState.translations.length + 1}`, ...data }
      if (collection === 'translation-reviews') payloadState.reviews.push(doc)
      else payloadState.translations.push(doc)
      return doc
    }),
    update: vi.fn(async ({ collection, id, data }: { collection: string; id: string | number; data: Record<string, any> }) => {
      const rows = collection === 'translation-reviews' ? payloadState.reviews : payloadState.translations
      const index = rows.findIndex(doc => String(doc.id) === String(id))
      rows[index] = { ...rows[index], ...data }
      return rows[index]
    }),
  }
}

async function approve(item: CandidateFixture, overrides: Record<string, unknown> = {}) {
  const payload = fakePayload()
  const body = {
    reviewKey: item.reviewKey,
    pageNumber: item.pageNumber,
    spanKey: item.spanKey,
    proposalId: 'p100-test',
    proposalVersion: '1',
    sourceText: 'Source',
    proposalText: item.data.segments[0].text,
    data: item.requestData ?? item.data,
    technicalStatus: 'fit-awaiting-human-review',
    copyfitClassification: item.classification,
    copyfitSourcePdfLineCount: item.sourceLines,
    copyfitPageRendererLineCount: item.renderedLines,
    copyfitMeasurementFingerprint: item.fingerprint,
    ...overrides,
  }
  const request = new Request('http://localhost/api/translation-review/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Request & { payload: ReturnType<typeof fakePayload>; transactionID: string }
  request.payload = payload
  request.transactionID = 'test-transaction'
  const handler = approveTranslationReviewEndpoint.handler as unknown as (req: typeof request) => Promise<Response>
  const response = await handler(request)
  return { response, body: await response.json() }
}

let tempDirectory: string
let catalogPath: string
const previousCatalogPath = process.env.MIDDARA_REVIEW_CATALOG_PATH

beforeEach(async () => {
  payloadState.reviews = []
  payloadState.translations = []
  if (!tempDirectory) {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'middara-copyfit-review-'))
    catalogPath = path.join(tempDirectory, 'catalog.json')
    process.env.MIDDARA_REVIEW_CATALOG_PATH = catalogPath
  }
})

afterAll(async () => {
  if (previousCatalogPath === undefined) delete process.env.MIDDARA_REVIEW_CATALOG_PATH
  else process.env.MIDDARA_REVIEW_CATALOG_PATH = previousCatalogPath
  if (tempDirectory && path.resolve(tempDirectory).startsWith(path.resolve(os.tmpdir()))) {
    await rm(tempDirectory, { recursive: true, force: true })
  }
})

describe('server-side Copyfit V3 approval evidence', () => {
  it('accepts an unchanged EXACT unit using catalog counts and persists a receipt', async () => {
    const exact = candidate('exact', 1, 1, 'EXACT')
    await setCatalog(catalogFor([exact]))

    const result = await approve(exact)

    expect(result.response.status).toBe(200)
    expect(result.body.confirmed).toBe(true)
    expect(payloadState.translations[0].data).toEqual(exact.data)
    expect(payloadState.reviews[0]).toMatchObject({
      proposalId: 'p100-test',
      proposalVersion: '1',
      copyfitClassification: 'EXACT',
      copyfitSourcePdfLineCount: 1,
      copyfitPageRendererLineCount: 1,
    })
  })

  it('accepts inherited canonical geometry while rejecting geometry changed after measurement', async () => {
    const measured = candidate('inherited-geometry', 1, 1, 'EXACT')
    const canonicalData = measured.data
    const rawProposalData: Record<string, unknown> = { ...canonicalData }
    delete rawProposalData.spanKey
    delete rawProposalData.bbox
    const inheritedGeometry = {
      ...measured,
      data: rawProposalData,
      requestData: canonicalData,
      fingerprint: fingerprint(canonicalData),
      canonicalSpanKey: canonicalData.spanKey,
      canonicalBbox: canonicalData.bbox,
    }
    await setCatalog(catalogFor([inheritedGeometry]))

    const accepted = await approve(inheritedGeometry)
    expect(accepted.response.status).toBe(200)
    expect(payloadState.translations[0].data).toEqual(canonicalData)

    payloadState.reviews = []
    payloadState.translations = []
    const changedGeometry = await approve(inheritedGeometry, {
      data: { ...canonicalData, bbox: [40, 50, 181, 64] },
    })
    expect(changedGeometry.response.status).toBe(409)
    expect(changedGeometry.body.error).toMatch(/medição Copyfit V3 canônica/u)
    expect(payloadState.translations).toHaveLength(0)
  })

  it('preserves a conflicting saved human translation when approval is attempted', async () => {
    const exact = candidate('human-conflict', 1, 1, 'EXACT')
    await setCatalog(catalogFor([exact]))
    const humanData = {
      ...exact.data,
      segments: [{ ...exact.data.segments[0], text: 'Human-approved wording' }],
    }
    payloadState.translations.push({
      id: 'human-translation',
      spanKey: exact.spanKey,
      language: 'pt-BR',
      data: humanData,
    })

    const result = await approve(exact)

    expect(result.response.status).toBe(409)
    expect(result.body.error).toMatch(/tradução humana diferente.*preservada/u)
    expect(payloadState.translations).toHaveLength(1)
    expect(payloadState.translations[0].data).toEqual(humanData)
    expect(payloadState.reviews).toHaveLength(0)
  })

  it('allows UNDER only with a written composition rationale', async () => {
    const under = candidate('under', 2, 1, 'UNDER')
    await setCatalog(catalogFor([under]))

    const rejected = await approve(under)
    expect(rejected.response.status).toBe(409)
    expect(rejected.body.error).toMatch(/UNDER precisa registrar/u)
    expect(payloadState.translations).toHaveLength(0)

    const accepted = await approve(under, { underCompositionJustification: 'The shorter heading preserves the full composition.' })
    expect(accepted.response.status).toBe(200)
    expect(accepted.body.confirmed).toBe(true)
  })

  it('rejects OVER even when the request claims fabricated EXACT counts', async () => {
    const over = candidate('over', 1, 2, 'OVER')
    await setCatalog(catalogFor([over]))

    const result = await approve(over, {
      copyfitClassification: 'EXACT',
      copyfitSourcePdfLineCount: 1,
      copyfitPageRendererLineCount: 1,
    })

    expect(result.response.status).toBe(409)
    expect(result.body.error).toMatch(/classificação enviada diverge/u)
    expect(payloadState.translations).toHaveLength(0)
  })

  it('rejects a canonically measured OVER unit when the request also reports OVER', async () => {
    const over = candidate('over-direct', 1, 2, 'OVER')
    await setCatalog(catalogFor([over]))

    const result = await approve(over)

    expect(result.response.status).toBe(409)
    expect(result.body.error).toMatch(/OVER/u)
    expect(payloadState.translations).toHaveLength(0)
    expect(payloadState.reviews).toHaveLength(0)
  })

  it('rejects receipt metadata that names a different proposal version', async () => {
    const exact = candidate('wrong-receipt-source', 1, 1, 'EXACT')
    await setCatalog(catalogFor([exact]))

    const result = await approve(exact, { proposalId: 'other-proposal', proposalVersion: '99' })

    expect(result.response.status).toBe(409)
    expect(result.body.error).toMatch(/medição Copyfit V3 canônica/u)
    expect(payloadState.translations).toHaveLength(0)
    expect(payloadState.reviews).toHaveLength(0)
  })

  it('rejects EXACT line counts when the canonical technical status records a DTP failure', async () => {
    const exact = candidate('blocked-geometry', 1, 1, 'EXACT')
    const catalog = catalogFor([exact])
    catalog.proposals[0].candidates[0].technicalStatus = 'blocked_dtp_geometry_after_exact_line_count'
    await setCatalog(catalog)

    const result = await approve(exact)

    expect(result.response.status).toBe(409)
    expect(result.body.error).toMatch(/validação técnica.*bloqueada/u)
    expect(payloadState.translations).toHaveLength(0)
  })

  it.each([
    { source: 'persisted review receipt', reviewStatus: 'stale_review_version', requestStatus: 'fit-awaiting-human-review' },
    { source: 'approval request', reviewStatus: 'fit-awaiting-human-review', requestStatus: 'stale_review_version' },
  ])('rejects stale Copyfit versions from the $source before publication', async ({ reviewStatus, requestStatus }) => {
    const exact = candidate('stale-review-version', 1, 1, 'EXACT')
    await setCatalog(catalogFor([exact]))
    const preservedHumanDraft = {
      ...exact.data,
      segments: [{ ...exact.data.segments[0], text: 'Human draft from the earlier proposal version' }],
    }
    payloadState.reviews.push({
      id: 'stale-review',
      reviewKey: exact.reviewKey,
      pageNumber: exact.pageNumber,
      spanKey: exact.spanKey,
      proposalId: exact.proposalId,
      proposalVersion: exact.proposalVersion,
      data: preservedHumanDraft,
      technicalStatus: reviewStatus,
      approvalStatus: 'pending',
      updatedAt: '2026-10-17T12:00:00.000Z',
    })

    const result = await approve(exact, {
      technicalStatus: requestStatus,
      expectedUpdatedAt: '2026-10-17T12:00:00.000Z',
    })

    expect(result.response.status).toBe(409)
    expect(result.body.error).toMatch(/mudou depois da medição Copyfit V3/u)
    expect(payloadState.translations).toHaveLength(0)
    expect(payloadState.reviews).toHaveLength(1)
    expect(payloadState.reviews[0].approvalStatus).toBe('pending')
    expect(payloadState.reviews[0].data).toEqual(preservedHumanDraft)
  })

  it('rejects an unmeasured candidate even when the request supplies counts and a fingerprint', async () => {
    const unmeasured = candidate('unmeasured', null, null, null)
    await setCatalog(catalogFor([unmeasured]))

    const result = await approve(unmeasured, {
      copyfitClassification: 'EXACT',
      copyfitSourcePdfLineCount: 1,
      copyfitPageRendererLineCount: 1,
      copyfitMeasurementFingerprint: fingerprint(unmeasured.data),
    })

    expect(result.response.status).toBe(409)
    expect(result.body.error).toMatch(/medição Copyfit V3 canônica/u)
    expect(payloadState.translations).toHaveLength(0)
  })

  it('rejects changed rich data even when the caller recomputes the public fingerprint', async () => {
    const exact = candidate('changed', 1, 1, 'EXACT')
    await setCatalog(catalogFor([exact]))
    const changedData = {
      ...exact.data,
      segments: [{ ...exact.data.segments[0], text: 'Changed after measurement' }],
    }

    const result = await approve(exact, {
      data: changedData,
      proposalText: 'Changed after measurement',
      copyfitMeasurementFingerprint: fingerprint(changedData),
    })

    expect(result.response.status).toBe(409)
    expect(result.body.error).toMatch(/medição Copyfit V3 canônica/u)
    expect(payloadState.translations).toHaveLength(0)
  })
})
