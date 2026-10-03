"""Pydantic request and response models (see docs/api-contract.md)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from . import params as P

HotWater = Literal["gas_storage", "gas_instant", "electric_storage"]
Heating = Literal["gas_heater", "electric_resistive", "none"]
Cooling = Literal["none", "old_ac"]
Cooktop = Literal["gas", "electric"]
Roof = Literal["dark", "light"]

OPTIONS = {
    "hot_water": [{"key": "gas_storage", "label": "Gas storage tank"}, {"key": "gas_instant", "label": "Gas instantaneous"},
                  {"key": "electric_storage", "label": "Electric storage tank"}],
    "heating": [{"key": "gas_heater", "label": "Gas heater"}, {"key": "electric_resistive", "label": "Plug-in electric heater"},
                {"key": "none", "label": "No heating"}],
    "cooling": [{"key": "none", "label": "No air conditioning"}, {"key": "old_ac", "label": "Old window or wall air conditioner"}],
    "cooktop": [{"key": "gas", "label": "Gas cooktop"}, {"key": "electric", "label": "Electric cooktop"}],
    "roof": [{"key": "dark", "label": "Dark roof"}, {"key": "light", "label": "Light roof"}],
}


class _In(BaseModel):
    model_config = ConfigDict(extra="ignore")


class BuildingIn(_In):
    storeys: Optional[int] = Field(None, ge=1, le=12)
    flats: Optional[int] = Field(None, ge=1, le=400)
    roof_m2: Optional[float] = Field(None, gt=0, le=20000)
    flat_area_m2: Optional[float] = Field(None, ge=20, le=250)
    lat: Optional[float] = Field(None, ge=-44, le=-10)
    lon: Optional[float] = Field(None, ge=112, le=154)
    heat_anomaly_c: Optional[float] = Field(None, ge=-15, le=15)
    label: Optional[str] = None


class ExistingIn(_In):
    hot_water: HotWater = "gas_storage"
    heating: Heating = "electric_resistive"
    cooling: Cooling = "none"
    cooktop: Cooktop = "gas"
    roof: Roof = "dark"


class PackageIn(_In):
    cool_roof: bool = True
    heat_pump_hot_water: bool = True
    reverse_cycle: bool = True
    induction_cooktop: bool = False
    ceiling_insulation: bool = False
    disconnect_gas: bool = False


class FinanceIn(_In):
    cost_of_capital: float = Field(P.v("cost_of_capital"), ge=0, le=0.3)
    term_years: int = Field(P.v("term_years"), ge=1, le=30)
    savings_share_to_charge: float = Field(P.v("savings_share_to_charge"), ge=0, le=1)
    reserve: float = Field(P.v("reserve"), ge=0, lt=0.9)
    apply_rebates: bool = True


class TariffIn(_In):
    electricity_c_per_kwh: float = Field(P.v("electricity_c_per_kwh"), gt=0, le=200)
    electricity_supply_c_per_day: float = Field(P.v("electricity_supply_c_per_day"), ge=0, le=1000)
    gas_c_per_mj: float = Field(P.v("gas_c_per_mj"), gt=0, le=100)
    gas_supply_c_per_day: float = Field(P.v("gas_supply_c_per_day"), ge=0, le=1000)


class AssessRequest(_In):
    building_id: Optional[str] = None
    building: BuildingIn = Field(default_factory=BuildingIn)
    existing: ExistingIn = Field(default_factory=ExistingIn)
    package: PackageIn = Field(default_factory=PackageIn)
    finance: FinanceIn = Field(default_factory=FinanceIn)
    tariff: TariffIn = Field(default_factory=TariffIn)


class PortfolioRequest(_In):
    building_ids: list[str] = Field(..., min_length=1, max_length=50)
    existing: ExistingIn = Field(default_factory=ExistingIn)
    package: PackageIn = Field(default_factory=PackageIn)
    finance: FinanceIn = Field(default_factory=FinanceIn)
    tariff: TariffIn = Field(default_factory=TariffIn)


# ---- responses (permissive: the engine builds dicts; these document and check the contract shape) ----

class EndUse(BaseModel):
    key: str
    label: str
    cost_per_year: float
    electricity_kwh: float
    gas_mj: float


class EnergySummary(BaseModel):
    model_config = ConfigDict(extra="allow")
    electricity_kwh: float
    gas_mj: float
    bill_per_year: float
    by_end_use: list[EndUse]


class Comfort(BaseModel):
    model_config = ConfigDict(extra="allow")
    hours_above_30c_baseline: int
    hours_above_30c_upgraded: int
    peak_indoor_c_baseline: float
    peak_indoor_c_upgraded: float


class FlatGroup(BaseModel):
    model_config = ConfigDict(extra="allow")
    position: Literal["top", "lower"]
    label: str
    count: int
    baseline: EnergySummary
    upgraded: EnergySummary
    saving_per_year: float
    charge_per_month: float
    net_saving_per_month: float
    net_saving_pct: float
    bill_neutral: bool
    comfort: Comfort


class PackageItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str
    label: str
    selected: bool
    capex: float
    rebate: float
    net_capex: float
    applies_to: Literal["building", "flat"]
    saving_per_year: float
    note: str


class PackageOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    items: list[PackageItem]
    capex_total: float
    rebates_total: float
    net_capex: float
    max_fundable_capex: float
    fully_funded: bool
    funding_gap: float


class FinanceOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    term_years: int
    cost_of_capital: float
    savings_share_to_charge: float
    reserve: float
    charge_per_month_building: float
    total_repaid: float
    investor_return_pct: Optional[float]
    owner_upfront_cost: float
    tenant_upfront_cost: float


class Impact(BaseModel):
    model_config = ConfigDict(extra="allow")
    bill_saving_per_year_building: float
    co2e_t_per_year_saved: float
    gas_mj_per_year_avoided: float
    energy_reduction_pct: float
    peak_cooling_kw_change: float


class MonthRow(BaseModel):
    month: int
    label: str
    baseline_bill: float
    upgraded_bill: float
    charge: float


class Heatwave(BaseModel):
    model_config = ConfigDict(extra="allow")
    label: str
    start: str
    hours: list[int]
    outdoor_c: list[float]
    indoor_top_baseline_c: list[float]
    indoor_top_upgraded_c: list[float]


class Assumption(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str
    label: str
    value: Any
    unit: str
    source: str
    kind: Literal["sourced", "assumption"]


class BuildingOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str]
    label: str
    storeys: int
    flats: int
    roof_m2: float
    flat_area_m2: float
    heat_anomaly_c: float
    heat_band: str


class AssessResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    building: BuildingOut
    flat_groups: list[FlatGroup]
    package: PackageOut
    finance: FinanceOut
    impact: Impact
    monthly: list[MonthRow]
    heatwave: Heatwave
    assumptions: list[Assumption]
    warnings: list[str]
