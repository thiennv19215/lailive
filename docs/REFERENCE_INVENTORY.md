# Reference Inventory

Status: audit in progress. This document is deliberately not a parity claim.

## Installation

- Path: `C:\Users\nguye\Downloads\LivestreamAgent-1.4.0-win-setup-x64\$PLUGINSDIR\app-64`
- Executable: `LivestreamAgent.exe`
- Initial file presence confirmed on 2026-07-29.
- `app.asar` contains 30,565 entries and declares `livestreamagent` version `1.4.0`.
- Main entry: `dist-electron/main/index.js`; renderer includes Vue Router/Pinia and standalone pages for setup, user, guide, feedback, logs, monitor, payment, and about.
- Relevant public dependencies observed: `better-sqlite3`, `tiktok-live-connector`, `pixi.js`, `@pixi/gif`, `vue3-moveable`, `playwright-core`, `ffmpeg-static`, and `ffprobe`.

## Confirmed top-level screens

### Login

- Dark navy/purple gradient marketing panel and a white sign-in card.
- Email, password, remember toggle, primary login action, and secondary account text.
- Fresh audit profile captured in `artifacts/reference/login.png` (gitignored local evidence).
- At an emulated 390x844 renderer, the reference keeps the desktop hero composition and clips the login form outside the visible viewport; `bodyScrollHeight` remains 844, so the hidden form cannot be reached by scrolling. Captured in `artifacts/reference/login-mobile.png`.

### Registration

- Reachable from login through `Tạo tài khoản miễn phí` at `#/register` in a clean isolated profile.
- Marketing copy includes `Bắt đầu hoàn toàn miễn phí.`, three benefit rows, and version/build text; the form includes username, email, password, password confirmation, optional referral code, `Tạo tài khoản`, and `Đăng nhập`.
- Safely observed sequential client validation: `Tên người dùng tối thiểu 3 ký tự`, `Email không hợp lệ`, `Mật khẩu tối thiểu 6 ký tự`, and `Mật khẩu xác nhận không khớp`.
- A valid registration was not submitted; no account or external service state was created during the audit.
- The 390x844 registration state behaves the same way: the hero remains visible while the five-field form is clipped outside the non-scrollable viewport. Captured in `artifacts/reference/register-mobile.png`.

### Projects / Home

- 40px dark title bar (`#131316`) with orange broadcast mark and add button; root background is `#0b0b0d` and the observed font stack starts with Inter.
- Left account/credit panel and navigation: `Trang chủ`, `Mẫu`, `Cài đặt`.
- Project heading, create-project card, portrait project cards, local badge, relative timestamp, and empty-avatar card.
- Each existing project card exposes a dedicated delete icon; it was inventoried but not clicked on the authenticated profile.
- Leaving an edited project for the home route shows a blocking save state: `Đang lưu dự án` and `Vui lòng đợi...` before the project list appears.
- Existing-profile state captured in `artifacts/reference/projects.png`; it contains private local profile data and is intentionally gitignored.

### Template center

- Heading `Trung tâm mẫu`, descriptive subtitle, and dense portrait template grid.
- Cards show visual preview and template/category name; horizontal content continues beyond the first viewport.
- Captured in `artifacts/reference/templates.png`.

### Settings

- Heading `Cài đặt`, Grok and Veo3 tabs, account count, instructional panel, add-account action, and empty-account state.
- Authenticated reference captured at a 1536x824 logical renderer / 1920x1030 PNG. The settings content sits inside a large bordered outer surface; the add action spans below the guide and the provider empty state sits outside the inner provider panel.
- Grok add form: `Nhãn Cookie`, `Giá Trị Cookie`, `Lưu Cookie`, and `Hủy`; empty state is `Chưa có cookie Grok nào`.
- Veo3 account table columns: `Nhãn`, `Trạng Thái`, `Dùng Chung`, `Tạo`, and `Hành Động`; observed states/actions include `✓ Đang Sử Dụng`, `Rảnh`, `Riêng`, `Vô Hiệu Hóa`, and `Xóa`.
- Both provider guides describe manual cookie export. The rebuild will not normalize unsafe cookie collection as a preferred workflow; live integration remains replaceable and must receive a security review.

### Project editor / Avatar Studio

- Project title row and tool rail: `Avatar`, `Hình nền`, `Video`, `Hình dán`, `Văn bản`.
- Persistent editor regions: asset browser, `Nguồn` layer list, dotted 9:16 canvas, `Tương tác`, `Nguồn âm thanh`, and `Phát trực tiếp`.
- Persistent offline states: `Ngoại tuyến`, `Chưa cài đặt livestream`, and `Không có nguồn âm thanh`.
- Bottom-right mixer actions: `Xuất video`, `Bắt đầu livestream`, and `Cài đặt livestream`.
- Avatar panel: `Thêm avatar` and an avatar asset list.
- Background panel: `Hình nền`, `Của tôi`, `For You`, `Thêm hình nền`, and empty state `Chưa có hình nền nào`.
- Video panel: `Tất cả`, `Default`, `Thêm video`; observed items include `airpods` and `water-glass`.
- Sticker panel: `Của tôi` plus `After Sales Service`, `Decorative`, `Product`, `Promotion`, and `Sticker` categories.
- Text panel: `Thêm lớp văn bản vào canvas` and `Thêm văn bản`.
- Livestream settings dialog: TikTok username with `Kiểm tra`, voice selection/preview/removal, five interaction rows, global and per-user cooldown sliders, product-pin toggle/status, minimum pin duration, and `Lưu`.
- Confirmed reference defaults in the dialog: like is disabled, the other four interactions are enabled, global cooldown is 2.0 seconds, per-user cooldown is 30 seconds, product pinning is off, and minimum pin duration is 60 seconds.
- Calling the confirmed `autopin.open()` bridge method does not create an Electron page/window target. It launches a child Chrome process using the application's dedicated `autopin/tiktok-profile`, remote-debugging port 9223, and the TikTok Shop Live product dashboard URL.
- The safe bridge result initially reports `running: false`, `windowOpen: true`, `context: unknown`, `liveManagerStatus: checking`, and `Đang mở TikTok Live Manager`. After the public redirect it reports `Đang chờ đăng nhập`; `getProducts()` returns an unavailable/empty error. No cookie, profile, seller, or product values were inspected or retained.
- Measured editor geometry at a 1536x824 renderer: 40px titlebar, about 36px project bar, 140px tool rail, 300px combined asset/source panel, 234px activity panel, about 573px upper workspace, and a 175px bottom mixer spanning all columns except the tool rail.
- Hidden avatar-library dialog: `Tạo hình đại diện`, `Của tôi`, `Thêm avatar của bạn`, empty-library guidance, preview prompt, and `Chọn`.
- Hidden add-avatar dialog: name, video picker, 10-30 second MP4 and 1080p-4K guidance, one unobstructed face, mouth/camera guidance, count `1...9`, and `Lưu`.
- Captured in `artifacts/reference/project-editor.png` and `artifacts/reference/project-editor-alt.png`.

### Hidden global/account dialogs

- Quit confirmation: `Gợi ý`, `Bạn có chắc muốn thoát không?`, remember-choice checkbox, `Hủy`, and `Thoát`.
- Profile management: username, email, account type, local-draft notice, `Huỷ`, and `Lưu thay đổi`.
- Private account values visible in the reference DOM were intentionally excluded from evidence and documentation.

### Standalone auxiliary windows

- These surfaces are not main-window hash routes. They are opened through `$mapi.app.windowOpen(windowName)` and load standalone files under `dist/page/`.
- Confirmed mappings in an isolated clean profile: `guide` -> `guide.html`, `feedback` -> `feedback.html`, `monitor` -> `monitor.html`, `payment` -> `payment.html`, `user` -> `user.html`, `setup` -> `setup.html`, and singular `log` -> `log.html`.
- `guide.html`: title row `Hướng dẫn` and a light full-body loading state `Đang tải...`; no body controls are exposed. Exact 800x542 evidence is `artifacts/reference/guide-window-loading.png`.
- `feedback.html`: title row `Phản hồi` over a light empty body with zero clean-profile controls or copy. Exact 700x600 evidence is `artifacts/reference/feedback-window-empty.png`.
- `monitor.html`: untranslated title key `page.monitor.title`, an underlying `Làm mới` button, and a light full-body `Đang tải...` overlay in the clean profile. The overlay remains present after two seconds and intercepts pointer events, so refresh is not reachable in this state. Exact 702x502 evidence is `artifacts/reference/monitor-window-loading.png`.
- `payment.html`: title row `Thanh toán`, a blank 117x117 QR frame, and `Quét mã WeChat / Alipay`. `$mapi.app.windowOpen('payment')` rejects with `An object could not be cloned` while the renderer remains responsive; this isolated run exposed no usable QR payload or body controls. A prior run also exposed a `user_web?` target, so webview recovery remains inconsistent. Exact 502x400 evidence is `artifacts/reference/payment-window-clone-error.png`.
- `user.html`: title row `Trung tâm người dùng` and a `user_web?` webview. A fresh isolated run resolved `$mapi.app.windowOpen('user')` with `undefined`, first painted centered `Đang tải...`, then settled on a blank light webview with a `Quay lại` action. Clicking `Quay lại` exposed `Tải thất bại, vui lòng kiểm tra mạng` and a `Làm mới` action without closing the owner window or invoking an app bridge. Exact evidence is `artifacts/reference/user-window-one-shot.png`, `artifacts/reference/user-window-error-recovery.png`, and `artifacts/reference/user-window-after-back.png`.
- `setup.html`: title row `Khởi tạo`; the clean body is a blank two-pane layout with a 156px left pane and bordered empty right pane. No controls render because setup already reports complete. Exact 800x542 evidence is `artifacts/reference/setup-window-empty.png`.
- `log.html`: title `Nhật ký`, `Mở tệp` action, and clean-profile empty state `Không có tệp nhật ký`. The native file action was not activated because no reference log file should be opened or copied during Phase 1.
- `about.html`: directly captured as a light-theme `Giới thiệu` window with `v1.4.0 Build 20260729102730`, enabled `Tự động kiểm tra cập nhật`, `Nhật ký`, official-site section, AGPL-3.0 disclaimer, Github/Gitee links, and `© 2026 LivestreamAgent`.
- No tested `$mapi.app.windowOpen(...)` key opened About. Its actual framework/menu launch context remains unconfirmed, and the rebuild intentionally does not copy its branding, repository destinations, license claim, or update behavior.
- Exact clean-profile renderer viewports at 125% Windows DPI: guide 800x542, feedback 700x600, monitor 702x502, payment 502x400, user metadata 700x500, setup 800x542, and log 800x600. Fresh User CDP metrics can report 702x502 because of the two-logical-pixel Windows DPI rounding already tolerated by the capture runner.
- User loading, clean recovery, back-triggered network error, and refresh recovery are confirmed. The real authenticated webview payload and service-backed navigation remain unconfirmed and require a dedicated non-secret fixture.

## Confirmed persistence and runtime surfaces

- App data includes `data/config.json`, `data/database.db`, `data/storage/livestream.json`, `server.json`, `soundClonePrompt.json`, `task.json`, and `user.json`.
- SQLite tables observed: `data_storage`, `data_task`, `data_sound_tts`, `data_sound_clone`, `data_video_template`, and `data_video_gen`.
- Livestream config fields include TikTok username, LLM context/scenarios, TTS config, five event triggers, cooldowns, product pin settings, and thank-you template.
- Type-only inspection confirms TTS config fields for server/clone prompts plus ElevenLabs provider/model/voice and OpenAI voice IDs, live reference-audio metadata, and exactly five trigger records. No values were retained.
- Local logs and the exact process tree confirm TikTok Shop pin status polling plus a dedicated browser profile under the app data directory. This is separate from the user's normal Chrome session.
- A second reference process can run with a dedicated clean `--user-data-dir` and CDP port. It creates empty config/database/storage defaults and remains isolated from the authenticated profile.
- Renderer bridge categories include app/window, file, storage, database, server, user, auto-pin, and virtual-camera surfaces. Confirmed method names include `app.windowOpen` and `autopin.open`; no private values or compiled implementation were retained.

## Audit still required

- Project creation and deletion dialogs, card menus, template application confirmation, account/settings alternate states, native media pickers, source transform controls, configured audio/live states, AI/TTS panels, authenticated TikTok Shop product/pin states, loaded Guide/Feedback/Monitor/log/About states, and remaining error/recovery states.
- `Xuất video` entered a native/blocking path during CDP audit; no follow-up interaction was attempted and its dialog/state remains unconfirmed.
- Direct navigation to auxiliary hash routes produced blank surfaces because most are standalone windows. About and the clean log empty state are now captured, but owning visible controls and loaded/authenticated content remain unconfirmed.
- Create-project behavior, delete confirmation, and template-application confirmation remain unconfirmed because activating those controls may mutate the authenticated reference profile.
- Synthetic auth tokens do not unlock the clean profile, confirming that authenticated mutation flows cannot be safely reached by fabricating local storage alone.

## 2026-07-29 editor source audit update

- Selecting a source row changes the active selection and its inspector without otherwise mutating the scene.
- The selected canvas object exposes eight resize handles, four edges, an origin control, and a rotation handle through a Moveable-style overlay.
- The selected object also exposes a four-button floating order toolbar. Icon direction and placement support top, one-level up, one-level down, and bottom actions; exact mutation results remain pending a safe authenticated fixture.
- The text inspector exposes content, font family, size, color, alignment, bold, italic, and preset text styles.
- Rebuild verification maps those controls to the visible poster text, preserves edited content when applying a preset, clamps text size to 12-96, validates colors, and exposes pressed states/accessibility names for formatting controls.
- The image inspector exposes corner radius, background removal, background color, and removal sensitivity.
- The avatar inspector exposes an Avatar Script panel, an edit action, and an empty-script state.
- The avatar-script dialog contains an AI account/status card; Manual and TikTok Live Manager product-source tabs; product URL guidance; 40-character product-name and 500-character information limits; product paging/add controls; an AI-script action; multiple script textareas; add-script; cancel; save; and disabled video-generation actions.
- Private account labels and values visible in the dialog were deliberately excluded from evidence and documentation.
- New evidence: `artifacts/reference/project-editor-text-selected.png`, `artifacts/reference/project-editor-image-selected.png`, `artifacts/reference/project-editor-avatar-selected.png`, and `artifacts/reference/project-editor-avatar-script-dialog.png`.
- Rebuild evidence now covers functional local move, eight-handle resize, rotation, keyboard nudge, and four layer-order actions. Still unknown in the reference: exact transform constraints/math, persistence, AI generation results, and video-generation behavior.

## 2026-07-29 login failure audit update

- The password-eye control toggles the password input between `password` and `text` without changing routes.
- `Remember me` is off by default in a fresh isolated profile.
- The login fields are not native-required inputs; submission is handled by the application.
- A safe bridge-failure probe replaced `user.apiPost` with a local rejection, so no authentication request left the renderer. The button remained enabled with its normal label and the UI displayed `Email hoặc mật khẩu không đúng` after about 100 ms.
- Terms, Policy, and Help are present as pointer links. Scoped click tracing observed no route change or bridge call in the clean profile.
- The audit used only `phase1-audit@example.invalid`; no real account data was entered or retained.

## 2026-07-29 Phase 3 live connector update

- The rebuild exposes local mock and real TikTok source selection from the existing editor start action.
- The connected surface contains a status indicator, chat/gift/like/follow/share counters, reverse-chronological normalized feed cards with timestamps, clear, reconnect, fixture replay, recording download, and stop controls.
- Mock evidence uses five deterministic synthetic events and no account data. It verifies the compatibility rule that an unfinished gift streak is ignored.
- Stream-end and connector-error records are represented as normalized feed events and release the active adapter. Reconnect and route/app shutdown invalidate stale listeners before cleanup.
- Reference offline settings and interaction areas are inventoried, but a configured reference feed and real-room five-interaction capture remain unavailable. This section is rebuild evidence only and does not close `REF-012`.

## 2026-07-29 Phase 4 moderation update

- Reference evidence confirms five event toggles, chat/gift/follow/share enabled by default, like disabled by default, a 2-second global cooldown, and a 30-second per-user cooldown.
- The rebuild settings dialog now persists per-event action selection (`ignore`, `voice_tts`, or `ai_speech`), duplicate window, minimum comment length, allow keywords, block keywords, and banned output terms in project schema v4.
- The rebuild feed exposes the machine-readable decision result for each normalized interaction. Its mock timeline makes accepted, disabled, and cooldown outcomes repeatable without account or viewer data.
- Exact reference filter order, duplicate scope, keyword precedence, output checks, and decision-trace presentation remain unknown and are tracked in `REF-013`; no exact behavioral parity is claimed for those details.

## 2026-07-29 Phase 5 product catalog update

- The rebuild adds a project-scoped catalog reachable from livestream settings, with name, TikTok ID/index, price, description, selling points, typed media, enabled state, timestamps, and versioned JSON import/export.
- Project schema v5 persists the catalog and migrates older scene documents to `products: []`. The persistence smoke verifies autosave, Electron restart, project export, and clean-profile import without losing product facts.
- The deterministic matcher folds Vietnamese accents, gives exact product-name inclusion score `1000`, applies threshold `160`, excludes disabled products, and exposes the top five debug candidates while returning stored product data unchanged.
- Browser QA confirms the nested modal is clickable above livestream settings, displays `Serum dưỡng ẩm M5 · 1000`, remains horizontally contained at 390x844, and produces no relevant console warning/error.
- This section is rebuild evidence only. Exact authenticated reference fields, catalog presentation, import/export behavior, scoring weights, and tie-breaking remain open in `REF-014`.

## 2026-07-29 Phase 6 AI reply update

- The rebuild exposes mock, OpenAI-compatible, OpenRouter, and Ollama configurations with base URL, model, session-only API key, connection test/model discovery, and explicit status. Public metadata may persist; API keys are never returned, stored, or exported.
- Project schema v6 persists system/persona prompts, templates for chat/gift/like/follow/share, timeout, retry count, and fact-safe fallback preference.
- Prompt preview shows the selected event, matched product, score, and exact product context. Browser evidence confirms `Serum dưỡng ẩm M5`, score `1000`, and stored price `299.000đ` are the only product facts supplied to the mock provider.
- Final replies are reduced to one or two sentences, no more than 45 words/220 characters, and inspected for hidden prompt/key language, banned terms, and unsupported price, stock, discount, or shipping claims. Provider/reply failures do not block later interactions; clear/dispose cancels active requests.
- Real-Electron evidence is `artifacts/rebuild/ai-reply/mock-prompt-preview.png` plus `pnpm test:ai-reply-smoke`; Browser desktop/mobile checks report a clean console and a 365px dialog with equal client/scroll width at the 390x844 viewport.
- This is rebuild-only evidence. The safe reference state does not expose configured AI provider, prompt preview, live reply, error, cancellation, or recovery surfaces; those remain in `REF-015`.

## 2026-07-29 Phase 7 TTS and queue update

- The rebuild exposes mock, HTTP/local audio, and Windows speech configurations with endpoint, voice list, session-only API key, connection test, cache clear, voice, speed, volume, 120-second timeout, and queue preview controls.
- The interaction queue exposes queued, AI processing, TTS processing, playing, done, skipped, cancelled, and error states; a 100-active-job limit; skip current; clear; retry; recent history; cache markers; and idle/talking avatar status.
- Real-Electron smoke verifies public TTS config never returns the API key, repeated synthesis hits cache, cancelled playback retries from cache, two previews do not overlap, clear cancels active and queued work, and a mock live event travels through moderation to TTS/playback completion.
- Browser evidence at 390x844 confirms the page and dialog have no horizontal overflow, the dialog remains internally scrollable, preview works, queue controls are visible/usable, and console diagnostics are clean. Rebuild evidence is under `artifacts/rebuild/tts-queue/`.
- Reference type-only evidence confirms TTS task/provider/model/voice/reference-audio fields, but no values or private audio were retained. Configured provider, queue, playback, cancellation, cache, error/recovery, and idle/talking behavior remain open in `REF-016`.

## 2026-07-29 Phase 8 scene foundation update

- The rebuild scene document is now schema v9 with validated portrait/landscape 1080p presets, persistent layer metadata, and controlled built-in/media/text source descriptors.
- The source panel exposes add, select, delete, duplicate, rename, show/hide, lock/unlock, opacity, undo, and redo. Canvas order, keyboard nudge, drag, resize, and rotate share the same bounded history and lock guard.
- Desktop/mobile Browser evidence confirms deterministic duplicate/undo/redo behavior, disabled destructive/transform controls for locked layers, clean console, and no page-level mobile overflow.
- Reference selected-layer captures confirm eight handles and four order actions, but exact visibility/lock/duplicate/history controls and persistence semantics remain unavailable under the current authenticated-fixture constraint. Full Phase 8 parity is not claimed.

## 2026-07-29 Phase 8 canvas/render update

- The rebuild project bar exposes portrait 1080x1920 and landscape 1920x1080 presets. Both update preview geometry, history, autosave, restart, export, and clean-profile import state.
- Non-text layer controls expose contain/cover/fill, chroma enable/color/tolerance, video/GIF loop, video mute, and avatar idle/talking role. The rebuild renders stable keyed image/video/GIF/avatar elements, a real advancing CC0 MP4, a CC0-derived animated GIF, and paired idle/talking sources that retain DOM identity through speech transitions.
- Chroma is applied per pixel on a sibling canvas while the source media remains mounted and playing. Grid, snapping, center guides, 50-200% zoom, zoom shortcuts, source thumbnails, and source-order visual stacking are also implemented.
- Browser evidence records desktop/mobile real-media, chroma, and canvas-tool states under `artifacts/rebuild/studio/`; no relevant console warning/error or mobile horizontal overflow was observed.
- Rebuild Phase 8 exit criteria now pass, including full inspector history, draft cancellation, GIF advancement, paired avatar authoring, and project-level scene lifecycle persistence. The reference-safe state still does not expose configured media controls, canvas preset switching, idle/talking asset pairing, chroma results, grid/snap/zoom behavior, or thumbnails, so exact parity remains unverified.

## 2026-07-29 Phase 9 local scene runtime update

- The rebuild now exposes a separate browser renderer from a random loopback-only URL with SSE scene events, health, ready, browser-log, and controlled asset endpoints. The Electron editor displays a copyable Browser Source URL; browser-only Vite development keeps a deterministic no-server stub so HMR stays fast.
- Reconnect receives a complete current snapshot. Normal editor changes publish independently from autosave and the latest smoke measured 115 ms end to end; idle/talking changes publish immediately. Text/avatar patches preserve existing GIF and avatar media nodes.
- A controlled same-scene editor/browser comparison records 1.53% different pixels after normalizing a two-pixel capture-boundary variance. Chroma, animated GIF, media identity, and reconnect behavior have separate runtime evidence under `artifacts/rebuild/scene-runtime/`.
- Reference metadata confirms the broad scene JSON -> local SSE -> HTML renderer -> OBS Browser Source mechanism. Exact configured endpoint contracts, frames, timing, logging, and reconnect behavior remain unavailable and are tracked in `REF-017`; no full reference parity is claimed.

## 2026-07-29 Phase 10 OBS foundation update

- The rebuild now exposes local OBS WebSocket settings, connection testing, dedicated scene/Browser Source setup, canvas width/height and FPS, output readiness, virtual-camera start/stop, and disconnect/recovery controls.
- The main-process adapter implements the public OBS WebSocket v5 handshake and request protocol. Passwords are session-only; host and Browser Source endpoints are loopback-restricted.
- Existing unowned scene/source names are never adopted. Starting an app-owned camera switches to the dedicated scene and stopping restores the prior Program Scene; a camera active before connection remains user-owned and is never stopped by the app.
- Unit evidence includes a real in-process authenticated WebSocket protocol fixture. Electron evidence runs six mock start/stop cycles and a disconnect/reconnect recovery path without console errors.
- No OBS installation or running process exists on the current machine, and the safe reference state does not expose configured OBS behavior. Real Browser Source/camera-consumer and reference parity remain open in `REF-018`; Phase 10 is not marked complete.
