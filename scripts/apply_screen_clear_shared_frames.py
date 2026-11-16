from __future__ import annotations
import argparse, json
from pathlib import Path
from statistics import median
from typing import Any

from audit_book_geometry_candidates import (
    PAGE_ROOT, ROOT, X_TOLERANCE, MIN_BLOCKS, MIN_LINES, MIN_TEXT_CHARS,
    filtered_content_images, group_blocks, overlaps, summarize_group, text_of,
)

SKIP_PAGES = {4, 5}  # already handled by dedicated shared-column tracers

def main() -> None:
    parser=argparse.ArgumentParser(description='Apply only visually screened, geometry-consistent shared column frames.')
    parser.add_argument('--apply',action='store_true',help='write verified screen-clear groups to per-page layout sidecars')
    args=parser.parse_args(); files=sorted(PAGE_ROOT.glob('page_*/page_*_dom.json'))
    if len(files)!=102: raise SystemExit(f'Expected 102 page JSONs; found {len(files)}')
    changed_pages=set(); frames_written=0; groups_applied=0; entries_planned=0; blocks_seen=set()
    for path in files:
        data=json.loads(path.read_text(encoding='utf-8')); page=int(data['page_number'])
        if page in SKIP_PAGES: continue
        eligible=[]
        for block in data.get('blocks',[]):
            bbox=block.get('bbox'); lines=block.get('lines',[])
            if isinstance(bbox,list) and len(bbox)==4 and len(lines)>=MIN_LINES and len(text_of(block))>=MIN_TEXT_CHARS:
                eligible.append(block)
        images=filtered_content_images(data); sidecar_path=path.parent/'layout_frames.json'
        frames=json.loads(sidecar_path.read_text(encoding='utf-8-sig')) if sidecar_path.exists() else {}
        page_changes=0
        for group in group_blocks(eligible):
            if len(group)<MIN_BLOCKS: continue
            result=summarize_group(page,data,group,images)
            if result['status']!='screen-clear': continue
            x=median(float(b['bbox'][0]) for b in group); right=max(float(b['bbox'][2]) for b in group); width=right-x
            if width<=0 or x+width>float(data['width'])+0.05: raise SystemExit(f'Invalid frame extent p{page}: {x}+{width}')
            for block in group:
                bid=block.get('id')
                if (page,bid) in blocks_seen: raise SystemExit(f'Duplicate grouped block p{page}/{bid}')
                blocks_seen.add((page,bid))
                existing=frames.get(bid) or block.get('layoutFrame')
                if existing:
                    if abs(float(existing.get('x',x))-x)>0.05 or abs(float(existing.get('width',width))-width)>0.05:
                        raise SystemExit(f'Conflicting existing frame p{page}/{bid}: {existing}')
                    continue
                frames[bid]={'x':x,'width':width,'textAlign':'left'}; page_changes+=1
            if page_changes: groups_applied+=1
        entries_planned += page_changes
        if args.apply and page_changes:
            sidecar_path.write_text(json.dumps(frames,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            changed_pages.add(page); frames_written+=page_changes
    print(json.dumps({'pages_scanned':len(files),'applied':args.apply,'pages_changed':sorted(changed_pages),'groups_with_frames':groups_applied,'frame_entries_planned':entries_planned,'frame_entries_added':frames_written,'excluded_pages':sorted(SKIP_PAGES)},indent=2))

if __name__=='__main__': main()
