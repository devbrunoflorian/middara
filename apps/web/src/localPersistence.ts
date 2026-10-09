import type { SpanOverride } from './components/RichSpanEditor';
import type { LayoutFrame } from './components/PageRenderer';
import { decodeOverrideData, encodeOverrideData } from './symbols/overrideData';
import { payloadApiUrl } from './config/payloadApi';

export const LOCAL_PERSISTENCE_CHANGED_EVENT = 'middara:local-persistence-changed';
const TRANSLATION_STORAGE_PREFIX = 'middara-lines-v2-';
const FRAME_STORAGE_PATTERN = /^middara-layout-frames-v1-(en|pt-BR)-page-(\d+)$/u;
const LOCALES = ['en', 'pt-BR'] as const;
const PAGE_LIMIT = 500;

type Locale = typeof LOCALES[number];
type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem'>;
type WritableStorageLike = StorageLike & Pick<Storage, 'setItem'>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type LocalSyncState = 'confirmed' | 'missing_remote' | 'diverged' | 'unverified' | 'sync_error';
export type LocalRecordKind = 'translation' | 'frame';

export interface LocalPersistenceEntry {
  id: string;
  kind: LocalRecordKind;
  language: Locale;
  pageNumber?: number;
  spanKey?: string;
  unitKey?: string;
  blockIndex?: number;
  editorialUnitId?: string;
  syncState: LocalSyncState;
  payloadUpdatedAt?: string | null;
  data: unknown;
}

export interface LocalPersistenceReport {
  checkedAt: string;
  payloadAvailable: boolean;
  error?: string;
  localRecordCount: number;
  unsyncedCount: number | null;
  entries: LocalPersistenceEntry[];
}

export interface LocalPersistenceEventDetail {
  kind?: LocalRecordKind;
  language?: Locale;
  spanKey?: string;
  unitKey?: string;
  pageNumber?: number;
  data?: unknown;
  confirmed?: boolean;
  deleted?: boolean;
}

interface LocalTranslation {
  language: Locale;
  spanKey: string;
  data: unknown;
}

interface LocalFrame {
  language: Locale;
  pageNumber: number;
  unitKey: string;
  data: LayoutFrame;
}

interface PayloadDocument {
  id?: string | number;
  spanKey?: string;
  language?: string;
  data?: unknown;
  frameKey?: string;
  unitKey?: string;
  pageNumber?: number;
  updatedAt?: string;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortObjectKeys(child)]));
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function clientSpanKey(spanKey: string, language: string): string {
  const suffix = `__${language}`;
  const base = spanKey.endsWith(suffix) ? spanKey.slice(0, -suffix.length) : spanKey;
  return language === 'pt-BR' && /^page_\d+_block_\d+$/u.test(base) ? base : spanKey;
}

function payloadSpanKey(spanKey: string, language: string): string {
  if (language !== 'pt-BR' || !/^page_\d+_block_\d+$/u.test(spanKey)) return spanKey;
  return `${spanKey}__${language}`;
}

function parseEditorIdentity(spanKey: string): Pick<LocalPersistenceEntry, 'pageNumber' | 'blockIndex' | 'editorialUnitId'> {
  const unqualified = spanKey.replace(/__(?:en|pt-BR)$/u, '');
  const block = unqualified.match(/^page_(\d+)_block_(\d+)(?:_line_.*)?$/u);
  if (block) return { pageNumber: Number(block[1]), blockIndex: Number(block[2]) };
  const unit = unqualified.match(/^page_(\d+)_unit_(.+)$/u);
  if (unit) return { pageNumber: Number(unit[1]), editorialUnitId: unit[2] };
  const page = unqualified.match(/^page_(\d+)_/u);
  return page ? { pageNumber: Number(page[1]) } : {};
}

function readLocalTranslations(storage: StorageLike): LocalTranslation[] {
  const records: LocalTranslation[] = [];
  for (const language of LOCALES) {
    const raw = storage.getItem(`${TRANSLATION_STORAGE_PREFIX}${language}`);
    if (!raw) continue;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`${TRANSLATION_STORAGE_PREFIX}${language} is not a record array.`);
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || typeof (item as SpanOverride).spanKey !== 'string') continue;
      const override = item as SpanOverride;
      const data = encodeOverrideData(override);
      if (!Array.isArray(data.segments)) continue;
      records.push({ language, spanKey: override.spanKey, data });
    }
  }
  return records;
}

function readLocalFrames(storage: StorageLike): LocalFrame[] {
  const records: LocalFrame[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    const match = key?.match(FRAME_STORAGE_PATTERN);
    if (!key || !match) continue;
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    for (const [unitKey, data] of Object.entries(parsed)) {
      if (!data || typeof data !== 'object') continue;
      records.push({ language: match[1] as Locale, pageNumber: Number(match[2]), unitKey, data: data as LayoutFrame });
    }
  }
  return records;
}

export function readLocalPersistenceRecords(storage: StorageLike = window.localStorage) {
  return {
    translations: readLocalTranslations(storage),
    frames: readLocalFrames(storage),
  };
}

async function fetchCollection(slug: 'translations' | 'layout-frames', fetcher: FetchLike): Promise<PayloadDocument[]> {
  const records: PayloadDocument[] = [];
  let expectedTotal: number | null = null;
  let expectedPages: number | null = null;
  for (let page = 1; ; page += 1) {
    const url = new URL(payloadApiUrl(slug));
    url.searchParams.set('depth', '0');
    url.searchParams.set('limit', String(PAGE_LIMIT));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'id');
    const response = await fetcher(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Payload ${slug}: HTTP ${response.status}.`);
    const body = await response.json() as { docs?: PayloadDocument[]; totalDocs?: number; totalPages?: number };
    if (!Array.isArray(body.docs) || !Number.isInteger(body.totalDocs) || !Number.isInteger(body.totalPages)) {
      throw new Error(`Payload ${slug}: resposta de paginação incompleta.`);
    }
    if (expectedTotal === null) {
      expectedTotal = body.totalDocs!;
      expectedPages = body.totalPages!;
    } else if (expectedTotal !== body.totalDocs || expectedPages !== body.totalPages) {
      throw new Error(`Payload ${slug}: coleção mudou durante a leitura.`);
    }
    records.push(...body.docs);
    if (page >= expectedPages!) break;
  }
  if (records.length !== expectedTotal) throw new Error(`Payload ${slug}: resposta truncada.`);
  return records;
}

function makeRemoteMaps(translations: PayloadDocument[], frames: PayloadDocument[]) {
  const remoteTranslations = new Map<string, { data: unknown; updatedAt?: string }>();
  for (const record of translations) {
    if (typeof record.spanKey !== 'string' || typeof record.language !== 'string') continue;
    const decoded = decodeOverrideData(record.data);
    if (!decoded) continue;
    const key = `${record.language}\0${clientSpanKey(record.spanKey, record.language)}`;
    if (remoteTranslations.has(key)) throw new Error(`Payload possui key de tradução duplicada: ${record.spanKey}.`);
    remoteTranslations.set(key, { data: encodeOverrideData({ ...decoded, spanKey: clientSpanKey(record.spanKey, record.language) } as SpanOverride), updatedAt: record.updatedAt });
  }
  const remoteFrames = new Map<string, { data: unknown; updatedAt?: string }>();
  for (const record of frames) {
    if (typeof record.unitKey !== 'string' || typeof record.language !== 'string' || !record.data || typeof record.data !== 'object') continue;
    const key = `${record.language}\0${record.unitKey}`;
    if (remoteFrames.has(key)) throw new Error(`Payload possui frame duplicado: ${record.frameKey ?? record.unitKey}.`);
    remoteFrames.set(key, { data: record.data, updatedAt: record.updatedAt });
  }
  return { remoteTranslations, remoteFrames };
}

export async function inspectLocalPersistence(
  storage: StorageLike = window.localStorage,
  fetcher: FetchLike = fetch,
): Promise<LocalPersistenceReport> {
  let local: ReturnType<typeof readLocalPersistenceRecords>;
  try { local = readLocalPersistenceRecords(storage); }
  catch (error) {
    return {
      checkedAt: new Date().toISOString(), payloadAvailable: false,
      error: error instanceof Error ? error.message : 'Não foi possível ler o armazenamento local.',
      localRecordCount: 0, unsyncedCount: null, entries: [],
    };
  }
  try {
    const [remoteTranslations, remoteFrames] = await Promise.all([
      fetchCollection('translations', fetcher), fetchCollection('layout-frames', fetcher),
    ]);
    const remote = makeRemoteMaps(remoteTranslations, remoteFrames);
    const entries: LocalPersistenceEntry[] = [
      ...local.translations.map(record => {
        const remoteRecord = remote.remoteTranslations.get(`${record.language}\0${record.spanKey}`);
        const identity = parseEditorIdentity(record.spanKey);
        return {
          id: `translation:${record.language}:${record.spanKey}`,
          kind: 'translation' as const,
          language: record.language,
          spanKey: record.spanKey,
          ...identity,
          syncState: !remoteRecord ? 'missing_remote' as const
            : stableJson(record.data) === stableJson(remoteRecord.data) ? 'confirmed' as const : 'diverged' as const,
          payloadUpdatedAt: remoteRecord?.updatedAt ?? null,
          data: record.data,
        };
      }),
      ...local.frames.map(record => {
        const remoteRecord = remote.remoteFrames.get(`${record.language}\0${record.unitKey}`);
        return {
          id: `frame:${record.language}:${record.unitKey}`,
          kind: 'frame' as const,
          language: record.language,
          pageNumber: record.pageNumber,
          unitKey: record.unitKey,
          syncState: !remoteRecord ? 'missing_remote' as const
            : stableJson(record.data) === stableJson(remoteRecord.data) ? 'confirmed' as const : 'diverged' as const,
          payloadUpdatedAt: remoteRecord?.updatedAt ?? null,
          data: record.data,
        };
      }),
    ];
    return {
      checkedAt: new Date().toISOString(),
      payloadAvailable: true,
      localRecordCount: entries.length,
      unsyncedCount: entries.filter(entry => entry.syncState !== 'confirmed').length,
      entries,
    };
  } catch (error) {
    const entries: LocalPersistenceEntry[] = [
      ...local.translations.map(record => ({
        id: `translation:${record.language}:${record.spanKey}`,
        kind: 'translation' as const,
        language: record.language,
        spanKey: record.spanKey,
        ...parseEditorIdentity(record.spanKey),
        syncState: 'unverified' as const,
        data: record.data,
      })),
      ...local.frames.map(record => ({
        id: `frame:${record.language}:${record.unitKey}`,
        kind: 'frame' as const,
        language: record.language,
        pageNumber: record.pageNumber,
        unitKey: record.unitKey,
        syncState: 'unverified' as const,
        data: record.data,
      })),
    ];
    return {
      checkedAt: new Date().toISOString(),
      payloadAvailable: false,
      error: error instanceof Error ? error.message : 'Payload indisponível.',
      localRecordCount: entries.length,
      unsyncedCount: null,
      entries,
    };
  }
}

export function localOverridesStorageKey(language: Locale): string {
  return `${TRANSLATION_STORAGE_PREFIX}${language}`;
}

export function loadLocalOverrides(language: Locale, storage: StorageLike = window.localStorage): Map<string, SpanOverride> {
  try {
    const raw = storage.getItem(localOverridesStorageKey(language));
    if (!raw) return new Map();
    const records: SpanOverride[] = JSON.parse(raw);
    return new Map(records.map(record => [record.spanKey, record]));
  } catch { return new Map(); }
}

export function saveLocalOverrides(
  language: Locale,
  overrides: Map<string, SpanOverride>,
  storage: WritableStorageLike = window.localStorage,
): boolean {
  try {
    storage.setItem(localOverridesStorageKey(language), JSON.stringify([...overrides.values()]));
    return true;
  } catch { return false; }
}

async function findPayloadOverride(spanKey: string, language: string, fetcher: FetchLike): Promise<PayloadDocument | null> {
  const candidateKeys = Array.from(new Set([payloadSpanKey(spanKey, language), spanKey]));
  for (const candidate of candidateKeys) {
    const url = new URL(payloadApiUrl('translations'));
    url.searchParams.set('where[and][0][spanKey][equals]', candidate);
    url.searchParams.set('where[and][1][language][equals]', language);
    url.searchParams.set('limit', '1');
    const response = await fetcher(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Payload translations lookup: HTTP ${response.status}.`);
    const docs = (await response.json() as { docs?: PayloadDocument[] }).docs;
    if (docs?.[0]) return docs[0];
  }
  return null;
}

export async function persistOverrideToPayload(
  override: SpanOverride,
  language: Locale,
  fetcher: FetchLike = fetch,
): Promise<'confirmed' | 'failed'> {
  try {
    const existing = await findPayloadOverride(override.spanKey, language, fetcher);
    const body = encodeOverrideData(override);
    const response = existing
      ? await fetcher(payloadApiUrl(`translations/${existing.id}`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, data: body }), signal: AbortSignal.timeout(15_000),
      })
      : await fetcher(payloadApiUrl('translations'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spanKey: payloadSpanKey(override.spanKey, language), language, data: body }),
        signal: AbortSignal.timeout(15_000),
      });
    if (!response.ok) return 'failed';
    const persisted = await findPayloadOverride(override.spanKey, language, fetcher);
    const saved = persisted ? decodeOverrideData(persisted.data) : null;
    if (!saved || stableJson(encodeOverrideData(saved as SpanOverride)) !== stableJson(body)) return 'failed';
    return 'confirmed';
  } catch { return 'failed'; }
}

export function createLocalRecoveryPackage(report: LocalPersistenceReport) {
  return {
    backupSchemaVersion: 1,
    kind: 'middara-browser-local-recovery',
    generatedAt: new Date().toISOString(),
    payloadComparison: report.payloadAvailable ? 'available' : 'unavailable',
    unsyncedLocalRecords: report.unsyncedCount,
    recordsIncluded: report.entries.length,
    note: 'Local recovery data only. This JSON is not an importer and does not write to Payload.',
    translations: report.entries.filter(entry => entry.kind === 'translation'),
    frames: report.entries.filter(entry => entry.kind === 'frame'),
  };
}

export function dispatchLocalPersistenceChanged(detail?: LocalPersistenceEventDetail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LOCAL_PERSISTENCE_CHANGED_EVENT, { detail }));
}

export function applyLocalPersistenceChange(
  report: LocalPersistenceReport,
  detail: LocalPersistenceEventDetail,
): LocalPersistenceReport | null {
  if (detail.deleted) {
    if (!detail.kind || !detail.language || (detail.kind === 'translation' ? !detail.spanKey : !detail.unitKey)) return null;
    const id = detail.kind === 'translation'
      ? `translation:${detail.language}:${detail.spanKey}`
      : `frame:${detail.language}:${detail.unitKey}`;
    const entries = report.entries.filter(entry => entry.id !== id);
    return {
      ...report,
      checkedAt: new Date().toISOString(),
      localRecordCount: entries.length,
      unsyncedCount: report.payloadAvailable ? entries.filter(entry => entry.syncState !== 'confirmed').length : null,
      entries,
    };
  }

  if (!detail.kind || !detail.language || detail.data === undefined
    || (detail.kind === 'translation' ? !detail.spanKey : !detail.unitKey)) return null;
  const identity = detail.kind === 'translation' ? parseEditorIdentity(detail.spanKey!) : {};
  const entry: LocalPersistenceEntry = detail.kind === 'translation'
    ? {
      id: `translation:${detail.language}:${detail.spanKey}`,
      kind: 'translation', language: detail.language, spanKey: detail.spanKey,
      ...identity, syncState: detail.confirmed ? 'confirmed' : 'sync_error', data: detail.data,
    }
    : {
      id: `frame:${detail.language}:${detail.unitKey}`,
      kind: 'frame', language: detail.language, pageNumber: detail.pageNumber,
      unitKey: detail.unitKey, syncState: detail.confirmed ? 'confirmed' : 'sync_error', data: detail.data,
    };
  const entries = [...report.entries.filter(existing => existing.id !== entry.id), entry];
  return {
    ...report,
    checkedAt: new Date().toISOString(),
    localRecordCount: entries.length,
    unsyncedCount: report.payloadAvailable ? entries.filter(existing => existing.syncState !== 'confirmed').length : null,
    entries,
  };
}

function remoteLookupUrls(kind: LocalRecordKind, entry: LocalPersistenceEntry): URL[] {
  if (kind === 'translation' && entry.spanKey) {
    const candidates = Array.from(new Set([payloadSpanKey(entry.spanKey, entry.language), entry.spanKey]));
    return candidates.map(spanKey => {
      const url = new URL(payloadApiUrl('translations'));
      url.searchParams.set('where[and][0][spanKey][equals]', spanKey);
      url.searchParams.set('where[and][1][language][equals]', entry.language);
      url.searchParams.set('limit', '1');
      return url;
    });
  }
  const url = new URL(payloadApiUrl('layout-frames'));
  url.searchParams.set('where[frameKey][equals]', `${entry.unitKey}::${entry.language}`);
  url.searchParams.set('limit', '1');
  return [url];
}

export async function retryMissingLocalRecord(
  entry: LocalPersistenceEntry,
  storage: StorageLike = window.localStorage,
  fetcher: FetchLike = fetch,
): Promise<'confirmed' | 'conflict' | 'failed' | 'missing_local' | 'changed'> {
  const local = readLocalPersistenceRecords(storage);
  let body: Record<string, unknown>;
  if (entry.kind === 'translation') {
    const current = local.translations.find(record => record.language === entry.language && record.spanKey === entry.spanKey);
    if (!current) return 'missing_local';
    if (stableJson(current.data) !== stableJson(entry.data)) return 'changed';
    body = { spanKey: payloadSpanKey(current.spanKey, current.language), language: current.language, data: current.data };
  } else {
    const current = local.frames.find(record => record.language === entry.language && record.unitKey === entry.unitKey);
    if (!current) return 'missing_local';
    if (stableJson(current.data) !== stableJson(entry.data)) return 'changed';
    body = {
      frameKey: `${current.unitKey}::${current.language}`,
      unitKey: current.unitKey,
      pageNumber: current.pageNumber,
      language: current.language,
      data: current.data,
    };
  }

  try {
    for (const url of remoteLookupUrls(entry.kind, entry)) {
      const lookup = await fetcher(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
      if (!lookup.ok) return 'failed';
      const existing = (await lookup.json() as { docs?: PayloadDocument[] }).docs?.[0];
      if (existing) return 'conflict';
    }
  } catch { return 'failed'; }

  let created: Response;
  try {
    created = await fetcher(payloadApiUrl(entry.kind === 'translation' ? 'translations' : 'layout-frames'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
  } catch { return 'failed'; }
  if (!created.ok) return 'failed';

  try {
    const verify = await fetcher(remoteLookupUrls(entry.kind, entry)[0], { method: 'GET', signal: AbortSignal.timeout(15_000) });
    if (!verify.ok) return 'failed';
    const saved = (await verify.json() as { docs?: PayloadDocument[] }).docs?.[0];
    if (!saved) return 'failed';
    const savedData = entry.kind === 'translation'
      ? (() => {
        const decoded = decodeOverrideData(saved.data);
        return decoded ? encodeOverrideData({ ...decoded, spanKey: entry.spanKey! } as SpanOverride) : null;
      })()
      : saved.data;
    if (!savedData || stableJson(savedData) !== stableJson(body.data)) return 'failed';
  } catch { return 'failed'; }
  dispatchLocalPersistenceChanged({
    kind: entry.kind,
    language: entry.language,
    spanKey: entry.spanKey,
    unitKey: entry.unitKey,
    pageNumber: entry.pageNumber,
    data: body.data,
    confirmed: true,
  });
  return 'confirmed';
}

export function persistedOverridesEqual(local: SpanOverride, remote: SpanOverride): boolean {
  return stableJson(encodeOverrideData(local)) === stableJson(encodeOverrideData(remote));
}
