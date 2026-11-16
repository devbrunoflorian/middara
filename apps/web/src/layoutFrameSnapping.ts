export interface SnapFrameRect {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface LayoutAlignmentGuide {
  axis: 'x' | 'y';
  value: number;
  label: string;
}

interface FrameGeometry {
  x: number;
  y: number;
  /** X₂ in canonical layout frames; physical width in legacy frames and snap targets. */
  width: number;
  /** Physical frame width; absent only for legacy frames and snap targets. */
  total?: number;
  /** Physical frame height; absent only for legacy frames and snap targets. */
  totalHeight?: number;
  height: number;
  rotation?: number;
}

function axisAlignedBounds(frame: FrameGeometry) {
  const frameWidth = frame.total ?? frame.width;
  const frameHeight = frame.totalHeight ?? frame.height;
  const angle = (frame.rotation ?? 0) * Math.PI / 180;
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  const width = frameWidth * cosine + frameHeight * sine;
  const height = frameWidth * sine + frameHeight * cosine;
  return {
    left: frame.x + (frameWidth - width) / 2,
    right: frame.x + (frameWidth + width) / 2,
    top: frame.y + (frameHeight - height) / 2,
    bottom: frame.y + (frameHeight + height) / 2,
  };
}

function nearestSnap(
  features: Array<{ value: number; name: string }>,
  guides: Array<{ value: number; label: string }>,
  scale: number,
  thresholdPx: number,
) {
  let best: { delta: number; guide: { value: number; label: string }; distance: number } | null = null;
  for (const feature of features) {
    for (const guide of guides) {
      const delta = guide.value - feature.value;
      const distance = Math.abs(delta) * scale;
      if (distance > thresholdPx || (best && distance >= best.distance - 0.001)) continue;
      best = { delta, guide, distance };
    }
  }
  return best;
}

/** Snap a moving PDF frame to page and neighboring frame edges/centers. */
export function snapLayoutFrame<T extends FrameGeometry>(
  frame: T,
  pageWidth: number,
  pageHeight: number,
  targets: readonly SnapFrameRect[],
  selectedKey: string | null,
  scale: number,
  thresholdPx = 7,
): { frame: T; guides: LayoutAlignmentGuide[] } {
  if (![pageWidth, pageHeight, scale, thresholdPx].every(Number.isFinite) || scale <= 0 || thresholdPx <= 0) {
    return { frame, guides: [] };
  }

  const current = axisAlignedBounds(frame);
  const xFeatures = [
    { value: current.left, name: 'left' },
    { value: (current.left + current.right) / 2, name: 'center' },
    { value: current.right, name: 'right' },
  ];
  const yFeatures = [
    { value: current.top, name: 'top' },
    { value: (current.top + current.bottom) / 2, name: 'center' },
    { value: current.bottom, name: 'bottom' },
  ];
  const xGuides: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Page left edge' },
    { value: pageWidth / 2, label: 'Page center' },
    { value: pageWidth, label: 'Page right edge' },
  ];
  const yGuides: Array<{ value: number; label: string }> = [
    { value: 0, label: 'Page top edge' },
    { value: pageHeight / 2, label: 'Page center' },
    { value: pageHeight, label: 'Page bottom edge' },
  ];
  for (const target of targets) {
    if (target.key === selectedKey || target.width <= 0 || target.height <= 0) continue;
    const bounds = axisAlignedBounds(target);
    xGuides.push(
      { value: bounds.left, label: `${target.label} left edge` },
      { value: (bounds.left + bounds.right) / 2, label: `${target.label} center` },
      { value: bounds.right, label: `${target.label} right edge` },
    );
    yGuides.push(
      { value: bounds.top, label: `${target.label} top edge` },
      { value: (bounds.top + bounds.bottom) / 2, label: `${target.label} center` },
      { value: bounds.bottom, label: `${target.label} bottom edge` },
    );
  }

  const xMatch = nearestSnap(xFeatures, xGuides, scale, thresholdPx);
  const yMatch = nearestSnap(yFeatures, yGuides, scale, thresholdPx);
  const x = Math.max(0, frame.x + (xMatch?.delta ?? 0));
  const y = Math.max(0, frame.y + (yMatch?.delta ?? 0));
  const nextFrame = {
    ...frame,
    x,
    width: frame.total === undefined ? frame.width : x + frame.total,
    y,
    height: frame.totalHeight === undefined ? frame.height : y + frame.totalHeight,
  };
  const guides: LayoutAlignmentGuide[] = [];
  if (xMatch) guides.push({ axis: 'x', value: xMatch.guide.value, label: xMatch.guide.label });
  if (yMatch) guides.push({ axis: 'y', value: yMatch.guide.value, label: yMatch.guide.label });
  return { frame: nextFrame, guides };
}
