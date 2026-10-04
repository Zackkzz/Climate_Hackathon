"""Shared set-up for the analysis modules: resolves a building and builds the same baseline and upgraded
configurations that ``assess.assess`` uses, so every analysis module models exactly the same flats.

Private helper (new module). It only calls existing public helpers in ``assess``; it changes nothing there.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from . import buildings as B
from . import params as P
from .assess import Assessor, Config, anomaly_to_air_c, equipment_pair, group_counts, resolve_building
from .bills import Tariff
from .models import AssessRequest
from .systems import Equipment
from .weather import Weather, get_weather


@dataclass
class Context:
    req: AssessRequest
    b: dict[str, Any]
    weather: Weather
    tariff: Tariff
    A: Assessor
    counts: dict[str, int]
    base_cfg: Config
    up_cfg: Config
    up_cfg_no_envelope: Config  # upgraded equipment, original roof and ceiling (for sizing "without roof")
    base_eq: Equipment
    up_eq: Equipment
    alpha_base: float
    alpha_up: float
    anom_air: float
    warnings: list[str]

    @property
    def positions(self) -> list[str]:
        return list(self.counts)


def build(req: AssessRequest, allow_network: bool = True) -> Context:
    ds = B.load()
    b, warnings = resolve_building(req, ds)
    weather, ww = get_weather(b["lat"], b["lon"], allow_network=allow_network)
    warnings += ww
    t, ex, pkg = req.tariff, req.existing, req.package
    tariff = Tariff(t.electricity_c_per_kwh, t.electricity_supply_c_per_day, t.gas_c_per_mj, t.gas_supply_c_per_day)
    anom = anomaly_to_air_c(b["heat_anomaly_c"])
    litres = P.v("occupants_per_flat") * P.v("hot_water_l_per_person_day")
    A = Assessor(weather, b["flat_area_m2"], anom, litres, tariff)
    counts = group_counts(b["storeys"], b["flats"])
    base_eq, up_eq, _disconnect, eqw = equipment_pair(ex, pkg)
    warnings += eqw
    alpha_base = P.v("roof_absorptance_dark") if ex.roof == "dark" else P.v("roof_absorptance_light")
    alpha_up = min(alpha_base, P.v("roof_absorptance_cool_aged")) if pkg.cool_roof else alpha_base
    base_cfg = Config(alpha_base, False, base_eq)
    up_cfg = Config(alpha_up, bool(pkg.ceiling_insulation), up_eq)
    up_noenv = Config(alpha_base, False, up_eq)
    return Context(req, b, weather, tariff, A, counts, base_cfg, up_cfg, up_noenv, base_eq, up_eq,
                   alpha_base, alpha_up, anom, warnings)


def monthly_index(weather: Weather) -> np.ndarray:
    return weather.month
