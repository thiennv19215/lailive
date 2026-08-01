# AI Livestream

Windows desktop livestream assistant rebuilt from observed behavior using Electron, Vue 3, TypeScript, Vite, Pinia, and SQLite.

## Local development

Prerequisites: Node.js 20-24 and pnpm 9 or newer.

```powershell
pnpm install
pnpm dev:win
```

The development command launches Electron against the Vite server with HMR. It does not create an installer.

## Validation

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm test:electron-smoke
pnpm test:close-smoke
pnpm test:auxiliary-smoke
pnpm test:active-work-restart
pnpm test:avatar-script-smoke
```

Compare two same-size PNG captures without rescaling either source:

```powershell
pnpm capture:ui -- artifacts/rebuild
pnpm compare:ui -- artifacts/reference/screen.png artifacts/rebuild/screen.png artifacts/comparisons/screen
```

The capture command uses the local Electron renderer and writes true PNG files at the reference desktop pixel size; it does not package the app. The comparison writes `pixel-diff.png`, `overlay-50-50.png`, and `report.json`. A dimension mismatch fails explicitly so unlike-sized captures cannot be presented as parity evidence.

The Electron smoke tests use `http://127.0.0.1:5173/` by default. If that port is intentionally occupied, run the dev server on another port and set `AI_LIVESTREAM_DEV_SERVER_URL` to that exact URL for the smoke command.

The configurable long-session harness defaults to the Phase 13 eight-hour target and uses only app-owned temporary profiles/processes:

```powershell
$env:AI_LIVESTREAM_DEV_SERVER_URL='http://127.0.0.1:5175/'
pnpm test:long-session-soak
```

For a short qualification run, set `AI_LIVESTREAM_SOAK_MINUTES`, `AI_LIVESTREAM_SOAK_INTERVAL_MS`, and `AI_LIVESTREAM_SOAK_FAULT_EVERY`. Optional `AI_LIVESTREAM_SOAK_MAX_HEAP_GROWTH_MB` and `AI_LIVESTREAM_SOAK_MAX_NODE_GROWTH` bounds apply independently to the app renderer and scene-runtime window. A short run validates the harness only and is not eight-hour evidence.

`pnpm test:active-work-restart` force-terminates only its isolated Electron process while TTS playback and a debounced autosave are active, then verifies clean queue state, valid persisted scene data, stale-lock recovery, and final cleanup.

`pnpm test:avatar-script-smoke` verifies configured-provider generation, exact request cancellation through a delayed loopback provider, draft-only Cancel behavior, Save/autosave, Electron restart persistence, and profile/lock cleanup.

For browser-only visual QA without the Electron plugin lifecycle:

```powershell
$env:AI_LIVESTREAM_RENDERER_ONLY='1'
pnpm exec vite --host 127.0.0.1 --port 5174
```

See `docs/STATUS.md` for the current implementation status and known gaps.
# lailive
