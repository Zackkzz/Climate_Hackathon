"""API contract tests (docs/api-contract.md) using FastAPI's TestClient."""
import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)

GROUP_FIELDS = {"position", "label", "count", "baseline", "upgraded", "saving_per_year", "charge_per_month",
                "net_saving_per_month", "net_saving_pct", "bill_neutral", "comfort"}
SUMMARY_FIELDS = {"electricity_kwh", "gas_mj", "bill_per_year", "by_end_use"}
END_USE_FIELDS = {"key", "label", "cost_per_year", "electricity_kwh", "gas_mj"}
COMFORT_FIELDS = {"hours_above_30c_baseline", "hours_above_30c_upgraded", "peak_indoor_c_baseline", "peak_indoor_c_upgraded"}
ITEM_FIELDS = {"key", "label", "selected", "capex", "rebate", "net_capex", "applies_to", "saving_per_year", "note"}
PACKAGE_FIELDS = {"items", "capex_total", "rebates_total", "net_capex", "max_fundable_capex", "fully_funded", "funding_gap"}
FINANCE_FIELDS = {"term_years", "cost_of_capital", "savings_share_to_charge", "reserve", "charge_per_month_building",
                  "total_repaid", "investor_return_pct", "owner_upfront_cost", "tenant_upfront_cost"}
IMPACT_FIELDS = {"bill_saving_per_year_building", "co2e_t_per_year_saved", "gas_mj_per_year_avoided",
                 "energy_reduction_pct", "peak_cooling_kw_change"}
BUILDING_FIELDS = {"id", "label", "storeys", "flats", "roof_m2", "flat_area_m2", "heat_anomaly_c", "heat_band"}
FEATURE_PROPS = {"id", "label", "suburb", "storeys", "storeys_source", "flats_est", "footprint_m2", "roof_m2",
                 "heat_anomaly_c", "heat_band", "renter_share", "quick_score"}


def first_ids(n=3):
    feats = client.get("/api/buildings").json()["features"]
    return [f["properties"]["id"] for f in feats[:n]]


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_shape():
    m = client.get("/api/meta").json()
    assert {"pilot", "defaults", "options", "data_notes"} <= set(m)
    assert {"name", "description", "centre", "bbox", "building_count"} <= set(m["pilot"])
    assert {"lat", "lon"} <= set(m["pilot"]["centre"]) and len(m["pilot"]["bbox"]) == 4
    d = m["defaults"]
    assert set(d["existing"]) == {"hot_water", "heating", "cooling", "cooktop", "roof"}
    assert set(d["package"]) == {"cool_roof", "heat_pump_hot_water", "reverse_cycle", "induction_cooktop",
                                 "ceiling_insulation", "disconnect_gas"}
    assert set(d["finance"]) == {"cost_of_capital", "term_years", "savings_share_to_charge", "reserve", "apply_rebates"}
    assert set(d["tariff"]) == {"electricity_c_per_kwh", "electricity_supply_c_per_day", "gas_c_per_mj", "gas_supply_c_per_day"}
    for k in ["hot_water", "heating", "cooling", "cooktop", "roof"]:
        assert all({"key", "label"} <= set(o) for o in m["options"][k])
        assert d["existing"][k] in [o["key"] for o in m["options"][k]]
    assert any("not engineering or financial advice" in n for n in m["data_notes"])


def test_buildings_geojson():
    fc = client.get("/api/buildings").json()
    assert fc["type"] == "FeatureCollection" and fc["features"]
    bands = {"cooler", "average", "warm", "hot", "hottest"}
    for f in fc["features"]:
        assert f["type"] == "Feature"
        assert f["geometry"]["type"] in ("Polygon", "MultiPolygon")
        assert FEATURE_PROPS <= set(f["properties"])
        assert f["properties"]["heat_band"] in bands
        assert f["properties"]["storeys_source"] in ("osm", "assumed")
        assert 0 <= f["properties"]["quick_score"] <= 100


def test_building_by_id_and_404():
    bid = first_ids(1)[0]
    assert client.get(f"/api/buildings/{bid}").json()["properties"]["id"] == bid
    r = client.get("/api/buildings/does_not_exist")
    assert r.status_code == 404 and isinstance(r.json()["detail"], str)


def check_assess(body):
    assert {"building", "flat_groups", "package", "finance", "impact", "monthly", "heatwave", "assumptions",
            "warnings"} <= set(body)
    assert BUILDING_FIELDS <= set(body["building"])
    positions = [g["position"] for g in body["flat_groups"]]
    assert positions[0] == "top"
    if body["building"]["storeys"] > 1:
        assert "lower" in positions
    assert sum(g["count"] for g in body["flat_groups"]) == body["building"]["flats"]
    for g in body["flat_groups"]:
        assert GROUP_FIELDS <= set(g)
        for side in ("baseline", "upgraded"):
            assert SUMMARY_FIELDS <= set(g[side])
            for e in g[side]["by_end_use"]:
                assert END_USE_FIELDS <= set(e)
        assert COMFORT_FIELDS <= set(g["comfort"])
        assert isinstance(g["bill_neutral"], bool)
    assert PACKAGE_FIELDS <= set(body["package"])
    for i in body["package"]["items"]:
        assert ITEM_FIELDS <= set(i) and i["applies_to"] in ("building", "flat")
        assert i["net_capex"] == pytest.approx(i["capex"] - i["rebate"], abs=0.02)
    p = body["package"]
    assert p["net_capex"] == pytest.approx(p["capex_total"] - p["rebates_total"], abs=0.05)
    assert p["fully_funded"] == (p["funding_gap"] == 0)
    assert FINANCE_FIELDS <= set(body["finance"])
    assert body["finance"]["owner_upfront_cost"] == 0 and body["finance"]["tenant_upfront_cost"] == 0
    assert IMPACT_FIELDS <= set(body["impact"])
    assert len(body["monthly"]) == 12
    assert [m["month"] for m in body["monthly"]] == list(range(1, 13))
    for m in body["monthly"]:
        assert {"month", "label", "baseline_bill", "upgraded_bill", "charge"} <= set(m)
    hw = body["heatwave"]
    assert {"label", "start", "hours", "outdoor_c", "indoor_top_baseline_c", "indoor_top_upgraded_c"} <= set(hw)
    assert len(hw["hours"]) == len(hw["outdoor_c"]) == len(hw["indoor_top_baseline_c"]) == len(hw["indoor_top_upgraded_c"]) == 168
    for a in body["assumptions"]:
        assert {"key", "label", "value", "unit", "source", "kind"} <= set(a)
        assert a["kind"] in ("sourced", "assumption")
        if a["kind"] == "sourced":
            assert a["source"].startswith("http")
        else:
            assert a["source"] == "assumption"
    assert all(isinstance(w, str) for w in body["warnings"])


def test_assess_by_id_full_contract():
    r = client.post("/api/assess", json={"building_id": first_ids(1)[0]})
    assert r.status_code == 200
    check_assess(r.json())


def test_assess_custom_building_and_all_options():
    body = {
        "building": {"storeys": 3, "flats": 12, "roof_m2": 310.5, "flat_area_m2": 65, "lat": -33.92, "lon": 151.07,
                     "heat_anomaly_c": 2.4},
        "existing": {"hot_water": "gas_instant", "heating": "gas_heater", "cooling": "old_ac", "cooktop": "gas", "roof": "light"},
        "package": {"cool_roof": True, "heat_pump_hot_water": True, "reverse_cycle": True, "induction_cooktop": True,
                    "ceiling_insulation": True, "disconnect_gas": True},
        "finance": {"cost_of_capital": 0.055, "term_years": 12, "savings_share_to_charge": 0.8, "reserve": 0.05,
                    "apply_rebates": False},
        "tariff": {"electricity_c_per_kwh": 33.0, "electricity_supply_c_per_day": 105.0, "gas_c_per_mj": 4.5,
                   "gas_supply_c_per_day": 70.0},
    }
    r = client.post("/api/assess", json=body)
    assert r.status_code == 200
    j = r.json()
    check_assess(j)
    assert j["package"]["rebates_total"] == 0
    # Overridden tariff shows up as a user assumption.
    a = next(x for x in j["assumptions"] if x["key"] == "electricity_c_per_kwh")
    assert a["value"] == 33.0 and a["kind"] == "assumption"


def test_assess_single_storey_has_only_top_group():
    r = client.post("/api/assess", json={"building": {"storeys": 1, "flats": 4, "roof_m2": 300, "lat": -33.92, "lon": 151.07}})
    assert [g["position"] for g in r.json()["flat_groups"]] == ["top"]


def test_assess_building_override_applies():
    bid = first_ids(1)[0]
    r = client.post("/api/assess", json={"building_id": bid, "building": {"flats": 7}}).json()
    assert r["building"]["flats"] == 7 and r["building"]["id"] == bid


def test_assess_errors_are_plain_400_or_404():
    r = client.post("/api/assess", json={"building": {"storeys": 3}})
    assert r.status_code == 400 and isinstance(r.json()["detail"], str)
    r = client.post("/api/assess", json={"building_id": "nope"})
    assert r.status_code == 404 and isinstance(r.json()["detail"], str)
    r = client.post("/api/assess", json={"building_id": first_ids(1)[0], "existing": {"hot_water": "solar"}})
    assert r.status_code == 400 and isinstance(r.json()["detail"], str)
    r = client.post("/api/assess", json={"building_id": first_ids(1)[0], "finance": {"term_years": -1}})
    assert r.status_code == 400


def test_portfolio_contract():
    ids = first_ids(3)
    r = client.post("/api/portfolio", json={"building_ids": ids, "finance": {}, "package": {}, "existing": {}, "tariff": {}})
    assert r.status_code == 200
    j = r.json()
    assert [x["building_id"] for x in j["results"]] == ids
    for x in j["results"]:
        assert {"building_id", "label", "flats", "heat_band", "net_capex", "fully_funded", "funding_gap",
                "tenant_net_saving_per_month", "co2e_t_per_year_saved"} <= set(x)
    t = j["totals"]
    assert {"buildings", "flats", "net_capex", "funding_gap", "co2e_t_per_year_saved", "fully_funded_count"} <= set(t)
    assert t["buildings"] == 3 and t["flats"] == sum(x["flats"] for x in j["results"])


def test_portfolio_limits():
    assert client.post("/api/portfolio", json={"building_ids": ["x"] * 51}).status_code == 400
    assert client.post("/api/portfolio", json={"building_ids": []}).status_code == 400
    assert client.post("/api/portfolio", json={"building_ids": ["nope"]}).status_code == 404


def test_cors_for_local_dev():
    r = client.options("/api/assess", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
