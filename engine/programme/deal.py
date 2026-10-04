"""The deal for one project, in the programme's own layer.

The screening assessment (``meterwise.assess.assess``) has no input for item prices, so quoted prices are applied
here: the modelled bill savings per flat group come from the assessment, and the costs come from the accepted
quote (or the model when there is no quote). The same rules as ``meterwise.finance`` apply, using its functions:

- each participating flat's charge is the lower of the full-repayment charge and ``savings_share_to_charge`` x its
  modelled saving, and never more than the charge in the offer that the tenant agreed to (the ceiling);
- building-wide items (roof, insulation) are shared over every flat in proportion to saving; a declined flat's share
  is carried by the programme as part of the funding gap, not by the other tenants (docs/programme-operations.md);
- a declined flat gets no in-flat work and no charge;
- the funding gap is covered first by the allocated grant, then by any owner contribution.

The charge schedule (amortisation per flat group) is built here too, because it must use the quoted principal.
"""
from __future__ import annotations

from typing import Any

from meterwise import finance as F

from .clock import madd

FLAT_ITEMS = {"heat_pump_hot_water", "reverse_cycle", "induction_cooktop", "disconnect_gas"}


def selected_items(assessment: dict) -> list[dict]:
    return [i for i in assessment["package"]["items"] if i["selected"]]


def compute(assessment: dict, fin: dict, participating: dict[str, int], prices: dict[str, float] | None = None,
            ceilings: dict[str, float] | None = None, grant: float = 0.0, owner_contribution: float = 0.0) -> dict:
    groups = assessment["flat_groups"]
    full = {g["position"]: int(g["count"]) for g in groups}
    total_flats = sum(full.values())
    part = {p: max(0, min(int(participating.get(p, 0)), full[p])) for p in full}
    n_part = sum(part.values())
    coc, term = float(fin["cost_of_capital"]), int(fin["term_years"])
    share_rate, reserve = float(fin["savings_share_to_charge"]), float(fin["reserve"])

    own_per_flat = 0.0
    shared_net = 0.0
    items_out = []
    capex_total = rebates_total = 0.0
    for it in selected_items(assessment):
        key = it["key"]
        quoted = prices is not None and key in prices
        if key in FLAT_ITEMS or it.get("applies_to") == "flat":
            unit_capex = (prices[key] / n_part if n_part else 0.0) if quoted else it["capex"] / total_flats
            unit_rebate = it["rebate"] / total_flats
            own_per_flat += unit_capex - unit_rebate
            capex, rebate = unit_capex * n_part, unit_rebate * n_part
        else:
            capex = prices[key] if quoted else it["capex"]
            rebate = it["rebate"]
            shared_net += capex - rebate
        capex_total += capex
        rebates_total += rebate
        items_out.append({"key": key, "label": it["label"], "applies_to": it.get("applies_to"),
                          "capex": round(capex, 2), "rebate": round(rebate, 2), "net_capex": round(capex - rebate, 2),
                          "priced_from": "quote" if quoted else "model"})

    positions = [g["position"] for g in groups]
    savings = [float(g["saving_per_year"]) for g in groups]
    shares = F.allocate_shared(shared_net, savings, [full[p] for p in positions])
    af = F.annuity_factor(coc, term) * (1 - reserve)
    out_groups = []
    gap = 0.0
    financed = 0.0
    charge_bldg = 0.0
    net_saving_sum = 0.0
    for g, s, sh in zip(groups, savings, shares):
        p = g["position"]
        d = F.flat_deal(s, own_per_flat + sh, coc, term, share_rate, reserve)
        charge = d.charge_per_month
        ceiling = (ceilings or {}).get(p)
        capped_by = "repayment" if d.required_per_month <= d.cap_per_month else "saving_share"
        if ceiling is not None and charge > ceiling + 1e-9:
            charge, capped_by = ceiling, "offer_ceiling"
        principal = min(d.net_capex, charge * af) if charge > 0 else 0.0
        gap_flat = max(0.0, d.net_capex - principal)
        declined_share = (full[p] - part[p]) * sh
        gap += part[p] * gap_flat + declined_share
        financed += part[p] * principal
        charge_bldg += part[p] * charge
        net_saving_sum += part[p] * (s / 12 - charge)
        out_groups.append({"position": p, "count": full[p], "participating": part[p],
                           "saving_per_year": round(s, 2), "net_capex_per_flat": round(d.net_capex, 2),
                           "shared_cost_per_flat": round(sh, 2), "charge_per_month": round(charge, 2),
                           "max_charge_per_month": round(d.cap_per_month, 2),
                           "full_repayment_charge_per_month": round(d.required_per_month, 2),
                           "charge_limited_by": capped_by, "principal_per_flat": round(principal, 2),
                           "funding_gap_per_flat": round(gap_flat, 2),
                           "declined_share_carried": round(declined_share, 2),
                           "net_saving_per_month": round(s / 12 - charge, 2)})
    net_capex = own_per_flat * n_part + shared_net
    grant_used = min(max(grant, 0.0), gap)
    owner_used = min(max(owner_contribution, 0.0), gap - grant_used)
    uncovered = max(0.0, gap - grant_used - owner_used)
    impact = assessment.get("impact", {})
    frac = n_part / total_flats if total_flats else 0.0
    return {
        "basis": "quoted" if prices else "modelled",
        "items": items_out, "capex_total": round(capex_total, 2), "rebates_total": round(rebates_total, 2),
        "net_capex": round(net_capex, 2), "financed": round(financed, 2), "funding_gap": round(gap, 2),
        "grant_allocated": round(grant, 2), "grant_used": round(grant_used, 2),
        "owner_contribution": round(owner_contribution, 2), "owner_used": round(owner_used, 2),
        "gap_uncovered": round(uncovered, 2), "fully_funded": gap < 0.5,
        "gap_covered": uncovered < 0.5,
        "charge_per_month_building": round(charge_bldg, 2),
        "tenant_net_saving_per_month": round(net_saving_sum / n_part, 2) if n_part else 0.0,
        "co2e_t_per_year_saved": round(float(impact.get("co2e_t_per_year_saved", 0.0)) * frac, 2),
        "gas_mj_per_year_avoided": round(float(impact.get("gas_mj_per_year_avoided", 0.0)) * frac, 1),
        "bill_saving_per_year": round(sum(gr["participating"] * gr["saving_per_year"] for gr in out_groups), 2),
        "flats_total": total_flats, "flats_participating": n_part,
        "finance": {"cost_of_capital": coc, "term_years": term, "savings_share_to_charge": share_rate,
                    "reserve": reserve},
        "groups": out_groups,
    }


def group(deal: dict, position: str) -> dict:
    return next(g for g in deal["groups"] if g["position"] == position)


def schedule(deal: dict, start: str, analysis_schedule: dict | None = None) -> dict:
    """Charge schedule in the analysis contract's shape, built from the deal's (possibly quoted) principal.

    Rows: each month's charge, the reserve share of it, interest, principal repaid and the balance after.
    """
    fin = deal["finance"]
    n = fin["term_years"] * 12
    i = fin["cost_of_capital"] / 12
    r = fin["reserve"]
    groups = []
    tot_principal = tot_repaid = tot_interest = tot_reserve = 0.0
    for g in deal["groups"]:
        bal = g["principal_per_flat"]
        c = g["charge_per_month"]
        rows = []
        for k in range(1, n + 1):
            interest = bal * i
            repay = c * (1 - r)
            princ = repay - interest
            bal = bal - princ
            if k == n and abs(bal) < 1.0:
                bal = 0.0
            rows.append({"n": k, "month": madd(start, k - 1), "charge": round(c, 2), "reserve": round(c * r, 2),
                         "interest": round(interest, 2), "principal": round(princ, 2), "balance": round(max(bal, 0.0), 2)})
        cnt = g["participating"]
        tot_principal += cnt * g["principal_per_flat"]
        tot_repaid += cnt * c * n
        tot_reserve += cnt * c * r * n
        tot_interest += cnt * sum(x["interest"] for x in rows)
        groups.append({"position": g["position"], "count": cnt, "principal_per_flat": g["principal_per_flat"],
                       "charge_per_month": c, "rows": rows})
    out = {"term_years": fin["term_years"], "months": n, "start": start, "end": madd(start, n - 1),
           "basis": deal["basis"], "groups": groups,
           "building": {"principal": round(tot_principal, 2), "charge_per_month": deal["charge_per_month_building"],
                        "total_repaid": round(tot_repaid, 2), "total_interest": round(tot_interest, 2)},
           "reserve": {"rate": r, "contribution_total": round(tot_reserve, 2),
                       "note": "This share of every charge goes to the programme reserve, which covers paused charges, "
                               "true-up refunds and unpaid balances."}}
    if analysis_schedule:
        for k in ("cool_roof_ageing", "equipment_life_check"):
            if k in analysis_schedule:
                out[k] = analysis_schedule[k]
        out["model_schedule"] = {"building": analysis_schedule.get("building"),
                                 "note": "The analysis module's schedule at modelled prices, for comparison."}
    return out


def balance_after(sched: dict | None, position: str, months_elapsed: int, fallback: float) -> float:
    if not sched:
        return fallback
    for g in sched["groups"]:
        if g["position"] == position:
            if months_elapsed <= 0:
                return g["principal_per_flat"]
            rows = g["rows"]
            return rows[min(months_elapsed, len(rows)) - 1]["balance"]
    return fallback


def interest_through(sched: dict | None, position: str, months_elapsed: int) -> float:
    if not sched or months_elapsed <= 0:
        return 0.0
    for g in sched["groups"]:
        if g["position"] == position:
            return sum(x["interest"] for x in g["rows"][:months_elapsed])
    return 0.0
