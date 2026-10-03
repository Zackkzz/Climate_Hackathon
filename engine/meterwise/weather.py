"""Hourly weather from the Open-Meteo historical archive (ERA5 reanalysis), cached on disk.

One full calendar year at hourly resolution, in fixed Australian Eastern Standard Time (UTC+10, no daylight
saving) so every year has exactly 8760 hours and no repeated or missing hours.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from .paths import CACHE_DIR

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
WEATHER_YEAR = 2025
HOURLY_VARS = [
    "temperature_2m",
    "relative_humidity_2m",
    "shortwave_radiation",
    "direct_radiation",
    "diffuse_radiation",
    "wind_speed_10m",
    "cloud_cover",
]
# Buildings closer than this to a cached weather file share it (the pilot area is a few km across;
# ERA5 cells are about 25 km).
SHARE_RADIUS_KM = 30.0


@dataclass(frozen=True)
class Weather:
    """One year of hourly weather. Arrays have 8760 entries."""

    lat: float
    lon: float
    year: int
    time: tuple[str, ...]
    temp_c: np.ndarray
    ghi_w_m2: np.ndarray
    wind_m_s: np.ndarray
    rh_pct: np.ndarray
    source_file: str  # full path of the cached file (also the cache key for thermal runs)

    @property
    def hours(self) -> int:
        return len(self.temp_c)

    @property
    def month(self) -> np.ndarray:
        """Month number (1-12) of each hour."""
        return np.array([int(t[5:7]) for t in self.time])

    @property
    def hour_of_day(self) -> np.ndarray:
        return np.array([int(t[11:13]) for t in self.time])


def _cache_path(lat: float, lon: float, year: int) -> Path:
    return CACHE_DIR / f"openmeteo_era5_{lat:.2f}_{lon:.2f}_{year}.json"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _cached_files(year: int) -> list[tuple[float, float, Path]]:
    out = []
    for p in CACHE_DIR.glob(f"openmeteo_era5_*_{year}.json"):
        parts = p.stem.split("_")
        try:
            out.append((float(parts[2]), float(parts[3]), p))
        except (IndexError, ValueError):
            continue
    return out


def nearest_cached(lat: float, lon: float, year: int = WEATHER_YEAR) -> tuple[Path, float] | None:
    """Closest cached weather file and its distance in km, or None when the cache is empty."""
    files = _cached_files(year)
    if not files:
        return None
    best = min(files, key=lambda f: _haversine_km(lat, lon, f[0], f[1]))
    return best[2], _haversine_km(lat, lon, best[0], best[1])


def download(lat: float, lon: float, year: int = WEATHER_YEAR, timeout: float = 30.0) -> Path:
    """Download one calendar year of hourly ERA5 weather from Open-Meteo and cache it."""
    import requests

    params = {
        "latitude": round(lat, 2),
        "longitude": round(lon, 2),
        "start_date": f"{year}-01-01",
        "end_date": f"{year}-12-31",
        "hourly": ",".join(HOURLY_VARS),
        "timezone": "Etc/GMT-10",  # fixed UTC+10, no daylight saving
    }
    r = requests.get(ARCHIVE_URL, params=params, timeout=timeout)
    r.raise_for_status()
    data = r.json()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(round(lat, 2), round(lon, 2), year)
    data["_meta"] = {"request": params, "url": ARCHIVE_URL, "licence": "CC BY 4.0, Open-Meteo / ERA5 (Copernicus)"}
    path.write_text(json.dumps(data))
    return path


@lru_cache(maxsize=16)
def load_file(path: str) -> Weather:
    """Parse a cached Open-Meteo JSON file."""
    data = json.loads(Path(path).read_text())
    h = data["hourly"]
    time = tuple(h["time"])
    # Drop 29 Feb in leap years so every year is 8760 hours.
    keep = [i for i, t in enumerate(time) if t[5:10] != "02-29"]

    def arr(key: str, default: float = 0.0) -> np.ndarray:
        vals = h.get(key)
        if vals is None:
            return np.full(len(keep), default)
        a = np.array([vals[i] if vals[i] is not None else np.nan for i in keep], dtype=float)
        # Fill rare gaps by linear interpolation.
        if np.isnan(a).any():
            idx = np.arange(len(a))
            good = ~np.isnan(a)
            a = np.interp(idx, idx[good], a[good])
        return a

    return Weather(
        lat=float(data["latitude"]),
        lon=float(data["longitude"]),
        year=int(time[0][:4]),
        time=tuple(time[i] for i in keep),
        temp_c=arr("temperature_2m"),
        ghi_w_m2=np.clip(arr("shortwave_radiation"), 0, None),
        wind_m_s=arr("wind_speed_10m", 10.0) / 3.6,
        rh_pct=arr("relative_humidity_2m", 60.0),
        source_file=str(path),
    )


def get_weather(lat: float, lon: float, year: int = WEATHER_YEAR, allow_network: bool = True) -> tuple[Weather, list[str]]:
    """Weather for a site: a cached file within SHARE_RADIUS_KM, else download, else nearest cached file.

    Returns the weather and a list of plain-language warnings.
    """
    warnings: list[str] = []
    if os.environ.get("METERWISE_OFFLINE"):
        allow_network = False
    near = nearest_cached(lat, lon, year)
    if near and near[1] <= SHARE_RADIUS_KM:
        return load_file(str(near[0])), warnings
    if allow_network:
        try:
            return load_file(str(download(lat, lon, year))), warnings
        except Exception:  # network down, rate-limited, etc.
            warnings.append("Could not download weather for this location, so the nearest saved weather year was used.")
    if near:
        if not warnings:
            warnings.append(f"Weather from a saved location {near[1]:.0f} km away was used.")
        return load_file(str(near[0])), warnings
    raise RuntimeError("No weather data is available offline for this location.")
