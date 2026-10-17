/** Deterministic, isolated browser proofs requested by the source-symbol audit.
 * A new headless context, no access to the user's tabs, and every API request
 * is blocked. Only experimental memory is edited. Canonical files are read.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { deriveSourceLineHeight } from './proof-source-line-height.mjs';

const out=resolve(process.env.MIDDARA_SYMBOL_AUDIT_DIR||'output/proofs/full-symbol-integrity-2026-10-13');
const proofRoot=join(out,'viewer-editor');await mkdir(proofRoot,{recursive:true});
const sourcePdf=resolve('../Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf');
const cases=[{page:52,block:6},{page:83,block:1},{page:84,block:30},{page:85,block:1},{page:92,block:5},
  {page:13,block:21},{page:14,block:2},{page:38,block:10},{page:96,block:2},{page:100,block:16},
  {page:45,block:null},{page:67,block:null}].filter(c=>!process.argv[2]||process.argv[2].split(',').map(Number).includes(c.page));
const manifest=JSON.parse(await readFile(join(out,'patches/patch-manifest.json'),'utf8'));
const prior=process.argv[2]?JSON.parse(await readFile(join(proofRoot,'editor-results.json'),'utf8').catch(()=>'{"exports":[],"results":[]}')):{exports:[],results:[]};
const exports=prior.exports.filter(e=>!cases.some(c=>c.page===e.page));
const results=prior.results.filter(e=>!cases.some(c=>c.page===e.page));
const snapshotSpanKey=(key,language)=>language==='en'
  ? key.replace(/__en$/u,'')
  : key.endsWith(`__${language}`)?key:`${key}__${language}`;
const snapshotTranslations=(records,language,lineHeight,segmentsByKey)=>records.map(({key,segments,managedSourceSymbols})=>({
  spanKey:snapshotSpanKey(key,language),language,
  data:{schemaVersion:2,segments:JSON.parse(JSON.stringify(segmentsByKey?.get(key)??segments)
    .replaceAll('http://127.0.0.1:8091/patches','')),textAlign:'left',lineHeight,lineHeightMode:'custom',managedSourceSymbols},
}));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const context=await browser.newContext({viewport:{width:2000,height:1800},deviceScaleFactor:2});
  let apiRequests=0;await context.route('**/api/**',route=>{apiRequests++;return route.abort('blockedbyclient')});
  await context.route('http://127.0.0.1:8091/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/important-proposals.json')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file=join(out,relative);
    try{
      const body=await readFile(file);
      const contentType=file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'application/octet-stream';
      return route.fulfill({status:200,contentType,body});
    }catch{return route.fulfill({status:404,body:'not staged'});}
  });
  const page=await context.newPage();
  const session=()=>page.getByTestId('lab-session-data').evaluate(el=>JSON.parse(el.textContent));
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  for(const c of cases){
    const id=String(c.page).padStart(3,'0'),dir=join(proofRoot,`p${id}`);await mkdir(dir,{recursive:true});
    const raw=JSON.parse(await readFile(`apps/web/public/pages/page_${id}/page_${id}_dom.json`,'utf8'));
    const plan=manifest.pages.find(p=>p.page===c.page);
    const sidecar=JSON.parse(await readFile(plan?join(out,'patches/pages',`page_${id}`,'inline_elements.json'):`apps/web/public/pages/page_${id}/inline_elements.json`,'utf8').catch(()=>'{"elements":[]}'));
    if(c.block===null)c.block=sidecar.elements.find(e=>e.provenance)?.anchor.blockIndex??0;
    const key=raw.blocks[c.block].editorKey||`page_${c.page}_block_${c.block}`;
    const block=raw.blocks[c.block];
    const sourceElements=sidecar.elements.filter(e=>e.anchor.blockId===block.id);
    const local={page:c.page,block:c.block,key,sourceElements:sourceElements.map(e=>({id:e.symbolId,bbox:e.bbox})),languages:[]};
    for(const patched of [false,true]){
      await page.goto(`http://localhost:8080/symbol-integrity-lab.html?page=${c.page}&patch=${patched?1:0}`);
      await page.waitForFunction(()=>document.querySelector('.page-container img')?.naturalWidth>0);
      await page.evaluate(()=>document.fonts.ready);await settle();
      await page.locator('.page-container').screenshot({path:join(dir,patched?'source-patched.png':'source-before.png'),scale:'css'});
      for(const language of patched?['en','pt-BR']:['en']){
        await page.getByLabel('Idioma da prova').selectOption(language);
        await page.getByLabel('Bloco completo').selectOption(block.editorKey?`${key}__${language}`:key);
        await page.getByRole('button',{name:'📝 Edit Text',exact:true}).click();
        const textarea=page.locator('textarea');const original=await textarea.inputValue();
        // An unchanged editor intentionally emits no draft. A trailing space
        // exposes the styled model; cancellation below restores the source.
        await textarea.fill(original+' ');await settle();
        // The initial editor preview callback is asynchronous. Wait for the
        // actual model, not the presence of the textarea alone.
        await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records.length>0);
        const originalRuns=(await session()).records[0].segments;
        const symbols=originalRuns.filter(r=>r.symbolId).map(r=>r.symbolId);
        const sourceLineHeight=block.lines?.length>1?deriveSourceLineHeight(block).lineHeight:1;
        let sourceSnapshot=null,sourceSnapshotData=null;
        if(patched){
          const records=(await session()).records;
          const sourceSegments=JSON.parse(JSON.stringify(originalRuns));
          const trailingText=[...sourceSegments].reverse().find(segment=>!segment.symbolId&&typeof segment.text==='string');
          if(trailingText?.text.endsWith(' '))trailingText.text=trailingText.text.slice(0,-1);
          const sourceSegmentsByKey=new Map(records.map(record=>[record.key,sourceSegments]));
          const translations=snapshotTranslations(records,language,sourceLineHeight,sourceSegmentsByKey);
          const snapshotDir=join(dir,`snapshot-${language}`),assets=join(snapshotDir,'pages',`page_${id}`);
          await mkdir(assets,{recursive:true});
          await cp(resolve(`apps/web/public/pages/page_${id}`),assets,{recursive:true});
          if(plan)await cp(join(out,'patches/pages',`page_${id}`),assets,{recursive:true});
          const boxes=spawnSync('python',['scripts/snapshot_export_source_boxes.py',sourcePdf,String(c.page)],{encoding:'utf8'});
          if(boxes.status)throw new Error(boxes.stderr);
          sourceSnapshotData={translations,layoutFrames:[],symbolAliasSettings:[],assetPages:[c.page],
            sourcePageBoxes:JSON.parse(boxes.stdout),verifyRenderedSnapshot:true};
          sourceSnapshot=join(snapshotDir,'snapshot.json');
          await writeFile(sourceSnapshot,JSON.stringify(sourceSnapshotData,null,2));
          await writeFile(join(snapshotDir,'original-position-snapshot.json'),JSON.stringify(sourceSnapshotData,null,2));
        }
        await textarea.fill('');await page.waitForFunction(()=>{
          const s=JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent);return s.records[0]?.segments.every(r=>!r.text.trim()&&!r.symbolId);
        }).catch(async error=>{await writeFile(join(dir,'empty-timeout.json'),JSON.stringify({patched,language,session:await session(),textarea:await textarea.inputValue()},null,2));await page.screenshot({path:join(dir,'empty-timeout.png')});throw error;});await settle();
        await page.locator('.page-container').screenshot({path:join(dir,`${patched?'patched':'before'}-empty-${language}.png`),scale:'css'});
        await page.screenshot({path:join(dir,`${patched?'patched':'before'}-editor-empty-${language}.png`),scale:'css'});
        await page.getByRole('button',{name:language==='en'?'Cancel':'Cancelar',exact:true}).click();
        if(patched){
          await page.getByRole('button',{name:'📝 Edit Text',exact:true}).click();
          const nativeRun=originalRuns.find(r=>r.symbolMetrics?.sourceAssetUrl);
          const nativeMatch=nativeRun&&original.match(new RegExp(`\\[\\[(?:symbol:)?${nativeRun.symbolId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\]\\]`));
          // Native occurrences use normal palette aliases; derive the token
          // order from the actual model and the textarea instead of guessing.
          const tokens=original.match(/\[\[[^\]]+\]\]/gu)||[];
          const symbolRuns=originalRuns.filter(r=>r.symbolId);
          const nativeIndex=symbolRuns.findIndex(r=>r.symbolMetrics?.sourceAssetUrl);
          const first=nativeMatch?.[0]||tokens[nativeIndex>=0?nativeIndex:0];
          const moved=first?original.replace(first,'')+` ${first}`:original;
          await textarea.fill(moved);await page.getByRole('button',{name:language==='en'?'Confirm':'Confirmar',exact:true}).click();await settle();
          const movedRuns=(await session()).records[0].segments;
          assert.deepEqual(movedRuns.filter(r=>r.symbolId).map(r=>r.symbolId).sort(),symbols.slice().sort());
          const appearanceKeys=runs=>runs.filter(r=>r.symbolMetrics?.sourceAppearanceKey).map(r=>`${r.symbolId}:${r.symbolMetrics.sourceAppearanceKey}`).sort();
          assert.deepEqual(appearanceKeys(movedRuns),appearanceKeys(originalRuns),'Moving a native alias must preserve audited source paint');
          // Confirmation and the text change are two actions in the history.
          await page.getByRole('button',{name:language==='en'?'Undo':'Desfazer',exact:true}).click();await settle();
          await page.getByRole('button',{name:language==='en'?'Undo':'Desfazer',exact:true}).click();await settle();
          assert.equal(await textarea.inputValue(),original);
          await page.getByRole('button',{name:language==='en'?'Redo':'Refazer',exact:true}).click();await settle();
          await page.getByRole('button',{name:language==='en'?'Redo':'Refazer',exact:true}).click();await settle();
          assert.deepEqual((await session()).records[0].segments,movedRuns);
          await page.getByRole('button',{name:'Aplicar à prova',exact:true}).click();await settle();
          await page.getByLabel('Editor',{exact:true}).uncheck();await settle();
          await page.locator('.page-container').screenshot({path:join(dir,`moved-${language}.png`),scale:'css'});
          const records=(await session()).records;
          const translations=snapshotTranslations(records,language,sourceLineHeight);
          const snapshotDir=join(dir,`snapshot-${language}`);
          const movedSnapshot=join(snapshotDir,'moved-test-snapshot.json');
          await writeFile(movedSnapshot,JSON.stringify({...sourceSnapshotData,translations},null,2));
          exports.push({page:c.page,language,snapshot:sourceSnapshot,movedSnapshot,dir});
          local.languages.push({language,sourceSymbolIds:symbols,sourceSegments:originalRuns.length,movedSegments:movedRuns.length,
            undoOriginal:true,redoExact:true,snapshot:sourceSnapshot,movedSnapshot});
          // Confirm an intentional deletion, then cancel the isolated proof and
          // assert that the original source run/paint returns without persistence.
          await page.getByLabel('Editor',{exact:true}).check();await settle();
          await page.getByRole('button',{name:'📝 Edit Text',exact:true}).click();
          const deleteText=await textarea.inputValue();
          const deleteTokens=deleteText.match(/\[\[[^\]]+\]\]/gu)||[];
          if(deleteTokens.length){
            const deletedToken=deleteTokens.at(-1);
            const beforeDeleteIds=(await session()).records[0].segments.filter(r=>r.symbolId).map(r=>r.symbolId);
            await textarea.fill(deleteText.replace(deletedToken,''));
            await page.getByRole('button',{name:language==='en'?'Confirm':'Confirmar',exact:true}).click();await settle();
            const afterDeleteIds=(await session()).records[0].segments.filter(r=>r.symbolId).map(r=>r.symbolId);
            const beforeCounts=new Map(),afterCounts=new Map();
            beforeDeleteIds.forEach(id=>beforeCounts.set(id,(beforeCounts.get(id)||0)+1));
            afterDeleteIds.forEach(id=>afterCounts.set(id,(afterCounts.get(id)||0)+1));
            const removedIds=[...beforeCounts].filter(([id,count])=>count>(afterCounts.get(id)||0));
            const addedIds=[...afterCounts].filter(([id,count])=>count>(beforeCounts.get(id)||0));
            assert.equal(removedIds.reduce((sum,[,count])=>sum+count,0)-removedIds.reduce((sum,[id])=>sum+(afterCounts.get(id)||0),0),1,
              'Confirming removal deletes exactly one symbol occurrence');
            assert.deepEqual(addedIds,[],'Deletion does not add a symbol');
            local.languages[local.languages.length-1].deletedSymbolId=removedIds[0]?.[0];
            local.languages[local.languages.length-1].deleteConfirmed=true;
          }else{
            local.languages[local.languages.length-1].deleteConfirmed=false;
            local.languages[local.languages.length-1].deleteReason='No symbol alias token in this owner';
          }
          await page.getByRole('button',{name:'Cancelar toda a prova',exact:true}).click();await settle();
          assert.equal((await session()).records.length,0);
          local.languages[local.languages.length-1].cancelRestoredSource=(await session()).records.length===0;
          await page.locator('.page-container').screenshot({path:join(dir,`restored-after-delete-cancel-${language}.png`),scale:'css'});
          await page.getByLabel('Editor',{exact:true}).check();
        }
      }
    }
    results.push(local);await writeFile(join(proofRoot,'editor-results.json'),JSON.stringify({apiRequests,results,exports},null,2));
    console.log(JSON.stringify({page:c.page,block:c.block,languages:local.languages.map(l=>({language:l.language,symbols:l.sourceSymbolIds,undo:l.undoOriginal,redo:l.redoExact}))}));
  }
  assert.equal(apiRequests,0,'The isolated lab must not request Payload.');
}finally{await browser.close();}
