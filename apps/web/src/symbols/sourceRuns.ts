import type { Segment } from '../components/RichSpanEditor';
import type { SpanData } from '../components/PageRenderer';
import { resolveLegacySymbol } from './semanticSymbols';
import { sourceCompoundRun } from './sourceCompounds';

/** Preserve text styles and carry the glyph's identity into the editable run. */
export function sourceSpanRuns(spans: SpanData[], mapFont: (font:string)=>{weight:number;style:'normal'|'italic'}): Segment[] {
  return spans.filter(span=>!span.renderOnlyStrokePass).flatMap(span=>{
    if (span.sourceCompoundHidden || span.sourceInlineCoveredBy) return [];
    const mapped=mapFont(span.font);
    const run:Segment={text:span.displayOverride || span.text,font:span.font,size:span.renderSizeOverridePt ?? span.size,
      color:span.color || '#231f20',weight:span.renderWeightOverride ?? mapped.weight,style:mapped.style,
      textStrokeWidthPt:span.renderTextStrokeWidthPt,textStrokeColor:span.renderTextStrokeColor,disableLigatures:true};
    const compound = sourceCompoundRun(span);
    if (compound) return [{ ...run, ...compound }];
    if(span.sourceInlineObjects?.length) {
      if(span.sourceInlineObjects.some(element=>!element.anchor.textRange))return [run];
      const objects=[...span.sourceInlineObjects].sort((a,b)=>a.anchor.textRange![0]-b.anchor.textRange![0]);
      const parts:Segment[]=[];let cursor=0;
      for(const element of objects) {
        const [start,end]=element.anchor.textRange!;
        // Keep source text intact if a stale/overlapping range cannot be proven.
        if(!Number.isInteger(start) || !Number.isInteger(end) || start<cursor || end<=start || end>run.text.length || run.text.slice(start,end).trim())return [run];
        if(start>cursor)parts.push({...run,text:run.text.slice(cursor,start)});
        parts.push({...run,text:'\uFFFC',symbolId:element.symbolId,symbolMetrics:element.metrics,
          sourceRendering:element.sourceRendering,color:element.color ?? run.color});
        cursor=end;
      }
      if(cursor<run.text.length)parts.push({...run,text:run.text.slice(cursor)});
      return parts;
    }
    const symbolId=span.semanticSymbolId ?? resolveLegacySymbol(span.font,span.text)?.id;
    if (!symbolId)return [run];
    const leading=span.text.match(/^\s+/)?.[0] ?? '';const trailing=span.text.match(/\s+$/)?.[0] ?? '';
    return [...(leading?[{...run,text:leading,font:'OptimaLTStd'}]:[]),{...run,text:'\uFFFC',symbolId,symbolMetrics:span.sourceSymbolMetrics,
      sourceRendering:span.sourceRendering},...(trailing?[{...run,text:trailing,font:'OptimaLTStd'}]:[])];
  }).filter(run=>run.text.length>0);
}
