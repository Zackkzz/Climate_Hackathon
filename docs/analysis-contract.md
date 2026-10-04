# Analysis contract

Stateless analysis added to the engine. Each item is both an HTTP endpoint (router in `engine/api/analysis.py`,
mounted by `main.py`) and a Python function of the same shape in `engine/meterwise/` that the programme system calls
in-process. JSON keys are snake_case, money is AUD, same error format as `api-contract.md`.

`AssessRequest` below means the existing request body of `POST /api/assess`.

## Microclimate

`GET /api/buildings/{id}/microclimate` · `meterwise.microclimate.summary(building_id) -> dict`

```json
{"building_id": "b_000123", "heat_anomaly_c": 2.4, "heat_band": "hot",
 "air_temp_adjustment": {"day_c": 0.9, "night_c": 0.5, "method": "plain sentence", "kind": "assumption"},
 "base_weather": {"source": "ERA5 via Open-Meteo", "year": 2025, "grid_km": 9},
 "summer": {"mean_max_c_base": 29.8, "mean_max_c_local": 30.7, "days_over_35_base": 21, "days_over_35_local": 26,
            "cooling_degree_hours_base": 5200, "cooling_degree_hours_local": 5900},
 "monthly": [{"month": 1, "label": "Jan", "mean_max_c_base": 31.0, "mean_max_c_local": 31.9}],
 "notes": ["Surface temperature from satellite is not air temperature. ..."]}
```

`GET /api/buildings/{id}/weather.epw` · `meterwise.microclimate.to_epw(building_id) -> str`
A valid EnergyPlus weather file (8760 hours) with the local adjustment applied, `text/plain`, with a
`Content-Disposition` filename. Fields the source data lacks use the EPW missing-value codes; the header comment
states the method and that the adjustment is an assumption.

## Sizing

`POST /api/sizing` (body: `AssessRequest`) · `meterwise.sizing.size_systems(req) -> dict`

```json
{"groups": [
   {"position": "top", "count": 4,
    "design_cooling_kw_without_roof": 3.9, "design_cooling_kw_with_package": 2.8, "reduction_pct": 28.2,
    "unit_kw_without_roof": 5.0, "unit_kw_with_package": 3.5,
    "unit_cost_without_roof": 3900, "unit_cost_with_package": 3200,
    "design_heating_kw": 1.9}],
 "hot_water": {"system": "heat_pump_shared" , "units": 2, "kw_each": 1.0, "note": "..."},
 "electrical": {"per_flat_added_amps": 9.5, "typical_supply_amps": 63, "flat_supply_ok": true,
                "building_peak_kw_before": 41.0, "building_peak_kw_after": 38.5,
                "building_peak_kw_after_without_roof": 44.0,
                "switchboard_upgrade_likely": false, "upgrade_cost_avoided": 0,
                "note": "plain sentence", "kind": "assumption"},
 "capex_saved_by_right_sizing": 2800,
 "assumptions": [{"key": "...", "label": "...", "value": 0, "unit": "", "source": "...", "kind": "sourced"}],
 "warnings": ["..."]}
```

Design day = the hottest hours of the local weather year (state the percentile used). Cool roof and insulation change
top-floor flats only.

## Charge schedule and risk

`POST /api/schedule` (body: `AssessRequest` plus `"start": "2027-01"`) · `meterwise.tariff.schedule(req, start) -> dict`

```json
{"term_years": 10, "months": 120, "start": "2027-01", "end": "2036-12",
 "groups": [{"position": "top", "count": 4, "principal_per_flat": 4200, "charge_per_month": 44.0,
             "rows": [{"n": 1, "month": "2027-01", "charge": 44.0, "interest": 19.2, "principal": 24.8, "balance": 4175.2}]}],
 "building": {"principal": 52000, "charge_per_month": 480.0, "total_repaid": 57600, "total_interest": 5600},
 "reserve": {"rate": 0.05, "contribution_total": 2600, "note": "..."},
 "cool_roof_ageing": {"reflectance_new": 0.8, "reflectance_aged_3yr": 0.65, "used_in_model": "aged",
                      "wash_interval_years": 3, "wash_cost": 900, "source": "..."},
 "equipment_life_check": [{"key": "heat_pump_hot_water", "life_years": 12, "term_years": 10, "ok": true}]}
```

`POST /api/risk` (body: `AssessRequest` plus `"runs": 500, "seed": 1`) · `meterwise.tariff.risk(req, runs, seed) -> dict`

Varies the uncertain inputs (occupant energy use, electricity and gas prices, equipment performance, weather year
severity, roof ageing) over stated ranges and reruns the bill arithmetic.

```json
{"runs": 500, "seed": 1,
 "groups": [{"position": "top", "net_saving_per_month": {"p10": 2.1, "p50": 14.3, "p90": 27.0},
             "prob_tenant_worse_off": 0.07, "prob_saving_below_charge": 0.07}],
 "building": {"prob_fully_funded": 0.31, "funding_gap": {"p10": 0, "p50": 21000, "p90": 38000}},
 "drivers": [{"key": "occupant_use", "label": "How much hot water and heating people use", "share_of_variance": 0.44}],
 "inputs_varied": [{"key": "occupant_use", "label": "...", "low": 0.7, "high": 1.3, "distribution": "triangular", "source": "..."}],
 "safe_share": {"savings_share_to_charge": 0.68, "meaning": "share at which 95% of runs leave the tenant no worse off"}}
```

## Measurement and verification (M&V)

Monthly reading for one flat:
`{"month": "2027-03", "electricity_kwh": 251.0, "gas_mj": 0.0, "indoor_hours_above_30c": 12, "mean_outdoor_c": 21.4, "source": "simulated"}`
(`source` is `simulated` or `uploaded`; `indoor_hours_above_30c` and `mean_outdoor_c` may be null).

`POST /api/mv/simulate` · `meterwise.mv.simulate(req, position, months, start, seed, scenario, upgraded) -> list`
Body: `{"assess": AssessRequest, "position": "top", "start": "2026-01", "months": 12, "seed": 7,
"scenario": "as_modelled" | "high_use" | "low_use" | "underperforming_hot_water" | "faulty_ac", "upgraded": true}`.
Returns `{"readings": [Reading]}` built from the thermal model for the flat, with seeded household variation and
month-to-month noise. Always `source: "simulated"`.

`POST /api/mv/verify` · `meterwise.mv.verify(req, position, baseline, post, charge_per_month) -> dict`
Body: `{"assess": AssessRequest, "position": "top", "baseline": [Reading], "post": [Reading], "charge_per_month": 44.0}`.
`baseline` is at least 6 months before the upgrade, `post` at least 3 months after.

```json
{"method": "plain description: baseline energy regressed on degree days, then projected onto post-period weather",
 "baseline_fit": {"r2": 0.86, "months": 12}, "post_months": 12,
 "modelled_saving_per_month": 58.0, "verified_saving_per_month": 49.0, "realisation_rate": 0.84,
 "uncertainty_per_month": 9.0, "confidence": "medium",
 "tenant_net_per_month": 5.0, "bill_neutral_verified": true,
 "comfort": {"hours_above_30c_before": 190, "hours_above_30c_after": 80},
 "by_month": [{"month": "2027-03", "expected_baseline_cost": 210, "actual_cost": 160, "saving": 50}],
 "true_up": {"action": "none" | "reduce_charge" | "refund_from_reserve",
             "new_charge_per_month": 44.0, "refund": 0, "reason": "plain sentence"},
 "flags": ["Hot water use is 40% above the model: check the unit's settings"]}
```

True-up rule: the tenant must keep at least `1 - savings_share_to_charge` of the verified saving. If the charge
exceeds `share x verified saving` by more than the uncertainty, reduce the charge to that level and refund the
difference for the months already billed from the reserve.

## Portfolio planner

`POST /api/portfolio/plan` · `meterwise.portfolio.plan(body) -> dict`
Body: `{"building_ids": [...] (optional; default = all pilot buildings, capped at 120), "capital_budget": 1500000,
"grant_budget": 300000, "objective": "tenant_saving" | "co2" | "heat_relief" | "flats_reached",
"package": {}, "existing": {}, "finance": {}, "tariff": {}, "bulk": true}`

```json
{"selected": [{"building_id": "...", "label": "...", "flats": 12, "net_capex": 52000, "capital_used": 31000,
               "grant_used": 21000, "tenant_net_saving_per_month": 14.3, "co2e_t_per_year_saved": 9.1,
               "top_floor_hours_above_30c_avoided": 116, "score": 0.82}],
 "not_selected": [{"building_id": "...", "label": "...", "reason": "Gap larger than remaining grant"}],
 "totals": {"buildings": 9, "flats": 104, "capital_used": 0, "grant_used": 0, "capital_left": 0, "grant_left": 0,
            "tenant_saving_per_year": 0, "co2e_t_per_year_saved": 0, "building_peak_kw_change": 0},
 "bulk": {"applied": true, "tiers": [{"item": "heat_pump_hot_water", "units": 104, "discount_pct": 8, "kind": "assumption"}],
          "capex_saved": 0},
 "method": "plain sentence on how blocks were chosen"}
```

Must return within about 20 seconds for 120 buildings (cache assessments by building archetype where sound).
