import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';

function readPage(pageNumber: number) {
  const pageId = String(pageNumber).padStart(3, '0');
  const pageDir = join(process.cwd(), 'public/pages', `page_${pageId}`);
  const data = JSON.parse(readFileSync(join(pageDir, `page_${pageId}_dom.json`), 'utf8')) as PageData;
  const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
  return {
    pageData: { ...data, blocks: attachSourceInlineElements(data.blocks, elements), inlineElements: elements } satisfies PageData,
    pageDir,
  };
}

describe('card component content below the shared 4pt triage filter', () => {
  it('opts in only the PDF-confirmed small labels on p. 49 and p. 67', () => {
    const p49 = JSON.parse(readFileSync(join(process.cwd(), 'public/pages/page_049/page_049_dom.json'), 'utf8')) as PageData;
    const shieldLabel = p49.blocks.find(block => block.id === 'block_96')?.lines?.find(line => line.id === 'line_96_2');
    expect(shieldLabel?.spans[0].text).toBe('SHIELD • MEDIUM SHIELD');
    expect(shieldLabel?.spans[0].size).toBeCloseTo(3.7846, 3);
    expect(shieldLabel).toMatchObject({ suspectedGhost: false, renderTinyText: true });

    const p67 = JSON.parse(readFileSync(join(process.cwd(), 'public/pages/page_067/page_067_dom.json'), 'utf8')) as PageData;
    const cuirassLabel = p67.blocks.find(block => block.id === 'block_85')?.lines?.find(line => line.id === 'line_85_2');
    expect(cuirassLabel?.spans[0].text).toBe('CUIRASS ');
    expect(cuirassLabel?.spans[0].size).toBeCloseTo(3.9763, 3);
    expect(cuirassLabel).toMatchObject({ suspectedGhost: false, renderTinyText: true });
    const cardNumber = p67.blocks.find(block => block.id === 'block_85')?.lines?.find(line => line.id === 'line_85_0');
    expect(cardNumber?.renderTinyText).toBeUndefined();
  });

  it('renders the PDF capsule fill as a background layer in both locales, beneath editable text', () => {
    const { pageData, pageDir } = readPage(67);
    const overlays = JSON.parse(readFileSync(join(pageDir, 'fidelity_overlays.json'), 'utf8')).overlays;
    const capsule = overlays.find((overlay: { region?: string }) => overlay.region === 'per-encounter-pill-background');
    expect(capsule).toMatchObject({
      bbox: [115.38510131835938, 727.1608276367188, 161.41510009765625, 733.247802734375],
      languageInvariant: true,
      zIndex: 5,
    });

    const vector = readFileSync(join(pageDir, 'per-encounter-pill.svg'), 'utf8');
    expect(vector).toContain('fill="#231f20"');
    expect(vector).toContain('<path ');
    expect(vector).not.toMatch(/<text\b|<image\b/i);

    for (const language of ['en', 'pt-BR'] as const) {
      const markup = renderToStaticMarkup(<PageRenderer pageData={{ ...pageData, fidelityOverlays: overlays }} isAdmin={false} language={language} />);
      const container = document.createElement('div');
      container.innerHTML = markup;
      const overlay = container.querySelector('img[src="/pages/page_067/per-encounter-pill.svg"]') as HTMLImageElement | null;
      expect(overlay).not.toBeNull();
      expect(overlay!.style.zIndex).toBe('5');
      expect(container.textContent).toContain('PER ENCOUNTER');
      expect(container.textContent).toContain('Cuirass');
    }
  });
});
