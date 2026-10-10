import { describe, expect, it } from 'vitest';
import {
  captureDocumentFocalPoint,
  clampViewerZoom,
  ctrlWheelZoomLevel,
  focalScrollOffsets,
  MAX_VIEWER_ZOOM,
  MIN_VIEWER_ZOOM,
  normalizeWheelDelta,
} from '../src/focalZoom';

const viewport = {
  left: 180,
  top: 40,
  clientLeft: 0,
  clientTop: 0,
  clientWidth: 600,
  clientHeight: 500,
  scrollLeft: 120,
  scrollTop: 90,
  scrollWidth: 1400,
  scrollHeight: 1200,
};

function capture(clientX: number, clientY: number) {
  return captureDocumentFocalPoint({
    clientX,
    clientY,
    viewport,
    page: { left: 60, top: -50, width: 820, height: 1060 },
    pageWidth: 820,
    pageHeight: 1060,
  });
}

describe('focal zoom math', () => {
  it.each([
    ['center', 480, 290],
    ['top-left', 60, -50],
    ['bottom-right', 880, 1010],
  ])('preserves the %s page point through zoom in', (_label, clientX, clientY) => {
    const focal = capture(clientX as number, clientY as number)!;
    const result = focalScrollOffsets({
      viewport,
      page: { left: 60, top: -50, width: 1230, height: 1590 },
      focal,
      pageWidth: 820,
      pageHeight: 1060,
    });
    const resultingX = 60 - viewport.left + focal.pageX * 1.5 - (result.scrollLeft - viewport.scrollLeft);
    const resultingY = -50 - viewport.top + focal.pageY * 1.5 - (result.scrollTop - viewport.scrollTop);
    expect(resultingX).toBeCloseTo(focal.viewportX, 5);
    expect(resultingY).toBeCloseTo(focal.viewportY, 5);
  });

  it('preserves the focal point through zoom out when scrolling can represent it', () => {
    const zoomOutViewport = { ...viewport, scrollTop: 300, scrollWidth: 1100, scrollHeight: 900 };
    const focal = captureDocumentFocalPoint({
      clientX: 520,
      clientY: 360,
      viewport: zoomOutViewport,
      page: { left: 60, top: -260, width: 820, height: 1060 },
      pageWidth: 820,
      pageHeight: 1060,
    })!;
    const result = focalScrollOffsets({
      viewport: zoomOutViewport,
      page: { left: 60, top: -260, width: 615, height: 795 },
      focal,
      pageWidth: 820,
      pageHeight: 1060,
    });
    const resultingX = 60 - viewport.left + focal.pageX * 0.75 - (result.scrollLeft - zoomOutViewport.scrollLeft);
    const resultingY = -260 - viewport.top + focal.pageY * 0.75 - (result.scrollTop - zoomOutViewport.scrollTop);
    expect(resultingX).toBeCloseTo(focal.viewportX, 5);
    expect(resultingY).toBeCloseTo(focal.viewportY, 5);
  });

  it('uses actual viewport offsets when a sidebar shifts the viewer', () => {
    const shiftedViewport = { ...viewport, left: 240 };
    const focal = captureDocumentFocalPoint({
      clientX: 540,
      clientY: 280,
      viewport: shiftedViewport,
      page: { left: 300, top: 40, width: 820, height: 1060 },
      pageWidth: 820,
      pageHeight: 1060,
    })!;
    expect(focal.viewportX).toBe(300);
    expect(focal.pageX).toBe(240);
  });

  it('returns a bounded residual pan when an auto-centered page still fits and cannot scroll', () => {
    const fittingViewport = {
      left: 100,
      top: 80,
      clientWidth: 1000,
      clientHeight: 800,
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 1000,
      scrollHeight: 800,
    };
    const focal = captureDocumentFocalPoint({
      clientX: 850,
      clientY: 580,
      viewport: fittingViewport,
      page: { left: 350, top: 230, width: 500, height: 500 },
      pageWidth: 500,
      pageHeight: 500,
    })!;
    const result = focalScrollOffsets({
      viewport: fittingViewport,
      page: { left: 225, top: 105, width: 750, height: 750 },
      focal,
      pageWidth: 500,
      pageHeight: 500,
    });
    const residualPanX = result.scrollLeft - result.requestedScrollLeft;
    const residualPanY = result.scrollTop - result.requestedScrollTop;
    expect(residualPanX).toBe(-125);
    expect(residualPanY).toBe(-50);
    expect(225 - 100 + focal.pageX * 1.5 + residualPanX).toBeCloseTo(focal.viewportX, 5);
    expect(105 - 80 + focal.pageY * 1.5 + residualPanY).toBeCloseTo(focal.viewportY, 5);
  });

  it('clamps zoom at the existing minimum and maximum without invalid numbers', () => {
    expect(clampViewerZoom(-100)).toBe(MIN_VIEWER_ZOOM);
    expect(clampViewerZoom(Number.NaN)).toBe(MIN_VIEWER_ZOOM);
    expect(clampViewerZoom(100)).toBe(MAX_VIEWER_ZOOM);
    expect(ctrlWheelZoomLevel({ ctrlKey: true, cancelable: true, deltaY: -10000, deltaMode: 0, viewportHeight: 500, currentZoom: 3.9 })).toBe(MAX_VIEWER_ZOOM);
    expect(ctrlWheelZoomLevel({ ctrlKey: true, cancelable: true, deltaY: 10000, deltaMode: 0, viewportHeight: 500, currentZoom: 0.26 })).toBe(MIN_VIEWER_ZOOM);
  });

  it('keeps ordinary wheel scrolling outside the zoom handler', () => {
    expect(ctrlWheelZoomLevel({ ctrlKey: false, cancelable: true, deltaY: 100, deltaMode: 0, viewportHeight: 500, currentZoom: 1 })).toBeNull();
    expect(ctrlWheelZoomLevel({ ctrlKey: true, cancelable: false, deltaY: 100, deltaMode: 0, viewportHeight: 500, currentZoom: 1 })).toBeNull();
  });

  it('normalizes line and page wheel deltas for continuous input', () => {
    expect(normalizeWheelDelta(2, 1, 500)).toBe(32);
    expect(normalizeWheelDelta(0.5, 2, 500)).toBe(250);
    const nextZoom = ctrlWheelZoomLevel({ ctrlKey: true, cancelable: true, deltaY: -12, deltaMode: 0, viewportHeight: 500, currentZoom: 1 });
    expect(nextZoom).toBeGreaterThan(1);
    expect(nextZoom).toBeLessThan(1.1);
  });

  it('bounds scroll offsets and never returns NaN or negative scroll', () => {
    const result = focalScrollOffsets({
      viewport: { ...viewport, scrollLeft: Number.NaN, scrollTop: -10, scrollWidth: 300, scrollHeight: 300 },
      page: { left: 60, top: -50, width: 1230, height: 1590 },
      focal: { pageX: 810, pageY: 1050, viewportX: 590, viewportY: 490 },
      pageWidth: 820,
      pageHeight: 1060,
    });
    expect(Number.isFinite(result.scrollLeft)).toBe(true);
    expect(Number.isFinite(result.scrollTop)).toBe(true);
    expect(result.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(result.scrollTop).toBeGreaterThanOrEqual(0);
  });
});
