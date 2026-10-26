import type { LineHeightMode, Segment, SpanOverride } from '../components/RichSpanEditor';

/** Older records used `1` as a CSS fallback; non-1 values are treated as custom. */
export function lineHeightModeForOverride(override: Pick<SpanOverride, 'lineHeight' | 'lineHeightMode'> | null | undefined): LineHeightMode {
  return override?.lineHeightMode
    ?? (override?.lineHeight !== undefined && Math.abs(override.lineHeight - 1) > 0.001 ? 'custom' : 'source');
}

/** Adoption is editing history, not only the objects remaining in the text. */
export function collectManagedSourceSymbols(previous: readonly string[], runs: readonly Segment[]): string[] {
  return Array.from(new Set([...previous, ...runs.flatMap(run => run.symbolId ? [run.symbolId] : [])]));
}

/** Legacy prose must not silently adopt all original PDF symbols on a text edit. */
export function initialManagedSourceSymbols(original: readonly Segment[], existing?: SpanOverride | null): string[] {
  return collectManagedSourceSymbols(existing?.managedSourceSymbols ?? [], existing ? existing.segments : original);
}

/** Preview and save serialize exactly the same contract. */
export function createEditorOverride(spanKey: string, bbox: SpanOverride['bbox'], textAlign: SpanOverride['textAlign'],
  segments: Segment[], managedSourceSymbols: readonly string[], lineHeight?: number,
  lineHeightMode: SpanOverride['lineHeightMode'] = 'source', paragraphSpacingPt?: number,
  listMarkerIndentPt?: number, hangingIndentPt?: number): SpanOverride {
  return { spanKey, bbox, textAlign, lineHeight, lineHeightMode, paragraphSpacingPt, listMarkerIndentPt, hangingIndentPt,
    segments, managedSourceSymbols: collectManagedSourceSymbols(managedSourceSymbols, segments) };
}
