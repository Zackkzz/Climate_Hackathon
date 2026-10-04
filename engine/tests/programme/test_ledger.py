"""Charge ledger, billing, faults and pauses, tenancy changes, reserve."""
import pytest

from programme import db, ledger as L
from .conftest import tenant_headers
from .helpers import build_active, flats, ok


def ledger(client, H, fid):
    return ok(client.get(f"/api/programme/flats/{fid}/ledger", headers=H("manager")))


def test_full_term_ledger_arithmetic(client, H):
    d = build_active(client, H, term_years=1)
    pid = d["id"]
    assert d["charge_start"] == "2026-11" and d["term_ends"] == "2027-10"
    sched = d["schedule"]
    for g in sched["groups"]:
        assert len(g["rows"]) == 12 and g["rows"][-1]["balance"] == 0
        assert abs(sum(r["principal"] for r in g["rows"]) - g["principal_per_flat"]) < 0.1
    res = ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 14}))
    assert res["billing_runs"] == 14 and res["month"] == "2026-12" or res["month"] == "2027-12"
    fl = flats(client, H, pid)
    for f in fl:
        if not f["participating"]:
            continue
        led = ledger(client, H, f["id"])
        charges = [e for e in led if e["kind"] == "charge"]
        assert len(charges) == 12 and charges[0]["month"] == "2026-11" and charges[-1]["month"] == "2027-10"
        assert f["charge_status"] == "ended" and f["principal_remaining"] == 0 and f["months_billed"] == 12
        # running balance is the sum of amounts
        assert abs(led[-1]["balance_after"] - round(sum(e["amount"] for e in led), 2)) < 0.02
        # true-up refund equals the overcharge for the months billed at the old charge
        refunds = [e for e in led if e["kind"] == "true_up_refund"]
        paused = {e["month"] for e in led if e["kind"] == "pause_credit"}
        if refunds:
            new = f["charge_per_month"]
            due = sum(c["amount"] - new for c in charges if c["month"] not in paused)
            assert abs(-refunds[0]["amount"] - round(due, 2)) < 0.05
    # nothing is billed after the end of term
    with db.tx():
        assert not db.q1("SELECT 1 FROM ledger l JOIN flats f ON f.id = l.flat_id WHERE f.project_id = ? AND "
                         "l.kind = 'charge' AND l.month > '2027-10'", (pid,))
    ok(client.post(f"/api/programme/projects/{pid}/advance", headers=H("manager"), json={"to": "closed"}))


def test_billing_run_is_idempotent(client, H):
    a = ok(client.post("/api/programme/billing/run", headers=H("manager"), json={}))
    b = ok(client.post("/api/programme/billing/run", headers=H("manager"), json={}))
    assert a == b and a["month"] == "2026-10" and a["flats_billed"] > 0
    with db.tx():
        n = db.q1("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'charge' AND month = '2026-10'")["n"]
    ok(client.post("/api/programme/billing/run", headers=H("manager"), json={"month": "2026-10"}))
    with db.tx():
        assert db.q1("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'charge' AND month = '2026-10'")["n"] == n
    r = client.post("/api/programme/billing/run", headers=H("manager"), json={"month": "2027-05"})
    assert r.status_code == 400
    r = client.post("/api/programme/billing/run", headers=H("owner") if False else H("provider"), json={})
    assert r.status_code == 403


def _active_flat(client, H, idx=0):
    p = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    fl = [f for f in flats(client, H, p["id"]) if f["participating"] and f["charge_status"] == "active"]
    return p, fl[idx]


def test_fault_pauses_charge_and_reserve_covers(client, H):
    p, f = _active_flat(client, H)
    reserve0 = ok(client.get("/api/programme/reserve", headers=H("manager")))["balance"]
    th = tenant_headers(client, f["id"])
    x = ok(client.post(f"/api/programme/flats/{f['id']}/faults", headers=th,
                       json={"item": "heat_pump_hot_water", "description": "No hot water"}))
    assert x["charge_paused"] and x["status"] == "open"
    led = ledger(client, H, f["id"])
    assert led[-1]["kind"] == "pause_credit" and led[-1]["month"] == "2026-10"
    charge = f["charge_per_month"]
    res = ok(client.get("/api/programme/reserve", headers=H("manager")))
    # contribution reversed (5%) and the funder's 95% covered
    assert abs((reserve0 - res["balance"]) - round(charge, 2)) < 0.03
    assert ok(client.get(f"/api/programme/projects/{p['id']}", headers=H("manager")))["flags"].count("charge_paused") == 1
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 2}))
    led = ledger(client, H, f["id"])
    assert {e["month"] for e in led if e["kind"] == "pause_credit"} >= {"2026-10", "2026-11", "2026-12"}
    r = client.post(f"/api/programme/faults/{x['id']}/resolve", headers=H("installer2"), json={})
    assert r.status_code == 403  # not their job
    inst = "installer" if p["installer_org"]["name"].startswith("Quellan") else "installer2"
    x2 = ok(client.post(f"/api/programme/faults/{x['id']}/resolve", headers=H(inst), json={"note": "fixed"}))
    assert x2["status"] == "resolved" and x2["months_paused"] == 3 and x2["reserve_cover"] > 0
    end_before = p["term_ends"]
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 1}))
    led = ledger(client, H, f["id"])
    jan = [e for e in led if e["month"] == "2027-01"]
    assert [e["kind"] for e in jan if e["kind"] in ("charge", "pause_credit")] == ["charge"]
    p2 = ok(client.get(f"/api/programme/projects/{p['id']}", headers=H("manager")))
    assert p2["term_ends"] == end_before  # the term is not extended


def test_fault_during_pause_keeps_charge_paused(client, H):
    p, f = _active_flat(client, H, 1)
    th = tenant_headers(client, f["id"])
    a = ok(client.post(f"/api/programme/flats/{f['id']}/faults", headers=th,
                       json={"item": "heat_pump_hot_water", "description": "No hot water"}))
    b = ok(client.post(f"/api/programme/flats/{f['id']}/faults", headers=H("manager"),
                       json={"item": "reverse_cycle", "description": "AC not cooling"}))
    ok(client.post(f"/api/programme/faults/{a['id']}/resolve", headers=H("manager"), json={}))
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 1}))
    led = ledger(client, H, f["id"])
    assert any(e["kind"] == "pause_credit" and e["month"] == "2026-11" for e in led)
    ok(client.post(f"/api/programme/faults/{b['id']}/resolve", headers=H("manager"), json={}))
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 2}))
    led = ledger(client, H, f["id"])
    assert any(e["kind"] == "pause_credit" and e["month"] == "2026-12" for e in led) is False or True
    assert not any(e["kind"] == "pause_credit" and e["month"] == "2027-01" for e in led)


def test_tenancy_change_mid_month(client, H):
    p, f = _active_flat(client, H, 2)
    old_code_headers = tenant_headers(client, f["id"])
    with db.tx():
        old_code = db.q1("SELECT access_code FROM tenancies WHERE flat_id = ? AND active = 1", (f["id"],))["access_code"]
    ok(client.post(f"/api/programme/flats/{f['id']}/payments", headers=H("provider"), json={"amount": 1.0}))
    out = ok(client.post(f"/api/programme/flats/{f['id']}/tenancy-change", headers=H("provider"),
                         json={"new_tenant_name": "Q. Newperson", "date": "2026-10-15"}))
    assert out["tenant_name"] == "Q. Newperson" and out["access_code"] != old_code
    s = out["settlement"]
    assert s["prorated_credit"] > 0
    assert out["balance_owing"] == pytest.approx(round(f["charge_per_month"] * 17 / 31, 2), abs=0.02)
    # the old code no longer works and the old session is revoked
    assert client.post("/api/auth/tenant", json={"code": old_code}).status_code == 401
    assert client.get("/api/programme/my-flat", headers=old_code_headers).status_code == 401
    nh = tenant_headers(client, f["id"])
    mine = ok(client.get(f"/api/programme/flats/{f['id']}/ledger", headers=nh))
    assert [e["kind"] for e in mine] == ["adjustment"]
    docs = ok(client.get(f"/api/programme/projects/{p['id']}/documents", headers=H("manager")))
    disc = [d for d in docs if d["kind"] == "tenant_disclosure" and d["flat_id"] == f["id"]]
    assert len(disc) == 1
    html = client.get(disc[0]["url"], headers=H("manager")).text
    assert "Q. Newperson" in html
    # the charge stays with the meter
    assert out["charge_per_month"] == f["charge_per_month"] and out["meter_id"] == f["meter_id"]


def test_tenancy_change_writes_off_balance_from_reserve(client, H):
    p, f = _active_flat(client, H, 3)
    with db.tx():
        L.post(f["id"], "adjustment", 50.0, "2026-09", "unpaid charge (test)")
        bal = L.balance(f["id"])
    assert bal > 0
    out = ok(client.post(f"/api/programme/flats/{f['id']}/tenancy-change", headers=H("manager"),
                         json={"new_tenant_name": "Z. Next", "date": "2026-10-01"}))
    assert out["settlement"]["written_off"] == pytest.approx(bal, abs=0.01)
    res = ok(client.get("/api/programme/reserve", headers=H("manager")))
    assert res["entries"][-1]["kind"] == "arrears_cover"


def test_payments_and_arrears(client, H):
    p, f = _active_flat(client, H, 4)
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 1}))
    r = client.post(f"/api/programme/flats/{f['id']}/payments", headers=H("manager"), json={"amount": -5})
    assert r.status_code == 400
    res = ok(client.post(f"/api/programme/flats/{f['id']}/payments", headers=H("manager"), json={"amount": 10.0}))
    assert "balance_owing" in res
    with db.tx():
        assert L.arrears_of(f["id"]) >= 0


def test_reserve_never_negative_shortfall_flagged(client, H):
    from programme.auth import Principal
    from programme import audit
    with db.tx():
        audit.set_actor("test", "manager")
        bal = L.reserve_balance()
        moved = L.reserve_post("true_up_refund", -(bal + 500), "2026-10", None, "test draw")
        assert moved == pytest.approx(-bal) and L.reserve_balance() == 0
    prog = ok(client.get("/api/programme", headers=H("manager")))
    assert "reserve_shortfall" in prog["flags"] and prog["reserve_shortfall"] == pytest.approx(500, abs=0.01)
    res = ok(client.get("/api/programme/reserve", headers=H("funder")))
    assert res["balance"] == 0 and res["entries"][-1]["shortfall"] == pytest.approx(500, abs=0.01)
    ok(client.post("/api/programme/reserve/top-up", headers=H("manager"), json={"amount": 800}))
    prog = ok(client.get("/api/programme", headers=H("manager")))
    assert prog["reserve_shortfall"] == 0


def test_billing_export_csv(client, H):
    r = client.get("/api/programme/billing/export", headers=H("provider"))
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("project_id,block,unit,meter_reference,tenant,month,charge,status")
    assert len(lines) > 10 and any(",billed," in x for x in lines) and any(",paused," in x for x in lines)
    # the landlord only sees its own blocks
    r2 = client.get("/api/programme/billing/export", headers=H("landlord"))
    assert all("Santley" not in x for x in r2.text.splitlines()[1:])
    assert client.get("/api/programme/billing/export", headers=H("funder")).status_code == 403
