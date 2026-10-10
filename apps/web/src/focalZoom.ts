export const MIN_VIEWER_ZOOM = 0.25;
export const MAX_VIEWER_ZOOM = 4;

export interface ViewerViewport {
  left: number;
  top: number;
  clientLeft?: number;
  clientTop?: number;
  clientWidth: number;
  clientHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
}

export interface ViewerPageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DocumentFocalPoint {
  /** PDF coordinates in the page's unscaled coordinate system. */
  pageX: number;
  pageY: number;
  /** Position inside the scroll viewport's client box. */
  viewportX: number;
  viewportY: number;
}

export interface FocalScrollResult {
  requestedScrollLeft: number;
  requestedScrollTop: number;
  scrollLeft: number;
  scrollTop: number;
}

export function clampViewerZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_VIEWER_ZOOM;
  return Math.min(MAX_VIEWER_ZOOM, Math.max(MIN_VIEWER_ZOOM, zoom));
}

export function normalizeWheelDelta(delta: number, deltaMode: number, viewportHeight: number): number {
  if (!Number.isFinite(delta)) return 0;
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * Math.max(1, viewportHeight);
  return delta;
}

/**
 * Returns null for regular scrolling or an event the viewer cannot consume.
 * Chromium reports trackpad pinch as a Ctrl+wheel event, so the same smooth
 * exponential scale calculation works for both physical wheel and pinch.
 */
export function ctrlWheelZoomLevel(input: {
  ctrlKey: boolean;
  cancelable: boolean;
  deltaY: number;
  deltaMode: number;
  viewportHeight: number;
  currentZoom: number;
}): number | null {
  if (!input.ctrlKey || !input.cancelable) return null;
  const deltaPixels = normalizeWheelDelta(input.deltaY, input.deltaMode, input.viewportHeight);
  if (!deltaPixels) return null;
  // A multiplicative curve keeps each event continuous at every zoom level.
  return clampViewerZoom(clampViewerZoom(input.currentZoom) * Math.exp(-deltaPixels * 0.0015));
}

export function captureDocumentFocalPoint(input: {
  clientX: number;
  clientY: number;
  viewport: Pick<ViewerViewport, 'left' | 'top' | 'clientLeft' | 'clientTop'>;
  page: ViewerPageRect;
  pageWidth: number;
  pageHeight: number;
}): DocumentFocalPoint | null {
  const { page, pageWidth, pageHeight } = input;
  if (page.width <= 0 || page.height <= 0 || pageWidth <= 0 || pageHeight <= 0) return null;
  if (input.clientX < page.left || input.clientX > page.left + page.width
    || input.clientY < page.top || input.clientY > page.top + page.height) return null;

  const scaleX = page.width / pageWidth;
  const scaleY = page.height / pageHeight;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null;
  return {
    pageX: (input.clientX - page.left) / scaleX,
    pageY: (input.clientY - page.top) / scaleY,
    viewportX: input.clientX - input.viewport.left - (input.viewport.clientLeft ?? 0),
    viewportY: input.clientY - input.viewport.top - (input.viewport.clientTop ?? 0),
  };
}

/**
 * Compensates scroll after a scale change. The page rect is measured after the
 * new page size has committed but before changing scrollLeft/scrollTop.
 */
export function focalScrollOffsets(input: {
  viewport: ViewerViewport;
  page: ViewerPageRect;
  focal: DocumentFocalPoint;
  pageWidth: number;
  pageHeight: number;
}): FocalScrollResult {
  const { viewport, page, focal, pageWidth, pageHeight } = input;
  const scaleX = page.width / pageWidth;
  const scaleY = page.height / pageHeight;
  const pageOriginX = page.left - viewport.left - (viewport.clientLeft ?? 0);
  const pageOriginY = page.top - viewport.top - (viewport.clientTop ?? 0);
  const desiredLeft = viewport.scrollLeft + pageOriginX + focal.pageX * scaleX - focal.viewportX;
  const desiredTop = viewport.scrollTop + pageOriginY + focal.pageY * scaleY - focal.viewportY;
  return {
    requestedScrollLeft: desiredLeft,
    requestedScrollTop: desiredTop,
    scrollLeft: clampScroll(desiredLeft, viewport.scrollWidth - viewport.clientWidth),
    scrollTop: clampScroll(desiredTop, viewport.scrollHeight - viewport.clientHeight),
  };
}

function clampScroll(value: number, max: number): number {
  const safeMax = Number.isFinite(max) ? Math.max(0, max) : 0;
  return Number.isFinite(value) ? Math.min(safeMax, Math.max(0, value)) : 0;
}
