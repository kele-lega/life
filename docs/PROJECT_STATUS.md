# Project Status

## Current phase

Phase 10 - Calendar browsing is complete.

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

## Scope boundary

Calendar is a read-only, client-side view over independent Moment and Diary repositories. It derives recorded dates from active roots in one local-month UTC range per repository and reuses Timeline's batch child hydration only for a selected local day. Append and Attachment timestamps never mark dates, and Diary edits remain assigned to `createdAt`. The homepage still prioritizes quick recording and recent Moments. Search, tags, favorites, recycle bin UI, AI, Diary images, and Diary location UI remain later phases. Moment behavior is unchanged.

## Verification

- `npm run typecheck` passed
- `npm run lint` passed
- `npm test` passed: 16 files, 123 tests
- `npm run test:e2e` passed: 15 tests
- `npm run build` passed

## Known follow-up

Calendar month-state queries are bounded to the displayed month, but selected-day details currently load every root from that one day; a pathological bulk import with extremely many same-day records may later need day-level pagination. Local date boundaries follow the device timezone at query time; changing the operating-system timezone while the page remains open requires a reload or another Calendar interaction. Diary image attachments and all later browsing features remain intentionally deferred.
