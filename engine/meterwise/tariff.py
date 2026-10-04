"""Charge schedule per flat and a savings risk test.

Schedule: the monthly charge from the deal (finance.flat_deal, unchanged) is split each month into the reserve share
and the part that repays the investor; that part pays interest on the balance (cost of capital / 12) and the rest
repays principal. The principal per flat is the capital the charge actually repays (the net cost, or less when the
charge cap leaves a funding gap), so the balance reaches zero in the final month.

Risk: a seeded Monte Carlo. The hourly thermal model is NOT rerun for every draw. Instead the modelled yearly energy of
each flat group is split by end use, and each draw rescales those end uses (occupant use, equipment efficiency,
weather severity) and the prices, then redoes the bill arithmetic for all draws at once with numpy. Cool roof ageing
is the one input that needs the thermal model: three thermal runs (new, aged, dirty roof) are made for the top floor
and each draw interpolates between them.
"""
from __future__ import annotations

import math
import re
from typing import Any

import numpy as np

from . import finance as F
from . import params as P
from ._context import Context, build
from .assess import AssessError, Config, assess
from .bills import compute_bill
from .models import AssessRequest

LIFE_KEYS = {"heat_pump_hot_water": "life_heat_pump_hot_water", "reverse_cycle": "life_reverse_cycle",
             "cool_roof": "life_cool_roof", "induction_cooktop": "life_induction",
             "ceiling_insulation": "life_ceiling_insulation"}


def _parse_month(s: str) -> tuple[int, int]:
    m = re.fullmatch(r"(\d{4})-(\d{2})", str(s or ""))
    if not m or not 1 <= int(m.group(2)) <= 12:
        raise AssessError("The start month must look like 2027-01 (year, dash, two-digit month).")
    return int(m.group(1)), int(m.group(2))


def month_label(y: int, m: int, offset: int) -> str:
    k = (y * 12 + m - 1) + offset
    return f"{k // 12:04d}-{k % 12 + 1:02d}"


def _deals(r: dict[str, Any], fin) -> dict[str, F.FlatFinance]:
    out = {}
    for g in r["flat_groups"]:
        out[g["position"]] = F.flat_deal(g["saving_per_year"], g["net_capex_per_flat"], fin.cost_of_capital,
                                         fin.term_years, fin.savings_share_to_charge, fin.reserve)
    return out


# ------------------------------------------------------------------------------------------------ schedule

def schedule(req: AssessRequest, start: str = "2027-01", allow_network: bool = True) -> dict[str, Any]:
    y0, m0 = _parse_month(start)
    r = assess(req, allow_network=allow_network)
    fin, pkg = req.finance, req.package
    n = int(fin.term_years * 12)
    i = fin.cost_of_capital / 12.0
    deals = _deals(r, fin)
    groups, total_interest, total_principal, charge_bldg = [], 0.0, 0.0, 0.0
    for g in r["flat_groups"]:
        d = deals[g["position"]]
        c = d.charge_per_month
        to_inv = c * (1 - fin.reserve)
        principal = to_inv * F.annuity_factor(fin.cost_of_capital, fin.term_years)
        bal = principal
        rows, interest_sum = [], 0.0
        for k in range(n):
            interest = bal * i
            prin = to_inv - interest
            bal = bal - prin
            if k == n - 1:
                bal = 0.0 if abs(bal) < 0.01 else bal
            interest_sum += interest
            rows.append({"n": k + 1, "month": month_label(y0, m0, k), "charge": round(c, 2),
                         "reserve": round(c * fin.reserve, 2), "interest": round(interest, 2),
                         "principal": round(prin, 2), "balance": round(max(bal, 0.0), 2)})
        cnt = g["count"]
        total_interest += cnt * interest_sum
        total_principal += cnt * principal
        charge_bldg += cnt * c
        groups.append({"position": g["position"], "label": g["label"], "count": cnt,
                       "principal_per_flat": round(principal, 2), "net_capex_per_flat": round(d.net_capex, 2),
                       "funding_gap_per_flat": round(d.gap, 2), "charge_per_month": round(c, 2), "rows": rows})
    total_repaid = charge_bldg * n
    reserve_total = total_repaid * fin.reserve

    if pkg.cool_roof:
        interval = int(P.v("roof_wash_interval_years"))
        washes = fin.term_years // interval if interval > 0 else 0
        wash_cost = P.v("roof_wash_cost_per_m2") * r["building"]["roof_m2"]
        ageing = {"reflectance_new": P.v("roof_reflectance_cool_new"),
                  "reflectance_aged_3yr": P.v("roof_reflectance_cool_aged_3yr"), "used_in_model": "aged",
                  "absorptance_used": P.v("roof_absorptance_cool_aged"),
                  "wash_interval_years": interval, "wash_cost": round(wash_cost, 0), "washes_in_term": washes,
                  "wash_cost_total": round(washes * wash_cost, 0),
                  "source": P.SRC_UNSW_V1,
                  "note": ("Bills are modelled with the aged reflectance for the whole term, which is cautious for the "
                           "first years. Washing costs are an assumption and are not in the charge; they must come from "
                           "the owner's maintenance budget or the reserve.")}
    else:
        ageing = {"reflectance_new": None, "reflectance_aged_3yr": None, "used_in_model": "not selected",
                  "wash_interval_years": None, "wash_cost": 0, "washes_in_term": 0, "wash_cost_total": 0,
                  "source": P.SRC_UNSW_V1, "note": "No cool roof in this package."}

    life_check = []
    for key, pk in LIFE_KEYS.items():
        if getattr(pkg, key):
            life = P.v(pk)
            life_check.append({"key": key, "life_years": life, "term_years": fin.term_years,
                               "ok": bool(fin.term_years <= life),
                               "within_pays_rule": bool(fin.term_years <= 0.8 * life),
                               "kind": P.PARAMS[pk].kind})
    return {
        "term_years": fin.term_years, "months": n, "start": month_label(y0, m0, 0), "end": month_label(y0, m0, n - 1),
        "groups": groups,
        "building": {"principal": round(total_principal, 2), "net_capex": r["package"]["net_capex"],
                     "funding_gap": r["package"]["funding_gap"], "charge_per_month": round(charge_bldg, 2),
                     "total_repaid": round(total_repaid, 2), "total_interest": round(total_interest, 2),
                     "total_to_investor": round(total_repaid - reserve_total, 2)},
        "reserve": {"rate": fin.reserve, "contribution_total": round(reserve_total, 2),
                    "note": ("Each month this share of every charge is held in the reserve, against unpaid bills, "
                             "equipment faults and savings that turn out lower than modelled (true-ups). Only the rest "
                             "repays the investor.")},
        "cool_roof_ageing": ageing,
        "equipment_life_check": life_check,
        "method": ("Each charge is split into the reserve share and the investor's share. The investor's share pays "
                   "interest on the balance at the cost of capital divided by 12, and the rest repays principal."),
    }


# ------------------------------------------------------------------------------------------------ risk

INPUTS = [
    ("occupant_use", "risk_occupant_use", "How much hot water and heating people use"),
    ("electricity_price", "risk_electricity_price", "Electricity prices"),
    ("gas_price", "risk_gas_price", "Gas prices"),
    ("hot_water_performance", "risk_hpwh_cop", "Heat pump hot water performance"),
    ("ac_performance", "risk_ac_cop", "Air conditioner performance"),
    ("weather_cooling", "risk_weather_cooling", "How hot the summers are"),
    ("weather_heating", "risk_weather_heating", "How cold the winters are"),
    ("roof_ageing", "risk_roof_absorptance", "How much the cool roof darkens with dirt and age"),
]


def _end_uses(use) -> tuple[dict[str, float], dict[str, float]]:
    e = {k: float(v.sum()) for k, v in use.electricity_kwh.items()}
    g = {k: float(v.sum()) for k, v in use.gas_mj.items()}
    return e, g


def _gas_rate(ctx: Context, use) -> float:
    """Average gas usage price (AUD/MJ) under the block tariff for this flat's yearly pattern."""
    bill = compute_bill(use, ctx.tariff, ctx.weather.month)
    mj = bill.gas_mj
    if mj <= 0:
        return ctx.tariff.gas_c_per_mj / 100.0
    gas_cost = sum(line["cost_per_year"] - line["electricity_kwh"] * ctx.tariff.electricity_c_per_kwh / 100.0
                   for line in bill.by_end_use if line["key"] not in ("electricity_supply", "gas_supply"))
    return gas_cost / mj


def risk(req: AssessRequest, runs: int = 500, seed: int = 1, allow_network: bool = True) -> dict[str, Any]:
    if not 20 <= int(runs) <= 20000:
        raise AssessError("Please choose between 20 and 20,000 runs.")
    runs = int(runs)
    ctx = build(req, allow_network=allow_network)
    r = assess(req, allow_network=allow_network)
    fin, pkg = req.finance, req.package
    deals = _deals(r, fin)
    rng = np.random.default_rng(seed)
    draws = {}
    for key, pk, _ in INPUTS:
        lo, mode, hi = P.v(pk)
        draws[key] = rng.triangular(lo, mode, hi, runs)

    t = ctx.tariff
    days = ctx.weather.hours // 24
    pe = draws["electricity_price"] * t.electricity_c_per_kwh / 100.0
    pg_mult = draws["gas_price"]
    cop_hw_nom, cop_ac_nom = P.v("cop_heat_pump_hot_water"), P.v("cop_reverse_cycle_heating")
    eer_nom = P.v("eer_reverse_cycle_cooling")
    u, wc, wh = draws["occupant_use"], draws["weather_cooling"], draws["weather_heating"]

    def cost(e: dict, g: dict, gas_rate: float, eq, connected: bool, alpha_e: dict | None = None) -> np.ndarray:
        """Yearly bill for every draw."""
        hw_e = e["hot_water"] * u
        if eq.hot_water == "heat_pump":
            hw_e = hw_e * cop_hw_nom / draws["hot_water_performance"]
        heat_e = (alpha_e["heating"] if alpha_e else e["heating"]) * u * wh
        cool_e = (alpha_e["cooling"] if alpha_e else e["cooling"]) * wc
        if eq.heating == "reverse_cycle":
            heat_e = heat_e * cop_ac_nom / draws["ac_performance"]
        if eq.cooling == "reverse_cycle":
            cool_e = cool_e * eer_nom / draws["ac_performance"]
        kwh = hw_e + heat_e + cool_e + e["cooking"] + e["appliances"]
        mj = g["hot_water"] * u + g["heating"] * u * wh + g["cooking"]
        out = kwh * pe + days * t.electricity_supply_c_per_day / 100.0 * draws["electricity_price"]
        out = out + mj * gas_rate * pg_mult
        if connected:
            out = out + days * t.gas_supply_c_per_day / 100.0 * pg_mult
        return out

    alphas = None
    if pkg.cool_roof:
        lo, mode, hi = P.v("risk_roof_absorptance")
        alphas = (lo, mode, hi)

    net_by_group, saving_by_group = {}, {}
    groups_out = []
    for p in ctx.positions:
        bu = ctx.A.use(p, ctx.base_cfg)
        uu = ctx.A.use(p, ctx.up_cfg)
        be, bg = _end_uses(bu)
        ue, ug = _end_uses(uu)
        alpha_e = None
        if alphas and p == "top":
            pts = []
            for a in alphas:
                cfg = Config(a, ctx.up_cfg.ceiling_insulated, ctx.up_eq)
                pts.append(_end_uses(ctx.A.use(p, cfg))[0])
            x = draws["roof_ageing"]
            alpha_e = {k: np.interp(x, alphas, [pt[k] for pt in pts]) for k in ("heating", "cooling")}
        base_cost = cost(be, bg, _gas_rate(ctx, bu), ctx.base_eq, ctx.base_eq.gas_connected)
        up_cost = cost(ue, ug, _gas_rate(ctx, uu), ctx.up_eq, ctx.up_eq.gas_connected, alpha_e)
        saving = base_cost - up_cost
        d = deals[p]
        net = saving / 12.0 - d.charge_per_month
        net_by_group[p], saving_by_group[p] = net, saving
        q = np.percentile(net, [10, 50, 90])
        groups_out.append({
            "position": p, "count": ctx.counts[p],
            "modelled_net_saving_per_month": round(d.net_saving_per_month, 2),
            "charge_per_month": round(d.charge_per_month, 2),
            "net_saving_per_month": {"p10": round(float(q[0]), 2), "p50": round(float(q[1]), 2),
                                     "p90": round(float(q[2]), 2)},
            "saving_per_month": {"p10": round(float(np.percentile(saving, 10) / 12), 2),
                                 "p50": round(float(np.percentile(saving, 50) / 12), 2),
                                 "p90": round(float(np.percentile(saving, 90) / 12), 2)},
            "prob_tenant_worse_off": round(float((net < 0).mean()), 3),
            "prob_saving_below_charge": round(float((fin.savings_share_to_charge * saving / 12.0
                                                     < d.charge_per_month - 1e-9).mean()), 3),
        })

    # ---- building funding with the true-up rule applied (charge cut to share x realised saving when lower)
    af = F.annuity_factor(fin.cost_of_capital, fin.term_years) * (1 - fin.reserve)
    gap = np.zeros(runs)
    for p in ctx.positions:
        d = deals[p]
        realised = np.clip(np.minimum(d.charge_per_month, fin.savings_share_to_charge * saving_by_group[p] / 12.0), 0, None)
        gap += ctx.counts[p] * np.clip(d.net_capex - realised * af, 0, None)
    gq = np.percentile(gap, [10, 50, 90])

    # ---- drivers: linear regression of the average flat's net saving on the inputs
    flats = sum(ctx.counts.values())
    avg_net = sum(ctx.counts[p] * net_by_group[p] for p in ctx.positions) / flats
    keys = [k for k, _, _ in INPUTS if np.std(draws[k]) > 0 and not (k == "roof_ageing" and not alphas)]
    X = np.column_stack([draws[k] for k in keys] + [np.ones(runs)])
    beta, *_ = np.linalg.lstsq(X, avg_net, rcond=None)
    contrib = np.array([beta[j] ** 2 * np.var(draws[k]) for j, k in enumerate(keys)])
    total_var = float(np.var(avg_net))
    resid = avg_net - X @ beta
    fit_r2 = float(1 - np.var(resid) / total_var) if total_var > 0 else 1.0
    shares = contrib / contrib.sum() if contrib.sum() > 0 else contrib
    labels = {k: lab for k, _, lab in INPUTS}
    drivers = sorted([{"key": k, "label": labels[k], "share_of_variance": round(float(s), 3),
                       "direction": "higher helps tenants" if beta[j] > 0 else "higher hurts tenants"}
                      for j, (k, s) in enumerate(zip(keys, shares))], key=lambda x: -x["share_of_variance"])

    # ---- safe share
    conf = P.v("risk_safe_confidence")
    safe = 0.0
    binding_note = ""
    for s in np.round(np.arange(0.0, 1.0001, 0.01), 2):
        ok = True
        for p in ctx.positions:
            d = deals[p]
            if d.saving_per_year <= 0:
                continue
            charge_s = min(d.required_per_month, s * d.saving_per_year / 12.0)
            if (saving_by_group[p] / 12.0 < charge_s - 1e-9).mean() > 1 - conf:
                ok = False
                break
        if not ok:
            break
        safe = float(s)
    if safe >= 1.0:
        binding_note = " Every share passes because the charge is set by repaying the cost, not by the share cap."

    inputs_varied = []
    for key, pk, lab in INPUTS:
        lo, mode, hi = P.v(pk)
        prm = P.PARAMS[pk]
        inputs_varied.append({"key": key, "label": lab, "low": lo, "mode": mode, "high": hi,
                              "distribution": "triangular", "source": prm.source, "kind": prm.kind, "note": prm.note,
                              "used": not (key == "roof_ageing" and not alphas)})
    return {
        "runs": runs, "seed": seed, "groups": groups_out,
        "building": {"prob_fully_funded": round(float((gap < 1.0).mean()), 3),
                     "funding_gap": {"p10": round(float(gq[0]), 0), "p50": round(float(gq[1]), 0),
                                     "p90": round(float(gq[2]), 0)},
                     "modelled_funding_gap": r["package"]["funding_gap"],
                     "note": ("Funding assumes the true-up rule: when a flat's real saving is lower than modelled, its "
                              "charge is cut to the share of the real saving, so less capital is repaid.")},
        "drivers": drivers,
        "drivers_method": (f"Linear regression of the average flat's monthly net saving on the inputs; each input's share "
                           f"of the explained variance. The linear fit explains {fit_r2:.0%} of the spread."),
        "inputs_varied": inputs_varied,
        "safe_share": {"savings_share_to_charge": safe,
                       "meaning": (f"Largest share of the modelled saving the charge could take while {conf:.0%} of runs "
                                   "leave every tenant group no worse off." + binding_note),
                       "current_share": fin.savings_share_to_charge},
        "method": ("Seeded Monte Carlo. Each run draws every input from its range, rescales the modelled yearly energy by "
                   "end use and redoes the bills. The hourly thermal model is not rerun per draw; the cool roof's ageing "
                   "uses three thermal runs (new, aged, dirty) and interpolates. Gas block pricing is approximated by the "
                   "flat's average gas price. The charge is held at the modelled level."),
        "warnings": ["One weather year is used; hotter or colder years are represented by scaling cooling and heating.",
                     "The ranges are judgements unless a source is given."],
    }
