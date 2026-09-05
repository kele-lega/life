# Data Model

This document separates the implemented physical schema from future logical models. Dexie v6 contains `Moment`, `MomentAppend`, Moment-owned `Attachment`, `Diary`, `LifeEvent`, `LifeExtractionJob`, and `LifeEventProposal`. Tags and the unrelated generic AI entities below remain design-only. The v2–v5 sections are historical schema snapshots.

## Phase 12 physical schema: LifeEvent (v5)

Version 5 adds only `lifeEvents`, with primary key `id` and indexes `[occurredOn+id]` and `[source.type+source.id]`. The previous four stores and all their indexes are inherited unchanged. This is a store-addition migration, without an `upgrade()` data transform, backfill, extraction, or edits to original records.

`LifeEvent` is a separate structured layer, never embedded in Moment/Diary:

- `id`: application UUID; callers reuse a submission's UUID and payload for retries.
- `origin: 'manual' | 'ai'`. Dexie v5 rows are manual; v6 permits only reviewed LifeEvent Proposals to create `ai` rows.
- `extractionProposalId?: EntityId`: absent on ordinary manual rows, required on accepted AI rows and corrected-manual rows. It is never stored as `null`.
- `source: null | { type: 'moment' | 'momentAppend' | 'diary'; id; contentFingerprint }`. A standalone manual event needs no source record. One source may have many events, including identical names.
- `category: 'activity' | 'learning' | 'creation' | 'place'`.
- `name`: required non-whitespace string, preserved exactly.
- `occurredOn`: valid Gregorian `YYYY-MM-DD` (years 0001–9999), independent of creation time.
- `timeZone`: valid named IANA timezone, including UTC; numeric offsets rejected.
- `timePrecision: 'day' | 'time' | 'interval'`.
- `startAt`, `endAt`: nullable canonical UTC ISO timestamps, including milliseconds and `Z`.
- `durationSeconds`: nullable nonnegative safe-integer seconds; zero and unknown/null are different.
- `metadata: Record<string, unknown>`: runtime constrained to JSON-compatible, finite, non-cyclic plain data, at most 16 levels deep and 16 KiB UTF-8; no Blob, undefined, function, Date or Infinity. Object key order is not significant for retry equality.
- `createdAt`, `updatedAt`, `deletedAt`: standard lifecycle; no edit/delete UI or generic patch API is added.

Time rules: a `day` event has no start/end instants (never fabricate midnight); a `time` event requires startAt and forbids endAt; an `interval` requires strictly increasing endpoints and derives elapsed seconds, rejecting conflicting supplied duration or subsecond duration. The event date equals the start instant's date in the stored timezone when startAt is present. Cross-midnight/DST intervals use real UTC elapsed time; they are not split into invented daily events.

The repository computes `sha256:text-v1:<hex>` from JSON arrays of exact original text (Moment), exact append text (MomentAppend), or title/body (Diary). Metadata-only changes do not alter this fingerprint. Normal reads expose a non-persistent `sourceStatus` (`unlinked`, `current`, `stale`); edited Diary content marks an event stale without overwriting or silently removing manual data. Source existence and active status (including an Append's parent) are checked transactionally. Missing/deleted sources suppress events in normal reads, but do not mutate their stored tombstones; restoration makes still-active linked events visible again. This LifeEvent-specific read-time rule qualifies the future cascade policy below (ADR-026).

`createManualLifeEvent` / `createManualLifeEvents` validate and add records in an atomic transaction; batch size is capped at 100. Same UUID plus equal validated payload returns the already committed record unchanged; conflicting payload or a tombstoned ID is rejected. A retry never refreshes an old fingerprint. An omitted ID means a new event, not deduplication by name/source. The caller must retain supplied IDs for retries.

`getLifeEvent`, `listLifeEventsPage`, and `listLifeEventsBySource` hide tombstoned events and inactive sources. Global pages default to 20 (max 100), ordered `occurredOn DESC, id DESC` by IndexedDB compound-key ordering. Reads scan chunks of 64, batch-check sources, and return an exclusive last-emitted cursor with one-row lookahead. Memory is bounded; scanning many hidden entries still has linear I/O cost. By-source reads return the matching source's active events through its compound index; they are not a global history API.

No confidence, health/emotion, value/unit, location, AI/device provenance, or visualization fields are introduced. `/lab/life-events` creates real, standalone manual records in this same local database, not a separate mock/test store. Such experimental data must be reviewed before any future analytics includes it.

## Life Statistics read contract

Life Statistics is a non-persistent domain read model over LifeEvent, not another table. Its default eligible set is:

- include final manual or AI events whose own `deletedAt` is null and whose source status is `unlinked` or `current`;
- exclude `stale` events, but retain their stored records unchanged;
- exclude events whose source is missing/soft-deleted, including an Append whose parent Moment is inactive;
- exclude LifeEvent tombstones.

All ranges are natural-date half-open intervals: `startDate <= occurredOn < endDate`. `occurredOn`, rather than `createdAt`, `startAt`, or an invented midnight, is the aggregation key. A null duration still increments `eventCount` and adds zero duration; zero is a known zero and also adds zero. Duration totals use integer seconds and reject safe-integer overflow.

Summary results always return the four categories in this order: `activity`, `learning`, `creation`, `place`, including zero-valued categories. Time-series results are sparse and ascending: absent periods are omitted rather than materialized. Day buckets use the natural date, week buckets begin Monday, and month buckets begin on day 1. Bucket bounds describe their complete calendar period and may extend outside a partial requested range. A future cross-day interval is attributed wholly to its stored `occurredOn`; Phase 12.5 does not split it or fabricate instants.

The model supports the drill hierarchy `category -> name -> LifeEvent -> optional source record`: category and exact name remain on each event, and source retains type/ID/fingerprint. The Life Visualization phase adds a non-persistent exploration read model without changing this stored model. It returns exact category/name and source-kind aggregates for the complete requested range, plus the newest 160 eligible event projections by default (500 maximum) for temporal affinity and future record drill-down. A projection includes event identity, natural/time fields, duration and source type/ID, but never exposes `contentFingerprint`, stale status, presentation color or coordinates.

Exploration uses the same conservative eligibility as Summary and Time Series. Name groups use the exact stored name and remain category-scoped, so identical names in different categories do not merge. Source-kind groups distinguish `independent`, `moment`, `momentAppend` and `diary` without confusing `origin: manual` with source provenance. Their first/last dates are calculated from the full range, not estimated from the bounded event projection.

The `/lab/life-events` route is only a direct development entry, not a data namespace. Its events are ordinary real LifeEvents and there is no `isLab` field or route-dependent business rule. Before connecting a formal visualization to personal data, manually review and remove intentionally generated test records; because they are deliberately indistinguishable from ordinary events, cleanup cannot safely be automated from route history.

## Phase 3 physical schema

Dexie database version `3` contains:

- `moments`: primary key `id`; indexes `createdAt`, `updatedAt`, `deletedAt`, `isFavorite`
- `momentAppends`: primary key `id`; indexes `momentId`, `createdAt`, `updatedAt`, `deletedAt`
- `attachments`: primary key `id`; indexes `[ownerType+ownerId]`, `ownerId`, `createdAt`, `updatedAt`, `deletedAt`

Attachments currently allow only `ownerType: "moment"`. Their binary content is stored directly as an IndexedDB `Blob`; no URL, upload, EXIF, OCR, thumbnail, or AI fields are persisted. A Moment must contain non-whitespace `originalText`, so Phase 3 supports text-only and text-plus-image records, not image-only Moments. Moment and its attachments are created in one Dexie transaction; a failed attachment write rolls back the entire creation.


## Phase 4 physical schema

Dexie database version `4` adds the `diaries` table:

- `diaries`: primary key `id`; indexes `createdAt`, `updatedAt`, `deletedAt`, `isFavorite`

Diary records are independent of Moments and currently have no attachments, tags, or favorite operations. Diary `body` must contain non-whitespace content at creation and update; `title` is optional and is stored exactly as entered, including an empty string when omitted. The application never auto-generates a title. Diary content editing belongs to the current Diary phase.

## Timeline read model

`TimelineItem` is a non-persistent discriminated view model assembled from the independent Moment and Diary tables. There is no `timelineItems` Dexie table or schema migration. Timeline roots exclude records with a non-null `deletedAt`, and active Moment Appends and Moment-owned Attachments are displayed beneath their owning Moment rather than as root items. The current Attachment owner implementation remains `ownerType: "moment"`; Diary images are not implemented.

## Calendar read model

Calendar is also non-persistent and adds no table or schema migration. A local month or local date is converted with the device timezone into a UTC `[startInclusive, endExclusive)` range, then active Moment and Diary roots are read through their existing `createdAt` indexes. Month state is the set of local date keys containing at least one active root. MomentAppend and Attachment timestamps never create Calendar root dates. Selected-day details use the same `TimelineItem` hydration boundary, so active Moment children remain nested while Diary identity and `createdAt` remain unchanged.


## Phase 1 physical schema

Dexie database version `2` contains exactly two tables:

- `moments`: primary key `id`; indexes `createdAt`, `updatedAt`, `deletedAt`, `isFavorite`
- `momentAppends`: primary key `id`; indexes `momentId`, `createdAt`, `updatedAt`, `deletedAt`

The preceding version `1` was the empty foundation schema. Future entities must be introduced with explicit higher versions and migration tests; no unused tables are created in Phase 1.


```ts
type EntityId = string; // application-generated UUID
type Timestamp = string; // UTC ISO 8601
```

Every main entity has `id`, `createdAt`, `updatedAt`, and `deletedAt: Timestamp | null`. IDs are stable global identities, never IndexedDB auto-increment values. Times are stored in UTC and displayed in the user's local timezone. Relationships store IDs rather than copied entities.

## Core entities

### Moment

A quick-record root entity:

- `id: EntityId`
- `originalText: string` - immutable after submission; must contain at least one non-whitespace character. V1 Moments are text-only or text-plus-image; image-only Moments are not supported.
- `isFavorite: boolean`
- `location: LocationMetadata | null`
- `createdAt`, `updatedAt`, `deletedAt`

No repository may expose an update operation for `originalText`. Supplemental text is a `MomentAppend`.

### MomentAppend

An immutable addition to a Moment:

- `id: EntityId`
- `momentId: EntityId`
- `text: string`
- `createdAt`, `updatedAt`, `deletedAt`

### Diary

An independently authored long-form record:

- `id: EntityId`
- `title: string`
- `body: string`
- `isFavorite: boolean`
- `location: LocationMetadata | null`
- `createdAt`, `updatedAt`, `deletedAt`

PRODUCT.md only makes Moment text immutable, so Diary editing remains allowed unless a later product decision says otherwise.

### Attachment

An independent binary original, currently an image:

- `id: EntityId`
- `ownerType: 'moment'`
- `ownerId: EntityId`
- `kind: 'image'`
- `blob: Blob`
- `fileName`, `mimeType`, `size`
- `width: number | null`, `height: number | null`
- `createdAt`, `updatedAt`, `deletedAt`

Images are not embedded in text. This preserves future export, album, map, and image-AI options.

## Tags and relations

`Tag` contains `id`, `name`, `normalizedName`, `createdAt`, `updatedAt`, and `deletedAt`. User tags are optional. AI tags are stored in `AiMetadata`, not mixed with manual tags.

Many-to-many content tagging uses a `ContentTag` relation with `id`, `contentType`, `contentId`, `tagId`, and common timestamps. A relation entity is easier to sync than arrays embedded in content.

## AI-derived entities

### Historical Phase 14.1–14.2 Life Intelligence contract

Phase 14.1 introduces TypeScript contracts only. Dexie remains v5 and the physical `LifeEvent` shape remains manual-only. No extraction job, proposal or AI-origin event is written to IndexedDB.

`LifeExtractionJob` describes a future extraction attempt over one exact source fingerprint. It carries a source reference, natural-date/timezone interpretation context, extractor name/version/schema version, lifecycle status, attempt count, timestamps and a non-content error code. Its contract statuses are `queued`, `processing`, `succeeded`, `failed` and `superseded`.

`LifeEventProposal` describes one validated candidate from a job. It contains the exact source fingerprint, a stable candidate key, existing LifeEvent domain fields, source-text evidence offsets and a review state. Review states are `pending`, `accepted`, `corrected`, `rejected` and `superseded`; terminal decisions cannot be silently changed. Pending/rejected/superseded proposals are never statistics data.

`LifeEventMaterialization` is a future insert command rather than the current stored entity. Accept produces an `ai` command; correction produces a `manual` command with user-supplied fields. Both retain `extractionProposalId`. The repository contract is insert-only, checks manual conflicts and requires the proposal transition plus optional event insertion to be atomic. Implementing this command physically requires a separately approved schema migration.

The fake extractor does not persist source text, jobs or proposals. It emits deterministic, validated candidates for supported development phrases and returns an empty successful result for unsupported text. It never turns day-part wording into fabricated `startAt` or `endAt` values.

Phase 14.2 exercises these contracts through `/lab/life-extraction`. Its `LifeExtractionJob`, proposals and materialized results live only in a component-owned in-memory repository. Refresh discards all of them, and the lab never reads or writes the physical LifeEvent table. The route's synthetic Moment source reference is contract context only and does not create or modify a Moment. Consequently, accepted/corrected lab output is not eligible for Statistics or Life Map and is never presented as persisted user data.

### Phase 14.3 Life Intelligence persistence (v6)

Dexie v6 supersedes the temporary Phase 14.2 storage behavior and adds two stores without an `upgrade()` transform or backfill:

- `lifeExtractionJobs`: primary key `id`; unique `requestKey`; `createdAt`; sparse record-source index `[input.source.type+input.source.id]`.
- `lifeEventProposals`: primary key `id`; `jobId`; unique `[jobId+candidateKey]`.
- `lifeEvents` retains its v5 keys and adds the sparse unique `extractionProposalId` index.

Existing v5 LifeEvents remain byte-for-byte unchanged. Ordinary manual creation still omits `extractionProposalId`, so multiple ordinary manual rows remain outside the sparse unique index. No Job, Proposal, or AI Event is generated by migration.

`LifeExtractionJob.input` is discriminated. A `scratch` job stores the exact explicit Lab text plus its versioned fingerprint, capped at 64 KiB. A `record` job stores only source type, source ID, and source fingerprint; it does not duplicate Moment/Append/Diary text. Jobs also store natural-date/timezone context, extractor name/version/schema version, status, attempt count, timestamps, and a non-content error code. Provider/model remain null in Phase 14.3 and no provider response is stored. A unique SHA-256 `requestKey` covers input identity, context, and extractor descriptor, so exact retries recover the first Job and Proposal set.

`LifeEventProposal` stores one immutable validated candidate, evidence offsets, candidate key, review state, optional corrected candidate, optional materialized Event ID, and timestamps. `accepted`, `corrected`, `rejected`, and `superseded` are terminal. The only state changes are from `pending`; specifically, accepted-to-corrected is not supported. Accepted and corrected Proposals reference exactly one Event in both directions. Rejected and superseded Proposals reference none. Statistics never reads this table.

Accept atomically creates `origin: 'ai'` plus `extractionProposalId`. Correct atomically creates `origin: 'manual'` plus `extractionProposalId` from the user's corrected candidate. Direct manual creation remains `origin: 'manual'` with the field absent. Review never updates or removes an existing manual Event. Source validity and exact manual conflicts are checked inside the same Dexie transaction as Event insertion and Proposal resolution.

Proposal source status remains a non-persistent read view: `scratch`, `current`, `stale`, or `missing`. A stale/missing record source blocks Accept and Correct but permits Reject; no stale Job, Proposal, or Event is deleted. An accepted record Event continues to use the existing LifeEvent fingerprint eligibility, so later Diary edits make it stale and remove it from Statistics without rewriting either record.

`/lab/life-extraction` now persists explicit fake-extractor Jobs and reviews. Refresh restores the latest scratch Job, all Proposals, terminal decisions, and materialized Events. Accept/Correct creates real LifeEvents that can affect Statistics and Life Map; the page states this before review. There is no `isLab`, route-dependent data rule, provider call, automatic extraction, worker, or original-record mutation.

### AiMetadata

A rebuildable result for a source version:

- `id: EntityId`
- `sourceType: 'moment' | 'diary'`, `sourceId: EntityId`
- `sourceUpdatedAt: Timestamp`
- `status: 'pending' | 'processing' | 'succeeded' | 'failed'`
- `categories`, `people`, `places`, `activities`, `topics`, `tags: string[]`
- `model: string | null`, `schemaVersion: number`
- `errorCode: string | null`
- `createdAt`, `updatedAt`, `deletedAt`

AI output never writes back into Moment, append, Diary, or Attachment. Offline work remains pending. A retry is idempotent and must not replace metadata for a newer source revision.

### DailySummary

A user-opened, rebuildable summary:

- `id: EntityId`
- `localDate: string` (`YYYY-MM-DD`)
- `timeZone: string` (IANA timezone)
- `summaryText: string`
- `sourceRefs: { type: 'moment' | 'diary'; id: EntityId; updatedAt: Timestamp }[]`
- `status`, `model`, `schemaVersion`
- `createdAt`, `updatedAt`, `deletedAt`

A changed source set invalidates the summary and allows regeneration. It must describe events, not score or coach the user.

## Location value

```ts
interface LocationMetadata {
  city: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
}
```

Location failure never blocks saving. V1 stores metadata but has no map entity or UI. Coordinates are optional and are never rendered in the homepage metadata label. Manual `placeName` is stored exactly as entered.

## Relationships and deletion

```text
Moment 1 --- * MomentAppend
Moment/Diary/MomentAppend 1 --- * Attachment
Moment/Diary * --- * Tag (through ContentTag)
Moment/Diary 1 --- * AiMetadata versions
DailySummary * --- * Moment/Diary source versions
```

Deleting a root entity soft-deletes its appends, attachments, relations, and derived records in one transaction. Restore semantics must preserve independently deleted children; the implementation should use a deletion batch marker or an explicit transaction rule. Thirty days means eligible for a user-visible permanent cleanup, not automatic deletion without a confirmed product decision.

## Expected indexes

Expected indexes include `createdAt`, `updatedAt`, `deletedAt`, `isFavorite` on roots; `momentId` and `createdAt` on appends; `[ownerType+ownerId]` on attachments; `normalizedName` on tags; `[contentType+contentId]` and `tagId` on relations; `[sourceType+sourceId]` and `status` on AI metadata; `[localDate+timeZone]` on summaries. Add indexes for defined queries, not hypothetical ones. V1 search may scan local normalized text until scale justifies another index.

## Export and migration

A future logical export should include a `schemaVersion`, JSON records, and original attachment files. Internal keys and Blob URLs must not become the export protocol. Every Dexie version change requires an upgrade integration test.
