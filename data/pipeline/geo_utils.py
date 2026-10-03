"""Small numeric/raster helpers shared by build_pilot.py and validate_pilot.py."""
from __future__ import annotations

import math

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from shapely.geometry import mapping


def pct_rank(values):
    """Percentile rank 0..1 (average rank for ties); None stays None."""
    idx = [i for i, v in enumerate(values) if v is not None]
    out = [None] * len(values)
    if len(idx) < 2:
        return out
    vals = np.array([values[i] for i in idx], dtype=float)
    order = vals.argsort(kind="mergesort")
    ranks = np.empty(len(vals))
    ranks[order] = np.arange(len(vals))
    for v in np.unique(vals):  # average ties
        sel = vals == v
        ranks[sel] = ranks[sel].mean()
    ranks /= (len(vals) - 1)
    for k, i in enumerate(idx):
        out[i] = float(ranks[k])
    return out


def spearman(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    ok = ~(np.isnan(a) | np.isnan(b))
    ra = np.array(pct_rank(list(a[ok])))
    rb = np.array(pct_rank(list(b[ok])))
    return float(np.corrcoef(ra, rb)[0, 1]), int(ok.sum())


def mean_in_geom(arr, transform, geom_proj):
    """Mean of raster pixels whose centres fall inside geom (raster on the EPSG:7856 grid)."""
    h, w = arr.shape
    minx, miny, maxx, maxy = geom_proj.bounds
    inv = ~transform
    c0, r0 = inv * (minx, maxy)
    c1, r1 = inv * (maxx, miny)
    c0, r0 = max(int(math.floor(c0)) - 1, 0), max(int(math.floor(r0)) - 1, 0)
    c1, r1 = min(int(math.ceil(c1)) + 1, w), min(int(math.ceil(r1)) + 1, h)
    if c1 <= c0 or r1 <= r0:
        return float("nan"), 0
    sub = arr[r0:r1, c0:c1]
    sub_t = transform * rasterio.Affine.translation(c0, r0)
    m = geometry_mask([mapping(geom_proj)], out_shape=sub.shape, transform=sub_t, invert=True)
    v = sub[m & ~np.isnan(sub)]
    return (float(v.mean()) if v.size else float("nan")), int(v.size)
