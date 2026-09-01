# Project Status

## Current phase

Phase 9 - Unified Timeline is complete.

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

## Scope boundary

Timeline is a read-only, client-side view over independent Moment and Diary repositories. Active roots are merged by `createdAt` descending with an ID tie-breaker; Moment Appends and Moment-owned images are batch-loaded for the current page and remain nested under their Moment. The homepage still shows only recent Moments as its primary history surface. Diary images, Diary location UI, Calendar, Search, tags, favorites, recycle bin UI, and AI remain later phases. Moment behavior is unchanged.

## Verification

- `npm run typecheck` passed
- `npm run lint` passed
- `npm test` passed: 12 files, 108 tests
- `npm run test:e2e` passed: 12 tests
- `npm run build` passed

## Known follow-up

The Timeline uses a simple two-source cursor and a fixed 20-root page size. Interleaved source boundaries, equal timestamps, owner isolation, and UI duplicate protection are covered, but a pathological import containing a very large number of roots with the exact same millisecond timestamp can still require reading that equal-time block before applying the ID tie-breaker. Diary image attachments and all later browsing features remain intentionally deferred.
