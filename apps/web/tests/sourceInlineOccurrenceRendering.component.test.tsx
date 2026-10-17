import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, getQueriesForElement } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { editableTextForSegments } from '../src/symbols/inlineCodec';
import { getDefaultSymbolAliasPreferences, getSemanticSymbol } from '../src/symbols/semanticSymbols';
import { SemanticSymbol } from '../src/symbols/SemanticSymbol';
import type { SpanOverride } from '../src/components/RichSpanEditor';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountLive(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  const queries = getQueriesForElement(container);
  return {
    container,
    ...queries,
    unmount: () => { act(() => root.unmount()); container.remove(); },
  };
}

function readSourcePage(pageNumber: number) {
  const pageDir = join(process.cwd(), 'public/pages', `page_${String(pageNumber).padStart(3, '0')}`);
  const page = JSON.parse(readFileSync(join(pageDir, `page_${String(pageNumber).padStart(3, '0')}_dom.json`), 'utf8')) as PageData;
  const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
  return { page: { ...page, blocks: attachSourceInlineElements(page.blocks, elements), inlineElements: elements }, elements };
}

describe('source inline occurrence rendering', () => {
  it('reserves localized label expansion in the inline slot', () => {
    const symbol = getSemanticSymbol('tag.discard')!;
    const sourceMetrics = { widthEm: symbol.render.widthEm, heightEm: 1, verticalAlignEm: .5 };
    expect(symbol.render.localized!['pt-BR'].widthEm).toBeGreaterThan(symbol.render.widthEm);

    const markup = renderToStaticMarkup(<SemanticSymbol id={symbol.id} language="pt-BR" size={9} metrics={sourceMetrics} />);
    const rendered = document.createElement('div');
    rendered.innerHTML = markup;
    const slot = rendered.querySelector('.inline-semantic-symbol-slot') as HTMLElement;
    const ink = rendered.querySelector('.inline-semantic-symbol') as SVGElement;
    expect(Number.parseFloat(slot.style.width)).toBeCloseTo(Number.parseFloat(ink.style.width), 3);

    const explicitAdvance = 8.5;
    const explicitMarkup = renderToStaticMarkup(<SemanticSymbol id={symbol.id} language="pt-BR" size={9}
      metrics={{ ...sourceMetrics, advanceEm: explicitAdvance }} />);
    const explicitRendered = document.createElement('div');
    explicitRendered.innerHTML = explicitMarkup;
    const explicitSlot = explicitRendered.querySelector('.inline-semantic-symbol-slot') as HTMLElement;
    expect(Number.parseFloat(explicitSlot.style.width)).toBeCloseTo(9 * explicitAdvance, 3);
  });

  it('paints dice.white when a component raster omits its PDF vector', () => {
    for (const pageNumber of [57, 64]) {
      const { page, elements } = readSourcePage(pageNumber);
      const sourceDie = elements.find(element => element.symbolId === 'dice.white');

      expect(sourceDie, `p.${pageNumber} dice.white occurrence`).toBeDefined();
      expect(sourceDie?.sourceRendering).toBe('semantic-inline');

      const line = page.blocks
        .find(block => block.id === sourceDie?.anchor.blockId)?.lines
        ?.find(candidate => candidate.id === sourceDie?.anchor.lineId);
      const sourceSpan = line?.spans.find(span => span.semanticSymbolId === 'dice.white');
      expect(sourceSpan?.sourceRendering).toBe('semantic-inline');

      const markup = renderToStaticMarkup(<PageRenderer pageData={page} isAdmin={false} language="en" />);
      const rendered = document.createElement('div');
      rendered.innerHTML = markup;
      const sourceSymbol = rendered.querySelector('[data-source-inline-semantic="dice.white"]');
      expect(sourceSymbol, `p.${pageNumber} source inline slot`).not.toBeNull();
      expect(sourceSymbol?.querySelector('svg[data-symbol-id="dice.white"]')).not.toBeNull();
    }
  });

  it('hides a managed source icon when its override intentionally removes it', () => {
    const sourceElement: SourceInlineElement = {
      symbolId: 'dice.white',
      sourceRendering: 'semantic-inline',
      bbox: [35, 10, 45, 20],
      anchor: { blockId: 'block_1', blockIndex: 0, lineId: 'line_1', spanIndex: 0, side: 'after', sizePt: 10 },
      metrics: { widthEm: 1, heightEm: 1, advanceEm: 1, sourceAppearanceKey: 'source-die-white' },
      mask: { url: '/mask.png', bbox: [34, 9, 46, 21] },
    };
    const sourcePage: PageData = {
      page_number: 1, width: 100, height: 100, images: [], backgroundUrl: '/background.webp',
      blocks: attachSourceInlineElements([{
        id: 'block_1', bbox: [0, 10, 80, 24], lines: [{
          id: 'line_1', dir: [1, 0], bbox: [0, 10, 80, 24], spans: [{
            text: 'WHITE  7', font: 'OptimaLTStd', size: 10, color: '#fff', flags: 0,
            bbox: [0, 10, 35, 24], origin: [0, 20],
          }],
        }],
      }], [sourceElement]),
      inlineElements: [sourceElement],
    };
    const ownerKey = 'page_1_block_0';
    const removed: SpanOverride = {
      spanKey: ownerKey,
      bbox: [0, 10, 80, 24],
      segments: [{ text: 'WHITE  7', font: 'OptimaLTStd', size: 10, color: '#fff', weight: 400, style: 'normal' }],
      managedSourceSymbols: ['dice.white'],
    };
    const render = (overrides: ReadonlyMap<string, SpanOverride>) => {
      const markup = renderToStaticMarkup(<PageRenderer pageData={sourcePage} isAdmin={false} language="en"
        isolatedSnapshot readOnlyExperiment experimentalOverrides={overrides} />);
      const container = document.createElement('div');
      container.innerHTML = markup;
      return container;
    };

    expect(render(new Map()).querySelector('[data-source-inline-semantic="dice.white"]')).not.toBeNull();
    const edited = render(new Map([[ownerKey, removed]]));
    expect(edited.querySelector('[data-source-inline-semantic="dice.white"]')).toBeNull();
    expect(edited.querySelectorAll('[data-source-inline-semantic="dice.white"], svg[data-symbol-id="dice.white"], img[data-symbol-id="dice.white"]'))
      .toHaveLength(0);
  });

  it('hides a deleted source icon in an inline-unit preview', () => {
    const sourceElement: SourceInlineElement = {
      symbolId: 'dice.white',
      sourceRendering: 'semantic-inline',
      coveredSourceText: { lineId: 'line_1', spanIndex: 0, text: 'A' },
      bbox: [20, 10, 30, 20],
      anchor: { blockId: 'block_1', blockIndex: 0, lineId: 'line_1', spanIndex: 0, side: 'before', sizePt: 10,
        ownerSpanRef: { lineId: 'line_1', spanIndex: 0 } },
      metrics: { widthEm: 1, heightEm: 1, advanceEm: 1, sourceAppearanceKey: 'source-die-white' },
      mask: { url: '/mask.png', bbox: [19, 9, 31, 21] },
    };
    const ownerKey = 'page_1_unit_unit-1__en';
    const sourcePage: PageData = {
      page_number: 1, width: 100, height: 100, images: [], backgroundUrl: '/background.webp',
      blocks: attachSourceInlineElements([{
        id: 'block_1', bbox: [0, 10, 80, 24],
        typographicSpanUnits: [{ id: 'unit-1', spanRefs: ['line_1:0'] }],
        lines: [{
          id: 'line_1', dir: [1, 0], bbox: [0, 10, 80, 24], availableX: 0, availableWidth: 80,
          spans: [{ text: 'A', font: 'OptimaLTStd-Bold', size: 10, color: '#231f20', flags: 0,
            bbox: [20, 10, 27, 20], origin: [20, 19] }],
        }],
      }], [sourceElement]),
      inlineElements: [sourceElement],
    };
    const removed: SpanOverride = {
      spanKey: ownerKey,
      bbox: [0, 10, 80, 24],
      segments: [],
      managedSourceSymbols: ['dice.white'],
    };
    const render = (override?: SpanOverride) => {
      const markup = renderToStaticMarkup(<PageRenderer pageData={sourcePage} isAdmin={false} language="en"
        isolatedSnapshot readOnlyExperiment experimentalOverrides={override ? new Map([[ownerKey, override]]) : new Map()} />);
      const rendered = document.createElement('div');
      rendered.innerHTML = markup;
      return rendered;
    };

    expect(render().querySelectorAll('svg[data-symbol-id="dice.white"]')).toHaveLength(1);
    expect(render(removed).querySelector('[data-source-inline-semantic="dice.white"]')).toBeNull();
    expect(render(removed).querySelectorAll('svg[data-symbol-id="dice.white"]')).toHaveLength(0);
    const reinserted = render({ ...removed, segments: [{ text: '\uFFFC', symbolId: 'dice.white', font: 'OptimaLTStd',
      size: 10, color: '#231f20', weight: 400, style: 'normal' }] });
    expect(reinserted.querySelectorAll('svg[data-symbol-id="dice.white"]')).toHaveLength(1);
  });

  it('wraps saved typographic-span overrides inside their source width and tracks the next line boundary', () => {
    const { page } = readSourcePage(47);
    const key = 'page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR';
    const override: SpanOverride = {
      spanKey: key,
      bbox: [104.1732, 332.6525, 399.7734, 366.5525],
      segments: [{
        text: 'Salvo indicação em contrário, as Habilidades que exigem Símbolos podem ser usadas sem limite enquanto a figura tiver recursos suficientes.',
        font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal',
      }],
    };
    const markup = renderToStaticMarkup(<PageRenderer pageData={page} isAdmin language="pt-BR"
      isolatedSnapshot readOnlyExperiment experimentalOverrides={new Map([[key, override]])} />);
    const rendered = document.createElement('div');
    rendered.innerHTML = markup;

    const unit = rendered.querySelector<HTMLElement>('[data-inline-unit-flow-key="page_47_unit_p47-block-20-font-size-10pt-unit-06__pt-BR"]');
    const nextSourceLine = page.blocks.find(block => block.id === 'block_20')?.lines?.find(line => line.id === 'line_20_9');
    expect(unit).not.toBeNull();
    expect(unit?.style.whiteSpace).toBe('pre-wrap');
    expect(unit?.style.minWidth).toBe('0');
    expect(unit?.style.display).toBe('inline-block');
    expect(unit?.style.boxSizing).toBe('border-box');
    const sourceLine = page.blocks.find(block => block.id === 'block_20')?.lines?.find(line => line.id === 'line_20_6');
    const lineElement = unit?.parentElement as HTMLElement;
    const scale = Number.parseFloat(lineElement.style.width) / sourceLine!.availableWidth!;
    const expectedWidth = ((sourceLine!.availableX! + sourceLine!.availableWidth! - sourceLine!.spans[0].origin![0]) * scale) - 12;
    expect(Number.parseFloat(unit!.style.width)).toBeCloseTo(expectedWidth, 2);
    expect(Number.parseFloat(unit!.style.maxWidth)).toBeCloseTo(expectedWidth, 2);
    expect(expectedWidth).toBeLessThan(Number.parseFloat(lineElement.style.width));
    expect(unit?.firstElementChild).not.toBeNull();
    expect((unit?.firstElementChild as HTMLElement).style.whiteSpace).toBe('pre-wrap');
    expect(Number(unit?.dataset.inlineUnitFlowBottomPt)).toBeCloseTo(nextSourceLine!.bbox[1], 3);
  });

  it('uses the remaining source-line width when a translation unit starts on an inline symbol', () => {
    const { page } = readSourcePage(100);
    const key = 'page_100_unit_p100-refresh-first-turn-important-note__pt-BR';
    const sourceBlock = page.blocks.find(block => block.id === 'block_27')!;
    const sourceGlyph = sourceBlock.lines!.find(line => line.id === 'line_27_0')!.spans[0];
    const override: SpanOverride = {
      spanKey: key,
      bbox: [452.9832, 220.6442, 760.999, 241.4073],
      segments: [
        { text: '\uFFFC', symbolId: 'tag.important.icon', font: 'OptimaLTStd', size: 9, color: '#231f20', weight: 400, style: 'normal' },
        { text: 'IMPORTANTE: Aventureiros não recebem SP.', font: 'OptimaLTStd', size: 9, color: '#231f20', weight: 400, style: 'normal' },
      ],
      managedSourceSymbols: ['tag.important.icon'],
    };
    const markup = renderToStaticMarkup(<PageRenderer pageData={page} isAdmin={false} language="pt-BR"
      isolatedSnapshot readOnlyExperiment experimentalOverrides={new Map([[key, override]])} />);
    const rendered = document.createElement('div');
    rendered.innerHTML = markup;

    const unit = rendered.querySelector<HTMLElement>(`[data-inline-unit-flow-key="${key}"]`);
    expect(unit).not.toBeNull();
    expect(unit?.parentElement?.dataset.sourceLineId).toBe('line_27_0');
    expect(unit?.style.flex).toBe(`0 1 ${unit?.style.width}`);
    expect(Number.parseFloat(unit!.style.width)).toBeGreaterThan((sourceGlyph.bbox[2] - sourceGlyph.bbox[0]) * 4);
    expect(unit?.textContent).toContain('IMPORTANTE: Aventureiros não recebem SP.');
    expect(rendered.querySelectorAll('svg[data-symbol-id="tag.important.icon"]')).toHaveLength(1);
  });

  it('keeps the real p.83 reference marker synchronized through normal override hydration and Editor draft', async () => {
    const pageDir = join(process.cwd(), 'public/pages/page_083');
    const proofDir = join(process.cwd(), '../../output/proofs/translation-readiness-2026-10-14/p083-isolated-rendered-export-v1/patched/pages/page_083');
    const rawPage = JSON.parse(readFileSync(join(pageDir, 'page_083_dom.json'), 'utf8')) as PageData;
    const proofElements = JSON.parse(readFileSync(join(proofDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const marker = proofElements.find(element => element.symbolId === 'marker.reference.a');
    expect(marker).toBeDefined();
    const page: PageData = {
      ...rawPage,
      blocks: attachSourceInlineElements(rawPage.blocks, proofElements),
      inlineElements: proofElements,
    };
    const editorKey = 'page_83_unit_p83-block-4-font-size-9pt-unit-01__en';
    const storageKey = 'middara-lines-v2-en';
    const previousLocalOverrides = window.localStorage.getItem(storageKey);
    window.localStorage.setItem(storageKey, '[]');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ docs: [] }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const view = mountLive(<PageRenderer pageData={page} isAdmin language="en" />);
    try {
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      const pageCanvas = () => view.container.querySelector('.page-container')!;
      const markerCount = () => pageCanvas().querySelectorAll('svg[data-symbol-id="marker.reference.a"]').length;
      const hitTarget = view.container.querySelector(`[data-source-inline-hit-target="${editorKey}"]`);
      expect(hitTarget).not.toBeNull();
      expect(markerCount()).toBe(1);
      act(() => fireEvent.click(hitTarget!));
      act(() => fireEvent.click(view.getByText('📝 Edit Text')));
      const textarea = view.getByRole('textbox') as HTMLTextAreaElement;
      const token = '[[reference-a]]';
      const tokenStart = textarea.value.indexOf(token);
      expect(tokenStart, textarea.value).toBeGreaterThanOrEqual(0);
      textarea.setSelectionRange(tokenStart, tokenStart + token.length);
      act(() => {
        fireEvent.select(textarea);
        fireEvent.keyDown(textarea, { key: 'Delete' });
      });
      expect(textarea.value).not.toContain(token);
      expect(markerCount(), view.container.innerHTML).toBe(0);
      expect(pageCanvas().textContent).toContain('Nightingale');

      textarea.setSelectionRange(tokenStart, tokenStart);
      act(() => {
        fireEvent.select(textarea);
        fireEvent.change(textarea, { target: {
          value: `${textarea.value.slice(0, tokenStart)}${token}${textarea.value.slice(tokenStart)}`,
          selectionStart: tokenStart + token.length,
          selectionEnd: tokenStart + token.length,
        } });
      });
      expect(markerCount()).toBe(1);
      act(() => fireEvent.click(view.getByText('Cancel')));
      expect(markerCount()).toBe(1);
      expect(view.queryByRole('textbox')).toBeNull();
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
      if (previousLocalOverrides === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, previousLocalOverrides);
    }
  });

  it('keeps the real p.83 Blue Totem synchronized through normal override hydration and Editor draft', async () => {
    const pageDir = join(process.cwd(), 'public/pages/page_083');
    const proofDir = join(process.cwd(), '../../output/proofs/translation-readiness-2026-10-14/p083-isolated-rendered-export-v1/patched/pages/page_083');
    const rawPage = JSON.parse(readFileSync(join(pageDir, 'page_083_dom.json'), 'utf8')) as PageData;
    const proofElements = JSON.parse(readFileSync(join(proofDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const blueTotem = proofElements.find(element => element.symbolId === 'token.blue-totem');
    expect(blueTotem?.provenance?.candidateId).toBe('p083-i3');
    const page: PageData = {
      ...rawPage,
      blocks: attachSourceInlineElements(rawPage.blocks, proofElements),
      inlineElements: proofElements,
    };
    const editorKey = 'page_83_unit_p83-block-4-font-size-10pt-unit-03__en';
    const storageKey = 'middara-lines-v2-en';
    const previousLocalOverrides = window.localStorage.getItem(storageKey);
    window.localStorage.setItem(storageKey, '[]');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ docs: [] }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const view = mountLive(<PageRenderer pageData={page} isAdmin language="en" />);
    try {
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      const pageCanvas = () => view.container.querySelector('.page-container')!;
      const blueTotemCount = () => pageCanvas().querySelectorAll('svg[data-symbol-id="token.blue-totem"]').length;
      const hitTarget = view.container.querySelector(`[data-source-inline-hit-target="${editorKey}"]`);
      expect(hitTarget).not.toBeNull();
      expect(blueTotemCount()).toBe(1);
      act(() => fireEvent.click(hitTarget!));
      act(() => fireEvent.click(view.getByText('📝 Edit Text')));
      const textarea = view.getByRole('textbox') as HTMLTextAreaElement;
      const token = '[[blue-totem]]';
      const tokenStart = textarea.value.indexOf(token);
      expect(tokenStart, textarea.value).toBeGreaterThanOrEqual(0);
      textarea.setSelectionRange(tokenStart, tokenStart + token.length);
      act(() => {
        fireEvent.select(textarea);
        fireEvent.keyDown(textarea, { key: 'Delete' });
      });
      expect(textarea.value).not.toContain(token);
      expect(blueTotemCount(), view.container.innerHTML).toBe(0);
      expect(pageCanvas().textContent).toContain('Adventure Book for the');

      textarea.setSelectionRange(tokenStart, tokenStart);
      act(() => {
        fireEvent.select(textarea);
        fireEvent.change(textarea, { target: {
          value: `${textarea.value.slice(0, tokenStart)}${token}${textarea.value.slice(tokenStart)}`,
          selectionStart: tokenStart + token.length,
          selectionEnd: tokenStart + token.length,
        } });
      });
      expect(blueTotemCount()).toBe(1);
      act(() => fireEvent.click(view.getByText('Cancel')));
      expect(blueTotemCount()).toBe(1);
      expect(view.queryByRole('textbox')).toBeNull();
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
      if (previousLocalOverrides === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, previousLocalOverrides);
    }
  });

  it('keeps a source marker synchronized through the normal Editor draft, reinsert, undo/redo, and discard', async () => {
    const symbolId = 'marker.reference.a';
    const sourceElement: SourceInlineElement = {
      symbolId,
      sourceRendering: 'semantic-inline',
      coveredSourceText: { lineId: 'p83-line-1', spanIndex: 0, text: 'A' },
      bbox: [30, 10, 39, 19],
      anchor: { blockId: 'p83-block-4', blockIndex: 0, lineId: 'p83-line-1', spanIndex: 0, side: 'before', sizePt: 9,
        ownerSpanRef: { lineId: 'p83-line-1', spanIndex: 0 } },
      metrics: { widthEm: 1, heightEm: 1, advanceEm: 1, sourceAppearanceKey: 'p83-reference-a' },
      mask: { url: '/isolated-p83-reference-a-mask.png', bbox: [29, 9, 40, 20] },
    };
    const sourceBlock = {
      id: 'p83-block-4',
      bbox: [20, 10, 80, 26] as [number, number, number, number],
      typographicSpanUnits: [{ id: 'p83-block-4-font-size-9pt-unit-01', spanRefs: ['p83-line-1:0'] }],
      lines: [{
        id: 'p83-line-1', dir: [1, 0] as [number, number], bbox: [20, 10, 80, 21] as [number, number, number, number],
        availableX: 20, availableWidth: 60,
        spans: [
          { text: 'A', font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', flags: 0,
            bbox: [40, 10, 45, 20] as [number, number, number, number], origin: [40, 19] as [number, number] },
          { text: ' explains', font: 'OptimaLTStd', size: 9, color: '#231f20', flags: 0,
            bbox: [45, 10, 72, 20] as [number, number, number, number], origin: [45, 19] as [number, number] },
        ],
      }],
    };
    const page: PageData = {
      page_number: 83, width: 100, height: 100, images: [],
      blocks: attachSourceInlineElements([sourceBlock], [sourceElement]),
      inlineElements: [sourceElement],
    };
    const editorKey = 'page_83_unit_p83-block-4-font-size-9pt-unit-01__en';
    const tokenSegment = { text: '\uFFFC', symbolId, font: 'OptimaLTStd-Bold', size: 9, color: '#231f20', weight: 700, style: 'normal' as const };
    const editorToken = editableTextForSegments([tokenSegment], 'en', getDefaultSymbolAliasPreferences());
    const confirmBeforeClose = window.confirm;
    window.confirm = () => true;
    const view = mountLive(<PageRenderer pageData={page} isAdmin language="en" isolatedSnapshot />);

    try {
      await act(async () => { await Promise.resolve(); });
      const pageCanvas = () => view.container.querySelector('.page-container')!;
      const sourceSymbolCount = () => pageCanvas().querySelectorAll(`svg[data-symbol-id="${symbolId}"]`).length;
      const sourceSlot = () => pageCanvas().querySelector(`[data-source-inline-semantic="${symbolId}"]`);
      const markerPrecedesNeighborText = () => {
        const marker = sourceSlot();
        const neighbor = Array.from(pageCanvas().querySelectorAll('text, span'))
          .find(element => element.textContent?.trim() === 'explains');
        return !!marker && !!neighbor
          && Boolean(marker.compareDocumentPosition(neighbor) & Node.DOCUMENT_POSITION_FOLLOWING);
      };
      const sourceBbox = () => pageCanvas().querySelector(`svg[data-source-symbol-id="${symbolId}"]`)?.getAttribute('data-source-bbox');
      const expectedSourceBbox = sourceBbox();
      expect(sourceSymbolCount()).toBe(1);
      expect(view.container.textContent).toContain('explains');
      expect(sourceSlot()).not.toBeNull();
      expect(expectedSourceBbox).toBe('30,10,39,19');
      expect(markerPrecedesNeighborText()).toBe(true);

      const hitTarget = view.container.querySelector(`[data-source-inline-hit-target="${editorKey}"]`);
      expect(hitTarget).not.toBeNull();
      act(() => fireEvent.click(hitTarget!));
      act(() => fireEvent.click(view.getByText('📝 Edit Text')));
      const textarea = view.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value.startsWith(editorToken)).toBe(true);

      textarea.setSelectionRange(0, editorToken.length);
      act(() => {
        fireEvent.select(textarea);
        fireEvent.keyDown(textarea, { key: 'Delete' });
      });
      expect(textarea.value).toBe('');
      expect(sourceSymbolCount(), view.container.innerHTML).toBe(0);
      expect(pageCanvas().textContent).toContain('explains');

      // Reinsert by typing the editor's semantic token, then verify the draft
      // recognizes the semantic object, preserves its source slot, and paints once.
      textarea.setSelectionRange(0, 0);
      act(() => {
        fireEvent.select(textarea);
        fireEvent.change(textarea, { target: { value: editorToken, selectionStart: editorToken.length, selectionEnd: editorToken.length } });
      });
      expect(textarea.value).toBe(editorToken);
      expect(sourceSymbolCount()).toBe(1);
      expect(sourceSlot()).not.toBeNull();
      expect(markerPrecedesNeighborText()).toBe(true);
      expect(sourceBbox()).toBe(expectedSourceBbox);

      act(() => fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true }));
      expect(sourceSymbolCount()).toBe(0);
      act(() => fireEvent.keyDown(textarea, { key: 'y', ctrlKey: true }));
      expect(sourceSymbolCount()).toBe(1);

      // Cancel rewrite restores the original English source preview in memory.
      act(() => fireEvent.click(view.getByText('Cancel')));
      expect(sourceSymbolCount()).toBe(1);
      expect(view.queryByRole('textbox')).toBeNull();

      // A confirmed removal is still only a draft. Closing the normal editor
      // with discard restores the source symbol and never calls persistence.
      act(() => fireEvent.click(view.getByText('📝 Edit Text')));
      const secondTextarea = view.getByRole('textbox') as HTMLTextAreaElement;
      secondTextarea.setSelectionRange(0, editorToken.length);
      act(() => {
        fireEvent.select(secondTextarea);
        fireEvent.keyDown(secondTextarea, { key: 'Delete' });
      });
      act(() => fireEvent.click(view.getByText('Confirm')));
      expect(sourceSymbolCount()).toBe(0);
      act(() => fireEvent.click(view.container.querySelector('.rse-close')!));
      expect(sourceSymbolCount()).toBe(1);
    } finally {
      view.unmount();
      window.confirm = confirmBeforeClose;
    }
  });
});
