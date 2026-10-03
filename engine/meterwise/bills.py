"""Turns hourly energy use into bills, using flat-rate electricity and block-rate gas."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import params as P
from .systems import END_USE_LABELS, USAGE_END_USES, EnergyUse


@dataclass(frozen=True)
class Tariff:
    """Prices incl. GST. ``gas_c_per_mj`` is the first-block price; later blocks scale with it."""

    electricity_c_per_kwh: float
    electricity_supply_c_per_day: float
    gas_c_per_mj: float
    gas_supply_c_per_day: float

    @classmethod
    def default(cls) -> "Tariff":
        return cls(P.v("electricity_c_per_kwh"), P.v("electricity_supply_c_per_day"),
                   P.v("gas_c_per_mj"), P.v("gas_supply_c_per_day"))


def daily_gas_cost_cents(daily_mj: np.ndarray, first_block_c: float) -> np.ndarray:
    """Gas usage cost per day (cents) under the default retailer's declining block structure, scaled to the first-block price."""
    scale = first_block_c / P.v("gas_c_per_mj")
    b1, b2 = P.v("gas_block_1_mj_per_day"), P.v("gas_block_2_mj_per_day")
    r1 = P.v("gas_c_per_mj") * scale
    r2 = P.v("gas_block_2_c_per_mj") * scale
    r3 = P.v("gas_block_3_c_per_mj") * scale
    m1 = np.minimum(daily_mj, b1)
    m2 = np.clip(daily_mj - b1, 0, b2)
    m3 = np.clip(daily_mj - b1 - b2, 0, None)
    return m1 * r1 + m2 * r2 + m3 * r3


@dataclass
class Bill:
    """A flat's yearly energy and bill, with a breakdown by end use and by month (AUD)."""

    electricity_kwh: float
    gas_mj: float
    bill_per_year: float
    by_end_use: list[dict]
    monthly_bill: np.ndarray  # 12 values
    gas_connected: bool

    def end_use(self, key: str) -> dict:
        return next(e for e in self.by_end_use if e["key"] == key)


def compute_bill(use: EnergyUse, tariff: Tariff, months: np.ndarray) -> Bill:
    """Yearly and monthly bill. Supply charges appear as their own end-use lines so lines add up to the bill."""
    n = len(months)
    days = n // 24
    month_of_day = months[::24]
    e_total = use.total_kwh()
    g_total = use.total_mj()

    daily_mj = g_total.reshape(days, 24).sum(axis=1)
    gas_day_cost = daily_gas_cost_cents(daily_mj, tariff.gas_c_per_mj) / 100.0
    # Share each day's gas cost between end uses in proportion to their gas use that day.
    gas_cost_by_use = {}
    for k in USAGE_END_USES:
        d = use.gas_mj[k].reshape(days, 24).sum(axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            share = np.where(daily_mj > 0, d / daily_mj, 0.0)
        gas_cost_by_use[k] = float((share * gas_day_cost).sum())

    lines = []
    for k in USAGE_END_USES:
        kwh = float(use.electricity_kwh[k].sum())
        mj = float(use.gas_mj[k].sum())
        cost = kwh * tariff.electricity_c_per_kwh / 100.0 + gas_cost_by_use[k]
        lines.append({"key": k, "label": END_USE_LABELS[k], "cost_per_year": round(cost, 2),
                      "electricity_kwh": round(kwh, 1), "gas_mj": round(mj, 1)})
    e_supply = days * tariff.electricity_supply_c_per_day / 100.0
    g_supply = days * tariff.gas_supply_c_per_day / 100.0 if use.gas_connected else 0.0
    lines.append({"key": "electricity_supply", "label": END_USE_LABELS["electricity_supply"],
                  "cost_per_year": round(e_supply, 2), "electricity_kwh": 0.0, "gas_mj": 0.0})
    lines.append({"key": "gas_supply", "label": END_USE_LABELS["gas_supply"],
                  "cost_per_year": round(g_supply, 2), "electricity_kwh": 0.0, "gas_mj": 0.0})

    monthly = np.zeros(12)
    e_cost_hourly = e_total * tariff.electricity_c_per_kwh / 100.0
    for m in range(1, 13):
        sel_h = months == m
        sel_d = month_of_day == m
        nd = int(sel_d.sum())
        monthly[m - 1] = (e_cost_hourly[sel_h].sum() + gas_day_cost[sel_d].sum()
                          + nd * tariff.electricity_supply_c_per_day / 100.0
                          + (nd * tariff.gas_supply_c_per_day / 100.0 if use.gas_connected else 0.0))
    total = float(monthly.sum())
    return Bill(electricity_kwh=float(e_total.sum()), gas_mj=float(g_total.sum()), bill_per_year=total,
                by_end_use=lines, monthly_bill=monthly, gas_connected=use.gas_connected)
