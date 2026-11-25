# AquaLedger

Community groundwater quality tracker for Pakistan. People submit lab results for a tube well, bore or hand pump; AquaLedger screens each result against WHO / Pakistan drinking-water limits, groups reports by area, shows risk on a map and tracks source depth over time.

## Features

- **Community reports**: signed-in, email-verified users submit a source's location, depth, sample date and 10 lab values (pH, TDS, turbidity, conductivity, hardness, chloride, nitrate, fluoride, arsenic, E. coli). GPS is saved only with consent.
- **Risk screening** (`src/lib/water-risk-screening.ts`): arsenic, nitrate, fluoride or E. coli over the limit is *High concern*; pH, TDS, turbidity, hardness or chloride out of range is *Moderate concern*.
- **Area risk and trends**: Supabase views aggregate reports per area and source type.
- **Groundwater map**: MapLibre map of reported areas.
- **Depth forecast**: monthly readings for one source give a depth trend and projection.
- **Admin workspace**: monitoring, quality reports, report review (verify / reject), notifications for reports awaiting review, and settings.

## Tech stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, shadcn UI, Recharts, MapLibre GL, and Supabase for the database and auth.

## Local setup

1. Install Node.js 20 or newer.
2. Install packages:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and **publishable** key (Project Settings → API). Never put the `service_role` / secret key here.
4. Start the dev server and open http://localhost:3000:
   ```bash
   npm run dev
   ```

## Supabase setup

Run the files in `supabase/` in the Supabase SQL Editor, in this order:

1. `email-otp-gps.sql`: ownership, GPS columns and row-level security on `water_reports`
2. `report-codes.sql`: readable report codes such as `LHR-12`
3. `area-risk-aggregation.sql`: per-report and per-area risk views
4. `public-area-source-trends.sql`: public area / source-type trends

These scripts expect an existing `public.water_reports` table; the script that first created that table is not in this repository yet.

In **Authentication → URL Configuration**, add `http://localhost:3000/**` to the redirect URLs so password reset links work locally.

### Admin users

Admin pages need `app_metadata.role = "admin"` on the user. Set it in the SQL Editor:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
where email = 'admin@example.com';
```

The user must sign out and back in for the role to apply.

## Census heatmap data

The Groundwater Map shades districts with `public/data/pakistan-groundwater-census-2020.geojson`. It combines:

- **Pakistan Bureau of Statistics, Mouza Census 2020**: per-mouza water table depth (feet) and underground water taste (sweet or brackish), aggregated into each district's median depth and brackish share
- **geoBoundaries PAK ADM2** (2019, public domain) district boundaries

Districts created after 2019 are merged into the district they were carved from. To rebuild the file, use the standard-library Python scripts in `scripts/census/`:

```bash
python scripts/census/build_census_geojson.py "Mouza Census-2020.xlsx" geoBoundaries-PAK-ADM2_simplified.geojson public/data/pakistan-groundwater-census-2020.geojson
```

## Observation well data

The map's well layer and the Overview's "Long-term water level in Punjab" chart come from October depth-to-water readings at 3,311 monitoring wells (38,450 readings, mostly 1979–2010) and each well's linear trend. `scripts/wells/build_wells.py` turns the two source CSVs into:

- `public/data/pakistan-observation-wells.json`: every well with its coordinates, trend and full reading history (loaded by the map)
- `src/data/punjab-water-level-by-year.json`: the yearly summary and headline numbers (bundled into the Overview)

```bash
python scripts/wells/build_wells.py pakistan_groundwater_observations.csv site_trends.csv public/data/pakistan-observation-wells.json src/data/punjab-water-level-by-year.json
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
