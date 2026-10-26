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
import { payloadApiUrl } from '../config/payloadApi';

type FaqSection = CatalogType | 'editorial';

interface EditorialFaqEntry {
  id: string | number;
  faqId: string;
  question: string;
  answer: string;
  englishQuestion?: string | null;
  englishAnswer?: string | null;
  category: string;
  sourcePages: Array<number | { page: number }>;
  keywords?: Array<string | { value: string }>;
  synonyms?: Array<string | { value: string }>;
  ruleScope: 'base' | 'optional_variant';
  spoilerLevel: 'none' | 'spoiler';
}

const faqSynonymGroups = [
  ['break attack', 'ataque de oportunidade'],
  ['skill check', 'teste de pericia'],
  ['follow up', 'fu'],
  ['counter', 'contra ataque'],
  ['soi', 'esfera de influencia'],
];

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function expandedQueries(query: string): string[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  const terms = new Set([normalized]);
  for (const group of faqSynonymGroups) {
    if (group.some(alias => alias.includes(normalized) || normalized.includes(alias))) group.forEach(alias => terms.add(alias));
  }
  return [...terms];
}

function editorialPages(entry: EditorialFaqEntry): number[] {
  return [...new Set(entry.sourcePages.map(value => typeof value === 'number' ? value : value.page))]
    .filter(page => Number.isInteger(page) && page >= 1 && page <= 102)
    .sort((a, b) => a - b);
}

function textArray(values: EditorialFaqEntry['keywords']): string[] {
  return (values ?? []).map(value => typeof value === 'string' ? value : value.value);
}

const englishCategories: Record<string, string> = {
  'Modos de jogo e campanha': 'Game modes and campaign',
  'Preparação, Encontros e Urgência': 'Setup, Encounters, and Urgency',
  'Turnos, SP e Habilidades': 'Turns, SP, and Abilities',
  'Movimento, Terrenos e Elevação': 'Movement, Terrain, and Elevation',
  'Ataques, Esquiva, Contra-ataque e flanqueamento': 'Attacks, Dodge, Counter, and Flanking',
  'Alcance, Linha de Visão, Feitiços e Follow Up': 'Range, Line of Sight, Spells, and Follow Up',
  'Equipamentos, Itens, Disciplinas e Aprimoramentos': 'Equipment, Items, Disciplines, and Upgrades',
  'Saques, Ouro e recompensas': 'Loot, Gold, and Rewards',
  'Combatentes Inteligentes, grupos e IA': 'Intelligent Combatants, Groups, and AI',
  'Espers, Familiares e Conduítes': 'Espers, Familiars, and Conduits',
  'Efeitos, limites e regras gerais': 'Effects, Limits, and General Rules',
  'Regras especiais e variantes opcionais': 'Special Rules and Optional Variants',
};

function categoryLabel(category: string, language: AppLocale): string {
  return language === 'en' ? englishCategories[category] ?? category : category;
}

function searchableEditorialText(entry: EditorialFaqEntry, language: AppLocale): string {
  const question = language === 'en' ? entry.englishQuestion ?? '' : entry.question;
  const answer = language === 'en' ? entry.englishAnswer ?? '' : entry.answer;
  return normalizeSearch([
    entry.faqId,
    question,
    answer,
    categoryLabel(entry.category, language),
    entry.ruleScope,
    ...textArray(entry.keywords),
    ...textArray(entry.synonyms),
    ...editorialPages(entry).map(page => `página ${page} ${page}`),
  ].join(' '));
}

function editorialMatchScore(entry: EditorialFaqEntry, query: string, language: AppLocale): number {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return 0;
  const question = normalizeSearch(language === 'en' ? entry.englishQuestion ?? '' : entry.question);
  const allText = searchableEditorialText(entry, language);
  const terms = expandedQueries(query);
  const directMatch = allText.includes(normalizedQuery);
  const expandedMatch = terms.some(term => allText.includes(term));
  if (!directMatch && !expandedMatch) return -1;
  return (question.includes(normalizedQuery) ? 100 : 0)
    + (normalizeSearch(entry.faqId) === normalizedQuery ? 120 : 0)
    + (textArray(entry.keywords).some(value => normalizeSearch(value).includes(normalizedQuery)) ? 35 : 0)
    + (normalizeSearch(entry.category).includes(normalizedQuery) ? 20 : 0)
    + (directMatch ? 10 : 0);
}

interface FaqDrawerProps {
  language: AppLocale;
  currentPage: number;
  open: boolean;
  activeType?: FaqSection;
  onActiveTypeChange?: (type: FaqSection) => void;
  onOpenChange: (open: boolean) => void;
  onNavigateToPage: (page: number) => boolean;
}

function allSearchableText(entry: CatalogEntry, title: string, body: string): string {
  const history = entry.historicalRecords?.map(record => `${record.titleEn} ${record.bodyEn} ${record.source.document ?? ''}`).join(' ') ?? '';
  const metadata = Object.values(entry.sourceMetadata ?? {}).filter(Boolean).join(' ');
  return normalizeSearch(`${title} ${entry.titleEn} ${entry.category} ${entry.severity ?? ''} ${entry.status} ${body} ${history} ${metadata} ${(entry.pageReferences ?? []).join(' ')}`);
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

export function FaqDrawer({ language, currentPage, open, activeType: requestedActiveType, onActiveTypeChange, onOpenChange, onNavigateToPage }: FaqDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const entryListRef = useRef<HTMLDivElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const [uncontrolledActiveType, setUncontrolledActiveType] = useState<FaqSection>('editorial');
  const activeType = requestedActiveType ?? uncontrolledActiveType;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [ruleScope, setRuleScope] = useState('all');
  const [openEntryIds, setOpenEntryIds] = useState<Set<string>>(() => new Set());
  const [editorialEntries, setEditorialEntries] = useState<EditorialFaqEntry[]>([]);
  const [editorialLoadState, setEditorialLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [editorialLoadAttempt, setEditorialLoadAttempt] = useState(0);
  const editorialLoadedRef = useRef(false);
  const isPortuguese = language === 'pt-BR';
  const entries = activeType === 'editorial' ? [] : getCatalogEntries(activeType);
  const snapshot = getCatalogSnapshot();
  const currentErrataPreface = snapshot.errataSourcePreface;
  const historicalErrataSource = snapshot.historicalSources.find(source => source.file === 'Errata 4-12-21.pdf');
  const hasUntranslatedEntries = entries.some(entry => resolveCatalogContent(entry, 'pt-BR').isFallback);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.show();
      searchRef.current?.focus({ preventScroll: true });
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    setCategory('all');
    setSeverity('all');
    setRuleScope('all');
    setOpenEntryIds(new Set());
  }, [activeType]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || activeType !== 'editorial' || editorialLoadedRef.current) return;
    const controller = new AbortController();
    let disposed = false;
    const timeoutId = window.setTimeout(() => controller.abort(), 8_000);
    setEditorialLoadState('loading');
    fetch(payloadApiUrl('editorial-faqs?draft=true&limit=200&sort=faqId'), {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json() as { docs?: EditorialFaqEntry[] };
      if (disposed) return;
      setEditorialEntries(Array.isArray(result.docs) ? result.docs : []);
      editorialLoadedRef.current = true;
      setEditorialLoadState('ready');
    }).catch(error => {
      if (disposed) return;
      console.error('Could not load published editorial FAQs', error);
      setEditorialLoadState('error');
    }).finally(() => {
      window.clearTimeout(timeoutId);
    });
    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [activeType, editorialLoadAttempt, open]);

  const categories = useMemo(() => [...new Set(activeType === 'editorial'
    ? editorialEntries.map(entry => entry.category)
    : entries.map(entry => entry.category))].sort((a, b) => a.localeCompare(b)), [activeType, editorialEntries, entries]);
  const filteredEntries = useMemo(() => {
    const normalizedQuery = normalizeSearch(debouncedQuery);
    return (activeType === 'editorial' ? [] : entries).filter(entry => {
      const display = resolveCatalogContent(entry, language);
      const matchesCategory = category === 'all' || entry.category === category;
      const matchesSeverity = activeType === 'faq' || severity === 'all' || entry.severity === severity;
      const queryMatch = !normalizedQuery || expandedQueries(normalizedQuery).some(term => allSearchableText(entry, display.title, display.text).includes(term));
      return matchesCategory && matchesSeverity && queryMatch;
    }).sort((a, b) => {
      const aCurrent = getConfirmedRulebookPageReferences(a).includes(currentPage) ? 1 : 0;
      const bCurrent = getConfirmedRulebookPageReferences(b).includes(currentPage) ? 1 : 0;
      return bCurrent - aCurrent;
    });
  }, [activeType, category, currentPage, debouncedQuery, entries, language, severity]);

  const filteredEditorialEntries = useMemo(() => editorialEntries
    .filter(entry => (language !== 'en' || Boolean(entry.englishQuestion?.trim() && entry.englishAnswer?.trim()))
      && (category === 'all' || entry.category === category)
      && (ruleScope === 'all' || entry.ruleScope === ruleScope)
      && editorialMatchScore(entry, debouncedQuery, language) >= 0)
    .sort((a, b) => {
      const score = editorialMatchScore(b, debouncedQuery, language) - editorialMatchScore(a, debouncedQuery, language);
      if (score !== 0) return score;
      const aCurrent = editorialPages(a).includes(currentPage) ? 1 : 0;
      const bCurrent = editorialPages(b).includes(currentPage) ? 1 : 0;
      return bCurrent - aCurrent || a.faqId.localeCompare(b.faqId);
    }), [category, currentPage, debouncedQuery, editorialEntries, language, ruleScope]);
  const currentPageFaqs = filteredEditorialEntries.filter(entry => editorialPages(entry).includes(currentPage));
  const otherEditorialFaqs = filteredEditorialEntries.filter(entry => !editorialPages(entry).includes(currentPage));

  const handleTabChange = (type: FaqSection) => {
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

  const renderEditorialEntry = (entry: EditorialFaqEntry) => {
    const pages = editorialPages(entry);
    const isExpanded = openEntryIds.has(entry.faqId);
    const hasBountyAndReward = textArray(entry.keywords).includes('Bounty') && textArray(entry.keywords).includes('Reward');
    const question = language === 'en' ? entry.englishQuestion ?? '' : entry.question;
    const answer = language === 'en' ? entry.englishAnswer ?? '' : entry.answer;
    const triggerId = `faq-entry-trigger-${entry.faqId}`;
    const panelId = `faq-entry-panel-${entry.faqId}`;
    return (
      <article className={`faq-entry editorial-faq-entry${isExpanded ? ' is-open' : ''}`} key={entry.faqId}>
        <h4 className="faq-entry-heading">
          <button
            aria-expanded={isExpanded}
            aria-controls={panelId}
            className="faq-entry-trigger"
            id={triggerId}
            type="button"
            onClick={() => toggleEntry(entry.faqId)}
          >
            <span className="faq-entry-category">{categoryLabel(entry.category, language)}</span>
            <span className="faq-entry-title">{question}</span>
            <ChevronDown className="faq-entry-chevron" size={16} aria-hidden="true" />
          </button>
        </h4>
        <div aria-labelledby={triggerId} className="faq-entry-content" hidden={!isExpanded} id={panelId} role="region">
          {isExpanded && (
            <>
              <div className="faq-editorial-meta">
                <span className="faq-entry-id">{entry.faqId}</span>
                <span className="faq-rule-scope">{language === 'en'
                  ? entry.ruleScope === 'optional_variant' ? 'Optional variant' : 'Standard rule'
                  : entry.ruleScope === 'optional_variant' ? 'Variante opcional' : 'Regra padrão'}</span>
                <span className="faq-editorial-label">{language === 'en' ? 'Editorial FAQ · unofficial' : 'FAQ editorial · não oficial'}</span>
              </div>
              {hasBountyAndReward && <p className="faq-concept-note">{language === 'en'
                ? <><strong>Bounty</strong> and <strong>Reward</strong> occur at different points in play. PT-BR may use “Recompensa(s)” or “prêmio” for both; keep <strong>Great Bounty</strong> as a proper name.</>
                : <><strong>Bounty</strong> e <strong>Reward</strong> aparecem em momentos diferentes da partida. Ambos podem ser “Recompensa(s)” ou “prêmio”; em Aventura, escreva “Recompensas” com inicial maiúscula. “Caçada” depende do contexto, e <strong>Great Bounty</strong> permanece nome próprio.</>}
              </p>}
              <div className="faq-entry-body"><ReactMarkdown>{answer}</ReactMarkdown></div>
              {pages.length > 0 && (
                <div className="faq-page-references" aria-label={language === 'en' ? 'Rulebook 1.2 references' : 'Referências no Rulebook 1.2'}>
                  {pages.map((page, index) => (
                    <button
                      className={`faq-page-reference-link${index === 0 ? ' primary' : ' secondary'}`}
                      key={`${entry.faqId}-${page}`}
                      type="button"
                      onClick={() => {
                        const navigated = onNavigateToPage(page);
                        if (navigated && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 700px)').matches) {
                          dialogRef.current?.close();
                        }
                      }}
                    >
                      {index === 0 ? (language === 'en' ? `Open in book · p. ${page}` : `Ver no livro · p. ${page}`) : `p. ${page}`}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </article>
    );
  };

  const noResults = isPortuguese ? 'Nenhuma entrada corresponde aos filtros.' : 'No entries match these filters.';

  return (
    <dialog
      ref={dialogRef}
      className="faq-dialog"
      aria-labelledby="faq-dialog-title"
      aria-modal="false"
      onClose={() => {
        onOpenChange(false);
        focusReturnRef.current?.focus({ preventScroll: true });
      }}
      onKeyDown={event => {
        const isMobileSheet = typeof window.matchMedia === 'function'
          && window.matchMedia('(max-width: 700px), (hover: none) and (pointer: coarse)').matches;
        if (event.key === 'Tab' && isMobileSheet && dialogRef.current) {
          const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
          )).filter(element => !element.closest('[hidden]'));
          const first = focusable[0];
          const last = focusable.at(-1);
          if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setOpenEntryIds(current => {
            const next = new Set(current);
            const last = [...next].at(-1);
            if (last) next.delete(last);
            else dialogRef.current?.close();
            return next;
          });
        }
      }}
      onClick={event => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <section className="faq-panel arcane-glass-surface">
        <header className="faq-panel-header">
          <div>
            <p className="faq-eyebrow">MIDDARA · {activeType === 'editorial' ? (isPortuguese ? 'CONSULTA EDITORIAL · NÃO OFICIAL' : 'EDITORIAL REFERENCE · UNOFFICIAL') : (isPortuguese ? 'FONTES OFICIAIS' : 'OFFICIAL SOURCES')}</p>
            <h2 id="faq-dialog-title">{activeType === 'editorial' ? (isPortuguese ? 'FAQ / Dúvidas' : 'FAQ / Questions') : (isPortuguese ? 'FAQ e Errata oficiais' : 'Official FAQ and Errata')}</h2>
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
          <button type="button" role="tab" aria-selected={activeType === 'editorial'} className={activeType === 'editorial' ? 'active' : ''} onClick={() => handleTabChange('editorial')}>
            {isPortuguese ? 'FAQ editorial' : 'Editorial FAQ'} <span>{editorialLoadState === 'ready' ? editorialEntries.length : '·'}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeType === 'faq'} className={activeType === 'faq' ? 'active' : ''} onClick={() => handleTabChange('faq')}>
            {isPortuguese ? 'FAQ oficial' : 'Official FAQ'} <span>{getCatalogEntries('faq').length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeType === 'errata'} className={activeType === 'errata' ? 'active' : ''} onClick={() => handleTabChange('errata')}>
            {isPortuguese ? 'Errata oficial' : 'Official Errata'} <span>{getCatalogEntries('errata').length}</span>
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
            <span className="visually-hidden">{isPortuguese ? 'Buscar no FAQ ou errata' : 'Search FAQ or errata'}</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setOpenEntryIds(new Set());
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' && activeType === 'editorial' && filteredEditorialEntries[0]) {
                  event.preventDefault();
                  setOpenEntryIds(current => new Set([...current, filteredEditorialEntries[0].faqId]));
                }
              }}
              placeholder={isPortuguese ? 'Buscar regra, palavra ou termo...' : 'Search a rule, word, or term...'}
            />
          </label>
          <label className="faq-category-label">
            <span className="visually-hidden">{isPortuguese ? 'Categoria' : 'Category'}</span>
            <select value={category} onChange={event => {
              setCategory(event.target.value);
              setOpenEntryIds(new Set());
            }}>
              <option value="all">{isPortuguese ? 'Todas as categorias' : 'All categories'}</option>
              {categories.map(value => <option key={value} value={value}>{categoryLabel(value, language)}</option>)}
            </select>
          </label>
          {activeType === 'editorial' && (
            <label className="faq-category-label">
                <span className="visually-hidden">{isPortuguese ? 'Escopo da regra' : 'Rule scope'}</span>
              <select value={ruleScope} onChange={event => setRuleScope(event.target.value)}>
                <option value="all">{isPortuguese ? 'Padrão e variantes' : 'Standard and variants'}</option>
                <option value="base">{isPortuguese ? 'Regras padrão' : 'Standard rules'}</option>
                <option value="optional_variant">{isPortuguese ? 'Variantes opcionais' : 'Optional variants'}</option>
              </select>
            </label>
          )}
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

        {(activeType !== 'editorial' || editorialLoadState === 'ready') && (
          <div className="faq-result-count" aria-live="polite">
          {activeType === 'editorial'
              ? language === 'en' ? `${filteredEditorialEntries.length} editorial FAQs` : `${filteredEditorialEntries.length} perguntas do FAQ editorial`
              : isPortuguese ? `${filteredEntries.length} entradas` : `${filteredEntries.length} entries`}
          </div>
        )}

        <div className="faq-entry-list" ref={entryListRef}>
          {activeType === 'editorial' ? editorialLoadState === 'loading' ? (
            <p className="faq-load-state" role="status">{isPortuguese ? 'Carregando FAQs...' : 'Loading FAQs...'}</p>
          ) : editorialLoadState === 'error' ? (
            <div className="faq-load-error" role="alert">
              <p>{isPortuguese ? 'Não foi possível carregar o FAQ editorial agora.' : 'Could not load the editorial FAQ right now.'}</p>
              <button type="button" onClick={() => { editorialLoadedRef.current = false; setEditorialLoadState('idle'); setEditorialLoadAttempt(value => value + 1); }}>{isPortuguese ? 'Tentar novamente' : 'Try again'}</button>
            </div>
          ) : editorialLoadState === 'ready' && filteredEditorialEntries.length ? (
            <>
              <section className="faq-current-page" aria-label={isPortuguese ? `Perguntas editoriais da página ${currentPage}` : `Editorial FAQs for page ${currentPage}`}>
                <header><h3>{isPortuguese ? `Nesta página · p. ${currentPage}` : `On this page · p. ${currentPage}`}</h3><span>{currentPageFaqs.length}</span></header>
                {currentPageFaqs.length ? currentPageFaqs.map(renderEditorialEntry) : <p className="faq-page-empty">{isPortuguese ? 'Nenhuma pergunta para esta página.' : 'No FAQ for this page.'}</p>}
              </section>
              <section className="faq-global-results" aria-label={debouncedQuery ? (isPortuguese ? 'Resultados globais da busca' : 'Global search results') : (isPortuguese ? 'Todas as perguntas' : 'All questions')}>
                <h3>{debouncedQuery ? (isPortuguese ? 'Resultados globais' : 'Global results') : (isPortuguese ? 'Outras perguntas' : 'More questions')}</h3>
                {otherEditorialFaqs.length ? otherEditorialFaqs.map(renderEditorialEntry) : !currentPageFaqs.length ? <p className="faq-empty">{isPortuguese ? 'Nenhuma pergunta corresponde. Tente “Break Attack”, “Teste de Perícia” ou um tema.' : 'No question matches. Try “Break Attack”, “Skill Check”, or a topic.'}</p> : null}
              </section>
            </>
          ) : editorialLoadState === 'ready' ? (
            <p className="faq-empty">{language === 'en'
              ? editorialEntries.length ? 'The editorial FAQ has no English version yet. Portuguese content is not shown with the English Rulebook.' : 'No editorial FAQ matches. Try “Break Attack”, “Skill Check”, or choose another category.'
              : 'Nenhuma pergunta do FAQ editorial corresponde. Tente “Break Attack”, “Teste de Perícia” ou escolha outra categoria.'}</p>
          ) : null : filteredEntries.length ? filteredEntries.map(entry => {
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
          {activeType === 'editorial' ? <span>{isPortuguese ? 'FAQ editorial de consulta · o Rulebook 1.2 é a fonte primária.' : 'Editorial reference FAQ · Rulebook 1.2 remains the primary source.'}</span> : <>
            <span>{isPortuguese ? `Snapshot ${FAQ_REVIEWED_ON} · EN é a fonte canônica` : `Snapshot ${FAQ_REVIEWED_ON} · English is canonical`}</span>
            <a href={FAQ_SOURCE_URL} target="_blank" rel="noreferrer">
              {isPortuguese ? 'Fonte oficial atual' : 'Current official source'} <ExternalLink size={14} aria-hidden="true" />
            </a>
          </>}
        </footer>
      </section>
    </dialog>
  );
}
