"""Satellite heat for any location: summer land surface temperature (LST) at a point against its surroundings.

The pilot dataset's heat_anomaly_c is built offline by data/pipeline/fetch_landsat.py and build_pilot.py. This module
does the same for a point chosen on the map, at request time:

  * Source: Landsat 8/9 Collection 2 Level-2 surface temperature (band lwir11) from the Microsoft Planetary Computer
    STAC, the same summers (Dec-Feb, 2023-24 to 2025-26), Tier 1 only, the same cloud masks and checks.
  * The map is split into 1 km tiles. For the tile holding the point, a 4 km x 4 km window (the tile plus 1.5 km on
    each side) is read at 30 m on the local UTM grid; scenes where under 90% of the window is clear are skipped, and
    the per-pixel median over the clear scenes is kept. Only the window is read from each cloud-optimised GeoTIFF.
  * site = mean of the median over a 50 m radius around the point (the pilot uses the building footprint plus 30 m;
    here there is no footprint, so a circle about the size of a block plus that margin stands in).
  * area = median of the window's land pixels (Landsat's water flag removes sea, rivers and lakes; the pilot uses the
    land inside its two suburbs instead).
  * heat_anomaly_c = site - area.

The window median and land mask are cached per tile in engine/var/heat, so later points in the same tile are instant.
rasterio, pystac-client and planetary-computer are imported only when a lookup runs; without them, or without the
network (METERWISE_OFFLINE), lookups raise HeatUnavailable and callers fall back to no local adjustment.
"""
from __future__ import annotations

import json
import math
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np

from .paths import ENGINE_DIR

HEAT_CACHE_DIR = ENGINE_DIR / "var" / "heat"
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
SOURCE_URL = "https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2"
SUMMERS = [("2023-12-01", "2024-02-29"), ("2024-12-01", "2025-02-28"), ("2025-12-01", "2026-02-28")]
SCENE_CLOUD_MAX = 40.0
WINDOW_CLEAR_MIN = 0.90
MIN_WINDOW_MEDIAN_C = 20.0
MIN_SCENES = 3
ST_SCALE, ST_OFFSET = 0.00341802, 149.0
RES = 30.0
TILE_M = 1000.0
PAD_M = 1500.0
SITE_RADIUS_M = 50.0
READ_THREADS = 8
QA_BAD = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)  # fill, dilated cloud, cirrus, cloud, cloud shadow
QA_WATER = 1 << 7
GDAL_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2",
                CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.TIF", GDAL_HTTP_USERAGENT="Meterwise/0.2 (heat lookup)")
# Lookups are limited to New South Wales and the ACT (with a margin), the area the service is about.
NSW_BOUNDS = (-37.6, 140.9, -28.1, 153.7)  # south, west, north, east

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()
_running = threading.BoundedSemaphore(2)  # at most two tiles are fetched at once


class HeatUnavailable(Exception):
    """No satellite heat value could be produced; the message is plain language."""


def utm_epsg(lat: float, lon: float) -> int:
    zone = int((lon + 180) // 6) + 1
    return (32700 if lat < 0 else 32600) + zone


def _tile(lat: float, lon: float) -> tuple[int, float, float, str]:
    """UTM zone EPSG, the point in metres, and the key of its 1 km tile."""
    from pyproj import Transformer

    epsg = utm_epsg(lat, lon)
    x, y = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform(lon, lat)
    tx, ty = int(x // TILE_M), int(y // TILE_M)
    return epsg, x, y, f"{epsg}_{tx}_{ty}"


def _lock_for(key: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def _cache_paths(key: str):
    return HEAT_CACHE_DIR / f"lst_{key}.npz", HEAT_CACHE_DIR / f"lst_{key}.json"


def _fetch_window(epsg: int, key: str) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Median summer LST and a land mask for the tile's window, from Landsat. Slow (network)."""
    try:
        import planetary_computer
        import pystac_client
        import rasterio
        from rasterio.crs import CRS
        from rasterio.enums import Resampling
        from rasterio.transform import from_origin
        from rasterio.vrt import WarpedVRT
        from rasterio.warp import transform_bounds
    except ImportError as e:
        raise HeatUnavailable("Satellite heat lookups are not installed on this server.") from e

    _, tx, ty = key.split("_")
    west, north = int(tx) * TILE_M - PAD_M, (int(ty) + 1) * TILE_M + PAD_M
    size = int((TILE_M + 2 * PAD_M) / RES)
    transform = from_origin(west, north, RES, RES)
    crs = CRS.from_epsg(epsg)
    bbox = list(transform_bounds(crs, "EPSG:4326", west, north - size * RES, west + size * RES, north))

    try:
        cat = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
        items = []
        for start, end in SUMMERS:
            items += list(cat.search(collections=["landsat-c2-l2"], bbox=bbox, datetime=f"{start}/{end}",
                                     query={"eo:cloud_cover": {"lt": SCENE_CLOUD_MAX},
                                            "platform": {"in": ["landsat-8", "landsat-9"]}}).items())
    except Exception as e:  # noqa: BLE001  (network down, catalogue error)
        raise HeatUnavailable("The satellite catalogue could not be reached.") from e
    items = [it for it in items if it.id.endswith("_T1")]  # Tier 2 has poorer geometry and calibration

    def read(href: str, resampling) -> np.ndarray:
        with rasterio.open(href) as src:
            with WarpedVRT(src, crs=crs, transform=transform, width=size, height=size, resampling=resampling,
                           src_nodata=src.nodata) as vrt:
                return vrt.read(1)

    def scene(it) -> dict[str, Any] | None:
        try:
            qa = read(it.assets["qa_pixel"].href, Resampling.nearest)
            good = ((qa & QA_BAD) == 0) & (qa != 0)
            frac = float(good.mean())
            if frac < WINDOW_CLEAR_MIN:
                return None
            st = read(it.assets["lwir11"].href, Resampling.bilinear)
        except Exception:  # noqa: BLE001  (one unreadable scene is skipped)
            return None
        good &= st > 0
        lst = st.astype("float64") * ST_SCALE + ST_OFFSET - 273.15
        lst[~good] = np.nan
        if not np.isfinite(lst).any() or np.nanmedian(lst) < MIN_WINDOW_MEDIAN_C:
            return None  # implausibly cold for a clear summer morning: undetected cloud or haze
        return {"id": it.id, "date": it.datetime.date().isoformat(), "frac": frac, "lst": lst,
                "water": (qa & QA_WATER) > 0}

    with rasterio.Env(**GDAL_ENV), ThreadPoolExecutor(READ_THREADS) as pool:
        results = [r for r in pool.map(scene, items) if r is not None]
    # The same overpass appears in two adjacent scene rows; keep the clearer one per date.
    by_date: dict[str, dict[str, Any]] = {}
    for r in results:
        if r["date"] not in by_date or r["frac"] > by_date[r["date"]]["frac"]:
            by_date[r["date"]] = r
    used = sorted(by_date.values(), key=lambda r: r["date"])
    if len(used) < MIN_SCENES:
        raise HeatUnavailable(f"Only {len(used)} clear summer satellite images cover this spot; at least "
                              f"{MIN_SCENES} are needed.")
    med = np.nanmedian(np.stack([r["lst"] for r in used]), axis=0).astype("float32")
    water = np.logical_or.reduce([r["water"] for r in used])
    land = ~water & np.isfinite(med)
    info = {"scenes": [{"id": r["id"], "date": r["date"]} for r in used], "epsg": epsg, "west": west,
            "north": north, "size": size, "res_m": RES}
    return med, land, info


def _window(lat: float, lon: float) -> tuple[np.ndarray, np.ndarray, dict[str, Any], float, float]:
    epsg, x, y, key = _tile(lat, lon)
    npz, meta = _cache_paths(key)
    with _lock_for(key):
        if not (npz.exists() and meta.exists()):
            if os.environ.get("METERWISE_OFFLINE"):
                raise HeatUnavailable("Satellite heat for this spot has not been looked up yet, and the server "
                                      "is offline.")
            if not _running.acquire(timeout=120):
                raise HeatUnavailable("The server is busy looking up satellite heat for other places. "
                                      "Try again in a minute.")
            try:
                med, land, info = _fetch_window(epsg, key)
            finally:
                _running.release()
            HEAT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(npz, med=med, land=land)
            meta.write_text(json.dumps(info, indent=1))
        with np.load(npz) as z:
            med, land = z["med"], z["land"]
        info = json.loads(meta.read_text())
    return med, land, info, x, y


def anomaly_from_window(med: np.ndarray, land: np.ndarray, west: float, north: float, x: float, y: float,
                        res: float = RES, radius: float = SITE_RADIUS_M) -> tuple[float, float]:
    """Mean LST within `radius` of (x, y) and the median over land pixels in the window."""
    rows, cols = np.mgrid[0:med.shape[0], 0:med.shape[1]]
    cx, cy = west + (cols + 0.5) * res, north - (rows + 0.5) * res
    near = (np.hypot(cx - x, cy - y) <= radius) & np.isfinite(med)
    if not near.any():
        raise HeatUnavailable("There is no clear satellite reading at this spot.")
    vals = med[land]
    if vals.size < 100:
        raise HeatUnavailable("This spot is mostly water, so there is no land around it to compare with.")
    return float(np.mean(med[near])), float(np.median(vals))


def heat_at(lat: float, lon: float) -> dict[str, Any]:
    """Satellite heat for a point: how much hotter its surface gets on summer days than the land around it."""
    s, w, n, e = NSW_BOUNDS
    if not (s <= lat <= n and w <= lon <= e):
        raise HeatUnavailable("Satellite heat is only looked up for places in New South Wales.")
    med, land, info, x, y = _window(lat, lon)
    site, area = anomaly_from_window(med, land, info["west"], info["north"], x, y, info["res_m"])
    dates = [sc["date"] for sc in info["scenes"]]
    return {
        "heat_anomaly_c": round(site - area, 2),
        "site_lst_c": round(site, 1),
        "area_median_lst_c": round(area, 1),
        "scene_count": len(dates),
        "first_date": min(dates),
        "last_date": max(dates),
        "window_km": round(info["size"] * info["res_m"] / 1000, 1),
        "site_radius_m": SITE_RADIUS_M,
        "source": SOURCE_URL,
    }
