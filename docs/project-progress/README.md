# Project progress log

This folder records work by task, including the goal, method, files changed, evidence, corrections made during the task, current status, and next safe step. Records distinguish read-only investigation from changes to app code, production data, and the database.

**Start here when resuming work:** [`CONTINUE-HERE.md`](CONTINUE-HERE.md) is mandatory for every developer and AI agent. It summarizes the product goal, accepted decisions, evidence, active blocker, required reading, and safe next steps.

## Tasks

- [2026-09-30 — Translation editor save point](2026-09-30-translation-editor-save-point.md): zoom/scroll, admin editing, local-first saves, live preview, and the visually approved page 2 frame pilot.
- [2026-09-30 — Sample layout extraction audit](2026-09-30-layout-sample-audit.md): reproducible read-only analysis of credits on page 2, contents entries on page 3, and index rows on page 101.
- [2026-09-30 — Progress documentation rule](2026-09-30-progress-documentation-rule.md): make this task-by-task record mandatory for future work and backfill today's completed tasks.

For new work, add a dated task record before implementation, update it as findings/corrections occur, and close it with the final verification result. Keep implementation-specific architecture decisions in `docs/architecture/` and link them from the task record.

- [2026-09-30 — Translation-key impact dry run](2026-09-30-translation-key-dry-run.md): completed read-only mapping from 253 representative semantic units to current editor keys, before any integration or migration.
- [2026-09-30 — Page 2 credit editor proof](2026-09-30-credit-editor-proof.md): local app servers are running; draft inspection remains blocked by the browser's saved access setting, and no integration has started.
- [2026-09-30 — Project continuation handoff](2026-09-30-project-handoff.md): consolidated the current project state into a required developer/agent handoff and recorded the post-reboot server restart.
- [2026-09-30 — Credit draft compatibility audit](2026-09-30-credit-draft-compatibility-audit.md): read-only source trace to determine whether new semantic credit keys can preserve existing drafts without browser storage access.
- [2026-09-30 — Promote overflow branch to master](2026-09-30-promote-overflow-to-master.md): user-requested replacement of remote `master` with the current feature branch, preserving the old master commit for recovery.
