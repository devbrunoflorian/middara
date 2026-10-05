import type { SpanOverride } from '../components/RichSpanEditor';

/** Existing Payload JSON envelope; legacy arrays remain readable. */
export function decodeOverrideData(stored:unknown):Pick<SpanOverride,'segments'|'textAlign'|'managedSourceSymbols'>|null {
  const data=stored as Partial<SpanOverride>|null;
  const segments=Array.isArray(stored) ? stored : data?.segments;
  if(!Array.isArray(segments))return null;
  return {
    segments,
    textAlign:Array.isArray(stored) ? undefined : data?.textAlign,
    managedSourceSymbols:Array.isArray(data?.managedSourceSymbols) ? data.managedSourceSymbols.filter((id):id is string=>typeof id==='string') : undefined,
  };
}

export function encodeOverrideData(override:SpanOverride) {
  return {schemaVersion:2,segments:override.segments,textAlign:override.textAlign,managedSourceSymbols:override.managedSourceSymbols};
}
