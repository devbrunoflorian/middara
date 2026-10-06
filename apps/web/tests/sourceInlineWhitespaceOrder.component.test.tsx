import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { editableTextForSegments, segmentsFromEditableText } from '../src/symbols/inlineCodec';
import { getSymbolEditorToken } from '../src/symbols/semanticSymbols';

const mapFont = (font: string) => ({ weight: font.includes('Bold') ? 700 : 400, style: 'normal' as const });

const cases = [
  { page: 13, lineId: 'line_19_0', symbolId: 'story.pencil', text: 'New Story Flag:', color: '#231f20' },
  { page: 78, lineId: 'line_25_4', symbolId: 'attack.melee', text: '(Melee) or ', color: '#231f20' },
];

describe('source inline whitespace ordering', () => {
  for (const item of cases) {
    it(`p${item.page} inserts ${item.symbolId} before its geometrically following space`, () => {
    const pageDir = join(process.cwd(), 'public/pages', `page_${String(item.page).padStart(3, '0')}`);
    const dom = JSON.parse(readFileSync(join(pageDir, `page_${String(item.page).padStart(3, '0')}_dom.json`), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const target = elements.find(element => element.symbolId === item.symbolId && element.anchor.lineId === item.lineId)!;
    expect(target).toBeDefined();
    expect(target.anchor.side).toBe('before');
    const lineBefore = dom.blocks[target.anchor.blockIndex].lines.find((line: { id: string }) => line.id === item.lineId)!;
    const oldAnchorIndex = target.anchor.spanIndex;
    const oldMetrics = { ...target.metrics };
    const original = JSON.stringify(dom.blocks);

    const blocks = attachSourceInlineElements(dom.blocks, [target]);
    const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
    const line = block.lines.find((candidate: { id: string }) => candidate.id === item.lineId)!;
    const runs = sourceSpanRuns(line.spans, mapFont);

    expect(runs.map(run => [run.text, run.symbolId])).toEqual([
      ['\uFFFC', item.symbolId], [' ', undefined], [item.text, undefined],
    ]);
    const icon = runs[0];
    expect(icon.color).toBe(item.color);
    expect(icon.symbolMetrics).toEqual(oldMetrics);
    expect(lineBefore.spans[oldAnchorIndex - 1].text.trim()).toBe('');
    expect(target.anchor.spanIndex).toBe(oldAnchorIndex);
    expect(JSON.stringify(dom.blocks)).toBe(original);
    });
  }

  for (const item of cases) {
    it(`p${item.page} restores ${item.symbolId} source styling and metrics after alias reinsertion`, () => {
      const pageDir = join(process.cwd(), 'public/pages', `page_${String(item.page).padStart(3, '0')}`);
      const dom = JSON.parse(readFileSync(join(pageDir, `page_${String(item.page).padStart(3, '0')}_dom.json`), 'utf8'));
      const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
      const target = elements.find(element => element.symbolId === item.symbolId && element.anchor.lineId === item.lineId)!;
      const blockElements = elements.filter(element => element.anchor.blockId === target.anchor.blockId);
      const blocks = attachSourceInlineElements(dom.blocks, blockElements);
      const block = blocks.find((candidate: { id: string }) => candidate.id === target.anchor.blockId)!;
      const sourceTemplateSegments = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
      const line = block.lines.find((candidate: { id: string }) => candidate.id === item.lineId)!;
      const sourceRuns = sourceSpanRuns(line.spans, mapFont);
      const sourceIcon = sourceRuns.find(run => run.symbolId === item.symbolId)!;
      const previous = sourceRuns.filter(run => run !== sourceIcon);
      const sourceText = editableTextForSegments(previous, 'en');
      const token = getSymbolEditorToken(item.symbolId, 'en')!;
      const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };

      const restored = segmentsFromEditableText(token + sourceText, toolStyle, 'en', previous, 'paragraph', undefined, sourceTemplateSegments);
      const restoredIcon = restored.find(run => run.symbolId === item.symbolId)!;

      expect(restoredIcon).toBeDefined();
      expect(restoredIcon.size).toBe(sourceIcon.size);
      expect(restoredIcon.color).toBe(sourceIcon.color);
      expect(restoredIcon.symbolMetrics).toEqual(sourceIcon.symbolMetrics);
    });
  }

  it('does not choose a random source metric when one ID has conflicting source variants', () => {
    const token = getSymbolEditorToken('dice.black', 'en')!;
    const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
    const templates = [
      { ...toolStyle, text: '\uFFFC', symbolId: 'dice.black', symbolMetrics: { widthEm: 1.1, heightEm: 1.2, verticalAlignEm: 0.2 } },
      // Mirrors the 0.004 pt line-baseline delta in the p. 50 source family;
      // this remains larger than PDF metric rounding and must stay ambiguous.
      { ...toolStyle, text: '\uFFFC', symbolId: 'dice.black', symbolMetrics: { widthEm: 1.1, heightEm: 1.2, verticalAlignEm: 0.2004 } },
    ];
    const result = segmentsFromEditableText(token, toolStyle, 'en', [], 'paragraph', undefined, templates);
    const icon = result.find(run => run.symbolId === 'dice.black')!;

    expect(icon.symbolMetrics).toBeUndefined();
    expect(icon.size).toBe(toolStyle.size);
  });

  it('inherits the p. 41 purple die template when identical PDF paths differ only by metric rounding', () => {
    const pageDir = join(process.cwd(), 'public/pages', 'page_041');
    const dom = JSON.parse(readFileSync(join(pageDir, 'page_041_dom.json'), 'utf8'));
    const elements = JSON.parse(readFileSync(join(pageDir, 'inline_elements.json'), 'utf8')).elements as SourceInlineElement[];
    const purpleDice = elements.filter(element => element.symbolId === 'dice.purple'
      && element.anchor.blockId === 'block_24');
    expect(purpleDice).toHaveLength(2);

    const blocks = attachSourceInlineElements(dom.blocks, purpleDice);
    const block = blocks.find((candidate: { id: string }) => candidate.id === 'block_24')!;
    const sourceTemplates = sourceSpanRuns(block.lines.flatMap((line: { spans: unknown[] }) => line.spans), mapFont);
    const sourceDice = sourceTemplates.filter(run => run.symbolId === 'dice.purple');
    expect(sourceDice).toHaveLength(2);
    expect(Math.abs(sourceDice[0].symbolMetrics!.widthEm - sourceDice[1].symbolMetrics!.widthEm)
      * sourceDice[0].size).toBeCloseTo(0.001, 8);

    const token = getSymbolEditorToken('dice.purple', 'en')!;
    const toolStyle = { font: 'OptimaLTStd', size: 10, color: '#231f20', weight: 400, style: 'normal' as const };
    const restored = segmentsFromEditableText(token, toolStyle, 'en', [], 'paragraph', undefined, sourceTemplates);
    const restoredDie = restored.find(run => run.symbolId === 'dice.purple')!;
    expect(restoredDie.size).toBe(9);
    expect(restoredDie.color).toBe(sourceDice[0].color);
    expect(restoredDie.symbolMetrics).toEqual(sourceDice[0].symbolMetrics);
  });
});
