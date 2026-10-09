import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueriesForElement, fireEvent as dispatchEvent } from '@testing-library/dom';
import { createRoot } from 'react-dom/client';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';

const rawPageData = JSON.parse(readFileSync(
  join(process.cwd(), 'public/pages/page_078/page_078_dom.json'), 'utf8',
)) as PageData;
const inlineElements = JSON.parse(readFileSync(
  join(process.cwd(), 'public/pages/page_078/inline_elements.json'), 'utf8',
)) as { elements: SourceInlineElement[] };
const pageData: PageData = {
  ...rawPageData,
  // Match App.loadPageData(): source vectors must be attached before PageRenderer opens an editor.
  blocks: attachSourceInlineElements(rawPageData.blocks, inlineElements.elements),
  inlineElements: inlineElements.elements,
};
const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
  ok: false,
  status: 404,
  json: async () => ({ docs: [] }),
}));

const cleanups = new Set<() => void>();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fireEvent = new Proxy(dispatchEvent, {
  get(target, property: keyof typeof dispatchEvent) {
    const dispatch = target[property];
    return typeof dispatch === 'function' ? (...args: unknown[]) => act(() => dispatch(...args as Parameters<typeof dispatch>)) : dispatch;
  },
});
function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  const unmount = () => { act(() => root.unmount()); container.remove(); cleanups.delete(unmount); };
  cleanups.add(unmount);
  return { container, unmount, ...getQueriesForElement(container) };
}

function stubRangeClientRectsForJSDOM() {
  const prototype = Range.prototype as Range['prototype'] & { getClientRects?: () => DOMRectList };
  const previous = Object.getOwnPropertyDescriptor(prototype, 'getClientRects');
  if (typeof prototype.getClientRects !== 'function') {
    Object.defineProperty(prototype, 'getClientRects', { configurable: true, value: () => [] });
  }
  const restore = () => {
    if (previous) Object.defineProperty(prototype, 'getClientRects', previous);
    else delete prototype.getClientRects;
  };
  cleanups.add(restore);
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function requireMetrics(element: SourceInlineElement) {
  if (!element.metrics) throw new Error(`${element.symbolId} is missing source occurrence metrics`);
  return element.metrics;
}

describe('RichSpanEditor live PageRenderer preview', () => {
  it('returns a reverted source-equivalent EN draft to the source-line composition', async () => {
    stubRangeClientRectsForJSDOM();
    const initialStorage = JSON.stringify(Object.entries(window.localStorage));
    const view = render(<PageRenderer pageData={pageData} isAdmin language="en" />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    const spanKey = 'page_78_unit_p78-gigas-grip-equip-1hand-example__en';
    const sourceField = view.container.querySelector<HTMLElement>(`[data-admin-geometry-key="${spanKey}"]`);
    expect(sourceField).not.toBeNull();
    expect(sourceField!.querySelector('.realbox')).toBeNull();
    expect(sourceField!.querySelector('[data-source-line-id="line_18_3"]')).not.toBeNull();

    fireEvent.click(sourceField!);
    fireEvent.click(await view.findByText('📝 Edit Text'));
    const textarea = view.container.querySelector('.rse-edit-text textarea') as HTMLTextAreaElement;
    const sourceText = textarea.value;
    expect(sourceText.startsWith('Example:')).toBe(true);

    textarea.setSelectionRange(0, 1);
    fireEvent.select(textarea);
    fireEvent.keyUp(textarea);
    const withoutFirstCharacter = sourceText.slice(1);
    fireEvent.change(textarea, {
      target: { value: withoutFirstCharacter, selectionStart: 0, selectionEnd: 0 },
    });
    fireEvent.click(view.getByText('Confirm'));

    const editedField = view.container.querySelector<HTMLElement>(`[data-admin-geometry-key="${spanKey}"]`);
    expect(editedField?.querySelector('.realbox')).not.toBeNull();

    fireEvent.click(await view.findByText('📝 Edit Text'));
    const restoreTextarea = view.container.querySelector('.rse-edit-text textarea') as HTMLTextAreaElement;
    restoreTextarea.setSelectionRange(0, 0);
    fireEvent.select(restoreTextarea);
    fireEvent.keyUp(restoreTextarea);
    fireEvent.change(restoreTextarea, {
      target: { value: sourceText, selectionStart: 1, selectionEnd: 1 },
    });
    expect(restoreTextarea.value).toBe(sourceText);
    fireEvent.click(view.getByText('Confirm'));

    const restoredField = view.container.querySelector<HTMLElement>(`[data-admin-geometry-key="${spanKey}"]`);
    expect(restoredField?.querySelector('.realbox')).toBeNull();
    expect(restoredField?.querySelector('[data-source-line-id="line_18_3"]')).not.toBeNull();

    fireEvent.click(await view.findByText('📝 Edit Text'));
    const spaceTextarea = view.container.querySelector('.rse-edit-text textarea') as HTMLTextAreaElement;
    const sourceSpaceIndex = spaceTextarea.value.indexOf('Example:') + 'Example:'.length;
    const withExtraSpace = `${spaceTextarea.value.slice(0, sourceSpaceIndex)} ${spaceTextarea.value.slice(sourceSpaceIndex)}`;
    spaceTextarea.setSelectionRange(sourceSpaceIndex, sourceSpaceIndex);
    fireEvent.select(spaceTextarea);
    fireEvent.keyUp(spaceTextarea);
    fireEvent.change(spaceTextarea, {
      target: { value: withExtraSpace, selectionStart: sourceSpaceIndex + 1, selectionEnd: sourceSpaceIndex + 1 },
    });
    fireEvent.click(view.getByText('Confirm'));
    const whitespaceEditedField = view.container.querySelector<HTMLElement>(`[data-admin-geometry-key="${spanKey}"]`);
    expect(whitespaceEditedField?.querySelector('.realbox')).not.toBeNull();

    fireEvent.click(await view.findByText('📝 Edit Text'));
    const removeExtraSpaceTextarea = view.container.querySelector('.rse-edit-text textarea') as HTMLTextAreaElement;
    const extraSpaceIndex = removeExtraSpaceTextarea.value.indexOf('Example:') + 'Example:'.length;
    const withoutExtraSpace = `${removeExtraSpaceTextarea.value.slice(0, extraSpaceIndex)}${removeExtraSpaceTextarea.value.slice(extraSpaceIndex + 1)}`;
    removeExtraSpaceTextarea.setSelectionRange(extraSpaceIndex, extraSpaceIndex);
    fireEvent.select(removeExtraSpaceTextarea);
    fireEvent.keyUp(removeExtraSpaceTextarea);
    fireEvent.change(removeExtraSpaceTextarea, {
      target: { value: withoutExtraSpace, selectionStart: extraSpaceIndex, selectionEnd: extraSpaceIndex },
    });
    fireEvent.click(view.getByText('Confirm'));
    const whitespaceRestoredField = view.container.querySelector<HTMLElement>(`[data-admin-geometry-key="${spanKey}"]`);
    expect(whitespaceRestoredField?.querySelector('.realbox')).toBeNull();
    expect(whitespaceRestoredField?.querySelector('[data-source-line-id="line_18_3"]')).not.toBeNull();

    fireEvent.click(await view.findByText('📝 Edit Text'));
    const breakTextarea = view.container.querySelector('.rse-edit-text textarea') as HTMLTextAreaElement;
    const breakIndex = breakTextarea.value.indexOf('Example:') + 'Example:'.length;
    const withHardBreak = `${breakTextarea.value.slice(0, breakIndex)}\n${breakTextarea.value.slice(breakIndex)}`;
    breakTextarea.setSelectionRange(breakIndex, breakIndex);
    fireEvent.select(breakTextarea);
    fireEvent.keyUp(breakTextarea);
    fireEvent.change(breakTextarea, {
      target: { value: withHardBreak, selectionStart: breakIndex + 1, selectionEnd: breakIndex + 1 },
    });
    fireEvent.click(view.getByText('Confirm'));
    const hardBreakField = view.container.querySelector<HTMLElement>(`[data-admin-geometry-key="${spanKey}"]`);
    expect(hardBreakField?.querySelector('.realbox')).not.toBeNull();

    fireEvent.click(await view.findByText('📝 Edit Text'));
    const removeBreakTextarea = view.container.querySelector('.rse-edit-text textarea') as HTMLTextAreaElement;
    const restoredText = `${removeBreakTextarea.value.slice(0, breakIndex)}${removeBreakTextarea.value.slice(breakIndex + 1)}`;
    removeBreakTextarea.setSelectionRange(breakIndex, breakIndex + 1);
    fireEvent.select(removeBreakTextarea);
    fireEvent.keyUp(removeBreakTextarea);
    fireEvent.change(removeBreakTextarea, {
      target: { value: restoredText, selectionStart: breakIndex, selectionEnd: breakIndex },
    });
    fireEvent.click(view.getByText('Confirm'));
    const hardBreakRestoredField = view.container.querySelector<HTMLElement>(`[data-admin-geometry-key="${spanKey}"]`);
    expect(hardBreakRestoredField?.querySelector('.realbox')).toBeNull();
    expect(hardBreakRestoredField?.querySelector('[data-source-line-id="line_18_3"]')).not.toBeNull();
    expect(hardBreakRestoredField?.querySelector('[data-source-inline-semantic="attack.ranged"]')).not.toBeNull();
    expect(hardBreakRestoredField?.querySelector('[data-source-inline-semantic="attack.melee-ranged"]')).not.toBeNull();
    expect(JSON.stringify(Object.entries(window.localStorage))).toBe(initialStorage);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method.toUpperCase() === 'GET')).toBe(true);
  }, 15_000);

  it('keeps the source lightning SVG and white text outline when translating the p. 78 callout', async () => {
    const initialStorage = JSON.stringify(Object.entries(window.localStorage));
    const view = render(<PageRenderer pageData={pageData} isAdmin language="pt-BR" />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const sourceBlockIndex = pageData.blocks.findIndex(block => block.id === 'block_17');
    expect(sourceBlockIndex).toBeGreaterThanOrEqual(0);
    const sourceBlock = view.container.querySelector(`[data-admin-geometry-key="page_78_block_${sourceBlockIndex}"]`);
    expect(sourceBlock).not.toBeNull();
    fireEvent.click(sourceBlock!);

    fireEvent.click(await view.findByText('📝 Edit Text'));
    const textarea = view.container.querySelector('.rse-edit-text textarea') as HTMLTextAreaElement;
    expect(textarea.value).toContain('[[lightning]]IMPORTANT:');
    expect(textarea.value).toContain('[[sword]]');
    expect(textarea.value).toContain('[[arrow]]');
    const start = textarea.value.indexOf('IMPORTANT:');
    expect(start).toBeGreaterThanOrEqual(0);
    textarea.setSelectionRange(start, start + 'IMPORTANT:'.length);
    fireEvent.select(textarea);
    fireEvent.keyUp(textarea);
    const edited = textarea.value.slice(0, start) + 'IMPORTANTE:' + textarea.value.slice(start + 'IMPORTANT:'.length);
    fireEvent.change(textarea, { target: { value: edited, selectionStart: start + 'IMPORTANTE:'.length, selectionEnd: start + 'IMPORTANTE:'.length } });
    fireEvent.click(view.getByText('Confirmar'));

    const labelBox = Array.from(view.container.querySelectorAll('.realbox'))
      .find(element => element.textContent?.includes('IMPORTANTE:')) as HTMLDivElement | undefined;
    const redTextSpans = Array.from(labelBox?.querySelectorAll('span') ?? [])
      .filter(element => (element as HTMLElement).style.color === 'rgb(185, 29, 35)'
        && !!element.textContent && !!(element as HTMLElement).style.getPropertyValue('-webkit-text-stroke')) as HTMLSpanElement[];
    expect(redTextSpans.map(element => element.textContent).join('')).toContain('IMPORTANTE:');
    const isWhiteOutline = (value: string) => /(?:#ffffff|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/i.test(value);
    expect(redTextSpans.every(element => isWhiteOutline(element.style.getPropertyValue('-webkit-text-stroke')))).toBe(true);
    expect(redTextSpans.every(element => {
      const strokeWidth = Number.parseFloat(element.style.getPropertyValue('-webkit-text-stroke'));
      const fontSize = Number.parseFloat(element.style.fontSize);
      return Math.abs(strokeWidth / fontSize - 0.2) < 0.00001;
    })).toBe(true);

    const lightning = labelBox!.querySelector('svg[data-symbol-id="tag.important.icon"]');
    expect(lightning).not.toBeNull();
    expect(lightning!.querySelector('rect')).toBeNull();
    expect((lightning as SVGSVGElement).style.backgroundColor).toBe('');
    const lightningPaths = Array.from(lightning!.querySelectorAll('path'));
    expect(lightningPaths.some(path => path.getAttribute('fill') === '#ba1d23')).toBe(true);
    expect(lightningPaths.some(path => path.getAttribute('stroke') === '#ffffff')).toBe(true);
    for (const symbolId of ['attack.melee', 'attack.ranged']) {
      const vector = labelBox!.querySelector(`svg[data-symbol-id="${symbolId}"]`);
      expect(vector).not.toBeNull();
      expect(vector!.querySelector('rect')).toBeNull();
      expect((vector as SVGSVGElement).style.backgroundColor).toBe('');
    }

    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method.toUpperCase() === 'GET')).toBe(true);
    expect(JSON.stringify(Object.entries(window.localStorage))).toBe(initialStorage);
  });

  it('keeps the PDF-measured sword size and baseline after translating its source paragraph', async () => {
    const view = render(<PageRenderer pageData={pageData} isAdmin language="pt-BR" />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const blockIndex = pageData.blocks.findIndex(block => block.id === 'block_25');
    expect(blockIndex).toBeGreaterThanOrEqual(0);
    const sourceBlock = view.container.querySelector(`[data-admin-geometry-key="page_78_block_${blockIndex}"]`);
    expect(sourceBlock).not.toBeNull();
    fireEvent.click(sourceBlock!);
    fireEvent.click(await view.findByText('📝 Edit Text'));

    const textarea = view.container.querySelector('.rse-edit-text textarea') as HTMLTextAreaElement;
    expect(textarea.value).toContain('[[sword]]');
    expect(textarea.value).toContain('[[sword-arrow]]');
    expect(textarea.value).toContain('[[2hand]]');
    expect(textarea.value).toContain('[[1hand]]');
    const sourceWords = 'Adventurers with the ';
    const translation = 'Aventureiros com a ';
    const translatedText = textarea.value.replace(sourceWords, translation);
    expect(translatedText).not.toBe(textarea.value);
    const swordToken = '[[sword]]';
    const swordIndex = translatedText.indexOf(swordToken);
    expect(swordIndex).toBeGreaterThanOrEqual(0);
    const withoutSword = translatedText.slice(0, swordIndex) + translatedText.slice(swordIndex + swordToken.length);
    fireEvent.change(textarea, { target: { value: withoutSword, selectionStart: swordIndex, selectionEnd: swordIndex } });
    const reinsertedSword = withoutSword.slice(0, swordIndex) + swordToken + withoutSword.slice(swordIndex);
    fireEvent.change(textarea, { target: { value: reinsertedSword, selectionStart: swordIndex + swordToken.length, selectionEnd: swordIndex + swordToken.length } });
    expect(textarea.value).toBe(translatedText);
    fireEvent.click(view.getByText('Confirmar'));

    expect(Array.from(view.container.querySelectorAll('.realbox')).some(box => box.textContent?.includes(translation))).toBe(true);
    const sourceVectors = inlineElements.elements.filter(element => element.anchor.blockId === 'block_25'
      && ['attack.melee', 'attack.melee-ranged', 'weapon.hand.one', 'weapon.hand.two'].includes(element.symbolId));
    const renderedVectors = Array.from(view.container.querySelectorAll('.realbox svg[data-symbol-id]')) as SVGSVGElement[];
    expect(sourceVectors).toHaveLength(4); // Melee, Melee/Ranged, two-handed hand, one-handed hand.
    for (const symbolId of ['attack.melee', 'attack.melee-ranged', 'weapon.hand.one', 'weapon.hand.two']) {
      const sourceMetrics = sourceVectors.filter(element => element.symbolId === symbolId).map(requireMetrics);
      const actualMetrics = renderedVectors.filter(element => element.dataset.symbolId === symbolId).map(element => {
        const slot = element.closest('.inline-semantic-symbol-slot') as HTMLElement | null;
        expect(slot, `${symbolId} SVG should be anchored in the shared zero-height advance slot`).not.toBeNull();
        const advanceWidth = Number.parseFloat(slot!.style.width);
        const inkTop = Number.parseFloat(element.style.top);
        const inkHeight = Number.parseFloat(element.style.height);
        return {
          widthEm: Number.parseFloat(element.style.width) / advanceWidth,
          heightEm: inkHeight / advanceWidth,
          verticalAlignEm: (inkTop + inkHeight) / advanceWidth,
        };
      });
      expect(actualMetrics).toHaveLength(sourceMetrics.length);
      for (const key of ['widthEm', 'heightEm', 'verticalAlignEm'] as const) {
        const expected = sourceMetrics.map(metrics => metrics[key] / (metrics.advanceEm ?? metrics.widthEm)).sort((a, b) => a - b);
        const actual = actualMetrics.map(metrics => metrics[key]).sort((a, b) => a - b);
        for (let index = 0; index < expected.length; index++) expect(actual[index]).toBeCloseTo(expected[index], 5);
      }
      for (const element of renderedVectors.filter(candidate => candidate.dataset.symbolId === symbolId)) {
        const slot = element.closest('.inline-semantic-symbol-slot') as HTMLElement;
        expect(slot.style.height).toBe('0px');
        expect(slot.style.verticalAlign).toBe('baseline');
        expect(element.querySelector('rect')).toBeNull();
        expect(element.style.backgroundColor).toBe('');
      }
    }
    const sourceHands = sourceVectors.filter(element => element.symbolId.startsWith('weapon.hand.'));
    const renderedHands = renderedVectors.filter(element => element.dataset.symbolId.startsWith('weapon.hand.'));
    expect(sourceHands).toHaveLength(2);
    expect(sourceHands.every(element => element.anchor.trailingGapPt === 0)).toBe(true);
    expect(renderedHands.every(element => !(element.closest('.inline-semantic-symbol-slot') as HTMLElement).style.marginInlineEnd)).toBe(true);
  });
});
