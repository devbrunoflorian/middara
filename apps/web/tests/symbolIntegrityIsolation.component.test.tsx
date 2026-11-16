import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PageRenderer, type PageData } from '../src/components/PageRenderer';
import { SemanticSymbol } from '../src/symbols/SemanticSymbol';
import { editableTextForSegments, segmentsFromEditableText } from '../src/symbols/inlineCodec';
import { attachSourceInlineElements, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';

const element:SourceInlineElement={symbolId:'marker.reference.a',sourceRendering:'semantic-inline',
  bbox:[20,10,31.339,21.339],anchor:{blockId:'block_1',blockIndex:0,lineId:'line_1',spanIndex:1,side:'before',sizePt:9},
  coveredSourceText:{lineId:'line_1',spanIndex:1,text:'A'},
  metrics:{widthEm:11.339/9,heightEm:11.339/9,advanceEm:11.339/9,verticalAlignEm:.2,sourceAssetUrl:'/audited-a.svg'},
  mask:{url:'/mask.png',bbox:[19,9,32,22]}};
const page:PageData={page_number:1,width:100,height:100,images:[],backgroundUrl:'/background.webp',blocks:[{
  id:'block_1',bbox:[0,10,95,30],lines:[{id:'line_1',dir:[1,0],bbox:[0,10,95,25],spans:[
    {text:'See (',font:'OptimaLTStd',size:10,color:'#231f20',flags:0,bbox:[0,10,20,25],origin:[0,20]},
    {text:'A',font:'OptimaLTStd-Bold',size:9,color:'#231f20',flags:0,bbox:[22,10,29,25],origin:[22,20]},
    {text:') for rules.',font:'OptimaLTStd',size:10,color:'#231f20',flags:0,bbox:[32,10,95,25],origin:[32,20]},
  ]}]}]};
const prepared={...page,blocks:attachSourceInlineElements(page.blocks,[element]),inlineElements:[element]};
const style={font:'OptimaLTStd',size:10,color:'#231f20',weight:400,style:'normal' as const};
describe('source occurrence assets and isolated persistence',()=>{
  it('renders the exact composite once in the source coordinate layer and flow',()=>{
    const markup=renderToStaticMarkup(createElement(PageRenderer,{pageData:prepared,isAdmin:false,language:'en',isolatedSnapshot:true}));
    const container=document.createElement('div');container.innerHTML=markup;
    expect(container.querySelectorAll('[data-source-symbol-id="marker.reference.a"]')).toHaveLength(1);
    expect(container.querySelector('[data-source-symbol-id] image')?.getAttribute('href')).toBe('/audited-a.svg');
    expect([...container.querySelectorAll('text')].some(n=>n.textContent==='A')).toBe(false);
    const flow=renderToStaticMarkup(createElement(SemanticSymbol,{id:element.symbolId,language:'pt-BR',size:9,metrics:element.metrics}));
    container.innerHTML=flow;
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/audited-a.svg');
    expect(parseFloat(container.querySelector<HTMLImageElement>('img')!.style.width)).toBeCloseTo(11.339,10);
  });
  it('preserves source appearance and rich spans through move, deletion and alias reinsertion',()=>{
    const runs=sourceSpanRuns(prepared.blocks[0].lines![0].spans,()=>({weight:400,style:'normal'}));
    const editable=editableTextForSegments(runs,'en');
    expect(segmentsFromEditableText(editable,style,'en',runs)).toEqual(runs);
    const token=editableTextForSegments(runs.filter(r=>r.symbolId),'en');
    const removed=segmentsFromEditableText('See rules.',style,'en',runs);
    expect(removed.filter(r=>r.symbolId)).toHaveLength(0);
    const moved=segmentsFromEditableText(`See rules. ${token}`,style,'en',removed,'paragraph',undefined,runs);
    expect(moved.filter(r=>r.symbolId)).toHaveLength(1);
    expect(moved.find(r=>r.symbolId)?.symbolMetrics).toEqual(element.metrics);
    expect(moved.at(-1)?.symbolId).toBe(element.symbolId);
  });
  it('reuses equivalent audited assets without confusing different source appearances',()=>{
    const first={...style,text:'\uFFFC',symbolId:'combat.page',symbolMetrics:{widthEm:1,heightEm:1,advanceEm:1,sourceAssetUrl:'/occurrence-a.svg',sourceAppearanceKey:'reviewed-paint-a',renderVariant:'file-hash-a'}};
    const second={...first,symbolMetrics:{...first.symbolMetrics,sourceAssetUrl:'/occurrence-b.svg',renderVariant:'file-hash-b'}};
    const token=editableTextForSegments([first],'en');
    const inserted=segmentsFromEditableText(token,style,'en',[],'paragraph',undefined,[first,second]);
    expect(inserted[0].symbolMetrics?.sourceAppearanceKey).toBe('reviewed-paint-a');
    expect(inserted[0].symbolMetrics?.sourceAssetUrl).toBe('/occurrence-a.svg');
    const ambiguous=segmentsFromEditableText(token,style,'en',[],'paragraph',undefined,[first,{...second,symbolMetrics:{...second.symbolMetrics,sourceAppearanceKey:'reviewed-paint-b'}}]);
    expect(ambiguous[0].symbolMetrics?.sourceAssetUrl).toBeUndefined();
  });
  it('restores a deleted duplicate alias from its next audited source occurrence',()=>{
    const first={...style,text:'\uFFFC',symbolId:'dice.orange',symbolMetrics:{widthEm:1,heightEm:1,advanceEm:1,sourceAssetUrl:'/orange-first.svg',sourceAppearanceKey:'same-orange-paint'}};
    const second={...first,symbolMetrics:{...first.symbolMetrics,sourceAssetUrl:'/orange-second.svg'}};
    const token=editableTextForSegments([first],'en');
    const original=`First ${token} and second ${token}.`;
    const secondStart=original.lastIndexOf(token);
    const withoutSecondText=original.slice(0,secondStart)+original.slice(secondStart+token.length);
    const withoutSecond=segmentsFromEditableText(withoutSecondText,style,'en',[first,second],'paragraph',undefined,[first,second]);
    expect(withoutSecond.filter(run=>run.symbolId).map(run=>run.symbolMetrics?.sourceAssetUrl)).toEqual(['/orange-first.svg']);

    const restored=segmentsFromEditableText(original,style,'en',withoutSecond,'paragraph',undefined,[first,second]);
    expect(restored.filter(run=>run.symbolId).map(run=>run.symbolMetrics?.sourceAssetUrl))
      .toEqual(['/orange-first.svg','/orange-second.svg']);
  });
  it('joins source prose split by an inline object and removes its old fragment only when adopted',()=>{
    const companionPage:PageData={...page,blocks:[{id:'owner',bbox:[0,10,80,25],lines:[{id:'owner-line',bbox:[0,10,20,25],dir:[1,0],spans:[
      {text:'Lead ',font:'OptimaLTStd',size:10,color:'#231f20',flags:0,bbox:[0,10,20,25],origin:[0,20]},
    ]}]},{id:'fragment',bbox:[22,10,65,25],lines:[{id:'fragment-line',bbox:[22,10,65,25],dir:[1,0],spans:[
      {text:'LABEL',font:'OptimaLTStd',size:2,color:'#231f20',flags:0,bbox:[22,16,28,19],origin:[22,18]},
      {text:' Tail.',font:'OptimaLTStd',size:10,color:'#231f20',flags:0,bbox:[32,10,65,25],origin:[32,20]},
    ]}]}]};
    const companion:SourceInlineElement={...element,symbolId:'combat.page',coveredSourceText:undefined,
      anchor:{blockId:'owner',blockIndex:0,lineId:'owner-line',spanIndex:0,side:'after',sizePt:10},
      coveredSourceTexts:[{blockId:'fragment',lineId:'fragment-line',spanIndex:0,text:'LABEL'}],
      sourceTextCompanions:[{blockId:'fragment',blockIndex:1,lineId:'fragment-line',spanIndex:1,text:' Tail.'}]};
    const data={...companionPage,blocks:attachSourceInlineElements(companionPage.blocks,[companion]),inlineElements:[companion]};
    const runs=sourceSpanRuns(data.blocks[0].lines![0].spans,()=>({weight:400,style:'normal'}));
    expect(runs.map(r=>r.text).join('')).toBe('Lead \uFFFC Tail.');
    const render=(overrides:Map<string,any>)=>{
      const c=document.createElement('div');c.innerHTML=renderToStaticMarkup(createElement(PageRenderer,{pageData:data,isAdmin:false,language:'en',isolatedSnapshot:true,readOnlyExperiment:true,experimentalOverrides:overrides}));
      c.querySelectorAll('[aria-hidden="true"], [style*="visibility: hidden"]').forEach(node=>node.remove());return c.textContent;
    };
    expect(render(new Map())?.match(/Tail\./g)).toHaveLength(1);
    const own={spanKey:'page_1_block_0',bbox:[0,10,80,25] as [number,number,number,number],segments:[],managedSourceSymbols:['combat.page']};
    expect(render(new Map([['page_1_block_0',own]]))).not.toContain('Tail.');
    const foreign={spanKey:'page_1_block_1',bbox:[22,10,65,25] as [number,number,number,number],segments:[{...style,text:'Cauda humana'}]};
    const saved=new Map([['page_1_block_0',own],['page_1_block_1',foreign]]);
    const before=JSON.stringify([...saved]);expect(render(saved)?.match(/Cauda humana/g)).toHaveLength(1);expect(JSON.stringify([...saved])).toBe(before);
  });
  it('does not read or write storage or Payload when mounted as an isolated snapshot',async()=>{
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const fetchSpy=vi.fn();vi.stubGlobal('fetch',fetchSpy);
    const read=vi.spyOn(Storage.prototype,'getItem');const write=vi.spyOn(Storage.prototype,'setItem');
    const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
    try{
      await act(async()=>root.render(createElement(PageRenderer,{pageData:prepared,isAdmin:false,language:'pt-BR',isolatedSnapshot:true,readOnlyExperiment:true})));
      expect(fetchSpy).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
    }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();vi.restoreAllMocks();}
  });
});
