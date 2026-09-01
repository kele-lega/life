# Data Model

This document defines the target logical model. Phase 3 has now implemented the `Moment`, `MomentAppend`, and Moment-owned `Attachment` tables. Other entities remain design-only and must be added in their own feature phases through Dexie migrations.

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
