"""Microclimate summary and EPW export."""
import numpy as np
import pytest

from meterwise import buildings as B
from meterwise import microclimate as MC
from meterwise.assess import AssessError, anomaly_to_air_c
from meterwise.thermal import local_outdoor_temp


def _hot_id():
    ds = B.load()
    return max(ds.features, key=lambda f: f["properties"]["heat_anomaly_c"])["properties"]["id"]


def test_summary_shape_and_direction():
    s = MC.summary(_hot_id(), allow_network=False)
    adj = s["air_temp_adjustment"]
    assert adj["kind"] == "assumption" and adj["day_c"] > 0 and 0 <= adj["night_c"] <= adj["day_c"]
    su = s["summer"]
    assert su["mean_max_c_local"] >= su["mean_max_c_base"]
    assert su["cooling_degree_hours_local"] >= su["cooling_degree_hours_base"]
    assert su["days_over_35_local"] >= su["days_over_35_base"]
    assert len(s["monthly"]) == 12 and s["base_weather"]["year"] == 2025
    assert any("not air temperature" in n for n in s["notes"])


def test_day_part_matches_bill_model(weather):
    # Sunlit hours must equal what the thermal model uses; only dark hours may differ (the night part).
    t, day_c, _ = MC.local_series(weather, 3.0)
    model = local_outdoor_temp(weather, anomaly_to_air_c(3.0))
    lit = weather.ghi_w_m2 > 0
    assert np.allclose(t[lit], model[lit])
    assert day_c == anomaly_to_air_c(3.0)


def test_adjustment_capped(weather):
    t, day_c, night_c = MC.local_series(weather, 14.0)
    assert day_c <= 1.5 and night_c <= 0.75
    assert float((t - weather.temp_c).max()) <= 1.5 + 1e-9


def test_epw_structure():
    text = MC.to_epw(_hot_id(), allow_network=False)
    lines = text.rstrip("\r\n").split("\r\n")
    heads = ["LOCATION", "DESIGN CONDITIONS", "TYPICAL/EXTREME PERIODS", "GROUND TEMPERATURES",
             "HOLIDAYS/DAYLIGHT SAVINGS", "COMMENTS 1", "COMMENTS 2", "DATA PERIODS"]
    for h, line in zip(heads, lines[:8]):
        assert line.startswith(h + ",")
    data = lines[8:]
    assert len(data) == 8760
    assert all(len(r.split(",")) == 35 for r in data)
    first, last = data[0].split(","), data[-1].split(",")
    assert first[1:4] == ["1", "1", "1"] and last[1:4] == ["12", "31", "24"]
    assert "ASSUMPTION" in lines[5]
    dry = np.array([float(r.split(",")[6]) for r in data])
    dew = np.array([float(r.split(",")[7]) for r in data])
    assert dry.min() > -10 and dry.max() < 50 and (dew <= dry + 1e-9).all()
    # EPW missing-value codes where the source has no data (wind direction, extraterrestrial radiation)
    assert first[20] == "999" and first[10] == "9999"


def test_unknown_building():
    with pytest.raises(AssessError) as e:
        MC.summary("nope")
    assert e.value.status == 404
