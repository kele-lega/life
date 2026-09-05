# Architecture

## Scope

This project is a single-user, web-first, local-first private life record system. The core path is open, record, save, leave. The initial foundation phase intentionally contained no product UI, fake dashboard, Timeline, Calendar, AI, auth, sync, map, or health feature; later phases add only the explicitly scheduled product surfaces.

## Overview

```text
Browser
  Next.js App Router / React UI
            |
  feature use cases and queries
            |
  Dexie database adapter
            |
        IndexedDB

Future AI only:
Browser -> Next.js server route -> cloud model provider
```

Original content is created and read locally without a network dependency. Diary persistence is introduced in its own Dexie migration and repository; Diary UI reads and writes only through the client-side repository, while content editing preserves the record identity and creation timestamp. Future AI calls will go through a server-side Route Handler so secrets never enter the client bundle. AI failure must never block or roll back local saving.

## Technology choices

- Next.js App Router + React: one Web application and one future deployment boundary.
- TypeScript strict: explicit contracts at data and migration boundaries.
- IndexedDB + Dexie: offline persistence, transactions, Blob support, and schema versions.
- ESLint: Next.js Core Web Vitals and TypeScript rules.
- Vitest + Testing Library + fake-indexeddb: unit, component, and IndexedDB integration coverage.
- Playwright + Chromium: a separate real-browser baseline for critical persistence and permission flows.

No Redux, GraphQL, microservices, Redis, queues, or separate backend are introduced. React local state handles temporary UI state; Dexie owns persisted state. A state library can be reconsidered only when a concrete cross-page state problem exists.

The homepage exposes product navigation through a client-only `LifePortal` disclosure after recent records. Its open state is ephemeral React state and never enters IndexedDB. The disclosure renders ordinary Next.js links to Timeline, Calendar, Search, Diary, and Life Visualization, so routing remains prefetchable and browser-native. Lab routes remain direct development URLs and are intentionally absent from this product navigation.

## Source layout

```text
src/
  app/                    routes, layout, global styles
  features/<feature>/     feature-specific UI, model, repository, tests
  components/             genuinely cross-feature components
  lib/db/                 Dexie client, schema, migrations
  test/                   test setup and helpers
  types/                  small cross-feature types
```

Features are organized vertically. Components should not scatter raw Dexie queries; repositories express the small use cases for each feature. Multi-table writes use a Dexie transaction.

## Runtime boundaries

Dexie and IndexedDB are browser-only and must be initialized from client-safe code. Server components must not import the database instance. The V1 core has no server data dependency. A future AI route validates input and calls the model provider, but is not the source of truth for local records.

Local-first data operations do not require a network. Application-shell offline startup, installability, and Service Worker caching are separate work and are not implied by IndexedDB availability.

## Data flow

1. UI creates an application UUID and UTC ISO timestamp.
2. A repository validates business invariants.
3. Original content and attachments are written transactionally to IndexedDB.
4. Successful local persistence ends the recording flow immediately.
5. Future AI work is queued only after local persistence and may remain pending offline.

Timeline, Calendar, Search, and Favorites are query views over normalized local entities, not copied records. The Timeline query combines independent paginated Moment and Diary repository reads, then batch-loads only the current page's Moment children. Calendar converts a device-local month or day into a UTC half-open range: month status performs one indexed range read per root repository, while selected-day details reuse Timeline's read-only batch hydration for Moment Appends and Attachments. Plain Search scans the currently implemented active text sources (Moment original text, MomentAppend text, Diary title, and Diary body), derives one matching root per entity, slices a stable 20-root offset page, and reuses the same Timeline batch hydration only for that page. These views create no Dexie table or persistent cache; the homepage's bounded per-owner queries remain unchanged. Future Tag and AI metadata phases extend the Search query sources after those entities exist. AI metadata and daily summaries are rebuildable derived data linked to source IDs and source revisions.

Deletion writes `deletedAt` as a UTC timestamp. Normal queries exclude soft-deleted entities; the recycle bin queries them explicitly. Permanent cleanup is a later, user-visible action governed by the 30-day retention rule.

## LifeEvent Foundation boundary

Phase 12 adds a separate `features/life-event` vertical slice and Dexie v5 table. A thin `/lab/life-events` Server Component renders a client-only form/readback boundary; no Server Component imports the database. The form uses only LifeEvent repository APIs, not raw Dexie, network requests or global state. It has no navigation/home entry and does not feed Timeline, Calendar or Search.

The repository alone reads source tables in batches and writes only `lifeEvents`. Source checks, idempotent UUID comparison and batch inserts share an IndexedDB transaction. Local WebCrypto SHA-256 work uses `Dexie.waitFor` to retain the transaction snapshot; no content leaves the device. Failed writes roll back the whole batch. Read-time source validity respects original deletion without changing existing deletion/restore transactions. A changed Diary yields a `stale` view status, never an automatic rewrite. Original Moment/Diary/Append repositories remain unchanged.

The lab retains the current submission UUID and inputs across failures, locks concurrent saves, and reads the saved event plus first page from IndexedDB after commit. A post-commit read failure is distinguished from a write failure and retry reuses the same ID; no synthetic success or optimistic final data is used. Persisted data survives remount/reload, but unsaved lab inputs are not a draft-storage feature. There are no Events in existing recall views and no new AI/provider, dependency, device or analysis integration.

### Life Statistics query boundary

The future visualization dependency direction is strictly:

```text
LifeEvent table
  -> LifeEvent repository eligibility/range read
    -> Life Statistics domain query
      -> Life Visualization presentation
```

`life-insights` imports only the LifeEvent repository/model API and never Dexie. The repository uses the existing `[occurredOn+id]` compound index for a half-open natural-date range, checks source validity in bounded 512-event batches, and removes stale events from the statistics-eligible result. Summary and sparse time-series aggregation then operate in memory over that range. They return counts, integer-second duration totals, category aggregates, and calendar bucket boundaries only; there are no chart coordinates, colors, SVG, UI strings, framework state, caches, or new persisted entities.

The Life Visualization phase adds `getLifeEventExploration` to the same read-only boundary. One source-valid range read produces the existing summary/time series plus exact `category + name` aggregates, exact source-kind aggregates, and a bounded newest-event projection for temporal affinity/future drill-down. The projection removes source fingerprints and exposes only source type/ID. Its limit is 160 by default and 500 maximum; aggregate totals still cover the complete requested range.

### Life Visualization boundary

The `/life` component reads through a Visualization-owned adapter. In production the adapter delegates directly to `getLifeEventExploration`. In development only, it may return the deterministic in-memory projection from `life-visualization-mock.ts`; this branch never opens Dexie, calls a repository, or writes a LifeEvent. `NODE_ENV !== "development"` disables the branch before the production UI chooses its data source. The adapter exposes its mode so the UI can show the `Demo Data` marker.

`features/life-visualization` imports `life-insights` only. It never imports Dexie, the database client, or Moment/Diary/Timeline/Calendar/Search repositories. `/life` is a thin Server Component wrapping a client-owned IndexedDB visualization surface. Existing record routes and homepage navigation remain unchanged.

The Canvas layer owns only deterministic organic geometry, contour texture, temporal flow lines and category tones. Accessible HTML buttons sit over Canvas regions; Lens state, active region, date-range state and responsive layout remain presentation concerns. The map uses three truthful views over current fields: exact non-place activity names, exact place names and fixed categories. It does not infer people or semantic relationships from original text, and technical source kinds are not exposed as an observation mode.

The 30/90/365-day range is presented as sediment depth. A range response increments a presentation-only evolution revision; Canvas interpolates the previous and next region frames for 760ms while HTML hit targets follow the same cubic-bezier transition. Lens changes draw directly. `prefers-reduced-motion` bypasses interpolation. Event frequency maps to point density, accumulated duration maps to radius/contour weight, and place-lens temporal affinity maps to broad trajectory traces. No frame state, geometry or styling is persisted.

There is no bottom LifeEvent rail. The bounded source-valid event projection from `life-insights` is used only to derive temporal affinity and remains available for a future record drill-down. No database table, index, cache, worker, AI call or original-record write is introduced.

Both statistics functions currently materialize the eligible requested range. Development benchmarks through the actual query code and fake-indexeddb cover 1,000/10,000/50,000 records. This is sufficient for a contract and index decision, not a production device latency guarantee. Future visualization must profile representative Chrome/Safari devices and may introduce worker/off-main-thread computation or incremental aggregates only from measured need. No extra index or Dexie migration is justified by Phase 12.6.

## Life Intelligence contract boundary

Phase 14.1 adds a compile-time and in-memory contract under `features/life-intelligence`. It does not add a route, worker, automatic hook, network request, Dexie store, migration or database adapter. Moment, MomentAppend, Diary and the current manual-only LifeEvent schema/repository remain unchanged.

The contract separates four responsibilities:

```text
LifeEventExtractor -> validated LifeEventProposal
proposal state machine -> accepted / corrected / rejected / superseded
review application service -> insert-only LifeEvent materialization plan
LifeIntelligenceRepository port -> future atomic persistence adapter
```

Pending and rejected proposals are not LifeEvents. Accepting a proposal plans an `ai` materialization; correcting one plans a `manual` materialization containing the user's corrected fields. Both retain the proposal ID and exact source fingerprint. The current LifeEvent table cannot receive either plan in this phase. A later explicitly approved migration must implement the storage adapter and origin/provenance fields before any plan can be persisted.

The repository port requires an adapter to commit the terminal proposal state and optional LifeEvent insertion atomically, reject event-ID collisions, and never update an existing manual event. Equal proposal retries are identified by job ID plus candidate key and return the first proposal unchanged. The deterministic fake extractor is local-only and conservative: relative periods such as afternoon/evening remain day precision, explicit durations remain durations, and unsupported text returns an empty successful result.

### Life Intelligence lab review

Phase 14.2 adds `/lab/life-extraction` as a direct Server Component route around one client review surface. It has no navigation or homepage entry. The user explicitly starts each extraction; no Moment/Diary save hook, queue, timer, worker or network boundary exists.

```text
lab text + natural-date context
  -> deterministic FakeLifeEventExtractor
  -> runLifeExtraction
  -> session-only LifeEventProposal records
  -> Accept / Correct / Reject
  -> session-only LifeEventMaterialization or no event
```

`LabMemoryLifeIntelligenceRepository` implements the Phase 14.1 storage port with JavaScript Maps. It does not import Dexie, open IndexedDB or call the current LifeEvent repository. Accept and Correct use the real review application service; terminal-state checks, duplicate-review idempotency and manual-conflict protection therefore remain domain behavior rather than UI simulation. The lab retains one source snapshot for the visible review batch while the input remains editable.

Refreshing or leaving the route discards jobs, proposals and materializations. The page states this limitation before extraction, and browser coverage verifies both reset behavior and the absence of a `life` IndexedDB database in a clean context. Manual-conflict detection is consequently limited to manual materializations created in the same page session. Persisted review recovery and comparison with existing manual LifeEvents require the later approved storage adapter.

### Life Intelligence persistence boundary

Phase 14.3 replaces the Phase 14.2 memory adapter with `DexieLifeIntelligenceRepository` and advances the local database to v6. The migration adds `lifeExtractionJobs` and `lifeEventProposals`, plus one sparse unique `extractionProposalId` index on `lifeEvents`; it has no upgrade transform or automatic data generation. Existing original records and v5 manual LifeEvents are not rewritten.

```text
explicit scratch/record extraction
  -> FakeLifeEventExtractor (still local and user-triggered)
  -> atomic Job + Proposal persistence
  -> pending Proposal review
       Accept  -> atomic AI LifeEvent insert + accepted Proposal
       Correct -> atomic manual LifeEvent insert + corrected Proposal
       Reject  -> rejected Proposal only
       Supersede -> superseded Proposal only (contract; no automatic trigger)

final source-valid LifeEvent
  -> unchanged Life Statistics contract
  -> unchanged Life Visualization contract
```

The repository owns two transaction boundaries. Extraction commits one Job and all of its Proposals together after validation. Accept/Correct transactions include Job, Proposal, LifeEvent, and read-only source tables so source fingerprint validity, exact active-manual conflict detection, Event insertion, and Proposal resolution succeed or roll back together. Reject and explicit supersession update only the Proposal table. Database uniqueness on `requestKey`, `[jobId+candidateKey]`, and `extractionProposalId` protects retries and multi-tab races.

Proposal candidates and evidence are immutable. `accepted`, `corrected`, `rejected`, and `superseded` are terminal; accepted-to-corrected is deliberately unsupported. Future editing of an accepted AI Event requires a separate LifeEvent revision design. Direct manual creation remains insert-only and omits `extractionProposalId`, while reviewed corrections are manual Events that retain the Proposal link. No path updates or deletes an existing manual Event.

Job inputs distinguish persisted 64 KiB-capped scratch text from record references containing type, ID, and fingerprint. Record text and provider responses are not copied into the Job. Source status (`scratch`, `current`, `stale`, `missing`) is derived at read/review time and never becomes a Proposal state. Stale/missing sources block Accept/Correct but permit Reject; stored audit records remain intact.

`/lab/life-extraction` restores its latest scratch Job, Proposals, terminal states, and materialized Events from IndexedDB. It tells users that Accept/Correct creates real LifeEvents that can enter Statistics and Life Map. Statistics never imports or reads Job/Proposal storage, and Life Map receives the same presentation-neutral exploration structure with no AI branch. There is still no provider, network call, background worker, save hook, homepage entry, or original-record mutation.

## Future synchronization constraints

All main entities use application-generated UUIDs, UTC timestamps, and `createdAt`, `updatedAt`, and `deletedAt`. Tombstones prevent deleted records from silently returning on another device. Moment original text is immutable and append content is independent, reducing merge conflicts. No account ID, device ID, sync cursor, or conflict engine is added before a real sync protocol is designed.

## Test strategy

Unit tests cover pure rules and utilities. Database integration tests cover Dexie schema, migrations, transactions, indexes, and soft deletion. Component tests cover user behavior. Playwright is deferred until a real product flow exists. The current real-browser baseline covers the core flow; future stages should extend it only when their browser behavior warrants it. Every feature stage must pass `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## Evolution rules

- `docs/PRODUCT.md` is the product authority.
- Schema changes require a Dexie version migration and migration tests.
- AI data never overwrites original data.
- New abstractions must solve an observed duplication or boundary problem.
- Architecture and data model changes update the corresponding docs and ADR.

## 2026-09-05 presentation refresh

The iOS-style refresh keeps the server/client, repository, schema and statistics boundaries above. `design-system.css` remains the shared token source. A presentation-only `SegmentedControl` owns its selected-surface animation and keyboard tab semantics; Calendar and Life Visualization still own selection state and invoke their existing reads. `EmptyState` only renders a semantic message with a decorative library icon.

Life Map emphasis interpolates Canvas alpha in refs and a bounded animation frame loop, without per-frame React state. System color changes trigger repaint and reduced-motion changes cancel interpolation. Exiting inspector content is inert and hidden from the accessibility tree. A failed subsequent range read retains the prior map with a visible retry message. These changes add no persistent state, caches, dependencies or data operations.
