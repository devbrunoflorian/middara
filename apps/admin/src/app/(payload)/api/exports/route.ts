import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  authenticatePdfExportRequest,
  createPdfExportJob,
  isAllowedPdfExportOrigin,
  pdfExportCorsHeaders,
  publicPdfExportJob,
} from '@/services/pdf-export-jobs'
import { PdfExportInputError } from '@/services/pdf-export-input'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  return new Response(null, { status: origin && !isAllowedPdfExportOrigin(origin) ? 403 : 204, headers: pdfExportCorsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = pdfExportCorsHeaders(origin)
  if (origin && !isAllowedPdfExportOrigin(origin)) return Response.json({ error: 'Origem não autorizada.' }, { status: 403, headers })

  const payload = await getPayload({ config: await configPromise })
  const userId = await authenticatePdfExportRequest(payload, request)
  if (!origin && !userId) return Response.json({ error: 'Origem da solicitação ausente.' }, { status: 403, headers })
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 16_384) return Response.json({ error: 'Solicitação de exportação muito grande.' }, { status: 413, headers })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return Response.json({ error: 'Corpo JSON inválido.' }, { status: 400, headers })
  }

  try {
    const job = await createPdfExportJob(payload, request, input)
    return Response.json(publicPdfExportJob(job), { status: 202, headers })
  } catch (error) {
    const status = error instanceof PdfExportInputError
      ? error.statusCode
      : Number((error as { statusCode?: unknown })?.statusCode) || 500
    const message = status < 500 && error instanceof Error
      ? error.message
      : 'Não foi possível preparar a exportação. Confira se o PDF-fonte e o Payload estão disponíveis.'
    return Response.json({ error: message }, { status, headers })
  }
}
