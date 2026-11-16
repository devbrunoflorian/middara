/** Verify snapshot overrides against the exact keyed render target in the Viewer DOM. */
export function verifySnapshotRenderTargets(checks, targets) {
  const normalize = value => String(value ?? '')
    .replace(/\s+/gu, ' ')
    // Source-backed list markers are painted in a separate hanging column.
    // The DOM may concatenate the marker and first word even though the page
    // geometry supplies their visible gap, so compare that separator consistently.
    .replace(/•(?=\S)/gu, '• ')
    .trim();
  return checks.map(check => {
    const keyedTargets = targets.filter(target => target.spanKey === check.spanKey);
    const actual = keyedTargets.map(target => normalize(target.text));
    const matchingTargets = actual.filter(text => text === normalize(check.expected)).length;
    return {
      spanKey: check.spanKey,
      expected: normalize(check.expected),
      targetCount: keyedTargets.length,
      matchCount: keyedTargets.length === 1 && matchingTargets === 1 ? 1 : matchingTargets,
      actual,
    };
  });
}
