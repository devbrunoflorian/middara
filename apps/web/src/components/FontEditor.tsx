import React, { useState, useEffect, useCallback } from 'react';
import './FontEditor.css';

/* ─────────────────────────────────────────────
   Available font families for the dropdown.
   These match exactly what's declared in fonts.css
   ───────────────────────────────────────────── */
const AVAILABLE_FONTS = [
  { label: 'Optima LT Std', value: "'OptimaLTStd', 'Optima', serif" },
  { label: 'Adobe Garamond Pro', value: "'AGaramondPro', 'EB Garamond', serif" },
  { label: 'Cinzel', value: "'CinzelLocal', 'Cinzel', serif" },
  { label: 'Cinzel Decorative', value: "'Cinzel Decorative', serif" },
  { label: 'Esmeralda Pro', value: "'EsmeraldaPro', 'Georgia', serif" },
  { label: 'Middara Hybrid (Cinzel caps + Esmeralda lower)', value: "'MiddaraHybrid', serif" },
  { label: 'Inter (sans-serif)', value: "'Inter', 'Helvetica', sans-serif" },
];

const FONT_WEIGHTS = [
  { label: '400 (Regular)', value: 400 },
  { label: '500 (Medium)', value: 500 },
  { label: '600 (DemiBold)', value: 600 },
  { label: '700 (Bold)', value: 700 },
  { label: '900 (Black)', value: 900 },
  { label: '950 (Extra Black)', value: 950 },
];

export interface FontOverride {
  spanKey: string;       // unique identifier: "page_X_block_Y_line_Z_span_W"
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  color?: string;
  size?: number;
}

interface SpanInfo {
  text: string;
  font: string;          // original PDF font name
  family: string;        // currently resolved CSS family
  weight: number;
  style: 'normal' | 'italic';
  color: string;
  size: number;
  spanKey: string;
  bbox: [number, number, number, number];
}

interface FontEditorProps {
  span: SpanInfo | null;
  onClose: () => void;
  onApply: (override: FontOverride) => void;
  overrides: Map<string, FontOverride>;
}

export const FontEditor: React.FC<FontEditorProps> = ({ span, onClose, onApply, overrides }) => {
  const [family, setFamily] = useState('');
  const [weight, setWeight] = useState(400);
  const [style, setStyle] = useState<'normal' | 'italic'>('normal');
  const [color, setColor] = useState('#231f20');
  const [size, setSize] = useState(12);

  // Sync editor state when a new span is selected
  useEffect(() => {
    if (!span) return;
    const existing = overrides.get(span.spanKey);
    if (existing) {
      setFamily(existing.family);
      setWeight(existing.weight);
      setStyle(existing.style);
      setColor(existing.color || span.color);
      setSize(existing.size || span.size);
    } else {
      setFamily(span.family);
      setWeight(span.weight);
      setStyle(span.style);
      setColor(span.color);
      setSize(span.size);
    }
  }, [span, overrides]);

  const handleApply = useCallback(() => {
    if (!span) return;
    onApply({
      spanKey: span.spanKey,
      family,
      weight,
      style,
      color,
      size,
    });
  }, [span, family, weight, style, color, size, onApply]);

  const handleReset = useCallback(() => {
    if (!span) return;
    setFamily(span.family);
    setWeight(span.weight);
    setStyle(span.style);
    setColor(span.color);
    setSize(span.size);
    // Remove override by applying original values
    onApply({
      spanKey: span.spanKey,
      family: span.family,
      weight: span.weight,
      style: span.style,
      color: span.color,
      size: span.size,
    });
  }, [span, onApply]);

  if (!span) return null;

  const previewStyle: React.CSSProperties = {
    fontFamily: family,
    fontWeight: weight,
    fontStyle: style,
    color: color,
    fontSize: `${Math.max(size * 1.5, 18)}px`,
    lineHeight: 1.3,
    padding: '12px',
    background: '#EFE4CD',
    borderRadius: '6px',
    minHeight: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    wordBreak: 'break-word',
  };

  return (
    <div className="font-editor-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="font-editor-panel">
        <div className="font-editor-header">
          <h3>🎨 Font Editor</h3>
          <button className="font-editor-close" onClick={onClose}>✕</button>
        </div>

        {/* Original info */}
        <div className="font-editor-info">
          <span className="font-editor-label">PDF Font:</span>
          <code>{span.font}</code>
        </div>
        <div className="font-editor-info">
          <span className="font-editor-label">Span Key:</span>
          <code className="font-editor-key">{span.spanKey}</code>
        </div>

        {/* Live Preview */}
        <div className="font-editor-section">
          <label>Live Preview</label>
          <div style={previewStyle}>
            {span.text}
          </div>
        </div>

        {/* Font Family */}
        <div className="font-editor-section">
          <label>Font Family</label>
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            {AVAILABLE_FONTS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Weight */}
        <div className="font-editor-section">
          <label>Weight</label>
          <select value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
            {FONT_WEIGHTS.map(w => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>

        {/* Style */}
        <div className="font-editor-section">
          <label>Style</label>
          <div className="font-editor-toggle">
            <button 
              className={style === 'normal' ? 'active' : ''}
              onClick={() => setStyle('normal')}
            >Normal</button>
            <button 
              className={style === 'italic' ? 'active' : ''}
              onClick={() => setStyle('italic')}
            >Italic</button>
          </div>
        </div>

        {/* Color */}
        <div className="font-editor-section font-editor-row">
          <div>
            <label>Color</label>
            <div className="font-editor-color-row">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="font-editor-color-text" />
            </div>
          </div>
          <div>
            <label>Size (pt)</label>
            <input type="number" value={size} step={0.5} min={4} max={72}
              onChange={(e) => setSize(Number(e.target.value))}
              className="font-editor-number"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="font-editor-actions">
          <button className="font-editor-btn reset" onClick={handleReset}>Reset to Original</button>
          <button className="font-editor-btn apply" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
};

export type { SpanInfo };
