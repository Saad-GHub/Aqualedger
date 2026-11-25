"""
Refine Kaggle 'Pakistan Punjab Groundwater Levels 1900-2020' CSV into a clean
Supabase SQL seed script (frontend/supabase/seed-refined-kaggle.sql).

Usage:
  python scripts/refine_kaggle_groundwater.py --input data/pakistan_groundwater_observations.csv
"""

from __future__ import annotations

import argparse
import csv
import math
import uuid
from pathlib import Path

PUNJAB_CITIES: list[tuple[str, float, float]] = [
    ("Lahore, Punjab", 31.5204, 74.3587),
    ("Faisalabad, Punjab", 31.4180, 73.0791),
    ("Multan, Punjab", 30.1575, 71.5249),
    ("Rawalpindi, Punjab", 33.5651, 73.0479),
    ("Sargodha, Punjab", 32.0836, 72.6711),
    ("Gujranwala, Punjab", 32.1877, 74.1871),
    ("Sialkot, Punjab", 32.4945, 74.5361),
    ("Bahawalpur, Punjab", 29.3956, 71.6833),
    ("Chakwal, Punjab", 32.9328, 72.8531),
    ("Okara, Punjab", 30.8100, 73.4458),
    ("Gujrat, Punjab", 32.5731, 74.0789),
    ("Jhang, Punjab", 31.2681, 72.3181),
    ("Dera Ghazi Khan, Punjab", 30.0561, 70.6348),
    ("Rahim Yar Khan, Punjab", 28.4202, 70.2952),
]

SOURCE_TYPES = ["Tube well", "Borehole", "Community well"]


def pick_col(headers: list[str], candidates: list[str]) -> str | None:
    lower_map = {h.strip().lower(): h for h in headers}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    for h in headers:
        hl = h.strip().lower()
        if any(c.lower() in hl for c in candidates):
            return h
    return None


def nearest_city(lat: float, lon: float) -> str:
    best_name = "Punjab, Pakistan"
    best_dist = float("inf")
    for name, clat, clon in PUNJAB_CITIES:
        dist = math.hypot(lat - clat, lon - clon)
        if dist < best_dist:
            best_dist = dist
            best_name = name
    return best_name


def parse_date(raw: str) -> tuple[str, int] | None:
    val = raw.strip()
    if not val:
        return None
    # Handle YYYY-MM-DD, YYYY/MM/DD, or YYYY
    for sep in ("-", "/"):
        if sep in val:
            parts = val.split(sep)
            if len(parts[0]) == 4 and parts[0].isdigit():
                year = int(parts[0])
                month = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 6
                day = int(parts[2][:2]) if len(parts) > 2 and parts[2][:2].isdigit() else 15
                month = max(1, min(12, month))
                day = max(1, min(28, day))
                return f"{year:04d}-{month:02d}-{day:02d}", year
    if val[:4].isdigit():
        year = int(val[:4])
        return f"{year:04d}-06-15", year
    return None


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser(description="Refine Kaggle groundwater CSV into Supabase SQL.")
    parser.add_argument("--input", required=True, help="Path to pakistan_groundwater_observations.csv")
    parser.add_argument(
        "--output",
        default="frontend/supabase/seed-refined-kaggle.sql",
        help="Output SQL seed file",
    )
    parser.add_argument("--min-year", type=int, default=2010, help="Minimum year to keep (default: 2010)")
    parser.add_argument("--max-rows", type=int, default=1500, help="Maximum refined rows to export (default: 1500)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"Input CSV not found: {input_path}")

    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        col_well = pick_col(headers, ["site_id", "well_id", "station", "id"])
        col_lat = pick_col(headers, ["latitude", "lat"])
        col_lon = pick_col(headers, ["longitude", "lon", "lng"])
        col_date = pick_col(headers, ["date", "obs_date", "sample_date", "year"])
        col_depth = pick_col(headers, ["depth", "dtw", "water_level", "mbgl", "value"])
        col_area = pick_col(headers, ["district", "tehsil", "area", "city", "doab", "location"])

        if not (col_lat and col_lon and col_date and col_depth):
            raise SystemExit(
                f"Could not detect required columns in {headers}. Need lat, lon, date, depth."
            )

        rows: list[dict[str, object]] = []
        well_uuids: dict[str, str] = {}
        well_codes: dict[str, str] = {}
        well_counter = 0

        for raw in reader:
            try:
                lat = float(raw[col_lat])
                lon = float(raw[col_lon])
                depth = float(raw[col_depth])
            except (TypeError, ValueError):
                continue

            if not (23.0 <= lat <= 37.5 and 60.5 <= lon <= 78.0):
                continue
            if not (0.2 <= depth <= 300.0):
                continue

            parsed_date = parse_date(str(raw[col_date]))
            if not parsed_date:
                continue
            iso_date, year = parsed_date
            if year < args.min_year:
                continue

            well_key = str(raw[col_well]).strip() if col_well and raw.get(col_well) else f"{lat:.3f},{lon:.3f}"
            if well_key not in well_uuids:
                well_counter += 1
                well_uuids[well_key] = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"aqualedger:{well_key}"))
                well_codes[well_key] = f"SRC-{well_counter}"

            area_raw = str(raw[col_area]).strip() if col_area and raw.get(col_area) else ""
            area_name = area_raw if area_raw and area_raw.lower() != "nan" else nearest_city(lat, lon)
            if "punjab" not in area_name.lower() and "," not in area_name:
                area_name = f"{area_name}, Punjab"

            source_type = SOURCE_TYPES[well_counter % len(SOURCE_TYPES)]
            rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "source_id": well_uuids[well_key],
                    "source_code": well_codes[well_key],
                    "source_label": f"{source_type} ({well_key})",
                    "source_type": source_type,
                    "area_name": area_name,
                    "address": f"Monitoring Site {well_key}, {area_name}",
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "depth": round(depth, 2),
                    "sample_date": iso_date,
                }
            )
            if len(rows) >= args.max_rows:
                break

    if not rows:
        raise SystemExit("No valid rows matched the filter criteria.")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as out:
        out.write("-- Refined Kaggle Punjab Groundwater Observations Seed\n")
        out.write("-- Deletes all old raw data and inserts refined monitoring records.\n")
        out.write("begin;\n")
        out.write("truncate table public.water_reports restart identity cascade;\n")
        out.write("truncate table public.water_report_code_counters;\n")
        out.write("truncate table public.user_source_code_counters;\n\n")
        out.write(
            "do $$\n"
            "declare\n"
            "  v_owner uuid;\n"
            "begin\n"
            "  select id into v_owner from auth.users order by created_at asc limit 1;\n"
            "  if v_owner is null then\n"
            "    raise exception 'Create at least one user in Supabase Auth before running this seed.';\n"
            "  end if;\n\n"
        )
        for r in rows:
            out.write(
                "  insert into public.water_reports (\n"
                "    id, created_by, source_id, source_code, source_label, source_type,\n"
                "    reporter_name, area_name, street_address, address,\n"
                "    location_consent, latitude, longitude, source_depth_m, sample_date,\n"
                "    main_concern, review_status\n"
                "  ) values (\n"
                f"    {sql_str(str(r['id']))}, v_owner, {sql_str(str(r['source_id']))}, {sql_str(str(r['source_code']))}, "
                f"{sql_str(str(r['source_label']))}, {sql_str(str(r['source_type']))},\n"
                f"    'BGS / Punjab Monitoring', {sql_str(str(r['area_name']))}, {sql_str(str(r['address']))}, {sql_str(str(r['address']))},\n"
                f"    true, {r['lat']}, {r['lon']}, {r['depth']}, {sql_str(str(r['sample_date']))},\n"
                "    'Seasonal 3-month check', 'verified'\n"
                "  );\n"
            )
        out.write("end;\n$$;\ncommit;\nnotify pgrst, 'reload schema';\n")

    print(f"Refined {len(rows)} rows across {len(well_uuids)} wells -> {out_path}")


if __name__ == "__main__":
    main()
