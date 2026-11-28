import { getSemanticSymbol, resolveSymbolRenderForMetrics, type SymbolLanguage, type InlineSymbolMetrics } from './semanticSymbols';

/** Shared inline visual for the page, palette and editor character grid. */
export function SemanticSymbol({ id, language, size, color = 'currentColor', preview = false, alignToTop = false,
  geometryMode = 'inline', metrics }:
  { id: string; language: SymbolLanguage; size: number; color?: string; preview?: boolean; alignToTop?: boolean;
    geometryMode?: 'translatedFlow' | 'inline'; metrics?: InlineSymbolMetrics }) {
  const symbol=getSemanticSymbol(id);
  if (!symbol) return <span className="inline-symbol-unknown" role="img" aria-label={`Unknown symbol: ${id}`} title={id}>⟦{id}⟧</span>;
  const sourceAppearanceRender = metrics?.sourceAppearanceKey
    ? symbol.render.variants?.[metrics.sourceAppearanceKey]
    : undefined;
  const sourceRender = resolveSymbolRenderForMetrics(symbol, metrics);
  const visualLanguage = metrics?.renderLanguage ?? language;
  const visual = sourceRender.localized?.[visualLanguage] ?? sourceRender;
  const useAuditedSourceVector = sourceRender === sourceAppearanceRender
    && !!sourceRender.paths && !!sourceRender.viewBox;
  const inkWidthEm=(metrics?.widthEm ?? sourceRender.widthEm)*(metrics?.sourceAssetUrl ? 1 : visual.widthEm/sourceRender.widthEm);
  const inkWidth=size*inkWidthEm;
  const sourceHeight = sourceRender.heightEm ?? sourceRender.widthEm;
  const visualHeight = visual.heightEm ?? sourceHeight;
  const inkHeight=size*(metrics?.heightEm ?? sourceHeight)*(metrics?.sourceAssetUrl ? 1 : visualHeight/sourceHeight);
  // Reserve the same localized width that the inline art paints. Source-only
  // metrics describe the English occurrence; using them unchanged here lets
  // a wider translated label overpaint the following word. An explicit
  // advanceEm remains authoritative for source-reviewed exceptions.
  const advanceWidth=size*(metrics?.advanceEm ?? inkWidthEm);
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
    if ((useAuditedSourceVector || !metrics?.sourceAssetUrl) && visual.paths && visual.viewBox) return (
      <span className="inline-semantic-symbol-slot" data-geometry-mode={geometryMode} style={slotStyle}>
        <svg className="inline-semantic-symbol" viewBox={visual.viewBox.join(' ')} style={inkStyle}
          role="img" aria-label={symbol.labels[visualLanguage]} data-symbol-id={id}>
          {visual.paths.map((path,i)=><path key={i} {...path} />)}
        </svg>
      </span>
    );
    const visualAssetUrl = 'assetUrl' in visual ? visual.assetUrl : undefined;
    return <span className="inline-semantic-symbol-slot" data-geometry-mode={geometryMode} style={slotStyle}>
      <img className="inline-semantic-symbol" src={metrics?.sourceAssetUrl ?? visualAssetUrl ?? symbol.assetUrl} alt={symbol.labels[visualLanguage]} draggable={false} data-symbol-id={id}
        style={{...inkStyle,clipPath:symbol.render.mask==='circle'?'circle(50% at 50% 50%)':undefined}} />
    </span>;
  }

  const style: React.CSSProperties={
    ...margins,display:alignToTop?'block':'inline-block',width:inkWidth,height:inkHeight,
    verticalAlign:alignToTop?'top':preview ? 'middle' : `${-baselineOffset}px`,
  };
  if ((useAuditedSourceVector || !metrics?.sourceAssetUrl) && visual.paths && visual.viewBox) return (
    <svg className="inline-semantic-symbol" viewBox={visual.viewBox.join(' ')} style={{...style,overflow:'visible'}}
      role="img" aria-label={symbol.labels[visualLanguage]} data-symbol-id={id}>
      {visual.paths.map((path,i)=><path key={i} {...path} />)}
    </svg>
  );
  const visualAssetUrl = 'assetUrl' in visual ? visual.assetUrl : undefined;
  return <img className="inline-semantic-symbol" src={metrics?.sourceAssetUrl ?? visualAssetUrl ?? symbol.assetUrl} alt={symbol.labels[visualLanguage]} draggable={false} data-symbol-id={id}
    style={{...style,clipPath:symbol.render.mask==='circle'?'circle(50% at 50% 50%)':undefined}} />;
}
