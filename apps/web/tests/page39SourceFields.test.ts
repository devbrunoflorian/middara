import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachSourceInlineElements, sourceElementIsReplaced, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { SEMANTIC_SYMBOLS } from '../src/symbols/semanticSymbols';
import { exposesNestedSpanTargets, hasPreservedLegacySpanOverride } from '../src/editorUnitCompatibility';
import type { Block } from '../src/components/PageRenderer';

const dom=JSON.parse(readFileSync(new URL('../public/pages/page_039/page_039_dom.json',import.meta.url),'utf8'));
const elements:SourceInlineElement[]=JSON.parse(readFileSync(new URL('../public/pages/page_039/inline_elements.json',import.meta.url),'utf8')).elements;
const mapFont=(font:string)=>({weight:font.includes('Bold')?700:400,style:'normal' as const});

test('p39 inline red border replaces only the proven whitespace slot, leaving source spans unchanged',()=>{
  const before=JSON.stringify(dom.blocks);
  const blocks=attachSourceInlineElements(dom.blocks,elements);
  const e=elements.find(element=>element.symbolId==='terrain.red-border')!;
  assert.equal(e.anchor.side,'replace-text');assert.deepEqual(e.anchor.textRange,[15,24]);
  const definition=SEMANTIC_SYMBOLS.find(symbol=>symbol.id===e.symbolId)!;
  assert.equal(definition.render.paths![0].stroke,'#d2232a');
  assert.equal(definition.render.paths![0].strokeWidth,2);
  const block=blocks.find(block=>block.id===e.anchor.blockId)!;
  const span=block.lines[0].spans[e.anchor.spanIndex];
  assert.equal(span.text,' marked with a           cannot be moved into or through. ');
  assert.equal(block.lines[0].spans.length,dom.blocks[e.anchor.blockIndex].lines[0].spans.length);
  assert.deepEqual(sourceSpanRuns([span],mapFont).map(run=>[run.text,run.symbolId]),[
    [' marked with a ',undefined],['\uFFFC','terrain.red-border'],[' cannot be moved into or through. ',undefined],
  ]);
  assert.equal(JSON.stringify(dom.blocks),before);
  const unit=block.typographicUnits![0];assert.deepEqual(unit.field.lineIds,block.lines.map(line=>line.id));
  const key=`page_39_unit_${unit.id}__pt-BR`;
  assert.equal(sourceElementIsReplaced(e,block,39,'pt-BR',new Map([[key,{segments:[],managedSourceSymbols:[e.symbolId]}]]),null,null),true);
  assert.equal(sourceElementIsReplaced(e,block,39,'en',new Map([[key,{segments:[],managedSourceSymbols:[e.symbolId]}]]),null,null),false);
  assert.equal(sourceElementIsReplaced(e,block,39,'pt-BR',new Map([[key,{segments:[]}]]),null,null),false);
});

test('p39 stale or overlapping ranges retain all source text',()=>{
  const blocks=attachSourceInlineElements(dom.blocks,elements);
  const e=elements.find(element=>element.symbolId==='terrain.red-border')!;
  const span=blocks[e.anchor.blockIndex].lines[0].spans[e.anchor.spanIndex];
  for(const range of [[0,4],[15,100],[24,15],[15.5,24],[-1,2]] as [number,number][]) {
    const malformed={...span,sourceInlineObjects:[{...e,anchor:{...e.anchor,textRange:range}}]};
    assert.deepEqual(sourceSpanRuns([malformed],mapFont).map(run=>run.text),[span.text]);
  }
  assert.deepEqual(sourceSpanRuns([{...span,sourceInlineObjects:[e,e]}],mapFont).map(run=>run.text),[span.text]);
});

test('p39 paragraph targets preserve six legacy units and fourteen card suppressions',()=>{
  const targets=dom.blocks.filter((block:Block)=>['block_13','block_14','block_43','block_37','block_38','block_49'].includes(block.id));
  assert.equal(targets.length,6);
  assert.equal(targets.flatMap((block:Block)=>block.typographicUnits!).length,9);
  for(const block of targets as Block[]) {
    assert.equal(exposesNestedSpanTargets(block),false);
    assert.equal(hasPreservedLegacySpanOverride(block,39,'pt-BR',()=>true),true);
  }
  assert.equal(dom.blocks.flatMap((block:Block)=>block.lines).filter((line:any)=>line.rasterizedDuplicate).length,14);
});
