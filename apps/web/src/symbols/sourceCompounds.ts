import type { Block, SpanData } from '../components/PageRenderer';
import type { SpanOverride } from '../components/RichSpanEditor';
import type { InlineSymbolMetrics } from './semanticSymbols';
import { SYMBOL_OBJECT_MARKER } from './inlineCodec';

export interface SourceCompoundElement {
  symbolId: string;
  bbox: [number, number, number, number];
  sizePt: number;
  metrics: InlineSymbolMetrics;
  anchor: {
    blockId: string;
    blockIndex: number;
    lineId: string;
    spanStartIndex: number;
    spanEndIndex: number;
  };
}

/**
 * Join source spans into one editor object without rewriting extracted IDs or
 * indexes. The first span carries the object; the remaining source spans are
 * retained as hidden, width-preserving text for untouched-page rendering.
 */
export function attachSourceCompoundElements(blocks: Block[], elements: SourceCompoundElement[]): Block[] {
  if (!elements.length) return blocks;
  return blocks.map(block => ({
    ...block,
    lines: block.lines?.map(line => {
      const groups = elements.filter(element => element.anchor.blockId === block.id && element.anchor.lineId === line.id);
      if (!groups.length) return line;
      const spans = line.spans.map((span, spanIndex) => {
        const first = groups.find(element => element.anchor.spanStartIndex === spanIndex);
        const hidden = groups.some(element => spanIndex > element.anchor.spanStartIndex && spanIndex <= element.anchor.spanEndIndex);
        const group = first ?? groups.find(element => spanIndex > element.anchor.spanStartIndex && spanIndex <= element.anchor.spanEndIndex);
        if (!group) return { ...span, sourceSpanIndex: spanIndex };
        return {
          ...span,
          sourceSpanIndex: spanIndex,
          ...(first ? { sourceCompoundSymbolId: first.symbolId, sourceCompoundMetrics: first.metrics } : {}),
          ...(hidden ? { sourceCompoundHidden: true } : {}),
        };
      });
      return { ...line, spans };
    }),
  }));
}

function spanRef(lineId: string, index: number): string {
  return `${lineId}:${index}`;
}

/** Hide the fixed source-position composition once its owning text unit adopts it. */
export function compoundElementIsReplaced(
  element: SourceCompoundElement,
  block: Block,
  page: number,
  language: string,
  overrides: Map<string, SpanOverride>,
  selectedKey: string | null,
  draft: SpanOverride | null,
): boolean {
  const getOverride = (key: string) => {
    const override = key === selectedKey && draft !== null ? draft : overrides.get(key);
    return override;
  };
  const blockKey = block.editorKey ? `${block.editorKey}__${language}` : `page_${page}_block_${element.anchor.blockIndex}`;
  // This sidecar owns an entire source block on page 90; any saved edit of
  // that block replaces the fixed source-position capsule, even if it is an
  // older translation whose segments predate semantic IDs.
  if (getOverride(blockKey)) return true;
  const refs = Array.from({ length: element.anchor.spanEndIndex - element.anchor.spanStartIndex + 1 }, (_, offset) =>
    spanRef(element.anchor.lineId, element.anchor.spanStartIndex + offset));
  return (block.typographicUnits ?? []).some(unit => unit.field.lineIds.includes(element.anchor.lineId) && !!getOverride(`page_${page}_unit_${unit.id}__${language}`))
    || (block.typographicSpanUnits ?? []).some(unit => refs.some(ref => unit.spanRefs.includes(ref)) && !!getOverride(`page_${page}_unit_${unit.id}__${language}`))
    || (block.creditUnits ?? (block.creditUnit ? [block.creditUnit] : [])).some(unit =>
      [unit.label, unit.body].some(field => field.lineIds.includes(element.anchor.lineId)
        && !!getOverride(`page_${page}_credit_${unit.id}_${field.id}__${language}`)));
}

/** Source-edit projection: the complete multi-span tag is one stable object. */
export function sourceCompoundRun(span: SpanData): { text: string; symbolId: string; symbolMetrics?: InlineSymbolMetrics } | null {
  return span.sourceCompoundSymbolId
    ? { text: SYMBOL_OBJECT_MARKER, symbolId: span.sourceCompoundSymbolId, symbolMetrics: span.sourceCompoundMetrics }
    : null;
}
