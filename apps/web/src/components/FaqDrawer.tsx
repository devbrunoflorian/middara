import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ExternalLink, Search, X } from 'lucide-react';
import {
  FAQ_REVIEWED_ON,
  FAQ_SOURCE_URL,
  getCatalogEntries,
  getCatalogSnapshot,
  resolveCatalogContent,
  type AppLocale,
  type CatalogEntry,
  type CatalogType,
} from '../faq/faqContent';

interface FaqDrawerProps {
  language: AppLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function FaqDrawer({ language, open, onOpenChange }: FaqDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeType, setActiveType] = useState<CatalogType>('faq');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
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
    setActiveType(type);
    setCategory('all');
    setSeverity('all');
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
              onChange={event => setQuery(event.target.value)}
              placeholder={isPortuguese ? 'Buscar título ou conteúdo' : 'Search titles and content'}
            />
          </label>
          <label className="faq-category-label">
            <span className="visually-hidden">{isPortuguese ? 'Categoria' : 'Category'}</span>
            <select value={category} onChange={event => setCategory(event.target.value)}>
              <option value="all">{isPortuguese ? 'Todas as categorias' : 'All categories'}</option>
              {categories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {activeType === 'errata' && (
            <label className="faq-severity-label">
              <span className="visually-hidden">{isPortuguese ? 'Severidade' : 'Severity'}</span>
              <select value={severity} onChange={event => setSeverity(event.target.value)}>
                <option value="all">{isPortuguese ? 'Todas as severidades' : 'All severities'}</option>
                {['Critical', 'Major', 'Minor'].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="faq-result-count" aria-live="polite">
          {isPortuguese ? `${filteredEntries.length} entradas` : `${filteredEntries.length} entries`}
        </div>

        <div className="faq-entry-list" aria-live="polite">
          {filteredEntries.length ? filteredEntries.map(entry => {
            const content = resolveCatalogContent(entry, language);
            const label = statusLabel(entry, isPortuguese);
            return (
              <article className="faq-entry" key={entry.id}>
                <div className="faq-entry-heading">
                  <span className="faq-entry-category">{entry.category}</span>
                  {activeType === 'errata' && entry.severity && <span className={`faq-severity ${entry.severity.toLowerCase()}`}>{entry.severity}</span>}
                  {entry.spoiler && <span className="faq-spoiler-badge">{isPortuguese ? 'Spoiler' : 'Spoiler'}</span>}
                </div>
                <h3>{content.title}</h3>
                <p className="faq-entry-source">{sourceDescription(entry, isPortuguese)}{content.isFallback && <span className="faq-language-badge">{isPortuguese ? 'Fallback EN' : 'EN fallback'}</span>}</p>
                {label && <p className={`faq-status-badge ${entry.rulebook12Status === 'VERIFIED_IN_RULEBOOK_1_2' ? 'integrated' : ''}`}>{label}</p>}
                <div className="faq-entry-body"><ReactMarkdown>{content.text || (isPortuguese ? 'Conteúdo não disponível.' : 'No content available.')}</ReactMarkdown></div>
                {!!entry.pageReferences?.length && (
                  <div className="faq-page-references" aria-label={isPortuguese ? 'Referências de página' : 'Page references'}>
                    {entry.pageReferences.map(page => <span key={page}>PG. {page}</span>)}
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
