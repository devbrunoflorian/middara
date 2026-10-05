/** Narrow opt-in for source-reviewed blocks that gain paragraph fields. */
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
