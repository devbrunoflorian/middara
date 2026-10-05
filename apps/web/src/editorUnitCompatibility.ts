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
