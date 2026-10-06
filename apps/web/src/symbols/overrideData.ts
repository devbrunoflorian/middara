import type { SpanOverride } from '../components/RichSpanEditor';

/** Existing Payload JSON envelope; legacy arrays remain readable. */
export function decodeOverrideData(stored:unknown):Pick<SpanOverride,'segments'|'textAlign'|'lineHeight'|'managedSourceSymbols'>|null {
  const data=stored as Partial<SpanOverride>|null;
  const segments=Array.isArray(stored) ? stored : data?.segments;
  if(!Array.isArray(segments))return null;
  return {
    segments,
    textAlign:Array.isArray(stored) ? undefined : data?.textAlign,
    lineHeight:!Array.isArray(stored) && typeof data?.lineHeight === 'number' && Number.isFinite(data.lineHeight)
      ? Math.min(2.5,Math.max(0.6,data.lineHeight)) : undefined,
    managedSourceSymbols:Array.isArray(data?.managedSourceSymbols) ? data.managedSourceSymbols.filter((id):id is string=>typeof id==='string') : undefined,
  };
}

export function encodeOverrideData(override:SpanOverride) {
  return {schemaVersion:2,segments:override.segments,textAlign:override.textAlign,lineHeight:override.lineHeight,managedSourceSymbols:override.managedSourceSymbols};
}
