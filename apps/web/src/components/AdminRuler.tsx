import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import './AdminRuler.css';

interface AdminRulerProps {
  pageElement: HTMLElement | null;
  pageWidth: number;
  pageHeight: number;
}

interface PageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const LABEL_INTERVAL_PT = 100;
const TICK_INTERVAL_PT = 10;
const RULER_SIZE_PX = 22;

export function AdminRuler({ pageElement, pageWidth, pageHeight }: AdminRulerProps) {
  const [pageRect, setPageRect] = useState<PageRect | null>(null);

  useEffect(() => {
    if (!pageElement) {
      setPageRect(null);
      return;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = pageElement.getBoundingClientRect();
        setPageRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(pageElement);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    update();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [pageElement, pageWidth, pageHeight]);

  const scale = pageRect && pageWidth > 0 ? pageRect.width / pageWidth : 0;
  const xTicks = useMemo(() => {
    if (!scale) return [];
    const count = Math.floor(pageWidth / TICK_INTERVAL_PT);
    return Array.from({ length: count + 1 }, (_, index) => index * TICK_INTERVAL_PT);
  }, [pageWidth, scale]);
  const yTicks = useMemo(() => {
    if (!scale) return [];
    const count = Math.floor(pageHeight / TICK_INTERVAL_PT);
    return Array.from({ length: count + 1 }, (_, index) => index * TICK_INTERVAL_PT);
  }, [pageHeight, scale]);

  if (!pageRect || !Number.isFinite(scale) || scale <= 0) return null;

  const horizontalStyle = {
    left: pageRect.left,
    top: pageRect.top - RULER_SIZE_PX,
    width: pageRect.width,
    height: RULER_SIZE_PX,
  };
  const verticalStyle = {
    left: pageRect.left - RULER_SIZE_PX,
    top: pageRect.top,
    width: RULER_SIZE_PX,
    height: pageRect.height,
  };

  return createPortal(
    <div className="admin-ruler-layer" aria-hidden="true">
      <div className="admin-ruler-corner" style={{ left: verticalStyle.left, top: horizontalStyle.top }} />
      <div className="admin-ruler admin-ruler-horizontal" style={horizontalStyle}>
        {xTicks.map(value => (
          <span
            key={value}
            className={`admin-ruler-tick ${value % LABEL_INTERVAL_PT === 0 ? 'labeled' : ''}`}
            style={{ left: `${value * scale}px` }}
          >
            {value % LABEL_INTERVAL_PT === 0 ? <span>{value}</span> : null}
          </span>
        ))}
        <span className="admin-ruler-end-label" style={{ right: 2 }}>{Math.round(pageWidth)} pt</span>
      </div>
      <div className="admin-ruler admin-ruler-vertical" style={verticalStyle}>
        {yTicks.map(value => (
          <span
            key={value}
            className={`admin-ruler-tick ${value % LABEL_INTERVAL_PT === 0 ? 'labeled' : ''}`}
            style={{ top: `${value * scale}px` }}
          >
            {value % LABEL_INTERVAL_PT === 0 ? <span>{value}</span> : null}
          </span>
        ))}
      </div>
    </div>,
    document.body,
  );
}
