/**
 * Derive the custom line height used by isolated proof snapshots from PDF
 * source geometry. Never assume that `1` matches a page's source leading.
 */

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

export function deriveSourceLineHeight(block) {
  const spans = (block.lines ?? []).flatMap((line) => line.spans ?? []);
  const sourceTextSizes = spans
    .filter((span) => span.text?.trim() && Array.isArray(span.origin)
      && span.origin.length === 2 && !span.semanticSymbolId)
    .map((span) => span.size)
    .filter((size) => Number.isFinite(size) && size > 0);

  const sourceBaselines = [...new Set(spans
    .filter((span) => Array.isArray(span.origin) && span.origin.length === 2)
    .map((span) => span.origin[1])
    .filter(Number.isFinite))].sort((a, b) => a - b);
  const baselineSteps = sourceBaselines.slice(1)
    .map((baseline, index) => baseline - sourceBaselines[index])
    .filter((step) => step > 8 && step < 30);

  let method = 'span-origin-baselines';
  let lineSteps = baselineSteps;
  let textSizes = sourceTextSizes;
  if (!lineSteps.length || !textSizes.length) {
    method = 'line-bbox-top-fallback';
    const lineTops = [...new Set((block.lines ?? [])
      .map((line) => line.bbox?.[1])
      .filter(Number.isFinite))].sort((a, b) => a - b);
    lineSteps = lineTops.slice(1)
      .map((top, index) => top - lineTops[index])
      .filter((step) => step > 8 && step < 30);
    textSizes = spans
      .filter((span) => span.text?.trim() && !span.semanticSymbolId)
      .map((span) => span.size)
      .filter((size) => Number.isFinite(size) && size > 0);
  }

  const medianStep = median(lineSteps);
  const medianFontSize = median(textSizes);
  if (!medianStep || !medianFontSize) {
    throw new Error(`Cannot derive source line height for block ${block.id ?? '(unknown)'}`);
  }
  const lineHeight = medianStep / medianFontSize;
  if (!Number.isFinite(lineHeight) || lineHeight < 0.9 || lineHeight > 1.6) {
    throw new Error(`Implausible source line height ${lineHeight} for block ${block.id ?? '(unknown)'}`);
  }
  return {
    lineHeight,
    method,
    medianStepPt: medianStep,
    medianFontSizePt: medianFontSize,
    sourceBaselineCount: sourceBaselines.length,
    sourceLineCount: (block.lines ?? []).length,
  };
}
