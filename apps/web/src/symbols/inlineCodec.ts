import type { Segment } from '../components/RichSpanEditor';
import { SEMANTIC_SYMBOLS, getSemanticSymbol, getSymbolEditorToken, isSymbolAllowed, type InlineEditorContext, type SymbolLanguage } from './semanticSymbols';

export const SYMBOL_OBJECT_MARKER = '\uFFFC';
type RunStyle = Omit<Segment, 'text' | 'symbolId'>;
const EDITOR_TOKENS = SEMANTIC_SYMBOLS.flatMap(symbol => Object.values(symbol.editorTokens).map(token => ({ token, symbol })))
  .sort((a,b) => b.token.length - a.token.length);

export interface EditableTokenRange { start:number; end:number; id:string; token:string }

/** One tokenizer for serialization, atomic editing and clipboard boundaries. */
export function editableTokenRanges(text:string):EditableTokenRange[] {
  const ranges:EditableTokenRange[]=[];let cursor=0;
  while (cursor<text.length) {
    const known=EDITOR_TOKENS.map(entry=>({...entry,index:text.indexOf(entry.token,cursor)}))
      .filter(entry=>entry.index>=0).sort((a,b)=>a.index-b.index || b.token.length-a.token.length)[0];
    const unknown=/⟦symbol:([^⟧]+)⟧/g;unknown.lastIndex=cursor;
    const explicit=unknown.exec(text);
    if (!known && !explicit)break;
    const useExplicit=explicit && (!known || explicit.index<known.index);
    const start=useExplicit ? explicit.index : known.index;
    const token=useExplicit ? explicit[0] : known.token;
    let id=useExplicit ? explicit[1] : known.symbol.id;
    if(useExplicit) {try {id=decodeURIComponent(id);} catch {/* Retain a legacy literal ID with percent signs. */}}
    ranges.push({start,end:start+token.length,id,token});cursor=start+token.length;
  }
  return ranges;
}

/** Editable plain-text projection. IDs remain reversible even without a definition. */
export function editableTextForSegments(segments: Segment[], language: SymbolLanguage): string {
  return segments.map(run => run.symbolId
    ? (getSymbolEditorToken(run.symbolId, language) ?? `⟦symbol:${encodeURIComponent(run.symbolId)}⟧`).repeat(Array.from(run.text).length || 1)
    : run.text).join('');
}

export function segmentsFromEditableText(text: string, style: RunStyle, language: SymbolLanguage,
  previous: Segment[] = [], context: InlineEditorContext = 'paragraph'): Segment[] {
  // Exact round-trip keeps segmentation, style, unknown IDs and future metadata.
  if (text === editableTextForSegments(previous, language)) return previous.map(run => ({ ...run }));
  const baseline=editableTextForSegments(previous,language);
  let prefix=0;let suffix=0;
  while(prefix<Math.min(text.length,baseline.length) && text[prefix]===baseline[prefix])prefix++;
  while(suffix<Math.min(text.length,baseline.length)-prefix && text[text.length-1-suffix]===baseline[baseline.length-1-suffix])suffix++;
  // Do not preserve half a surrogate pair as a separate React text run.
  if(prefix>0 && /[\uDC00-\uDFFF]/.test(text[prefix] ?? ''))prefix--;
  if(suffix>0 && /[\uDC00-\uDFFF]/.test(text[text.length-suffix] ?? ''))suffix--;
  const oldPlain:{start:number;end:number;run:Segment}[]=[];let oldOffset=0;
  for(const run of previous) {
    const projected=editableTextForSegments([run],language);
    if(!run.symbolId)oldPlain.push({start:oldOffset,end:oldOffset+projected.length,run});
    oldOffset+=projected.length;
  }
  // If an edit is contained by one consistent source style, retain that style
  // (including text outlines used by IMPORTANT/COMMAND/INTELLIGENT). At a
  // mixed-style boundary or across a symbol, keep the selected tool style
  // rather than guessing how new text should be formatted.
  const changedEnd=baseline.length-suffix;
  const replacementStyle = (() => {
    const sameStyle=(a:Segment,b:Segment) => a.font===b.font && a.size===b.size && a.color===b.color
      && a.weight===b.weight && a.style===b.style && a.disableLigatures===b.disableLigatures
      && a.textStrokeWidthPt===b.textStrokeWidthPt && a.textStrokeColor===b.textStrokeColor;
    const styleOf=(run:Segment):RunStyle => ({font:run.font,size:run.size,color:run.color,weight:run.weight,
      style:run.style,disableLigatures:run.disableLigatures,textStrokeWidthPt:run.textStrokeWidthPt,textStrokeColor:run.textStrokeColor});
    if (changedEnd <= prefix) {
      // Insertions inside a source run (or at either outer edge of the whole
      // text) should follow that run. At internal boundaries, only inherit
      // when both neighboring runs have identical styling.
      const left=oldPlain.find(old=>old.start<prefix && old.end>=prefix)?.run;
      const right=oldPlain.find(old=>old.start<=prefix && old.end>prefix)?.run;
      const inherited=left && right ? (sameStyle(left,right) ? left : undefined)
        : prefix===0 ? right : prefix===baseline.length ? left : undefined;
      return inherited ? styleOf(inherited) : style;
    }
    const covered=oldPlain.filter(old=>old.start<changedEnd && old.end>prefix)
      .sort((a,b)=>a.start-b.start);
    let cursor=prefix;
    let first:Segment|undefined;
    for(const range of covered) {
      const start=Math.max(prefix,range.start);const end=Math.min(changedEnd,range.end);
      if(end<=start)continue;
      if(start>cursor || (first && !sameStyle(first,range.run)))return style;
      first ??=range.run;
      cursor=Math.max(cursor,end);
    }
    if(!first || cursor<changedEnd)return style;
    return styleOf(first);
  })();
  const changedStyle=replacementStyle;
  // Retain ordinary styles in unchanged regions; only a confidently uniform
  // source run may lend its style to replaced text.
  const oldSymbols = previous.filter(run => run.symbolId).flatMap(run => Array.from(run.text || SYMBOL_OBJECT_MARKER,()=>({ ...run })));
  const output: Segment[] = [];
  const plain=(start:number,end:number)=>{
    const preserved=oldPlain.flatMap(old=>[
      {a:old.start,b:Math.min(old.end,prefix),run:old.run},
      {a:Math.max(old.start,baseline.length-suffix)+text.length-baseline.length,b:old.end+text.length-baseline.length,run:old.run},
    ]).filter(range=>range.b>range.a && range.a<end && range.b>start).sort((a,b)=>a.a-b.a);
    let offset=start;
    for(const range of preserved) {
      const a=Math.max(offset,range.a);const b=Math.min(end,range.b);
      if(a>offset)output.push({...changedStyle,text:text.slice(offset,a)});
      if(b>a)output.push({...range.run,text:text.slice(a,b)});
      offset=Math.max(offset,b);
    }
    if(offset<end)output.push({...changedStyle,text:text.slice(offset,end)});
  };
  let cursor = 0;
  for (const {start,end,token,id} of editableTokenRanges(text)) {
    if (start > cursor) plain(cursor,start);
    const oldIndex = oldSymbols.findIndex(run => run.symbolId === id);
    const old = oldIndex < 0 ? undefined : oldSymbols.splice(oldIndex,1)[0];
    const definition=getSemanticSymbol(id);
    if (definition && !old && !isSymbolAllowed(definition, context)) output.push({ ...style, text: token });
    else output.push({ ...(old ?? style), text: SYMBOL_OBJECT_MARKER, symbolId: id });
    cursor=end;
  }
  if(cursor<text.length)plain(cursor,text.length);
  return output.length ? output : [{ ...style, text: '' }];
}

/** UTF-16 offsets match textarea selectionStart/End; objects occupy one slot. */
export function replaceSegmentRange(segments: Segment[], start: number, end: number, replacement: Segment[]): Segment[] {
  const length=segments.reduce((n,run)=>n+run.text.length,0);
  const from=Math.max(0,Math.min(start,length));const to=Math.max(from,Math.min(end,length));
  const out: Segment[]=[];let offset=0;let inserted=false;
  for (const run of segments) {
    const next=offset+run.text.length;
    if (next <= from) out.push({ ...run });
    else if (offset >= to) { if (!inserted) { out.push(...replacement.map(r=>({...r})));inserted=true; } out.push({ ...run }); }
    else {
      if (from>offset)out.push({...run,text:run.text.slice(0,from-offset)});
      if (!inserted) { out.push(...replacement.map(r=>({...r})));inserted=true; }
      if (to<next)out.push({...run,text:run.text.slice(to-offset)});
    }
    offset=next;
  }
  if (!inserted)out.push(...replacement.map(r=>({...r})));
  return out.filter(run=>run.text.length>0);
}

export function insertEditorToken(text: string, start: number, end: number, token: string) {
  const {start:from,end:to}=expandEditorTokenSelection(text,start,end);
  return { text: text.slice(0,from)+token+text.slice(to), caret: from+token.length };
}

/** A partial object token is selected as a whole, never silently damaged. */
export function expandEditorTokenSelection(text:string,start:number,end:number) {
  let from=Math.max(0,Math.min(start,text.length));let to=Math.max(from,Math.min(end,text.length));
  for(const range of editableTokenRanges(text)) {
    if((from<range.end && to>range.start) || (from===to && from>range.start && from<range.end)) {
      from=Math.min(from,range.start);to=Math.max(to,range.end);
    }
  }
  return {start:from,end:to};
}

export function deleteEditorToken(text:string,start:number,end:number,direction:'backward'|'forward') {
  let from=start;let to=end;
  if(from===to) {
    const range=editableTokenRanges(text).find(r=>direction==='backward'
      ? from>r.start && from<=r.end : from>=r.start && from<r.end);
    if(!range)return undefined;
    from=range.start;to=range.end;
  } else if(!editableTokenRanges(text).some(r=>from<r.end && to>r.start))return undefined;
  return insertEditorToken(text,from,to,'');
}

/** Repair native typing over a partial token using the pre-input selection. */
export function normalizeEditableInput(previous:string,next:string,start:number,end:number) {
  const expanded=expandEditorTokenSelection(previous,start,end);
  if(expanded.start===start && expanded.end===end)return {text:next,caret:undefined};
  const insertedLength=Math.max(0,next.length-(previous.length-(end-start)));
  return insertEditorToken(previous,start,end,next.slice(start,start+insertedLength));
}
