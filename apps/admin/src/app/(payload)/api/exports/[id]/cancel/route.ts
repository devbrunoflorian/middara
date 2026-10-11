import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  canAccessPdfExportJob,
  getPdfExportJob,
  isAllowedPdfExportOrigin,
  isValidPdfExportJobId,
  pdfExportCorsHeaders,
  publicPdfExportJob,
  requestPdfExportCancellation,
} from '@/services/pdf-export-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  return new Response(null, { status: origin && !isAllowedPdfExportOrigin(origin) ? 403 : 204, headers: pdfExportCorsHeaders(origin) })
}

export async function POST(request: Request, context: RouteContext) {
  const headers = pdfExportCorsHeaders(request.headers.get('origin'))
  const { id } = await context.params
  if (!isValidPdfExportJobId(id)) return Response.json({ error: 'Exportação não encontrada.' }, { status: 404, headers })
  const payload = await getPayload({ config: await configPromise })
  const job = await getPdfExportJob(payload, id)
  if (!job || !(await canAccessPdfExportJob(payload, request, job, true))) {
    return Response.json({ error: 'Exportação não encontrada.' }, { status: 404, headers })
  }
  const updated = await requestPdfExportCancellation(payload, job)
  return Response.json(publicPdfExportJob(updated), { status: 202, headers })
}
