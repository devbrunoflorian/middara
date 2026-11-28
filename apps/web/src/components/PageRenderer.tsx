import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { RichSpanEditor, type Segment, type SpanOverride, type TextAlignment } from './RichSpanEditor';
import type { AdminSymbolPaletteEditorState } from './AdminSymbolPalette';
import type { TranslationGlossaryDecision } from '../translationReview';
import { AdminRuler } from './AdminRuler';
import { AdminLayoutFrameEditor } from './AdminLayoutFrameEditor';
import type { LayoutAlignmentGuide, SnapFrameRect } from '../layoutFrameSnapping';
import { canonicalizeLayoutFrame, layoutFrameRight, layoutFrameTotal, layoutFrameTotalHeight } from '../layoutFrameGeometry';
import { deleteLayoutFrame, fetchLayoutFrames, loadLocalLayoutFrames, removeLocalLayoutFrame, saveLayoutFrame, saveLocalLayoutFrame, type LayoutLanguage } from '../layoutFrames';
import { getSemanticSymbol, resolveLegacySymbol, resolveSymbolRenderForMetrics, type InlineEditorContext, type InlineSymbolMetrics, type SymbolAliasPreferences } from '../symbols/semanticSymbols';
import { SemanticSymbol } from '../symbols/SemanticSymbol';
import { sourceSpanRuns } from '../symbols/sourceRuns';
import { compoundElementIsReplaced, type SourceCompoundElement } from '../symbols/sourceCompounds';
import { decodeOverrideData, encodeOverrideData } from '../symbols/overrideData';
import { contentsRowKey, contentsRowUsesLegacy, contentsRowLine, contentsLabelWidth, type ContentsRowDefinition } from '../contentsRows';
import { calculateTypographicFlowPlan } from '../typographicReflow';
import { getEditableNavigationIndex, getEditableNavigationTargets } from '../editableUnitNavigation';
import { focalScrollOffsets, type DocumentFocalPoint } from '../focalZoom';
import { ContentsRowFlow } from './ContentsRowFlow';
import { exposesNestedSpanTargets, hasLegacyTypographicUnitOverride, hasPreservedLegacySpanOverride } from '../editorUnitCompatibility';
import { sourceElementIsReplaced, sourceMaskClipPath, sourceOverlayMask, previousSourceSpan, type SourceInlineElement } from '../symbols/sourceInlineElements';
import './PageRenderer.css';
import './Toast.css';
import { payloadApiUrl } from '../config/payloadApi';
import { pageBackgroundUrl } from '../pageBackground';
import {
  dispatchLocalPersistenceChanged,
  loadLocalOverrides,
  LOCAL_PERSISTENCE_CHANGED_EVENT,
  removeLocalOverrideEntry,
  persistOverrideToPayload,
  persistedOverridesEqual,
  saveLocalOverrideEntry,
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
  /** Prose companion contributes to the editor; its source block paints EN. */
  sourceEditorOnly?: boolean;
  sourceTextCompanionFrom?: {blockId:string;blockIndex:number;lineId:string;spanIndex:number;text:string;symbolId:string};
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
  /** Visible glyph width from PDF text traces when the extraction bbox includes a stripped line ending. */
  sourceVisualWidthPt?: number;
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
  /** Recover a semantically known list glyph when the PDF text layer extracts it as a replacement character. */
  listMarkerGlyphOverride?: string;
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
  /** This extracted source line is already visible in a page-local raster asset. */
  rasterizedDuplicate?: boolean;
  /** Keep the Admin duplicate marker off when it would spill beyond a tightly cropped source overlay. */
  hideRasterizedDuplicateAdminMarker?: boolean;
  dir?: [number, number];
  spans: SpanData[];
  renderScaleX?: number;
}

export interface LayoutFrame {
  x: number;
  /** Final horizontal coordinate X₂; legacy records held the physical width here. */
  width: number;
  /** Physical frame width in PDF points. Missing only in legacy records. */
  total?: number;
  /** Physical frame height in PDF points. Missing only in legacy records. */
  totalHeight?: number;
  y?: number;
  height?: number;
  rotation?: number;
  textAlign?: TextAlignment;
  lineHeight?: number;
  hidden?: boolean;
  paragraphSpacingPt?: number;
  /** Administrator-created editable text frame with no English source block. */
  adminCreatedBlock?: true;
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
  /** Exact source glyphs (for example A–E diagram callouts) that are unchanged across viewer languages. */
  sourceTextLanguageInvariant?: boolean;
  /** Stable semantic editor key for newly split units; legacy blocks keep their index-based key. */
  editorKey?: string;
  /** Source line indexes that render as fixed page furniture and stay outside rich-text editing. */
  staticEditorLineIndexes?: number[];
  /** Source line indexes explicitly reviewed as non-editable list markers. */
  listMarkerLineIndexes?: number[];
  /** Ephemeral marker/body separation used only by a read-only experiment. */
  experimentalHangingIndent?: boolean;
  /** Internal marker used by generated text rows to keep their frame attached to the list marker. */
  listFlowItem?: boolean;
  /** Available translated-flow height before the next source list item. */
  listFlowHeight?: number;
  /** Source-measured inset for unmarked paragraphs that remain nested under a list item. */
  flowParagraphIndentsPt?: Record<number, number>;
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
  /** Some extracted typographic units omit a saved frame; derive it from their source lines. */
  frame?: LayoutFrame;
  links?: CreditLinkDefinition[];
  paragraphSpacingPt?: number;
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
  paragraphSpacingPt?: number;
}

export interface TypographicSpanUnitDefinition {
  id: string;
  /** `lineId:spanIndex` references identify a contiguous same-size run. */
  spanRefs: string[];
  /** Optional page-authored flow frame for a translated inline run whose source word is wider than its ink box. */
  flowFrame?: LayoutFrame;
}

interface InlineSpanUnitRenderState {
  spanKey: string;
  renderAtRef?: string;
  /** First following source line is the vertical boundary for translated flow. */
  sourceFlowBottomPt: number;
  override: SpanOverride | null;
  selected: boolean;
  /** Editorial paragraph lines route clicks to the paragraph editor while still rendering legacy span overrides. */
  interactive?: boolean;
  flowFrame?: LayoutFrame | null;
  diagnosticBlank?: boolean;
  info: SelectedSpanInfo;
}

function inlineSpanUnitFlowBottomPt(block: Block, unit: TypographicSpanUnitDefinition): number {
  const lines = block.lines ?? [];
  const unitLineIds = new Set(unit.spanRefs.map(reference => reference.slice(0, reference.lastIndexOf(':'))));
  const lastUnitLineIndex = lines.reduce((lastIndex, line, index) =>
    unitLineIds.has(line.id) ? index : lastIndex, -1);
  const lastUnitLineTop = lines[lastUnitLineIndex]?.bbox[1] ?? block.bbox[1];
  const nextPaintedLine = lines.slice(lastUnitLineIndex + 1).find(line =>
    line.bbox[1] > lastUnitLineTop + 0.5
      && line.spans.some(span =>
        !span.sourceEditorOnly && !span.renderOnlyStrokePass && !span.sourceCompoundHidden
          && (span.text.trim() || span.semanticSymbolId || span.pictogramSvgPath),
      ),
  );
  return nextPaintedLine?.bbox[1] ?? block.bbox[3];
}

function buildInlineSpanStates(
  block: Block,
  pageNumber: number,
  selectedBlockKey: string | null,
  overrides: Map<string, SpanOverride>,
  draftOverride: SpanOverride | null,
  language: 'en' | 'pt-BR',
  nonInteractiveLineIds?: Set<string>,
  layoutFrames?: Map<string, LayoutFrame>,
  diagnosticBlankKeys?: ReadonlySet<string>,
): Map<string, InlineSpanUnitRenderState> {
  const states = new Map<string, InlineSpanUnitRenderState>();
  for (const unit of block.typographicSpanUnits ?? []) {
    const spanKey = `page_${pageNumber}_unit_${unit.id}__${language}`;
    const override = selectedBlockKey === spanKey && draftOverride
      ? draftOverride
      : overrides.get(spanKey) || null;
    const unitKey = `page_${pageNumber}_unit_${unit.id}`;
    const state: InlineSpanUnitRenderState = {
      spanKey,
      renderAtRef: (block.lines ?? []).flatMap(line=>line.spans.flatMap((span,index)=>
        !span.semanticSymbolId && !span.renderOnlyStrokePass && unit.spanRefs.includes(`${line.id}:${span.sourceSpanIndex ?? index}`)
          ? [`${line.id}:${span.sourceSpanIndex ?? index}`] : []))[0],
      sourceFlowBottomPt: inlineSpanUnitFlowBottomPt(block, unit),
      override,
      selected: selectedBlockKey === spanKey,
      flowFrame: layoutFrames?.get(unitKey) ?? unit.flowFrame ?? null,
      diagnosticBlank: diagnosticBlankKeys?.has(spanKey) ?? false,
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
  /** Keep a cleanup overlay intact beneath inline symbols instead of punching source-position holes into it. */
  maskInlineElements?: boolean;
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

export function segFontToCSS(f: string): string {
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

export function splitSegmentsIntoParagraphs(segments: SpanOverride['segments']): SpanOverride['segments'][] {
  const paragraphs: SpanOverride['segments'][] = [];
  let current: SpanOverride['segments'] = [];
  for (const seg of segments) {
    let text = seg.text;
    while (text.includes('\n')) {
      const idx = text.indexOf('\n');
      const head = text.slice(0, idx);
      if (head.length > 0) {
        current.push({ ...seg, text: head });
      }
      paragraphs.push(current);
      current = [];
      text = text.slice(idx + 1);
    }
    if (text.length > 0) {
      current.push({ ...seg, text });
    }
  }
  if (current.length > 0 || paragraphs.length === 0) {
    paragraphs.push(current);
  }
  return paragraphs;
}

function renderCreditSegments(
  segments: SpanOverride['segments'],
  links: CreditLinkDefinition[] | undefined,
  language: 'en' | 'pt-BR',
  scale: number,
  isAdmin: boolean,
  whiteSpace:'pre-wrap'|'nowrap'='pre-wrap',
  normalizeLeadingTabForSpanKey?: string,
): React.ReactNode[] {
  const normalizeP41StepB = normalizeLeadingTabForSpanKey?.split('__')[0] === 'page_41_unit_p41-step-4-substep-b';
  const renderedSegments = normalizeP41StepB
    ? segments.map((segment, index) => index === 1 ? { ...segment, text: segment.text.replace(/^\t/u, ' ') } : segment)
    : segments;
  const hasInlineSymbols = renderedSegments.some(hasInlineSemanticSymbol);
  const fullText = renderedSegments.map(segment => segment.text).join('');
  // Keep legacy numbered-list tabs intact. Replacing them with ordinary
  // spaces loses the source's marker-to-heading advance, especially when the
  // marker and heading are separate rich runs. Browser tab stops now retain
  // the semantic separator while segment offsets and link ranges stay stable.
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
  renderedSegments.forEach(segment => {
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
      const pieceText = segment.text.slice(start, end);
      pieces.push({ segment, text: pieceText, href: matchingRange?.href });
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
      fontVariantCaps: mapPdfFont(piece.segment.font).variantCaps,
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
  if (line.listMarkerGlyphOverride && LIST_MARKER_GLYPHS.has(line.listMarkerGlyphOverride)) {
    return line.listMarkerGlyphOverride;
  }
  const visible = Array.from(sourceLineText(line).replace(/[\s\u00a0]+/gu, ''));
  return visible.length === 1 && LIST_MARKER_GLYPHS.has(visible[0]) ? visible[0] : null;
}

function numberedMarkerLineIndex(block: Block): number {
  const lines = block.lines ?? [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^[1-4]\.[\t ]*$/u.test(sourceLineText(lines[index]).trim())) continue;
    const nextTextLine = lines.slice(index + 1).find(candidate => sourceLineText(candidate).trim().length > 0);
    if (!nextTextLine) continue;
    const marker = lines[index];
    const markerBaseline = marker.spans.find(span => span.origin)?.origin?.[1] ?? marker.bbox[3];
    const bodyBaseline = nextTextLine.spans.find(span => span.origin)?.origin?.[1] ?? nextTextLine.bbox[3];
    const bodyStartsAfterMarker = nextTextLine.bbox[0] > marker.bbox[2];
    if (bodyStartsAfterMarker && Math.abs(markerBaseline - bodyBaseline) <= 1.5) return index;
  }
  return -1;
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

function spansContainEditableText(spans: SpanData[]): boolean {
  return spans.some(span => !span.renderOnlyStrokePass
    && !span.semanticSymbolId
    && !resolveLegacySymbol(span.font, span.text)
    && !span.font.includes('Dingbat')
    && (span.displayOverride ?? span.renderTextOverride ?? span.text).trim().length > 0);
}

function segmentsContainEditableText(segments?: Segment[]): boolean {
  return !!segments?.some(segment => !segment.symbolId
    && !resolveLegacySymbol(segment.font, segment.text)
    && !segment.font.includes('Dingbat')
    && segment.text.trim().length > 0);
}

function fieldContainsEditableText(block: Block, field: CreditFieldDefinition): boolean {
  const lineIds = new Set(field.lineIds);
  return (block.lines ?? []).some(line => lineIds.has(line.id) && spansContainEditableText(line.spans));
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
  const sourceListMarkerIndexes = [...listMarkerLineIndexes(block)].filter(index => fixedIndexes.has(index));
  const sourceListMarker = fixedIndexes.size === 1 && sourceListMarkerIndexes.length === 1
    ? listMarkerGlyph(block.lines[sourceListMarkerIndexes[0]])
    : null;
  let sourceListMarkerRemoved = false;
  let awaitingListBody = false;
  for (const segment of override.segments) {
    if (!remaining) {
      segments.push(segment);
      continue;
    }
    if (!segment.text) continue;
    if (awaitingListBody) {
      const body = segment.text.replace(/^[\s\u00a0]+/u, '');
      if (!body) continue;
      segments.push({ ...segment, text: body });
      awaitingListBody = false;
      remaining = '';
      continue;
    }
    if (remaining.startsWith(segment.text)) {
      remaining = remaining.slice(segment.text.length);
      continue;
    }
    if (segment.text.startsWith(remaining)) {
      segments.push({ ...segment, text: segment.text.slice(remaining.length) });
      remaining = '';
      continue;
    }
    // List marker lines are painted from the source PDF at their own hanging
    // indent. Older proposal data often repeats the same glyph with spaces
    // instead of the source tab; strip that duplicate marker while retaining
    // the translated body and its rich-span styling.
    if (!sourceListMarkerRemoved && sourceListMarker && segment.text.startsWith(sourceListMarker)) {
      const rest = segment.text.slice(sourceListMarker.length);
      const body = rest.replace(/^[\s\u00a0]+/u, '');
      sourceListMarkerRemoved = true;
      if (body) segments.push({ ...segment, text: body });
      else awaitingListBody = true;
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
  if (!markerGlyphs.length) return null;
  const representedSourceSymbols = new Set(override.segments.flatMap(segment => {
    const symbolId = segment.symbolId ?? resolveLegacySymbol(segment.font, segment.text)?.id;
    return symbolId ? [symbolId] : [];
  }));
  // A whole-list override can be split safely when every managed source symbol
  // is present in a rich segment. The symbol then stays with the item that
  // contains it; an intentionally removed/unrepresented symbol keeps the
  // legacy block intact because its original occurrence cannot be assigned.
  if ((override.managedSourceSymbols ?? []).some(symbolId => !representedSourceSymbols.has(symbolId))) return null;
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
  }), parent.layoutFrame ? layoutFrameRight(parent.layoutFrame) : parent.bbox[2]);
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
    layoutFrame: canonicalizeLayoutFrame({
      ...(parent.layoutFrame ?? {}),
      x,
      width: Math.max(1, right - x),
      total: Math.max(1, right - x),
      y,
      height: y + listFlowHeight,
      totalHeight: listFlowHeight,
    }),
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
    ...sourceListIndentValues(block.lines ?? [], block.listFlowItem),
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

const payloadOverridesCache = new Map<string, { data: Map<string, SpanOverride> | null; expiresAt: number }>();
const payloadOverridesRequests = new Map<string, Promise<Map<string, SpanOverride> | null>>();
const payloadOverridesRevisions = new Map<string, number>();
let payloadOverridesInvalidationSubscribed = false;

function subscribePayloadOverrideInvalidation(): void {
  if (payloadOverridesInvalidationSubscribed || typeof window === 'undefined') return;
  payloadOverridesInvalidationSubscribed = true;
  window.addEventListener(LOCAL_PERSISTENCE_CHANGED_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<{ language?: string }>).detail;
    if (!detail?.language) return;
    payloadOverridesRevisions.set(detail.language, (payloadOverridesRevisions.get(detail.language) ?? 0) + 1);
    payloadOverridesCache.delete(detail.language);
    payloadOverridesRequests.delete(detail.language);
  });
}

async function fetchOverridesFromPayload(lang: string): Promise<Map<string, SpanOverride> | null> {
  subscribePayloadOverrideInvalidation();
  const cached = payloadOverridesCache.get(lang);
  if (cached && cached.expiresAt > Date.now()) return cached.data ? new Map(cached.data) : null;
  if (cached) payloadOverridesCache.delete(lang);
  const existing = payloadOverridesRequests.get(lang);
  if (existing) return existing.then(data => data ? new Map(data) : null);

  const revision = payloadOverridesRevisions.get(lang) ?? 0;
  const request = (async () => {
    try {
      const res = await fetch(`${payloadApiUrl('translations')}?where[language][equals]=${lang}&limit=5000`);
      if (!res.ok) throw new Error(`Override request failed with HTTP ${res.status}`);
      const data = await res.json();
      const map = new Map<string, SpanOverride>();
      data.docs.forEach((doc: any) => {
        const decoded = decodeOverrideData(doc.data);
        if (!decoded) return;
        const uiSpanKey = clientSpanKey(doc.spanKey, lang);
        map.set(uiSpanKey, {
          spanKey: uiSpanKey,
          ...decoded,
          bbox: [0, 0, 0, 0],
        });
      });
      if ((payloadOverridesRevisions.get(lang) ?? 0) === revision) {
        payloadOverridesCache.set(lang, { data: map, expiresAt: Date.now() + 30_000 });
      }
      return map;
    } catch (err) {
      console.warn('Failed to fetch from payload:', err);
      if ((payloadOverridesRevisions.get(lang) ?? 0) === revision) {
        payloadOverridesCache.set(lang, { data: null, expiresAt: Date.now() + 3000 });
      }
      return null;
    }
  })().finally(() => {
    if (payloadOverridesRequests.get(lang) === request) payloadOverridesRequests.delete(lang);
  });
  payloadOverridesRequests.set(lang, request);
  return request.then(data => data ? new Map(data) : null);
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

export function extractCreditFieldInfo(
  spanKey: string,
  block: Block,
  fieldOrUnit: CreditFieldDefinition | TypographicUnitDefinition,
  unitKind?: TypographicUnitDefinition['kind'],
  unitLabel?: string,
): SelectedSpanInfo {
  const field: CreditFieldDefinition = 'field' in fieldOrUnit && fieldOrUnit.field ? fieldOrUnit.field : (fieldOrUnit as CreditFieldDefinition);
  const effectiveKind = unitKind ?? ('kind' in fieldOrUnit ? fieldOrUnit.kind : undefined);
  const effectiveLabel = unitLabel ?? ('label' in fieldOrUnit ? fieldOrUnit.label : undefined);
  const selectedIds = new Set(field.lineIds ?? []);
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
    editorLabel: effectiveLabel,
    text,
    font,
    family: mapPdfFont(font).family,
    weight,
    style,
    color,
    size,
    bbox: field.bbox ?? block.bbox,
    textAlign: field.frame?.textAlign || 'left',
    lineHeight: field.frame?.lineHeight ?? block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
    ...sourceListIndentValues(lines, block.listFlowItem),
    sourceSegments: effectiveKind === 'paragraph' ? normalizeParagraphSourceSegments(sourceSegments) : sourceSegments,
    editorContext: effectiveKind === 'paragraph'
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
  listMarkerIndentPt?: number;
  hangingIndentPt?: number;
  sourceSegments?: Segment[];
  singleLine?: boolean;
  editorContext?: InlineEditorContext;
}

interface PageRendererProps {
  pageData: PageData;
  overlayHost?: HTMLElement | null;
  isAdmin: boolean;
  showRuler?: boolean;
  layoutMode?: boolean;
  onLayoutDirtyChange?: (dirty: boolean) => void;
  zoomLevel?: number;
  continuousScroll?: boolean;
  focalZoomEnabled?: boolean;
  focalZoomAnchor?: { id: number; pageNumber: number; focal: DocumentFocalPoint; resetPan?: boolean; centerWhenFits?: boolean } | null;
  onFocalZoomApplied?: (id: number) => void;
  onNavigate?: (pageNum: number) => void;
  language?: 'en' | 'pt-BR';
  /** Show the untouched source PDF page for direct visual comparison. */
  showOriginalSource?: boolean;
  onToggleLanguage?: (language: 'en' | 'pt-BR') => void;
  symbolAliasPreferences?: SymbolAliasPreferences;
  onPaletteEditorChange?: (editorKey: string, state: AdminSymbolPaletteEditorState | null) => void;
  onTranslationDraftDirtyChange?: (dirty: boolean) => void;
  pendingEditableNavigation?: { id: number; direction: 'previous' | 'next'; targetPage: number } | null;
  onRequestEditablePageNavigation?: (direction: 'previous' | 'next', fromPage: number) => void;
  onResolveEditableNavigation?: (requestId: number, found: boolean) => void;
  totalPages?: number;
  editableNavigationEnabled?: boolean;
  editorPanelWidth?: number;
  faqOpen?: boolean;
  onEditorPanelWidthChange?: (width: number) => void;
  onEditorOpenChange?: (pageNumber: number, open: boolean) => void;
  experimentalOverrides?: ReadonlyMap<string, SpanOverride>;
  /** Session-only editor seeds for an isolated composition; never merged into persistence state. */
  experimentalEditorMode?: boolean;
  experimentalEditorOverrides?: ReadonlyMap<string, SpanOverride>;
  experimentalEditorSelectionKey?: string | null;
  experimentalDraftKey?: string | null;
  onExperimentalEditorSave?: (spanKey: string, override: SpanOverride | null) => void | boolean | Promise<boolean>;
  experimentalSaveStatus?: 'saved' | 'saving' | 'error';
  onExperimentalEditorDraftChange?: (spanKey: string, draft: SpanOverride | null) => void;
  onProposalReviewEditorClose?: () => void;
  proposalReviewSelectionKey?: string | null;
  proposalReviewHighlightKey?: string | null;
  proposalReviewOverrides?: ReadonlyMap<string, SpanOverride>;
  /** Persisted pending drafts are displayed only when no saved translation owns the unit. */
  persistedReviewDraftOverrides?: ReadonlyMap<string, SpanOverride>;
  /** Candidate-only geometry for pending drafts; never replaces a persisted human frame. */
  persistedReviewDraftLayoutFrames?: ReadonlyMap<string, LayoutFrame>;
  persistedReviewDraftKeys?: ReadonlyMap<string, string>;
  onOpenPersistedReviewDraft?: (reviewKey: string) => void;
  /** Viewer-only geometry from review proposals; persisted frames always take precedence. */
  proposalReviewLayoutFrames?: ReadonlyMap<string, LayoutFrame>;
  proposalReviewDiagnosticBlankKeys?: ReadonlySet<string>;
  /** Blank untranslated PT-BR editorial units for explicitly requested diagnostic exports. */
  strictPtBrDiagnostic?: boolean;
  experimentalFrames?: ReadonlyMap<string, LayoutFrame>;
  experimentalHangingIndentBlockKeys?: ReadonlySet<string>;
  readOnlyExperiment?: boolean;
  /** Diagnostic snapshots use only in-memory records and never load persistence. */
  isolatedSnapshot?: boolean;
  onExperimentalUnitSelect?: (spanKey: string | null) => void;
  editorHeaderAccessory?: React.ReactNode;
  glossaryDecisions?: TranslationGlossaryDecision[];
}

type EditableNavigationDirection = 'previous' | 'next';

function sourceLayoutFrame(block: Block): LayoutFrame {
  const firstLine = editableBlockLines(block)[0] ?? block.lines?.[0];
  const x = block.layoutFrame?.x ?? (firstLine as any)?.availableX ?? block.bbox[0];
  const total = block.layoutFrame
    ? layoutFrameTotal(block.layoutFrame)
    : (firstLine as any)?.availableWidth ?? Math.max(1, block.bbox[2] - block.bbox[0]);
  return canonicalizeLayoutFrame({
    x,
    y: block.bbox[1],
    width: total,
    height: block.bbox[3] - block.bbox[1],
    rotation: 0,
    textAlign: block.layoutFrame?.textAlign,
    lineHeight: block.defaultLineHeight ?? block.layoutFrame?.lineHeight,
  });
}

function typographicUnitFrameKey(pageNumber: number, unit: TypographicUnitDefinition): string {
  return `page_${pageNumber}_unit_${unit.id}`;
}

function sourceLayoutFrameForField(
  field: CreditFieldDefinition,
  block: Block,
  includeLeadingBulletsInFlow = false,
  preserveStoredRotation = false,
): LayoutFrame {
  const fieldLineIds = new Set(field.lineIds);
  const sourceLines = (block.lines ?? []).filter(line => fieldLineIds.has(line.id));
  const availableLines = sourceLines.filter(line => Number.isFinite(line.availableX)
    && Number.isFinite(line.availableWidth)
    && (line.availableWidth ?? 0) > 0);
  // Use the corridor shared by every source line in the unit. A union would
  // make a translated paragraph appear wider than its narrowest source line.
  const availableX = availableLines.length
    ? Math.max(...availableLines.map(line => line.availableX!))
    : undefined;
  const availableRight = availableLines.length
    ? Math.min(...availableLines.map(line => line.availableX! + line.availableWidth!))
    : undefined;
  const standaloneBulletLines = sourceLines.filter(isStandaloneSourceBulletLine);
  const bodyStartXs = sourceLines
    .filter(line => !standaloneBulletLines.includes(line))
    .flatMap(line => line.spans
      .filter(span => span.text.trim())
      .map(span => span.origin?.[0] ?? span.bbox[0]))
    .filter(Number.isFinite);
  const hangingIndentX = standaloneBulletLines.length > 0 && availableX !== undefined && bodyStartXs.length > 0
    ? Math.min(...bodyStartXs)
    : undefined;
  const frameX = includeLeadingBulletsInFlow
    ? availableX
    : hangingIndentX !== undefined && availableX !== undefined && hangingIndentX > availableX + 2
    ? hangingIndentX
    : availableX;
  const hasStoredFrame = field.frame !== undefined;
  const rotatedTranslationFrame = preserveStoredRotation && (field.frame?.rotation ?? 0) !== 0;
  const x = (includeLeadingBulletsInFlow && availableX !== undefined ? availableX : field.frame?.x)
      ?? frameX ?? (!hasStoredFrame ? block.layoutFrame?.x : undefined) ?? field.bbox[0];
  const total = (includeLeadingBulletsInFlow && availableX !== undefined && availableRight !== undefined && availableRight > availableX
      ? availableRight - availableX
      : field.frame ? layoutFrameTotal(field.frame) : undefined)
      ?? (frameX !== undefined && availableRight !== undefined && availableRight > frameX ? availableRight - frameX : undefined)
      ?? (!hasStoredFrame && block.layoutFrame ? layoutFrameTotal(block.layoutFrame) : undefined)
      ?? Math.max(1, field.bbox[2] - field.bbox[0]);
  return canonicalizeLayoutFrame({
    x,
    y: (rotatedTranslationFrame ? field.frame?.y : undefined) ?? field.bbox[1],
    width: total,
    height: Math.max(1, (rotatedTranslationFrame && field.frame ? layoutFrameTotalHeight(field.frame) : undefined) ?? (field.bbox[3] - field.bbox[1])),
    rotation: rotatedTranslationFrame ? field.frame?.rotation ?? 0 : 0,
    textAlign: field.frame?.textAlign ?? (!hasStoredFrame ? block.layoutFrame?.textAlign : undefined),
    lineHeight: field.frame?.lineHeight ?? (!hasStoredFrame
      ? block.defaultLineHeight ?? block.layoutFrame?.lineHeight
      : undefined),
    paragraphSpacingPt: field.frame?.paragraphSpacingPt ?? field.paragraphSpacingPt,
  });
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
    if (unit) return { frame: sourceLayoutFrameForField(unit.field, block), bbox: unit.field.bbox };
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
    'data-admin-geometry-width': layoutFrameTotal(frame),
    'data-admin-geometry-height': Math.max(1, layoutFrameTotalHeight(frame)),
    'data-admin-geometry-rotation': frame.rotation ?? 0,
  };
}

function frameUnitKey(pageNumber: number, block: Block, blockIndex: number): string {
  return block.editorKey ?? `page_${pageNumber}_block_${blockIndex}`;
}

export function renderSegmentContent(segment: Segment, scale: number, language: 'en' | 'pt-BR', geometryMode: 'translatedFlow' | 'inline' = 'inline'): React.ReactNode {
  const legacy = !segment.symbolId ? resolveLegacySymbol(segment.font,segment.text) : undefined;
  const id=segment.symbolId ?? legacy?.id;
  if (!id) return segment.text;
  return <>{Array.from(legacy ? '\uFFFC' : segment.text).map((_,index)=><SemanticSymbol key={index} id={id} language={language} size={segment.size*scale} color={segment.color} geometryMode={geometryMode} metrics={segment.symbolMetrics} />)}{legacy ? segment.text.match(/\s+$/)?.[0] : null}</>;
}

/** Compare visible content and rich styles while ignoring source-only line wraps. */
function sourceGeometrySignature(segments: Segment[], preserveWhitespaceMultiplicity = false): string {
  const signature: Array<{ text?: string; symbolId?: string; style: string | null }> = [];
  let pendingSpace = false;

  for (const segment of segments) {
    const symbolId = segment.symbolId ?? resolveLegacySymbol(segment.font, segment.text)?.id;
    const style = JSON.stringify({
      font: segment.font,
      size: Math.round(segment.size * 100) / 100,
      color: (segment.color || '#231f20').toLowerCase(),
      weight: segment.weight,
      style: segment.style,
      disableLigatures: segment.disableLigatures ?? false,
      textStrokeWidthPt: segment.textStrokeWidthPt ?? null,
      textStrokeColor: segment.textStrokeColor?.toLowerCase() ?? null,
    });

    if (symbolId) {
      if (pendingSpace && signature.length) signature.push({ text: ' ', style: null });
      pendingSpace = false;
      signature.push({ symbolId, style });
      continue;
    }

    for (const character of Array.from(segment.text)) {
      if (/\s/u.test(character)) {
        if (preserveWhitespaceMultiplicity) {
          signature.push({ text: character, style: null });
          continue;
        }
        if (signature.length) pendingSpace = true;
        continue;
      }
      if (pendingSpace) signature.push({ text: ' ', style: null });
      pendingSpace = false;
      signature.push({ text: character, style });
    }
  }

  return JSON.stringify(signature);
}

export function overrideIsSourceEquivalent(
  override: SpanOverride,
  sourceSegments: Segment[],
  sourceLayout: { textAlign: TextAlignment; lineHeight: number },
): boolean {
  // A hard break in a saved override is an editorial choice, not a source
  // extraction wrap, so keep that version on translated flow.
  if (override.segments.some(segment => /[\r\n]/u.test(segment.text))) return false;
  if (override.textAlign !== undefined && override.textAlign !== sourceLayout.textAlign) return false;
  if (override.lineHeight !== undefined && Math.abs(override.lineHeight - sourceLayout.lineHeight) > 0.0001) return false;
  // Extraction wraps are normalized to a single editorial space on the source
  // side. Once normalized, preserve whitespace multiplicity in the override so
  // a real extra/missing space cannot be mistaken for the source composition.
  return sourceGeometrySignature(override.segments, true)
    === sourceGeometrySignature(normalizeParagraphSourceSegments(sourceSegments), true);
}

function overridePreservesSourceLineContent(override: SpanOverride, sourceSegments: Segment[]): boolean {
  if (override.segments.some(segment => /[\r\n]/u.test(segment.text))) return false;
  return sourceGeometrySignature(override.segments, true)
    === sourceGeometrySignature(normalizeParagraphSourceSegments(sourceSegments), true);
}

function isEnglishRasterizedDuplicateLine(line: LineData): boolean {
  return !!line.rasterizedDuplicate
    && (!line.rasterizedDuplicateLanguage || line.rasterizedDuplicateLanguage === 'all'
      || line.rasterizedDuplicateLanguage === 'en');
}

function isEnglishSourceOverlayDuplicate(span: SpanData): boolean {
  return !span.semanticSymbolId && !!span.renderAsSourceOverlayDuplicate
    && (span.renderSourceOverlayLanguage === 'all' || span.renderSourceOverlayLanguage === 'en');
}

/** Exact source rendering is limited to horizontal source lines with measured run origins. */
function hasExactSourceGeometry(block: Block): boolean {
  const paintableSpans = (block.lines ?? [])
    .filter(line => !isEnglishRasterizedDuplicateLine(line))
    .flatMap(line => line.spans)
    .filter(span => !span.sourceEditorOnly && !span.renderOnlyStrokePass && !isEnglishSourceOverlayDuplicate(span)
      && !span.sourceCompoundHidden && !span.sourceCompoundSymbolId && !span.sourceInlineCoveredBy);
  const visibleSpans = paintableSpans.filter(span => !!span.semanticSymbolId || !!span.text.trim());
  if (!visibleSpans.length) return false;

  const allTextRunsHaveOrigins = paintableSpans.every(span => {
    // Inline text-range replacements use the normal flow renderer to keep the
    // source text advance and replacement object in one measured run.
    if (span.sourceInlineObjects?.length) return false;
    if (span.semanticSymbolId) return span.bbox.every(Number.isFinite);
    // Editorial newline/whitespace runs carry flow semantics, but paint no
    // glyph and therefore need no PDF text origin in the source SVG path.
    if (!span.text.trim()) return true;
    // Keep font-specific display substitutions on LineRenderer until their
    // alternate glyph mapping can be represented and measured in SVG too.
    if ((span.renderTextOverride ?? span.displayOverride ?? span.text) !== span.text) return false;
    const text = (span.renderTextOverride ?? span.displayOverride ?? span.text).replace(/[\r\n]+$/g, '');
    const multiBaselineText = /[\r\n]/.test(text);
    const hasValidGlyphRuns = Array.isArray(span.sourceGlyphRuns) && span.sourceGlyphRuns.length > 1
      && span.sourceGlyphRuns.every(run => run.start >= 0 && run.end <= text.length && run.end > run.start);
    return Array.isArray(span.origin) && span.origin.length === 2 && span.origin.every(Number.isFinite)
      && span.bbox.every(Number.isFinite) && !span.pictogramSvgPath
      && (!multiBaselineText || hasValidGlyphRuns);
  });
  if (!allTextRunsHaveOrigins) return false;

  return (block.lines ?? []).every(line => {
    if (isEnglishRasterizedDuplicateLine(line)) return true;
    const linePaintsText = line.spans.some(span => !span.renderOnlyStrokePass
      && !isEnglishSourceOverlayDuplicate(span) && !span.sourceCompoundHidden && !span.sourceCompoundSymbolId
      && !span.sourceInlineCoveredBy && !!span.text.trim());
    const linePaintsSymbol = line.spans.some(span => !span.renderOnlyStrokePass
      && !isEnglishSourceOverlayDuplicate(span) && !!span.semanticSymbolId);
    if (!linePaintsText && !linePaintsSymbol) return true;
    // SourceGeometryBlock paints horizontal SVG text. Rotated/vertical source
    // labels stay on their existing renderer path until it can represent their
    // baseline vectors without approximating their advances.
    return !!line.dir && Math.abs(line.dir[0] - 1) <= 0.0001 && Math.abs(line.dir[1]) <= 0.0001;
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
  const markerIndexes = listMarkerLineIndexes(block);
  return (
    <svg className="source-geometry-renderer" data-source-geometry="pdf-coordinates"
      width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none" aria-hidden="false"
      style={{ position: 'absolute', inset: 0, overflow: 'visible', display: 'block' }}>
      {lines.map((line, lineIndex) => {
        if (isEnglishRasterizedDuplicateLine(line)) return null;
        const baselines = line.spans.flatMap(span => span.origin ? [span.origin[1]] : []);
        return (
          <g key={line.id ?? lineIndex} data-source-line-id={line.id}
            data-source-line-x={line.bbox[0]}
            data-source-line-available-x={(line as any).availableX}
            data-source-line-available-width={(line as any).availableWidth}
            data-source-baseline-y={baselines[0]}
            data-list-marker-line={markerIndexes.has(lineIndex) ? line.id : undefined}>
            {line.spans.map((span, spanIndex) => {
              if (span.sourceEditorOnly) return null;
              if (span.renderOnlyStrokePass) return null;
              if (isEnglishSourceOverlayDuplicate(span)) return null;
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
                const sourceAppearanceRender = span.sourceSymbolMetrics?.sourceAppearanceKey
                  ? symbol.render.variants?.[span.sourceSymbolMetrics.sourceAppearanceKey]
                  : undefined;
                const sourceRender = resolveSymbolRenderForMetrics(symbol, span.sourceSymbolMetrics);
                const visual = sourceRender.localized?.en ?? sourceRender;
                const visualAssetUrl = 'assetUrl' in visual ? visual.assetUrl : undefined;
                const useAuditedSourceVector = sourceRender === sourceAppearanceRender
                  && !!sourceRender.paths && !!sourceRender.viewBox;
                const sourceAsset = useAuditedSourceVector ? undefined
                  : span.sourceSymbolMetrics?.sourceAssetUrl ?? visualAssetUrl ?? symbol.assetUrl;
                if (!sourceAsset && (!visual.paths || !visual.viewBox)) return null;
                const [x0, y0, x1, y1] = span.bbox;
                return (
                  <g key={`${line.id}:${spanIndex}`} data-source-inline-semantic={span.semanticSymbolId}>
                    <svg data-source-symbol-id={span.semanticSymbolId} data-symbol-id={span.semanticSymbolId}
                      data-source-x={x0} data-source-y={y0} data-source-bbox={span.bbox.join(',')}
                      x={x0 - blockOriginX} y={y0 - blockOriginY} width={x1 - x0} height={y1 - y0}
                      viewBox={sourceAsset ? `0 0 ${x1 - x0} ${y1 - y0}` : visual.viewBox!.join(' ')} preserveAspectRatio="none"
                      role="img" aria-label={symbol.labels.en} overflow="visible" style={{ color: span.color }}>
                      {sourceAsset
                        ? <image href={sourceAsset} width={x1 - x0} height={y1 - y0} preserveAspectRatio="none" />
                        : visual.paths!.map((path, pathIndex) => <path key={pathIndex} {...path} />)}
                    </svg>
                  </g>
                );
              }

              const origin = span.origin;
              if (!origin) return null;
              const text = (span.renderTextOverride ?? span.displayOverride ?? span.text).replace(/[\r\n]+$/g, '');
              const mapped = mapPdfFont(span.font);
              const isOutlinedImportantGlyph = span.font?.includes('Webdings') && span.text === '\uF07E';
              const sourceText = span.pictogramDisplayOverride ?? text;
              if (!sourceText) return null;
              const textLength = Math.max(0, span.sourceVisualWidthPt ?? (span.bbox[2] - span.bbox[0]));
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

export const PageRenderer: React.FC<PageRendererProps> = ({
  pageData, overlayHost = null, isAdmin, showRuler = false, layoutMode = false, onLayoutDirtyChange, zoomLevel = 1, continuousScroll = false,
  focalZoomEnabled = false, focalZoomAnchor = null, onFocalZoomApplied,
  onNavigate, language = 'en', showOriginalSource = false, onToggleLanguage, symbolAliasPreferences, onPaletteEditorChange,
  onTranslationDraftDirtyChange, pendingEditableNavigation, onRequestEditablePageNavigation,
  onResolveEditableNavigation, totalPages = 102, editableNavigationEnabled = true,
  editorPanelWidth = 420, faqOpen = false, onEditorPanelWidthChange, onEditorOpenChange,
  experimentalOverrides, experimentalEditorMode = false, experimentalEditorOverrides,
  experimentalEditorSelectionKey, experimentalDraftKey, onExperimentalEditorSave, experimentalSaveStatus,
  onExperimentalEditorDraftChange, onProposalReviewEditorClose, proposalReviewSelectionKey, proposalReviewHighlightKey,
  proposalReviewOverrides, persistedReviewDraftOverrides, persistedReviewDraftLayoutFrames, persistedReviewDraftKeys, onOpenPersistedReviewDraft,
  proposalReviewLayoutFrames, proposalReviewDiagnosticBlankKeys, strictPtBrDiagnostic, experimentalFrames, experimentalHangingIndentBlockKeys,
  readOnlyExperiment = false, isolatedSnapshot = false, onExperimentalUnitSelect, editorHeaderAccessory, glossaryDecisions,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const editorResizeDragRef = useRef<{ pointerId: number; width: number } | null>(null);
  const editorIsOpenRef = useRef(false);
  const updateScaleRef = useRef<() => void>(() => {});
  const [pageElement, setPageElement] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [focalPanOffset, setFocalPanOffset] = useState({ x: 0, y: 0 });
  const appliedFocalZoomIdRef = useRef<number | null>(null);
  const resetPanRequestIdRef = useRef<number | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<SelectedSpanInfo | null>(null);
  useEffect(() => {
    onExperimentalUnitSelect?.(selectedSpan?.spanKey ?? null);
  }, [onExperimentalUnitSelect, selectedSpan?.spanKey]);

  const [overrides, setOverrides] = useState<Map<string, SpanOverride>>(() => {
    if (isolatedSnapshot) return new Map();
    const local = loadLocalOverrides(language);
    const cached = payloadOverridesCache.get(language);
    if (cached && cached.expiresAt > Date.now() && cached.data) {
      cached.data.forEach((override, key) => local.set(key, override));
    }
    return local;
  });
  const [overridesLoadedLanguage, setOverridesLoadedLanguage] = useState<string | null>(() => {
    const cached = payloadOverridesCache.get(language);
    return isolatedSnapshot || (cached && cached.expiresAt > Date.now()) ? language : null;
  });
  const [payloadOverrides, setPayloadOverrides] = useState<Map<string, SpanOverride> | null>(null);
  const [payloadOverrideReadState, setPayloadOverrideReadState] = useState<'loading' | 'available' | 'unavailable'>('loading');
  const [overrideSyncStates, setOverrideSyncStates] = useState<Map<string, LocalSyncState | 'sync_error'>>(new Map());
  const [draftOverride, setDraftOverride] = useState<SpanOverride | null>(null);
  const [unitNavigationAvailability, setUnitNavigationAvailability] = useState({ previous: false, next: false });
  const pendingNavigationScrollKeyRef = useRef<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [layoutFrames, setLayoutFrames] = useState<Map<string, LayoutFrame>>(() => isolatedSnapshot ? new Map() : loadLocalLayoutFrames(pageData.page_number, language));
  const [inheritedLayoutFrames, setInheritedLayoutFrames] = useState<Map<string, LayoutFrame>>(() => !isolatedSnapshot && language === 'pt-BR' ? loadLocalLayoutFrames(pageData.page_number, 'en') : new Map());
  const [layoutUnitKey, setLayoutUnitKey] = useState<string | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<LayoutFrame | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<LayoutAlignmentGuide[]>([]);
  const overridesReady = overridesLoadedLanguage === language;

  const strictPtBrDiagnosticBlankKeys = useMemo(() => {
    if (!strictPtBrDiagnostic || language !== 'pt-BR' || !overridesReady) return new Set<string>();
    const missing = new Set<string>();
    const pageNumber = pageData.page_number;
    const sourceLines = new Map(pageData.blocks.flatMap(block => block.lines ?? []).map(line => [line.id, line] as const));
    const neutralContentsNumberLineIds = new Set((pageData.contentsRows ?? [])
      .map(row => row.numberLineId).filter((lineId): lineId is string => !!lineId));
    const sourceFolioLineIds = new Set(pageData.blocks.flatMap(block => (block.lines ?? [])
      .filter(line => {
        const text = line.spans.filter(span => !span.renderOnlyStrokePass).map(span => span.text).join('').trim();
        const [x, y, right] = line.bbox;
        return text === String(pageNumber) && y > pageData.height * 0.9
          && (x < pageData.width * 0.15 || right > pageData.width * 0.85);
      }).map(line => line.id)));
    const hasTextOnLines = (lineIds: string[]) => lineIds.some(lineId =>
      !neutralContentsNumberLineIds.has(lineId) && !sourceFolioLineIds.has(lineId)
      &&
      sourceLines.get(lineId)?.spans.some(span => span.text.trim().length > 0),
    );
    const hasTextOnSpanRefs = (spanRefs: string[]) => spanRefs.some(reference => {
      const separator = reference.lastIndexOf(':');
      const lineId = separator >= 0 ? reference.slice(0, separator) : reference;
      if (neutralContentsNumberLineIds.has(lineId) || sourceFolioLineIds.has(lineId)) return false;
      const line = sourceLines.get(lineId);
      if (!line) return false;
      const spanIndex = separator >= 0 ? Number(reference.slice(separator + 1)) : NaN;
      return Number.isInteger(spanIndex)
        ? Boolean(line.spans[spanIndex]?.text.trim())
        : line.spans.some(span => span.text.trim().length > 0);
    });

    pageData.blocks.forEach((block, blockIndex) => {
      if (block.hiddenFromPage || block.artworkOnly) return;
      // These source labels are printed inside component/diagram artwork.
      // They remain source-identical in PT-BR and are not missing prose.
      if ((block.sourceTextLanguageInvariant && hasExactSourceGeometry(block))
        || (pageNumber === 19 && ['block_39', 'block_43', 'block_47', 'block_51'].includes(block.id))) return;
      const blockKey = block.editorKey
        ? `${block.editorKey}__pt-BR`
        : `page_${pageNumber}_block_${blockIndex}`;
      // Page folios are language-neutral source labels, not untranslated prose.
      // Keep the original numeral visible in strict PT-BR diagnostics. Older
      // pages do not carry the folio audit tag, so use the exact displayed page
      // number plus its footer and outer-margin geometry as a narrow fallback.
      const sourceFolioAudit = (block.lines ?? []).some(line => line.spans.some(span =>
        span.sourcePaintAuditId?.includes('folio-outline'),
      ));
      const folioLines = (block.lines ?? []).map(line => line.spans
        .filter(span => !span.renderOnlyStrokePass)
        .map(span => span.text)
        .join('')
        .trim())
        .filter(Boolean);
      const blockBox = block.bbox;
      const neutralPageFolio = folioLines.length > 0
        && folioLines.every(text => text === String(pageNumber))
        && blockBox[1] > pageData.height * 0.9
        && (blockBox[0] < pageData.width * 0.15 || blockBox[2] > pageData.width * 0.85);
      if (!overrides.has(blockKey) && (sourceFolioAudit || neutralPageFolio)) return;
      // Credit bodies are people and contributor names, so preserve them in
      // their original spelling. The special-thanks body is prose and remains
      // a required translation unit; role labels are translatable as usual.
      if (pageNumber === 2 && block.creditUnits?.length) {
        for (const unit of block.creditUnits) {
          if (!hasTextOnLines(unit.label.lineIds)) continue;
          const key = `page_${pageNumber}_credit_${unit.id}_${unit.label.id}__pt-BR`;
          if (!overrides.has(key)) missing.add(key);
          if (unit.id === 'special-thanks' && hasTextOnLines(unit.body.lineIds)) {
            const bodyKey = `page_${pageNumber}_credit_${unit.id}_${unit.body.id}__pt-BR`;
            if (!overrides.has(bodyKey)) missing.add(bodyKey);
          }
        }
        return;
      }
      // This heading is the game's unchanged identifier for Tags.
      if (pageNumber === 3 && block.id === 'block_21') return;
      const rows = pageData.contentsRows?.filter(row => row.blockId === block.id) ?? [];
      if (rows.length && !contentsRowUsesLegacy(rows, 'pt-BR', key => overrides.has(key))) {
        for (const row of rows) {
          const key = contentsRowKey(row, 'pt-BR');
          if (!overrides.has(key)) missing.add(key);
        }
        return;
      }
      if (block.adminReadOnly) return;
      const hasBlockTranslation = overrides.has(blockKey);
      const credits = block.creditUnits ?? (block.creditUnit ? [block.creditUnit] : []);
      if (credits.length > 0 && !hasBlockTranslation) {
        for (const unit of credits) {
          for (const field of [unit.label]) {
            if (!hasTextOnLines(field.lineIds)) continue;
            const key = `page_${pageNumber}_credit_${unit.id}_${field.id}__pt-BR`;
            if (!overrides.has(key)) missing.add(key);
          }
        }
        return;
      }

      if (block.typographicUnits?.length && !hasBlockTranslation) {
        for (const unit of block.typographicUnits) {
          if (!hasTextOnLines(unit.field.lineIds)) continue;
          const key = `page_${pageNumber}_unit_${unit.id}__pt-BR`;
          if (!overrides.has(key) && !hasLegacyTypographicUnitOverride(
            block, unit, pageNumber, 'pt-BR', candidate => overrides.has(candidate),
          )) missing.add(key);
        }
      } else if (!block.typographicUnits?.length && block.typographicSpanUnits?.length && !hasBlockTranslation) {
        for (const unit of block.typographicSpanUnits) {
          if (!hasTextOnSpanRefs(unit.spanRefs)) continue;
          const key = `page_${pageNumber}_unit_${unit.id}__pt-BR`;
          if (!overrides.has(key)) missing.add(key);
        }
      } else if (!block.typographicUnits?.length && !block.typographicSpanUnits?.length
        && !hasBlockTranslation && (block.lines ?? []).some(line =>
          !neutralContentsNumberLineIds.has(line.id) && !sourceFolioLineIds.has(line.id)
          && line.spans.some(span => span.text.trim()))) {
        missing.add(blockKey);
      }

      // Inline editorial runs may coexist with a larger typographic unit.
      if (!hasBlockTranslation) {
        for (const unit of block.typographicSpanUnits ?? []) {
          if (!hasTextOnSpanRefs(unit.spanRefs)) continue;
          const coveredByTranslatedSemanticUnits = unit.spanRefs.every(reference => {
            const separator = reference.lastIndexOf(':');
            const lineId = separator >= 0 ? reference.slice(0, separator) : reference;
            const semanticUnit = block.typographicUnits?.find(candidate => candidate.field.lineIds.includes(lineId));
            if (!semanticUnit) return false;
            const semanticKey = `page_${pageNumber}_unit_${semanticUnit.id}__pt-BR`;
            return overrides.has(semanticKey) || hasLegacyTypographicUnitOverride(
              block, semanticUnit, pageNumber, 'pt-BR', key => overrides.has(key),
            );
          });
          if (coveredByTranslatedSemanticUnits) continue;
          const key = `page_${pageNumber}_unit_${unit.id}__pt-BR`;
          if (!overrides.has(key)) missing.add(key);
        }
      }
    });
    return missing;
  }, [strictPtBrDiagnostic, language, overridesReady, overrides, pageData]);
  const effectiveDiagnosticBlankKeys = useMemo(() => new Set([
    ...(proposalReviewDiagnosticBlankKeys ?? []),
    ...strictPtBrDiagnosticBlankKeys,
  ]), [proposalReviewDiagnosticBlankKeys, strictPtBrDiagnosticBlankKeys]);

  const renderOverrides = useMemo(() => {
    let next: Map<string, SpanOverride> | null = null;
    if (overridesReady && (persistedReviewDraftOverrides?.size || proposalReviewOverrides?.size)) {
      next = new Map(overrides);
      persistedReviewDraftOverrides?.forEach((override, key) => {
        const clientKey = clientSpanKey(key, language);
        const baseKey = key.replace(/__pt-BR$/u, '');
        // A real translation always wins over an unapproved review draft.
        if (next!.has(key) || next!.has(clientKey) || next!.has(baseKey)) return;
        next!.set(key, override);
        if (clientKey !== key) next!.set(clientKey, { ...override, spanKey: clientKey });
      });
      proposalReviewOverrides?.forEach((override, key) => {
        // Review previews are temporary and limited to the selected unit; let
        // that explicit preview show over the published text without saving it.
        next!.set(key, override);
        const clientKey = clientSpanKey(key, language);
        if (clientKey !== key) next!.set(clientKey, { ...override, spanKey: clientKey });
      });
    }
    if (readOnlyExperiment && experimentalOverrides?.size) {
      next ??= new Map(overrides);
      experimentalOverrides.forEach((override, key) => next!.set(key, override));
    }
    return next ?? overrides;
  }, [overrides, overridesReady, experimentalOverrides, readOnlyExperiment, proposalReviewOverrides, persistedReviewDraftOverrides, language]);
  const renderLayoutFrames = useMemo(() => {
    const next = new Map<string, LayoutFrame>();
    layoutFrames.forEach((frame, key) => next.set(key, canonicalizeLayoutFrame(frame)));
    // Candidate geometry fills only an otherwise unframed unit. Saved human
    // geometry remains authoritative for visible and selected review drafts.
    persistedReviewDraftLayoutFrames?.forEach((frame, key) => {
      if (!next.has(key)) next.set(key, canonicalizeLayoutFrame(frame));
    });
    proposalReviewLayoutFrames?.forEach((frame, key) => {
      if (!next.has(key)) next.set(key, canonicalizeLayoutFrame(frame));
    });
    if (!readOnlyExperiment || !experimentalFrames?.size) return next;
    experimentalFrames.forEach((frame, key) => next.set(key, canonicalizeLayoutFrame(frame)));
    return next;
  }, [layoutFrames, persistedReviewDraftLayoutFrames, proposalReviewLayoutFrames, experimentalFrames, readOnlyExperiment]);
  const adminCreatedFrames = useMemo(() => {
    const frames = new Map<string, LayoutFrame>();
    renderLayoutFrames.forEach((frame, key) => {
      if (frame.adminCreatedBlock) frames.set(key, frame);
    });
    if (layoutUnitKey && layoutDraft?.adminCreatedBlock) frames.set(layoutUnitKey, layoutDraft);
    return frames;
  }, [renderLayoutFrames, layoutUnitKey, layoutDraft]);
  const persistedReviewDraftFrameKeys = useMemo(() => {
    const keys = new Set<string>();
    persistedReviewDraftLayoutFrames?.forEach((_frame, key) => {
      // Only mark candidate geometry that actually filled an unowned frame.
      // Saved human geometry remains authoritative and keeps its normal marker behavior.
      if (!layoutFrames.has(key) && !experimentalFrames?.has(key)) keys.add(key);
    });
    return keys;
  }, [layoutFrames, persistedReviewDraftLayoutFrames, experimentalFrames]);

  const editorIsOpen = isAdmin && !!selectedSpan && (!readOnlyExperiment || experimentalEditorMode);
  editorIsOpenRef.current = editorIsOpen;
  useEffect(() => {
    onEditorOpenChange?.(pageData.page_number, editorIsOpen);
  }, [editorIsOpen, onEditorOpenChange, pageData.page_number]);
  useEffect(() => () => {
    if (editorIsOpenRef.current) onEditorOpenChange?.(pageData.page_number, false);
  }, [onEditorOpenChange, pageData.page_number]);

  const editorWidthLimits = () => {
    const workspace = workspaceRef.current;
    const workspaceWidth = workspace?.clientWidth ?? 900;
    const viewerWidth = workspace?.closest<HTMLElement>('.viewer-main')?.clientWidth ?? workspaceWidth;
    const overlayMode = viewerWidth <= 950;
    const min = overlayMode ? Math.min(280, Math.max(0, viewerWidth - 88)) : 280;
    const availableWidth = overlayMode ? viewerWidth - 88 : workspaceWidth - 480;
    const dualPanelLimit = faqOpen && overlayMode ? Math.min(320, viewerWidth * 0.36) : 560;
    const max = Math.max(min, Math.min(560, availableWidth, dualPanelLimit));
    return { min, max };
  };
  const resizeEditorTo = (clientX: number) => {
    const workspace = workspaceRef.current;
    const drag = editorResizeDragRef.current;
    if (!workspace || !drag) return;
    const { min, max } = editorWidthLimits();
    drag.width = Math.min(max, Math.max(min, workspace.getBoundingClientRect().right - clientX - 4));
    workspace.style.setProperty('--rich-editor-panel-width', `${drag.width}px`);
  };
  const handleEditorResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    editorResizeDragRef.current = { pointerId: event.pointerId, width: editorPanelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleEditorResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editorResizeDragRef.current?.pointerId !== event.pointerId) return;
    resizeEditorTo(event.clientX);
  };
  const handleEditorResizePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editorResizeDragRef.current?.pointerId !== event.pointerId) return;
    onEditorPanelWidthChange?.(editorResizeDragRef.current.width);
    editorResizeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleEditorResizePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editorResizeDragRef.current?.pointerId !== event.pointerId) return;
    const workspace = workspaceRef.current;
    if (workspace) workspace.style.setProperty('--rich-editor-panel-width', `${editorPanelWidth}px`);
    editorResizeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleEditorResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onEditorPanelWidthChange) return;
    const { min, max } = editorWidthLimits();
    const step = event.shiftKey ? 32 : 16;
    if (event.key === 'ArrowLeft') onEditorPanelWidthChange(Math.min(max, editorPanelWidth + step));
    else if (event.key === 'ArrowRight') onEditorPanelWidthChange(Math.max(min, editorPanelWidth - step));
    else if (event.key === 'Home') onEditorPanelWidthChange(min);
    else if (event.key === 'End') onEditorPanelWidthChange(max);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    if (isolatedSnapshot) {
      setOverrides(new Map());
      setPayloadOverrides(new Map());
      setPayloadOverrideReadState('available');
      setOverridesLoadedLanguage(language);
      return;
    }
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
  }, [language, isolatedSnapshot]);
  useEffect(() => {
    if (isolatedSnapshot) return;
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
  }, [language, selectedSpan?.spanKey, layoutUnitKey, pageData.page_number, isolatedSnapshot]);

  const replacedInlineElements = (pageData.inlineElements ?? []).filter(element=>{
    const block=pageData.blocks.find(b=>b.id===element.anchor.blockId);
    return block && sourceElementIsReplaced(element,block,pageData.page_number,language,renderOverrides,selectedSpan?.spanKey ?? null,draftOverride);
  });
  const coveredSourceSymbols = new Set(replacedInlineElements.filter(element=>element.coveredSourceText||element.coveredSourceTexts?.length)
    .map(element=>element.symbolId));

  const companionBlocks=useMemo(()=>{
    const controlled=new Map<string,string>();
    const overrideExists=(key:string)=>renderOverrides.has(key)||(selectedSpan?.spanKey===key&&draftOverride!==null);
    const foreignHasOverride=(ref:{blockIndex:number;blockId:string})=>{
      const b=pageData.blocks.find(b=>b.id===ref.blockId);
      return !!b&&overrideExists(b.editorKey?`${b.editorKey}__${language}`:`page_${pageData.page_number}_block_${ref.blockIndex}`);
    };
    for(const e of pageData.inlineElements??[]){
      const owner=pageData.blocks.find(b=>b.id===e.anchor.blockId);
      if(!owner||!sourceElementIsReplaced(e,owner,pageData.page_number,language,renderOverrides,selectedSpan?.spanKey??null,draftOverride,true))continue;
      for(const ref of e.sourceTextCompanions??[]){
        // Preserve an existing independently saved human fragment. Joining it
        // requires a separate decision, so its source proxy is also omitted.
        if(!foreignHasOverride(ref))controlled.set(`${ref.blockId}:${ref.lineId}:${ref.spanIndex}`,e.symbolId);
      }
    }
    return pageData.blocks.map(b=>({...b,lines:b.lines?.map(l=>({...l,spans:l.spans.flatMap((s,i)=>{
      if(s.sourceTextCompanionFrom&&foreignHasOverride(s.sourceTextCompanionFrom))return [];
      const owner=controlled.get(`${b.id}:${l.id}:${s.sourceSpanIndex??i}`);
      return [{...s,...(owner?{sourceInlineCoveredBy:owner}:{})}];
    })}))}));
  },[pageData.blocks,pageData.inlineElements,pageData.page_number,renderOverrides,selectedSpan?.spanKey,draftOverride,language]);

  useEffect(() => {
    if (!selectedSpan) return;
    const baseKey = selectedSpan.spanKey.replace(/__(?:pt-BR|en)$/u, '');
    for (const [blockIndex, block] of companionBlocks.entries()) {
      const currentBlockBase = block.editorKey ?? `page_${pageData.page_number}_block_${blockIndex}`;
      if (currentBlockBase === baseKey || block.editorKey === baseKey) {
        const newBlockKey = block.editorKey ? `${block.editorKey}__${language}` : `page_${pageData.page_number}_block_${blockIndex}`;
        if (newBlockKey !== selectedSpan.spanKey) {
          const updated = extractBlockInfo(newBlockKey, block);
          setSelectedSpan(prev => prev ? { ...prev, spanKey: newBlockKey, bbox: updated.bbox } : null);
        }
        return;
      }
      const typographicUnit = block.typographicUnits?.find(candidate => {
        const uBase = `page_${pageData.page_number}_unit_${candidate.id}`;
        return uBase === baseKey;
      });
      if (typographicUnit) {
        const newUnitKey = `page_${pageData.page_number}_unit_${typographicUnit.id}__${language}`;
        if (newUnitKey !== selectedSpan.spanKey) {
          const updated = extractCreditFieldInfo(
            newUnitKey,
            block,
            typographicUnit.field,
            typographicUnit.kind,
            typographicUnit.label,
          );
          setSelectedSpan(prev => prev ? { ...prev, spanKey: newUnitKey, bbox: updated.bbox } : null);
        }
        return;
      }
      const creditUnits = block.creditUnits ?? (block.creditUnit ? [block.creditUnit] : []);
      for (const cu of creditUnits) {
        if (`page_${pageData.page_number}_credit_${cu.id}_${cu.label.id}` === baseKey) {
          const newKey = `page_${pageData.page_number}_credit_${cu.id}_${cu.label.id}__${language}`;
          if (newKey !== selectedSpan.spanKey) {
            const updated = extractCreditFieldInfo(newKey, block, cu.label);
            setSelectedSpan(prev => prev ? { ...prev, spanKey: newKey, bbox: updated.bbox } : null);
          }
          return;
        }
        if (`page_${pageData.page_number}_credit_${cu.id}_${cu.body.id}` === baseKey) {
          const newKey = `page_${pageData.page_number}_credit_${cu.id}_${cu.body.id}__${language}`;
          if (newKey !== selectedSpan.spanKey) {
            const updated = extractCreditFieldInfo(newKey, block, cu.body);
            setSelectedSpan(prev => prev ? { ...prev, spanKey: newKey, bbox: updated.bbox } : null);
          }
          return;
        }
      }
      const spanUnit = block.typographicSpanUnits?.find(candidate => {
        const uBase = `page_${pageData.page_number}_unit_${candidate.id}`;
        return uBase === baseKey;
      });
      if (spanUnit) {
        const newUnitKey = `page_${pageData.page_number}_unit_${spanUnit.id}__${language}`;
        if (newUnitKey !== selectedSpan.spanKey) {
          const updated = extractInlineSpanUnitInfo(newUnitKey, block, spanUnit);
          setSelectedSpan(prev => prev ? { ...prev, spanKey: newUnitKey, bbox: updated.bbox } : null);
        }
        return;
      }
    }
  }, [language, companionBlocks, pageData.page_number]);

  useEffect(() => {
    if (isolatedSnapshot) {
      setLayoutFrames(new Map());
      setInheritedLayoutFrames(new Map());
      return;
    }
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
      remote?.forEach((frame, key) => merged.set(key, canonicalizeLayoutFrame(frame)));
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
  }, [pageData.page_number, language, onLayoutDirtyChange, isolatedSnapshot]);

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
    return canonicalizeLayoutFrame(renderLayoutFrames.get(unitKey)
      ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(unitKey) : undefined)
      ?? sourceFrame);
  }, [renderLayoutFrames, inheritedLayoutFrames, language]);

  const layoutSnapTargets = useMemo<SnapFrameRect[]>(() => pageData.blocks.flatMap((block, index) => {
    if (block.hiddenFromPage || block.adminReadOnly || block.creditUnits?.length || block.creditUnit) return [];
    if (block.typographicUnits?.length) {
      return block.typographicUnits.map(unit => {
        const key = typographicUnitFrameKey(pageData.page_number, unit);
        const sourceFrame = sourceLayoutFrameForField(unit.field, block);
        const frame = effectiveFrameFor(key, sourceFrame);
        return {
          key,
          label: unit.label || `Bloco ${index + 1} · ${unit.id}`,
          x: frame.x,
          y: frame.y ?? unit.field.bbox[1],
          width: layoutFrameTotal(frame),
          height: layoutFrameTotalHeight(frame) || Math.max(1, unit.field.bbox[3] - unit.field.bbox[1]),
          rotation: frame.rotation,
        };
      });
    }
    if (fixedEditorLineIndexes(block).size) return [];
    const key = frameUnitKey(pageData.page_number, block, index);
    const frame = effectiveFrameFor(key, sourceLayoutFrame(block));
    if (frame.hidden) return [];
    return [{
      key,
      label: `Bloco ${index + 1}`,
      x: frame.x,
      y: frame.y ?? block.bbox[1],
      width: layoutFrameTotal(frame),
      height: layoutFrameTotalHeight(frame) || Math.max(1, block.bbox[3] - block.bbox[1]),
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
    setLayoutDraft(canonicalizeLayoutFrame(saved));
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(language === 'pt-BR' && !layoutFrames.has(unitKey) ? 'PT-BR herda a moldura EN até ser personalizada.' : null);
  }, [layoutDirty, layoutUnitKey, pageData, layoutFrames, inheritedLayoutFrames, language, onLayoutDirtyChange]);

  const changeLayoutDraft = useCallback((frame: LayoutFrame) => {
    setLayoutDraft(canonicalizeLayoutFrame(frame));
    setLayoutDirty(true);
    onLayoutDirtyChange?.(true);
    setLayoutStatus(null);
  }, [onLayoutDirtyChange]);

  const createAdminBlock = useCallback(() => {
    if (isolatedSnapshot || language !== 'pt-BR' || layoutDirty || isSavingLayout) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const unitKey = `page_${pageData.page_number}_unit_admin-block-${id}`;
    const x = 32;
    const total = Math.min(240, Math.max(80, pageData.width - 64));
    const y = Math.max(16, Math.min(pageData.height - 96, pageData.height * 0.48));
    const totalHeight = 72;
    const frame: LayoutFrame = {
      x,
      y,
      width: x + total,
      total,
      height: y + totalHeight,
      totalHeight,
      textAlign: 'left',
      lineHeight: 1,
      adminCreatedBlock: true,
    };
    setLayoutUnitKey(unitKey);
    setLayoutDraft(frame);
    setLayoutDirty(true);
    onLayoutDirtyChange?.(true);
    setLayoutStatus('Novo bloco PT-BR criado. Ajuste a moldura e salve para persistir no Payload.');
  }, [isolatedSnapshot, language, layoutDirty, isSavingLayout, pageData.page_number, pageData.width, pageData.height, onLayoutDirtyChange]);

  const discardLayoutDraft = useCallback(() => {
    if (!layoutUnitKey) return;
    const source = findLayoutFrameSource(pageData, layoutUnitKey);
    const saved = layoutFrames.get(layoutUnitKey)
      ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(layoutUnitKey) : undefined)
      ?? source?.frame
      ?? null;
    setLayoutDraft(saved ? canonicalizeLayoutFrame(saved) : null);
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus('Alterações descartadas.');
  }, [layoutUnitKey, pageData, layoutFrames, inheritedLayoutFrames, language, onLayoutDirtyChange]);

  const saveLayoutDraft = useCallback(async () => {
    if (isolatedSnapshot) return;
    if (!layoutUnitKey || !layoutDraft || !layoutDirty || isSavingLayout) return;
    setIsSavingLayout(true);
    const next = new Map(layoutFrames);
    const canonicalDraft = canonicalizeLayoutFrame(layoutDraft);
    next.set(layoutUnitKey, canonicalDraft);
    const savedLocally = saveLocalLayoutFrame(pageData.page_number, language, layoutUnitKey, canonicalDraft);
    if (!savedLocally) {
      setLayoutStatus('Falha ao gravar localmente; o Payload não será alterado. O rascunho continua aberto.');
      setIsSavingLayout(false);
      return;
    }
    setLayoutFrames(next);
    setLayoutStatus(savedLocally
      ? 'SALVO LOCALMENTE / SINCRONIZAÇÃO PENDENTE.'
      : 'Falha ao gravar localmente; o Payload não será alterado.');
    const savedRemotely = savedLocally
      ? await saveLayoutFrame({ unitKey: layoutUnitKey, pageNumber: pageData.page_number, language, frame: canonicalDraft })
      : false;
    if (savedLocally) dispatchLocalPersistenceChanged({
      kind: 'frame', language, unitKey: layoutUnitKey, pageNumber: pageData.page_number,
      data: canonicalDraft, confirmed: savedRemotely,
    });
    else dispatchLocalPersistenceChanged();
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(savedRemotely ? 'SALVO / PAYLOAD CONFIRMADO.' : savedLocally
      ? 'ERRO DE SINCRONIZAÇÃO — moldura preservada localmente; Payload não confirmou.'
      : 'ERRO — gravação local falhou; Payload permaneceu sem alteração.');
    setIsSavingLayout(false);
  }, [isolatedSnapshot, layoutUnitKey, layoutDraft, layoutDirty, isSavingLayout, layoutFrames, pageData.page_number, language, onLayoutDirtyChange]);

  const resetLayoutToEnglish = useCallback(async () => {
    if (isolatedSnapshot) return;
    if (!layoutUnitKey || language !== 'pt-BR' || !layoutFrames.has(layoutUnitKey) || isSavingLayout) return;
    if (!window.confirm('Remover a moldura PT-BR e voltar a herdar a configuração inglesa?')) return;
    setIsSavingLayout(true);
    const next = new Map(layoutFrames);
    next.delete(layoutUnitKey);
    const removedLocally = removeLocalLayoutFrame(pageData.page_number, language, layoutUnitKey);
    if (!removedLocally) {
      setLayoutStatus('Falha ao remover localmente; o Payload não será alterado. A moldura continua selecionada.');
      setIsSavingLayout(false);
      return;
    }
    setLayoutFrames(next);
    const removedRemotely = await deleteLayoutFrame(layoutUnitKey, language);
    dispatchLocalPersistenceChanged();
    const inherited = inheritedLayoutFrames.get(layoutUnitKey)
      ?? findLayoutFrameSource(pageData, layoutUnitKey)?.frame
      ?? null;
    setLayoutDraft(inherited ? canonicalizeLayoutFrame(inherited) : null);
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(removedRemotely ? 'PAYLOAD CONFIRMADO — moldura PT-BR removida; herdando EN.' : removedLocally
      ? 'ERRO DE SINCRONIZAÇÃO — Payload ainda não confirmou a remoção.'
      : 'ERRO — remoção local falhou; Payload permaneceu sem alteração.');
    setIsSavingLayout(false);
  }, [isolatedSnapshot, layoutUnitKey, language, layoutFrames, isSavingLayout, pageData, inheritedLayoutFrames, onLayoutDirtyChange]);

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

  useLayoutEffect(() => {
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

    updateScaleRef.current = updateScale;
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
    };
  }, [focalZoomEnabled, pageData, zoomLevel, selectedSpan]);

  useEffect(() => {
    if (!focalZoomEnabled || typeof ResizeObserver === 'undefined') return;
    const stage = containerRef.current;
    if (!stage) return;
    const resizeObserver = new ResizeObserver(() => updateScaleRef.current());
    resizeObserver.observe(stage);
    return () => resizeObserver.disconnect();
  }, [focalZoomEnabled]);

  useLayoutEffect(() => {
    if (!focalZoomAnchor) return;
    if (appliedFocalZoomIdRef.current === focalZoomAnchor.id) return;
    if (focalZoomAnchor.pageNumber !== pageData.page_number) {
      appliedFocalZoomIdRef.current = focalZoomAnchor.id;
      onFocalZoomApplied?.(focalZoomAnchor.id);
      return;
    }

    if (focalZoomAnchor.resetPan && resetPanRequestIdRef.current !== focalZoomAnchor.id
      && (focalPanOffset.x !== 0 || focalPanOffset.y !== 0)) {
      resetPanRequestIdRef.current = focalZoomAnchor.id;
      setFocalPanOffset({ x: 0, y: 0 });
      return;
    }

    const stage = containerRef.current;
    const page = pageElement;
    if (!stage || !page) return;

    const stageRect = stage.getBoundingClientRect();
    const availableWidth = Math.max(1, stageRect.width - 48);
    const availableHeight = Math.max(1, stageRect.height - 48);
    const expectedScale = Math.min(availableWidth / pageData.width, availableHeight / pageData.height) * zoomLevel;
    if (Math.abs(scale - expectedScale) >= 0.0001) return;

    const pageRect = page.getBoundingClientRect();
    const focal = focalZoomAnchor.resetPan
      ? { pageX: pageData.width / 2, pageY: pageData.height / 2, viewportX: stage.clientWidth / 2, viewportY: stage.clientHeight / 2 }
      : focalZoomAnchor.focal;
    const offsets = focalScrollOffsets({
      viewport: {
        left: stageRect.left,
        top: stageRect.top,
        clientLeft: stage.clientLeft,
        clientTop: stage.clientTop,
        clientWidth: stage.clientWidth,
        clientHeight: stage.clientHeight,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
        scrollWidth: stage.scrollWidth,
        scrollHeight: stage.scrollHeight,
      },
      page: { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
      focal,
      pageWidth: pageData.width,
      pageHeight: pageData.height,
      centerAxesWhenFit: focalZoomAnchor.centerWhenFits,
    });
    stage.scrollLeft = offsets.scrollLeft;
    stage.scrollTop = offsets.scrollTop;
    // A page that still fits the viewport cannot use scrollLeft/scrollTop for
    // part of the focal correction. Shift only the page canvas for that
    // residual; all document-space child coordinates and geometry stay intact.
    const panDeltaX = offsets.scrollLeft - offsets.requestedScrollLeft;
    const panDeltaY = offsets.scrollTop - offsets.requestedScrollTop;
    if (Math.abs(panDeltaX) > 0.5 || Math.abs(panDeltaY) > 0.5) {
      setFocalPanOffset(current => ({ x: current.x + panDeltaX, y: current.y + panDeltaY }));
    }
    appliedFocalZoomIdRef.current = focalZoomAnchor.id;
    onFocalZoomApplied?.(focalZoomAnchor.id);
  }, [focalPanOffset, focalZoomAnchor, onFocalZoomApplied, pageData, pageElement, scale, zoomLevel]);

  const confirmDiscardTranslationDraft = useCallback(() => {
    const experimentalDraftIsActive = experimentalEditorMode
      && !!selectedSpan
      && experimentalDraftKey === selectedSpan.spanKey;
    if (!draftOverride && !experimentalDraftIsActive) return true;
    const confirmed = window.confirm(language === 'pt-BR'
      ? 'Há alterações de tradução não salvas. Quer descartá-las e continuar?'
      : 'There are unsaved text changes. Discard them and continue?');
    if (confirmed) {
      setDraftOverride(null);
      if (experimentalDraftIsActive && selectedSpan) onExperimentalEditorDraftChange?.(selectedSpan.spanKey, null);
      else onTranslationDraftDirtyChange?.(false);
    }
    return confirmed;
  }, [draftOverride, experimentalEditorMode, experimentalDraftKey, selectedSpan, language, onTranslationDraftDirtyChange, onExperimentalEditorDraftChange]);

  const handleSpanClick = useCallback((info: SelectedSpanInfo) => {
    if (!isAdmin) return;
    if (!experimentalEditorMode && language === 'pt-BR' && persistedReviewDraftKeys?.size) {
      const draftReviewKey = persistedReviewDraftKeys.get(info.spanKey)
        ?? persistedReviewDraftKeys.get(clientSpanKey(info.spanKey, language));
      if (draftReviewKey) {
        onOpenPersistedReviewDraft?.(draftReviewKey);
        return;
      }
    }
    if (proposalReviewSelectionKey) {
      const targetNormalized = clientSpanKey(proposalReviewSelectionKey, language);
      const clickedNormalized = clientSpanKey(info.spanKey, language);
      const isTargetMatch = info.spanKey === proposalReviewSelectionKey
        || clickedNormalized === targetNormalized
        || info.spanKey === targetNormalized
        || clickedNormalized === proposalReviewSelectionKey;
      if (!isTargetMatch) {
        if (selectedSpan) return;
        onProposalReviewEditorClose?.();
      }
    }
    if (selectedSpan?.spanKey === info.spanKey) return;
    if (!confirmDiscardTranslationDraft()) return;
    setSelectedSpan(info);
    setDraftOverride(null);
    onTranslationDraftDirtyChange?.(false);
  }, [isAdmin, experimentalEditorMode, persistedReviewDraftKeys, onOpenPersistedReviewDraft, proposalReviewSelectionKey, selectedSpan, confirmDiscardTranslationDraft, onTranslationDraftDirtyChange, language, onProposalReviewEditorClose]);

  useEffect(() => {
    if (!experimentalEditorMode || !isAdmin || !experimentalEditorSelectionKey) return;
    const targetNormalized = clientSpanKey(experimentalEditorSelectionKey, language);
    const matchesTarget = (key: string) =>
      key === experimentalEditorSelectionKey || key === targetNormalized || clientSpanKey(key, language) === targetNormalized;

    for (const [blockIndex, block] of companionBlocks.entries()) {
      const blockKey = block.editorKey ? `${block.editorKey}__${language}` : `page_${pageData.page_number}_block_${blockIndex}`;
      if (matchesTarget(blockKey)) {
        handleSpanClick(extractBlockInfo(blockKey, block));
        return;
      }
      const typographicUnit = block.typographicUnits?.find(candidate => {
        const uKey = `page_${pageData.page_number}_unit_${candidate.id}__${language}`;
        return matchesTarget(uKey);
      });
      if (typographicUnit) {
        const unitKey = `page_${pageData.page_number}_unit_${typographicUnit.id}__${language}`;
        handleSpanClick(extractCreditFieldInfo(
          unitKey,
          block,
          typographicUnit.field,
          typographicUnit.kind,
          typographicUnit.label,
        ));
        return;
      }
      const unit = block.typographicSpanUnits?.find(candidate => {
        const uKey = `page_${pageData.page_number}_unit_${candidate.id}__${language}`;
        return matchesTarget(uKey);
      });
      if (!unit) continue;
      const unitKey = `page_${pageData.page_number}_unit_${unit.id}__${language}`;
      handleSpanClick(extractInlineSpanUnitInfo(unitKey, block, unit));
      return;
    }
    const target = (Array.from(pageElement?.querySelectorAll('[data-editable-unit-key]') ?? []) as HTMLElement[])
      .find(element => {
        const k = element.dataset.editableUnitKey;
        return k ? matchesTarget(k) : false;
      });
    target?.click();
  }, [experimentalEditorMode, isAdmin, experimentalEditorSelectionKey, companionBlocks, pageData.page_number, language, handleSpanClick, pageElement]);

  const navigateEditableUnit = useCallback((direction: EditableNavigationDirection) => {
    if (!isAdmin || layoutMode || isSaving || !pageElement) return;
    const targets = getEditableNavigationTargets(pageElement);
    const index = getEditableNavigationIndex(targets, selectedSpan?.spanKey ?? null);
    const target = direction === 'next' ? targets[index + 1] : targets[index - 1];
    if (target) {
      const key = target.dataset.editableUnitKey;
      if (key) {
        pendingNavigationScrollKeyRef.current = key;
        target.click();
      }
      return;
    }
    const canCrossPage = direction === 'next'
      ? pageData.page_number < totalPages
      : pageData.page_number > 1;
    if (!canCrossPage || !onRequestEditablePageNavigation || !confirmDiscardTranslationDraft()) return;
    // In continuous-scroll mode this PageRenderer stays mounted after moving
    // pages. Close its editor so the pending target becomes the sole active
    // selection when the next page resolves it.
    setSelectedSpan(null);
    onRequestEditablePageNavigation(direction, pageData.page_number);
  }, [isAdmin, layoutMode, isSaving, pageElement, selectedSpan?.spanKey, pageData.page_number,
    totalPages, onRequestEditablePageNavigation, confirmDiscardTranslationDraft]);

  useEffect(() => {
    if (!editableNavigationEnabled || !isAdmin || layoutMode || !pageElement || !selectedSpan || !overridesReady) {
      setUnitNavigationAvailability({ previous: false, next: false });
      return;
    }
    const targets = getEditableNavigationTargets(pageElement);
    const index = getEditableNavigationIndex(targets, selectedSpan.spanKey);
    setUnitNavigationAvailability({
      previous: index > 0 || pageData.page_number > 1,
      next: (index >= 0 && index < targets.length - 1) || pageData.page_number < totalPages,
    });
  }, [editableNavigationEnabled, isAdmin, layoutMode, pageElement, selectedSpan?.spanKey, overridesReady, pageData.page_number, totalPages]);

  useEffect(() => {
    const request = pendingEditableNavigation;
    if (!request || request.targetPage !== pageData.page_number || !editableNavigationEnabled || !isAdmin || layoutMode || !pageElement || !overridesReady) return;
    const targets = getEditableNavigationTargets(pageElement);
    const target = request.direction === 'next' ? targets[0] : targets.at(-1);
    if (!target) {
      onResolveEditableNavigation?.(request.id, false);
      return;
    }
    const key = target.dataset.editableUnitKey;
    if (!key) {
      onResolveEditableNavigation?.(request.id, false);
      return;
    }
    pendingNavigationScrollKeyRef.current = key;
    target.click();
    onResolveEditableNavigation?.(request.id, true);
  }, [pendingEditableNavigation?.id, pendingEditableNavigation?.direction, editableNavigationEnabled, isAdmin, layoutMode,
    pendingEditableNavigation?.targetPage, pageData.page_number, pageElement, overridesReady, onResolveEditableNavigation]);

  useEffect(() => {
    const key = pendingNavigationScrollKeyRef.current;
    if (!key || selectedSpan?.spanKey !== key || !pageElement) return;
    pendingNavigationScrollKeyRef.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = getEditableNavigationTargets(pageElement)
        .find(element => element.dataset.editableUnitKey === key);
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }));
  }, [selectedSpan?.spanKey, pageElement]);

  useEffect(() => {
    if (!editableNavigationEnabled || !isAdmin || layoutMode) return;
    const handleNavigationShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
      event.preventDefault();
      navigateEditableUnit(event.key === 'ArrowUp' ? 'previous' : 'next');
    };
    window.addEventListener('keydown', handleNavigationShortcut);
    return () => window.removeEventListener('keydown', handleNavigationShortcut);
  }, [editableNavigationEnabled, isAdmin, layoutMode, navigateEditableUnit]);

  const handleDraftChange = useCallback((draft: SpanOverride | null) => {
    if (experimentalEditorMode && selectedSpan) {
      onExperimentalEditorDraftChange?.(selectedSpan.spanKey, draft);
      return;
    }
    setDraftOverride(draft);
    onTranslationDraftDirtyChange?.(draft !== null);
  }, [experimentalEditorMode, selectedSpan, onExperimentalEditorDraftChange, onTranslationDraftDirtyChange]);

  const handleSaveOverride = useCallback(async (override: SpanOverride | null) => {
    if (isolatedSnapshot) return;
    if ((!override && !selectedSpan) || isSaving) return;
    
    setIsSaving(true);
    // Optimistic update
    const nextMap = new Map(overrides);
    if (override) {
      nextMap.set(override.spanKey, override);
    } else if (selectedSpan) {
      nextMap.delete(selectedSpan.spanKey);
    }
    const localRemoval = selectedSpan
      ? removeLocalOverrideEntry(language, selectedSpan.spanKey, overrides.get(selectedSpan.spanKey))
      : 'missing';
    const savedLocally = override
      ? saveLocalOverrideEntry(language, override)
      : localRemoval === 'removed' || localRemoval === 'missing';
    if (savedLocally) setOverrides(nextMap);

    if (override) {
      const syncKey = overrideSyncKey(language, override.spanKey);
      setOverrideSyncStates(current => new Map(current).set(syncKey, savedLocally ? 'missing_remote' : 'sync_error'));
      const result = savedLocally ? await persistOverrideToPayload(override, language) : 'failed';
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
            : 'ERRO — gravação local falhou; Payload permaneceu sem alteração.',
          type: 'error',
        });
        setTimeout(() => setToast(null), 5000);
      } else {
        setOverrideSyncStates(current => new Map(current).set(syncKey, 'confirmed'));
        setToast({ message: 'SALVO / PAYLOAD CONFIRMADO', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      }
    } else if (selectedSpan) {
      const deletedOnServer = savedLocally ? await deleteOverrideFromPayload(selectedSpan.spanKey, language) : false;
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
          : !savedLocally
            ? 'ERRO — remoção local falhou; Payload permaneceu sem alteração.'
          : savedLocally
            ? 'ERRO DE SINCRONIZAÇÃO — remoção local aplicada; o override ainda pode existir no Payload.'
            : 'ERRO DE SINCRONIZAÇÃO — falha ao remover o override.',
        type: deletedOnServer ? 'success' : 'error',
      });
      setTimeout(() => setToast(null), 5000);
    }

    setIsSaving(false);
    if (!savedLocally) return;
    setSelectedSpan(null);
    setDraftOverride(null);
    onTranslationDraftDirtyChange?.(false);
  }, [language, selectedSpan, overrides, isSaving, onTranslationDraftDirtyChange, isolatedSnapshot]);

  const handleCloseEditor = useCallback(() => {
    if (experimentalEditorMode && selectedSpan) onExperimentalEditorDraftChange?.(selectedSpan.spanKey, null);
    if (proposalReviewSelectionKey) onProposalReviewEditorClose?.();
    setSelectedSpan(null);
    setDraftOverride(null);
    if (!experimentalEditorMode) onTranslationDraftDirtyChange?.(false);
  }, [experimentalEditorMode, selectedSpan, onExperimentalEditorDraftChange, onTranslationDraftDirtyChange, proposalReviewSelectionKey, onProposalReviewEditorClose]);

  const handleSaveExperimentalOverride = useCallback((override: SpanOverride | null) => {
    if (!selectedSpan || !experimentalEditorMode) return;
    const closeAfterSave = () => {
      if (proposalReviewSelectionKey) onProposalReviewEditorClose?.();
      setSelectedSpan(null);
      setDraftOverride(null);
    };
    const result = onExperimentalEditorSave?.(selectedSpan.spanKey, override);
    if (result && typeof (result as Promise<boolean>).then === 'function') {
      void Promise.resolve(result).then(confirmed => {
        if (confirmed !== false) closeAfterSave();
      }).catch(() => undefined);
      return;
    }
    if (result !== false) closeAfterSave();
  }, [selectedSpan, experimentalEditorMode, onExperimentalEditorSave, proposalReviewSelectionKey, onProposalReviewEditorClose]);

  const containerStyle: React.CSSProperties = {
    width: `${pageData.width * scale}px`,
    height: `${pageData.height * scale}px`,
    margin: 'auto',
    transform: focalPanOffset.x || focalPanOffset.y
      ? `translate(${focalPanOffset.x}px, ${focalPanOffset.y}px)`
      : undefined,
    flexShrink: 0,
  };

  if (showOriginalSource) {
    return (
      <div
        ref={workspaceRef}
        className={`page-renderer ${continuousScroll ? 'continuous-scroll-page' : ''}`}
        style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'stretch', overflow: continuousScroll ? 'visible' : 'hidden' }}
      >
        <div ref={containerRef} className={`page-stage ${continuousScroll ? 'continuous-scroll-page-stage' : ''}`}>
          <div
            ref={setPageElement}
            className="page-container"
            style={containerStyle}
            data-pdf-page-number={pageData.page_number}
            data-pdf-page-width={pageData.width}
            data-pdf-page-height={pageData.height}
            data-original-source-page="true"
          >
            <img
              src={payloadApiUrl(`source-page?page=${pageData.page_number}`)}
              alt={`Original PDF, page ${pageData.page_number}`}
              draggable={false}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', userSelect: 'none' }}
            />
          </div>
        </div>
      </div>
    );
  }

  const selectedSourceBlock = selectedSpan
    ? pageData.blocks.find((block, index) => {
        const blockKey = block.editorKey
          ? `${block.editorKey}__${language}`
          : `page_${pageData.page_number}_block_${index}`;
        return blockKey === selectedSpan.spanKey;
      })
    : undefined;
  const selectedUnitParentInfo = (() => {
    const unitPrefix = `page_${pageData.page_number}_unit_`;
    if (!selectedSpan?.spanKey.startsWith(unitPrefix)) return null;
    const unitId = selectedSpan.spanKey.slice(unitPrefix.length).replace(/__(?:pt-BR|en)$/u, '');
    const blockIndex = pageData.blocks.findIndex(block =>
      block.typographicSpanUnits?.some(unit => unit.id === unitId)
      || block.typographicUnits?.some(unit => unit.id === unitId),
    );
    if (blockIndex < 0) return null;
    const block = pageData.blocks[blockIndex];
    if (block.adminReadOnly) return null;
    const blockKey = block.editorKey ?? `page_${pageData.page_number}_block_${blockIndex}`;
    return extractBlockInfo(blockKey, block);
  })();
  const selectedExistingOverride = selectedSpan
    ? experimentalEditorMode
      ? experimentalEditorOverrides?.get(selectedSpan.spanKey) ?? null
      : selectedSourceBlock
        ? normalizeStaticEditorPrefix(selectedSourceBlock, overrides.get(selectedSpan.spanKey) || null)
        : overrides.get(selectedSpan.spanKey) || null
    : null;

  const selectedOverridePersistenceState = selectedSpan && !isolatedSnapshot
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
  const selectedLayoutGeometry = isAdmin && layoutMode && layoutUnitKey && selectedLayoutFrame ? {
    key: layoutUnitKey,
    x: selectedLayoutFrame.x,
    y: selectedLayoutFrame.y ?? 0,
    width: layoutFrameTotal(selectedLayoutFrame),
    height: Math.max(1, layoutFrameTotalHeight(selectedLayoutFrame)),
    rotation: selectedLayoutFrame.rotation ?? 0,
  } : null;

  return (
    <div
      ref={workspaceRef}
      className={`page-renderer ${continuousScroll ? 'continuous-scroll-page' : ''} ${editorIsOpen ? 'editor-open' : ''} ${faqOpen ? 'faq-open' : ''}`}
      data-experiment-mode={readOnlyExperiment ? 'page14-preview-only' : undefined}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'stretch',
        overflow: continuousScroll ? 'visible' : 'hidden',
        '--rich-editor-panel-width': `${editorPanelWidth}px`,
      } as React.CSSProperties}
    >
      <div
        ref={containerRef}
        className={`page-stage ${continuousScroll ? 'continuous-scroll-page-stage' : ''}`}
        style={continuousScroll ? { overflow: 'visible', overscrollBehavior: 'auto' } : undefined}
      >
      <div
        ref={setPageElement}
        className="page-container"
        style={containerStyle}
        data-pdf-page-number={pageData.page_number}
        data-pdf-page-width={pageData.width}
        data-pdf-page-height={pageData.height}
        data-translation-overrides-language={overridesReady ? language : 'loading'}
        data-diagnostic-blank-count={strictPtBrDiagnostic && language === 'pt-BR' && overridesReady
          ? strictPtBrDiagnosticBlankKeys.size : undefined}
        data-diagnostic-blank-keys={strictPtBrDiagnostic && language === 'pt-BR' && overridesReady
          ? JSON.stringify([...strictPtBrDiagnosticBlankKeys]) : undefined}
      >
        {toast && (
          <div className={`toast-notification toast-${toast.type}`}>
            {toast.message}
          </div>
        )}
        {pageData.backgroundUrl && (
          <img
            src={pageBackgroundUrl(pageData.page_number, language, pageData.backgroundUrl)}
            alt=""
            fetchPriority={continuousScroll ? undefined : 'high'}
            draggable={false}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              zIndex: 1, pointerEvents: 'none', userSelect: 'none',
            }}
          />
        )}

        {!overridesReady && (
          <div className="page-translation-skeleton" aria-busy="true" role="status">
            <span className="page-skeleton-sr-only">{language === 'pt-BR' ? 'Preparando a tradução da página' : 'Preparing page content'}</span>
            {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ width: `${39 + ((index * 19) % 49)}%` }} />)}
          </div>
        )}


        {companionBlocks.map((sourceBlock, bIdx) => {
          const sourceBlockKey = `page_${pageData.page_number}_block_${bIdx}`;
          const applyExperimentalHangingIndent = readOnlyExperiment
            && experimentalHangingIndentBlockKeys?.has(sourceBlockKey);
          const experimentalMarkerIndexes = applyExperimentalHangingIndent
            ? listMarkerLineIndexes(sourceBlock)
            : new Set<number>();
          const numberedMarkerIndex = applyExperimentalHangingIndent ? numberedMarkerLineIndex(sourceBlock) : -1;
          if (numberedMarkerIndex >= 0) experimentalMarkerIndexes.add(numberedMarkerIndex);
          const block = experimentalMarkerIndexes.size > 0
            ? {
              ...sourceBlock,
              experimentalHangingIndent: true,
              listMarkerLineIndexes: [...experimentalMarkerIndexes],
            }
            : sourceBlock;
          if (block.hiddenFromPage || block.artworkOnly) return null;
          const hasSourceInlineSymbols = (pageData.inlineElements ?? []).some(
            element => element.anchor.blockId === block.id,
          );
          const rows = pageData.contentsRows?.filter(row => row.blockId === block.id) ?? [];
          const localizedReferenceLines = new Map(language === 'pt-BR'
            ? rows.filter(row => row.numberLineId && row.sourceReference && row.sourceReferencePtBr)
              .map(row => [row.numberLineId!, {
                source: row.sourceReference!,
                target: row.sourceReferencePtBr!,
                shiftPt: row.sourceReferencePtBrShiftPt ?? 0,
              }] as const)
            : []);
          const localizedBlock = localizedReferenceLines.size > 0 ? {
            ...block,
            lines: block.lines?.map(line => {
              const reference = localizedReferenceLines.get(line.id);
              if (!reference) return line;
              let replaced = false;
              return {
                ...line,
                renderTextOffsetPt: (line.renderTextOffsetPt ?? 0) + reference.shiftPt,
                spans: line.spans.map(span => {
                  if (replaced || span.renderOnlyStrokePass || !span.text.includes(reference.source)) return span;
                  replaced = true;
                  return { ...span, text: span.text.replace(reference.source, reference.target) };
                }),
              };
            }),
          } : block;
          const hasOverride = (key: string) => renderOverrides.has(key)
            || (selectedSpan?.spanKey === key && draftOverride !== null);
          const canRenderRows = rows.length && overridesReady && !layoutMode
            && !contentsRowUsesLegacy(rows, language, hasOverride);
          const overlaySourceRows = !!canRenderRows && rows.some(row => row.overlaySource);
          if (canRenderRows && !overlaySourceRows) return (
            <ContentsLabelBlock key={block.id} block={block} rows={rows} scale={scale}
              descenderClearancePt={pageData.page_number === 101 && language === 'pt-BR' ? 1.25 : 0} isAdmin={isAdmin}
              language={language} overrides={renderOverrides} selectedKey={selectedSpan?.spanKey ?? null} draft={draftOverride}
              onBlockClick={handleSpanClick} onNavigate={onNavigate} proposalReviewHighlightKey={proposalReviewHighlightKey}
              diagnosticBlankKeys={effectiveDiagnosticBlankKeys} />
          );
          return (
            <React.Fragment key={block.id}>
              <SpanBlock
                block={pageData.contentsRows?.some(row=>localizedBlock.lines?.some(line=>line.id===row.numberLineId)) ? {...localizedBlock,adminReadOnly:true} : localizedBlock}
                hasSourceInlineSymbols={hasSourceInlineSymbols}
                coveredSourceSymbols={coveredSourceSymbols}
                allBlocks={companionBlocks}
                layoutObstacles={pageData.layoutObstacles ?? []}
                blockIdx={bIdx}
                pageNumber={pageData.page_number}
                pageHeightPt={pageData.height}
                scale={scale}
                isAdmin={isAdmin}
                contentsMap={contentsMap}
                onNavigate={onNavigate}
                onBlockClick={handleSpanClick}
                layoutMode={isAdmin && layoutMode}
                layoutUnitKey={frameUnitKey(pageData.page_number, block, bIdx)}
                layoutSelectionKey={layoutUnitKey}
                layoutDraft={layoutDraft}
                layoutFrames={renderLayoutFrames}
                persistedReviewDraftFrameKeys={persistedReviewDraftFrameKeys}
                inheritedLayoutFrames={inheritedLayoutFrames}
                layoutFrameForSelection={effectiveFrameFor(frameUnitKey(pageData.page_number, block, bIdx), sourceLayoutFrame(block))}
                layoutFrameOverride={(layoutUnitKey === frameUnitKey(pageData.page_number, block, bIdx) ? layoutDraft : undefined)
                  ?? renderLayoutFrames.get(frameUnitKey(pageData.page_number, block, bIdx))
                  ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(frameUnitKey(pageData.page_number, block, bIdx)) : undefined)}
                onSelectLayoutFrame={selectLayoutFrame}
                selectedBlockKey={selectedSpan?.spanKey || null}
                overrides={renderOverrides}
                overridesReady={overridesReady}
                draftOverride={draftOverride}
                language={language}
                proposalReviewDiagnosticBlankKeys={overridesReady ? effectiveDiagnosticBlankKeys : undefined}
                proposalReviewHighlightKey={proposalReviewHighlightKey}
              />
              {overlaySourceRows && <ContentsLabelBlock block={block} rows={rows} scale={scale}
                descenderClearancePt={pageData.page_number === 101 && language === 'pt-BR' ? 1.25 : 0} isAdmin={isAdmin}
                language={language} overrides={renderOverrides} selectedKey={selectedSpan?.spanKey ?? null} draft={draftOverride}
                onBlockClick={handleSpanClick} onNavigate={onNavigate} proposalReviewHighlightKey={proposalReviewHighlightKey}
                diagnosticBlankKeys={effectiveDiagnosticBlankKeys} />}
            </React.Fragment>
          );
        })}
        {language === 'pt-BR' && Array.from(adminCreatedFrames, ([unitKey, frame]) => {
          if (frame.hidden) return null;
          const spanKey = `${unitKey}__pt-BR`;
          const override = selectedSpan?.spanKey === spanKey && draftOverride
            ? draftOverride : renderOverrides.get(spanKey) ?? null;
          const x = frame.x;
          const y = frame.y ?? 0;
          const width = layoutFrameTotal(frame);
          const height = layoutFrameTotalHeight(frame) || 72;
          const select = (event: React.MouseEvent<HTMLDivElement>) => {
            event.stopPropagation();
            if (layoutMode) {
              selectLayoutFrame(unitKey, frame);
              return;
            }
            handleSpanClick({
              spanKey,
              text: '',
              font: 'AGaramondPro',
              family: mapPdfFont('AGaramondPro').family,
              weight: 400,
              style: 'normal',
              color: '#231f20',
              size: 13,
              bbox: [x, y, x + width, y + height],
              textAlign: frame.textAlign ?? 'left',
              lineHeight: frame.lineHeight ?? 1,
              sourceSegments: [],
              editorContext: 'paragraph',
            });
          };
          return <div
            key={unitKey}
            className={`admin-created-translation-block ${isAdmin ? 'block-editable' : ''}`}
            data-admin-created-block={unitKey}
            style={{
              position: 'absolute',
              left: `${x * scale}px`,
              top: `${y * scale}px`,
              width: `${width * scale}px`,
              minHeight: `${height * scale}px`,
              boxSizing: 'border-box',
              transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
              transformOrigin: 'center center',
              zIndex: 10001,
              whiteSpace: 'pre-wrap',
              textAlign: override?.textAlign ?? frame.textAlign ?? 'left',
              lineHeight: override?.lineHeight ?? frame.lineHeight ?? 1,
              cursor: isAdmin ? (layoutMode ? 'move' : 'text') : 'default',
              ...(isAdmin && !override && !layoutMode ? { outline: '1px dashed #00a6ff', background: 'rgb(0 166 255 / 8%)' } : {}),
            }}
            onClick={isAdmin ? select : undefined}
            {...adminGeometryAttributes(isAdmin, unitKey, { x, y, width, height, rotation: frame.rotation ?? 0 })}
          >
            {override
              ? renderCreditSegments(override.segments, undefined, 'pt-BR', scale, isAdmin, 'pre-wrap', spanKey)
              : isAdmin && !layoutMode ? <span style={{ color: '#64748b', font: `${10 * scale}px Inter, sans-serif` }}>Novo bloco · clique para editar</span> : null}
          </div>;
        })}
        <SourceCompoundVectorLayer elements={(pageData.sourceCompounds ?? []).filter(element => {
          const block = pageData.blocks.find(candidate => candidate.id === element.anchor.blockId);
          return !!block && !compoundElementIsReplaced(element, block, pageData.page_number, language, renderOverrides,
            selectedSpan?.spanKey ?? null, draftOverride);
        })} pageWidth={pageData.width} pageHeight={pageData.height} scale={scale} language={language} />
        {replacedInlineElements.filter(element => Boolean(element.mask?.url && element.mask?.bbox)).map(element=><img key={element.mask!.url} src={element.mask!.url} alt="" aria-hidden="true" draggable={false}
          style={{position:'absolute',left:element.mask!.bbox[0]*scale,top:element.mask!.bbox[1]*scale,width:(element.mask!.bbox[2]-element.mask!.bbox[0])*scale,height:(element.mask!.bbox[3]-element.mask!.bbox[1])*scale,
            // Paint the cleanup over the page raster but below source blocks;
            // same-level masks painted after a z-index-2 block can hide its inline symbol.
            clipPath:sourceMaskClipPath(element),zIndex:1,pointerEvents:'none'}} />)}
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
                maskImage: overlay.maskInlineElements === false
                  ? undefined
                  : sourceOverlayMask(overlay.bbox,replacedInlineElements),
                maskSize: '100% 100%',
              }}
            />
          );
        })}
      </div>
      {isAdmin && (showRuler || layoutMode) && <AdminRuler pageElement={pageElement} pageWidth={pageData.width} pageHeight={pageData.height} alignmentGuides={alignmentGuides} selectedGeometry={selectedLayoutGeometry} portalHost={overlayHost} />}
      </div>

      {isAdmin && selectedSpan && onEditorPanelWidthChange && (
        <div
          className="rse-resize-handle"
          role="separator"
          aria-label={language === 'pt-BR' ? 'Redimensionar painel do editor' : 'Resize editor panel'}
          aria-orientation="vertical"
          aria-valuemin={editorWidthLimits().min}
          aria-valuemax={editorWidthLimits().max}
          aria-valuenow={Math.round(editorPanelWidth)}
          tabIndex={0}
          onPointerDown={handleEditorResizePointerDown}
          onPointerMove={handleEditorResizePointerMove}
          onPointerUp={handleEditorResizePointerEnd}
          onPointerCancel={handleEditorResizePointerCancel}
          onKeyDown={handleEditorResizeKeyDown}
        />
      )}

      {isAdmin && selectedSpan && (!readOnlyExperiment || experimentalEditorMode) && (
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
          originalListMarkerIndentPt={selectedSpan.listMarkerIndentPt}
          originalHangingIndentPt={selectedSpan.hangingIndentPt}
          bbox={selectedSpan.bbox}
          pageNumber={pageData.page_number}
          language={language}
          onClose={handleCloseEditor}
          onSave={experimentalEditorMode ? handleSaveExperimentalOverride : handleSaveOverride}
          onDraftChange={handleDraftChange}
          existingOverride={selectedExistingOverride}
          overrideStatusLoading={!experimentalEditorMode && !overridesReady}
          persistenceStatus={experimentalEditorMode ? undefined : selectedOverridePersistenceState ?? undefined}
          canNavigatePrevious={editableNavigationEnabled && unitNavigationAvailability.previous && !isSaving}
          canNavigateNext={editableNavigationEnabled && unitNavigationAvailability.next && !isSaving}
          onNavigatePrevious={editableNavigationEnabled ? () => navigateEditableUnit('previous') : undefined}
          onNavigateNext={editableNavigationEnabled ? () => navigateEditableUnit('next') : undefined}
          singleLine={selectedSpan.singleLine}
          editorContext={selectedSpan.editorContext ?? 'paragraph'}
          symbolAliasPreferences={symbolAliasPreferences}
          onPaletteEditorChange={onPaletteEditorChange}
          headerAccessory={editorHeaderAccessory}
          parentBlockAction={selectedUnitParentInfo && !experimentalEditorMode && !proposalReviewSelectionKey
            ? { label: 'Editar bloco inteiro', onActivate: () => handleSpanClick(selectedUnitParentInfo) }
            : undefined}
          onToggleLanguage={onToggleLanguage}
          sessionOnly={experimentalEditorMode}
          persistentDraftMode={Boolean(experimentalEditorMode && proposalReviewSelectionKey)}
          persistentDraftStatus={experimentalSaveStatus}
          glossaryDecisions={glossaryDecisions}
        />
      )}
      {isAdmin && layoutMode && (
        <AdminLayoutFrameEditor
          portalHost={overlayHost}
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
          onCreateBlock={createAdminBlock}
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
  descenderClearancePt?: number;
  isAdmin: boolean;
  language: 'en' | 'pt-BR';
  overrides: Map<string, SpanOverride>;
  selectedKey: string | null;
  draft: SpanOverride | null;
  onBlockClick: (info: SelectedSpanInfo) => void;
  onNavigate?: (page: number) => void;
  proposalReviewHighlightKey?: string | null;
  diagnosticBlankKeys?: ReadonlySet<string>;
}
function ContentsLabelBlock({
  block, rows, scale, descenderClearancePt = 0, isAdmin, language, overrides, selectedKey, draft, onBlockClick, onNavigate, proposalReviewHighlightKey, diagnosticBlankKeys,
}: ContentsLabelBlockProps) {
  return <>{rows.map(row => {
    const line = contentsRowLine(block, row);
    if (!line) return null;
    const key = contentsRowKey(row, language);
    const override = selectedKey === key && draft ? draft : overrides.get(key);
    const diagnosticBlank = language === 'pt-BR' && !override && (diagnosticBlankKeys?.has(key) ?? false);
    const [x, y, , bottom] = row.labelBBox;
    const width = contentsLabelWidth(row);
    const height = bottom - y;
    const overlaySource = !!row.overlaySource;
    const reviewHighlighted = proposalReviewHighlightKey === key;
    const field: CreditFieldDefinition = {
      id: row.id, lineIds: [row.lineId], bbox: [x, y, x + width, bottom],
      frame: { x, width, textAlign: 'left', lineHeight: 1 },
    };
    const attributes = adminGeometryAttributes(isAdmin, key, { x, y, width, height, rotation: 0 });
    const select = () => {
        if (isAdmin) {
          const selected = extractCreditFieldInfo(key, block, field);
          const semanticSourceText = row.sourceText;
          onBlockClick({
            ...selected,
            ...(semanticSourceText ? {
              // A reflowed index row uses another source line for its target geometry;
              // keep the editor's source label bound to the semantic translation key.
              text: semanticSourceText,
              sourceSegments: selected.sourceSegments?.length
                ? [{ ...selected.sourceSegments[0], text: semanticSourceText }]
                : selected.sourceSegments,
            } : {}),
            singleLine: true,
            editorContext: 'typographic-field',
          });
        }
      else if (row.targetPage !== undefined) onNavigate?.(row.targetPage);
    };
    const click = (event: React.MouseEvent) => {
      event.stopPropagation();
      select();
    };
    return <React.Fragment key={row.id}>
      {(override || diagnosticBlank) && <img src={row.mask.url} alt="" aria-hidden="true" draggable={false} style={{
        position: 'absolute', left: row.mask.bbox[0] * scale, top: row.mask.bbox[1] * scale,
        width: (row.mask.bbox[2] - row.mask.bbox[0]) * scale,
        height: (row.mask.bbox[3] - row.mask.bbox[1]) * scale, zIndex: overlaySource ? 1001 : 2, pointerEvents: 'none',
      }} />}
      <div className={`contents-label-field ${isAdmin ? 'credit-edit-field' : ''} ${selectedKey === key ? 'credit-field-selected' : ''} ${reviewHighlighted ? 'proposal-review-highlight' : ''}`}
        role={isAdmin ? 'button' : 'link'} tabIndex={0}
        style={{ position: 'absolute', left: x * scale, top: y * scale, width: width * scale, height: height * scale,
          zIndex: overlaySource ? 1002 : block.zIndex ?? 10 }}
        {...attributes} data-editable-unit-key={isAdmin && spansContainEditableText(line.spans) ? key : undefined}
        data-rendered-translation-key={override ? key : undefined}
        data-translation-review-highlight={reviewHighlighted ? key : undefined}
        data-translation-review-diagnostic-blank={diagnosticBlank ? key : undefined}
        aria-label={diagnosticBlank ? 'Unidade vazia na exportação diagnóstica; a tradução não está persistida.' : undefined}
        onClick={click} onKeyDown={event => {
          if (event.key === 'Enter' || (isAdmin && event.key === ' ')) {
            event.preventDefault();
            select();
          }
        }}>
        {override ? <ContentsRowFlow row={row} scale={scale} fontScale={language === 'pt-BR' ? row.ptBrFontScale ?? 1 : 1}
          sourceFontSize={line.spans.find(span => span.text.trim())?.size ?? override.segments[0]?.size ?? 12}
          descenderClearancePt={descenderClearancePt}
          isAdmin={isAdmin} text={override.segments.map(run => run.text).join('')}
          referenceText={row.dynamicReferenceLayout ? row.referenceTextPtBr : undefined}>
          {renderCreditSegments(override.segments.map(run => ({ ...run,
            size: run.size * (language === 'pt-BR' ? row.ptBrFontScale ?? 1 : 1),
            text: run.text.replace(/[\r\n]+/g, ' '),
          })), undefined, language, scale, isAdmin, 'nowrap')}
        </ContentsRowFlow> : diagnosticBlank ? null : overlaySource ? null : <div style={{ pointerEvents: 'none' }}><LineRenderer line={line} scale={scale} blockOriginX={x} blockOriginY={y}
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
  pageHeightPt: number;
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
  persistedReviewDraftFrameKeys: ReadonlySet<string>;
  inheritedLayoutFrames: Map<string, LayoutFrame>;
  layoutFrameForSelection: LayoutFrame;
  layoutFrameOverride?: LayoutFrame;
  onSelectLayoutFrame: (unitKey: string, frame: LayoutFrame) => void;
  selectedBlockKey: string | null;
  overrides: Map<string, SpanOverride>;
  overridesReady: boolean;
  draftOverride: SpanOverride | null;
  language: 'en' | 'pt-BR';
  proposalReviewDiagnosticBlankKeys?: ReadonlySet<string>;
  proposalReviewHighlightKey?: string | null;
}

const SpanBlock: React.FC<SpanBlockProps> = ({
  block, hasSourceInlineSymbols, coveredSourceSymbols, allBlocks, layoutObstacles, blockIdx, pageNumber, pageHeightPt, scale, isAdmin, contentsMap,
  onNavigate, onBlockClick, layoutMode, layoutUnitKey, layoutSelectionKey, layoutDraft, layoutFrames, inheritedLayoutFrames,
  persistedReviewDraftFrameKeys, layoutFrameForSelection, layoutFrameOverride, onSelectLayoutFrame,
  selectedBlockKey, overrides, overridesReady, draftOverride, language, proposalReviewDiagnosticBlankKeys,
  proposalReviewHighlightKey,
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
  const frameW = block.layoutFrame ? layoutFrameTotal(block.layoutFrame) : (block.lines?.[0] as any)?.availableWidth ?? blockW;

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
  const clientReviewKey = proposalReviewHighlightKey ? clientSpanKey(proposalReviewHighlightKey, language) : null;
  const reviewBlockHighlighted = Boolean(proposalReviewHighlightKey && (
    proposalReviewHighlightKey === blockKey
    || clientReviewKey === blockKey
    || blockKey.startsWith(`${proposalReviewHighlightKey}__`)
    || Boolean(clientReviewKey && blockKey.startsWith(`${clientReviewKey}__`))
  ));
  const reviewBlockHighlightClass = reviewBlockHighlighted ? 'proposal-review-highlight' : '';
  const isDiagnosticBlank = proposalReviewDiagnosticBlankKeys?.has(blockKey) ?? false;

  let currentOverride = block.adminReadOnly ? null : normalizeStaticEditorPrefix(block, overrides.get(blockKey) || null);
  if (!block.adminReadOnly && selectedBlockKey === blockKey && draftOverride) {
    currentOverride = draftOverride;
  }

  const translatedFrame = currentOverride ? layoutFrameOverride : undefined;
  const translatedX = translatedFrame?.x ?? frameX;
  const translatedY = translatedFrame?.y ?? blockY;
  const translatedWidth = translatedFrame ? layoutFrameTotal(translatedFrame) : frameW;
  const translatedHeight = translatedFrame ? layoutFrameTotalHeight(translatedFrame) : block.listFlowHeight ?? blockH;
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
    if (isDiagnosticBlank) {
      setIsOverflowing(false);
      return;
    }
    if (currentOverride && blockRef.current) {
      const actualHeight = blockRef.current.scrollHeight;
      setIsOverflowing(actualHeight > translatedHeight * scale + 2); // 2px tolerance
    } else {
      setIsOverflowing(false);
    }
  }, [isDiagnosticBlank, currentOverride, scale, translatedHeight, translatedWidth]);

  const isHidden = Boolean(translatedFrame?.hidden || layoutFrameOverride?.hidden || block.layoutFrame?.hidden || block.hiddenFromPage);
  if (isHidden) {
    if (!layoutMode) return null;
    return (
      <div
        className={`block-container admin-hidden-block ${reviewBlockHighlightClass}`}
        data-admin-hidden-block={blockKey}
        data-translation-review-highlight={reviewBlockHighlighted ? (proposalReviewHighlightKey ?? blockKey) : undefined}
        style={{
          ...translatedStyle,
          border: '1.5px dashed #ef4444',
          background: 'rgba(239, 68, 68, 0.08)',
          cursor: 'pointer',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
        onClick={() => onSelectLayoutFrame?.(layoutUnitKey, layoutFrameForSelection)}
        title="Bloco Oculto (clique para reexibir ou ajustar moldura)"
      >
        <span style={{ fontSize: '10px', fontWeight: 600, color: '#ef4444', background: 'rgba(15, 23, 32, 0.85)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
          🗑️ Oculto
        </span>
      </div>
    );
  }

  if (isDiagnosticBlank) {
    return (
      <div
        className={`block-container translation-review-diagnostic-blank ${reviewBlockHighlightClass}`}
        data-translation-review-diagnostic-blank={blockKey}
        data-translation-review-highlight={reviewBlockHighlighted ? (proposalReviewHighlightKey ?? blockKey) : undefined}
        aria-label="Unidade vazia na prévia diagnóstica; a proposta completa permanece no painel de revisão."
        style={blockStyle}
      />
    );
  }

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
        blockRendererKey={blockKey}
        nextComponentY={findNextSameColumnComponentY(allBlocks, layoutObstacles, block)}
        pageHeightPt={pageHeightPt}
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
        proposalReviewHighlightKey={proposalReviewHighlightKey}
        proposalReviewDiagnosticBlankKeys={proposalReviewDiagnosticBlankKeys}
      />
    );
  }

  const creditUnits = block.creditUnits ?? (block.creditUnit ? [block.creditUnit] : []);
  if (creditUnits.length > 0 && overridesReady && !overrides.has(blockKey)) {
    return (
      <CreditUnitBlock
        block={block}
        blockRendererKey={blockKey}
        units={creditUnits}
        pageNumber={pageNumber}
        scale={scale}
        isAdmin={isAdmin}
        onBlockClick={onBlockClick}
        selectedBlockKey={selectedBlockKey}
        overrides={overrides}
        draftOverride={draftOverride}
        language={language}
        proposalReviewHighlightKey={proposalReviewHighlightKey}
        diagnosticBlankKeys={proposalReviewDiagnosticBlankKeys}
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
  const experimentalListBodySourceLine = block.experimentalHangingIndent
    ? (block.lines ?? []).find((line, index) => index > firstMarkerIndex
      && !markerIndexes.has(index) && sourceLineText(line).trim().length > 0)
    : undefined;
  const legacyListParts = currentOverride ? splitLegacyListOverride(currentOverride, legacyMarkerGlyphs) : null;

  if (canSplitListFlow && (hasActiveWholeBlockDraft || (currentOverride && !legacyListParts))) {
    // Keep an existing whole-block draft intact if it lacks enough source
    // markers to migrate without guessing where one translated item ends.
    return <SpanBlock {...{
      block: { ...block, listMarkerLineIndexes: undefined, disableAutoListMarkerDetection: true },
      hasSourceInlineSymbols, coveredSourceSymbols, allBlocks, layoutObstacles, blockIdx, pageNumber, scale,
      isAdmin, contentsMap, onNavigate, onBlockClick, layoutMode, layoutUnitKey, layoutSelectionKey, layoutDraft, pageHeightPt,
      layoutFrames, inheritedLayoutFrames, layoutFrameForSelection,
      layoutFrameOverride, onSelectLayoutFrame, selectedBlockKey, overrides, overridesReady, draftOverride, language,
      proposalReviewHighlightKey, persistedReviewDraftFrameKeys,
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
          managedSourceSymbols: [...new Set(segments.flatMap(segment => {
            const symbolId = segment.symbolId ?? resolveLegacySymbol(segment.font, segment.text)?.id;
            return symbolId ? [symbolId] : [];
          }))],
        });
      }
    }

    return <>
      {parts.map(part => {
        if (part.kind === 'marker' && part.line) {
          const adjacentText = parts.find(candidate => candidate.kind === 'text'
            && candidate.markerOrdinal === part.markerOrdinal);
          const adjacentBlock = adjacentText ? listFlowTextBlock(block, adjacentText, pageNumber, blockIdx) : null;
          const adjacentKey = adjacentBlock?.editorKey ? `${adjacentBlock.editorKey}__${language}` : null;
          const adjacentOverride = adjacentKey && selectedBlockKey === adjacentKey && draftOverride
            ? draftOverride : adjacentKey ? overrides.get(adjacentKey) : undefined;
          const sourceMarkerInset = adjacentBlock ? sourceListIndentValues(adjacentBlock.lines ?? [], true).listMarkerIndentPt ?? 0 : 0;
          const markerShift = (adjacentOverride?.listMarkerIndentPt ?? sourceMarkerInset) - sourceMarkerInset;
          return (
            <div key={part.key} className={`block-container list-marker-source ${reviewBlockHighlightClass}`} aria-hidden="true"
              data-translation-review-highlight={reviewBlockHighlighted ? (proposalReviewHighlightKey ?? blockKey) : undefined}
              data-list-marker-line={part.line.id}
              style={{ position: 'absolute', left: `${blockX * scale}px`, top: `${blockY * scale}px`,
                width: `${blockW * scale}px`, height: `${blockH * scale}px`, zIndex: block.zIndex || 10,
                pointerEvents: 'none', transform: markerShift ? `translateX(${markerShift * scale}px)` : undefined }}>
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
          blockIdx={blockIdx} pageNumber={pageNumber} pageHeightPt={pageHeightPt} scale={scale} isAdmin={isAdmin} contentsMap={contentsMap}
            onNavigate={onNavigate} onBlockClick={onBlockClick} layoutMode={layoutMode} layoutUnitKey={rowUnitKey}
            layoutSelectionKey={layoutSelectionKey} layoutDraft={layoutDraft} layoutFrames={layoutFrames}
            inheritedLayoutFrames={inheritedLayoutFrames}
            layoutFrameForSelection={sourceLayoutFrame(rowBlock)} onSelectLayoutFrame={onSelectLayoutFrame}
            layoutFrameOverride={layoutFrames.get(rowUnitKey)
              ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(rowUnitKey) : undefined)}
            selectedBlockKey={selectedBlockKey} overrides={rowOverrides} overridesReady={overridesReady}
            draftOverride={draftOverride} language={language} proposalReviewHighlightKey={proposalReviewHighlightKey}
            persistedReviewDraftFrameKeys={persistedReviewDraftFrameKeys} />
        );
      })}
    </>;
  }

  const inlineSpanStates = buildInlineSpanStates(
    block, pageNumber, selectedBlockKey, overrides, draftOverride, language,
    undefined, layoutFrames, proposalReviewDiagnosticBlankKeys,
  );
  const inlineSpanHitTargets = isAdmin && !layoutMode
    ? (block.typographicSpanUnits ?? []).flatMap(unit => {
      const spanKey = `page_${pageNumber}_unit_${unit.id}__${language}`;
      const state = inlineSpanStates.get(unit.spanRefs[0]);
      if (!state?.renderAtRef || state.interactive === false) return [];
      const references = new Set(unit.spanRefs);
      const targetSpans = (block.lines ?? []).flatMap(line => line.spans.flatMap((span, index) => {
        const reference = `${line.id}:${span.sourceSpanIndex ?? index}`;
        return references.has(reference) && !span.semanticSymbolId && !span.renderOnlyStrokePass
          ? [span] : [];
      }));
      if (!targetSpans.length) return [];
      const bounds = targetSpans.map(span => span.bbox);
      return [{
        spanKey,
        state,
        x: Math.min(...bounds.map(bbox => bbox[0])),
        y: Math.min(...bounds.map(bbox => bbox[1])),
        right: Math.max(...bounds.map(bbox => bbox[2])),
        bottom: Math.max(...bounds.map(bbox => bbox[3])),
      }];
    })
    : [];

  const blockCanEdit = isAdmin && !layoutMode && !block.adminReadOnly;
  const editableNavigationKey = blockCanEdit && spansContainEditableText(
    editableBlockLines(block).flatMap(line => line.spans),
  ) ? blockKey : undefined;
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
  const sourceOverrideIsUnchanged = !!currentOverride
    && overrideIsSourceEquivalent(currentOverride, sourceSegments, {
      textAlign: block.layoutFrame?.textAlign ?? 'left',
      lineHeight: block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
    });
  const nestedOverridesAreSourceEquivalent = Array.from(new Map(
    Array.from(inlineSpanStates.values(), state => [state.spanKey, state] as const),
  ).values()).every(state => !state.override || overrideIsSourceEquivalent(
    state.override,
    state.info.sourceSegments ?? [],
    {
      textAlign: 'left',
      lineHeight: block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
    },
  ));
  const preservedSourceText = (block.sourceTextLanguageInvariant && hasExactSourceGeometry(block))
    || (pageNumber === 19 && ['block_39', 'block_43', 'block_47', 'block_51'].includes(block.id));
  if ((language === 'en' || preservedSourceText) && (!isAdmin || !layoutMode) && hasExactSourceGeometry(block)
    && (!currentOverride || sourceOverrideIsUnchanged) && nestedOverridesAreSourceEquivalent) {
    return (
      <div className={`block-container ${blockHoverClass} ${overflowClass} ${reviewBlockHighlightClass}`} data-render-mode="sourceGeometry"
        data-translation-review-highlight={reviewBlockHighlighted ? (proposalReviewHighlightKey ?? blockKey) : undefined}
        data-proof-block-id={pageNumber === 14 && (block.id === 'block_16' || block.id === 'block_17') ? block.id : undefined}
        style={{ ...blockStyle, left: `${blockX * scale}px`, top: `${blockY * scale}px`, width: `${blockW * scale}px`, height: `${blockH * scale}px` }}
        onClick={handleBlockClick} {...geometryAttributes} data-editable-unit-key={editableNavigationKey}>
        <SourceGeometryBlock block={block} scale={scale} blockOriginX={blockX} blockOriginY={blockY} />
        {inlineSpanHitTargets.map(target => (
          <button
            key={target.spanKey}
            type="button"
            className={`span-editable ${target.state.selected ? 'span-selected' : ''} ${target.spanKey === proposalReviewHighlightKey ? 'proposal-review-highlight' : ''}`}
            data-source-inline-hit-target={target.spanKey}
            data-translation-review-highlight={target.spanKey === proposalReviewHighlightKey ? target.spanKey : undefined}
            data-editable-unit-key={target.spanKey}
            aria-label={`Edit text ${target.state.info.text.slice(0, 48)}`}
            title={target.state.info.text}
            style={{
              position: 'absolute',
              left: `${(target.x - blockX) * scale}px`,
              top: `${(target.y - blockY) * scale}px`,
              width: `${Math.max(1, (target.right - target.x) * scale)}px`,
              height: `${Math.max(1, (target.bottom - target.y) * scale)}px`,
              padding: 0,
              border: 0,
              background: 'transparent',
              color: 'transparent',
              fontSize: 0,
              zIndex: 2,
            }}
            onClick={event => {
              event.stopPropagation();
              onBlockClick(target.state.info);
            }}
          />
        ))}
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
    const sourceBulletLines = language === 'pt-BR'
      ? (block.lines ?? []).filter((line, index) => markerIndexes.has(index) && listMarkerGlyph(line) === '•')
      : [];
    const bulletParagraphCount = countLeadingBulletParagraphs(sourceAwareSegments);
    const inlineSourceBulletFlow = sourceBulletLines.length > 0
      && bulletParagraphCount === sourceBulletLines.length;
    const sourceListIndents = sourceListIndentValues(block.lines ?? [], block.listFlowItem);
    const numberedParagraphs = splitSegmentsIntoParagraphs(sourceAwareSegments).map((paragraph, paragraphIndex) => ({
      paragraphIndex,
      ...(splitLeadingNumberedListMarker(paragraph) ?? { marker: null, body: paragraph }),
    }));
    const hasNumberedMarkers = numberedParagraphs.some(paragraph => paragraph.marker !== null);
    const useNumberedListFlow = !inlineSourceBulletFlow && hasNumberedMarkers
      && (sourceListIndents.hangingIndentPt !== undefined
        || currentOverride.listMarkerIndentPt !== undefined
        || currentOverride.hangingIndentPt !== undefined);
    let numberedItemOpen = false;
    let flowedBulletIndex = 0;
    const flowedListParagraphs = inlineSourceBulletFlow
      ? splitSegmentsIntoParagraphs(sourceAwareSegments).map((paragraph, paragraphIndex) => {
          const paragraphText = paragraph.map(segment => segment.text).join('').trimStart();
          if (!/^•(?:[\s\t]|$)/u.test(paragraphText)) {
            return { paragraph, marker: null as SpanOverride['segments'] | null, indentPt: 0, markerLineId: null as string | null, paragraphIndex };
          }
          const sourceMarker = sourceBulletLines[flowedBulletIndex++];
          if (!sourceMarker) {
            return { paragraph, marker: null as SpanOverride['segments'] | null, indentPt: 0, markerLineId: null as string | null, paragraphIndex };
          }
          return {
            paragraph: removeLeadingBulletParagraphPrefix(paragraph),
            marker: sourceBulletRenderSegments(sourceMarker),
            indentPt: sourceListMarkerIndentPt(sourceMarker, block.lines ?? []),
            markerLineId: sourceMarker.id,
            paragraphIndex,
          };
        })
      : null;
    const flowedBulletLineIds = new Set(flowedListParagraphs?.flatMap(paragraph => paragraph.markerLineId ? [paragraph.markerLineId] : []) ?? []);
    // Edited text uses translatedFlow; untouched EN stays in SourceGeometryBlock above.
    const fixedLineIndexes = fixedEditorLineIndexes(block);
  const fixedLineEntries = (block.lines ?? []).flatMap((line, index) =>
    fixedLineIndexes.has(index) && !flowedBulletLineIds.has(line.id) ? [{ line, index }] : [],
  );
  const fixedLines = fixedLineEntries.map(entry => entry.line);
    const firstLine = editableBlockLines(block)[0] ?? block.lines[0];
    const hasStaticEditorLines = fixedLines.length > 0;
    const listBodyShiftPt = block.listFlowItem && currentOverride.hangingIndentPt !== undefined
      && sourceListIndents.hangingIndentPt !== undefined
      ? currentOverride.hangingIndentPt - sourceListIndents.hangingIndentPt
      : 0;
    const baseRawX = block.experimentalHangingIndent && hasStaticEditorLines
      ? firstLine.bbox[0]
      : layoutFrameOverride?.x ?? (hasStaticEditorLines
        ? firstLine.bbox[0]
        : block.layoutFrame?.x ?? ((firstLine as any).availableX !== undefined ? (firstLine as any).availableX : blockX));
    const rawX = baseRawX + listBodyShiftPt;
    const sourceFrameRight = layoutFrameOverride
        ? layoutFrameRight(layoutFrameOverride)
      : block.layoutFrame
        ? layoutFrameRight(block.layoutFrame)
        : ((firstLine as any).availableX ?? rawX) + ((firstLine as any).availableWidth ?? blockW);
    const baseRawWidth = block.experimentalHangingIndent && hasStaticEditorLines
      ? Math.max(0, sourceFrameRight - rawX)
      : hasStaticEditorLines
        ? Math.max(0, sourceFrameRight - rawX)
        : layoutFrameOverride ? layoutFrameTotal(layoutFrameOverride) : block.layoutFrame ? layoutFrameTotal(block.layoutFrame) : (firstLine as any).availableWidth ?? blockW;
    const rawWidth = Math.max(0, baseRawWidth - listBodyShiftPt);
    const renderOriginX = translatedFrame ? translatedX : frameX;
    const renderOriginY = translatedFrame ? translatedY : blockY;
    const blockLineX = (rawX - renderOriginX) * scale;
    const blockLineW = rawWidth * scale;
    const sourceHangingIndentMarkerByKey: Readonly<Record<string, string>> = {
      page_14_block_1: '1.',
      page_14_block_5: '2.',
      page_14_block_6: '3.',
      page_14_block_7: '4.',
      // Source p.18 keeps all four restoration steps in the same 18 pt text column.
      page_18_block_100: '1.',
      page_18_block_101: '2.',
      page_18_block_102: '3.',
      page_18_block_103: '4.',
    };
    // Layout fidelity applies to persisted/viewer translations as well as
    // admin editing previews; editableNavigationKey is absent outside Admin.
    const expectedHangingIndentMarker = sourceHangingIndentMarkerByKey[blockKey.split('__')[0]];
    const phaseMarkerSplit = expectedHangingIndentMarker
      ? splitLeadingNumberedListMarker(sourceAwareSegments)
      : null;
    const phaseMarkerText = phaseMarkerSplit?.marker.map(segment => segment.text).join('').trim();
    const phaseMarkerIndex = expectedHangingIndentMarker && phaseMarkerText === expectedHangingIndentMarker ? 0 : -1;
    const phaseMarkerSegments = phaseMarkerIndex >= 0 && phaseMarkerSplit?.marker[0] && expectedHangingIndentMarker
      ? [{ ...phaseMarkerSplit.marker[0], text: expectedHangingIndentMarker }]
      : [];
    const phaseBodySegments = phaseMarkerIndex >= 0 && phaseMarkerSplit ? phaseMarkerSplit.body : [];
    const phaseBodyStartIndex = phaseMarkerIndex >= 0 ? 1 : 0;
    const effectiveMarkerIndentPt = currentOverride.listMarkerIndentPt ?? sourceListIndents.listMarkerIndentPt ?? 0;
    const effectiveHangingIndentPt = currentOverride.hangingIndentPt ?? sourceListIndents.hangingIndentPt ?? 18;
    const effectiveMarkerAdvancePt = Math.max(0, effectiveHangingIndentPt - effectiveMarkerIndentPt);
    const renderSegments = (segments: SpanOverride['segments'], startIndex = 0) => segments.map((seg, segIdx) => {
      const absoluteSegmentIndex = startIndex + segIdx;
      const segmentStyle: React.CSSProperties = {
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
      };
      if (absoluteSegmentIndex === phaseMarkerIndex) {
        const markerSegment = { ...seg, text: expectedHangingIndentMarker ?? seg.text.replace(/\t$/, '') };
        return <span key={absoluteSegmentIndex} aria-label={markerSegment.text} data-source-marker-advance={`${effectiveMarkerAdvancePt}pt`} style={{
          display: 'inline-block',
          width: `${effectiveMarkerAdvancePt * scale}px`,
          whiteSpace: 'pre',
          verticalAlign: 'baseline',
        }}>
          <span style={segmentStyle}>{renderSegmentContent(markerSegment, scale, language, 'translatedFlow')}</span>
        </span>;
      }
      return <span key={absoluteSegmentIndex} style={segmentStyle}>
        {seg.symbolId || resolveLegacySymbol(seg.font, seg.text)
          ? renderSegmentContent(seg, scale, language, 'translatedFlow')
          : block.noWrap
            ? seg.text.replace(/[\r\n]+/g, ' ').replace(/[\t ]+/g, ' ')
            : seg.text}
      </span>;
    });

    return (
      <div className={`block-container ${blockHoverClass} ${overflowClass}`} style={translatedStyle} onClick={handleBlockClick} {...geometryAttributes} data-editable-unit-key={editableNavigationKey}
        data-translation-review-highlight={reviewBlockHighlighted ? (proposalReviewHighlightKey ?? blockKey) : undefined}
        data-source-list-body-start-x={experimentalListBodySourceLine?.bbox[0]}
        data-proof-block-id={pageNumber === 14 && (block.id === 'block_16' || block.id === 'block_17') ? block.id : undefined}>
        {fixedLineEntries.map(({ line, index }) => {
          const isListMarker = markerIndexes.has(index);
          const sourceMarkerInset = sourceListIndents.listMarkerIndentPt ?? 0;
          const markerShiftPt = isListMarker && currentOverride.listMarkerIndentPt !== undefined
            ? currentOverride.listMarkerIndentPt - sourceMarkerInset
            : 0;
          return (
          <div
            key={`static-${line.id}`}
            className="static-editor-line"
            data-list-marker-line={isListMarker ? line.id : undefined}
            data-source-line-x={line.bbox[0]}
            data-source-line-right={line.bbox[2]}
            data-source-line-available-x={(line as any).availableX}
            data-source-line-available-width={(line as any).availableWidth}
            style={markerShiftPt ? { transform: `translateX(${markerShiftPt * scale}px)` } : undefined}
            onClick={event => event.stopPropagation()}
          >
            <LineRenderer
              line={line}
              scale={scale}
              // A candidate-only review frame can widen/move the translated
              // body while this marker stays on its source PDF anchor. Saved
              // human frames retain the existing marker-following behavior.
              // A translated frame controls the list body. Keep an extracted
              // source marker anchored to the PDF position when that frame
              // moves; otherwise saving a review frame shifts the marker with
              // the body and destroys the source hanging indent.
              blockOriginX={isListMarker && translatedFrame
                ? renderOriginX
                : persistedReviewDraftFrameKeys.has(layoutUnitKey) ? renderOriginX : frameX}
              blockOriginY={persistedReviewDraftFrameKeys.has(layoutUnitKey) ? renderOriginY : blockY}
              isAdmin={false}
              isSelected={false}
              language={language}
              onClick={() => {}}
            />
          </div>
          );
        })}
        <div 
          ref={blockRef}
          className={`realbox ${reviewBlockHighlightClass}`}
          data-rendered-translation-key={currentOverride ? payloadSpanKey(blockKey, language) : undefined}
          data-print-line-height={currentOverride.printLineHeight}
          data-print-paragraph-spacing={currentOverride.printParagraphSpacingPt}
          style={{
            position: 'absolute',
            left: `${blockLineX}px`,
            top: `${((layoutFrameOverride?.y ?? blockY) - renderOriginY) * scale}px`,
            width: `${blockLineW}px`,
            whiteSpace: block.noWrap ? 'pre' : 'pre-wrap',
            textAlign: currentOverride.textAlign ?? layoutFrameOverride?.textAlign ?? block.layoutFrame?.textAlign ?? 'left',
            lineHeight: effectiveLineHeight,
            ...(currentOverride.printLineHeight !== undefined
              ? { '--print-line-height': currentOverride.printLineHeight } as React.CSSProperties
              : {}),
            ...(currentOverride.printParagraphSpacingPt !== undefined
              ? { '--print-paragraph-spacing': `${currentOverride.printParagraphSpacingPt * scale}px` } as React.CSSProperties
              : {}),
            display: 'block',
            fontSize: 0,
            cursor: layoutMode ? 'move' : isAdmin ? 'text' : 'default',
          }}
        >
          {phaseMarkerIndex >= 0 ? (
            <div
              data-source-hanging-indent-pt={effectiveHangingIndentPt}
              style={{
                display: 'grid',
                marginLeft: `${effectiveMarkerIndentPt * scale}px`,
                gridTemplateColumns: `${effectiveMarkerAdvancePt * scale}px minmax(0, 1fr)`,
                alignItems: 'start',
                width: '100%',
              }}
            >
              <span style={{ minWidth: 0, whiteSpace: 'pre' }}>
                {renderSegments(phaseMarkerSegments, phaseMarkerIndex)}
              </span>
              <span style={{ display: 'block', minWidth: 0 }}>
                {renderSegments(phaseBodySegments, phaseBodyStartIndex)}
              </span>
            </div>
          ) : useNumberedListFlow ? (
            <div data-source-numbered-list-flow="true">
              {numberedParagraphs.map(({ marker, body, paragraphIndex }, index, paragraphs) => {
                const markerIndent = currentOverride.listMarkerIndentPt ?? sourceListIndents.listMarkerIndentPt ?? 0;
                const bodyIndent = currentOverride.hangingIndentPt ?? sourceListIndents.hangingIndentPt ?? 18;
                if (marker?.length) numberedItemOpen = true;
                const continuationIndent = !marker?.length && numberedItemOpen
                  ? block.flowParagraphIndentsPt?.[paragraphIndex] ?? bodyIndent
                  : 0;
                const paragraphFontSize = (body.length ? body : marker ?? []).find(segment => segment.text.trim())?.size ?? 13;
                return <div
                  key={`numbered-list-${paragraphIndex}`}
                  data-source-numbered-list-row={paragraphIndex}
                  style={{
                    display: marker?.length ? 'grid' : 'block',
                    gridTemplateColumns: marker?.length
                      ? `${Math.max(0, bodyIndent - markerIndent) * scale}px minmax(0, 1fr)`
                      : undefined,
                    marginLeft: marker?.length ? `${markerIndent * scale}px` : undefined,
                    ...(continuationIndent > 0 ? {
                      marginLeft: `${continuationIndent * scale}px`,
                      width: `calc(100% - ${continuationIndent * scale}px)`,
                      boxSizing: 'border-box',
                    } : {}),
                    marginBottom: currentOverride.paragraphSpacingPt && index < paragraphs.length - 1
                      ? `${currentOverride.paragraphSpacingPt * scale}px` : 0,
                    fontSize: `${paragraphFontSize * scale}px`,
                    lineHeight: effectiveLineHeight,
                  }}
                >
                  {marker?.length ? <>
                    <span data-source-numbered-list-marker="true" style={{ minWidth: 0, whiteSpace: 'pre' }}>{renderSegments(marker)}</span>
                    <span data-source-numbered-list-body="true" style={{ display: 'block', minWidth: 0 }}>{renderSegments(body)}</span>
                  </> : body.length ? renderSegments(body) : <br />}
                </div>;
              })}
            </div>
          ) : flowedListParagraphs ? (
            <div data-source-bullet-flow="true">
              {flowedListParagraphs.map(({ paragraph, marker, indentPt, markerLineId, paragraphIndex }, flowIndex) => {
                const paragraphFontSize = paragraph.find(segment => segment.text.trim())?.size
                  ?? sourceBulletLines[0]?.spans.find(span => !span.renderOnlyStrokePass)?.size
                  ?? 10;
                const paragraphSpacingPt = flowIndex < flowedListParagraphs.length - 1
                  ? currentOverride.paragraphSpacingPt ?? 0
                  : 0;
                const paragraphStyle: React.CSSProperties = {
                  display: 'block',
                  fontSize: `${paragraphFontSize * scale}px`,
                  lineHeight: effectiveLineHeight,
                  marginBottom: `${paragraphSpacingPt * scale}px`,
                };
                return (
                  <React.Fragment key={markerLineId ? `source-bullet-${markerLineId}` : `flow-paragraph-${paragraphIndex}`}>
                    {flowIndex > 0 && <span aria-hidden="true" style={{ display: 'none' }}>{'\n'}</span>}
                    {marker && markerLineId ? (
                      <div
                        data-source-bullet-flow-row={markerLineId}
                        style={{
                          ...paragraphStyle,
                          display: 'grid',
                          marginLeft: `${(currentOverride.listMarkerIndentPt ?? 0) * scale}px`,
                          gridTemplateColumns: `${Math.max(0, (currentOverride.hangingIndentPt ?? indentPt) - (currentOverride.listMarkerIndentPt ?? 0)) * scale}px minmax(0, 1fr)`,
                          alignItems: 'start',
                          width: '100%',
                        }}
                      >
                        <span data-source-bullet-flow-marker={markerLineId} style={{ minWidth: 0, whiteSpace: 'pre' }}>
                          {renderSegments(marker)}
                        </span>
                        <span data-source-bullet-flow-body={markerLineId} style={{ display: 'block', minWidth: 0 }}>
                          {renderSegments(paragraph)}
                        </span>
                      </div>
                    ) : (
                      <div
                        data-source-bullet-flow-prose={inlineSourceBulletFlow ? 'true' : undefined}
                        style={{
                          ...paragraphStyle,
                          ...(block.flowParagraphIndentsPt?.[paragraphIndex]
                            ? {
                              marginLeft: `${block.flowParagraphIndentsPt[paragraphIndex] * scale}px`,
                              width: `calc(100% - ${block.flowParagraphIndentsPt[paragraphIndex] * scale}px)`,
                              boxSizing: 'border-box',
                            }
                            : {}),
                        }}
                      >
                        {paragraph.length ? renderSegments(paragraph) : <br />}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ) : currentOverride.paragraphSpacingPt && currentOverride.paragraphSpacingPt > 0
            ? splitSegmentsIntoParagraphs(sourceAwareSegments).map((paragraphSegments, paragraphIndex, paragraphs) => {
              const segmentOffset = paragraphs.slice(0, paragraphIndex).reduce((count, paragraph) => count + paragraph.length, 0);
              return (
                <div
                  key={`paragraph-${paragraphIndex}`}
                  className="credit-paragraph"
                  style={{
                    display: 'block',
                    marginBottom: paragraphIndex < paragraphs.length - 1
                      ? `${currentOverride!.paragraphSpacingPt! * scale}px`
                      : 0,
                  }}
                >
                  {renderSegments(paragraphSegments, segmentOffset)}
                </div>
              );
            })
            : renderSegments(sourceAwareSegments)}
        </div>
      </div>
    );
  }

  return (
    <div className={`block-container ${blockHoverClass} ${reviewBlockHighlightClass}`} style={blockStyle} onClick={handleBlockClick} {...geometryAttributes} data-editable-unit-key={editableNavigationKey}
      data-translation-review-highlight={reviewBlockHighlighted ? (proposalReviewHighlightKey ?? blockKey) : undefined}
      data-proof-block-id={pageNumber === 14 && (block.id === 'block_16' || block.id === 'block_17') ? block.id : undefined}>
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
            proposalReviewHighlightKey={proposalReviewHighlightKey}
            onInlineSpanClick={state => onBlockClick(state.info)}
          />
        );

        return isFixedLine ? (
          <div
            key={`static-${lineId}`}
            className="static-editor-line"
            data-list-marker-line={markerIndexes.has(lIdx) ? line.id : undefined}
            data-source-line-x={line.bbox[0]}
            data-source-line-available-x={(line as any).availableX}
            data-source-line-available-width={(line as any).availableWidth}
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
  blockRendererKey: string;
  units: CreditUnitDefinition[];
  pageNumber: number;
  scale: number;
  isAdmin: boolean;
  onBlockClick: (info: SelectedSpanInfo) => void;
  selectedBlockKey: string | null;
  overrides: Map<string, SpanOverride>;
  draftOverride: SpanOverride | null;
  language: 'en' | 'pt-BR';
  proposalReviewHighlightKey?: string | null;
  diagnosticBlankKeys?: ReadonlySet<string>;
}

const CreditUnitBlock: React.FC<CreditUnitBlockProps> = ({
  block, blockRendererKey, units, pageNumber, scale, isAdmin, onBlockClick, selectedBlockKey,
  overrides, draftOverride, language, proposalReviewHighlightKey, diagnosticBlankKeys,
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

  const reviewBlockHighlighted = proposalReviewHighlightKey === blockRendererKey;
  const reviewBlockHighlightClass = reviewBlockHighlighted ? 'proposal-review-highlight' : '';

  return (
    <div className={`block-container ${reviewBlockHighlightClass}`} style={blockStyle}
      data-translation-review-highlight={reviewBlockHighlighted ? blockRendererKey : undefined}>
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
            proposalReviewHighlightKey={proposalReviewHighlightKey}
            override={override}
            language={language}
            diagnosticBlank={language === 'pt-BR' && !override && (diagnosticBlankKeys?.has(spanKey) ?? false)}
            onBlockClick={onBlockClick}
          />
        );
      }))}
    </div>
  );
};

interface TypographicUnitBlockProps {
  block: Block;
  blockRendererKey: string;
  nextComponentY?: number;
  pageHeightPt: number;
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
  proposalReviewHighlightKey?: string | null;
  proposalReviewDiagnosticBlankKeys?: ReadonlySet<string>;
}

function findNextSameColumnComponentY(
  blocks: Block[],
  layoutObstacles: [number, number, number, number][],
  block: Block,
): number | undefined {
  const frames = block.typographicUnits
    ?.filter(unit => !unit.fixedPosition)
    .map(unit => sourceLayoutFrameForField(unit.field, block)) ?? [];
  if (frames.length === 0) return undefined;
  const x0 = Math.min(...frames.map(frame => frame.x));
  const x1 = Math.max(...frames.map(layoutFrameRight));
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
  block, blockRendererKey, nextComponentY, pageHeightPt, units, pageNumber, scale, isAdmin, layoutMode, layoutUnitKey, layoutDraft,
  layoutFrames, inheritedLayoutFrames, onSelectLayoutFrame, onBlockClick, selectedBlockKey,
  overrides, draftOverride, language, proposalReviewHighlightKey,
  proposalReviewDiagnosticBlankKeys,
}) => {
  const [measuredUnitContentBoundsPt, setMeasuredUnitContentBoundsPt] = useState<Record<string, { topOffsetPt: number; bottomOffsetPt: number }>>({});
  const handleUnitMeasure = useCallback((unitId: string, boundsPx: { topPx: number; bottomPx: number } | null) => {
    if (!scale) return;
    setMeasuredUnitContentBoundsPt(current => {
      if (boundsPx === null) {
        if (!(unitId in current)) return current;
        const next = { ...current };
        delete next[unitId];
        return next;
      }
      const boundsPt = {
        topOffsetPt: boundsPx.topPx / scale,
        bottomOffsetPt: boundsPx.bottomPx / scale,
      };
      const previous = current[unitId];
      return previous
        && Math.abs(previous.topOffsetPt - boundsPt.topOffsetPt) < 0.05
        && Math.abs(previous.bottomOffsetPt - boundsPt.bottomOffsetPt) < 0.05
        ? current
        : { ...current, [unitId]: boundsPt };
    });
  }, [scale]);
  // A semantic field owns its complete source lines, whatever its editorial
  // subtype. Nested same-font span targets may render legacy overrides, but
  // must not intercept clicks intended to open the whole heading/body field.
  const editorialLineIds = new Set(units.flatMap(unit => unit.field.lineIds));
  const inlineSpanStates = exposesNestedSpanTargets(block) ? buildInlineSpanStates(
    block, pageNumber, selectedBlockKey, overrides, draftOverride, language, editorialLineIds,
    layoutFrames, proposalReviewDiagnosticBlankKeys,
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
  const reviewBlockHighlighted = proposalReviewHighlightKey === blockRendererKey;
  const reviewBlockHighlightClass = reviewBlockHighlighted ? 'proposal-review-highlight' : '';
  const fixedLineIndexes = fixedEditorLineIndexes(block);
  // Every editorial unit paints its source lines when it has no override and
  // paints translated segments when it does. Keep those lines out of the
  // fixed-source layer in both cases; otherwise untranslated EN is painted
  // twice whenever fixed indexes overlap unit-owned lines. A standalone
  // Source markers remain at their PDF positions when the proposal omits them.
  // When a proposal includes list markers, its markers flow with the translated
  // paragraphs and the extracted source marker rows are suppressed.
  const preservedSourceMarkerLineIds = new Set<string>();
  if (language === 'pt-BR') {
    for (const unit of units) {
      const spanKey = `page_${pageNumber}_unit_${unit.id}__pt-BR`;
      if (proposalReviewDiagnosticBlankKeys?.has(spanKey)) continue;
      const override = selectedBlockKey === spanKey && draftOverride
        ? draftOverride
        : overrides.get(spanKey);
      if (!override) continue;
      const markerLines = unit.field.lineIds
        .map(lineId => block.lines?.find(line => line.id === lineId))
        .filter((line): line is LineData => line !== undefined && isStandaloneSourceBulletLine(line));
      const candidateHasBulletLines = countLeadingBulletParagraphs(override.segments) > 0;
      if (candidateHasBulletLines || !override.segments.some(segment => segment.symbolId || segment.text.trim())) continue;
      for (const line of markerLines) preservedSourceMarkerLineIds.add(line.id);
    }
  }
  const fixedSourceLines = (block.lines ?? []).filter((line, index) =>
    (fixedLineIndexes.has(index) && !editorialLineIds.has(line.id))
      || preservedSourceMarkerLineIds.has(line.id),
  );
  const untouchedSourceUnits = language === 'en' && !isAdmin && units.every(unit => {
    const spanKey = `page_${pageNumber}_unit_${unit.id}__${language}`;
    return !overrides.has(spanKey) && !(selectedBlockKey === spanKey && draftOverride !== null);
  });
  if (untouchedSourceUnits && hasExactSourceGeometry(block)) {
    return (
      <div className={`block-container ${reviewBlockHighlightClass}`} data-render-mode="sourceGeometry" style={blockStyle}
        data-translation-review-highlight={reviewBlockHighlighted ? proposalReviewHighlightKey : undefined}>
        <SourceGeometryBlock block={block} scale={scale} blockOriginX={blockX} blockOriginY={blockY} />
      </div>
    );
  }
  const flowUnits = units.filter(unit => !unit.fixedPosition);
  const frameForUnit = (unit: TypographicUnitDefinition): LayoutFrame | undefined => {
    const key = typographicUnitFrameKey(pageNumber, unit);
    const spanKey = `${key}__${language}`;
    const override = selectedBlockKey === spanKey && draftOverride ? draftOverride : overrides.get(spanKey) ?? null;
    const sourceMarkerCount = unit.field.lineIds
      .map(lineId => block.lines?.find(line => line.id === lineId))
      .filter((line): line is LineData => line !== undefined && isStandaloneSourceBulletLine(line)).length;
    const includeLeadingBulletsInFlow = language === 'pt-BR'
      && sourceMarkerCount > 0
      && !!override
      && countLeadingBulletParagraphs(override.segments) > 0;
    const preserveStoredRotation = language === 'pt-BR' && !!override && (unit.field.frame?.rotation ?? 0) !== 0;
    const sourceFrame = sourceLayoutFrameForField(unit.field, block, includeLeadingBulletsInFlow, preserveStoredRotation);
    const base = block.layoutFrame
      ? {
          ...sourceFrame,
          x: block.layoutFrame.x ?? sourceFrame.x,
          total: layoutFrameTotal(block.layoutFrame),
          width: block.layoutFrame.x + layoutFrameTotal(block.layoutFrame),
          textAlign: block.layoutFrame.textAlign ?? sourceFrame.textAlign,
        }
      : undefined;
    return layoutMode && layoutUnitKey === key && layoutDraft
      ? layoutDraft
      : layoutFrames.get(key) ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(key) : undefined) ?? base;
  };
  const flowPlan = calculateTypographicFlowPlan(
    flowUnits.map(unit => ({
      id: unit.id,
      sourceTopPt: unit.field.bbox[1],
      sourceBottomPt: unit.field.bbox[3],
      frameTopPt: frameForUnit(unit)?.y ?? unit.field.bbox[1],
    })),
    measuredUnitContentBoundsPt,
  );
  const flowBoundaryY = Math.min(nextComponentY ?? pageHeightPt, pageHeightPt);
  const reflowOverflowUnits = new Set(flowUnits.filter(unit => {
    const offsetPt = flowPlan.offsetsByUnitId.get(unit.id) ?? 0;
    const contentBoundsPt = measuredUnitContentBoundsPt[unit.id];
    if (contentBoundsPt === undefined && offsetPt === 0) return false;
    const sourceHeightPt = Math.max(0, unit.field.bbox[3] - unit.field.bbox[1]);
    const contentBottomOffsetPt = contentBoundsPt?.bottomOffsetPt ?? sourceHeightPt;
    const frameTopPt = frameForUnit(unit)?.y ?? unit.field.bbox[1];
    return frameTopPt + offsetPt + contentBottomOffsetPt > flowBoundaryY + 0.5;
  }).map(unit => unit.id));
  const flowOffsetFor = (unit: TypographicUnitDefinition | undefined): number =>
    unit ? flowPlan.offsetsByUnitId.get(unit.id) ?? 0 : 0;

  return (
    <div
      className={`block-container ${reviewBlockHighlightClass}`}
      style={blockStyle}
      data-translation-review-highlight={reviewBlockHighlighted ? proposalReviewHighlightKey : undefined}
      data-reflow-overflow-pt={reflowOverflowUnits.size ? Math.max(...flowUnits
        .filter(unit => reflowOverflowUnits.has(unit.id))
        .map(unit => {
          const frameTopPt = frameForUnit(unit)?.y ?? unit.field.bbox[1];
          const sourceHeightPt = Math.max(0, unit.field.bbox[3] - unit.field.bbox[1]);
          const contentBottomOffsetPt = measuredUnitContentBoundsPt[unit.id]?.bottomOffsetPt ?? sourceHeightPt;
          return frameTopPt + flowOffsetFor(unit) + contentBottomOffsetPt - flowBoundaryY;
        })) : undefined}
    >
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
        if (language === 'pt-BR' && proposalReviewDiagnosticBlankKeys?.has(spanKey)) return null;
        const frameKey = typographicUnitFrameKey(pageNumber, unit);
        const override = selectedBlockKey === spanKey && draftOverride
          ? draftOverride
          : overrides.get(spanKey) || null;
        const sourceMarkerLines = unit.field.lineIds
          .map(lineId => block.lines?.find(line => line.id === lineId))
          .filter((line): line is LineData => line !== undefined && isStandaloneSourceBulletLine(line));
        const includeLeadingBulletsInFlow = language === 'pt-BR'
          && sourceMarkerLines.length > 0
          && !!override
          && countLeadingBulletParagraphs(override.segments) > 0;
        const preserveStoredRotation = language === 'pt-BR' && !!override && (unit.field.frame?.rotation ?? 0) !== 0;
        const sourceFrame = sourceLayoutFrameForField(unit.field, block, includeLeadingBulletsInFlow, preserveStoredRotation);
        const baseFrame = block.layoutFrame
          ? {
              ...sourceFrame,
              x: block.layoutFrame.x ?? sourceFrame.x,
              total: layoutFrameTotal(block.layoutFrame),
              width: block.layoutFrame.x + layoutFrameTotal(block.layoutFrame),
              textAlign: block.layoutFrame.textAlign ?? sourceFrame.textAlign,
            }
          : sourceFrame;
        const frameForSelection = frameForUnit(unit) ?? baseFrame;
        const frameOverride = layoutMode && layoutUnitKey === frameKey && layoutDraft
          ? layoutDraft
          : layoutFrames.get(frameKey) ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(frameKey) : undefined) ?? baseFrame;
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
            proposalReviewHighlightKey={proposalReviewHighlightKey}
            override={override}
            flowOverflow={reflowOverflowUnits.has(unit.id)}
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
            paragraphSpacingPt={unit.paragraphSpacingPt ?? frameOverride?.paragraphSpacingPt ?? frameForSelection?.paragraphSpacingPt ?? unit.field.paragraphSpacingPt}
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
  proposalReviewHighlightKey?: string | null;
  override: SpanOverride | null;
  diagnosticBlank?: boolean;
  flowOverflow?: boolean;
  language: 'en' | 'pt-BR';
  unitKind?: TypographicUnitDefinition['kind'];
  unitLabel?: string;
  paragraphSpacingPt?: number;
  nextFieldY?: number;
  topOffsetPt?: number;
  layoutMode?: boolean;
  layoutUnitKey?: string;
  layoutFrameForSelection?: LayoutFrame;
  layoutFrameOverride?: LayoutFrame;
  onSelectLayoutFrame?: (unitKey: string, initialFrame: LayoutFrame) => void;
  onPreviewMeasure?: (boundsPx: { topPx: number; bottomPx: number } | null) => void;
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

function isStandaloneSourceBulletLine(line: LineData): boolean {
  if (line.rasterizedDuplicate) return false;
  return line.spans
    .filter(span => !span.renderOnlyStrokePass)
    .map(span => span.text)
    .join('')
    .trim() === '•';
}

function countLeadingBulletParagraphs(segments: SpanOverride['segments']): number {
  return splitSegmentsIntoParagraphs(segments).filter(paragraph =>
    /^•(?:[\s\t]|$)/u.test(paragraph.map(segment => segment.text).join('').trimStart()),
  ).length;
}

function removeLeadingBulletParagraphPrefix(segments: SpanOverride['segments']): SpanOverride['segments'] {
  const prefix = segments.map(segment => segment.text).join('').match(/^\s*•[ \t]*/u)?.[0];
  if (!prefix) return segments;
  let remaining = prefix.length;
  return segments.map(segment => {
    if (remaining <= 0) return segment;
    const removed = Math.min(remaining, segment.text.length);
    remaining -= removed;
    return { ...segment, text: segment.text.slice(removed) };
  });
}

function sliceSegmentsByTextRange(segments: SpanOverride['segments'], start: number, end: number): SpanOverride['segments'] {
  const result: SpanOverride['segments'] = [];
  let offset = 0;
  for (const segment of segments) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    const from = Math.max(start, segmentStart);
    const to = Math.min(end, segmentEnd);
    if (from < to) result.push({ ...segment, text: segment.text.slice(from - segmentStart, to - segmentStart) });
    offset = segmentEnd;
  }
  return result;
}

function splitLeadingNumberedListMarker(segments: SpanOverride['segments']): { marker: SpanOverride['segments']; body: SpanOverride['segments'] } | null {
  const text = segments.map(segment => segment.text).join('');
  // Numbered and lettered substeps can share the same inline marker/body
  // shape. Keep this flow opt-in through source or override indents so prose
  // such as "A. ..." is never restructured without measured list geometry.
  const match = text.match(/^(\s*)((?:\d{1,2}|[a-z])[.)])(?:[\t ]*)/iu);
  if (!match) return null;
  const markerStart = match[1].length;
  const markerEnd = markerStart + match[2].length;
  return {
    marker: sliceSegmentsByTextRange(segments, markerStart, markerEnd),
    body: sliceSegmentsByTextRange(segments, match[0].length, text.length),
  };
}

function sourceBulletRenderSegments(line: LineData): SpanOverride['segments'] {
  const sourceSegments = sourceSegmentsFromSpans(line.spans.filter(span => !span.renderOnlyStrokePass));
  const marker = sourceSegments.find(segment => segment.text.includes('•'));
  if (marker) return [{ ...marker, text: '•' }];
  if (line.listMarkerGlyphOverride === '•') {
    const sourceStyle = sourceSegments[0] ?? { text: '', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' };
    return [{ ...sourceStyle, text: '•' }];
  }
  return [];
}

function sourceListMarkerIndentPt(markerLine: LineData, sourceLines: LineData[]): number {
  const markerBaseline = markerLine.spans.find(span => span.origin)?.origin?.[1];
  // availableX describes the source frame and can include unrelated ink such
  // as a page folio. The hanging gap starts at the printed marker itself.
  const markerX = markerLine.bbox[0];
  const baselineTextStarts = sourceLines
    .filter(line => line !== markerLine)
    .flatMap(line => line.spans
      .filter(span => span.text.trim() && (markerBaseline === undefined
        || span.origin === undefined
        || Math.abs(span.origin[1] - markerBaseline) <= 0.75))
      .map(span => span.origin?.[0] ?? span.bbox[0]))
    .filter(x => Number.isFinite(x) && x > markerX + 2);
  const indent = baselineTextStarts.length ? Math.min(...baselineTextStarts) - markerX : 18;
  return Math.max(1, indent);
}

function sourceListIndentValues(lines: LineData[], listFlowItem = false): Pick<SelectedSpanInfo, 'listMarkerIndentPt' | 'hangingIndentPt'> {
  if (listFlowItem && lines.length) {
    const frameX = Math.min(...lines.map(line => line.availableX ?? line.bbox[0]));
    const bodyXs = lines.flatMap(line => line.spans
      .filter(span => !span.renderOnlyStrokePass && span.text.trim())
      .map(span => span.origin?.[0] ?? span.bbox[0]).filter(Number.isFinite));
    if (!bodyXs.length || !Number.isFinite(frameX)) return {};
    const bodyX = Math.min(...bodyXs);
    return { listMarkerIndentPt: 0, hangingIndentPt: Math.max(0, bodyX - frameX) };
  }
  const markerLine = lines.find(line => {
    const text = sourceLineText(line).trim();
    return listMarkerGlyph(line) !== null || /^\d+[.)]$/u.test(text);
  });
  if (!markerLine) return {};
  const frameX = Math.min(...lines.map(line => line.availableX ?? line.bbox[0]));
  const markerX = markerLine.availableX ?? markerLine.bbox[0];
  const markerIndentPt = Math.max(0, markerX - frameX);
  return { listMarkerIndentPt: markerIndentPt, hangingIndentPt: markerIndentPt + sourceListMarkerIndentPt(markerLine, lines) };
}

const CreditField: React.FC<CreditFieldProps> = ({
  block, field, spanKey, scale, isAdmin, selected, proposalReviewHighlightKey, override, diagnosticBlank = false, flowOverflow = false, language, nextFieldY,
  unitKind, unitLabel, paragraphSpacingPt, topOffsetPt = 0, layoutMode = false, layoutUnitKey, layoutFrameForSelection,
  layoutFrameOverride, onSelectLayoutFrame, onPreviewMeasure, inlineSpanStates, onInlineSpanClick, onBlockClick,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const blockX = block.bbox[0];
  const blockY = block.bbox[1];
  const sourceFieldFrame = field.frame ? canonicalizeLayoutFrame(field.frame) : sourceLayoutFrameForField(field, block);
  const activeFrame = layoutFrameOverride ?? (layoutMode ? layoutFrameForSelection : undefined);
  const effectiveParagraphSpacingPt = paragraphSpacingPt
    ?? activeFrame?.paragraphSpacingPt
    ?? field.paragraphSpacingPt
    ?? sourceFieldFrame.paragraphSpacingPt
    ?? (spanKey.split('__')[0] === 'page_9_unit_p9-block-34-remaining-size-10pt' ? 2.81 : undefined);
  const translatedSourceRotation = language === 'pt-BR' && override !== null
    && (sourceFieldFrame.rotation ?? 0) !== 0;
  // A vertical PDF line has a tall source ink box but its translated text is
  // laid out horizontally, then rotated into that same visual box. Keep the
  // English source on its existing line-direction renderer and only use this
  // derived frame for a translated override.
  const rotatedSourceFrame = (sourceFieldFrame.rotation ?? 0) !== 0;
  const fieldX = activeFrame?.x ?? (rotatedSourceFrame && !translatedSourceRotation ? field.bbox[0] : sourceFieldFrame.x);
  const fieldY = activeFrame?.y ?? (translatedSourceRotation ? sourceFieldFrame.y ?? field.bbox[1] : field.bbox[1]);
  const effectiveFieldY = fieldY + topOffsetPt;
  const fieldHeight = activeFrame ? layoutFrameTotalHeight(activeFrame) : (translatedSourceRotation
    ? layoutFrameTotalHeight(sourceFieldFrame) || (field.bbox[3] - field.bbox[1])
    : rotatedSourceFrame ? field.bbox[3] - field.bbox[1] : layoutFrameTotalHeight(sourceFieldFrame) || (field.bbox[3] - field.bbox[1]));
  const fieldWidth = activeFrame ? layoutFrameTotal(activeFrame) : (rotatedSourceFrame && !translatedSourceRotation
    ? field.bbox[2] - field.bbox[0]
    : layoutFrameTotal(sourceFieldFrame));
  const fieldRotation = activeFrame?.rotation ?? (translatedSourceRotation ? sourceFieldFrame.rotation : undefined);
  const neighborHeight = nextFieldY !== undefined && nextFieldY > effectiveFieldY
    ? nextFieldY - effectiveFieldY
    : fieldHeight;
  const fieldStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(fieldX - blockX) * scale}px`,
    top: `${(fieldY - blockY + topOffsetPt) * scale}px`,
    width: `${fieldWidth * scale}px`,
    minHeight: `${fieldHeight * scale}px`,
    ...(fieldRotation ? {
      transform: `rotate(${fieldRotation}deg)`,
      transformOrigin: 'center center',
    } : {}),
  };
  const geometryAttributes = adminGeometryAttributes(isAdmin, layoutMode && layoutUnitKey ? layoutUnitKey : spanKey, {
    x: fieldX,
    y: effectiveFieldY,
    width: fieldWidth,
    height: fieldHeight,
    rotation: fieldRotation ?? 0,
  });

  useEffect(() => {
    const preview = previewRef.current;
    if (override && preview) {
      // A unit can fit its own ink bbox and still run into the next typography unit.
      const previewRect = preview.getBoundingClientRect();
      const contentRects: DOMRect[] = [];
      const contentRange = document.createRange();
      contentRange.selectNodeContents(preview);
      for (const rect of Array.from(contentRange.getClientRects())) {
        if (rect.width > 0 && rect.height > 0) contentRects.push(rect);
      }
      for (const element of Array.from(preview.querySelectorAll('[data-source-inline-semantic], [data-source-inline-placeholder], svg[data-symbol-id], img'))) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) contentRects.push(rect);
      }
      const contentBoundsPx = contentRects.length > 0
        ? {
            topPx: Math.min(...contentRects.map(rect => rect.top)) - previewRect.top,
            bottomPx: Math.max(...contentRects.map(rect => rect.bottom)) - previewRect.top,
          }
        : { topPx: 0, bottomPx: previewRect.height };
      // Keep the visible overflow indicator tied to the measured layout box.
      // Inline fragment rects may extend a fraction of a point across a source
      // baseline boundary, which is normal font ink overlap rather than copyfit.
      setIsOverflowing(previewRect.height > neighborHeight * scale + 1);
      onPreviewMeasure?.(contentBoundsPx);
    } else {
      setIsOverflowing(false);
      onPreviewMeasure?.(null);
    }
  }, [onPreviewMeasure, override, neighborHeight, scale]);

  const lines = (block.lines || []).filter(line => field.lineIds.includes(line.id));
  const sourceBulletLines = language === 'pt-BR' ? lines.filter(isStandaloneSourceBulletLine) : [];
  const inlineSourceBulletFlow = override !== null
    && sourceBulletLines.length > 0
    && countLeadingBulletParagraphs(override.segments) > 0;
  const sourceListIndents = sourceListIndentValues(lines, block.listFlowItem);
  const numberedParagraphs = override ? splitSegmentsIntoParagraphs(override.segments).map((paragraph, paragraphIndex) => ({
    paragraphIndex,
    ...(splitLeadingNumberedListMarker(paragraph) ?? { marker: null, body: paragraph }),
  })) : [];
  const useNumberedListFlow = !!override && !inlineSourceBulletFlow
    && numberedParagraphs.some(paragraph => paragraph.marker !== null)
    && (sourceListIndents.hangingIndentPt !== undefined
      || override.listMarkerIndentPt !== undefined
      || override.hangingIndentPt !== undefined);
  let flowedBulletIndex = 0;
  const flowedListParagraphs = inlineSourceBulletFlow
    ? splitSegmentsIntoParagraphs(override.segments).map(paragraph => {
        const text = paragraph.map(segment => segment.text).join('').trimStart();
        if (!/^•(?:[\s\t]|$)/u.test(text)) return { segments: paragraph, marker: null, indentPt: 0 };
        const sourceMarker = sourceBulletLines[flowedBulletIndex++];
        if (!sourceMarker) return { segments: paragraph, marker: null, indentPt: 0 };
        return {
          segments: removeLeadingBulletParagraphPrefix(paragraph),
          marker: sourceBulletRenderSegments(sourceMarker),
          indentPt: sourceListMarkerIndentPt(sourceMarker, lines),
        };
      })
    : null;
  const leadingContentOffsetPt = sourceLeadingContentOffsetPt(lines[0]);
  const sourceClass = isAdmin ? (layoutMode ? 'layout-frame-selectable' : 'credit-edit-field') : '';
  const selectedClass = selected ? 'credit-field-selected' : '';
  const reviewHighlightClass = proposalReviewHighlightKey === spanKey ? 'proposal-review-highlight' : '';
  const overflowClass = isAdmin && (isOverflowing || flowOverflow) ? 'block-overflow' : '';

  if (diagnosticBlank && language === 'pt-BR' && !override) {
    return <div
      className={`credit-field translation-review-diagnostic-blank ${reviewHighlightClass}`}
      style={fieldStyle}
      data-translation-review-diagnostic-blank={spanKey}
      aria-label="Unidade vazia na exportação diagnóstica; a tradução não está persistida."
      {...geometryAttributes}
    />;
  }

  // Untouched English source has exact PDF run origins available for some
  // editorial fields even when adjacent marker/furniture lines do not. Paint
  // only this field's lines at their extracted source coordinates, preserving
  // its independent editor hit target and leaving PT-BR on translated flow.
  const sourceFieldBlock: Block = {
    ...block,
    bbox: [fieldX, fieldY, fieldX + fieldWidth, fieldY + fieldHeight],
    lines,
  };
  const sourceFieldSegments = sourceSegmentsFromSpans(lines.flatMap(line => line.spans));
  const sourceEquivalentOverride = override !== null && overrideIsSourceEquivalent(override, sourceFieldSegments, {
    textAlign: sourceFieldFrame.textAlign ?? block.layoutFrame?.textAlign ?? 'left',
    lineHeight: sourceFieldFrame.lineHeight ?? block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
  });
  const overridePreservesSourceLines = override !== null
    && sourceEquivalentOverride
    && overridePreservesSourceLineContent(override, sourceFieldSegments);
  const useSourceLines = !override || (language === 'en' && overridePreservesSourceLines);
  const handleClick = (event: React.MouseEvent) => {
    if (!isAdmin) return;
    event.stopPropagation();
    if (layoutMode && layoutUnitKey && layoutFrameForSelection) {
      onSelectLayoutFrame?.(layoutUnitKey, layoutFrameForSelection);
      return;
    }
    onBlockClick(extractCreditFieldInfo(spanKey, block, field, unitKind, unitLabel));
  };

  if (language === 'en' && useSourceLines
    && hasExactSourceGeometry(sourceFieldBlock)) {
    return (
      <div
        className={`credit-field ${sourceClass} ${selectedClass} ${overflowClass} ${reviewHighlightClass}`}
        style={fieldStyle}
        data-translation-review-highlight={reviewHighlightClass ? spanKey : undefined}
        onClick={handleClick}
        data-editable-unit-key={isAdmin && !layoutMode && fieldContainsEditableText(block, field) ? spanKey : undefined}
        {...geometryAttributes}
      >
        <SourceGeometryBlock block={sourceFieldBlock} scale={scale} blockOriginX={fieldX} blockOriginY={fieldY} />
      </div>
    );
  }

  return (
    <div
      className={`credit-field ${sourceClass} ${selectedClass} ${overflowClass} ${reviewHighlightClass}`}
      style={{ ...fieldStyle, cursor: layoutMode ? 'crosshair' : undefined }}
      data-translation-review-highlight={reviewHighlightClass ? spanKey : undefined}
      onClick={handleClick}
      data-editable-unit-key={isAdmin && !layoutMode && fieldContainsEditableText(block, field) ? spanKey : undefined}
      {...geometryAttributes}
    >
      {!useSourceLines ? (
        <div
          ref={previewRef}
          className="realbox"
          data-rendered-translation-key={override ? spanKey : undefined}
          style={{
            position: 'relative',
            width: '100%',
            whiteSpace: 'pre-wrap',
            textAlign: override.textAlign ?? activeFrame?.textAlign ?? sourceFieldFrame.textAlign ?? 'left',
            lineHeight: override.lineHeight ?? activeFrame?.lineHeight ?? sourceFieldFrame.lineHeight ?? block.defaultLineHeight ?? block.layoutFrame?.lineHeight ?? 1,
            display: 'block',
            fontSize: 0,
            // Only translated segments omit the source newline-only run. Keep
            // its measured first-ink offset here; the EN line renderer still
            // has the run and must not receive the same offset a second time.
            paddingTop: `${leadingContentOffsetPt * scale}px`,
          }}
        >
          {flowedListParagraphs ? (
            flowedListParagraphs.map((paragraph, parIdx, arr) => (
              <div
                key={parIdx}
                className="credit-paragraph"
                style={{
                  display: paragraph.marker ? 'grid' : 'block',
                  marginLeft: paragraph.marker ? `${(override?.listMarkerIndentPt ?? 0) * scale}px` : undefined,
                  gridTemplateColumns: paragraph.marker
                    ? `${Math.max(0, (override?.hangingIndentPt ?? paragraph.indentPt) - (override?.listMarkerIndentPt ?? 0)) * scale}px minmax(0, 1fr)`
                    : undefined,
                  alignItems: 'start',
                  marginBottom: effectiveParagraphSpacingPt && effectiveParagraphSpacingPt > 0 && parIdx < arr.length - 1
                    ? `${effectiveParagraphSpacingPt * scale}px`
                    : 0,
                }}
              >
                {paragraph.marker && (
                  <span style={{ gridColumn: 1, minWidth: 0 }}>
                    {renderCreditSegments(paragraph.marker, undefined, language, scale, isAdmin, 'pre-wrap', spanKey)}
                  </span>
                )}
                <span style={{ gridColumn: paragraph.marker ? 2 : 1, minWidth: 0 }}>
                  {renderCreditSegments(paragraph.segments, field.links, language, scale, isAdmin, 'pre-wrap', spanKey)}
                </span>
              </div>
            ))
          ) : useNumberedListFlow ? (
            numberedParagraphs.map(({ marker, body, paragraphIndex }, index, paragraphs) => {
              const markerIndent = override!.listMarkerIndentPt ?? sourceListIndents.listMarkerIndentPt ?? 0;
              const bodyIndent = override!.hangingIndentPt ?? sourceListIndents.hangingIndentPt ?? 18;
              const paragraphFontSize = (body.length ? body : marker ?? []).find(segment => segment.text.trim())?.size ?? 10;
              return <div
                key={`numbered-list-${paragraphIndex}`}
                data-source-numbered-list-row={paragraphIndex}
                style={{
                  display: marker?.length ? 'grid' : 'block',
                  gridTemplateColumns: marker?.length
                    ? `${Math.max(0, bodyIndent - markerIndent) * scale}px minmax(0, 1fr)` : undefined,
                  marginLeft: marker?.length ? `${markerIndent * scale}px` : undefined,
                  marginBottom: effectiveParagraphSpacingPt && index < paragraphs.length - 1
                    ? `${effectiveParagraphSpacingPt * scale}px` : 0,
                  fontSize: `${paragraphFontSize * scale}px`,
                  lineHeight: override!.lineHeight ?? activeFrame?.lineHeight ?? sourceFieldFrame.lineHeight ?? 1,
                }}
              >
                {marker?.length ? <>
                  <span data-source-numbered-list-marker="true" style={{ minWidth: 0, whiteSpace: 'pre' }}>
                    {renderCreditSegments(marker, undefined, language, scale, isAdmin, 'pre-wrap', spanKey)}
                  </span>
                  <span data-source-numbered-list-body="true" style={{ display: 'block', minWidth: 0 }}>
                    {renderCreditSegments(body, field.links, language, scale, isAdmin, 'pre-wrap', spanKey)}
                  </span>
                </> : body.length ? renderCreditSegments(body, field.links, language, scale, isAdmin, 'pre-wrap', spanKey) : <br />}
              </div>;
            })
          ) : effectiveParagraphSpacingPt && effectiveParagraphSpacingPt > 0 ? (
            splitSegmentsIntoParagraphs(override.segments).map((parSegments, parIdx, arr) => (
              <div
                key={parIdx}
                className="credit-paragraph"
                style={{
                  marginBottom: parIdx < arr.length - 1 ? `${effectiveParagraphSpacingPt * scale}px` : 0,
                }}
              >
                {renderCreditSegments(parSegments, field.links, language, scale, isAdmin, 'pre-wrap', spanKey)}
              </div>
            ))
          ) : (
            renderCreditSegments(override.segments, field.links, language, scale, isAdmin, 'pre-wrap', spanKey)
          )}
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
            proposalReviewHighlightKey={proposalReviewHighlightKey}
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
  proposalReviewHighlightKey?: string | null;
  onInlineSpanClick?: (state: InlineSpanUnitRenderState) => void;
}

const LineRenderer: React.FC<LineRendererProps> = ({ 
  line, scale, blockOriginX, blockOriginY, targetPage, 
  onNavigate, isAdmin, isSelected, language, override, onClick, inlineSpanStates, proposalReviewHighlightKey, onInlineSpanClick,
  coveredSourceSymbols,
}) => {
  const lineContainerRef = useRef<HTMLDivElement>(null);
  const [overflowingInlineUnitKeys, setOverflowingInlineUnitKeys] = useState<Set<string>>(() => new Set());
  // Some composite source illustrations (for example page 15's inset encounter
  // diagram) already contain these words in the background artwork. Keep the
  // extracted text available for Admin selection, but avoid painting it twice
  // in the English source view. A localized asset is still required before
  // translating text that is baked into that illustration.
  const rasterizedDuplicateLanguage = (line as any).rasterizedDuplicateLanguage as 'en' | 'pt-BR' | 'all' | undefined;
  const duplicateIsVisible = (line as any).rasterizedDuplicate
    && (!rasterizedDuplicateLanguage || rasterizedDuplicateLanguage === 'all' || rasterizedDuplicateLanguage === language);

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

  useEffect(() => {
    const lineElement = lineContainerRef.current;
    if (!isAdmin || !lineElement) {
      setOverflowingInlineUnitKeys(current => current.size ? new Set() : current);
      return;
    }

    const lineRect = lineElement.getBoundingClientRect();
    const nextOverflowingKeys = new Set<string>();
    const unitElements = Array.from(lineElement.querySelectorAll('[data-inline-unit-flow-key]')) as HTMLElement[];
    for (const unitElement of unitElements) {
      const key = unitElement.dataset.inlineUnitFlowKey;
      const sourceFlowBottomPt = Number(unitElement.dataset.inlineUnitFlowBottomPt);
      if (!key || !Number.isFinite(sourceFlowBottomPt)) continue;

      const contentRects: DOMRect[] = [];
      const contentRange = document.createRange();
      contentRange.selectNodeContents(unitElement);
      if (typeof contentRange.getClientRects === 'function') {
        contentRects.push(...Array.from(contentRange.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0));
      }
      const contents = Array.from(unitElement.querySelectorAll('svg, img, [data-source-inline-semantic], [data-source-inline-placeholder]')) as (HTMLElement | SVGElement)[];
      for (const content of contents) {
        const rect = content.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) contentRects.push(rect);
      }
      if (!contentRects.length) continue;

      const contentRight = Math.max(...contentRects.map(rect => rect.right));
      const contentBottom = Math.max(...contentRects.map(rect => rect.bottom));
      const sourceBoundaryY = lineRect.top
        + Math.max(0, sourceFlowBottomPt - (line.bbox[1] + (line.renderTopOffsetPt ?? 0))) * scale;
      if (contentRight > lineRect.right + 0.5 || contentBottom > sourceBoundaryY + 0.5) {
        nextOverflowingKeys.add(key);
      }
    }

    setOverflowingInlineUnitKeys(current => current.size === nextOverflowingKeys.size
      && [...current].every(key => nextOverflowingKeys.has(key)) ? current : nextOverflowingKeys);
  }, [isAdmin, inlineSpanStates, line.id, line.bbox[1], line.renderTopOffsetPt, scale]);

  if (duplicateIsVisible && !isAdmin) {
    return null;
  }

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
        ref={lineContainerRef}
        className={`realbox ${lineClassName}`}
        data-source-line-id={line.id}
        data-source-line-x={line.bbox[0]}
        data-source-line-available-x={(line as any).availableX}
        data-source-line-available-width={(line as any).availableWidth}
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
      ref={lineContainerRef}
      style={{...lineStyle, paddingLeft: `${textOffset}px`, boxSizing: 'border-box'}}
      onClick={handleClick}
      className={lineClassName}
      data-source-line-id={line.id}
      data-source-line-x={line.bbox[0]}
      data-source-line-available-x={(line as any).availableX}
      data-source-line-available-width={(line as any).availableWidth}
      data-ghost-status={confirmedGhostClass ? 'confirmed-duplicate' : undefined}
      title={ghostStatusLabel}
      aria-description={ghostStatusLabel}
    >
      {line.spans.map((span, si) => {
        if(span.sourceEditorOnly)return null;
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
          const inlineOverrideContainsSourceSymbol = !!inlineUnit?.override?.segments.some(segment =>
            (segment.symbolId ?? resolveLegacySymbol(segment.font, segment.text)?.id) === span.semanticSymbolId);
          const inlineOverrideManagesSourceSymbol = !!inlineUnit?.override
            && (inlineUnit.override.managedSourceSymbols?.includes(span.semanticSymbolId)
              || inlineOverrideContainsSourceSymbol);
          // Once a localized inline unit adopts this source symbol, the
          // translated segment owns its rendered position. Keep the source
          // glyph hidden so it cannot remain at the old PDF coordinates and
          // appear a second time beside the moved symbol.
          const renderSemanticSourceSymbol = renderSemanticSource
            && (!inlineUnit?.override || !inlineOverrideManagesSourceSymbol);
          const sourceSymbolMetrics = span.sourceSymbolMetrics
            ? { ...span.sourceSymbolMetrics, gapEm: undefined, trailingGapEm: undefined }
            : undefined;
          if (renderSemanticSourceSymbol && !override) {
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
              aria-hidden={renderSemanticSourceSymbol ? undefined : 'true'}
              data-source-inline-placeholder={renderSemanticSourceSymbol ? undefined : span.semanticSymbolId}
              data-source-inline-semantic={renderSemanticSourceSymbol ? span.semanticSymbolId : undefined}
              style={{
                flex: `0 0 ${sourceAdvanceWidth}px`,
                marginInlineStart: `${sourceAdvanceGap}px`,
                minWidth: 0,
                ...(renderSemanticSourceSymbol ? {} : { visibility: 'hidden' }),
                pointerEvents: 'none',
              }}
            >
              {renderSemanticSourceSymbol ? <SemanticSymbol id={span.semanticSymbolId} language={language}
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
          // English source text keeps native advances even when span origins
          // are unavailable and this line uses the source-line fallback.
          letterSpacing: !override || useSourceGeometry ? 'normal' : '-0.015em',
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
        const inlineUnitOwnsThisPaint = !!inlineUnit?.override
          && `${line.id}:${span.sourceSpanIndex ?? si}` === inlineUnit.renderAtRef;
        const sourceInlineUnitFlowMaxWidthPx = inlineUnitOwnsThisPaint
          ? Math.max(0, ((line.availableX ?? line.bbox[0])
            + (line.availableWidth ?? (line.bbox[2] - line.bbox[0]))
            - (span.origin?.[0] ?? span.bbox[0])) * scale)
          : undefined;
        const inlineUnitFlowMaxWidthPx = inlineUnitOwnsThisPaint
          ? inlineUnit?.flowFrame
            ? Math.max(0, layoutFrameTotal(inlineUnit.flowFrame) * scale)
            : sourceInlineUnitFlowMaxWidthPx
          : undefined;
        const inlineUnitOverflowed = inlineUnitOwnsThisPaint
          && overflowingInlineUnitKeys.has(inlineUnit!.spanKey);
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
                whiteSpace: inlineUnit?.override ? 'pre-wrap' : 'pre',
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
            className={[
              inlineUnitInteractive ? 'span-editable' : '',
              inlineUnit?.selected ? 'span-selected' : '',
              inlineUnit && proposalReviewHighlightKey && inlineUnit.spanKey === proposalReviewHighlightKey ? 'proposal-review-highlight' : '',
              inlineUnitOverflowed ? 'span-inline-overflow' : '',
            ].filter(Boolean).join(' ') || undefined}
            data-rendered-translation-key={inlineUnitOwnsThisPaint ? inlineUnit!.spanKey : undefined}
            data-editable-unit-key={inlineUnitInteractive && isAdmin && segmentsContainEditableText(inlineUnit?.info.sourceSegments)
              ? inlineUnit!.spanKey : undefined}
            data-inline-unit-flow-key={inlineUnitOwnsThisPaint ? inlineUnit!.spanKey : undefined}
            data-translation-review-highlight={inlineUnit && proposalReviewHighlightKey && inlineUnit.spanKey === proposalReviewHighlightKey ? inlineUnit.spanKey : undefined}
            data-inline-unit-flow-bottom-pt={inlineUnitOwnsThisPaint ? inlineUnit!.sourceFlowBottomPt : undefined}
            title={inlineUnitOverflowed ? 'O texto ultrapassa a margem ou invade o próximo item.' : undefined}
            style={{
              ...spanStyle,
              ...(inlineUnitOwnsThisPaint ? {
                display: 'inline-block',
                // Source glyph outlines (notably the IMPORTANT marker) must
                // not bleed into translated body segments. Rich segments set
                // their own stroke when the translation explicitly needs it.
                WebkitTextStroke: '0px transparent',
                // The first source span can be a narrow semantic glyph. Its
                // source advance must not constrain the translated unit to
                // the icon's width; use the remaining baseline flow width.
                flex: inlineUnit?.flowFrame
                  ? `0 0 ${inlineUnitFlowMaxWidthPx}px`
                  : `0 1 ${inlineUnitFlowMaxWidthPx}px`,
                boxSizing: 'border-box',
                whiteSpace: 'pre-wrap',
                minWidth: 0,
                width: `${inlineUnitFlowMaxWidthPx}px`,
                maxWidth: `${inlineUnitFlowMaxWidthPx}px`,
                ...(inlineUnit?.flowFrame ? {
                  position: 'relative',
                  left: `${(inlineUnit.flowFrame.x - (span.origin?.[0] ?? span.bbox[0])) * scale}px`,
                  textAlign: inlineUnit.flowFrame.textAlign ?? 'left',
                } : {}),
              } : {}),
              ...(inlineUnit?.diagnosticBlank && language === 'pt-BR'
                ? { visibility: 'hidden', pointerEvents: 'none' }
                : {}),
              ...(inlineUnitInteractive && isAdmin ? { cursor: 'text' } : {}),
            }}
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
