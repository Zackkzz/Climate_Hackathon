"""Measured savings, true-ups, readings and data consent."""
from programme import db
from .conftest import tenant_headers
from .helpers import build_active, flats, give_data_consent, ok


def test_seeded_mv_run_has_true_ups(client, H):
    p = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    runs = ok(client.get(f"/api/programme/projects/{p['id']}/mv", headers=H("funder")))
    assert runs and runs[0]["true_ups"] and runs[0]["source"] == "simulated"
    for k in ("period", "flats_verified", "modelled_saving_per_month", "verified_saving_per_month",
              "realisation_rate", "bill_neutral_flats", "true_ups", "reserve_drawn", "by_flat"):
        assert k in runs[0]


def test_mv_true_up_reduces_charge_and_refunds_from_reserve(client, H):
    d = build_active(client, H, term_years=2)
    pid = d["id"]
    fl = [f for f in flats(client, H, pid) if f["participating"]]
    # one flat underperforms: the fake verifies half the saving
    with db.tx():
        db.update("flats", fl[0]["id"], sim_scenario="underperforming_hot_water")
        db.update("flats", fl[1]["id"], sim_scenario="low_use")
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 6}))
    reserve0 = ok(client.get("/api/programme/reserve", headers=H("manager")))["balance"]
    run = ok(client.post(f"/api/programme/projects/{pid}/mv/run", headers=H("manager"), json={}))
    assert run["period"] == {"from": "2026-11", "to": "2027-03"}
    tu = {t["flat_id"]: t for t in run["true_ups"]}
    assert fl[0]["id"] in tu and tu[fl[0]["id"]]["action"] == "reduce_charge"
    t0 = tu[fl[0]["id"]]
    assert t0["new_charge"] < t0["old_charge"] and t0["refund"] > 0
    after = ok(client.get(f"/api/programme/flats/{fl[0]['id']}/ledger", headers=H("manager")))
    assert after[-1]["kind"] == "true_up_refund" and after[-1]["amount"] == -t0["refund"]
    reserve1 = ok(client.get("/api/programme/reserve", headers=H("manager")))["balance"]
    assert abs((reserve0 - reserve1) - run["reserve_drawn"]) < 0.02
    f0 = next(f for f in flats(client, H, pid) if f["id"] == fl[0]["id"])
    assert f0["charge_per_month"] == t0["new_charge"]
    # running the same period again does not refund twice
    run2 = ok(client.post(f"/api/programme/projects/{pid}/mv/run", headers=H("manager"), json={}))
    assert all(t["refund"] == 0 for t in run2["true_ups"])
    html = client.get(f"/api/programme/documents/{pid}/mv_report.html", headers=H("funder")).text
    assert "SIMULATED" in html


def test_mv_skips_flats_with_missing_readings(client, H):
    d = build_active(client, H, term_years=2)
    pid = d["id"]
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 5}))
    fl = [f for f in flats(client, H, pid) if f["participating"]]
    with db.tx():
        db.ex("DELETE FROM readings WHERE flat_id = ?", (fl[0]["id"],))
    run = ok(client.post(f"/api/programme/projects/{pid}/mv/run", headers=H("manager"), json={}))
    skipped = [b for b in run["by_flat"] if b["result"] is None]
    assert skipped and skipped[0]["flat_id"] == fl[0]["id"] and "Not enough readings" in skipped[0]["reason"]
    assert run["flats_verified"] == len(fl) - 1
    with db.tx():
        db.ex("DELETE FROM readings WHERE flat_id IN (SELECT id FROM flats WHERE project_id = ?)", (pid,))
    r = client.post(f"/api/programme/projects/{pid}/mv/run", headers=H("manager"), json={})
    assert r.status_code == 409


def test_uploaded_readings_need_data_consent(client, H):
    p = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    fl = flats(client, H, p["id"])
    no = next(f for f in fl if f["participating"] and not ok(client.get(
        f"/api/programme/flats/{f['id']}/data-consent", headers=H("manager")))["active"])
    body = {"readings": [{"month": "2026-09", "electricity_kwh": 200, "gas_mj": 0}]}
    r = client.post(f"/api/programme/flats/{no['id']}/readings", headers=H("provider"), json=body)
    assert r.status_code == 409 and r.json()["reason"] == "no current data consent"
    # owner on the tenant's behalf needs a note
    r = client.post(f"/api/programme/flats/{no['id']}/data-consent", headers=H("provider"), json={"given": True})
    assert r.status_code == 400
    th = tenant_headers(client, no["id"])
    c = ok(client.post(f"/api/programme/flats/{no['id']}/data-consent", headers=th, json={"given": True}))
    assert c["active"] and c["current"]["given_by"] == "tenant" and c["current"]["expires_on"]
    ok(client.post(f"/api/programme/flats/{no['id']}/readings", headers=H("provider"), json=body))
    csv = "month,electricity_kwh,gas_mj,indoor_hours_above_30c\n2026-08,210,0,4\n2026-07,abc,0,\n"
    res = ok(client.post(f"/api/programme/flats/{no['id']}/readings", headers={**H("provider"),
                                                                               "Content-Type": "text/csv"}, content=csv))
    assert res["accepted"] == 1 and res["rejected"][0]["row"] == 2
    rd = {r["month"]: r for r in ok(client.get(f"/api/programme/flats/{no['id']}/readings", headers=th))}
    assert rd["2026-08"]["source"] == "uploaded" and rd["2026-09"]["source"] == "uploaded"
    # withdrawal stops further loads and is logged
    ok(client.post(f"/api/programme/flats/{no['id']}/data-consent", headers=th, json={"given": False}))
    r = client.post(f"/api/programme/flats/{no['id']}/readings", headers=H("provider"), json=body)
    assert r.status_code == 409
    log = ok(client.get("/api/programme/audit-log", headers=H("manager")))
    assert any(e["action"] == "data_consent.withdrawn" for e in log)


def test_utility_readings_rejected_without_consent(client, H):
    meters = ok(client.get("/api/utility/meters", headers=H("distributor")))
    with_c = next(m for m in meters if m["data_consent"] and m["charge_status"] == "active")
    without = next(m for m in meters if not m["data_consent"])
    csv = ("meter_id,month,electricity_kwh,gas_mj\n"
           f"{with_c['meter_id']},2026-09,180,0\n{without['meter_id']},2026-09,180,0\nNMI-EX-UNKNOWN,2026-09,1,0\n")
    res = ok(client.post("/api/utility/readings", headers={**H("distributor"), "Content-Type": "text/csv"}, content=csv))
    assert res["accepted"] == 1
    reasons = {r["row"]: r["reason"] for r in res["rejected"]}
    assert reasons[2] == "no current data consent" and "unknown meter" in reasons[3]
    fid = next(f["id"] for f in flats(client, H, with_c["project_id"]) if f["meter_id"] == with_c["meter_id"])
    rd = {r["month"]: r for r in ok(client.get(f"/api/programme/flats/{fid}/readings", headers=H("manager")))}
    assert rd["2026-09"]["source"] == "utility"
    # simulated data never overwrites utility data
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 1}))
    rd = {r["month"]: r for r in ok(client.get(f"/api/programme/flats/{fid}/readings", headers=H("manager")))}
    assert rd["2026-09"]["source"] == "utility" and rd["2026-10"]["source"] == "simulated"


def test_data_consent_does_not_carry_to_new_tenant(client, H):
    p = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    f = next(f for f in flats(client, H, p["id"]) if f["participating"])
    give_data_consent(f["id"])
    ok(client.post(f"/api/programme/flats/{f['id']}/tenancy-change", headers=H("manager"),
                   json={"new_tenant_name": "New Person", "date": "2026-10-01"}))
    assert not ok(client.get(f"/api/programme/flats/{f['id']}/data-consent", headers=H("manager")))["active"]
