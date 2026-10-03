# Disclosure: tools, data and prior work

Climate Hack-tion 2026 requires a list of every outside tool, dataset, API and AI tool used, and a statement about
prior work. This file is that list. Detailed tables with links and licences are kept next to the code they belong
to:

- Engine data sources and Python libraries: [engine/SOURCES.md](engine/SOURCES.md)
- Pilot dataset sources: [data/pilot/README.md](data/pilot/README.md)
- Web libraries, map tiles and assets: [web/README.md](web/README.md)

## Prior work

- All code in this repository was written during the event. The first commit is dated Saturday 3 October 2026,
  after the event opened on Friday 2 October.
- No code, design or asset from before the event is included.
- Before and during the event the team explored other ideas, which are not part of this submission.
- The idea started from a research-style proposal generated with an AI research tool during the event
  ("COP31 Hackathon Proposal Strategy"). **Team: name the tool here.** Its example results (a 240-flat testbed)
  were never simulated and are not used anywhere in this project. Every result here comes from code in this
  repository.

## AI tools

| Tool | Used for |
|---|---|
| Claude Code (Anthropic), models Claude Fable 5.1, Claude Opus 5.5 and Claude Sonnet 5.5 | Research, planning, writing the code, tests and documents, and reviewing the app in a browser |
| AI research tool used for the starting proposal (**team to name**) | The initial idea |
| ChatGPT deep research (**team to confirm**) | An earlier idea that was not pursued |

The team directed the work, chose the idea and is responsible for the submission.

## Data and APIs

| Source | Used for | Terms |
|---|---|---|
| OpenStreetMap, via the Overpass API | Apartment building footprints and addresses | ODbL; "© OpenStreetMap contributors" |
| Landsat 8/9 Collection 2 Level-2 (USGS/NASA), via Microsoft Planetary Computer | Summer land surface temperature | Public domain; Planetary Computer terms |
| Australian Bureau of Statistics, 2021 Census | Share of homes rented | CC BY 4.0 |
| Open-Meteo historical weather API (ERA5, Copernicus/ECMWF) | Hourly weather for the thermal model | CC BY 4.0 |
| Australian Energy Regulator: Default Market Offer and energy use benchmarks | Electricity prices; validation | Public |
| EnergyAustralia and Jemena published gas tariffs | Gas prices | Public |
| National Greenhouse Accounts Factors (DCCEEW) | Emission factors | CC BY 4.0 |
| NSW Government energy pages | Upgrade costs and rebates | Public |
| UNSW Cool Roofs Cost Benefit Analysis (2022) | Cool roof costs; validation | Public report |
| National Construction Code, YourHome, Energy Rating | Building fabric and equipment efficiency | Public |
| Pay As You Save programme rules and field reviews (EEI, Clean Energy Works, Berkeley Lab) | Finance rules | Public |
| OpenFreeMap | Basemap tiles | Open; attribution shown on the map |

The exact pilot data sources are confirmed in `data/pilot/README.md` once the dataset is built.

## Software

- **Backend:** Python, FastAPI, Uvicorn, Pydantic, NumPy, SciPy, Requests, pytest, and for the data pipeline
  Shapely, pyproj, rasterio, pystac-client and planetary-computer.
- **Frontend:** React, Vite, TypeScript, MapLibre GL JS. Colour ramp from ColorBrewer. Icons and logo drawn for
  this project. No web fonts.
- **Development tools:** Git, Node.js, Playwright (browser checks).

## Sources for the policy documents

Linked inline in [docs/policy-australia.md](docs/policy-australia.md),
[docs/pilot-and-testing.md](docs/pilot-and-testing.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
