import { describe, expect, it } from 'vitest';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import type { Block } from '../src/components/PageRenderer';

const symbol: SourceInlineElement = {
  symbolId: 'combat.skull',
  bbox: [20, 0, 28, 11],
  anchor: {
    blockId: 'block_1', blockIndex: 0, lineId: 'line_1', spanIndex: 0,
    side: 'before', sizePt: 10,
    ownerSpanRef: { lineId: 'line_1', spanIndex: 1 },
  },
  metrics: { widthEm: 0.8, heightEm: 1.1, verticalAlignEm: 0.2 },
  mask: { url: '/mask.png', bbox: [19, -1, 29, 12] },
};

function blockWithUnit(): Block {
  return {
    id: 'block_1', bbox: [0, 0, 100, 20], typographicSpanUnits: [
      { id: 'unit-prose', spanRefs: ['line_1:1'] },
    ],
    lines: [{ id: 'line_1', bbox: [0, 0, 80, 12], spans: [
      { text: ' ', font: 'OptimaLTStd', size: 10, color: '#000', flags: 0, bbox: [20, 0, 23, 12] },
      { text: 'is rolled', font: 'OptimaLTStd', size: 10, color: '#000', flags: 0, bbox: [23, 0, 60, 12] },
    ] }],
  };
}

describe('attachSourceInlineElements', () => {
  it('links a source symbol at line start to its explicit prose owner', () => {
    const [block] = attachSourceInlineElements([blockWithUnit()], [symbol]);
    expect(block.typographicSpanUnits?.[0].spanRefs).toContain('line_1:0');
    const attached = block.lines?.[0].spans.find(span => span.semanticSymbolId === 'combat.skull');
    expect(attached).toMatchObject({ text: '\uFFFC', sourceSpanIndex: 0, semanticSymbolId: 'combat.skull' });
  });

  it('does not add an object to an unrelated unit when its owner reference is missing', () => {
    const block = blockWithUnit();
    block.typographicSpanUnits![0].spanRefs = ['line_1:1'];
    const [result] = attachSourceInlineElements([block], [{
      ...symbol, anchor: { ...symbol.anchor, ownerSpanRef: { lineId: 'line_1', spanIndex: 99 } },
    }]);
    expect(result.typographicSpanUnits?.[0].spanRefs).not.toContain('line_1:0');
  });

  it('extends translated flow through a source symbol anchored after the extracted text', () => {
    const lineBlock: Block = {
      id: 'block_1', bbox: [20, 0, 60, 12], lines: [{
        id: 'line_1', bbox: [20, 0, 60, 12], availableX: 20, availableWidth: 40, spans: [
          { text: '5 - RED', font: 'OptimaLTStd-Bold', size: 10, color: '#000', flags: 0, bbox: [20, 0, 49, 12] },
          { text: ' ', font: 'OptimaLTStd', size: 10, color: '#000', flags: 0, bbox: [49, 0, 60, 12] },
        ],
      }],
    };
    const afterSymbol: SourceInlineElement = {
      ...symbol,
      bbox: [60.3, 0, 71.8, 12],
      anchor: { ...symbol.anchor, spanIndex: 1, side: 'after' },
    };

    const [result] = attachSourceInlineElements([lineBlock], [afterSymbol]);

    expect(result.lines?.[0].availableX).toBe(20);
    expect(result.lines?.[0].availableWidth).toBeCloseTo(51.8, 5);
    expect(result.lines?.[0].spans.at(-1)).toMatchObject({ semanticSymbolId: 'combat.skull' });
  });
});
