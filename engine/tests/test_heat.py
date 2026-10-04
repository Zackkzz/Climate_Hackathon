"""Satellite heat lookups for a spot on the map (meterwise.heat, GET /api/heat, custom buildings in assess)."""
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import app
from .conftest import make_request
from meterwise import heat as H
from meterwise.assess import assess

client = TestClient(app)
SPOT = (-33.9173, 151.2313)  # UNSW Kensington, outside the pilot area


def seed_tile(lat, lon, site_c, area_c, water_rows=0):
    """Write a cached window for the tile holding (lat, lon): area_c everywhere, site_c within 50 m of the point."""
    epsg, x, y, key = H._tile(lat, lon)
    _, tx, ty = key.split("_")
    west, north = int(tx) * H.TILE_M - H.PAD_M, (int(ty) + 1) * H.TILE_M + H.PAD_M
    size = int((H.TILE_M + 2 * H.PAD_M) / H.RES)
    med = np.full((size, size), area_c, dtype="float32")
    rows, cols = np.mgrid[0:size, 0:size]
    near = np.hypot(west + (cols + 0.5) * H.RES - x, north - (rows + 0.5) * H.RES - y) <= H.SITE_RADIUS_M
    med[near] = site_c
    land = np.ones_like(med, dtype=bool)
    land[:water_rows] = False
    med[:water_rows] = 15.0  # cool sea, excluded from the area median
    H.HEAT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    npz, meta = H._cache_paths(key)
    np.savez_compressed(npz, med=med, land=land)
    meta.write_text(json.dumps({"scenes": [{"id": "a", "date": "2024-01-20"}, {"id": "b", "date": "2026-02-10"},
                                           {"id": "c", "date": "2025-12-08"}],
                                "epsg": epsg, "west": west, "north": north, "size": size, "res_m": H.RES}))
    return npz, meta


@pytest.fixture
def seeded():
    paths = seed_tile(*SPOT, site_c=41.5, area_c=39.0, water_rows=60)
    yield
    for p in paths:
        p.unlink()


def test_anomaly_from_window_excludes_water():
    med = np.full((20, 20), 40.0)
    land = np.ones((20, 20), dtype=bool)
    med[:6], land[:6] = 10.0, False  # sea along the top
    med[10, 10] = 43.0  # pixel centre at x = 315, y = 600 - 315 = 285 (west 0, north 600, 30 m pixels)
    site, area = H.anomaly_from_window(med, land, 0.0, 600.0, 315.0, 285.0, res=30.0, radius=10.0)
    assert site == 43.0 and area == 40.0


def test_heat_at_uses_cached_tile(seeded):
    h = H.heat_at(*SPOT)
    assert h["heat_anomaly_c"] == 2.5
    assert h["site_lst_c"] == 41.5 and h["area_median_lst_c"] == 39.0
    assert h["scene_count"] == 3 and h["first_date"] == "2024-01-20" and h["last_date"] == "2026-02-10"


def test_offline_without_cache_is_unavailable():
    with pytest.raises(H.HeatUnavailable, match="offline"):
        H.heat_at(*SPOT)


def test_outside_nsw_is_unavailable():
    with pytest.raises(H.HeatUnavailable, match="New South Wales"):
        H.heat_at(-37.81, 144.96)  # Melbourne


def test_custom_building_gets_satellite_heat(seeded):
    r = assess(make_request(building={"lat": SPOT[0], "lon": SPOT[1], "heat_anomaly_c": None}))
    assert r["building"]["heat_anomaly_c"] == 2.5
    assert not any("satellite heat" in w for w in r["warnings"])


def test_given_heat_value_is_kept(seeded):
    r = assess(make_request(building={"lat": SPOT[0], "lon": SPOT[1], "heat_anomaly_c": -1.0}))
    assert r["building"]["heat_anomaly_c"] == -1.0


def test_custom_building_without_satellite_heat_says_so():
    r = assess(make_request(building={"lat": SPOT[0], "lon": SPOT[1], "heat_anomaly_c": None}))
    assert r["building"]["heat_anomaly_c"] == 0.0
    w = [w for w in r["warnings"] if "No satellite heat value" in w]
    assert w and "weather is still for this location" in w[0]
    assert not any("average for the area" in w for w in r["warnings"])


def test_api_heat(seeded):
    r = client.get("/api/heat", params={"lat": SPOT[0], "lon": SPOT[1]})
    assert r.status_code == 200
    body = r.json()
    assert body["heat_anomaly_c"] == 2.5 and body["heat_band"] in {"cooler", "average", "warm", "hot", "hottest"}


def test_api_heat_unavailable_is_503_with_message():
    r = client.get("/api/heat", params={"lat": SPOT[0], "lon": SPOT[1]})
    assert r.status_code == 503 and "offline" in r.json()["detail"]
    assert client.get("/api/heat", params={"lat": 120, "lon": 0}).status_code == 400
