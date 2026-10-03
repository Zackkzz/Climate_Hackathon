"""Thermal model: energy balance, physical bounds, and the roof only affecting the top floor."""
import numpy as np
import pytest

from meterwise import params as P
from meterwise.thermal import FlatSpec, simulate


@pytest.mark.parametrize("top", [True, False])
@pytest.mark.parametrize("conditioned", [True, False])
def test_energy_balance_closes(weather, top, conditioned):
    r = simulate(FlatSpec(top_floor=top), weather, heating=conditioned, cooling=conditioned)
    throughput = sum(abs(v) for v in r.flows.values())
    assert abs(sum(r.flows.values())) < 1e-6 * throughput


def test_free_running_temperature_within_physical_bounds(weather):
    r = simulate(FlatSpec(top_floor=True), weather, heating=False, cooling=False)
    assert r.indoor_c.min() > weather.temp_c.min() - 1
    assert r.indoor_c.max() < weather.temp_c.max() + 15
    # Heavy brick flats are damped: indoor swings less than outdoor.
    assert r.indoor_c.std() < weather.temp_c.std()


def test_setpoints_are_held_when_conditioning(weather):
    r = simulate(FlatSpec(top_floor=True), weather)
    hod = weather.hour_of_day
    heating_hours = np.isin(hod, [6, 7, 8, 17, 18, 19, 20, 21, 22])
    assert r.indoor_c[heating_hours].min() >= P.v("heating_setpoint_c") - 1e-6
    cooling_hours = (hod >= 14) & (hod < 23)
    assert r.indoor_c[cooling_hours].max() <= P.v("cooling_setpoint_c") + 1e-6
    assert r.heating_kwh > 0 and r.cooling_kwh > 0


@pytest.mark.parametrize("anomaly", [0.0, 0.5, 1.5])
@pytest.mark.parametrize("insulated", [False, True])
def test_cool_roof_never_raises_top_floor_peak(weather, anomaly, insulated):
    dark = simulate(FlatSpec(top_floor=True, roof_absorptance=0.85, ceiling_insulated=insulated,
                             heat_anomaly_air_c=anomaly), weather, False, False)
    cool = simulate(FlatSpec(top_floor=True, roof_absorptance=0.36, ceiling_insulated=insulated,
                             heat_anomaly_air_c=anomaly), weather, False, False)
    assert cool.indoor_c.max() <= dark.indoor_c.max()
    assert (cool.indoor_c > 30).sum() <= (dark.indoor_c > 30).sum()


def test_roof_absorptance_has_no_effect_on_lower_floor(weather):
    a = simulate(FlatSpec(top_floor=False, roof_absorptance=0.85), weather)
    b = simulate(FlatSpec(top_floor=False, roof_absorptance=0.2, ceiling_insulated=True), weather)
    np.testing.assert_array_equal(a.indoor_c, b.indoor_c)
    np.testing.assert_array_equal(a.heating_w, b.heating_w)
    np.testing.assert_array_equal(a.cooling_w, b.cooling_w)


def test_top_floor_is_hotter_than_lower_floor(weather):
    top = simulate(FlatSpec(top_floor=True), weather, False, False)
    low = simulate(FlatSpec(top_floor=False), weather, False, False)
    assert (top.indoor_c > 30).sum() > (low.indoor_c > 30).sum()
    assert top.indoor_c.max() > low.indoor_c.max()


def test_ceiling_insulation_cuts_top_floor_heating_and_cooling(weather):
    plain = simulate(FlatSpec(top_floor=True), weather)
    ins = simulate(FlatSpec(top_floor=True, ceiling_insulated=True), weather)
    assert ins.heating_kwh < plain.heating_kwh
    assert ins.cooling_kwh < plain.cooling_kwh


def test_local_heat_adds_cooling_demand(weather):
    base = simulate(FlatSpec(top_floor=False, heat_anomaly_air_c=0.0), weather)
    hot = simulate(FlatSpec(top_floor=False, heat_anomaly_air_c=1.5), weather)
    assert hot.cooling_kwh > base.cooling_kwh
