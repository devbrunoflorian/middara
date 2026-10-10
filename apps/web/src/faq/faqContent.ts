import catalogData from './faqCatalog.json';

export type CatalogType = 'faq' | 'errata';
export type AppLocale = 'en' | 'pt-BR';

export interface CatalogSource {
  type: 'official-website' | 'official-dropbox';
  url?: string;
  snapshotDate?: string;
  document?: string;
  date?: string;
  historicalVersion?: string;
  pdfPage?: number;
}

export interface HistoricalCatalogRecord {
  id: string;
  type: CatalogType;
  category: string;
  titleEn: string;
  bodyEn: string;
  bodyPtBr: string | null;
  bodyFormat?: 'plain' | 'markdown';
  severity: 'Critical' | 'Major' | 'Minor' | null;
  source: CatalogSource;
  pageReferences: number[];
  pageReferenceDetails?: Array<{ page: number; sourceEntryId: string; sourceType?: string; sourceDocument?: string; sourceDate?: string; target: 'rulebook-1.2' | 'other-book-or-component' | 'unverified' }>;
  spoiler: boolean;
  status?: string;
  reconciliationStatus?: string;
  transcription?: string;
  rulebook12Status?: string;
  rulebook12Evidence?: { page?: number; source?: string; note?: string } | null;
  sourceExcerptEn?: string;
}

export interface CatalogEntry {
  id: string;
  type: CatalogType;
  category: string;
  titleEn: string;
  bodyEn: string;
  bodyPtBr: string | null;
  bodyFormat: 'plain' | 'markdown';
  severity: 'Critical' | 'Major' | 'Minor' | null;
  source: CatalogSource;
  pageReferences: number[];
  pageReferenceDetails?: Array<{ page: number; sourceEntryId: string; sourceType?: string; sourceDocument?: string; sourceDate?: string; target: 'rulebook-1.2' | 'other-book-or-component' | 'unverified' }>;
  spoiler: boolean;
  status: 'CURRENT_MATCH' | 'CURRENT_MODIFIED' | 'CURRENT_ONLY' | 'HISTORICAL_ONLY' | 'AMBIGUOUS';
  rulebook12Status?: string;
  rulebook12Evidence?: { page?: number; source?: string; note?: string } | null;
  historicalRecords?: HistoricalCatalogRecord[];
  sourceMetadata?: { sourceTextEn?: string | null; notesEn?: string | null; examplePageUrl?: string | null; componentAffected?: string };
  transcription?: string;
  translation?: { 'pt-BR'?: { status: string; titleText?: string | null; text: string | null; usesCanonicalGlossary: boolean } };
}

interface CatalogSnapshot {
  schemaVersion: number;
  canonicalSource: { url: string; snapshotDate: string; sourceLocale: 'en'; bundleUrl: string };
  historicalSources: Array<{
    file: string;
    date: string;
    version: string;
    type: string;
    textExtraction?: string;
    severityDefinitions?: Record<string, string>;
    official1_2Commitment?: string;
  }>;
  errataSourcePreface?: { titleEn: string; bodyEn: string; source: CatalogSource };
  faqEntries: CatalogEntry[];
  errataEntries: CatalogEntry[];
}

const catalog = catalogData as unknown as CatalogSnapshot;

export const FAQ_SOURCE_URL = catalog.canonicalSource.url;
export const FAQ_REVIEWED_ON = catalog.canonicalSource.snapshotDate;

export interface DisplayContent {
  title: string;
  text: string;
  sourceLocale: 'en' | 'pt-BR';
  isFallback: boolean;
}

/** English remains canonical; PT-BR is used only after an entry is reviewed. */
export function resolveCatalogContent(entry: CatalogEntry, locale: AppLocale): DisplayContent {
  if (locale === 'pt-BR') {
    const translation = entry.translation?.['pt-BR'];
    if (translation?.status === 'reviewed' && translation.text) {
      return { title: translation.titleText ?? entry.titleEn, text: translation.text, sourceLocale: 'pt-BR', isFallback: !translation.titleText };
    }
  }

  return { title: entry.titleEn, text: entry.bodyEn, sourceLocale: 'en', isFallback: locale === 'pt-BR' };
}

export function getCatalogEntries(type: CatalogType): CatalogEntry[] {
  return type === 'faq' ? catalog.faqEntries : catalog.errataEntries;
}

export function getCatalogSnapshot(): CatalogSnapshot {
  return catalog;
}
