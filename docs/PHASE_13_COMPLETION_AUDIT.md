# Phase 13 Completion Audit

Updated: 2026-07-29

This ledger applies the Phase 13 and final-definition-of-done requirements from `NEW_REPO_FULL_PLAN.md` to current evidence. A requirement is not complete when evidence is mock-only, reference coverage is missing, or a required live fixture is unavailable.

## Phase 13 required tests

| Requirement | Current evidence | Audit result |
| --- | --- | --- |
| Unit tests for filters, scoring, cooldowns, queue transitions, truncation, schemas, and scheduler | Focused moderation, product, queue, avatar-script, AI, TTS, project-schema, diagnostics, resilience, and Shop scheduler tests are included in the 139-test gate | Proven for rebuild deterministic logic |
| TikTok event through AI and TTS integration | `pnpm test:live-connector-smoke`, `pnpm test:ai-reply-smoke`, and `pnpm test:tts-queue-smoke` cover the renderer/preload/main pipeline with deterministic fixtures | Proven for mock pipeline; real TikTok/provider pipeline pending |
| Scene editor to runtime | `pnpm test:scene-runtime-smoke` covers snapshots, patches, reconnect, media-node stability, propagation, and visual comparison | Proven for controlled rebuild scene; configured reference output pending |
| OBS connection/output with real OBS | A checksum-verified official OBS 32.2.1 portable fixture passes authenticated connection, Browser Source create/update, reconnect, and ready SSE-client evidence. The service now preserves OBS/Browser Source when `GetVirtualCamStatus` reports that the driver is unavailable | Partially proven; real Browser Source passes, virtual-camera driver/consumer and exact reference comparison remain under `REF-018` |
| Shop safe fixture plus manual live verification | Isolated Chrome/Edge fixtures cover exact-ID pinning, selector failure, scheduler, reload/restart, and cleanup | Safe fixture proven; authenticated manual verification not proven; `REF-011` |
| UI screenshot comparisons for all recorded reference states | Same-size comparisons exist for primary and several auxiliary states; inventory and parity remain partial | Not proven; `REF-001`, `REF-007`-`REF-010`, and `docs/UI_PARITY.md` |
| Eight-hour simulated livestream | Configurable 480-minute harness exists with functional, fault, cleanup, and resource-growth checks. Two long attempts are invalid: the first lost its final result, and the second exposed a harness-only queue-count payload bug at iteration 1001 after 84 minutes. The app correctly rejected the invalid IPC payload and cleanup completed. A 5-minute accelerated qualification crosses iteration 1016 successfully. A corrected full run started at 2026-07-29 23:06:45 -07:00 | Running; no pass evidence yet |
| Queue saturation at 100 items | Queue unit coverage verifies the 100-active cap and a 300-job sequential run without overlap/deadlock | Proven for rebuild queue |
| TikTok, AI, TTS, OBS, and Chrome disconnect/restart | Mock/provider failure, cancellation, reconnect, browser close, OBS reconnect, multi-service crash cycles, and long-session fault injection pass | Proven for controlled rebuild adapters; real services pending |
| App restart during queued work and autosave | `pnpm test:active-work-restart` terminates the exact isolated Electron tree while TTS is playing and autosave is pending, then verifies valid data, zero/idle queue, recovery notice, and cleanup | Proven for rebuild crash invariant; reference behavior pending |

## Phase 13 exit criteria

| Exit criterion | Audit result | Missing evidence |
| --- | --- | --- |
| `docs/TEST_MATRIX.md` has no unaccounted required feature | Not met | The matrix explicitly retains `Full reference feature set` as pending and live/reference rows remain partial |
| All automated tests pass | Currently met for executed gates | `pnpm typecheck`, `pnpm lint`, 139 tests, project persistence, active-work restart, and avatar-script Electron smokes pass; the required eight-hour command has not passed |
| Manual parity checklist signed off screen by screen | Not met | Reference inventory, authenticated states, real OBS/Shop, and several visual states remain incomplete |
| No known critical data-loss, queue-deadlock, audio-overlap, or process-leak issue | Proven only for controlled rebuild evidence | Live provider, real OBS, authenticated Shop, and full-duration resource behavior remain unverified |

## Final definition of done

| # | User outcome | Audit result |
| --- | --- | --- |
| 1 | Open or create a local livestream project | Proven through project UI, persistence, restart, import, and export evidence |
| 2 | Configure AI, TTS, avatar scene, and products | Proven for local configuration and replaceable adapters; live provider accounts remain unverified |
| 3 | Connect to TikTok Live and see realtime events | Mock pipeline and isolated real room-probe boundary proven; real-room event evidence remains missing under `REF-012` |
| 4 | Reject noise and process qualified interactions | Proven with 55 Vietnamese fixtures and live mock application |
| 5 | Generate an accurate short product-aware reply | Proven with deterministic and adapter tests; real provider/reference semantics remain pending under `REF-015` |
| 6 | Play replies sequentially without overlap | Proven for mock/controlled HTTP/Windows paths; live provider/reference behavior remains pending under `REF-016` |
| 7 | Animate avatar idle/talking | Proven in editor, queue, scene runtime, and node-stability evidence |
| 8 | Send scene to OBS and start virtual camera | Real OBS connection/Browser Source and ready SSE client proven; the portable fixture reports no installed virtual-camera driver, so camera-consumer evidence remains missing under `REF-018` |
| 9 | Load Shop products and pin/schedule | Safe fixtures proven; authenticated Shop missing under `REF-011` |
| 10 | Stop, restart, and recover without project-data loss | Proven for controlled rebuild crashes, locks, database recovery, queue reset, and autosave baseline |
| 11 | Use all reference-equivalent screens and controls without critical placeholders | Not met; inventory is incomplete and remaining placeholder controls are listed below |
| 12 | Verify parity through completed inventory, UI comparison, and test matrix | Not met; all three evidence sets remain explicitly partial |

## Remaining placeholder and parity audit

- Avatar-script `Tạo video` remains disabled and has no implemented output workflow.
- `Xuất video` remains an explicitly mocked preview/configuration check rather than a real export workflow.
- Login, registration, profile, Grok/Veo account surfaces remain local/reference-shaped workflows rather than service-backed equivalents.
- Authenticated reference project/template mutations, TikTok Live, TikTok Shop, configured AI/TTS, OBS, and recovery/log states remain unavailable or unverified.
- Template, project, editor, login, and settings comparisons retain non-zero visual differences; full screen/state coverage is incomplete.

## Next executable work

1. Start a fresh eight-hour soak on the integrated code, preserve renderer continuity, then verify output, resource bounds, runtime-lock removal, process/profile cleanup, and the full gate.
2. Inventory the exact expected avatar-video/export behavior before implementing it; keep controls explicitly unavailable until a complete safe vertical slice exists.
3. Resume reference comparison only through exact-window/read-only mechanisms and disposable non-secret fixtures.
4. Perform real OBS and authenticated Shop/TikTok verification when the required safe fixtures become available; do not mark Phase 13 or the application complete before then.

## Avatar-script AI integration acceptance

All rebuild integration items below now have direct evidence; configured reference behavior remains unverified:

- The Manual product source requires at least one non-empty product name or information field and shows a visible validation error otherwise.
- `Tạo kịch bản AI` calls the currently configured `desktopApi.ai.generate` boundary with project timeout/retry settings; provider secrets never enter the project document or renderer logs.
- Successful output replaces only the dialog draft scripts, remains cancellable before save, and persists only after the existing `Lưu` action plus autosave.
- Closing/cancelling the dialog or leaving the route cancels the exact active request and ignores stale late responses.
- Empty output, timeout, provider failure, hidden-content leakage, and unsupported commercial claims remain in the dialog with actionable Vietnamese errors; they never overwrite saved scripts.
- The product-link autofill control must not pretend to scrape a URL. It remains explicitly unavailable until a safe adapter and reference behavior are defined.
- Electron smoke covers mock generation, Cancel semantics, save/autosave, restart persistence, and clean console; Browser QA covers desktop and 390x844 containment.
