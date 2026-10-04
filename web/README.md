# Meterwise web app

Vite + React + TypeScript. Three steps: find a block on a map, build the deal, share it as printable one-page sheets.
Built against `../docs/api-contract.md`.

## Run it

```bash
cd web
npm install          # and put the .env.local file with the Google Maps key in web/ (see below)

npm run dev:mock     # demo data, no backend needed       -> http://localhost:5173
npm run dev          # real API: /api is proxied to http://localhost:8000

npm run build        # type-check + production build into web/dist (real API, relative /api paths)
npm run build:mock   # same, but with the built-in demo data (for a static demo)
```

### The map (Google Maps, with an OpenStreetMap fallback)

The block finder map and the government Areas map use the Google Maps JavaScript API. Its browser key lives in
`web/.env.local`, one line:

```
VITE_GOOGLE_MAPS_API_KEY=the-key
```

Git ignores that file, so the team passes it around directly. Vite reads it for `dev`, `dev:mock` and every build;
restart the dev server after adding it. Without it, or whenever Google Maps cannot load (script blocked, key refused,
or nothing after 8 seconds), both maps swap in place to an OpenStreetMap map drawn with MapLibre GL JS
(`src/portal/finder/OsmMap.tsx`, loaded only then), using the OpenStreetMap Foundation's standard tiles.

Google Cloud setup (project `meterwise-platform`):

| What | Value |
| --- | --- |
| Key | "Meterwise web map (browser)": Maps JavaScript API only; accepted only from `http://localhost` and `http://127.0.0.1` on ports 5173, 8000, 8010 and 8020 |
| Daily cap | 500 map loads a day for the project (Google's free allowance is 10,000 a month) |

A browser key is visible to anyone who opens the site, so its protection is the address list, the one-API limit and the
daily cap, not secrecy. Passing the file around the team is fine; just keep it out of git. If the file is lost, a project
owner can print the key again:

```bash
gcloud services api-keys get-key-string bd9d3e51-aa27-40b6-83ce-cf04698a00f4 --project=meterwise-platform
```

Before publishing the site at a real address, create a separate key restricted to that address and build with it; this
one stays for development.

The server's Content Security Policy (`engine/api/programme.py`) allows the Google Maps hosts; scripts only from
`maps.googleapis.com` and `maps.gstatic.com`. Images and fetches are also allowed from `tile.openstreetmap.org` for the
fallback map.

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
    MapView.tsx       Google map (lazy loaded)
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
| Google Maps JavaScript API, loaded with `@googlemaps/js-api-loader` (Apache-2.0); types `@types/google.maps` (MIT) | base map and map drawing | Google Maps Platform Terms of Service; Google's logo and attribution shown on the map |
| OpenStreetMap data | building footprints, from the backend, drawn on the Google map | ODbL 1.0, attribution "Buildings © OpenStreetMap contributors" shown on the map |
| OpenStreetMap standard tiles (`tile.openstreetmap.org`, OpenStreetMap Foundation) | fallback base map when Google Maps cannot load | map data ODbL 1.0; OpenStreetMap Tile Usage Policy; attribution "© OpenStreetMap contributors" shown on the map |
| MapLibre GL JS (`maplibre-gl`) | draws the fallback map; a separate chunk loaded only when needed | BSD-3-Clause |
| Heat colour ramp | ColorBrewer YlOrRd, 5 classes | Apache-2.0 (Brewer, Harrower and The Pennsylvania State University) |
| Icons, logo, favicon | drawn in-house as inline SVG for this project | Original work, no third-party icon set |
| Fonts | none loaded; system font stack (`ui-rounded`, `system-ui`, Segoe UI, Roboto, ...) | n/a |
| Demo data (`src/mock/`) | invented buildings and a toy model, clearly tagged "Demo data" | Original work |

Electricity and gas emission factors and agency links that appear in the demo "What this assumes" list point to the
Australian Government (DCCEEW, AER) home pages. In real mode the assumptions and sources come from the backend.

No analytics or cookies are used. The one third-party script is the Google Maps JavaScript API on the pages with a map
(the block finder and the government Areas page), which also loads map images and the fonts of its controls from Google.
When Google Maps cannot load, the map falls back to OpenStreetMap tiles served by the OpenStreetMap Foundation. In
either case the visitor's browser contacts that provider directly, which sees the visitor's IP address and the map area
requested. Meterwise sends neither provider any account or tenant data.
