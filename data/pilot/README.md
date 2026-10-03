# Meterwise pilot dataset: Penrith and Kingswood (Western Sydney)

358 real apartment buildings in the suburbs of Penrith and Kingswood (Penrith City Council, NSW), each with a
satellite-derived summer heat value, the share of renting households around it (2021 Census, SA1), an estimated
number of flats, and a screening score. Built on 3 October 2026 by `data/pipeline/build_pilot.py`.

| File | What it is |
|---|---|
| `buildings.geojson` | One feature per building, WGS84 footprint polygons, fixed property schema (see `docs/api-contract.md`). 242 KB. |
| `meta.json` | Pilot name, centre, bbox, building count, plain-language `data_notes`, `sources`, `method`, Landsat scene list, `heat_overlay`. |
| `heat.png` + `meta.heat_overlay` | Colour-mapped median summer land surface temperature for the pilot bbox (Web Mercator grid, 25 m pixels, `RdYlBu_r`, 31-45 °C, transparent where no data). Place it with `bounds` [west, south, east, north]. |
| `preview.png` | Visual check: footprints coloured by heat band over the temperature raster. |
| `buildings_detail.csv` | Provenance per building: OSM id and tags, where the label and the flat count came from, raw LST, NSW comparison LST, SA1 code, renter share of flats only. Not loaded by the API. |
| `checks.json` | Machine-readable results of every check below (the numbers in this README come from it). |

## Why Penrith and Kingswood

Overpass counts of `building=apartments` ways in a small box around each candidate (3 Oct 2026):
Penrith-Kingswood 603, Westmead 242, Wentworthville 66, Cabramatta 64, Lakemba-Wiley Park-Punchbowl 45,
Granville-Merrylands 20, Liverpool-Warwick Farm 15, Fairfield 1. Harris Park/Parramatta and Auburn/Lidcombe could
not be counted because the public Overpass servers timed out. Penrith-Kingswood had by far the best footprint
coverage. It also has many older two- and three-storey walk-up blocks (for example along Derby, Stafford and Lethbridge
streets and Bringelly Road; build dates are not in the data), a high share of renters (65% of homes and 72% of flats in the Census areas
that contain pilot buildings), and it sits inland in the far west of the Sydney basin, where summer heat matters
most. Its weakness was that OSM has few addresses and storeys here; NSW address points filled the address gap.

## Method

1. **Pilot boundary.** ABS ASGS 2021 Suburbs and Localities (SAL) polygons for Penrith (13195) and Kingswood
   (12171). The download bbox is their union rounded outward: [150.660, -33.778, 150.746, -33.726].
2. **Buildings (OpenStreetMap, Overpass API, snapshot 2026-10-03 08:21 UTC).** Ways and multipolygon relations
   tagged `building=apartments`, or `building=residential` with `building:levels` >= 2, or `building=yes/residential`
   with `addr:flats`/`building:flats`. 628 candidates; removed: 40 outside the two suburbs, 8 tag combinations that
   did not qualify, 14 mapped as single storey, 61 footprints under 150 m², 2 unusable geometries, and
   **145 likely villas or townhouses**: buildings whose NSW unit addresses give 80 m² or more of footprint per
   dwelling (and OSM does not map 3+ storeys). Even at 2 storeys that is 160 m² or more per dwelling, which means
   dwellings side by side, not stacked flats. 358 remain (Penrith 262, Kingswood 96).
   Areas are computed in GDA2020 / MGA zone 56 (EPSG:7856). `roof_m2` = `footprint_m2`.
3. **Storeys.** `building:levels` where mapped (13% of buildings), otherwise 3 and `storeys_source = "assumed"`.
4. **Labels.** OSM `addr:housenumber` + `addr:street` (21 buildings); else the NSW Geocoded Addressing Theme address
   point(s) within 10 m of the footprint, preferring points inside it (301); else
   `"Block near <nearest OSM named street>"` (36). 90% of buildings have a street address. Blocks sharing one
   address are suffixed `(block k of n)`, numbered north to south, so every label is unique.
5. **Flats (`flats_est`).**
   - 264 buildings: the number of distinct unit addresses (`1/32`, `2/32`, ...) at the building's base street
     address in the NSW address points, split between blocks that share the address in proportion to floor area
     (footprint x storeys); used only if it implies 35-250 m² gross floor area per flat.
   - 1 building: OSM `building:flats`.
   - 93 buildings: area rule `max(2, round(footprint_m2 x storeys / 130))`. The 130 m² gross per flat is
     **calibrated**: it is the median floor area per unit address over the 152 buildings that have a street address
     to themselves (interquartile range 103-164 m²; 127 m² for the 20 of them with mapped storeys). It is larger
     than a flat's internal area because it includes walls, stairs and landings, and because storeys are often
     assumed as 3 where a block may have 2. The 85 m² starting value in the brief would have overestimated flats
     by about 52% (median ratio 1.52).
6. **Heat.** Landsat 8/9 Collection 2 Level-2 surface temperature (`lwir11`, K = DN x 0.00341802 + 149.0) from the
   Microsoft Planetary Computer STAC API. Only the pilot window is read from each cloud-optimised GeoTIFF and warped
   to a common 30 m EPSG:7856 grid. Search: December-February of 2023-24, 2024-25 and 2025-26, Landsat 8/9, scene
   cloud < 40%. Per scene, QA_PIXEL fill, dilated cloud, cirrus, cloud and cloud shadow are masked; Tier 2 scenes are
   dropped; a scene is kept only if at least 90% of the window is clear and the window median is above 20 °C; one
   scene per date. **21 scenes kept**, 15 rejected (see `checks.json`). The per-pixel median across scenes is the
   summer LST (each pixel has at least 10 clear scenes). A building's value is the mean over its footprint buffered
   by 30 m; `heat_anomaly_c` = that value minus the median of all pixels inside the two suburbs (41.0 °C).
   `heat_band` = quintiles of `heat_anomaly_c` across the 358 buildings (breaks -0.33, +0.16, +0.47, +0.98 °C).
7. **Renters.** ABS 2021 Census G37 (tenure and landlord type by dwelling structure) at SA1, with geometry, from the
   ABS ArcGIS service `Hosted/ABS_2021_Census_G37_SA1`. `renter_share` = rented total / all occupied private
   dwellings (denominator includes "tenure not stated", as in ABS QuickStats) for the SA1 containing the
   building's representative point. All 358 buildings have a value (34 SA1s). The flats-only share is in the CSV.
8. **`quick_score`** = `round(100 x (0.6 x heat percentile + 0.4 x renter-share percentile))`, percentiles (average
   rank for ties, 0-1) taken across the 358 buildings; heat percentile alone if renter share were missing.
   Range 6-87, median 55.

## Landsat scenes used (21)

2023-24: LC09_L2SP_090083_20231202, LC08_L2SP_090083_20231210, LC09_L2SP_089083_20231227, LC09_L2SP_089083_20240112,
LC08_L2SP_089083_20240120, LC09_L2SP_089083_20240128, LC08_L2SP_090083_20240212, LC08_L2SP_090083_20240228.
2024-25: LC08_L2SP_089083_20241205, LC08_L2SP_090083_20241212, LC09_L2SP_089084_20241213, LC09_L2SP_090083_20250105,
LC09_L2SP_090083_20250206, LC08_L2SP_090083_20250214, LC09_L2SP_090083_20250222.
2025-26: LC08_L2SP_089083_20251208, LC09_L2SP_090083_20251223, LC09_L2SP_090083_20260108, LC08_L2SP_089083_20260109,
LC09_L2SP_090083_20260124, LC08_L2SP_089083_20260210.
(All `_02_T1` products; overpass about 23:44-23:50 UTC, i.e. about 10:45 am AEDT.)

## Checks and results

**Counts.** 358 buildings; 13% with mapped storeys; 90% with a street address (84% NSW address points, 6% OSM);
4,459 flats estimated in total (median 8 per building, range 2-194).

**Heat distribution.** `heat_anomaly_c` min -1.42, median +0.34, max +3.24 °C (10th-90th percentile -0.81 to +1.35).
The range is narrow because thermal pixels are 100 m and we average over a 30 m buffer.

**Physical plausibility** (median LST of pixels inside OSM land-cover areas, edges trimmed by 30 m, minus the
pilot median of 41.0 °C):

| Land cover | Pixels | Anomaly °C |
|---|---|---|
| Water (Nepean River, lakes, ponds) | 715 | -9.7 |
| Woodland and bushland | 2,748 | -6.6 |
| Parks, sports grounds, golf | 2,522 | -1.2 |
| Industrial land | 2,427 | +0.4 |
| Residential land | 17,611 | +0.6 |
| Open-air car parks | 10 | +0.7 |
| Shopping centres and commercial | 559 | +1.5 |
| Railway land | 28 | +1.9 |

Named places (mean over the feature, edges trimmed): Ngurra Lake 29.6 °C (-11.4); Huntington Reserve bushland
35.6 °C (-5.5); Penrith Water Recycling Plant (ponds) 37.7 °C (-3.4); Westwood Estate residential 41.4 °C (+0.4);
largest mapped railway area (-33.758, 150.738) 41.8 °C (+0.8); Penrith Homemaker Centre 42.3 °C (+1.2);
Jamison Park 42.7 °C (+1.7); largest mapped open-air car park, next to the Homemaker Centre, 43.0 °C (+2.0).
Water and bush are much cooler, roofs and car parks warmer, as expected. Jamison Park being warm is plausible
for sports fields with dry summer grass, but shows that "park" does not always mean "cool".
The car-park and railway classes have few pixels because most are narrower than the trimmed 100 m thermal footprint.

**Comparison with an independent product.** NSW DCCEEW "Land Surface Temperature for Greater Sydney, Summer
2022-2023" (SEED; only the pilot window was read). A different summer and a different producer, but also Landsat-based,
so it checks our processing and the stability of the pattern rather than being an independent sensor.

| Measure | Value |
|---|---|
| Spearman rank correlation, all 30 m pixels in the two suburbs (19,802) | 0.82 |
| Spearman, building heat values (358) | 0.68 (Pearson 0.65) |
| Same heat quintile / same or adjacent quintile | 40% / 83% |
| Pilot median LST, ours vs NSW 2022-23 | 41.0 °C vs 38.1 °C |

**Flats.** Calibrated area rule vs unit-address counts (152 buildings, in-sample): median absolute error 25%,
Spearman 0.83. Estimated flats per SA1 vs 2021 Census occupied flats in the same 34 SA1s: total 4,459 vs 3,656
(ratio 1.22), Spearman 0.71. The Census figure excludes empty flats and blocks finished after August 2021 (some of the
taller blocks, mapped at 5-9 storeys, may post-date the Census; we have not checked build dates) and includes flats in blocks
missing from OSM.

**GeoJSON validation** (`validate_pilot.validate_geojson`): parses; 358 features; ids unique; every feature has
exactly the 12 properties with correct types; `heat_band` and `storeys_source` values valid; `renter_share` within
0-1; `quick_score` 0-100; all geometries valid Polygon/MultiPolygon with counter-clockwise outer rings;
coordinates at 6 decimal places; 242 KB. Passed.

**Visual check.** `preview.png`: buildings cluster in a few walk-up precincts in Penrith and around Bringelly Road
in Kingswood, and neighbouring blocks get similar bands; the Nepean River shows as a cool band in the raster.

## Limits (read before using the numbers)

- Not every apartment block is in OSM, and the villa/townhouse filter is a rule based on address counts that was
  not checked against aerial imagery; it may drop a few real walk-ups or keep some townhouses.
- Storeys are assumed (3) for 87% of buildings.
- Flat counts are estimates. Unit addresses can be missing, or shared by several blocks on one lot.
- Heat is land **surface** temperature at about 10:45 am on clear days, not air or indoor temperature, and is a
  neighbourhood value (100 m thermal pixels), not a roof measurement. Bands are relative to this pilot only.
- The heat layer is checked against another Landsat-based product, not against ground measurements.
- Renter share is for the surrounding SA1 in August 2021, not the building, and ABS perturbs small counts.
- `quick_score` is a relative screening rank within this pilot, not an assessment.
- `id`s are stable for this cached OSM snapshot; a `--refresh` run may renumber them (the CSV maps `id` to OSM id).
- The NSW address service's Data.NSW listing says "Licence not specified"; we use it for labels and unit counts with
  attribution to NSW Spatial Services. Check its terms before redistributing the labels.

## Sources

| Source | Licence | Used for |
|---|---|---|
| OpenStreetMap contributors, via Overpass API (overpass-api.de) | ODbL 1.0, © OpenStreetMap contributors | Footprints, storeys, some addresses, street names, land-cover check |
| USGS Landsat 8/9 Collection 2 Level-2 Surface Temperature, via Microsoft Planetary Computer STAC | Public domain (USGS) | Summer LST |
| ABS 2021 Census G37, SA1, ABS ArcGIS REST (`Hosted/ABS_2021_Census_G37_SA1`) | CC BY 4.0, © Commonwealth of Australia (ABS) | Renter share |
| ABS ASGS 2021 SAL boundaries (`ASGS2021/SAL`) | CC BY 4.0, © Commonwealth of Australia (ABS) | Pilot boundary, suburb |
| NSW Geocoded Addressing Theme, AddressPoint layer (NSW Spatial Services) | Not specified on Data.NSW; attribution © Spatial Services NSW | Labels, unit-address flat counts |
| NSW DCCEEW Land Surface Temperature for Greater Sydney, Summer 2022-2023 (SEED) | CC BY 4.0, © State of NSW (DCCEEW) | Comparison only |
| Python: numpy, requests, shapely, pyproj, rasterio/GDAL, pystac-client, planetary-computer, matplotlib | BSD / MIT / Apache-2.0 | Processing and images |

## How to re-run

From the `meterwise` folder (Git Bash on Windows):

```bash
.venv/Scripts/python -m pip install -r data/pipeline/requirements.txt
.venv/Scripts/python data/pipeline/build_pilot.py            # uses cached downloads in data/raw/ (a few seconds)
.venv/Scripts/python data/pipeline/build_pilot.py --refresh  # deletes data/raw/* and downloads everything again
```

A fresh download takes 5-20 minutes, mostly waiting on the public Overpass servers (the script retries three
endpoints and treats Overpass timeouts as failures, not partial data). Downloads are cached in `data/raw/`
(about 12 MB, git-ignored). Pipeline modules: `common.py` (pilot definition, paths, polite HTTP with User-Agent),
`fetch_sources.py` (OSM, ABS, NSW downloads), `fetch_landsat.py` (LST median), `build_pilot.py` (joins and outputs),
`validate_pilot.py` (checks, comparison, heat.png, preview.png), `geo_utils.py`, `meta_text.py` (user-facing notes
and sources). To change the pilot, edit `PILOT["suburbs"]` (ABS SAL codes) in `common.py`.
