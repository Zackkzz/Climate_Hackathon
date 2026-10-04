"""Charge schedule and risk."""
import time

import pytest

from meterwise import tariff as TF
from meterwise.assess import AssessError, assess

from .conftest import make_request


def test_schedule_consistent_with_deal():
    req = make_request()
    r = assess(req, allow_network=False)
    s = TF.schedule(req, "2027-01", allow_network=False)
    assert s["months"] == 120 and s["start"] == "2027-01" and s["end"] == "2036-12"
    charges = {g["position"]: g["charge_per_month"] for g in r["flat_groups"]}
    for g in s["groups"]:
        assert g["charge_per_month"] == pytest.approx(charges[g["position"]], abs=0.01)
        assert len(g["rows"]) == 120
        assert g["rows"][-1]["balance"] == pytest.approx(0, abs=0.05)
        assert g["rows"][0]["balance"] < g["principal_per_flat"]
        paid = sum(x["principal"] for x in g["rows"])
        assert paid == pytest.approx(g["principal_per_flat"], abs=0.5)
        for x in g["rows"][:3]:
            assert x["charge"] == pytest.approx(x["interest"] + x["principal"] + x["reserve"], abs=0.02)
    b = s["building"]
    assert b["charge_per_month"] == pytest.approx(r["finance"]["charge_per_month_building"], abs=0.05)
    assert b["principal"] == pytest.approx(r["package"]["net_capex"] - r["package"]["funding_gap"], rel=1e-3)
    assert s["reserve"]["contribution_total"] == pytest.approx(b["total_repaid"] * 0.05, rel=1e-6)
    assert s["cool_roof_ageing"]["used_in_model"] == "aged"
    assert s["cool_roof_ageing"]["reflectance_aged_3yr"] < s["cool_roof_ageing"]["reflectance_new"]
    assert all(x["ok"] for x in s["equipment_life_check"])


def test_schedule_bad_start():
    with pytest.raises(AssessError):
        TF.schedule(make_request(), "2027-13", allow_network=False)


def test_risk_seeded_and_shaped():
    req = make_request()
    a = TF.risk(req, 300, 3, allow_network=False)
    b = TF.risk(req, 300, 3, allow_network=False)
    assert a == b
    assert a["runs"] == 300
    for g in a["groups"]:
        q = g["net_saving_per_month"]
        assert q["p10"] <= q["p50"] <= q["p90"]
        assert 0 <= g["prob_tenant_worse_off"] <= 1 and 0 <= g["prob_saving_below_charge"] <= 1
    shares = [d["share_of_variance"] for d in a["drivers"]]
    assert sum(shares) == pytest.approx(1.0, abs=0.01)
    assert 0 <= a["safe_share"]["savings_share_to_charge"] <= 1
    assert {i["key"] for i in a["inputs_varied"]} >= {"occupant_use", "electricity_price", "gas_price", "roof_ageing"}
    assert 0 <= a["building"]["prob_fully_funded"] <= 1


def test_safe_share_meets_its_definition():
    req = make_request()
    out = TF.risk(req, 400, 5, allow_network=False)
    s = out["safe_share"]["savings_share_to_charge"]
    if s < 1.0:
        safe = make_request(finance={"savings_share_to_charge": s})
        again = TF.risk(safe, 400, 5, allow_network=False)
        for g in again["groups"]:
            if g["charge_per_month"] > 0:
                assert g["prob_tenant_worse_off"] <= 0.05 + 1e-9


def test_risk_is_fast():
    t = time.time()
    TF.risk(make_request(), 2000, 1, allow_network=False)
    assert time.time() - t < 5
