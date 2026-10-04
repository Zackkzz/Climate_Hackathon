"""Measurement and verification on simulated readings."""
import pytest

from meterwise import mv as MV
from meterwise.assess import AssessError, assess

from .conftest import make_request

REQ = make_request()


def _charges():
    r = assess(REQ, allow_network=False)
    return {g["position"]: g["charge_per_month"] for g in r["flat_groups"]}


def _pair(position, scenario, seed):
    base = MV.simulate(REQ, position, 12, "2026-01", seed, scenario, False, allow_network=False)
    post = MV.simulate(REQ, position, 12, "2027-01", seed, scenario, True, allow_network=False)
    return base, post


def test_simulated_readings_are_labelled_and_seeded():
    a = MV.simulate(REQ, "top", 14, "2026-11", 3, "as_modelled", True, allow_network=False)
    b = MV.simulate(REQ, "top", 14, "2026-11", 3, "as_modelled", True, allow_network=False)
    assert a == b and len(a) == 14
    assert a[0]["month"] == "2026-11" and a[-1]["month"] == "2027-12"
    assert all(r["source"] == "simulated" for r in a)
    assert all(r["electricity_kwh"] > 0 for r in a)
    # the upgraded flat has no gas use when every gas appliance is replaced except the cooktop (gas cooktop kept)
    assert all(r["gas_mj"] >= 0 for r in a)


@pytest.mark.parametrize("position,seed", [("top", 7), ("top", 42), ("lower", 7), ("lower", 1)])
def test_verify_recovers_known_saving(position, seed):
    """The counterfactual (same household, same weather, no upgrade) is known for simulated data, so the true
    saving is known. The verified saving must be within its own stated uncertainty of it."""
    base, post = _pair(position, "as_modelled", seed)
    cf = MV.simulate(REQ, position, 12, "2027-01", seed, "as_modelled", False, allow_network=False)
    v = MV.verify(REQ, position, base, post, 0.0, allow_network=False)
    truth = MV.verify(REQ, position, base, cf, 0.0, allow_network=False)
    # true saving = cost(counterfactual) - cost(post): both priced the same way in by_month
    true_saving = sum(c["actual_cost"] - p["actual_cost"] for c, p in zip(truth["by_month"], v["by_month"])) / 12
    assert abs(v["verified_saving_per_month"] - true_saving) <= v["uncertainty_per_month"]
    assert v["baseline_fit"]["r2"] > 0.8
    assert 0.7 < v["realisation_rate"] < 1.3


EXPECTED = {"as_modelled": "none", "high_use": "none", "low_use": "refund_from_reserve",
            "underperforming_hot_water": "refund_from_reserve", "faulty_ac": "refund_from_reserve"}


@pytest.mark.parametrize("scenario", list(EXPECTED))
@pytest.mark.parametrize("position", ["top", "lower"])
def test_scenarios_give_expected_true_up(scenario, position):
    charge = _charges()[position]
    base, post = _pair(position, scenario, 7)
    v = MV.verify(REQ, position, base, post, charge, allow_network=False)
    tu = v["true_up"]
    assert tu["action"] == EXPECTED[scenario]
    if tu["action"] == "none":
        assert tu["new_charge_per_month"] == pytest.approx(charge) and tu["refund"] == 0
    else:
        assert tu["new_charge_per_month"] < charge
        assert tu["refund"] == pytest.approx((charge - tu["new_charge_per_month"]) * 12, abs=0.05)
        # the tenant keeps at least 1 - share of the verified saving
        assert tu["new_charge_per_month"] <= 0.8 * max(v["verified_saving_per_month"], 0) + 0.01
    assert any("modelled estimates" in f for f in v["flags"])


def test_reduce_charge_when_charge_above_cap_but_below_saving():
    base, post = _pair("top", "as_modelled", 7)
    v0 = MV.verify(REQ, "top", base, post, 0.0, allow_network=False)
    s, u = v0["verified_saving_per_month"], v0["uncertainty_per_month"]
    assert s - 0.8 * s - u > 0
    charge = 0.8 * s + u + 0.5 * (s - 0.8 * s - u)
    v = MV.verify(REQ, "top", base, post, charge, allow_network=False)
    assert v["true_up"]["action"] == "reduce_charge"
    assert v["true_up"]["new_charge_per_month"] == pytest.approx(0.8 * s, abs=0.01)


def test_fault_flag_and_comfort():
    base, post = _pair("top", "underperforming_hot_water", 7)
    v = MV.verify(REQ, "top", base, post, 50.0, allow_network=False)
    assert any("heat pump" in f for f in v["flags"])
    assert v["comfort"]["hours_above_30c_before"] is not None


def test_too_few_readings():
    base, post = _pair("top", "as_modelled", 7)
    with pytest.raises(AssessError):
        MV.verify(REQ, "top", base[:5], post, 10.0, allow_network=False)
    with pytest.raises(AssessError):
        MV.verify(REQ, "top", base, post[:2], 10.0, allow_network=False)
