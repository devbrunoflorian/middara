import sourceSymbols from './sourceSymbols.json';

export type SymbolLanguage = 'en' | 'pt-BR';
export type SymbolAliasPreferences = Record<string, string>;
export type InlineEditorContext = 'paragraph' | 'typographic-field' | 'span-unit' | 'credit-field';
export interface InlineSymbolMetrics {
  widthEm: number;
  heightEm: number;
  verticalAlignEm: number;
  /** Source-measured whitespace between the owner word and this inline object. */
  gapEm?: number;
  /** Source-measured overlap/spacing after this object before the following text. */
  trailingGapEm?: number;
  /** Source composition style used by the same semantic symbol ID. */
  renderVariant?: string;
}

export interface SemanticSymbolDefinition {
  id: string;
  category: string;
  labels: Record<SymbolLanguage, string>;
  searchTerms: Record<SymbolLanguage, string[]>;
  editorTokens: Record<SymbolLanguage, string>;
  description?: Record<SymbolLanguage, string>;
  allowedBlockTypes?: InlineEditorContext[];
  assetUrl?: string;
  legacy?: { font: string; characters: string[] };
  composition?: {
    type: 'compound';
    labelKey: string;
    sourceFont: string;
    localizedFont: string;
    localizedLabel: Record<SymbolLanguage, string>;
  };
  source: {
    pdf: string;
    page: number;
    bboxPt: [number, number, number, number];
    assetSizePx: [number, number];
  };
  render: {
    widthEm: number;
    heightEm?: number;
    verticalAlignEm: number;
    mask?: 'circle';
    viewBox?: number[];
    paths?: { d: string; transform?: string; fill: string; stroke?: string; strokeWidth?: number; fillRule?: 'evenodd' | 'nonzero'; strokeLinecap?: 'butt'|'round'|'square'; strokeLinejoin?: 'miter'|'round'|'bevel' }[];
    /** Internal labels localize without changing the semantic ID. */
    localized?: Partial<Record<SymbolLanguage, {
      viewBox: number[];
      paths: NonNullable<SemanticSymbolDefinition['render']['paths']>;
      widthEm: number;
      heightEm: number;
      verticalAlignEm: number;
    }>>;
    /** Per-occurrence source appearance variants; semantic identity stays symbolId. */
    variants?: Record<string, {
      assetUrl?: string;
      viewBox?: number[];
      paths?: NonNullable<SemanticSymbolDefinition['render']['paths']>;
      widthEm: number;
      heightEm: number;
      verticalAlignEm: number;
      localized?: Partial<Record<SymbolLanguage, {
        viewBox: number[];
        paths: NonNullable<SemanticSymbolDefinition['render']['paths']>;
        widthEm: number;
        heightEm: number;
        verticalAlignEm: number;
      }>>;
    }>;
  };
}

/**
 * Searchable semantic symbols used by the translation editor. Keep source
 * evidence beside each entry; font names/codepoints are implementation detail
 * and never the insertion value shown to translators.
 */
export const SEMANTIC_SYMBOLS: SemanticSymbolDefinition[] = [
  ...sourceSymbols as unknown as SemanticSymbolDefinition[],
  {
    id: 'token.blue-totem',
    category: 'Tokens e cenário',
    labels: { en: 'Blue Totem', 'pt-BR': 'Totem Azul' },
    searchTerms: {
      en: ['blue totem', 'totem', 'blue token', 'token blue'],
      'pt-BR': ['totem azul', 'totem', 'token azul', 'token azul do cenário'],
    },
    editorTokens: {
      en: '⟦Blue Totem⟧',
      'pt-BR': '⟦Totem Azul⟧',
    },
    assetUrl: '/pages/page_083/fidelity-overlay-component-inline-blue-totem-token.png',
    source: {
      pdf: 'Rulebook 1p2 Final Version 05-19-23 Optimized.pdf',
      page: 83,
      bboxPt: [198.953, 149.792, 219.636, 170.475],
      assetSizePx: [84, 83],
    },
    render: { widthEm: 2, verticalAlignEm: 0.58, mask: 'circle' },
  },
];

/**
 * Stable, language-neutral typing shortcuts. Keep labels and translations out
 * of the stored ID; aliases are only an editor-facing projection. A later
 * Admin alias editor can override these defaults without changing symbols.
 */
const PREFERRED_EDITOR_ALIASES: Record<string, string[]> = {
  'attack.melee': ['sword', 'espada', 'melee'],
  'attack.ranged': ['arrow', 'flecha', 'ranged'],
  'attack.melee-ranged': ['sword-arrow', 'melee-or-ranged'],
  'dice.black': ['black-die', 'dado-preto', 'black'],
  'dice.white': ['white-die', 'dado-branco', 'white'],
  'dice.teal': ['teal-die', 'dado-turquesa', 'teal'],
  'dice.green': ['green-die', 'dado-verde', 'green'],
  'dice.blue': ['blue-die', 'dado-azul', 'blue'],
  'dice.purple': ['purple-die', 'dado-roxo', 'purple'],
  'dice.orange': ['orange-die', 'dado-laranja', 'orange'],
  'dice.red': ['red-die', 'dado-vermelho', 'red'],
  'dice.grey': ['grey-die', 'dado-cinza', 'grey'],
  'combat.skull': ['skull', 'caveira'],
  'combat.damage-star': ['damage-star', 'estrela-de-dano'],
  'combat.shield': ['defense-shield', 'escudo-de-defesa'],
  'weapon.hand': ['hand-requirement', 'requisito-de-mao'],
  'action.redirect': ['redirect', 'redirecionar'],
  'combat.shield.dark': ['dark-shield', 'escudo-escuro'],
  'combat.shield.solid': ['solid-shield', 'escudo-cheio'],
  'combat.page': ['combat-page', 'pagina-de-combate'],
  'terrain.red-border': ['red-terrain-border', 'borda-vermelha-de-terreno'],
  'tag.important.icon': ['lightning', 'raio', 'important-icon'],
  'tag.discard.icon': ['discard-icon', 'icone-descartar'],
  'tag.status.icon': ['status-icon', 'icone-status'],
  'tag.passive.icon': ['passive-icon', 'icone-passivo'],
  'marker.star': ['four-point-star', 'estrela-de-quatro-pontas'],
  'marker.arrow': ['arrow-marker', 'marcador-de-seta'],
  'marker.checkbox': ['checklist-square', 'quadrado-de-checklist'],
  'tag.passive': ['passive', 'passivo'],
  'tag.status': ['status'],
  'tag.exhaust': ['exhaust', 'exaustir'],
  'tag.discard': ['discard', 'descartar'],
  'marker.reference.a': ['reference-a', 'referencia-a'],
  'marker.reference.b': ['reference-b', 'referencia-b'],
  'marker.reference.c': ['reference-c', 'referencia-c'],
  'marker.reference.d': ['reference-d', 'referencia-d'],
  'token.blue-totem': ['blue-totem', 'totem-azul'],
};

export function getSemanticSymbol(id: string | undefined): SemanticSymbolDefinition | undefined {
  return id ? SEMANTIC_SYMBOLS.find(symbol => symbol.id === id) : undefined;
}

export function normalizeSymbolSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function normalizeEditorAlias(value: string): string {
  return normalizeSymbolSearch(value)
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getSymbolEditorAliases(id: string, preferences?: SymbolAliasPreferences): string[] {
  const symbol = getSemanticSymbol(id);
  if (!symbol) return [];
  const candidates = [
    ...(preferences?.[id] ? [preferences[id]] : []),
    ...(PREFERRED_EDITOR_ALIASES[id] ?? []),
    id.replace(/\./g, '-'),
    symbol.labels.en,
    symbol.labels['pt-BR'],
  ];
  return [...new Set(candidates.map(normalizeEditorAlias).filter(Boolean))];
}

export function getPreferredSymbolEditorAlias(id: string, preferences?: SymbolAliasPreferences): string | undefined {
  return getSymbolEditorAliases(id, preferences)[0];
}

const editorAliasIndex = (() => {
  const aliases = new Map<string, SemanticSymbolDefinition | null>();
  for (const symbol of SEMANTIC_SYMBOLS) {
    for (const alias of getSymbolEditorAliases(symbol.id)) {
      const key = normalizeEditorAlias(alias);
      if (!aliases.has(key)) aliases.set(key, symbol);
      else if (aliases.get(key)?.id !== symbol.id) aliases.set(key, null);
    }
  }
  return new Map([...aliases].filter((entry): entry is [string, SemanticSymbolDefinition] => entry[1] !== null));
})();

export function findSymbolByAlias(alias: string, preferences?: SymbolAliasPreferences): SemanticSymbolDefinition | undefined {
  const key = normalizeEditorAlias(alias);
  if (!preferences || Object.keys(preferences).length === 0) return editorAliasIndex.get(key);
  let match: SemanticSymbolDefinition | undefined;
  for (const symbol of SEMANTIC_SYMBOLS) {
    if (!getSymbolEditorAliases(symbol.id, preferences).includes(key)) continue;
    if (match && match.id !== symbol.id) return undefined;
    match = symbol;
  }
  return match;
}

export function getEditorAliasConflicts(preferences?: SymbolAliasPreferences): string[] {
  const seen = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const symbol of SEMANTIC_SYMBOLS) for (const alias of getSymbolEditorAliases(symbol.id, preferences)) {
    const key = normalizeEditorAlias(alias);
    const previous = seen.get(key);
    if (previous && previous !== symbol.id) conflicts.add(key);
    else seen.set(key, symbol.id);
  }
  return [...conflicts].sort();
}

export function getSymbolEditorToken(id: string, language: SymbolLanguage, preferences?: SymbolAliasPreferences): string | undefined {
  void language; // Shortcut tokens stay language-neutral; localized legacy tokens remain readable.
  const alias = getPreferredSymbolEditorAlias(id, preferences);
  return alias ? `[[${alias}]]` : undefined;
}

export function findSymbolByEditorToken(token: string, language: SymbolLanguage, preferences?: SymbolAliasPreferences): SemanticSymbolDefinition | undefined {
  const alias = /^\[\[([^\[\]]+)\]\]$/.exec(token)?.[1];
  if (alias) return findSymbolByAlias(alias, preferences);
  return SEMANTIC_SYMBOLS.find(symbol => symbol.editorTokens[language] === token || Object.values(symbol.editorTokens).includes(token));
}

export function getDefaultSymbolAliasPreferences(): SymbolAliasPreferences {
  return Object.fromEntries(SEMANTIC_SYMBOLS
    .filter(symbol => !!symbol.allowedBlockTypes?.length)
    .map(symbol => [symbol.id, getPreferredSymbolEditorAlias(symbol.id)!]));
}

export function isSymbolAllowed(symbol: SemanticSymbolDefinition, context: InlineEditorContext): boolean {
  return !symbol.allowedBlockTypes || symbol.allowedBlockTypes.includes(context);
}

/** Font/codepoint interpretation belongs here, never in an editor menu. */
export function resolveLegacySymbol(font: string, text: string): SemanticSymbolDefinition | undefined {
  return SEMANTIC_SYMBOLS.find(symbol => symbol.legacy && font.includes(symbol.legacy.font) && symbol.legacy.characters.includes(text.trim()));
}
