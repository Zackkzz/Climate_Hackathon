"""Checks, independent comparison, heat overlay and preview image for the pilot dataset."""
from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
import requests  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402
from pyproj import Transformer  # noqa: E402
from rasterio.enums import Resampling  # noqa: E402
from rasterio.features import geometry_mask  # noqa: E402
from rasterio.transform import from_bounds  # noqa: E402
from rasterio.warp import reproject  # noqa: E402
from rasterio.windows import from_bounds as window_from_bounds  # noqa: E402
from shapely.geometry import MultiPolygon, Polygon, mapping, shape  # noqa: E402
from shapely.ops import transform as shp_transform, unary_union  # noqa: E402

from common import CRS_PROJ, HEADERS, RAW_DIR  # noqa: E402
from geo_utils import mean_in_geom, spearman  # noqa: E402

NSW_LST_URL = ("https://datasets.seed.nsw.gov.au/dataset/08c39277-8b70-4c4d-905e-5c931c2eef08/resource/"
               "b081a8de-ca2e-4693-b961-706cd9f2c6ad/download/lst_sydney_2022-2023_summer.tif")
BAND_COLOURS = {"cooler": "#2c7bb6", "average": "#abd9e9", "warm": "#ffffbf", "hot": "#fdae61", "hottest": "#d7191c"}
REQUIRED = {"id": str, "label": str, "suburb": str, "storeys": int, "storeys_source": str, "flats_est": int,
            "footprint_m2": (int, float), "roof_m2": (int, float), "heat_anomaly_c": (int, float),
            "heat_band": str, "renter_share": (int, float, type(None)), "quick_score": int}

TO_PROJ = Transformer.from_crs("EPSG:4326", CRS_PROJ, always_xy=True).transform
TO_LL = Transformer.from_crs(CRS_PROJ, "EPSG:4326", always_xy=True).transform


# ---------------------------------------------------------------------------
# Independent comparison: NSW Government Greater Sydney LST, summer 2022-23
# ---------------------------------------------------------------------------
def fetch_nsw_lst(bbox):
    out = RAW_DIR / f"nsw_lst_2022_23_{'_'.join(f'{x:.4f}' for x in bbox)}.tif"
    if out.exists():
        return out
    r = requests.get(NSW_LST_URL, headers=HEADERS, allow_redirects=False, timeout=60)
    href = r.headers.get("Location", NSW_LST_URL)
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
               GDAL_HTTP_USERAGENT=HEADERS["User-Agent"])
    w, s, e, n = bbox
    pad = 0.005
    with rasterio.Env(**env), rasterio.open("/vsicurl/" + href) as ds:
        win = window_from_bounds(w - pad, s - pad, e + pad, n + pad, ds.transform).round_offsets().round_lengths()
        arr = ds.read(1, window=win).astype("float32")
        prof = dict(driver="GTiff", dtype="float32", count=1, width=arr.shape[1], height=arr.shape[0],
                    crs=ds.crs, transform=ds.window_transform(win), nodata=np.nan, compress="deflate")
        nod = ds.nodata
    if nod is not None:
        arr[arr == nod] = np.nan
    arr[(arr < -50) | (arr > 90)] = np.nan
    with rasterio.open(out, "w", **prof) as dst:
        dst.write(arr, 1)
    return out


def compare_nsw(blds, bbox, lst, gt, sal_union_p, lst_profile):
    try:
        p = fetch_nsw_lst(bbox)
    except Exception as e:  # noqa: BLE001
        return {"available": False, "error": str(e)}
    with rasterio.open(p) as ds:
        nsw = ds.read(1)
        nt = ds.transform
        ncrs = ds.crs
    to_n = Transformer.from_crs(CRS_PROJ, ncrs, always_xy=True).transform
    ours, theirs = [], []
    for b in blds:
        g = shp_transform(to_n, b["geom_p"].buffer(30.0))
        v, _ = mean_in_geom(nsw, nt, g)
        b["lst_nsw_2022_23"] = v
        ours.append(b["lst_c"])
        theirs.append(v)
    rho, n = spearman(ours, theirs)
    o, t = np.array(ours), np.array(theirs)
    ok = ~np.isnan(t)
    pear = float(np.corrcoef(o[ok], t[ok])[0, 1])
    # quintile agreement
    def quint(x):
        q = np.quantile(x, [0.2, 0.4, 0.6, 0.8])
        return np.searchsorted(q, x, side="right")
    qo, qt = quint(o[ok]), quint(t[ok])
    # pixel-level comparison on our grid within the pilot suburbs
    nsw_on_ours = np.full(lst.shape, np.nan, dtype="float32")
    reproject(nsw, nsw_on_ours, src_transform=nt, src_crs=ncrs, dst_transform=gt, dst_crs=CRS_PROJ,
              resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    m = geometry_mask([mapping(sal_union_p)], out_shape=lst.shape, transform=gt, invert=True)
    m &= ~np.isnan(lst) & ~np.isnan(nsw_on_ours)
    prho, pn = spearman(lst[m], nsw_on_ours[m])
    return {
        "available": True,
        "dataset": "NSW DCCEEW Land Surface Temperature for Greater Sydney, summer 2022-2023 (SEED portal)",
        "nsw_area_median_c": round(float(np.nanmedian(nsw_on_ours[m])), 2),
        "buildings_compared": n,
        "spearman_building_lst": round(rho, 3),
        "pearson_building_lst": round(pear, 3),
        "same_quintile_share": round(float(np.mean(qo == qt)), 3),
        "within_one_quintile_share": round(float(np.mean(np.abs(qo - qt) <= 1)), 3),
        "pixels_compared": pn,
        "spearman_pixels_in_pilot_suburbs": round(prho, 3),
    }


# ---------------------------------------------------------------------------
# Physical plausibility: LST over land-cover classes and named places (OSM)
# ---------------------------------------------------------------------------
CLASSES = [
    ("Water (river, lakes, ponds)", lambda t: t.get("natural") == "water"),
    ("Woodland and bushland", lambda t: t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest"
     or t.get("leisure") == "nature_reserve"),
    ("Parks, sports grounds, golf", lambda t: t.get("leisure") in ("park", "golf_course")
     or t.get("landuse") in ("grass", "recreation_ground")),
    ("Residential land", lambda t: t.get("landuse") == "residential"),
    ("Shopping centres and commercial", lambda t: t.get("shop") == "mall"
     or t.get("landuse") in ("retail", "commercial")),
    ("Industrial land", lambda t: t.get("landuse") == "industrial"),
    ("Railway land", lambda t: t.get("landuse") == "railway"),
    ("Open-air car parks", lambda t: t.get("amenity") == "parking"),
]


def _geom(el):
    from build_pilot import osm_geometry
    g = osm_geometry(el)
    if g is None or g.is_empty:
        return None
    if g.geom_type not in ("Polygon", "MultiPolygon"):
        polys = [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon"]
        if not polys:
            return None
        g = MultiPolygon(polys)
    return shp_transform(TO_PROJ, g)


def _near(g):
    c = shp_transform(TO_LL, g.representative_point())
    return f"{c.y:.4f}, {c.x:.4f}"


def landcover_check(bbox, lst, gt, area_median):
    import os
    from fetch_sources import fetch_osm_context
    if os.environ.get("MW_SKIP_CONTEXT"):  # development shortcut only
        return {"available": False, "error": "skipped"}, []
    try:
        ctx = fetch_osm_context(bbox)
    except Exception as e:  # noqa: BLE001
        return {"available": False, "error": str(e)}, []
    h, w = lst.shape
    grid_poly = Polygon([gt * (0, 0), gt * (w, 0), gt * (w, h), gt * (0, h)])
    classes, named = [], []
    for cname, pred in CLASSES:
        geoms = []
        for el in ctx["elements"]:
            t = el.get("tags", {})
            if not pred(t):
                continue
            g = _geom(el)
            if g is None or not g.intersects(grid_poly):
                continue
            g = g.intersection(grid_poly)
            geoms.append((g, t.get("name")))
        if not geoms:
            continue
        u = unary_union([g for g, _ in geoms])
        core = u.buffer(-30.0)  # stay away from edges: thermal pixels are 100 m resampled to 30 m
        target = core if not core.is_empty and core.area > 5000 else u
        m = geometry_mask([mapping(target)], out_shape=lst.shape, transform=gt, invert=True) & ~np.isnan(lst)
        if m.sum() < 5:
            continue
        v = lst[m]
        classes.append({"class": cname, "pixels": int(m.sum()), "median_lst_c": round(float(np.median(v)), 2),
                        "anomaly_vs_pilot_median_c": round(float(np.median(v)) - area_median, 2)})
        # largest named feature of this class
        nm = [(g, n) for g, n in geoms if n]
        if not nm or cname == "Open-air car parks":  # car parks are rarely named; take the largest one
            nm = [(g, n or f"Largest mapped area of this type (near {_near(g)})") for g, n in geoms]
        if nm:
            g, n = max(nm, key=lambda x: x[0].area)
            core = g.buffer(-30.0)
            tg = core if not core.is_empty and core.area > 3000 else g
            val, npx = mean_in_geom(lst, gt, tg)
            if npx >= 3:
                c = shp_transform(TO_LL, g.representative_point())
                named.append({"place": n, "class": cname, "area_ha": round(g.area / 1e4, 1), "pixels": npx,
                              "mean_lst_c": round(val, 2), "anomaly_vs_pilot_median_c": round(val - area_median, 2),
                              "lat": round(c.y, 5), "lon": round(c.x, 5)})
    return {"available": True, "classes": classes}, named


def run_all(blds, bbox, lst, gt, area_median, sal_union_p, suburbs_p, lst_profile):
    out = {}
    out["independent_comparison"] = compare_nsw(blds, bbox, lst, gt, sal_union_p, lst_profile)
    lc, named = landcover_check(bbox, lst, gt, area_median)
    out["landcover_check"] = lc
    out["named_places"] = named
    return out


# ---------------------------------------------------------------------------
# GeoJSON validation
# ---------------------------------------------------------------------------
def validate_geojson(path: Path):
    problems = []
    size = path.stat().st_size
    fc = json.loads(path.read_text(encoding="utf-8"))
    if fc.get("type") != "FeatureCollection":
        problems.append("not a FeatureCollection")
    ids = [f["properties"].get("id") for f in fc["features"]]
    if len(ids) != len(set(ids)):
        problems.append("duplicate ids")
    max_dec = 0
    for f in fc["features"]:
        p = f["properties"]
        if set(p) != set(REQUIRED):
            problems.append(f"{p.get('id')}: property set differs: {sorted(set(p) ^ set(REQUIRED))}")
        for k, typ in REQUIRED.items():
            if k in p and not isinstance(p[k], typ):
                problems.append(f"{p.get('id')}: {k} has type {type(p[k]).__name__}")
        if p.get("heat_band") not in BAND_COLOURS:
            problems.append(f"{p['id']}: bad heat_band")
        if p.get("storeys_source") not in ("osm", "assumed"):
            problems.append(f"{p['id']}: bad storeys_source")
        if p.get("renter_share") is not None and not 0 <= p["renter_share"] <= 1:
            problems.append(f"{p['id']}: renter_share out of range")
        if not 0 <= p.get("quick_score", -1) <= 100:
            problems.append(f"{p['id']}: quick_score out of range")
        g = shape(f["geometry"])
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
            problems.append(f"{p['id']}: geometry type {f['geometry']['type']}")
        if not g.is_valid:
            problems.append(f"{p['id']}: invalid geometry")
        for x in json.dumps(f["geometry"]["coordinates"]).replace("[", ",").replace("]", ",").split(","):
            x = x.strip()
            if "." in x:
                max_dec = max(max_dec, len(x.split(".")[1]))
    return {"features": len(fc["features"]), "unique_ids": len(set(ids)) == len(ids), "size_bytes": size,
            "max_coordinate_decimals": max_dec, "problems": problems[:20], "problem_count": len(problems),
            "passed": not problems and size < 3_000_000}


# ---------------------------------------------------------------------------
# Heat overlay PNG (Web Mercator grid, placed by lon/lat bounds) and preview
# ---------------------------------------------------------------------------
def write_heat_png(lst, gt, bbox, path: Path):
    w, s, e, n = bbox
    to_m = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True).transform
    x0, y0 = to_m(w, s)
    x1, y1 = to_m(e, n)
    res = 25.0
    width, height = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res))
    dt = from_bounds(x0, y0, x1, y1, width, height)
    dst = np.full((height, width), np.nan, dtype="float32")
    reproject(lst.astype("float32"), dst, src_transform=gt, src_crs=CRS_PROJ, dst_transform=dt, dst_crs="EPSG:3857",
              resampling=Resampling.bilinear, src_nodata=np.nan, dst_nodata=np.nan)
    vmin, vmax = np.nanpercentile(dst, [2, 98])
    vmin, vmax = float(math.floor(vmin)), float(math.ceil(vmax))
    cmap = plt.get_cmap("RdYlBu_r")
    rgba = cmap(np.clip((dst - vmin) / (vmax - vmin), 0, 1))
    rgba[..., 3] = np.where(np.isnan(dst), 0, 1)
    plt.imsave(path, (rgba * 255).astype("uint8"))
    return {"file": "heat.png", "bounds": [w, s, e, n], "image_crs": "EPSG:3857 (place with lon/lat bounds)",
            "colormap": "RdYlBu_r", "min_c": vmin, "max_c": vmax,
            "value": "median summer daytime land surface temperature, degrees C"}


def write_preview(blds, lst, gt, suburbs_p, path: Path, area_median):
    h, w = lst.shape
    ext = [gt.c, gt.c + gt.a * w, gt.f + gt.e * h, gt.f]
    fig, ax = plt.subplots(figsize=(11, 8), dpi=150)
    im = ax.imshow(lst, extent=ext, cmap="Greys_r", alpha=0.55, origin="upper")
    plt.colorbar(im, ax=ax, shrink=0.6, label="Median summer land surface temperature (°C)")
    for name, g in suburbs_p:
        polys = g.geoms if g.geom_type == "MultiPolygon" else [g]
        for p in polys:
            x, y = p.exterior.xy
            ax.plot(x, y, color="black", lw=1.2, ls="--")
        c = g.representative_point()
        ax.text(c.x, c.y, name, fontsize=12, weight="bold", ha="center")
    for b in blds:
        g = b["geom_p"]
        polys = g.geoms if g.geom_type == "MultiPolygon" else [g]
        for p in polys:
            x, y = p.buffer(12).exterior.xy  # slightly enlarged so small footprints are visible
            ax.fill(x, y, color=BAND_COLOURS[b["heat_band"]], ec="black", lw=0.3)
    ax.legend(handles=[Patch(color=c, label=k) for k, c in BAND_COLOURS.items()], title="Heat band (quintiles)",
              loc="lower left")
    ax.set_title(f"Meterwise pilot: {len(blds)} apartment buildings coloured by summer heat band\n"
                 f"(Landsat 8/9 surface temperature, pilot median {area_median:.1f} °C; footprints enlarged 12 m)")
    ax.set_xlabel("Easting (m, MGA zone 56)")
    ax.set_ylabel("Northing (m)")
    ax.set_aspect("equal")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
