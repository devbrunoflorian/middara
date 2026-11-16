import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LayoutFrame } from './PageRenderer';
import { snapLayoutFrame, type LayoutAlignmentGuide, type SnapFrameRect } from '../layoutFrameSnapping';
import { canonicalizeLayoutFrame, layoutFrameBottom, layoutFrameRight, layoutFrameTotal, layoutFrameTotalHeight, moveLayoutFrameX, moveLayoutFrameY, resizeLayoutFrameTotal, setLayoutFrameBottom, setLayoutFrameRight } from '../layoutFrameGeometry';
import './AdminLayoutFrameEditor.css';
import './AdminOverlayLayers.css';

interface AdminLayoutFrameEditorProps {
  portalHost?: HTMLElement | null;
  pageElement: HTMLElement | null;
  pageWidth: number;
  pageHeight: number;
  snapTargets: SnapFrameRect[];
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
  onCreateBlock: () => void;
  onSnapGuidesChange: (guides: LayoutAlignmentGuide[]) => void;
}

interface PageRect {
  left: number;
  top: number;
  scale: number;
}

interface NumericFrameFieldProps {
  label: string;
  value: number;
  min: number;
  step: number;
  title?: string;
  language: 'en' | 'pt-BR';
  onCommit: (value: number) => void;
}

function NumericFrameField({ label, value, min, step, title, language, onCommit }: NumericFrameFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
    setError(null);
  }, [value]);

  const commit = (input: HTMLInputElement) => {
    if (draft === null) return;
    const nextValue = input.valueAsNumber;
    const validity = input.validity;
    // PDF-derived coordinates can be fractional values that do not align to
    // the spinner step. Keep the step as a convenient increment, while still
    // enforcing the numeric range and allowing the source precision.
    if (input.value.trim() === '' || !Number.isFinite(nextValue) || validity.badInput
      || validity.rangeUnderflow || validity.rangeOverflow) {
      setError(language === 'pt-BR'
        ? 'Valor inválido; a moldura não foi alterada.'
        : 'Invalid value; the frame was not changed.');
      setDraft(null);
      return;
    }
    setError(null);
    setDraft(null);
    onCommit(nextValue);
  };

  return (
    <label title={title}>
      <span>{label}</span>
      <input
        type="number"
        required
        step={step}
        min={min}
        value={draft ?? Number(value.toFixed(2))}
        onChange={event => {
          setError(null);
          setDraft(event.currentTarget.value);
        }}
        onBlur={event => commit(event.currentTarget)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {error && <span className="admin-layout-frame-field-error" role="alert">{error}</span>}
    </label>
  );
}

export function AdminLayoutFrameEditor({
  portalHost = null, pageElement, pageWidth, pageHeight, snapTargets, sourceBbox, unitKey, frame, language, hasOwnFrame, isDirty, isSaving, status,
  onChange, onSave, onDiscard, onResetToEnglish, onSnapGuidesChange,
  onCreateBlock,
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
  const canonicalFrame = frame ? canonicalizeLayoutFrame(frame) : null;
  const frameY = canonicalFrame?.y ?? 0;
  const frameHeight = canonicalFrame ? layoutFrameTotalHeight(canonicalFrame) : 12;
  const frameWidth = canonicalFrame ? layoutFrameTotal(canonicalFrame) : 0;
  const frameX2 = canonicalFrame ? layoutFrameRight(canonicalFrame) : 0;
  const frameY2 = canonicalFrame ? layoutFrameBottom(canonicalFrame) : 0;

  const beginDrag = (event: React.PointerEvent<HTMLElement>, resize: boolean) => {
    if (!canonicalFrame || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialY = canonicalFrame.y ?? 0;
    const initialHeight = frameHeight || 12;
    const initial = canonicalizeLayoutFrame({
      ...canonicalFrame,
      y: initialY,
      height: initialY + initialHeight,
      totalHeight: initialHeight,
    });
    const initialWidth = layoutFrameTotal(initial);
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / pageRect.scale;
      const dy = (moveEvent.clientY - startY) / pageRect.scale;
      const angle = (initial.rotation ?? 0) * Math.PI / 180;
      const frameDx = dx * Math.cos(angle) + dy * Math.sin(angle);
      const frameDy = -dx * Math.sin(angle) + dy * Math.cos(angle);
      if (resize) {
        onSnapGuidesChange([]);
        onChange(resizeLayoutFrameTotal(initial, Math.max(12, initialWidth + frameDx)));
        return;
      }
      const moved = moveLayoutFrameY(
        moveLayoutFrameX(initial, Math.max(0, initial.x + frameDx)),
        Math.max(0, initialY + frameDy),
      );
      const snapped = snapLayoutFrame(moved, pageWidth, pageHeight, snapTargets, unitKey, pageRect.scale);
      onSnapGuidesChange(snapped.guides);
      onChange(snapped.frame);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      onSnapGuidesChange([]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };

  const nudge = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canonicalFrame) return;
    const y = canonicalFrame.y ?? 0;
    const step = event.shiftKey ? 10 : 1;
    const values: Record<string, Partial<LayoutFrame>> = {
      ArrowLeft: { x: Math.max(0, canonicalFrame.x - step) },
      ArrowRight: { x: canonicalFrame.x + step },
      ArrowUp: { y: Math.max(0, y - step) },
      ArrowDown: { y: y + step },
    };
    const change = values[event.key];
    if (!change) return;
    event.preventDefault();
    const moved = change.x !== undefined
      ? moveLayoutFrameX(canonicalFrame, change.x)
      : canonicalFrame;
    onChange(change.y !== undefined ? moveLayoutFrameY(moved, change.y) : moved);
  };

  return (
    <>
      {createPortal(
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
          {canonicalFrame && (
            <div
              className="admin-layout-frame-outline"
              role="group"
              aria-label="Selected translation layout frame. Use arrow keys to move by one PDF point; hold Shift for ten points."
              tabIndex={0}
              onKeyDown={nudge}
              onPointerDown={event => beginDrag(event, false)}
              style={{
                left: pageRect.left + canonicalFrame.x * pageRect.scale,
                top: pageRect.top + frameY * pageRect.scale,
                width: frameWidth * pageRect.scale,
                height: frameHeight * pageRect.scale,
                transform: `rotate(${canonicalFrame.rotation ?? 0}deg)`,
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
        </div>,
        portalHost ?? document.body,
      )}
      {createPortal(
        <div className="admin-layout-frame-panel-layer">
          <section className="admin-layout-frame-panel arcane-glass-surface" aria-label="Translation frame controls">
            <strong>Moldura de tradução</strong>
            {unitKey && <code className="admin-layout-frame-unit-key">{unitKey}</code>}
            {canonicalFrame?.hidden && (
              <div className="admin-layout-frame-hidden-badge" role="alert">
                ⚠️ Bloco Oculto da Página
              </div>
            )}
            {canonicalFrame ? (
              <div className="admin-layout-frame-fields">
                <NumericFrameField
                  label="X (pt)"
                  value={canonicalFrame.x}
                  min={0}
                  step={0.5}
                  language={language}
                  onCommit={value => onChange(moveLayoutFrameX(canonicalFrame, Math.max(0, value)))}
                />
                <NumericFrameField
                  label="Y (pt)"
                  value={frameY}
                  min={0}
                  step={0.5}
                  language={language}
                  onCommit={value => onChange(canonicalizeLayoutFrame({ ...canonicalFrame, y: Math.max(0, value) }))}
                />
                <NumericFrameField
                  label="Largura (X₂, pt)"
                  title="Coordenada final X₂; o tamanho é calculado como X₂ − X."
                  value={frameX2}
                  min={canonicalFrame.x + 1}
                  step={0.5}
                  language={language}
                  onCommit={value => onChange(setLayoutFrameRight(canonicalFrame, value))}
                />
                <NumericFrameField
                  label="Altura (Y₂, pt)"
                  title="Coordenada final Y₂; o tamanho é calculado como Y₂ − Y."
                  value={frameY2}
                  min={frameY + 1}
                  step={0.5}
                  language={language}
                  onCommit={value => onChange(setLayoutFrameBottom(canonicalFrame, value))}
                />
                <label className="admin-layout-frame-calculated-size" title="Tamanho calculado como X₂ − X.">
                  <span>Total largura (pt)</span>
                  <output aria-label={`Total largura: ${frameWidth.toFixed(2)} pontos PDF`}>{frameWidth.toFixed(2)} pt</output>
                </label>
                <label className="admin-layout-frame-calculated-size" title="Tamanho calculado como Y₂ − Y.">
                  <span>Total altura (pt)</span>
                  <output aria-label={`Total altura: ${frameHeight.toFixed(2)} pontos PDF`}>{frameHeight.toFixed(2)} pt</output>
                </label>
                <NumericFrameField
                  label="Rotação (°)"
                  value={canonicalFrame.rotation ?? 0}
                  min={0}
                  step={1}
                  language={language}
                  onCommit={value => onChange(canonicalizeLayoutFrame({
                    ...canonicalFrame,
                    rotation: ((value % 360) + 360) % 360,
                  }))}
                />
              </div>
            ) : (
              <p>Clique em um bloco editável para selecionar sua moldura.</p>
            )}
            <div className="admin-layout-frame-actions">
              <button type="button" onClick={onCreateBlock} disabled={isSaving || isDirty || language !== 'pt-BR'} title={language !== 'pt-BR' ? 'Crie blocos adicionais na camada PT-BR.' : 'Criar um novo bloco de texto PT-BR nesta página.'}>Novo</button>
              <button type="button" onClick={onSave} disabled={!frame || !isDirty || isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</button>
              <button type="button" onClick={onDiscard} disabled={!frame || !isDirty || isSaving}>Descartar</button>
              {canonicalFrame && (
                <button
                  type="button"
                  className={`admin-layout-frame-toggle-hidden ${canonicalFrame.hidden ? 'is-hidden' : ''}`}
                  onClick={() => onChange({ ...canonicalFrame, hidden: !canonicalFrame.hidden })}
                  disabled={isSaving}
                  title={canonicalFrame.hidden ? 'Tornar este bloco visível novamente' : 'Ocultar este bloco da leitura e prévia'}
                >
                  {canonicalFrame.hidden ? '👁️ Reexibir' : '🗑️ Ocultar'}
                </button>
              )}
              {language === 'pt-BR' && hasOwnFrame && !canonicalFrame?.adminCreatedBlock && (
                <button type="button" onClick={onResetToEnglish} disabled={isSaving}>Herdar EN</button>
              )}
            </div>
            <div className="admin-layout-frame-feedback" role="status" aria-live="polite">
              {status || (language === 'pt-BR' && !hasOwnFrame ? 'PT-BR herda a moldura EN até ser personalizada.' : 'Coordenadas em pontos PDF.')}
            </div>
          </section>
        </div>,
        portalHost ?? document.body,
      )}
    </>
  );
}
