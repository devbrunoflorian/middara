import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, appendFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { Payload } from 'payload'

import { normalizePdfExportRequest, type PdfExportRequest } from './pdf-export-input'

type JobDoc = {
  id: string | number
  jobId: string
  ownerId?: string | null
  language: 'en' | 'pt-BR'
  profile: 'visual' | 'editable'
  pages: number[]
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  completedPages: number
  totalPages: number
  currentPage?: number | null
  stage: string
  cancelRequested?: boolean
  snapshotPath?: string | null
  snapshotHash?: string | null
  outputPath?: string | null
  downloadName?: string | null
  error?: string | null
  startedAt?: string | null
  completedAt?: string | null
  expiresAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type PayloadJobPort = {
  find(args: Record<string, unknown>): Promise<{ docs: JobDoc[]; hasNextPage?: boolean; nextPage?: number | null }>
  create(args: Record<string, unknown>): Promise<JobDoc>
  update(args: Record<string, unknown>): Promise<JobDoc>
  auth(args: { headers: Headers }): Promise<{ user?: { id?: string | number } | null }>
}

type SnapshotDoc = Record<string, unknown>

const JOB_COLLECTION = 'pdf-export-jobs'
const MAX_ACTIVE_JOBS = 1
const JOB_TTL_DAYS = 7
const LOCAL_WEB_ORIGINS = [
  'http://localhost:8080', 'http://127.0.0.1:8080',
  'http://localhost:5173', 'http://127.0.0.1:5173',
]

const globalCoordinator = globalThis as typeof globalThis & {
  __middaraPdfExportWorker?: { jobId: string; startedAt: number } | null
  __middaraPdfExportReservation?: boolean
}

function port(payload: Payload): PayloadJobPort {
  return payload as unknown as PayloadJobPort
}

function currentPdfExportWorkerJobId() {
  return (globalThis as typeof globalThis & { __middaraPdfExportWorker?: { jobId: string } | null })
    .__middaraPdfExportWorker?.jobId
}

export function pdfExportRepositoryRoot() {
  return path.resolve(process.env.MIDDARA_REPO_ROOT ?? path.resolve(process.cwd(), '../..'))
}

export function pdfExportJobsRoot() {
  return path.resolve(pdfExportRepositoryRoot(), 'output/pdf/jobs')
}

export function pdfExportBaseUrl() {
  return (process.env.MIDDARA_WEB_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/u, '')
}

export function pdfExportApiUrl() {
  return (process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000').replace(/\/+$/u, '')
}

export function pdfExportSourcePdfPath() {
  return path.resolve(process.env.MIDDARA_SOURCE_PDF_PATH
    ?? 'C:/Users/bruno/Downloads/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
}

function allowedOrigins() {
  const configured = process.env.MIDDARA_EXPORT_ALLOWED_ORIGINS
    ?.split(',').map(value => value.trim()).filter(Boolean)
  if (configured?.length) return new Set(configured)
  return process.env.NODE_ENV === 'production' ? new Set<string>() : new Set(LOCAL_WEB_ORIGINS)
}

export function isAllowedPdfExportOrigin(origin: string | null) {
  return !!origin && allowedOrigins().has(origin)
}

export function pdfExportCorsHeaders(origin: string | null) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  })
  if (isAllowedPdfExportOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin!)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type')
    headers.set('Access-Control-Max-Age', '600')
  }
  return headers
}

export function validatePdfExportRequest(value: unknown): PdfExportRequest {
  return normalizePdfExportRequest(value)
}

export async function authenticatePdfExportRequest(payload: Payload, request: Request) {
  try {
    const result = await port(payload).auth({ headers: request.headers })
    return result.user?.id === undefined ? null : String(result.user.id)
  } catch {
    return null
  }
}

export async function canAccessPdfExportJob(
  payload: Payload,
  request: Request,
  job: JobDoc,
  mutation = false,
) {
  const origin = request.headers.get('origin')
  if (origin && !isAllowedPdfExportOrigin(origin)) return false
  const ownerId = await authenticatePdfExportRequest(payload, request)
  if (job.ownerId) return ownerId === job.ownerId
  // The viewer has no login session. In that mode the UUID jobId is a
  // capability; mutating requests still need an approved browser origin.
  if (mutation && !origin && !ownerId) return false
  return true
}

async function findJob(payload: Payload, jobId: string): Promise<JobDoc | null> {
  const result = await port(payload).find({
    collection: JOB_COLLECTION,
    where: { jobId: { equals: jobId } },
    limit: 1,
    overrideAccess: true,
  })
  return result.docs[0] ?? null
}

async function updateJob(payload: Payload, job: JobDoc, data: Record<string, unknown>) {
  return port(payload).update({
    collection: JOB_COLLECTION,
    id: job.id,
    data,
    overrideAccess: true,
  })
}

async function findActiveJobs(payload: Payload) {
  const result = await port(payload).find({
    collection: JOB_COLLECTION,
    where: { status: { in: ['queued', 'running'] } },
    limit: 10,
    overrideAccess: true,
  })
  return result.docs
}

async function cleanupExpiredExportArtifacts(payload: Payload) {
  const result = await port(payload).find({
    collection: JOB_COLLECTION,
    where: {
      status: { in: ['completed', 'failed', 'cancelled'] },
      expiresAt: { less_than: new Date().toISOString() },
    },
    limit: 500,
    overrideAccess: true,
  })
  const jobsRoot = path.resolve(pdfExportJobsRoot())
  for (const job of result.docs) {
    if (!isValidPdfExportJobId(job.jobId)) continue
    const directory = path.resolve(jobsRoot, job.jobId)
    if (path.dirname(directory) !== jobsRoot) continue
    await rm(directory, { recursive: true, force: true })
    await updateJob(payload, job, {
      snapshotPath: null,
      snapshotHash: null,
      outputPath: null,
      downloadName: null,
      stage: 'Arquivos da exportação expirados e removidos',
    })
  }
}

async function readAll(payload: Payload, collection: string): Promise<SnapshotDoc[]> {
  const records: SnapshotDoc[] = []
  let page = 1
  while (true) {
    const result = await port(payload).find({
      collection,
      limit: 500,
      page,
      pagination: true,
      overrideAccess: true,
    })
    records.push(...result.docs as SnapshotDoc[])
    if (!result.hasNextPage || !result.nextPage) break
    page = result.nextPage
  }
  return records
}

function selectFields(record: SnapshotDoc, fields: string[]) {
  return Object.fromEntries(fields.filter(field => record[field] !== undefined).map(field => [field, record[field]]))
}

async function hashFile(filePath: string) {
  return new Promise<string>((resolveHash, rejectHash) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', rejectHash)
    stream.once('end', () => resolveHash(hash.digest('hex')))
  })
}

async function snapshotSourcePageBoxes(sourcePdf: string, pages: number[]) {
  const helper = path.join(pdfExportRepositoryRoot(), 'scripts/snapshot_export_source_boxes.py')
  return await new Promise<Record<string, Record<string, number[]>>>((resolveBoxes, rejectBoxes) => {
    const child = spawn('python', [helper, sourcePdf, ...pages.map(String)], {
      cwd: pdfExportRepositoryRoot(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    child.once('error', rejectBoxes)
    child.once('exit', code => {
      if (code !== 0) {
        rejectBoxes(new Error(Buffer.concat(stderr).toString('utf8').trim() || 'Could not capture source page boxes.'))
        return
      }
      try {
        resolveBoxes(JSON.parse(Buffer.concat(stdout).toString('utf8')) as Record<string, Record<string, number[]>>)
      } catch (error) {
        rejectBoxes(error)
      }
    })
  })
}

async function listAssetHashes(directory: string, baseDirectory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const itemPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      Object.assign(result, await listAssetHashes(itemPath, baseDirectory))
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDirectory, itemPath).split(path.sep).join('/')
      result[relativePath] = await hashFile(itemPath)
    }
  }
  return result
}

async function createImmutableSnapshot(
  payload: Payload,
  jobId: string,
  request: PdfExportRequest,
) {
  const root = pdfExportRepositoryRoot()
  const jobDirectory = path.join(pdfExportJobsRoot(), jobId)
  const snapshotDirectory = path.join(jobDirectory, 'snapshot')
  const snapshotPages = path.join(snapshotDirectory, 'pages')
  const assetPages = [...new Set([1, ...request.pages])].sort((a, b) => a - b)
  const canonicalPagesRoot = path.join(root, 'apps/web/public/pages')
  const source = pdfExportSourcePdfPath()

  await access(source)
  const sourcePdfSha256 = await hashFile(source)
  const [translationDocs, frameDocs, aliasDocs, sourcePageBoxes] = await Promise.all([
    readAll(payload, 'translations'),
    readAll(payload, 'layout-frames'),
    readAll(payload, 'symbol-alias-settings'),
    snapshotSourcePageBoxes(source, request.pages),
  ])
  if (await hashFile(source) !== sourcePdfSha256) {
    throw new Error('O PDF-fonte mudou durante a captura do snapshot; tente novamente.')
  }
  await mkdir(snapshotPages, { recursive: true })
  for (const pageNumber of assetPages) {
    const name = `page_${String(pageNumber).padStart(3, '0')}`
    const sourceDirectory = path.join(canonicalPagesRoot, name)
    await access(path.join(sourceDirectory, `${name}_dom.json`))
    await cp(sourceDirectory, path.join(snapshotPages, name), { recursive: true, errorOnExist: true })
  }

  const snapshot = {
    version: 1,
    jobId,
    createdAt: new Date().toISOString(),
    language: request.language,
    pages: request.pages,
    assetPages,
    translations: translationDocs.map(record => selectFields(record, ['id', 'spanKey', 'language', 'data', 'updatedAt'])),
    layoutFrames: frameDocs
      .filter(record => assetPages.includes(Number(record.pageNumber)))
      .map(record => selectFields(record, ['id', 'frameKey', 'unitKey', 'pageNumber', 'language', 'data', 'updatedAt'])),
    symbolAliasSettings: aliasDocs
      .filter(record => record.settingsKey === 'shared')
      .slice(0, 1)
      .map(record => selectFields(record, ['id', 'settingsKey', 'aliases', 'updatedAt'])),
    sourcePdfSha256,
    sourcePageBoxes,
    pageAssetSha256: await listAssetHashes(snapshotPages, snapshotPages),
  }
  const snapshotPath = path.join(snapshotDirectory, 'snapshot.json')
  await writeFile(snapshotPath, JSON.stringify(snapshot), { flag: 'wx' })
  return { jobDirectory, snapshotPath, snapshotHash: await hashFile(snapshotPath) }
}

export async function createPdfExportJob(
  payload: Payload,
  request: Request,
  value: unknown,
) {
  const input = validatePdfExportRequest(value)
  if (globalCoordinator.__middaraPdfExportReservation || globalCoordinator.__middaraPdfExportWorker) {
    const error = new Error('Já existe uma exportação em andamento. Aguarde ou cancele esse job.')
    Object.assign(error, { statusCode: 429 })
    throw error
  }
  globalCoordinator.__middaraPdfExportReservation = true
  try {
    await cleanupExpiredExportArtifacts(payload)
    const previousJobs = await findActiveJobs(payload)
    const workerJobId = currentPdfExportWorkerJobId()
    for (const previous of previousJobs) {
      if (previous.status === 'running' && workerJobId !== previous.jobId) {
        await updateJob(payload, previous, {
          status: 'failed', currentPage: null,
          stage: 'Worker interrompido; o arquivo parcial não foi publicado',
          error: 'O processo do backend foi reiniciado. Inicie uma nova exportação.',
          completedAt: new Date().toISOString(),
        })
      } else if (previous.status === 'queued' && !workerJobId) {
        startPdfExportWorker(payload, previous.jobId)
      }
    }
    const active = await findActiveJobs(payload)
    if (active.length >= MAX_ACTIVE_JOBS) {
      const error = new Error('Já existe uma exportação em andamento. Aguarde ou cancele esse job.')
      Object.assign(error, { statusCode: 429 })
      throw error
    }

    const jobId = randomUUID()
    const ownerId = await authenticatePdfExportRequest(payload, request)
    const expiresAt = new Date(Date.now() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000)
    const created = await port(payload).create({
      collection: JOB_COLLECTION,
      overrideAccess: true,
      data: {
        jobId,
        ownerId,
        language: input.language,
        profile: 'visual',
        pages: input.pages,
        status: 'queued',
        completedPages: 0,
        totalPages: input.pages.length,
        stage: 'Aguardando worker de exportação',
        cancelRequested: false,
        expiresAt: expiresAt.toISOString(),
      },
    })
    startPdfExportWorker(payload, jobId)
    return created
  } finally {
    globalCoordinator.__middaraPdfExportReservation = false
  }
}

async function runWorkerProcess(command: string, args: string[], logPath: string) {
  await new Promise<void>((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { cwd: pdfExportRepositoryRoot(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const append = (chunk: Buffer) => { void appendFile(logPath, chunk).catch(() => undefined) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', rejectProcess)
    child.once('exit', code => code === 0 ? resolveProcess() : rejectProcess(new Error(`Processo de exportação encerrou com código ${code ?? 'desconhecido'}.`)))
  })
}

async function verifySnapshotAssets(snapshotPath: string, manifest: Record<string, string>) {
  const pageSnapshotRoot = path.join(path.dirname(snapshotPath), 'pages')
  for (const [relativePath, expectedHash] of Object.entries(manifest)) {
    const filePath = path.resolve(pageSnapshotRoot, relativePath)
    const relative = path.relative(pageSnapshotRoot, filePath)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Snapshot de assets inválido.')
    if (await hashFile(filePath) !== expectedHash) throw new Error('O snapshot de assets foi alterado.')
  }
}

async function executePdfExportJob(payload: Payload, jobId: string) {
  let job = await findJob(payload, jobId)
  if (!job || job.status !== 'queued') return
  const jobDirectory = path.join(pdfExportJobsRoot(), jobId)
  const logPath = path.join(jobDirectory, 'worker.log')
  job = await updateJob(payload, job, {
    status: 'running', currentPage: null, stage: 'Capturando snapshot imutável das entradas',
    startedAt: new Date().toISOString(), error: null,
  })
  const capturedSnapshot = await createImmutableSnapshot(payload, jobId, {
    language: job.language,
    profile: 'visual',
    pages: job.pages,
  })
  job = await updateJob(payload, job, {
    snapshotPath: capturedSnapshot.snapshotPath,
    snapshotHash: capturedSnapshot.snapshotHash,
    stage: 'Snapshot imutável confirmado; inicializando Chromium',
  })
  const snapshotPath = capturedSnapshot.snapshotPath
  if (!(await ensurePdfExportSnapshotIntact(job))) throw new Error('Snapshot do job ausente ou inválido.')
  const snapshotData = await readPdfExportSnapshot(snapshotPath)
  if (snapshotData.version !== 1 || snapshotData.jobId !== jobId || snapshotData.pages.join(',') !== job.pages.join(',')) {
    throw new Error('Snapshot incompatível com os parâmetros do job.')
  }
  await verifySnapshotAssets(snapshotPath, snapshotData.pageAssetSha256)

  await mkdir(path.join(jobDirectory, 'parts'), { recursive: true })
  await writeFile(logPath, '', { flag: 'w' })
  job = await updateJob(payload, job, {
    status: 'running', currentPage: null, stage: 'Inicializando Chromium isolado',
    startedAt: new Date().toISOString(), error: null,
  })

  const root = pdfExportRepositoryRoot()
  const pageExporter = path.join(root, 'scripts/export_page_pdf.mjs')
  for (let index = 0; index < job.pages.length; index += 1) {
    const refreshed = await findJob(payload, jobId)
    if (!refreshed) throw new Error('Job removido durante a exportação.')
    if (refreshed.cancelRequested) {
      await updateJob(payload, refreshed, {
        status: 'cancelled', currentPage: null, stage: `Cancelado após ${index} de ${job.pages.length} páginas`,
        completedAt: new Date().toISOString(),
      })
      return
    }

    const pageNumber = job.pages[index]
    const pageOutput = path.join(jobDirectory, 'parts', `page-${String(pageNumber).padStart(3, '0')}.pdf`)
    await updateJob(payload, refreshed, {
      currentPage: pageNumber,
      stage: `Renderizando página ${pageNumber} de ${job.pages.length}`,
    })
    await runWorkerProcess(process.execPath, [
      pageExporter,
      '--page', String(pageNumber),
      '--language', job.language,
      '--profile', 'visual',
      '--output', pageOutput,
      '--base-url', pdfExportBaseUrl(),
      '--api-url', pdfExportApiUrl(),
      '--snapshot', snapshotPath,
    ], logPath)

    const afterPage = await findJob(payload, jobId)
    if (!afterPage) throw new Error('Job removido durante a exportação.')
    job = await updateJob(payload, afterPage, {
      completedPages: index + 1, currentPage: null,
      stage: `Página ${pageNumber} verificada (${index + 1}/${job.pages.length})`,
    })
  }

  const beforeMerge = await findJob(payload, jobId)
  if (!beforeMerge) throw new Error('Job removido antes da montagem final.')
  if (beforeMerge.cancelRequested) {
    await updateJob(payload, beforeMerge, {
      status: 'cancelled', currentPage: null, stage: 'Cancelado antes da montagem final', completedAt: new Date().toISOString(),
    })
    return
  }
  const finalName = `middara-rulebook-${job.language}-${job.pages[0]}-${job.pages[job.pages.length - 1]}.pdf`
  const partialOutput = path.join(jobDirectory, 'final.partial.pdf')
  const finalOutput = path.join(jobDirectory, finalName)
  const partPaths = job.pages.map(page => path.join(jobDirectory, 'parts', `page-${String(page).padStart(3, '0')}.pdf`))
  await updateJob(payload, beforeMerge, { stage: 'Montando o PDF multipágina verificado' })
  await runWorkerProcess('python', [path.join(root, 'scripts/merge_export_pages.py'), partialOutput, ...partPaths], logPath)
  await rename(partialOutput, finalOutput)
  const latest = await findJob(payload, jobId)
  if (!latest) throw new Error('Job removido ao concluir a montagem.')
  if (latest.cancelRequested) {
    await updateJob(payload, latest, {
      status: 'cancelled', currentPage: null, stage: 'Cancelado antes de publicar o download',
      outputPath: null, completedAt: new Date().toISOString(),
    })
    return
  }
  await updateJob(payload, latest, {
    status: 'completed', completedPages: job.pages.length, totalPages: job.pages.length,
    currentPage: null, stage: 'PDF completo e verificado', outputPath: finalOutput,
    downloadName: finalName, completedAt: new Date().toISOString(), expiresAt: pdfExportTtlDate(),
  })
}

function startPdfExportWorker(payload: Payload, jobId: string) {
  if (globalCoordinator.__middaraPdfExportWorker) return
  const worker = { jobId, startedAt: Date.now() }
  globalCoordinator.__middaraPdfExportWorker = worker
  setImmediate(() => {
    void executePdfExportJob(payload, jobId)
      .catch(async error => {
        const current = await findJob(payload, jobId).catch(() => null)
        if (current && (current.status === 'queued' || current.status === 'running')) {
          const detail = error instanceof Error ? error.message : 'Falha desconhecida no worker.'
          await updateJob(payload, current, {
            status: 'failed', currentPage: null,
            stage: 'Falha na exportação; arquivo parcial indisponível',
            error: `${detail} Verifique o log do job e tente novamente.`.slice(0, 500),
            completedAt: new Date().toISOString(),
          }).catch(() => undefined)
        }
      })
      .finally(() => {
        if (globalCoordinator.__middaraPdfExportWorker === worker) globalCoordinator.__middaraPdfExportWorker = null
      })
  })
}

export async function getPdfExportJob(payload: Payload, jobId: string) {
  let job = await findJob(payload, jobId)
  const worker = globalCoordinator.__middaraPdfExportWorker
  if (job?.status === 'queued' && !worker) {
    startPdfExportWorker(payload, jobId)
  } else if (job?.status === 'running' && worker?.jobId !== jobId) {
    job = await updateJob(payload, job, {
      status: 'failed', currentPage: null,
      stage: 'Worker interrompido; o arquivo parcial não foi publicado',
      error: 'O processo do backend foi reiniciado. Inicie uma nova exportação.',
      completedAt: new Date().toISOString(),
    })
  }
  return job
}

export async function requestPdfExportCancellation(payload: Payload, job: JobDoc) {
  if (job.status === 'queued') {
    return updateJob(payload, job, {
      status: 'cancelled', cancelRequested: true, currentPage: null,
      stage: 'Exportação cancelada antes do início', completedAt: new Date().toISOString(),
    })
  }
  if (job.status === 'running') {
    return updateJob(payload, job, {
      cancelRequested: true,
      stage: job.currentPage
        ? `Cancelamento solicitado; concluindo a página ${job.currentPage}`
        : 'Cancelamento solicitado; parando em um limite seguro',
    })
  }
  return job
}

export function publicPdfExportJob(job: JobDoc, includeDownloadUrl = false) {
  const expiresAt = job.expiresAt ? Date.parse(job.expiresAt) : 0
  const hasDownload = job.status === 'completed' && !!job.outputPath && expiresAt > Date.now()
  return {
    id: job.jobId,
    language: job.language,
    profile: job.profile,
    pages: job.pages,
    status: job.status,
    completedPages: job.completedPages,
    totalPages: job.totalPages,
    currentPage: job.currentPage ?? null,
    stage: job.stage,
    cancelRequested: !!job.cancelRequested,
    error: job.error ?? null,
    createdAt: job.createdAt ?? null,
    updatedAt: job.updatedAt ?? null,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? null,
    expiresAt: job.expiresAt ?? null,
    hasDownload,
    downloadName: hasDownload ? job.downloadName ?? 'middara-rulebook.pdf' : null,
    ...(includeDownloadUrl && hasDownload ? { downloadUrl: `/api/exports/${job.jobId}/download` } : {}),
  }
}

export function isValidPdfExportJobId(jobId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(jobId)
}

export async function getSafePdfExportOutputPath(job: JobDoc) {
  if (!job.outputPath || !isValidPdfExportJobId(job.jobId)) return null
  const jobDirectory = path.resolve(pdfExportJobsRoot(), job.jobId)
  const outputPath = path.resolve(job.outputPath)
  const relativePath = path.relative(jobDirectory, outputPath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null
  if (!relativePath.toLowerCase().endsWith('.pdf')) return null
  try {
    const info = await stat(outputPath)
    if (!info.isFile()) return null
    return outputPath
  } catch {
    return null
  }
}

export async function ensurePdfExportSnapshotIntact(job: JobDoc) {
  if (!job.snapshotPath || !job.snapshotHash) return false
  try {
    const actualHash = await hashFile(job.snapshotPath)
    return actualHash === job.snapshotHash
  } catch {
    return false
  }
}

export async function updatePdfExportJob(payload: Payload, job: JobDoc, data: Record<string, unknown>) {
  return updateJob(payload, job, data)
}

export async function readPdfExportSnapshot(snapshotPath: string) {
  return JSON.parse(await readFile(snapshotPath, 'utf8')) as {
    version: number
    jobId: string
    pages: number[]
    assetPages: number[]
    translations: SnapshotDoc[]
    layoutFrames: SnapshotDoc[]
    symbolAliasSettings: SnapshotDoc[]
    sourcePdfSha256: string
    sourcePageBoxes: Record<string, Record<string, number[]>>
    pageAssetSha256: Record<string, string>
  }
}

export function pdfExportTtlDate() {
  return new Date(Date.now() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export type { JobDoc }
