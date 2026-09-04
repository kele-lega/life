# Project Status

## Current phase

Life Visualization is complete and verified on 2026-09-04. The read-only `/life` route presents eligible `LifeEvent` history as an organic map with Activities, Places and Themes lenses, accumulated time texture and region exploration. Details appear beside the active region on hover, keyboard focus or touch; unrelated regions recede. The page has no bottom event rail and does not add a homepage entry or modify Moment, Diary, Timeline, Calendar or Search behavior.

All visible values cross the `life-insights` boundary. `getLifeEventExploration` keeps complete-range summary, time-series, exact-name and source-kind aggregates separate from a newest-first event projection bounded to 160 records by default (500 maximum). Canvas receives only a presentation model. Stale events, missing/deleted sources and soft-deleted events retain the Phase 12.5 exclusion rules and cannot enter the map.

People are not shown because the stored contract has no person dimension; technical record provenance is also kept out of the user-facing lenses. Cross-region paths indicate chronological proximity only and do not manufacture relationships. No schema, index, database table, conventional chart, AI inference or existing record repository was added.

Final verification: `npm run typecheck` passed; `npm run lint` passed with zero warnings; `npm test` passed 29 files / 223 tests; `npm run test:e2e` passed 43/43 Chromium tests; `npm run build` passed and prerendered `/life`. Reference, 1280 × 800 desktop and 390px mobile evidence is in `design/life-visualization/`; the comparison history and evidence limits are in `design-qa.md`.

The 2026-09-04 interaction follow-up keeps the packed terrain and 30-day default while making exploration quieter: no detail is selected by default, active-region detail floats next to its territory, unrelated regions dim, Places uses the same preview treatment as Themes, and Sources plus the bottom LifeEvent list are removed. Data contracts and existing product surfaces remain unchanged.

A temporary development-only Visualization provider now supplies 450 deterministic in-memory projections so `/life` opens with enough density to review the complete visual system. It models the requested work/learning/fitness/creation/travel distribution, recent changes, realistic times and places, and is visibly marked `Demo Data`. Production still delegates to the real Life Statistics query; no mock projection is written to IndexedDB or exposed when `NODE_ENV` is not `development`.

## Phase 12.5-12.6 statistics contract record

Phase 12.5 Life Statistics Contract and Phase 12.6 performance baseline are complete and verified on 2026-09-03. There is no statistics UI or navigation entry. Existing Moment, Diary, Timeline, Calendar and Search repositories/queries remain unchanged.

The contract includes active independent/current-source manual events and excludes stale, inactive-source and deleted events without deleting them. Ranges use `[startDate, endDate)` over `occurredOn`; null durations count but add no seconds. Summary and sparse day/week/month series are presentation-neutral and retain the four existing categories. See ADR-027.

Development performance baseline (median of three warm runs using the actual statistics code with fake-indexeddb):

| Events | 30-day summary | 1-year summary | 5-year monthly | 5-year category summary |
|---:|---:|---:|---:|---:|
| 1,000 | 0.84ms | 5.29ms | 14.39ms | 10.86ms |
| 10,000 | 2.11ms | 38.05ms | 156.48ms | 109.22ms |
| 50,000 | 11.53ms | 120.10ms | 689.65ms | 608.93ms |

These numbers are a repeatable development comparison, not a real-device SLA. Existing `[occurredOn+id]` range indexing is sufficient; no Dexie v6 or extra index was added. Full ranges are materialized and aggregate on the caller thread, so real Chrome/Safari profiling should precede final visualization and any worker/incremental optimization.

Lab-created records are real LifeEvents, not tagged lab data. Before formal visualization, explicitly review/remove intentional test records; business logic must never infer origin from the `/lab` route.

Final verification: `npm run typecheck` passed; `npm run lint` passed with zero warnings; `npm test` passed 26 files / 211 tests; `npm run test:e2e` passed 40/40 Chromium tests; `npm run build` passed and retained the existing routes. The performance harness separately passed 3/3 scale cases through `npm run benchmark:life-statistics`. No E2E assertions were weakened or skipped. On Windows, Playwright's managed dev-server teardown twice stalled after all 40 cases completed; rerunning the unchanged test command against a separately started local Next server produced a clean zero exit and the server was then stopped. This is test-environment lifecycle behavior, not an application or statistics failure.

## Phase 12.1-12.4 foundation record

Phase 12 — LifeEvent Foundation is complete and verified on 2026-09-03. V1 Core (Moment, Append, Diary, Timeline, Calendar, Search) and the subsequent UI/motion work remain unchanged. This phase adds only independent manual event storage and the direct `/lab/life-events` experiment page. No visualization, AI, tags, favorites, device integration, homepage entry or recall-view integration is included.

### Phase 12 validation

- `npm run typecheck`: passed.
- `npm run lint`: passed, zero lint warnings.
- `npm test`: passed, 25 files / 201 tests.
- `npm run test:e2e`: passed, 40 Chromium tests.
- `npm run build`: passed with the unchanged standard command; `/lab/life-events` generated successfully.

Added 42 Vitest cases and 2 real-browser tests covering same-source/multiple-source events, exact names/dates/durations, timezone and DST intervals, invalid inputs, metadata constraints, fingerprints, stale Diary sources, event/source deletion, independent originals, idempotent concurrent retries, atomic rollback, pagination, component failures and remount recovery. Migration tests preserve v4 Moment, Append, Diary, indexes and exact Attachment Blob bytes; Chromium independently verifies the v4-to-v5 upgrade. The lab saves while offline after initial page load, then restores on refresh after reconnecting; offline cold application startup is not claimed. No test reads the user's regular browser profile.

The E2E runner emitted the pre-existing NO_COLOR/FORCE_COLOR environment and reduced-motion notices; no checks were disabled. No dependencies, lockfiles, existing repository/query modules or core UI files changed. No deployment was performed in this phase.

### Phase 12 boundaries and follow-up

Dexie v5 adds one store; original four tables/indexes and original repository code are unchanged. Day-only data never fabricates an instant. Source fingerprints and read-time `sourceStatus` keep structured events separate from originals; soft-deleted/missing sources are hidden without rewriting the source or event. The lab persists real local data, so future analytics must explicitly decide how to include experimental records and stale source interpretations. No permanent-delete, edit/correction or AI/device import API is added. Global reads paginate; owner-specific lists and many hidden rows still warrant measurement at larger scales. Details: ADR-026 and DATA_MODEL.md.

Historical UI verification below predates the UI quality refresh and motion follow-ups now completed in TASKS.md / ADR-022 through ADR-025. Their earlier timings and UI-2 pause are historical, not the current phase gate. Deployment login protection and native-device acceptance remain separate follow-ups.

## Historical UI-1 checkpoint

UI-1 homepage implementation is ready for visual review. The production-build environment has been repaired by the user, and the standard build was reverified successfully on 2026-09-03. The explicitly requested StatefulButton refinement is implemented for Quick Moment, MomentAppend, and Diary saves. UI-2 has not started. The preceding V1 Core Experience Audit remains complete.

## Completed

- Foundation
- Moment local data layer
- Quick text recording
- Image attachments
- Recent-record homepage
- MomentAppend
- City location metadata
- Real-browser Playwright E2E baseline
- Diary local data layer
- Diary creation, list, view, and editing experience
- Unified Timeline with local date grouping and load-more pagination
- Calendar month browsing and local-day details
- Local plain-text Search across Moment, Append, and Diary content
- Core experience audit and responsive polish across Home, Diary, Timeline, Calendar, and Search

## Scope boundary

UI-1 changes homepage presentation: a local-date margin, system-font typography, scoped light/dark colors, quieter recording controls, full-width mobile reading, small Moment images, nested Appends, and secondary navigation below recent Moments. The save-button follow-up additionally changes the Diary save control's presentation. Repository calls, schemas, models, queries, raw content, and persistence semantics are unchanged. Timeline, Calendar, Diary, and Search were not redesigned. Tags, favorites, recycle bin UI, AI, Diary images, and Diary location UI remain later phases.

## Verification

- `npm run typecheck` passed
- `npm run lint` passed
- `npm test` passed: 21 files, 152 tests
- `npm run test:e2e` passed: 24 tests, including light/dark homepage, theme, and StatefulButton flows
- `npm run build` passed with the unchanged standard Next.js build command

StatefulButton uses Framer Motion and component-only, prefixed Tailwind utilities without Preflight. The visible labels remain "保存", "保存追加", and "保存日记". Local persistence starts immediately; loading lasts as long as the real save. A successful check remains for 1.5 seconds before editor dismissal/navigation, while Moment/Append lists refresh immediately. Errors keep the existing input protection and retry path; no fixed loading delay or simulated success is used. An already-saved Diary does not trigger a false unsaved-change warning during feedback. Timers are cleared on unmount. See ADR-021.

The new tests cover duplicate clicks, real pending promises, rejection/validation, callback timing, unmount cleanup, Diary create/edit/retry, preserved labels, keyboard activation, 44px controls, reduced motion, SSR hydration, and refresh persistence. Existing test assertions remain; only successful-editor-dismissal waits now account for the requested 1.5-second feedback. Repository/model/query/schema file hashes were checked unchanged.

Save-button screenshots: `design/ui-v2/verification/stateful-button/` contains idle and fully drawn success states at 1440px/light and 390px/dark, captured in isolated Playwright contexts.

Browser evidence: `design/ui-v2/verification/ui-1/`; visual review: `design-qa.md`. Real Chromium checks cover 1440px desktop and 390/430/320/768px widths, both color schemes, long text, input focus, 44px controls, text resizing, saving, Append, and refresh recovery. The images in screenshots are the existing 4x4 SVG test fixture, not realistic photography. No screenshot-diff framework was added.

## Known follow-up

The existing app has no favicon asset and Chrome may request `/favicon.ico` (404). The save-button browser test excludes only that exact known missing asset from console-error checks; hydration/runtime and all other resource errors still fail. Adding a favicon is outside this button refinement.

### Homepage refinement, 2026-09-02

The follow-up refinement preserves all existing flows. It changes only homepage typography, date markup, invitation underline, static empty copy ("还没有留下片段。"), and the lower-priority navigation layout. Date numerals use local Georgia/serif fallbacks; Moment and Append reading text use the existing system sans-serif stack for clear Windows/mobile rendering. The warm-red save fill is `#A94E40` (5.45:1 against white), a contrast-safe interpretation of the suggested warm red. The navigation is left-aligned without a footer rule and has at least 64x48px links.

Historical validation before the user's environment repair: typecheck and lint passed; 19 files/143 Vitest tests and 20 Playwright tests passed. Chromium evidence at 390/430/768/1440px in both themes is under `design/ui-v2/verification/refinement/`. The first E2E server start hit a generated-file error; a clean retry passed all tests, but the standard build then still failed. Those failures are superseded by the successful standard build and verification above; no build workaround or data-layer change was introduced.

Historical build troubleshooting did not establish the cause of Windows `UNKNOWN` file errors. No dependency patch, disabled validation, or security-setting change was applied by the agent. The old generated `.next` directory was preserved in `C:/Users/Administrator/AppData/Local/Temp/life-ui1-build-backup-1e703b56ba994bd19e5f832af45ab1df/.next` before regeneration; no user IndexedDB data was touched. The user subsequently reported the environment fixed; subsequent standard builds succeeded. The new PostCSS configuration is solely for the explicitly requested button styling, not a build-error workaround.

Pause at UI-1 for review. Do not proceed to UI-2 without the user's approval.

Plain Search currently performs an application-layer scan because IndexedDB cannot index arbitrary substrings. It is appropriate for a personal V1, but very large histories need profiling and may later require a rebuildable local full-text index. Each load-more request repeats the scan before slicing the next stable page. Very long Moment text and long Append chains remain fully visible on the homepage; collapsing them would add hidden-content interaction and needs evidence from real use rather than being introduced during a visual audit. The current four-link secondary navigation fits narrow screens, but later features should reassess that boundary instead of indefinitely appending inline links. Diary image attachments and all later features remain intentionally deferred.
