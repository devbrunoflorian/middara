import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getQueriesForElement } from '@testing-library/dom';
import { createRoot, type Root } from 'react-dom/client';
import { DevelopmentEnvironmentStatus } from '../src/components/DevelopmentEnvironmentStatus';
import { FaqDrawer } from '../src/components/FaqDrawer';
import { getCatalogEntries, resolveCatalogContent } from '../src/faq/faqContent';

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

  it('keeps FAQ answers collapsed by default, expands multiple entries, and resets them when search changes', async () => {
    const [reachEntry, courageEntry] = getCatalogEntries('faq');
    const reachEn = resolveCatalogContent(reachEntry, 'en');
    const reachPt = resolveCatalogContent(reachEntry, 'pt-BR');
    const courageEn = resolveCatalogContent(courageEntry, 'en');
    const triggerForTitle = (title: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('.faq-entry-trigger'))
      .find(button => button.querySelector('.faq-entry-title')?.textContent === title);
    expect(reachEn.isFallback).toBe(false);
    expect(reachPt.isFallback).toBe(true);
    expect(reachPt.title).toMatch(/Reach/);

    const onOpenChange = vi.fn();
    const queries = mount(<FaqDrawer language="pt-BR" open={false} onOpenChange={onOpenChange} />);
    await act(async () => root.render(<FaqDrawer language="pt-BR" open onOpenChange={onOpenChange} />));

    expect(queries.getByRole('dialog').hasAttribute('open')).toBe(true);
    expect(queries.getByRole('dialog').getAttribute('aria-modal')).toBe('false');
    expect(queries.getByText(/Entradas sem tradução PT-BR revisada aparecem em EN/)).toBeTruthy();

    const reachTrigger = queries.getByRole('button', { name: /How does Reach and Flanking Work/ });
    const courageTrigger = queries.getByRole('button', { name: /Casting Dice upgrade/ });
    expect(reachTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(queries.queryByText(/So long as you're attacking an opponent/)).toBeNull();

    act(() => fireEvent.click(reachTrigger));
    expect(reachTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(queries.getByText('Fallback EN')).toBeTruthy();
    expect(container.querySelector('.faq-entry-body')?.textContent).toMatch(/So long as you're attacking an opponent/);

    act(() => fireEvent.click(courageTrigger));
    expect(reachTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(courageTrigger.getAttribute('aria-expanded')).toBe('true');

    const search = queries.getByRole('searchbox', { name: 'Buscar no catálogo' });
    act(() => fireEvent.change(search, { target: { value: 'rEaCh' } }));
    expect(queries.getByText(reachEn.title)).toBeTruthy();
    expect(reachTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(queries.queryByRole('button', { name: /Courage Stifle/ })).toBeNull();
    expect(container.querySelector('.faq-entry-content .faq-entry-body')).toBeNull();

    act(() => fireEvent.change(search, { target: { value: '' } }));
    expect(queries.getByText('77 entradas')).toBeTruthy();
    expect(queries.getByRole('button', { name: /How does Reach and Flanking Work/ }).getAttribute('aria-expanded')).toBe('false');
    expect(triggerForTitle(courageEn.title)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses the same collapsed interaction for Errata and keeps severity visible', () => {
    const onOpenChange = vi.fn();
    const queries = mount(<FaqDrawer language="en" open onOpenChange={onOpenChange} />);
    const errataTab = queries.getByRole('tab', { name: /ERRATA/ });
    act(() => fireEvent.click(errataTab));
    expect(errataTab.getAttribute('aria-selected')).toBe('true');

    const gigasTitle = getCatalogEntries('errata').find(entry => entry.titleEn.includes('Gigas Grip'))?.titleEn;
    const gigasTrigger = gigasTitle && Array.from(container.querySelectorAll<HTMLButtonElement>('.faq-entry-trigger'))
      .find(button => button.querySelector('.faq-entry-title')?.textContent === gigasTitle);
    expect(gigasTrigger).toBeTruthy();
    expect(gigasTrigger.getAttribute('aria-expanded')).toBe('false');
    act(() => fireEvent.click(gigasTrigger));
    expect(gigasTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(queries.getByText(/Official website · snapshot/)).toBeTruthy();
    expect(container.querySelector('.faq-entry-content .faq-entry-body')?.textContent).toMatch(/This ability has historically caused many issues/);
  });

  it('opens and closes the FAQ without changing local translation storage', async () => {
    localStorage.setItem('fixture-key', 'fixture-value');
    const before = localStorage.getItem('fixture-key');
    const onOpenChange = vi.fn();
    const queries = mount(<FaqDrawer language="en" open={false} onOpenChange={onOpenChange} />);

    await act(async () => root.render(<FaqDrawer language="en" open onOpenChange={onOpenChange} />));
    expect(queries.getByRole('dialog').hasAttribute('open')).toBe(true);
    act(() => fireEvent.click(queries.getByRole('button', { name: 'Close panel' })));

    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(localStorage.getItem('fixture-key')).toBe(before);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
