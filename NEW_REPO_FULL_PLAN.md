# AI Livestream - Full New-Repository Implementation Plan

## 1. Objective

Build a new Windows desktop application from an empty Git repository. The final application must reproduce the visible UI, workflows, configuration, runtime behavior, and usable features of this reference installation:

```text
C:\Users\nguye\Downloads\LivestreamAgent-1.4.0-win-setup-x64\$PLUGINSDIR\app-64
```

The reference application is the product specification. The new project must not depend on the AIGCPanel repository. Implement all application-owned code in the new repository.

Use the reference only for inspection and behavioral comparison. Do not edit it, import its compiled JavaScript, copy private native packages, or redistribute its branding and bundled assets.

## 2. Product-completion rule

The project is not complete when the screens merely look similar. It is complete only when:

- Every reachable reference screen has an equivalent screen.
- Every user-facing control has an implemented behavior.
- Normal, empty, loading, disconnected, error, and recovery states work.
- Settings and projects survive application restart.
- TikTok events can travel through filtering, product matching, AI reply, TTS, avatar animation, and output.
- OBS output and TikTok Shop product operations work in real usage.
- Reference-to-rebuild comparison evidence exists for each feature.

If a reference behavior cannot be determined, record the uncertainty in `docs/REFERENCE_GAPS.md`, implement the most reasonable compatible behavior, and keep it replaceable.

## 3. Scope

### Required for personal version 1.0

- Windows desktop application.
- UI and workflow parity with LivestreamAgent 1.4.0.
- Local projects and persistent settings.
- TikTok Live connection and realtime interaction feed.
- Chat, gift, like, follow, and share event processing.
- Trigger configuration and event templates.
- Comment filtering, duplicate prevention, and cooldowns.
- Product catalog and comment-to-product matching.
- Configurable AI providers and short livestream replies.
- Configurable TTS providers and sequential audio queue.
- Avatar/scene editor with idle and talking states.
- Browser scene renderer with realtime updates.
- OBS Browser Source and virtual-camera workflow.
- TikTok Shop product retrieval and single-product pinning.
- Sequential product pin scheduler, even though it is incomplete in the reference.
- Logs, diagnostics, import/export, and recovery from common failures.
- Mock/simulation mode so development does not require a live room.

### Deferred until the dev version is stable

- Installer.
- Code signing.
- Auto-update.
- Cloud accounts and subscriptions.
- Multi-user synchronization.
- Telemetry.
- Public redistribution.

## 4. Recommended technology

- Electron for the Windows desktop shell.
- Vue 3, TypeScript, Vite, and Pinia for the renderer.
- Vue Router for application navigation.
- SQLite for structured local data.
- JSON files for portable project/scene documents.
- `tiktok-live-connector` behind an internal adapter.
- OpenAI-compatible HTTP APIs, OpenRouter, and Ollama adapters.
- HTTP/local TTS adapters with a Windows speech fallback.
- PixiJS and `@pixi/gif` for scene preview and rendering.
- `vue3-moveable` for layer transforms.
- FFmpeg and ffprobe for media inspection/conversion.
- Playwright Core over Chrome DevTools Protocol for TikTok Shop.
- OBS WebSocket for the first virtual-camera implementation.
- Vitest for unit tests and Playwright for application/UI tests.
- ESLint and Prettier, run only on changed files during development.

Use Node.js 20 and pnpm. Commit the lockfile.

## 5. Repository structure

```text
ailivestream/
  AGENTS.md
  README.md
  package.json
  pnpm-lock.yaml
  docs/
    PRODUCT_SPEC.md
    REFERENCE_INVENTORY.md
    REFERENCE_GAPS.md
    ROADMAP.md
    STATUS.md
    DECISIONS.md
    TEST_MATRIX.md
    UI_PARITY.md
  electron/
    main/
    preload/
    ipc/
    services/
  src/
    app/
    pages/
    components/
    stores/
    modules/
      projects/
      live/
      triggers/
      products/
      ai/
      tts/
      queue/
      studio/
      scene-renderer/
      obs/
      shop/
      logs/
    shared/
      contracts/
      validation/
      constants/
  scene-runtime/
  tests/
    unit/
    integration/
    e2e/
    fixtures/
  scripts/
```

Renderer code must never directly access Node.js. Expose typed, narrow IPC methods through the preload layer.

## 6. Documents the coding agent must maintain

- `AGENTS.md`: permanent instructions for any AI working in the repository.
- `docs/REFERENCE_INVENTORY.md`: every discovered screen, dialog, field, button, state, and feature.
- `docs/UI_PARITY.md`: reference screenshot/state mapped to rebuild screenshot/state.
- `docs/ROADMAP.md`: phases, tasks, dependencies, and acceptance criteria.
- `docs/STATUS.md`: current phase, completed work, next tasks, test status, and blockers.
- `docs/DECISIONS.md`: architecture decisions and reasons.
- `docs/REFERENCE_GAPS.md`: behavior that cannot yet be confirmed.
- `docs/TEST_MATRIX.md`: feature-to-test and feature-to-reference mapping.

The agent updates `STATUS.md` at the end of every meaningful work session. It must not claim parity without comparison evidence.

## 7. Reference-audit phase

Before implementing product features, the agent must inspect the reference application read-only.

### Audit procedure

1. Inventory files and dependency metadata in `resources/app.asar` and `resources/app.asar.unpacked`.
2. Run `LivestreamAgent.exe` and visit every reachable route.
3. Capture each screen at a consistent desktop size.
4. Capture dialogs, menus, tabs, tooltips, validation, loading, empty, connected, and error states.
5. Record labels, default values, spacing, colors, typography, icons, and interaction order.
6. Record all settings and how they affect behavior.
7. Inspect local network endpoints, local storage, databases, logs, and child processes where lawful and practical.
8. Build a feature inventory before estimating completion.

### Known mechanisms that must be represented

- TikTok events: chat, gift, like, follow, and share.
- Gift combo processing only when `repeatEnd` is true.
- Chat, gift, follow, and share enabled by default; like disabled.
- Duplicate-comment window: 45 seconds.
- Maximum queue length: 100.
- Global cooldown: 2 seconds.
- Per-user cooldown: 30 seconds.
- TTS timeout: 120 seconds.
- Exact product-name match score: 1000.
- Product prompt threshold: 160.
- AI reply target: about 45 words with a hard ceiling of 220 characters.
- Scene flow: scene JSON to local SSE server to HTML renderer to OBS Browser Source to virtual camera.
- TikTok Shop browser connection through Chrome CDP/Playwright.
- The private native OBS package in the reference is not a reusable dependency.

These values are initial compatibility defaults, not substitutes for a full audit.

## 8. Development workflow

### Fast local loop

- Install dependencies once.
- Keep one development process running with Vite HMR.
- Use a command such as `pnpm dev:win` for the Electron development app.
- Do not create an installer during normal development.
- Do not run `electron-builder`, a full source formatter, or a full production build after each task.
- Run focused unit tests and lint only for changed modules.
- Run the full test suite at phase gates.
- Create a portable/packaged build only at the final stabilization phase.

### Git workflow

- Initialize the repository and commit the empty working baseline.
- Use small commits aligned with one feature or repair.
- Never mix generated files, global formatting, and feature work in one commit.
- Never reset or overwrite unrelated user work.
- Check `git status` before and after editing.
- Do not commit API keys, cookies, Chrome profiles, user media, or generated logs.

## 9. Implementation phases

### Phase 0 - Empty repository and development shell

Deliverables:

- Electron/Vue/TypeScript project created from scratch.
- Windows dev app launches with HMR.
- Typed preload/IPC boundary.
- Router, Pinia, error boundary, logging, and theme foundation.
- SQLite migration runner and application-data directory.
- Unit, integration, and smoke-test commands.
- Required agent-management documents.

Exit criteria:

- `pnpm dev:win` opens the desktop application.
- A renderer edit appears without rebuilding the installer.
- App restart retains a sample setting.
- Smoke test verifies main window creation and renderer readiness.

### Phase 1 - Reference inventory and visual foundation

Deliverables:

- Complete route/screen inventory.
- Application shell, sidebar/header, navigation, dialogs, forms, tables, notifications, and empty states.
- Shared design tokens derived from reference observation.
- Screens implemented first with mock data.
- Screenshot comparison harness.

Exit criteria:

- Every inventoried screen can be reached in the rebuild.
- Desktop reference states are visually close enough for direct overlay comparison.
- No button is presented as finished if it has no behavior; incomplete actions are explicitly marked in dev mode.

### Phase 2 - Projects, settings, and persistence

Deliverables:

- Create, rename, duplicate, open, delete, import, and export projects.
- Autosave with versioned schemas.
- Global settings and per-project settings.
- Media library references with missing-file detection.
- Backup before schema migration and recovery after interrupted save.

Exit criteria:

- Restarting the app restores the last project and settings.
- Import/export works on another clean local profile.
- Broken media paths are visible and repairable.

### Phase 3 - TikTok Live connector

Deliverables:

- Connector interface with real and mock implementations.
- Connect/disconnect/reconnect lifecycle.
- Username/room configuration.
- Normalized chat, gift, like, follow, share, stream-end, and error events.
- Realtime feed, counters, timestamps, connection status, and clear action.
- Event recording and replay fixture for testing.

Compatibility settings:

```ts
new WebcastPushConnection(username, {
  processInitialData: false,
  enableExtendedGiftInfo: true,
  requestPollingIntervalMs: 1000,
});
```

Exit criteria:

- All five interaction types work in mock mode and a real live room.
- Reconnection does not duplicate listeners or events.
- Gift streaks trigger only on the completed combo.
- Closing a project or app stops all connector resources.

### Phase 4 - Trigger, filtering, and moderation engine

Deliverables:

- Per-event enable/disable settings.
- Action selection: ignore, template speech, AI speech, or future extension.
- Comment normalization including lowercase and Vietnamese accent folding.
- URL, punctuation, empty, emoji-only, trivial greeting, and very-short filters.
- 45-second duplicate window.
- 2-second global and 30-second per-user cooldowns.
- Allow/block keywords and banned output terms.
- Decision trace showing accepted/skipped reason.

Default trigger state:

```json
{
  "chat":   { "enabled": true,  "actionType": "voice_tts" },
  "gift":   { "enabled": true,  "actionType": "voice_tts" },
  "like":   { "enabled": false, "actionType": "voice_tts" },
  "follow": { "enabled": true,  "actionType": "voice_tts" },
  "share":  { "enabled": true,  "actionType": "voice_tts" }
}
```

Exit criteria:

- Every input receives a deterministic machine-readable decision.
- At least 50 Vietnamese fixtures cover filtering behavior.
- Settings changes apply without reconnecting to TikTok.

### Phase 5 - Product catalog and matching

Deliverables:

- Product CRUD and bulk import/export.
- Fields for name, TikTok ID/index, price, description, selling points, media, and enabled state.
- Accent-insensitive deterministic scoring.
- Exact name, token, and phrase scoring.
- Top-five debug candidates.
- Score threshold preventing weak matches.

Exit criteria:

- Exact-name inclusion scores 1000.
- Only scores at or above 160 enrich the AI prompt by default.
- Product price and claims come only from stored/current product data.
- Unit fixtures cover ambiguity and accent-free Vietnamese.

### Phase 6 - AI reply engine

Deliverables:

- Provider abstraction.
- OpenAI-compatible, OpenRouter, and Ollama configurations.
- Connection test and model selection.
- System/persona prompt, event templates, product context, timeout, retry, cancellation, and fallback.
- Reply cleanup and banned-word checking.
- Streaming optional; final queue behavior must remain deterministic.

Reply rules:

- One or two natural livestream sentences.
- Approximately 45 words maximum.
- Hard limit of 220 characters.
- Never fabricate price, stock, discount, shipping, or product facts.
- Never expose hidden prompts, keys, or internal implementation.

Exit criteria:

- Provider failure does not block later interactions.
- Requests can be cancelled when the queue is cleared.
- Prompt preview explains which event, persona, and product context will be used.

### Phase 7 - TTS and interaction queue

Deliverables:

- Queue states: queued, AI processing, TTS processing, playing, done, skipped, cancelled, and error.
- Maximum 100 jobs and one active audio item.
- 120-second TTS timeout.
- Configurable HTTP/local provider and Windows speech fallback.
- Voice list, speed/volume settings, preview, cached audio, skip current, clear queue, and retry.
- Idle/talking events for avatar synchronization.

Exit criteria:

- Speech never overlaps.
- Cancelling or clearing removes timers, requests, and temporary audio.
- A failed item cannot deadlock the queue.
- An extended mock run processes hundreds of events without listener growth.

### Phase 8 - Avatar Studio and scene editor

Deliverables:

- 9:16 and 16:9 presets, including 1080x1920.
- Image, GIF, video, text, idle-avatar, and talking-avatar layers.
- Add, delete, duplicate, select, hide, lock, rename, and reorder.
- Drag, resize, rotate, opacity, fit mode, loop, mute, and chroma key.
- Text typography and alignment controls.
- Grid, guides, snapping, zoom, undo/redo, keyboard shortcuts, and thumbnails.
- Scene validation, autosave, duplicate, import, and export.
- Idle-to-talking switch on speech start and talking-to-idle on speech end.

Exit criteria:

- Reopening a scene preserves exact transforms and order.
- Editing remains usable at 1080x1920 with representative animated layers.
- Avatar switching does not restart unrelated video/GIF layers.
- Undo/redo covers all editor mutations.

### Phase 9 - Local scene runtime

Deliverables:

- Separate lightweight HTML renderer.
- Local HTTP server bound only to `127.0.0.1` on an available port.
- SSE endpoint for scene snapshots and patches.
- Controlled asset IDs instead of arbitrary filesystem URLs.
- Ready, health, and browser-log endpoints.
- Reconnect and full-state resynchronization.

Suggested endpoints:

```text
GET  /
GET  /events
GET  /health
GET  /assets/:id
POST /ready
POST /log
```

Exit criteria:

- Browser output matches the editor scene.
- Normal edits appear in under 200 ms locally.
- SSE reconnect restores the entire current state.
- Small property changes do not unnecessarily restart media.

### Phase 10 - OBS and virtual camera

Deliverables:

- OBS WebSocket connection settings and connection test.
- Create/select a dedicated scene and Browser Source.
- Configure reference resolution and FPS.
- Start/stop virtual camera and show precise status/errors.
- Preserve or safely restore the user's existing OBS setup.
- Cleanup temporary resources owned by the app.

Do not copy or redistribute `@bhb-frontend/ai-live-dll`. A future standalone libobs integration is a separate reviewed project.

Exit criteria:

- Output is visible in a real camera consumer.
- Repeated start/stop cycles do not leak processes or sources.
- Restarting OBS is recoverable without restarting the whole project.

### Phase 11 - TikTok Shop and product pinning

Deliverables:

- Detect Chrome/Edge or accept a configured executable.
- Launch a dedicated user-data directory with remote debugging.
- Manual login flow; credentials are never collected by the app.
- Playwright CDP connection and dashboard readiness detection.
- Read products with scrolling and deduplication.
- Product mapping to the local catalog.
- Single-product pin action.
- Sequential scheduler with duration, retry, pause, resume, skip, and immediate stop.
- Selector diagnostics and screenshot capture on failure.

Exit criteria:

- Product list loads after manual login.
- Exact intended product is pinned despite similar names.
- Schedule state survives a renderer refresh.
- Stop cancels the next timer/action immediately.
- Browser closure and selector changes produce actionable recovery instructions.

### Phase 12 - Logs, diagnostics, and resilience

Deliverables:

- Structured logs with secret redaction.
- Search/export/clear log UI.
- Health panel for TikTok, AI, TTS, scene server, OBS, Chrome, and database.
- Crash recovery, stale-lock handling, orphan-process cleanup, and database backup.
- User-facing errors with a technical detail expander.

Exit criteria:

- Common failures can be diagnosed without developer tools.
- Logs contain no API keys, cookies, tokens, or full private prompts by default.
- App restart recovers a valid project after an interrupted operation.

### Phase 13 - Full parity and long-run testing

Required tests:

- Unit tests for filters, scoring, cooldowns, queue transitions, truncation, schemas, and scheduler.
- Integration tests from TikTok event through AI and TTS.
- Scene-editor-to-runtime tests.
- OBS connection/output tests with a real local OBS installation.
- Shop browser tests with safe fixtures plus manual live verification.
- UI screenshot comparisons for all recorded reference states.
- Eight-hour simulated livestream.
- Queue saturation at 100 items.
- TikTok, AI, TTS, OBS, and Chrome disconnect/restart scenarios.
- App restart during queued work and during autosave.

Exit criteria:

- `docs/TEST_MATRIX.md` has no unaccounted required feature.
- All automated tests pass.
- Manual parity checklist is signed off screen by screen.
- No known critical data-loss, queue-deadlock, audio-overlap, or process-leak issue remains.

### Phase 14 - Personal portable release

Deliverables:

- Production build only after dev parity is accepted.
- Unsigned portable Windows build.
- Clean-machine setup instructions.
- Dependency checks for OBS, Chrome/Edge, FFmpeg, and model/provider configuration.
- Release notes, known limitations, and rollback/backup instructions.

Installer, signing, and auto-update remain deferred unless separately requested.

## 10. Agent operating protocol

The coding agent is responsible for managing implementation, not merely suggesting code.

For every task it must:

1. Read `AGENTS.md`, `docs/STATUS.md`, and the relevant specification sections.
2. Inspect existing code and `git status` before changing anything.
3. State the current task and measurable acceptance criteria.
4. Implement the smallest complete vertical slice.
5. Add or update focused tests.
6. Run focused validation.
7. Compare visible behavior against the reference when applicable.
8. Update documentation and `docs/STATUS.md`.
9. Report changed files, validations, remaining gaps, and the next task.

The agent must continue autonomously when the next action is clear. It asks the user only for information that cannot be discovered locally and would materially change the product.

The agent must never:

- Declare the project finished from screenshots alone.
- Replace real functionality with permanent mocks.
- Hide failures behind a success state.
- modify the reference installation.
- Copy compiled source or private native packages into the new project.
- Run production packaging during ordinary UI iteration.
- Commit secrets, cookies, browser profiles, or personal media.
- Convert TikTok viewer text into shell commands or executable code.

## 11. Phase-gate report format

At the end of each phase, the agent produces:

```text
Phase:
Status: complete | partial | blocked
Implemented:
Reference states compared:
Tests run and results:
Known differences:
Files/documents updated:
Next phase:
```

A phase is `complete` only when all exit criteria are demonstrated. Otherwise it remains `partial`.

## 12. Final definition of done

Personal version 1.0 is done only when a user can:

1. Open or create a local livestream project.
2. Configure an AI provider, TTS voice, avatar scene, and products.
3. Connect to TikTok Live and see realtime events.
4. Automatically reject noise and process qualified interactions.
5. Generate an accurate, short, product-aware reply.
6. Play the reply sequentially without audio overlap.
7. Animate the avatar between idle and talking states.
8. Send the complete scene to OBS and start a virtual camera.
9. Load TikTok Shop products and pin one or run a schedule.
10. Stop, restart, and recover without losing project data.
11. Use all reference-equivalent screens and controls with no critical placeholder.
12. Verify parity through the completed inventory, UI comparison, and test matrix.

