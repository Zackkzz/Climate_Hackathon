"""HTTP routes for the programme system and the three portals (docs/programme-contract.md, docs/portals-contract.md).

``install(app)`` adds the error handler, security headers, request ids and the request log, body-size limit,
security.txt, readiness, the OIDC placeholder and every router. Each handler resolves the signed-in principal, then
runs its service call inside one serialised database transaction with the audit actor set.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from typing import Any, Callable

from fastapi import APIRouter, Body, Depends, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response

from programme import audit, auth, clock, db, documents, ledger as L, seed as SEED, service as S, sim, views as V
from programme.auth import Principal
from programme.errors import ProgError, bad

log = logging.getLogger("meterwise.request")
MAX_BODY = 2_000_000
TILE_HOST = os.environ.get("METERWISE_TILE_HOST", "https://tile.openstreetmap.org https://*.tile.openstreetmap.org")
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: "
       f"{TILE_HOST}; font-src 'self'; connect-src 'self' {TILE_HOST}; object-src 'none'; base-uri 'self'; form-action 'self'; "
       "frame-ancestors 'none'")


# ------------------------------------------------------------------------------------------- plumbing

def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def principal(request: Request) -> Principal:
    h = request.headers.get("authorization") or ""
    token = h[7:].strip() if h.lower().startswith("bearer ") else None
    with db.tx():
        return auth.principal_from_token(token)


def optional_principal(request: Request) -> Principal | None:
    h = request.headers.get("authorization") or ""
    if not h:
        return None
    return principal(request)


def call(p: Principal | None, fn: Callable, *args: Any, **kw: Any) -> Any:
    tok = audit.set_actor(p.label if p else "anonymous", p.role if p else "anonymous")
    try:
        with db.tx():
            return fn(*args, **kw)
    finally:
        audit.actor.reset(tok)


def csv_response(text: str, filename: str) -> Response:
    return Response(content=text, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def demo_only() -> None:
    if not auth.demo_mode():
        raise ProgError("forbidden", "System date controls are switched off on this server.")


async def rows_from_request(request: Request, key: str, required: tuple[str, ...]) -> list[dict]:
    """JSON {key: [...]} or {"csv": "..."}, or a text/csv body."""
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise ProgError("too_large", "The upload is larger than 2 MB.")
    ctype = (request.headers.get("content-type") or "").lower()
    text = raw.decode("utf-8-sig", errors="replace")
    if "json" in ctype or text.lstrip().startswith("{"):
        try:
            body = json.loads(text or "{}")
        except json.JSONDecodeError:
            raise bad("The body is not valid JSON.")
        if isinstance(body, dict) and isinstance(body.get("csv"), str):
            return L.parse_csv(body["csv"], required)
        rows = body.get(key) if isinstance(body, dict) else None
        if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
            raise bad(f"Send {{\"{key}\": [...]}} as JSON, or a CSV file with the header " + ",".join(required) + ".")
        return rows
    return L.parse_csv(text, required)


# ------------------------------------------------------------------------------------------- auth

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


@auth_router.post("/login")
def login(request: Request, body: dict = Body(...)) -> dict:
    return call(None, auth.login, body.get("email"), body.get("password"), _client_ip(request))


@auth_router.post("/tenant")
def tenant_login(request: Request, body: dict = Body(...)) -> dict:
    return call(None, auth.tenant_login, body.get("code"), _client_ip(request))


@auth_router.get("/me")
def me(p: Principal = Depends(principal)) -> dict:
    return p.user_obj() | {"session_idle_minutes": auth.IDLE_S // 60, "session_max_hours": auth.ABSOLUTE_S // 3600}


@auth_router.post("/logout")
def logout(p: Principal = Depends(principal), body: dict = Body(default={})) -> dict:
    call(p, auth.logout, p, bool((body or {}).get("everywhere")))
    return {"signed_out": True}


@auth_router.post("/mfa/setup")
def mfa_setup(request: Request, body: dict = Body(default={})) -> dict:
    p = optional_principal(request)
    return call(p, auth.mfa_setup, p, (body or {}).get("ticket"))


@auth_router.post("/mfa/verify")
def mfa_verify(request: Request, body: dict = Body(...)) -> dict:
    auth.rate_check(_client_ip(request))
    p = optional_principal(request)
    return call(p, auth.mfa_verify, p, body.get("ticket"), str(body.get("code") or ""))


@auth_router.post("/mfa/login")
def mfa_login(request: Request, body: dict = Body(...)) -> dict:
    return call(None, auth.mfa_login, body.get("ticket"), str(body.get("code") or ""), _client_ip(request))


@auth_router.get("/demo-users")
def demo_users() -> list:
    if os.environ.get("METERWISE_LIST_ACCOUNTS", "0") != "1" or not auth.demo_mode():
        raise ProgError("not_found", "Not found.")

    def f():
        out = []
        for u in db.q("SELECT u.*, o.name AS org_name, o.kind AS org_kind FROM users u JOIN orgs o ON o.id = u.org_id "
                      "WHERE u.example = 1 AND u.demo_password IS NOT NULL ORDER BY u.id"):
            out.append({"role": u["role"], "name": u["name"], "email": u["email"], "password": u["demo_password"],
                        "org": {"name": u["org_name"], "kind": u["org_kind"]}, "example": True})
        for t in db.q("SELECT t.access_code, f.unit, f.project_id, p.label, f.charge_status FROM tenancies t "
                      "JOIN flats f ON f.id = t.flat_id JOIN projects p ON p.id = f.project_id WHERE t.active = 1 AND "
                      "p.stage = 'active' AND f.participating = 1 ORDER BY p.id, f.id LIMIT 4"):
            out.append({"role": "tenant", "name": f"Tenant, unit {t['unit']}, {t['label']}", "code": t["access_code"],
                        "project_id": t["project_id"], "charge_status": t["charge_status"], "example": True})
        c = db.q1("SELECT t.access_code, f.unit, p.label FROM tenancies t JOIN flats f ON f.id = t.flat_id JOIN projects "
                  "p ON p.id = f.project_id WHERE t.active = 1 AND p.stage = 'consent' AND f.consent = 'pending' LIMIT 1")
        if c:
            out.append({"role": "tenant", "name": f"Tenant still deciding, unit {c['unit']}, {c['label']}",
                        "code": c["access_code"], "example": True})
        return out
    return call(None, f)


@auth_router.get("/oidc/login")
def oidc_login() -> dict:
    if not (os.environ.get("METERWISE_OIDC_ISSUER") and os.environ.get("METERWISE_OIDC_CLIENT_ID")):
        raise ProgError("not_configured", "Single sign-on is not configured. Set METERWISE_OIDC_ISSUER, "
                                          "METERWISE_OIDC_CLIENT_ID, METERWISE_OIDC_CLIENT_SECRET and "
                                          "METERWISE_OIDC_REDIRECT_URI to connect your identity provider.")
    raise ProgError("not_configured", "OpenID Connect settings are present, but the token exchange is not implemented "
                                      "in this version. Staff sign in with a password and TOTP.")


@auth_router.get("/oidc/callback")
def oidc_callback() -> dict:
    return oidc_login()


@auth_router.get("/oidc/settings")
def oidc_settings() -> dict:
    keys = ["ISSUER", "CLIENT_ID", "REDIRECT_URI", "SCOPES"]
    return {"configured": bool(os.environ.get("METERWISE_OIDC_ISSUER") and os.environ.get("METERWISE_OIDC_CLIENT_ID")),
            "settings": {f"METERWISE_OIDC_{k}": bool(os.environ.get(f"METERWISE_OIDC_{k}")) for k in keys + ["CLIENT_SECRET"]},
            "callback_route": "/api/auth/oidc/callback",
            "note": "Returns 501 until configured."}


# ------------------------------------------------------------------------------------------- programme

pg = APIRouter(prefix="/api/programme", tags=["programme"])


@pg.get("")
def get_programme(p: Principal = Depends(principal)) -> dict:
    def f():
        auth.require(p, "manager", "owner", "funder", "government")
        return V.programme_obj(p)
    return call(p, f)


@pg.patch("")
def patch_programme(body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, V.patch_programme, p, body)


@pg.get("/overview")
def overview(p: Principal = Depends(principal)) -> dict:
    return call(p, V.overview, p)


@pg.get("/projects")
def projects(stage: str | None = None, q: str | None = None, p: Principal = Depends(principal)) -> list:
    return call(p, S.list_projects, p, stage, q)


@pg.post("/projects")
def create_project(body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, lambda: S.project_detail(S.create_project(p, body), p))


def _detail(p: Principal, pid: int) -> dict:
    auth.require(p, "manager", "owner", "funder", "installer", "government")
    pr = S.get_project(pid)
    S.check_project(p, pr)
    if p.role in ("manager", "owner"):
        audit.log("personal_data.read", pid, {"what": "project flats"})
    return S.project_detail(pr, p)


@pg.get("/projects/{pid}")
def project(pid: int, p: Principal = Depends(principal)) -> dict:
    return call(p, _detail, p, pid)


@pg.patch("/projects/{pid}")
def patch_project(pid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, lambda: S.project_detail(S.patch_project(p, pid, body), p))


@pg.post("/projects/{pid}/advance")
def advance(pid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, lambda: S.project_detail(S.advance(p, pid, body), p))


@pg.get("/orgs")
def orgs(p: Principal = Depends(principal)) -> list:
    def f():
        auth.require(p, "manager")
        return [{"id": o["id"], "name": o["name"], "kind": o["kind"], "example": bool(o["example"])}
                for o in db.q("SELECT * FROM orgs ORDER BY id")]
    return call(p, f)


@pg.get("/audit-log")
def audit_log(limit: int = 200, project_id: int | None = None, p: Principal = Depends(principal)) -> list:
    def f():
        auth.require(p, "manager", "government")
        return audit.entries(max(1, min(limit, 5000)), project_id)
    return call(p, f)


@pg.get("/audit-log/verify")
def audit_verify(p: Principal = Depends(principal)) -> dict:
    def f():
        auth.require(p, "manager", "government")
        return audit.verify()
    return call(p, f)


@pg.put("/projects/{pid}/audit")
def put_audit(pid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, lambda: S.project_detail(S.save_audit(p, pid, body), p))


@pg.post("/projects/{pid}/consent/owner")
def consent_owner(pid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, lambda: S.project_detail(S.owner_consent(p, pid, body), p))


@pg.post("/flats/{fid}/consent")
def consent_flat(fid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, lambda: S.flat_obj(S.flat_consent(p, fid, body), p))


@pg.post("/projects/{pid}/tender")
def tender(pid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, lambda: S.project_detail(S.open_tender(p, pid, body), p))


@pg.get("/tenders")
def tenders(p: Principal = Depends(principal)) -> list:
    return call(p, S.tenders, p)


@pg.post("/projects/{pid}/quotes")
def quote(pid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, S.submit_quote, p, pid, body)


@pg.post("/quotes/{qid}/accept")
def accept(qid: int, p: Principal = Depends(principal)) -> dict:
    return call(p, lambda: S.project_detail(S.accept_quote(p, qid), p))


@pg.post("/projects/{pid}/work-order")
def work_order(pid: int, body: dict = Body(default={}), p: Principal = Depends(principal)) -> dict:
    return call(p, S.create_work_order, p, pid, body or {})


@pg.post("/work-orders/{wid}/checklist")
def checklist(wid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, S.tick, p, wid, body)


@pg.get("/projects/{pid}/flats")
def flats(pid: int, p: Principal = Depends(principal)) -> list:
    def f():
        auth.require(p, "manager", "owner", "funder", "government")
        pr = S.get_project(pid)
        S.check_project(p, pr)
        if p.role in ("manager", "owner"):
            audit.log("personal_data.read", pid, {"what": "flats"})
        return [S.flat_obj(x, p, pr) for x in S.flats_of(pid)]
    return call(p, f)


@pg.post("/flats/{fid}/tenancy-change")
def tenancy(fid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, L.tenancy_change, p, fid, body)


@pg.post("/flats/{fid}/access-code")
def rotate_code(fid: int, p: Principal = Depends(principal)) -> dict:
    def rotate():
        flat = S.get_flat(fid)
        S.check_flat(p, flat, ("manager", "owner"))
        tenancy = S.active_tenancy(fid)
        if not tenancy:
            raise ProgError("conflict", "This flat has no current tenancy.")
        db.update("tenancies", tenancy["id"], access_code=auth.new_access_code())
        db.ex("UPDATE sessions SET revoked = 1 WHERE tenancy_id = ?", (tenancy["id"],))
        audit.log("auth.tenant_code_rotated", flat["project_id"], {"flat_id": fid})
        return S.flat_obj(flat, p)
    return call(p, rotate)


@pg.post("/privacy/retention")
def retention(body: dict = Body(default={}), p: Principal = Depends(principal)) -> dict:
    def run():
        auth.require(p, "manager")
        from programme import privacy
        dry_run = body.get("dry_run", True)
        if not isinstance(dry_run, bool):
            raise ProgError("validation", "dry_run must be true or false.")
        return privacy.purge(dry_run)
    return call(p, run)


@pg.get("/flats/{fid}/ledger")
def ledger(fid: int, p: Principal = Depends(principal)) -> list:
    return call(p, L.ledger_for, p, fid)


@pg.post("/flats/{fid}/payments")
def payments(fid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    def f():
        auth.require(p, "manager", "owner")
        return L.payment(p, fid, body)
    return call(p, f)


@pg.get("/flats/{fid}/personal-data")
def personal(fid: int, p: Principal = Depends(principal)) -> dict:
    return call(p, V.personal_data, p, fid)


@pg.post("/flats/{fid}/personal-data/erase")
def erase(fid: int, body: dict = Body(default={}), p: Principal = Depends(principal)) -> dict:
    return call(p, V.erase, p, fid, body or {})


@pg.get("/flats/{fid}/data-consent")
def dc_get(fid: int, p: Principal = Depends(principal)) -> dict:
    return call(p, L.data_consent_get, p, fid)


@pg.post("/flats/{fid}/data-consent")
def dc_set(fid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, L.data_consent_set, p, fid, body)


@pg.post("/billing/run")
def billing_run(body: dict = Body(default={}), p: Principal = Depends(principal)) -> dict:
    return call(p, L.billing_run, p, (body or {}).get("month"))


@pg.get("/billing/export")
def billing_export(month: str | None = None, project_id: int | None = None, p: Principal = Depends(principal)):
    return csv_response(call(p, L.billing_export, p, month, project_id), f"meterwise-charges-{month or 'current'}.csv")


@pg.get("/faults")
def faults(status: str | None = None, project_id: int | None = None, p: Principal = Depends(principal)) -> list:
    return call(p, L.list_faults, p, status, project_id)


@pg.post("/flats/{fid}/faults")
def fault(fid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, L.open_fault, p, fid, body)


@pg.post("/faults/{xid}/resolve")
def resolve(xid: int, body: dict = Body(default={}), p: Principal = Depends(principal)) -> dict:
    return call(p, L.resolve_fault, p, xid, body or {})


@pg.get("/reserve")
def reserve(p: Principal = Depends(principal)) -> dict:
    return call(p, L.reserve_view, p)


@pg.post("/reserve/top-up")
def reserve_top_up(body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, L.top_up, p, body)


@pg.get("/flats/{fid}/readings")
def readings(fid: int, p: Principal = Depends(principal)) -> list:
    return call(p, L.readings_get, p, fid)


@pg.post("/flats/{fid}/readings")
async def post_readings(fid: int, request: Request, p: Principal = Depends(principal)) -> dict:
    auth.require(p, "manager", "owner")  # role check before reading the body
    rows = await rows_from_request(request, "readings", ("month", "electricity_kwh"))
    return await run_in_threadpool(call, p, L.readings_post, p, fid, rows)


@pg.post("/projects/{pid}/mv/run")
def mv_run(pid: int, body: dict = Body(default={}), p: Principal = Depends(principal)) -> dict:
    return call(p, L.run_mv, p, pid, body or {})


@pg.get("/projects/{pid}/mv")
def mv(pid: int, p: Principal = Depends(principal)) -> list:
    return call(p, L.mv_list, p, pid)


@pg.get("/projects/{pid}/documents")
def docs(pid: int, p: Principal = Depends(principal)) -> list:
    return call(p, documents.list_documents, p, pid)


@pg.get("/documents/{pid}/{doc}")
def doc(pid: int, doc: str, flat_id: int | None = None, p: Principal = Depends(principal)) -> HTMLResponse:
    kind = doc[:-5] if doc.endswith(".html") else doc
    return HTMLResponse(call(p, documents.render, p, pid, kind, flat_id))


@pg.get("/my-flat")
def my_flat(p: Principal = Depends(principal)) -> dict:
    return call(p, V.my_flat, p)


@pg.get("/enquiries")
def enquiries(p: Principal = Depends(principal)) -> list:
    return call(p, V.enquiries, p)


@pg.post("/enquiries/{eid}/convert")
def convert(eid: int, body: dict = Body(default={}), p: Principal = Depends(principal)) -> dict:
    return call(p, V.enquiry_convert, p, eid, body or {})


# ------------------------------------------------------------------------------------------- sim

sim_router = APIRouter(prefix="/api/sim", tags=["sim"])


@sim_router.get("/clock")
def sim_clock(p: Principal = Depends(principal)) -> dict:
    demo_only()
    return call(p, clock.info)


@sim_router.post("/advance")
def sim_advance(body: dict = Body(default={}), p: Principal = Depends(principal)) -> dict:
    demo_only()

    def f():
        auth.require(p, "manager")
        return sim.advance(p, (body or {}).get("months", 1), (body or {}).get("scenario"))
    return call(p, f)


@sim_router.post("/reset")
def sim_reset(p: Principal = Depends(principal)) -> dict:
    demo_only()

    def f():
        auth.require(p, "manager")
        out = SEED.seed()
        audit.log("sim.reset", None, out, by=p.label, role=p.role)
        return {**out, "clock": clock.info()}
    return call(p, f)


# ------------------------------------------------------------------------------------------- utility

ut = APIRouter(prefix="/api/utility", tags=["utility"])


@ut.get("/summary")
def ut_summary(p: Principal = Depends(principal)) -> dict:
    return call(p, V.utility_summary, p)


@ut.get("/meters")
def ut_meters(q: str | None = None, stage: str | None = None, charge_status: str | None = None,
              p: Principal = Depends(principal)) -> list:
    return call(p, V.utility_meters, p, q, stage, charge_status)


@ut.get("/network-impact")
def ut_network(p: Principal = Depends(principal)) -> dict:
    return call(p, V.network_impact, p)


@ut.post("/readings")
async def ut_readings(request: Request, p: Principal = Depends(principal)) -> dict:
    auth.require(p, "utility")  # role check before reading the body
    rows = await rows_from_request(request, "readings", ("meter_id", "month", "electricity_kwh", "gas_mj"))
    return await run_in_threadpool(call, p, V.utility_readings, p, rows)


@ut.get("/readings/template.csv")
def ut_template(p: Principal = Depends(principal)):
    return csv_response(call(p, V.readings_template, p), "meter-readings-template.csv")


@ut.get("/charge-file")
def ut_charge_file(month: str | None = None, p: Principal = Depends(principal)):
    return csv_response(call(p, V.charge_file, p, month), f"charge-file-{month or 'current'}.csv")


@ut.post("/remittance")
async def ut_remittance(request: Request, p: Principal = Depends(principal)) -> dict:
    auth.require(p, "utility")  # role check before reading the body
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise ProgError("too_large", "The upload is larger than 2 MB.")
    ctype = (request.headers.get("content-type") or "").lower()
    if "json" in ctype:
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            raise bad("The body is not valid JSON.")
        if isinstance(body.get("csv"), str):
            body["rows"] = L.parse_csv(body["csv"], ("meter_id", "amount"))
    else:
        body = {"month": request.query_params.get("month"),
                "rows": L.parse_csv(raw.decode("utf-8-sig", errors="replace"), ("meter_id", "amount"))}
    return await run_in_threadpool(call, p, V.remittance, p, body)


@ut.get("/gas-disconnections")
def ut_gas(p: Principal = Depends(principal)) -> list:
    return call(p, V.gas_list, p)


@ut.post("/gas-disconnections/{gid}")
def ut_gas_update(gid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, V.gas_update, p, gid, body)


@ut.get("/supply-requests")
def ut_supply(p: Principal = Depends(principal)) -> list:
    return call(p, V.supply_list, p)


@ut.post("/supply-requests/{sid}")
def ut_supply_update(sid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, V.supply_update, p, sid, body)


# ------------------------------------------------------------------------------------------- government

gov = APIRouter(prefix="/api/government", tags=["government"])


@gov.get("/outcomes")
def g_outcomes(p: Principal = Depends(principal)) -> dict:
    return call(p, V.outcomes, p)


@gov.put("/targets")
def g_targets(body: dict = Body(...), p: Principal = Depends(principal)) -> list:
    return call(p, V.put_targets, p, body)


@gov.get("/areas")
def g_areas(p: Principal = Depends(principal)) -> dict:
    return call(p, V.areas, p)


@gov.get("/grants")
def g_grants(p: Principal = Depends(principal)) -> list:
    return call(p, V.grants, p)


@gov.post("/grants")
def g_grant_request(body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, V.grant_request, p, body)


@gov.post("/grants/{gid}/decide")
def g_decide(gid: int, body: dict = Body(...), p: Principal = Depends(principal)) -> dict:
    return call(p, V.grant_decide, p, gid, body)


@gov.get("/reports/{name}")
def g_report(name: str, p: Principal = Depends(principal)):
    kind = name[:-4] if name.endswith(".csv") else name
    return csv_response(call(p, V.report_csv, p, kind), f"meterwise-{kind}.csv")


@gov.get("/routes")
def g_routes(p: Principal = Depends(principal)) -> list:
    return call(p, V.delivery_routes, p)


@gov.get("/controls")
def g_controls(p: Principal = Depends(principal)) -> dict:
    return call(p, V.controls, p)


# ------------------------------------------------------------------------------------------- property

prop = APIRouter(prefix="/api/property", tags=["property"])


@prop.get("/summary")
def p_summary(p: Principal = Depends(principal)) -> dict:
    return call(p, V.property_summary, p)


@prop.post("/enquiries")
def p_enquiry(request: Request, body: dict = Body(...)) -> dict:
    auth.rate_check("enquiry:" + _client_ip(request))
    return call(None, V.enquiry_create, body)


# ------------------------------------------------------------------------------------------- install

SECURITY_TXT = """Contact: https://github.com/Zackkzz/Climate_Hackathon/security/advisories/new
Expires: 2027-10-04T00:00:00.000Z
Preferred-Languages: en
Policy: https://github.com/Zackkzz/Climate_Hackathon/blob/main/docs/SECURITY.md
"""


def install(app: FastAPI) -> None:
    if not log.handlers:  # one JSON line per request on stderr
        hd = logging.StreamHandler()
        hd.setFormatter(logging.Formatter("%(asctime)s meterwise.request %(message)s"))
        log.addHandler(hd)
        log.setLevel(logging.INFO)
        log.propagate = False
    @app.exception_handler(ProgError)
    async def _prog_error(_: Request, exc: ProgError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content=exc.body())

    @app.middleware("http")
    async def _security(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        if not all(c.isalnum() or c in "-_" for c in rid) or len(rid) > 64:
            rid = uuid.uuid4().hex[:16]
        t0 = time.time()
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > MAX_BODY:
            resp: Response = JSONResponse(status_code=413, content={"detail": "The request is larger than 2 MB.",
                                                                    "code": "too_large"})
        else:
            resp = await call_next(request)
        h = resp.headers
        h["X-Request-ID"] = rid
        h["Content-Security-Policy"] = CSP
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        h["X-Content-Type-Options"] = "nosniff"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        h["X-Frame-Options"] = "DENY"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        if request.url.path.startswith("/api/"):
            h["Cache-Control"] = "no-store"
        # Structured request log: no query strings, bodies, tokens or personal data.
        log.info(json.dumps({"rid": rid, "method": request.method, "path": request.url.path,
                             "status": resp.status_code, "ms": round((time.time() - t0) * 1000)}))
        return resp

    @app.get("/.well-known/security.txt", include_in_schema=False)
    def security_txt() -> PlainTextResponse:
        return PlainTextResponse(SECURITY_TXT)

    @app.get("/api/ready")
    def ready() -> dict:
        try:
            with db.tx():
                db.q1("SELECT 1 AS ok")
                seeded = bool(db.q1("SELECT 1 FROM programmes LIMIT 1"))
            from meterwise import buildings as B
            n = len(B.load().features)
        except Exception as e:  # noqa: BLE001
            return JSONResponse(status_code=503, content={"ready": False, "detail": f"Not ready: {type(e).__name__}"})
        return {"ready": True, "database": "ok", "seeded": seeded, "buildings": n, "demo_mode": auth.demo_mode()}

    for r in (auth_router, pg, sim_router, ut, gov, prop):
        app.include_router(r)


def startup() -> None:
    """Called once when the server starts: refuse unsafe config, open the database, seed a fresh one."""
    auth.check_startup_secret()
    from programme import security
    if not auth.demo_mode():
        security.cipher()  # validate mounted encryption keys before opening or migrating data
        if os.environ.get("METERWISE_AUTOSEED", "1") != "0":
            raise RuntimeError("Production requires METERWISE_AUTOSEED=0.")
    db.connect()
    if not auth.demo_mode():
        if db.q1("SELECT 1 FROM users WHERE example = 1 LIMIT 1") or db.q1("SELECT 1 FROM programmes WHERE example = 1 LIMIT 1"):
            raise RuntimeError("Production refuses example identities and programmes. Use a fresh production database.")
    if os.environ.get("METERWISE_AUTOSEED", "1") != "0":
        SEED.ensure_seeded()
