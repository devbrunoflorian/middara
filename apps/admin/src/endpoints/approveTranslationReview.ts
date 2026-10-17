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

function copyfitMeasurementFingerprint(data: unknown): string | null {
  if (!isRecord(data) || !Array.isArray(data.segments)) return null
  const snapshot = {
    spanKey: data.spanKey,
    bbox: data.bbox,
    textAlign: data.textAlign,
    lineHeight: data.lineHeight,
    lineHeightMode: data.lineHeightMode,
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
  const submittedFingerprint = copyfitMeasurementFingerprint(identity.data)
  if (!fingerprint || fingerprint !== catalogFingerprint || fingerprint !== submittedFingerprint) return null

  return {
    proposalId,
    proposalVersion,
    classification,
    sourcePdfLineCount,
    pageRendererLineCount,
    fingerprint,
    technicalStatus: typeof candidate.technicalStatus === 'string' ? candidate.technicalStatus : '',
  }
}

function isTechnicallyBlocked(status: string): boolean {
  return /^(?:blocked|failed)(?:[_-]|$)|(?:^|[_-])dtp[_-]exception[_-]open|stale[_-]review[_-]version/iu.test(status)
}

async function readCanonicalReviewCatalog(): Promise<unknown> {
  const endpointDirectory = path.dirname(fileURLToPath(import.meta.url))
  const catalogPath = process.env.MIDDARA_REVIEW_CATALOG_PATH
    ?? path.resolve(endpointDirectory, '../../../web/public/translation-review/catalog.json')
  return JSON.parse(await readFile(catalogPath, 'utf8')) as unknown
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
  const result = await req.payload.find({
    collection: 'translations',
    where: { and: [{ spanKey: { equals: spanKey } }, { language: { equals: 'pt-BR' } }] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (result.docs.length > 1) throw new Error('Há mais de uma tradução final para esta unidade.')
  return result.docs[0] ?? null
}

function validateTranslationData(data: unknown, pageNumber: number): asserts data is JsonRecord {
  if (!isRecord(data) || data.schemaVersion !== 2 || !Array.isArray(data.segments) || !data.segments.length) {
    throw new Error('A unidade não contém segmentos ricos editáveis para publicar.')
  }
  if (typeof data.spanKey !== 'string' || !data.spanKey.startsWith(`page_${pageNumber}_`)) {
    throw new Error('A chave de renderização não corresponde à página da unidade.')
  }
  const bbox = data.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('A geometria X/Y/largura/altura está ausente ou inválida.')
  }
  if (!data.segments.every(segment => isRecord(segment) && typeof segment.text === 'string')) {
    throw new Error('Os segmentos ricos da unidade estão incompletos.')
  }
  if (!(data.segments as JsonRecord[]).some(segment => (segment.text as string).trim())) {
    throw new Error('Uma unidade sem conteúdo não pode ser publicada.')
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
    if (!legacyApproval && !canonicalEvidence) {
      throw Object.assign(new Error('Não existe uma medição Copyfit V3 canônica para estes dados e esta versão; nenhuma aprovação foi gravada.'), { status: 409 })
    }
    if (!legacyApproval && review
      && ((review.proposalId && review.proposalId !== canonicalEvidence!.proposalId)
        || (review.proposalVersion && review.proposalVersion !== canonicalEvidence!.proposalVersion))) {
      throw Object.assign(new Error('O recibo de revisão aponta para outra proposta ou versão; recarregue a unidade canônica antes de aprovar.'), { status: 409 })
    }
    const sourceLines = legacyApproval
      ? positiveLineCount(body.copyfitSourcePdfLineCount ?? review?.copyfitSourcePdfLineCount)
      : canonicalEvidence!.sourcePdfLineCount
    const renderedLines = legacyApproval
      ? positiveLineCount(body.copyfitPageRendererLineCount ?? review?.copyfitPageRendererLineCount)
      : canonicalEvidence!.pageRendererLineCount
    if (!legacyApproval && requestedCopyfit && requestedCopyfit !== canonicalEvidence!.classification) {
      throw Object.assign(new Error('A classificação enviada diverge da medição Copyfit V3 canônica.'), { status: 409 })
    }
    if ((sourceLines && !renderedLines) || (!sourceLines && renderedLines)) {
      throw Object.assign(new Error('A medição Copyfit V3 está incompleta; informe as duas contagens visuais.'), { status: 409 })
    }
    const measuredCopyfit = sourceLines && renderedLines
      ? renderedLines === sourceLines ? 'EXACT' : renderedLines < sourceLines ? 'UNDER' : 'OVER'
      : null
    const storedCopyfit = copyfitClassification(review?.copyfitClassification)
    const approvedCopyfit: CopyfitClassification | null = legacyApproval
      ? measuredCopyfit ?? storedCopyfit ?? requestedCopyfit
      : canonicalEvidence!.classification
    if (measuredCopyfit && ((requestedCopyfit && requestedCopyfit !== measuredCopyfit)
      || (storedCopyfit && storedCopyfit !== measuredCopyfit))) {
      throw Object.assign(new Error(`A classificação Copyfit V3 declarada diverge das linhas medidas (${sourceLines} EN / ${renderedLines} PT-BR).`), { status: 409 })
    }
    const storedFingerprint = typeof review?.copyfitMeasurementFingerprint === 'string'
      ? review.copyfitMeasurementFingerprint : null
    const requestedFingerprint = typeof body.copyfitMeasurementFingerprint === 'string'
      ? body.copyfitMeasurementFingerprint : null
    if (!legacyApproval && ((storedFingerprint && storedFingerprint !== canonicalEvidence!.fingerprint)
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
    if (!legacyApproval && isTechnicallyBlocked(canonicalEvidence!.technicalStatus)) {
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
    validateTranslationData(data, pageNumber)
    const expectedMeasurementFingerprint = legacyApproval
      ? requestedFingerprint ?? storedFingerprint
      : canonicalEvidence!.fingerprint
    const actualMeasurementFingerprint = copyfitMeasurementFingerprint(data)
    if (!legacyApproval && (!expectedMeasurementFingerprint || !actualMeasurementFingerprint)) {
      throw Object.assign(new Error('A medição Copyfit V3 não está vinculada aos dados ricos desta versão.'), { status: 409 })
    }
    if (expectedMeasurementFingerprint && actualMeasurementFingerprint !== expectedMeasurementFingerprint) {
      throw Object.assign(new Error('Os segmentos, estilos ou geometria mudaram depois da medição Copyfit V3. Valide esta versão antes de aprovar.'), { status: 409 })
    }
    const targetSpanKey = String(data.spanKey)
    const existingTranslation = await findTranslation(req, targetSpanKey)
    const reviewPublication = review?.publication
    const existingPublication = isRecord(reviewPublication)
      ? reviewPublication as unknown as Publication
      : null

    if (existingPublication) {
      if (!existingTranslation || String(existingTranslation.id) !== String(existingPublication.translationId)) {
        throw Object.assign(new Error('A tradução publicada foi removida ou substituída fora da revisão. Nenhum conteúdo foi alterado.'), { status: 409 })
      }
      if (canonical(existingTranslation.data) !== canonical(existingPublication.data)) {
        throw Object.assign(new Error('A tradução final mudou desde a última aprovação. Ela foi preservada; confira o conflito antes de publicar.'), { status: 409 })
      }
    } else if (existingTranslation && canonical(existingTranslation.data) !== canonical(data)) {
      throw Object.assign(new Error('Já existe uma tradução humana diferente nesta unidade. Ela foi preservada e não foi sobrescrita.'), { status: 409 })
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
      : canonicalEvidence!.proposalId
    const proposalVersion = legacyApproval
      ? typeof body.proposalVersion === 'string' ? body.proposalVersion : review?.proposalVersion ?? 'unknown'
      : canonicalEvidence!.proposalVersion
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
      copyfitMeasurementFingerprint: actualMeasurementFingerprint,
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
