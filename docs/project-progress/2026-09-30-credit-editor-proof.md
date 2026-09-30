# Task: page 2 credit editor proof and local draft safety

- **Status:** in progress; local draft inspection is blocked by the browser's saved access setting. No editor integration has started.
- **Branch:** `fix/pixel-render/overflow`
- **Starting commit:** `a8eae78` (`Fix viewer scroll and add translation frame pilot`)

## Goal

Prepare the smallest usable proof for editing one page 2 credit category as a semantic unit, while preserving its source label/body styles and keeping existing combined translation keys and browser drafts recoverable.

## Planned method

1. Read the current page 2 DOM, optional layout sidecar, renderer/editor persistence flow, sample credit units, and their key-impact map.
2. Inspect only the relevant browser-local draft keys/metadata in read-only mode, if browser inspection is available. Do not export unrelated local storage or alter any browser state.
3. Decide the compatibility contract before coding: current combined key remains intact; new unit keys must be stable and separate; old drafts must remain retrievable and must never be silently split or overwritten.
4. If the contract is concrete, implement the smallest page 2 credit proof, with structured label/body styling and an isolated semantic selection. Preserve the existing page JSON and current key construction for all unrelated blocks.
5. Verify builds or focused checks only when implementation changes warrant them; create an app state that the user can inspect before asking for visual confirmation.

## Safety limits

Do not migrate Payload keys, batch-extract the 102 pages, overwrite browser drafts, or inspect unrelated translation text. If existing local draft compatibility cannot be proven, pause before any dependent write or activation and report the exact blocker.

## Corrections

- The first attempt to snapshot and open this task used a PowerShell batch whose quoting caused a parser error; PowerShell parsed no commands and created no files. The snapshot and task record were then created in separate, verified steps.
- The in-app browser denied opening `http://127.0.0.1:8080/` because a saved user permission setting blocks that local URL. Per the browser security response, no alternate browser surface, raw CDP, command, or workaround was attempted.
- A progress-record patch used stale text context and did not apply; the record was reread and updated against its current contents.

## Results

- Confirmed the app server/browser tab is not available in the current CUA inventory after the PC restart.
- Attempted to reopen the local app through the in-app browser; the saved access setting denied it before navigation.
- No browser `localStorage` was read, changed, or exported. No app source, production page JSON, Payload record, or database was modified for this task.
- The user authorized starting the app and asked whether `npm run dev` is the correct command. The root script starts the API and then stalls before starting Vite on this Windows shell because of the `&` separator.
- Started the Payload/Next API with `npm run dev`; it is ready at `http://localhost:3000` (terminal session 86574).
- Started Vite separately with `npm run dev:web`; it is ready at `http://localhost:8080/` (terminal session 86467).
- The browser security preference still blocks the agent from opening the local URL. Server output confirms readiness, but the agent did not navigate to or inspect the page.
- Checked the current official desktop-browser help article. It places site allow/block controls at `Settings > Browser`; workspace policy can still override personal site settings. The user was given steps to allow only the local frontend origin, without enabling full CDP/developer access.
- The user couldn't match the first instructions to the English UI. Clarified the literal English labels (`Settings`, `Browser`, allowed/blocked websites) and offered screenshot-guided help; this session has browser control but no native Codex settings control.
- The user supplied the exact Browser settings labels. The relevant controls are `Let ChatGPT control the built-in browser`, `Local URL open destination`, and `Agent permissions` (site-specific exceptions); `Site settings` is only camera/microphone. Gave targeted, least-scope navigation guidance without asking to enable CDP.
- The user showed that both `127.0.0.1:3000` and `127.0.0.1:8080` are listed in `Agent permissions`. The copied table omitted column headers and cell states, so it does not prove either site's effective permission. Requested a screenshot of the table/details before advising which site-specific setting to change.
- The user explicitly clarified that Browser Use is allowed and only uploads/downloads are restricted, and asked to resume the task. Retry the exact frontend origin once through the normal in-app browser flow; do not use uploads/downloads or any alternate access route.
- Retried `http://127.0.0.1:8080/` in the built-in browser after the user's clarification. The browser security layer still rejected the exact origin with `A saved user permission setting blocks this action`. This denial is separate from upload/download permissions; no alternate browser or indirect route was attempted.
- The user shared the Agent permissions screenshot. It shows `http://127.0.0.1:3000` Browsing set to `Always allow`, while `http://127.0.0.1:8080` Downloads is `Requires approval`; the frontend's Browsing cell is obscured by the open menu, so its state cannot be read. The actionable next setting is the `Browsing` dropdown on the 8080 row; keep Downloads restricted.
- The user now confirms `127.0.0.1:8080` is allowed and the ambient UI reports that the in-app browser already has this URL open. Reinspect the normal built-in browser state and, if the tab is available, continue in that exact tab rather than opening another surface. Do not use firewall edits, alternate browser surfaces, or access-policy workarounds.
- Current CUA inventory now lists three in-app browser tabs at `http://127.0.0.1:8080/`, each titled `This site can't be reached`. One attempt to bind to an existing tab was rejected because its page is the browser's internal error protocol. Next, make one normal exact-origin navigation attempt to distinguish website permission from local-server reachability; do not switch browser surfaces or use developer commands.
- After the user's explicit clarification that 8080 is allowed and CDP was enabled, a fresh exact-origin navigation was still rejected with `A saved user permission setting blocks this action`. The visible settings and Browser Use enforcement disagree. The browser policy prohibits alternate surfaces, raw CDP/commands, or other workarounds; no settings, firewall, or server-binding change was attempted. Safe recovery is to refresh the desktop app's permission state (fully restart Codex) or use a user-provided screenshot of the app if it opens locally for them.
- The user offered permission to change Windows Firewall. The actual denial names Codex's saved Browser Use permission, not a network/firewall failure, and browser policy explicitly forbids bypassing it through another route. No firewall rule was changed; doing so would not resolve the reported permission gate.
- User asked me to retry now. Check the current built-in browser state and attempt only the exact allowed frontend origin through the normal browser flow; stop if the same policy denial remains.
- Retried the exact `http://127.0.0.1:8080/` origin once through the normal in-app browser API. The browser again rejected it with `A saved user permission setting blocks this action`; stopped immediately as required. No Chrome tab, CDP, terminal/network request, firewall, app code, draft, or database was touched during this retry.
- Following a full PC restart, the user correctly noted that the local app processes likely needed to be started again. Checked ports 3000/8080; neither was listening. Started `npm run dev:api` and `npm run dev:web` separately (the root combined `dev` script previously did not reliably start both on Windows). Next.js reported ready at `http://localhost:3000`; Vite reported ready at `http://localhost:8080/`. `Get-NetTCPConnection` confirmed listeners on ports 3000 and 8080.
- The browser denial occurred before these processes were restarted and was an explicit saved-permission rejection, not a connection failure. Did not retry browser navigation after startup because the saved Browser Use permission had not changed; no alternate surface or network path was used.
- Added a project continuation handoff at `docs/project-progress/CONTINUE-HERE.md` and a mandatory `.agents` instruction for every developer/AI agent to read it before starting or resuming work. The handoff includes the user goal, accepted decisions, audit evidence, current browser blocker, dev-server commands, document reading order, and safe next steps. This task remains in progress.

## Verification

- Read the computer-use skill and CUA browser API instructions before inspecting browser state.
- `cua.getState()` returned no active app browser tabs.
- `cua.createBrowserTab()` was rejected by the app's saved security preference. The denial explicitly forbids indirect execution or trying another browser surface.
- Latest retry returned the same saved-permission denial despite the user's reported allow setting; this remains an app-level Browser Use permission-state mismatch, not evidence that the Vite server is down.
- After PC restart, both local processes were absent. Restarted API and frontend successfully, and verified both ports are listening. Browser access itself remains unverified because of the saved-permission denial.
- The root script output confirmed Next.js readiness on port 3000; the Vite script output confirmed readiness on port 8080.
- After the latest reboot, `npm run dev:api` and `npm run dev:web` both reached ready state; listener check found port 3000 on `::` and port 8080 on `::1`.
- Official reference for the setting path: [Using the built-in browser in the ChatGPT desktop app](https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app).

## Next step

Continue with the read-only source compatibility audit in [`2026-09-30-credit-draft-compatibility-audit.md`](2026-09-30-credit-draft-compatibility-audit.md). Do not implement or activate the split credit units until source-level compatibility and draft-preservation behavior are addressed. If a concrete page 2 proof is later built, request visual confirmation before generalizing to pages 3 or 101.
