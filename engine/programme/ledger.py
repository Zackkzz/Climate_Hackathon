"""Money and measurement: the charge ledger, billing runs, payments, faults and pauses, tenancy changes, the reserve,
meter readings with data consent, and measured-savings (M&V) runs with true-ups.

Sign convention: a ledger amount above zero increases what the tenant owes (charge, adjustment up); below zero
reduces it (payment, pause credit, refund, write-off). ``balance_after`` is the flat's running balance.

Reserve: contributions are ``reserve rate x charge`` for every month a charge is billed and not paused. Draws cover
the funder's share of a paused charge (``(1 - reserve) x charge``), true-up refunds to tenants, and balances
written off when a tenant leaves. A draw never takes the balance below zero: the uncovered part is recorded as a
shortfall on the entry and on the programme, and the programme is flagged.
"""
from __future__ import annotations

import csv
import io
from typing import Any

from meterwise.models import AssessRequest

from . import analysis, audit, auth, clock, db
from . import service as S
from .auth import NO_PERSONAL, Principal
from .errors import ProgError, bad, conflict, forbidden, not_found

DATA_SCOPE = "Monthly electricity and gas totals for this meter"
DATA_PURPOSE = "Checking the savings from the upgrade and adjusting the charge if savings are lower"
MAX_ROWS = 5000


def r2(x: float) -> float:
    return round(float(x) + 0.0, 2)


# ------------------------------------------------------------------------------------------- ledger basics

def balance(fid: int) -> float:
    r = db.q1("SELECT balance_after FROM ledger WHERE flat_id = ? ORDER BY id DESC LIMIT 1", (fid,))
    return r["balance_after"] if r else 0.0


def months_elapsed(fid: int) -> int:
    return db.q1("SELECT COUNT(*) AS n FROM ledger WHERE flat_id = ? AND kind = 'charge'", (fid,))["n"]


def post(fid: int, kind: str, amount: float, month: str, note: str, tenancy_id: int | None = None) -> dict:
    if tenancy_id is None:
        t = S.active_tenancy(fid)
        tenancy_id = t["id"] if t else None
    bal = r2(balance(fid) + amount)
    eid = db.insert("ledger", flat_id=fid, tenancy_id=tenancy_id, month=month, at=clock.now_iso(), kind=kind,
                    amount=r2(amount), balance_after=bal, note=note)
    return {"id": eid, "balance_after": bal}


def entry_obj(e: dict) -> dict:
    return {"id": e["id"], "flat_id": e["flat_id"], "month": e["month"], "at": e["at"], "kind": e["kind"],
            "amount": e["amount"], "balance_after": e["balance_after"], "note": e["note"]}


def ledger_for(p: Principal, fid: int) -> list[dict]:
    f = S.get_flat(fid)
    S.check_flat(p, f, ("manager", "owner", "tenant"))
    if p.role == "tenant":
        rows = db.q("SELECT * FROM ledger WHERE flat_id = ? AND tenancy_id = ? ORDER BY id", (fid, p.tenancy_id))
    else:
        rows = db.q("SELECT * FROM ledger WHERE flat_id = ? ORDER BY id", (fid,))
        audit.log("personal_data.read", f["project_id"], {"what": "ledger", "flat_id": fid})
    return [entry_obj(e) for e in rows]


# ------------------------------------------------------------------------------------------- reserve

def reserve_balance(programme_id: int | None = None) -> float:
    r = db.q1("SELECT balance_after FROM reserve ORDER BY id DESC LIMIT 1")
    return r["balance_after"] if r else 0.0


def reserve_post(kind: str, amount: float, month: str, project_id: int | None, note: str,
                 flat_id: int | None = None) -> float:
    """Add (amount > 0) or draw (amount < 0). Returns the amount actually moved. Never goes below zero."""
    prog = S.programme()
    bal = reserve_balance()
    shortfall = 0.0
    if amount < 0 and bal + amount < -0.005:
        shortfall = r2(-(bal + amount))
        amount = -bal
        note = note + f" Reserve short by ${shortfall:,.2f}: flagged for the programme office."
        db.update("programmes", prog["id"], reserve_shortfall=r2((prog["reserve_shortfall"] or 0) + shortfall))
        audit.log("reserve.shortfall", project_id, {"kind": kind, "shortfall": shortfall})
    new = r2(bal + amount)
    db.insert("reserve", programme_id=prog["id"], at=clock.now_iso(), month=month, kind=kind, amount=r2(amount),
              balance_after=new, project_id=project_id, flat_id=flat_id, note=note, shortfall=shortfall)
    return amount


def reserve_rate(pr: dict) -> float:
    return float(S.finance_for(pr)["reserve"])


def reserve_view(p: Principal) -> dict:
    auth.require(p, "manager", "funder", "government")
    rows = db.q("SELECT * FROM reserve ORDER BY id")
    prog = S.programme()
    return {"balance": reserve_balance(), "shortfall": prog["reserve_shortfall"] or 0.0,
            "entries": [{"id": r["id"], "at": r["at"], "month": r["month"], "kind": r["kind"], "amount": r["amount"],
                         "balance_after": r["balance_after"], "project_id": r["project_id"], "note": r["note"],
                         "shortfall": r["shortfall"]} for r in rows]}


def top_up(p: Principal, body: dict) -> dict:
    auth.require(p, "manager")
    amt = body.get("amount")
    if not isinstance(amt, (int, float)) or amt <= 0 or amt > 1e8:
        raise bad("amount must be a positive number.")
    prog = S.programme()
    reserve_post("grant_top_up", float(amt), clock.month(), None, body.get("note") or "Reserve top-up from the grant pool")
    if prog["reserve_shortfall"]:
        db.update("programmes", prog["id"], reserve_shortfall=max(0.0, r2(prog["reserve_shortfall"] - amt)))
    audit.log("reserve.top_up", None, {"amount": amt})
    return reserve_view(p)


# ------------------------------------------------------------------------------------------- billing

def _paused(f: dict, month: str) -> dict | None:
    flt = db.q1("SELECT * FROM faults WHERE flat_id = ? AND status = 'open' AND charge_paused = 1 ORDER BY id LIMIT 1",
                (f["id"],))
    if flt:
        return flt
    if f["pause_through"] and month <= f["pause_through"]:
        return db.q1("SELECT * FROM faults WHERE flat_id = ? ORDER BY id DESC LIMIT 1", (f["id"],)) or {"id": None}
    return None


def _pause_month(pr: dict, f: dict, month: str, charge: float, fault: dict | None, reverse_contribution: bool) -> None:
    rate = reserve_rate(pr)
    fid_txt = f"fault #{fault['id']}" if fault and fault.get("id") else "an equipment fault"
    post(f["id"], "pause_credit", -charge, month, f"Charge paused for {month} because of {fid_txt}. Nothing to pay.")
    if reverse_contribution:
        reserve_post("contribution", -r2(charge * rate), month, pr["id"], f"Contribution reversed: a charge paused for {month}", f["id"])
    cover = r2(charge * (1 - rate))
    moved = reserve_post("pause_cover", -cover, month, pr["id"],
                         f"Covers the funder's share of a paused charge for {month}", f["id"])
    db.ex("UPDATE faults SET months_paused = months_paused + 1, cover_total = cover_total + ? WHERE flat_id = ? AND "
          "status = 'open' AND charge_paused = 1", (-moved, f["id"]))
    if fault and fault.get("id") and fault.get("status") == "resolved":
        db.ex("UPDATE faults SET months_paused = months_paused + 1, cover_total = cover_total + ? WHERE id = ?",
              (-moved, fault["id"]))


def billing_run(p: Principal, month: str | None = None) -> dict:
    auth.require(p, "manager")
    month = month or clock.month()
    if not clock.valid_month(month):
        raise bad("month must look like 2027-03.")
    if clock.mdiff(month, clock.month()) > 0:
        raise bad(f"{month} is in the future (the clock is at {clock.month()}).")
    return _bill(month, p.label)


def _bill(month: str, by: str) -> dict:
    for pr in db.q("SELECT * FROM projects WHERE stage IN ('active', 'closed') AND charge_start IS NOT NULL"):
        if month < pr["charge_start"]:
            continue
        rate = reserve_rate(pr)
        for f in db.q("SELECT * FROM flats WHERE project_id = ? AND participating = 1", (pr["id"],)):
            if month > pr["charge_end"]:
                if f["charge_status"] != "ended":
                    db.update("flats", f["id"], charge_status="ended", paused_reason=None)
                continue
            if db.q1("SELECT 1 FROM ledger WHERE flat_id = ? AND month = ? AND kind = 'charge'", (f["id"], month)):
                continue
            charge = r2(f["charge_per_month"])
            post(f["id"], "charge", charge, month, f"Upgrade service charge for {month}")
            fault = _paused(f, month)
            if fault is not None:
                _pause_month(pr, f, month, charge, fault, reverse_contribution=False)
                db.update("flats", f["id"], charge_status="paused",
                          paused_reason=f"Equipment fault reported{' (#' + str(fault['id']) + ')' if fault.get('id') else ''}")
            else:
                reserve_post("contribution", r2(charge * rate), month, pr["id"],
                             f"{rate:.0%} of a flat's charge for {month}", f["id"])
                db.update("flats", f["id"], charge_status="active", paused_reason=None)
            if month == pr["charge_end"]:
                db.update("flats", f["id"], charge_status="ended", paused_reason=None)
    res = month_summary(month)
    db.ex("INSERT INTO billing_runs (month, at, by, result_json) VALUES (?, ?, ?, ?) ON CONFLICT(month) DO UPDATE SET "
          "result_json = excluded.result_json", (month, clock.now_iso(), by, db._enc(res)))
    audit.log("billing.run", None, res)
    return res


def month_summary(month: str) -> dict:
    ch = db.q1("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM ledger WHERE month = ? AND kind = 'charge'",
               (month,))
    pc = db.q1("SELECT COUNT(DISTINCT flat_id) AS n, COALESCE(SUM(amount), 0) AS s FROM ledger WHERE month = ? AND "
               "kind = 'pause_credit'", (month,))
    rc = db.q1("SELECT COALESCE(SUM(amount), 0) AS s FROM reserve WHERE month = ? AND kind = 'contribution'", (month,))
    return {"month": month, "flats_billed": ch["n"] - pc["n"], "billed": r2(ch["s"] + pc["s"]), "paused_flats": pc["n"],
            "reserve_contribution": r2(rc["s"])}


def payment(p: Principal, fid: int, body: dict, source: str = "provider") -> dict:
    f = S.get_flat(fid)
    pr = S.check_flat(p, f, ("manager", "owner", "utility"))
    amt = body.get("amount")
    if not isinstance(amt, (int, float)) or amt <= 0 or amt > 100000:
        raise bad("amount must be a positive number.")
    month = body.get("month") or clock.month()
    if not clock.valid_month(month):
        raise bad("month must look like 2027-03.")
    e = post(fid, "payment", -float(amt), month, f"Payment received ({source})")
    audit.log("ledger.payment", pr["id"], {"flat_id": fid, "amount": amt, "month": month})
    return {"flat_id": fid, "balance_owing": e["balance_after"]}


def arrears_of(fid: int) -> float:
    """What is owed beyond the current month's charge."""
    cur = db.q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE flat_id = ? AND month = ? AND kind IN "
                "('charge', 'pause_credit')", (fid, clock.month()))["s"]
    return max(0.0, r2(balance(fid) - cur))


# ------------------------------------------------------------------------------------------- faults

def fault_obj(x: dict, p: Principal | None = None) -> dict:
    f = S.get_flat(x["flat_id"])
    return {"id": x["id"], "flat_id": x["flat_id"], "unit": f["unit"], "project_id": x["project_id"], "item": x["item"],
            "description": x["description"], "reported_by": x["reported_by"], "opened_on": x["opened_on"],
            "resolved_on": x["resolved_on"], "status": x["status"], "charge_paused": bool(x["charge_paused"]),
            "months_paused": x["months_paused"], "reserve_cover": r2(x["cover_total"] or 0),
            "resolve_note": x["resolve_note"]}


def installed_items(pr: dict) -> list[dict]:
    pkg = pr["package"] or {}
    return [{"key": k, "label": S.ITEM_LABELS[k]} for k in S.ITEM_LABELS if pkg.get(k)]


def open_fault(p: Principal, fid: int, body: dict, sim_resolve_month: str | None = None) -> dict:
    f = S.get_flat(fid)
    pr = S.check_flat(p, f, ("manager", "owner", "tenant"))
    keys = [i["key"] for i in installed_items(pr)]
    item = body.get("item")
    if item not in keys:
        raise bad("item must be one of the installed items: " + ", ".join(keys))
    desc = (body.get("description") or "").strip()
    if not desc or len(desc) > 2000:
        raise bad("Describe the problem (up to 2000 characters).")
    if STAGES_AFTER_INSTALL.count(pr["stage"]) == 0:
        raise conflict("Faults can be reported once the equipment is installed.")
    month = clock.month()
    pausing = f["participating"] and f["charge_status"] in ("active", "paused") and pr["stage"] == "active"
    fid_new = db.insert("faults", flat_id=fid, project_id=pr["id"], item=item, description=desc,
                        reported_by=p.role, opened_on=clock.today(), opened_month=month, status="open",
                        tenancy_id=(S.active_tenancy(fid) or {}).get("id"),
                        charge_paused=int(bool(pausing)), months_paused=0, cover_total=0,
                        sim_resolve_month=sim_resolve_month)
    if pausing:
        billed = db.q1("SELECT amount FROM ledger WHERE flat_id = ? AND month = ? AND kind = 'charge'", (fid, month))
        credited = db.q1("SELECT 1 FROM ledger WHERE flat_id = ? AND month = ? AND kind = 'pause_credit'", (fid, month))
        if billed and not credited:  # this month's charge was already billed: pause from this month
            fault = db.q1("SELECT * FROM faults WHERE id = ?", (fid_new,))
            _pause_month(pr, f, month, billed["amount"], fault, reverse_contribution=True)
        db.update("flats", fid, charge_status="paused", paused_reason=f"Equipment fault reported (#{fid_new})")
    audit.log("fault.open", pr["id"], {"fault_id": fid_new, "flat_id": fid, "item": item, "paused": bool(pausing)})
    return fault_obj(db.q1("SELECT * FROM faults WHERE id = ?", (fid_new,)))


STAGES_AFTER_INSTALL = ["installation", "commissioned", "active", "closed"]


def resolve_fault(p: Principal, xid: int, body: dict) -> dict:
    auth.require(p, "manager", "installer")
    x = db.q1("SELECT * FROM faults WHERE id = ?", (xid,))
    if not x:
        raise not_found(f"Fault {xid}")
    pr = S.get_project(x["project_id"])
    if p.role == "installer" and pr["installer_org_id"] != p.org_id:
        raise forbidden("This fault is on another installer's job.")
    if x["status"] != "open":
        raise conflict("This fault is already resolved.")
    month = clock.month()
    db.update("faults", xid, status="resolved", resolved_on=clock.today(), resolve_note=(body.get("note") or "")[:2000])
    f = S.get_flat(x["flat_id"])
    still = db.q1("SELECT 1 FROM faults WHERE flat_id = ? AND status = 'open' AND charge_paused = 1", (f["id"],))
    if x["charge_paused"] and not still:
        # The charge resumes next month: this month stays paused even if not yet billed.
        db.update("flats", f["id"], pause_through=month)
        if f["charge_status"] == "paused" and db.q1(
                "SELECT 1 FROM ledger WHERE flat_id = ? AND month = ? AND kind = 'pause_credit'", (f["id"], month)):
            pass  # status flips to active at next month's billing
    audit.log("fault.resolve", pr["id"], {"fault_id": xid})
    return fault_obj(db.q1("SELECT * FROM faults WHERE id = ?", (xid,)))


def list_faults(p: Principal, status: str | None = None, project_id: int | None = None) -> list[dict]:
    auth.require(p, "manager", "owner", "installer")
    rows = db.q("SELECT * FROM faults ORDER BY id DESC")
    out = []
    for x in rows:
        pr = S.get_project(x["project_id"])
        if p.role == "owner" and pr["owner_org_id"] != p.org_id:
            continue
        if p.role == "installer" and pr["installer_org_id"] != p.org_id:
            continue
        if status and x["status"] != status:
            continue
        if project_id and x["project_id"] != project_id:
            continue
        out.append(fault_obj(x, p))
    return out


# ------------------------------------------------------------------------------------------- tenancy change

def tenancy_change(p: Principal, fid: int, body: dict) -> dict:
    from . import documents
    f = S.get_flat(fid)
    pr = S.check_flat(p, f, ("manager", "owner"))
    name = (body.get("new_tenant_name") or "").strip()
    if not name or len(name) > 120:
        raise bad("Give the new tenant's name (up to 120 characters).")
    date = body.get("date") or clock.today()
    if not isinstance(date, str) or len(date) != 10:
        raise bad("date must look like 2027-04-15.")
    old = S.active_tenancy(fid)
    if old and date < old["start_date"]:
        raise bad(f"The change date is before the current tenancy started ({old['start_date']}).")
    if date[:7] > clock.month():
        raise bad("The change date is after the current month. Record it when the new tenancy starts.")
    month = date[:7]
    rate = reserve_rate(pr)
    settled: dict[str, Any] = {"prorated_credit": 0.0, "final_payment": 0.0, "written_off": 0.0, "refunded": 0.0}
    charge_row = db.q1("SELECT amount FROM ledger WHERE flat_id = ? AND month = ? AND kind = 'charge'", (fid, month))
    paused_row = db.q1("SELECT 1 FROM ledger WHERE flat_id = ? AND month = ? AND kind = 'pause_credit'", (fid, month))
    frac = 0.0
    if charge_row and not paused_row and int(date[8:10]) > 1:
        dim = clock.days_in(month)
        frac = (dim - int(date[8:10]) + 1) / dim
        credit = r2(charge_row["amount"] * frac)
        post(fid, "adjustment", -credit, month, f"Part-month credit: tenancy ended {date}", old["id"] if old else None)
        settled["prorated_credit"] = credit
    fp = body.get("final_payment")
    if fp is not None:
        if not isinstance(fp, (int, float)) or fp < 0:
            raise bad("final_payment must be a non-negative number.")
        if fp > 0:
            post(fid, "payment", -float(fp), month, "Final payment at move-out", old["id"] if old else None)
            settled["final_payment"] = float(fp)
    bal = balance(fid)
    if bal > 0.005:
        post(fid, "write_off", -bal, month, "Balance at move-out cleared. The outgoing tenant does not carry a debt; "
             "the reserve covers it.", old["id"] if old else None)
        reserve_post("arrears_cover", -r2(bal * (1 - rate)), month, pr["id"],
                     "A balance written off at move-out", fid)
        settled["written_off"] = r2(bal)
    elif bal < -0.005:
        post(fid, "adjustment", -bal, month, "Credit refunded to the outgoing tenant", old["id"] if old else None)
        settled["refunded"] = r2(-bal)
    if old:
        db.update("tenancies", old["id"], active=0, end_date=date)
        db.ex("UPDATE sessions SET revoked = 1 WHERE tenancy_id = ?", (old["id"],))
        db.ex("UPDATE data_consents SET withdrawn_at = ? WHERE tenancy_id = ? AND withdrawn_at IS NULL",
              (clock.now_iso(), old["id"]))
    n = db.q1("SELECT COUNT(*) AS n FROM tenancies WHERE flat_id = ?", (fid,))["n"]
    tid = db.insert("tenancies", flat_id=fid, tenant_name=name, start_date=date,
                    access_code=auth.new_access_code(f"{pr['id']}:{f['unit']}:{n}"), active=1, disclosed_on=date)
    if frac > 0:
        post(fid, "adjustment", r2(charge_row["amount"] * frac), month, f"Part-month charge: tenancy started {date}", tid)
    documents.record(pr["id"], "tenant_disclosure", fid, tid)
    audit.log("tenancy.change", pr["id"], {"flat_id": fid, "date": date, **settled})
    out = S.flat_obj(S.get_flat(fid), p, pr)
    out["settlement"] = settled
    out["disclosure_url"] = f"/api/programme/documents/{pr['id']}/tenant_disclosure.html?flat_id={fid}"
    return out


# ------------------------------------------------------------------------------------------- data consent

def current_data_consent(fid: int) -> dict | None:
    t = S.active_tenancy(fid)
    if not t:
        return None
    c = db.q1("SELECT * FROM data_consents WHERE flat_id = ? AND tenancy_id = ? AND withdrawn_at IS NULL ORDER BY id "
              "DESC LIMIT 1", (fid, t["id"]))
    if not c or (c["expires_on"] and c["expires_on"] < clock.today()):
        return None
    return c


def consent_obj(c: dict | None) -> dict | None:
    if not c:
        return None
    return {"id": c["id"], "flat_id": c["flat_id"], "given_by": c["given_by_role"], "note": c["note"],
            "scope": c["scope"], "purpose": c["purpose"], "given_at": c["given_at"], "expires_on": c["expires_on"],
            "withdrawn_at": c["withdrawn_at"]}


def data_consent_get(p: Principal, fid: int) -> dict:
    f = S.get_flat(fid)
    S.check_flat(p, f, ("manager", "owner", "tenant"))
    t = S.active_tenancy(fid)
    hist = db.q("SELECT * FROM data_consents WHERE flat_id = ? AND tenancy_id = ? ORDER BY id", (fid, t["id"] if t else -1))
    cur = current_data_consent(fid)
    return {"flat_id": fid, "current": consent_obj(cur), "active": cur is not None,
            "history": [consent_obj(c) for c in hist], "scope": DATA_SCOPE, "purpose": DATA_PURPOSE,
            "note": "Agreeing to the upgrade does not mean agreeing to share meter data. This consent is separate and "
                    "can be withdrawn at any time. Modelled estimates do not use meter data and do not need it."}


def data_consent_set(p: Principal, fid: int, body: dict) -> dict:
    f = S.get_flat(fid)
    pr = S.check_flat(p, f, ("manager", "owner", "tenant"))
    given = body.get("given")
    if not isinstance(given, bool):
        raise bad("'given' must be true or false.")
    t = S.active_tenancy(fid)
    if not t:
        raise conflict("This flat has no current tenancy.")
    now = clock.now_iso()
    if given:
        note = (body.get("note") or "").strip()
        if p.role != "tenant" and not note:
            raise bad("When recording consent on the tenant's behalf, add a note saying how the tenant gave it "
                      "(for example: signed form on 3 March).")
        exp = body.get("expires_on")
        if exp is None:
            d = clock.now().date()
            exp = d.replace(year=d.year + 2).isoformat() if not (d.month == 2 and d.day == 29) else \
                d.replace(year=d.year + 2, day=28).isoformat()
        if not isinstance(exp, str) or len(exp) != 10 or exp <= clock.today():
            raise bad("expires_on must be a future date like 2028-06-30.")
        db.ex("UPDATE data_consents SET withdrawn_at = ? WHERE flat_id = ? AND tenancy_id = ? AND withdrawn_at IS NULL",
              (now, fid, t["id"]))
        db.insert("data_consents", flat_id=fid, tenancy_id=t["id"], given_by=p.label,
                  given_by_role="tenant" if p.role == "tenant" else f"{p.role} on the tenant's behalf",
                  note=note[:500], scope=DATA_SCOPE, purpose=DATA_PURPOSE, given_at=now, expires_on=exp)
        audit.log("data_consent.given", pr["id"], {"flat_id": fid, "expires_on": exp, "by_role": p.role})
    else:
        db.ex("UPDATE data_consents SET withdrawn_at = ? WHERE flat_id = ? AND tenancy_id = ? AND withdrawn_at IS NULL",
              (now, fid, t["id"]))
        audit.log("data_consent.withdrawn", pr["id"], {"flat_id": fid, "by_role": p.role})
    return data_consent_get(p, fid)


# ------------------------------------------------------------------------------------------- readings

READING_KEYS = ("month", "electricity_kwh", "gas_mj", "indoor_hours_above_30c", "mean_outdoor_c", "source")


SOURCE_LABELS = {"simulated": "Modelled estimate", "uploaded": "Uploaded", "utility": "Utility", "mixed": "Mixed sources"}


def reading_obj(r: dict) -> dict:
    return {**{k: r[k] for k in READING_KEYS}, "source_label": SOURCE_LABELS.get(r["source"], r["source"])}


def tenant_faults(p: Principal, fid: int) -> list[dict]:
    return [fault_obj(x) for x in db.q("SELECT * FROM faults WHERE flat_id = ? AND tenancy_id = ? ORDER BY id DESC",
                                      (fid, p.tenancy_id))]


def readings_of(fid: int, tenancy_id: int | None = None) -> list[dict]:
    if tenancy_id is None:
        rows = db.q("SELECT * FROM readings WHERE flat_id = ? ORDER BY month", (fid,))
    else:
        rows = db.q("""SELECT r.* FROM readings r JOIN tenancies t ON t.id = ? AND t.flat_id = r.flat_id
            WHERE r.flat_id = ? AND r.month || '-01' >= t.start_date
            AND (t.end_date IS NULL OR date(r.month || '-01', '+1 month') <= t.end_date)
            AND NOT EXISTS (SELECT 1 FROM tenancies other WHERE other.flat_id = r.flat_id AND other.id != t.id
              AND other.start_date < date(r.month || '-01', '+1 month')
              AND (other.end_date IS NULL OR other.end_date > r.month || '-01')) ORDER BY r.month""",
            (tenancy_id, fid))
    return [reading_obj(r) for r in rows]


def readings_get(p: Principal, fid: int) -> list[dict]:
    f = S.get_flat(fid)
    S.check_flat(p, f, ("manager", "owner", "tenant"))
    return readings_of(fid, p.tenancy_id if p.role == "tenant" else None)


def _num(v: Any, name: str, lo: float, hi: float, optional: bool = False) -> float | None:
    if v is None or v == "":
        if optional:
            return None
        raise ValueError(f"{name} is missing")
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{name} is not a number")
    if not lo <= x <= hi:
        raise ValueError(f"{name} must be from {lo:g} to {hi:g}")
    return x


def clean_reading(row: dict) -> dict:
    m = row.get("month")
    if not clock.valid_month(m):
        raise ValueError("month must look like 2027-03")
    if clock.mdiff(m, clock.month()) > 0:
        raise ValueError("month is in the future")
    return {"month": m, "electricity_kwh": _num(row.get("electricity_kwh"), "electricity_kwh", 0, 20000),
            "gas_mj": _num(row.get("gas_mj"), "gas_mj", 0, 100000, optional=True) or 0.0,
            "indoor_hours_above_30c": _num(row.get("indoor_hours_above_30c"), "indoor_hours_above_30c", 0, 744, True),
            "mean_outdoor_c": _num(row.get("mean_outdoor_c"), "mean_outdoor_c", -20, 50, True)}


def store_reading(fid: int, r: dict, source: str) -> None:
    if source == "simulated":
        ex = db.q1("SELECT source FROM readings WHERE flat_id = ? AND month = ?", (fid, r["month"]))
        if ex and ex["source"] != "simulated":
            return  # real data wins over simulated
    db.ex("INSERT INTO readings (flat_id, month, electricity_kwh, gas_mj, indoor_hours_above_30c, mean_outdoor_c, "
          "source) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(flat_id, month) DO UPDATE SET electricity_kwh = "
          "excluded.electricity_kwh, gas_mj = excluded.gas_mj, indoor_hours_above_30c = "
          "excluded.indoor_hours_above_30c, mean_outdoor_c = excluded.mean_outdoor_c, source = excluded.source",
          (fid, r["month"], r["electricity_kwh"], r["gas_mj"], r.get("indoor_hours_above_30c"),
           r.get("mean_outdoor_c"), source))


def parse_csv(text: str, required: tuple[str, ...]) -> list[dict]:
    if len(text) > 2_000_000:
        raise ProgError("too_large", "The file is larger than 2 MB.")
    rd = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    if rd.fieldnames:  # "meter_reference" is the documented header; "meter_id" is accepted too
        rd.fieldnames = ["meter_id" if (h or "").strip() == "meter_reference" else (h or "").strip() for h in rd.fieldnames]
    if not rd.fieldnames or any(k not in rd.fieldnames for k in required):
        raise bad("The CSV header must include: " + ",".join(required))
    rows = []
    for i, row in enumerate(rd):
        if i >= MAX_ROWS:
            raise ProgError("too_large", f"At most {MAX_ROWS} rows per upload.")
        rows.append({k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k})
    return rows


def readings_post(p: Principal, fid: int, rows: list[dict]) -> dict:
    f = S.get_flat(fid)
    pr = S.check_flat(p, f, ("manager", "owner"))
    if len(rows) > MAX_ROWS:
        raise ProgError("too_large", f"At most {MAX_ROWS} readings per upload.")
    if not current_data_consent(fid):
        raise conflict("No current data consent for this meter. Record the tenant's consent to share meter data "
                       "first (POST /api/programme/flats/{id}/data-consent).", reason="no current data consent")
    accepted, rejected = 0, []
    for i, row in enumerate(rows):
        try:
            store_reading(fid, clean_reading(row), "uploaded")
            accepted += 1
        except ValueError as e:
            rejected.append({"row": i + 1, "reason": str(e)})
    audit.log("readings.upload", pr["id"], {"flat_id": fid, "accepted": accepted, "rejected": len(rejected)})
    return {"accepted": accepted, "rejected": rejected, "readings": readings_of(fid)}


# ------------------------------------------------------------------------------------------- M&V

def mv_obj(r: dict, p: Principal | None) -> dict:
    d = dict(r["data"])
    d["id"] = r["id"]
    if p is not None and p.role in ("funder", "government", "installer"):  # block level only: no unit numbers
        d["by_flat"] = [{k: v for k, v in b.items() if k != "unit"} for b in d["by_flat"]]
        d["true_ups"] = [{k: v for k, v in t.items() if k != "unit"} for t in d["true_ups"]]
    return d


def mv_runs(pid: int, p: Principal | None = None) -> list[dict]:
    return [mv_obj(r, p) for r in db.q("SELECT * FROM mv_runs WHERE project_id = ? ORDER BY id", (pid,))]


def mv_list(p: Principal, pid: int) -> list[dict]:
    auth.require(p, "manager", "owner", "funder", "government")
    pr = S.get_project(pid)
    S.check_project(p, pr)
    return mv_runs(pid, p)


def _prior_refunds(pid: int, fid: int, frm: str, to: str) -> float:
    tot = 0.0
    for r in db.q("SELECT * FROM mv_runs WHERE project_id = ?", (pid,)):
        d = r["data"]
        if d["period"]["to"] < frm or d["period"]["from"] > to:
            continue
        for t in d["true_ups"]:
            if t["flat_id"] == fid:
                tot += t["refund"]
    return tot


def run_mv(p: Principal, pid: int, body: dict | None = None) -> dict:
    from . import documents
    auth.require(p, "manager")
    body = body or {}
    pr = S.get_project(pid)
    if pr["stage"] not in ("active", "closed") or not pr["charge_start"]:
        raise conflict("Measured savings are checked once the charge is active.")
    to = body.get("to") or min(clock.madd(clock.month(), -1), pr["charge_end"])
    frm = body.get("from") or max(clock.madd(to, -11), pr["charge_start"])
    if not (clock.valid_month(frm) and clock.valid_month(to)) or frm > to:
        raise bad("from and to must be months like 2027-01, with from not after to.")
    if frm < pr["charge_start"]:
        raise bad(f"The check period must start on or after the first charge month ({pr['charge_start']}).")
    req = AssessRequest(**S.assess_request(pr).model_dump())
    by_flat, true_ups = [], []
    reserve_drawn = 0.0
    sources = set()
    mod_sum = ver_sum = 0.0
    nflat = neutral = 0
    for f in db.q("SELECT * FROM flats WHERE project_id = ? AND participating = 1 ORDER BY id", (pid,)):
        rd = db.q("SELECT * FROM readings WHERE flat_id = ? ORDER BY month", (f["id"],))
        baseline = [reading_obj(r) for r in rd if r["month"] < pr["start_month"]][-12:]
        post_r = [reading_obj(r) for r in rd if frm <= r["month"] <= to]
        if len(baseline) < 6 or len(post_r) < 3:
            by_flat.append({"flat_id": f["id"], "unit": f["unit"], "result": None,
                            "reason": f"Not enough readings: {len(baseline)} baseline months (need 6) and "
                                      f"{len(post_r)} months after (need 3)."})
            continue
        sources.update(r["source"] for r in post_r)
        res = analysis.verify(req, f["position"], baseline, post_r, f["charge_per_month"])
        nflat += 1
        mod_sum += float(res.get("modelled_saving_per_month") or 0)
        ver_sum += float(res.get("verified_saving_per_month") or 0)
        neutral += 1 if res.get("bill_neutral_verified") else 0
        tu = res["true_up"]
        old = r2(f["charge_per_month"])
        new = r2(min(old, float(tu.get("new_charge_per_month", old))))
        action = tu.get("action", "none")
        refund = 0.0
        if action in ("reduce_charge", "refund_from_reserve") and (new < old - 0.005 or float(tu.get("refund") or 0) > 0):
            charged = db.q("SELECT l.month, l.amount FROM ledger l WHERE l.flat_id = ? AND l.kind = 'charge' AND "
                           "l.month BETWEEN ? AND ? AND NOT EXISTS (SELECT 1 FROM ledger x WHERE x.flat_id = l.flat_id "
                           "AND x.month = l.month AND x.kind = 'pause_credit')", (f["id"], frm, to))
            due = sum(max(0.0, c["amount"] - new) for c in charged) - _prior_refunds(pid, f["id"], frm, to)
            refund = r2(max(0.0, due))
            if action == "refund_from_reserve" and new >= old - 0.005:
                refund = r2(min(refund, float(tu.get("refund") or 0))) if tu.get("refund") else refund
            if new < old - 0.005:
                db.update("flats", f["id"], charge_per_month=new)
            if refund > 0:
                post(f["id"], "true_up_refund", -refund, clock.month(),
                     f"Refund after the savings check for {frm} to {to}: charge was above the share of verified saving")
                reserve_drawn += -reserve_post("true_up_refund", -refund, clock.month(), pid,
                                               f"True-up refund to a tenant ({frm} to {to})", f["id"])
            true_ups.append({"flat_id": f["id"], "unit": f["unit"],
                             "action": "reduce_charge" if new < old - 0.005 else "refund_from_reserve",
                             "old_charge": old, "new_charge": new, "refund": refund, "reason": tu.get("reason", "")})
        by_flat.append({"flat_id": f["id"], "unit": f["unit"], "position": f["position"], "result": res})
    if nflat == 0:
        raise conflict("No flat has enough readings for a savings check (each needs 6 months before the upgrade and "
                       "3 after).", by_flat=by_flat)
    src = sources.pop() if len(sources) == 1 else "mixed"
    data = {"project_id": pid, "run_on": clock.today(), "period": {"from": frm, "to": to}, "source": src,
            "source_label": SOURCE_LABELS.get(src, src),
            "flats_verified": nflat, "flats_skipped": len(by_flat) - nflat,
            "modelled_saving_per_month": r2(mod_sum / nflat), "verified_saving_per_month": r2(ver_sum / nflat),
            "realisation_rate": round(ver_sum / mod_sum, 3) if mod_sum else None, "bill_neutral_flats": neutral,
            "true_ups": true_ups, "reserve_drawn": r2(reserve_drawn), "by_flat": by_flat}
    rid = db.insert("mv_runs", project_id=pid, run_on=clock.today(), period_from=frm, period_to=to, data_json=data)
    documents.record(pid, "mv_report")
    audit.log("mv.run", pid, {"run_id": rid, "flats": nflat, "true_ups": len(true_ups), "refunded": data["reserve_drawn"]})
    data["id"] = rid
    return data


# ------------------------------------------------------------------------------------------- utility requests

def _org_of_kind(kind: str) -> int | None:
    o = db.q1("SELECT id FROM orgs WHERE kind = ? ORDER BY id LIMIT 1", (kind,))
    return o["id"] if o else None


def raise_supply_request_if_needed(pid: int) -> None:
    pr = S.get_project(pid)
    el = (pr["sizing"] or {}).get("electrical") or {}
    au = S.get_audit(pid) or {}
    need = bool(el.get("switchboard_upgrade_likely")) or el.get("flat_supply_ok") is False
    detail = el.get("note") or ""
    if au.get("switchboard_amps") and el.get("typical_supply_amps") and au["switchboard_amps"] < el["typical_supply_amps"]:
        need = True
        detail = (f"Site audit found a {au['switchboard_amps']} A supply, below the {el['typical_supply_amps']} A the "
                  f"sizing assumes. " + detail)
    if need and not db.q1("SELECT 1 FROM supply_requests WHERE project_id = ?", (pid,)):
        db.insert("supply_requests", project_id=pid, org_id=_org_of_kind("distributor"), kind="switchboard_upgrade",
                  detail=detail or "Sizing shows a switchboard or supply upgrade is likely.", status="open",
                  raised_on=clock.today())
        audit.log("utility.supply_request", pid, {})


def raise_gas_disconnection_if_needed(pid: int) -> None:
    pr = S.get_project(pid)
    items = {i["key"] for i in (pr["assessment"] or {}).get("package", {}).get("items", []) if i["selected"]}
    if "disconnect_gas" in items and not db.q1("SELECT 1 FROM gas_disconnections WHERE project_id = ?", (pid,)):
        n = db.q1("SELECT COUNT(*) AS n FROM flats WHERE project_id = ? AND consent = 'agreed'", (pid,))["n"]
        db.insert("gas_disconnections", project_id=pid, org_id=_org_of_kind("gas_network"), meters=n,
                  requested_on=clock.today(), status="requested",
                  note="Raised automatically at commissioning: every gas appliance in these flats was replaced.")
        audit.log("utility.gas_disconnection", pid, {"meters": n})


# ------------------------------------------------------------------------------------------- CSV safety

def csv_cell(v: Any) -> Any:
    """Neutralise spreadsheet formula injection: text starting with = + - @ (or tab/CR) gets a leading apostrophe."""
    if isinstance(v, str) and v and v[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def to_csv(header: list[str], rows: list[list[Any]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    for r in rows:
        w.writerow([csv_cell(x) for x in r])
    return buf.getvalue()


def billing_export(p: Principal, month: str | None, project_id: int | None) -> str:
    auth.require(p, "manager", "owner")
    month = month or clock.month()
    if not clock.valid_month(month):
        raise bad("month must look like 2027-03.")
    rows = []
    for pr in db.q("SELECT * FROM projects WHERE charge_start IS NOT NULL ORDER BY id"):
        if project_id and pr["id"] != project_id:
            continue
        if p.role == "owner" and pr["owner_org_id"] != p.org_id:
            continue
        for f in S.flats_of(pr["id"]):
            ch = db.q1("SELECT COALESCE(SUM(CASE WHEN kind = 'charge' THEN amount ELSE 0 END), 0) AS c, "
                       "COALESCE(SUM(CASE WHEN kind = 'pause_credit' THEN amount ELSE 0 END), 0) AS pc FROM ledger "
                       "WHERE flat_id = ? AND month = ?", (f["id"], month))
            status = "paused" if ch["pc"] < 0 else ("billed" if ch["c"] > 0 else
                                                    ("no charge" if not f["participating"] else "not billed"))
            t = S.active_tenancy(f["id"])
            rows.append([pr["id"], pr["label"], f["unit"], f["meter_id"], t["tenant_name"] if t else "", month,
                         r2(ch["c"] + ch["pc"]), status, r2(balance(f["id"]))])
    audit.log("export.billing", project_id, {"month": month, "rows": len(rows)})
    return to_csv(["project_id", "block", "unit", "meter_reference", "tenant", "month", "charge", "status", "balance_owing"],
                  rows)
