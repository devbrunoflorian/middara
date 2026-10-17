/** Verify snapshot overrides against the exact keyed render target in the Viewer DOM. */
export function verifySnapshotRenderTargets(checks, targets) {
  const normalize = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
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
