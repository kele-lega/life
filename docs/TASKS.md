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

## Phase 12 - Manual tags (future product work)

Implement Tag and ContentTag, normalization, optional assignment, filtering, and search inclusion.

**Done when:** both content types support optional tags and duplicate normalization is tested.

## Phase 13 - Favorites

Implement favorite toggling and a chronological favorites view for Moments and Diaries.

**Done when:** favorite state persists offline and unfavoriting removes the item immediately.

## Phase 14 - Recycle bin and restore

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
