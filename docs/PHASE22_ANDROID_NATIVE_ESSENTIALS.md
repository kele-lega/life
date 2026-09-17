# Phase 22 Android Native Essentials

Status: implemented 2026-09-16. Phase 16B.2 live pull / multi-device merge is not started.

Goal: make Android the primary daily recording device without changing local-first Dexie, Attachment semantics, Phase 16A Backup, or Web Cookie/CSRF/CORS.

## 22A Native Auth

Replica `POST /api/replica/auth/email/start` calls `auth.start(email, { emailRedirectTo: false })`. Omitting the redirect lets the hosted mailer send a numeric OTP instead of a Magic Link that the APK cannot open.

`/api/cloud` start is unchanged and still passes `config.origin` for Web Magic Link. Native verify already stores `{ accountId, email, accessToken, refreshToken, expiresAt }` in `life-replica-session-v1`. Push refreshes a soon-expiring native token; refresh or 401 never rolls back local records.

Web CSRF still requires `Origin === CLOUD_APP_ORIGIN`. `https://localhost` is not on that allowlist. Replica auth paths continue to allow a missing Origin because CapacitorHttp is not a browser.

## 22B Camera + Photos

`src/lib/native/camera.ts` wraps `@capacitor/camera`. Quick Moment calls the adapter on native and keeps hidden file inputs on web. Captures become `File` objects and enter `createMomentWithAttachments`. Diary stays image-free. Dexie schema and Attachment business semantics are unchanged.

Cancel/deny returns no files and does not block typing or later save.

## 22C Location + Haptics

Location still starts only from “添加位置”. Native GPS is a one-shot `getCurrentPosition`. Reverse geocode on Android uses `hostedApiOrigin()` (`NEXT_PUBLIC_LIFE_CLOUD_API_ORIGIN`) over CapacitorHttp, not relative `/api/location/reverse` (that 404s in the static APK). Deny/fail returns empty metadata; save continues.

`StatefulButton` calls `confirmSaveSuccess()` only after a real successful action. Validation failure and rejection do not vibrate.

Android permissions: `CAMERA`, coarse/fine location, `VIBRATE`. Camera and GPS hardware are not required.

## Quality gates

Run after each subphase and after the whole phase:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- `npm run native:web` / `npm run test:native-static`

## Android device checklist

Use only the configured test email and synthetic records. Do not open the personal `life` working library.

1. Request numeric OTP from Account on the APK; enter the code; Replica session exists; local save still works offline.
2. Expire or clear the session: local records remain; Replica push pauses until login.
3. Add gallery image and camera photo to a Moment; both persist locally and enqueue replica blobs.
4. Tap 添加位置, allow once, city or coordinates appear; deny still saves the Moment.
5. Save Moment, Append, and Diary: one success haptic; no haptic on validation failure.

Device results are recorded at install time; this document is the checklist, not a substitute for the APK run.

## Not in this phase

Phase 16B.2, SQLite, new AI, background continuous location, Push Notification, iOS Xcode, weakening Web CSRF.
