# Roadmap

The authoritative phase definitions and exit criteria are in `NEW_REPO_FULL_PLAN.md`.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Development shell, IPC, SQLite, test foundation, required docs | Complete |
| 1 | Reference inventory and visual foundation | In progress |
| 2 | Projects, settings, persistence | Complete for rebuild criteria; reference interaction parity still tracked in Phase 1/13 |
| 3 | TikTok Live connector | In progress; mock/record/replay lifecycle complete, real-room verification pending |
| 4 | Trigger, filtering, moderation | Complete for rebuild criteria; exact reference decision semantics remain a parity item |
| 5 | Product catalog and matching | Complete for rebuild criteria; exact reference catalog/matcher semantics remain a parity item |
| 6 | AI reply engine | Complete for rebuild criteria; live providers and exact reference semantics remain parity items |
| 7 | TTS and queue | Complete for rebuild criteria; live providers and exact reference semantics remain parity items |
| 8 | Avatar Studio and scene editor | Complete for rebuild criteria; configured reference parity pending |
| 9 | Local scene runtime | Complete for rebuild criteria; configured reference output parity pending |
| 10 | OBS and virtual camera | In progress; mock/protocol workflow complete, real OBS/camera-consumer verification pending |
| 11 | TikTok Shop and scheduler | In progress; rebuild foundation complete, authenticated reference/live verification pending |
| 12 | Logs, diagnostics, resilience | In progress; diagnostics UI plus database, runtime-lock, and owned-browser recovery complete, broader lifecycle/long-run/reference work pending |
| 13 | Full parity and long-run testing | In progress; prepared Video Room playlist slice implemented, real Electron/OBS and long-run evidence pending |

## Prepared Video Room playback slice (2026-08-01)

The next manual-first expansion is specified in `docs/MANUAL_PREPARED_SCRIPT_PLAN.md`. It upgrades the ordered media playlist into directly addressable prepared scripts with video/audio/TTS playback, avatar talking synchronization, interrupt/completion policies, operator hotkeys, persistence migration, and OBS evidence gates.

- Schema v12 stores an ordered, bounded playlist of enabled layer IDs; existing scene-layer loop/mute/volume fields remain canonical and v11 idle assignments migrate without restoring response behavior.
- The renderer-owned controller now has stopped/starting/idle/paused/loading/recovering/error states, exact playback-revision ended guards, R1→R2→R3→R1 cycling, one-active-item semantics, bounded missing-media recovery, retry-to-R1, and session-only short-playlist/rotation warnings.
- Studio uses typed video/audio media selection and stable managed media components; controller snapshots publish active layer, revision, pause, mute, volume, and loop to the loopback runtime. Browser Source accepts only newer server/playback revisions and pauses inactive managed media before activating one item.
- Automated focused tests and a controller smoke pass. Native picker, repeated local AV playback, OBS monitoring, and a dedicated real Electron Browser Source smoke remain next evidence; no packaging or release work is included.
| 14 | Portable release, only after parity approval | Deferred |

## Phase 2 exit record

- Complete: project CRUD, open/touch, last-project startup restoration, autosave, schema v3 migration, backup/recovery, clean-profile export/import, global safe provider metadata, per-project image/avatar/livestream settings, and missing-media detection with native repair selection.
- Evidence: unit/integration tests, real-Electron launch smoke, three-profile project persistence smoke, three-profile global settings persistence/recovery smoke, and same-size Projects/Settings/Editor comparisons.
- Phase 1 remains independently partial because authenticated reference mutations and configured live/audio states still require a dedicated non-secret fixture.

## Phase 3 progress record

- Complete in the rebuild: replaceable real/mock adapters, validated username input, normalized chat/gift/like/follow/share events, completed-gift-only handling, connection/reconnection/disconnection, bounded feed and counters, recording/replay fixture, stream-end/error states, stale-listener rejection, route/app cleanup, typed IPC, and real-Electron UI smoke coverage.
- Evidence: `tests/unit/live-connector.test.ts`, `tests/fixtures/tiktok-live-session.json`, `pnpm test:live-connector-smoke`, `artifacts/rebuild/live-connector/mock-five-events.png`, and the unchanged offline editor comparison at `artifacts/comparisons/project-editor-live-default/report.json`.
- Remaining exit criterion: verify all five interaction types against an appropriate real public live room. No real-room success is claimed, and Phase 3 remains in progress until that evidence exists.

## Phase 4 exit record

- Complete: per-event enable/action settings, lowercase and Vietnamese accent folding, URL/empty/punctuation/emoji/trivial-greeting/short filters, allow/block keywords, banned output terms, 45-second duplicate window, 2-second global cooldown, 30-second per-user cooldown, and a deterministic machine-readable decision trace.
- Project schema v4 persists moderation settings and migrates v3 trigger records without losing existing TikTok/voice/cooldown/product-pin values.
- Evidence: 55 Vietnamese cases in `tests/fixtures/vietnamese-moderation-cases.ts`, `tests/unit/moderation-engine.test.ts`, project migration/persistence coverage, and `pnpm test:live-connector-smoke` proving a trigger action changes during an active session without reconnecting.
- Exact reference skip-order, keyword UI, and configured feed presentation remain unverified and are tracked as parity gaps rather than blockers for the rebuild engine.

## Phase 5 exit record

- Complete: versioned project product catalog with add/edit/delete/enable controls, TikTok ID/index, price, description, selling points, typed media references, JSON import/export, and project schema v5 persistence/migration.
- Deterministic matcher is accent-insensitive, excludes disabled products, assigns exact product-name inclusion score `1000`, uses threshold `160`, and exposes the top five scored candidates without altering stored product facts.
- Evidence: `tests/unit/product-catalog.test.ts`, `tests/unit/project-validation.test.ts`, full 58-test gate, project persistence smoke across restart/export/clean-profile import, and Browser QA at desktop plus 390x844 with a clean console and no horizontal modal overflow.
- Exact reference product fields, authenticated catalog presentation, token weights, tie-breaking, and debug visibility remain unverified in `REF-014`; Phase 6 starts without claiming those parity details.

## Phase 6 exit record

- Complete: replaceable mock, OpenAI-compatible, OpenRouter, and Ollama adapters; model discovery/connection test; timeout, retry, cancellation, provider-error fallback, and public config metadata persistence without API-key persistence or disclosure.
- Project schema v6 persists system/persona prompts, five event templates, timeout, retry count, and fallback preference. Prompt previews expose event, persona, matched product score/facts, and the final user message before generation.
- Replies are cleaned to one or two sentences, at most 45 words and 220 characters. Hidden prompt/key language, banned terms, and unsupported price/stock/discount/shipping claims are rejected; fallbacks use only event identity and stored product facts.
- Evidence: 14 AI-focused unit tests, project migration/persistence coverage, `pnpm test:ai-reply-smoke`, `artifacts/rebuild/ai-reply/mock-prompt-preview.png`, live-feed mock generation, and Browser QA at desktop plus 390x844 with a clean console and no dialog overflow.
- Real provider calls need user-supplied endpoints/keys and exact reference AI prompt/provider semantics remain open in `REF-015`; no live-provider success or full parity is claimed.

## Phase 7 exit record

- Complete: bounded 100-item interaction queue; queued, AI processing, TTS processing, playing, done, skipped, cancelled, and error states; one active playback; 120-second timeout; skip, clear, retry, cache, and idle/talking synchronization.
- TTS providers are isolated behind typed main-process IPC with deterministic mock, replaceable HTTP audio, and renderer Windows speech adapters. Provider secrets remain session-only; public kind/endpoint/voice metadata may persist without returning or exporting API keys.
- Project schema v7 persists voice, speed, volume, and timeout. Live `voice_tts` and `ai_speech` decisions now travel through the same cancellable queue, and clear/connect/reconnect/dispose release active work.
- Evidence: `tests/unit/interaction-queue.test.ts`, `tests/unit/tts-provider-service.test.ts`, schema migration/persistence coverage, `pnpm test:tts-queue-smoke`, and screenshots under `artifacts/rebuild/tts-queue/`. A 300-job mock run verifies no overlap or listener growth.
- Browser QA passes at 390x844 with clean console, page/dialog horizontal containment, internal dialog scrolling, a completed mobile preview, and usable queue controls. Exact reference TTS/provider/queue behavior and live HTTP/Windows-provider output remain open in `REF-016`; no full parity is claimed.

## Phase 8 exit record

- Project schema v9 introduces portrait/landscape 1080p canvas presets, persistent layer metadata, and controlled built-in/media/text source descriptors. Older layers migrate with safe defaults.
- Core layer lifecycle now supports add, select, delete, duplicate, rename, hide/show, lock/unlock, opacity, reorder, keyboard nudge, pointer transforms, and a bounded 100-step undo/redo history. Locked layers reject delete, reorder, nudge, resize, rotate, and drag.
- Canvas preset switching is now user-operable and part of the same history. The preview changes between measured 9:16 and 16:9 geometry; project restart, export, and clean-profile import preserve preset dimensions.
- Layer controls now drive stable keyed image/video/text/avatar elements, real `object-fit`, loop/mute, avatar role visibility, and per-pixel chroma canvas processing without replacing the source media node.
- Grid, center/grid snapping, temporary guides, 50-200% zoom, zoom shortcuts, and source thumbnails are functional. Source-list order now matches visual stacking while edit overlays remain above runtime media.
- Text, image, and avatar inspector mutations now share scene history; avatar dialog drafts implement real Cancel semantics. Paired idle/talking authoring uses distinct controlled sources, and a controlled animated GIF advances without replacing its media node.
- The one-scene-per-project lifecycle uses the existing project duplicate/autosave/restart/JSON export/import path; persistence coverage now includes GIF and paired avatar roles.
- Evidence: chroma/transform/history/project unit tests, project migration/database coverage, full 90-test gate, all relevant Electron smokes, GIF frame-diff artifacts, paired-avatar TTS node-identity checks, and earlier desktop/mobile Browser evidence under `artifacts/rebuild/studio/`.
- Exact configured-media reference behavior remains unavailable and is retained as a parity gap; it does not block starting Phase 9 rebuild work.

## Phase 9 exit record

- Complete: separate lightweight renderer, loopback-only random-port HTTP server, validated SSE snapshots/patches, controlled built-in/project media IDs, health/readiness/browser-log endpoints, full-state reconnect, and clean service shutdown.
- The editor publishes scene changes in about 40 ms independently of persistence and publishes idle/talking changes immediately; identical state is suppressed. The active Browser Source URL is visible and copyable in Electron.
- Runtime rendering preserves keyed media nodes for small patches and implements scene geometry/order, image/GIF/video/avatar/text sources, media fit, loop/mute, avatar state, text styling, transforms, and chroma canvases. View-only grid/snap/zoom state never enters the output.
- Evidence: `tests/unit/scene-runtime-service.test.ts`, full 94-test gate, `pnpm test:scene-runtime-smoke`, 115 ms latest propagation, reload resynchronization, stable node identity, asset traversal rejection, bounded logs, and 1.53% controlled editor/browser visual diff under `artifacts/rebuild/scene-runtime/`.
- Exact configured reference SSE/browser-output behavior is unavailable and remains in `REF-017`; Phase 10 may begin without claiming full application parity.

## Phase 10 progress record

- Complete in the rebuild foundation: validated loopback OBS configuration, session-only password, public OBS WebSocket v5 authentication/request adapter, deterministic mock, typed IPC, editor settings/status UI, dedicated scene and Browser Source setup, safe ownership persistence, resolution/FPS settings, Program Scene switch/restore, and virtual-camera start/stop/disconnect cleanup.
- Safety: existing unowned scene/source names cause explicit conflicts; no OBS resource is deleted. A camera already active before connection is never claimed or stopped. Only an app-started camera is stopped during user action, disconnect, or shutdown.
- Evidence: six OBS unit tests including an authenticated local WebSocket protocol fixture, full 100-test gate, `pnpm test:obs-smoke` with six cycles and reconnect, plus critical Phase 2/9/close regression smokes.
- Remaining exit evidence: real OBS Browser Source visibility, a real camera consumer, repeated real start/stop, and OBS process restart recovery. OBS is not installed locally, so Phase 10 remains in progress under `REF-018`.

## Phase 11 progress record

- Complete in the rebuild foundation: Chrome/Edge detection or explicit executable, app-owned profile, random loopback CDP port, manual-login state, Playwright connection, replaceable dashboard selectors, scrolling/deduplication, local-product mapping, exact remote-ID pin, persisted schedule document, retry/pause/resume/skip/immediate-stop scheduler, diagnostics, failure screenshots, typed IPC, dev mock, and editor UI.
- Browser safety: existing browser processes/profiles are never inspected or reused; credentials and cookies never cross IPC; only the process tree launched by the service is stopped. Dashboard validation permits HTTPS and loopback HTTP fixtures only.
- Evidence: six Shop service tests, `pnpm test:shop-smoke` with separate temporary Chrome profiles for exact-pin and selector-failure fixtures, controlled diagnostic screenshot, `pnpm test:shop-ipc-smoke` across renderer reload and Electron restart, full 108-test gate, process/profile cleanup audit, and in-app Browser QA at desktop plus 390x844 with clean console and no horizontal overflow.
- Remaining exit evidence: authenticated TikTok Shop products, exact live pin side effect, live selector diagnostics, schedule operation against a seller fixture, browser-close recovery in the real dashboard, and configured reference comparison. Phase 11 remains in progress under `REF-011`.

## Phase 12 progress record

- Foundation complete: typed health/log contracts, bounded structured log persistence, atomic temporary writes and recovery, invalid-file quarantine, search/filter/export/clear, deep secret/private-prompt redaction, isolated health-provider failures, Electron main instantiation, typed IPC/preload/dev bridge, and searchable health/log UI.
- Resilience complete for the current rebuild slice: SQLite integrity validation chooses a valid primary/newer `.tmp`/`.bak`, corrupt candidates are quarantined, startup diagnostics record the selected source, Electron uses native single-instance ownership plus an app lock with token-safe release, and stale Shop Chrome/Edge cleanup requires exact PID, executable, app-owned profile, and owner token before terminating a process tree.
- Evidence: diagnostics and resilience unit/integration coverage, a 2,200-event bounded persistence/restart burst, `pnpm test:diagnostics-smoke`, `pnpm test:recovery-smoke`, dedicated-browser Shop smoke with owner-record cleanup, full 127-test gate, and in-app Browser QA at desktop plus 390x844. No raw API key, cookie, password, token, authorization header, private prompt, or circular object reaches list/export/on-disk evidence.
- Lifecycle/UI slice complete: renderer-driven TikTok, AI, TTS, scene, OBS, and Shop lifecycle successes/failures pass through a shared redacted recorder; successful high-frequency generation/synthesis events are intentionally not logged. Internal TikTok callbacks, Shop scheduler advances, scene runtime client/ready/browser-warning changes, and queue failure/cancel/retry/clear/full events are recorded structurally with time-window suppression.
- Restart soak complete for the rebuild: six real-Electron cycles exercise mock TikTok, AI, TTS, scene, OBS, Shop, queue diagnostics, SQLite persistence, and diagnostics export; three cycles terminate the exact spawned Electron tree and the following launches recover three stale locks. Final graceful shutdown leaves no runtime lock.
- Recovery UX complete for the current rebuild slice: startup database, runtime-lock, and exact-owned Shop orphan outcomes produce bounded redacted notices; the shared banner supports technical-detail expansion, Diagnostics navigation, and per-tab-session dismissal. Desktop and exact 390x844 QA pass without console warnings or horizontal overflow.
- Remaining: longer wall-clock media/network soak and reference diagnostics/resilience comparison under `REF-019`.

## Phase 13 progress record

- The authoritative requirement ledger is `docs/PHASE_13_COMPLETION_AUDIT.md`; it separates proven rebuild behavior from mock-only, reference-pending, live-fixture-pending, and currently running evidence.
- Added an isolated configurable long-session Electron harness with a default 480-minute target. It repeatedly exercises AI, TTS, scene publication, queue diagnostics, Shop pinning, OBS camera cycles, and TikTok/OBS/Shop disconnect-recovery while enforcing health, log, redaction, scene-runtime, shutdown, lock, process, temporary-profile, and renderer/runtime resource-growth invariants.
- The latest 2-minute qualification passes with 58 iterations, 5 injected fault cycles, 145 peak logs, renderer 12.9 MB heap/305 nodes, and scene runtime 1.9 MB heap/33 nodes. This demonstrates harness operation and bounded sampling only; it is not substituted for the required eight-hour simulation.
- Active-work restart evidence now passes: an exact isolated Electron tree is terminated while mock TTS is playing and a canvas change is waiting in the autosave debounce; restart retains the last valid committed scene, exposes stale-lock recovery, resets the session queue to zero/idle, and cleans the final runtime lock/profile.
- Avatar-script AI generation now uses the configured provider boundary with bounded fact-only prompts, visible validation/provider errors, exact cancellation on close/route leave/unmount, stale-response suppression, and draft-only results until the existing Save/autosave path. Twelve unit tests, a real-Electron generation/cancel/restart smoke, and desktop/mobile Browser QA pass.
- The first attempted eight-hour observation ended without a final harness result after about 3 hours 40 minutes. Cleanup was complete, but the run is invalid as qualification evidence and must be repeated on the integrated code.
- A final-code 2-minute qualification passes with 57 iterations, 4 fault cycles, 132 peak logs, renderer 13.2 MB heap/305 nodes, and scene runtime 2.0 MB heap/33 nodes.
- The next 480-minute attempt ran 84 minutes and reached iteration 1001 before exposing a harness-only bug: the simulated queue diagnostic used the unbounded iteration number as `count`, while the validated IPC contract accepts at most 1000. The app rejected the invalid payload correctly; the harness tree, profile, lock, and CDP listener cleaned up.
- The harness now cycles the simulated active queue count through 0..100. An accelerated 5-minute qualification passes 1016 iterations and 10 fault cycles with 941 peak logs, renderer 38.5 MB heap/305 nodes, and scene runtime 2.5 MB heap/33 nodes, proving the former iteration-1001 boundary is crossed.
- A corrected 480-minute run started at 2026-07-29 23:06:45 -07:00 with isolated profile `ai-livestream-long-session-soak-91CoCP`; this is the active eight-hour evidence target.
- Remaining: execute and observe the full eight-hour run with resource-growth evidence; real OBS output/camera and authenticated Shop verification; all recorded reference screenshot comparisons; and screen-by-screen manual parity sign-off.
