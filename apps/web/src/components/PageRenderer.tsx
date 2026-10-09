import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { RichSpanEditor, type Segment, type SpanOverride, type TextAlignment } from './RichSpanEditor';
import type { AdminSymbolPaletteEditorState } from './AdminSymbolPalette';
import { AdminRuler } from './AdminRuler';
import { AdminLayoutFrameEditor } from './AdminLayoutFrameEditor';
import type { LayoutAlignmentGuide, SnapFrameRect } from '../layoutFrameSnapping';
import { deleteLayoutFrame, fetchLayoutFrames, loadLocalLayoutFrames, saveLayoutFrame, saveLocalLayoutFrames, type LayoutLanguage } from '../layoutFrames';
import { getSemanticSymbol, resolveLegacySymbol, type InlineEditorContext, type InlineSymbolMetrics, type SymbolAliasPreferences } from '../symbols/semanticSymbols';
import { SemanticSymbol } from '../symbols/SemanticSymbol';
import { sourceSpanRuns } from '../symbols/sourceRuns';
import { compoundElementIsReplaced, type SourceCompoundElement } from '../symbols/sourceCompounds';
import { decodeOverrideData, encodeOverrideData } from '../symbols/overrideData';
import { contentsRowKey, contentsRowUsesLegacy, contentsRowLine, contentsLabelWidth, type ContentsRowDefinition } from '../contentsRows';
import { ContentsRowFlow } from './ContentsRowFlow';
import { exposesNestedSpanTargets, hasPreservedLegacySpanOverride } from '../editorUnitCompatibility';
import { sourceElementIsReplaced, sourceOverlayMask, previousSourceSpan, type SourceInlineElement } from '../symbols/sourceInlineElements';
import './PageRenderer.css';
import './Toast.css';
import { payloadApiUrl } from '../config/payloadApi';
import {
  dispatchLocalPersistenceChanged,
  loadLocalOverrides,
  LOCAL_PERSISTENCE_CHANGED_EVENT,
  persistOverrideToPayload,
  persistedOverridesEqual,
  saveLocalOverrides,
  type LocalSyncState,
} from '../localPersistence';

/* ─────────────────────────────────────────────
   Types – match the exact JSON DOM structure
   ───────────────────────────────────────────── */
export interface SpanData {
  /** Runtime inline symbol adapter; does not rewrite source extraction IDs. */
  semanticSymbolId?: string;
  /** This source occurrence must paint its vector over an incomplete page/component raster. */
  sourceRendering?: 'semantic-inline';
  /** Source text glyph represented inside a numbered semantic inline symbol. */
  sourceInlineCoveredBy?: string;
  sourceSymbolMetrics?: InlineSymbolMetrics;
  sourceSpanIndex?: number;
  /** Explicit source-reviewed whitespace slots; source paint remains unchanged. */
  sourceInlineObjects?: SourceInlineElement[];
  text: string;
  font: string;
  size: number;
  color: string;
  flags: number;
  bbox: [number, number, number, number];
  origin?: [number, number];
  /** Exact PDF paint fragments when one extracted span contains multiple baselines. */
  sourceGlyphRuns?: Array<{ start: number; end: number; origin: [number, number]; advance: number }>;
  displayOverride?: string;
  /** Per-span replacement for symbol-font encodings that need a Unicode cmap codepoint. */
  pictogramDisplayOverride?: string;
  /** Rendering-only text when source extraction includes a layout-control artifact. */
  renderTextOverride?: string;
  pictogramFontOverride?: string;
  /** Minimal SVG path for a source-confirmed glyph missing from the app's fonts. */
  pictogramSvgPath?: string;
  renderWeightOverride?: number;
  /** Browser-only glyph-size correction when PDF span metrics include oversized inline artifacts. */
  renderSizeOverridePt?: number;
  /** A duplicate PDF paint pass used only to draw the outline of a later fill pass. */
  renderOnlyStrokePass?: boolean;
  /** The source glyph is restored by a page fidelity overlay; retain its text in the DOM data. */
  renderAsSourceOverlayDuplicate?: boolean;
  /** Review identifier for a source overlay whose advance remains in text flow. */
  sourcePaintAuditId?: string;
  /** The source text spans form one semantic compound displayed from its page-space geometry. */
  sourceCompoundSymbolId?: string;
  sourceCompoundHidden?: boolean;
  sourceCompoundMetrics?: InlineSymbolMetrics;
  /** Language(s) in which the source-overlay replacement should hide this glyph. */
  renderSourceOverlayLanguage?: 'en' | 'pt-BR' | 'all';
  /** Recreate the PDF's outlined text effect on the semantic fill span. */
  renderTextStrokeWidthPt?: number;
  renderTextStrokeColor?: string;
}

export interface LineData {
  id: string;
  bbox: [number, number, number, number];
  /** Source text-flow frame; optional for extracted JSON lines. */
  availableX?: number;
  availableWidth?: number;
  renderTopOffsetPt?: number;
  /** Browser-only indentation when a filtered tiny leading glyph still occupies source advance. */
  renderTextOffsetPt?: number;
  /** Keep source PDF span advances/gaps in the untouched source view around inline symbols. */
  renderSourceSpanGeometry?: boolean;
  /** Left edge of the first source text/vector item when an inline symbol starts the line. */
  renderSourceSpanStartPt?: number;
  /** Stop source-advance locking just after the last callout on this line. */
  renderSourceGeometryThroughSpan?: number;
  /** Limit suppression of rasterized source text to the overlay's language. */
  rasterizedDuplicateLanguage?: 'en' | 'pt-BR' | 'all';
  /** Keep the Admin duplicate marker off when it would spill beyond a tightly cropped source overlay. */
  hideRasterizedDuplicateAdminMarker?: boolean;
  dir?: [number, number];
  spans: SpanData[];
  renderScaleX?: number;
}

export interface LayoutFrame {
  x: number;
  width: number;
  y?: number;
  height?: number;
  rotation?: number;
  textAlign?: TextAlignment;
  lineHeight?: number;
}

export interface Block {
  preserveLegacySpanOverrides?: boolean;
  id: string;
  /** Preserve the block's stable legacy array index while omitting it from the page canvas. */
  hiddenFromPage?: boolean;
  /** Source-confirmed physical artwork content; retained in JSON for provenance, excluded from text rendering/editing. */
  artworkOnly?: boolean;
  artworkOnlyEvidence?: {
    auditId: string;
    sourcePdfPage: number;
    region: string;
    rule: string;
    evidenceRef: string;
  };
  /** Stable semantic editor key for newly split units; legacy blocks keep their index-based key. */
  editorKey?: string;
  /** Source line indexes that render as fixed page furniture and stay outside rich-text editing. */
  staticEditorLineIndexes?: number[];
  /** Source line indexes explicitly reviewed as non-editable list markers. */
  listMarkerLineIndexes?: number[];
  /** Internal marker used by generated text rows to keep their frame attached to the list marker. */
  listFlowItem?: boolean;
  /** Available translated-flow height before the next source list item. */
  listFlowHeight?: number;
  /** Preserve a legacy whole-block translation whose list cannot be split losslessly. */
  disableAutoListMarkerDetection?: boolean;
  /** Keep source-furniture visible but unavailable to Admin editing. */
  adminReadOnly?: boolean;
  /** Keep translated content on one line inside this page-specific text frame. */
  noWrap?: boolean;
  /** Source-matched initial line-height for text overrides when the PDF has a larger row gap. */
  defaultLineHeight?: number;
  bbox: [number, number, number, number];
  layoutFrame?: LayoutFrame;
  content?: string;
  lines?: LineData[];
  font?: string;
  size?: number;
  color?: string;
  isBold?: boolean;
  isItalic?: boolean;
  zIndex?: number;
  creditUnit?: CreditUnitDefinition;
  creditUnits?: CreditUnitDefinition[];
  typographicUnits?: TypographicUnitDefinition[];
  typographicSpanUnits?: TypographicSpanUnitDefinition[];
}

export interface CreditFieldDefinition {
  id: string;
  lineIds: string[];
  bbox: [number, number, number, number];
  frame: LayoutFrame;
  links?: CreditLinkDefinition[];
}

export interface CreditLinkDefinition {
  language: 'en' | 'pt-BR';
  text: string;
  href: string;
}

export interface CreditUnitDefinition {
  id: string;
  label: CreditFieldDefinition;
  body: CreditFieldDefinition;
}

export interface TypographicUnitDefinition {
  id: string;
  /** Short source-facing label shown in the editor; not part of the persisted translation key. */
  label?: string;
  /** A source-backed editorial paragraph; its extracted line breaks are not hard breaks. */
  kind?: 'paragraph';
  field: CreditFieldDefinition;
  /** Keep a source marker anchored when a neighboring heading grows. */
  fixedPosition?: boolean;
}

export interface TypographicSpanUnitDefinition {
  id: string;
  /** `lineId:spanIndex` references identify a contiguous same-size run. */
  spanRefs: string[];
}

interface InlineSpanUnitRenderState {
  spanKey: string;
  renderAtRef?: string;
  override: SpanOverride | null;
  selected: boolean;
  /** Editorial paragraph lines route clicks to the paragraph editor while still rendering legacy span overrides. */
  interactive?: boolean;
  info: SelectedSpanInfo;
}

function buildInlineSpanStates(
  block: Block,
  pageNumber: number,
  selectedBlockKey: string | null,
  overrides: Map<string, SpanOverride>,
  draftOverride: SpanOverride | null,
  language: 'en' | 'pt-BR',
  nonInteractiveLineIds?: Set<string>,
): Map<string, InlineSpanUnitRenderState> {
  const states = new Map<string, InlineSpanUnitRenderState>();
  for (const unit of block.typographicSpanUnits ?? []) {
    const spanKey = `page_${pageNumber}_unit_${unit.id}__${language}`;
    const override = selectedBlockKey === spanKey && draftOverride
      ? draftOverride
      : overrides.get(spanKey) || null;
    const state: InlineSpanUnitRenderState = {
      spanKey,
      renderAtRef: (block.lines ?? []).flatMap(line=>line.spans.flatMap((span,index)=>
        !span.semanticSymbolId && !span.renderOnlyStrokePass && unit.spanRefs.includes(`${line.id}:${span.sourceSpanIndex ?? index}`)
          ? [`${line.id}:${span.sourceSpanIndex ?? index}`] : []))[0],
      override,
      selected: selectedBlockKey === spanKey,
      info: extractInlineSpanUnitInfo(spanKey, block, unit),
    };
    for (const spanRef of unit.spanRefs) {
      const lineId = spanRef.slice(0, spanRef.lastIndexOf(':'));
      states.set(spanRef, nonInteractiveLineIds?.has(lineId)
        ? { ...state, interactive: false }
        : state);
    }
  }
  return states;
}

export interface ImageData {
  url: string;
  bbox: [number, number, number, number];
  role?: string;
  blendMode?: string;
}

export interface PageFidelityOverlay {
  url: string;
  bbox: [number, number, number, number];
  widthPx: number;
  heightPx: number;
  language: 'en' | 'pt-BR';
  /** Physical game components stay in their source language in every viewer language. */
  languageInvariant?: boolean;
  hideInAdmin?: boolean;
  /** Optional paint layer for source shapes that belong between the page background and editable text. */
  zIndex?: number;
}

export interface PageData {
  contentsRows?:ContentsRowDefinition[];
  inlineElements?: SourceInlineElement[];
  sourceCompounds?: SourceCompoundElement[];
  page_number: number;
  width: number;
  height: number;
  backgroundUrl?: string;
  blocks: Block[];
  images: ImageData[];
  layoutObstacles?: [number, number, number, number][];
  fidelityOverlays?: PageFidelityOverlay[];
}

/* ─────────────────────────────────────────────
   Font Mapping – PDF font name → CSS stack
   ───────────────────────────────────────────── */
interface FontMapping {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  variantCaps?: 'small-caps';
}

export function mapPdfFont(pdfFontName: string): FontMapping {
  const name = pdfFontName || '';
  if (name.includes('OptimaLTStd')) {
    let weight = 400;
    let style: 'normal' | 'italic' = 'normal';
    if (name.includes('ExtraBlack')) weight = 950;
    else if (name.includes('Black')) weight = 900;
    else if (name.includes('DemiBold') || name.includes('Demi')) weight = 600;
    else if (name.includes('Medium')) weight = 500;
    else if (name.includes('Bold')) weight = 700;
    if (name.includes('Italic')) style = 'italic';
    return { family: "'OptimaLTStd', 'Optima', serif", weight, style };
  }
  if (name.includes('AGaramondPro')) {
    let weight = 400;
    let style: 'normal' | 'italic' = 'normal';
    if (name.includes('Bold')) weight = 700;
    if (name.includes('Italic')) style = 'italic';
    return { family: "'AGaramondPro', 'EB Garamond', 'Garamond', serif", weight, style };
  }
  if (name.includes('CinzelDecorative')) {
    let weight = 400;
    if (name.includes('Black')) weight = 900;
    else if (name.includes('Bold')) weight = 700;
    return { family: "'Cinzel Decorative', serif", weight, style: 'normal' };
  }
  if (name.includes('Cinzel')) {
    let weight = 400;
    if (name.includes('Black')) weight = 900;
    else if (name.includes('Bold')) weight = 700;
    return { family: "'CinzelLocal', 'Cinzel', serif", weight, style: 'normal', variantCaps: 'small-caps' };
  }
  if (name.includes('Esmeralda')) {
    return { family: "'EsmeraldaPro', 'Georgia', serif", weight: 400, style: 'normal' };
  }
  if (name.includes('Aristelle')) {
    return { family: "'AristelleSans', sans-serif", weight: 400, style: 'normal' };
  }
  if (name.includes('Wingdings3')) {
    return { family: "'Wingdings 3', sans-serif", weight: 400, style: 'normal' };
  }
  if (name.includes('Wingdings')) {
    return { family: "'WingdingsLocal', sans-serif", weight: 400, style: 'normal' };
  }
  if (name.includes('Webdings')) {
    return { family: "'WebdingsLocal', sans-serif", weight: 400, style: 'normal' };
  }
  if (name.includes('ZapfDingbats')) {
    return { family: "'Zapf Dingbats', sans-serif", weight: 400, style: 'normal' };
  }
  if (name.includes('AdobeHebrew')) {
    return { family: "'OptimaLTStd', 'Optima', serif", weight: 400, style: 'normal' };
  }
  return { family: "'OptimaLTStd', 'Optima', serif", weight: 400, style: 'normal' };
}

function segFontToCSS(f: string): string {
  if (f.includes('Optima') || f === 'OptimaLTStd') return "'OptimaLTStd', serif";
  if (f.includes('Garamond') || f === 'AGaramondPro') return "'AGaramondPro', serif";
  if (f === 'CinzelLocal' || (f.includes('Cinzel') && !f.includes('Decorative'))) return "'CinzelLocal', 'Cinzel', serif";
  if (f.includes('Decorative')) return "'Cinzel Decorative', serif";
  if (f === 'EsmeraldaPro-PUA') return "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif";
  if (f.includes('Esmeralda') || f === 'EsmeraldaPro') return "'EsmeraldaPro', serif";
  if (f.includes('Aristelle')) return "'AristelleSans', sans-serif";
  if (f.includes('Webdings')) return "'WebdingsLocal', sans-serif";
  if (f.includes('Wingdings3')) return "'Wingdings 3', sans-serif";
  if (f.includes('Wingdings')) return "'WingdingsLocal', sans-serif";
  if (f.includes('ZapfDingbats')) return "'Zapf Dingbats', sans-serif";
  if (f === 'Inter') return "'Inter', sans-serif";
  return `'${f}', serif`;
}

function renderCreditSegments(
  segments: SpanOverride['segments'],
  links: CreditLinkDefinition[] | undefined,
  language: 'en' | 'pt-BR',
  scale: number,
  isAdmin: boolean,
  whiteSpace:'pre-wrap'|'nowrap'='pre-wrap',
): React.ReactNode[] {
  const hasInlineSymbols = segments.some(hasInlineSemanticSymbol);
  const fullText = segments.map(segment => segment.text).join('');
  const ranges: { start: number; end: number; href: string }[] = [];
  for (const link of links ?? []) {
    if (link.language !== language || !link.text) continue;
    let searchFrom = 0;
    while (searchFrom < fullText.length) {
      const start = fullText.indexOf(link.text, searchFrom);
      if (start < 0) break;
      ranges.push({ start, end: start + link.text.length, href: link.href });
      searchFrom = start + link.text.length;
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  const pieces: { segment: SpanOverride['segments'][number]; text: string; href?: string }[] = [];
  let globalOffset = 0;
  segments.forEach(segment => {
    const points = new Set<number>([0, segment.text.length]);
    for (const range of ranges) {
      const start = Math.max(0, range.start - globalOffset);
      const end = Math.min(segment.text.length, range.end - globalOffset);
      if (start < end) {
        points.add(start);
        points.add(end);
      }
    }
    const sortedPoints = [...points].sort((a, b) => a - b);
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const start = sortedPoints[i];
      const end = sortedPoints[i + 1];
      if (start === end) continue;
      const absoluteStart = globalOffset + start;
      const matchingRange = ranges.find(range => absoluteStart >= range.start && absoluteStart < range.end);
      pieces.push({ segment, text: segment.text.slice(start, end), href: matchingRange?.href });
    }
    globalOffset += segment.text.length;
  });

  const groups: { href?: string; pieces: typeof pieces }[] = [];
  for (const piece of pieces) {
    const last = groups[groups.length - 1];
    if (last && last.href === piece.href) last.pieces.push(piece);
    else groups.push({ href: piece.href, pieces: [piece] });
  }

  const renderPiece = (piece: typeof pieces[number], key: string) => (
    <span key={key} style={{
      fontFamily: segFontToCSS(piece.segment.font),
      fontSize: `${piece.segment.size * scale}px`,
      fontWeight: piece.segment.weight,
      fontStyle: piece.segment.style,
      color: piece.segment.color,
      ...(piece.segment.textStrokeWidthPt ? {
        WebkitTextStroke: `${piece.segment.textStrokeWidthPt * scale}px ${piece.segment.textStrokeColor || '#231f20'}`,
        paintOrder: 'stroke fill',
      } : {}),
      whiteSpace,
      fontVariantLigatures: 'none',
      fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
      letterSpacing: hasInlineSymbols && language === 'en' ? 'normal' : '-0.015em',
    }}>{renderSegmentContent({...piece.segment,text:piece.text},scale,language)}</span>
  );

  return groups.map((group, groupIndex) => {
    const content = group.pieces.map((piece, pieceIndex) => renderPiece(piece, `${groupIndex}-${pieceIndex}`));
    if (!group.href) return <React.Fragment key={groupIndex}>{content}</React.Fragment>;
    const suppressNavigation = (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (isAdmin) event.preventDefault();
    };
    return (
      <a
        key={groupIndex}
        href={group.href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'none', cursor: isAdmin ? 'text' : 'pointer' }}
        onClick={suppressNavigation}
        onAuxClick={suppressNavigation}
      >
        {content}
      </a>
    );
  });
}

function needsEsmeraldaHeadingDrop(font: string, size: number, sourceBBoxHeight: number): boolean {
  return font.includes('EsmeraldaPro') &&
    !font.includes('Identity-H') &&
    size >= 25 &&
    sourceBBoxHeight >= size * 1.25;
}

function staticEditorLineIndexes(block: Block): Set<number> {
  return new Set(block.staticEditorLineIndexes ?? []);
}

const LIST_MARKER_GLYPHS = new Set(Array.from('•·▪■●○◦▫‣⁃'));

function sourceLineText(line: LineData): string {
  return line.spans
    .filter(span => !span.renderOnlyStrokePass)
    .map(span => span.displayOverride || span.text)
    .join('');
}

function listMarkerGlyph(line: LineData): string | null {
  const visible = Array.from(sourceLineText(line).replace(/[\s\u00a0]+/gu, ''));
  return visible.length === 1 && LIST_MARKER_GLYPHS.has(visible[0]) ? visible[0] : null;
}

/**
 * Recognize only a standalone source marker whose following text line is
 * geometrically indented beside it. This avoids changing bullets used as
 * punctuation in card labels or prose.
 */
function listMarkerLineIndexes(block: Block): Set<number> {
  const lines = block.lines ?? [];
  const indexes = new Set(block.listMarkerLineIndexes ?? []);
  if (block.disableAutoListMarkerDetection) return indexes;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (indexes.has(index)) continue;
    const glyph = listMarkerGlyph(line);
    if (!glyph) continue;
    const nextTextLine = lines.slice(index + 1).find(candidate => sourceLineText(candidate).trim().length > 0);
    if (!nextTextLine) continue;
    const markerSize = line.spans.find(span => !span.renderOnlyStrokePass)?.size ?? 10;
    const horizontalGap = nextTextLine.bbox[0] - line.bbox[0];
    const verticalDelta = Math.abs(nextTextLine.bbox[1] - line.bbox[1]);
    if (horizontalGap <= markerSize * 0.6 || horizontalGap > markerSize * 3
      || verticalDelta > Math.max(2.5, markerSize * 0.25)) continue;
    indexes.add(index);
  }
  return indexes;
}

function fixedEditorLineIndexes(block: Block): Set<number> {
  return new Set([...staticEditorLineIndexes(block), ...listMarkerLineIndexes(block)]);
}

function editableBlockLines(block: Block): LineData[] {
  const staticIndexes = fixedEditorLineIndexes(block);
  return (block.lines ?? []).filter((_, index) => !staticIndexes.has(index));
}

function normalizeStaticEditorPrefix(block: Block, override: SpanOverride | null): SpanOverride | null {
  const fixedIndexes = fixedEditorLineIndexes(block);
  if (!override || !block.lines || fixedIndexes.size === 0) return override;

  const fixedPrefix = [...fixedIndexes].sort((a, b) => a - b)
    .flatMap(index => block.lines?.[index]?.spans ?? [])
    .filter(span => !span.renderOnlyStrokePass)
    .map(span => span.displayOverride || span.text)
    .join('');
  if (!fixedPrefix) return override;

  let remaining = fixedPrefix;
  const segments: Segment[] = [];
  for (const segment of override.segments) {
    if (!remaining) {
      segments.push(segment);
      continue;
    }
    if (!segment.text) continue;
    if (remaining.startsWith(segment.text)) {
      remaining = remaining.slice(segment.text.length);
      continue;
    }
    if (segment.text.startsWith(remaining)) {
      segments.push({ ...segment, text: segment.text.slice(remaining.length) });
      remaining = '';
      continue;
    }
    // Old drafts may have been edited independently. Only remove a prefix
    // when the complete source marker matches exactly at the start.
    return override;
  }

  if (remaining) return override;
  return { ...override, segments: segments.filter(segment => segment.text.length > 0) };
}

interface ListFlowPart {
  kind: 'marker' | 'text';
  key: string;
  line?: LineData;
  lines?: LineData[];
  markerOrdinal?: number;
  nextMarker?: LineData;
}

function splitBlockIntoListFlowParts(block: Block, markerIndexes: Set<number>): ListFlowPart[] {
  const lines = block.lines ?? [];
  const parts: ListFlowPart[] = [];
  let activeLines: LineData[] = [];
  let activeMarkerOrdinal: number | undefined;
  let markerOrdinal = -1;

  const flushText = (boundary?: LineData) => {
    if (!activeLines.length) return;
    const firstLine = activeLines[0];
    parts.push({
      kind: 'text',
      key: `${activeMarkerOrdinal === undefined ? 'prose' : `item-${activeMarkerOrdinal}`}-${firstLine.id}`,
      lines: activeLines,
      markerOrdinal: activeMarkerOrdinal,
      nextMarker: boundary,
    });
    activeLines = [];
    activeMarkerOrdinal = undefined;
  };

  lines.forEach((line, index) => {
    if (markerIndexes.has(index)) {
      flushText(line);
      markerOrdinal += 1;
      parts.push({ kind: 'marker', key: `marker-${line.id}`, line });
      activeMarkerOrdinal = markerOrdinal;
      return;
    }
    activeLines.push(line);
  });
  flushText();

  // Pair every text row with the next marker after its source lines. This
  // supplies a copyfit boundary without moving source marker coordinates.
  let followingMarker: LineData | undefined;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part.kind === 'marker') {
      followingMarker = part.line;
    } else {
      part.nextMarker = followingMarker;
    }
  }
  return parts;
}

function trimSegmentEdgeWhitespace(segments: Segment[], edge: 'start' | 'end'): Segment[] {
  const result = segments.map(segment => ({ ...segment }));
  const ordered = edge === 'start' ? result : result.slice().reverse();
  for (const segment of ordered) {
    if (!segment.text) continue;
    segment.text = edge === 'start'
      ? segment.text.replace(/^[\s\u00a0]+/u, '')
      : segment.text.replace(/[\s\u00a0]+$/u, '');
    if (segment.text.length) break;
  }
  return result.filter(segment => segment.text.length > 0);
}

/** Split an older whole-list override only when it explicitly contains every source marker. */
function splitLegacyListOverride(override: SpanOverride, markerGlyphs: string[]): Segment[][] | null {
  if (!markerGlyphs.length || override.managedSourceSymbols?.length) return null;
  const markerSet = new Set(markerGlyphs);
  const pieces: Segment[][] = [[]];
  let markerIndex = 0;
  for (const segment of override.segments) {
    const chars = Array.from(segment.text);
    let start = 0;
    for (let index = 0; index < chars.length; index += 1) {
      const char = chars[index];
      if (!markerSet.has(char)) continue;
      if (markerIndex >= markerGlyphs.length || char !== markerGlyphs[markerIndex]) return null;
      if (index > start) pieces[pieces.length - 1].push({ ...segment, text: chars.slice(start, index).join('') });
      markerIndex += 1;
      pieces.push([]);
      start = index + 1;
    }
    if (start < chars.length) pieces[pieces.length - 1].push({ ...segment, text: chars.slice(start).join('') });
  }
  if (markerIndex !== markerGlyphs.length) return null;
  return pieces.map((piece, index) => trimSegmentEdgeWhitespace(piece, index === 0 ? 'end' : 'start'));
}

function listFlowTextBlock(
  parent: Block,
  part: ListFlowPart,
  pageNumber: number,
  blockIdx: number,
): Block | null {
  const lines = part.lines ?? [];
  if (!lines.length) return null;
  const firstLine = lines[0];
  const x = firstLine.bbox[0];
  const y = Math.min(...lines.map(line => line.bbox[1]));
  const right = Math.max(...lines.map(line => {
    const availableX = line.availableX ?? line.bbox[0];
    const availableWidth = line.availableWidth ?? (line.bbox[2] - line.bbox[0]);
    return availableX + availableWidth;
  }), parent.layoutFrame ? parent.layoutFrame.x + parent.layoutFrame.width : parent.bbox[2]);
  const sourceBottom = Math.max(...lines.map(line => line.bbox[3]));
  const boundaryBottom = part.nextMarker?.bbox[1] ?? parent.bbox[3];
  const listFlowHeight = Math.max(1, Math.max(sourceBottom, boundaryBottom) - y);
  const sourceEditorKey = parent.editorKey ?? `page_${pageNumber}_block_${blockIdx}`;
  const safePartKey = part.key.replace(/[^a-zA-Z0-9_-]/g, '_');
  const editorKey = `${sourceEditorKey}__${safePartKey}`;
  const blockBBox: [number, number, number, number] = [
    x,
    y,
    Math.max(x + 1, ...lines.map(line => line.bbox[2])),
    sourceBottom,
  ];
  return {
    ...parent,
    id: parent.id,
    editorKey,
    bbox: blockBBox,
    layoutFrame: {
      ...(parent.layoutFrame ?? {}),
      x,
      width: Math.max(1, right - x),
      y,
      height: listFlowHeight,
    },
    lines,
    staticEditorLineIndexes: undefined,
    listMarkerLineIndexes: undefined,
    listFlowItem: part.markerOrdinal !== undefined,
    listFlowHeight,
  };
}

function extractBlockInfo(
  blockKey: string,
  block: Block,
): SelectedSpanInfo {
  let text = '';
  let font = '';
  let size = 0;
  let color = '#231f20';
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  
  const lines = editableBlockLines(block);
  const sourceSegments = sourceSegmentsFromSpans(lines.flatMap(line => line.spans));
  for (const line of lines) {
    for (const span of line.spans) {
      if (span.renderOnlyStrokePass) continue;
      if (!font && span.font && !span.semanticSymbolId && !resolveLegacySymbol(span.font,span.text) && !span.font.includes('Dingbat') && span.text.trim()) {
        font = span.font;
        size = span.size;
        color = span.color || '#231f20';
        const mapped = mapPdfFont(font);
        weight = span.renderWeightOverride ?? mapped.weight;
        style = mapped.style;
      }
      text += span.displayOverride || span.text;
    }
  }
  
  // Collapse newlines inside the block text to form a flowing paragraph
  text = text.replace(/\n/g, ' ').replace(/ +/g, ' ').trim();
  
  if (!font) {
      const mapped = mapPdfFont('AGaramondPro');
      font = 'AGaramondPro';
      weight = mapped.weight;
      style = mapped.style;
      size = 13;
  }
  return {
    spanKey: blockKey,
    text,
    font,
    family: mapPdfFont(font).family,
    weight,
    style,
    color,
    size,
    bbox: block.bbox,
    textAlign: block.layoutFrame?.textAlign || 'left',
    lineHeight: block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
    sourceSegments,
    singleLine: block.noWrap ?? false,
  };
}

function sourceSegmentsFromSpans(spans: SpanData[]): Segment[] {
  return sourceSpanRuns(spans,mapPdfFont);
}

/** Project PDF line fragments as one editable paragraph while retaining rich runs and symbols. */
function normalizeParagraphSourceSegments(segments: Segment[]): Segment[] {
  const normalized: Segment[] = [];
  let pendingSpace: Segment | null = null;
  let hasContent = false;

  for (const segment of segments) {
    if (segment.symbolId) {
      if (pendingSpace && hasContent) normalized.push(pendingSpace);
      pendingSpace = null;
      normalized.push({ ...segment });
      hasContent = true;
      continue;
    }

    for (const chunk of segment.text.split(/(\s+)/u)) {
      if (!chunk) continue;
      if (/^\s+$/u.test(chunk)) {
        if (hasContent && !pendingSpace) pendingSpace = { ...segment, text: ' ' };
        continue;
      }
      if (pendingSpace) normalized.push(pendingSpace);
      pendingSpace = null;
      normalized.push({ ...segment, text: chunk });
      hasContent = true;
    }
  }

  return normalized;
}

/** Reuse measured source metrics for the same semantic occurrences in saved text. */
function sourceMetricsForOverrideSegments(block: Block, segments: Segment[]): Segment[] {
  const sourceSegments = sourceSegmentsFromSpans(editableBlockLines(block).flatMap(line => line.spans));
  const metricsById = new Map<string, InlineSymbolMetrics[]>();
  for (const source of sourceSegments) {
    if (!source.symbolId || !source.symbolMetrics
      || (source.sourceRendering ?? getSemanticSymbol(source.symbolId)?.sourceRendering) !== 'semantic-inline') continue;
    const entries = metricsById.get(source.symbolId) ?? [];
    entries.push(source.symbolMetrics);
    metricsById.set(source.symbolId, entries);
  }

  const occurrenceById = new Map<string, number>();
  return segments.map(segment => {
    const id = segment.symbolId ?? resolveLegacySymbol(segment.font, segment.text)?.id;
    if (!id) return segment;
    const sourceMetrics = metricsById.get(id);
    if (!sourceMetrics?.length) return segment;
    const occurrence = occurrenceById.get(id) ?? 0;
    occurrenceById.set(id, occurrence + 1);
    const measured = sourceMetrics[Math.min(occurrence, sourceMetrics.length - 1)];
    return { ...segment, symbolMetrics: { ...measured, ...segment.symbolMetrics } };
  });
}

/* ─────────────────────────────────────────────
   Overrides persistence (localStorage per language)
   ───────────────────────────────────────────── */
function isPlainBlockKey(spanKey: string): boolean {
  return /^page_\d+_block_\d+$/.test(spanKey);
}

function payloadSpanKey(spanKey: string, lang: string): string {
  // Payload's spanKey is unique across languages. Legacy block records were
  // stored without a language suffix, so qualify new PT-BR block records while
  // leaving semantic/unit keys (which already carry their suffix) untouched.
  return lang === 'pt-BR' && isPlainBlockKey(spanKey)
    ? `${spanKey}__${lang}`
    : spanKey;
}

function clientSpanKey(spanKey: string, lang: string): string {
  const suffix = `__${lang}`;
  return lang === 'pt-BR' && spanKey.endsWith(suffix) && isPlainBlockKey(spanKey.slice(0, -suffix.length))
    ? spanKey.slice(0, -suffix.length)
    : spanKey;
}

async function findPayloadTranslation(spanKey: string, lang: string): Promise<any | null> {
  const candidateKeys = Array.from(new Set([payloadSpanKey(spanKey, lang), spanKey]));
  for (const candidate of candidateKeys) {
    const query = new URLSearchParams({
      'where[and][0][spanKey][equals]': candidate,
      'where[and][1][language][equals]': lang,
    });
    const response = await fetch(`${payloadApiUrl('translations')}?${query}`);
    if (!response.ok) continue;
    const data = await response.json();
    if (data.docs?.length > 0) return data.docs[0];
  }
  return null;
}

async function fetchOverridesFromPayload(lang: string): Promise<Map<string, SpanOverride> | null> {
  try {
    const res = await fetch(`${payloadApiUrl('translations')}?where[language][equals]=${lang}&limit=5000`);
    if (res.ok) {
      const data = await res.json();
      const map = new Map<string, SpanOverride>();
      data.docs.forEach((doc: any) => {
        const decoded=decodeOverrideData(doc.data);
        if (!decoded) return;
        const uiSpanKey = clientSpanKey(doc.spanKey, lang);
        map.set(uiSpanKey, {
          spanKey: uiSpanKey,
          ...decoded,
          bbox: [0, 0, 0, 0],
        });
      });
      return map;
    }
  } catch (err) {
    console.warn('Failed to fetch from payload:', err);
  }
  return null;
}

async function deleteOverrideFromPayload(spanKey: string, lang: string): Promise<boolean> {
  try {
    const existing = await findPayloadTranslation(spanKey, lang);
    if (existing) {
      const id = existing.id;
      const res = await fetch(payloadApiUrl(`translations/${id}`), {
        method: 'DELETE'
      });
      return res.ok;
    }
    return true; // didn't exist anyway
  } catch {
    return false;
  }
}

function extractCreditFieldInfo(
  spanKey: string,
  block: Block,
  field: CreditFieldDefinition,
  unitKind?: TypographicUnitDefinition['kind'],
  unitLabel?: string,
): SelectedSpanInfo {
  const selectedIds = new Set(field.lineIds);
  const lines = (block.lines || []).filter(line => selectedIds.has(line.id));
  const sourceSegments = sourceSegmentsFromSpans(lines.flatMap(line => line.spans));
  let font = '';
  let size = 0;
  let color = '#231f20';
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  let text = '';

  for (const line of lines) {
    for (const span of line.spans) {
      if (span.renderOnlyStrokePass) continue;
      if (!font && span.font && !span.semanticSymbolId && !resolveLegacySymbol(span.font,span.text) && !span.font.includes('Dingbat') && span.text.trim()) {
        font = span.font;
        size = span.size;
        color = span.color || '#231f20';
        const mapped = mapPdfFont(font);
        weight = span.renderWeightOverride ?? mapped.weight;
        style = mapped.style;
      }
      text += span.displayOverride || span.text;
    }
  }

  text = text.replace(/\n/g, ' ').replace(/ +/g, ' ').trim();
  if (!font) {
    font = 'OptimaLTStd';
    size = 10;
    weight = 400;
  }

  return {
    spanKey,
    editorLabel: unitLabel,
    text,
    font,
    family: mapPdfFont(font).family,
    weight,
    style,
    color,
    size,
    bbox: field.bbox,
    textAlign: field.frame.textAlign || 'left',
    lineHeight: field.frame.lineHeight ?? block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
    sourceSegments: unitKind === 'paragraph' ? normalizeParagraphSourceSegments(sourceSegments) : sourceSegments,
    editorContext: unitKind === 'paragraph'
      ? 'paragraph'
      : block.creditUnit || block.creditUnits?.length ? 'credit-field' : 'typographic-field',
  };
}

function overrideSyncKey(lang: string, spanKey: string): string {
  return `${lang}\0${spanKey}`;
}

interface SelectedSpanInfo {
  spanKey: string;
  editorLabel?: string;
  text: string;
  font: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  color: string;
  size: number;
  bbox: [number, number, number, number];
  textAlign: TextAlignment;
  lineHeight: number;
  sourceSegments?: Segment[];
  singleLine?: boolean;
  editorContext?: InlineEditorContext;
}

interface PageRendererProps {
  pageData: PageData;
  isAdmin: boolean;
  showRuler?: boolean;
  layoutMode?: boolean;
  onLayoutDirtyChange?: (dirty: boolean) => void;
  zoomLevel?: number;
  onNavigate?: (pageNum: number) => void;
  language?: 'en' | 'pt-BR';
  symbolAliasPreferences?: SymbolAliasPreferences;
  onPaletteEditorChange?: (editorKey: string, state: AdminSymbolPaletteEditorState | null) => void;
}

function sourceLayoutFrame(block: Block): LayoutFrame {
  const firstLine = editableBlockLines(block)[0] ?? block.lines?.[0];
  return {
    x: block.layoutFrame?.x ?? (firstLine as any)?.availableX ?? block.bbox[0],
    y: block.bbox[1],
    width: block.layoutFrame?.width ?? (firstLine as any)?.availableWidth ?? Math.max(1, block.bbox[2] - block.bbox[0]),
    height: block.bbox[3] - block.bbox[1],
    rotation: 0,
    textAlign: block.layoutFrame?.textAlign,
    lineHeight: block.defaultLineHeight ?? block.layoutFrame?.lineHeight,
  };
}

function typographicUnitFrameKey(pageNumber: number, unit: TypographicUnitDefinition): string {
  return `page_${pageNumber}_unit_${unit.id}`;
}

function sourceLayoutFrameForField(field: CreditFieldDefinition): LayoutFrame {
  return {
    x: field.frame.x,
    y: field.bbox[1],
    width: field.frame.width,
    height: Math.max(1, field.bbox[3] - field.bbox[1]),
    rotation: 0,
    textAlign: field.frame.textAlign,
    lineHeight: field.frame.lineHeight,
  };
}

interface LayoutFrameSource {
  frame: LayoutFrame;
  bbox: [number, number, number, number];
}

function findLayoutFrameSource(pageData: PageData, unitKey: string): LayoutFrameSource | null {
  for (const [blockIndex, block] of pageData.blocks.entries()) {
    if (frameUnitKey(pageData.page_number, block, blockIndex) === unitKey) {
      return { frame: sourceLayoutFrame(block), bbox: block.bbox };
    }
    const unit = block.typographicUnits?.find(candidate =>
      typographicUnitFrameKey(pageData.page_number, candidate) === unitKey,
    );
    if (unit) return { frame: sourceLayoutFrameForField(unit.field), bbox: unit.field.bbox };
  }
  return null;
}

type AdminGeometryDataAttributes = React.HTMLAttributes<HTMLDivElement> & {
  'data-admin-geometry'?: string;
  'data-admin-geometry-key'?: string;
  'data-admin-geometry-x'?: number;
  'data-admin-geometry-y'?: number;
  'data-admin-geometry-width'?: number;
  'data-admin-geometry-height'?: number;
  'data-admin-geometry-rotation'?: number;
};

function adminGeometryAttributes(
  isAdmin: boolean,
  key: string,
  frame: LayoutFrame,
): AdminGeometryDataAttributes {
  if (!isAdmin) return {};
  return {
    'data-admin-geometry': 'true',
    'data-admin-geometry-key': key,
    'data-admin-geometry-x': frame.x,
    'data-admin-geometry-y': frame.y ?? 0,
    'data-admin-geometry-width': frame.width,
    'data-admin-geometry-height': frame.height ?? 1,
    'data-admin-geometry-rotation': frame.rotation ?? 0,
  };
}

function frameUnitKey(pageNumber: number, block: Block, blockIndex: number): string {
  return block.editorKey ?? `page_${pageNumber}_block_${blockIndex}`;
}

function renderSegmentContent(segment: Segment, scale: number, language: 'en' | 'pt-BR', geometryMode: 'translatedFlow' | 'inline' = 'inline'): React.ReactNode {
  const legacy = !segment.symbolId ? resolveLegacySymbol(segment.font,segment.text) : undefined;
  const id=segment.symbolId ?? legacy?.id;
  if (!id) return segment.text;
  return <>{Array.from(legacy ? '\uFFFC' : segment.text).map((_,index)=><SemanticSymbol key={index} id={id} language={language} size={segment.size*scale} color={segment.color} geometryMode={geometryMode} metrics={segment.symbolMetrics} />)}{legacy ? segment.text.match(/\s+$/)?.[0] : null}</>;
}

/** Exact source rendering is available only when every extracted text run has its PDF origin. */
function hasExactSourceGeometry(block: Block): boolean {
  const spans = block.lines?.flatMap(line => line.spans) ?? [];
  return spans.length > 0
    && spans.some(span => !!span.semanticSymbolId || !!span.sourceCompoundSymbolId)
    && spans.every(span => {
      if (span.semanticSymbolId) return span.bbox.every(Number.isFinite);
      return Array.isArray(span.origin) && span.origin.length === 2 && span.origin.every(Number.isFinite)
        && span.bbox.every(Number.isFinite) && !span.pictogramSvgPath;
    });
}

/**
 * SOURCE geometry contract: SVG text y is the extracted PDF baseline, x is the
 * extracted span origin, and semantic drawings use their source bbox. The SVGs
 * are positioned independently, so neither symbol ink bounds nor line-height
 * can change the source leading. PT-BR stays in the separate translatedFlow path.
 */
function SourceGeometryBlock({ block, scale, blockOriginX, blockOriginY }: {
  block: Block; scale: number; blockOriginX: number; blockOriginY: number;
}) {
  const width = block.bbox[2] - blockOriginX;
  const height = block.bbox[3] - blockOriginY;
  const lines = block.lines ?? [];
  return (
    <svg className="source-geometry-renderer" data-source-geometry="pdf-coordinates"
      width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none" aria-hidden="false"
      style={{ position: 'absolute', inset: 0, overflow: 'visible', display: 'block' }}>
      {lines.map((line, lineIndex) => {
        const baselines = line.spans.flatMap(span => span.origin ? [span.origin[1]] : []);
        return (
          <g key={line.id ?? lineIndex} data-source-line-id={line.id}
            data-source-baseline-y={baselines[0]}>
            {line.spans.map((span, spanIndex) => {
              if (span.renderOnlyStrokePass) return null;
              // Source-compound text (for example, a letter inside a white
              // reference capsule) is painted by the page-coordinate vector
              // layer. Its extracted glyph must not be painted a second time.
              if (span.sourceCompoundHidden || span.sourceCompoundSymbolId) return null;
              if (span.sourceInlineCoveredBy) {
                const origin = span.origin;
                return (
                  <g key={`${line.id}:${spanIndex}`} data-source-covered-span={`${line.id}:${span.sourceSpanIndex ?? spanIndex}`}
                    data-source-covered-by={span.sourceInlineCoveredBy} data-source-x={origin?.[0]}
                    data-source-baseline-y={origin?.[1]} data-source-bbox={span.bbox.join(',')} />
                );
              }
              if (span.semanticSymbolId) {
                const symbol = getSemanticSymbol(span.semanticSymbolId);
                if (!symbol) return null;
                const sourceRender = span.sourceSymbolMetrics?.renderVariant
                  ? symbol.render.variants?.[span.sourceSymbolMetrics.renderVariant] ?? symbol.render
                  : symbol.render;
                const visual = sourceRender.localized?.en ?? sourceRender;
                if (!visual.paths || !visual.viewBox) return null;
                const [x0, y0, x1, y1] = span.bbox;
                return (
                  <svg key={`${line.id}:${spanIndex}`} data-source-symbol-id={span.semanticSymbolId}
                    data-source-x={x0} data-source-y={y0} data-source-bbox={span.bbox.join(',')}
                    x={x0 - blockOriginX} y={y0 - blockOriginY} width={x1 - x0} height={y1 - y0}
                    viewBox={visual.viewBox.join(' ')} preserveAspectRatio="none"
                    role="img" aria-label={symbol.labels.en} overflow="visible" style={{ color: span.color }}>
                    {visual.paths.map((path, pathIndex) => <path key={pathIndex} {...path} />)}
                  </svg>
                );
              }

              const origin = span.origin;
              if (!origin) return null;
              const text = (span.renderTextOverride ?? span.displayOverride ?? span.text).replace(/[\r\n]+$/g, '');
              const mapped = mapPdfFont(span.font);
              const isOutlinedImportantGlyph = span.font?.includes('Webdings') && span.text === '\uF07E';
              const sourceText = span.pictogramDisplayOverride ?? text;
              if (!sourceText) return null;
              const textLength = Math.max(0, span.bbox[2] - span.bbox[0]);
              const glyphRuns = sourceText === span.text ? span.sourceGlyphRuns : undefined;
              const textStyle = { fontFamily: span.pictogramFontOverride ? `'${span.pictogramFontOverride}', sans-serif` : mapped.family,
                fontSize: span.renderSizeOverridePt ?? span.size,
                fontWeight: span.renderWeightOverride ?? mapped.weight, fontStyle: mapped.style,
                fontVariantCaps: mapped.variantCaps, letterSpacing: '-0.015em',
                fontVariantLigatures: 'none' as const, fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0' };
              const sharedTextProps = {
                'data-source-span': `${line.id}:${span.sourceSpanIndex ?? spanIndex}`,
                'data-source-bbox': span.bbox.join(','),
                lengthAdjust: 'spacingAndGlyphs' as const,
                xmlSpace: 'preserve' as const,
                fill: isOutlinedImportantGlyph ? '#b91d23' : (span.color || '#231f20'),
                stroke: span.renderTextStrokeColor ?? (isOutlinedImportantGlyph ? '#ffffff' : 'none'),
                strokeWidth: span.renderTextStrokeWidthPt ?? (isOutlinedImportantGlyph ? 2 : undefined),
                paintOrder: 'stroke fill' as const,
                style: textStyle,
              };
              if (glyphRuns && glyphRuns.length > 1 && glyphRuns.every(run => run.start >= 0 && run.end <= sourceText.length && run.end > run.start)) {
                return glyphRuns.map((run, runIndex) => (
                  <text key={`${line.id}:${spanIndex}:${runIndex}`} {...sharedTextProps}
                    data-source-x={run.origin[0]} data-source-baseline-y={run.origin[1]}
                    x={run.origin[0] - blockOriginX} y={run.origin[1] - blockOriginY}
                    textLength={run.advance || undefined}>
                    {sourceText.slice(run.start, run.end)}
                  </text>
                ));
              }
              return (
                <text key={`${line.id}:${spanIndex}`} {...sharedTextProps}
                  data-source-x={origin[0]} data-source-baseline-y={origin[1]}
                  x={origin[0] - blockOriginX} y={origin[1] - blockOriginY}
                  textLength={textLength || undefined}>
                  {sourceText}
                </text>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Paint source compound vectors in PDF point coordinates, independent of CSS line flow. */
function SourceCompoundVectorLayer({ elements, pageWidth, pageHeight, scale, language }: {
  elements: SourceCompoundElement[];
  pageWidth: number;
  pageHeight: number;
  scale: number;
  language: 'en' | 'pt-BR';
}) {
  const renderable = elements.flatMap(element => {
    const symbol = getSemanticSymbol(element.symbolId);
    if (!symbol) return [];
    const sourceRender = element.metrics.renderVariant
      ? symbol.render.variants?.[element.metrics.renderVariant] ?? symbol.render
      : symbol.render;
    const visual = sourceRender.localized?.[language] ?? sourceRender;
    return visual.paths && visual.viewBox ? [{ element, symbol, visual }] : [];
  });
  if (!renderable.length) return null;

  return (
    <svg className="source-compound-vector-layer" data-source-geometry="pdf-compounds"
      width={pageWidth * scale} height={pageHeight * scale} viewBox={`0 0 ${pageWidth} ${pageHeight}`}
      preserveAspectRatio="none" aria-hidden="false"
      style={{ position: 'absolute', inset: 0, zIndex: 20, overflow: 'visible', display: 'block', pointerEvents: 'none' }}>
      {renderable.map(({ element, symbol, visual }) => (
        <svg key={`${element.symbolId}:${element.anchor.blockId}:${element.anchor.lineId}`}
          data-source-compound={element.symbolId} x={element.bbox[0]} y={element.bbox[1]}
          width={element.bbox[2] - element.bbox[0]} height={element.bbox[3] - element.bbox[1]}
          viewBox={visual.viewBox!.join(' ')} preserveAspectRatio="none"
          role="img" aria-label={symbol.labels[language]} overflow="visible">
          {visual.paths!.map((path, index) => <path key={index} {...path} />)}
        </svg>
      ))}
    </svg>
  );
}

function hasInlineSemanticSymbol(segment: Segment): boolean {
  return Boolean(segment.symbolId || resolveLegacySymbol(segment.font, segment.text));
}

/** Clip a cleanup patch to the source circle, not the padded rectangular PNG. */
function sourceMaskClipPath(element: SourceInlineElement): string | undefined {
  if (element.mask.clipShape !== 'circle') return undefined;
  const [maskX0, maskY0, maskX1, maskY1] = element.mask.bbox;
  const [x0, y0, x1, y1] = element.bbox;
  const maskWidth = maskX1 - maskX0;
  const maskHeight = maskY1 - maskY0;
  if (maskWidth <= 0 || maskHeight <= 0) return undefined;
  // Extend the cleanup circle through the available padding around the source
  // ink so antialiased edges do not survive when the translated text reflows.
  // Keep the ellipse inside the sampled patch; its nearest edge bounds bleed.
  const bleedX = Math.max(0, Math.min(x0 - maskX0, maskX1 - x1));
  const bleedY = Math.max(0, Math.min(y0 - maskY0, maskY1 - y1));
  const radiusX = Math.min(maskWidth / 2, (x1 - x0) / 2 + bleedX) / maskWidth * 100;
  const radiusY = Math.min(maskHeight / 2, (y1 - y0) / 2 + bleedY) / maskHeight * 100;
  const centerX = ((x0 + x1) / 2 - maskX0) / maskWidth * 100;
  const centerY = ((y0 + y1) / 2 - maskY0) / maskHeight * 100;
  return `ellipse(${radiusX}% ${radiusY}% at ${centerX}% ${centerY}%)`;
}

export const PageRenderer: React.FC<PageRendererProps> = ({ pageData, isAdmin, showRuler = false, layoutMode = false, onLayoutDirtyChange, zoomLevel = 1, onNavigate, language = 'en', symbolAliasPreferences, onPaletteEditorChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageElement, setPageElement] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [selectedSpan, setSelectedSpan] = useState<SelectedSpanInfo | null>(null);
  const [overrides, setOverrides] = useState<Map<string, SpanOverride>>(() => loadLocalOverrides(language));
  const [overridesLoadedLanguage, setOverridesLoadedLanguage] = useState<string | null>(null);
  const [payloadOverrides, setPayloadOverrides] = useState<Map<string, SpanOverride> | null>(null);
  const [payloadOverrideReadState, setPayloadOverrideReadState] = useState<'loading' | 'available' | 'unavailable'>('loading');
  const [overrideSyncStates, setOverrideSyncStates] = useState<Map<string, LocalSyncState | 'sync_error'>>(new Map());
  const [draftOverride, setDraftOverride] = useState<SpanOverride | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [layoutFrames, setLayoutFrames] = useState<Map<string, LayoutFrame>>(() => loadLocalLayoutFrames(pageData.page_number, language));
  const [inheritedLayoutFrames, setInheritedLayoutFrames] = useState<Map<string, LayoutFrame>>(() => language === 'pt-BR' ? loadLocalLayoutFrames(pageData.page_number, 'en') : new Map());
  const [layoutUnitKey, setLayoutUnitKey] = useState<string | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<LayoutFrame | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<LayoutAlignmentGuide[]>([]);

  useEffect(() => {
    let active = true;
    setPayloadOverrideReadState('loading');
    fetchOverridesFromPayload(language).then((serverMap) => {
      if (!active) return;
      setPayloadOverrides(serverMap);
      setPayloadOverrideReadState(serverMap ? 'available' : 'unavailable');
      if (serverMap) {
        const merged = loadLocalOverrides(language);
        serverMap.forEach((override, key) => merged.set(key, override));
        setOverrides(merged);
      } else {
        setOverrides(loadLocalOverrides(language));
      }
      setOverridesLoadedLanguage(language);
    });
    return () => { active = false; };
  }, [language]);
  const overridesReady = overridesLoadedLanguage === language;

  useEffect(() => {
    const onRemoteConfirmation = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; language?: string; spanKey?: string; unitKey?: string; data?: unknown; confirmed?: boolean }>).detail;
      if (!detail?.confirmed || detail.language !== language) return;
      if (detail.kind === 'translation' && detail.spanKey === selectedSpan?.spanKey) {
        setOverrideSyncStates(current => new Map(current).set(overrideSyncKey(language, detail.spanKey!), 'confirmed'));
        const saved = decodeOverrideData(detail.data);
        if (saved) setPayloadOverrides(current => new Map(current).set(detail.spanKey!, { ...saved, spanKey: detail.spanKey! } as SpanOverride));
        setPayloadOverrideReadState('available');
      }
      if (detail.kind === 'frame' && detail.unitKey === layoutUnitKey) {
        setLayoutStatus('SALVO / PAYLOAD CONFIRMADO.');
        if (detail.data && typeof detail.data === 'object') {
          setLayoutFrames(current => new Map(current).set(detail.unitKey!, detail.data as LayoutFrame));
        }
      }
    };
    window.addEventListener(LOCAL_PERSISTENCE_CHANGED_EVENT, onRemoteConfirmation);
    return () => window.removeEventListener(LOCAL_PERSISTENCE_CHANGED_EVENT, onRemoteConfirmation);
  }, [language, selectedSpan?.spanKey, layoutUnitKey, pageData.page_number]);

  const replacedInlineElements = (pageData.inlineElements ?? []).filter(element=>{
    const block=pageData.blocks.find(b=>b.id===element.anchor.blockId);
    return block && sourceElementIsReplaced(element,block,pageData.page_number,language,overrides,selectedSpan?.spanKey ?? null,draftOverride);
  });
  const coveredSourceSymbols = new Set(replacedInlineElements.filter(element=>element.coveredSourceText)
    .map(element=>element.symbolId));

  useEffect(() => {
    let active = true;
    const localOwn = loadLocalLayoutFrames(pageData.page_number, language);
    const localEnglish = language === 'pt-BR' ? loadLocalLayoutFrames(pageData.page_number, 'en') : new Map<string, LayoutFrame>();
    setLayoutFrames(localOwn);
    setInheritedLayoutFrames(localEnglish);
    setLayoutUnitKey(null);
    setLayoutDraft(null);
    setLayoutDirty(false);
    setLayoutStatus(null);
    onLayoutDirtyChange?.(false);

    const load = async (frameLanguage: LayoutLanguage, local: Map<string, LayoutFrame>) => {
      const remote = await fetchLayoutFrames(pageData.page_number, frameLanguage);
      const merged = new Map(local);
      remote?.forEach((frame, key) => merged.set(key, frame));
      return merged;
    };
    const languages: LayoutLanguage[] = language === 'pt-BR' ? ['en', 'pt-BR'] : ['en'];
    Promise.all(languages.map(lang => load(lang, lang === language ? localOwn : localEnglish))).then(results => {
      if (!active) return;
      if (language === 'en') setLayoutFrames(results[0]);
      else {
        setInheritedLayoutFrames(results[0]);
        setLayoutFrames(results[1]);
      }
    });
    return () => { active = false; };
  }, [pageData.page_number, language, onLayoutDirtyChange]);

  useEffect(() => {
    onLayoutDirtyChange?.(layoutDirty);
  }, [layoutDirty, onLayoutDirtyChange]);

  useEffect(() => {
    if (layoutMode) {
      setSelectedSpan(null);
      setDraftOverride(null);
    } else if (layoutDirty) {
      discardLayoutDraft();
    }
  }, [layoutMode]);

  useEffect(() => {
    if (!layoutMode) setAlignmentGuides([]);
  }, [layoutMode, pageData.page_number]);

  useEffect(() => {
    if (!layoutDirty) return;
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [layoutDirty]);

  const effectiveFrameFor = useCallback((unitKey: string, sourceFrame: LayoutFrame) => {
    return layoutFrames.get(unitKey)
      ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(unitKey) : undefined)
      ?? sourceFrame;
  }, [layoutFrames, inheritedLayoutFrames, language]);

  const layoutSnapTargets = useMemo<SnapFrameRect[]>(() => pageData.blocks.flatMap((block, index) => {
    if (block.hiddenFromPage || block.adminReadOnly || block.creditUnits?.length || block.creditUnit) return [];
    if (block.typographicUnits?.length) {
      return block.typographicUnits.map(unit => {
        const key = typographicUnitFrameKey(pageData.page_number, unit);
        const sourceFrame = sourceLayoutFrameForField(unit.field);
        const frame = effectiveFrameFor(key, sourceFrame);
        return {
          key,
          label: unit.label || `Bloco ${index + 1} · ${unit.id}`,
          x: frame.x,
          y: frame.y ?? unit.field.bbox[1],
          width: frame.width,
          height: frame.height ?? Math.max(1, unit.field.bbox[3] - unit.field.bbox[1]),
          rotation: frame.rotation,
        };
      });
    }
    if (fixedEditorLineIndexes(block).size) return [];
    const key = frameUnitKey(pageData.page_number, block, index);
    const frame = effectiveFrameFor(key, sourceLayoutFrame(block));
    return [{
      key,
      label: `Bloco ${index + 1}`,
      x: frame.x,
      y: frame.y ?? block.bbox[1],
      width: frame.width,
      height: frame.height ?? Math.max(1, block.bbox[3] - block.bbox[1]),
      rotation: frame.rotation,
    }];
  }), [pageData.blocks, pageData.page_number, effectiveFrameFor]);

  const selectLayoutFrame = useCallback((unitKey: string, initialFrame: LayoutFrame) => {
    if (layoutDirty && unitKey !== layoutUnitKey && !window.confirm('Há alterações de moldura não salvas. Descartar e selecionar outra?')) return;
    const source = findLayoutFrameSource(pageData, unitKey);
    const saved = layoutFrames.get(unitKey)
      ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(unitKey) : undefined)
      ?? source?.frame
      ?? initialFrame;
    setLayoutUnitKey(unitKey);
    setLayoutDraft({ ...saved });
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(language === 'pt-BR' && !layoutFrames.has(unitKey) ? 'PT-BR herda a moldura EN até ser personalizada.' : null);
  }, [layoutDirty, layoutUnitKey, pageData, layoutFrames, inheritedLayoutFrames, language, onLayoutDirtyChange]);

  const changeLayoutDraft = useCallback((frame: LayoutFrame) => {
    setLayoutDraft(frame);
    setLayoutDirty(true);
    onLayoutDirtyChange?.(true);
    setLayoutStatus(null);
  }, [onLayoutDirtyChange]);

  const discardLayoutDraft = useCallback(() => {
    if (!layoutUnitKey) return;
    const source = findLayoutFrameSource(pageData, layoutUnitKey);
    const saved = layoutFrames.get(layoutUnitKey)
      ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(layoutUnitKey) : undefined)
      ?? source?.frame
      ?? null;
    setLayoutDraft(saved ? { ...saved } : null);
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus('Alterações descartadas.');
  }, [layoutUnitKey, pageData, layoutFrames, inheritedLayoutFrames, language, onLayoutDirtyChange]);

  const saveLayoutDraft = useCallback(async () => {
    if (!layoutUnitKey || !layoutDraft || !layoutDirty || isSavingLayout) return;
    setIsSavingLayout(true);
    const next = new Map(layoutFrames);
    next.set(layoutUnitKey, layoutDraft);
    setLayoutFrames(next);
    const savedLocally = saveLocalLayoutFrames(pageData.page_number, language, next);
    setLayoutStatus(savedLocally
      ? 'SALVO LOCALMENTE / SINCRONIZAÇÃO PENDENTE.'
      : 'A cópia local falhou; aguardando confirmação do Payload.');
    const savedRemotely = await saveLayoutFrame({ unitKey: layoutUnitKey, pageNumber: pageData.page_number, language, frame: layoutDraft });
    if (savedLocally) dispatchLocalPersistenceChanged({
      kind: 'frame', language, unitKey: layoutUnitKey, pageNumber: pageData.page_number,
      data: layoutDraft, confirmed: savedRemotely,
    });
    else dispatchLocalPersistenceChanged();
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(savedRemotely ? 'SALVO / PAYLOAD CONFIRMADO.' : savedLocally
      ? 'ERRO DE SINCRONIZAÇÃO — moldura preservada localmente; Payload não confirmou.'
      : 'ERRO DE SINCRONIZAÇÃO — falha ao salvar localmente e Payload não confirmou.');
    setIsSavingLayout(false);
  }, [layoutUnitKey, layoutDraft, layoutDirty, isSavingLayout, layoutFrames, pageData.page_number, language, onLayoutDirtyChange]);

  const resetLayoutToEnglish = useCallback(async () => {
    if (!layoutUnitKey || language !== 'pt-BR' || !layoutFrames.has(layoutUnitKey) || isSavingLayout) return;
    if (!window.confirm('Remover a moldura PT-BR e voltar a herdar a configuração inglesa?')) return;
    setIsSavingLayout(true);
    const next = new Map(layoutFrames);
    next.delete(layoutUnitKey);
    setLayoutFrames(next);
    saveLocalLayoutFrames(pageData.page_number, language, next);
    const removedRemotely = await deleteLayoutFrame(layoutUnitKey, language);
    dispatchLocalPersistenceChanged();
    const inherited = inheritedLayoutFrames.get(layoutUnitKey)
      ?? findLayoutFrameSource(pageData, layoutUnitKey)?.frame
      ?? null;
    setLayoutDraft(inherited ? { ...inherited } : null);
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(removedRemotely ? 'PAYLOAD CONFIRMADO — moldura PT-BR removida; herdando EN.' : 'ERRO DE SINCRONIZAÇÃO — a remoção local não foi confirmada no Payload.');
    setIsSavingLayout(false);
  }, [layoutUnitKey, language, layoutFrames, isSavingLayout, pageData, inheritedLayoutFrames, onLayoutDirtyChange]);

  const contentsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (pageData.page_number !== 3 || !onNavigate) return map;
    const numberLines: { y: number; num: number }[] = [];
    pageData.blocks.forEach(block => {
      block.lines?.forEach(line => {
        const text = line.spans.map(s => s.text).join('').trim();
        if (/^\d+$/.test(text)) {
          const num = parseInt(text);
          if (num >= 1 && num <= 102) {
            const centerY = (line.bbox[1] + line.bbox[3]) / 2;
            numberLines.push({ y: centerY, num });
          }
        }
      });
    });
    pageData.blocks.forEach(block => {
      block.lines?.forEach(line => {
        const centerY = (line.bbox[1] + line.bbox[3]) / 2;
        const match = numberLines.find(nl => Math.abs(nl.y - centerY) < 5);
        if (match) map.set(line.id, match.num);
      });
    });
    return map;
  }, [pageData, onNavigate]);

  useEffect(() => {
    const stage = containerRef.current;
    if (!stage || !pageData) return;

    const updateScale = () => {
      // Measure the stage's outer box. clientWidth/clientHeight shrink when
      // scrollbars appear, which can feed back into the scale and oscillate.
      const { width, height } = stage.getBoundingClientRect();
      const availableWidth = Math.max(1, width - 48);
      const availableHeight = Math.max(1, height - 48);
      const fitScale = Math.min(
        availableWidth / pageData.width,
        availableHeight / pageData.height,
      );
      const nextScale = fitScale * zoomLevel;
      setScale(current => Math.abs(current - nextScale) < 0.0001 ? current : nextScale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [pageData, zoomLevel, selectedSpan]);

  const handleSpanClick = useCallback((info: SelectedSpanInfo) => {
    if (!isAdmin) return;
    if (selectedSpan?.spanKey === info.spanKey) return;
    if (
      language === 'pt-BR' &&
      draftOverride &&
      !window.confirm('Há alterações de tradução não salvas. Quer descartá-las e abrir outro texto?')
    ) {
      return;
    }
    setSelectedSpan(info);
    setDraftOverride(null);
  }, [isAdmin, language, draftOverride, selectedSpan]);

  const handleDraftChange = useCallback((draft: SpanOverride | null) => {
    setDraftOverride(draft);
  }, []);

  const handleSaveOverride = useCallback(async (override: SpanOverride | null) => {
    if ((!override && !selectedSpan) || isSaving) return;
    
    setIsSaving(true);
    // Optimistic update
    const nextMap = new Map(overrides);
    if (override) {
      nextMap.set(override.spanKey, override);
    } else if (selectedSpan) {
      nextMap.delete(selectedSpan.spanKey);
    }
    setOverrides(nextMap);
    const savedLocally = saveLocalOverrides(language, nextMap);

    if (override) {
      const syncKey = overrideSyncKey(language, override.spanKey);
      setOverrideSyncStates(current => new Map(current).set(syncKey, savedLocally ? 'missing_remote' : 'sync_error'));
      const result = await persistOverrideToPayload(override, language);
      if (savedLocally) dispatchLocalPersistenceChanged({
        kind: 'translation', language, spanKey: override.spanKey,
        data: encodeOverrideData(override), confirmed: result === 'confirmed',
      });
      else dispatchLocalPersistenceChanged();
      if (result !== 'confirmed') {
        setOverrideSyncStates(current => new Map(current).set(syncKey, 'sync_error'));
        setToast({
          message: savedLocally
            ? 'ERRO DE SINCRONIZAÇÃO — tradução salva localmente; Payload ainda não confirmou.'
            : 'ERRO DE SINCRONIZAÇÃO — falhou o save local e o Payload.',
          type: 'error',
        });
        setTimeout(() => setToast(null), 5000);
      } else {
        setOverrideSyncStates(current => new Map(current).set(syncKey, 'confirmed'));
        setToast({ message: 'SALVO / PAYLOAD CONFIRMADO', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      }
    } else if (selectedSpan) {
      const deletedOnServer = await deleteOverrideFromPayload(selectedSpan.spanKey, language);
      dispatchLocalPersistenceChanged();
      if (deletedOnServer) {
        setOverrideSyncStates(current => { const next = new Map(current); next.delete(overrideSyncKey(language, selectedSpan.spanKey)); return next; });
        setPayloadOverrides(current => { if (!current) return current; const next = new Map(current); next.delete(selectedSpan.spanKey); return next; });
      } else {
        setOverrideSyncStates(current => new Map(current).set(overrideSyncKey(language, selectedSpan.spanKey), 'sync_error'));
      }
      setToast({
        message: deletedOnServer
          ? 'PAYLOAD CONFIRMADO — override removido.'
          : savedLocally
            ? 'ERRO DE SINCRONIZAÇÃO — remoção local aplicada; o override ainda pode existir no Payload.'
            : 'ERRO DE SINCRONIZAÇÃO — falha ao remover o override.',
        type: deletedOnServer ? 'success' : 'error',
      });
      setTimeout(() => setToast(null), 5000);
    }

    setIsSaving(false);
    setSelectedSpan(null);
    setDraftOverride(null);
  }, [language, selectedSpan, overrides, isSaving]);

  const handleCloseEditor = useCallback(() => {
    setSelectedSpan(null);
    setDraftOverride(null);
  }, []);

  const containerStyle: React.CSSProperties = {
    width: `${pageData.width * scale}px`,
    height: `${pageData.height * scale}px`,
    margin: 'auto',
    transition: 'width 0.2s ease, height 0.2s ease',
    flexShrink: 0,
  };

  const selectedSourceBlock = selectedSpan
    ? pageData.blocks.find((block, index) => {
        const blockKey = block.editorKey
          ? `${block.editorKey}__${language}`
          : `page_${pageData.page_number}_block_${index}`;
        return blockKey === selectedSpan.spanKey;
      })
    : undefined;
  const selectedExistingOverride = selectedSpan
    ? selectedSourceBlock
      ? normalizeStaticEditorPrefix(selectedSourceBlock, overrides.get(selectedSpan.spanKey) || null)
      : overrides.get(selectedSpan.spanKey) || null
    : null;

  const selectedOverridePersistenceState = selectedSpan
    ? overrideSyncStates.get(overrideSyncKey(language, selectedSpan.spanKey))
      ?? (!overridesReady ? 'loading'
        : payloadOverrideReadState === 'unavailable' ? 'unverified'
          : (() => {
            const local = loadLocalOverrides(language).get(selectedSpan.spanKey);
            const remote = payloadOverrides?.get(selectedSpan.spanKey);
            if (local && remote) return persistedOverridesEqual(local, remote) ? 'confirmed' : 'diverged';
            if (local) return 'missing_remote';
            if (remote) return 'confirmed';
            return 'inherited';
          })())
    : null;

  const selectedLayoutSource = layoutUnitKey ? findLayoutFrameSource(pageData, layoutUnitKey) : null;
  const selectedLayoutFrame = layoutDraft;
  const selectedLayoutHasOwnFrame = !!layoutUnitKey && layoutFrames.has(layoutUnitKey);

  return (
    <div className={`page-renderer ${selectedSpan ? 'editor-open' : ''}`} style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'stretch', overflow: 'hidden' }}>
      <div ref={containerRef} className="page-stage">
      <div ref={setPageElement} className="page-container" style={containerStyle}>
        {toast && (
          <div className={`toast-notification toast-${toast.type}`}>
            {toast.message}
          </div>
        )}
        {pageData.backgroundUrl && (
          <img
            src={pageData.backgroundUrl}
            alt=""
            draggable={false}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              zIndex: 1, pointerEvents: 'none', userSelect: 'none',
            }}
          />
        )}

        {pageData.blocks.map((block, bIdx) => {
          if (block.hiddenFromPage || block.artworkOnly) return null;
          const hasSourceInlineSymbols = (pageData.inlineElements ?? []).some(
            element => element.anchor.blockId === block.id,
          );
          const rows = pageData.contentsRows?.filter(row => row.blockId === block.id) ?? [];
          const hasOverride = (key: string) => overrides.has(key)
            || (selectedSpan?.spanKey === key && draftOverride !== null);
          if (rows.length && overridesReady && !layoutMode && !contentsRowUsesLegacy(rows, language, hasOverride)) return (
            <ContentsLabelBlock key={block.id} block={block} rows={rows} scale={scale} isAdmin={isAdmin}
              language={language} overrides={overrides} selectedKey={selectedSpan?.spanKey ?? null} draft={draftOverride}
              onBlockClick={handleSpanClick} onNavigate={onNavigate} />
          );
          return (
            <SpanBlock
              key={block.id}
              block={pageData.contentsRows?.some(row=>block.lines?.some(line=>line.id===row.numberLineId)) ? {...block,adminReadOnly:true} : block}
              hasSourceInlineSymbols={hasSourceInlineSymbols}
              coveredSourceSymbols={coveredSourceSymbols}
              allBlocks={pageData.blocks}
              layoutObstacles={pageData.layoutObstacles ?? []}
              blockIdx={bIdx}
              pageNumber={pageData.page_number}
              scale={scale}
              isAdmin={isAdmin}
              contentsMap={contentsMap}
              onNavigate={onNavigate}
              onBlockClick={handleSpanClick}
              layoutMode={isAdmin && layoutMode}
              layoutUnitKey={frameUnitKey(pageData.page_number, block, bIdx)}
              layoutSelectionKey={layoutUnitKey}
              layoutDraft={layoutDraft}
              layoutFrames={layoutFrames}
              inheritedLayoutFrames={inheritedLayoutFrames}
              layoutFrameForSelection={effectiveFrameFor(frameUnitKey(pageData.page_number, block, bIdx), sourceLayoutFrame(block))}
              layoutFrameOverride={(layoutUnitKey === frameUnitKey(pageData.page_number, block, bIdx) ? layoutDraft : undefined)
                ?? layoutFrames.get(frameUnitKey(pageData.page_number, block, bIdx))
                ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(frameUnitKey(pageData.page_number, block, bIdx)) : undefined)}
              onSelectLayoutFrame={selectLayoutFrame}
              selectedBlockKey={selectedSpan?.spanKey || null}
              overrides={overrides}
              overridesReady={overridesReady}
              draftOverride={draftOverride}
              language={language}
            />
          );
        })}
        <SourceCompoundVectorLayer elements={(pageData.sourceCompounds ?? []).filter(element => {
          const block = pageData.blocks.find(candidate => candidate.id === element.anchor.blockId);
          return !!block && !compoundElementIsReplaced(element, block, pageData.page_number, language, overrides,
            selectedSpan?.spanKey ?? null, draftOverride);
        })} pageWidth={pageData.width} pageHeight={pageData.height} scale={scale} language={language} />
        {replacedInlineElements.map(element=><img key={element.mask.url} src={element.mask.url} alt="" aria-hidden="true" draggable={false}
          style={{position:'absolute',left:element.mask.bbox[0]*scale,top:element.mask.bbox[1]*scale,width:(element.mask.bbox[2]-element.mask.bbox[0])*scale,height:(element.mask.bbox[3]-element.mask.bbox[1])*scale,
            clipPath:sourceMaskClipPath(element),zIndex:2,pointerEvents:'none'}} />)}
        {pageData.fidelityOverlays?.map((overlay) => {
          if ((!overlay.languageInvariant && overlay.language !== language) || (overlay.hideInAdmin && isAdmin)) return null;
          const [x0, y0, x1, y1] = overlay.bbox;
          return (
            <img
              key={overlay.url}
              src={overlay.url}
              alt=""
              aria-hidden="true"
              width={overlay.widthPx}
              height={overlay.heightPx}
              loading="eager"
              decoding="async"
              draggable={false}
              style={{
                position: 'absolute',
                left: `${x0 * scale}px`,
                top: `${y0 * scale}px`,
                width: `${(x1 - x0) * scale}px`,
                height: `${(y1 - y0) * scale}px`,
                zIndex: overlay.zIndex ?? 10000,
                pointerEvents: 'none',
                userSelect: 'none',
                maskImage: sourceOverlayMask(overlay.bbox,replacedInlineElements),
                maskSize: '100% 100%',
              }}
            />
          );
        })}
      </div>
      {isAdmin && showRuler && <AdminRuler pageElement={pageElement} pageWidth={pageData.width} pageHeight={pageData.height} alignmentGuides={alignmentGuides} />}
      </div>

      {isAdmin && selectedSpan && (
        <RichSpanEditor
          spanKey={selectedSpan.spanKey}
          editorLabel={selectedSpan.editorLabel}
          originalText={selectedSpan.text}
          originalFont={selectedSpan.font}
          originalSize={selectedSpan.size}
          originalColor={selectedSpan.color}
          originalWeight={selectedSpan.weight}
          originalStyle={selectedSpan.style}
          originalSegments={selectedSpan.sourceSegments}
          originalTextAlign={selectedSpan.textAlign}
          originalLineHeight={selectedSpan.lineHeight}
          bbox={selectedSpan.bbox}
          pageNumber={pageData.page_number}
          language={language}
          onClose={handleCloseEditor}
          onSave={handleSaveOverride}
          onDraftChange={handleDraftChange}
          existingOverride={selectedExistingOverride}
          overrideStatusLoading={!overridesReady}
          persistenceStatus={selectedOverridePersistenceState ?? undefined}
          singleLine={selectedSpan.singleLine}
          editorContext={selectedSpan.editorContext ?? 'paragraph'}
          symbolAliasPreferences={symbolAliasPreferences}
          onPaletteEditorChange={onPaletteEditorChange}
        />
      )}
      {isAdmin && layoutMode && (
        <AdminLayoutFrameEditor
          pageElement={pageElement}
          pageWidth={pageData.width}
          pageHeight={pageData.height}
          snapTargets={layoutSnapTargets}
          unitKey={layoutUnitKey}
          sourceBbox={selectedLayoutSource ? {
            x: selectedLayoutSource.bbox[0],
            y: selectedLayoutSource.bbox[1],
            width: selectedLayoutSource.bbox[2] - selectedLayoutSource.bbox[0],
            height: selectedLayoutSource.bbox[3] - selectedLayoutSource.bbox[1],
          } : null}
          frame={selectedLayoutFrame}
          language={language}
          hasOwnFrame={selectedLayoutHasOwnFrame}
          isDirty={layoutDirty}
          isSaving={isSavingLayout}
          status={layoutStatus}
          onChange={changeLayoutDraft}
          onSave={saveLayoutDraft}
          onDiscard={discardLayoutDraft}
          onResetToEnglish={resetLayoutToEnglish}
          onSnapGuidesChange={setAlignmentGuides}
        />
      )}
    </div>
  );
};

interface ContentsLabelBlockProps {
  block: Block;
  rows: ContentsRowDefinition[];
  scale: number;
  isAdmin: boolean;
  language: 'en' | 'pt-BR';
  overrides: Map<string, SpanOverride>;
  selectedKey: string | null;
  draft: SpanOverride | null;
  onBlockClick: (info: SelectedSpanInfo) => void;
  onNavigate?: (page: number) => void;
}
function ContentsLabelBlock({
  block, rows, scale, isAdmin, language, overrides, selectedKey, draft, onBlockClick, onNavigate,
}: ContentsLabelBlockProps) {
  return <>{rows.map(row => {
    const line = contentsRowLine(block, row);
    if (!line) return null;
    const key = contentsRowKey(row, language);
    const override = selectedKey === key && draft ? draft : overrides.get(key);
    const [x, y, , bottom] = row.labelBBox;
    const width = contentsLabelWidth(row);
    const height = bottom - y;
    const field: CreditFieldDefinition = {
      id: row.id, lineIds: [row.lineId], bbox: [x, y, x + width, bottom],
      frame: { x, width, textAlign: 'left', lineHeight: 1 },
    };
    const attributes = adminGeometryAttributes(isAdmin, key, { x, y, width, height, rotation: 0 });
    const select = () => {
      if (isAdmin) onBlockClick({ ...extractCreditFieldInfo(key, block, field), singleLine: true, editorContext: 'typographic-field' });
      else onNavigate?.(row.targetPage);
    };
    const click = (event: React.MouseEvent) => {
      event.stopPropagation();
      select();
    };
    return <React.Fragment key={row.id}>
      {override && <img src={row.mask.url} alt="" aria-hidden="true" draggable={false} style={{
        position: 'absolute', left: row.mask.bbox[0] * scale, top: row.mask.bbox[1] * scale,
        width: (row.mask.bbox[2] - row.mask.bbox[0]) * scale,
        height: (row.mask.bbox[3] - row.mask.bbox[1]) * scale, zIndex: 2, pointerEvents: 'none',
      }} />}
      <div className={`contents-label-field ${isAdmin ? 'credit-edit-field' : ''} ${selectedKey === key ? 'credit-field-selected' : ''}`}
        role={isAdmin ? 'button' : 'link'} tabIndex={0}
        style={{ position: 'absolute', left: x * scale, top: y * scale, width: width * scale, height: height * scale, zIndex: block.zIndex ?? 10 }}
        {...attributes} onClick={click} onKeyDown={event => {
          if (event.key === 'Enter' || (isAdmin && event.key === ' ')) {
            event.preventDefault();
            select();
          }
        }}>
        {override ? <ContentsRowFlow row={row} scale={scale} sourceFontSize={line.spans[0]?.size ?? override.segments[0]?.size ?? 12}
          isAdmin={isAdmin} text={override.segments.map(run => run.text).join('')}>
          {renderCreditSegments(override.segments.map(run => ({ ...run, text: run.text.replace(/[\r\n]+/g, ' ') })), undefined, language, scale, isAdmin, 'nowrap')}
        </ContentsRowFlow> : <div style={{ pointerEvents: 'none' }}><LineRenderer line={line} scale={scale} blockOriginX={x} blockOriginY={y}
          isAdmin={false} isSelected={false} language={language} onClick={() => {}} /></div>}
      </div>
    </React.Fragment>;
  })}</>;
}

interface SpanBlockProps {
  block: Block;
  hasSourceInlineSymbols: boolean;
  coveredSourceSymbols: Set<string>;
  allBlocks: Block[];
  layoutObstacles: [number, number, number, number][];
  blockIdx: number;
  pageNumber: number;
  scale: number;
  isAdmin: boolean;
  contentsMap?: Map<string, number>;
  onNavigate?: (pageNum: number) => void;
  onBlockClick: (info: SelectedSpanInfo) => void;
  layoutMode: boolean;
  layoutUnitKey: string;
  layoutSelectionKey: string | null;
  layoutDraft: LayoutFrame | null;
  layoutFrames: Map<string, LayoutFrame>;
  inheritedLayoutFrames: Map<string, LayoutFrame>;
  layoutFrameForSelection: LayoutFrame;
  layoutFrameOverride?: LayoutFrame;
  onSelectLayoutFrame: (unitKey: string, frame: LayoutFrame) => void;
  selectedBlockKey: string | null;
  overrides: Map<string, SpanOverride>;
  overridesReady: boolean;
  draftOverride: SpanOverride | null;
  language: 'en' | 'pt-BR';
}

const SpanBlock: React.FC<SpanBlockProps> = ({
  block, hasSourceInlineSymbols, coveredSourceSymbols, allBlocks, layoutObstacles, blockIdx, pageNumber, scale, isAdmin, contentsMap,
  onNavigate, onBlockClick, layoutMode, layoutUnitKey, layoutSelectionKey, layoutDraft, layoutFrames, inheritedLayoutFrames,
  layoutFrameForSelection, layoutFrameOverride, onSelectLayoutFrame,
  selectedBlockKey, overrides, overridesReady, draftOverride, language
}) => {
  const blockRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const blockX = block.bbox[0];
  const blockY = block.bbox[1];
  const blockW = block.bbox[2] - block.bbox[0];
  const blockH = block.bbox[3] - block.bbox[1];
  // A layout frame is the editable region inferred from the surrounding
  // column, while block.bbox remains the source ink bounds. Render the
  // container at the frame origin so Admin and the translated preview expose
  // the same geometry without changing the source line coordinates.
  const frameX = block.layoutFrame?.x ?? (block.lines?.[0] as any)?.availableX ?? blockX;
  const frameW = block.layoutFrame?.width ?? (block.lines?.[0] as any)?.availableWidth ?? blockW;

  const blockStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${frameX * scale}px`,
    top: `${blockY * scale}px`,
    width: `${frameW * scale}px`,
    height: `${blockH * scale}px`,
    zIndex: block.zIndex || 10,
  };

  const blockKey = block.editorKey
    ? `${block.editorKey}__${language}`
    : `page_${pageNumber}_block_${blockIdx}`;

  let currentOverride = block.adminReadOnly ? null : normalizeStaticEditorPrefix(block, overrides.get(blockKey) || null);
  if (!block.adminReadOnly && selectedBlockKey === blockKey && draftOverride) {
    currentOverride = draftOverride;
  }

  const translatedFrame = currentOverride ? layoutFrameOverride : undefined;
  const translatedX = translatedFrame?.x ?? frameX;
  const translatedY = translatedFrame?.y ?? blockY;
  const translatedWidth = translatedFrame?.width ?? frameW;
  const translatedHeight = translatedFrame?.height ?? block.listFlowHeight ?? blockH;
  const translatedStyle: React.CSSProperties = translatedFrame ? {
    ...blockStyle,
    left: `${translatedX * scale}px`,
    top: `${translatedY * scale}px`,
    width: `${translatedWidth * scale}px`,
    height: `${Math.max(1, translatedHeight) * scale}px`,
    transform: `rotate(${translatedFrame.rotation ?? 0}deg)`,
    transformOrigin: 'center center',
  } : blockStyle;
  const geometryFrame = (layoutMode && layoutFrameOverride) || (currentOverride && translatedFrame)
    ? (layoutFrameOverride ?? translatedFrame!)
    : { x: frameX, y: blockY, width: frameW, height: blockH, rotation: 0 };
  const geometryAttributes = adminGeometryAttributes(isAdmin, blockKey, geometryFrame);

  // Effect to measure height and set overflowing state for the live preview indicator
  useEffect(() => {
    if (currentOverride && blockRef.current) {
      const actualHeight = blockRef.current.scrollHeight;
      setIsOverflowing(actualHeight > translatedHeight * scale + 2); // 2px tolerance
    } else {
      setIsOverflowing(false);
    }
  }, [currentOverride, scale, translatedHeight, translatedWidth]);

  const typographicUnits = block.typographicUnits ?? [];
  const preserveSpanOverride = hasPreservedLegacySpanOverride(block, pageNumber, language,
    key => overrides.has(key) || (selectedBlockKey === key && draftOverride !== null));
  const hasCompleteEditorialUnitOverrides = typographicUnits.length > 0 && typographicUnits.every(unit => {
    const unitKey = `page_${pageNumber}_unit_${unit.id}__${language}`;
    return overrides.has(unitKey) || (selectedBlockKey === unitKey && draftOverride !== null);
  });
  // Keep a legacy whole-block translation active until all editorial children
  // have their own saved values. Once the complete child set exists, the new
  // units become editable/renderable while the old record remains preserved
  // as a compatibility fallback.
  const hasLegacyWholeBlockOverride = overrides.has(blockKey)
    || (selectedBlockKey === blockKey && draftOverride !== null);
  if (typographicUnits.length > 0 && overridesReady
      && (!hasLegacyWholeBlockOverride || hasCompleteEditorialUnitOverrides)
      && !preserveSpanOverride) {
    return (
      <TypographicUnitBlock
        block={block}
        nextComponentY={findNextSameColumnComponentY(allBlocks, layoutObstacles, block)}
        units={typographicUnits}
        pageNumber={pageNumber}
        scale={scale}
        isAdmin={isAdmin}
        layoutMode={layoutMode}
        layoutUnitKey={layoutSelectionKey}
        layoutDraft={layoutDraft}
        layoutFrames={layoutFrames}
        inheritedLayoutFrames={inheritedLayoutFrames}
        onSelectLayoutFrame={onSelectLayoutFrame}
        onBlockClick={onBlockClick}
        selectedBlockKey={selectedBlockKey}
        overrides={overrides}
        draftOverride={draftOverride}
        language={language}
      />
    );
  }

  const creditUnits = block.creditUnits ?? (block.creditUnit ? [block.creditUnit] : []);
  if (creditUnits.length > 0 && overridesReady && !overrides.has(blockKey)) {
    return (
      <CreditUnitBlock
        block={block}
        units={creditUnits}
        pageNumber={pageNumber}
        scale={scale}
        isAdmin={isAdmin}
        onBlockClick={onBlockClick}
        selectedBlockKey={selectedBlockKey}
        overrides={overrides}
        draftOverride={draftOverride}
        language={language}
      />
    );
  }

  if (!block.lines || block.lines.length === 0) return null;

  const markerIndexes = listMarkerLineIndexes(block);
  const sortedMarkerIndexes = [...markerIndexes].sort((a, b) => a - b);
  const firstMarkerIndex = sortedMarkerIndexes[0] ?? -1;
  const shouldSplitListFlow = markerIndexes.size > 0
    && (markerIndexes.size > 1 || firstMarkerIndex > 0);
  const hasActiveWholeBlockDraft = selectedBlockKey === blockKey && draftOverride !== null;
  const canSplitListFlow = shouldSplitListFlow
    && !block.adminReadOnly
    && !block.preserveLegacySpanOverrides
    && !block.typographicUnits?.length
    && !block.typographicSpanUnits?.length
    && !block.creditUnits?.length
    && !block.creditUnit
    && !layoutMode
    && !layoutFrameOverride;
  const legacyMarkerGlyphs = sortedMarkerIndexes.map(index =>
    listMarkerGlyph(block.lines![index]) ?? sourceLineText(block.lines![index]).replace(/[\s\u00a0]+/gu, ''),
  );
  const legacyListParts = currentOverride ? splitLegacyListOverride(currentOverride, legacyMarkerGlyphs) : null;

  if (canSplitListFlow && (hasActiveWholeBlockDraft || (currentOverride && !legacyListParts))) {
    // Keep an existing whole-block draft intact if it lacks enough source
    // markers to migrate without guessing where one translated item ends.
    return <SpanBlock {...{
      block: { ...block, listMarkerLineIndexes: undefined, disableAutoListMarkerDetection: true },
      hasSourceInlineSymbols, coveredSourceSymbols, allBlocks, layoutObstacles, blockIdx, pageNumber, scale,
      isAdmin, contentsMap, onNavigate, onBlockClick, layoutMode, layoutUnitKey, layoutSelectionKey, layoutDraft,
      layoutFrames, inheritedLayoutFrames, layoutFrameForSelection,
      layoutFrameOverride, onSelectLayoutFrame, selectedBlockKey, overrides, overridesReady, draftOverride, language,
    }} />;
  }

  if (canSplitListFlow && !hasActiveWholeBlockDraft) {
    const parts = splitBlockIntoListFlowParts(block, markerIndexes);
    const rowOverrides = new Map(overrides);
    if (legacyListParts && currentOverride) {
      for (const part of parts) {
        if (part.kind !== 'text') continue;
        const rowBlock = listFlowTextBlock(block, part, pageNumber, blockIdx);
        if (!rowBlock?.editorKey) continue;
        const rowKey = `${rowBlock.editorKey}__${language}`;
        const segments = legacyListParts[part.markerOrdinal === undefined ? 0 : part.markerOrdinal + 1];
        if (!segments?.length || rowOverrides.has(rowKey)) continue;
        rowOverrides.set(rowKey, {
          ...currentOverride,
          spanKey: rowKey,
          bbox: rowBlock.bbox,
          segments,
          managedSourceSymbols: undefined,
        });
      }
    }

    return <>
      {parts.map(part => {
        if (part.kind === 'marker' && part.line) {
          return (
            <div key={part.key} className="block-container list-marker-source" aria-hidden="true"
              data-list-marker-line={part.line.id}
              style={{ position: 'absolute', left: `${blockX * scale}px`, top: `${blockY * scale}px`,
                width: `${blockW * scale}px`, height: `${blockH * scale}px`, zIndex: block.zIndex || 10,
                pointerEvents: 'none' }}>
              <LineRenderer line={part.line} scale={scale} blockOriginX={blockX} blockOriginY={blockY}
                isAdmin={false} isSelected={false} language={language} onClick={() => {}} />
            </div>
          );
        }
        const rowBlock = listFlowTextBlock(block, part, pageNumber, blockIdx);
        if (!rowBlock) return null;
        const rowUnitKey = frameUnitKey(pageNumber, rowBlock, blockIdx);
        return (
          <SpanBlock key={rowBlock.editorKey} block={rowBlock} hasSourceInlineSymbols={hasSourceInlineSymbols}
            coveredSourceSymbols={coveredSourceSymbols} allBlocks={allBlocks} layoutObstacles={layoutObstacles}
            blockIdx={blockIdx} pageNumber={pageNumber} scale={scale} isAdmin={isAdmin} contentsMap={contentsMap}
            onNavigate={onNavigate} onBlockClick={onBlockClick} layoutMode={layoutMode} layoutUnitKey={rowUnitKey}
            layoutSelectionKey={layoutSelectionKey} layoutDraft={layoutDraft} layoutFrames={layoutFrames}
            inheritedLayoutFrames={inheritedLayoutFrames}
            layoutFrameForSelection={sourceLayoutFrame(rowBlock)} onSelectLayoutFrame={onSelectLayoutFrame}
            selectedBlockKey={selectedBlockKey} overrides={rowOverrides} overridesReady={overridesReady}
            draftOverride={draftOverride} language={language} />
        );
      })}
    </>;
  }

  const inlineSpanStates = buildInlineSpanStates(
    block, pageNumber, selectedBlockKey, overrides, draftOverride, language,
  );

  const blockCanEdit = isAdmin && !layoutMode && !block.adminReadOnly;
  const blockCanSelectLayout = isAdmin && layoutMode && !block.adminReadOnly && !fixedEditorLineIndexes(block).size
    && !block.listFlowItem && !block.typographicUnits?.length && !block.creditUnits?.length && !block.creditUnit;
  const blockHoverClass = blockCanSelectLayout
    ? 'layout-frame-selectable'
    : blockCanEdit ? `block-editable ${selectedBlockKey === blockKey ? 'block-selected' : ''}` : '';
  const handleBlockClick = () => {
    if (blockCanSelectLayout) onSelectLayoutFrame(layoutUnitKey, layoutFrameForSelection);
    else if (blockCanEdit) onBlockClick(extractBlockInfo(blockKey, block));
  };
  const overflowClass = isAdmin && isOverflowing ? 'block-overflow' : '';
  const fixedLineIndexes = fixedEditorLineIndexes(block);
  const esmeraldaHeadingSource = block.lines
    ?.flatMap(line => line.spans)
    .find(span => needsEsmeraldaHeadingDrop(span.font, span.size, span.bbox[3] - span.bbox[1]));

  const sourceSegments = sourceSegmentsFromSpans(block.lines.flatMap(line => line.spans));
  const sourceSignature = (segments: Segment[]) => segments
    .map(segment => segment.symbolId ? `\uFFF9${segment.symbolId}\uFFFA` : segment.text)
    .join('').replace(/[\s\u00a0]+/g, ' ').trim();
  const sourceOverrideIsUnchanged = !!currentOverride
    && sourceSignature(currentOverride.segments) === sourceSignature(sourceSegments);
  if (language === 'en' && hasExactSourceGeometry(block) && (!currentOverride || sourceOverrideIsUnchanged)) {
    return (
      <div className={`block-container ${blockHoverClass} ${overflowClass}`} data-render-mode="sourceGeometry"
        style={{ ...blockStyle, left: `${blockX * scale}px`, top: `${blockY * scale}px`, width: `${blockW * scale}px`, height: `${blockH * scale}px` }}
        onClick={handleBlockClick} {...geometryAttributes}>
        <SourceGeometryBlock block={block} scale={scale} blockOriginX={blockX} blockOriginY={blockY} />
      </div>
    );
  }

  if (currentOverride) {
    const hasInlineSymbols = currentOverride.segments.some(hasInlineSemanticSymbol);
    const sourceAwareSegments = hasSourceInlineSymbols && hasInlineSymbols
      ? sourceMetricsForOverrideSegments(block, currentOverride.segments)
      : currentOverride.segments;
    const fallbackLineHeight = currentOverride.lineHeight ?? block.defaultLineHeight ?? layoutFrameOverride?.lineHeight
      ?? block.layoutFrame?.lineHeight ?? 1;
    const effectiveLineHeight = fallbackLineHeight;
    // Edited text uses translatedFlow; untouched EN stays in SourceGeometryBlock above.
    const fixedLineIndexes = fixedEditorLineIndexes(block);
    const fixedLines = (block.lines ?? []).filter((_, index) => fixedLineIndexes.has(index));
    const firstLine = editableBlockLines(block)[0] ?? block.lines[0];
    const hasStaticEditorLines = fixedLines.length > 0;
    const rawX = layoutFrameOverride?.x ?? (hasStaticEditorLines
      ? firstLine.bbox[0]
      : block.layoutFrame?.x ?? ((firstLine as any).availableX !== undefined ? (firstLine as any).availableX : blockX));
    const sourceFrameRight = block.layoutFrame
      ? block.layoutFrame.x + block.layoutFrame.width
      : ((firstLine as any).availableX ?? rawX) + ((firstLine as any).availableWidth ?? blockW);
    const rawWidth = hasStaticEditorLines
      ? Math.max(0, sourceFrameRight - rawX)
      : layoutFrameOverride?.width ?? block.layoutFrame?.width ?? (firstLine as any).availableWidth ?? blockW;
    const renderOriginX = translatedFrame ? translatedX : frameX;
    const renderOriginY = translatedFrame ? translatedY : blockY;
    const blockLineX = (rawX - renderOriginX) * scale;
    const blockLineW = rawWidth * scale;

    return (
      <div className={`block-container ${blockHoverClass} ${overflowClass}`} style={translatedStyle} onClick={handleBlockClick} {...geometryAttributes}>
        {fixedLines.map(line => (
          <div
            key={`static-${line.id}`}
            className="static-editor-line"
            onClick={event => event.stopPropagation()}
          >
            <LineRenderer
              line={line}
              scale={scale}
              blockOriginX={frameX}
              blockOriginY={blockY}
              isAdmin={false}
              isSelected={false}
              language={language}
              onClick={() => {}}
            />
          </div>
        ))}
        <div 
          ref={blockRef}
          className={`realbox`} 
          style={{
            position: 'absolute',
            left: `${blockLineX}px`,
            top: `${((layoutFrameOverride?.y ?? blockY) - renderOriginY) * scale}px`,
            width: `${blockLineW}px`,
            whiteSpace: block.noWrap ? 'pre' : 'pre-wrap',
            textAlign: currentOverride.textAlign ?? layoutFrameOverride?.textAlign ?? block.layoutFrame?.textAlign ?? 'left',
            lineHeight: effectiveLineHeight,
            display: 'block',
            fontSize: 0,
            cursor: layoutMode ? 'move' : isAdmin ? 'text' : 'default',
          }}
        >
          {sourceAwareSegments.map((seg, segIdx) => (
            <span
              key={segIdx}
              style={{
                fontFamily: segFontToCSS(seg.font),
                fontSize: `${seg.size * scale}px`,
                fontWeight: seg.weight,
                fontStyle: seg.style,
                fontVariantCaps: mapPdfFont(seg.font).variantCaps,
                color: seg.color,
                ...(seg.textStrokeWidthPt ? {
                  WebkitTextStroke: `${seg.textStrokeWidthPt * scale}px ${seg.textStrokeColor || '#231f20'}`,
                  paintOrder: 'stroke fill',
                } : {}),
                whiteSpace: block.noWrap ? 'pre' : 'pre-wrap',
                fontVariantLigatures: 'none',
                fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
                // EN uses source-native advances so symbols match the PDF. Keep
                // the established PT-BR copyfit tracking to prevent extra wraps.
                letterSpacing: hasInlineSymbols && language === 'en' ? 'normal' : '-0.015em',
                ...(esmeraldaHeadingSource && needsEsmeraldaHeadingDrop(
                  seg.font,
                  seg.size,
                  esmeraldaHeadingSource.bbox[3] - esmeraldaHeadingSource.bbox[1],
                ) ? { display: 'inline-block', transform: 'translateY(12%)' } : {}),
              }}
            >
              {seg.symbolId || resolveLegacySymbol(seg.font,seg.text)
                ? renderSegmentContent(seg, scale, language, 'translatedFlow')
                : block.noWrap
                ? seg.text.replace(/[\r\n]+/g, ' ').replace(/[\t ]+/g, ' ')
                : seg.text}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`block-container ${blockHoverClass}`} style={blockStyle} onClick={handleBlockClick} {...geometryAttributes}>
      {block.lines.map((line, lIdx) => {
        const lineId = line.id !== undefined ? line.id : lIdx;
        const isFixedLine = fixedLineIndexes.has(lIdx);

        const renderedLine = (
          <LineRenderer
            key={lineId}
            line={line}
            scale={scale}
            blockOriginX={frameX}
            blockOriginY={blockY}
            targetPage={contentsMap?.get(line.id)}
            onNavigate={onNavigate}
            isAdmin={blockCanEdit && !isFixedLine}
            isSelected={false}
            language={language}
            coveredSourceSymbols={coveredSourceSymbols}
            onClick={() => {}}
            inlineSpanStates={inlineSpanStates}
            onInlineSpanClick={state => onBlockClick(state.info)}
          />
        );

        return isFixedLine ? (
          <div
            key={`static-${lineId}`}
            className="static-editor-line"
            onClick={event => event.stopPropagation()}
          >
            {renderedLine}
          </div>
        ) : renderedLine;
      })}
    </div>
  );
};

interface CreditUnitBlockProps {
  block: Block;
  units: CreditUnitDefinition[];
  pageNumber: number;
  scale: number;
  isAdmin: boolean;
  onBlockClick: (info: SelectedSpanInfo) => void;
  selectedBlockKey: string | null;
  overrides: Map<string, SpanOverride>;
  draftOverride: SpanOverride | null;
  language: 'en' | 'pt-BR';
}

const CreditUnitBlock: React.FC<CreditUnitBlockProps> = ({
  block, units, pageNumber, scale, isAdmin, onBlockClick, selectedBlockKey,
  overrides, draftOverride, language,
}) => {
  const blockX = block.bbox[0];
  const blockY = block.bbox[1];
  const blockW = block.bbox[2] - block.bbox[0];
  const blockH = block.bbox[3] - block.bbox[1];
  const blockStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${blockX * scale}px`,
    top: `${blockY * scale}px`,
    width: `${blockW * scale}px`,
    height: `${blockH * scale}px`,
    zIndex: block.zIndex || 10,
  };

  return (
    <div className="block-container" style={blockStyle}>
      {units.flatMap(unit => (['label', 'body'] as const).map(fieldName => {
        const field = unit[fieldName];
        const spanKey = `page_${pageNumber}_credit_${unit.id}_${field.id}__${language}`;
        const override = selectedBlockKey === spanKey && draftOverride
          ? draftOverride
          : overrides.get(spanKey) || null;
        return (
          <CreditField
            key={spanKey}
            block={block}
            field={field}
            spanKey={spanKey}
            scale={scale}
            isAdmin={isAdmin}
            selected={selectedBlockKey === spanKey}
            override={override}
            language={language}
            onBlockClick={onBlockClick}
          />
        );
      }))}
    </div>
  );
};

interface TypographicUnitBlockProps {
  block: Block;
  nextComponentY?: number;
  units: TypographicUnitDefinition[];
  pageNumber: number;
  scale: number;
  isAdmin: boolean;
  layoutMode: boolean;
  layoutUnitKey: string | null;
  layoutDraft: LayoutFrame | null;
  layoutFrames: Map<string, LayoutFrame>;
  inheritedLayoutFrames: Map<string, LayoutFrame>;
  onSelectLayoutFrame: (unitKey: string, initialFrame: LayoutFrame) => void;
  onBlockClick: (info: SelectedSpanInfo) => void;
  selectedBlockKey: string | null;
  overrides: Map<string, SpanOverride>;
  draftOverride: SpanOverride | null;
  language: 'en' | 'pt-BR';
}

function findNextSameColumnComponentY(
  blocks: Block[],
  layoutObstacles: [number, number, number, number][],
  block: Block,
): number | undefined {
  const frames = block.typographicUnits
    ?.filter(unit => !unit.fixedPosition)
    .map(unit => unit.field.frame) ?? [];
  if (frames.length === 0) return undefined;
  const x0 = Math.min(...frames.map(frame => frame.x));
  const x1 = Math.max(...frames.map(frame => frame.x + frame.width));
  const nextTextY = blocks
    .filter(candidate => candidate.id !== block.id
      // Treat every later text block whose ink intersects this component's frame as an obstacle.
      // This includes legacy blocks and indented text, not only typographic-unit siblings.
      && candidate.bbox[0] < x1
      && candidate.bbox[2] > x0
      && candidate.bbox[1] >= block.bbox[3])
    .reduce<number | undefined>((nearest, candidate) =>
      nearest === undefined || candidate.bbox[1] < nearest ? candidate.bbox[1] : nearest,
    undefined);
  const nextArtworkY = layoutObstacles
    // Artwork that already starts above the block may overlap its text column
    // as decoration; it is not a downstream flow boundary. Only artwork whose
    // top edge begins after this block can limit paragraph reflow below it.
    .filter(([imageX0, imageY0, imageX1]) =>
      imageX0 < x1 && imageX1 > x0 && imageY0 >= block.bbox[3],
    )
    .reduce<number | undefined>((nearest, image) => {
      const obstacleY = image[1];
      return nearest === undefined || obstacleY < nearest ? obstacleY : nearest;
    }, undefined);
  if (nextTextY === undefined) return nextArtworkY;
  if (nextArtworkY === undefined) return nextTextY;
  return Math.min(nextTextY, nextArtworkY);
}

function extractInlineSpanUnitInfo(
  spanKey: string,
  block: Block,
  unit: TypographicSpanUnitDefinition,
): SelectedSpanInfo {
  const selected = new Set(unit.spanRefs);
  const spans = (block.lines || []).flatMap(line => line.spans.flatMap((span, index) =>
    selected.has(`${line.id}:${span.sourceSpanIndex ?? index}`) ? [span] : [],
  ));
  const first = spans.find(span => span.text.trim() && !span.semanticSymbolId && !resolveLegacySymbol(span.font,span.text) && !span.font.includes('Dingbat')) ?? spans[0];
  const font = first?.font || 'OptimaLTStd';
  const mapped = mapPdfFont(font);
  const text = spans.map(span => span.displayOverride || span.text).join('').replace(/\n/g, ' ').replace(/ +/g, ' ').trim();
  const sourceSegments = sourceSegmentsFromSpans(spans);
  const boxes = spans.map(span => span.bbox);
  const bbox: [number, number, number, number] = boxes.length ? [
    Math.min(...boxes.map(box => box[0])), Math.min(...boxes.map(box => box[1])),
    Math.max(...boxes.map(box => box[2])), Math.max(...boxes.map(box => box[3])),
  ] : [...block.bbox] as [number, number, number, number];
  return {
    spanKey,
    text,
    font,
    family: mapped.family,
    weight: first?.renderWeightOverride ?? mapped.weight,
    style: mapped.style,
    color: first?.color || '#231f20',
    size: first?.size || 10,
    bbox,
    textAlign: 'left',
    lineHeight: block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
    sourceSegments,
    editorContext: 'span-unit',
  };
}

const TypographicUnitBlock: React.FC<TypographicUnitBlockProps> = ({
  block, nextComponentY, units, pageNumber, scale, isAdmin, layoutMode, layoutUnitKey, layoutDraft,
  layoutFrames, inheritedLayoutFrames, onSelectLayoutFrame, onBlockClick, selectedBlockKey,
  overrides, draftOverride, language,
}) => {
  const [measuredUnitHeightsPt, setMeasuredUnitHeightsPt] = useState<Record<string, number>>({});
  const handleUnitMeasure = useCallback((unitId: string, heightPx: number | null) => {
    if (!scale) return;
    setMeasuredUnitHeightsPt(current => {
      if (heightPx === null) {
        if (!(unitId in current)) return current;
        const next = { ...current };
        delete next[unitId];
        return next;
      }
      const heightPt = heightPx / scale;
      return Math.abs((current[unitId] ?? -1) - heightPt) < 0.05
        ? current
        : { ...current, [unitId]: heightPt };
    });
  }, [scale]);
  // A semantic field owns its complete source lines, whatever its editorial
  // subtype. Nested same-font span targets may render legacy overrides, but
  // must not intercept clicks intended to open the whole heading/body field.
  const editorialLineIds = new Set(units.flatMap(unit => unit.field.lineIds));
  const inlineSpanStates = exposesNestedSpanTargets(block) ? buildInlineSpanStates(
    block, pageNumber, selectedBlockKey, overrides, draftOverride, language, editorialLineIds,
  ) : undefined;
  const blockX = block.bbox[0];
  const blockY = block.bbox[1];
  const blockW = block.bbox[2] - block.bbox[0];
  const blockH = block.bbox[3] - block.bbox[1];
  const blockStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${blockX * scale}px`,
    top: `${blockY * scale}px`,
    width: `${blockW * scale}px`,
    height: `${blockH * scale}px`,
    zIndex: block.zIndex || 10,
  };
  const fixedLineIndexes = fixedEditorLineIndexes(block);
  // Every editorial unit paints its source lines when it has no override and
  // paints translated segments when it does. Keep those lines out of the
  // fixed-source layer in both cases; otherwise untranslated EN is painted
  // twice whenever fixed indexes overlap unit-owned lines.
  const fixedSourceLines = (block.lines ?? []).filter((line, index) =>
    fixedLineIndexes.has(index) && !editorialLineIds.has(line.id),
  );
  const untouchedSourceUnits = language === 'en' && !isAdmin && units.every(unit => {
    const spanKey = `page_${pageNumber}_unit_${unit.id}__${language}`;
    return !overrides.has(spanKey) && !(selectedBlockKey === spanKey && draftOverride !== null);
  });
  if (untouchedSourceUnits && hasExactSourceGeometry(block)) {
    return (
      <div className="block-container" data-render-mode="sourceGeometry" style={blockStyle}>
        <SourceGeometryBlock block={block} scale={scale} blockOriginX={blockX} blockOriginY={blockY} />
      </div>
    );
  }
  const flowUnits = units.filter(unit => !unit.fixedPosition);

  // Each translated paragraph keeps its source gap to the next paragraph.
  // Any extra height is accumulated through the rest of this visual block,
  // so three or more siblings flow just as the two-unit p.78 pilot does.
  const requiredOffsetsPt = new Map<string, number>();
  let totalRequiredPushPt = 0;
  flowUnits.forEach((unit, index) => {
    requiredOffsetsPt.set(unit.id, totalRequiredPushPt);
    const nextUnit = flowUnits[index + 1];
    const measuredHeightPt = measuredUnitHeightsPt[unit.id];
    if (!nextUnit || measuredHeightPt === undefined) return;
    const sourceGapPt = nextUnit.field.bbox[1] - unit.field.bbox[1];
    totalRequiredPushPt += Math.max(0, measuredHeightPt - sourceGapPt);
  });
  const availablePushPt = nextComponentY === undefined
    ? 0
    : Math.max(0, nextComponentY - block.bbox[3]);
  const canApplyReflowPush = totalRequiredPushPt <= availablePushPt + 0.01;
  const flowOffsetFor = (unit: TypographicUnitDefinition | undefined): number =>
    unit && canApplyReflowPush ? requiredOffsetsPt.get(unit.id) ?? 0 : 0;

  return (
    <div className="block-container" style={blockStyle}>
      {fixedSourceLines.map(line => (
        <div key={`static-${line.id}`} className="static-editor-line" onClick={event => event.stopPropagation()}>
          <LineRenderer
            line={line}
            scale={scale}
            blockOriginX={blockX}
            blockOriginY={blockY}
            isAdmin={false}
            isSelected={false}
            language={language}
            onClick={() => {}}
          />
        </div>
      ))}
      {units.map((unit, unitIndex) => {
        const spanKey = `page_${pageNumber}_unit_${unit.id}__${language}`;
        const frameKey = typographicUnitFrameKey(pageNumber, unit);
        const sourceFrame = sourceLayoutFrameForField(unit.field);
        const frameForSelection = layoutFrames.get(frameKey)
          ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(frameKey) : undefined)
          ?? sourceFrame;
        const frameOverride = layoutMode && layoutUnitKey === frameKey && layoutDraft
          ? layoutDraft
          : layoutFrames.get(frameKey) ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(frameKey) : undefined);
        const override = selectedBlockKey === spanKey && draftOverride
          ? draftOverride
          : overrides.get(spanKey) || null;
        const nextFlowUnit = unit.fixedPosition ? undefined : units
          .slice(unitIndex + 1)
          .find(nextUnit => !nextUnit.fixedPosition);
        const nextFieldY = nextFlowUnit
          ? nextFlowUnit.field.bbox[1] + flowOffsetFor(nextFlowUnit)
          : undefined;
        const unitOffsetPt = flowOffsetFor(unit);
        return (
          <CreditField
            key={spanKey}
            block={block}
            field={unit.field}
            spanKey={spanKey}
            scale={scale}
            isAdmin={isAdmin}
            selected={selectedBlockKey === spanKey}
            override={override}
            language={language}
            nextFieldY={nextFieldY}
            topOffsetPt={unitOffsetPt}
            onPreviewMeasure={!unit.fixedPosition
              ? heightPx => handleUnitMeasure(unit.id, heightPx)
              : undefined}
            inlineSpanStates={inlineSpanStates}
            onInlineSpanClick={state => onBlockClick(state.info)}
            onBlockClick={onBlockClick}
            layoutMode={layoutMode}
            layoutUnitKey={frameKey}
            layoutFrameForSelection={frameForSelection}
            layoutFrameOverride={frameOverride}
            onSelectLayoutFrame={onSelectLayoutFrame}
            unitKind={unit.kind}
            unitLabel={unit.label}
          />
        );
      })}
    </div>
  );
};

interface CreditFieldProps {
  block: Block;
  field: CreditFieldDefinition;
  spanKey: string;
  scale: number;
  isAdmin: boolean;
  selected: boolean;
  override: SpanOverride | null;
  language: 'en' | 'pt-BR';
  unitKind?: TypographicUnitDefinition['kind'];
  unitLabel?: string;
  nextFieldY?: number;
  topOffsetPt?: number;
  layoutMode?: boolean;
  layoutUnitKey?: string;
  layoutFrameForSelection?: LayoutFrame;
  layoutFrameOverride?: LayoutFrame;
  onSelectLayoutFrame?: (unitKey: string, initialFrame: LayoutFrame) => void;
  onPreviewMeasure?: (heightPx: number | null) => void;
  inlineSpanStates?: Map<string, InlineSpanUnitRenderState>;
  onInlineSpanClick?: (state: InlineSpanUnitRenderState) => void;
  onBlockClick: (info: SelectedSpanInfo) => void;
}

/** Preserve a PDF line's first ink position when a leading source newline is
 * split into its own editorial field and no longer participates in browser flow. */
function sourceLeadingContentOffsetPt(line: LineData | undefined): number {
  if (!line) return 0;
  let hasLeadingBreak = false;
  for (const span of line.spans) {
    if (span.renderOnlyStrokePass) continue;
    if (!span.text.trim() && span.text.includes('\n')) {
      hasLeadingBreak = true;
      continue;
    }
    if (span.text.trim() || span.semanticSymbolId || span.pictogramSvgPath) {
      return hasLeadingBreak ? Math.max(0, span.bbox[1] - line.bbox[1]) : 0;
    }
  }
  return 0;
}

const CreditField: React.FC<CreditFieldProps> = ({
  block, field, spanKey, scale, isAdmin, selected, override, language, nextFieldY,
  unitKind, unitLabel, topOffsetPt = 0, layoutMode = false, layoutUnitKey, layoutFrameForSelection,
  layoutFrameOverride, onSelectLayoutFrame, onPreviewMeasure, inlineSpanStates, onInlineSpanClick, onBlockClick,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const blockX = block.bbox[0];
  const blockY = block.bbox[1];
  const activeFrame = layoutFrameOverride ?? (layoutMode ? layoutFrameForSelection : undefined);
  const fieldX = activeFrame?.x ?? field.frame.x;
  const fieldY = activeFrame?.y ?? field.bbox[1];
  const effectiveFieldY = fieldY + topOffsetPt;
  const fieldHeight = activeFrame?.height ?? (field.bbox[3] - field.bbox[1]);
  const fieldWidth = activeFrame?.width ?? field.frame.width;
  const neighborHeight = nextFieldY !== undefined && nextFieldY > effectiveFieldY
    ? nextFieldY - effectiveFieldY
    : fieldHeight;
  const fieldStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(fieldX - blockX) * scale}px`,
    top: `${(fieldY - blockY + topOffsetPt) * scale}px`,
    width: `${fieldWidth * scale}px`,
    minHeight: `${fieldHeight * scale}px`,
    ...(activeFrame?.rotation ? {
      transform: `rotate(${activeFrame.rotation}deg)`,
      transformOrigin: 'center center',
    } : {}),
  };
  const geometryAttributes = adminGeometryAttributes(isAdmin, layoutMode && layoutUnitKey ? layoutUnitKey : spanKey, {
    x: fieldX,
    y: effectiveFieldY,
    width: fieldWidth,
    height: fieldHeight,
    rotation: activeFrame?.rotation ?? 0,
  });

  useEffect(() => {
    const preview = previewRef.current;
    if (override && preview) {
      // A unit can fit its own ink bbox and still run into the next typography unit.
      // Bound it by the next field's start when one exists; keep 1px for browser rounding.
      setIsOverflowing(preview.scrollHeight > neighborHeight * scale + 1);
      onPreviewMeasure?.(preview.scrollHeight);
    } else {
      setIsOverflowing(false);
      onPreviewMeasure?.(null);
    }
  }, [onPreviewMeasure, override, neighborHeight, scale]);

  const lines = (block.lines || []).filter(line => field.lineIds.includes(line.id));
  const leadingContentOffsetPt = sourceLeadingContentOffsetPt(lines[0]);
  const sourceClass = isAdmin ? (layoutMode ? 'layout-frame-selectable' : 'credit-edit-field') : '';
  const selectedClass = selected ? 'credit-field-selected' : '';
  const overflowClass = isAdmin && isOverflowing ? 'block-overflow' : '';

  const handleClick = (event: React.MouseEvent) => {
    if (!isAdmin) return;
    event.stopPropagation();
    if (layoutMode && layoutUnitKey && layoutFrameForSelection) {
      onSelectLayoutFrame?.(layoutUnitKey, layoutFrameForSelection);
      return;
    }
    onBlockClick(extractCreditFieldInfo(spanKey, block, field, unitKind, unitLabel));
  };

  return (
    <div
      className={`credit-field ${sourceClass} ${selectedClass} ${overflowClass}`}
      style={{ ...fieldStyle, cursor: layoutMode ? 'crosshair' : undefined }}
      onClick={handleClick}
      {...geometryAttributes}
    >
      {override ? (
        <div
          ref={previewRef}
          className="realbox"
          style={{
            position: 'relative',
            width: '100%',
            whiteSpace: 'pre-wrap',
            textAlign: override.textAlign ?? activeFrame?.textAlign ?? field.frame.textAlign ?? 'left',
            lineHeight: override.lineHeight ?? activeFrame?.lineHeight ?? field.frame.lineHeight ?? block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
            display: 'block',
            fontSize: 0,
            // Only translated segments omit the source newline-only run. Keep
            // its measured first-ink offset here; the EN line renderer still
            // has the run and must not receive the same offset a second time.
            paddingTop: `${leadingContentOffsetPt * scale}px`,
          }}
        >
          {renderCreditSegments(override.segments, field.links, language, scale, isAdmin)}
        </div>
      ) : (
        lines.map(line => (
          <LineRenderer
            key={line.id}
            line={line}
            scale={scale}
            blockOriginX={fieldX}
            blockOriginY={fieldY}
            isAdmin={isAdmin}
            isSelected={false}
            language={language}
            onClick={() => {}}
            inlineSpanStates={inlineSpanStates}
            onInlineSpanClick={onInlineSpanClick}
          />
        ))
      )}
    </div>
  );
};

interface LineRendererProps {
  line: LineData;
  scale: number;
  blockOriginX: number;
  blockOriginY: number;
  targetPage?: number;
  onNavigate?: (pageNum: number) => void;
  isAdmin: boolean;
  isSelected: boolean;
  language: 'en' | 'pt-BR';
  coveredSourceSymbols?: Set<string>;
  override?: SpanOverride;
  onClick: () => void;
  inlineSpanStates?: Map<string, InlineSpanUnitRenderState>;
  onInlineSpanClick?: (state: InlineSpanUnitRenderState) => void;
}

const LineRenderer: React.FC<LineRendererProps> = ({ 
  line, scale, blockOriginX, blockOriginY, targetPage, 
  onNavigate, isAdmin, isSelected, language, override, onClick, inlineSpanStates, onInlineSpanClick,
  coveredSourceSymbols,
}) => {
  // Some composite source illustrations (for example page 15's inset encounter
  // diagram) already contain these words in the background artwork. Keep the
  // extracted text available for Admin selection, but avoid painting it twice
  // in the English source view. A localized asset is still required before
  // translating text that is baked into that illustration.
  const rasterizedDuplicateLanguage = (line as any).rasterizedDuplicateLanguage as 'en' | 'pt-BR' | 'all' | undefined;
  const duplicateIsVisible = (line as any).rasterizedDuplicate
    && (!rasterizedDuplicateLanguage || rasterizedDuplicateLanguage === 'all' || rasterizedDuplicateLanguage === language);
  if (duplicateIsVisible && !isAdmin) {
    return null;
  }

  const lineY = (line.bbox[1] + (line.renderTopOffsetPt ?? 0) - blockOriginY) * scale;
  const lineH = (line.bbox[3] - line.bbox[1]) * scale;
  
  // Use availableWidth/X (column bounds) if available, otherwise fallback to exact text bounds
  const rawX = (line as any).availableX !== undefined ? (line as any).availableX : line.bbox[0];
  const rawWidth = (line as any).availableWidth || (line.bbox[2] - line.bbox[0]);
  
  const lineX = (rawX - blockOriginX) * scale;
  const lineW = rawWidth * scale;

  // A few labels in the source PDF are set vertically. Keep their original
  // text direction and rotate the horizontal HTML line into the measured PDF
  // box. The offsets compensate for the rotated box's new top-left corner.
  const verticalDirection = line.dir && Math.abs(line.dir[0]) < 0.001 && Math.abs(Math.abs(line.dir[1]) - 1) < 0.001
    ? Math.sign(line.dir[1])
    : 0;
  const lineRotation = verticalDirection * 90;
  const verticalLineStyle: React.CSSProperties = verticalDirection ? {
    top: `${lineY + (verticalDirection < 0 ? lineH : 0)}px`,
    left: `${lineX + (verticalDirection > 0 ? lineW : 0)}px`,
    height: `${lineW}px`,
    width: `${lineH}px`,
    transform: `rotate(${lineRotation}deg)${line.renderScaleX && !override ? ` scaleX(${line.renderScaleX})` : ''}`,
    transformOrigin: 'left top',
  } : {};
  
  const sourceFlowStartX = line.renderSourceSpanGeometry && line.renderSourceSpanStartPt !== undefined
    ? line.renderSourceSpanStartPt
    : line.bbox[0] + (line.renderTextOffsetPt ?? 0);
  const originalX = (sourceFlowStartX - blockOriginX) * scale;
  const textOffset = Math.max(0, originalX - lineX);

  const sourceText = line.spans.map(span => span.text).join('');
  const overrideText = override?.segments.map(segment => segment.text).join('') ?? '';
  const sourceVisualChars = line.spans.flatMap(span => {
    const sourceChars = Array.from(span.text);
    const displayChars = Array.from((span as any).displayOverride ?? span.text);
    return sourceChars.length === displayChars.length ? displayChars : sourceChars;
  });
  const preserveSourceAlternates = !!override && overrideText === sourceText && sourceVisualChars.join('') !== sourceText;
  let sourceCharIndex = 0;
  const previewSegments = preserveSourceAlternates
    ? override!.segments.map(segment => {
        const chars = Array.from(segment.text);
        const text = chars.map(char => {
          const sourceChar = sourceVisualChars[sourceCharIndex];
          sourceCharIndex += 1;
          return sourceChar ?? char;
        }).join('');
        return { ...segment, text };
      })
    : override?.segments;

  const hoverClass = isAdmin ? `span-editable ${isSelected ? 'span-selected' : ''}` : '';
  const confirmedGhostClass = isAdmin && duplicateIsVisible && (line as any).rasterizedDuplicate
    && !(line as any).hideRasterizedDuplicateAdminMarker ? 'ghost-confirmed' : '';
  const ghostStatusLabel = confirmedGhostClass ? 'Confirmed duplicate: text is preserved for editing but hidden in normal reading.' : undefined;
  const lineClassName = [hoverClass, confirmedGhostClass, targetPage ? 'contents-link' : ''].filter(Boolean).join(' ');

  const lineStyle: React.CSSProperties = {
    position: 'absolute',
    top: `${lineY}px`,
    left: `${lineX}px`,
    height: `${lineH}px`,
    width: `${lineW}px`,
    display: 'flex',
    alignItems: 'baseline',
    whiteSpace: 'pre',
    cursor: targetPage ? 'pointer' : (isAdmin ? 'text' : undefined),
    textAlign: 'left',
    lineHeight: 1, // Fix overlap from custom font metrics
    ...verticalLineStyle,
    ...(confirmedGhostClass ? { zIndex: 5000 } : {}),
    ...(!verticalDirection && line.renderScaleX && !override ? {
      transform: `scaleX(${line.renderScaleX})`,
      transformOrigin: 'left top',
    } : {}),
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isAdmin) {
      // In admin mode, clicking a contents entry selects its block for editing.
      // Let the event bubble to the block's click handler instead of navigating.
      onClick();
    } else if (targetPage && onNavigate) {
      e.stopPropagation();
      onNavigate(targetPage);
    }
  };

  if (override && previewSegments && previewSegments.length > 0) {
    const hasInlineSymbols = previewSegments.some(hasInlineSemanticSymbol);
    const sourceHasEsmeraldaHeading = line.spans.some(span =>
      needsEsmeraldaHeadingDrop(span.font, span.size, span.bbox[3] - span.bbox[1]),
    );
    return (
      <div 
        className={`realbox ${lineClassName}`}
        data-ghost-status={confirmedGhostClass ? 'confirmed-duplicate' : undefined}
        title={ghostStatusLabel}
        aria-description={ghostStatusLabel}
        style={{
          ...lineStyle,
          paddingLeft: `${textOffset}px`,
          boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
          textAlign: override.textAlign || 'left',
          display: 'block',
          fontSize: 0,
        }}
        onClick={handleClick}
      >
        {previewSegments.map((seg, segIdx) => (
          <span
            key={segIdx}
            style={{
              fontFamily: Array.from(seg.text).some(char => {
                const codepoint = char.codePointAt(0) ?? 0;
                return codepoint >= 0xE000 && codepoint <= 0xF8FF;
              }) ? "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif" : segFontToCSS(seg.font),
              fontSize: `${seg.size * scale}px`,
              fontWeight: seg.weight,
              fontStyle: seg.style,
              fontVariantCaps: mapPdfFont(seg.font).variantCaps,
              color: seg.color,
              ...(seg.textStrokeWidthPt ? {
                WebkitTextStroke: `${seg.textStrokeWidthPt * scale}px ${seg.textStrokeColor || '#231f20'}`,
                paintOrder: 'stroke fill',
              } : {}),
              whiteSpace: 'pre-wrap',
              fontVariantLigatures: 'none',
              fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
              // Keep preview advances identical to the saved editable flow.
              letterSpacing: hasInlineSymbols && language === 'en' ? 'normal' : '-0.015em',
              ...(sourceHasEsmeraldaHeading && needsEsmeraldaHeadingDrop(seg.font, seg.size, lineH / scale)
                ? { display: 'inline-block', transform: 'translateY(12%)' }
                : {}),
            }}
          >
            {renderSegmentContent(seg, scale, language)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{...lineStyle, paddingLeft: `${textOffset}px`, boxSizing: 'border-box'}}
      onClick={handleClick}
      className={lineClassName}
      data-ghost-status={confirmedGhostClass ? 'confirmed-duplicate' : undefined}
      title={ghostStatusLabel}
      aria-description={ghostStatusLabel}
    >
      {line.spans.map((span, si) => {
        const inlineUnit = inlineSpanStates?.get(`${line.id}:${span.sourceSpanIndex ?? si}`);
        const inlineUnitInteractive = !!inlineUnit && inlineUnit.interactive !== false;
        // A unit can cover several source spans. Paint its override once;
        // virtual source icons keep their original reference without repainting.
        if(inlineUnit?.override && `${line.id}:${span.sourceSpanIndex ?? si}`!==inlineUnit.renderAtRef)return null;
        const sourceAdvanceWidth = Math.max(0, span.bbox[2] - span.bbox[0]) * scale;
        const useSourceGeometry = !override
          && line.renderSourceSpanGeometry
          && (line.renderSourceGeometryThroughSpan === undefined || (span.sourceSpanIndex ?? si) <= line.renderSourceGeometryThroughSpan);
        const previousSpan = useSourceGeometry
          ? [...line.spans.slice(0, si)].reverse().find(candidate => !candidate.renderOnlyStrokePass)
          : previousSourceSpan(line.spans,si);
        const sourceAdvanceGap = previousSpan
          ? (useSourceGeometry ? span.bbox[0] - previousSpan.bbox[2] : Math.max(0, span.bbox[0] - previousSpan.bbox[2])) * scale
          : 0;
        const isUnsupportedSymbol =
          (span.font?.includes('Webdings') && !(span.font?.includes('Webdings') && span.text === '\uF07E')) ||
          (span.font?.includes('Wingdings') && !span.pictogramDisplayOverride) ||
          (span.font?.includes('ZapfDingbats') && !span.pictogramSvgPath);
        const isReplacedBySourceOverlay = span.renderAsSourceOverlayDuplicate
          && (span.renderSourceOverlayLanguage === 'all' || span.renderSourceOverlayLanguage === language);
        if (span.renderOnlyStrokePass) return null;
        if (isReplacedBySourceOverlay && (!inlineUnit?.override || span.semanticSymbolId)) {
          if (!useSourceGeometry) return null;
          // A source vector may be painted by a page overlay while still
          // occupying a measured text advance. Keep that advance in the
          // source-faithful flow, even when it is not a semantic-symbol span.
          if (!span.semanticSymbolId) {
            return (
              <span
                key={si}
                aria-hidden="true"
                data-source-overlay-advance={span.sourcePaintAuditId ?? 'vector'}
                style={{
                  flex: `0 0 ${sourceAdvanceWidth}px`,
                  marginInlineStart: `${sourceAdvanceGap}px`,
                  minWidth: 0,
                  visibility: 'hidden',
                  pointerEvents: 'none',
                }}
              />
            );
          }
          const renderSemanticSource = (span.sourceRendering
            ?? getSemanticSymbol(span.semanticSymbolId)?.sourceRendering) === 'semantic-inline';
          const sourceSymbolMetrics = span.sourceSymbolMetrics
            ? { ...span.sourceSymbolMetrics, gapEm: undefined, trailingGapEm: undefined }
            : undefined;
          if (renderSemanticSource && !override) {
            const [x0, y0, x1, y1] = span.bbox;
            const sourceTop = (y0 - line.bbox[1]) * scale;
            const sourceLeft = (x0 - rawX) * scale;
            const sourceWidth = (x1 - x0) * scale;
            const sourceHeight = (y1 - y0) * scale;
            return (
              <React.Fragment key={`${si}:source-inline-symbol`}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: `0 0 ${sourceAdvanceWidth}px`,
                    marginInlineStart: `${sourceAdvanceGap}px`,
                    minWidth: 0,
                    height: 0,
                    alignSelf: 'flex-start',
                    fontSize: 0,
                    lineHeight: 0,
                    visibility: 'hidden',
                    pointerEvents: 'none',
                  }}
                />
                <span
                  data-source-inline-semantic={span.semanticSymbolId}
                  style={{
                    position: 'absolute',
                    display: 'block',
                    left: `${sourceLeft}px`,
                    top: `${sourceTop}px`,
                    width: `${sourceWidth}px`,
                    height: `${sourceHeight}px`,
                    pointerEvents: 'none',
                  }}
                >
                  <SemanticSymbol id={span.semanticSymbolId} language={language}
                    size={span.size * scale} color={span.color} metrics={sourceSymbolMetrics} alignToTop />
                </span>
              </React.Fragment>
            );
          }
          return (
            <span
              key={si}
              aria-hidden={renderSemanticSource ? undefined : 'true'}
              data-source-inline-placeholder={renderSemanticSource ? undefined : span.semanticSymbolId}
              data-source-inline-semantic={renderSemanticSource ? span.semanticSymbolId : undefined}
              style={{
                flex: `0 0 ${sourceAdvanceWidth}px`,
                marginInlineStart: `${sourceAdvanceGap}px`,
                minWidth: 0,
                ...(renderSemanticSource ? {} : { visibility: 'hidden' }),
                pointerEvents: 'none',
              }}
            >
              {renderSemanticSource ? <SemanticSymbol id={span.semanticSymbolId} language={language}
                size={span.size * scale} color={span.color} metrics={sourceSymbolMetrics} /> : null}
            </span>
          );
        }
        // The source PDF paints Webdings U+F07E twice at the same bbox: a
        // 2pt white stroke and a red fill. PyMuPDF's text dict keeps only the
        // white pass, so reconstruct that one known glyph from its trace data.
        const isOutlinedImportantGlyph = span.font?.includes('Webdings') && span.text === '\uF07E';
        if (isUnsupportedSymbol && !isOutlinedImportantGlyph && !inlineUnit?.override) {
          // Some unsupported symbol fonts still occupy real source-PDF width.
          // On explicitly audited lines, keep an invisible flex item so later
          // editable words do not slide left into a tag or neighboring prose.
          if (useSourceGeometry) {
            return (
              <span
                key={si}
                aria-hidden="true"
                style={{
                  flex: `0 0 ${sourceAdvanceWidth}px`,
                  marginInlineStart: `${sourceAdvanceGap}px`,
                  visibility: 'hidden',
                  pointerEvents: 'none',
                }}
              />
            );
          }
          return null;
        }
        if (span.size < 4.0 && !(line as any).renderTinyText) {
          return null; // Hide microscopic vector text artifacts embedded in images
        }

        const mapped = mapPdfFont(span.font);
        const isPUA = !!span.displayOverride;
        const spanHeight = span.bbox[3] - span.bbox[1];
        const shouldDropEsmeraldaHeading = needsEsmeraldaHeadingDrop(span.font, span.size, spanHeight);
        const spanStyle: React.CSSProperties = {
          fontFamily: isPUA
            ? "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif"
            : span.pictogramFontOverride
              ? `'${span.pictogramFontOverride}', sans-serif`
              : mapped.family,
          fontSize: `${(span.renderSizeOverridePt ?? span.size) * scale}px`,
          fontWeight: span.renderWeightOverride ?? mapped.weight,
          fontStyle: mapped.style,
          fontVariantCaps: mapped.variantCaps,
          color: isOutlinedImportantGlyph ? '#b91d23' : (span.color || '#231f20'),
          whiteSpace: 'pre',
          fontVariantLigatures: 'none',
          fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
          letterSpacing: useSourceGeometry ? 'normal' : '-0.015em',
          ...(useSourceGeometry ? {
            flex: `0 0 ${sourceAdvanceWidth}px`,
            marginInlineStart: `${sourceAdvanceGap}px`,
            minWidth: 0,
          } : {}),
          ...(span.renderTextStrokeWidthPt ? {
            WebkitTextStroke: `${span.renderTextStrokeWidthPt * scale}px ${span.renderTextStrokeColor || '#231f20'}`,
            paintOrder: 'stroke fill',
          } : {}),
          ...(isOutlinedImportantGlyph ? {
            WebkitTextStroke: `${2 * scale}px #ffffff`,
            paintOrder: 'stroke fill',
          } : {}),
          // Large Esmeralda headings have unusually tall PDF ink boxes. Nudge
          // only their visible glyphs down; this leaves surrounding line geometry intact.
          ...(shouldDropEsmeraldaHeading ? { display: 'inline-block', transform: 'translateY(12%)' } : {}),
        };

        if (span.sourceCompoundHidden || span.sourceCompoundSymbolId) {
          return <span key={si} aria-hidden="true" style={{ ...spanStyle, visibility: 'hidden', pointerEvents: 'none' }}>{span.text}</span>;
        }
        if (span.sourceInlineCoveredBy && coveredSourceSymbols?.has(span.sourceInlineCoveredBy)) {
          return <span key={si} aria-hidden="true" data-source-inline-covered={span.sourceInlineCoveredBy}
            style={{ ...spanStyle, visibility: 'hidden', pointerEvents: 'none' }}>{span.text}</span>;
        }

        const inlineOverrideSegments = inlineUnit?.override?.segments ?? [];
        const inlineOverrideText = inlineOverrideSegments.map(segment => segment.text).join('');
        const sourceDisplayChars = Array.from(span.displayOverride ?? span.text);
        const preserveInlineDisplayOverride = inlineOverrideText === span.text
          && sourceDisplayChars.length === Array.from(span.text).length
          && sourceDisplayChars.join('') !== span.text;
        let inlineSourceCharIndex = 0;
        const spanContent = inlineUnit?.override
          ? inlineOverrideSegments.map((segment, segmentIndex) => {
            const segmentText = preserveInlineDisplayOverride
              ? Array.from(segment.text).map(() => sourceDisplayChars[inlineSourceCharIndex++] ?? '').join('')
              : segment.text;
            return (
            <span
              key={segmentIndex}
              style={{
                fontFamily: Array.from(segment.text).some(char => {
                  const codepoint = char.codePointAt(0) ?? 0;
                  return codepoint >= 0xE000 && codepoint <= 0xF8FF;
                }) ? "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif" : segFontToCSS(segment.font),
                fontSize: `${segment.size * scale}px`,
                fontWeight: segment.weight,
                fontStyle: segment.style,
                fontVariantCaps: mapPdfFont(segment.font).variantCaps,
                color: segment.color,
                ...(segment.textStrokeWidthPt ? {
                  WebkitTextStroke: `${segment.textStrokeWidthPt * scale}px ${segment.textStrokeColor || '#231f20'}`,
                  paintOrder: 'stroke fill',
                } : {}),
                whiteSpace: 'pre',
                fontVariantLigatures: 'none',
                fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
                letterSpacing: inlineOverrideSegments.some(hasInlineSemanticSymbol) && language === 'en' ? 'normal' : '-0.015em',
              }}
            >
              {segment.symbolId || resolveLegacySymbol(segment.font,segment.text) ? renderSegmentContent(segment,scale,language) : segmentText}
            </span>
          );
          })
          : span.pictogramSvgPath ? (
            <svg
              aria-hidden="true"
              width="0.917em"
              height="1em"
              viewBox="0 0 917 1000"
              style={{ display: 'inline-block', verticalAlign: 'baseline', overflow: 'visible' }}
            >
              <path d={span.pictogramSvgPath} fill="currentColor" />
            </svg>
          ) : span.renderTextOverride ?? (isPUA ? span.displayOverride : span.pictogramDisplayOverride ?? span.text);

        return (
          <span
            key={si}
            className={inlineUnitInteractive ? `span-editable ${inlineUnit?.selected ? 'span-selected' : ''}` : undefined}
            style={{ ...spanStyle, ...(inlineUnitInteractive && isAdmin ? { cursor: 'text' } : {}) }}
            onClick={inlineUnitInteractive && isAdmin ? event => {
              event.stopPropagation();
              onInlineSpanClick?.(inlineUnit);
            } : undefined}
            aria-label={isPUA ? span.text : span.pictogramDisplayOverride ? 'Decorative item marker' : span.pictogramSvgPath ? 'Decorative level marker' : undefined}
          >
            {spanContent}
          </span>
        );
      })}
    </div>
  );
};
