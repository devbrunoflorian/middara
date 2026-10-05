import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEMANTIC_SYMBOLS } from '../src/symbols/semanticSymbols';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { exposesNestedSpanTargets } from '../src/editorUnitCompatibility';
import type { Block } from '../src/components/PageRenderer';

const dom=JSON.parse(readFileSync(new URL('../public/pages/page_038/page_038_dom.json',import.meta.url),'utf8'));
const elements=JSON.parse(readFileSync(new URL('../public/pages/page_038/inline_elements.json',import.meta.url),'utf8')).elements;

test('p38 restores all nine source icons with complete supported recipes',()=>{
  const counts:Record<string,number>={};
  for(const item of elements) {
    counts[item.symbolId]=(counts[item.symbolId]??0)+1;
    assert.ok(SEMANTIC_SYMBOLS.some(symbol=>symbol.id===item.symbolId));
  }
  assert.deepEqual(counts,{'dice.black':3,'combat.skull':3,'combat.shield.solid':1,'combat.page':2,'tag.important.icon':2});
  const shield=SEMANTIC_SYMBOLS.find(symbol=>symbol.id==='combat.shield.solid')!;
  assert.equal(shield.render.paths!.length,3);
  assert.notDeepEqual(shield.render.paths,SEMANTIC_SYMBOLS.find(symbol=>symbol.id==='combat.shield.dark')!.render.paths);
  assert.equal(SEMANTIC_SYMBOLS.find(symbol=>symbol.id==='combat.page')!.render.paths!.length,2);
});

test('p38 has sixteen independent anchored fields, with no cost mixed into description',()=>{
  const blocks=dom.blocks.filter((block:{id:string})=>['block_10','block_27','block_13','block_16','block_38','block_30','block_33','block_34','block_35'].includes(block.id));
  const units=blocks.flatMap((block:any)=>block.typographicUnits);
  assert.equal(units.length,16);assert.equal(new Set(units.map((unit:any)=>unit.id)).size,16);
  assert.ok(units.every((unit:any)=>unit.fixedPosition));
  for(const block of blocks.filter((candidate:{id:string})=>['block_16','block_38'].includes(candidate.id))) {
    assert.deepEqual(block.typographicUnits[0].field.lineIds,[block.lines[0].id]);
    assert.ok(!block.typographicUnits[1].field.lineIds.includes(block.lines[0].id));
    assert.ok(block.typographicUnits[0].field.frame.x+block.typographicUnits[0].field.frame.width<block.typographicUnits[1].field.frame.x);
    assert.equal(block.preserveLegacySpanOverrides,true);
  }
});

test('all nine p38 vector objects belong to complete editable paragraphs with rich fonts',()=>{
  const blocks=attachSourceInlineElements(dom.blocks,elements);
  for(const element of elements as SourceInlineElement[]) {
    if(element.symbolId==='tag.important.icon')continue;
    const block=blocks.find(candidate=>candidate.id===element.anchor.blockId)!;
    assert.equal(exposesNestedSpanTargets(block),false);
    const field=block.typographicUnits!.find(unit=>unit.field.lineIds.includes(element.anchor.lineId))!.field;
    const lines=block.lines.filter(line=>field.lineIds.includes(line.id));
    assert.deepEqual(field.lineIds,block.lines.map(line=>line.id));
    const runs=sourceSpanRuns(lines.flatMap(line=>line.spans),font=>({
      weight:font.includes('Bold')?700:400,style:font.includes('Italic')?'italic':'normal',
    }));
    assert.ok(runs.some(run=>run.symbolId===element.symbolId));
    assert.ok(lines.flatMap(line=>line.spans).some(span=>span.size===10));
    if(block.id!=='block_34')assert.ok(runs.some(run=>run.size===9 && run.weight===700));
  }
  assert.ok(blocks.filter((block:Block)=>['block_30','block_33','block_35'].includes(block.id))
    .every(block=>block.typographicSpanUnits!.length>0));
});
