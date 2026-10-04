# Meterwise platform: from screening tool to programme system

*Written 4 October 2026 (Sydney). Extends `IMPLEMENTATION_PLAN.md`. The screening tool (find a block, build the
deal, share it) stays as it is. This plan adds what the original proposal describes beyond screening.*

## What the proposal asks for that the screening tool does not do

| Proposal element | Screening tool today | This plan |
|---|---|---|
| Microclimate weather per building, exported as an EPW file | A capped temperature adjustment inside the model | A microclimate module with a documented method and an EPW export per building |
| Cool roof lets the air conditioner be right-sized, avoiding switchboard upgrades | Not modelled | A sizing module: design cooling load, unit size, cost difference, switchboard check, building peak demand |
| Tariff engine: bill neutrality, maximum fundable cost, reserve | Present | Adds a charge schedule per meter, aged-roof performance, price scenarios and a savings risk test |
| Sensor validation: sub-meters and temperature loggers | Not present | Measurement and verification: readings in, weather-normalised verified savings out, charge true-up |
| Charge stays with the meter when tenants change; paused when equipment fails; loss reserve | Described in documents only | A working charge ledger with tenancy change, fault pause and reserve accounting |
| Web platform for housing providers, funders and installers: audits, bids, contracts | Not present | Programme console: project pipeline, site audit, quotes, consent, commissioning, billing, documents |
| Bulk purchasing across a portfolio | Simple portfolio ranking | Portfolio planner: choose blocks within a budget, with volume price tiers |

## Rules that carry over

- Australian setting. Route A (a community housing provider owns the block and collects the charge) is the route the
  platform operates. Routes B (council rates) and C (meter-attached) are selectable but flagged as needing rule changes.
- No invented results. Meter and logger data in the demo come from a simulator and are labelled "simulated" everywhere,
  in the API (`source: "simulated"`) and on screen. Organisations and people in the demo are examples and labelled so.
- Every parameter keeps a source or is marked as an assumption, as in `params.py`.
- The 69 existing tests keep passing. Existing API fields are not renamed or removed.
- Plain language on every screen and document.

## Parts and ownership

| Part | Location | Owner |
|---|---|---|
| Analysis modules: microclimate, sizing, tariff schedule and risk, M&V, portfolio planner | `engine/meterwise/`, `engine/api/analysis.py`, `engine/tests/` | Engine agent (Opus) |
| Programme system: database, roles, pipeline, ledger, billing, reserve, documents, simulated clock, seed | `engine/programme/`, `engine/api/programme.py`, `engine/api/main.py`, `run.py`, `engine/tests/programme/` | Platform agent (Opus) |
| Programme console and additions to the public tool | `web/` | Web agent (Sonnet) |
| Contracts, plan, operations and policy documents, integration testing | `docs/` | Orchestrator |

Contracts: `docs/api-contract.md` (unchanged), `docs/analysis-contract.md`, `docs/programme-contract.md`.

## Acceptance

- `pytest` passes (old and new).
- `python run.py` starts the API and web app; a fresh database seeds one example programme with projects at every stage.
- In the browser, as programme manager: take a real pilot block from screening to an active charge (audit, offer,
  consent, quote, commissioning), advance the clock a year, see monthly billing, a fault pausing a charge, a tenancy
  change, simulated meter readings, a verified-savings report and a charge true-up, with the reserve covering shortfalls.
- As tenant (access code): see the flat's deal, the charge, verified savings so far, and report a fault.
- As funder: see capital deployed, repayments, reserve and verified performance across the portfolio.
- As installer: see open tenders and submit a quote.
