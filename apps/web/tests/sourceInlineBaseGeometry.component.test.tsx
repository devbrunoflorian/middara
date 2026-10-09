import React from 'react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';

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
    const hand = attackLine.spans.find(span => span.semanticSymbolId === 'weapon.hand.two')!;

    expect(attackLine.renderSourceSpanGeometry).toBe(true);
    expect(attackLine.spans[0].bbox[0]).toBeCloseTo(84.1932, 3);
    expect(hand.bbox[0]).toBeCloseTo(304.7289, 3);
    expect(hand.bbox[2] - hand.bbox[0]).toBeCloseTo(16.9838, 3);
    expect(hand.sourceSymbolMetrics?.trailingGapEm).toBe(0);
    const coveredCountLine = block.lines!.find(line => line.id === 'line_25_3')!;
    expect(coveredCountLine.renderSourceSpanGeometry).toBe(true);
    expect(coveredCountLine.spans[0].sourceInlineCoveredBy).toBe('weapon.hand.two');
    expect(coveredCountLine.spans[1].text).toBe(' ');
    expect(coveredCountLine.spans[2].text).toContain('(2-Handed)');
    const projectedCount = sourceSpanRuns(coveredCountLine.spans, () => ({ weight: 400, style: 'normal' }))
      .map(segment => segment.text).join('');
    expect(projectedCount).toContain('(2-Handed)');
    expect(projectedCount).not.toMatch(/^2/);

    const leadingAttackLine = block.lines!.find(line => line.id === 'line_25_4')!;
    expect(leadingAttackLine.renderSourceSpanGeometry).toBe(true);
    expect(leadingAttackLine.renderSourceSpanStartPt).toBeCloseTo(84.1885, 3);
    expect(leadingAttackLine.availableX).toBeCloseTo(84.1885, 3);

    const markup = renderToStaticMarkup(<PageRenderer pageData={pageData} isAdmin={false} language="en" />);
    const container = document.createElement('div');
    container.innerHTML = markup;
    const handSourceSvg = container.querySelector('svg[data-source-symbol-id="weapon.hand.two"]') as SVGSVGElement | null;
    expect(handSourceSvg).not.toBeNull();
    expect(handSourceSvg!.getAttribute('data-source-bbox')).toBe(hand.bbox.join(','));
    expect(handSourceSvg!.querySelectorAll('path')).toHaveLength(4);
    expect(container.querySelector('[data-source-covered-by="weapon.hand.two"]')).not.toBeNull();

    for (const language of ['en', 'pt-BR'] as const) {
      const languageMarkup = renderToStaticMarkup(<PageRenderer pageData={pageData} isAdmin={false} language={language} />);
      const languageContainer = document.createElement('div');
      languageContainer.innerHTML = languageMarkup;
      if (language === 'en') {
        expect(languageContainer.querySelectorAll('svg[data-source-symbol-id="weapon.hand.two"], svg[data-source-symbol-id="weapon.hand.one"]')).toHaveLength(2);
        expect(languageContainer.querySelector('[data-source-covered-by="weapon.hand.two"]')).not.toBeNull();
        expect(languageContainer.querySelector('[data-source-covered-by="weapon.hand.one"]')).not.toBeNull();
      } else {
        expect(languageContainer.querySelectorAll('[data-source-inline-semantic="weapon.hand.two"], [data-source-inline-semantic="weapon.hand.one"]')).toHaveLength(2);
        expect(languageContainer.querySelectorAll('svg[data-symbol-id="weapon.hand.two"], svg[data-symbol-id="weapon.hand.one"]')).toHaveLength(2);
      }
    }

    const lastTextRun = Array.from(container.querySelectorAll('text')).find(span => span.textContent === ' Ability may equip ') as SVGTextElement | undefined;
    expect(lastTextRun).toBeDefined();
    expect(Number.parseFloat(lastTextRun!.getAttribute('textLength') ?? '')).toBeCloseTo(81.59, 2);
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

    // The two restored action.exhaust source placements (pp. 37 and 100) add
    // two inline elements and two distinct source lines to the accepted inventory.
    expect({ elementCount, lineCount: seenLines.size, affectedPages }).toEqual({ elementCount: 180, lineCount: 173, affectedPages: 48 });
  });
});
