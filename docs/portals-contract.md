# Portals contract (addendum to the programme contract)

Added 4 October. The service has three portals, each a working dashboard for one kind of organisation. This
overrides the role list in `programme-contract.md` where they differ; every route there stays.

| Portal | Path | Who signs in | Roles |
|---|---|---|---|
| Government | `/government` | Council (LGA) programme officers and state agency staff | `manager` (runs the programme: everything in the programme contract), `government` (state or council oversight: read everything except tenant names, approve grants, set targets, export reports) |
| Utility | `/utility` | Electricity distributor, electricity retailer, gas network | `utility` |
| Property | `/property` | Landlords, strata committees, community housing providers, and tenants | `owner` (org kinds `landlord`, `strata`, `community_housing`), `tenant` (access code) |

Installers (`installer`) and funders (`funder`) keep their views from the programme contract as secondary pages
(`/installer`, `/funder`). Organisation kinds: `council`, `state_agency`, `distributor`, `retailer`, `gas_network`,
`landlord`, `strata`, `community_housing`, `installer`, `funder`.

No tenant names, access codes or ledgers are ever returned to `utility`, `government`, `funder` or `installer`.
Utilities see only meters in their own network area or customer base (seed: one distributor covering the pilot area,
one retailer with a share of the meters, one gas network).

## Utility routes (`utility`; `manager` may read)

```jsonc
// MeterRow
{"meter_id": "NMI-EX-4100009105", "project_id": 7, "address": "5/12 Example Street, Penrith", "position": "top",
 "stage": "active", "charge_status": "active", "charge_per_month": 44.0, "commissioned_on": "2027-01-15",
 "has_gas": false, "retailer_customer": true, "last_reading_month": "2027-09", "reading_source": "utility"}

// NetworkImpact
{"as_of": "2027-10", "area": "Penrith and Kingswood",
 "totals": {"projects": 4, "flats": 44, "peak_kw_before": 150.0, "peak_kw_after": 141.0, "peak_kw_after_without_roof": 162.0,
            "annual_kwh_change": 31000, "gas_mj_avoided_per_year": 610000, "gas_connections_removed": 44,
            "switchboard_upgrades_likely": 0},
 "by_project": [{"project_id": 7, "label": "...", "stage": "active", "flats": 12, "commissioned_on": "...",
                 "peak_kw_before": 41.0, "peak_kw_after": 38.5, "annual_kwh_change": 8200, "gas_mj_avoided_per_year": 150000,
                 "switchboard_upgrade_likely": false}],
 "forecast": [{"month": "2027-11", "projects_commissioning": 1, "added_peak_kw": -2.5, "added_annual_kwh": 8200}],
 "basis": "Modelled design-day peak per building from the sizing module. Not a network study."}

// GasDisconnection
{"id": 3, "project_id": 7, "meters": 12, "requested_on": "...", "status": "requested",   // requested | scheduled | completed | cancelled
 "scheduled_for": null, "completed_on": null, "note": "..."}

// SupplyRequest (raised when sizing says a switchboard or supply upgrade is likely)
{"id": 2, "project_id": 9, "kind": "switchboard_upgrade", "detail": "...", "status": "open",  // open | approved | not_needed | completed
 "raised_on": "...", "response": null}
```

| Method | Path | Notes |
|---|---|---|
| GET | `/api/utility/summary` | `{"org": {...}, "meters": {"total","active_charges","paused"}, "billing": {"month","to_bill","billed","remitted","outstanding"}, "network": NetworkImpact.totals, "open": {"gas_disconnections","supply_requests","readings_overdue_meters"}}` |
| GET | `/api/utility/meters` | `MeterRow[]` (`q`, `stage`, `charge_status`) |
| GET | `/api/utility/network-impact` | `NetworkImpact` |
| POST | `/api/utility/readings` | Bulk meter data: JSON `{"readings": [{"meter_id","month","electricity_kwh","gas_mj"}]}` or CSV upload (`meter_id,month,electricity_kwh,gas_mj`). Stored with `source: "utility"`; rows for unknown meters are rejected and listed. Returns `{"accepted", "rejected": [{"row","reason"}]}`. Used by measured-savings checks in preference to simulated data. |
| GET | `/api/utility/readings/template.csv` | Header row plus the meters that are due. |
| GET | `/api/utility/charge-file` | `?month=` CSV of charges per meter for on-bill collection (Route C): meter id, amount, status, paused flag. |
| POST | `/api/utility/remittance` | `{"month", "rows": [{"meter_id","amount"}]}` or CSV: records what the utility collected and passed on; posts payments to the ledgers. Returns totals and mismatches. |
| GET | `/api/utility/gas-disconnections` | `GasDisconnection[]` |
| POST | `/api/utility/gas-disconnections/{id}` | `{"status", "scheduled_for"?, "note"?}` |
| GET | `/api/utility/supply-requests` | `SupplyRequest[]` |
| POST | `/api/utility/supply-requests/{id}` | `{"status", "response"}` |

The programme side raises a `GasDisconnection` automatically when a project with `disconnect_gas` is commissioned, and a
`SupplyRequest` when the frozen sizing says an upgrade is likely. `Reading.source` gains `"utility"`.

## Government routes (`government`, `manager`)

```jsonc
// Outcomes
{"as_of": "2027-10", "programme": Programme,
 "reach": {"projects_active": 4, "flats_upgraded": 44, "households_renting_est": 31, "blocks_in_pipeline": 6},
 "money": {"grant_committed": 300000, "grant_spent": 96000, "capital_deployed": 412000, "repaid": 31200,
           "reserve": 18400, "cost_per_flat": 9400, "grant_per_tonne_co2e": 210},
 "impact_modelled": {"tenant_saving_per_year": 21000, "co2e_t_per_year": 36.0, "gas_mj_per_year_avoided": 610000,
                     "energy_reduction_pct": 38.0, "top_floor_hours_above_30c_avoided": 460},
 "impact_verified": {"projects": 2, "realisation_rate": 0.86, "tenant_saving_per_year": 9800, "co2e_t_per_year": 16.0} | null,
 "protections": {"charges_paused_months": 3, "true_ups": 2, "refunded": 120.0, "tenants_worse_off_verified": 0, "complaints_open": 0},
 "targets": [{"key": "flats_upgraded", "label": "Flats upgraded", "target": 200, "by": "2028-06", "actual": 44}],
 "by_area": [{"area": "Penrith", "kind": "suburb", "buildings": 210, "flats_est": 2300, "renter_share": 0.7,
              "hottest_band_buildings": 48, "projects": 6, "flats_upgraded": 30}]}

// Grant
{"id": 4, "project_id": 7, "requested": 21000, "approved": 21000, "status": "approved",   // requested | approved | declined | paid
 "reason": "Funding gap after capped charge", "requested_on": "...", "decided_on": "...", "decided_by": "..."}
```

| Method | Path | Notes |
|---|---|---|
| GET | `/api/government/outcomes` | `Outcomes` |
| PUT | `/api/government/targets` | `{"targets": [{"key","label","target","by"}]}` (keys: `flats_upgraded`, `co2e_t_per_year`, `tenant_saving_per_year`, `grant_spent`) |
| GET | `/api/government/areas` | `Outcomes.by_area` plus `"buildings"`: per-building points `{"building_id","lat","lon","heat_band","renter_share","flats_est","project_stage"}` for the map |
| GET | `/api/government/grants` | `Grant[]` |
| POST | `/api/government/grants` | (`manager`) `{"project_id","requested","reason"}` |
| POST | `/api/government/grants/{id}/decide` | (`government`) `{"approved": number, "status": "approved" or "declined", "note"}`; approval sets the project's `grant_allocated` and draws on the grant pool |
| GET | `/api/government/reports/{kind}.csv` | kinds: `projects`, `outcomes`, `verified_savings`, `grants`, `charges` (no tenant names), `audit_log` |
| GET | `/api/government/routes` | The three delivery routes with status, what rule change each needs, and how many pilot blocks each could reach (Route A: provider-owned; Route B: strata above 20 lots; Route C: all), from the dataset where it can be computed and marked as an estimate |
| GET | `/api/government/controls` | The security and privacy controls the running system has switched on (see below), for the IT assurance page |

## Property routes (`owner`, `tenant`)

Everything owners and tenants need is already in the programme contract. Additions:

- `GET /api/property/summary` (`owner`): `{"org", "blocks": Project[], "actions": [{"project_id","label","kind","text"}], "charges": {"month","flats_active","billed","collected","arrears"}, "faults_open": n, "consent_pending": n}` where `actions` is the to-do list (sign consent, book site visit, tenancy change paperwork, payments to record).
- `POST /api/property/enquiries` (no auth): a landlord or strata committee asks to be considered: `{"name","email","phone"?,"org_kind","address","flats","message"}` -> `{"id"}`. `GET /api/programme/enquiries` (`manager`), `POST /api/programme/enquiries/{id}/convert` creates a project on the nearest pilot building.
- Strata: owner consent for org kind `strata` records the meeting resolution: `{"signed": true, "name", "resolution": {"meeting_date","votes_for","votes_against","kind": "ordinary"}}`.

## Security, privacy and accessibility controls (application level)

The service is built to the controls a NSW council or agency would ask a supplier about. The research note
`docs/research-gov-it-standards.md` has the sources; `docs/it-assurance.md` maps each control to its evidence.

Backend:

1. Sessions: signed tokens with 12-hour absolute expiry and 30-minute idle expiry (sliding), `POST /api/auth/logout` revokes.
2. Passwords: minimum 14 characters, checked against a short common-password list, PBKDF2 or scrypt hashing, lockout after 5 failed attempts for 15 minutes, login rate limit per IP.
3. Multi-factor: TOTP (RFC 6238, stdlib) for every staff role: `POST /api/auth/mfa/setup`, `/verify`; login returns `{"mfa_required": true, "ticket"}` then `POST /api/auth/mfa/login`. Demo accounts are exempt only while `METERWISE_DEMO=1`, and `/api/government/controls` reports that exemption.
4. Single sign-on readiness: an OIDC settings block (`METERWISE_OIDC_*`) and a documented callback route that returns 501 with a clear message until configured. Do not fake an identity provider.
5. Role and organisation checks on every route, tested; default deny.
6. Audit log: append-only, each entry carries the hash of the previous one; `GET /api/programme/audit-log/verify` checks the chain. Logs sign-ins, failures, reads of tenant data, exports and every change.
7. Response headers on everything: `Content-Security-Policy` (self only, plus the map tile host), `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`, `Cache-Control: no-store` on API responses.
8. CORS limited to configured origins; `METERWISE_DEMO=0` turns off demo users, the simulated clock and reset.
9. Input validation on every body; upload size and row limits; CSV exports neutralise formula injection (cells starting with `= + - @`).
10. Privacy: tenant personal data limited to name and unit; `GET /api/programme/flats/{id}/personal-data` (export for an access request), `POST .../erase` (replace name with "Former tenant", keep the meter ledger), a retention setting, and a data inventory at `/api/government/controls`.
11. Secrets only from environment; refuse to start with the default secret when `METERWISE_DEMO=0`.
12. `/.well-known/security.txt`, `/api/health` and `/api/ready`; structured request log with request id; no personal data in logs.
13. Dependencies pinned (`requirements.lock`, `package-lock.json`) and a software bill of materials in `docs/sbom/`.

Front end:

14. WCAG 2.2 AA: keyboard operable, visible focus, contrast, target size 24 px minimum, reflow at 320 px, labels and error identification, status messages announced, no information by colour alone, skip link, page titles, language attribute.
15. No analytics or trackers. Fonts and icons bundled. The one third-party script is the Google Maps JavaScript API in the block finder (map code, images and the fonts of its controls come from Google); the Content Security Policy allows scripts only from `maps.googleapis.com` and `maps.gstatic.com`.
16. Session timeout warning with extend; sign-out everywhere; no tokens in URLs; tokens in memory plus `sessionStorage` only.
17. Privacy notice, accessibility statement and terms pages, linked in the footer of every portal.
