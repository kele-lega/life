# Phase 16B.1.5 - Real Cloud + Android Acceptance

Date: 2026-09-16. Phase 16B.2 live pull / multi-device merge is not started.

This phase proves the 16B.1 replica stack against real test infrastructure and the Android shell. Local save stays first. Tests used the configured test email and synthetic `synthetic-16b15-*` records only. The personal browser `life` working library was not opened as a restore target.

## Android runtime (emulator `life-api36`)

APK: `android/app/build/outputs/apk/debug/app-debug.apk`  
Package: `app.kelelega.life`  
WebView origin: `https://localhost` (no production `server.url`)  
Baked API origin: `https://life-kelelega.netlify.app`

Stamp `synthetic-16b15-1789492746761`. Local/offline runtime: 26/26 checks passed, including Dexie v7 (`version=70`), outbox sidecar, native diary `/diary/open/?id=`, Force Stop persistence, Android back, keyboard/`visualViewport`, and `.life.zip`.

Camera / Photos / Location / Haptics were not used.

## Replica API transport and auth

Web Cookie / CORS / CSRF is unchanged. `https://localhost` is not on the Web allowlist.

| Check | Local `http://127.0.0.1:3100` | Production `https://life-kelelega.netlify.app` |
| --- | --- | --- |
| `GET /api/replica/account` no auth | 200 `{configured:true,account:null}` | 200 `{configured:true,account:null}` |
| `POST /api/replica/mutations` `Origin: https://localhost` no Bearer | 403 `origin_rejected` | 403 `origin_rejected` |
| Garbage Bearer snapshot / mutations + `X-Life-Account` | 401 `unauthorized` | 401 `unauthorized` |

The handler maps expired/garbage Bearer `verifyAccessToken` failures to `401 unauthorized` and still ignores client `accountId`. Native magic-link access tokens can be exchanged at `POST /api/replica/auth/email/callback`. Unit tests: `src/features/replica/server/foundation.test.ts` (10/10).

Default Supabase hosted mailer sends a Magic Link, not a 6-digit OTP. Gmail wrapping (`https://www.google.com/url?q=`) and `redirect_to=http://127.0.0.1:3100` make phone-open fail. The drill unwraps the Google wrapper and accepts a recovered provider session (`CLOUD_TEST_ACCESS_TOKEN` or `.scratch/replica-session.json`). Admin `generateLink` is not available with the publishable `CLOUD_AUTH_KEY`.

## PostgreSQL replica schema and roles

- `004-replica.sql` is applied (`schema_migrations` includes version 4).
- `npm run cloud:replica-accept` printed `replica_permissions_ok`.
- App role can read replica tables; worker cannot. App cannot `UPDATE`/`DELETE` the mutation log. Backup delete remains denied for the app role.

Remote TLS no longer depends on a missing `sslrootcert=` path. `sql.ts` strips `sslmode`/`sslrootcert` from the URL and verifies with the bundled Supabase Root 2021 CA (`src/features/cloud-backup/server/provider-ca.ts`, `infrastructure/cloud/prod-ca-2021.crt`). Certificate verification stays on.

## Real Auth / Storage / fault drill

`npm run cloud:replica-drill` against local Next printed `replica_drill_ok` using a recovered test-account session (no new email click). The drill covered:

- Bearer callback verify
- localhost CSRF 403 without Bearer
- writer register
- idempotent mutation replay
- mutation conflict 409
- `blob_pending` before SHA-256
- finalize-before-PUT failure
- SHA-256 finalize then attachment mutation
- delete tombstone
- promote / old-writer fence 409
- expired/garbage token 401
- isolated restore into `life-restore-*` without writing the working `life` library

## Android outbox -> production replica

After injecting `life-replica-session-v1` into the emulator WebView (token not logged) and promoting the device writer:

- 28 previously pending outbox mutations from the offline runtime acked
- 10 pending blobs became `verified` after server SHA-256
- New local save `synthetic-16b15-loop-*` stayed local-first, entered the outbox, then acked
- Production snapshot contained the new moment plus 18 synthetic moments and 11 verified objects
- Final Dexie state: pending 0, acked 29, blobPending 0, blobVerified 10, epoch 3, not fenced

Android talks to the baked HTTPS origin over Bearer. Web CSRF/Cookie boundaries were not changed.

## Netlify

`netlify.toml` build command is `npx next build --webpack`. Next 16 Turbopack hashed `pg` / `@aws-sdk/client-s3` aliases are not resolvable in the Netlify function zip. `CLOUD_APP_ORIGIN` on Netlify is `https://life-kelelega.netlify.app`. `CLOUD_OBJECT_ENV=dev` for this test project.

Production deploy `6aa99014a14b701a41789301` now serves the webpack server bundle, 401 Bearer mapping, and magic-link callback. Valid test Bearer snapshot after deploy: 19 synthetic moments, 11 verified objects.

## Phase 16A Backup

Unchanged. Replica tables, object prefix `{env}/replica/...`, and this Android run do not replace `.life.zip` or cloud backup snapshots. Export of `.life.zip` still works offline from Account.

## Not done

- Phase 16B.2 live pull / concurrent multi-device merge
- Camera / Photos / Location / Haptics
- SQLite
- New AI features
- Cloud-primary mode
- Committing `.env.local`, OTP, magic links, or access tokens
