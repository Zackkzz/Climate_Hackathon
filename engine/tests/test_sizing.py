"""Right-sizing of split systems and the electrical check."""
from meterwise import sizing as SZ

from .conftest import make_request


def test_roof_changes_top_floor_only():
    r = SZ.size_systems(make_request(), allow_network=False)
    g = {x["position"]: x for x in r["groups"]}
    assert g["top"]["design_cooling_kw_with_package"] < g["top"]["design_cooling_kw_without_roof"]
    assert g["top"]["reduction_pct"] > 0
    assert g["lower"]["design_cooling_kw_with_package"] == g["lower"]["design_cooling_kw_without_roof"]
    assert g["lower"]["reduction_pct"] == 0
    for x in r["groups"]:
        assert x["unit_kw_with_package"] <= x["unit_kw_without_roof"]
        assert x["unit_cost_with_package"] <= x["unit_cost_without_roof"]
    assert r["capex_saved_by_right_sizing"] >= 0
    assert r["hot_water"]["units"] == 12


def test_no_roof_package_means_no_difference():
    r = SZ.size_systems(make_request(package={"cool_roof": False}), allow_network=False)
    for x in r["groups"]:
        assert x["design_cooling_kw_with_package"] == x["design_cooling_kw_without_roof"]
    assert r["capex_saved_by_right_sizing"] == 0


def test_insulation_cuts_top_floor_heating():
    a = SZ.size_systems(make_request(), allow_network=False)
    b = SZ.size_systems(make_request(package={"ceiling_insulation": True}), allow_network=False)
    ta = next(x for x in a["groups"] if x["position"] == "top")
    tb = next(x for x in b["groups"] if x["position"] == "top")
    assert tb["design_heating_kw"] < ta["design_heating_kw"]


def test_electrical_fields_and_assumptions():
    r = SZ.size_systems(make_request(), allow_network=False)
    e = r["electrical"]
    for k in ["per_flat_added_amps", "typical_supply_amps", "flat_supply_ok", "building_peak_kw_before",
              "building_peak_kw_after", "building_peak_kw_after_without_roof", "switchboard_upgrade_likely",
              "upgrade_cost_avoided", "note", "kind"]:
        assert k in e
    assert e["building_peak_kw_after"] <= e["building_peak_kw_after_without_roof"] + 0.2
    for a in r["assumptions"]:
        assert a["kind"] in ("sourced", "assumption")
        assert a["source"].startswith("http") if a["kind"] == "sourced" else a["source"] == "assumption"


def test_pick_unit():
    assert SZ.pick_unit(2.0)[0] == 2.5
    assert SZ.pick_unit(3.5)[0] == 3.5
    assert SZ.pick_unit(3.6)[0] == 5.0
    assert SZ.pick_unit(50)[0] == 9.0
