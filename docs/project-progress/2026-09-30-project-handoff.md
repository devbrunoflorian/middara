# Task: durable project handoff and mandatory reading rule

- **Status:** complete; handoff and mandatory reading rule are ready for commit/push.
- **Branch:** `fix/pixel-render/overflow`
- **Baseline:** `a8eae78` (`Fix viewer scroll and add translation frame pilot`)

## Goal

Make it possible for a new developer or AI agent to continue the Rulebook App work from the repository alone, without depending on chat history. Document the product goal, established decisions, audit evidence, current blocker, required reading, working state, and safe next steps. Make reading this handoff a persistent project requirement.

## Method and scope

- Reviewed the current project progress index, mandatory AI behavior rule, project README, active credit-proof task record, sample audit reports, key-impact mapping, layout-frame architecture, and working-tree status.
- Consolidated the current state in `docs/project-progress/CONTINUE-HERE.md`, linking authoritative task records and architecture reports instead of duplicating their full contents.
- Updated `.agents/rules/13-registro-de-progresso-por-tarefa.md` and `.agents/rules/00-README.md` so every developer and AI agent must read the handoff and active task record before beginning or resuming work.
- Linked the handoff from the root README and progress index.
- Restarted the API and frontend after the user's PC reboot; confirmed both ready states and listening ports. The saved in-app browser permission still blocks inspection, so no browser data was accessed.
- Added `tmp/` to `.gitignore`; it contains regenerable audit output and rendered page crops, not maintained source or canonical reports. The scripts and committed Markdown reports remain the durable evidence.

## Results and current state

- The handoff describes the user goal as practical translation progress with fidelity, rather than a speculative full-scale extraction rewrite.
- It separates confirmed pilot behavior from audit-only hypotheses and clearly records the three-page sample results and translation-key fanout risks.
- It records that no browser-local draft was inspected, so a single-category credit editor proof must not be activated until old draft compatibility is addressed.
- It documents separate Windows startup commands: `npm run dev:api` (port 3000) and `npm run dev:web` (port 8080). It notes that the root combined script did not reliably start both in the current Windows shell.
- The app source, production page JSON, Payload records, and database were not modified by this handoff task.

## Verification

- Confirmed branch `fix/pixel-render/overflow` and baseline `a8eae78` before preparing this handoff.
- Confirmed Next/Payload reported ready at `http://localhost:3000`, Vite reported ready at `http://localhost:8080/`, and Windows listener inspection found both ports listening.
- Re-read the new handoff, mandatory reading rule, and updated indexes; ran `git diff --check` before commit.
- No app build or feature tests were run because this task changes documentation and ignore policy only; no app implementation was changed.

## Limitations and next task

Browser inspection remains unavailable because the in-app browser's saved permission policy rejects the local URL and forbids alternate access routes. If it is still blocked, use only a user-provided screenshot or relevant draft key names/counts; do not try Chrome/CDP/terminal access or change the firewall.

Resume `2026-09-30-credit-editor-proof.md` after reading [`CONTINUE-HERE.md`](CONTINUE-HERE.md). Keep the proof limited to one page 2 credit category, retain the old combined key/value, and do not migrate keys, activate split units, or batch-process pages until compatibility and visual behavior are proven.

## Commit/push state

User requested a commit and previously authorized pushing. Commit and push are pending final staged-file review and successful repository checks.
