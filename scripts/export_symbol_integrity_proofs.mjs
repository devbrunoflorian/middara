/** Export isolated, immutable editor snapshots through the production viewer. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const out=resolve(process.env.MIDDARA_SYMBOL_AUDIT_DIR||'output/proofs/full-symbol-integrity-2026-10-13');
const data=JSON.parse(await readFile(join(out,'viewer-editor/editor-results.json'),'utf8'));
const selected=process.argv[2]?.split(',').map(Number);
const exports=data.exports.filter(e=>!selected||selected.includes(e.page));
const records=[];
for(const e of exports){
  const pdf=join(e.dir,`moved-${e.language}.pdf`),metrics=join(e.dir,`export-${e.language}-metrics.json`);
  const r=spawnSync(process.execPath,['scripts/export_page_pdf.mjs','--page',String(e.page),'--language',e.language,
    '--snapshot',e.snapshot,'--output',pdf,'--metrics-output',metrics,
    '--viewer-screenshot',join(e.dir,`export-${e.language}-viewer.png`),'--print-screenshot',join(e.dir,`export-${e.language}-print.png`)],{encoding:'utf8',maxBuffer:8*1024*1024});
  await writeFile(join(e.dir,`export-${e.language}.log`),(r.stdout||'')+(r.stderr||''));
  records.push({page:e.page,language:e.language,exitCode:r.status,pdf,metrics});
  await writeFile(join(out,'pdf-results.json'),JSON.stringify(records,null,2));
  console.log(JSON.stringify(records.at(-1)));
  if(r.status)throw new Error(`Isolated PDF proof failed: p${e.page} ${e.language}; see its saved log.`);
}
