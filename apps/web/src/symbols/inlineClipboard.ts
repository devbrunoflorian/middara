import type { Segment } from '../components/RichSpanEditor';
import { editableTextForSegments, expandEditorTokenSelection, SYMBOL_OBJECT_MARKER } from './inlineCodec';
import type { SymbolAliasPreferences, SymbolLanguage } from './semanticSymbols';

export const INLINE_CLIPBOARD_MIME = 'application/vnd.middara.inline-runs+json';

/** Map expanded textarea token offsets back to the one-slot rich objects. */
export function editableRangeToSegmentRange(runs: Segment[], language: SymbolLanguage, start: number, end: number, aliasPreferences?:SymbolAliasPreferences) {
  const text = editableTextForSegments(runs, language, aliasPreferences);
  const expanded = expandEditorTokenSelection(text, start, end, aliasPreferences);
  const offsetFor = (offset: number) => {
    let editableOffset = 0; let richOffset = 0;
    for (const run of runs) {
      const projection = editableTextForSegments([run], language, aliasPreferences);
      if (offset <= editableOffset + projection.length) {
        if (!run.symbolId) return richOffset + offset - editableOffset;
        const tokenWidth = projection.length / (Array.from(run.text).length || 1);
        return richOffset + Math.round((offset - editableOffset) / tokenWidth);
      }
      editableOffset += projection.length; richOffset += run.text.length;
    }
    return richOffset;
  };
  return { start: offsetFor(expanded.start), end: offsetFor(expanded.end), editable: expanded };
}

export function sliceSegmentRange(runs: Segment[], start: number, end: number): Segment[] {
  let cursor = 0;
  return runs.flatMap(run => {
    const from = Math.max(0, start - cursor); const to = Math.min(run.text.length, end - cursor);
    cursor += run.text.length;
    return to > from ? [{ ...run, text: run.text.slice(from, to) }] : [];
  });
}

export function encodeInlineClipboard(segments: Segment[], language: SymbolLanguage): string {
  return JSON.stringify({ schemaVersion: 1, language, segments });
}

/** Foreign/malformed clipboard content falls back to ordinary native paste. */
export function decodeInlineClipboard(payload: string, plainText: string, aliasPreferences?:SymbolAliasPreferences): Segment[] | null {
  try {
    const data = JSON.parse(payload);
    if (data.schemaVersion !== 1 || !['en', 'pt-BR'].includes(data.language) || !Array.isArray(data.segments)) return null;
    if (!data.segments.every((run: Segment) => run && typeof run.text === 'string' && typeof run.font === 'string'
      && typeof run.color === 'string' && Number.isFinite(run.size) && run.size > 0 && Number.isFinite(run.weight)
      && ['normal', 'italic'].includes(run.style) && (run.symbolId === undefined || typeof run.symbolId === 'string'
        && run.text.length > 0 && Array.from(run.text).every(ch => ch === SYMBOL_OBJECT_MARKER))
      && (run.symbolMetrics === undefined || run.symbolMetrics && Number.isFinite(run.symbolMetrics.widthEm)
        && run.symbolMetrics.widthEm > 0 && Number.isFinite(run.symbolMetrics.heightEm) && run.symbolMetrics.heightEm > 0
        && Number.isFinite(run.symbolMetrics.verticalAlignEm)
        && (run.symbolMetrics.trailingGapEm === undefined || Number.isFinite(run.symbolMetrics.trailingGapEm))))) return null;
    if (editableTextForSegments(data.segments, data.language, aliasPreferences) !== plainText) return null;
    return data.segments.map((run: Segment) => ({ ...run }));
  } catch { return null; }
}
