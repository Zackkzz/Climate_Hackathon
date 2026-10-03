"""Plain-language text for meta.json (shown to users) and the source list for the disclosure."""
from __future__ import annotations

from build_pilot import (ASSUMED_STOREYS, HEAT_BUFFER_M, MIN_FOOTPRINT_M2, PLAUSIBLE_M2_PER_FLAT,
                         VILLA_FOOTPRINT_PER_UNIT, W_HEAT, W_RENT)

SOURCES = [
    {"name": "OpenStreetMap (via the Overpass API)", "url": "https://www.openstreetmap.org/copyright",
     "licence": "ODbL 1.0 - © OpenStreetMap contributors",
     "used_for": "Apartment building footprints, mapped storeys, some street addresses, street names for "
                 "unaddressed blocks, and land-cover areas (parks, water, car parks, industrial land) for the "
                 "heat sanity check"},
    {"name": "Landsat 8 and Landsat 9 Collection 2 Level-2 Surface Temperature (USGS), via Microsoft Planetary "
             "Computer STAC API", "url": "https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2",
     "licence": "Public domain (USGS Landsat data policy); no copyright restrictions",
     "used_for": "Summer daytime land surface temperature (median of clear summer scenes, 2023-24 to 2025-26)"},
    {"name": "ABS Census of Population and Housing 2021, General Community Profile table G37 (tenure and landlord "
             "type by dwelling structure), Statistical Area Level 1, via ABS ArcGIS REST service "
             "Hosted/ABS_2021_Census_G37_SA1",
     "url": "https://geo.abs.gov.au/arcgis/rest/services/Hosted/ABS_2021_Census_G37_SA1/FeatureServer",
     "licence": "CC BY 4.0 - © Commonwealth of Australia (Australian Bureau of Statistics)",
     "used_for": "Share of occupied private dwellings that are rented, per SA1"},
    {"name": "ABS Australian Statistical Geography Standard (ASGS) Edition 3, 2021 Suburbs and Localities (SAL)",
     "url": "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SAL/FeatureServer",
     "licence": "CC BY 4.0 - © Commonwealth of Australia (Australian Bureau of Statistics)",
     "used_for": "Pilot-area boundary (Penrith and Kingswood) and suburb of each building"},
    {"name": "NSW Geocoded Addressing Theme - AddressPoint layer (NSW Spatial Services)",
     "url": "https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Geocoded_Addressing_Theme/FeatureServer/1",
     "licence": "Public web service; the Data.NSW listing says 'Licence not specified'. Attribution: © Spatial "
                "Services, NSW Department of Customer Service. Check terms before redistributing.",
     "used_for": "Street address labels where OpenStreetMap has none, and counts of unit addresses (for example "
                 "1/32, 2/32 ...) used to estimate the number of flats"},
    {"name": "NSW DCCEEW Land Surface Temperature for Greater Sydney, Summer 2022-2023 (part of the 2022 Heat "
             "Vulnerability Index dataset, SEED portal)",
     "url": "https://datasets.seed.nsw.gov.au/dataset/2022-heat-vulnerability-index-for-the-greater-sydney-region",
     "licence": "CC BY 4.0 - © State of New South Wales (Department of Climate Change, Energy, the Environment and "
                "Water)",
     "used_for": "Independent comparison only (not used in any building value)"},
    {"name": "Python libraries: numpy, pandas, requests, shapely, pyproj, rasterio (GDAL), pystac-client, "
             "planetary-computer, matplotlib",
     "url": "https://pypi.org/",
     "licence": "BSD-3-Clause / MIT / Apache-2.0 (each library's own licence); GDAL is MIT",
     "used_for": "Data download, geometry, raster processing and charts"},
]


def description(c):
    return (f"{c['building_count']} apartment buildings in Penrith and Kingswood (Western Sydney), mapped in "
            "OpenStreetMap, each with a satellite-derived summer heat value and the share of renting households "
            "in its 2021 Census neighbourhood (SA1).")


def method(c):
    return {
        "buildings": ("OpenStreetMap ways/relations tagged building=apartments, or building=residential with "
                      "building:levels >= 2, or building=yes/residential with a flats count; kept if the "
                      f"footprint is at least {MIN_FOOTPRINT_M2:.0f} m2, not mapped as single storey, and inside "
                      "the Penrith or Kingswood 2021 SAL boundary. Buildings whose NSW unit addresses show "
                      f"{VILLA_FOOTPRINT_PER_UNIT:.0f} m2 or more of footprint per dwelling (side-by-side villas "
                      "or townhouses), without 3+ storeys mapped, are dropped."),
        "storeys": f"building:levels where mapped, otherwise {ASSUMED_STOREYS} (assumed typical walk-up).",
        "flats_est": ("Count of distinct unit addresses (e.g. 1/32 ... 12/32) in the NSW address point data at the "
                      "building's street address, split between buildings sharing that address by floor area; "
                      f"used only if it implies {PLAUSIBLE_M2_PER_FLAT[0]:.0f}-{PLAUSIBLE_M2_PER_FLAT[1]:.0f} m2 "
                      "gross floor area per flat. Otherwise footprint x storeys / "
                      f"{c['m2_per_flat_used']:.0f} m2 gross per flat (minimum 2), where {c['m2_per_flat_used']:.0f} "
                      "is the median gross floor area per unit address across buildings that have their own "
                      "street address in this area."),
        "heat_anomaly_c": (f"Mean of the per-pixel median Landsat summer land surface temperature over the footprint "
                           f"buffered by {HEAT_BUFFER_M:.0f} m, minus the median over all land in the two suburbs."),
        "heat_band": "Quintiles of heat_anomaly_c across the pilot buildings.",
        "renter_share": ("ABS 2021 Census G37: rented dwellings / all occupied private dwellings (including "
                         "tenure not stated) in the SA1 containing the building."),
        "quick_score": (f"round(100 x ({W_HEAT} x heat percentile + {W_RENT} x renter-share percentile)), "
                        "percentiles taken across the pilot buildings; heat percentile only if renter share is "
                        "missing."),
    }


def _pct(x):
    return f"{round(100 * x)}%"


def data_notes(c):
    """Plain Australian English notes shown to users. Every number comes from checks.json."""
    ic = c.get("independent_comparison", {})
    fl = c.get("flats_rule_vs_unit_addresses", {})
    fc = c.get("flats_est_vs_census_flats", {})
    ha = c["heat_anomaly_c"]
    cen = c["census"]
    villas = sum(v for k, v in c["excluded"].items() if k.startswith("likely villas"))
    lc = {x["class"]: x["anomaly_vs_pilot_median_c"] for x in c.get("landcover_check", {}).get("classes", [])}
    notes = [
        f"The {c['building_count']} buildings are blocks tagged as apartments in OpenStreetMap (snapshot "
        f"{(c.get('osm_snapshot') or '')[:10]}) inside the suburbs of Penrith and Kingswood. Some blocks are not "
        "mapped or are tagged differently, so this is not a complete list.",
        f"We left out {villas} OpenStreetMap 'apartment' buildings where the NSW address records show side-by-side "
        "villas or townhouses rather than flats stacked on top of each other, plus very small or single-storey "
        "buildings.",
        f"Storeys come from OpenStreetMap for {_pct(c['share_storeys_mapped'])} of buildings. For the rest we "
        f"assumed {ASSUMED_STOREYS} storeys, the usual walk-up. Some of those will really be 2 storeys.",
        f"Flat numbers are estimates. For {c['flats_sources'].get('nsw_unit_addresses', 0)} buildings they come "
        "from the number of unit addresses (like 1/32, 2/32) that NSW Spatial Services records at the building's "
        "street address, shared between blocks on the same lot by floor area. For the rest we divided floor area "
        f"by {c['m2_per_flat_used']:.0f} m² per flat, the typical figure for buildings where the unit count is "
        "known.",
        "Street addresses come from NSW address points or OpenStreetMap "
        f"({_pct(c['share_with_street_address'])} of buildings). Where several blocks share one address they are "
        "numbered north to south. Blocks with no address are named after the nearest street.",
        "Heat values come from Landsat 8 and 9 satellite thermal images taken at about 10:45 am on "
        f"{c['lst_scene_count']} clear summer days between December 2023 and February 2026 (we use the middle "
        "value for each spot). They measure how hot the ground and roofs get, not air temperature and not "
        "temperature inside flats. Afternoon surfaces are usually hotter still.",
        "The satellite's heat sensor sees spots about 100 m across, so a building's heat value describes its "
        "surroundings (roofs, roads, car parks and trees nearby), not the roof alone. Neighbouring blocks often "
        "get similar values.",
        f"heat_anomaly_c is how much hotter (or cooler) the building's surroundings are than the middle surface "
        f"temperature of all land in Penrith and Kingswood ({c['lst_area_median_c']:.1f} °C). Across the "
        f"buildings it ranges from {ha['min']:+.1f} to {ha['max']:+.1f} °C. The heat bands split the buildings "
        "into five equal-sized groups, so 'hottest' means hottest fifth within this area.",
    ]
    if lc:
        notes.append(
            "Sanity check: the heat layer behaves as expected. Compared with the area's middle value, the "
            f"Nepean River and lakes are about {abs(lc.get('Water (river, lakes, ponds)', 0)):.0f} °C cooler, "
            f"bushland about {abs(lc.get('Woodland and bushland', 0)):.0f} °C cooler, while shopping centres "
            f"are about {lc.get('Shopping centres and commercial', 0):.1f} °C warmer. Dry sports fields in summer "
            "can be as hot as streets.")
    if ic.get("available"):
        notes.append(
            "We compared our heat layer with the NSW Government's Greater Sydney surface temperature map for "
            f"summer 2022-23 (a different summer). Across all land in the two suburbs the "
            f"rank correlation is {ic['spearman_pixels_in_pilot_suburbs']:.2f}; for the buildings it is "
            f"{ic['spearman_building_lst']:.2f}, and {_pct(ic['within_one_quintile_share'])} of buildings fall in "
            "the same or a neighbouring heat band. Both maps come from Landsat, so this checks our processing "
            "rather than being a fully independent measurement.")
    else:
        notes.append("The heat layer has not been independently validated.")
    notes += [
        "Renter share is the share of occupied homes that were rented at the 2021 Census in the small Census "
        "area (SA1, usually 200-800 people) around the building. It is not the figure for that building. In the "
        f"{cen['sa1_count_with_buildings']} areas with pilot buildings, {_pct(cen['renter_share_all_dwellings'])} "
        f"of all homes and {_pct(cen['renter_share_flats'])} of flats were rented. The ABS slightly adjusts small "
        "counts to protect privacy.",
        f"The quick score ranks buildings for a first look: {round(W_HEAT * 100)}% weight on being hotter than "
        f"other blocks here and {round(W_RENT * 100)}% on having more renters around it. It is a screening aid, "
        "not an assessment of any building.",
    ]
    if fl and fc:
        notes.append(
            f"Checks on flat numbers: where the unit count is known ({fl['n_buildings']} buildings with their own "
            f"address), the floor-area rule is typically {fl['calibrated_rule_median_abs_pct_error']:.0f}% out. "
            f"Our total of {fc['flats_est_total']:,} flats compares with {fc['census_2021_occupied_flats']:,} "
            "occupied flats counted in the same Census areas in 2021; ours is higher partly because some blocks "
            "were finished after 2021 and the Census leaves out empty flats.")
    return notes
