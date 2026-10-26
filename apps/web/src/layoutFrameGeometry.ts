export interface LayoutFrameCoordinates {
  x: number;
  /** X₂/right-edge coordinate in the canonical shape; width in legacy records. */
  width: number;
  y?: number;
  /** Y₂/bottom-edge coordinate in the canonical shape; height in legacy records. */
  height?: number;
  /** Physical frame width in PDF points. Missing only in legacy records. */
  total?: number;
  /** Physical frame height in PDF points. Missing only in legacy records. */
  totalHeight?: number;
}

/** Return the physical width while accepting legacy records whose width is already a size. */
export function layoutFrameTotal(frame: LayoutFrameCoordinates): number {
  return typeof frame.total === 'number' && Number.isFinite(frame.total)
    ? frame.total
    : frame.width;
}

/** Return the right edge, accepting both canonical X₂ and legacy size records. */
export function layoutFrameRight(frame: LayoutFrameCoordinates): number {
  return frame.x + layoutFrameTotal(frame);
}

export function layoutFrameTotalHeight(frame: LayoutFrameCoordinates): number {
  return typeof frame.totalHeight === 'number' && Number.isFinite(frame.totalHeight)
    ? frame.totalHeight
    : typeof frame.height === 'number' && Number.isFinite(frame.height) ? frame.height : 0;
}

export function layoutFrameBottom(frame: LayoutFrameCoordinates): number {
  return (frame.y ?? 0) + layoutFrameTotalHeight(frame);
}

/** Convert a legacy frame to X₂ + Total while preserving all other stored properties. */
export function canonicalizeLayoutFrame<T extends LayoutFrameCoordinates>(frame: T): T & { total: number } {
  const total = layoutFrameTotal(frame);
  const hasHeight = typeof frame.totalHeight === 'number' && Number.isFinite(frame.totalHeight)
    || typeof frame.height === 'number' && Number.isFinite(frame.height);
  const totalHeight = hasHeight ? layoutFrameTotalHeight(frame) : undefined;
  return {
    ...frame,
    total,
    width: frame.x + total,
    ...(totalHeight === undefined ? {} : { totalHeight, height: (frame.y ?? 0) + totalHeight }),
  };
}

export function moveLayoutFrameX<T extends LayoutFrameCoordinates>(frame: T, x: number): T & { total: number } {
  const canonical = canonicalizeLayoutFrame(frame);
  return { ...canonical, x, width: x + canonical.total };
}

export function moveLayoutFrameY<T extends LayoutFrameCoordinates>(frame: T, y: number): T & { total: number } {
  const canonical = canonicalizeLayoutFrame(frame);
  return {
    ...canonical,
    y,
    ...(canonical.totalHeight === undefined ? {} : { height: y + canonical.totalHeight }),
  };
}

export function resizeLayoutFrameTotal<T extends LayoutFrameCoordinates>(frame: T, total: number): T & { total: number } {
  const canonical = canonicalizeLayoutFrame(frame);
  return { ...canonical, total, width: canonical.x + total };
}

export function resizeLayoutFrameTotalHeight<T extends LayoutFrameCoordinates>(frame: T, totalHeight: number): T & { total: number } {
  const canonical = canonicalizeLayoutFrame(frame);
  return { ...canonical, totalHeight, height: (canonical.y ?? 0) + totalHeight };
}

export function setLayoutFrameRight<T extends LayoutFrameCoordinates>(frame: T, right: number): T & { total: number } {
  return resizeLayoutFrameTotal(frame, Math.max(1, right - frame.x));
}

export function setLayoutFrameBottom<T extends LayoutFrameCoordinates>(frame: T, bottom: number): T & { total: number } {
  return resizeLayoutFrameTotalHeight(frame, Math.max(1, bottom - (frame.y ?? 0)));
}
