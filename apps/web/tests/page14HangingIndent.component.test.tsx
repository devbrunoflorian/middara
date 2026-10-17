import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import {
  getPage14V3CurrentOverrides,
  getPage14V3Frames,
  PAGE14_V3_COPYFIT,
  PAGE14_V3_HANGING_INDENT_BLOCK_KEYS,
} from '../src/editorialExperiment';

describe('p.14 experimental numbered-list hanging indent', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  let previousRangeClientRects: PropertyDescriptor | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    previousRangeClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    if (!previousRangeClientRects) {
      Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    if (previousRangeClientRects) Object.defineProperty(Range.prototype, 'getClientRects', previousRangeClientRects);
    else delete (Range.prototype as Range & { getClientRects?: () => DOMRectList }).getClientRects;
    previousRangeClientRects = undefined;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('keeps historical V3 measurements intact and blocks B proposals that overflow after remeasurement', () => {
    const aBlock1 = PAGE14_V3_COPYFIT.conditions.A.units.page_14_block_1;
    const block1 = PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_1;
    const block5 = PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_5;
    const bBlock6 = PAGE14_V3_COPYFIT.conditions.B.units.page_14_block_6;
    expect(aBlock1.historicalStatusBeforeStructuralCorrection).toBe('blocked-overflow-revisions-exhausted');
    expect(aBlock1.status).toBe('fit-awaiting-human-review');
    expect(bBlock6.historicalStatusBeforeStructuralCorrection).toBe('blocked-overflow-revisions-exhausted');
    expect(bBlock6.status).toBe('fit-awaiting-human-review');
    expect(block1.historicalStatusBeforeStructuralCorrection).toBe('fit-awaiting-human-review');
    expect(block1.status).toBe('blocked-structural-remeasurement-overflow');
    expect(block1.proposalMeasurement?.rightEdgeOverflowPx).toBe(0);
    expect(block5.historicalStatusBeforeStructuralCorrection).toBe('fit-awaiting-human-review');
    expect(block5.status).toBe('blocked-structural-remeasurement-overflow');
    expect(block5.proposalMeasurement?.rightEdgeOverflowPx).toBe(0);
    expect(getPage14V3CurrentOverrides('B').has('page_14_block_1')).toBe(false);
    expect(getPage14V3CurrentOverrides('B').has('page_14_block_5')).toBe(false);
    expect(getPage14V3CurrentOverrides('A').has('page_14_block_5')).toBe(true);
    expect(getPage14V3CurrentOverrides('A').has('page_14_block_6')).toBe(true);
    expect(getPage14V3CurrentOverrides('A').has('page_14_block_1')).toBe(true);
    expect(getPage14V3CurrentOverrides('B').has('page_14_block_6')).toBe(true);
  });

  it('separates the source numeral from the translated body and keeps the source column edge', async () => {
    const pagePath = join(process.cwd(), 'public/pages/page_014/page_014_dom.json');
    const page = JSON.parse(readFileSync(pagePath, 'utf8')) as PageData;
    const frame = getPage14V3Frames().get('page_14_block_5');
    const block = page.blocks[5];
    const markerLine = block.lines!.find(line => line.spans.map(span => span.text).join('').trim() === '2.')!;
    const bodyLine = block.lines!.find(line => line.spans.map(span => span.text).join('').includes('PLACEMENT PHASE:'))!;
    expect(frame).toBeDefined();
    expect(markerLine).toBeDefined();
    expect(bodyLine).toBeDefined();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer
        pageData={{ ...page, images: [] }}
        isAdmin
        language="pt-BR"
        experimentalOverrides={getPage14V3CurrentOverrides('A')}
        experimentalFrames={getPage14V3Frames()}
        experimentalHangingIndentBlockKeys={PAGE14_V3_HANGING_INDENT_BLOCK_KEYS}
        readOnlyExperiment
      />);
    });

    const renderedBlock = container.querySelector<HTMLElement>('[data-editable-unit-key="page_14_block_5"]');
    const translatedBody = renderedBlock?.querySelector<HTMLElement>('.realbox');
    const marker = renderedBlock?.querySelector<HTMLElement>('[data-list-marker-line="line_19_0"]');
    expect(renderedBlock).toBeTruthy();
    expect(translatedBody).toBeTruthy();
    expect(marker).toBeTruthy();
    expect(translatedBody!.textContent).not.toMatch(/^\s*2\./);
    expect((renderedBlock!.textContent!.match(/2\./g) ?? [])).toHaveLength(1);
    expect(Number(renderedBlock!.dataset.sourceListBodyStartX)).toBeCloseTo(bodyLine.bbox[0], 2);
    expect(Number(marker!.dataset.sourceLineRight)).toBeCloseTo(markerLine.bbox[2], 2);

    const scale = Number.parseFloat(container.querySelector<HTMLElement>('.page-container')!.style.width) / page.width;
    const expectedBodyOffset = (bodyLine.bbox[0] - frame!.x) * scale;
    const expectedBodyWidth = (frame!.x + frame!.width - bodyLine.bbox[0]) * scale;
    expect(Number.parseFloat(translatedBody!.style.left)).toBeCloseTo(expectedBodyOffset, 2);
    expect(Number.parseFloat(translatedBody!.style.width)).toBeCloseTo(expectedBodyWidth, 2);
    expect(bodyLine.bbox[0]).toBeGreaterThan(markerLine.bbox[2]);
  });

  it('keeps a source bullet fixed and starts every translated line in its text column', async () => {
    const pagePath = join(process.cwd(), 'public/pages/page_013/page_013_dom.json');
    const page = JSON.parse(readFileSync(pagePath, 'utf8')) as PageData;
    const sourceBlock = page.blocks[17];
    const markerLine = sourceBlock.lines!.find(line => line.id === 'line_37_0')!;
    const bodyLine = sourceBlock.lines!.find(line => line.id === 'line_37_1')!;
    const frame = {
      x: (markerLine as any).availableX,
      y: sourceBlock.bbox[1],
      width: (markerLine as any).availableWidth,
      height: sourceBlock.bbox[3] - sourceBlock.bbox[1],
      rotation: 0,
    };
    const override = {
      spanKey: 'page_13_block_17',
      bbox: [frame.x, frame.y, frame.x + frame.width, frame.y + frame.height] as [number, number, number, number],
      textAlign: 'left' as const,
      lineHeight: 1.1,
      segments: [{ text: '•\tExemplo de corpo traduzido com continuidade e recuo francês.' , font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const }],
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer
        pageData={{ ...page, images: [] }}
        isAdmin
        language="pt-BR"
        experimentalOverrides={new Map([[override.spanKey, override]])}
        experimentalFrames={new Map([[override.spanKey, frame]])}
        experimentalHangingIndentBlockKeys={new Set([override.spanKey])}
        readOnlyExperiment
      />);
    });

    const renderedBlock = container.querySelector<HTMLElement>('[data-editable-unit-key="page_13_block_17"]');
    const translatedBody = renderedBlock?.querySelector<HTMLElement>('.realbox');
    const marker = renderedBlock?.querySelector<HTMLElement>(`[data-list-marker-line="${markerLine.id}"]`);
    expect(renderedBlock).toBeTruthy();
    expect(marker).toBeTruthy();
    expect(translatedBody).toBeTruthy();
    expect(translatedBody!.textContent).not.toMatch(/^\s*•/);
    expect((renderedBlock!.textContent!.match(/•/g) ?? [])).toHaveLength(1);

    const scale = Number.parseFloat(container.querySelector<HTMLElement>('.page-container')!.style.width) / page.width;
    expect(Number.parseFloat(translatedBody!.style.left)).toBeCloseTo((bodyLine.bbox[0] - frame.x) * scale, 2);
    expect(Number.parseFloat(translatedBody!.style.width)).toBeCloseTo((frame.x + frame.width - bodyLine.bbox[0]) * scale, 2);
  });
});
