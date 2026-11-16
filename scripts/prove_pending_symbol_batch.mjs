/** UI-only batch proof of the existing 95 pending inline placements.
 * Uses the isolated symbol lab; all edits remain in React memory and all API
 * requests are blocked. No candidate discovery or canonical write occurs.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { deriveSourceLineHeight } from './proof-source-line-height.mjs';

const out=resolve('output/proofs/symbol-activation-2026-10-13');
const batch=resolve(process.env.MIDDARA_SYMBOL_BATCH_DIR||join(out,'batch-95'));
const captures=join(batch,'captures');
const snapshots=join(batch,'snapshots');
await mkdir(captures,{recursive:true});await mkdir(snapshots,{recursive:true});
const sourcePdf=resolve('../Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const status=JSON.parse(await readFile(join(out,'activation-status.json'),'utf8'));
const patchManifest=JSON.parse(await readFile(join(out,'patches/patch-manifest.json'),'utf8'));
const pending=new Set(status.pendingCandidateIds);
const requestedCandidateIds=process.env.MIDDARA_SYMBOL_CANDIDATE_IDS
  ? new Set(process.env.MIDDARA_SYMBOL_CANDIDATE_IDS.split(',').map(id=>id.trim()).filter(Boolean))
  : null;
const requestedPages=process.argv[2]?new Set(process.argv[2].split(',').map(Number)):null;
const reps=new Map();
const pages=new Map();
for(const plan of patchManifest.pages){
  const id=String(plan.page).padStart(3,'0');
  const side=JSON.parse(await readFile(join(out,'patches/pages',`page_${id}`,'inline_elements.json'),'utf8'));
  const dom=JSON.parse(await readFile(`apps/web/public/pages/page_${id}/page_${id}_dom.json`,'utf8'));
  for(const element of side.elements){
    const cid=element.provenance?.candidateId;
    const selected=requestedCandidateIds?requestedCandidateIds.has(cid):pending.has(cid);
    if(!selected||(requestedPages&&!requestedPages.has(plan.page)))continue;
    const blockIndex=element.anchor.blockIndex;
    const groupKey=`${plan.page}:${blockIndex}`;
    if(!pages.has(groupKey))pages.set(groupKey,{page:plan.page,block:blockIndex,dom,side,candidates:[]});
    pages.get(groupKey).candidates.push({candidateId:cid,page:plan.page,block:blockIndex,symbolId:element.symbolId,
      bbox:element.bbox,maskBbox:element.mask?.bbox,element});
    if(!reps.has(element.symbolId))reps.set(element.symbolId,cid);
  }
}
const scopedPendingCount=[...pages.values()].reduce((n,g)=>n+g.candidates.length,0);
if(!requestedPages&&!requestedCandidateIds&&scopedPendingCount!==pending.size)throw new Error('Prepared sidecars do not cover all pending IDs');
if(requestedCandidateIds&&scopedPendingCount!==requestedCandidateIds.size)
  throw new Error(`Prepared sidecars cover ${scopedPendingCount} of ${requestedCandidateIds.size} explicitly requested IDs`);
const groups=[...pages.values()].sort((a,b)=>a.page-b.page||a.block-b.block);
const pageIds=[...new Set(groups.map(g=>g.page))].sort((a,b)=>a-b);
const result={schemaVersion:1,status:'in-progress',scope:requestedCandidateIds?'explicit existing candidate IDs; no rediscovery':'closed 95 pending IDs only; no rediscovery',pendingCount:scopedPendingCount,
  ownerBlockCount:groups.length,pageCount:pageIds.length,apiRequests:0,sourcePdfSha256:patchManifest.sourcePdfSha256,
  captureStyle:'hide editor/selection chrome only; actual PageRenderer raster retained',pages:[],groups:[],placements:[],representativeSnapshotIds:[...reps.values()]};
const noChrome='.rse-overlay,.rse-resize-handle{display:none!important}.block-selected,.span-selected{outline:none!important;background-color:transparent!important;box-shadow:none!important}.block-editable:hover,.span-editable:hover,.block-container:hover{outline:none!important;background-color:transparent!important;box-shadow:none!important}';
const sourceSnapshotByCandidate=new Map();
const snapshotTranslation=(key,segments,managedSourceSymbols,lineHeight)=>{
  if(!(lineHeight>0))throw new Error(`Snapshot ${key} has no PDF-derived source leading`);
  return {
    // Keep the exact key emitted by the editor session. Plain block keys stay
    // plain; language-qualified typographic-unit keys retain their one suffix.
    spanKey:key,language:'en',
    data:{schemaVersion:2,segments:JSON.parse(JSON.stringify(segments).replaceAll('http://127.0.0.1:8091/patches','')),
      textAlign:'left',lineHeight,lineHeightMode:'custom',managedSourceSymbols},
  };
};
async function snapshotAssets(candidateId,pageNo){
  const snapshotDir=join(snapshots,candidateId),id=String(pageNo).padStart(3,'0'),assets=join(snapshotDir,'pages',`page_${id}`);
  await mkdir(assets,{recursive:true});
  await cp(resolve(`apps/web/public/pages/page_${id}`),assets,{recursive:true});
  await cp(join(out,'patches/pages',`page_${id}`),assets,{recursive:true});
  const boxes=spawnSync('python',['scripts/snapshot_export_source_boxes.py',sourcePdf,String(pageNo)],{encoding:'utf8'});
  if(boxes.status)throw new Error(boxes.stderr);
  return {snapshotDir,sourcePageBoxes:JSON.parse(boxes.stdout)};
}
async function writeSnapshot(candidateId,pageNo,translations,fileName){
  const {snapshotDir,sourcePageBoxes}=await snapshotAssets(candidateId,pageNo);
  const snapshot=join(snapshotDir,fileName);
  await writeFile(snapshot,JSON.stringify({translations,layoutFrames:[],symbolAliasSettings:[],assetPages:[pageNo],sourcePageBoxes,verifyRenderedSnapshot:true},null,2));
  return snapshot;
}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const context=await browser.newContext({viewport:{width:2000,height:1800},deviceScaleFactor:2});
  let apiRequests=0;
  await context.route('**/api/**',route=>{apiRequests++;return route.abort('blockedbyclient')});
  await context.route('http://127.0.0.1:8091/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/important-proposals.json')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const path=join(out,relative);
    try{const body=await readFile(path);const contentType=path.endsWith('.json')?'application/json':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/octet-stream';return route.fulfill({status:200,contentType,body});}
    catch{return route.fulfill({status:404,body:'not staged'});}
  });
  const page=await context.newPage();
  const session=()=>page.getByTestId('lab-session-data').evaluate(el=>JSON.parse(el.textContent));
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function ready(pageNo,patched){
    await page.goto(`http://localhost:8080/symbol-integrity-lab.html?page=${pageNo}&patch=${patched?1:0}`);
    await page.waitForFunction(()=>{const p=document.querySelector('.page-container');const bg=p?.querySelector('img');return !!p&&!!bg&&bg.complete&&bg.naturalWidth>0;});
    await page.evaluate(()=>document.fonts.ready);await settle();
    await page.waitForFunction(()=>[...document.querySelectorAll('.page-container img')].every(i=>i.complete&&i.naturalWidth>0));
  }
  async function captureCandidate(candidate,path,pad=5){
    let box=await page.locator('.page-container').boundingBox();
    if(!box)throw new Error('PageRenderer container is missing');
    const scale=box.width/candidate.pageWidth;
    const viewport=page.viewportSize();
    await page.locator('.page-stage').evaluate((stage,point)=>{
      stage.scrollLeft=Math.max(0,point.x-stage.clientWidth*.4);
      stage.scrollTop=Math.max(0,point.y-stage.clientHeight*.4);
    },{x:((candidate.bbox[0]+candidate.bbox[2])/2)*scale,y:((candidate.bbox[1]+candidate.bbox[3])/2)*scale});
    await settle();
    box=await page.locator('.page-container').boundingBox();
    if(!box)throw new Error('PageRenderer container is missing after scroll');
    const x=Math.max(0,box.x+(candidate.bbox[0]-pad)*scale);
    const y=Math.max(0,box.y+(candidate.bbox[1]-pad)*scale);
    const right=Math.min(viewport.width,box.x+(candidate.bbox[2]+pad)*scale);
    const bottom=Math.min(viewport.height,box.y+(candidate.bbox[3]+pad)*scale);
    const clip={x,y,width:right-x,height:bottom-y};
    if(!(clip.width>0&&clip.height>0))throw new Error(`Invalid screenshot clip ${JSON.stringify({candidateId:candidate.candidateId,box,bbox:candidate.bbox,scale,clip})}`);
    try{await page.screenshot({path,clip,style:noChrome,animations:'disabled'});}
    catch(error){throw new Error(`Screenshot clip failed ${JSON.stringify({candidateId:candidate.candidateId,box,bbox:candidate.bbox,scale,clip})}: ${String(error)}`);}
    return {pixelCrop:[Math.round(clip.width*2),Math.round(clip.height*2)],screenScale:scale,
      pageClipPt:[(x-box.x)/scale,(y-box.y)/scale,(right-box.x)/scale,(bottom-box.y)/scale]};
  }
  for(const pageNo of pageIds){
    const candidates=groups.filter(g=>g.page===pageNo).flatMap(g=>g.candidates);
    const pdir=join(captures,`p${String(pageNo).padStart(3,'0')}`);await mkdir(pdir,{recursive:true});
    const raw=JSON.parse(await readFile(`apps/web/public/pages/page_${String(pageNo).padStart(3,'0')}/page_${String(pageNo).padStart(3,'0')}_dom.json`,'utf8'));
    for(const patched of [false,true]){
      await ready(pageNo,patched);
      for(const c of candidates){
        const dest=join(pdir,`${c.candidateId}-${patched?'reinserted':'viewer-source'}.png`);
        const meta=await captureCandidate({...c,pageWidth:raw.width},dest);
        c[patched?'reinsertedCapture':'viewerSourceCapture']=dest;c[patched?'reinsertedCaptureMeta':'viewerSourceCaptureMeta']=meta;
      }
    }
    result.pages.push({page:pageNo,pendingIds:candidates.map(c=>c.candidateId),sourceCaptureCount:candidates.length,reinsertedCaptureCount:candidates.length});
  }
  for(const group of groups){
    const pageNo=group.page,id=String(pageNo).padStart(3,'0');
    const key=`page_${pageNo}_block_${group.block}`;
    const block=group.dom.blocks[group.block];
    const ownerElements=group.side.elements.filter(e=>e.anchor?.blockId===block.id);
    const sourceLineOrder=new Map((block.lines??[]).map((line,index)=>[line.id,index]));
    const sideOrder=side=>side==='before'?0:side==='after'?2:1;
    const sortedElements=ownerElements.slice().sort((a,b)=>
      (sourceLineOrder.get(a.anchor.lineId)??Number.MAX_SAFE_INTEGER)-(sourceLineOrder.get(b.anchor.lineId)??Number.MAX_SAFE_INTEGER)
      ||(a.anchor.spanIndex??-1)-(b.anchor.spanIndex??-1)
      ||sideOrder(a.anchor.side)-sideOrder(b.anchor.side)
      ||a.bbox[0]-b.bbox[0]);
    const groupOut=join(captures,`p${id}`,`block-${group.block}`);await mkdir(groupOut,{recursive:true});
    await ready(pageNo,true);
    await page.getByLabel('Idioma da prova').selectOption('en');
    await page.getByLabel('Bloco completo').selectOption(block.editorKey?`${block.editorKey}__en`:key);
    await page.getByRole('button',{name:'📝 Edit Text',exact:true}).click();
    let textarea=page.locator('textarea');
    const original=await textarea.inputValue();
    await textarea.fill(original+' ');
    await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records.length>0);
    const initialSourceRecord=(await session()).records[0];
    if(!initialSourceRecord)throw new Error('The selected EN block did not create an isolated source record');
    let sourceRuns=initialSourceRecord.segments;
    const sourceRecordKey=initialSourceRecord.key;
    const sourceSymbols=sourceRuns.filter(s=>s.symbolId).map(s=>s.symbolId);
    const elementSymbols=sortedElements.map(e=>e.symbolId);
    const elementsBySymbol=new Map();for(let i=0;i<sortedElements.length;i++){const e=sortedElements[i];const a=elementsBySymbol.get(e.symbolId)||[];a.push(e);elementsBySymbol.set(e.symbolId,a);}
    const symbolRuns=sourceRuns.filter(s=>s.symbolId);
    const runsBySymbol=new Map();symbolRuns.forEach((s,i)=>{const a=runsBySymbol.get(s.symbolId)||[];a.push(i);runsBySymbol.set(s.symbolId,a);});
    const positions=new Map();
    for(const [symbolId,elements] of elementsBySymbol){const runs=runsBySymbol.get(symbolId)||[];elements.forEach((e,i)=>positions.set(e.provenance?.candidateId,runs[i]));}
    const tokenMatches=[...original.matchAll(/\[\[[^\]]+\]\]/gu)];
    await textarea.fill('');
    await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records[0]?.segments.every(s=>!s.text.trim()&&!s.symbolId));
    await settle();
    const groupResult={page:pageNo,block:group.block,ownerBlockId:block.id,candidateIds:group.candidates.map(c=>c.candidateId),
      symbolIds:group.candidates.map(c=>c.symbolId),symbolCount:sourceSymbols.length,preparedOwnerElementCount:sortedElements.length,
      symbolMappingExact:sourceSymbols.length===sortedElements.length&&elementSymbols.every((s,i)=>s===sourceSymbols[i])&&tokenMatches.length===sourceSymbols.length,
      emptyCaptureCount:0,movedProofCount:0,sameSlotReinsertCount:0,interactiveProofCount:0,errors:[]};
    const lineHeightDerivation=deriveSourceLineHeight(block);
    const sourceLineHeight=lineHeightDerivation.lineHeight;
    groupResult.sourceLineHeightDerivation=lineHeightDerivation;
    const sourceSegments=JSON.parse(JSON.stringify(sourceRuns));
    const trailingText=[...sourceSegments].reverse().find(segment=>!segment.symbolId&&typeof segment.text==='string');
    if(trailingText?.text.endsWith(' '))trailingText.text=trailingText.text.slice(0,-1);
    const sourceRecords=(await session()).records;
    for(const c of group.candidates.filter(candidate=>reps.get(candidate.symbolId)===candidate.candidateId)){
      const translations=sourceRecords.map(({key,managedSourceSymbols})=>
        snapshotTranslation(key,sourceSegments,managedSourceSymbols,sourceLineHeight));
      const snapshot=await writeSnapshot(c.candidateId,pageNo,translations,'snapshot.json');
      sourceSnapshotByCandidate.set(c.candidateId,snapshot);
      c.sourceLineHeight=sourceLineHeight;
    }
    for(const c of group.candidates){
      const dest=join(groupOut,`${c.candidateId}-empty.png`);const meta=await captureCandidate({...c,pageWidth:rawWidth(group.dom)},dest);
      c.emptyCapture=dest;c.emptyCaptureMeta=meta;groupResult.emptyCaptureCount++;
    }
    // Reload the isolated page after the empty-block capture so each edit
    // trial starts from an unmodified source state and a fresh editor model.
    await ready(pageNo,true);
    await page.getByLabel('Idioma da prova').selectOption('en');
    await page.getByLabel('Bloco completo').selectOption(block.editorKey?`${block.editorKey}__en`:key);
    for(const c of group.candidates){
      const targetIndex=positions.get(c.candidateId);
      const placementResult={candidateId:c.candidateId,page:pageNo,block:group.block,symbolId:c.symbolId,
        bbox:c.bbox,maskBbox:c.maskBbox,viewerSourceCapture:c.viewerSourceCapture,reinsertedCapture:c.reinsertedCapture,
        viewerSourceCaptureMeta:c.viewerSourceCaptureMeta,reinsertedCaptureMeta:c.reinsertedCaptureMeta,
        emptyCapture:c.emptyCapture,emptyCaptureMeta:c.emptyCaptureMeta,uiState:'inconclusive',moveContract:'not-run',
        sourceRecordKey,sourceLineHeightDerivation:lineHeightDerivation,emptyPdfSnapshot:null,
        cancelCheck:'not-run',cancelCapture:null,cancelCaptureMeta:null,cancelRecordsAfter:null,cancelSourceTextRestored:false,
        movedCapture:null,movedSlotCapture:null,movedPageBboxPt:null,pdfSnapshot:sourceSnapshotByCandidate.get(c.candidateId)||null,
        movedPdfSnapshot:null,sourceLineHeight:c.sourceLineHeight??sourceLineHeight,error:null};
      try{
        if(targetIndex===undefined||tokenMatches.length!==sourceSymbols.length||sourceSymbols.length!==sortedElements.length)
          throw new Error('Owner block symbol/token order could not be mapped one-to-one');
        await page.getByRole('button',{name:'📝 Edit Text',exact:true}).click();
        textarea=page.locator('textarea:visible').first();
        await textarea.waitFor({state:'visible',timeout:5000}).catch(async()=>{
          const debug={candidateId:c.candidateId,block:group.block,buttons:await page.locator('button').allTextContents(),
            textareas:await page.locator('textarea').evaluateAll(es=>es.map(e=>({value:e.value,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,outer:e.outerHTML}))),
            selectedBlock:await page.locator('.block-selected,.span-selected').count(),pageText:(await page.locator('.page-container').innerText()).slice(0,1000)};
          await writeFile(join(groupOut,`${c.candidateId}-editor-debug.json`),JSON.stringify(debug,null,2));
          await page.screenshot({path:join(groupOut,`${c.candidateId}-editor-debug.png`),style:noChrome});
          throw new Error(`Edit Text did not expose textarea: ${JSON.stringify(debug)}`);
        });
        const currentText=await textarea.inputValue();
        await textarea.fill(currentText+' ');await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records.length>0);
        sourceRuns=(await session()).records[0].segments;
        const currentSymbolRuns=sourceRuns.filter(s=>s.symbolId);
        const match=[...currentText.matchAll(/\[\[[^\]]+\]\]/gu)][targetIndex];
        if(!match)throw new Error(`No source alias token for symbol run ${targetIndex}`);
        const remaining=currentText.slice(0,match.index)+currentText.slice(match.index+match[0].length);
        const keys=runs=>runs.filter(s=>s.symbolId).map(s=>`${s.symbolId}:${s.symbolMetrics?.sourceAppearanceKey??''}`);
        const sourceAssetName=String(c.element.metrics?.sourceAssetUrl??'').split('/').at(-1);
        const sourceAsset=sourceAssetName
          ?page.locator(`.page-container img.inline-semantic-symbol[src$="${sourceAssetName}"]`)
          :null;
        const sameSlotCase=tokenMatches.length===1&&targetIndex===0;
        if(sameSlotCase){
          // This is an interactive remove/reinsert at the same source offset;
          // it is deliberately not counted as a geometric move.
          await textarea.fill(remaining);
          await page.getByRole('button',{name:'Confirm',exact:true}).click();await settle();
          let activeRecord=(await session()).records.find(record=>record.key===sourceRecordKey);
          if(!activeRecord)activeRecord=(await session()).records[0];
          if(!activeRecord)throw new Error('Removing the sole source token did not produce an EN override');
          assert.equal(activeRecord.segments.filter(segment=>segment.symbolId).length,0,
            'Removing the sole alias must leave zero semantic symbols in the editor');
          await page.getByRole('button',{name:'Aplicar à prova',exact:true}).click();await settle();
          const emptyProofRecord=(await session()).records.find(record=>record.key===sourceRecordKey)
            ??(await session()).records[0];
          if(!emptyProofRecord)throw new Error('The applied empty edit has no isolated EN snapshot record');
          assert.equal(emptyProofRecord.segments.filter(segment=>segment.symbolId).length,0,
            'The empty PDF snapshot must contain zero target symbols');
          assert.ok(emptyProofRecord.managedSourceSymbols?.includes(c.symbolId),
            'The empty PDF snapshot must keep the removed source symbol managed');
          placementResult.emptyOverrideSymbolCount=0;
          placementResult.emptyManagedSourceSymbols=emptyProofRecord.managedSourceSymbols;
          placementResult.emptyPdfSnapshot=await writeSnapshot(c.candidateId,pageNo,[
            snapshotTranslation(emptyProofRecord.key,emptyProofRecord.segments,
              emptyProofRecord.managedSourceSymbols,sourceLineHeight),
          ],'empty-test-snapshot.json');
          placementResult.sameSlotRemovalCapture=join(groupOut,`${c.candidateId}-removed.png`);
          await captureCandidate({...c,pageWidth:rawWidth(group.dom)},placementResult.sameSlotRemovalCapture);
          if(!sourceAsset||await sourceAsset.count()!==0)
            throw new Error('The removed source symbol remains visible in the Viewer');

          await page.getByRole('button',{name:'📝 Edit Text',exact:true}).click();
          textarea=page.locator('textarea:visible').first();
          await textarea.waitFor({state:'visible',timeout:5000});
          const removedText=await textarea.inputValue();
          const insertAt=Math.min(match.index,removedText.length);
          const reinsertedText=removedText.slice(0,insertAt)+match[0]+removedText.slice(insertAt);
          await textarea.fill(reinsertedText);
          await page.getByRole('button',{name:'Confirm',exact:true}).click();await settle();
          let reinsertRecord=(await session()).records.find(record=>record.key===sourceRecordKey);
          if(!reinsertRecord)reinsertRecord=(await session()).records[0];
          if(!reinsertRecord)throw new Error('Reinserting the alias at its source offset did not produce an EN override');
          const reinsertedRuns=reinsertRecord.segments;
          assert.deepEqual(reinsertedRuns.filter(segment=>segment.symbolId).map(segment=>segment.symbolId),
            currentSymbolRuns.map(segment=>segment.symbolId),'Same-slot reinsertion must restore one semantic symbol');
          assert.deepEqual(keys(reinsertedRuns),keys(currentSymbolRuns),
            'Same-slot reinsertion must preserve the source paint identity');

          let undoSteps=0,undidReinsertion=false;
          while(undoSteps<4){
            const undo=page.getByRole('button',{name:'Undo',exact:true});
            if(!await undo.count()||!await undo.isEnabled())break;
            await undo.click();await settle();undoSteps++;
            const records=(await session()).records;
            const record=records.find(item=>item.key===sourceRecordKey)??records[0];
            if(!record||record.segments.filter(segment=>segment.symbolId).length===0){undidReinsertion=true;break;}
          }
          assert.ok(undidReinsertion,'Undo removes the reinserted source symbol');
          for(let i=0;i<undoSteps;i++){
            const redo=page.getByRole('button',{name:'Redo',exact:true});
            if(!await redo.count()||!await redo.isEnabled())throw new Error('Redo became unavailable before restoring the reinsertion');
            await redo.click();await settle();
          }
          let redoneRecord=(await session()).records.find(record=>record.key===sourceRecordKey);
          if(!redoneRecord)redoneRecord=(await session()).records[0];
          assert.ok(redoneRecord,'Redo must restore the isolated EN override');
          assert.deepEqual(redoneRecord.segments,reinsertedRuns,'Redo restores the exact same-slot reinserted segments');
          await page.getByRole('button',{name:'Aplicar à prova',exact:true}).click();await settle();
          placementResult.sameSlotReinsertedCapture=join(groupOut,`${c.candidateId}-same-slot-reinserted.png`);
          await captureCandidate({...c,pageWidth:rawWidth(group.dom)},placementResult.sameSlotReinsertedCapture);
          if(!sourceAsset||await sourceAsset.count()!==1)
            throw new Error('Same-slot reinsertion must render exactly one source asset in the Viewer');
          placementResult.uiState='passed';
          placementResult.moveContract='same-slot-reinsertion-passed';
          placementResult.reinsertedSymbolCount=1;
          placementResult.duplicateSymbolCount=0;
          groupResult.sameSlotReinsertCount++;
          groupResult.interactiveProofCount++;
        }else{
          const moveToStart=targetIndex===tokenMatches.length-1;
          const movedText=moveToStart?`${match[0]} ${remaining.trimStart()}`:`${remaining.trimEnd()} ${match[0]}`;
          await textarea.fill(movedText);
          await page.getByRole('button',{name:'Confirm',exact:true}).click();await settle();
          const movedRecord=(await session()).records.find(record=>record.key===sourceRecordKey)
            ??(await session()).records[0];
          if(!movedRecord)throw new Error('Moved edit did not produce an EN override');
          const movedRuns=movedRecord.segments;
          const beforeIds=currentSymbolRuns.map(s=>s.symbolId);const expectedIds=beforeIds.slice();const [movedId]=expectedIds.splice(targetIndex,1);moveToStart?expectedIds.unshift(movedId):expectedIds.push(movedId);
          assert.deepEqual(movedRuns.filter(s=>s.symbolId).map(s=>s.symbolId),expectedIds,'Moved edit must preserve all semantic symbols');
          const expectedKeys=keys(currentSymbolRuns);const movedKey=expectedKeys.splice(targetIndex,1)[0];moveToStart?expectedKeys.unshift(movedKey):expectedKeys.push(movedKey);
          assert.deepEqual(keys(movedRuns),expectedKeys,'Moved edit must preserve each source paint identity');
          let historySteps=0,restoredSource=false;
          const sourceKeys=keys(sourceRuns);
          while(historySteps<4){
            const undo=page.getByRole('button',{name:'Undo',exact:true});
            if(!await undo.count()||!await undo.isEnabled())break;
            await undo.click();await settle();historySteps++;
            const records=(await session()).records;
            if(!records.length||JSON.stringify(keys(records[0].segments))===JSON.stringify(sourceKeys)){restoredSource=true;break;}
          }
          assert.ok(restoredSource,'Undo restores the source segment order and paint identity');
          for(let i=0;i<historySteps;i++){await page.getByRole('button',{name:'Redo',exact:true}).click();await settle();}
          const redoRecord=(await session()).records.find(record=>record.key===sourceRecordKey)
            ??(await session()).records[0];
          assert.deepEqual(redoRecord?.segments,movedRuns,'Redo restores the exact moved segments');
          await page.getByRole('button',{name:'Aplicar à prova',exact:true}).click();await settle();
          placementResult.movedSlotCapture=join(groupOut,`${c.candidateId}-moved-slot.png`);
          await captureCandidate({...c,pageWidth:rawWidth(group.dom)},placementResult.movedSlotCapture);
          const movedSymbol=sourceAsset?.first()??null;
          if(!movedSymbol||await movedSymbol.count()!==1)throw new Error('Moved source asset cannot be located uniquely in the Viewer');
          const symbolBox=await movedSymbol.boundingBox();const pageBox=await page.locator('.page-container').boundingBox();
          if(!symbolBox||!pageBox)throw new Error('Moved source symbol has no visible Viewer geometry');
          const pageScale=pageBox.width/rawWidth(group.dom);
          const movedPageBboxPt=[(symbolBox.x-pageBox.x)/pageScale,(symbolBox.y-pageBox.y)/pageScale,
            (symbolBox.x+symbolBox.width-pageBox.x)/pageScale,(symbolBox.y+symbolBox.height-pageBox.y)/pageScale];
          const originalCenter=[(c.bbox[0]+c.bbox[2])/2,(c.bbox[1]+c.bbox[3])/2];
          const movedCenter=[(movedPageBboxPt[0]+movedPageBboxPt[2])/2,(movedPageBboxPt[1]+movedPageBboxPt[3])/2];
          if(Math.hypot(movedCenter[0]-originalCenter[0],movedCenter[1]-originalCenter[1])<.5)
            throw new Error('Moved symbol did not change its page position');
          placementResult.movedCapture=join(groupOut,`${c.candidateId}-moved-symbol.png`);
          placementResult.movedCaptureMeta=await captureCandidate({...c,bbox:movedPageBboxPt,pageWidth:rawWidth(group.dom)},placementResult.movedCapture,12);
          placementResult.uiState='passed';placementResult.moveContract='passed';
          placementResult.movedPageBboxPt=movedPageBboxPt;
          if(reps.get(c.symbolId)===c.candidateId){
            const records=(await session()).records;
            const translations=records.map(({key,segments,managedSourceSymbols})=>
              snapshotTranslation(key,segments,managedSourceSymbols,sourceLineHeight));
            placementResult.movedPdfSnapshot=await writeSnapshot(c.candidateId,pageNo,translations,'moved-test-snapshot.json');
          }
          groupResult.movedProofCount++;
          groupResult.interactiveProofCount++;
        }
        await page.getByRole('button',{name:'Cancelar toda a prova',exact:true}).click();
        await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records.length===0);
        const cancelled=await session();
        assert.equal(cancelled.records.length,0,'Cancel must remove every in-memory EN override');
        assert.equal(cancelled.language,'en','Cancel must leave the proof language in EN');
        const normalizeVisibleText=value=>value.replace(/\s+/gu,' ').replace(/\s+([,.:;!?])/gu,'$1').trim();
        const expectedSourceText=normalizeVisibleText(original.replace(/\[\[[^\]]+\]\]/gu,' '));
        const expectedSnippet=expectedSourceText.split(' ').filter(Boolean).slice(0,3).join(' ');
        const restoredViewerText=normalizeVisibleText(await page.locator('.page-container').innerText());
        assert.ok(expectedSnippet&&restoredViewerText.includes(expectedSnippet),'Cancel must restore visible source EN text');
        placementResult.cancelCapture=join(groupOut,`${c.candidateId}-cancelled.png`);
        placementResult.cancelCaptureMeta=await captureCandidate({...c,pageWidth:rawWidth(group.dom)},placementResult.cancelCapture);
        placementResult.cancelRecordsAfter=0;
        placementResult.cancelSourceTextRestored=true;
        placementResult.cancelCheck='passed';
      }catch(error){placementResult.error=String(error?.stack||error);groupResult.errors.push({candidateId:c.candidateId,error:placementResult.error});}
      result.placements.push(placementResult);
      await page.goto(`http://localhost:8080/symbol-integrity-lab.html?page=${pageNo}&patch=1`);
      await page.waitForFunction(()=>document.querySelector('.page-container img')?.naturalWidth>0);await page.evaluate(()=>document.fonts.ready);await settle();
      await page.getByLabel('Idioma da prova').selectOption('en');
      await page.getByLabel('Bloco completo').selectOption(block.editorKey?`${block.editorKey}__en`:key);
    }
    result.groups.push(groupResult);
    await writeFile(join(batch,'batch-results.json'),JSON.stringify({...result,status:'in-progress',apiRequests},null,2));
    console.log(JSON.stringify({page:pageNo,block:group.block,placements:groupResult.candidateIds.length,
      moved:groupResult.movedProofCount,sameSlotReinserted:groupResult.sameSlotReinsertCount,
      interactive:groupResult.interactiveProofCount,errors:groupResult.errors.length}));
  }
  result.apiRequests=apiRequests;
  assert.equal(apiRequests,0,'The isolated proof must not request Payload or write to the API');
  result.status='completed';
  await writeFile(join(batch,'batch-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({pending:result.placements.length,ownerBlocks:result.groups.length,pages:result.pages.length,representativeSnapshots:result.placements.filter(p=>p.pdfSnapshot).length,apiRequests}));
}finally{await browser.close();}

function rawWidth(dom){return dom.width;}
