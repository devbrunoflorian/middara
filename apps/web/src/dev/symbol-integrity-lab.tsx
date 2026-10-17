import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PageRenderer, type PageData, type LayoutFrame } from '../components/PageRenderer';
import type { SpanOverride } from '../components/RichSpanEditor';
import { AdminSymbolPalette, type AdminSymbolPaletteEditorState } from '../components/AdminSymbolPalette';
import { attachSourceInlineElements, type SourceInlineElement } from '../symbols/sourceInlineElements';
import { attachSourceCompoundElements } from '../symbols/sourceCompounds';
import '../fonts.css';
import '../App.css';
import './symbol-integrity-lab.css';

const auditOrigin='http://127.0.0.1:8091';
async function optional(url:string,fallback:any){const r=await fetch(url);return r.ok&&r.headers.get('content-type')?.includes('json')?r.json():fallback;}
const pageKey=(p:number,b:any,i:number,language:string)=>b.editorKey?`${b.editorKey}__${language}`:`page_${p}_block_${i}`;
function Lab(){
  const params=new URLSearchParams(location.search);
  const [page,setPage]=useState(Number(params.get('page')||52));
  const [language,setLanguage]=useState<'en'|'pt-BR'>('en');
  const [patched,setPatched]=useState(params.get('patch')==='1');
  const [data,setData]=useState<PageData|null>(null);
  const [selection,setSelection]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const [maps,setMaps]=useState<Record<string,Map<string,SpanOverride>>>({en:new Map(),'pt-BR':new Map()});
  const [drafts,setDrafts]=useState<Map<string,SpanOverride>>(new Map());
  const [palette,setPalette]=useState<AdminSymbolPaletteEditorState|null>(null);
  const [openPalette,setOpenPalette]=useState(false);
  const [status,setStatus]=useState('Carregando fonte isolada…');
  const [admin,setAdmin]=useState(true);
  const [proposalId,setProposalId]=useState('');
  const [proofs,setProofs]=useState<any[]>([]);
  const [proofFrames,setProofFrames]=useState<Map<string,LayoutFrame>>(new Map());
  const current=maps[language];const preview=new Map(current);drafts.forEach((v,k)=>preview.set(k,v));
  useEffect(()=>{optional(`${auditOrigin}/important-proposals.json`,[]).then(setProofs);},[]);
  useEffect(()=>{let active=true;setData(null);setSelection(null);setDrafts(new Map());setMaps({en:new Map(),'pt-BR':new Map()});setProposalId('');
    (async()=>{const id=String(page).padStart(3,'0'),base=`/pages/page_${id}`;const dom=await optional(`${base}/page_${id}_dom.json`,null);if(!dom)throw new Error('DOM fonte indisponível');
      const [frames,inlineOriginal,compounds,overlays]=await Promise.all([optional(`${base}/layout_frames.json`,{}),optional(`${base}/inline_elements.json`,{elements:[]}),optional(`${base}/compound_elements.json`,{elements:[]}),optional(`${base}/fidelity_overlays.json`,{overlays:[]})]);
      let elements:SourceInlineElement[]=inlineOriginal.elements||[];if(patched){const patch=await optional(`${auditOrigin}/patches/pages/page_${id}/inline_elements.json`,null);if(patch)elements=patch.elements.map((e:SourceInlineElement)=>({...e,mask:{...e.mask,url:e.mask.url.includes('audit-')?`${auditOrigin}/patches${e.mask.url}`:e.mask.url},metrics:e.metrics?{...e.metrics,sourceAssetUrl:e.metrics.sourceAssetUrl?.includes('audit-')?`${auditOrigin}/patches${e.metrics.sourceAssetUrl}`:e.metrics.sourceAssetUrl}:e.metrics}));}
      const blocks=attachSourceInlineElements(attachSourceCompoundElements(dom.blocks.map((b:any)=>({...b,layoutFrame:frames[b.id]||b.layoutFrame})),compounds.elements||[]),elements);
      if(!active)return;setData({page_number:page,width:dom.width,height:dom.height,backgroundUrl:`${base}/background.webp`,images:[],layoutObstacles:dom.images?.filter((i:any)=>i.role==='content').map((i:any)=>i.bbox)||[],blocks,inlineElements:elements,sourceCompounds:compounds.elements||[],fidelityOverlays:overlays.overlays||[]});setStatus(`${patched?'Patch isolado':'Sidecar atual'} · ${elements.length} placements · EN intacto · sem persistência`);
    })().catch(e=>{if(active)setStatus(String(e))});return()=>{active=false};},[page,patched]);
  const save=useCallback((key:string,value:SpanOverride|null)=>{setMaps(m=>{const next=new Map(m[language]);value?next.set(key,value):next.delete(key);return {...m,[language]:next}});setDrafts(new Map());setStatus('Alteração aplicada somente à prova em memória.');},[language]);
  const draft=useCallback((key:string,value:SpanOverride|null)=>setDrafts(m=>{const next=new Map(m);value?next.set(key,value):next.delete(key);return next}),[]);
  const paletteChange=useCallback((_key:string,value:AdminSymbolPaletteEditorState|null)=>setPalette(value),[]);
  const restore=()=>{setMaps({en:new Map(),'pt-BR':new Map()});setProofFrames(new Map());setDrafts(new Map());setSelection(null);setRevision(n=>n+1);setProposalId('');setStatus('Prova restaurada à fonte carregada; somente os dados desta página em memória foram descartados.');};
  const selectProposal=(id:string)=>{setProposalId(id);const p=proofs.find(x=>x.occurrenceId===id);if(!p)return;setLanguage('pt-BR');setSelection(null);setDrafts(new Map());const key=p.source.editorialKey;const override={spanKey:key,bbox:p.source.bboxPt,textAlign:'left',lineHeight:1.1,lineHeightMode:'custom',segments:p.proposal.segments,managedSourceSymbols:p.proposal.symbolIds} as SpanOverride;setProofFrames(p.proposal.layoutFrame?new Map([[key,p.proposal.layoutFrame]]):new Map());setMaps(m=>({...m,'pt-BR':new Map([[key,override]])}));setStatus('Proposta PT-BR existente; nenhuma tradução gerada ou salva.');};
  const download=()=>{const translations=[...preview].map(([key,v])=>({spanKey:key.endsWith(`__${language}`)||language==='en'?key:`${key}__${language}`,language,data:{...v,bbox:undefined,spanKey:undefined}}));const blob=new Blob([JSON.stringify({translations,layoutFrames:[],symbolAliasSettings:[],assetPages:[page],page,patched,verifyRenderedSnapshot:true},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`p${page}-${language}-symbol-session.json`;a.click();URL.revokeObjectURL(a.href);};
  return <div className="symbol-lab"><header className="lab-toolbar"><h1>Prova isolada de símbolos · PageRenderer + Rich Block Editor</h1><p role="status">{status} · Viewer localhost:8080 · API e localStorage desligados</p><label>Página <input aria-label="Página da prova" type="number" min="1" max="102" value={page} onChange={e=>setPage(Number(e.target.value))}/></label><label>Idioma <select aria-label="Idioma da prova" value={language} onChange={e=>{setLanguage(e.target.value as 'en'|'pt-BR');setSelection(null);setDrafts(new Map());}}><option value="en">EN</option><option value="pt-BR">PT-BR</option></select></label><label><input type="checkbox" checked={patched} onChange={e=>setPatched(e.target.checked)}/> Patch preparado</label><label><input type="checkbox" checked={admin} onChange={e=>setAdmin(e.target.checked)}/> Editor</label><label>Bloco completo <select aria-label="Bloco completo" value={selection||''} onChange={e=>setSelection(e.target.value||null)}><option value="">Selecione o bloco</option>{data?.blocks.map((b,i)=><option key={b.id} value={pageKey(page,b,i,language)}>{i} · {b.id} · {b.lines?.flatMap(l=>l.spans.map(s=>s.text)).join('').slice(0,50)}</option>)}</select></label><label>Proposta existente <select aria-label="Proposta existente" value={proposalId} onChange={e=>selectProposal(e.target.value)}><option value="">Fonte</option>{proofs.filter(p=>p.page===page).map(p=><option key={p.occurrenceId}>{p.occurrenceId}</option>)}</select></label><button type="button" onClick={restore}>Cancelar toda a prova</button><button type="button" onClick={download}>Baixar snapshot da sessão</button><button type="button" onClick={()=>setOpenPalette(!openPalette)}>Paleta</button></header>
    <main className="lab-viewer viewer-main">{data&&<PageRenderer key={`${page}-${language}-${patched}-${revision}`} pageData={data} isAdmin={admin} showRuler={false} zoomLevel={1.35} language={language} isolatedSnapshot readOnlyExperiment experimentalEditorMode experimentalOverrides={preview} experimentalEditorOverrides={current} experimentalFrames={language==='pt-BR'?proofFrames:undefined} experimentalEditorSelectionKey={selection} experimentalDraftKey={drafts.keys().next().value??null} onExperimentalEditorSave={save} onExperimentalEditorDraftChange={draft} onPaletteEditorChange={paletteChange} editableNavigationEnabled={false}/>}</main>
    <AdminSymbolPalette language={language} context={palette?.context||'admin'} open={openPalette} canInsert={palette?.canInsert||false} canUndo={palette?.canUndo||false} status={palette?.status||null} aliasPreferences={{}} aliasesLoading={false} onOpenChange={setOpenPalette} onInsert={id=>palette?.insert(id)} onUndo={()=>palette?.undo()} onSaveAlias={async()=>({ok:false,message:'Preferências de alias ficam desligadas nesta prova.'})}/>
    <details className="lab-metadata"><summary>Snapshot e metadados em memória</summary><pre data-testid="lab-session-data">{JSON.stringify({language,selection,records:[...preview].map(([key,v])=>({key,segments:v.segments,managedSourceSymbols:v.managedSourceSymbols}))},null,2)}</pre></details></div>;
}
createRoot(document.getElementById('root')!).render(<Lab/>);
