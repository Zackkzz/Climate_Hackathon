"""Portfolio planner: choose blocks within a capital budget and a grant budget for one objective.

Method in plain words:
1. Assess every candidate block with the same package, finance and tariff settings (the same engine as /api/assess).
2. If bulk buying is on, count the units across all candidates, apply the volume discount tiers (assumptions) to
   each block's installed price, and recompute each block's funding gap (the capped charges repay the same amount;
   a lower price shrinks the gap first).
3. Score each block by its benefit for the chosen objective divided by its net cost, and take blocks greedily from
   the best score down, while the capital (repaid by the charges) and the grant (the funding gap) both fit.
4. Recount the units in the blocks actually chosen; if that drops a discount tier, prices are recomputed and the
   selection is repeated once.
Greedy selection by benefit per dollar is simple and explainable; it is not guaranteed to be the best possible set.
"""
from __future__ import annotations

from typing import Any

from . import buildings as B
from . import finance as F
from . import params as P
from .assess import AssessError, assess
from .models import AssessRequest, ExistingIn, FinanceIn, PackageIn, TariffIn

OBJECTIVES = {
    "tenant_saving": ("tenant net saving per year", "Tenant net saving per year (after the charge)"),
    "co2": ("tonnes CO2e saved per year", "Emissions saved"),
    "heat_relief": ("hours above 30 C avoided across top-floor flats", "Hot hours avoided in top-floor flats"),
    "flats_reached": ("flats upgraded", "Number of flats reached"),
}
MAX_BUILDINGS = 120


def _model(cls, data):
    if data is None:
        return cls()
    return data if isinstance(data, cls) else cls(**data)


def _units(r: dict[str, Any]) -> dict[str, float]:
    sel = {i["key"]: i["selected"] for i in r["package"]["items"]}
    flats = r["building"]["flats"]
    return {"heat_pump_hot_water": flats if sel.get("heat_pump_hot_water") else 0,
            "reverse_cycle": flats if sel.get("reverse_cycle") else 0,
            "cool_roof_m2": r["building"]["roof_m2"] if sel.get("cool_roof") else 0.0}


def _tiers(totals: dict[str, float]) -> dict[str, float]:
    """Discount % per item for the given unit totals."""
    out = {k: 0.0 for k in totals}
    for item, min_units, pct in P.v("bulk_tiers"):
        if totals.get(item, 0) >= min_units:
            out[item] = max(out[item], pct)
    return out


def _cost_after_bulk(c: dict[str, Any], disc: dict[str, float], fin: FinanceIn) -> dict[str, float]:
    """Net capex, capital used and grant (gap) for one block after volume discounts."""
    r = c["r"]
    items = {i["key"]: i for i in r["package"]["items"]}
    saved = 0.0
    for key, item_key in (("heat_pump_hot_water", "heat_pump_hot_water"), ("reverse_cycle", "reverse_cycle"),
                          ("cool_roof_m2", "cool_roof")):
        it = items.get(item_key)
        if it and it["selected"]:
            saved += it["capex"] * disc.get(key, 0.0) / 100.0
    net = r["package"]["net_capex"]
    net_after = max(0.0, net - saved)
    af = F.annuity_factor(fin.cost_of_capital, fin.term_years) * (1 - fin.reserve)
    # Spread the saving over flats in proportion to each group's net cost; the capped charge repays the same amount.
    gap = 0.0
    for g in r["flat_groups"]:
        npf = g["net_capex_per_flat"]
        npf_after = npf * (net_after / net) if net > 0 else 0.0
        fundable = max(0.0, g["charge_per_month"]) * af if g["funding_gap_per_flat"] > 0 else npf_after
        gap += g["count"] * max(0.0, npf_after - fundable)
    return {"net_capex": net_after, "grant": gap, "capital": net_after - gap, "bulk_saved": saved}


def _benefit(c: dict[str, Any], objective: str) -> float:
    r = c["r"]
    if objective == "tenant_saving":
        return max(0.0, sum(g["count"] * g["net_saving_per_month"] * 12 for g in r["flat_groups"]))
    if objective == "co2":
        return max(0.0, r["impact"]["co2e_t_per_year_saved"])
    if objective == "heat_relief":
        top = r["flat_groups"][0]
        return max(0.0, top["count"] * (top["comfort"]["hours_above_30c_baseline"] - top["comfort"]["hours_above_30c_upgraded"]))
    return float(r["building"]["flats"])


def _select(cands: list[dict], disc: dict[str, float], fin: FinanceIn, objective: str, capital: float, grant: float):
    for c in cands:
        c["cost"] = _cost_after_bulk(c, disc, fin)
        c["benefit"] = _benefit(c, objective)
        c["ratio"] = c["benefit"] / c["cost"]["net_capex"] if c["cost"]["net_capex"] > 0 else 0.0
    order = sorted(cands, key=lambda c: (-c["ratio"], c["id"]))
    cap_left, grant_left = capital, grant
    chosen, rejected = [], []
    for c in order:
        cost = c["cost"]
        if c["benefit"] <= 0:
            rejected.append((c, "No benefit for this objective with this package"))
        elif cost["capital"] > cap_left + 0.5 and cost["grant"] > grant_left + 0.5:
            rejected.append((c, "Needs more capital and more grant than remain"))
        elif cost["capital"] > cap_left + 0.5:
            rejected.append((c, "Capital needed is larger than the remaining capital budget"))
        elif cost["grant"] > grant_left + 0.5:
            rejected.append((c, "Gap larger than remaining grant"))
        else:
            chosen.append(c)
            cap_left -= cost["capital"]
            grant_left -= cost["grant"]
    return chosen, rejected, cap_left, grant_left


def plan(body: Any, allow_network: bool = True) -> dict[str, Any]:
    body = body if isinstance(body, dict) else body.model_dump()
    objective = body.get("objective") or "tenant_saving"
    if objective not in OBJECTIVES:
        raise AssessError("Objective must be one of: " + ", ".join(OBJECTIVES) + ".")
    capital = float(body.get("capital_budget") or 0.0)
    grant = float(body.get("grant_budget") or 0.0)
    if capital < 0 or grant < 0:
        raise AssessError("Budgets cannot be negative.")
    ds = B.load()
    ids = body.get("building_ids")
    warnings: list[str] = []
    if ids:
        unknown = [i for i in ids if i not in ds.by_id]
        if unknown:
            raise AssessError("These building ids were not found: " + ", ".join(unknown[:10]), 404)
        ids = list(dict.fromkeys(ids))
        if len(ids) > MAX_BUILDINGS:
            raise AssessError(f"Please choose at most {MAX_BUILDINGS} buildings.")
    else:
        feats = sorted(ds.features, key=lambda f: (-(f["properties"].get("quick_score") or 0), f["properties"]["id"]))
        ids = [f["properties"]["id"] for f in feats[:MAX_BUILDINGS]]
        if len(ds.features) > MAX_BUILDINGS:
            warnings.append(f"The {MAX_BUILDINGS} pilot buildings with the highest screening score were considered "
                            f"(of {len(ds.features)}).")
    existing = _model(ExistingIn, body.get("existing"))
    package = _model(PackageIn, body.get("package"))
    finance = _model(FinanceIn, body.get("finance"))
    tariff = _model(TariffIn, body.get("tariff"))
    bulk = bool(body.get("bulk", True))

    cands = []
    for bid in ids:
        r = assess(AssessRequest(building_id=bid, existing=existing, package=package, finance=finance, tariff=tariff),
                   allow_network=allow_network)
        cands.append({"id": bid, "r": r})

    def totals_for(cs: list[dict]) -> dict[str, float]:
        t = {"heat_pump_hot_water": 0.0, "reverse_cycle": 0.0, "cool_roof_m2": 0.0}
        for c in cs:
            for k, v in _units(c["r"]).items():
                t[k] += v
        return t

    disc = _tiers(totals_for(cands)) if bulk else {}
    chosen, rejected, cap_left, grant_left = _select(cands, disc, finance, objective, capital, grant)
    if bulk:
        disc2 = _tiers(totals_for(chosen))
        if disc2 != disc:
            disc = disc2
            chosen, rejected, cap_left, grant_left = _select(cands, disc, finance, objective, capital, grant)
            # Recheck once more; if the tier drops again, keep the lower discount (cautious) without reselecting.
            disc3 = _tiers(totals_for(chosen))
            if any(disc3.get(k, 0) < disc.get(k, 0) for k in disc):
                disc = {k: min(disc.get(k, 0), disc3.get(k, 0)) for k in disc}
                for c in chosen:
                    c["cost"] = _cost_after_bulk(c, disc, finance)
                cap_left = capital - sum(c["cost"]["capital"] for c in chosen)
                grant_left = grant - sum(c["cost"]["grant"] for c in chosen)
                warnings.append("The discount tier dropped after selection; costs use the lower discount.")

    best = max((c["ratio"] for c in chosen), default=0.0)
    selected = []
    for c in chosen:
        r = c["r"]
        top = r["flat_groups"][0]
        flats = r["building"]["flats"]
        selected.append({
            "building_id": c["id"], "label": r["building"]["label"], "flats": flats,
            "net_capex": round(c["cost"]["net_capex"], 0), "capital_used": round(c["cost"]["capital"], 0),
            "grant_used": round(c["cost"]["grant"], 0), "bulk_saving": round(c["cost"]["bulk_saved"], 0),
            "tenant_net_saving_per_month": round(sum(g["count"] * g["net_saving_per_month"] for g in r["flat_groups"]) / flats, 2),
            "co2e_t_per_year_saved": r["impact"]["co2e_t_per_year_saved"],
            "top_floor_hours_above_30c_avoided": top["comfort"]["hours_above_30c_baseline"] - top["comfort"]["hours_above_30c_upgraded"],
            "heat_band": r["building"]["heat_band"],
            "score": round(c["ratio"] / best, 3) if best > 0 else 0.0,
        })
    not_selected = [{"building_id": c["id"], "label": c["r"]["building"]["label"], "reason": why}
                    for c, why in rejected]
    t_sel = totals_for(chosen)
    cap_used = sum(c["cost"]["capital"] for c in chosen)
    grant_used = sum(c["cost"]["grant"] for c in chosen)
    bulk_saved = sum(c["cost"]["bulk_saved"] for c in chosen)
    # Change in each block's peak hour of modelled cooling (from /api/assess impact), summed. Not a coincident grid peak.
    peak_change = sum(c["r"]["impact"]["peak_cooling_kw_change"] for c in chosen)
    tier_rows = []
    for item, units in t_sel.items():
        tier_rows.append({"item": "cool_roof" if item == "cool_roof_m2" else item,
                          "units": round(units, 0), "unit": "m2" if item == "cool_roof_m2" else "units",
                          "discount_pct": disc.get(item, 0.0) if bulk else 0.0, "kind": "assumption"})
    label, _ = OBJECTIVES[objective]
    return {
        "selected": selected,
        "not_selected": not_selected,
        "totals": {"buildings": len(chosen), "flats": sum(c["r"]["building"]["flats"] for c in chosen),
                   "capital_used": round(cap_used, 0), "grant_used": round(grant_used, 0),
                   "capital_left": round(cap_left, 0), "grant_left": round(grant_left, 0),
                   "tenant_saving_per_year": round(sum(
                       sum(g["count"] * g["net_saving_per_month"] * 12 for g in c["r"]["flat_groups"]) for c in chosen), 0),
                   "co2e_t_per_year_saved": round(sum(c["r"]["impact"]["co2e_t_per_year_saved"] for c in chosen), 2),
                   "building_peak_kw_change": round(peak_change, 1),
                   "building_peak_kw_change_note": "Sum of each block's change in its peak hour of cooling electricity; "
                                                   "blocks do not peak at the same hour, so this overstates a grid peak."},
        "bulk": {"applied": bulk, "tiers": tier_rows, "capex_saved": round(bulk_saved, 0),
                 "note": P.PARAMS["bulk_tiers"].note},
        "objective": objective, "candidates": len(cands),
        "method": (f"Each block was assessed with the same settings, then blocks were taken greedily in order of {label} "
                   "per dollar of net cost, while the capital the charges repay and the grant needed for the funding gap "
                   "both fit within the budgets. This is simple and explainable, but not guaranteed to be the best "
                   "possible set." + (" Volume discounts (assumptions) were applied to installed prices." if bulk else "")),
        "warnings": warnings,
    }
