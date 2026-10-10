import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getQueriesForElement } from '@testing-library/dom';
import { createRoot, type Root } from 'react-dom/client';
import { DevelopmentEnvironmentStatus } from '../src/components/DevelopmentEnvironmentStatus';
import { FaqDrawer } from '../src/components/FaqDrawer';
import { ShellNavigation } from '../src/components/ShellNavigation';
import { getCatalogEntries, getConfirmedRulebookPageReferences, resolveCatalogContent, type CatalogEntry } from '../src/faq/faqContent';

let container: HTMLDivElement;
let root: Root;
let nativeDialogShowExists = false;
let nativeDialogCloseExists = false;
let originalMatchMedia: PropertyDescriptor | undefined;

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
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
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
    vi.useRealTimers();
    act(() => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else delete (window as Partial<Window>).matchMedia;
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

  it('opens navigation temporarily on hover or click and closes by Escape or outside click', () => {
    const onSelect = vi.fn();
    const queries = mount(<ShellNavigation active="rulebook" onSelect={onSelect} />);
    const panel = container.querySelector<HTMLElement>('.global-nav-panel')!;
    const slot = container.querySelector<HTMLElement>('.global-nav-slot')!;

    expect(slot.classList.contains('is-pinned')).toBe(false);
    act(() => fireEvent.mouseOver(panel));
    expect(panel.classList.contains('is-expanded')).toBe(true);
    expect(slot.classList.contains('is-pinned')).toBe(false);

    act(() => fireEvent.click(queries.getByRole('button', { name: 'Toggle navigation' })));
    expect(panel.classList.contains('is-expanded')).toBe(true);
    expect(slot.classList.contains('is-pinned')).toBe(false);
    act(() => fireEvent.pointerDown(document.body));
    expect(panel.classList.contains('is-expanded')).toBe(false);

    act(() => fireEvent.click(queries.getByRole('button', { name: 'Toggle navigation' })));
    expect(panel.classList.contains('is-expanded')).toBe(true);
    act(() => fireEvent.keyDown(window, { key: 'Escape' }));
    expect(panel.classList.contains('is-expanded')).toBe(false);

    act(() => fireEvent.click(queries.getByRole('button', { name: 'Errata' })));
    expect(onSelect).toHaveBeenCalledWith('errata');
  });

  it('closes hover-only navigation after its short leave delay', () => {
    vi.useFakeTimers();
    mount(<ShellNavigation active="rulebook" onSelect={vi.fn()} />);
    const panel = container.querySelector<HTMLElement>('.global-nav-panel')!;
    act(() => fireEvent.mouseOver(panel));
    expect(panel.classList.contains('is-expanded')).toBe(true);
    act(() => fireEvent.mouseOut(panel, { relatedTarget: document.body }));
    expect(panel.classList.contains('is-expanded')).toBe(true);
    act(() => vi.advanceTimersByTime(221));
    expect(panel.classList.contains('is-expanded')).toBe(false);
  });

  it('opens the navigation as a mobile drawer and closes it by backdrop or Escape', () => {
    const matchMedia = window.matchMedia as ReturnType<typeof vi.fn>;
    matchMedia.mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const onSelect = vi.fn();
    const queries = mount(<ShellNavigation active="rulebook" onSelect={onSelect} />);

    act(() => fireEvent.click(queries.getByRole('button', { name: 'Open navigation' })));
    expect(container.querySelector('.global-nav-panel')?.classList.contains('is-expanded')).toBe(true);
    expect(container.querySelector('.global-nav-backdrop')).toBeTruthy();

    act(() => fireEvent.click(container.querySelector('.global-nav-backdrop')!));
    expect(container.querySelector('.global-nav-panel')?.classList.contains('is-expanded')).toBe(false);

    act(() => fireEvent.click(queries.getByRole('button', { name: 'Open navigation' })));
    act(() => fireEvent.keyDown(window, { key: 'Escape' }));
    expect(container.querySelector('.global-nav-panel')?.classList.contains('is-expanded')).toBe(false);
    expect(container.querySelector('.global-nav-slot')?.classList.contains('is-pinned')).toBe(false);
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
    const onNavigateToPage = vi.fn(() => true);
    const queries = mount(<FaqDrawer language="pt-BR" open={false} onOpenChange={onOpenChange} onNavigateToPage={onNavigateToPage} />);
    await act(async () => root.render(<FaqDrawer language="pt-BR" open onOpenChange={onOpenChange} onNavigateToPage={onNavigateToPage} />));

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
    const queries = mount(<FaqDrawer language="en" open onOpenChange={onOpenChange} onNavigateToPage={vi.fn(() => true)} />);
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
    const onNavigateToPage = vi.fn(() => true);
    const queries = mount(<FaqDrawer language="en" open={false} onOpenChange={onOpenChange} onNavigateToPage={onNavigateToPage} />);

    await act(async () => root.render(<FaqDrawer language="en" open onOpenChange={onOpenChange} onNavigateToPage={onNavigateToPage} />));
    expect(queries.getByRole('dialog').hasAttribute('open')).toBe(true);
    act(() => fireEvent.click(queries.getByRole('button', { name: 'Close panel' })));

    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(localStorage.getItem('fixture-key')).toBe(before);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('navigates only to confirmed Rulebook references and leaves the desktop FAQ drawer open', () => {
    localStorage.setItem('reference-click-fixture', 'untouched');
    const before = localStorage.getItem('reference-click-fixture');
    const onOpenChange = vi.fn();
    const onNavigateToPage = vi.fn(() => true);
    const queries = mount(<FaqDrawer language="pt-BR" open onOpenChange={onOpenChange} onNavigateToPage={onNavigateToPage} />);

    act(() => fireEvent.click(queries.getByRole('tab', { name: /ERRATA/ })));
    act(() => fireEvent.click(queries.getByRole('button', { name: /Gigas Grip/ })));
    expect(queries.getByText('Fallback EN')).toBeTruthy();

    const page78Link = queries.getByRole('button', { name: 'Abrir página 78 do Rulebook 1.2' });
    expect(page78Link.textContent).toBe('Rulebook · p. 78');
    expect(page78Link.tagName).toBe('BUTTON');
    page78Link.focus();
    expect(document.activeElement).toBe(page78Link);
    act(() => fireEvent.click(page78Link));
    expect(onNavigateToPage).toHaveBeenCalledWith(78);
    expect(queries.getByRole('dialog').hasAttribute('open')).toBe(true);
    expect(queries.getByText('Fallback EN')).toBeTruthy();

    act(() => fireEvent.change(queries.getByRole('searchbox', { name: 'Buscar no catálogo' }), { target: { value: 'Flanking and Backstab' } }));
    act(() => fireEvent.click(queries.getByRole('button', { name: /Flanking and Backstab/ })));
    const page50Link = queries.getByRole('button', { name: 'Abrir página 50 do Rulebook 1.2' });
    act(() => fireEvent.click(page50Link));
    expect(onNavigateToPage).toHaveBeenLastCalledWith(50);
    expect(queries.getByRole('dialog').hasAttribute('open')).toBe(true);
    expect(localStorage.getItem('reference-click-fixture')).toBe(before);
  });

  it('keeps FAQ references without a confirmed Rulebook target as non-navigable metadata', () => {
    const onOpenChange = vi.fn();
    const onNavigateToPage = vi.fn(() => true);
    const queries = mount(<FaqDrawer language="en" open onOpenChange={onOpenChange} onNavigateToPage={onNavigateToPage} />);
    act(() => fireEvent.change(queries.getByRole('searchbox', { name: 'Search the catalog' }), { target: { value: 'no more components left to draw' } }));
    act(() => fireEvent.click(queries.getByRole('button', { name: /What happens if I need to draw a Reward or Card/ })));

    expect(queries.getByText(/Unconfirmed page reference · p\. 6/)).toBeTruthy();
    expect(queries.queryByRole('button', { name: /page 6/i })).toBeNull();
    expect(onNavigateToPage).not.toHaveBeenCalled();
  });

  it('keeps other-book references non-clickable and closes the full-screen drawer after valid navigation', () => {
    const onOpenChange = vi.fn();
    const onNavigateToPage = vi.fn(() => true);
    const queries = mount(<FaqDrawer language="en" open onOpenChange={onOpenChange} onNavigateToPage={onNavigateToPage} />);
    act(() => fireEvent.click(queries.getByRole('tab', { name: /ERRATA/ })));
    act(() => fireEvent.change(queries.getByRole('searchbox', { name: 'Search the catalog' }), { target: { value: 'Aisling (COMMAND)' } }));
    act(() => fireEvent.click(queries.getByRole('button', { name: /Aisling \(COMMAND\)/ })));
    expect(queries.getByText(/Other book\/component · p\. 423/)).toBeTruthy();
    expect(queries.queryByRole('button', { name: /page 423/i })).toBeNull();
    expect(onNavigateToPage).not.toHaveBeenCalled();

    const matchMedia = window.matchMedia as ReturnType<typeof vi.fn>;
    matchMedia.mockReturnValue({ matches: true });
    act(() => fireEvent.change(queries.getByRole('searchbox', { name: 'Search the catalog' }), { target: { value: 'Gigas Grip (Discipline)' } }));
    act(() => fireEvent.click(queries.getByRole('button', { name: /Gigas Grip \(Discipline\)/ })));
    onNavigateToPage.mockReturnValueOnce(false);
    act(() => fireEvent.click(queries.getByRole('button', { name: 'Open Rulebook 1.2 page 78' })));
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(true);

    act(() => fireEvent.click(queries.getByRole('button', { name: 'Open Rulebook 1.2 page 78' })));

    expect(onNavigateToPage).toHaveBeenCalledWith(78);
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('rejects page targets outside the Rulebook and page count', () => {
    const [entry] = getCatalogEntries('errata');
    const invalidEntry = {
      ...entry,
      pageReferenceDetails: [
        { page: 0, sourceEntryId: 'invalid-low', target: 'rulebook-1.2' },
        { page: 103, sourceEntryId: 'invalid-high', target: 'rulebook-1.2' },
      ],
      rulebook12Status: 'VERIFIED_IN_RULEBOOK_1_2',
      rulebook12Evidence: { page: 103, source: 'fixture' },
    } as CatalogEntry;
    expect(getConfirmedRulebookPageReferences(invalidEntry)).toEqual([]);
    expect(getConfirmedRulebookPageReferences(invalidEntry, 80)).toEqual([]);
  });
});
