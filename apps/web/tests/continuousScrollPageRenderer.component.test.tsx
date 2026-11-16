import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';

describe('PageRenderer continuous-scroll wheel ownership', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lets the outer viewer own wheel scrolling only in continuous mode', async () => {
    const pageData: PageData = { page_number: 78, width: 820, height: 1060, images: [], blocks: [] };

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin={false} language="en" continuousScroll />);
    });

    let renderer = host!.querySelector<HTMLElement>('.page-renderer')!;
    let stage = host!.querySelector<HTMLElement>('.page-stage')!;
    expect(renderer.classList.contains('continuous-scroll-page')).toBe(true);
    expect(renderer.style.overflow).toBe('visible');
    expect(stage.classList.contains('continuous-scroll-page-stage')).toBe(true);
    expect(stage.style.overflow).toBe('visible');
    expect(stage.style.overscrollBehavior).toBe('auto');

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin={false} language="en" />);
    });

    renderer = host!.querySelector<HTMLElement>('.page-renderer')!;
    stage = host!.querySelector<HTMLElement>('.page-stage')!;
    expect(renderer.classList.contains('continuous-scroll-page')).toBe(false);
    expect(renderer.style.overflow).toBe('hidden');
    expect(stage.classList.contains('continuous-scroll-page-stage')).toBe(false);
    expect(stage.style.overflow).toBe('');
    expect(stage.style.overscrollBehavior).toBe('');
  });
});
