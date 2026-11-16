export interface TypographicFlowMeasurement {
  id: string;
  sourceTopPt: number;
  sourceBottomPt: number;
  frameTopPt: number;
}

export interface TypographicFlowPlan {
  offsetsByUnitId: ReadonlyMap<string, number>;
  requiredPushPt: number;
}

export interface TypographicFlowContentBounds {
  topOffsetPt: number;
  bottomOffsetPt: number;
}

/**
 * Position flowing editorial units after the measured content of the previous
 * unit while preserving the source gap between their frames. Fixed-position
 * units are excluded by the caller.
 */
export function calculateTypographicFlowPlan(
  units: readonly TypographicFlowMeasurement[],
  measuredContentBoundsPt: Readonly<Record<string, TypographicFlowContentBounds>>,
): TypographicFlowPlan {
  const offsetsByUnitId = new Map<string, number>();
  for (const unit of units) offsetsByUnitId.set(unit.id, 0);

  for (let index = 0; index < units.length - 1; index += 1) {
    const current = units[index];
    const next = units[index + 1];
    const currentOffsetPt = offsetsByUnitId.get(current.id) ?? 0;
    const sourceHeightPt = Math.max(0, current.sourceBottomPt - current.sourceTopPt);
    const currentContentBounds = measuredContentBoundsPt[current.id] ?? {
      topOffsetPt: 0,
      bottomOffsetPt: sourceHeightPt,
    };
    const nextSourceHeightPt = Math.max(0, next.sourceBottomPt - next.sourceTopPt);
    const nextContentBounds = measuredContentBoundsPt[next.id] ?? {
      topOffsetPt: 0,
      bottomOffsetPt: nextSourceHeightPt,
    };
    const sourceGapPt = next.sourceTopPt - current.sourceBottomPt;
    const currentContentBottomPt = current.frameTopPt + currentOffsetPt + currentContentBounds.bottomOffsetPt;
    const requiredNextContentTopPt = currentContentBottomPt + sourceGapPt;
    const nextContentTopPt = next.frameTopPt + nextContentBounds.topOffsetPt;
    const requiredNextOffsetPt = Math.max(0, requiredNextContentTopPt - nextContentTopPt);

    // Never pull a later unit upward. Its stored frame may already leave more
    // room than the source geometry requires.
    offsetsByUnitId.set(next.id, Math.max(
      offsetsByUnitId.get(next.id) ?? 0,
      requiredNextOffsetPt,
    ));
  }

  const requiredPushPt = Math.max(0, ...offsetsByUnitId.values());
  return { offsetsByUnitId, requiredPushPt };
}
