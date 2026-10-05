"""Read-only cmap inventory and source glyph gallery for installed/local fonts."""
from pathlib import Path
import json
import unicodedata
from fontTools.ttLib import TTFont, TTCollection
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image, ImageDraw
import pymupdf as fitz

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/project-progress/evidence/2026-10-04-inline-elements'
FONT_DIRS=[ROOT/'apps/web/public/fonts',Path('C:/Windows/Fonts'),Path.home()/'AppData/Local/Microsoft/Windows/Fonts']

def font_name(font,ids):
    for id in ids:
        names=[n.toUnicode() for n in font['name'].names if n.nameID==id]
        if names:return names[0]
    return ''

def glyph_png(font,name):
    gs=font.getGlyphSet();bounds=BoundsPen(gs);gs[name].draw(bounds)
    if not bounds.bounds:return None
    a,b,c,d=bounds.bounds;pen=SVGPathPen(gs);gs[name].draw(pen)
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="{a-20} {-d-20} {c-a+40} {d-b+40}"><path transform="scale(1,-1)" fill="black" d="{pen.getCommands()}"/></svg>'
    doc=fitz.open('svg',svg.encode());pix=doc[0].get_pixmap(alpha=True)
    return Image.frombytes('RGBA',(pix.width,pix.height),pix.samples)

def main():
    OUT.mkdir(parents=True,exist_ok=True);rows=[];errors=[];galleries=[]
    for directory in FONT_DIRS:
        for path in sorted(directory.glob('*')):
            if path.suffix.lower() not in ('.ttf','.otf','.ttc'):continue
            try:
                collection=TTCollection(path,lazy=True) if path.suffix.lower()=='.ttc' else None
                fonts=collection.fonts if collection else [TTFont(path,lazy=True)]
                for face,font in enumerate(fonts):
                    cmap={cp:name for table in font['cmap'].tables if table.isUnicode() or (table.platformID==3 and table.platEncID==0) for cp,name in table.cmap.items()}
                    special={f'U+{cp:04X}':name for cp,name in cmap.items() if unicodedata.category(chr(cp)) in ('Co','So','Sm','Sk')}
                    family=font_name(font,[16,1]);row=dict(path=path.as_posix(),face=face,family=family,postscript=font_name(font,[6]),glyphs=font['maxp'].numGlyphs,cmapEntries=len(cmap),specialCmap=special)
                    rows.append(row)
                    if directory==FONT_DIRS[0] and any(x in family.lower() for x in ('webdings','wingdings')) and 'p63' not in path.name.lower():
                        entries=[(cp,name) for cp,name in sorted(cmap.items()) if name not in ('.notdef','space')]
                        sheet=Image.new('RGB',(16*64,((len(entries)+15)//16)*72),'#f6f1e6');draw=ImageDraw.Draw(sheet)
                        for index,(cp,name) in enumerate(entries):
                            x=index%16*64;y=index//16*72;glyph=glyph_png(font,name)
                            if glyph:sheet.paste(glyph,(x+11,y+4),glyph)
                            draw.text((x+3,y+49),f'{cp:04X}',fill='black')
                        name=path.stem+'-cmap.png';sheet.save(OUT/name);galleries.append(name)
                    if not collection:font.close()
                if collection:collection.close()
            except Exception as exc:errors.append(dict(path=path.as_posix(),error=str(exc)))
    report=dict(directories=[p.as_posix() for p in FONT_DIRS],faces=rows,errors=errors,galleries=galleries,interpretation='cmap presence proves mapping availability, not visual equality to a PDF vector; symbol-font codepoints depend on cmap encoding')
    (OUT/'fonts-installed.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(dict(faces=len(rows),projectFaces=sum(r['path'].startswith(FONT_DIRS[0].as_posix()) for r in rows),errors=len(errors),galleries=galleries)))

if __name__=='__main__':main()
