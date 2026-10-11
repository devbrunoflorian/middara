import { useEffect, useRef, useState } from 'react'
import { CircleCheck, FileDown, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { inspectLocalPersistence, type LocalPersistenceReport } from '../localPersistence'
import { payloadApiOrigin, payloadApiUrl } from '../config/payloadApi'
import { pdfExportBlockReason, type PdfExportJob, type PdfExportPageMode } from '../pdfExport'
import './PdfExportDialog.css'

interface PdfExportDialogProps {
  open: boolean
  currentLanguage: 'en' | 'pt-BR'
  currentPage: number
  hasUnsavedDraft: boolean
  onClose: () => void
}

function isTerminal(job: PdfExportJob) {
  return job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
}

function responseError(body: PdfExportJob | { error?: string }, fallback: string) {
  const message = (body as { error?: unknown }).error
  return typeof message === 'string' ? message : fallback
}

export function PdfExportDialog({ open, currentLanguage, currentPage, hasUnsavedDraft, onClose }: PdfExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const wasOpenRef = useRef(false)
  const [language, setLanguage] = useState<'en' | 'pt-BR'>(currentLanguage)
  const [pageMode, setPageMode] = useState<PdfExportPageMode>('current')
  const [rangeStart, setRangeStart] = useState(currentPage)
  const [rangeEnd, setRangeEnd] = useState(currentPage)
  const [job, setJob] = useState<PdfExportJob | null>(null)
  const [checking, setChecking] = useState(false)
  const [guardReport, setGuardReport] = useState<LocalPersistenceReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelPending, setCancelPending] = useState(false)
  const isPortuguese = currentLanguage === 'pt-BR'
  const activeJob = !!job && !isTerminal(job)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
    if (open && !wasOpenRef.current) {
      setLanguage(currentLanguage)
      setPageMode('current')
      setRangeStart(currentPage)
      setRangeEnd(currentPage)
      setError(null)
      setGuardReport(null)
    }
    wasOpenRef.current = open
  }, [open, currentLanguage, currentPage])

  useEffect(() => {
    if (!job || isTerminal(job)) return
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const response = await fetch(payloadApiUrl(`exports/${encodeURIComponent(job.id)}`), { credentials: 'include', cache: 'no-store' })
        const body = await response.json() as PdfExportJob | { error?: string }
        if (!response.ok) throw new Error(responseError(body, 'Não foi possível atualizar o progresso.'))
        if (!stopped) setJob(body as PdfExportJob)
      } catch (pollError) {
        if (!stopped) setError(pollError instanceof Error ? pollError.message : 'Falha ao consultar o job.')
      } finally {
        if (!stopped) timer = window.setTimeout(poll, 1500)
      }
    }
    timer = window.setTimeout(poll, 700)
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [job?.id, job?.status])

  const selectedPages = () => {
    if (pageMode === 'all') return Array.from({ length: 102 }, (_, index) => index + 1)
    if (pageMode === 'current') return [currentPage]
    if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeStart < 1 || rangeEnd > 102 || rangeStart > rangeEnd) {
      throw new Error(isPortuguese ? 'Informe um intervalo válido entre as páginas 1 e 102.' : 'Enter a valid range from page 1 to 102.')
    }
    return Array.from({ length: rangeEnd - rangeStart + 1 }, (_, index) => rangeStart + index)
  }

  const handleExport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (activeJob || checking) return
    setError(null)
    setGuardReport(null)
    setChecking(true)
    try {
      const report = await inspectLocalPersistence()
      setGuardReport(report)
      const blocked = pdfExportBlockReason(hasUnsavedDraft, report)
      if (blocked) return
      const response = await fetch(payloadApiUrl('exports'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, pages: selectedPages(), profile: 'visual' }),
      })
      const body = await response.json() as PdfExportJob | { error?: string }
      if (!response.ok) throw new Error(responseError(body, 'Não foi possível iniciar a exportação.'))
      setJob(body as PdfExportJob)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível iniciar a exportação.')
    } finally {
      setChecking(false)
    }
  }

  const handleCancel = async () => {
    if (!job || !activeJob) return
    setCancelPending(true)
    setError(null)
    try {
      const response = await fetch(payloadApiUrl(`exports/${encodeURIComponent(job.id)}/cancel`), {
        method: 'POST', credentials: 'include',
      })
      const body = await response.json() as PdfExportJob | { error?: string }
      if (!response.ok) throw new Error(responseError(body, 'Não foi possível cancelar.'))
      setJob(body as PdfExportJob)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Falha ao solicitar cancelamento.')
    } finally {
      setCancelPending(false)
    }
  }

  const blockReason = guardReport === null
    ? (hasUnsavedDraft ? 'draft' : null)
    : pdfExportBlockReason(hasUnsavedDraft, guardReport)
  const downloadHref = job?.hasDownload && job.downloadUrl
    ? new URL(job.downloadUrl, payloadApiOrigin).toString()
    : null

  return (
    <dialog
      ref={dialogRef}
      className="pdf-export-dialog"
      aria-labelledby="pdf-export-title"
      aria-describedby="pdf-export-description"
      onCancel={event => { event.preventDefault(); onClose() }}
      onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <header className="pdf-export-header">
        <div>
          <p className="pdf-export-eyebrow">MIDDARA · {isPortuguese ? 'EXPORTAÇÃO' : 'EXPORT'}</p>
          <h2 id="pdf-export-title">{isPortuguese ? 'Exportar PDF' : 'Export PDF'}</h2>
        </div>
        <button className="pdf-export-close" type="button" onClick={onClose} aria-label={isPortuguese ? 'Fechar exportação' : 'Close export dialog'}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <form className="pdf-export-form" onSubmit={handleExport}>
        <p id="pdf-export-description" className="pdf-export-description">
          {isPortuguese
            ? 'O PDF usa uma cópia imutável da versão salva no servidor no início do job.'
            : 'The PDF uses an immutable snapshot of the server-saved version captured when the job starts.'}
        </p>
        <fieldset>
          <legend>{isPortuguese ? 'Idioma' : 'Language'}</legend>
          <label className="pdf-export-field">
            <span>{isPortuguese ? 'Idioma do documento' : 'Document language'}</span>
            <select value={language} onChange={event => setLanguage(event.target.value as 'en' | 'pt-BR')} disabled={activeJob || checking}>
              <option value="en">English</option>
              <option value="pt-BR">Português (Brasil)</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>{isPortuguese ? 'Páginas' : 'Pages'}</legend>
          <label className="pdf-export-field">
            <span>{isPortuguese ? 'Escopo' : 'Scope'}</span>
            <select value={pageMode} onChange={event => setPageMode(event.target.value as PdfExportPageMode)} disabled={activeJob || checking}>
              <option value="current">{isPortuguese ? `Página atual (${currentPage})` : `Current page (${currentPage})`}</option>
              <option value="range">{isPortuguese ? 'Intervalo personalizado' : 'Custom range'}</option>
              <option value="all">{isPortuguese ? 'Documento inteiro (102 páginas)' : 'Full document (102 pages)'}</option>
            </select>
          </label>
          {pageMode === 'range' && (
            <div className="pdf-export-range">
              <label className="pdf-export-field">
                <span>{isPortuguese ? 'De' : 'From'}</span>
                <input type="number" min={1} max={102} value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))} required />
              </label>
              <label className="pdf-export-field">
                <span>{isPortuguese ? 'Até' : 'To'}</span>
                <input type="number" min={1} max={102} value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))} required />
              </label>
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>{isPortuguese ? 'Formato' : 'Format'}</legend>
          <label className="pdf-export-field">
            <span>{isPortuguese ? 'Perfil de saída' : 'Output profile'}</span>
            <select value="visual" disabled onChange={() => undefined}>
              <option value="visual">PDF Visual</option>
              <option value="editable" disabled>{isPortuguese ? 'PDF Editável · experimental, indisponível' : 'Editable PDF · experimental, unavailable'}</option>
            </select>
          </label>
        </fieldset>

        {hasUnsavedDraft && (
          <div className="pdf-export-warning" role="status">
            <TriangleAlert size={17} aria-hidden="true" />
            <span>{isPortuguese
              ? 'Há alterações editoriais não salvas. Salve ou encerre o draft pelo editor; exportar não vai salvá-lo nem descartá-lo.'
              : 'There are unsaved editorial changes. Save or close the draft in the editor; export will not save or discard it.'}</span>
          </div>
        )}
        {blockReason === 'sync-pending' && guardReport && (
          <div className="pdf-export-warning" role="status">
            <TriangleAlert size={17} aria-hidden="true" />
            <span>{isPortuguese
              ? `${guardReport.unsyncedCount} registro(s) local(is) ainda não confirmado(s). Este PDF usaria apenas a versão salva no servidor. Sincronize pelo controle existente e tente novamente.`
              : `${guardReport.unsyncedCount} local record(s) are not confirmed. This PDF would use only the server-saved version. Sync using the existing control, then try again.`}</span>
          </div>
        )}
        {blockReason === 'sync-unavailable' && !hasUnsavedDraft && (
          <div className="pdf-export-warning" role="status">
            <TriangleAlert size={17} aria-hidden="true" />
            <span>{isPortuguese
              ? 'Não foi possível confirmar a sincronização com o Payload. Nenhum job foi iniciado; os dados locais foram preservados.'
              : 'Could not confirm synchronization with Payload. No job was started; local data was preserved.'}</span>
          </div>
        )}
        {job && (
          <section className={`pdf-export-job is-${job.status}`} aria-label={isPortuguese ? 'Progresso da exportação' : 'Export progress'}>
            <div className="pdf-export-job-heading">
              {job.status === 'completed' ? <CircleCheck size={17} aria-hidden="true" /> : job.status === 'failed' ? <TriangleAlert size={17} aria-hidden="true" /> : <LoaderCircle className="pdf-export-spinner" size={17} aria-hidden="true" />}
              <strong>{job.stage}</strong>
            </div>
            <p className="pdf-export-job-detail" aria-live="polite">
              {job.completedPages} / {job.totalPages} {isPortuguese ? 'páginas verificadas' : 'pages verified'}
              {job.currentPage ? ` · ${isPortuguese ? 'página atual' : 'current page'} ${job.currentPage}` : ''}
            </p>
            <progress value={job.completedPages} max={Math.max(1, job.totalPages)} aria-label={isPortuguese ? 'Páginas concluídas' : 'Pages completed'} />
            {job.error && <p className="pdf-export-job-error" role="alert">{job.error}</p>}
          </section>
        )}
        {error && <p className="pdf-export-error" role="alert">{error}</p>}

        <footer className="pdf-export-actions">
          {activeJob && (
            <button type="button" className="pdf-export-secondary" onClick={handleCancel} disabled={cancelPending || !!job?.cancelRequested}>
              {cancelPending || job?.cancelRequested ? (isPortuguese ? 'Cancelamento solicitado…' : 'Cancellation requested…') : (isPortuguese ? 'Cancelar job' : 'Cancel job')}
            </button>
          )}
          {downloadHref && (
            <a className="pdf-export-primary" href={downloadHref}>
              <FileDown size={16} aria-hidden="true" /> {isPortuguese ? 'Baixar PDF' : 'Download PDF'}
            </a>
          )}
          <button type="button" className="pdf-export-secondary" onClick={onClose}>
            {isPortuguese ? 'Fechar' : 'Close'}
          </button>
          <button type="submit" className="pdf-export-primary" disabled={activeJob || checking || hasUnsavedDraft || blockReason === 'sync-pending' || blockReason === 'sync-unavailable'}>
            {checking ? <LoaderCircle className="pdf-export-spinner" size={16} aria-hidden="true" /> : <FileDown size={16} aria-hidden="true" />}
            {checking ? (isPortuguese ? 'Verificando…' : 'Checking…') : (isPortuguese ? 'Exportar' : 'Export')}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
