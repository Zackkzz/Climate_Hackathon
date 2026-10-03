# Meterwise web app

Vite + React + TypeScript. Three steps: find a block on a map, build the deal, share it as printable one-page sheets.
Built against `../docs/api-contract.md`.

## Run it

```bash
cd web
npm install

npm run dev:mock     # demo data, no backend needed       -> http://localhost:5173
npm run dev          # real API: /api is proxied to http://localhost:8000

npm run build        # type-check + production build into web/dist (real API, relative /api paths)
npm run build:mock   # same, but with the built-in demo data (for a static demo)
```

The backend serves `web/dist` at `/`. Routing uses the URL hash (`#/find`, `#/build?...`, `#/share?...`), so no server
fallback rules are needed and all asset and API paths are relative.

### The mock switch

`VITE_USE_MOCK=true` (set by `--mode mock`, see `.env.mock`) swaps every API call for in-browser fixtures:

- `src/mock/fixtures.ts`: 30 invented buildings around Lakemba and a `/api/meta` stand-in.
- `src/mock/assess.ts`: a small model that reacts to every input (toggles, sliders, tariffs), so numbers visibly move.

Mock mode always shows a yellow "Demo data" tag in the header and on the printed sheets. With the real API, a failed call
shows a plain-language error with a "Try again" button. It never falls back to mock numbers. If `/api/meta` reports
`pilot.is_fixture: true` the tag reads "Example data".

## Share links

The URL always reflects the deal on screen: building id (or hand-entered block), flats/storeys corrections, what is in the
flats now, the upgrades switched on, and any non-default finance terms or tariffs. Pasting it restores the deal.
The shortlist is kept in the browser (`localStorage`).

## Structure

```
src/
  types.ts            all API types (the contract) plus app state types
  api.ts              fetch client (+ lazy-loaded mock switch)
  state.ts            hash routing, deal <-> URL encoding, deal -> assess request
  hooks.ts            useLoad, useAssess (250 ms debounce, keeps last result while updating), useShortlist
  verdict.ts          verdict wording, hints, balance maths, hottest-week comfort figures
  format.ts, heat.ts  number/money formatting, heat colour ramp
  mock/               demo fixtures and demo model
  components/
    FindStep.tsx      map screen: list, selected card, own-block form, shortlist table
    MapView.tsx       MapLibre map (lazy loaded)
    DealStep.tsx      step 2 layout; Inputs.tsx = left column; result/ = verdict, balance, charts, costs
    ShareStep.tsx     tenant / owner / funder sheets, print CSS, copy link
    HowItWorks.tsx    modal;  ui.tsx = small shared controls;  Icons.tsx = icons and logo
  styles.css          all styling (CSS custom properties, one accent colour, print rules at the end)
```

## Assets, libraries and licences (for the hackathon disclosure)

| Item | Use | Licence |
| --- | --- | --- |
| React, React DOM | UI | MIT |
| Vite, @vitejs/plugin-react | build tooling | MIT |
| TypeScript | type checking | Apache-2.0 |
| MapLibre GL JS (`maplibre-gl`) | map rendering | BSD-3-Clause |
| OpenFreeMap "positron" style and vector tiles (`tiles.openfreemap.org`) | basemap, no API key | Free to use with attribution; styles/tiles built on OpenMapTiles (BSD-3-Clause schema, CC-BY 4.0 design) |
| OpenStreetMap data | basemap data, building footprints come from the backend | ODbL 1.0, attribution "© OpenStreetMap contributors" shown on the map |
| Heat colour ramp | ColorBrewer YlOrRd, 5 classes | Apache-2.0 (Brewer, Harrower and The Pennsylvania State University) |
| Icons, logo, favicon | drawn in-house as inline SVG for this project | Original work, no third-party icon set |
| Fonts | none loaded; system font stack (`ui-rounded`, `system-ui`, Segoe UI, Roboto, ...) | n/a |
| Demo data (`src/mock/`) | invented buildings and a toy model, clearly tagged "Demo data" | Original work |

Electricity and gas emission factors and agency links that appear in the demo "What this assumes" list point to the
Australian Government (DCCEEW, AER) home pages. In real mode the assumptions and sources come from the backend.

No analytics, cookies or third-party scripts are used. The only external requests are map style and tiles from OpenFreeMap.
