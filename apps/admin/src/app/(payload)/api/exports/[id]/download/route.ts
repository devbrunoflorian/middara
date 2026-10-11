import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  canAccessPdfExportJob,
  getPdfExportJob,
  getSafePdfExportOutputPath,
  isAllowedPdfExportOrigin,
  isValidPdfExportJobId,
  pdfExportCorsHeaders,
} from '@/services/pdf-export-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  return new Response(null, { status: origin && !isAllowedPdfExportOrigin(origin) ? 403 : 204, headers: pdfExportCorsHeaders(origin) })
}

export async function GET(request: Request, context: RouteContext) {
  const headers = pdfExportCorsHeaders(request.headers.get('origin'))
  const { id } = await context.params
  if (!isValidPdfExportJobId(id)) return Response.json({ error: 'Exportação não encontrada.' }, { status: 404, headers })
  const payload = await getPayload({ config: await configPromise })
  const job = await getPdfExportJob(payload, id)
  if (!job || !(await canAccessPdfExportJob(payload, request, job))) {
    return Response.json({ error: 'Exportação não encontrada.' }, { status: 404, headers })
  }
  if (job.status !== 'completed') {
    return Response.json({ error: 'O PDF ainda não está concluído.' }, { status: 409, headers })
  }
  if (!job.expiresAt || Date.parse(job.expiresAt) <= Date.now()) {
    return Response.json({ error: 'Este arquivo de exportação expirou.' }, { status: 410, headers })
  }
  const outputPath = await getSafePdfExportOutputPath(job)
  if (!outputPath) return Response.json({ error: 'O arquivo concluído não está disponível.' }, { status: 404, headers })
  const fileInfo = await stat(outputPath)
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Length', String(fileInfo.size))
  headers.set('Content-Disposition', `attachment; filename="${(job.downloadName ?? 'middara-rulebook.pdf').replace(/[^a-zA-Z0-9._-]/gu, '_')}"`)
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(Readable.toWeb(createReadStream(outputPath)) as ReadableStream, { headers })
}
