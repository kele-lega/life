# Phase 21 Android App Shell

Status: Android First shell, native static export and Dexie persistence on the static runtime are implemented. Camera/Photos/Location/Haptics, Cloud Sync and SQLite are not included.

## Runtime

- Web/PWA: unchanged Next.js Node host.
- Android: Capacitor 8 WebView, origin `https://localhost`, `webDir: out`.
- Application ID / future iOS bundle ID: `app.kelelega.life`.
- Production `server.url` is not set. Debug-only `CAPACITOR_DEV_SERVER_URL` can target a LAN Next server.

## Native export

`npm run native:web` first proves `LIFE_NATIVE=1` fails while `/api` and `/diary/[id]` still exist, scans for any other Route Handler or dynamic segment, moves the known trees aside, builds with `output: "export"` and `trailingSlash: true`, asserts the route set, then restores the tree.

Verified static routes: `/`, `/diary`, `/diary/new`, `/diary/open`, `/timeline`, `/calendar`, `/search`, `/life`, `/account`, lab pages, icons and manifest. `/api/*` and `/diary/[id]` are absent from `out/`.

## Product reuse

The App loads the same client components and Dexie v6 repositories. Diary detail uses `diaryHref()`: web `/diary/:id`, native `/diary/open/?id=`. AI extraction and cloud OTP UIs remain; their hosted calls fail open. Local `.life.zip` export/restore is unchanged.

## Shell

- StatusBar: non-overlay, light/dark surface colors.
- Keyboard: resize none; existing `visualViewport` writer.
- Back: dialog / photo / Quick Moment cancel / Append cancel / Diary cancel / Capacitor `canGoBack` / `minimizeApp()`.
- Native web build does not register the PWA Service Worker.

## Verification

- Native static export assertion in `scripts/build-native-web.mjs`, including the unexcluded `LIFE_NATIVE=1` failure and a filesystem scan of Route Handlers / dynamic segments.
- `e2e/phase21-native-static.spec.ts` against `out/` with no Next server.
- Existing web typecheck, lint, unit tests, e2e and production build remain required.

## Follow-up

Physical Android Studio install/run, iOS project, Camera/Photos plugins, and a native API host for Cloud/AI are later phases. Native IndexedDB is not shared with the browser origin.