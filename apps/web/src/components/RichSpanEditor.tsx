import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './RichSpanEditor.css';
import puaMappingRaw from '../assets/pua_mapping.json';

const PUA_MAPPING: Record<string, {name: string, pua_char: string, hex: string}[]> = puaMappingRaw;

/* ─────────────────────────────────────────────
   Available font families (match fonts.css)
   ───────────────────────────────────────────── */
const AVAILABLE_FONTS = [
  { label: 'Optima LT Std', value: "OptimaLTStd" },
  { label: 'Adobe Garamond Pro', value: "AGaramondPro" },
  { label: 'Cinzel', value: "CinzelLocal" },
  { label: 'Cinzel Decorative', value: "Cinzel Decorative" },
  { label: 'Esmeralda Pro', value: "EsmeraldaPro" },
  { label: 'Esmeralda Pro (PUA)', value: "EsmeraldaPro-PUA" },
  { label: 'Inter (sans)', value: "Inter" },
];

const FONT_WEIGHTS = [400, 500, 600, 700, 900, 950];

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */
export interface Segment {
  text: string;
  font: string;
  size: number;
  color: string;
  weight: number;
  style: 'normal' | 'italic';
  disableLigatures?: boolean;
}

export interface SpanOverride {
  spanKey: string;
  segments: Segment[];
  bbox: [number, number, number, number];
}

interface RichSpanEditorProps {
  spanKey: string;
  originalText: string;
  originalFont: string;
  originalSize: number;
  originalColor: string;
  originalWeight: number;
  originalStyle: 'normal' | 'italic';
  bbox: [number, number, number, number];
  pageNumber: number;
  onClose: () => void;
  onSave: (override: SpanOverride | null) => void;
  existingOverride?: SpanOverride | null;
  onDraftChange?: (segments: Segment[]) => void;
}

export const RichSpanEditor: React.FC<RichSpanEditorProps> = ({
  spanKey,
  originalText,
  originalFont,
  originalSize,
  originalColor,
  originalWeight,
  originalStyle,
  bbox,
  pageNumber,
  onClose,
  onSave,
  existingOverride,
  onDraftChange,
}) => {
  // Segments = the array of styled character runs
  const [segments, setSegments] = useState<Segment[]>([]);
  // Selection range (character indices into the flattened text)
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Current tool settings
  const [toolFont, setToolFont] = useState(() => {
    if (originalFont.includes('Optima')) return 'OptimaLTStd';
    if (originalFont.includes('Garamond')) return 'AGaramondPro';
    if (originalFont.includes('Decorative')) return 'Cinzel Decorative';
    if (originalFont.includes('Cinzel')) return 'CinzelLocal';
    if (originalFont.includes('EsmeraldaPro-PUA')) return 'EsmeraldaPro-PUA';
    if (originalFont.includes('Esmeralda')) return 'EsmeraldaPro';
    return originalFont;
  });
  const [toolWeight, setToolWeight] = useState(originalWeight);
  const [toolStyle, setToolStyle] = useState<'normal' | 'italic'>(originalStyle);
  const [toolColor, setToolColor] = useState(originalColor);
  const [toolSize, setToolSize] = useState(originalSize);
  const [toolLigatures, setToolLigatures] = useState(true);
  // Text editing
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState('');

  const charGridRef = useRef<HTMLDivElement>(null);

  // Initialize segments from existing override or original span
  useEffect(() => {
    if (existingOverride && existingOverride.segments.length > 0) {
      setSegments(existingOverride.segments);
    } else {
      setSegments([{
        text: originalText,
        font: originalFont,
        size: originalSize,
        color: originalColor,
        weight: originalWeight,
        style: originalStyle,
      }]);
    }
  }, [existingOverride, originalText, originalFont, originalSize, originalColor, originalWeight, originalStyle]);

  useEffect(() => {
    if (onDraftChange && segments.length > 0) {
      onDraftChange(segments);
    }
  }, [segments, onDraftChange]);

  // Flatten segments to characters with their style info
  const chars = useMemo(() => {
    const result: { char: string; segIdx: number; font: string; weight: number; style: 'normal' | 'italic'; color: string; size: number }[] = [];
    segments.forEach((seg, segIdx) => {
      for (const ch of seg.text) {
        result.push({
          char: ch,
          segIdx,
          font: seg.font,
          weight: seg.weight,
          style: seg.style,
          color: seg.color,
          size: seg.size,
        });
      }
    });
    return result;
  }, [segments]);

  // Full text from segments
  const fullText = useMemo(() => chars.map(c => c.char).join(''), [chars]);

  // Selection helpers
  const hasSelection = selStart !== null && selEnd !== null && selStart !== selEnd;
  const selMin = hasSelection ? Math.min(selStart!, selEnd!) : null;
  const selMax = hasSelection ? Math.max(selStart!, selEnd!) : null;

  // When selection changes, update tool to match first selected char
  useEffect(() => {
    if (selMin !== null && selMin < chars.length) {
      const c = chars[selMin];
      setToolFont(c.font);
      setToolWeight(c.weight);
      setToolStyle(c.style);
      setToolColor(c.color);
      setToolSize(c.size);
      
      // Find the segment that contains this character to get the disableLigatures flag
      let charCount = 0;
      for (const seg of segments) {
        if (selMin >= charCount && selMin < charCount + seg.text.length) {
          setToolLigatures(!seg.disableLigatures);
          break;
        }
        charCount += seg.text.length;
      }
    }
  }, [selMin, chars, segments]);

  // Determine if the single selected character has PUA alternates
  const availableAlternates = useMemo(() => {
    if (selMin !== null && selMax !== null && selMax - selMin === 1) {
      const char = chars[selMin].char;
      let baseChar = char;
      
      // If char is already an alternate, find base
      for (const [base, alts] of Object.entries(PUA_MAPPING)) {
        if (alts.some((a: any) => a.pua_char === char)) {
          baseChar = base;
          break;
        }
      }
      
      const alts = PUA_MAPPING[baseChar];
      if (alts && alts.length > 0) {
        return { baseChar, alts };
      }
    }
    return null;
  }, [selMin, selMax, chars]);

  // Apply current tool settings to selected range
  const applyToSelection = useCallback(() => {
    if (selMin === null || selMax === null) return;

    // Build new segments by splitting at selection boundaries
    const newSegments: Segment[] = [];
    let charIdx = 0;

    for (const seg of segments) {
      const segStart = charIdx;
      const segEnd = charIdx + seg.text.length;

      // No overlap with selection
      if (segEnd <= selMin || segStart >= selMax) {
        newSegments.push({ ...seg });
      }
      // Fully inside selection
      else if (segStart >= selMin && segEnd <= selMax) {
        newSegments.push({
          ...seg,
          font: toolFont,
          weight: toolWeight,
          style: toolStyle,
          color: toolColor,
          size: toolSize,
          disableLigatures: !toolLigatures,
        });
      }
      // Partial overlap
      else {
        // Before selection
        if (segStart < selMin) {
          newSegments.push({
            ...seg,
            text: seg.text.slice(0, selMin - segStart),
          });
        }
        // Selected part
        const overlapStart = Math.max(0, selMin - segStart);
        const overlapEnd = Math.min(seg.text.length, selMax - segStart);
        newSegments.push({
          text: seg.text.slice(overlapStart, overlapEnd),
          font: toolFont,
          weight: toolWeight,
          style: toolStyle,
          color: toolColor,
          size: toolSize,
          disableLigatures: !toolLigatures,
        });
        // After selection
        if (segEnd > selMax) {
          newSegments.push({
            ...seg,
            text: seg.text.slice(selMax - segStart),
          });
        }
      }
      charIdx = segEnd;
    }

    // Merge adjacent segments with identical styles
    const merged: Segment[] = [];
    for (const seg of newSegments) {
      if (seg.text.length === 0) continue;
      const last = merged[merged.length - 1];
      if (last && last.font === seg.font && last.weight === seg.weight && last.style === seg.style && last.color === seg.color && last.size === seg.size && last.disableLigatures === seg.disableLigatures) {
        last.text += seg.text;
      } else {
        merged.push({ ...seg });
      }
    }

    setSegments(merged);
  }, [selMin, selMax, segments, toolFont, toolWeight, toolStyle, toolColor, toolSize, toolLigatures]);

  // Apply a specific PUA character (alternate) to the selected character
  const applyAlternate = useCallback((puaChar: string) => {
    if (selMin === null || selMax === null || selMax - selMin !== 1) return;

    const newSegments: Segment[] = [];
    let charIdx = 0;

    for (const seg of segments) {
      const segStart = charIdx;
      const segEnd = charIdx + seg.text.length;

      if (segEnd <= selMin || segStart >= selMax) {
        newSegments.push({ ...seg });
      } else {
        const splitIdx = selMin - segStart;
        if (splitIdx > 0) {
          newSegments.push({ ...seg, text: seg.text.slice(0, splitIdx) });
        }
        newSegments.push({
          ...seg,
          text: puaChar,
          font: 'EsmeraldaPro-PUA',
        });
        if (splitIdx + 1 < seg.text.length) {
          newSegments.push({ ...seg, text: seg.text.slice(splitIdx + 1) });
        }
      }
      charIdx = segEnd;
    }

    const merged: Segment[] = [];
    for (const seg of newSegments) {
      if (seg.text.length === 0) continue;
      const last = merged[merged.length - 1];
      if (last && last.font === seg.font && last.weight === seg.weight && last.style === seg.style && last.color === seg.color && last.size === seg.size) {
        last.text += seg.text;
      } else {
        merged.push({ ...seg });
      }
    }

    setSegments(merged);
    setToolFont('EsmeraldaPro-PUA');
  }, [selMin, selMax, segments]);

  // Select All shortcut
  const selectAll = useCallback(() => {
    setSelStart(0);
    setSelEnd(chars.length);
  }, [chars.length]);

  // Character click/drag handlers
  const handleCharMouseDown = useCallback((idx: number) => {
    setSelStart(idx);
    setSelEnd(idx + 1);
    setIsDragging(true);
  }, []);

  const handleCharMouseEnter = useCallback((idx: number) => {
    if (isDragging) {
      setSelEnd(idx + 1);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // Text rewrite mode
  const handleStartEditText = useCallback(() => {
    setEditText(fullText);
    setIsEditingText(true);
  }, [fullText]);

  const handleConfirmEditText = useCallback(() => {
    // Replace all segments with one segment using current tool settings
    setSegments([{
      text: editText,
      font: toolFont,
      size: toolSize,
      color: toolColor,
      weight: toolWeight,
      style: toolStyle,
    }]);
    setIsEditingText(false);
    setSelStart(null);
    setSelEnd(null);
  }, [editText, toolFont, toolSize, toolColor, toolWeight, toolStyle]);

  // Save handler
  const handleSave = useCallback(() => {
    onSave({
      spanKey,
      segments,
      bbox,
    });
  }, [onSave, spanKey, segments, bbox]);

  // Reset to original
  const handleReset = useCallback(() => {
    setSegments([{
      text: originalText,
      font: originalFont,
      size: originalSize,
      color: originalColor,
      weight: originalWeight,
      style: originalStyle,
    }]);
    setSelStart(null);
    setSelEnd(null);
    onSave(null);
  }, [originalText, originalFont, originalSize, originalColor, originalWeight, originalStyle, onSave]);

  const fontToCSS = (f: string) => {
    if (f.includes('Optima') || f === 'OptimaLTStd') return "'OptimaLTStd', serif";
    if (f.includes('Garamond') || f === 'AGaramondPro') return "'AGaramondPro', serif";
    if (f === 'CinzelLocal' || f.includes('Cinzel')) return "'CinzelLocal', 'Cinzel', serif";
    if (f.includes('Decorative')) return "'Cinzel Decorative', serif";
    if (f === 'EsmeraldaPro-PUA') return "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif";
    if (f.includes('Esmeralda') || f === 'EsmeraldaPro') return "'EsmeraldaPro', serif";
    if (f === 'Inter') return "'Inter', sans-serif";
    return `'${f}', serif`;
  };

  return (
    <div className="rse-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rse-panel">
        {/* Header */}
        <div className="rse-header">
          <div>
            <h3>✏️ Rich Span Editor</h3>
            <span className="rse-subtitle">Page {pageNumber} · <code>{spanKey}</code></span>
          </div>
          <button className="rse-close" onClick={onClose}>✕</button>
        </div>

        {/* Toolbar */}
        <div className="rse-toolbar">
          <div className="rse-toolbar-row">
            <select value={toolFont} onChange={e => setToolFont(e.target.value)} title="Font Family">
              {AVAILABLE_FONTS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select value={toolWeight} onChange={e => setToolWeight(Number(e.target.value))} title="Weight">
              {FONT_WEIGHTS.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <button
              className={`rse-tool-btn ${toolWeight >= 600 ? 'active' : ''}`}
              onClick={() => setToolWeight(w => w >= 600 ? 400 : 700)}
              title="Bold"
            ><strong>B</strong></button>
            <button
              className={`rse-tool-btn ${toolStyle === 'italic' ? 'active' : ''}`}
              onClick={() => setToolStyle(s => s === 'italic' ? 'normal' : 'italic')}
              title="Italic"
            ><em>I</em></button>
            <button
              className={`rse-tool-btn ${toolLigatures ? 'active' : ''}`}
              onClick={() => setToolLigatures(!toolLigatures)}
              title="Ligatures (ct, st, etc)"
              style={{ fontFamily: 'EsmeraldaPro' }}
            >fi</button>
            <input type="color" value={toolColor} onChange={e => setToolColor(e.target.value)} title="Color" className="rse-color-input" />
            <input type="number" value={toolSize} onChange={e => setToolSize(Number(e.target.value))} min={4} max={72} step={0.5} className="rse-size-input" title="Size (pt)" />
          </div>
          <div className="rse-toolbar-row">
            <button className="rse-tool-btn" onClick={applyToSelection} disabled={!hasSelection}>
              🎨 Apply to Selection
            </button>
            <button className="rse-tool-btn" onClick={selectAll}>Select All</button>
            <button className="rse-tool-btn" onClick={handleStartEditText}>📝 Edit Text</button>
          </div>
        </div>

        {/* Text Rewrite Input */}
        {isEditingText && (
          <div className="rse-edit-text">
            <label>Rewrite text:</label>
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="rse-edit-text-actions">
              <button onClick={() => setIsEditingText(false)}>Cancel</button>
              <button className="rse-apply" onClick={handleConfirmEditText}>Confirm</button>
            </div>
          </div>
        )}

        {/* Character Grid – select characters individually */}
        <div className="rse-section">
          <label>Character Selection <span className="rse-hint">(click &amp; drag to select)</span></label>
          <div className="rse-char-grid" ref={charGridRef}>
            {chars.map((c, idx) => {
              const isSelected = selMin !== null && selMax !== null && idx >= selMin && idx < selMax;
              return (
                <span
                  key={idx}
                  className={`rse-char ${isSelected ? 'rse-char-selected' : ''}`}
                  style={{
                    fontFamily: fontToCSS(c.font),
                    fontWeight: c.weight,
                    fontStyle: c.style,
                    color: c.color,
                  }}
                  onMouseDown={() => handleCharMouseDown(idx)}
                  onMouseEnter={() => handleCharMouseEnter(idx)}
                >
                  {c.char === ' ' ? '\u00A0' : c.char}
                </span>
              );
            })}
          </div>
          
          {availableAlternates && (
            <div className="rse-alternates">
              <label style={{ marginTop: 12 }}>Available Alternates ({availableAlternates.baseChar}):</label>
              <div className="rse-alt-grid">
                <button 
                  className="rse-alt-btn"
                  onClick={() => applyAlternate(availableAlternates.baseChar)}
                >
                  <span style={{ fontFamily: 'EsmeraldaPro' }}>{availableAlternates.baseChar}</span>
                  <span className="rse-alt-label">Normal</span>
                </button>
                {availableAlternates.alts.map((alt: any) => (
                  <button 
                    key={alt.name}
                    className="rse-alt-btn"
                    onClick={() => applyAlternate(alt.pua_char)}
                  >
                    <span style={{ fontFamily: "'EsmeraldaPro-PUA', 'EsmeraldaPro', serif", fontSize: 24 }}>{alt.pua_char}</span>
                    <span className="rse-alt-label">{alt.name.replace('.swsh', ' swash').replace('.alt', ' alt').split('.')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>



        {/* Segment Info (debug) */}
        <div className="rse-section rse-segments-info">
          <label>Segments ({segments.length})</label>
          <div className="rse-segments-list">
            {segments.map((seg, i) => (
              <div key={i} className="rse-segment-chip">
                <span className="rse-seg-text">"{seg.text.length > 20 ? seg.text.slice(0, 20) + '…' : seg.text}"</span>
                <span className="rse-seg-meta">{seg.font} · {seg.weight} · {seg.style} · {seg.color}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer: Save */}
        <div className="rse-footer">
          <div className="rse-footer-actions">
            <button className="rse-btn-reset" onClick={handleReset}>Reset</button>
            <button className="rse-btn-save" onClick={handleSave}>💾 Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};
