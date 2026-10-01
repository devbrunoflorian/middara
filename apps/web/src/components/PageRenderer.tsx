import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { RichSpanEditor, type SpanOverride, type TextAlignment } from './RichSpanEditor';
import './PageRenderer.css';
import './Toast.css';

/* ─────────────────────────────────────────────
   Types – match the exact JSON DOM structure
   ───────────────────────────────────────────── */
export interface SpanData {
  text: string;
  font: string;
  size: number;
  color: string;
  flags: number;
  bbox: [number, number, number, number];
  displayOverride?: string;
  renderWeightOverride?: number;
}

export interface LineData {
  id: string;
  bbox: [number, number, number, number];
  spans: SpanData[];
  renderScaleX?: number;
}

export interface LayoutFrame {
  x: number;
  width: number;
  textAlign?: TextAlignment;
  lineHeight?: number;
}

export interface Block {
  id: string;
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
  hideInAdmin?: boolean;
}

export interface PageData {
  page_number: number;
  width: number;
  height: number;
  backgroundUrl?: string;
  blocks: Block[];
  images: ImageData[];
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
      whiteSpace: 'pre-wrap',
      fontVariantLigatures: 'none',
      fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
      letterSpacing: '-0.015em',
    }}>{piece.text}</span>
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

function extractBlockInfo(blockKey: string, block: Block): SelectedSpanInfo {
  let text = '';
  let font = '';
  let size = 0;
  let color = '#231f20';
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  
  const lines = block.lines || [];
  for (const line of lines) {
    if ((line as any).suspectedGhost) continue;
    for (const span of line.spans) {
      if (!font && span.font && !span.font.includes('Dingbat') && span.text.trim()) {
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
  };
}

/* ─────────────────────────────────────────────
   Overrides persistence (localStorage per language)
   ───────────────────────────────────────────── */
function getOverridesKey(lang: string) {
  return `middara-lines-v2-${lang}`;
}

async function fetchOverridesFromPayload(lang: string): Promise<Map<string, SpanOverride> | null> {
  try {
    const res = await fetch(`http://localhost:3000/api/translations?where[language][equals]=${lang}&limit=5000`);
    if (res.ok) {
      const data = await res.json();
      const map = new Map<string, SpanOverride>();
      data.docs.forEach((doc: any) => {
        const stored = doc.data;
        const segments = Array.isArray(stored) ? stored : stored?.segments;
        if (!Array.isArray(segments)) return;
        map.set(doc.spanKey, {
          spanKey: doc.spanKey,
          segments,
          bbox: [0, 0, 0, 0],
          textAlign: Array.isArray(stored) ? undefined : stored?.textAlign,
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
    const query = new URLSearchParams({
      'where[and][0][spanKey][equals]': override.spanKey,
      'where[and][1][language][equals]': lang,
    });
    const check = await fetch(`http://localhost:3000/api/translations?${query}`);
    const checkData = await check.json();
    const data = {
      schemaVersion: 2,
      segments: override.segments,
      textAlign: override.textAlign,
    };
    if (checkData.docs.length > 0) {
      const id = checkData.docs[0].id;
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
        body: JSON.stringify({ spanKey: override.spanKey, language: lang, data })
      });
      return res.ok;
    }
  } catch {
    return false;
  }
}

async function deleteOverrideFromPayload(spanKey: string, lang: string): Promise<boolean> {
  try {
    const query = new URLSearchParams({
      'where[and][0][spanKey][equals]': spanKey,
      'where[and][1][language][equals]': lang,
    });
    const check = await fetch(`http://localhost:3000/api/translations?${query}`);
    const checkData = await check.json();
    if (checkData.docs.length > 0) {
      const id = checkData.docs[0].id;
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
  let font = '';
  let size = 0;
  let color = '#231f20';
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  let text = '';

  for (const line of lines) {
    for (const span of line.spans) {
      if (!font && span.font && !span.font.includes('Dingbat') && span.text.trim()) {
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
}

interface PageRendererProps {
  pageData: PageData;
  isAdmin: boolean;
  zoomLevel?: number;
  onNavigate?: (pageNum: number) => void;
  language?: 'en' | 'pt-BR';
}

export const PageRenderer: React.FC<PageRendererProps> = ({ pageData, isAdmin, zoomLevel = 1, onNavigate, language = 'en' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [selectedSpan, setSelectedSpan] = useState<SelectedSpanInfo | null>(null);
  const [overrides, setOverrides] = useState<Map<string, SpanOverride>>(() => loadOverrides(language));
  const [overridesLoadedLanguage, setOverridesLoadedLanguage] = useState<string | null>(null);
  const [draftOverride, setDraftOverride] = useState<SpanOverride | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  return (
    <div className={`page-renderer ${selectedSpan ? 'editor-open' : ''}`} style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'stretch', overflow: 'hidden' }}>
      <div ref={containerRef} className="page-stage">
      <div className="page-container" style={containerStyle}>
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
          return (
            <SpanBlock
              key={block.id}
              block={block}
              blockIdx={bIdx}
              pageNumber={pageData.page_number}
              scale={scale}
              isAdmin={isAdmin}
              contentsMap={contentsMap}
              onNavigate={onNavigate}
              onBlockClick={handleSpanClick}
              selectedBlockKey={selectedSpan?.spanKey || null}
              overrides={overrides}
              overridesReady={overridesReady}
              draftOverride={draftOverride}
              language={language}
            />
          );
        })}
        {pageData.fidelityOverlays?.map((overlay) => {
          if (overlay.language !== language || (overlay.hideInAdmin && isAdmin)) return null;
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
                zIndex: 10000,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          );
        })}
      </div>
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
          originalTextAlign={selectedSpan.textAlign}
          bbox={selectedSpan.bbox}
          pageNumber={pageData.page_number}
          language={language}
          onClose={handleCloseEditor}
          onSave={handleSaveOverride}
          onDraftChange={handleDraftChange}
          existingOverride={overrides.get(selectedSpan.spanKey) || null}
        />
      )}
    </div>
  );
};

interface SpanBlockProps {
  block: Block;
  blockIdx: number;
  pageNumber: number;
  scale: number;
  isAdmin: boolean;
  contentsMap?: Map<string, number>;
  onNavigate?: (pageNum: number) => void;
  onBlockClick: (info: SelectedSpanInfo) => void;
  selectedBlockKey: string | null;
  overrides: Map<string, SpanOverride>;
  overridesReady: boolean;
  draftOverride: SpanOverride | null;
  language: 'en' | 'pt-BR';
}

const SpanBlock: React.FC<SpanBlockProps> = ({ 
  block, blockIdx, pageNumber, scale, isAdmin, contentsMap, 
  onNavigate, onBlockClick, selectedBlockKey, overrides, overridesReady, draftOverride, language
}) => {
  const blockRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

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

  const blockKey = `page_${pageNumber}_block_${blockIdx}`;

  let currentOverride = overrides.get(blockKey);
  if (selectedBlockKey === blockKey && draftOverride) {
    currentOverride = draftOverride;
  }

  // Effect to measure height and set overflowing state for the live preview indicator
  useEffect(() => {
    if (currentOverride && blockRef.current) {
      const actualHeight = blockRef.current.scrollHeight;
      setIsOverflowing(actualHeight > blockH * scale + 2); // 2px tolerance
    } else {
      setIsOverflowing(false);
    }
  }, [currentOverride, scale, blockH]);

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

  const blockHoverClass = isAdmin ? `block-editable ${selectedBlockKey === blockKey ? 'block-selected' : ''}` : '';
  const overflowClass = isAdmin && isOverflowing ? 'block-overflow' : '';
  const esmeraldaHeadingSource = block.lines
    ?.flatMap(line => line.spans)
    .find(span => needsEsmeraldaHeadingDrop(span.font, span.size, span.bbox[3] - span.bbox[1]));

  if (currentOverride && currentOverride.segments.length > 0) {
    // Use a translation frame when supplied; otherwise keep the source-derived fallback.
    const firstLine = block.lines[0];
    const rawX = block.layoutFrame?.x ?? ((firstLine as any).availableX !== undefined ? (firstLine as any).availableX : blockX);
    const rawWidth = block.layoutFrame?.width ?? (firstLine as any).availableWidth ?? blockW;
    const blockLineX = (rawX - blockX) * scale;
    const blockLineW = rawWidth * scale;

    return (
      <div className={`block-container ${blockHoverClass} ${overflowClass}`} style={blockStyle} onClick={() => isAdmin && onBlockClick(extractBlockInfo(blockKey, block))}>
        <div 
          ref={blockRef}
          className={`realbox`} 
          style={{
            position: 'absolute',
            left: `${blockLineX}px`,
            top: `0px`,
            width: `${blockLineW}px`,
            whiteSpace: 'pre-wrap',
            textAlign: currentOverride.textAlign ?? block.layoutFrame?.textAlign ?? 'left',
            lineHeight: block.layoutFrame?.lineHeight ?? 1,
            display: 'block',
            fontSize: 0,
            cursor: isAdmin ? 'text' : 'default',
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
                whiteSpace: 'pre-wrap',
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
              {seg.text}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`block-container ${blockHoverClass}`} style={blockStyle} onClick={() => isAdmin && onBlockClick(extractBlockInfo(blockKey, block))}>
      {block.lines.map((line, lIdx) => {
        const lineId = line.id !== undefined ? line.id : lIdx;

        return (
          <LineRenderer
            key={lineId}
            line={line}
            scale={scale}
            blockOriginX={blockX}
            blockOriginY={blockY}
            targetPage={contentsMap?.get(line.id)}
            onNavigate={onNavigate}
            isAdmin={false} // Click is handled at block level now
            isSelected={false}
            onClick={() => {}}
          />
        );
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

interface CreditFieldProps {
  block: Block;
  field: CreditFieldDefinition;
  spanKey: string;
  scale: number;
  isAdmin: boolean;
  selected: boolean;
  override: SpanOverride | null;
  language: 'en' | 'pt-BR';
  onBlockClick: (info: SelectedSpanInfo) => void;
}

const CreditField: React.FC<CreditFieldProps> = ({
  block, field, spanKey, scale, isAdmin, selected, override, language, onBlockClick,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const blockX = block.bbox[0];
  const blockY = block.bbox[1];
  const fieldX = field.frame.x;
  const fieldY = field.bbox[1];
  const fieldHeight = field.bbox[3] - field.bbox[1];
  const fieldStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(fieldX - blockX) * scale}px`,
    top: `${(fieldY - blockY) * scale}px`,
    width: `${field.frame.width * scale}px`,
    minHeight: `${fieldHeight * scale}px`,
  };

  useEffect(() => {
    const preview = previewRef.current;
    if (override && preview) {
      setIsOverflowing(preview.scrollHeight > fieldHeight * scale + 2);
    } else {
      setIsOverflowing(false);
    }
  }, [override, fieldHeight, scale]);

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
    >
      {override && override.segments.length > 0 ? (
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
            isAdmin={false}
            isSelected={false}
            onClick={() => {}}
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
  override?: SpanOverride;
  onClick: () => void;
}

const LineRenderer: React.FC<LineRendererProps> = ({ 
  line, scale, blockOriginX, blockOriginY, targetPage, 
  onNavigate, isAdmin, isSelected, override, onClick 
}) => {
  // Some composite source illustrations (for example page 15's inset encounter
  // diagram) already contain these words in the background artwork. Keep the
  // extracted text available for Admin selection, but avoid painting it twice
  // in the English source view. A localized asset is still required before
  // translating text that is baked into that illustration.
  if ((line as any).rasterizedDuplicate && !isSelected && !override) {
    return null;
  }

  // Hide ghosts by default, only show in admin if selected or via some UI toggle. 
  // For now, we'll hide them unless they are actively selected in Admin.
  if ((line as any).suspectedGhost && !isSelected) {
    return null;
  }

  const lineY = (line.bbox[1] - blockOriginY) * scale;
  const lineH = (line.bbox[3] - line.bbox[1]) * scale;
  
  // Use availableWidth/X (column bounds) if available, otherwise fallback to exact text bounds
  const rawX = (line as any).availableX !== undefined ? (line as any).availableX : line.bbox[0];
  const rawWidth = (line as any).availableWidth || (line.bbox[2] - line.bbox[0]);
  
  const lineX = (rawX - blockOriginX) * scale;
  const lineW = rawWidth * scale;
  
  const originalX = (line.bbox[0] - blockOriginX) * scale;
  const textOffset = Math.max(0, originalX - lineX);

  const hoverClass = isAdmin ? `span-editable ${isSelected ? 'span-selected' : ''}` : '';

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
    ...(line.renderScaleX && !override ? {
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

  if (override && override.segments.length > 0) {
    const sourceHasEsmeraldaHeading = line.spans.some(span =>
      needsEsmeraldaHeadingDrop(span.font, span.size, span.bbox[3] - span.bbox[1]),
    );
    return (
      <div 
        className={`realbox ${hoverClass}`} 
        style={{
          ...lineStyle,
          whiteSpace: 'pre-wrap',
          textAlign: override.textAlign || 'left',
          display: 'block',
          fontSize: 0,
        }}
        onClick={handleClick}
      >
        {override.segments.map((seg, segIdx) => (
          <span
            key={segIdx}
            style={{
              fontFamily: segFontToCSS(seg.font),
              fontSize: `${seg.size * scale}px`,
              fontWeight: seg.weight,
              fontStyle: seg.style,
              fontVariantCaps: mapPdfFont(seg.font).variantCaps,
              color: seg.color,
              whiteSpace: 'pre-wrap',
              fontVariantLigatures: 'none',
              fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
              letterSpacing: '-0.015em',
              ...(sourceHasEsmeraldaHeading && needsEsmeraldaHeadingDrop(seg.font, seg.size, lineH / scale)
                ? { display: 'inline-block', transform: 'translateY(12%)' }
                : {}),
            }}
          >
            {seg.text}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{...lineStyle, paddingLeft: `${textOffset}px`, boxSizing: 'border-box'}} onClick={handleClick} className={`${hoverClass} ${targetPage ? 'contents-link' : ''}`}>
      {line.spans.map((span, si) => {
        // The source PDF paints Webdings U+F07E twice at the same bbox: a
        // 2pt white stroke and a red fill. PyMuPDF's text dict keeps only the
        // white pass, so reconstruct that one known glyph from its trace data.
        const isOutlinedImportantGlyph = span.font?.includes('Webdings') && span.text === '\uF07E';
        if (
          (span.font?.includes('Webdings') && !isOutlinedImportantGlyph) ||
          span.font?.includes('Wingdings') ||
          span.font?.includes('ZapfDingbats')
        ) {
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
          fontFamily: isPUA ? "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif" : mapped.family,
          fontSize: `${span.size * scale}px`,
          fontWeight: span.renderWeightOverride ?? mapped.weight,
          fontStyle: mapped.style,
          fontVariantCaps: mapped.variantCaps,
          color: isOutlinedImportantGlyph ? '#b91d23' : (span.color || '#231f20'),
          whiteSpace: 'pre',
          fontVariantLigatures: 'none',
          fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
          letterSpacing: '-0.015em',
          ...(isOutlinedImportantGlyph ? {
            WebkitTextStroke: `${2 * scale}px #ffffff`,
            paintOrder: 'stroke fill',
          } : {}),
          // Large Esmeralda headings have unusually tall PDF ink boxes. Nudge
          // only their visible glyphs down; this leaves surrounding line geometry intact.
          ...(shouldDropEsmeraldaHeading ? { display: 'inline-block', transform: 'translateY(12%)' } : {}),
        };

        return (
          <span
            key={si}
            style={spanStyle}
            aria-label={isPUA ? span.text : undefined}
          >
            {isPUA ? span.displayOverride : span.text}
          </span>
        );
      })}
    </div>
  );
};
