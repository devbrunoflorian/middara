# Project progress log

This folder records work by task, including the goal, method, files changed, evidence, corrections made during the task, current status, and next safe step. Records distinguish read-only investigation from changes to app code, production data, and the database.

**Start here when resuming work:** [`CONTINUE-HERE.md`](CONTINUE-HERE.md) is mandatory for every developer and AI agent. It summarizes the product goal, accepted decisions, evidence, active blocker, required reading, and safe next steps.

## Tasks

- [2026-09-30 — Auditoria do baseline dos títulos](2026-09-30-heading-baseline-audit.md): identificar por que os títulos Esmeralda desviam no eixo Y e registrar o limite da validação visual.

- [2026-09-30 — Salvamento Payload e proteção do reset PT](2026-09-30-payload-save-reset-safety.md): conectar o banco de schema atual sem mexer no legado e proteger reset/fechamento de rascunhos em PT.

- [2026-09-30 — Translation editor save point](2026-09-30-translation-editor-save-point.md): zoom/scroll, admin editing, local-first saves, live preview, and the visually approved page 2 frame pilot.
- [2026-09-30 — Sample layout extraction audit](2026-09-30-layout-sample-audit.md): reproducible read-only analysis of credits on page 2, contents entries on page 3, and index rows on page 101.
- [2026-09-30 — Progress documentation rule](2026-09-30-progress-documentation-rule.md): make this task-by-task record mandatory for future work and backfill today's completed tasks.

For new work, add a dated task record before implementation, update it as findings/corrections occur, and close it with the final verification result. Keep implementation-specific architecture decisions in `docs/architecture/` and link them from the task record.

- [2026-09-30 — Translation-key impact dry run](2026-09-30-translation-key-dry-run.md): completed read-only mapping from 253 representative semantic units to current editor keys, before any integration or migration.
- [2026-09-30 — Page 2 credit editor proof](2026-09-30-credit-editor-proof.md): local app servers are running; draft inspection remains blocked by the browser's saved access setting, and no integration has started.
- [2026-09-30 — Project continuation handoff](2026-09-30-project-handoff.md): consolidated the current project state into a required developer/agent handoff and recorded the post-reboot server restart.
- [2026-09-30 — Credit draft compatibility audit](2026-09-30-credit-draft-compatibility-audit.md): read-only source trace to determine whether new semantic credit keys can preserve existing drafts without browser storage access.
- [2026-09-30 — Promote overflow branch to master](2026-09-30-promote-overflow-to-master.md): user-requested replacement of remote `master` with the current feature branch, preserving the old master commit for recovery.
- [2026-09-30 — Broad project read-through](2026-09-30-project-readthrough.md): read-only repository review to explain the actual product, architecture, data flow, and current priorities.

- [2026-09-30 — Live preview e unidades dos créditos](2026-09-30-preview-fidelity-and-credit-units.md): investigar regressões de fidelidade no preview e granularidade de edição dos créditos; plano sem implementação.

- [2026-09-30 — Piloto de preview fiel e campos de crédito](2026-09-30-implement-preview-credit-pilot.md): corrigir no-op visual do editor e validar label/body como campos independentes na página 2; persistência no Payload ainda pendente.

- [2026-09-30 — Unidades independentes dos créditos da página 2](2026-09-30-page2-credit-units.md): ampliar o piloto Playtesters para as 17 categorias mantendo labels, corpos e fallback de chave legada.
