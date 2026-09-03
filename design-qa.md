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
