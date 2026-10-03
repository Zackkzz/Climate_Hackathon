"""Building data loader: tolerates incomplete pilot features."""
from meterwise import buildings as B


def square(lon: float, lat: float, side_m: float = 20.0) -> dict:
    dlon = side_m / 111_320 / 0.83  # cos(33.9 deg) is about 0.83
    dlat = side_m / 110_540
    ring = [[lon, lat], [lon + dlon, lat], [lon + dlon, lat + dlat], [lon, lat + dlat], [lon, lat]]
    return {"type": "Polygon", "coordinates": [ring]}


def test_footprint_area_of_a_20m_square():
    assert abs(B.footprint_area_m2(square(151.07, -33.92)) - 400) < 10


def test_missing_properties_are_filled_and_counted():
    counts = {k: 0 for k in ["footprint_m2", "roof_m2", "storeys", "flats_est", "heat_anomaly_c", "quick_score"]}
    f = B._normalise({"type": "Feature", "geometry": square(151.07, -33.92), "properties": {"id": 42}}, 0, [-1, 0, 1, 2], counts)
    p = f["properties"]
    assert p["id"] == "42"
    assert p["storeys"] == 3 and p["storeys_source"] == "assumed"
    assert p["flats_est"] == B.flats_from_footprint(p["footprint_m2"], 3)
    assert p["roof_m2"] == p["footprint_m2"]
    assert p["heat_band"] in B.HEAT_BANDS
    assert p["renter_share"] is None
    assert all(counts[k] == 1 for k in counts)
    assert abs(p["lat"] - -33.92) < 0.001 and abs(p["lon"] - 151.07) < 0.001


def test_heat_bands_from_quintiles():
    cuts = [-1.0, 0.0, 1.0, 2.0]
    assert B.band_for(-3, cuts) == "cooler"
    assert B.band_for(0.5, cuts) == "warm"
    assert B.band_for(5, cuts) == "hottest"


def test_dataset_loads_and_has_ids():
    ds = B.load()
    assert ds.features and all(f["properties"]["id"] in ds.by_id for f in ds.features)
    assert {"name", "centre", "bbox", "building_count"} <= set(ds.meta)
