import { useMemo, useState } from 'react';
import { getDefaultSymbolAliasPreferences, isSymbolAllowed, normalizeSymbolSearch, SEMANTIC_SYMBOLS, type InlineEditorContext, type SymbolAliasPreferences, type SymbolLanguage } from '../symbols/semanticSymbols';
import { SemanticSymbol } from '../symbols/SemanticSymbol';
import './AdminSymbolPalette.css';

interface AdminSymbolPaletteProps {
  language: SymbolLanguage;
  context: InlineEditorContext | 'admin';
  open: boolean;
  canInsert: boolean;
  canUndo: boolean;
  status: string | null;
  showToggle?: boolean;
  aliasPreferences: SymbolAliasPreferences;
  aliasesLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (symbolId: string) => void;
  onUndo: () => void;
  onSaveAlias: (symbolId: string, alias: string | null) => Promise<{ ok: boolean; message: string }>;
}

export interface AdminSymbolPaletteEditorState {
  context: InlineEditorContext;
  canInsert: boolean;
  canUndo: boolean;
  status: string | null;
  insert: (symbolId: string) => void;
  undo: () => void;
}

function isSymbolAvailableInPalette(symbol: typeof SEMANTIC_SYMBOLS[number], context: InlineEditorContext | 'admin') {
  return context === 'admin' ? !!symbol.allowedBlockTypes?.length : isSymbolAllowed(symbol, context);
}

export function AdminSymbolPalette({
  language, context, open, canInsert, canUndo, status, aliasPreferences, aliasesLoading, showToggle = true, onOpenChange, onInsert, onUndo, onSaveAlias,
}: AdminSymbolPaletteProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [editingAliases, setEditingAliases] = useState(false);
  const [editingSymbolId, setEditingSymbolId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const [aliasStatus, setAliasStatus] = useState<string | null>(null);
  const categories = useMemo(() => Array.from(new Set(SEMANTIC_SYMBOLS
    .filter(symbol => isSymbolAvailableInPalette(symbol, context)).map(symbol => symbol.category))), [context]);
  const normalizedQuery = normalizeSymbolSearch(query);
  const visibleSymbols = useMemo(() => {
    return SEMANTIC_SYMBOLS.filter(symbol => (editingAliases ? !!symbol.allowedBlockTypes?.length : isSymbolAvailableInPalette(symbol, context)) && (!category || symbol.category===category) && (!normalizedQuery || [
      symbol.labels[language], symbol.category,
      ...symbol.searchTerms.en, ...symbol.searchTerms['pt-BR'],
    ].some(value => normalizeSymbolSearch(value).includes(normalizedQuery))));
  }, [language, normalizedQuery, context, category, editingAliases]);

  const startAliasEdit = (symbolId: string) => {
    setEditingSymbolId(symbolId);
    setAliasDraft(aliasPreferences[symbolId] ?? '');
    setAliasStatus(null);
  };

  const saveAlias = async (symbolId: string, alias: string | null) => {
    const result = await onSaveAlias(symbolId, alias);
    setAliasStatus(result.message);
    if (result.ok) setEditingSymbolId(null);
  };

  return (
    <>
      {showToggle && <button
        type="button"
        className="admin-symbol-palette-toggle"
        aria-label={language === 'pt-BR' ? 'Abrir paleta de símbolos' : 'Open symbol palette'}
        aria-expanded={open}
        title={language === 'pt-BR' ? 'Símbolos especiais' : 'Special symbols'}
        onMouseDown={event => event.preventDefault()}
        onClick={() => onOpenChange(!open)}
      >
        ◈
      </button>}
      {open && (
        <aside id="admin-symbol-palette" className="admin-symbol-palette arcane-glass-surface" aria-label={language === 'pt-BR' ? 'Paleta de símbolos' : 'Symbol palette'}>
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
            {visibleSymbols.map(symbol => editingAliases ? (
              <div key={symbol.id} className="admin-symbol-alias-item" role="listitem">
                <span className="admin-symbol-palette-preview" aria-hidden="true">
                  <SemanticSymbol id={symbol.id} language={language} size={20} color="#231f20" preview />
                </span>
                <span className="admin-symbol-alias-main">
                  <strong>{symbol.labels[language]}</strong>
                  {editingSymbolId === symbol.id ? (
                    <span className="admin-symbol-alias-editor">
                      <span>[[</span>
                      <input
                        aria-label={language === 'pt-BR' ? `Atalho de ${symbol.labels[language]}` : `${symbol.labels[language]} shortcut`}
                        value={aliasDraft}
                        onChange={event => setAliasDraft(event.currentTarget.value)}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void saveAlias(symbol.id, aliasDraft); } }}
                        autoFocus
                      />
                      <span>]]</span>
                      <button type="button" title={language === 'pt-BR' ? 'Salvar atalho' : 'Save shortcut'} onClick={() => void saveAlias(symbol.id, aliasDraft)}>✓</button>
                      <button type="button" title={language === 'pt-BR' ? 'Cancelar' : 'Cancel'} onClick={() => setEditingSymbolId(null)}>×</button>
                    </span>
                  ) : (
                    <code>[[{aliasPreferences[symbol.id]}]]</code>
                  )}
                </span>
                {editingSymbolId !== symbol.id && (
                  <button
                    type="button"
                    className="admin-symbol-alias-edit"
                    aria-label={language === 'pt-BR' ? `Editar atalho de ${symbol.labels[language]}` : `Edit ${symbol.labels[language]} shortcut`}
                    title={language === 'pt-BR' ? 'Editar atalho' : 'Edit shortcut'}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => startAliasEdit(symbol.id)}
                  >✎</button>
                )}
                {aliasPreferences[symbol.id] !== getDefaultSymbolAliasPreferences()[symbol.id] && editingSymbolId !== symbol.id && (
                  <button type="button" className="admin-symbol-alias-reset" onClick={() => void saveAlias(symbol.id, null)}
                    title={language === 'pt-BR' ? 'Restaurar padrão' : 'Restore default'}>↺</button>
                )}
              </div>
            ) : (
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
            <button type="button" aria-pressed={editingAliases} disabled={aliasesLoading}
              onMouseDown={event => event.preventDefault()}
              onClick={() => { setEditingAliases(value => !value); setEditingSymbolId(null); setAliasStatus(null); }}>
              ✎ {editingAliases ? (language === 'pt-BR' ? 'Concluído' : 'Done') : (language === 'pt-BR' ? 'Editar atalhos' : 'Edit shortcuts')}
            </button>
          </div>
          <p className="admin-symbol-palette-status" role="status" aria-live="polite">
            {aliasStatus || (editingAliases
              ? aliasesLoading
                ? (language === 'pt-BR' ? 'Carregando preferências do Payload…' : 'Loading preferences from Payload…')
                : (language === 'pt-BR' ? 'Cada símbolo mostra seu atalho atual. Use o lápis para editar; as alterações são verificadas no banco.' : 'Each symbol shows its current shortcut. Use the pencil to edit; changes are verified in the database.')
              : status || (canInsert
              ? (language === 'pt-BR' ? 'O símbolo entra no cursor ou substitui a seleção.' : 'Insert at the cursor or replace the selection.')
              : (language === 'pt-BR' ? 'Abra Editar Texto ou selecione caracteres antes de inserir.' : 'Open Edit Text or select characters before inserting.')))}
          </p>
        </aside>
      )}
    </>
  );
}
