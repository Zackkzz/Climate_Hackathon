"""Whole-building assessment: bookkeeping identities and behaviour of the package and deal."""
import random

import pytest

from meterwise.assess import anomaly_to_air_c, assess, group_counts
from meterwise.systems import USAGE_END_USES

from .conftest import make_request


def groups(r):
    return {g["position"]: g for g in r["flat_groups"]}


def test_group_counts():
    assert group_counts(3, 12) == {"top": 4, "lower": 8}
    assert group_counts(1, 5) == {"top": 5}
    assert group_counts(4, 10) == {"top": 2, "lower": 8}  # 10/4 = 2.5 rounds to 2 (banker's rounding)


def test_end_uses_and_months_add_up_to_the_bill():
    r = assess(make_request())
    for g in r["flat_groups"]:
        for side in ("baseline", "upgraded"):
            s = g[side]
            assert sum(e["cost_per_year"] for e in s["by_end_use"]) == pytest.approx(s["bill_per_year"], abs=0.1)
            assert sum(e["electricity_kwh"] for e in s["by_end_use"]) == pytest.approx(s["electricity_kwh"], abs=0.5)
            assert sum(e["gas_mj"] for e in s["by_end_use"]) == pytest.approx(s["gas_mj"], abs=0.5)
    n = r["building"]["flats"]
    avg_base = sum(g["count"] * g["baseline"]["bill_per_year"] for g in r["flat_groups"]) / n
    assert sum(m["baseline_bill"] for m in r["monthly"]) == pytest.approx(avg_base, abs=0.2)


def test_item_savings_add_up_to_building_saving():
    for pkg in [{}, {"induction_cooktop": True, "disconnect_gas": True, "ceiling_insulation": True}]:
        r = assess(make_request(package=pkg))
        total = sum(i["saving_per_year"] for i in r["package"]["items"])
        assert total == pytest.approx(r["impact"]["bill_saving_per_year_building"], abs=0.5)


def test_cool_roof_never_changes_lower_floor_result():
    on = groups(assess(make_request(package={"cool_roof": True})))["lower"]
    off = groups(assess(make_request(package={"cool_roof": False})))["lower"]
    for k in ("baseline", "upgraded", "saving_per_year", "comfort"):
        assert on[k] == off[k]


def test_cool_roof_lowers_top_floor_heat():
    top = groups(assess(make_request()))["top"]["comfort"]
    assert top["peak_indoor_c_upgraded"] < top["peak_indoor_c_baseline"]
    assert top["hours_above_30c_upgraded"] < top["hours_above_30c_baseline"]


def test_rebound_when_flat_had_no_air_conditioning():
    r = assess(make_request(existing={"cooling": "none"}, package={"cool_roof": False}))
    for g in r["flat_groups"]:
        cool_b = next(e for e in g["baseline"]["by_end_use"] if e["key"] == "cooling")
        cool_u = next(e for e in g["upgraded"]["by_end_use"] if e["key"] == "cooling")
        assert cool_b["electricity_kwh"] == 0
        assert cool_u["electricity_kwh"] > 0  # air conditioning adds energy where there was none
    assert any("no air conditioning now" in w for w in r["warnings"])


def test_negative_saving_gets_zero_charge_and_warning():
    # Gas heating replaced by nothing useful: only add air conditioning to flats that had no cooling or heating,
    # with very cheap gas, so bills rise.
    r = assess(make_request(existing={"heating": "none", "cooling": "none"},
                            package={"heat_pump_hot_water": False, "cool_roof": False, "reverse_cycle": True},
                            tariff={"gas_c_per_mj": 1.0}))
    for g in r["flat_groups"]:
        assert g["saving_per_year"] < 0
        assert g["charge_per_month"] == 0
        assert g["bill_neutral"] is False
    assert r["package"]["fully_funded"] is False
    assert any("bill rises" in w for w in r["warnings"])


def test_gas_disconnection_removes_supply_charge_only_when_allowed():
    full = assess(make_request(package={"induction_cooktop": True, "disconnect_gas": True}))
    for g in full["flat_groups"]:
        assert next(e for e in g["upgraded"]["by_end_use"] if e["key"] == "gas_supply")["cost_per_year"] == 0
        assert g["upgraded"]["gas_mj"] == 0
    assert next(i for i in full["package"]["items"] if i["key"] == "disconnect_gas")["capex"] > 0
    partial = assess(make_request(package={"induction_cooktop": False, "disconnect_gas": True}))
    assert any("Gas disconnection was ignored" in w for w in partial["warnings"])
    for g in partial["flat_groups"]:
        assert next(e for e in g["upgraded"]["by_end_use"] if e["key"] == "gas_supply")["cost_per_year"] > 0
    assert next(i for i in partial["package"]["items"] if i["key"] == "disconnect_gas")["capex"] == 0


def test_property_bill_neutral_whenever_fully_funded_and_charge_within_cap():
    rng = random.Random(7)
    seen_funded = seen_unfunded = 0
    for _ in range(25):
        req = make_request(
            building={"storeys": rng.randint(1, 4), "flats": rng.randint(4, 24), "roof_m2": rng.uniform(150, 600),
                      "heat_anomaly_c": rng.uniform(-3, 4)},
            existing={"hot_water": rng.choice(["gas_storage", "gas_instant", "electric_storage"]),
                      "heating": rng.choice(["gas_heater", "electric_resistive", "none"]),
                      "cooling": rng.choice(["none", "old_ac"])},
            package={"cool_roof": rng.random() < 0.5, "induction_cooktop": rng.random() < 0.5,
                     "disconnect_gas": rng.random() < 0.5},
            finance={"cost_of_capital": rng.uniform(0, 0.1), "term_years": rng.randint(5, 20),
                     "savings_share_to_charge": rng.uniform(0.3, 1.0)},
        )
        r = assess(req)
        share = r["finance"]["savings_share_to_charge"]
        for g in r["flat_groups"]:
            assert g["charge_per_month"] >= 0
            assert g["charge_per_month"] <= max(0.0, share * g["saving_per_year"] / 12) + 0.01
        if r["package"]["fully_funded"]:
            seen_funded += 1
            assert all(g["bill_neutral"] for g in r["flat_groups"] if g["count"] > 0)
            assert r["package"]["funding_gap"] == 0
            assert r["package"]["max_fundable_capex"] >= r["package"]["net_capex"] - 0.5
        else:
            seen_unfunded += 1
            assert r["package"]["funding_gap"] > 0
    assert seen_funded and seen_unfunded  # the sample exercised both branches


def test_higher_cost_of_capital_never_raises_max_fundable():
    prev = None
    for rate in [0.0, 0.02, 0.04, 0.055, 0.08, 0.12]:
        m = assess(make_request(finance={"cost_of_capital": rate}))["package"]["max_fundable_capex"]
        if prev is not None:
            assert m <= prev + 1e-6
        prev = m


def test_fully_funded_investor_earns_cost_of_capital():
    r = assess(make_request(finance={"cost_of_capital": 0.03, "term_years": 15},
                            package={"cool_roof": False, "induction_cooktop": True, "disconnect_gas": True}))
    assert r["package"]["fully_funded"]
    assert r["finance"]["investor_return_pct"] == pytest.approx(3.0, abs=0.01)


def test_anomaly_conversion_is_capped_and_labelled():
    assert anomaly_to_air_c(2.0) == pytest.approx(0.6)
    assert anomaly_to_air_c(20.0) == pytest.approx(1.5)
    assert anomaly_to_air_c(-20.0) == pytest.approx(-1.5)
    r = assess(make_request(building={"heat_anomaly_c": 3.0}))
    a = next(x for x in r["assumptions"] if x["key"] == "heat_anomaly_air_c")
    assert a["kind"] == "assumption" and "Not measured air temperature" in a["note"]


def test_hotter_building_has_more_heat_hours():
    cool = groups(assess(make_request(building={"heat_anomaly_c": -3.0})))["top"]["comfort"]
    hot = groups(assess(make_request(building={"heat_anomaly_c": 4.0})))["top"]["comfort"]
    assert hot["hours_above_30c_baseline"] >= cool["hours_above_30c_baseline"]


def test_usage_end_uses_present():
    r = assess(make_request())
    keys = [e["key"] for e in r["flat_groups"][0]["baseline"]["by_end_use"]]
    assert set(USAGE_END_USES) <= set(keys)


def test_gap_closers_are_consistent():
    r = assess(make_request(package={"cool_roof": False, "induction_cooktop": True, "disconnect_gas": True}))
    gc = r["package"]["gap_closers"]
    assert gc["grant_needed"] == r["package"]["funding_gap"]
    rate = gc["cost_of_capital_for_full_funding"]
    assert rate is not None
    at = assess(make_request(package={"cool_roof": False, "induction_cooktop": True, "disconnect_gas": True},
                             finance={"cost_of_capital": max(rate - 0.0005, 0)}))
    above = assess(make_request(package={"cool_roof": False, "induction_cooktop": True, "disconnect_gas": True},
                                finance={"cost_of_capital": rate + 0.002}))
    assert at["package"]["fully_funded"] and not above["package"]["fully_funded"]
    term = gc["term_years_for_full_funding"]
    if term is not None:
        ok = assess(make_request(package={"cool_roof": False, "induction_cooktop": True, "disconnect_gas": True},
                                 finance={"term_years": term}))
        assert ok["package"]["fully_funded"]
