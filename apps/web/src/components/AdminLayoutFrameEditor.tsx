import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LayoutFrame } from './PageRenderer';
import './AdminLayoutFrameEditor.css';

interface AdminLayoutFrameEditorProps {
  pageElement: HTMLElement | null;
  pageWidth: number;
  sourceBbox: { x: number; y: number; width: number; height: number } | null;
  unitKey: string | null;
  frame: LayoutFrame | null;
  language: 'en' | 'pt-BR';
  hasOwnFrame: boolean;
  isDirty: boolean;
  isSaving: boolean;
  status: string | null;
  onChange: (frame: LayoutFrame) => void;
  onSave: () => void;
  onDiscard: () => void;
  onResetToEnglish: () => void;
}

interface PageRect {
  left: number;
  top: number;
  scale: number;
}

export function AdminLayoutFrameEditor({
  pageElement, pageWidth, sourceBbox, unitKey, frame, language, hasOwnFrame, isDirty, isSaving, status,
  onChange, onSave, onDiscard, onResetToEnglish,
}: AdminLayoutFrameEditorProps) {
  const [pageRect, setPageRect] = useState<PageRect | null>(null);

  useEffect(() => {
    if (!pageElement || pageWidth <= 0) {
      setPageRect(null);
      return;
    }
    let animation = 0;
    const update = () => {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(() => {
        const rect = pageElement.getBoundingClientRect();
        setPageRect({ left: rect.left, top: rect.top, scale: rect.width / pageWidth });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(pageElement);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    update();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [pageElement, pageWidth]);

  if (!pageRect || !Number.isFinite(pageRect.scale) || pageRect.scale <= 0) return null;
  const frameY = frame?.y ?? 0;
  const frameHeight = frame?.height ?? 12;

  const beginDrag = (event: React.PointerEvent<HTMLElement>, resize: boolean) => {
    if (!frame || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = frame;
    const initialY = initial.y ?? 0;
    const initialHeight = initial.height ?? 12;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / pageRect.scale;
      const dy = (moveEvent.clientY - startY) / pageRect.scale;
      const angle = (initial.rotation ?? 0) * Math.PI / 180;
      const frameDx = dx * Math.cos(angle) + dy * Math.sin(angle);
      const frameDy = -dx * Math.sin(angle) + dy * Math.cos(angle);
      onChange(resize
        ? { ...initial, width: Math.max(12, initial.width + frameDx), height: Math.max(8, initialHeight + frameDy) }
        : { ...initial, x: Math.max(0, initial.x + dx), y: Math.max(0, initialY + dy) });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };

  const nudge = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!frame) return;
    const y = frame.y ?? 0;
    const step = event.shiftKey ? 10 : 1;
    const values: Record<string, Partial<LayoutFrame>> = {
      ArrowLeft: { x: Math.max(0, frame.x - step) },
      ArrowRight: { x: frame.x + step },
      ArrowUp: { y: Math.max(0, y - step) },
      ArrowDown: { y: y + step },
    };
    const change = values[event.key];
    if (!change) return;
    event.preventDefault();
    onChange({ ...frame, ...change });
  };

  return createPortal(
    <div className="admin-layout-frame-layer">
      {sourceBbox && (
        <div
          className="admin-layout-source-ink-outline"
          aria-hidden="true"
          style={{
            left: pageRect.left + sourceBbox.x * pageRect.scale,
            top: pageRect.top + sourceBbox.y * pageRect.scale,
            width: sourceBbox.width * pageRect.scale,
            height: sourceBbox.height * pageRect.scale,
          }}
        />
      )}
      {frame && (
        <div
          className="admin-layout-frame-outline"
          role="group"
          aria-label="Selected translation layout frame. Use arrow keys to move by one PDF point; hold Shift for ten points."
          tabIndex={0}
          onKeyDown={nudge}
          onPointerDown={event => beginDrag(event, false)}
          style={{
            left: pageRect.left + frame.x * pageRect.scale,
            top: pageRect.top + frameY * pageRect.scale,
            width: frame.width * pageRect.scale,
            height: frameHeight * pageRect.scale,
            transform: `rotate(${frame.rotation ?? 0}deg)`,
          }}
        >
          <span className="admin-layout-frame-caption">Frame da tradução</span>
          <button
            type="button"
            className="admin-layout-frame-resize"
            aria-label="Resize translation frame"
            onPointerDown={event => beginDrag(event, true)}
            onClick={event => event.stopPropagation()}
          />
        </div>
      )}
      <section className="admin-layout-frame-panel" aria-label="Translation frame controls">
        <strong>Moldura de tradução</strong>
        {unitKey && <code className="admin-layout-frame-unit-key">{unitKey}</code>}
        {frame ? (
          <div className="admin-layout-frame-fields">
            {([
              ['X', 'x'], ['Y', 'y'], ['Largura', 'width'], ['Altura', 'height'], ['Rotação', 'rotation'],
            ] as const).map(([label, field]) => (
              <label key={field}>
                <span>{label}{field === 'rotation' ? ' (°)' : ' (pt)'}</span>
                <input
                  type="number"
                  step={field === 'rotation' ? 1 : 0.5}
                  min={field === 'width' || field === 'height' ? 1 : field === 'rotation' ? 0 : 0}
                  value={Number(((frame[field] ?? 0) as number).toFixed(2))}
                  onChange={event => {
                    const value = Number(event.currentTarget.value);
                    if (!Number.isFinite(value)) return;
                    onChange({ ...frame, [field]: field === 'rotation' ? ((value % 360) + 360) % 360 : Math.max(field === 'width' || field === 'height' ? 1 : 0, value) });
                  }}
                />
              </label>
            ))}
          </div>
        ) : (
          <p>Clique em um bloco editável para selecionar sua moldura.</p>
        )}
        <div className="admin-layout-frame-actions">
          <button type="button" onClick={onSave} disabled={!frame || !isDirty || isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</button>
          <button type="button" onClick={onDiscard} disabled={!frame || !isDirty || isSaving}>Descartar</button>
          {language === 'pt-BR' && hasOwnFrame && (
            <button type="button" onClick={onResetToEnglish} disabled={isSaving}>Herdar EN</button>
          )}
        </div>
        <div className="admin-layout-frame-feedback" role="status" aria-live="polite">
          {status || (language === 'pt-BR' && !hasOwnFrame ? 'PT-BR herda a moldura EN até ser personalizada.' : 'Coordenadas em pontos PDF.')}
        </div>
      </section>
    </div>,
    document.body,
  );
}
