# Architecture Decision Records

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
