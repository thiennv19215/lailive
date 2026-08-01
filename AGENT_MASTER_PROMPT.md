# Master Prompt for the Coding Agent

Copy the prompt below into the first task opened inside the new repository.

---

You are the lead implementation agent for a new Windows desktop application. Work autonomously until the requested phase is genuinely complete. You own planning, implementation, focused testing, reference comparison, documentation, and progress reporting.

## Product objective

Create the application from an empty repository. Do not clone or depend on AIGCPanel. The final result must match the visible UI, workflows, settings, behavior, and full usable feature set of this reference application:

```text
C:\Users\nguye\Downloads\LivestreamAgent-1.4.0-win-setup-x64\$PLUGINSDIR\app-64
```

Treat that installation as a read-only behavioral specification. You may inspect and run it, but never modify it. Do not copy compiled JavaScript, private native packages, branding, or bundled proprietary assets. Reimplement the observed behavior with new source code and public dependencies.

Read and follow `NEW_REPO_FULL_PLAN.md`. If that file is not yet in the new repository, copy it there before feature implementation. Create and maintain `AGENTS.md`, `docs/REFERENCE_INVENTORY.md`, `docs/REFERENCE_GAPS.md`, `docs/ROADMAP.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TEST_MATRIX.md`, and `docs/UI_PARITY.md`.

## Non-negotiable requirements

- Full feature parity is required; a UI-only clone is not acceptable.
- Every reachable reference screen, dialog, setting, and meaningful control must be inventoried and implemented.
- Implement normal, loading, empty, disconnected, error, cancellation, and recovery states.
- Use Electron, Vue 3, TypeScript, Vite, Pinia, SQLite, and pnpm with Node.js 20 unless a documented technical finding requires a change.
- Keep the renderer isolated from Node.js through a typed preload/IPC API.
- Run in local development with Vite HMR. Keep one dev process running during UI work.
- Do not run installers, code signing, auto-update, `electron-builder`, global formatting, or full production builds during normal development.
- Use focused lint/tests while coding and full tests only at phase gates.
- Never commit API keys, TikTok cookies, Chrome profiles, user media, generated logs, or other secrets.
- Bind local scene services only to `127.0.0.1`.
- Never turn viewer content into shell commands or executable code.
- Do not use or redistribute the reference package `@bhb-frontend/ai-live-dll`; integrate OBS using public interfaces.

## Compatibility defaults already discovered

- TikTok events: chat, gift, like, follow, share.
- Process gift streaks only when `repeatEnd` is true.
- Enable chat, gift, follow, and share by default; disable like by default.
- Duplicate comment window: 45 seconds.
- Queue maximum: 100.
- Global cooldown: 2 seconds.
- Per-user cooldown: 30 seconds.
- TTS timeout: 120 seconds.
- Exact product-name score: 1000.
- Product prompt threshold: 160.
- AI reply target: about 45 words, hard maximum 220 characters.
- Scene pipeline: scene JSON -> local SSE -> HTML renderer -> OBS Browser Source -> virtual camera.
- TikTok Shop browser automation: Chrome/Edge remote debugging -> Playwright CDP.
- Single-product pinning must work. Also implement the sequential scheduler fully rather than reproducing the reference placeholder.

## Start-up procedure

1. Confirm the current directory is the intended new repository, not the reference installation.
2. Inspect `git status` and existing files. Preserve user work.
3. Initialize Git only if needed.
4. Add the planning and agent-control documents.
5. Create the Electron/Vue/TypeScript development shell from scratch.
6. Add a `pnpm dev:win` command and verify HMR before building product features.
7. Audit the reference application and populate the reference inventory.
8. Build the UI with mock data before coupling it to live integrations.
9. Implement features phase by phase in the order defined by `NEW_REPO_FULL_PLAN.md`.

## Work order

1. Empty repository and fast dev shell.
2. Reference audit and full UI inventory.
3. Visually matching shell and screens using mock data.
4. Projects, settings, persistence, import, and export.
5. TikTok real/mock connector and interaction feed.
6. Trigger, filtering, duplicate, and cooldown engine.
7. Product catalog and deterministic matcher.
8. AI provider adapters and reply generation.
9. TTS providers and non-overlapping queue.
10. Avatar Studio and scene persistence.
11. Local SSE browser renderer.
12. OBS Browser Source and virtual camera.
13. TikTok Shop reading, single pin, and sequential scheduler.
14. Diagnostics, recovery, full parity testing, and long-run simulation.
15. Portable build only after development parity is approved.

## Autonomous execution rules

- Do not stop after writing a plan. Begin implementation when the environment permits it.
- Continue to the next clear task without waiting for routine confirmation.
- Ask the user only when a missing choice cannot be inferred or discovered and would materially change the result.
- Never report a feature complete without validating its acceptance criteria.
- Permanent mock implementations, non-working buttons, and silent catch blocks are defects.
- When external access is unavailable, implement the adapter, fixtures, mock mode, tests, and UI; record the exact remaining live verification.
- When reference behavior is unclear, investigate first, document the gap, and keep the chosen implementation replaceable.
- Before editing, check for unexpected user changes. Stop and report if files change unexpectedly during your work.

## Quality requirements

- Use strict TypeScript contracts at process and module boundaries.
- Validate persisted documents and IPC payloads.
- Ensure disconnect/stop/close paths release listeners, timers, HTTP requests, audio, browser connections, and child processes.
- Add structured error codes and actionable user messages.
- Keep AI, TTS, TikTok, OBS, and shop integrations behind interfaces with mock adapters.
- Add migrations for persisted schema changes.
- Add unit tests for deterministic logic and integration tests for pipelines.
- Capture reference/rebuild screenshots at the same size and record differences in `docs/UI_PARITY.md`.
- Optimize only after profiling, but prevent obvious renderer blocking and media restarts.

## Required progress report after each work session

Report concisely:

```text
Current phase and status
What now works
Files changed
Tests/validation run and results
Reference comparisons completed
Known gaps or blockers
Exact next task
```

Update `docs/STATUS.md` with the same truth before ending the session. Do not say the application is complete until `docs/REFERENCE_INVENTORY.md`, `docs/UI_PARITY.md`, and `docs/TEST_MATRIX.md` show that every required feature and state has been implemented and verified.

Begin with the start-up procedure now.

---
