import type { Segment } from '../components/RichSpanEditor';
import { SEMANTIC_SYMBOLS, findSymbolByAlias, getSemanticSymbol, getSymbolEditorToken, isSymbolAllowed, resolveLegacySymbol, type InlineEditorContext, type InlineSymbolMetrics, type SymbolAliasPreferences, type SymbolLanguage } from './semanticSymbols';

export const SYMBOL_OBJECT_MARKER = '\uFFFC';
type RunStyle = Omit<Segment, 'text' | 'symbolId'>;
const LEGACY_EDITOR_TOKENS = SEMANTIC_SYMBOLS.flatMap(symbol => Object.values(symbol.editorTokens).map(token => ({ token, symbol })))
  .sort((a,b) => b.token.length - a.token.length);

export interface EditableTokenRange { start:number; end:number; id:string; token:string }

/** Float-noise-tolerant identity check for a source icon's local appearance. */
function sameSourceSymbolTemplate(a:Segment,b:Segment):boolean {
  const visualFields: (keyof Segment)[] = ['font','size','color','weight','style','textStrokeWidthPt','textStrokeColor'];
  if(!visualFields.every(key=>a[key]===b[key]))return false;
  // Some source dimensions are rounded to 0.001 pt. Compare normalized values
  // in point space so the same PDF drawing does not become ambiguous solely
  // because its measured width landed on adjacent rounding steps.
  const sizePt=Number.isFinite(a.size) && a.size>0 ? a.size : undefined;
  const equivalentSourceAssets = !!a.symbolMetrics?.sourceAppearanceKey
    && a.symbolMetrics.sourceAppearanceKey === b.symbolMetrics?.sourceAppearanceKey;
  const metricFields: (keyof InlineSymbolMetrics)[] = ['widthEm','heightEm','verticalAlignEm','advanceEm','gapEm','trailingGapEm','renderLanguage','sourceAppearanceKey',
    ...(equivalentSourceAssets ? [] : ['renderVariant','sourceAssetUrl'] as const)];
  return metricFields.every(key=>{
    const first=a.symbolMetrics?.[key];const second=b.symbolMetrics?.[key];
    if(typeof first==='number' && typeof second==='number') {
      if(!Number.isFinite(first) || !Number.isFinite(second))return false;
      return first===second || (sizePt!==undefined && Math.abs(first-second)*sizePt<=0.0011);
    }
    return first===second;
  });
}

/**
 * Keep equivalent source occurrences in reading order. Their paint may be the
 * same while their audited assets are occurrence-specific, so a newly added
 * alias should consume the next unused occurrence instead of cloning the first.
 */
function equivalentSourceSymbolTemplates(segments:Segment[]):Map<string,Segment[]|null> {
  const templates=new Map<string,Segment[]|null>();
  for(const segment of segments) {
    const id=segment.symbolId ?? resolveLegacySymbol(segment.font,segment.text)?.id;
    if(!id)continue;
    const existing=templates.get(id);
    if(templates.has(id) && (!existing || !sameSourceSymbolTemplate(existing[0],segment))) {
      templates.set(id,null);
    } else if(!templates.has(id)) {
      // A legacy font glyph can provide an unambiguous size/style template even
      // when no sidecar supplied occurrence metrics; the renderer then uses its
      // normal registry geometry for that alias.
      templates.set(id,[{...segment,...(segment.symbolMetrics ? {symbolMetrics:{...segment.symbolMetrics}} : {})}]);
    } else if(existing) {
      existing.push({...segment,...(segment.symbolMetrics ? {symbolMetrics:{...segment.symbolMetrics}} : {})});
    }
  }
  return templates;
}

function matchingSourceTemplateIndex(templates:Segment[],used:Set<number>,run:Segment):number {
  const sourceAssetUrl=run.symbolMetrics?.sourceAssetUrl;
  if(sourceAssetUrl) {
    const exact=templates.findIndex((template,index)=>!used.has(index)
      && template.symbolMetrics?.sourceAssetUrl===sourceAssetUrl);
    if(exact>=0)return exact;
  }
  const renderVariant=run.symbolMetrics?.renderVariant;
  if(renderVariant) {
    const exact=templates.findIndex((template,index)=>!used.has(index)
      && template.symbolMetrics?.renderVariant===renderVariant);
    if(exact>=0)return exact;
  }
  if(templates.length===1 && !used.has(0) && sameSourceSymbolTemplate(templates[0],run))return 0;
  return -1;
}

function sameMetadataValue(left:unknown,right:unknown):boolean {
  if(Object.is(left,right))return true;
  if(!left || !right || typeof left!=='object' || typeof right!=='object')return false;
  if(Array.isArray(left)!==Array.isArray(right))return false;
  const leftKeys=Object.keys(left as object).sort();
  const rightKeys=Object.keys(right as object).sort();
  return leftKeys.length===rightKeys.length && leftKeys.every((key,index)=>key===rightKeys[index]
    && sameMetadataValue((left as Record<string,unknown>)[key],(right as Record<string,unknown>)[key]));
}

/** Merge only adjacent plain-text runs whose complete non-text metadata matches. */
function coalesceEquivalentTextRuns(segments:Segment[]):Segment[] {
  const merged:Segment[]=[];
  for(const segment of segments) {
    const previous=merged[merged.length-1];
    const canMerge=previous && !previous.symbolId && !segment.symbolId
      && !previous.text.includes(SYMBOL_OBJECT_MARKER) && !segment.text.includes(SYMBOL_OBJECT_MARKER)
      && !resolveLegacySymbol(previous.font,previous.text) && !resolveLegacySymbol(segment.font,segment.text)
      && sameMetadataValue(
        Object.fromEntries(Object.entries(previous).filter(([key])=>key!=='text')),
        Object.fromEntries(Object.entries(segment).filter(([key])=>key!=='text')),
      );
    if(canMerge)previous.text+=segment.text;
    else merged.push({...segment});
  }
  return merged;
}

/** One tokenizer for serialization, atomic editing and clipboard boundaries. */
export function editableTokenRanges(text:string, aliasPreferences?:SymbolAliasPreferences):EditableTokenRange[] {
  const ranges:EditableTokenRange[]=[];let cursor=0;
  while (cursor<text.length) {
    const legacy=LEGACY_EDITOR_TOKENS.map(entry=>({...entry,index:text.indexOf(entry.token,cursor)}))
      .filter(entry=>entry.index>=0).sort((a,b)=>a.index-b.index || b.token.length-a.token.length)[0];
    const candidates: EditableTokenRange[] = legacy
      ? [{start:legacy.index,end:legacy.index+legacy.token.length,id:legacy.symbol.id,token:legacy.token}]
      : [];
    const legacyExplicit=/⟦symbol:([^⟧]+)⟧/g;legacyExplicit.lastIndex=cursor;
    const oldUnknown=legacyExplicit.exec(text);
    if(oldUnknown) {
      let id=oldUnknown[1];
      try {id=decodeURIComponent(id);} catch {/* Retain a legacy literal ID with percent signs. */}
      candidates.push({start:oldUnknown.index,end:oldUnknown.index+oldUnknown[0].length,id,token:oldUnknown[0]});
    }
    const aliases=/\[\[([^\[\]]+)\]\]/g;aliases.lastIndex=cursor;
    let aliasMatch:RegExpExecArray|null;
    while((aliasMatch=aliases.exec(text))) {
      const expression=aliasMatch[1];
      if(expression.toLowerCase().startsWith('symbol:')) {
        let id=expression.slice('symbol:'.length);
        try {id=decodeURIComponent(id);} catch {/* Retain an explicit future ID with percent signs. */}
        candidates.push({start:aliasMatch.index,end:aliases.lastIndex,id,token:aliasMatch[0]});
        break;
      }
      const symbol=findSymbolByAlias(expression,aliasPreferences);
      if(symbol) {
        candidates.push({start:aliasMatch.index,end:aliases.lastIndex,id:symbol.id,token:aliasMatch[0]});
        break;
      }
    }
    const next=candidates.sort((a,b)=>a.start-b.start || b.token.length-a.token.length)[0];
    if(!next)break;
    ranges.push(next);cursor=next.end;
  }
  return ranges;
}

/** Editable plain-text projection. IDs remain reversible even without a definition. */
export function editableTextForSegments(segments: Segment[], language: SymbolLanguage, aliasPreferences?:SymbolAliasPreferences): string {
  return segments.map(run => run.symbolId
    ? (getSymbolEditorToken(run.symbolId, language, aliasPreferences) ?? `[[symbol:${encodeURIComponent(run.symbolId)}]]`).repeat(Array.from(run.text).length || 1)
    : run.text).join('');
}

interface TextMatchRange {
  sourceStart:number;
  sourceEnd:number;
  targetStart:number;
  targetEnd:number;
}

interface TextToken {
  text:string;
  start:number;
  end:number;
}

/**
 * Align unchanged word/punctuation runs across a rewrite so their original
 * rich metadata follows them even when translated text changes around them.
 * The bounded LCS is intentionally token-based: it keeps formatting on stable
 * values and terms without aligning individual repeated letters in new words.
 */
function unchangedTextRanges(source:string,target:string):TextMatchRange[] {
  if(!source || !target)return [];
  const tokenize=(value:string):TextToken[]=>Array.from(
    // Whitespace is deliberately not an alignment anchor. Repeated spaces
    // otherwise win LCS ties and can misassociate a later emphasized token.
    value.matchAll(/[\p{L}\p{M}_]+|[-+]?\p{N}+(?:[ºª]|(?:st|nd|rd|th))?|[^\s\p{L}\p{M}\p{N}_]+/giu),
    match=>({text:match[0],start:match.index ?? 0,end:(match.index ?? 0)+match[0].length}),
  );
  const oldTokens=tokenize(source);
  const newTokens=tokenize(target);
  const columns=newTokens.length+1;
  const cells=(oldTokens.length+1)*columns;
  // Avoid a large synchronous editor pause for unusually long blocks. The
  // caller still receives the proven common edge spans in that rare case.
  if(cells>4_000_000) {
    let prefix=0;
    while(prefix<Math.min(source.length,target.length) && source[prefix]===target[prefix])prefix++;
    if(prefix>0 && /[\uDC00-\uDFFF]/.test(target[prefix] ?? ''))prefix--;
    let suffix=0;
    while(suffix<Math.min(source.length,target.length)-prefix
      && source[source.length-1-suffix]===target[target.length-1-suffix])suffix++;
    if(suffix>0 && /[\uDC00-\uDFFF]/.test(target[target.length-suffix] ?? ''))suffix--;
    const ranges:TextMatchRange[]=[];
    if(prefix)ranges.push({sourceStart:0,sourceEnd:prefix,targetStart:0,targetEnd:prefix});
    if(suffix)ranges.push({sourceStart:source.length-suffix,sourceEnd:source.length,
      targetStart:target.length-suffix,targetEnd:target.length});
    return ranges;
  }

  const table=new Uint16Array(cells);
  for(let oldIndex=oldTokens.length-1;oldIndex>=0;oldIndex--) {
    const row=oldIndex*columns;
    const nextRow=(oldIndex+1)*columns;
    for(let newIndex=newTokens.length-1;newIndex>=0;newIndex--) {
      table[row+newIndex]=oldTokens[oldIndex].text===newTokens[newIndex].text
        ? table[nextRow+newIndex+1]+1
        : Math.max(table[nextRow+newIndex],table[row+newIndex+1]);
    }
  }

  const ranges:TextMatchRange[]=[];
  let oldIndex=0;
  let newIndex=0;
  while(oldIndex<oldTokens.length && newIndex<newTokens.length) {
    const oldToken=oldTokens[oldIndex];
    const newToken=newTokens[newIndex];
    if(oldToken.text===newToken.text) {
      const previous=ranges[ranges.length-1];
      if(previous
        && source.slice(previous.sourceEnd,oldToken.start)===target.slice(previous.targetEnd,newToken.start)) {
        previous.sourceEnd=oldToken.end;
        previous.targetEnd=newToken.end;
      } else {
        ranges.push({sourceStart:oldToken.start,sourceEnd:oldToken.end,
          targetStart:newToken.start,targetEnd:newToken.end});
      }
      oldIndex++;
      newIndex++;
      continue;
    }
    if(table[(oldIndex+1)*columns+newIndex]>=table[oldIndex*columns+newIndex+1])oldIndex++;
    else newIndex++;
  }
  return ranges;
}

function hasCharacterEmphasis(segment: Segment): boolean {
  return (typeof segment.weight === 'number' && segment.weight >= 600)
    || /bold|black|italic/i.test(segment.font ?? '')
    || segment.style === 'italic';
}

/**
 * Report when a translated target has no exact text anchor for source emphasis.
 * Exact surviving source words can keep their existing style; translated
 * equivalents require a human to associate the semantics and apply the style.
 */
export function needsManualRichStyleReview(
  sourceSegments: Segment[],
  targetText: string,
  aliasPreferences?: SymbolAliasPreferences,
): boolean {
  const targetObjects = editableTokenRanges(targetText, aliasPreferences);
  const targetPlain = (() => {
    const parts: string[] = [];
    let cursor = 0;
    for (const object of targetObjects) {
      parts.push(targetText.slice(cursor, object.start));
      cursor = object.end;
    }
    parts.push(targetText.slice(cursor));
    return parts.join('').replaceAll(SYMBOL_OBJECT_MARKER, '');
  })();
  const targetLabel = /^[\t ]*[^:\n]{1,31}:[\t ]*/u.exec(targetPlain);
  const targetBody = targetLabel ? targetPlain.slice(targetLabel[0].length) : targetPlain;
  const targetTokenCounts = new Map<string, number>();
  for (const match of targetBody.matchAll(/[\p{L}\p{M}_]+|[-+]?\p{N}+(?:[ºª]|(?:st|nd|rd|th))?/giu)) {
    targetTokenCounts.set(match[0], (targetTokenCounts.get(match[0]) ?? 0) + 1);
  }

  const sourceRuns = sourceSegments.filter(segment => !segment.symbolId
    && !resolveLegacySymbol(segment.font, segment.text));
  const sourcePlain = sourceRuns.map(segment => segment.text.replaceAll(SYMBOL_OBJECT_MARKER, '')).join('');
  const sourceLabel = /^[\t ]*[^:\n]{1,31}:[\t ]*/u.exec(sourcePlain);
  const sourceBodyStart = sourceLabel?.[0].length ?? 0;
  let sourceOffset = 0;
  for (const segment of sourceRuns) {
    const cleanText = segment.text.replaceAll(SYMBOL_OBJECT_MARKER, '');
    const segmentStart = sourceOffset;
    const segmentEnd = segmentStart + cleanText.length;
    sourceOffset = segmentEnd;
    if (!hasCharacterEmphasis(segment) || segmentEnd <= sourceBodyStart) continue;
    const bodyText = cleanText.slice(Math.max(0, sourceBodyStart - segmentStart));
    for (const match of bodyText.matchAll(/[\p{L}\p{M}_]+|[-+]?\p{N}+(?:[ºª]|(?:st|nd|rd|th))?/giu)) {
      if (targetTokenCounts.get(match[0]) !== 1) return true;
    }
  }
  return false;
}

export function segmentsFromEditableText(text: string, style: RunStyle, language: SymbolLanguage,
  previous: Segment[] = [], context: InlineEditorContext = 'paragraph', aliasPreferences?:SymbolAliasPreferences,
  sourceTemplateSegments: Segment[] = []): Segment[] {
  // Exact round-trip keeps segmentation, style, unknown IDs and future metadata.
  if (text === editableTextForSegments(previous, language, aliasPreferences)) return previous.map(run => ({ ...run }));
  const baseline=editableTextForSegments(previous,language,aliasPreferences);
  const unchanged=unchangedTextRanges(baseline,text);
  const oldPlain:{start:number;end:number;run:Segment}[]=[];let oldOffset=0;
  for(const run of previous) {
    const projected=editableTextForSegments([run],language,aliasPreferences);
    if(!run.symbolId)oldPlain.push({start:oldOffset,end:oldOffset+projected.length,run});
    oldOffset+=projected.length;
  }
  // Exact unchanged islands below retain their original spans. Rewritten text
  // is not semantically aligned to the English by character position or length.
  const sameStyle=(a:Segment,b:Segment) => a.font===b.font && a.size===b.size && a.color===b.color
    && a.weight===b.weight && a.style===b.style && a.disableLigatures===b.disableLigatures
    && a.textStrokeWidthPt===b.textStrokeWidthPt && a.textStrokeColor===b.textStrokeColor;
  const styleOf=(run:Segment):RunStyle => ({font:run.font,size:run.size,color:run.color,weight:run.weight,
    style:run.style,disableLigatures:run.disableLigatures,textStrokeWidthPt:run.textStrokeWidthPt,textStrokeColor:run.textStrokeColor});
  const bodyFallbackStyle = (): RunStyle | undefined => {
    const sourceRuns=sourceTemplateSegments.filter(run=>!run.symbolId && run.text
      && !resolveLegacySymbol(run.font,run.text));
    if(!sourceRuns.length)return undefined;
    const sourcePlain=sourceRuns.map(run=>run.text.replaceAll(SYMBOL_OBJECT_MARKER,'')).join('');
    const label=/^[\t ]*[^:\n]{1,31}:[\t ]*/u.exec(sourcePlain);
    const labelEnd=label?.[0].length ?? 0;
    let offset=0;
    const bodyRuns=sourceRuns.flatMap(run=>{
      const text=run.text.replaceAll(SYMBOL_OBJECT_MARKER,'');
      const from=Math.max(0,labelEnd-offset);
      offset+=text.length;
      const bodyText=text.slice(from);
      return bodyText.trim() ? [{run,bodyText}] : [];
    });
    if(!bodyRuns.length)return undefined;
    if(bodyRuns.every(entry=>sameStyle(entry.run,bodyRuns[0].run)))return styleOf(bodyRuns[0].run);
    const ordinary=bodyRuns.filter(({run})=>!hasCharacterEmphasis(run)
      && !run.textStrokeWidthPt && !run.textStrokeColor);
    const candidates=ordinary.length ? ordinary : bodyRuns;
    const totals=new Map<string,{style:RunStyle;characters:number}>();
    for(const {run,bodyText} of candidates) {
      const characters=Array.from(bodyText).filter(char=>!/[\s\uFFFC]/u.test(char)).length;
      if(!characters)continue;
      const runStyle=styleOf(run);
      const key=JSON.stringify(runStyle);
      const current=totals.get(key);
      totals.set(key,{style:runStyle,characters:(current?.characters ?? 0)+characters});
    }
    return [...totals.values()].sort((a,b)=>b.characters-a.characters)[0]?.style;
  };
  const fallbackStyle=bodyFallbackStyle() ?? style;
  const appendChangedText=(start:number,end:number)=>{
    if(end<=start)return;
    // Changed text has no semantic alignment to the source rich runs. Keep a
    // safe body base style; the editor surfaces a review notice so a person can
    // map bold/italic/color emphasis with the character-selection controls.
    output.push({...fallbackStyle,text:text.slice(start,end)});
  };
  // Retain the full style metadata for exact unchanged islands, not just the
  // common prefix and suffix. This keeps emphasis on stable values such as
  // -1/-2 through a whole-paragraph rewrite and translated reflow.
  const oldSymbols = previous.filter(run => run.symbolId).flatMap(run => Array.from(run.text || SYMBOL_OBJECT_MARKER,()=>({ ...run })));
  const sourceTemplates=equivalentSourceSymbolTemplates(sourceTemplateSegments);
  const usedSourceTemplates=new Map<string,Set<number>>();
  const output: Segment[] = [];
  const plain=(start:number,end:number)=>{
    const preserved=unchanged.flatMap(match=>oldPlain.flatMap(old=>{
      const sourceStart=Math.max(match.sourceStart,old.start);
      const sourceEnd=Math.min(match.sourceEnd,old.end);
      if(sourceEnd<=sourceStart)return [];
      const targetStart=match.targetStart+(sourceStart-match.sourceStart);
      return [{a:targetStart,b:targetStart+(sourceEnd-sourceStart),run:old.run}];
    })).filter(range=>range.b>range.a && range.a<end && range.b>start).sort((a,b)=>a.a-b.a);
    let offset=start;
    for(const range of preserved) {
      const a=Math.max(offset,range.a);const b=Math.min(end,range.b);
      if(a>offset) {
        appendChangedText(offset,a);
      }
      if(b>a)output.push({...range.run,text:text.slice(a,b)});
      offset=Math.max(offset,b);
    }
    if(offset<end) {
      appendChangedText(offset,end);
    }
  };
  let cursor = 0;
  for (const {start,end,token,id} of editableTokenRanges(text,aliasPreferences)) {
    if (start > cursor) plain(cursor,start);
    const oldIndex = oldSymbols.findIndex(run => run.symbolId === id);
    const old = oldIndex < 0 ? undefined : oldSymbols.splice(oldIndex,1)[0];
    const definition=getSemanticSymbol(id);
    if (definition && !old && !isSymbolAllowed(definition, context)) output.push({ ...style, text: token });
    else {
      const candidates=sourceTemplates.get(id);
      const used=usedSourceTemplates.get(id) ?? new Set<number>();
      usedSourceTemplates.set(id,used);
      let sourceTemplate:Segment|undefined;
      if(candidates) {
        let templateIndex=old ? matchingSourceTemplateIndex(candidates,used,old) : -1;
        // An older/source-less run can inherit the next equivalent occurrence;
        // source-asset identity, when present, always takes precedence.
        if(templateIndex<0 && (!old?.symbolMetrics?.sourceAssetUrl || !old)) {
          templateIndex=candidates.findIndex((_template,index)=>!used.has(index));
        }
        if(templateIndex>=0) {
          sourceTemplate=candidates[templateIndex];
          used.add(templateIndex);
        }
      }
      const base=old ?? sourceTemplate ?? style;
      output.push({ ...base, text: SYMBOL_OBJECT_MARKER, symbolId: id,
        ...(!old?.symbolMetrics && sourceTemplate?.symbolMetrics ? {symbolMetrics:{...sourceTemplate.symbolMetrics}} : {}) });
    }
    cursor=end;
  }
  if(cursor<text.length)plain(cursor,text.length);
  if (context === 'paragraph' || context === 'span-unit') {
    const sourcePrefix = sourceTemplateSegments.filter(run => !run.symbolId).map(run => run.text).join('');
    // Editable aliases such as [[lightning]] occupy many textarea characters,
    // but become one object marker in the output segments. Use the rendered
    // projection for target offsets below so a semantic icon before a short
    // label does not make the label range spill into the translated body.
    const targetProjection = output.map(run => run.text).join('');
    const targetStart = targetProjection.search(/[^\s\uFFFC]/u);
    const sourceStart = sourcePrefix.search(/\S/u);
    const targetColon = targetStart >= 0 ? targetProjection.indexOf(':', targetStart) : -1;
    const sourceColon = sourceStart >= 0 ? sourcePrefix.indexOf(':', sourceStart) : -1;
    const sourceLabelRun = sourceTemplateSegments.find(run => !run.symbolId && /\S/u.test(run.text));
    if (sourceLabelRun && targetColon >= targetStart && targetColon - targetStart < 32
      && sourceColon >= sourceStart && sourceColon - sourceStart < 32) {
      // Keep short editorial labels (Note:, Example 1:, Important:) in their
      // source emphasis after translation, even when the translated label no
      // longer shares a literal prefix with the English wording.
      const labelStyle: RunStyle = {
        font: sourceLabelRun.font,
        size: sourceLabelRun.size,
        color: sourceLabelRun.color,
        weight: sourceLabelRun.weight,
        style: sourceLabelRun.style,
        disableLigatures: sourceLabelRun.disableLigatures,
        textStrokeWidthPt: sourceLabelRun.textStrokeWidthPt,
        textStrokeColor: sourceLabelRun.textStrokeColor,
      };
      const labelEnd = targetColon + 1;
      let outputOffset = 0;
      const styledOutput: Segment[] = [];
      for (const run of output) {
        const runEnd = outputOffset + run.text.length;
        // Label-style recovery applies to prose characters only. Inline
        // objects keep their own occurrence metrics and rich metadata even
        // when an alias was reinserted before a short label.
        if (run.symbolId || resolveLegacySymbol(run.font, run.text)) {
          styledOutput.push(run);
          outputOffset = runEnd;
          continue;
        }
        const labelFrom = Math.max(outputOffset, targetStart);
        const labelTo = Math.min(runEnd, labelEnd);
        if (labelTo > labelFrom) {
          const prefixLength = labelFrom - outputOffset;
          const labelLength = labelTo - labelFrom;
          if (prefixLength) styledOutput.push({ ...run, text: run.text.slice(0, prefixLength) });
          styledOutput.push({ ...run, ...labelStyle, text: run.text.slice(prefixLength, prefixLength + labelLength) });
          if (labelTo < runEnd) styledOutput.push({ ...run, text: run.text.slice(prefixLength + labelLength) });
        } else {
          styledOutput.push(run);
        }
        outputOffset = runEnd;
      }
      output.splice(0, output.length, ...styledOutput);
    }
  }
  return output.length ? coalesceEquivalentTextRuns(output) : [{ ...style, text: '' }];
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

export function insertEditorToken(text: string, start: number, end: number, token: string, aliasPreferences?:SymbolAliasPreferences) {
  const {start:from,end:to}=expandEditorTokenSelection(text,start,end,aliasPreferences);
  return { text: text.slice(0,from)+token+text.slice(to), caret: from+token.length };
}

/** A partial object token is selected as a whole, never silently damaged. */
export function expandEditorTokenSelection(text:string,start:number,end:number,aliasPreferences?:SymbolAliasPreferences) {
  let from=Math.max(0,Math.min(start,text.length));let to=Math.max(from,Math.min(end,text.length));
  for(const range of editableTokenRanges(text,aliasPreferences)) {
    if((from<range.end && to>range.start) || (from===to && from>range.start && from<range.end)) {
      from=Math.min(from,range.start);to=Math.max(to,range.end);
    }
  }
  return {start:from,end:to};
}

export function deleteEditorToken(text:string,start:number,end:number,direction:'backward'|'forward',aliasPreferences?:SymbolAliasPreferences) {
  let from=start;let to=end;
  if(from===to) {
    const range=editableTokenRanges(text,aliasPreferences).find(r=>direction==='backward'
      ? from>r.start && from<=r.end : from>=r.start && from<r.end);
    if(!range)return undefined;
    from=range.start;to=range.end;
  } else if(!editableTokenRanges(text,aliasPreferences).some(r=>from<r.end && to>r.start))return undefined;
  return insertEditorToken(text,from,to,'',aliasPreferences);
}

/** Repair native typing over a partial token using the pre-input selection. */
export function normalizeEditableInput(previous:string,next:string,start:number,end:number,aliasPreferences?:SymbolAliasPreferences) {
  const expanded=expandEditorTokenSelection(previous,start,end,aliasPreferences);
  if(expanded.start===start && expanded.end===end)return {text:next,caret:undefined};
  const insertedLength=Math.max(0,next.length-(previous.length-(end-start)));
  return insertEditorToken(previous,start,end,next.slice(start,start+insertedLength),aliasPreferences);
}
