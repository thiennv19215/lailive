# Status

Updated: 2026-08-01

## Session update - hard-cut video playback

- Replaced Timeline `transitionLayerId` handoff with an off-screen `pendingLayerId`. The next video starts at time zero, waits for `requestVideoFrameCallback`, then atomically becomes the only visible managed video.
- Removed the 300 ms opacity transition from Studio and Browser Source runtime layers. Avatar state video switches now use the same decoded-frame hard cut and no longer retain a previous layer.
- Pending video now suppresses old-media `ended` callbacks, and attached audio is deferred in `pendingAudioLayerId` until the same decoded-frame hard cut. This prevents skipped clips and audio leading video during preload.
- Validation passes: `pnpm typecheck`, focused playback/runtime tests (26/26), `pnpm test:video-playlist-smoke` (100 transitions), and `git diff --check`. Visual OBS verification with local fixture clips remains the next runtime check.

## Session update - graceful role transitions

- Role actions no longer cut through an active audio/TTS response. `Kích hoạt` or `Nói chuyện` requested during spoken playback are enqueued and only activate after the current media emits its completion event; the timeline shows `Đang đợi phát xong câu hiện tại trước khi chuyển.` while waiting.
- Idle background media can still switch directly, while new scripts and migrated legacy manual scripts default to `after-current` interruption behavior so normal operator commands remain smooth.
- Validation passes: 43 focused tests including the no-cut spoken-transition case, focused controller/timeline/schema ESLint, `corepack pnpm typecheck`, and `git diff --check`.

## Session update - role-based source scripts

- Prepared script schema v15 adds the explicit `idle`, `activation`, and `conversation` role. Existing v13/v14 scripts migrate as `activation`; legacy manual playlists migrate as `idle` scripts.
- The footer timeline is now split into three operational lanes. Select a video, audio, or avatar source on the canvas, then use `Gán Chờ`, `Gán Kích hoạt`, or `Gán Đang nói`; the app creates or updates the corresponding script and retains the selected source assignment.
- `Chạy chờ` runs the idle script. `Kích hoạt` and `Nói chuyện` run their role's first enabled script; a conversation response interrupts idle and the controller resumes the prior idle script after completion. Avatar-only assignment creates a TTS-ready script, while audio/video assignment uses the selected source directly.
- Validation passes: 42 focused tests, focused Studio/controller/schema ESLint, `corepack pnpm typecheck`, and `git diff --check`.

## Session update - unified livestream output controls

- Removed the separate OBS output panel from the footer and merged its status, Browser Source name, connect/camera action, and settings into the fixed livestream control stack on the right.
- The reclaimed footer width now belongs to the script timeline, keeping playback control and broadcast output in their respective operational areas.
- Validation passes: focused Studio ESLint, `corepack pnpm typecheck`, and `git diff --check`.

## Session update - prepared-script timeline controls

- Moved prepared-script selection and playback into a fixed `Timeline kịch bản` control deck in the Studio footer. Each R appears as a horizontal clip; clicking it plays that script, and the active clip is highlighted.
- The footer keeps `+ Audio cho avatar` beside the selected avatar name and a `Chỉnh sửa` control for full script configuration. The avatar inspector now only assigns the visual role and directs operators to the footer controls.
- Validation passes: focused Studio ESLint, `corepack pnpm typecheck`, and `git diff --check`.

## Session update - avatar-to-audio script workflow

- Reworked the selected-avatar inspector around the operator flow: `Phát xem trước video chờ` previews the assigned idle video/GIF, while `+ Thêm audio cho avatar này` opens the native picker, creates an audio source, creates a prepared script, and preassigns that exact avatar to it.
- `Mở kịch bản & phát` now opens an accessible modal instead of relying on the hidden overflow panel. Each script row shows its avatar/audio/TTS assignment and its own `Phát` control, so the operator can clearly run the audio-avatar pair.
- Validation passes: focused Studio ESLint, `corepack pnpm typecheck`, and `git diff --check`.

## Session update - visible audio import

- Added a prominent orange `+ Thêm file audio` button in the always-visible `Nguồn âm thanh` footer, alongside explicit MP3/WAV/M4A/OGG guidance. It invokes the native local-file picker and adds the audio to the scene.
- Validation passes: focused Studio ESLint, `corepack pnpm typecheck`, and `git diff --check`.

## Session update - direct prepared-script audio import

- Audio scripts now include `Chọn file audio` directly beside their source selector. The native picker imports the selected file, creates its controlled local audio layer, assigns it to that exact script, reloads media status, and persists through the existing autosave path.
- Operators no longer need to add an audio source elsewhere before configuring a script; select `Thoại file`, then choose the audio file in the same script card.
- Validation passes: focused Studio ESLint, `corepack pnpm typecheck`, and `git diff --check`.

## Session update - single-avatar VAS scripts

- Prepared scripts now persist an optional `avatarLayerId`, and the Studio lets each video, audio, or TTS script choose one `Avatar VAS`. Avatar uploads accept video or image/GIF media, so animated GIF avatars work through the existing controlled media path.
- The playback controller publishes `activeAvatarLayerId` separately from the script's audio/video source. On start, switch, completion, error, or stop, Scene Runtime and Browser Source hide every other script-managed avatar; therefore only the active script's one avatar can run in the VAS frame.
- Project schema v14 migrates v13 prepared scripts without data loss by assigning `avatarLayerId: null`. Validation rejects an avatar assignment that does not point to an avatar layer.
- Validation passes: focused ESLint, `corepack pnpm typecheck`, 43 focused tests (including prepared-script transitions and v13 migration), and `git diff --check`.

## Session update - direct avatar preview controls

- Added compact `Chờ` and `Đang nói` controls inside the Studio canvas, plus the same prominent controls in the Avatar inspector. Selecting an avatar source now makes it clear whether that file is the idle or talking clip, and either preview button switches the canvas and publishes the state to the loopback Scene Runtime.
- This is an operator preview override only. It does not yet drive audio-only prepared scripts; automatic TTS remains the next integration point for owning the `idle -> talking -> idle` lifecycle.
- Validation passes: `corepack pnpm typecheck`, focused ESLint for the Studio/composable, and `git diff --check`.

## Session update - avatar uploader action repair

- Fixed the Avatar-library launch event name. `Tải avatar của bạn` now opens the Avatar library instead of silently doing nothing; operators can then select `Thêm avatar của bạn` and choose a local MP4 through the native Electron picker.
- Saving that MP4 now creates and selects an `avatar` scene layer backed by the exact file, loads it as video in the Studio preview, and publishes it to Browser Source. It defaults to the idle role; upload a second MP4 and assign its source to `Đang nói` for the paired preview.
- Validation passes: `corepack pnpm typecheck`, focused Asset Browser/Studio ESLint, and `git diff --check`.

## Session update - full-canvas OBS realtime synchronization

- Fixed the Studio-to-OBS contract so every authored scene edit is published immediately through Scene Runtime in addition to the existing debounced project autosave. Layer changes, transforms, visibility, ordering, source changes, and media-reference replacements now reach the Browser Source without requiring reconnect or manual refresh.
- Corrected Browser Source composition geometry to match the Studio canvas: video/GIF, text, primary background, secondary image, opacity, transform, fit, visibility, and front-to-back ordering now use the same layer boxes rather than expanding every media layer to the full OBS frame.
- Removed stale local-media behavior by versioning Browser Source asset URLs from the current media path, serving runtime/assets with `no-store`, and pressing OBS Browser Source `refreshnocache` whenever an existing managed output is updated. Replacing a video under the same layer/source ID now rebuilds the media element and stops the prior source.
- Validation passes: 18 focused OBS/Scene Runtime/Studio preview tests, focused ESLint, `pnpm typecheck`, and `git diff --check`. Browser Source smoke passes with `SCENE_RUNTIME_SMOKE_OK propagation=142ms visualDiff=2.02%`; the installed OBS instance also accepts the real refresh command (`OBS_BROWSER_REFRESH_OK`).
- Runtime note: restart the Electron app once so its main-process Scene Runtime cache policy and OBS update path are both loaded, then use `Kết nối OBS` to refresh the existing managed Browser Source.

## Session update - OBS show-output crash recovery

- Diagnosed the visible `obs:show-output` / `OBS_RESPONSE_TIMEOUT` failure against the installed OBS 32.2.1 instance. The OBS crash dump records `obs-websocket.dll!RequestHandler::GetCurrentProgramScene`, confirming that OBS closed before replying and the app's timeout hid the real disconnect.
- Replaced the crash-triggering `GetCurrentProgramScene` request with the equivalent `currentProgramSceneName` returned by `GetSceneList`. The WebSocket client now rejects pending operations immediately when OBS closes, and `showOutput` resets the service to a disconnected state after a failed scene activation.
- Added Vietnamese recovery messages for a closed OBS connection and a genuine response timeout. Updated the authenticated protocol expectation so the regression suite locks in the safe request path.
- Validation passes: 8 focused OBS service tests (the repository test matcher also found three existing `.claude/worktrees` copies, 32/32 total), focused ESLint, `pnpm typecheck`, and `git diff --check`. A read-only authenticated probe against the running OBS instance passes: `OBS_GET_SCENE_LIST_OK current=AI Livestream scenes=1`.
- Runtime note: the already-running Electron main process must be restarted once to load the main-process OBS fix; normal renderer HMR alone does not replace this service instance.

## Session update - direct OBS controls restored in Studio

- Restored the product-facing OBS workflow so operators no longer need DevTools or Console commands. Project Studio now loads the saved OBS configuration/status, exposes WebSocket host/port/session-password, scene/source, resolution, and FPS fields, and provides UI actions for connection testing, Browser Source creation/update, disconnect, and canvas-size synchronization.
- The Studio output card now shows `OFFLINE`, `OBS`, `CONNECTED`, or `CAM ON`, supports one-click OBS output preparation, and starts/stops Virtual Camera when the installed OBS instance exposes it. Connection failures, ownership conflicts, missing passwords, timeouts, and unavailable virtual-camera drivers produce actionable Vietnamese messages.
- New installations default to the real loopback `obs-websocket` adapter on `127.0.0.1:4455`; mock remains an explicit testing choice. Passwords remain session-only and are not returned through IPC or persisted.
- Validation passes: `pnpm typecheck`, focused ESLint, OBS service tests, and `pnpm test:obs-smoke` (`OBS_SMOKE_OK kind=mock cycles=6 reconnect=ok`). The smoke exercises the restored settings controls, Browser Source output, six camera cycles, disconnect, and reconnect through the renderer/preload/main boundary.

## Session update - local video import and preview

- Project Studio's `Thêm video` now opens the native local video picker, stores a typed media reference, creates a named video layer, and selects it immediately.
- Selected local videos render in the canvas through a narrow IPC media-read method and are restored on project reload; files over 100MB are rejected from preview loading.
- Validation passes: Electron smoke, Studio inspector smoke, `pnpm typecheck`, and focused ESLint for the changed IPC/media files.

## Session update - per-layer canvas hit testing

- Project Studio now creates a hit target for every scene layer, with separate visual regions for text, GIF, secondary image, avatar, and background layers.
- Clicking a visible layer selects that exact layer; the active transform overlay keeps pointer control for moving/resizing/rotating it.
- Validation passes: Studio inspector smoke, `pnpm typecheck`, and focused Studio ESLint.

## Session update - direct canvas layer selection

- Clicking a rendered image, GIF, or text region in Project Studio now selects its corresponding scene layer and updates the layer toolbar/inspector immediately.
- Source-list selection remains available, while canvas interaction no longer requires returning to the `Nguồn` panel.
- Validation passes: Studio inspector smoke, `pnpm typecheck`, and focused Studio ESLint.

## Session update - meaningful source names

- Project Studio source rows now preserve asset names for newly added avatar, background, video, GIF, and sticker layers instead of generic numeric labels.
- Legacy `Avatar N` rows display the known reference asset name `Chinese Beauty Sale 3` so the source panel remains understandable.
- Validation passes: Studio inspector smoke, `pnpm typecheck`, and focused Studio ESLint.

## Session update - dynamic Studio canvas layers

- Removed the remaining hardcoded canvas dependency for the main preview: image visibility/source, text overlay visibility, and empty-state pseudo layers now follow the current scene layer collection.
- Reordering the top image layer changes the preview source; deleting image/text layers removes their corresponding visual content instead of leaving a static poster behind.
- Validation passes: focused Studio inspector smoke, `pnpm typecheck`, and focused Studio ESLint.

## Session update - orphan media notice fix

- Missing-media warning now ignores orphaned references that are not attached to any scene layer, preventing stale UUID/path entries from covering Project Studio.
- The remaining warning still appears for a genuinely missing file used by a layer, with bounded wrapping and repair controls.
- Validation passes: `pnpm test:project-persistence-smoke`, `pnpm typecheck`, and focused Studio ESLint.

## Session update - Project Studio parity restoration

- Restored the full reference-shaped Project Studio surface from the repository's internal source map, then adapted it to the current typed scene contracts without copying the read-only reference installation.
- Added functional text/image/avatar inspectors, transform and layer ordering controls, avatar script draft cancel/save/undo/redo, local Flower GIF preview, authored-scene preview parity, and a safe hydration/autosave guard that prevents stale UI state from overwriting externally published scenes.
- Validation passes: `pnpm test:text-inspector-smoke` (`STUDIO_TEXT_INSPECTOR_SMOKE_OK`), `pnpm test:project-persistence-smoke` (`PROJECT_PERSISTENCE_SMOKE_OK`), `pnpm test:scene-runtime-smoke` (`propagation=291ms`, `visualDiff=1.50%`), `pnpm test:electron-smoke` (`PHASE0_SMOKE_OK`), `pnpm typecheck`, and `pnpm lint`.
- Remaining parity work is the broader reference-vs-rebuild interaction and visual audit; production packaging/installers remain intentionally untouched.

## Session update - current Studio persistence smoke

- Updated `scripts/run-project-persistence-smoke.mjs` to exercise the current Projects card/menu workflow and recovered Studio source surface.
- The smoke now creates a text source through the current UI, persists it through typed project IPC, exports media references, verifies restart persistence, and verifies export/import persistence without relying on removed legacy selectors.
- Validation passes: `pnpm test:project-persistence-smoke` (`PROJECT_PERSISTENCE_SMOKE_OK`), `pnpm typecheck`, and `pnpm lint`.

## Session update - Studio gate repair

- Fixed the new Studio scene-serialization test helper so its media fixture input is typed before schema validation; the test still proves Vue reactive scene state becomes structured-clone-safe plain data.
- Removed obsolete `if (false)` branches from the Scene Runtime smoke harness after the Studio asset-browser workflow was replaced by deterministic typed project seeding. The smoke now validates the current UI/runtime boundary without dead code or lint exceptions.
- Validation passes: `pnpm typecheck`, `pnpm lint`, `pnpm test:electron-smoke`, focused manual playback/source-cleanup/scene-serialization tests (9 tests), and `pnpm test:scene-runtime-smoke` (`propagation=76ms`, `visualDiff=2.11%`).
- Reference comparison remains limited to read-only captured evidence; no reference binaries, private assets, profiles, cookies, or user media were copied.
- Exact next task: continue the remaining Phase 13 parity gaps, starting with authenticated Shop evidence and native user-media/OBS consumer verification when a safe fixture is available.

The requirement-by-requirement Phase 13/final-definition audit is maintained in `docs/PHASE_13_COMPLETION_AUDIT.md`.

## Current phase and status

- Phase 0 - Empty repository and development shell: complete.
- Phase 1 - Reference inventory and visual foundation: partial/in progress.
- Phase 2 - Projects, settings, and persistence: complete for rebuild exit criteria; exact authenticated reference interactions remain tracked separately.
- Phase 3 - TikTok Live connector: in progress; deterministic mock, IPC/UI, lifecycle, recording/replay, stream-end/error cleanup, isolated real room probe, and smoke evidence pass, while real-room event/reference connected-state verification remains pending.
- Phase 4 - Trigger, filtering, and moderation: complete for rebuild exit criteria; exact configured reference semantics remain tracked in `REF-013`.
- Phase 5 - Product catalog and matching: complete for rebuild exit criteria; exact authenticated reference semantics remain tracked in `REF-014`.
- Phase 6 - AI reply engine: complete for rebuild exit criteria; real providers and exact reference semantics remain tracked in `REF-015`.
- Phase 7 - TTS and interaction queue: complete for rebuild exit criteria; live providers and exact reference semantics remain tracked in `REF-016`.
- Phase 8 - Avatar Studio and scene editor: complete for rebuild exit criteria; exact configured-media/reference behavior remains tracked separately.
- Phase 9 - Local scene runtime: complete for rebuild exit criteria; exact configured reference output remains tracked in `REF-017`.
- Phase 10 - Avatar Studio, scene persistence & OBS output: complete for rebuild exit criteria; four-rail desktop Studio layout at 1280x720 and 1280x800 (tool rail, media/source library, 9:16 dot-grid canvas preview with empty state, audio sources card, Avatar script playlist, and OBS output card), layer properties and missing file recovery, "Dọn nguồn lỗi" broken source cleanup, non-overlapping Avatar script playback controller (idle script loop R1/R2..., customer response interruption & queueing, status badges), loopback Scene Runtime publishing (`127.0.0.1`), OBS WebSocket v5 adapter, and 26 unit test suites (139 tests) pass. Real OBS virtual camera hardware driver verification remains tracked in Phase 12 gaps.

- Phase 11 - TikTok Shop and product pinning: in progress; dedicated-profile/CDP foundation, mock and safe local-browser fixtures, exact-ID pinning, mapping, persisted schedule document, scheduler controls, and real signed-out seller-dashboard launch pass. Authenticated TikTok Shop/reference verification remains pending in `REF-011`.
- Phase 12 - Logs, diagnostics, and resilience: in progress; structured redacted logs, seven-service health aggregation, typed IPC/UI, validated database recovery, native/app instance locking, exact-owned Shop-browser orphan cleanup, restart/interrupted-operation smoke, and user-facing recovery notices pass, while long-run media/network evidence and reference diagnostics comparison remain pending.

## Session update - video output priority

- TikTok Shop authentication and scheduler verification are explicitly deferred while video output is prepared for livestream use.
- Started a clean Vite/Electron development session and reran `pnpm test:obs-smoke`: `OBS_SMOKE_OK kind=mock cycles=6 reconnect=ok`. This exercises Browser Source preparation, program-scene output, six virtual-camera start/stop cycles, and reconnect through the real renderer/preload/main boundary using the mock OBS adapter.
- OBS Studio is now installed and `obs64.exe` is running. Its WebSocket server is not yet listening on `127.0.0.1:4455`, so the application cannot connect until it is enabled in OBS.
- Exact next task: enable the OBS WebSocket server, configure the app for `obs-websocket`, then validate a user-selected video with embedded audio through Browser Source, Program output, OBS Virtual Camera, and a consuming live application.

## Session update - Vue Proxy serialization fix in Studio Scene Runtime publish

- **Root cause**: `sceneForOutput()` in `src/pages/ProjectStudioPage.vue` returned reactive Vue Proxy objects from `project.value.scene`, `layers.value`, and `mediaReferences.value`. Passing Vue proxies into Electron IPC (`sceneRuntime.publish` / `projects.saveScene`) caused Chromium `DataCloneError: An object could not be cloned`. This caused `publishOutput()` to fail, leaving `sceneRuntimeUrl` null, causing `layerSourceUrl()` to return null for local media and the preview canvas to render 0 items ("0 nguồn hiển thị").
- **Fix**: Used `toRaw()` combined with `projectSceneSchema.parse(...)` in `sceneForOutput()` to produce a plain, validated `ProjectSceneDocument` without Vue proxies. Updated `playbackPresentation()` to ensure `managedLayerIds` contains plain primitive strings. Updated `persist()` and `publishOutput()` to consume the un-proxied plain object.
- **Verification**:
  - Added unit test file `tests/unit/studio-scene-serialization.test.ts` demonstrating that reactive scene objects un-proxied via `toRaw()` and parsed with `projectSceneSchema` pass `structuredClone()` 100% cleanly without error.
  - All 27 unit test files (141 tests) **PASSED**.
  - `npx vue-tsc --noEmit` and `npx tsc -p electron/tsconfig.json --noEmit`: **PASSED** (0 errors).
  - `npx eslint src/pages/ProjectStudioPage.vue tests/unit/studio-scene-serialization.test.ts --max-warnings 0`: **PASSED** (0 warnings).
  - `node scripts/run-scene-runtime-smoke.mjs`: **PASSED** (`SCENE_RUNTIME_SMOKE_OK propagation=73ms visualDiff=1.28%`).
  - Preview canvas renders video/banner/layer correctly using loopback `/assets/<media-id>` URLs without `file://`.

## Session update - real OBS virtual-camera verification

- OBS Studio is installed and running with OBS WebSocket 5.7.4 available on loopback port 4455.
- A real OBS run now passes with a dedicated scene/source: `OBS_SMOKE_OK kind=obs-websocket cycles=1 reconnect=ok`. It verifies connection, Browser Source creation/update, ready SSE scene client, Program-scene activation, Virtual Camera start/stop, scene restoration, and reconnect.
- Fixed a real-OBS timing defect: OBS can acknowledge `StartVirtualCam` before `GetVirtualCamStatus` reports active. The service now polls the requested state for up to five seconds, preventing a stale `CONNECTED` UI and ensuring camera ownership is tracked before cleanup. Stopping an app-owned camera restores the prior Program scene.
- Added delayed-state coverage to the OBS service suite. Focused validation passes: 8 OBS service tests and focused ESLint. The workspace-wide `pnpm typecheck` remains blocked by the unrelated existing `tests/unit/scene-history.test.ts:32` `string`-to-`never` error.
- The smoke fixture intentionally contains no user media, so final operator evidence still requires selecting a real MP4 with embedded audio in Studio and confirming the rendered picture/audio in the intended live application. TikTok Shop remains deferred.

## What now works

- `pnpm dev:win` runs Electron against Vite HMR without creating an installer.
- Renderer isolation, typed/validated preload IPC, main-process logging, SQLite migration/persistence, Pinia, router, error boundary, and browser-only dev bridge work.
- Electron smoke confirms main window creation, renderer readiness, preload/IPC, and persistence across database reopen.
- Renderer now explicitly sends the preload readiness handshake after Vue mounts; the smoke harness accepts an explicit dev-server URL for safe testing when the default port is occupied.
- Reachable mock routes: login, registration, projects, templates, Grok/Veo settings, project Avatar Studio, and eight confirmed auxiliary surfaces.
- Core mock interactions: login validation, navigation, project creation, template selection, settings tabs/action feedback, editor tool selection, and layer add/delete.
- Editor parity slice now includes five-pane desktop layout, tool-specific asset/category states, background empty state, interaction/audio/output panels, export/start safety dialogs, and a functional livestream settings mock with reference defaults.
- The livestream settings mock now represents the audited TikTok Shop manager lifecycle: closed, opening, waiting for login, unavailable/empty products, retry, and a guarded pin toggle that cannot imply a real pin succeeded.
- Provider settings now include reference-shaped Grok/Veo3 counts, add/cancel form, validation, empty state, Veo3 account table, and enable/disable/delete mock actions without persisting or transmitting cookie data.
- Projects now have create validation, session-only creation, card delete controls, delete confirmation, and explicit success states; templates now use a preview/application confirmation dialog.
- Leaving the editor now shows the observed blocking save overlay before navigation completes.
- The account card now opens the observed profile-management dialog with local-only fields, required-name validation, cancel/save behavior, and session feedback.
- Native window close now opens the observed quit confirmation, supports cancel/quit and the remember-choice setting through narrow typed IPC, and has an isolated Electron smoke harness.
- The editor now includes the observed avatar-library and add-avatar dialogs, including local MP4 selection guidance and safe mock validation.
- Desktop and mobile layouts render without horizontal overflow.
- Registration now mirrors the observed five-field reference form, sequential validation messages, login return path, referral-code normalization, and an explicit local-only success state.
- Typed auxiliary-window IPC now opens secure frameless Electron windows for guide, feedback, monitor, payment, user, setup, and log; repeated requests focus and reuse the existing named window.
- A dev-only launcher under the existing `DEV` badge makes every confirmed auxiliary surface reachable during Phase 1 without pretending the still-unknown reference owning controls are known.
- The independently branded About window now follows the reference's exceptional light theme, centered version/update/log layout, source-link row, disclaimer, and footer; auto-update and reference-owned legal/link content remain deliberately disabled or replaced.
- A repeatable PNG comparison harness now produces pixel diffs, 50/50 overlays, and JSON mismatch metrics; it rejects different image dimensions instead of weakening evidence through resizing.
- The log auxiliary window now matches the observed clean reference state with `Mở tệp` and `Không có tệp nhật ký`; its action returns an explicit local-only notice and never opens reference files.
- Guide, feedback, monitor, payment, user, setup, and log windows now use exact clean-profile reference viewport measurements instead of the earlier assumed large sizes; minimum bounds also permit the 502x400 payment surface.
- Reference login and registration are now captured at 390x844. Both clip their forms outside a non-scrollable hero viewport; the rebuild intentionally keeps the forms visible and usable rather than reproducing this accessibility defect.
- A repeatable Electron capture runner now creates true 1550x838 PNG rebuild screenshots at the reference's 125% DPI geometry; it uses an isolated temporary profile and does not package or install anything.
- Template center now uses the observed fixed 203px card width, 12px gap, compact footer, matching heading/subtitle geometry, ten reference-role mock entries, five independently sourced role-matched photos, and original CSS campaign treatments.
- Login now reproduces the observed 40px titlebar, clipped desktop form placement, hero/logo anchors, public pitch copy, and decorative geometry while retaining the intentional accessible mobile override.
- Projects now expose the observed five-column desktop sequence, metadata ordering, empty-avatar poster state, create-control placement, and clipped final card. Create-form validation is rendered inside the modal instead of being hidden behind its backdrop.
- Editor desktop now preserves the reference's fixed 574px workspace and overflow model instead of shrinking the canvas to keep the mixer visible. The poster, tool rail, inset asset/source panels, source ordering, and offscreen right-side workspace geometry align to measured reference anchors.
- Projects now persist a schema-v5 product catalog with full local CRUD, enable/disable state, TikTok mapping, price, description, selling points, typed media, and versioned JSON import/export.
- The deterministic product matcher folds Vietnamese accents, uses exact-name score `1000` and threshold `160`, excludes disabled products, exposes five debug candidates, and returns stored facts without rewriting them.
- AI replies now support mock, OpenAI-compatible, OpenRouter, and Ollama adapters through typed main-process IPC, with model discovery, timeout, retry, cancellation, safe fallback, and session-only secrets.
- Prompt preview and live-feed replies use persisted system/persona/event templates plus matched catalog facts, then enforce two sentences, 45 words, 220 characters, banned terms, hidden-content rejection, and unsupported commercial-claim checks.

## Files changed

- Project/config: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, Vite/TypeScript/ESLint configs, README, gitignore.
- Desktop foundation: `electron/main`, `electron/preload`, `electron/ipc`, `electron/services`.
- Renderer foundation and Phase 1 UI: `src/app`, `src/components`, `src/pages`, `src/stores`, `src/shared`, `src/assets/mock`.
- Tests/scripts: `tests/unit`, `tests/integration`, `tests/smoke`, `scripts/run-electron-smoke.mjs`.
- Required control docs under `docs/` and `AGENTS.md`.

## Tests and validation

- `pnpm typecheck`: pass.
- `pnpm lint`: pass.
- `pnpm test`: 7 files, 22 tests pass, including synthetic screenshot-diff output, dimension-rejection coverage, measured auxiliary-window assertions, and clean-profile Guide/Feedback/Monitor/Setup/Payment state contracts.
- `pnpm compare:ui -- artifacts/reference/about.png artifacts/reference/about.png artifacts/comparisons/harness-proof`: pass with a 1920x1030 report, zero mismatched pixels, and both PNG outputs. This proves the harness path only; it is not a reference/rebuild parity claim.
- `AI_LIVESTREAM_DEV_SERVER_URL=http://127.0.0.1:5175/ pnpm capture:ui -- artifacts/rebuild`: pass with `UI_CAPTURE_OK` for login, projects, templates, and project editor; every output is a real 1550x838 PNG.
- The capture runner also accepts route and viewport filters. A Settings-only capture at a 1536x824 logical viewport produced a 1920x1030 PNG matching the authenticated reference dimensions.
- Direct screenshot measurements at threshold 0.1: login 5.6526%, projects 16.3270%, templates 45.3324%, and project editor 12.6332% mismatched pixels. These are prioritization measurements, not parity-pass scores.
- Settings measures 3.6747% mismatched pixels at 1920x1030. Its outer surface, tabs, provider heading, guide, full-width add action, external empty state, and bundled Inter typography are aligned; remaining fine offsets still prevent a parity claim.
- The measured login composition iteration reduced mismatch from 32.4917% to 5.6526% (26.8391 percentage points) by aligning the titlebar, hero anchors, clipped desktop form, public copy, decorative geometry, and confirmed form behavior.
- The measured project-home iterations reduced mismatch from 25.1728% to 21.7486% (3.4242 percentage points) by aligning window offsets, the five-card sequence, card metadata, empty-avatar state, create control, and the reference-observed Inter typography.
- Template mismatch is now 46.0563%, down 6.7616 percentage points from 52.8179%. The latest 1.9345-point reduction comes from role-matched public imagery and original CSS campaign treatments while preserving the measured shell/card geometry.
- The measured editor iterations reduced mismatch from 23.3109% to 12.6332% (10.6777 percentage points) by matching desktop overflow, canvas/poster anchors, inset left panels, source rows, visible public labels, and the pale-gold perfume scene role with independent imagery.
- `AI_LIVESTREAM_DEV_SERVER_URL=http://127.0.0.1:5175/ pnpm test:electron-smoke`: pass with `PHASE0_SMOKE_OK`, renderer handshake, and `did-finish-load`. Port 5173 was left untouched because another local repo owns it in this session.
- `AI_LIVESTREAM_DEV_SERVER_URL=http://127.0.0.1:5174/ pnpm test:close-smoke`: pass with native close request, cancel, second close request, remembered quit, clean process exit, and isolated temporary data.
- Electron/Vite watch mode rebuilt main and preload bundles and launched the workspace renderer successfully at `http://127.0.0.1:5175/` without packaging.
- Browser QA: page identity, meaningful DOM, no framework overlay, clean console, desktop/mobile screenshots, route navigation, template selection, login validation, and HMR pass. The latest login QA confirms a unique submit action, visible invalid-state feedback, and no horizontal overflow at 390x844.
- Editor Browser QA at 1550x838 and 390x844: clean console, no page-level mobile overflow, background tab/empty state, livestream dialog open/edit/save, and visible confirmation pass.
- Product-pin Browser QA at desktop and 390x844: Live Manager mock opens, reaches `Đang chờ đăng nhập · Không có sản phẩm`, retry remains available, the guarded pin switch stays false with an actionable notice, dialog scrolling works, and console remains clean.
- Settings Browser QA at 1536x824 and 390x844: correct route/title, meaningful DOM, no framework overlay, clean console, Grok required/success states with disposable local-only JSON, Veo3 table and enable/disable state, and no horizontal overflow pass.
- Projects/templates Browser QA at 1550x838: create validation, session card creation, delete confirmation/removal, ten template cards, template preview/apply notice, and clean console pass. Template QA at 390x844 also confirms no page-level horizontal overflow and a dialog width contained within the viewport.
- Editor leave QA confirms `Đang lưu dự án` / `Vui lòng đợi...` is visible before the home route completes.
- Profile Browser QA confirms whitespace-only validation, valid save/close, success notice, and a clean console.
- Exact editor geometry at the capture-equivalent 1240x670 logical viewport: titlebar x=5/y=5 at 40px high, project bar y=45 at 36px, tools 140px, left stack x=145 at 300x574, canvas x=445 at 856x574, and poster x=738.56/y=129 at 268.88x478. Mixer content begins below the captured viewport as in the reference.
- Home and editor Browser QA at a 390x844 mobile override confirms no page-level horizontal overflow and a clean console.
- Registration Browser QA confirms `/login` to `/register` navigation, all four observed validation errors, valid synthetic-form feedback, uppercase referral normalization, clean console, and no horizontal overflow at 390x844.
- Mobile auth comparison QA confirms the rebuild login and all five registration fields fit within 390x844, navigation remains functional, scroll width equals client width, and console errors/warnings are absent. This is a documented intentional deviation from the clipped reference mobile layout.
- `AI_LIVESTREAM_DEV_SERVER_URL=http://127.0.0.1:5175/ pnpm test:auxiliary-smoke`: pass with real BrowserWindow creation, isolated preload, guide renderer content, named-window reuse, About creation, and About-to-log launch (`AUXILIARY_WINDOW_SMOKE_OK`).
- The auxiliary smoke now also verifies the log empty state, `Mở tệp` interaction, and safe local-only response.
- The same real-Electron smoke verifies all seven confirmed auxiliary viewports, including User at 700x500, with a maximum one-pixel tolerance for Windows DPI rounding.
- Auxiliary Browser QA confirms all seven routes expose the expected reference title/close control. The Monitor now correctly remains behind the confirmed blocking `Đang tải...` overlay instead of simulating an unsupported refresh transition; the dev launcher reaches guide, console is clean, and user center has no horizontal or vertical overflow at 390x844.
- Log Browser QA at desktop and 390x844 confirms the reference-shaped empty state, unique open-file action, local notice, clean console, and no horizontal or vertical overflow.

## Reference comparison completed

- Read-only `app.asar` inventory and package metadata captured.
- Login, registration, project home, template center, settings, and project editor observed.
- A clean isolated reference profile launched successfully through a dedicated `--user-data-dir` and CDP port, created only empty defaults, and exposed the registration screen without copying authenticated profile data.
- The reference registration form and client-side errors were captured safely with synthetic invalid inputs; no account-creation request was completed.
- Auth state is server-validated: a fully synthetic JWT in the isolated profile remained on login. Authenticated project/template mutation auditing therefore still requires a dedicated non-secret account or another reversible fixture supplied by the reference environment.
- The renderer bridge exposes window-management and auxiliary subsystems including `app.windowOpen` and the product-pin window API.
- Exact-window audit confirms `autopin.open()` launches a reference-owned Chrome child with its own application profile and CDP port rather than an Electron auxiliary window. The bridge reports `checking` / `Đang mở TikTok Live Manager`, then `Đang chờ đăng nhập`; product retrieval is unavailable/empty while signed out. No cookies, profile values, or product data were read.
- Isolated runtime probes confirmed standalone auxiliary window keys and targets: `guide` -> `page/guide.html`, `feedback` -> `page/feedback.html`, `monitor` -> `page/monitor.html`, `payment` -> `page/payment.html`, `user` -> `page/user.html`, `setup` -> `page/setup.html`, and singular `log` -> `page/log.html`.
- Clean-profile auxiliary states observed include `Hướng dẫn` with `Đang tải...`, `Phản hồi`, `page.monitor.title` with `Làm mới` and `Đang tải...`, `Thanh toán`, `Trung tâm người dùng` with `Quay lại`, and `Khởi tạo`.
- Direct isolated navigation captured `about.html`: light titlebar, `Giới thiệu`, version/build, enabled update-check checkbox, `Nhật ký`, official-site area, AGPL disclaimer, Github/Gitee links, and footer. The actual framework/menu launch key remains unconfirmed.
- Type-only audits of the reference database and livestream storage confirm TTS/clone task columns, video-template preview/idle/waiting URLs, server/model metadata, ElevenLabs/OpenAI voice identifiers, reference-audio fields, five triggers, cooldowns, and product-pin settings without retaining values.
- Every primary editor tool panel was inventoried over window-scoped CDP, along with offline interaction/audio states and the livestream settings dialog/defaults.
- Grok add form and Veo3 account-table states/actions were inventoried over CDP and compared with the rebuild.
- Home save-transition copy and per-card delete controls were inventoried without activating destructive actions.
- Hidden reference dialogs inventoried through exact-window CDP include quit confirmation, profile management, avatar library, and add-avatar guidance; private account values were not recorded.
- Reference geometry/colors now confirm Inter, `#0b0b0d` root background, `#131316` titlebar, a 40px titlebar, 200px home sidebar, and the measured editor column/mixer proportions used by the rebuild.
- App data file structure, SQLite table schemas, livestream config shape, and shop-pin log behavior inspected without copying secrets or compiled source.
- Reference/rebuild evidence is stored locally under gitignored `artifacts/`; full parity is not claimed.

## Known gaps or blockers

- Full reference route/dialog/state inventory is incomplete; Phase 1 cannot be marked complete yet.
- Global-coordinate desktop automation is permanently excluded after a foreground-focus failure targeted the user's Chrome. All continuing reference work must remain scoped to the exact reference Electron renderer/window; no user Chrome interaction is permitted.
- Reference mobile login/registration are captured; authenticated screens, editor states, dialogs, and some secondary typography/overlay measurements remain uncaptured.
- The reference `Xuất video` action entered a native/blocking path; its resulting state is not yet safely inventoried.
- Direct hashes for auxiliary pages were the wrong launch model: most are standalone HTML windows. About content and the clean log state are now captured and rebuilt, but actual framework/menu launch controls, native log-file behavior, and authenticated/loaded auxiliary states remain unknown. Product pinning is separately confirmed to launch a dedicated Chrome process, not one of these auxiliary windows.
- User-center opening creates an embedded `user_web?` target. A fresh isolated run resolved without a clone error and confirmed loading, clean recovery, back-triggered network error, and refresh recovery; authenticated webview content remains pending. The 700x500 metadata can report 702x502 under the current 125% DPI rounding.
- Native picker and source-transform probing could not continue because an independently launched installed reference instance currently owns the authenticated profile without CDP. That process was not stopped or controlled; no credentials/profile data were copied.
- Create/delete/template dialogs in the rebuild are compatibility assumptions; the authenticated reference controls were not activated because they may mutate real profile data.
- Reference artwork cannot be copied. Role-matched public photos and original CSS treatments improve the template baseline, but the built-in ImageGen path is unavailable in this session and the required skill forbids silently switching to a key-backed CLI fallback.
- The legacy mislabeled JPEG captures have been replaced by true PNG output from the Electron capture runner; high mismatch percentages, especially templates, now remain as real visual work rather than an evidence-format blocker.
- Phase 1 controls are intentionally mock/local; real projects, persistence model, TikTok, AI, TTS, OBS, and shop features belong to later phases.
- Local machine uses Node.js 24; project remains compatible with Node.js 20-24.

## Exact next task

Continue reducing the template-center mismatch with additional independently sourced or built-in-generated role-matched artwork when the approved tool path is available. In parallel, resume exact-window inventory of safe source-transform/loading/recovery states; authenticated or mutating flows still require a reversible fixture.

## Session update - editor source inspectors

- Phase 0 remains complete. Phase 1 remains partial/in progress; no full-parity or product-completion claim is made.
- The editor now has 12 typed image/text/avatar source rows, independent selection, source-specific inspectors, and a reference-shaped avatar-script dialog.
- The script workflow includes Manual/TikTok Live Manager tabs, product and script additions, a guarded Phase 7 AI action, local-only mock save, and disabled video generation. It does not imply that AI, persistence, or rendering is implemented.
- Reference-safe CDP audit confirmed selected-source behavior, Moveable selection handles, text/image/avatar inspector fields, and the avatar-script dialog. Private account labels/values were not retained.
- Reference evidence added under `artifacts/reference/project-editor-*-selected.png` and `artifacts/reference/project-editor-avatar-script-dialog.png`.
- Browser QA passed for all three inspectors, dialog interactions, Manager waiting-login state, mobile containment, and clean desktop/mobile consoles.
- The source scrollbar now uses a thin dark treatment matching the reference. Strict 1550x838 comparison improved the richer editor state from 18.4251% to 18.0085%, within 0.013 percentage points of the earlier 17.9955% shell-only baseline.
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm test`: 6 files and 15 tests pass.
- Files changed in this slice: `src/pages/ProjectStudioPage.vue`, `src/app/theme.css`, `scripts/reference-cdp-audit.mjs`, `docs/REFERENCE_INVENTORY.md`, `docs/REFERENCE_GAPS.md`, `docs/UI_PARITY.md`, `docs/TEST_MATRIX.md`, and `docs/STATUS.md`.
- Known gaps: source transform mutations, avatar-script AI/save/video outcomes, authenticated/mutating reference flows, configured live/audio states, native picker/export paths, and full visual parity.
- Exact next task: safely terminate only the audited reference process tree, then continue Phase 1 with exact-window recovery/loading-state inventory and measured template/editor parity work. Phase 2 must not begin until the Phase 1 inventory and reachable-screen criteria are demonstrably satisfied.
- Reference cleanup completed: the validated process tree rooted at PID 7948 was stopped, CDP port 9228 closed, dev server `127.0.0.1:5175` still returns HTTP 200 under PID 25232, and the unrelated `::1:5173` listener under PID 18388 remains untouched.
- Updated exact next task: continue Phase 1 by relaunching a reference audit instance only when needed, then inventory safe loading/error/recovery states and reduce the largest measured visual gaps without packaging an installer.

## Session update - login failure and recovery

- Phase 0 remains complete. Phase 1 remains partial/in progress.
- A new isolated reference profile on CDP 9228 confirmed that password visibility toggles the input type, `Remember me` defaults off, application-managed fields are not native-required, and a rejected login bridge produces `Email hoặc mật khẩu không đúng` after about 100 ms while leaving the submit button enabled.
- Terms, Policy, and Help were traced without route changes or bridge calls. No real credential or external authentication request was used.
- The rebuild login now matches the observed subtitle, placeholders, password-eye behavior, remember copy/default, and invalid-credential message. A `.invalid` fixture safely exposes the failure state, and legal/support actions show explicit Phase 1 notices.
- Added `src/shared/login-validation.ts` and `tests/unit/login-validation.test.ts`.
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm test`: 7 files and 19 tests pass.
- Fresh in-app Browser QA now passes on desktop and at 390x844: the password visibility control works, remember defaults off, the exact invalid-credential alert appears without navigation, submit remains enabled, the guarded Terms notice renders, all form/legal controls remain reachable, mobile `scrollWidth` equals `clientWidth`, and no framework overlay is present.
- A fresh same-size capture and comparison records 5.6526% login mismatch in `artifacts/comparisons/login-recovery/report.json`, improving the prior 5.6646% baseline without dropping the confirmed recovery behavior.
- The isolated reference tree rooted at PID 11376 was stopped; CDP 9228 closed. Dev HMR is running at `127.0.0.1:5175` under PID 4980, and the unrelated `::1:5173` listener under PID 18388 remains untouched.
- No installer, production build, signing, or packaging command was run.
- Exact next task: continue Phase 1 exact-window inventory of safe loading/error/recovery states and reduce the largest measured template/editor gaps; authenticated or mutating reference flows remain blocked on a dedicated non-secret fixture.

## Session update - Monitor blocking loading state

- Phase 0 remains complete. Phase 1 remains partial/in progress; no full-parity claim is made.
- An isolated reference window opened through `$mapi.app.windowOpen('monitor')` at the exact 702x502 viewport. Its light full-body `Đang tải...` overlay remained present and intercepted the underlying `Làm mới` button.
- The rebuild removed the unsupported `Đang làm mới...` timer, added a typed clean-profile loading contract, blocks refresh, and matches the light titlebar/overlay geometry.
- The shared light auxiliary shell improves the current 878x628 Monitor comparison to 0.4806% in `artifacts/comparisons/monitor-light-shell/report.json`.
- Browser QA at 702x502 confirms the status text, disabled refresh, overlay coverage, no framework overlay, and `scrollWidth === clientWidth`.
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm test`: 7 files and 20 tests pass. `pnpm test:auxiliary-smoke`: pass with `AUXILIARY_WINDOW_SMOKE_OK`.
- The reference tree rooted at PID 21796 was stopped and CDP 9228 closed. Dev HMR is restored at `127.0.0.1:5175` under listener PID 6744; the unrelated `::1:5173` listener under PID 18388 remains untouched.
- No installer, production build, signing, or packaging command was run.
- Exact next task: audit and align the remaining safe Guide/Feedback loading surfaces, then resume the larger template/editor visual gaps. Loaded/authenticated auxiliary states still require appropriate fixtures.

## Session update - Guide loading and Feedback empty states

- Phase 0 remains complete. Phase 1 remains partial/in progress; no full-parity claim is made.
- Exact-window reference audit confirms Guide at 800x542 as a light full-body `Đang tải...` state with no body controls, and Feedback at 700x600 as a light shell with a completely empty body.
- The rebuild now shares the measured light auxiliary shell across Guide, Feedback, and Monitor. Typed contracts prevent invented clean-profile content or actions.
- Same-size comparisons record Guide 0.3068%, Feedback 0.0448%, and the updated Monitor 0.4806% mismatch.
- Browser QA confirms exact titles/states, zero page-level horizontal overflow, no framework overlay, and no interactive Feedback body content.
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm test`: 7 files and 21 tests pass. `pnpm test:auxiliary-smoke`: pass after asserting Guide status and Feedback emptiness.
- The isolated reference tree rooted at PID 16432 was stopped and CDP 9228 closed. Dev HMR is running at `127.0.0.1:5175` under listener PID 12852; the unrelated `::1:5173` listener under PID 18388 remains untouched.
- No installer, production build, signing, or packaging command was run.
- Exact next task: audit the remaining safe Setup and Payment clean/error surfaces, then continue reducing template/editor visual gaps. Loaded/authenticated auxiliary states remain fixture-dependent.

## Session update - Setup split and Payment unavailable QR

- Phase 0 remains complete. Phase 1 remains partial/in progress; no full-parity claim is made.
- Exact-window reference audit confirms Setup at 800x542 as a blank 156px left pane plus bordered empty right pane.
- Payment at 502x400 renders a blank QR frame and `Quét mã WeChat / Alipay`; opening rejects with `An object could not be cloned`, but the renderer remains inspectable and no usable QR data appears.
- The rebuild matches the visible states, marks the QR as unavailable for assistive semantics, and intentionally opens reliably instead of reproducing the bridge serialization failure.
- Same-size comparisons record Setup 0.2080% and Payment 0.6978% mismatch.
- Browser QA confirms exact pane width, unavailable QR placeholder, correct prompt, no body controls, no horizontal overflow, and no framework overlay.
- `pnpm typecheck`: pass. `pnpm lint`: pass. `pnpm test`: 7 files and 22 tests pass. `pnpm test:auxiliary-smoke`: pass with Setup/Payment assertions.
- The isolated reference tree rooted at PID 22116 was stopped and CDP 9228 closed. Dev HMR is running at `127.0.0.1:5175` under listener PID 22392; the unrelated `::1:5173` listener under PID 18388 remains untouched.
- No installer, production build, signing, or packaging command was run.
- Exact next task: audit the remaining safe User/Payment recovery ownership where possible, then return to the large Template and Editor mismatch ledger. Authenticated webview content still requires an appropriate non-secret fixture.

## Session update - User Center recovery lifecycle

- Phase 0 remains complete. Phase 1 remains partial/in progress; no full-parity claim is made.
- Two fresh isolated reference profiles confirmed `$mapi.app.windowOpen('user')`, the `user.html` owner, and the `user_web?` target without touching personal browser/profile data. The latest bridge call resolved with `undefined` rather than reproducing the earlier clone failure.
- The visible lifecycle is now captured: centered `Đang tải...`, blank light recovery with `Quay lại`, then `Tải thất bại, vui lòng kiểm tra mạng` plus `Làm mới` after the back action. The back action neither closes the window nor invokes the patched app/user bridges.
- The rebuild now uses the shared light auxiliary shell and implements loading → recovery, back-triggered error, and refresh recovery. Static `userState` fixtures keep each audited state repeatably capturable without external requests.
- Same-size 878x628 comparisons record 0.5365% loading, 0.5363% recovery, and 0.8575% error mismatch in `artifacts/comparisons/user-loading`, `artifacts/comparisons/user-recovery`, and `artifacts/comparisons/user-error`.
- Real-Electron smoke covers the full interaction loop, exact 700x500 window metadata, no overflow, no framework overlay, and named-window isolation. `pnpm typecheck`, `pnpm lint`, and all 23 tests pass.
- The validated reference trees were stopped and CDP 9228 is closed. Renderer-only HMR was restored at `127.0.0.1:5175` under listener PID 4792; the unrelated `::1:5173` listener under PID 18388 remains untouched.
- No installer, production build, signing, auto-update, or packaging command was run.
- Exact next task: return to the largest Phase 1 visual gaps, Template (46.0563%) and Editor (~18.0085%), while keeping authenticated User content pending on a dedicated non-secret fixture.

## Session update - Template role matching

- Phase 1 remains partial/in progress; no full-parity claim is made.
- The Template Center now uses bundled Inter and recomposes existing independent host/product photos into first-row beauty, haircare, and food roles closer to the captured reference. No reference image, logo, person, or poster artwork was copied.
- The `imagegen` skill was selected for independent poster generation, but its required built-in generation tool is unavailable in this session. The skill explicitly forbids silently switching to the key-backed CLI fallback, so no API/CLI generation was attempted.
- Fresh 1550x838 comparison improves Template mismatch from 46.0563% to 45.3324% in `artifacts/comparisons/templates-role-match/report.json`, a 0.7239-point gain in this slice and 7.4855 points better than the original 52.8179% baseline.
- `pnpm typecheck`, `pnpm lint`, and all 23 tests pass. Renderer-only HMR remains on `127.0.0.1:5175` under listener PID 4792; reference CDP 9228 is closed and the unrelated `::1:5173` listener under PID 18388 remains untouched.
- No installer, production build, signing, auto-update, or packaging command was run.
- Exact next task: continue Template refinement only where independent assets can materially help, then return to the ~18.0085% Editor gap and remaining Phase 1 inventory.

## Session update - Editor perfume scene role match

- Phase 1 remains partial/in progress; full feature/reference parity is not claimed.
- The editor keeps the exact measured shell and now uses an independently composed pale-gold perfume poster: independent host portrait, independent product still, public observed campaign copy, and CSS-built podium/offer treatments. No reference artwork or person was copied.
- The avatar card now presents a role-matched host thumbnail, and the desktop asset-browser inset moves from 12px to the measured 10px.
- Fresh strict 1550x838 comparison improves the richer editor state from 18.0085% to 12.6332% in `artifacts/comparisons/project-editor-perfume-role-match-screen/report.json`; this is 10.6777 points better than the original 23.3109% editor baseline.
- A fresh 390x844 Electron capture confirms the tool rail and source list remain internally scrollable and the new poster stays usable in the vertical layout.
- `pnpm typecheck`, `pnpm lint`, and all 23 tests pass. Renderer-only HMR remains on `127.0.0.1:5175`; reference CDP 9228 is closed.
- No installer, production build, signing, auto-update, or packaging command was run.
- Exact next task: continue the remaining Phase 1 route/dialog/state inventory and reduce Projects/Template gaps without copying reference assets; configured/authenticated and native mutation paths remain fixture-dependent.

## Session update - Projects role-matched previews

- Phase 1 remains partial/in progress; no full-parity claim is made.
- The first two project previews now use independent host/product compositions with the observed campaign roles, while the final product project uses a CSS-built beige slat/shelf treatment around an independent product photo. The empty-avatar and create cards remain unchanged.
- Fresh strict 1550x838 comparison improves Projects from 21.7486% to 16.3270% in `artifacts/comparisons/projects-role-match-shelf/report.json`; this is 8.8458 points better than the original 25.1728% baseline.
- A fresh 390x844 capture confirms the single-column project list remains usable without page-level horizontal overflow.
- `pnpm typecheck`, `pnpm lint`, and all 23 tests pass. Renderer-only HMR remains on `127.0.0.1:5175`; reference CDP 9228 is closed and the unrelated `::1:5173` service remains untouched.
- No installer, production build, signing, auto-update, or packaging command was run.
- Exact next task: continue safe Phase 1 inventory and Template refinement; authenticated/mutating flows still require a reversible non-secret fixture.

## Session update - functional editor controls

- Phase 1 remains partial/in progress; no full-parity or product-completion claim is made.
- The text inspector now edits the visible poster content, font, 12-96 size, validated color, alignment, bold, italic, and twenty deterministic presets. Presets preserve edited copy and formatting buttons expose pressed/accessibility state.
- The remaining enabled editor buttons found by static inventory now have explicit behavior: built-in/personal sticker tabs switch content, the selected For You/avatar tabs respond, and the livestream voice selector opens a local option list and retains selection.
- New unit coverage validates size clamping, color/content normalization, preset application, and the twenty-preset contract. A reusable isolated Electron smoke exercises the complete text/sticker/voice loop at 1240x669 and 390x844 with temporary profiles.
- Default editor comparison records 12.6345% in `artifacts/comparisons/project-editor-text-inspector-preserved/report.json`, effectively preserving the accepted 12.6332% baseline while adding real behavior. Interaction captures are under `artifacts/rebuild/text-inspector/`.
- The in-app Browser path was available but could not attach a newly created tab to this task's session after two attempts; QA therefore used the repo's isolated Electron/Playwright path. No personal browser/profile data was accessed.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:text-inspector-smoke`, and the full `pnpm test` gate pass; the suite now contains 8 files and 27 passing tests.
- Renderer-only HMR remains on `127.0.0.1:5175`; no installer, production build, signing, auto-update, or packaging command was run.
- Exact next task: continue the Phase 1 safe reference inventory for source transforms/configured live-audio states, then address remaining renderer controls whose behavior depends on those observations.

## Session update - functional selected-layer transforms

- Phase 1 remains partial/in progress; no full-parity or product-completion claim is made.
- Existing exact reference captures prove image, text, and avatar selected states use a Moveable-style box with eight resize points, an origin/rotation control, and a floating four-action layer-order toolbar. A clean isolated reference profile cannot enter the authenticated editor, so reference mutation math was not fabricated as confirmed behavior.
- The rebuild now has typed per-layer identity and transform state, pointer drag, eight-direction resize, rotation, keyboard arrow nudge, and functional top/up/down/bottom source ordering. Transform values are normalized to bounded local scene ranges.
- Unit coverage verifies transform normalization, translate/resize/rotate math, and all four reorder actions. The isolated Electron smoke exercises reorder, drag, resize, desktop rotation, text formatting, sticker tabs, and voice selection across 1240x669, 390x844, and the reference-sized 1536x824 viewport.
- Same-size 1920x1030 comparisons record 12.4424% for image selected, 12.6256% for avatar selected, and 12.8776% for text selected. The default editor remains 12.6345%, proving the selection layer does not alter the unselected baseline.
- Evidence is stored under `artifacts/comparisons/project-editor-*-selected-functional/` and `artifacts/rebuild/text-inspector/`.
- `pnpm typecheck`, `pnpm lint`, the expanded isolated Electron studio smoke, and the full suite pass; 9 files and 30 tests are green.
- No personal reference profile, browser data, native picker, installer, production build, signing, auto-update, or packaging path was used.
- Exact next task: inventory and model the remaining configured live/audio states that can be reached safely; reference transform persistence remains pending a reversible authenticated fixture.

## Session update - Phase 2 persistent project lifecycle

- Phase 1 remains partial because authenticated reference mutations/configured states still require a safe fixture. Phase 2 has started without claiming those Phase 1 gaps are closed.
- SQLite migration version 2 adds versioned project records containing validated metadata and a schema-versioned 1080x1920 scene document. An empty database seeds the four reference-shaped local cards once.
- Narrow typed preload/IPC methods now implement list, get, create, rename, duplicate, touch/open, and delete. The renderer uses a Pinia project store; browser-only Vite development uses an equivalent validated localStorage adapter.
- Project Home now loads persisted records, validates create/rename forms, exposes hover/focus rename/duplicate/delete actions, opens the stored project, and shows loading/error/retry states. The editor resolves its title from the persisted record.
- Database integration covers the full lifecycle across close/reopen. `pnpm test:project-persistence-smoke` exercises renderer → preload → IPC → SQLite, restarts Electron with the same isolated profile, verifies rename persistence and deletion durability, then opens the saved project in the editor.
- `pnpm typecheck`, `pnpm lint`, all 34 tests across 10 files, the project persistence smoke, and the Phase 0 real-Electron smoke pass.
- Fresh 1550x838 comparison records 16.3274%, effectively preserving the accepted 16.3270% Projects baseline. A fresh 390x844 capture confirms all three project actions fit the card without horizontal clipping.
- Main/preload bundles were refreshed through a temporary full dev-compiler pass, then renderer-only HMR was restored on `127.0.0.1:5175`; no production build, packaging, installer, signing, or auto-update path was used.
- Exact next task: add atomic project document autosave plus export/import and migration backup/recovery, then connect editor layer/text state to the persisted scene document.

## Session update - Phase 2 scene autosave and portability

- Project scene schema v2 replaces the earlier unknown layer array with validated ordered layer records, bounded transforms, and the shared Text Inspector state.
- Editor layer order/transform and text changes autosave after 350ms through typed IPC and flush before route leave. Reopening after a full Electron restart restores the saved text and layer document.
- Portable export uses a validated `ai-livestream-project` JSON envelope. The Project Home export action produces a real download; the create dialog imports a selected JSON file through the same validated contract and assigns a fresh local ID.
- The expanded persistence smoke exports from one isolated profile and imports through the UI into a second clean Electron profile. Database integration also verifies export/import content survival.
- Existing scene v1 records migrate to v2. A pending database migration first copies the previous SQLite file to `.bak`; integration coverage constructs a legacy database and verifies both backup creation and document recovery.
- `pnpm typecheck`, `pnpm lint`, all 36 tests across 10 files, and the expanded three-profile project persistence/autosave/import-export smoke pass.
- Desktop Projects comparison remains 16.3274%. The 390x844 action cluster now uses four compact controls without clipping; exact authenticated reference mutation UI remains pending.
- Exact next task: persist remaining editor image/avatar/script settings, implement missing-media path detection/repair, and complete global/per-project settings plus interrupted-save recovery evidence.

## Session update - Phase 2 per-project settings and media recovery

- Phase 2 remains in progress; Phase 1 authenticated/configured reference gaps remain open, and no full-parity claim is made.
- Project scene schema v3 now persists image radius/background controls, avatar product/script state, TikTok username, voice, cooldowns, minimum pin time, product-pin preference, all five trigger enable states, and typed absolute media references. Shared migration accepts older v1/v2 scene documents and portable exports.
- The main process exposes only typed media existence checks and an OS picker. The renderer has no general filesystem access. Missing references render a conditional repair banner; existing references are not falsely flagged, and the default editor layout remains unchanged when no references exist.
- Atomic database recovery now promotes a valid orphaned `.tmp` file when the primary database is absent; the existing pre-migration sibling `.bak` behavior remains covered.
- `pnpm typecheck`, `pnpm lint`, all 39 tests across 11 files, `pnpm test:electron-smoke`, and the expanded three-profile `pnpm test:project-persistence-smoke` pass. The smoke verifies restart plus clean-profile export/import for image, avatar, livestream, trigger, and media state.
- Fresh 1550x838 comparisons record Projects 16.3295% and Editor 12.6120% in `artifacts/comparisons/projects-phase2-settings/` and `artifacts/comparisons/project-editor-phase2-settings/`; both preserve or slightly improve the accepted baselines.
- Main/preload bundles were refreshed through a temporary dev compiler on `5176`, then that exact process tree was stopped. Renderer-only HMR remains at `127.0.0.1:5175`; the unrelated `::1:5173` listener was not touched.
- No installer, production build, signing, auto-update, packaging, or reference mutation was run.
- Exact next task: persist the remaining global Settings-page provider/application state through the typed settings boundary, then verify restart/error recovery and update the Phase 2 exit ledger.

## Session update - Phase 2 global settings and exit gate

- Phase 2 rebuild exit criteria are complete. This does not close Phase 1 reference gaps and is not a full application-parity claim.
- Global Settings now persists a versioned safe document through dedicated validated preload/IPC methods. The generic settings writer rejects the reserved key. Grok labels/status, Veo visible/enabled state, and the active provider tab survive Electron restart; disposable JSON is cleared and never stored.
- Invalid persisted settings fail closed to defaults with an explicit recovery action. `pnpm test:settings-persistence-smoke` verifies IPC rejection, restart, secret non-persistence, a deliberately malformed SQLite record, and reset to schema v1 across three isolated profiles.
- Startup now restores the last validated project only on a fresh root launch. The project persistence smoke confirms direct editor restoration after Electron restart while preserving deletion, autosave, settings, media detection, and export/import evidence.
- Phase 2 exit evidence now covers project CRUD/import/export, schema v3 autosave, global/per-project settings, `.bak` migration backup, orphaned `.tmp` recovery, last-project restoration, and visible repair actions for broken media paths.
- Final gates: `pnpm typecheck` and `pnpm lint` pass; all 40 tests across 11 files pass; `pnpm test:electron-smoke`, `pnpm test:project-persistence-smoke`, and `pnpm test:settings-persistence-smoke` pass. Settings default comparison is 3.6918%; Projects remains 16.3295%; Editor remains 12.6120%.
- Main/preload bundles were refreshed through the temporary `5176` dev compiler and its exact process tree was stopped. Renderer-only HMR remains on `127.0.0.1:5175`; the unrelated `::1:5173` listener remains untouched.
- No installer, production build, signing, auto-update, packaging, personal profile access, or reference mutation was performed.
- Exact next task: resume Phase 1 safe reference inventory where possible, then begin Phase 3 with replaceable TikTok real/mock connector interfaces, normalized events, lifecycle cleanup, fixtures, and interaction-feed states while keeping real-room verification explicit.

## Session update - Phase 3 TikTok Live connector

- Added a replaceable connector boundary with deterministic mock events and a public `tiktok-live-connector` real adapter. Vendor objects are normalized into chat, gift, like, follow, share, stream-end, and error contracts before crossing the service/IPC boundary.
- Gift streaks are processed only when `repeatEnd === true`. The feed is capped at 200 items; reconnect uses generation tokens to reject stale callbacks and cannot duplicate the prior listener set.
- The project editor now supports local mock or real TikTok source selection, connection status, five counters, normalized event cards/timestamps, clear, reconnect, fixture replay, recording download, stop, and route-leave cleanup. The browser-only HMR bridge implements the same safe mock contract.
- Stream-end and error callbacks now clear active room metadata, invalidate subsequent callbacks, emit a normalized diagnostic event, and disconnect the active adapter. Main-process shutdown still awaits service cleanup before Electron exits.
- Focused unit coverage now includes stream-end/error state transitions and resource release in addition to all five normalizers, completed-gift handling, reconnect, stale-event rejection, recording, and replay.
- `tiktok-live-connector@2.4.3` is externalized from the Electron main bundle to avoid bundling optional WebSocket native accelerators. Its AGPL-3.0 terms require a dedicated review before any future distribution; no package/installer/build was produced.
- Evidence: `artifacts/rebuild/live-connector/mock-five-events.png`; default offline editor remains visually stable at 12.6345% mismatch in `artifacts/comparisons/project-editor-live-default/report.json`.
- Known blocker: no appropriate real room/reference configured fixture is available for ethical verification of all five interactions. Phase 3 remains in progress, and no real-room or full-reference parity claim is made.
- Exact next task: begin Phase 4 with a deterministic trigger/filter decision engine and Vietnamese fixture corpus while keeping `REF-012` open for later real-room verification.

## Session update - Phase 4 trigger/filter/moderation engine

- Added a pure deterministic moderation engine with stable accepted/skipped reason codes and ordered decision traces. It consumes only normalized events and cannot execute viewer content or invoke providers/audio.
- Implemented lowercase and Vietnamese accent folding; URL, empty, punctuation-only, emoji-only, trivial-greeting, and minimum-length filters; allow/block keyword precedence; banned-output inspection; viewer-scoped 45-second duplicate detection; 2-second global cooldown; and 30-second per-user cooldown.
- Added 55 Vietnamese fixture cases plus stateful tests for exact cooldown/duplicate boundaries, action-ignore, default-disabled likes, settings replacement, output bans, and trace structure.
- The live store now processes each event ID once, shows its decision in the feed, bounds decisions to 200 items, and accepts settings updates without reconnecting. Electron smoke changes the chat action to `ignore` while the mock session stays connected and verifies the new decision on replay.
- Project schema v4 persists event actions, duplicate/minimum-length values, allow/block keywords, and banned output terms. Migration preserves v3 TikTok username, voice, cooldowns, pin settings, enabled triggers, and maps legacy `reply: voice_tts` to `actionType: voice_tts`.
- Persistence smoke verifies the new settings through autosave, Electron restart/export, and clean-profile import. Main/preload bundles were refreshed through a temporary compiler on `5176`; no listener remains there, renderer HMR remains on `5175`, and unrelated `5173` remains untouched.
- Reference comparison remains partial: default trigger/cooldown values are confirmed, but exact reference filter ordering, duplicate identity, keyword UI/precedence, banned-output handling, and decision display require a safe configured feed. `REF-013` remains open.
- No installer, packaging, production build, signing, auto-update, personal profile access, or reference mutation was performed.
- Exact next task: begin Phase 5 with versioned product catalog CRUD/import/export and the deterministic accent-insensitive matcher, while Phase 3 real-room and Phase 1 reference gaps remain explicitly open.

## Session update - Phase 5 product catalog and matcher

- Phase 5 rebuild exit criteria are complete. This does not close Phase 1, Phase 3, `REF-013`, `REF-014`, or the full application parity requirement.
- Added schema-v5 project products, validated catalog contracts, CRUD helpers, JSON import/export, deterministic accent-insensitive matching, exact-name score `1000`, threshold `160`, disabled exclusion, and top-five candidate diagnostics.
- The editor exposes a responsive catalog modal with all required fields, native typed image selection, save/cancel, import/export, and live matcher debugging. A Vue proxy clone crash and a nested-backdrop pointer interception defect were found by smoke/Browser QA and fixed through schema cloning plus explicit modal stacking.
- Persistence smoke adds `Serum dưỡng ẩm M5`, verifies matcher score `1000`, exports/imports catalog JSON, and confirms every product field survives autosave, Electron restart, project export, and clean-profile import. Older scenes are asserted to migrate with `products: []`.
- Final gates: `pnpm typecheck`, `pnpm lint`, 58 tests across 14 files, `pnpm test:electron-smoke`, `pnpm test:settings-persistence-smoke`, `pnpm test:project-persistence-smoke`, and `pnpm test:live-connector-smoke` all pass.
- Browser QA at `http://127.0.0.1:5175/#/projects/perfume` confirms page identity, meaningful DOM, no framework overlay, clean console, clickable nested modal, visible `Serum dưỡng ẩm M5 · 1000`, and no horizontal modal overflow at 390x844. Browser screenshots were emitted in-session; its attempted local file path did not map into the workspace, so no false artifact path is recorded.
- Reference comparison remains partial: signed-out TikTok Shop behavior and compatibility constants are known, but authenticated catalog fields, validation, import/export, token scoring, tie-breaking, and diagnostics are not safely available. `REF-014` remains open.
- Renderer HMR remains on `127.0.0.1:5175`; the unrelated `::1:5173` service was not altered. No installer, production build, packaging, signing, auto-update, personal profile access, or reference mutation was performed.
- Exact next task: implement Phase 6 AI provider contracts/adapters and the fact-grounded short-reply engine, keeping network providers behind replaceable interfaces and using deterministic mock coverage first.

## Session update - Phase 6 AI provider and reply engine

- Phase 6 rebuild exit criteria are complete. This does not close Phase 1, Phase 3, `REF-013`, `REF-014`, `REF-015`, live-provider verification, or full application parity.
- Added typed mock/OpenAI-compatible/OpenRouter/Ollama adapters in the main process, connection test/model discovery, bounded HTTP parsing, timeout, retry, cancellation, and cleanup of active controllers. Public kind/base/model metadata persists, while API keys remain session-only and never cross back to the renderer or enter SQLite/project/export data.
- Project schema v6 persists system/persona prompts, five event templates, timeout, retry count, and fallback preference. Migration gives older scenes safe defaults; project persistence smoke verifies autosave, restart, export, and clean-profile import for these fields.
- Prompt generation explains event/persona/product context. Output cleanup enforces one or two sentences, 45 words, and 220 characters; removes markdown/internal prefixes; rejects hidden prompt/key language, banned terms, and unsupported price/stock/discount/shipping claims; and produces deterministic safe fallbacks without blocking later interactions.
- The live store now invokes AI only for accepted `ai_speech` decisions, attaches results to feed events, rejects stale results after clear/dispose, and cancels active provider requests when the feed is cleared or the project closes.
- Browser QA at `http://127.0.0.1:5175/#/projects/perfume` confirms mock connection, prompt preview with product score `1000` and stored price `299.000đ`, final fact-grounded reply, clean console, and a 390x844 dialog with `clientWidth === scrollWidth` (`365px`).
- Final gates: `pnpm typecheck`, `pnpm lint`, all 72 tests across 17 files, `pnpm test:electron-smoke`, `pnpm test:settings-persistence-smoke`, `pnpm test:project-persistence-smoke`, `pnpm test:live-connector-smoke`, and `pnpm test:ai-reply-smoke` pass. AI screenshot evidence is `artifacts/rebuild/ai-reply/mock-prompt-preview.png`.
- Main/preload dev bundles were refreshed through a temporary compiler on `5176`, then its exact process tree was stopped. Renderer HMR remains on `127.0.0.1:5175`; only the unrelated `::1:5173` listener remains alongside it and was not altered.
- No installer, production build, packaging, signing, auto-update, real API key, personal profile access, live-provider request, or reference mutation was performed.
- Exact next task: implement Phase 7 bounded interaction/TTS queue with non-overlapping playback, HTTP/local provider adapters, Windows speech fallback, 120-second timeout, cancellation, retry, and idle/talking events.

## Session update - Phase 7 TTS and interaction queue

- Phase 7 rebuild exit criteria are complete. This does not close Phase 1, Phase 3, `REF-013` through `REF-016`, live-provider verification, or the full reference-parity requirement.
- Added schema-v7 TTS settings, typed provider/IPC contracts, deterministic mock, replaceable HTTP audio, and renderer Windows speech playback. Public provider metadata can persist, while API keys remain session-only and never return through IPC or enter SQLite, project documents, or exports.
- The bounded interaction queue exposes every required state, accepts at most 100 active jobs, plays one item at a time, coalesces UI notifications, keeps 300 history records, supports skip/clear/retry, cancels AI/TTS/playback, and emits idle/talking avatar state. A 300-job test completes without overlap or listener growth.
- Accepted `voice_tts` and `ai_speech` live decisions now share the queue. Clear, connect, reconnect, project leave, and app shutdown release active work; failed/cancelled items can retry without deadlocking later jobs.
- Browser QA at `http://127.0.0.1:5175/#/projects/perfume` passes at 390x844: page width `375 === 375`, dialog width `365 === 365`, internal scrolling works, preview completes, queue controls remain usable, and the console is clean. Evidence is under `artifacts/rebuild/tts-queue/`.
- Final gates: `pnpm typecheck`, `pnpm lint`, all 81 tests across 19 files, `pnpm test:electron-smoke`, `pnpm test:settings-persistence-smoke`, `pnpm test:project-persistence-smoke`, `pnpm test:live-connector-smoke`, `pnpm test:ai-reply-smoke`, and `pnpm test:tts-queue-smoke` pass.
- Renderer HMR remains on `127.0.0.1:5175`; the unrelated `::1:5173` listener remains untouched. No installer, production build, packaging, signing, auto-update, real provider secret, personal profile access, or reference mutation was performed.
- Exact next task: begin Phase 8 with versioned scene/layer contracts and undoable Avatar Studio mutations, preserving the current fast local HMR loop and keeping `REF-016` open for later live/reference comparison.

## Session update - Phase 8 scene and layer foundation

- Phase 8 is in progress and is not complete. Project schema v9 now supports portrait/landscape 1080p presets, persistent layer rendering metadata, and controlled built-in/media/text source descriptors with migration from legacy layers.
- Added a bounded 100-step scene-layer history that clones nested transform/chroma state, drops redo after divergent edits, and ignores identical commits. Editor actions now cover add, select, delete, duplicate, rename, hide/show, lock/unlock, opacity, four-level reorder, keyboard nudge, drag, resize, rotate, undo, and redo.
- Locked layers cannot be deleted, reordered, nudged, dragged, resized, or rotated. `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`, `Ctrl/Cmd+D`, and `Delete` are wired outside form fields.
- Browser QA verifies rename, visibility, undo, lock guards, duplicate `12 -> 13`, undo `13 -> 12`, redo `12 -> 13`, clean console, desktop rendering, and mobile width `375 === 375`. Evidence: `artifacts/rebuild/studio/phase8-layer-history-desktop.png` and `phase8-layer-history-mobile.png`.
- Validation passes: focused 16-test schema/history/database/transform set, full 84 tests across 20 files, sequential `pnpm typecheck` and `pnpm lint`, `pnpm test:project-persistence-smoke`, and `pnpm test:text-inspector-smoke`. Main/preload dev bundles were refreshed through temporary `5176`, then its exact process tree was stopped.
- HMR remains on `127.0.0.1:5175`; unrelated `::1:5173` remains untouched. No installer, production build, packaging, signing, auto-update, reference mutation, or personal-profile access was performed.
- Exact next task: expose canvas preset switching and real per-layer media/render properties, then extend history to those mutations and verify restart fidelity for both 9:16 and 16:9 scenes.

## Session update - Phase 8 canvas and render controls

- Phase 8 remains in progress. The project bar now switches between `1080 × 1920 · 9:16` and `1920 × 1080 · 16:9`; the preview changes geometry immediately, autosaves, and participates in undo/redo.
- Active non-text layers expose fit mode, chroma enable/color/tolerance, video/GIF loop, video mute, and avatar idle/talking/none role. `fitMode` changes actual media `object-fit`; avatar role changes visibility from queue idle/talking state without recreating the media node.
- Chroma configuration is validated, visible, persisted, and applied per pixel on a canvas while the underlying image/video element remains mounted. The implementation mirrors contain/cover/fill geometry and keeps video playback active while chroma is toggled.
- Browser QA measured portrait `268.875 × 478` and landscape `734.4 × 413.1`, verified preset undo, `object-fit: fill`, chroma indicator, avatar talking opacity `0` while idle and idle opacity `1`, video loop/mute history, clean desktop/mobile console, and mobile width `375 === 375`.
- Persistence smoke now verifies landscape dimensions, fit/lock/chroma metadata, and a controlled built-in video source through autosave, Electron restart, project export, and clean-profile import.

## Session update - Phase 8 real media and canvas tools

- Stable keyed runtime layers now render controlled built-in images, avatars, text, and a CC0 MP4. Video playback advances with `readyState=4`, remains unpaused during avatar/chroma changes, and keeps one media element while display state changes.
- Pixel chroma runs at a capped frame rate on a sibling canvas. Browser diagnostics observed `262989 / 303142` transparent pixels with the selected fixture/key while the hidden source video continued playing; unit tests cover color removal and contain/cover/fill drawing geometry.
- The project bar now exposes grid, snapping, 50-200% zoom, and portrait/landscape controls. Center/grid snapping has deterministic unit coverage and temporary center guides; Ctrl/Cmd `+`, `-`, and `0` control zoom.
- Source rows now include image/type thumbnails. Render ordering follows the source list (`top` is visually topmost), while the selection/order overlay stays above media.
- Browser QA passes at desktop and 390x844 with clean console and `scrollWidth === clientWidth`; artifacts include `phase8-real-media-*`, `phase8-grid-zoom-thumbnails-*`, and `phase8-pixel-chroma-desktop.png` under `artifacts/rebuild/studio/`.
- Current gate: `pnpm typecheck`, `pnpm lint`, 89 tests across 21 files, project persistence, text inspector, Electron, settings, live connector, AI reply, TTS queue, close confirmation, and auxiliary-window smokes pass when resource-heavy Electron smokes run sequentially.
- Phase 8 remains partial because paired idle/talking media authoring, explicit GIF runtime evidence, scene duplicate/import/export UI, and exhaustive undo/redo for text/image/avatar inspector mutations are not yet demonstrated; exact configured-media reference parity is also unavailable.
- Evidence: `artifacts/rebuild/studio/phase8-landscape-render-controls.png`, `phase8-landscape-render-controls-mobile.png`, and updated project-persistence screenshots. HMR remains on `127.0.0.1:5175`; unrelated `::1:5173` remains untouched.
- Exact next task: create real typed image/GIF/video/avatar layer sources with stable media elements, then add grid/guides/snapping/zoom and a pixel chroma-key preview pipeline.

## Session update - Phase 8 exit gate

- Phase 8 rebuild exit criteria are complete. This does not close Phase 1, Phase 3, `REF-012` through `REF-016`, configured-media reference parity, or the full application objective.
- Scene history now snapshots canvas preset, layers, text typography, image removal/radius settings, and nested avatar product/script settings. Text/image/avatar inspector changes undo and redo; avatar script editing uses isolated drafts so close/backdrop/Cancel never mutates saved state.
- Added a controlled CC0-derived animated `flower-gif` source and one-action idle/talking avatar pairing with distinct `template-host` and `beauty-model` sources. Electron evidence verifies GIF frames advance and paired avatar nodes remain mounted while TTS changes only opacity from idle to talking and back.
- Project-level create/duplicate/autosave/restart/JSON export/import is the scene lifecycle for the current one-scene-per-project model. Persistence smoke verifies GIF and both avatar roles survive restart and clean-profile import.
- Fixed modal stacking above transform overlays after persistence QA found a full-canvas avatar selection could intercept livestream dialog controls.
- Final gate: `pnpm typecheck`, `pnpm lint`, 90 tests across 21 files, project persistence, text inspector, Electron, settings, live connector, AI reply, TTS queue, close confirmation, and auxiliary-window smokes pass sequentially.
- Visual evidence includes `artifacts/rebuild/text-inspector/gif-runtime-desktop.png`, `gif-frame-a.png`, `gif-frame-b.png`, and `artifacts/rebuild/tts-queue/desktop-talking-queue.png`. The in-app Browser could not recover from its stale local connection-error tab after HMR restarted, so no new Browser screenshot is claimed in this gate; earlier desktop/mobile Browser evidence remains valid for the unchanged shell.
- HMR is running on `127.0.0.1:5175`; unrelated `::1:5173` remains untouched. No installer, production build, packaging, signing, or auto-update command was run.
- Exact next task: begin Phase 9 with a separate lightweight local scene runtime, controlled `/assets/:id`, SSE snapshots/patches, health/readiness/log endpoints, reconnect resynchronization, and under-200ms local propagation evidence.

## Session update - Phase 9 local scene runtime exit gate

- Phase 9 rebuild exit criteria are complete. This does not close Phase 1, Phase 3, `REF-012` through `REF-017`, OBS/virtual-camera work, or the full application objective.
- Added a separate dependency-light HTML/CSS/JavaScript scene renderer and a main-process HTTP/SSE service bound only to `127.0.0.1` on a random available port. It serves `/`, `/runtime.js`, `/runtime.css`, `/events`, `/health`, `/assets/:id`, `/ready`, and `/log`, with a strict CSP and clean shutdown.
- Scene snapshots and patches are validated through typed preload/IPC. SSE reconnect immediately receives the complete current state; browser readiness, connected clients, last publish/ready timestamps, and a bounded 100-entry sanitized log are exposed through diagnostics.
- Built-in and project media resolve only through controlled IDs. Unknown IDs and traversal-shaped requests return 404; no arbitrary filesystem URL is sent to the renderer. Local development still resolves source assets from the repository, while packaging asset resolution remains intentionally deferred.
- Editor changes publish independently from the 350 ms persistence debounce: normal edits coalesce at 40 ms and avatar speech transitions publish immediately. Duplicate scene/avatar states are suppressed. The project bar exposes the active loopback Browser Source URL for copying.
- The separate renderer preserves keyed image/GIF/video/avatar nodes across text/avatar patches, supports media references, contain/cover/fill, loop/mute, idle/talking opacity, text styling, transforms/order, and pixel chroma canvases. Non-renderable `source: none` layers are ignored after visual QA found they produced ghost text.
- `pnpm test:scene-runtime-smoke` verifies a 115 ms latest editor-to-runtime propagation, stable GIF/avatar node identity, idle/talking switching, full-state reload resynchronization, loopback diagnostics, and a controlled editor/runtime scene at 1.53% pixel difference. Evidence is under `artifacts/rebuild/scene-runtime/`.
- Final gate: `pnpm typecheck`, `pnpm lint`, all 94 tests across 22 files, and Electron/settings/project/live/AI/TTS/text/close/auxiliary/scene-runtime smokes pass sequentially. A missing-media timing regression found during the gate was fixed by refreshing file status before initial runtime publication.
- HMR remains on `127.0.0.1:5175`; unrelated `::1:5173` remains untouched, with no listener on `5176` or the smoke CDP port. No installer, production build, packaging, signing, auto-update, or reference mutation was performed.
- Exact next task: begin Phase 10 with a replaceable OBS WebSocket adapter, connection/settings diagnostics, safe dedicated scene and Browser Source ownership, resolution/FPS controls, and virtual-camera start/stop recovery tests without using the reference private native OBS package.

## Session update - Phase 10 OBS foundation and safe virtual-camera ownership

- Phase 10 is in progress and is not complete because OBS Studio is not installed in the current environment, so no real camera-consumer success is claimed.
- Added typed OBS contracts, validation, preload/IPC, browser-dev mock, SQLite-backed public metadata, and a main-process service with deterministic mock plus a public OBS WebSocket v5 adapter. The real adapter implements Hello/Identify authentication, request/response correlation, scene/input discovery, Browser Source creation/update, Program Scene control, and virtual-camera status/start/stop without using `@bhb-frontend/ai-live-dll`.
- OBS endpoints are restricted to loopback. Passwords remain session-only and never return through IPC or enter SQLite. Browser Source URLs must point to the loopback scene runtime.
- Ownership is conservative: existing scene/source names are rejected unless a matching ownership record was previously written by this app. The app never deletes OBS resources. Starting virtual camera saves the current Program Scene, switches to the dedicated AI scene, and stopping restores the previous Program Scene.
- Virtual camera cleanup is ownership-aware. If camera output was already active before connection, the app refuses to claim or stop it. App shutdown/disconnect stops and restores only an app-started camera; connection/request failures clear local connection state and retain precise error codes for recovery.
- The livestream settings dialog now exposes adapter, local host/port, session password, scene/source names, canvas dimensions, FPS, save/test/create/update/disconnect actions. The output mixer reports `OFFLINE`, `CONNECTED`, or `CAM ON` and provides prepare/start/stop controls.
- Evidence: `tests/unit/obs-service.test.ts` covers public config persistence, password exclusion, source/scene collision refusal, six repeated cycles, Program Scene restoration, pre-existing camera protection, loopback validation, and an authenticated in-process OBS WebSocket v5 protocol server. `pnpm test:obs-smoke` passes six UI cycles plus disconnect/reconnect recovery and emits `artifacts/rebuild/obs/mock-output-ready.png`.
- Current gates pass: `pnpm typecheck`, `pnpm lint`, all 100 tests across 23 files, plus OBS, scene-runtime, project-persistence, settings-persistence, and close-confirmation Electron smokes sequentially.
- Environment audit found no OBS executable at the standard 64-bit install paths and no running `obs64` process. `REF-018` remains open for a real local OBS instance, visible Browser Source, actual virtual camera consumer, OBS restart recovery, and configured reference comparison.
- The dependency update briefly stopped Vite; the dev loop was restored at `127.0.0.1:5175`. The unrelated `::1:5173` listener remains untouched and no installer/production build/package/sign/update command was run.
- Exact next task: continue Phase 10 with a real local OBS fixture when available; meanwhile begin non-mutating Phase 11 architecture for the dedicated Chrome/Edge CDP profile and shop adapter without accessing personal browser profiles.

## Session update - Phase 11 dedicated browser, exact pin, and scheduler foundation

- Phase 11 is in progress and is not complete because no authenticated disposable TikTok Shop seller fixture is available. `REF-011` remains open for real product retrieval, real pin effects, live selector confirmation, and configured reference comparison.
- Added typed Shop contracts/validation, public configuration persistence, browser detection, loopback random CDP ports, an app-owned `shop/tiktok-profile`, Playwright CDP lifecycle, replaceable selector sets, scrolling/deduplication, exact remote-ID pinning, product mapping, selector diagnostics, failure screenshots, and actionable browser-closure recovery.
- The app never connects to an existing Chrome/Edge profile or port. Login remains manual, credentials/cookies never cross IPC, and shutdown closes only the browser process tree launched by this service. A safe local smoke confirmed `tempDirs=0` and `ownedProcesses=0` after cleanup.
- The scheduler lives in the Electron main process and persists its mappings/items in SQLite, so renderer refresh does not erase the configured schedule. It supports duration, bounded retry, pause, resume, skip, wraparound, and immediate stop with timer-generation cancellation.
- Replaced the old Phase 1 pin-manager mock in livestream settings and the avatar-script product source with the typed Shop API. The UI exposes mock/Playwright adapters, detected browser selection, dashboard URL, explicit load, exact single-pin actions, mapping/schedule creation, lifecycle states, diagnostics, and all scheduler controls.
- Focused evidence: `tests/unit/shop-service.test.ts` has six tests for public persistence, signed-out state, exact-ID pinning, retry/lifecycle controls, validation, and browser-close recovery. `pnpm test:shop-smoke` uses isolated profile roots against loopback fixtures, reads two similar products, pins the exact ID, captures a controlled selector-failure screenshot, disconnects, and removes all owned processes/profile data.
- In-app Browser QA at desktop and 390x844 passes page identity, meaningful DOM, no framework overlay, clean console, exact product pin, start/pause/resume/skip/stop, dialog containment, and `scrollWidth === clientWidth`. Temporary QA screenshots were kept outside the repository.
- `pnpm test:shop-ipc-smoke` verifies the real Electron preload/IPC boundary, observes an active main-process schedule after renderer reload, exercises pause/resume/skip/stop, restarts Electron with the same isolated database, and restores the persisted schedule document safely in idle state.
- `playwright-core` is externalized from the Electron main dev bundle so local watcher rebuilds remain fast; this is a development/runtime dependency decision, not a production package build.
- Current gate: `pnpm typecheck`, `pnpm lint`, all 108 tests across 25 files, and `pnpm test:shop-ipc-smoke` pass; Vite HMR remains healthy at `127.0.0.1:5175`. Only `::1:5173` and `127.0.0.1:5175` listen among audited dev/smoke ports, and temporary Shop profiles are fully removed. No installer, packaging, production build, signing, auto-update, personal browser profile, or reference mutation was used.
- Exact next task: begin Phase 12 with structured cross-service health diagnostics and secret-redacted log export/clear behavior while keeping `REF-011` and `REF-018` open for real fixtures.

## Session update - Phase 12 diagnostics foundation

- Added typed diagnostics contracts and a main-process `DiagnosticsService` with a bounded 2,000-entry structured log, atomic `.tmp` writes, interrupted-write recovery, invalid-file quarantine, search/filter/limit, JSON export, and explicit clear.
- Redaction occurs before persistence and again when loading old entries. Secret-shaped keys, authorization/cookie/password/token/session fields, inline Bearer/query tokens, private prompt/persona/message fields, circular objects, oversized strings, arrays, and objects are bounded or replaced.
- Health providers are replaceable per component and provider failures become redacted `error` results rather than breaking the complete snapshot. Initial component contract covers database, TikTok, AI, TTS, scene runtime, OBS, and Shop.
- `tests/unit/diagnostics-service.test.ts` adds four tests for persisted/export redaction, query/filter/clear/restart, health failure isolation, and helper behavior. Current gate passes `pnpm typecheck`, `pnpm lint`, and 112 tests across 26 files; HMR remains healthy at `127.0.0.1:5175`.
- Electron main now instantiates diagnostics under the app-owned data directory, aggregates database/TikTok/AI/TTS/scene/OBS/Shop health, records startup/preload/renderer/shutdown lifecycle events, and exposes only validated snapshot/list/export/clear IPC through preload and the browser dev bridge.
- `/diagnostics` now renders seven health cards, searchable/level-filtered logs, JSON export, and two-step clear confirmation. In-app Browser QA passes at desktop and 390x844 with clean console, no framework overlay, seven cards, working search/empty state, clear confirmation, export feedback, and no horizontal overflow.
- `pnpm test:diagnostics-smoke` passes through real Electron IPC with `DIAGNOSTICS_IPC_SMOKE_OK health=7 redaction=pass restart=pass clear=4`; it verifies startup logging, all health components, redaction in list/export/on-disk data, safe restart restoration, and clear behavior in an isolated temporary profile.
- Phase 12 remains partial. Exact next task: broaden lifecycle event coverage, add user-facing technical detail for common failures and long-run bounds, then compare reference diagnostics under `REF-019` without exposing private data.

## Session update - Phase 12 database and process resilience

- Added SQLite candidate integrity checks and recovery reporting. Startup now selects a valid primary, newer completed `.tmp`, or `.bak`; corrupt candidates are quarantined, all-corrupt startup fails closed, writes are fsynced, and diagnostics record the chosen recovery source.
- Added native Electron single-instance ownership plus an app-owned tokenized runtime lock. A live lock is refused, stale/invalid locks are quarantined, `second-instance` focuses the existing window, and shutdown removes only the lock carrying the current token.
- Added Shop browser owner records beside the app-owned profile. A later startup terminates an orphan only when PID, Chrome/Edge executable, exact `--user-data-dir`, and a random owner token all match; wrong executable/profile/token or nearby PID is never terminated. Clean close removes only its matching owner record.
- Renderer-driven TikTok, AI, TTS, scene, OBS, and Shop lifecycle operations now share a redacted success/failure recorder. High-frequency successful generation/synthesis/scene publishes stay silent, while failures retain an actionable code. Health and log details are collapsed behind an explicit “Xem chi tiết kỹ thuật” control.
- Validation: `pnpm typecheck` pass; `pnpm lint` pass; focused database/resilience/Shop tests pass; diagnostics sustain 2,200 writes while retaining exactly 2,000 entries across restart; `pnpm test:shop-smoke` passes two real local-browser fixtures and owner cleanup; full gate passes 123 tests across 27 files; the latest `pnpm test:diagnostics-smoke` emits `DIAGNOSTICS_IPC_SMOKE_OK health=7 redaction=pass restart=pass clear=12`; `pnpm test:recovery-smoke` emits `INTERRUPTED_RECOVERY_SMOKE_OK marker=restored source=temporary quarantine=pass diagnostics=pass`.
- In-app Browser QA passes at 1280x800 and 390x844: the technical-detail control opens to `disconnected`, card/page scroll widths equal client widths, console error/warn lists are empty, and no framework overlay appears.
- Reference comparison: no new parity claim. `REF-019` remains partial because the reference has no safe loaded-log/crash/stale-lock/orphan fixture, and authenticated TikTok Shop/real OBS gaps remain open.
- Exact next task: add throttled logging for internal asynchronous connector/queue transitions, run a longer multi-service crash/restart soak, then resume safe `REF-019` comparison without reading personal logs or claiming parity.

## Session update - Phase 12 internal transitions and restart soak

- Added bounded throttling to `DiagnosticsService`. Repeated events inside their interval are omitted, and the next emitted event reports `suppressedSinceLast`; throttle keys are capped at 500 while persisted logs remain capped at 2,000.
- Added internal transition evidence for TikTok callback status, Shop connection/scheduler/index changes, and scene runtime start/stop, first scene, client/ready counts, and browser warn/error reports. Successful high-frequency AI/TTS/scene operations remain quiet unless state changes or an error occurs.
- Interaction queue diagnostics now cross preload/IPC only as a validated enum with stage and count. Viewer comments, AI prompts, spoken text, product data, arbitrary error strings, and secrets cannot be submitted through this channel. Queue-full, job error/cancel, retry, and clear states are covered.
- Added `pnpm test:multiservice-soak`. Six isolated Electron launches exercise mock TikTok, AI, TTS, scene, OBS, Shop, queue diagnostics, SQLite, health, export, and shutdown; cycles 0/2/4 terminate the exact spawned process tree. The next launches record three `replaced-stale` recoveries, the final cycle restores marker `5`, keeps seven health components and 171 bounded logs, and removes the runtime lock on graceful exit.
- Validation: `pnpm typecheck` pass; `pnpm lint` pass; full gate passes 126 tests across 27 files; `pnpm test:diagnostics-smoke` emits `DIAGNOSTICS_IPC_SMOKE_OK health=7 redaction=pass restart=pass clear=13`; `pnpm test:recovery-smoke` and `pnpm test:multiservice-soak` pass. Only the exact smoke process trees are terminated; the `5175` dev process and unrelated `::1:5173` listener are preserved.
- Reference comparison: no new parity claim. `REF-019` remains partial because the reference still lacks a safe loaded-log/crash fixture. `REF-011` authenticated Shop and `REF-018` real OBS also remain open.
- Exact next task: implement crash-loop recovery messaging visible to the user, then run a longer wall-clock media/network soak and resume safe exact-window/reference diagnostics inventory when a disposable fixture is available.

## Session update - Phase 12 recovery notice UX

- Startup recovery outcomes now enter the typed diagnostics snapshot as a bounded, redacted recovery-notice list. Covered outcomes include database restore/quarantine, stale or invalid runtime locks, exact-owned Shop-browser orphan termination, and owner-mismatch refusal.
- The shared application shell shows a dismissible recovery banner with plain-language guidance, a redacted technical-detail expander, and a Diagnostics action that is omitted while already on `/diagnostics`. Dismissal is remembered for the current tab session only.
- Browser-dev fixtures expose deterministic database and stale-lock notices without mutating production data. Desktop QA at 1280x720 and mobile QA at exactly 390x844 confirm the expected title/copy, detail expansion, Diagnostics navigation, session dismissal, clean console, and no horizontal overflow.
- Validation passes: `pnpm typecheck`, `pnpm lint`, 127 tests across 27 files, `pnpm test:diagnostics-smoke` (`health=7 redaction=pass restart=pass clear=13`), `pnpm test:recovery-smoke` (`source=temporary quarantine=pass diagnostics=pass`), and the previously completed six-cycle/three-crash multi-service soak.
- Reference comparison remains incomplete. `REF-019` has no safe loaded-log/recovery fixture, while authenticated Shop and real OBS verification remain open under `REF-011` and `REF-018`.
- Exact next task: run a longer wall-clock media/network soak and resume a safe exact-window reference diagnostics/recovery inventory when a disposable configured fixture is available.

## Session update - Phase 13 long-session harness

- Added `pnpm test:long-session-soak`, an isolated real-Electron wall-clock harness that defaults to 480 minutes and accepts explicit duration, interval, fault cadence, and CDP-port overrides for qualification runs.
- Each iteration exercises mock AI generation, TTS synthesis/cache, scene idle/talking publication, bounded queue diagnostics, Shop exact-ID pinning, and periodic OBS virtual-camera cycles. Fault cycles disconnect and restore TikTok, OBS, and Shop while the app remains open.
- The harness checks seven health providers, the 2,000-log bound, redacted export, persisted progress marker, live scene-runtime availability, clean renderer output, graceful shutdown, runtime-lock removal, exact process cleanup, and temporary-profile cleanup. CDP sampling now also bounds renderer and scene-runtime JavaScript heap/DOM-node growth with configurable thresholds.
- Qualification evidence passes repeatedly. The latest 2-minute wall-clock run produced 58 iterations/5 fault cycles/145 peak logs with renderer 12.9 MB heap/305 nodes and scene runtime 1.9 MB heap/33 nodes. These runs validate the harness and recovery/resource checks, not the required eight-hour duration.
- Phase 13 remains in progress. The eight-hour simulated livestream, real OBS and authenticated Shop fixtures, app restart during active queued work/autosave, complete screenshot parity ledger, and screen-by-screen reference sign-off remain pending.
- Exact next task: add explicit queued-work/autosave restart fault cases, then schedule the full eight-hour harness when a stable observation window is available; continue safe reference parity inventory in parallel.

## Session update - Phase 13 active-work restart

- Added `pnpm test:active-work-restart` with a dedicated temporary profile and two real-Electron launches. The first launch is terminated by exact process tree while a long mock TTS item is visibly `playing` and a canvas-preset change is inside the 350 ms autosave debounce window.
- The second launch verifies the last committed scene remains valid, the pending autosave cannot corrupt the project, the persisted baseline marker survives, seven health providers remain available, and a `stale-lock-recovered` notice is exposed.
- Renderer queue state is intentionally session-only: restart returns to `idle`, contains zero jobs, exposes no orphan active item, and restores the idle avatar state. Final graceful shutdown removes the runtime lock and the harness removes its temporary profile.
- Evidence: `ACTIVE_WORK_RESTART_SMOKE_OK autosave=Chưa có thay đổi restoredPreset=portrait-1080p queue=idle recovery=stale-lock`.
- Phase 13 remains in progress: full eight-hour evidence, real OBS/authenticated Shop, reference screenshot completion, and manual screen-by-screen parity sign-off are still pending.
- Exact next task: run a longer observation window toward the eight-hour target and continue safe reference inventory where fixtures permit; real OBS/authenticated Shop evidence remains fixture-dependent.

## Session update - avatar-script AI preparation during soak

- Added a renderer-independent avatar-script generator that builds bounded fact-only requests for the existing AI provider boundary, treats product text as untrusted data, flattens control whitespace, limits context to the validated 12,000-character IPC payload, parses numbered/bulleted output, and rejects missing facts, empty responses, hidden-content leakage, and unsupported price/stock/discount/shipping claims.
- Twelve focused tests pass for product-fact prompts, untrusted-field flattening, empty-input rejection, maximum payload bounds, provider delegation, the actual configured mock `AiProviderService` boundary, output cleanup/result limits, commercial-claim enforcement, exact-request cancellation, stale late-response suppression, provider-error recovery, and cancellation-transport failure tolerance.
- The last complete unit/integration gate passes 136 tests across 28 files; the three newer controller tests, `pnpm typecheck`, and focused ESLint also pass while the independent eight-hour process continues uninterrupted. A refreshed full count is deferred until the next phase gate.
- This module is deliberately not imported by the live renderer while the uninterrupted eight-hour soak is running. The current UI placeholder remains open until post-soak integration, cancellation/error UX, Browser QA, persistence evidence, and full gates pass.

## Session update - avatar-script AI integration and soak restart decision

- Replaced the avatar-script placeholder with the configured `desktopApi.ai.generate` boundary. Requests use project timeout/retry settings, bounded fact-only product context, visible Vietnamese validation/provider errors, and no provider secret enters the project document.
- Generated output changes only dialog drafts. Closing, cancelling, route leave, unmount, saving, or a superseding request cancels the exact active request; stale late responses are ignored. Only the existing `Lưu` action copies drafts into project state and triggers autosave. Product-link autofill is explicitly unavailable and does not pretend to scrape.
- Added `pnpm test:avatar-script-smoke`. It verifies real Electron/preload/main mock generation, delayed loopback-provider cancellation, Cancel isolation, Save/autosave, restart persistence, clean console, lock removal, and temporary-profile cleanup. Evidence: `AVATAR_SCRIPT_SMOKE_OK provider=mock cancel=exact persisted=109 restart=pass`.
- In-app Browser QA passes at 1280x800 and 390x844: configured provider identity, generated draft/status, contained internal scrolling, `scrollWidth === clientWidth`, no framework overlay, and no console error/warning. The visible empty-product error path is covered deterministically in unit/controller tests and Electron validation; configured reference AI behavior remains unavailable.
- Current gates pass: `pnpm typecheck`, `pnpm lint`, 139 tests across 28 files, `PROJECT_PERSISTENCE_SMOKE_OK`, `ACTIVE_WORK_RESTART_SMOKE_OK`, and the avatar-script smoke. A renderer-start race in the older project-persistence harness was fixed by waiting for the dev renderer after CDP connects.
- The earlier eight-hour attempt disappeared without a final harness result after approximately 3 hours 40 minutes. No soak process, CDP listener, runtime lock, or temporary profile remained, and both `127.0.0.1:5175` plus unrelated `::1:5173` stayed healthy. Because there is no final pass output and the renderer code has since changed, that attempt is invalid evidence.
- A final-code 2-minute qualification passes with `LONG_SESSION_SOAK_OK minutes=2 iterations=57 faults=4 peakLogs=132 rendererHeapMb=13.2 runtimeHeapMb=2.0 rendererNodes=305 runtimeNodes=33`.
- The 480-minute attempt started at 2026-07-29 21:35:32 -07:00 and ran for about 84 minutes. It verified seven healthy services, stable DOM, live fault recovery, and real 2,000-entry log rotation before failing at iteration 1001 because the harness incorrectly passed the unbounded iteration number as queue diagnostic `count`. The app's Zod IPC boundary correctly rejected the out-of-contract value; no app defect or silent acceptance occurred.
- Failure cleanup was complete: the exact soak tree, CDP `9270`, runtime lock, and profile `ai-livestream-long-session-soak-EWZzAO` were removed while project Vite `127.0.0.1:5175` and unrelated `::1:5173` remained healthy.
- Corrected only the harness so its simulated active queue count cycles through `0..100`, matching queue semantics and the validated IPC contract. A 5-minute accelerated qualification crosses the former boundary and passes with `LONG_SESSION_SOAK_OK minutes=5 iterations=1016 faults=10 peakLogs=941 rendererHeapMb=38.5 runtimeHeapMb=2.5 rendererNodes=305 runtimeNodes=33`.
- A corrected 480-minute run started at 2026-07-29 23:06:45 -07:00 with CDP `127.0.0.1:9270` and app-owned profile `ai-livestream-long-session-soak-91CoCP`. Initial inspection confirms only the isolated harness tree was added; `127.0.0.1:5175` and unrelated `::1:5173` remain untouched.
- Phase 13 remains in progress. Exact next task: launch a fresh uninterrupted 480-minute soak on the integrated code, monitor it without renderer edits, and record final cleanup/resource evidence. Real OBS, authenticated TikTok Shop/TikTok Live, full reference inventory, and screen-by-screen parity sign-off remain open.

## Session update - real TikTok probe, OBS portable, and Shop login fixture

- Replaced the stale TikTok `Kiểm tra` Phase 3 placeholder with a typed `live.probe` preload/IPC path. The probe uses a separate adapter, a 15-second timeout, guaranteed disconnect cleanup, Vietnamese recovery messages, and leaves an active livestream session unchanged. Unit coverage now includes probe isolation and cleanup.
- Fixed real OBS behavior when the WebSocket server is usable but the virtual-camera driver is missing. `virtualCameraAvailable` is now explicit in `ObsStatus`; Browser Source remains connected and usable, while camera start is disabled and returns `OBS_VIRTUAL_CAMERA_UNAVAILABLE` instead of dropping OBS.
- Downloaded the official OBS 32.2.1 Windows portable ZIP to a temporary fixture, verified its GitHub SHA-256 digest, enabled authenticated WebSocket on port 4455, and ran the application against it. Real evidence passes for connection, dedicated Browser Source create/update, reconnect, scene switch/restore requests, and a ready loopback SSE scene client. No installer or production packaging was run.
- Added environment-driven real/mock support and OBS source evidence to `scripts/run-obs-smoke.mjs`. Mock remains the default and passes six virtual-camera cycles; the portable real run passes with camera cycles set to zero because OBS reports that the system virtual-camera driver is unavailable.
- Added `scripts/open-shop-live-verification.mjs`. It opens a persistent app-owned Electron/Chrome profile outside the repository, detects Chrome/Edge through typed IPC, navigates to the real TikTok Shop seller dashboard, and leaves login to the user. The current profile reaches the seller registration/login screen; cookies are not read or exported.
- In-app Browser QA passes for the livestream dialog on desktop and exactly 390x844: TikTok probe interaction is visible, body/dialog scroll width equals client width, no framework overlay appears, and console error/warn lists are empty.
- Validation passes: `pnpm typecheck`, `pnpm lint`, 141 tests across 28 files, `LIVE_CONNECTOR_SMOKE_OK`, `OBS_SMOKE_OK kind=mock cycles=6 reconnect=ok`, `OBS_SMOKE_OK kind=obs-websocket cycles=0 reconnect=ok`, and `SHOP_IPC_SMOKE_OK refresh=running restart=idle controls=pass`.
- The corrected eight-hour soak was intentionally stopped after about 1 hour 22 minutes because these code changes invalidate its final evidence. A fresh final-code run is still required.
- Remaining blockers: the user must complete manual seller login in the dedicated Chrome window before authenticated product/pin/scheduler verification; a consensual active TikTok test room is required for real event evidence; installing the OBS virtual-camera driver is a separate system-level action that requires explicit approval.
- Exact next task: after seller login, refresh real products, harden live selectors against the observed authenticated DOM, verify exact-ID pin and scheduler recovery, then obtain a test TikTok room and decide whether to install the official OBS virtual-camera driver for consumer validation.

## Session update - Studio overlay resize handles

- Fixed selected layers that fill the canvas being impossible to shrink because their resize handles were centered outside the clipped scene-poster boundary.
- Kept all eight resize handles and the rotate control inside the selection boundary, while preserving canvas clipping for scene content. Added stable `data-resize-handle` markers for focused interaction QA.
- In-app Browser QA at 1280x720 selected a full-canvas overlay, confirmed the southeast handle receives pointer input, dragged it inward from scale `1,1` to approximately `0.84,0.85`, and immediately undid the test change back to `1,1` so project data was preserved. No framework overlay or relevant console issue was observed.
- Validation passes: `pnpm typecheck`, focused ESLint for `ProjectStudioPage.vue`, and 4 focused studio transform unit tests.
- Phase 13 remains in progress. Exact next task: continue authenticated Shop/live fixture verification and launch a fresh uninterrupted final-code soak when renderer edits are complete.

## Session update - creator-first Projects/Home simplification

- Simplified the first-run Projects/Home experience around the user workflow `tạo hoặc chọn dự án → chuẩn bị → tiếp tục live`, while preserving project CRUD, persistence, import/export, and editor navigation.
- Removed normal-mode engineering language from the first viewport: the `DEV` launcher is available only through the explicit `?devtools=1` development fixture, `Local`, credit/sync, `Reference audit · Phase 1`, and the prominent `Chẩn đoán` label no longer appear in the creator path. Settings and health tooling remain reachable under the secondary `Hỗ trợ` group.
- Replaced the dominant recovery panel with a compact reassurance and secondary `Xem chi tiết` action. Project cards now expose a derived setup state, a clear `Tiếp tục` action, and a single overflow menu for rename, duplicate, export, and delete.
- In-app Browser QA passes at 1280x800 and exactly 390x844: primary create dialog opens, the project overflow menu exposes four actions, project navigation reaches `/projects/perfume`, document width matches client width, no framework overlay appears, and console error/warning output is empty.
- Validation passes: `pnpm typecheck`, `pnpm lint`, and all 8 focused project-validation tests. This is an intentional usability improvement and does not claim exact Projects-screen screenshot parity with the reference app.

## Session update - blank new-project canvas

- Removed the promotional perfume fallback from an unauthored scene. A project with no configured media/text source now opens on a neutral empty canvas instead of looking as though a sales template was already applied.
- The empty canvas provides only lightweight guidance and a `Chọn hình nền` action; promotional layouts remain opt-in through the Template center or explicit source additions.
- Browser QA created a temporary project, confirmed `.scene-empty-state` is present while the legacy `.scene-base-media` and `.scene-copy` fallback are absent, verified no horizontal overflow/framework overlay/console warnings, then deleted the temporary project.
- Validation passes: `pnpm typecheck`, `pnpm lint`, and all 8 focused project-validation tests.

## Session update - Studio item controls and proportional video zoom

- Replaced the misleading generic `Thêm video` action with `Thêm video từ máy`. In Electron it uses the existing typed media picker, stores the selected reference in the project, publishes it through the loopback scene runtime, and renders it in the Studio without exposing Node.js to the renderer.
- Media corner resizing now behaves as proportional zoom instead of independently stretching width and height. The properties panel adds a 25%-300% zoom slider, Vietnamese fit-mode labels, and a one-click position/zoom reset; edge handles remain available for deliberate one-axis resizing.
- Enlarged layer visibility/lock/delete targets to 28x28, added clear pressed/danger states and tooltips, and kept editing continuity by selecting the nearest remaining layer after deletion. Delete feedback points to Ctrl+Z recovery.
- In-app Browser QA at a 1265px desktop viewport added a Flower MP4 layer, changed zoom from 100% to 145%, hid and restored it, reset zoom to 100%, deleted it, and confirmed the test layer was removed. Action targets measure 28x28, document width equals viewport width, no framework overlay appears, and console error/warning output is empty.
- Validation passes: `pnpm typecheck`, focused ESLint for the changed Studio/transform/test files, and 9 focused transform/history tests. The browser-dev bridge intentionally cannot open a native file dialog, so final manual Electron confirmation with a user-selected local video remains the next focused check.

## Session update - always-accessible Studio layout deletion

- Fixed the `Nguồn` panel state where a tall properties inspector compressed the layer list against the mixer footer, leaving a partially visible delete icon that could not reliably receive pointer input.
- Added persistent visibility, lock, and delete actions beside the selected layer name at the top of the properties inspector. The delete action no longer requires scrolling and intentionally works for locked layers; Ctrl+Z remains the recovery path.
- Removed nested panel scrolling: the properties inspector now has a bounded internal scroll area, the layer list keeps at least 78px of usable height, and the outer source panel clips instead of placing controls underneath the footer.
- In-app Browser QA at a 1265px desktop viewport reproduced the screenshot flow, added `Hình nền Beauty studio`, locked it, and deleted it from the new top action without scrolling. The row delete count becomes zero, the success notice appears, the top delete action remains more than 200px above the footer, document width equals viewport width, and console error/warning output is empty.
- Validation passes: `pnpm typecheck`, focused ESLint for `ProjectStudioPage.vue`, and 9 focused Studio transform/history tests.

## Session update - UI audit, light background presets, and responsive repairs

- Audited the running renderer rather than the unrelated app already using port 5174. The target flow covered Studio backgrounds, Templates, and Login at desktop and mobile sizes.
- Added three original built-in light scene backgrounds: clean white, warm white, and white studio. They are validated project asset IDs, render in Studio, and are served by the loopback scene runtime with an explicit SVG MIME type for Browser Source/OBS output.
- Fixed the desktop Login card being positioned almost entirely outside the viewport; the full 420px card is now visible at 1280x800, with a centered intermediate-width layout and the existing contained mobile layout preserved.
- Fixed the Templates grid clipping its fifth fixed-width card inside the post-sidebar content column. Desktop now fits four 203px cards per row at the audited viewport with no horizontal overflow.
- In-app Browser QA passes at 1280x800 and 390x844. The three light presets are visible, clean white can be added to the canvas and undone, Login remains contained, Templates no longer clips, and console error/warning output is empty.
- Validation passes: `pnpm typecheck`, focused ESLint for the changed Vue/contracts/validation/Electron/test files, and 13 focused project-validation plus scene-runtime tests.
- Phase 13 remains in progress. Authenticated Shop/TikTok evidence, real virtual-camera consumer validation, full reference parity sign-off, and the final uninterrupted soak remain open.

## Session update - manual script playlist and operator video replies

- Added schema-v10 project settings for an operator-controlled video workflow. Up to 20 idle scripts can be ordered as R1/R2/R3..., up to 20 response videos can be assigned, a default response clip can be changed during the session, and older projects migrate to the disabled empty configuration without losing scene data.
- Added a renderer-owned non-overlapping playback controller. Idle clips loop as a playlist; a `Trả lời bằng video` action interrupts the idle clip immediately, queues additional operator replies, marks each comment queued/playing/done/skipped, and resumes the next idle script after the response finishes. Pause, resume, skip, play-now, removal, and invalid/missing-video recovery are explicit.
- Manual video mode is intentionally separate from AI/TTS. While enabled, automatic moderation actions are treated as `ignore`, so live events remain visible for the operator without producing an AI or TTS response. Existing AI/TTS settings remain persisted for later use.
- The Studio footer now exposes the current R/response state and live controls. `Cài đặt livestream` contains the editable idle and response lists, ordering controls, default response selection, enable switch, and local-video picker. Browser Source scene state now receives the active managed layer and playback revision so OBS output pauses hidden clips and restarts the selected clip from the beginning.
- In-app Browser QA at the default 1280-wide viewport and exactly 390x844 added two controlled Flower MP4 layers, configured R1 plus one response clip, ran the mock live fixture, clicked `Trả lời bằng video`, observed `TRẢ LỜI`/`Đang phát`, then observed automatic return to `R1`/`Đã trả lời`. Document width matches client width, the compact/mobile controls remain usable, and console error/warning output is empty. A 981-1550px grid rule prevents the new mixer panel from pushing the Studio tools off-screen.
- Validation passes: `pnpm typecheck`, `pnpm lint`, 24 focused controller/project/database/scene-runtime tests, focused Shop smoke, and a rerun of `pnpm test:scene-runtime-smoke` with 117 ms propagation and 2.82% visual difference. The broad Vitest run completed all 146 assertions, but the command remains red because the Shop suite exceeded its 10-second `afterAll` cleanup hook once; its focused rerun passed.
- Known harness gap: `pnpm test:project-persistence-smoke` still targets the older Projects dialog title/action layout and times out before editing. Schema-v10 restart persistence is covered by the database integration test; the stale UI harness still needs alignment with the creator-first Projects screen.
- Phase 13 remains in progress. Exact next task: update the stale project-persistence smoke, then run a manual Electron check using user-selected idle/response MP4 files with embedded audio before reconnecting this workflow to real OBS output.

## Session update - direct video role assignment

- The Video library now has separate `Tải video kịch bản` and `Tải video trả lời` actions. A selected local file is added to the scene and immediately assigned to the requested role, removing the previous filename-matching step in Livestream Settings.
- A selected video now exposes `Vai trò phát` at the top of the Source properties: `Không gán`, `Kịch bản khi rảnh`, or `Trả lời khách`. Idle videos can be moved directly to an R position, and response videos can be selected as the default clip for the operator Reply button.
- Source rows display compact `R1/R2...`, `T1/T2...`, or `TRẢ LỜI` badges so operators can identify assignments while editing. The existing Livestream Settings lists remain available as the advanced reorder/control surface during a live session.
- In-app Browser QA passed for the direct workflow: add Flower MP4, assign R1, add a second clip, assign it as the default response, and observe both badges plus the active player state. Desktop and 390x844 mobile checks show no page-level horizontal overflow and no console warnings/errors.
- Validation passes: `pnpm typecheck` and `pnpm lint`. Final native file-picker verification still requires the Electron window because the browser development bridge does not open the Windows file chooser.

## Session update - complete prepared-audio library

- Added a first-class `Âm thanh` library to Studio. Operators can load MP3, WAV, M4A, or OGG files directly as idle scripts or customer replies, see assigned R/T badges, select the source from the library, rename/delete it through the Source panel, and adjust loop, mute, and 0-100% volume.
- Generalized the prepared-media workflow so video and audio share the same non-overlapping controller, ordered R1/R2/R3 playlist, immediate reply interruption, queued replies, pause/resume, skip, play-now, completion state, and automatic return to the next idle item. Manual prepared-media mode remains isolated from AI/TTS automation.
- Upgraded project documents to schema v11. Existing schema-v10 video projects migrate with volume 100%; audio references, assignments, selected reply, volume, and missing-file repair persist through project save/export/import/restart without storing file contents.
- Studio preview and the loopback Browser Source now create real audio elements, restart them on playback revision, honor pause/mute/volume, and serve controlled audio assets with explicit MIME types. Audio sources stay out of the visual canvas while remaining visible and editable in the Source list.
- In-app Browser QA passes at the desktop viewport and 390x844: the new tool, empty library, upload actions, source controls, and responsive containment render without framework overlays or console warnings/errors; document width equals client width. The browser development bridge correctly reports that native file selection requires Electron.
- Validation passes: `pnpm typecheck`, focused ESLint, 25 focused project/database/controller/scene-runtime tests, and `SCENE_RUNTIME_SMOKE_OK propagation=81ms visualDiff=2.83%`. An initial 209 ms propagation attempt exceeded the strict 200 ms harness threshold under the active dev session; the clean rerun passed.
- Video Room playback vertical slice is now implemented on the current source: schema v12 ordered prepared video/audio playlist, renderer-owned non-overlapping controller with R1/R2/R3 cycling, stale revision guards, bounded recovery, short-playlist warnings, typed video/audio media selection, Studio controls, persistence/export/import compatibility, SceneMediaLayer ready/error events, and Browser Source presentation synchronization/reconnect revision guards.
- Studio preview correction: implicit name-based promotional media is no longer rendered. Empty/none-source layers produce a neutral canvas; explicit built-in/local sources use the persisted transform, visibility, opacity, and `contain`/`cover`/`fill` fit mode consistently with the Browser Source runtime. The old automatic perfume/person/podium canvas styling is disabled while explicit library cards remain available.
- Focused evidence: `corepack pnpm typecheck`, `corepack pnpm test:video-playlist-smoke`, and focused Vitest playback/project/history/scene-runtime/serialization tests pass (97 tests in the focused invocation). The repository-wide lint command remains red because it traverses pre-existing `.claude/worktrees/*` copies with Node globals reported as undefined; no package/release command was run.
- Remaining manual evidence: choose real local video/audio files through the Windows Electron picker, verify repeated playback and audio monitoring through the target OBS output, and run a real Studio-to-Browser Source Electron smoke. Automatic TikTok/comment/customer reply, AI, TTS, product, gift/follow/share, and real TikTok verification remain intentionally out of scope for this task.

## Session update - Studio recovery and direct OBS output

- Recreated the accidentally emptied `ProjectStudioPage.vue` as a focused operator workspace. It restores project-owned source upload for video, banner/image, text, and audio; a 9:16 preview; source naming, visibility, ordering, deletion, and automatic persistence.
- The recovered Studio now publishes the loaded/saved scene through the existing typed Scene Runtime IPC path. `Ket noi OBS` tests the saved OBS WebSocket configuration, creates or updates the Browser Source with the loopback runtime URL, and activates the output scene. When OBS exposes a virtual camera, the same panel provides an explicit start/stop control.
- Browser QA on `#/projects/perfume` confirms the recovered Studio is nonblank, has all four source actions, adds/removes a text source with the original 14-layer project state restored, and gives a clear Electron-only message when the browser development bridge has no Scene Runtime URL.
- Validation: focused ESLint for `src/pages/ProjectStudioPage.vue` passes. `vue-tsc --noEmit` is still blocked only by the pre-existing `tests/unit/scene-history.test.ts:32` `string`-to-`never` error; no Studio type errors are reported.
- Remaining manual evidence: in the Electron window, select a real local video/banner using the native picker, click `Ket noi OBS`, and confirm the Browser Source/Virtual Camera output in installed OBS. TikTok Shop remains intentionally deferred.

## Session update - usable media canvas

- Fixed the Studio's media path feedback: cancelling the Windows picker now explains that no file was selected, and a successful import shows the actual filename in the source list instead of the generic upload label.
- The preview now renders built-in image/avatar/video assets as well as locally selected media. Visual layers respect their saved placement, scale, rotation, opacity, and fit mode instead of every source being drawn as a full-frame overlay.
- Added concise source controls for OBS-style operation: select a source from the canvas or source list, choose fit/cover/stretch, set proportional zoom and opacity, and toggle selected-video audio. Every control persists the scene and republishes it to the loopback output.
- Validation: focused ESLint for the Studio and media IPC passes; `pnpm test:electron-smoke` passes with `PHASE0_SMOKE_OK`. The only known typecheck blocker remains the unrelated scene-history test type error.

## Session update - script playlist recovery

- Restored the existing manual playback controller to the recovered Studio page. Operators can assign a selected video/audio source to the ordered idle script playlist (`R1`, `R2`, ...), choose a response clip, start a script from a specific item, reorder/remove scripts, pause/resume, skip, and trigger a response clip.
- Playback is non-overlapping: the active idle source advances only on its `ended` event; a response interrupts idle playback, response requests queue, and the controller resumes the next idle item after the response queue empties. Playback state, current active layer, and a revision number publish through Scene Runtime so Browser Source/OBS receives the same selection.
- Assigning a video to either script role intentionally enables its audio. Roles and ordering are stored in the project scene, so they survive reload/restart.
- Validation: focused Studio ESLint passes and all 4 `manual-video-playback` controller tests pass. The existing `scene-runtime-smoke` UI harness is stale after the page recovery: it still requires the removed `Hinh nen` toolbar button and now times out at that obsolete selector; the runtime service itself is unchanged.

## Session update - Studio viewport repair

- Reworked the recovered Studio desktop layout so the operator workspace is constrained to the visible app height. The page itself no longer scrolls past the header or cuts off the live controls; only the source list uses internal scrolling, while the playlist and OBS controls remain anchored in the right panel.
- Corrected misleading source state: only renderable visual layers count toward the canvas total. Old media layers with a missing reference and placeholder `text` layers are labeled clearly, and an explicit `Don rong` action removes only those stale entries while preserving valid project media.
- Preserved the mobile single-column layout by releasing the desktop height lock below 980px.
- Validation: focused Studio ESLint and `pnpm test:electron-smoke` pass (`PHASE0_SMOKE_OK`).

## Session update - renderer media preview fix

- Fixed the selected local-video blank preview in Electron. The Studio no longer loads project media using a renderer-side `file:///` URL; it now uses the running loopback Scene Runtime `/assets/<media-id>` URL, which is the exact controlled-media path used by OBS Browser Source.
- This keeps renderer isolation intact, permits the preview to load local media reliably, and ensures the Studio preview and OBS output resolve the same project file.
- Validation: focused Studio ESLint passes; 9 focused manual-playback and Scene Runtime service tests pass; `pnpm test:electron-smoke` passes (`PHASE0_SMOKE_OK`).

## Session update - reference Studio operator layout

- Reworked the main Studio surface toward the observed reference operator layout: five-item tool rail, asset/source column, centered 9:16 dotted canvas, script rail, audio region, and OBS output controls.
- Existing source import, layer ordering, prepared-media playback, and OBS actions remain connected to their existing handlers; the change does not introduce decorative dead controls.
- Updated the home shell and project shelf to remove the creator-first CTA treatment and restore the compact reference navigation, credits panel, create tile, and project metadata layout.
- Validation: focused ESLint passes for `AppShell.vue`, `ProjectsPage.vue`, and `ProjectStudioPage.vue`. `pnpm typecheck` remains blocked by the pre-existing `tests/unit/scene-history.test.ts:32` string-to-never error; no errors were reported from the changed surfaces.

## Session update - Studio desktop rail overflow repair

- Fixed the Studio layout collision visible at desktop scale: the recovered Studio page was inheriting the older global `.studio-page` grid while also applying its four-rail layout. Its fixed grid columns rendered outside a narrow parent, which stacked the Avatar script, preview, source, and output panes over one another.
- The recovered page now establishes its own block formatting context. Desktop rows consume the available viewport height and the 9:16 preview scales to its available canvas, preserving the source, script, audio, and live-output rails without page-level horizontal overflow.
- Browser QA at `1280x720` confirms the Studio route is nonblank, its document width fits the viewport, the Avatar control updates its visible status, no framework overlay is present, and console error/warning output is empty. A `390x844` responsive check also fits the document width without console errors.
- Validation: `pnpm exec eslint src/pages/ProjectStudioPage.vue` passes.

## Session update - Desktop media preview failure state

- Fixed the desktop canvas state where inaccessible local image/banner files caused Chromium to render long fallback filenames over the top of the 9:16 frame.
- Local media now uses only the loopback Scene Runtime asset URL shared with OBS; the renderer no longer attempts a `file:///` fallback. Failed image/video loads render one concise in-canvas recovery state with the source name and a notice to re-add or repair the source.
- Desktop Browser QA at `1280x720` confirms the preview video renders at its canvas dimensions, no non-empty image alt text is rendered in the canvas, no failed-media panel appears for a valid source, document width fits the viewport, and console error/warning output is empty. Mobile was intentionally not changed or tested for this repair.
- Validation: `pnpm exec eslint src/pages/ProjectStudioPage.vue` and `git diff --check` pass.

## Session update - local image import

- Added `Thêm ảnh từ máy` to the Studio background library. The native picker uses the typed media IPC boundary, reads the selected image into a data URL, creates a persisted image layer, selects it, and shows the filename in the source list.
- Local image layers render on the 9:16 canvas and are reloaded from saved media references after reopening a project. Existing local video loading remains supported through the generalized media loader.
- Validation: focused ESLint, `pnpm typecheck`, `pnpm test:electron-smoke` (`PHASE0_SMOKE_OK`), `pnpm test:text-inspector-smoke` (`STUDIO_TEXT_INSPECTOR_SMOKE_OK`), and `git diff --check` pass.
- Manual remaining evidence: choose a real image in the Windows Electron picker and confirm the image placement/transform in the running Studio and OBS Browser Source.

## Session update - Desktop Scene Runtime publish ordering

- Root cause of the persistent desktop `Khong tai duoc nguon` card was confirmed: the renderer exposed the loopback asset URL before publishing the project scene to Scene Runtime. The first `/assets/<media-id>` request therefore returned 404, and the failed layer remained cached in the renderer even though the local MP4 existed.
- Studio now assigns project media references before the project becomes renderable, publishes the complete scene first, then exposes the runtime URL and clears transient media-load failures. A deep scene watcher also republishes a current project after a renderer HMR refresh or later source change.
- Restarted the normal Vite/Electron development session so the stale renderer state is gone. A desktop Browser validation at `1280x720` confirms a valid video renders with zero failed-media panels, no horizontal overflow, no framework overlay, empty console errors/warnings, and a working Avatar interaction.
- Validation: focused ESLint passes. `pnpm typecheck` remains red only for the pre-existing `tests/unit/scene-history.test.ts:32` `string`-to-`never` error; no error was reported from Studio.

## Session update - Desktop missing-source recovery

- The Studio now checks every persisted local media reference before rendering the desktop canvas. Files that no longer exist are kept visible in the source list as repairable `Tep goc khong con ton tai` entries, but are excluded from the live canvas so a stale project cannot fill it with load-error cards.
- Replaced the misleading empty-only cleanup action with `Don nguon loi`. It removes missing, empty, and browser-load-failed visual layers and simultaneously removes their idle/response playlist references, then persists the repaired scene.
- Desktop Browser QA at `1280x720` confirms a valid video renders, no failed-media panel appears, the repair action is visible, the Avatar interaction updates visible state, document width fits the viewport, and console error/warning output is empty. Mobile was not changed or tested.
- Validation: `pnpm exec eslint src/pages/ProjectStudioPage.vue` and `git diff --check` pass.

## Session update - Studio page decomposition

- Reduced `ProjectStudioPage.vue` from roughly 984 to 863 lines by extracting the tool rail, asset browser, source list, playlist panel, inspector sidebar, mixer footer, and manual playback orchestration into focused Studio components/composables.
- Preserved the page as the owner of project hydration, persistence, canvas transforms, dialogs, and Electron IPC while child panels communicate through typed props, models, and events.
- Restored legacy text-layer preview compatibility by rendering layers identified by `kind: 'text'` even when older project data still has `source.type: 'none'`; corrected the encoded `Văn bản` layer classification and exposed the GIF media-kind attribute expected by the Studio smoke test.
- Validation passes: focused ESLint, `pnpm typecheck`, 19 focused playback/preview tests, `pnpm test:text-inspector-smoke` (`STUDIO_TEXT_INSPECTOR_SMOKE_OK`), `pnpm test:electron-smoke` (`PHASE0_SMOKE_OK`), and `git diff --check`.
- In-app Browser QA at `http://127.0.0.1:5173/#/projects/perfume` confirms the Studio is nonblank, tool/asset/source/inspector panels render, text edits update the canvas preview, a Flower GIF mounts once with its controlled local source, and console warnings/errors are empty.

## Session update - CapCut-style image selection bounds

- Image selection handles now wrap the visible pixels of `contain` images instead of the full underlying layer rectangle, removing the large top/bottom dead area shown around landscape images on the 9:16 canvas.
- Studio records each loaded image's natural aspect ratio and fits the selection box inside the authored layer bounds while preserving the layer center, transform, rotation, and scale behavior. The duplicate selection overlay was removed so exactly one eight-handle control is rendered.
- Added focused geometry coverage for a 3:2 landscape image inside a 9:16 layer; the expected visible selection is 100% wide and 37.5% tall, vertically centered.
- In-app Browser QA confirms a 900x589 Beauty Studio image renders in a 268.875x175.963 selection box while its underlying layer remains 268.875x478, with handles aligned to the visible image edges and no console warnings/errors.
- Validation passes: focused ESLint, `pnpm typecheck`, 4 Studio preview tests, `pnpm test:text-inspector-smoke` (`STUDIO_TEXT_INSPECTOR_SMOKE_OK`), `pnpm test:electron-smoke` (`PHASE0_SMOKE_OK`), and `git diff --check`.

## Session update - reliable add-text editing

- Fixed a long-running Studio identity defect where newly added sources reused short counter IDs such as `layer-13`. Persisted projects could then contain duplicate Vue keys, causing selection/inspector state to target the wrong layer and making a newly added text layer appear uneditable.
- New sources now use UUID-backed layer IDs. Project hydration also detects duplicate legacy IDs, preserves the first occurrence, assigns fresh IDs to later duplicates, and saves the repaired scene automatically.
- Adding `Văn bản` now increments an explicit focus request. The inspector focuses and selects the `Nội dung văn bản` textarea immediately, allowing the operator to type without an extra click while the canvas preview updates live.
- In-app Browser QA repaired the existing duplicate-ID project from 16 layers/15 unique IDs to 16/16, then added a 17th uniquely identified text layer, confirmed the textarea was the active element, typed `NỘI DUNG MỚI` directly, and observed the same text on the canvas with no new console warning/error.
- Validation passes: focused ESLint, `pnpm typecheck`, 6 focused identity/preview tests, `pnpm test:text-inspector-smoke` (`STUDIO_TEXT_INSPECTOR_SMOKE_OK`), `pnpm test:electron-smoke` (`PHASE0_SMOKE_OK`), and `git diff --check`.

## Session update - consistent front-to-back layer order

- Fixed the layer-order invariant across the source list, Studio preview, and loopback Browser Source. Index `0` now consistently means the front/top layer; lower list rows render progressively behind it.
- New image, video, audio, text, avatar, and built-in sources are inserted at the top of the source stack instead of being appended behind existing content.
- Studio preview and `scene-runtime/runtime.js` now assign descending z-index values from the first layer, so `Đưa lên trên cùng`, `Đưa lên một lớp`, `Đưa xuống một lớp`, and `Đưa xuống dưới cùng` match their labels and OBS output uses the same stacking order.
- In-app Browser QA added Beauty Studio and Product Table as overlapping layers, selected the lower Beauty Studio source, and clicked `Đưa lên trên cùng`. Its source row moved from index 1 to index 0 and its computed z-index changed from 999 to 1000 while Product Table moved to 999; the overlap visibly switched to the promoted image with no console errors/warnings.
- Validation passes: focused ESLint, `pnpm typecheck`, 25 focused preview/order tests in the current Vitest invocation, `pnpm test:text-inspector-smoke` (`STUDIO_TEXT_INSPECTOR_SMOKE_OK`), `pnpm test:scene-runtime-smoke` (`SCENE_RUNTIME_SMOKE_OK propagation=38ms visualDiff=2.01%`), `pnpm test:electron-smoke` (`PHASE0_SMOKE_OK`), and `git diff --check`.

## Session update - realtime text layer visibility and desktop inspector

- Replaced the Studio's fixed low-z promotional text block with real text-layer nodes that use the same authored geometry, transforms, visibility, opacity, and front-to-back ordering as media layers. Text inserted at source index `0` now renders above the layout in both Studio and Scene Runtime.
- Restored legacy project compatibility so layers with `kind: 'text'` remain renderable even when older saved data still has `source.type: 'none'`.
- Changed the desktop grid from a fixed 856px canvas column to a flexible canvas column, keeping the text inspector visible inside a 1354x882 viewport instead of pushing it beyond the right edge.
- In-app Browser QA at `http://127.0.0.1:5173/#/projects/perfume` and `1354x882` confirmed the text editor auto-focuses, `CHU HIEN THI REALTIME` appears immediately on canvas, selected text z-index is `1000` versus the highest media z-index `987`, document width fits the viewport, and console warnings/errors are empty.
- Validation passes: focused ESLint, `pnpm typecheck`, 7 Studio preview tests, `pnpm test:text-inspector-smoke` (`STUDIO_TEXT_INSPECTOR_SMOKE_OK`), 20 Scene Runtime service test executions in the current Vitest invocation, `pnpm test:scene-runtime-smoke` (`SCENE_RUNTIME_SMOKE_OK propagation=39ms visualDiff=2.01%`), and `git diff --check`.

## Session update - manual prepared-script implementation plan

- Added `docs/MANUAL_PREPARED_SCRIPT_PLAN.md` as the implementation specification for the manual-first workflow: operators prepare R1/R2/R3 scripts backed by video, audio, or TTS and can play any script directly without depending on TikTok or AI.
- The plan records the current ordered-playlist capability and the remaining gaps: independent script entities, direct `playScript(scriptId)`, interrupt/completion policies, audio-to-avatar talking synchronization, progress/hotkeys, migration, and real OBS picture/audio evidence.
- The roadmap now links this work as the next expansion of the existing Prepared Video Room slice. No runtime code was changed and no automated tests were required for this documentation-only session.
- Exact next task: implement Slice A from the plan, beginning with prepared-script contracts, validation, backward-compatible playlist migration, and persistence tests.

## Session update - prepared waiting scripts with TTS

- Added project schema v13 prepared scripts. Each waiting script has a clear R-number, name, enabled state, playback type (video, audio, or TTS), source/text, interruption rule, and completion rule.
- Existing manual playlists are retained and migrated into R1/R2/... video or audio scripts when an older project is opened. New project/export/import validation includes the prepared-script document.
- Replaced the Studio playlist operator panel with a detailed `Kich ban cho` panel. Operators can add video/audio/TTS scripts, edit their source or spoken text, choose immediate or after-current behavior, choose stop/next/resume behavior, reorder, enable, remove, and play an individual script.
- Added a single-owner prepared-script controller with direct play, sequential play, after-current queueing, stale callback guards, media availability errors, stop/pause/resume/skip behavior, and Scene Runtime active-script publication.
- Audio and TTS scripts now set the shared avatar state to talking while active and return it to idle on completion, cancellation, errors, or stop. TTS uses the existing typed IPC provider plus renderer playback path.
- Validation: focused ESLint and `pnpm typecheck` pass. Focused prepared-script, project migration, and scene serialization tests pass. Browser/OBS physical-media verification remains the next manual evidence task.

## Session update - VAS roles and video-attached audio

- The Timeline is now the single operator surface for `Chờ`, `Kích hoạt`, and `Đang nói`; selecting a video, audio, or avatar enables direct role assignment and role playback.
- Imported audio is visible from Timeline. When a video already has a script, `Nhập audio` attaches the audio to that same video script rather than creating a disconnected script; the edit dialog also exposes an `Audio kèm` selector.
- Prepared playback schema v16 publishes a dedicated active audio layer. Studio preview and Scene Runtime start/stop the attached audio with its video, retain per-track mute/volume settings, and do not let an audio end event advance the video script.
- Role transitions queue behind active activation/conversation speech and resume the idle script only after the spoken script ends, avoiding mid-sentence cuts. Only the script-selected avatar is visible at a time.
- Validation: `pnpm typecheck`, focused ESLint, 46 focused Vitest assertions (including video + attached audio), `pnpm test:electron-smoke` (`PHASE0_SMOKE_OK`), and `git diff --check` pass. Browser visual QA could not run because no Browser runtime is available; native Windows file-picker/OBS media evidence remains manual.

## Session update - direct script component table

- Added a persistent `Thanh phan kich ban` table in the left Studio column, directly below the source-library controls. It lists existing avatar, video, and audio layers as selectable script components.
- Each component row selects the matching canvas layer and offers direct role assignment (`Cho`, `Kich hoat`, `Dang noi`). Video and avatar rows also expose `+ Audio`, avoiding the previous requirement to select the canvas before importing a voice track.
- Timeline remains the playback surface; `Mo bang` opens full script properties only when detailed source/avatar settings are needed.
- Validation: `pnpm typecheck`, focused ESLint, 44 focused Vitest assertions, and `git diff --check` pass. Rendered Browser QA remains blocked because no Browser runtime is available.

## Session update - avatar MP4 state transition manager

- Added schema v17 avatar motion assignments for `idle`, `talk`, `point-product`, `point-cart`, `listen`, `thank`, and `wave`. Existing projects without an assignment migrate safely to `null`.
- Added `AvatarVideoStateManager`: one active state, preload/ready gate, a priority queue, duplicate-request suppression, 300ms crossfade, action completion back to idle, and safe failure when the target state has no MP4.
- Studio and Browser Source keep the outgoing state visible until the target video is playable; both layers crossfade at the same geometry while avatar MP4 video stays muted. TTS and attached audio remain independently managed.
- Operators assign each imported avatar MP4 a state in `Thanh phan kich ban`, then use the state controls in the left Studio column. The current script role also requests `idle` or `talk` motion automatically.
- Validation: `pnpm typecheck`, focused ESLint, 48 focused assertions, `pnpm test:electron-smoke` (`PHASE0_SMOKE_OK`), `pnpm test:scene-runtime-smoke` (`SCENE_RUNTIME_SMOKE_OK propagation=28ms visualDiff=1.99%`), and `git diff --check` pass.

## Session update - timeline duplicate controls removed

- Removed the repeated role label column and the redundant footer assignment actions from Timeline. Each lane now has one role button and its script clips; assignment remains in the left script-component table.
- Validation: `pnpm typecheck`, focused ESLint, and `git diff --check` pass.

## Session update - source-first sequential Timeline

- Returned script preparation to the `Nguon` panel: selecting an Avatar, Video, or Audio now directly places it in `Tu chay`, `Kich hoat uu tien`, or `Khi noi`, with an attached-audio action beside the selected source. The former duplicate script-component panel is no longer rendered.
- Reworked the bottom Timeline into an operator view: `Chay tuan tu` contains only waiting scripts and provides start, pause, resume, skip, and stop; activation and conversation scripts are separate event-priority controls.
- Fixed the playback controller so automatic Timeline playback never advances into activation or conversation scripts. An activation still preempts waiting media, and an active spoken response still completes before the next requested response begins.
- Validation: `pnpm typecheck`, focused ESLint, and 7 prepared-playback unit tests pass. Browser visual QA remains unavailable because no Browser runtime is connected.
## Session update - priority replies pause and resume waiting video

- Redesigned prepared playback around the operator workflow: waiting videos are background content, while greeting and consultation scripts are priority replies.
- A priority reply now pauses the current waiting video immediately. Further replies queue FIFO behind the active reply; when the queue drains, the original waiting video resumes without resetting its playback position, then the waiting sequence continues normally.
- Added `resumeActiveMedia` to the Studio and Browser Source scene presentation contract so both renderers preserve the media element's current time when returning from a reply.
- The prepared-script dialog and Timeline now state the priority/resume policy explicitly, rather than asking the operator to choose an interruption rule for each response.
- Validation: focused ESLint, `pnpm typecheck`, and 10 focused Vitest assertions pass (including FIFO replies and resumption of the interrupted waiting video).
## Session update - visible waiting sources and foreground avatar

- Repaired the autosave failure shown in Studio: before playback synchronization, stale `avatarLayerId` values that point to a video or audio layer are cleared without removing the actual source or script.
- Managed video layers now remain visible when no script is active, including immediately after import. Active playback still controls which managed visual source is visible.
- Avatar layers now render above background, product, and video layout layers in both the Studio preview and Browser Source. Existing readiness-gated 300 ms avatar crossfade remains in place, so the outgoing state stays visible until the incoming video can play.
- Validation: focused ESLint and `pnpm typecheck` pass; 54 focused validation, playback, preview, and serialization assertions pass.
## Session update - large local video streaming

- Fixed blank/stalled imported video and avatar media caused by the safe 100 MB Data URL IPC limit. Studio now falls back to the existing loopback Scene Runtime asset URL after publishing the updated scene, matching the controlled path used by OBS Browser Source.
- Local media remains visible in Studio even when it is too large to safely marshal through Electron IPC as a base64 Data URL; no renderer Node access or `file:///` fallback was introduced.
- Validation: focused Studio ESLint, `pnpm typecheck`, and 9 Studio preview/scene serialization assertions pass.
## Session update - foreground transform controls

- Fixed avatar/video transform controls after foreground layering: the selected layer's move/resize/rotate overlay and layer-order toolbar now render above every authored source and hit target.
- This preserves the avatar foreground guarantee while restoring pointer access to drag and resize handles.
- Validation: focused Studio ESLint and `pnpm typecheck` pass; `git diff --check` passes.
## Session update - sequential local media publish ordering

- Fixed the second-import blank-media race: Scene Runtime publishes are now serialized, and a new local media ID is exposed to Studio only after its scene publication completes.
- Runtime asset URLs include a publication revision so Chromium retries the source rather than retaining an earlier 404 response.
- Validation: focused Studio/playback ESLint, `pnpm typecheck`, and 17 playback, preview, and scene serialization assertions pass.
## Session update - duplicate avatar state repair

- Diagnosed the second-avatar blank layer from the live Scene Runtime snapshot: both uploaded MP4s were valid and returned HTTP 200, but were assigned to the singleton `idle` avatar motion state.
- New avatar uploads are now ordinary visible avatar layers until an operator explicitly assigns a motion state. Hydration and synchronization repair duplicate state assignments by retaining the frontmost assignment and clearing later duplicates, then persist the repair.
- The avatar state manager no longer enters an error state when no MP4 motion has been assigned yet.
- Validation: focused ESLint and `pnpm typecheck` pass; 47 focused avatar-state, project-validation, and playback assertions pass.

## Session update - timeline cleanup and sequential waiting videos

- Deleting a Studio source now removes every prepared Timeline item that references it (media, attached audio, or avatar), normalizes the remaining order, and stops playback if the deleted source was active.
- Waiting Timeline media no longer loops itself. When one video finishes, Studio and the loopback Browser Source both report the matching revision and advance to the next waiting script; the sequence stops only after the final waiting item.
- Browser Source completion callbacks are schema-validated, limited to `127.0.0.1`, and rejected if they do not match the current script, layer, and playback revision.
- Validation: `pnpm typecheck`, focused prepared-playback and Scene Runtime tests, and `git diff --check` pass.

## Session update - priority interruption cleanup

- Removing the active source now cancels its TTS work before stopping playback. Removing a waiting source while a priority reply is active continues at the following waiting item instead of stopping the timeline.
- A direct immediate play clears the suspended waiting item, preventing an unintended resume after an operator explicitly replaces a priority reply.
- Removing the final layer that uses a local media reference removes that reference and its in-memory preview source from the project; the original external file is never deleted.
- Validation: `pnpm typecheck`, focused playback/runtime tests, changed-file ESLint, and `git diff --check` pass.

## Session update - automatic waiting timeline start

- A project with enabled waiting scripts now starts Video 1 after local media is ready. Adding or assigning a new `Chờ` source also starts the Timeline when it is stopped; further waiting sources remain queued in their configured order.

## Session update - explicit automatic-run queue

- Replaced the ambiguous `Chờ` Timeline terminology with `Hàng tự chạy` across source assignment, Timeline, and detailed script editing. The Timeline now displays its item count and states that clips run in order from item 1 through the final item.

## Session update - video avatar timeline playback

- Uploaded avatar MP4s assigned to `Hàng tự chạy` are now prepared as video clips rather than short mock TTS clips. Existing waiting avatar scripts are upgraded on the next automatic start, so Video 1 plays to its natural end before Video 2 starts.

## Session update - repeating automatic timeline

- `Hàng tự chạy` is now a continuous loop: it advances through every enabled clip in order, then returns to item 1 after the final clip until the operator presses `Dừng`.

## Session update - activation boundary behavior

- `Kích hoạt ưu tiên` now waits for the current automatic Timeline clip to finish, then plays before the next clip begins. This differs intentionally from customer conversation responses, which can pause the background for an immediate reply.

## Session update - script orchestration board

- Reworked the Timeline into a `Kịch bản` board with three explicit lanes: `Vòng lặp nền`, `Chờ phát ưu tiên`, and `Phản hồi tức thời`. Every script has a visible clip and direct play action, leaving room for future greeting and consultation scripts.

## Session update - compact avatar workspace

- Reduced the Avatar asset area and converted the avatar state picker into a compact horizontal strip, giving the source list and script preparation area substantially more vertical space.

## Session update - source import shortcut

- The `+` control in `Nguồn` now opens a compact import menu for local Video, Image, Audio, or Avatar files instead of adding a generic placeholder layer.

## Session update - source-first Studio layout

- Removed the obsolete Studio tool rail (Avatar, background, video, sticker, and text). Local media is now added only through the `Nguồn +` menu, leaving more room for the source list and preview canvas.
- Reflowed the desktop and responsive Studio grids so the source panel, canvas, sidebar, and script board retain their expected positions without the removed column.

## Session update - streamlined video and audio scripts

- Simplified the detailed Script dialog to just the playback lane, video source, and optional attached local audio for each R item. The unused avatar and TTS text fields are hidden until that workflow is developed.
- Fixed the dialog content region so its script list scrolls inside the dialog instead of extending beneath its header and controls.

## Session update - P1 test gate repair

- Updated the database lifecycle assertion for the persisted playlist role that schema hydration now supplies.
- Vitest and ESLint now exclude local `.claude` worktrees, so workspace gates do not run duplicate agent copies of the repository.
- Validation passes: `pnpm typecheck`, `pnpm lint`, focused database integration tests (7/7), and full `pnpm test` (35 files, 181 tests).

## Session update - full-canvas default backgrounds

- Built-in default backgrounds now always use the complete scene rectangle and `cover` fit in both the Studio preview and loopback Browser Source, regardless of their source-list position.
- Validation passes: `pnpm typecheck`, `pnpm lint`, and focused Studio preview/Scene Runtime tests (14/14). Browser QA confirms the Studio route renders with no console warnings or errors.

## Session update - canvas layout selection layering

- The active transform frame now sits one layer above its selected source instead of above the entire canvas. Foreground layouts therefore receive pointer input before a selected full-canvas background frame.
- In-app Browser QA clicked a visible overlapping video layout and selected `Video hoa 13`; its transform frame matched the video bounds at z-index 988, with no console warnings or errors.

## Session update - media-bounded selection frames

- Video layers now report their intrinsic aspect ratio to Studio after loading. A `contain` selection frame uses that real ratio rather than a larger assumed layout box.
- Validation passes: `pnpm typecheck`, `pnpm lint`, and focused Studio preview tests (8/8). Browser QA selected `Video hoa 13`; the selection and rendered layer bounds were identical, with no console warnings or errors.

## Session update - video to GIF conversion

- Studio now offers `Convert to GIF` for a selected local video. The typed Electron IPC invokes local FFmpeg, limits conversion to 15 seconds at 12 FPS/480px, saves the generated GIF in app data without overwriting the source video, and adds it as a GIF source.
- Validation passes: `pnpm typecheck`, `pnpm lint`, and `git diff --check`. Browser QA confirms selecting `Video hoa 13` exposes `Convert to GIF` with no console warnings or errors; conversion itself intentionally requires Electron rather than the browser-only dev bridge.

## Session update - green-screen avatar removal

- Image avatars with a green screen now use the existing per-layer chroma pipeline in Studio. Newly added image avatars receive the green key by default, while existing saved image avatars are repaired on project load and persisted.
- Validation passes: `pnpm typecheck`, `pnpm lint`, focused chroma/Studio preview tests (10/10), and `git diff --check`.

## Session update - per-source chroma-key controls

- The Studio inspector now exposes a working per-source `Xóa phông màu` control for images, GIFs, and avatars, with a background-color picker and sensitivity slider. The controls update the selected layer's chroma key immediately, are persisted by the existing autosave flow, and are used by both Studio preview and Browser Source.
- The older global image-background fields no longer masquerade as a source-level removal control.
- Validation passes: `pnpm typecheck`, `pnpm lint`, focused chroma/Studio preview tests (10/10), and `git diff --check`. In-app Browser QA at `http://127.0.0.1:5173/#/projects/perfume` selected a GIF source, revealed the chroma controls, enabled the color picker and sensitivity slider, restored the prior state, and reported no console warnings or errors.

## Session update - immediate imported-media persistence

## Session update - primary audio scripts

- The script editor now exposes Audio as a primary playable source, not only as a track attached to a video.
- Existing audio scripts no longer display an empty source selector; selecting an audio source updates the script playback type before Play starts it.
- Empty legacy video scripts with an attached audio track are repaired to primary audio scripts during playback synchronization.
- An audio-primary script now clears its video-only attached-audio field before autosave; the attached-audio selector is disabled unless its primary source is a video.
- Root cause verified against the live Scene Runtime: a script source update changed the script data but left the playback controller's active snapshot pointing at the former avatar/video. The stale presentation muted the actual audio at volume 0. Controller reconfiguration now rebinds active source IDs and advances the playback revision atomically.
- Corrected the audio workflow: importing audio only adds a source; attaching it to a video or video-avatar makes it that video's `audioLayerId`. The attached track waits for its primary video to become ready, then starts with it and stops when the video script changes.
- Validation: `pnpm typecheck`, focused Studio ESLint, 15 prepared-playback unit tests, and `git diff --check` pass.

## Session update - local audio playback

- Imported audio is now added to the automatic playback lane immediately, so it has an active playback owner instead of remaining silent as a canvas-only source.
- Attached audio now publishes and persists before the script dialog opens. Electron also permits the operator-triggered media flow after the native file picker closes, preventing Chromium autoplay rejection.

## Session update - synchronized waiting-scene transitions

- Studio now keeps the outgoing Timeline layer visible while its successor prepares, matching the Browser Source transition state instead of hiding the old scene immediately.
- Timeline readiness for video now waits for a decoded compositor frame (`requestVideoFrameCallback`) rather than the earlier `playing` signal.
- Browser Source independently retains its outgoing Timeline frame until its own decoder has a frame for the incoming clip, preventing Studio and OBS from switching at different moments.
- Validation passes: `pnpm typecheck`, focused changed-file ESLint, unit suite (31 files, 172 tests), and `git diff --check`.
- Rendered Browser QA remains blocked: the first local navigation hit `ERR_CONNECTION_REFUSED` while Vite was starting, and the retry timed out in the in-app browser CDP connection.

## Session update - shared avatar motion frame

- Avatar motion files are now treated as states of one presenter. All assigned motion states share the same transform, so moving, resizing, rotating, or nudging any state updates every other state immediately.
- The first assigned motion state establishes the frame; subsequent states inherit it automatically. A new `Avatar state` selector on the selected avatar assigns `idle`, `talk`, and gesture files without allowing duplicate state ownership.
- The shared transform is normalized on project load and persisted to the scene, so Studio and Browser Source receive the same avatar frame.
- Validation passes: `pnpm typecheck`, focused ESLint, dedicated avatar-motion and avatar-state tests (4/4), and `git diff --check`. In-app Browser visual QA is still blocked by a CDP `Runtime.evaluate` timeout against the local Studio route.

## Session update - quick text and sticker sources

## Session update - safe sticker placement

## Session update - unified layer ordering

## Session update - gapless waiting-video transitions

## Session update - decoded-frame avatar crossfade

## Session update - Browser Source avatar synchronization

## Session update - resilient automatic Timeline playback

- Timeline media is now marked ready only on the native `playing` event. A clip that was preloaded but cannot actually start no longer leaves the timeline in a false playing state.
- A rejected `play()` now enters the existing recovery path and advances to the next waiting clip. Avatar videos assigned to Timeline bypass the independent avatar-motion controller so they are not paused outside Timeline control.
- Validation: prepared playback and avatar state tests (17/17), `pnpm typecheck`, focused ESLint, and `git diff --check` pass. Rendered recheck was unavailable because the test browser tab had already been handed off for user testing.

- Browser Source now retains the outgoing avatar independently when its own decoder has not yet produced a frame for the incoming avatar. It begins the crossfade only after its local compositor has that frame, rather than trusting Studio's earlier readiness signal.
- Validation: avatar state and Scene Runtime tests (8/8), `pnpm typecheck`, focused ESLint, and `git diff --check` pass. In-app Browser Studio reload at `http://127.0.0.1:5173/#/projects/perfume` renders meaningful content without a framework overlay or console warnings/errors; the fixture does not include two assigned avatar-motion videos for a live transition capture.

- Avatar transitions now wait for Chromium's `requestVideoFrameCallback`, not merely `loadeddata`; the outgoing avatar remains on screen until the incoming avatar has a decoded compositor frame.
- Studio and loopback Browser Source both keep an unready incoming avatar transparent, then use the existing 300 ms opacity crossfade once its first frame is ready.
- Validation: avatar state, prepared playback, and scene runtime tests (22/22), `pnpm typecheck`, focused ESLint, and `git diff --check` pass. Visual smoke remains pending because no Browser Editor is connected (`Scene runtime smoke editor was not found`).

- The completed waiting clip now remains visible during the next clip's loading state and is removed only after that successor reports an available frame.
- Preloaded clips now also re-report readiness when they become active, preventing the controller from remaining in loading state and eliminating the visible black gap.
- The transition layer is published to the loopback Browser Source so OBS follows the same no-blank-frame behavior.
- Validation: focused prepared playback, scene runtime, and scene serialization tests (22/22), `pnpm typecheck`, focused ESLint, and `git diff --check` pass.

- Avatar layers no longer receive a fixed foreground z-index. The first item in `Nguồn` is always in front, regardless of source type.
- The four layer-order buttons therefore allow a layout, text, or sticker to sit above an avatar, with the same result in Studio and Browser Source.
- Validation: focused Studio preview tests (10/10), `pnpm typecheck`, focused ESLint, and `git diff --check` pass.

- Built-in stickers now enter as a compact upper-left overlay rather than a full-canvas image. Existing layer transforms and their relative ordering are unchanged.
- The same placement rule is used by the Studio preview and loopback Browser Source.
- Validation: focused Studio preview tests (9/9), `pnpm typecheck`, focused ESLint, and `git diff --check` pass.

- Added direct text and sticker controls to the Studio source header. Text opens the existing editor; the sticker control adds a built-in `HOT DEAL` layer.
- Validation: `pnpm typecheck`, focused ESLint, and `git diff --check` pass.

- Adding local image, video, audio, avatar, or a converted GIF now writes the updated scene and media references immediately after the source is accepted. Repairing a missing-media path does the same, so closing the desktop app before the prior 350 ms autosave delay cannot discard an imported source.
- Validation passes: `pnpm typecheck`, `pnpm lint`, focused project validation/database/Studio preview tests (25/25), and `git diff --check`. Browser smoke at `http://127.0.0.1:5173/#/projects/perfume` rendered Studio without framework overlay or console warnings/errors; native picker persistence still requires Electron rather than the browser-only dev bridge.
