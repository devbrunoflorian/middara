from __future__ import annotations
import argparse, csv, json, re
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / 'apps/web/public/pages'
PDF = Path(r'C:\Users\bruno\Downloads\Rulebook 1p2 Final Version 05-19-23 Optimized.pdf')
OUT = ROOT / 'tmp/ghost-audit/heading-frames'

def text(block):
    return ' '.join(''.join(span.get('text','') for span in line.get('spans',[])).strip() for line in block.get('lines',[])).strip()

def font(line):
    return line.get('spans',[{}])[0].get('font','') if line.get('spans') else ''

def audit(apply: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    book=pymupdf.open(PDF); rows=[]; errors=[]; screened=0; changes=[]
    for number in range(1,103):
        path=PAGES/f'page_{number:03d}'/f'page_{number:03d}_dom.json'
        try: data=json.loads(path.read_text(encoding='utf-8'))
        except Exception as exc: errors.append((number,str(exc))); continue
        if data.get('page_number') != number: errors.append((number,'page_number mismatch')); continue
        blocks=data.get('blocks',[]); frame_path=path.parent/'layout_frames.json'
        frames=json.loads(frame_path.read_text(encoding='utf-8-sig')) if frame_path.exists() else {}
        rules=[]
        for drawing in book[number-1].get_drawings():
            for item in drawing['items']:
                if item[0] != 'l': continue
                a,b=item[1],item[2]
                if abs(a.y-b.y)<=0.5 and abs(a.x-b.x)>=100:
                    rules.append((min(a.x,b.x),a.y,max(a.x,b.x)))
        for heading in blocks:
            ls=heading.get('lines',[]); label=text(heading)
            if not label or len(ls)!=1 or heading.get('typographicUnits') or not re.search(r'[A-Za-z]{3}',label): continue
            line=ls[0]; spans=line.get('spans',[]); size=float(spans[0].get('size') or 0) if spans else 0
            if not any(s in font(line) for s in ('Cinzel','Esmeralda')) or not 10<=size<=30: continue
            screened+=1; x=float(line.get('availableX',line['bbox'][0])); ink=float(line.get('availableWidth',line['bbox'][2]-line['bbox'][0])); bottom=float(line['bbox'][3])
            bodies=[]
            for body in blocks:
                body_text=text(body); body_lines=body.get('lines',[])
                if body is heading or not body_text or not body_lines: continue
                first=min(body_lines,key=lambda q:q['bbox'][1]); gap=float(first['bbox'][1])-bottom
                bx=float(first.get('availableX',first['bbox'][0])); bw=max(float(q.get('availableWidth',q['bbox'][2]-q['bbox'][0])) for q in body_lines)
                if 0<=gap<=32 and abs(bx-x)<=2 and bw>ink*1.6 and ('Optima' in font(first) or len(body_lines)>1): bodies.append((gap,body,bw))
            if not bodies: continue
            gap,body,bw=min(bodies,key=lambda q:q[0]); matched=[]
            for x0,y,x1 in rules:
                width=x1-x0; below=y-bottom
                if abs(x0-x)<=1.5 and -2<=below<=4 and width>ink*1.6 and abs(width-bw)<=max(6,0.02*bw): matched.append((abs(below),x0,y,x1,width))
            rule=min(matched) if matched else None; existing=frames.get(heading.get('id')) or heading.get('layoutFrame')
            proposed=min(rule[4],bw) if rule else bw
            # Full-width title rules terminate beside a decorative flourish;
            # reserve a small horizontal clearance before that ornament.
            if rule and proposed>500: proposed=max(1,proposed-15)
            rows.append({'page':number,'heading_id':heading.get('id'),'heading':label,'font':font(line),'size_pt':size,'x_pt':round(x,3),'ink_width_pt':round(ink,3),'body_id':body.get('id'),'body_width_pt':round(bw,3),'gap_to_body_pt':round(gap,3),'rule_supported':bool(rule),'rule_y_pt':round(rule[2],3) if rule else '', 'rule_width_pt':round(rule[4],3) if rule else '', 'frame_exists':bool(existing),'current_frame_width_pt':round(float(existing.get('width')),3) if existing and existing.get('width') is not None else '', 'proposed_width_pt':round(proposed,3),'proposed_extra_width_pt':round(proposed-ink,3)})
            if apply and rule and not existing:
                frames[heading['id']]={'x':x,'width':proposed,'textAlign':'left'}
                changes.append((number,heading['id'],label,ink,proposed))
        if apply and any(change[0]==number for change in changes):
            frame_path.write_text(json.dumps(frames,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    book.close()
    fields=list(rows[0]) if rows else []
    with (OUT/'candidate-heading-body-pairs.csv').open('w',newline='',encoding='utf-8-sig') as out:
        writer=csv.DictWriter(out,fieldnames=fields); writer.writeheader(); writer.writerows(rows)
    summary={'pages_scanned':102-len(errors),'page_errors':len(errors),'heading_blocks_screened':screened,'heading_body_pairs':len(rows),'pages_with_pairs':len({r['page'] for r in rows}),'rule_supported_pairs':sum(r['rule_supported'] for r in rows),'unframed_rule_supported_pairs':sum(r['rule_supported'] and not r['frame_exists'] for r in rows),'unframed_pairs_without_rule_support':sum(not r['rule_supported'] and not r['frame_exists'] for r in rows),'already_framed_pairs':sum(r['frame_exists'] for r in rows),'applied':len(changes),'applied_pages':sorted({c[0] for c in changes}),'errors':errors,'write':apply}
    (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Audit source-backed horizontal frames for adjacent section headings.')
    parser.add_argument('--apply',action='store_true',help='write only unframed headings supported by matching PDF rule and body width')
    audit(parser.parse_args().apply)

