# Status

## Current phase and status

## Latest audit - repository architecture and playback ownership

- Completed the requested read-only repository audit before further feature changes. The current source has a secure Electron boundary (`contextIsolation`, sandbox, and no renderer Node access), a typed preload contract, and a loopback-only Scene Runtime bound to `127.0.0.1`.
- The new `/live-control` implementation is functional plumbing, not a visual-only mock: `ManualLiveController` and `AudioPlaylistController` publish independently owned video/audio selections into Scene Runtime and receive browser media-end events through validated IPC/service paths.
- The core refactor risk is ownership: prepared-script playback publishes from the renderer while Live State, Prepared Live Program, and Manual Live publish from the main process. All write the same last-writer-wins Scene Runtime presentation, without a command arbiter or explicit ownership handoff.
- Audit also found that Manual Live's loop intent is not passed to the runtime (`activeLoop` is published as `false`), and that imports may attach up to 100 managed media layers concurrently. These are blockers to claiming no-frame-loss/long-session parity until fixed and tested.
- No product code was changed during the audit. `CURRENT_ARCHITECTURE.md` now reflects the active manual video/audio command path and its refactor risks. Existing untracked archives remain untouched.

**MVP Bản 1 - Manual Live Studio: implementation complete for the smallest vertical slice; live/OBS verification pending.** The new LIVE CONTROL page, independent main-process video/audio controllers, typed IPC bridge, and Scene Runtime ownership are implemented. Existing State Machine and prepared-script paths remain in place. This is not a full product-parity completion claim.

## Latest work session - Manual Live Studio independent video/audio player

- Added `ManualLiveController` and `AudioPlaylistController` as separate main-process services. Video owns playlist/loop/switching; audio owns queue/volume/auto-next.
- Added multi-file media picking and typed `video:*` / `audio:*` IPC commands. Renderer access remains limited to `window.desktopApi`.
- Added `/live-control` with Video Panel, Audio Panel, Live Status, import controls, transport controls, loop, volume, auto-next, and playlist views.
- Scene Runtime now carries an independent audio pause hint so pausing or switching audio does not pause/restart video, and vice versa.
- Validation: `pnpm typecheck` passed; focused Vitest passed 3 files / 15 tests; full unit suite passed 37 files / 209 tests; `pnpm test:electron-smoke` passed; Browser QA passed at desktop and mobile viewport; `git diff --check` passed.
- Targeted ESLint passed for all changed/new files. Full-repo lint remains red on pre-existing `scene-runtime/runtime.js`, `LongVideoTimelineEditor.vue`, `ProjectStudioPage.vue`, and existing indentation warnings.
- Known gaps: no real OBS Browser Source verification, no 30-minute media soak, and manual playlists are session-scoped rather than persisted across restart.
- Existing `test:active-work-restart` timed out on its unrelated TTS locator, and `test:settings-persistence-smoke` could not find its renderer; neither is treated as MVP pass evidence.

## What now works

- Electron main process owns a typed `PLAY_STATE` state engine with `IDLE`, `WELCOME`, `CONSULT`, `DEMO`, `CTA`, and `THANKS`.
- State definitions carry visual/audio asset references, executable visual `startAt`/`endAt` media segments, optional independent `audioStartAt`, duration, priority, next state, and chapter-cue metadata. Chapter cues label the media timeline; visual segment boundaries decide what is played.
- Higher-priority state commands interrupt the active state, preserve its visual media time, and resume nested interruptions in LIFO order. A new `DEMO` begins at its configured visual segment start (for example, 30s) and ends at its configured visual segment end (for example, 45s); an interrupted `DEMO` resumes at its preserved 35.5s checkpoint. Audio normally seeks with that visual time, or restarts at its independently configured `audioStartAt`. Runtime revisions reject stale callbacks.
- Scene Runtime receives state presentation snapshots, preloads the next mapped media layers, retains managed media elements, and reports ready, progress, ended, and error events over the loopback-only runtime service. It does not autoplay audio that is not owned by the active state presentation.
- Vue Studio exposes the four Phase 1 operator commands: Chao khach, Tu van, Demo, and Cam on. Its State Machine panel enables the feature and maps visual/audio layers, executable segment start/end, independent audio start, duration, priority, next state, and chapter cues. The Playback Monitor shows the current state, visual range/time, audio offset, revision, mode, and resume context. Before the state machine is configured, operator commands are disabled with setup guidance and the monitor is hidden. The existing prepared-script/manual playback system stays in place as a compatibility path.
- Avatar layers are excluded from image layout indexing. A local image used as the first image/background remains full-canvas in both Studio preview and Scene Runtime even when an avatar precedes it in the scene layer list.
- Project schema v22 retains a selected master-video asset and its bounded duration across scene save and project reopen. The State Machine editor provides a snapped, draggable long-video timeline whose state blocks can be moved or resized into executable visual segments. Its auto-add order is `CONSULT -> DEMO -> CTA -> WELCOME -> THANKS`; `IDLE` is deliberately excluded because it is not a playable video segment.
- Project schema v22 adds the prepared live program: exactly one visual master-video layer, an optional base-audio layer that follows the visual program, and separately-owned cue-audio layers. Cues define visual ranges and either jump within the master visual or interrupt it; when `WELCOME` cue audio ends, the controller restores the paused master visual at the saved checkpoint (for example, 35.5s).
- Project schema version 20 stores `stateMachineSettings` alongside legacy playback settings. Existing/malformed project data receives a safe disabled default rather than breaking project loading.

## High-level files changed

- Shared contracts and validation: `src/shared/contracts/live-state.ts`, `src/shared/validation/live-state.ts`, project and Scene Runtime contracts/validators.
- Electron control path: `electron/services/live-state-engine.ts`, IPC/preload registration, main-process configuration and Scene Runtime publication.
- OBS Browser Source runtime: `scene-runtime/runtime.js` and `scene-runtime/media-manager.js`.
- Studio operator interface, configuration, and Playback Monitor: `src/pages/ProjectStudioPage.vue`, `src/components/studio/StudioMixerFooter.vue`, and `src/components/studio/StateMachineConfigPanel.vue`.
- Long-video timeline configuration: `src/components/studio/LongVideoTimelineEditor.vue` and `src/shared/live-timeline.ts`.
- Prepared live-program control path: `electron/services/prepared-live-program-controller.ts`, Electron IPC/main publication, and the State Machine timeline configuration UI.
- Focused automated coverage: `tests/unit/live-state-engine.test.ts`, `tests/unit/scene-runtime-service.test.ts`, and `tests/unit/project-validation.test.ts`.

## Validation results

- Desktop UI audit at `1720x988` captured before/after. The editor geometry now keeps the Timeline and go-live dock in the first viewport: desktop columns are `340px / flexible canvas / 278px`, with a responsive lower dock instead of the previous clipped `175px` footer.
- `pnpm capture:ui artifacts/audit-final2`: passed (`UI_CAPTURE_OK`).
- `git diff --check`: passed; only the existing Git LF/CRLF warning was printed.

- `git diff --check`: passed; only Git CRLF conversion warnings were printed.
- `pnpm typecheck`: passed (`vue-tsc --noEmit` and Electron TypeScript check).
- `pnpm exec vitest run tests/unit/live-state-engine.test.ts tests/unit/scene-runtime-service.test.ts tests/unit/project-validation.test.ts`: passed, 3 files / 31 tests.
- `pnpm exec vitest run tests/unit/studio-preview.test.ts tests/unit/scene-runtime-service.test.ts tests/unit/project-validation.test.ts`: passed, 3 files / 32 tests.
- `pnpm exec vitest run tests/unit/live-timeline.test.ts tests/unit/project-validation.test.ts tests/unit/live-state-engine.test.ts`: passed, 3 files / 28 tests.
- `pnpm exec vitest run tests/unit/prepared-live-program-controller.test.ts tests/unit/scene-runtime-service.test.ts tests/unit/project-validation.test.ts tests/unit/live-timeline.test.ts`: passed, 4 files / 31 tests.
- `pnpm test:scene-runtime-smoke`: failed at its editor/runtime visual comparison, reporting `Editor/runtime visual difference was 11.41%`. The failure is a pre-existing visual parity gap; the audio-ownership checkpoint completed before the comparison and did not report an audio failure.

## Known gaps and blockers

- No automated Vue component test covers the operator controls or their error presentation.
- Scene Runtime screenshot parity remains blocked: the automated smoke check reports an editor/runtime visual difference of 11.41%. This is visual-only evidence and not an audio-ownership failure.
- No end-to-end/manual OBS Browser Source verification has confirmed full-canvas local backgrounds with preceding avatars, one master visual plus base/cue audio ownership, master-video duration behavior, dragged/resized executable timeline segments, cue interruption, `WELCOME` cue-audio end restoring the visual at `35.5s`, Playback Monitor values, or empty-state behavior against a real OBS instance.
- TikTok and AI remain intentionally outside this Phase 1 command path; later work should feed their decisions into the same typed command boundary.

## Exact next task

Investigate and reduce the 11.41% Scene Runtime visual diff, then run a real OBS Browser Source manual test covering the one-master-video/base-audio/cue-audio arrangement, a dragged/resized `DEMO` visual segment from 30s to 45s, a `WELCOME` cue interrupt and visual resume at 35.5s after cue-audio end, full-canvas local backgrounds, empty-state controls, and Playback Monitor values; then route a mock TikTok/AI decision through the same `PLAY_STATE` command boundary.

## Latest work session - parallel video/audio script playback

## Latest work session - OBS-inspired LIVE CONTROL UI

- Reworked `src/pages/LiveControlPage.vue` into a denser OBS-inspired operator surface: compact program toolbar, charcoal dock panels, clearer runtime/output status, and tighter playlist/transport controls.
- Kept the existing typed IPC, controllers, Scene Runtime ownership, and video/audio independence unchanged.
- Validation: `pnpm typecheck`, targeted ESLint, browser render check, no console errors, and Loop `OFF -> ON` interaction passed.
- Follow-up: converted the control panels and status panel to stretchable dock layouts so the workspace no longer has a large unused lower area.

## Latest work session - parallel video/audio script playback

- Prepared script UI now models audio as an optional track inside a video script. The video remains the visible layer while the selected audio layer starts after the video reports a decoded frame.
- Studio preview visibility and media activation both retain the active video when `activeAudioLayerId` is set, so playing audio no longer hides the video.
- Script labels now state that video and audio play in parallel; audio mute and volume remain controllable from the script editor.
- Validation: `pnpm typecheck` passed; prepared playback and project validation tests passed (32 tests); `pnpm test:video-playlist-smoke` passed earlier in this session.
- Known workspace item: untracked `lailive.zip` was left untouched because it was not created intentionally during this work.

## Latest correction - start companion audio in parallel

- Prepared video scripts now mark their assigned `audioLayerId` active in the same playback revision as the video. Audio no longer waits for the video-ready callback; that callback only completes the visual handoff.
- The Studio media binding no longer pauses the active audio while the script is in `loading`, and the ready transition preserves an already-active audio layer.
- Validation: `pnpm typecheck`, 32 focused unit tests, and `pnpm test:video-playlist-smoke` all passed.

## Latest correction - prevent destructive source removal

- Source deletion now requires confirmation before removing the layer and its linked scripts.
- Audio-only script creation was removed from the source assignment path. Audio can only be attached to a video/video-avatar script and is started as the companion track in that same script.
- The prepared-script editor again exposes separate mute and volume controls for the video audio and the parallel audio track.
- Validation: `pnpm typecheck` passed; prepared playback and project validation tests passed (31 tests).

## Audit session - MVP v1 independent video/audio control

- Phase 1 audit completed from the current repository source, contracts, runtime, services, renderer, preload, IPC, tests, and status history.
- Created `CURRENT_ARCHITECTURE.md` documenting the actual Electron flow, playback ownership, permitted change areas, protected components, and implementation risks.
- Confirmed there are no dedicated `video:*` or `audio:*` IPC channels yet. The active Studio path is prepared-script playback; `ManualVideoPlaybackController` exists as a tested legacy controller but is not directly wired to the current UI.
- No product code was changed. Existing untracked ZIP files were preserved.
- Status: awaiting user approval of the audit before Phase 2 implementation.

## Latest correction - remove orphaned timeline clips

- Playback sync now removes prepared clips whose primary video/avatar source no longer exists, removes them from the active/queued controller state, and detaches missing companion audio without deleting the surviving video script.
- Validation: `pnpm typecheck`; `pnpm exec vitest run tests/unit/prepared-script-playback.test.ts tests/unit/project-validation.test.ts` passed (31 tests); `git diff --check` passed with existing CRLF warnings.

## Latest correction - remove source-less video clips

- Timeline cleanup now also removes legacy `video`/`audio` scripts whose primary `mediaLayerId` is already `null`, which was the remaining case shown after deleting the last source.
- Validation: `pnpm typecheck`; focused playback/project tests passed (31 tests).

## Latest correction - hide invalid clips immediately

- Timeline lanes now render only scripts with a valid primary source, and deleting a source explicitly stops stale playback before reconfiguring the controller.
- Validation: `pnpm typecheck`; focused playback/project tests passed (31 tests).

## Latest correction - remove legacy idle audio clips

- Legacy standalone `audio` scripts in the idle lane are now removed/hidden; audio is only valid as a companion track on a video script. This fixes the remaining `R2 - ElevenLabs...` clip after visual sources are deleted.
- Validation: `pnpm typecheck`; focused playback/project tests passed (31 tests).

## Latest correction - purge legacy playback shapes

- Runtime sync now removes every standalone `audio` prepared script and no longer promotes legacy audio data into a new playable clip. The supported shapes are video/avatar primary media, optional attached audio, and TTS.
- Validation: `pnpm typecheck`; focused playback/project tests passed (31 tests).

## Latest correction - stop deleted media immediately

- `removeLayer` now reconfigures the playback controller and republishes the scene after the layer array is actually updated, preventing a stale runtime snapshot from continuing to play deleted media.
- Removing a companion audio layer now detaches only `audioLayerId`; removing a video/avatar layer removes the associated script and stops active playback.
- Startup sync now prunes orphaned scripts whose media layer was deleted in an older project, so stale clips disappear after reload as well.
- Validation: `pnpm typecheck` passed; prepared playback and project validation tests passed (31 tests).
