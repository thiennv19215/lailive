# Architecture Decisions

## ADR-001: Electron renderer isolation

The renderer uses `contextIsolation: true`, `nodeIntegration: false`, and a sandboxed preload. Only typed, validated IPC methods are exposed.

## ADR-002: SQLite implementation for the development shell

Use `sql.js` in the Electron main process for a portable SQLite database without native ABI rebuilds during the fast local loop. Persist exports atomically through a temporary file. Revisit only if later profiling or concurrency needs require a native driver.

## ADR-003: Hash-based renderer routing

Use Vue Router hash history so packaged file loading and refreshes remain reliable without a custom protocol during early phases.

## ADR-004: Browser-only development bridge

When the Vite renderer is opened outside Electron in development, install a localStorage-backed bridge with the same typed surface. This exists only under `import.meta.env.DEV` for browser QA and HMR checks; Electron uses the real preload/IPC/SQLite implementation.

## ADR-005: Independent Phase 1 mock imagery

Do not copy reference posters, avatars, branding, or compiled assets. Phase 1 uses locally downloaded Unsplash images with code-native overlays to preserve card/scene roles and aspect ratios. ImageGen was unavailable in the session; replacement assets remain an explicit parity-review item.

The template center uses five additional role-matched Unsplash photographs (portrait host, cosmetics, skincare, male host, and food) with original HTML/CSS campaign treatments. Source photo IDs are retained in the image download URLs used during development; no reference artwork or embedded copy is reused.

- Portrait host: `photo-1524504388940-b1c1722653e1`.
- Cosmetics: `photo-1596462502278-27bfdc403348`.
- Skincare: `photo-1616394584738-fc6e612e71b9`.
- Male host: `photo-1500648767791-00dcc994a43e`.
- Food: `photo-1504674900247-0877df9cc836`.

## ADR-006: Window-scoped reference audit

Launch the reference Electron renderer with a local CDP port and connect using `playwright-core`. Select only the exact `app.asar/dist/index.html` target, require unique text/selector matches, and never use global desktop coordinate clicks. Potentially consequential actions such as starting livestream are inventory-only until a safe fixture or explicit live-verification scope exists.

## ADR-007: Versioned local project records

Store project metadata and the versioned 1080x1920 scene document in SQLite through the main process. Renderer code uses a Pinia store and narrow validated preload methods for list/get/create/rename/duplicate/touch/delete; it never reads database files directly. Browser-only Vite development implements the same contract through a versioned localStorage adapter so renderer HMR remains fast. Project IDs and every mutation payload are validated before database access.

Scene schema v3 persists ordered layer identity/kind/transform, shared text style, image controls, avatar scripts/products, per-project livestream settings, and validated media references. Older scene/export versions migrate through one shared normalizer. Editor changes use a short debounce and flush on route leave. Portable exports use a validated `ai-livestream-project` JSON envelope; imports always receive a new local ID. Before applying a pending SQLite migration to an existing file, the database writes a sibling `.bak` recovery copy. If an initial database rename is interrupted and only the valid `.tmp` file remains, startup promotes it back to the primary path.

## ADR-008: Narrow media filesystem boundary

Persist only absolute typed media references in project documents. The renderer cannot read files or query the filesystem directly. Preload exposes two narrow operations: check whether validated references exist and open an OS file picker for one typed replacement. Existence checks return booleans without file content, while picker results are validated again in the main process. Browser-only HMR deliberately reports referenced files as unavailable because it has no filesystem authority.

## ADR-009: Persist provider metadata, never cookie JSON

Global Settings uses a dedicated schema-validated preload/IPC channel. The generic settings writer rejects the reserved `app.global-settings` key. Persist only provider labels, enabled/visible state, timestamps, and the selected provider tab; disposable JSON entered for UI validation is cleared before persistence and never reaches the database. Invalid stored documents fail closed to safe defaults and expose an explicit reset action.

## ADR-010: Replaceable TikTok connector with deterministic fixtures

TikTok ingestion is isolated behind `LiveConnectorAdapter`. Development and automated tests use a deterministic five-event mock plus a versioned recording envelope; production-facing code uses the public `tiktok-live-connector` API. The service owns lifecycle state, generation tokens, bounded event history, cleanup, and normalized contracts so later trigger/queue modules never depend on vendor event objects.

The package is externalized from the Electron main-process Vite bundle because its optional WebSocket native accelerators are runtime concerns and should not be bundled by Vite. `tiktok-live-connector@2.4.3` is AGPL-3.0; personal local development is within the current project scope, but redistribution requires a dedicated license review before Phase 14. This decision does not authorize packaging or distribution.

## ADR-011: Pure deterministic moderation before AI or TTS

Moderation runs in the renderer domain as a stateful but deterministic engine over normalized live events. It returns an accepted/skipped decision, stable reason code, selected action, normalized text, timestamp, and ordered trace. It never invokes providers, audio, shell commands, or viewer-authored code.

Block keywords take priority over allow keywords. Allow keywords bypass only trivial-greeting and minimum-length filters; they do not bypass URL, empty/content-shape, block, duplicate, or cooldown checks. Duplicate identity is scoped to normalized comment plus viewer identity so different viewers can ask the same legitimate question. Project schema v4 persists these controls, and store configuration updates the active engine without reconnecting TikTok.

## ADR-012: Validated product facts and deterministic matching

Products live inside the versioned project scene rather than a global or provider-owned store. Project schema v5 adds a validated catalog containing product identity, TikTok mapping, price, description, selling points, typed media references, enabled state, and timestamps; older scenes migrate to an empty catalog.

Matching is a pure accent-insensitive scoring step before AI generation. Exact product-name inclusion scores `1000`, the compatibility threshold is `160`, disabled products are excluded, and the five highest candidates remain available for diagnostics. The matcher returns stored product facts unchanged so later AI code cannot invent or rewrite prices and claims. Vue reactive arrays are copied through Zod parsing rather than `structuredClone`, which both validates and removes proxies before modal editing or persistence.

## ADR-013: Main-process AI providers with fact-checked renderer orchestration

Network providers run only in the Electron main process behind typed IPC. The renderer sends bounded system/user messages and receives final text plus provider/model diagnostics; it cannot perform arbitrary network access or read provider secrets. Public provider metadata persists under a reserved setting key, while API keys remain session-only and are never returned by IPC, written to SQLite, included in projects, or exported.

The provider layer supports mock, OpenAI-compatible, OpenRouter, and Ollama endpoints with explicit model discovery, timeout, retry, and AbortController cancellation. The renderer-side coordinator owns deterministic prompt construction and post-processing because it already has validated project/event/product context. Project schema v6 persists prompt behavior, not secrets.

Generated output is untrusted. Cleanup removes markdown and internal-role prefixes, enforces two sentences, 45 words, and 220 characters, then rejects hidden prompt/key language, configured banned terms, and price/stock/discount/shipping claims not represented in stored product facts. Rejected or failed generations become a deterministic fact-safe fallback when enabled. Phase 7 will place this coordinator behind the bounded audio queue rather than changing these safety rules.

## ADR-014: One cancellable interaction queue and main-process TTS providers

All accepted speech actions enter one renderer-owned `InteractionQueue`; neither live events nor AI results play audio directly. The queue bounds active work to 100 jobs, processes FIFO with one playback controller, exposes explicit lifecycle states, and coalesces subscriber snapshots so large mock runs do not create renderer listener pressure. History is bounded independently from active capacity.

Network TTS synthesis runs in the Electron main process behind validated IPC. The deterministic mock and HTTP audio adapters return a shared result contract; Windows speech returns a speech-synthesis transport that is played in the renderer without invoking PowerShell, shell commands, or executable viewer content. API keys are session-only, while safe provider metadata and project voice/speed/volume/timeout settings may persist.

Cancellation is end-to-end: skip and clear abort queue playback and request provider cancellation; live reset and project disposal clear the queue; app shutdown cancels all main-process TTS controllers. Successful synthesis may remain in the bounded 100-item cache so a cancelled playback can retry without another provider request.

## ADR-015: Versioned layer metadata and explicit editor history

Phase 8 layer behavior is part of the project document rather than transient component state. Schema v9 stores canvas preset/dimensions, each layer's transform/render controls, and a controlled built-in/media/text source descriptor. Legacy documents migrate through validated defaults instead of scattering compatibility branches through the editor.

Undo/redo is an explicit bounded history of validated scene snapshots, not an attempt to reverse arbitrary Vue reactivity. The snapshot includes canvas preset, layers, text style, image settings, and nested avatar product/script settings. Pointer movement updates the preview continuously but commits one history entry at gesture completion; sliders commit at change; discrete actions commit once. Nested values are cloned so later reactive writes cannot mutate historical snapshots. Avatar dialogs edit isolated drafts and commit one snapshot only on Save.

Layer locking is enforced by mutation entry points, not only by disabled UI. This keeps keyboard shortcuts and pointer handlers consistent with visible controls and gives later scene-runtime code a stable persisted contract.

Fit mode is applied to a persistent source element and mirrored by chroma canvas draw geometry. Avatar idle/talking switching changes root opacity only, preserving unrelated media nodes. Chroma keeps the source image/video mounted, hides it visually, and updates a sibling canvas at a capped frame rate; this avoids an inaccurate CSS filter and avoids restarting playback when the setting changes.

## ADR-016: Controlled layer assets and editor-local view state

Renderer layers resolve only enumerated built-in asset IDs or future validated media-reference IDs. Arbitrary filesystem paths are never assigned to renderer URLs. This contract is intentionally aligned with the controlled `/assets/:id` boundary planned for the Phase 9 local scene runtime.

Grid visibility, snapping enablement, temporary guides, and zoom are editor view state rather than scene output. They do not enter project history or exports. Transform results produced by snapping do enter the scene document and history. Source thumbnails are derived from the same controlled asset mapping and never start a second copy of video playback.

The controlled asset catalog includes a local CC0 MP4 plus a derived animated GIF for deterministic runtime testing. Idle/talking authoring creates two distinct controlled avatar sources at matching transforms; speech state changes opacity only, so both nodes and unrelated video/GIF playback remain stable.

## ADR-017: Loopback scene runtime with full-state patch events

The OBS-facing renderer is a separate static HTML/CSS/JavaScript surface served by a main-process HTTP service bound only to `127.0.0.1` on an available port. It does not import Vue, Pinia, Electron APIs, or Node.js. The editor reaches it only through validated `sceneRuntime` preload methods, preserving renderer isolation and allowing the same URL to be consumed by a normal browser or OBS Browser Source.

Every publish carries a validated full `ProjectSceneDocument` plus transient idle/talking state. The service labels the first event as a snapshot and later events as patches with changed top-level keys, while retaining the full state in each event. This modest payload cost makes reconnect deterministic: every new SSE client immediately receives a current snapshot without replaying a patch journal. Editor publication is independently coalesced at 40 ms so output latency is not tied to the 350 ms SQLite autosave debounce.

Assets are resolved by controlled built-in IDs or exact media-reference IDs from the current validated scene. The HTTP request never accepts a filesystem path, and unknown/traversal-shaped IDs return 404. Keyed DOM roots replace their media child only when kind/source identity changes; text, opacity, transform, avatar state, fit, loop, mute, and chroma updates preserve unrelated playback. Packaging-time asset resolution remains deferred because installer/production packaging is not authorized during local development.

## ADR-018: Public OBS WebSocket with conservative resource ownership

OBS integration uses the public OBS WebSocket v5 protocol from the Electron main process. It implements challenge-response authentication and typed request correlation directly over the Node WebSocket client; the reference private native OBS dependency is neither imported nor redistributed. OBS host validation permits loopback only, and passwords remain session-only.

The app owns only an exact scene/source pair recorded after successful creation. If either name already exists without that ownership record, setup fails with an explicit conflict instead of mutating an ambiguous user resource. Owned resources may be updated but are never deleted. Browser Source settings contain only the loopback scene-runtime URL, width, height, and FPS.

Virtual-camera ownership is tracked independently from OBS connection state. Before starting an app-owned camera, the service records the current Program Scene and switches to the dedicated AI scene. Stop, disconnect, and shutdown restore the previous scene. A camera that was already active at connection time is treated as user-owned: the app refuses to claim it and never sends a stop request for it.

## ADR-019: App-owned Shop browser and main-process scheduler

TikTok Shop automation uses Playwright over a random loopback CDP port and a profile directory below Electron `userData/shop`. The service detects standard Chrome/Edge installs or accepts an explicit executable, but it never connects to an existing browser process, debugging port, or personal profile. Login is performed manually in the owned window; credentials and cookies never cross the preload boundary or enter project exports.

Dashboard behavior is isolated behind a replaceable adapter and small selector lists. Products are deduplicated by remote ID after bounded scrolling. Single pinning first proves there is exactly one card with the requested remote ID, then clicks only inside that card; similar names and partial IDs are not accepted. Selector failures capture a screenshot below the app data diagnostics directory and return a recovery message instead of pretending the action succeeded.

Mappings and schedule items are validated and persisted, while active timers and browser handles remain main-process state. This lets a renderer refresh reattach to the same schedule snapshot without duplicating timers. A generation counter invalidates delayed callbacks on pause/skip/stop/reconfiguration, retries are bounded per item, and immediate stop clears the next action before returning. Browser shutdown first attempts CDP closure, then terminates only the owned Windows process tree after a short timeout to prevent orphaned profile locks.

`playwright-core` stays external to the Vite Electron-main bundle during development. Bundling it made main-process rebuilds stall and left preload/main versions out of sync; loading the installed public dependency at runtime keeps HMR and Electron restart feedback fast without invoking any production build or packaging workflow.

## ADR-020: Redact before diagnostics persistence

Diagnostics are structured in the Electron main process and redacted before they touch disk. Key-based rules remove credentials and private prompt fields; string rules remove common inline authorization/query tokens. The same sanitizer runs when old entries are loaded so an earlier malformed file cannot bypass current export rules. Collections and strings are bounded, circular references become explicit markers, and provider exceptions are converted into per-component health failures instead of aborting the full health snapshot.

The diagnostics log uses a small atomic JSON document for the current bounded development foundation. This keeps clear/export/recovery deterministic and avoids adding a second SQLite schema before the UI/query shape stabilizes. A later migration may move high-volume records into SQLite without changing the renderer contract.
