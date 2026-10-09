import { describe, expect, it } from 'vitest';
import { calculateTypographicFlowPlan } from '../src/typographicReflow';

describe('typographic editorial reflow', () => {
  it('preserves the p.57 source gaps after two preceding paragraphs reflow', () => {
    const units = [
      { id: 'body', sourceTopPt: 384.7141, sourceBottomPt: 423.6341, frameTopPt: 384.7141 },
      { id: 'paragraph-2', sourceTopPt: 425.5641, sourceBottomPt: 503.4688, frameTopPt: 425.5641 },
      { id: 'paragraph-3', sourceTopPt: 506.3988, sourceBottomPt: 551.3034, frameTopPt: 506.3988 },
    ];

    const contentBoundsPt = {
      body: { topOffsetPt: 3.7517, bottomOffsetPt: 45.5748 },
      'paragraph-2': { topOffsetPt: -1.266, bottomOffsetPt: 80.5669 },
      'paragraph-3': { topOffsetPt: -1.266, bottomOffsetPt: 40.5571 },
    };
    const plan = calculateTypographicFlowPlan(units, contentBoundsPt);

    const bodyBottomPt = units[0].frameTopPt + contentBoundsPt.body.bottomOffsetPt;
    const paragraph2TopPt = units[1].frameTopPt
      + (plan.offsetsByUnitId.get('paragraph-2') ?? 0)
      + contentBoundsPt['paragraph-2'].topOffsetPt;
    const paragraph2BottomPt = units[1].frameTopPt
      + (plan.offsetsByUnitId.get('paragraph-2') ?? 0)
      + contentBoundsPt['paragraph-2'].bottomOffsetPt;
    const paragraph3TopPt = units[2].frameTopPt
      + (plan.offsetsByUnitId.get('paragraph-3') ?? 0)
      + contentBoundsPt['paragraph-3'].topOffsetPt;

    expect(paragraph2TopPt - bodyBottomPt).toBeCloseTo(units[1].sourceTopPt - units[0].sourceBottomPt, 3);
    expect(paragraph3TopPt - paragraph2BottomPt).toBeCloseTo(units[2].sourceTopPt - units[1].sourceBottomPt, 3);
    expect(plan.offsetsByUnitId.get('paragraph-2')).toBeCloseTo(7.921, 3);
    expect(plan.requiredPushPt).toBeCloseTo(11.849, 3);
  });

  it('keeps required sibling flow when cumulative growth exceeds the open space', () => {
    const units = [
      { id: 'body', sourceTopPt: 0, sourceBottomPt: 30, frameTopPt: 0 },
      { id: 'example', sourceTopPt: 34, sourceBottomPt: 54, frameTopPt: 34 },
      { id: 'note', sourceTopPt: 58, sourceBottomPt: 78, frameTopPt: 58 },
    ];

    const plan = calculateTypographicFlowPlan(units, {
      body: { topOffsetPt: 0, bottomOffsetPt: 38 },
      example: { topOffsetPt: 0, bottomOffsetPt: 24 },
    });
    const availableBeforeNextComponentPt = 5;

    expect(plan.requiredPushPt).toBeGreaterThan(availableBeforeNextComponentPt);
    expect(plan.offsetsByUnitId.get('example')).toBeCloseTo(8, 6);
    expect(plan.offsetsByUnitId.get('note')).toBeCloseTo(12, 6);
  });
});
