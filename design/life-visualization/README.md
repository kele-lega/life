# Life Visualization visual evidence

This directory keeps the source reference and the rendered evidence for Phase 13.

- `reference.png`: user-provided visual direction, 1280 × 800.
- `implementation-1280.png`: populated `/life` route in Chromium at 1280 × 800.
- `implementation-390.png`: the same real-data state at 390 × 844, with the map remaining within the viewport width.
- `demo-desktop-1280.png`: development-only Demo Data at 1280 × 800.
- `demo-mobile-390.png`: development-only Demo Data at 390 × 844.
- `evolution-before-1280.png` / `evolution-before-390.png`: accepted pre-evolution baseline.
- `evolution-depth-30-1280.png`: the current 30-day sediment layer before exploration.
- `evolution-desktop-1280.png`: one-year accumulated terrain with adjacent narrative detail.
- `evolution-places-1280.png`: one-year Places lens with location trajectory traces.
- `evolution-mobile-390.png`: one-year accumulated terrain at 390 × 844.
- `evolution-real-1280.png` / `evolution-real-390.png`: the current UI backed by isolated valid IndexedDB fixtures through the production query path.
- `typography-detail-320.png`: narrow-screen long-name and adjacent-detail legibility evidence.

The implementation screenshot uses an isolated IndexedDB fixture made of valid, independent `LifeEvent` records. Its 30-day mix gives the comparison enough reading, work, fitness, photography, travel, music and place history to exercise the same density as the reference. The page still reads through `getLifeEventExploration`; the test does not replace the statistics/query boundary with mock chart data. Screenshot-only styles hide the Next.js development indicator and the skip link while capturing evidence. They do not affect application code.

The reference includes People and richer semantic relationships that the current model does not store. The implementation uses Activities, Places and Themes, keeps source provenance out of the visible observation modes, and does not infer people or relationships from event text. Region details are transient and adjacent to the hovered, focused or tapped territory; the bottom per-event rail is intentionally absent.

## Development Demo Data

`src/features/life-visualization/data/life-visualization-mock.ts` creates a deterministic one-year visualization projection in memory. It contains 360 semantic events plus 90 same-day place traces, for 450 projected events without an IndexedDB write. The semantic distribution is work 30%, learning 25%, fitness 15%, creation 15%, travel 10%, and other personal activity 5%.

The calendar is deliberately uneven: work stays weekday/daytime dominant; learning is denser around the middle of the year and occurs mainly in the evening; fitness and creation increase in the most recent 90 days; travel forms small Shanghai, Hangzhou and Chengdu clusters. Place traces cover home, company, cafe, library, gym, outdoors and travel cities. No People data is generated.

Development enables the adapter by default and displays `Demo Data`. Production always uses `getLifeEventExploration` and never shows the badge. To disable it locally for one browser session, run `sessionStorage.setItem("life-visualization-demo", "off")` and reload `/life`. To disable it for the whole local development server, set `NEXT_PUBLIC_LIFE_VISUALIZATION_DEMO=0` before starting Next.js. Remove the session key or set it to `on` to restore the default.

## Life Map Evolution

The 30/90/365 control is a time-depth track. A range response morphs the existing terrain into the next accumulated layer for 760ms; a Lens change draws immediately. `prefers-reduced-motion: reduce` skips the interpolation. The 30-day and one-year screenshots show the same deterministic life history at different depths: frequent names gain particles, longer investments gain radius and contour weight, and older topics enter as new deposited territories.

Places reuses the same organic regions but turns consecutive visible place events within fourteen natural days into broad translucent route traces. These lines express time adjacency only. They do not imply geographic coordinates or a stored semantic relationship.

The adjacent detail no longer uses a metric grid. It leads with the visible theme, first-to-latest span, recent category change and the strongest temporal affinities. Count and duration remain available as a quiet final footprint.
