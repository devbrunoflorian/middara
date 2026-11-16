import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { attachSourceInlineElements, sourceElementIsReplaced, type SourceInlineElement } from '../src/symbols/sourceInlineElements';
import { sourceSpanRuns } from '../src/symbols/sourceRuns';
import { editableTextForSegments, segmentsFromEditableText } from '../src/symbols/inlineCodec';
import { getSemanticSymbol } from '../src/symbols/semanticSymbols';
import type { PageData } from '../src/components/PageRenderer';

const root=process.env.MIDDARA_SYMBOL_AUDIT_DIR;
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const sha=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
describe.runIf(Boolean(root))('prepared source discovery contracts (explicit audit run)',()=>{
  it('audits the 188 existing placements and declared span-unit ownership independently of discovery',()=>{
    const issues:any[]=[];let count=0;let unitOwners=0;
    for(let page=1;page<=102;page++){
      const id=String(page).padStart(3,'0'),dir=resolve(`public/pages/page_${id}`),file=join(dir,'inline_elements.json');
      if(!existsSync(file))continue;
      const elements=read(file).elements as SourceInlineElement[];const raw=read(join(dir,`page_${id}_dom.json`)) as PageData;
      const blocks=attachSourceInlineElements(raw.blocks,elements);
      for(const e of elements){
        count++;const block=blocks.find(b=>b.id===e.anchor.blockId)!;
        const ref=e.anchor.ownerSpanRef||e.anchor;const owner=`${ref.lineId}:${ref.spanIndex}`;
        const units=block.typographicSpanUnits?.filter(u=>u.spanRefs.includes(owner))||[];
        if(block.typographicSpanUnits?.length&&!units.length)issues.push({page,symbolId:e.symbolId,owner});
        if(units.length)unitOwners++;
        for(const unit of units){
          const key=`page_${page}_unit_${unit.id}__pt-BR`;
          expect(sourceElementIsReplaced(e,block,page,'pt-BR',new Map([[key,{spanKey:key,bbox:block.bbox,segments:[],managedSourceSymbols:[e.symbolId]}]]),null,null)).toBe(true);
        }
        const runs=block.lines!.flatMap(l=>sourceSpanRuns(l.spans,()=>({weight:400,style:'normal'})));
        expect(runs.some(r=>r.symbolId===e.symbolId),`p${page} ${e.symbolId} source model`).toBe(true);
        const text=editableTextForSegments(runs,'en');expect(segmentsFromEditableText(text,runs[0],'en',runs,'admin')).toEqual(runs);
      }
    }
    writeFileSync(join(root!,'canonical-contracts.json'),JSON.stringify({count,unitOwners,ownershipIssues:issues},null,2));
    expect(count).toBe(188);expect(issues).toEqual([]);
  });
  it('checks every new placement against canonical hashes, owner, codec, deletion mask and assets',()=>{
    const manifest=read(join(root!,'patches/patch-manifest.json'));let checked=0;const results:any[]=[];const candidateIds=new Set<string>();
    for(const plan of manifest.pages){
      const id=String(plan.page).padStart(3,'0'),canonical=resolve(`public/pages/page_${id}`),patch=join(root!,'patches/pages',`page_${id}`);
      expect(sha(join(canonical,`page_${id}_dom.json`))).toBe(plan.domSha256);
      if(plan.originalSidecarSha256)expect(sha(join(canonical,'inline_elements.json'))).toBe(plan.originalSidecarSha256);
      else expect(existsSync(join(canonical,'inline_elements.json')),`p${plan.page} null means original sidecar was absent`).toBe(false);
      expect(sha(join(patch,'inline_elements.json')),`p${plan.page} prepared sidecar hash`).toBe(plan.preparedSidecarSha256);
      const raw=read(join(canonical,`page_${id}_dom.json`)) as PageData;
      const elements=read(join(patch,'inline_elements.json')).elements as SourceInlineElement[];
      const blocks=attachSourceInlineElements(raw.blocks,elements);
      for(const e of elements.filter((e:any)=>e.provenance?.auditId==='full-symbol-integrity-2026-10-13')){
        const message=`p${plan.page} ${e.symbolId} ${e.anchor.lineId}:${e.anchor.spanIndex}`;
        const candidateId=e.provenance.candidateId as string;
        expect(candidateIds.has(candidateId),`${message} candidate is unique`).toBe(false);candidateIds.add(candidateId);
        expect(getSemanticSymbol(e.symbolId),message).toBeTruthy();
        const block=blocks.find(b=>b.id===e.anchor.blockId)!;expect(block,message).toBeTruthy();
        const ownerRef=e.anchor.ownerSpanRef||e.anchor;
        const ownerLine=block.lines!.find(line=>line.id===ownerRef.lineId);
        expect(ownerLine,`${message} editorial owner line`).toBeTruthy();
        expect(ownerLine!.spans[ownerRef.spanIndex],`${message} editorial owner span`).toBeTruthy();
        const runs=block.lines!.flatMap(l=>sourceSpanRuns(l.spans,()=>({weight:400,style:'normal'})));
        const found=runs.filter(r=>r.symbolId===e.symbolId&&r.symbolMetrics?.sourceAssetUrl===e.metrics?.sourceAssetUrl);
        expect(found,message).toHaveLength(1);
        for(const companion of e.sourceTextCompanions??[]){
          expect(runs.map(r=>r.text).join(''),message).toContain(companion.text.trim());
        }
        for(const language of ['en','pt-BR'] as const){
          const text=editableTextForSegments(runs,language);
          expect(segmentsFromEditableText(text,runs[0],language,runs,'admin'),message).toEqual(runs);
          const key=block.editorKey?`${block.editorKey}__${language}`:`page_${plan.page}_block_${e.anchor.blockIndex}`;
          expect(sourceElementIsReplaced(e,block,plan.page,language,new Map([[key,{spanKey:key,bbox:block.bbox,segments:[],managedSourceSymbols:elements.filter(x=>x.anchor.blockId===block.id).map(x=>x.symbolId)}]]),null,null),message).toBe(true);
          // Cancellation removes the saved override; the semantic source overlay
          // must return while the original PDF paint remains masked exactly once.
          expect(sourceElementIsReplaced(e,block,plan.page,language,new Map(),null,null),`${message} cancel restores source object`).toBe(true);
          // A legacy override that has not adopted this object must leave the
          // source paint visible; only an owned deletion masks it.
          expect(sourceElementIsReplaced(e,block,plan.page,language,new Map([[key,{spanKey:key,bbox:block.bbox,segments:[]}]]),null,null),`${message} legacy override preserves source`).toBe(false);
        }
        const asset=join(patch,e.metrics!.sourceAssetUrl!.split('/').at(-1)!);expect(existsSync(asset),message).toBe(true);
        expect(sha(asset),`${message} source asset hash`).toBe(e.provenance.assetSha256);
        const mask=join(patch,e.mask.url.split('/').at(-1)!);expect(existsSync(mask),message).toBe(true);
        expect(sha(mask),`${message} deletion mask hash`).toBe(e.provenance.maskSha256);
        // v2 cleanup masks cover source ink plus one native raster pixel. That
        // antialias allowance can extend 2.43 pt beyond the white die's glyph
        // bbox; the verified mask stays clipped to its silhouette and preserves
        // the neighboring orange die. Keep the wider bound scoped to v2 masks.
        const maskExpansionLimitPt=e.provenance?.maskHotfixV2?2.5:2.01;
        expect(e.mask.bbox[2]-e.mask.bbox[0]).toBeLessThanOrEqual(e.bbox[2]-e.bbox[0]+maskExpansionLimitPt);
        results.push({page:plan.page,...(e as any).provenance,ownerContract:'editorial owner span present',identity:'semantic registry entry exists',
          sourceRunCount:found.length,codec:'EN/PT exact roundtrip',maskContract:'hash verified; deletion and cancel code paths checked',
          duplicateContract:'one source run per candidate ID',legacyOverrideContract:'source preserved until adoption'});checked++;
      }
    }
    expect(checked).toBe(manifest.placementCount);
    expect(candidateIds.size).toBe(manifest.placementCount);
    writeFileSync(join(root!,'prepared-contracts.json'),JSON.stringify({checked,candidateIdCount:candidateIds.size,
      functionalContractScope:'static React data and source-inline lifecycle contracts; does not claim one browser/PDF visual proof per placement',results},null,2));
  });
});
