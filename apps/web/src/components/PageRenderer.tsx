import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { RichSpanEditor, type SpanOverride, type Segment } from './RichSpanEditor';
import './PageRenderer.css';

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
}

export interface LineData {
  id: string;
  bbox: [number, number, number, number];
  spans: SpanData[];
}

export interface Block {
  id: string;
  bbox: [number, number, number, number];
  content?: string;
  lines?: LineData[];
  font?: string;
  size?: number;
  color?: string;
  isBold?: boolean;
  isItalic?: boolean;
  zIndex?: number;
}

export interface ImageData {
  url: string;
  bbox: [number, number, number, number];
  role?: string;
  blendMode?: string;
}

export interface PageData {
  page_number: number;
  width: number;
  height: number;
  backgroundUrl?: string;
  blocks: Block[];
  images: ImageData[];
}

/* ─────────────────────────────────────────────
   Font Mapping – PDF font name → CSS stack
   ───────────────────────────────────────────── */
interface FontMapping {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
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
    return { family: "'CinzelLocal', 'Cinzel', serif", weight, style: 'normal' };
  }
  if (name.includes('Esmeralda')) {
    return { family: "'EsmeraldaPro', 'Georgia', serif", weight: 400, style: 'normal' };
  }
  if (name.includes('Aristelle')) {
    return { family: "'Inter', 'Helvetica', sans-serif", weight: 400, style: 'normal' };
  }
  if (name.includes('Webdings') || name.includes('Wingdings') || name.includes('ZapfDingbats')) {
    return { family: "'Webdings', sans-serif", weight: 400, style: 'normal' };
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
  if (f === 'Inter') return "'Inter', sans-serif";
  return `'${f}', serif`;
}

function extractLineInfo(lineKey: string, line: LineData): SelectedSpanInfo {
  let text = '';
  let font = '';
  let size = 0;
  let color = '#231f20';
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  
  for (const span of line.spans) {
    if (!font && span.font && !span.font.includes('Dingbat') && span.text.trim()) {
      font = span.font;
      size = span.size;
      color = span.color || '#231f20';
      const mapped = mapPdfFont(font);
      weight = mapped.weight;
      style = mapped.style;
    }
    text += span.displayOverride || span.text;
  }
  
  // Do not trim inside if there are spaces, but trim the end result
  if (!font) {
      const mapped = mapPdfFont('AGaramondPro');
      font = 'AGaramondPro';
      weight = mapped.weight;
      style = mapped.style;
      size = 13;
  }
  return { spanKey: lineKey, text, font, family: mapPdfFont(font).family, weight, style, color, size, bbox: line.bbox };
}

/* ─────────────────────────────────────────────
   Overrides persistence (localStorage per language)
   ───────────────────────────────────────────── */
function getOverridesKey(lang: string) {
  return `middara-lines-v2-${lang}`;
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
  localStorage.setItem(getOverridesKey(lang), JSON.stringify(arr));
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
  const [draftOverride, setDraftOverride] = useState<Segment[] | null>(null);

  useEffect(() => {
    setOverrides(loadOverrides(language));
  }, [language]);

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
    const updateScale = () => {
      if (containerRef.current && pageData) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const padding = 60;
          const availableWidth = parent.clientWidth - padding;
          const availableHeight = parent.clientHeight - padding;
          const scaleX = availableWidth / pageData.width;
          const scaleY = availableHeight / pageData.height;
          setScale(Math.min(scaleX, scaleY) * zoomLevel);
        }
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [pageData, zoomLevel]);

  const handleSpanClick = useCallback((info: SelectedSpanInfo) => {
    if (!isAdmin) return;
    setSelectedSpan(info);
    setDraftOverride(null);
  }, [isAdmin]);

  const handleDraftChange = useCallback((segments: Segment[]) => {
    setDraftOverride(segments);
  }, []);

  const handleSaveOverride = useCallback((override: SpanOverride | null) => {
    if (!override && !selectedSpan) return;
    setOverrides(prev => {
      const next = new Map(prev);
      if (override) {
        next.set(override.spanKey, override);
      } else if (selectedSpan) {
        next.delete(selectedSpan.spanKey);
      }
      saveOverridesToStorage(language, next);
      return next;
    });
    setSelectedSpan(null);
    setDraftOverride(null);
  }, [language, selectedSpan]);

  const handleCloseEditor = useCallback(() => {
    setSelectedSpan(null);
    setDraftOverride(null);
  }, []);

  const containerStyle: React.CSSProperties = {
    width: `${pageData.width * scale}px`,
    height: `${pageData.height * scale}px`,
    marginLeft: selectedSpan ? '20px' : 'auto',
    marginRight: selectedSpan ? '440px' : 'auto',
    transition: 'margin 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
    flexShrink: 0,
  };

  return (
    <div className="page-renderer" style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', overflowX: 'auto' }}>
      <div ref={containerRef} className="page-container" style={containerStyle}>
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
              onLineClick={handleSpanClick}
              selectedSpanKey={selectedSpan?.spanKey || null}
              overrides={overrides}
              draftOverride={draftOverride}
            />
          );
        })}
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
          bbox={selectedSpan.bbox}
          pageNumber={pageData.page_number}
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
  onLineClick: (info: SelectedSpanInfo) => void;
  selectedSpanKey: string | null;
  overrides: Map<string, SpanOverride>;
  draftOverride: Segment[] | null;
}

const SpanBlock: React.FC<SpanBlockProps> = ({ 
  block, blockIdx, pageNumber, scale, isAdmin, contentsMap, 
  onNavigate, onLineClick, selectedSpanKey, overrides, draftOverride 
}) => {
  if (!block.lines || block.lines.length === 0) return null;

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
      {block.lines.map((line, lIdx) => {
        const lineKey = `page_${pageNumber}_block_${blockIdx}_line_${line.id}`;
        let currentOverride = overrides.get(lineKey);
        
        if (selectedSpanKey === lineKey && draftOverride) {
          currentOverride = {
            spanKey: lineKey,
            bbox: line.bbox,
            segments: draftOverride,
          };
        }

        return (
          <LineRenderer
            key={line.id}
            line={line}
            lineKey={lineKey}
            scale={scale}
            blockOriginX={blockX}
            blockOriginY={blockY}
            blockW={blockW}
            targetPage={contentsMap?.get(line.id)}
            onNavigate={onNavigate}
            isAdmin={isAdmin}
            isSelected={selectedSpanKey === lineKey}
            override={currentOverride}
            onClick={() => onLineClick(extractLineInfo(lineKey, line))}
          />
        );
      })}
    </div>
  );
};

interface LineRendererProps {
  line: LineData;
  lineKey: string;
  scale: number;
  blockOriginX: number;
  blockOriginY: number;
  blockW: number;
  targetPage?: number;
  onNavigate?: (pageNum: number) => void;
  isAdmin: boolean;
  isSelected: boolean;
  override?: SpanOverride;
  onClick: () => void;
}

const LineRenderer: React.FC<LineRendererProps> = ({ 
  line, lineKey, scale, blockOriginX, blockOriginY, blockW, targetPage, 
  onNavigate, isAdmin, isSelected, override, onClick 
}) => {
  const lineY = (line.bbox[1] - blockOriginY) * scale;
  const lineX = (line.bbox[0] - blockOriginX) * scale;
  const lineH = (line.bbox[3] - line.bbox[1]) * scale;
  
  // Original width of the text itself
  const lineW = (line.bbox[2] - line.bbox[0]) * scale;
  
  // The available width from the start of the line to the right edge of the block
  const availableW = (blockOriginX + blockW - line.bbox[0]) * scale;

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
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (targetPage && onNavigate) {
      onNavigate(targetPage);
    } else if (isAdmin) {
      onClick();
    }
  };

  if (override && override.segments.length > 0) {
    return (
      <div 
        className={`realbox ${hoverClass}`} 
        style={lineStyle}
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
              color: seg.color,
              whiteSpace: 'pre',
              fontVariantLigatures: 'none',
              fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
              letterSpacing: '-0.015em',
            }}
          >
            {seg.text}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={lineStyle} onClick={handleClick} className={`${hoverClass} ${targetPage ? 'contents-link' : ''}`}>
      {line.spans.map((span, si) => {
        if (span.font?.includes('Webdings') || span.font?.includes('Wingdings') || span.font?.includes('ZapfDingbats')) {
          return null;
        }

        const mapped = mapPdfFont(span.font);
        const isPUA = !!span.displayOverride;
        const spanStyle: React.CSSProperties = {
          fontFamily: isPUA ? "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif" : mapped.family,
          fontSize: `${span.size * scale}px`,
          fontWeight: mapped.weight,
          fontStyle: mapped.style,
          color: span.color || '#231f20',
          whiteSpace: 'pre',
          fontVariantLigatures: 'none',
          fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
          letterSpacing: '-0.015em',
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
