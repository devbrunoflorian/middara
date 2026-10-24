import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import type { SpanOverride } from '../src/components/RichSpanEditor';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';

function readP50UnitFixture(): PageData {
  const pageDir = join(process.cwd(), 'public/pages/page_050');
  const pageData = JSON.parse(readFileSync(join(pageDir, 'page_050_dom.json'), 'utf8')) as PageData;
  const block = pageData.blocks.find(candidate => candidate.id === 'block_14');
  if (!block) throw new Error('Expected p. 50 Flanking Examples block_14');
  return {
    ...pageData,
    images: pageData.images ?? [],
    backgroundUrl: '/pages/page_050/background.webp',
    blocks: [block],
  };
}

function readP19RemovalParagraphFixture(): PageData {
  const pageDir = join(process.cwd(), 'public/pages/page_019');
  const pageData = JSON.parse(readFileSync(join(pageDir, 'page_019_dom.json'), 'utf8')) as PageData;
  const block = pageData.blocks.find(candidate => candidate.id === 'block_35');
  if (!block) throw new Error('Expected p. 19 removal-tokens block_35');
  return {
    ...pageData,
    images: [],
    fidelityOverlays: [],
    backgroundUrl: '/pages/page_019/background.webp',
    blocks: [block],
  };
}

function readP102DiceLegendFixture(): PageData {
  const pageDir = join(process.cwd(), 'public/pages/page_102');
  const pageData = JSON.parse(readFileSync(join(pageDir, 'page_102_dom.json'), 'utf8')) as PageData;
  const block = pageData.blocks.find(candidate => candidate.id === 'block_21');
  if (!block) throw new Error('Expected p.102 dice-symbol legend block_21');
  return {
    ...pageData,
    images: pageData.images ?? [],
    fidelityOverlays: [],
    backgroundUrl: '/pages/page_102/background.webp',
    blocks: [block],
  };
}

function readP102SkullLabelFixture(): PageData {
  const pageDir = join(process.cwd(), 'public/pages/page_102');
  const pageData = JSON.parse(readFileSync(join(pageDir, 'page_102_dom.json'), 'utf8')) as PageData;
  const block = pageData.blocks.find(candidate => candidate.id === 'block_20');
  if (!block) throw new Error('Expected p.102 vertical SKULL label block_20');
  return {
    ...pageData,
    images: pageData.images ?? [],
    fidelityOverlays: [],
    backgroundUrl: '/pages/page_102/background.webp',
    blocks: [block],
  };
}

describe('typographic unit source fallback', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  let restoreRangeRects = () => {};

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
    restoreRangeRects();
    restoreRangeRects = () => {};
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('uses exact source geometry once while keeping all editorial units editable in Admin', async () => {
    const pageData = readP50UnitFixture();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin={false} language="en" />);
    });

    // Viewer mode can paint the untouched EN block at exact source coordinates;
    // overlapping fixed indexes must not cause a second copy of its lines.
    expect(container.querySelector('[data-render-mode="sourceGeometry"]')).not.toBeNull();
    expect(container.querySelectorAll('.credit-field')).toHaveLength(0);
    expect(container.querySelectorAll('.static-editor-line')).toHaveLength(0);
    for (const sourceLine of pageData.blocks[0].lines ?? []) {
      expect(container.querySelectorAll(`[data-source-line-id="${sourceLine.id}"]`), sourceLine.id).toHaveLength(1);
    }
    expect(container.textContent).toContain('Example 1:');
    expect(container.textContent).toContain('Example 10:');

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin language="en" />);
    });
    expect(container.querySelectorAll('.credit-field')).toHaveLength(10);
    expect(container.querySelectorAll('.static-editor-line')).toHaveLength(0);
  });

  it('flows two translated source bullets with their list entries without mutating proposal text', async () => {
    const pageData = readP19RemovalParagraphFixture();
    const block = pageData.blocks[0];
    const unit = block.typographicUnits!.find(candidate => candidate.id === 'p19-block-35-paragraph-2')!;
    const spanKey = `page_19_unit_${unit.id}__pt-BR`;
    const sourceMarkers = block.lines!.filter(line => unit.field.lineIds.includes(line.id)
      && line.spans.map(span => span.text).join('').trim() === '•');
    const sourceText = 'Por exemplo: uma ficha não poderá surgir depois de removida.\n'
      + '• Cartas de Item: continuam disponíveis na pilha correspondente.\n'
      + '• Remoção Permanente: o componente fica fora da Aventura.';
    const override: SpanOverride = {
      spanKey,
      bbox: unit.field.bbox,
      segments: [{
        text: sourceText, font: 'OptimaLTStd', size: 10, weight: 400, style: 'normal', color: '#231f20',
      }],
    };
    const originalRangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
    restoreRangeRects = () => {
      if (originalRangeRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRangeRects);
      else delete (Range.prototype as unknown as { getClientRects?: () => DOMRectList }).getClientRects;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PageRenderer
        pageData={pageData}
        isAdmin={false}
        language="pt-BR"
        isolatedSnapshot
        readOnlyExperiment
        experimentalOverrides={new Map([[spanKey, override]])}
      />);
      await Promise.resolve();
    });

    const renderedText = container.querySelector<HTMLElement>(`[data-rendered-translation-key="${spanKey}"]`);
    expect(sourceMarkers).toHaveLength(2);
    expect(renderedText).not.toBeNull();
    expect(renderedText!.textContent?.match(/•/gu)).toHaveLength(2);
    const flowedListRows = Array.from(renderedText!.querySelectorAll<HTMLElement>('.credit-paragraph'))
      .filter(paragraph => paragraph.style.display === 'grid');
    expect(flowedListRows).toHaveLength(2);
    expect(flowedListRows.every(paragraph => Number.parseFloat(paragraph.style.gridTemplateColumns) > 0)).toBe(true);
    expect(container.querySelector('[data-source-line-id="line_35_13"]')).toBeNull();
    expect(container.querySelector('[data-source-line-id="line_35_18"]')).toBeNull();
    expect(override.segments[0].text).toBe(sourceText);
  });

  it('keeps a rejected PT-BR diagnostic unit blank without English fallback or source-data deletion', async () => {
    const pageData = readP50UnitFixture();
    const originalSource = pageData.blocks[0].lines?.flatMap(line => line.spans.map(span => span.text)).join(' ');
    const blockKey = 'page_50_block_0';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PageRenderer
        pageData={pageData}
        isAdmin={false}
        language="pt-BR"
        proposalReviewDiagnosticBlankKeys={new Set([blockKey])}
      />);
      await Promise.resolve();
    });

    const blank = container.querySelector<HTMLElement>('.translation-review-diagnostic-blank');
    expect(blank).not.toBeNull();
    expect(blank!.dataset.translationReviewDiagnosticBlank).toBe(blockKey);
    expect(blank!.textContent).toBe('');
    expect(blank!.getAttribute('aria-label')).toContain('proposta completa permanece no painel de revisão');
    expect(container.textContent).not.toContain('Example 1:');
    expect(pageData.blocks[0].lines?.flatMap(line => line.spans.map(span => span.text)).join(' ')).toBe(originalSource);
    expect((vi.mocked(fetch).mock.calls as unknown as Array<[string | URL, RequestInit?]>).every(([, init]) =>
      !init?.method || init.method.toUpperCase() === 'GET')).toBe(true);
  });

  it('blanks only a rejected child typographic unit and keeps its same-block siblings visible', async () => {
    const pageData = readP102DiceLegendFixture();
    const burstUnit = pageData.blocks[0].typographicUnits!.find(unit => unit.id === 'p102-dice-symbol-burst')!;
    const burstLine = pageData.blocks[0].lines!.find(line => line.id === burstUnit.field.lineIds[0])!;
    const originalBurst = burstLine.spans.map(span => span.text).join('');
    const diagnosticKey = `page_102_unit_${burstUnit.id}__pt-BR`;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PageRenderer
        pageData={pageData}
        isAdmin={false}
        language="pt-BR"
        proposalReviewDiagnosticBlankKeys={new Set([diagnosticKey])}
      />);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('BURST');
    expect(container.textContent).toContain('BOOK');
    expect(container.textContent).toContain('SHIELD');
    expect(burstLine.spans.map(span => span.text).join('')).toBe(originalBurst);
    expect((vi.mocked(fetch).mock.calls as unknown as Array<[string | URL, RequestInit?]>).every(([, init]) =>
      !init?.method || init.method.toUpperCase() === 'GET')).toBe(true);
  });

  it('keeps the PDF vertical label orientation and rotates only the PT-BR proposal into its source box', async () => {
    const pageData = readP102SkullLabelFixture();
    const block = pageData.blocks[0];
    const unit = block.typographicUnits!.find(candidate => candidate.id === 'p102-skull-vertical-label')!;
    const spanKey = `page_102_unit_${unit.id}__pt-BR`;
    const lineId = unit.field.lineIds[0];
    const override: SpanOverride = {
      spanKey,
      bbox: unit.field.bbox,
      segments: [{
        text: 'CAVEIRA', font: 'OptimaLTStd-Bold', size: 8, weight: 700, style: 'normal', color: '#ffffff',
      }],
    };
    const originalRangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
    restoreRangeRects = () => {
      if (originalRangeRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRangeRects);
      else delete (Range.prototype as unknown as { getClientRects?: () => DOMRectList }).getClientRects;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PageRenderer pageData={pageData} isAdmin={false} language="en" isolatedSnapshot readOnlyExperiment />);
    });
    const sourceField = container.querySelector<HTMLElement>('.credit-field');
    const sourceLine = container.querySelector<HTMLElement>(`[data-source-line-id="${lineId}"]`);
    expect(sourceField).not.toBeNull();
    expect(sourceLine).not.toBeNull();
    expect(sourceField!.style.transform).toBe('');
    expect(sourceLine!.style.transform).toContain('rotate(90deg)');

    await act(async () => {
      root!.render(<PageRenderer
        pageData={pageData}
        isAdmin={false}
        language="pt-BR"
        isolatedSnapshot
        readOnlyExperiment
        experimentalOverrides={new Map([[spanKey, override]])}
        proposalReviewHighlightKey={spanKey}
      />);
      await Promise.resolve();
    });

    const translatedField = container.querySelector<HTMLElement>('.credit-field');
    const translatedText = translatedField?.querySelector<HTMLElement>(`[data-rendered-translation-key="${spanKey}"]`);
    expect(translatedField).not.toBeNull();
    expect(translatedField!.style.transform).toBe('rotate(90deg)');
    expect(translatedField!.classList.contains('proposal-review-highlight')).toBe(true);
    expect(translatedText?.textContent).toBe('CAVEIRA');
    expect(container.textContent).not.toContain('SKULL');
    const renderedWidth = Number.parseFloat(translatedField!.style.width);
    const renderedHeight = Number.parseFloat(translatedField!.style.minHeight);
    expect(renderedWidth).toBeGreaterThan(0);
    expect(renderedHeight).toBeGreaterThan(0);
    expect(renderedWidth / renderedHeight).toBeCloseTo(unit.field.frame.width / unit.field.frame.height, 3);
  });

  it('returns a plain source-equivalent override on another page to source lines', async () => {
    const pageData = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_050/page_050_dom.json'), 'utf8',
    )) as PageData;
    const block = pageData.blocks.find(candidate => candidate.id === 'block_13')!;
    const unit = block.typographicUnits!.find(candidate => candidate.id === 'p50-block-13-paragraph-5')!;
    const lineIds = new Set(unit.field.lineIds);
    const lines = block.lines!.filter(line => lineIds.has(line.id));
    const sourceSegments = sourceSpanRuns(lines.flatMap(line => line.spans), font => ({
      weight: font.includes('Bold') ? 700 : 400,
      style: font.includes('Italic') ? 'italic' : 'normal',
    })).map(segment => ({ ...segment, text: segment.text.replace(/[\r\n]+/gu, ' ') }));
    expect(sourceSegments.every(segment => !segment.symbolId)).toBe(true);
    const spanKey = `page_50_unit_${unit.id}__en`;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string | URL) => ({
      ok: true,
      json: async () => String(input).includes('/api/translations')
        ? { docs: [{ spanKey, data: { schemaVersion: 2, segments: sourceSegments, lineHeight: 1.1 } }] }
        : { docs: [] },
    })));

    const initialStorage = JSON.stringify(Object.entries(localStorage));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={{ ...pageData, blocks: [block], images: [], fidelityOverlays: [] }} isAdmin={false} language="en" />);
    });
    await act(async () => { await Promise.resolve(); });

    const field = container.querySelector<HTMLElement>(`[data-source-line-id="${unit.field.lineIds[0]}"]`);
    expect(field).not.toBeNull();
    const fieldContainer = field!.closest('.credit-field');
    expect(fieldContainer).not.toBeNull();
    expect(fieldContainer!.querySelector('.realbox')).toBeNull();

    await act(async () => {
      root!.render(<PageRenderer pageData={{ ...pageData, blocks: [block], images: [], fidelityOverlays: [] }} isAdmin language="en" />);
      await Promise.resolve();
    });
    const adminField = container.querySelector<HTMLElement>(
      `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${unit.field.lineIds[0]}"]`,
    );
    expect(adminField).not.toBeNull();
    expect(adminField!.closest('.credit-field')).not.toBeNull();
    expect(adminField!.closest('.credit-field')!.querySelector('.realbox')).toBeNull();
    expect(JSON.stringify(Object.entries(localStorage))).toBe(initialStorage);
    expect((vi.mocked(fetch).mock.calls as unknown as Array<[string | URL, RequestInit?]>).every(([, init]) =>
      !init?.method || init.method.toUpperCase() === 'GET')).toBe(true);
  });
});
