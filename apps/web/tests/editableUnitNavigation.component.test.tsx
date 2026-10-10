import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getQueriesForElement } from '@testing-library/dom';
import { createRoot, type Root } from 'react-dom/client';
import { getEditableNavigationIndex, getEditableNavigationTargets } from '../src/editableUnitNavigation';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { localOverridesStorageKey, saveLocalOverrides } from '../src/localPersistence';
import type { SpanOverride } from '../src/components/RichSpanEditor';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function pageWithTwoBlocks(pageNumber = 40): PageData {
  const makeBlock = (index: number, text: string) => ({
    id: `block_${index}`,
    editorKey: `p${pageNumber}-editorial-${index}`,
    bbox: [40, 60 + index * 40, 400, 82 + index * 40] as [number, number, number, number],
    layoutFrame: { x: 40, width: 360 },
    lines: [{
      id: `line_${index}`,
      bbox: [40, 60 + index * 40, 400, 82 + index * 40] as [number, number, number, number],
      spans: [{
        text,
        font: 'OptimaLTStd',
        size: 12,
        color: '#231f20',
        flags: 0,
        bbox: [40, 60 + index * 40, 120, 82 + index * 40] as [number, number, number, number],
      }],
    }],
  });
  return {
    page_number: pageNumber,
    width: 820,
    height: 1160,
    images: [],
    blocks: [makeBlock(0, 'First paragraph'), makeBlock(1, 'Second paragraph')],
  };
}

describe('editable unit navigation targets', () => {
  it('keeps DOM editorial order, prefers child units, and skips hidden/ghost targets', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-editable-unit-key="parent">
        <button data-editable-unit-key="heading"></button>
        <button data-editable-unit-key="body"></button>
      </div>
      <button data-editable-unit-key="body"></button>
      <button data-editable-unit-key="hidden" hidden></button>
      <div data-editable-unit-key="ghost"><span data-source-line-id="x" data-ghost-status="confirmed-duplicate"></span></div>
      <span aria-hidden="true" data-editable-unit-key="art"></span>
      <button data-editable-unit-key="example"></button>`;

    const targets = getEditableNavigationTargets(root);
    expect(targets.map(target => target.dataset.editableUnitKey)).toEqual(['heading', 'body', 'example']);
    expect(getEditableNavigationIndex(targets, 'body')).toBe(1);
    expect(getEditableNavigationIndex(targets, 'missing')).toBe(-1);
  });

  it('follows current editorial hierarchy on p.13, p.24, p.37, and p.78', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const expected: Record<number, string[]> = {
      13: ['p13-new-story-flag-label', 'p13-new-story-flag-body'],
      24: ['p24-block-36-heading-size-12pt', 'p24-block-36-body-size-10pt', 'p24-discipline-learning-body', 'p24-discipline-learning-example'],
      37: ['p37-block-17-first-size-12pt', 'p37-block-17-remaining-size-10pt', 'p37-block-18-heading', 'p37-block-18-body', 'p37-block-20-heading', 'p37-block-20-body'],
      78: ['p78-gigas-grip-equip-1hand-body', 'p78-gigas-grip-equip-1hand-example'],
    };
    try {
      for (const [pageText, ids] of Object.entries(expected)) {
        const page = Number(pageText);
        const pageId = page.toString().padStart(3, '0');
        const pageData = JSON.parse(readFileSync(join(process.cwd(), `public/pages/page_${pageId}/page_${pageId}_dom.json`), 'utf8')) as PageData;
        const expectedIds = new Set(ids);
        let representativeData: PageData = {
          ...pageData,
          blocks: pageData.blocks.filter(block => block.typographicUnits?.some(unit => expectedIds.has(unit.id))),
        };
        if (page === 78) {
          const sidecar = JSON.parse(readFileSync(join(process.cwd(), 'public/pages/page_078/inline_elements.json'), 'utf8')) as { elements: SourceInlineElement[] };
          representativeData = {
            ...representativeData,
            blocks: attachSourceInlineElements(representativeData.blocks, sidecar.elements),
            inlineElements: sidecar.elements,
          };
        }
        await act(async () => { root.render(<PageRenderer pageData={representativeData} isAdmin language="en" />); });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        const keys = getEditableNavigationTargets(container).map(target => target.dataset.editableUnitKey);
        const expectedKeys = ids.map(id => `page_${page}_unit_${id}__en`);
        const indexes = expectedKeys.map(key => keys.indexOf(key));
        expect(indexes.every(index => index >= 0), `p.${page} expected units should be edit targets`).toBe(true);
        expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
        if (page === 78) {
          const body = container.querySelector<HTMLElement>('[data-editable-unit-key="page_78_unit_p78-gigas-grip-equip-1hand-body__en"]');
          const example = container.querySelector<HTMLElement>('[data-editable-unit-key="page_78_unit_p78-gigas-grip-equip-1hand-example__en"]');
          const inlineSymbolCount = representativeData.blocks
            .flatMap(block => block.lines ?? [])
            .flatMap(line => line.spans)
            .filter(span => span.semanticSymbolId).length;
          expect(inlineSymbolCount).toBeGreaterThan(0);
          const richRunStyles = Array.from(example?.querySelectorAll('text') ?? [], run => run.getAttribute('style') ?? '');
          expect(richRunStyles.some(style => style.includes('font-weight: 700'))).toBe(true);
          expect(richRunStyles.some(style => style.includes('font-style: italic'))).toBe(true);
        }
      }
    } finally {
      await act(async () => root.unmount());
      container.remove();
      localStorage.clear();
      vi.unstubAllGlobals();
    }
  });
});

describe.each(['en', 'pt-BR'] as const)('PageRenderer editable navigation draft safety (%s)', language => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([], this as unknown as ResizeObserver); }
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.classList?.contains('page-container') ? 820 : 0;
      const height = this.classList?.contains('page-container') ? 1160 : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('navigates between real editor targets and asks before discarding a dirty draft', async () => {
    const onDraftDirtyChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={pageWithTwoBlocks()} isAdmin language={language}
        onTranslationDraftDirtyChange={onDraftDirtyChange} />);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const firstKey = `p40-editorial-0__${language}`;
    const secondKey = `p40-editorial-1__${language}`;
    const firstTarget = container.querySelector<HTMLElement>(`[data-editable-unit-key="${firstKey}"]`);
    expect(firstTarget).not.toBeNull();
    await act(async () => firstTarget!.click());
    const queries = getQueriesForElement(container);
    await act(async () => { fireEvent.click(queries.getByText('📝 Edit Text')); });
    const textarea = queries.getByRole('textbox') as HTMLTextAreaElement;
    await act(async () => { fireEvent.change(textarea, { target: { value: 'First paragraph edited' } }); });
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(true);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const nextButton = queries.getByRole('button', { name: 'Próxima →' });
    await act(async () => { fireEvent.click(nextButton); });
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(container.querySelector('.rse-subtitle code')?.textContent).toBe(firstKey);
    expect((queries.getByRole('textbox') as HTMLTextAreaElement).value).toBe('First paragraph edited');

    confirmSpy.mockReturnValue(true);
    await act(async () => { fireEvent.click(nextButton); });
    expect(container.querySelector('.rse-subtitle code')?.textContent).toBe(secondKey);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);
    expect(localStorage.length).toBe(0);
    await act(async () => { fireEvent.click(queries.getByRole('button', { name: '← Anterior' })); });
    expect(container.querySelector('.rse-subtitle code')?.textContent).toBe(firstKey);
  });

  it('selects the boundary unit only after a cross-page destination is rendered', async () => {
    const onResolved = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={pageWithTwoBlocks(41)} isAdmin language={language}
        pendingEditableNavigation={{ id: 1, direction: 'next', targetPage: 41 }}
        onResolveEditableNavigation={onResolved} />);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector('.rse-subtitle code')?.textContent).toBe(`p41-editorial-0__${language}`);
    expect(onResolved).toHaveBeenCalledWith(1, true);

    await act(async () => root!.unmount());
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={pageWithTwoBlocks(41)} isAdmin language={language}
        pendingEditableNavigation={{ id: 2, direction: 'previous', targetPage: 41 }}
        onResolveEditableNavigation={onResolved} />);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector('.rse-subtitle code')?.textContent).toBe(`p41-editorial-1__${language}`);
    expect(onResolved).toHaveBeenCalledWith(2, true);
  });

  it('clears the source-page editor before requesting the next page', async () => {
    const onRequest = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={pageWithTwoBlocks(40)} isAdmin language={language}
        onRequestEditablePageNavigation={onRequest} />);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const lastKey = `p40-editorial-1__${language}`;
    await act(async () => {
      container!.querySelector<HTMLElement>(`[data-editable-unit-key="${lastKey}"]`)!.click();
    });
    const queries = getQueriesForElement(container);
    await act(async () => { fireEvent.click(queries.getByRole('button', { name: 'Próxima →' })); });
    expect(onRequest).toHaveBeenCalledWith('next', 40);
    expect(container.querySelector('.rse-panel')).toBeNull();
  });

  it('keeps an unsynced saved override and does not save while navigating', async () => {
    const firstKey = `p40-editorial-0__${language}`;
    const secondKey = `p40-editorial-1__${language}`;
    const savedOverride: SpanOverride = {
      spanKey: secondKey,
      segments: [{ text: 'Locally pending paragraph', font: 'OptimaLTStd', size: 12,
        color: '#231f20', weight: 400, style: 'normal' }],
      bbox: [40, 100, 400, 122],
    };
    saveLocalOverrides(language, new Map([[secondKey, savedOverride]]));
    const storageKey = localOverridesStorageKey(language);
    const storageBefore = localStorage.getItem(storageKey);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={pageWithTwoBlocks()} isAdmin language={language} />);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => {
      container!.querySelector<HTMLElement>(`[data-editable-unit-key="${firstKey}"]`)!.click();
    });
    const queries = getQueriesForElement(container);
    await act(async () => { fireEvent.click(queries.getByRole('button', { name: 'Próxima →' })); });
    expect(container.querySelector('.rse-subtitle code')?.textContent).toBe(secondKey);
    expect(container.querySelector('.rse-context-status')?.textContent).toContain('SINCRONIZAÇÃO PENDENTE');
    expect(localStorage.getItem(storageKey)).toBe(storageBefore);
  });

  it('disables previous at the first unit and next at the last document unit', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    for (const [page, blockIndex, expectedDisabledButton] of [
      [1, 0, '← Anterior'],
      [102, 1, 'Próxima →'],
    ] as const) {
      await act(async () => { root!.render(<PageRenderer pageData={pageWithTwoBlocks(page)} isAdmin language={language} />); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      const key = `p${page}-editorial-${blockIndex}__${language}`;
      await act(async () => {
        container!.querySelector<HTMLElement>(`[data-editable-unit-key="${key}"]`)!.click();
      });
      const queries = getQueriesForElement(container);
      expect(queries.getByRole('button', { name: expectedDisabledButton }).hasAttribute('disabled')).toBe(true);
    }
  });

  it('keeps deliberate navigation shortcuts out of text editing and moves when focus is outside', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(<PageRenderer pageData={pageWithTwoBlocks()} isAdmin language={language} />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const firstKey = `p40-editorial-0__${language}`;
    const secondKey = `p40-editorial-1__${language}`;
    await act(async () => {
      container!.querySelector<HTMLElement>(`[data-editable-unit-key="${firstKey}"]`)!.click();
    });
    await act(async () => { fireEvent.click(getQueriesForElement(container).getByText('📝 Edit Text')); });
    const textarea = getQueriesForElement(container).getByRole('textbox');
    await act(async () => { fireEvent.keyDown(textarea, { key: 'ArrowDown', altKey: true, shiftKey: true }); });
    expect(container.querySelector('.rse-subtitle code')?.textContent).toBe(firstKey);

    await act(async () => { fireEvent.click(getQueriesForElement(container).getByRole('button', { name: '✕' })); });
    await act(async () => {
      container!.querySelector<HTMLElement>(`[data-editable-unit-key="${firstKey}"]`)!.click();
    });
    const shortcutEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown', altKey: true, shiftKey: true, bubbles: true, cancelable: true,
    });
    await act(async () => { document.body.dispatchEvent(shortcutEvent); });
    expect(shortcutEvent.defaultPrevented).toBe(true);
    expect(container.querySelector('.rse-subtitle code')?.textContent).toBe(secondKey);
  });
});
