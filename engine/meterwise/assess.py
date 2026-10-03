"""Assesses one building: thermal runs, equipment, bills, package costs, the bill-neutral deal and impact."""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

import numpy as np

from . import buildings as B
from . import finance as F
from . import params as P
from .bills import Bill, Tariff, compute_bill
from .models import AssessRequest, PackageIn
from .systems import MJ_PER_KWH, Equipment, EnergyUse, energy_use
from .thermal import FlatSpec, ThermalResult, simulate_cached
from .weather import Weather, get_weather

MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DISCLAIMER = ("Meterwise is a screening tool, not engineering or financial advice. Results are modelled estimates; "
              "a site inspection and quotes are needed before any deal.")
WEATHER_SOURCE = "https://open-meteo.com/en/docs/historical-weather-api"
GROUP_LABELS = {"top": "Top-floor flats", "lower": "Lower-floor flats"}

ITEM_META = {
    "heat_pump_hot_water": ("Heat pump hot water", "flat", "Replaces the existing hot water system in every flat"),
    "reverse_cycle": ("Reverse-cycle air conditioner (heating and cooling)", "flat",
                      "One efficient split system per flat, for heating and cooling"),
    "induction_cooktop": ("Induction cooktop", "flat", "Replaces the existing cooktop"),
    "disconnect_gas": ("Gas disconnection", "flat", "Removes the gas meter so the daily gas charge stops"),
    "ceiling_insulation": ("Ceiling insulation", "building", "Benefits top-floor flats only"),
    "cool_roof": ("Reflective cool roof coating", "building", "Benefits top-floor flats only"),
}
ATTRIBUTION_ORDER = ["heat_pump_hot_water", "reverse_cycle", "induction_cooktop", "disconnect_gas",
                     "ceiling_insulation", "cool_roof"]


class AssessError(Exception):
    """A request problem with a plain-language message and an HTTP status."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass
class Config:
    """One whole-flat configuration: envelope plus equipment."""

    roof_absorptance: float
    ceiling_insulated: bool
    equipment: Equipment


# ----------------------------------------------------------------------------------------------- helpers

def anomaly_to_air_c(surface_anomaly_c: float) -> float:
    """Convert a satellite land-surface temperature anomaly into an assumed air temperature adjustment (capped)."""
    cap = P.v("anomaly_air_cap_c")
    air = P.v("anomaly_air_fraction") * surface_anomaly_c
    return float(round(max(-cap, min(cap, air)) * 20) / 20)  # nearest 0.05 C (also improves caching)


def group_counts(storeys: int, flats: int) -> dict[str, int]:
    """Flats on the top floor and below. Top floor holds 1/storeys of the flats (rounded, at least one)."""
    if storeys <= 1:
        return {"top": flats}
    top = min(flats, max(1, int(round(flats / storeys))))
    return {"top": top, "lower": flats - top}


def resolve_building(req: AssessRequest, ds: B.Dataset) -> tuple[dict[str, Any], list[str]]:
    """Building inputs from the dataset (plus overrides) or entirely from the request."""
    warnings: list[str] = []
    o = req.building
    if req.building_id:
        f = ds.by_id.get(req.building_id)
        if f is None:
            raise AssessError(f"No building with id '{req.building_id}' was found.", 404)
        p = f["properties"]
        b = {"id": p["id"], "label": p["label"], "storeys": int(p["storeys"]), "flats": int(p["flats_est"]),
             "roof_m2": float(p["roof_m2"]), "flat_area_m2": P.v("flat_area_m2"), "lat": p["lat"], "lon": p["lon"],
             "heat_anomaly_c": float(p["heat_anomaly_c"]), "heat_band": p["heat_band"],
             "storeys_source": p.get("storeys_source", "assumed"), "suburb": p.get("suburb", "")}
        if b["storeys_source"] != "osm" and o.storeys is None:
            warnings.append(f"The number of storeys ({b['storeys']}) was assumed, not mapped. Check it on site.")
        if o.flats is None:
            warnings.append(f"The number of flats ({b['flats']}) is estimated from the building's footprint and height.")
        for k in ["storeys", "flats", "roof_m2", "flat_area_m2", "lat", "lon", "heat_anomaly_c", "label"]:
            val = getattr(o, k)
            if val is not None:
                b[k] = val
        if o.heat_anomaly_c is not None:
            b["heat_band"] = B.band_for(o.heat_anomaly_c, ds.anomaly_quintiles)
    else:
        missing = [k for k in ["storeys", "flats", "roof_m2", "lat", "lon"] if getattr(o, k) is None]
        if missing:
            raise AssessError("Please give either a building_id or the building's " + ", ".join(missing) + ".")
        b = {"id": None, "label": o.label or "Custom building", "storeys": o.storeys, "flats": o.flats,
             "roof_m2": o.roof_m2, "flat_area_m2": o.flat_area_m2 or P.v("flat_area_m2"), "lat": o.lat, "lon": o.lon,
             "heat_anomaly_c": o.heat_anomaly_c or 0.0, "storeys_source": "user", "suburb": ""}
        b["heat_band"] = B.band_for(b["heat_anomaly_c"], ds.anomaly_quintiles)
        if o.heat_anomaly_c is None:
            warnings.append("No local heat value was given, so the building is treated as average for the area.")
    if b["flats"] < b["storeys"]:
        warnings.append("There are fewer flats than storeys; the split between top-floor and lower flats is approximate.")
    if b["lat"] is None or b["lon"] is None:
        raise AssessError("The building has no location.")
    return b, warnings


def equipment_pair(existing, pkg: PackageIn) -> tuple[Equipment, Equipment, bool, list[str]]:
    """Baseline and upgraded equipment, whether gas disconnection applies, and warnings."""
    warnings: list[str] = []
    base = Equipment(existing.hot_water, existing.heating, existing.cooling, existing.cooktop, gas_connected=False)
    base = replace(base, gas_connected=base.uses_gas)
    up = Equipment(
        hot_water="heat_pump" if pkg.heat_pump_hot_water else existing.hot_water,
        heating="reverse_cycle" if pkg.reverse_cycle else existing.heating,
        cooling="reverse_cycle" if pkg.reverse_cycle else existing.cooling,
        cooktop="induction" if pkg.induction_cooktop else existing.cooktop,
        gas_connected=True,
    )
    disconnect = False
    if not base.uses_gas:
        up = replace(up, gas_connected=False)
        if pkg.disconnect_gas:
            warnings.append("These flats have no gas appliances, so there is no gas to disconnect.")
    elif up.uses_gas:
        if pkg.disconnect_gas:
            left = [n for n, gas in [("hot water", up.hot_water.startswith("gas")), ("heating", up.heating == "gas_heater"),
                                     ("cooktop", up.cooktop == "gas")] if gas]
            warnings.append("Gas disconnection was ignored because the " + " and ".join(left)
                            + " would still use gas. Add the matching upgrade to disconnect.")
    else:
        if pkg.disconnect_gas:
            disconnect = True
            up = replace(up, gas_connected=False)
        else:
            warnings.append("Every gas appliance is replaced, but the gas stays connected, so each flat still pays the "
                            "daily gas supply charge. Turning on gas disconnection would save that charge.")
    return base, up, disconnect, warnings


def _hottest_week_start(t_out: np.ndarray) -> int:
    """Index (at midnight) of the 7-day window with the highest mean outdoor temperature."""
    days = len(t_out) // 24
    daily = t_out[: days * 24].reshape(days, 24).mean(axis=1)
    weekly = np.convolve(daily, np.ones(7) / 7, mode="valid")
    return int(np.argmax(weekly)) * 24


# ----------------------------------------------------------------------------------------------- core

class Assessor:
    """Runs and caches the per-group calculations for one building."""

    def __init__(self, weather: Weather, flat_area: float, anomaly_air: float, litres_per_day: float, tariff: Tariff):
        self.w = weather
        self.area = flat_area
        self.anom = anomaly_air
        self.litres = litres_per_day
        self.tariff = tariff
        self.months = weather.month

    def spec(self, position: str, cfg: Config) -> FlatSpec:
        top = position == "top"
        return FlatSpec(floor_area_m2=round(self.area, 1), top_floor=top,
                        roof_absorptance=cfg.roof_absorptance if top else 0.0,
                        ceiling_insulated=cfg.ceiling_insulated if top else False,
                        heat_anomaly_air_c=self.anom)

    def thermal(self, position: str, cfg: Config, heating: bool = True, cooling: bool = True) -> ThermalResult:
        return simulate_cached(self.spec(position, cfg), self.w.source_file, heating, cooling)

    def use(self, position: str, cfg: Config) -> EnergyUse:
        th = self.thermal(position, cfg)
        return energy_use(cfg.equipment, self.w, th.heating_w, th.cooling_w, self.litres)

    def bill(self, position: str, cfg: Config) -> tuple[Bill, EnergyUse]:
        u = self.use(position, cfg)
        return compute_bill(u, self.tariff, self.months), u


def _summary(bill: Bill) -> dict[str, Any]:
    return {"electricity_kwh": round(bill.electricity_kwh, 1), "gas_mj": round(bill.gas_mj, 1),
            "bill_per_year": round(bill.bill_per_year, 2), "by_end_use": bill.by_end_use,
            "gas_connected": bill.gas_connected}


def item_costs(key: str, b: dict[str, Any], apply_rebates: bool, existing) -> tuple[float, float]:
    """Capex and rebate (AUD, whole building) for one package item."""
    flats = b["flats"]
    if key == "cool_roof":
        return P.v("cost_cool_roof_per_m2") * b["roof_m2"], 0.0
    if key == "ceiling_insulation":
        return P.v("cost_ceiling_insulation_per_m2") * b["roof_m2"], 0.0
    if key == "heat_pump_hot_water":
        capex = (P.v("cost_heat_pump_hot_water") + P.v("cost_hpwh_flat_premium")) * flats
        nsw = P.v("rebate_hpwh_nsw_from_electric") if existing.hot_water == "electric_storage" else P.v("rebate_hpwh_nsw_from_gas")
        stc = P.v("stc_count_hpwh") * P.v("stc_price")
        rebate = (stc + nsw) * flats if apply_rebates else 0.0
        return capex, rebate
    if key == "reverse_cycle":
        capex = P.v("cost_reverse_cycle") * flats
        rebate = P.v("rebate_reverse_cycle_nsw") * flats if apply_rebates else 0.0
        return capex, rebate
    if key == "induction_cooktop":
        return P.v("cost_induction") * flats, 0.0
    if key == "disconnect_gas":
        return P.v("gas_abolishment_cost") * flats, 0.0
    raise KeyError(key)


def assess(req: AssessRequest, allow_network: bool = True) -> dict[str, Any]:
    """Full assessment of one building, shaped as the /api/assess response."""
    ds = B.load()
    b, warnings = resolve_building(req, ds)
    weather, wwarn = get_weather(b["lat"], b["lon"], allow_network=allow_network)
    warnings += wwarn
    fin, pkg, ex, t = req.finance, req.package, req.existing, req.tariff
    tariff = Tariff(t.electricity_c_per_kwh, t.electricity_supply_c_per_day, t.gas_c_per_mj, t.gas_supply_c_per_day)
    anom_air = anomaly_to_air_c(b["heat_anomaly_c"])
    litres = P.v("occupants_per_flat") * P.v("hot_water_l_per_person_day")
    A = Assessor(weather, b["flat_area_m2"], anom_air, litres, tariff)
    counts = group_counts(b["storeys"], b["flats"])
    positions = list(counts)

    base_eq, up_eq, disconnect, eqwarn = equipment_pair(ex, pkg)
    warnings += eqwarn
    alpha_base = P.v("roof_absorptance_dark") if ex.roof == "dark" else P.v("roof_absorptance_light")
    alpha_up_if_cool = min(alpha_base, P.v("roof_absorptance_cool_aged"))
    alpha_up = alpha_up_if_cool if pkg.cool_roof else alpha_base
    if pkg.cool_roof and ex.roof == "light":
        warnings.append("The roof is already light-coloured, so a cool roof coating adds only a small benefit.")

    # --- sequential configurations for attributing savings to items
    selected = {
        "heat_pump_hot_water": pkg.heat_pump_hot_water, "reverse_cycle": pkg.reverse_cycle,
        "induction_cooktop": pkg.induction_cooktop, "disconnect_gas": disconnect,
        "ceiling_insulation": pkg.ceiling_insulation, "cool_roof": pkg.cool_roof,
    }
    cfg = Config(alpha_base, False, base_eq)
    steps: list[tuple[str | None, Config]] = [(None, cfg)]
    for key in ATTRIBUTION_ORDER:
        eq = cfg.equipment
        if not selected[key]:
            continue
        if key == "heat_pump_hot_water":
            eq = replace(eq, hot_water=up_eq.hot_water)
        elif key == "reverse_cycle":
            eq = replace(eq, heating=up_eq.heating, cooling=up_eq.cooling)
        elif key == "induction_cooktop":
            eq = replace(eq, cooktop=up_eq.cooktop)
        elif key == "disconnect_gas":
            eq = replace(eq, gas_connected=False)
        cfg = Config(
            alpha_up if key == "cool_roof" else cfg.roof_absorptance,
            True if key == "ceiling_insulation" else cfg.ceiling_insulated,
            eq,
        )
        steps.append((key, cfg))
    base_cfg, up_cfg = steps[0][1], steps[-1][1]

    step_bills = []  # building total per step
    for _, c in steps:
        step_bills.append(sum(counts[p] * A.bill(p, c)[0].bill_per_year for p in positions))
    item_saving = {k: 0.0 for k in ATTRIBUTION_ORDER}
    for i in range(1, len(steps)):
        item_saving[steps[i][0]] = step_bills[i - 1] - step_bills[i]

    # --- what each unselected item would add on top of the current package (marginal, one at a time)
    up_total = step_bills[-1]
    if_selected: dict[str, float | None] = {}
    for key in ATTRIBUTION_ORDER:
        if selected[key]:
            if_selected[key] = item_saving[key]
            continue
        eq = up_cfg.equipment
        cfg_x: Config | None
        if key == "heat_pump_hot_water":
            cfg_x = Config(up_cfg.roof_absorptance, up_cfg.ceiling_insulated, replace(eq, hot_water="heat_pump"))
        elif key == "reverse_cycle":
            cfg_x = Config(up_cfg.roof_absorptance, up_cfg.ceiling_insulated,
                           replace(eq, heating="reverse_cycle", cooling="reverse_cycle"))
        elif key == "induction_cooktop":
            cfg_x = Config(up_cfg.roof_absorptance, up_cfg.ceiling_insulated, replace(eq, cooktop="induction"))
        elif key == "disconnect_gas":
            # Only possible when nothing in the upgraded flat still uses gas.
            ok = base_eq.uses_gas and eq.gas_connected and not eq.uses_gas
            cfg_x = Config(up_cfg.roof_absorptance, up_cfg.ceiling_insulated, replace(eq, gas_connected=False)) if ok else None
        elif key == "ceiling_insulation":
            cfg_x = Config(up_cfg.roof_absorptance, True, eq)
        else:  # cool_roof
            cfg_x = Config(alpha_up_if_cool, up_cfg.ceiling_insulated, eq)
        if cfg_x is None:
            if_selected[key] = None
        else:
            if_selected[key] = up_total - sum(counts[p] * A.bill(p, cfg_x)[0].bill_per_year for p in positions)

    # --- package items and costs
    items = []
    for key in ["cool_roof", "heat_pump_hot_water", "reverse_cycle", "induction_cooktop", "ceiling_insulation",
                "disconnect_gas"]:
        label, applies_to, note = ITEM_META[key]
        capex, rebate = item_costs(key, b, fin.apply_rebates, ex)
        sel = selected[key]
        items.append({"key": key, "label": label, "selected": sel,
                      "capex": round(capex if sel else 0.0, 2), "rebate": round(rebate if sel else 0.0, 2),
                      "net_capex": round(capex - rebate if sel else 0.0, 2), "applies_to": applies_to,
                      "saving_per_year": round(item_saving[key], 2), "note": note,
                      "capex_if_selected": round(capex, 2), "rebate_if_selected": round(rebate, 2),
                      "saving_per_year_if_selected": None if if_selected[key] is None else round(if_selected[key], 2)})
    if pkg.disconnect_gas and not disconnect:
        next(i for i in items if i["key"] == "disconnect_gas")["note"] = "Not applied: some appliances would still use gas"
    elif not disconnect and if_selected["disconnect_gas"] is None and base_eq.uses_gas:
        next(i for i in items if i["key"] == "disconnect_gas")["note"] = (
            "Only possible once no appliance uses gas (add the matching upgrades first)")
    capex_total = sum(i["capex"] for i in items)
    rebates_total = sum(i["rebate"] for i in items)
    net_capex = capex_total - rebates_total
    shared_net = sum(i["net_capex"] for i in items if i["applies_to"] == "building")
    own_net_per_flat = sum(i["net_capex"] for i in items if i["applies_to"] == "flat") / b["flats"]

    # --- per-group bills, comfort and deal
    groups_raw = {}
    for p in positions:
        bb, ub_use = A.bill(p, base_cfg)
        ub, uu = A.bill(p, up_cfg)
        groups_raw[p] = (bb, ub, ub_use, uu)
    savings = [groups_raw[p][0].bill_per_year - groups_raw[p][1].bill_per_year for p in positions]
    shares = F.allocate_shared(shared_net, savings, [counts[p] for p in positions])

    flat_groups, deals = [], {}
    for p, s, share in zip(positions, savings, shares):
        bb, ub, bu, uu = groups_raw[p]
        deal = F.flat_deal(s, own_net_per_flat + share, fin.cost_of_capital, fin.term_years,
                           fin.savings_share_to_charge, fin.reserve)
        deals[p] = deal
        charge = deal.charge_per_month
        neutral = ub.bill_per_year + 12 * charge <= bb.bill_per_year + 0.01
        if s < 0:
            warnings.append(f"{GROUP_LABELS[p]}: the modelled bill rises by ${-s:,.0f} a year, mostly because these flats "
                            "gain air conditioning they did not have before. They pay no monthly charge; their share of the "
                            "cost counts as a funding gap.")
        free_b = A.thermal(p, base_cfg, heating=False, cooling=False)
        free_u = A.thermal(p, up_cfg, heating=False, cooling=False)
        used_b = A.thermal(p, base_cfg, heating=base_eq.has_heating, cooling=base_eq.has_cooling)
        used_u = A.thermal(p, up_cfg, heating=up_eq.has_heating, cooling=up_eq.has_cooling)
        comfort = {
            "hours_above_30c_baseline": int((free_b.indoor_c > 30).sum()),
            "hours_above_30c_upgraded": int((free_u.indoor_c > 30).sum()),
            "peak_indoor_c_baseline": round(float(free_b.indoor_c.max()), 1),
            "peak_indoor_c_upgraded": round(float(free_u.indoor_c.max()), 1),
            "basis": "Without air conditioning running (shows the passive effect of the roof).",
            "period_label": f"Hours over the whole year ({weather.year} weather), with no air conditioning running",
            "as_used_period_label": f"Hours over the whole year ({weather.year} weather), with heating and cooling "
                                    "used as assumed",
            "hours_above_30c_baseline_as_used": int((used_b.indoor_c > 30).sum()),
            "hours_above_30c_upgraded_as_used": int((used_u.indoor_c > 30).sum()),
            "as_used_basis": "With the flat's heating and cooling used as assumed (air conditioning 2-11 pm when hot).",
        }
        base_bill = bb.bill_per_year
        flat_groups.append({
            "position": p, "label": GROUP_LABELS[p], "count": counts[p],
            "baseline": _summary(bb), "upgraded": _summary(ub),
            "saving_per_year": round(s, 2),
            "charge_per_month": round(charge, 2),
            "net_saving_per_month": round(s / 12 - charge, 2),
            "net_saving_pct": round(100 * (s - 12 * charge) / base_bill, 1) if base_bill > 0 else 0.0,
            "bill_neutral": bool(neutral),
            "comfort": comfort,
            "net_capex_per_flat": round(deal.net_capex, 2),
            "shared_cost_per_flat": round(share, 2),
            "max_charge_per_month": round(deal.cap_per_month, 2),
            "full_repayment_charge_per_month": round(deal.required_per_month, 2),
            "funding_gap_per_flat": round(deal.gap, 2),
        })

    # --- building totals
    max_fundable = sum(counts[p] * deals[p].fundable_capex for p in positions)
    gap = sum(counts[p] * deals[p].gap for p in positions)
    fully_funded = gap < 0.5
    charge_bldg = sum(counts[p] * deals[p].charge_per_month for p in positions)
    irr = F.investor_return(net_capex, charge_bldg, fin.term_years, fin.reserve)
    needs = [(deals[p].net_capex, deals[p].cap_per_month) for p in positions if counts[p] > 0]
    r_star = F.rate_for_full_funding(needs, fin.term_years, fin.reserve)
    t_star = F.term_for_full_funding(needs, fin.cost_of_capital, fin.reserve)
    gap_closers = {
        "grant_needed": round(gap, 2),
        "cost_of_capital_for_full_funding": None if r_star is None else round(r_star, 4),
        "term_years_for_full_funding": t_star,
        "note": "Each is a separate way to close the funding gap with everything else unchanged.",
    }
    if not fully_funded:
        warnings.append(f"The capped monthly charges repay ${max(net_capex - gap, 0):,.0f} of the ${net_capex:,.0f} net cost. "
                        f"The remaining ${gap:,.0f} would need a grant, an owner contribution or a smaller package.")

    # PAYS rule: term no longer than 80% of the shortest-lived measure.
    lives = {"heat_pump_hot_water": "life_heat_pump_hot_water", "reverse_cycle": "life_reverse_cycle",
             "cool_roof": "life_cool_roof", "induction_cooktop": "life_induction",
             "ceiling_insulation": "life_ceiling_insulation"}
    sel_lives = [P.v(lives[k]) for k in lives if selected[k]]
    shortest = min(sel_lives) if sel_lives else None
    if shortest and fin.term_years > 0.8 * shortest:
        warnings.append(f"The {fin.term_years}-year term is longer than 80% of the shortest equipment life "
                        f"({shortest} years). Pay As You Save programmes keep the term within that limit.")

    # --- impact
    ef_e, ef_g = P.v("ef_electricity_kg_per_kwh"), P.v("ef_gas_kg_per_gj")
    tot = {"bk": 0.0, "uk": 0.0, "bm": 0.0, "um": 0.0}
    cool_b = np.zeros(weather.hours)
    cool_u = np.zeros(weather.hours)
    for p in positions:
        bb, ub, bu, uu = groups_raw[p]
        n = counts[p]
        tot["bk"] += n * bb.electricity_kwh
        tot["uk"] += n * ub.electricity_kwh
        tot["bm"] += n * bb.gas_mj
        tot["um"] += n * ub.gas_mj
        cool_b += n * bu.electricity_kwh["cooling"]
        cool_u += n * uu.electricity_kwh["cooling"]
    co2_b = (tot["bk"] * ef_e + tot["bm"] / 1000 * ef_g) / 1000
    co2_u = (tot["uk"] * ef_e + tot["um"] / 1000 * ef_g) / 1000
    site_b = tot["bk"] + tot["bm"] / MJ_PER_KWH
    site_u = tot["uk"] + tot["um"] / MJ_PER_KWH
    bill_saving_bldg = sum(counts[p] * s for p, s in zip(positions, savings))

    # --- monthly (average flat)
    nfl = b["flats"]
    mb = sum(counts[p] * groups_raw[p][0].monthly_bill for p in positions) / nfl
    mu = sum(counts[p] * groups_raw[p][1].monthly_bill for p in positions) / nfl
    avg_charge = charge_bldg / nfl
    monthly = [{"month": m + 1, "label": MONTH_LABELS[m], "baseline_bill": round(float(mb[m]), 2),
                "upgraded_bill": round(float(mu[m]), 2), "charge": round(avg_charge, 2)} for m in range(12)]

    # --- heatwave (top floor, free-running)
    fb = A.thermal("top", base_cfg, heating=False, cooling=False)
    fu = A.thermal("top", up_cfg, heating=False, cooling=False)
    i0 = _hottest_week_start(fb.outdoor_c)
    sl = slice(i0, i0 + 168)
    heatwave = {
        "label": f"Hottest week in the weather record used ({weather.year})",
        "start": weather.time[i0],
        "hours": list(range(168)),
        "outdoor_c": [round(float(x), 1) for x in fb.outdoor_c[sl]],
        "indoor_top_baseline_c": [round(float(x), 1) for x in fb.indoor_c[sl]],
        "indoor_top_upgraded_c": [round(float(x), 1) for x in fu.indoor_c[sl]],
        "note": "Top-floor flat with no air conditioning running. Lower floors do not change with the roof.",
    }

    # --- assumptions
    overrides = {"electricity_c_per_kwh": t.electricity_c_per_kwh, "electricity_supply_c_per_day": t.electricity_supply_c_per_day,
                 "gas_c_per_mj": t.gas_c_per_mj, "gas_supply_c_per_day": t.gas_supply_c_per_day,
                 "cost_of_capital": fin.cost_of_capital, "term_years": fin.term_years,
                 "savings_share_to_charge": fin.savings_share_to_charge, "reserve": fin.reserve}
    assumptions = P.as_assumptions(overrides)
    assumptions.append({"key": "weather", "label": "Hourly weather (ERA5 reanalysis via Open-Meteo)",
                        "value": f"{weather.year}, near {weather.lat:.2f}, {weather.lon:.2f}", "unit": "",
                        "source": WEATHER_SOURCE, "kind": "sourced", "note": "Licence CC BY 4.0.", "group": "heat"})
    assumptions.append({"key": "heat_anomaly_air_c", "label": "Air temperature added on hot afternoons for this building",
                        "value": anom_air, "unit": "C", "source": "assumption", "kind": "assumption",
                        "note": f"From a satellite surface difference of {b['heat_anomaly_c']:+.1f} C, using the "
                                "fraction and cap above. Not measured air temperature.", "group": "heat"})

    if ex.cooling == "none" and pkg.reverse_cycle:
        warnings.append("These flats have no air conditioning now. The new reverse-cycle unit adds some cooling energy on "
                        "hot days (included in the bills) in return for safer indoor temperatures.")
    if ds.is_fixture:
        warnings.append("Example (fixture) building data is in use, not real buildings.")
    warnings.append(DISCLAIMER)

    building_out = {k: b[k] for k in ["id", "label", "storeys", "flats", "roof_m2", "flat_area_m2", "heat_anomaly_c", "heat_band"]}
    building_out.update({"lat": b["lat"], "lon": b["lon"], "storeys_source": b.get("storeys_source"),
                         "heat_anomaly_air_c": anom_air})
    return {
        "building": building_out,
        "flat_groups": flat_groups,
        "package": {"items": items, "capex_total": round(capex_total, 2), "rebates_total": round(rebates_total, 2),
                    "net_capex": round(net_capex, 2), "max_fundable_capex": round(max_fundable, 2),
                    "fully_funded": bool(fully_funded), "funding_gap": round(gap, 2),
                    "gap_closers": gap_closers},
        "finance": {"term_years": fin.term_years, "cost_of_capital": fin.cost_of_capital,
                    "savings_share_to_charge": fin.savings_share_to_charge, "reserve": fin.reserve,
                    "charge_per_month_building": round(charge_bldg, 2),
                    "total_repaid": round(charge_bldg * 12 * fin.term_years, 2),
                    "total_repaid_after_reserve": round(charge_bldg * 12 * fin.term_years * (1 - fin.reserve), 2),
                    "reserve_held": round(charge_bldg * 12 * fin.term_years * fin.reserve, 2),
                    "investor_return_pct": None if irr is None else round(irr * 100, 2),
                    "owner_upfront_cost": 0, "tenant_upfront_cost": 0,
                    "apply_rebates": fin.apply_rebates,
                    "shortest_equipment_life_years": shortest},
        "impact": {"bill_saving_per_year_building": round(bill_saving_bldg, 2),
                   "co2e_t_per_year_saved": round(co2_b - co2_u, 2),
                   "gas_mj_per_year_avoided": round(tot["bm"] - tot["um"], 1),
                   "energy_reduction_pct": round(100 * (site_b - site_u) / site_b, 1) if site_b > 0 else 0.0,
                   "peak_cooling_kw_change": round(float(cool_u.max() - cool_b.max()), 2),
                   "co2e_t_per_year_baseline": round(co2_b, 2), "co2e_t_per_year_upgraded": round(co2_u, 2),
                   "electricity_kwh_per_year_change": round(tot["uk"] - tot["bk"], 1)},
        "monthly": monthly,
        "heatwave": heatwave,
        "assumptions": assumptions,
        "warnings": warnings,
    }
