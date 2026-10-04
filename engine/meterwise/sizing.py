"""Right-sizing: design cooling and heating loads per flat group, split system size and cost with and without the
roof upgrade, hot water units, and a simple electrical supply check.

Method in plain words:
- Run the same hourly thermal model the bills use, with the air conditioner allowed to run (2-11 pm, 26 C) and the
  heater allowed to run (6-9 am, 5-11 pm, 20 C), on the building's local weather year.
- Design load = the hourly load exceeded in only 1% of the year's hours (the 99th percentile of all 8,760 hourly
  values), for the conditioned part of the flat, plus a 10% margin.
- Leave out the first hour of each on-period (the ideal model delivers a whole warm-up in one hour).
- Pick the smallest standard split system that covers both the cooling and the heating design load (heating output
  taken as 1.15 x nominal cooling size, an assumption).
- "Without roof" uses the original roof and ceiling; "with package" uses the aged cool roof (and ceiling
  insulation if chosen). Only top-floor flats have a roof, so lower-floor flats are sized the same both ways.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from . import params as P
from ._context import Context, build
from .assess import GROUP_LABELS, Config
from .models import AssessRequest

PARAM_KEYS = ["design_load_percentile", "sizing_margin", "split_heating_to_cooling_ratio", "split_system_cost_by_size", "conditioned_share",
              "cooling_setpoint_c", "heating_setpoint_c", "cooling_hours", "heating_hours", "roof_absorptance_cool_aged",
              "eer_reverse_cycle_cooling", "hpwh_input_kw", "induction_diversified_kw", "resistive_heater_kw",
              "existing_flat_peak_kw", "flat_supply_amps", "supply_voltage_v", "cost_switchboard_upgrade"]


def _assumptions() -> list[dict[str, Any]]:
    out = []
    for k in PARAM_KEYS:
        p = P.PARAMS[k]
        out.append({"key": k, "label": p.label, "value": p.value, "unit": p.unit, "source": p.source, "kind": p.kind,
                    "note": p.note})
    return out


def design_loads(ctx: Context, position: str, cfg: Config) -> tuple[float, float]:
    """(cooling kW, heating kW) design loads for the conditioned share of one flat."""
    th = ctx.A.thermal(position, cfg, heating=True, cooling=True)
    share = P.v("conditioned_share")
    pct = P.v("design_load_percentile")
    hod = ctx.weather.hour_of_day
    # Leave out the first hour of each on-period: the ideal model delivers the whole warm-up or cool-down in one hour,
    # which a real unit spreads over a longer time.
    first_c = np.isin(hod, [a for a, _ in P.v("cooling_hours")])
    first_h = np.isin(hod, [a for a, _ in P.v("heating_hours")])
    cool = float(np.percentile(th.cooling_w[~first_c], pct)) * share / 1000.0
    heat = float(np.percentile(th.heating_w[~first_h], pct)) * share / 1000.0
    return cool, heat


def pick_unit(kw_needed: float) -> tuple[float, float]:
    """Smallest standard size (kW) covering the need, and its installed price. Above the largest size: the largest."""
    table = P.v("split_system_cost_by_size")
    for size, cost in table:
        if size >= kw_needed - 1e-9:
            return float(size), float(cost)
    return float(table[-1][0]), float(table[-1][1])


def _building_peak(ctx: Context, cfg: Config) -> float:
    tot = sum(ctx.counts[p] * ctx.A.use(p, cfg).total_kwh() for p in ctx.positions)
    return float(np.max(tot))


def building_peaks(ctx: Context) -> dict[str, float]:
    return {"before": _building_peak(ctx, ctx.base_cfg), "after": _building_peak(ctx, ctx.up_cfg),
            "after_without_roof": _building_peak(ctx, ctx.up_cfg_no_envelope)}


def size_systems(req: AssessRequest, allow_network: bool = True) -> dict[str, Any]:
    ctx = build(req, allow_network=allow_network)
    pkg, ex = req.package, req.existing
    margin = P.v("sizing_margin")
    groups = []
    unit_with: dict[str, float] = {}
    unit_without: dict[str, float] = {}
    capex_saved = 0.0
    for p in ctx.positions:
        c0, h0 = design_loads(ctx, p, ctx.up_cfg_no_envelope)
        c1, h1 = design_loads(ctx, p, ctx.up_cfg)
        ratio = P.v("split_heating_to_cooling_ratio")
        need0, need1 = margin * max(c0, h0 / ratio), margin * max(c1, h1 / ratio)
        u0, cost0 = pick_unit(need0)
        u1, cost1 = pick_unit(need1)
        unit_with[p], unit_without[p] = u1, u0
        if pkg.reverse_cycle:
            capex_saved += ctx.counts[p] * (cost0 - cost1)
        groups.append({
            "position": p, "label": GROUP_LABELS[p], "count": ctx.counts[p],
            "design_cooling_kw_without_roof": round(c0, 2), "design_cooling_kw_with_package": round(c1, 2),
            "reduction_pct": round(100 * (c0 - c1) / c0, 1) if c0 > 0 else 0.0,
            "unit_kw_without_roof": u0, "unit_kw_with_package": u1,
            "unit_cost_without_roof": cost0, "unit_cost_with_package": cost1,
            "design_heating_kw": round(h1, 2), "design_heating_kw_without_roof": round(h0, 2),
            "sized_by": "heating" if h1 / ratio > c1 else "cooling",
            "sized_by_without_roof": "heating" if h0 / ratio > c0 else "cooling",
            "unit_kw_for_cooling_only_without_roof": pick_unit(margin * c0)[0],
            "unit_kw_for_cooling_only_with_package": pick_unit(margin * c1)[0],
        })

    # ---- hot water
    flats = ctx.b["flats"]
    litres = P.v("occupants_per_flat") * P.v("hot_water_l_per_person_day")
    if pkg.heat_pump_hot_water:
        hot_water = {"system": "heat_pump_individual", "units": flats, "kw_each": P.v("hpwh_input_kw"),
                     "litres_per_day_per_flat": round(litres, 0),
                     "note": (f"One heat pump water heater per flat (as costed in the deal), each drawing about "
                              f"{P.v('hpwh_input_kw')} kW while running. A shared system for the block may suit some sites "
                              "but is not modelled.")}
    else:
        hot_water = {"system": "unchanged", "units": 0, "kw_each": 0.0, "litres_per_day_per_flat": round(litres, 0),
                     "note": "The package keeps the existing hot water system."}

    # ---- electrical: one flat (worst group) and the building
    volts = P.v("supply_voltage_v")
    eer = P.v("eer_reverse_cycle_cooling")
    worst = max(ctx.positions, key=lambda q: unit_with[q])

    def added_kw(unit_kw: float) -> float:
        kw = 0.0
        if pkg.reverse_cycle:
            kw += unit_kw / eer
        if pkg.heat_pump_hot_water and ex.hot_water != "electric_storage":
            kw += P.v("hpwh_input_kw")
        if pkg.induction_cooktop and ex.cooktop == "gas":
            kw += P.v("induction_diversified_kw")
        return kw

    removed_kw = P.v("resistive_heater_kw") if (pkg.reverse_cycle and ex.heating == "electric_resistive") else 0.0
    if pkg.induction_cooktop and ex.cooktop == "electric":
        removed_kw += 0.0  # like-for-like swap; demand roughly unchanged
    base_kw = P.v("existing_flat_peak_kw") + (P.v("resistive_heater_kw") if ex.heating == "electric_resistive" else 0.0)
    supply = P.v("flat_supply_amps")

    def flat_after_amps(unit_kw: float) -> float:
        return (base_kw - removed_kw + added_kw(unit_kw)) * 1000 / volts

    amps_with = flat_after_amps(unit_with[worst])
    amps_without = flat_after_amps(unit_without[worst])
    ok_with, ok_without = amps_with <= supply, amps_without <= supply
    flats_needing = {"with": 0, "without": 0}
    for q in ctx.positions:
        if flat_after_amps(unit_with[q]) > supply:
            flats_needing["with"] += ctx.counts[q]
        if flat_after_amps(unit_without[q]) > supply:
            flats_needing["without"] += ctx.counts[q]
    avoided = max(0, flats_needing["without"] - flats_needing["with"]) * P.v("cost_switchboard_upgrade")
    peaks = building_peaks(ctx)
    electrical = {
        "per_flat_added_amps": round(added_kw(unit_with[worst]) * 1000 / volts, 1),
        "per_flat_removed_amps": round(removed_kw * 1000 / volts, 1),
        "per_flat_peak_amps_after": round(amps_with, 1),
        "per_flat_peak_amps_after_without_roof": round(amps_without, 1),
        "typical_supply_amps": supply, "flat_supply_ok": bool(ok_with),
        "building_peak_kw_before": round(peaks["before"], 1), "building_peak_kw_after": round(peaks["after"], 1),
        "building_peak_kw_after_without_roof": round(peaks["after_without_roof"], 1),
        "switchboard_upgrade_likely": bool(not ok_with),
        "flats_needing_upgrade_with_package": flats_needing["with"],
        "flats_needing_upgrade_without_roof": flats_needing["without"],
        "upgrade_cost_avoided": round(avoided, 0),
        "note": (f"Flat check: an assumed {P.v('existing_flat_peak_kw')} kW of everyday peak use, plus the new equipment at "
                 f"its rated input, minus a plug-in heater that is no longer needed, against a {supply:.0f} A supply. "
                 "Building peaks are the highest modelled hour with every flat behaving the same way; real peaks are "
                 "short spikes and can be higher. An electrician must check the switchboard and the building's main supply."),
        "kind": "assumption",
    }

    warnings = list(ctx.warnings)
    if len(ctx.positions) > 1:
        warnings.append("The cool roof and ceiling insulation change only top-floor flats. Lower-floor units are sized "
                        "the same with or without them.")
    if not (pkg.cool_roof or pkg.ceiling_insulation):
        warnings.append("The package has no cool roof or ceiling insulation, so sizes are the same both ways.")
    if any(g["sized_by"] == "heating" for g in groups):
        warnings.append("For some flats the heating load, not the cooling load, sets the unit size, so a cooler roof does "
                        "not make the unit smaller there.")
    if not pkg.reverse_cycle:
        warnings.append("The package has no reverse-cycle air conditioner; the sizes show what would be needed if one "
                        "were added. No cost saving is counted.")
    top = next((g for g in groups if g["position"] == "top"), None)
    if top and (pkg.cool_roof or pkg.ceiling_insulation):
        warnings.append(f"Modelled design cooling load cut for top-floor flats: {top['reduction_pct']:.0f}%. This comes "
                        "from the model, not from a published claim.")
    return {"groups": groups, "hot_water": hot_water, "electrical": electrical,
            "capex_saved_by_right_sizing": round(capex_saved, 0),
            "design_rule": (f"Design load: the hourly load exceeded in 1% of the year's hours "
                            f"({P.v('design_load_percentile'):.0f}th percentile of all 8,760 hours, {ctx.weather.year} "
                            f"local weather), for the {P.v('conditioned_share'):.0%} of the flat that is heated or "
                            f"cooled, plus a {100 * (margin - 1):.0f}% margin. The first hour after the system switches on is left "
                            "out (the ideal model delivers the whole warm-up in one hour). The unit must cover both the "
                            f"cooling load and the heating load (heating output taken as {P.v('split_heating_to_cooling_ratio')}"
                            " x the nominal cooling size)."),
            "assumptions": _assumptions(), "warnings": warnings}
