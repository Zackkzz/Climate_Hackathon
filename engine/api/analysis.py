"""Analysis endpoints (docs/analysis-contract.md): microclimate, EPW export, sizing, charge schedule, risk, M&V and the
portfolio planner. Thin wrappers over the functions in ``meterwise``; errors use the same plain-language format as
the rest of the API ({"detail": "..."} with HTTP 400 or 404).

Mounted by main.py with ``app.include_router(analysis_router)``. The app-level handlers in main.py turn AssessError
and validation errors into that format; ``install_error_handlers`` does the same for a standalone app (tests).
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field

from meterwise import microclimate as MC
from meterwise import mv as MV
from meterwise import portfolio as PF
from meterwise import sizing as SZ
from meterwise import tariff as TF
from meterwise.assess import AssessError
from meterwise.models import AssessRequest, ExistingIn, FinanceIn, PackageIn, TariffIn

router = APIRouter(tags=["analysis"])

Position = Literal["top", "lower"]
Scenario = Literal["as_modelled", "high_use", "low_use", "underperforming_hot_water", "faulty_ac"]


class ScheduleRequest(AssessRequest):
    start: str = Field("2027-01", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class RiskRequest(AssessRequest):
    runs: int = Field(500, ge=20, le=20000)
    seed: int = 1


class Reading(BaseModel):
    model_config = ConfigDict(extra="ignore")
    month: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    electricity_kwh: float = Field(..., ge=0)
    gas_mj: float = Field(0.0, ge=0)
    indoor_hours_above_30c: Optional[int] = Field(None, ge=0)
    mean_outdoor_c: Optional[float] = Field(None, ge=-20, le=50)
    source: Literal["simulated", "uploaded"] = "uploaded"


class SimulateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    assess: AssessRequest
    position: Position = "top"
    start: str = Field("2026-01", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    months: int = Field(12, ge=1, le=120)
    seed: int = 7
    scenario: Scenario = "as_modelled"
    upgraded: bool = True


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    assess: AssessRequest
    position: Position = "top"
    baseline: list[Reading] = Field(..., min_length=6)
    post: list[Reading] = Field(..., min_length=3)
    charge_per_month: float = Field(..., ge=0)


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    building_ids: Optional[list[str]] = Field(None, max_length=PF.MAX_BUILDINGS)
    capital_budget: float = Field(1_500_000, ge=0)
    grant_budget: float = Field(300_000, ge=0)
    objective: Literal["tenant_saving", "co2", "heat_relief", "flats_reached"] = "tenant_saving"
    package: PackageIn = Field(default_factory=PackageIn)
    existing: ExistingIn = Field(default_factory=ExistingIn)
    finance: FinanceIn = Field(default_factory=FinanceIn)
    tariff: TariffIn = Field(default_factory=TariffIn)
    bulk: bool = True


def _plain(req: AssessRequest) -> AssessRequest:
    """Strip the extra keys of a subclassed request back to a plain AssessRequest."""
    return AssessRequest(**req.model_dump(include=set(AssessRequest.model_fields)))


@router.get("/api/buildings/{building_id}/microclimate")
def microclimate(building_id: str) -> dict[str, Any]:
    return MC.summary(building_id)


@router.get("/api/buildings/{building_id}/weather.epw", response_class=PlainTextResponse)
def weather_epw(building_id: str) -> PlainTextResponse:
    text = MC.to_epw(building_id)
    return PlainTextResponse(text, headers={"Content-Disposition": f'attachment; filename="meterwise_{building_id}.epw"'})


@router.post("/api/sizing")
def sizing(req: AssessRequest) -> dict[str, Any]:
    return SZ.size_systems(req)


@router.post("/api/schedule")
def schedule(req: ScheduleRequest) -> dict[str, Any]:
    return TF.schedule(_plain(req), req.start)


@router.post("/api/risk")
def risk(req: RiskRequest) -> dict[str, Any]:
    return TF.risk(_plain(req), req.runs, req.seed)


@router.post("/api/mv/simulate")
def mv_simulate(body: SimulateRequest) -> dict[str, Any]:
    readings = MV.simulate(body.assess, body.position, body.months, body.start, body.seed, body.scenario, body.upgraded)
    return {"readings": readings, "scenario": body.scenario, "scenario_note": MV.SCENARIO_NOTES[body.scenario],
            "source": "simulated"}


@router.post("/api/mv/verify")
def mv_verify(body: VerifyRequest) -> dict[str, Any]:
    return MV.verify(body.assess, body.position, [r.model_dump() for r in body.baseline],
                     [r.model_dump() for r in body.post], body.charge_per_month)


@router.post("/api/portfolio/plan")
def portfolio_plan(body: PlanRequest) -> dict[str, Any]:
    return PF.plan(body.model_dump())


# ------------------------------------------------------------------------------------------------ standalone use

def _plain_validation_message(exc: RequestValidationError) -> str:
    parts = []
    for e in exc.errors():
        loc = ".".join(str(x) for x in e.get("loc", []) if x not in ("body",))
        msg = e.get("msg", "is not valid")
        parts.append(f"{loc}: {msg}" if loc else msg)
    return "Some inputs are not valid. " + "; ".join(parts)


def install_error_handlers(app: FastAPI) -> None:
    """Same error format as main.py, for an app that mounts only this router (used by the tests)."""

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": _plain_validation_message(exc)})

    @app.exception_handler(AssessError)
    async def _assess(_: Request, exc: AssessError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"detail": exc.message})
