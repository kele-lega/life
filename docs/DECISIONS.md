# Architecture Decision Records

## ADR-037: Supabase Storage snapshots use unique immutable object keys

- **Status:** Accepted (2026-09-08 explicit Phase 16A.5 provider correction). Supersedes ADR-036 only where it implied version-pinned object storage.
- **Decision:** Use the private Supabase Storage S3-compatible endpoint without bucket Versioning. Every backup part receives a server-generated key containing account ID, backup ID and a random UUID; a verified part never receives another upload URL. The manifest has a backup-scoped key. The service reads each registered key and verifies exact bytes plus SHA-256 before marking the snapshot complete. Completed snapshot metadata, file membership and object-key references are immutable through PostgreSQL triggers; application APIs expose no delete or in-place update operation.
- **Roles:** `001-foundation.sql` creates the catalog. `002-roles.sql` creates only `NOLOGIN` capability roles `life_cloud_app` and `life_cloud_worker`. Migrations require only the administrator `CLOUD_MIGRATION_DATABASE_URL`; separate restricted LOGIN roles are created and granted one capability role each afterward.
- **Limits:** Unique keys and application-level immutability are not provider WORM storage or an independent disaster-recovery copy. Supabase database backups do not include Storage objects, so PostgreSQL and object backups still require separate restore drills.
- **Evidence:** Object adapters no longer call Versioning APIs or require `x-amz-version-id`. SQL and integration tests cover unique cross-snapshot keys, checksum readback, no upload authorization after verification and immutable completed rows. Real Supabase PostgreSQL and Storage acceptance used only synthetic fixtures; see the Phase 16A.5 drill record.

## ADR-038: Hosted Supabase mail links exchange into the Life session boundary

- **Status:** Accepted (2026-09-08 Phase 16A.5 provider bring-up).
- **Decision:** The cloud API continues to support numeric email OTP. When a Supabase project uses the hosted default mailer, which sends a one-time Magic Link instead of `{{ .Token }}`, the browser consumes the short-lived access token from the callback fragment, removes it from the URL, and exchanges it once through the same-origin server for the opaque Life Session. The server validates the token with Supabase and stores only the session digest.
- **Security:** No provider token is logged or persisted. The callback accepts only the configured Supabase callback origin and `magiclink`/`signup` types; it never receives record content. A custom SMTP template with `{{ .Token }}` remains supported through the existing numeric OTP form.
- **Development:** `next.config.ts` allows `127.0.0.1` as a Next.js development resource origin because Supabase local callbacks use that loopback address. This setting does not change production origin validation.

## ADR-036: Cloud Foundation stores immutable backups while Dexie remains the working database

- **Status:** Accepted design (2026-09-07 explicit Phase 16A implementation confirmation). Deployment acceptance remains separate from this architecture decision.
- **Decision:** First implement a portable v1 .life.zip with exact seven-store snapshots and original images, then library-level email accounts and immutable cloud backup catalogs. Dexie business schema remains v6. A separate `life-control` database stores infrastructure state; no account/sync field is added to business entities.
- **Isolation:** A library is anonymous or bound to one Account. Login/binding never auto-upload. Each document retains one fixed database instance; an exclusive Web Lock prevents account/library switching while other tabs are open. Successful switch uses a full document reload. Logout retains the bound library and selects a separate anonymous library; expired cloud sessions do not block offline records.
- **Restore:** Validate format, checksums, counts, existing unique keys and review links before activation. Write a new independent v6 database, reconstruct Blob, then read back and compare. Never clear the original database, replay review commands, normalize originals or regenerate IDs/fingerprints. Pre-existing stale/deleted history is preserved.
- **Cloud:** Supabase email OTP verification maps a stable provider subject to an internal Account. BFF cookies are opaque HttpOnly/Secure/SameSite sessions; only hashes persist. Server-only API validates session/account/origin and uses a restricted PostgreSQL role with RLS. PostgreSQL stores snapshot catalogs; private object storage holds JSON/image bytes in pinned 4 MiB parts. Complete snapshots are immutable at SQL level. Workers only verify explicitly requested snapshots, with durable leases/checkpoints, and do not capture new records or call AI.
- **Boundaries:** Cloud backup is not E2EE; object/DB disaster backups need independent operational verification. Current archive size and browser Web Locks requirements are explicit. API configuration absent or invalid leaves export/restore local. No push/pull protocol, live cloud CRUD, conflict resolution, automatic extraction or other AI functionality is authorized.
- **Evidence:** Archive/control tests, actual SQL/RLS tests using PGlite with an in-memory object adapter, and `e2e/cloud-foundation.spec.ts`. These are not proof of real SMTP/IAM/CORS/production worker operation; actual-provider acceptance requires configured credentials and synthetic-data drills documented in `PHASE16A_CLOUD_OPERATIONS.md`.


`Accepted` means currently valid. When requirements change, add a replacement ADR rather than silently rewriting history.

## ADR-001: Moment original text is append-only

- **Status:** Accepted
- **Decision:** After creation, no data API updates `originalText`; supplements are independent `MomentAppend` entities.
- **Reason:** The original captures what was true at the time and independent appends reduce future sync conflicts.

## ADR-002: IndexedDB/Dexie is the V1 source of truth

- **Status:** Accepted
- **Decision:** Original data is written to browser IndexedDB through Dexie.
- **Reason:** V1 is single-user, account-free, and must work offline.
- **Impact:** Core use cases cannot depend on a server; quotas and backup remain future risks.

## ADR-003: Use a Next.js monolith

- **Status:** Accepted
- **Decision:** App Router owns the Web application; future AI endpoints use its Route Handlers.
- **Reason:** There is no current need for accounts, sync, or shared services.
- **Impact:** Dexie remains client-only; a backend is reconsidered from real sync requirements.

## ADR-004: Organize source by feature

- **Status:** Accepted
- **Decision:** Product code lives under `src/features/<feature>`, infrastructure under `src/lib`, routes under `src/app`.
- **Reason:** This matches product boundaries and keeps staged changes local.
- **Impact:** No premature controller/service/domain hierarchy.

## ADR-005: Do not add a global state library

- **Status:** Accepted
- **Decision:** React local state handles transient UI state; Dexie handles persistent state.
- **Reason:** V1 has no demonstrated Redux-scale coordination, and duplicate caches add consistency cost.

## ADR-006: Physically separate originals and AI derivatives

- **Status:** Accepted
- **Decision:** AI output belongs in AiMetadata/DailySummary with source IDs and revisions, never in original content fields.
- **Reason:** AI may fail, become stale, or be regenerated; originals must remain independently exportable.

## ADR-007: UUID, UTC time, and soft deletion from day one

- **Status:** Accepted
- **Decision:** Use application UUIDs, UTC ISO timestamps, and `createdAt`/`updatedAt`/`deletedAt` on main entities.
- **Reason:** This is low-cost preparation for multi-device synchronization and tombstones.
- **Impact:** No account/device IDs or sync engine are added until sync is actually designed.

## ADR-008: Vitest plus fake-indexeddb

- **Status:** Accepted
- **Decision:** Vitest runs tests, Testing Library covers components, and fake-indexeddb covers Dexie integration. Playwright waits for a real product flow.
- **Reason:** The foundation needs fast deterministic tests without inventing an E2E surface.

## ADR-009: Map and health are outside V1

- **Status:** Accepted
- **Decision:** Keep location metadata extensible but build no map or health UI/model now.
- **Reason:** PRODUCT.md defines them as future extensions and they must not compete with quick recording.

## ADR-010: Offline application shell is a separate phase

- **Status:** Accepted
- **Decision:** This foundation guarantees a local-first data boundary; Service Worker caching and installability are a later phase.
- **Reason:** Offline data and offline application startup are different technical problems with different tests.
- **Impact:** Do not claim full offline reopen behavior until the PWA phase passes.

## ADR-012: Moment and its attachments save atomically

- **Status:** Accepted
- **Decision:** `createMomentWithAttachments` writes the Moment and all Moment-owned attachments in one Dexie read-write transaction. Any attachment write failure rolls back the entire creation.
- **Reason:** A record with images must never present a partial or orphaned local state.
- **Impact:** UI retries the complete operation while retaining its text and selected files. Attachments are stored as original Blobs in IndexedDB; object URLs are temporary previews and are revoked when no longer needed.
## ADR-013: Keep the homepage recent list bounded and re-query after saving

- **Status:** Accepted
- **Decision:** The homepage reads at most 20 active Moments in newest-first order. A successful quick save signals the page through a local React callback, which re-queries the repository rather than maintaining a separate client cache.
- **Reason:** Twenty records provide useful immediate recall without loading the full life history; the limit is simple to change when real usage provides evidence. Re-querying IndexedDB keeps it as the source of truth while avoiding global state or an event bus.
- **Impact:** Full history, pagination, and mixed content remain responsibilities of the future Timeline. Homepage attachment previews own and revoke their temporary object URLs.

## ADR-014: Load and refresh Appends within each recent Moment

- **Status:** Accepted
- **Decision:** Each homepage Moment reads its own active MomentAppends through the repository and refreshes only that list after a successful append save. Appends sort by `createdAt` ascending, then by `id` ascending when timestamps match.
- **Reason:** The homepage is bounded to 20 Moments, so owner-scoped queries are simple and keep IndexedDB as the source of truth without global state. The ID tie-breaker makes equal timestamps deterministic without relying on insertion order.
- **Impact:** Append saves do not reload Moment images or mutate `originalText`. Bulk loading for a future Timeline can be designed from its actual scale requirements.

## ADR-015: Optional permission-associated location with server reverse geocoding

- **Status:** Accepted
- **Decision:** Begin a browser Geolocation request only when the user enters quick-record mode. Coordinates are passed to a minimal same-origin route, which calls Nominatim to resolve `city`; the route returns only the city and never exposes a provider key. The lookup is best-effort and runs independently of local Moment persistence.
- **Reason:** Location should be useful without interrupting the open/write/save path. Keeping reverse geocoding behind a replaceable route avoids provider credentials in the browser while allowing IndexedDB saves to work offline.
- **Impact:** Permission denial, unsupported browsers, timeout, network failure, and provider failure result in null location fields. Coordinates may still be stored when reverse geocoding fails. V1 has no map, POI search, continuous tracking, or history backfill.

## ADR-016: Real-browser baseline uses isolated Playwright contexts

- **Status:** Accepted
- **Decision:** Keep Playwright tests under `e2e/`, run the locally installed Chrome channel through a simple `webServer`, and give each test a fresh browser context with the test origin's IndexedDB. Run these local IndexedDB flows with one worker, and mock the application's reverse-geocoding route instead of calling public Nominatim.
- **Reason:** The baseline must verify actual browser IndexedDB and Blob behavior while never reading or modifying a developer's normal browser profile. Route mocking makes geolocation coverage deterministic and avoids external network dependency.
- **Impact:** The baseline intentionally covers only critical user paths, not every unit/component case. Nominatim remains a low-volume/demo dependency and requires a provider, caching, rate-limit, outage, and privacy review before productization.

## ADR-017: Diary content editing preserves creation identity

- **Status:** Accepted
- **Decision:** Diary `body` is required and `title` is optional. Diary title and body are stored exactly as entered; no title is auto-generated. Editing uses a constrained `updateDiaryContent` operation that changes only title/body and updates `updatedAt`, while preserving `id`, `createdAt`, and `deletedAt`.
- **Reason:** PRODUCT.md says Diary supports a title but does not require one. Diary is an authored long-form record and therefore differs from append-only Moment originals.
- **Impact:** A body-only Diary is valid. Empty title is represented as an empty string. Diary editing remains local-only and cannot alter Moments or MomentAppends.

## ADR-018: Timeline is a paginated read model over independent repositories

- **Status:** Accepted
- **Decision:** Timeline merges active Moment and Diary repository pages in `createdAt`/`id` descending order. It is a client-side, non-persistent view model; no unified entity or Dexie table is added. The initial page and each explicit load-more request contain 20 roots. Each source cursor advances only past roots actually emitted from that source. Only the current page's Moment Appends and Attachments are batch-loaded, with Appends remaining nested under their root Moment.
- **Reason:** Timeline is a reading surface, while Moment and Diary retain independent product semantics and storage boundaries. Batch child reads avoid unbounded per-item queries as history grows.
- **Impact:** Soft-deleted roots and children are excluded by default. Moment, Diary, and child query failures are isolated where possible. Diary images, location UI, and all later browsing or AI features remain deferred.

## ADR-019: Calendar queries local periods as UTC ranges

- **Status:** Accepted
- **Decision:** Calendar has no persistent entity. Device-local month and date boundaries are converted to UTC half-open ranges, then Moment and Diary are each queried once by indexed `createdAt`. A month stores only a derived set of recorded local-date keys. A selected day reuses Timeline's read-only item model and batch child hydration, with All/Moment/Diary filtering performed in local UI state.
- **Reason:** UTC remains the stable storage format while Calendar must reflect the user's natural local day. Range queries avoid a 30/31-day query fan-out, and shared hydration keeps Moment images, location, and Appends consistent without coupling Calendar to the Timeline page component.
- **Impact:** Only active Moment and Diary roots can mark a date. Append and Attachment creation dates never mark one; Diary edits remain on the original `createdAt` date. No Calendar table, cache, streak, score, completion state, Diary attachment, or later-phase feature is added.

## ADR-020: Plain Search scans active local text and paginates derived roots

- **Status:** Accepted
- **Decision:** V1 Search performs local NFC-normalized, case-insensitive substring matching over active Moment `originalText`, active MomentAppend `text`, Diary `title`, and Diary `body`. It creates no persistent index or Search table. Append matches are deduplicated into their active parent Moment; roots sort by parent/root `createdAt` descending and ID descending. Each request derives matching roots, returns a 20-root offset page, and batch-hydrates only that page's Moment children through the existing Timeline boundary.
- **Reason:** IndexedDB has no native substring index, while the current single-user V1 dataset does not justify a full-text engine. A deterministic offset over a fresh local scan is simpler and more reliable than adapting Timeline's two-source cursor to a filtered result set.
- **Impact:** Search works offline, preserves all original data, filters soft-deleted records, and avoids per-result child queries. The current scan cost grows linearly with active text volume and each load-more request repeats the scan; tens or hundreds of thousands of records require future measurement and possibly a rebuildable local full-text index. Manual Tags and AI metadata join the existing Search query only after their own phases add real entities.

- **Decision:** `.env.example` contains unbound server-side placeholder names; no AI SDK, route, or request is implemented in this round.
- **Reason:** It preserves the security boundary while respecting the current scope.
- **Deferred:** Provider choice, retention, consent, cost limits, and model policy belong to the AI phase.

## ADR-021: Save-button feedback follows real persistence

- **Status:** Accepted
- **Decision:** Quick Moment, MomentAppend, and Diary save controls share a presentation-only `StatefulButton`. Original button labels remain unchanged. Its loading phase lasts for the actual repository operation, not a simulated 1.2 seconds. Only a successful operation shows the drawn check for 1.5 seconds before the existing editor dismissal/navigation. Moment and Append read refreshes still happen immediately after persistence; validation and save failures return directly to idle with the existing error/input protection.
- **Reason:** The requested animated feedback must not claim success before IndexedDB commits, delay the local write, or permit duplicate submission during success feedback.
- **Impact:** Framer Motion supplies transitions and reduced-motion support. Tailwind is restricted to the button source with `sb:`-prefixed utilities and no Preflight reset; existing page styles remain unchanged. Button timers are cleared on unmount, and an unmounted button cannot trigger delayed navigation. The Diary leave guard recognizes an already-persisted value during feedback. No repository, schema, entity, or query changes are involved.

## ADR-022: Shared presentation tokens and shorter save feedback

- **Status:** Accepted (2026-09-03 UI polishing request). Replaces ADR-021's 1.5-second presentation duration; persistence semantics stay the same.
- **Decision:** Use one global semantic token sheet with locally scoped homepage composition. The shared save button follows those colors and finishes its success feedback after 700ms. Tailwind continues to style only its animated contents, without a reset. Existing Framer Motion provides measured height transitions, reduced-motion behavior, and inert exiting content. The growing textarea has a browser fallback; no runtime font service or additional state store is introduced.
- **Reason:** Duplicate homepage tokens and important black button utilities prevented a consistent light/dark appearance. A shorter completion state makes the local save flow feel immediate while remaining legible. Keeping route layouts staged avoids redesigning unreviewed pages during UI-1.
- **Impact:** Moment and Append refreshes still follow the actual local write immediately. Repository calls, schemas, query files, entity shapes, immutable originals, leave confirmation, and image limits are unchanged. The only added dependency is `@radix-ui/react-icons` for presentation.

## ADR-023: Reuse read presentation while keeping query modules fixed

- **Status:** Accepted (2026-09-03).
- **Decision:** Timeline, Calendar and Search share the same reading component with optional presentation-only highlighting props. Each route owns a CSS module; globals contain only the reset, and semantic tokens live in one sheet. Search highlights map normalized matches back to the original graphemes, and Diary results can show a local display excerpt around the match. The original source string is never rewritten or stored by the renderer.
- **Reason:** A common reading object preserves a calm, consistent experience across recall surfaces without making a new persistent model or changing query semantics.
- **Impact:** Query/repository files are unchanged. Added retries re-invoke the same existing APIs. Stale asynchronous search errors are guarded in component state. Diary's in-app return link now honors its existing unsaved-content confirmation. Actual native-device validation remains necessary beyond Chromium checks.

## ADR-024: Deploy the existing Next.js application on Netlify

- **Status:** Accepted (2026-09-03), following the user's request to change providers because Vercel login was unavailable.
- **Decision:** Use Netlify's maintained Next.js adapter, with `npm run build`, `.next` output and Node 24. Keep the Vercel configuration as an optional fallback. Deployment is not complete until the account is authorized, platform build succeeds, and the live URL is verified.
- **Reason:** Netlify supports the existing App Router and Route Handler, so the UI can be hosted without converting the application to a static export or migrating its framework.
- **Impact:** Local IndexedDB remains isolated per browser origin. The platform receives application code, not personal records. No required application secret or data migration is introduced. Browser tests now derive geolocation permission origin from the configured base URL so the same checks work against development, production builds, and the live site.

## ADR-025: Preserve content identity throughout a unified motion system

- **Status:** Accepted (2026-09-03 explicit motion-system request). Replaces ADR-022's 700ms success feedback and earlier easing values.
- **Decision:** Share typed Motion transitions and SSR CSS variables from `components/ui/motion.ts`. Page-owned client boundaries supply reduced-motion context and entry classes without pathname keys or a client root layout. CSS entry effects release their transforms when finished. Editors animate numeric heights observed from intrinsic content; they never alternate between an asynchronously resolved auto height and a measured target.
- **Continuity:** Keep stable entity keys and position-only row layout. Recent attachment previews retain their object URLs when ID and updatedAt are unchanged; stale loads cannot publish views or allocate URLs. Refresh failures retain readable content. The single existing save button reserves intrinsic label space, announces its current state, retains committed content during 1100ms feedback, and guards callbacks by mount status and operation generation. Persistence and list refresh happen immediately on successful local write.
- **Scope:** No schema, entity, repository, query, framework-cache or persistence change. Existing cross-route search reset and the repository's unenforced recent-row limit are recorded as pre-existing limitations rather than silently changed in an animation task. No image-preview feature is added.
- **Validation:** Behavior tests cover stale responses, URL/DOM reuse, retained append drafts, save generations and navigation semantics. Real-browser checks cover rapid reveal reversal, actual IndexedDB failure/pending/retry, old-row opacity throughout insertion, both themes and motion preferences, and all five requested widths. Tests explicitly distinguish Motion's reduced-motion notice and Chrome's Next Link destination-CSS preload advisory from application errors, failed resources and React warnings, which still fail.

## ADR-026: Manual LifeEvents are independent, source-traceable local records

- **Status:** Accepted (2026-09-03 explicit Phase 12 implementation request).
- **Decision:** Add only the `lifeEvents` store in Dexie v5. Keep Moment, Append, Diary and Attachment definitions and repositories unchanged. The source relationship is optional and many-to-one; creation origin is separately `manual`. The direct-only lab is the sole new surface. No home/navigation, recall integration, AI, device import or visualization is added.
- **Time:** Preserve a natural `occurredOn` date and IANA timezone separately from UTC creation timestamps. Day precision never implies an instant. Known intervals derive elapsed integer seconds; conflicting duration is rejected. No generic value/unit or confidence field is introduced.
- **Identity and retries:** Application UUIDs identify independent events; name/source cannot be unique. Equal UUID/payload retries return the original commit; conflicting reuse fails, never upserts. Multi-event creation is atomic. The lab keeps the same ID across failed writes or readback failures. Readback is always from IndexedDB.
- **Source validity:** Compute a versioned SHA-256 of actual source text. An active but edited source produces a non-persistent stale status; no manual event is overwritten or automatically regenerated. An inactive/missing source or inactive Append parent suppresses the linked event in default reads. Event tombstones always remain filtered. This explicitly uses effective read-time deletion for LifeEvent, instead of expanding original repositories to cascade writes; it qualifies the general future derived-record deletion rule in DATA_MODEL.md. Restore can re-expose intact links, not independently tombstoned events.
- **Scale:** Global pages use `[occurredOn+id]` exclusive keyset cursors, 20 by default/100 maximum; source lookups are batched in 64-row scans. `[source.type+source.id]` isolates source queries. No whole-history cache or schema for hypothetical future queries is added.
- **Limitations:** Source-specific lists are owner-bounded rather than paginated; many hidden rows still require scanning. Stale manual events need a future explicit review/correction policy before aggregate visualization. Lab entries are real local data, not an isolated dataset. Fractional-second measurements, device provenance, AI confidence, event merging, source selection UI and analytics inclusion rules are future decisions, not implemented capabilities.

## ADR-027: Life Statistics is a source-valid, natural-date domain contract

- **Status:** Accepted (2026-09-03 explicit Phase 12.5/12.6 request).
- **Eligibility:** Include non-deleted manual LifeEvents when independent (`unlinked`) or linked to unchanged active source content (`current`). Exclude `stale`, missing/deleted-source and event-tombstone records by default without deleting or rewriting them. This makes statistics conservative: uncertain interpretations cannot silently change totals.
- **Time:** Every query range is `[startDate, endDate)` over `occurredOn`. Null duration counts as an event but adds no seconds. Day precision never receives a synthetic instant. Cross-day intervals are assigned wholly to `occurredOn` until a real split/allocation requirement exists. Weeks begin Monday; series are sparse and chronological.
- **Boundary:** `life-insights` is a read-only domain query that depends on the LifeEvent repository, not Dexie or presentation code. Summary and time-series values contain no graph coordinates, colors or visualization identity. Fixed category aggregates preserve the four-category vocabulary; exact `name`, Event ID and optional source reference already preserve future drill-down without expanding this contract prematurely.
- **Experiment data:** `/lab/life-events` writes ordinary LifeEvents. Do not add `isLab`, infer provenance from a route, or branch business logic on where an event was created. Explicitly review/remove generated test records before formal visualization; they cannot be automatically distinguished safely.
- **Performance decision:** Keep Dexie v5 and `[occurredOn+id]`. On the 2026-09-03 development environment, Vitest/fake-indexeddb median warm-query results were: 1k records—30d 0.84ms, 1y 5.29ms, five-year monthly 14.39ms, category 10.86ms; 10k—2.11ms, 38.05ms, 156.48ms, 109.22ms; 50k—11.53ms, 120.10ms, 689.65ms, 608.93ms. These are implementation comparisons, not browser/device SLAs. No new index is warranted; real-device profiling precedes visualization optimization.
- **Impact:** Large/full-history ranges are materialized and aggregate on the caller thread. At 50k this is measurable, so visualization design should avoid repeated full-history refreshes and assess worker/incremental strategies only after real-browser profiling. No Dashboard, chart, Life River/Garden/Map, AI, homepage/navigation or existing recall-query change is included.

## ADR-028: Life Visualization is an organic read-only projection over Life Statistics

- **Status:** Accepted (2026-09-03 explicit Life Visualization request).
- **Experience:** `/life` presents exact LifeEvent names as overlapping organic regions with contours and temporal traces. Hover, keyboard focus or touch highlights one region, dims unrelated terrain and reveals an adjacent narrative detail; no region is selected by default and no dense bottom event rail is shown. It intentionally avoids Dashboard cards and conventional line, bar or pie charts.
- **Data boundary:** `getLifeEventExploration` remains inside `life-insights` and performs one statistics-eligible range read. It adds UI-neutral exact name/source aggregates and a bounded recent event projection while preserving Summary/Time Series APIs. Canvas geometry, colors, labels and interactions stay in `life-visualization`; no UI imports Dexie.
- **Truthfulness:** Visible lenses are activities, places and themes. People are not inferred from private text or invented from open metadata, while source provenance remains available to the domain contract without becoming a user-facing observation mode. Temporal affinity connects consecutive visible event topics within fourteen natural days; place affinity is rendered as a route trace, while all such links remain presentation relationships rather than persisted meaning.
- **Lifecycle:** Stale, inactive-source and deleted LifeEvents remain absent under ADR-027 and are never removed or repaired by the map. `/lab` records are ordinary LifeEvents and therefore appear if eligible. The visualizer does not mutate, classify or backfill them.
- **Evolution:** 30/90/365 is a sediment-depth control. Only range responses interpolate the previous and next presentation frames; Lens changes remain immediate and reduced motion receives the final frame. Frequency controls grain density, accumulated duration controls radius/contour weight, and neither value is stored back on LifeEvent.
- **Scale:** Aggregate values cover the complete requested range. The default page window is 30 days with explicit 30/90/365-day choices. Existing Dexie v5 indexes remain sufficient; no new table/index, worker or cache is added before real-device evidence.
- **Impact:** Existing Moment, Diary, Timeline, Calendar, Search and homepage code stay unchanged. The route includes loading, empty, error, keyboard, reduced-motion, dark-mode and narrow-screen states.

## ADR-029: Life Intelligence begins as a proposal-first, non-persistent contract

- **Status:** Accepted (2026-09-04 Phase 14.1 request).
- **Decision:** Add `features/life-intelligence` contracts for extraction jobs, validated proposals, a terminal proposal state machine, insert-only materialization plans, a repository port and a deterministic fake extractor. Do not add a Dexie migration, database adapter, route, network call, save hook or automatic job.
- **Review semantics:** Accept plans an AI-origin LifeEvent. Correct plans a manual-origin LifeEvent containing the user's revision. Reject creates no event. Pending/rejected/superseded proposals never reach Life Statistics. Equal proposal retries return the first proposal; conflicting candidate-key reuse fails.
- **Manual priority:** The materialization port exposes a manual-conflict check and has no update operation. Future adapters must atomically reject event-ID collisions and any attempt to replace existing manual data.
- **Reason:** The current physical LifeEvent schema permits only `origin: manual`. A pure contract proves extraction and review behavior without weakening that invariant or creating data that existing statistics would misinterpret.
- **Impact:** Dexie stays v5. Moment, MomentAppend, Diary, LifeEvent, Statistics, Life Map and navigation remain unchanged. Persisting accepted/corrected events is deferred until an explicit schema phase.

## ADR-030: Life Intelligence Lab reviews only session-owned proposals

- **Status:** Accepted (2026-09-04 Phase 14.2 request).
- **Decision:** Add a direct `/lab/life-extraction` route backed by the deterministic fake extractor and an in-memory implementation of the Phase 14.1 repository port. Users explicitly extract text and review each candidate with Accept, Correct or Reject. Do not add Dexie persistence, a real AI provider, a source-save hook or navigation entry.
- **Review behavior:** Accept produces one session-owned AI materialization, Correct produces one session-owned manual materialization with the edited category/name/date/duration/timezone, and Reject produces none. Repeated terminal review is idempotent. A corrected manual result blocks a later equal AI interpretation within the same session.
- **Refresh behavior:** Refresh intentionally clears the lab. The page communicates this before extraction; E2E verifies the reset and that a clean browser context has no `life` IndexedDB database after the flow.
- **Reason:** This creates a complete, inspectable review loop while preserving the approved no-schema constraint. Persisting proposal state or pretending the current manual-only LifeEvent table accepted AI output would violate the existing model.
- **Impact:** Lab output cannot enter Statistics or Life Map. Existing persisted manual LifeEvents are outside the in-memory conflict set. Recovery, full provenance persistence and cross-session manual conflict checks remain deferred to a separately approved adapter phase.

## ADR-031: Life Intelligence review is persisted atomically in Dexie v6

- **Status:** Accepted (2026-09-05 explicit Phase 14.3 confirmation). Supersedes ADR-030's session-only storage behavior while retaining its user-triggered fake-extractor scope.
- **Schema:** Dexie v6 adds `lifeExtractionJobs` with unique `requestKey`, `lifeEventProposals` with unique `[jobId+candidateKey]`, and a sparse unique `extractionProposalId` index on `lifeEvents`. Ordinary manual Events omit this optional property entirely. There is no `upgrade()` transform, backfill, automatic Job, Proposal, or Event.
- **Provenance:** Accept inserts an `ai` Event with a Proposal ID; Correct inserts a `manual` Event with a Proposal ID; direct manual creation has no Proposal ID. Proposal and Event retain reciprocal IDs, and the database permits at most one Event per Proposal. Review data is not placed in LifeEvent metadata.
- **Terminal review:** `pending` may become `accepted`, `corrected`, `rejected`, or `superseded`; every destination is terminal. Equal terminal retries return the first result. Accepted-to-corrected is forbidden, and future edits to accepted Events require an independent revision design.
- **Transactions:** Job plus all candidates commit atomically. Accept/Correct re-read Job, Proposal, original source fingerprint, active manual conflicts, and Event identity in one transaction before inserting the Event and resolving the Proposal. Reject writes only Proposal state. Existing manual Events and original records are never updated or deleted.
- **Source validity:** Scratch inputs persist exact text with a 64 KiB limit. Record inputs persist only source type/ID/fingerprint. Proposal source status is derived as scratch/current/stale/missing; stale or missing blocks materialization but still permits rejection. No stale audit record is removed.
- **Read boundary:** Life Statistics now includes active final AI and manual Events and continues excluding stale, missing-source, and deleted Events. It never reads Proposals. Life Visualization consumes the unchanged exploration contract and has no AI-specific path.
- **Lab and scope:** `/lab/life-extraction` restores persisted review state and warns that Accept/Correct creates real data that affects Life Map. There is no `isLab`, route-dependent business rule, real provider, automatic extraction, worker, homepage feature, or new business entity beyond the approved persistence records.
- **Performance:** A 50,000-LifeEvent v5-to-v6 fake-indexeddb benchmark is retained as migration evidence. It is a development comparison rather than a browser/device SLA and does not justify more indexes.

## ADR-032: Homepage navigation unfolds as a life path

- **Status:** Accepted (2026-09-05 explicit homepage navigation request).
- **Decision:** Replace the permanent “More” text-link row with one collapsed “Life Path” disclosure after recent records. On request it reveals standard links to Timeline, Calendar, Search, Diary, and Life Map along one continuous visual path. Desktop uses an undulating horizontal route; narrow screens use the same ordered route vertically.
- **Priority:** The date, quick Moment recording, and recent records retain their current order and visual weight. The portal starts collapsed, stores no preference, and keeps Life Map as the final destination rather than a first-screen feature card.
- **Accessibility:** The disclosure exposes `aria-expanded` and `aria-controls`, Escape collapses and restores trigger focus, links remain semantic, targets are at least 44 px, and reduced motion receives immediate final states.
- **Scope:** `/lab/*`, dynamic Diary details, and the new-Diary editor do not become homepage destinations. They remain development-only or are reached through their owning product page. No repository, query, IndexedDB, or record flow changes.

## ADR-033: Unify the record and recall surfaces with presentation-only iOS styling

- **Status:** Accepted (2026-09-05 explicit whole-site UI upgrade request).
- **Decision:** Replace the previous serif/paper appearance with system sans typography, neutral grouped surfaces, consistent touch targets and restrained depth. Keep the existing vermilion accent, with separate foreground and fill tokens for dark-mode contrast. Use the existing CSS Modules, Radix icon and Framer Motion dependencies.
- **Interaction:** Share a segmented control across Calendar and Life Map. Map tabs expose arrow/Home/End navigation and an associated panel. Inspector exit animation never leaves stale content interactive or readable by assistive technology. Canvas emphasis animates from its last rendered alpha and redraws on system theme changes; reduced motion cancels interpolation.
- **Boundary:** All six main routes and Diary subroutes preserve their existing behavior. Moment originals, local saves, queries, schemas, LifeEvent eligibility, extraction/proposals and AI architecture are unchanged. Screenshots use disposable browser-context fixtures and never seed a personal browser profile.
- **Tradeoff:** The web implementation approximates iOS materials while preserving normal browser navigation and forms. Native Safari, iOS keyboard and VoiceOver still require device verification. See DESIGN.md section 27 and `design/ios-refresh/` for final tokens and verification evidence.

## ADR-034: Rebuild presentation around continuous reading and a stable application shell

- **Status:** Accepted (2026-09-06 explicit complete experience-layer refactor). Supersedes ADR-032's collapsed portal and ADR-033's grouped surface composition; no product capability is added.
- **Decision:** A navigation-only client AppShell wraps existing server-layout children. Following the user's desktop-only refinement, the desktop rail reveals from the left edge as an animated overlay, without moving content; close has a short grace period and returning cancels it. Keyboard access, Escape focus restoration and reduced motion are retained. Narrow screens keep their existing four bottom destinations and contextual links for Calendar/Search. Direct lab routes remain outside the shell. Records, queries and drafts remain owned by existing route components.
- **Writing:** Existing cancel/save controls move to the top writing toolbar. Open Moment, Append and Diary writers hide global exits so the new shell cannot bypass existing draft-confirmation paths. Saving, local commits, feedback timing and subsequent navigation remain unchanged.
- **Reading:** Remove nested cards and redundant padding, share system typography and semantic colors, and use quiet separators for record hierarchy. Calendar keeps its month/detail composition. The map keeps its existing Canvas algorithms and statistics contract; its mobile inspector becomes in-flow content with accessible close/focus restoration.
- **Boundary:** No schema, repository, query, extraction/proposal contract or raw record change. Safe-area CSS, touch targets, reduced motion and focus remain presentation concerns. Isolated test fixtures never touch the user's browser data. Screenshot review is followed by an independent correction pass and the existing production checks.
- **Tradeoff:** The shell and map details use solid materials instead of blur to preserve legibility and reduce visual noise. Full native iOS behavior cannot be established by Chromium emulation; device Safari/keyboard/VoiceOver verification remains a separate acceptance limit.

## ADR-035: Explicit production extraction reuses proposal-first local transactions

- **Status:** Accepted (2026-09-07, user confirmed Phase 15 and supplied the provider/model and compatible gateway).
- **Decision:** Add one source-owned review dialog to existing Moment reading surfaces and saved Diary details. Only a user Start action sends exact text and date/timezone context through a same-origin server Route Handler. Opening/restoring a review, saving originals and reconnecting never extract automatically.
- **Provider:** OpenAI Responses protocol, gpt-5.6-terra, medium reasoning, strict JSON Schema and store=false. The official host is the default; an explicitly configured compatible HTTPS gateway is supported server-side and identified by hostname in the existing provider provenance string. Client input cannot select URLs, models, prompts or tools. A gateway's internal model routing and data retention cannot be independently guaranteed by its compatible response.
- **Privacy:** No source IDs/fingerprints, children, photos, location metadata or unrelated history leave the browser. Keys stay in server environment variables; the adapter neither logs bodies nor stores original provider responses. Third-party processing still receives the deliberately selected text. Store=false is not a promise that all provider/gateway abuse-monitoring retention is disabled.
- **Integrity:** Exact source snapshots and the unchanged request key/unique indexes retain idempotency. Strict candidate/evidence validation precedes atomic successful Job + Proposal insertion. Accept/Correct/Reject use existing Phase 14.3 terminal review transactions, with current-source checks, manual priority and at most one Event per Proposal. Originals, LifeEvent model, v6 schema, Statistics and Map contracts remain unchanged.
- **Failure:** Offline, unconfigured, invalid output, refusal, timeout and rate-limit states are explicit and retry only on a user action; production never falls back to Fake. UI cancellation aborts waiting but cannot retract data already transmitted. Failed/processing Job lifecycle and durable background recovery remain unimplemented, rather than pretending a queue exists.
- **Scope:** Fake Lab remains available. No AI Chat, summary, sentiment, automatic extraction, new model, table, migration or account system. The `server-only` marker is the only new runtime dependency; native fetch supplies the provider call. Public paid-key deployments must use hosting-level access control, separate from same-origin validation.
- **Evidence:** See `docs/PHASE15_PRODUCTION_LIFE_EXTRACTION.md`, `design/phase15/`, API/provider tests and `e2e/production-extraction.spec.ts`.
