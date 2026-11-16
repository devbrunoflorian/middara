import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';

function readP78Fixture(): PageData {
  const pageDir = join(process.cwd(), 'public/pages/page_078');
  const page = JSON.parse(readFileSync(join(pageDir, 'page_078_dom.json'), 'utf8')) as PageData;
  return { ...page, images: [], blocks: page.blocks.filter(block => ['block_15', 'block_16', 'block_20', 'block_24'].includes(block.id)) };
}

describe('English source tracking', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
    vi.unstubAllGlobals();
  });

  it('renders enriched source lines in their measured PDF advance boxes', async () => {
    const pageData = readP78Fixture();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin={false} language="en" />);
    });

    for (const lineId of ['line_15_1', 'line_24_0']) {
      const line = container.querySelector<HTMLElement>(`[data-source-line-id="${lineId}"]`);
      expect(line, lineId).not.toBeNull();
      expect(line!.closest('svg[data-source-geometry="pdf-coordinates"]'), lineId).not.toBeNull();
      const pageId = '078';
      const sourcePage = JSON.parse(readFileSync(join(process.cwd(), 'public/pages', `page_${pageId}`, `page_${pageId}_dom.json`), 'utf8')) as PageData;
      const sourceLine = sourcePage.blocks.flatMap(block => block.lines ?? []).find(candidate => candidate.id === lineId)!;
      const expectedSpans = sourceLine.spans
        .map((span, index) => ({ span, key: `${lineId}:${span.sourceSpanIndex ?? index}` }))
        .filter(({ span }) => span.text.trim() && !span.semanticSymbolId);
      const textRuns = Array.from(line!.querySelectorAll<SVGTextElement>('text[data-source-span]'));
      expect(textRuns, `${lineId} exact source text runs`).toHaveLength(expectedSpans.length);
      for (const run of textRuns) {
        const expected = expectedSpans.find(({ key }) => key === run.getAttribute('data-source-span'))?.span;
        expect(expected, `${lineId} source span identity`).toBeDefined();
        expect(Number(run.getAttribute('data-source-x')), `${lineId} x origin`).toBeCloseTo(expected!.origin![0], 4);
        expect(Number(run.getAttribute('data-source-baseline-y')), `${lineId} baseline`).toBeCloseTo(expected!.origin![1], 4);
        expect(Number(run.getAttribute('textLength')), `${lineId} source advance`).toBeCloseTo(expected!.bbox[2] - expected!.bbox[0], 3);
      }
    }
  });
});
