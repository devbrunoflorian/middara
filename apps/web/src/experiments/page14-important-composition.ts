import type { Segment, SpanOverride } from '../components/RichSpanEditor';
import { SYMBOL_OBJECT_MARKER } from '../symbols/inlineCodec';
import { getSemanticSymbol } from '../symbols/semanticSymbols';

export const PAGE14_IMPORTANT_COMPOSITION_EXPERIMENT_ID = 'page14-important-composition-proof-2026-10-13';

export type Page14ImportantCompositionVariant = 'EN' | 'PT' | 'candidate';

export const PAGE14_IMPORTANT_SOURCE_UNITS = [
  'p14-block-16-font-size-10pt-unit-00',
  'p14-block-16-font-size-9pt-unit-01',
  'p14-block-16-font-size-10pt-unit-02',
] as const;

export const PAGE14_IMPORTANT_BLOCK_KEY = 'page_14_block_2';
export const PAGE14_IMPORTANT_SOURCE_FRAME: SpanOverride['bbox'] = [
  111.68499755859375,
  288.2529296875,
  389.0684509277344,
  322.2129211425781,
];
/** Content-image boundary around the callout plus the following worked example. */
export const PAGE14_IMPORTANT_PANEL_FRAME: SpanOverride['bbox'] = [
  98.95709991455078,
  276.53997802734375,
  411.43701171875,
  377.3399963378906,
];

export interface ExplicitStyleMapping {
  id: string;
  targetText: string;
  sourceSpanRefs: string[];
  style: Omit<Segment, 'text' | 'symbolId' | 'symbolMetrics' | 'sourceRendering'>;
}

export interface ExplicitStyleInterval extends ExplicitStyleMapping {
  start: number;
  end: number;
}

export interface CompositionOwnerRange {
  sourceUnitId: typeof PAGE14_IMPORTANT_SOURCE_UNITS[number];
  start: number;
  end: number;
  text: string;
  symbolId?: string;
}

interface ProposalPart {
  sourceUnitId: typeof PAGE14_IMPORTANT_SOURCE_UNITS[number];
  text: string;
  styleMappingId?: string;
  symbolId?: string;
}

/**
 * Map style only from an explicit range in the final target projection.
 * Repeated anchors are rejected; callers must resolve the ambiguity instead
 * of guessing which occurrence corresponds to the source emphasis.
 */
export function mapExplicitStyleIntervals(
  finalText: string,
  mappings: ExplicitStyleMapping[],
): ExplicitStyleInterval[] {
  const intervals = mappings.map(mapping => {
    if (!mapping.targetText) throw new Error(`Empty style anchor: ${mapping.id}`);
    const positions: number[] = [];
    let from = 0;
    while (from <= finalText.length - mapping.targetText.length) {
      const found = finalText.indexOf(mapping.targetText, from);
      if (found < 0) break;
      positions.push(found);
      from = found + 1;
    }
    if (positions.length !== 1) {
      throw new Error(`Style anchor ${mapping.id} must occur once in the final target; found ${positions.length}.`);
    }
    return { ...mapping, start: positions[0], end: positions[0] + mapping.targetText.length };
  }).sort((a, b) => a.start - b.start);

  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start < intervals[index - 1].end) {
      throw new Error(`Explicit style intervals overlap: ${intervals[index - 1].id} / ${intervals[index].id}.`);
    }
  }
  return intervals;
}

const IMPORTANT_LABEL_STYLE = {
  font: 'OptimaLTStd-Black', size: 10, color: '#b91d23', weight: 900, style: 'normal' as const,
  textStrokeWidthPt: 2, textStrokeColor: '#ffffff', disableLigatures: true,
};
const BASE_BODY_STYLE = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };

const proposalParts: ProposalPart[] = [
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[0], text: SYMBOL_OBJECT_MARKER, symbolId: 'tag.important.icon' },
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[0], text: 'IMPORTANTE:', styleMappingId: 'label' },
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[0], text: ' Durante o ' },
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[0], text: '1º', styleMappingId: 'first-turn' },
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[0], text: ' turno de cada Aventureiro no Encontro, não se ganha ' },
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[1], text: 'SP', styleMappingId: 'stamina-points' },
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[2], text: ' na Fase de Manutenção. Veja ' },
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[2], text: 'Fases do Turno de um Aventureiro', styleMappingId: 'cross-reference' },
  { sourceUnitId: PAGE14_IMPORTANT_SOURCE_UNITS[2], text: ', pág. 37.' },
];

const styleMappings: ExplicitStyleMapping[] = [
  {
    id: 'label', targetText: 'IMPORTANTE:', sourceSpanRefs: ['line_16_1:0'],
    style: IMPORTANT_LABEL_STYLE,
  },
  {
    id: 'stamina-points', targetText: 'SP', sourceSpanRefs: ['line_16_1:3'],
    style: { ...BASE_BODY_STYLE, font: 'OptimaLTStd-Bold', size: 9, weight: 700 },
  },
  {
    id: 'first-turn', targetText: '1º', sourceSpanRefs: ['line_16_2:1'],
    style: { ...BASE_BODY_STYLE, font: 'OptimaLTStd-Bold', weight: 700 },
  },
  {
    id: 'cross-reference', targetText: 'Fases do Turno de um Aventureiro', sourceSpanRefs: ['line_16_2:3', 'line_16_3:0'],
    style: { ...BASE_BODY_STYLE, font: 'OptimaLTStd-BoldItalic', weight: 700, style: 'italic' },
  },
];

export interface Page14ImportantCompositionProof {
  targetText: string;
  override: SpanOverride;
  unitOverrides: ReadonlyMap<string, SpanOverride>;
  ownerRanges: CompositionOwnerRange[];
  styleIntervals: ExplicitStyleInterval[];
  sourceUnitIds: typeof PAGE14_IMPORTANT_SOURCE_UNITS[number][];
}

function styleSegment(part: ProposalPart, interval?: ExplicitStyleInterval): Segment {
  if (part.symbolId) {
    if (part.text !== SYMBOL_OBJECT_MARKER || part.symbolId !== 'tag.important.icon') {
      throw new Error('The IMPORTANT callout must contain one semantic lightning object marker.');
    }
    const symbol = getSemanticSymbol(part.symbolId);
    if (!symbol) throw new Error(`Unknown semantic symbol ${part.symbolId}.`);
    return {
      ...BASE_BODY_STYLE,
      text: part.text,
      size: 10,
      symbolId: part.symbolId,
      symbolMetrics: {
        widthEm: symbol.render.widthEm,
        heightEm: symbol.render.heightEm ?? symbol.render.widthEm,
        verticalAlignEm: symbol.render.verticalAlignEm,
        advanceEm: symbol.render.widthEm,
        renderVariant: 'important-outline-2pt-at-9pt',
      },
    };
  }
  return { ...BASE_BODY_STYLE, ...interval?.style, text: part.text };
}

function keyForUnit(sourceUnitId: string): string {
  return `page_14_unit_${sourceUnitId}__pt-BR`;
}

/** Initial editor values are kept as separate, session-only unit overrides. */
export function buildInitialPage14ImportantUnitOverrides(): Map<string, SpanOverride> {
  const targetText = proposalParts.map(part => part.text).join('');
  const intervals = mapExplicitStyleIntervals(targetText, styleMappings);
  const intervalsById = new Map(intervals.map(interval => [interval.id, interval]));
  const segmentsByUnit = new Map<string, Segment[]>(PAGE14_IMPORTANT_SOURCE_UNITS.map(id => [id, []]));
  let cursor = 0;
  for (const part of proposalParts) {
    const interval = part.styleMappingId ? intervalsById.get(part.styleMappingId) : undefined;
    if (part.styleMappingId && (!interval || interval.start !== cursor || interval.end !== cursor + part.text.length
      || targetText.slice(interval.start, interval.end) !== interval.targetText)) {
      throw new Error(`Style range ${part.styleMappingId} does not match its exact final target segment.`);
    }
    segmentsByUnit.get(part.sourceUnitId)!.push(styleSegment(part, interval));
    cursor += part.text.length;
  }

  const units = new Map<string, SpanOverride>();
  for (const sourceUnitId of PAGE14_IMPORTANT_SOURCE_UNITS) {
    const segments = segmentsByUnit.get(sourceUnitId)!;
    if (!segments.length) throw new Error(`The experimental unit ${sourceUnitId} has no proposal content.`);
    units.set(keyForUnit(sourceUnitId), {
      spanKey: keyForUnit(sourceUnitId),
      segments,
      // Editor geometry comes from the selected source unit. This bbox is not
      // painted; the composed PageRenderer override uses the original block frame.
      bbox: [...PAGE14_IMPORTANT_SOURCE_FRAME],
      textAlign: 'left',
      lineHeight: 1.1,
      managedSourceSymbols: segments.flatMap(segment => segment.symbolId ? [segment.symbolId] : []),
    });
  }
  return units;
}

export interface Page14ImportantFitReading {
  leftOverflowPt: number;
  rightOverflowPt: number;
  topOverflowPt: number;
  bottomOverflowPt: number;
  nextUnitGapPt: number | null;
}

/** Report measured frame overflow exactly; never hide sub-point results behind a tolerance. */
export function describePage14ImportantFit(reading: Page14ImportantFitReading): string {
  const frameOverflowPt = Math.max(
    reading.leftOverflowPt,
    reading.rightOverflowPt,
    reading.topOverflowPt,
    reading.bottomOverflowPt,
  );
  const nextGap = reading.nextUnitGapPt;
  if (nextGap !== null && nextGap < 0) {
    return `COLISÃO GEOMÉTRICA com a próxima unidade em ${Math.abs(nextGap).toFixed(2)} pt; excesso máximo medido: ${frameOverflowPt.toFixed(2)} pt.`;
  }
  if (frameOverflowPt > 0) {
    const gap = nextGap === null ? 'não medido' : `${nextGap.toFixed(2)} pt`;
    return `EXCESSO GEOMÉTRICO DE RANGE/PATH em ${frameOverflowPt.toFixed(2)} pt nesta escala; distância até a próxima unidade: ${gap}. Isso não prova corte de tinta; copy fit continua pendente.`;
  }
  const gap = nextGap === null ? 'não medida' : `${nextGap.toFixed(2)} pt`;
  return `Sem excesso geométrico medido nesta escala; distância até a próxima unidade: ${gap}. Conteúdo ainda não aprovado editorialmente.`;
}

export function buildPage14ImportantCompositionProof(
  unitOverrides: ReadonlyMap<string, SpanOverride> = buildInitialPage14ImportantUnitOverrides(),
): Page14ImportantCompositionProof {
  const missingUnit = PAGE14_IMPORTANT_SOURCE_UNITS.find(id => !unitOverrides.has(keyForUnit(id)));
  if (missingUnit) throw new Error(`Missing experimental override for source unit ${missingUnit}.`);
  const orderedUnits = PAGE14_IMPORTANT_SOURCE_UNITS.map(id => [id, unitOverrides.get(keyForUnit(id))!] as const);
  const targetText = orderedUnits.flatMap(([, override]) => override.segments).map(segment => segment.text).join('');
  const styleIntervals = styleMappings.flatMap(mapping => {
    const starts: number[] = [];
    let from = 0;
    while (from <= targetText.length - mapping.targetText.length) {
      const found = targetText.indexOf(mapping.targetText, from);
      if (found < 0) break;
      starts.push(found);
      from = found + 1;
    }
    if (starts.length !== 1) return [];
    const start = starts[0];
    const end = start + mapping.targetText.length;
    const styled = orderedUnits.flatMap(([, override]) => override.segments)
      .some(segment => segment.text === mapping.targetText
        && segment.font === mapping.style.font
        && segment.size === mapping.style.size
        && segment.color.toLowerCase() === mapping.style.color.toLowerCase()
        && segment.weight === mapping.style.weight
        && segment.style === mapping.style.style
        && (segment.textStrokeWidthPt ?? 0) === ((mapping.style as Segment).textStrokeWidthPt ?? 0)
        && (segment.textStrokeColor ?? '').toLowerCase() === (((mapping.style as Segment).textStrokeColor ?? '')).toLowerCase());
    return styled ? [{ ...mapping, start, end }] : [];
  });
  const ownerRanges: CompositionOwnerRange[] = [];
  const segments: Segment[] = [];
  let cursor = 0;
  for (const [sourceUnitId, unitOverride] of orderedUnits) {
    for (const segment of unitOverride.segments) {
      const start = cursor;
      const end = start + segment.text.length;
      segments.push({ ...segment });
      ownerRanges.push({ sourceUnitId: sourceUnitId as typeof PAGE14_IMPORTANT_SOURCE_UNITS[number], start, end, text: segment.text, symbolId: segment.symbolId });
      cursor = end;
    }
  }

  const symbolSegments = segments.filter(segment => segment.symbolId === 'tag.important.icon');
  if (symbolSegments.length !== 1) throw new Error(`Expected one lightning icon; got ${symbolSegments.length}.`);
  const sourceUnitIds = [...new Set(ownerRanges.map(range => range.sourceUnitId))];
  if (sourceUnitIds.length !== PAGE14_IMPORTANT_SOURCE_UNITS.length
    || PAGE14_IMPORTANT_SOURCE_UNITS.some(id => !sourceUnitIds.includes(id))) {
    throw new Error('The composition must keep ownership for all three original typographic units.');
  }

  return {
    targetText,
    override: {
      spanKey: PAGE14_IMPORTANT_BLOCK_KEY,
      segments,
      bbox: [...PAGE14_IMPORTANT_SOURCE_FRAME],
      textAlign: 'left',
      lineHeight: 1.1,
      managedSourceSymbols: ['tag.important.icon'],
    },
    unitOverrides: new Map(orderedUnits),
    ownerRanges,
    styleIntervals,
    sourceUnitIds,
  };
}

export function readPage14ImportantCompositionVariant(search: string): Page14ImportantCompositionVariant | null {
  const params = new URLSearchParams(search);
  if (params.get('experiment') !== PAGE14_IMPORTANT_COMPOSITION_EXPERIMENT_ID) return null;
  const variant = params.get('variant');
  return variant === 'EN' || variant === 'PT' || variant === 'candidate' ? variant : null;
}

export function updatePage14ImportantCompositionLocation(href: string, variant: Page14ImportantCompositionVariant): string {
  const url = new URL(href);
  url.searchParams.set('page', '14');
  url.searchParams.set('experiment', PAGE14_IMPORTANT_COMPOSITION_EXPERIMENT_ID);
  url.searchParams.set('variant', variant);
  return `${url.pathname}${url.search}${url.hash}`;
}
