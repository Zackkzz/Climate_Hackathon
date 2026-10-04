"""Analysis endpoints on a small app that mounts only the analysis router."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.analysis import install_error_handlers, router
from meterwise import buildings as B

from .conftest import PILOT_LAT, PILOT_LON

ASSESS = {"building": {"storeys": 3, "flats": 12, "roof_m2": 320.0, "lat": PILOT_LAT, "lon": PILOT_LON,
                       "heat_anomaly_c": 1.0}}


@pytest.fixture(scope="module")
def client():
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(router)
    return TestClient(app)


def _bid():
    return B.load().features[0]["properties"]["id"]


def test_microclimate_and_epw(client):
    r = client.get(f"/api/buildings/{_bid()}/microclimate")
    assert r.status_code == 200
    assert {"building_id", "heat_anomaly_c", "air_temp_adjustment", "base_weather", "summer", "monthly", "notes"} <= set(r.json())
    e = client.get(f"/api/buildings/{_bid()}/weather.epw")
    assert e.status_code == 200 and e.headers["content-type"].startswith("text/plain")
    assert "filename=" in e.headers["content-disposition"] and ".epw" in e.headers["content-disposition"]
    assert e.text.startswith("LOCATION,")
    assert client.get("/api/buildings/nope/microclimate").status_code == 404
    assert "detail" in client.get("/api/buildings/nope/weather.epw").json()


def test_sizing(client):
    r = client.post("/api/sizing", json=ASSESS)
    assert r.status_code == 200
    j = r.json()
    assert {"groups", "hot_water", "electrical", "capex_saved_by_right_sizing", "assumptions", "warnings"} <= set(j)
    g = j["groups"][0]
    for k in ["position", "count", "design_cooling_kw_without_roof", "design_cooling_kw_with_package", "reduction_pct",
              "unit_kw_without_roof", "unit_kw_with_package", "unit_cost_without_roof", "unit_cost_with_package",
              "design_heating_kw"]:
        assert k in g


def test_schedule_and_risk(client):
    s = client.post("/api/schedule", json=dict(ASSESS, start="2027-01"))
    assert s.status_code == 200
    j = s.json()
    assert {"term_years", "months", "start", "end", "groups", "building", "reserve", "cool_roof_ageing",
            "equipment_life_check"} <= set(j)
    assert {"n", "month", "charge", "interest", "principal", "balance"} <= set(j["groups"][0]["rows"][0])
    bad = client.post("/api/schedule", json=dict(ASSESS, start="Jan 2027"))
    assert bad.status_code == 400 and bad.json()["detail"].startswith("Some inputs are not valid")
    r = client.post("/api/risk", json=dict(ASSESS, runs=200, seed=2))
    assert r.status_code == 200
    j = r.json()
    assert {"runs", "seed", "groups", "building", "drivers", "inputs_varied", "safe_share"} <= set(j)
    assert {"p10", "p50", "p90"} <= set(j["groups"][0]["net_saving_per_month"])
    assert client.post("/api/risk", json=dict(ASSESS, runs=5)).status_code == 400


def test_mv_round_trip(client):
    sim = lambda start, up: client.post("/api/mv/simulate", json={  # noqa: E731
        "assess": ASSESS, "position": "top", "start": start, "months": 12, "seed": 7, "scenario": "as_modelled",
        "upgraded": up})
    b, p = sim("2026-01", False), sim("2027-01", True)
    assert b.status_code == 200 and p.status_code == 200
    assert all(x["source"] == "simulated" for x in b.json()["readings"])
    v = client.post("/api/mv/verify", json={"assess": ASSESS, "position": "top", "baseline": b.json()["readings"],
                                            "post": p.json()["readings"], "charge_per_month": 40.0})
    assert v.status_code == 200
    j = v.json()
    for k in ["method", "baseline_fit", "post_months", "modelled_saving_per_month", "verified_saving_per_month",
              "realisation_rate", "uncertainty_per_month", "confidence", "tenant_net_per_month",
              "bill_neutral_verified", "comfort", "by_month", "true_up", "flags"]:
        assert k in j
    assert j["true_up"]["action"] in ("none", "reduce_charge", "refund_from_reserve")
    short = client.post("/api/mv/verify", json={"assess": ASSESS, "position": "top", "baseline": b.json()["readings"][:3],
                                                "post": p.json()["readings"], "charge_per_month": 40.0})
    assert short.status_code == 400
    assert client.post("/api/mv/simulate", json={"assess": ASSESS, "scenario": "magic"}).status_code == 400


def test_portfolio_plan(client):
    ids = [f["properties"]["id"] for f in B.load().features[:6]]
    r = client.post("/api/portfolio/plan", json={"building_ids": ids, "capital_budget": 200000, "grant_budget": 50000,
                                                 "objective": "heat_relief"})
    assert r.status_code == 200
    j = r.json()
    assert {"selected", "not_selected", "totals", "bulk", "method"} <= set(j)
    assert client.post("/api/portfolio/plan", json={"building_ids": ["nope"]}).status_code == 404
