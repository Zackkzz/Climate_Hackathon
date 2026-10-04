"""Stage pipeline: every guard, audit, consent, quotes, work orders."""
from .conftest import tenant_headers
from .helpers import (advance, consent_all, create, flats, ok, org_id, tender_and_quote, to_consent, build_active)


def test_create_project_generates_flats_and_deal(client, H):
    p = create(client, H)
    assert p["stage"] == "screened" and p["flats"] == len(p["flats_list"]) > 0
    assert all(f["meter_id"].startswith("MW-") and len(f["meter_id"]) == 9 for f in p["flats_list"])
    assert p["summary"]["net_capex"] > 0 and p["next_step"] and p["blocked_by"] == []
    r = client.post("/api/programme/projects", headers=H("manager"),
                    json={"building_id": p["building_id"], "owner_org_id": org_id(client, H, "community_housing")})
    assert r.status_code == 409 and r.json()["code"] == "conflict"
    r = client.post("/api/programme/projects", headers=H("manager"), json={"building_id": "nope", "owner_org_id": 1})
    assert r.status_code == 400 and r.json()["code"] == "validation"


def test_stage_guards_each_stage(client, H):
    pid = create(client, H)["id"]
    # skipping a stage is refused
    r = advance(client, H, pid, "consent")
    assert r.status_code == 409 and r.json()["code"] == "conflict"
    ok(advance(client, H, pid, "audit"))
    r = advance(client, H, pid, "offer")
    assert r.status_code == 409 and r.json()["code"] == "stage_guard"
    assert "No site audit has been saved." in r.json()["unmet"]
    # roof unsuitable with a cool roof in the package
    ok(client.put(f"/api/programme/projects/{pid}/audit", headers=H("provider"), json={"roof_condition": "unsuitable"}))
    r = advance(client, H, pid, "offer")
    assert r.status_code == 409 and "unsuitable" in r.json()["unmet"][0]
    ok(client.put(f"/api/programme/projects/{pid}/audit", headers=H("provider"), json={"roof_condition": "sound"}))
    d = ok(advance(client, H, pid, "offer"))
    assert d["assessment_frozen_on"] and d["schedule"]["groups"] and d["sizing"]
    docs = ok(client.get(f"/api/programme/projects/{pid}/documents", headers=H("manager")))
    assert {"tenant_disclosure", "owner_agreement", "funder_term_sheet", "charge_schedule"} <= {x["kind"] for x in docs}
    ok(advance(client, H, pid, "consent"))
    r = advance(client, H, pid, "procurement")
    assert r.status_code == 409
    unmet = r.json()["unmet"]
    assert any("owner has not signed" in u for u in unmet) and any("tenants have agreed" in u for u in unmet)
    consent_all(client, H, pid)
    ok(advance(client, H, pid, "procurement"))
    r = advance(client, H, pid, "installation")
    assert r.status_code == 409 and "No quote has been accepted." in r.json()["unmet"]
    q = tender_and_quote(client, H, pid, factor=1.0)
    ok(client.post(f"/api/programme/quotes/{q['id']}/accept", headers=H("manager")))
    d = ok(client.get(f"/api/programme/projects/{pid}", headers=H("manager")))
    if d["deal"]["gap_uncovered"] > 0.5:
        r = advance(client, H, pid, "installation")
        assert r.status_code == 409 and "funding gap" in r.json()["unmet"][0]
        ok(client.patch(f"/api/programme/projects/{pid}", headers=H("manager"),
                        json={"grant_allocated": d["deal"]["funding_gap"] + 1}))
    ok(advance(client, H, pid, "installation"))
    r = advance(client, H, pid, "commissioned")
    assert r.status_code == 409 and "No work order" in r.json()["unmet"][0]
    wo = ok(client.post(f"/api/programme/projects/{pid}/work-order", headers=H("manager"), json={}))
    ok(client.post(f"/api/programme/work-orders/{wo['id']}/checklist", headers=H("installer"),
                   json={"key": wo["checklist"][0]["key"], "done": True}))
    r = advance(client, H, pid, "commissioned")
    assert r.status_code == 409 and "checklist items are not done" in r.json()["unmet"][0]
    for c in wo["checklist"]:
        ok(client.post(f"/api/programme/work-orders/{wo['id']}/checklist", headers=H("installer"),
                       json={"key": c["key"], "done": True}))
    ok(advance(client, H, pid, "commissioned"))
    d = ok(advance(client, H, pid, "active"))
    assert d["charge_start"] == "2026-11" and d["stage"] == "active"
    r = advance(client, H, pid, "closed")
    assert r.status_code == 409 and "still have a charge running" in r.json()["unmet"][0]


def test_checklist_matches_package(client, H):
    p = create(client, H, package={"cool_roof": False, "induction_cooktop": True, "disconnect_gas": True})
    from programme import service as S, db
    with db.tx():
        keys = [c["key"] for c in S.checklist_for(S.get_project(p["id"]))]
    assert "roof_coating_thickness" not in keys and "induction_installed" in keys and "gas_capped" in keys
    assert "hpwh_temperature" in keys and "ac_sizing_matches" in keys


def test_audit_corrects_building_and_reassesses(client, H):
    p = create(client, H)
    pid = p["id"]
    d = ok(client.put(f"/api/programme/projects/{pid}/audit", headers=H("provider"),
                      json={"flats": p["flats"] + 2, "roof_m2": 400, "roof_condition": "needs_repair",
                            "existing": {"hot_water": "electric_storage"}}))
    assert d["stage"] == "audit" and d["flats"] == p["flats"] + 2 and len(d["flats_list"]) == p["flats"] + 2
    assert d["building"]["roof_m2"] == 400 and d["existing"]["hot_water"] == "electric_storage"
    fields = {c["field"] for c in d["audit"]["changes"]}
    assert {"flats", "roof_m2", "existing.hot_water"} <= fields
    assert "roof_needs_repair" in d["flags"]
    r = client.put(f"/api/programme/projects/{pid}/audit", headers=H("provider"), json={"roof_condition": "bad"})
    assert r.status_code == 400


def test_declined_flats_get_no_charge_and_share_is_carried(client, H):
    d = build_active(client, H, decline=1)
    fl = flats(client, H, d["id"])
    declined = [f for f in fl if f["consent"] == "declined"]
    assert len(declined) == 1 and declined[0]["charge_per_month"] == 0 and not declined[0]["participating"]
    assert declined[0]["charge_status"] == "not_started"
    assert any(g["declined_share_carried"] > 0 for g in d["deal"]["groups"]) or not d["package"]["cool_roof"]
    # other tenants' charges never exceed their offer
    for f in fl:
        if f["participating"]:
            assert f["charge_per_month"] <= f["offered_charge"] + 1e-6


def test_quote_above_model_opens_gap_and_ceiling_holds(client, H):
    pid = create(client, H)["id"]
    to_consent(client, H, pid)
    consent_all(client, H, pid)
    before = ok(client.get(f"/api/programme/projects/{pid}", headers=H("manager")))
    ok(advance(client, H, pid, "procurement"))
    q = tender_and_quote(client, H, pid, factor=1.5)
    assert q["total"] > q["modelled_total"] and q["difference_from_model"] > 0
    d = ok(client.post(f"/api/programme/quotes/{q['id']}/accept", headers=H("manager")))
    assert d["deal"]["basis"] == "quoted" and d["assessment"]["pricing"]["basis"] == "quoted"
    assert d["deal"]["funding_gap"] > before["deal"]["funding_gap"]
    for g in d["deal"]["groups"]:
        og = next(x for x in d["offer_deal"]["groups"] if x["position"] == g["position"])
        assert g["charge_per_month"] <= og["charge_per_month"] + 1e-6
    r = advance(client, H, pid, "installation")
    assert r.status_code == 409 and r.json()["code"] == "stage_guard"
    # grant pool limit
    r = client.patch(f"/api/programme/projects/{pid}", headers=H("manager"), json={"grant_allocated": 10_000_000})
    assert r.status_code == 409
    ok(client.patch(f"/api/programme/projects/{pid}", headers=H("manager"),
                    json={"grant_allocated": round(d["deal"]["funding_gap"]) + 1}))
    ok(advance(client, H, pid, "installation"))


def test_quote_rules(client, H):
    pid = create(client, H)["id"]
    to_consent(client, H, pid)
    consent_all(client, H, pid)
    ok(advance(client, H, pid, "procurement"))
    ok(client.post(f"/api/programme/projects/{pid}/tender", headers=H("manager"),
                   json={"installer_org_ids": [org_id(client, H, "installer")], "closes_on": "2026-12-01"}))
    # the second installer was not invited
    r = client.post(f"/api/programme/projects/{pid}/quotes", headers=H("installer2"), json={"items": []})
    assert r.status_code == 403
    r = client.post(f"/api/programme/projects/{pid}/quotes", headers=H("installer"),
                    json={"items": [{"key": "cool_roof", "qty": 1, "unit_price": 5}]})
    assert r.status_code == 400 and "Missing" in r.json()["detail"]
    t = ok(client.get("/api/programme/tenders", headers=H("installer")))
    assert any(x["project"]["id"] == pid for x in t)
    assert all(x["project"]["id"] != pid for x in ok(client.get("/api/programme/tenders", headers=H("installer2"))))


def test_strata_consent_needs_resolution(client, H):
    p = client.get("/api/programme/projects", params={"stage": "procurement"}, headers=H("manager")).json()[0]
    d = ok(client.get(f"/api/programme/projects/{p['id']}", headers=H("manager")))
    assert d["owner_resolution"]["votes_for"] > d["owner_resolution"]["votes_against"]
    e = client.get("/api/programme/projects", params={"stage": "consent"}, headers=H("manager")).json()[0]
    assert e["consent"]["tenants_agreed"] < e["consent"]["tenants_total"] * e["consent"]["threshold"]
    assert e["blocked_by"]


def test_tenant_consent_own_flat_only(client, H):
    e = client.get("/api/programme/projects", params={"stage": "consent"}, headers=H("manager")).json()[0]
    fl = flats(client, H, e["id"])
    th = tenant_headers(client, fl[0]["id"])
    r = client.post(f"/api/programme/flats/{fl[1]['id']}/consent", headers=th, json={"consent": "agreed"})
    assert r.status_code == 403
    ok(client.post(f"/api/programme/flats/{fl[0]['id']}/consent", headers=th, json={"consent": "agreed"}))
