# Homepage refinement evidence

2026-09-02. This is a refinement of UI-1, not UI-2 or a product feature.

## Decisions

Preserve-mode editorial notebook: DESIGN_VARIANCE 6, MOTION_INTENSITY 2, VISUAL_DENSITY 3. Follow the user's requested warm paper and system fonts rather than the skill's marketing-page defaults. No hero, stock illustration, added navigation, cards, counters, truncated originals, or automatic input flow was introduced.

- Keep `#FAF9F6` paper and the existing dark surface.
- Increase date numeral weight through local Georgia at 48px desktop / 40px mobile, with smaller Chinese date units and a secondary weekday. Accessible full date and local-day updates remain unchanged.
- Add a fine invitation underline with hover feedback. Keep the existing click-to-expand, focus, cancellation and save behavior.
- Make recent headings secondary to user text. Use system sans-serif at 17px desktop / 16px mobile with generous leading for Moment and Append; do not alter original content.
- Use the fixed empty message "还没有留下片段。".
- Remove the footer-like rule and right alignment from More. Links remain in their existing order, at least 64x48px, with natural wrapping.
- Use one warm-red action fill `#A94E40`, 5.45:1 contrast with white. Focus/error remain accessible variants of the same red family. No external font or package.

## Evidence

`desktop-empty-*`, `desktop-records-*`, `desktop-writing-*`, `mobile-records-*`, `mobile-writing-*`, and `records-{390,430,768}-*` are actual Chromium captures from isolated E2E contexts. Desktop viewport is 1440x1024, mobile baseline is 390x844, device scale factor 1; full-page capture heights depend on content. Both light and dark were visually inspected, including 430px and 768px layouts. No page-level horizontal overflow at the tested widths. Original text occupies the full mobile reading column. The black image tiles are the existing 4x4 SVG fixture, not real photography or broken images. Next's development indicator is not application UI.

Tests cover label/focus, original multiline content, manual place, images, Append, refresh recovery, 44px targets, long text and URL reflow, and unsaved cancellation. No claims of physical mobile keyboard testing, full screen-reader compliance, or Lighthouse scores (Lighthouse is not installed).

## Commands

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 19 files / 143 tests.
- `npm run test:e2e`: passed, 20 tests. Initial server start failed with the already observed generated-file error; retry passed.
- `npm run build`: failed, Windows `UNKNOWN`, errno `-4094`, opening `.next/server/pages-manifest.json`. Compilation/TypeScript/static generation succeeded, but the command exits 1. Root cause not established; do not report completion.

Only homepage presentation and its tests changed. Repositories, data structures, Dexie and Timeline/Calendar/Search queries remain unchanged. Previous workspace changes were retained.
