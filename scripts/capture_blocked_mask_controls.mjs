/** Capture known p85/p92 mask failures from the authoritative staged package. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const out=resolve('output/proofs/symbol-activation-2026-10-13');
const dest=join(out,'blocked-controls');await mkdir(dest,{recursive:true});
const ids=['p085-v96-99-n4','p085-v108-111-n4','p092-v185-186-187','p092-v188-189','p092-v190'];
const known=[];
for(const pageNo of [85,92]){
  const p=String(pageNo).padStart(3,'0');
  const side=JSON.parse(await readFile(join(out,'patches/pages',`page_${p}`,'inline_elements.json'),'utf8'));
  const dom=JSON.parse(await readFile(`apps/web/public/pages/page_${p}/page_${p}_dom.json`,'utf8'));
  for(const e of side.elements){const cid=e.provenance?.candidateId;if(ids.includes(cid))known.push({candidateId:cid,page:pageNo,block:e.anchor.blockIndex,bbox:e.bbox,maskBbox:e.mask.bbox,symbolId:e.symbolId,element:e,dom,side});}
}
if(known.length!==ids.length)throw new Error('Known blocked controls do not match the prepared patch set');
const noChrome='.rse-overlay,.rse-resize-handle{display:none!important}.block-selected,.span-selected{outline:none!important;background-color:transparent!important;box-shadow:none!important}.block-editable:hover,.span-editable:hover,.block-container:hover{outline:none!important;background-color:transparent!important;box-shadow:none!important}';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const context=await browser.newContext({viewport:{width:2000,height:1800},deviceScaleFactor:2});let apiRequests=0;
  await context.route('**/api/**',r=>{apiRequests++;return r.abort('blockedbyclient')});
  await context.route('http://127.0.0.1:8091/**',async route=>{
    const u=new URL(route.request().url());if(u.pathname==='/important-proposals.json')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    const path=join(out,decodeURIComponent(u.pathname).replace(/^\/+/,''));
    try{const body=await readFile(path);const type=path.endsWith('.json')?'application/json':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/octet-stream';return route.fulfill({status:200,contentType:type,body});}catch{return route.fulfill({status:404,body:'not staged'});}
  });
  const page=await context.newPage();const session=()=>page.getByTestId('lab-session-data').evaluate(e=>JSON.parse(e.textContent));
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const results=[];
  async function load(pageNo,patched){await page.goto(`http://localhost:8080/symbol-integrity-lab.html?page=${pageNo}&patch=${patched?1:0}`);await page.waitForFunction(()=>{const i=document.querySelector('.page-container img');return !!i&&i.complete&&i.naturalWidth>0});await page.evaluate(()=>document.fonts.ready);await settle();}
  async function capture(c,state){
    let pageBox=await page.locator('.page-container').boundingBox();const pageWidth=c.dom.width;let scale=pageBox.width/pageWidth;
    const vp=page.viewportSize();await page.locator('.page-stage').evaluate((stage,p)=>{stage.scrollLeft=Math.max(0,p.x-stage.clientWidth*.4);stage.scrollTop=Math.max(0,p.y-stage.clientHeight*.4);},{x:((c.bbox[0]+c.bbox[2])/2)*scale,y:((c.bbox[1]+c.bbox[3])/2)*scale});await settle();
    pageBox=await page.locator('.page-container').boundingBox();scale=pageBox.width/pageWidth;const pad=5;
    const x=Math.max(0,pageBox.x+(c.bbox[0]-pad)*scale),y=Math.max(0,pageBox.y+(c.bbox[1]-pad)*scale);
    const right=Math.min(vp.width,pageBox.x+(c.bbox[2]+pad)*scale),bottom=Math.min(vp.height,pageBox.y+(c.bbox[3]+pad)*scale);
    const path=join(dest,`${c.candidateId}-${state}.png`);await page.screenshot({path,clip:{x,y,width:right-x,height:bottom-y},style:noChrome,animations:'disabled'});
    return {path,pageClipPt:[(x-pageBox.x)/scale,(y-pageBox.y)/scale,(right-pageBox.x)/scale,(bottom-pageBox.y)/scale],screenScale:scale,pixelCrop:[Math.round((right-x)*2),Math.round((bottom-y)*2)]};
  }
  for(const pageNo of [85,92]){
    const candidates=known.filter(c=>c.page===pageNo);const pageDir=join(dest,`p${String(pageNo).padStart(3,'0')}`);await mkdir(pageDir,{recursive:true});
    for(const patched of [false,true]){await load(pageNo,patched);for(const c of candidates){const proof=await capture(c,patched?'reinserted':'viewer-source');c[patched?'reinserted':'viewerSource']=proof;}}
    await load(pageNo,true);await page.getByLabel('Idioma da prova').selectOption('en');const block=candidates[0].dom.blocks[candidates[0].block];const key=block.editorKey?`${block.editorKey}__en`:`page_${pageNo}_block_${candidates[0].block}`;
    await page.getByLabel('Bloco completo').selectOption(key);await page.getByRole('button',{name:'📝 Edit Text',exact:true}).click();
    const textarea=page.locator('textarea:visible').first();const text=await textarea.inputValue();await textarea.fill(text+' ');await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records.length>0);await textarea.fill('');
    await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records[0]?.segments.every(s=>!s.text.trim()&&!s.symbolId));await settle();
    for(const c of candidates)c.empty=await capture(c,'empty');
    results.push(...candidates.map(c=>({candidateId:c.candidateId,page:c.page,block:c.block,symbolId:c.symbolId,bbox:c.bbox,maskBbox:c.maskBbox,viewerSourceCapture:c.viewerSource,reinsertedCapture:c.reinserted,emptyCapture:c.empty})));
  }
  if(apiRequests!==0)throw new Error(`Unexpected API calls: ${apiRequests}`);
  const report={status:'captured; known controls remain blocked',controlCount:results.length,apiRequests,sourceOfIds:'activation-status.blockedCandidateIds',results};
  await writeFile(join(dest,'control-captures.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({controlCount:results.length,apiRequests,report:join(dest,'control-captures.json')}));
}finally{await browser.close();}
