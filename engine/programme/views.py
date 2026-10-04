"""Read models for every portal: programme figures, overview, tenant view, utility, government and property.

Every figure here is computed from the ledgers, the reserve, the deals and the stored assessments; nothing is
hard-coded. Responses for the utility, government, funder and installer roles never contain tenant names, access codes
or ledgers; meter ids are masked to the last 4 characters for government, funder and installer (utilities see their
own meters in full because they already hold them) and addresses are block-level only.
"""
from __future__ import annotations

import json
import math
import os
from typing import Any

from meterwise import buildings as B

from . import audit, auth, clock, db
from . import deal as D
from . import ledger as L
from . import service as S
from .auth import NO_PERSONAL, Principal
from .errors import ProgError, bad, conflict, forbidden, not_found

r2 = L.r2
LIVE = ("installation", "commissioned", "active", "closed")


mask_meter = S.mask_meter


# ------------------------------------------------------------------------------------------- programme

def _projects(stages: tuple[str, ...] | None = None) -> list[dict]:
    rows = db.q("SELECT * FROM projects ORDER BY id")
    return [r for r in rows if stages is None or r["stage"] in stages]


def _payments_total(project_id: int | None = None) -> float:
    if project_id:
        return -db.q1("SELECT COALESCE(SUM(l.amount),0) AS s FROM ledger l JOIN flats f ON f.id = l.flat_id "
                      "WHERE l.kind = 'payment' AND f.project_id = ?", (project_id,))["s"]
    return -db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE kind = 'payment'")["s"]


def money_figures() -> dict:
    deployed = grant_used = repaid = interest = arrears = 0.0
    for pr in _projects(LIVE):
        dl = pr["deal"] or {}
        deployed += dl.get("financed", 0.0)
        grant_used += dl.get("grant_used", 0.0)
        rate = L.reserve_rate(pr)
        repaid += _payments_total(pr["id"]) * (1 - rate)
        for f in S.flats_of(pr["id"]):
            if f["participating"]:
                interest += D.interest_through(pr["schedule"], f["position"], L.months_elapsed(f["id"]))
                arrears += L.arrears_of(f["id"])
    return {"deployed": r2(deployed), "repaid": r2(repaid), "collected": r2(_payments_total()),
            "interest": r2(interest), "arrears": r2(arrears), "reserve": r2(L.reserve_balance()),
            "grant_used": r2(grant_used)}


def programme_obj(p: Principal) -> dict:
    prog = S.programme()
    m = money_figures()
    return {"id": prog["id"], "name": prog["name"], "example": bool(prog["example"]), "route": prog["route"],
            "route_status": prog["route_status"], "finance": prog["finance"],
            "capital_committed": prog["capital_committed"], "capital_deployed": m["deployed"],
            "grant_pool": prog["grant_pool"], "grant_used": m["grant_used"],
            "grant_allocated": r2(db.q1("SELECT COALESCE(SUM(grant_allocated),0) AS s FROM projects WHERE stage != "
                                        "'closed'")["s"]),
            "reserve_balance": m["reserve"], "reserve_shortfall": prog["reserve_shortfall"] or 0.0,
            "repaid_to_date": m["repaid"], "arrears": m["arrears"],
            "flags": ["reserve_shortfall"] if (prog["reserve_shortfall"] or 0) > 0 else [],
            "provider_org": S.org_short(prog["provider_org_id"]), "funder_org": S.org_short(prog["funder_org_id"])}


def patch_programme(p: Principal, body: dict) -> dict:
    auth.require(p, "manager")
    prog = S.programme()
    ch: dict[str, Any] = {}
    if "name" in body:
        if not isinstance(body["name"], str) or not 3 <= len(body["name"]) <= 200:
            raise bad("name must be 3 to 200 characters.")
        ch["name"] = body["name"]
    if "route" in body:
        if body["route"] not in ("community_housing", "council_rates", "meter_attached"):
            raise bad("route must be community_housing, council_rates or meter_attached.")
        ch["route"] = body["route"]
        ch["route_status"] = "usable_now" if body["route"] == "community_housing" else "needs_rule_change"
    for k in ("capital_committed", "grant_pool"):
        if k in body:
            if not isinstance(body[k], (int, float)) or body[k] < 0 or body[k] > 1e10:
                raise bad(f"{k} must be a non-negative number.")
            ch[k] = float(body[k])
    if "finance" in body:
        fin = dict(prog["finance"])
        lim = {"cost_of_capital": (0, 0.3), "term_years": (1, 30), "savings_share_to_charge": (0, 1), "reserve": (0, 0.5)}
        for k, v in (body["finance"] or {}).items():
            if k not in lim or not isinstance(v, (int, float)) or not lim[k][0] <= v <= lim[k][1]:
                raise bad(f"finance.{k} is not valid.")
            fin[k] = int(v) if k == "term_years" else float(v)
        ch["finance_json"] = fin
    if not ch:
        raise bad("Nothing to change.")
    db.update("programmes", prog["id"], **ch)
    audit.log("programme.update", None, {k: v for k, v in body.items() if k != "finance"})
    return programme_obj(p)


def _latest_runs() -> dict[int, dict]:
    out = {}
    for r in db.q("SELECT * FROM mv_runs ORDER BY id"):
        out[r["project_id"]] = r["data"]
    return out


def verified_figures() -> dict | None:
    runs = _latest_runs()
    if not runs:
        return None
    mod = ver = 0.0
    tenant = co2 = 0.0
    n = 0
    for pid, d in runs.items():
        pr = S.get_project(pid)
        for b in d["by_flat"]:
            res = b.get("result")
            if not res:
                continue
            f = S.get_flat(b["flat_id"])
            mod += res.get("modelled_saving_per_month") or 0
            ver += res.get("verified_saving_per_month") or 0
            tenant += 12 * ((res.get("verified_saving_per_month") or 0) - f["charge_per_month"])
            n += 1
        co2 += (pr["deal"] or {}).get("co2e_t_per_year_saved", 0.0) * (d["realisation_rate"] or 0)
    return {"projects": len(runs), "flats": n, "realisation_rate": round(ver / mod, 3) if mod else None,
            "tenant_saving_per_year": r2(tenant), "co2e_t_per_year": r2(co2),
            "co2_note": "Verified emissions are the modelled figure scaled by the realisation rate (an estimate)."}


def modelled_figures(stages: tuple[str, ...] = ("commissioned", "active", "closed")) -> dict:
    tenant = co2 = gas = 0.0
    hours = 0
    pct = []
    for pr in _projects(stages):
        dl = pr["deal"] or {}
        tenant += 12 * dl.get("tenant_net_saving_per_month", 0) * dl.get("flats_participating", 0)
        co2 += dl.get("co2e_t_per_year_saved", 0)
        gas += dl.get("gas_mj_per_year_avoided", 0)
        a = pr["assessment"] or {}
        if a.get("impact"):
            pct.append(a["impact"].get("energy_reduction_pct", 0))
        for g in a.get("flat_groups", []):
            if g["position"] == "top":
                part = D.group(dl, "top")["participating"] if dl else 0
                c = g["comfort"]
                hours += part * (c["hours_above_30c_baseline"] - c["hours_above_30c_upgraded"])
    return {"tenant_saving_per_year": r2(tenant), "co2e_t_per_year": r2(co2), "gas_mj_per_year_avoided": round(gas),
            "energy_reduction_pct": round(sum(pct) / len(pct), 1) if pct else 0.0,
            "top_floor_hours_above_30c_avoided": hours}


def overview(p: Principal) -> dict:
    auth.require(p, "manager", "funder", "government")
    pipeline = {s: 0 for s in S.STAGES}
    for pr in _projects():
        pipeline[pr["stage"]] += 1
    flats = db.q("SELECT f.* FROM flats f JOIN projects p ON p.id = f.project_id")
    m = money_figures()
    months = [r["month"] for r in db.q("SELECT DISTINCT month FROM ledger UNION SELECT DISTINCT month FROM reserve "
                                       "ORDER BY month")]
    monthly = []
    for mo in months:
        if mo > clock.month():
            continue
        s = L.month_summary(mo)
        col = -db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE kind = 'payment' AND month = ?", (mo,))["s"]
        rb = db.q1("SELECT balance_after FROM reserve WHERE month <= ? ORDER BY id DESC LIMIT 1", (mo,))
        monthly.append({"month": mo, "billed": s["billed"], "collected": r2(col), "paused": s["paused_flats"],
                        "reserve_balance": rb["balance_after"] if rb else 0.0})
    v = verified_figures()
    return {"programme": programme_obj(p), "pipeline": pipeline,
            "flats": {"total": len(flats), "active_charges": sum(1 for f in flats if f["charge_status"] == "active"),
                      "paused": sum(1 for f in flats if f["charge_status"] == "paused"),
                      "ended": sum(1 for f in flats if f["charge_status"] == "ended")},
            "money": m,
            "verified": v or {"projects": 0, "realisation_rate": None, "tenant_saving_per_year": 0, "co2e_t_per_year": 0},
            "modelled": modelled_figures(), "monthly": monthly, "clock": clock.info()}


# ------------------------------------------------------------------------------------------- tenant view

PROTECTIONS = [
    "Your charge is never more than the agreed share of your expected saving, and never above the charge in your offer.",
    "If equipment breaks, report it: you pay no charge from that month until it is fixed.",
    "Your savings are checked against meter readings each year; if they are lower, your charge goes down and overpayments are refunded.",
    "The charge stays with the flat. If you move out you pay only up to your move-out date and carry no debt.",
    "Your power cannot be cut off because of this charge.",
    "Your rent does not go up because of the upgrade.",
]


def my_flat(p: Principal) -> dict:
    from .documents import list_documents
    auth.require(p, "tenant")
    f = S.get_flat(p.flat_id)
    pr = S.get_project(f["project_id"])
    dl = pr["deal"] or {}
    g = D.group(dl, f["position"]) if dl else {}
    saving = (g.get("saving_per_year") or 0) / 12
    charge = f["charge_per_month"] if f["charge_status"] != "not_started" else (f["offered_charge"] or g.get("charge_per_month", 0))
    verified = None
    tenancy = db.q1("SELECT * FROM tenancies WHERE id = ?", (p.tenancy_id,))
    for d in reversed([r["data"] for r in db.q("SELECT * FROM mv_runs WHERE project_id = ? ORDER BY id", (pr["id"],))]):
        if d["period"]["from"] + "-01" < tenancy["start_date"]:
            continue
        b = next((b for b in d["by_flat"] if b["flat_id"] == f["id"] and b.get("result")), None)
        if b:
            verified = {"verified_saving_per_month": b["result"].get("verified_saving_per_month"),
                        "realisation_rate": b["result"].get("realisation_rate"), "as_of": d["run_on"],
                        "period": d["period"], "source": d["source"],
                        "source_label": L.SOURCE_LABELS.get(d["source"], d["source"])}
            break
    faults = L.tenant_faults(p, f["id"])
    return {"flat": S.flat_obj(f, p, pr), "project": {"label": pr["label"], "stage": pr["stage"],
                                                       "stage_label": S.STAGE_LABELS[pr["stage"]]},
            "deal": {"installed": L.installed_items(pr), "charge_per_month": r2(charge or 0),
                     "modelled_saving_per_month": r2(saving), "net_saving_per_month": r2(saving - (charge or 0)),
                     "term_starts": pr["charge_start"], "term_ends": pr["charge_end"] or (pr["schedule"] or {}).get("end"),
                     "offered_charge": f["offered_charge"]},
            "verified": verified, "ledger": L.ledger_for(p, f["id"]), "faults": faults,
            "documents": list_documents(p, pr["id"]), "protections": PROTECTIONS,
            "data_consent": L.data_consent_get(p, f["id"]),
            "provider": S.org_short(pr["owner_org_id"])}


# ------------------------------------------------------------------------------------------- personal data

def personal_data(p: Principal, fid: int) -> dict:
    f = S.get_flat(fid)
    S.check_flat(p, f, ("manager", "owner", "tenant"))
    ten = db.q("SELECT * FROM tenancies WHERE flat_id = ? ORDER BY id", (fid,))
    audit.log("personal_data.export", f["project_id"], {"flat_id": fid})
    if p.role == "tenant":  # a tenant's own records only: their tenancy, ledger entries and consents
        t = db.q1("SELECT * FROM tenancies WHERE id = ?", (p.tenancy_id,))
        return {"flat_id": fid, "unit": f["unit"], "meter_id": f["meter_id"],
                "tenancy": {"tenant_name": t["tenant_name"], "start_date": t["start_date"]},
                "ledger": [L.entry_obj(x) for x in db.q("SELECT * FROM ledger WHERE flat_id = ? AND tenancy_id = ? "
                                                        "ORDER BY id", (fid, p.tenancy_id))],
                "data_consents": [L.consent_obj(c) for c in db.q("SELECT * FROM data_consents WHERE tenancy_id = ?",
                                                                 (p.tenancy_id,))],
                "readings": L.readings_of(fid, p.tenancy_id),
                "faults": L.tenant_faults(p, fid)}
    return {"flat_id": fid, "unit": f["unit"], "meter_id": f["meter_id"],
            "held": "Name and unit of each tenant, tenancy dates, the charge ledger, data consents, meter readings and "
                    "fault reports. No date of birth, contact details, bank details or income are held.",
            "tenancies": [{"id": t["id"], "tenant_name": t["tenant_name"], "start_date": t["start_date"],
                           "end_date": t["end_date"], "active": bool(t["active"])} for t in ten],
            "ledger": [L.entry_obj(x) for x in db.q("SELECT * FROM ledger WHERE flat_id = ? ORDER BY id", (fid,))],
            "data_consents": [L.consent_obj(c) for c in db.q("SELECT * FROM data_consents WHERE flat_id = ?", (fid,))],
            "readings": L.readings_of(fid),
            "faults": [L.fault_obj(x) for x in db.q("SELECT * FROM faults WHERE flat_id = ?", (fid,))]}


def erase(p: Principal, fid: int, body: dict) -> dict:
    f = S.get_flat(fid)
    S.check_flat(p, f, ("manager", "owner"))
    inc = bool(body.get("include_current"))
    from .privacy import erase_tenancy
    n = 0
    for t in db.q("SELECT * FROM tenancies WHERE flat_id = ?", (fid,)):
        if t["active"] and not inc:
            continue
        if db.q1("SELECT 1 FROM privacy_holds WHERE tenancy_id = ?", (t["id"],)):
            raise conflict("This tenancy has a retention hold; review the hold before erasure.")
        erase_tenancy(t)
        n += 1
    audit.log("personal_data.erase", f["project_id"], {"flat_id": fid, "tenancies": n})
    return {"flat_id": fid, "tenancies_erased": n,
            "kept": "The meter's charge ledger is kept (it belongs to the meter and is needed for the funder's accounts)."}


# ------------------------------------------------------------------------------------------- utility

GAS_HW = {"gas_storage", "gas_instant"}


def _uses_gas(pr: dict) -> bool:
    ex = pr["existing"] or {}
    return ex.get("hot_water") in GAS_HW or ex.get("heating") == "gas_heater" or ex.get("cooktop") == "gas"


def _gas_after(pr: dict) -> bool:
    a = pr["assessment"] or {}
    g = (a.get("flat_groups") or [{}])[0].get("upgraded", {})
    return bool(g.get("gas_connected", _uses_gas(pr)))


def utility_org(p: Principal) -> dict:
    auth.require(p, "utility", "manager")
    if p.role == "manager":
        return {"id": None, "name": "All utilities (programme view)", "kind": "programme", "area": []}
    o = db.q1("SELECT * FROM orgs WHERE id = ?", (p.org_id,))
    return {"id": o["id"], "name": o["name"], "kind": o["kind"], "area": o["area"] or []}


def utility_projects(org: dict) -> list[dict]:
    out = []
    for pr in _projects(LIVE + ("offer", "consent", "procurement")):
        if org["area"] and pr["suburb"] not in org["area"]:
            continue
        if org["kind"] == "gas_network" and not _uses_gas(pr):
            continue
        out.append(pr)
    return out


def utility_flats(org: dict) -> list[tuple[dict, dict]]:
    """(project, flat) pairs whose meters this utility may see: participating flats in installed projects."""
    out = []
    for pr in utility_projects(org):
        if pr["stage"] not in LIVE:
            continue
        for f in S.flats_of(pr["id"]):
            if f["consent"] != "agreed":
                continue
            if org["kind"] == "retailer" and f["retailer_org_id"] != org["id"]:
                continue
            out.append((pr, f))
    return out


def meter_row(pr: dict, f: dict, org: dict) -> dict:
    last = db.q1("SELECT month, source FROM readings WHERE flat_id = ? ORDER BY month DESC LIMIT 1", (f["id"],))
    wo = S.work_order(pr["id"])
    return {"meter_id": f["meter_id"], "project_id": pr["id"], "address": pr["label"], "position": f["position"],
            "stage": pr["stage"], "charge_status": f["charge_status"], "charge_per_month": r2(f["charge_per_month"]),
            "commissioned_on": wo["completed_on"] if wo else None, "has_gas": _gas_after(pr),
            "retailer_customer": bool(org["kind"] == "retailer" or (org["kind"] == "programme" and f["retailer_org_id"])),
            "last_reading_month": last["month"] if last else None, "reading_source": last["source"] if last else None,
            "reading_source_label": L.SOURCE_LABELS.get(last["source"]) if last else None,
            "data_consent": L.current_data_consent(f["id"]) is not None, "example": True}


def utility_meters(p: Principal, q: str | None = None, stage: str | None = None, charge_status: str | None = None) -> list:
    org = utility_org(p)
    rows = [meter_row(pr, f, org) for pr, f in utility_flats(org)]
    if q:
        rows = [r for r in rows if q.lower() in r["meter_id"].lower() or q.lower() in r["address"].lower()]
    if stage:
        rows = [r for r in rows if r["stage"] == stage]
    if charge_status:
        rows = [r for r in rows if r["charge_status"] == charge_status]
    return rows


def network_impact(p: Principal) -> dict:
    org = utility_org(p)
    by, tot = [], {"projects": 0, "flats": 0, "peak_kw_before": 0.0, "peak_kw_after": 0.0,
                   "peak_kw_after_without_roof": 0.0, "annual_kwh_change": 0.0, "gas_mj_avoided_per_year": 0.0,
                   "gas_connections_removed": 0, "switchboard_upgrades_likely": 0}
    forecast: dict[str, dict] = {}
    for pr in utility_projects(org):
        el = (pr["sizing"] or {}).get("electrical") or {}
        dl = pr["deal"] or {}
        a = pr["assessment"] or {}
        n = dl.get("flats_participating", 0)
        frac = n / dl["flats_total"] if dl.get("flats_total") else 0
        kwh = (a.get("impact") or {}).get("electricity_kwh_per_year_change", 0) * frac
        gas = dl.get("gas_mj_per_year_avoided", 0)
        removed = n if (pr["package"] or {}).get("disconnect_gas") and not _gas_after(pr) else 0
        wo = S.work_order(pr["id"])
        row = {"project_id": pr["id"], "label": pr["label"], "stage": pr["stage"], "flats": n,
               "commissioned_on": wo["completed_on"] if wo else None,
               "peak_kw_before": el.get("building_peak_kw_before"), "peak_kw_after": el.get("building_peak_kw_after"),
               "peak_kw_after_without_roof": el.get("building_peak_kw_after_without_roof"),
               "annual_kwh_change": round(kwh), "gas_mj_avoided_per_year": round(gas),
               "switchboard_upgrade_likely": bool(el.get("switchboard_upgrade_likely"))}
        by.append(row)
        if pr["stage"] in LIVE:
            tot["projects"] += 1
            tot["flats"] += n
            for k in ("peak_kw_before", "peak_kw_after", "peak_kw_after_without_roof"):
                tot[k] += row[k] or 0
            tot["annual_kwh_change"] += kwh
            tot["gas_mj_avoided_per_year"] += gas
            tot["gas_connections_removed"] += removed
            tot["switchboard_upgrades_likely"] += int(row["switchboard_upgrade_likely"])
        else:  # pipeline: expected to commission in a few months
            m = clock.madd(clock.month(), {"offer": 6, "consent": 5, "procurement": 3}.get(pr["stage"], 2))
            fc = forecast.setdefault(m, {"month": m, "projects_commissioning": 0, "added_peak_kw": 0.0, "added_annual_kwh": 0})
            fc["projects_commissioning"] += 1
            fc["added_peak_kw"] = r2(fc["added_peak_kw"] + (row["peak_kw_after"] or 0) - (row["peak_kw_before"] or 0))
            fc["added_annual_kwh"] += round(kwh)
    for pr in _projects(("installation", "commissioned")):
        if pr in utility_projects(org):
            m = clock.madd(clock.month(), 1)
            fc = forecast.setdefault(m, {"month": m, "projects_commissioning": 0, "added_peak_kw": 0.0, "added_annual_kwh": 0})
            fc["projects_commissioning"] += 1
    tot = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in tot.items()}
    areas = org["area"] or sorted({pr["suburb"] for pr in _projects() if pr["suburb"]})
    return {"as_of": clock.month(), "area": " and ".join(areas) or "Pilot area", "totals": tot, "by_project": by,
            "forecast": sorted(forecast.values(), key=lambda x: x["month"]),
            "basis": "Modelled design-day peak per building from the sizing module. Not a network study."}


def utility_summary(p: Principal) -> dict:
    org = utility_org(p)
    pairs = utility_flats(org)
    month = clock.month()
    billed = 0.0
    to_bill = 0
    overdue = 0
    prev = clock.madd(month, -1)
    for pr, f in pairs:
        s = db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE flat_id = ? AND month = ? AND kind IN "
                  "('charge','pause_credit')", (f["id"], month))["s"]
        billed += s
        to_bill += 1 if f["charge_status"] == "active" else 0
        if f["charge_status"] in ("active", "paused") and not db.q1(
                "SELECT 1 FROM readings WHERE flat_id = ? AND month = ?", (f["id"], prev)):
            overdue += 1
    rem = db.q1("SELECT COALESCE(SUM(posted),0) AS s FROM remittances WHERE month = ?" +
                (" AND org_id = ?" if org["id"] else ""), (month, org["id"]) if org["id"] else (month,))["s"]
    gd = db.q("SELECT * FROM gas_disconnections WHERE status IN ('requested','scheduled')")
    sr = db.q("SELECT * FROM supply_requests WHERE status = 'open'")
    if org["id"]:
        gd = [x for x in gd if x["org_id"] == org["id"]]
        sr = [x for x in sr if x["org_id"] == org["id"]]
    return {"org": {k: org[k] for k in ("id", "name", "kind")},
            "meters": {"total": len(pairs), "active_charges": sum(1 for _, f in pairs if f["charge_status"] == "active"),
                       "paused": sum(1 for _, f in pairs if f["charge_status"] == "paused")},
            "billing": {"month": month, "to_bill": to_bill, "billed": r2(billed), "remitted": r2(rem),
                        "outstanding": r2(max(0.0, billed - rem))},
            "network": network_impact(p)["totals"],
            "open": {"gas_disconnections": len(gd), "supply_requests": len(sr), "readings_overdue_meters": overdue}}


def utility_readings(p: Principal, rows: list[dict]) -> dict:
    auth.require(p, "utility")
    org = utility_org(p)
    if len(rows) > L.MAX_ROWS:
        raise ProgError("too_large", f"At most {L.MAX_ROWS} rows per upload.")
    mine = {f["meter_id"]: f for _, f in utility_flats(org)}
    accepted, rejected = 0, []
    for i, row in enumerate(rows):
        mid = str(row.get("meter_id") or row.get("meter_reference") or "").strip()
        f = mine.get(mid)
        if not f:
            rejected.append({"row": i + 1, "reason": "unknown meter (not in your network area or customer base)"})
            continue
        if not L.current_data_consent(f["id"]):
            rejected.append({"row": i + 1, "reason": "no current data consent"})
            continue
        try:
            L.store_reading(f["id"], L.clean_reading(row), "utility")
            accepted += 1
        except ValueError as e:
            rejected.append({"row": i + 1, "reason": str(e)})
    audit.log("utility.readings", None, {"org_id": org["id"], "accepted": accepted, "rejected": len(rejected)})
    return {"accepted": accepted, "rejected": rejected}


def readings_template(p: Principal) -> str:
    org = utility_org(p)
    prev = clock.madd(clock.month(), -1)
    rows = [[f["meter_id"], prev, "", ""] for pr, f in utility_flats(org)
            if f["charge_status"] in ("active", "paused") and L.current_data_consent(f["id"])]
    return L.to_csv(["meter_reference", "month", "electricity_kwh", "gas_mj"], rows)


def charge_file(p: Principal, month: str | None) -> str:
    org = utility_org(p)
    month = month or clock.month()
    if not clock.valid_month(month):
        raise bad("month must look like 2027-03.")
    rows = []
    for pr, f in utility_flats(org):
        s = db.q1("SELECT COALESCE(SUM(CASE WHEN kind='charge' THEN amount END),0) AS c, COALESCE(SUM(CASE WHEN "
                  "kind='pause_credit' THEN amount END),0) AS pc FROM ledger WHERE flat_id = ? AND month = ?",
                  (f["id"], month))
        rows.append([f["meter_id"], r2(s["c"] + s["pc"]), f["charge_status"], "yes" if s["pc"] < 0 else "no"])
    audit.log("export.charge_file", None, {"org_id": org["id"], "month": month, "rows": len(rows)})
    return L.to_csv(["meter_reference", "amount", "status", "paused"], rows)


def remittance(p: Principal, body: dict) -> dict:
    auth.require(p, "utility")
    org = utility_org(p)
    month = body.get("month") or clock.month()
    if not clock.valid_month(month):
        raise bad("month must look like 2027-03.")
    rows = body.get("rows")
    if not isinstance(rows, list) or not rows or len(rows) > L.MAX_ROWS:
        raise bad(f"rows must be a list of 1 to {L.MAX_ROWS} meter payments.")
    mine = {f["meter_id"]: (pr, f) for pr, f in utility_flats(org)}
    total = posted = 0.0
    mismatches, rejected = [], []
    for i, r in enumerate(rows):
        mid = str(r.get("meter_id") or r.get("meter_reference") or "").strip()
        try:
            amt = float(r.get("amount"))
        except (TypeError, ValueError):
            rejected.append({"row": i + 1, "reason": "amount is not a number"})
            continue
        if mid not in mine:
            rejected.append({"row": i + 1, "reason": "unknown meter"})
            continue
        if amt < 0 or amt > 100000:
            rejected.append({"row": i + 1, "reason": "amount out of range"})
            continue
        pr, f = mine[mid]
        due = db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE flat_id = ? AND month = ? AND kind IN "
                    "('charge','pause_credit')", (f["id"], month))["s"]
        total += amt
        if amt > 0:
            L.post(f["id"], "payment", -amt, month, f"Remitted by {org['name']}")
            posted += amt
        if abs(amt - due) > 0.005:
            mismatches.append({"meter_id": mid, "expected": r2(due), "remitted": r2(amt), "difference": r2(amt - due)})
    db.insert("remittances", org_id=org["id"], month=month, at=clock.now_iso(), rows_json=rows, total=r2(total),
              posted=r2(posted))
    audit.log("utility.remittance", None, {"org_id": org["id"], "month": month, "posted": r2(posted),
                                           "mismatches": len(mismatches)})
    return {"month": month, "rows": len(rows), "total": r2(total), "posted": r2(posted), "mismatches": mismatches,
            "rejected": rejected}


def _gd_obj(x: dict) -> dict:
    return {k: x[k] for k in ("id", "project_id", "meters", "requested_on", "status", "scheduled_for", "completed_on",
                              "note")} | {"address": S.get_project(x["project_id"])["label"]}


def gas_list(p: Principal) -> list[dict]:
    org = utility_org(p)
    rows = db.q("SELECT * FROM gas_disconnections ORDER BY id")
    return [_gd_obj(x) for x in rows if org["id"] is None or x["org_id"] == org["id"]]


GD_FLOW = {"requested": {"scheduled", "cancelled", "completed"}, "scheduled": {"completed", "cancelled", "scheduled"},
           "completed": set(), "cancelled": set()}


def gas_update(p: Principal, gid: int, body: dict) -> dict:
    auth.require(p, "utility")
    org = utility_org(p)
    x = db.q1("SELECT * FROM gas_disconnections WHERE id = ?", (gid,))
    if not x:
        raise not_found(f"Gas disconnection {gid}")
    if x["org_id"] != org["id"]:
        raise forbidden("This request is for another gas network.")
    st = body.get("status")
    if st not in GD_FLOW.get(x["status"], set()):
        raise conflict(f"A {x['status']} request cannot move to '{st}'.")
    ch: dict[str, Any] = {"status": st}
    if st == "scheduled":
        if not body.get("scheduled_for"):
            raise bad("scheduled_for is needed to schedule a disconnection.")
        ch["scheduled_for"] = body["scheduled_for"]
    if st == "completed":
        ch["completed_on"] = clock.today()
    if body.get("note"):
        ch["note"] = str(body["note"])[:1000]
    db.update("gas_disconnections", gid, **ch)
    audit.log("utility.gas_disconnection_update", x["project_id"], {"id": gid, "status": st})
    return _gd_obj(db.q1("SELECT * FROM gas_disconnections WHERE id = ?", (gid,)))


def _sr_obj(x: dict) -> dict:
    return {k: x[k] for k in ("id", "project_id", "kind", "detail", "status", "raised_on", "response")} | {
        "address": S.get_project(x["project_id"])["label"]}


def supply_list(p: Principal) -> list[dict]:
    org = utility_org(p)
    return [_sr_obj(x) for x in db.q("SELECT * FROM supply_requests ORDER BY id")
            if org["id"] is None or x["org_id"] == org["id"]]


def supply_update(p: Principal, sid: int, body: dict) -> dict:
    auth.require(p, "utility")
    org = utility_org(p)
    x = db.q1("SELECT * FROM supply_requests WHERE id = ?", (sid,))
    if not x:
        raise not_found(f"Supply request {sid}")
    if x["org_id"] != org["id"]:
        raise forbidden("This request is for another distributor.")
    st = body.get("status")
    if st not in ("open", "approved", "not_needed", "completed"):
        raise bad("status must be open, approved, not_needed or completed.")
    if x["status"] in ("completed", "not_needed") and st != x["status"]:
        raise conflict(f"This request is already {x['status']}.")
    db.update("supply_requests", sid, status=st, response=str(body.get("response") or "")[:2000] or None)
    audit.log("utility.supply_request_update", x["project_id"], {"id": sid, "status": st})
    return _sr_obj(db.q1("SELECT * FROM supply_requests WHERE id = ?", (sid,)))


# ------------------------------------------------------------------------------------------- government

TARGET_KEYS = {"flats_upgraded": "Flats upgraded", "co2e_t_per_year": "Emissions cut (t CO2e a year)",
               "tenant_saving_per_year": "Tenant bill savings a year ($)", "grant_spent": "Grant spent ($)"}


def _targets() -> list[dict]:
    raw = db.get_setting("targets")
    return json.loads(raw) if raw else []


def put_targets(p: Principal, body: dict) -> list[dict]:
    auth.require(p, "government", "manager")
    t = body.get("targets")
    if not isinstance(t, list) or len(t) > 20:
        raise bad("targets must be a list (at most 20).")
    clean = []
    for i, x in enumerate(t):
        if not isinstance(x, dict) or x.get("key") not in TARGET_KEYS:
            raise bad(f"Target {i + 1}: key must be one of " + ", ".join(TARGET_KEYS))
        if not isinstance(x.get("target"), (int, float)) or x["target"] <= 0:
            raise bad(f"Target {i + 1}: target must be a positive number.")
        if not clock.valid_month(x.get("by")):
            raise bad(f"Target {i + 1}: by must be a month like 2028-06.")
        clean.append({"key": x["key"], "label": str(x.get("label") or TARGET_KEYS[x["key"]])[:120],
                      "target": x["target"], "by": x["by"]})
    db.set_setting("targets", json.dumps(clean))
    audit.log("government.targets", None, {"count": len(clean)})
    return clean


def _flats_upgraded() -> int:
    return db.q1("SELECT COUNT(*) AS n FROM flats f JOIN projects p ON p.id = f.project_id WHERE f.consent = 'agreed' "
                 "AND p.stage IN ('commissioned','active','closed')")["n"]


def _by_area() -> list[dict]:
    ds = B.load()
    areas: dict[str, dict] = {}
    for ft in ds.features:
        pp = ft["properties"]
        a = areas.setdefault(pp.get("suburb") or "Unknown", {"area": pp.get("suburb") or "Unknown", "kind": "suburb",
                                                             "buildings": 0, "flats_est": 0, "_rs": [],
                                                             "hottest_band_buildings": 0, "projects": 0,
                                                             "flats_upgraded": 0})
        a["buildings"] += 1
        a["flats_est"] += int(pp["flats_est"])
        if pp.get("renter_share") is not None:
            a["_rs"].append(pp["renter_share"])
        a["hottest_band_buildings"] += pp["heat_band"] == "hottest"
    for pr in _projects():
        a = areas.get(pr["suburb"] or "Unknown")
        if a:
            a["projects"] += 1
            if pr["stage"] in ("commissioned", "active", "closed"):
                a["flats_upgraded"] += db.q1("SELECT COUNT(*) AS n FROM flats WHERE project_id = ? AND consent = 'agreed'",
                                             (pr["id"],))["n"]
    out = []
    for a in areas.values():
        rs = a.pop("_rs")
        a["renter_share"] = round(sum(rs) / len(rs), 2) if rs else None
        out.append(a)
    return sorted(out, key=lambda x: -x["buildings"])


def outcomes(p: Principal) -> dict:
    auth.require(p, "government", "manager")
    ds = B.load()
    m = money_figures()
    mod = modelled_figures()
    flats_up = _flats_upgraded()
    renting = 0.0
    for pr in _projects(("commissioned", "active", "closed")):
        ft = ds.by_id.get(pr["building_id"])
        rs = (ft or {}).get("properties", {}).get("renter_share") or 0.0
        renting += rs * db.q1("SELECT COUNT(*) AS n FROM flats WHERE project_id = ? AND consent = 'agreed'", (pr["id"],))["n"]
    net = sum((pr["deal"] or {}).get("net_capex", 0) for pr in _projects(("commissioned", "active", "closed")))
    prog = S.programme()
    refunds = db.q1("SELECT COUNT(*) AS n, COALESCE(SUM(-amount),0) AS s FROM ledger WHERE kind = 'true_up_refund'")
    tu_n = sum(len(d["true_ups"]) for d in [r["data"] for r in db.q("SELECT * FROM mv_runs")])
    worse = 0
    for d in _latest_runs().values():
        for b in d["by_flat"]:
            if b.get("result"):
                f = S.get_flat(b["flat_id"])
                if (b["result"].get("verified_saving_per_month") or 0) < f["charge_per_month"] - 0.005:
                    worse += 1
    actual = {"flats_upgraded": flats_up, "co2e_t_per_year": mod["co2e_t_per_year"],
              "tenant_saving_per_year": mod["tenant_saving_per_year"], "grant_spent": m["grant_used"]}
    return {"as_of": clock.month(), "programme": programme_obj(p),
            "reach": {"projects_active": len(_projects(("active",))), "flats_upgraded": flats_up,
                      "households_renting_est": round(renting),
                      "blocks_in_pipeline": len(_projects(("screened", "audit", "offer", "consent", "procurement",
                                                           "installation", "commissioned")))},
            "money": {"grant_committed": prog["grant_pool"], "grant_spent": m["grant_used"],
                      "capital_deployed": m["deployed"], "repaid": m["repaid"], "reserve": m["reserve"],
                      "cost_per_flat": round(net / flats_up) if flats_up else None,
                      "grant_per_tonne_co2e": round(m["grant_used"] / mod["co2e_t_per_year"])
                      if mod["co2e_t_per_year"] else None},
            "impact_modelled": mod, "impact_verified": verified_figures(),
            "protections": {"charges_paused_months": db.q1("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'pause_credit'")["n"],
                            "true_ups": tu_n, "refunded": r2(refunds["s"]), "tenants_worse_off_verified": worse,
                            "complaints_open": db.q1("SELECT COUNT(*) AS n FROM faults WHERE status = 'open' AND "
                                                     "reported_by = 'tenant'")["n"],
                            "complaints_note": "Open problems reported by tenants through the tenant page."},
            "targets": [dict(t, actual=actual.get(t["key"])) for t in _targets()],
            "by_area": _by_area()}


def areas(p: Principal) -> dict:
    auth.require(p, "government", "manager")
    stage_by_b = {pr["building_id"]: pr["stage"] for pr in _projects()}
    pts = []
    for ft in B.load().features:
        pp = ft["properties"]
        pts.append({"building_id": pp["id"], "lat": pp["lat"], "lon": pp["lon"], "heat_band": pp["heat_band"],
                    "renter_share": pp.get("renter_share"), "flats_est": pp["flats_est"],
                    "project_stage": stage_by_b.get(pp["id"])})
    return {"by_area": _by_area(), "buildings": pts}


def _grant_obj(g: dict) -> dict:
    pr = S.get_project(g["project_id"])
    return {k: g[k] for k in ("id", "project_id", "requested", "approved", "status", "reason", "requested_on",
                              "decided_on", "decided_by", "note")} | {"project_label": pr["label"], "stage": pr["stage"]}


def grants(p: Principal) -> list[dict]:
    auth.require(p, "government", "manager")
    return [_grant_obj(g) for g in db.q("SELECT * FROM grants ORDER BY id")]


def grant_request(p: Principal, body: dict) -> dict:
    auth.require(p, "manager")
    pr = S.get_project(body.get("project_id") or 0)
    amt = body.get("requested")
    if not isinstance(amt, (int, float)) or amt <= 0 or amt > 1e8:
        raise bad("requested must be a positive number.")
    if pr["stage"] in ("active", "closed"):
        raise conflict("Grants are requested before the charge starts.")
    if db.q1("SELECT 1 FROM grants WHERE project_id = ? AND status = 'requested'", (pr["id"],)):
        raise conflict("This project already has a grant request waiting for a decision.")
    gid = db.insert("grants", project_id=pr["id"], requested=float(amt), status="requested",
                    reason=str(body.get("reason") or "Funding gap after capped charge")[:500], requested_on=clock.today())
    audit.log("grant.request", pr["id"], {"grant_id": gid, "requested": amt})
    return _grant_obj(db.q1("SELECT * FROM grants WHERE id = ?", (gid,)))


def grant_decide(p: Principal, gid: int, body: dict) -> dict:
    auth.require(p, "government")
    g = db.q1("SELECT * FROM grants WHERE id = ?", (gid,))
    if not g:
        raise not_found(f"Grant {gid}")
    if g["status"] != "requested":
        raise conflict(f"This grant has already been {g['status']}.")
    st = body.get("status")
    if st not in ("approved", "declined"):
        raise bad("status must be approved or declined.")
    pr = S.get_project(g["project_id"])
    approved = 0.0
    if st == "approved":
        approved = body.get("approved", g["requested"])
        if not isinstance(approved, (int, float)) or approved <= 0 or approved > g["requested"] + 0.01:
            raise bad("approved must be a positive number no more than the amount requested.")
        prog = S.programme()
        others = db.q1("SELECT COALESCE(SUM(grant_allocated),0) AS s FROM projects WHERE id != ? AND stage != 'closed'",
                       (pr["id"],))["s"]
        left = prog["grant_pool"] - others
        if approved > left + 0.01:
            raise conflict(f"Only ${left:,.0f} of the grant pool is unallocated.")
        db.update("projects", pr["id"], grant_allocated=float(approved))
        S.refresh_deal(S.get_project(pr["id"]))
    db.update("grants", gid, status=st, approved=float(approved), decided_on=clock.today(), decided_by=p.name,
              note=str(body.get("note") or "")[:500])
    audit.log("grant.decide", pr["id"], {"grant_id": gid, "status": st, "approved": approved})
    return _grant_obj(db.q1("SELECT * FROM grants WHERE id = ?", (gid,)))


def report_csv(p: Principal, kind: str) -> str:
    auth.require(p, "government", "manager")
    if kind == "projects":
        rows = [[x["id"], x["building_id"], x["label"], x["suburb"], x["stage"], x["stage_since"],
                 len(S.flats_of(x["id"])), (x["deal"] or {}).get("net_capex"), (x["deal"] or {}).get("funding_gap"),
                 x["grant_allocated"], (x["deal"] or {}).get("charge_per_month_building"),
                 (x["deal"] or {}).get("co2e_t_per_year_saved")] for x in _projects()]
        out = L.to_csv(["project_id", "building_id", "block", "suburb", "stage", "stage_since", "flats", "net_capex",
                        "funding_gap", "grant_allocated", "charges_per_month", "co2e_t_per_year"], rows)
    elif kind == "outcomes":
        o = outcomes(p)
        rows = []
        for sec in ("reach", "money", "impact_modelled", "protections"):
            for k, v in o[sec].items():
                rows.append([sec, k, v])
        for k, v in (o["impact_verified"] or {}).items():
            rows.append(["impact_verified", k, v])
        out = L.to_csv(["section", "measure", "value"], rows)
    elif kind == "verified_savings":
        rows = []
        for r in db.q("SELECT * FROM mv_runs ORDER BY id"):
            d = r["data"]
            rows.append([r["id"], d["project_id"], d["period"]["from"], d["period"]["to"], d["source"],
                         d["flats_verified"], d["modelled_saving_per_month"], d["verified_saving_per_month"],
                         d["realisation_rate"], len(d["true_ups"]), d["reserve_drawn"]])
        out = L.to_csv(["run_id", "project_id", "from", "to", "source", "flats_verified", "modelled_per_month",
                        "verified_per_month", "realisation_rate", "true_ups", "refunded"], rows)
    elif kind == "grants":
        out = L.to_csv(["grant_id", "project_id", "block", "requested", "approved", "status", "reason", "requested_on",
                        "decided_on", "decided_by"],
                       [[g["id"], g["project_id"], g["project_label"], g["requested"], g["approved"], g["status"],
                         g["reason"], g["requested_on"], g["decided_on"], g["decided_by"]] for g in grants(p)])
    elif kind == "charges":
        rows = []
        for pr in _projects(LIVE):
            for f in S.flats_of(pr["id"]):
                if not f["participating"]:
                    continue
                billed = db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE flat_id = ? AND kind IN "
                               "('charge','pause_credit')", (f["id"],))["s"]
                rows.append([pr["id"], pr["label"], mask_meter(f["meter_id"]), f["position"], f["charge_status"],
                             r2(f["charge_per_month"]), L.months_elapsed(f["id"]), r2(billed)])
        out = L.to_csv(["project_id", "block", "meter_reference", "position", "status", "charge_per_month", "months_billed",
                        "billed_to_date"], rows)
    elif kind == "audit_log":
        out = L.to_csv(["id", "at", "by", "role", "action", "project_id", "detail", "hash"],
                       [[x["id"], x["at"], x["by"], x["role"], x["action"], x["project_id"], x["detail"], x["hash"]]
                        for x in reversed(audit.entries(limit=100000))])
    else:
        raise not_found(f"Report '{kind}'")
    audit.log("export.report", None, {"kind": kind})
    return out


def delivery_routes(p: Principal) -> list[dict]:
    auth.require(p, "government", "manager")
    feats = B.load().features
    n = len(feats)
    flats = sum(int(f["properties"]["flats_est"]) for f in feats)
    big = [f for f in feats if int(f["properties"]["flats_est"]) > 20]
    return [
        {"key": "community_housing", "label": "Route A: community housing provider", "status": "usable_now",
         "rule_change": "None. To confirm: whether a service charge can sit alongside rent in a community housing lease.",
         "reach_buildings": None, "reach_flats": None,
         "reach_note": "Not computable from open data: building ownership is not in the dataset. Providers know their own stock.",
         "estimate": True},
        {"key": "council_rates", "label": "Route B: council rates charge", "status": "needs_rule_change",
         "rule_change": "Extend NSW environmental upgrade agreements to strata residential buildings of any size and allow "
                        "a capped pass-through to tenants with consent.",
         "reach_buildings": len(big), "reach_flats": sum(int(f["properties"]["flats_est"]) for f in big),
         "reach_note": "Today: strata blocks above 20 lots only, using estimated flats per block. All pilot blocks if "
                       "the 20-lot limit is removed.", "estimate": True},
        {"key": "meter_attached", "label": "Route C: charge on the meter", "status": "needs_rule_change",
         "rule_change": "A ring-fencing waiver or guideline change from the AER, a site-specific tariff component in "
                        "network pricing rules, and consumer protections in the retail rules.",
         "reach_buildings": n, "reach_flats": flats, "reach_note": "Every pilot block (estimated flats).",
         "estimate": True},
    ]


def controls(p: Principal) -> dict:
    auth.require(p, "government", "manager")
    demo = auth.demo_mode()
    av = audit.verify()
    exempt = db.q("SELECT u.email, u.role FROM users u LEFT JOIN mfa m ON m.user_id = u.id WHERE u.example = 1 AND "
                  "(m.enabled IS NULL OR m.enabled = 0)") if demo else []
    c = [
        ("sessions", "Sessions end after 12 hours, or after 30 minutes without activity. Signing out ends the session.", True),
        ("passwords", f"Passwords have at least {auth.MIN_PASSWORD} characters, are checked against common passwords and "
                      f"are stored as scrypt hashes. An account locks for {auth.LOCK_S // 60} minutes after "
                      f"{auth.LOCK_AFTER} failed sign-ins, and sign-in attempts are rate limited.", True),
        ("mfa", "Staff sign in with a password and a six-digit code from an authenticator app (TOTP).", True),
        ("sso", "OpenID Connect sign-in is not implemented. Staff use password and TOTP.", False),
        ("access_control", "Every request is checked against the person's role and organisation. Access is denied unless allowed.", True),
        ("audit_log", f"Every sign-in, change, export and read of tenant data is recorded in a tamper-evident log "
                      f"({av['entries']} entries, chain {'verified' if av['ok'] else 'failed verification at entry ' + str(av['first_bad_id'])}).", av["ok"]),
        ("headers", "Pages and data are served with a strict Content-Security-Policy, HSTS and related security headers; "
                    "data responses are never cached.", True),
        ("cors", "Only the configured web addresses can call the service from a browser.", True),
        ("validation", f"Every input is validated; uploads are limited to 2 MB and {L.MAX_ROWS} rows; spreadsheet exports "
                       "neutralise formula cells.", True),
        ("privacy", "Tenant personal data is limited to name and unit. Meter data is used only with the tenant's separate "
                    "consent, which they can withdraw. Meter references and addresses are masked for roles that do not "
                    "need them. Personal data can be exported or erased on request.", True),
        ("secrets", "Credential encryption is configured separately from SQLite. Independently managed keys are required for production.", not demo),
        ("operations", "Health and readiness checks, request identifiers, a security contact (security.txt) and a request "
                       "log that holds no personal data.", True),
        ("supply_chain", "The Docker runtime uses a pinned dependency lock. Image scans and an image SBOM require deployment evidence.", False),
    ]
    return {"controls": [{"key": k, "description": d, "on": on} for k, d, on in c],
            "mfa_enforced": not (demo and bool(exempt)), "accounts_without_mfa": db.q1("SELECT COUNT(*) AS n FROM users u LEFT JOIN mfa m ON m.user_id = u.id WHERE u.role IN ('manager', 'government', 'owner', 'installer', 'funder', 'utility') AND (m.enabled IS NULL OR m.enabled = 0)")["n"],
            "system_date_controls": demo, "retention_years": int(db.get_setting("retention_years", "7") or 7),
            "data_inventory": [
                {"data": "Tenant name and unit", "where": "tenancies", "who_sees": "manager, owner, the tenant",
                 "purpose": "Running the tenancy and the charge", "retention": "Term of the charge plus retention period"},
                {"data": "Tenant access codes", "where": "tenancies", "who_sees": "manager, owner",
                 "purpose": "Tenant sign-in", "retention": "Until the tenancy ends"},
                {"data": "Charge ledger", "where": "ledger", "who_sees": "manager, owner, the tenant (own entries)",
                 "purpose": "Billing and repayment", "retention": "Kept with the meter for the funder's accounts"},
                {"data": "Monthly meter readings", "where": "readings", "who_sees": "manager, owner, the tenant",
                 "purpose": "Checking savings (uploaded and utility readings need the tenant's separate consent)", "retention": "Term plus retention period"},
                {"data": "Data consents", "where": "data_consents", "who_sees": "manager, owner, the tenant",
                 "purpose": "Proof of consent to use meter data", "retention": "Term plus retention period"},
                {"data": "Staff names and emails", "where": "users", "who_sees": "manager",
                 "purpose": "Sign-in and audit", "retention": "While the account is active"},
                {"data": "Enquiry contact details", "where": "enquiries", "who_sees": "manager",
                 "purpose": "Answering the enquiry", "retention": "Two years or until converted"}]}


# ------------------------------------------------------------------------------------------- property

def property_summary(p: Principal) -> dict:
    auth.require(p, "owner")
    blocks = [pr for pr in _projects() if pr["owner_org_id"] == p.org_id]
    actions = []
    month = clock.month()
    billed = collected = arrears = 0.0
    active = 0
    for pr in blocks:
        c = S.consent_state(pr)
        if pr["stage"] == "screened":
            actions.append({"project_id": pr["id"], "label": pr["label"], "kind": "book_site_visit",
                            "text": "Book a site visit so the audit can be recorded."})
        if pr["stage"] == "audit" and not S.get_audit(pr["id"]):
            actions.append({"project_id": pr["id"], "label": pr["label"], "kind": "site_audit",
                            "text": "Record the site audit."})
        if pr["stage"] in ("offer", "consent") and not pr["owner_signed"]:
            actions.append({"project_id": pr["id"], "label": pr["label"], "kind": "sign_consent",
                            "text": "Sign the owner agreement."})
        if pr["stage"] in ("offer", "consent") and c["tenants_pending"]:
            actions.append({"project_id": pr["id"], "label": pr["label"], "kind": "tenant_consent",
                            "text": f"{c['tenants_pending']} tenants have not answered the offer yet."})
        for f in S.flats_of(pr["id"]):
            if not f["participating"]:
                continue
            s = db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE flat_id = ? AND month = ? AND kind IN "
                      "('charge','pause_credit')", (f["id"], month))["s"]
            billed += s
            collected += -db.q1("SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE flat_id = ? AND month = ? AND "
                                "kind = 'payment'", (f["id"], month))["s"]
            a = L.arrears_of(f["id"])
            arrears += a
            active += f["charge_status"] == "active"
            if a > 0:
                actions.append({"project_id": pr["id"], "label": pr["label"], "kind": "record_payment",
                                "text": f"Unit {f['unit']}: ${a:,.2f} unpaid from earlier months. Record payments received."})
            if pr["stage"] == "active" and not L.current_data_consent(f["id"]):
                actions.append({"project_id": pr["id"], "label": pr["label"], "kind": "data_consent",
                                "text": f"Unit {f['unit']}: no consent to use meter data. Ask the tenant if they agree."})
        for t in db.q("SELECT t.* FROM tenancies t JOIN flats f ON f.id = t.flat_id WHERE f.project_id = ? AND "
                      "t.active = 1 AND t.disclosed_on IS NOT NULL AND t.disclosed_on >= ?",
                      (pr["id"], clock.madd(month, -1) + "-01")):
            actions.append({"project_id": pr["id"], "label": pr["label"], "kind": "tenancy_paperwork",
                            "text": "New tenancy: give the new tenant their disclosure and access code letter."})
    faults_open = sum(1 for x in db.q("SELECT * FROM faults WHERE status = 'open'")
                      if S.get_project(x["project_id"])["owner_org_id"] == p.org_id)
    return {"org": p.org, "blocks": [S.project_obj(pr, p) for pr in blocks], "actions": actions,
            "charges": {"month": month, "flats_active": active, "billed": r2(billed), "collected": r2(collected),
                        "arrears": r2(arrears)},
            "faults_open": faults_open,
            "consent_pending": sum(S.consent_state(pr)["tenants_pending"] for pr in blocks
                                   if pr["stage"] in ("offer", "consent"))}


ORG_KINDS_ENQ = {"landlord", "strata", "community_housing"}


def enquiry_create(body: dict) -> dict:
    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip()
    if not 2 <= len(name) <= 120:
        raise bad("Give your name (2 to 120 characters).")
    if "@" not in email or "." not in email.split("@")[-1] or len(email) > 200:
        raise bad("Give a valid email address.")
    if body.get("org_kind") not in ORG_KINDS_ENQ:
        raise bad("org_kind must be landlord, strata or community_housing.")
    addr = str(body.get("address") or "").strip()
    if not 5 <= len(addr) <= 300:
        raise bad("Give the block's address.")
    flats = body.get("flats")
    if not isinstance(flats, int) or not 1 <= flats <= 400:
        raise bad("flats must be a whole number from 1 to 400.")
    eid = db.insert("enquiries", at=clock.now_iso(), name=name, email=email, phone=str(body.get("phone") or "")[:40],
                    org_kind=body["org_kind"], address=addr, flats=flats, message=str(body.get("message") or "")[:2000])
    audit.log("enquiry.create", None, {"enquiry_id": eid}, by="public", role="anonymous")
    return {"id": eid, "message": "Thank you. The programme office will contact you."}


def enquiries(p: Principal) -> list[dict]:
    auth.require(p, "manager")
    audit.log("personal_data.read", None, {"what": "enquiries"})
    return [{k: x[k] for k in ("id", "at", "name", "email", "phone", "org_kind", "address", "flats", "message",
                                "status", "project_id")} for x in db.q("SELECT * FROM enquiries ORDER BY id DESC")]


def _match_building(addr: str) -> str | None:
    words = {w.strip(",.").lower() for w in addr.split() if len(w.strip(",.")) > 2}
    best, score = None, 0
    for ft in B.load().features:
        lab = {w.strip(",.()").lower() for w in ft["properties"]["label"].split()}
        s = len(words & lab)
        num = addr.split()[0] if addr.split() else ""
        if num and ft["properties"]["label"].startswith(num + " "):
            s += 2
        if s > score:
            best, score = ft["properties"]["id"], s
    return best if score >= 2 else None


def enquiry_convert(p: Principal, eid: int, body: dict) -> dict:
    auth.require(p, "manager")
    x = db.q1("SELECT * FROM enquiries WHERE id = ?", (eid,))
    if not x:
        raise not_found(f"Enquiry {eid}")
    if x["status"] == "converted":
        raise conflict(f"Already converted to project {x['project_id']}.")
    bid = body.get("building_id") or _match_building(x["address"])
    if not bid:
        raise bad("No pilot building matches this address. Give building_id from the map.")
    org_id = db.insert("orgs", name=f"{x['name']} ({x['org_kind'].replace('_', ' ')})", kind=x["org_kind"],
                       example=1 if auth.demo_mode() else 0, contact_json={"email": x["email"], "phone": x["phone"]})
    pr = S.create_project(p, {"building_id": bid, "owner_org_id": org_id,
                              "note": f"From enquiry {eid}"})
    db.update("enquiries", eid, status="converted", project_id=pr["id"])
    audit.log("enquiry.convert", pr["id"], {"enquiry_id": eid})
    return S.project_detail(S.get_project(pr["id"]), p)
