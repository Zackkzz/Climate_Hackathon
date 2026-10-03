"""Summer daytime land surface temperature (LST) for the pilot bbox from Landsat 8/9 Collection 2 Level-2.

Source: Microsoft Planetary Computer STAC (collection `landsat-c2-l2`). Only the pilot window is read from
each cloud-optimised GeoTIFF (no bulk download). Each scene is warped onto a common 30 m grid in
GDA2020 / MGA zone 56 (EPSG:7856), cloud/shadow/fill pixels are masked with QA_PIXEL, and the per-pixel
median across all usable scenes is written to data/raw/lst_median_<hash>.tif together with a JSON list of
the scenes used.
"""
from __future__ import annotations

import json
import math

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds

from common import CRS_PROJ, RAW_DIR, short_hash

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
SUMMERS = [("2023-12-01", "2024-02-29"), ("2024-12-01", "2025-02-28"), ("2025-12-01", "2026-02-28")]
SCENE_CLOUD_MAX = 40.0      # scene-level filter (whole 185 km scene); the real filter is the window clear fraction
WINDOW_CLEAR_MIN = 0.90     # keep a scene only if >= 90% of pilot-window pixels are clear
ST_SCALE, ST_OFFSET = 0.00341802, 149.0
RES = 30.0
MIN_WINDOW_MEDIAN_C = 20.0

GDAL_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2",
                CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.TIF", GDAL_HTTP_USERAGENT="Meterwise-hackathon-pipeline/0.1")

# QA_PIXEL bits: 0 fill, 1 dilated cloud, 2 cirrus, 3 cloud, 4 cloud shadow
QA_BAD = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)


def grid_for_bbox(bbox_ll, pad_m=300.0):
    """Common 30 m grid in EPSG:7856 covering the lon/lat bbox plus padding."""
    w, s, e, n = transform_bounds("EPSG:4326", CRS_PROJ, *bbox_ll, densify_pts=21)
    w, s = math.floor((w - pad_m) / RES) * RES, math.floor((s - pad_m) / RES) * RES
    e, n = math.ceil((e + pad_m) / RES) * RES, math.ceil((n + pad_m) / RES) * RES
    width, height = int((e - w) / RES), int((n - s) / RES)
    return from_origin(w, n, RES, RES), width, height


def read_on_grid(href, transform, width, height, resampling):
    with rasterio.open(href) as src:
        with WarpedVRT(src, crs=CRS.from_string(CRS_PROJ), transform=transform, width=width, height=height,
                       resampling=resampling, src_nodata=src.nodata) as vrt:
            return vrt.read(1)


def build_lst(bbox_ll, force=False):
    key = short_hash(json.dumps([round(x, 5) for x in bbox_ll]) + str(SUMMERS) + str(WINDOW_CLEAR_MIN) + 'T1')
    out_tif = RAW_DIR / f"lst_median_{key}.tif"
    out_json = RAW_DIR / f"lst_scenes_{key}.json"
    if out_tif.exists() and out_json.exists() and not force:
        return out_tif, json.loads(out_json.read_text())

    transform, width, height = grid_for_bbox(bbox_ll)
    cat = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    items = []
    for start, end in SUMMERS:
        search = cat.search(collections=["landsat-c2-l2"], bbox=bbox_ll, datetime=f"{start}/{end}",
                            query={"eo:cloud_cover": {"lt": SCENE_CLOUD_MAX},
                                   "platform": {"in": ["landsat-8", "landsat-9"]}})
        items.extend(search.items())
    items.sort(key=lambda it: it.datetime)
    print(f"{len(items)} candidate scenes")

    stack, used, rejected = [], [], []
    seen_dates = set()
    with rasterio.Env(**GDAL_ENV):
        for it in items:
            date = it.datetime.date().isoformat()
            # The same overpass appears in two adjacent WRS rows; keep the first one that covers the window cleanly.
            if date in seen_dates:
                continue
            if not it.id.endswith("_T1"):
                # Tier 2 scenes have poorer geometry/calibration; skip them.
                rejected.append({"id": it.id, "date": date, "reason": "Tier 2 product"})
                continue
            try:
                qa = read_on_grid(it.assets["qa_pixel"].href, transform, width, height, Resampling.nearest)
                st = read_on_grid(it.assets["lwir11"].href, transform, width, height, Resampling.bilinear)
            except Exception as e:  # noqa: BLE001
                print("  read failed", it.id, e)
                rejected.append({"id": it.id, "date": date, "reason": f"read failed: {e}"})
                continue
            good = ((qa & QA_BAD) == 0) & (qa != 0) & (st > 0)
            frac = float(good.mean())
            if frac < WINDOW_CLEAR_MIN:
                rejected.append({"id": it.id, "date": date, "reason": f"window clear fraction {frac:.2f}"})
                print(f"  reject {it.id} clear={frac:.2f}")
                continue
            lst_c = st.astype("float64") * ST_SCALE + ST_OFFSET - 273.15
            lst_c[~good] = np.nan
            if np.nanmedian(lst_c) < MIN_WINDOW_MEDIAN_C:
                # Implausibly cold for a clear summer morning: undetected cloud or haze.
                rejected.append({"id": it.id, "date": date,
                                 "reason": f"window median {np.nanmedian(lst_c):.1f} C below {MIN_WINDOW_MEDIAN_C} C"})
                print(f"  reject {it.id} cold median")
                continue
            stack.append(lst_c)
            seen_dates.add(date)
            used.append({"id": it.id, "date": date, "platform": it.properties.get("platform"),
                         "scene_cloud_cover_pct": it.properties.get("eo:cloud_cover"),
                         "window_clear_fraction": round(frac, 3),
                         "window_median_lst_c": round(float(np.nanmedian(lst_c)), 2),
                         "acquired_utc": it.datetime.isoformat()})
            print(f"  use {it.id} clear={frac:.2f} median={np.nanmedian(lst_c):.1f}C")

    if len(stack) < 3:
        raise RuntimeError(f"Only {len(stack)} usable summer scenes; need at least 3")
    arr = np.stack(stack)
    med = np.nanmedian(arr, axis=0).astype("float32")
    count = np.sum(~np.isnan(arr), axis=0).astype("uint8")
    profile = dict(driver="GTiff", dtype="float32", count=2, width=width, height=height, crs=CRS_PROJ,
                   transform=transform, nodata=np.nan, compress="deflate")
    with rasterio.open(out_tif, "w", **profile) as dst:
        dst.write(med, 1)
        dst.write(count.astype("float32"), 2)
        dst.set_band_description(1, "median summer LST (deg C)")
        dst.set_band_description(2, "number of clear scenes")
    meta = {"scenes_used": used, "scenes_rejected": rejected, "grid_crs": CRS_PROJ, "res_m": RES,
            "summers": SUMMERS, "window_clear_min": WINDOW_CLEAR_MIN}
    out_json.write_text(json.dumps(meta, indent=1))
    return out_tif, meta


if __name__ == "__main__":
    import sys
    bb = [float(x) for x in sys.argv[1:5]]
    print(build_lst(bb)[1]["scenes_used"])
