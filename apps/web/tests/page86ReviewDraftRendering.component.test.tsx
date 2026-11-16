import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData, type LayoutFrame } from '../src/components/PageRenderer';
import type { SpanOverride } from '../src/components/RichSpanEditor';

describe('p.86 persisted review draft rendering', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it.each([
    { blockIndex: 8, markerLineId: 'line_20_0' },
    { blockIndex: 11, markerLineId: 'line_23_0' },
  ])('keeps the source marker separate from translated body for block $blockIndex', async ({ blockIndex, markerLineId }) => {
    const page = JSON.parse(readFileSync(join(process.cwd(), 'public/pages/page_086/page_086_dom.json'), 'utf8')) as PageData;
    const proposal = JSON.parse(readFileSync(join(process.cwd(), '../../docs/translations/proposals/page-086-variants-choice-proposal-2026-10-24-v2.json'), 'utf8'));
    const candidate = proposal.candidates.find((item: { blockIndex: number }) => item.blockIndex === blockIndex);
    expect(candidate?.reviewLayoutFrame).toBeTruthy();
    const key = `page_86_block_${blockIndex}__pt-BR`;
    const rendererKey = `page_86_block_${blockIndex}`;
    const override = { ...candidate.data, spanKey: key } as SpanOverride;
    const frame = candidate.reviewLayoutFrame as LayoutFrame;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer
        pageData={{ ...page, images: [] }}
        isAdmin={false}
        language="pt-BR"
        persistedReviewDraftOverrides={new Map([[key, override]])}
        persistedReviewDraftLayoutFrames={new Map([[rendererKey, frame]])}
        isolatedSnapshot
      />);
    });

    const renderedBlock = container.querySelector<HTMLElement>(`[data-rendered-translation-key="${key}"]`)?.closest('.block-container') as HTMLElement | null;
    const renderedBody = container.querySelector<HTMLElement>(`[data-rendered-translation-key="${key}"]`);
    const sourceMarker = container.querySelector<HTMLElement>(`[data-list-marker-line="${markerLineId}"]`);
    const sourceMarkerPaint = sourceMarker?.querySelector<HTMLElement>(`[data-source-line-id="${markerLineId}"]`);
    expect(renderedBlock).toBeTruthy();
    expect(renderedBody?.textContent?.trim()).not.toMatch(/^[•●◦▪]\s*/u);
    expect(sourceMarker?.textContent?.trim()).toBe('•');
    const pageScale = Number.parseFloat(container.querySelector<HTMLElement>('.page-container')!.style.width) / page.width;
    expect(Number.parseFloat(renderedBlock!.style.width)).toBeCloseTo(frame.width * pageScale, 4);
    const markerData = page.blocks.flatMap(block => block.lines).find(line => line.id === markerLineId);
    const sourceMarkerX = Number((markerData as any)?.availableX ?? markerData?.bbox[0]);
    expect(sourceMarkerPaint).toBeTruthy();
    expect(Number.isFinite(sourceMarkerX)).toBe(true);
    expect(frame.x).toBeGreaterThan(sourceMarkerX + 10);
    expect(Number.parseFloat(renderedBlock!.style.left)).toBeCloseTo(frame.x * pageScale, 4);
    expect(Number.parseFloat(sourceMarkerPaint!.style.left)).toBeCloseTo((sourceMarkerX - frame.x) * pageScale, 4);
  });

  it('flows whole-block review bullets in the source hanging indent and keeps surrounding prose unindented', async () => {
    const page = JSON.parse(readFileSync(join(process.cwd(), 'public/pages/page_086/page_086_dom.json'), 'utf8')) as PageData;
    const proposal = JSON.parse(readFileSync(join(process.cwd(), '../../docs/translations/proposals/page-086-variants-choice-proposal-2026-10-24-v2.json'), 'utf8'));
    const candidate = proposal.candidates.find((item: { blockIndex: number }) => item.blockIndex === 20);
    const key = 'page_86_block_20__pt-BR';
    const override = { ...candidate.data, spanKey: key } as SpanOverride;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer
        pageData={{ ...page, images: [] }}
        isAdmin={false}
        language="pt-BR"
        persistedReviewDraftOverrides={new Map([[key, override]])}
        persistedReviewDraftKeys={new Map([[key, 'review-page86-block20']])}
        isolatedSnapshot
      />);
    });

    const flow = container.querySelector<HTMLElement>('[data-source-bullet-flow="true"]');
    const markerRows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-bullet-flow-row]'));
    const firstBody = container.querySelector<HTMLElement>('[data-source-bullet-flow-body="line_34_14"]');
    const secondBody = container.querySelector<HTMLElement>('[data-source-bullet-flow-body="line_34_17"]');
    const sourceMarkerLines = Array.from(container.querySelectorAll<HTMLElement>('[data-list-marker-line="line_34_14"], [data-list-marker-line="line_34_17"]'));
    const renderedText = container.querySelector<HTMLElement>(`[data-rendered-translation-key="${key}"]`)?.textContent ?? '';
    const pageScale = Number.parseFloat(container.querySelector<HTMLElement>('.page-container')!.style.width) / page.width;
    const block = page.blocks.find(item => item.id === 'block_34')!;
    const marker1 = block.lines[14];
    const body1 = block.lines[15];

    expect(flow).toBeTruthy();
    expect(markerRows.map(row => row.dataset.sourceBulletFlowRow)).toEqual(['line_34_14', 'line_34_17']);
    expect(firstBody?.textContent?.trimStart()).toMatch(/^O 5º Aventureiro/u);
    expect(secondBody?.textContent?.trimStart()).toMatch(/^O HP máximo/u);
    expect(firstBody?.textContent).not.toMatch(/^[•●◦▪]/u);
    expect(secondBody?.textContent).not.toMatch(/^[•●◦▪]/u);
    expect(sourceMarkerLines).toHaveLength(0);
    expect(flow?.textContent).toContain('Por exemplo, uma Cave Sickle');
    expect(flow?.textContent).toContain('Essa não é a forma recomendada');
    expect(renderedText).toContain('5º Jogador\n\nA quantidade de jogadores');
    expect(Number.parseFloat(markerRows[0].style.gridTemplateColumns)).toBeCloseTo(18 * pageScale, 3);
    expect(Number.parseFloat(firstBody!.style.left || '0')).toBe(0);
    expect(body1.bbox[0] - marker1.bbox[0]).toBeCloseTo(18, 2);
  });
});
