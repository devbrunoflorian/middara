import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';

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
});
