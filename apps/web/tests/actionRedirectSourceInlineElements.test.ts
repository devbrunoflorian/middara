import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachSourceInlineElements, sourceElementIsReplaced, sourceOverlayMask, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { getSemanticSymbol } from '../src/symbols/semanticSymbols';

const dom = JSON.parse(readFileSync(new URL('../public/pages/page_070/page_070_dom.json', import.meta.url), 'utf8'));
const elements: SourceInlineElement[] = JSON.parse(readFileSync(new URL('../public/pages/page_070/inline_elements.json', import.meta.url), 'utf8')).elements;
const page93Elements: SourceInlineElement[] = JSON.parse(readFileSync(new URL('../public/pages/page_093/inline_elements.json', import.meta.url), 'utf8')).elements;
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

test('remaining action.redirect occurrences use measured before anchors and keep the source artwork transparent', () => {
  const targets = [
    ...elements.filter(element => element.symbolId === 'action.redirect' && element.anchor.side === 'before'),
    ...page93Elements.filter(element => element.symbolId === 'action.redirect' && element.anchor.side === 'before'),
  ];
  assert.equal(targets.length, 2, 'only the two audited standalone-whitespace anchors belong to this batch');

  const cases = [
    {
      page: 70,
      target: targets.find(element => element.anchor.blockId === 'block_39')!,
      file: '../public/pages/page_070/page_070_dom.json',
      pageElements: elements,
      expected: ['from a Spell made against them,', ' ', '\uFFFC', ' ', 'REDIRECT', ' to yourself.', '" '],
      color: '#231f20',
      metrics: { widthEm: 0.6182601928710938, heightEm: 0.723870849609375, verticalAlignEm: 0.00003662109375 },
    },
    {
      page: 93,
      target: targets.find(element => element.anchor.blockId === 'block_21')!,
      file: '../public/pages/page_093/page_093_dom.json',
      pageElements: page93Elements,
      expected: ['\uFFFC', ' ', 'REDIRECT', ': \n'],
      color: '#ffffff',
      metrics: { widthEm: 0.7727691650390625, heightEm: 0.9047698974609375, verticalAlignEm: 0.0999786376953125 },
    },
  ];

  for (const item of cases) {
    const pageDom = JSON.parse(readFileSync(new URL(item.file, import.meta.url), 'utf8'));
    const block = pageDom.blocks.find((candidate: { id: string }) => candidate.id === item.target.anchor.blockId)!;
    const before = JSON.stringify(pageDom.blocks);
    const attached = attachSourceInlineElements(pageDom.blocks, item.pageElements);
    const renderedBlock = attached.find((candidate: { id: string }) => candidate.id === item.target.anchor.blockId)!;
    const line = renderedBlock.lines.find((candidate: { id: string }) => candidate.id === item.target.anchor.lineId)!;
    const runs = sourceSpanRuns(line.spans, mapFont);
    assert.deepEqual(runs.map(run => run.text), item.expected, `page ${item.page} keeps the extracted spaces and inserts one symbol object`);
    const symbol = runs.find(run => run.symbolId === 'action.redirect')!;
    assert.equal(symbol.color, item.color);
    assert.deepEqual(item.target.metrics, item.metrics);
    assert.equal(JSON.stringify(pageDom.blocks), before, 'runtime attachment leaves original page DOM unchanged');
    assert.equal(block.id, item.target.anchor.blockId);

    if (item.page === 70) {
      const ownerUnit = renderedBlock.typographicSpanUnits!.find((unit: { spanRefs: string[] }) => unit.spanRefs.includes('line_39_2:2'))!;
      assert.ok(ownerUnit.spanRefs.includes('line_39_2:1'), 'the source space before the icon joins the same editable unit');
      const editorLineSpans = line.spans.filter((span: { sourceSpanIndex?: number }, index: number) =>
        ownerUnit.spanRefs.includes(`${line.id}:${span.sourceSpanIndex ?? index}`));
      const editorRuns = sourceSpanRuns(editorLineSpans, mapFont);
      assert.deepEqual(editorRuns.map(run => run.text), ['from a Spell made against them,', ' ', '\uFFFC', ' ', 'REDIRECT', ' to yourself.']);
      const key = `page_70_unit_${ownerUnit.id}__en`;
      assert.equal(sourceElementIsReplaced(item.target, renderedBlock, 70, 'en', new Map([[key, { segments: editorRuns } as any]]), null, null), true,
        'adopting the icon in this unit suppresses the source overlay');
    }
  }

  const definition = getSemanticSymbol('action.redirect')!;
  assert.ok(definition.render.paths!.every(path => path.fill === 'currentColor'));
  assert.equal('background' in definition.render, false, 'the vector definition has no painted background');

  const whiteOverlay = JSON.parse(readFileSync(new URL('../public/pages/page_093/fidelity_overlays.json', import.meta.url), 'utf8'));
  const redirectOverlay = whiteOverlay.overlays.find((overlay: { region: string }) => overlay.region === 'redirect-arrow-symbol')!;
  const mask = sourceOverlayMask(redirectOverlay.bbox, page93Elements)!;
  const decodedMask = decodeURIComponent(mask.slice(mask.indexOf(',') + 1, -2));
  assert.match(decodedMask, /fill="black"/, 'the white source-art overlay is cut at the exact symbol region before the transparent SVG is shown');
});
