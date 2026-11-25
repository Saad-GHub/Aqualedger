"""Join Mouza Census 2020 water indicators onto geoBoundaries PAK ADM2 district shapes.

Usage: python build_census_geojson.py "Mouza Census-2020.xlsx" geoBoundaries-PAK-ADM2_simplified.geojson ../../public/data/pakistan-groundwater-census-2020.geojson
"""
import os, sys, json, re, statistics, zipfile
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx_peek import shared_strings, sheets, rows

PRV, DIST, DEPTH, TASTE = 1, 5, 36, 41
xlsx, boundaries, out = sys.argv[1], sys.argv[2], sys.argv[3]

# Census district -> boundary shapeName where names differ, or where a district created after 2019
# has no shape of its own and is merged into the district it was carved from.
ALIASES = {
    "baltistan": "Skardu", "diamir": "Diamer", "chiniot": "Jhang", "cholistan": "Bahawalpur",
    "nankana sahib": "Sheikhpura", "sheikhupura": "Sheikhpura", "vehari": "Vihari",
    "chitral lower": "Chitral", "chitral upper": "Chitral", "kolai palas kohistan": "Kohistan",
    "lower kohistan": "Kohistan", "torghar": "Mansehra", "malakand protected area": "Malakand",
    "batagram": "Battagram", "islamabad": "Islamabad Capital Territory",
    "duki": "Loralai", "jaffarabad": "Jafarabad", "killa abdullah": "Qilla Abdullah",
    "killa saifullah": "Qilla Saifullah", "shaheed sikandar abad": "Kalat", "sherani": "Zhob",
    "sohbatpur": "Jafarabad", "washuk": "Kharan", "harnai": "Sibi",
    "karachi west": "Karachi", "malir": "Karachi", "mirpur khas": "Mirpurkhas",
    "kambar shahdad kot": "Qambar Shahdadkot", "shaheed benazirabad": "Nawabshah",
    "sujawal": "Thatta", "larkana": "Qambar Shahdadkot", "umer kot": "Umerkot", "naushahro feroze": "Naushehro Feroze",
}


def norm(name):
    return re.sub(r"\s+", " ", re.sub(r"\bdistrict\b", "", name.lower())).strip()


geo = json.load(open(boundaries, encoding="utf-8"))
shapes = {norm(f["properties"]["shapeName"]): f["properties"]["shapeName"] for f in geo["features"]}

groups = defaultdict(lambda: {"depths": [], "mouzas": 0, "sweet": 0, "brackish": 0, "districts": set(), "province": ""})
unmatched = set()
with zipfile.ZipFile(xlsx) as z:
    strings = shared_strings(z)
    _, target = sheets(z)[0]
    for i, row in enumerate(rows(z, target, strings)):
        if i < 3 or len(row) <= TASTE or not row[DIST]:
            continue
        key = norm(row[DIST])
        if row[PRV].upper().startswith("AZAD"):
            shape = "Azad Kashmir"
        else:
            shape = ALIASES.get(key) or shapes.get(key)
        if not shape:
            unmatched.add(row[DIST])
            continue
        g = groups[shape]
        g["mouzas"] += 1
        g["province"] = row[PRV].title()
        g["districts"].add(row[DIST].title().replace(" District", ""))
        try:
            depth = float(row[DEPTH])
        except (TypeError, ValueError):
            depth = None
        # 9999 and 0 are missing-value codes in the census; anything over 3,000 ft is a typo.
        if depth is not None and 0 < depth <= 3000 and depth not in (999, 9999):
            g["depths"].append(depth)
        if row[TASTE] == "1":
            g["sweet"] += 1
        elif row[TASTE] == "2":
            g["brackish"] += 1

print("unmatched census districts:", sorted(unmatched))
missing = [name for name in shapes.values() if name not in groups]
print("shapes without census data:", missing)


def round_coords(value):
    return [round_coords(v) for v in value] if isinstance(value[0], list) else [round(value[0], 4), round(value[1], 4)]


features = []
for f in geo["features"]:
    name = f["properties"]["shapeName"]
    g = groups.get(name)
    props = {"name": name}
    if g:
        tasted = g["sweet"] + g["brackish"]
        depths = sorted(g["depths"])
        props.update({
            "province": g["province"],
            "censusDistricts": ", ".join(sorted(g["districts"])),
            "mouzas": g["mouzas"],
            "medianDepthFt": round(statistics.median(depths)) if depths else None,
            "p75DepthFt": round(statistics.quantiles(depths, n=4)[2]) if len(depths) > 3 else None,
            "brackishPct": round(100 * g["brackish"] / tasted, 1) if tasted else None,
        })
    props = {k: v for k, v in props.items() if v is not None}
    features.append({"type": "Feature", "properties": props, "geometry": {"type": f["geometry"]["type"], "coordinates": round_coords(f["geometry"]["coordinates"])}})

json.dump({"type": "FeatureCollection", "metadata": {
    "source": "Pakistan Bureau of Statistics, Mouza Census 2020 (selected indicators); district boundaries from geoBoundaries PAK ADM2 (2019, public domain)",
    "note": "Districts created after 2019 are merged into the district they were carved from. Depth is the reported depth of the water table in feet; brackish share is the percentage of mouzas reporting brackish underground water."},
    "features": features}, open(out, "w", encoding="utf-8"), separators=(",", ":"))
with_data = [f["properties"] for f in features if "mouzas" in f["properties"]]
print("features:", len(features), "with data:", len(with_data))
print("depth range:", min(p["medianDepthFt"] for p in with_data), max(p["medianDepthFt"] for p in with_data))
print("brackish range:", min(p["brackishPct"] for p in with_data), max(p["brackishPct"] for p in with_data))
for p in sorted(with_data, key=lambda p: -p["medianDepthFt"])[:8]:
    print(" deep:", p["name"], p["medianDepthFt"], p["mouzas"], p["censusDistricts"])
for p in sorted(with_data, key=lambda p: -p["brackishPct"])[:5]:
    print(" brackish:", p["name"], p["brackishPct"], p["mouzas"])

