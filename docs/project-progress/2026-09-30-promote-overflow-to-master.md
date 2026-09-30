# Task: promote `fix/pixel-render/overflow` to remote `master`

- **Status:** in progress; inspect refs and preserve a recovery ref before updating `master`.
- **Branch:** `fix/pixel-render/overflow`
- **Current pushed commit at task start:** `c3d192e` (`docs: record project handoff publication`)

## Goal and user instruction

The user says to treat the current `fix/pixel-render/overflow` version as the master version and asks to force it onto `master`, ignoring the current contents of `master`. Interpret this as moving the remote `master` ref to the current branch tip, not as an ordinary merge that preserves the old master tree.

## Safety and method

1. Review project instructions and current worktree/branch state.
2. Fetch and verify that `origin/master` and `origin/fix/pixel-render/overflow` are the intended refs and record their exact commit IDs.
3. Include/document any in-scope current-session progress changes before promoting the branch; do not silently omit the worktree state.
4. Create a clearly named remote recovery branch at the old `origin/master` tip.
5. Move `origin/master` to the exact reviewed `fix/pixel-render/overflow` commit using `--force-with-lease` against the recorded old master SHA. Never force if the remote moved unexpectedly.
6. Verify remote refs and local worktree after the update; record commit IDs and recovery branch here.

## Results

Pending.

## Limitations

This changes the active remote `master` history and can affect other collaborators' checkouts. The old master commit should remain recoverable through the backup branch. No files are deleted from Git history by this operation, and no deployment/release is implied.
