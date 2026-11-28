import { layoutFrameTotal, layoutFrameTotalHeight, type LayoutFrameCoordinates } from './layoutFrameGeometry.js';

type Frame = LayoutFrameCoordinates & { hidden?: boolean; rotation?: number };
type Language = 'en' | 'pt-BR';
type Box = readonly number[];
type SourceLine = { id?: string; bbox: Box; rasterizedDuplicate?: boolean };
type SourceBlock = {
  id: string;
  bbox: Box;
  lines?: SourceLine[];
  hiddenFromPage?: boolean;
  artworkOnly?: boolean;
  layoutFrame?: Frame;
};
type Overlay = { bbox: Box; language?: string; languageInvariant?: boolean; hideInAdmin?: boolean };
type Row = { blockId: string; lineId: string; numberLineId?: string; labelBBox: Box; numberBBox?: Box };

export type SkeletonItem = readonly [
  kind: 'text' | 'image', x: number, y: number, width: number, height: number, rotation?: number,
];
export type SkeletonLayout = { width: number; height: number; items: SkeletonItem[] };
export type SkeletonPage = Record<Language, SkeletonLayout>;

type Options = {
  width: number;
  height: number;
  blocks: SourceBlock[];
  imageBoxes?: Box[];
  fidelityOverlays?: Overlay[];
  contentsRows?: Row[];
  language: Language;
  isAdmin?: boolean;
  frameFor?: (block: SourceBlock, index: number) => Frame | undefined;
};

export function buildSkeletonLayout(options: Options): SkeletonLayout {
  const { width, height, language, blocks, imageBoxes, fidelityOverlays, contentsRows, isAdmin, frameFor } = options;
  const items: SkeletonItem[] = [];
  const seen = new Set<string>();
  const add = (kind: SkeletonItem[0], box: Box, rotation = 0) => {
    if (box.length !== 4 || !box.every(Number.isFinite)) return;
    const x = Math.max(0, box[0]);
    const y = Math.max(0, box[1]);
    const w = Math.min(width, box[2]) - x;
    const h = Math.min(height, box[3]) - y;
    if (w <= 0 || h <= 0) return;
    const item: SkeletonItem = [kind, ...([x, y, w, h].map(n => Math.round(n * 1000) / 1000) as [number, number, number, number]), rotation];
    const key = item.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  };

  const art: Box[] = [];
  const area = ([x0, y0, x1, y1]: Box) => (x1 - x0) * (y1 - y0);
  const imageCandidates = (imageBoxes ?? []).filter(([x0, y0, x1, y1]) => {
    const w = x1 - x0;
    const h = y1 - y0;
    // Ignore decorative rails and extraction fragments inside artwork.
    return w >= 12 && h >= 12 && w < width * 0.85 && h < height * 0.82
      && !(w >= width * 0.3 && h <= height * 0.05);
  }).sort((a, b) => area(b) - area(a));
  for (const box of imageCandidates) {
    if (art.some(outer => box[0] >= outer[0] - 1 && box[1] >= outer[1] - 1
      && box[2] <= outer[2] + 1 && box[3] <= outer[3] + 1)) continue;
    art.push(box);
    add('image', box);
  }
  for (const overlay of fidelityOverlays ?? []) {
    if ((overlay.languageInvariant || overlay.language === language) && !(isAdmin && overlay.hideInAdmin)) {
      add('image', overlay.bbox);
    }
  }

  const rowLines = new Set<string>();
  const rowBlocks = new Set<string>();
  for (const row of contentsRows ?? []) {
    add('text', row.labelBBox);
    if (row.numberBBox) add('text', row.numberBBox);
    rowLines.add(`${row.blockId}:${row.lineId}`);
    rowBlocks.add(row.blockId);
    if (row.numberLineId) rowLines.add(`${row.blockId}:${row.numberLineId}`);
  }
  blocks.forEach((block, index) => {
    if (block.hiddenFromPage || block.artworkOnly) return;
    const lines = block.lines?.filter(line =>
      !line.rasterizedDuplicate && !rowLines.has(`${block.id}:${line.id}`)) ?? [];
    if (!lines.length) return;
    const frame = frameFor?.(block, index) ?? block.layoutFrame;
    if (frame?.hidden) return;
    if (frame && language === 'pt-BR' && !rowBlocks.has(block.id)) {
      // A translated frame is known before its text wraps. Show that frame
      // rather than guessing the number or the width of the new lines.
      const y = frame.y ?? block.bbox[1];
      const h = layoutFrameTotalHeight(frame) || block.bbox[3] - block.bbox[1];
      add('text', [frame.x, y, frame.x + layoutFrameTotal(frame), y + h], frame.rotation);
    } else {
      for (const line of lines) add('text', line.bbox);
    }
  });
  return { width, height, items };
}
