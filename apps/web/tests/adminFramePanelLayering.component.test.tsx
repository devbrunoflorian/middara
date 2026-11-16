import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLayoutFrameEditor } from '../src/components/AdminLayoutFrameEditor';

describe('translation frame panel layering', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  let page: HTMLDivElement | undefined;
  let rectSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() { this.callback([], this as unknown as ResizeObserver); }
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === page) {
        return { x: 0, y: 0, left: 0, top: 0, right: 820, bottom: 1160, width: 820, height: 1160, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    page?.remove();
    root = undefined;
    container = undefined;
    page = undefined;
    rectSpy?.mockRestore();
    rectSpy = undefined;
    vi.unstubAllGlobals();
  });

  it('mounts controls in a separate body layer from frame outlines and ruler overlays', async () => {
    page = document.createElement('div');
    document.body.appendChild(page);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AdminLayoutFrameEditor
          pageElement={page}
          pageWidth={820}
          pageHeight={1160}
          snapTargets={[]}
          sourceBbox={null}
          unitKey={null}
          frame={null}
          language="en"
          hasOwnFrame={false}
          isDirty={false}
          isSaving={false}
          status={null}
          onChange={vi.fn()}
          onSave={vi.fn()}
          onDiscard={vi.fn()}
          onResetToEnglish={vi.fn()}
          onSnapGuidesChange={vi.fn()}
        />,
      );
    });

    const frameLayer = document.body.querySelector('.admin-layout-frame-layer');
    const panelLayer = document.body.querySelector('.admin-layout-frame-panel-layer');
    const panel = panelLayer?.querySelector('.admin-layout-frame-panel');
    expect(frameLayer).not.toBeNull();
    expect(panelLayer).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(panelLayer?.parentElement).toBe(document.body);
    expect(frameLayer?.contains(panelLayer)).toBe(false);
  });

  it('keeps an incomplete coordinate from changing the frame and commits a valid value on blur or Enter', async () => {
    page = document.createElement('div');
    document.body.appendChild(page);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onChange = vi.fn();
    const frame = { x: 20, y: 30, width: 180, height: 90, rotation: 0 };

    await act(async () => {
      root!.render(
        <AdminLayoutFrameEditor
          pageElement={page}
          pageWidth={820}
          pageHeight={1160}
          snapTargets={[]}
          sourceBbox={null}
          unitKey="p88-test"
          frame={frame}
          language="pt-BR"
          hasOwnFrame
          isDirty={false}
          isSaving={false}
          status={null}
          onChange={onChange}
          onSave={vi.fn()}
          onDiscard={vi.fn()}
          onResetToEnglish={vi.fn()}
          onCreateBlock={vi.fn()}
          onSnapGuidesChange={vi.fn()}
        />,
      );
    });

    const xInput = document.body.querySelector<HTMLInputElement>('.admin-layout-frame-fields input');
    expect(xInput?.value).toBe('20');
    expect(xInput).not.toBeNull();

    act(() => fireEvent.change(xInput!, { target: { value: '' } }));
    expect(onChange).not.toHaveBeenCalled();
    act(() => fireEvent.blur(xInput!));
    expect(onChange).not.toHaveBeenCalled();
    expect(xInput!.value).toBe('20');
    expect(document.body.querySelector('[role="alert"]')?.textContent)
      .toBe('Valor inválido; a moldura não foi alterada.');

    act(() => fireEvent.change(xInput!, { target: { value: '-2' } }));
    act(() => fireEvent.blur(xInput!));
    expect(onChange).not.toHaveBeenCalled();
    expect(xInput!.value).toBe('20');

    act(() => xInput!.focus());
    act(() => fireEvent.change(xInput!, { target: { value: '25.5' } }));
    act(() => fireEvent.keyDown(xInput!, { key: 'Enter' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(expect.objectContaining({ x: 25.5 }));
  });
});
