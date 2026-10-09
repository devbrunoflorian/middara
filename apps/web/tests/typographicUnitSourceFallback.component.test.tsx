import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
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

describe('typographic unit source fallback', () => {
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
