import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Search, X } from 'lucide-react';
import { FAQ_REVIEWED_ON, FAQ_SOURCE_URL, resolveFaqContent } from '../faq/faqContent';

interface FaqDrawerProps {
  language: 'en' | 'pt-BR';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FaqDrawer({ language, open, onOpenChange }: FaqDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const content = resolveFaqContent(language);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.show();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const categories = useMemo(() => [...new Set(content.entries.map(entry => entry.category))], [content.entries]);
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return content.entries.filter(entry => {
      const matchesCategory = category === 'all' || entry.category === category;
      const searchable = `${entry.category} ${entry.question} ${entry.answer}`.toLocaleLowerCase();
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [category, content.entries, query]);

  const isPortuguese = language === 'pt-BR';

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
            <p className="faq-eyebrow">MIDDARA · {isPortuguese ? 'FAQ OFICIAL' : 'OFFICIAL FAQ'}</p>
            <h2 id="faq-dialog-title">{isPortuguese ? 'Perguntas frequentes' : 'Frequently asked questions'}</h2>
          </div>
          <button
            className="faq-close"
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={isPortuguese ? 'Fechar FAQ' : 'Close FAQ'}
          >
            <X size={18} />
          </button>
        </header>

        {content.isFallback ? (
          <p className="faq-locale-notice" role="status">
            Versão PT-BR oficial não encontrada. Exibindo resumos em inglês, sem tradução automática.
          </p>
        ) : (
          <p className="faq-source-note">English source · locally stored summaries</p>
        )}

        <div className="faq-filters">
          <label className="faq-search">
            <Search size={15} aria-hidden="true" />
            <span className="visually-hidden">{isPortuguese ? 'Buscar na FAQ' : 'Search the FAQ'}</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={isPortuguese ? 'Buscar pergunta ou resposta' : 'Search questions and answers'}
            />
          </label>
          <label className="faq-category-label">
            <span className="visually-hidden">{isPortuguese ? 'Categoria' : 'Category'}</span>
            <select value={category} onChange={event => setCategory(event.target.value)}>
              <option value="all">{isPortuguese ? 'Todas as categorias' : 'All categories'}</option>
              {categories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="faq-entry-list" aria-live="polite">
          {filteredEntries.length ? filteredEntries.map(entry => (
            <details className="faq-entry" key={entry.id}>
              <summary>
                <span className="faq-entry-category">{entry.category}</span>
                <span>{entry.question}</span>
              </summary>
              <p>{entry.answer}</p>
            </details>
          )) : (
            <p className="faq-empty">{isPortuguese ? 'Nenhuma pergunta corresponde à busca.' : 'No questions match this search.'}</p>
          )}
        </div>

        <footer className="faq-panel-footer">
          <span>{isPortuguese ? `Conteúdo revisado em ${FAQ_REVIEWED_ON}` : `Content reviewed ${FAQ_REVIEWED_ON}`}</span>
          <a href={FAQ_SOURCE_URL} target="_blank" rel="noreferrer">
            {isPortuguese ? 'FAQ completa no site oficial' : 'Full FAQ on the official site'}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </footer>
      </section>
    </dialog>
  );
}
