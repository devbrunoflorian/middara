/** Narrow opt-in for source-reviewed blocks that gain paragraph fields. */
export function exposesNestedSpanTargets(block: { preserveLegacySpanOverrides?: boolean }) {
  // Called only after the legacy override fallback has selected field mode.
  // Source font-size fragments must not intercept that field's editor target.
  return !block.preserveLegacySpanOverrides;
}

export function hasPreservedLegacySpanOverride(
  block: { preserveLegacySpanOverrides?: boolean; typographicSpanUnits?: { id: string }[] },
  page: number,
  language: 'en' | 'pt-BR',
  has: (key: string) => boolean,
) {
  return !!block.preserveLegacySpanOverrides && (block.typographicSpanUnits ?? []).some(unit =>
    has(`page_${page}_unit_${unit.id}__${language}`),
  );
}

/**
 * Strict diagnostics also accept a saved legacy typographic run when it covers
 * every source line of the newer semantic unit. This keeps diagnostic blanking
 * aligned with the normal renderer's lossless per-line fallback.
 */
export function hasLegacyTypographicUnitOverride(
  block: {
    preserveLegacySpanOverrides?: boolean;
    typographicUnits?: { id: string; field: { lineIds: string[] } }[];
    typographicSpanUnits?: { id: string; spanRefs: string[] }[];
  },
  unit: { id: string; field: { lineIds: string[] } },
  page: number,
  language: 'en' | 'pt-BR',
  has: (key: string) => boolean,
) {
  const targetLines = unit.field.lineIds;
  if (!targetLines.length) return false;
  return (block.typographicSpanUnits ?? []).some(legacyUnit => {
    if (!has(`page_${page}_unit_${legacyUnit.id}__${language}`)) return false;
    const legacyLines = new Set(legacyUnit.spanRefs.map(reference => {
      const separator = reference.lastIndexOf(':');
      return separator >= 0 ? reference.slice(0, separator) : reference;
    }));
    return targetLines.every(lineId => legacyLines.has(lineId));
  });
}
