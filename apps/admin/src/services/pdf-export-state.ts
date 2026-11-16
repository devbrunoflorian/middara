export type PdfExportPhase =
  | 'queued'
  | 'preparing'
  | 'rendering'
  | 'assembling'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Progress is intentionally below 100 until the final multipage PDF is verified. */
export function pdfExportProgressPercent(phase: PdfExportPhase, completedPages: number, totalPages: number) {
  const total = Number.isFinite(totalPages) ? Math.max(1, Math.floor(totalPages)) : 1
  const completed = Number.isFinite(completedPages) ? Math.max(0, Math.min(total, Math.floor(completedPages))) : 0
  switch (phase) {
    case 'queued': return 0
    case 'preparing': return 2
    case 'rendering': return Math.min(88, 4 + Math.round((completed / total) * 84))
    case 'assembling': return 91
    case 'verifying': return 97
    case 'completed': return 100
    case 'failed':
    case 'cancelled': return Math.min(97, 4 + Math.round((completed / total) * 84))
  }
}

export function pdfExportRetentionDays(value: string | undefined) {
  const days = Number(value)
  if (!Number.isInteger(days)) return 7
  return Math.max(1, Math.min(90, days))
}
