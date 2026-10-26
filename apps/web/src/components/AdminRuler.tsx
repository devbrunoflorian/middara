import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LayoutAlignmentGuide } from '../layoutFrameSnapping';
import './AdminRuler.css';

interface AdminRulerProps {
  portalHost?: HTMLElement | null;
  pageElement: HTMLElement | null;
  pageWidth: number;
  pageHeight: number;
  alignmentGuides?: LayoutAlignmentGuide[];
  selectedGeometry?: HoveredBlockGeometry | null;
}

interface PageRect {
  left: number;
  top: number;
  width: number;
  height: number;
  viewport: ViewportRect;
}

interface ViewportRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
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

export function AdminRuler({ pageElement, pageWidth, pageHeight, alignmentGuides = [], selectedGeometry = null, portalHost = null }: AdminRulerProps) {
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

    const scrollViewport = pageElement.parentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = pageElement.getBoundingClientRect();
        const stageRect = scrollViewport?.getBoundingClientRect();
        const viewport: ViewportRect = scrollViewport && stageRect
          ? {
              left: stageRect.left + scrollViewport.clientLeft,
              top: stageRect.top + scrollViewport.clientTop,
              right: stageRect.left + scrollViewport.clientLeft + scrollViewport.clientWidth,
              bottom: stageRect.top + scrollViewport.clientTop + scrollViewport.clientHeight,
            }
          : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        const next: PageRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewport };
        setPageRect(current => current
          && current.left === next.left && current.top === next.top
          && current.width === next.width && current.height === next.height
          && current.viewport.left === viewport.left && current.viewport.top === viewport.top
          && current.viewport.right === viewport.right && current.viewport.bottom === viewport.bottom
          ? current
          : next);
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(pageElement);
    if (scrollViewport) observer?.observe(scrollViewport);
    window.addEventListener('resize', update);
    // The page is inside .page-stage, which owns scrolling in the single-page
    // viewer. Subscribe directly to it as well as to outer page scrolls; a
    // fixed overlay must be measured against the transformed page after either.
    scrollViewport?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, true);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', update);
    visualViewport?.addEventListener('scroll', update);
    update();

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
      scrollViewport?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update, true);
      visualViewport?.removeEventListener('resize', update);
      visualViewport?.removeEventListener('scroll', update);
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

  const viewport = pageRect.viewport;
  const pageRight = pageRect.left + pageRect.width;
  const pageBottom = pageRect.top + pageRect.height;
  if (pageRight <= viewport.left || pageRect.left >= viewport.right
    || pageBottom <= viewport.top || pageRect.top >= viewport.bottom) return null;

  const horizontalLeft = Math.max(pageRect.left, viewport.left);
  const horizontalRight = Math.min(pageRight, viewport.right);
  const horizontalTop = Math.min(Math.max(pageRect.top - RULER_SIZE_PX, viewport.top), viewport.bottom - RULER_SIZE_PX);
  const verticalTop = Math.max(pageRect.top, viewport.top);
  const verticalBottom = Math.min(pageBottom, viewport.bottom);
  const verticalLeft = Math.min(Math.max(pageRect.left - RULER_SIZE_PX, viewport.left), viewport.right - RULER_SIZE_PX);
  const xOffset = pageRect.left - horizontalLeft;
  const yOffset = pageRect.top - verticalTop;

  const horizontalStyle = {
    left: horizontalLeft,
    top: horizontalTop,
    width: Math.max(0, horizontalRight - horizontalLeft),
    height: RULER_SIZE_PX,
  };
  const verticalStyle = {
    left: verticalLeft,
    top: verticalTop,
    width: RULER_SIZE_PX,
    height: Math.max(0, verticalBottom - verticalTop),
  };
  const geometryPosition = hoveredGeometry ? {
    left: pageRect.left + hoveredGeometry.x * scale,
    top: pageRect.top + hoveredGeometry.y * scale,
    width: hoveredGeometry.width * scale,
    height: hoveredGeometry.height * scale,
  } : null;
  const selectedGuideNodes = selectedGeometry ? (() => {
    const vertical = [selectedGeometry.x, selectedGeometry.x + selectedGeometry.width]
      .map((value, index) => {
        const x = pageRect.left + value * scale;
        if (x < horizontalLeft || x > horizontalRight) return null;
        return <Fragment key={`selected-x-${index}`}>
          <span className="admin-ruler-selected-guide admin-ruler-selected-guide-vertical"
            style={{ left: x, top: verticalTop, height: Math.max(0, verticalBottom - verticalTop) }} />
          <span className="admin-ruler-selected-mark admin-ruler-selected-mark-x"
            style={{ left: x, top: horizontalTop + RULER_SIZE_PX - 4 }} />
        </Fragment>;
      });
    const horizontal = [selectedGeometry.y, selectedGeometry.y + selectedGeometry.height]
      .map((value, index) => {
        const y = pageRect.top + value * scale;
        if (y < verticalTop || y > verticalBottom) return null;
        return <Fragment key={`selected-y-${index}`}>
          <span className="admin-ruler-selected-guide admin-ruler-selected-guide-horizontal"
            style={{ left: horizontalLeft, top: y, width: Math.max(0, horizontalRight - horizontalLeft) }} />
          <span className="admin-ruler-selected-mark admin-ruler-selected-mark-y"
            style={{ left: verticalLeft + RULER_SIZE_PX - 4, top: y }} />
        </Fragment>;
      });
    return [...vertical, ...horizontal];
  })() : null;
  const snapGuideNodes = alignmentGuides.flatMap((guide, index) => {
    if (guide.axis === 'x') {
      const x = pageRect.left + guide.value * scale;
      if (x < horizontalLeft || x > horizontalRight) return [];
      return [
        <span key={index * 2} className="admin-ruler-snap-guide admin-ruler-snap-guide-vertical"
          style={{ left: x, top: verticalTop, height: Math.max(0, verticalBottom - verticalTop) }} />,
        <span key={index * 2 + 1} className="admin-ruler-snap-mark admin-ruler-snap-mark-x"
          title={guide.label} style={{ left: x, top: horizontalTop + RULER_SIZE_PX - 5 }} />,
      ];
    }
    const y = pageRect.top + guide.value * scale;
    if (y < verticalTop || y > verticalBottom) return [];
    return [
      <span key={index * 2} className="admin-ruler-snap-guide admin-ruler-snap-guide-horizontal"
        style={{ left: horizontalLeft, top: y, width: Math.max(0, horizontalRight - horizontalLeft) }} />,
      <span key={index * 2 + 1} className="admin-ruler-snap-mark admin-ruler-snap-mark-y"
        title={guide.label} style={{ left: verticalLeft + RULER_SIZE_PX - 5, top: y }} />,
    ];
  });

  return createPortal(
    <>
      <div className="admin-ruler-layer" aria-hidden="true">
        {selectedGuideNodes}
        {snapGuideNodes}
        <div className="admin-ruler-corner" style={{ left: verticalStyle.left, top: horizontalStyle.top }} />
        <div className="admin-ruler admin-ruler-horizontal" style={horizontalStyle}>
          {xTicks.map(value => (
            <span
              key={value}
              className={`admin-ruler-tick ${value % LABEL_INTERVAL_PT === 0 ? 'labeled' : ''}`}
              style={{ left: `${xOffset + value * scale}px` }}
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
              style={{ top: `${yOffset + value * scale}px` }}
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
            className="admin-geometry-chip admin-geometry-chip-x2"
            style={{ left: geometryPosition.left + geometryPosition.width + 6, top: geometryPosition.top + geometryPosition.height / 2 }}
            title="Coordenada final X₂ na régua: X + largura"
            aria-label={`X₂, coordenada final ${(hoveredGeometry.x + hoveredGeometry.width).toFixed(2)} pontos PDF`}
          >X₂ {(hoveredGeometry.x + hoveredGeometry.width).toFixed(2)} pt</span>
          <span
            className="admin-geometry-chip admin-geometry-chip-width"
            style={{ left: geometryPosition.left + Math.max(0, geometryPosition.width - 92), top: geometryPosition.top - 17 }}
            title="Largura da moldura: X₂ − X"
            aria-label={`Largura ${(hoveredGeometry.x + hoveredGeometry.width - hoveredGeometry.x).toFixed(2)} pontos PDF`}
          >L {(hoveredGeometry.x + hoveredGeometry.width - hoveredGeometry.x).toFixed(2)} pt</span>
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
    portalHost ?? document.body,
  );
}
