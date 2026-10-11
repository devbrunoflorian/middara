import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueriesForElement, fireEvent as dispatchEvent } from '@testing-library/dom';
import { createRoot, type Root } from 'react-dom/client';
import { LocalSyncRecoveryControl } from '../src/components/LocalSyncRecoveryControl';
import {
  applyLocalPersistenceChange,
  createLocalRecoveryPackage,
  inspectLocalPersistence,
  loadLocalOverrides,
  persistOverrideToPayload,
  resolveDivergedLocalRecord,
  retryMissingLocalRecord,
  saveLocalOverrideEntry,
  saveLocalOverrides,
} from '../src/localPersistence';
import { saveLayoutFrame, saveLocalLayoutFrame, saveLocalLayoutFrames } from '../src/layoutFrames';
import type { SpanOverride } from '../src/components/RichSpanEditor';
import { encodeOverrideData } from '../src/symbols/overrideData';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function fakePayload() {
  const translations: Array<Record<string, any>> = [];
  const frames: Array<Record<string, any>> = [];
  let failPosts = true;
  let nextId = 9000;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const collection = parts.at(-1) === 'translations' || parts.includes('translations') ? 'translations' : 'layout-frames';
    const records = collection === 'translations' ? translations : frames;
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      const spanKey = url.searchParams.get('where[and][0][spanKey][equals]');
      const language = url.searchParams.get('where[and][1][language][equals]') ?? url.searchParams.get('where[language][equals]');
      const frameKey = url.searchParams.get('where[frameKey][equals]');
      const docs = records.filter(record => (!spanKey || record.spanKey === spanKey)
        && (!language || record.language === language)
        && (!frameKey || record.frameKey === frameKey));
      if (spanKey || frameKey || (language && url.searchParams.has('where[and][0][spanKey][equals]'))) {
        return jsonResponse({ docs: docs.slice(0, Number(url.searchParams.get('limit') ?? 1)) });
      }
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 500);
      return jsonResponse({ docs: docs.slice((page - 1) * limit, page * limit), totalDocs: docs.length, totalPages: Math.ceil(docs.length / limit) });
    }
    if (method === 'POST') {
      if (failPosts) return jsonResponse({ errors: ['simulated offline save'] }, 503);
      const body = JSON.parse(String(init?.body));
      const record = { id: nextId++, ...body, createdAt: '2026-10-09T12:00:00.000Z', updatedAt: '2026-10-09T12:00:00.000Z' };
      records.push(record);
      return jsonResponse(record, 201);
    }
    if (method === 'PATCH') {
      const id = parts.at(-1);
      const body = JSON.parse(String(init?.body));
      const record = records.find(item => String(item.id) === id);
      if (!record) return jsonResponse({}, 404);
      Object.assign(record, body, { updatedAt: '2026-10-09T12:01:00.000Z' });
      return jsonResponse(record);
    }
    return jsonResponse({}, 405);
  });
  return {
    translations,
    frames,
    fetcher,
    allowPosts() { failPosts = false; },
    seedTranslation(record: Record<string, any>) { translations.push(record); },
  };
}

const symbolOverride: SpanOverride = {
  spanKey: 'page_88_unit_recovery-example__pt-BR',
  segments: [
    { text: 'Exemplo: ', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 700, style: 'normal' },
    { text: '\uFFFC', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal', symbolId: 'tag.status.icon' },
  ],
  bbox: [10, 20, 300, 50],
  textAlign: 'left',
  lineHeight: 1.2,
  managedSourceSymbols: ['tag.status.icon'],
};

function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(node));
  return { container, root, ...getQueriesForElement(container) };
}

const cleanups = new Set<() => void>();
const fireEvent = new Proxy(dispatchEvent, {
  get(target, property: keyof typeof dispatchEvent) {
    const dispatch = target[property];
    return typeof dispatch === 'function' ? (...args: unknown[]) => act(() => dispatch(...args as Parameters<typeof dispatchEvent>)) : dispatch;
  },
});

describe('local save visibility and recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    cleanups.forEach(cleanup => cleanup());
    cleanups.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('A — confirms a successful local-first translation write by reading Payload back', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload(); payload.allowPosts();
    expect(saveLocalOverrides('pt-BR', new Map([[symbolOverride.spanKey, symbolOverride]]), storage)).toBe(true);
    expect(await persistOverrideToPayload(symbolOverride, 'pt-BR', payload.fetcher)).toBe('confirmed');
    expect(loadLocalOverrides('pt-BR', storage).has(symbolOverride.spanKey)).toBe(true);
    const report = await inspectLocalPersistence(storage, payload.fetcher);
    expect(report.payloadAvailable).toBe(true);
    expect(report.unsyncedCount).toBe(0);
    expect(payload.translations[0].data.segments[1].symbolId).toBe('tag.status.icon');
  });

  it('updates only the saved translation key, retaining unrelated local drafts and conflicts', () => {
    const storage = new MemoryStorage();
    const sibling = { ...symbolOverride, spanKey: 'page_88_unit_pending-sibling__pt-BR', segments: [{ ...symbolOverride.segments[0], text: 'Keep me' }] };
    storage.setItem('middara-lines-v2-pt-BR', JSON.stringify([sibling]));
    const edited = { ...symbolOverride, segments: [{ ...symbolOverride.segments[0], text: 'Current edit' }] };
    expect(saveLocalOverrideEntry('pt-BR', edited, storage)).toBe(true);
    const saved = loadLocalOverrides('pt-BR', storage);
    expect(saved.get(sibling.spanKey)?.segments[0].text).toBe('Keep me');
    expect(saved.get(edited.spanKey)?.segments[0].text).toBe('Current edit');
  });

  it('updates one local frame without deleting sibling frames', () => {
    const key = 'middara-layout-frames-v1-pt-BR-page-88';
    const sibling = { x: 1, y: 2, width: 30, height: 4 };
    localStorage.setItem(key, JSON.stringify({ 'page_88_unit_sibling': sibling }));
    const next = { x: 10, y: 20, width: 40, height: 12 };
    expect(saveLocalLayoutFrame(88, 'pt-BR', 'page_88_unit_target', next)).toBe(true);
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toEqual({
      'page_88_unit_sibling': sibling,
      'page_88_unit_target': next,
    });
  });

  it('shows both sides of a conflict and applies an explicitly selected local version only after rechecking the snapshot', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload(); payload.allowPosts();
    const local = { ...symbolOverride, segments: [{ ...symbolOverride.segments[0], text: 'Local revision' }] };
    const remote = { ...symbolOverride, segments: [{ ...symbolOverride.segments[0], text: 'Payload revision' }] };
    saveLocalOverrides('pt-BR', new Map([[local.spanKey, local]]), storage);
    payload.seedTranslation({ id: 42, spanKey: local.spanKey, language: 'pt-BR', data: encodeOverrideData(remote), updatedAt: '2026-10-10T10:00:00.000Z' });
    const report = await inspectLocalPersistence(storage, payload.fetcher);
    const entry = report.entries[0];
    expect(entry.syncState).toBe('diverged');
    expect((entry.data as any).segments[0].text).toBe('Local revision');
    expect((entry.payloadData as any).segments[0].text).toBe('Payload revision');
    expect(entry.payloadId).toBe(42);
    const backupEntry = createLocalRecoveryPackage(report).translations[0];
    expect((backupEntry.data as any).segments[0].text).toBe('Local revision');
    expect((backupEntry.payloadData as any).segments[0].text).toBe('Payload revision');
    expect(await resolveDivergedLocalRecord(entry, 'local-to-payload', storage, payload.fetcher)).toBe('confirmed');
    expect(payload.translations[0].data.segments[0].text).toBe('Local revision');
    expect((await inspectLocalPersistence(storage, payload.fetcher)).unsyncedCount).toBe(0);
  });

  it('can select the Payload version locally without changing it or deleting another local draft', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload();
    const local = { ...symbolOverride, segments: [{ ...symbolOverride.segments[0], text: 'Local revision' }] };
    const remote = { ...symbolOverride, segments: [{ ...symbolOverride.segments[0], text: 'Payload revision' }] };
    const sibling = { ...symbolOverride, spanKey: 'page_88_unit_sibling__pt-BR', segments: [{ ...symbolOverride.segments[0], text: 'Sibling draft' }] };
    saveLocalOverrides('pt-BR', new Map([[local.spanKey, local], [sibling.spanKey, sibling]]), storage);
    payload.seedTranslation({ id: 43, spanKey: local.spanKey, language: 'pt-BR', data: encodeOverrideData(remote), updatedAt: '2026-10-10T10:00:00.000Z' });
    const entry = (await inspectLocalPersistence(storage, payload.fetcher)).entries.find(item => item.spanKey === local.spanKey)!;
    expect(await resolveDivergedLocalRecord(entry, 'payload-to-local', storage, payload.fetcher)).toBe('confirmed');
    const localAfter = loadLocalOverrides('pt-BR', storage);
    expect(localAfter.get(local.spanKey)?.segments[0].text).toBe('Payload revision');
    expect(localAfter.get(sibling.spanKey)?.segments[0].text).toBe('Sibling draft');
    expect(payload.translations[0].data.segments[0].text).toBe('Payload revision');
  });

  it('refuses a reviewed divergence when the local or Payload version changed after comparison', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload(); payload.allowPosts();
    const local = { ...symbolOverride, segments: [{ ...symbolOverride.segments[0], text: 'Local revision' }] };
    const remote = { ...symbolOverride, segments: [{ ...symbolOverride.segments[0], text: 'Payload revision' }] };
    saveLocalOverrides('pt-BR', new Map([[local.spanKey, local]]), storage);
    payload.seedTranslation({ id: 44, spanKey: local.spanKey, language: 'pt-BR', data: encodeOverrideData(remote), updatedAt: '2026-10-10T10:00:00.000Z' });
    const entry = (await inspectLocalPersistence(storage, payload.fetcher)).entries[0];
    payload.translations[0].updatedAt = '2026-10-10T10:01:00.000Z';
    expect(await resolveDivergedLocalRecord(entry, 'local-to-payload', storage, payload.fetcher)).toBe('stale');
    expect(payload.translations[0].data.segments[0].text).toBe('Payload revision');
  });

  it('B/D/E — keeps a failed local-first save across reload, detects it, and exports its rich data', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload();
    saveLocalOverrides('pt-BR', new Map([[symbolOverride.spanKey, symbolOverride]]), storage);
    expect(await persistOverrideToPayload(symbolOverride, 'pt-BR', payload.fetcher)).toBe('failed');

    const afterReload = loadLocalOverrides('pt-BR', storage);
    expect(afterReload.get(symbolOverride.spanKey)?.segments).toEqual(symbolOverride.segments);
    const report = await inspectLocalPersistence(storage, payload.fetcher);
    expect(report.unsyncedCount).toBe(1);
    expect(report.entries[0].syncState).toBe('missing_remote');
    const recovered = JSON.parse(JSON.stringify(createLocalRecoveryPackage(report)));
    expect(recovered.translations).toHaveLength(1);
    expect(recovered.translations[0].spanKey).toBe(symbolOverride.spanKey);
    expect(recovered.translations[0].data.segments[1].symbolId).toBe('tag.status.icon');
    expect(recovered.frames).toHaveLength(0);
  });

  it('C — explicit retry creates only an absent Payload record and returns the detector to zero', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload();
    saveLocalOverrides('pt-BR', new Map([[symbolOverride.spanKey, symbolOverride]]), storage);
    const pending = await inspectLocalPersistence(storage, payload.fetcher);
    payload.allowPosts();
    expect(await retryMissingLocalRecord(pending.entries[0], storage, payload.fetcher)).toBe('confirmed');
    const afterRetry = await inspectLocalPersistence(storage, payload.fetcher);
    expect(afterRetry.unsyncedCount).toBe(0);
    expect(payload.translations).toHaveLength(1);
  });

  it('keeps local frames visible to the detector and retry path', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload();
    storage.setItem('middara-layout-frames-v1-pt-BR-page-88', JSON.stringify({
      'page_88_unit_recovery-example': { x: 12, y: 20, width: 200, height: 30, lineHeight: 1.2 },
    }));
    const before = await inspectLocalPersistence(storage, payload.fetcher);
    expect(before.unsyncedCount).toBe(1);
    expect(before.entries[0].kind).toBe('frame');
    expect(createLocalRecoveryPackage(before).frames[0].unitKey).toBe('page_88_unit_recovery-example');
    payload.allowPosts();
    expect(await retryMissingLocalRecord(before.entries[0], storage, payload.fetcher)).toBe('confirmed');
    expect((await inspectLocalPersistence(storage, payload.fetcher)).unsyncedCount).toBe(0);
  });

  it('does not retry a different local version over an existing Payload record', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload(); payload.allowPosts();
    const local = { ...symbolOverride, segments: [{ ...symbolOverride.segments[0], text: 'Local only' }] };
    saveLocalOverrides('pt-BR', new Map([[local.spanKey, local]]), storage);
    payload.seedTranslation({
      id: 42,
      spanKey: local.spanKey,
      language: 'pt-BR',
      data: { schemaVersion: 2, segments: [{ ...symbolOverride.segments[0], text: 'Remote version' }], textAlign: 'left' },
    });
    const report = await inspectLocalPersistence(storage, payload.fetcher);
    expect(report.unsyncedCount).toBe(1);
    expect(report.entries[0].syncState).toBe('diverged');
    expect(await retryMissingLocalRecord(report.entries[0], storage, payload.fetcher)).toBe('conflict');
    expect(payload.translations).toHaveLength(1);
    expect(payload.translations[0].data.segments[0].text).toBe('Remote version');
  });

  it('checks the legacy unsuffixed PT-BR block key before retrying a missing key', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload();
    const legacy: SpanOverride = { ...symbolOverride, spanKey: 'page_88_block_5' };
    saveLocalOverrides('pt-BR', new Map([[legacy.spanKey, legacy]]), storage);
    payload.seedTranslation({ id: 71, spanKey: legacy.spanKey, language: 'pt-BR', data: encodeOverrideData(legacy) });
    const report = await inspectLocalPersistence(storage, payload.fetcher);
    expect(report.unsyncedCount).toBe(0);
    expect(await retryMissingLocalRecord({
      ...report.entries[0], syncState: 'missing_remote',
    }, storage, payload.fetcher)).toBe('conflict');
    expect(payload.translations).toHaveLength(1);
  });

  it('updates the visible unsynced count incrementally after save and confirmation', async () => {
    const storage = new MemoryStorage();
    const payload = fakePayload();
    let report = await inspectLocalPersistence(storage, payload.fetcher);
    expect(report.unsyncedCount).toBe(0);
    report = applyLocalPersistenceChange(report, {
      kind: 'translation', language: 'pt-BR', spanKey: symbolOverride.spanKey,
      data: symbolOverride, confirmed: false,
    })!;
    expect(report.unsyncedCount).toBe(1);
    expect(report.entries[0].syncState).toBe('sync_error');
    report = applyLocalPersistenceChange(report, {
      kind: 'translation', language: 'pt-BR', spanKey: symbolOverride.spanKey,
      data: symbolOverride, confirmed: true,
    })!;
    expect(report.unsyncedCount).toBe(0);
    expect(report.entries[0].syncState).toBe('confirmed');
  });

  it('does not POST a frame when the Payload preflight lookup fails', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, 503));
    vi.stubGlobal('fetch', fetcher);
    expect(await saveLayoutFrame({
      unitKey: 'page_88_unit_frame-test', pageNumber: 88, language: 'pt-BR',
      frame: { x: 12, y: 20, width: 200, height: 30 },
    })).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0][1] as RequestInit | undefined)?.method ?? 'GET').toBe('GET');
  });

  it('confirms a local frame only after matching Payload read-back', async () => {
    const payload = fakePayload(); payload.allowPosts();
    const unitKey = 'page_88_unit_frame-roundtrip';
    const frame = { x: 15, y: 25, width: 180, height: 32, lineHeight: 1.25 };
    saveLocalLayoutFrames(88, 'pt-BR', new Map([[unitKey, frame]]));
    vi.stubGlobal('fetch', payload.fetcher);
    expect(await saveLayoutFrame({ unitKey, pageNumber: 88, language: 'pt-BR', frame })).toBe(true);
    const report = await inspectLocalPersistence(localStorage, payload.fetcher);
    expect(report.unsyncedCount).toBe(0);
    expect(payload.frames[0].data).toEqual(frame);
  });

  it('shows the persistent count, local record identity, retry and emergency export actions', async () => {
    const local = { ...symbolOverride, spanKey: 'page_88_unit_ui-recovery__pt-BR' };
    localStorage.setItem('middara-lines-v2-pt-BR', JSON.stringify([local]));
    const payload = fakePayload();
    vi.stubGlobal('fetch', payload.fetcher);
    const NativeURL = URL;
    class TestURL extends NativeURL {
      static createObjectURL() { return 'blob:recovery'; }
      static revokeObjectURL() {}
    }
    vi.stubGlobal('URL', TestURL);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const originalShowModal = HTMLDialogElement.prototype.showModal;
    const originalClose = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
    const view = render(<LocalSyncRecoveryControl visible />);
    const cleanup = () => { act(() => view.root.unmount()); view.container.remove(); click.mockRestore(); HTMLDialogElement.prototype.showModal = originalShowModal; HTMLDialogElement.prototype.close = originalClose; };
    cleanups.add(cleanup);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    fireEvent.click(view.getByRole('button', { name: 'UNSYNCED LOCAL RECORDS = 1' }));
    expect(view.getByRole('dialog').textContent).toContain('p. 88 · unidade ui-recovery');
    expect(view.getByRole('dialog').textContent).toContain('Ainda não existe no Payload');
    expect(view.getByRole('button', { name: 'Tentar sincronizar' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Exportar recuperação JSON' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Exportar recuperação JSON' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('exposes both divergent versions and keeps resolution actions locked until a backup is downloaded and acknowledged', async () => {
    const local = { ...symbolOverride, spanKey: 'page_88_unit_ui-conflict__pt-BR', segments: [{ ...symbolOverride.segments[0], text: 'Local copy' }] };
    const remote = { ...local, segments: [{ ...symbolOverride.segments[0], text: 'Payload copy' }] };
    localStorage.setItem('middara-lines-v2-pt-BR', JSON.stringify([local]));
    const payload = fakePayload();
    payload.seedTranslation({ id: 81, spanKey: local.spanKey, language: 'pt-BR', data: encodeOverrideData(remote), updatedAt: '2026-10-10T12:00:00.000Z' });
    vi.stubGlobal('fetch', payload.fetcher);
    const NativeURL = URL;
    class TestURL extends NativeURL { static createObjectURL() { return 'blob:conflict'; } static revokeObjectURL() {} }
    vi.stubGlobal('URL', TestURL);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const originalShowModal = HTMLDialogElement.prototype.showModal;
    const originalClose = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
    const view = render(<LocalSyncRecoveryControl visible />);
    const cleanup = () => { act(() => view.root.unmount()); view.container.remove(); click.mockRestore(); HTMLDialogElement.prototype.showModal = originalShowModal; HTMLDialogElement.prototype.close = originalClose; };
    cleanups.add(cleanup);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    fireEvent.click(view.getByRole('button', { name: 'UNSYNCED LOCAL RECORDS = 1' }));
    fireEvent.click(view.getByText('Revisar versões e diferenças'));
    expect(view.getByText('Local (navegador)')).toBeTruthy();
    expect(view.getByText('Payload · ID 81')).toBeTruthy();
    const versions = view.container.querySelectorAll('pre');
    expect(versions[0]?.textContent).toContain('Local copy');
    expect(versions[1]?.textContent).toContain('Payload copy');
    const localAction = view.getByRole('button', { name: 'Manter local no Payload' }) as HTMLButtonElement;
    expect(localAction.disabled).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Baixar backup local + Payload' }));
    const backupCheck = view.getByRole('checkbox', { name: 'Confirmei que salvei o backup recuperável desta divergência.' });
    expect((backupCheck as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(backupCheck);
    expect(localAction.disabled).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    expect(payload.translations[0].data.segments[0].text).toBe('Payload copy');
  });
});
