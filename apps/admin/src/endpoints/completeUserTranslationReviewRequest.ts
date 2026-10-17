import { commitTransaction, initTransaction, killTransaction, type Endpoint, type PayloadRequest } from 'payload'

type JsonRecord = Record<string, unknown>
type ReviewPublication = {
  translationId: number | string
  data: unknown
  frame?: { frameId: number | string; frameKey: string; data: JsonRecord }
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

async function findLayoutFrame(req: PayloadRequest, translationSpanKey: string, pageNumber: number) {
  const unitKey = translationSpanKey.replace(/__pt-BR$/u, '')
  const frameKey = `${unitKey}::pt-BR`
  const result = await req.payload.find({
    collection: 'layout-frames',
    where: { and: [
      { frameKey: { equals: frameKey } },
      { unitKey: { equals: unitKey } },
      { pageNumber: { equals: pageNumber } },
      { language: { equals: 'pt-BR' } },
    ] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (result.docs.length > 1) throw new Error('Há mais de um quadro salvo para esta unidade.')
  const frame = result.docs[0]
  if (!frame || !isRecord(frame.data)) return null
  const { x, y, width, height } = frame.data
  if (![x, y, width, height].every(value => typeof value === 'number' && Number.isFinite(value))
    || Number(width) <= 0 || Number(height) <= 0) return null
  return frame
}

function validateFinalData(data: unknown, pageNumber: number, translationSpanKey: string, legacyFrame: boolean): asserts data is JsonRecord {
  if (!isRecord(data) || data.schemaVersion !== 2 || !Array.isArray(data.segments) || !data.segments.length) {
    throw Object.assign(new Error('A tradução salva não contém segmentos ricos editáveis; conclua pela aprovação explícita da proposta.'), { status: 409 })
  }
  if (typeof data.spanKey === 'string' && !data.spanKey.startsWith(`page_${pageNumber}_`)) {
    throw Object.assign(new Error('A tradução salva não tem uma chave de renderização verificável para esta unidade.'), { status: 409 })
  }
  if (typeof data.spanKey === 'string' && data.spanKey !== translationSpanKey) {
    throw Object.assign(new Error('A chave da tradução PT-BR salva não corresponde à unidade do pedido.'), { status: 409 })
  }
  if (typeof data.spanKey !== 'string' && !legacyFrame) {
    throw Object.assign(new Error('A tradução salva não tem uma chave de renderização verificável para esta unidade.'), { status: 409 })
  }
  const bbox = data.bbox
  if ((!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(value => typeof value !== 'number' || !Number.isFinite(value))) && !legacyFrame) {
    throw Object.assign(new Error('A tradução salva não tem geometria X/Y/largura/altura verificável.'), { status: 409 })
  }
  if (!data.segments.every(segment => isRecord(segment) && typeof segment.text === 'string')
    || !(data.segments as JsonRecord[]).some(segment => (segment.text as string).trim())) {
    throw Object.assign(new Error('A tradução salva está vazia ou contém segmentos incompletos.'), { status: 409 })
  }
}

async function completeAsUser(req: PayloadRequest): Promise<Response> {
  let body: JsonRecord
  try {
    body = await (req as Request).json() as JsonRecord
  } catch {
    return response({ error: 'Corpo JSON inválido.' }, 400)
  }

  const requestId = typeof body.requestId === 'number' || typeof body.requestId === 'string'
    ? body.requestId
    : null
  const resultNote = typeof body.resultNote === 'string' ? body.resultNote.trim() : ''
  if (requestId === null) return response({ error: 'O identificador do pedido é obrigatório.' }, 400)
  if (!resultNote) return response({ error: 'Descreva o ajuste humano antes de concluir o pedido.' }, 400)

  const transactionStarted = await initTransaction(req)
  if (!transactionStarted && !req.transactionID) {
    return response({ error: 'O armazenamento não disponibilizou uma transação segura; o pedido continua aberto.' }, 503)
  }

  try {
    const id = /^\d+$/u.test(String(requestId)) ? Number(requestId) : requestId
    const reviewRequest = await req.payload.findByID({
      collection: 'translation-review-requests',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const confirmLegacyCompletion = body.confirmLegacyCompletion === true
    const isLegacyCompletedRequest = reviewRequest.status === 'completed' && !reviewRequest.completedBy
    if (isLegacyCompletedRequest && !confirmLegacyCompletion) {
      throw Object.assign(new Error('Confirme explicitamente a aprovação deste pedido legado.'), { status: 409 })
    }

    if (reviewRequest.status === 'completed' && reviewRequest.completedBy === 'user') {
      const review = reviewRequest.reviewKey ? await findReview(req, reviewRequest.reviewKey) : null
      const translationSpanKey = reviewRequest.translationSpanKey
        ?? (isRecord(review?.publication) && isRecord(review.publication.data)
          ? String(review.publication.data.spanKey ?? '')
          : '')
      const translation = translationSpanKey ? await findTranslation(req, translationSpanKey) : null
      if (review?.approvalStatus === 'approved' && isRecord(review.publication) && translation
        && String(review.publication.translationId) === String(translation.id)
        && canonical(review.publication.data) === canonical(translation.data)) {
        await commitTransaction(req)
        return response({ request: reviewRequest, review, translation, confirmed: true, idempotent: true })
      }
      throw Object.assign(new Error('O pedido está marcado como concluído, mas a aprovação não confere com a tradução atual.'), { status: 409 })
    }

    // Older user-completed requests may already have an approved receipt. Reconcile
    // only the request classification; keep its publication and final translation intact.
    if (isLegacyCompletedRequest && confirmLegacyCompletion) {
      const legacyReviewKey = typeof body.reviewKey === 'string' && body.reviewKey.trim()
        ? body.reviewKey.trim()
        : reviewRequest.reviewKey
      const legacyReview = legacyReviewKey ? await findReview(req, legacyReviewKey) : null
      const legacyPublication = isRecord(legacyReview?.publication) ? legacyReview.publication : null
      const legacyPublicationData = isRecord(legacyPublication?.data) ? legacyPublication.data : null
      const legacySpanKey = reviewRequest.translationSpanKey
        ?? (typeof body.translationSpanKey === 'string' ? body.translationSpanKey : null)
        ?? (typeof legacyPublicationData?.spanKey === 'string' ? legacyPublicationData.spanKey : null)
        ?? (isRecord(legacyReview?.data) && typeof legacyReview.data.spanKey === 'string' ? legacyReview.data.spanKey : null)
        ?? (typeof body.spanKey === 'string' ? body.spanKey.replace(/__pt-BR$/u, '') : null)
      const legacyTranslation = legacySpanKey ? await findTranslation(req, legacySpanKey) : null
      if (legacyReview?.approvalStatus === 'approved' && legacyPublication && legacyTranslation
        && String(legacyPublication.translationId) === String(legacyTranslation.id)
        && canonical(legacyPublication.data) === canonical(legacyTranslation.data)) {
        const reconciledRequest = await req.payload.update({
          collection: 'translation-review-requests',
          id: reviewRequest.id,
          data: { completedBy: 'user', translationSpanKey: legacySpanKey },
          depth: 0,
          overrideAccess: true,
          req,
        })
        const verifiedRequest = await req.payload.findByID({ collection: 'translation-review-requests', id: reviewRequest.id, depth: 0, overrideAccess: true, req })
        if (verifiedRequest.completedBy !== 'user' || verifiedRequest.status !== 'completed') {
          throw new Error('O Payload não confirmou a classificação do pedido como aprovado.')
        }
        await commitTransaction(req)
        return response({ request: reconciledRequest, review: legacyReview, translation: legacyTranslation, confirmed: true, idempotent: true })
      }
    }

    const canCompleteAsUser = reviewRequest.status === 'in_progress'
      || (reviewRequest.status === 'completed' && reviewRequest.completedBy === 'ai')
      || isLegacyCompletedRequest
    if (!canCompleteAsUser) {
      throw Object.assign(new Error('O pedido precisa estar em atendimento ou ter sido concluído pela IA antes da confirmação humana.'), { status: 409 })
    }
    if (reviewRequest.referenceType === 'page' || !reviewRequest.reviewKey || !reviewRequest.spanKey) {
      throw Object.assign(new Error('Este pedido não está ligado a uma unidade individual que possa ser aprovada.'), { status: 409 })
    }

    const requestedReviewKey = typeof body.reviewKey === 'string' && body.reviewKey.trim()
      ? body.reviewKey.trim()
      : reviewRequest.reviewKey
    const requestedSpanKey = typeof body.spanKey === 'string' && body.spanKey.trim()
      ? body.spanKey.trim()
      : reviewRequest.spanKey
    const requestUnitKey = reviewRequest.spanKey.replace(/__pt-BR$/u, '')
    const requestedUnitKey = requestedSpanKey.replace(/__pt-BR$/u, '')
    const sameSourceBlock = typeof body.sourceBlockId === 'string'
      && !!reviewRequest.sourceBlockId
      && body.sourceBlockId === reviewRequest.sourceBlockId
    if (requestedReviewKey !== reviewRequest.reviewKey
      && requestUnitKey !== requestedUnitKey
      && !sameSourceBlock) {
      throw Object.assign(new Error('O pedido não pode ser movido para outra unidade.'), { status: 409 })
    }
    const reviewKey = requestedReviewKey
    const review = await findReview(req, reviewKey)
    const publicationData = isRecord(review?.publication) && isRecord(review.publication.data)
      ? review.publication.data
      : null
    const reviewDataSpanKey = isRecord(review?.data) && typeof review.data.spanKey === 'string'
      ? review.data.spanKey
      : null
    const requestedTranslationSpanKey = typeof body.translationSpanKey === 'string' && body.translationSpanKey.trim()
      ? body.translationSpanKey.trim()
      : null
    const translationSpanKey = reviewRequest.translationSpanKey
      ?? (typeof publicationData?.spanKey === 'string' ? publicationData.spanKey : null)
      ?? reviewDataSpanKey
      ?? requestedTranslationSpanKey
      ?? requestedSpanKey.replace(/__pt-BR$/u, '')
    if (requestedTranslationSpanKey && requestedTranslationSpanKey !== translationSpanKey) {
      throw Object.assign(new Error('A chave da unidade mudou desde a criação do pedido. Reabra a unidade vinculada antes de concluir.'), { status: 409 })
    }
    const translation = await findTranslation(req, translationSpanKey)
    if (!translation) {
      throw Object.assign(new Error('Não encontrei a tradução PT-BR salva no Payload. Salve e aprove a unidade no Editor antes de concluir o pedido como usuário.'), { status: 409 })
    }
    if (translation.language !== 'pt-BR' || translation.spanKey !== translationSpanKey) {
      throw Object.assign(new Error('A tradução localizada não é uma unidade PT-BR correspondente ao pedido.'), { status: 409 })
    }

    const pageNumber = Number(reviewRequest.pageNumber)
    const layoutFrame = await findLayoutFrame(req, translationSpanKey, pageNumber)
    const translationData = isRecord(translation.data) ? translation.data : null
    const needsLegacyFrame = !translationData || typeof translationData.spanKey !== 'string'
      || !Array.isArray(translationData.bbox)
    if (needsLegacyFrame && !layoutFrame) {
      throw Object.assign(new Error('A unidade legada não tem um quadro X/Y/largura/altura salvo e verificável.'), { status: 409 })
    }
    validateFinalData(translation.data, pageNumber, translationSpanKey, !!layoutFrame)
    const now = new Date().toISOString()
    const previousPublication = isRecord(review?.publication)
      ? review.publication as unknown as ReviewPublication
      : null
    const samePublication = !!previousPublication
      && String(previousPublication.translationId) === String(translation.id)
      && canonical(previousPublication.data) === canonical(translation.data)
    const history = [...(previousPublication?.history ?? [])]
    if (previousPublication && !samePublication) {
      history.push({
        translationId: previousPublication.translationId,
        data: previousPublication.data,
        publishedAt: previousPublication.publishedAt,
        approvedAt: previousPublication.approvedAt ?? null,
        proposalId: review?.proposalId ?? reviewRequest.proposalId ?? 'human-request',
        proposalVersion: review?.proposalVersion ?? reviewRequest.proposalVersion ?? 'manual',
      })
    }
    const publication: ReviewPublication = samePublication
      ? { ...previousPublication!, ...(layoutFrame ? { frame: { frameId: layoutFrame.id, frameKey: layoutFrame.frameKey, data: layoutFrame.data as JsonRecord } } : {}), approvedAt: now, history }
      : {
          translationId: translation.id,
          data: translation.data,
          ...(layoutFrame ? { frame: { frameId: layoutFrame.id, frameKey: layoutFrame.frameKey, data: layoutFrame.data as JsonRecord } } : {}),
          publishedAt: now,
          approvedAt: now,
          history,
        }

    const requestContext = isRecord(reviewRequest.requestContext) ? reviewRequest.requestContext : {}
    const proposalId = (typeof body.proposalId === 'string' && body.proposalId) || reviewRequest.proposalId || review?.proposalId || `human-request-${reviewRequest.id}`
    const proposalVersion = (typeof body.proposalVersion === 'string' && body.proposalVersion) || reviewRequest.proposalVersion || review?.proposalVersion || 'manual'
    const technicalStatus = previousPublication && !samePublication
      ? 'changed_since_technical_validation'
      : review?.technicalStatus ?? 'not_recorded'
    const reviewData = {
      reviewKey,
      pageNumber,
      spanKey: requestedSpanKey,
      proposalId,
      proposalVersion,
      sourceText: typeof requestContext.sourceText === 'string' ? requestContext.sourceText : review?.sourceText ?? '',
      proposalText: typeof requestContext.proposalText === 'string' ? requestContext.proposalText : review?.proposalText ?? '',
      data: translation.data,
      technicalStatus,
      approvalStatus: 'approved' as const,
      approvedAt: now,
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
    const savedRequest = await req.payload.update({
      collection: 'translation-review-requests',
      id: reviewRequest.id,
      data: {
        reviewKey,
        spanKey: requestedSpanKey,
        proposalId,
        proposalVersion,
        translationSpanKey,
        status: 'completed',
        completedBy: 'user',
        resultNote,
        handledAt: now,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })

    const [verifiedReview, verifiedTranslation, verifiedRequest] = await Promise.all([
      findReview(req, reviewKey),
      findTranslation(req, translationSpanKey),
      req.payload.findByID({ collection: 'translation-review-requests', id: reviewRequest.id, depth: 0, overrideAccess: true, req }),
    ])
    if (!verifiedReview || !verifiedTranslation || !verifiedRequest
      || String(verifiedTranslation.id) !== String(translation.id)
      || canonical(verifiedTranslation.data) !== canonical(translation.data)
      || !isRecord(verifiedReview.publication)
      || String(verifiedReview.publication.translationId) !== String(translation.id)
      || canonical(verifiedReview.publication.data) !== canonical(translation.data)
      || verifiedReview.approvalStatus !== 'approved'
      || verifiedRequest.status !== 'completed'
      || verifiedRequest.completedBy !== 'user') {
      throw new Error('O Payload não confirmou a aprovação humana e o fechamento do pedido; nada foi confirmado.')
    }

    await commitTransaction(req)
    return response({ request: savedRequest, review: savedReview, translation: verifiedTranslation, confirmed: true })
  } catch (error) {
    await killTransaction(req)
    const status = isRecord(error) && typeof error.status === 'number' ? error.status : 500
    const message = error instanceof Error ? error.message : 'Falha ao confirmar a conclusão humana do pedido.'
    return response({ error: message }, status)
  }
}

export const completeUserTranslationReviewRequestEndpoint: Endpoint = {
  path: '/translation-review/complete-by-user',
  method: 'post',
  handler: completeAsUser,
}
