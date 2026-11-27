"""
Build compact frontend data files from data/refined/ (no solar fields):
1. Enriches frontend/public/data/pakistan-groundwater-census-2020.geojson properties
   so MapLibre can shade Water Stress, GRACE Satellite Loss, and Arsenic Risk.
2. Writes frontend/src/data/district-intelligence.json for Overview, Sources,
   Forecast, and My Sources lookups.
3. Writes frontend/src/data/grace-tws-by-province.json for the 2002-2026
   satellite water storage trend chart on the Overview page.
"""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REFINED_DIR = ROOT / "data" / "refined"
GEOJSON_PATH = ROOT / "frontend" / "public" / "data" / "pakistan-groundwater-census-2020.geojson"
DISTRICT_JSON_PATH = ROOT / "frontend" / "src" / "data" / "district-intelligence.json"
GRACE_PROVINCE_JSON_PATH = ROOT / "frontend" / "src" / "data" / "grace-tws-by-province.json"


def num(v: str | None) -> float | None:
    if v is None:
        return None
    s = v.strip()
    if not s:
        return None
    try:
        val = float(s)
        return val if math.isfinite(val) else None
    except ValueError:
        return None


def integer(v: str | None) -> int | None:
    n = num(v)
    return int(round(n)) if n is not None else None


def read_rows(name: str) -> list[dict[str, str]]:
    with (REFINED_DIR / name).open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def main() -> None:
    master_rows = read_rows("district_master_2026_refined.csv")
    tubewell_rows = {r["district"]: r for r in read_rows("pbs_tubewells_district_2024_refined.csv")}
    city_rows = read_rows("pcrwr_city_drinking_water_refined.csv")
    grace_prov_rows = read_rows("grace_tws_province_monthly_refined.csv")

    cities_by_district: dict[str, list[dict[str, object]]] = defaultdict(list)
    for c in city_rows:
        cities_by_district[c["district"]].append(
            {
                "city": c["city"],
                "samples": integer(c["samples"]),
                "pctSafe": num(c["pct_safe"]),
                "pctUnsafe": num(c["pct_unsafe"]),
                "contaminants": c["contaminants_found"] or None,
            }
        )

    districts_out: dict[str, dict[str, object]] = {}
    for r in master_rows:
        d = r["district"]
        tw = tubewell_rows.get(d, {})
        districts_out[d] = {
            "district": d,
            "province": r["province"],
            "population2025": integer(r["population_2025"]),
            "medianDepthFt": num(r["medianDepthFt"]),
            "brackishPct": num(r["brackishPct"]),
            "stressScore": num(r["stress_score_0_100"]),
            "stressComponents": integer(r["stress_components_used"]),
            "graceTrendCmYr": num(r["grace_trend_cm_per_yr_2002_2026"]),
            "graceChangeCm": num(r["grace_change_2003_05_to_2023_25_cm"]),
            "graceLatestCm": num(r["grace_latest_anomaly_cm"]),
            "graceStatus": r["grace_status"] or None,
            "normalRainMm": integer(r["normal_rain_mm_1991_2020"]),
            "rainVsNormalPct": num(r["recent_vs_normal_pct"]),
            "tubewellsTotal": integer(r["tubewells_total"]),
            "twElectric": integer(r["tw_electric"]),
            "twDiesel": integer(r["tw_diesel"]),
            "electricSharePct": num(tw.get("electric_share_pct")),
            "dieselSharePct": num(tw.get("diesel_share_pct")),
            "peoplePerTubewell": integer(r["people_per_tubewell"]),
            "arsenicSamples": integer(r["arsenic_samples"]),
            "arsenicPctOver10": num(r["arsenic_pct_over_who10"]),
            "arsenicPctOver50": num(r["arsenic_pct_over_pak50"]),
            "ecoliPctHousehold": num(r["mics_pct_ecoli_in_household_water"]),
            "safelyManagedPct": num(r["mics_pct_safely_managed_drinking_water"]),
            "citySafePct": num(r["city_drinking_water_pct_safe_2020"]),
            "censusMotorPumpPct": num(r["census2023_pct_motor_pump"]),
            "censusTapWaterPct": num(r["census2023_pct_tap_water"]),
            "aqueductStressLabel": r["aqueduct_overall_risk"] or None,
            "aqueductStressScore": num(r["aqueduct_overall_risk_0_5"]),
            "aqueductDroughtScore": num(r["aqueduct_drought_risk_0_5"]),
            "pctIrrigatedGroundwater": num(r["pct_irrigated_with_groundwater"]),
            "flood2022Pct": num(r["flood2022_pct_area_flooded"]),
            "insarSubsidenceCmYr": num(r["insar_max_subsidence_cm_per_yr"]),
            "cities": cities_by_district.get(d, []),
        }

    DISTRICT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DISTRICT_JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(districts_out, f, separators=(",", ":"), ensure_ascii=False)

    # Enrich GeoJSON properties for MapLibre shading & hover tooltips
    with GEOJSON_PATH.open("r", encoding="utf-8") as f:
        geo = json.load(f)

    for feat in geo["features"]:
        props = feat["properties"]
        info = districts_out.get(props.get("name", ""))
        if not info:
            continue
        for key, prop_name in [
            ("stressScore", "stressScore"),
            ("graceTrendCmYr", "graceTrend"),
            ("graceChangeCm", "graceChangeCm"),
            ("graceStatus", "graceStatus"),
            ("arsenicPctOver10", "arsenicPct"),
            ("ecoliPctHousehold", "ecoliPct"),
            ("rainVsNormalPct", "rainVsNormalPct"),
            ("tubewellsTotal", "tubewellsTotal"),
            ("censusMotorPumpPct", "motorPumpPct"),
            ("aqueductStressLabel", "aqueductRisk"),
        ]:
            val = info.get(key)
            if val is not None:
                props[prop_name] = val
            else:
                props.pop(prop_name, None)

    with GEOJSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(geo, f, separators=(",", ":"), ensure_ascii=False)

    # Province-level GRACE monthly time series (2002-04 to 2026-08)
    grace_series: dict[str, list[list[object]]] = defaultdict(list)
    for row in grace_prov_rows:
        val = num(row["tws_anomaly_cm"])
        if val is not None:
            grace_series[row["province"]].append([row["month"], round(val, 2)])

    with GRACE_PROVINCE_JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(grace_series, f, separators=(",", ":"), ensure_ascii=False)

    print(
        f"Built {DISTRICT_JSON_PATH.name} ({DISTRICT_JSON_PATH.stat().st_size // 1024} KB), "
        f"{GRACE_PROVINCE_JSON_PATH.name} ({GRACE_PROVINCE_JSON_PATH.stat().st_size // 1024} KB), "
        f"and enriched {GEOJSON_PATH.name} ({GEOJSON_PATH.stat().st_size // 1024} KB)."
    )


if __name__ == "__main__":
    main()
