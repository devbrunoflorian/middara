# Task: promote `fix/pixel-render/overflow` to remote `master`

- **Status:** complete; current feature version is now the local and remote `master`.
- **Branch:** `fix/pixel-render/overflow`
- **Current pushed commit at task start:** `c3d192e` (`docs: record project handoff publication`)

## Goal and user instruction

The user says to treat the current `fix/pixel-render/overflow` version as the master version and asks to force it onto `master`, ignoring the current contents of `master`. Interpret this as moving the remote `master` ref to the current branch tip, not as an ordinary merge that preserves the old master tree.

## Safety and method

1. Review project instructions and current worktree/branch state.
2. Fetch and verify that `origin/master` and `origin/fix/pixel-render/overflow` are the intended refs and record their exact commit IDs.
3. Include/document any in-scope current-session progress changes before promoting the branch; do not silently omit the worktree state.
4. Create a clearly named remote recovery branch at the old `origin/master` tip.
5. Move `origin/master` to the exact reviewed `fix/pixel-render/overflow` commit using `--force-with-lease` against the newly reviewed old master SHA. If the remote moves again after this review, the lease must fail and the operation stops.
6. Verify remote refs and local worktree after the update; record commit IDs and recovery branch here.

## Results

- Committed the current in-scope task records as `0d0b4b6` and pushed `fix/pixel-render/overflow` before promotion.
- The local `master` was `cb4df271fa7d82d7425ded0faba1fbed1c2dfdb1`; it was 23 commits ahead and 21 behind the latest remote tip after fetch.
- The stale remote-tracking ref had been `9dd0b7b`. `git fetch origin` reported GitHub had already force-updated remote `master` from `9dd0b7b` to `da779308fd9b2f2fea456830f44db2013b5c91e1` (`chore: update database state`). The changed database file was not opened or inspected.
- Preserved all relevant pre-promotion tips:
  - Remote latest master: `backup/remote-master-before-overflow-reset-20260930` -> `da779308fd9b2f2fea456830f44db2013b5c91e1`.
  - Remote previous tracked master: `backup/origin-master-before-upstream-rewrite-20260930` -> `9dd0b7b`.
  - Divergent local master: `backup/local-master-before-overflow-reset-20260930` -> `cb4df271fa7d82d7425ded0faba1fbed1c2dfdb1` (kept local; not published because those commits were not on the requested feature branch).
- Used `git push --force-with-lease` expecting remote `master` to remain at the reviewed SHA `da7793...`; GitHub accepted the update. `master`, `fix/pixel-render/overflow`, and both remote refs now point to `0d0b4b6f6377b56fbeeb455bddd6099e56e4838e`.
- Moved the local `master` pointer to the same feature-branch commit after preserving its prior pointer.

The database change on the former remote tip was not merged into the active `master`; it remains accessible through the remote backup branch. This matches the user's instruction to replace the active master contents while keeping recovery points.

## Limitations

This changes the active remote `master` history and can affect other collaborators' checkouts. The old remote and local master pointers remain recoverable through the listed backup refs. No files were deleted from Git history by this operation, and no deployment/release is implied.
