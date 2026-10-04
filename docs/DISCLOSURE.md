# Disclosure: tools, data and prior work

Climate Hack-tion 2026 requires a list of every outside tool, dataset, API and AI tool used, and a statement about
prior work. This file is that list. Detailed tables with links and licences are kept next to the code they belong
to:

- Engine data sources and Python libraries: [engine/SOURCES.md](../engine/SOURCES.md)
- Pilot dataset sources: [data/pilot/README.md](../data/pilot/README.md)
- Web libraries, the map and assets: [web/README.md](../web/README.md)

## Prior work

- All code in this repository was written during the event. The first commit is dated Saturday 3 October 2026,
  after the event opened on Friday 2 October.
- No code, design or asset from before the event is included.
- Before and during the event the team explored other ideas, which are not part of this submission.
- The idea started from a research-style proposal generated with an AI research tool during the event
  ("COP31 Hackathon Proposal Strategy", now in [docs/research](research/README.md)). Its example results (a 240-flat testbed)
  were never simulated and are not used anywhere in this project. Every result here comes from code in this
  repository.

## AI tools

We used Codex and Claude Code to aid with the development of the application itself; however, research and ideating
was done, for the most part, without AI assistance.

| Tool | Used for |
|---|---|
| Codex (OpenAI) | Aiding development of the application |
| Claude Code (Anthropic), models Claude Fable 5.1, Claude Opus 5.5 and Claude Sonnet 5.5 | Research, planning, writing the code, tests and documents, and reviewing the app in a browser |
| AI research tool used for the starting proposal (**team to name**) | The initial idea |
| ChatGPT deep research (**team to confirm**) | An earlier idea that was not pursued |

The team directed the work, chose the idea and is responsible for the submission.

## Data and APIs

| Source | Used for | Terms |
|---|---|---|
| OpenStreetMap, via the Overpass API | Apartment building footprints and addresses | ODbL; "© OpenStreetMap contributors" |
| Landsat 8/9 Collection 2 Level-2 (USGS/NASA), via Microsoft Planetary Computer | Summer land surface temperature | Public domain; Planetary Computer terms |
| Australian Bureau of Statistics, 2021 Census (table G37 at SA1 level) and suburb boundaries | Share of homes rented; suburb names | CC BY 4.0 |
| NSW Spatial Services geocoded addresses | Street address labels and counts of flats | Licence not stated on its Data.NSW listing; used with attribution. **Team: check the terms before sharing labels further.** |
| NSW Government Greater Sydney land surface temperature, summer 2022-23 | Cross-check of the heat layer only | CC BY 4.0 |
| Open-Meteo historical weather API (ERA5, Copernicus/ECMWF) | Hourly weather for the thermal model | CC BY 4.0 |
| Australian Energy Regulator: Default Market Offer and energy use benchmarks | Electricity prices; validation | Public |
| EnergyAustralia and Jemena published gas tariffs | Gas prices | Public |
| National Greenhouse Accounts Factors (DCCEEW) | Emission factors | CC BY 4.0 |
| NSW Government energy pages | Upgrade costs and rebates | Public |
| UNSW Cool Roofs Cost Benefit Analysis (2022) | Cool roof costs; validation | Public report |
| National Construction Code, YourHome, Energy Rating | Building fabric and equipment efficiency | Public |
| Pay As You Save programme rules and field reviews (EEI, Clean Energy Works, Berkeley Lab) | Finance rules | Public |
| Google Maps Platform (Maps JavaScript API) | Base map in the block finder and on the government Areas page | Google Maps Platform Terms of Service; Google's logo and attribution shown on the map |
| OpenStreetMap standard tiles (tile.openstreetmap.org, run by the OpenStreetMap Foundation) | Fallback base map on the same two pages, used only when Google Maps cannot load | Map data ODbL; OpenStreetMap Tile Usage Policy; "© OpenStreetMap contributors" shown on the map |
| MapLibre GL JS | Draws the fallback OpenStreetMap map; bundled with the app and loaded only when the fallback is needed | BSD-3-Clause |
| NSW Cyber Security Policy 2026-27, OLG Cyber Security Guidelines for Local Government, NSW Design Standards | The security, privacy and accessibility controls | Public; see `docs/research-gov-it-standards.md` for what was read directly and what came from search summaries |

The Landsat scene IDs and the full method are in `data/pilot/README.md`.

## Software

- **Backend:** Python, FastAPI, Uvicorn, Pydantic, NumPy, SciPy, Requests, pytest, and for the data pipeline
  Shapely, pyproj, rasterio, pystac-client, planetary-computer and matplotlib.
- **Frontend:** React, Vite, TypeScript, Google Maps JavaScript API (loaded with `@googlemaps/js-api-loader`), MapLibre
  GL JS for the OpenStreetMap fallback map,
  Tailwind CSS, shadcn/ui components (built on Radix UI), TanStack Table, React Hook Form, Zod, Recharts, React
  Router, cmdk, sonner, react-day-picker, date-fns and Lucide icons. Public Sans typeface, bundled locally (SIL Open
  Font Licence). Colour ramp from ColorBrewer. Nothing is loaded from a CDN; the Google map's code comes from Google
  when a page with a map opens.
- **Maps and privacy:** maps are provided by Google Maps. When Google Maps cannot load (no key, the script blocked, the
  key refused, or too slow), the map falls back to OpenStreetMap tiles served by the OpenStreetMap Foundation. In either
  case the visitor's browser contacts that provider directly, so the provider sees the visitor's IP address and the map
  area requested. Meterwise sends neither provider any account or tenant data.
- **Programme system:** Python standard library only (sqlite3, hashlib, hmac) on top of FastAPI.
- **Checks:** axe-core through Playwright for accessibility; a Playwright end-to-end script (`web/scripts/e2e.mjs`).
- **Development tools:** Git, Node.js, Playwright (browser checks), Google Cloud CLI.
- **Cloud services:** Google Cloud project `meterwise-platform` for the map: Maps JavaScript API, a restricted API key
  and Cloud Quotas (daily map-load cap).

## Sources for the policy documents

Linked inline in [docs/policy-australia.md](policy-australia.md),
[docs/pilot-and-testing.md](pilot-and-testing.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Simulated and example content

- Meter and temperature readings in the demo are produced by a simulator and labelled "simulated".
- Every organisation, person, meter number and payment in the demo is made up and flagged as an example.
- Buildings, satellite heat, weather, tariffs, costs and the model are real and sourced.
