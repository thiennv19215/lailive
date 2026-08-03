# Current Architecture Audit

Audit date: 2026-08-03

Scope: repository-owned source and documentation. Dependency, build output, generated artifacts, user data, and the read-only reference installation were not modified. Existing untracked ZIP files were preserved.

## 1. Current runtime flow

```text
Electron main process
  -> SettingsDatabase and application services
  -> SceneRuntimeService (127.0.0.1 HTTP/SSE)
  -> registerIpcHandlers()
  -> BrowserWindow with isolated preload

Renderer Vue app
  -> Pinia stores / ProjectStudioPage
  -> useStudioPlayback()
  -> PreparedScriptPlaybackController
  -> typed window.desktopApi.sceneRuntime.publish()
  -> preload ipcRenderer.invoke()
  -> main IPC validation
  -> SceneRuntimeService.publish()
  -> Scene Runtime Browser Source HTML
  -> video/audio HTMLMediaElement instances
```

Startup begins in `electron/main/index.ts`. It initializes the database, service adapters, `SceneRuntimeService`, `LiveStateEngine`, and `PreparedLiveProgramController`, starts the loopback runtime, registers IPC handlers, and creates the main `BrowserWindow`. Renderer startup begins in `src/main.ts`, installs Pinia and the hash router, restores the last project, and reports renderer readiness through preload IPC.

## 2. Important files and responsibilities

### Electron main process

- `electron/main/index.ts`: application lifecycle, window creation/security, service construction, Scene Runtime publication, runtime event routing, shutdown, and State Machine/Prepared Live Program wiring.
- `electron/main/window-options.ts`: secure BrowserWindow options. The renderer uses `contextIsolation: true`, `nodeIntegration: false`, and a preload script.
- `electron/ipc/register-ipc.ts`: all `ipcMain.handle` registrations, payload validation, lifecycle diagnostics, and renderer event fan-out.

### Preload and IPC contracts

- `electron/preload/index.ts`: the only exposed renderer bridge. It exposes the typed `DesktopApi` and does not expose Node.js APIs.
- `src/shared/contracts/desktop-api.ts`: renderer-facing typed API contract.
- `src/shared/contracts/ipc-channels.ts`: channel name registry.
- `src/shared/validation/*.ts`: Zod validation at the IPC and persisted-document boundaries.

There are currently channels for projects, media picking/reading, TikTok Live, AI, TTS, Scene Runtime, State Machine, OBS, Shop, diagnostics, settings, app lifecycle, and dedicated manual `video:*` / `audio:*` controls. The manual commands are exposed only through the typed `DesktopApi` bridge.

### Renderer application

- `src/main.ts`: Vue/Pinia/router bootstrap and last-project restore.
- `src/app/App.vue`: router host, close-confirmation dialog, and error boundary.
- `src/app/router.ts`: project, settings, diagnostics, templates, auth, and auxiliary-window routes.
- `src/pages/ProjectStudioPage.vue`: current studio orchestration, media import, scene editing, prepared script configuration, playback commands, runtime publication, OBS actions, autosave, and status UI.
- `src/components/studio/StudioPlaylistPanel.vue`: prepared script playlist UI and its operator commands.
- `src/components/studio/StudioMixerFooter.vue`: compact playback/OBS/operator controls.
- `src/components/SceneMediaLayer.vue`: renderer preview media element lifecycle and play/pause/seek/ended handling.
- `src/stores/projects.ts`, `src/stores/live.ts`, `src/stores/preferences.ts`: Pinia state. Project scene playback itself is orchestrated from the studio page/composable rather than a dedicated Pinia playback store.

### Playback modules

- `src/modules/playback/prepared-script-playback.ts`: active script state machine, sequence/priority playback, pause/resume/skip/stop, revision checks, and successor activation.
- `src/composables/useStudioPlayback.ts`: binds the prepared-script controller to the Vue scene, media availability, TTS, avatar state, Scene Runtime publication, and runtime-ended/TTS events.
- `src/modules/playback/manual-video-playback.ts`: legacy/manual playlist controller with play-list activation, loop behavior, next-on-ended, recovery, and revision checks. It is covered by unit tests and `scripts/run-video-playlist-smoke.mjs`, but current production UI wiring uses prepared scripts instead of this controller directly.
- `src/modules/playback/avatar-video-state-manager.ts`: independent avatar motion state selection and transition queue.
- `src/modules/tts/playback.ts`: TTS result playback handoff used by the live interaction queue.

### Scene Runtime and OBS

- `electron/services/scene-runtime.ts`: loopback-only HTTP server bound to `127.0.0.1`, SSE scene snapshots/patches, asset serving through controlled asset IDs, readiness/health/log endpoints, and validated media/TTS callbacks.
- `scene-runtime/runtime.js`: Browser Source renderer. It creates separate video/audio/image elements, applies presentation ownership, suppresses ambient audio autoplay, handles media events, and reports progress/ended/error callbacks.
- `scene-runtime/media-manager.js`: managed media element cache/preload/cleanup.
- `electron/services/obs.ts`: replaceable Mock, OBS WebSocket, and embedded-libobs adapter boundary; owns Browser Source/output and virtual-camera lifecycle.
- `electron/services/embedded-obs-runtime.ts`: narrow interface for a separately supplied public libobs runtime; it does not bundle reference native packages.

The active prepared-script presentation can contain `activeLayerId` for visual media and `activeAudioLayerId` for a companion audio layer. Scene Runtime starts audio only when selected by the presentation, and its audio callbacks do not drive visual `playback-ended` transitions. This is the existing foundation for independent video/audio control.

### Persistence and media

- `electron/services/database.ts`: local SQL.js-backed project/settings persistence, migrations/recovery, import/export, and project scene storage.
- `electron/services/media-files.ts`: file inspection, media data URL reading, file picker support, and video-to-GIF conversion.
- `src/shared/contracts/projects.ts`: scene/layer/media, legacy manual playback, prepared scripts, State Machine, and Prepared Live Program schemas/types.
- `src/shared/validation/projects.ts`: project schema validation and migration from older playback shapes.

## 3. Existing playback behavior

### Video

There are two layers of behavior:

1. `ManualLiveController` is the active `/live-control` video playlist service. It owns playlist selection, play/pause/stop, loop intent, and a monotonic revision; `manual-live-controller.ts` covers its deterministic state transitions.
2. The active Studio path uses `PreparedScriptPlaybackController`. A video script can own an optional audio layer. On activation, the controller changes both active visual and companion-audio IDs in one revision. The visual successor is preloaded/handed off after a decoded frame, while companion audio starts from the same command publication.

### Audio

`AudioPlaylistController` is the active `/live-control` independent queue service. It owns play/pause/stop, previous/next, volume, auto-next, and its own revision, while TTS remains a separate queue path through `InteractionQueue` and Scene Runtime TTS events. The manual queues are deliberately session-scoped today; they are not project persistence.

### Independence already present

- Scene Runtime distinguishes `activeLayerId` and `activeAudioLayerId`.
- Audio preloading does not autoplay audio.
- Video media ended callbacks are restricted to the active visual presentation.
- Audio layer changes are not intended to restart the visual layer.
- The Prepared Live Program separately models a visual video, base audio, and cue audio with independent cue completion/resume behavior.

## 4. Components permitted to change for MVP v1

Subject to focused tests and preserving existing contracts:

- New or adapted main-process playback services under `electron/services/`.
- Shared IPC channel/API contracts and their Zod validators.
- IPC registration and preload bridge for narrow typed commands.
- Studio route/page/components for a dedicated `LIVE CONTROL` surface.
- Existing playback adapters/composables where integration is required, provided legacy State Machine and Prepared Live Program paths remain compatible.
- Project schema/database migration code for the smallest required persisted playlist/state addition.
- Scene Runtime presentation handling only where needed to preserve independent visual/audio ownership.
- Unit, integration, and smoke tests plus documentation.

## 5. Components that should not be changed casually

- `scene-runtime/` media lifecycle and revision semantics: changes can affect OBS Browser Source output and existing visual/audio separation.
- `electron/services/obs.ts` and embedded runtime boundary: do not replace adapters or introduce reference/private native packages.
- `electron/services/database.ts` migration/recovery logic: schema changes require a migration and restart/persistence validation.
- `src/shared/validation/projects.ts`: existing project import/migration compatibility must be preserved.
- `electron/main/index.ts` shutdown, single-instance, close-confirmation, and runtime event routing.
- Existing State Machine and Prepared Live Program behavior documented in `docs/STATUS.md`.
- Renderer isolation and `127.0.0.1` binding guarantees.
- User-owned untracked files and generated/user-data directories.

## 6. Risks before implementation

- The Scene Runtime has one last-writer-wins presentation but four publishers: renderer-owned prepared scripts, main-owned Live State, main-owned Prepared Live Program, and main-owned Manual Live. There is no arbitration/mutual-exclusion boundary, so an active publisher can overwrite another path's scene without an explicit handoff.
- Manual Live reports a loop intent but publishes `activeLoop: false`; the runtime forcibly disables loops for managed media. On a video-ended callback this currently republishes a new revision rather than proving an in-element loop, which risks a reset/blank frame and violates the no-reload target.
- Manual Live publishes every imported item as a managed Scene Runtime layer. Imports allow up to 100 references per command, but all of those nodes can be attached at once; the media-manager cache limit does not cap attached nodes. Media-resource limits and soak evidence are needed before this is safe for long sessions.
- Manual video/audio queues have unit-controller coverage but no Scene Runtime integration test proving that audio commands never restart visual media, and no real OBS Browser Source verification.
- The existing `manualPlaybackSettings` schema is legacy-shaped and currently migrates into prepared scripts; changing its meaning may break existing projects and tests.
- A new independent audio playlist must not reuse video-ended callbacks or global playback revision semantics in a way that pauses/restarts video.
- Direct renderer audio elements would bypass the required Scene Runtime/OBS audio ownership model; commands must remain main-process/preload mediated.
- Importing multiple files needs a safe extension of the existing single-file `media.pick` API while preserving current dialog behavior and media reference validation.
- Persisting current playback state across app restart could accidentally resume media or leave stale runtime state; default restart behavior must be explicitly defined and tested.
- Existing UI has prepared scripts, State Machine, OBS, and TTS controls; adding `LIVE CONTROL` without clarifying navigation/ownership can create duplicate controls and ambiguous status.

## 7. Audit conclusion

The current architecture is suitable for an incremental MVP implementation. A full rewrite is not indicated. The least disruptive path is to add typed, main-process-owned independent video/audio controllers and a dedicated control surface that publishes to the existing Scene Runtime, while retaining the current prepared-script and State Machine paths as compatibility paths. Phase 1 is complete; implementation should not begin until the user approves this audit and the exact integration scope.
