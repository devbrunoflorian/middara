import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageRoot = join(process.cwd(), 'public/pages');
const inlinePageFiles = Array.from({ length: 102 }, (_, index) => index + 1)
  .map(page => join(pageRoot, `page_${String(page).padStart(3, '0')}`, 'inline_elements.json'))
  .filter(existsSync);

describe('source inline symbol occurrence metrics', () => {
  it('records the four p.66 prose dice as editable semantic inline objects with source masks', () => {
    const page66Dir = join(pageRoot, 'page_066');
    const { elements } = JSON.parse(readFileSync(join(page66Dir, 'inline_elements.json'), 'utf8')) as {
      elements: {
        id?: string;
        symbolId: string;
        sourceRendering?: string;
        drawingIndices: number[];
        metrics?: { widthEm: number; heightEm: number; verticalAlignEm: number; renderVariant?: string };
        mask?: { url: string };
        provenance?: { auditId?: string };
      }[];
    };
    const dice = elements.filter(element => element.provenance?.auditId === 'manual-source-mapping-2026-10-23-p66');

    expect(dice).toHaveLength(4);
    expect(dice.map(element => element.drawingIndices)).toEqual([
      [188, 189, 190, 191],
      [196, 197, 198, 199],
      [201, 202, 203, 204],
      [205, 206, 207, 208],
    ]);
    expect(new Set(dice.map(element => element.id)).size).toBe(4);
    for (const element of dice) {
      expect(element.symbolId).toBe('dice.purple');
      expect(element.sourceRendering).toBe('semantic-inline');
      expect(element.metrics?.renderVariant).toBe('purple-p66-prose-die-source');
      expect(element.mask?.url).toBeTruthy();
      expect(existsSync(join(page66Dir, element.mask!.url.split('/').at(-1)!))).toBe(true);
    }

    const registry = JSON.parse(readFileSync(join(process.cwd(), 'src/symbols/sourceSymbols.json'), 'utf8')) as {
      id: string;
      render?: { variants?: Record<string, { paths?: unknown[] }> };
    }[];
    const purpleDie = registry.find(symbol => symbol.id === 'dice.purple');
    expect(purpleDie?.render?.variants?.['purple-p66-prose-die-source']?.paths).toHaveLength(4);
  });

  it('keeps measured geometry for every source glyph replacement', () => {
    let glyphReplacements = 0;
    for (const url of inlinePageFiles) {
      const { elements } = JSON.parse(readFileSync(url, 'utf8')) as {
        elements: { symbolId: string; bbox: number[]; drawingIndices: number[]; anchor: { side: string; sizePt: number }; metrics?: { widthEm: number; heightEm: number; verticalAlignEm: number } }[];
      };
      for (const element of elements) {
        if (element.anchor.side !== 'replace' || element.drawingIndices.length || !['tag.important.icon', 'tag.discard.icon', 'tag.passive.icon', 'marker.star', 'marker.arrow'].includes(element.symbolId)) continue;
        glyphReplacements += 1;
        expect(element.metrics, `${element.symbolId} is missing source metrics in ${url}`).toBeDefined();
        expect(element.metrics!.widthEm).toBeCloseTo((element.bbox[2] - element.bbox[0]) / element.anchor.sizePt, 10);
        expect(element.metrics!.heightEm).toBeCloseTo((element.bbox[3] - element.bbox[1]) / element.anchor.sizePt, 10);
        expect(Number.isFinite(element.metrics!.verticalAlignEm)).toBe(true);
      }
    }
    expect(glyphReplacements).toBe(73);
  });

  it('uses the owner text baseline for page 52 black dice and source-measured dimensions for outlier glyphs', () => {
    const p52 = JSON.parse(readFileSync(join(pageRoot, 'page_052/inline_elements.json'), 'utf8')) as { elements: { symbolId: string; anchor: { lineId: string }; metrics?: { verticalAlignEm: number } }[] };
    const blackDie = p52.elements.find(element => element.symbolId === 'dice.black' && element.anchor.lineId === 'line_23_0');
    expect(blackDie?.metrics?.verticalAlignEm).toBeCloseTo(0.361038208, 6);

    const p49 = JSON.parse(readFileSync(join(pageRoot, 'page_049/inline_elements.json'), 'utf8')) as { elements: { symbolId: string; bbox: number[]; anchor: { sizePt: number }; metrics?: { widthEm: number; heightEm: number } }[] };
    const stars = p49.elements.filter(element => element.symbolId === 'marker.star');
    expect(stars).toHaveLength(2);
    for (const star of stars) {
      expect(star.metrics?.widthEm).toBeCloseTo((star.bbox[2] - star.bbox[0]) / star.anchor.sizePt, 10);
      expect(star.metrics?.heightEm).toBeCloseTo((star.bbox[3] - star.bbox[1]) / star.anchor.sizePt, 10);
    }
  });
});
