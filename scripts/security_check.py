"""Elementary security checks for a running Meterwise server. Self-run basic checks, not a penetration test.

Usage (run against a scratch server and database, because some checks write: a tenancy change, failed sign-ins,
an aged session):

    .venv/Scripts/python scripts/security_check.py --base http://127.0.0.1:8766 --db path/to/that/server.db

``--db`` is the database file the server uses; it is needed for the session-expiry check (ages one session row) and
the audit-tamper check (which works on a copy). Without it those two checks are reported as SKIP.
Exit code 0 when every check passes. Route lists come from the app's own route table (imported from engine/), so
the check still works when /openapi.json is switched off.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))
PASSWORD = "Penrith-demo-2026!"
ACCOUNTS = {
    "manager": "manager@meterwise.example", "government": "agency@meterwise.example",
    "owner": "provider@meterwise.example", "owner_other": "landlord@meterwise.example",
    "funder": "funder@meterwise.example", "installer": "installer@meterwise.example",
    "utility": "distributor@meterwise.example", "utility_retail": "retailer@meterwise.example",
    "utility_gas": "gas@meterwise.example",
}
ROLES = ["manager", "government", "utility", "owner", "installer", "funder", "tenant"]

# Public routes: no token needed. Everything else must answer 401 without a token.
PUBLIC = {
    "/api/health", "/api/ready", "/api/meta", "/api/buildings", "/api/buildings/{building_id}", "/api/assess",
    "/api/portfolio", "/api/sizing", "/api/schedule", "/api/risk", "/api/mv/simulate", "/api/mv/verify",
    "/api/portfolio/plan", "/api/buildings/{building_id}/microclimate", "/api/buildings/{building_id}/weather.epw",
    "/api/auth/login", "/api/auth/tenant", "/api/auth/mfa/setup", "/api/auth/mfa/verify", "/api/auth/mfa/login",
    "/api/auth/demo-users", "/api/auth/oidc/login", "/api/auth/oidc/callback", "/api/auth/oidc/settings",
    "/api/property/enquiries", "/.well-known/security.txt", "/{path:path}", "/docs", "/redoc", "/openapi.json",
    "/docs/oauth2-redirect",
}
ANY = set(ROLES)
STAFF = ANY - {"tenant"}
M, G, O, I, F, U, T = "manager", "government", "owner", "installer", "funder", "utility", "tenant"
# Allowed roles per (method, path). Wrong roles must get 403. "ANY" routes are not role-tested.
ALLOWED = {
    ("GET", "/api/auth/me"): ANY, ("POST", "/api/auth/logout"): ANY,
    ("GET", "/api/programme"): {M, O, F, G}, ("PATCH", "/api/programme"): {M},
    ("GET", "/api/programme/overview"): {M, F, G}, ("GET", "/api/programme/projects"): {M, O, F, I, G},
    ("POST", "/api/programme/projects"): {M}, ("GET", "/api/programme/projects/{pid}"): {M, O, F, I, G},
    ("PATCH", "/api/programme/projects/{pid}"): {M}, ("POST", "/api/programme/projects/{pid}/advance"): {M},
    ("GET", "/api/programme/orgs"): {M}, ("GET", "/api/programme/audit-log"): {M, G},
    ("GET", "/api/programme/audit-log/verify"): {M, G}, ("PUT", "/api/programme/projects/{pid}/audit"): {M, O},
    ("POST", "/api/programme/projects/{pid}/consent/owner"): {M, O}, ("POST", "/api/programme/flats/{fid}/consent"): {M, O, T},
    ("POST", "/api/programme/projects/{pid}/tender"): {M}, ("GET", "/api/programme/tenders"): {I, M},
    ("POST", "/api/programme/projects/{pid}/quotes"): {I}, ("POST", "/api/programme/quotes/{qid}/accept"): {M},
    ("POST", "/api/programme/projects/{pid}/work-order"): {M}, ("POST", "/api/programme/work-orders/{wid}/checklist"): {I, M},
    ("GET", "/api/programme/projects/{pid}/flats"): {M, O, F, G}, ("POST", "/api/programme/flats/{fid}/tenancy-change"): {M, O},
    ("GET", "/api/programme/flats/{fid}/ledger"): {M, O, T}, ("POST", "/api/programme/flats/{fid}/payments"): {M, O},
    ("GET", "/api/programme/flats/{fid}/personal-data"): {M, O, T}, ("POST", "/api/programme/flats/{fid}/personal-data/erase"): {M, O},
    ("GET", "/api/programme/flats/{fid}/data-consent"): {M, O, T}, ("POST", "/api/programme/flats/{fid}/data-consent"): {M, O, T},
    ("POST", "/api/programme/billing/run"): {M}, ("GET", "/api/programme/billing/export"): {M, O},
    ("GET", "/api/programme/faults"): {M, O, I}, ("POST", "/api/programme/flats/{fid}/faults"): {M, O, T},
    ("POST", "/api/programme/faults/{xid}/resolve"): {M, I}, ("GET", "/api/programme/reserve"): {M, F, G},
    ("POST", "/api/programme/reserve/top-up"): {M}, ("GET", "/api/programme/flats/{fid}/readings"): {M, O, T},
    ("POST", "/api/programme/flats/{fid}/readings"): {M, O}, ("POST", "/api/programme/projects/{pid}/mv/run"): {M},
    ("GET", "/api/programme/projects/{pid}/mv"): {M, O, F, G}, ("GET", "/api/programme/projects/{pid}/documents"): {M, O, F, I, G, T},
    ("GET", "/api/programme/documents/{pid}/{doc}"): {M, O, F, G}, ("GET", "/api/programme/my-flat"): {T},
    ("GET", "/api/programme/enquiries"): {M}, ("POST", "/api/programme/enquiries/{eid}/convert"): {M},
    ("GET", "/api/sim/clock"): ANY, ("POST", "/api/sim/advance"): {M}, ("POST", "/api/sim/reset"): {M},
    ("GET", "/api/utility/summary"): {U, M}, ("GET", "/api/utility/meters"): {U, M},
    ("GET", "/api/utility/network-impact"): {U, M}, ("POST", "/api/utility/readings"): {U},
    ("GET", "/api/utility/readings/template.csv"): {U, M}, ("GET", "/api/utility/charge-file"): {U, M},
    ("POST", "/api/utility/remittance"): {U}, ("GET", "/api/utility/gas-disconnections"): {U, M},
    ("POST", "/api/utility/gas-disconnections/{gid}"): {U}, ("GET", "/api/utility/supply-requests"): {U, M},
    ("POST", "/api/utility/supply-requests/{sid}"): {U},
    ("GET", "/api/government/outcomes"): {G, M}, ("PUT", "/api/government/targets"): {G, M},
    ("GET", "/api/government/areas"): {G, M}, ("GET", "/api/government/grants"): {G, M},
    ("POST", "/api/government/grants"): {M}, ("POST", "/api/government/grants/{gid}/decide"): {G},
    ("GET", "/api/government/reports/{name}"): {G, M}, ("GET", "/api/government/routes"): {G, M},
    ("GET", "/api/government/controls"): {G, M}, ("GET", "/api/property/summary"): {O},
}
LEAK_MARKERS = ["Traceback", "File \"", "sqlite3.", "OperationalError", str(ROOT).replace("\\", "/"), str(ROOT),
                "/engine/programme", "\\engine\\"]

results: list[tuple[str, bool | None, str]] = []


def record(name: str, ok: bool | None, detail: str = "") -> None:
    results.append((name, ok, detail))
    tag = {True: "PASS", False: "FAIL", None: "SKIP"}[ok]
    print(f"[{tag}] {name}" + (f" - {detail}" if detail else ""), flush=True)


def leaks(text: str) -> list[str]:
    return [m for m in LEAK_MARKERS if m and m in text]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8766")
    ap.add_argument("--db", default=None, help="database file of that server (for session-expiry and audit-tamper checks)")
    ap.add_argument("--expect-docs", choices=["on", "off"], default=None,
                    help="whether /docs and /openapi.json should be exposed on this server")
    args = ap.parse_args()
    c = httpx.Client(base_url=args.base, timeout=60)
    error_bodies: list[str] = []

    def login(email: str) -> dict:
        r = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        r.raise_for_status()
        return {"Authorization": "Bearer " + r.json()["token"]}

    H = {k: login(v) for k, v in ACCOUNTS.items()}
    projects = c.get("/api/programme/projects", headers=H["manager"]).json()
    active = [p for p in projects if p["stage"] == "active"]
    own = next(p for p in active if p["owner_org"]["name"] == c.get("/api/auth/me", headers=H["owner"]).json()["org"]["name"])
    flats = c.get(f"/api/programme/projects/{own['id']}/flats", headers=H["manager"]).json()
    f0, f1 = flats[0], flats[1]
    tenant = lambda f: {"Authorization": "Bearer " + c.post("/api/auth/tenant", json={"code": f["access_code"]}).json()["token"]}  # noqa: E731
    H["tenant"] = tenant(f0)
    detail = c.get(f"/api/programme/projects/{own['id']}", headers=H["manager"]).json()
    faults = c.get("/api/programme/faults", headers=H["manager"]).json()
    grants = c.get("/api/government/grants", headers=H["manager"]).json()
    gas = c.get("/api/utility/gas-disconnections", headers=H["manager"]).json()
    supply = c.get("/api/utility/supply-requests", headers=H["manager"]).json()
    enq = c.get("/api/programme/enquiries", headers=H["manager"]).json()
    ids = {"pid": own["id"], "fid": f0["id"], "qid": (detail["quotes"] or [{"id": 1}])[0]["id"],
           "wid": (detail["work_order"] or {"id": 1})["id"], "xid": (faults or [{"id": 1}])[0]["id"],
           "gid": (grants or [{"id": 1}])[0]["id"], "eid": (enq or [{"id": 1}])[0]["id"],
           "sid": (supply or [{"id": 1}])[0]["id"], "doc": "owner_agreement.html", "name": "projects.csv",
           "building_id": "b_000240", "path": "x"}
    if gas:
        ids["gid_gas"] = gas[0]["id"]

    from api.main import app  # the app's own schema, so this works when /openapi.json is switched off
    routes = []
    for path, ops in app.openapi()["paths"].items():
        for m in ops:
            if m.upper() in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                routes.append((m.upper(), path))

    def fill(path: str) -> str:
        return re.sub(r"\{(\w+)(?::path)?\}", lambda mo: str(ids.get(mo.group(1), 1)), path)

    # 1. no token -> 401 on every non-public route
    bad = []
    for m, path in routes:
        if path in PUBLIC:
            continue
        r = c.request(m, fill(path), json={})
        if r.status_code != 401:
            bad.append(f"{m} {path} -> {r.status_code}")
        if r.status_code >= 400:
            error_bodies.append(r.text)
    record("Every non-public route rejects a request with no token (401)", not bad, "; ".join(bad[:5]) or
           f"{sum(1 for m, p in routes if p not in PUBLIC)} routes")
    unknown = [f"{m} {p}" for m, p in routes if p not in PUBLIC and (m, p) not in ALLOWED]
    record("Every non-public route has a declared role list in this check", not unknown, "; ".join(unknown[:5]))

    # 2. wrong role -> 403
    role_tok = {"manager": H["manager"], "government": H["government"], "utility": H["utility"], "owner": H["owner"],
                "installer": H["installer"], "funder": H["funder"], "tenant": H["tenant"]}
    bad, n = [], 0
    for (m, path), allowed in ALLOWED.items():
        if allowed is ANY:
            continue
        for role in ROLES:
            if role in allowed:
                continue
            if path.startswith("/api/auth/mfa"):
                continue
            n += 1
            r = c.request(m, fill(path), json={}, headers=role_tok[role])
            if r.status_code != 403:
                bad.append(f"{role} {m} {path} -> {r.status_code}")
            error_bodies.append(r.text)
    record("Every route refuses each role that is not allowed (403)", not bad, "; ".join(bad[:6]) or f"{n} role/route pairs")

    # 3. tenant cannot read another flat
    bad = []
    for path in (f"/api/programme/flats/{f1['id']}/ledger", f"/api/programme/flats/{f1['id']}/readings",
                 f"/api/programme/flats/{f1['id']}/data-consent", f"/api/programme/flats/{f1['id']}/personal-data",
                 f"/api/programme/documents/{own['id']}/tenant_disclosure.html?flat_id={f1['id']}",
                 f"/api/programme/documents/{own['id']}/charge_schedule.html?flat_id={f1['id']}"):
        r = c.get(path, headers=H["tenant"])
        if r.status_code != 403:
            bad.append(f"{path} -> {r.status_code}")
    r = c.post(f"/api/programme/flats/{f1['id']}/faults", headers=H["tenant"], json={"item": "heat_pump_hot_water", "description": "x"})
    if r.status_code != 403:
        bad.append(f"report fault on other flat -> {r.status_code}")
    record("A tenant token cannot read or act on another flat", not bad, "; ".join(bad))

    # 4. utility isolation
    dist = {m["meter_id"] for m in c.get("/api/utility/meters", headers=H["utility"]).json()}
    ret = {m["meter_id"] for m in c.get("/api/utility/meters", headers=H["utility_retail"]).json()}
    gasm = c.get("/api/utility/gas-disconnections", headers=H["utility"]).json()
    bad = []
    if not ret or not ret < dist:
        bad.append(f"retailer sees {len(ret)} of distributor's {len(dist)} meters (expected a strict subset)")
    if gasm:
        bad.append("distributor sees the gas network's disconnection requests")
    if gas:
        r = c.post(f"/api/utility/gas-disconnections/{gas[0]['id']}", headers=H["utility_retail"], json={"status": "cancelled"})
        if r.status_code != 403:
            bad.append(f"retailer updated a gas request -> {r.status_code}")
    other = sorted(dist - ret)
    if other:
        r = c.post("/api/utility/readings", headers=H["utility_retail"],
                   json={"readings": [{"meter_id": other[0], "month": "2020-01", "electricity_kwh": 1, "gas_mj": 0}]})
        if r.status_code != 200 or r.json().get("accepted") != 0:
            bad.append(f"retailer loaded a reading for a meter it does not serve -> {r.status_code} {r.text[:80]}")
    record("A utility cannot read or write another utility's meters", not bad, "; ".join(bad))

    # 5. tenant names never appear for utility, government, funder, installer
    names = set()
    for p in projects:
        for f in c.get(f"/api/programme/projects/{p['id']}/flats", headers=H["manager"]).json():
            if f.get("tenant_name"):
                names.add(f["tenant_name"])
            if f.get("access_code"):
                names.add(f["access_code"])
    gets = [(m, p) for m, p in routes if m == "GET" and p not in PUBLIC and not p.startswith("/api/sim")]
    bad, n = [], 0
    for who in ("utility", "utility_retail", "utility_gas", "government", "funder", "installer"):
        for _, path in gets:
            for pid in sorted({p["id"] for p in projects}) if "{pid}" in path else [ids["pid"]]:
                url = fill(path).replace(f"/{ids['pid']}", f"/{pid}", 1) if "{pid}" in path else fill(path)
                if "{doc}" in path:
                    urls = [f"/api/programme/documents/{pid}/{k}.html" for k in
                            ("owner_agreement", "funder_term_sheet", "commissioning_certificate", "mv_report")]
                else:
                    urls = [url]
                for u in urls:
                    r = c.get(u, headers=H[who])
                    n += 1
                    if r.status_code == 200:
                        hit = [x for x in names if x in r.text]
                        if hit:
                            bad.append(f"{who} {u}: {hit[:2]}")
    record("Tenant names and access codes never appear for utility, government, funder or installer",
           not bad, "; ".join(bad[:4]) or f"{n} responses, {len(names)} names and codes searched")

    # 6. session expiry and logout
    tmp = login(ACCOUNTS["funder"])
    c.post("/api/auth/logout", headers=tmp, json={})
    r = c.get("/api/auth/me", headers=tmp)
    record("Logout revokes the session", r.status_code == 401, f"/me after logout -> {r.status_code}")
    if args.db:
        tmp = login(ACCOUNTS["funder"])
        con = sqlite3.connect(args.db, timeout=10)
        con.execute("UPDATE sessions SET last_seen = last_seen - 31 * 60 WHERE id = "
                    "(SELECT id FROM sessions ORDER BY created DESC LIMIT 1)")
        con.commit()
        con.close()
        r = c.get("/api/auth/me", headers=tmp)
        record("A session idle for 31 minutes is refused", r.status_code == 401, f"-> {r.status_code}")
    else:
        record("A session idle for 31 minutes is refused", None, "needs --db")
    forged = H["manager"]["Authorization"][:-4] + "AAAA"
    r = c.get("/api/auth/me", headers={"Authorization": forged})
    record("A token with a altered signature is refused", r.status_code == 401, f"-> {r.status_code}")

    # 7. lockout
    email = f"lockout-check-{int(time.time())}@nowhere.invalid"
    codes = [c.post("/api/auth/login", json={"email": email, "password": "wrong-password-0000"}).status_code for _ in range(5)]
    r = c.post("/api/auth/login", json={"email": email, "password": "wrong-password-0000"})
    record("Five failed sign-ins lock the account", codes == [401] * 5 and r.json().get("locked") is True,
           f"6th attempt: {r.status_code} {r.json().get('detail', '')[:60]}")

    # 8. security headers and CSP
    bad = []
    for path in ("/api/health", "/api/programme/projects", "/", "/.well-known/security.txt"):
        h = c.get(path, headers=H["manager"] if path.startswith("/api/programme") else None).headers
        csp = h.get("content-security-policy", "")
        need = {"csp default-src self": "default-src 'self'" in csp, "frame-ancestors none": "frame-ancestors 'none'" in csp,
                "hsts": "max-age" in h.get("strict-transport-security", ""), "nosniff": h.get("x-content-type-options") == "nosniff",
                "referrer-policy": bool(h.get("referrer-policy")), "permissions-policy": bool(h.get("permissions-policy")),
                "request id": bool(h.get("x-request-id"))}
        if path.startswith("/api/"):
            need["no-store"] = h.get("cache-control") == "no-store"
        miss = [k for k, v in need.items() if not v]
        if miss:
            bad.append(f"{path}: {miss}")
    record("Security headers and CSP on API, static and well-known responses", not bad, "; ".join(bad))

    # 9. injection and traversal
    payloads = ["' OR '1'='1", "1; DROP TABLE flats;--", "../../../../etc/passwd", "..%2F..%2Fengine%2Fvar%2Fmeterwise.db",
                "%00", "\" OR 1=1 --", "<script>alert(1)</script>"]
    bad, n = [], 0
    for pl in payloads:
        tests = [("GET", f"/api/programme/projects/{pl}", None, H["manager"]),
                 ("GET", f"/api/buildings/{pl}", None, None),
                 ("GET", f"/api/programme/documents/{own['id']}/{pl}", None, H["manager"]),
                 ("GET", f"/api/government/reports/{pl}", None, H["government"]),
                 ("GET", "/api/programme/projects", {"q": pl, "stage": pl}, H["manager"]),
                 ("GET", "/api/programme/billing/export", {"month": pl}, H["manager"]),
                 ("GET", "/api/programme/audit-log", {"project_id": pl}, H["manager"]),
                 ("POST", "/api/auth/login", {"email": pl, "password": pl}, None),
                 ("POST", "/api/auth/tenant", {"code": pl}, None),
                 ("POST", f"/api/programme/flats/{f0['id']}/consent", {"consent": pl}, H["manager"]),
                 ("GET", f"/{pl}", None, None)]
        if payloads.index(pl) >= 5:  # keep sign-in attempts under the per-address rate limit
            tests = [t for t in tests if not t[1].startswith("/api/auth/")]
        for m, path, data, hd in tests:
            n += 1
            if m == "GET":
                r = c.get(path, params=data, headers=hd)
            else:
                r = c.post(path, json=data, headers=hd)
            if r.status_code >= 500 or leaks(r.text):
                bad.append(f"{m} {path[:50]} -> {r.status_code}")
            if path.endswith("/projects") and m == "GET" and r.status_code == 200 and r.json():
                bad.append(f"q={pl!r} returned rows")
            if "passwd" in pl and "root:" in r.text:
                bad.append("path traversal read a system file")
            if r.status_code >= 400:
                error_bodies.append(r.text)
    still = c.get("/api/programme/projects", headers=H["manager"]).json()
    if len(still) != len(projects):
        bad.append("project count changed after injection attempts")
    record("SQL injection and path traversal strings give no 500, no data and no file reads", not bad,
           "; ".join(bad[:5]) or f"{n} requests")

    # 10. oversized and malformed uploads
    bad = []
    r = c.post("/api/utility/readings", headers={**H["utility"], "Content-Type": "text/csv"}, content="x" * 2_100_000)
    if r.status_code != 413:
        bad.append(f"2.1 MB upload -> {r.status_code}")
    r = c.post("/api/utility/readings", headers={**H["utility"], "Content-Type": "application/json"}, content="{not json")
    if r.status_code != 400:
        bad.append(f"malformed JSON -> {r.status_code}")
    r = c.post("/api/utility/readings", headers={**H["utility"], "Content-Type": "text/csv"}, content="a,b\n1,2\n")
    if r.status_code != 400:
        bad.append(f"wrong CSV header -> {r.status_code}")
    many = "meter_reference,month,electricity_kwh,gas_mj\n" + "MW-000000,2020-01,1,0\n" * 5001
    r = c.post("/api/utility/readings", headers={**H["utility"], "Content-Type": "text/csv"}, content=many)
    if r.status_code != 413:
        bad.append(f"5001 rows -> {r.status_code}")
    r = c.post("/api/utility/readings", headers={**H["utility"], "Content-Type": "text/csv"},
               content=b"meter_reference,month,electricity_kwh,gas_mj\n\xff\xfe\x00bad,2020-13,-5,x\n")
    if r.status_code >= 500:
        bad.append(f"binary CSV -> {r.status_code}")
    for x in (r,):
        error_bodies.append(x.text)
    record("Oversized and malformed uploads are rejected cleanly", not bad, "; ".join(bad))

    # 11. CSV formula cells neutralised (writes: a tenancy change on one flat)
    target = flats[-1]
    r = c.post(f"/api/programme/flats/{target['id']}/tenancy-change", headers=H["manager"],
               json={"new_tenant_name": "=HYPERLINK(\"http://x\",\"y\")", "date": c.get("/api/sim/clock", headers=H["manager"]).json()["month"] + "-01"})
    text = c.get("/api/programme/billing/export", headers=H["manager"]).text
    cells = [cell for line in text.splitlines() for cell in line.split(",")]
    def _num(x: str) -> bool:
        try:
            float(x)
            return True
        except ValueError:
            return False
    raw = [x for x in cells if not _num(x) and (x[:1] in "=+-@" or x[:2] in ('"=', '"+', '"-', '"@'))]
    record("CSV exports neutralise formula cells", r.status_code == 200 and not raw and "'=HYPERLINK" in text,
           f"tenancy change {r.status_code}; unneutralised cells: {raw[:2]}")

    # 12. audit chain verifies; tampering a copy is detected
    v = c.get("/api/programme/audit-log/verify", headers=H["manager"]).json()
    record("The audit chain verifies on the running server", v.get("ok") is True, f"{v.get('entries')} entries")
    if args.db:
        d = tempfile.mkdtemp()
        copy = os.path.join(d, "copy.db")
        src = sqlite3.connect(args.db, timeout=10)
        dst = sqlite3.connect(copy)
        src.backup(dst)
        src.close()
        dst.execute("DROP TRIGGER IF EXISTS audit_log_no_update")
        dst.execute("UPDATE audit_log SET detail = 'tampered' WHERE id = 7")
        dst.commit()
        dst.close()
        os.environ["METERWISE_DB"] = copy
        from programme import audit, db
        db.connect(copy)
        with db.tx():
            res = audit.verify()
        db.conn().close()
        db._conn = None
        shutil.rmtree(d, ignore_errors=True)
        record("Changing one audit entry in a copy of the database is detected", res["ok"] is False and res["first_bad_id"] == 7,
               res["reason"])
    else:
        record("Changing one audit entry in a copy of the database is detected", None, "needs --db")

    # 13. no stack traces or internal paths in error bodies
    hits = sorted({m for b in error_bodies for m in leaks(b)})
    record("No stack traces or internal paths in error bodies", not hits, f"{len(error_bodies)} error bodies; {hits}")

    # 14. docs exposure
    rr = c.get("/openapi.json")
    st = rr.status_code
    exposed = st == 200 and rr.headers.get("content-type", "").startswith("application/json")
    if args.expect_docs:
        record(f"/docs and /openapi.json exposure is {args.expect_docs}", exposed == (args.expect_docs == "on"),
               f"/openapi.json -> {st}")
    else:
        record("/docs and /openapi.json exposure (informational)", None, f"/openapi.json -> {st} (METERWISE_DOCS)")

    # 15. rate limit (last: it blocks sign-in from this address for a few minutes)
    codes = [c.post("/api/auth/tenant", json={"code": "FLAT-NOPE00"}).status_code for _ in range(35)]
    record("Sign-in attempts are rate limited per address", 429 in codes, f"first 429 at attempt {codes.index(429) + 1 if 429 in codes else '-'}")

    failed = [r for r in results if r[1] is False]
    print(f"\n{sum(1 for r in results if r[1])} passed, {len(failed)} failed, {sum(1 for r in results if r[1] is None)} skipped")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
