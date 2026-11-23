import type { Block } from './components/PageRenderer';
export interface ContentsRowDefinition {
  id: string;
  blockId: string;
  blockIndex: number;
  lineId: string;
  keyStem: string;
  legacyCombinedKeyStems: string[];
  labelBBox: [number, number, number, number];
  numberLineId?: string;
  numberBBox?: [number, number, number, number];
  /** Explicit text corridor for labels with no separate printed page number. */
  labelWidthPt?: number;
  targetPage?: number;
  overlaySource?: boolean;
  sourceText?: string;
  sourceReference?: string;
  sourceReferencePtBr?: string;
  /** PT-BR-only horizontal adjustment for the source reference's measured text anchor. */
  sourceReferencePtBrShiftPt?: number;
  leader: { bbox: number[]; yPt: number; periodPt: number; widthPt: number; style?: 'dotted' | 'solid' | 'none' };
  mask: { url: string; bbox: number[] };
}
export function contentsRowKey(row: ContentsRowDefinition, language: 'en' | 'pt-BR') {
  return row.keyStem.includes('_unit_') ? `${row.keyStem}__${language}` : row.keyStem;
}
export function contentsRowUsesLegacy(
  rows: ContentsRowDefinition[], language: 'en' | 'pt-BR', has: (key: string) => boolean,
) {
  return rows.some(row => row.legacyCombinedKeyStems.some(stem =>
    has(stem.includes('_unit_') ? `${stem}__${language}` : stem),
  ));
}
export function contentsRowLine(block: Block, row: ContentsRowDefinition) {
  return block.lines?.find(line => line.id === row.lineId);
}
export const CONTENTS_LEADER_GAP_PT = 3;

/** The label's frame ends before the fixed page number. */
export function contentsLabelWidth(row: ContentsRowDefinition) {
  if (row.labelWidthPt !== undefined) return Math.max(0, row.labelWidthPt);
  if (!row.numberBBox) return Math.max(0, row.labelBBox[2] - row.labelBBox[0]);
  return Math.max(0, row.numberBBox[0] - row.labelBBox[0] - CONTENTS_LEADER_GAP_PT);
}

/** Reserve a gap on both sides of the leader; translated text takes priority. */
export function contentsLeaderWidth(row: ContentsRowDefinition, textWidthPt: number) {
  return Math.max(0, contentsLabelWidth(row) - CONTENTS_LEADER_GAP_PT - textWidthPt);
}
