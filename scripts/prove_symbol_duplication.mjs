/** Reproduce missing-placement duplication without writing translations. */
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('output/proofs/full-symbol-integrity-2026-10-13/viewer-editor/p085');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({viewport:{width:2000,height:1800},deviceScaleFactor:2});
 await context.route('**/api/**',r=>r.abort('blockedbyclient'));
 const page=await context.newPage();await page.goto('http://localhost:8080/symbol-integrity-lab.html?page=85&patch=0');
 await page.waitForFunction(()=>document.querySelector('.page-container img')?.naturalWidth>0);await page.evaluate(()=>document.fonts.ready);
 await page.getByLabel('Bloco completo').selectOption('page_85_block_1');
 await page.getByRole('button',{name:'📝 Edit Text',exact:true}).click();
 await page.locator('textarea').fill('Proof [[white-die]] [[orange-die]]');
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="lab-session-data"]').textContent).records[0]?.segments.filter(s=>s.symbolId).length===2);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.locator('.page-container').screenshot({path:resolve(out,'before-duplicated-en.png'),scale:'css'});
 await writeFile(resolve(out,'duplication-model.json'),JSON.stringify(await page.getByTestId('lab-session-data').evaluate(e=>JSON.parse(e.textContent)),null,2));
 console.log(JSON.stringify({page:85,sourcePlacementsMissing:['dice.white','dice.orange'],insertedSymbols:2,evidence:'before-duplicated-en.png',writes:0}));
 await page.getByRole('button',{name:'Cancelar toda a prova',exact:true}).click();
}finally{await browser.close()}
