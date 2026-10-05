import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exposesNestedSpanTargets, hasPreservedLegacySpanOverride } from '../src/editorUnitCompatibility';
import { readFileSync } from 'node:fs';
import { sourceElementIsReplaced, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import type { Block } from '../src/components/PageRenderer';
import type { SpanOverride } from '../src/components/RichSpanEditor';

test('new paragraph fields opt in to preserving existing span-unit translation or draft', () => {
  const block = { preserveLegacySpanOverrides: true, typographicSpanUnits: [{ id: 'p37-old-10pt' }] };
  assert.equal(hasPreservedLegacySpanOverride(block, 37, 'pt-BR', key => key === 'page_37_unit_p37-old-10pt__pt-BR'), true);
  assert.equal(hasPreservedLegacySpanOverride(block, 37, 'en', key => key === 'page_37_unit_p37-old-10pt__pt-BR'), false);
  assert.equal(hasPreservedLegacySpanOverride(block, 37, 'pt-BR', key => key === 'page_37_unit_p37-new-heading__pt-BR'), false);
  assert.equal(hasPreservedLegacySpanOverride({ ...block, preserveLegacySpanOverrides: false }, 37, 'pt-BR', () => true), false);
  assert.equal(hasPreservedLegacySpanOverride(block, 37, 'pt-BR', () => false), false);
});

test('source font fragments cannot intercept opted-in paragraph fields', () => {
  assert.equal(exposesNestedSpanTargets({ preserveLegacySpanOverrides: true }), false);
  assert.equal(exposesNestedSpanTargets({ preserveLegacySpanOverrides: false }), true);
  assert.equal(exposesNestedSpanTargets({}), true);
});

test('p37 source glyph restoration is erased only when its own paragraph adopts the symbol', () => {
  const dom = JSON.parse(readFileSync(new URL('../public/pages/page_037/page_037_dom.json', import.meta.url), 'utf8'));
  const elements: SourceInlineElement[] = JSON.parse(readFileSync(new URL('../public/pages/page_037/inline_elements.json', import.meta.url), 'utf8')).elements;
  const override: SpanOverride = { segments: [], managedSourceSymbols: ['tag.status.icon', 'marker.arrow'] };
  const status = elements.find(element => element.symbolId === 'tag.status.icon')!;
  const statusBlock: Block = dom.blocks.find((block: Block) => block.id === status.anchor.blockId);
  const unit = statusBlock.typographicUnits!.find(candidate => candidate.field.lineIds.includes(status.anchor.lineId))!;
  const key = `page_37_unit_${unit.id}__pt-BR`;
  const overrides = new Map([[key, override]]);
  assert.equal(sourceElementIsReplaced(status, statusBlock, 37, 'pt-BR', overrides, null, null), true);
  assert.equal(sourceElementIsReplaced(status, statusBlock, 37, 'en', overrides, null, null), false);
  for (const arrow of elements.filter(element => element.symbolId === 'marker.arrow')) {
    const block: Block = dom.blocks.find((candidate: Block) => candidate.id === arrow.anchor.blockId);
    assert.equal(sourceElementIsReplaced(arrow, block, 37, 'pt-BR', overrides, null, null), false);
  }
  // A legacy override without semantic adoption retains the original source ink.
  assert.equal(sourceElementIsReplaced(status, statusBlock, 37, 'pt-BR',
    new Map([[key, { segments: [] }]]), null, null), false);
});
