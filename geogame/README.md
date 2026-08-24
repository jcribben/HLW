# Globetrot

A mobile-first geography quiz game — flags, country shapes, capitals, find-it-on-the-map,
world cities, and natural features (rivers, deserts, mountains, lakes, seas) across four
difficulty settings, with per-player progress tracking.

Play it as a published Claude artifact (private link, works on phones and tablets).
Everything is a single self-contained `index.html` — no server, no external dependencies
beyond Google Fonts.

## Structure

- `index.html` — the built game (generated; do not edit by hand)
- `src/app.html` — app source: styles, markup and game logic, with data placeholders
- `data/geodata.json` — generated country outlines + world map paths + metadata
- `data/curated.mjs` — hand-curated difficulty tiers, world cities, physical features
- `tools/build-geodata.mjs` — regenerates `data/geodata.json` from
  [world-atlas](https://www.npmjs.com/package/world-atlas) TopoJSON joined with
  [world-countries](https://www.npmjs.com/package/world-countries) metadata
- `tools/build.mjs` — inlines the data into `src/app.html` → `index.html`

## Building

```sh
# one-time: fetch map data & deps (any directory with node_modules works via NODE_PATH)
npm install topojson-client d3-geo world-countries
npm pack world-atlas@2.0.2 && tar xzf world-atlas-2.0.2.tgz

# regenerate geodata (only needed if the conversion changes)
node tools/build-geodata.mjs path/to/package/countries-110m.json

# assemble the game
node tools/build.mjs
```

## How progress sync works

Player stats are embedded in the page itself. After each round the game republishes
itself through the Claude artifact runtime (`artifact` capability), so progress is
shared across devices for anyone with edit access to the artifact. Viewers without
edit access still get full progress tracking via `localStorage` on their own device.
On load, embedded and local state are merged per player, newest wins.

## Game design notes

- Countries: 175 quizzable (Natural Earth 110m), tiered 1–3 by recognizability
  in `data/curated.mjs`; Antarctica and uninhabited territories excluded.
- Questions are weighted toward unseen and previously-missed items; distractors
  come from the same subregion where possible (same-region on easy).
- Country outlines are azimuthal-equal-area projections of the mainland
  (far-flung territories dropped so France reads as the Hexagon, the US as the lower 48).
- XP: 10 × tier multiplier (1×/1.5×/2×) per correct answer, +5 streak bonus from 3 in a row.
