import { useMemo, useState } from 'react';
import { isSymbolAllowed, normalizeSymbolSearch, SEMANTIC_SYMBOLS, type InlineEditorContext, type SymbolLanguage } from '../symbols/semanticSymbols';
import { SemanticSymbol } from '../symbols/SemanticSymbol';
import './AdminSymbolPalette.css';

interface AdminSymbolPaletteProps {
  language: SymbolLanguage;
  context: InlineEditorContext;
  open: boolean;
  canInsert: boolean;
  canUndo: boolean;
  canRedo: boolean;
  status: string | null;
  onOpenChange: (open: boolean) => void;
  onInsert: (symbolId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function AdminSymbolPalette({
  language, context, open, canInsert, canUndo, canRedo, status, onOpenChange, onInsert, onUndo, onRedo,
}: AdminSymbolPaletteProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const categories = useMemo(() => Array.from(new Set(SEMANTIC_SYMBOLS.filter(s=>isSymbolAllowed(s,context)).map(s=>s.category))), [context]);
  const visibleSymbols = useMemo(() => {
    const normalizedQuery = normalizeSymbolSearch(query);
    return SEMANTIC_SYMBOLS.filter(symbol => isSymbolAllowed(symbol,context) && (!category || symbol.category===category) && (!normalizedQuery || [
      symbol.labels[language], symbol.category,
      ...symbol.searchTerms.en, ...symbol.searchTerms['pt-BR'],
    ].some(value => normalizeSymbolSearch(value).includes(normalizedQuery))));
  }, [language, query, context, category]);

  return (
    <>
      <button
        type="button"
        className="admin-symbol-palette-toggle"
        aria-label={language === 'pt-BR' ? 'Abrir paleta de símbolos' : 'Open symbol palette'}
        aria-expanded={open}
        title={language === 'pt-BR' ? 'Símbolos especiais' : 'Special symbols'}
        onMouseDown={event => event.preventDefault()}
        onClick={() => onOpenChange(!open)}
      >
        ◈
      </button>
      {open && (
        <aside className="admin-symbol-palette" aria-label={language === 'pt-BR' ? 'Paleta de símbolos' : 'Symbol palette'}>
          <header className="admin-symbol-palette-header">
            <div>
              <strong>{language === 'pt-BR' ? 'Símbolos do livro' : 'Rulebook symbols'}</strong>
              <small>{language === 'pt-BR' ? 'Inserir no texto' : 'Insert into text'}</small>
            </div>
            <button
              type="button"
              aria-label={language === 'pt-BR' ? 'Fechar paleta' : 'Close palette'}
              onMouseDown={event => event.preventDefault()}
              onClick={() => onOpenChange(false)}
            >×</button>
          </header>
          <label className="admin-symbol-palette-search">
            <span>{language === 'pt-BR' ? 'Buscar' : 'Search'}</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.currentTarget.value)}
              placeholder={language === 'pt-BR' ? 'Totem azul, dado…' : 'Blue Totem, die…'}
            />
          </label>
          <label className="admin-symbol-palette-search">
            <span>{language === 'pt-BR' ? 'Categoria' : 'Category'}</span>
            <select value={category} onChange={e=>setCategory(e.currentTarget.value)}>
              <option value="">{language === 'pt-BR' ? 'Todas' : 'All'}</option>
              {categories.map(value=><option key={value}>{value}</option>)}
            </select>
          </label>
          <div className="admin-symbol-palette-list" role="list">
            {visibleSymbols.map(symbol => (
              <button
                type="button"
                role="listitem"
                key={symbol.id}
                className="admin-symbol-palette-item"
                disabled={!canInsert}
                title={symbol.description?.[language] ?? symbol.labels[language]}
                onMouseDown={event => event.preventDefault()}
                onClick={() => onInsert(symbol.id)}
              >
                <span className="admin-symbol-palette-preview" aria-hidden="true">
                  <SemanticSymbol id={symbol.id} language={language} size={20} color="#231f20" preview />
                </span>
                <span>
                  <strong>{symbol.labels[language]}</strong>
                  <small>{symbol.category}</small>
                </span>
              </button>
            ))}
            {visibleSymbols.length === 0 && (
              <p className="admin-symbol-palette-empty">{language === 'pt-BR' ? 'Nenhum símbolo encontrado.' : 'No symbols found.'}</p>
            )}
          </div>
          <div className="admin-symbol-palette-history">
            <button type="button" disabled={!canUndo} onMouseDown={event => event.preventDefault()} onClick={onUndo}>
              {language === 'pt-BR' ? 'Desfazer' : 'Undo'}
            </button>
            <button type="button" disabled={!canRedo} onMouseDown={event => event.preventDefault()} onClick={onRedo}>
              {language === 'pt-BR' ? 'Refazer' : 'Redo'}
            </button>
          </div>
          <p className="admin-symbol-palette-status" role="status" aria-live="polite">
            {status || (canInsert
              ? (language === 'pt-BR' ? 'O símbolo entra no cursor ou substitui a seleção.' : 'Insert at the cursor or replace the selection.')
              : (language === 'pt-BR' ? 'Abra Editar Texto ou selecione caracteres antes de inserir.' : 'Open Edit Text or select characters before inserting.'))}
          </p>
        </aside>
      )}
    </>
  );
}
