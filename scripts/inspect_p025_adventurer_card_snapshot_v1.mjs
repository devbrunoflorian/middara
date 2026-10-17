import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const root=process.cwd();
const proofDir=resolve(root,'output/proofs/translation-readiness-2026-10-16/p025-adventurer-card-proposal-v1');
const proposal=JSON.parse(await readFile(resolve(root,'docs/translations/proposals/page-025-adventurer-card-proposal-2026-10-16-v1.json'),'utf8'));
const snapshot=JSON.parse(await readFile(resolve(proofDir,'snapshot/snapshot.json'),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({viewport:{width:1600,height:1400},deviceScaleFactor:1});
 await context.route('**/pages/page_025/page_025_dom.json',route=>route.fulfill({path:resolve(proofDir,'snapshot/pages/page_025/page_025_dom.json')}));
 await context.route('**/api/**',async route=>{const req=route.request();const url=new URL(req.url());if(req.method()!=='GET'){await route.abort('blockedbyclient');return;}const docs=url.pathname==='/api/translations'?(snapshot.translations||[]):url.pathname==='/api/layout-frames'?(snapshot.layoutFrames||[]):url.pathname==='/api/symbol-alias-settings'?(snapshot.symbolAliasSettings||[]):[];const lang=url.searchParams.get('where[language][equals]');const filtered=docs.filter(d=>!lang||d.language===lang);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({docs:filtered,totalDocs:filtered.length})});});
 const page=await context.newPage();await page.goto('http://127.0.0.1:8080',{waitUntil:'domcontentloaded'});await page.waitForSelector('input.page-input');await page.locator('input.page-input').fill('25');await page.locator('input.page-input').press('Enter');await page.waitForTimeout(1200);await page.locator('select.language-select').selectOption('pt-BR');await page.waitForTimeout(1200);
 const result=await page.evaluate(()=>({translations:[...document.querySelectorAll('[data-rendered-translation-key]')].map(n=>({key:n.getAttribute('data-rendered-translation-key'),text:n.innerText,box:(()=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()})),editables:[...document.querySelectorAll('[data-editable-unit-key]')].map(n=>({key:n.getAttribute('data-editable-unit-key'),text:n.innerText.slice(0,80)})),overflows:document.querySelectorAll('.block-overflow,[data-reflow-overflow-pt]').length,bodyText:document.querySelector('.page-container')?.innerText}));
 const byKey=proposal.candidates.map(c=>({spanKey:c.spanKey,proposal:c.proposalText,rendered:result.translations.filter(t=>t.key=== (c.spanKey.endsWith('__pt-BR')?c.spanKey:c.spanKey+'__pt-BR'))}));
 console.log(JSON.stringify({byKey,editableKeys:result.editables.map(e=>e.key),overflows:result.overflows},null,2));
}finally{await browser.close();}
