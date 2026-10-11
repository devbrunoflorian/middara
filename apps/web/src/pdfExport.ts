import type { LocalPersistenceReport } from './localPersistence'

export type PdfExportPageMode = 'all' | 'current' | 'range'
export type PdfExportStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface PdfExportJob {
  id: string
  language: 'en' | 'pt-BR'
  profile: 'visual'
  pages: number[]
  status: PdfExportStatus
  completedPages: number
  totalPages: number
  currentPage: number | null
  stage: string
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
