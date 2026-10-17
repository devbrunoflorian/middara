export type StructureStatus = 'compatible' | 'suspect' | 'review-required' | 'exception' | 'not-rendered';
export interface HangingIndentMetrics {
  marker: { leftPt: number; rightPt: number };
  expectedBodyStartXPt: number;
  bodyLineStartsPt: number[];
  bodyLineRightsPt?: number[];
  rightBoundaryPt: number;
  tolerancePt?: number;
}
export interface StructuralAnalysis {
  status: StructureStatus;
  role: string;
  reasons: string[];
  [key: string]: unknown;
}
export interface FlowValidation {
  status: 'compatible' | 'suspect' | 'review-required';
  role: string;
  reasons: string[];
  [key: string]: unknown;
}
export function validateHangingIndent(metrics: HangingIndentMetrics): FlowValidation;
export function validateParagraphFlow(metrics: {
  sourceLineStartsPt: number[];
  actualLineStartsPt: number[];
  actualLineRightsPt?: number[];
  rightBoundaryPt?: number | null;
  textAlign: string;
  tolerancePt?: number;
}): FlowValidation;
export function getStructuralCopyfitBlockStatus(
  status: 'compatible' | 'suspect' | 'review-required' | null | undefined,
  overflow?: boolean,
  collision?: boolean,
): 'blocked-live-overflow' | 'blocked-structural-error' | 'blocked-structural-review' | null;
export function hasVisibleGeometryOverflow(metrics: {
  bottomOverflowPx?: number;
  topEdgeOverflowPx?: number;
  leftEdgeOverflowPx?: number;
  rightEdgeOverflowPx?: number;
  tolerancePx?: number;
}): boolean;
export type CopyfitVisualLineClass = 'EXACT' | 'UNDER' | 'OVER' | 'UNMEASURED';
export function classifyCopyfitVisualLines(sourcePdfLineCount: number | null | undefined, targetPageRendererLineCount: number | null | undefined): CopyfitVisualLineClass;
export function getCopyfitLineCountBlockStatus(
  sourcePdfLineCount: number | null | undefined,
  targetPageRendererLineCount: number | null | undefined,
): 'blocked-line-count-over' | 'blocked-source-line-count' | 'pending-line-count-measurement' | null;
export function getCopyfitVisualLineGateStatus(
  sourcePdfLineCount: number | null | undefined,
  targetPageRendererLineCount: number | null | undefined,
  underCompositionJustification?: string | null,
): 'line-count-pass' | 'blocked-line-count-over' | 'blocked-source-line-count' | 'pending-line-count-measurement' | 'pending-under-composition-justification';
export interface SemanticFlowFrame {
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}
export interface SemanticFlowEvidence {
  kind: 'semantic-parent' | 'source-baselines' | 'sibling-alignment' | 'column-grid' | 'visual-boundary'
    | 'background-image-boundary' | 'artwork-occupancy' | 'table-grid' | 'page-margin' | 'typography-role';
  supports?: boolean;
  owner?: string;
  detail?: string;
}
export interface SemanticBoundaryEvidence {
  valuePt: number;
  kind: SemanticFlowEvidence['kind'];
  /** Stable reference to the independent measured artifact (PDF, Viewer, or sidecar). */
  sourceId: string;
  detail?: string;
}
export function resolveSemanticTextFlowCorridor(input: {
  currentFrame: SemanticFlowFrame;
  alignmentAnchor?: 'left' | 'center' | 'right';
  centerAnchorPt?: number;
  boundaryTolerancePt?: number;
  flowRegion: {
    id: string;
    semanticOwner: string;
    leftBoundaryEvidence: SemanticBoundaryEvidence[];
    rightBoundaryEvidence: SemanticBoundaryEvidence[];
    paddingLeftPt: number;
    paddingRightPt: number;
    textBandTopPt?: number;
    textBandBottomPt?: number;
    evidence: SemanticFlowEvidence[];
  };
  obstacles?: Array<{
    id: string;
    semanticRelation: 'independent-flow-owner';
    bboxPt: [number, number, number, number];
    requiredGapPt: number;
  }>;
}): Record<string, unknown> & { status: 'GEOMETRY_UNCERTAIN' | 'WIDTH_ADJUSTMENT_CANDIDATE' | 'CURRENT_FRAME_WITHIN_CORRIDOR' | 'CURRENT_FRAME_WITHIN_BOUNDARY_TOLERANCE'; confidence: 'high' | 'medium' | 'low'; automaticProposalAllowed: boolean };
export interface SemanticWidthMeasurement {
  lineCount: number;
  fontLoaded: boolean;
  geometryPass: boolean;
  textEscapesFrame: boolean;
  overflow: boolean;
  collision: boolean;
  [key: string]: unknown;
}
export function searchSemanticFlowWidth(input: {
  corridor: Record<string, any>;
  sourceLineCount: number;
  initialMeasurement: SemanticWidthMeasurement;
  measureAtWidth: (widthPt: number) => Promise<SemanticWidthMeasurement> | SemanticWidthMeasurement;
  maxProbes?: number;
  widthTolerancePt?: number;
}): Promise<Record<string, any> & { status: 'GEOMETRY_UNCERTAIN' | 'WIDTH_RESOLVED' | 'OVER_AFTER_SAFE_WIDTH' | 'EXACT' | 'UNDER'; confidence: 'high' | 'medium' | 'low' }>;
export function classifySemanticWidthPreflight(metrics: {
  sourceLineCount: number;
  currentLineCount: number;
  corridor?: Record<string, any> | null;
  testedWidthPt?: number | null;
  resolvedLineCount?: number | null;
  widthTolerancePt?: number;
}): 'EXACT' | 'UNDER' | 'OVER_AT_CURRENT_WIDTH' | 'WIDTH_ADJUSTMENT_CANDIDATE'
  | 'WIDTH_RESOLVED' | 'OVER_AFTER_SAFE_WIDTH' | 'GEOMETRY_UNCERTAIN';
export interface VisualLineRect { top: number; bottom: number; left: number; right: number; baselineY?: number | null; }
export interface InlineVisualLineRect {
  rect: VisualLineRect;
  lineTop?: number | null;
  baselineY?: number | null;
}
export function groupPageRendererVisualLines(
  textRects: VisualLineRect[],
  inlineSymbolRects?: Array<VisualLineRect | InlineVisualLineRect>,
  tolerancePx?: number,
): Array<VisualLineRect & { groupTop: number }>;
export function resolveStructuralCopyfitStatus(
  candidateStatus: string | null | undefined,
  measurement: { structuralStatus?: StructureStatus | null; overflow: boolean; collision: boolean; lineCount?: number | null } | null | undefined,
  runtimeBlocked?: boolean,
  sourcePdfLineCount?: number | null,
  underCompositionJustification?: string | null,
): string;
export function analyzeSourceBlock(block: Record<string, any>, options?: { blockIndex?: number }): StructuralAnalysis;
export function analyzeSourcePages(pages: Array<Record<string, any>>): {
  coverage: { pagesRead: number; blocksExamined: number };
  renderedBlocksExamined: number;
  counts: Record<StructureStatus, number>;
  roles: Record<string, number>;
  familyCounts: Record<string, Record<'examined' | StructureStatus, number>>;
  separatedMarkerCandidates: number;
  sourceTextOverlapCandidates: Array<Record<string, unknown>>;
  artworkObstacleCandidates: Array<Record<string, unknown>>;
  structuralReviewCandidates: StructuralAnalysis[];
  pages: Array<{ page: number; blocks: StructuralAnalysis[] }>;
};
