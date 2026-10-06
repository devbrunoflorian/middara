import React from 'react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';

function readPage(pageNumber: number) {
  const pageDir = join(process.cwd(), 'public/pages', `page_${String(pageNumber).padStart(3, '0')}`);
  const raw = JSON.parse(readFileSync(join(pageDir, `page_${String(pageNumber).padStart(3, '0')}_dom.json`), 'utf8')) as PageData;
  const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
  return {
    pageData: { ...raw, blocks: attachSourceInlineElements(raw.blocks, elements), inlineElements: elements } satisfies PageData,
    elements,
  };
}

describe('source inline symbol base geometry', () => {
  it('keeps the p. 78 Gigas Grip text and hand symbol in their source advance boxes', () => {
    const { pageData } = readPage(78);
    const block = pageData.blocks.find(candidate => candidate.id === 'block_25')!;
    const attackLine = block.lines!.find(line => line.id === 'line_25_2')!;
    const hand = attackLine.spans.find(span => span.semanticSymbolId === 'weapon.hand')!;

    expect(attackLine.renderSourceSpanGeometry).toBe(true);
    expect(attackLine.spans[0].bbox[0]).toBeCloseTo(84.1932, 3);
    expect(hand.bbox[0]).toBeCloseTo(304.7289, 3);
    expect(hand.bbox[2] - hand.bbox[0]).toBeCloseTo(13.918, 3);

    const leadingAttackLine = block.lines!.find(line => line.id === 'line_25_4')!;
    expect(leadingAttackLine.renderSourceSpanGeometry).toBe(true);
    expect(leadingAttackLine.renderSourceSpanStartPt).toBeCloseTo(84.1885, 3);
    expect(leadingAttackLine.availableX).toBeCloseTo(84.1885, 3);

    const markup = renderToStaticMarkup(<PageRenderer pageData={pageData} isAdmin={false} language="en" />);
    const container = document.createElement('div');
    container.innerHTML = markup;
    const handPlaceholder = container.querySelector('[data-source-inline-placeholder="weapon.hand"]') as HTMLSpanElement | null;
    expect(handPlaceholder).not.toBeNull();
    expect(Number.parseFloat(handPlaceholder!.style.flexBasis)).toBeCloseTo(13.918, 3);
    expect(Number.parseFloat(handPlaceholder!.style.marginInlineStart)).toBeCloseTo(-0.0043, 2);

    const lastTextRun = Array.from(container.querySelectorAll('span')).find(span => span.textContent === ' Ability may equip ') as HTMLSpanElement | undefined;
    expect(lastTextRun).toBeDefined();
    expect(Number.parseFloat(lastTextRun!.style.flexBasis)).toBeCloseTo(81.59, 2);
  });

  it('routes every source inline placement through source geometry as one shared renderer family', () => {
    const pagesRoot = join(process.cwd(), 'public/pages');
    const pages = readdirSync(pagesRoot).filter(name => /^page_\d{3}$/.test(name));
    const seenLines = new Set<string>();
    let elementCount = 0;
    let affectedPages = 0;

    for (const pageDirName of pages) {
      const pageNumber = Number(pageDirName.slice(-3));
      const pageDir = join(pagesRoot, pageDirName);
      const inlinePath = join(pageDir, 'inline_elements.json');
      const domPath = join(pageDir, `${pageDirName}_dom.json`);
      try {
        const elements = JSON.parse(readFileSync(inlinePath, 'utf8')).elements as SourceInlineElement[];
        if (!elements.length) continue;
        const raw = JSON.parse(readFileSync(domPath, 'utf8')) as PageData;
        const blocks = attachSourceInlineElements(raw.blocks, elements);
        affectedPages++;
        elementCount += elements.length;
        for (const element of elements) {
          const block = blocks.find(candidate => candidate.id === element.anchor.blockId);
          const line = block?.lines?.find(candidate => candidate.id === element.anchor.lineId);
          expect(line?.renderSourceSpanGeometry, `p.${pageNumber} ${element.symbolId} ${element.anchor.lineId}`).toBe(true);
          seenLines.add(`${pageNumber}:${element.anchor.lineId}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }

    expect({ elementCount, lineCount: seenLines.size, affectedPages }).toEqual({ elementCount: 171, lineCount: 165, affectedPages: 48 });
  });
});
