"""Turn the observation-well CSVs into the compact files the app loads.

Usage: python build_wells.py pakistan_groundwater_observations.csv site_trends.csv ../../public/data/pakistan-observation-wells.json ../../src/data/punjab-water-level-by-year.json
"""
import csv, json, statistics, sys
from collections import defaultdict

observations_csv, trends_csv, wells_out, yearly_out = sys.argv[1:5]

# Years with fewer wells than this are too thin to summarise province-wide.
MIN_WELLS_PER_YEAR = 200

series = defaultdict(list)
coords = {}
for row in csv.DictReader(open(observations_csv, encoding="utf-8")):
    series[row["site_id"]].append((int(row["date"][:4]), round(float(row["depth_m"]), 2)))
    coords[row["site_id"]] = (round(float(row["longitude"]), 5), round(float(row["latitude"]), 5))

trends = {row["site_id"]: row for row in csv.DictReader(open(trends_csv, encoding="utf-8"))}

sites = []
for site_id, points in sorted(series.items(), key=lambda item: int(item[0][3:])):
    points.sort()
    trend = trends.get(site_id)
    lon, lat = coords[site_id]
    sites.append({
        "id": site_id, "lon": lon, "lat": lat,
        "trend": round(float(trend["linear_trend_m_per_year"]), 3) if trend else None,
        "n": len(points), "firstYear": points[0][0], "lastYear": points[-1][0],
        "firstDepth": points[0][1], "lastDepth": points[-1][1],
        "series": [[year, depth] for year, depth in points],
    })

# Different wells are measured in different years, so a raw yearly median jumps whenever the mix
# changes. Compare each reading with its own well's median instead, then add back the typical depth.
well_medians = {site_id: statistics.median(d for _, d in points) for site_id, points in series.items()}
typical_depth = statistics.median(well_medians.values())
by_year = defaultdict(list)
for site_id, points in series.items():
    for year, depth in points:
        by_year[year].append(depth - well_medians[site_id])
years = [{"year": year, "medianDepthM": round(typical_depth + statistics.median(anomalies), 2), "wells": len(anomalies)}
         for year, anomalies in sorted(by_year.items()) if len(anomalies) >= MIN_WELLS_PER_YEAR]

with_trend = [float(t["linear_trend_m_per_year"]) for t in trends.values()]
summary = {
    "wells": len(sites), "observations": sum(len(p) for p in series.values()),
    "trendWells": len(with_trend),
    "deepening": sum(1 for t in trends.values() if t["trend_interpretation"] == "deeper_water_level"),
    "rising": sum(1 for t in trends.values() if t["trend_interpretation"] == "shallower_water_level"),
    "medianTrendMPerYear": round(statistics.median(with_trend), 3),
    "firstYear": min(by_year), "lastYear": max(by_year),
}

json.dump({"summary": summary, "sites": sites}, open(wells_out, "w", encoding="utf-8"), separators=(",", ":"))
json.dump({"summary": summary, "years": years}, open(yearly_out, "w", encoding="utf-8"), indent=1)
print(summary)
print("years kept:", years[0]["year"], "-", years[-1]["year"], len(years))
