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
      .filter(element => (element as HTMLElement).style.color === 'rgb(185, 29, 35)') as HTMLSpanElement[];
    expect(redTextSpans.map(element => element.textContent).join('')).toContain('IMPORTANTE:');
    expect(redTextSpans.every(element => element.style.getPropertyValue('-webkit-text-stroke').includes('#ffffff'))).toBe(true);
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
    expect(textarea.value).toContain('[[hand-requirement]]');
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
      && ['attack.melee', 'attack.melee-ranged', 'weapon.hand'].includes(element.symbolId));
    const renderedVectors = Array.from(view.container.querySelectorAll('.realbox svg[data-symbol-id]')) as SVGSVGElement[];
    expect(sourceVectors).toHaveLength(4); // Melee, Melee/Ranged, two-handed hand, one-handed hand.
    for (const symbolId of ['attack.melee', 'attack.melee-ranged', 'weapon.hand']) {
      const sourceMetrics = sourceVectors.filter(element => element.symbolId === symbolId).map(requireMetrics);
      const actualMetrics = renderedVectors.filter(element => element.dataset.symbolId === symbolId).map(element => {
        const fontSize = Number.parseFloat((element.parentElement as HTMLElement).style.fontSize);
        return {
          widthEm: Number.parseFloat(element.style.width) / fontSize,
          heightEm: Number.parseFloat(element.style.height) / fontSize,
          verticalAlignEm: -Number.parseFloat(element.style.verticalAlign) / fontSize,
        };
      });
      expect(actualMetrics).toHaveLength(sourceMetrics.length);
      for (const key of ['widthEm', 'heightEm', 'verticalAlignEm'] as const) {
        const expected = sourceMetrics.map(metrics => metrics[key]).sort((a, b) => a - b);
        const actual = actualMetrics.map(metrics => metrics[key]).sort((a, b) => a - b);
        for (let index = 0; index < expected.length; index++) expect(actual[index]).toBeCloseTo(expected[index], 5);
      }
      for (const element of renderedVectors.filter(candidate => candidate.dataset.symbolId === symbolId)) {
        expect(element.querySelector('rect')).toBeNull();
        expect(element.style.backgroundColor).toBe('');
      }
    }
  });
});
