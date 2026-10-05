import sourceSymbols from './sourceSymbols.json';

export type SymbolLanguage = 'en' | 'pt-BR';
export type InlineEditorContext = 'paragraph' | 'typographic-field' | 'span-unit' | 'credit-field';
export interface InlineSymbolMetrics {
  widthEm: number;
  heightEm: number;
  verticalAlignEm: number;
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

export function getSemanticSymbol(id: string | undefined): SemanticSymbolDefinition | undefined {
  return id ? SEMANTIC_SYMBOLS.find(symbol => symbol.id === id) : undefined;
}

export function normalizeSymbolSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

export function getSymbolEditorToken(id: string, language: SymbolLanguage): string | undefined {
  return getSemanticSymbol(id)?.editorTokens[language];
}

export function findSymbolByEditorToken(token: string, language: SymbolLanguage): SemanticSymbolDefinition | undefined {
  return SEMANTIC_SYMBOLS.find(symbol => symbol.editorTokens[language] === token || Object.values(symbol.editorTokens).includes(token));
}

export function isSymbolAllowed(symbol: SemanticSymbolDefinition, context: InlineEditorContext): boolean {
  return !symbol.allowedBlockTypes || symbol.allowedBlockTypes.includes(context);
}

/** Font/codepoint interpretation belongs here, never in an editor menu. */
export function resolveLegacySymbol(font: string, text: string): SemanticSymbolDefinition | undefined {
  return SEMANTIC_SYMBOLS.find(symbol => symbol.legacy && font.includes(symbol.legacy.font) && symbol.legacy.characters.includes(text.trim()));
}
