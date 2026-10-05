import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { RichSpanEditor, type Segment, type SpanOverride, type TextAlignment } from './RichSpanEditor';
import { AdminRuler } from './AdminRuler';
import { AdminLayoutFrameEditor } from './AdminLayoutFrameEditor';
import { deleteLayoutFrame, fetchLayoutFrames, loadLocalLayoutFrames, saveLayoutFrame, saveLocalLayoutFrames, type LayoutLanguage } from '../layoutFrames';
import { resolveLegacySymbol, type InlineEditorContext, type InlineSymbolMetrics } from '../symbols/semanticSymbols';
import { SemanticSymbol } from '../symbols/SemanticSymbol';
import { sourceSpanRuns } from '../symbols/sourceRuns';
import { decodeOverrideData, encodeOverrideData } from '../symbols/overrideData';
import { contentsRowKey, contentsRowUsesLegacy, contentsRowLine, contentsLabelWidth, type ContentsRowDefinition } from '../contentsRows';
import { ContentsRowFlow } from './ContentsRowFlow';
import { hasPreservedLegacySpanOverride } from '../editorUnitCompatibility';
import { sourceElementIsReplaced, sourceOverlayMask, previousSourceSpan, type SourceInlineElement } from '../symbols/sourceInlineElements';
import './PageRenderer.css';
import './Toast.css';

/* ─────────────────────────────────────────────
   Types – match the exact JSON DOM structure
   ───────────────────────────────────────────── */
export interface SpanData {
  /** Runtime inline symbol adapter; does not rewrite source extraction IDs. */
  semanticSymbolId?: string;
  sourceSymbolMetrics?: InlineSymbolMetrics;
  sourceSpanIndex?: number;
  text: string;
  font: string;
  size: number;
  color: string;
  flags: number;
  bbox: [number, number, number, number];
  origin?: [number, number];
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
  /** Language(s) in which the source-overlay replacement should hide this glyph. */
  renderSourceOverlayLanguage?: 'en' | 'pt-BR' | 'all';
  /** Recreate the PDF's outlined text effect on the semantic fill span. */
  renderTextStrokeWidthPt?: number;
  renderTextStrokeColor?: string;
}

export interface LineData {
  id: string;
  bbox: [number, number, number, number];
  renderTopOffsetPt?: number;
  /** Browser-only indentation when a filtered tiny leading glyph still occupies source advance. */
  renderTextOffsetPt?: number;
  /** Keep source PDF span advances/gaps in the English view for inline callout alignment. */
  renderSourceSpanGeometry?: boolean;
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
  /** Stable semantic editor key for newly split units; legacy blocks keep their index-based key. */
  editorKey?: string;
  /** Source line indexes that render as fixed page furniture and stay outside rich-text editing. */
  staticEditorLineIndexes?: number[];
  /** Keep source-furniture visible but unavailable to Admin editing. */
  adminReadOnly?: boolean;
  /** Keep translated content on one line inside this page-specific text frame. */
  noWrap?: boolean;
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
  info: SelectedSpanInfo;
}

function buildInlineSpanStates(
  block: Block,
  pageNumber: number,
  selectedBlockKey: string | null,
  overrides: Map<string, SpanOverride>,
  draftOverride: SpanOverride | null,
  language: 'en' | 'pt-BR',
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
    for (const spanRef of unit.spanRefs) states.set(spanRef, state);
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
      letterSpacing: '-0.015em',
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

function editableBlockLines(block: Block): LineData[] {
  const staticIndexes = staticEditorLineIndexes(block);
  return (block.lines ?? []).filter((_, index) => !staticIndexes.has(index));
}

function normalizeStaticEditorPrefix(block: Block, override: SpanOverride | null): SpanOverride | null {
  if (!override || !block.lines || !block.staticEditorLineIndexes?.length) return override;

  const fixedPrefix = block.staticEditorLineIndexes
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

function extractBlockInfo(blockKey: string, block: Block): SelectedSpanInfo {
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
    sourceSegments,
    singleLine: block.noWrap ?? false,
  };
}

function sourceSegmentsFromSpans(spans: SpanData[]): Segment[] {
  return sourceSpanRuns(spans,mapPdfFont);
}

/* ─────────────────────────────────────────────
   Overrides persistence (localStorage per language)
   ───────────────────────────────────────────── */
function getOverridesKey(lang: string) {
  return `middara-lines-v2-${lang}`;
}

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
    const response = await fetch(`http://localhost:3000/api/translations?${query}`);
    if (!response.ok) continue;
    const data = await response.json();
    if (data.docs?.length > 0) return data.docs[0];
  }
  return null;
}

async function fetchOverridesFromPayload(lang: string): Promise<Map<string, SpanOverride> | null> {
  try {
    const res = await fetch(`http://localhost:3000/api/translations?where[language][equals]=${lang}&limit=5000`);
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

async function saveOverrideToPayload(override: SpanOverride, lang: string): Promise<boolean> {
  try {
    const existing = await findPayloadTranslation(override.spanKey, lang);
    const storedSpanKey = payloadSpanKey(override.spanKey, lang);
    const data = encodeOverrideData(override);
    if (existing) {
      const id = existing.id;
      const res = await fetch(`http://localhost:3000/api/translations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, data })
      });
      return res.ok;
    } else {
      const res = await fetch(`http://localhost:3000/api/translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spanKey: storedSpanKey, language: lang, data })
      });
      return res.ok;
    }
  } catch {
    return false;
  }
}

async function deleteOverrideFromPayload(spanKey: string, lang: string): Promise<boolean> {
  try {
    const existing = await findPayloadTranslation(spanKey, lang);
    if (existing) {
      const id = existing.id;
      const res = await fetch(`http://localhost:3000/api/translations/${id}`, {
        method: 'DELETE'
      });
      return res.ok;
    }
    return true; // didn't exist anyway
  } catch {
    return false;
  }
}

function loadOverrides(lang: string): Map<string, SpanOverride> {
  try {
    const raw = localStorage.getItem(getOverridesKey(lang));
    if (raw) {
      const arr: SpanOverride[] = JSON.parse(raw);
      return new Map(arr.map(o => [o.spanKey, o]));
    }
  } catch {}
  return new Map();
}

function saveOverridesToStorage(lang: string, map: Map<string, SpanOverride>) {
  const arr = Array.from(map.values());
  try {
    localStorage.setItem(getOverridesKey(lang), JSON.stringify(arr));
    return true;
  } catch {
    return false;
  }
}

function extractCreditFieldInfo(
  spanKey: string,
  block: Block,
  field: CreditFieldDefinition,
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
    text,
    font,
    family: mapPdfFont(font).family,
    weight,
    style,
    color,
    size,
    bbox: field.bbox,
    textAlign: field.frame.textAlign || 'left',
    sourceSegments,
    editorContext: block.creditUnit || block.creditUnits?.length ? 'credit-field' : 'typographic-field',
  };
}

interface SelectedSpanInfo {
  spanKey: string;
  text: string;
  font: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  color: string;
  size: number;
  bbox: [number, number, number, number];
  textAlign: TextAlignment;
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
    lineHeight: block.layoutFrame?.lineHeight,
  };
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

function renderSegmentContent(segment: Segment, scale: number, language: 'en' | 'pt-BR'): React.ReactNode {
  const legacy = !segment.symbolId ? resolveLegacySymbol(segment.font,segment.text) : undefined;
  const id=segment.symbolId ?? legacy?.id;
  if (!id) return segment.text;
  return <>{Array.from(legacy ? '\uFFFC' : segment.text).map((_,index)=><SemanticSymbol key={index} id={id} language={language} size={segment.size*scale} color={segment.color} metrics={segment.symbolMetrics} />)}{legacy ? segment.text.match(/\s+$/)?.[0] : null}</>;
}

export const PageRenderer: React.FC<PageRendererProps> = ({ pageData, isAdmin, showRuler = false, layoutMode = false, onLayoutDirtyChange, zoomLevel = 1, onNavigate, language = 'en' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageElement, setPageElement] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [selectedSpan, setSelectedSpan] = useState<SelectedSpanInfo | null>(null);
  const [overrides, setOverrides] = useState<Map<string, SpanOverride>>(() => loadOverrides(language));
  const [overridesLoadedLanguage, setOverridesLoadedLanguage] = useState<string | null>(null);
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

  useEffect(() => {
    let active = true;
    fetchOverridesFromPayload(language).then((serverMap) => {
      if (!active) return;
      if (serverMap) {
        const merged = loadOverrides(language);
        serverMap.forEach((override, key) => merged.set(key, override));
        setOverrides(merged);
      } else {
        setOverrides(loadOverrides(language));
      }
      setOverridesLoadedLanguage(language);
    });
    return () => { active = false; };
  }, [language]);
  const overridesReady = overridesLoadedLanguage === language;
  const replacedInlineElements = (pageData.inlineElements ?? []).filter(element=>{
    const block=pageData.blocks.find(b=>b.id===element.anchor.blockId);
    return block && sourceElementIsReplaced(element,block,pageData.page_number,language,overrides,selectedSpan?.spanKey ?? null,draftOverride);
  });

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
    if (!layoutDirty) return;
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [layoutDirty]);

  const effectiveFrameFor = useCallback((unitKey: string, block: Block) => {
    return layoutFrames.get(unitKey)
      ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(unitKey) : undefined)
      ?? sourceLayoutFrame(block);
  }, [layoutFrames, inheritedLayoutFrames, language]);

  const selectLayoutFrame = useCallback((unitKey: string, initialFrame: LayoutFrame) => {
    if (layoutDirty && unitKey !== layoutUnitKey && !window.confirm('Há alterações de moldura não salvas. Descartar e selecionar outra?')) return;
    const block = pageData.blocks.find((candidate, index) => frameUnitKey(pageData.page_number, candidate, index) === unitKey);
    const saved = layoutFrames.get(unitKey)
      ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(unitKey) : undefined)
      ?? (block ? sourceLayoutFrame(block) : initialFrame);
    setLayoutUnitKey(unitKey);
    setLayoutDraft({ ...saved });
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(language === 'pt-BR' && !layoutFrames.has(unitKey) ? 'PT-BR herda a moldura EN até ser personalizada.' : null);
  }, [layoutDirty, layoutUnitKey, pageData.blocks, pageData.page_number, layoutFrames, inheritedLayoutFrames, language, onLayoutDirtyChange]);

  const changeLayoutDraft = useCallback((frame: LayoutFrame) => {
    setLayoutDraft(frame);
    setLayoutDirty(true);
    onLayoutDirtyChange?.(true);
    setLayoutStatus(null);
  }, [onLayoutDirtyChange]);

  const discardLayoutDraft = useCallback(() => {
    if (!layoutUnitKey) return;
    const block = pageData.blocks.find((candidate, index) => frameUnitKey(pageData.page_number, candidate, index) === layoutUnitKey);
    const saved = layoutFrames.get(layoutUnitKey)
      ?? (language === 'pt-BR' ? inheritedLayoutFrames.get(layoutUnitKey) : undefined)
      ?? (block ? sourceLayoutFrame(block) : null);
    setLayoutDraft(saved ? { ...saved } : null);
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus('Alterações descartadas.');
  }, [layoutUnitKey, pageData.blocks, pageData.page_number, layoutFrames, inheritedLayoutFrames, language, onLayoutDirtyChange]);

  const saveLayoutDraft = useCallback(async () => {
    if (!layoutUnitKey || !layoutDraft || !layoutDirty || isSavingLayout) return;
    setIsSavingLayout(true);
    const next = new Map(layoutFrames);
    next.set(layoutUnitKey, layoutDraft);
    setLayoutFrames(next);
    const savedLocally = saveLocalLayoutFrames(pageData.page_number, language, next);
    const savedRemotely = await saveLayoutFrame({ unitKey: layoutUnitKey, pageNumber: pageData.page_number, language, frame: layoutDraft });
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(savedRemotely ? 'Sincronizado com Payload.' : savedLocally ? 'Salvo neste navegador; não sincronizado com Payload.' : 'Falha ao salvar localmente e no servidor.');
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
    const inherited = inheritedLayoutFrames.get(layoutUnitKey)
      ?? pageData.blocks.flatMap((block, index) => frameUnitKey(pageData.page_number, block, index) === layoutUnitKey ? [sourceLayoutFrame(block)] : [])[0]
      ?? null;
    setLayoutDraft(inherited ? { ...inherited } : null);
    setLayoutDirty(false);
    onLayoutDirtyChange?.(false);
    setLayoutStatus(removedRemotely ? 'Moldura PT-BR removida; herdando EN.' : 'Herança aplicada neste navegador; remoção remota pendente.');
    setIsSavingLayout(false);
  }, [layoutUnitKey, language, layoutFrames, isSavingLayout, pageData.page_number, inheritedLayoutFrames, pageData.blocks, onLayoutDirtyChange]);

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
    const savedLocally = saveOverridesToStorage(language, nextMap);

    if (override) {
      const success = await saveOverrideToPayload(override, language);
      if (!success) {
        setToast({
          message: savedLocally
            ? "Rascunho salvo neste navegador; não sincronizado com o servidor."
            : "Falha ao salvar no navegador e no servidor.",
          type: savedLocally ? 'success' : 'error',
        });
        setTimeout(() => setToast(null), 5000);
      } else {
        setToast({ message: "Salvo no Payload", type: 'success' });
        setTimeout(() => setToast(null), 3000);
      }
    } else if (selectedSpan) {
      const deletedOnServer = await deleteOverrideFromPayload(selectedSpan.spanKey, language);
      setToast({
        message: deletedOnServer
          ? "Rascunho removido do Payload."
          : savedLocally
            ? "Rascunho removido deste navegador; servidor não sincronizado."
            : "Falha ao remover o rascunho.",
        type: deletedOnServer || savedLocally ? 'success' : 'error',
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

  const selectedLayoutBlockIndex = layoutUnitKey
    ? pageData.blocks.findIndex((block, index) => frameUnitKey(pageData.page_number, block, index) === layoutUnitKey)
    : -1;
  const selectedLayoutBlock = selectedLayoutBlockIndex >= 0 ? pageData.blocks[selectedLayoutBlockIndex] : null;
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
          if (block.hiddenFromPage) return null;
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
              layoutFrameForSelection={effectiveFrameFor(frameUnitKey(pageData.page_number, block, bIdx), block)}
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
        {replacedInlineElements.map(element=><img key={element.mask.url} src={element.mask.url} alt="" aria-hidden="true" draggable={false}
          style={{position:'absolute',left:element.mask.bbox[0]*scale,top:element.mask.bbox[1]*scale,width:(element.mask.bbox[2]-element.mask.bbox[0])*scale,height:(element.mask.bbox[3]-element.mask.bbox[1])*scale,zIndex:2,pointerEvents:'none'}} />)}
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
      {isAdmin && showRuler && <AdminRuler pageElement={pageElement} pageWidth={pageData.width} pageHeight={pageData.height} />}
      </div>

      {isAdmin && selectedSpan && (
        <RichSpanEditor
          spanKey={selectedSpan.spanKey}
          originalText={selectedSpan.text}
          originalFont={selectedSpan.font}
          originalSize={selectedSpan.size}
          originalColor={selectedSpan.color}
          originalWeight={selectedSpan.weight}
          originalStyle={selectedSpan.style}
          originalSegments={selectedSpan.sourceSegments}
          originalTextAlign={selectedSpan.textAlign}
          bbox={selectedSpan.bbox}
          pageNumber={pageData.page_number}
          language={language}
          onClose={handleCloseEditor}
          onSave={handleSaveOverride}
          onDraftChange={handleDraftChange}
          existingOverride={selectedExistingOverride}
          singleLine={selectedSpan.singleLine}
          editorContext={selectedSpan.editorContext ?? 'paragraph'}
        />
      )}
      {isAdmin && layoutMode && (
        <AdminLayoutFrameEditor
          pageElement={pageElement}
          pageWidth={pageData.width}
          unitKey={layoutUnitKey}
          sourceBbox={selectedLayoutBlock ? {
            x: selectedLayoutBlock.bbox[0],
            y: selectedLayoutBlock.bbox[1],
            width: selectedLayoutBlock.bbox[2] - selectedLayoutBlock.bbox[0],
            height: selectedLayoutBlock.bbox[3] - selectedLayoutBlock.bbox[1],
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
        {override ? <ContentsRowFlow row={row} scale={scale} isAdmin={isAdmin} text={override.segments.map(run => run.text).join('')}>
          {renderCreditSegments(override.segments.map(run => ({ ...run, text: run.text.replace(/[\r\n]+/g, ' ') })), undefined, language, scale, isAdmin, 'nowrap')}
        </ContentsRowFlow> : <div style={{ pointerEvents: 'none' }}><LineRenderer line={line} scale={scale} blockOriginX={x} blockOriginY={y}
          isAdmin={false} isSelected={false} language={language} onClick={() => {}} /></div>}
      </div>
    </React.Fragment>;
  })}</>;
}

interface SpanBlockProps {
  block: Block;
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
  block, allBlocks, layoutObstacles, blockIdx, pageNumber, scale, isAdmin, contentsMap,
  onNavigate, onBlockClick, layoutMode, layoutUnitKey, layoutFrameForSelection, layoutFrameOverride, onSelectLayoutFrame,
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
  const translatedHeight = translatedFrame?.height ?? blockH;
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
  if (typographicUnits.length > 0 && overridesReady && !overrides.has(blockKey) && !preserveSpanOverride) {
    return (
      <TypographicUnitBlock
        block={block}
        nextComponentY={findNextSameColumnComponentY(allBlocks, layoutObstacles, block)}
        units={typographicUnits}
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

  const inlineSpanStates = buildInlineSpanStates(
    block, pageNumber, selectedBlockKey, overrides, draftOverride, language,
  );

  const blockCanEdit = isAdmin && !layoutMode && !block.adminReadOnly;
  const blockCanSelectLayout = isAdmin && layoutMode && !block.adminReadOnly && !block.staticEditorLineIndexes?.length && !block.typographicUnits?.length && !block.creditUnits?.length && !block.creditUnit;
  const blockHoverClass = blockCanSelectLayout
    ? 'layout-frame-selectable'
    : blockCanEdit ? `block-editable ${selectedBlockKey === blockKey ? 'block-selected' : ''}` : '';
  const handleBlockClick = () => {
    if (blockCanSelectLayout) onSelectLayoutFrame(layoutUnitKey, layoutFrameForSelection);
    else if (blockCanEdit) onBlockClick(extractBlockInfo(blockKey, block));
  };
  const overflowClass = isAdmin && isOverflowing ? 'block-overflow' : '';
  const fixedLineIndexes = staticEditorLineIndexes(block);
  const esmeraldaHeadingSource = block.lines
    ?.flatMap(line => line.spans)
    .find(span => needsEsmeraldaHeadingDrop(span.font, span.size, span.bbox[3] - span.bbox[1]));

  if (currentOverride) {
    // Use a translation frame when supplied; otherwise keep the source-derived fallback.
    const fixedLineIndexes = staticEditorLineIndexes(block);
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
            lineHeight: layoutFrameOverride?.lineHeight ?? block.layoutFrame?.lineHeight ?? 1,
            display: 'block',
            fontSize: 0,
            cursor: layoutMode ? 'move' : isAdmin ? 'text' : 'default',
          }}
        >
          {currentOverride.segments.map((seg, segIdx) => (
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
                letterSpacing: '-0.015em',
                ...(esmeraldaHeadingSource && needsEsmeraldaHeadingDrop(
                  seg.font,
                  seg.size,
                  esmeraldaHeadingSource.bbox[3] - esmeraldaHeadingSource.bbox[1],
                ) ? { display: 'inline-block', transform: 'translateY(12%)' } : {}),
              }}
            >
              {seg.symbolId || resolveLegacySymbol(seg.font,seg.text)
                ? renderSegmentContent(seg, scale, language)
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
    .filter(([imageX0, , imageX1, imageY1]) => imageX0 < x1 && imageX1 > x0 && imageY1 > block.bbox[3])
    .reduce<number | undefined>((nearest, image) => {
      const obstacleY = Math.max(block.bbox[3], image[1]);
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
    sourceSegments,
    editorContext: 'span-unit',
  };
}

const TypographicUnitBlock: React.FC<TypographicUnitBlockProps> = ({
  block, nextComponentY, units, pageNumber, scale, isAdmin, onBlockClick, selectedBlockKey,
  overrides, draftOverride, language,
}) => {
  const [leadingUnitPushPt, setLeadingUnitPushPt] = useState(0);
  const inlineSpanStates = buildInlineSpanStates(
    block, pageNumber, selectedBlockKey, overrides, draftOverride, language,
  );
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
  const flowUnits = units.filter(unit => !unit.fixedPosition);
  const firstFieldY = flowUnits[0]?.field.bbox[1];
  const secondFieldY = flowUnits[1]?.field.bbox[1];
  const handleLeadingUnitMeasure = useCallback((heightPx: number) => {
    if (firstFieldY === undefined || secondFieldY === undefined || !scale) return;
    const requiredPushPt = Math.max(0, heightPx / scale - (secondFieldY - firstFieldY));
    const clearancePt = 8;
    const availablePushPt = nextComponentY === undefined
      ? 0
      : Math.max(0, nextComponentY - block.bbox[3] - clearancePt);
    const pushPt = requiredPushPt <= availablePushPt ? requiredPushPt : 0;
    setLeadingUnitPushPt(current => Math.abs(current - pushPt) < 0.01 ? current : pushPt);
  }, [block.bbox, firstFieldY, nextComponentY, scale, secondFieldY]);

  return (
    <div className="block-container" style={blockStyle}>
      {units.map((unit, unitIndex) => {
        const spanKey = `page_${pageNumber}_unit_${unit.id}__${language}`;
        const override = selectedBlockKey === spanKey && draftOverride
          ? draftOverride
          : overrides.get(spanKey) || null;
        const nextFieldY = unit.fixedPosition ? undefined : units
          .slice(unitIndex + 1)
          .find(nextUnit => !nextUnit.fixedPosition)?.field.bbox[1];
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
            nextFieldY={nextFieldY !== undefined ? nextFieldY + leadingUnitPushPt : undefined}
            topOffsetPt={!unit.fixedPosition && unit !== flowUnits[0] ? leadingUnitPushPt : 0}
            onPreviewMeasure={unit === flowUnits[0] ? handleLeadingUnitMeasure : undefined}
            inlineSpanStates={inlineSpanStates}
            onInlineSpanClick={state => onBlockClick(state.info)}
            onBlockClick={onBlockClick}
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
  nextFieldY?: number;
  topOffsetPt?: number;
  onPreviewMeasure?: (heightPx: number) => void;
  inlineSpanStates?: Map<string, InlineSpanUnitRenderState>;
  onInlineSpanClick?: (state: InlineSpanUnitRenderState) => void;
  onBlockClick: (info: SelectedSpanInfo) => void;
}

const CreditField: React.FC<CreditFieldProps> = ({
  block, field, spanKey, scale, isAdmin, selected, override, language, nextFieldY,
  topOffsetPt = 0, onPreviewMeasure, inlineSpanStates, onInlineSpanClick, onBlockClick,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const blockX = block.bbox[0];
  const blockY = block.bbox[1];
  const fieldX = field.frame.x;
  const fieldY = field.bbox[1];
  const fieldHeight = field.bbox[3] - field.bbox[1];
  const neighborHeight = nextFieldY !== undefined && nextFieldY > fieldY
    ? nextFieldY - fieldY
    : fieldHeight;
  const fieldStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(fieldX - blockX) * scale}px`,
    top: `${(fieldY - blockY + topOffsetPt) * scale}px`,
    width: `${field.frame.width * scale}px`,
    minHeight: `${fieldHeight * scale}px`,
  };
  const geometryAttributes = adminGeometryAttributes(isAdmin, spanKey, {
    x: field.frame.x,
    y: fieldY,
    width: field.frame.width,
    height: fieldHeight,
    rotation: 0,
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
    }
  }, [onPreviewMeasure, override, neighborHeight, scale]);

  const lines = (block.lines || []).filter(line => field.lineIds.includes(line.id));
  const sourceClass = isAdmin ? 'credit-edit-field' : '';
  const selectedClass = selected ? 'credit-field-selected' : '';
  const overflowClass = isAdmin && isOverflowing ? 'block-overflow' : '';

  const handleClick = (event: React.MouseEvent) => {
    if (!isAdmin) return;
    event.stopPropagation();
    onBlockClick(extractCreditFieldInfo(spanKey, block, field));
  };

  return (
    <div
      className={`credit-field ${sourceClass} ${selectedClass} ${overflowClass}`}
      style={fieldStyle}
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
            textAlign: override.textAlign ?? field.frame.textAlign ?? 'left',
            lineHeight: field.frame.lineHeight ?? 1,
            display: 'block',
            fontSize: 0,
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
  override?: SpanOverride;
  onClick: () => void;
  inlineSpanStates?: Map<string, InlineSpanUnitRenderState>;
  onInlineSpanClick?: (state: InlineSpanUnitRenderState) => void;
}

const LineRenderer: React.FC<LineRendererProps> = ({ 
  line, scale, blockOriginX, blockOriginY, targetPage, 
  onNavigate, isAdmin, isSelected, language, override, onClick, inlineSpanStates, onInlineSpanClick,
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
  
  const originalX = (line.bbox[0] + (line.renderTextOffsetPt ?? 0) - blockOriginX) * scale;
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
              letterSpacing: '-0.015em',
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
        // A unit can cover several source spans. Paint its override once;
        // virtual source icons keep their original reference without repainting.
        if(inlineUnit?.override && `${line.id}:${span.sourceSpanIndex ?? si}`!==inlineUnit.renderAtRef)return null;
        const sourceAdvanceWidth = Math.max(0, span.bbox[2] - span.bbox[0]) * scale;
        const previousSpan = previousSourceSpan(line.spans,si);
        const sourceAdvanceGap = previousSpan
          ? Math.max(0, span.bbox[0] - previousSpan.bbox[2]) * scale
          : 0;
        const useSourceGeometry = !override
          && line.renderSourceSpanGeometry
          && (line.renderSourceGeometryThroughSpan === undefined || (span.sourceSpanIndex ?? si) <= line.renderSourceGeometryThroughSpan);
        const isUnsupportedSymbol =
          (span.font?.includes('Webdings') && !(span.font?.includes('Webdings') && span.text === '\uF07E')) ||
          (span.font?.includes('Wingdings') && !span.pictogramDisplayOverride) ||
          (span.font?.includes('ZapfDingbats') && !span.pictogramSvgPath);
        const isReplacedBySourceOverlay = span.renderAsSourceOverlayDuplicate
          && (span.renderSourceOverlayLanguage === 'all' || span.renderSourceOverlayLanguage === language);
        if (span.renderOnlyStrokePass || (isReplacedBySourceOverlay && (!inlineUnit?.override || span.semanticSymbolId))) return null;
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
          letterSpacing: '-0.015em',
          ...(useSourceGeometry ? {
            flex: `0 0 ${sourceAdvanceWidth}px`,
            marginInlineStart: `${sourceAdvanceGap}px`,
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
                letterSpacing: '-0.015em',
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
            className={inlineUnit ? `span-editable ${inlineUnit.selected ? 'span-selected' : ''}` : undefined}
            style={{ ...spanStyle, ...(inlineUnit && isAdmin ? { cursor: 'text' } : {}) }}
            onClick={inlineUnit && isAdmin ? event => {
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
