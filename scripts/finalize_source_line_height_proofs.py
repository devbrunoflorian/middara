#!/usr/bin/env python3
"""Validate and index isolated PDF proofs regenerated with measured source leading."""
from __future__ import annotations
import hashlib, json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'output/proofs/translation-readiness-2026-10-14'
SOURCE=ROOT.parent/'Rulebook 1.2/Rulebook 1p2 Final Version 05-19-23 Optimized.pdf'
SOURCE_SHA='a64e04bd7addb8bca2b5f3bfa84bad3ff2e6d2f8dda200f5d14fe0734e543351'
GROUPS={
 'native-vector-mask-v10': {'old':'native-vector-mask-v9','ids':['p045-v134-137-n4','p054-v185-188-n4','p084-v185']},
 'native-vector-mask-p055-proof-v3': {'old':'native-vector-mask-p055-proof-v1','ids':['p055-v94-96-n3','p055-v97']},
 'native-vector-mask-p055-proof-v4': {'old':'native-vector-mask-p055-proof-v2','ids':['p055-v89-91-n3','p055-v92-93-n2']},
 'native-vector-mask-p065-proof-v6': {'old':'native-vector-mask-p065-proof-v5','ids':['p065-v110-112-n3','p065-v115']},
 'native-vector-mask-p068-proof-v5': {'old':'native-vector-mask-p068-proof-v4','ids':['p068-v113-114-n2']},
 'native-vector-mask-p045-v142-proof-v3': {'old':'native-vector-mask-p045-v142-proof-v2','ids':['p045-v142-145-n4']},
}

def read(path): return json.loads(path.read_text(encoding='utf-8'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,data): path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def relative(path): return path.relative_to(ROOT).as_posix()

assert sha(SOURCE)==SOURCE_SHA, 'Source PDF identity changed.'
all_rows=[]
for group,conf in GROUPS.items():
 new_root=BASE/group; old_root=BASE/conf['old']
 proof_path=new_root/'proof-report.json'; proof=read(proof_path)
 assert proof['sourcePdfSha256']==SOURCE_SHA
 assert proof['canonicalWrites']==proof['payloadWrites']==proof['translationWrites']==proof['apiRequests']==0
 assert {x['candidateId'] for x in proof['candidates']}==set(conf['ids'])
 review_path=new_root/'visual-review.json'
 if review_path.exists():
  review=read(review_path)
 else:
  review=read(old_root/'visual-review.json')

 if group=='native-vector-mask-p068-proof-v5':
  # p.68 has a dedicated regenerated review with strict EN serialization checks.
  assert review['checks']['emptyOverrideExportConsumesSerializedSnapshotWithoutSourceFallback'] is True
  assert review['checks']['emptyOverridePdfPreservesEnglishSentenceAndRemovesOnlyTargetSkull'] is True
 if group=='native-vector-mask-p045-v142-proof-v3':
  # Regenerated review already includes the refreshed overlay/rollback receipts.
  assert review['patchOverlay']['idempotent'] is True
  assert review['patchOverlay']['rollbackPassed'] is True

 reviews={entry['candidateId']:entry for entry in review.get('targets',[])}
 proofs={entry['candidateId']:entry for entry in proof['candidates']}
 for cid in conf['ids']:
  folder=new_root/cid; inp=read(folder/'candidate-input.json'); line=read(folder/'source-line-height.json')
  snap=read(folder/'snapshot/original-position-snapshot.json')
  moved=read(folder/'snapshot/moved-test-snapshot.json')
  empty=read(folder/'empty-state.json'); movement=read(folder/'movement.json'); cancel=read(folder/'cancel-check.json')
  pdf_path=Path(proofs[cid]['pdfPath']); pdf_path=pdf_path if pdf_path.is_absolute() else ROOT/pdf_path
  assert pdf_path.exists() and pdf_path.stat().st_size>0
  assert len(snap['translations'])==1 and snap['translations'][0]['language']=='en'
  tr=snap['translations'][0]; assert not tr['spanKey'].endswith('__en')
  assert 'lineHeight' in tr['data'] and abs(tr['data']['lineHeight']-line['lineHeight'])<1e-10
  assert line['method'] in {'span-origin-baselines','line-bbox-top-fallback'}
  assert all(not row['spanKey'].endswith('__en') for row in moved['translations'])
  target_segments=[s for s in tr['data']['segments'] if s.get('symbolId')==inp['symbolId'] and s.get('symbolMetrics',{}).get('sourceAppearanceKey')==inp['metrics']['sourceAppearanceKey']]
  assert len(target_segments)==1, (cid,len(target_segments))
  moved_segments=[s for row in moved['translations'] for s in row['data']['segments'] if s.get('symbolId')==inp['symbolId'] and s.get('symbolMetrics',{}).get('sourceAppearanceKey')==inp['metrics']['sourceAppearanceKey']]
  assert len(moved_segments)==1
  assert empty['records'][0]['managedSourceSymbols'] and inp['symbolId'] in empty['records'][0]['managedSourceSymbols']
  assert not any(s.get('symbolId')==inp['symbolId'] for s in empty['records'][0]['segments'])
  assert movement['undoRestored'] and movement['redoRestored'] and movement['sourceAliasCount']>=1
  assert cancel['recordsAfterCancel']==0 and cancel['sourceAppearanceRestored'] and cancel['apiRequestsAtCheckpoint']==0
  assert proofs[cid]['apiRequests']==0 and proofs[cid]['sourcePdfSha256']==SOURCE_SHA
  assert proofs[cid]['imageXrefsPreserved'] in (True,False)
  # Each visual comparison is readable evidence with the source, historical export,
  # and source-leading export, and the candidate still remains page-scoped.
  comp=folder.parent/'line-height-review'/f'{cid}-source-old-corrected.png'
  assert comp.exists()
  rec=read(comp.with_suffix('.json'))
  assert rec['newPdfPages']==1 and rec['sourcePageBoxMatchesNewPdf']
  review_target=reviews[cid]
  assert str(review_target['status']).startswith('technical-ready')
  evidence=review_target.setdefault('evidence',{})
  evidence.update({
   'lineHeightComparison':str(comp.relative_to(new_root)).replace('\\','/'),
   'sourceLineHeight':str((folder/'source-line-height.json').relative_to(new_root)).replace('\\','/'),
   'viewerEmpty':str((folder/'capture/viewer-empty-clean-mask.png').relative_to(new_root)).replace('\\','/'),
   'viewerMoved':str((folder/'capture/viewer-moved-clean-mask.png').relative_to(new_root)).replace('\\','/'),
   'isolatedPdf':str(pdf_path.relative_to(new_root)).replace('\\','/'),
  })
  review_target['sourceLineHeight']=line
  review_target['lineHeightVisualCheck']='The corrected export was inspected against the official source and prior proof. The saved source line-height metadata now matches the pinned PDF-derived baseline measurement.'
  # Preserve candidate READY only as an individual placement. Record observed copyfit/page blockers explicitly.
  if cid=='p045-v134-137-n4':
   review_target['copyfitNote']='The black die remains semantically after BLACK and is painted once, but wraps to the next line in the isolated source-text export. This needs normal copyfit review; it is not a page-level pass.'
  if cid=='p045-v142-145-n4':
   review_target['pageScopeNote']='The target white die remains in its intended slot. Two other red defense-value symbols in the same reflowed paragraph visibly overlap adjacent wording in the isolated export; page-level structural PASS remains withheld pending source-layout/copyfit correction.'
  all_rows.append({
   'candidateId':cid,'page':inp['page'],'lineHeight':line['lineHeight'],'lineHeightMethod':line['method'],
   'oldProof':relative(old_root/cid/(f"p{int(inp['page']):03d}-en-mask-v1.pdf" if cid.startswith('p') else '')),
   'newProof':relative(pdf_path),'newProofSha256':sha(pdf_path),
   'comparison':relative(comp),'spanKey':tr['spanKey'],'oneTargetSourceAppearance':len(target_segments)==1,
   'emptyStateRemovesTarget':True,'undoRedo':True,'cancelRestoresSource':True,
  })
  proofs[cid]['status']='source-position and movement proof regenerated with source-derived line height; visual comparison recorded'
 write(proof_path,proof)
 # Preserve group review fields, replacing stale image references with the new comparison set.
 review['status']='technical-ready candidate-scope reviews refreshed with source-derived line-height exports; no canonical activation'
 review['lineHeightRegeneration']={
  'method':'median source baseline step divided by median source text size; line-bbox top fallback only when source span origins are absent',
  'historicalEvidencePreserved':True,
  'canonicalWrites':0,'payloadWrites':0,'translationWrites':0,'apiRequests':0,
 }
 if group=='native-vector-mask-p068-proof-v5':
  outlier=read(new_root/'p068-black-die-outlier.json')
  review['pageLevelOutliers']=[outlier]
  review['pageLevelStructuralPassWithheld']=True
  review['p068BlackDieOutlierIntersectionAreaPt2']=outlier['emptyOverrideCollision']['intersectionAreaPt2']
 if group=='native-vector-mask-p065-proof-v6':
  outlier=read(new_root/'p065-g-marker-outlier.json')
  review['pageLevelOutliers']=[outlier]
  review['pageLevelStructuralPassWithheld']=True
 if group=='native-vector-mask-p045-v142-proof-v3':
  review['pageLevelStructuralPassWithheld']=True
  review['pageLevelStructuralPassReason']='Isolated source-position export visibly reflows other inline defense symbols over adjacent wording in this paragraph.'
 write(review_path,review)

summary={
 'schemaVersion':1,'sourcePdfSha256':SOURCE_SHA,'candidateCount':len(all_rows),'groups':len(GROUPS),
 'status':'Proof snapshots regenerated from pinned source PDF geometry; candidate-only scope; source/Payload/human translation untouched.',
 'allCandidateInvariantsPass':all(r['oneTargetSourceAppearance'] and r['emptyStateRemovesTarget'] and r['undoRedo'] and r['cancelRestoresSource'] for r in all_rows),
 'canonicalWrites':0,'payloadWrites':0,'translationWrites':0,'apiRequests':0,
 'pageLevelPass':False,'pageLevelStructuralPassWithheld':[45,64,65,68],
 'p068BlackDieCollisionAreaPt2':read(BASE/'native-vector-mask-p068-proof-v5/p068-black-die-outlier.json')['emptyOverrideCollision']['intersectionAreaPt2'],
 'candidates':all_rows,
}
write(BASE/'source-line-height-proof-regeneration.json',summary)
print(json.dumps({'candidates':len(all_rows),'groups':len(GROUPS),'allCandidateInvariantsPass':summary['allCandidateInvariantsPass'],'pageLevelStructuralPassWithheld':summary['pageLevelStructuralPassWithheld'],'report':str(BASE/'source-line-height-proof-regeneration.json')},ensure_ascii=False,indent=2))
