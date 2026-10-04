<img src="web/public/brand/meterwise-logo.svg" alt="Meterwise" height="40">

# Meterwise

**Upgrades for rented flats, repaid from the bill savings.** Meterwise finds the hottest blocks of rented flats and
designs an upgrade deal in which neither the landlord nor the tenant pays upfront.

Climate Hack-tion 2026, "Build for 2035". COP31 priorities: **Electrification** (35% by 2035) and **Resilient Cities
& Buildings** (cut building-sector energy use 25% by 2035).

> Screening tool. Every figure is a modelled estimate, not a quote, an engineering report or financial advice.

## The barrier

In a rented flat the owner pays for upgrades and the tenant gets the bill savings, so nobody upgrades. More than 30%
of Australian households rent. Old gas hot water, plug-in heaters and hot dark roofs stay, and renters in the
hottest suburbs overpay and overheat.

## What it does

1. **Find a block.** A map of 358 real apartment blocks in Penrith and Kingswood, Western Sydney, coloured by
   satellite-measured summer heat and ranked with the share of nearby homes that are rented.
2. **Build the deal.** Pick what is in the flats now and switch upgrades on and off: cool roof, heat pump hot water,
   reverse-cycle air conditioning, induction cooktop, ceiling insulation, gas disconnection. The result updates
   live: bills before and after, the monthly charge, what the tenant keeps, indoor temperatures in the hottest week,
   and whether the bill savings repay the cost.
3. **Share it.** A one-page sheet each for the tenant, the owner and the funder.

A funder pays for the upgrade and is repaid by a fixed monthly charge tied to the flat. The charge is capped at 80%
of the modelled saving, so the tenant's total cost still falls. The model is Pay As You Save, adapted to Australia;
see [docs/policy-australia.md](docs/policy-australia.md).

## What the model found

For a typical 3-storey, 12-flat walk-up in Penrith with gas hot water, plug-in heaters, no air conditioning and a
dark roof, and the default package (cool roof, heat pump hot water, reverse-cycle air conditioning):

| | Estimate |
|---|---|
| Cost after rebates | $82,425 |
| Repaid by capped charges over 10 years, after a 5% reserve | $57,469 (about 70%) |
| Funding gap | $24,956 |
| Tenant keeps, top-floor flat | $29 a month |
| Tenant keeps, lower-floor flat | $10 a month |
| Emissions cut | 14.6 t CO₂e a year |
| Energy use | 47% lower |
| Top-floor hours above 30°C in a year, no air conditioning running | 279 down to 99 |

- **Tenants come out ahead in every case tested,** because the charge is capped below their saving.
- **The package does not fully pay for itself.** Bill savings repay about 70% of the cost. A grant for the rest goes
  more than three times as far as paying for the whole upgrade.
- **The cool roof is a heat measure, not a money saver.** It cuts top-floor overheating and saves little on bills.

These figures come from `POST /api/assess` on the running code. They are estimates and have not been checked
against real bills.

## Validation

- **69 automated tests** cover the finance arithmetic, rules that must always hold, the thermal model's energy
  balance and the API contract.
- **[validation/REPORT.md](validation/REPORT.md)** compares the model with published benchmarks: 16 of 22 checks
  fall inside ranges set beforehand. The report lists each miss and why it matters. It includes a 20-case
  sensitivity table.
- **[data/pilot/README.md](data/pilot/README.md)** documents the dataset checks. The heat layer agrees with the NSW
  Government's own surface temperature map (rank correlation 0.82 across pixels); both come from Landsat, so that
  checks the processing, not the sensor.
- **Not validated:** real bills, real indoor temperatures, installed costs from quotes. The plan for that is in
  [docs/pilot-and-testing.md](docs/pilot-and-testing.md).

## Run it

Needs Python 3.12 and Node 20 or later.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # macOS/Linux: .venv/bin/python
cd web && npm install && npm run build && cd ..
.venv/Scripts/python run.py                                 # http://localhost:8000
```

- Tests: `cd engine && ../.venv/Scripts/python -m pytest`
- Validation report: `.venv/Scripts/python validation/make_report.py`
- Rebuild the pilot dataset: `.venv/Scripts/python data/pipeline/build_pilot.py`
  (needs `data/pipeline/requirements.txt`)
- Web development with example numbers and no backend: `cd web && npm run dev:mock`

## Programme system

Beyond screening, Meterwise runs an upgrade programme end to end: projects move through a pipeline (screened, audit,
offer, consent, procurement, installation, commissioned, active, closed) with guards that say in plain words what is
missing; site audits correct the open-data guesses; tenants and owners consent; installers quote; the accepted quote
re-prices the deal; a work order carries a commissioning checklist for the package; then each flat's meter charge is
billed monthly with payments, faults that pause the charge (the reserve covers the paused months, the term is not
extended), tenancy changes (the charge stays with the meter, the old tenant is settled, the new tenant gets a new
access code and disclosure), annual measured-savings checks with true-ups refunded from the reserve, and printable
documents for every reader. Contracts: [docs/programme-contract.md](docs/programme-contract.md) and
[docs/portals-contract.md](docs/portals-contract.md).

**Run it.** `.venv/Scripts/python run.py` as above. On first start the database (`engine/var/meterwise.db`, or the
path in `METERWISE_DB`) is created and seeded with one example programme: 11 projects on real pilot buildings at every
stage, two of them with 19 months of billing history, built by driving the real service functions through time
(about 10 seconds). Every organisation and person in the seed is invented, meter references are programme
references (`MW-100001`), not National Metering Identifiers, and readings the system generates are stored with
`source: "simulated"` and shown as "Modelled estimate". The seeded accounts are not listed anywhere on the site; see
"Seeded accounts for local testing" below.

| Setting | Default | Meaning |
|---|---|---|
| `METERWISE_DB` | `engine/var/meterwise.db` | SQLite database path |
| `METERWISE_DEMO` | `1` | `0` turns off the system-date controls (`/api/sim/*`), the account list and the MFA exemption for seeded accounts, and requires `METERWISE_SECRET` |
| `METERWISE_LIST_ACCOUNTS` | `0` | `1` turns on `GET /api/auth/demo-users` (seeded accounts and tenant codes) for local testing; needs `METERWISE_DEMO=1` |
| `METERWISE_DOCS` | `1` when `METERWISE_DEMO=1`, else `0` | Interactive API docs and `/openapi.json` |
| `METERWISE_SECRET` | generated and stored in the database (demo only) | Token signing key; required (32+ characters) when `METERWISE_DEMO=0` |
| `METERWISE_CORS_ORIGINS` | local hosts | Comma-separated allowed origins |
| `METERWISE_AUTOSEED` | `1` | `0` leaves a fresh database empty |
| `METERWISE_TILE_HOST` | OpenStreetMap tiles | Image host allowed by the Content-Security-Policy |
| `METERWISE_OIDC_*` | unset | Single sign-on settings; the callback returns 501 until configured |
| `METERWISE_NOW` | real time | Fixes the clock's base date (tests) |

**System date.** `POST /api/sim/advance {"months": 12, "scenario": "mixed"}` moves the system date on a year in a few
seconds: modelled readings, billing, payments (a seeded few late), occasional faults, and a savings check after every 12
months of charge. `POST /api/sim/reset` reseeds. Randomness is seeded, so the same start gives the same result.

**Portals.** Government (`/api/government/*`: outcomes, targets, areas, grants with decisions, CSV reports, delivery
routes, the list of security controls), utility (`/api/utility/*`: meters, network impact, bulk readings, charge
file, remittance, gas disconnections, supply requests) and property (`/api/property/*`, plus the programme routes for
owners and tenants). Utility, government, funder and installer responses never contain tenant names, access codes or
ledgers; meter ids are masked for government, funder and installer.

**Security and privacy controls** (checked by tests in `engine/tests/programme/`): sessions with 12-hour absolute
and 30-minute idle expiry and logout; passwords of 14+ characters checked against common passwords and hashed with
scrypt; lockout after 5 failures and a per-address sign-in rate limit; TOTP multi-factor sign-in for staff roles
(demo accounts exempt only while `METERWISE_DEMO=1`, reported by `/api/government/controls`); default-deny role and
organisation checks; an append-only, hash-chained audit log (`GET /api/programme/audit-log/verify`) recording
sign-ins, failures, reads of tenant data, exports and every change; security headers and CSP on every response;
body-size and row limits; CSV formula neutralising; a separate, withdrawable consent per tenancy before any uploaded
or utility meter reading is accepted; personal-data export and erase; `/.well-known/security.txt`, `/api/health`,
`/api/ready` and request ids. See [SECURITY.md](SECURITY.md). Python dependencies are pinned in `requirements.lock`
(`pip freeze`); `docs/sbom/meterwise-sbom.cdx.json` is a CycloneDX list built from `requirements.lock` and
`web/package-lock.json` by a short script, not by a dedicated SBOM tool.

**What is not real.** No penetration test or certification; no real tenant, meter or payment data; the M&V uses
simulated readings unless uploaded; the legal status of the service charge under tenancy and credit law is to
confirm ([docs/policy-australia.md](docs/policy-australia.md)).

## Seeded accounts for local testing

The site does not list these. All use the password `Penrith-demo-2026!`. Staff accounts are exempt from the second
sign-in factor only while `METERWISE_DEMO=1`. Organisation names are invented and were checked by web search on
4 October 2026 not to match a real NSW energy, housing, strata or government organisation.

| Role | Email | Person (title), organisation |
|---|---|---|
| manager | manager@meterwise.example | Alex Marchetti (Programme manager), Marralong Councils Energy Office |
| government | council@meterwise.example | Jordan Tran (Council programme officer), Marralong Councils Energy Office |
| government | agency@meterwise.example | Sam Okoro (Senior policy officer), Rental Energy Upgrades Office |
| owner | provider@meterwise.example | Priya Raman (Asset officer), Tallis Street Community Housing |
| owner | landlord@meterwise.example | Lee Harrington (Director), Orrin Property Holdings |
| owner | strata@meterwise.example | Chris Delaney (Strata secretary), Halloway House Owners Committee |
| funder | funder@meterwise.example | Morgan Achebe (Investment manager), Brolga Bay Impact Fund |
| installer | installer@meterwise.example | Taylor Brooks (Operations lead), Quellan Cool Roofs |
| installer | installer2@meterwise.example | Robin Szabo (Estimator), Varden Electrical and Plumbing |
| utility | distributor@meterwise.example | Casey Lund (Connections officer), Tarnell Grid (distributor) |
| utility | retailer@meterwise.example | Drew Fennell (Billing operations), Halvard Energy Retail (retailer) |
| utility | gas@meterwise.example | Jamie Ortega (Field services coordinator), Tenterra Gas Network |

Tenants sign in with the access code on their flat (`FLAT-` and six characters). Managers and owners see the codes
in the flat list; with `METERWISE_LIST_ACCOUNTS=1`, `GET /api/auth/demo-users` also lists a few.

Security checks: `scripts/security_check.py` (see [docs/it-assurance.md](docs/it-assurance.md)).

## Layout

| Path | What |
|---|---|
| `engine/meterwise/` | Weather, thermal model, equipment, tariffs, finance; every default in `params.py` with its source |
| `engine/api/` | FastAPI service; contract in [docs/api-contract.md](docs/api-contract.md) |
| `engine/programme/` | Programme system: database, roles, pipeline, ledger, reserve, M&V, documents, portals, simulated clock, seed |
| `engine/tests/`, `validation/` | Tests and the generated validation report |
| `data/pilot/`, `data/pipeline/` | Pilot dataset and the scripts that build it |
| `web/` | React app |
| `docs/` | Policy note, pilot and testing plan, API contract |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | The plan on all fronts |
| [DISCLOSURE.md](DISCLOSURE.md) | Tools, data, AI use and prior-work statement |

## Limits

- Heat is satellite land surface temperature at about 100 m detail. It ranks neighbourhoods; it does not measure a
  roof, the air or a flat.
- 87% of storey counts are assumed to be three. The app lets the user correct storeys and flats.
- Renter share is for the surrounding census area in 2021, not the building.
- Costs and several behaviour inputs are assumptions, labelled as such in the app's "What this assumes" panel.
- Whether a capped charge can lawfully be passed to a private tenant in NSW is unresolved; see the policy note.

## Data credits

© OpenStreetMap contributors (ODbL). Landsat imagery courtesy of the U.S. Geological Survey. Australian Bureau of
Statistics 2021 Census (CC BY 4.0). Weather from Open-Meteo using Copernicus ERA5. Full list in
[DISCLOSURE.md](DISCLOSURE.md).
