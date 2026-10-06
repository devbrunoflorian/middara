import { expect, it } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { SemanticSymbol } from '../src/symbols/SemanticSymbol';
import { attachSourceInlineElements } from '../src/symbols/sourceInlineElements';
import { decodeInlineClipboard, encodeInlineClipboard } from '../src/symbols/inlineClipboard';
import { editableTextForSegments } from '../src/symbols/inlineCodec';
import type { Segment } from '../src/components/RichSpanEditor';

const page = JSON.parse(readFileSync('public/pages/page_078/page_078_dom.json', 'utf8'));
const elements = JSON.parse(readFileSync('public/pages/page_078/inline_elements.json', 'utf8')).elements;
const hands = elements.filter((element: any) => element.symbolId === 'weapon.hand');

it('attaches only the two inline hand icons and keeps their counts as separate editable text', () => {
  expect(hands).toHaveLength(2);
  const expected = [
    { lineId: 'line_25_2', spanIndex: 2, numberLineId: 'line_25_3', number: '2', overlapPt: -3.1042175292971024 },
    { lineId: 'line_25_5', spanIndex: 0, numberLineId: 'line_25_6', number: '1', overlapPt: -1.9841003417963634 },
  ];

  for (let index = 0; index < hands.length; index++) {
    const element = hands[index];
    const target = expected[index];
    expect(element.anchor).toMatchObject({ blockId: 'block_25', blockIndex: 12, lineId: target.lineId,
      spanIndex: target.spanIndex, side: 'after', sizePt: 10 });
    expect(element.anchor.trailingGapPt).toBeCloseTo(target.overlapPt, 6);
    const block = page.blocks.find((candidate: any) => candidate.id === 'block_25');
    const number = block.lines.find((line: any) => line.id === target.numberLineId).spans[0];
    expect(number.text).toBe(target.number);
    expect(number.bbox[0]).toBeLessThan(element.bbox[2]);
  }

  const adapted = attachSourceInlineElements(page.blocks, hands);
  for (const element of hands) {
    const line = adapted.find((block: any) => block.id === 'block_25').lines
      .find((candidate: any) => candidate.id === element.anchor.lineId);
    const symbol = line.spans.find((span: any) => span.semanticSymbolId === 'weapon.hand');
    expect(symbol.sourceSymbolMetrics.trailingGapEm).toBeCloseTo(element.anchor.trailingGapPt / element.anchor.sizePt, 12);
    expect(symbol.sourceSymbolMetrics.trailingGapEm).toBeLessThan(0);
  }
});

it('renders measured overlap and preserves it through inline clipboard data', () => {
  const element = hands[0];
  const metrics = { ...element.metrics,
    trailingGapEm: element.anchor.trailingGapPt / element.anchor.sizePt };
  const html = renderToStaticMarkup(<SemanticSymbol id="weapon.hand" language="en" size={element.anchor.sizePt} metrics={metrics} />);
  expect(html).toMatch(/margin-inline-end:-3\.1042\d*px/);

  const segment: Segment = { font: 'OptimaLTStd', size: element.anchor.sizePt, color: '#231f20',
    weight: 400, style: 'normal', text: '\uFFFC', symbolId: 'weapon.hand', symbolMetrics: metrics };
  const plainText = editableTextForSegments([segment], 'en');
  const encoded = encodeInlineClipboard([segment], 'en');
  expect(decodeInlineClipboard(encoded, plainText)).toEqual([segment]);
});
