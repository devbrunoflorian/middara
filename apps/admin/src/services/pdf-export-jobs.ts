import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, appendFile, cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { Payload } from 'payload'

import { normalizePdfExportRequest, type PdfExportRequest } from './pdf-export-input'
import { pdfExportProgressPercent, pdfExportRetentionDays, type PdfExportPhase } from './pdf-export-state'

type JobDoc = {
  id: string | number
  jobId: string
  ownerId?: string | null
  language: 'en' | 'pt-BR'
  profile: 'visual' | 'editable'
  pages: number[]
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  phase?: PdfExportPhase
  completedPages: number
  totalPages: number
  currentPage?: number | null
  failedPage?: number | null
  stage: string
  cancelRequested?: boolean
  verificationSummary?: Record<string, unknown> | null
  workerPid?: number | null
  workerCommand?: string | null
  workerProcessStartedAt?: string | null
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
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000
const DEFAULT_PAGE_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_PROCESS_TIMEOUT_MS = 15 * 60 * 1000
const LOCAL_WEB_ORIGINS = [
  'http://localhost:8080', 'http://127.0.0.1:8080',
  'http://localhost:5173', 'http://127.0.0.1:5173',
]

const globalCoordinator = globalThis as typeof globalThis & {
  __middaraPdfExportWorker?: { jobId: string; startedAt: number } | null
  __middaraPdfExportProcess?: { jobId: string; child: ChildProcess; command: string } | null
  __middaraPdfExportReservation?: boolean
  __middaraPdfExportMaintenanceTimer?: NodeJS.Timeout | null
  __middaraPdfExportMaintenancePayload?: Payload | null
  __middaraPdfExportMaintenanceRunning?: boolean
  __middaraPdfExportMaintenanceLastRunAt?: number
}

class PdfExportCancelledError extends Error {
  constructor() {
    super('Exportação cancelada pelo usuário.')
    this.name = 'PdfExportCancelledError'
  }
}

function boundedEnvironmentInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback
}

function pdfExportCleanupIntervalMs() {
  return boundedEnvironmentInteger(process.env.MIDDARA_PDF_EXPORT_CLEANUP_INTERVAL_MS, DEFAULT_CLEANUP_INTERVAL_MS, 60_000, 24 * 60 * 60 * 1000)
}

function pdfExportPageTimeoutMs() {
  return boundedEnvironmentInteger(process.env.MIDDARA_PDF_EXPORT_PAGE_TIMEOUT_MS, DEFAULT_PAGE_TIMEOUT_MS, 30_000, 30 * 60 * 1000)
}

function pdfExportProcessTimeoutMs() {
  return boundedEnvironmentInteger(process.env.MIDDARA_PDF_EXPORT_PROCESS_TIMEOUT_MS, DEFAULT_PROCESS_TIMEOUT_MS, 60_000, 60 * 60 * 1000)
}

function port(payload: Payload): PayloadJobPort {
  return payload as unknown as PayloadJobPort
}

export function pdfExportRepositoryRoot() {
  return path.resolve(process.env.MIDDARA_REPO_ROOT ?? path.resolve(process.cwd(), '../..'))
}

export function pdfExportJobsRoot() {
  return path.resolve(pdfExportRepositoryRoot(), 'output/pdf/jobs')
}

async function safePdfExportJobDirectory(jobId: string, create = false) {
  if (!isValidPdfExportJobId(jobId)) return null
  const root = path.resolve(pdfExportJobsRoot())
  if (create) await mkdir(root, { recursive: true })
  let rootInfo
  try {
    rootInfo = await lstat(root)
  } catch {
    return null
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return null
  const directory = path.resolve(root, jobId)
  if (path.dirname(directory) !== root) return null
  try {
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) return null
  } catch (error) {
    if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT') return null
    try {
      await mkdir(directory)
    } catch (createError) {
      if ((createError as NodeJS.ErrnoException).code !== 'EEXIST') return null
    }
    const info = await lstat(directory).catch(() => null)
    if (!info?.isDirectory() || info.isSymbolicLink()) return null
  }
  return directory
}

export function pdfExportBaseUrl() {
  return (process.env.MIDDARA_WEB_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/u, '')
}

export function pdfExportApiUrl() {
  return (process.env.VITE_PAYLOAD_API_URL ?? 'http://localhost:3000').replace(/\/+$/u, '')
}

export function pdfExportSourcePdfPath() {
  const configuredPath = process.env.MIDDARA_SOURCE_PDF_PATH?.trim()
  if (!configuredPath) {
    throw new Error('PDF-fonte não configurado. Defina MIDDARA_SOURCE_PDF_PATH no ambiente local para o PDF oficial em inglês.')
  }
  return path.resolve(configuredPath)
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
  const docs: JobDoc[] = []
  let page = 1
  while (true) {
    const result = await port(payload).find({
      collection: JOB_COLLECTION,
      where: { status: { in: ['queued', 'running'] } },
      limit: 250,
      page,
      pagination: true,
      overrideAccess: true,
    })
    docs.push(...result.docs)
    if (!result.hasNextPage || !result.nextPage) return docs
    page = result.nextPage
  }
}

async function cleanupExpiredExportArtifacts(payload: Payload) {
  while (true) {
    const result = await port(payload).find({
      collection: JOB_COLLECTION,
      where: {
        status: { in: ['completed', 'failed', 'cancelled'] },
        expiresAt: { less_than: new Date().toISOString() },
      },
      limit: 250,
      page: 1,
      pagination: true,
      overrideAccess: true,
    })
    for (const job of result.docs) {
      const directory = await safePdfExportJobDirectory(job.jobId)
      if (directory) await rm(directory, { recursive: true, force: true })
      await updateJob(payload, job, {
        snapshotPath: null,
        snapshotHash: null,
        outputPath: null,
        downloadName: null,
        workerPid: null,
        workerCommand: null,
        workerProcessStartedAt: null,
        expiresAt: null,
        stage: 'Arquivos da exportação expirados e removidos',
      })
    }
    if (result.docs.length === 0) break
  }
}

async function cleanupIncompleteJobArtifacts(jobId: string) {
  const directory = await safePdfExportJobDirectory(jobId)
  if (!directory) return
  for (const child of ['snapshot', 'parts', 'final.partial.pdf']) {
    await rm(path.join(directory, child), { recursive: true, force: true })
  }
}

async function cleanupFailedJobArtifacts(jobId: string) {
  const directory = await safePdfExportJobDirectory(jobId)
  if (!directory) return
  await cleanupIncompleteJobArtifacts(jobId)
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^middara-rulebook-[a-z-]+-\d+-\d+\.pdf$/iu.test(entry.name)) continue
    await rm(path.join(directory, entry.name), { force: true })
  }
}

async function terminatePersistedWorker(job: JobDoc) {
  const pid = job.workerPid
  const startedAt = job.workerProcessStartedAt
  const command = job.workerCommand
  if (!pid || !Number.isSafeInteger(pid) || !startedAt || !command || process.platform !== 'win32') return false
  if (!/^[a-z0-9_.-]+$/iu.test(command)) return false
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return false
  const ps = [
    '$ErrorActionPreference = \'Stop\'',
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"`,
    'if ($null -eq $p) { exit 0 }',
    '$created = [Management.ManagementDateTimeConverter]::ToDateTime($p.CreationDate).ToUniversalTime()',
    `$expected = [DateTimeOffset]::FromUnixTimeMilliseconds(${started}).UtcDateTime`,
    'if ([Math]::Abs(($created - $expected).TotalSeconds) -gt 30) { exit 5 }',
    `$needle = [regex]::Escape('${command}')`,
    'if ($p.CommandLine -notmatch $needle) { exit 5 }',
    `& taskkill.exe /PID ${pid} /T /F | Out-Null`,
    'exit $LASTEXITCODE',
  ].join('; ')
  return await new Promise<boolean>(resolveKill => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      stdio: 'ignore',
    })
    const timeout = setTimeout(() => { child.kill(); resolveKill(false) }, 5000)
    child.once('error', () => { clearTimeout(timeout); resolveKill(false) })
    child.once('close', code => { clearTimeout(timeout); resolveKill(code === 0) })
  })
}

async function reconcileInterruptedJobs(payload: Payload) {
  const jobs = await findActiveJobs(payload)
  const localWorkerId = globalCoordinator.__middaraPdfExportWorker?.jobId
  for (const job of jobs.filter(candidate => candidate.status === 'running')) {
    if (localWorkerId === job.jobId) continue
    await terminatePersistedWorker(job).catch(() => false)
    await cleanupFailedJobArtifacts(job.jobId).catch(() => undefined)
    await updateJob(payload, job, {
      status: 'failed', phase: 'failed', currentPage: null,
      failedPage: job.currentPage ?? null,
      stage: job.currentPage
        ? `Worker interrompido na página ${job.currentPage}; o parcial foi removido`
        : 'Worker interrompido; o arquivo parcial foi removido',
      error: 'O processo do backend foi reiniciado. Inicie uma nova exportação.',
      outputPath: null, downloadName: null, snapshotPath: null, snapshotHash: null,
      workerPid: null, workerCommand: null, workerProcessStartedAt: null,
      completedAt: new Date().toISOString(), expiresAt: pdfExportTtlDate(),
    })
  }

  if (globalCoordinator.__middaraPdfExportWorker || globalCoordinator.__middaraPdfExportReservation) return
  const queued = jobs.filter(job => job.status === 'queued')
  if (queued.length === 0) return
  startPdfExportWorker(payload, queued[0].jobId)
  for (const duplicate of queued.slice(1)) {
    await updateJob(payload, duplicate, {
      status: 'failed', phase: 'failed', stage: 'Job duplicado encontrado durante recuperação',
      error: 'Outro job estava na fila. Inicie novamente após a exportação ativa terminar.',
      completedAt: new Date().toISOString(), expiresAt: pdfExportTtlDate(),
    })
  }
}

async function runPdfExportMaintenance(payload: Payload) {
  if (globalCoordinator.__middaraPdfExportMaintenanceRunning) return
  globalCoordinator.__middaraPdfExportMaintenanceRunning = true
  globalCoordinator.__middaraPdfExportMaintenanceLastRunAt = Date.now()
  try {
    await cleanupExpiredExportArtifacts(payload)
    await reconcileInterruptedJobs(payload)
  } catch (error) {
    console.error('[pdf-export] background maintenance failed', error)
  } finally {
    globalCoordinator.__middaraPdfExportMaintenanceRunning = false
  }
}

export async function initializePdfExportMaintenance(payload: Payload) {
  globalCoordinator.__middaraPdfExportMaintenancePayload = payload
  let initializeNow = false
  if (!globalCoordinator.__middaraPdfExportMaintenanceTimer) {
    const timer = setInterval(() => {
      const currentPayload = globalCoordinator.__middaraPdfExportMaintenancePayload
      if (currentPayload) void runPdfExportMaintenance(currentPayload)
    }, pdfExportCleanupIntervalMs())
    timer.unref()
    globalCoordinator.__middaraPdfExportMaintenanceTimer = timer
    initializeNow = true
  }
  const lastRunAt = globalCoordinator.__middaraPdfExportMaintenanceLastRunAt ?? 0
  if (initializeNow || Date.now() - lastRunAt >= pdfExportCleanupIntervalMs()) {
    await runPdfExportMaintenance(payload)
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

async function snapshotSourcePageBoxes(payload: Payload, jobId: string, sourcePdf: string, pages: number[], logPath: string) {
  const helper = path.join(pdfExportRepositoryRoot(), 'scripts/snapshot_export_source_boxes.py')
  const result = await runWorkerProcess(payload, jobId, 'python', [helper, sourcePdf, ...pages.map(String)], logPath, pdfExportProcessTimeoutMs())
  return JSON.parse(result.stdout) as Record<string, Record<string, number[]>>
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

async function readPageScopedTranslationReviewCatalog(root: string, pages: number[]) {
  const catalogPaths = [
    path.join(root, 'apps/web/node_modules/.cache/translation-review/catalog.json'),
    path.join(root, 'apps/web/public/translation-review/catalog.json'),
  ]
  let catalog: Record<string, unknown> | null = null
  for (const catalogPath of catalogPaths) {
    try {
      catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as Record<string, any>
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.proposals) || !Array.isArray(catalog.exceptions)) {
    throw new Error('Não foi possível capturar o catálogo vigente de propostas para espelhar o Viewer PT-BR na exportação.')
  }
  const requestedPages = new Set(pages)
  const proposalRows = catalog.proposals as Array<Record<string, unknown> & { candidates?: unknown }>
  const proposals = proposalRows.flatMap(proposal => {
    const candidates = Array.isArray(proposal.candidates)
      ? (proposal.candidates as Array<Record<string, unknown>>)
        .filter(candidate => requestedPages.has(Number(candidate.pageNumber)))
      : []
    return candidates.length ? [{ ...proposal, candidates }] : []
  })
  const exceptions = (catalog.exceptions as Array<Record<string, unknown>>)
    .filter(exception => requestedPages.has(Number(exception.pageNumber)))
  return {
    ...catalog,
    proposalCount: proposals.length,
    candidateCount: proposals.reduce((count, proposal) => count + proposal.candidates.length, 0),
    exceptionCount: exceptions.length,
    proposals,
    exceptions,
  }
}

async function createImmutableSnapshot(
  payload: Payload,
  jobId: string,
  request: PdfExportRequest,
  logPath: string,
) {
  const root = pdfExportRepositoryRoot()
  const jobDirectory = await safePdfExportJobDirectory(jobId, true)
  if (!jobDirectory) throw new Error('Diretório isolado do job inválido ou indisponível.')
  const snapshotDirectory = path.join(jobDirectory, 'snapshot')
  const snapshotPages = path.join(snapshotDirectory, 'pages')
  const assetPages = [...new Set([1, ...request.pages])].sort((a, b) => a - b)
  const canonicalPagesRoot = path.join(root, 'apps/web/public/pages')
  const source = pdfExportSourcePdfPath()

  try {
    await access(source)
  } catch {
    throw new Error(`PDF-fonte configurado não encontrado: ${source}. Corrija MIDDARA_SOURCE_PDF_PATH no ambiente local.`)
  }
  const sourcePdfSha256 = await hashFile(source)
  const [translationDocs, frameDocs, aliasDocs, reviewDocs, reviewRequestDocs, glossaryDecisionDocs, reviewCatalog, sourcePageBoxes] = await Promise.all([
    readAll(payload, 'translations'),
    readAll(payload, 'layout-frames'),
    readAll(payload, 'symbol-alias-settings'),
    readAll(payload, 'translation-reviews'),
    readAll(payload, 'translation-review-requests'),
    readAll(payload, 'translation-glossary-decisions'),
    readPageScopedTranslationReviewCatalog(root, request.pages),
    snapshotSourcePageBoxes(payload, jobId, source, request.pages, logPath),
  ])
  if (await hashFile(source) !== sourcePdfSha256) {
    throw new Error('O PDF-fonte mudou durante a captura do snapshot; tente novamente.')
  }
  await mkdir(snapshotPages, { recursive: true })
  for (const pageNumber of assetPages) {
    const current = await findJob(payload, jobId)
    if (!current || current.cancelRequested) throw new PdfExportCancelledError()
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
    translationReviews: reviewDocs
      .filter(record => request.pages.includes(Number(record.pageNumber)))
      .map(record => selectFields(record, [
        'id', 'reviewKey', 'pageNumber', 'spanKey', 'proposalId', 'proposalVersion', 'sourceText', 'proposalText',
        'data', 'technicalStatus', 'copyfitClassification', 'copyfitSourcePdfLineCount', 'copyfitPageRendererLineCount',
        'copyfitMeasurementFingerprint', 'underCompositionJustification', 'approvalStatus', 'reviewDisposition',
        'approvedAt', 'publication', 'updatedAt',
      ])),
    translationReviewRequests: reviewRequestDocs.filter(record =>
      record.pageNumber === undefined || request.pages.includes(Number(record.pageNumber))),
    translationGlossaryDecisions: glossaryDecisionDocs,
    translationReviewCatalog: reviewCatalog,
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
  await initializePdfExportMaintenance(payload)
  if (globalCoordinator.__middaraPdfExportReservation || globalCoordinator.__middaraPdfExportWorker) {
    const error = new Error('Já existe uma exportação em andamento. Aguarde ou cancele esse job.')
    Object.assign(error, { statusCode: 429 })
    throw error
  }
  globalCoordinator.__middaraPdfExportReservation = true
  try {
    const active = await findActiveJobs(payload)
    if (active.length >= MAX_ACTIVE_JOBS) {
      const error = new Error('Já existe uma exportação em andamento. Aguarde ou cancele esse job.')
      Object.assign(error, { statusCode: 429 })
      throw error
    }

    const jobId = randomUUID()
    const ownerId = await authenticatePdfExportRequest(payload, request)
    const expiresAt = pdfExportTtlDate()
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
        phase: 'queued',
        completedPages: 0,
        totalPages: input.pages.length,
        stage: 'Aguardando worker de exportação',
        cancelRequested: false,
        failedPage: null,
        verificationSummary: null,
        expiresAt,
      },
    })
    startPdfExportWorker(payload, jobId)
    return created
  } finally {
    globalCoordinator.__middaraPdfExportReservation = false
  }
}

async function terminateChildTree(child: ChildProcess) {
  const pid = child.pid
  if (!pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    await new Promise<void>(resolveKill => {
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      const timeout = setTimeout(() => { killer.kill(); resolveKill() }, 5000)
      killer.once('error', () => { clearTimeout(timeout); resolveKill() })
      killer.once('close', () => { clearTimeout(timeout); resolveKill() })
    })
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    return
  }

  try { process.kill(-pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
  await new Promise<void>(resolveWait => {
    const timeout = setTimeout(resolveWait, 1500)
    child.once('close', () => { clearTimeout(timeout); resolveWait() })
  })
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }
}

async function terminateActivePdfExportProcess(jobId: string) {
  const active = globalCoordinator.__middaraPdfExportProcess
  if (active?.jobId === jobId) await terminateChildTree(active.child)
}

async function runWorkerProcess(
  payload: Payload,
  jobId: string,
  command: string,
  args: string[],
  logPath: string,
  timeoutMs: number,
) {
  const child = spawn(command, args, {
    cwd: pdfExportRepositoryRoot(),
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const managed = { jobId, child, command: path.basename(args[0] ?? command) }
  globalCoordinator.__middaraPdfExportProcess = managed
  const startedAt = new Date().toISOString()
  let stdout = ''
  let recentOutput = ''
  let writeChain = Promise.resolve()
  let timedOut = false
  let spawnError: Error | null = null
  const termination: { promise?: Promise<void> } = {}
  const append = (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    recentOutput = `${recentOutput}${text}`.slice(-3000)
    writeChain = writeChain.then(() => appendFile(logPath, chunk)).catch(() => undefined)
  }
  child.stdout?.on('data', chunk => {
    const text = Buffer.from(chunk).toString('utf8')
    stdout = `${stdout}${text}`.slice(-100_000)
    append(Buffer.from(chunk))
  })
  child.stderr?.on('data', chunk => append(Buffer.from(chunk)))
  let timeout: NodeJS.Timeout | undefined
  const resultPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolveProcess => {
    let settled = false
    const finish = (result: { code: number | null; signal: NodeJS.Signals | null }) => {
      if (settled) return
      settled = true
      resolveProcess(result)
    }
    child.once('error', error => {
      spawnError = error
      finish({ code: null, signal: null })
    })
    child.once('close', (code, signal) => finish({ code, signal }))
  })
  timeout = setTimeout(() => {
    timedOut = true
    termination.promise = terminateChildTree(child)
  }, timeoutMs)

  try {
    const current = await findJob(payload, jobId)
    if (current?.status === 'running') {
      await updateJob(payload, current, {
        workerPid: child.pid ?? null,
        workerCommand: managed.command,
        workerProcessStartedAt: startedAt,
      })
    }
  } catch (error) {
    termination.promise = terminateChildTree(child)
    await resultPromise
    if (timeout) clearTimeout(timeout)
    if (globalCoordinator.__middaraPdfExportProcess === managed) globalCoordinator.__middaraPdfExportProcess = null
    throw error
  }

  const result = await resultPromise.finally(() => {
    if (timeout) clearTimeout(timeout)
  })
  if (termination.promise) await termination.promise.catch(() => undefined)

  await writeChain
  if (globalCoordinator.__middaraPdfExportProcess === managed) globalCoordinator.__middaraPdfExportProcess = null
  const latest = await findJob(payload, jobId).catch(() => null)
  if (latest && latest.workerPid === child.pid) {
    await updateJob(payload, latest, { workerPid: null, workerCommand: null, workerProcessStartedAt: null }).catch(() => undefined)
  }
  if (spawnError) throw spawnError
  if (timedOut) throw new Error(`Etapa excedeu o limite de ${Math.ceil(timeoutMs / 1000)} s e seus processos foram encerrados. ${recentOutput.trim()}`.trim())
  if (result.code !== 0) {
    if (latest?.cancelRequested) throw new PdfExportCancelledError()
    throw new Error(`Processo de exportação encerrou com código ${result.code ?? result.signal ?? 'desconhecido'}. ${recentOutput.trim()}`.trim())
  }
  return { stdout }
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
  const jobDirectory = await safePdfExportJobDirectory(jobId, true)
  if (!jobDirectory) throw new Error('Diretório isolado do job inválido ou indisponível.')
  const logPath = path.join(jobDirectory, 'worker.log')
  await writeFile(logPath, '', { flag: 'w' })
  job = await updateJob(payload, job, {
    status: 'running', phase: 'preparing', currentPage: null, failedPage: null,
    stage: 'Preparando snapshot imutável das entradas',
    startedAt: new Date().toISOString(), error: null, outputPath: null, downloadName: null,
  })
  const afterStart = await findJob(payload, jobId)
  if (!afterStart || afterStart.cancelRequested || afterStart.status === 'cancelled') {
    if (afterStart && afterStart.status !== 'cancelled') {
      await updateJob(payload, afterStart, {
        status: 'cancelled', phase: 'cancelled', currentPage: null,
        stage: 'Exportação cancelada antes da preparação', completedAt: new Date().toISOString(),
        expiresAt: pdfExportTtlDate(),
      })
    }
    await cleanupIncompleteJobArtifacts(jobId)
    return
  }
  job = afterStart
  const capturedSnapshot = await createImmutableSnapshot(payload, jobId, {
    language: job.language,
    profile: 'visual',
    pages: job.pages,
  }, logPath)
  job = await updateJob(payload, job, {
    snapshotPath: capturedSnapshot.snapshotPath,
    snapshotHash: capturedSnapshot.snapshotHash,
    stage: 'Snapshot imutável confirmado',
  })
  const snapshotPath = capturedSnapshot.snapshotPath
  if (!(await ensurePdfExportSnapshotIntact(job))) throw new Error('Snapshot do job ausente ou inválido.')
  const snapshotData = await readPdfExportSnapshot(snapshotPath)
  if (snapshotData.version !== 1 || snapshotData.jobId !== jobId || snapshotData.pages.join(',') !== job.pages.join(',')) {
    throw new Error('Snapshot incompatível com os parâmetros do job.')
  }
  await verifySnapshotAssets(snapshotPath, snapshotData.pageAssetSha256)

  await mkdir(path.join(jobDirectory, 'parts'), { recursive: true })
  job = await updateJob(payload, job, {
    status: 'running', phase: 'rendering', currentPage: null,
    stage: 'Renderizando páginas com Chromium isolado',
  })

  const root = pdfExportRepositoryRoot()
  const pageExporter = path.join(root, 'scripts/export_page_pdf.mjs')
  for (let index = 0; index < job.pages.length; index += 1) {
    const refreshed = await findJob(payload, jobId)
    if (!refreshed) throw new Error('Job removido durante a exportação.')
    if (refreshed.cancelRequested) {
      await updateJob(payload, refreshed, {
        status: 'cancelled', phase: 'cancelled', currentPage: null,
        stage: `Cancelado após ${index} de ${job.pages.length} páginas`,
        completedAt: new Date().toISOString(), expiresAt: pdfExportTtlDate(),
      })
      await cleanupIncompleteJobArtifacts(jobId)
      return
    }

    const pageNumber = job.pages[index]
    const pageOutput = path.join(jobDirectory, 'parts', `page-${String(pageNumber).padStart(3, '0')}.pdf`)
    const pageArgs = [
      pageExporter,
      '--page', String(pageNumber),
      '--language', job.language,
      '--profile', 'visual',
      '--output', pageOutput,
      '--base-url', pdfExportBaseUrl(),
      '--api-url', pdfExportApiUrl(),
      '--snapshot', snapshotPath,
    ]
    await updateJob(payload, refreshed, {
      phase: 'rendering',
      currentPage: pageNumber,
      stage: `Renderizando lote ${index + 1} de ${job.pages.length} (Rulebook p. ${pageNumber})`,
    })
    try {
      await runWorkerProcess(payload, jobId, process.execPath, pageArgs, logPath, pdfExportPageTimeoutMs())
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const current = await findJob(payload, jobId)
      const retryableBrowserExit = detail.includes('Target page, context or browser has been closed')
      if (!retryableBrowserExit || !current || current.cancelRequested) throw error

      await rm(pageOutput, { force: true })
      await appendFile(logPath, `\n[page-export-retry] Chromium encerrou durante a p. ${pageNumber}; repetindo somente esta página uma vez.\n`)
      await updateJob(payload, current, {
        phase: 'rendering',
        currentPage: pageNumber,
        stage: `Chromium encerrou na p. ${pageNumber}; repetindo esta página (1/1)`,
      })
      await runWorkerProcess(payload, jobId, process.execPath, pageArgs, logPath, pdfExportPageTimeoutMs())
    }

    const afterPage = await findJob(payload, jobId)
    if (!afterPage) throw new Error('Job removido durante a exportação.')
    job = await updateJob(payload, afterPage, {
      completedPages: index + 1, currentPage: null,
      phase: 'rendering',
      stage: `Página ${pageNumber} verificada (${index + 1}/${job.pages.length})`,
    })
  }

  const beforeMerge = await findJob(payload, jobId)
  if (!beforeMerge) throw new Error('Job removido antes da montagem final.')
  if (beforeMerge.cancelRequested) {
    await updateJob(payload, beforeMerge, {
      status: 'cancelled', phase: 'cancelled', currentPage: null,
      stage: 'Cancelado antes da montagem final', completedAt: new Date().toISOString(),
      expiresAt: pdfExportTtlDate(),
    })
    await cleanupIncompleteJobArtifacts(jobId)
    return
  }
  const finalName = `middara-rulebook-${job.language}-${job.pages[0]}-${job.pages[job.pages.length - 1]}.pdf`
  const partialOutput = path.join(jobDirectory, 'final.partial.pdf')
  const finalOutput = path.join(jobDirectory, finalName)
  const partPaths = job.pages.map(page => path.join(jobDirectory, 'parts', `page-${String(page).padStart(3, '0')}.pdf`))
  await updateJob(payload, beforeMerge, { phase: 'assembling', currentPage: null, stage: 'Montando o PDF multipágina' })
  await runWorkerProcess(payload, jobId, 'python', [path.join(root, 'scripts/merge_export_pages.py'), partialOutput, ...partPaths], logPath, pdfExportProcessTimeoutMs())
  const latestBeforeVerify = await findJob(payload, jobId)
  if (!latestBeforeVerify) throw new Error('Job removido antes da verificação final.')
  if (latestBeforeVerify.cancelRequested) throw new PdfExportCancelledError()
  const verificationPath = path.join(jobDirectory, 'verification.json')
  await updateJob(payload, latestBeforeVerify, { phase: 'verifying', stage: `Verificando arquivo, ordem, conteúdo e render das ${job.pages.length} páginas` })
  await runWorkerProcess(payload, jobId, 'python', [
    path.join(root, 'scripts/verify_full_pdf_export.py'), partialOutput, snapshotPath, verificationPath, ...partPaths,
  ], logPath, pdfExportProcessTimeoutMs())
  const verification = JSON.parse(await readFile(verificationPath, 'utf8')) as Record<string, unknown>
  const verificationSummary = Object.fromEntries([
    'pageCount', 'renderedAndVerifiedPages', 'pagesWithSelectableText',
    'sourcePagesExpectedToContainText', 'technicalVerificationOnly',
  ].filter(key => key in verification).map(key => [key, verification[key]]))
  const afterVerify = await findJob(payload, jobId)
  if (!afterVerify) throw new Error('Job removido após a verificação final.')
  if (afterVerify.cancelRequested) throw new PdfExportCancelledError()
  await rename(partialOutput, finalOutput)
  const latest = await findJob(payload, jobId)
  if (!latest) throw new Error('Job removido ao concluir a montagem.')
  if (latest.cancelRequested) {
    throw new PdfExportCancelledError()
  }
  await updateJob(payload, latest, {
    status: 'completed', phase: 'completed', completedPages: job.pages.length, totalPages: job.pages.length,
    currentPage: null, failedPage: null, stage: 'PDF completo e verificado tecnicamente', outputPath: finalOutput,
    downloadName: finalName, verificationSummary, completedAt: new Date().toISOString(), expiresAt: pdfExportTtlDate(),
    snapshotPath: null, snapshotHash: null, workerPid: null, workerCommand: null, workerProcessStartedAt: null,
  })
  await cleanupIncompleteJobArtifacts(jobId)
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
          const cancelled = current.cancelRequested || error instanceof PdfExportCancelledError
          await cleanupFailedJobArtifacts(jobId).catch(() => undefined)
          await updateJob(payload, current, cancelled ? {
            status: 'cancelled', phase: 'cancelled', currentPage: null, outputPath: null,
            stage: `Exportação cancelada após ${current.completedPages} de ${current.totalPages} páginas`,
            error: null, completedAt: new Date().toISOString(), expiresAt: pdfExportTtlDate(),
            snapshotPath: null, snapshotHash: null, workerPid: null, workerCommand: null, workerProcessStartedAt: null,
          } : {
            status: 'failed', phase: 'failed', currentPage: null, failedPage: current.currentPage ?? null, outputPath: null,
            stage: current.currentPage
              ? `Falha ao exportar a página ${current.currentPage}`
              : 'Falha na exportação; arquivo parcial indisponível',
            error: `${detail} Verifique o log do job e tente novamente.`.slice(0, 500),
            completedAt: new Date().toISOString(), expiresAt: pdfExportTtlDate(),
            snapshotPath: null, snapshotHash: null, workerPid: null, workerCommand: null, workerProcessStartedAt: null,
          }).catch(() => undefined)
        }
      })
      .finally(() => {
        if (globalCoordinator.__middaraPdfExportWorker === worker) globalCoordinator.__middaraPdfExportWorker = null
        setImmediate(() => { void runPdfExportMaintenance(payload) })
      })
  })
}

export async function getPdfExportJob(payload: Payload, jobId: string) {
  await initializePdfExportMaintenance(payload)
  return findJob(payload, jobId)
}

export async function requestPdfExportCancellation(payload: Payload, job: JobDoc) {
  if (job.status === 'queued') {
    const workerOwnsJob = globalCoordinator.__middaraPdfExportWorker?.jobId === job.jobId
    const updated = await updateJob(payload, job, workerOwnsJob ? {
      cancelRequested: true,
      stage: 'Cancelamento solicitado antes da preparação',
    } : {
      status: 'cancelled', phase: 'cancelled', cancelRequested: true, currentPage: null,
      stage: 'Exportação cancelada antes do início', completedAt: new Date().toISOString(),
      expiresAt: pdfExportTtlDate(),
    })
    if (workerOwnsJob) await terminateActivePdfExportProcess(job.jobId)
    else await cleanupIncompleteJobArtifacts(job.jobId)
    return updated
  }
  if (job.status === 'running') {
    const updated = await updateJob(payload, job, {
      cancelRequested: true,
      stage: job.currentPage
        ? `Encerrando os processos da página ${job.currentPage}`
        : 'Encerrando os processos da etapa atual',
    })
    await terminateActivePdfExportProcess(job.jobId)
    return updated
  }
  return job
}

export function publicPdfExportJob(job: JobDoc, includeDownloadUrl = false) {
  const expiresAt = job.expiresAt ? Date.parse(job.expiresAt) : 0
  const hasDownload = job.status === 'completed' && !!job.outputPath && expiresAt > Date.now()
  const phase = job.phase ?? (job.status === 'running'
    ? (job.currentPage ? 'rendering' : 'preparing')
    : job.status)
  return {
    id: job.jobId,
    language: job.language,
    profile: job.profile,
    pages: job.pages,
    status: job.status,
    phase,
    completedPages: job.completedPages,
    totalPages: job.totalPages,
    progressPercent: pdfExportProgressPercent(phase, job.completedPages, job.totalPages),
    currentPage: job.currentPage ?? null,
    failedPage: job.failedPage ?? null,
    stage: job.stage,
    verificationSummary: job.verificationSummary ?? null,
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
  const safeDirectory = await safePdfExportJobDirectory(job.jobId)
  if (!safeDirectory) return null
  const jobDirectory = path.resolve(safeDirectory)
  const outputPath = path.resolve(job.outputPath)
  const relativePath = path.relative(jobDirectory, outputPath)
  if (!/^middara-rulebook-[a-z-]+-\d+-\d+\.pdf$/iu.test(relativePath)) return null
  try {
    const info = await lstat(outputPath)
    if (!info.isFile() || info.isSymbolicLink()) return null
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
    translationReviews: SnapshotDoc[]
    translationReviewRequests: SnapshotDoc[]
    translationGlossaryDecisions: SnapshotDoc[]
    translationReviewCatalog: Record<string, unknown>
    layoutFrames: SnapshotDoc[]
    symbolAliasSettings: SnapshotDoc[]
    sourcePdfSha256: string
    sourcePageBoxes: Record<string, Record<string, number[]>>
    pageAssetSha256: Record<string, string>
  }
}

export function pdfExportTtlDate() {
  return new Date(Date.now() + pdfExportRetentionDays(process.env.MIDDARA_PDF_EXPORT_RETENTION_DAYS) * 24 * 60 * 60 * 1000).toISOString()
}

export type { JobDoc }
