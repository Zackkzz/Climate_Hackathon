"""Documents, simulated clock determinism, overview figures and contract shapes."""
import os
import shutil

from programme import db
from .conftest import _use, tenant_headers
from .helpers import flats, ok

NOTICE = "Example document produced by a prototype. Not legal or financial advice."


def test_every_document_renders_with_key_figures(client, H):
    a = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    pid = a["id"]
    docs = ok(client.get(f"/api/programme/projects/{pid}/documents", headers=H("manager")))
    kinds = {d["kind"] for d in docs}
    assert kinds == {"tenant_disclosure", "owner_agreement", "funder_term_sheet", "charge_schedule",
                     "commissioning_certificate", "mv_report"}
    f = next(x for x in flats(client, H, pid) if x["participating"])
    for d in docs:
        r = client.get(d["url"], headers=H("manager"))
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/html"), d
        html = r.text
        assert NOTICE in html and "@page" in html and "<script" not in html and "http" not in html.split("<style>")[1].split("</style>")[0]
    disc = client.get(f"/api/programme/documents/{pid}/tenant_disclosure.html?flat_id={f['id']}", headers=H("manager")).text
    charge = f"${f['charge_per_month']:,.2f}"
    for s in (charge, "What is installed", "What you pay", "What you are expected to save", "What is guaranteed",
              "If something breaks", "If you move out", "How to complain", "not a loan", "meter data", f["meter_id"]):
        assert s in disc, s
    sched = client.get(f"/api/programme/documents/{pid}/charge_schedule.html?flat_id={f['id']}", headers=H("manager")).text
    assert a["charge_start"] in sched
    oa = client.get(f"/api/programme/documents/{pid}/owner_agreement.html", headers=H("provider")).text
    assert "Route A" in oa and f"${a['summary']['net_capex']:,.0f}" in oa
    cc = client.get(f"/api/programme/documents/{pid}/commissioning_certificate.html", headers=H("installer")).text
    assert "Every checklist item is done." in cc
    assert client.get(f"/api/programme/documents/{pid}/tenant_disclosure.html?flat_id={f['id']}",
                      headers=H("funder")).status_code == 403
    th = tenant_headers(client, f["id"])
    assert client.get(f"/api/programme/documents/{pid}/tenant_disclosure.html", headers=th).status_code == 200


def _advance_copy(client, H, template_db, name):
    path = os.path.join(os.path.dirname(template_db), name)
    db._conn.close()
    db._conn = None
    shutil.copy(template_db, path)
    _use(path)
    from programme import auth
    auth.reset_rate_limits()
    h = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": "manager@meterwise.example",
                                                                           "password": "Penrith-demo-2026!"}).json()["token"]}
    res = ok(client.post("/api/sim/advance", headers=h, json={"months": 4, "scenario": "mixed"}))
    with db.tx():
        sums = db.q("SELECT kind, COUNT(*) AS n, ROUND(SUM(amount), 2) AS s FROM ledger GROUP BY kind ORDER BY kind")
        rd = db.q("SELECT COUNT(*) AS n, ROUND(SUM(electricity_kwh), 1) AS s FROM readings")
        rs = db.q1("SELECT balance_after FROM reserve ORDER BY id DESC LIMIT 1")
    res.pop("clock")
    return res, sums, rd, rs


def test_sim_advance_is_deterministic(client, H, template_db):
    a = _advance_copy(client, H, template_db, "detA.db")
    b = _advance_copy(client, H, template_db, "detB.db")
    assert a == b
    assert a[0]["billing_runs"] == 4 and a[0]["readings_added"] > 0 and a[0]["payments"] > 0
    assert a[0]["month"] == "2027-02"


def test_sim_clock_and_reset(client, H):
    c = ok(client.get("/api/sim/clock", headers=H("manager")))
    assert c == {"now": c["now"], "month": "2026-10", "offset_months": 0}
    assert client.post("/api/sim/advance", headers=H("manager"), json={"months": 40}).status_code == 400
    ok(client.post("/api/sim/advance", headers=H("manager"), json={"months": 2}))
    assert ok(client.get("/api/sim/clock", headers=H("manager")))["offset_months"] == 2
    out = ok(client.post("/api/sim/reset", headers=H("manager")))
    assert out["clock"]["offset_months"] == 0 and out["projects"] == 11
    # still signed in after a reset
    assert client.get("/api/auth/me", headers=H("manager")).status_code == 200


def test_overview_is_computed_from_ledgers(client, H):
    o = ok(client.get("/api/programme/overview", headers=H("funder")))
    with db.tx():
        collected = -db.q1("SELECT SUM(amount) AS s FROM ledger WHERE kind = 'payment'")["s"]
        reserve = db.q1("SELECT balance_after FROM reserve ORDER BY id DESC LIMIT 1")["balance_after"]
    assert abs(o["money"]["collected"] - round(collected, 2)) < 0.01
    assert o["money"]["reserve"] == reserve == o["programme"]["reserve_balance"]
    assert sum(o["pipeline"].values()) == 11 and all(o["pipeline"][s] >= 1 for s in
                                                     ("screened", "audit", "offer", "consent", "procurement",
                                                      "installation", "commissioned", "active"))
    assert o["monthly"] and o["monthly"][-1]["month"] == "2026-10"
    assert o["verified"]["projects"] == 2 and o["flats"]["paused"] >= 1
    before = o["money"]["collected"]
    a = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]
    f = flats(client, H, a["id"])[0]
    ok(client.post(f"/api/programme/flats/{f['id']}/payments", headers=H("manager"), json={"amount": 12.5}))
    assert ok(client.get("/api/programme/overview", headers=H("manager")))["money"]["collected"] == round(before + 12.5, 2)


PROGRAMME_KEYS = {"id", "name", "example", "route", "route_status", "finance", "capital_committed", "capital_deployed",
                  "grant_pool", "grant_used", "reserve_balance", "repaid_to_date", "arrears"}
PROJECT_KEYS = {"id", "programme_id", "building_id", "label", "stage", "stage_since", "owner_org", "installer_org",
                "flats", "heat_band", "summary", "consent", "next_step", "blocked_by", "flags"}
DETAIL_KEYS = {"building", "existing", "package", "finance", "tariff", "assessment", "sizing", "schedule", "audit",
               "quotes", "work_order", "flats_list", "stage_history", "mv"}
FLAT_KEYS = {"id", "project_id", "unit", "position", "meter_id", "tenant_name", "tenancy_start", "consent",
             "charge_per_month", "charge_status", "paused_reason", "balance_owing", "principal_remaining", "months_billed"}
LEDGER_KEYS = {"id", "flat_id", "month", "at", "kind", "amount", "balance_after", "note"}
FAULT_KEYS = {"id", "flat_id", "project_id", "item", "description", "reported_by", "opened_on", "resolved_on",
              "status", "charge_paused", "months_paused"}
RESERVE_KEYS = {"id", "at", "month", "kind", "amount", "balance_after", "project_id", "note"}


def test_contract_shapes(client, H):
    assert PROGRAMME_KEYS <= set(ok(client.get("/api/programme", headers=H("manager"))))
    ps = ok(client.get("/api/programme/projects", headers=H("manager")))
    assert all(PROJECT_KEYS <= set(p) for p in ps)
    summary_keys = {"net_capex", "funding_gap", "grant_allocated", "fully_funded", "charge_per_month_building",
                    "tenant_net_saving_per_month", "co2e_t_per_year_saved"}
    assert all(summary_keys <= set(p["summary"]) for p in ps)
    a = next(p for p in ps if p["stage"] == "active")
    d = ok(client.get(f"/api/programme/projects/{a['id']}", headers=H("manager")))
    assert DETAIL_KEYS <= set(d) and all(FLAT_KEYS | {"access_code"} <= set(f) for f in d["flats_list"])
    assert d["quotes"] and {"id", "project_id", "installer_org", "items", "total", "modelled_total", "status"} <= set(d["quotes"][0])
    assert {"id", "checklist", "warranty_years", "completed_on"} <= set(d["work_order"])
    f = d["flats_list"][0]
    assert all(LEDGER_KEYS <= set(e) for e in ok(client.get(f"/api/programme/flats/{f['id']}/ledger", headers=H("manager"))))
    assert all(FAULT_KEYS <= set(x) for x in ok(client.get("/api/programme/faults", headers=H("manager"))))
    assert all(RESERVE_KEYS <= set(x) for x in ok(client.get("/api/programme/reserve", headers=H("manager")))["entries"])
    ov = ok(client.get("/api/programme/overview", headers=H("manager")))
    assert {"programme", "pipeline", "flats", "money", "verified", "modelled", "monthly"} <= set(ov)
    assert {"deployed", "repaid", "interest", "arrears", "reserve", "grant_used"} <= set(ov["money"])
    me = ok(client.get("/api/auth/me", headers=H("installer")))
    assert {"id", "name", "email", "role", "org"} <= set(me)
    t = tenant_headers(client, f["id"])
    assert set(ok(client.get("/api/auth/me", headers=t))) >= {"role", "flat_id", "project_id"}
    mf = ok(client.get("/api/programme/my-flat", headers=t))
    assert {"flat", "project", "deal", "verified", "ledger", "faults", "documents", "protections"} <= set(mf)
    r = client.post("/api/programme/projects/9999/advance", headers=H("manager"), json={"to": "audit"})
    assert r.status_code == 404 and set(r.json()) >= {"detail", "code"}
