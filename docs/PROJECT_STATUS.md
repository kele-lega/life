# Project Status

## Current phase

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
