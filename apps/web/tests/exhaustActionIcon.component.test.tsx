import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { getSemanticSymbol, getSymbolEditorToken } from '../src/symbols/semanticSymbols';
import { attachSourceInlineElements, sourceElementIsReplaced, type SourceInlineElement } from '../src/symbols/sourceInlineElements';

function readSourcePage(pageNumber: number) {
  const pageDir = join(process.cwd(), 'public/pages', `page_${String(pageNumber).padStart(3, '0')}`);
  const page = JSON.parse(readFileSync(join(pageDir, `page_${String(pageNumber).padStart(3, '0')}_dom.json`), 'utf8')) as PageData;
  const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
  return { page: { ...page, blocks: attachSourceInlineElements(page.blocks, elements), inlineElements: elements }, elements };
}

describe('source exhaust action icon', () => {
  it('keeps a standalone semantic identity distinct from the composite EXHAUST tag', () => {
    const icon = getSemanticSymbol('action.exhaust');
    const tag = getSemanticSymbol('tag.exhaust');

    expect(icon).toBeDefined();
    expect(icon?.sourceRendering).toBe('semantic-inline');
    expect(icon?.render.paths).toHaveLength(1);
    expect(icon?.render.paths?.[0].fill).toBe('#231f20');
    expect(icon?.composition).toBeUndefined();
    expect(tag?.composition?.type).toBe('compound');
    expect(icon?.id).not.toBe(tag?.id);
    expect(getSymbolEditorToken('action.exhaust', 'en')).toBe('[[exhaust-action]]');
    expect(getSymbolEditorToken('action.exhaust', 'pt-BR')).toBe('[[exhaust-action]]');
  });

  it('paints the two source-equivalent occurrences exactly once in source geometry', () => {
    for (const [pageNumber, drawingIndex, expectedAnchor] of [
      [37, 110, ['block_20', 'line_20_2', 0, 'before']],
      [100, 219, ['block_27', 'line_27_4', 0, 'after']],
    ] as const) {
      const { page, elements } = readSourcePage(pageNumber);
      const icon = elements.find(element => element.symbolId === 'action.exhaust');

      expect(icon, `p.${pageNumber} action.exhaust sidecar`).toBeDefined();
      expect(icon?.sourceRendering).toBe('semantic-inline');
      expect(icon?.drawingIndices).toEqual([drawingIndex]);
      expect([icon?.anchor.blockId, icon?.anchor.lineId, icon?.anchor.spanIndex, icon?.anchor.side]).toEqual(expectedAnchor);
      expect(sourceElementIsReplaced(icon!, page.blocks.find(block => block.id === icon?.anchor.blockId)!, pageNumber,
        'en', new Map(), null, null)).toBe(true);

      const markup = renderToStaticMarkup(<PageRenderer pageData={page} isAdmin={false} language="en" />);
      const rendered = document.createElement('div');
      rendered.innerHTML = markup;
      const symbols = rendered.querySelectorAll('[data-source-inline-semantic="action.exhaust"]');
      expect(symbols, `p.${pageNumber} semantic source occurrence count`).toHaveLength(1);
      expect(symbols[0].querySelector('svg[data-symbol-id="action.exhaust"]')).not.toBeNull();
      expect(symbols[0].querySelectorAll('svg[data-symbol-id="action.exhaust"] path')).toHaveLength(1);
    }
  });
});
