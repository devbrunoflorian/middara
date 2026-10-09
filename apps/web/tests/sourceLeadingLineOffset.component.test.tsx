import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';

function readSourceFixture(pageNumber: number, blockIds: string[]): PageData {
  const pageId = String(pageNumber).padStart(3, '0');
  const pageDir = join(process.cwd(), `public/pages/page_${pageId}`);
  const page = JSON.parse(readFileSync(join(pageDir, `page_${pageId}_dom.json`), 'utf8')) as PageData;
  const blocks = page.blocks.filter(block => blockIds.includes(block.id));
  if (blocks.length !== blockIds.length) throw new Error(`Expected source blocks on p. ${pageNumber}`);
  return { ...page, images: [], blocks };
}

describe('English source leading-line handling', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [] }),
    }));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('uses the PDF baseline once for source lines that retain their leading break', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const cases = [
      { page: 13, block: 'block_24', line: 'line_24_14', unit: 'p13-story-round-2-bounty-note' },
      { page: 28, block: 'block_26', line: 'line_26_0', unit: 'p28-block-26-first-size-12pt' },
      { page: 57, block: 'block_74', line: 'line_74_1', unit: 'p57-block-74-remaining-size-10pt' },
      { page: 57, block: 'block_80', line: 'line_80_1', unit: 'p57-block-80-body-size-10pt' },
      { page: 57, block: 'block_81', line: 'line_81_1', unit: 'p57-block-81-body-size-10pt' },
    ];

    for (const pageNumber of [...new Set(cases.map(item => item.page))]) {
      const pageCases = cases.filter(item => item.page === pageNumber);
      const blockIds = [...new Set(pageCases.map(item => item.block))];
      const page = readSourceFixture(pageNumber, blockIds);

      await act(async () => {
        root!.render(<PageRenderer pageData={page} isAdmin={false} language="en" />);
      });

      for (const item of pageCases) {
        const renderedLine = container.querySelector<HTMLElement>(`[data-source-line-id="${item.line}"]`);
        expect(renderedLine, `p. ${item.page} ${item.line}`).not.toBeNull();

        const block = page.blocks.find(candidate => candidate.id === item.block)!;
        const unit = block.typographicUnits!.find(candidate => candidate.id === item.unit)!;
        const sourceLine = block.lines!.find(line => line.id === item.line)!;
        const firstInk = sourceLine.spans.find(span => span.text.trim())!;
        const expectedLineTop = sourceLine.bbox[1] - unit.field.bbox[1];
        const pageScale = Number.parseFloat(container.querySelector<HTMLElement>('.page-container')!.style.width) / page.width;
        expect(firstInk.bbox[1] - sourceLine.bbox[1], `${item.line} source first-ink offset`)
          .toBeGreaterThan(0);
        const exactSourceText = renderedLine!.querySelector<SVGTextElement>('text[data-source-baseline-y]');
        if (exactSourceText) {
          expect(renderedLine!.closest('svg[data-source-geometry="pdf-coordinates"]')).not.toBeNull();
          expect(Number(exactSourceText.getAttribute('data-source-baseline-y')), `${item.line} PDF baseline`)
            .toBeCloseTo(firstInk.origin![1], 4);
          expect(Number(exactSourceText.getAttribute('data-source-x')), `${item.line} PDF x origin`)
            .toBeCloseTo(firstInk.origin![0], 4);
        } else {
          // The legacy flow path remains for mixed/unsupported source lines.
          expect(Number.parseFloat(renderedLine!.style.top), `${item.line} unadjusted source line top in CSS pixels`)
            .toBeCloseTo(expectedLineTop * pageScale, 4);
        }
      }
    }
  });
});
