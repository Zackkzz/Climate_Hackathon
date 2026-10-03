"""Download (and cache in data/raw/) every non-satellite input for the pilot:

- ABS ASGS 2021 Suburbs and Localities (SAL) boundaries for the pilot suburbs
- OpenStreetMap buildings, named streets and land-cover context features (Overpass API)
- NSW Geocoded Addressing Theme address points (NSW Spatial Services ArcGIS REST)
- ABS 2021 Census G37 (tenure by dwelling structure) at SA1 level with geometry (ABS ArcGIS REST)
"""
from __future__ import annotations

import json
import time

import requests

from common import HEADERS, RAW_DIR, get_json, overpass

ABS_SAL = "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SAL/FeatureServer/0/query"
ABS_G37_SA1 = "https://geo.abs.gov.au/arcgis/rest/services/Hosted/ABS_2021_Census_G37_SA1/FeatureServer/0/query"
NSW_ADDR = ("https://portal.spatial.nsw.gov.au/server/rest/services/"
            "NSW_Geocoded_Addressing_Theme/FeatureServer/1/query")


def fetch_sal(codes: list[str]) -> dict:
    where = "sal_code_2021 IN ({})".format(",".join(f"'{c}'" for c in codes))
    return get_json(ABS_SAL, params={"where": where, "outFields": "sal_code_2021,sal_name_2021",
                                     "outSR": 4326, "f": "geojson"},
                    cache=f"abs_sal_{'_'.join(codes)}.geojson")


def _bbox_str(bbox):  # Overpass wants south,west,north,east
    w, s, e, n = bbox
    return f"{s},{w},{n},{e}"


def fetch_osm_buildings(bbox) -> dict:
    q = f"""[out:json][timeout:180][bbox:{_bbox_str(bbox)}];
(
  way["building"="apartments"];
  relation["building"="apartments"];
  way["building"="residential"]["building:levels"];
  relation["building"="residential"]["building:levels"];
  way["building"~"^(yes|residential)$"]["addr:flats"];
  way["building"~"^(yes|residential)$"]["building:flats"];
);
out tags geom;"""
    return overpass(q, f"osm_buildings_{'_'.join(f'{x:.4f}' for x in bbox)}.json")


def fetch_osm_streets(bbox) -> dict:
    q = f"""[out:json][timeout:180][bbox:{_bbox_str(bbox)}];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"]["name"];
out tags geom;"""
    return overpass(q, f"osm_streets_{'_'.join(f'{x:.4f}' for x in bbox)}.json")


def fetch_osm_context(bbox) -> dict:
    """Land-cover features used only for the physical-plausibility check of the heat layer."""
    q = f"""[out:json][timeout:180][bbox:{_bbox_str(bbox)}];
(
  way["leisure"~"^(park|golf_course|nature_reserve)$"];
  relation["leisure"~"^(park|golf_course|nature_reserve)$"];
  way["natural"~"^(wood|water|scrub)$"];
  relation["natural"~"^(wood|water|scrub)$"];
  way["landuse"~"^(forest|industrial|railway|retail|commercial|grass|recreation_ground)$"];
  relation["landuse"~"^(forest|industrial|railway|retail|commercial)$"];
  way["amenity"="parking"]["parking"!~"^(underground|multi-storey)$"];
  way["shop"="mall"];
  way["landuse"="residential"];
);
out tags geom;"""
    return overpass(q, f"osm_context_{'_'.join(f'{x:.4f}' for x in bbox)}.json")


def _arcgis_paged(url: str, params: dict, cache: str, page: int = 2000, slim=None) -> dict:
    p = RAW_DIR / cache
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    feats, offset = [], 0
    while True:
        prm = dict(params, resultOffset=offset, resultRecordCount=page, f="geojson")
        for attempt in range(4):
            try:
                r = requests.get(url, params=prm, headers=HEADERS, timeout=180)
                r.raise_for_status()
                d = r.json()
                break
            except Exception:  # noqa: BLE001
                if attempt == 3:
                    raise
                time.sleep(10 * (attempt + 1))
        batch = d.get("features", [])
        feats.extend(slim(f) for f in batch) if slim else feats.extend(batch)
        print(f"  {cache}: {len(feats)} features")
        if len(batch) < page and not d.get("properties", {}).get("exceededTransferLimit"):
            break
        offset += len(batch)
        time.sleep(1)
    out = {"type": "FeatureCollection", "features": feats}
    p.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    return out


def _env(bbox):
    w, s, e, n = bbox
    return {"geometry": f"{w},{s},{e},{n}", "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outSR": 4326, "where": "1=1"}


def fetch_address_points(bbox) -> dict:
    params = dict(_env(bbox), outFields="address,housenumber",
                  orderByFields="rid")
    def slim(f):  # keep the cache small: only the address string, house number and a 6-dp point
        g = f.get("geometry") or {}
        c = g.get("coordinates")
        return {"type": "Feature", "properties": {k: f["properties"].get(k) for k in ("address", "housenumber")},
                "geometry": {"type": "Point", "coordinates": [round(c[0], 6), round(c[1], 6)]} if c else None}
    return _arcgis_paged(NSW_ADDR, params, f"nsw_address_points_{'_'.join(f'{x:.4f}' for x in bbox)}.geojson",
                         slim=slim)


G37_FIELDS = ["sa1_code_2021", "sa2_name_2021", "r_tot_total", "total_total", "ten_type_ns_total",
              "r_tot_ds_flat_apart", "total_ds_flat_apart", "ten_ty_ns_ds_flat_apart"]


def fetch_census_sa1(bbox) -> dict:
    params = dict(_env(bbox), outFields=",".join(G37_FIELDS))
    return _arcgis_paged(ABS_G37_SA1, params, f"abs_g37_sa1_{'_'.join(f'{x:.4f}' for x in bbox)}.geojson")
