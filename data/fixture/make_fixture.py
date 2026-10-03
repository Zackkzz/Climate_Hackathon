"""Generates the hand-made FIXTURE building set around Lakemba, NSW.

These are NOT real buildings: positions, sizes and heat values are invented (seeded random) so the app works
before the real pilot data exists. Run: .venv/Scripts/python data/fixture/make_fixture.py
"""
import json
import math
import random
from pathlib import Path

random.seed(2035)
HERE = Path(__file__).parent
STREETS = ["Haldon Street", "The Boulevarde", "Railway Parade", "Lakemba Street", "Croydon Street", "Ernest Street",
           "Gillies Street", "Wangee Road", "Shadforth Street", "Quigg Street", "Oneata Street", "Colin Street"]
CENTRE = (-33.9200, 151.0760)
BANDS = ["cooler", "average", "warm", "hot", "hottest"]

feats = []
for i in range(25):
    lat = CENTRE[0] + random.uniform(-0.008, 0.008)
    lon = CENTRE[1] + random.uniform(-0.010, 0.010)
    storeys = random.choice([2, 3, 3, 3, 3, 4])
    w, d = random.uniform(14, 22), random.uniform(16, 30)  # metres
    ang = math.radians(random.uniform(0, 90))
    kx, ky = 111_320 * math.cos(math.radians(lat)), 110_540
    corners = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    ring = []
    for x, y in corners:
        xr, yr = x * math.cos(ang) - y * math.sin(ang), x * math.sin(ang) + y * math.cos(ang)
        ring.append([round(lon + xr / kx, 7), round(lat + yr / ky, 7)])
    ring.append(ring[0])
    fp = round(w * d, 1)
    flats = max(4, round(fp * storeys * 0.8 / 65))
    anomaly = round(random.gauss(0.0, 1.5), 1)  # relative to the area median
    renter = round(random.uniform(0.45, 0.8), 2)
    feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]}, "properties": {
        "id": f"fx_{i + 1:03d}", "label": f"Block near {random.choice(STREETS)} (example)", "suburb": "Lakemba",
        "storeys": storeys, "storeys_source": "assumed", "flats_est": flats, "footprint_m2": fp, "roof_m2": fp,
        "heat_anomaly_c": anomaly, "renter_share": renter}})

an = sorted(f["properties"]["heat_anomaly_c"] for f in feats)
cuts = [an[int(len(an) * q)] for q in (0.2, 0.4, 0.6, 0.8)]
for f in feats:
    p = f["properties"]
    p["heat_band"] = BANDS[sum(p["heat_anomaly_c"] >= c for c in cuts)]
    heat_rank = sum(a <= p["heat_anomaly_c"] for a in an) / len(an)
    p["quick_score"] = int(round(100 * (0.6 * heat_rank + 0.4 * p["renter_share"])))

(HERE / "buildings.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, indent=1))
lons = [c[0] for f in feats for c in f["geometry"]["coordinates"][0]]
lats = [c[1] for f in feats for c in f["geometry"]["coordinates"][0]]
meta = {
    "name": "Lakemba example area (fixture)",
    "description": "Example blocks of flats around Lakemba, NSW, used until the real pilot data is loaded.",
    "centre": {"lat": CENTRE[0], "lon": CENTRE[1]},
    "bbox": [round(min(lons), 5), round(min(lats), 5), round(max(lons), 5), round(max(lats), 5)],
    "building_count": len(feats),
    "data_notes": ["Fixture data, not real buildings: positions, sizes and heat values are invented for testing."],
}
(HERE / "meta.json").write_text(json.dumps(meta, indent=1))
print(len(feats), "fixture buildings written")
