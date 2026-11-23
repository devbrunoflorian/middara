import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { commitTransaction, initTransaction, killTransaction, type Endpoint, type PayloadRequest } from 'payload'
import { fileURLToPath } from 'node:url'

type JsonRecord = Record<string, unknown>

type Publication = {
  translationId: number | string
  data: unknown
  publishedAt: string
  approvedAt?: string
  history: Array<{
    translationId: number | string
    data: unknown
    publishedAt: string
    approvedAt: string | null
    proposalId: string
    proposalVersion: string
  }>
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizeSpanKeyForComparison(key: unknown): string {
  return String(key ?? '').replace(/__pt-BR$/u, '')
}

/**
 * Allow a measured revision to reconcile only known inline-spacing or line-height
 * edits made after the previous approval, and only when the candidate preserves
 * those edits plus every rich-run style and semantic symbol. Text itself is
 * intentionally allowed to change because this is the review being approved.
 */
function preservesPostPublicationFormatting(
  currentValue: unknown,
  previousValue: unknown,
  proposedValue: unknown,
  spanKey: string,
): boolean {
  if (!isRecord(currentValue) || !isRecord(previousValue) || !isRecord(proposedValue)
    || !Array.isArray(currentValue.segments) || !Array.isArray(previousValue.segments)
    || !Array.isArray(proposedValue.segments)) return false
  const current = currentValue as JsonRecord
  const previous = previousValue as JsonRecord
  const proposed = proposedValue as JsonRecord
  const withoutReconciledFields = (data: JsonRecord) => {
    const copy = { ...data }
    delete copy.spanKey
    delete copy.bbox
    delete copy.lineHeight
    delete copy.lineHeightMode
    delete copy.segments
    return copy
  }
  if (canonical(withoutReconciledFields(current)) !== canonical(withoutReconciledFields(previous))
    || canonical(withoutReconciledFields(current)) !== canonical(withoutReconciledFields(proposed))) return false
  if (normalizeSpanKeyForComparison(current.spanKey ?? spanKey) !== normalizeSpanKeyForComparison(spanKey)
    || normalizeSpanKeyForComparison(previous.spanKey ?? spanKey) !== normalizeSpanKeyForComparison(spanKey)
    || normalizeSpanKeyForComparison(proposed.spanKey ?? spanKey) !== normalizeSpanKeyForComparison(spanKey)) return false
  if ((current.bbox != null && canonical(current.bbox) !== canonical(previous.bbox))
    || canonical(proposed.bbox) !== canonical(previous.bbox)) return false

  const currentSegments = current.segments as JsonRecord[]
  const previousSegments = previous.segments as JsonRecord[]
  const proposedSegments = proposed.segments as JsonRecord[]
  const isWhitespaceOnly = (segment: JsonRecord) => typeof segment.text === 'string'
    && /^\s+$/u.test(segment.text) && segment.symbolId === undefined
  const withoutWhitespaceSegments = (segments: JsonRecord[]) => segments.filter(segment => !isWhitespaceOnly(segment))
  if (canonical(withoutWhitespaceSegments(currentSegments)) !== canonical(previousSegments)) return false
  const segmentStyles = (segments: JsonRecord[]) => segments.map(segment => {
    const style = { ...segment }
    delete style.text
    return style
  })
  if (canonical(segmentStyles(currentSegments)) !== canonical(segmentStyles(proposedSegments))) return false
  const whitespaceSlots = (segments: JsonRecord[]) => segments.map((segment, index) => ({
    index,
    text: segment.text,
    before: segments[index - 1]?.symbolId ?? null,
    after: segments[index + 1]?.symbolId ?? null,
  })).filter(slot => typeof slot.text === 'string' && /^\s+$/u.test(slot.text) && slot.after !== null)
  const currentWhitespace = whitespaceSlots(currentSegments)
  const previousWhitespace = whitespaceSlots(previousSegments)
  const proposedWhitespace = whitespaceSlots(proposedSegments)
  const whitespaceChanged = canonical(currentWhitespace) !== canonical(previousWhitespace)
  if (whitespaceChanged && canonical(currentWhitespace) !== canonical(proposedWhitespace)) return false

  const lineHeightChanged = current.lineHeight !== previous.lineHeight || current.lineHeightMode !== previous.lineHeightMode
  if (lineHeightChanged && (proposed.lineHeight !== current.lineHeight || proposed.lineHeightMode !== current.lineHeightMode)) return false
  if (!lineHeightChanged && !whitespaceChanged) return false
  const symbols = (segments: JsonRecord[]) => segments.filter(segment => typeof segment.symbolId === 'string').map(segment => segment.symbolId)
  if (canonical(symbols(currentSegments)) !== canonical(symbols(previousSegments))
    || canonical(symbols(currentSegments)) !== canonical(symbols(proposedSegments))) return false
  return true
}

/**
 * Explicitly adopt a live translation only when its rich text is already the
 * exact candidate and any persisted PageRenderer identity/frame metadata
 * matches Copyfit V3. This opt-in reconciles known post-publication edits
 * without discarding the live text or rewriting the previous publication
 * snapshot.
 */
function matchesLivePostPublicationRevision(
  currentValue: unknown,
  proposedValue: unknown,
  canonicalSpanKey: unknown,
  canonicalBbox: unknown,
): boolean {
  if (!isRecord(currentValue) || !isRecord(proposedValue)
    || typeof canonicalSpanKey !== 'string'
    || !Array.isArray(canonicalBbox) || canonicalBbox.length !== 4
    || canonicalBbox.some(value => typeof value !== 'number' || !Number.isFinite(value))) return false
  const current = currentValue as JsonRecord
  if (current.spanKey != null
    && normalizeSpanKeyForComparison(current.spanKey) !== normalizeSpanKeyForComparison(canonicalSpanKey)) return false
  if (current.bbox != null && canonical(current.bbox) !== canonical(canonicalBbox)) return false
  const normalizedLive = { ...current, spanKey: canonicalSpanKey, bbox: canonicalBbox }
  return canonical(normalizedLive) === canonical(proposedValue)
}

function copyfitMeasurementFingerprint(data: unknown): string | null {
  if (!isRecord(data) || !Array.isArray(data.segments)) return null
  const snapshot = {
    spanKey: normalizeSpanKeyForComparison(data.spanKey),
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

type CanonicalCopyfitEvidence = {
  proposalId: string
  proposalVersion: string
  classification: CopyfitClassification
  sourcePdfLineCount: number
  pageRendererLineCount: number
  fingerprint: string
  technicalStatus: string
  canonicalSpanKey: string
  canonicalBbox: [number, number, number, number]
}

type CanonicalIntentionalEmptyOverride = {
  proposalId: string
  proposalVersion: string
  technicalStatus: string
  canonicalSpanKey: string
  canonicalBbox: [number, number, number, number]
  reflowedIntoSpanKey: string
  reflowedIntoReviewKey: string
}

type CopyfitEvidenceIdentity = {
  reviewKey: string
  pageNumber: number
  spanKey: string
  proposalId?: string
  proposalVersion?: string
  data: unknown
}

/**
 * Resolve approval measurements only from the server-built review catalog.
 * Request fields cannot establish or upgrade a candidate's Copyfit V3 result.
 */
export function resolveCanonicalCopyfitEvidence(
  catalog: unknown,
  identity: CopyfitEvidenceIdentity,
): CanonicalCopyfitEvidence | null {
  if (!isRecord(catalog) || !Array.isArray(catalog.proposals)) return null
  const matches = (catalog.proposals as unknown[]).flatMap(proposal => {
    if (!isRecord(proposal) || !Array.isArray(proposal.candidates)) return []
    return proposal.candidates.filter(candidate => isRecord(candidate)
      && candidate.reviewKey === identity.reviewKey
      && candidate.pageNumber === identity.pageNumber
      && candidate.spanKey === identity.spanKey) as JsonRecord[]
  })
  if (matches.length !== 1) return null

  const candidate = matches[0]
  const proposalId = typeof candidate.proposalId === 'string' ? candidate.proposalId : null
  const proposalVersion = typeof candidate.proposalVersion === 'string' ? candidate.proposalVersion : null
  if (!proposalId || !proposalVersion
    || (identity.proposalId && identity.proposalId !== proposalId)
    || (identity.proposalVersion && identity.proposalVersion !== proposalVersion)) return null
  if (/changed[_-]since[_-]technical[_-]validation|stale[_-]review[_-]version/iu.test(String(candidate.technicalStatus ?? ''))) return null
  const sourcePdfLineCount = positiveLineCount(candidate.copyfitSourcePdfLineCount)
  const pageRendererLineCount = positiveLineCount(candidate.copyfitPageRendererLineCount)
  if (!sourcePdfLineCount || !pageRendererLineCount) return null
  const classification: CopyfitClassification = pageRendererLineCount === sourcePdfLineCount
    ? 'EXACT'
    : pageRendererLineCount < sourcePdfLineCount ? 'UNDER' : 'OVER'
  if (candidate.copyfitClassification !== classification) return null

  const fingerprint = typeof candidate.copyfitMeasurementFingerprint === 'string'
    ? candidate.copyfitMeasurementFingerprint : null
  const canonicalSpanKey = typeof candidate.copyfitCanonicalSpanKey === 'string'
    ? candidate.copyfitCanonicalSpanKey : null
  const canonicalBbox = Array.isArray(candidate.copyfitCanonicalBbox)
    && candidate.copyfitCanonicalBbox.length === 4
    && candidate.copyfitCanonicalBbox.every(value => typeof value === 'number' && Number.isFinite(value))
    && candidate.copyfitCanonicalBbox[2] > candidate.copyfitCanonicalBbox[0]
    && candidate.copyfitCanonicalBbox[3] > candidate.copyfitCanonicalBbox[1]
    ? candidate.copyfitCanonicalBbox as [number, number, number, number]
    : null
  if (!canonicalSpanKey || !canonicalBbox || !isRecord(candidate.data) || !Array.isArray(candidate.data.segments)) return null
  const canonicalData = { ...candidate.data, spanKey: canonicalSpanKey, bbox: canonicalBbox }
  const catalogFingerprint = copyfitMeasurementFingerprint(canonicalData)
  const submittedData = isRecord(identity.data)
    ? {
        ...identity.data,
        spanKey: normalizeSpanKeyForComparison(identity.data.spanKey) === normalizeSpanKeyForComparison(canonicalSpanKey)
          ? canonicalSpanKey
          : identity.data.spanKey,
      }
    : identity.data
  const submittedFingerprint = copyfitMeasurementFingerprint(submittedData)
  if (!fingerprint || fingerprint !== catalogFingerprint || fingerprint !== submittedFingerprint) return null

  return {
    proposalId,
    proposalVersion,
    classification,
    sourcePdfLineCount,
    pageRendererLineCount,
    fingerprint,
    technicalStatus: typeof candidate.technicalStatus === 'string' ? candidate.technicalStatus : '',
    canonicalSpanKey,
    canonicalBbox,
  }
}

/**
 * Resolve an empty override only when the server-built proposal explicitly
 * binds it to a measured sibling that absorbs the same source prose.
 */
export function resolveCanonicalIntentionalEmptyOverride(
  catalog: unknown,
  identity: CopyfitEvidenceIdentity,
): CanonicalIntentionalEmptyOverride | null {
  if (!isRecord(catalog) || !Array.isArray(catalog.proposals)) return null
  const matches: Array<{ proposal: JsonRecord; candidate: JsonRecord }> = []
  for (const rawProposal of catalog.proposals) {
    if (!isRecord(rawProposal) || !Array.isArray(rawProposal.candidates)) continue
    for (const rawCandidate of rawProposal.candidates) {
      if (isRecord(rawCandidate)
        && rawCandidate.reviewKey === identity.reviewKey
        && rawCandidate.pageNumber === identity.pageNumber
        && rawCandidate.spanKey === identity.spanKey) matches.push({ proposal: rawProposal, candidate: rawCandidate })
    }
  }
  if (matches.length !== 1) return null
  const { proposal, candidate } = matches[0]
  const proposalId = typeof candidate.proposalId === 'string' ? candidate.proposalId : null
  const proposalVersion = typeof candidate.proposalVersion === 'string' ? candidate.proposalVersion : null
  if (!proposalId || !proposalVersion
    || (identity.proposalId && identity.proposalId !== proposalId)
    || (identity.proposalVersion && identity.proposalVersion !== proposalVersion)) return null
  const directive = isRecord(candidate.intentionalEmptyOverride) ? candidate.intentionalEmptyOverride : null
  const data = isRecord(candidate.data) ? candidate.data : null
  const canonicalBbox = data && Array.isArray(data.bbox) && data.bbox.length === 4
    && data.bbox.every(value => typeof value === 'number' && Number.isFinite(value))
    && data.bbox[2] > data.bbox[0] && data.bbox[3] > data.bbox[1]
    ? data.bbox as [number, number, number, number]
    : null
  const canonicalSpanKey = typeof candidate.spanKey === 'string' ? candidate.spanKey : null
  const reflowedIntoSpanKey = typeof directive?.reflowedIntoSpanKey === 'string' ? directive.reflowedIntoSpanKey : null
  const technicalStatus = typeof candidate.technicalStatus === 'string' ? candidate.technicalStatus : ''
  if (!directive || !data || !canonicalBbox || !canonicalSpanKey || !reflowedIntoSpanKey
    || typeof directive.reason !== 'string' || !directive.reason.trim()
    || !/^intentional_empty_override(?:[_-]|$)/iu.test(technicalStatus)
    || String(candidate.proposalText ?? '').trim() !== ''
    || !Array.isArray(data.segments) || data.segments.length !== 0
    || typeof candidate.sourceText !== 'string' || !candidate.sourceText.trim()) return null

  const siblings = (proposal.candidates as unknown[]).filter(isRecord).filter(sibling =>
    sibling.pageNumber === identity.pageNumber
    && sibling.proposalId === proposalId
    && sibling.proposalVersion === proposalVersion
    && sibling.spanKey === reflowedIntoSpanKey
    && Array.isArray(sibling.absorbsSourceSpanKeys)
    && sibling.absorbsSourceSpanKeys.includes(canonicalSpanKey))
  if (siblings.length !== 1) return null
  const sibling = siblings[0]
  const sourceText = (value: unknown) => String(value ?? '')
    .replace(/\[\[[^\]]+\]\]/gu, ' ')
    .replace(/\uFFFC/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
  const absorbedSource = sourceText(candidate.sourceText)
  const parentSource = sourceText(sibling.sourceText)
  if (!absorbedSource || !parentSource.includes(absorbedSource)) return null
  const siblingIdentity: CopyfitEvidenceIdentity = {
    reviewKey: String(sibling.reviewKey ?? ''),
    pageNumber: identity.pageNumber,
    spanKey: String(sibling.spanKey ?? ''),
    proposalId,
    proposalVersion,
    data: sibling.data,
  }
  const siblingEvidence = resolveCanonicalCopyfitEvidence(catalog, siblingIdentity)
  if (!siblingEvidence || siblingEvidence.classification !== 'EXACT') return null

  const canonicalData = { ...data, spanKey: canonicalSpanKey, bbox: canonicalBbox }
  const canonicalFingerprint = copyfitMeasurementFingerprint(canonicalData)
  const submittedData = isRecord(identity.data)
    ? {
        ...identity.data,
        spanKey: normalizeSpanKeyForComparison(identity.data.spanKey) === normalizeSpanKeyForComparison(canonicalSpanKey)
          ? canonicalSpanKey
          : identity.data.spanKey,
      }
    : identity.data
  if (!canonicalFingerprint || canonicalFingerprint !== copyfitMeasurementFingerprint(submittedData)) return null
  return {
    proposalId,
    proposalVersion,
    technicalStatus,
    canonicalSpanKey,
    canonicalBbox,
    reflowedIntoSpanKey,
    reflowedIntoReviewKey: String(sibling.reviewKey),
  }
}

function isTechnicallyBlocked(status: string): boolean {
  return /^(?:blocked|failed)(?:[_-]|$)|(?:^|[_-])dtp[_-]exception[_-]open|stale[_-]review[_-]version/iu.test(status)
}

async function readCanonicalReviewCatalog(): Promise<unknown> {
  const endpointDirectory = path.dirname(fileURLToPath(import.meta.url))
  const candidatePaths = [
    process.env.MIDDARA_REVIEW_CATALOG_PATH,
    path.resolve(process.cwd(), '../web/public/translation-review/catalog.json'),
    path.resolve(process.cwd(), 'apps/web/public/translation-review/catalog.json'),
    path.resolve(endpointDirectory, '../../../web/public/translation-review/catalog.json'),
  ].filter(Boolean) as string[]

  for (const catalogPath of candidatePaths) {
    try {
      return JSON.parse(await readFile(catalogPath, 'utf8')) as unknown
    } catch {
      // try next candidate path
    }
  }
  throw new Error('Canonical catalog not found.')
}

function response(body: JsonRecord, status = 200): Response {
  return Response.json(body, { status })
}

async function findReview(req: PayloadRequest, reviewKey: string) {
  const result = await req.payload.find({
    collection: 'translation-reviews',
    where: { reviewKey: { equals: reviewKey } },
    limit: 2,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (result.docs.length > 1) throw new Error('A chave de revisão não é única.')
  return result.docs[0] ?? null
}

async function findTranslation(req: PayloadRequest, spanKey: string) {
  const normalizedKey = normalizeSpanKeyForComparison(spanKey)
  const candidateKeys = Array.from(new Set([spanKey, normalizedKey, `${normalizedKey}__pt-BR`]))
  const result = await req.payload.find({
    collection: 'translations',
    where: {
      and: [
        { spanKey: { in: candidateKeys } },
        { language: { equals: 'pt-BR' } },
      ],
    },
    limit: 5,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (result.docs.length > 1) {
    const exact = result.docs.find(doc => doc.spanKey === spanKey)
    if (exact) return exact
    const withSuffix = result.docs.find(doc => doc.spanKey === `${normalizedKey}__pt-BR`)
    if (withSuffix) return withSuffix
    return result.docs[0]
  }
  return result.docs[0] ?? null
}

/** Allow a legacy translation to gain only the already-persisted PT-BR frame metadata. */
async function preservesLegacyPersistedFrameOnly(
  req: PayloadRequest,
  pageNumber: number,
  spanKey: string,
  currentValue: unknown,
  proposedValue: unknown,
  canonicalBbox: unknown,
): Promise<boolean> {
  if (!isRecord(currentValue) || !isRecord(proposedValue)
    || !Array.isArray(canonicalBbox) || canonicalBbox.length !== 4
    || canonicalBbox.some(value => typeof value !== 'number' || !Number.isFinite(value))) return false
  const current = currentValue as JsonRecord
  const proposed = proposedValue as JsonRecord
  if (current.bbox != null
    || (current.spanKey != null && normalizeSpanKeyForComparison(current.spanKey) !== normalizeSpanKeyForComparison(spanKey))
    || normalizeSpanKeyForComparison(proposed.spanKey) !== normalizeSpanKeyForComparison(spanKey)
    || canonical(proposed.bbox) !== canonical(canonicalBbox)) return false

  const withoutFrameMetadata = (value: JsonRecord) => {
    const copy = { ...value }
    delete copy.bbox
    delete copy.spanKey
    return copy
  }
  if (canonical(withoutFrameMetadata(current)) !== canonical(withoutFrameMetadata(proposed))) return false

  const unitKey = normalizeSpanKeyForComparison(spanKey)
  const frameKey = `${unitKey}::pt-BR`
  const frames = await req.payload.find({
    collection: 'layout-frames',
    where: {
      and: [
        { pageNumber: { equals: pageNumber } },
        { language: { equals: 'pt-BR' } },
        { frameKey: { equals: frameKey } },
      ],
    },
    limit: 2,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (frames.docs.length !== 1 || !isRecord(frames.docs[0].data)) return false
  const frame = frames.docs[0].data as JsonRecord
  if ((frame.rotation != null && Number(frame.rotation) !== 0)
    || (proposed.textAlign && frame.textAlign !== proposed.textAlign)) return false
  const width = Number.isFinite(frame.total) ? Number(frame.total) : Number(frame.width)
  const height = Number.isFinite(frame.totalHeight) ? Number(frame.totalHeight) : Number(frame.height)
  const derivedBbox = [Number(frame.x), Number(frame.y), Number(frame.x) + width, Number(frame.y) + height]
  return derivedBbox.every((value, index) => Number.isFinite(value)
    && Math.abs(value - Number(canonicalBbox[index])) <= 0.01)
}

function validateTranslationData(data: unknown, pageNumber: number, canonicalSpanKey?: string, allowEmptyOverride = false): asserts data is JsonRecord {
  if (!isRecord(data) || data.schemaVersion !== 2 || !Array.isArray(data.segments)
    || (!allowEmptyOverride && !data.segments.length)) {
    throw new Error('A unidade não contém segmentos ricos editáveis para publicar.')
  }
  // Some source blocks use stable, page-local editorKey values (for example
  // p63_discipline_*). Accept those only when they exactly match the key from
  // the server-built canonical review candidate; legacy approvals still need
  // the ordinary page_XX_ prefix.
  const pageScopedKey = typeof data.spanKey === 'string' && data.spanKey.startsWith(`page_${pageNumber}_`)
  const canonicalEditorKey = typeof canonicalSpanKey === 'string' && data.spanKey === canonicalSpanKey
  if (!pageScopedKey && !canonicalEditorKey) {
    throw new Error('A chave de renderização não corresponde à página da unidade.')
  }
  const bbox = data.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('A geometria X/Y/largura/altura está ausente ou inválida.')
  }
  if (!data.segments.every(segment => isRecord(segment) && typeof segment.text === 'string')) {
    throw new Error('Os segmentos ricos da unidade estão incompletos.')
  }
  if (!allowEmptyOverride && !(data.segments as JsonRecord[]).some(segment => (segment.text as string).trim())) {
    throw new Error('Uma unidade sem conteúdo não pode ser publicada.')
  }
  if (allowEmptyOverride && data.segments.length !== 0) {
    throw new Error('Um override vazio intencional não pode conter texto ou símbolos.')
  }
}

function positiveLineCount(value: unknown): number | null {
  const count = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(count) && count > 0 ? count : null
}

type CopyfitClassification = 'EXACT' | 'UNDER' | 'OVER'

function copyfitClassification(value: unknown): CopyfitClassification | null {
  return value === 'EXACT' || value === 'UNDER' || value === 'OVER' ? value : null
}

async function approve(req: PayloadRequest): Promise<Response> {
  let body: JsonRecord
  try {
    body = await (req as Request).json() as JsonRecord
  } catch {
    return response({ error: 'Corpo JSON inválido.' }, 400)
  }

  const reviewKey = typeof body.reviewKey === 'string' ? body.reviewKey : ''
  const legacyApproval = body.legacyApproval === true
  if (!reviewKey) return response({ error: 'A chave da revisão é obrigatória.' }, 400)

  let canonicalCatalog: unknown = null
  if (!legacyApproval) {
    try {
      canonicalCatalog = await readCanonicalReviewCatalog()
    } catch {
      return response({ error: 'A evidência canônica do Copyfit V3 está indisponível; nenhuma aprovação foi gravada.' }, 503)
    }
  }

  const transactionStarted = await initTransaction(req)
  if (!transactionStarted && !req.transactionID) {
    return response({ error: 'O armazenamento não disponibilizou uma transação segura; nada foi gravado.' }, 503)
  }

  try {
    const review = await findReview(req, reviewKey)
    const requestedCopyfit = copyfitClassification(body.copyfitClassification)
    if (body.copyfitClassification != null && !requestedCopyfit) {
      throw Object.assign(new Error('A classificação Copyfit V3 informada é inválida.'), { status: 409 })
    }
    const reviewTechnicalStatus = typeof review?.technicalStatus === 'string' ? review.technicalStatus : ''
    const requestedTechnicalStatus = typeof body.technicalStatus === 'string' ? body.technicalStatus : ''
    if (!legacyApproval && /changed[_-]since[_-]technical[_-]validation|stale[_-]review[_-]version/iu.test(`${reviewTechnicalStatus} ${requestedTechnicalStatus}`)) {
      throw Object.assign(new Error('A proposta, o texto ou a geometria mudou depois da medição Copyfit V3. Valide novamente esta versão antes de aprovar.'), { status: 409 })
    }
    const requestPageNumber = Number(review?.pageNumber ?? body.pageNumber)
    const requestSpanKey = typeof body.spanKey === 'string' ? body.spanKey : review?.spanKey ?? ''
    const canonicalEvidence = legacyApproval ? null : resolveCanonicalCopyfitEvidence(canonicalCatalog, {
      reviewKey,
      pageNumber: requestPageNumber,
      spanKey: requestSpanKey,
      ...(typeof body.proposalId === 'string' ? { proposalId: body.proposalId } : {}),
      ...(typeof body.proposalVersion === 'string' ? { proposalVersion: body.proposalVersion } : {}),
      data: body.data,
    })
    const emptyOverrideEvidence = legacyApproval ? null : resolveCanonicalIntentionalEmptyOverride(canonicalCatalog, {
      reviewKey,
      pageNumber: requestPageNumber,
      spanKey: requestSpanKey,
      ...(typeof body.proposalId === 'string' ? { proposalId: body.proposalId } : {}),
      ...(typeof body.proposalVersion === 'string' ? { proposalVersion: body.proposalVersion } : {}),
      data: body.data,
    })
    if (!legacyApproval && !canonicalEvidence && !emptyOverrideEvidence) {
      const matchingCandidate = isRecord(canonicalCatalog) && Array.isArray(canonicalCatalog.proposals)
        ? canonicalCatalog.proposals.flatMap(proposal => isRecord(proposal) && Array.isArray(proposal.candidates)
          ? proposal.candidates.filter(candidate => isRecord(candidate) && candidate.reviewKey === reviewKey && candidate.pageNumber === requestPageNumber && candidate.spanKey === requestSpanKey)
          : [])[0]
        : null
      throw Object.assign(new Error('Não existe uma medição Copyfit V3 canônica para estes dados e esta versão; nenhuma aprovação foi gravada.'), { status: 409 })
    }
    const evidenceProposalId = canonicalEvidence?.proposalId ?? emptyOverrideEvidence?.proposalId
    const evidenceProposalVersion = canonicalEvidence?.proposalVersion ?? emptyOverrideEvidence?.proposalVersion
    if (!legacyApproval && review
      && ((review.proposalId && review.proposalId !== evidenceProposalId)
        || (review.proposalVersion && review.proposalVersion !== evidenceProposalVersion))) {
      throw Object.assign(new Error('O recibo de revisão aponta para outra proposta ou versão; recarregue a unidade canônica antes de aprovar.'), { status: 409 })
    }
    const sourceLines = emptyOverrideEvidence ? null : legacyApproval
      ? positiveLineCount(body.copyfitSourcePdfLineCount ?? review?.copyfitSourcePdfLineCount)
      : canonicalEvidence!.sourcePdfLineCount
    const renderedLines = emptyOverrideEvidence ? null : legacyApproval
      ? positiveLineCount(body.copyfitPageRendererLineCount ?? review?.copyfitPageRendererLineCount)
      : canonicalEvidence!.pageRendererLineCount
    if (!legacyApproval && !emptyOverrideEvidence && requestedCopyfit && requestedCopyfit !== canonicalEvidence!.classification) {
      throw Object.assign(new Error('A classificação enviada diverge da medição Copyfit V3 canônica.'), { status: 409 })
    }
    if ((sourceLines && !renderedLines) || (!sourceLines && renderedLines)) {
      throw Object.assign(new Error('A medição Copyfit V3 está incompleta; informe as duas contagens visuais.'), { status: 409 })
    }
    const measuredCopyfit = sourceLines && renderedLines
      ? renderedLines === sourceLines ? 'EXACT' : renderedLines < sourceLines ? 'UNDER' : 'OVER'
      : null
    const storedCopyfit = copyfitClassification(review?.copyfitClassification)
    // A published approval is allowed to receive a freshly measured copyfit
    // classification along with a revised translation. Its saved classification
    // describes the previous publication and must not block that revision.
    const revisingPublishedApproval = review?.approvalStatus === 'approved' && isRecord(review.publication)
    const approvedCopyfit: CopyfitClassification | null = emptyOverrideEvidence ? null : legacyApproval
      ? measuredCopyfit ?? storedCopyfit ?? requestedCopyfit
      : canonicalEvidence!.classification
    if (measuredCopyfit && ((requestedCopyfit && requestedCopyfit !== measuredCopyfit)
      || (storedCopyfit && storedCopyfit !== measuredCopyfit && !revisingPublishedApproval))) {
      throw Object.assign(new Error(`A classificação Copyfit V3 declarada diverge das linhas medidas (${sourceLines} EN / ${renderedLines} PT-BR).`), { status: 409 })
    }
    const storedFingerprint = typeof review?.copyfitMeasurementFingerprint === 'string'
      ? review.copyfitMeasurementFingerprint : null
    const requestedFingerprint = typeof body.copyfitMeasurementFingerprint === 'string'
      ? body.copyfitMeasurementFingerprint : null
    // Its old fingerprint must not block a measured correction to the same
    // publication; the publication/translation pair is checked before any write.
    if (!legacyApproval && !emptyOverrideEvidence
      && ((storedFingerprint && storedFingerprint !== canonicalEvidence!.fingerprint && !revisingPublishedApproval)
        || (requestedFingerprint && requestedFingerprint !== canonicalEvidence!.fingerprint))) {
      throw Object.assign(new Error('O comprovante salvo ou enviado diverge da medição Copyfit V3 canônica.'), { status: 409 })
    }
    const compositionRationale = typeof body.underCompositionJustification === 'string'
      ? body.underCompositionJustification.trim()
      : typeof review?.underCompositionJustification === 'string' ? review.underCompositionJustification.trim() : ''
    const copyfitOver = approvedCopyfit === 'OVER'
      || /blocked[-_]line[-_]count[-_]over|blocked[-_]copyfit[-_]v3[-_]over/iu.test(reviewTechnicalStatus)
      || /blocked[-_]line[-_]count[-_]over|blocked[-_]copyfit[-_]v3[-_]over/iu.test(requestedTechnicalStatus)
    if (copyfitOver) {
      throw Object.assign(new Error('Copyfit V3 OVER não pode ser aprovado. Reduza a contagem visual de linhas e valide a nova versão.'), { status: 409 })
    }
    if (!legacyApproval && !emptyOverrideEvidence && isTechnicallyBlocked(canonicalEvidence!.technicalStatus)) {
      throw Object.assign(new Error('A validação técnica desta proposta está bloqueada; corrija a falha registrada antes de aprovar.'), { status: 409 })
    }
    if (approvedCopyfit === 'UNDER' && !compositionRationale) {
      throw Object.assign(new Error('Uma proposta UNDER precisa registrar por que a composição visual mais curta foi preservada.'), { status: 409 })
    }
    if (legacyApproval && (!review || review.approvalStatus !== 'approved' || review.publication)) {
      throw Object.assign(new Error('Esta aprovação já foi migrada ou não é uma aprovação legada.'), { status: 409 })
    }

    const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null
    if (!legacyApproval && expectedUpdatedAt && (!review || review.updatedAt !== expectedUpdatedAt)) {
      throw Object.assign(new Error('A revisão mudou desde que foi aberta. Recarregue o painel antes de aprovar.'), { status: 409 })
    }

    const pageNumber = Number(review?.pageNumber ?? body.pageNumber)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('Número de página inválido para aprovação.')
    if (!legacyApproval && review && Number(body.pageNumber) !== review.pageNumber) {
      throw Object.assign(new Error('A proposta mudou de página desde que foi aberta.'), { status: 409 })
    }
    const data = legacyApproval ? review!.data : body.data
    const canonicalSpanKey = canonicalEvidence?.canonicalSpanKey ?? emptyOverrideEvidence?.canonicalSpanKey
    const canonicalBbox = canonicalEvidence?.canonicalBbox ?? emptyOverrideEvidence?.canonicalBbox
    validateTranslationData(data, pageNumber, legacyApproval ? undefined : canonicalSpanKey, !!emptyOverrideEvidence)
    if (!legacyApproval && canonicalSpanKey && isRecord(data)) {
      data.spanKey = canonicalSpanKey
      if (canonicalBbox) data.bbox = canonicalBbox
    }
    const expectedMeasurementFingerprint = legacyApproval
      ? requestedFingerprint ?? storedFingerprint
      : canonicalEvidence?.fingerprint ?? null
    const actualMeasurementFingerprint = copyfitMeasurementFingerprint(data)
    if (!legacyApproval && !emptyOverrideEvidence && (!expectedMeasurementFingerprint || !actualMeasurementFingerprint)) {
      throw Object.assign(new Error('A medição Copyfit V3 não está vinculada aos dados ricos desta versão.'), { status: 409 })
    }
    if (expectedMeasurementFingerprint && actualMeasurementFingerprint !== expectedMeasurementFingerprint) {
      throw Object.assign(new Error('Os segmentos, estilos ou geometria mudaram depois da medição Copyfit V3. Valide esta versão antes de aprovar.'), { status: 409 })
    }
    const targetSpanKey = canonicalSpanKey ?? String(data.spanKey)
    const existingTranslation = await findTranslation(req, targetSpanKey)
    if (emptyOverrideEvidence) {
      const parentReview = await findReview(req, emptyOverrideEvidence.reflowedIntoReviewKey)
      const parentPublication = isRecord(parentReview?.publication)
        ? parentReview.publication as unknown as Publication
        : null
      const parentTranslation = parentReview ? await findTranslation(req, parentReview.spanKey) : null
      if (!parentReview || parentReview.approvalStatus !== 'approved' || !parentPublication
        || !parentTranslation || String(parentTranslation.id) !== String(parentPublication.translationId)
        || canonical(parentTranslation.data) !== canonical(parentPublication.data)) {
        throw Object.assign(new Error('A unidade fonte só pode ficar vazia depois que a tradução que absorve seu texto estiver publicada e confirmada.'), { status: 409 })
      }
    }
    const reviewPublication = review?.publication
    const existingPublication = isRecord(reviewPublication)
      ? reviewPublication as unknown as Publication
      : null
    let legacyFrameSync = false

    if (existingPublication) {
      if (!existingTranslation || String(existingTranslation.id) !== String(existingPublication.translationId)) {
        throw Object.assign(new Error('A tradução publicada foi removida ou substituída fora da revisão. Nenhum conteúdo foi alterado.'), { status: 409 })
      }
      const translationMatchesPublication = canonical(existingTranslation.data) === canonical(existingPublication.data)
      const formattingDriftPreserved = !translationMatchesPublication
        && preservesPostPublicationFormatting(existingTranslation.data, existingPublication.data, data, targetSpanKey)
      const explicitLiveRevision = body.reconcilePublishedDraft === true
        && review?.approvalStatus === 'approved'
        && typeof body.expectedUpdatedAt === 'string'
        && body.expectedUpdatedAt === review.updatedAt
        && matchesLivePostPublicationRevision(existingTranslation.data, data, canonicalSpanKey, canonicalBbox)
      if (!translationMatchesPublication && !formattingDriftPreserved && !explicitLiveRevision) {
        throw Object.assign(new Error('A tradução final mudou desde a última aprovação. Ela foi preservada; confira o conflito antes de publicar.'), { status: 409 })
      }
    } else if (existingTranslation && canonical(existingTranslation.data) !== canonical(data)) {
      legacyFrameSync = !!(canonicalBbox && await preservesLegacyPersistedFrameOnly(
        req, requestPageNumber, targetSpanKey, existingTranslation.data, data, canonicalBbox,
      ))
      if (!legacyFrameSync) {
        throw Object.assign(new Error('Já existe uma tradução humana diferente nesta unidade. Ela foi preservada e não foi sobrescrita.'), { status: 409 })
      }
    }

    const now = new Date().toISOString()
    const approvedAt = legacyApproval && typeof review?.approvedAt === 'string'
      ? review.approvedAt
      : now
    let translation = existingTranslation
    if (!translation) {
      translation = await req.payload.create({
        collection: 'translations',
        data: { spanKey: targetSpanKey, language: 'pt-BR', data },
        depth: 0,
        overrideAccess: true,
        req,
      })
    } else if (existingPublication && canonical(existingTranslation.data) !== canonical(data)) {
      translation = await req.payload.update({
        collection: 'translations',
        id: existingTranslation.id,
        data: { data },
        depth: 0,
        overrideAccess: true,
        req,
      })
    } else if (legacyFrameSync) {
      translation = await req.payload.update({
        collection: 'translations',
        id: existingTranslation!.id,
        data: { data },
        depth: 0,
        overrideAccess: true,
        req,
      })
    }

    const history = [...(existingPublication?.history ?? [])]
    if (existingPublication && canonical(existingPublication.data) !== canonical(data)) {
      history.push({
        translationId: existingPublication.translationId,
        data: existingPublication.data,
        publishedAt: existingPublication.publishedAt,
        approvedAt: existingPublication.approvedAt
          ?? (typeof review?.approvedAt === 'string' ? review.approvedAt : null),
        proposalId: review?.proposalId ?? String(body.proposalId ?? 'unknown'),
        proposalVersion: review?.proposalVersion ?? String(body.proposalVersion ?? 'unknown'),
      })
    }
    const publication: Publication = {
      translationId: translation.id,
      data,
      publishedAt: now,
      approvedAt,
      history,
    }

    const proposalId = legacyApproval
      ? typeof body.proposalId === 'string' ? body.proposalId : review?.proposalId ?? 'unknown'
      : canonicalEvidence?.proposalId ?? emptyOverrideEvidence!.proposalId
    const proposalVersion = legacyApproval
      ? typeof body.proposalVersion === 'string' ? body.proposalVersion : review?.proposalVersion ?? 'unknown'
      : canonicalEvidence?.proposalVersion ?? emptyOverrideEvidence!.proposalVersion
    const sourceText = typeof body.sourceText === 'string' ? body.sourceText : review?.sourceText ?? ''
    const proposalText = typeof body.proposalText === 'string' ? body.proposalText : review?.proposalText ?? ''
    const technicalStatus = typeof body.technicalStatus === 'string' ? body.technicalStatus : review?.technicalStatus ?? 'pending_technical_validation'
    const reviewData = {
      reviewKey,
      pageNumber,
      spanKey: typeof body.spanKey === 'string' ? body.spanKey : review?.spanKey ?? targetSpanKey,
      proposalId,
      proposalVersion,
      sourceText,
      proposalText,
      data,
      technicalStatus,
      copyfitClassification: approvedCopyfit,
      copyfitSourcePdfLineCount: sourceLines,
      copyfitPageRendererLineCount: renderedLines,
      copyfitMeasurementFingerprint: emptyOverrideEvidence ? null : actualMeasurementFingerprint,
      underCompositionJustification: compositionRationale,
      approvalStatus: 'approved' as const,
      approvedAt,
      publication,
    }
    const savedReview = review
      ? await req.payload.update({
        collection: 'translation-reviews',
        id: review.id,
        data: reviewData,
        depth: 0,
        overrideAccess: true,
        req,
      })
      : await req.payload.create({
        collection: 'translation-reviews',
        data: reviewData,
        depth: 0,
        overrideAccess: true,
        req,
      })

    const verifiedTranslation = await findTranslation(req, targetSpanKey)
    const verifiedReview = await findReview(req, reviewKey)
    if (!verifiedTranslation || !verifiedReview
      || String(verifiedTranslation.id) !== String(translation.id)
      || canonical(verifiedTranslation.data) !== canonical(data)
      || !isRecord(verifiedReview.publication)
      || String(verifiedReview.publication.translationId) !== String(translation.id)
      || canonical(verifiedReview.publication.data) !== canonical(data)
      || verifiedReview.approvalStatus !== 'approved') {
      throw new Error('A confirmação de leitura após gravação não corresponde ao conteúdo aprovado.')
    }

    await commitTransaction(req)
    return response({ doc: savedReview, translation, confirmed: true })
  } catch (error) {
    await killTransaction(req)
    const status = isRecord(error) && typeof error.status === 'number' ? error.status : 500
    const message = error instanceof Error ? error.message : 'Falha ao persistir a aprovação.'
    return response({ error: message }, status)
  }
}

export const approveTranslationReviewEndpoint: Endpoint = {
  path: '/translation-review/approve',
  method: 'post',
  handler: approve,
}
