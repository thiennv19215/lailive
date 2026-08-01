# Repository Agent Instructions

Read `AGENT_MASTER_PROMPT.md`, `NEW_REPO_FULL_PLAN.md`, and `docs/STATUS.md` before meaningful work.

## Product rules

- Reimplement the reference app at `C:\Users\nguye\Downloads\LivestreamAgent-1.4.0-win-setup-x64\$PLUGINSDIR\app-64` from observation only.
- Treat the reference installation as read-only. Never copy compiled code, proprietary assets, branding, or private native packages.
- Full workflow and behavioral parity is required; screenshots alone are insufficient.
- Keep renderer Node.js access disabled and expose narrow typed preload/IPC methods.
- Bind local scene services only to `127.0.0.1`.
- Keep integrations behind replaceable interfaces with working mock adapters.

## Development rules

- Use `pnpm dev:win` and Vite HMR for routine UI work.
- Do not run installers, signing, auto-update, `electron-builder`, or production packaging unless the user separately approves the final release phase.
- Preserve user changes and inspect `git status` before editing.
- Never commit secrets, cookies, browser profiles, private prompts, user media, logs, or generated databases.
- Run focused tests while coding and full tests at phase gates.
- Update `docs/STATUS.md` after each meaningful work session.
- Do not mark a phase complete until every exit criterion has evidence.
