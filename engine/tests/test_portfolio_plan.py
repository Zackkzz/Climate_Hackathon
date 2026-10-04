"""Portfolio planner."""
import time

import pytest

from meterwise import buildings as B
from meterwise import portfolio as PF
from meterwise.assess import AssessError


def _ids(n=12):
    return [f["properties"]["id"] for f in B.load().features[:n]]


def test_respects_budgets():
    r = PF.plan({"building_ids": _ids(), "capital_budget": 300000, "grant_budget": 60000, "objective": "co2"},
                allow_network=False)
    t = r["totals"]
    assert t["capital_used"] <= 300000 + 1 and t["grant_used"] <= 60000 + 1
    assert t["capital_left"] == pytest.approx(300000 - t["capital_used"], abs=2)
    assert len(r["selected"]) + len(r["not_selected"]) == 12
    assert all(s["capital_used"] + s["grant_used"] == pytest.approx(s["net_capex"], abs=2) for s in r["selected"])
    assert all(n["reason"] for n in r["not_selected"])
    assert r["method"]


def test_big_budget_takes_everything_with_benefit():
    r = PF.plan({"building_ids": _ids(), "capital_budget": 1e9, "grant_budget": 1e9, "objective": "flats_reached"},
                allow_network=False)
    assert len(r["selected"]) == 12


def test_bulk_lowers_cost():
    body = {"building_ids": _ids(30), "capital_budget": 1e9, "grant_budget": 1e9, "objective": "flats_reached"}
    a = PF.plan(dict(body, bulk=True), allow_network=False)
    b = PF.plan(dict(body, bulk=False), allow_network=False)
    cost = lambda r: r["totals"]["capital_used"] + r["totals"]["grant_used"]  # noqa: E731
    assert cost(a) <= cost(b)
    assert all(t["kind"] == "assumption" for t in a["bulk"]["tiers"])
    assert b["bulk"]["capex_saved"] == 0


def test_bad_inputs():
    with pytest.raises(AssessError):
        PF.plan({"objective": "fun", "capital_budget": 1, "grant_budget": 1}, allow_network=False)
    with pytest.raises(AssessError):
        PF.plan({"building_ids": ["nope"], "capital_budget": 1, "grant_budget": 1}, allow_network=False)


def test_default_set_within_time_limit():
    t = time.time()
    r = PF.plan({"capital_budget": 1_500_000, "grant_budget": 300_000, "objective": "tenant_saving"},
                allow_network=False)
    assert time.time() - t < 20
    assert r["candidates"] <= 120 and r["totals"]["buildings"] >= 1
