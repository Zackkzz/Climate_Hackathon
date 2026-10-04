"""Measurement and verification (M&V): simulated monthly readings, and verified savings from readings.

simulate(): builds monthly readings for one flat from the engine's own hourly model (the same flats the deal is built
on), with a seeded household factor, a seeded monthly weather shift, month-to-month noise and an optional named
scenario. Readings are always labelled "simulated". No real meter data is used or implied.

verify(): a weather-normalised baseline. Baseline electricity (and gas) per day is regressed on heating and cooling
degree days per day. The fitted line is projected onto the post-upgrade months' weather to give what the flat would
have used without the upgrade; the saving is that minus what it did use, priced at the deal's tariff. The uncertainty
combines the regression's residual spread and the uncertainty of its coefficients. This follows the usual
"avoided energy use" approach in savings verification guides, simplified for monthly bills.

Degree days need daily temperatures, but a reading has only the month's mean outdoor temperature. Each month's daily
temperatures are taken from the local 2025 hourly year and shifted so their mean matches the reading.
"""
from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy import stats

from . import params as P
from ._context import Context, build
from .assess import AssessError, Config
from .bills import daily_gas_cost_cents
from .models import AssessRequest

SCENARIOS = ["as_modelled", "high_use", "low_use", "underperforming_hot_water", "faulty_ac"]
SCENARIO_NOTES = {
    "as_modelled": "The household uses energy about as modelled.",
    "high_use": "The household uses 30% more hot water, heating and cooling than modelled, before and after.",
    "low_use": "The household uses 30% less hot water, heating and cooling than modelled, before and after.",
    "underperforming_hot_water": "After the upgrade the heat pump runs on its backup electric element (COP about 1).",
    "faulty_ac": "After the upgrade the air conditioner works at about a third of its rated efficiency (for example a "
                 "refrigerant leak), and cools the flat less well.",
}
BEHAVIOUR = {"high_use": 1.3, "low_use": 0.7}
FAULT_HW_COP = 1.0
FAULT_AC_COP = 1.2
HEAT_BASES = (14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.0)
COOL_BASES = (18.0, 20.0, 22.0, 24.0)


def _parse(s: str) -> tuple[int, int]:
    m = re.fullmatch(r"(\d{4})-(\d{2})", str(s or ""))
    if not m or not 1 <= int(m.group(2)) <= 12:
        raise AssessError(f"'{s}' is not a month like 2027-03.")
    return int(m.group(1)), int(m.group(2))


def _add(y: int, m: int, k: int) -> tuple[int, int]:
    t = y * 12 + m - 1 + k
    return t // 12, t % 12 + 1


@dataclass
class MonthlyModel:
    elec: dict[str, np.ndarray]  # end use -> 12 monthly kWh
    gas: dict[str, np.ndarray]
    hours_above_30: np.ndarray  # 12 values, as used
    hours_above_30_free: np.ndarray  # 12 values, no heating/cooling


def _monthly(ctx: Context, position: str, cfg: Config) -> MonthlyModel:
    use = ctx.A.use(position, cfg)
    months = ctx.weather.month
    def by_month(a: np.ndarray) -> np.ndarray:
        return np.array([a[months == m].sum() for m in range(1, 13)])
    eq = cfg.equipment
    used = ctx.A.thermal(position, cfg, heating=eq.has_heating, cooling=eq.has_cooling)
    free = ctx.A.thermal(position, cfg, heating=False, cooling=False)
    return MonthlyModel({k: by_month(v) for k, v in use.electricity_kwh.items()},
                        {k: by_month(v) for k, v in use.gas_mj.items()},
                        by_month((used.indoor_c > 30).astype(float)), by_month((free.indoor_c > 30).astype(float)))


class _Climate:
    """Daily mean temperatures per calendar month of the local weather year, for degree days."""

    def __init__(self, ctx: Context):
        t = ctx.weather.temp_c.reshape(-1, 24).mean(axis=1)
        dm = ctx.weather.month[::24]
        self.daily = {m: t[dm == m] for m in range(1, 13)}
        self.mean = {m: float(ctx.weather.temp_c[ctx.weather.month == m].mean()) for m in range(1, 13)}

    def degree_days(self, m: int, mean_c: float | None, days: int, hbase: float | None = None,
                    cbase: float | None = None) -> tuple[float, float]:
        d = self.daily[m] + ((mean_c - self.mean[m]) if mean_c is not None else 0.0)
        scale = days / len(d)
        hb = P.v("mv_heating_base_c") if hbase is None else hbase
        cb = P.v("mv_cooling_base_c") if cbase is None else cbase
        hdd = float(np.clip(hb - d, 0, None).sum()) * scale
        cdd = float(np.clip(d - cb, 0, None).sum()) * scale
        return hdd, cdd


def simulate(req: AssessRequest, position: str = "top", months: int = 12, start: str = "2026-01", seed: int = 7,
             scenario: str = "as_modelled", upgraded: bool = True, allow_network: bool = True) -> list[dict[str, Any]]:
    if scenario not in SCENARIOS:
        raise AssessError("Unknown scenario. Choose one of: " + ", ".join(SCENARIOS) + ".")
    if not 1 <= int(months) <= 120:
        raise AssessError("Please ask for between 1 and 120 months.")
    y0, m0 = _parse(start)
    ctx = build(req, allow_network=allow_network)
    if position not in ctx.counts:
        raise AssessError(f"This building has no '{position}' flats. Choose one of: " + ", ".join(ctx.positions) + ".")
    cfg = ctx.up_cfg if upgraded else ctx.base_cfg
    mm = _monthly(ctx, position, cfg)
    clim = _Climate(ctx)
    hh = float(np.random.default_rng([seed, 99991]).lognormal(0.0, P.v("mv_household_sigma")))
    beh = BEHAVIOUR.get(scenario, 1.0)
    eq = cfg.equipment
    out = []
    for k in range(int(months)):
        y, m = _add(y0, m0, k)
        rng = np.random.default_rng([seed, y, m])
        shift = float(rng.normal(0.0, P.v("mv_weather_sigma_c")))
        n_e, n_g = rng.normal(0.0, P.v("mv_noise_sigma"), 2)
        days = calendar.monthrange(y, m)[1]
        wdays = len(clim.daily[m])
        mean_c = clim.mean[m] + shift
        # The simulator's weather response: heating scales with degree days below the heating thermostat, cooling with
        # degree days above the M&V cooling base (a simple, stated choice for demo data).
        hb, cb = P.v("heating_setpoint_c"), P.v("mv_cooling_base_c")
        hdd0, cdd0 = clim.degree_days(m, None, wdays, hb, cb)
        hdd1, cdd1 = clim.degree_days(m, mean_c, wdays, hb, cb)
        fh = hdd1 / hdd0 if hdd0 > 0.5 else 1.0
        fc = cdd1 / cdd0 if cdd0 > 0.5 else (0.0 if cdd1 <= 0 else 1.0)
        i = m - 1
        e = {key: v[i] for key, v in mm.elec.items()}
        g = {key: v[i] for key, v in mm.gas.items()}
        hw_e = e["hot_water"]
        heat_e, cool_e = e["heating"], e["cooling"]
        if upgraded and scenario == "underperforming_hot_water" and eq.hot_water == "heat_pump":
            hw_e *= P.v("cop_heat_pump_hot_water") / FAULT_HW_COP
        if upgraded and scenario == "faulty_ac" and eq.heating == "reverse_cycle":
            heat_e *= P.v("cop_reverse_cycle_heating") / FAULT_AC_COP
            cool_e *= P.v("eer_reverse_cycle_cooling") / FAULT_AC_COP
        kwh = (hh * beh * (hw_e + heat_e * fh + cool_e * fc) + hh * (e["cooking"] + e["appliances"]))
        mj = hh * beh * (g["hot_water"] + g["heating"] * fh) + hh * g["cooking"]
        scale_days = days / wdays
        kwh *= scale_days * float(np.exp(n_e))
        mj *= scale_days * float(np.exp(n_g))
        hot = mm.hours_above_30[i]
        if upgraded and scenario == "faulty_ac":
            hot = hot + 0.5 * (mm.hours_above_30_free[i] - hot)
        hot = hot * (cdd1 / cdd0 if cdd0 > 0.5 else 1.0)
        out.append({"month": f"{y:04d}-{m:02d}", "electricity_kwh": round(float(kwh), 1), "gas_mj": round(float(mj), 1),
                    "indoor_hours_above_30c": int(round(float(hot))), "mean_outdoor_c": round(mean_c, 1),
                    "source": "simulated"})
    return out


# ------------------------------------------------------------------------------------------------ verify

def _rd(r: Any) -> dict[str, Any]:
    return r if isinstance(r, dict) else r.model_dump()


def _fit(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, float, float, int]:
    """OLS with columns of no variation dropped. Returns beta (full length, zeros for dropped), mask, s2, r2, dof."""
    keep = np.array([True] + [float(np.std(X[:, j])) > 1e-6 for j in range(1, X.shape[1])])
    n = len(y)
    while keep.sum() > 1 and n - keep.sum() < 2:  # keep at least 2 degrees of freedom
        keep[np.where(keep)[0][-1]] = False
    Xk = X[:, keep]
    beta_k, *_ = np.linalg.lstsq(Xk, y, rcond=None)
    resid = y - Xk @ beta_k
    dof = max(n - int(keep.sum()), 1)
    s2 = float(resid @ resid) / dof
    ss = float(((y - y.mean()) ** 2).sum())
    r2 = 1 - float(resid @ resid) / ss if ss > 0 else 0.0
    beta = np.zeros(X.shape[1])
    beta[keep] = beta_k
    return beta, keep, s2, r2, dof


def _pred_var(X: np.ndarray, keep: np.ndarray, s2: float, X0: np.ndarray, days0: np.ndarray) -> float:
    """Variance of the predicted TOTAL over the post months (per-day model x days)."""
    Xk, X0k = X[:, keep], X0[:, keep]
    inv = np.linalg.pinv(Xk.T @ Xk)
    a = (days0[:, None] * X0k).sum(axis=0)
    return float(s2 * (days0 ** 2).sum() + s2 * a @ inv @ a)


def verify(req: AssessRequest, position: str, baseline: list, post: list, charge_per_month: float,
           allow_network: bool = True) -> dict[str, Any]:
    baseline = [_rd(r) for r in baseline]
    post = [_rd(r) for r in post]
    if len(baseline) < 6:
        raise AssessError("At least 6 months of readings before the upgrade are needed.")
    if len(post) < 3:
        raise AssessError("At least 3 months of readings after the upgrade are needed.")
    ctx = build(req, allow_network=allow_network)
    if position not in ctx.counts:
        raise AssessError(f"This building has no '{position}' flats. Choose one of: " + ", ".join(ctx.positions) + ".")
    clim = _Climate(ctx)
    flags: list[str] = []
    t = ctx.tariff
    pe = t.electricity_c_per_kwh / 100.0

    def rows(readings: list[dict]) -> tuple[list, np.ndarray, np.ndarray, np.ndarray, list]:
        meta, kwh, mj, days, months = [], [], [], [], []
        missing_t = False
        for r in readings:
            y, m = _parse(r["month"])
            d = calendar.monthrange(y, m)[1]
            mean_c = r.get("mean_outdoor_c")
            if mean_c is None:
                missing_t = True
            meta.append((m, mean_c, d))
            kwh.append(float(r["electricity_kwh"]))
            mj.append(float(r.get("gas_mj") or 0.0))
            days.append(d)
            months.append((y, m))
        if missing_t and not any("no outdoor temperature" in f for f in flags):
            flags.append("Some readings have no outdoor temperature, so the 2025 local weather was used for those months.")
        return meta, np.array(kwh), np.array(mj), np.array(days, dtype=float), months

    def design(meta: list, hb: float, cb: float) -> np.ndarray:
        X = []
        for m, mean_c, d in meta:
            hdd, cdd = clim.degree_days(m, mean_c, d, hb, cb)
            X.append([1.0, hdd / d, cdd / d])
        return np.array(X)

    def best_fit(meta_b: list, y: np.ndarray):
        """Variable-base degree days (as in the PRISM method): try base temperatures, keep the best fit."""
        best = None
        for hb in HEAT_BASES:
            for cb in COOL_BASES:
                X = design(meta_b, hb, cb)
                fit = _fit(X, y)
                if best is None or fit[2] < best[1][2] - 1e-12:
                    best = ((hb, cb), fit)
        return best

    mb_meta, kb, gb, db, _ = rows(baseline)
    mp_meta, kp, gp, dp, mp = rows(post)
    (hb_e, cb_e), (be, ke, s2e, r2e, dofe) = best_fit(mb_meta, kb / db)
    Xb, Xp = design(mb_meta, hb_e, cb_e), design(mp_meta, hb_e, cb_e)
    kwh_hat = (Xp @ be) * dp
    var_e = _pred_var(Xb, ke, s2e, Xp, dp)
    has_gas = gb.sum() > 0
    bases = {"electricity": {"heating_base_c": hb_e, "cooling_base_c": cb_e}}
    if has_gas:
        (hb_g, cb_g), (bg, kg, s2g, r2g, dofg) = best_fit(mb_meta, gb / db)
        Xbg, Xpg = design(mb_meta, hb_g, cb_g), design(mp_meta, hb_g, cb_g)
        mj_hat = np.clip((Xpg @ bg) * dp, 0, None)
        var_g = _pred_var(Xbg, kg, s2g, Xpg, dp)
        bases["gas"] = {"heating_base_c": hb_g, "cooling_base_c": cb_g}
    else:
        mj_hat, var_g, r2g = np.zeros(len(post)), 0.0, None

    def gas_cost(mj: float, days: float) -> float:
        return float(days * daily_gas_cost_cents(np.array([mj / days]), t.gas_c_per_mj)[0] / 100.0) if mj > 0 else 0.0

    base_connected = ctx.base_eq.gas_connected
    by_month, exp_total, act_total = [], 0.0, 0.0
    for k, (y, m) in enumerate(mp):
        d = dp[k]
        expected = (max(kwh_hat[k], 0.0) * pe + d * t.electricity_supply_c_per_day / 100.0 + gas_cost(mj_hat[k], d)
                    + (d * t.gas_supply_c_per_day / 100.0 if base_connected else 0.0))
        post_connected = gp[k] > 0 or ctx.up_eq.gas_connected
        actual = (kp[k] * pe + d * t.electricity_supply_c_per_day / 100.0 + gas_cost(gp[k], d)
                  + (d * t.gas_supply_c_per_day / 100.0 if post_connected else 0.0))
        exp_total += expected
        act_total += actual
        by_month.append({"month": f"{y:04d}-{m:02d}", "expected_baseline_cost": round(expected, 2),
                         "actual_cost": round(actual, 2), "saving": round(expected - actual, 2),
                         "expected_baseline_kwh": round(float(kwh_hat[k]), 1), "actual_kwh": round(float(kp[k]), 1),
                         "expected_baseline_gas_mj": round(float(mj_hat[k]), 1), "actual_gas_mj": round(float(gp[k]), 1)})
    n_post = len(post)
    verified = (exp_total - act_total) / n_post
    gas_rate = (sum(gas_cost(mj_hat[k], dp[k]) for k in range(n_post)) / mj_hat.sum()) if mj_hat.sum() > 0 else 0.0
    sd_total = float(np.sqrt((pe ** 2) * var_e + (gas_rate ** 2) * var_g))
    conf = P.v("mv_confidence")
    dof = dofe
    tval = float(stats.t.ppf(1 - (1 - conf) / 2, dof))
    unc = tval * sd_total / n_post

    # Modelled saving for this flat group (same deal inputs)
    base_mm = _monthly(ctx, position, ctx.base_cfg)
    up_mm = _monthly(ctx, position, ctx.up_cfg)
    from .bills import compute_bill
    bb = compute_bill(ctx.A.use(position, ctx.base_cfg), t, ctx.weather.month)
    ub = compute_bill(ctx.A.use(position, ctx.up_cfg), t, ctx.weather.month)
    modelled = (bb.bill_per_year - ub.bill_per_year) / 12.0
    realisation = verified / modelled if abs(modelled) > 1e-6 else None
    rel = unc / abs(verified) if abs(verified) > 1e-6 else float("inf")
    confidence = "high" if rel <= 0.2 and r2e >= 0.75 else ("medium" if rel <= 0.5 else "low")
    tenant_net = verified - charge_per_month

    # Comfort
    hb = [r.get("indoor_hours_above_30c") for r in baseline]
    hp = [r.get("indoor_hours_above_30c") for r in post]
    comfort = {"hours_above_30c_before": int(sum(h for h in hb if h is not None)) if any(h is not None for h in hb) else None,
               "hours_above_30c_after": int(sum(h for h in hp if h is not None)) if any(h is not None for h in hp) else None,
               "months_before": len(baseline), "months_after": n_post,
               "note": "Totals over the months supplied; compare like seasons."}

    # True-up
    share = req.finance.savings_share_to_charge
    allowed = max(0.0, share * verified)
    if charge_per_month > allowed + unc:
        new_charge = round(allowed, 2)
        refund = round((charge_per_month - new_charge) * n_post, 2)
        if verified < charge_per_month:
            action = "refund_from_reserve"
            reason = (f"The verified saving (${verified:,.2f} a month) is less than the charge (${charge_per_month:,.2f}), "
                      f"so the tenant was out of pocket. The charge drops to {share:.0%} of the verified saving "
                      f"(${new_charge:,.2f}) and the ${refund:,.2f} overcharged in the last {n_post} months is refunded "
                      "from the reserve.")
        else:
            action = "reduce_charge"
            reason = (f"The charge (${charge_per_month:,.2f}) is more than {share:.0%} of the verified saving "
                      f"(${verified:,.2f}) by more than the uncertainty (${unc:,.2f}). It drops to ${new_charge:,.2f}, and "
                      f"the ${refund:,.2f} difference for the last {n_post} months is refunded from the reserve.")
    else:
        new_charge, refund, action = round(charge_per_month, 2), 0.0, "none"
        reason = (f"The charge (${charge_per_month:,.2f}) is within {share:.0%} of the verified saving "
                  f"(${verified:,.2f}) allowing for the uncertainty (${unc:,.2f}), so it stays the same.")

    # Flags
    if any(r.get("source") == "simulated" for r in baseline + post):
        flags.append("These readings are modelled estimates, not meter data.")
    if r2e < 0.5:
        flags.append(f"Weather explains little of the baseline electricity use (R2 {r2e:.2f}); the result is less certain.")
    if realisation is not None and realisation < 0.75:
        flags.append(f"The verified saving is {realisation:.0%} of the modelled saving.")
    # Household factor from the baseline, then compare post use with the model for the upgraded flat.
    mb = [m for _, m in [_parse(r["month"]) for r in baseline]]
    mpm = [m for _, m in mp]
    model_base_e = sum(sum(v[m - 1] for v in base_mm.elec.values()) for m in mb)
    model_base_g = sum(sum(v[m - 1] for v in base_mm.gas.values()) for m in mb)
    model_base_energy = model_base_e * 3.6 + model_base_g
    actual_base_energy = kb.sum() * 3.6 + gb.sum()
    hhf = actual_base_energy / model_base_energy if model_base_energy > 0 else 1.0
    model_up_e = sum(sum(v[m - 1] for v in up_mm.elec.values()) for m in mpm) * hhf
    model_up_hw = sum(up_mm.elec["hot_water"][m - 1] for m in mpm) * hhf
    if model_up_e > 0 and kp.sum() > 1.2 * model_up_e:
        extra = kp.sum() / model_up_e - 1
        hint = ("check the heat pump hot water settings (is it running on its backup element?)"
                if ctx.up_eq.hot_water == "heat_pump" else "check the hot water system")
        if ctx.up_eq.cooling == "reverse_cycle":
            hint += " and the air conditioner (settings, filters, refrigerant)"
        flags.append(f"Electricity use after the upgrade is {extra:.0%} above the model for this household "
                     f"(the extra is about {(kp.sum() - model_up_e) / max(model_up_hw, 1e-9):.0%} of modelled hot water "
                     f"use): {hint}.")
    if not ctx.up_eq.uses_gas and ctx.base_eq.uses_gas and gp.sum() > 0.05 * max(gb.sum() / len(gb) * n_post, 1):
        flags.append("Gas is still being used after the upgrade, although no upgraded appliance should use it.")
    if comfort["hours_above_30c_after"] is not None and comfort["hours_above_30c_before"] is not None:
        if comfort["hours_above_30c_after"] > comfort["hours_above_30c_before"] and ctx.up_eq.has_cooling:
            flags.append("The flat had more hot hours after the upgrade than before; check the air conditioner.")

    return {
        "method": ("Baseline electricity and gas per day were regressed on heating and cooling degree days per day "
                   "(base temperatures chosen from a fixed list to fit the baseline best, as in the PRISM method), "
                   "then projected onto the post-upgrade months' weather to estimate use without the upgrade. "
                   f"Saving = that estimate minus actual use, priced at the deal's tariff. Uncertainty is a {conf:.0%} "
                   "band from the regression."),
        "baseline_fit": {"r2": round(r2e, 3), "months": len(baseline), "gas_r2": None if r2g is None else round(r2g, 3),
                         "base_temperatures_c": bases,
                         "model": "energy per day = a + b x heating degree days per day + c x cooling degree days per day"},
        "post_months": n_post,
        "modelled_saving_per_month": round(modelled, 2),
        "verified_saving_per_month": round(verified, 2),
        "realisation_rate": None if realisation is None else round(realisation, 3),
        "uncertainty_per_month": round(unc, 2), "confidence_level": conf, "confidence": confidence,
        "tenant_net_per_month": round(tenant_net, 2), "bill_neutral_verified": bool(tenant_net >= 0),
        "comfort": comfort, "by_month": by_month,
        "true_up": {"action": action, "new_charge_per_month": new_charge, "refund": refund, "reason": reason,
                    "savings_share_to_charge": share},
        "flags": flags,
    }
