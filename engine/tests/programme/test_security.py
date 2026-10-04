"""Sign-in, sessions, MFA, lockout, headers, audit chain, CSV injection, privacy routes."""
import time

import pytest

from programme import auth, db, ledger as L
from .conftest import EMAILS, PASSWORD, login
from .helpers import ok


def test_login_me_logout(client):
    h = login(client, EMAILS["manager"])
    me = ok(client.get("/api/auth/me", headers=h))
    assert me["role"] == "manager" and me["org"]["kind"] == "council" and me["session_idle_minutes"] == 30
    ok(client.post("/api/auth/logout", headers=h, json={}))
    r = client.get("/api/auth/me", headers=h)
    assert r.status_code == 401 and r.json()["code"] == "unauthorized"


def test_no_token_and_bad_token(client):
    assert client.get("/api/programme/projects").status_code == 401
    assert client.get("/api/programme/projects", headers={"Authorization": "Bearer v1.abc.def"}).status_code == 401


def test_idle_and_absolute_expiry(client):
    h = login(client, EMAILS["funder"])
    with db.tx():
        db.ex("UPDATE sessions SET last_seen = last_seen - 31 * 60")
    r = client.get("/api/auth/me", headers=h)
    assert r.status_code == 401 and "30 minutes" in r.json()["detail"]
    with db.tx():
        sid = db.q1("SELECT id FROM sessions ORDER BY created DESC LIMIT 1")["id"]
        expired = auth.sign({"typ": "session", "sid": sid, "exp": int(time.time()) - 1})
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401 and "12-hour" in r.json()["detail"]


def test_lockout_after_five_failures(client):
    for _ in range(5):
        r = client.post("/api/auth/login", json={"email": EMAILS["funder"], "password": "wrong-password-123"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"email": EMAILS["funder"], "password": PASSWORD})
    assert r.status_code == 401 and r.json().get("locked") is True
    log = ok(client.get("/api/programme/audit-log", headers=login(client, EMAILS["manager"])))
    assert sum(1 for e in log if e["action"] == "auth.login_failed") >= 5
    assert all(EMAILS["funder"] not in (e["detail"] or "") for e in log)  # no email in the log


def test_rate_limit_per_ip(client):
    auth.reset_rate_limits()
    codes = [client.post("/api/auth/tenant", json={"code": "FLAT-NOPE"}).status_code for _ in range(auth.RATE_MAX + 2)]
    assert codes[-1] == 429 and 401 in codes


def test_password_policy():
    assert auth.password_problems("short")
    assert auth.password_problems("passwordpassword")
    assert auth.password_problems("alexalexalexalex1", "alexalex@x.org")
    assert not auth.password_problems("Penrith-demo-2026!", "manager@meterwise.example")
    h = auth.hash_password("Penrith-demo-2026!")
    assert h.startswith("scrypt$") and auth.check_password("Penrith-demo-2026!", h) and not auth.check_password("x", h)
    with db.tx(), pytest.raises(Exception):
        auth.create_user("X", "x@y.org", "manager", None, "password123")


def test_mfa_flow(client):
    h = login(client, EMAILS["agency"])
    s = ok(client.post("/api/auth/mfa/setup", headers=h, json={}))
    assert s["otpauth_uri"].startswith("otpauth://totp/")
    r = client.post("/api/auth/mfa/verify", headers=h, json={"code": "000000"})
    assert r.status_code == 400
    ok(client.post("/api/auth/mfa/verify", headers=h, json={"code": auth.totp(s["secret"])}))
    # the password alone is no longer enough
    r = ok(client.post("/api/auth/login", json={"email": EMAILS["agency"], "password": PASSWORD}))
    assert r["mfa_required"] and r["ticket"] and "token" not in r
    bad = client.post("/api/auth/mfa/login", json={"ticket": r["ticket"], "code": "123456"})
    assert bad.status_code == 401
    step = int(time.time() // 30) + 1  # next step: the current one was used to enable (replay refused)
    tok = ok(client.post("/api/auth/mfa/login", json={"ticket": r["ticket"], "code": auth.totp(s["secret"], step)}))
    assert ok(client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok['token']}"}))["mfa_enabled"]
    ctl = ok(client.get("/api/government/controls", headers=login(client, EMAILS["council"])))
    assert ctl["mfa_enforced"] is False and ctl["accounts_without_mfa"] > 0


def test_mfa_required_outside_demo(client, monkeypatch):
    monkeypatch.setenv("METERWISE_DEMO", "0")
    r = ok(client.post("/api/auth/login", json={"email": EMAILS["manager"], "password": PASSWORD}))
    assert r["mfa_required"] and r["mfa_enrolled"] is False
    s = ok(client.post("/api/auth/mfa/setup", json={"ticket": r["ticket"]}))
    out = ok(client.post("/api/auth/mfa/verify", json={"ticket": r["ticket"], "code": auth.totp(s["secret"])}))
    assert out["token"]
    assert client.get("/api/auth/demo-users").status_code == 404
    assert client.post("/api/sim/advance", headers={"Authorization": f"Bearer {out['token']}"},
                       json={"months": 1}).status_code == 403


def test_refuses_default_secret_outside_demo(monkeypatch):
    monkeypatch.setenv("METERWISE_DEMO", "0")
    monkeypatch.delenv("METERWISE_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        auth.check_startup_secret()
    monkeypatch.setenv("METERWISE_SECRET", "change-me")
    with pytest.raises(RuntimeError):
        auth.check_startup_secret()
    monkeypatch.setenv("METERWISE_SECRET", "x" * 40)
    auth.check_startup_secret()


def test_oidc_not_configured_returns_501(client):
    r = client.get("/api/auth/oidc/callback")
    assert r.status_code == 501 and "not configured" in r.json()["detail"]


def test_security_headers_everywhere(client):
    for path in ("/api/health", "/api/meta", "/.well-known/security.txt", "/api/programme/projects"):
        r = client.get(path)
        h = r.headers
        assert "frame-ancestors 'none'" in h["content-security-policy"]
        assert "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com;" in h["content-security-policy"]
        assert h["x-content-type-options"] == "nosniff" and "max-age" in h["strict-transport-security"]
        assert h["referrer-policy"] and h["permissions-policy"] and h["x-request-id"]
        if path.startswith("/api/"):
            assert h["cache-control"] == "no-store"
    assert "Contact:" in client.get("/.well-known/security.txt").text
    assert ok(client.get("/api/ready"))["ready"] is True


def test_upload_size_limit(client, H):
    r = client.post("/api/utility/readings", headers={**H("distributor"), "Content-Type": "text/csv"},
                    content="x" * 2_100_000)
    assert r.status_code == 413


def test_audit_chain_verify_and_tamper_detection(client, H):
    v = ok(client.get("/api/programme/audit-log/verify", headers=H("manager")))
    assert v["ok"] and v["entries"] > 50
    with db.tx():
        with pytest.raises(Exception):
            db.ex("UPDATE audit_log SET detail = 'x' WHERE id = 3")
    with db.tx():
        db.ex("DROP TRIGGER audit_log_no_update")
        db.ex("UPDATE audit_log SET detail = 'tampered' WHERE id = 5")
    v = ok(client.get("/api/programme/audit-log/verify", headers=H("manager")))
    assert not v["ok"] and v["first_bad_id"] == 5
    assert client.get("/api/programme/audit-log/verify", headers=H("funder")).status_code == 403


def test_csv_formula_injection_neutralised(client, H):
    assert L.csv_cell("=HYPERLINK(1)") == "'=HYPERLINK(1)" and L.csv_cell("+1") == "'+1" and L.csv_cell("ok") == "ok"
    pid = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[0]["id"]
    f = ok(client.get(f"/api/programme/projects/{pid}/flats", headers=H("manager")))[0]
    ok(client.post(f"/api/programme/flats/{f['id']}/tenancy-change", headers=H("manager"),
                   json={"new_tenant_name": "=cmd|' /C calc'!A0", "date": "2026-10-01"}))
    text = client.get("/api/programme/billing/export", headers=H("manager")).text
    assert "'=cmd" in text and "\n=cmd" not in text and ",=cmd" not in text


def test_personal_data_export_and_erase(client, H):
    pid = client.get("/api/programme/projects", params={"stage": "active"}, headers=H("manager")).json()[1]["id"]
    f = ok(client.get(f"/api/programme/projects/{pid}/flats", headers=H("manager")))[1]
    exp = ok(client.get(f"/api/programme/flats/{f['id']}/personal-data", headers=H("provider")))
    assert len(exp["tenancies"]) >= 2 and exp["ledger"]
    assert client.get(f"/api/programme/flats/{f['id']}/personal-data", headers=H("funder")).status_code == 403
    from .conftest import tenant_headers
    mine = ok(client.get(f"/api/programme/flats/{f['id']}/personal-data", headers=tenant_headers(client, f["id"])))
    assert "tenancies" not in mine and mine["tenancy"]["tenant_name"]
    out = ok(client.post(f"/api/programme/flats/{f['id']}/personal-data/erase", headers=H("provider"), json={}))
    assert out["tenancies_erased"] >= 1
    exp2 = ok(client.get(f"/api/programme/flats/{f['id']}/personal-data", headers=H("manager")))
    assert [t["tenant_name"] for t in exp2["tenancies"] if not t["active"]] == ["Former tenant"] * out["tenancies_erased"]
    assert len(exp2["ledger"]) == len(exp["ledger"])
    log = ok(client.get("/api/programme/audit-log", headers=H("manager")))
    assert {"personal_data.export", "personal_data.erase"} <= {e["action"] for e in log}


def test_demo_users_route(client, monkeypatch):
    assert client.get("/api/auth/demo-users").status_code == 404  # off by default
    monkeypatch.setenv("METERWISE_LIST_ACCOUNTS", "1")
    users = ok(client.get("/api/auth/demo-users"))
    roles = {u["role"] for u in users}
    assert {"manager", "government", "utility", "owner", "installer", "funder", "tenant"} <= roles
    assert all(u["example"] for u in users)
    code = next(u["code"] for u in users if u["role"] == "tenant")
    ok(client.post("/api/auth/tenant", json={"code": code}))


def test_docs_switch(monkeypatch):
    from api.main import _docs_enabled
    monkeypatch.delenv("METERWISE_DOCS", raising=False)
    monkeypatch.setenv("METERWISE_DEMO", "0")
    assert _docs_enabled() is False
    monkeypatch.setenv("METERWISE_DOCS", "1")
    assert _docs_enabled() is True
    monkeypatch.setenv("METERWISE_DEMO", "1")
    monkeypatch.setenv("METERWISE_DOCS", "0")
    assert _docs_enabled() is False


def test_no_demo_wording_in_user_facing_responses(client, H):
    import json as _j
    from programme import db as _db
    banned = ("(example)", "demo", "prototype", "fictional", "simulated report", "(simulated)", "demonstration")
    paths = ["/api/programme", "/api/programme/overview", "/api/programme/projects", "/api/programme/faults",
             "/api/programme/reserve", "/api/government/outcomes", "/api/government/controls", "/api/government/grants",
             "/api/utility/summary", "/api/utility/meters", "/api/programme/orgs", "/api/auth/me", "/api/sim/clock"]
    with _db.tx():
        pids = [r["id"] for r in _db.q("SELECT id FROM projects")]
    paths += [f"/api/programme/projects/{i}" for i in pids]
    for path in paths:
        who = "distributor" if path.startswith("/api/utility") else "manager"
        text = client.get(path, headers=H(who)).text.lower()
        hit = [b for b in banned if b in text]
        assert not hit, (path, hit)
    with _db.tx():
        names = [r["name"] for r in _db.q("SELECT name FROM orgs")] + [r["name"] for r in _db.q("SELECT name FROM users")]
    assert all("xample" not in n for n in names)


def test_docs_switch(monkeypatch):
    from api.main import _docs_enabled
    monkeypatch.delenv("METERWISE_DOCS", raising=False)
    monkeypatch.setenv("METERWISE_DEMO", "0")
    assert _docs_enabled() is False
    monkeypatch.setenv("METERWISE_DOCS", "1")
    assert _docs_enabled() is True
    monkeypatch.setenv("METERWISE_DEMO", "1")
    monkeypatch.setenv("METERWISE_DOCS", "0")
    assert _docs_enabled() is False


def test_no_demo_wording_in_user_facing_responses(client, H):
    from programme import db as _db
    banned = ("(example)", "demo", "prototype", "fictional", "simulated report", "(simulated)", "demonstration")
    paths = ["/api/programme", "/api/programme/overview", "/api/programme/projects", "/api/programme/faults",
             "/api/programme/reserve", "/api/government/outcomes", "/api/government/controls", "/api/government/grants",
             "/api/utility/summary", "/api/utility/meters", "/api/programme/orgs", "/api/auth/me", "/api/sim/clock"]
    with _db.tx():
        pids = [r["id"] for r in _db.q("SELECT id FROM projects")]
    paths += [f"/api/programme/projects/{i}" for i in pids]
    for path in paths:
        who = "distributor" if path.startswith("/api/utility") else "manager"
        text = client.get(path, headers=H(who)).text.lower()
        hit = [b for b in banned if b in text]
        assert not hit, (path, hit)
    with _db.tx():
        names = [r["name"] for r in _db.q("SELECT name FROM orgs")] + [r["name"] for r in _db.q("SELECT name FROM users")]
    assert all("xample" not in n for n in names)
