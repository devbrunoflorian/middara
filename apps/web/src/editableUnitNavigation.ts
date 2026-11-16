/** Return active editor hit targets in the same order they are rendered. */
export function getEditableNavigationTargets(root: ParentNode): HTMLElement[] {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('[data-editable-unit-key]'))
    .filter(element => {
      const key = element.dataset.editableUnitKey?.trim();
      if (!key || element.closest('[hidden], [aria-hidden="true"], [data-ghost-status="confirmed-duplicate"]')) return false;

      const lines = Array.from(element.querySelectorAll<HTMLElement>('[data-source-line-id]'));
      if (lines.length > 0 && lines.every(line => line.dataset.ghostStatus === 'confirmed-duplicate')) return false;

      return true;
    });

  const candidateSet = new Set(candidates);
  const parentFallbacks = new Set<HTMLElement>();
  candidates.forEach(child => {
    // Prefer the real editorial child targets over the visual-block fallback
    // that contains them. The parent remains clickable in the viewer, but it
    // would duplicate every child in the translation navigation order.
    let ancestor = child.parentElement;
    while (ancestor) {
      if (candidateSet.has(ancestor)
        && ancestor.dataset.editableUnitKey !== child.dataset.editableUnitKey) parentFallbacks.add(ancestor);
      ancestor = ancestor.parentElement;
    }
  });

  return candidates.filter(element => !parentFallbacks.has(element)).filter((element, index, targets) =>
    targets.findIndex(candidate => candidate.dataset.editableUnitKey === element.dataset.editableUnitKey) === index,
  );
}

export function getEditableNavigationIndex(targets: HTMLElement[], selectedKey: string | null): number {
  return selectedKey ? targets.findIndex(target => target.dataset.editableUnitKey === selectedKey) : -1;
}
