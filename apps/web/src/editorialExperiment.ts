import experimentData from './experiments/page14-editorial-ab-2026-10-12.json';
import type { LayoutFrame } from './components/PageRenderer';
import type { SpanOverride } from './components/RichSpanEditor';
import blindSnapshot from './experiments/page14-editorial-ab-v2-2026-10-12-blind-snapshot.json';
import v3InitialConditions from './experiments/page14-editorial-ab-v3-initial-conditions.json';
import v3CopyfitState from './experiments/page14-editorial-ab-v3-copyfit-state.json';

export type Page14ExperimentVariant = 'EN' | 'PT' | 'A' | 'B';
export type Page14DraftVariant = 'A' | 'B';
export type Page14V2Variant = 'EN' | 'PT' | 'X' | 'Y';
export type Page14V2BlindVariant = 'X' | 'Y';
export type Page14V3Condition = 'A' | 'B';
export type Page14V3Variant = 'EN' | 'PT' | Page14V3Condition;

const PAGE14_V2_EXPERIMENT_ID = 'page14-editorial-ab-v2-2026-10-12';
const PAGE14_V2_VOTE_STORAGE_KEY = 'middara:editorial-ab-v2:page14:votes';
export const PAGE14_V3_EXPERIMENT_ID = 'page14-editorial-ab-v3-2026-10-12';

// Temporary PageRenderer-only structural correction for the four numbered
// phases. It is deliberately separate from the frozen V2/V3 frame snapshots.
export const PAGE14_V3_HANGING_INDENT_BLOCK_KEYS = new Set([
  'page_14_block_1',
  'page_14_block_5',
  'page_14_block_6',
  'page_14_block_7',
]);

interface V3StyleRange {
  text: string;
  occurrence?: number;
  font: string;
  size: number;
  weight: number;
  style: 'normal' | 'italic';
}

interface V3Candidate {
  proposedText: string;
  styles: V3StyleRange[];
}

interface V3InitialConditions {
  experimentId: string;
  pageNumber: number;
  sourceSnapshot: string;
  conditions: Record<Page14V3Condition, {
    resourceSet: string;
    units: Record<string, V3Candidate>;
  }>;
}

export const PAGE14_V3_INITIAL = v3InitialConditions as unknown as V3InitialConditions;

export interface V3ProposalMeasurement {
  viewport: string;
  devicePixelRatio: number;
  zoomLevel: number;
  measuredAtUTC: string;
  lineCount: number;
  inkHeightPx: number;
  frameHeightPx: number;
  maxLineWidthPx: number;
  frameWidthPx: number;
  leftEdgeOverflowPx: number;
  rightEdgeOverflowPx: number;
  bottomOverflowPx: number;
  topEdgeOverflowPx?: number;
  markerHeadingGapPx: number | null;
  markerXPt?: number | null;
  bodyLineStartXsPt?: number[];
  usefulListWidthPt?: number | null;
  hangingIndentSpreadPt?: number | null;
  listStructureValid?: boolean | null;
  structuralStatus?: 'compatible' | 'suspect' | 'review-required';
  structuralReasons?: string[];
  nextUnitKey: string | null;
  spaceToNextPx: number | null;
  overflow: boolean;
  collision: boolean;
}

interface V3CopyfitUnit {
  revisionCount: number;
  status: string;
  historicalStatusBeforeStructuralCorrection?: string;
  proposedText: string;
  revisionReason?: string;
  blockReason?: string;
  sourcePreservedReason?: string;
  editorialNotes?: string[];
  underCompositionJustification?: string;
  proposalMeasurement?: V3ProposalMeasurement;
  derivedRevision?: {
    id: string;
    derivedFrom: string;
    reason: string;
    proposedText: string;
    status: string;
    blockReason?: string;
    editorialNotes?: string[];
    measurement?: V3ProposalMeasurement;
    priorAttempts?: Array<{
      id: string;
      status: string;
      proposedText: string;
      measurement?: Partial<V3ProposalMeasurement>;
    }>;
  };
}

interface V3CopyfitState {
  experimentId: string;
  pageNumber: number;
  status: string;
  revisionBudgetPerUnit: number;
  measurementBasis?: string;
  sourcePdfVisualLineCounts?: Record<string, number>;
  measurementEnvironment?: {
    viewport: string;
    devicePixelRatio: number;
    zoomLevel: number;
    measuredAtUTC: string;
    browser: string;
    renderer: string;
  };
  structuralCorrectionMeasurement?: Record<string, unknown>;
  baselineEN?: Record<string, V3ProposalMeasurement>;
  conditions: Record<Page14V3Condition, {
    resourceSet: string;
    units: Record<string, V3CopyfitUnit>;
  }>;
}

export const PAGE14_V3_COPYFIT = v3CopyfitState as unknown as V3CopyfitState;

export function getPage14V3CurrentCandidate(condition: Page14V3Condition, spanKey: string) {
  const initial = PAGE14_V3_INITIAL.conditions[condition].units[spanKey];
  const current = PAGE14_V3_COPYFIT.conditions[condition].units[spanKey];
  if (!initial || !current) return null;
  const derived = current.derivedRevision;
  return {
    ...initial,
    ...current,
    proposedText: derived?.proposedText ?? current.proposedText,
    status: derived?.status ?? current.status,
    blockReason: derived?.blockReason ?? current.blockReason,
    editorialNotes: derived?.editorialNotes ?? current.editorialNotes,
  };
}

export function normalizePage14V3UnitKey(spanKey: string | null): string | null {
  if (!spanKey) return null;
  const legacyBlockKey = spanKey.replace(/__(?:en|pt-BR)$/i, '');
  return PAGE14_V2_SNAPSHOT.units.some(unit => unit.spanKey === legacyBlockKey)
    ? legacyBlockKey
    : null;
}

interface V2StyleRange {
  text: string;
  occurrence?: number;
  font: string;
  size: number;
  weight: number;
  style: 'normal' | 'italic';
}

interface V2Candidate {
  proposedText: string;
  styles: V2StyleRange[];
}

interface V2Unit {
  spanKey: string;
  sourceText: string;
  ptCurrentStatus: string;
  baselineFrame: LayoutFrame;
  x: V2Candidate;
  y: V2Candidate;
}

interface V2Snapshot {
  experimentId: string;
  pageNumber: number;
  baselineFrames: Record<string, LayoutFrame>;
  units: V2Unit[];
}

export interface Page14V2Vote {
  unitKey: string;
  preference: 'X' | 'Y' | 'tie' | 'neither';
  note: string;
  savedAt: string;
}

export const PAGE14_V2_SNAPSHOT = blindSnapshot as unknown as V2Snapshot;
export const PAGE14_V2_VOTE_STORAGE_KEY_EXPORTED = PAGE14_V2_VOTE_STORAGE_KEY;

export function isPage14V2BlindVariant(variant: Page14V2Variant | null): variant is Page14V2BlindVariant {
  return variant === 'X' || variant === 'Y';
}

function sourceFormattedText(spanKey: string, proposedText: string): string {
  if (!['page_14_block_1', 'page_14_block_5', 'page_14_block_6', 'page_14_block_7'].includes(spanKey)) {
    return proposedText;
  }
  const match = proposedText.match(/^([1-4]\.)(?:\t| )+([^:]+:)(?:\t|[\u00a0 ])+(.*)$/s);
  if (!match) return proposedText;
  // Restore the source's tab-separated numbered marker and non-breaking space
  // after the phase heading. This is source structure, not copyfitting padding.
  return `${match[1]}\t${match[2]}\u00a0${match[3]}`;
}

function findStyleRanges(text: string, styles: Array<V2StyleRange | V3StyleRange>) {
  return styles.map(style => {
    let start = -1;
    let from = 0;
    const occurrence = style.occurrence ?? 0;
    for (let index = 0; index <= occurrence; index += 1) {
      start = text.indexOf(style.text, from);
      if (start < 0) break;
      from = start + style.text.length;
    }
    if (start < 0) throw new Error(`Missing V2 style marker: ${style.text}`);
    return { start, end: start + style.text.length, style };
  }).sort((a, b) => a.start - b.start);
}

function buildV3Override(spanKey: string, candidate: V3Candidate, frame: LayoutFrame): SpanOverride {
  const text = sourceFormattedText(spanKey, candidate.proposedText);
  const ranges = findStyleRanges(text, candidate.styles);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) {
      throw new Error(`Overlapping V3 rich-text markers in ${spanKey}`);
    }
  }
  const segments: SpanOverride['segments'] = [];
  const append = (value: string, style?: V3StyleRange) => {
    if (!value) return;
    segments.push({
      text: value,
      font: style?.font ?? 'OptimaLTStd',
      size: style?.size ?? 10,
      color: '#231f20',
      weight: style?.weight ?? 400,
      style: style?.style ?? 'normal',
    });
  };
  let cursor = 0;
  for (const range of ranges) {
    append(text.slice(cursor, range.start));
    append(text.slice(range.start, range.end), range.style);
    cursor = range.end;
  }
  append(text.slice(cursor));
  const x = frame.x ?? 0;
  const y = frame.y ?? 0;
  const width = frame.width ?? 1;
  const height = frame.height ?? 1;
  return {
    spanKey,
    bbox: [x, y, x + width, y + height],
    textAlign: frame.textAlign ?? 'left',
    lineHeight: frame.lineHeight ?? 1.1,
    segments,
  };
}

export function getPage14V3CurrentOverrides(
  condition: Page14V3Condition,
  runtimeBlockedUnits: ReadonlySet<string> = new Set(),
): Map<string, SpanOverride> {
  const frames = PAGE14_V2_SNAPSHOT.baselineFrames;
  const currentUnits = PAGE14_V3_COPYFIT.conditions[condition].units;
  return new Map(Object.keys(currentUnits).flatMap(spanKey => {
    const current = getPage14V3CurrentCandidate(condition, spanKey);
    if (!current) return [];
    // Blocked or untranslated text remains inspectable in the lab panel, but
    // the page renders the source fallback instead of presenting it as PT-BR.
    if (runtimeBlockedUnits.has(spanKey)
      || current.status.startsWith('blocked')
      || current.status.startsWith('source-en-preserved')) return [];
    const frame = frames[spanKey];
    if (!frame) throw new Error(`Missing V3 baseline frame for ${spanKey}`);
    const initial = PAGE14_V3_INITIAL.conditions[condition].units[spanKey];
    if (!initial) throw new Error(`Missing V3 initial candidate for ${spanKey}`);
    const candidate = { proposedText: current.proposedText, styles: initial.styles };
    return [[spanKey, buildV3Override(spanKey, candidate, frame)] as const];
  }));
}

export function getPage14V3Frames(): Map<string, LayoutFrame> {
  return new Map(Object.entries(PAGE14_V2_SNAPSHOT.baselineFrames)
    .map(([key, frame]) => [key, structuredClone(frame)]));
}

export function readPage14V3ExperimentLocation(search: string): {
  pageNumber: number;
  variant: Page14V3Variant;
} | null {
  const params = new URLSearchParams(search);
  if (params.get('experiment') !== PAGE14_V3_EXPERIMENT_ID) return null;
  const variant = params.get('variant');
  if (variant !== 'EN' && variant !== 'PT' && variant !== 'A' && variant !== 'B') return null;
  return { pageNumber: PAGE14_V3_INITIAL.pageNumber, variant };
}

export function updatePage14V3ExperimentLocation(href: string, variant: Page14V3Variant | null): string {
  const url = new URL(href);
  if (variant) {
    url.searchParams.set('page', String(PAGE14_V3_INITIAL.pageNumber));
    url.searchParams.set('experiment', PAGE14_V3_EXPERIMENT_ID);
    url.searchParams.set('variant', variant);
  } else if (url.searchParams.get('experiment') === PAGE14_V3_EXPERIMENT_ID) {
    url.searchParams.delete('page');
    url.searchParams.delete('experiment');
    url.searchParams.delete('variant');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function buildV2Override(unit: V2Unit, variant: Page14V2BlindVariant): SpanOverride {
  const candidate = unit[variant.toLowerCase() as 'x' | 'y'];
  const text = sourceFormattedText(unit.spanKey, candidate.proposedText);
  const ranges = findStyleRanges(text, candidate.styles);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) {
      throw new Error(`Overlapping V2 rich-text markers in ${unit.spanKey}`);
    }
  }
  const segments: SpanOverride['segments'] = [];
  const append = (value: string, style?: V2StyleRange) => {
    if (!value) return;
    segments.push({
      text: value,
      font: style?.font ?? 'OptimaLTStd',
      size: style?.size ?? 10,
      color: '#231f20',
      weight: style?.weight ?? 400,
      style: style?.style ?? 'normal',
    });
  };
  let cursor = 0;
  for (const range of ranges) {
    append(text.slice(cursor, range.start));
    append(text.slice(range.start, range.end), range.style);
    cursor = range.end;
  }
  append(text.slice(cursor));
  const frame = unit.baselineFrame;
  const x = frame.x ?? 0;
  const y = frame.y ?? 0;
  const width = frame.width ?? 1;
  const height = frame.height ?? 1;
  return {
    spanKey: unit.spanKey,
    bbox: [x, y, x + width, y + height],
    textAlign: frame.textAlign ?? 'left',
    lineHeight: frame.lineHeight ?? 1.1,
    segments,
  };
}

export function getPage14V2ExperimentalOverrides(variant: Page14V2BlindVariant): Map<string, SpanOverride> {
  return new Map(PAGE14_V2_SNAPSHOT.units.map(unit => [unit.spanKey, buildV2Override(unit, variant)]));
}

export function getPage14V2ExperimentalFrames(): Map<string, LayoutFrame> {
  return new Map(Object.entries(PAGE14_V2_SNAPSHOT.baselineFrames)
    .map(([key, frame]) => [key, structuredClone(frame)]));
}

export function readPage14V2ExperimentLocation(search: string): {
  pageNumber: number;
  variant: Page14V2Variant;
} | null {
  const params = new URLSearchParams(search);
  if (params.get('experiment') !== PAGE14_V2_EXPERIMENT_ID) return null;
  const variant = params.get('variant');
  if (variant !== 'EN' && variant !== 'PT' && variant !== 'X' && variant !== 'Y') return null;
  return { pageNumber: PAGE14_V2_SNAPSHOT.pageNumber, variant };
}

export function updatePage14V2ExperimentLocation(href: string, variant: Page14V2Variant | null): string {
  const url = new URL(href);
  if (variant) {
    url.searchParams.set('page', String(PAGE14_V2_SNAPSHOT.pageNumber));
    url.searchParams.set('experiment', PAGE14_V2_EXPERIMENT_ID);
    url.searchParams.set('variant', variant);
  } else if (url.searchParams.get('experiment') === PAGE14_V2_EXPERIMENT_ID) {
    url.searchParams.delete('page');
    url.searchParams.delete('experiment');
    url.searchParams.delete('variant');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loadPage14V2Votes(): Page14V2Vote[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(PAGE14_V2_VOTE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((vote): vote is Page14V2Vote => Boolean(vote)
      && typeof vote.unitKey === 'string'
      && ['X', 'Y', 'tie', 'neither'].includes(vote.preference)
      && typeof vote.note === 'string'
      && typeof vote.savedAt === 'string'
      && PAGE14_V2_SNAPSHOT.units.some(unit => unit.spanKey === vote.unitKey));
  } catch {
    return [];
  }
}

export function savePage14V2Vote(votes: Page14V2Vote[], vote: Page14V2Vote): Page14V2Vote[] {
  const next = [...votes.filter(item => item.unitKey !== vote.unitKey), vote];
  window.localStorage.setItem(PAGE14_V2_VOTE_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function loadPage14V2RevealData(): Promise<{
  mapping: Record<Page14V2BlindVariant, 'A' | 'B'>;
  evaluation: { variants: Record<Page14V2BlindVariant, { summary: string; units: Record<string, string> }> };
}> {
  const [mapModule, evaluationModule] = await Promise.all([
    import('./experiments/page14-editorial-ab-v2-2026-10-12-reveal-map.json'),
    import('./experiments/page14-editorial-ab-v2-2026-10-12-technical-evaluation.json'),
  ]);
  return {
    mapping: mapModule.default.mapping as Record<Page14V2BlindVariant, 'A' | 'B'>,
    evaluation: evaluationModule.default as unknown as { variants: Record<Page14V2BlindVariant, { summary: string; units: Record<string, string> }> },
  };
}

interface ExperimentVariantData {
  override: SpanOverride;
}

interface ExperimentUnitData {
  spanKey: string;
  baseFrameKey: string;
  baseFrame: LayoutFrame;
  variants: Record<Page14DraftVariant, ExperimentVariantData>;
}

interface Page14ExperimentData {
  id: string;
  pageNumber: number;
  units: ExperimentUnitData[];
  baselineFrames: Record<string, LayoutFrame>;
  method: { isolation: string };
}

export const PAGE14_EDITORIAL_EXPERIMENT = experimentData as unknown as Page14ExperimentData;

export function isPage14DraftVariant(variant: Page14ExperimentVariant | null): variant is Page14DraftVariant {
  return variant === 'A' || variant === 'B';
}

export function getPage14ExperimentalOverrides(variant: Page14DraftVariant): Map<string, SpanOverride> {
  return new Map(PAGE14_EDITORIAL_EXPERIMENT.units.map(unit => [
    unit.spanKey,
    structuredClone(unit.variants[variant].override),
  ]));
}

export function getPage14ExperimentalFrames(): Map<string, LayoutFrame> {
  return new Map(Object.entries(PAGE14_EDITORIAL_EXPERIMENT.baselineFrames)
    .map(([key, frame]) => [key, structuredClone(frame)]));
}

export function readPage14ExperimentLocation(search: string): {
  pageNumber: number;
  variant: Page14ExperimentVariant;
} | null {
  const params = new URLSearchParams(search);
  if (params.get('experiment') !== PAGE14_EDITORIAL_EXPERIMENT.id) return null;
  const variant = params.get('variant');
  if (variant !== 'EN' && variant !== 'PT' && variant !== 'A' && variant !== 'B') return null;
  return { pageNumber: PAGE14_EDITORIAL_EXPERIMENT.pageNumber, variant };
}

export function updatePage14ExperimentLocation(href: string, variant: Page14ExperimentVariant | null): string {
  const url = new URL(href);
  if (variant) {
    url.searchParams.set('page', String(PAGE14_EDITORIAL_EXPERIMENT.pageNumber));
    url.searchParams.set('experiment', PAGE14_EDITORIAL_EXPERIMENT.id);
    url.searchParams.set('variant', variant);
  } else {
    url.searchParams.delete('page');
    url.searchParams.delete('experiment');
    url.searchParams.delete('variant');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
