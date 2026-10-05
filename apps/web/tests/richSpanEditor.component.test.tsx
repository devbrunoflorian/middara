import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getQueriesForElement, fireEvent as dispatchEvent } from '@testing-library/dom';
import { createRoot } from 'react-dom/client';
import { RichSpanEditor, type Segment, type SpanOverride } from '../src/components/RichSpanEditor';
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
afterEach(() => { for (const cleanup of cleanups) cleanup(); });
const style = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
const plain = (text: string): Segment => ({ ...style, text });
const symbol = (): Segment => ({ ...style, text: '\uFFFC', symbolId: 'tag.status.icon', symbolMetrics: { widthEm: .9, heightEm: 1, verticalAlignEm: .2 } });

function mount(language: 'en' | 'pt-BR', runs: Segment[], existingOverride?: SpanOverride) {
  const onDraftChange = vi.fn(); const onSave = vi.fn();
  const view = render(<RichSpanEditor spanKey={`p0-${language}`} pageNumber={37} language={language}
    originalText={runs.map(r => r.text).join('')} originalSegments={runs}
    originalFont={style.font} originalSize={10} originalColor={style.color} originalWeight={400}
    originalStyle="normal" bbox={[10, 10, 300, 60]} onClose={vi.fn()} onSave={onSave}
    onDraftChange={onDraftChange} existingOverride={existingOverride} />);
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
    fireEvent.click(v.getByText(language === 'en' ? 'Redo' : 'Refazer'));
    fireEvent.click(v.getByText(language === 'en' ? 'Redo' : 'Refazer'));
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
