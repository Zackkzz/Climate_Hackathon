"""Build the Meterwise pilot-area dataset end to end.

    .venv/Scripts/python data/pipeline/build_pilot.py            # uses cached downloads in data/raw/
    .venv/Scripts/python data/pipeline/build_pilot.py --refresh  # deletes the cache and downloads again

Outputs (data/pilot/): buildings.geojson, meta.json, heat.png, preview.png, buildings_detail.csv, checks.json.
README.md is written by hand; its numbers come from checks.json.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import math
import re
import sys
from collections import Counter, defaultdict

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import geometry_mask
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import polygonize, transform as shp_transform, unary_union
from shapely.validation import make_valid

from common import CRS_PROJ, PILOT, PILOT_DIR, RAW_DIR
from geo_utils import mean_in_geom, pct_rank, spearman
from fetch_landsat import build_lst
from fetch_sources import (fetch_address_points, fetch_census_sa1, fetch_osm_buildings, fetch_osm_context,
                           fetch_osm_streets, fetch_sal)

# ---------------------------------------------------------------------------
# Documented assumptions
# ---------------------------------------------------------------------------
ASSUMED_STOREYS = 3          # typical walk-up when building:levels is not mapped
DEFAULT_M2_PER_FLAT = 85.0   # gross m2 per flat if too few buildings can be calibrated (see flats section)
VILLA_FOOTPRINT_PER_UNIT = 80.0  # m2 footprint per unit address at/above which dwellings sit side by side
#   (even at 2 storeys that is >= 160 m2 gross per dwelling, bigger than typical flats: townhouses or villas)
MIN_FOOTPRINT_M2 = 150.0     # smaller footprints are garages, sheds or mis-tagged townhouses
HEAT_BUFFER_M = 30.0         # LST is averaged over the footprint buffered by this distance
ADDR_SEARCH_M = 10.0         # NSW address points must lie within this distance of the footprint
PLAUSIBLE_M2_PER_FLAT = (35.0, 250.0)  # unit-address flat counts implying densities outside this are rejected
W_HEAT, W_RENT = 0.6, 0.4    # quick_score weights
BANDS = ["cooler", "average", "warm", "hot", "hottest"]

TO_PROJ = Transformer.from_crs("EPSG:4326", CRS_PROJ, always_xy=True).transform
TO_LL = Transformer.from_crs(CRS_PROJ, "EPSG:4326", always_xy=True).transform

STREET_TYPES = ("STREET|ROAD|AVENUE|PLACE|CRESCENT|CLOSE|PARADE|DRIVE|LANE|WAY|COURT|HIGHWAY|CIRCUIT|GROVE|"
                "TERRACE|BOULEVARD|BOULEVARDE|SQUARE|ESPLANADE|RISE|VIEW|WALK|MEWS|PROMENADE|GARDENS|CHASE|"
                "GLEN|OUTLOOK|PATHWAY|ROW|STRIP|VISTA|COVE|PARKWAY|LOOP|GREEN|RIDGE|TRAIL|ALLEY|APPROACH")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def pilot_bbox(sal_union):
    w, s, e, n = sal_union.bounds
    return [math.floor(w * 500) / 500, math.floor(s * 500) / 500, math.ceil(e * 500) / 500, math.ceil(n * 500) / 500]


def osm_geometry(el):
    """Polygon for an Overpass `out geom` way or multipolygon relation (lon/lat)."""
    if el["type"] == "way":
        pts = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(pts) < 4 or pts[0] != pts[-1]:
            return None
        return make_valid(Polygon(pts))
    outers, inners = [], []
    for m in el.get("members", []):
        if m.get("type") != "way" or "geometry" not in m:
            continue
        line = LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
        (inners if m.get("role") == "inner" else outers).append(line)
    if not outers:
        return None
    outer = unary_union(list(polygonize(outers)))
    if inners:
        outer = outer.difference(unary_union(list(polygonize(inners))))
    return make_valid(outer) if not outer.is_empty else None


def parse_levels(v):
    if not v:
        return None
    m = re.match(r"\s*(\d+(?:\.\d+)?)", str(v))
    return int(round(float(m.group(1)))) if m else None


def title_case(s):
    out = []
    for w in s.lower().split():
        w = w.capitalize()
        if w.startswith("Mc") and len(w) > 2:
            w = "Mc" + w[2:].capitalize()
        out.append(w)
    return " ".join(out)


def split_nsw_address(addr, hn):
    """'1/32 REDDAN AVENUE PENRITH', '1/32' -> ('32', 'Reddan Avenue', 'Penrith', '1')"""
    rest = addr[len(hn):].strip() if addr.startswith(hn) else addr
    unit, base = (hn.rsplit("/", 1) if "/" in hn else (None, hn))
    m = None
    for m in re.finditer(rf"\b({STREET_TYPES})\b", rest):
        pass
    if m:
        street, loc = rest[:m.end()], rest[m.end():].strip()
    else:
        street, loc = rest, ""
    return base.strip(), title_case(street), title_case(loc), unit


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------
def main():
    checks: dict = {}
    sal = fetch_sal(list(PILOT["suburbs"]))
    suburbs = [(PILOT["suburbs"][f["properties"]["sal_code_2021"]], shape(f["geometry"])) for f in sal["features"]]
    sal_union = unary_union([g for _, g in suburbs])
    sal_union_p = shp_transform(TO_PROJ, sal_union)
    suburbs_p = [(n, shp_transform(TO_PROJ, g)) for n, g in suburbs]
    bbox = pilot_bbox(sal_union)
    print("pilot bbox", bbox)

    # ---------------- buildings ----------------
    osm = fetch_osm_buildings(bbox)
    osm_snapshot = osm.get("osm3s", {}).get("timestamp_osm_base")
    excluded = Counter()
    cands = []
    for el in osm["elements"]:
        t = el.get("tags", {})
        bt = t.get("building")
        lv = parse_levels(t.get("building:levels"))
        flats_tag = parse_levels(t.get("building:flats") or t.get("addr:flats"))
        if bt == "apartments":
            pass
        elif bt == "residential" and lv is not None and lv >= 2:
            pass
        elif bt in ("yes", "residential") and flats_tag and flats_tag >= 2:
            pass
        else:
            excluded["not an apartment tag combination"] += 1
            continue
        g = osm_geometry(el)
        if g is None or g.is_empty:
            excluded["no usable geometry"] += 1
            continue
        if g.geom_type not in ("Polygon", "MultiPolygon"):
            g = MultiPolygon([p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon"])
            if g.is_empty:
                excluded["no usable geometry"] += 1
                continue
        gp = shp_transform(TO_PROJ, g)
        rp = gp.representative_point()
        sub = next((n for n, sg in suburbs_p if sg.contains(rp)), None)
        if sub is None:
            excluded["outside pilot suburbs"] += 1
            continue
        if lv is not None and lv < 2:
            excluded["mapped as single storey"] += 1
            continue
        if gp.area < MIN_FOOTPRINT_M2:
            excluded[f"footprint under {MIN_FOOTPRINT_M2:.0f} m2"] += 1
            continue
        cands.append(dict(osm_type=el["type"], osm_id=el["id"], tags=t, geom=g, geom_p=gp, suburb=sub, levels=lv,
                          flats_tag=flats_tag))
    # drop duplicates: a way largely covered by a relation or another larger candidate
    cands.sort(key=lambda c: -c["geom_p"].area)
    kept = []
    tree_geoms = []
    for c in cands:
        dup = False
        for k in tree_geoms:
            if k.intersects(c["geom_p"]) and k.intersection(c["geom_p"]).area > 0.8 * c["geom_p"].area:
                dup = True
                break
        if dup:
            excluded["duplicate of an overlapping footprint"] += 1
            continue
        kept.append(c)
        tree_geoms.append(c["geom_p"])
    blds = sorted(kept, key=lambda c: (c["osm_type"] != "way", c["osm_id"]))
    for b in blds:
        b["footprint_m2"] = round(b["geom_p"].area, 1)
        b["storeys"] = b["levels"] if b["levels"] else ASSUMED_STOREYS
        b["storeys_source"] = "osm" if b["levels"] else "assumed"
        b["gfa"] = b["footprint_m2"] * b["storeys"]
    checks["osm_snapshot"] = osm_snapshot
    checks["candidates_from_osm"] = len(osm["elements"])

    # ---------------- NSW address points ----------------
    addr_fc = fetch_address_points(bbox)
    pts, pinfo = [], []
    units_by_base = defaultdict(set)
    for f in addr_fc["features"]:
        a = f["properties"].get("address") or ""
        hn = f["properties"].get("housenumber") or ""
        if not a or not hn or not f.get("geometry"):
            continue
        base, street, loc, unit = split_nsw_address(a.strip(), hn.strip())
        key = (base, street, loc)
        if unit:
            units_by_base[key].add(unit)
        x, y = TO_PROJ(*f["geometry"]["coordinates"][:2])
        pts.append(Point(x, y))
        pinfo.append(key)
    ptree = STRtree(pts)

    def match_addresses(blist):
        groups = defaultdict(list)
        for b in blist:
            near = ptree.query(b["geom_p"].buffer(ADDR_SEARCH_M))
            best = None
            if len(near):
                score = defaultdict(lambda: [0, 1e9])
                for j in near:
                    d = b["geom_p"].distance(pts[j])
                    s = score[pinfo[j]]
                    s[0] += 1 if d == 0 else 0
                    s[1] = min(s[1], d)
                best = min(score.items(), key=lambda kv: (-kv[1][0], kv[1][1], -len(units_by_base[kv[0]])))[0]
            b["nsw_base"] = best
            b["unit_addresses"], b["unit_share"] = None, None
            if best:
                groups[best].append(b)
        # each building's share of the unit addresses at its street address, split by floor area
        for key, group in groups.items():
            n_units = len(units_by_base.get(key, ()))
            if n_units < 2:
                continue
            tot = sum(g["gfa"] for g in group)
            for g in group:
                g["unit_addresses"] = n_units
                g["unit_share"] = n_units * g["gfa"] / tot
        return groups

    match_addresses(blds)
    # Villas and townhouses are often tagged building=apartments in OSM. Where the NSW unit addresses show each
    # dwelling has >= VILLA_FOOTPRINT_PER_UNIT m2 of footprint (and OSM does not map 3+ storeys), the dwellings
    # sit side by side rather than stacked, so the building is not a block of flats.
    kept2 = []
    for b in blds:
        if (b["unit_share"] and b["footprint_m2"] / b["unit_share"] >= VILLA_FOOTPRINT_PER_UNIT
                and (b["storeys_source"] == "assumed" or b["storeys"] <= 2)):
            excluded[f"likely villas or townhouses (>= {VILLA_FOOTPRINT_PER_UNIT:.0f} m2 footprint per unit "
                     "address)"] += 1
            continue
        kept2.append(b)
    blds = kept2
    base_to_blds = match_addresses(blds)  # re-split unit addresses among the remaining buildings
    for i, b in enumerate(blds, 1):
        b["id"] = f"b_{i:06d}"
    print(f"{len(blds)} buildings kept; excluded: {dict(excluded)}")
    checks["excluded"] = dict(excluded)

    # labels
    streets = fetch_osm_streets(bbox)
    sgeoms, snames = [], []
    for el in streets["elements"]:
        if len(el.get("geometry", [])) >= 2:
            sgeoms.append(shp_transform(TO_PROJ, LineString([(p["lon"], p["lat"]) for p in el["geometry"]])))
            snames.append(el["tags"]["name"])
    stree = STRtree(sgeoms)
    for b in blds:
        t = b["tags"]
        if t.get("addr:housenumber") and t.get("addr:street"):
            b["label"] = f"{t['addr:housenumber']} {t['addr:street']}, {t.get('addr:suburb', b['suburb'])}"
            b["label_source"] = "osm_address"
        elif b["nsw_base"]:
            base, street, loc = b["nsw_base"]
            b["label"] = f"{base} {street}, {loc or b['suburb']}"
            b["label_source"] = "nsw_address_point"
        elif t.get("name"):
            b["label"] = t["name"]
            b["label_source"] = "osm_name"
        else:
            j = stree.nearest(b["geom_p"].centroid)
            b["label"] = f"Block near {snames[j]}"
            b["label_source"] = "nearest_osm_street"
    # several blocks on one lot share a street address: number them so every label is unique
    by_label = defaultdict(list)
    for b in blds:
        by_label[b["label"]].append(b)
    for lab, group in by_label.items():
        if len(group) > 1:
            group.sort(key=lambda b: (-b["geom_p"].centroid.y, b["geom_p"].centroid.x))  # north to south
            for k, b in enumerate(group, 1):
                b["label"] = f"{lab} (block {k} of {len(group)})"

    # flats (1): unit-address count where it implies a plausible floor area per flat
    for b in blds:
        b["flats_source"] = None
        if b["flats_tag"]:
            b["flats_est"], b["flats_source"] = b["flats_tag"], "osm_flats_tag"
        elif b["unit_share"]:
            if PLAUSIBLE_M2_PER_FLAT[0] <= b["gfa"] / b["unit_share"] <= PLAUSIBLE_M2_PER_FLAT[1]:
                b["flats_est"], b["flats_source"] = max(1, int(round(b["unit_share"]))), "nsw_unit_addresses"
            else:
                b["flats_source"] = "area_rule (unit-address count implausible)"
    # flats (2): calibrate the area rule on buildings that have a street address to themselves (like for like)
    calib = [b for b in blds if b["flats_source"] == "nsw_unit_addresses" and len(base_to_blds[b["nsw_base"]]) == 1]
    gfa_per_unit = np.array([b["gfa"] / b["flats_est"] for b in calib])
    m2_per_flat = float(5 * round(np.median(gfa_per_unit) / 5)) if len(calib) >= 30 else DEFAULT_M2_PER_FLAT
    checks["m2_per_flat_used"] = m2_per_flat
    checks["m2_per_flat_calibrated"] = len(calib) >= 30
    # flats (3): area rule for the rest
    for b in blds:
        b["flats_rule"] = max(2, int(round(b["gfa"] / m2_per_flat)))
        b["flats_rule_default"] = max(2, int(round(b["gfa"] / DEFAULT_M2_PER_FLAT)))
        if b["flats_source"] in (None, "area_rule (unit-address count implausible)"):
            b["flats_est"] = b["flats_rule"]
            b["flats_source"] = b["flats_source"] or "area_rule"
    if calib:
        u = np.array([b["flats_est"] for b in calib], float)
        r = np.array([b["flats_rule"] for b in calib], float)
        r0 = np.array([b["flats_rule_default"] for b in calib], float)
        osm_only = [b["gfa"] / b["flats_est"] for b in calib if b["storeys_source"] == "osm"]
        checks["flats_rule_vs_unit_addresses"] = {
            "n_buildings": len(calib),
            "median_gross_m2_per_unit_address": round(float(np.median(gfa_per_unit)), 1),
            "iqr_gross_m2_per_unit_address": [round(float(x), 1) for x in np.quantile(gfa_per_unit, [.25, .75])],
            "median_gross_m2_per_unit_address_osm_storeys_only": (round(float(np.median(osm_only)), 1)
                                                                   if osm_only else None),
            "n_osm_storeys_only": len(osm_only),
            "calibrated_rule_median_abs_pct_error": round(float(np.median(np.abs(r - u) / u) * 100), 1),
            "calibrated_rule_spearman": round(spearman(r, u)[0], 3),
            "default_85m2_rule_median_abs_pct_error": round(float(np.median(np.abs(r0 - u) / u) * 100), 1),
            "default_85m2_rule_median_ratio_to_units": round(float(np.median(r0 / u)), 2),
            "note": "in-sample: the calibrated constant is fitted on these same buildings",
        }

    # ---------------- heat ----------------
    lst_tif, lst_meta = build_lst(bbox)
    with rasterio.open(lst_tif) as ds:
        lst = ds.read(1)
        nscenes = ds.read(2)
        gt = ds.transform
        lst_profile = ds.profile
    area_mask = geometry_mask([mapping(sal_union_p)], out_shape=lst.shape, transform=gt, invert=True)
    area_vals = lst[area_mask & ~np.isnan(lst)]
    area_median = float(np.median(area_vals))
    checks["lst_area_median_c"] = round(area_median, 2)
    checks["lst_scene_count"] = len(lst_meta["scenes_used"])
    checks["lst_min_clear_scenes_per_pixel_in_area"] = int(nscenes[area_mask].min())
    for b in blds:
        v, n = mean_in_geom(lst, gt, b["geom_p"].buffer(HEAT_BUFFER_M))
        b["lst_c"] = v
        b["lst_pixels"] = n
    if any(math.isnan(b["lst_c"]) for b in blds):
        raise RuntimeError("Some buildings have no LST value")
    anoms = np.array([b["lst_c"] - area_median for b in blds])
    q = np.quantile(anoms, [0.2, 0.4, 0.6, 0.8])
    for b, a in zip(blds, anoms):
        b["heat_anomaly_c"] = round(float(a), 2)
        b["heat_band"] = BANDS[int(np.searchsorted(q, a, side="right"))]
    checks["heat_band_breaks_c"] = [round(float(x), 2) for x in q]

    # ---------------- renters ----------------
    sa1 = fetch_census_sa1(bbox)
    sa1_geoms, sa1_props = [], []
    for f in sa1["features"]:
        if f.get("geometry"):
            sa1_geoms.append(shp_transform(TO_PROJ, shape(f["geometry"])))
            sa1_props.append(f["properties"])
    sa1_tree = STRtree(sa1_geoms)
    for b in blds:
        rp = b["geom_p"].representative_point()
        hit = [j for j in sa1_tree.query(rp) if sa1_geoms[j].contains(rp)]
        b["sa1"] = sa1_props[hit[0]] if hit else None
        b["renter_share"] = None
        b["renter_share_flats"] = None
        if b["sa1"]:
            p = b["sa1"]
            if p.get("total_total"):
                b["renter_share"] = round(p["r_tot_total"] / p["total_total"], 3)
            if p.get("total_ds_flat_apart"):
                b["renter_share_flats"] = round(p["r_tot_ds_flat_apart"] / p["total_ds_flat_apart"], 3)
    # pilot-wide figures, summed over the SA1s that contain at least one building
    used_sa1 = {b["sa1"]["sa1_code_2021"]: b["sa1"] for b in blds if b["sa1"]}
    tot = sum(p["total_total"] for p in used_sa1.values())
    rent = sum(p["r_tot_total"] for p in used_sa1.values())
    totf = sum(p["total_ds_flat_apart"] for p in used_sa1.values())
    rentf = sum(p["r_tot_ds_flat_apart"] for p in used_sa1.values())
    checks["census"] = {"sa1_count_with_buildings": len(used_sa1), "dwellings": tot, "rented": rent,
                        "renter_share_all_dwellings": round(rent / tot, 3) if tot else None,
                        "flat_dwellings": totf, "rented_flats": rentf,
                        "renter_share_flats": round(rentf / totf, 3) if totf else None}
    # sanity check of flats_est: our estimated flats per SA1 vs occupied flats counted at the 2021 Census
    est_by_sa1 = defaultdict(int)
    for b in blds:
        if b["sa1"]:
            est_by_sa1[b["sa1"]["sa1_code_2021"]] += b["flats_est"]
    codes = sorted(est_by_sa1)
    est = [est_by_sa1[k] for k in codes]
    cen = [used_sa1[k]["total_ds_flat_apart"] for k in codes]
    checks["flats_est_vs_census_flats"] = {
        "sa1s": len(codes), "flats_est_total": int(sum(est)), "census_2021_occupied_flats": int(sum(cen)),
        "ratio": round(sum(est) / sum(cen), 2) if sum(cen) else None,
        "spearman_by_sa1": round(spearman(est, cen)[0], 3),
        "note": "Census counts occupied flats in 2021 only (no vacant flats, no blocks finished after Aug 2021) "
                "and includes flats in buildings not mapped in OSM.",
    }

    # ---------------- quick score ----------------
    hp = pct_rank([b["heat_anomaly_c"] for b in blds])
    rpk = pct_rank([b["renter_share"] for b in blds])
    for b, h, r in zip(blds, hp, rpk):
        s = (W_HEAT * h + W_RENT * r) if r is not None else h
        b["quick_score"] = int(round(100 * s))

    # ---------------- write GeoJSON ----------------
    def rnd(geom):
        g = shape(json.loads(json.dumps(mapping(geom)), parse_float=lambda x: round(float(x), 6)))
        if not g.is_valid:
            g = make_valid(g)
        if g.geom_type == "Polygon":
            return orient(g, 1.0)
        if g.geom_type == "MultiPolygon":
            return MultiPolygon([orient(p, 1.0) for p in g.geoms])
        polys = [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon"]
        return MultiPolygon([orient(p, 1.0) for p in polys]) if len(polys) > 1 else orient(polys[0], 1.0)

    feats = []
    for b in blds:
        g = rnd(b["geom"])
        coords = json.loads(json.dumps(mapping(g)), parse_float=lambda x: round(float(x), 6))
        feats.append({"type": "Feature", "geometry": coords, "properties": {
            "id": b["id"], "label": b["label"], "suburb": b["suburb"], "storeys": int(b["storeys"]),
            "storeys_source": b["storeys_source"], "flats_est": int(b["flats_est"]),
            "footprint_m2": b["footprint_m2"], "roof_m2": b["footprint_m2"],
            "heat_anomaly_c": b["heat_anomaly_c"], "heat_band": b["heat_band"],
            "renter_share": b["renter_share"], "quick_score": b["quick_score"]}})
    fc = {"type": "FeatureCollection", "features": feats}
    gj_path = PILOT_DIR / "buildings.geojson"
    gj_path.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")

    # ---------------- checks ----------------
    import validate_pilot  # local module
    checks.update(validate_pilot.run_all(blds, bbox, lst, gt, area_median, sal_union_p, suburbs_p, lst_profile))
    n = len(blds)
    checks["building_count"] = n
    checks["by_suburb"] = dict(Counter(b["suburb"] for b in blds))
    checks["share_storeys_mapped"] = round(sum(b["storeys_source"] == "osm" for b in blds) / n, 3)
    checks["label_sources"] = dict(Counter(b["label_source"] for b in blds))
    checks["share_with_street_address"] = round(
        sum(b["label_source"] in ("osm_address", "nsw_address_point") for b in blds) / n, 3)
    checks["flats_sources"] = dict(Counter(b["flats_source"] for b in blds))
    checks["flats_total"] = int(sum(b["flats_est"] for b in blds))
    checks["heat_anomaly_c"] = {"min": round(float(anoms.min()), 2), "median": round(float(np.median(anoms)), 2),
                                "max": round(float(anoms.max()), 2), "p10": round(float(np.quantile(anoms, .1)), 2),
                                "p90": round(float(np.quantile(anoms, .9)), 2)}
    rs = [b["renter_share"] for b in blds if b["renter_share"] is not None]
    checks["renter_share"] = {"n_with_value": len(rs), "min": min(rs), "median": float(np.median(rs)), "max": max(rs)}
    qs = [b["quick_score"] for b in blds]
    checks["quick_score"] = {"min": min(qs), "median": float(np.median(qs)), "max": max(qs)}
    checks["geojson"] = validate_pilot.validate_geojson(gj_path)

    # sidecar with provenance per building
    with open(PILOT_DIR / "buildings_detail.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "osm_type", "osm_id", "osm_building_tag", "osm_building_levels", "label_source",
                    "nsw_base_address", "unit_addresses_at_base_address", "buildings_sharing_base_address",
                    "flats_source", "flats_area_rule", "lst_median_summer_c", "lst_pixels", "sa1_code_2021",
                    "sa2_name_2021", "renter_share_flats_only", "lst_nsw_2022_23_c", "lat", "lon"])
        for b in blds:
            c = b["geom"].representative_point()
            base = b["nsw_base"]
            w.writerow([b["id"], b["osm_type"], b["osm_id"], b["tags"].get("building"),
                        b["tags"].get("building:levels", ""), b["label_source"],
                        " ".join(x for x in base if x) if base else "",
                        b["unit_addresses"] if b["unit_addresses"] is not None else "",
                        len(base_to_blds[base]) if base else "", b["flats_source"], b["flats_rule"],
                        round(b["lst_c"], 2), b["lst_pixels"],
                        b["sa1"]["sa1_code_2021"] if b["sa1"] else "", b["sa1"]["sa2_name_2021"] if b["sa1"] else "",
                        b["renter_share_flats"] if b["renter_share_flats"] is not None else "",
                        "" if math.isnan(b.get("lst_nsw_2022_23", float("nan"))) else round(b["lst_nsw_2022_23"], 2),
                        round(c.y, 6), round(c.x, 6)])

    checks["lst_scenes"] = lst_meta["scenes_used"]
    checks["lst_scenes_rejected"] = lst_meta["scenes_rejected"]
    (PILOT_DIR / "checks.json").write_text(json.dumps(checks, indent=1, default=str), encoding="utf-8")

    # ---------------- heat overlay + preview ----------------
    overlay = validate_pilot.write_heat_png(lst, gt, bbox, PILOT_DIR / "heat.png")
    validate_pilot.write_preview(blds, lst, gt, suburbs_p, PILOT_DIR / "preview.png", area_median)

    # ---------------- meta ----------------
    import meta_text
    w_, s_, e_, n_ = sal_union.bounds
    meta = {
        "name": PILOT["name"],
        "description": meta_text.description(checks),
        "centre": {"lat": round((s_ + n_) / 2, 5), "lon": round((w_ + e_) / 2, 5)},
        "bbox": [round(w_, 5), round(s_, 5), round(e_, 5), round(n_, 5)],
        "building_count": n,
        "suburbs": sorted(PILOT["suburbs"].values()),
        "data_notes": meta_text.data_notes(checks),
        "sources": meta_text.SOURCES,
        "method": meta_text.method(checks),
        "heat_overlay": overlay,
        "landsat_scenes": [{"id": s["id"], "date": s["date"]} for s in lst_meta["scenes_used"]],
        "osm_snapshot": osm_snapshot,
        "generated": dt.date.today().isoformat(),
    }
    (PILOT_DIR / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in checks.items() if k not in ("lst_scenes", "lst_scenes_rejected")}, indent=1,
                     default=str))


if __name__ == "__main__":
    if "--refresh" in sys.argv:
        for p in RAW_DIR.glob("*"):
            p.unlink()
    main()
