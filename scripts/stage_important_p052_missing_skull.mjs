#!/usr/bin/env node
import {readFile,writeFile} from'node:fs/promises';
const manifestPath='docs/translations/proposals/important-family-manifest-2026-10-13.json';
const m=JSON.parse(await readFile(manifestPath,'utf8'));
const o=m.occurrences.find(x=>x.occurrenceId==='p052-block_17');
if(o.proposal?.targetText)throw Error('Existing proposal preserved.');
if(o.existingPT?.length)throw Error('Refusing to replace human PT-BR.');
const symbolCatalog=JSON.parse(await readFile('apps/web/src/symbols/sourceSymbols.json','utf8'));
const skull=symbolCatalog.find(x=>x.id==='combat.skull');
if(!skull?.render?.viewBox)throw Error('Source skull vector missing.');
const label=o.typography.labelRuns[0],tag=o.symbols.find(x=>x.symbolId==='tag.important.icon');
const labelStyle={font:label.font,size:label.size,color:label.color,weight:900,style:'normal',textStrokeWidthPt:label.renderTextStrokeWidthPt??2,textStrokeColor:label.renderTextStrokeColor??'#fff',disableLigatures:true};
const normal={font:'OptimaLTStd',size:10,color:'#231f20',weight:400,style:'normal',disableLigatures:true};
const bold={font:'OptimaLTStd-Bold',size:9,color:'#231f20',weight:700,style:'normal',disableLigatures:true};
const body='Habilidades e Melhorias de Esquiva podem conceder bônus durante uma **ESQUIVA**. Porém, se o resultado for[[symbol:combat.skull]] no dado, essas Habilidades não concedem bônus.';
const parts=[];let cursor=0,plain='',symbolSeen=false;const spans=[{id:'important-label',targetText:'IMPORTANTE:',start:0,end:11,style:labelStyle}];
for(const q of body.matchAll(/\[\[symbol:[^\]]+\]\]|\*\*[^*]+\*\*/gu)){
 if(q.index>cursor){const t=body.slice(cursor,q.index);parts.push({...normal,text:t});plain+=t;}
 if(q[0].startsWith('[[symbol:')){
  if(symbolSeen)throw Error('Duplicate missing glyph');symbolSeen=true;
  const anchor={blockId:'block_17',blockIndex:o.source.blockIndex,lineId:'line_17_3',spanIndex:0,side:'replace',sizePt:10};
  const view=skull.render.viewBox;
  parts.push({text:'\uFFFC',symbolId:'combat.skull',symbolMetrics:{widthEm:view[2]/10,heightEm:view[3]/10,verticalAlignEm:skull.source.bboxPt?0.2007:0},sourceAnchor:anchor,...normal});
 }
 else {const t=q[0].slice(2,-2),at=plain.length;parts.push({...bold,text:t});plain+=t;spans.push({id:'bold-dodge',targetText:t,start:at,end:at+t.length,style:bold});}
 cursor=q.index+q[0].length;
}
if(cursor<body.length){const t=body.slice(cursor);parts.push({...normal,text:t});plain+=t;}
const symMetrics={widthEm:skull.render.viewBox[2]/10,heightEm:skull.render.viewBox[3]/10,verticalAlignEm:0.2007};
parts.unshift({text:'\uFFFC',symbolId:'tag.important.icon',symbolMetrics:tag.metrics,sourceAnchor:tag.anchor,...normal},{...labelStyle,text:'IMPORTANTE:'},{...normal,text:' '});
plain=`IMPORTANTE: ${plain}`;for(const s of spans.slice(1)){s.start+=12;s.end+=12;}
const targetText=`[[symbol:tag.important.icon]]IMPORTANTE: ${body.replace('**ESQUIVA**','ESQUIVA')}`;
o.proposal={proposalId:`${o.source.editorialKey}__pt-BR__draft-2026-10-13-symbol-skull`,locale:'pt-BR',version:1,sourceBlockSha256:o.source.blockSha256,sourcePageSidecarSha256:o.source.pageSidecarSha256,targetText,textWithSymbols:targetText,targetPlainText:plain,segments:parts,explicitRichSpans:spans,sourceUnitIds:[o.source.editorialKey,...(o.source.relatedSourceUnitIds??[])],symbolIds:['tag.important.icon','combat.skull'],status:'draft-pending-human-review',sourceContentComplete:true,containsFallbackEnglish:false,fit:{status:'pending-variant-PageRenderer-and-PDF-proof',measurements:null},editorialReview:{status:'REVISÃO TERMINOLÓGICA',notes:['DODGE, Dodge Upgrade e a redação “se sair a Caveira no dado” precisam de aprovação editorial.']},terminology:{status:'pending-human-review',issues:[{term:'DODGE / Dodge Upgrade / Caveira'}]},copyfit:{revision:0,revisionBudget:3,notes:['A extração fonte omite o símbolo combat.skull; sua âncora foi recuperada do intervalo vazio em line_17_3:0 comparado com o espaço entre os runs e com o glyph visível na fonte PDF. Provar no PageRenderer antes de validar.']},provenance:'Isolated proposal only; skull identity from sourceSymbols.json and source PDF; no canonical edits.',layoutFrame:null,reviewStates:{technical:{status:'REVISÃO TÉCNICA',evidence:['Missing source glyph is represented in proposal only; PageRenderer proof required.']},editorial:{status:'REVISÃO TERMINOLÓGICA',approved:false}}};
o.proposal.segments.find(x=>x.symbolId==='combat.skull').symbolMetrics=symMetrics;
o.processing={...(o.processing??{}),status:'proposal-staged-symbol-recovery-pending-proof',technicalStatus:'REVISÃO TÉCNICA',editorialStatus:'REVISÃO TERMINOLÓGICA',blockers:['Source sidecar omitted combat.skull; inferred from original PDF icon gap and symbol catalog. Validate anchor/rendering before approval.']};o.reviewStates=o.proposal.reviewStates;
m.processing.batches=[...(m.processing.batches??[]).filter(x=>x.id!=='batch-009-p052-skull'),{id:'batch-009-p052-skull',occurrenceIds:['p052-block_17'],status:'Source skull recovered as an isolated proposal; PageRenderer proof pending.'}];
m.processing.proposalDraftCount=m.occurrences.filter(x=>x.proposal?.targetText).length;
await writeFile(manifestPath,JSON.stringify(m,null,2)+'\n');console.log(JSON.stringify({id:o.occurrenceId,symbolId:'combat.skull',metrics:symMetrics,drafts:m.processing.proposalDraftCount},null,2));
