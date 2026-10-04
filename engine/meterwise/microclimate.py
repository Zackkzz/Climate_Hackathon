"""Local microclimate for one building, and an EnergyPlus weather (EPW) file with the local adjustment applied.

Method in plain words:
- The base weather is one real year (2025) of hourly ERA5 reanalysis from Open-Meteo for the area.
- The building's heat value is a satellite land-surface temperature difference (how hot roofs and ground get), not
  an air temperature. Air differs far less than surfaces between nearby blocks.
- Daytime part (the same rule the bill model uses, unchanged): fraction x surface difference, capped, added to
  daylight hours that are at least 25 C.
- Night part (microclimate summary and EPW only): a smaller fraction, with a smaller cap, added to the night hours
  that follow a day that reached 25 C (heat stored in roads and walls is released at night).
- Both fractions and caps are assumptions (see params.py, group "heat" and "microclimate").
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from . import buildings as B
from . import params as P
from .assess import MONTH_LABELS, AssessError, anomaly_to_air_c
from .thermal import local_outdoor_temp
from .weather import Weather, get_weather

SUMMER_MONTHS = (12, 1, 2)
LITERATURE = ("Voogt and Oke (2003), Thermal remote sensing of urban climates, Remote Sensing of Environment 86: 370-384; "
              "Azevedo et al. (2016), https://www.mdpi.com/2072-4292/8/2/153")


def night_adjustment_c(surface_anomaly_c: float) -> float:
    cap = P.v("anomaly_air_night_cap_c")
    x = P.v("anomaly_air_night_fraction") * surface_anomaly_c
    return float(round(max(-cap, min(cap, x)) * 20) / 20)


def local_series(weather: Weather, surface_anomaly_c: float) -> tuple[np.ndarray, float, float]:
    """Hourly local air temperature: the bill model's daytime rule plus the night part. Returns (temps, day_c, night_c)."""
    day_c = anomaly_to_air_c(surface_anomaly_c)
    night_c = night_adjustment_c(surface_anomaly_c)
    t = local_outdoor_temp(weather, day_c)  # identical to the thermal model's outdoor temperature
    if night_c:
        base = weather.temp_c
        days = len(base) // 24
        hot_day = base.reshape(days, 24).max(axis=1) >= P.v("anomaly_apply_above_c")
        # Night after a hot day: dark hours from that evening (same date, after noon) and the next morning (before noon).
        dark = weather.ghi_w_m2 <= 0.0
        hod = weather.hour_of_day
        day_idx = np.arange(len(base)) // 24
        evening_hot = hot_day[day_idx] & (hod >= 12)
        prev_hot = np.roll(hot_day, 1)[day_idx] & (hod < 12)
        t = t + np.where(dark & (evening_hot | prev_hot), night_c, 0.0)
    return t, day_c, night_c


def _building(building_id: str) -> dict[str, Any]:
    f = B.load().by_id.get(building_id)
    if f is None:
        raise AssessError(f"No building with id '{building_id}' was found.", 404)
    return f["properties"]


def _daily_max(t: np.ndarray) -> np.ndarray:
    return t.reshape(-1, 24).max(axis=1)


def summary(building_id: str, allow_network: bool = True) -> dict[str, Any]:
    p = _building(building_id)
    w, warnings = get_weather(p["lat"], p["lon"], allow_network=allow_network)
    local, day_c, night_c = local_series(w, float(p["heat_anomaly_c"]))
    base = w.temp_c
    months = w.month
    dmonth = months[::24]
    summer_d = np.isin(dmonth, SUMMER_MONTHS)
    summer_h = np.isin(months, SUMMER_MONTHS)
    bmax, lmax = _daily_max(base), _daily_max(local)
    cbase = P.v("cooling_degree_base_c")

    def cdh(t: np.ndarray) -> int:
        return int(round(float(np.clip(t[summer_h] - cbase, 0, None).sum())))

    monthly = []
    for m in range(1, 13):
        sel = dmonth == m
        monthly.append({"month": m, "label": MONTH_LABELS[m - 1],
                        "mean_max_c_base": round(float(bmax[sel].mean()), 1),
                        "mean_max_c_local": round(float(lmax[sel].mean()), 1),
                        "mean_c_base": round(float(base[months == m].mean()), 1),
                        "mean_c_local": round(float(local[months == m].mean()), 1)})
    hours_adj_day = int(((w.ghi_w_m2 > 100.0) & (base >= P.v("anomaly_apply_above_c"))).sum()) if day_c else 0
    hours_adj = int((np.abs(local - base) > 1e-9).sum())
    notes = [
        "Surface temperature from satellite is not air temperature. Roofs and roads can be many degrees hotter than "
        "the air above them, and the difference between nearby blocks is much smaller in the air.",
        f"The air adjustment is an assumption: {P.v('anomaly_air_fraction'):.0%} of the surface difference by day "
        f"(capped at {P.v('anomaly_air_cap_c')} C) and {P.v('anomaly_air_night_fraction'):.0%} at night after a hot day "
        f"(capped at {P.v('anomaly_air_night_cap_c')} C). Studies comparing the two find the link changes with place, "
        "season and time of day, so no published ratio was copied.",
        "The bill and comfort model uses the daytime part only (hot daylight hours). The night part appears here and in "
        "the weather file for use in other building simulation tools.",
        f"Weather is one real year ({w.year}). A hotter or cooler year would change every number here.",
    ] + warnings
    return {
        "building_id": building_id, "label": p.get("label"),
        "heat_anomaly_c": round(float(p["heat_anomaly_c"]), 2), "heat_band": p.get("heat_band"),
        "air_temp_adjustment": {
            "day_c": day_c, "night_c": night_c,
            "method": (f"Daytime: {P.v('anomaly_air_fraction')} x the surface difference, capped at "
                       f"{P.v('anomaly_air_cap_c')} C, added to daylight hours of {P.v('anomaly_apply_above_c'):.0f} C or "
                       f"more. Night: {P.v('anomaly_air_night_fraction')} x the surface difference, capped at "
                       f"{P.v('anomaly_air_night_cap_c')} C, added to dark hours after a day that reached "
                       f"{P.v('anomaly_apply_above_c'):.0f} C."),
            "kind": "assumption", "literature": LITERATURE,
            "hours_adjusted_day": hours_adj_day, "hours_adjusted_total": hours_adj,
            "used_in_bill_model": "day part only",
        },
        "base_weather": {"source": "ERA5 via Open-Meteo", "year": w.year, "grid_km": 25,
                         "grid_note": "ERA5 grid spacing is 0.25 degrees (about 25 km). Open-Meteo may blend finer "
                                      "ERA5-Land data for some variables.",
                         "lat": round(w.lat, 3), "lon": round(w.lon, 3)},
        "summer": {
            "months": "December, January, February (same calendar year)",
            "mean_max_c_base": round(float(bmax[summer_d].mean()), 1),
            "mean_max_c_local": round(float(lmax[summer_d].mean()), 1),
            "days_over_35_base": int((bmax[summer_d] > 35).sum()),
            "days_over_35_local": int((lmax[summer_d] > 35).sum()),
            "cooling_degree_hours_base": cdh(base), "cooling_degree_hours_local": cdh(local),
            "cooling_degree_base_c": cbase,
        },
        "monthly": monthly,
        "notes": notes,
    }


# ------------------------------------------------------------------------------------------------ EPW export

def _solar_cos_zenith(lat: float, lon: float, doy: np.ndarray, hour_mid: np.ndarray, tz: float = 10.0) -> np.ndarray:
    """Cosine of the solar zenith angle at the middle of each hour (standard time, UTC+10). Spencer (1971) formulas."""
    g = 2 * math.pi / 365 * (doy - 1 + (hour_mid - 12) / 24)
    decl = (0.006918 - 0.399912 * np.cos(g) + 0.070257 * np.sin(g) - 0.006758 * np.cos(2 * g)
            + 0.000907 * np.sin(2 * g) - 0.002697 * np.cos(3 * g) + 0.00148 * np.sin(3 * g))
    eqt = 229.18 * (0.000075 + 0.001868 * np.cos(g) - 0.032077 * np.sin(g) - 0.014615 * np.cos(2 * g)
                    - 0.040849 * np.sin(2 * g))  # minutes
    solar_time = hour_mid + (eqt + 4 * lon - 60 * tz) / 60.0
    ha = np.radians(15 * (solar_time - 12))
    phi = math.radians(lat)
    return np.sin(phi) * np.sin(decl) + np.cos(phi) * np.cos(decl) * np.cos(ha)


def _dew_point(t: np.ndarray, rh: np.ndarray) -> np.ndarray:
    """Magnus formula (Alduchov and Eskridge 1996 coefficients)."""
    a, b = 17.625, 243.04
    rh = np.clip(rh, 1.0, 100.0)
    gam = np.log(rh / 100.0) + a * t / (b + t)
    return b * gam / (a - gam)


def to_epw(building_id: str, allow_network: bool = True) -> str:
    """EnergyPlus weather file (8 header lines + 8760 hourly rows, 35 fields each) with the local adjustment applied."""
    p = _building(building_id)
    w, _ = get_weather(p["lat"], p["lon"], allow_network=allow_network)
    local, day_c, night_c = local_series(w, float(p["heat_anomaly_c"]))
    raw = json.loads(Path(w.source_file).read_text())
    elevation = float(raw.get("elevation", 0.0) or 0.0)
    h = raw["hourly"]
    keep = [i for i, t in enumerate(h["time"]) if t[5:10] != "02-29"]

    def raw_arr(key: str) -> np.ndarray | None:
        vals = h.get(key)
        if vals is None:
            return None
        a = np.array([vals[i] if vals[i] is not None else np.nan for i in keep], dtype=float)
        return a

    # Open-Meteo radiation is the mean over the preceding hour; temperatures are at the time stamp. EPW row "hour k"
    # covers (k-1):00 to k:00, so row k takes the record stamped k:00 (the last row wraps to 1 January 00:00).
    def shift(a: np.ndarray) -> np.ndarray:
        return np.roll(a, -1)

    n = w.hours
    t_db = shift(local)
    rh = shift(w.rh_pct)
    t_dp = np.minimum(_dew_point(t_db, rh), t_db)
    press = 101325.0 * (1 - 2.25577e-5 * elevation) ** 5.25588  # standard atmosphere at the grid elevation
    ghi = shift(w.ghi_w_m2)
    dhi_raw, dir_raw = raw_arr("diffuse_radiation"), raw_arr("direct_radiation")
    cloud = raw_arr("cloud_cover")
    doy = np.repeat(np.arange(1, n // 24 + 1), 24)
    hour_end = np.tile(np.arange(1, 25), n // 24)
    cosz = _solar_cos_zenith(w.lat, w.lon, doy, hour_end - 0.5)
    if dir_raw is not None and dhi_raw is not None:
        dhi = np.clip(shift(np.nan_to_num(dhi_raw, nan=-1)), -1, None)
        dirh = np.clip(shift(np.nan_to_num(dir_raw, nan=-1)), -1, None)
        dni = np.where((cosz > 0.087) & (dirh >= 0), dirh / np.maximum(cosz, 0.087), 0.0)  # sun at least 5 deg up
        dni = np.minimum(dni, 1360.0)
    else:
        dhi = dni = None
    wind = shift(w.wind_m_s)
    tot_sky = np.round(shift(np.nan_to_num(cloud, nan=990)) / 10.0).astype(int) if cloud is not None else None

    lines = []
    lines.append(f"LOCATION,{p.get('label', building_id).replace(',', ' ')},NSW,AUS,ERA5 via Open-Meteo plus local "
                 f"adjustment,{building_id},{w.lat:.3f},{w.lon:.3f},10.0,{elevation:.1f}")
    lines.append("DESIGN CONDITIONS,0")
    lines.append("TYPICAL/EXTREME PERIODS,0")
    lines.append("GROUND TEMPERATURES,0")
    lines.append("HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0")
    lines.append(f"COMMENTS 1,Real hourly weather for {w.year} (ERA5 reanalysis via Open-Meteo; CC BY 4.0) - not a "
                 f"typical year. Local air adjustment (an ASSUMPTION not a measurement): +{day_c} C on daylight hours of "
                 f"{P.v('anomaly_apply_above_c'):.0f} C or more and +{night_c} C on dark hours after a hot day; derived "
                 f"from a satellite surface temperature difference of {float(p['heat_anomaly_c']):+.2f} C.")
    lines.append("COMMENTS 2,Times are fixed UTC+10 with no daylight saving; 29 Feb removed. Dew point from temperature "
                 "and humidity (Magnus formula); pressure from the standard atmosphere at the grid elevation; direct normal "
                 "from direct horizontal and computed sun position. Fields the source lacks use EPW missing-value codes. "
                 "Generated by Meterwise (screening tool).")
    import datetime as _dt
    weekday = _dt.date(w.year, 1, 1).strftime("%A")
    lines.append(f"DATA PERIODS,1,1,Data,{weekday},1/1,12/31")

    for k in range(n):
        ts = w.time[k]
        month, day = int(ts[5:7]), int(ts[8:10])
        f = [str(w.year), str(month), str(day), str(int(hour_end[k])), "60",
             "?9?9?9?9E0?9?9?9?9?9?9?9?9?9?9?9?9?9?9?9*9*9?9?9?9",
             f"{t_db[k]:.1f}", f"{t_dp[k]:.1f}", f"{int(round(rh[k]))}", f"{int(round(press))}",
             "9999", "9999", "9999",
             f"{int(round(ghi[k]))}",
             f"{int(round(dni[k]))}" if dni is not None else "9999",
             f"{int(round(dhi[k]))}" if dhi is not None and dhi[k] >= 0 else "9999",
             "999999", "999999", "999999", "9999",
             "999", f"{wind[k]:.1f}",
             str(int(tot_sky[k])) if tot_sky is not None and tot_sky[k] <= 10 else "99", "99",
             "9999", "99999", "9", "999999999", "999", "0.999", "999", "99", "999", "999", "99"]
        lines.append(",".join(f))
    return "\r\n".join(lines) + "\r\n"
