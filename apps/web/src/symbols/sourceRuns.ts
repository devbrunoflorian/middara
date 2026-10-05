import type { Segment } from '../components/RichSpanEditor';
import type { SpanData } from '../components/PageRenderer';
import { resolveLegacySymbol } from './semanticSymbols';

/** Preserve text styles and carry the glyph's identity into the editable run. */
export function sourceSpanRuns(spans: SpanData[], mapFont: (font:string)=>{weight:number;style:'normal'|'italic'}): Segment[] {
  return spans.filter(span=>!span.renderOnlyStrokePass).flatMap(span=>{
    const mapped=mapFont(span.font);
    const run:Segment={text:span.displayOverride || span.text,font:span.font,size:span.renderSizeOverridePt ?? span.size,
      color:span.color || '#231f20',weight:span.renderWeightOverride ?? mapped.weight,style:mapped.style,
      textStrokeWidthPt:span.renderTextStrokeWidthPt,textStrokeColor:span.renderTextStrokeColor,disableLigatures:true};
    const symbolId=span.semanticSymbolId ?? resolveLegacySymbol(span.font,span.text)?.id;
    if (!symbolId)return [run];
    const leading=span.text.match(/^\s+/)?.[0] ?? '';const trailing=span.text.match(/\s+$/)?.[0] ?? '';
    return [...(leading?[{...run,text:leading,font:'OptimaLTStd'}]:[]),{...run,text:'\uFFFC',symbolId,symbolMetrics:span.sourceSymbolMetrics},...(trailing?[{...run,text:trailing,font:'OptimaLTStd'}]:[])];
  }).filter(run=>run.text.length>0);
}
