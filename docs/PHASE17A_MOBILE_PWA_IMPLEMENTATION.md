# Phase 17A Mobile PWA Implementation

Phase 17A improves the existing Web/PWA client for daily phone use. It does not change the product information architecture, Dexie v6, any of the seven business tables, repositories, Cloud Foundation, AI contracts or record semantics.

## Delivered boundary

- Quick Moment becomes a full-screen layer below 768px. It follows the visual viewport as the software keyboard opens, respects all iOS safe-area insets, isolates background scrolling and keeps Cancel/Save at the top.
- Location is now requested only after the user chooses Add Location. A denied or unavailable location never blocks text or attachment persistence.
- Gallery selection remains multi-image. A separate `capture="environment"` input provides the browser camera path. Both create the same existing Attachment Blobs inside `createMomentWithAttachments`.
- Saved Moment and Timeline photos open in a focus-restoring full-screen viewer. Blob ownership, URL cleanup and data storage remain with the existing readers.
- The app manifest, 192/512px install icons, 180px Apple touch icon and Apple standalone metadata make the site installable. The Service Worker warms root application pages and build assets, serves those shells when the network is unavailable and explicitly excludes all `/api/*` traffic.
- Account/export/isolated-restore controls stack into full-width phone actions without changing archive or restore behavior.

## Privacy and storage

The Service Worker cache contains route shells, RSC presentation responses and build assets. It does not contain Moment/Diary records or Attachment Blobs, which remain in the selected Dexie library. It does not intercept AI extraction, OTP, session, cloud backup or object-storage APIs. The browser receives a best-effort persistent-storage request; export and cloud backup remain the durable portability paths.

## Acceptance evidence

`e2e/phase17-mobile.spec.ts` covers 390px and 430px viewport geometry, 44px actions, reduced motion, the camera capture attribute, explicit location entry, local photo viewing, offline Moment/image/Append creation and offline Diary creation followed by repository readback. Screenshot evidence is stored under `design/phase17a/`.

Native iOS Safari keyboard, standalone-mode storage eviction and VoiceOver still require physical-device verification. Phase 17A does not claim Capacitor/Swift gesture parity or background execution.
