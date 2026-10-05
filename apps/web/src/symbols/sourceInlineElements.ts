import type { Block, SpanData } from '../components/PageRenderer';
import type { SpanOverride } from '../components/RichSpanEditor';
import { SYMBOL_OBJECT_MARKER } from './inlineCodec';
import { getSemanticSymbol, resolveLegacySymbol, type InlineSymbolMetrics } from './semanticSymbols';

export interface SourceInlineElement {
  symbolId: string;
  metrics?: InlineSymbolMetrics;
  color?: string;
  bbox: [number,number,number,number];
  anchor: { blockId: string; blockIndex: number; lineId: string; spanIndex: number; side: 'before'|'after'|'replace'|'replace-text'; sizePt: number; textRange?: [number,number] };
  mask: { url: string; bbox: [number,number,number,number] };
}

/** Virtual editor objects must not change advances in the untouched EN view. */
export function previousSourceSpan(spans:SpanData[],index:number):SpanData|undefined {
  for(let i=index-1;i>=0;i--)if(!spans[i].semanticSymbolId)return spans[i];
  return undefined;
}

/** Runtime augmentation: original JSON IDs, arrays and persisted keys stay intact. */
export function attachSourceInlineElements(blocks: Block[], elements: SourceInlineElement[]): Block[] {
  return blocks.map(block=>({ ...block,lines:block.lines?.map(line=>({ ...line,spans:line.spans.flatMap((span,index)=>{
    const matches=elements.filter(e=>e.anchor.blockId===block.id && e.anchor.lineId===line.id && e.anchor.spanIndex===index && getSemanticSymbol(e.symbolId));
    const make=(e:SourceInlineElement):SpanData=>({ text:SYMBOL_OBJECT_MARKER,semanticSymbolId:e.symbolId,sourceSpanIndex:index,
      sourceSymbolMetrics:e.metrics,
      font:span.font,size:e.anchor.sizePt,color:e.color ?? span.color,flags:span.flags,bbox:e.bbox,renderAsSourceOverlayDuplicate:true,renderSourceOverlayLanguage:'all' });
    const sourceInlineObjects=matches.filter(e=>e.anchor.side==='replace-text' && e.anchor.textRange);
    return [...matches.filter(e=>e.anchor.side==='before').map(make),{...span,sourceSpanIndex:index,
      ...(sourceInlineObjects.length?{sourceInlineObjects}:{}),
    },...matches.filter(e=>e.anchor.side==='after').map(make)];
  }) })) }));
}

export function sourceElementIsReplaced(element: SourceInlineElement, block: Block, page: number, language: string,
  overrides: Map<string,SpanOverride>, selectedKey: string|null, draft: SpanOverride|null): boolean {
  const has=(key:string)=> {
    const override=key===selectedKey && draft!==null ? draft : overrides.get(key);
    // Old saved prose did not contain vector objects. Preserve its source ink
    // until that ID is inserted/adopted, including an intentional deletion.
    return !!override && (override.managedSourceSymbols?.includes(element.symbolId)
      || override.segments.some(run=>(run.symbolId ?? resolveLegacySymbol(run.font,run.text)?.id)===element.symbolId));
  };
  const blockKey=block.editorKey ? `${block.editorKey}__${language}` : `page_${page}_block_${element.anchor.blockIndex}`;
  if (has(blockKey)) return true;
  return (block.typographicUnits ?? []).some(unit=>unit.field.lineIds.includes(element.anchor.lineId) && has(`page_${page}_unit_${unit.id}__${language}`))
    || (block.typographicSpanUnits ?? []).some(unit=>unit.spanRefs.includes(`${element.anchor.lineId}:${element.anchor.spanIndex}`) && has(`page_${page}_unit_${unit.id}__${language}`))
    || (block.creditUnits ?? (block.creditUnit?[block.creditUnit]:[])).some(unit=>[unit.label,unit.body].some(field=>field.lineIds.includes(element.anchor.lineId) && has(`page_${page}_credit_${unit.id}_${field.id}__${language}`)));
}

/** Cut only confirmed inline regions out of an existing source-art overlay. */
export function sourceOverlayMask(bbox: number[], elements: SourceInlineElement[]): string|undefined {
  const [x0,y0,x1,y1]=bbox;const holes=elements.filter(e=>e.mask.bbox[0]<x1 && e.mask.bbox[2]>x0 && e.mask.bbox[1]<y1 && e.mask.bbox[3]>y0);
  if (!holes.length)return undefined;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x1-x0} ${y1-y0}"><mask id="m"><rect width="100%" height="100%" fill="white"/>${holes.map(e=>{
    const [a,b,c,d]=e.mask.bbox;return `<rect x="${a-x0}" y="${b-y0}" width="${c-a}" height="${d-b}" fill="black"/>`;
  }).join('')}</mask><rect width="100%" height="100%" fill="white" mask="url(#m)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
