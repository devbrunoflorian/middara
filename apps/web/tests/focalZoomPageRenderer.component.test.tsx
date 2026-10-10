import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { captureDocumentFocalPoint } from '../src/focalZoom';

describe('PageRenderer focal zoom integration', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let previousRect: typeof HTMLElement.prototype.getBoundingClientRect | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    previousRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList.contains('page-stage')) {
        return DOMRect.fromRect({ x: 200, y: 50, width: 600, height: 500 });
      }
      if (this.classList.contains('page-container')) {
        const width = Number.parseFloat(this.style.width);
        const height = Number.parseFloat(this.style.height);
        const stage = this.parentElement as HTMLElement;
        const left = width < stage.clientWidth ? (stage.clientWidth - width) / 2 : 0;
        const top = height < stage.clientHeight ? (stage.clientHeight - height) / 2 : 0;
        const translated = this.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
        return DOMRect.fromRect({
          x: 200 + left - stage.scrollLeft + Number(translated?.[1] ?? 0),
          y: 50 + top - stage.scrollTop + Number(translated?.[2] ?? 0),
          width,
          height,
        });
      }
      return previousRect!.call(this);
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
    if (previousRect) HTMLElement.prototype.getBoundingClientRect = previousRect;
    previousRect = undefined;
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('keeps the PDF point under the pointer through zoom and leaves Admin coordinates unchanged', async () => {
    const pageData: PageData = { page_number: 78, width: 820, height: 1060, images: [], blocks: [] };
    const onApplied = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin={false} language="en" focalZoomEnabled zoomLevel={1} />);
    });
    const stage = host.querySelector<HTMLElement>('.page-stage')!;
    Object.defineProperties(stage, {
      clientWidth: { configurable: true, get: () => 600 },
      clientHeight: { configurable: true, get: () => 500 },
      scrollWidth: { configurable: true, get: () => Math.max(600, Number.parseFloat(host!.querySelector<HTMLElement>('.page-container')!.style.width)) },
      scrollHeight: { configurable: true, get: () => Math.max(500, Number.parseFloat(host!.querySelector<HTMLElement>('.page-container')!.style.height)) },
    });
    const initialPage = host.querySelector<HTMLElement>('.page-container')!;
    const initialRect = initialPage.getBoundingClientRect();
    const focal = captureDocumentFocalPoint({
      clientX: 450,
      clientY: 200,
      viewport: { left: 200, top: 50 },
      page: { left: initialRect.left, top: initialRect.top, width: initialRect.width, height: initialRect.height },
      pageWidth: 820,
      pageHeight: 1060,
    })!;

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin={false} language="en" focalZoomEnabled zoomLevel={2.5}
        focalZoomAnchor={{ id: 1, pageNumber: 78, focal }} onFocalZoomApplied={onApplied} />);
    });

    const zoomedPage = host.querySelector<HTMLElement>('.page-container')!;
    const zoomedRect = zoomedPage.getBoundingClientRect();
    const scale = zoomedRect.width / pageData.width;
    expect(zoomedRect.left - 200 + focal.pageX * scale).toBeCloseTo(focal.viewportX, 1);
    expect(zoomedRect.top - 50 + focal.pageY * scale).toBeCloseTo(focal.viewportY, 1);
    expect(onApplied).toHaveBeenCalledWith(1);

    const pageSizeBeforeAdmin = { width: zoomedPage.style.width, height: zoomedPage.style.height };
    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin language="en" focalZoomEnabled zoomLevel={2.5} />);
    });
    const pageAfterAdmin = host.querySelector<HTMLElement>('.page-container')!;
    expect({ width: pageAfterAdmin.style.width, height: pageAfterAdmin.style.height }).toEqual(pageSizeBeforeAdmin);

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin language="en" focalZoomEnabled zoomLevel={1.2}
        focalZoomAnchor={{ id: 2, pageNumber: 78, focal: { pageX: 0, pageY: 0, viewportX: 100, viewportY: 100 } }}
        onFocalZoomApplied={onApplied} />);
    });
    expect(host.querySelector<HTMLElement>('.page-container')!.style.transform).not.toBe('');

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin={false} language="en" focalZoomEnabled zoomLevel={1}
        focalZoomAnchor={{ id: 3, pageNumber: 78, focal: { pageX: 410, pageY: 530, viewportX: 300, viewportY: 250 }, resetPan: true }}
        onFocalZoomApplied={onApplied} />);
    });
    expect(host.querySelector<HTMLElement>('.page-container')!.style.transform).toBe('');
    expect(stage.scrollLeft).toBe(0);
    expect(stage.scrollTop).toBe(0);
  });
});
