# API contract

The backend (`engine/`) and the web app (`web/`) are built in parallel against this contract. The backend may add
fields. It must not rename or remove any field listed here. All money is AUD. All JSON keys are snake_case.

Base URL in development: `http://localhost:8000`. The web dev server proxies `/api` to it.

## GET /api/meta

```json
{
  "pilot": {
    "name": "Western Sydney pilot",
    "description": "One or two suburbs with many older rented walk-up flats",
    "centre": {"lat": -33.92, "lon": 151.07},
    "bbox": [151.05, -33.94, 151.09, -33.90],
    "building_count": 412
  },
  "defaults": {
    "existing": {"hot_water": "gas_storage", "heating": "electric_resistive", "cooling": "none", "cooktop": "gas", "roof": "dark"},
    "package": {"cool_roof": true, "heat_pump_hot_water": true, "reverse_cycle": true, "induction_cooktop": false, "ceiling_insulation": false, "disconnect_gas": false},
    "finance": {"cost_of_capital": 0.055, "term_years": 12, "savings_share_to_charge": 0.8, "reserve": 0.05, "apply_rebates": true},
    "tariff": {"electricity_c_per_kwh": 33.0, "electricity_supply_c_per_day": 105.0, "gas_c_per_mj": 4.5, "gas_supply_c_per_day": 70.0}
  },
  "options": {
    "hot_water": [{"key": "gas_storage", "label": "Gas storage tank"}, {"key": "gas_instant", "label": "Gas instantaneous"}, {"key": "electric_storage", "label": "Electric storage tank"}],
    "heating": [{"key": "gas_heater", "label": "Gas heater"}, {"key": "electric_resistive", "label": "Plug-in electric heater"}, {"key": "none", "label": "No heating"}],
    "cooling": [{"key": "none", "label": "No air conditioning"}, {"key": "old_ac", "label": "Old window or wall air conditioner"}],
    "cooktop": [{"key": "gas", "label": "Gas cooktop"}, {"key": "electric", "label": "Electric cooktop"}],
    "roof": [{"key": "dark", "label": "Dark roof"}, {"key": "light", "label": "Light roof"}]
  },
  "data_notes": ["Plain-language notes on data limits, shown in the app"]
}
```

The numbers above are placeholders. The backend returns sourced defaults.

## GET /api/buildings

Returns a GeoJSON `FeatureCollection` of candidate apartment buildings in the pilot area. Geometry is the building
footprint (`Polygon` or `MultiPolygon`, WGS84).

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {"type": "Polygon", "coordinates": [[[151.07, -33.92], [151.0701, -33.92], [151.0701, -33.9201], [151.07, -33.92]]]},
      "properties": {
        "id": "b_000123",
        "label": "12 Example Street, Lakemba",
        "suburb": "Lakemba",
        "storeys": 3,
        "storeys_source": "osm",
        "flats_est": 12,
        "footprint_m2": 310.5,
        "roof_m2": 310.5,
        "heat_anomaly_c": 2.4,
        "heat_band": "hot",
        "renter_share": 0.71,
        "quick_score": 78
      }
    }
  ]
}
```

- `label` may be a street address, a building name, or `"Block near <street>"` when no address is known.
- `storeys_source` is `"osm"` when mapped, `"assumed"` otherwise.
- `heat_anomaly_c` is how much hotter the land surface at the building is than the pilot-area median on hot summer
  days (satellite-derived). It is a surface temperature difference, not air temperature.
- `heat_band` is one of `"cooler"`, `"average"`, `"warm"`, `"hot"`, `"hottest"` (quintiles within the pilot area).
- `renter_share` is the share of dwellings rented in the surrounding census area, or `null` when unknown.
- `quick_score` is 0-100, a screening rank that combines heat and renter share. Higher means look here first.

## GET /api/buildings/{id}

Returns one feature from the collection above, or 404.

## POST /api/assess

Request. Every top-level key except one of `building_id` / `building` is optional; missing values use the defaults
from `/api/meta`.

```json
{
  "building_id": "b_000123",
  "building": {"storeys": 3, "flats": 12, "roof_m2": 310.5, "flat_area_m2": 65, "lat": -33.92, "lon": 151.07, "heat_anomaly_c": 2.4},
  "existing": {"hot_water": "gas_storage", "heating": "electric_resistive", "cooling": "none", "cooktop": "gas", "roof": "dark"},
  "package": {"cool_roof": true, "heat_pump_hot_water": true, "reverse_cycle": true, "induction_cooktop": false, "ceiling_insulation": false, "disconnect_gas": false},
  "finance": {"cost_of_capital": 0.055, "term_years": 12, "savings_share_to_charge": 0.8, "reserve": 0.05, "apply_rebates": true},
  "tariff": {"electricity_c_per_kwh": 33.0, "electricity_supply_c_per_day": 105.0, "gas_c_per_mj": 4.5, "gas_supply_c_per_day": 70.0}
}
```

- When `building_id` is given, `building` holds overrides only (for example the user corrects the number of flats).
- When there is no `building_id`, `building` must hold `storeys`, `flats`, `roof_m2`, `lat`, `lon`.
- `savings_share_to_charge` is the largest share of a flat's modelled bill saving that the meter charge may take.
  0.8 means the tenant keeps at least 20% of the saving.
- `disconnect_gas` is only allowed when every gas appliance in `existing` is replaced by the package. The backend
  ignores it otherwise and adds a warning.

Response:

```json
{
  "building": {"id": "b_000123", "label": "12 Example Street, Lakemba", "storeys": 3, "flats": 12, "roof_m2": 310.5, "flat_area_m2": 65, "heat_anomaly_c": 2.4, "heat_band": "hot"},
  "flat_groups": [
    {
      "position": "top",
      "label": "Top-floor flats",
      "count": 4,
      "baseline": {
        "electricity_kwh": 3100, "gas_mj": 14000, "bill_per_year": 2710,
        "by_end_use": [{"key": "hot_water", "label": "Hot water", "cost_per_year": 620, "electricity_kwh": 0, "gas_mj": 11000}]
      },
      "upgraded": {
        "electricity_kwh": 3300, "gas_mj": 3000, "bill_per_year": 2010,
        "by_end_use": [{"key": "hot_water", "label": "Hot water", "cost_per_year": 190, "electricity_kwh": 580, "gas_mj": 0}]
      },
      "saving_per_year": 700,
      "charge_per_month": 44.0,
      "net_saving_per_month": 14.3,
      "net_saving_pct": 6.3,
      "bill_neutral": true,
      "comfort": {"hours_above_30c_baseline": 212, "hours_above_30c_upgraded": 96, "peak_indoor_c_baseline": 36.8, "peak_indoor_c_upgraded": 33.9}
    },
    {"position": "lower", "label": "Lower-floor flats", "count": 8, "baseline": {}, "upgraded": {}, "saving_per_year": 0, "charge_per_month": 0, "net_saving_per_month": 0, "net_saving_pct": 0, "bill_neutral": true, "comfort": {}}
  ],
  "package": {
    "items": [
      {"key": "cool_roof", "label": "Reflective cool roof coating", "selected": true, "capex": 9300, "rebate": 0, "net_capex": 9300, "applies_to": "building", "saving_per_year": 610, "note": "Benefits top-floor flats only"}
    ],
    "capex_total": 61000,
    "rebates_total": 9000,
    "net_capex": 52000,
    "max_fundable_capex": 56500,
    "fully_funded": true,
    "funding_gap": 0
  },
  "finance": {
    "term_years": 12,
    "cost_of_capital": 0.055,
    "savings_share_to_charge": 0.8,
    "reserve": 0.05,
    "charge_per_month_building": 480.0,
    "total_repaid": 69120,
    "investor_return_pct": 5.5,
    "owner_upfront_cost": 0,
    "tenant_upfront_cost": 0
  },
  "impact": {
    "bill_saving_per_year_building": 8400,
    "co2e_t_per_year_saved": 9.1,
    "gas_mj_per_year_avoided": 150000,
    "energy_reduction_pct": 41.0,
    "peak_cooling_kw_change": -3.2
  },
  "monthly": [
    {"month": 1, "label": "Jan", "baseline_bill": 230, "upgraded_bill": 170, "charge": 44}
  ],
  "heatwave": {
    "label": "Hottest week in the weather record used",
    "start": "2020-01-01T00:00",
    "hours": [0, 1, 2],
    "outdoor_c": [24.1, 23.8, 23.5],
    "indoor_top_baseline_c": [29.0, 28.8, 28.6],
    "indoor_top_upgraded_c": [27.9, 27.7, 27.5]
  },
  "assumptions": [
    {"key": "hot_water_litres_per_day", "label": "Hot water used per flat", "value": 110, "unit": "L/day", "source": "https://example.org/source", "kind": "sourced"}
  ],
  "warnings": ["Plain-language warnings, for example: storeys were assumed, not mapped"]
}
```

Rules the backend guarantees:

- `flat_groups` always has a `"top"` group and, when the building has more than one storey, a `"lower"` group. All
  fields shown for the top group are present in every group.
- `monthly` has 12 entries and describes an average flat in the building (weighted by group counts).
- `heatwave` arrays have equal length (hourly, 168 entries). Indoor temperatures are for a top-floor flat with no air
  conditioning running, to show the passive effect of the roof.
- The meter charge per flat is the lower of (a) the charge that repays that flat's share of `net_capex` over the term
  at the cost of capital, and (b) `savings_share_to_charge` x that flat's modelled monthly saving. If (b) binds, the
  package is not fully funded: `fully_funded` is false and `funding_gap` is the capital that the charge cannot repay.
- `bill_neutral` is true when the flat's upgraded bill plus the charge is no higher than its baseline bill.
- `assumptions[].kind` is `"sourced"` (with a URL in `source`) or `"assumption"` (source is the literal string
  `"assumption"`).
- Errors use HTTP 400 or 404 with `{"detail": "plain-language message"}`.

## POST /api/portfolio

Runs the default package on several buildings to rank them.

Request: `{"building_ids": ["b_000123", "b_000456"], "finance": {}, "package": {}, "existing": {}, "tariff": {}}`
(everything except `building_ids` optional; at most 50 ids).

Response:

```json
{
  "results": [
    {"building_id": "b_000123", "label": "12 Example Street, Lakemba", "flats": 12, "heat_band": "hot", "net_capex": 52000, "fully_funded": true, "funding_gap": 0, "tenant_net_saving_per_month": 14.3, "co2e_t_per_year_saved": 9.1}
  ],
  "totals": {"buildings": 2, "flats": 24, "net_capex": 101000, "funding_gap": 0, "co2e_t_per_year_saved": 17.5, "fully_funded_count": 2}
}
```

## GET /api/health

`{"status": "ok"}`
