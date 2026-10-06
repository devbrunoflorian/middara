import type { Segment, SpanOverride } from '../components/RichSpanEditor';

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
  segments: Segment[], managedSourceSymbols: readonly string[], lineHeight?: number): SpanOverride {
  return { spanKey, bbox, textAlign, lineHeight, segments, managedSourceSymbols: collectManagedSourceSymbols(managedSourceSymbols, segments) };
}
