"""The example programme, built by driving the real service functions through time.

The clock starts 20 months in the past and moves forward month by month with the simulator, while projects are taken
through their stages at the right moments, so every history (stage dates, billing, faults, tenancy changes, M&V
true-ups, reserve entries) is internally consistent. It ends with the clock offset back at 0. Deterministic: the same
starting month always gives the same records. Every organisation and person is fictional and flagged as an example.
"""
from __future__ import annotations

import time

from . import audit, auth, clock, db
from . import ledger as L
from . import service as S
from . import sim, views
from .auth import Principal

DEMO_PASSWORD = "Penrith-demo-2026!"
START_OFFSET = -20

ORGS = [  # key, name, kind, area, contact
    ("council", "Western Sydney Councils Energy Programme Office (example)", "council", [], {}),
    ("state", "NSW Housing Energy Agency (example)", "state_agency", [], {}),
    ("provider", "Westside Community Housing (example)", "community_housing", [],
     {"email": "tenancies@westside-housing.example", "phone": "02 9000 0101"}),
    ("landlord", "Kingswood Rentals Pty Ltd (example)", "landlord", [],
     {"email": "office@kingswood-rentals.example", "phone": "02 9000 0202"}),
    ("strata", "Strata Plan 99999 Owners Committee (example)", "strata", [],
     {"email": "secretary@sp99999.example", "phone": "02 9000 0303"}),
    ("funder", "Greenway Impact Capital (example)", "funder", [], {}),
    ("inst1", "Cooltop Installations (example)", "installer", [], {}),
    ("inst2", "Nepean Electrical and Plumbing (example)", "installer", [], {}),
    ("dist", "Western Grid Networks (example distributor)", "distributor", ["Penrith", "Kingswood"], {}),
    ("retail", "Parramatta Power Retail (example retailer)", "retailer", [], {}),
    ("gas", "Cumberland Gas Network (example)", "gas_network", ["Penrith", "Kingswood"], {}),
]
USERS = [  # name, email, role, org key
    ("Alex Example (programme manager)", "manager@meterwise.example", "manager", "council"),
    ("Jordan Example (council oversight)", "council@meterwise.example", "government", "council"),
    ("Sam Example (state agency)", "agency@meterwise.example", "government", "state"),
    ("Priya Example (asset officer)", "provider@meterwise.example", "owner", "provider"),
    ("Lee Example (landlord)", "landlord@meterwise.example", "owner", "landlord"),
    ("Chris Example (strata secretary)", "strata@meterwise.example", "owner", "strata"),
    ("Morgan Example (funder)", "funder@meterwise.example", "funder", "funder"),
    ("Taylor Example (Cooltop)", "installer@meterwise.example", "installer", "inst1"),
    ("Robin Example (Nepean)", "installer2@meterwise.example", "installer", "inst2"),
    ("Casey Example (distributor)", "distributor@meterwise.example", "utility", "dist"),
    ("Drew Example (retailer)", "retailer@meterwise.example", "utility", "retail"),
    ("Jamie Example (gas network)", "gas@meterwise.example", "utility", "gas"),
]
TENANT_NAMES = ["R. Example", "M. Sample", "T. Placeholder", "A. Demo", "K. Fictional", "J. Test", "S. Specimen",
                "P. Illustration", "D. Model", "L. Pattern", "N. Instance", "B. Mock", "C. Dummy", "E. Sketch",
                "F. Draft", "G. Pilot"]


class Seeder:
    def __init__(self) -> None:
        self.org: dict[str, int] = {}
        self.users: dict[str, Principal] = {}

    # --- people
    def principal(self, email: str) -> Principal:
        return self.users[email]

    @property
    def mgr(self) -> Principal:
        return self.users["manager@meterwise.example"]

    def act(self, p: Principal):
        audit.set_actor(p.label, p.role)
        return p

    # --- flow helpers
    def create(self, bid: str, owner: str, package: dict | None = None, existing: dict | None = None) -> int:
        self.act(self.mgr)
        pr = S.create_project(self.mgr, {"building_id": bid, "owner_org_id": self.org[owner],
                                         "package": package or {}, "existing": existing or {}})
        for i, f in enumerate(S.flats_of(pr["id"])):
            t = S.active_tenancy(f["id"])
            db.update("tenancies", t["id"], tenant_name=TENANT_NAMES[(pr["id"] * 3 + i) % len(TENANT_NAMES)])
        return pr["id"]

    def audit_(self, pid: int, owner_email: str, **kw) -> None:
        p = self.act(self.principal(owner_email))
        body = {"roof_condition": "sound", "hot_water_layout": "per_flat", "switchboard_amps": 63, "notes": "Example audit."}
        body.update(kw)
        S.save_audit(p, pid, body)

    def to(self, pid: int, stage: str, **kw) -> None:
        self.act(self.mgr)
        S.advance(self.mgr, pid, {"to": stage, **kw})

    def offer_and_consent(self, pid: int, owner_email: str, declines: int = 0, pending: int = 0, sign: bool = True,
                          resolution: dict | None = None) -> None:
        self.to(pid, "offer")
        self.to(pid, "consent")
        owner = self.act(self.principal(owner_email))
        if sign:
            body = {"signed": True, "name": owner.name}
            if resolution:
                body["resolution"] = resolution
            S.owner_consent(owner, pid, body)
        flats = S.flats_of(pid)
        for i, f in enumerate(flats):
            if i < pending:
                continue
            c = "declined" if i < pending + declines else "agreed"
            tp = Principal(role="tenant", flat_id=f["id"], project_id=pid, name="tenant")
            self.act(tp)
            S.flat_consent(tp, f["id"], {"consent": c})

    def procure(self, pid: int, prices: list[float], accept: int | None = 0, grant: bool = True) -> None:
        self.to(pid, "procurement")
        self.act(self.mgr)
        S.open_tender(self.mgr, pid, {"installer_org_ids": [self.org["inst1"], self.org["inst2"]],
                                      "closes_on": clock.madd(clock.month(), 1) + "-20"})
        pr = S.get_project(pid)
        qids = []
        for k, (email, factor) in enumerate(zip(["installer@meterwise.example", "installer2@meterwise.example"], prices)):
            ip = self.act(self.principal(email))
            items = [{"key": t["key"], "qty": t["qty"], "unit_price": round(t["modelled_unit_price"] * factor, 2)}
                     for t in S.tender_items(pr)]
            q = S.submit_quote(ip, pid, {"items": items, "valid_until": clock.madd(clock.month(), 3) + "-01",
                                         "note": "Example quote."})
            qids.append(q["id"])
        if accept is None:
            return
        self.act(self.mgr)
        S.accept_quote(self.mgr, qids[accept])
        if grant:
            gap = S.get_project(pid)["deal"]["funding_gap"]
            if gap > 0.5:
                g = views.grant_request(self.mgr, {"project_id": pid, "requested": round(gap + 0.5),
                                                   "reason": "Funding gap after capped charges"})
                gov = self.act(self.principal("agency@meterwise.example"))
                views.grant_decide(gov, g["id"], {"status": "approved", "approved": g["requested"],
                                                  "note": "Within programme guidelines (example)."})

    def install(self, pid: int, done: int | None = None) -> None:
        self.to(pid, "installation")
        self.act(self.mgr)
        wo = S.create_work_order(self.mgr, pid, {"scheduled_start": clock.today()})
        ip = self.act(self.principal("installer@meterwise.example" if S.get_project(pid)["installer_org_id"] ==
                                      self.org["inst1"] else "installer2@meterwise.example"))
        for i, c in enumerate(wo["checklist"]):
            if done is not None and i >= done:
                break
            S.tick(ip, wo["id"], {"key": c["key"], "done": True})

    def month(self, n: int = 1) -> None:
        self.act(sim.SYSTEM)
        out = {"billing_runs": 0, "readings_added": 0, "faults_opened": 0, "faults_resolved": 0, "payments": 0,
               "late_payments": 0, "mv_runs": 0, "true_ups": 0}
        for _ in range(n):
            sim.step("as_modelled", out)

    # --- the programme
    def run(self) -> None:
        clock.set_offset(START_OFFSET)
        audit.set_actor("seed", "system")
        for key, name, kind, area, contact in ORGS:
            self.org[key] = db.insert("orgs", name=name, kind=kind, example=1, area_json=area, contact_json=contact)
        for name, email, role, okey in USERS:
            uid = auth.create_user(name, email, role, self.org[okey], DEMO_PASSWORD)
            self.users[email] = Principal(role=role, user_id=uid, name=name, email=email, org=auth.org_obj(self.org[okey]))
        db.insert("programmes", name="Western Sydney community housing pilot (example)", example=1,
                  route="community_housing", route_status="usable_now",
                  finance_json={"cost_of_capital": 0.055, "term_years": 10, "savings_share_to_charge": 0.8, "reserve": 0.05},
                  capital_committed=1_500_000, grant_pool=300_000, provider_org_id=self.org["provider"],
                  funder_org_id=self.org["funder"], office_org_id=self.org["council"])
        db.set_setting("targets", '[{"key": "flats_upgraded", "label": "Flats upgraded", "target": 200, "by": "%s"}, '
                       '{"key": "co2e_t_per_year", "label": "Emissions cut (t CO2e a year)", "target": 150, "by": "%s"}]'
                       % (clock.madd(clock.month(), 44), clock.madd(clock.month(), 44)))
        db.set_setting("retention_years", 7)
        self.act(self.mgr)
        L.top_up(self.mgr, {"amount": 6000, "note": "Opening reserve from the grant pool (example)"})

        # Two blocks go live 19 months ago.
        a = self.create("b_000240", "provider")
        b = self.create("b_000271", "provider", package={"induction_cooktop": True, "disconnect_gas": True})
        self.audit_(a, "provider@meterwise.example", flats=15, roof_condition="needs_repair",
                    notes="Two cracked sheets near the parapet to repair before coating. Example audit.")
        self.audit_(b, "provider@meterwise.example", flats=8)
        self.offer_and_consent(a, "provider@meterwise.example", declines=1)
        self.offer_and_consent(b, "provider@meterwise.example")
        self.procure(a, [1.04, 1.09])
        self.procure(b, [1.0, 0.97], accept=1)
        for pid in (a, b):
            self.install(pid)
            self.to(pid, "commissioned")
        # Two flats in block A run their heat pump on its backup element (shows a true-up).
        fa = S.flats_of(a)
        for f in fa[-2:]:
            db.update("flats", f["id"], sim_scenario="underperforming_hot_water")
        self.month()
        for pid in (a, b):
            self.to(pid, "active")
        prov = self.principal("provider@meterwise.example")
        for pid in (a, b):
            for i, f in enumerate(S.flats_of(pid)):
                if f["consent"] != "agreed" or (pid == a and i in (1, 2)):
                    continue  # two flats in A never gave data consent: utility rows for them are rejected
                self.act(prov)
                L.data_consent_set(prov, f["id"], {"given": True, "note": "Signed consent form at the tenant meeting (example)."})
        self.month(1)  # -18: block B's gas meters are removed
        gb = db.q1("SELECT * FROM gas_disconnections WHERE project_id = ?", (b,))
        if gb:
            gas = self.act(self.principal("gas@meterwise.example"))
            views.gas_update(gas, gb["id"], {"status": "completed", "note": "Meters removed (example)."})
        self.month(8)  # offset -10
        fa = S.flats_of(a)
        tp = Principal(role="tenant", flat_id=fa[3]["id"], project_id=a, name="tenant")
        self.act(tp)
        L.open_fault(tp, fa[3]["id"], {"item": "heat_pump_hot_water", "description": "No hot water since Tuesday."})
        self.month(2)  # offset -8
        x = db.q1("SELECT id FROM faults WHERE flat_id = ? AND status = 'open'", (fa[3]["id"],))
        if x:
            self.act(self.principal("installer@meterwise.example"))
            L.resolve_fault(self.mgr, x["id"], {"note": "Replaced the compressor relay under warranty (example)."})
        self.month(2)  # offset -6
        fb = S.flats_of(b)
        self.act(prov)
        L.tenancy_change(prov, fb[1]["id"], {"new_tenant_name": "H. Newcomer", "date": clock.month() + "-15"})

        self.month(1)  # -5: a block commissioned later
        k = self.create("b_000275", "landlord", package={"induction_cooktop": True, "disconnect_gas": True})
        self.audit_(k, "landlord@meterwise.example")
        self.offer_and_consent(k, "landlord@meterwise.example", declines=1)
        self.procure(k, [0.98, 1.05])
        self.month(1)  # -4
        c = self.create("b_000266", "provider")
        self.audit_(c, "provider@meterwise.example", switchboard_amps=40,
                    notes="Old 40 A supply to each flat. Example audit.")
        self.offer_and_consent(c, "provider@meterwise.example", declines=1)
        self.procure(c, [1.12, 1.03], accept=1)
        self.install(k)
        self.month(1)  # -3
        self.install(c, done=7)
        d = self.create("b_000270", "strata")
        self.audit_(d, "strata@meterwise.example")
        self.offer_and_consent(d, "strata@meterwise.example",
                               resolution={"meeting_date": clock.today(), "votes_for": 5, "votes_against": 1,
                                           "kind": "ordinary"})
        self.procure(d, [1.15, 1.06], accept=None)
        gap = S.get_project(d)["deal"]["funding_gap"]
        self.act(self.mgr)
        views.grant_request(self.mgr, {"project_id": d, "requested": round(gap + 500),
                                       "reason": "Expected gap after quotes (example)"})
        self.month(1)  # -2
        self.to(k, "commissioned")
        e = self.create("b_000272", "landlord")
        self.audit_(e, "landlord@meterwise.example")
        self.offer_and_consent(e, "landlord@meterwise.example", declines=1, pending=3)
        self.act(self.mgr)
        gx = views.grant_request(self.mgr, {"project_id": e, "requested": 40000, "reason": "Owner asked for full cost (example)"})
        gov = self.act(self.principal("council@meterwise.example"))
        views.grant_decide(gov, gx["id"], {"status": "declined", "note": "Only the gap after charges is eligible (example)."})
        self.month(1)  # -1
        f_ = self.create("b_000269", "provider")
        self.to(f_, "audit")
        j = self.create("b_000274", "landlord")
        self.audit_(j, "landlord@meterwise.example", roof_colour="dark")
        self.to(j, "offer")
        self.month(1)  # 0
        g = db.q1("SELECT * FROM gas_disconnections WHERE project_id = ?", (k,))
        if g:  # block K replaced every gas appliance: the gas network has booked the disconnection
            gas = self.act(self.principal("gas@meterwise.example"))
            views.gas_update(gas, g["id"], {"status": "scheduled", "scheduled_for": clock.madd(clock.month(), 1) + "-12",
                                            "note": "Crew booked (example)."})
        for bid, owner in (("b_000273", "landlord"), ("b_000268", "provider"), ("b_000239", "provider")):
            self.create(bid, owner)
        # A fault open right now: block B's charge for one flat is paused.
        fb = S.flats_of(b)
        tp = Principal(role="tenant", flat_id=fb[4]["id"], project_id=b, name="tenant")
        self.act(tp)
        L.open_fault(tp, fb[4]["id"], {"item": "reverse_cycle", "description": "Air conditioner blows warm air."},
                     sim_resolve_month=clock.madd(clock.month(), 2))  # repaired if the demo clock is advanced
        # The distributor loads last month's meter data; flats without data consent are rejected row by row.
        dist = self.act(self.principal("distributor@meterwise.example"))
        rows = []
        prev = clock.madd(clock.month(), -1)
        for f in S.flats_of(a)[:6]:
            r = db.q1("SELECT * FROM readings WHERE flat_id = ? AND month = ?", (f["id"], prev))
            if r:
                rows.append({"meter_id": f["meter_id"], "month": prev, "electricity_kwh": round(r["electricity_kwh"] * 1.01, 1),
                             "gas_mj": r["gas_mj"], "mean_outdoor_c": r["mean_outdoor_c"]})
        if rows:
            views.utility_readings(dist, rows)
        audit.set_actor("public", "anonymous")
        views.enquiry_create({"name": "Pat Example", "email": "pat@example.org", "org_kind": "landlord",
                              "address": "24 Bringelly Road, Kingswood", "flats": 8,
                              "message": "We own a walk-up block and would like it considered (example enquiry)."})
        audit.set_actor("seed", "system")
        assert clock.offset() == 0, clock.offset()


def seed() -> dict:
    t = time.time()
    db.wipe()
    Seeder().run()
    return {"seconds": round(time.time() - t, 1), "projects": db.q1("SELECT COUNT(*) AS n FROM projects")["n"]}


def ensure_seeded() -> bool:
    with db.tx():
        if db.q1("SELECT 1 FROM programmes LIMIT 1"):
            return False
        seed()
        return True
