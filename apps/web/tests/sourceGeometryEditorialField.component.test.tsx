import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, mapPdfFont, overrideIsSourceEquivalent, type PageData } from '../src/components/PageRenderer';
import { attachSourceInlineElements } from '../src/symbols/sourceInlineElements';
import type { SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';

describe('source geometry for editorial fields', () => {
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
    if (previousRangeClientRects) Object.defineProperty(Range.prototype, 'getClientRects', previousRangeClientRects);
    else delete (Range.prototype as Range & { getClientRects?: () => DOMRectList }).getClientRects;
    previousRangeClientRects = undefined;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('renders P78 Body/Example fields at their extracted PDF baselines and keeps the bullet on its source line', async () => {
    const pagePath = join(process.cwd(), 'public/pages/page_078/page_078_dom.json');
    const page = JSON.parse(readFileSync(pagePath, 'utf8')) as PageData;
    const inlinePath = join(process.cwd(), 'public/pages/page_078/inline_elements.json');
    const inlineElements = (JSON.parse(readFileSync(inlinePath, 'utf8')) as { elements: SourceInlineElement[] }).elements;
    page.images = [];
    page.blocks = page.blocks.filter(block => ['block_16', 'block_18', 'block_20', 'block_21', 'block_22'].includes(block.id));
    page.blocks = attachSourceInlineElements(page.blocks, inlineElements);
    page.inlineElements = inlineElements;
    page.fidelityOverlays = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<PageRenderer pageData={page} isAdmin={false} language="en" />);
    });

    const sourceBaselines = [
      ['line_16_1', 236.034423828125],
      ['line_16_3', 261.034423828125],
      ['line_18_3', 364.7037048339844],
      ['line_20_13', 566.0422973632812],
      ['line_21_1', 648.7114868164062],
      ['line_21_6', 707.7114868164062],
    ] as const;

    for (const [lineId, expectedBaseline] of sourceBaselines) {
      const renderedLine = container.querySelector<SVGGElement>(
        `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${lineId}"]`,
      );
      expect(renderedLine, lineId).not.toBeNull();
      expect(Number(renderedLine!.getAttribute('data-source-baseline-y'))).toBeCloseTo(expectedBaseline, 4);
    }

    const firstExampleLine = container.querySelector<SVGGElement>(
      'svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="line_16_3"]',
    )!;
    const firstExampleBlock = page.blocks.find(block => block.id === 'block_16')!;
    const firstExampleSvg = firstExampleLine.closest<SVGSVGElement>('svg[data-source-geometry="pdf-coordinates"]')!;
    expect(firstExampleSvg).not.toBeNull();

    const bulletMarker = container.querySelector<HTMLElement>('[data-source-line-id="line_16_0"]');
    expect(bulletMarker).not.toBeNull();
    expect(bulletMarker!.closest('.credit-field')).toBeNull();
    expect(firstExampleSvg.querySelectorAll('[data-source-symbol-id]')).toHaveLength(4);

    const panelBlock = page.blocks.find(block => block.id === 'block_22')!;
    expect(panelBlock.typographicUnits).toHaveLength(5);
    for (const [lineId, expectedBaseline] of [
      ['line_22_8', 660.720703125],
      ['line_22_21', 751.5552978515625],
    ] as const) {
      const panelLine = container.querySelector<SVGGElement>(
        `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${lineId}"]`,
      );
      expect(panelLine, lineId).not.toBeNull();
      expect(Number(panelLine!.getAttribute('data-source-baseline-y'))).toBeCloseTo(expectedBaseline, 3);
    }
    expect(container.querySelectorAll('svg[data-source-symbol-id="dice.teal"]')).toHaveLength(4);
  });

  it('keeps untouched P78 EN source composition identical while toggling Admin', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/page_078_dom.json'), 'utf8',
    )) as PageData;
    const inlineElements = (JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/inline_elements.json'), 'utf8',
    )) as { elements: SourceInlineElement[] }).elements;
    page.images = [];
    page.blocks = attachSourceInlineElements(page.blocks.filter(block => block.id === 'block_18'), inlineElements);
    page.inlineElements = inlineElements;
    page.fidelityOverlays = [];
    const unit = page.blocks[0].typographicUnits?.find(candidate =>
      candidate.id === 'p78-gigas-grip-equip-1hand-example',
    );
    expect(unit).toBeDefined();
    const lineIds = unit!.field.lineIds;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const renderMode = async (isAdmin: boolean) => {
      await act(async () => {
        root!.render(<PageRenderer pageData={page} isAdmin={isAdmin} language="en" />);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    };
    const sourceComposition = () => lineIds.map(lineId => {
      const line = container!.querySelector<SVGGElement>(
        `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${lineId}"]`,
      );
      if (!line) return { lineId, missingSourceLine: true };
      return {
        lineId,
        baseline: line.getAttribute('data-source-baseline-y'),
        spans: Array.from(line.querySelectorAll<SVGTextElement>('text[data-source-span]')).map(span => ({
          text: span.textContent,
          x: span.getAttribute('data-source-x'),
          baseline: span.getAttribute('data-source-baseline-y'),
          bbox: span.getAttribute('data-source-bbox'),
          textLength: span.getAttribute('textLength'),
          fontFamily: span.style.fontFamily,
          fontSize: span.style.fontSize,
          fontWeight: span.style.fontWeight,
          fontStyle: span.style.fontStyle,
        })),
        symbols: Array.from(line.querySelectorAll<SVGSVGElement>('svg[data-source-symbol-id]')).map(symbol => ({
          id: symbol.getAttribute('data-source-symbol-id'),
          x: symbol.getAttribute('data-source-x'),
          y: symbol.getAttribute('data-source-y'),
          bbox: symbol.getAttribute('data-source-bbox'),
        })),
      };
    });

    await renderMode(false);
    const viewerComposition = sourceComposition();
    expect(viewerComposition.every(line => !('missingSourceLine' in line))).toBe(true);
    expect(viewerComposition).toHaveLength(6);
    expect(viewerComposition.flatMap(line => 'symbols' in line ? line.symbols : [])).toHaveLength(2);

    for (const isAdmin of [true, false, true]) {
      await renderMode(isAdmin);
      expect(sourceComposition()).toEqual(viewerComposition);
      if (isAdmin) {
        const field = container!.querySelector<HTMLElement>(
          '[data-admin-geometry-key="page_78_unit_p78-gigas-grip-equip-1hand-example__en"]',
        );
        expect(field?.classList.contains('credit-edit-field')).toBe(true);
        expect(field?.querySelector('.realbox')).toBeNull();
        // The normal field target remains clickable while its text uses source geometry.
        await act(async () => { field?.click(); });
        expect(field?.classList.contains('credit-field-selected')).toBe(true);
        expect(sourceComposition()).toEqual(viewerComposition);
      }
    }
  });

  it('keeps normal P78 blocks source-identical in Admin and preserves nested span targets', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/page_078_dom.json'), 'utf8',
    )) as PageData;
    const inlineElements = (JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/inline_elements.json'), 'utf8',
    )) as { elements: SourceInlineElement[] }).elements;
    const blockIds = ['block_12', 'block_15', 'block_25'];
    const sourceBlocks = page.blocks.filter(block => blockIds.includes(block.id));
    expect(sourceBlocks.find(block => block.id === 'block_25')?.typographicSpanUnits?.length).toBeGreaterThan(0);
    page.images = [];
    page.blocks = attachSourceInlineElements(sourceBlocks, inlineElements);
    page.inlineElements = inlineElements;
    page.fidelityOverlays = [];
    const lineIds = page.blocks.flatMap(block => (block.lines ?? []).map(line => line.id));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const renderMode = async (isAdmin: boolean) => {
      await act(async () => {
        root!.render(<PageRenderer pageData={page} isAdmin={isAdmin} language="en" />);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    };
    const sourceComposition = () => lineIds.map(lineId => {
      const line = container!.querySelector<SVGGElement>(
        `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${lineId}"]`,
      );
      if (!line) return { lineId, missingSourceLine: true };
      return {
        lineId,
        baseline: line.getAttribute('data-source-baseline-y'),
        spans: Array.from(line.querySelectorAll<SVGTextElement>('text[data-source-span]')).map(span => ({
          text: span.textContent,
          x: span.getAttribute('data-source-x'),
          baseline: span.getAttribute('data-source-baseline-y'),
          bbox: span.getAttribute('data-source-bbox'),
          textLength: span.getAttribute('textLength'),
          fontFamily: span.style.fontFamily,
          fontSize: span.style.fontSize,
          fontWeight: span.style.fontWeight,
          fontStyle: span.style.fontStyle,
        })),
        symbols: Array.from(line.querySelectorAll<SVGSVGElement>('svg[data-source-symbol-id]')).map(symbol => ({
          id: symbol.getAttribute('data-source-symbol-id'),
          x: symbol.getAttribute('data-source-x'),
          y: symbol.getAttribute('data-source-y'),
          bbox: symbol.getAttribute('data-source-bbox'),
        })),
      };
    });

    await renderMode(false);
    const viewerComposition = sourceComposition();
    expect(viewerComposition.every(line => !('missingSourceLine' in line))).toBe(true);
    expect(viewerComposition.flatMap(line => 'symbols' in line ? line.symbols : []).length).toBeGreaterThan(0);
    expect(container!.querySelectorAll('text[data-source-span]').length).toBeGreaterThan(0);

    for (const isAdmin of [true, false, true]) {
      await renderMode(isAdmin);
      expect(sourceComposition()).toEqual(viewerComposition);
      if (isAdmin) {
        const hitTarget = container!.querySelector<HTMLElement>(
          '[data-source-inline-hit-target="page_78_unit_p78-block-25-font-size-9pt-unit-01__en"]',
        );
        expect(hitTarget).not.toBeNull();
        await act(async () => {
          hitTarget!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(hitTarget!.classList.contains('span-selected')).toBe(true);
        expect(sourceComposition()).toEqual(viewerComposition);
      }
    }
  });

  it('reloads a source-equivalent normal EN block from Payload into source geometry', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/page_078_dom.json'), 'utf8',
    )) as PageData;
    const sourceBlock = page.blocks.find(block => block.id === 'block_12')!;
    const block = { ...sourceBlock, editorKey: 'p78-normal-heading-source-equivalent' };
    const sourceSegments = sourceSpanRuns(block.lines!.flatMap(line => line.spans), mapPdfFont)
      .map(segment => ({ ...segment, text: segment.text.replace(/[\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim() }))
      .filter(segment => segment.text.length > 0);
    const spanKey = `${block.editorKey}__en`;
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => ({
      ok: true,
      json: async () => String(input).includes('/api/translations')
        ? { docs: [{ spanKey, data: { schemaVersion: 2, segments: sourceSegments } }] }
        : { docs: [] },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const initialStorage = JSON.stringify(Object.entries(localStorage));
    const fixture = { ...page, blocks: [block], images: [], fidelityOverlays: [] };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={fixture} isAdmin={false} language="en" />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.querySelector('svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="line_12_0"]')).not.toBeNull();

    await act(async () => {
      root!.render(<PageRenderer pageData={fixture} isAdmin language="en" />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.querySelector('svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="line_12_0"]')).not.toBeNull();

    await act(async () => root!.unmount());
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={fixture} isAdmin language="en" />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.querySelector('svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="line_12_0"]')).not.toBeNull();
    expect(container.querySelector('.realbox')).toBeNull();
    expect(JSON.stringify(Object.entries(localStorage))).toBe(initialStorage);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method.toUpperCase() === 'GET')).toBe(true);
  });

  it('keeps non-source-equivalent normal EN overrides in editable flow', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/page_078_dom.json'), 'utf8',
    )) as PageData;
    const sourceBlock = page.blocks.find(block => block.id === 'block_12')!;
    const block = { ...sourceBlock, editorKey: 'p78-normal-heading-edited' };
    const sourceSegments = sourceSpanRuns(block.lines!.flatMap(line => line.spans), mapPdfFont)
      .map(segment => ({ ...segment, text: segment.text.replace(/[\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim() }))
      .filter(segment => segment.text.length > 0);
    const spanKey = `${block.editorKey}__en`;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string | URL) => ({
      ok: true,
      json: async () => String(input).includes('/api/translations')
        ? { docs: [{ spanKey, data: { schemaVersion: 2, segments: [{ ...sourceSegments[0], text: 'Gigas  Grip' }] } }] }
        : { docs: [] },
    })));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const fixture = { ...page, blocks: [block], images: [], fidelityOverlays: [] };

    for (const isAdmin of [false, true]) {
      await act(async () => {
        root!.render(<PageRenderer pageData={fixture} isAdmin={isAdmin} language="en" />);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(container.querySelector('.realbox')).not.toBeNull();
      expect(container.querySelector('svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="line_12_0"]')).toBeNull();
      expect(container.textContent).toContain('Gigas  Grip');
    }
  });

  it('uses traced glyph width instead of the extraction bbox width when a source line ends with a newline', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/page_078_dom.json'),
      'utf8',
    )) as PageData;
    page.images = [];
    page.blocks = page.blocks.filter(block => ['block_12', 'block_16'].includes(block.id));
    page.fidelityOverlays = [];

    const headingSpan = page.blocks.find(block => block.id === 'block_12')!.lines![0].spans[0];
    const bodyLineSpan = page.blocks.find(block => block.id === 'block_16')!.lines!.find(line => line.id === 'line_16_2')!.spans[0];
    expect(headingSpan.text).toBe('Gigas Grip\n');
    expect(bodyLineSpan.text.endsWith('\n')).toBe(true);
    expect(headingSpan.sourceVisualWidthPt).toBeCloseTo(68.68798, 3);
    expect(bodyLineSpan.sourceVisualWidthPt).toBeCloseTo(198.78995, 3);
    expect(headingSpan.bbox[2] - headingSpan.origin![0]).toBeCloseTo(71.6878, 3);
    expect(bodyLineSpan.bbox[2] - bodyLineSpan.origin![0]).toBeCloseTo(201.56995, 3);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={page} isAdmin={false} language="en" />);
    });

    for (const [lineId, expectedWidth] of [
      ['line_12_0', 68.68798],
      ['line_16_2', 198.78995],
    ] as const) {
      const text = container.querySelector<SVGTextElement>(
        `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${lineId}"] text[data-source-span]`,
      );
      expect(text, lineId).not.toBeNull();
      expect(Number(text!.getAttribute('textLength')), lineId).toBeCloseTo(expectedWidth, 3);
    }
  });

  it('keeps a source-identical saved EN override on its exact source geometry', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/page_078_dom.json'),
      'utf8',
    )) as PageData;
    const inlineElements = (JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_078/inline_elements.json'),
      'utf8',
    )) as { elements: SourceInlineElement[] }).elements;
    page.images = [];
    page.blocks = page.blocks.filter(block => ['block_16', 'block_18', 'block_20'].includes(block.id));
    page.blocks = attachSourceInlineElements(page.blocks, inlineElements);
    page.inlineElements = inlineElements;
    page.fidelityOverlays = [];

    const block = page.blocks.find(candidate => candidate.id === 'block_16')!;
    const unit = block.typographicUnits!.find(candidate => candidate.id === 'p78-gigas-grip-item-2-example')!;
    const sourceLines = block.lines!.filter(line => unit.field.lineIds.includes(line.id));
    const extractedSegments = sourceSpanRuns(sourceLines.flatMap(line => line.spans), font => {
      const bold = font.includes('Bold');
      const italic = font.includes('Italic');
      return { weight: bold ? 700 : 400, style: italic ? 'italic' : 'normal' };
    }).map(segment => ({ ...segment, text: segment.text.replace(/[\r\n]+/gu, ' ') }));
    // Match RichSpanEditor's paragraph input: PDF line endings and repeated
    // extraction whitespace become one editorial space, while style runs stay intact.
    const sourceSegments: typeof extractedSegments = [];
    let pendingSpace: (typeof extractedSegments)[number] | null = null;
    let hasContent = false;
    for (const segment of extractedSegments) {
      if (segment.symbolId) {
        if (pendingSpace && hasContent) sourceSegments.push(pendingSpace);
        pendingSpace = null;
        sourceSegments.push({ ...segment });
        hasContent = true;
        continue;
      }
      for (const chunk of segment.text.split(/(\s+)/u)) {
        if (!chunk) continue;
        if (/^\s+$/u.test(chunk)) {
          if (hasContent && !pendingSpace) pendingSpace = { ...segment, text: ' ' };
          continue;
        }
        if (pendingSpace) sourceSegments.push(pendingSpace);
        pendingSpace = null;
        sourceSegments.push({ ...segment, text: chunk });
        hasContent = true;
      }
    }
    const spanKey = `page_78_unit_${unit.id}__en`;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string | URL) => ({
      ok: true,
      json: async () => String(input).includes('/api/translations')
        ? { docs: [{ spanKey, data: { schemaVersion: 2, segments: sourceSegments, lineHeight: 1.1 } }] }
        : { docs: [] },
    })));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={page} isAdmin={false} language="en" />);
    });
    await act(async () => { await Promise.resolve(); });

    const renderedLine = container.querySelector<SVGGElement>(
      'svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="line_16_3"]',
    );
    expect(renderedLine).not.toBeNull();
    expect(Number(renderedLine!.getAttribute('data-source-baseline-y'))).toBeCloseTo(261.034423828125, 4);
    expect(renderedLine!.closest('svg[data-source-geometry="pdf-coordinates"]')?.querySelectorAll('[data-source-symbol-id]')).toHaveLength(4);

    const composition = () => unit.field.lineIds.map(lineId => {
      const line = container!.querySelector<SVGGElement>(
        `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${lineId}"]`,
      );
      return line && {
        lineId,
        baseline: line.getAttribute('data-source-baseline-y'),
        text: Array.from(line.querySelectorAll<SVGTextElement>('text[data-source-span]')).map(span => ({
          text: span.textContent,
          x: span.getAttribute('data-source-x'),
          y: span.getAttribute('data-source-baseline-y'),
          length: span.getAttribute('textLength'),
          weight: span.style.fontWeight,
          style: span.style.fontStyle,
        })),
        symbols: Array.from(line.querySelectorAll<SVGSVGElement>('svg[data-source-symbol-id]')).map(symbol => ({
          id: symbol.getAttribute('data-source-symbol-id'),
          bbox: symbol.getAttribute('data-source-bbox'),
        })),
      };
    });
    const viewerComposition = composition();
    await act(async () => {
      root!.render(<PageRenderer pageData={page} isAdmin language="en" />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(composition()).toEqual(viewerComposition);
  });

  it('uses exact source geometry for P13 label, step and Note fields without absorbing the list marker', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_013/page_013_dom.json'),
      'utf8',
    )) as PageData;
    page.images = [];
    page.blocks = page.blocks.filter(block => ['block_19', 'block_24'].includes(block.id));
    page.fidelityOverlays = [];

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={page} isAdmin={false} language="en" />);
    });

    for (const [lineId, expectedBaseline] of [
      ['line_19_0', 288.43603515625],
      ['line_19_1', 302.26605224609375],
      ['line_24_1', 448.3478088378906],
      ['line_24_14', 585.1824951171875],
    ] as const) {
      const sourceLine = container.querySelector<SVGGElement>(
        `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${lineId}"]`,
      );
      expect(sourceLine, lineId).not.toBeNull();
      expect(Number(sourceLine!.getAttribute('data-source-baseline-y'))).toBeCloseTo(expectedBaseline, 3);
    }

    const listMarker = container.querySelector<HTMLElement>('[data-source-line-id="line_24_0"]');
    expect(listMarker).not.toBeNull();
    expect(listMarker!.closest('.credit-field')).toBeNull();
  });

  it('keeps P24 heading and body source composition identical in Viewer and Admin', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_024/page_024_dom.json'),
      'utf8',
    )) as PageData;
    const block = page.blocks.find(candidate => candidate.id === 'block_36')!;
    expect(block.typographicUnits?.map(unit => unit.field.lineIds)).toEqual([
      ['line_36_0'],
      ['line_36_2', 'line_36_3', 'line_36_4', 'line_36_5'],
    ]);
    page.images = [];
    page.blocks = [block];
    page.fidelityOverlays = [];

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const renderMode = async (isAdmin: boolean) => {
      await act(async () => {
        root!.render(<PageRenderer pageData={page} isAdmin={isAdmin} language="en" />);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    };
    const composition = () => ['line_36_0', 'line_36_2', 'line_36_3', 'line_36_4', 'line_36_5'].map(lineId => {
      const line = container!.querySelector<SVGGElement>(
        `svg[data-source-geometry="pdf-coordinates"] g[data-source-line-id="${lineId}"]`,
      );
      if (!line) return { lineId, missingSourceLine: true };
      return {
        lineId,
        baseline: line.getAttribute('data-source-baseline-y'),
        spans: Array.from(line.querySelectorAll<SVGTextElement>('text[data-source-span]')).map(span => ({
          text: span.textContent,
          x: span.getAttribute('data-source-x'),
          baseline: span.getAttribute('data-source-baseline-y'),
          bbox: span.getAttribute('data-source-bbox'),
          textLength: span.getAttribute('textLength'),
          style: span.getAttribute('style'),
        })),
        symbols: Array.from(line.querySelectorAll<SVGSVGElement>('svg[data-source-symbol-id]')).map(symbol => ({
          id: symbol.getAttribute('data-source-symbol-id'),
          bbox: symbol.getAttribute('data-source-bbox'),
        })),
      };
    });

    await renderMode(false);
    const viewerComposition = composition();
    expect(viewerComposition.every(line => !('missingSourceLine' in line))).toBe(true);
    await renderMode(true);
    expect(composition()).toEqual(viewerComposition);
    expect(container.querySelectorAll('[data-admin-geometry-key^="page_24_unit_"]')).toHaveLength(2);
  });

  it('uses measured PDF origins for an ordinary text-only block without semantic symbols', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_085/page_085_dom.json'),
      'utf8',
    )) as PageData;
    page.images = [];
    page.blocks = page.blocks.filter(block => block.id === 'block_9');
    page.fidelityOverlays = [];
    expect(page.blocks[0].lines!.flatMap(line => line.spans).some(span => span.semanticSymbolId)).toBe(false);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={page} isAdmin={false} language="en" />);
    });

    const sourceSvg = container.querySelector<SVGSVGElement>('svg[data-source-geometry="pdf-coordinates"]');
    expect(sourceSvg).not.toBeNull();
    for (const line of page.blocks[0].lines!) {
      const renderedLine = sourceSvg!.querySelector<SVGGElement>(`g[data-source-line-id="${line.id}"]`);
      expect(renderedLine, line.id).not.toBeNull();
      const sourceBaseline = line.spans.find(span => span.origin)?.origin?.[1];
      expect(Number(renderedLine!.getAttribute('data-source-baseline-y'))).toBeCloseTo(sourceBaseline!, 4);
    }
  });

  it('keeps Esmeralda alternate-glyph headings on the existing font-aware renderer', async () => {
    const page = JSON.parse(readFileSync(
      join(process.cwd(), 'public/pages/page_024/page_024_dom.json'),
      'utf8',
    )) as PageData;
    page.images = [];
    page.blocks = page.blocks.filter(block => block.id === 'block_55');
    page.fidelityOverlays = [];
    const titleSpan = page.blocks[0].lines![0].spans[0];
    expect(titleSpan.displayOverride).not.toBe(titleSpan.text);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PageRenderer pageData={page} isAdmin={false} language="en" />);
    });

    expect(container.querySelector('svg[data-source-geometry="pdf-coordinates"]')).toBeNull();
    expect(container.querySelector('[data-source-line-id="line_55_0"]')).not.toBeNull();
  });

  it('does not treat a same-text override with changed rich styles as source-equivalent', () => {
    const sourceSegments = [{
      text: 'Important:', font: 'OptimaLTStd-Black', size: 10, color: '#ffffff', weight: 900,
      style: 'normal' as const, disableLigatures: true,
    }];
    const sourceLayout = { textAlign: 'left' as const, lineHeight: 1.1 };
    expect(overrideIsSourceEquivalent({ segments: sourceSegments } as any, sourceSegments, sourceLayout)).toBe(true);
    expect(overrideIsSourceEquivalent({
      segments: [{ ...sourceSegments[0], color: '#ff0000' }],
    } as any, sourceSegments, sourceLayout)).toBe(false);
    expect(overrideIsSourceEquivalent({ segments: sourceSegments, lineHeight: 1.2 } as any, sourceSegments, sourceLayout)).toBe(false);
    expect(overrideIsSourceEquivalent({ segments: sourceSegments, textAlign: 'center' } as any, sourceSegments, sourceLayout)).toBe(false);
  });

  it('keeps meaningful whitespace changes on flow and returns removed whitespace to source', () => {
    const sourceSegments = [{ text: 'One phrase follows.', font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const }];
    const sourceLayout = { textAlign: 'left' as const, lineHeight: 1.1 };
    expect(overrideIsSourceEquivalent({ segments: sourceSegments } as any, sourceSegments, sourceLayout)).toBe(true);
    expect(overrideIsSourceEquivalent({
      segments: [{ ...sourceSegments[0], text: 'One  phrase follows.' }],
    } as any, sourceSegments, sourceLayout)).toBe(false);
    expect(overrideIsSourceEquivalent({
      segments: [{ ...sourceSegments[0], text: 'One phrase follows.' }],
    } as any, sourceSegments, sourceLayout)).toBe(true);
    expect(overrideIsSourceEquivalent({
      segments: [{ ...sourceSegments[0], text: 'One phrase\nfollows.' }],
    } as any, sourceSegments, sourceLayout)).toBe(false);
  });
});
