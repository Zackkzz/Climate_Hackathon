"""Loads candidate buildings: the pilot dataset when present, otherwise the hand-made fixture."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from .paths import FIXTURE_DIR, PILOT_DIR

HEAT_BANDS = ["cooler", "average", "warm", "hot", "hottest"]
DEFAULT_STOREYS = 3
DEFAULT_FLAT_AREA_M2 = 65.0
# Share of gross floor area that is flats (the rest is stairs, walls, landings): an assumption.
NET_TO_GROSS = 0.8


@dataclass
class Dataset:
    meta: dict[str, Any]
    features: list[dict[str, Any]]
    by_id: dict[str, dict[str, Any]]
    is_fixture: bool
    warnings: list[str] = field(default_factory=list)
    anomaly_quintiles: list[float] = field(default_factory=list)


def _ring_area_m2(ring: list[list[float]]) -> float:
    """Approximate area of a lon/lat ring in m2 (equirectangular projection; fine for building footprints)."""
    if len(ring) < 3:
        return 0.0
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    kx = 111_320.0 * math.cos(lat0)
    ky = 110_540.0
    pts = [(p[0] * kx, p[1] * ky) for p in ring]
    s = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def footprint_area_m2(geom: dict[str, Any]) -> float:
    if not geom:
        return 0.0
    if geom.get("type") == "Polygon":
        rings = geom["coordinates"]
        return max(_ring_area_m2(rings[0]) - sum(_ring_area_m2(r) for r in rings[1:]), 0.0)
    if geom.get("type") == "MultiPolygon":
        return sum(footprint_area_m2({"type": "Polygon", "coordinates": c}) for c in geom["coordinates"])
    return 0.0


def centroid(geom: dict[str, Any]) -> tuple[float, float]:
    """(lat, lon) of the mean of the outer ring vertices."""
    if geom.get("type") == "Polygon":
        ring = geom["coordinates"][0]
    elif geom.get("type") == "MultiPolygon":
        ring = [p for poly in geom["coordinates"] for p in poly[0]]
    else:
        coords = geom.get("coordinates", [0, 0])
        return float(coords[1]), float(coords[0])
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)


def flats_from_footprint(footprint_m2: float, storeys: int, flat_area_m2: float = DEFAULT_FLAT_AREA_M2) -> int:
    return max(1, int(round(footprint_m2 * storeys * NET_TO_GROSS / flat_area_m2)))


def band_for(anomaly: float | None, quintiles: list[float]) -> str:
    """Heat band from quintile cut points of the dataset's anomalies."""
    if anomaly is None or not quintiles:
        return "average"
    for band, cut in zip(HEAT_BANDS, quintiles):
        if anomaly <= cut:
            return band
    return HEAT_BANDS[-1]


def _quintile_cuts(values: list[float]) -> list[float]:
    """20th/40th/60th/80th percentile cut points."""
    if not values:
        return []
    import numpy as np

    return [float(x) for x in np.percentile(values, [20, 40, 60, 80])]


def _normalise(feature: dict[str, Any], idx: int, quintiles: list[float], counts: dict[str, int]) -> dict[str, Any]:
    """Fill missing optional properties; counts how often each was filled (for dataset warnings)."""
    props = dict(feature.get("properties") or {})
    geom = feature.get("geometry") or {}
    props.setdefault("id", f"b_{idx:06d}")
    props["id"] = str(props["id"])
    fp = props.get("footprint_m2")
    if not isinstance(fp, (int, float)) or fp <= 0:
        fp = round(footprint_area_m2(geom), 1)
        props["footprint_m2"] = fp
        counts["footprint_m2"] += 1
    if not isinstance(props.get("roof_m2"), (int, float)) or props["roof_m2"] <= 0:
        props["roof_m2"] = fp
        counts["roof_m2"] += 1
    st = props.get("storeys")
    if not isinstance(st, (int, float)) or st < 1:
        props["storeys"] = DEFAULT_STOREYS
        props["storeys_source"] = "assumed"
        counts["storeys"] += 1
    else:
        props["storeys"] = int(round(st))
        props.setdefault("storeys_source", "osm")
    if not isinstance(props.get("flats_est"), (int, float)) or props["flats_est"] < 1:
        props["flats_est"] = flats_from_footprint(fp, props["storeys"])
        counts["flats_est"] += 1
    else:
        props["flats_est"] = int(round(props["flats_est"]))
    if not isinstance(props.get("heat_anomaly_c"), (int, float)):
        props["heat_anomaly_c"] = 0.0
        counts["heat_anomaly_c"] += 1
    if props.get("heat_band") not in HEAT_BANDS:
        props["heat_band"] = band_for(props["heat_anomaly_c"], quintiles)
    props.setdefault("renter_share", None)
    props.setdefault("suburb", "")
    if not props.get("label"):
        props["label"] = f"Block {props['id']}"
    if not isinstance(props.get("quick_score"), (int, float)):
        props["quick_score"] = 50
        counts["quick_score"] += 1
    lat, lon = centroid(geom) if geom else (None, None)
    props.setdefault("lat", lat)
    props.setdefault("lon", lon)
    return {"type": "Feature", "geometry": geom, "properties": props}


def _read(dir_: Path) -> tuple[dict, dict] | None:
    gj, mj = dir_ / "buildings.geojson", dir_ / "meta.json"
    if not gj.exists():
        return None
    geo = json.loads(gj.read_text(encoding="utf-8"))
    meta = json.loads(mj.read_text(encoding="utf-8")) if mj.exists() else {}
    return geo, meta


@lru_cache(maxsize=1)
def _load_cached(pilot_mtime: float) -> Dataset:
    warnings: list[str] = []
    loaded = None
    is_fixture = False
    try:
        loaded = _read(PILOT_DIR)
    except (OSError, ValueError):
        warnings.append("The pilot building file could not be read, so example buildings are shown instead.")
    if loaded is None or not loaded[0].get("features"):
        loaded = _read(FIXTURE_DIR)
        is_fixture = True
    if loaded is None:
        raise RuntimeError("No building data found in data/pilot or data/fixture.")
    geo, meta = loaded
    raw = geo.get("features", [])
    anomalies = [f.get("properties", {}).get("heat_anomaly_c") for f in raw]
    quint = _quintile_cuts([a for a in anomalies if isinstance(a, (int, float))])
    counts = {k: 0 for k in ["footprint_m2", "roof_m2", "storeys", "flats_est", "heat_anomaly_c", "quick_score"]}
    feats = [_normalise(f, i, quint, counts) for i, f in enumerate(raw)]
    plain = {
        "storeys": "number of storeys was assumed (3) for {n} buildings with no mapped height",
        "flats_est": "number of flats was estimated from footprint and storeys for {n} buildings",
        "footprint_m2": "footprint area was measured from the outline for {n} buildings",
        "roof_m2": "roof area was taken as the footprint for {n} buildings",
        "heat_anomaly_c": "no heat data for {n} buildings (treated as average)",
        "quick_score": "no screening score for {n} buildings (set to 50)",
    }
    for k, n in counts.items():
        if n:
            warnings.append("Building data: " + plain[k].format(n=n) + ".")
    lats = [f["properties"]["lat"] for f in feats if f["properties"].get("lat") is not None]
    lons = [f["properties"]["lon"] for f in feats if f["properties"].get("lon") is not None]
    meta = dict(meta)
    if "centre" not in meta and lats:
        meta["centre"] = {"lat": sum(lats) / len(lats), "lon": sum(lons) / len(lons)}
    if "bbox" not in meta and lats:
        meta["bbox"] = [min(lons), min(lats), max(lons), max(lats)]
    meta.setdefault("name", "Western Sydney pilot")
    meta.setdefault("description", "")
    meta["building_count"] = len(feats)
    meta.setdefault("data_notes", [])
    return Dataset(meta=meta, features=feats, by_id={f["properties"]["id"]: f for f in feats},
                   is_fixture=is_fixture, warnings=warnings, anomaly_quintiles=quint)


def load() -> Dataset:
    """Current dataset (reloads automatically if the pilot file changes)."""
    p = PILOT_DIR / "buildings.geojson"
    mtime = p.stat().st_mtime if p.exists() else 0.0
    return _load_cached(mtime)


def public_feature(f: dict[str, Any]) -> dict[str, Any]:
    """Feature as returned by the API (internal lat/lon kept as extra properties)."""
    return {"type": "Feature", "geometry": f["geometry"], "properties": f["properties"]}
