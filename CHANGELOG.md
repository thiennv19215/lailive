# Changelog

## OBS-inspired UI pass - LIVE CONTROL

### Files changed

- `src/pages/LiveControlPage.vue`: reworked the manual control surface into a denser OBS-inspired dock layout with a compact program toolbar, charcoal panels, clearer transport states, and a dedicated output/status dock.

### Reason

- Optimize the operator workflow for live use: keep video/audio controls visible together, reduce decorative spacing, and make transport/output health readable at a glance.

### Impact

- Renderer-only change; existing controllers, IPC, Scene Runtime, import flows, and playback independence are unchanged.
- Responsive layout remains available for tablet/mobile widths.

### Test / validation

- `pnpm typecheck` passed.
- `pnpm exec eslint src/pages/LiveControlPage.vue` passed.
- Browser verification passed at `http://127.0.0.1:5173/#/live-control`: rendered page, no console errors, and Loop toggled `OFF -> ON`.
- `git diff --check` passed with existing LF/CRLF normalization warnings only.

### Follow-up layout correction

- `src/pages/LiveControlPage.vue`: converted the Video/Audio panels into stretchable docks so playlists consume remaining panel height, and made the Live Status dock fill the workspace instead of leaving a large empty lower area.
- Validation: `pnpm typecheck`, targeted ESLint, browser screenshot review, no console errors, and `git diff --check` passed.

## MVP Bản 1 - Manual Live Studio

### Files changed

- `electron/services/manual-live-controller.ts`: added main-process video playlist state, play/pause/stop, next/previous, loop, and ended handling.
- `electron/services/audio-playlist-controller.ts`: added independent audio queue state, transport controls, volume, auto-next, and ended handling.
- `electron/main/index.ts`: wired both controllers to the existing Scene Runtime with separate visual/audio layer ownership and independent pause state.
- `electron/ipc/register-ipc.ts`: added validated `video:*`, `audio:*`, and multi-file media picker IPC handlers.
- `electron/preload/index.ts`, `src/shared/contracts/desktop-api.ts`, `src/shared/contracts/ipc-channels.ts`: added the narrow typed preload bridge and channel contracts.
- `src/shared/contracts/manual-live.ts`, `src/shared/validation/manual-live.ts`: added shared snapshots and Zod command validation.
- `src/shared/contracts/scene-runtime.ts`, `src/shared/validation/scene-runtime.ts`, `scene-runtime/runtime.js`: added independent audio pause semantics and stopped-media reset behavior.
- `src/pages/LiveControlPage.vue`, `src/app/router.ts`, `src/components/AppShell.vue`: added the LIVE CONTROL page with Video Panel, Audio Panel, and Live Status.
- `src/app/install-dev-bridge.ts`: added browser-development bridge coverage for the new typed API.
- `tests/unit/manual-live-controller.test.ts`: added controller behavior and independence tests.
- `tests/unit/manual-live-contracts.test.ts`: added IPC channel and payload validation tests.
- `docs/STATUS.md`: recorded the implementation status, evidence, and known verification gaps.

### Reason

Implement the MVP manual live workflow without rewriting the existing Electron/Vue architecture or bypassing the preload boundary.

### Impact

- Video and audio commands have separate controller revisions and do not control each other's transport state.
- Imported files remain in the current app session; restart starts with empty manual playlists and a clean runtime state.
- Existing prepared-script, State Machine, OBS, database, and project persistence paths remain compatible.
- OBS remains behind the existing adapter boundary. The UI reports the existing OBS status and works with the existing mock adapter when connected.

### Test / validation

- `pnpm typecheck` passed.
- Focused Vitest run passed: 3 files, 15 tests (`manual-live-controller`, `manual-live-contracts`, `scene-runtime-service`).
- Full unit suite passed: 37 files, 209 tests.
- `pnpm test:electron-smoke` passed (`PHASE0_SMOKE_OK`).
- Browser QA passed at desktop and mobile viewport: `/live-control` rendered, no framework overlay, no console errors, and Loop toggled from `OFF` to `ON`.
- Targeted ESLint passed for the changed/new files.
- `git diff --check` passed; Git only reported the existing LF/CRLF normalization warning.
- Installer, signing, auto-update, electron-builder, and production packaging were not run.

### Known gaps

- No automated 30-minute media soak was run in this session.
- No real OBS Browser Source manual verification was run.
- Manual playlist persistence across app restart is intentionally deferred; restart behavior is clean and non-resuming for this MVP slice.
- Full-repo lint remains red on pre-existing files (`scene-runtime/runtime.js`, `LongVideoTimelineEditor.vue`, and `ProjectStudioPage.vue`).
- Existing `test:active-work-restart` and `test:settings-persistence-smoke` were not usable as MVP evidence: the former timed out on an existing TTS locator, and the latter could not find its renderer.
