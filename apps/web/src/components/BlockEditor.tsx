import React, { useState } from 'react';
import './RichSpanEditor.css'; // We'll keep the same CSS file for the modal for now

export interface BlockOverride {
  blockKey: string;
  text: string;
  semanticClass: 'body' | 'heading1' | 'stat';
  bbox: [number, number, number, number];
}

interface BlockEditorProps {
  blockKey: string;
  originalText: string;
  inferredClass: 'body' | 'heading1' | 'stat';
  bbox: [number, number, number, number];
  pageNumber: number;
  onClose: () => void;
  onSave: (override: BlockOverride | null) => void;
  existingOverride?: BlockOverride | null;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({
  blockKey,
  originalText,
  inferredClass,
  bbox,
  pageNumber,
  onClose,
  onSave,
  existingOverride,
}) => {
  const [text, setText] = useState(existingOverride?.text || originalText);
  const [semanticClass, setSemanticClass] = useState<'body' | 'heading1' | 'stat'>(
    existingOverride?.semanticClass || inferredClass
  );

  const handleSave = () => {
    onSave({
      blockKey,
      text,
      semanticClass,
      bbox,
    });
  };

  const handleReset = () => {
    onSave(null);
  };

  return (
    <div className="rse-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rse-panel arcane-glass-surface" style={{ width: '600px' }}>
        <div className="rse-header">
          <div>
            <h3>📝 Block Translator</h3>
            <span className="rse-subtitle">Page {pageNumber} · <code>{blockKey}</code></span>
          </div>
          <button className="rse-close" onClick={onClose}>✕</button>
        </div>

        <div className="rse-section">
          <label>Semantic Style</label>
          <select value={semanticClass} onChange={(e) => setSemanticClass(e.target.value as any)} style={{ padding: '8px', width: '100%' }}>
            <option value="body">Body Text (Garamond)</option>
            <option value="heading1">Title/Heading (Esmeralda/Cinzel)</option>
            <option value="stat">Stat / Label (Optima Bold)</option>
          </select>
        </div>

        <div className="rse-section">
          <label>Translation</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            style={{ width: '100%', padding: '12px', fontSize: '16px', lineHeight: 1.5, fontFamily: 'sans-serif' }}
            autoFocus
          />
        </div>

        <div className="rse-footer">
          <div className="rse-footer-actions">
            <button className="rse-btn-reset" onClick={handleReset}>Reset to English</button>
            <button className="rse-btn-save" onClick={handleSave}>💾 Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};
