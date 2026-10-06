import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AdminRuler } from '../src/components/AdminRuler';
import type { LayoutAlignmentGuide } from '../src/layoutFrameSnapping';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups = new Set<() => void>();
const resizeObservers = new Set<MockResizeObserver>();

class MockResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) { resizeObservers.add(this); }
  observe() {}
  unobserve() {}
  disconnect() { resizeObservers.delete(this); }
  notify() { this.callback([], this as unknown as ResizeObserver); }
}

function renderRuler(pageElement: HTMLElement, pageWidth = 820, pageHeight = 820, alignmentGuides: LayoutAlignmentGuide[] = []) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<AdminRuler pageElement={pageElement} pageWidth={pageWidth} pageHeight={pageHeight} alignmentGuides={alignmentGuides} />));
  const unmount = () => {
    act(() => root.unmount()); host.remove(); cleanups.delete(unmount);
  };
  cleanups.add(unmount);
  const ruler = (selector: string) => document.body.querySelector<HTMLElement>(selector)!;
  return { ruler, unmount };
}

function setScrollportSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperties(element, {
    clientLeft: { configurable: true, value: 0 },
    clientTop: { configurable: true, value: 0 },
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  });
}

function setRect(element: HTMLElement, rect: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect));
}

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  resizeObservers.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AdminRuler viewport tracking', () => {
  it('floats at the visible scrollport edge and keeps ticks aligned to the scrolled page', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const scrollport = document.createElement('div'); const page = document.createElement('div');
    scrollport.append(page); document.body.append(scrollport);
    setScrollportSize(scrollport, 500, 400);
    setRect(scrollport, { left: 40, top: 50, width: 500, height: 400 });
    let pageRect = { left: 60, top: 70, width: 820, height: 820 };
    setRect(page, pageRect);
    const view = renderRuler(page);

    expect(view.ruler('.admin-ruler-horizontal').style.top).toBe('50px');
    expect(view.ruler('.admin-ruler-vertical').style.top).toBe('70px');

    pageRect = { ...pageRect, top: -40 };
    setRect(page, pageRect);
    act(() => scrollport.dispatchEvent(new Event('scroll')));

    expect(view.ruler('.admin-ruler-horizontal').style.top).toBe('50px');
    expect(view.ruler('.admin-ruler-vertical').style.top).toBe('50px');
    const y100 = view.ruler('.admin-ruler-vertical .admin-ruler-tick:nth-child(11)');
    expect(y100.style.top).toBe('10px');
    view.unmount(); scrollport.remove();
  });

  it('remeasures page width when the editor changes the shared stage layout', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const scrollport = document.createElement('div'); const page = document.createElement('div');
    scrollport.append(page); document.body.append(scrollport);
    setScrollportSize(scrollport, 900, 650);
    setRect(scrollport, { left: 0, top: 0, width: 900, height: 650 });
    let pageRect = { left: 30, top: 40, width: 820, height: 820 };
    setRect(page, pageRect);
    const view = renderRuler(page);

    pageRect = { left: 30, top: 40, width: 410, height: 410 };
    setRect(page, pageRect);
    act(() => { for (const observer of resizeObservers) observer.notify(); });

    expect(view.ruler('.admin-ruler-horizontal').style.width).toBe('410px');
    const x200 = view.ruler('.admin-ruler-horizontal .admin-ruler-tick:nth-child(21)');
    expect(x200.style.left).toBe('100px');
    view.unmount(); scrollport.remove();
  });

  it('shows snap lines through the visible page and marks their ruler positions', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const scrollport = document.createElement('div'); const page = document.createElement('div');
    scrollport.append(page); document.body.append(scrollport);
    setScrollportSize(scrollport, 500, 400);
    setRect(scrollport, { left: 40, top: 50, width: 500, height: 400 });
    setRect(page, { left: 60, top: 70, width: 820, height: 820 });
    const guides: LayoutAlignmentGuide[] = [
      { axis: 'x', value: 100, label: 'Block 2 left edge' },
      { axis: 'y', value: 200, label: 'Page center' },
    ];
    const view = renderRuler(page, 820, 820, guides);

    expect(view.ruler('.admin-ruler-snap-guide-vertical').style.left).toBe('160px');
    expect(view.ruler('.admin-ruler-snap-guide-horizontal').style.top).toBe('270px');
    expect(view.ruler('.admin-ruler-snap-mark-x').title).toBe('Block 2 left edge');
    expect(view.ruler('.admin-ruler-snap-mark-y').title).toBe('Page center');
    view.unmount(); scrollport.remove();
  });
});
