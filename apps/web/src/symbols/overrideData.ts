import type { SpanOverride } from '../components/RichSpanEditor';

/** Existing Payload JSON envelope; legacy arrays remain readable. */
export function decodeOverrideData(stored:unknown):Pick<SpanOverride,'segments'|'textAlign'|'lineHeight'|'printLineHeight'|'printParagraphSpacingPt'|'lineHeightMode'|'managedSourceSymbols'|'paragraphSpacingPt'|'listMarkerIndentPt'|'hangingIndentPt'>|null {
  const data=stored as Partial<SpanOverride>|null;
  const segments=Array.isArray(stored) ? stored : data?.segments;
  if(!Array.isArray(segments))return null;
  return {
    segments,
    textAlign:Array.isArray(stored) ? undefined : data?.textAlign,
    lineHeight:!Array.isArray(stored) && typeof data?.lineHeight === 'number' && Number.isFinite(data.lineHeight)
      ? Math.min(2.5,Math.max(0.6,data.lineHeight)) : undefined,
    printLineHeight:!Array.isArray(stored) && typeof data?.printLineHeight === 'number' && Number.isFinite(data.printLineHeight)
      ? Math.min(2.5,Math.max(0.6,data.printLineHeight)) : undefined,
    printParagraphSpacingPt:!Array.isArray(stored) && typeof data?.printParagraphSpacingPt === 'number' && Number.isFinite(data.printParagraphSpacingPt)
      ? Math.max(0, data.printParagraphSpacingPt) : undefined,
    lineHeightMode:!Array.isArray(stored) && (data?.lineHeightMode === 'source' || data?.lineHeightMode === 'custom')
      ? data.lineHeightMode : undefined,
    managedSourceSymbols:Array.isArray(data?.managedSourceSymbols) ? data.managedSourceSymbols.filter((id):id is string=>typeof id==='string') : undefined,
    paragraphSpacingPt:!Array.isArray(stored) && typeof data?.paragraphSpacingPt === 'number' && Number.isFinite(data.paragraphSpacingPt)
      ? Math.max(0, data.paragraphSpacingPt) : undefined,
    listMarkerIndentPt:!Array.isArray(stored) && typeof data?.listMarkerIndentPt === 'number' && Number.isFinite(data.listMarkerIndentPt)
      ? Math.max(-24, Math.min(100, data.listMarkerIndentPt)) : undefined,
    hangingIndentPt:!Array.isArray(stored) && typeof data?.hangingIndentPt === 'number' && Number.isFinite(data.hangingIndentPt)
      ? Math.max(0, Math.min(100, data.hangingIndentPt)) : undefined,
  };
}

export function encodeOverrideData(override:SpanOverride) {
  return {schemaVersion:2,segments:override.segments,textAlign:override.textAlign,lineHeight:override.lineHeight,printLineHeight:override.printLineHeight,
    printParagraphSpacingPt:override.printParagraphSpacingPt,
    lineHeightMode:override.lineHeightMode,managedSourceSymbols:override.managedSourceSymbols,paragraphSpacingPt:override.paragraphSpacingPt,
    listMarkerIndentPt:override.listMarkerIndentPt,hangingIndentPt:override.hangingIndentPt};
}
