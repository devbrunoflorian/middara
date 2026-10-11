import type { LocalPersistenceReport } from './localPersistence'

export type PdfExportPageMode = 'all' | 'current' | 'range'
export type PdfExportStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type PdfExportPhase = 'queued' | 'preparing' | 'rendering' | 'assembling' | 'verifying' | 'completed' | 'failed' | 'cancelled'

export interface PdfExportJob {
  id: string
  language: 'en' | 'pt-BR'
  profile: 'visual'
  pages: number[]
  status: PdfExportStatus
  phase: PdfExportPhase
  completedPages: number
  totalPages: number
  progressPercent: number
  currentPage: number | null
  failedPage: number | null
  stage: string
  verificationSummary: Record<string, unknown> | null
  cancelRequested: boolean
  error: string | null
  hasDownload: boolean
  downloadName: string | null
  downloadUrl?: string
}

export function pdfExportBlockReason(hasUnsavedDraft: boolean, sync: LocalPersistenceReport | null): 'draft' | 'sync-unavailable' | 'sync-pending' | null {
  if (hasUnsavedDraft) return 'draft'
  if (!sync || !sync.payloadAvailable || sync.unsyncedCount === null) return 'sync-unavailable'
  if (sync.unsyncedCount > 0) return 'sync-pending'
  return null
}
