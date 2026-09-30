import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { RichSpanEditor, type SpanOverride } from './RichSpanEditor';
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
        weight = mapped.weight;
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
  return { spanKey: blockKey, text, font, family: mapPdfFont(font).family, weight, style, color, size, bbox: block.bbox };
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
        map.set(doc.spanKey, { spanKey: doc.spanKey, segments: doc.data, bbox: [0,0,0,0] });
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
    if (checkData.docs.length > 0) {
      const id = checkData.docs[0].id;
      const res = await fetch(`http://localhost:3000/api/translations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, data: override.segments })
      });
      return res.ok;
    } else {
      const res = await fetch(`http://localhost:3000/api/translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spanKey: override.spanKey, language: lang, data: override.segments })
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
  const [draftOverride, setDraftOverride] = useState<SpanOverride | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchOverridesFromPayload(language).then((serverMap) => {
      if (serverMap) {
        const merged = loadOverrides(language);
        serverMap.forEach((override, key) => merged.set(key, override));
        setOverrides(merged);
      } else {
        setOverrides(loadOverrides(language));
      }
    });
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
    const stage = containerRef.current;
    if (!stage || !pageData) return;

    const updateScale = () => {
      const availableWidth = Math.max(1, stage.clientWidth - 48);
      const availableHeight = Math.max(1, stage.clientHeight - 48);
      const fitScale = Math.min(
        availableWidth / pageData.width,
        availableHeight / pageData.height,
      );
      setScale(fitScale * zoomLevel);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [pageData, zoomLevel, selectedSpan]);

  const handleSpanClick = useCallback((info: SelectedSpanInfo) => {
    if (!isAdmin) return;
    setSelectedSpan(info);
    setDraftOverride(null);
  }, [isAdmin]);

  const handleDraftChange = useCallback((draft: SpanOverride) => {
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
              draftOverride={draftOverride}
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
  onBlockClick: (info: SelectedSpanInfo) => void;
  selectedBlockKey: string | null;
  overrides: Map<string, SpanOverride>;
  draftOverride: SpanOverride | null;
}

const SpanBlock: React.FC<SpanBlockProps> = ({ 
  block, blockIdx, pageNumber, scale, isAdmin, contentsMap, 
  onNavigate, onBlockClick, selectedBlockKey, overrides, draftOverride 
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

  if (!block.lines || block.lines.length === 0) return null;

  const blockHoverClass = isAdmin ? `block-editable ${selectedBlockKey === blockKey ? 'block-selected' : ''}` : '';
  const overflowClass = isOverflowing ? 'block-overflow' : '';

  if (currentOverride && currentOverride.segments.length > 0) {
    // Determine the available width/X based on the first line to align with column bounds
    const firstLine = block.lines[0];
    const rawX = (firstLine as any).availableX !== undefined ? (firstLine as any).availableX : blockX;
    const rawWidth = (firstLine as any).availableWidth || blockW;
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
            textAlign: currentOverride.textAlign || 'left',
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
                color: seg.color,
                whiteSpace: 'pre-wrap',
                fontVariantLigatures: 'none',
                fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
                letterSpacing: '-0.015em',
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
              color: seg.color,
              whiteSpace: 'pre-wrap',
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
    <div style={{...lineStyle, paddingLeft: `${textOffset}px`, boxSizing: 'border-box'}} onClick={handleClick} className={`${hoverClass} ${targetPage ? 'contents-link' : ''}`}>
      {line.spans.map((span, si) => {
        if (span.font?.includes('Webdings') || span.font?.includes('Wingdings') || span.font?.includes('ZapfDingbats')) {
          return null;
        }
        if (span.size < 4.0) {
          return null; // Hide microscopic vector text artifacts embedded in images
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
