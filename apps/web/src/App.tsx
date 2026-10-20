import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react';
import { PageRenderer, type Block, type CreditUnitDefinition, type LayoutFrame, type PageData, type PageFidelityOverlay } from './components/PageRenderer';
import type { SpanOverride } from './components/RichSpanEditor';
import { AdminSymbolPalette, type AdminSymbolPaletteEditorState } from './components/AdminSymbolPalette';
import { LocalSyncRecoveryControl } from './components/LocalSyncRecoveryControl';
import { FaqDrawer } from './components/FaqDrawer';
import { PdfExportDialog } from './components/PdfExportDialog';
import { TranslationReviewPanel } from './components/TranslationReviewPanel';
import { ShellNavigation, type ShellDestination } from './components/ShellNavigation';
import { ArcaneGlassDefinitions } from './components/ArcaneGlassDefinitions';
import { AtmosphericParticles } from './components/AtmosphericParticles';
import {
  ChevronLeft, ChevronRight, Diamond, Edit3, Menu,
  ZoomIn, ZoomOut, Maximize, Layout, LayoutList,
  Ruler, Move
} from 'lucide-react';
import './App.css';
import './ArcaneGothic.css';
import './ArcaneGothicLayout.css';
import './ArcaneGothicGlass.css';
import './ArcaneGothicAtmosphere.css';
import './AdminWorkspace.css';
import { attachSourceInlineElements, type SourceInlineElement } from './symbols/sourceInlineElements';
import { attachSourceCompoundElements, type SourceCompoundElement } from './symbols/sourceCompounds';
import type { ContentsRowDefinition } from './contentsRows';
import { getDefaultSymbolAliasPreferences, getEditorAliasConflicts, getSemanticSymbol, normalizeEditorAlias, type SymbolAliasPreferences } from './symbols/semanticSymbols';
import { loadSymbolAliasSettings, saveSymbolAliasSettings } from './symbols/symbolAliasSettings';
import {
  candidateForReviewException,
  candidateRequiresDiagnosticBlank,
  exceptionRequiresDiagnosticBlank,
  layoutFrameForReviewOverride,
  clientSpanKey,
  completeTranslationReviewRequestAsUser,
  glossaryDecisionKey,
  loadSavedPortugueseTranslations,
  loadTranslationGlossaryDecisions,
  loadTranslationReviewCatalog,
  loadTranslationReviewRecords,
  loadTranslationReviewRequests,
  persistTranslationReview,
  persistTranslationReviewDisposition,
  persistTranslationReviewApproval,
  persistTranslationGlossaryDecision,
  persistTranslationReviewRequest,
  rendererKeyForReviewCandidate,
  reviewRecordForCandidate,
  spanOverrideForReviewCandidate,
  textForReviewData,
  updateTranslationReviewRequest,
  parseGlossaryTermCandidates,
  withUpdatedTranslationReviewRecord,
  normalizeGlossaryTerm,
  copyfitCanonicalEvidenceBlockReason,
  copyfitApprovalBlockReason,
  type TranslationReviewCandidate,
  type TranslationReviewCatalog,
  type TranslationReviewException,
  type TranslationReviewRecord,
  type TranslationReviewRequest,
  type TranslationReviewRequestStatus,
  type NewTranslationReviewRequest,
  type TranslationGlossaryDecision,
  type TranslationGlossaryDecisionStatus,
  type NewTranslationGlossaryDecision,
} from './translationReview';
import { classifyCopyfitVisualLines, getCopyfitLineCountBlockStatus, getStructuralCopyfitBlockStatus, groupPageRendererVisualLines, hasVisibleGeometryOverflow, resolveStructuralCopyfitStatus, validateHangingIndent, validateParagraphFlow } from './editorialStructurePrevalidator.mjs';
import {
  getPage14ExperimentalFrames,
  getPage14ExperimentalOverrides,
  getPage14V2ExperimentalFrames,
  getPage14V2ExperimentalOverrides,
  getPage14V3Frames,
  getPage14V3CurrentCandidate,
  getPage14V3CurrentOverrides,
  isPage14DraftVariant,
  isPage14V2BlindVariant,
  PAGE14_EDITORIAL_EXPERIMENT,
  PAGE14_V2_SNAPSHOT,
  PAGE14_V3_COPYFIT,
  PAGE14_V3_INITIAL,
  PAGE14_V3_HANGING_INDENT_BLOCK_KEYS,
  loadPage14V2RevealData,
  loadPage14V2Votes,
  readPage14ExperimentLocation,
  readPage14V2ExperimentLocation,
  readPage14V3ExperimentLocation,
  normalizePage14V3UnitKey,
  savePage14V2Vote,
  updatePage14ExperimentLocation,
  updatePage14V2ExperimentLocation,
  updatePage14V3ExperimentLocation,
  type Page14ExperimentVariant,
  type Page14V2Variant,
  type Page14V2Vote,
  type Page14V3Variant,
} from './editorialExperiment';
import {
  buildInitialPage14ImportantUnitOverrides,
  buildPage14ImportantCompositionProof,
  describePage14ImportantFit,
  PAGE14_IMPORTANT_COMPOSITION_EXPERIMENT_ID,
  PAGE14_IMPORTANT_PANEL_FRAME,
  PAGE14_IMPORTANT_SOURCE_UNITS,
  readPage14ImportantCompositionVariant,
  updatePage14ImportantCompositionLocation,
  type Page14ImportantCompositionVariant,
} from './experiments/page14-important-composition';
import {
  captureDocumentFocalPoint,
  clampViewerZoom,
  ctrlWheelZoomLevel,
  type DocumentFocalPoint,
} from './focalZoom';

const TOTAL_PAGES = 102; // Pages with extracted DOM

interface ActivePaletteEditor {
  editorKey: string;
  state: AdminSymbolPaletteEditorState;
}

interface Page14V3LiveMeasurement {
  unitKey: string;
  variant: Page14V3Variant;
  language: 'en' | 'pt-BR';
  viewport: string;
  devicePixelRatio: number;
  zoomLevel: number;
  lineCount: number;
  inkHeightPx: number;
  frameHeightPx: number;
  maxLineWidthPx: number;
  frameWidthPx: number;
  leftEdgeOverflowPx: number;
  rightEdgeOverflowPx: number;
  bottomOverflowPx: number;
  topEdgeOverflowPx?: number;
  markerHeadingGapPx: number | null;
  markerXPt: number | null;
  bodyLineStartXsPt: number[];
  usefulListWidthPt: number | null;
  hangingIndentSpreadPt: number | null;
  listStructureValid: boolean | null;
  structuralStatus: 'compatible' | 'suspect' | 'review-required';
  structuralReasons: string[];
  nextUnitKey: string | null;
  spaceToNextPx: number | null;
  overflow: boolean;
  collision: boolean;
  renderedText: string;
  measuredAt: string;
}

interface Page14ImportantLiveMeasurement {
  variant: Page14ImportantCompositionVariant;
  viewport: string;
  devicePixelRatio: number;
  zoomLevel: number;
  lineCount: number;
  contentGeometryHeightPt: number;
  frameHeightPt: number;
  maxLineWidthPt: number;
  frameWidthPt: number;
  leftOverflowPt: number;
  rightOverflowPt: number;
  topOverflowPt: number;
  lineWidthsPt: number[];
  lineRightOverflowPt: number[];
  bottomOverflowPt: number;
  nextUnitGapPt: number | null;
  bottomPaddingPt: number;
  lightningCount: number;
  lightningViewportOverflowPt: number | null;
  lightningPathGeometryOverflowPt: number | null;
  lightningPathCount: number;
  targetText: string;
}

function normalizePage14V3MeasuredText(text: string): string {
  return text.replace(/[\s\u00a0]+/gu, ' ').trim();
}

function measuredTextRectsOutside(root: HTMLElement, excludedSelector: string): DOMRect[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.trim() || node.parentElement?.closest(excludedSelector)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    rects.push(...Array.from(range.getClientRects()).filter(rect => rect.width > 0.25 && rect.height > 0.25));
  }
  return rects;
}

function isPage14V3MeasurementCurrentEnvironment(measurement: Page14V3LiveMeasurement | null | undefined, zoomLevel: number): boolean {
  return !!measurement
    && measurement.viewport === `${window.innerWidth}×${window.innerHeight}`
    && Math.abs(measurement.devicePixelRatio - window.devicePixelRatio) < 0.001
    && Math.abs(measurement.zoomLevel - zoomLevel) < 0.001;
}

function page14V3SourcePdfVisualLineCount(unitKey: string | null | undefined): number | null {
  if (!unitKey) return null;
  const count = PAGE14_V3_COPYFIT.sourcePdfVisualLineCounts?.[unitKey];
  return Number.isInteger(count) && count! >= 0 ? count! : null;
}

function page14V3MeasurementIsBlocked(measurement: Page14V3LiveMeasurement, unitKey: string): boolean {
  return !!getStructuralCopyfitBlockStatus(measurement.structuralStatus, measurement.overflow, measurement.collision)
    || !!getCopyfitLineCountBlockStatus(page14V3SourcePdfVisualLineCount(unitKey), measurement.lineCount);
}

function measurePage14V3Unit(
  unitKey: string,
  variant: Page14V3Variant,
  language: 'en' | 'pt-BR',
  zoomLevel: number,
): Page14V3LiveMeasurement | null {
  // Legacy page-14 blocks have no editorKey, so PageRenderer uses the stable
  // page_${page}_block_${index} key without a locale suffix.
  const expectedKey = unitKey;
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('.block-container[data-editable-unit-key]'));
  const block = blocks.find(element => element.dataset.editableUnitKey === expectedKey)
    ?? blocks.find(element => element.dataset.editableUnitKey?.startsWith(`${unitKey}__`));
  if (!block) return null;

  const frame = block.getBoundingClientRect();
  const page = block.closest<HTMLElement>('[data-pdf-page-number]');
  const pageRect = page?.getBoundingClientRect();
  const pageWidthPt = Number(page?.dataset.pdfPageWidth);
  const pageScale = pageRect && pageWidthPt > 0 ? pageRect.width / pageWidthPt : 1;
  const range = document.createRange();
  range.selectNodeContents(block);
  const textRects = Array.from(range.getClientRects()).filter(rect => rect.width > 0.25 && rect.height > 0.25);
  const inlineSymbolRects = Array.from(block.querySelectorAll<SVGElement | HTMLImageElement>(
    'svg[data-symbol-id], img[data-symbol-id], svg[data-source-symbol-id], img[data-source-symbol-id]',
  )).map(element => {
    const rect = element.getBoundingClientRect();
    const slot = element.closest<HTMLElement>('.inline-semantic-symbol-slot');
    const sourceLine = element.closest<HTMLElement | SVGElement>('[data-source-line-id], [data-list-marker-line]');
    const sourceLineRect = sourceLine?.getBoundingClientRect();
    const slotRect = slot?.getBoundingClientRect();
    return {
      rect,
      baselineY: slotRect ? slotRect.top : null,
      lineTop: sourceLineRect ? sourceLineRect.top : null,
    };
  }).filter(symbol => symbol.rect.width > 0.25 && symbol.rect.height > 0.25);
  if (!textRects.length && !inlineSymbolRects.length) return null;

  const markerElement = block.querySelector<HTMLElement | SVGGElement>('[data-list-marker-line]');
  const markerXSource = Number(markerElement?.getAttribute('data-source-line-x'));
  const markerXPt = Number.isFinite(markerXSource) ? markerXSource : null;
  const markerRange = markerElement ? document.createRange() : null;
  if (markerRange && markerElement) {
    const walker = document.createTreeWalker(markerElement, NodeFilter.SHOW_TEXT);
    let markerText: Text | null = null;
    while (walker.nextNode()) {
      const candidate = walker.currentNode as Text;
      if (/^[1-4]\./u.test(candidate.data)) {
        markerText = candidate;
        break;
      }
    }
    if (markerText) {
      markerRange.setStart(markerText, 0);
      markerRange.setEnd(markerText, 2);
    } else markerRange.selectNodeContents(markerElement);
  }
  const markerInkRect = markerRange
    ? Array.from(markerRange.getClientRects()).find(rect => rect.width > 0.25 && rect.height > 0.25)
    : null;
  const markerSourceRightPt = Number(markerElement?.getAttribute('data-source-line-right'));
  const markerInkRightPt = markerInkRect && pageRect
    ? (markerInkRect.right - pageRect.left) / pageScale
    : Number.isFinite(markerSourceRightPt) ? markerSourceRightPt : null;

  const realbox = block.querySelector<HTMLElement>('.realbox');
  let bodyLineStartXsPt: number[] = [];
  let bodyLineRightsPt: number[] = [];
  if (realbox && pageRect) {
    const bodyRects = measuredTextRectsOutside(realbox, '[data-source-marker-advance]')
      .sort((a, b) => a.top - b.top || a.left - b.left);
    const visualLines: Array<{ top: number; left: number; right: number }> = [];
    for (const rect of bodyRects) {
      const line = visualLines.find(candidate => Math.abs(candidate.top - rect.top) <= 4.5);
      if (line) {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
      } else visualLines.push({ top: rect.top, left: rect.left, right: rect.right });
    }
    bodyLineStartXsPt = visualLines.map(line => Number(((line.left - pageRect.left) / pageScale).toFixed(2)));
    bodyLineRightsPt = visualLines.map(line => Number(((line.right - pageRect.left) / pageScale).toFixed(2)));
  } else if (pageRect) {
    const sourceLines = Array.from(block.querySelectorAll<HTMLElement | SVGGElement>('[data-source-line-id]'))
      .filter(line => !line.closest('[data-list-marker-line]'))
      .map(element => {
        const sourceX = Number(element.getAttribute('data-source-line-x'));
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0.25 && rect.height > 0.25);
        return {
          x: Number.isFinite(sourceX) ? Number(sourceX.toFixed(2)) : null,
          right: pageRect ? Math.max(0, ...rects.map(rect => (rect.right - pageRect.left) / pageScale)) : null,
          top: rects[0]?.top ?? element.getBoundingClientRect().top,
        };
      })
      .filter(line => line.x !== null);
    const visualLines: Array<{ top: number; left: number; right: number }> = [];
    for (const sourceLine of sourceLines) {
      const line = visualLines.find(candidate => Math.abs(candidate.top - sourceLine.top) <= 4.5);
      if (line) {
        line.left = Math.min(line.left, sourceLine.x!);
        line.right = Math.max(line.right, sourceLine.right ?? line.right);
      } else visualLines.push({ top: sourceLine.top, left: sourceLine.x!, right: sourceLine.right ?? sourceLine.x! });
    }
    bodyLineStartXsPt = visualLines.map(line => Number(line.left.toFixed(2)));
    bodyLineRightsPt = visualLines.map(line => Number(line.right.toFixed(2)));
  }
  const bodyFirstXPt = bodyLineStartXsPt[0] ?? null;
  const markerHeadingGapPx = markerInkRightPt !== null && bodyFirstXPt !== null
    ? Number(((bodyFirstXPt - markerInkRightPt) * pageScale).toFixed(1))
    : null;
  const firstBodySourceLine = Array.from(block.querySelectorAll<HTMLElement | SVGGElement>('[data-source-line-id]'))
    .find(line => !line.closest('[data-list-marker-line]'));
  const expectedBodyStartXPt = Number(firstBodySourceLine?.getAttribute('data-source-line-x')
    ?? block.getAttribute('data-source-list-body-start-x'));
  const sourceAvailableX = Number(firstBodySourceLine?.getAttribute('data-source-line-available-x'));
  const sourceAvailableWidth = Number(firstBodySourceLine?.getAttribute('data-source-line-available-width'));
  const rightBoundaryPt = realbox && pageRect
    ? Number(((realbox.getBoundingClientRect().right - pageRect.left) / pageScale).toFixed(2))
    : bodyFirstXPt !== null && Number.isFinite(sourceAvailableX) && Number.isFinite(sourceAvailableWidth)
      ? Number((sourceAvailableX + sourceAvailableWidth).toFixed(2))
      : pageRect ? Number(((frame.right - pageRect.left) / pageScale).toFixed(2)) : null;
  const sourceLineStartXsPt = Array.from(block.querySelectorAll<HTMLElement | SVGGElement>('[data-source-line-id]'))
    .filter(line => !line.closest('[data-list-marker-line]'))
    .map(line => Number(line.getAttribute('data-source-line-x')))
    .filter(Number.isFinite)
    .map(x => Number(x.toFixed(2)));
  const structureAssessment = markerElement
    ? validateHangingIndent({
      marker: markerXPt !== null && markerInkRightPt !== null
        ? { leftPt: markerXPt, rightPt: Number(((markerInkRect!.right - pageRect!.left) / pageScale).toFixed(2)) }
        : { leftPt: Number.NaN, rightPt: Number.NaN },
      expectedBodyStartXPt,
      bodyLineStartsPt: bodyLineStartXsPt,
      bodyLineRightsPt,
      rightBoundaryPt: rightBoundaryPt ?? Number.NaN,
    })
    : validateParagraphFlow({
      sourceLineStartsPt: sourceLineStartXsPt,
      actualLineStartsPt: bodyLineStartXsPt,
      actualLineRightsPt: bodyLineRightsPt,
      rightBoundaryPt,
      textAlign: getComputedStyle(realbox ?? block).textAlign,
    });
  const listStructureValid = markerElement ? structureAssessment.status === 'compatible' : null;
  const usefulListWidthPt = markerElement && typeof structureAssessment.usefulBodyWidthPt === 'number'
    ? structureAssessment.usefulBodyWidthPt : null;
  const bodySpread = markerElement && typeof structureAssessment.hangingIndentSpreadPt === 'number'
    ? structureAssessment.hangingIndentSpreadPt
    : bodyLineStartXsPt.length > 1 ? Math.max(...bodyLineStartXsPt) - Math.min(...bodyLineStartXsPt) : 0;

  const lines = groupPageRendererVisualLines(textRects, inlineSymbolRects);

  const inkBottom = Math.max(...lines.map(line => line.bottom));
  const inkTop = Math.min(...lines.map(line => line.top));
  const frameBottom = frame.bottom;
  const leftEdgeOverflowPx = Math.max(0, frame.left - Math.min(...lines.map(line => line.left)));
  const rightEdgeOverflowPx = Math.max(0, Math.max(...lines.map(line => line.right)) - frame.right);
  const topEdgeOverflowPx = Math.max(0, frame.top - inkTop);
  const bottomOverflowPx = Math.max(0, inkBottom - frameBottom);
  const maxLineWidthPx = Math.max(...lines.map(line => line.right - line.left));
  const next = blocks
    .filter(element => element !== block)
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ element, rect }) => {
      const overlap = Math.max(0, Math.min(frame.right, rect.right) - Math.max(frame.left, rect.left));
      const overlapRatio = overlap / Math.max(1, Math.min(frame.width, rect.width));
      return rect.top > frame.top + 8 && overlapRatio >= 0.35
        && getComputedStyle(element).display !== 'none';
    })
    .sort((a, b) => a.rect.top - b.rect.top)[0];
  const spaceToNextPx = next ? next.rect.top - inkBottom : null;
  const nextUnitKey = next?.element.dataset.editableUnitKey?.split('__')[0] ?? null;
  // Use visible line bounds; scrollHeight/clientHeight also include line-leading
  // and padding and can report overflow when all rendered ink is inside the frame.
  const overflow = hasVisibleGeometryOverflow({
    topEdgeOverflowPx,
    bottomOverflowPx,
    leftEdgeOverflowPx,
    rightEdgeOverflowPx,
  });
  const collision = !!next && inkBottom > next.rect.top + 1.5
    && Math.max(0, Math.min(frame.right, next.rect.right) - Math.max(frame.left, next.rect.left)) > 0;

  return {
    unitKey,
    variant,
    language,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    zoomLevel,
    lineCount: lines.length,
    inkHeightPx: Number((inkBottom - inkTop).toFixed(1)),
    frameHeightPx: Number(frame.height.toFixed(1)),
    maxLineWidthPx: Number(maxLineWidthPx.toFixed(1)),
    frameWidthPx: Number(frame.width.toFixed(1)),
    leftEdgeOverflowPx: Number(leftEdgeOverflowPx.toFixed(1)),
    rightEdgeOverflowPx: Number(rightEdgeOverflowPx.toFixed(1)),
    bottomOverflowPx: Number(bottomOverflowPx.toFixed(1)),
    topEdgeOverflowPx: Number(topEdgeOverflowPx.toFixed(1)),
    markerHeadingGapPx,
    markerXPt,
    bodyLineStartXsPt,
    usefulListWidthPt: usefulListWidthPt === null ? null : Number(usefulListWidthPt.toFixed(2)),
    hangingIndentSpreadPt: Number(bodySpread.toFixed(2)),
    listStructureValid,
    structuralStatus: structureAssessment.status,
    structuralReasons: structureAssessment.reasons,
    nextUnitKey,
    spaceToNextPx: spaceToNextPx === null ? null : Number(spaceToNextPx.toFixed(1)),
    overflow,
    collision,
    renderedText: normalizePage14V3MeasuredText(block.textContent ?? ''),
    measuredAt: new Date().toISOString(),
  };
}

async function loadPageData(pageNum: number): Promise<PageData> {
  const pageStr = pageNum.toString().padStart(3, '0');
  try {
    const res = await fetch(`/pages/page_${pageStr}/page_${pageStr}_dom.json`);
    if (res.ok) {
      const data = await res.json();
      let pageFrames: Record<string, LayoutFrame> = {};
      let pageCreditUnits: Record<string, CreditUnitDefinition | CreditUnitDefinition[]> = {};
      // Layout frames are page-local geometry sidecars. Load them for every
      // page that has one, not only the original page-2 pilot, so the viewer,
      // Admin outlines, and translated text all share the same frame.
      try {
        const frameResponse = await fetch(`/pages/page_${pageStr}/layout_frames.json`);
        if (frameResponse.ok) pageFrames = await frameResponse.json();
      } catch {}
      if (pageNum === 2) {
        try {
          const creditResponse = await fetch(`/pages/page_${pageStr}/credit_units.json`);
          if (creditResponse.ok) pageCreditUnits = await creditResponse.json();
        } catch {}
      }
      // Overlay sidecars are page-local and optional.  Always probe for one so
      // newly audited component/diagram pages are rendered without maintaining
      // a stale hard-coded page allowlist here.
      let fidelityOverlays: PageFidelityOverlay[] = [];
      let inlineElements: SourceInlineElement[] = [];
      let sourceCompounds: SourceCompoundElement[] = [];
      let contentsRows:ContentsRowDefinition[]|undefined;
      if(pageNum===3 || pageNum===101) {
        try {
          const rowsResponse=await fetch(`/pages/page_${pageStr}/contents_rows.json`);
          if(rowsResponse.ok)contentsRows=(await rowsResponse.json()).rows;
        } catch {}
      }
      try {
        const inlineResponse = await fetch(`/pages/page_${pageStr}/inline_elements.json`);
        if (inlineResponse.ok) inlineElements = (await inlineResponse.json()).elements ?? [];
      } catch {}
      try {
        const compoundsResponse = await fetch(`/pages/page_${pageStr}/compound_elements.json`);
        if (compoundsResponse.ok) sourceCompounds = (await compoundsResponse.json()).elements ?? [];
      } catch {}
      try {
        const overlayResponse = await fetch(`/pages/page_${pageStr}/fidelity_overlays.json`);
        if (overlayResponse.ok) {
          const overlayData = await overlayResponse.json();
          fidelityOverlays = overlayData.overlays || [];
        }
      } catch {}
      return {
        page_number: pageNum,
        width: data.width || 820.35,
        height: data.height || 820.35,
        images: [],
        layoutObstacles: (data.images || [])
          .filter((image: { role?: string }) => image.role === 'content')
          .map((image: { bbox: [number, number, number, number] }) => image.bbox),
        fidelityOverlays,
        inlineElements,
        sourceCompounds,
        contentsRows,
        blocks: attachSourceInlineElements(attachSourceCompoundElements((data.blocks || []).map((block: Block) => {
          const sidecarUnits = pageCreditUnits[block.id];
          const creditUnits = Array.isArray(sidecarUnits)
            ? sidecarUnits
            : sidecarUnits
              ? [sidecarUnits]
              : block.creditUnits ?? (block.creditUnit ? [block.creditUnit] : undefined);
          return {
            ...block,
            layoutFrame: pageFrames[block.id] || block.layoutFrame,
            creditUnits,
          };
        }), sourceCompounds), inlineElements),
        backgroundUrl: `/pages/page_${pageStr}/background.webp`
      };
    }
  } catch {}
  return {
    page_number: pageNum,
    width: 820.35,
    height: 820.35,
    images: [],
    blocks: [],
    backgroundUrl: `/pages/page_${pageStr}/background.webp`
  };
}

function App() {
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  const [initialImportantCompositionVariant] = useState(() => readPage14ImportantCompositionVariant(window.location.search));
  const [initialV3ExperimentLocation] = useState(() => readPage14V3ExperimentLocation(window.location.search));
  const [initialV2ExperimentLocation] = useState(() => readPage14V2ExperimentLocation(window.location.search));
  const [initialExperimentLocation] = useState(() => readPage14ExperimentLocation(window.location.search));
  const [currentPage, setCurrentPage] = useState<number>(initialImportantCompositionVariant ? 14 : initialV3ExperimentLocation?.pageNumber ?? initialV2ExperimentLocation?.pageNumber ?? initialExperimentLocation?.pageNumber ?? 1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRichEditorOpen, setIsRichEditorOpen] = useState(false);
  const [richEditorPanelWidth, setRichEditorPanelWidth] = useState(420);
  const openEditorPagesRef = useRef(new Set<number>());
  const [isRulerVisible, setIsRulerVisible] = useState(false);
  const [isLayoutMode, setIsLayoutMode] = useState(false);
  const [isLayoutDirty, setIsLayoutDirty] = useState(false);
  const [hasTranslationDraft, setHasTranslationDraft] = useState(false);
  const [pendingEditableNavigation, setPendingEditableNavigation] = useState<{
    id: number;
    direction: 'previous' | 'next';
    targetPage: number;
  } | null>(null);
  const editableNavigationRequestId = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  // Start at 200% relative to the measured fit scale; Fit to Screen resets this multiplier to 100%.
  const [zoomLevel, setZoomLevel] = useState<number>(2);
  const zoomLevelRef = useRef(zoomLevel);
  const [focalZoomAnchor, setFocalZoomAnchor] = useState<{ id: number; pageNumber: number; focal: DocumentFocalPoint; resetPan?: boolean; centerWhenFits?: boolean } | null>(null);
  const focalZoomAnchorIdRef = useRef(0);
  const pendingWheelZoomRef = useRef<{ zoomLevel: number; pageNumber: number; focal: DocumentFocalPoint } | null>(null);
  const wheelAnimationFrameRef = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'scroll'>('single');
  const [pageInput, setPageInput] = useState<string>(() => String(initialImportantCompositionVariant ? 14 : initialV3ExperimentLocation?.pageNumber ?? initialV2ExperimentLocation?.pageNumber ?? initialExperimentLocation?.pageNumber ?? 1));
  const [language, setLanguage] = useState<'en' | 'pt-BR'>(() => initialImportantCompositionVariant === 'EN' ? 'en' : initialImportantCompositionVariant ? 'pt-BR' : initialV3ExperimentLocation?.variant === 'EN' ? 'en' : initialV3ExperimentLocation ? 'pt-BR' : initialV2ExperimentLocation?.variant === 'EN' ? 'en' : initialV2ExperimentLocation ? 'pt-BR' : 'en');
  const [editorialExperimentVariant, setEditorialExperimentVariant] = useState<Page14ExperimentVariant | null>(initialExperimentLocation?.variant ?? null);
  const [page14V2Variant, setPage14V2Variant] = useState<Page14V2Variant | null>(initialV2ExperimentLocation?.variant ?? null);
  const [page14V3Variant, setPage14V3Variant] = useState<Page14V3Variant | null>(initialV3ExperimentLocation?.variant ?? null);
  const [page14ImportantCompositionVariant, setPage14ImportantCompositionVariant] = useState<Page14ImportantCompositionVariant | null>(initialImportantCompositionVariant);
  const [page14ImportantMeasurement, setPage14ImportantMeasurement] = useState<Page14ImportantLiveMeasurement | null>(null);
  const [page14ImportantUnitOverrides, setPage14ImportantUnitOverrides] = useState(() => buildInitialPage14ImportantUnitOverrides());
  const [page14ImportantDraftOverrides, setPage14ImportantDraftOverrides] = useState<Map<string, SpanOverride>>(() => new Map());
  const [page14ImportantEditorSelection, setPage14ImportantEditorSelection] = useState<string | null>(null);
  const [page14V3SelectedUnitKey, setPage14V3SelectedUnitKey] = useState<string | null>(null);
  const [page14V3LiveMeasurements, setPage14V3LiveMeasurements] = useState<Record<string, Page14V3LiveMeasurement>>({});
  const [page14V3ProposalMeasurements, setPage14V3ProposalMeasurements] = useState<Record<string, Page14V3LiveMeasurement>>({});
  const [page14V3RuntimeBlockedUnits, setPage14V3RuntimeBlockedUnits] = useState<Record<string, boolean>>({});
  const [page14V3MeasurementStatus, setPage14V3MeasurementStatus] = useState('');
  const [isExperimentRailCollapsed, setIsExperimentRailCollapsed] = useState(false);
  const [page14V2SelectedUnitKey, setPage14V2SelectedUnitKey] = useState<string | null>(null);
  const [page14V2Votes, setPage14V2Votes] = useState<Page14V2Vote[]>(loadPage14V2Votes);
  const [page14V2Preference, setPage14V2Preference] = useState<Page14V2Vote['preference'] | ''>('');
  const [page14V2Note, setPage14V2Note] = useState('');
  const [page14V2VoteStatus, setPage14V2VoteStatus] = useState<string | null>(null);
  const [page14V2StorageError, setPage14V2StorageError] = useState(false);
  const [page14V2RevealData, setPage14V2RevealData] = useState<Awaited<ReturnType<typeof loadPage14V2RevealData>> | null>(null);
  const [page14V2RevealError, setPage14V2RevealError] = useState<string | null>(null);
  const [isSymbolPaletteOpen, setIsSymbolPaletteOpen] = useState(false);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [isPdfExportOpen, setIsPdfExportOpen] = useState(false);
  const [isTranslationReviewOpen, setIsTranslationReviewOpen] = useState(false);
  const [reviewCatalog, setReviewCatalog] = useState<TranslationReviewCatalog | null>(null);
  const [reviewCatalogError, setReviewCatalogError] = useState<string | null>(null);
  const [reviewRecords, setReviewRecords] = useState<TranslationReviewRecord[]>([]);
  const [reviewRequests, setReviewRequests] = useState<TranslationReviewRequest[]>([]);
  const [glossaryDecisions, setGlossaryDecisions] = useState<TranslationGlossaryDecision[]>([]);
  const [reviewPersistenceError, setReviewPersistenceError] = useState<string | null>(null);
  const [reviewPersistenceLoading, setReviewPersistenceLoading] = useState(false);
  const [reviewPersistenceLoaded, setReviewPersistenceLoaded] = useState(false);
  const [savedHumanTranslations, setSavedHumanTranslations] = useState<Map<string, string>>(new Map());
  const [savedHumanTranslationData, setSavedHumanTranslationData] = useState<Map<string, unknown>>(new Map());
  const [savedPayloadTranslations, setSavedPayloadTranslations] = useState<Map<string, { id: string | number; spanKey: string; data: unknown }>>(new Map());
  const [selectedReviewKey, setSelectedReviewKey] = useState<string | null>(null);
  const [selectedPublishedReviewKey, setSelectedPublishedReviewKey] = useState<string | null>(null);
  const [reviewEditorSelectionKey, setReviewEditorSelectionKey] = useState<string | null>(null);
  const [reviewEditorItemKey, setReviewEditorItemKey] = useState<string | null>(null);
  const [reviewDraftOverrides, setReviewDraftOverrides] = useState<Map<string, SpanOverride>>(() => new Map());
  const [reviewWritingKey, setReviewWritingKey] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [faqActiveType, setFaqActiveType] = useState<'faq' | 'errata'>('faq');
  const [navigationOpenRequest, setNavigationOpenRequest] = useState(0);
  const [isNavigationExpanded, setIsNavigationExpanded] = useState(false);
  const [symbolAliasPreferences, setSymbolAliasPreferences] = useState<SymbolAliasPreferences>(getDefaultSymbolAliasPreferences);
  const [symbolAliasSettingsLoading, setSymbolAliasSettingsLoading] = useState(true);
  const [paletteEditorState, setPaletteEditorState] = useState<Pick<AdminSymbolPaletteEditorState, 'context' | 'canInsert' | 'canUndo' | 'status'> & { editorKey: string } | null>(null);
  const activePaletteEditorRef = useRef<ActivePaletteEditor | null>(null);

  // Single page mode: one page
  const [pageData, setPageData] = useState<PageData | null>(null);

  // Scroll mode: map of loaded pages
  const [scrollPages, setScrollPages] = useState<Map<number, PageData>>(new Map());

  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void loadTranslationReviewCatalog().then(catalog => {
      if (active) setReviewCatalog(catalog);
    }).catch(error => {
      if (active) setReviewCatalogError(error instanceof Error ? error.message : 'Não foi possível carregar as propostas.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isTranslationReviewOpen) return;
    const refreshCatalog = () => {
      void loadTranslationReviewCatalog().then(catalog => {
        setReviewCatalog(catalog);
        setReviewCatalogError(null);
      }).catch(error => {
        setReviewCatalogError(error instanceof Error ? error.message : 'Não foi possível atualizar as propostas.');
      });
    };
    const interval = window.setInterval(refreshCatalog, 30_000);
    return () => window.clearInterval(interval);
  }, [isTranslationReviewOpen]);

  useEffect(() => {
    if (!isTranslationReviewOpen || reviewPersistenceLoaded || reviewPersistenceLoading) return;
    setReviewPersistenceLoading(true);
    setReviewPersistenceError(null);
    void Promise.all([loadTranslationReviewRecords(), loadTranslationReviewRequests(), loadTranslationGlossaryDecisions(), loadSavedPortugueseTranslations()]).then(([records, requests, decisions, humanTranslations]) => {
      setReviewRecords(records);
      setReviewRequests(requests);
      setGlossaryDecisions(decisions);
      setSavedHumanTranslations(humanTranslations.texts);
      setSavedHumanTranslationData(humanTranslations.data);
      setSavedPayloadTranslations(humanTranslations.payload);
      setReviewPersistenceLoaded(true);
      setReviewPersistenceLoading(false);
    }).catch(error => {
      setReviewPersistenceError(error instanceof Error ? error.message : 'Não foi possível conectar ao armazenamento de revisão.');
      setReviewPersistenceLoaded(true);
      setReviewPersistenceLoading(false);
    });
  }, [isTranslationReviewOpen, reviewPersistenceLoaded, reviewPersistenceLoading]);

  useEffect(() => {
    if (!isTranslationReviewOpen || !reviewPersistenceLoaded || reviewPersistenceError) return;
    const refreshRequests = () => {
      void loadTranslationReviewRequests().then(setReviewRequests).catch(error => {
        setReviewPersistenceError(error instanceof Error ? error.message : 'Não foi possível atualizar a fila de pedidos de revisão.');
      });
    };
    const interval = window.setInterval(refreshRequests, 30_000);
    return () => window.clearInterval(interval);
  }, [isTranslationReviewOpen, reviewPersistenceLoaded, reviewPersistenceError]);

  const page14ImportantInitialSignature = useMemo(
    () => JSON.stringify([...buildInitialPage14ImportantUnitOverrides()]),
    [],
  );
  const page14ImportantSessionModified = page14ImportantDraftOverrides.size > 0
    || JSON.stringify([...page14ImportantUnitOverrides]) !== page14ImportantInitialSignature;
  const page14ImportantProof = useMemo(() => {
    const units = new Map(page14ImportantUnitOverrides);
    page14ImportantDraftOverrides.forEach((override, key) => units.set(key, override));
    return buildPage14ImportantCompositionProof(units);
  }, [page14ImportantUnitOverrides, page14ImportantDraftOverrides]);

  useEffect(() => {
    if (!page14ImportantSessionModified) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [page14ImportantSessionModified]);

  const isPage14ImportantCompositionVisible = currentPage === 14 && viewMode === 'single' && page14ImportantCompositionVariant !== null;
  const activeImportantCompositionVariant = isPage14ImportantCompositionVisible ? page14ImportantCompositionVariant : null;
  const isPage14ExperimentVisible = false;
  const isPage14V2ExperimentVisible = currentPage === PAGE14_V2_SNAPSHOT.pageNumber && viewMode === 'single' && page14V2Variant !== null;
  const isPage14V3ExperimentVisible = currentPage === PAGE14_V3_INITIAL.pageNumber && viewMode === 'single' && page14V3Variant !== null;
  const activeV3Variant = isPage14V3ExperimentVisible ? page14V3Variant : null;
  const activeExperimentVariant = isPage14ExperimentVisible && !isPage14V2ExperimentVisible && !isPage14V3ExperimentVisible ? editorialExperimentVariant : null;
  const activeV2Variant = isPage14V2ExperimentVisible ? page14V2Variant : null;
  const readOnlyExperiment = isPage14V2ExperimentVisible || isPage14V3ExperimentVisible || isPage14ImportantCompositionVisible || isPage14DraftVariant(activeExperimentVariant);
  const rendererLanguage: 'en' | 'pt-BR' = activeImportantCompositionVariant === 'EN' || activeV3Variant === 'EN' || activeV2Variant === 'EN' || activeExperimentVariant === 'EN'
    ? 'en'
    : activeImportantCompositionVariant || activeV3Variant || activeV2Variant || activeExperimentVariant === 'PT' || readOnlyExperiment
      ? 'pt-BR'
      : language;

  useEffect(() => {
    if (activeImportantCompositionVariant !== 'candidate') {
      setPage14ImportantMeasurement(null);
      return;
    }
    // Never show dimensions measured from the previously selected variant.
    setPage14ImportantMeasurement(null);

    let cancelled = false;
    let frameId = 0;
    let retryFrameId = 0;
    const measure = () => {
      frameId = window.requestAnimationFrame(() => {
        void document.fonts.ready.then(() => {
          if (cancelled) return;
          const block = document.querySelector<HTMLElement>('[data-proof-block-id="block_16"]');
          const realbox = block?.querySelector<HTMLElement>('.realbox');
          const page = block?.closest<HTMLElement>('[data-pdf-page-number]');
          if (!block || !realbox || !page) {
            retryFrameId = window.requestAnimationFrame(measure);
            return;
          }

          const pageRect = page.getBoundingClientRect();
          const pageWidthPt = Number(page.dataset.pdfPageWidth);
          const pageScale = pageWidthPt > 0 ? pageRect.width / pageWidthPt : 1;
          const frameRect = block.getBoundingClientRect();
          const visibleTextRects = measuredTextRectsOutside(realbox, 'svg')
            .filter(rect => rect.width > 0.25 && rect.height > 0.25);
          const lightningElements = Array.from(realbox.querySelectorAll<SVGElement>('svg[data-symbol-id="tag.important.icon"]'));
          const lightningViewportRects = lightningElements.map(element => element.getBoundingClientRect())
            .filter(rect => rect.width > 0.25 && rect.height > 0.25);
          const lightningPathRects: DOMRect[] = [];
          let lightningPathCount = 0;
          for (const svg of lightningElements) {
            lightningPathCount += svg.querySelectorAll('path').length;
            try {
              // SVGSVGElement.getBBox returns child artwork geometry in viewBox
              // space; its screen CTM maps it without using the CSS viewport box.
              const graphic = svg as SVGGraphicsElement;
              const bounds = graphic.getBBox();
              const matrix = graphic.getScreenCTM();
              if (!matrix || bounds.width <= 0 || bounds.height <= 0) continue;
              const points = [
                new DOMPoint(bounds.x, bounds.y),
                new DOMPoint(bounds.x + bounds.width, bounds.y),
                new DOMPoint(bounds.x, bounds.y + bounds.height),
                new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height),
              ].map(point => point.matrixTransform(matrix));
              const left = Math.min(...points.map(point => point.x));
              const right = Math.max(...points.map(point => point.x));
              const top = Math.min(...points.map(point => point.y));
              const bottom = Math.max(...points.map(point => point.y));
              lightningPathRects.push(new DOMRect(left, top, right - left, bottom - top));
            } catch {
              // Keep path bounds unavailable rather than silently calling the SVG viewport ink.
            }
          }
          const renderedSymbolBounds = lightningPathRects.length ? lightningPathRects : lightningViewportRects;
          const contentRects = [...visibleTextRects, ...renderedSymbolBounds];
          if (contentRects.length === 0) {
            retryFrameId = window.requestAnimationFrame(measure);
            return;
          }

          const lines: Array<{ top: number; bottom: number; left: number; right: number }> = [];
          for (const rect of visibleTextRects.sort((a, b) => a.top - b.top || a.left - b.left)) {
            const line = lines.find(candidate => Math.abs(candidate.top - rect.top) <= 2.5);
            if (line) {
              line.top = Math.min(line.top, rect.top);
              line.bottom = Math.max(line.bottom, rect.bottom);
              line.left = Math.min(line.left, rect.left);
              line.right = Math.max(line.right, rect.right);
            } else lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
          }
          const contentBottom = Math.max(...contentRects.map(rect => rect.bottom));
          const contentTop = Math.min(...contentRects.map(rect => rect.top));
          const contentLeft = Math.min(...contentRects.map(rect => rect.left));
          const contentRight = Math.max(...contentRects.map(rect => rect.right));
          const realboxRect = realbox.getBoundingClientRect();
          const maximumOverflowPt = (rects: DOMRect[]) => rects.length
            ? Number((Math.max(...rects.flatMap(rect => [
              realboxRect.left - rect.left,
              rect.right - realboxRect.right,
              frameRect.top - rect.top,
              rect.bottom - frameRect.bottom,
              0,
            ])) / pageScale).toFixed(2))
            : null;
          const nextBlock = document.querySelector<HTMLElement>('[data-proof-block-id="block_17"]');
          const nextRect = nextBlock?.getBoundingClientRect();
          setPage14ImportantMeasurement({
            variant: 'candidate',
            viewport: `${window.innerWidth}×${window.innerHeight}`,
            devicePixelRatio: window.devicePixelRatio,
            zoomLevel,
            lineCount: lines.length,
            contentGeometryHeightPt: Number(((contentBottom - contentTop) / pageScale).toFixed(2)),
            frameHeightPt: Number((frameRect.height / pageScale).toFixed(2)),
            maxLineWidthPt: Number((Math.max(...lines.map(line => line.right - line.left)) / pageScale).toFixed(2)),
            frameWidthPt: Number((realboxRect.width / pageScale).toFixed(2)),
            leftOverflowPt: Number((Math.max(0, realboxRect.left - contentLeft) / pageScale).toFixed(2)),
            rightOverflowPt: Number((Math.max(0, contentRight - realboxRect.right) / pageScale).toFixed(2)),
            topOverflowPt: Number((Math.max(0, frameRect.top - contentTop) / pageScale).toFixed(2)),
            lineWidthsPt: lines.map(line => Number(((line.right - line.left) / pageScale).toFixed(2))),
            lineRightOverflowPt: lines.map(line => Number((Math.max(0, line.right - realboxRect.right) / pageScale).toFixed(2))),
            bottomOverflowPt: Number((Math.max(0, contentBottom - frameRect.bottom) / pageScale).toFixed(2)),
            nextUnitGapPt: nextRect ? Number(((nextRect.top - contentBottom) / pageScale).toFixed(2)) : null,
            bottomPaddingPt: Number(((PAGE14_IMPORTANT_PANEL_FRAME[3] - (contentBottom - pageRect.top) / pageScale)).toFixed(2)),
            lightningCount: lightningElements.length,
            lightningViewportOverflowPt: maximumOverflowPt(lightningViewportRects),
            lightningPathGeometryOverflowPt: maximumOverflowPt(lightningPathRects),
            lightningPathCount,
            targetText: page14ImportantProof.targetText,
          });
        });
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(retryFrameId);
      window.removeEventListener('resize', measure);
    };
  }, [activeImportantCompositionVariant, currentPage, page14ImportantProof.targetText, zoomLevel]);
  const activeV3RuntimeBlockedUnits = useMemo(() => {
    if (activeV3Variant !== 'A' && activeV3Variant !== 'B') return new Set<string>();
    return new Set(Object.entries(page14V3ProposalMeasurements).flatMap(([key, measurement]) => {
      const prefix = `${activeV3Variant}:`;
      if (!key.startsWith(prefix)) return [];
      const unitKey = key.slice(prefix.length);
      const candidate = getPage14V3CurrentCandidate(activeV3Variant, unitKey);
      const isCurrentProposal = candidate
        && isPage14V3MeasurementCurrentEnvironment(measurement, zoomLevel)
        && normalizePage14V3MeasuredText(measurement.renderedText) === normalizePage14V3MeasuredText(candidate.proposedText);
      return isCurrentProposal
        && (getStructuralCopyfitBlockStatus(measurement.structuralStatus, measurement.overflow, measurement.collision)
          || getCopyfitLineCountBlockStatus(page14V3SourcePdfVisualLineCount(unitKey), measurement.lineCount))
        ? [unitKey]
        : [];
    }));
  }, [activeV3Variant, page14V3ProposalMeasurements, zoomLevel]);
  const activeV3DiagnosticBlankKeys = useMemo(() => {
    if (activeV3Variant !== 'A' && activeV3Variant !== 'B') return new Set<string>();
    return new Set(PAGE14_V2_SNAPSHOT.units.flatMap(unit => {
      const candidate = getPage14V3CurrentCandidate(activeV3Variant, unit.spanKey);
      if (!candidate) return [];
      const staticallyBlocked = candidate.status.startsWith('blocked') || candidate.status.startsWith('source-en-preserved');
      return staticallyBlocked || activeV3RuntimeBlockedUnits.has(unit.spanKey) ? [unit.spanKey] : [];
    }));
  }, [activeV3Variant, activeV3RuntimeBlockedUnits]);
  const experimentalOverrides = useMemo(
    () => activeImportantCompositionVariant === 'candidate'
      ? new Map([[page14ImportantProof.override.spanKey, page14ImportantProof.override]])
      : activeV3Variant === 'A' || activeV3Variant === 'B'
      ? getPage14V3CurrentOverrides(activeV3Variant, activeV3RuntimeBlockedUnits)
      : activeV2Variant && isPage14V2BlindVariant(activeV2Variant)
        ? getPage14V2ExperimentalOverrides(activeV2Variant)
        : isPage14DraftVariant(activeExperimentVariant)
          ? getPage14ExperimentalOverrides(activeExperimentVariant)
          : undefined,
    [activeImportantCompositionVariant, page14ImportantProof, activeV3Variant, activeV2Variant, activeExperimentVariant, activeV3RuntimeBlockedUnits],
  );
  const experimentalFrames = useMemo(
    () => isPage14V3ExperimentVisible
      ? getPage14V3Frames()
      : isPage14V2ExperimentVisible
        ? getPage14V2ExperimentalFrames()
        : isPage14DraftVariant(activeExperimentVariant)
          ? getPage14ExperimentalFrames()
          : undefined,
    [isPage14V3ExperimentVisible, isPage14V2ExperimentVisible, activeExperimentVariant],
  );

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  const handleFocalZoomApplied = useCallback((id: number) => {
    setFocalZoomAnchor(current => current?.id === id ? null : current);
  }, []);

  const changeZoomAroundCenter = useCallback((requestedZoom: number, resetPan = false) => {
    const nextZoom = clampViewerZoom(requestedZoom);
    const currentZoom = zoomLevelRef.current;
    const zoomChanged = Math.abs(nextZoom - currentZoom) >= 0.000001;
    if (!zoomChanged && !resetPan) return;

    if (wheelAnimationFrameRef.current !== null) {
      cancelAnimationFrame(wheelAnimationFrameRef.current);
      wheelAnimationFrameRef.current = null;
    }
    pendingWheelZoomRef.current = null;
    zoomLevelRef.current = nextZoom;
    if (zoomChanged || resetPan) setZoomLevel(nextZoom);

    if (viewMode !== 'single') {
      setFocalZoomAnchor(null);
      return;
    }
    const stage = mainRef.current?.querySelector<HTMLElement>('.page-stage');
    const page = stage?.querySelector<HTMLElement>('.page-container');
    if (!stage || !page) {
      setFocalZoomAnchor(null);
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const pageWidth = Number(page.dataset.pdfPageWidth);
    const pageHeight = Number(page.dataset.pdfPageHeight);
    const focal = resetPan
      ? { pageX: pageWidth / 2, pageY: pageHeight / 2, viewportX: stage.clientWidth / 2, viewportY: stage.clientHeight / 2 }
      : captureDocumentFocalPoint({
        clientX: stageRect.left + stage.clientLeft + stage.clientWidth / 2,
        clientY: stageRect.top + stage.clientTop + stage.clientHeight / 2,
        viewport: { left: stageRect.left, top: stageRect.top, clientLeft: stage.clientLeft, clientTop: stage.clientTop },
        page: { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
        pageWidth,
        pageHeight,
      });
    if (focal) {
      setFocalZoomAnchor({
        id: ++focalZoomAnchorIdRef.current,
        pageNumber: Number(page.dataset.pdfPageNumber),
        focal,
        resetPan,
        centerWhenFits: !resetPan,
      });
    } else {
      setFocalZoomAnchor(null);
    }
  }, [viewMode]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main || viewMode !== 'single') return;

    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const stage = target.closest<HTMLElement>('.page-stage');
      if (!stage || !main.contains(stage)) return;
      const page = stage.querySelector<HTMLElement>('.page-container');
      if (!page) return;

      const nextZoom = ctrlWheelZoomLevel({
        ctrlKey: event.ctrlKey,
        cancelable: event.cancelable,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        viewportHeight: stage.clientHeight,
        currentZoom: zoomLevelRef.current,
      });
      if (nextZoom === null) return;

      const stageRect = stage.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      const focal = captureDocumentFocalPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        viewport: { left: stageRect.left, top: stageRect.top, clientLeft: stage.clientLeft, clientTop: stage.clientTop },
        page: { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
        pageWidth: Number(page.dataset.pdfPageWidth),
        pageHeight: Number(page.dataset.pdfPageHeight),
      });
      if (!focal) return;

      // Consume only a Ctrl+wheel gesture over the actual PDF page. Plain wheel
      // continues to scroll normally, and continuous mode remains untouched.
      event.preventDefault();
      if (Math.abs(nextZoom - zoomLevelRef.current) < 0.000001) return;
      zoomLevelRef.current = nextZoom;
      pendingWheelZoomRef.current = {
        zoomLevel: nextZoom,
        pageNumber: Number(page.dataset.pdfPageNumber),
        focal,
      };
      if (wheelAnimationFrameRef.current !== null) return;

      wheelAnimationFrameRef.current = requestAnimationFrame(() => {
        wheelAnimationFrameRef.current = null;
        const pending = pendingWheelZoomRef.current;
        pendingWheelZoomRef.current = null;
        if (!pending) return;
        setZoomLevel(pending.zoomLevel);
        setFocalZoomAnchor({ id: ++focalZoomAnchorIdRef.current, ...pending });
      });
    };

    main.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      main.removeEventListener('wheel', onWheel);
      if (wheelAnimationFrameRef.current !== null) {
        cancelAnimationFrame(wheelAnimationFrameRef.current);
        wheelAnimationFrameRef.current = null;
      }
      pendingWheelZoomRef.current = null;
    };
  }, [viewMode]);

  useEffect(() => {
    let active = true;
    loadSymbolAliasSettings().then(result => {
      if (!active) return;
      setSymbolAliasPreferences(result.preferences);
      setSymbolAliasSettingsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const handlePaletteEditorChange = useCallback((editorKey: string, state: AdminSymbolPaletteEditorState | null) => {
    if (state) {
      activePaletteEditorRef.current = { editorKey, state };
      setPaletteEditorState(current => current
        && current.editorKey === editorKey
        && current.context === state.context
        && current.canInsert === state.canInsert
        && current.canUndo === state.canUndo
        && current.status === state.status
        ? current
        : { editorKey, context: state.context, canInsert: state.canInsert, canUndo: state.canUndo, status: state.status });
    } else if (activePaletteEditorRef.current?.editorKey === editorKey) {
      activePaletteEditorRef.current = null;
      setPaletteEditorState(null);
    }
  }, []);

  const handleEditorOpenChange = useCallback((pageNumber: number, open: boolean) => {
    if (open) {
      openEditorPagesRef.current.add(pageNumber);
      setIsFaqOpen(false);
    }
    else openEditorPagesRef.current.delete(pageNumber);
    setIsRichEditorOpen(openEditorPagesRef.current.size > 0);
  }, []);

  const handleSaveSymbolAlias = useCallback(async (symbolId: string, alias: string | null) => {
    const next = { ...symbolAliasPreferences };
    if (alias === null) next[symbolId] = getDefaultSymbolAliasPreferences()[symbolId];
    else {
      const normalized = normalizeEditorAlias(alias);
      if (!normalized || !getSemanticSymbol(symbolId)) {
        return { ok: false, message: language === 'pt-BR' ? 'Digite um atalho válido.' : 'Enter a valid shortcut.' };
      }
      next[symbolId] = normalized;
    }
    const conflicts = getEditorAliasConflicts(next);
    if (conflicts.length) return {
      ok: false,
      message: language === 'pt-BR'
        ? `Atalho em conflito: ${conflicts.map(value => `[[${value}]]`).join(', ')}.`
        : `Shortcut conflict: ${conflicts.map(value => `[[${value}]]`).join(', ')}.`,
    };
    const result = await saveSymbolAliasSettings(next);
    if (!result.ok) {
      const message = result.reason === 'conflict'
        ? (language === 'pt-BR' ? 'Esse atalho já está atribuído a outro símbolo.' : 'That shortcut is already assigned to another symbol.')
        : result.reason === 'verification-failed'
          ? (language === 'pt-BR' ? 'O Payload não confirmou a preferência salva.' : 'Payload did not confirm the saved preference.')
          : (language === 'pt-BR' ? 'Não foi possível salvar no Payload.' : 'Could not save to Payload.');
      return { ok: false, message };
    }
    setSymbolAliasPreferences(result.preferences);
    return { ok: true, message: language === 'pt-BR' ? 'Atalho salvo e relido do banco.' : 'Shortcut saved and reloaded from the database.' };
  }, [symbolAliasPreferences, language]);

  const acceptLeavingLayout = useCallback(() => {
    if (isLayoutDirty && !window.confirm('Há alterações de moldura não salvas. Descartar e sair do modo de layout?')) return false;
    setIsLayoutMode(false);
    setIsLayoutDirty(false);
    return true;
  }, [isLayoutDirty]);

  const acceptLeavingTranslationDraft = useCallback(() => {
    if (!hasTranslationDraft) return true;
    const confirmed = window.confirm(language === 'pt-BR'
      ? 'Há alterações de tradução não salvas. Quer descartá-las e continuar?'
      : 'There are unsaved text changes. Discard them and continue?');
    if (confirmed) setHasTranslationDraft(false);
    return confirmed;
  }, [hasTranslationDraft, language]);

  const closeTranslationReview = useCallback(() => {
    setIsTranslationReviewOpen(false);
  }, []);

  const reviewCandidates = useMemo(
    () => reviewCatalog?.proposals.flatMap(proposal => proposal.candidates) ?? [],
    [reviewCatalog],
  );
  const selectedReviewCandidate = reviewCandidates.find(candidate => candidate.reviewKey === selectedReviewKey) ?? null;
  const reviewEditorCandidate = useMemo(() => {
    const fromProposals = reviewCandidates.find(candidate => candidate.reviewKey === reviewEditorItemKey);
    if (fromProposals) return fromProposals;
    if (!reviewEditorItemKey) return null;
    const fromRecord = reviewRecords.find(record => record.reviewKey === reviewEditorItemKey);
    if (!fromRecord) return null;
    const blockIndex = Number(fromRecord.spanKey.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u)?.[1]);
    const fallback: TranslationReviewCandidate = {
      reviewKey: fromRecord.reviewKey,
      pageNumber: fromRecord.pageNumber,
      proposalId: fromRecord.proposalId,
      proposalVersion: fromRecord.proposalVersion,
      proposalTitle: 'Unidade aprovada',
      proposalFile: '',
      index: 0,
      spanKey: fromRecord.spanKey,
      blockIndex: Number.isInteger(blockIndex) ? blockIndex : null,
      sourceBlockId: null,
      sourceUnitId: null,
      sourceText: fromRecord.sourceText ?? '',
      proposalText: textForReviewData(fromRecord.publication?.data ?? fromRecord.data),
      data: fromRecord.publication?.data ?? fromRecord.data,
      technicalStatus: fromRecord.technicalStatus,
      editorialStatus: fromRecord.approvalStatus,
      diagnosticRendering: '',
      pendingTerms: [],
      diagnosticBlank: null,
    };
    return fallback;
  }, [reviewCandidates, reviewEditorItemKey, reviewRecords]);
  const reviewEditorRecord = reviewEditorCandidate
    ? reviewRecordForCandidate(reviewRecords, reviewEditorCandidate)
    : undefined;
  const reviewEditorRendererKey = reviewEditorCandidate
    ? rendererKeyForReviewCandidate(reviewEditorCandidate, pageData?.page_number === reviewEditorCandidate.pageNumber ? pageData : null)
    : reviewEditorSelectionKey;
  const reviewEditorBaseData = reviewEditorRecord?.data ?? reviewEditorCandidate?.data;
  const reviewEditorOverride = useMemo(() => reviewEditorCandidate && reviewEditorRendererKey
    ? spanOverrideForReviewCandidate(reviewEditorCandidate, reviewEditorRendererKey, reviewEditorBaseData, pageData)
    : null,
  [reviewEditorCandidate, reviewEditorRendererKey, reviewEditorBaseData]);
  const reviewEditorOverrides = useMemo(() => reviewEditorOverride
    ? new Map([[reviewEditorOverride.spanKey, reviewEditorOverride]])
    : new Map<string, SpanOverride>(), [reviewEditorOverride]);
  const isProposalReviewEditorMode = Boolean(reviewEditorItemKey && reviewEditorSelectionKey);
  const highlightedReviewCandidate = isProposalReviewEditorMode ? reviewEditorCandidate : selectedReviewCandidate;
  const reviewHighlightRendererKey = (isTranslationReviewOpen || isProposalReviewEditorMode)
    && highlightedReviewCandidate?.pageNumber === currentPage
    && pageData?.page_number === currentPage
    ? rendererKeyForReviewCandidate(highlightedReviewCandidate, pageData)
    : null;

  const lastScrolledReviewKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isTranslationReviewOpen || !reviewHighlightRendererKey) return;
    if (highlightedReviewCandidate?.reviewKey === lastScrolledReviewKeyRef.current) return;
    lastScrolledReviewKeyRef.current = highlightedReviewCandidate?.reviewKey ?? null;
    // A zoom gesture can still be applying its focal pan after the scale
    // changes. Let PageRenderer finish that correction before centering the
    // selected review target, or its final scroll can move the highlight back
    // out of the visible area.
    if (focalZoomAnchor?.pageNumber === currentPage) return;
    let firstFrame = 0;
    let secondFrame = 0;
    const scrollToHighlight = () => {
      const target = Array.from(mainRef.current?.querySelectorAll<HTMLElement>('[data-translation-review-highlight]') ?? [])
        .find(element => element.dataset.translationReviewHighlight === reviewHighlightRendererKey);
      const stage = target?.closest<HTMLElement>('.page-stage');
      if (!target || !stage) return;

      const targetRect = target.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const top = Math.max(0, Math.min(stage.scrollHeight - stage.clientHeight,
        stage.scrollTop + targetRect.top - stageRect.top + targetRect.height / 2 - stage.clientHeight / 2));
      const left = Math.max(0, Math.min(stage.scrollWidth - stage.clientWidth,
        stage.scrollLeft + targetRect.left - stageRect.left + targetRect.width / 2 - stage.clientWidth / 2));
      const reduceMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
      if (typeof stage.scrollTo === 'function') stage.scrollTo({ top, left, behavior });
      else {
        stage.scrollTop = top;
        stage.scrollLeft = left;
      }
    };

    // Zoom updates the page scale and its focal pan in PageRenderer's layout
    // effects. Wait two frames so the review target is measured after both settle.
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(scrollToHighlight);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [isTranslationReviewOpen, reviewHighlightRendererKey, currentPage, zoomLevel, focalZoomAnchor]);

  const reviewPreview = useMemo(() => {
    const overrides = new Map<string, SpanOverride>();
    const layoutFrames = new Map<string, LayoutFrame>();
    const diagnosticBlankKeys = new Set<string>();
    if (!isTranslationReviewOpen || viewMode !== 'single' || rendererLanguage !== 'pt-BR'
      || readOnlyExperiment || !pageData || pageData.page_number !== currentPage) {
      return { overrides, layoutFrames, diagnosticBlankKeys };
    }
    for (const candidate of reviewCandidates.filter(item => item.pageNumber === currentPage)) {
      const rendererKey = rendererKeyForReviewCandidate(candidate, pageData);
      if (candidateRequiresDiagnosticBlank(candidate)) {
        const baseKey = rendererKey.replace(/__pt-BR$/u, '');
        if (!savedHumanTranslations.has(rendererKey)
          && !savedHumanTranslations.has(baseKey)
          && !savedHumanTranslations.has(candidate.spanKey)) {
          diagnosticBlankKeys.add(rendererKey);
        }
        continue;
      }
      const record = reviewRecordForCandidate(reviewRecords, candidate);
      const humanTranslationKeys = [
        rendererKey,
        rendererKey.replace(/__pt-BR$/u, ''),
        candidate.spanKey,
        candidate.spanKey.replace(/__pt-BR$/u, ''),
      ];
      const hasSavedHumanTranslation = humanTranslationKeys.some(key => savedHumanTranslations.has(key));
      if (!record && hasSavedHumanTranslation) {
        // Keep the human translation visible even when PageRenderer has not
        // loaded its Payload override yet; never fall back to agent text here.
        const humanKey = humanTranslationKeys.find(key => savedHumanTranslationData.has(key));
        const humanData = humanKey ? savedHumanTranslationData.get(humanKey) : undefined;
        const humanOverride = humanData === undefined
          ? null
          : spanOverrideForReviewCandidate(candidate, rendererKey, humanData, pageData);
        if (humanOverride) overrides.set(rendererKey, humanOverride);
        continue;
      }
      const override = spanOverrideForReviewCandidate(candidate, rendererKey,
        selectedPublishedReviewKey === candidate.reviewKey && record?.publication
          ? record.publication.data
          : reviewDraftOverrides.get(rendererKey) ?? record?.data ?? candidate.data, pageData);
      if (override) {
        overrides.set(rendererKey, override);
        const clientKey = clientSpanKey(rendererKey, 'pt-BR');
        if (clientKey !== rendererKey) overrides.set(clientKey, { ...override, spanKey: clientKey });
        const frame = layoutFrameForReviewOverride(candidate.reviewLayoutFrame, override);
        if (frame && !hasSavedHumanTranslation) layoutFrames.set(rendererKey.replace(/__pt-BR$/u, ''), frame);
      }
    }
    for (const exception of reviewCatalog?.exceptions ?? []) {
      if (exception.pageNumber !== currentPage || !exceptionRequiresDiagnosticBlank(exception)) continue;
      const linkedCandidate = candidateForReviewException(reviewCandidates, exception);
      let rendererKey = linkedCandidate ? rendererKeyForReviewCandidate(linkedCandidate, pageData) : null;
      const index = Number(exception.spanKey?.match(/^page_\d+_block_(\d+)(?:__pt-BR)?$/u)?.[1]);
      if (!rendererKey && Number.isInteger(index) && index >= 0) {
        const block = pageData.blocks[index];
        rendererKey = block?.editorKey ? `${block.editorKey}__pt-BR` : `page_${currentPage}_block_${index}`;
      }
      if (!rendererKey && exception.sourceBlockId) {
        const blockIndex = pageData.blocks.findIndex(block => block.id === exception.sourceBlockId);
        if (blockIndex >= 0) {
          const block = pageData.blocks[blockIndex];
          rendererKey = block.editorKey ? `${block.editorKey}__pt-BR` : `page_${currentPage}_block_${blockIndex}`;
        }
      }
      if (!rendererKey && exception.spanKey?.startsWith(`page_${currentPage}_unit_`)) {
        rendererKey = exception.spanKey.endsWith('__pt-BR') ? exception.spanKey : `${exception.spanKey}__pt-BR`;
      }
      if (!rendererKey) continue;
      const baseKey = rendererKey.replace(/__pt-BR$/u, '');
      if (!savedHumanTranslations.has(rendererKey)
        && !savedHumanTranslations.has(baseKey)
        && !savedHumanTranslations.has(exception.spanKey ?? '')) {
        diagnosticBlankKeys.add(rendererKey);
      }
    }
    return { overrides, layoutFrames, diagnosticBlankKeys };
  }, [isTranslationReviewOpen, viewMode, rendererLanguage, readOnlyExperiment, pageData, currentPage, reviewCandidates, reviewCatalog, savedHumanTranslations, savedHumanTranslationData, reviewRecords, reviewDraftOverrides, selectedPublishedReviewKey]);
  const effectiveDiagnosticBlankKeys = useMemo(() => new Set([
    ...reviewPreview.diagnosticBlankKeys,
    ...activeV3DiagnosticBlankKeys,
  ]), [reviewPreview.diagnosticBlankKeys, activeV3DiagnosticBlankKeys]);

  useEffect(() => {
    if (!reviewEditorCandidate || !pageData || pageData.page_number !== currentPage) return;
    const rendererKey = rendererKeyForReviewCandidate(reviewEditorCandidate, pageData);
    setReviewEditorSelectionKey(current => current === rendererKey ? current : rendererKey);
  }, [reviewEditorCandidate, pageData, currentPage]);

  const handleReviewEditorDraftChange = useCallback((spanKey: string, draft: SpanOverride | null) => {
    setReviewDraftOverrides(current => {
      const existing = current.get(spanKey);
      if ((!draft && !existing) || (draft && existing && JSON.stringify(existing) === JSON.stringify(draft))) {
        return current;
      }
      const next = new Map(current);
      if (draft) next.set(spanKey, draft);
      else next.delete(spanKey);
      return next;
    });
    setHasTranslationDraft(draft !== null);
  }, []);

  const handleReviewEditorClose = useCallback(() => {
    setReviewEditorSelectionKey(null);
    setReviewEditorItemKey(null);
    setReviewDraftOverrides(new Map());
    setHasTranslationDraft(false);
    setIsTranslationReviewOpen(true);
  }, []);

  const handleProposalReviewSave = useCallback((spanKey: string, override: SpanOverride | null) => {
    if (!reviewEditorCandidate) return;
    const expectedKey = rendererKeyForReviewCandidate(reviewEditorCandidate,
      pageData?.page_number === reviewEditorCandidate.pageNumber ? pageData : null);
    if (!override) {
      setReviewStatus('A proposta original foi restaurada somente nesta sessão; nenhuma tradução foi publicada.');
      return;
    }
    if (spanKey !== expectedKey || override.spanKey !== expectedKey) {
      setReviewStatus('A unidade selecionada mudou. Abra novamente a unidade pelo painel para salvar a proposta correta.');
      return;
    }
    setReviewWritingKey(reviewEditorCandidate.reviewKey);
    setReviewStatus(null);
    void persistTranslationReview(
      reviewEditorCandidate,
      override,
      reviewRecordForCandidate(reviewRecords, reviewEditorCandidate),
      'pending',
      'changed_since_technical_validation',
    ).then(saved => {
      setReviewRecords(current => withUpdatedTranslationReviewRecord(current, saved));
      setReviewDraftOverrides(current => { const next = new Map(current); next.delete(override.spanKey); return next; });
      setHasTranslationDraft(false);
      setReviewPersistenceError(null);
      setReviewStatus('Rascunho salvo. A aprovação editorial continua pendente.');
    }).catch(error => {
      setReviewDraftOverrides(new Map([[override.spanKey, override]]));
      setHasTranslationDraft(true);
      setReviewStatus('Não foi possível persistir o rascunho. O texto foi mantido nesta sessão; reabra o Editor para tentar novamente.');
      setReviewPersistenceError(error instanceof Error ? error.message : 'Não foi possível salvar a proposta.');
    }).finally(() => setReviewWritingKey(null));
  }, [reviewEditorCandidate, pageData, reviewRecords]);

  const moveToReviewPage = useCallback((pageNumber: number) => {
    if (!acceptLeavingLayout() || !acceptLeavingTranslationDraft()) return false;
    setEditorialExperimentVariant(null);
    setPage14V2Variant(null);
    setPage14V3Variant(null);
    setPage14ImportantCompositionVariant(null);
    setViewMode('single');
    setCurrentPage(pageNumber);
    setPageInput(String(pageNumber));
    setLanguage('pt-BR');
    setIsTranslationReviewOpen(true);
    setReviewEditorSelectionKey(null);
    setReviewEditorItemKey(null);
    setReviewDraftOverrides(new Map());
    return true;
  }, [acceptLeavingLayout, acceptLeavingTranslationDraft]);

  const handleSelectReviewCandidate = useCallback((candidate: TranslationReviewCandidate) => {
    const needsReviewNavigation = candidate.pageNumber !== currentPage
      || viewMode !== 'single'
      || readOnlyExperiment;
    if (needsReviewNavigation && !moveToReviewPage(candidate.pageNumber)) return;
    setSelectedReviewKey(candidate.reviewKey);
    setSelectedPublishedReviewKey(null);
    setReviewStatus(null);
  }, [currentPage, viewMode, readOnlyExperiment, moveToReviewPage]);

  const handleOpenReviewViewer = useCallback((candidate: TranslationReviewCandidate, diagnosticBlank: boolean) => {
    if (!moveToReviewPage(candidate.pageNumber)) return;
    setSelectedReviewKey(candidate.reviewKey);
    setSelectedPublishedReviewKey(null);
    setReviewStatus(diagnosticBlank
      ? 'Prévia diagnóstica: a unidade fica vazia; o texto completo permanece neste painel.'
      : 'Prévia PT-BR temporária de revisão; as traduções salvas continuam preservadas.');
  }, [moveToReviewPage]);

  const handleOpenApprovedViewer = useCallback((candidate: TranslationReviewCandidate) => {
    if (!moveToReviewPage(candidate.pageNumber)) return;
    setSelectedReviewKey(candidate.reviewKey);
    setSelectedPublishedReviewKey(candidate.reviewKey);
    setReviewStatus('Versão aprovada carregada do Payload no Viewer PT-BR.');
  }, [moveToReviewPage]);

  const handleOpenReviewEditor = useCallback((candidate: TranslationReviewCandidate) => {
    if (!moveToReviewPage(candidate.pageNumber)) return;
    const key = rendererKeyForReviewCandidate(candidate, pageData?.page_number === candidate.pageNumber ? pageData : null);
    setSelectedReviewKey(candidate.reviewKey);
    setSelectedPublishedReviewKey(null);
    setReviewEditorItemKey(candidate.reviewKey);
    setReviewEditorSelectionKey(key);
    setIsTranslationReviewOpen(false);
    setIsAdmin(true);
    setIsSymbolPaletteOpen(false);
  }, [moveToReviewPage, pageData]);

  const persistReviewState = useCallback(async (
    candidate: TranslationReviewCandidate,
    approvalStatus: 'pending' | 'approved',
  ) => {
    if (hasTranslationDraft) return;
    const rendererKey = rendererKeyForReviewCandidate(candidate,
      pageData?.page_number === candidate.pageNumber ? pageData : null);
    const existing = reviewRecordForCandidate(reviewRecords, candidate);
    const data = spanOverrideForReviewCandidate(candidate, rendererKey, existing?.data ?? candidate.data, pageData);
    if (!data) {
      setReviewStatus('Esta proposta não tem segmentos editáveis para salvar.');
      return;
    }
    setReviewWritingKey(candidate.reviewKey);
    setReviewStatus(null);
    try {
      const sameReviewedVersion = existing?.proposalId === candidate.proposalId
        && existing?.proposalVersion === candidate.proposalVersion;
      const technicalStatus = existing
        ? sameReviewedVersion ? existing.technicalStatus : 'stale_review_version'
        : candidate.technicalStatus;
      const saved = await persistTranslationReview(candidate, data, existing, approvalStatus, technicalStatus);
      setReviewRecords(current => withUpdatedTranslationReviewRecord(current, saved));
      setReviewPersistenceError(null);
      setReviewStatus(approvalStatus === 'approved'
        ? 'Unidade aprovada explicitamente.'
        : existing?.publication
          ? 'Nova revisão aberta. A versão já aprovada continua publicada.'
          : 'A aprovação editorial foi reaberta.');
    } catch (error) {
      setReviewPersistenceError(error instanceof Error ? error.message : 'Não foi possível salvar a revisão.');
    } finally {
      setReviewWritingKey(null);
    }
  }, [hasTranslationDraft, pageData, reviewRecords]);

  const handleApproveReviewCandidate = useCallback(async (candidate: TranslationReviewCandidate) => {
    if (hasTranslationDraft) return false;
    const rendererKey = rendererKeyForReviewCandidate(candidate,
      pageData?.page_number === candidate.pageNumber ? pageData : null);
    const existing = reviewRecordForCandidate(reviewRecords, candidate);
    const data = spanOverrideForReviewCandidate(candidate, rendererKey, existing?.data ?? candidate.data, pageData);
    if (!data) {
      setReviewStatus('Esta proposta não tem segmentos editáveis para publicar.');
      return false;
    }
    const sameReviewedVersion = existing?.proposalId === candidate.proposalId
      && existing?.proposalVersion === candidate.proposalVersion;
    const technicalStatus = existing
      ? sameReviewedVersion ? existing.technicalStatus : 'stale_review_version'
      : candidate.technicalStatus;
    const currentCopyfit = sameReviewedVersion && existing ? existing : candidate;
    const copyfitBlock = copyfitCanonicalEvidenceBlockReason(candidate, data) ?? copyfitApprovalBlockReason(
      currentCopyfit.copyfitClassification ?? candidate.copyfitClassification,
      technicalStatus,
      currentCopyfit.underCompositionJustification ?? candidate.underCompositionJustification,
      currentCopyfit.copyfitSourcePdfLineCount ?? candidate.copyfitSourcePdfLineCount,
      currentCopyfit.copyfitPageRendererLineCount ?? candidate.copyfitPageRendererLineCount,
    );
    if (copyfitBlock) {
      setReviewStatus(copyfitBlock === 'OVER'
        ? 'Copyfit V3: OVER. Esta versão tem mais linhas visuais que o PDF-fonte e não pode ser aprovada.'
        : copyfitBlock === 'MEASUREMENT_MISMATCH'
          ? 'As contagens visuais não correspondem à classificação Copyfit V3. Atualize a medição antes de aprovar.'
        : copyfitBlock === 'UNDER_WITHOUT_COMPOSITION_RATIONALE'
          ? 'Copyfit V3: UNDER exige uma justificativa explícita de composição antes da aprovação.'
          : copyfitBlock === 'STALE_MEASUREMENT'
            ? 'A proposta, o texto ou a geometria mudou depois da medição. Valide novamente esta versão antes de aprovar.'
            : 'A medição visual Copyfit V3 ainda está pendente. A unidade continua em Propostas.');
      return false;
    }
    setReviewWritingKey(candidate.reviewKey);
    setReviewStatus(null);
    setReviewPersistenceError(null);
    try {
      const saved = await persistTranslationReviewApproval(candidate, data, existing, technicalStatus);
      const savedText = textForReviewData(saved.translation.data);
      setReviewRecords(current => withUpdatedTranslationReviewRecord(current, saved.review));
      setSavedHumanTranslations(current => {
        const next = new Map(current);
        next.set(candidate.spanKey, savedText);
        next.set(rendererKey, savedText);
        return next;
      });
      setSavedHumanTranslationData(current => {
        const next = new Map(current);
        next.set(candidate.spanKey, saved.translation.data);
        next.set(rendererKey, saved.translation.data);
        return next;
      });
      setSavedPayloadTranslations(current => {
        const next = new Map(current);
        const payloadKey = saved.translation.spanKey.replace(/__pt-BR$/u, '');
        next.set(payloadKey, saved.translation);
        next.set(saved.translation.spanKey, saved.translation);
        return next;
      });
      setSelectedPublishedReviewKey(null);
      setReviewStatus('Gravação confirmada no PT-BR.');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível confirmar a publicação da unidade.';
      setReviewStatus(`Erro ao aprovar. A unidade continua em Propostas. ${message}`);
      return false;
    } finally {
      setReviewWritingKey(null);
    }
  }, [hasTranslationDraft, pageData, reviewRecords]);

  const handleSetTranslationReviewArchived = useCallback(async (
    candidate: TranslationReviewCandidate,
    archived: boolean,
  ) => {
    if (hasTranslationDraft) throw new Error('Salve ou descarte as alterações no Editor antes de alterar a fila.');
    const existing = reviewRecordForCandidate(reviewRecords, candidate);
    setReviewWritingKey(candidate.reviewKey);
    setReviewStatus(null);
    try {
      const saved = await persistTranslationReviewDisposition(candidate, existing, archived ? 'archived' : 'active');
      setReviewRecords(current => withUpdatedTranslationReviewRecord(current, saved));
      setReviewPersistenceError(null);
    } finally {
      setReviewWritingKey(null);
    }
  }, [hasTranslationDraft, reviewRecords]);

  const handleClearReviewSelection = useCallback(() => {
    setSelectedReviewKey(null);
    setSelectedPublishedReviewKey(null);
  }, []);

  const handleReopenReviewCandidate = useCallback((candidate: TranslationReviewCandidate) => {
    void persistReviewState(candidate, 'pending');
  }, [persistReviewState]);

  const handleCreateTranslationReviewRequest = useCallback(async (input: NewTranslationReviewRequest) => {
    const saved = await persistTranslationReviewRequest(input);
    setReviewRequests(current => [...current, saved].sort((left, right) =>
      (Date.parse(left.createdAt ?? '') || 0) - (Date.parse(right.createdAt ?? '') || 0)));
    return saved;
  }, []);

  const handleUpdateTranslationReviewRequest = useCallback(async (
    request: TranslationReviewRequest,
    status: TranslationReviewRequestStatus,
    resultNote?: string,
  ) => {
    const saved = await updateTranslationReviewRequest(request, status, resultNote);
    setReviewRequests(current => current.map(item => item.id === saved.id ? saved : item));
  }, []);

  const handleCompleteTranslationReviewRequestAsUser = useCallback(async (
    request: TranslationReviewRequest,
    resultNote: string,
  ) => {
    const completed = await completeTranslationReviewRequestAsUser(request, resultNote);
    const savedText = textForReviewData(completed.translation.data);
    const clientKey = clientSpanKey(completed.translation.spanKey, 'pt-BR');
    setReviewRequests(current => current.map(item => item.id === completed.request.id ? completed.request : item));
    setReviewRecords(current => withUpdatedTranslationReviewRecord(current, completed.review));
    setSavedHumanTranslations(current => {
      const next = new Map(current);
      next.set(clientKey, savedText);
      next.set(completed.translation.spanKey, savedText);
      return next;
    });
    setSavedHumanTranslationData(current => {
      const next = new Map(current);
      next.set(clientKey, completed.translation.data);
      next.set(completed.translation.spanKey, completed.translation.data);
      return next;
    });
    setSavedPayloadTranslations(current => {
      const next = new Map(current);
      next.set(clientKey, completed.translation);
      next.set(completed.translation.spanKey, completed.translation);
      return next;
    });
    setReviewPersistenceError(null);
    setReviewStatus('Pedido concluído por você. O conteúdo PT-BR existente foi confirmado e registrado em Aprovados.');
  }, []);

  const handleTranslationGlossaryDecision = useCallback(async (
    sourceTerm: string,
    targetTerm: string,
    decisionStatus: TranslationGlossaryDecisionStatus,
  ) => {
    const decisionKey = glossaryDecisionKey(sourceTerm, targetTerm);
    const conflictingApproved = glossaryDecisions.find(decision => decision.decisionStatus === 'approved'
      && decision.normalizedSourceTerm === normalizeGlossaryTerm(sourceTerm)
      && decision.normalizedTargetTerm !== normalizeGlossaryTerm(targetTerm));
    if (decisionStatus === 'approved' && conflictingApproved) {
      throw new Error(`“${sourceTerm}” já está aprovado como “${conflictingApproved.targetTerm}”. Revise essa decisão antes de aprovar outra forma.`);
    }
    const officialTerm = reviewCatalog?.officialGlossaryTerms?.find(term => normalizeGlossaryTerm(term.sourceTerm) === normalizeGlossaryTerm(sourceTerm));
    if (decisionStatus === 'approved' && officialTerm
      && !officialTerm.targetTerms.some(term => normalizeGlossaryTerm(term) === normalizeGlossaryTerm(targetTerm))) {
      throw new Error(`“${sourceTerm}” já consta no glossário oficial como “${officialTerm.targetTerms.join(' / ')}”. A proposta conflitante permanece pendente para revisão.`);
    }
    const occurrences = reviewCandidates.flatMap(candidate => candidate.pendingTerms
      .flatMap(note => parseGlossaryTermCandidates(note))
      .filter(term => term.decisionKey === decisionKey)
      .map(() => ({
        pageNumber: candidate.pageNumber,
        reviewKey: candidate.reviewKey,
        proposalTitle: candidate.proposalTitle,
        sourceText: candidate.sourceText,
        proposalText: candidate.proposalText,
      })));
    const existing = glossaryDecisions.find(decision => decision.decisionKey === decisionKey);
    const saved = await persistTranslationGlossaryDecision({
      decisionKey,
      sourceTerm,
      targetTerm,
      normalizedSourceTerm: normalizeGlossaryTerm(sourceTerm),
      normalizedTargetTerm: normalizeGlossaryTerm(targetTerm),
      decisionStatus,
      occurrences,
      decisionNote: '',
    } satisfies NewTranslationGlossaryDecision, existing);
    setGlossaryDecisions(current => [
      ...current.filter(decision => decision.decisionKey !== saved.decisionKey),
      saved,
    ].sort((left, right) => (Date.parse(left.createdAt ?? '') || 0) - (Date.parse(right.createdAt ?? '') || 0)));
  }, [glossaryDecisions, reviewCandidates, reviewCatalog]);

  const handleOpenReviewExceptionPage = useCallback((exception: TranslationReviewException) => {
    const linkedCandidate = candidateForReviewException(reviewCandidates, exception);
    if (linkedCandidate) handleOpenReviewViewer(linkedCandidate, exception.diagnosticBlank);
    else if (moveToReviewPage(exception.pageNumber)) setSelectedReviewKey(null);
  }, [reviewCandidates, handleOpenReviewViewer, moveToReviewPage]);

  const syncExperimentUrl = useCallback((variant: Page14ExperimentVariant | null) => {
    window.history.replaceState(window.history.state, '', updatePage14ExperimentLocation(window.location.href, variant));
  }, []);

  const syncV2ExperimentUrl = useCallback((variant: Page14V2Variant | null) => {
    window.history.replaceState(window.history.state, '', updatePage14V2ExperimentLocation(window.location.href, variant));
  }, []);

  const syncV3ExperimentUrl = useCallback((variant: Page14V3Variant | null) => {
    window.history.replaceState(window.history.state, '', updatePage14V3ExperimentLocation(window.location.href, variant));
  }, []);

  const choosePage14ImportantCompositionVariant = useCallback((variant: Page14ImportantCompositionVariant) => {
    // This proof never takes ownership of an editor/layout draft. If the route
    // is embedded into an editing session later, switching is simply blocked.
    if (isRichEditorOpen || hasTranslationDraft || page14ImportantDraftOverrides.size > 0 || isLayoutDirty) return;
    setPage14ImportantCompositionVariant(variant);
    setEditorialExperimentVariant(null);
    setPage14V2Variant(null);
    setPage14V3Variant(null);
    setLanguage(variant === 'EN' ? 'en' : 'pt-BR');
    setCurrentPage(14);
    setPageInput('14');
    setIsSymbolPaletteOpen(false);
    window.history.replaceState(window.history.state, '', updatePage14ImportantCompositionLocation(window.location.href, variant));
  }, [hasTranslationDraft, page14ImportantDraftOverrides, isLayoutDirty, isRichEditorOpen]);

  const handlePage14ImportantExperimentalSave = useCallback((spanKey: string, override: SpanOverride | null) => {
    const initialOverride = buildInitialPage14ImportantUnitOverrides().get(spanKey);
    if (!initialOverride) return;
    setPage14ImportantUnitOverrides(current => {
      const next = new Map(current);
      // In this isolated editor, Reset restores this unit's proposal seed.
      // It never removes or writes a canonical translation override.
      next.set(spanKey, override ?? initialOverride);
      return next;
    });
    setPage14ImportantDraftOverrides(current => {
      const next = new Map(current);
      next.delete(spanKey);
      return next;
    });
    setPage14ImportantEditorSelection(null);
  }, []);

  const handlePage14ImportantExperimentalDraftChange = useCallback((spanKey: string, draft: SpanOverride | null) => {
    setPage14ImportantDraftOverrides(current => {
      const next = new Map(current);
      if (draft) next.set(spanKey, draft);
      else next.delete(spanKey);
      return next;
    });
  }, []);

  const handlePage14ImportantEditorSelection = useCallback((spanKey: string | null) => {
    setPage14ImportantEditorSelection(spanKey);
  }, []);

  const chooseEditorialExperimentVariant = useCallback((variant: Page14ExperimentVariant) => {
    if (!acceptLeavingLayout() || !acceptLeavingTranslationDraft()) return;
    setPage14V2Variant(null);
    setPage14V3Variant(null);
    setEditorialExperimentVariant(variant);
    setLanguage(variant === 'EN' ? 'en' : 'pt-BR');
    setIsSymbolPaletteOpen(false);
    setCurrentPage(PAGE14_EDITORIAL_EXPERIMENT.pageNumber);
    setPageInput(String(PAGE14_EDITORIAL_EXPERIMENT.pageNumber));
    syncExperimentUrl(variant);
  }, [acceptLeavingLayout, acceptLeavingTranslationDraft, syncExperimentUrl]);

  const choosePage14V2Variant = useCallback((variant: Page14V2Variant) => {
    if (!acceptLeavingLayout() || !acceptLeavingTranslationDraft()) return;
    setEditorialExperimentVariant(null);
    setPage14V3Variant(null);
    setPage14V2Variant(variant);
    setLanguage(variant === 'EN' ? 'en' : 'pt-BR');
    setIsSymbolPaletteOpen(false);
    setCurrentPage(PAGE14_V2_SNAPSHOT.pageNumber);
    setPageInput(String(PAGE14_V2_SNAPSHOT.pageNumber));
    setPage14V2VoteStatus(null);
    syncV2ExperimentUrl(variant);
  }, [acceptLeavingLayout, acceptLeavingTranslationDraft, syncV2ExperimentUrl]);

  const choosePage14V3Variant = useCallback((variant: Page14V3Variant) => {
    if (!acceptLeavingLayout() || !acceptLeavingTranslationDraft()) return;
    setPage14V3LiveMeasurements(current => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.endsWith(`:${variant}`)),
    ));
    setPage14V3ProposalMeasurements(current => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.endsWith(`:${variant}`)),
    ));
    setPage14V3MeasurementStatus(`Aguardando medição live da variante ${variant}…`);
    setEditorialExperimentVariant(null);
    setPage14V2Variant(null);
    setPage14V3Variant(variant);
    setLanguage(variant === 'EN' ? 'en' : 'pt-BR');
    setIsSymbolPaletteOpen(false);
    setCurrentPage(PAGE14_V3_INITIAL.pageNumber);
    setPageInput(String(PAGE14_V3_INITIAL.pageNumber));
    setIsExperimentRailCollapsed(false);
    syncV3ExperimentUrl(variant);
  }, [acceptLeavingLayout, acceptLeavingTranslationDraft, syncV3ExperimentUrl]);

  const handleToggleLanguage = useCallback((nextLanguage: 'en' | 'pt-BR') => {
    if (nextLanguage === rendererLanguage) return;
    if (isPage14V3ExperimentVisible && activeV3Variant !== null) {
      choosePage14V3Variant(nextLanguage === 'en' ? 'EN' : 'PT');
      return;
    }
    if (isPage14V2ExperimentVisible && activeV2Variant !== null) {
      choosePage14V2Variant(nextLanguage === 'en' ? 'EN' : 'PT');
      return;
    }
    if (isPage14ExperimentVisible && activeExperimentVariant !== null) {
      chooseEditorialExperimentVariant(nextLanguage === 'en' ? 'EN' : 'PT');
      return;
    }
    setLanguage(nextLanguage);
  }, [rendererLanguage, isPage14V3ExperimentVisible, activeV3Variant, choosePage14V3Variant, isPage14V2ExperimentVisible, activeV2Variant, choosePage14V2Variant, isPage14ExperimentVisible, activeExperimentVariant, chooseEditorialExperimentVariant]);

  const handlePage14V3UnitSelect = useCallback((spanKey: string | null) => {
    const unitKey = normalizePage14V3UnitKey(spanKey);
    if (!unitKey) return;
    setPage14V3SelectedUnitKey(unitKey);
  }, []);

  const handlePage14V2UnitSelect = useCallback((spanKey: string | null) => {
    if (!PAGE14_V2_SNAPSHOT.units.some(unit => unit.spanKey === spanKey)) return;
    setPage14V2SelectedUnitKey(spanKey);
    setPage14V2VoteStatus(null);
  }, []);

  const selectedPage14V2Unit = PAGE14_V2_SNAPSHOT.units.find(unit => unit.spanKey === page14V2SelectedUnitKey) ?? null;
  const selectedPage14V2Vote = page14V2Votes.find(vote => vote.unitKey === page14V2SelectedUnitKey) ?? null;
  const selectedPage14V3Unit = PAGE14_V2_SNAPSHOT.units.find(unit => unit.spanKey === page14V3SelectedUnitKey) ?? null;
  const selectedPage14V3Candidate = activeV3Variant === 'A' || activeV3Variant === 'B'
    ? getPage14V3CurrentCandidate(activeV3Variant, page14V3SelectedUnitKey ?? '')
    : null;
  const selectedPage14V3CandidateIsStaticallyBlocked = !!selectedPage14V3Candidate
    && (selectedPage14V3Candidate.status.startsWith('blocked') || selectedPage14V3Candidate.status.startsWith('source-en-preserved'));
  const selectedPage14V3RawProposalMeasurement = page14V3SelectedUnitKey && activeV3Variant
    ? page14V3ProposalMeasurements[`${page14V3SelectedUnitKey}:${activeV3Variant}`] ?? null
    : null;
  const selectedPage14V3LiveProposalMeasurement = selectedPage14V3RawProposalMeasurement
    && selectedPage14V3Candidate
    && isPage14V3MeasurementCurrentEnvironment(selectedPage14V3RawProposalMeasurement, zoomLevel)
    && normalizePage14V3MeasuredText(selectedPage14V3RawProposalMeasurement.renderedText) === normalizePage14V3MeasuredText(selectedPage14V3Candidate.proposedText)
    ? selectedPage14V3RawProposalMeasurement
    : null;
  const selectedPage14V3RuntimeBlocked = !!selectedPage14V3LiveProposalMeasurement
    && page14V3MeasurementIsBlocked(selectedPage14V3LiveProposalMeasurement, selectedPage14V3Unit?.spanKey ?? '');
  const selectedPage14V3ExpectedVisibleText = selectedPage14V3Unit && selectedPage14V3Candidate
    ? selectedPage14V3CandidateIsStaticallyBlocked || selectedPage14V3RuntimeBlocked
      ? ''
      : selectedPage14V3Candidate.proposedText
    : selectedPage14V3Unit?.sourceText ?? null;
  const selectedPage14V3RawMeasurement = page14V3SelectedUnitKey && activeV3Variant
    ? page14V3LiveMeasurements[`${page14V3SelectedUnitKey}:${activeV3Variant}`] ?? null
    : null;
  const selectedPage14V3Measurement = selectedPage14V3RawMeasurement && selectedPage14V3ExpectedVisibleText
    && selectedPage14V3ExpectedVisibleText !== ''
    && isPage14V3MeasurementCurrentEnvironment(selectedPage14V3RawMeasurement, zoomLevel)
    && normalizePage14V3MeasuredText(selectedPage14V3RawMeasurement.renderedText) === normalizePage14V3MeasuredText(selectedPage14V3ExpectedVisibleText)
    ? selectedPage14V3RawMeasurement
    : null;
  const selectedPage14V3ProposalMeasurement = selectedPage14V3LiveProposalMeasurement
    ?? selectedPage14V3Candidate?.derivedRevision?.measurement
    ?? selectedPage14V3Candidate?.proposalMeasurement
    ?? null;
  const selectedPage14V3EffectiveStatus = !selectedPage14V3Candidate
    ? null
    : resolveStructuralCopyfitStatus(selectedPage14V3Candidate.status, selectedPage14V3LiveProposalMeasurement,
      false, page14V3SourcePdfVisualLineCount(selectedPage14V3Unit?.spanKey),
      selectedPage14V3Candidate.underCompositionJustification);
  const page14V3VariantMeasurements = activeV3Variant
    ? PAGE14_V2_SNAPSHOT.units.map(unit => {
      const candidate = activeV3Variant === 'A' || activeV3Variant === 'B'
        ? getPage14V3CurrentCandidate(activeV3Variant, unit.spanKey)
        : null;
      const staticallyBlocked = !!candidate
        && (candidate.status.startsWith('blocked') || candidate.status.startsWith('source-en-preserved'));
      const rawProposal = page14V3ProposalMeasurements[`${unit.spanKey}:${activeV3Variant}`] ?? null;
      const liveProposal = rawProposal && candidate
        && isPage14V3MeasurementCurrentEnvironment(rawProposal, zoomLevel)
        && normalizePage14V3MeasuredText(rawProposal.renderedText) === normalizePage14V3MeasuredText(candidate.proposedText)
        ? rawProposal
        : null;
      const runtimeBlocked = !!liveProposal && page14V3MeasurementIsBlocked(liveProposal, unit.spanKey);
      const expectedVisibleText = activeV3Variant === 'EN'
        ? unit.sourceText
        : candidate
          ? staticallyBlocked || runtimeBlocked ? '' : candidate.proposedText
          : null;
      const rawCurrent = page14V3LiveMeasurements[`${unit.spanKey}:${activeV3Variant}`] ?? null;
      const current = rawCurrent && (expectedVisibleText === null
        || (isPage14V3MeasurementCurrentEnvironment(rawCurrent, zoomLevel)
          && normalizePage14V3MeasuredText(rawCurrent.renderedText) === normalizePage14V3MeasuredText(expectedVisibleText)))
        ? rawCurrent
        : null;
      const proposal = liveProposal
        ?? candidate?.derivedRevision?.measurement
        ?? candidate?.proposalMeasurement
        ?? null;
      const proposalStatus = !candidate
        ? null
        : resolveStructuralCopyfitStatus(candidate.status, liveProposal, runtimeBlocked,
          page14V3SourcePdfVisualLineCount(unit.spanKey), candidate.underCompositionJustification);
      const rawSource = page14V3LiveMeasurements[`${unit.spanKey}:EN`] ?? null;
      const source = rawSource && isPage14V3MeasurementCurrentEnvironment(rawSource, zoomLevel) ? rawSource : null;
      return { unit, source, current, proposal, proposalStatus, candidate, liveProposal };
    })
    : [];

  useEffect(() => {
    if (!isPage14V3ExperimentVisible || !activeV3Variant || !isAdmin) return;
    let cancelled = false;
    let frameId = 0;
    setPage14V3MeasurementStatus(`Medindo as 8 unidades no PageRenderer · ${activeV3Variant}…`);
    const measureAfterLayout = () => {
      frameId = window.requestAnimationFrame(() => {
        void document.fonts.ready.then(() => {
          if (cancelled) return;
          const proposalMeasurements: Page14V3LiveMeasurement[] = [];
          const newlyBlockedUnits: string[] = [];
          const measurements = PAGE14_V2_SNAPSHOT.units.flatMap(unit => {
            const candidate = activeV3Variant === 'A' || activeV3Variant === 'B'
              ? getPage14V3CurrentCandidate(activeV3Variant, unit.spanKey)
              : null;
            const proposalKey = `${activeV3Variant}:${unit.spanKey}`;
            const previousProposalMeasurement = page14V3ProposalMeasurements[proposalKey] ?? null;
            const previousProposalIsCurrent = !!candidate && !!previousProposalMeasurement
              && isPage14V3MeasurementCurrentEnvironment(previousProposalMeasurement, zoomLevel)
              && normalizePage14V3MeasuredText(previousProposalMeasurement.renderedText) === normalizePage14V3MeasuredText(candidate.proposedText);
            const runtimeBlocked = !!page14V3RuntimeBlockedUnits[proposalKey] && previousProposalIsCurrent
              && page14V3MeasurementIsBlocked(previousProposalMeasurement!, unit.spanKey);
            const staticallyBlocked = !!candidate
              && (candidate.status.startsWith('blocked') || candidate.status.startsWith('source-en-preserved'));
            const proposing = !!candidate && !runtimeBlocked && !staticallyBlocked;
            const languageForMeasurement = activeV3Variant === 'EN' || (candidate && !proposing) ? 'en' : 'pt-BR';
            const measurement = measurePage14V3Unit(unit.spanKey, activeV3Variant, languageForMeasurement, zoomLevel);
            if (measurement && proposing && candidate
              && normalizePage14V3MeasuredText(measurement.renderedText) === normalizePage14V3MeasuredText(candidate.proposedText)) {
              proposalMeasurements.push(measurement);
              if (page14V3MeasurementIsBlocked(measurement, unit.spanKey)) {
                newlyBlockedUnits.push(`${activeV3Variant}:${unit.spanKey}`);
              }
            }
            return measurement ? [measurement] : [];
          });
          if (measurements.length) {
            setPage14V3LiveMeasurements(current => ({
              ...current,
              ...Object.fromEntries(measurements.map(measurement => [
                `${measurement.unitKey}:${measurement.variant}`,
                measurement,
              ])),
            }));
            if (proposalMeasurements.length) {
              setPage14V3ProposalMeasurements(current => ({
                ...current,
                ...Object.fromEntries(proposalMeasurements.map(measurement => [
                  `${measurement.unitKey}:${measurement.variant}`,
                  measurement,
                ])),
              }));
            }
            if (newlyBlockedUnits.length) {
              setPage14V3RuntimeBlockedUnits(current => ({
                ...current,
                ...Object.fromEntries(newlyBlockedUnits.map(key => [key, true])),
              }));
            }
            const blockedCount = proposalMeasurements.filter(measurement => page14V3MeasurementIsBlocked(measurement, measurement.unitKey)).length;
            setPage14V3MeasurementStatus(`Medição live concluída · ${measurements.length}/8 unidades em ${activeV3Variant}${blockedCount ? ` · ${blockedCount} proposta(s) bloqueada(s) pelo gate Copyfit V3` : ''}.`);
          } else {
            setPage14V3MeasurementStatus(`DOM sem alvos mensuráveis para a variante ${activeV3Variant}; mantenha Admin ativo.`);
          }
        });
      });
    };
    measureAfterLayout();
    window.addEventListener('resize', measureAfterLayout);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', measureAfterLayout);
    };
  }, [
    isPage14V3ExperimentVisible,
    activeV3Variant,
    isAdmin,
    zoomLevel,
    rendererLanguage,
    page14V3RuntimeBlockedUnits,
  ]);

  useEffect(() => {
    setPage14V2Preference(selectedPage14V2Vote?.preference ?? '');
    setPage14V2Note(selectedPage14V2Vote?.note ?? '');
  }, [page14V2SelectedUnitKey, selectedPage14V2Vote?.preference, selectedPage14V2Vote?.note]);

  const savePage14V2CurrentVote = useCallback(() => {
    if (!page14V2SelectedUnitKey || !page14V2Preference) return;
    const vote: Page14V2Vote = {
      unitKey: page14V2SelectedUnitKey,
      preference: page14V2Preference,
      note: page14V2Note.trim(),
      savedAt: new Date().toISOString(),
    };
    try {
      const nextVotes = savePage14V2Vote(page14V2Votes, vote);
      setPage14V2Votes(nextVotes);
      setPage14V2StorageError(false);
      setPage14V2VoteStatus('Voto salvo neste navegador. Nenhuma tradução oficial foi alterada.');
    } catch {
      setPage14V2StorageError(true);
      setPage14V2VoteStatus('Falha ao gravar o voto local; nada foi confirmado como salvo.');
    }
  }, [page14V2SelectedUnitKey, page14V2Preference, page14V2Note, page14V2Votes]);

  const exportPage14V2Votes = useCallback(() => {
    const payload = {
      experimentId: PAGE14_V2_SNAPSHOT.experimentId,
      exportedAt: new Date().toISOString(),
      votes: page14V2Votes,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'middara-page14-ab-v2-blind-votes.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }, [page14V2Votes]);

  const revealPage14V2Conditions = useCallback(async () => {
    if (page14V2Votes.length === 0 || page14V2RevealData) return;
    try {
      const data = await loadPage14V2RevealData();
      setPage14V2RevealData(data);
      setPage14V2RevealError(null);
    } catch {
      setPage14V2RevealError('Não foi possível carregar os metadados de revelação. Os votos continuam preservados.');
    }
  }, [page14V2Votes.length, page14V2RevealData]);

  // Navigate to a specific page (used by hyperlinks on Contents page)
  const navigateToPage = useCallback((pageNum: number, draftAlreadyConfirmed = false): boolean => {
    if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > TOTAL_PAGES) return false;
    if (pageNum !== currentPage && (!acceptLeavingLayout()
      || (!draftAlreadyConfirmed && !acceptLeavingTranslationDraft()))) return false;
    if (pageNum !== PAGE14_EDITORIAL_EXPERIMENT.pageNumber && (editorialExperimentVariant !== null || page14V2Variant !== null)) {
      setLanguage((editorialExperimentVariant === 'EN' || page14V2Variant === 'EN') ? 'en' : 'pt-BR');
      setEditorialExperimentVariant(null);
      setPage14V2Variant(null);
      if (page14V2Variant !== null) syncV2ExperimentUrl(null);
      else syncExperimentUrl(null);
    }
    setCurrentPage(pageNum);
    // If in scroll mode, scroll to that page
    if (viewMode === 'scroll') {
      setTimeout(() => {
        const el = document.getElementById(`page-${pageNum}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
    return true;
  }, [viewMode, currentPage, editorialExperimentVariant, page14V2Variant, acceptLeavingLayout, acceptLeavingTranslationDraft, syncExperimentUrl, syncV2ExperimentUrl]);

  const requestEditablePageNavigation = useCallback((direction: 'previous' | 'next', fromPage: number) => {
    const targetPage = fromPage + (direction === 'next' ? 1 : -1);
    if (targetPage < 1 || targetPage > TOTAL_PAGES || !acceptLeavingLayout()) return;
    const id = ++editableNavigationRequestId.current;
    setPendingEditableNavigation({ id, direction, targetPage });
    if (viewMode === 'single') {
      setCurrentPage(targetPage);
      setPageInput(targetPage.toString());
    } else {
      document.getElementById(`page-${targetPage}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [acceptLeavingLayout, viewMode]);

  const resolveEditablePageNavigation = useCallback((requestId: number, found: boolean) => {
    if (!pendingEditableNavigation || pendingEditableNavigation.id !== requestId) return;
    if (found) {
      setPendingEditableNavigation(null);
      return;
    }
    const nextPage = pendingEditableNavigation.targetPage
      + (pendingEditableNavigation.direction === 'next' ? 1 : -1);
    if (nextPage < 1 || nextPage > TOTAL_PAGES) {
      setPendingEditableNavigation(null);
      return;
    }
    setPendingEditableNavigation({ ...pendingEditableNavigation, targetPage: nextPage });
    if (viewMode === 'single') {
      setCurrentPage(nextPage);
      setPageInput(nextPage.toString());
    } else {
      requestAnimationFrame(() => document.getElementById(`page-${nextPage}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [pendingEditableNavigation, viewMode]);

  // Single page loader
  useEffect(() => {
    if (viewMode !== 'single') return;
    setPageInput(currentPage.toString());
    
    setIsLoading(true);
    loadPageData(currentPage).then(data => {
      setPageData(data);
      setIsLoading(false);
    });
  }, [currentPage, viewMode]);

  // Scroll mode: load all pages
  useEffect(() => {
    if (viewMode !== 'scroll') return;
    setIsLoading(true);

    const loadAll = async () => {
      const pages = new Map<number, PageData>();
      for (let i = 1; i <= TOTAL_PAGES; i++) {
        pages.set(i, await loadPageData(i));
      }
      setScrollPages(pages);
      setIsLoading(false);
    };
    loadAll();
  }, [viewMode]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
      if (viewMode !== 'single') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        navigateToPage(Math.min(TOTAL_PAGES, currentPage + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        navigateToPage(Math.max(1, currentPage - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, navigateToPage, currentPage]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(pageInput);
    if (!isNaN(num) && num >= 1 && num <= TOTAL_PAGES) {
      navigateToPage(num);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const page14ExperimentSwitcher = isPage14ExperimentVisible && !isPage14ImportantCompositionVisible ? (
    isPage14V3ExperimentVisible ? (
      <section className="editorial-experiment-switcher editorial-experiment-v3" aria-label="Ciclo experimental de copy fitting da página 14" data-testid="page14-editorial-ab-v3">
        <div className="editorial-experiment-heading">
          <strong>Copy fitting iterativo · p.14</strong>
          <span>Medição interna · sem aprovação</span>
        </div>
        <fieldset className="editorial-experiment-options">
          <legend>Estado do Viewer</legend>
          {([['EN', 'EN original'], ['PT', 'PT atual'], ['A', 'Condição A'], ['B', 'Condição B']] as const).map(([variant, label]) => (
            <label key={variant}>
              <input type="radio" name="page14-editorial-v3-variant" value={variant} checked={activeV3Variant === variant} onChange={() => choosePage14V3Variant(variant)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <small>Cada condição recebeu apenas suas próprias medições do PageRenderer. A geometria é idêntica à V2; as propostas continuam experimentais.</small>
        <details className="page14-v3-batch-measurements">
          <summary>{activeV3Variant === 'A' || activeV3Variant === 'B' ? 'Versões medidas' : 'Medições live'} · {page14V3VariantMeasurements.filter(item => activeV3Variant === 'A' || activeV3Variant === 'B' ? item.proposal : item.current).length}/8 nesta variante</summary>
          <div>
            {page14V3VariantMeasurements.map(({ unit, source, current, proposal, proposalStatus, candidate }) => {
              const measurement = current ?? proposal;
              const blockedOrSourcePreserved = !!proposalStatus
                && (proposalStatus.startsWith('blocked') || proposalStatus.startsWith('source-en-preserved'));
              const sourcePdfVisualLines = page14V3SourcePdfVisualLineCount(unit.spanKey);
              const targetVisualLines = proposal?.lineCount ?? current?.lineCount ?? null;
              const lineCountClass = classifyCopyfitVisualLines(sourcePdfVisualLines, targetVisualLines);
              const renderedMeasurementLabel = activeV3Variant === 'EN'
                ? 'EN original'
                : activeV3Variant === 'PT'
                  ? 'PT atual'
                  : blockedOrSourcePreserved
                    ? 'unidade em branco no diagnóstico'
                    : current ? `${activeV3Variant} proposta · PageRenderer live` : `${activeV3Variant} medição pendente`;
              return (
              <p key={unit.spanKey}>
                <button type="button" className="page14-v3-select-unit" onClick={() => setPage14V3SelectedUnitKey(unit.spanKey)} aria-label={`Inspecionar ${unit.spanKey}`}>
                  {unit.spanKey.replace('page_14_block_', 'p14·')}
                </button>{' — '}
                {source ? `PageRenderer EN ${source.lineCount}` : 'PageRenderer EN —'} · PDF original {sourcePdfVisualLines ?? '—'}{' / '}
                {measurement ? `${renderedMeasurementLabel} ${measurement.lineCount} linhas (${lineCountClass}); ${measurement.inkHeightPx}/${measurement.frameHeightPx}px h; ${measurement.maxLineWidthPx}/${measurement.frameWidthPx}px l; bordas sup/L/R/base ${measurement.topEdgeOverflowPx ?? 0}/${measurement.leftEdgeOverflowPx}/${measurement.rightEdgeOverflowPx}/${measurement.bottomOverflowPx}px; ${typeof measurement.markerXPt === 'number' && measurement.bodyLineStartXsPt ? `marcador x${measurement.markerXPt}pt → linhas ${measurement.bodyLineStartXsPt.join('/')}pt; útil ${measurement.usefulListWidthPt}pt; dispersão ${measurement.hangingIndentSpreadPt}pt; recuo ${measurement.listStructureValid ? 'coerente' : 'INVÁLIDO'}; ` : ''}${typeof measurement.markerHeadingGapPx === 'number' ? `${measurement.markerHeadingGapPx}px entre marcador/título; ` : ''}${measurement.spaceToNextPx ?? '—'}px próximo; ${measurement.overflow ? 'overflow' : 'sem overflow'}; ${measurement.collision ? 'colisão' : 'sem colisão'}; estrutura ${measurement.structuralStatus}${measurement.structuralReasons?.length ? ` (${measurement.structuralReasons.join('; ')})` : ''}${proposal && current && proposal !== current ? `; proposta ${proposal.lineCount} linhas · ${proposal.overflow ? 'overflow' : 'sem overflow'}` : ''}${proposalStatus ? `; status ${proposalStatus}` : ''}${candidate?.derivedRevision ? `; revisão derivada ${candidate.derivedRevision.id}` : ''}` : 'a medir'}
              </p>
              );
            })}
          </div>
        </details>
        {selectedPage14V3Unit ? (
          <details className="page14-v2-vote-panel" open>
            <summary>Unidade em medição · {selectedPage14V3Unit.spanKey}</summary>
            <p className="page14-v2-source-label">Original EN</p>
            <blockquote>{selectedPage14V3Unit.sourceText}</blockquote>
            {selectedPage14V3Candidate ? (
              <>
                <p className="page14-v2-source-label">{selectedPage14V3EffectiveStatus?.startsWith('source-en-preserved') ? 'Texto EN preservado · não é tradução PT-BR' : 'Proposta completa'} · {selectedPage14V3Candidate.derivedRevision ? 'revisão experimental derivada final · base V3 2/2' : `revisão ${selectedPage14V3Candidate.revisionCount}/${PAGE14_V3_COPYFIT.revisionBudgetPerUnit}`} · {selectedPage14V3EffectiveStatus} · não aprovada</p>
                {selectedPage14V3EffectiveStatus?.startsWith('blocked') && <p className="page14-v2-current-status">Bloqueada no Copyfit V3. A unidade fica em branco na prévia PT-BR de diagnóstico; a proposta completa abaixo permanece disponível para revisão.</p>}
                {selectedPage14V3EffectiveStatus === 'pending-under-composition-justification' && <p className="page14-v3-block-reason" role="status">UNDER: o PT-BR usa menos linhas que o PDF original. A proposta continua visível e não é reprovada automaticamente; registre por que significado, formatação e composição visual foram preservados antes de considerá-la pronta para revisão editorial.</p>}
                {selectedPage14V3EffectiveStatus === 'blocked-line-count-over' && selectedPage14V3ProposalMeasurement && <p className="page14-v3-block-reason" role="status">OVER: o PageRenderer gerou {selectedPage14V3ProposalMeasurement.lineCount} linhas para {page14V3SourcePdfVisualLineCount(selectedPage14V3Unit.spanKey) ?? 'uma contagem-fonte ausente'} do PDF original. A unidade não passa mesmo sem overflow ou colisão.</p>}
                {selectedPage14V3EffectiveStatus === 'blocked-source-line-count' && <p className="page14-v3-block-reason" role="status">A contagem de linhas visuais da unidade no PDF original está ausente; a proposta não pode ser aprovada pelo Copyfit V3.</p>}
                {selectedPage14V3EffectiveStatus === 'blocked-live-overflow' && <p className="page14-v3-block-reason" role="status">A medição live detectou overflow ou colisão; a unidade fica em branco no diagnóstico PT-BR.</p>}
                {(selectedPage14V3EffectiveStatus === 'blocked-structural-error' || selectedPage14V3EffectiveStatus === 'blocked-structural-review') && <p className="page14-v3-block-reason" role="status">A proposta não passou pelo gate estrutural do PageRenderer; a unidade fica em branco no diagnóstico PT-BR. {selectedPage14V3LiveProposalMeasurement?.structuralReasons.join('; ')}</p>}
                {selectedPage14V3Candidate.blockReason && <p className="page14-v3-block-reason" role="status">{selectedPage14V3Candidate.blockReason}</p>}
                {selectedPage14V3Candidate.sourcePreservedReason && <p className="page14-v3-source-note" role="status">{selectedPage14V3Candidate.sourcePreservedReason}</p>}
                {selectedPage14V3Candidate.editorialNotes?.length ? <ul className="page14-v3-editorial-notes">{selectedPage14V3Candidate.editorialNotes.map(note => <li key={note}>{note}</li>)}</ul> : null}
                <blockquote className="page14-v3-candidate-text">{selectedPage14V3Candidate.proposedText}</blockquote>
                {(selectedPage14V3EffectiveStatus?.startsWith('blocked') || selectedPage14V3EffectiveStatus === 'pending-under-composition-justification') && selectedPage14V3ProposalMeasurement && (
                  <div className="page14-v3-proposal-measurement" data-testid="page14-v3-proposal-measurement">
                    <p className="page14-v2-source-label">{selectedPage14V3LiveProposalMeasurement ? 'Medição live da proposta no PageRenderer' : selectedPage14V3Candidate.derivedRevision?.measurement ? 'Medição salva da revisão derivada' : 'Medição histórica da proposta'} · revisão derivada {selectedPage14V3Candidate.derivedRevision?.id ?? selectedPage14V3Candidate.revisionCount}</p>
                    <p>{selectedPage14V3ProposalMeasurement.viewport} · DPR {selectedPage14V3ProposalMeasurement.devicePixelRatio} · zoom {Math.round(selectedPage14V3ProposalMeasurement.zoomLevel * 100)}%</p>
                    <p>PDF EN {page14V3SourcePdfVisualLineCount(selectedPage14V3Unit.spanKey) ?? '—'} linhas · PageRenderer PT-BR {selectedPage14V3ProposalMeasurement.lineCount} ({classifyCopyfitVisualLines(page14V3SourcePdfVisualLineCount(selectedPage14V3Unit.spanKey), selectedPage14V3ProposalMeasurement.lineCount)}) · tinta/frame {selectedPage14V3ProposalMeasurement.inkHeightPx}/{selectedPage14V3ProposalMeasurement.frameHeightPx}px · linha/frame {selectedPage14V3ProposalMeasurement.maxLineWidthPx}/{selectedPage14V3ProposalMeasurement.frameWidthPx}px</p>
                    <p>Excesso sup./esq./dir./base: {selectedPage14V3ProposalMeasurement.topEdgeOverflowPx ?? 0}/{selectedPage14V3ProposalMeasurement.leftEdgeOverflowPx}/{selectedPage14V3ProposalMeasurement.rightEdgeOverflowPx}/{selectedPage14V3ProposalMeasurement.bottomOverflowPx}px · próximo: {selectedPage14V3ProposalMeasurement.spaceToNextPx ?? '—'}px · {selectedPage14V3ProposalMeasurement.overflow ? 'overflow' : 'sem overflow'} · {selectedPage14V3ProposalMeasurement.collision ? 'colisão' : 'sem colisão'} · estrutura: {selectedPage14V3ProposalMeasurement.structuralStatus ?? 'medição histórica sem gate'}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="page14-v2-current-status">Variante de referência; nenhum rascunho experimental está ativo.</p>
            )}
            {selectedPage14V3Measurement ? (() => {
              const sourceMeasurement = page14V3LiveMeasurements[`${selectedPage14V3Unit.spanKey}:EN`];
              const lineDelta = sourceMeasurement
                ? selectedPage14V3Measurement.lineCount - sourceMeasurement.lineCount
                : null;
              const space = selectedPage14V3Measurement.spaceToNextPx;
              return (
                <div className="page14-v3-measurement" data-testid="page14-v3-live-measurement">
                  <p className="page14-v2-source-label">PageRenderer real · Chrome · {selectedPage14V3EffectiveStatus?.startsWith('blocked') || selectedPage14V3EffectiveStatus?.startsWith('source-en-preserved') ? 'unidade em branco no diagnóstico' : 'render atual'}</p>
                  <p className="page14-v2-current-status">
                    {selectedPage14V3Measurement.viewport}px · DPR {selectedPage14V3Measurement.devicePixelRatio} · zoom {Math.round(selectedPage14V3Measurement.zoomLevel * 100)}%
                  </p>
                  <dl>
                    <div><dt>Linhas visuais</dt><dd>PDF EN {page14V3SourcePdfVisualLineCount(selectedPage14V3Unit.spanKey) ?? '—'} · PageRenderer {selectedPage14V3Measurement.variant} {selectedPage14V3Measurement.lineCount} ({classifyCopyfitVisualLines(page14V3SourcePdfVisualLineCount(selectedPage14V3Unit.spanKey), selectedPage14V3Measurement.lineCount)}){lineDelta === null ? '' : ` · Δ vs PageRenderer EN ${lineDelta > 0 ? '+' : ''}${lineDelta}`}</dd></div>
                    <div><dt>Altura ink/frame</dt><dd>{selectedPage14V3Measurement.inkHeightPx}/{selectedPage14V3Measurement.frameHeightPx} px</dd></div>
                    <div><dt>Largura máx./frame</dt><dd>{selectedPage14V3Measurement.maxLineWidthPx}/{selectedPage14V3Measurement.frameWidthPx} px</dd></div>
                    <div><dt>Excesso nas bordas</dt><dd>sup. {selectedPage14V3Measurement.topEdgeOverflowPx ?? 0} · esq. {selectedPage14V3Measurement.leftEdgeOverflowPx} · dir. {selectedPage14V3Measurement.rightEdgeOverflowPx} · base {selectedPage14V3Measurement.bottomOverflowPx} px</dd></div>
                    {typeof selectedPage14V3Measurement.markerHeadingGapPx === 'number' && <div><dt>Marcador/título</dt><dd>EN {sourceMeasurement?.markerHeadingGapPx ?? '—'} · {selectedPage14V3Measurement.variant} {selectedPage14V3Measurement.markerHeadingGapPx} px</dd></div>}
                    {selectedPage14V3Measurement.markerXPt !== null && <div><dt>Recuo francês / largura útil</dt><dd>Marcador x {selectedPage14V3Measurement.markerXPt} pt · corpo x {selectedPage14V3Measurement.bodyLineStartXsPt.join(' / ')} pt · {selectedPage14V3Measurement.usefulListWidthPt} pt úteis · dispersão {selectedPage14V3Measurement.hangingIndentSpreadPt} pt · {selectedPage14V3Measurement.listStructureValid ? 'linhas alinhadas' : 'estrutura inválida'}</dd></div>}
                    <div><dt>Espaço até seguinte</dt><dd>{space === null ? 'sem unidade seguinte' : `${space} px · ${selectedPage14V3Measurement.nextUnitKey ?? 'unidade'}`}</dd></div>
                    <div><dt>Segurança visual</dt><dd>{selectedPage14V3Measurement.overflow ? 'OVERFLOW' : 'sem overflow'} · {selectedPage14V3Measurement.collision ? 'COLISÃO' : 'sem colisão detectada'}</dd></div>
                  </dl>
                  {!sourceMeasurement && <p className="page14-v2-current-status">A contagem-fonte vem dos baselines visuais do PDF original; EN no PageRenderer é exibido como métrica complementar.</p>}
                </div>
              );
            })() : (
              <p className="page14-v2-current-status">{page14V3MeasurementStatus || 'Aguardando medição live no PageRenderer com Admin ativo.'}</p>
            )}
          </details>
        ) : (
          <p className="page14-v2-empty-selection">Ative Admin e selecione uma das oito unidades no Viewer para inspecionar o rascunho e suas medições.</p>
        )}
        <button type="button" className="page14-v2-open" onClick={() => choosePage14V2Variant('X')}>Consultar evidência histórica V2</button>
      </section>
    ) : isPage14V2ExperimentVisible ? (
      <section className="editorial-experiment-switcher editorial-experiment-v2" aria-label="Comparação cega de traduções experimentais da página 14" data-testid="page14-editorial-ab-v2">
        <div className="editorial-experiment-heading">
          <strong>Experimento editorial cego · p.14</strong>
          <span>Variantes experimentais · não aprovadas</span>
        </div>
        <fieldset className="editorial-experiment-options">
          <legend>Conteúdo exibido</legend>
          {([['EN', 'EN original'], ['PT', 'PT-BR atual'], ['X', 'X'], ['Y', 'Y']] as const).map(([variant, label]) => (
            <label key={variant}>
              <input type="radio" name="page14-editorial-v2-variant" value={variant} checked={activeV2Variant === variant} onChange={() => choosePage14V2Variant(variant)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <small>Selecione um trecho no Viewer com Admin e alterne X/Y para comparar no mesmo frame. PT-BR atual é fallback EN nesta página.</small>
        {selectedPage14V2Unit ? (
          <details className="page14-v2-vote-panel">
            <summary>Unidade selecionada · {selectedPage14V2Unit.spanKey}{selectedPage14V2Vote ? ' · voto salvo' : ''}</summary>
            <p className="page14-v2-source-label">Original EN</p>
            <blockquote>{selectedPage14V2Unit.sourceText}</blockquote>
            <p className="page14-v2-source-label">PT-BR atual</p>
            <p className="page14-v2-current-status">{selectedPage14V2Unit.ptCurrentStatus}</p>
            <fieldset className="page14-v2-vote-options">
              <legend>Sua avaliação desta unidade</legend>
              {([
                ['X', 'Prefiro X'],
                ['Y', 'Prefiro Y'],
                ['tie', 'Empate: ambas adequadas'],
                ['neither', 'Nenhuma das duas é adequada'],
              ] as const).map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name="page14-v2-vote" value={value} checked={page14V2Preference === value} onChange={() => setPage14V2Preference(value)} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label className="page14-v2-note-label">
              Observação editorial (opcional)
              <textarea value={page14V2Note} onChange={event => setPage14V2Note(event.target.value)} rows={2} />
            </label>
            <div className="page14-v2-vote-actions">
              <button type="button" disabled={!page14V2Preference} onClick={savePage14V2CurrentVote}>Salvar voto desta unidade</button>
              {selectedPage14V2Vote && <span>Voto local já registrado</span>}
            </div>
            {page14V2VoteStatus && <p className={`page14-v2-status${page14V2StorageError ? ' is-error' : ''}`} role="status">{page14V2VoteStatus}</p>}
          </details>
        ) : (
          <p className="page14-v2-empty-selection">Ative Admin e clique em uma das oito unidades participantes para selecionar e avaliar individualmente.</p>
        )}
        <div className="page14-v2-actions">
          <span>{page14V2Votes.length} de {PAGE14_V2_SNAPSHOT.units.length} unidades com voto salvo localmente</span>
          <button type="button" onClick={exportPage14V2Votes} disabled={page14V2Votes.length === 0}>Exportar votos</button>
          <button type="button" onClick={revealPage14V2Conditions} disabled={page14V2Votes.length === 0 || !!page14V2RevealData}>Revelar condições A/B</button>
        </div>
        {page14V2RevealError && <p className="page14-v2-status is-error" role="alert">{page14V2RevealError}</p>}
        <button type="button" className="page14-v2-open" onClick={() => choosePage14V3Variant('A')}>Abrir ciclo de copy fitting V3</button>
        {page14V2RevealData && (
          <div className="page14-v2-reveal" data-testid="page14-v2-reveal">
            <strong>Revelação solicitada pelo usuário</strong>
            <p>X corresponde à condição {page14V2RevealData.mapping.X}; Y corresponde à condição {page14V2RevealData.mapping.Y}.</p>
            <p>Resultados técnicos (após congelamento; não usados para editar as propostas):</p>
            {(['X', 'Y'] as const).map(variant => (
              <div key={variant}><b>{variant}</b> — {page14V2RevealData.evaluation.variants[variant].summary}</div>
            ))}
            <details>
              <summary>Notas técnicas por unidade</summary>
              {(['X', 'Y'] as const).map(variant => (
                <div key={variant}><b>{variant}</b><ul>{Object.entries(page14V2RevealData.evaluation.variants[variant].units).map(([key, note]) => <li key={key}><code>{key}</code>: {note}</li>)}</ul></div>
              ))}
            </details>
          </div>
        )}
      </section>
    ) : (
      <section className="editorial-experiment-switcher" aria-label="Experimento editorial da página 14" data-testid="page14-editorial-experiment">
        <div className="editorial-experiment-heading">
          <strong>Experimento editorial · p.14</strong>
          <span>{readOnlyExperiment ? 'Prévia isolada · sem gravação' : 'Comparação no PageRenderer'}</span>
        </div>
        <fieldset className="editorial-experiment-options">
          <legend>Variante</legend>
          {([
            ['EN', 'EN'],
            ['PT', 'PT atual'],
            ['A', 'A · base'],
            ['B', 'B · skills'],
          ] as const).map(([variant, label]) => (
            <label key={variant}>
              <input
                type="radio"
                name="page14-editorial-variant"
                value={variant}
                checked={(activeExperimentVariant ?? (language === 'en' ? 'EN' : 'PT')) === variant}
                onChange={() => chooseEditorialExperimentVariant(variant)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <small>A/B V1: teste exploratório no mesmo contexto; preservado como referência histórica.</small>
        <button type="button" className="page14-v2-open" onClick={() => choosePage14V2Variant('X')}>Abrir comparação cega V2</button>
      <button type="button" className="page14-v2-open" onClick={() => choosePage14V3Variant('A')}>Abrir ciclo de copy fitting V3</button>
      </section>
    )
  ) : null;
  const currentPage14ImportantMeasurement = activeImportantCompositionVariant === 'candidate'
    && page14ImportantMeasurement?.variant === activeImportantCompositionVariant
    ? page14ImportantMeasurement
    : null;
  const page14ImportantCompositionPanel = isPage14ImportantCompositionVisible && activeImportantCompositionVariant ? (
    <section className="editorial-experiment-switcher editorial-experiment-important" aria-label="Prova isolada do callout IMPORTANT da página 14" data-testid="page14-important-composition-proof" data-experiment-id={PAGE14_IMPORTANT_COMPOSITION_EXPERIMENT_ID}>
      <div className="editorial-experiment-heading">
        <strong>Callout IMPORTANT · p.14</strong>
        <span>Prova temporária · sem gravação</span>
      </div>
      <fieldset className="editorial-experiment-options">
        <legend>Composição visível</legend>
        {([
          ['EN', 'EN original'],
          ['PT', 'PT-BR atual · fallback EN'],
          ['candidate', 'Proposta PT-BR'],
        ] as const).map(([variant, label]) => (
          <label key={variant}>
            <input type="radio" name="page14-important-composition-variant" value={variant}
              checked={activeImportantCompositionVariant === variant}
              onChange={() => choosePage14ImportantCompositionVariant(variant)} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <p className="page14-important-proof-note">
        Cada unidade mantém seu ID e override experimental separado em memória; o PageRenderer recebe uma composição temporária do bloco para reflow conjunto. Aplicar uma alteração atualiza somente essa unidade na sessão, nunca Payload, localStorage, sidecar ou geometria.
      </p>
      <p className="page14-important-proof-copy" lang={activeImportantCompositionVariant === 'EN' ? 'en' : 'pt-BR'}>
        {activeImportantCompositionVariant === 'candidate'
          ? page14ImportantProof.targetText.replace('\uFFFC', '[[lightning]]')
          : activeImportantCompositionVariant === 'PT'
            ? 'PT-BR atual: o callout recorre ao EN canônico nesta página.'
            : 'IMPORTANT: Adventurers do not Gain SP during the Refresh Phase of their 1st turn of an Encounter. See Phases of an Adventurer’s Turn Pg. 37.'}
      </p>
      <details>
        <summary>Proveniência das 3 unidades e intervalos de estilo</summary>
        <ul className="page14-important-proof-owners">
          {page14ImportantProof.ownerRanges.map((owner, index) => (
            <li key={`${owner.sourceUnitId}-${owner.start}-${index}`}>
              <code>{owner.sourceUnitId}</code> · [{owner.start}, {owner.end}) · {owner.symbolId ? `símbolo ${owner.symbolId}` : `“${owner.text}”`}
            </li>
          ))}
        </ul>
        <ul className="page14-important-proof-styles">
          {page14ImportantProof.styleIntervals.map(interval => (
            <li key={interval.id}><code>[{interval.start}, {interval.end})</code> “{interval.targetText}” ← {interval.sourceSpanRefs.join(' + ')}</li>
          ))}
        </ul>
      </details>
      <p className="page14-important-proof-note">“Refresh Phase” → “Fase de Manutenção” está aprovado somente para o nome da fase. Os estilos são mapeados por âncoras textuais explícitas; a frase completa continua proposta para revisão humana.</p>
      {activeImportantCompositionVariant === 'candidate' && (
        <fieldset className="page14-important-unit-editor" aria-label="Edição experimental por unidade">
          <legend>Editar unidade original</legend>
          {PAGE14_IMPORTANT_SOURCE_UNITS.map((sourceUnitId, index) => {
            const key = `page_14_unit_${sourceUnitId}__pt-BR`;
            const labels = ['Rótulo e corpo 10 pt', 'SP 9 pt', 'Fase de Manutenção e referência 10 pt'];
            return (
              <button key={key} type="button" aria-pressed={page14ImportantEditorSelection === key}
                disabled={!isAdmin} onClick={() => setPage14ImportantEditorSelection(key)}>
                {index + 1}. {labels[index]} <code>{sourceUnitId}</code>
              </button>
            );
          })}
          {!isAdmin && <small>Ative o modo Admin para editar. Alterações aplicadas ficam somente nesta sessão.</small>}
          {page14ImportantSessionModified && <small role="status">Há alterações experimentais nesta sessão; recarregar a página descartará as alterações aplicadas.</small>}
        </fieldset>
      )}
      {activeImportantCompositionVariant === 'candidate' && (
        <div className="page14-important-proof-measurement" data-testid="page14-important-measurement" role="status">
          <strong>PageRenderer ao vivo · Chrome</strong>
          {currentPage14ImportantMeasurement ? (
            <>
              <p>{currentPage14ImportantMeasurement.viewport} · DPR {currentPage14ImportantMeasurement.devicePixelRatio} · zoom {Math.round(currentPage14ImportantMeasurement.zoomLevel * 100)}%</p>
              <dl>
                <div><dt>Linhas no conjunto</dt><dd>{currentPage14ImportantMeasurement.lineCount}</dd></div>
                <div><dt>Geometria texto/path / frame</dt><dd>{currentPage14ImportantMeasurement.contentGeometryHeightPt} / {currentPage14ImportantMeasurement.frameHeightPt} pt</dd></div>
                <div><dt>Largura máxima / útil</dt><dd>{currentPage14ImportantMeasurement.maxLineWidthPt} / {currentPage14ImportantMeasurement.frameWidthPt} pt</dd></div>
                <div><dt>Excesso horizontal esq. / dir.</dt><dd>{currentPage14ImportantMeasurement.leftOverflowPt} / {currentPage14ImportantMeasurement.rightOverflowPt} pt</dd></div>
                <div><dt>Largura / excesso por linha</dt><dd>{currentPage14ImportantMeasurement.lineWidthsPt.join(' / ')} · {currentPage14ImportantMeasurement.lineRightOverflowPt.join(' / ')} pt</dd></div>
                <div><dt>Excesso vertical sup. / inf.</dt><dd>{currentPage14ImportantMeasurement.topOverflowPt} / {currentPage14ImportantMeasurement.bottomOverflowPt} pt</dd></div>
                <div><dt>Espaço até o exemplo seguinte</dt><dd>{currentPage14ImportantMeasurement.nextUnitGapPt ?? '—'} pt</dd></div>
                <div><dt>Margem até o limite da arte (inclui exemplo)</dt><dd>{currentPage14ImportantMeasurement.bottomPaddingPt} pt</dd></div>
                <div><dt>Lightning · viewport / paths</dt><dd>{currentPage14ImportantMeasurement.lightningCount} · {currentPage14ImportantMeasurement.lightningViewportOverflowPt ?? 'indisponível'} / {currentPage14ImportantMeasurement.lightningPathGeometryOverflowPt ?? 'indisponível'} pt · {currentPage14ImportantMeasurement.lightningPathCount} path(s)</dd></div>
              </dl>
              <p>{describePage14ImportantFit(currentPage14ImportantMeasurement)} A composição usa fragmentos de texto e bbox geométrico dos paths; o viewport SVG é listado separadamente. Isso não mede a tinta real dos glifos nem expande o bbox para o stroke do SVG.</p>
            </>
          ) : <p>Aguardando fontes e métricas do PageRenderer…</p>}
        </div>
      )}
      <p className="page14-important-proof-note">Proposta: {PAGE14_IMPORTANT_SOURCE_UNITS.length} IDs preservados · 1 lightning semântico · contrato da unidade SP 9 pt mantido.</p>
    </section>
  ) : null;
  const experimentUsesReservedRail = isPage14V2ExperimentVisible || isPage14V3ExperimentVisible || isPage14ImportantCompositionVisible;

  return (
    <div
      ref={setOverlayHost}
      className={`app-container ${isAdmin ? 'admin-mode' : ''} ${isFaqOpen ? 'faq-open' : ''} ${isRichEditorOpen ? 'rich-editor-open' : ''} ${isTranslationReviewOpen ? 'translation-review-open' : ''} ${isProposalReviewEditorMode ? 'translation-review-editor-open' : ''} theme-dark`}
      style={{ '--rich-editor-panel-width': `${richEditorPanelWidth}px` } as CSSProperties}
    >
      <ArcaneGlassDefinitions />
      <AtmosphericParticles />
      <ShellNavigation
        active={isFaqOpen ? faqActiveType : currentPage === 3 ? 'contents' : 'rulebook'}
        workspaceEditing={isRichEditorOpen}
        openRequest={navigationOpenRequest}
        onExpandedChange={setIsNavigationExpanded}
        language={language}
        translationReviewOpen={isTranslationReviewOpen}
        onExportPdf={() => setIsPdfExportOpen(true)}
        onToggleTranslationReview={() => isTranslationReviewOpen ? closeTranslationReview() : setIsTranslationReviewOpen(true)}
        onSelect={(destination: ShellDestination) => {
          if (destination === 'faq' || destination === 'errata') {
            setFaqActiveType(destination);
            setIsFaqOpen(true);
            return;
          }
          const didNavigate = navigateToPage(destination === 'contents' ? 3 : 1);
          if (didNavigate) setIsFaqOpen(false);
        }}
      />
      {isAdmin && isRichEditorOpen && paletteEditorState && (
        <aside className="editing-symbol-rail" aria-label={language === 'pt-BR' ? 'Ferramentas de símbolos' : 'Symbol tools'}>
          <button
            type="button"
            className={`tool-btn admin-symbol-palette-toggle ${isSymbolPaletteOpen ? 'active' : ''}`}
            aria-label={language === 'pt-BR' ? 'Abrir paleta de símbolos' : 'Open symbol palette'}
            aria-expanded={isSymbolPaletteOpen}
            aria-controls="admin-symbol-palette"
            title={language === 'pt-BR' ? 'Símbolos do livro' : 'Rulebook symbols'}
            onClick={() => setIsSymbolPaletteOpen(open => !open)}
          >
            <Diamond size={16} aria-hidden="true" />
          </button>
        </aside>
      )}
      {/* Main Viewer Area */}
      <main className={`viewer-main ${viewMode}`} ref={mainRef}>
        {!isRichEditorOpen && !experimentUsesReservedRail && page14ExperimentSwitcher}
        {viewMode === 'single' ? (
          /* ── Single Page Mode ── */
          <div className="page-wrapper">
            {isLoading ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>Rendering Page...</p>
              </div>
            ) : pageData ? (
              <PageRenderer 
                key={`single-${currentPage}-${readOnlyExperiment ? 'preview-only' : 'editable'}-${reviewEditorItemKey ?? 'view'}`}
                onToggleLanguage={handleToggleLanguage}
                overlayHost={overlayHost}
                pageData={pageData} 
                isAdmin={isAdmin}
                showRuler={isAdmin && isRulerVisible}
                layoutMode={isAdmin && isLayoutMode && !readOnlyExperiment}
                onLayoutDirtyChange={setIsLayoutDirty}
                zoomLevel={zoomLevel}
                focalZoomEnabled
                focalZoomAnchor={focalZoomAnchor}
                onFocalZoomApplied={handleFocalZoomApplied}
                onNavigate={navigateToPage}
                language={rendererLanguage}
                symbolAliasPreferences={symbolAliasPreferences}
                onPaletteEditorChange={handlePaletteEditorChange}
                onTranslationDraftDirtyChange={setHasTranslationDraft}
                pendingEditableNavigation={pendingEditableNavigation}
                onRequestEditablePageNavigation={requestEditablePageNavigation}
                onResolveEditableNavigation={resolveEditablePageNavigation}
                totalPages={TOTAL_PAGES}
                editableNavigationEnabled={viewMode === 'single' && !isProposalReviewEditorMode}
                editorPanelWidth={richEditorPanelWidth}
                faqOpen={isFaqOpen}
                onEditorPanelWidthChange={setRichEditorPanelWidth}
                onEditorOpenChange={handleEditorOpenChange}
                editorHeaderAccessory={isRichEditorOpen && !experimentUsesReservedRail ? page14ExperimentSwitcher : undefined}
                experimentalOverrides={experimentalOverrides}
                experimentalEditorMode={isProposalReviewEditorMode || activeImportantCompositionVariant === 'candidate'}
                experimentalEditorOverrides={isProposalReviewEditorMode ? reviewEditorOverrides : activeImportantCompositionVariant === 'candidate' ? page14ImportantUnitOverrides : undefined}
                experimentalEditorSelectionKey={isProposalReviewEditorMode ? reviewEditorRendererKey : activeImportantCompositionVariant === 'candidate' ? page14ImportantEditorSelection : null}
                experimentalDraftKey={isProposalReviewEditorMode
                  ? reviewDraftOverrides.keys().next().value ?? null
                  : page14ImportantDraftOverrides.keys().next().value ?? null}
                onExperimentalEditorSave={isProposalReviewEditorMode ? handleProposalReviewSave : activeImportantCompositionVariant === 'candidate' ? handlePage14ImportantExperimentalSave : undefined}
                onExperimentalEditorDraftChange={isProposalReviewEditorMode ? handleReviewEditorDraftChange : activeImportantCompositionVariant === 'candidate' ? handlePage14ImportantExperimentalDraftChange : undefined}
                onProposalReviewEditorClose={isProposalReviewEditorMode ? handleReviewEditorClose : undefined}
                proposalReviewSelectionKey={isProposalReviewEditorMode ? reviewEditorRendererKey : null}
                proposalReviewHighlightKey={reviewHighlightRendererKey}
                proposalReviewOverrides={reviewPreview.overrides}
                proposalReviewLayoutFrames={reviewPreview.layoutFrames}
                proposalReviewDiagnosticBlankKeys={effectiveDiagnosticBlankKeys}
                experimentalFrames={experimentalFrames}
                experimentalHangingIndentBlockKeys={isPage14V3ExperimentVisible ? PAGE14_V3_HANGING_INDENT_BLOCK_KEYS : undefined}
                readOnlyExperiment={readOnlyExperiment}
                onExperimentalUnitSelect={isProposalReviewEditorMode ? undefined : activeImportantCompositionVariant === 'candidate' ? handlePage14ImportantEditorSelection : isPage14V3ExperimentVisible ? handlePage14V3UnitSelect : isPage14V2ExperimentVisible ? handlePage14V2UnitSelect : undefined}
              />
            ) : null}
          </div>
        ) : (
          /* ── Continuous Scroll Mode ── */
          <div className="scroll-container">
            {isLoading ? (
              <div className="loading-spinner">
                <div className="spinner"></div>
                <p>Loading all pages...</p>
              </div>
            ) : null}
            {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map(num => (
              <div id={`page-${num}`} key={num} className="scroll-page-wrapper">
                <div className="scroll-page-label">Page {num}</div>
                {scrollPages.has(num) ? (
                  <PageRenderer 
                    key={`scroll-${num}-${language}`}
                    overlayHost={overlayHost}
                    pageData={scrollPages.get(num)!} 
                    isAdmin={isAdmin}
                    continuousScroll
                    showRuler={false}
                    layoutMode={false}
                    zoomLevel={zoomLevel}
                    onNavigate={navigateToPage}
                    language={language}
                    symbolAliasPreferences={symbolAliasPreferences}
                    onPaletteEditorChange={handlePaletteEditorChange}
                    onTranslationDraftDirtyChange={setHasTranslationDraft}
                    editableNavigationEnabled={false}
                    editorPanelWidth={richEditorPanelWidth}
                    faqOpen={isFaqOpen}
                    onEditorPanelWidthChange={setRichEditorPanelWidth}
                    onEditorOpenChange={handleEditorOpenChange}
                  />
                ) : (
                  <div className="placeholder-page" style={{ height: 1100 * zoomLevel, width: 820 * zoomLevel, background: '#111' }}></div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {experimentUsesReservedRail && (page14ExperimentSwitcher || page14ImportantCompositionPanel) && (
        <aside className={`editorial-experiment-rail${isExperimentRailCollapsed ? ' is-collapsed' : ''}`} aria-label="Ferramentas do experimento editorial">
          <button
            type="button"
            className="editorial-experiment-rail-toggle"
            aria-expanded={!isExperimentRailCollapsed}
            aria-label={isExperimentRailCollapsed ? 'Expandir painel experimental' : 'Recolher painel experimental'}
            onClick={() => setIsExperimentRailCollapsed(collapsed => !collapsed)}
          >
            {isExperimentRailCollapsed ? 'A/B' : 'Recolher'}
          </button>
          {!isExperimentRailCollapsed && (page14ImportantCompositionPanel ?? page14ExperimentSwitcher)}
        </aside>
      )}

      {/* Vertical Sidebar (Moved to Right) */}
      <aside className="pdf-sidebar">
        <div className="toolbar-section top">
          {isRichEditorOpen && (
            <button
              type="button"
              className={`tool-btn workspace-navigation-toggle ${isNavigationExpanded ? 'active' : ''}`}
              aria-label={language === 'pt-BR' ? 'Abrir navegação' : 'Open navigation'}
              aria-controls="global-navigation"
              aria-expanded={isNavigationExpanded}
              title={language === 'pt-BR' ? 'Navegação' : 'Navigation'}
              onClick={() => setNavigationOpenRequest(request => request + 1)}
            >
              <Menu size={16} aria-hidden="true" />
            </button>
          )}
          {/* View Toggles */}
          <div className="tool-group">
            <button
              className={`tool-btn ${viewMode === 'single' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode !== 'single' && (!acceptLeavingLayout() || !acceptLeavingTranslationDraft())) return;
                setViewMode('single');
              }}
              title="Single Page View"
            >
              <Layout size={16} />
            </button>
            <button
              className={`tool-btn ${viewMode === 'scroll' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode !== 'scroll' && (!acceptLeavingLayout() || !acceptLeavingTranslationDraft())) return;
                setViewMode('scroll');
              }}
              title="Continuous Scroll"
            >
              <LayoutList size={16} />
            </button>
          </div>

          <div className="divider"></div>

          {/* Pagination Controls */}
          <div className="pagination-group">
            <button className="nav-btn" onClick={() => navigateToPage(Math.max(1, currentPage - 1))}>
              <ChevronLeft size={16} />
            </button>
            <form onSubmit={handlePageSubmit} className="page-input-form">
              <input 
                type="text" 
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={handlePageSubmit}
                className="page-input"
              />
              <span className="page-total">{TOTAL_PAGES}</span>
            </form>
            <button className="nav-btn" onClick={() => navigateToPage(Math.min(TOTAL_PAGES, currentPage + 1))}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="divider"></div>

          {/* Zoom Controls */}
          <div className="zoom-group">
            <button className="tool-btn" onClick={() => changeZoomAroundCenter(zoomLevelRef.current + 0.25)} title="Zoom In">
              <ZoomIn size={16} />
            </button>
            <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
            <button className="tool-btn" onClick={() => changeZoomAroundCenter(zoomLevelRef.current - 0.25)} title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <button className="tool-btn" onClick={() => changeZoomAroundCenter(1, true)} title="Fit to Screen">
              <Maximize size={16} />
            </button>
          </div>

        </div>

        <div className="toolbar-section bottom">
          <select 
            value={rendererLanguage}
            onChange={(e) => {
              const nextLanguage = e.target.value as 'en' | 'pt-BR';
              if (nextLanguage === rendererLanguage) return;
              if (isPage14V2ExperimentVisible && activeV2Variant !== null) {
                if (nextLanguage === 'en' || nextLanguage === 'pt-BR') {
                  choosePage14V2Variant(nextLanguage === 'en' ? 'EN' : 'PT');
                }
                return;
              }
              if (isPage14ExperimentVisible && activeExperimentVariant !== null) {
                chooseEditorialExperimentVariant(nextLanguage === 'en' ? 'EN' : 'PT');
                return;
              }
              if (acceptLeavingLayout() && acceptLeavingTranslationDraft()) setLanguage(nextLanguage);
            }}
            className="language-select"
            style={{ padding: '4px', borderRadius: '4px', border: '1px solid #444', background: '#333', color: '#fff', fontSize: '10px', width: '38px', appearance: 'none', textAlign: 'center' }}
            title="Language"
          >
            <option value="en">EN</option>
            <option value="pt-BR">PT</option>
          </select>

          <div className="divider"></div>

          <LocalSyncRecoveryControl visible={isAdmin} hasUnsavedDraft={hasTranslationDraft || isLayoutDirty} />
          {isAdmin && (
            <button
              className={`tool-btn ${isRulerVisible ? 'active' : ''}`}
              onClick={() => setIsRulerVisible(visible => !visible)}
              title={isRulerVisible ? 'Hide page ruler' : 'Show page ruler'}
              aria-label={isRulerVisible ? 'Hide page ruler' : 'Show page ruler'}
              aria-pressed={isRulerVisible}
            >
              <Ruler size={16} />
            </button>
          )}
          {isAdmin && viewMode === 'single' && (
            <button
              className={`tool-btn ${isLayoutMode ? 'active' : ''}`}
              disabled={readOnlyExperiment}
              title={readOnlyExperiment
                ? 'A edição de molduras fica desativada durante a prévia experimental.'
                : isLayoutMode ? 'Exit translation frame layout' : 'Edit translation frames'}
              onClick={() => {
                if (isLayoutMode) {
                  acceptLeavingLayout();
                  return;
                }
                setIsLayoutMode(true);
              }}
              aria-label={isLayoutMode ? 'Exit translation frame layout' : 'Edit translation frames'}
              aria-pressed={isLayoutMode}
            >
              <Move size={16} />
            </button>
          )}
          <button
            className={`admin-toggle ${isAdmin ? 'active' : ''}`}
            onClick={() => {
              if (isAdmin && !acceptLeavingLayout()) return;
              const nextAdmin = !isAdmin;
              setIsAdmin(nextAdmin);
              setIsRulerVisible(nextAdmin);
              if (!nextAdmin) setIsSymbolPaletteOpen(false);
            }}
            title={isAdmin ? 'Exit Admin' : 'Enter Admin'}
            aria-label={isAdmin ? 'Sair do modo Admin' : 'Entrar no modo Admin'}
          >
            <Edit3 size={16} />
            <span>Admin</span>
          </button>
        </div>
      </aside>
      <TranslationReviewPanel
        open={isTranslationReviewOpen}
        onClose={closeTranslationReview}
        language={rendererLanguage}
        onToggleLanguage={handleToggleLanguage}
        catalog={reviewCatalog}
        catalogError={reviewCatalogError}
        records={reviewRecords}
        requests={reviewRequests}
        glossaryDecisions={glossaryDecisions}
        persistenceError={reviewPersistenceError}
        persistenceAvailable={reviewPersistenceLoaded && !reviewPersistenceLoading && !reviewPersistenceError}
        pageData={pageData}
        savedHumanTranslations={savedHumanTranslations}
        savedPayloadTranslations={savedPayloadTranslations}
        selectedPage={currentPage}
        selectedReviewKey={selectedReviewKey}
        busyReviewKey={reviewWritingKey}
        hasUnsavedDraft={hasTranslationDraft}
        reviewStatus={reviewStatus}
        onSelectCandidate={handleSelectReviewCandidate}
        onOpenViewer={handleOpenReviewViewer}
        onOpenApprovedViewer={handleOpenApprovedViewer}
        onOpenEditor={handleOpenReviewEditor}
        onOpenExceptionPage={handleOpenReviewExceptionPage}
        onApprove={handleApproveReviewCandidate}
        onSetArchived={handleSetTranslationReviewArchived}
        onClearSelection={handleClearReviewSelection}
        onReopen={handleReopenReviewCandidate}
        onCreateAIRequest={handleCreateTranslationReviewRequest}
        onUpdateAIRequest={handleUpdateTranslationReviewRequest}
        onCompleteAIRequestAsUser={handleCompleteTranslationReviewRequestAsUser}
        onDecideGlossaryTerm={handleTranslationGlossaryDecision}
      />
      <FaqDrawer
        language={language}
        open={isFaqOpen}
        activeType={faqActiveType}
        onActiveTypeChange={setFaqActiveType}
        onOpenChange={setIsFaqOpen}
        onNavigateToPage={navigateToPage}
      />
      <PdfExportDialog
        open={isPdfExportOpen}
        currentLanguage={language}
        currentPage={currentPage}
        hasUnsavedDraft={hasTranslationDraft || isLayoutDirty}
        onClose={() => setIsPdfExportOpen(false)}
      />
      {isAdmin && (
        <AdminSymbolPalette
          language={language}
          context={paletteEditorState?.context ?? 'admin'}
          open={isSymbolPaletteOpen}
          canInsert={paletteEditorState?.canInsert ?? false}
          canUndo={paletteEditorState?.canUndo ?? false}
          status={paletteEditorState?.status ?? null}
          aliasPreferences={symbolAliasPreferences}
          aliasesLoading={symbolAliasSettingsLoading}
          showToggle={false}
          onOpenChange={setIsSymbolPaletteOpen}
          onInsert={symbolId => activePaletteEditorRef.current?.state.insert(symbolId)}
          onUndo={() => activePaletteEditorRef.current?.state.undo()}
          onSaveAlias={handleSaveSymbolAlias}
        />
      )}
    </div>
  );
}

export default App;
