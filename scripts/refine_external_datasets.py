"""
Refine and validate external Tier 1 groundwater datasets for AquaLedger.

Reads raw CSVs from the extracted external datasets folder (or a specified
--input-dir), removes solar-specific fields (tw_solar, solar_share_pct,
mean_solar_kwh_m2_day_2015_25), cleans sentinel/null values, deduplicates
and aggregates sub-districts onto the 126 canonical GeoJSON district polygons
in frontend/public/data/pakistan-groundwater-census-2020.geojson, and writes
clean CSVs into data/refined/.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON_PATH = ROOT / "frontend" / "public" / "data" / "pakistan-groundwater-census-2020.geojson"
DEFAULT_INPUT_DIR = Path(
    r"C:\Users\LENOVO\.gemini\antigravity\brain\93299abb-98c2-4d69-92ba-5dfd83a9612e\scratch\data_sets\data sets"
)
DEFAULT_OUTPUT_DIR = ROOT / "data" / "refined"

SOLAR_COLUMNS = {
    "tw_solar",
    "solar_share_pct",
    "mean_solar_kwh_m2_day_2015_25",
}


def load_geojson_districts() -> set[str]:
    with GEOJSON_PATH.open("r", encoding="utf-8") as f:
        geo = json.load(f)
    return {feat["properties"]["name"] for feat in geo["features"]}


def clean_cell(value: str | None) -> str:
    if value is None:
        return ""
    v = value.strip()
    if not v or v.lower() in {"na", "nan", "null", "none"}:
        return ""
    try:
        num = float(v)
        if not math.isfinite(num) or num <= -9000:
            return ""
    except ValueError:
        pass
    return v


def parse_float(value: str | None) -> float | None:
    v = clean_cell(value)
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def parse_int(value: str | None) -> int | None:
    num = parse_float(value)
    return int(round(num)) if num is not None else None


def fmt_num(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return ""
    rounded = round(value, decimals)
    if decimals == 0 or rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.{decimals}f}".rstrip("0").rstrip(".")


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = list(reader.fieldnames or [])
        rows = [{k: clean_cell(v) for k, v in row.items()} for row in reader]
    return cols, rows


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def weighted_avg(items: list[tuple[float | None, float | None]]) -> float | None:
    total_w = 0.0
    total_vw = 0.0
    for val, weight in items:
        if val is None or weight is None or weight <= 0:
            continue
        total_w += weight
        total_vw += val * weight
    if total_w > 0:
        return total_vw / total_w
    vals = [val for val, _ in items if val is not None]
    return sum(vals) / len(vals) if vals else None


def refine_district_master(input_dir: Path, output_dir: Path, geo_districts: set[str]) -> int:
    cols, rows = read_csv(input_dir / "district_master_2026.csv")
    kept_cols = [c for c in cols if c not in SOLAR_COLUMNS]
    refined = [r for r in rows if r.get("district") in geo_districts]
    refined.sort(key=lambda r: (r.get("province", ""), r.get("district", "")))
    write_csv(output_dir / "district_master_2026_refined.csv", kept_cols, refined)
    return len(refined)


def refine_passthrough_district_table(
    filename: str,
    out_filename: str,
    input_dir: Path,
    output_dir: Path,
    geo_districts: set[str],
    sort_keys: tuple[str, ...],
) -> int:
    cols, rows = read_csv(input_dir / filename)
    kept_cols = [c for c in cols if c not in SOLAR_COLUMNS]
    refined = [
        r for r in rows
        if ("district" not in r or r["district"] in geo_districts)
    ]
    refined.sort(key=lambda r: tuple(r.get(k, "") for k in sort_keys))
    write_csv(output_dir / out_filename, kept_cols, refined)
    return len(refined)


def refine_pcrwr_arsenic(input_dir: Path, output_dir: Path, geo_districts: set[str]) -> int:
    _, rows = read_csv(input_dir / "pcrwr_arsenic_district_1999_2021.csv")
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        d = row.get("district", "")
        if d in geo_districts:
            grouped[d].append(row)

    out_cols = [
        "district",
        "province",
        "source_districts",
        "samples",
        "mean_arsenic_ug_l",
        "max_arsenic_ug_l",
        "pct_safe_le10",
        "pct_10_to_50",
        "pct_above_50",
        "pct_unsafe_who_gt10",
    ]
    refined: list[dict[str, str]] = []
    for district, grp in sorted(grouped.items()):
        samples_list = [parse_float(r.get("samples")) for r in grp]
        total_samples = sum(s for s in samples_list if s is not None)
        max_vals = [parse_float(r.get("max_arsenic_ug_l")) for r in grp]
        max_arsenic = max((v for v in max_vals if v is not None), default=None)

        refined.append(
            {
                "district": district,
                "province": grp[0].get("province", ""),
                "source_districts": "; ".join(
                    sorted({r.get("source_district", "") for r in grp if r.get("source_district")})
                ),
                "samples": fmt_num(total_samples, 0),
                "mean_arsenic_ug_l": fmt_num(
                    weighted_avg([(parse_float(r.get("mean_arsenic_ug_l")), parse_float(r.get("samples"))) for r in grp]),
                    1,
                ),
                "max_arsenic_ug_l": fmt_num(max_arsenic, 1),
                "pct_safe_le10": fmt_num(
                    weighted_avg([(parse_float(r.get("pct_safe_le10")), parse_float(r.get("samples"))) for r in grp]),
                    1,
                ),
                "pct_10_to_50": fmt_num(
                    weighted_avg([(parse_float(r.get("pct_10_to_50")), parse_float(r.get("samples"))) for r in grp]),
                    1,
                ),
                "pct_above_50": fmt_num(
                    weighted_avg([(parse_float(r.get("pct_above_50")), parse_float(r.get("samples"))) for r in grp]),
                    1,
                ),
                "pct_unsafe_who_gt10": fmt_num(
                    weighted_avg([(parse_float(r.get("pct_unsafe_who_gt10")), parse_float(r.get("samples"))) for r in grp]),
                    1,
                ),
            }
        )
    refined.sort(key=lambda r: (r["province"], r["district"]))
    write_csv(output_dir / "pcrwr_arsenic_district_refined.csv", out_cols, refined)
    return len(refined)


def refine_mics_ecoli(input_dir: Path, output_dir: Path, geo_districts: set[str]) -> int:
    _, rows = read_csv(input_dir / "mics_drinking_water_ecoli_district.csv")
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        d = row.get("district", "")
        # Drop province/division summaries and empty duplicate placeholders.
        if row.get("level") != "district" or d not in geo_districts:
            continue
        if not row.get("pct_ecoli_in_household_water") and not row.get("pct_ecoli_in_source_water"):
            continue
        grouped[d].append(row)

    out_cols = [
        "district",
        "province",
        "survey",
        "source_areas",
        "source_low",
        "source_moderate",
        "source_high",
        "source_very_high",
        "pct_ecoli_in_source_water",
        "n_members_source_test",
        "hh_low",
        "hh_moderate",
        "hh_high",
        "hh_very_high",
        "pct_ecoli_in_household_water",
        "n_members_household_test",
        "pct_safely_managed_drinking_water",
    ]
    refined: list[dict[str, str]] = []
    for district, grp in sorted(grouped.items()):
        src_n = sum(v for v in (parse_float(r.get("n_members_source_test")) for r in grp) if v is not None)
        hh_n = sum(v for v in (parse_float(r.get("n_members_household_test")) for r in grp) if v is not None)

        def w_src(col: str) -> str:
            return fmt_num(weighted_avg([(parse_float(r.get(col)), parse_float(r.get("n_members_source_test"))) for r in grp]), 1)

        def w_hh(col: str) -> str:
            return fmt_num(weighted_avg([(parse_float(r.get(col)), parse_float(r.get("n_members_household_test"))) for r in grp]), 1)

        refined.append(
            {
                "district": district,
                "province": grp[0].get("province", ""),
                "survey": grp[0].get("survey", ""),
                "source_areas": "; ".join(sorted({r.get("area", "") for r in grp if r.get("area")})),
                "source_low": w_src("source_low"),
                "source_moderate": w_src("source_moderate"),
                "source_high": w_src("source_high"),
                "source_very_high": w_src("source_very_high"),
                "pct_ecoli_in_source_water": w_src("pct_ecoli_in_source_water"),
                "n_members_source_test": fmt_num(src_n, 0),
                "hh_low": w_hh("hh_low"),
                "hh_moderate": w_hh("hh_moderate"),
                "hh_high": w_hh("hh_high"),
                "hh_very_high": w_hh("hh_very_high"),
                "pct_ecoli_in_household_water": w_hh("pct_ecoli_in_household_water"),
                "n_members_household_test": fmt_num(hh_n, 0),
                "pct_safely_managed_drinking_water": w_hh("pct_safely_managed_drinking_water"),
            }
        )
    refined.sort(key=lambda r: (r["province"], r["district"]))
    write_csv(output_dir / "mics_ecoli_district_refined.csv", out_cols, refined)
    return len(refined)


def refine_pbs_tubewells(input_dir: Path, output_dir: Path, geo_districts: set[str]) -> int:
    """Aggregate 2024 tube-well counts per GeoJSON district with solar columns omitted."""
    _, rows = read_csv(input_dir / "pbs_tubewells_district_2024.csv")
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        d = row.get("district", "")
        if d in geo_districts:
            grouped[d].append(row)

    out_cols = [
        "district",
        "province",
        "source_districts",
        "tubewells_and_lift_pumps",
        "tubewells_total",
        "tw_electric",
        "tw_diesel",
        "tw_petrol",
        "tw_others",
        "electric_share_pct",
        "diesel_share_pct",
    ]
    refined: list[dict[str, str]] = []
    sum_cols = ["tubewells_and_lift_pumps", "tubewells_total", "tw_electric", "tw_diesel", "tw_petrol", "tw_others"]
    for district, grp in sorted(grouped.items()):
        sums = {
            c: sum(v for v in (parse_int(r.get(c)) for r in grp) if v is not None)
            for c in sum_cols
        }
        total = sums["tubewells_total"]
        elec_pct = (sums["tw_electric"] / total * 100.0) if total > 0 else None
        diesel_pct = (sums["tw_diesel"] / total * 100.0) if total > 0 else None
        refined.append(
            {
                "district": district,
                "province": grp[0].get("province", ""),
                "source_districts": "; ".join(
                    sorted({r.get("source_district", "") for r in grp if r.get("source_district")})
                ),
                **{c: str(sums[c]) for c in sum_cols},
                "electric_share_pct": fmt_num(elec_pct, 1),
                "diesel_share_pct": fmt_num(diesel_pct, 1),
            }
        )
    refined.sort(key=lambda r: (r["province"], r["district"]))
    write_csv(output_dir / "pbs_tubewells_district_2024_refined.csv", out_cols, refined)
    return len(refined)


def refine_census2023(input_dir: Path, output_dir: Path, geo_districts: set[str]) -> int:
    """Keep district-level Census 2023 rows, merge sub-districts, and recompute percentages."""
    _, rows = read_csv(input_dir / "census2023_drinking_water_source.csv")
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        d = row.get("district", "")
        if row.get("level") != "district" or d not in geo_districts:
            continue
        grouped[(d, row.get("locality", ""))].append(row)

    count_cols = [
        "households",
        "improved_source",
        "inside_dwelling",
        "outside_dwelling",
        "tap_water",
        "motor_pump",
        "dug_well",
        "filtration_plant",
        "bottled_water",
        "others",
    ]
    out_cols = [
        "district",
        "province",
        "locality",
        "source_districts",
        *count_cols,
        "pct_motor_pump",
        "pct_groundwater_self_supply",
        "pct_tap_water",
        "pct_filtration_or_bottled",
    ]
    refined: list[dict[str, str]] = []
    for (district, locality), grp in sorted(grouped.items()):
        sums = {
            c: sum(v for v in (parse_int(r.get(c)) for r in grp) if v is not None)
            for c in count_cols
        }
        hh = sums["households"]
        pct = (lambda num: fmt_num(num / hh * 100.0, 2)) if hh > 0 else (lambda _num: "")
        refined.append(
            {
                "district": district,
                "province": grp[0].get("province", ""),
                "locality": locality,
                "source_districts": "; ".join(
                    sorted({r.get("source_district", "") for r in grp if r.get("source_district")})
                ),
                **{c: str(sums[c]) for c in count_cols},
                "pct_motor_pump": pct(sums["motor_pump"]),
                "pct_groundwater_self_supply": pct(sums["motor_pump"] + sums["dug_well"]),
                "pct_tap_water": pct(sums["tap_water"]),
                "pct_filtration_or_bottled": pct(sums["filtration_plant"] + sums["bottled_water"]),
            }
        )
    refined.sort(key=lambda r: (r["province"], r["district"], r["locality"]))
    write_csv(output_dir / "census2023_drinking_water_district_refined.csv", out_cols, refined)
    return len(refined)


def main() -> None:
    parser = argparse.ArgumentParser(description="Refine Tier 1 external datasets for AquaLedger.")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    geo_districts = load_geojson_districts()
    counts = {
        "district_master_2026_refined.csv": refine_district_master(args.input_dir, args.output_dir, geo_districts),
        "grace_tws_district_summary_refined.csv": refine_passthrough_district_table(
            "grace_tws_district_summary.csv",
            "grace_tws_district_summary_refined.csv",
            args.input_dir,
            args.output_dir,
            geo_districts,
            ("province", "district"),
        ),
        "grace_tws_province_monthly_refined.csv": refine_passthrough_district_table(
            "grace_tws_province_monthly.csv",
            "grace_tws_province_monthly_refined.csv",
            args.input_dir,
            args.output_dir,
            geo_districts,
            ("province", "month"),
        ),
        "pcrwr_arsenic_district_refined.csv": refine_pcrwr_arsenic(args.input_dir, args.output_dir, geo_districts),
        "pcrwr_city_drinking_water_refined.csv": refine_passthrough_district_table(
            "pcrwr_city_drinking_water_2020.csv",
            "pcrwr_city_drinking_water_refined.csv",
            args.input_dir,
            args.output_dir,
            geo_districts,
            ("province", "city"),
        ),
        "mics_ecoli_district_refined.csv": refine_mics_ecoli(args.input_dir, args.output_dir, geo_districts),
        "pbs_tubewells_district_2024_refined.csv": refine_pbs_tubewells(args.input_dir, args.output_dir, geo_districts),
        "census2023_drinking_water_district_refined.csv": refine_census2023(args.input_dir, args.output_dir, geo_districts),
        "chirps_rainfall_district_summary_refined.csv": refine_passthrough_district_table(
            "chirps_rainfall_district_summary.csv",
            "chirps_rainfall_district_summary_refined.csv",
            args.input_dir,
            args.output_dir,
            geo_districts,
            ("province", "district"),
        ),
        "wri_aqueduct_district_baseline_refined.csv": refine_passthrough_district_table(
            "wri_aqueduct_district_baseline.csv",
            "wri_aqueduct_district_baseline_refined.csv",
            args.input_dir,
            args.output_dir,
            geo_districts,
            ("province", "district"),
        ),
    }

    print(f"GeoJSON canonical districts: {len(geo_districts)}")
    for fname, n in counts.items():
        print(f"  {fname}: {n} rows")


if __name__ == "__main__":
    main()
