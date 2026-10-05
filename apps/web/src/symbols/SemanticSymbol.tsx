import { getSemanticSymbol, type SymbolLanguage, type InlineSymbolMetrics } from './semanticSymbols';

/** Shared inline visual for the page, palette and editor character grid. */
export function SemanticSymbol({ id, language, size, color = 'currentColor', preview = false, metrics }:
  { id: string; language: SymbolLanguage; size: number; color?: string; preview?: boolean; metrics?: InlineSymbolMetrics }) {
  const symbol=getSemanticSymbol(id);
  if (!symbol) return <span className="inline-symbol-unknown" role="img" aria-label={`Unknown symbol: ${id}`} title={id}>⟦{id}⟧</span>;
  const width=size*(metrics?.widthEm ?? symbol.render.widthEm);const height=size*(metrics?.heightEm ?? symbol.render.heightEm ?? symbol.render.widthEm);
  const style={display:'inline-block',width,height,verticalAlign:preview ? 'middle' : `${-size*(metrics?.verticalAlignEm ?? symbol.render.verticalAlignEm)}px`,color, flexShrink:0};
  if (symbol.render.paths && symbol.render.viewBox) return (
    <svg className="inline-semantic-symbol" viewBox={symbol.render.viewBox.join(' ')} style={{...style,overflow:'visible'}}
      role="img" aria-label={symbol.labels[language]} data-symbol-id={id}>
      {symbol.render.paths.map((path,i)=><path key={i} {...path} />)}
    </svg>
  );
  return <img className="inline-semantic-symbol" src={symbol.assetUrl} alt={symbol.labels[language]} draggable={false} data-symbol-id={id}
    style={{...style,clipPath:symbol.render.mask==='circle'?'circle(50% at 50% 50%)':undefined}} />;
}
