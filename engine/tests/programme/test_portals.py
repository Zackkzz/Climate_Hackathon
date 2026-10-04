"""Role scoping on every route family, masking, utility, government and property portals."""
import json

import pytest

from programme import db
from .conftest import tenant_headers
from .helpers import flats, ok

TENANT_NAMES = None


def _tenant_names(client, H):
    with db.tx():
        return [t["tenant_name"] for t in db.q("SELECT tenant_name FROM tenancies")] + ["Newcomer"]


def _assert_no_personal(text: str, names: list[str]):
    for n in names:
        assert n not in text, f"tenant name {n!r} leaked"
    assert "FLAT-" not in text, "access code leaked"
    for k in ('"kind":"charge"', '"kind":"payment"', '"kind":"pause_credit"', "tenancy_id"):
        assert k not in text, "ledger leaked"


def test_no_tenant_data_for_utility_government_funder_installer(client, H):
    names = _tenant_names(client, H)
    a = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    pid = a["id"]
    checks = {
        "funder": ["/api/programme", "/api/programme/overview", "/api/programme/projects", f"/api/programme/projects/{pid}",
                   f"/api/programme/projects/{pid}/flats", "/api/programme/reserve", f"/api/programme/projects/{pid}/mv",
                   f"/api/programme/documents/{pid}/funder_term_sheet.html",
                   f"/api/programme/documents/{pid}/mv_report.html"],
        "agency": ["/api/government/outcomes", "/api/government/areas", "/api/government/grants",
                   "/api/government/reports/charges.csv", "/api/government/reports/projects.csv",
                   "/api/government/reports/verified_savings.csv", f"/api/programme/projects/{pid}",
                   "/api/programme/overview", "/api/government/controls", "/api/government/routes"],
        "distributor": ["/api/utility/summary", "/api/utility/meters", "/api/utility/network-impact",
                        "/api/utility/readings/template.csv", "/api/utility/charge-file",
                        "/api/utility/gas-disconnections", "/api/utility/supply-requests"],
        "installer": ["/api/programme/tenders", "/api/programme/faults", "/api/programme/projects",
                      f"/api/programme/projects/{pid}"],
    }
    for who, paths in checks.items():
        for path in paths:
            r = client.get(path, headers=H(who))
            assert r.status_code in (200, 403), (who, path, r.status_code, r.text[:200])
            if r.status_code == 200:
                _assert_no_personal(r.text, names)


def test_masking_meter_ids_and_units(client, H):
    a = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    fl_f = ok(client.get(f"/api/programme/projects/{a['id']}/flats", headers=H("funder")))
    assert all(f["meter_id"].startswith("NMI-...") and len(f["meter_id"]) == 11 for f in fl_f)
    assert all(f["unit"] is None and f["tenant_name"] is None and "access_code" not in f for f in fl_f)
    fl_m = ok(client.get(f"/api/programme/projects/{a['id']}/flats", headers=H("manager")))
    assert all(f["meter_id"].startswith("NMI-EX-") and f["tenant_name"] and f["access_code"] for f in fl_m)
    d = ok(client.get(f"/api/programme/projects/{a['id']}", headers=H("agency")))
    assert all(f["meter_id"].startswith("NMI-...") for f in d["flats_list"])
    # utility sees its own meters in full but block-level addresses only
    ms = ok(client.get("/api/utility/meters", headers=H("distributor")))
    assert ms and all(m["meter_id"].startswith("NMI-EX-") and "/" not in m["address"] for m in ms)
    log = ok(client.get("/api/programme/audit-log", headers=H("manager")))
    assert any(e["action"] == "personal_data.read" for e in log)


def test_owner_and_installer_org_scoping(client, H):
    ps = client.get("/api/programme/projects", headers=H("manager")).json()
    landlord_ids = {p["id"] for p in client.get("/api/programme/projects", headers=H("landlord")).json()}
    other = next(p for p in ps if p["id"] not in landlord_ids)
    assert client.get(f"/api/programme/projects/{other['id']}", headers=H("landlord")).status_code == 403
    assert client.put(f"/api/programme/projects/{other['id']}/audit", headers=H("landlord"), json={}).status_code == 403
    fl = flats(client, H, other["id"])
    assert client.get(f"/api/programme/flats/{fl[0]['id']}/ledger", headers=H("landlord")).status_code == 403
    assert client.post(f"/api/programme/flats/{fl[0]['id']}/tenancy-change", headers=H("landlord"),
                       json={"new_tenant_name": "x", "date": "2026-10-01"}).status_code == 403
    inst_ids = {p["id"] for p in client.get("/api/programme/projects", headers=H("installer")).json()}
    hidden = next(p for p in ps if p["id"] not in inst_ids)
    assert client.get(f"/api/programme/projects/{hidden['id']}", headers=H("installer")).status_code == 403
    # manager-only routes
    for who in ("provider", "funder", "installer", "distributor", "agency"):
        assert client.post("/api/programme/billing/run", headers=H(who), json={}).status_code == 403
        assert client.get("/api/programme/orgs", headers=H(who)).status_code == 403
        assert client.post("/api/sim/advance", headers=H(who), json={"months": 1}).status_code == 403
    # default deny on portal families
    assert client.get("/api/utility/summary", headers=H("funder")).status_code == 403
    assert client.get("/api/government/outcomes", headers=H("distributor")).status_code == 403
    assert client.get("/api/property/summary", headers=H("agency")).status_code == 403


def test_tenant_scope(client, H):
    a = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    fl = flats(client, H, a["id"])
    th = tenant_headers(client, fl[0]["id"])
    me = ok(client.get("/api/programme/my-flat", headers=th))
    assert me["flat"]["id"] == fl[0]["id"] and me["deal"]["installed"] and me["protections"]
    assert me["deal"]["term_ends"] and "data_consent" in me
    assert client.get(f"/api/programme/flats/{fl[1]['id']}/ledger", headers=th).status_code == 403
    assert client.get(f"/api/programme/projects/{a['id']}/flats", headers=th).status_code == 403
    assert client.get("/api/programme/overview", headers=th).status_code == 403
    assert client.get("/api/utility/meters", headers=th).status_code == 403
    docs = me["documents"]
    assert docs and all(d["flat_id"] in (None, fl[0]["id"]) for d in docs)
    assert client.get(f"/api/programme/documents/{a['id']}/tenant_disclosure.html?flat_id={fl[1]['id']}",
                      headers=th).status_code == 403


def test_retailer_sees_only_its_customers(client, H):
    dist = ok(client.get("/api/utility/meters", headers=H("distributor")))
    ret = ok(client.get("/api/utility/meters", headers=H("retailer")))
    assert 0 < len(ret) < len(dist) and {m["meter_id"] for m in ret} <= {m["meter_id"] for m in dist}
    gas = ok(client.get("/api/utility/gas-disconnections", headers=H("gas")))
    assert gas and any(g["status"] == "scheduled" for g in gas)
    assert ok(client.get("/api/utility/gas-disconnections", headers=H("distributor"))) == []
    g = next(g for g in gas if g["status"] == "scheduled")
    r = client.post(f"/api/utility/gas-disconnections/{g['id']}", headers=H("distributor"), json={"status": "completed"})
    assert r.status_code == 403
    done = ok(client.post(f"/api/utility/gas-disconnections/{g['id']}", headers=H("gas"), json={"status": "completed"}))
    assert done["completed_on"]
    r = client.post(f"/api/utility/gas-disconnections/{g['id']}", headers=H("gas"), json={"status": "scheduled"})
    assert r.status_code == 409


def test_utility_summary_network_charge_file_and_remittance(client, H):
    s = ok(client.get("/api/utility/summary", headers=H("distributor")))
    assert s["meters"]["total"] > 0 and s["open"]["supply_requests"] >= 1 and "peak_kw_before" in s["network"]
    ni = ok(client.get("/api/utility/network-impact", headers=H("distributor")))
    assert ni["by_project"] and "Not a network study" in ni["basis"]
    cf = client.get("/api/utility/charge-file", headers=H("distributor"))
    assert cf.status_code == 200 and cf.text.startswith("meter_id,amount,status,paused")
    rows = [line.split(",") for line in cf.text.strip().splitlines()[1:]]
    body = {"month": "2026-10", "rows": [{"meter_id": r[0], "amount": float(r[1])} for r in rows[:3]]
            + [{"meter_id": rows[3][0], "amount": float(rows[3][1]) + 5}, {"meter_id": "NMI-X", "amount": 1}]}
    res = ok(client.post("/api/utility/remittance", headers=H("distributor"), json=body))
    assert res["posted"] > 0 and len(res["mismatches"]) == 1 and res["rejected"][0]["reason"] == "unknown meter"
    sr = ok(client.get("/api/utility/supply-requests", headers=H("distributor")))
    up = ok(client.post(f"/api/utility/supply-requests/{sr[0]['id']}", headers=H("distributor"),
                        json={"status": "approved", "response": "Upgrade booked"}))
    assert up["status"] == "approved"


def test_government_outcomes_targets_grants_reports(client, H):
    o = ok(client.get("/api/government/outcomes", headers=H("agency")))
    for k in ("reach", "money", "impact_modelled", "impact_verified", "protections", "targets", "by_area"):
        assert k in o
    assert o["reach"]["flats_upgraded"] > 0 and o["protections"]["true_ups"] > 0
    assert o["targets"] and o["targets"][0]["actual"] == o["reach"]["flats_upgraded"]
    t = ok(client.put("/api/government/targets", headers=H("agency"),
                      json={"targets": [{"key": "grant_spent", "target": 200000, "by": "2028-06"}]}))
    assert t[0]["label"]
    assert client.put("/api/government/targets", headers=H("agency"),
                      json={"targets": [{"key": "nope", "target": 1, "by": "2028-06"}]}).status_code == 400
    gs = ok(client.get("/api/government/grants", headers=H("agency")))
    assert {"requested", "paid", "declined"} <= {g["status"] for g in gs}
    req = next(g for g in gs if g["status"] == "requested")
    assert client.post(f"/api/government/grants/{req['id']}/decide", headers=H("manager"),
                       json={"status": "approved"}).status_code == 403
    d = ok(client.post(f"/api/government/grants/{req['id']}/decide", headers=H("agency"),
                       json={"status": "approved", "approved": req["requested"]}))
    assert d["status"] == "approved"
    p = ok(client.get(f"/api/programme/projects/{req['project_id']}", headers=H("manager")))
    assert p["summary"]["grant_allocated"] == req["requested"]
    for kind in ("projects", "outcomes", "verified_savings", "grants", "charges", "audit_log"):
        r = client.get(f"/api/government/reports/{kind}.csv", headers=H("agency"))
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    a = ok(client.get("/api/government/areas", headers=H("agency")))
    assert len(a["buildings"]) == 358 and any(b["project_stage"] for b in a["buildings"])
    routes = ok(client.get("/api/government/routes", headers=H("agency")))
    assert [r["key"] for r in routes] == ["community_housing", "council_rates", "meter_attached"]
    assert routes[2]["reach_buildings"] == 358 and routes[0]["reach_buildings"] is None
    c = ok(client.get("/api/government/controls", headers=H("agency")))
    assert len(c["controls"]) == 13 and c["data_inventory"]


def test_property_summary_enquiry_and_convert(client, H):
    s = ok(client.get("/api/property/summary", headers=H("landlord")))
    assert s["blocks"] and s["actions"] and "charges" in s
    kinds = {a["kind"] for a in s["actions"]}
    assert "tenant_consent" in kinds or "sign_consent" in kinds
    r = client.post("/api/property/enquiries", json={"name": "A", "email": "bad"})
    assert r.status_code == 400
    e = ok(client.post("/api/property/enquiries", json={"name": "Robin Owner", "email": "robin@example.org",
                                                        "org_kind": "strata", "address": "20 Bringelly Road, Kingswood",
                                                        "flats": 8}))
    lst = ok(client.get("/api/programme/enquiries", headers=H("manager")))
    assert any(x["id"] == e["id"] for x in lst)
    assert client.get("/api/programme/enquiries", headers=H("agency")).status_code == 403
    # 20 Bringelly Road already has an open project, so convert refuses; with another building it works
    r = client.post(f"/api/programme/enquiries/{e['id']}/convert", headers=H("manager"), json={})
    assert r.status_code == 409
    d = ok(client.post(f"/api/programme/enquiries/{e['id']}/convert", headers=H("manager"),
                       json={"building_id": "b_000284"}))
    assert d["stage"] == "screened" and d["owner_org"]["name"].startswith("Robin Owner")
