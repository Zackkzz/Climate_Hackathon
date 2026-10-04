"""Projects and the stage pipeline: creation, site audit, offer, consent, tenders and quotes, work orders.

Service functions take the acting ``Principal`` where access matters, raise ``ProgError`` with plain messages, and
write to the audit log. They run inside the caller's ``db.tx()``.
"""
from __future__ import annotations

import hashlib
from typing import Any

from meterwise import buildings as B
from meterwise.assess import AssessError, assess, group_counts
from meterwise.models import AssessRequest, ExistingIn, PackageIn

from . import analysis, audit, auth, clock, db
from . import deal as D
from .auth import NO_PERSONAL, Principal
from .errors import ProgError, bad, conflict, forbidden, not_found

STAGES = ["screened", "audit", "offer", "consent", "procurement", "installation", "commissioned", "active", "closed"]
STAGE_LABELS = {"screened": "Screened", "audit": "Site audit", "offer": "Offer", "consent": "Consent",
                "procurement": "Procurement", "installation": "Installation", "commissioned": "Commissioned",
                "active": "Charge active", "closed": "Closed"}
OWNER_KINDS = {"community_housing", "landlord", "strata", "housing_provider"}
ITEM_LABELS = {"cool_roof": "Reflective cool roof coating", "heat_pump_hot_water": "Heat pump hot water",
               "reverse_cycle": "Reverse-cycle air conditioner (heating and cooling)",
               "induction_cooktop": "Induction cooktop", "ceiling_insulation": "Ceiling insulation",
               "disconnect_gas": "Gas disconnection"}
WARRANTY_YEARS = 5


def mask_meter(m: str | None) -> str | None:
    """Programme meter reference masked to its last 4 characters, for roles that do not need it in full."""
    return None if not m else m.split("-")[0] + "-..." + m[-4:]


def stable_int(*parts: Any) -> int:
    return int(hashlib.sha256(":".join(str(p) for p in parts).encode()).hexdigest()[:8], 16)


# ------------------------------------------------------------------------------------------- programme helpers

def programme() -> dict:
    p = db.q1("SELECT * FROM programmes ORDER BY id LIMIT 1")
    if not p:
        raise not_found("The programme")
    return p


def finance_for(project: dict) -> dict:
    fin = dict(programme()["finance"] or {})
    fin.update(project.get("finance") or {})
    return fin


def get_project(pid: int) -> dict:
    p = db.q1("SELECT * FROM projects WHERE id = ?", (pid,))
    if not p:
        raise not_found(f"Project {pid}")
    return p


def get_flat(fid: int) -> dict:
    f = db.q1("SELECT * FROM flats WHERE id = ?", (fid,))
    if not f:
        raise not_found(f"Flat {fid}")
    return f


def flats_of(pid: int) -> list[dict]:
    return db.q("SELECT * FROM flats WHERE project_id = ? ORDER BY CAST(unit AS INTEGER), unit", (pid,))


def active_tenancy(fid: int) -> dict | None:
    return db.q1("SELECT * FROM tenancies WHERE flat_id = ? AND active = 1 ORDER BY id DESC LIMIT 1", (fid,))


def work_order(pid: int) -> dict | None:
    return db.q1("SELECT * FROM work_orders WHERE project_id = ?", (pid,))


# ------------------------------------------------------------------------------------------- access

def can_see_project(p: Principal, pr: dict) -> bool:
    if p.role in ("manager", "funder", "government"):
        return True
    if p.role == "owner":
        return pr["owner_org_id"] == p.org_id
    if p.role == "installer":
        if pr["installer_org_id"] == p.org_id:
            return True
        return bool(db.q1("SELECT 1 FROM tender_invites WHERE project_id = ? AND org_id = ?", (pr["id"], p.org_id))
                    and pr["tender_open"])
    if p.role == "tenant":
        return pr["id"] == p.project_id
    if p.role == "utility":
        return False
    return False


def check_project(p: Principal, pr: dict) -> None:
    if not can_see_project(p, pr):
        raise forbidden("This project belongs to another organisation.")


def check_flat(p: Principal, f: dict, roles: tuple[str, ...]) -> dict:
    auth.require(p, *roles)
    if p.role == "tenant":
        if f["id"] != p.flat_id:
            raise forbidden("You can only see your own flat.")
        return get_project(f["project_id"])
    pr = get_project(f["project_id"])
    check_project(p, pr)
    return pr


# ------------------------------------------------------------------------------------------- assessment

def assess_request(pr: dict) -> AssessRequest:
    fin = finance_for(pr)
    return AssessRequest(building_id=pr["building_id"], building=pr.get("building_overrides") or {},
                         existing=pr.get("existing") or {}, package=pr.get("package") or {},
                         finance={k: fin[k] for k in ("cost_of_capital", "term_years", "savings_share_to_charge",
                                                       "reserve") if k in fin})


def _run_assess(pr: dict) -> dict:
    try:
        return assess(assess_request(pr))
    except AssessError as e:
        raise bad(e.message)


def participating_counts(pr: dict, flats: list[dict] | None = None) -> dict[str, int]:
    """Before consent closes, everyone not declined is counted (the prospective deal); from procurement on, only
    flats whose tenant agreed."""
    flats = flats if flats is not None else flats_of(pr["id"])
    strict = STAGES.index(pr["stage"]) >= STAGES.index("procurement")
    out: dict[str, int] = {}
    for f in flats:
        ok = f["consent"] == "agreed" if strict else f["consent"] != "declined"
        if ok:
            out[f["position"]] = out.get(f["position"], 0) + 1
    return out


def accepted_quote(pid: int) -> dict | None:
    return db.q1("SELECT * FROM quotes WHERE project_id = ? AND status = 'accepted'", (pid,))


def quote_prices(q: dict | None) -> dict[str, float] | None:
    if not q:
        return None
    prices: dict[str, float] = {}
    for it in q["items"]:
        prices[it["key"]] = prices.get(it["key"], 0.0) + float(it["total"])
    return prices


def refresh_deal(pr: dict) -> dict:
    """Recompute the deal from the stored assessment, consent, accepted quote, offer ceilings and grant."""
    flats = flats_of(pr["id"])
    ceilings = None
    if pr.get("offer_deal"):
        ceilings = {g["position"]: g["charge_per_month"] for g in pr["offer_deal"]["groups"]}
    dl = D.compute(pr["assessment"], finance_for(pr), participating_counts(pr, flats),
                   prices=quote_prices(accepted_quote(pr["id"])), ceilings=ceilings,
                   grant=pr["grant_allocated"] or 0.0, owner_contribution=pr["owner_contribution"] or 0.0)
    db.update("projects", pr["id"], deal_json=dl)
    if pr["stage"] not in ("active", "closed"):
        strict = STAGES.index(pr["stage"]) >= STAGES.index("procurement")
        for f in flats:
            part = (f["consent"] == "agreed") if strict else (f["consent"] != "declined")
            charge = D.group(dl, f["position"])["charge_per_month"] if part else 0.0
            db.update("flats", f["id"], charge_per_month=charge, participating=int(f["consent"] == "agreed"))
    pr["deal"] = dl
    return dl


def reassess(pr: dict) -> dict:
    a = _run_assess(pr)
    db.update("projects", pr["id"], assessment_json=a, heat_band=a["building"]["heat_band"],
              label=a["building"]["label"])
    pr["assessment"] = a
    refresh_deal(pr)
    return a


# ------------------------------------------------------------------------------------------- creation

def _make_flats(pid: int, storeys: int, n: int) -> None:
    counts = group_counts(storeys, n)
    top = counts.get("top", n)
    retailer = db.q1("SELECT id FROM orgs WHERE kind = 'retailer' ORDER BY id LIMIT 1")
    for k in range(1, n + 1):
        pos = "top" if k > n - top else "lower"
        fid = db.insert("flats", project_id=pid, unit=str(k), position=pos,
                        meter_id=f"MW-{pid * 1000 + k + 100000:06d}", sim_seed=stable_int("flat", pid, k) % 100000,
                        retailer_org_id=(retailer["id"] if retailer and stable_int("ret", pid, k) % 10 < 4 else None))
        _new_tenancy(fid, f"Unit {k} tenant (name not yet recorded)", clock.today(), seed_key=f"{pid}:{k}:0")


def _new_tenancy(fid: int, name: str, start: str, seed_key: str | None = None) -> int:
    return db.insert("tenancies", flat_id=fid, tenant_name=name, start_date=start,
                     access_code=auth.new_access_code(seed_key), active=1)


def create_project(p: Principal, body: dict) -> dict:
    auth.require(p, "manager")
    bid = body.get("building_id")
    f = B.load().by_id.get(bid or "")
    if not f:
        raise bad(f"No building with id '{bid}' was found in the pilot dataset.")
    org = auth.org_obj(body.get("owner_org_id"))
    if not org or org["kind"] not in OWNER_KINDS:
        raise bad("owner_org_id must be a housing provider, landlord or strata organisation.")
    dup = db.q1("SELECT id FROM projects WHERE building_id = ? AND stage != 'closed'", (bid,))
    if dup:
        raise conflict(f"Building {bid} already has an open project (#{dup['id']}).")
    try:
        existing = ExistingIn(**(body.get("existing") or {})).model_dump()
        package = PackageIn(**(body.get("package") or {})).model_dump()
    except Exception as e:  # pydantic validation
        raise bad(f"The existing equipment or package is not valid: {e}")
    if not any(package[k] for k in ("cool_roof", "heat_pump_hot_water", "reverse_cycle", "induction_cooktop",
                                     "ceiling_insulation")):
        raise bad("The package must include at least one upgrade.")
    props = f["properties"]
    pr_id = db.insert("projects", programme_id=programme()["id"], building_id=bid, label=props["label"],
                      stage="screened", stage_since=clock.today(), owner_org_id=org["id"], heat_band=props["heat_band"],
                      existing_json=existing, package_json=package, finance_json=body.get("finance") or {},
                      building_overrides_json={}, created_at=clock.now_iso(), suburb=props.get("suburb", ""),
                      lat=props.get("lat"), lon=props.get("lon"),
                      consent_threshold=float(body.get("consent_threshold", 0.75)))
    db.insert("stage_history", project_id=pr_id, stage="screened", at=clock.now_iso(), by=p.label,
              note=body.get("note") or "Picked from the screening map")
    pr = get_project(pr_id)
    a = _run_assess(pr)
    db.update("projects", pr_id, assessment_json=a)
    _make_flats(pr_id, int(a["building"]["storeys"]), int(a["building"]["flats"]))
    pr = get_project(pr_id)
    refresh_deal(pr)
    audit.log("project.create", pr_id, {"building_id": bid, "owner_org_id": org["id"]})
    return get_project(pr_id)


def patch_project(p: Principal, pid: int, body: dict) -> dict:
    auth.require(p, "manager")
    pr = get_project(pid)
    changes: dict[str, Any] = {}
    model_keys = [k for k in ("package", "existing", "finance") if k in body]
    if model_keys and STAGES.index(pr["stage"]) >= STAGES.index("offer"):
        raise conflict("The offer has been issued, so the package, existing equipment and finance are frozen. "
                       "Close this project and start a new one to change them.")
    try:
        if "package" in body:
            changes["package_json"] = PackageIn(**{**(pr["package"] or {}), **(body["package"] or {})}).model_dump()
        if "existing" in body:
            changes["existing_json"] = ExistingIn(**{**(pr["existing"] or {}), **(body["existing"] or {})}).model_dump()
    except Exception as e:
        raise bad(f"The package or existing equipment is not valid: {e}")
    if "finance" in body:
        fin = dict(pr["finance"] or {})
        for k, v in (body["finance"] or {}).items():
            if k not in ("cost_of_capital", "term_years", "savings_share_to_charge", "reserve"):
                raise bad(f"Unknown finance setting '{k}'.")
            if not isinstance(v, (int, float)) or v < 0:
                raise bad(f"Finance setting '{k}' must be a non-negative number.")
            fin[k] = v
        changes["finance_json"] = fin
    for k in ("grant_allocated", "owner_contribution"):
        if k in body:
            v = body[k]
            if not isinstance(v, (int, float)) or v < 0:
                raise bad(f"{k} must be a non-negative number.")
            if pr["stage"] in ("active", "closed"):
                raise conflict(f"{k} cannot change once the charge is active.")
            changes[k] = float(v)
    if "grant_allocated" in changes:
        prog = programme()
        others = db.q1("SELECT COALESCE(SUM(grant_allocated), 0) AS s FROM projects WHERE id != ? AND stage != 'closed'",
                       (pid,))["s"]
        left = prog["grant_pool"] - others
        if changes["grant_allocated"] > left + 0.01:
            raise conflict(f"Only ${left:,.0f} of the grant pool is unallocated; ${changes['grant_allocated']:,.0f} was asked for.")
    if "consent_threshold" in body:
        v = body["consent_threshold"]
        if not isinstance(v, (int, float)) or not 0 < v <= 1:
            raise bad("consent_threshold must be between 0 and 1.")
        changes["consent_threshold"] = float(v)
    if not changes:
        raise bad("Nothing to change.")
    db.update("projects", pid, **changes)
    pr = get_project(pid)
    if model_keys:
        reassess(pr)
    else:
        refresh_deal(pr)
    audit.log("project.update", pid, {k: (v if not isinstance(v, dict) else "changed") for k, v in body.items()})
    return get_project(pid)


# ------------------------------------------------------------------------------------------- audit

AUDIT_FIELDS = {"visited_on", "by", "storeys", "flats", "roof_m2", "roof_condition", "roof_colour", "existing",
                "switchboard_amps", "hot_water_layout", "gas_meters", "notes"}


def save_audit(p: Principal, pid: int, body: dict) -> dict:
    auth.require(p, "manager", "owner")
    pr = get_project(pid)
    check_project(p, pr)
    if pr["stage"] not in ("screened", "audit"):
        raise conflict("The site audit can only be changed before the offer is issued.")
    unknown = set(body) - AUDIT_FIELDS
    if unknown:
        raise bad("Unknown audit fields: " + ", ".join(sorted(unknown)))
    a = pr["assessment"]["building"]
    flats = flats_of(pid)
    cur = {"storeys": a["storeys"], "flats": len(flats), "roof_m2": a["roof_m2"],
           "roof_colour": (pr["existing"] or {}).get("roof", "dark")}
    data = dict(body)
    data.setdefault("visited_on", clock.today())
    data.setdefault("by", p.name)
    for k, lo, hi in (("storeys", 1, 12), ("flats", 1, 400), ("roof_m2", 1, 20000), ("switchboard_amps", 10, 2000),
                      ("gas_meters", 0, 400)):
        if k in data and data[k] is not None:
            if not isinstance(data[k], (int, float)) or not lo <= data[k] <= hi:
                raise bad(f"{k} must be a number from {lo} to {hi}.")
    if data.get("roof_condition", "sound") not in ("sound", "needs_repair", "unsuitable"):
        raise bad("roof_condition must be sound, needs_repair or unsuitable.")
    if data.get("hot_water_layout", "per_flat") not in ("per_flat", "shared"):
        raise bad("hot_water_layout must be per_flat or shared.")
    if data.get("roof_colour", "dark") not in ("dark", "light"):
        raise bad("roof_colour must be dark or light.")
    changes = []
    for k in ("storeys", "flats", "roof_m2", "roof_colour"):
        if data.get(k) is not None and data[k] != cur[k]:
            changes.append({"field": k, "from": cur[k], "to": data[k]})
    existing = dict(pr["existing"] or {})
    if data.get("existing"):
        try:
            new_ex = ExistingIn(**{**existing, **data["existing"]}).model_dump()
        except Exception as e:
            raise bad(f"The existing equipment is not valid: {e}")
        for k, v in new_ex.items():
            if existing.get(k) != v:
                changes.append({"field": f"existing.{k}", "from": existing.get(k), "to": v})
        existing = new_ex
    if data.get("roof_colour"):
        existing["roof"] = data["roof_colour"]
    data["changes"] = changes
    overrides = dict(pr["building_overrides"] or {})
    for k in ("storeys", "flats", "roof_m2"):
        if data.get(k) is not None:
            overrides[k] = data[k]
    db.update("projects", pid, building_overrides_json=overrides, existing_json=existing)
    db.ex("INSERT INTO audits (project_id, data_json, saved_at) VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE "
          "SET data_json = excluded.data_json, saved_at = excluded.saved_at", (pid, db._enc(data), clock.now_iso()))
    pr = get_project(pid)
    a = _run_assess(pr)
    db.update("projects", pid, assessment_json=a)
    new_n = int(a["building"]["flats"])
    if new_n != len(flats) or int(a["building"]["storeys"]) != cur["storeys"]:
        for f in flats:
            db.ex("DELETE FROM tenancies WHERE flat_id = ?", (f["id"],))
        db.ex("DELETE FROM flats WHERE project_id = ?", (pid,))
        _make_flats(pid, int(a["building"]["storeys"]), new_n)
    if pr["stage"] == "screened":
        _set_stage(p, get_project(pid), "audit", "Site audit saved")
    pr = get_project(pid)
    refresh_deal(pr)
    audit.log("project.audit", pid, {"changes": len(changes)})
    return pr


def get_audit(pid: int) -> dict | None:
    r = db.q1("SELECT * FROM audits WHERE project_id = ?", (pid,))
    return r["data"] if r else None


# ------------------------------------------------------------------------------------------- guards

def consent_state(pr: dict, flats: list[dict] | None = None) -> dict:
    flats = flats if flats is not None else flats_of(pr["id"])
    return {"owner_signed": bool(pr["owner_signed"]), "tenants_total": len(flats),
            "tenants_agreed": sum(1 for f in flats if f["consent"] == "agreed"),
            "tenants_declined": sum(1 for f in flats if f["consent"] == "declined"),
            "tenants_pending": sum(1 for f in flats if f["consent"] == "pending"),
            "threshold": pr["consent_threshold"],
            "needed": int(-(-pr["consent_threshold"] * len(flats) // 1)) if flats else 0}


def unmet(pr: dict, to: str) -> list[str]:
    """Plain-language conditions not yet met for moving the project to ``to``."""
    out: list[str] = []
    pkg = pr["package"] or {}
    if to == "offer":
        au = get_audit(pr["id"])
        if not au:
            out.append("No site audit has been saved.")
        elif pkg.get("cool_roof") and au.get("roof_condition") == "unsuitable":
            out.append("The site audit found the roof unsuitable for a coating. Take the cool roof out of the package "
                       "or repair the roof and save a new audit.")
    elif to == "consent":
        if not pr["offer_issued_on"]:
            out.append("The offer has not been issued.")
    elif to == "procurement":
        c = consent_state(pr)
        if not c["owner_signed"]:
            out.append("The owner has not signed.")
        if c["tenants_agreed"] < c["needed"]:
            out.append(f"{c['tenants_agreed']} of {c['tenants_total']} tenants have agreed; at least {c['needed']} "
                       f"({c['threshold']:.0%}) are needed.")
    elif to == "installation":
        if not accepted_quote(pr["id"]):
            out.append("No quote has been accepted.")
        dl = pr.get("deal") or {}
        if dl.get("gap_uncovered", 0) > 0.5:
            out.append(f"There is a funding gap of ${dl['funding_gap']:,.0f} and only "
                       f"${dl['grant_used'] + dl['owner_used']:,.0f} is covered by grant or owner contribution "
                       f"(${dl['gap_uncovered']:,.0f} short).")
    elif to == "commissioned":
        wo = work_order(pr["id"])
        if not wo:
            out.append("No work order has been issued.")
        else:
            left = [c["label"] for c in wo["checklist"] if not c["done"]]
            if left:
                out.append(f"{len(left)} commissioning checklist items are not done: " + "; ".join(left[:4])
                           + ("..." if len(left) > 4 else ""))
    elif to == "active":
        wo = work_order(pr["id"])
        if not wo or not wo["completed_on"]:
            out.append("Commissioning has not been recorded.")
    elif to == "closed":
        live = [f["unit"] for f in flats_of(pr["id"]) if f["participating"] and f["charge_status"] != "ended"]
        if pr["stage"] == "active" and live:
            out.append(f"{len(live)} flats still have a charge running (term ends {pr['charge_end']}).")
        elif pr["stage"] != "active":
            out.append("Only an active project can be closed.")
    return out


def next_stage(stage: str) -> str | None:
    i = STAGES.index(stage)
    return STAGES[i + 1] if i + 1 < len(STAGES) else None


def next_step(pr: dict) -> tuple[str, list[str]]:
    st = pr["stage"]
    nxt = next_stage(st)
    blocked = unmet(pr, nxt) if nxt else []
    texts = {
        "screened": "Book a site visit and record the audit to check the building against the open-data estimates.",
        "audit": "Issue the offer: this freezes the deal, equipment sizes and charge schedule and creates the documents.",
        "offer": "Send the offer to the owner and tenants and move to consent.",
        "consent": "Collect the owner's signature and tenants' answers, then open procurement.",
        "procurement": "Open a tender, compare quotes and accept one; cover any funding gap with a grant.",
        "installation": "Issue the work order; the installer ticks off the commissioning checklist.",
        "commissioned": "Set the start month and activate the charge. Charges begin the following month.",
        "active": "The charge runs monthly. Run billing each month and the measured-savings check each year.",
        "closed": "Nothing to do. Every charge has ended.",
    }
    text = texts[st]
    if st == "audit" and not get_audit(pr["id"]):
        text = "Visit the block and save the site audit."
    if st == "procurement":
        if not pr["tender_open"] and not db.q1("SELECT 1 FROM quotes WHERE project_id = ?", (pr["id"],)):
            text = "Open a tender to installers."
        elif not accepted_quote(pr["id"]):
            text = "Compare the quotes received and accept one."
        elif (pr.get("deal") or {}).get("gap_uncovered", 0) > 0.5:
            text = "Cover the funding gap with a grant (or an owner contribution), then start installation."
        else:
            text = "Start installation."
    if st == "installation" and not work_order(pr["id"]):
        text = "Issue the work order to the installer."
    if st == "active" and not blocked:
        text = "Every charge has ended. Close the project."
    if blocked and st not in ("active",):
        text = text + " Waiting on: " + " ".join(blocked)
    if st == "active":
        blocked = []
    return text, blocked


def flags(pr: dict) -> list[str]:
    out = []
    fl = flats_of(pr["id"])
    if any(f["charge_status"] == "paused" for f in fl):
        out.append("charge_paused")
    if pr["stage"] == "active":
        last = db.q1("SELECT period_to FROM mv_runs WHERE project_id = ? ORDER BY id DESC LIMIT 1", (pr["id"],))
        since = last["period_to"] if last else clock.madd(pr["charge_start"], -1)
        if clock.mdiff(clock.madd(clock.month(), -1), since) >= 12:
            out.append("true_up_due")
    dl = pr.get("deal") or {}
    if dl.get("funding_gap", 0) > 0.5:
        out.append("funding_gap")
    au = get_audit(pr["id"])
    if au and au.get("roof_condition") == "needs_repair":
        out.append("roof_needs_repair")
    if db.q1("SELECT 1 FROM faults WHERE project_id = ? AND status = 'open'", (pr["id"],)):
        out.append("fault_open")
    return out


# ------------------------------------------------------------------------------------------- stage changes

def _set_stage(p: Principal, pr: dict, to: str, note: str | None) -> None:
    db.update("projects", pr["id"], stage=to, stage_since=clock.today())
    db.insert("stage_history", project_id=pr["id"], stage=to, at=clock.now_iso(), by=p.label, note=note or "")
    audit.log("project.stage", pr["id"], {"to": to})


def advance(p: Principal, pid: int, body: dict) -> dict:
    from . import documents, ledger  # noqa: F401 (documents records, utility requests)
    auth.require(p, "manager")
    pr = get_project(pid)
    to = body.get("to")
    if to not in STAGES:
        raise bad("'to' must be one of: " + ", ".join(STAGES))
    if to != next_stage(pr["stage"]):
        raise conflict(f"The project is at '{pr['stage']}'. It can only move to "
                       f"'{next_stage(pr['stage'])}' next.", current=pr["stage"])
    problems = unmet(pr, to)
    if problems:
        raise ProgError("stage_guard", "This project cannot move to " + STAGE_LABELS[to].lower() + " yet: "
                        + " ".join(problems), unmet=problems, to=to)
    note = body.get("note")
    if to == "offer":
        reassess(pr)
        pr = get_project(pid)
        req = assess_request(pr)
        sizing, warn = None, None
        try:
            sizing = analysis.size_systems(req)
        except Exception as e:  # keep the offer moving; the reason is shown
            warn = f"Sizing was not available: {e}"
        start = clock.madd(clock.month(), 6)
        try:
            model_sched = analysis.schedule(req, start)
        except Exception:
            model_sched = None
        dl = pr["deal"]
        sched = D.schedule(dl, start, model_sched)
        sched["provisional"] = True
        db.update("projects", pid, sizing_json=sizing or {"unavailable": warn}, schedule_json=sched,
                  offer_issued_on=clock.today(), assessment_frozen_on=clock.today(), offer_deal_json=dl)
        for f in flats_of(pid):
            db.update("flats", f["id"], offered_charge=D.group(dl, f["position"])["charge_per_month"])
        _set_stage(p, pr, to, note)
        documents.record_offer_documents(pid)
        ledger.raise_supply_request_if_needed(pid)
    elif to == "procurement":
        _set_stage(p, pr, to, note)
        refresh_deal(get_project(pid))
    elif to == "commissioned":
        wo = work_order(pid)
        db.update("work_orders", wo["id"], completed_on=clock.today())
        _set_stage(p, pr, to, note)
        documents.record(pid, "commissioning_certificate")
        ledger.raise_gas_disconnection_if_needed(pid)
    elif to == "active":
        start = body.get("start_month") or clock.month()
        if not clock.valid_month(start):
            raise bad("start_month must look like 2027-01.")
        if clock.mdiff(start, clock.month()) < 0:
            raise bad("The start month cannot be in the past.")
        charge_start = clock.madd(start, 1)
        dl = refresh_deal(pr)
        n = dl["finance"]["term_years"] * 12
        try:
            model_sched = analysis.schedule(assess_request(pr), charge_start)
        except Exception:
            model_sched = None
        sched = D.schedule(dl, charge_start, model_sched)
        db.update("projects", pid, start_month=start, charge_start=charge_start,
                  charge_end=clock.madd(charge_start, n - 1), schedule_json=sched)
        for f in flats_of(pid):
            if f["consent"] == "agreed":
                db.update("flats", f["id"], participating=1, charge_status="active",
                          charge_per_month=D.group(dl, f["position"])["charge_per_month"])
            else:
                db.update("flats", f["id"], participating=0, charge_status="not_started", charge_per_month=0.0)
        _set_stage(p, pr, to, note or f"Charges begin {charge_start}")
        documents.record_offer_documents(pid, kinds=("charge_schedule", "tenant_disclosure"))
    elif to == "closed":
        db.update("projects", pid, closed_on=clock.today())
        _set_stage(p, pr, to, note)
    else:
        if to == "installation":
            db.ex("UPDATE grants SET status = 'paid' WHERE project_id = ? AND status = 'approved'", (pid,))
        _set_stage(p, pr, to, note)
    return get_project(pid)


# ------------------------------------------------------------------------------------------- consent

def owner_consent(p: Principal, pid: int, body: dict) -> dict:
    auth.require(p, "manager", "owner")
    pr = get_project(pid)
    check_project(p, pr)
    if pr["stage"] not in ("offer", "consent"):
        raise conflict("Owner consent is taken once the offer is issued and before procurement.")
    signed = body.get("signed")
    if not isinstance(signed, bool):
        raise bad("'signed' must be true or false.")
    name = (body.get("name") or "").strip()
    if signed and not name:
        raise bad("Give the name of the person signing for the owner.")
    org = auth.org_obj(pr["owner_org_id"])
    resolution = body.get("resolution")
    if org and org["kind"] == "strata" and signed:
        r = resolution or {}
        try:
            vf, va = int(r.get("votes_for")), int(r.get("votes_against"))
        except (TypeError, ValueError):
            raise bad("A strata owners corporation must record the meeting resolution: meeting_date, votes_for, "
                      "votes_against and kind.")
        if not r.get("meeting_date") or vf < 0 or va < 0:
            raise bad("The resolution needs a meeting date and vote counts.")
        if r.get("kind", "ordinary") not in ("ordinary", "special"):
            raise bad("Resolution kind must be ordinary or special.")
        if vf <= va:
            raise conflict("The resolution did not pass (votes for must be more than votes against). NSW owners "
                           "corporations can approve sustainability upgrades by simple majority.")
        resolution = {"meeting_date": r["meeting_date"], "votes_for": vf, "votes_against": va,
                      "kind": r.get("kind", "ordinary")}
    db.update("projects", pid, owner_signed=int(signed), owner_signed_by=name if signed else None,
              owner_signed_on=clock.today() if signed else None, owner_resolution_json=resolution if signed else None)
    audit.log("consent.owner", pid, {"signed": signed})
    return get_project(pid)


def flat_consent(p: Principal, fid: int, body: dict) -> dict:
    f = get_flat(fid)
    pr = check_flat(p, f, ("manager", "owner", "tenant"))
    if pr["stage"] not in ("offer", "consent"):
        raise conflict("Tenant consent is taken once the offer is issued and before procurement.")
    c = body.get("consent")
    if c not in ("agreed", "declined"):
        raise bad("'consent' must be agreed or declined.")
    db.update("flats", fid, consent=c, consent_on=clock.today())
    audit.log("consent.flat", pr["id"], {"flat_id": fid, "consent": c})
    refresh_deal(get_project(pr["id"]))
    return get_flat(fid)


# ------------------------------------------------------------------------------------------- tenders and quotes

def tender_items(pr: dict) -> list[dict]:
    a = pr["assessment"]
    n_total = a["building"]["flats"]
    part = sum(participating_counts(pr).values())
    out = []
    for it in D.selected_items(a):
        if it["applies_to"] == "flat":
            qty = part
            unit = it["capex"] / n_total if n_total else 0
            unit_label = "flat"
        else:
            qty = round(float(a["building"]["roof_m2"]), 1)
            unit = it["capex"] / qty if qty else it["capex"]
            unit_label = "m2"
        out.append({"key": it["key"], "label": it["label"], "qty": qty, "unit": unit_label,
                    "modelled_unit_price": round(unit, 2), "modelled_total": round(unit * qty, 2)})
    return out


def open_tender(p: Principal, pid: int, body: dict) -> dict:
    auth.require(p, "manager")
    pr = get_project(pid)
    if pr["stage"] != "procurement":
        raise conflict("A tender can only be opened at the procurement stage.")
    ids = body.get("installer_org_ids") or []
    if not isinstance(ids, list) or not ids:
        raise bad("Give at least one installer organisation id in installer_org_ids.")
    for i in ids:
        o = auth.org_obj(i)
        if not o or o["kind"] != "installer":
            raise bad(f"Organisation {i} is not an installer.")
    closes = body.get("closes_on") or clock.now().date().fromordinal(clock.now().date().toordinal() + 21).isoformat()
    if closes < clock.today():
        raise bad("The closing date is in the past.")
    for i in ids:
        db.ex("INSERT OR IGNORE INTO tender_invites (project_id, org_id) VALUES (?, ?)", (pid, i))
    db.update("projects", pid, tender_open=1, tender_closes_on=closes)
    audit.log("tender.open", pid, {"installers": ids, "closes_on": closes})
    return get_project(pid)


def tenders(p: Principal) -> list[dict]:
    auth.require(p, "installer", "manager")
    if p.role == "installer":
        rows = db.q("SELECT p.* FROM projects p JOIN tender_invites t ON t.project_id = p.id WHERE t.org_id = ? AND "
                    "p.tender_open = 1 AND p.stage = 'procurement' ORDER BY p.id", (p.org_id,))
    else:
        rows = db.q("SELECT * FROM projects WHERE tender_open = 1 AND stage = 'procurement' ORDER BY id")
    out = []
    for pr in rows:
        mine = None
        if p.role == "installer":
            q = db.q1("SELECT * FROM quotes WHERE project_id = ? AND installer_org_id = ? AND status = 'submitted'",
                      (pr["id"], p.org_id))
            mine = quote_obj(q) if q else None
        out.append({"project": project_obj(pr, p), "items": tender_items(pr), "sizing": pr["sizing"],
                    "closes_on": pr["tender_closes_on"], "open": pr["tender_closes_on"] >= clock.today(),
                    "my_quote": mine})
    return out


def submit_quote(p: Principal, pid: int, body: dict) -> dict:
    auth.require(p, "installer")
    pr = get_project(pid)
    if not db.q1("SELECT 1 FROM tender_invites WHERE project_id = ? AND org_id = ?", (pid, p.org_id)):
        raise forbidden("Your organisation was not invited to quote for this project.")
    if pr["stage"] != "procurement" or not pr["tender_open"]:
        raise conflict("This tender is not open.")
    if pr["tender_closes_on"] < clock.today():
        raise conflict(f"This tender closed on {pr['tender_closes_on']}.")
    items = body.get("items")
    if not isinstance(items, list) or not items:
        raise bad("A quote needs a list of items.")
    needed = {t["key"]: t for t in tender_items(pr)}
    clean = []
    for i, it in enumerate(items):
        if not isinstance(it, dict) or it.get("key") not in needed:
            raise bad(f"Item {i + 1}: key must be one of " + ", ".join(needed))
        try:
            qty, price = float(it.get("qty", needed[it["key"]]["qty"])), float(it["unit_price"])
        except (TypeError, ValueError, KeyError):
            raise bad(f"Item {i + 1}: qty and unit_price must be numbers.")
        if qty <= 0 or price < 0 or price > 1e6:
            raise bad(f"Item {i + 1}: qty must be above 0 and unit_price between 0 and 1,000,000.")
        clean.append({"key": it["key"], "label": needed[it["key"]]["label"], "qty": qty, "unit_price": price,
                      "total": round(qty * price, 2)})
    missing = set(needed) - {c["key"] for c in clean}
    if missing:
        raise bad("The quote must price every item in the package. Missing: " + ", ".join(sorted(missing)))
    valid_until = body.get("valid_until") or clock.today()
    if valid_until < clock.today():
        raise bad("valid_until is in the past.")
    db.ex("UPDATE quotes SET status = 'withdrawn' WHERE project_id = ? AND installer_org_id = ? AND status = 'submitted'",
          (pid, p.org_id))
    qid = db.insert("quotes", project_id=pid, installer_org_id=p.org_id, submitted_on=clock.today(),
                    valid_until=valid_until, items_json=clean, total=round(sum(c["total"] for c in clean), 2),
                    modelled_total=round(sum(t["modelled_total"] for t in needed.values()), 2), status="submitted",
                    note=(body.get("note") or "")[:2000])
    audit.log("quote.submit", pid, {"quote_id": qid})
    return quote_obj(db.q1("SELECT * FROM quotes WHERE id = ?", (qid,)))


def accept_quote(p: Principal, qid: int) -> dict:
    auth.require(p, "manager")
    q = db.q1("SELECT * FROM quotes WHERE id = ?", (qid,))
    if not q:
        raise not_found(f"Quote {qid}")
    pr = get_project(q["project_id"])
    if pr["stage"] != "procurement":
        raise conflict("Quotes can only be accepted at the procurement stage.")
    if q["status"] != "submitted":
        raise conflict(f"This quote is {q['status']} and cannot be accepted.")
    if q["valid_until"] < clock.today():
        raise conflict(f"This quote expired on {q['valid_until']}.")
    db.ex("UPDATE quotes SET status = 'declined' WHERE project_id = ? AND id != ? AND status = 'submitted'",
          (pr["id"], qid))
    db.update("quotes", qid, status="accepted")
    db.update("projects", pr["id"], installer_org_id=q["installer_org_id"], tender_open=0)
    pr = get_project(pr["id"])
    dl = refresh_deal(pr)
    # The frozen assessment is re-stated with quoted prices (kept alongside the modelled one).
    a = dict(pr["assessment"])
    a["pricing"] = {"basis": "quoted", "quote_id": qid, "deal": {k: dl[k] for k in (
        "capex_total", "rebates_total", "net_capex", "funding_gap", "charge_per_month_building", "fully_funded")}}
    db.update("projects", pr["id"], assessment_json=a)
    audit.log("quote.accept", pr["id"], {"quote_id": qid, "total": q["total"], "gap": dl["funding_gap"]})
    return get_project(pr["id"])


# ------------------------------------------------------------------------------------------- work orders

def checklist_for(pr: dict) -> list[dict]:
    pkg = pr["package"] or {}
    au = get_audit(pr["id"]) or {}
    items: list[tuple[str, str]] = [("site_induction", "Site safety induction and tenant access notices given")]
    if pkg.get("cool_roof"):
        if au.get("roof_condition") == "needs_repair":
            items.append(("roof_repairs", "Roof repairs found at the site audit completed before coating"))
        items += [("roof_coating_thickness", "Roof coating applied to specified thickness"),
                  ("roof_reflectance_measured", "Solar reflectance measured after coating (at least 0.80)")]
    if pkg.get("ceiling_insulation"):
        items.append(("insulation_installed", "Ceiling insulation installed with clearances around downlights"))
    if pkg.get("heat_pump_hot_water"):
        items += [("hpwh_installed", "Heat pump hot water installed in every participating flat"),
                  ("hpwh_temperature", "Tank stores at 60 C or above; tempering valve delivers 50 C at outlets"),
                  ("old_hot_water_removed", "Old water heaters removed and disposed of"),
                  ("plumbing_certificate", "Plumbing compliance certificate lodged")]
    if pkg.get("reverse_cycle"):
        items += [("ac_installed", "Reverse-cycle units installed in every participating flat"),
                  ("ac_sizing_matches", "Unit sizes match the sizing report for each floor"),
                  ("ac_tenant_shown", "Each tenant shown how to use the controls")]
    if pkg.get("induction_cooktop"):
        items.append(("induction_installed", "Induction cooktops installed and tested"))
    if pkg.get("disconnect_gas"):
        items.append(("gas_capped", "Gas appliances capped off; disconnection requested from the gas network"))
    items += [("switchboard_checked", "Switchboard capacity checked for the added load"),
              ("electrical_certificate", "Certificate of Compliance for Electrical Work issued"),
              ("meters_confirmed", "Meter number confirmed for every flat"),
              ("rebate_paperwork", "Rebate and certificate paperwork lodged"),
              ("warranties_handed_over", "Warranties and manuals handed to the owner")]
    return [{"key": k, "label": lbl, "done": False, "by": None, "at": None} for k, lbl in items]


def create_work_order(p: Principal, pid: int, body: dict) -> dict:
    auth.require(p, "manager")
    pr = get_project(pid)
    if pr["stage"] != "installation":
        raise conflict("A work order is issued at the installation stage.")
    if work_order(pid):
        raise conflict("This project already has a work order.")
    q = accepted_quote(pid)
    start = body.get("scheduled_start") or clock.today()
    if not isinstance(start, str) or len(start) != 10:
        raise bad("scheduled_start must be a date like 2027-01-15.")
    wid = db.insert("work_orders", project_id=pid, installer_org_id=q["installer_org_id"], scheduled_start=start,
                    checklist_json=checklist_for(pr), warranty_years=int(body.get("warranty_years") or WARRANTY_YEARS))
    audit.log("work_order.create", pid, {"work_order_id": wid})
    return wo_obj(work_order(pid))


def tick(p: Principal, wid: int, body: dict) -> dict:
    auth.require(p, "installer", "manager")
    wo = db.q1("SELECT * FROM work_orders WHERE id = ?", (wid,))
    if not wo:
        raise not_found(f"Work order {wid}")
    if p.role == "installer" and wo["installer_org_id"] != p.org_id:
        raise forbidden("This work order belongs to another installer.")
    pr = get_project(wo["project_id"])
    if pr["stage"] != "installation":
        raise conflict("The checklist can only change during installation.")
    key, done = body.get("key"), body.get("done", True)
    if not isinstance(done, bool):
        raise bad("'done' must be true or false.")
    cl = wo["checklist"]
    item = next((c for c in cl if c["key"] == key), None)
    if not item:
        raise bad("Unknown checklist item. Use one of: " + ", ".join(c["key"] for c in cl))
    item.update({"done": done, "by": p.name if done else None, "at": clock.now_iso() if done else None})
    db.update("work_orders", wid, checklist_json=cl)
    audit.log("work_order.tick", pr["id"], {"key": key, "done": done})
    return wo_obj(db.q1("SELECT * FROM work_orders WHERE id = ?", (wid,)))


# ------------------------------------------------------------------------------------------- serialisers

def org_short(oid: int | None) -> dict | None:
    o = auth.org_obj(oid)
    return {"id": o["id"], "name": o["name"]} if o else None


def quote_obj(q: dict) -> dict:
    return {"id": q["id"], "project_id": q["project_id"], "installer_org": org_short(q["installer_org_id"]),
            "submitted_on": q["submitted_on"], "valid_until": q["valid_until"], "items": q["items"],
            "total": q["total"], "modelled_total": q["modelled_total"], "status": q["status"], "note": q["note"],
            "difference_from_model": round(q["total"] - q["modelled_total"], 2)}


def wo_obj(wo: dict | None) -> dict | None:
    if not wo:
        return None
    return {"id": wo["id"], "project_id": wo["project_id"], "installer_org": org_short(wo["installer_org_id"]),
            "scheduled_start": wo["scheduled_start"], "completed_on": wo["completed_on"], "checklist": wo["checklist"],
            "warranty_years": wo["warranty_years"],
            "progress": {"done": sum(1 for c in wo["checklist"] if c["done"]), "total": len(wo["checklist"])}}


def flat_obj(f: dict, p: Principal, pr: dict | None = None) -> dict:
    from .ledger import balance, months_elapsed
    pr = pr or get_project(f["project_id"])
    t = active_tenancy(f["id"])
    elapsed = months_elapsed(f["id"])
    if f["participating"] or pr["stage"] not in ("active", "closed"):
        prin_fallback = (D.group(pr["deal"], f["position"])["principal_per_flat"]
                         if pr.get("deal") and f["consent"] != "declined" else 0.0)
        principal = D.balance_after(pr.get("schedule") if pr["charge_start"] else None, f["position"], elapsed,
                                    prin_fallback) if f["consent"] != "declined" else 0.0
    else:
        principal = 0.0
    masked = p.role in ("government", "funder", "installer")
    out = {"id": f["id"], "project_id": f["project_id"],
           "unit": None if p.role in ("government", "funder") else f["unit"], "position": f["position"],
           "meter_id": mask_meter(f["meter_id"]) if masked else f["meter_id"],
           "tenant_name": None if p.role in NO_PERSONAL else (t["tenant_name"] if t else None),
           "tenancy_start": t["start_date"] if t else None, "consent": f["consent"],
           "charge_per_month": round(f["charge_per_month"] or 0.0, 2), "offered_charge": f["offered_charge"],
           "charge_status": f["charge_status"], "paused_reason": f["paused_reason"],
           "balance_owing": round(balance(f["id"]), 2) if p.role not in NO_PERSONAL else None,
           "principal_remaining": round(principal, 2), "months_billed": elapsed, "participating": bool(f["participating"]),
           "example": True}
    if p.role in ("manager", "owner"):
        out["access_code"] = t["access_code"] if t else None
    return out


def project_obj(pr: dict, p: Principal) -> dict:
    fl = flats_of(pr["id"])
    dl = pr.get("deal") or {}
    text, blocked = next_step(pr)
    return {"id": pr["id"], "programme_id": pr["programme_id"], "building_id": pr["building_id"], "label": pr["label"],
            "suburb": pr.get("suburb"), "stage": pr["stage"], "stage_label": STAGE_LABELS[pr["stage"]],
            "stage_since": pr["stage_since"], "owner_org": org_short(pr["owner_org_id"]),
            "installer_org": org_short(pr["installer_org_id"]), "flats": len(fl), "heat_band": pr["heat_band"],
            "summary": {"net_capex": dl.get("net_capex"), "funding_gap": dl.get("funding_gap"),
                        "grant_allocated": pr["grant_allocated"], "owner_contribution": pr["owner_contribution"],
                        "gap_uncovered": dl.get("gap_uncovered"), "fully_funded": dl.get("fully_funded"),
                        "charge_per_month_building": dl.get("charge_per_month_building"),
                        "tenant_net_saving_per_month": dl.get("tenant_net_saving_per_month"),
                        "co2e_t_per_year_saved": dl.get("co2e_t_per_year_saved"), "pricing": dl.get("basis")},
            "consent": consent_state(pr, fl), "next_step": text, "blocked_by": blocked, "flags": flags(pr),
            "start_month": pr["start_month"], "charge_start": pr["charge_start"], "term_ends": pr["charge_end"],
            "example": True}


PLAIN = [("for simulated demo data only", "used for modelled estimates"), ("simulated readings", "modelled readings"),
         ("simulated demo data", "modelled estimates"), ("Simulated", "Modelled"), ("simulated", "modelled")]


def plain_assessment(a: dict) -> dict:
    """The engine's assumption notes describe the readings model in developer terms; present them plainly."""
    if not a:
        return a
    out = dict(a)
    rows = []
    for x in a.get("assumptions", []):
        x = dict(x)
        for k in ("label", "note"):
            if isinstance(x.get(k), str):
                for old, new in PLAIN:
                    x[k] = x[k].replace(old, new)
        rows.append(x)
    out["assumptions"] = rows
    return out


def project_detail(pr: dict, p: Principal) -> dict:
    from .ledger import mv_runs
    out = project_obj(pr, p)
    a = plain_assessment(pr["assessment"] or {})
    quotes = db.q("SELECT * FROM quotes WHERE project_id = ? ORDER BY id", (pr["id"],))
    if p.role == "installer":
        quotes = [q for q in quotes if q["installer_org_id"] == p.org_id]
    out.update({
        "building": a.get("building"), "existing": pr["existing"], "package": pr["package"],
        "finance": finance_for(pr), "tariff": None, "assessment": a or None,
        "assessment_frozen_on": pr["assessment_frozen_on"], "deal": pr.get("deal"), "offer_deal": pr.get("offer_deal"),
        "sizing": pr["sizing"], "schedule": pr["schedule"], "audit": get_audit(pr["id"]),
        "quotes": [quote_obj(q) for q in quotes], "work_order": wo_obj(work_order(pr["id"])),
        "flats_list": [flat_obj(f, p, pr) for f in flats_of(pr["id"])] if p.role != "tenant" else [],
        "stage_history": [{"stage": h["stage"], "at": h["at"], "by": h["by"], "note": h["note"]}
                          for h in db.q("SELECT * FROM stage_history WHERE project_id = ? ORDER BY id", (pr["id"],))],
        "mv": mv_runs(pr["id"], p), "owner_signed_by": pr["owner_signed_by"], "owner_signed_on": pr["owner_signed_on"],
        "owner_resolution": pr.get("owner_resolution"), "tender": {"open": bool(pr["tender_open"]),
                                                                   "closes_on": pr["tender_closes_on"]},
    })
    if a:
        out["tariff"] = {k["key"]: k["value"] for k in a.get("assumptions", []) if k["key"] in (
            "electricity_c_per_kwh", "electricity_supply_c_per_day", "gas_c_per_mj", "gas_supply_c_per_day")}
    return out


def list_projects(p: Principal, stage: str | None = None, q: str | None = None) -> list[dict]:
    auth.require(p, "manager", "owner", "funder", "installer", "government")
    rows = db.q("SELECT * FROM projects ORDER BY id")
    out = []
    for pr in rows:
        if not can_see_project(p, pr):
            continue
        if stage and pr["stage"] != stage:
            continue
        if q and q.lower() not in (pr["label"] or "").lower() and q.lower() not in pr["building_id"].lower():
            continue
        out.append(project_obj(pr, p))
    return out
