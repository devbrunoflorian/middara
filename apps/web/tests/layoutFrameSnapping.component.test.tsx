import { describe, expect, it } from 'vitest';
import { snapLayoutFrame } from '../src/layoutFrameSnapping';

describe('snapLayoutFrame', () => {
  it('snaps a frame center to the page center inside the screen-pixel threshold', () => {
    const result = snapLayoutFrame(
      { x: 103, y: 43, width: 100, height: 14 },
      300,
      800,
      [],
      'selected',
      1.5,
      5,
    );
    expect(result.frame.x).toBe(100);
    expect(result.guides).toEqual([{ axis: 'x', value: 150, label: 'Page center' }]);
  });

  it('aligns to another frame edge, ignores itself, and includes vertical guides', () => {
    const result = snapLayoutFrame(
      { x: 208, y: 54, width: 60, height: 20 },
      600,
      800,
      [
        { key: 'other', label: 'Block 8', x: 100, y: 80, width: 110, height: 20 },
        { key: 'selected', label: 'Selected', x: 0, y: 0, width: 500, height: 700 },
      ],
      'selected',
      1,
      8,
    );
    expect(result.frame.x).toBe(210);
    expect(result.frame.y).toBe(60);
    expect(result.guides).toEqual([
      { axis: 'x', value: 210, label: 'Block 8 right edge' },
      { axis: 'y', value: 80, label: 'Block 8 top edge' },
    ]);
  });

  it('leaves frames untouched when no guide is within the threshold', () => {
    const frame = { x: 211, y: 57, width: 45, height: 13 };
    const result = snapLayoutFrame(frame, 600, 800, [], null, 1, 4);
    expect(result.frame).toEqual(frame);
    expect(result.guides).toEqual([]);
  });
});
