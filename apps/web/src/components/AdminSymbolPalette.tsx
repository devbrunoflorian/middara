import { useMemo, useState } from 'react';
import { normalizeSymbolSearch, SEMANTIC_SYMBOLS, type SymbolLanguage } from '../symbols/semanticSymbols';
import './AdminSymbolPalette.css';

interface AdminSymbolPaletteProps {
  language: SymbolLanguage;
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
  language, open, canInsert, canUndo, canRedo, status, onOpenChange, onInsert, onUndo, onRedo,
}: AdminSymbolPaletteProps) {
  const [query, setQuery] = useState('');
  const visibleSymbols = useMemo(() => {
    const normalizedQuery = normalizeSymbolSearch(query);
    if (!normalizedQuery) return SEMANTIC_SYMBOLS;
    return SEMANTIC_SYMBOLS.filter(symbol => [
      symbol.labels[language], symbol.category,
      ...symbol.searchTerms.en, ...symbol.searchTerms['pt-BR'],
    ].some(value => normalizeSymbolSearch(value).includes(normalizedQuery)));
  }, [language, query]);

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
              <small>{language === 'pt-BR' ? 'ID semântico, sem codepoint' : 'Semantic IDs, no codepoints'}</small>
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
          <div className="admin-symbol-palette-list" role="list">
            {visibleSymbols.map(symbol => (
              <button
                type="button"
                role="listitem"
                key={symbol.id}
                className="admin-symbol-palette-item"
                disabled={!canInsert}
                title={symbol.id}
                onMouseDown={event => event.preventDefault()}
                onClick={() => onInsert(symbol.id)}
              >
                <img
                  src={symbol.assetUrl}
                  alt=""
                  aria-hidden="true"
                  style={{
                    width: 34,
                    height: 34,
                    clipPath: symbol.render.mask === 'circle' ? 'circle(50% at 50% 50%)' : undefined,
                    objectFit: 'cover',
                  }}
                />
                <span>
                  <strong>{symbol.labels[language]}</strong>
                  <small>{symbol.category}</small>
                </span>
                <code>{symbol.id}</code>
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
