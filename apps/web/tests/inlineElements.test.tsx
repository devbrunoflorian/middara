import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { SEMANTIC_SYMBOLS, findSymbolByAlias, findSymbolByEditorToken, getEditorAliasConflicts, getPreferredSymbolEditorAlias, getSemanticSymbol, getSymbolEditorAliases, getSymbolEditorToken, isSymbolAllowed, resolveLegacySymbol } from '../src/symbols/semanticSymbols';
import { editableTextForSegments, segmentsFromEditableText, replaceSegmentRange, insertEditorToken, editableTokenRanges, expandEditorTokenSelection, deleteEditorToken, normalizeEditableInput } from '../src/symbols/inlineCodec';
import { SemanticSymbol } from '../src/symbols/SemanticSymbol';
import { attachSourceInlineElements, sourceElementIsReplaced, sourceOverlayMask, previousSourceSpan } from '../src/symbols/sourceInlineElements';
import { decodeOverrideData, encodeOverrideData } from '../src/symbols/overrideData';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { attachSourceCompoundElements, compoundElementIsReplaced, type SourceCompoundElement } from '../src/symbols/sourceCompounds';
import type { Segment } from '../src/components/RichSpanEditor';

const style={font:'OptimaLTStd',size:10,color:'#231f20',weight:400,style:'normal' as const};
const run=(text:string):Segment=>({...style,text});
const object=(symbolId:string):Segment=>({...style,text:'\uFFFC',symbolId});
const page=(n:number)=>JSON.parse(readFileSync(new URL(`../public/pages/page_${String(n).padStart(3,'0')}/page_${String(n).padStart(3,'0')}_dom.json`,import.meta.url),'utf8'));
const elements=(n:number)=>JSON.parse(readFileSync(new URL(`../public/pages/page_${String(n).padStart(3,'0')}/inline_elements.json`,import.meta.url),'utf8')).elements;
const compounds=(n:number)=>JSON.parse(readFileSync(new URL(`../public/pages/page_${String(n).padStart(3,'0')}/compound_elements.json`,import.meta.url),'utf8')).elements as SourceCompoundElement[];

test('registry IDs and multilingual tokens are unique and source evidenced',()=>{
  assert.equal(new Set(SEMANTIC_SYMBOLS.map(s=>s.id)).size,SEMANTIC_SYMBOLS.length);
  const tokens=new Map<string,string>();
  for (const s of SEMANTIC_SYMBOLS) {
    assert.ok(s.source.page>=1 && s.source.page<=102);
    assert.ok(s.render.widthEm>0 && (s.render.heightEm ?? s.render.widthEm)>0);
    assert.ok(s.assetUrl || s.render.paths?.length);
    for (const token of Object.values(s.editorTokens)) { assert.ok(!tokens.has(token) || tokens.get(token)===s.id);tokens.set(token,s.id); }
  }
});

test('simple aliases resolve every registry symbol without collisions and serialize as [[alias]]',()=>{
  assert.deepEqual(getEditorAliasConflicts(),[]);
  for(const symbol of SEMANTIC_SYMBOLS) {
    const alias=getPreferredSymbolEditorAlias(symbol.id)!;
    assert.ok(alias.length>0);
    assert.equal(findSymbolByAlias(alias)?.id,symbol.id);
    assert.equal(getSymbolEditorToken(symbol.id,'en'),`[[${alias}]]`);
    assert.equal(getSymbolEditorToken(symbol.id,'pt-BR'),`[[${alias}]]`);
    assert.ok(getSymbolEditorAliases(symbol.id).some(value=>value.length>0));
  }
  assert.equal(findSymbolByAlias('LIGHTNING')?.id,'tag.important.icon');
  assert.equal(findSymbolByAlias('Dado Preto')?.id,'dice.black');
  assert.equal(findSymbolByAlias('sword')?.id,'attack.melee');
  assert.equal(findSymbolByEditorToken('[[lightning]]','en')?.id,'tag.important.icon');
});

test('compound family identity stays stable while its full tagged composition localizes',()=>{
  for(const id of ['tag.passive','tag.status','tag.exhaust','tag.discard']) {
    const symbol=getSemanticSymbol(id)!;
    assert.equal(symbol.composition?.type,'compound');
    assert.equal(symbol.composition?.labelKey,`inline.${id}`);
    assert.ok(symbol.render.localized?.['pt-BR']);
    assert.ok(symbol.render.paths && symbol.render.paths.length>=2,'English capsule contains its source background and foreground');
    assert.deepEqual(symbol.editorTokens.en,`⟦${symbol.labels.en}⟧`);
    assert.deepEqual(symbol.editorTokens['pt-BR'],`⟦${symbol.labels['pt-BR']}⟧`);
    const en=renderToStaticMarkup(<SemanticSymbol id={id} language="en" size={9} />);
    const pt=renderToStaticMarkup(<SemanticSymbol id={id} language="pt-BR" size={9} />);
    const fixed=renderToStaticMarkup(<SemanticSymbol id={id} language="en" size={9} alignToTop />);
    assert.match(en,new RegExp(`aria-label="${symbol.labels.en}"`));
    assert.match(pt,new RegExp(`aria-label="${symbol.labels['pt-BR']}"`));
    assert.notEqual(en,pt,'localized badge changes presentation without changing ID');
    assert.match(fixed,/display:block/);assert.match(fixed,/vertical-align:top/);
  }
});

test('page 90 source tag spans project as four complete editor objects without mutating source indexes',()=>{
  const data=page(90);const original=structuredClone(data.blocks);const definitions=compounds(90);
  assert.deepEqual(definitions.map(item=>item.symbolId),['tag.passive','tag.status','tag.exhaust','tag.discard']);
  const adapted=attachSourceCompoundElements(data.blocks,definitions);
  const projected=adapted.flatMap(block=>block.lines.flatMap(line=>sourceSpanRuns(line.spans,()=>({weight:700,style:'normal'}))));
  assert.deepEqual(projected.filter(run=>run.symbolId?.startsWith('tag.')).map(run=>run.symbolId),definitions.map(item=>item.symbolId));
  for(const item of definitions) {
    const block=adapted.find(candidate=>candidate.id===item.anchor.blockId)!;
    const line=block.lines.find(candidate=>candidate.id===item.anchor.lineId)!;
    const lineRuns=sourceSpanRuns(line.spans,()=>({weight:700,style:'normal'}));
    assert.deepEqual(lineRuns.map(run=>run.symbolId).filter(Boolean),[item.symbolId]);
    assert.ok(!lineRuns.some(run=>run.text.includes(item.symbolId.split('.')[1].toUpperCase())));
    const key=`page_90_block_${item.anchor.blockIndex}`;
    assert.equal(compoundElementIsReplaced(item,block,90,'en',new Map(),null,null),false);
    assert.equal(compoundElementIsReplaced(item,block,90,'en',new Map([[key,{spanKey:key,segments:[run('translated')],bbox:block.bbox}]]),null,null),true,
      'legacy translation block replaces the fixed source-position composition');
  }
  assert.deepEqual(data.blocks,original);
  assert.equal(elements(90).some(item=>['tag.passive.icon','tag.status.icon','tag.discard.icon'].includes(item.symbolId)),false);
});

test('every symbol survives multilingual rich run JSON and editable text round trips',()=>{
  for (const symbol of SEMANTIC_SYMBOLS) for (const lang of ['en','pt-BR'] as const) {
    const runs=[run('A\n'),{...object(symbol.id),weight:700,color:'#fff'},run(' ação é \uE037 '),object('future.new'),object(symbol.id)];
    const restored=JSON.parse(JSON.stringify({schemaVersion:2,segments:runs})).segments;
    assert.deepEqual(segmentsFromEditableText(editableTextForSegments(restored,lang),style,lang,restored),runs);
  }
});

test('both token languages parse in either editor; unknown literal remains literal',()=>{
  const s=getSemanticSymbol('attack.melee')!;
  for (const lang of ['en','pt-BR'] as const) {
    const parsed=segmentsFromEditableText(`${s.editorTokens.en}${s.editorTokens['pt-BR']}\n⟦something not defined⟧⟦symbol:future.new⟧`,style,lang);
    assert.deepEqual(parsed.filter(r=>r.symbolId).map(r=>r.symbolId),[s.id,s.id,'future.new']);
    assert.ok(parsed.some(r=>r.text.includes('⟦something not defined⟧')));
  }
});

test('typed aliases become inline objects, are case/diacritic tolerant, and keep unknown text reversible',()=>{
  const input='[[lightning]] [[SWORD]] [[Dado Preto]] [[DADO ROXO]] [[symbol:future.new]] [[not-real]]';
  for(const language of ['en','pt-BR'] as const) {
    const parsed=segmentsFromEditableText(input,style,language);
    assert.deepEqual(parsed.filter(segment=>segment.symbolId).map(segment=>segment.symbolId),[
      'tag.important.icon','attack.melee','dice.black','dice.purple','future.new',
    ]);
    assert.ok(parsed.some(segment=>segment.text.includes('[[not-real]]')));
    const projected=editableTextForSegments(parsed,language);
    assert.ok(projected.includes('[[lightning]]'));
    assert.ok(projected.includes('[[sword]]'));
    assert.ok(projected.includes('[[black-die]]'));
  }
});

test('fixed checklist is excluded from picker contexts, existing data remains readable',()=>{
  const s=getSemanticSymbol('marker.checkbox')!;
  assert.equal(isSymbolAllowed(s,'paragraph'),false);
  assert.equal(segmentsFromEditableText(s.editorTokens.en,style,'en')[0].text,s.editorTokens.en);
  const previous=[object(s.id)];assert.deepEqual(segmentsFromEditableText(editableTextForSegments(previous,'en'),style,'en',previous),previous);
});

test('insertion, replacement, deletion and boundaries keep styles and do not mutate input',()=>{
  const original=[{...run('abc'),weight:700},object('attack.melee'),run(' def')];const snapshot=structuredClone(original);
  assert.deepEqual(replaceSegmentRange(original,0,0,[object('dice.red')])[0],object('dice.red'));
  assert.equal(replaceSegmentRange(original,3,4,[]).map(r=>r.text).join(''),'abc def');
  assert.equal(replaceSegmentRange(original,0,8,[]).length,0);
  assert.equal(replaceSegmentRange(original,2,5,[object('dice.red')]).map(r=>r.text).join(''),'ab\uFFFCdef');
  assert.deepEqual(original,snapshot);
  const inserted=insertEditorToken('A😀B',3,3,'⟦Skull⟧');assert.equal(inserted.text,'A😀⟦Skull⟧B');assert.equal(inserted.caret,10);
});

test('two source patterns get inline objects without shifting original span references',()=>{
  for (const n of [13,22]) {
    const data=page(n);const source=structuredClone(data.blocks);const es=elements(n);assert.ok(es.length>=2);
    const adapted=attachSourceInlineElements(source,es);
    for (let bi=0;bi<source.length;bi++) for (let li=0;li<source[bi].lines.length;li++) {
      const originals=adapted[bi].lines[li].spans.filter(s=>!s.semanticSymbolId).map(({sourceSpanIndex:_sourceSpanIndex,...s})=>s);
      assert.deepEqual(originals,source[bi].lines[li].spans);
    }
    const symbols=adapted.flatMap(b=>b.lines.flatMap(l=>sourceSpanRuns(l.spans,()=>({weight:400,style:'normal'})))).filter(r=>r.symbolId);
    for (const e of es)assert.ok(symbols.some(r=>r.symbolId===e.symbolId));
    assert.deepEqual(source,data.blocks);
  }
});

test('page 41 dice retain source baselines, word ownership, gaps and the wrapped-line start',()=>{
  const data=page(41);const dice=elements(41).filter((entry:any)=>entry.symbolId==='dice.black'||entry.symbolId==='dice.purple');
  assert.equal(dice.length,6);
  assert.equal(dice.filter((entry:any)=>entry.symbolId==='dice.purple').length,2);
  assert.equal(dice.filter((entry:any)=>entry.symbolId==='dice.black').length,4);
  for(const entry of dice) {
    assert.ok(entry.metrics.widthEm>0 && entry.metrics.heightEm>0);
    const owner=entry.anchor.ownerSpanRef??{lineId:entry.anchor.lineId,spanIndex:entry.anchor.spanIndex};
    const block=data.blocks.find((candidate:any)=>candidate.id===entry.anchor.blockId)!;
    const ownerLine=block.lines.find((line:any)=>line.id===owner.lineId)!;
    assert.equal(ownerLine.spans[owner.spanIndex].text.trim(),entry.anchor.ownerSpanRef?'BLACK':entry.expectedSpan);
    if(entry.anchor.gapPt!==undefined)assert.ok(entry.anchor.gapPt>0);
  }
  const adapted=attachSourceInlineElements(data.blocks,dice);
  for(const entry of dice.filter((candidate:any)=>candidate.anchor.gapPt!==undefined)) {
    const line=adapted.find(block=>block.id===entry.anchor.blockId)!.lines.find(candidate=>candidate.id===entry.anchor.lineId)!;
    const symbol=line.spans.find(span=>span.semanticSymbolId===entry.symbolId)!;
    assert.ok(Math.abs(symbol.sourceSymbolMetrics!.gapEm! - entry.anchor.gapPt/entry.anchor.sizePt)<1e-12);
  }
  const wrapped=dice.find((entry:any)=>entry.anchor.lineStartX!==undefined)!;
  assert.deepEqual(wrapped.anchor.ownerSpanRef,{lineId:'line_30_4',spanIndex:5});
  const wrappedLine=adapted.find(block=>block.id===wrapped.anchor.blockId)!.lines.find(line=>line.id===wrapped.anchor.lineId)!;
  assert.equal(wrappedLine.availableX,112.239);
  assert.equal(wrapped.metrics.verticalAlignEm>0,true);
});

test('page 38 black dice stay owned by BLACK while following the source space on the same baseline',()=>{
  const data=page(38);const dice=elements(38).filter((entry:any)=>entry.symbolId==='dice.black');
  assert.equal(dice.length,3);
  const expected=[
    {blockId:'block_30',lineId:'line_30_0',ownerSpan:1,placementSpan:2},
    {blockId:'block_33',lineId:'line_33_1',ownerSpan:3,placementSpan:4},
    {blockId:'block_35',lineId:'line_35_1',ownerSpan:1,placementSpan:2},
  ];
  for(let i=0;i<dice.length;i++) {
    const entry=dice[i];const target=expected[i];
    assert.equal(entry.anchor.blockId,target.blockId);
    assert.equal(entry.anchor.side,'after');
    assert.deepEqual(entry.anchor.ownerSpanRef,{lineId:target.lineId,spanIndex:target.ownerSpan});
    const block=data.blocks.find((candidate:any)=>candidate.id===target.blockId)!;
    const line=block.lines.find((candidate:any)=>candidate.id===target.lineId)!;
    assert.equal(line.spans[target.ownerSpan].text,'BLACK');
    assert.equal(line.spans[target.placementSpan].text,' ');
    assert.equal(entry.anchor.lineId,target.lineId);
    assert.equal(entry.anchor.spanIndex,target.placementSpan);
    assert.equal(entry.anchor.sizePt,10);
    assert.ok(entry.anchor.gapPt>0 && entry.anchor.gapPt<.3);
    assert.ok(entry.metrics.widthEm>1 && entry.metrics.heightEm>1);
    assert.ok(entry.metrics.verticalAlignEm>0);
  }
  const adapted=attachSourceInlineElements(data.blocks,dice);
  for(const entry of dice) {
    const block=adapted.find(candidate=>candidate.id===entry.anchor.blockId)!;
    const line=block.lines.find(candidate=>candidate.id===entry.anchor.lineId)!;
    const symbol=line.spans.find(span=>span.semanticSymbolId===entry.symbolId)!;
    assert.ok(Math.abs(symbol.sourceSymbolMetrics!.gapEm!-entry.anchor.gapPt/entry.anchor.sizePt)<1e-12);
  }
});

test('mask activates for owning block/unit/draft, never the opposite language or unrelated unit',()=>{
  const es=elements(22);const data=page(22);const e=es[0];const b=data.blocks[e.anchor.blockIndex];const key=`page_22_block_${e.anchor.blockIndex}`;
  assert.equal(sourceElementIsReplaced(e,b,22,'pt-BR',new Map(),null,null),false);
  const override={spanKey:key,segments:[],bbox:b.bbox,managedSourceSymbols:[e.symbolId]};
  assert.equal(sourceElementIsReplaced(e,b,22,'pt-BR',new Map([[key,override]]),null,null),true);
  assert.equal(sourceElementIsReplaced(e,b,22,'en',new Map(),key,override),true);
  const mask=sourceOverlayMask([0,0,820,820],[e]);assert.ok(mask?.includes('data:image/svg+xml'));
  assert.equal(sourceOverlayMask([0,0,1,1],[e]),undefined);
  const legacy={...override,managedSourceSymbols:undefined};
  assert.equal(sourceElementIsReplaced(e,b,22,'pt-BR',new Map([[key,legacy]]),null,null),false);
  const adopted={...legacy,segments:[object(e.symbolId)]};
  assert.equal(sourceElementIsReplaced(e,b,22,'pt-BR',new Map([[key,adopted]]),null,null),true);
});

test('complete source geometry distinguishes sword, arrow, combined weapon and shield',()=>{
  const melee=getSemanticSymbol('attack.melee')!;
  assert.equal(melee.render.paths?.length,2);
  assert.ok(melee.render.paths?.some(path=>path.fill==='#ffffff'));
  assert.notEqual(melee.render.paths?.[1].d,getSemanticSymbol('attack.ranged')!.render.paths?.[1].d);
  assert.equal(getSemanticSymbol('attack.melee-ranged')?.render.paths?.length,4);
  assert.equal(getSemanticSymbol('combat.shield')?.render.paths?.length,3);
  const p43=elements(43);
  assert.ok(p43.some(e=>e.symbolId==='attack.melee'));
  assert.ok(p43.some(e=>e.symbolId==='attack.ranged'));
  assert.ok(p43.some(e=>e.symbolId==='attack.melee-ranged'));
  assert.equal(getSemanticSymbol('combat.status-square'),undefined);
});

test('Payload envelope preserves adopted source IDs, metrics, unknown IDs and an empty edit',()=>{
  const saved={spanKey:'test',bbox:[0,0,10,10] as [number,number,number,number],segments:[object('future.new')],textAlign:'center' as const,managedSourceSymbols:['attack.melee']};
  const decoded=decodeOverrideData(JSON.parse(JSON.stringify(encodeOverrideData(saved))))!;
  assert.deepEqual(decoded.segments,saved.segments);assert.deepEqual(decoded.managedSourceSymbols,saved.managedSourceSymbols);
  assert.equal(decoded.textAlign,'center');
  assert.deepEqual(decodeOverrideData([])?.segments,[]);
  assert.deepEqual(decodeOverrideData({schemaVersion:2,segments:[]})?.segments,[]);
  assert.equal(decodeOverrideData({text:'invalid'}),null);
});

test('virtual objects preserve original EN advances and source geometry indexes',()=>{
  const data=page(13);const adapted=attachSourceInlineElements(data.blocks,elements(13));
  for(let bi=0;bi<adapted.length;bi++)for(let li=0;li<adapted[bi].lines.length;li++) {
    const line=adapted[bi].lines[li];const originals=data.blocks[bi].lines[li].spans;
    line.spans.forEach((span,i)=>{
      if(span.semanticSymbolId)return;
      const oldIndex=span.sourceSpanIndex!;const previous=previousSourceSpan(line.spans,i);
      assert.deepEqual(previous?.bbox,originals[oldIndex-1]?.bbox);
    });
  }
});

test('source glyph identity survives; source stroke-only duplicate is excluded',()=>{
  const span={text:'✤ ',font:'ZapfDingbatsStd',size:9,color:'#fff',flags:0,bbox:[0,0,8,9] as [number,number,number,number]};
  assert.equal(resolveLegacySymbol(span.font,span.text)?.id,'tag.passive.icon');
  assert.equal(resolveLegacySymbol('OptimaLTStd',span.text),undefined);
  const runs=sourceSpanRuns([span,{...span,renderOnlyStrokePass:true}],()=>({weight:400,style:'normal'}));
  assert.deepEqual(runs.map(r=>[r.text,r.symbolId]),[['\uFFFC','tag.passive.icon'],[' ',undefined]]);
});

test('read-only, preview and unknown rendering are inline and accessible',()=>{
  for (const s of SEMANTIC_SYMBOLS) {
    const html=renderToStaticMarkup(<SemanticSymbol id={s.id} language="pt-BR" size={10} />);
    assert.ok(html.includes(s.labels['pt-BR']));assert.ok(!html.includes('position:absolute'));
    assert.ok(html.includes('inline-semantic-symbol'));
  }
  assert.ok(renderToStaticMarkup(<SemanticSymbol id="future.new" language="en" size={10} />).includes('future.new'));
});

test('changed prose preserves untouched formatting, symbol metrics and repeated objects',()=>{
  const metric={widthEm:1.23,heightEm:.87,verticalAlignEm:.04};
  const previous=[{...run('IMPORTANT: '),weight:700,color:'#b91d23'},run('old body'),{...object('story.flag'),symbolMetrics:metric},run(' footer')];
  const text=editableTextForSegments(previous,'en').replace('old body','new translated body');
  const changed=segmentsFromEditableText(text,style,'en',previous);
  assert.equal(changed[0].weight,700);assert.equal(changed[0].color,'#b91d23');
  assert.deepEqual(changed.find(r=>r.symbolId)?.symbolMetrics,metric);
  assert.equal(changed.map(r=>r.text).join(''),'IMPORTANT: new translated body\uFFFC footer');
  const repeated=[{...object('dice.red'),text:'\uFFFC\uFFFC',weight:700}];
  const parsed=segmentsFromEditableText('x'+editableTextForSegments(repeated,'en'),style,'en',repeated);
  assert.deepEqual(parsed.filter(r=>r.symbolId).map(r=>r.weight),[700,700]);
});

test('tokens delete and copy atomically, including aliases, legacy forms and unknown IDs',()=>{
  for(const token of ['[[sword]]','[[Dado Preto]]','⟦Melee attack⟧','⟦Ataque corpo a corpo⟧','⟦symbol:future.new⟧','[[symbol:future.new]]']) {
    const text=`A${token}B`;const range=editableTokenRanges(text)[0];
    assert.equal(deleteEditorToken(text,range.end,range.end,'backward')?.text,'AB');
    assert.equal(deleteEditorToken(text,range.start,range.start,'forward')?.text,'AB');
    assert.equal(deleteEditorToken(text,range.start+2,range.end-2,'backward')?.text,'AB');
    const selection=expandEditorTokenSelection(text,range.start+1,range.end-1);
    assert.equal(text.slice(selection.start,selection.end),token);
    assert.equal(insertEditorToken(text,range.start+2,range.start+2,'⟦Skull⟧').text,'A⟦Skull⟧B');
    const typed=normalizeEditableInput(text,text.slice(0,range.start+2)+'x'+text.slice(range.start+2),range.start+2,range.start+2);
    assert.equal(typed.text,'AxB');
    assert.equal(deleteEditorToken(text,0,0,'backward'),undefined);
  }
});

test('clipboard text is locale independent and consecutive inline elements are stable after editing',()=>{
  const copied=[object('story.pencil'),object('story.flag'),run('\n'),object('attack.ranged')];
  const pasted=segmentsFromEditableText(editableTextForSegments(copied,'en'),style,'pt-BR');
  assert.deepEqual(pasted.map(r=>r.symbolId),copied.map(r=>r.symbolId));
  assert.deepEqual(segmentsFromEditableText(editableTextForSegments(pasted,'pt-BR'),style,'pt-BR',pasted),pasted);
  // Undo/redo snapshots retain their own projection; parsing restored drafts
  // against the original baseline keeps their actual edits and symbol IDs.
  const before=editableTextForSegments(copied,'en');const after=insertEditorToken(before,0,0,'Novo ').text;
  assert.equal(segmentsFromEditableText(after,style,'en',copied).map(r=>r.text).join(''),'Novo \uFFFC\uFFFC\n\uFFFC');
  assert.deepEqual(segmentsFromEditableText(before,style,'en',copied),copied);
});

test('per-occurrence source metrics override defaults without absolute positioning',()=>{
  const metrics={widthEm:1.2,heightEm:.75,verticalAlignEm:-.02};
  const html=renderToStaticMarkup(<SemanticSymbol id="story.flag" language="en" size={10} metrics={metrics} />);
  assert.ok(html.includes('width:12px'));assert.ok(html.includes('height:7.5px'));assert.ok(html.includes('vertical-align:0.2px'));
});

test('unknown IDs with reserved characters and emoji edits stay reversible',()=>{
  const unknown=object('future / opção ⟧ %');const baseline=[run('A'),unknown,run('😀 fim')];
  const edited=editableTextForSegments(baseline,'pt-BR').replace('😀','😁');
  const parsed=segmentsFromEditableText(edited,style,'pt-BR',baseline);
  assert.equal(parsed.find(r=>r.symbolId)?.symbolId,unknown.symbolId);
  assert.equal(parsed.map(r=>r.text).join(''),'A\uFFFC😁 fim');
  assert.ok(parsed.every(r=>!/[\uD800-\uDBFF]$/.test(r.text) && !/^[\uDC00-\uDFFF]/.test(r.text)));
});
import React from 'react';
