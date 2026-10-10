import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getQueriesForElement } from '@testing-library/dom';
import { createRoot, type Root } from 'react-dom/client';
import { DevelopmentEnvironmentStatus } from '../src/components/DevelopmentEnvironmentStatus';
import { FaqDrawer } from '../src/components/FaqDrawer';
import { resolveFaqContent } from '../src/faq/faqContent';

let container: HTMLDivElement;
let root: Root;
let nativeDialogShowExists = false;
let nativeDialogCloseExists = false;

function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
  return getQueriesForElement(container);
}

describe('application shell UX', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    nativeDialogShowExists = typeof HTMLDialogElement.prototype.show === 'function';
    if (!nativeDialogShowExists) {
      Object.defineProperty(HTMLDialogElement.prototype, 'show', {
        configurable: true,
        writable: true,
        value: function show(this: HTMLDialogElement) { this.setAttribute('open', ''); },
      });
    }
    nativeDialogCloseExists = typeof HTMLDialogElement.prototype.close === 'function';
    if (!nativeDialogCloseExists) {
      Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true,
        writable: true,
        value: function close(this: HTMLDialogElement) {
          this.removeAttribute('open');
          this.dispatchEvent(new Event('close'));
        },
      });
    }
    vi.spyOn(HTMLDialogElement.prototype, 'show').mockImplementation(function show() {
      this.setAttribute('open', '');
    });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function close() {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
    if (!nativeDialogShowExists) delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).show;
    if (!nativeDialogCloseExists) delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  });

  it('keeps development diagnostics compact until expanded and then exposes all debug fields', () => {
    const queries = mount(
      <DevelopmentEnvironmentStatus
        webOrigin="http://localhost:8080"
        apiOrigin="http://localhost:3000"
        locale="pt-BR"
        isAdmin
        mode="editor"
      />,
    );

    expect(queries.getByText('DEV')).toBeTruthy();
    expect(container.querySelector('details')?.open).toBe(false);
    act(() => fireEvent.click(queries.getByText('DEV')));
    expect(queries.getByText('http://localhost:8080')).toBeTruthy();
    expect(queries.getByText('http://localhost:3000')).toBeTruthy();
    expect(queries.getByText('pt-BR')).toBeTruthy();
    expect(queries.getByText('ON')).toBeTruthy();
    expect(queries.getByText('editor')).toBeTruthy();
  });

  it('uses explicit English fallback for PT-BR and supports case-insensitive local search', async () => {
    expect(resolveFaqContent('en').isFallback).toBe(false);
    expect(resolveFaqContent('pt-BR').isFallback).toBe(true);
    expect(resolveFaqContent('pt-BR').entries[0].question).toMatch(/Reach/);

    const onOpenChange = vi.fn();
    const queries = mount(<FaqDrawer language="pt-BR" open={false} onOpenChange={onOpenChange} />);
    await act(async () => root.render(<FaqDrawer language="pt-BR" open onOpenChange={onOpenChange} />));

    expect(queries.getByRole('dialog').hasAttribute('open')).toBe(true);
    expect(queries.getByRole('dialog').getAttribute('aria-modal')).toBe('false');
    expect(queries.getByText(/Versão PT-BR oficial não encontrada/)).toBeTruthy();
    expect(queries.getByText(/sem tradução automática/)).toBeTruthy();

    const search = queries.getByLabelText('Buscar na FAQ');
    act(() => fireEvent.change(search, { target: { value: 'rEaCh' } }));
    expect(queries.getByText('How do Reach and flanking work together?')).toBeTruthy();
    expect(queries.queryByText('What if equipped items no longer form a legal combination?')).toBeNull();
  });

  it('opens and closes the FAQ without changing local translation storage', async () => {
    localStorage.setItem('fixture-key', 'fixture-value');
    const before = localStorage.getItem('fixture-key');
    const onOpenChange = vi.fn();
    const queries = mount(<FaqDrawer language="en" open={false} onOpenChange={onOpenChange} />);

    await act(async () => root.render(<FaqDrawer language="en" open onOpenChange={onOpenChange} />));
    expect(queries.getByRole('dialog').hasAttribute('open')).toBe(true);
    act(() => fireEvent.click(queries.getByRole('button', { name: 'Close FAQ' })));

    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(localStorage.getItem('fixture-key')).toBe(before);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
