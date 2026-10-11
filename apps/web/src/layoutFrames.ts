import type { LayoutFrame } from './components/PageRenderer';
import { payloadApiUrl } from './config/payloadApi';

export type LayoutLanguage = 'en' | 'pt-BR';

export interface LayoutFrameRecord {
  unitKey: string;
  pageNumber: number;
  language: LayoutLanguage;
  frame: LayoutFrame;
}

const STORAGE_PREFIX = 'middara-layout-frames-v1';
const PAYLOAD_URL = payloadApiUrl('layout-frames');

function stableFrameJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableFrameJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableFrameJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function layoutFrameStorageKey(pageNumber: number, language: LayoutLanguage) {
  return `${STORAGE_PREFIX}-${language}-page-${pageNumber}`;
}

export function layoutFrameRecordKey(unitKey: string, language: LayoutLanguage) {
  return `${unitKey}::${language}`;
}

export function loadLocalLayoutFrames(pageNumber: number, language: LayoutLanguage): Map<string, LayoutFrame> {
  try {
    const raw = localStorage.getItem(layoutFrameStorageKey(pageNumber, language));
    const records = raw ? JSON.parse(raw) as Record<string, LayoutFrame> : {};
    return new Map(Object.entries(records));
  } catch {
    return new Map();
  }
}

export function saveLocalLayoutFrames(
  pageNumber: number,
  language: LayoutLanguage,
  frames: Map<string, LayoutFrame>,
): boolean {
  try {
    const key = layoutFrameStorageKey(pageNumber, language);
    const raw = localStorage.getItem(key);
    const records: Record<string, LayoutFrame> = raw ? JSON.parse(raw) : {};
    if (!records || typeof records !== 'object' || Array.isArray(records)) return false;
    for (const [unitKey, frame] of frames) records[unitKey] = frame;
    localStorage.setItem(key, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/** Persist one frame without replacing sibling local frames with server-overlaid state. */
export function saveLocalLayoutFrame(
  pageNumber: number,
  language: LayoutLanguage,
  unitKey: string,
  frame: LayoutFrame,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): boolean {
  try {
    const key = layoutFrameStorageKey(pageNumber, language);
    const raw = storage.getItem(key);
    const records: Record<string, LayoutFrame> = raw ? JSON.parse(raw) : {};
    if (!records || typeof records !== 'object' || Array.isArray(records)) return false;
    records[unitKey] = frame;
    storage.setItem(key, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function removeLocalLayoutFrame(
  pageNumber: number,
  language: LayoutLanguage,
  unitKey: string,
): boolean {
  try {
    const key = layoutFrameStorageKey(pageNumber, language);
    const raw = localStorage.getItem(key);
    const records: Record<string, LayoutFrame> = raw ? JSON.parse(raw) : {};
    if (!records || typeof records !== 'object' || Array.isArray(records)) return false;
    delete records[unitKey];
    localStorage.setItem(key, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export async function fetchLayoutFrames(pageNumber: number, language: LayoutLanguage): Promise<Map<string, LayoutFrame> | null> {
  try {
    const query = new URLSearchParams({
      'where[and][0][pageNumber][equals]': String(pageNumber),
      'where[and][1][language][equals]': language,
      limit: '500',
    });
    const response = await fetch(`${PAYLOAD_URL}?${query}`);
    if (!response.ok) return null;
    const result = await response.json();
    const frames = new Map<string, LayoutFrame>();
    for (const record of result.docs ?? []) {
      if (record.unitKey && record.data && Number.isFinite(record.data.x) && Number.isFinite(record.data.width)) {
        frames.set(record.unitKey, record.data as LayoutFrame);
      }
    }
    return frames;
  } catch {
    return null;
  }
}

export async function saveLayoutFrame(record: LayoutFrameRecord): Promise<boolean> {
  try {
    const frameKey = layoutFrameRecordKey(record.unitKey, record.language);
    const query = new URLSearchParams({ 'where[frameKey][equals]': frameKey, limit: '1' });
    const lookup = await fetch(`${PAYLOAD_URL}?${query}`);
    if (!lookup.ok) return false;
    const existing = (await lookup.json()).docs?.[0];
    const payload = {
      frameKey,
      unitKey: record.unitKey,
      pageNumber: record.pageNumber,
      language: record.language,
      data: record.frame,
    };
    const response = existing
      ? await fetch(`${PAYLOAD_URL}/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch(PAYLOAD_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    if (!response.ok) return false;

    const verify = await fetch(`${PAYLOAD_URL}?${query}`);
    if (!verify.ok) return false;
    const saved = (await verify.json()).docs?.[0];
    return !!saved
      && saved.frameKey === frameKey
      && saved.unitKey === record.unitKey
      && saved.pageNumber === record.pageNumber
      && saved.language === record.language
      && stableFrameJson(saved.data) === stableFrameJson(record.frame);
  } catch {
    return false;
  }
}

export async function deleteLayoutFrame(unitKey: string, language: LayoutLanguage): Promise<boolean> {
  try {
    const frameKey = layoutFrameRecordKey(unitKey, language);
    const query = new URLSearchParams({ 'where[frameKey][equals]': frameKey, limit: '1' });
    const lookup = await fetch(`${PAYLOAD_URL}?${query}`);
    if (!lookup.ok) return false;
    const existing = (await lookup.json()).docs?.[0];
    if (!existing) return true;
    const response = await fetch(`${PAYLOAD_URL}/${existing.id}`, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}
