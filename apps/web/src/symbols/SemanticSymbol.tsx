import { getSemanticSymbol, type SymbolLanguage, type InlineSymbolMetrics } from './semanticSymbols';

/** Shared inline visual for the page, palette and editor character grid. */
export function SemanticSymbol({ id, language, size, color = 'currentColor', preview = false, alignToTop = false, metrics }:
  { id: string; language: SymbolLanguage; size: number; color?: string; preview?: boolean; alignToTop?: boolean; metrics?: InlineSymbolMetrics }) {
  const symbol=getSemanticSymbol(id);
  if (!symbol) return <span className="inline-symbol-unknown" role="img" aria-label={`Unknown symbol: ${id}`} title={id}>⟦{id}⟧</span>;
  const sourceRender = metrics?.renderVariant
    ? symbol.render.variants?.[metrics.renderVariant] ?? symbol.render
    : symbol.render;
  const visual = sourceRender.localized?.[language] ?? sourceRender;
  const width=size*(metrics?.widthEm ?? sourceRender.widthEm)*(visual.widthEm/sourceRender.widthEm);
  const sourceHeight = sourceRender.heightEm ?? sourceRender.widthEm;
  const visualHeight = visual.heightEm ?? sourceHeight;
  const height=size*(metrics?.heightEm ?? sourceHeight)*(visualHeight/sourceHeight);
  const style={display:alignToTop?'block':'inline-block',width,height,verticalAlign:alignToTop?'top':preview ? 'middle' : `${-size*(metrics?.verticalAlignEm ?? visual.verticalAlignEm)}px`,marginInlineStart:metrics?.gapEm ? size*metrics.gapEm : undefined,color, flexShrink:0};
  if (visual.paths && visual.viewBox) return (
    <svg className="inline-semantic-symbol" viewBox={visual.viewBox.join(' ')} style={{...style,overflow:'visible'}}
      role="img" aria-label={symbol.labels[language]} data-symbol-id={id}>
      {visual.paths.map((path,i)=><path key={i} {...path} />)}
    </svg>
  );
  return <img className="inline-semantic-symbol" src={symbol.assetUrl} alt={symbol.labels[language]} draggable={false} data-symbol-id={id}
    style={{...style,clipPath:symbol.render.mask==='circle'?'circle(50% at 50% 50%)':undefined}} />;
}
