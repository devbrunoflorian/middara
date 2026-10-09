import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';

function readSourcePage(pageNumber: number) {
  const pageDir = join(process.cwd(), 'public/pages', `page_${String(pageNumber).padStart(3, '0')}`);
  const page = JSON.parse(readFileSync(join(pageDir, `page_${String(pageNumber).padStart(3, '0')}_dom.json`), 'utf8')) as PageData;
  const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
  return { page: { ...page, blocks: attachSourceInlineElements(page.blocks, elements), inlineElements: elements }, elements };
}

describe('source inline occurrence rendering', () => {
  it('paints dice.white when a component raster omits its PDF vector', () => {
    for (const pageNumber of [57, 64]) {
      const { page, elements } = readSourcePage(pageNumber);
      const sourceDie = elements.find(element => element.symbolId === 'dice.white');

      expect(sourceDie, `p.${pageNumber} dice.white occurrence`).toBeDefined();
      expect(sourceDie?.sourceRendering).toBe('semantic-inline');

      const line = page.blocks
        .find(block => block.id === sourceDie?.anchor.blockId)?.lines
        ?.find(candidate => candidate.id === sourceDie?.anchor.lineId);
      const sourceSpan = line?.spans.find(span => span.semanticSymbolId === 'dice.white');
      expect(sourceSpan?.sourceRendering).toBe('semantic-inline');

      const markup = renderToStaticMarkup(<PageRenderer pageData={page} isAdmin={false} language="en" />);
      const rendered = document.createElement('div');
      rendered.innerHTML = markup;
      const sourceSymbol = rendered.querySelector('[data-source-inline-semantic="dice.white"]');
      expect(sourceSymbol, `p.${pageNumber} source inline slot`).not.toBeNull();
      expect(sourceSymbol?.querySelector('svg[data-symbol-id="dice.white"]')).not.toBeNull();
    }
  });
});
