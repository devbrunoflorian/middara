import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueriesForElement, fireEvent as dispatchEvent } from '@testing-library/dom';
import { createRoot } from 'react-dom/client';
import { RichSpanEditor, type Segment, type SpanOverride } from '../src/components/RichSpanEditor';
import { AdminSymbolPalette, type AdminSymbolPaletteEditorState } from '../src/components/AdminSymbolPalette';
import { getDefaultSymbolAliasPreferences } from '../src/symbols/semanticSymbols';
import { editableTextForSegments } from '../src/symbols/inlineCodec';
import { decodeOverrideData, encodeOverrideData } from '../src/symbols/overrideData';
import { INLINE_CLIPBOARD_MIME } from '../src/symbols/inlineClipboard';

const cleanups = new Set<() => void>();
// Use the web workspace's React + ReactDOM pair. The hoisted React testing
// wrapper can otherwise require another React copy from the admin workspace.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fireEvent = new Proxy(dispatchEvent, {
  get(target, property: keyof typeof dispatchEvent) {
    const dispatch = target[property];
    return typeof dispatch === 'function' ? (...args: unknown[]) => act(() => dispatch(...args as Parameters<typeof dispatch>)) : dispatch;
  },
});
function render(node: React.ReactNode) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); act(() => root.render(node));
  const unmount = () => { act(() => root.unmount()); container.remove(); cleanups.delete(unmount); };
  cleanups.add(unmount);
  return { container, unmount, ...getQueriesForElement(container) };
}

function AdminEditorHarness(props: React.ComponentProps<typeof RichSpanEditor>) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [editorState, setEditorState] = React.useState<AdminSymbolPaletteEditorState | null>(null);
  const activeEditor = React.useRef<{ key: string; state: AdminSymbolPaletteEditorState } | null>(null);
  const onPaletteEditorChange = React.useCallback((key: string, state: AdminSymbolPaletteEditorState | null) => {
    if (state) {
      activeEditor.current = { key, state };
      setEditorState(current => current
        && current.context === state.context
        && current.canInsert === state.canInsert
        && current.canUndo === state.canUndo
        && current.status === state.status
        ? current
        : state);
    } else if (activeEditor.current?.key === key) {
      activeEditor.current = null;
      setEditorState(null);
    }
  }, []);
  return <>
    <RichSpanEditor {...props} symbolAliasPreferences={defaultAliasPreferences} onPaletteEditorChange={onPaletteEditorChange} />
    <AdminSymbolPalette
      language={props.language}
      context={editorState?.context ?? 'admin'}
      open={paletteOpen}
      canInsert={editorState?.canInsert ?? false}
      canUndo={editorState?.canUndo ?? false}
      status={editorState?.status ?? null}
      aliasPreferences={defaultAliasPreferences}
      aliasesLoading={false}
      onOpenChange={setPaletteOpen}
      onInsert={id => activeEditor.current?.state.insert(id)}
      onUndo={() => activeEditor.current?.state.undo()}
      onSaveAlias={async () => ({ ok: true, message: 'saved' })}
    />
  </>;
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
});
afterEach(() => { for (const cleanup of cleanups) cleanup(); vi.unstubAllGlobals(); });
const style = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
const defaultAliasPreferences = getDefaultSymbolAliasPreferences();
const plain = (text: string): Segment => ({ ...style, text });
const symbol = (): Segment => ({ ...style, text: '\uFFFC', symbolId: 'tag.status.icon', symbolMetrics: { widthEm: .9, heightEm: 1, verticalAlignEm: .2 } });

function mount(language: 'en' | 'pt-BR', runs: Segment[], existingOverride?: SpanOverride, originalLineHeight = 1, overrideStatusLoading = false) {
  const onDraftChange = vi.fn(); const onSave = vi.fn();
  const view = render(<AdminEditorHarness spanKey={`p0-${language}`} pageNumber={37} language={language}
    originalText={runs.map(r => r.text).join('')} originalSegments={runs}
    originalFont={style.font} originalSize={10} originalColor={style.color} originalWeight={400}
    originalStyle="normal" originalLineHeight={originalLineHeight} bbox={[10, 10, 300, 60]} onClose={vi.fn()} onSave={onSave}
    onDraftChange={onDraftChange} existingOverride={existingOverride} overrideStatusLoading={overrideStatusLoading} />);
  fireEvent.click(view.getByText('📝 Edit Text'));
  const textarea = view.getByRole('textbox') as HTMLTextAreaElement;
  const edit = (text: string, start = 0, end = start) => {
    textarea.setSelectionRange(start, end); fireEvent.select(textarea); fireEvent.keyUp(textarea);
    fireEvent.change(textarea, { target: { value: text, selectionStart: start, selectionEnd: start } });
  };
  const draft = () => onDraftChange.mock.calls.at(-1)?.[0] as SpanOverride | null;
  return { ...view, textarea, edit, draft, onDraftChange, onSave };
}

describe.each(['en', 'pt-BR'] as const)('RichSpanEditor mounted regression %s', language => {
  it('keeps fill and outline styling when replacing text within one uniformly styled source run', () => {
    const source = [{ ...plain('IMPORTANT:'), color: '#b91d23', weight: 900,
      textStrokeWidthPt: 2, textStrokeColor: '#ffffff', disableLigatures: true }];
    const v = mount(language, source);
    v.edit('IMPORTANTE:');
    const runs = v.draft()!.segments;
    expect(runs.map(run => run.text).join('')).toBe('IMPORTANTE:');
    expect(runs.every(run => run.color === '#b91d23' && run.weight === 900
      && run.textStrokeWidthPt === 2 && run.textStrokeColor === '#ffffff'
      && run.disableLigatures === true)).toBe(true);
    expect(v.onSave).not.toHaveBeenCalled();
  });

  it('uses the selected insertion style when a replacement spans mixed source styles', () => {
    const source = [{ ...plain('COMMAND'), color: '#b91d23', weight: 900,
      textStrokeWidthPt: 2, textStrokeColor: '#ffffff' }, plain(' body')];
    const v = mount(language, source);
    v.edit('Texto traduzido', 0, 'COMMAND body'.length);
    const runs = v.draft()!.segments;
    expect(runs.map(run => run.text).join('')).toBe('Texto traduzido');
    expect(runs.every(run => run.color === style.color && run.textStrokeWidthPt === undefined
      && run.textStrokeColor === undefined)).toBe(true);
    expect(v.onSave).not.toHaveBeenCalled();
  });

  it('inserting a space emits a draft and saves without unmounting or exceptions', () => {
    const v = mount(language, [plain('This is a test')]);
    v.edit('This is  a test', 8);
    expect(v.textarea.value).toBe('This is  a test');
    expect(v.draft()?.segments.map(r => r.text).join('')).toBe('This is  a test');
    expect(v.draft()?.managedSourceSymbols).toEqual([]);
    expect(v.container.querySelector('.rse-panel')).not.toBeNull();
    fireEvent.click(v.getByText('💾 Save'));
    expect(v.onSave.mock.calls.at(-1)?.[0].segments.map((r: Segment) => r.text).join('')).toBe('This is  a test');
  });

  it('adjusts line spacing in the live draft and round-trips it with the translation', () => {
    const v = mount(language, [plain('Header:\nBody text')], undefined, 1.38);
    const spacing = v.getByRole('spinbutton', { name: language === 'pt-BR' ? 'Entrelinha' : 'Line spacing' }) as HTMLInputElement;
    expect(spacing.value).toBe('1.38');
    fireEvent.change(spacing, { target: { value: '1.50' } });
    expect(v.draft()?.lineHeight).toBe(1.5);
    fireEvent.click(v.getByText('💾 Save'));
    const saved = v.onSave.mock.calls.at(-1)![0] as SpanOverride;
    expect(saved.lineHeight).toBe(1.5);
    expect(decodeOverrideData(JSON.parse(JSON.stringify(encodeOverrideData(saved))))?.lineHeight).toBe(1.5);
  });

  it('spaces before/after an element preserve identity, metrics and neighboring styles', () => {
    const source = [plain('Before '), symbol(), { ...plain(' after'), weight: 700 }];
    const v = mount(language, source); const token = editableTextForSegments([symbol()], language);
    for (const [text, caret] of [
      [`Before  ${token} after`, 7], [`Before  ${token}  after`, 8 + token.length],
      [`Before ${token}  after`, 6], [`Before ${token} after`, 8 + token.length],
      [`Before! ${token} after`, 6], [`Before! ${token} after!`, 8 + token.length],
    ] as const) {
      v.edit(text, caret);
      const runs = v.draft()?.segments ?? source;
      expect(runs.filter(r => r.symbolId)).toEqual([symbol()]);
      expect(runs.filter(r => r.text.includes('after')).every(r => r.weight === 700)).toBe(true);
      if (v.draft()) expect(v.draft()!.managedSourceSymbols).toEqual(['tag.status.icon']);
    }
    expect(source[0].text).toBe('Before ');
  });

  it('keeps adoption after an inserted source element is deleted; undo/redo restore it', () => {
    const v = mount(language, [plain('Before after')]);
    fireEvent.click(v.getByRole('button', { name: language === 'en' ? 'Open symbol palette' : 'Abrir paleta de símbolos' }));
    const token = editableTextForSegments([symbol()], language);
    v.textarea.setSelectionRange(7, 7); fireEvent.select(v.textarea);
    fireEvent.click(v.getByText(language === 'en' ? 'Status icon' : 'Ícone status'));
    expect(v.textarea.value).toBe(`Before ${token}after`);
    expect(v.draft()!.managedSourceSymbols).toContain('tag.status.icon');
    v.edit('Before after', 7, 7 + token.length);
    // Add another ordinary edit so the draft differs from the initial text.
    v.edit('Before after!', 12);
    expect(v.draft()!.segments.some(r => r.symbolId)).toBe(false);
    expect(v.draft()!.managedSourceSymbols).toContain('tag.status.icon');
    fireEvent.click(v.getByText(language === 'en' ? 'Undo' : 'Desfazer'));
    fireEvent.click(v.getByText(language === 'en' ? 'Undo' : 'Desfazer'));
    expect(v.textarea.value).toBe(`Before ${token}after`);
    fireEvent.keyDown(v.textarea, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(v.textarea, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(v.textarea.value).toBe('Before after!');
    fireEvent.click(v.getByText('💾 Save'));
    const saved = v.onSave.mock.calls.at(-1)![0] as SpanOverride;
    expect(decodeOverrideData(JSON.parse(JSON.stringify(encodeOverrideData(saved))))!.managedSourceSymbols).toContain('tag.status.icon');
  });

  it('typing, punctuation, newlines and ordinary replacement preserve unchanged neighbors', () => {
    const source = [{ ...plain('Bold '), weight: 700 }, symbol(), { ...plain(' tail'), style: 'italic' as const }];
    const v = mount(language, source); const token = editableTextForSegments([symbol()], language);
    v.edit(`Bold! ${token} tail`, 4);
    v.edit(`Bold! ${token} tail\nnext`, 6 + token.length + 5);
    v.edit(`Bold! ${token} NEW\nnext`, 7 + token.length, 11 + token.length);
    const draft = v.draft()!;
    expect(draft.segments.find(r => r.text === 'Bold')?.weight).toBe(700);
    expect(draft.segments.filter(r => r.symbolId)).toEqual([symbol()]);
    expect(draft.segments.map(r => r.text).join('')).toBe('Bold! \uFFFC NEW\nnext');
    expect(source.at(-1)?.text).toBe(' tail');
    fireEvent.click(v.getByText(language === 'en' ? 'Confirm' : 'Confirmar'));
    expect(v.queryByRole('textbox')).toBeNull();
    fireEvent.click(v.getByText('💾 Save'));
    expect(v.onSave.mock.calls.at(-1)![0].segments).toEqual(draft.segments);
  });

  it('edits at the start, middle and end, and removes an allowed line break without damaging an adjacent symbol', () => {
    const source = [{ ...plain('Before '), weight: 700 }, symbol(), { ...plain(' after'), style: 'italic' as const }];
    const v = mount(language, source); const token = editableTextForSegments([symbol()], language);
    const expectSourceSymbolIntact = () => {
      expect(v.draft()!.segments.filter(run => run.symbolId)).toEqual([symbol()]);
    };

    v.edit(`!Before ${token} after`, 0);
    expectSourceSymbolIntact();
    v.edit(`!BeforeX ${token} after`, 8);
    expectSourceSymbolIntact();
    const withEndInsertion = `!BeforeX ${token} after!`;
    v.edit(withEndInsertion, withEndInsertion.length);
    expectSourceSymbolIntact();
    v.edit(`!BeginX ${token} after!`, 1, 7);
    expectSourceSymbolIntact();
    const withLineBreak = `!BeginX ${token} after!\nnext`;
    v.edit(withLineBreak, withLineBreak.length);
    expectSourceSymbolIntact();
    const withoutLineBreak = `!BeginX ${token} after!next`;
    v.edit(withoutLineBreak, withoutLineBreak.length);
    expectSourceSymbolIntact();

    const draft = v.draft()!;
    const finalText = `!BeginX ${token} after!next`;
    expect(v.textarea.value).toBe(finalText);
    const segmentText = draft.segments.map(run => run.text).join('');
    const runAt = (position: number) => {
      let offset = 0;
      return draft.segments.find(run => {
        const end = offset + run.text.length;
        const containsPosition = position >= offset && position < end;
        offset = end;
        return containsPosition;
      });
    };
    expect(runAt(segmentText.indexOf('Begin') + 2)?.weight).toBe(700);
    expect(runAt(segmentText.indexOf('after'))?.style).toBe('italic');
    expect(segmentText).toBe(`!BeginX \uFFFC after!next`);
  });

  it.each(['Backspace', 'Delete'])('%s treats a source object atomically and retains intentional deletion', key => {
    const v = mount(language, [plain('Left '), symbol(), plain(' right')]);
    const token = editableTextForSegments([symbol()], language);
    const cursor = key === 'Backspace' ? 5 + token.length : 5;
    v.textarea.setSelectionRange(cursor, cursor); fireEvent.select(v.textarea);
    fireEvent.keyDown(v.textarea, { key });
    expect(v.textarea.value).toBe('Left  right');
    expect(v.draft()!.segments.some(r => r.symbolId)).toBe(false);
    expect(v.draft()!.managedSourceSymbols).toEqual(['tag.status.icon']);
    fireEvent.keyDown(v.textarea, { key: 'z', ctrlKey: true });
    expect(v.textarea.value).toBe(`Left ${token} right`);
    fireEvent.keyDown(v.textarea, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(v.textarea.value).toBe('Left  right');
  });

  it('copy/cut expand partial tokens, paste and save/remount preserve IDs and metrics', () => {
    const original = [plain('Left '), symbol(), { ...plain(' right'), weight: 700 }];
    const v = mount(language, original); const token = editableTextForSegments([symbol()], language);
    v.textarea.setSelectionRange(6, 7); fireEvent.select(v.textarea);
    const clipboardValues = new Map<string, string>();
    const clipboard = { setData: vi.fn((mime: string, value: string) => clipboardValues.set(mime, value)),
      getData: (mime: string) => clipboardValues.get(mime) ?? '' };
    fireEvent.copy(v.textarea, { clipboardData: clipboard });
    expect(clipboardValues.get('text/plain')).toBe(token);
    expect(clipboardValues.has(INLINE_CLIPBOARD_MIME)).toBe(true);
    fireEvent.cut(v.textarea, { clipboardData: clipboard });
    expect(v.textarea.value).toBe('Left  right');
    v.textarea.setSelectionRange(5, 5); fireEvent.select(v.textarea);
    fireEvent.paste(v.textarea, { clipboardData: clipboard });
    v.edit(`Left ${token} right!`, 11 + token.length);
    expect(v.draft()!.segments.filter(r => r.symbolId)).toEqual([symbol()]);
    fireEvent.click(v.getByText('💾 Save'));
    const saved = v.onSave.mock.calls.at(-1)![0] as SpanOverride;
    const decoded = decodeOverrideData(JSON.parse(JSON.stringify(encodeOverrideData(saved))))!;
    v.unmount();
    const reloaded = mount(language, original, { ...saved, ...decoded });
    expect(reloaded.textarea.value).toBe(`Left ${token} right!`);
    expect(decoded.segments.filter(r => r.symbolId)).toEqual([symbol()]);
    expect(decoded.managedSourceSymbols).toEqual(['tag.status.icon']);
  });

  it('partial token replacement removes the entire object and cancel restores adoption', () => {
    const v = mount(language, [plain('Before '), symbol(), plain(' after')]);
    const token = editableTextForSegments([symbol()], language);
    v.edit(`Before ${token.slice(0, 2)}x${token.slice(4)} after`, 9, 11);
    expect(v.textarea.value).toBe('Before x after');
    expect(v.draft()!.segments.some(r => r.symbolId)).toBe(false);
    fireEvent.click(v.getByText(language === 'en' ? 'Cancel' : 'Cancelar'));
    expect(v.draft()).toBeNull();
    expect(v.container.querySelector('[data-symbol-id="tag.status.icon"]')).not.toBeNull();
  });

  it('legacy overrides do not silently adopt symbols absent from the translated text', () => {
    const existing: SpanOverride = { spanKey: `p0-${language}`, segments: [plain('Translated text')], bbox: [10, 10, 300, 60] };
    const v = mount(language, [plain('Original '), symbol()], existing);
    v.edit('Translated  text', 11);
    expect(v.draft()!.managedSourceSymbols).toEqual([]);
    expect(v.draft()!.segments.some(r => r.symbolId)).toBe(false);
  });
});

describe('RichSpanEditor translation context and state', () => {
  it('shows read-only EN source and accurately identifies an existing PT-BR override', () => {
    const source = [plain('Original Setup text')];
    const existing: SpanOverride = {
      spanKey: 'p0-pt-BR', segments: [plain('Texto já traduzido')], bbox: [10, 10, 300, 60],
    };
    const v = mount('pt-BR', source, existing);
    fireEvent.click(v.getByText('Contexto para tradução'));

    const panel = v.container.querySelector('.rse-translation-context')!;
    expect(panel.querySelector('.rse-context-source')?.textContent).toBe('Original Setup text');
    expect(panel.querySelector('.rse-context-status')?.textContent).toBe('PT-BR OVERRIDE SALVO');
    expect(panel.querySelector('input, textarea, button, [contenteditable="true"]')).toBeNull();
    expect(v.onSave).not.toHaveBeenCalled();
    v.unmount();

    const inherited = mount('pt-BR', source);
    fireEvent.click(inherited.getByText('Contexto para tradução'));
    expect(inherited.container.querySelector('.rse-context-status')?.textContent).toBe('HERDANDO EN');
  });

  it('does not claim EN inheritance while the parent is still loading saved overrides', () => {
    const v = mount('pt-BR', [plain('Original text')], undefined, 1, true);
    expect(v.container.querySelector('.rse-context-status')?.textContent).toBe('CARREGANDO ESTADO…');
  });

  it('finds case-insensitive literal glossary terms and displays canonical spelling, or the empty state', () => {
    const matched = mount('pt-BR', [plain('spell and setup; Spellbook is not Spell.')]);
    fireEvent.click(matched.getByText('Contexto para tradução'));
    const glossary = matched.container.querySelector('.rse-context-glossary')!;
    expect(glossary.textContent).toContain('Spell → Feitiço');
    expect(glossary.textContent).toContain('Setup → Preparação');
    expect(glossary.textContent).not.toContain('Spellbook');
    expect(glossary.querySelectorAll('li')).toHaveLength(2);

    const unmatched = mount('pt-BR', [plain('Qzxv has no official glossary match.')]);
    fireEvent.click(unmatched.getByText('Contexto para tradução'));
    expect(unmatched.container.querySelector('.rse-context-glossary')?.textContent)
      .toContain('Sem correspondências literais exatas.');
  });

  it('opening and closing the context leaves translation and persistence untouched', () => {
    const v = mount('pt-BR', [plain('No glossary term here')]);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const storageRemove = vi.spyOn(Storage.prototype, 'removeItem');
    const initialStorage = Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index)!;
      return [key, localStorage.getItem(key)];
    }));
    const summary = v.getByText('Contexto para tradução');
    fireEvent.click(summary);
    fireEvent.click(summary);

    expect(v.onSave).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
    expect(Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index)!;
      return [key, localStorage.getItem(key)];
    }))).toEqual(initialStorage);
    expect(v.container.querySelector('.rse-context-source')?.textContent).toBe('No glossary term here');
  });

  it('tracks inherited, unsaved, saved, edited and reset states across editor reloads', () => {
    const source = [plain('Original Setup text')];
    const inherited = mount('pt-BR', source);
    const readState = (view: typeof inherited) => view.container.querySelector('.rse-context-status')?.textContent;
    expect(readState(inherited)).toBe('HERDANDO EN');
    inherited.edit('Texto temporário');
    expect(readState(inherited)).toBe('PT-BR ALTERADO NA SESSÃO / NÃO SALVO');
    fireEvent.click(inherited.getByText('💾 Save'));
    const saved = inherited.onSave.mock.calls.at(-1)?.[0] as SpanOverride;
    inherited.unmount();

    const reloaded = mount('pt-BR', source, saved);
    expect(readState(reloaded)).toBe('PT-BR OVERRIDE SALVO');
    reloaded.edit('Texto salvo editado');
    expect(readState(reloaded)).toBe('PT-BR ALTERADO NA SESSÃO / NÃO SALVO');
    vi.stubGlobal('confirm', () => true);
    fireEvent.click(reloaded.getByText('Reset'));
    expect(reloaded.onSave.mock.calls.at(-1)?.[0]).toBeNull();
    reloaded.unmount();

    const afterResetReload = mount('pt-BR', source);
    expect(readState(afterResetReload)).toBe('HERDANDO EN');
    expect((afterResetReload.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Original Setup text');

    const english = mount('en', source);
    expect(english.container.querySelector('.rse-translation-context')).toBeNull();
    expect((english.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Original Setup text');
  });
});
