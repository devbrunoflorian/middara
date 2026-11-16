#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('docs/translations/proposals/important-family-manifest-2026-10-13.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const bold = { font: 'OptimaLTStd-Bold', weight: 700, style: 'normal' };
const italic = { font: 'OptimaLTStd-Italic', weight: 400, style: 'italic' };
const items = [
  { id: 'p024-block_35', body: 'Na Rodada de História, descarte Itens Consumíveis não vendidos nem equipados. Veja *Venda de Itens*, p. 27.' },
  { id: 'p030-block_42', body: 'Em geral, Símbolos só são gastos em Ações de Ataque, salvo quando uma Habilidade permite gastá-los em rolagens sem Ataque.' },
  { id: 'p032-block_56', body: 'Um Aventureiro pode aprender quantas Disciplinas puder pagar, mas nunca a mesma Disciplina duas vezes.' },
  { id: 'p037-block_19', body: 'Aventureiro não recebe **SP** na Fase de Manutenção do seu **1º** turno em um Encontro. Veja ***Fase de Preparação***, p. 14.' },
];
function parse(markup) {
  const result = []; const re = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/gu; let last = 0;
  for (const m of markup.matchAll(re)) {
    if (m.index > last) result.push({ text: markup.slice(last, m.index), style: 'normal' });
    const t = m[0]; result.push({ text: t.startsWith('***') ? t.slice(3,-3) : t.startsWith('**') ? t.slice(2,-2) : t.slice(1,-1), style: t.startsWith('***') ? 'boldItalic' : t.startsWith('**') ? 'bold' : 'italic' }); last = m.index + t.length;
  }
  if (last < markup.length) result.push({ text: markup.slice(last), style: 'normal' }); return result;
}
for (const item of items) {
  const o = manifest.occurrences.find(x => x.occurrenceId === item.id); if (!o?.proposal) throw new Error(`Missing proposal ${item.id}`);
  const p = o.proposal; p.revisions ??= []; p.revisions.push({ version: p.version, targetText: p.targetText, fit: p.fit, note: 'Copyfit revision retained for recovery.' });
  const label = o.typography.labelRuns[0]; const ls = { font: label.font, size: label.size, color: label.color, weight: 900, style: 'normal', textStrokeWidthPt: label.renderTextStrokeWidthPt ?? 2, textStrokeColor: label.renderTextStrokeColor ?? '#ffffff', disableLigatures: true };
  const icon = o.symbols.find(s => s.symbolId === 'tag.important.icon');
  const segments = [{ text: '\uFFFC', symbolId: 'tag.important.icon', symbolMetrics: icon.metrics, sourceAnchor: icon.anchor, font: 'OptimaLTStd', size: label.size, color: '#231f20', weight: 400, style: 'normal', disableLigatures: true }, { text: 'IMPORTANTE:', ...ls }];
  const plain = item.body.replaceAll('**','').replaceAll('*',''); const spans = [{ id:'important-label', targetText:'IMPORTANTE:', start:0, end:11, sourceSpanRefs:o.typography.labelRuns.map(x=>x.sourceSpanRef).filter(Boolean), style:ls }]; let cursor=0;
  for (const run of parse(item.body)) {
    if (!run.text) continue; const style = run.style==='bold' ? bold : run.style==='italic' ? italic : run.style==='boldItalic' ? {font:'OptimaLTStd-BoldItalic',weight:700,style:'italic'} : {};
    const text = (segments.length===2 ? ' ' : '') + run.text; const seg={text,font:'OptimaLTStd',size:label.size,color:'#231f20',weight:400,style:'normal',disableLigatures:true,...style}; segments.push(seg);
    const at=plain.indexOf(run.text,cursor); if(at<0) throw new Error(`Rich span mapping failed ${item.id}`);
    if(run.style!=='normal') spans.push({id:`${run.style}-${spans.length}`,targetText:run.text,start:12+at,end:12+at+run.text.length,style:{...seg,text:undefined}}); cursor=at+run.text.length;
  }
  p.version += 1; p.targetText=`[[symbol:tag.important.icon]]IMPORTANTE: ${plain}`; p.textWithSymbols=p.targetText; p.targetPlainText=`IMPORTANTE: ${plain}`; p.segments=segments; p.explicitRichSpans=spans; p.fit={status:'copyfit-revised-awaiting-capture',measurements:null}; p.copyfit.revision=(p.copyfit.revision??0)+1; p.copyfit.notes.push('Shortened wording while preserving source conditions and cross-reference; awaiting PageRenderer recheck.');
  o.processing.technicalStatus='REVISÃO TÉCNICA'; o.processing.fit='copyfit-revised-awaiting-render'; o.reviewStates.technical.status='REVISÃO TÉCNICA'; o.reviewStates.technical.evidence=['Copyfit revised after visible overflow; awaiting rerender.']; p.reviewStates.technical={status:'REVISÃO TÉCNICA',evidence:['Copyfit revised after visible overflow; awaiting rerender.']};
}
await writeFile(manifestPath, `${JSON.stringify(manifest,null,2)}\n`);
console.log(`Revised ${items.length} proposals: ${items.map(x=>x.id).join(', ')}`);
