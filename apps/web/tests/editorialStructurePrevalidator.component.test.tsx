import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSourceBlock, analyzeSourcePages, classifyCopyfitVisualLines, classifySemanticWidthPreflight, getCopyfitLineCountBlockStatus, getCopyfitVisualLineGateStatus, getStructuralCopyfitBlockStatus, groupPageRendererVisualLines, hasVisibleGeometryOverflow, resolveSemanticTextFlowCorridor, resolveStructuralCopyfitStatus, searchSemanticFlowWidth, validateHangingIndent, validateParagraphFlow } from '../src/editorialStructurePrevalidator.mjs';

function loadPage(pageNumber: number) {
  const key = String(pageNumber).padStart(3, '0');
  return JSON.parse(readFileSync(join(process.cwd(), `public/pages/page_${key}/page_${key}_dom.json`), 'utf8')) as any;
}

describe('editorial structure prevalidator', () => {
  it('reproduces the p.14 hanging-indent regression and accepts its source-aligned correction', () => {
    const marker = { leftPt: 86.173, rightPt: 96.181 };
    const bad = validateHangingIndent({
      marker,
      expectedBodyStartXPt: 104.173,
      bodyLineStartsPt: [86.173, 86.17, 86.18, 86.17],
      bodyLineRightsPt: [370, 399, 392, 402],
      rightBoundaryPt: 402.259,
    });
    const corrected = validateHangingIndent({
      marker,
      expectedBodyStartXPt: 104.173,
      bodyLineStartsPt: [104.173, 104.17, 104.17, 104.18],
      bodyLineRightsPt: [386, 399, 392, 402],
      rightBoundaryPt: 402.259,
    });
    expect(bad.status).toBe('suspect');
    expect(bad.reasons).toContain('corpo invade ou quase toca a área de tinta do marcador');
    expect(corrected.status).toBe('compatible');
    expect(corrected.usefulBodyWidthPt).toBeCloseTo(298.09, 2);
    expect(getStructuralCopyfitBlockStatus(bad.status)).toBe('blocked-structural-error');
    expect(getStructuralCopyfitBlockStatus(corrected.status)).toBeNull();
  });

  it('accepts the p.14 source and the ordinary p.78 bullet from occurrence-specific geometry', () => {
    const page14 = loadPage(14);
    const p14 = analyzeSourceBlock(page14.blocks[1], { blockIndex: 1 });
    const page78 = loadPage(78);
    const p78 = analyzeSourceBlock(page78.blocks[3], { blockIndex: 3 });
    expect(p14.status).toBe('compatible');
    expect(p14.role).toBe('separated-list');
    expect(p78.status).toBe('compatible');
    expect(p78.items?.[0].usefulBodyWidthPt).toBeGreaterThan(0);
    expect(p78.items?.[0].expectedBodyStartXPt).not.toBe(104.173);
  });

  it('requires review when a list occurrence reports inconsistent column right edges', () => {
    const inconsistentColumn = analyzeSourceBlock({ id: 'variable-column-list', bbox: [10, 10, 210, 40], lines: [
      { bbox: [10, 10, 100, 20], availableX: 10, availableWidth: 180, spans: [
        { text: '•', bbox: [10, 10, 15, 20], origin: [10, 19], size: 10 },
        { text: 'Body', bbox: [25, 10, 100, 20], origin: [25, 19], size: 10 },
      ] },
      { bbox: [25, 21, 150, 31], availableX: 10, availableWidth: 200, spans: [
        { text: 'Continuation', bbox: [25, 21, 150, 31], origin: [25, 30], size: 10 },
      ] },
    ] });
    expect(inconsistentColumn.status).toBe('review-required');
    expect(inconsistentColumn.items?.[0].rightBoundarySpreadPt).toBe(20);
    expect(inconsistentColumn.items?.[0].rightBoundaryRangePt).toEqual([190, 210]);
    expect(inconsistentColumn.items?.[0].reasons).toContain('a borda direita varia entre linhas; não é seguro inferir uma única largura de coluna');
  });

  it('keeps mixed p.22 hierarchy, embedded markers, and IMPORTANT in their own review/exception paths', () => {
    const page22 = loadPage(22);
    const hierarchical = analyzeSourceBlock(page22.blocks[1], { blockIndex: 1 });
    expect(hierarchical.status).toBe('review-required');
    expect(hierarchical.role).toBe('mixed-or-hierarchical-list');

    const embedded = analyzeSourceBlock({
      id: 'embedded-bullet',
      bbox: [10, 10, 200, 30],
      lines: [{ bbox: [10, 10, 170, 22], availableX: 10, availableWidth: 190,
        spans: [{ text: '•\tA same-line bullet run', bbox: [10, 10, 170, 22], origin: [10, 20], size: 10 }] }],
    });
    expect(embedded.status).toBe('review-required');
    expect(embedded.role).toBe('embedded-or-composite-marker');

    const page14 = loadPage(14);
    const important = analyzeSourceBlock(page14.blocks[2], { blockIndex: 2 });
    expect(important.status).toBe('exception');
    expect(important.role).toBe('important-callout');

    const p34 = loadPage(34);
    const rasterizedMicrocard = analyzeSourceBlock(p34.blocks.find((block: any) => block.id === 'block_2645'));
    expect(rasterizedMicrocard.status).toBe('not-rendered');
    expect(rasterizedMicrocard.role).toBe('rasterized-source-duplicate');
  });

  it('does not interpret prose, headings, or deliberate line indentation as list failures', () => {
    const heading = analyzeSourceBlock({ id: 'heading', bbox: [20, 10, 190, 30], lines: [
      { bbox: [20, 10, 190, 30], availableX: 10, availableWidth: 190, spans: [{ text: 'Phase Summary', bbox: [20, 10, 190, 30], origin: [20, 25], size: 18 }] },
    ] });
    const paragraph = analyzeSourceBlock({ id: 'paragraph', bbox: [10, 10, 190, 40], lines: [
      { bbox: [10, 10, 170, 22], availableX: 10, availableWidth: 180, spans: [{ text: 'Ordinary prose line one.', bbox: [10, 10, 170, 22], origin: [10, 20], size: 10 }] },
      { bbox: [10, 21, 120, 33], availableX: 10, availableWidth: 180, spans: [{ text: 'Ordinary prose line two.', bbox: [10, 21, 120, 33], origin: [10, 31], size: 10 }] },
    ] });
    const intentionalIndent = analyzeSourceBlock({ id: 'indented-paragraph', bbox: [10, 10, 190, 40], lines: [
      { bbox: [20, 10, 170, 22], availableX: 10, availableWidth: 180, spans: [{ text: 'Intentional inset first line.', bbox: [20, 10, 170, 22], origin: [20, 20], size: 10 }] },
      { bbox: [10, 21, 120, 33], availableX: 10, availableWidth: 180, spans: [{ text: 'Continuation returns to column.', bbox: [10, 21, 120, 33], origin: [10, 31], size: 10 }] },
    ] });
    expect(heading.status).toBe('compatible');
    expect(heading.role).toBe('heading-or-label');
    expect(paragraph.status).toBe('compatible');
    expect(intentionalIndent.status).toBe('review-required');
    expect(intentionalIndent.status).not.toBe('suspect');

    expect(validateParagraphFlow({ sourceLineStartsPt: [86, 86.2], actualLineStartsPt: [86.1, 86.2], textAlign: 'left' }).status)
      .toBe('compatible');
    expect(validateParagraphFlow({ sourceLineStartsPt: [86, 86], actualLineStartsPt: [91, 91], textAlign: 'left' }).status)
      .toBe('suspect');
    expect(validateParagraphFlow({ sourceLineStartsPt: [86, 95], actualLineStartsPt: [86, 86], textAlign: 'left' }).status)
      .toBe('review-required');
    expect(validateParagraphFlow({ sourceLineStartsPt: [86, 86], actualLineStartsPt: [86, 86], textAlign: 'center' }).status)
      .toBe('review-required');
    expect(getStructuralCopyfitBlockStatus('review-required')).toBe('blocked-structural-review');
    expect(getStructuralCopyfitBlockStatus('suspect')).toBe('blocked-structural-error');
    expect(getStructuralCopyfitBlockStatus('compatible')).toBeNull();
    expect(getStructuralCopyfitBlockStatus('compatible', false, true)).toBe('blocked-live-overflow');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', null)).toBe('pending-live-validation');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', {
      structuralStatus: 'compatible', overflow: false, collision: false, lineCount: 3,
    }, false, 3)).toBe('fit-awaiting-human-review');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', {
      structuralStatus: 'review-required', overflow: false, collision: false, lineCount: 3,
    }, false, 3)).toBe('blocked-structural-review');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', {
      structuralStatus: 'compatible', overflow: true, collision: false, lineCount: 4,
    }, false, 3)).toBe('blocked-live-overflow');
    expect(resolveStructuralCopyfitStatus('blocked-editorial', {
      structuralStatus: 'compatible', overflow: false, collision: false, lineCount: 3,
    }, false, 3)).toBe('blocked-editorial');
  });

  it('uses original PDF visual baselines and the PageRenderer line count for EXACT, UNDER, and OVER', () => {
    const page14 = loadPage(14);
    const phaseOne = page14.blocks.find((block: any) => block.id === 'block_15');
    expect(phaseOne).toBeDefined();
    const sourcePdfLineCount = analyzeSourceBlock(phaseOne).lineCount;
    expect(sourcePdfLineCount).toBe(7);

    const exactMeasurement = { structuralStatus: 'compatible' as const, overflow: false, collision: false, lineCount: 7 };
    const underMeasurement = { ...exactMeasurement, lineCount: 6 };
    const overMeasurement = { ...exactMeasurement, lineCount: 8 };
    expect(classifyCopyfitVisualLines(sourcePdfLineCount, exactMeasurement.lineCount)).toBe('EXACT');
    expect(classifyCopyfitVisualLines(sourcePdfLineCount, underMeasurement.lineCount)).toBe('UNDER');
    expect(classifyCopyfitVisualLines(sourcePdfLineCount, overMeasurement.lineCount)).toBe('OVER');
    expect(getCopyfitVisualLineGateStatus(sourcePdfLineCount, exactMeasurement.lineCount)).toBe('line-count-pass');
    expect(getCopyfitVisualLineGateStatus(sourcePdfLineCount, underMeasurement.lineCount))
      .toBe('pending-under-composition-justification');
    expect(getCopyfitVisualLineGateStatus(sourcePdfLineCount, underMeasurement.lineCount,
      'The shorter copy preserves the full rule and visual hierarchy.')).toBe('line-count-pass');
    expect(getCopyfitVisualLineGateStatus(sourcePdfLineCount, overMeasurement.lineCount)).toBe('blocked-line-count-over');
    expect(getCopyfitVisualLineGateStatus(sourcePdfLineCount, 0)).toBe('pending-line-count-measurement');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', exactMeasurement, false, sourcePdfLineCount))
      .toBe('fit-awaiting-human-review');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', underMeasurement, false, sourcePdfLineCount))
      .toBe('pending-under-composition-justification');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', underMeasurement, false, sourcePdfLineCount,
      'A redação mais concisa mantém todos os atores e condições; estilos, recuos e áreas ocupadas foram conferidos.'))
      .toBe('fit-awaiting-human-review');
    expect(getCopyfitLineCountBlockStatus(sourcePdfLineCount, 6)).toBeNull();
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', overMeasurement, false, sourcePdfLineCount))
      .toBe('blocked-line-count-over');
    expect(getCopyfitLineCountBlockStatus(sourcePdfLineCount, 8)).toBe('blocked-line-count-over');
  });

  it('derives evidence-bounded corridors for p.100, p.14 body and centered p.2 while blocking unsafe p.14 heading expansion', () => {
    const evidence = (owner: string) => [
      { kind: 'semantic-parent' as const, owner },
      { kind: 'source-baselines' as const },
      { kind: 'table-grid' as const },
      { kind: 'background-image-boundary' as const },
    ];
    const boundaries = (left: number, right: number, prefix: string) => ({
      leftBoundaryEvidence: [
        { valuePt: left, kind: 'source-baselines' as const, sourceId: `${prefix}:source-pdf` },
        { valuePt: left, kind: 'visual-boundary' as const, sourceId: `${prefix}:viewer` },
      ],
      rightBoundaryEvidence: [
        { valuePt: right, kind: 'table-grid' as const, sourceId: `${prefix}:source-pdf` },
        { valuePt: right, kind: 'background-image-boundary' as const, sourceId: `${prefix}:viewer` },
      ],
    });

    const p100 = loadPage(100);
    const p100Title = p100.blocks.find((block: any) => block.id === 'block_20');
    const p100Table12 = p100.blocks.find((block: any) => block.id === 'block_30');
    const p100Corridor = resolveSemanticTextFlowCorridor({
      currentFrame: {
        // Live PageRenderer frame measured from the 2026-10-17 100%/200% receipts.
        // The PDF text bbox is only the ink extent and is much narrower than its flow frame.
        xPt: 57.272555, yPt: 50.166977, widthPt: 335.644044, heightPt: 16.17166,
      },
      flowRegion: {
        id: 'p100-table10-title-band', semanticOwner: 'p100-table10',
        ...boundaries(p100Title.bbox[0], 391.52, 'p100-table10'),
        paddingLeftPt: 0, paddingRightPt: 0,
        textBandTopPt: p100Title.bbox[1], textBandBottomPt: p100Title.bbox[3],
        evidence: evidence('p100-table10'),
      },
      obstacles: [{
        id: 'p100-table12-title', semanticRelation: 'independent-flow-owner',
        bboxPt: p100Table12.bbox, requiredGapPt: 40.205,
      }],
    });
    expect(p100Corridor.status).toBe('CURRENT_FRAME_WITHIN_BOUNDARY_TOLERANCE');
    expect(p100Corridor.confidence).toBe('high');
    expect(p100Corridor.maxWidthPt).toBeCloseTo(334.2474, 2);
    expect(p100Corridor.frameOverhangPt.right).toBeCloseTo(1.3966, 2);
    expect(p100Corridor.boundaryTolerancePt).toBe(1.5);
    expect(p100Corridor.maximumFrame.xPt + p100Corridor.maximumFrame.widthPt).toBeLessThan(p100Table12.bbox[0]);

    const outsideTolerance = resolveSemanticTextFlowCorridor({
      currentFrame: { xPt: 50, yPt: 20, widthPt: 101.6, heightPt: 12 },
      flowRegion: {
        id: 'measured-boundary-fixture', semanticOwner: 'owner',
        leftBoundaryEvidence: [
          { valuePt: 50, kind: 'source-baselines' as const, sourceId: 'fixture:pdf-left' },
          { valuePt: 50, kind: 'visual-boundary' as const, sourceId: 'fixture:viewer-left' },
        ],
        rightBoundaryEvidence: [
          { valuePt: 150, kind: 'table-grid' as const, sourceId: 'fixture:pdf-right' },
          { valuePt: 150, kind: 'background-image-boundary' as const, sourceId: 'fixture:viewer-right' },
        ],
        paddingLeftPt: 0, paddingRightPt: 0, textBandTopPt: 20, textBandBottomPt: 32,
        evidence: evidence('owner'),
      },
    });
    expect(outsideTolerance.status).toBe('GEOMETRY_UNCERTAIN');
    expect(outsideTolerance.frameOverhangPt.right).toBeCloseTo(1.6, 5);

    const p14 = loadPage(14);
    const p14Frames = JSON.parse(readFileSync(join(process.cwd(), 'public/pages/page_014/layout_frames.json'), 'utf8'));
    const p14Heading = p14.blocks.find((block: any) => block.id === 'block_47');
    const p14Body = p14.blocks.find((block: any) => block.id === 'block_29');
    const p14HeadingCorridor = resolveSemanticTextFlowCorridor({
      currentFrame: {
        xPt: p14Frames.block_47.x, yPt: p14Heading.bbox[1],
        widthPt: p14Frames.block_47.width, heightPt: p14Heading.bbox[3] - p14Heading.bbox[1],
      },
      flowRegion: {
        id: 'p14-right-column-reading-encounters-heading', semanticOwner: 'p14-reading-encounters-heading',
        ...boundaries(p14Frames.block_47.x, p14Frames.block_47.x + p14Frames.block_47.width, 'p14-reading-encounters-heading'),
        paddingLeftPt: 0, paddingRightPt: 0,
        textBandTopPt: p14Heading.bbox[1], textBandBottomPt: p14Heading.bbox[3],
        evidence: [
          { kind: 'semantic-parent' as const, owner: 'p14-reading-encounters-heading' },
          { kind: 'source-baselines' as const, detail: 'PDF block_47 baseline and source bbox' },
          { kind: 'column-grid' as const, detail: 'Right-column sibling frames in layout_frames.json' },
        ],
      },
      obstacles: [{
        id: 'p14-heading-rule-and-flourish', semanticRelation: 'independent-flow-owner',
        bboxPt: [416.049, 118.305, 734.819, 141.209], requiredGapPt: 4,
      }],
    });
    const p14BodyCorridor = resolveSemanticTextFlowCorridor({
      currentFrame: {
        xPt: p14Body.lines[0].availableX, yPt: p14Body.bbox[1],
        widthPt: p14Body.lines[0].availableWidth, heightPt: p14Body.bbox[3] - p14Body.bbox[1],
      },
      flowRegion: {
        id: 'p14-right-column-intro-paragraph', semanticOwner: 'p14-reading-encounters-intro',
        leftBoundaryEvidence: [
          { valuePt: p14Body.lines[0].availableX, kind: 'source-baselines' as const, sourceId: 'page014:pdf:block29-line0' },
          { valuePt: p14Frames.block_33.x, kind: 'sibling-alignment' as const, sourceId: 'page014:layout-frames:block33' },
          { valuePt: p14Frames.block_47.x, kind: 'column-grid' as const, sourceId: 'page014:layout-frames:block47' },
        ],
        rightBoundaryEvidence: [
          { valuePt: p14Frames.block_33.x + p14Frames.block_33.width, kind: 'column-grid' as const, sourceId: 'page014:layout-frames:block33' },
          { valuePt: p14Frames.block_44.x + p14Frames.block_44.width, kind: 'sibling-alignment' as const, sourceId: 'page014:layout-frames:block44' },
          { valuePt: p14Frames.block_47.x + p14Frames.block_47.width, kind: 'visual-boundary' as const, sourceId: 'page014:layout-frames:block47' },
        ],
        paddingLeftPt: 0, paddingRightPt: 0,
        textBandTopPt: p14Body.bbox[1], textBandBottomPt: p14Body.bbox[3],
        evidence: [
          { kind: 'semantic-parent' as const, owner: 'p14-reading-encounters-intro' },
          { kind: 'source-baselines' as const, detail: 'PDF block_29 baseline positions and available width' },
          { kind: 'sibling-alignment' as const, detail: 'Repeated right-column left edge in blocks 33, 44 and 47' },
          { kind: 'column-grid' as const, detail: 'Repeated right-column right edge in layout_frames.json' },
        ],
      },
    });
    expect(p14HeadingCorridor.status).toBe('GEOMETRY_UNCERTAIN');
    expect(p14HeadingCorridor.automaticProposalAllowed).toBe(false);
    expect(p14HeadingCorridor.reasons.join(' ')).toContain('intersects the current left-anchored frame');
    expect(p14BodyCorridor.confidence).toBe('high');
    expect(p14BodyCorridor.maximumFrame.widthPt).toBeCloseTo(318.331, 2);

    const p2 = loadPage(2);
    const p2Quote = p2.blocks.find((block: any) => block.id === 'block_21');
    const p2Frames = JSON.parse(readFileSync(join(process.cwd(), 'public/pages/page_002/layout_frames.json'), 'utf8'));
    const p2Narrative = p2.blocks.find((block: any) => block.id === 'block_16');
    const p2Frame = p2Frames.block_21;
    const p2IntroFrame = p2Frames.block_12;
    const p2NarrativeLine = p2Narrative.lines[0];
    const center = p2Frame.x + p2Frame.width / 2;
    const p2Corridor = resolveSemanticTextFlowCorridor({
      currentFrame: {
        xPt: p2Frame.x, yPt: p2Quote.bbox[1], widthPt: p2Frame.width,
        heightPt: p2Quote.bbox[3] - p2Quote.bbox[1],
      },
      alignmentAnchor: 'center', centerAnchorPt: center,
      flowRegion: {
        id: 'p2-centered-narrative-quote', semanticOwner: 'p2-centered-quote',
        leftBoundaryEvidence: [
          { valuePt: p2IntroFrame.x, kind: 'column-grid' as const, sourceId: 'page002:layout-frames:block12' },
          { valuePt: p2NarrativeLine.availableX, kind: 'sibling-alignment' as const, sourceId: 'page002:pdf-dom:block16-line0' },
        ],
        rightBoundaryEvidence: [
          { valuePt: p2IntroFrame.x + p2IntroFrame.width, kind: 'column-grid' as const, sourceId: 'page002:layout-frames:block12' },
          { valuePt: p2NarrativeLine.availableX + p2NarrativeLine.availableWidth, kind: 'sibling-alignment' as const, sourceId: 'page002:pdf-dom:block16-line0' },
        ],
        paddingLeftPt: 0, paddingRightPt: 0,
        textBandTopPt: p2Quote.bbox[1], textBandBottomPt: p2Quote.bbox[3],
        evidence: [
          { kind: 'semantic-parent' as const, owner: 'p2-centered-quote' },
          { kind: 'source-baselines' as const, detail: 'The source quote remains centered on the paragraph anchor' },
          { kind: 'sibling-alignment' as const, detail: 'Adjacent narrative block shares the measured text column' },
          { kind: 'column-grid' as const, detail: 'Source paragraph frame defines the prose column bounds' },
        ],
      },
    });
    expect(p2Corridor.confidence).toBe('high');
    expect(p2Corridor.alignmentAnchor).toBe('center');
    expect(p2Corridor.preservedCenterAnchorPt).toBeCloseTo(center, 4);
    expect(p2Corridor.maximumFrame.xPt + p2Corridor.maximumFrame.widthPt / 2).toBeCloseTo(center, 4);
    expect(p2Corridor.maximumFrame.widthPt).toBeGreaterThan(p2Frame.width);
  });

  it('requires semantic ownership and a full-band measured gap before crossing whitespace', () => {
    const result = resolveSemanticTextFlowCorridor({
      currentFrame: { xPt: 50, yPt: 20, widthPt: 100, heightPt: 12 },
      flowRegion: {
        id: 'table-title', semanticOwner: 'table-10',
        leftBoundaryEvidence: [
          { valuePt: 50, kind: 'source-baselines', sourceId: 'fixture:pdf-left' },
          { valuePt: 50, kind: 'visual-boundary', sourceId: 'fixture:viewer-left' },
        ],
        rightBoundaryEvidence: [
          { valuePt: 500, kind: 'column-grid', sourceId: 'fixture:pdf-right' },
          { valuePt: 500, kind: 'page-margin', sourceId: 'fixture:viewer-right' },
        ],
        paddingLeftPt: 0, paddingRightPt: 0, textBandTopPt: 20, textBandBottomPt: 32,
        evidence: [
          { kind: 'semantic-parent', owner: 'table-10' },
          { kind: 'source-baselines' },
          { kind: 'column-grid' },
        ],
      },
      obstacles: [{
        id: 'neighbor-table', semanticRelation: 'independent-flow-owner',
        bboxPt: [250, 19, 400, 33], requiredGapPt: 40,
      }],
    });
    expect(result.confidence).toBe('high');
    expect(result.maximumFrame.rightPt).toBe(210);
    const missingGap = resolveSemanticTextFlowCorridor({
      currentFrame: { xPt: 50, yPt: 20, widthPt: 100, heightPt: 12 },
      flowRegion: {
        id: 'table-title', semanticOwner: 'table-10',
        leftBoundaryEvidence: [
          { valuePt: 50, kind: 'source-baselines', sourceId: 'fixture:pdf-left' },
          { valuePt: 50, kind: 'visual-boundary', sourceId: 'fixture:viewer-left' },
        ],
        rightBoundaryEvidence: [
          { valuePt: 500, kind: 'column-grid', sourceId: 'fixture:pdf-right' },
          { valuePt: 500, kind: 'page-margin', sourceId: 'fixture:viewer-right' },
        ],
        paddingLeftPt: 0, paddingRightPt: 0,
        evidence: [{ kind: 'semantic-parent', owner: 'table-10' }, { kind: 'source-baselines' }, { kind: 'column-grid' }],
      },
      obstacles: [{ id: 'neighbor-table', semanticRelation: 'independent-flow-owner', bboxPt: [250, 19, 400, 33] }],
    });
    expect(missingGap.status).toBe('GEOMETRY_UNCERTAIN');
    expect(missingGap.automaticProposalAllowed).toBe(false);
  });

  it('rejects boundary evidence duplicated under multiple labels from the same artifact', () => {
    const result = resolveSemanticTextFlowCorridor({
      currentFrame: { xPt: 50, yPt: 20, widthPt: 100, heightPt: 12 },
      flowRegion: {
        id: 'table-title', semanticOwner: 'table-10',
        leftBoundaryEvidence: [
          { valuePt: 50, kind: 'source-baselines', sourceId: 'same-pdf-measurement' },
          { valuePt: 50, kind: 'visual-boundary', sourceId: 'same-pdf-measurement' },
        ],
        rightBoundaryEvidence: [
          { valuePt: 500, kind: 'column-grid', sourceId: 'same-pdf-measurement' },
          { valuePt: 500, kind: 'page-margin', sourceId: 'same-pdf-measurement' },
        ],
        paddingLeftPt: 0, paddingRightPt: 0, textBandTopPt: 20, textBandBottomPt: 32,
        evidence: [
          { kind: 'semantic-parent', owner: 'table-10' },
          { kind: 'source-baselines' },
          { kind: 'column-grid' },
        ],
      },
    });
    expect(result.status).toBe('GEOMETRY_UNCERTAIN');
    expect(result.automaticProposalAllowed).toBe(false);
  });

  it('searches the smallest real-render width and keeps EXACT, UNDER, and remaining OVER distinct', async () => {
    const corridor = {
      confidence: 'high', automaticProposalAllowed: true, alignmentAnchor: 'left', maxWidthPt: 220,
      currentFrame: { xPt: 50, yPt: 10, widthPt: 100, heightPt: 12 },
    };
    const measured = (lineCount: number) => ({ lineCount, fontLoaded: true, geometryPass: true,
      textEscapesFrame: false, overflow: false, collision: false });
    const exact = await searchSemanticFlowWidth({
      corridor, sourceLineCount: 1, initialMeasurement: measured(2), maxProbes: 8, widthTolerancePt: 0.25,
      measureAtWidth: width => measured(width >= 160 ? 1 : 2),
    });
    expect(exact.status).toBe('WIDTH_RESOLVED');
    expect(exact.classification).toBe('EXACT');
    expect(exact.selectedWidthPt).toBeGreaterThanOrEqual(160);
    expect(exact.selectedWidthPt).toBeLessThan(161);

    const alreadyExact = await searchSemanticFlowWidth({
      corridor: { ...corridor, confidence: 'low', automaticProposalAllowed: false },
      sourceLineCount: 1,
      initialMeasurement: measured(1),
      measureAtWidth: () => { throw new Error('An already-EXACT frame must not be probed or widened'); },
    });
    expect(alreadyExact.status).toBe('EXACT');
    expect(alreadyExact.selectedFrame).toEqual(corridor.currentFrame);
    expect(alreadyExact.probes).toEqual([]);

    const under = await searchSemanticFlowWidth({
      corridor, sourceLineCount: 2, initialMeasurement: measured(1), measureAtWidth: () => measured(1),
    });
    expect(under.status).toBe('UNDER');
    expect(under.selectedWidthPt).toBe(100);
    expect(classifySemanticWidthPreflight({ sourceLineCount: 2, currentLineCount: 1 })).toBe('UNDER');

    const over = await searchSemanticFlowWidth({
      corridor, sourceLineCount: 1, initialMeasurement: measured(2), maxProbes: 4, measureAtWidth: () => measured(2),
    });
    expect(over.status).toBe('OVER_AFTER_SAFE_WIDTH');
    expect(classifySemanticWidthPreflight({ sourceLineCount: 1, currentLineCount: 2, corridor,
      testedWidthPt: 220, resolvedLineCount: 2 })).toBe('OVER_AFTER_SAFE_WIDTH');
  });

  it('returns the selected frame position while preserving center and right anchors', async () => {
    const measured = (lineCount: number) => ({ lineCount, fontLoaded: true, geometryPass: true,
      textEscapesFrame: false, overflow: false, collision: false });
    const center = await searchSemanticFlowWidth({
      corridor: { confidence: 'high', automaticProposalAllowed: true, alignmentAnchor: 'center',
        preservedCenterAnchorPt: 200, maxWidthPt: 220,
        currentFrame: { xPt: 150, yPt: 10, widthPt: 100, heightPt: 12 } },
      sourceLineCount: 1, initialMeasurement: measured(2),
      measureAtWidth: width => measured(width >= 160 ? 1 : 2),
    });
    expect(center.status).toBe('WIDTH_RESOLVED');
    expect(center.selectedFrame.xPt + center.selectedFrame.widthPt / 2).toBe(200);

    const right = await searchSemanticFlowWidth({
      corridor: { confidence: 'high', automaticProposalAllowed: true, alignmentAnchor: 'right', maxWidthPt: 220,
        currentFrame: { xPt: 100, yPt: 10, widthPt: 100, heightPt: 12 } },
      sourceLineCount: 1, initialMeasurement: measured(2),
      measureAtWidth: width => measured(width >= 160 ? 1 : 2),
    });
    expect(right.status).toBe('WIDTH_RESOLVED');
    expect(right.selectedFrame.xPt + right.selectedFrame.widthPt).toBe(200);
  });

  it('ties every V3 source baseline count to one matching PDF-extracted editorial unit', () => {
    const page14 = loadPage(14);
    const snapshot = JSON.parse(readFileSync(join(process.cwd(), 'src/experiments/page14-editorial-ab-v2-2026-10-12-blind-snapshot.json'), 'utf8')) as any;
    const v3 = JSON.parse(readFileSync(join(process.cwd(), 'src/experiments/page14-editorial-ab-v3-copyfit-state.json'), 'utf8')) as any;
    const normalizeText = (value: string) => value.replace(/[\s\u00a0]+/gu, ' ').trim();
    for (const unit of snapshot.units) {
      const matches = page14.blocks.filter((block: any) => normalizeText((block.lines ?? [])
        .map((line: any) => (line.spans ?? []).map((span: any) => span.text ?? '').join('')).join(' ')) === normalizeText(unit.sourceText));
      expect(matches, unit.spanKey).toHaveLength(1);
      expect(analyzeSourceBlock(matches[0]).lineCount, unit.spanKey).toBe(v3.sourcePdfVisualLineCounts[unit.spanKey]);
    }
  });

  it('groups mixed-size text on one baseline, list marker/body, and inline symbol ink as one visual row', () => {
    const lines = groupPageRendererVisualLines([
      { top: 10, bottom: 20, left: 20, right: 31 }, // list marker
      { top: 11, bottom: 20, left: 34, right: 78 }, // first body run
      { top: 6, bottom: 23, left: 79, right: 101 }, // larger rich-text run sharing the baseline
      { top: 27, bottom: 37, left: 34, right: 83 }, // next visual row
    ], [{
      rect: { top: 3, bottom: 21, left: 103, right: 117 },
      lineTop: 10,
    }]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ top: 3, bottom: 23, left: 20, right: 117 });
    expect(lines[1]).toMatchObject({ top: 27, bottom: 37, left: 34, right: 83 });
  });

  it('keeps an unmeasured or missing PDF baseline from passing Copyfit V3', () => {
    expect(classifyCopyfitVisualLines(null, 2)).toBe('UNMEASURED');
    expect(classifyCopyfitVisualLines(3, 0)).toBe('UNMEASURED');
    expect(classifyCopyfitVisualLines(0, 0)).toBe('UNMEASURED');
    expect(getCopyfitLineCountBlockStatus(null, 2)).toBe('blocked-source-line-count');
    expect(getCopyfitLineCountBlockStatus(2, null)).toBe('pending-line-count-measurement');
    expect(getCopyfitLineCountBlockStatus(3, 0)).toBe('pending-line-count-measurement');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', {
      structuralStatus: 'compatible', overflow: false, collision: false, lineCount: 2,
    })).toBe('blocked-source-line-count');
    expect(resolveStructuralCopyfitStatus('fit-awaiting-human-review', {
      structuralStatus: 'compatible', overflow: false, collision: false, lineCount: 0,
    }, false, 3)).toBe('pending-line-count-measurement');
  });

  it('uses visible ink edges, not line-leading scroll-box height, for copyfit overflow', () => {
    const p14PhaseOne = {
      bottomOverflowPx: 0,
      topEdgeOverflowPx: 0,
      leftEdgeOverflowPx: 0,
      rightEdgeOverflowPx: 0,
    };
    // The old scrollHeight/clientHeight check marked this measured p.14 frame
    // as overflowing despite 111px of ink inside a 111.3px frame.
    expect(hasVisibleGeometryOverflow(p14PhaseOne)).toBe(false);
    expect(hasVisibleGeometryOverflow({ ...p14PhaseOne, bottomOverflowPx: 0.8 })).toBe(true);
    expect(hasVisibleGeometryOverflow({ ...p14PhaseOne, topEdgeOverflowPx: 0.8 })).toBe(true);
    expect(hasVisibleGeometryOverflow({ ...p14PhaseOne, rightEdgeOverflowPx: 0.76 })).toBe(true);
    expect(hasVisibleGeometryOverflow(p14PhaseOne)).toBe(false);
    expect(getStructuralCopyfitBlockStatus('review-required', false, false)).toBe('blocked-structural-review');
  });

  it('reports text overlap and tight list-to-neighbor relationships without silently passing them', () => {
    const page = {
      page_number: 1,
      blocks: [
        { id: 'list', bbox: [10, 10, 190, 30], lines: [
          { bbox: [10, 10, 15, 20], availableX: 10, availableWidth: 180, spans: [{ text: '•', bbox: [10, 10, 15, 20], origin: [10, 19], size: 10 }] },
          { bbox: [25, 10, 100, 20], availableX: 10, availableWidth: 180, spans: [{ text: 'Body', bbox: [25, 10, 100, 20], origin: [25, 19], size: 10 }] },
        ] },
        { id: 'next', bbox: [10, 19, 190, 40], lines: [
          { bbox: [10, 20.5, 130, 31.5], availableX: 10, availableWidth: 180, spans: [{ text: 'Following unit', bbox: [10, 20.5, 130, 31.5], origin: [10, 30.5], size: 10 }] },
        ] },
        { id: 'overlap', bbox: [25, 17, 150, 27], lines: [
          { bbox: [25, 17, 150, 27], availableX: 25, availableWidth: 125, spans: [{ text: 'Overlapping text', bbox: [25, 17, 150, 27], origin: [25, 26], size: 10 }] },
        ] },
      ],
    };
    const report = analyzeSourcePages([page]);
    expect(report.sourceTextOverlapCandidates.some(candidate => candidate.blocks?.includes('list') && candidate.blocks?.includes('overlap'))).toBe(true);
    expect(report.pages[0].blocks.find(block => block.blockId === 'list')?.neighborClearancePt).toBeCloseTo(0.5, 2);
    expect(report.pages[0].blocks.find(block => block.blockId === 'list')?.nextBlockId).toBe('next');
    expect(report.familyCounts['separated-list']?.examined).toBe(1);
    expect(report.familyCounts['separated-list']?.compatible).toBe(1);
  });

  it('keeps equivalent local block pairs distinct across different pages', () => {
    const page = (page_number: number) => ({
      page_number,
      blocks: [
        { id: 'left', bbox: [10, 10, 100, 30], lines: [
          { id: `left-${page_number}`, bbox: [10, 10, 100, 22], availableX: 10, availableWidth: 90,
            spans: [{ text: 'Left text', font: 'OptimaLTStd', size: 10, color: '#231f20', flags: 4,
              bbox: [10, 10, 100, 22], origin: [10, 19] }] },
        ] },
        { id: 'right', bbox: [25, 15, 110, 35], lines: [
          { id: `right-${page_number}`, bbox: [25, 15, 110, 27], availableX: 25, availableWidth: 85,
            spans: [{ text: 'Right text', font: 'OptimaLTStd', size: 10, color: '#231f20', flags: 4,
              bbox: [25, 15, 110, 27], origin: [25, 24] }] },
        ] },
      ],
    });
    const report = analyzeSourcePages([page(1), page(2)]);
    expect(report.sourceTextOverlapCandidates).toHaveLength(2);
    expect(report.sourceTextOverlapCandidates.map(candidate => candidate.page)).toEqual([1, 2]);
    expect(report.sourceTextOverlapCandidates.every(candidate => candidate.blocks.join('|') === 'left|right')).toBe(true);
  });
});
