# V1 Tasks

Each phase has one clear theme and an independently verifiable completion condition. After each phase, run typecheck, lint, tests, and build.

## Phase 0 - Engineering foundation (this round)

- [x] Initialize Next.js App Router, strict TypeScript, ESLint, Vitest, Testing Library, fake-indexeddb, and Dexie.
- [x] Establish source layout, environment template, README, and architecture docs.

**Done when:** dependencies install, no fake product UI exists, and all four quality commands pass.

## Phase 1 - Moment local data layer

- [x] Implement Moment and MomentAppend types and the Dexie v2 schema.
- [x] Implement UUID-based creation, lookup, deterministic createdAt ordering, restricted metadata updates, soft delete, restore, and append operations.
- [x] Add database integration tests for persistence, immutability, deletion, restoration, and missing-parent behavior.

**Done when:** a Moment persists across refresh; no public API can update `originalText`; default queries hide soft-deleted records; MomentAppend is independent and ordered by its own creation time.

## Phase 2 - Quick text recording

Implement the single “write something” flow, text input, save, and error states without requiring tags, location, or network.

**Done when:** an offline text Moment saves in a few steps and immediately ends the flow.

## Phase 3 - Image attachments

- [x] Implement the v3 Attachment schema and Moment-only Attachment repository.
- [x] Extend quick recording with multi-image selection, previews, removal, MIME filtering, and local Blob persistence.
- [x] Save Moment plus all attachments in one transaction; extend soft delete and restore to attachments.
- [x] Add migration, repository, transaction, Blob, UI failure, and preview cleanup tests.

**Done when:** text-only and text-plus-image records save offline; all attachments survive refresh and partial failures leave no orphaned record or attachment. Image Gallery, image editing, EXIF, OCR, and non-Moment owners remain out of scope.

## Phase 4 - Recent-record homepage

- [x] Query at most 20 active Moments from IndexedDB in newest-first order.
- [x] Show exact original text, local date/time grouping, and Moment-owned image previews beneath quick recording.
- [x] Re-query after a successful save so the new Moment appears immediately without refresh.
- [x] Isolate loading, Moment query, attachment query, and object URL lifecycle behavior with component and repository tests.

**Done when:** new content appears immediately and the homepage contains no dashboard, AI, statistics, Append, location, or history-browsing module.

## Phase 5 - Moment append

- [x] Read active MomentAppends from IndexedDB and display their exact text with independent timestamps.
- [x] Add a lightweight per-Moment append editor with whitespace validation, retry, duplicate-submit protection, and unsaved-input confirmation.
- [x] Re-query only the affected Moment after saving so the new Append appears immediately while `originalText` remains unchanged.
- [x] Define deterministic `createdAt` then `id` ordering and test persistence, owner isolation, soft-delete filtering, and failure behavior.

**Done when:** repeated append operations preserve the original text, persist offline, and reappear in stable order without adding edit, delete, image, or future-phase UI.

## Phase 6 - City location metadata

- [x] Add permission-associated browser location lookup without blocking quick recording.
- [x] Store optional city, coordinates, and exact manual placeName atomically with Moment and attachments.
- [x] Add a minimal server reverse-geocoding boundary with graceful offline/failure fallback.
- [x] Show city and optional placeName quietly in recent records without exposing coordinates or technical errors.
- [x] Test successful lookup, denial/unsupported/timeout, reverse-geocoding failure, manual place names, offline saving, and location immutability.

**Done when:** denied permission, offline mode, and timeout never prevent saving. No map UI is included.

## Phase 6.5 - Real-browser E2E baseline

- [x] Add an isolated Chromium Playwright configuration and `npm run test:e2e` script.
- [x] Verify real browser IndexedDB persistence for multiline text, single-image Blob, multiple images, and MomentAppend.
- [x] Verify refresh recovery, mocked Geolocation success/denial, reverse-geocoding route isolation, and exact manual placeName.
- [x] Keep E2E data isolated to fresh Playwright contexts and avoid public reverse-geocoding calls in tests.

**Done when:** the existing core recording flow has a small, deterministic real-browser baseline without adding product features.

## Phase 7 - Diary local data layer

- [x] Add the Dexie v4 `diaries` table with the standard root indexes and a migration test that preserves existing Moments and attachments.
- [x] Implement Diary types and a repository for validated creation, lookup, deterministic listing, persistence across reopen, and default exclusion of soft-deleted records.
- [x] Keep Diary independent from the Moment quick-record path; no Diary UI, editing, attachments, tags, favorites, or Timeline is included.

**Done when:** zero, one, or many diaries can exist on the same day and survive refresh independently of Moments.

## Phase 8 - Diary editing experience

- [x] Correct the product-aligned Diary title rule: body is required, title is optional and never auto-generated.
- [x] Add Diary list, create, view, and edit routes without changing the quick-record path.
- [x] Add constrained content updates with ID/createdAt preservation, duplicate-save protection, retryable errors, and unsaved-change protection.
- [x] Add focused unit/component coverage and real-browser coverage for Diary persistence and editing.

**Done when:** a long diary can be created and edited without changing the quick-record path.

## Phase 9 - Unified Timeline

- [x] Merge active Moments and Diaries through a read-only Timeline query, without creating a unified database entity.
- [x] Sort the merged stream by real `createdAt` with a stable ID tie-breaker and group it by the user's local date.
- [x] Batch-load current-page Moment attachments and Appends, keep Appends nested under their Moment, and isolate child read failures.
- [x] Add a bounded initial page with explicit “load more” pagination and real-browser coverage.

**Done when:** ordering is stable and appends are not incorrectly shown as root records.

## Phase 10 - Calendar browsing

- [x] Add a quiet `/calendar` month view with previous, next, and current-month navigation.
- [x] Derive recorded local dates from active Moment and Diary roots through two UTC-range queries per month; Appends and Attachments do not affect month state.
- [x] Load one selected local day, reuse Timeline's batch Moment hydration, and provide All/Moment/Diary display filters.
- [x] Cover local timezone boundaries, leap and year transitions, soft deletion, child semantics, persistence, and responsive browser behavior.

**Done when:** local timezone date boundaries are correct and no streak, completion, or missed-day metrics exist.

## Phase 11 - Plain search

- [x] Add a quiet `/search` route and low-priority homepage entry without changing quick recording.
- [x] Search active Moment original text, active Append text, Diary title, and Diary body with trimmed case-insensitive substring matching.
- [x] Return one root per Moment, keep matching Appends nested, and preserve independent Moment/Diary entities and creation-time ordering.
- [x] Paginate 20 roots at a time and batch-hydrate only current-page Moment Appends and Attachments through the shared Timeline boundary.
- [x] Cover soft deletion, stable ordering, owner isolation, keyword reset, load-more behavior, persistence, edits, and real-browser flows.

**Done when:** offline keyword search finds content and excludes the recycle bin.

## V1 Core Experience Audit (non-feature phase)

- [x] Audit Home, quick recording, Diary, Timeline, Calendar, and Search against PRODUCT.md without adding product capabilities.
- [x] Restore the homepage hierarchy to quick recording, recent Moments, then a quiet secondary “More” navigation area.
- [x] Keep Moment text visually primary by moving location out of the narrow time column and using “随笔/日记” in history views.
- [x] Improve keyboard focus visibility, mobile touch targets, narrow-screen page padding, and secondary-navigation wrapping without introducing a UI framework.
- [x] Check representative desktop, 390px, and 430px layouts in real Chromium and retain all existing behavior tests.

**Done when:** the current V1 core feels quieter and easier to read on desktop and mobile, no data or product capability changes, and every quality command still passes.

## UI-1 - Homepage UI 2.0 (non-feature phase)

- [x] Follow DESIGN.md and the approved light/dark references using system fonts and homepage-scoped styles.
- [x] Keep quick recording, recent Moments, then More; retain the existing save, location, image, and Append behavior.
- [x] Add a presentation-only local date margin, quiet metadata, readable full mobile text, small images, and clear focus/touch targets.
- [x] Check desktop empty/populated/writing states and 390px mobile, with additional 320/430/768px checks in both themes; save browser screenshots.
- [x] Pass typecheck, lint, 152 Vitest tests, and 24 Playwright tests (latest save-button verification).
- [x] Pass the standard production build; reverified after the user's environment repair.
- [x] Earlier phase gate superseded by the 2026-09-03 user instruction to execute the audited UI improvement plan in sequence.

**Done when:** all five validation commands pass and the user has reviewed the homepage. No data-layer changes, new product features, or early redesign of Timeline, Calendar, Diary, or Search.

### Stateful save-button refinement (explicit follow-up)

- [x] Share animated save feedback across Quick Moment, MomentAppend, and Diary without changing original button labels or repository calls.
- [x] Use real pending/success/failure outcomes, duplicate protection, 1.5-second success feedback, unmount cleanup, and reduced-motion support.
- [x] Scope Tailwind to the new button without a global reset; check desktop/mobile and both color schemes.
- [x] Retain persistence/retry regression coverage and add button lifecycle, Diary feedback, and real-browser checks. No new product phase or data capability.

## 2026-09-03 UI quality refresh and deployment

The user approved the product audit with “开始操作”. This work implements the current UI/deployment brief in sequence, without adding the later V1 product features below.

- [x] UI-1: shared design tokens, Home composition, measured spring expansion, growing input, image states, focus return, and shorter real save feedback.
- [x] UI-2: Timeline date anchors, reusable reading presentation, natural photos, full Append dates, and read retry.
- [x] UI-3: Diary list/read/write presentation, loading state, long-form input, return-link draft guard, and edit focus restoration.
- [x] UI-4: Calendar's quiet month/day layout, 44px dates at 320px, keyboard/date feedback; Search input, exact-text highlights and matching excerpts, stale-error isolation.
- [x] UI-5: global CSS cleanup, shared entry/press/photo motion, reduced motion, both themes, every requested width, and 200% type reflow.
- [x] Save before/after screenshots for every UI phase and a comparison gallery under `design/ui-refresh/`.
- [x] Final typecheck, lint, 154 unit/integration tests, 28 Chromium E2E tests, and production build.
- [x] Deployment configuration, environment review, README, and production test support.
- [x] Production deployment: switched to Netlify at the user's request, deployed successfully to `https://life-kelelega.netlify.app`.
- [ ] Live-site verification: Netlify's default account login protection blocks independent browser tests. Awaiting the user's preferred production access setting. See `docs/DEPLOYMENT.md`.

No schema, repository API, entity structure, or Timeline/Calendar/Search query file was modified. Actual Safari/iOS/VoiceOver acceptance remains outside the available Chromium evidence.

## 2026-09-03 Unified motion system (explicit follow-up)

- [x] Read the existing presentation and product constraints; capture the current Home/writing states before implementation.
- [x] Share typed motion constants and SSR CSS variables; keep the root layout server-rendered and routes unkeyed.
- [x] Add layered Home entry, restrained invitation/navigation/photo feedback, measured reversible editor reveals, and full reduced-motion behavior.
- [x] Preserve stable row/image identity and pending append drafts through asynchronous refresh; guard stale queries and release object URLs.
- [x] Refine the existing save button with fixed intrinsic size, accessible states, 1100ms success feedback, operation-generation guards and cleanup.
- [x] Verify rapid toggles, actual pending/failure/retry, old-row opacity during insertion, native navigation, five viewports and both themes/motion preferences.
- [x] Pass typecheck, lint, 159 unit/integration tests, 38 Chromium E2E tests and production build; 12 production-focused tests also pass after distinguishing documented preload advisories.
- [x] Preserve before/after screenshots, 72 matrix screenshots, production interaction videos and a comparison gallery in `design/motion-system/`.
- [x] Publish the motion update to the existing Netlify project: deploy `6a9935dc08d1754a8e879de8` is ready at `https://life-kelelega.netlify.app` (2026-09-03 08:55:32 UTC). Existing account login protection remains active; unauthenticated HEAD returns 401, so live application verification is still pending.

Existing repository row-limit enforcement, cross-route Search state restoration and native iOS/Safari/VoiceOver acceptance are documented in the motion review; no data-layer or framework-cache change is included.

## Phase 12 - LifeEvent Foundation

- [x] 12.1: Implement independent manual LifeEvent types, source fingerprints, date/time/duration validation and original-record isolation.
- [x] 12.2: Add only the v5 `lifeEvents` table; test v4 migration with all original tables and exact Blob bytes.
- [x] 12.3: Add atomic single/batch creation, idempotent UUID retries, source validation, default soft-delete filtering and bounded keyset reads.
- [x] 12.4: Add direct-only `/lab/life-events` manual form and actual IndexedDB readback; no navigation, homepage or recall integration.
- [x] Complete repository, migration, component, real Chromium verification and all five quality commands: typecheck, lint, 201 unit/integration tests (25 files), 40 Playwright tests and production build pass on 2026-09-03. This phase adds 42 Vitest cases and 2 Chromium E2E cases.

**Done when:** real manual events survive refresh, many events can share one source/name, failed writes do not create partial data, retries cannot overwrite originals/events, and all required checks pass. Life Visualization and AI remain outside this phase.

### Phase 12.5 - Life Statistics Contract

- [x] Define conservative statistics eligibility: include active independent/current-source manual events; exclude stale, inactive-source and deleted events without mutating them.
- [x] Add repository-owned `[startDate, endDate)` eligible range reads and UI-independent summary/time-series queries.
- [x] Aggregate by natural `occurredOn`, nullable integer-second duration and the unchanged four-category vocabulary; define sparse day/Monday-week/month buckets.
- [x] Document the real-data `/lab` policy and `LifeEvent -> Life Statistics -> future visualization` dependency direction.
- [x] Complete full regression verification: typecheck, lint, 26 files / 211 unit-integration tests, 40 Chromium E2E tests and production build passed on 2026-09-03.

### Phase 12.6 - Life Statistics Performance Baseline

- [x] Benchmark 1,000, 10,000 and 50,000 active standalone events through the real statistics implementation in fake-indexeddb.
- [x] Measure 30-day, one-year, five-year monthly and five-year category aggregation after a warm read, using the median of three measured runs.
- [x] Retain Dexie v5 and existing indexes: the benchmark does not justify a speculative schema/index expansion.

**Done when:** the statistics contract is deterministic, stale/deleted data cannot affect totals, benchmarks and limitations are recorded, and all five quality commands pass. No visualization surface is part of this phase.

## Life Visualization - post statistics contract

- [x] Add the `/life` read-only route without changing the homepage or existing record/recall flows.
- [x] Extend `life-insights` with UI-neutral exact-name/source aggregates and a bounded source-valid event projection; keep existing Summary/Time Series contracts stable.
- [x] Render a responsive Canvas Life Map with organic regions, contour sediment, temporal flow and data-derived topic affinity instead of Dashboard cards or conventional charts.
- [x] Add Activities, Places and Themes lenses using only dimensions that the current LifeEvent model can support truthfully; keep technical provenance out of the visible Lens control.
- [x] Add transient adjacent region details with hover/focus/touch activation and dim unrelated terrain; omit the dense bottom LifeEvent list.
- [x] Cover empty/loading/error, keyboard focus, reduced motion, light/dark tokens and 320px no-overflow behavior.
- [x] Complete the full repository quality gate: typecheck, zero-warning lint, 29 files / 223 unit-integration tests, 43 Chromium E2E tests and production build passed on 2026-09-04; comparison evidence is stored under `design/life-visualization/`.

**Done when:** the first screen reads as a personal life map, every visible value comes through Life Statistics, stale/deleted data cannot enter, Canvas remains presentation-only, and all required quality commands pass.

### Homepage progressive product navigation

- [x] Replace the permanent “More” text links with one quiet, collapsed Life Path after recent records.
- [x] Reveal Timeline, Calendar, Search, Diary and Life Map as a continuous responsive route rather than a card grid.
- [x] Keep Lab routes out of product navigation and preserve indirect Diary new/detail access through Diary.
- [x] Add Escape focus restoration, reduced-motion final states, 44 px targets and 320/390/430/768/1440 overflow coverage.
- [x] Preserve before/after desktop and mobile screenshots under `design/home-navigation/`.
- [x] Pass typecheck, zero-warning lint, 34 files / 258 unit-integration tests, 45/45 Chromium E2E tests, and the production build on 2026-09-05.

### Life Map Evolution follow-up

- [x] Replace the range select with a quiet 30/90/365 sediment-depth control and continuously interpolate only range changes.
- [x] Let absolute event accumulation affect map formation: frequency controls grain density and duration controls territory weight/contours.
- [x] Render place affinity as trajectory traces without adding a map field, table or persisted relationship.
- [x] Rewrite adjacent exploration details around theme, time span, recent change and related direction; keep counts/duration secondary.
- [x] Preserve direct Lens switching, transient hover/focus/touch exploration, 320px behavior and reduced-motion final states.
- [x] Capture 30-day, one-year, place-lens and 390px comparison evidence under `design/life-visualization/`.
- [x] Pass the repository gate: typecheck, zero-warning lint, 29 files / 224 unit-integration tests, 43 Chromium E2E tests and production build on 2026-09-04.
- [x] Remove single-line name clipping, raise active labels above overlapping terrain, and clamp the narrow-screen inspector inside the viewport; verify every Lens at 320px with geometric overflow/overlap assertions.

## Phase 14 - Life Intelligence V1

### Phase 14.1 - Contract layer

- [x] Define non-persistent `LifeExtractionJob` and `LifeEventProposal` contracts without changing Dexie v5.
- [x] Add the terminal proposal lifecycle and idempotent retry rules.
- [x] Add accept/reject/correct materialization contracts with explicit manual-event conflict protection.
- [x] Add a deterministic local fake extractor that preserves day precision and calls no AI service.
- [x] Add a repository port with no Dexie adapter, route, save hook or automatic task.
- [x] Cover proposal lifecycle, accepted AI materialization, rejection, corrected manual materialization, manual priority and duplicate proposal idempotency.
- [x] Pass typecheck, zero-warning lint, 32 files / 238 unit-integration tests, 43 Chromium E2E tests and the production build on 2026-09-04.

**Done when:** the extraction/review contract is executable and tested while the physical LifeEvent schema, all original repositories, application navigation and IndexedDB remain unchanged.

### Phase 14.2 - Life Intelligence Lab Review

- [x] Add the direct `/lab/life-extraction` route without a homepage or navigation entry.
- [x] Run the deterministic fake extractor only after an explicit user action and register its output as in-memory proposals.
- [x] Show the immutable source snapshot, candidate fields, review status and final materialized contract object.
- [x] Support Accept, editable Correct and Reject through the Phase 14.1 review service.
- [x] Add a session-only repository adapter with duplicate-review idempotency and corrected-manual conflict protection.
- [x] State that refresh clears all lab state; verify reset and absence of IndexedDB writes in Chromium.
- [x] Pass typecheck, zero-warning lint, 34 files / 245 unit-integration tests, 44 Chromium E2E tests and the production build on 2026-09-04.

**Done when:** the complete manual review loop works in the lab, every result remains session-only, and all existing product repositories and statistics behavior remain unchanged.

### Phase 14.3 - Life Intelligence Persistence

- [x] 14.3A: Advance Dexie v5 to v6 with `lifeExtractionJobs`, `lifeEventProposals`, and sparse unique LifeEvent proposal provenance; preserve v1–v5 data without a transform or backfill.
- [x] 14.3B: Add the IndexedDB Life Intelligence repository, atomic Job/Proposal insertion, unique request/candidate identity, scratch/record inputs, 64 KiB scratch limit, and refresh queries.
- [x] 14.3C: Materialize Accept/Correct in one source-validating Dexie transaction, keep Reject Proposal-only, enforce manual priority and one Event per Proposal, and persist explicit supersession as a terminal state.
- [x] 14.3D: Replace the Lab memory adapter with IndexedDB restoration and state clearly that Accept/Correct creates real LifeEvents that affect Life Map.
- [x] 14.3E: Include active final AI/corrected-manual Events through the unchanged Life Statistics and Life Map query contract; retain stale/missing/deleted exclusions.
- [x] Benchmark v5-to-v6 opening with 50,000 existing LifeEvents; retain the approved indexes because the result does not establish a need for more.
- [x] Pass typecheck, zero-warning lint, 34 files / 258 unit-integration tests, 44/44 Chromium E2E tests, and the production build on 2026-09-05.

**Done when:** Job, Proposal, review state, and materialized Event survive refresh; all review terminal states remain terminal; transaction failures leave no partial Event/Proposal state; original records and ordinary manual Events remain untouched; no provider, automatic extraction, worker, or homepage AI behavior is added.

## Manual tags (deferred, previously scheduled as Phase 12)

Implement Tag and ContentTag, normalization, optional assignment, filtering, and search inclusion.

**Done when:** both content types support optional tags and duplicate normalization is tested.

## Phase 13 - Favorites

Implement favorite toggling and a chronological favorites view for Moments and Diaries.

**Done when:** favorite state persists offline and unfavoriting removes the item immediately.

## Recycle bin and restore (deferred from the previous Phase 14 roadmap)

Implement transactional soft delete and restore, with the 30-day eligibility rule and no unconfirmed automatic permanent deletion.

**Done when:** normal views exclude deleted data, restore retains valid relations and attachments, and boundary cases have integration tests.

## Phase 15 - Offline application shell

Add auditable Service Worker/static-resource caching, update handling, and installability as needed.

**Done when:** after one online load, reopening while offline still permits entering, creating, and browsing records.

## Phase 16 - AI job and server boundary

Add local retryable AI job state and a server-only Route Handler boundary, without showing AI results yet.

**Done when:** local save succeeds before any AI request; offline jobs wait; AI failures never affect originals; secrets stay out of the client bundle.

## Phase 17 - AI structure and display

Implement versioned AiMetadata for extracted people, places, activities, topics, categories, and AI tags, with collapsed detail display and search integration.

**Done when:** derived data is separate and rebuildable, stale source versions invalidate results, and failures are retryable.

## Phase 18 - Temporary AI arrangement

Allow selecting records for a one-off arrangement result that is held only in the current UI session.

**Done when:** leaving or refreshing discards the result and creates/modifies no original entity.

## Phase 19 - DailySummary

Generate summaries by local date/timezone and expose them only when the user opens them.

**Done when:** summaries reference source versions, regenerate after source changes, and contain no reminders, scores, or advice.

## Phase 20 - V1 end-to-end release acceptance

Add end-to-end coverage for recording, recall, recycle bin, and non-blocking AI; verify browser behavior, quotas, privacy, and production build.

**Done when:** every V1 scope item has tests or recorded manual evidence, and account, sync, map, health, and export UI remain explicitly excluded.

## 2026-09-05 — 全站 iOS 风格 UI 升级

- [x] 统一系统字体、明暗主题 tokens、间距、圆角、阅读面、按钮、输入、焦点及空状态。
- [x] 覆盖首页、日记列表 / 新建 / 阅读 / 编辑、时间线、日历、搜索与生活地图；保留既有页面和产品行为。
- [x] 统一页面进入和按压反馈，复用 Calendar / Life Map 分段控件，支持 reduced motion。
- [x] 精化地图控制与移动端详情；实现键盘切换、可移入浮层、高亮插值、主题重绘和范围失败重试。
- [x] 保持数据模型、repository 语义、统计 contract 和 AI / proposal 边界不变。
- [x] typecheck、零 warning lint、34 文件 / 259 个单元与集成测试、47 个 Chromium E2E、生产构建通过。
- [x] 保存生产版 54 张截图，覆盖 1440 / 390 / 430px 和明暗主题；色彩对比度 18 / 18 通过。
- [x] 同步 DESIGN.md 第 27 节、架构说明和 ADR-033；交付说明见 `design/ios-refresh/README.md`。

原生 iOS Safari、软键盘与 VoiceOver 尚需真机验收，不作为已执行的浏览器模拟结果报告。
