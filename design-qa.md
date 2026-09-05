# UI-1 homepage design QA

Date: 2026-09-02. Scope: homepage only. Visual QA and engineering acceptance are separate; the production build remains blocked.

## Sources and evidence

- Source truth: `D:/code/life/DESIGN.md`, `D:/code/life/design/ui-v2/reference-light.png` (1512 x 1040), and `D:/code/life/design/ui-v2/reference-dark.png` (1517 x 1037).
- Implementation: `D:/code/life/design/ui-v2/verification/ui-1/desktop-empty-{light,dark}.png`, `desktop-records-{light,dark}.png`, `desktop-writing-{light,dark}.png`, `mobile-records-{light,dark}.png`, and `mobile-writing-{light,dark}.png`.
- Actual Chromium viewport: desktop 1440 x 1024; mobile 390 x 844, device scale factor 1. Full-page capture height grows with content; the expanded desktop capture is 1440 x 1193. Additional automated widths: 320, 430, 768.
- The source is a scaled two-panel board with surrounding canvas, not a 1:1 browser capture. Comparison uses each panel's content hierarchy, not the board margins or pixel-diff scores. DESIGN.md's explicit dimensions and product semantics take priority.
- Reference and rendered captures were opened together in the same comparison inputs for light and dark desktop, mobile reading, and expanded desktop writing. Empty and long-writing states were also opened separately. Full-size desktop editor and mobile reading captures make labels, focus, spacing, metadata, and Appendix text readable; separate cropped regions were not needed for this typography/layout review.
- States/content are not identical: the reference has several historical records and lake photographs; browser evidence has one newly saved multiline Moment, a manual place, two existing SVG image fixtures, and an Append. Writing captures contain a short draft with keyboard focus. No pixel-perfect or photo-fidelity claim is made.

## Findings and comparison history

1. [P2, fixed] The inherited quick-record centering displaced the invitation relative to the main text column. The homepage scope now resets `place-items: normal`. Post-fix empty and populated captures show the invitation aligned with the reading column; mobile keeps one column.
2. Expected specification differences: preserve a real visible label, focus outline, cancel button, full original text, complete Append date, and four existing navigation links. Do not copy the reference's word counter, missing mobile prose, decorative location icons, or missing cancel action.
3. Asset limitation: the black image tiles are the actual existing 4x4 SVG E2E fixture saved through the image picker, not a loading failure or replacement asset in the application. Two-image Blob recovery and owner behavior pass. These captures establish image placement and sizing, not photographic crop/sharpness quality; production photos remain unmodified user content.

## Required fidelity surfaces

- Typography: local Songti/SimSun/serif fallback for dates and reading, local sans-serif fallback for controls. No fonts are fetched. Desktop text 17px/1.75, mobile 16px/1.75, metadata 13px. Windows system glyphs differ from the generated board; that is intentional under the user's no-external-font requirement.
- Layout rhythm: restrained date margin, max 760px main column, original text max 36em, open groups rather than cards. Mobile has 24px sides at 390px, no persistent date rail, time above prose. Images and Appends follow text. No new homepage module or navigation layer.
- Colors/tokens: warm light `#FAF9F6` and dark `#1C1D1C`, specification ink/secondary/rule tokens, vermilion save button and visible focus. Both themes use the same layout. Pictures are not inverted. Focused textarea is intentionally more visible than the reference's unfocused line.
- Images: small ordered grids and bounded natural-ratio single images; original Blobs and alt text remain unchanged. Real photo fidelity is outside the fixture-based evidence described above.
- Copy: existing actions retained; quiet empty/loading messages, visible recording label, and "后来补充" distinguish append text from comments. No counters, motivational copy, badges, scores, or AI.

## Interactions and limits

- Tested: click-to-focus (no initial autofocus/location request), multiline text, image selection, manual place, save, Append save, refresh recovery, cancel confirmation retaining input, min 44 x 44 buttons/links, no page overflow at tested widths, and 200% root text sizing. Both new E2Es report no pageerror events.
- All existing repository/component/E2E behaviors remain passing. No accessibility compliance claim beyond tested checks: physical mobile keyboard, assistive technology and cross-platform font rendering still need human/device review.
- Next dev indicator visible at bottom-left is development chrome, not product UI; it was not removed by changing global Next configuration.

## Implementation checklist

- [x] Compare reference and actual light/dark screenshots.
- [x] Correct invitation alignment and inspect post-fix evidence.
- [x] Verify desktop and mobile reading/writing layouts, full original text, image/Append placement, controls and themes.
- [x] Preserve product semantics and homepage-only scope.
- [ ] Resolve the separate production-build filesystem failure before declaring UI-1 complete.
- [ ] Receive user approval before UI-2.

No remaining actionable P0/P1/P2 visual differences were found within this scoped, specification-led comparison. Real-photo and device/assistive-technology testing remain explicit evidence limitations, not claims of completed coverage.

final result: passed

Engineering acceptance: blocked (`npm run build` exits 1 with Windows UNKNOWN on generated files). Visual QA does not override that gate.

---

# Life Visualization design QA

Date: 2026-09-03. Scope: the new read-only `/life` route.

## Sources and evidence

- Source truth: `D:/code/life/design/life-visualization/reference.png` (1280 × 800), the user's Life Map brief, and `D:/code/life/DESIGN.md` section 26.
- Desktop implementation: `D:/code/life/design/life-visualization/implementation-1280.png`, Chromium viewport and capture 1280 × 800, device scale factor 1.
- Mobile implementation: `D:/code/life/design/life-visualization/implementation-390.png`, Chromium viewport 390 × 844, device scale factor 1; full-page capture height follows stacked content.
- The reference and both implementation captures were opened together in one comparison input. The desktop comparison uses the same pixel viewport as the reference. The mobile capture verifies the responsive transformation rather than claiming a source-image match.
- Evidence data is created as valid independent `LifeEvent` records in an isolated browser context. The visible regions, totals, dates, places, durations and timeline nodes all pass through the real Life Statistics query layer.

## Findings and comparison history

1. [P2, fixed] The first render made regions look like separate geometric bubbles. Region radius, deterministic contour drift and tonal density were increased. The second comparison shows overlapping territories and shared flow lines, which reads as one accumulated field.
2. [P2, fixed] Initial evidence included the Next.js development indicator and a focused skip link. The capture fixture now hides those two development/accessibility artifacts only while taking screenshots; application focus behavior remains unchanged.
3. The reference's People lens and several relationship labels cannot be derived from the current `LifeEvent` contract. The implementation uses Sources as the fourth lens and shows only independent, Moment, Append and Diary provenance. This is an intentional data-truth constraint.
4. The reference uses an always-visible floating tooltip. The implementation uses an adjacent inspector on desktop and a stacked inspector on mobile so event details, source links and keyboard focus remain stable without obscuring the terrain.

## Required fidelity surfaces

- Composition: quiet top bar, centered lens control, wide terrain as the first visual, a secondary inspector, and one continuous timeline at the bottom. No Dashboard grid or rectangular category-card collection appears.
- Material: warm paper background, fine borders, low-saturation olive/orange/violet/blue regions, translucent contour sediment and sparse time traces. Dark mode uses the existing project tokens and preserves the same hierarchy.
- Data hierarchy: region size derives from event count; the inspector reveals duration, first/last occurrence and recent nodes; timeline point size derives from duration while null duration remains a counted event.
- Interaction: lens, range, region and event controls use semantic buttons/tabs, visible focus and at least 44px targets. Motion is restrained to entry/selection transitions and is removed under reduced motion.
- Responsive behavior: desktop keeps map and inspector side by side. At 820px and below they stack; at 390px and 320px the map remains legible, details become linear, and the timeline scrolls within its own rail without page-level horizontal overflow.

## Engineering and evidence limits

- Canvas receives a presentation model and never imports Dexie or a repository. Exact aggregates and the bounded recent-event projection come from `life-insights`.
- Cross-topic lines express chronological proximity only; they are not persisted relationships or semantic claims.
- The recent event projection is bounded to 160 entries while summary/name/source aggregates cover the full selected range. Very large histories should receive real-device main-thread profiling before adding workers, caches or indexes.
- Native Safari/iOS, VoiceOver and physical touch testing are outside this Chromium evidence. No accessibility certification is claimed.

## Implementation checklist

- [x] Compare the reference and populated desktop render at 1280 × 800.
- [x] Correct region isolation and recompare reference plus implementation.
- [x] Verify populated mobile layout and 320px reduced-motion behavior.
- [x] Verify lens selection, region exploration, timeline event details and source links.
- [x] Preserve LifeEvent-only data provenance and exclude stale/deleted sources through Life Statistics.
- [x] Complete the full repository quality gate: typecheck, zero-warning lint, 28 files / 219 tests, 42 Chromium E2E tests and production build all pass.

## Development demo data follow-up, 2026-09-04

- Compared `design/life-visualization/reference.png`, `demo-desktop-1280.png`, and `demo-mobile-390.png` together. The development dataset produces distinct but connected organic regions, visible density variation, accumulated flow lines, location previews, and an event-rich continuous timeline without introducing dashboard cards or standard charts.
- Verified the `Demo Data` marker is visible only when the visualization adapter selects its development provider. A production build served locally showed neither the marker nor mock records.
- Verified the default 30-day view contains enough recent activity to inspect map formation and event details, while the generated year preserves the intended shift from earlier learning toward increased recent fitness and creation.
- The final repository gate passes with typecheck, zero-warning lint, 29 files / 223 unit-integration tests, 43 Chromium E2E tests, and a production build that prerenders `/life`.

No remaining actionable P0/P1/P2 visual difference was found within the model-supported scope. Reference-only People semantics and richer grain density are documented differences rather than fabricated product behavior.

final result: passed

## Reference-fidelity follow-up, 2026-09-04

The first accepted implementation preserved the organic-map idea but diverged visibly from the supplied composition. The user correctly identified that it felt different. A new same-viewport comparison led to these changes:

1. [P1, fixed] The separate map and conventional right inspector made the page read like an analytics screen. The detail became a compact floating sheet over the terrain; the right side now contains organic Places, Themes and Sources previews.
2. [P1, fixed] Regions were isolated and shared too little visual mass. The layout now uses a continuous outer field, denser sediment/flow lines, packed overlaps and topic-level presentation tones while retaining count-based size.
3. [P2, fixed] Header hierarchy, 365-day default and two-line timeline differed from the source. The page now uses the `Life OS` wordmark, English lens labels with Chinese accessible names, the 30-day default, time-distribution label, search affordance and compact one-line event track.
4. [P2, fixed] Activities included `place` names, which duplicated the right-side place map. Activities now contains non-place event names; Places owns exact place names. This is a presentation-query transformation only and does not change LifeEvent or statistics contracts.
5. [P2, fixed] Generic category icons weakened topic identity. Known work, photography, music and travel names use existing Radix icons; unknown names still fall back to their stable category icon without storing or inferring new metadata.

The revised desktop evidence remains 1280 × 800, matching the reference dimensions, and the revised mobile evidence remains a full-page 390px capture. That revision used Sources as a truthful replacement for People; the later hover-exploration follow-up removes the technical lens from the visible product.

follow-up result: passed

## Hover exploration follow-up, 2026-09-04

The persistent detail and dense bottom event rail made the page feel busier as the data volume grew. The accepted interaction now leaves the terrain undisturbed until exploration: hovering, focusing or tapping a region highlights it, dims unrelated regions and connections, and places its compact detail directly beside the territory. Moving away removes the detail without replaying a transition sequence.

The visible lenses are now Activities, Places and Themes. Sources and the bottom LifeEvent list are removed, while Places and Themes share one quiet pill-preview treatment. The Life Statistics contract still retains source and recent-event projections for domain compatibility; the presentation simply does not expose them here.

The refreshed 1280 × 800 evidence captures the reading region's hover state and the refreshed 390 × 844 evidence verifies the simplified narrow layout. Focused component tests and all three Life Visualization Chromium tests pass.

hover follow-up result: passed

## Life Map Evolution follow-up, 2026-09-04

The accepted 30-day terrain, current one-year terrain, Places lens and 390px render were opened together for comparison. The same deterministic history now reads as accumulated formation rather than three unrelated filtered snapshots:

1. [P1, fixed] A native select made 30/90/365 feel like a report filter. It is now a low-contrast sediment-depth track. Only a range response morphs positions, radius and density over 760ms; Lens changes remain direct and reduced motion skips the morph.
2. [P1, fixed] Relative scaling kept the largest topic visually constant across time. Frequency and duration now use separate absolute saturating curves, so the 30-day map remains lighter and more discrete while the one-year map becomes denser, heavier and more connected.
3. [P2, fixed] Generic affinity lines did not make the Places lens feel spatial. Consecutive visible place events within fourteen days now form wide translucent route traces over the same truthful place-name regions.
4. [P2, fixed] The adjacent inspector still read as a compact statistics panel. It now leads with theme, time span, recent change and related direction; count and duration are reduced to a final footprint line.

The evolution remains a presentation projection. No LifeEvent field, Dexie schema, repository, statistics function, homepage entry or existing record/recall surface changed. The evidence set is listed in `design/life-visualization/README.md`.

Final repository verification passed: typecheck, zero-warning lint, 29 files / 224 unit-integration tests, 43/43 Chromium E2E tests, and a production build that prerenders `/life`.

evolution follow-up result: passed

## Typography occlusion follow-up, 2026-09-04

The region-name audit found two concrete defects. Long names inherited the region hit area's inner width and were ellipsized, and the horizontal desktop inspector offset could push a narrow-screen detail beyond the viewport edge. Region names now use a bounded full-text label width with safe character wrapping and a paper-tone text halo; the active region rises above neighboring labels. At 560px and below, the inspector is horizontally clamped and moves above or below the region according to its position.

Browser assertions inspect every rendered region label for scroll clipping, viewport escape and pairwise text-bound overlap. Activities, Places and Themes pass at 320px, including the one-year high-density state; the long-name detail also remains fully inside the viewport. Evidence is stored as `design/life-visualization/typography-detail-320.png`.

typography follow-up result: passed

## Whole-site iOS visual refresh, 2026-09-05

The implementation follows the user's explicit whole-site redesign brief. The six core routes and Diary writing/reading views now share system typography, neutral surfaces, consistent controls, restrained depth and a smaller motion scale. The existing vermilion accent and local-first recording behavior remain intact. Map controls, inspector visibility, keyboard navigation and narrow-screen previews were refined without changing statistical or storage contracts.

Production screenshots cover nine states at 1440, 390 and 430px in both color schemes (54 images). See [the review gallery](design/ios-refresh/index.html) and [the delivery report](design/ios-refresh/README.md) for visual evidence, implementation files and device limitations. Contrast checks pass for all 18 selected text/control combinations. Typecheck, zero-warning lint, 259 unit/integration tests, 47 Chromium E2E tests and the production build pass. A final seven-test production regression also covers the accessible-name correction and screenshot matrix.

Native iOS Safari, the software keyboard and VoiceOver still need real-device verification. Canvas drawing remains on the main thread; no unrelated data or rendering infrastructure rewrite was introduced.

iOS refresh result: passed within the documented browser scope
