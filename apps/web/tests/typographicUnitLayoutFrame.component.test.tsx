import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';

function readP13FlagFixture(): PageData {
  const pageDir = join(process.cwd(), 'public/pages/page_013');
  const pageData = JSON.parse(readFileSync(join(pageDir, 'page_013_dom.json'), 'utf8')) as PageData;
  const block = pageData.blocks.find(candidate =>
    candidate.typographicUnits?.some(unit => unit.id === 'p13-new-story-flag-body'),
  );
  if (!block) throw new Error('Expected p. 13 New Story Flag typographic unit');
  return { ...pageData, blocks: [block], images: [] };
}

describe('typographic unit translation frame editing', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  let rectSpy: ReturnType<typeof vi.spyOn> | undefined;

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
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList?.contains('page-container')) {
        return { x: 0, y: 0, left: 0, top: 0, right: 820, bottom: 1160, width: 820, height: 1160, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    rectSpy?.mockRestore();
    rectSpy = undefined;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('selects an individual frame and commits its X₂ coordinate without opening the text editor', async () => {
    const pageData = readP13FlagFixture();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin language="pt-BR" layoutMode />);
    });
    await act(async () => { await Promise.resolve(); });

    const frameKey = 'page_13_unit_p13-new-story-flag-body';
    const field = container.querySelector<HTMLElement>(`[data-admin-geometry-key="${frameKey}"]`);
    expect(field).not.toBeNull();
    expect(field?.classList.contains('layout-frame-selectable')).toBe(true);

    await act(async () => {
      field!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.querySelector('.admin-layout-frame-panel')?.textContent)
      .not.toContain('Clique em um bloco editável');
    expect(document.body.textContent).not.toContain('Rich Block Editor');
    const saveButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.admin-layout-frame-actions button'))
      .find(button => button.textContent === 'Salvar');
    expect(saveButton).toBeDefined();
    expect(saveButton?.disabled).toBe(true);

    const widthInput = Array.from(document.body.querySelectorAll<HTMLInputElement>('.admin-layout-frame-fields input'))
      .find(input => input.closest('label')?.textContent?.startsWith('Largura'));
    expect(widthInput).toBeDefined();
    const targetX2 = Number(widthInput!.value) + 10;
    const frameX = Number(field!.getAttribute('data-admin-geometry-x'));
    const expectedTotal = targetX2 - frameX;
    await act(async () => {
      widthInput!.focus();
      fireEvent.change(widthInput!, { target: { value: String(targetX2) } });
      fireEvent.blur(widthInput!);
    });

    const updatedField = container.querySelector<HTMLElement>(`[data-admin-geometry-key="${frameKey}"]`);
    expect(Number(updatedField?.getAttribute('data-admin-geometry-width'))).toBeCloseTo(expectedTotal);
    expect(saveButton?.disabled).toBe(false);

    await act(async () => {
      saveButton!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(localStorage.getItem('middara-layout-frames-v1-pt-BR-page-13'))
      .toContain('"page_13_unit_p13-new-story-flag-body"');
    expect(localStorage.getItem('middara-layout-frames-v1-pt-BR-page-13'))
      .toContain(`"width":${targetX2}`);
    expect(localStorage.getItem('middara-layout-frames-v1-pt-BR-page-13'))
      .toContain(`"total":${expectedTotal}`);

    await act(async () => root!.unmount());
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin language="pt-BR" layoutMode />);
    });
    await act(async () => { await Promise.resolve(); });
    const reloadedField = container.querySelector<HTMLElement>(`[data-admin-geometry-key="${frameKey}"]`);
    expect(Number(reloadedField?.getAttribute('data-admin-geometry-width'))).toBeCloseTo(expectedTotal);
  });
});
