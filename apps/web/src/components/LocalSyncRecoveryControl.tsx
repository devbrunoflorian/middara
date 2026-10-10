import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Cloud, Download, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  applyLocalPersistenceChange,
  createLocalRecoveryPackage,
  inspectLocalPersistence,
  LOCAL_PERSISTENCE_CHANGED_EVENT,
  retryMissingLocalRecord,
  type LocalPersistenceEventDetail,
  type LocalPersistenceEntry,
  type LocalPersistenceReport,
} from '../localPersistence';
import './LocalSyncRecoveryControl.css';

interface LocalSyncRecoveryControlProps {
  visible: boolean;
}

function describeEntry(entry: LocalPersistenceEntry): string {
  const page = entry.pageNumber ? `p. ${entry.pageNumber}` : 'página não identificada';
  if (entry.kind === 'frame') return `Moldura · ${page} · ${entry.unitKey}`;
  if (entry.editorialUnitId) return `Tradução · ${page} · unidade ${entry.editorialUnitId}`;
  if (entry.blockIndex !== undefined) return `Tradução · ${page} · bloco ${entry.blockIndex}`;
  return `Tradução · ${entry.spanKey ?? entry.id}`;
}

function syncStateText(entry: LocalPersistenceEntry): string {
  if (entry.syncState === 'missing_remote') return 'Ainda não existe no Payload';
  if (entry.syncState === 'diverged') return 'Conteúdo local difere do Payload';
  if (entry.syncState === 'unverified') return 'Payload indisponível; estado não verificado';
  if (entry.syncState === 'sync_error') return 'Falha de sincronização; versão remota não confirmada';
  return 'Payload confirmado';
}

function downloadRecovery(report: LocalPersistenceReport) {
  const packageData = createLocalRecoveryPackage(report);
  const blob = new Blob([`${JSON.stringify(packageData, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `middara-local-recovery-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LocalSyncRecoveryControl({ visible }: LocalSyncRecoveryControlProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reportRef = useRef<LocalPersistenceReport | null>(null);
  const refreshVersion = useRef(0);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<LocalPersistenceReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setChecking(true);
    const result = await inspectLocalPersistence();
    if (version !== refreshVersion.current) return;
    reportRef.current = result;
    setReport(result);
    setChecking(false);
  }, []);

  const onPersistenceChange = useCallback((event: Event) => {
    const detail = (event as CustomEvent<LocalPersistenceEventDetail | undefined>).detail;
    if (detail && reportRef.current) {
      const updated = applyLocalPersistenceChange(reportRef.current, detail);
      if (updated) {
        refreshVersion.current += 1;
        reportRef.current = updated;
        setReport(updated);
        setChecking(false);
        return;
      }
    }
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!visible) {
      if (dialogRef.current?.open) dialogRef.current.close();
      return;
    }
    const initialRefresh = window.setTimeout(() => { void refresh(); }, 0);
    const refreshAfterChange = () => { void refresh(); };
    window.addEventListener(LOCAL_PERSISTENCE_CHANGED_EVENT, onPersistenceChange);
    window.addEventListener('storage', refreshAfterChange);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener(LOCAL_PERSISTENCE_CHANGED_EVENT, onPersistenceChange);
      window.removeEventListener('storage', refreshAfterChange);
    };
  }, [visible, refresh, onPersistenceChange]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const retry = useCallback(async (entry: LocalPersistenceEntry) => {
    setRetryingId(entry.id);
    const result = await retryMissingLocalRecord(entry);
    setNotice(result === 'confirmed'
      ? 'PAYLOAD CONFIRMADO — o registro foi reenviado e verificado.'
      : result === 'conflict'
        ? 'O Payload já tem esse registro. Nenhuma versão foi sobrescrita.'
        : result === 'changed'
          ? 'O registro local mudou; confira o status atualizado antes de tentar novamente.'
          : result === 'missing_local'
            ? 'O registro local não está mais presente.'
            : 'ERRO DE SINCRONIZAÇÃO — Payload não confirmou o retry; os dados locais foram preservados.');
    setRetryingId(null);
    await refresh();
  }, [refresh]);

  if (!visible) return null;
  const unsyncedEntries = report?.entries.filter(entry => entry.syncState !== 'confirmed') ?? [];
  const countLabel = report?.payloadAvailable
    ? `UNSYNCED LOCAL RECORDS = ${report.unsyncedCount}`
    : report ? 'UNSYNCED LOCAL RECORDS = ?' : 'Verificando sincronização local';

  return (
    <>
      <button
        type="button"
        className={`tool-btn local-sync-trigger ${report?.payloadAvailable && report.unsyncedCount === 0 ? 'is-confirmed' : 'is-pending'}`}
        aria-label={countLabel}
        title={countLabel}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {report?.payloadAvailable && report.unsyncedCount === 0 ? <Cloud size={16} /> : <TriangleAlert size={16} />}
        <span className="local-sync-count" aria-hidden="true">
          {checking ? '…' : report?.payloadAvailable ? report.unsyncedCount : '?'}
        </span>
      </button>
      <dialog
        ref={dialogRef}
        className="local-sync-dialog arcane-glass-surface"
        aria-labelledby="local-sync-dialog-title"
        onClose={() => setOpen(false)}
        onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
      >
        <header className="local-sync-dialog-header">
          <div>
            <h2 id="local-sync-dialog-title">Sincronização e recuperação local</h2>
            <p>Os dados ficam no navegador até o Payload confirmar a sincronização.</p>
          </div>
          <button type="button" className="local-sync-close" onClick={() => setOpen(false)} aria-label="Fechar recuperação local">×</button>
        </header>
        <div className="local-sync-dialog-body">
          <div role="status" aria-live="polite" className={`local-sync-summary ${report?.unsyncedCount === 0 ? 'is-confirmed' : 'is-pending'}`}>
            {checking && !report ? 'Verificando registros locais e Payload…' : countLabel}
          </div>
          {report && !report.payloadAvailable && (
            <p className="local-sync-warning">Payload não respondeu. Não é possível calcular a contagem; os registros locais continuam no navegador e podem ser exportados.</p>
          )}
          {report?.payloadAvailable && report.unsyncedCount === 0 && (
            <p className="local-sync-confirmed"><Check size={15} aria-hidden="true" /> Todos os registros locais atuais coincidem com o Payload.</p>
          )}
          {report && unsyncedEntries.length > 0 && (
            <ul className="local-sync-record-list">
              {unsyncedEntries.map(entry => (
                <li key={entry.id}>
                  <div>
                    <strong>{describeEntry(entry)}</strong>
                    <span>{entry.language} · {syncStateText(entry)}</span>
                    {entry.payloadUpdatedAt && <small>Payload atualizado: {entry.payloadUpdatedAt}</small>}
                  </div>
                  {entry.syncState === 'missing_remote' || entry.syncState === 'sync_error' ? (
                    <button type="button" disabled={retryingId === entry.id || checking} onClick={() => void retry(entry)}>
                      {retryingId === entry.id ? 'Enviando…' : 'Tentar sincronizar'}
                    </button>
                  ) : entry.syncState === 'diverged' ? (
                    <span className="local-sync-conflict">Sem retry automático: versões divergentes.</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {notice && <p className="local-sync-notice" role="status" aria-live="polite">{notice}</p>}
          {report?.error && <details className="local-sync-error-details"><summary>Detalhe da verificação</summary><code>{report.error}</code></details>}
        </div>
        <footer className="local-sync-dialog-actions">
          <button type="button" onClick={() => void refresh()} disabled={checking}>
            <RefreshCw size={14} aria-hidden="true" /> {checking ? 'Verificando…' : 'Atualizar comparação'}
          </button>
          <button type="button" onClick={() => report && downloadRecovery(report)} disabled={!report || report.entries.length === 0}>
            <Download size={14} aria-hidden="true" /> Exportar recuperação JSON
          </button>
        </footer>
      </dialog>
    </>
  );
}
