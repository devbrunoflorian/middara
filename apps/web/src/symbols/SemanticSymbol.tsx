import { getSemanticSymbol, type SymbolLanguage, type InlineSymbolMetrics } from './semanticSymbols';

/** Shared inline visual for the page, palette and editor character grid. */
export function SemanticSymbol({ id, language, size, color = 'currentColor', preview = false, alignToTop = false,
  geometryMode = 'inline', metrics }:
  { id: string; language: SymbolLanguage; size: number; color?: string; preview?: boolean; alignToTop?: boolean;
    geometryMode?: 'translatedFlow' | 'inline'; metrics?: InlineSymbolMetrics }) {
  const symbol=getSemanticSymbol(id);
  if (!symbol) return <span className="inline-symbol-unknown" role="img" aria-label={`Unknown symbol: ${id}`} title={id}>⟦{id}⟧</span>;
  const sourceRender = metrics?.renderVariant
    ? symbol.render.variants?.[metrics.renderVariant] ?? symbol.render
    : symbol.render;
  const visual = sourceRender.localized?.[language] ?? sourceRender;
  const inkWidth=size*(metrics?.widthEm ?? sourceRender.widthEm)*(visual.widthEm/sourceRender.widthEm);
  const sourceHeight = sourceRender.heightEm ?? sourceRender.widthEm;
  const visualHeight = visual.heightEm ?? sourceHeight;
  const inkHeight=size*(metrics?.heightEm ?? sourceHeight)*(visualHeight/sourceHeight);
  const advanceWidth=size*(metrics?.advanceEm ?? metrics?.widthEm ?? sourceRender.widthEm);
  const baselineOffset=size*(metrics?.verticalAlignEm ?? visual.verticalAlignEm);
  const inkTopFromTextBaseline=baselineOffset-inkHeight;
  const margins={
    marginInlineStart:metrics?.gapEm ? size*metrics.gapEm : undefined,
    marginInlineEnd:metrics?.trailingGapEm ? size*metrics.trailingGapEm : undefined,
    color,
    flexShrink:0,
  };

  // Keep the PDF-measured ink outside line layout. The zero-height inline slot
  // owns only the text advance; the artwork may overhang the font line box.
  if (!preview && !alignToTop) {
    const slotStyle: React.CSSProperties={
      ...margins,display:'inline-block',position:'relative',width:advanceWidth,height:0,
      verticalAlign:'baseline',overflow:'visible',
    };
    const inkStyle: React.CSSProperties={
      position:'absolute',display:'block',left:0,
      top:inkTopFromTextBaseline,
      width:inkWidth,height:inkHeight,overflow:'visible',
    };
    if (visual.paths && visual.viewBox) return (
      <span className="inline-semantic-symbol-slot" data-geometry-mode={geometryMode} style={slotStyle}>
        <svg className="inline-semantic-symbol" viewBox={visual.viewBox.join(' ')} style={inkStyle}
          role="img" aria-label={symbol.labels[language]} data-symbol-id={id}>
          {visual.paths.map((path,i)=><path key={i} {...path} />)}
        </svg>
      </span>
    );
    const visualAssetUrl = 'assetUrl' in visual ? visual.assetUrl : undefined;
    return <span className="inline-semantic-symbol-slot" data-geometry-mode={geometryMode} style={slotStyle}>
      <img className="inline-semantic-symbol" src={visualAssetUrl ?? symbol.assetUrl} alt={symbol.labels[language]} draggable={false} data-symbol-id={id}
        style={{...inkStyle,clipPath:symbol.render.mask==='circle'?'circle(50% at 50% 50%)':undefined}} />
    </span>;
  }

  const style: React.CSSProperties={
    ...margins,display:alignToTop?'block':'inline-block',width:inkWidth,height:inkHeight,
    verticalAlign:alignToTop?'top':preview ? 'middle' : `${-baselineOffset}px`,
  };
  if (visual.paths && visual.viewBox) return (
    <svg className="inline-semantic-symbol" viewBox={visual.viewBox.join(' ')} style={{...style,overflow:'visible'}}
      role="img" aria-label={symbol.labels[language]} data-symbol-id={id}>
      {visual.paths.map((path,i)=><path key={i} {...path} />)}
    </svg>
  );
  const visualAssetUrl = 'assetUrl' in visual ? visual.assetUrl : undefined;
  return <img className="inline-semantic-symbol" src={visualAssetUrl ?? symbol.assetUrl} alt={symbol.labels[language]} draggable={false} data-symbol-id={id}
    style={{...style,clipPath:symbol.render.mask==='circle'?'circle(50% at 50% 50%)':undefined}} />;
}
