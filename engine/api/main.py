"""Meterwise HTTP API (FastAPI). See docs/api-contract.md."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from meterwise import buildings as B
from meterwise.credits import all_credits
from meterwise import params as P
from meterwise.assess import DISCLAIMER, AssessError, assess
from meterwise.models import OPTIONS, AssessRequest, AssessResponse, PortfolioRequest
from meterwise.weather import WEATHER_YEAR

app = FastAPI(title="Meterwise API", version="0.1.0",
              description="Bill-neutral electrification and cool-roof deals for rented flats (screening tool).")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


def _plain_validation_message(exc: RequestValidationError) -> str:
    parts = []
    for e in exc.errors():
        loc = ".".join(str(x) for x in e.get("loc", []) if x not in ("body",))
        msg = e.get("msg", "is not valid")
        parts.append(f"{loc}: {msg}" if loc else msg)
    return "Some inputs are not valid. " + "; ".join(parts)


@app.exception_handler(RequestValidationError)
async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": _plain_validation_message(exc)})


@app.exception_handler(AssessError)
async def _assess_handler(_: Request, exc: AssessError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict[str, Any]:
    ds = B.load()
    m = ds.meta
    notes = list(m.get("data_notes", []))
    notes += [
        DISCLAIMER,
        "Heat values come from satellite land-surface temperature (how hot roofs and ground get), not air temperature. "
        "The model turns them into a small, capped air temperature adjustment, which is an assumption.",
        f"Weather is one real year ({WEATHER_YEAR}) of hourly ERA5 reanalysis data from Open-Meteo for the area.",
        "Energy use is modelled for a typical flat, not measured from meters. Real bills vary with how people live.",
        f"Prices are 2026-27 NSW default offers ({P.v('electricity_network')} electricity, Jemena gas) including GST.",
    ]
    notes += ds.warnings
    return {
        "pilot": {"name": m.get("name"), "description": m.get("description", ""), "centre": m.get("centre"),
                  "bbox": m.get("bbox"), "building_count": m.get("building_count", len(ds.features)),
                  "is_fixture": ds.is_fixture},
        "defaults": {
            "existing": {"hot_water": "gas_storage", "heating": "electric_resistive", "cooling": "none",
                         "cooktop": "gas", "roof": "dark"},
            "package": {"cool_roof": True, "heat_pump_hot_water": True, "reverse_cycle": True,
                        "induction_cooktop": False, "ceiling_insulation": False, "disconnect_gas": False},
            "finance": {"cost_of_capital": P.v("cost_of_capital"), "term_years": P.v("term_years"),
                        "savings_share_to_charge": P.v("savings_share_to_charge"), "reserve": P.v("reserve"),
                        "apply_rebates": True},
            "tariff": {"electricity_c_per_kwh": P.v("electricity_c_per_kwh"),
                       "electricity_supply_c_per_day": P.v("electricity_supply_c_per_day"),
                       "gas_c_per_mj": P.v("gas_c_per_mj"), "gas_supply_c_per_day": P.v("gas_supply_c_per_day")},
            "flat_area_m2": P.v("flat_area_m2"),
        },
        "options": OPTIONS,
        "data_notes": notes,
        "credits": all_credits(),
        "assumptions": P.as_assumptions(),
    }


@app.get("/api/buildings")
def buildings() -> dict[str, Any]:
    ds = B.load()
    return {"type": "FeatureCollection", "features": [B.public_feature(f) for f in ds.features]}


@app.get("/api/buildings/{building_id}")
def building(building_id: str) -> dict[str, Any]:
    f = B.load().by_id.get(building_id)
    if f is None:
        raise AssessError(f"No building with id '{building_id}' was found.", 404)
    return B.public_feature(f)


@app.post("/api/assess", response_model=AssessResponse, response_model_exclude_none=False)
def assess_endpoint(req: AssessRequest) -> dict[str, Any]:
    return assess(req)


@app.post("/api/portfolio")
def portfolio(req: PortfolioRequest) -> dict[str, Any]:
    ds = B.load()
    unknown = [i for i in req.building_ids if i not in ds.by_id]
    if unknown:
        raise AssessError("These building ids were not found: " + ", ".join(unknown[:10]), 404)
    results = []
    for bid in dict.fromkeys(req.building_ids):  # keep order, drop duplicates
        r = assess(AssessRequest(building_id=bid, existing=req.existing, package=req.package, finance=req.finance,
                                 tariff=req.tariff))
        groups = r["flat_groups"]
        flats = r["building"]["flats"]
        tenant = sum(g["count"] * g["net_saving_per_month"] for g in groups) / flats
        results.append({
            "building_id": bid, "label": r["building"]["label"], "flats": flats, "heat_band": r["building"]["heat_band"],
            "net_capex": r["package"]["net_capex"], "fully_funded": r["package"]["fully_funded"],
            "funding_gap": r["package"]["funding_gap"], "tenant_net_saving_per_month": round(tenant, 2),
            "co2e_t_per_year_saved": r["impact"]["co2e_t_per_year_saved"],
            "max_fundable_capex": r["package"]["max_fundable_capex"],
            "bill_saving_per_year_building": r["impact"]["bill_saving_per_year_building"],
            "top_floor_hours_above_30c_avoided": groups[0]["comfort"]["hours_above_30c_baseline"]
            - groups[0]["comfort"]["hours_above_30c_upgraded"],
        })
    totals = {
        "buildings": len(results),
        "flats": sum(r["flats"] for r in results),
        "net_capex": round(sum(r["net_capex"] for r in results), 2),
        "funding_gap": round(sum(r["funding_gap"] for r in results), 2),
        "co2e_t_per_year_saved": round(sum(r["co2e_t_per_year_saved"] for r in results), 2),
        "fully_funded_count": sum(1 for r in results if r["fully_funded"]),
    }
    return {"results": results, "totals": totals}
