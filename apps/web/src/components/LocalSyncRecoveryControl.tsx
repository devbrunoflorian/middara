import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Cloud, Download, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  applyLocalPersistenceChange,
  createLocalPersistenceEntryRecoveryPackage,
  createLocalRecoveryPackage,
  inspectLocalPersistence,
  LOCAL_PERSISTENCE_CHANGED_EVENT,
  removeLocalOverrideEntry,
  resolveDivergedLocalRecord,
  retryMissingLocalRecord,
  type LocalPersistenceEventDetail,
  type LocalPersistenceEntry,
  type LocalPersistenceReport,
} from '../localPersistence';
import './LocalSyncRecoveryControl.css';

interface LocalSyncRecoveryControlProps {
  visible: boolean;
  hasUnsavedDraft?: boolean;
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

function downloadEntryRecovery(entry: LocalPersistenceEntry): boolean {
  try {
    const packageData = createLocalPersistenceEntryRecoveryPackage(entry);
    const blob = new Blob([`${JSON.stringify(packageData, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `middara-local-entry-recovery-${Date.now()}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch { return false; }
}

function differencePaths(local: unknown, remote: unknown, path = '$'): string[] {
  if (JSON.stringify(local) === JSON.stringify(remote)) return [];
  if (local && remote && typeof local === 'object' && typeof remote === 'object'
    && !Array.isArray(local) && !Array.isArray(remote)) {
    const left = local as Record<string, unknown>;
    const right = remote as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .flatMap(key => differencePaths(left[key], right[key], `${path}.${key}`));
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const length = Math.max(local.length, remote.length);
    return Array.from({ length }, (_, index) => differencePaths(local[index], remote[index], `${path}[${index}]`)).flat();
  }
  return [path];
}

export function LocalSyncRecoveryControl({ visible, hasUnsavedDraft = false }: LocalSyncRecoveryControlProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reportRef = useRef<LocalPersistenceReport | null>(null);
  const refreshVersion = useRef(0);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<LocalPersistenceReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [pendingDiscardId, setPendingDiscardId] = useState<string | null>(null);
  const [downloadedBackups, setDownloadedBackups] = useState<Set<string>>(() => new Set());
  const [confirmedBackups, setConfirmedBackups] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const operationRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setChecking(true);
    const result = await inspectLocalPersistence();
    if (version !== refreshVersion.current) return;
    reportRef.current = result;
    setReport(result);
    setDownloadedBackups(new Set());
    setConfirmedBackups(new Set());
    setPendingDiscardId(null);
    setChecking(false);
  }, []);

  const onPersistenceChange = useCallback((event: Event) => {
    const detail = (event as CustomEvent<LocalPersistenceEventDetail | undefined>).detail;
    if (detail && !detail.confirmed && !detail.deleted) {
      void refresh();
      return;
    }
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
    if (operationRef.current || hasUnsavedDraft) return;
    operationRef.current = `retry:${entry.id}`;
    setRetryingId(entry.id);
    try {
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
      await refresh();
    } finally {
      operationRef.current = null;
      setRetryingId(null);
    }
  }, [hasUnsavedDraft, refresh]);

  const resolve = useCallback(async (entry: LocalPersistenceEntry, resolution: 'local-to-payload' | 'payload-to-local') => {
    if (operationRef.current || hasUnsavedDraft) return;
    const localChoice = resolution === 'local-to-payload';
    const confirmation = localChoice
      ? 'Aplicar a versão local ao Payload? Isso altera somente este registro. O estado atual do Payload será verificado novamente antes do PATCH.'
      : 'Substituir somente este registro local pela versão atual do Payload? O backup exportado preserva a versão local anterior.';
    if (!window.confirm(confirmation)) return;
    if (operationRef.current || hasUnsavedDraft) return;
    operationRef.current = `resolve:${entry.id}`;
    setResolvingId(entry.id);
    try {
      const result = await resolveDivergedLocalRecord(entry, resolution);
      setNotice(result === 'confirmed'
        ? localChoice ? 'Resolução aplicada e lida de volta do Payload.' : 'Cópia do Payload aplicada somente a este registro local.'
        : result === 'stale' ? 'O Payload mudou desde esta comparação. Atualize a lista antes de decidir.'
          : result === 'changed' ? 'A cópia local mudou desde esta comparação. Atualize a lista antes de decidir.'
            : 'Não foi possível aplicar a resolução; as cópias foram preservadas.');
      await refresh();
    } finally {
      operationRef.current = null;
      setResolvingId(null);
    }
  }, [hasUnsavedDraft, refresh]);

  const requestDiscard = useCallback((entry: LocalPersistenceEntry) => {
    if (entry.kind !== 'translation' || !entry.spanKey || !entry.localSnapshot) return;
    if (!reportRef.current?.payloadAvailable) {
      setNotice('Payload indisponível; atualize a comparação antes de descartar uma pendência.');
      return;
    }
    if (hasUnsavedDraft) {
      setNotice('Salve ou descarte a edição ativa antes de remover uma pendência local.');
      return;
    }
    if (operationRef.current || checking || retryingId || resolvingId || discardingId) return;
    if (!confirmedBackups.has(entry.id)) {
      setNotice('Baixe e confirme o backup recuperável desta entrada antes de descartá-la.');
      return;
    }
    setPendingDiscardId(entry.id);
    setNotice(null);
  }, [checking, confirmedBackups, discardingId, hasUnsavedDraft, resolvingId, retryingId]);

  const confirmDiscard = useCallback(async (entry: LocalPersistenceEntry) => {
    if (entry.kind !== 'translation' || !entry.spanKey || !entry.localSnapshot) return;
    if (!confirmedBackups.has(entry.id)) {
      setNotice('Confirme o backup recuperável antes de descartar esta entrada.');
      setPendingDiscardId(null);
      return;
    }
    if (!reportRef.current?.payloadAvailable || hasUnsavedDraft || operationRef.current || checking || retryingId || resolvingId || discardingId) {
      setPendingDiscardId(null);
      setNotice(hasUnsavedDraft
        ? 'Há uma edição ativa não salva; nada foi descartado.'
        : 'A comparação ou outra operação mudou; atualize a lista antes de confirmar.');
      return;
    }

    const localeLabel = entry.language === 'pt-BR' ? 'PT-BR' : 'EN';
    const identity = `${localeLabel} · tradução · ${entry.spanKey}`;

    operationRef.current = `discard:${entry.id}`;
    setDiscardingId(entry.id);
    setPendingDiscardId(null);
    setNotice(null);
    try {
      const result = removeLocalOverrideEntry(entry.language, entry.spanKey, entry.localSnapshot);
      setNotice(result === 'removed'
        ? `Override local removido e verificado: ${identity}. O Payload não foi alterado.`
        : result === 'changed'
          ? 'O registro local mudou desde a revisão; nada foi descartado. Atualize e revise o novo snapshot.'
          : result === 'missing'
            ? 'O registro local já não existe. Atualizando a lista sem declarar descarte.'
            : result === 'ambiguous'
              ? 'Há mais de uma entrada com essa chave; nada foi descartado. Revise a duplicidade antes de continuar.'
              : 'Falha ao gravar ou verificar o armazenamento local; o descarte não foi confirmado.');
      await refresh();
    } finally {
      operationRef.current = null;
      setDiscardingId(null);
    }
  }, [checking, confirmedBackups, discardingId, hasUnsavedDraft, refresh, resolvingId, retryingId]);

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
                    <code className="local-sync-entry-key">{entry.kind} · {entry.spanKey ?? entry.unitKey}</code>
                    {entry.payloadUpdatedAt && <small>Payload atualizado: {entry.payloadUpdatedAt}</small>}
                  </div>
                  {entry.syncState === 'missing_remote' || entry.syncState === 'sync_error' ? (
                    <button type="button" disabled={retryingId === entry.id || checking} onClick={() => void retry(entry)}>
                      {retryingId === entry.id ? 'Enviando…' : 'Tentar sincronizar'}
                    </button>
                  ) : entry.syncState === 'diverged' ? (
                    <span className="local-sync-conflict">Revisão manual necessária.</span>
                  ) : null}
                  {entry.syncState === 'diverged' && (
                    <details className="local-sync-conflict-review">
                      <summary>Revisar versões e diferenças</summary>
                      <div className="local-sync-diff-paths">
                        Diferenças: {differencePaths(entry.data, entry.payloadComparableData ?? entry.payloadData).join(', ') || 'nenhuma'}
                      </div>
                      <div className="local-sync-version-grid">
                        <section>
                          <h3>Local (navegador)</h3>
                          <pre>{JSON.stringify(entry.data, null, 2)}</pre>
                        </section>
                        <section>
                          <h3>Payload {entry.payloadId !== undefined && `· ID ${entry.payloadId}`}</h3>
                          <pre>{JSON.stringify(entry.payloadData, null, 2)}</pre>
                        </section>
                      </div>
                      <button
                        type="button"
                        className="local-sync-backup-button"
                        disabled={!report}
                        onClick={() => {
                          if (!report) return;
                          downloadRecovery(report);
                          setDownloadedBackups(current => new Set(current).add(entry.id));
                          setConfirmedBackups(current => { const next = new Set(current); next.delete(entry.id); return next; });
                        }}
                      >
                        <Download size={14} aria-hidden="true" /> Baixar backup local + Payload
                      </button>
                      <label className="local-sync-backup-confirmation">
                        <input
                          type="checkbox"
                          disabled={!downloadedBackups.has(entry.id)}
                          checked={confirmedBackups.has(entry.id)}
                          onChange={event => setConfirmedBackups(current => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(entry.id); else next.delete(entry.id);
                            return next;
                          })}
                        />
                        Confirmei que salvei o backup recuperável desta divergência.
                      </label>
                      <div className="local-sync-resolution-actions">
                        <button
                          type="button"
                          disabled={!confirmedBackups.has(entry.id) || resolvingId === entry.id || checking}
                          onClick={() => void resolve(entry, 'local-to-payload')}
                        >
                          {resolvingId === entry.id ? 'Aplicando…' : 'Manter local no Payload'}
                        </button>
                        <button
                          type="button"
                          disabled={!confirmedBackups.has(entry.id) || resolvingId === entry.id || checking}
                          onClick={() => void resolve(entry, 'payload-to-local')}
                        >
                          Usar Payload localmente
                        </button>
                      </div>
                      <small>Uma divergência por vez. A resolução para o Payload confere ID, conteúdo e timestamp antes da gravação e verifica a leitura posterior.</small>
                    </details>
                  )}
                  {entry.kind === 'translation' && entry.localSnapshot !== undefined && entry.syncState !== 'confirmed' && (
                    <details className="local-sync-discard-review">
                      <summary>Revisar snapshot local completo antes de descartar</summary>
                      <pre>{JSON.stringify(entry.localSnapshot, null, 2)}</pre>
                      <p>O descarte compara novamente este registro completo com o armazenamento. Qualquer diferença aborta a operação.</p>
                      <button
                        type="button"
                        className="local-sync-backup-button"
                        disabled={checking || discardingId === entry.id}
                        onClick={() => {
                          if (downloadEntryRecovery(entry)) {
                            setDownloadedBackups(current => new Set(current).add(entry.id));
                            setConfirmedBackups(current => { const next = new Set(current); next.delete(entry.id); return next; });
                            setNotice(`Backup individual gerado para ${entry.spanKey}. Confirme que o arquivo foi salvo.`);
                          } else {
                            setNotice('Não foi possível gerar o backup individual; nada foi descartado.');
                          }
                        }}
                      >
                        <Download size={14} aria-hidden="true" /> Baixar backup desta entrada
                      </button>
                      <label className="local-sync-backup-confirmation">
                        <input
                          type="checkbox"
                          aria-label={`Confirmei que salvei o backup de ${entry.language} ${entry.spanKey}`}
                          disabled={!downloadedBackups.has(entry.id)}
                          checked={confirmedBackups.has(entry.id)}
                          onChange={event => setConfirmedBackups(current => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(entry.id); else next.delete(entry.id);
                            return next;
                          })}
                        />
                        Salvei o backup recuperável desta entrada.
                      </label>
                      <p className="local-sync-discard-warning">Descartar remove somente este override local. O Payload permanece intacto.</p>
                      {hasUnsavedDraft && <p className="local-sync-discard-warning">Há uma edição ativa não salva. Salve ou descarte esse draft antes.</p>}
                      {!report?.payloadAvailable && <p className="local-sync-discard-warning">Payload precisa estar disponível para revisar o estado remoto atual.</p>}
                      <button
                        type="button"
                        className="local-sync-discard-button"
                        disabled={!confirmedBackups.has(entry.id) || hasUnsavedDraft || !report?.payloadAvailable || checking || retryingId !== null || resolvingId !== null || discardingId !== null}
                        onClick={() => requestDiscard(entry)}
                      >
                        {discardingId === entry.id ? 'Conferindo e descartando…' : 'Revisar descarte desta pendência'}
                      </button>
                      {pendingDiscardId === entry.id && (
                        <section className="local-sync-discard-confirmation" aria-labelledby={`discard-confirm-title-${entry.id}`}>
                          <h3 id={`discard-confirm-title-${entry.id}`}>Confirme o descarte individual</h3>
                          <p><strong>{entry.language === 'pt-BR' ? 'PT-BR' : 'EN'} · tradução · {entry.spanKey}</strong></p>
                          <p>Será removido somente este override local. O conteúdo salvo no Payload não será alterado; as demais traduções, molduras e registros permanecerão intactos.</p>
                          <div className="local-sync-resolution-actions">
                            <button type="button" onClick={() => setPendingDiscardId(null)}>Cancelar</button>
                            <button
                              type="button"
                              className="local-sync-discard-button"
                              disabled={!confirmedBackups.has(entry.id) || hasUnsavedDraft || !report?.payloadAvailable || checking || retryingId !== null || resolvingId !== null || discardingId !== null}
                              onClick={() => void confirmDiscard(entry)}
                            >Confirmar descarte individual</button>
                          </div>
                        </section>
                      )}
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {notice && <p className="local-sync-notice" role="status" aria-live="polite">{notice}</p>}
          {report?.error && <details className="local-sync-error-details"><summary>Detalhe da verificação</summary><code>{report.error}</code></details>}
        </div>
        <footer className="local-sync-dialog-actions">
          <button type="button" onClick={() => void refresh()} disabled={checking || retryingId !== null || resolvingId !== null || discardingId !== null}>
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
