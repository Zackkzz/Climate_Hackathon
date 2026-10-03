"""Shared paths, pilot-area definition and polite HTTP helpers for the Meterwise pilot pipeline."""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests

PIPELINE_DIR = Path(__file__).resolve().parent
DATA_DIR = PIPELINE_DIR.parent
RAW_DIR = DATA_DIR / "raw"
PILOT_DIR = DATA_DIR / "pilot"
RAW_DIR.mkdir(parents=True, exist_ok=True)
PILOT_DIR.mkdir(parents=True, exist_ok=True)

USER_AGENT = "Meterwise-hackathon-pipeline/0.1 (Climate Hack-tion 2026 pilot dataset; contact via project repo)"
HEADERS = {"User-Agent": USER_AGENT}

# Projected CRS for areas and distances: GDA2020 / MGA zone 56
CRS_PROJ = "EPSG:7856"

# ---------------------------------------------------------------------------
# Pilot area. Chosen after Overpass coverage checks (see README.md).
# The bbox is the union of the ABS 2021 Suburbs and Localities (SAL) polygons
# of the pilot suburbs, rounded outward; buildings are then clipped to the
# suburb polygons themselves.
# ---------------------------------------------------------------------------
PILOT = {
    "name": "Penrith and Kingswood pilot",
    # ABS 2021 SAL code -> display name
    "suburbs": {"13195": "Penrith", "12171": "Kingswood"},
}

# Overpass endpoints, tried in order.
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def cache_path(name: str) -> Path:
    return RAW_DIR / name


def get_json(url: str, params: dict | None = None, cache: str | None = None, timeout: int = 120,
             retries: int = 3) -> dict:
    """GET JSON with a file cache in data/raw and a polite pause between retries."""
    if cache:
        p = cache_path(cache)
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
            r.raise_for_status()
            d = r.json()
            if cache:
                cache_path(cache).write_text(json.dumps(d), encoding="utf-8")
            return d
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"GET failed for {url}: {last}")


def overpass(query: str, cache: str) -> dict:
    """Run an Overpass QL query, caching the JSON response. Tries several public endpoints."""
    p = cache_path(cache)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    last = None
    for attempt in range(3):
        for ep in OVERPASS_ENDPOINTS:
            try:
                r = requests.post(ep, data={"data": query}, headers=HEADERS, timeout=200)
                if r.status_code != 200:
                    last = f"{ep}: HTTP {r.status_code}"
                    time.sleep(10)
                    continue
                d = r.json()
                if "error" in str(d.get("remark", "")).lower():
                    # Overpass returns HTTP 200 with a partial result when the query times out.
                    last = f"{ep}: {d['remark'][:200]}"
                    time.sleep(10)
                    continue
                d["_endpoint"] = ep
                p.write_text(json.dumps(d), encoding="utf-8")
                return d
            except Exception as e:  # noqa: BLE001
                last = f"{ep}: {e}"
                time.sleep(10)
        time.sleep(30 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last}")


def short_hash(s: str) -> str:
    return hashlib.sha1(s.encode()).hexdigest()[:10]
