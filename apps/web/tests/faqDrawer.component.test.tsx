import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getQueriesForElement, waitFor } from '@testing-library/dom';
import { createRoot, type Root } from 'react-dom/client';
import { FaqDrawer } from '../src/components/FaqDrawer';

const publicFaqs = [
  {
    id: 1,
    faqId: 'FAQ-083',
    question: 'Quando acontece um Ataque de Oportunidade (Break Attack)?',
    answer: 'Quando uma Miniatura deixa um espaço adjacente a um oponente.',
    englishQuestion: 'When does a Break Attack happen?',
    englishAnswer: 'When a Miniature leaves a space adjacent to an opponent.',
    category: 'Ataques, Esquiva, Contra-ataque e flanqueamento',
    sourcePages: [{ page: 42 }],
    keywords: [{ value: 'Break Attack' }, { value: 'Ataque de Oportunidade' }],
    synonyms: [{ value: 'Break Attack' }, { value: 'Ataque de Oportunidade' }],
    ruleScope: 'base',
    spoilerLevel: 'none',
  },
  {
    id: 2,
    faqId: 'FAQ-047',
    question: 'Posso atravessar um espaço ocupado por aliado?',
    answer: 'Sim, sem terminar seu deslocamento nele.',
    englishQuestion: 'Can I move through a space occupied by an ally?',
    englishAnswer: 'Yes, but you cannot end your movement there.',
    category: 'Movimento, Terrenos e Elevação',
    sourcePages: [{ page: 39 }],
    keywords: [],
    synonyms: [],
    ruleScope: 'base',
    spoilerLevel: 'none',
  },
  {
    id: 3,
    faqId: 'FAQ-097',
    question: 'Quando um alvo resiste a um Feitiço?',
    answer: 'Quando seus dados de Convicção totalizam valor igual ou superior à Força do Feitiço.',
    englishQuestion: 'When does a target resist a Spell?',
    englishAnswer: 'When its Conviction dice total a value equal to or greater than the Spell Force.',
    category: 'Alcance, Linha de Visão, Feitiços e Follow Up',
    sourcePages: [{ page: 53 }],
    keywords: [],
    synonyms: [],
    ruleScope: 'base',
    spoilerLevel: 'none',
  },
  {
    id: 4,
    faqId: 'FAQ-014',
    question: 'Bounty e Reward são a mesma coisa?',
    answer: 'Não como mecânica. Bounty é conteúdo jogável com regras próprias de tentativa e Reward é o prêmio obtido.',
    englishQuestion: 'Are Bounty and Reward the same thing?',
    englishAnswer: 'Not as game mechanics. Bounty is playable content with its own attempt rules, while Reward is the prize obtained.',
    category: 'Saques, Ouro e recompensas',
    sourcePages: [{ page: 13 }, { page: 14 }],
    keywords: [{ value: 'Bounty' }, { value: 'Reward' }, { value: 'Recompensa' }],
    synonyms: [],
    ruleScope: 'base',
    spoilerLevel: 'none',
  },
  {
    id: 5,
    faqId: 'FAQ-170',
    question: 'Pergunta ainda sem tradução inglesa?',
    answer: 'Texto apenas em português.',
    englishQuestion: '',
    englishAnswer: '',
    category: 'Efeitos, limites e regras gerais',
    sourcePages: [{ page: 84 }],
    keywords: [],
    synonyms: [],
    ruleScope: 'base',
    spoilerLevel: 'none',
  },
];

let container: HTMLDivElement;
let root: Root;
let nativeDialogShowExists = false;
let nativeDialogCloseExists = false;
let matchMediaMatches = false;
let originalMatchMedia: PropertyDescriptor | undefined;
const navigate = vi.fn(() => true);
const onOpenChange = vi.fn();

function renderDrawer(language: 'en' | 'pt-BR', currentPage = 42, open = true) {
  act(() => root.render(
    <FaqDrawer language={language} currentPage={currentPage} open={open} activeType="editorial" onActiveTypeChange={vi.fn()} onOpenChange={onOpenChange} onNavigateToPage={navigate} />,
  ));
  return getQueriesForElement(container);
}

describe('editorial FAQ drawer', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    matchMediaMatches = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: publicFaqs }) }));
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: matchMediaMatches, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    nativeDialogShowExists = typeof HTMLDialogElement.prototype.show === 'function';
    nativeDialogCloseExists = typeof HTMLDialogElement.prototype.close === 'function';
    Object.defineProperty(HTMLDialogElement.prototype, 'show', { configurable: true, writable: true, value: function show(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, writable: true, value: function close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); } });
    navigate.mockClear();
    onOpenChange.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else delete (window as Partial<Window>).matchMedia;
    if (!nativeDialogShowExists) delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).show;
    if (!nativeDialogCloseExists) delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  });

  it('uses the Viewer language and never falls back to the other language', async () => {
    const queries = renderDrawer('en');
    await queries.findByText('On this page · p. 42');

    expect(queries.getByText('When does a Break Attack happen?')).toBeTruthy();
    expect(queries.queryByText('Quando acontece um Ataque de Oportunidade (Break Attack)?')).toBeNull();
    expect(queries.queryByText('Pergunta ainda sem tradução inglesa?')).toBeNull();
    expect(queries.getByRole('tab', { name: /Official FAQ/ })).toBeTruthy();
    expect(queries.getByRole('tab', { name: /Official Errata/ })).toBeTruthy();
  });

  it('shows a recoverable error when FAQ loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    const queries = renderDrawer('pt-BR');

    expect(await queries.findByRole('alert')).toBeTruthy();
    expect(queries.getByText('Não foi possível carregar o FAQ editorial agora.')).toBeTruthy();
    fireEvent.click(queries.getByRole('button', { name: 'Tentar novamente' }));
    expect(await queries.findByText('Nesta página · p. 42')).toBeTruthy();
  });

  it('loads editorial drafts for the Viewer without a login and does not show a false zero while loading', () => {
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const queries = renderDrawer('pt-BR');

    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('draft=true');
    expect(queries.queryByRole('link', { name: /administração do FAQ editorial/i })).toBeNull();
    expect(queries.getByRole('status').textContent).toContain('Carregando');
    expect(container.querySelector('.faq-result-count')).toBeNull();
  });

  it('prioritizes the current page and navigates to the source pages while keeping the answer available', async () => {
    const queries = renderDrawer('en');
    const currentQuestion = await queries.findByText('When does a Break Attack happen?');
    const currentGroup = currentQuestion.closest('.faq-entry');
    expect(currentGroup?.parentElement?.className).toContain('faq-current-page');

    fireEvent.click(currentQuestion.closest('button')!);
    fireEvent.click(await queries.findByRole('button', { name: 'Open in book · p. 42' }));
    expect(navigate).toHaveBeenLastCalledWith(42);
    expect(queries.getByText('When a Miniature leaves a space adjacent to an opponent.')).toBeTruthy();

    const search = queries.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'FAQ-047' } });
    await queries.findByText('Can I move through a space occupied by an ally?');
    fireEvent.click(queries.getByText('Can I move through a space occupied by an ally?').closest('button')!);
    fireEvent.click(await queries.findByRole('button', { name: 'Open in book · p. 39' }));
    expect(navigate).toHaveBeenLastCalledWith(39);

    fireEvent.change(search, { target: { value: 'FAQ-097' } });
    await queries.findByText('When does a target resist a Spell?');
    fireEvent.click(queries.getByText('When does a target resist a Spell?').closest('button')!);
    fireEvent.click(await queries.findByRole('button', { name: 'Open in book · p. 53' }));
    expect(navigate).toHaveBeenLastCalledWith(53);
  });

  it('normalizes accents, finds Break Attack synonyms, distinguishes Bounty and Reward, and retains search and scroll', async () => {
    const queries = renderDrawer('pt-BR');
    await queries.findByText('Nesta página · p. 42');
    const search = queries.getByRole('searchbox');

    fireEvent.change(search, { target: { value: 'break attack' } });
    await queries.findByText('Quando acontece um Ataque de Oportunidade (Break Attack)?');
    fireEvent.change(search, { target: { value: 'ataque de oportunidade' } });
    await queries.findByText('Quando acontece um Ataque de Oportunidade (Break Attack)?');
    fireEvent.change(search, { target: { value: 'oportunidade' } });
    await waitFor(() => expect(queries.getByText('Quando acontece um Ataque de Oportunidade (Break Attack)?')).toBeTruthy());
    fireEvent.change(search, { target: { value: 'Recompensa' } });
    const bountyRewardQuestion = await queries.findByText('Bounty e Reward são a mesma coisa?');
    fireEvent.click(bountyRewardQuestion.closest('button')!);
    await waitFor(() => expect(container.querySelector('.faq-concept-note')).not.toBeNull());
    expect(container.querySelector('.faq-concept-note')?.textContent).toContain('aparecem em momentos diferentes da partida');
    expect(container.querySelector('.faq-concept-note')?.textContent).toContain('podem ser “Recompensa(s)” ou “prêmio”');
    expect(container.querySelector('.faq-concept-note')?.textContent).toContain('“Caçada” depende do contexto');
    expect(container.querySelector('.faq-concept-note')?.textContent).toContain('Great Bounty');
    const list = container.querySelector('.faq-entry-list') as HTMLDivElement;
    list.scrollTop = 180;

    fireEvent.click(queries.getByRole('button', { name: 'Fechar painel' }));
    renderDrawer('pt-BR', 42, false);
    renderDrawer('pt-BR', 42, true);

    expect((queries.getByRole('searchbox') as HTMLInputElement).value).toBe('Recompensa');
    expect((container.querySelector('.faq-entry-list') as HTMLDivElement).scrollTop).toBe(180);
    expect(queries.getByText('Bounty e Reward são a mesma coisa?')).toBeTruthy();
  });

  it('keeps keyboard focus within the near-full-screen mobile sheet', async () => {
    matchMediaMatches = true;
    const queries = renderDrawer('pt-BR');
    await queries.findByText('Nesta página · p. 42');
    const dialog = container.querySelector('dialog')!;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    )).filter(element => !element.closest('[hidden]'));
    const first = focusable[0];
    const last = focusable.at(-1)!;

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
