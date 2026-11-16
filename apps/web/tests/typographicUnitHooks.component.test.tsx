import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { attachSourceCompoundElements, type SourceCompoundElement } from '../src/symbols/sourceCompounds';

function readP40Fixture(): PageData {
  const pageDir = join(process.cwd(), 'public/pages/page_040');
  const pageData = JSON.parse(readFileSync(join(pageDir, 'page_040_dom.json'), 'utf8')) as PageData;
  const inlinePath = join(pageDir, 'inline_elements.json');
  const compoundsPath = join(pageDir, 'compound_elements.json');
  const inlineElements = existsSync(inlinePath)
    ? JSON.parse(readFileSync(inlinePath, 'utf8')).elements as SourceInlineElement[]
    : [];
  const sourceCompounds = existsSync(compoundsPath)
    ? JSON.parse(readFileSync(compoundsPath, 'utf8')).elements as SourceCompoundElement[]
    : [];
  const testedBlockIds = new Set(['block_8', 'block_10', 'block_37']);
  const blocks = pageData.blocks.filter(block => testedBlockIds.has(block.id));

  return {
    ...pageData,
    images: pageData.images ?? [],
    backgroundUrl: '/pages/page_040/background.webp',
    sourceCompounds,
    inlineElements,
    blocks: attachSourceInlineElements(attachSourceCompoundElements(blocks, sourceCompounds), inlineElements),
  };
}

describe('p. 40 typographic unit Hook order', () => {
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

  it('keeps Hook order while switching sourceGeometry, locale, and Admin rendering paths', async () => {
    const pageData = readP40Fixture();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const hookDiagnostics = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderPage = async (isAdmin: boolean, language: 'en' | 'pt-BR') => {
      await act(async () => {
        root!.render(<PageRenderer pageData={pageData} isAdmin={isAdmin} language={language} />);
      });
    };

    // Untouched English takes TypographicUnitBlock's early sourceGeometry return.
    await renderPage(false, 'en');
    expect(container.querySelector('[data-source-line-id="line_8_3"]')).not.toBeNull();
    expect(container.querySelector('[data-source-compound="marker.reference.b"]')).not.toBeNull();

    // Admin mode and PT-BR both take the translated-flow branch on that same fiber.
    await renderPage(true, 'en');
    await renderPage(false, 'pt-BR');
    await renderPage(true, 'pt-BR');
    await renderPage(false, 'en');

    expect(container.querySelector('[data-source-line-id="line_8_3"]')).not.toBeNull();

    // The p. 40 span split across two PDF baselines remains painted at both exact origins.
    const sourceBaselines = Array.from(container.querySelectorAll<SVGTextElement>('text[data-source-baseline-y]'))
      .map(element => Number(element.getAttribute('data-source-baseline-y')));
    expect(sourceBaselines.some(value => Math.abs(value - 382.4147033691406) < 0.001)).toBe(true);
    expect(sourceBaselines.some(value => Math.abs(value - 381.4147033691406) < 0.001)).toBe(true);

    const hookErrors = hookDiagnostics.mock.calls.flat().join(' ');
    expect(hookErrors).not.toMatch(/change in the order of Hooks|Rendered (more|fewer) hooks/i);
    hookDiagnostics.mockRestore();
  });
});
