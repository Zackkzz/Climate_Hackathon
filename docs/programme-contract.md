# Programme contract

The programme system runs an upgrade programme end to end: projects, consent, quotes, installation, the meter charge,
billing, faults, tenancy changes, measured savings and the reserve. Routes live under `/api/programme`, `/api/auth`
and `/api/sim`, served by the same FastAPI app as the existing API. JSON keys are snake_case, money is AUD, months are
`"YYYY-MM"`, dates `"YYYY-MM-DD"`, times ISO 8601 UTC.

Errors: `{"detail": "plain-language message", "code": "..."}` with 400, 401, 403, 404 or 409. Codes: `validation`,
`unauthorized`, `forbidden`, `not_found`, `conflict`, `stage_guard`.

Database: SQLite at `engine/var/meterwise.db` (`METERWISE_DB` overrides). All "now" comes from a clock service: real
time plus a stored offset in months, so the demo can run years of billing in seconds.

## Roles and sign-in

| Role | Sees and does |
|---|---|
| `manager` | Programme staff. Everything. |
| `owner` | Housing provider's asset officer. Their organisation's projects: audit, consent, tenancy changes, billing export. |
| `installer` | Open tenders, their quotes, their work orders and fault tickets. |
| `funder` | Read-only portfolio: capital, repayments, reserve, verified performance. No tenant names. |
| `tenant` | One flat, through an access code: the deal, the charge, verified savings, report a fault. |

- `POST /api/auth/login` `{"email","password"}` -> `{"token", "user": {"id","name","email","role","org": {"id","name","kind"}}}`
- `POST /api/auth/tenant` `{"code"}` -> `{"token", "flat_id", "project_id"}`
- `GET /api/auth/me` -> the same `user` object, or `{"role": "tenant", "flat_id", "project_id"}`
- `GET /api/auth/demo-users` -> `[{"role","name","email","password","org"}]` plus a few tenant codes. Only when
  `METERWISE_DEMO=1` (default). The sign-in page shows these so a judge can enter as any role.
- Bearer token in `Authorization`. Passwords hashed. Every organisation and person in the seed is fictional and has
  `"example": true`.

## Objects

```jsonc
// Programme
{"id": 1, "name": "Western Sydney community housing pilot", "example": true,
 "route": "community_housing",            // community_housing | council_rates | meter_attached
 "route_status": "usable_now",            // usable_now | needs_rule_change
 "finance": {"cost_of_capital": 0.055, "term_years": 10, "savings_share_to_charge": 0.8, "reserve": 0.05},
 "capital_committed": 1500000, "capital_deployed": 412000, "grant_pool": 300000, "grant_used": 96000,
 "reserve_balance": 18400, "repaid_to_date": 31200, "arrears": 240}

// Project (one block)
{"id": 7, "programme_id": 1, "building_id": "b_000123", "label": "12 Example Street, Penrith",
 "stage": "consent",       // screened | audit | offer | consent | procurement | installation | commissioned | active | closed
 "stage_since": "2026-11-03", "owner_org": {"id","name"}, "installer_org": {"id","name"} | null,
 "flats": 12, "heat_band": "hot",
 "summary": {"net_capex": 52000, "funding_gap": 21000, "grant_allocated": 21000, "fully_funded": false,
             "charge_per_month_building": 310.0, "tenant_net_saving_per_month": 14.3, "co2e_t_per_year_saved": 9.1},
 "consent": {"owner_signed": true, "tenants_total": 12, "tenants_agreed": 9, "tenants_declined": 1, "threshold": 0.75},
 "next_step": "plain sentence on what has to happen to move on", "blocked_by": ["..."],
 "flags": ["charge_paused", "true_up_due"]}

// ProjectDetail = Project + {
//   "building": {...as in /api/assess response...}, "existing": {...}, "package": {...}, "finance": {...}, "tariff": {...},
//   "assessment": <full /api/assess response, frozen when the offer is issued> | null,
//   "sizing": <analysis sizing result> | null, "schedule": <analysis schedule result> | null,
//   "audit": Audit | null, "quotes": Quote[], "work_order": WorkOrder | null, "flats_list": Flat[],
//   "stage_history": [{"stage","at","by","note"}], "mv": MvRun[] }

// Audit (site check that corrects open-data guesses)
{"visited_on": "2026-10-20", "by": "name", "storeys": 3, "flats": 12, "roof_m2": 310, "roof_condition": "sound",   // sound | needs_repair | unsuitable
 "roof_colour": "dark", "existing": {...}, "switchboard_amps": 63, "hot_water_layout": "per_flat",                 // per_flat | shared
 "gas_meters": 12, "notes": "...", "changes": [{"field": "flats", "from": 10, "to": 12}]}

// Flat
{"id": 91, "project_id": 7, "unit": "5", "position": "top", "meter_id": "NMI-EX-4100009105",
 "tenant_name": "R. Example" | null,       // null for funder role
 "tenancy_start": "2025-06-01", "consent": "agreed",   // pending | agreed | declined
 "charge_per_month": 44.0, "charge_status": "active",  // not_started | active | paused | ended
 "paused_reason": null, "balance_owing": 0.0, "principal_remaining": 3980.5, "months_billed": 6,
 "access_code": "FLAT-7K2Q"}               // manager and owner only

// LedgerEntry
{"id": 1, "flat_id": 91, "month": "2027-03", "at": "...", "kind": "charge",
 // charge | payment | pause_credit | true_up_refund | adjustment | write_off
 "amount": 44.0, "balance_after": 44.0, "note": "..."}

// Quote
{"id": 3, "project_id": 7, "installer_org": {"id","name"}, "submitted_on": "...", "valid_until": "...",
 "items": [{"key": "heat_pump_hot_water", "label": "...", "qty": 12, "unit_price": 3900, "total": 46800}],
 "total": 61000, "modelled_total": 63500, "status": "submitted", "note": "..."}   // submitted | accepted | declined | withdrawn

// WorkOrder
{"id": 2, "project_id": 7, "installer_org": {...}, "scheduled_start": "...", "completed_on": null,
 "checklist": [{"key": "roof_coating_thickness", "label": "Roof coating applied to specified thickness", "done": true, "by": "...", "at": "..."}],
 "warranty_years": 5}

// Fault
{"id": 5, "flat_id": 91, "project_id": 7, "item": "heat_pump_hot_water", "description": "No hot water",
 "reported_by": "tenant", "opened_on": "2027-04-02", "resolved_on": null, "status": "open",   // open | resolved
 "charge_paused": true, "months_paused": 0}

// MvRun (one verification of one project)
{"id": 4, "project_id": 7, "run_on": "2028-01-05", "period": {"from": "2027-01", "to": "2027-12"},
 "source": "simulated", "flats_verified": 11,
 "modelled_saving_per_month": 58.0, "verified_saving_per_month": 49.0, "realisation_rate": 0.84,
 "bill_neutral_flats": 10, "true_ups": [{"flat_id": 91, "action": "reduce_charge", "old_charge": 44.0, "new_charge": 39.0, "refund": 60.0}],
 "reserve_drawn": 60.0, "by_flat": [{"flat_id": 91, "unit": "5", "result": <analysis verify result>}]}

// ReserveEntry
{"id": 1, "at": "...", "month": "2027-03", "kind": "contribution",   // contribution | pause_cover | true_up_refund | arrears_cover | grant_top_up
 "amount": 22.0, "balance_after": 18400, "project_id": 7, "note": "..."}
```

## Routes

All need a token; role in brackets (`M` manager, `O` owner, `I` installer, `F` funder, `T` tenant). Owners and
installers only see their own organisation's records (403 otherwise).

### Programme and portfolio

| Method | Path | Roles | Returns |
|---|---|---|---|
| GET | `/api/programme` | M O F | `Programme` |
| PATCH | `/api/programme` | M | `Programme` (name, route, finance defaults, capital and grant figures) |
| GET | `/api/programme/overview` | M F | `{"programme": Programme, "pipeline": {"screened": n, ...per stage}, "flats": {"total","active_charges","paused"}, "money": {"deployed","repaid","interest","arrears","reserve","grant_used"}, "verified": {"projects","realisation_rate","tenant_saving_per_year","co2e_t_per_year"}, "modelled": {"tenant_saving_per_year","co2e_t_per_year"}, "monthly": [{"month","billed","collected","paused","reserve_balance"}]}` |
| GET | `/api/programme/projects` | M O F I | `Project[]` (filters `stage`, `q`) |
| POST | `/api/programme/projects` | M | body `{"building_id", "owner_org_id", "existing"?, "package"?}` -> `ProjectDetail` (stage `screened`; flats generated from the building with example meter ids) |
| GET | `/api/programme/projects/{id}` | M O F I | `ProjectDetail` (installers: only when a tender is open to them or they hold the work order) |
| PATCH | `/api/programme/projects/{id}` | M | package, existing, finance overrides, grant_allocated (reassesses) |
| POST | `/api/programme/projects/{id}/advance` | M | `{"to": "audit", "note"?}` -> `ProjectDetail`, or 409 `stage_guard` with the unmet conditions |
| GET | `/api/programme/orgs` | M | `[{"id","name","kind","example"}]` |
| GET | `/api/programme/audit-log` | M | `[{"at","by","role","action","project_id","detail"}]` (`limit`, `project_id`) |

### Stage guards

| To stage | Conditions |
|---|---|
| `audit` | none |
| `offer` | audit saved; roof condition not `unsuitable` when a cool roof is in the package. Issuing the offer freezes the assessment, sizing and schedule and generates the documents. |
| `consent` | offer issued |
| `procurement` | owner signed and tenants agreed >= threshold of flats. Flats whose tenant declined get no charge and no in-flat work. |
| `installation` | one quote accepted; funding gap covered by `grant_allocated` (or the owner) |
| `commissioned` | every checklist item done |
| `active` | commissioning recorded; start month set. Charges begin the following month. |
| `closed` | every flat's charge ended |

### Project work

| Method | Path | Roles | Notes |
|---|---|---|---|
| PUT | `/api/programme/projects/{id}/audit` | M O | body `Audit` fields -> `ProjectDetail`; reassesses with the corrected building |
| POST | `/api/programme/projects/{id}/consent/owner` | M O | `{"signed": true, "name"}` |
| POST | `/api/programme/flats/{id}/consent` | M O T | `{"consent": "agreed" | "declined"}` |
| POST | `/api/programme/projects/{id}/tender` | M | opens the project to installers `{"installer_org_ids": [...], "closes_on"}` |
| GET | `/api/programme/tenders` | I M | open tenders: `[{"project": Project, "items": [{"key","label","qty","modelled_unit_price"}], "sizing": {...}, "closes_on"}]` |
| POST | `/api/programme/projects/{id}/quotes` | I | `{"items": [...], "valid_until", "note"}` -> `Quote` |
| POST | `/api/programme/quotes/{id}/accept` | M | accepts it, declines the others, reassesses with quoted prices |
| POST | `/api/programme/projects/{id}/work-order` | M | `{"scheduled_start"}` -> `WorkOrder` |
| POST | `/api/programme/work-orders/{id}/checklist` | I M | `{"key", "done": true}` -> `WorkOrder` |
| GET | `/api/programme/projects/{id}/flats` | M O F | `Flat[]` |
| POST | `/api/programme/flats/{id}/tenancy-change` | M O | `{"new_tenant_name", "date"}` -> `Flat`. The charge stays with the meter; the old tenant's balance is settled; a new access code and a new disclosure document are issued. |
| GET | `/api/programme/flats/{id}/ledger` | M O T | `LedgerEntry[]` |
| POST | `/api/programme/flats/{id}/payments` | M O | `{"amount", "month"}` |

### Billing, faults, reserve

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/api/programme/billing/run` | M | `{"month"}` (default: current clock month) -> `{"month","flats_billed","billed","paused_flats","reserve_contribution"}`. Idempotent per month. |
| GET | `/api/programme/billing/export` | M O | `?month=&project_id=` -> CSV for the provider's rent ledger: unit, meter id, charge, status |
| GET | `/api/programme/faults` | M O I | `Fault[]` (`status`, `project_id`) |
| POST | `/api/programme/flats/{id}/faults` | M O T | `{"item", "description"}` -> `Fault`. Pauses that flat's charge from the current month. |
| POST | `/api/programme/faults/{id}/resolve` | M I | `{"note"}` -> `Fault`. Charge resumes next month; the paused months are covered from the reserve and the term is not extended. |
| GET | `/api/programme/reserve` | M F | `{"balance", "entries": ReserveEntry[]}` |

### Measured savings

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/programme/flats/{id}/readings` | M O T | `Reading[]` (analysis contract) |
| POST | `/api/programme/flats/{id}/readings` | M O | `{"readings": [Reading]}` or CSV upload (`month,electricity_kwh,gas_mj,indoor_hours_above_30c`), stored with `source: "uploaded"` |
| POST | `/api/programme/projects/{id}/mv/run` | M | `{"from","to"}` -> `MvRun`; applies true-ups (charge reductions, refunds from the reserve) and logs them |
| GET | `/api/programme/projects/{id}/mv` | M O F | `MvRun[]` |

### Documents

`GET /api/programme/projects/{id}/documents` -> `[{"kind","title","flat_id"?,"url","generated_at"}]`
`GET /api/programme/documents/{project_id}/{kind}.html[?flat_id=]` -> a self-contained printable HTML page.

Kinds: `tenant_disclosure` (per flat: what is installed, the charge, the estimated and guaranteed position, what
happens if equipment fails, if they move out, how to complain), `owner_agreement`, `funder_term_sheet`,
`charge_schedule` (per flat), `commissioning_certificate`, `mv_report`. Each carries: "Example document produced by a
prototype. Not legal or financial advice." Wording follows `docs/policy-australia.md` (Route A: a service charge
collected by the provider, not a loan to the tenant).

### Tenant view

`GET /api/programme/my-flat` (T) -> `{"flat": Flat (no other tenants' data), "project": {"label","stage"},
"deal": {"installed": [{"key","label"}], "charge_per_month", "modelled_saving_per_month", "net_saving_per_month",
"term_ends": "2036-12"}, "verified": {"verified_saving_per_month", "realisation_rate", "as_of"} | null,
"ledger": LedgerEntry[], "faults": Fault[], "documents": [...], "protections": ["plain sentences"]}`

## Simulated clock (demo; 403 `forbidden` when `METERWISE_DEMO=0`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/sim/clock` | `{"now": "...", "month": "2026-10", "offset_months": 0}` |
| POST | `/api/sim/advance` | `{"months": 1..36, "scenario"?: "as_modelled" | "mixed" | "underperforming"}` -> `{"month", "billing_runs", "readings_added", "faults_opened", "faults_resolved", "payments", "mv_runs"}`. Each month, for active projects: simulated readings for every flat (`source: "simulated"`), a billing run, payments (a seeded small share late), occasional seeded faults that open and resolve; every 12 months of charge an M&V run. |
| POST | `/api/sim/reset` | wipe and reseed; offset back to 0 |

## Seed (fresh database)

One example programme on Route A with a fictional provider, a fictional funder, two fictional installers and a
programme office. About ten projects on real pilot buildings spread over every stage, built by driving the real
service functions (not by inserting finished rows), including: two active projects with 14+ months of history
(billing, a resolved fault, a tenancy change, an M&V run with at least one true-up), one in installation with a
part-done checklist, one in procurement with two quotes, one in consent short of the threshold, one in audit, and
several screened. Seeding should take under about 30 seconds and be deterministic.
