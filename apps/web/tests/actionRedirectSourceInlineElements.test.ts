import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachSourceInlineElements, sourceElementIsReplaced, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { getSemanticSymbol } from '../src/symbols/semanticSymbols';

const dom = JSON.parse(readFileSync(new URL('../public/pages/page_070/page_070_dom.json', import.meta.url), 'utf8'));
const elements: SourceInlineElement[] = JSON.parse(readFileSync(new URL('../public/pages/page_070/inline_elements.json', import.meta.url), 'utf8')).elements;
const mapFont = (font: string) => ({ weight: font.includes('Bold') ? 700 : 400, style: 'normal' as const });

test('p70 action.redirect textRange replaces only its measured whitespace slot', () => {
  const targets = elements.filter(element => element.symbolId === 'action.redirect' && element.anchor.side === 'replace-text');
  assert.equal(targets.length, 1, 'the complex textRange tracer is unique in the confirmed family');
  const element = targets[0];
  assert.equal(element.anchor.side, 'replace-text');
  assert.deepEqual(element.anchor.textRange, [32, 33]);
  assert.equal(element.anchor.blockId, 'block_36');
  assert.equal(element.anchor.lineId, 'line_36_4');

  const before = JSON.stringify(dom.blocks);
  const blocks = attachSourceInlineElements(dom.blocks, [element]);
  const block = blocks.find((candidate: { id: string }) => candidate.id === element.anchor.blockId)!;
  const line = block.lines.find((candidate: { id: string }) => candidate.id === element.anchor.lineId)!;
  const owner = line.spans[element.anchor.spanIndex];
  const sourceText = 'from a Spell made against them,  ';
  assert.equal(owner.text, sourceText);
  assert.equal(sourceText.slice(31, 32), ' ');
  assert.equal(sourceText.slice(...element.anchor.textRange!), ' ');

  const runs = sourceSpanRuns(line.spans, mapFont);
  assert.deepEqual(runs.map(run => [run.text, run.symbolId]), [
    ['Effect ', undefined],
    [sourceText.slice(0, 32), undefined],
    ['\uFFFC', 'action.redirect'],
    ['REDIRECT', undefined],
    [' to ', undefined],
  ]);
  const symbolRun = runs.find(run => run.symbolId === 'action.redirect')!;
  assert.equal(symbolRun.color, '#231f20');
  assert.ok(Math.abs((symbolRun.symbolMetrics?.trailingGapEm ?? 0) - 0.2854869196791194) < 1e-8);

  const definition = getSemanticSymbol('action.redirect')!;
  assert.ok(definition.render.paths!.every(path => path.fill === 'currentColor'));
  assert.equal(JSON.stringify(dom.blocks), before, 'runtime attachment does not mutate the source DOM');

  const ownerRef = `${element.anchor.lineId}:${element.anchor.spanIndex}`;
  const unit = block.typographicSpanUnits!.find((candidate: { spanRefs: string[] }) => candidate.spanRefs.includes(ownerRef))!;
  const key = `page_70_unit_${unit.id}__pt-BR`;
  assert.equal(sourceElementIsReplaced(element, block, 70, 'pt-BR', new Map(), null, null), false);
  assert.equal(sourceElementIsReplaced(element, block, 70, 'pt-BR', new Map([[key, { segments: runs } as any]]), null, null), true);
});
