"""System date advance (the /api/sim routes; switched off when METERWISE_DEMO=0).

Each month, for every active project: simulated readings for the month just finished (``source: "simulated"``; real
uploaded or utility readings are never overwritten), seeded faults that open and resolve, a billing run, payments with
a seeded small share paid late, and a measured-savings run after every 12 months of charge. Randomness is seeded from
(flat, month), so the same starting state always gives the same result.
"""
from __future__ import annotations

import random

from . import analysis, audit, clock, db
from . import ledger as L
from . import service as S
from .auth import Principal
from .errors import bad

SCENARIOS = ("as_modelled", "mixed", "underperforming")
MIXED = ["as_modelled"] * 6 + ["high_use", "low_use", "underperforming_hot_water", "faulty_ac"]
FAULT_RATE = 0.012
LATE_RATE = 0.05
SYSTEM = Principal(role="manager", name="System date", user_id=0)
INSTALLER_SYSTEM = Principal(role="manager", name="Installer", user_id=0)


def rng(*key) -> random.Random:
    return random.Random(S.stable_int("sim", *key))


def flat_scenario(f: dict, scenario: str) -> str:
    if f["sim_scenario"]:
        return f["sim_scenario"]
    if scenario == "mixed":
        return MIXED[S.stable_int("mix", f["id"]) % len(MIXED)]
    if scenario == "underperforming":
        return "underperforming_hot_water"
    return "as_modelled"


def ensure_baseline(pr: dict, scenario: str) -> int:
    added = 0
    start = pr["start_month"]
    frm = clock.madd(start, -12)
    req = S.assess_request(pr)
    for f in db.q("SELECT * FROM flats WHERE project_id = ? AND participating = 1", (pr["id"],)):
        have = db.q1("SELECT COUNT(*) AS n FROM readings WHERE flat_id = ? AND month >= ? AND month < ?",
                     (f["id"], frm, start))["n"]
        if have >= 12:
            continue
        for r in analysis.simulate(req, f["position"], 12, frm, f["sim_seed"], flat_scenario(f, scenario), False):
            L.store_reading(f["id"], r, "simulated")
            added += 1
    return added


def advance(p: Principal, months: int, scenario: str | None = None) -> dict:
    if not isinstance(months, int) or not 1 <= months <= 36:
        raise bad("months must be a whole number from 1 to 36.")
    scenario = scenario or "as_modelled"
    if scenario not in SCENARIOS:
        raise bad("scenario must be one of: " + ", ".join(SCENARIOS))
    out = {"months": months, "scenario": scenario, "billing_runs": 0, "readings_added": 0, "faults_opened": 0,
           "faults_resolved": 0, "payments": 0, "late_payments": 0, "mv_runs": 0, "true_ups": 0}
    for _ in range(months):
        step(scenario, out)
    out["month"] = clock.month()
    out["clock"] = clock.info()
    audit.log("sim.advance", None, {k: v for k, v in out.items() if k != "clock"}, by=p.label, role=p.role)
    return out


def step(scenario: str, out: dict) -> None:
    clock.set_offset(clock.offset() + 1)
    m = clock.month()
    prev = clock.madd(m, -1)
    projects = db.q("SELECT * FROM projects WHERE stage = 'active' ORDER BY id")
    for pr in projects:
        pr = S.get_project(pr["id"])
        out["readings_added"] += ensure_baseline(pr, scenario)
        req = S.assess_request(pr)
        flats = db.q("SELECT * FROM flats WHERE project_id = ? AND participating = 1 ORDER BY id", (pr["id"],))
        if pr["charge_start"] <= prev <= pr["charge_end"]:
            for f in flats:
                for r in analysis.simulate(req, f["position"], 1, prev, f["sim_seed"], flat_scenario(f, scenario), True):
                    L.store_reading(f["id"], r, "simulated")
                    out["readings_added"] += 1
        # faults the simulator opened earlier get fixed
        for x in db.q("SELECT * FROM faults WHERE project_id = ? AND status = 'open' AND sim_resolve_month IS NOT NULL "
                      "AND sim_resolve_month <= ?", (pr["id"], m)):
            L.resolve_fault(INSTALLER_SYSTEM, x["id"], {"note": "Repaired under warranty"})
            out["faults_resolved"] += 1
        if pr["charge_start"] <= m <= pr["charge_end"]:
            for f in flats:
                if f["charge_status"] == "paused":
                    continue
                g = rng("fault", f["id"], m)
                if g.random() < FAULT_RATE:
                    items = [i["key"] for i in L.installed_items(pr) if i["key"] in ("heat_pump_hot_water", "reverse_cycle")]
                    if not items:
                        continue
                    item = items[g.randrange(len(items))]
                    desc = {"heat_pump_hot_water": "No hot water",
                            "reverse_cycle": "Air conditioner not cooling"}[item]
                    tenant = Principal(role="tenant", flat_id=f["id"], project_id=pr["id"], name="tenant")
                    L.open_fault(tenant, f["id"], {"item": item, "description": desc},
                                 sim_resolve_month=clock.madd(m, 1 + g.randrange(2)))
                    out["faults_opened"] += 1
    L._bill(m, "System date")
    out["billing_runs"] += 1
    for pr in db.q("SELECT * FROM projects WHERE stage IN ('active','closed') ORDER BY id"):
        for f in db.q("SELECT * FROM flats WHERE project_id = ? AND participating = 1 ORDER BY id", (pr["id"],)):
            bal = L.balance(f["id"])
            if bal <= 0.005:
                continue
            if rng("late", f["id"], m).random() < LATE_RATE:
                out["late_payments"] += 1
                continue
            L.post(f["id"], "payment", -bal, m, "Payment collected with rent")
            out["payments"] += 1
    for pr in projects:
        pr = S.get_project(pr["id"])
        n = clock.mdiff(prev, pr["charge_start"]) + 1
        if n > 0 and n % 12 == 0 and prev <= pr["charge_end"] and not db.q1(
                "SELECT 1 FROM mv_runs WHERE project_id = ? AND period_to = ?", (pr["id"], prev)):
            try:
                run = L.run_mv(SYSTEM, pr["id"], {"from": clock.madd(prev, -11), "to": prev})
                out["mv_runs"] += 1
                out["true_ups"] += len(run["true_ups"])
            except Exception as e:  # noqa: BLE001 - a failed check is logged, not fatal to the clock
                audit.log("mv.run_failed", pr["id"], {"reason": str(e)[:300]})
