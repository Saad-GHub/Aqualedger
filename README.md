# AquaLedger — Groundwater Intelligence for Pakistan

**Live Deployment:** [https://aqualedger-orpin.vercel.app/](https://aqualedger-orpin.vercel.app/)

AquaLedger is a community-powered groundwater depth and water-quality intelligence platform built for Pakistan. Farmers, residents, researchers, and local authorities can log tube well, borehole, and community well readings, screen water quality against WHO / Pakistan drinking-water standards, explore district-level heatmaps, and forecast groundwater depth trends.

---

## Key Features

### Public & Farmer Intelligence
- **Groundwater Overview (`/`):** Live KPI summary (reported sources, depth readings, average depth, critical areas), `Days / Months / Years` depth trends, source-type & top-area comparisons, long-term Punjab observation well trends (3,311 wells, 1979–2010), and GRACE satellite water storage trends & projections (2002–2026+).
- **Interactive Groundwater Map (`/map`):** MapLibre GL map combining **Pakistan Bureau of Statistics Mouza Census 2020** (49,832 mouzas across district boundaries), **3,311 observation wells**, and live community report overlays with severity filtering (`Normal`, `Moderate`, `Critical`).
- **Universal Depth Forecast (`/forecast`):** Explainable statistical forecasting engine (`src/lib/depth-analytics.ts`) using OLS regression blended with recent momentum, Empirical-Bayes shrinkage for sparse histories, seasonal monsoon/dry-cycle calibration, and 95% confidence bands (3M to 7Y horizons), plus CSV export.
- **Water Sources & Recommendations (`/sources`):** Area-wise breakdown of boreholes, tube wells, and community wells with automated **Household / Domestic** vs **Farmer / Irrigation** recommendations and district baselines (PCRWR/MICS water quality, GRACE, CHIRPS rainfall, extraction demand).
- **Personal Farmer Workspace (`/my-sources` & `/my-sources?demo=1`):** Private source tracking with a visual well depth gauge, 6-month AI depth forecast, neighborhood benchmark comparison, tailored conservation precautions, and an interactive **Demo Farmer** mode.
- **Community Reading Submission (`/reports`):** Email-verified users log 3-month depth readings (`m` or `ft`) with optional consent-based GPS capture and WHO / Pakistan water-quality screening (`src/lib/water-risk-screening.ts`).

### Multilingual Aqua Chatbot & WhatsApp Bot
- **Trilingual Support (`/chatbot`, floating widget, `/api/whatsapp`, `/api/whatsapp/simulate`):** Automatically detects and replies in **English**, **Roman Urdu**, and **اردو**.
- **Voice Notes & Location Pins:** Supports voice-to-text via Groq Whisper (`GROQ_API_KEY`) and Pakistan location pin lookup via OpenStreetMap Nominatim.
- **New Water Source Advisor:** Estimates drilling depth, pump HP, solar panel sizing, daily water output, and re-bore risk based on district depth, usage, and acreage.

### Bilingual Urdu RTL & Theme Support
- **Full English / اردو (RTL) Toggle:** Switches layout direction (`dir="rtl"`), `Noto Sans Arabic` typography, city/district names, source types, tables, and charts seamlessly.
- **Light & Dark Glassmorphic Themes:** Persistent theme toggle with high-contrast dark mode.

### Admin Workspace
- **Monitoring Data (`/monitoring`):** Admin-only hub for critical (`Needs attention`) areas, moderate watch counts, pending review count, recent reported sources, and Pakistan coverage.
- **Community Reports & Moderation (`/reports`):** Search, filter, inspect, approve/verify, reject/flag, or delete individual submissions.
- **Data Management & Quality Audit (`/data-management`):**
  - **Pending Reviews (`#pending-reviews`):** Dedicated approval queue for `under_review` submissions.
  - **Area Normalization Audit & Export:** Flags unmapped areas and exports cleaned datasets in **CSV** or **JSON**.
  - **AI Anomaly & Duplicate Inspector:** Uses per-area Median + MAD (Median Absolute Deviation) and physical bounds (`0 < depth <= 300 m`) to flag outliers and duplicates, allowing admins to **exclude** flagged rows from public analytics and **Approve & Restore** them anytime.
- **Settings (`/settings`):** Notification bell alerts, risk alert toggles, auto-sync, and default forecast horizon preferences.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Styling & UI:** Tailwind CSS 4, `shadcn`, `lucide-react`
- **Data Visualization & GIS:** Recharts, MapLibre GL
- **Backend & Auth:** Supabase (`@supabase/supabase-js`, PostgreSQL views, Row-Level Security)
- **Optional AI / Voice APIs:** Groq Whisper (`GROQ_API_KEY`) for voice transcription, Anthropic Claude (`ANTHROPIC_API_KEY`) for enhanced NLU
- **Data Preparation:** Python (`scripts/census/`, `scripts/wells/`, `scripts/`)

---

## Repository Structure

```text
Aqualedger/
├── frontend/                  # Next.js 16 application
│   ├── src/
│   │   ├── app/               # App Router pages & API routes (/api/whatsapp/*)
│   │   ├── components/        # UI & AquaLedger feature components
│   │   ├── data/              # Bundled Punjab observation well yearly summary
│   │   └── lib/               # Analytics, screening, Supabase client, Urdu translations, WhatsApp bot
│   ├── public/data/           # Census GeoJSON & observation wells JSON
│   ├── scripts/               # Python scripts to build census & well datasets
│   ├── supabase/              # SQL schemas, views, and RLS policies
│   └── docs/                  # WhatsApp bot documentation
├── data/                      # Raw/refined trend CSVs
└── scripts/                   # Python dataset refinement scripts
```

---

## Local Setup

### 1. Prerequisites
- Node.js 20+
- A Supabase project

### 2. Install & Configure
```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env.local` and configure:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

# Optional (for voice notes & enhanced chatbot NLU)
GROQ_API_KEY=your_groq_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 3. Run Locally
```bash
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 4. Supabase Setup
Run the SQL scripts in `frontend/supabase/` in the Supabase SQL Editor (see `frontend/README.md` for full order and admin role setup via `app_metadata.role = "admin"`).

---

## Scripts

| Command (inside `frontend/`) | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |

---

Built by **Team Omni** (2026).
