const MARKER_ONLY = /^(?:\uFFFD|[•·▪■●○◦▫‣⁃]|\d{1,2}[.)]|[a-z][.)])(?:[\t\s\u00a0]*)$/u;
const MARKER_PREFIX = /^(?:\uFFFD|[•·▪■●○◦▫‣⁃]|\d{1,2}[.)]|[a-z][.)])(?:[\t\s\u00a0]+)(\S)/u;
const BULLET_ONLY = /^(?:\uFFFD|[•·▪■●○◦▫‣⁃])(?:[\t\s\u00a0]*)$/u;
const SOURCE_TOLERANCE_PT = 1.5;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

const CORRIDOR_EVIDENCE_KINDS = new Set([
  'semantic-parent', 'source-baselines', 'sibling-alignment', 'column-grid',
  'visual-boundary', 'background-image-boundary', 'artwork-occupancy',
  'table-grid', 'page-margin', 'typography-role',
]);

function measuredEdge(values, tolerancePt) {
  const usable = (values ?? []).filter(item => finite(item?.valuePt)
    && typeof item?.sourceId === 'string' && item.sourceId.trim().length > 0
    && CORRIDOR_EVIDENCE_KINDS.has(item?.kind));
  if (usable.length < 2 || new Set(usable.map(item => item.kind)).size < 2
    || new Set(usable.map(item => item.sourceId)).size < 2) return null;
  const sorted = usable.map(item => item.valuePt).sort((a, b) => a - b);
  const spreadPt = sorted.at(-1) - sorted[0];
  if (spreadPt > tolerancePt) return { valuePt: null, spreadPt, evidence: usable };
  const middle = Math.floor(sorted.length / 2);
  const valuePt = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { valuePt, spreadPt, evidence: usable };
}

/**
 * Resolve a proposal-only text-flow corridor from independently recorded
 * semantic and visual evidence. Rect proximity alone cannot establish an
 * owner or authorize expansion.
 */
export function resolveSemanticTextFlowCorridor(input = {}) {
  const frame = input.currentFrame;
  const region = input.flowRegion;
  const tolerancePt = finite(input.boundaryTolerancePt) ? input.boundaryTolerancePt : SOURCE_TOLERANCE_PT;
  const uncertain = (reasons, details = {}) => ({
    status: 'GEOMETRY_UNCERTAIN',
    confidence: 'low',
    reasons,
    automaticProposalAllowed: false,
    ...details,
  });
  if (!frame || ![frame.xPt, frame.yPt, frame.widthPt, frame.heightPt].every(finite)
    || frame.widthPt <= 0 || frame.heightPt <= 0) {
    return uncertain(['current PT-BR frame is missing or invalid']);
  }
  if (!region || typeof region.id !== 'string' || typeof region.semanticOwner !== 'string') {
    return uncertain(['semantic flow-region identity and owner are required']);
  }
  const left = measuredEdge(region.leftBoundaryEvidence, tolerancePt);
  const right = measuredEdge(region.rightBoundaryEvidence, tolerancePt);
  if (!left || !right || !finite(left.valuePt) || !finite(right.valuePt) || right.valuePt <= left.valuePt) {
    return uncertain(['independent left/right boundary evidence is absent or disagrees'], { left, right });
  }
  const evidence = (region.evidence ?? []).filter(item => item?.supports !== false
    && CORRIDOR_EVIDENCE_KINDS.has(item?.kind));
  const evidenceKinds = new Set(evidence.map(item => item.kind));
  const hasOwnerLink = evidence.some(item => item.kind === 'semantic-parent'
    && String(item.owner ?? '') === region.semanticOwner);
  const hasVisualEvidence = [...evidenceKinds].some(kind => [
    'visual-boundary', 'background-image-boundary', 'table-grid', 'artwork-occupancy', 'column-grid',
  ].includes(kind));
  const hasFlowEvidence = [...evidenceKinds].some(kind => [
    'source-baselines', 'sibling-alignment', 'typography-role', 'page-margin',
  ].includes(kind));
  const hasContradiction = (region.evidence ?? []).some(item => item?.supports === false);
  const confidence = !hasContradiction && hasOwnerLink && hasVisualEvidence && hasFlowEvidence
    && evidenceKinds.size >= 3 ? 'high'
    : !hasContradiction && hasOwnerLink && evidenceKinds.size >= 2 ? 'medium' : 'low';
  const paddingLeftPt = region.paddingLeftPt;
  const paddingRightPt = region.paddingRightPt;
  if (!finite(paddingLeftPt) || !finite(paddingRightPt) || paddingLeftPt < 0 || paddingRightPt < 0) {
    return uncertain(['measured inner padding is required; no global padding is assumed'], { left, right, confidence });
  }
  if (confidence !== 'high') {
    return uncertain(['semantic owner, visual evidence, and source-flow evidence do not agree at high confidence'], {
      left, right, evidenceKinds: [...evidenceKinds], confidence,
    });
  }

  let safeLeftPt = left.valuePt + paddingLeftPt;
  let safeRightPt = right.valuePt - paddingRightPt;
  const verticalTopPt = finite(region.textBandTopPt) ? region.textBandTopPt : frame.yPt;
  const verticalBottomPt = finite(region.textBandBottomPt) ? region.textBandBottomPt : frame.yPt + frame.heightPt;
  if (verticalBottomPt <= verticalTopPt) {
    return uncertain(['the inspected text band is invalid'], { left, right, confidence });
  }
  const consideredObstacles = [];
  for (const obstacle of input.obstacles ?? []) {
    const box = obstacle?.bboxPt;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(finite)) {
      return uncertain([`obstacle ${obstacle?.id ?? '(unknown)'} has invalid geometry`], { left, right, confidence });
    }
    if (box[1] >= verticalBottomPt || box[3] <= verticalTopPt) continue;
    if (obstacle.semanticRelation !== 'independent-flow-owner'
      || !finite(obstacle.requiredGapPt) || obstacle.requiredGapPt < 0) {
      return uncertain([`obstacle ${obstacle.id ?? '(unknown)'} lacks a measured semantic relationship or gap`], {
        left, right, confidence, consideredObstacles,
      });
    }
    consideredObstacles.push({
      id: obstacle.id ?? null,
      semanticRelation: obstacle.semanticRelation,
      bboxPt: box,
      requiredGapPt: obstacle.requiredGapPt,
      inspectedVerticalBandPt: [verticalTopPt, verticalBottomPt],
    });
    const anchor = input.alignmentAnchor ?? 'left';
    if (anchor === 'left') {
      if (box[2] <= frame.xPt + tolerancePt) continue;
      if (box[0] <= frame.xPt + frame.widthPt + tolerancePt) {
        return uncertain([`obstacle ${obstacle.id ?? '(unknown)'} intersects the current left-anchored frame`], {
          left, right, confidence, consideredObstacles,
        });
      }
      safeRightPt = Math.min(safeRightPt, box[0] - obstacle.requiredGapPt);
    } else if (anchor === 'right' && box[2] <= frame.xPt + frame.widthPt + tolerancePt) {
      if (box[0] < frame.xPt - tolerancePt) {
        return uncertain([`obstacle ${obstacle.id ?? '(unknown)'} intersects the current right-anchored frame`], {
          left, right, confidence, consideredObstacles,
        });
      }
      safeLeftPt = Math.max(safeLeftPt, box[2] + obstacle.requiredGapPt);
    } else if (anchor === 'center') {
      const centerPt = finite(input.centerAnchorPt) ? input.centerAnchorPt : frame.xPt + frame.widthPt / 2;
      if (box[0] >= centerPt) safeRightPt = Math.min(safeRightPt, box[0] - obstacle.requiredGapPt);
      else if (box[2] <= centerPt) safeLeftPt = Math.max(safeLeftPt, box[2] + obstacle.requiredGapPt);
      else return uncertain([`obstacle ${obstacle.id ?? '(unknown)'} crosses the preserved center anchor`], {
        left, right, confidence, consideredObstacles,
      });
    } else if (!['left', 'right', 'center'].includes(anchor)) {
      return uncertain(['alignment anchor is unsupported'], { left, right, confidence, consideredObstacles });
    }
  }

  const anchor = input.alignmentAnchor ?? 'left';
  const centerPt = anchor === 'center'
    ? finite(input.centerAnchorPt) ? input.centerAnchorPt : frame.xPt + frame.widthPt / 2
    : null;
  let maxWidthPt;
  let maxFrameXPt;
  if (anchor === 'center') {
    maxWidthPt = 2 * Math.min(centerPt - safeLeftPt, safeRightPt - centerPt);
    maxFrameXPt = centerPt - maxWidthPt / 2;
  } else if (anchor === 'right') {
    const rightAnchorPt = frame.xPt + frame.widthPt;
    maxWidthPt = rightAnchorPt - safeLeftPt;
    maxFrameXPt = rightAnchorPt - maxWidthPt;
  } else if (anchor === 'left') {
    maxWidthPt = safeRightPt - frame.xPt;
    maxFrameXPt = frame.xPt;
  } else {
    return uncertain(['alignment anchor is unsupported'], { left, right, confidence, consideredObstacles });
  }
  const currentRightPt = frame.xPt + frame.widthPt;
  const frameOverhangPt = {
    left: Math.max(0, safeLeftPt - frame.xPt),
    right: Math.max(0, currentRightPt - safeRightPt),
  };
  if (![safeLeftPt, safeRightPt, maxWidthPt, maxFrameXPt, currentRightPt].every(finite)
    || maxWidthPt <= 0 || frameOverhangPt.left > tolerancePt || frameOverhangPt.right > tolerancePt) {
    return uncertain(['current frame is outside the reconstructed safe corridor'], {
      left, right, confidence, safeLeftPt, safeRightPt, maxWidthPt, frameOverhangPt,
      boundaryTolerancePt: tolerancePt, consideredObstacles,
    });
  }
  const maxFrame = {
    xPt: maxFrameXPt,
    yPt: frame.yPt,
    widthPt: maxWidthPt,
    heightPt: frame.heightPt,
    rightPt: maxFrameXPt + maxWidthPt,
  };
  return {
    status: maxWidthPt > frame.widthPt + tolerancePt ? 'WIDTH_ADJUSTMENT_CANDIDATE'
      : frameOverhangPt.left > 0 || frameOverhangPt.right > 0
        ? 'CURRENT_FRAME_WITHIN_BOUNDARY_TOLERANCE' : 'CURRENT_FRAME_WITHIN_CORRIDOR',
    confidence,
    reasons: [],
    flowRegionId: region.id,
    semanticOwner: region.semanticOwner,
    evidenceKinds: [...evidenceKinds],
    boundaryEvidenceSpreadPt: { left: left.spreadPt, right: right.spreadPt },
    alignmentAnchor: anchor,
    preservedCenterAnchorPt: centerPt,
    safeLeftPt,
    safeRightPt,
    frameOverhangPt,
    boundaryTolerancePt: tolerancePt,
    currentFrame: { ...frame, rightPt: frame.xPt + frame.widthPt },
    maximumFrame: maxFrame,
    maxWidthPt,
    widthExpansionPt: maxWidthPt - frame.widthPt,
    inspectedVerticalBandPt: [verticalTopPt, verticalBottomPt],
    consideredObstacles,
    automaticProposalAllowed: true,
  };
}

/** Resolve current-width and completed-width states without sending an initial OVER to DTP. */
export function classifySemanticWidthPreflight(metrics = {}) {
  const currentClass = classifyCopyfitVisualLines(metrics.sourceLineCount, metrics.currentLineCount);
  if (currentClass === 'UNMEASURED') return 'GEOMETRY_UNCERTAIN';
  if (currentClass === 'EXACT' || currentClass === 'UNDER') return currentClass;
  const corridor = metrics.corridor;
  if (!corridor) return 'OVER_AT_CURRENT_WIDTH';
  if (corridor.confidence !== 'high' || !corridor.automaticProposalAllowed) return 'GEOMETRY_UNCERTAIN';
  if (finite(metrics.resolvedLineCount) && metrics.resolvedLineCount <= metrics.sourceLineCount) return 'WIDTH_RESOLVED';
  if (finite(metrics.testedWidthPt) && finite(corridor.maxWidthPt)
    && metrics.testedWidthPt >= corridor.maxWidthPt - (finite(metrics.widthTolerancePt) ? metrics.widthTolerancePt : 0.25)
    && finite(metrics.resolvedLineCount) && metrics.resolvedLineCount > metrics.sourceLineCount) return 'OVER_AFTER_SAFE_WIDTH';
  return corridor.maxWidthPt > corridor.currentFrame.widthPt + (finite(metrics.widthTolerancePt) ? metrics.widthTolerancePt : 0.25)
    ? 'WIDTH_ADJUSTMENT_CANDIDATE' : 'OVER_AT_CURRENT_WIDTH';
}

/** Find the smallest live-render width that reaches the source line limit. */
export async function searchSemanticFlowWidth({
  corridor,
  sourceLineCount,
  initialMeasurement,
  measureAtWidth,
  maxProbes = 8,
  widthTolerancePt = 0.25,
} = {}) {
  const currentWidthPt = corridor?.currentFrame?.widthPt;
  const maxWidthPt = corridor?.maxWidthPt;
  const initialLineCount = initialMeasurement?.lineCount;
  const invalid = reason => ({ status: 'GEOMETRY_UNCERTAIN', confidence: corridor?.confidence ?? 'low', reason, probes: [] });
  const safe = measurement => !!measurement && measurement.fontLoaded === true
    && measurement.geometryPass === true && measurement.textEscapesFrame === false
    && measurement.overflow === false && measurement.collision === false;
  if (!finite(sourceLineCount) || sourceLineCount <= 0 || !finite(initialLineCount) || initialLineCount <= 0
    || !corridor?.currentFrame
    || ![corridor.currentFrame.xPt, corridor.currentFrame.yPt, currentWidthPt, corridor.currentFrame.heightPt].every(finite)
    || currentWidthPt <= 0 || corridor.currentFrame.heightPt <= 0
    || typeof measureAtWidth !== 'function') {
    return invalid('source count, current measurement, width range, or PageRenderer callback is invalid');
  }
  if (initialLineCount <= sourceLineCount) {
    if (!safe(initialMeasurement)) return invalid('current line count passes, but font, overflow, or collision evidence does not');
    return {
      status: classifyCopyfitVisualLines(sourceLineCount, initialLineCount),
      confidence: 'high', currentWidthPt, selectedWidthPt: currentWidthPt, widthPreflightNeeded: false,
      selectedFrame: { ...corridor.currentFrame },
      selectedMeasurement: initialMeasurement, probes: [],
    };
  }
  if (corridor?.confidence !== 'high' || corridor?.automaticProposalAllowed !== true) {
    return invalid('high-confidence semantic corridor is required');
  }
  if (!finite(maxWidthPt) || maxWidthPt < currentWidthPt) {
    return { status: 'OVER_AFTER_SAFE_WIDTH', confidence: 'high', currentWidthPt, maximumWidthPt: maxWidthPt,
      selectedWidthPt: null, selectedMeasurement: null, probes: [], reason: 'the measured safe corridor does not extend beyond the current frame' };
  }
  const probes = [];
  let lowerWidthPt = currentWidthPt;
  let upperWidthPt = maxWidthPt;
  let upperMeasurement;
  if (maxWidthPt <= currentWidthPt + widthTolerancePt) {
    upperMeasurement = initialMeasurement;
  } else {
    upperMeasurement = await measureAtWidth(maxWidthPt);
    probes.push({ widthPt: maxWidthPt, lineCount: upperMeasurement?.lineCount ?? null, safe: safe(upperMeasurement) });
  }
  if (!safe(upperMeasurement)) {
    return { status: 'OVER_AFTER_SAFE_WIDTH', confidence: 'high', currentWidthPt, maximumWidthPt: maxWidthPt,
      selectedWidthPt: null, selectedMeasurement: null, maximumMeasurement: upperMeasurement, probes };
  }
  if (!finite(upperMeasurement?.lineCount) || upperMeasurement.lineCount > sourceLineCount) {
    return { status: 'OVER_AFTER_SAFE_WIDTH', confidence: 'high', currentWidthPt, maximumWidthPt: maxWidthPt,
      selectedWidthPt: null, selectedMeasurement: null, maximumMeasurement: upperMeasurement, probes };
  }
  let selectedMeasurement = upperMeasurement;
  let selectedWidthPt = upperWidthPt;
  const probeLimit = Math.max(1, Math.min(16, Math.floor(maxProbes)));
  for (let index = 0; index < probeLimit && upperWidthPt - lowerWidthPt > widthTolerancePt; index += 1) {
    const middleWidthPt = (lowerWidthPt + upperWidthPt) / 2;
    const measurement = await measureAtWidth(middleWidthPt);
    probes.push({ widthPt: middleWidthPt, lineCount: measurement?.lineCount ?? null, safe: safe(measurement) });
    if (safe(measurement) && finite(measurement.lineCount) && measurement.lineCount <= sourceLineCount) {
      upperWidthPt = middleWidthPt;
      selectedWidthPt = middleWidthPt;
      selectedMeasurement = measurement;
    } else {
      lowerWidthPt = middleWidthPt;
    }
  }
  // Re-measure the chosen width and the nearest lower probe to guard against
  // wrapping irregularities; all decisions still come from actual PageRenderer output.
  const finalMeasurement = await measureAtWidth(selectedWidthPt);
  probes.push({ widthPt: selectedWidthPt, lineCount: finalMeasurement?.lineCount ?? null, safe: safe(finalMeasurement), final: true });
  if (!safe(finalMeasurement) || !finite(finalMeasurement.lineCount) || finalMeasurement.lineCount > sourceLineCount) {
    return { status: 'OVER_AFTER_SAFE_WIDTH', confidence: 'high', currentWidthPt, maximumWidthPt: maxWidthPt,
      selectedWidthPt: null, selectedMeasurement: null, maximumMeasurement: upperMeasurement, probes };
  }
  const classification = classifyCopyfitVisualLines(sourceLineCount, finalMeasurement.lineCount);
  return {
    status: classification === 'EXACT' ? 'WIDTH_RESOLVED' : 'WIDTH_RESOLVED',
    classification,
    confidence: 'high',
    currentWidthPt,
    maximumWidthPt: maxWidthPt,
    selectedWidthPt,
    selectedFrame: {
      xPt: corridor.alignmentAnchor === 'center'
        ? (corridor.preservedCenterAnchorPt ?? (corridor.currentFrame.xPt + currentWidthPt / 2)) - selectedWidthPt / 2
        : corridor.alignmentAnchor === 'right'
          ? corridor.currentFrame.xPt + currentWidthPt - selectedWidthPt
          : corridor.currentFrame.xPt,
      yPt: corridor.currentFrame.yPt,
      widthPt: selectedWidthPt,
      heightPt: corridor.currentFrame.heightPt,
    },
    selectedMeasurement: finalMeasurement,
    maximumMeasurement: upperMeasurement,
    probes,
  };
}

function normalize(text) {
  return String(text ?? '').replace(/[\s\u00a0]+/gu, ' ').trim();
}

function spanText(span) {
  return String(span.displayOverride ?? span.displayOverrideText ?? span.text ?? '');
}

function boxOf(span, line) {
  const box = span.bbox ?? line.bbox;
  return Array.isArray(box) && box.length === 4 && box.every(finite) ? box : null;
}

function baselineOf(span, line) {
  const origin = span.origin ?? line.spans?.find(candidate => Array.isArray(candidate.origin))?.origin;
  if (Array.isArray(origin) && finite(origin[1])) return origin[1];
  const box = boxOf(span, line);
  return box ? box[3] : null;
}

function visualFragments(block) {
  const fragments = [];
  for (const [lineIndex, line] of (block.lines ?? []).entries()) {
    for (const span of line.spans ?? []) {
      if (span.renderOnlyStrokePass) continue;
      const text = spanText(span);
      if (!normalize(text)) continue;
      const bbox = boxOf(span, line);
      const baseline = baselineOf(span, line);
      if (!bbox || !finite(baseline)) continue;
      fragments.push({
        text,
        normalizedText: normalize(text),
        bbox,
        baseline,
        lineIndex,
        availableX: finite(line.availableX) ? line.availableX : null,
        availableWidth: finite(line.availableWidth) ? line.availableWidth : null,
        font: String(span.font ?? ''),
        size: finite(span.size) ? span.size : null,
        suspectedGhost: !!line.suspectedGhost,
        rasterizedDuplicate: !!line.rasterizedDuplicate,
        rasterizedDuplicateLanguage: line.rasterizedDuplicateLanguage ?? null,
        direction: Array.isArray(line.dir) ? line.dir : null,
      });
    }
  }
  return fragments.sort((a, b) => a.baseline - b.baseline || a.bbox[0] - b.bbox[0]);
}

function visualRows(fragments, tolerancePt = 1.6) {
  const rows = [];
  for (const fragment of fragments) {
    const row = rows.find(candidate => Math.abs(candidate.baseline - fragment.baseline) <= tolerancePt);
    if (row) {
      row.fragments.push(fragment);
      row.baseline = row.fragments.reduce((sum, item) => sum + item.baseline, 0) / row.fragments.length;
    } else rows.push({ baseline: fragment.baseline, fragments: [fragment] });
  }
  return rows.sort((a, b) => a.baseline - b.baseline).map(row => ({
    ...row,
    fragments: row.fragments.sort((a, b) => a.bbox[0] - b.bbox[0]),
    left: Math.min(...row.fragments.map(fragment => fragment.bbox[0])),
    right: Math.max(...row.fragments.map(fragment => fragment.bbox[2])),
    top: Math.min(...row.fragments.map(fragment => fragment.bbox[1])),
    bottom: Math.max(...row.fragments.map(fragment => fragment.bbox[3])),
  }));
}

function markerKind(text) {
  const value = String(text ?? '').replace(/[\s\u00a0]+$/gu, '');
  if (BULLET_ONLY.test(value)) return 'bullet';
  if (/^\d{1,2}[.)]$/u.test(value)) return 'numbered';
  if (/^[a-z][.)]$/u.test(value)) return 'lettered';
  return null;
}

function result(status, role, reasons = [], details = {}) {
  return { status, role, reasons, ...details };
}

/** Validate a rendered list body against the marker and its own source column. */
export function validateHangingIndent(metrics) {
  const reasons = [];
  const marker = metrics?.marker;
  const bodyStarts = metrics?.bodyLineStartsPt;
  const bodyRights = metrics?.bodyLineRightsPt ?? [];
  const expectedBodyStart = metrics?.expectedBodyStartXPt;
  const rightBoundary = metrics?.rightBoundaryPt;
  const tolerance = finite(metrics?.tolerancePt) ? metrics.tolerancePt : SOURCE_TOLERANCE_PT;

  if (!marker || !finite(marker.leftPt) || !finite(marker.rightPt)
    || !Array.isArray(bodyStarts) || bodyStarts.length === 0
    || !finite(expectedBodyStart) || !finite(rightBoundary)) {
    return result('review-required', 'separated-list', ['evidência incompleta de marcador, corpo ou limite de coluna']);
  }

  const bodyStart = bodyStarts[0];
  const spread = Math.max(...bodyStarts) - Math.min(...bodyStarts);
  const usefulWidth = rightBoundary - expectedBodyStart;
  if (bodyStart <= marker.rightPt + tolerance) reasons.push('corpo invade ou quase toca a área de tinta do marcador');
  if (Math.abs(bodyStart - expectedBodyStart) > tolerance) reasons.push('primeira linha não começa na origem de corpo desta ocorrência');
  if (spread > tolerance) reasons.push('linhas de continuação não compartilham a origem do corpo');
  if (usefulWidth <= 0) reasons.push('largura útil não positiva após excluir a área reservada ao marcador');
  if (bodyRights.some(right => right > rightBoundary + tolerance)) reasons.push('texto excede a borda direita da coluna');

  return result(reasons.length ? 'suspect' : 'compatible', 'separated-list', reasons, {
    markerLeftPt: marker.leftPt,
    markerRightPt: marker.rightPt,
    expectedBodyStartXPt: expectedBodyStart,
    bodyLineStartsPt: bodyStarts,
    hangingIndentSpreadPt: Number(spread.toFixed(2)),
    rightBoundaryPt: rightBoundary,
    usefulBodyWidthPt: Number(usefulWidth.toFixed(2)),
    tolerancePt: tolerance,
  });
}

/** Validate an ordinary left-aligned flow only when source and CSS make that role explicit. */
export function validateParagraphFlow(metrics) {
  const sourceStarts = metrics?.sourceLineStartsPt;
  const actualStarts = metrics?.actualLineStartsPt;
  const actualRights = metrics?.actualLineRightsPt ?? [];
  const rightBoundary = metrics?.rightBoundaryPt;
  const align = String(metrics?.textAlign ?? '').toLowerCase();
  const tolerance = finite(metrics?.tolerancePt) ? metrics.tolerancePt : SOURCE_TOLERANCE_PT;
  if (!Array.isArray(sourceStarts) || sourceStarts.length === 0 || !Array.isArray(actualStarts) || actualStarts.length === 0) {
    return result('review-required', 'paragraph', ['não há origens de linha fonte e render suficientes para inferir a estrutura']);
  }
  if (!['left', 'start', 'justify'].includes(align)) {
    return result('review-required', 'paragraph', [`alinhamento CSS ${align || 'desconhecido'} exige contrato próprio`]);
  }
  const sourceSpread = Math.max(...sourceStarts) - Math.min(...sourceStarts);
  if (sourceSpread > tolerance) {
    return result('review-required', 'paragraph', ['a fonte tem recuo/centralização/fluxo misto que não pode ser normalizado como prosa simples'], {
      sourceAlignmentSpreadPt: Number(sourceSpread.toFixed(2)),
    });
  }
  const expectedStart = sourceStarts[0];
  const actualSpread = Math.max(...actualStarts) - Math.min(...actualStarts);
  const reasons = [];
  if (Math.abs(actualStarts[0] - expectedStart) > tolerance) reasons.push('origem da prosa renderizada diverge do eixo fonte desta ocorrência');
  if (actualSpread > tolerance) reasons.push('linhas de continuação da prosa não compartilham o eixo fonte');
  if (finite(rightBoundary) && actualRights.some(right => right > rightBoundary + tolerance)) reasons.push('texto excede a borda direita da coluna');
  return result(reasons.length ? 'suspect' : 'compatible', 'paragraph', reasons, {
    expectedStartXPt: expectedStart,
    actualLineStartsPt: actualStarts,
    alignmentSpreadPt: Number(actualSpread.toFixed(2)),
    rightBoundaryPt: finite(rightBoundary) ? rightBoundary : null,
    tolerancePt: tolerance,
  });
}

/** Shared copyfit gate: only a known-compatible structure may reach human fit review. */
export function getStructuralCopyfitBlockStatus(status, overflow = false, collision = false) {
  if (overflow || collision) return 'blocked-live-overflow';
  if (status === 'suspect') return 'blocked-structural-error';
  if (status !== 'compatible') return 'blocked-structural-review';
  return null;
}

/**
 * Copyfit overflow is about visible ink crossing the frame, not the element's
 * scroll box. scrollHeight/clientHeight also count line-leading and padding,
 * so they can flag a visually contained paragraph as overflowing.
 */
export function hasVisibleGeometryOverflow(metrics) {
  const tolerance = finite(metrics?.tolerancePx) ? metrics.tolerancePx : 0.75;
  return (finite(metrics?.topEdgeOverflowPx) && metrics.topEdgeOverflowPx > tolerance)
    || (finite(metrics?.bottomOverflowPx) && metrics.bottomOverflowPx > tolerance)
    || (finite(metrics?.leftEdgeOverflowPx) && metrics.leftEdgeOverflowPx > tolerance)
    || (finite(metrics?.rightEdgeOverflowPx) && metrics.rightEdgeOverflowPx > tolerance);
}

/** Classify visual lines measured from the original PDF and the live PageRenderer. */
export function classifyCopyfitVisualLines(sourcePdfLineCount, targetPageRendererLineCount) {
  // A blank diagnostic unit has no candidate text to measure. Do not classify
  // 0/0 as EXACT or a zero-row target as an acceptable UNDER result.
  if (!Number.isInteger(sourcePdfLineCount) || sourcePdfLineCount < 1
    || !Number.isInteger(targetPageRendererLineCount) || targetPageRendererLineCount < 1) return 'UNMEASURED';
  if (targetPageRendererLineCount === sourcePdfLineCount) return 'EXACT';
  return targetPageRendererLineCount < sourcePdfLineCount ? 'UNDER' : 'OVER';
}

/** OVER is a mandatory failure even when all geometric checks pass. */
export function getCopyfitLineCountBlockStatus(sourcePdfLineCount, targetPageRendererLineCount) {
  const classification = classifyCopyfitVisualLines(sourcePdfLineCount, targetPageRendererLineCount);
  if (classification === 'OVER') return 'blocked-line-count-over';
  if (!Number.isInteger(sourcePdfLineCount) || sourcePdfLineCount < 1) return 'blocked-source-line-count';
  if (classification === 'UNMEASURED') return 'pending-line-count-measurement';
  return null;
}

/** Apply the shared EXACT/UNDER/OVER copyfit gate to measured visual rows. */
export function getCopyfitVisualLineGateStatus(sourcePdfLineCount, targetPageRendererLineCount, underCompositionJustification = null) {
  const classification = classifyCopyfitVisualLines(sourcePdfLineCount, targetPageRendererLineCount);
  if (!Number.isInteger(sourcePdfLineCount) || sourcePdfLineCount < 1) return 'blocked-source-line-count';
  if (classification === 'UNMEASURED') return 'pending-line-count-measurement';
  if (classification === 'OVER') return 'blocked-line-count-over';
  if (classification === 'UNDER' && !String(underCompositionJustification ?? '').trim()) {
    return 'pending-under-composition-justification';
  }
  return 'line-count-pass';
}

/** Group measured PageRenderer fragments into visual rows without double-counting runs or inline art. */
export function groupPageRendererVisualLines(textRects, inlineSymbolRects = [], tolerancePx = 4.5) {
  const lines = [];
  const heightOf = rect => Math.max(0, rect.bottom - rect.top);
  const sameVisualRow = (line, rect) => {
    if (Math.abs(line.groupTop - rect.top) <= tolerancePx) return true;
    if (finite(line.baselineY) && finite(rect.baselineY)
      && Math.abs(line.baselineY - rect.baselineY) <= tolerancePx) return true;
    const overlap = Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top);
    const smallerHeight = Math.min(heightOf(line), heightOf(rect));
    return smallerHeight > 0 && overlap / smallerHeight >= 0.55;
  };
  const addInk = (line, rect) => {
    line.top = Math.min(line.top, rect.top);
    line.bottom = Math.max(line.bottom, rect.bottom);
    line.left = Math.min(line.left, rect.left);
    line.right = Math.max(line.right, rect.right);
    if (finite(rect.baselineY)) {
      line.baselineY = finite(line.baselineY)
        ? Math.min(line.baselineY, rect.baselineY)
        : rect.baselineY;
    }
  };
  const orderedText = [...(textRects ?? [])]
    .filter(rect => rect && [rect.top, rect.bottom, rect.left, rect.right].every(finite))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  for (const rect of orderedText) {
    const line = lines.find(candidate => sameVisualRow(candidate, rect));
    if (line) addInk(line, rect);
    else lines.push({ groupTop: rect.top, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      ...(finite(rect.baselineY) ? { baselineY: rect.baselineY } : {}) });
  }

  for (const symbol of inlineSymbolRects ?? []) {
    const rect = symbol?.rect ?? symbol;
    if (!rect || ![rect.top, rect.bottom, rect.left, rect.right].every(finite)) continue;
    const hasLineTop = finite(symbol?.lineTop);
    const hasBaseline = finite(symbol?.baselineY);
    let line = null;
    if (hasBaseline) {
      line = lines.find(candidate => finite(candidate.baselineY)
        && Math.abs(candidate.baselineY - symbol.baselineY) <= tolerancePx)
        ?? lines.find(candidate => Math.abs(candidate.bottom - symbol.baselineY) <= tolerancePx)
        ?? null;
    }
    if (!line && hasLineTop) {
      line = lines
        .filter(candidate => symbol.lineTop >= candidate.top - tolerancePx
          && symbol.lineTop <= candidate.bottom + tolerancePx)
        .sort((a, b) => Math.abs(a.groupTop - symbol.lineTop) - Math.abs(b.groupTop - symbol.lineTop))[0]
        ?? lines.find(candidate => Math.abs(candidate.groupTop - symbol.lineTop) <= tolerancePx)
        ?? null;
    } else {
      line ??= lines.find(candidate => Math.abs(candidate.groupTop - rect.top) <= tolerancePx) ?? null;
    }
    if (line) addInk(line, rect);
    else {
      const groupTop = hasLineTop ? symbol.lineTop : hasBaseline ? symbol.baselineY : rect.top;
      lines.push({ groupTop, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    }
  }

  return lines.sort((a, b) => a.groupTop - b.groupTop || a.left - b.left);
}

/** Resolve the lab's acceptance label from current, matching PageRenderer evidence only. */
export function resolveStructuralCopyfitStatus(candidateStatus, measurement, runtimeBlocked = false, sourcePdfLineCount = null, underCompositionJustification = null) {
  const savedStatus = String(candidateStatus ?? '');
  if (savedStatus.startsWith('blocked') || savedStatus.startsWith('source-en-preserved')) return savedStatus;
  if (!measurement) return runtimeBlocked ? 'blocked-structural-review' : 'pending-live-validation';
  const geometricBlock = getStructuralCopyfitBlockStatus(measurement.structuralStatus, measurement.overflow, measurement.collision);
  if (geometricBlock) return geometricBlock;
  const lineCountGate = getCopyfitVisualLineGateStatus(sourcePdfLineCount, measurement.lineCount, underCompositionJustification);
  if (lineCountGate !== 'line-count-pass') return lineCountGate;
  return 'fit-awaiting-human-review';
}

function boundaryFor(fragments) {
  const boundaries = fragments
    .filter(fragment => finite(fragment.availableX) && finite(fragment.availableWidth) && fragment.availableWidth > 0)
    .map(fragment => fragment.availableX + fragment.availableWidth);
  return boundaries.length ? Math.max(...boundaries) : null;
}

function boundaryRangeFor(fragments) {
  const boundaries = fragments
    .filter(fragment => finite(fragment.availableX) && finite(fragment.availableWidth) && fragment.availableWidth > 0)
    .map(fragment => fragment.availableX + fragment.availableWidth);
  return boundaries.length ? { min: Math.min(...boundaries), max: Math.max(...boundaries) } : null;
}

function markerRows(rows) {
  return rows.flatMap((row, rowIndex) => row.fragments.flatMap(fragment => {
    const kind = markerKind(fragment.normalizedText);
    return kind ? [{ rowIndex, row, fragment, kind }] : [];
  }));
}

function hasEmbeddedMarker(fragments) {
  return fragments.some(fragment => MARKER_PREFIX.test(fragment.normalizedText));
}

/** Analyze one source sidecar block without inferring a universal indent. */
export function analyzeSourceBlock(block, options = {}) {
  const allFragments = visualFragments(block);
  const fragments = allFragments.filter(fragment => !(fragment.rasterizedDuplicate
    && (!fragment.rasterizedDuplicateLanguage || fragment.rasterizedDuplicateLanguage === 'all' || fragment.rasterizedDuplicateLanguage === 'en')));
  const rows = visualRows(fragments);
  const plainText = fragments.map(fragment => fragment.text).join(' ');
  const markers = markerRows(rows);
  const blockBox = Array.isArray(block.bbox) ? block.bbox : null;
  const base = {
    blockId: block.id ?? null,
    blockIndex: Number.isInteger(options.blockIndex) ? options.blockIndex : null,
    text: normalize(plainText).slice(0, 180),
    lineCount: rows.length,
    bbox: blockBox,
  };

  if (block.hiddenFromPage || block.artworkOnly) {
    return result('not-rendered', 'source-only-hidden', ['PageRenderer não pinta este bloco no Viewer padrão'], base);
  }

  if (allFragments.length > 0 && fragments.length === 0) {
    return result('not-rendered', 'rasterized-source-duplicate', ['texto extraído é suprimido no Viewer de leitura por já estar rasterizado na arte'], base);
  }

  if (fragments.length > 0 && fragments.every(fragment => fragment.direction
    && Math.abs(fragment.direction[0]) < 0.001 && Math.abs(Math.abs(fragment.direction[1]) - 1) < 0.001)) {
    return result('exception', 'rotated-label', ['texto vertical/rotacionado usa geometria própria; não aplicar alinhamento de prosa/lista'], base);
  }

  if (/IMPORTANT\s*:/iu.test(plainText) || plainText.includes('\uf07e')) {
    return result('exception', 'important-callout', ['caixa com ícone/label e inset próprios; não aplicar contrato de lista simples'], {
      ...base,
      lineOriginsPt: rows.map(row => Number(row.left.toFixed(2))),
      rightBoundaryPt: boundaryFor(fragments),
    });
  }

  if (hasEmbeddedMarker(fragments)) {
    return result('review-required', 'embedded-or-composite-marker', ['marcador e texto compartilham um run; o avanço real do marcador não está separado no sidecar'], {
      ...base,
      markerCandidates: markers.length,
      lineOriginsPt: rows.map(row => Number(row.left.toFixed(2))),
    });
  }

  if (markers.length) {
    const itemResults = [];
    for (const [markerIndex, marker] of markers.entries()) {
      const nextMarker = markers[markerIndex + 1];
      const endRowIndex = nextMarker?.rowIndex ?? rows.length;
      const itemRows = rows.slice(marker.rowIndex, endRowIndex);
      const sameBaselineBody = marker.row.fragments.filter(fragment => fragment !== marker.fragment
        && fragment.bbox[0] >= marker.fragment.bbox[0]);
      const bodyRows = itemRows.flatMap((row, index) => {
        if (index === 0) return sameBaselineBody.length ? [{ row, fragments: sameBaselineBody }] : [];
        return [{ row, fragments: row.fragments.filter(fragment => !markerKind(fragment.normalizedText)) }];
      }).filter(entry => entry.fragments.length > 0);
      if (!bodyRows.length || !sameBaselineBody.length) {
        itemResults.push(result('review-required', 'separated-list', ['não foi possível parear marcador e primeira linha do corpo no mesmo baseline'], {
          markerKind: marker.kind,
          markerXPt: marker.fragment.bbox[0],
        }));
        continue;
      }

      const bodyStartByRow = bodyRows.map(({ fragments: rowFragments }) => Math.min(...rowFragments.map(fragment => fragment.bbox[0])));
      const firstBody = sameBaselineBody;
      const expectedBodyStartXPt = Math.min(...firstBody.map(fragment => fragment.bbox[0]));
      const bodyRights = bodyRows.map(({ fragments: rowFragments }) => Math.max(...rowFragments.map(fragment => fragment.bbox[2])));
      const bodyFragments = bodyRows.flatMap(entry => entry.fragments);
      const boundaryRange = boundaryRangeFor(bodyFragments);
      if (boundaryRange === null) {
        itemResults.push(result('review-required', 'separated-list', ['sidecar não informa a borda útil da coluna'], {
          markerKind: marker.kind,
          markerXPt: marker.fragment.bbox[0],
        }));
        continue;
      }
      const boundarySpreadPt = boundaryRange.max - boundaryRange.min;
      if (boundarySpreadPt > SOURCE_TOLERANCE_PT) {
        itemResults.push(result('review-required', 'separated-list', ['a borda direita varia entre linhas; não é seguro inferir uma única largura de coluna'], {
          markerKind: marker.kind,
          markerXPt: marker.fragment.bbox[0],
          rightBoundaryRangePt: [Number(boundaryRange.min.toFixed(2)), Number(boundaryRange.max.toFixed(2))],
          rightBoundarySpreadPt: Number(boundarySpreadPt.toFixed(2)),
        }));
        continue;
      }
      itemResults.push(validateHangingIndent({
        marker: { leftPt: marker.fragment.bbox[0], rightPt: marker.fragment.bbox[2] },
        expectedBodyStartXPt,
        bodyLineStartsPt: bodyStartByRow,
        bodyLineRightsPt: bodyRights,
        rightBoundaryPt: boundaryRange.min,
      }));
    }

    const markerStart = markers[0].rowIndex;
    const proseBeforeList = rows.slice(0, markerStart).some(row => row.fragments.some(fragment => !markerKind(fragment.normalizedText)));
    const containsExample = /\bExample\s*\d*:/iu.test(plainText);
    const bodyOrigins = itemResults.flatMap(item => item.bodyLineStartsPt ?? []);
    const originClusters = new Set(bodyOrigins.map(x => Math.round(x / SOURCE_TOLERANCE_PT)));
    const mixedFlow = proseBeforeList || containsExample || originClusters.size > 1;
    if (mixedFlow) {
      return result('review-required', 'mixed-or-hierarchical-list', [
        ...(proseBeforeList ? ['bloco mistura prosa anterior e lista sem relação pai/filho explícita'] : []),
        ...(containsExample ? ['item contém subestrutura Example; não equivale ao contrato de lista simples'] : []),
        ...(originClusters.size > 1 ? ['mais de uma origem de corpo sugere níveis ou subfluxos diferentes'] : []),
      ], { ...base, markerCandidates: markers.length, items: itemResults });
    }
    const status = itemResults.some(item => item.status === 'suspect') ? 'suspect'
      : itemResults.every(item => item.status === 'compatible') ? 'compatible' : 'review-required';
    return result(status, markers.some(marker => marker.kind !== markers[0].kind) ? 'mixed-list' : 'separated-list',
      itemResults.flatMap(item => item.reasons), { ...base, markerCandidates: markers.length, items: itemResults });
  }

  const boundaryRange = boundaryRangeFor(fragments);
  const boundary = boundaryRange?.min ?? null;
  const starts = rows.map(row => row.left);
  const spread = starts.length > 1 ? Math.max(...starts) - Math.min(...starts) : 0;
  const maxSize = Math.max(0, ...fragments.map(fragment => fragment.size ?? 0));
  const shortSingleLine = rows.length <= 1 && normalize(plainText).length <= 70;
  const role = maxSize >= 14 || shortSingleLine ? 'heading-or-label' : 'paragraph';
  if (boundaryRange && boundaryRange.max - boundaryRange.min > SOURCE_TOLERANCE_PT) {
    return result('review-required', role, ['a borda direita varia entre linhas; não é seguro inferir uma única largura de coluna'], {
      ...base,
      rightBoundaryRangePt: [Number(boundaryRange.min.toFixed(2)), Number(boundaryRange.max.toFixed(2))],
      rightBoundarySpreadPt: Number((boundaryRange.max - boundaryRange.min).toFixed(2)),
      alignmentSpreadPt: Number(spread.toFixed(2)),
    });
  }
  const rightOverflow = boundary === null ? [] : rows.filter(row => row.right > boundary + SOURCE_TOLERANCE_PT);
  if (rightOverflow.length) return result('suspect', role, ['texto ultrapassa o limite direito disponível no sidecar; requer confronto visual com PDF/PageRenderer'], {
    ...base,
    rightBoundaryPt: boundary,
    rightOverflowRows: rightOverflow.map(row => ({ baselinePt: Number(row.baseline.toFixed(2)), rightPt: Number(row.right.toFixed(2)) })),
    alignmentSpreadPt: Number(spread.toFixed(2)),
  });
  if (spread > SOURCE_TOLERANCE_PT) return result('review-required', role, ['origens de linha variam; pode ser centralização, recuo intencional ou fluxo misto'], {
    ...base,
    rightBoundaryPt: boundary,
    alignmentSpreadPt: Number(spread.toFixed(2)),
  });
  return result('compatible', role, [], { ...base, rightBoundaryPt: boundary, alignmentSpreadPt: Number(spread.toFixed(2)) });
}

function lineBoxes(block) {
  return visualRows(visualFragments(block)
    .filter(fragment => !(fragment.rasterizedDuplicate
      && (!fragment.rasterizedDuplicateLanguage || fragment.rasterizedDuplicateLanguage === 'all' || fragment.rasterizedDuplicateLanguage === 'en')))
  ).map(row => ({ left: row.left, right: row.right, top: row.top, bottom: row.bottom }));
}

/** Read-only bookwide sidecar analysis; compatible means source geometry only. */
export function analyzeSourcePages(pages) {
  const counts = { compatible: 0, suspect: 0, 'review-required': 0, exception: 0, 'not-rendered': 0 };
  const roles = {};
  const familyCounts = {};
  const candidates = [];
  const collisions = new Map();
  const artworkObstacleCandidates = [];
  let blockCount = 0;
  let renderedBlockCount = 0;
  let markerCandidateRowCount = 0;
  const analyzedPages = pages.map(page => {
    const blockResults = (page.blocks ?? []).map((block, blockIndex) => {
      blockCount += 1;
      const analysis = analyzeSourceBlock(block, { blockIndex });
      counts[analysis.status] += 1;
      if (analysis.status !== 'not-rendered') renderedBlockCount += 1;
      roles[analysis.role] = (roles[analysis.role] ?? 0) + 1;
      const family = familyCounts[analysis.role] ??= { examined: 0, compatible: 0, suspect: 0, 'review-required': 0, exception: 0, 'not-rendered': 0 };
      family.examined += 1;
      family[analysis.status] += 1;
      if (analysis.role.includes('list')) markerCandidateRowCount += analysis.markerCandidates ?? 0;
      return { block, analysis };
    });
    const visibleLines = blockResults.filter(({ analysis }) => analysis.status !== 'not-rendered')
      .flatMap(({ block, analysis }) => lineBoxes(block).map(box => ({ ...box, blockId: block.id, blockIndex: analysis.blockIndex })))
      .sort((a, b) => a.top - b.top || a.left - b.left);
    const visibleBlockRows = blockResults.filter(({ analysis }) => analysis.status !== 'not-rendered').map(({ block, analysis }) => ({
      block,
      analysis,
      boxes: lineBoxes(block),
    }));
    for (const entry of visibleBlockRows) {
      if (!entry.analysis.role.includes('list') || entry.boxes.length === 0) continue;
      const inkBottom = Math.max(...entry.boxes.map(box => box.bottom));
      const sameColumnNext = visibleBlockRows.filter(other => other.block !== entry.block && other.boxes.length)
        .map(other => ({
          other,
          top: Math.min(...other.boxes.map(box => box.top)),
          left: Math.min(...other.boxes.map(box => box.left)),
          right: Math.max(...other.boxes.map(box => box.right)),
        }))
        .filter(candidate => candidate.top >= inkBottom - 0.25
          && Math.max(0, Math.min(Math.max(...entry.boxes.map(box => box.right)), candidate.right)
            - Math.max(Math.min(...entry.boxes.map(box => box.left)), candidate.left)) > 4)
        .sort((a, b) => a.top - b.top)[0];
      entry.analysis.neighborClearancePt = sameColumnNext
        ? Number((sameColumnNext.top - inkBottom).toFixed(2)) : null;
      entry.analysis.nextBlockId = sameColumnNext?.other.block.id ?? null;
    }

    const images = (page.images ?? []).filter(image => Array.isArray(image.bbox) && image.bbox.length === 4
      && image.role !== 'background');
    const pageArea = (page.width ?? 0) * (page.height ?? 0);
    for (const { block, analysis, boxes } of visibleBlockRows) {
      if (!analysis.role.includes('list')) continue;
      for (const image of images) {
        const [left, top, right, bottom] = image.bbox;
        const imageArea = Math.max(0, right - left) * Math.max(0, bottom - top);
        if (!imageArea || (pageArea > 0 && imageArea > pageArea * 0.8)) continue;
        const intersects = boxes.some(box => Math.min(box.right, right) - Math.max(box.left, left) > 1.5
          && Math.min(box.bottom, bottom) - Math.max(box.top, top) > 1.5);
        if (intersects) artworkObstacleCandidates.push({ page: page.page_number, blockId: block.id, imageRole: image.role ?? 'unknown', imageBBox: image.bbox });
      }
    }
    for (let index = 0; index < visibleLines.length; index += 1) {
      const a = visibleLines[index];
      for (let next = index + 1; next < visibleLines.length; next += 1) {
        const b = visibleLines[next];
        if (b.top >= a.bottom - 0.25) break;
        if (a.blockId === b.blockId) continue;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // Text bbox descenders/ascenders often touch at adjacent baselines;
        // require a visible-scale intersection before surfacing a candidate.
        if (overlapX <= 1.25 || overlapY <= 2.25) continue;
        // Block IDs are local to a page. Keep the page identity in the key so
        // the same pair of local IDs on another page remains a distinct
        // intersection candidate in this book-wide inventory.
        const key = [String(page.page_number), ...[String(a.blockId), String(b.blockId)].sort()].join('|');
        if (!collisions.has(key)) collisions.set(key, { page: page.page_number, blocks: [a.blockId, b.blockId], overlapXPt: Number(overlapX.toFixed(2)), overlapYPt: Number(overlapY.toFixed(2)) });
      }
    }
    return { page: page.page_number, blocks: blockResults.map(item => item.analysis) };
  });
  for (const page of analyzedPages) {
    for (const analysis of page.blocks) {
      if (analysis.status === 'suspect' || analysis.status === 'review-required') {
        candidates.push({ page: page.page, ...analysis });
      }
    }
  }
  return {
    coverage: { pagesRead: pages.length, blocksExamined: blockCount },
    renderedBlocksExamined: renderedBlockCount,
    counts,
    roles,
    familyCounts,
    markerCandidateRowCount,
    sourceTextOverlapCandidates: [...collisions.values()],
    artworkObstacleCandidates,
    structuralReviewCandidates: candidates,
    pages: analyzedPages,
  };
}
