import { expect, it } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { SemanticSymbol } from '../src/symbols/SemanticSymbol';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { decodeInlineClipboard, encodeInlineClipboard } from '../src/symbols/inlineClipboard';
import { editableTextForSegments } from '../src/symbols/inlineCodec';
import { findSymbolByEditorToken, getSymbolEditorToken } from '../src/symbols/semanticSymbols';
import type { Segment } from '../src/components/RichSpanEditor';

const page = JSON.parse(readFileSync('public/pages/page_078/page_078_dom.json', 'utf8'));
const elements = JSON.parse(readFileSync('public/pages/page_078/inline_elements.json', 'utf8')).elements as SourceInlineElement[];
const hands = elements.filter(element => element.symbolId === 'weapon.hand.one' || element.symbolId === 'weapon.hand.two');

it('models p78 one/two-hand requirements as numbered semantic compositions', () => {
  expect(hands.map(element => element.symbolId).sort()).toEqual(['weapon.hand.one', 'weapon.hand.two']);
  const expected = [
    { id: 'weapon.hand.two', lineId: 'line_25_2', countLineId: 'line_25_3', number: '2', width: 16.9837951660156 },
    { id: 'weapon.hand.one', lineId: 'line_25_5', countLineId: 'line_25_6', number: '1', width: 15.8648986816406 },
  ];
  const adapted = attachSourceInlineElements(page.blocks, hands);
  const adaptedBlock = adapted.find((candidate: any) => candidate.id === 'block_25');

  for (const target of expected) {
    const element = hands.find(candidate => candidate.symbolId === target.id)!;
    expect(element.anchor).toMatchObject({ blockId: 'block_25', lineId: target.lineId, side: 'after', sizePt: 10 });
    expect(element.anchor.trailingGapPt).toBe(0);
    expect((element.bbox[2] - element.bbox[0])).toBeCloseTo(target.width, 5);

    const ownerLine = adaptedBlock.lines.find((line: any) => line.id === target.lineId);
    const symbol = ownerLine.spans.find((span: any) => span.semanticSymbolId === target.id);
    expect(symbol.sourceSymbolMetrics.widthEm).toBeCloseTo(target.width / 10, 5);

    const countLine = adaptedBlock.lines.find((line: any) => line.id === target.countLineId);
    expect(countLine.renderSourceSpanGeometry).toBe(true);
    expect(countLine.spans[0]).toMatchObject({ text: target.number, sourceInlineCoveredBy: target.id });
    const sourceProjection = sourceSpanRuns(countLine.spans, () => ({ weight: 400, style: 'normal' }));
    expect(sourceProjection.map((segment: Segment) => segment.text).join('')).not.toMatch(new RegExp(`^${target.number}`));
    expect(sourceProjection.map((segment: Segment) => segment.text).join('')).toContain(`(${target.number}-Handed)`);

    const token = getSymbolEditorToken(target.id, 'en');
    expect(token).toBe(`[[${target.number}hand]]`);
    const segment: Segment = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal',
      text: '\uFFFC', symbolId: target.id, symbolMetrics: element.metrics };
    expect(editableTextForSegments([segment], 'en')).toBe(token);
    const encoded = encodeInlineClipboard([segment], 'en');
    expect(decodeInlineClipboard(encoded, token)).toEqual([segment]);

    const definition = JSON.parse(readFileSync('src/symbols/sourceSymbols.json', 'utf8'))
      .find((entry: any) => entry.id === target.id);
    expect(definition.sourceRendering).toBe('semantic-inline');
    expect(definition.render.paths).toHaveLength(4); // Hand circle, hand silhouette, count fill, count outline.
    expect(definition.render.paths.some((path: any) => path.fill === '#ffffff')).toBe(true);
    expect(definition.render.paths.some((path: any) => path.stroke === '#231f20')).toBe(true);

    const markup = renderToStaticMarkup(<SemanticSymbol id={target.id} language="en" size={10} metrics={element.metrics} />);
    const container = document.createElement('div');
    container.innerHTML = markup;
    expect(container.querySelector('svg[data-symbol-id]')?.getAttribute('viewBox')).toBeTruthy();
    expect(container.querySelector('rect')).toBeNull(); // The area outside the artwork stays transparent.
    expect(container.querySelectorAll('path')).toHaveLength(4);
  }
});

it('keeps the retired generic shortcut readable without offering it as a new hand symbol', () => {
  expect(findSymbolByEditorToken('[[hand-requirement]]', 'en')?.id).toBe('weapon.hand');
  const generic = JSON.parse(readFileSync('src/symbols/sourceSymbols.json', 'utf8'))
    .find((entry: any) => entry.id === 'weapon.hand');
  expect(generic.allowedBlockTypes).toEqual([]);
  expect(generic.sourceRendering).toBeUndefined();
});
