import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ExternalLink, Search, X } from 'lucide-react';
import {
  FAQ_REVIEWED_ON,
  FAQ_SOURCE_URL,
  getCatalogEntries,
  getCatalogSnapshot,
  getConfirmedRulebookPageReferences,
  resolveCatalogContent,
  type AppLocale,
  type CatalogEntry,
  type CatalogType,
} from '../faq/faqContent';

interface FaqDrawerProps {
  language: AppLocale;
  open: boolean;
  activeType?: CatalogType;
  onActiveTypeChange?: (type: CatalogType) => void;
  onOpenChange: (open: boolean) => void;
  onNavigateToPage: (page: number) => boolean;
}

function allSearchableText(entry: CatalogEntry, title: string, body: string): string {
  const history = entry.historicalRecords?.map(record => `${record.titleEn} ${record.bodyEn} ${record.source.document ?? ''}`).join(' ') ?? '';
  const metadata = Object.values(entry.sourceMetadata ?? {}).filter(Boolean).join(' ');
  return `${title} ${entry.titleEn} ${entry.category} ${entry.severity ?? ''} ${entry.status} ${body} ${history} ${metadata} ${(entry.pageReferences ?? []).join(' ')}`.toLocaleLowerCase();
}

function sourceDescription(entry: CatalogEntry, isPortuguese: boolean): string {
  if (entry.source.type === 'official-dropbox') {
    return `${entry.source.historicalVersion ?? 'Middara 1.1'} · ${entry.source.document ?? 'historical source'} · PDF p. ${entry.source.pdfPage ?? '?'}`;
  }
  return isPortuguese
    ? `Site oficial · snapshot ${entry.source.snapshotDate ?? FAQ_REVIEWED_ON}`
    : `Official website · snapshot ${entry.source.snapshotDate ?? FAQ_REVIEWED_ON}`;
}

function statusLabel(entry: CatalogEntry, isPortuguese: boolean): string | null {
  if (entry.rulebook12Status === 'VERIFIED_IN_RULEBOOK_1_2') {
    const page = entry.rulebook12Evidence?.page;
    return isPortuguese ? `Incorporada no Rulebook 1.2${page ? ` · p. ${page}` : ''}` : `Incorporated in Rulebook 1.2${page ? ` · p. ${page}` : ''}`;
  }
  if (entry.rulebook12Status === 'OFFICIAL_1_2_INCLUSION_COMMITMENT') {
    return isPortuguese ? 'Inclusão na 1.2 prevista na fonte histórica' : '1.2 inclusion stated in historical source';
  }
  if (entry.status === 'CURRENT_MODIFIED') return isPortuguese ? 'Atualizado desde o snapshot 1.1' : 'Modified since the 1.1 snapshot';
  if (entry.status === 'CURRENT_ONLY') return isPortuguese ? 'Somente no site atual' : 'Current site only';
  if (entry.status === 'HISTORICAL_ONLY') return isPortuguese ? 'Somente no snapshot histórico' : 'Historical snapshot only';
  if (entry.status === 'AMBIGUOUS') return isPortuguese ? 'Correspondência ambígua' : 'Ambiguous correspondence';
  return null;
}

export function FaqDrawer({ language, open, activeType: requestedActiveType, onActiveTypeChange, onOpenChange, onNavigateToPage }: FaqDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [uncontrolledActiveType, setUncontrolledActiveType] = useState<CatalogType>('faq');
  const activeType = requestedActiveType ?? uncontrolledActiveType;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [openEntryIds, setOpenEntryIds] = useState<Set<string>>(() => new Set());
  const isPortuguese = language === 'pt-BR';
  const entries = getCatalogEntries(activeType);
  const snapshot = getCatalogSnapshot();
  const currentErrataPreface = snapshot.errataSourcePreface;
  const historicalErrataSource = snapshot.historicalSources.find(source => source.file === 'Errata 4-12-21.pdf');
  const hasUntranslatedEntries = entries.some(entry => resolveCatalogContent(entry, 'pt-BR').isFallback);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.show();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    setCategory('all');
    setSeverity('all');
    setOpenEntryIds(new Set());
  }, [activeType]);

  const categories = useMemo(() => [...new Set(entries.map(entry => entry.category))].sort((a, b) => a.localeCompare(b)), [entries]);
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return entries.filter(entry => {
      const display = resolveCatalogContent(entry, language);
      const matchesCategory = category === 'all' || entry.category === category;
      const matchesSeverity = activeType === 'faq' || severity === 'all' || entry.severity === severity;
      return matchesCategory && matchesSeverity && (!normalizedQuery || allSearchableText(entry, display.title, display.text).includes(normalizedQuery));
    });
  }, [activeType, category, entries, language, query, severity]);

  const handleTabChange = (type: CatalogType) => {
    setUncontrolledActiveType(type);
    onActiveTypeChange?.(type);
  };

  const toggleEntry = (entryId: string) => {
    setOpenEntryIds(current => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const noResults = isPortuguese ? 'Nenhuma entrada corresponde aos filtros.' : 'No entries match these filters.';

  return (
    <dialog
      ref={dialogRef}
      className="faq-dialog"
      aria-labelledby="faq-dialog-title"
      aria-modal="false"
      onClose={() => onOpenChange(false)}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          dialogRef.current?.close();
        }
      }}
      onClick={event => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <section className="faq-panel">
        <header className="faq-panel-header">
          <div>
            <p className="faq-eyebrow">MIDDARA · {isPortuguese ? 'REFERÊNCIA OFICIAL' : 'OFFICIAL REFERENCE'}</p>
            <h2 id="faq-dialog-title">{isPortuguese ? 'FAQ e Errata' : 'FAQ and Errata'}</h2>
          </div>
          <button
            className="faq-close"
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={isPortuguese ? 'Fechar painel' : 'Close panel'}
          >
            <X size={18} />
          </button>
        </header>

        <div className="faq-tabs" role="tablist" aria-label={isPortuguese ? 'Tipo de referência' : 'Reference type'}>
          <button type="button" role="tab" aria-selected={activeType === 'faq'} className={activeType === 'faq' ? 'active' : ''} onClick={() => handleTabChange('faq')}>
            FAQ <span>{getCatalogEntries('faq').length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeType === 'errata'} className={activeType === 'errata' ? 'active' : ''} onClick={() => handleTabChange('errata')}>
            ERRATA <span>{getCatalogEntries('errata').length}</span>
          </button>
        </div>

        {isPortuguese && hasUntranslatedEntries && (
          <p className="faq-locale-notice" role="status">
            {activeType === 'faq' ? 'Entradas sem tradução PT-BR revisada aparecem em EN, com indicação por item.' : 'Erratas sem tradução PT-BR revisada aparecem em EN, com indicação por item.'}
          </p>
        )}

        {activeType === 'errata' && (currentErrataPreface || historicalErrataSource?.severityDefinitions) && (
          <details className="faq-errata-context">
            <summary>{isPortuguese ? 'Notas das fontes e níveis de severidade' : 'Source notes and severity levels'}</summary>
            {currentErrataPreface && (
              <section>
                <h3>{currentErrataPreface.titleEn} · {isPortuguese ? 'site atual · EN original' : 'current site · source EN'}</h3>
                <div className="faq-entry-body"><ReactMarkdown>{currentErrataPreface.bodyEn}</ReactMarkdown></div>
              </section>
            )}
            {historicalErrataSource?.severityDefinitions && (
              <section>
                <h3>{isPortuguese ? 'Snapshot histórico 1.1 · 12/04/2021 · EN original' : 'Historical 1.1 snapshot · 2021-04-12 · source EN'}</h3>
                <ul>
                  {Object.entries(historicalErrataSource.severityDefinitions).map(([name, description]) => (
                    <li key={name}><strong>{name}:</strong> {description}</li>
                  ))}
                </ul>
                {historicalErrataSource.official1_2Commitment && <p>{historicalErrataSource.official1_2Commitment}</p>}
              </section>
            )}
          </details>
        )}

        <div className="faq-filters">
          <label className="faq-search">
            <Search size={15} aria-hidden="true" />
            <span className="visually-hidden">{isPortuguese ? 'Buscar no catálogo' : 'Search the catalog'}</span>
            <input
              type="search"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setOpenEntryIds(new Set());
              }}
              placeholder={isPortuguese ? 'Buscar título ou conteúdo' : 'Search titles and content'}
            />
          </label>
          <label className="faq-category-label">
            <span className="visually-hidden">{isPortuguese ? 'Categoria' : 'Category'}</span>
            <select value={category} onChange={event => {
              setCategory(event.target.value);
              setOpenEntryIds(new Set());
            }}>
              <option value="all">{isPortuguese ? 'Todas as categorias' : 'All categories'}</option>
              {categories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {activeType === 'errata' && (
            <label className="faq-severity-label">
              <span className="visually-hidden">{isPortuguese ? 'Severidade' : 'Severity'}</span>
              <select value={severity} onChange={event => {
                setSeverity(event.target.value);
                setOpenEntryIds(new Set());
              }}>
                <option value="all">{isPortuguese ? 'Todas as severidades' : 'All severities'}</option>
                {['Critical', 'Major', 'Minor'].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="faq-result-count" aria-live="polite">
          {isPortuguese ? `${filteredEntries.length} entradas` : `${filteredEntries.length} entries`}
        </div>

        <div className="faq-entry-list">
          {filteredEntries.length ? filteredEntries.map(entry => {
            const content = resolveCatalogContent(entry, language);
            const label = statusLabel(entry, isPortuguese);
            const isExpanded = openEntryIds.has(entry.id);
            const rulebookPages = getConfirmedRulebookPageReferences(entry);
            const detailedPages = new Set((entry.pageReferenceDetails ?? []).map(reference => reference.page));
            const pageReferenceMetadata = [
              ...(entry.pageReferenceDetails ?? [])
                .filter(reference => reference.target !== 'rulebook-1.2' || !rulebookPages.includes(reference.page))
                .map(reference => ({
                  page: reference.page,
                  label: reference.target === 'other-book-or-component'
                    ? (isPortuguese ? 'Outro livro/componente' : 'Other book/component')
                    : (isPortuguese ? 'Referência sem destino confirmado' : 'Unconfirmed page reference'),
                })),
              ...(entry.pageReferences ?? [])
                .filter(page => !detailedPages.has(page) && !rulebookPages.includes(page))
                .map(page => ({ page, label: isPortuguese ? 'Referência sem destino confirmado' : 'Unconfirmed page reference' })),
            ].filter((reference, index, references) => references.findIndex(candidate => candidate.page === reference.page && candidate.label === reference.label) === index);
            const safeEntryId = entry.id.replace(/[^a-zA-Z0-9_-]/g, '-');
            const triggerId = `faq-entry-trigger-${safeEntryId}`;
            const panelId = `faq-entry-panel-${safeEntryId}`;
            return (
              <article className={`faq-entry${isExpanded ? ' is-open' : ''}`} key={entry.id}>
                <h3 className="faq-entry-heading">
                  <button
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    className="faq-entry-trigger"
                    id={triggerId}
                    type="button"
                    onClick={() => toggleEntry(entry.id)}
                  >
                    {activeType === 'faq' ? (
                      <span className="faq-entry-category">{entry.category}</span>
                    ) : (
                      <>
                        {entry.severity && <span className={`faq-severity ${entry.severity.toLowerCase()}`}>{entry.severity}</span>}
                        <span className="faq-entry-category">{entry.category}</span>
                      </>
                    )}
                    <span className="faq-entry-title">{content.title}{entry.spoiler && <span className="faq-spoiler-badge">{isPortuguese ? 'Spoiler' : 'Spoiler'}</span>}</span>
                    <ChevronDown className="faq-entry-chevron" size={16} aria-hidden="true" />
                  </button>
                </h3>
                <div
                  aria-labelledby={triggerId}
                  className="faq-entry-content"
                  hidden={!isExpanded}
                  id={panelId}
                  role="region"
                >
                  {isExpanded && (
                    <>
                      <p className="faq-entry-source">{sourceDescription(entry, isPortuguese)}{content.isFallback && <span className="faq-language-badge">{isPortuguese ? 'Fallback EN' : 'EN fallback'}</span>}</p>
                      {label && <p className={`faq-status-badge ${entry.rulebook12Status === 'VERIFIED_IN_RULEBOOK_1_2' ? 'integrated' : ''}`}>{label}</p>}
                      <div className="faq-entry-body"><ReactMarkdown>{content.text || (isPortuguese ? 'Conteúdo não disponível.' : 'No content available.')}</ReactMarkdown></div>
                      {(rulebookPages.length > 0 || pageReferenceMetadata.length > 0) && (
                        <div className="faq-page-references" aria-label={isPortuguese ? 'Referências de página' : 'Page references'}>
                          {rulebookPages.map(page => (
                            <button
                              className="faq-page-reference-link"
                              key={`rulebook-${page}`}
                              type="button"
                              aria-label={isPortuguese ? `Abrir página ${page} do Rulebook 1.2` : `Open Rulebook 1.2 page ${page}`}
                              title={isPortuguese ? `Ir para Rulebook 1.2 · p. ${page}` : `Go to Rulebook 1.2 · p. ${page}`}
                              onClick={() => {
                                const navigated = onNavigateToPage(page);
                                if (navigated && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 540px)').matches) {
                                  dialogRef.current?.close();
                                }
                              }}
                            >
                              Rulebook · p. {page}
                            </button>
                          ))}
                          {pageReferenceMetadata.map(reference => (
                            <span className="faq-page-reference-note" key={`${reference.label}-${reference.page}`}>
                              {reference.label} · p. {reference.page}
                            </span>
                          ))}
                        </div>
                      )}
                      {entry.sourceMetadata?.notesEn && <details className="faq-source-details"><summary>{isPortuguese ? 'Notas da fonte' : 'Source notes'}</summary><p>{entry.sourceMetadata.notesEn}</p></details>}
                      {entry.sourceMetadata?.examplePageUrl && (
                        <a className="faq-example-link" href={entry.sourceMetadata.examplePageUrl} target="_blank" rel="noreferrer">
                          {isPortuguese ? 'Abrir exemplo oficial' : 'Open official example'} <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      )}
                      {!!entry.historicalRecords?.length && (
                        <details className="faq-history-details">
                          <summary>{isPortuguese ? `Fonte histórica 1.1 (${entry.historicalRecords.length})` : `Historical 1.1 source (${entry.historicalRecords.length})`}</summary>
                          {entry.historicalRecords.map(history => (
                            <section className="faq-history-record" key={history.id}>
                              {history.titleEn !== entry.titleEn && <h4>{history.titleEn}</h4>}
                              <p className="faq-entry-source">{sourceDescription({ ...entry, source: history.source }, isPortuguese)} · {history.transcription === 'OCR_TEXT_LAYER' ? (isPortuguese ? 'texto OCR da fonte' : 'source OCR text') : history.transcription === 'VISUALLY_REVIEWED' ? (isPortuguese ? 'revisado visualmente' : 'visually reviewed') : history.transcription}</p>
                              <p className="faq-history-text">{history.bodyEn}</p>
                            </section>
                          ))}
                        </details>
                      )}
                      {entry.status === 'HISTORICAL_ONLY' && entry.transcription === 'OCR_TEXT_LAYER' && (
                        <p className="faq-ocr-note">{isPortuguese ? 'Transcrição do texto OCR do PDF histórico; consulte a origem para conferir caracteres possivelmente ambíguos.' : 'OCR text-layer transcription from the historical PDF; consult the source for ambiguous characters.'}</p>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          }) : <p className="faq-empty">{noResults}</p>}
        </div>

        <footer className="faq-panel-footer">
          <span>{isPortuguese ? `Snapshot ${FAQ_REVIEWED_ON} · EN é a fonte canônica` : `Snapshot ${FAQ_REVIEWED_ON} · English is canonical`}</span>
          <a href={FAQ_SOURCE_URL} target="_blank" rel="noreferrer">
            {isPortuguese ? 'Fonte oficial atual' : 'Current official source'} <ExternalLink size={14} aria-hidden="true" />
          </a>
        </footer>
      </section>
    </dialog>
  );
}
