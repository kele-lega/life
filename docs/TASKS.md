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

Merge active Moments and Diaries, sort by real `createdAt`, group by date, and paginate.

**Done when:** ordering is stable and appends are not incorrectly shown as root records.

## Phase 10 - Calendar browsing

Implement a collapsible month view, record/no-record dates, date details, and All/Moment/Diary filters.

**Done when:** local timezone date boundaries are correct and no streak, completion, or missed-day metrics exist.

## Phase 11 - Plain search

Search Moment original text, append text, Diary title, and body locally.

**Done when:** offline keyword search finds content and excludes the recycle bin.

## Phase 12 - Manual tags

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
