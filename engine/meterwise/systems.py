"""Equipment: turns heating/cooling demand and hot water/cooking needs into hourly electricity and gas use."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import params as P
from .weather import Weather

MJ_PER_KWH = 3.6
END_USE_LABELS = {
    "hot_water": "Hot water",
    "heating": "Heating",
    "cooling": "Cooling",
    "cooking": "Cooking",
    "appliances": "Fridge, lights and other appliances",
    "electricity_supply": "Electricity daily supply charge",
    "gas_supply": "Gas daily supply charge",
}
USAGE_END_USES = ["hot_water", "heating", "cooling", "cooking", "appliances"]


@dataclass(frozen=True)
class Equipment:
    """The appliances in one flat. Keys follow the API options; upgraded keys are 'heat_pump', 'reverse_cycle', 'induction'."""

    hot_water: str  # gas_storage | gas_instant | electric_storage | heat_pump
    heating: str  # gas_heater | electric_resistive | none | reverse_cycle
    cooling: str  # none | old_ac | reverse_cycle
    cooktop: str  # gas | electric | induction
    gas_connected: bool

    @property
    def uses_gas(self) -> bool:
        return self.hot_water.startswith("gas") or self.heating == "gas_heater" or self.cooktop == "gas"

    @property
    def has_cooling(self) -> bool:
        return self.cooling != "none"

    @property
    def has_heating(self) -> bool:
        return self.heating != "none"


@dataclass
class EnergyUse:
    """Hourly energy by end use for one flat: electricity in kWh, gas in MJ."""

    electricity_kwh: dict[str, np.ndarray]
    gas_mj: dict[str, np.ndarray]
    gas_connected: bool

    def total_kwh(self) -> np.ndarray:
        return sum(self.electricity_kwh.values())

    def total_mj(self) -> np.ndarray:
        return sum(self.gas_mj.values())


def cold_water_temp(weather: Weather) -> np.ndarray:
    """Hourly cold mains temperature: trailing 30-day mean air temperature plus an offset (assumption)."""
    daily = weather.temp_c.reshape(-1, 24).mean(axis=1)
    padded = np.concatenate([daily[-30:], daily])  # wrap the year so January has a history
    trailing = np.convolve(padded, np.ones(30) / 30, mode="valid")[1:]
    return np.repeat(trailing, 24) + P.v("cold_water_offset_c")


def hot_water_heat_mj(weather: Weather, litres_per_day: float) -> np.ndarray:
    """Useful heat put into hot water each hour (MJ), spread evenly over the day."""
    dt = np.clip(P.v("hot_water_temp_c") - cold_water_temp(weather), 0, None)
    return litres_per_day * 4.186e-3 * dt / 24.0  # MJ per hour (4.186 kJ/kgK, 1 L = 1 kg)


def energy_use(eq: Equipment, weather: Weather, heating_w: np.ndarray, cooling_w: np.ndarray,
               litres_per_day: float) -> EnergyUse:
    """Hourly delivered electricity and gas for one flat."""
    n = weather.hours
    zero = np.zeros(n)
    share = P.v("conditioned_share")
    elec: dict[str, np.ndarray] = {}
    gas: dict[str, np.ndarray] = {}

    # Hot water
    hw = hot_water_heat_mj(weather, litres_per_day)
    if eq.hot_water == "gas_storage":
        gas["hot_water"], elec["hot_water"] = hw / P.v("eff_gas_storage"), zero
    elif eq.hot_water == "gas_instant":
        gas["hot_water"], elec["hot_water"] = hw / P.v("eff_gas_instant"), zero
    elif eq.hot_water == "electric_storage":
        gas["hot_water"], elec["hot_water"] = zero, hw / P.v("eff_electric_storage") / MJ_PER_KWH
    elif eq.hot_water == "heat_pump":
        gas["hot_water"], elec["hot_water"] = zero, hw / P.v("cop_heat_pump_hot_water") / MJ_PER_KWH
    else:
        raise ValueError(f"unknown hot water system {eq.hot_water}")

    # Heating (demand is for the whole flat; only the conditioned share is heated)
    heat_kwh = heating_w * share / 1000.0
    if eq.heating == "gas_heater":
        gas["heating"], elec["heating"] = heat_kwh * MJ_PER_KWH / P.v("eff_gas_heater"), zero
    elif eq.heating == "electric_resistive":
        gas["heating"], elec["heating"] = zero, heat_kwh
    elif eq.heating == "reverse_cycle":
        gas["heating"], elec["heating"] = zero, heat_kwh / P.v("cop_reverse_cycle_heating")
    elif eq.heating == "none":
        gas["heating"], elec["heating"] = zero, zero
    else:
        raise ValueError(f"unknown heating {eq.heating}")

    # Cooling
    cool_kwh = cooling_w * share / 1000.0
    gas["cooling"] = zero
    if eq.cooling == "none":
        elec["cooling"] = zero
    elif eq.cooling == "old_ac":
        elec["cooling"] = cool_kwh / P.v("eer_old_ac")
    elif eq.cooling == "reverse_cycle":
        elec["cooling"] = cool_kwh / P.v("eer_reverse_cycle_cooling")
    else:
        raise ValueError(f"unknown cooling {eq.cooling}")

    # Cooking: the useful heat to the pot is fixed; delivered energy depends on the cooktop.
    useful_mj_year = P.v("cooking_gas_mj_per_year") * P.v("eff_gas_cooktop")
    hod = weather.hour_of_day
    profile = np.where((hod >= 17) & (hod < 20), 1.0, 0.0) + np.where((hod >= 7) & (hod < 8), 0.3, 0.0)
    profile = profile / profile.sum()
    useful = useful_mj_year * profile
    if eq.cooktop == "gas":
        gas["cooking"], elec["cooking"] = useful / P.v("eff_gas_cooktop"), zero
    elif eq.cooktop == "electric":
        gas["cooking"], elec["cooking"] = zero, useful / P.v("eff_electric_cooktop") / MJ_PER_KWH
    elif eq.cooktop == "induction":
        gas["cooking"], elec["cooking"] = zero, useful / P.v("eff_induction_cooktop") / MJ_PER_KWH
    else:
        raise ValueError(f"unknown cooktop {eq.cooktop}")

    elec["appliances"] = np.full(n, P.v("other_electricity_kwh_per_year") / n)
    gas["appliances"] = zero
    return EnergyUse(electricity_kwh=elec, gas_mj=gas, gas_connected=eq.gas_connected)
