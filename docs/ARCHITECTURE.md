# Architecture

## Scope

This project is a single-user, web-first, local-first private life record system. The core path is open, record, save, leave. This foundation phase intentionally contains no product UI, fake dashboard, Timeline, Calendar, AI, auth, sync, map, or health feature.

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

Original content is created and read locally without a network dependency. Diary persistence is introduced in its own Dexie migration and repository; Diary UI and editing behavior remain later phases. Future AI calls will go through a server-side Route Handler so secrets never enter the client bundle. AI failure must never block or roll back local saving.

## Technology choices

- Next.js App Router + React: one Web application and one future deployment boundary.
- TypeScript strict: explicit contracts at data and migration boundaries.
- IndexedDB + Dexie: offline persistence, transactions, Blob support, and schema versions.
- ESLint: Next.js Core Web Vitals and TypeScript rules.
- Vitest + Testing Library + fake-indexeddb: unit, component, and IndexedDB integration coverage.
- Playwright + Chromium: a separate real-browser baseline for critical persistence and permission flows.

No Redux, GraphQL, microservices, Redis, queues, or separate backend are introduced. React local state handles temporary UI state; Dexie owns persisted state. A state library can be reconsidered only when a concrete cross-page state problem exists.

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

Timeline, Calendar, Search, and Favorites are query views over normalized local entities, not copied records. AI metadata and daily summaries are rebuildable derived data linked to source IDs and source revisions.

Deletion writes `deletedAt` as a UTC timestamp. Normal queries exclude soft-deleted entities; the recycle bin queries them explicitly. Permanent cleanup is a later, user-visible action governed by the 30-day retention rule.

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
