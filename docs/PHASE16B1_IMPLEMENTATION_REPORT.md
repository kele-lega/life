# Phase 16B.1 - Durable Cloud Replication Implementation Report

Status: implemented per the confirmed 16B.1 design. Phase 16B.2 live pull / multi-device merge is not started.

## Scope

- Dexie v7 sidecar stores `replicaMutations`, `replicaState`, and `replicaBlobs` live in the same `LifeDatabase`. The seven business tables and v6 indexes stay byte-compatible.
- Business writes and outbox enqueue share one IndexedDB transaction. Local save never waits on the network. Push failure cannot roll back a committed local record.
- Mutations are identified by a stable `mutationId` plus payload SHA-256. Timeouts, retries, and duplicate submits cannot create duplicate entities.
- PostgreSQL `replica_*` tables, an immutable mutation log, RLS, and object prefix `{CLOUD_OBJECT_ENV}/replica/{account}/{attachmentId}/{uuid}` are separate from 16A backup tables and `{env}/backup/...` objects.
- Attachment metadata is stored in PostgreSQL. Blobs are marked replicated only after the server re-reads the object and verifies SHA-256.
- Soft delete / restore for existing Moment, Append, and Attachment repository paths are explicit after-image mutations.
- Web keeps Cookie / CORS / CSRF. Native uses a baked HTTPS origin, Supabase access token, and Bearer auth. `https://localhost` is not added to the Web allowlist. The server derives account from the verified token or session and never trusts a client `accountId`.
- Disaster restore writes a new isolated library. Promote raises the writer epoch and fences the previous writer with `409 fenced`. The old device can still read local data.
- Phase 16A Backup format remains `dexieVersion: 6` and captures only the seven business tables.

Not done: cloud-primary mode, save-waits-for-server, SQLite, Camera / Photos / Location / Haptics, new AI features, collaboration, or 16B.2 merge.

## Main files

| Area | Path |
| --- | --- |
| Dexie v7 sidecar | `src/lib/db/client.ts` |
| Outbox / backfill | `src/features/replica/local/outbox.ts` |
| Fail-open push | `src/features/replica/local/push.ts` |
| Isolated restore | `src/features/replica/local/restore.ts` |
| Transport / Native auth | `src/features/replica/client/` |
| Replica API | `src/app/api/replica/[...path]/route.ts`, `src/features/replica/server/` |
| PostgreSQL | `infrastructure/cloud/004-replica.sql` |
| Repository enqueue | Moment, Diary, Attachment, LifeEvent, Intelligence repositories |
| Account UI | `src/features/cloud-backup/components/account-page.tsx`, `src/features/replica/components/` |

## Done-when

| Check | Result |
| --- | --- |
| v6 to v7 lossless | Pass. `src/lib/db/client.test.ts` upgrades v1-v6; originals, Blobs, tombstones, and intelligence rows stay unchanged and sidecar starts empty. |
| Local tx + outbox atomic | Pass. Same IndexedDB transaction; an outbox throw rolls back the business row. |
| Retry after disconnect / crash | Pass. Failed push keeps local rows and retries pending mutations. Duplicate receipts are idempotent. |
| Mutation idempotency | Pass. Same mutationId+payload returns the original commitSeq; a different payload is `mutation_conflict`. |
| Blob SHA-256 | Pass. Attachment mutations stay `blob_pending` until the server re-reads and verifies bytes. |
| Delete / restore | Pass. Existing soft-delete and restore paths enqueue explicit after-images. |
| Old-device fence | Pass. After promote, the old writer/epoch receives `409 fenced` and local data remains readable. |
| Isolated new-device restore | Pass. Restore writes `life-restore-*` and does not overwrite the working library. Missing images warn instead of clobbering. |
| Phase 16A Backup unchanged | Pass. Archive `dexieVersion` stays 6 and sidecar tables are not captured. |

## Quality gates

- typecheck: passed, including tsconfig.cloud.json.
- lint: passed, zero warnings.
- unit: 53 files, 383 tests passed.
- e2e: 76 passed (5.1m), including patched Dexie v7 and 16A sidecar-skip restore cases.
- build: passed. Web build includes /api/replica/[...path] as a server route.
- native-static: passed (2 tests). Native static export excludes all /api routes, including replica, and still records Moment image / Append / Diary offline.

## Boundaries

- Native OTP may omit a browser Origin; replica auth paths allow a missing Origin, while `https://localhost` cookie CSRF against mutations remains rejected. Native blob PUT sends base64 with `dataType: file`.
- Diary and LifeEvent still have no dedicated repository delete APIs; historical tombstones are covered by backfill.
- 16B.1 does not live-pull into the current working library. Becoming the cloud writer is an explicit restore/promote action.
- Real SMTP, restricted PostgreSQL, Supabase Storage, and a physical Android replica drill still need configured-provider acceptance. Automated tests use PGlite and storage adapters.
- Development and Production replica data must stay isolated through `CLOUD_OBJECT_ENV` and separate databases. Tests use synthetic data only.

Stop here. Do not start Phase 16B.2.
