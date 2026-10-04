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

interface HoveredBlockGeometry {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

const LABEL_INTERVAL_PT = 100;
const TICK_INTERVAL_PT = 10;
const RULER_SIZE_PX = 22;

export function AdminRuler({ pageElement, pageWidth, pageHeight }: AdminRulerProps) {
  const [pageRect, setPageRect] = useState<PageRect | null>(null);
  const [hoveredGeometry, setHoveredGeometry] = useState<HoveredBlockGeometry | null>(null);

  useEffect(() => {
    if (!pageElement) {
      setHoveredGeometry(null);
      return;
    }

    const updateHoveredGeometry = (event: PointerEvent) => {
      const eventTarget = event.target;
      const candidate = eventTarget instanceof Element
        ? eventTarget.closest<HTMLElement>('[data-admin-geometry="true"]')
        : null;
      if (!candidate || !pageElement.contains(candidate)) {
        setHoveredGeometry(current => current === null ? current : null);
        return;
      }

      const values = {
        key: candidate.dataset.adminGeometryKey || 'text block',
        x: Number(candidate.dataset.adminGeometryX),
        y: Number(candidate.dataset.adminGeometryY),
        width: Number(candidate.dataset.adminGeometryWidth),
        height: Number(candidate.dataset.adminGeometryHeight),
        rotation: Number(candidate.dataset.adminGeometryRotation),
      };
      if (!Object.values(values).slice(1).every(Number.isFinite)) {
        setHoveredGeometry(null);
        return;
      }

      setHoveredGeometry(current => (
        current && current.key === values.key
          && current.x === values.x && current.y === values.y
          && current.width === values.width && current.height === values.height
          && current.rotation === values.rotation
          ? current
          : values
      ));
    };
    const clearHoveredGeometry = () => setHoveredGeometry(null);
    pageElement.addEventListener('pointermove', updateHoveredGeometry);
    pageElement.addEventListener('pointerleave', clearHoveredGeometry);
    return () => {
      pageElement.removeEventListener('pointermove', updateHoveredGeometry);
      pageElement.removeEventListener('pointerleave', clearHoveredGeometry);
    };
  }, [pageElement]);

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
  const geometryPosition = hoveredGeometry ? {
    left: pageRect.left + hoveredGeometry.x * scale,
    top: pageRect.top + hoveredGeometry.y * scale,
    width: hoveredGeometry.width * scale,
    height: hoveredGeometry.height * scale,
  } : null;

  return createPortal(
    <>
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
      </div>
      {hoveredGeometry && geometryPosition && (
        <div className="admin-geometry-measurements" role="group" aria-label={`Geometria PDF do bloco ${hoveredGeometry.key}`}>
          <span
            className="admin-geometry-chip admin-geometry-chip-x"
            style={{ left: geometryPosition.left - 6, top: geometryPosition.top + geometryPosition.height / 2 }}
          >X {hoveredGeometry.x.toFixed(2)} pt</span>
          <span
            className="admin-geometry-chip admin-geometry-chip-y"
            style={{ left: geometryPosition.left + geometryPosition.width / 2, top: geometryPosition.top - 6 }}
          >Y {hoveredGeometry.y.toFixed(2)} pt</span>
          <span
            className="admin-geometry-chip admin-geometry-chip-width"
            style={{ left: geometryPosition.left + geometryPosition.width + 6, top: geometryPosition.top + geometryPosition.height / 2 }}
          >L {hoveredGeometry.width.toFixed(2)} pt</span>
          <span
            className="admin-geometry-chip admin-geometry-chip-height"
            style={{ left: geometryPosition.left + geometryPosition.width / 2, top: geometryPosition.top + geometryPosition.height + 6 }}
          >A {hoveredGeometry.height.toFixed(2)} pt</span>
          <span
            className="admin-geometry-chip admin-geometry-chip-rotation"
            style={{ left: geometryPosition.left + geometryPosition.width + 6, top: geometryPosition.top - 6 }}
          >↻ {hoveredGeometry.rotation.toFixed(2)}°</span>
        </div>
      )}
    </>,
    document.body,
  );
}
