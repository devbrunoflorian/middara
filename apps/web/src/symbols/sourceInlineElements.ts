import type { Block, SpanData } from '../components/PageRenderer';
import type { SpanOverride } from '../components/RichSpanEditor';
import { SYMBOL_OBJECT_MARKER } from './inlineCodec';
import { getSemanticSymbol, resolveLegacySymbol, type InlineSymbolMetrics } from './semanticSymbols';

export interface SourceInlineElement {
  symbolId: string;
  /** Per-occurrence exception when the page/component raster omits this source vector. */
  sourceRendering?: 'semantic-inline';
  /** Source text glyphs that are visually part of this composite symbol. */
  coveredSourceText?: { lineId: string; spanIndex: number; text: string };
  metrics?: InlineSymbolMetrics;
  color?: string;
  bbox: [number,number,number,number];
  anchor: { blockId: string; blockIndex: number; lineId: string; spanIndex: number; side: 'before'|'after'|'replace'|'replace-text'; sizePt: number; textRange?: [number,number]; lineStartX?: number; gapPt?: number; trailingGapPt?: number; ownerSpanRef?: { lineId: string; spanIndex: number } };
  mask: { url: string; bbox: [number,number,number,number]; clipShape?: 'circle' };
}

/** Virtual editor objects must not change advances in the untouched EN view. */
export function previousSourceSpan(spans:SpanData[],index:number):SpanData|undefined {
  for(let i=index-1;i>=0;i--)if(!spans[i].semanticSymbolId)return spans[i];
  return undefined;
}

const INLINE_ORDER_X_TOLERANCE_PT = 0.05;
const INLINE_ORDER_Y_TOLERANCE_PT = 1;

/** Correct PDF extraction order when a standalone space follows a before-anchored drawing. */
function sourceObjectInsertionIndex(element:SourceInlineElement,spans:SpanData[]):number {
  let index=element.anchor.spanIndex;
  if(element.anchor.side!=='before')return index;
  const iconRight=element.bbox[2];
  const iconTop=element.bbox[1];
  const iconBottom=element.bbox[3];
  while(index>0) {
    const preceding=spans[index-1];
    const [x0,y0,,y1]=preceding.bbox;
    if(preceding.text.trim() || x0<iconRight-INLINE_ORDER_X_TOLERANCE_PT
      || y0>=iconBottom+INLINE_ORDER_Y_TOLERANCE_PT || y1<=iconTop-INLINE_ORDER_Y_TOLERANCE_PT)break;
    index--;
  }
  return index;
}

/** Keep an inline object and the whitespace around it editable within a span unit. */
function includeInlineObjectsInSpanUnits(block: Block, elements: SourceInlineElement[]): Block {
  if (!block.typographicSpanUnits?.length || !block.lines) return block;
  const units = block.typographicSpanUnits.map(unit => ({ ...unit, spanRefs: [...unit.spanRefs] }));
  let changed = false;
  for (const element of elements) {
    if (element.anchor.blockId !== block.id) continue;
    const line = block.lines.find(candidate => candidate.id === element.anchor.lineId);
    if (!line) continue;
    const refAt = (index: number) => `${line.id}:${line.spans[index]?.sourceSpanIndex ?? index}`;
    const insertionIndex = sourceObjectInsertionIndex(element,line.spans);
    const objectRef = refAt(insertionIndex);
    if (units.some(unit => unit.spanRefs.includes(objectRef))) continue;

    let left = insertionIndex - 1;
    while (left >= 0 && !line.spans[left].text.trim()) left--;
    let right = insertionIndex;
    while (right < line.spans.length && !line.spans[right].text.trim()) right++;
    if (left < 0 || right >= line.spans.length) continue;
    const beforeRef = refAt(left);
    const afterRef = refAt(right);
    const owner = units.find(unit => unit.spanRefs.includes(beforeRef) && unit.spanRefs.includes(afterRef));
    if (!owner) continue;

    let safeWhitespaceGap = true;
    for (let index = left + 1; index < right; index++) {
      const ref = refAt(index);
      if (line.spans[index].text.trim() || units.some(unit => unit.spanRefs.includes(ref) && unit !== owner)) {
        safeWhitespaceGap = false;
        break;
      }
    }
    if (!safeWhitespaceGap) continue;
    for (let index = left + 1; index <= right; index++) {
      const ref = refAt(index);
      if (line.spans[index].text.trim()) continue;
      if (!owner.spanRefs.includes(ref)) owner.spanRefs.push(ref);
      changed = true;
    }
  }
  return changed ? { ...block, typographicSpanUnits: units } : block;
}

/** Runtime augmentation: original JSON IDs, arrays and persisted keys stay intact. */
export function attachSourceInlineElements(blocks: Block[], elements: SourceInlineElement[]): Block[] {
  return blocks.map(block=>{
    const unitAwareBlock = includeInlineObjectsInSpanUnits(block, elements);
    return { ...unitAwareBlock,lines:unitAwareBlock.lines?.map(line=>{
    const lineElements=elements.filter(e=>e.anchor.blockId===block.id && e.anchor.lineId===line.id && getSemanticSymbol(e.symbolId));
    const requestedStart=lineElements.map(e=>e.anchor.lineStartX).filter((x):x is number=>x!==undefined);
    const coveredLineElements=elements.filter(e=>e.anchor.blockId===block.id && e.coveredSourceText?.lineId===line.id);
    const adjustedLine= requestedStart.length ? (()=>{
      const availableX=line.availableX ?? line.bbox[0];
      const availableWidth=line.availableWidth ?? line.bbox[2]-availableX;
      const right=availableX+availableWidth;
      const availableXNext=Math.min(...requestedStart);
      return {...line,availableX:availableXNext,availableWidth:Math.max(0,right-availableXNext)};
    })() : line;
    const sourceFlowStartPt = lineElements.length
      ? Math.min(...line.spans.filter(span=>!span.renderOnlyStrokePass).map(span=>span.bbox[0]),...lineElements.map(element=>element.bbox[0]))
      : coveredLineElements.length ? Math.min(...coveredLineElements.map(element=>element.coveredSourceText!.spanIndex===0
        ? line.spans[0]?.bbox[0] ?? line.bbox[0]
        : line.spans[element.coveredSourceText!.spanIndex]?.bbox[0] ?? line.bbox[0]))
        : undefined;
    const flowLine = lineElements.length && sourceFlowStartPt !== undefined && sourceFlowStartPt < (adjustedLine.availableX ?? adjustedLine.bbox[0])
      ? { ...adjustedLine,
        availableWidth: (adjustedLine.availableX ?? adjustedLine.bbox[0]) + (adjustedLine.availableWidth ?? adjustedLine.bbox[2] - (adjustedLine.availableX ?? adjustedLine.bbox[0])) - sourceFlowStartPt,
        availableX: sourceFlowStartPt,
      }
      : adjustedLine;
    return {...flowLine,...(sourceFlowStartPt !== undefined ? {renderSourceSpanGeometry:true,renderSourceSpanStartPt:sourceFlowStartPt} : {}),spans:line.spans.flatMap((span,index)=>{
      const matches=lineElements.filter(e=>sourceObjectInsertionIndex(e,line.spans)===index);
      const coveredBy=elements.find(e=>e.anchor.blockId===block.id && e.coveredSourceText?.lineId===line.id
        && e.coveredSourceText.spanIndex===(span.sourceSpanIndex ?? index));
      const metricsFor=(e:SourceInlineElement):InlineSymbolMetrics|undefined=>{
        if(!e.metrics)return undefined;
        return {...e.metrics,
          ...(e.anchor.gapPt !== undefined ? {gapEm:e.anchor.gapPt/e.anchor.sizePt} : {}),
          ...(e.anchor.trailingGapPt !== undefined ? {trailingGapEm:e.anchor.trailingGapPt/e.anchor.sizePt} : {})};
      };
      const make=(e:SourceInlineElement,styleSpan:SpanData,sourceSpanIndex:number):SpanData=>({ text:SYMBOL_OBJECT_MARKER,semanticSymbolId:e.symbolId,sourceRendering:e.sourceRendering,sourceSpanIndex,
        sourceSymbolMetrics:metricsFor(e),
        font:styleSpan.font,size:e.anchor.sizePt,color:e.color ?? styleSpan.color,flags:styleSpan.flags,bbox:e.bbox,renderAsSourceOverlayDuplicate:true,renderSourceOverlayLanguage:'all' });
      const sourceInlineObjects=matches.filter(e=>e.anchor.side==='replace-text' && e.anchor.textRange);
      const replacedLegacyGlyph=matches.find(e=>e.anchor.side==='replace' && e.anchor.spanIndex===index
        && resolveLegacySymbol(span.font,span.text)?.id===e.symbolId);
      return [...matches.filter(e=>e.anchor.side==='before').map(e=>make(e,line.spans[e.anchor.spanIndex] ?? span,index)),{...span,sourceSpanIndex:index,
        ...(coveredBy ? {sourceInlineCoveredBy:coveredBy.symbolId} : {}),
        ...(replacedLegacyGlyph?.metrics ? {sourceSymbolMetrics:metricsFor(replacedLegacyGlyph)} : {}),
        ...(sourceInlineObjects.length?{sourceInlineObjects}:{}),
      },...matches.filter(e=>e.anchor.side==='after').map(e=>make(e,line.spans[e.anchor.spanIndex] ?? span,index))];
    })};
    })};
  });
}

export function sourceElementIsReplaced(element: SourceInlineElement, block: Block, page: number, language: string,
  overrides: Map<string,SpanOverride>, selectedKey: string|null, draft: SpanOverride|null): boolean {
  const overrideFor=(key:string)=>key===selectedKey && draft!==null ? draft : overrides.get(key);
  const has=(key:string)=> {
    const override=overrideFor(key);
    // Old saved prose did not contain vector objects. Preserve its source ink
    // until that ID is inserted/adopted, including an intentional deletion.
    return !!override && (override.managedSourceSymbols?.includes(element.symbolId)
      || override.segments.some(run=>(run.symbolId ?? resolveLegacySymbol(run.font,run.text)?.id)===element.symbolId));
  };
  const ownerLineId=element.anchor.ownerSpanRef?.lineId ?? element.anchor.lineId;
  const ownerSpanRef=`${ownerLineId}:${element.anchor.ownerSpanRef?.spanIndex ?? element.anchor.spanIndex}`;
  const blockKey=block.editorKey ? `${block.editorKey}__${language}` : `page_${page}_block_${element.anchor.blockIndex}`;
  const keys=[blockKey,
    ...(block.typographicUnits ?? []).filter(unit=>unit.field.lineIds.includes(ownerLineId)).map(unit=>`page_${page}_unit_${unit.id}__${language}`),
    ...(block.typographicSpanUnits ?? []).filter(unit=>unit.spanRefs.includes(ownerSpanRef)).map(unit=>`page_${page}_unit_${unit.id}__${language}`),
    ...(block.creditUnits ?? (block.creditUnit?[block.creditUnit]:[])).flatMap(unit=>[unit.label,unit.body]
      .filter(field=>field.lineIds.includes(ownerLineId)).map(field=>`page_${page}_credit_${unit.id}_${field.id}__${language}`)),
  ];
  if(keys.some(has))return true;
  // A semantic-source family replaces its PDF paint only when this language
  // has no legacy override for the owner. Legacy prose without symbol IDs
  // keeps the original ink until the editor explicitly adopts the symbol.
  if(keys.some(key=>overrideFor(key)))return false;
  return (element.sourceRendering ?? getSemanticSymbol(element.symbolId)?.sourceRendering)==='semantic-inline';
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
