import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, getQueriesForElement } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import type { SpanOverride } from '../src/components/RichSpanEditor';

type SnapshotRecord = { spanKey: string; language: string; data: Omit<SpanOverride, 'spanKey' | 'bbox'> };
const pageData = {
  ...(JSON.parse(readFileSync(join(process.cwd(), 'public/pages/page_021/page_021_dom.json'), 'utf8')) as PageData),
  backgroundUrl: '/pages/page_021/background.webp',
};
const snapshot = JSON.parse(readFileSync(join(process.cwd(), '../../output/proofs/translation-readiness-2026-10-16/p021-full-page-proposal-v2/snapshot/snapshot.json'), 'utf8')) as { translations: SnapshotRecord[] };
const proposal = JSON.parse(readFileSync(join(process.cwd(), '../../docs/translations/proposals/page-021-full-page-proposal-2026-10-16-v2.json'), 'utf8')) as {
  candidates: Array<{ spanKey: string; sourceText: string; proposalText: string; diagnosticData: { segments: Array<{ text?: string }> } }>;
};
const selectedKey = 'page_21_block_2';
const clientKey = (key: string) => /^page_21_block_\d+__pt-BR$/u.test(key) ? key.slice(0, -'__pt-BR'.length) : key;
const diagnosticOverrides = new Map<string, SpanOverride>(snapshot.translations.map(record => {
  const key = clientKey(record.spanKey);
  return [key, { ...record.data, spanKey: key, bbox: [0, 0, 0, 0] } as SpanOverride];
}));

function renderDiagnosticViewer() {
  const markup = renderToStaticMarkup(<PageRenderer pageData={pageData} isAdmin={false} language="pt-BR"
    isolatedSnapshot readOnlyExperiment experimentalOverrides={diagnosticOverrides} />);
  const container = document.createElement('div');
  container.innerHTML = markup;
  return container;
}

describe('p.21 isolated diagnostic workflow', () => {
  it('keeps failed PT blocks blank while preserving source art and the separate proposal', () => {
    const viewer = renderDiagnosticViewer();
    expect(viewer.querySelector('img[src="/pages/page_021/background.webp"]')).not.toBeNull();

    for (const suffix of ['2', '3']) {
      const key = `page_21_block_${suffix}__pt-BR`;
      const target = viewer.querySelector<HTMLElement>(`[data-rendered-translation-key="${key}"]`);
      expect(target, key).not.toBeNull();
      expect(target!.textContent, key).toBe('');
    }

    const blocked = proposal.candidates.find(candidate => candidate.spanKey === 'page_21_block_2__pt-BR')!;
    expect(blocked.sourceText).toContain('HINDERING:');
    expect(blocked.proposalText).toContain('DIFÍCIL:');
    expect(blocked.proposalText.length).toBeGreaterThan(100);
    expect(blocked.diagnosticData.segments.map(segment => segment.text ?? '').join('')).toBe('');
  });

  it('opens the blank source block in the Editor, preserves EN on Cancel, and performs no persistence', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const storageRead = vi.spyOn(Storage.prototype, 'getItem');
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const saveSpy = vi.fn();
    const draftSpy = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<PageRenderer pageData={pageData} isAdmin language="pt-BR" isolatedSnapshot readOnlyExperiment
          experimentalOverrides={diagnosticOverrides} experimentalEditorMode
          experimentalEditorOverrides={diagnosticOverrides} experimentalEditorSelectionKey={selectedKey}
          onExperimentalEditorSave={saveSpy} onExperimentalEditorDraftChange={draftSpy} />);
      });

      const queries = getQueriesForElement(container);
      const editor = container.querySelector('.rse-overlay');
      expect(editor).not.toBeNull();
      expect(editor!.textContent).toContain('HINDERING: Attacks made through or into Hindering Terrain');
      expect(editor!.querySelector('.rse-context-source')?.textContent).toContain('HINDERING:');

      await act(async () => {
        const editText = [...editor!.querySelectorAll('button')].find(button => button.textContent?.includes('Edit Text'))!;
        fireEvent.click(editText);
      });
      const textarea = queries.getByRole('textbox') as HTMLTextAreaElement;
      await act(async () => fireEvent.change(textarea, { target: { value: 'rascunho temporário' } }));
      await act(async () => fireEvent.click(queries.getByRole('button', { name: /Cancelar/u })));
      expect(container.querySelector('textarea')).toBeNull();
      expect(saveSpy).not.toHaveBeenCalled();

      // The editor stays open after Cancel; the in-memory diagnostic override
      // remains blank and no Apply/save action is invoked.
      expect(container.querySelector('.rse-overlay')).not.toBeNull();
      expect(container.querySelector(`[data-rendered-translation-key="${selectedKey}__pt-BR"]`)?.textContent).toBe('');
      expect(storageRead).not.toHaveBeenCalled();
      expect(storageWrite).not.toHaveBeenCalled();
      expect(fetchSpy.mock.calls.every(([input, init]) => {
        const url = String(input);
        const method = String((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
        return !url.includes('/api/translations') || method === 'GET';
      })).toBe(true);
      expect(proposal.candidates.find(candidate => candidate.spanKey === 'page_21_block_2__pt-BR')?.proposalText)
        .toContain('DIFÍCIL:');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
