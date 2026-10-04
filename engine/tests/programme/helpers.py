"""Drive a new project through the pipeline over HTTP."""
from programme import db

NEW_BUILDING = "b_000284"


def org_id(client, H, kind: str) -> int:
    return next(o["id"] for o in client.get("/api/programme/orgs", headers=H("manager")).json() if o["kind"] == kind)


def ok(r, code=200):
    assert r.status_code == code, f"{r.status_code}: {r.text[:500]}"
    return r.json()


def create(client, H, building=NEW_BUILDING, **body):
    return ok(client.post("/api/programme/projects", headers=H("manager"),
                          json={"building_id": building, "owner_org_id": org_id(client, H, "community_housing"), **body}))


def advance(client, H, pid, to, **kw):
    return client.post(f"/api/programme/projects/{pid}/advance", headers=H("manager"), json={"to": to, **kw})


def to_consent(client, H, pid, audit=None):
    ok(client.put(f"/api/programme/projects/{pid}/audit", headers=H("provider"),
                  json=audit or {"roof_condition": "sound", "switchboard_amps": 63}))
    ok(advance(client, H, pid, "offer"))
    ok(advance(client, H, pid, "consent"))


def consent_all(client, H, pid, decline=0):
    from .conftest import tenant_headers
    ok(client.post(f"/api/programme/projects/{pid}/consent/owner", headers=H("provider"),
                   json={"signed": True, "name": "Priya Raman"}))
    flats = ok(client.get(f"/api/programme/projects/{pid}/flats", headers=H("manager")))
    for i, f in enumerate(flats):
        c = "declined" if i < decline else "agreed"
        ok(client.post(f"/api/programme/flats/{f['id']}/consent", headers=tenant_headers(client, f["id"]),
                       json={"consent": c}))
    return flats


def tender_and_quote(client, H, pid, factor=1.0, installer="installer"):
    ok(client.post(f"/api/programme/projects/{pid}/tender", headers=H("manager"),
                   json={"installer_org_ids": [org_id(client, H, "installer")], "closes_on": "2026-12-01"}))
    t = next(t for t in ok(client.get("/api/programme/tenders", headers=H(installer))) if t["project"]["id"] == pid)
    items = [{"key": i["key"], "qty": i["qty"], "unit_price": round(i["modelled_unit_price"] * factor, 2)}
             for i in t["items"]]
    return ok(client.post(f"/api/programme/projects/{pid}/quotes", headers=H(installer),
                          json={"items": items, "valid_until": "2026-12-31", "note": "test"}))


def build_active(client, H, term_years=1, decline=0, factor=1.0):
    """New project taken all the way to an active charge. Returns the project detail."""
    p = create(client, H, finance={"term_years": term_years})
    pid = p["id"]
    to_consent(client, H, pid)
    consent_all(client, H, pid, decline=decline)
    ok(advance(client, H, pid, "procurement"))
    q = tender_and_quote(client, H, pid, factor)
    d = ok(client.post(f"/api/programme/quotes/{q['id']}/accept", headers=H("manager")))
    gap = d["deal"]["funding_gap"]
    if d["deal"]["gap_uncovered"] > 0.5:
        ok(client.patch(f"/api/programme/projects/{pid}", headers=H("manager"), json={"grant_allocated": round(gap + 1)}))
    ok(advance(client, H, pid, "installation"))
    wo = ok(client.post(f"/api/programme/projects/{pid}/work-order", headers=H("manager"),
                        json={"scheduled_start": "2026-10-10"}))
    for c in wo["checklist"]:
        ok(client.post(f"/api/programme/work-orders/{wo['id']}/checklist", headers=H("installer"),
                       json={"key": c["key"], "done": True}))
    ok(advance(client, H, pid, "commissioned"))
    return ok(advance(client, H, pid, "active"))


def flats(client, H, pid):
    return ok(client.get(f"/api/programme/projects/{pid}/flats", headers=H("manager")))


def give_data_consent(fid):
    from programme import ledger as L
    from programme.auth import Principal
    with db.tx():
        L.data_consent_set(Principal(role="manager", name="m", user_id=1), fid,
                           {"given": True, "note": "signed form (test)"})
