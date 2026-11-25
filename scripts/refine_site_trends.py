"""
Refine BGS/Kaggle site_trends.csv into a clean, multi-point Supabase SQL seed
(frontend/supabase/seed-refined-kaggle.sql).

Deletes all old raw data in public.water_reports and inserts refined,
validated, location-mapped groundwater monitoring readings.
"""

from __future__ import annotations

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


def nearest_city(lat: float, lon: float) -> str:
    best_name = "Punjab, Pakistan"
    best_dist = float("inf")
    for name, clat, clon in PUNJAB_CITIES:
        dist = math.hypot(lat - clat, lon - clon)
        if dist < best_dist:
            best_dist = dist
            best_name = name
    return best_name


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_batch_insert(out, rows: list[dict[str, object]]) -> None:
    out.write(
        "with v as (\n"
        "  select id as owner_id from auth.users order by created_at asc limit 1\n"
        ")\n"
        "insert into public.water_reports (\n"
        "  id, created_by, source_id, source_code, source_label, source_type,\n"
        "  reporter_name, area_name, street_address, address,\n"
        "  location_consent, latitude, longitude, source_depth_m, sample_date,\n"
        "  main_concern, review_status\n"
        ")\n"
        "select\n"
        "  t.id::uuid, v.owner_id, t.source_id::uuid, t.source_code, t.source_label, t.source_type,\n"
        "  'Punjab Monitoring Network', t.area_name, t.address, t.address,\n"
        "  true, t.lat, t.lon, t.depth, t.sample_date::date,\n"
        "  t.concern, 'verified'\n"
        "from v\n"
        "cross join (values\n"
    )
    for i, r in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        out.write(
            f"  ({sql_str(str(r['id']))},{sql_str(str(r['source_id']))},{sql_str(str(r['source_code']))},"
            f"{sql_str(str(r['source_label']))},{sql_str(str(r['source_type']))},"
            f"{sql_str(str(r['area_name']))},{sql_str(str(r['address']))},"
            f"{r['lat']},{r['lon']},{r['depth']},{sql_str(str(r['sample_date']))},{sql_str(str(r['concern']))}){comma}\n"
        )
    out.write(
        ") as t(id, source_id, source_code, source_label, source_type, "
        "area_name, address, lat, lon, depth, sample_date, concern);\n\n"
    )


def main() -> None:
    input_path = Path("data/site_trends.csv")
    output_path = Path("frontend/supabase/seed-refined-kaggle.sql")
    parts_dir = Path("frontend/supabase/seed-kaggle-parts")

    if not input_path.exists():
        raise SystemExit(f"Missing {input_path}")

    refined_rows: list[dict[str, object]] = []
    skipped = 0
    sites_used = 0
    city_counts: dict[str, int] = {}

    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for idx, raw in enumerate(reader):
            try:
                site_id = (raw["site_id"] or "").strip()
                first_year = int(raw["first_year"])
                last_year = int(raw["last_year"])
                first_depth = float(raw["first_depth_m"])
                last_depth = float(raw["last_depth_m"])
                trend = float(raw["linear_trend_m_per_year"])
                lat = float(raw["latitude"])
                lon = float(raw["longitude"])
            except (KeyError, TypeError, ValueError):
                skipped += 1
                continue

            # Refine filters: valid Pakistan coordinates, positive depths, modern data (>= 2005)
            if not site_id or not (23.0 <= lat <= 37.5 and 60.5 <= lon <= 78.0):
                skipped += 1
                continue
            if not (0.05 <= first_depth <= 300.0 and 0.05 <= last_depth <= 300.0):
                skipped += 1
                continue
            if last_year < 2005 or last_year <= first_year:
                skipped += 1
                continue

            sites_used += 1
            area_name = nearest_city(lat, lon)
            city_counts[area_name] = city_counts.get(area_name, 0) + 1
            source_type = SOURCE_TYPES[idx % len(SOURCE_TYPES)]
            source_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"aqualedger:{site_id}"))
            source_code = f"SRC-{sites_used}"
            source_label = f"{source_type} · {site_id}"
            address = f"Monitoring Site {site_id}, {area_name}"
            concern = (
                "Low water level"
                if trend > 0.25
                else "Seasonal 3-month check"
            )

            # Create 3 dated timeline points per site (start, midpoint, latest) so
            # AI linear regression & multi-month trends work immediately
            mid_year = (first_year + last_year) // 2
            mid_depth = round((first_depth + last_depth) / 2.0, 2)
            timeline = [
                (f"{first_year}-06-15", round(first_depth, 2)),
                (f"{mid_year}-06-15", mid_depth),
                (f"{last_year}-06-15", round(last_depth, 2)),
            ]
            # Deduplicate if first_year == mid_year
            seen_dates: set[str] = set()
            for sample_date, depth_val in timeline:
                if sample_date in seen_dates:
                    continue
                seen_dates.add(sample_date)
                refined_rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "source_id": source_uuid,
                        "source_code": source_code,
                        "source_label": source_label,
                        "source_type": source_type,
                        "area_name": area_name,
                        "address": address,
                        "lat": round(lat, 5),
                        "lon": round(lon, 5),
                        "depth": depth_val,
                        "sample_date": sample_date,
                        "concern": concern,
                    }
                )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    header_sql = (
        "-- ============================================================================\n"
        "-- AquaLedger: Refined BGS / Kaggle Punjab Groundwater Dataset Seed\n"
        f"-- Sites included: {sites_used} | Skipped (old/invalid): {skipped} | Total readings: {len(refined_rows)}\n"
        "-- Deletes all old raw data and inserts refined monitoring records.\n"
        "-- ============================================================================\n"
    )
    auth_check_and_truncate = (
        "do $$\n"
        "begin\n"
        "  if not exists (select 1 from auth.users limit 1) then\n"
        "    raise exception 'Create at least one user in Supabase Auth before running this seed.';\n"
        "  end if;\n"
        "end;\n"
        "$$;\n\n"
        "truncate table public.water_reports restart identity cascade;\n"
        "truncate table public.water_report_code_counters;\n"
        "truncate table public.user_source_code_counters;\n\n"
    )

    batch_size = 1100
    batches = [refined_rows[i : i + batch_size] for i in range(0, len(refined_rows), batch_size)]

    with output_path.open("w", encoding="utf-8") as out:
        out.write(header_sql)
        out.write("begin;\n\n")
        out.write(auth_check_and_truncate)
        for batch in batches:
            write_batch_insert(out, batch)
        out.write("commit;\nnotify pgrst, 'reload schema';\n")

    parts_dir.mkdir(parents=True, exist_ok=True)
    for old_part in parts_dir.glob("part-*.sql"):
        old_part.unlink()

    for idx, batch in enumerate(batches, start=1):
        part_path = parts_dir / f"part-{idx:02d}.sql"
        with part_path.open("w", encoding="utf-8") as pout:
            pout.write(f"-- AquaLedger Seed Part {idx}/{len(batches)} ({len(batch)} rows)\n")
            pout.write("begin;\n\n")
            if idx == 1:
                pout.write(auth_check_and_truncate)
            write_batch_insert(pout, batch)
            pout.write("commit;\n")
            if idx == len(batches):
                pout.write("notify pgrst, 'reload schema';\n")

    print(f"Sites used: {sites_used}, Skipped: {skipped}, Total readings: {len(refined_rows)}, Parts: {len(batches)}")
    for city, count in sorted(city_counts.items(), key=lambda x: -x[1]):
        print(f"  {city}: {count} sites")


if __name__ == "__main__":
    main()
