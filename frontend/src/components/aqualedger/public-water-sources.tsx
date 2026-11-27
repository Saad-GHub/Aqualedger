"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Droplets,
  Home,
  Search,
  Sparkles,
  Tractor,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageIntro, Panel } from "@/components/aqualedger/app-shell";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import {
  readPublicAreaSourceTrends,
  type PublicAreaSourceTrend,
} from "@/lib/community-water-reports";
import { formatAxisDepthMetersAndFeet, formatDepthMetersAndFeet, meanDepth, recommendAreaWaterSources } from "@/lib/depth-analytics";

const colors = ["#0d9488", "#2563eb", "#f59e0b", "#7c3aed", "#e11d48", "#0891b2"];

export function PublicWaterSources() {
  const lang = useLanguage();
  const [trends, setTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [showAllAreas, setShowAllAreas] = useState(false);
  const [dominantFilter, setDominantFilter] = useState<"all" | "Tube well" | "Borehole">("all");

  useEffect(() => {
    void readPublicAreaSourceTrends()
      .then((items) => {
        setTrends(items);
        setError("");
      })
      .catch(() =>
        setError(
          "Public area trends are not connected yet. Run supabase/reset-and-renew-schema.sql in the Supabase SQL Editor."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const areaNames = useMemo(
    () =>
      [...new Set(trends.map((row) => row.areaKey))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [trends]
  );

  const activeArea = areaNames.includes(selectedArea)
    ? selectedArea
    : areaNames[0] ?? "";

  const activeIntel = useMemo(
    () =>
      activeArea
        ? recommendAreaWaterSources(trends, activeArea)
        : null,
    [trends, activeArea]
  );

  const activeMonthlyChartData = useMemo(() => {
    if (!activeArea) return [];
    const rows = trends.filter((r) => r.areaKey === activeArea);
    const monthlyTotals = new Map<
      string,
      Map<string, { depthTotal: number; readings: number }>
    >();
    rows.forEach((row) => {
      if (!row.sampleMonth || row.averageDepthM === null) return;
      const month = row.sampleMonth.slice(0, 7);
      const series =
        monthlyTotals.get(month) ??
        new Map<string, { depthTotal: number; readings: number }>();
      const total = series.get(row.sourceType) ?? { depthTotal: 0, readings: 0 };
      total.depthTotal += row.averageDepthM * row.reportCount;
      total.readings += row.reportCount;
      series.set(row.sourceType, total);
      monthlyTotals.set(month, series);
    });
    return [...monthlyTotals.entries()]
      .map(([month, series]) => {
        const ts = new Date(`${month}-01T00:00:00`).getTime();
        return Object.fromEntries([
          ["month", month],
          ["ts", Number.isFinite(ts) ? ts : 0],
          ...[...series.entries()].map(([source, total]) => [
            source,
            meanDepth(total.depthTotal, total.readings) ?? 0,
          ]),
        ]) as Record<string, string | number>;
      })
      .sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [trends, activeArea]);

  const filteredAreas = useMemo(() => {
    const groups = new Map<string, PublicAreaSourceTrend[]>();
    trends
      .filter((row) =>
        `${row.areaKey} ${row.sourceType} ${row.cityName}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
      .forEach((row) =>
        groups.set(row.areaKey, [...(groups.get(row.areaKey) ?? []), row])
      );
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [query, trends]);

  return (
    <>
      <PageIntro
        eyebrow={tr(lang, "Area Water Source Intelligence", "علاقائی آبی ذرائع کی ذہانت")}
        title={tr(lang, "Water Sources & Smart Recommendations", "پانی کے ذرائع اور ذہین سفارشات")}
        description={tr(
          lang,
          "Select any area to see its exact source counts (boreholes, tube wells, hand pumps) and automatic recommendations for Household vs Farmer / Irrigation use.",
          "کسی بھی علاقے کو منتخب کر کے بورویل، ٹیوب ویل، ہینڈ پمپ کی تعداد اور گھریلو بمقابلہ زرعی استعمال کے لیے خودکار مشورے دیکھیں۔"
        )}
      />

      <div className="aqua-stats grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="glass glass-lift rounded-3xl p-4 sm:p-5">
          <p className="text-sm text-slate-500">{tr(lang, "Areas with reports", "رپورٹ شدہ علاقے")}</p>
          <p className="mt-2 text-2xl font-bold">{loading && !trends.length ? <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/70" /> : areaNames.length}</p>
        </div>
        <div className="glass glass-lift rounded-3xl p-4 sm:p-5">
          <p className="text-sm text-slate-500">{tr(lang, "Source categories", "ذرائع کی اقسام")}</p>
          <p className="mt-2 text-2xl font-bold">
            {loading && !trends.length ? <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/70" /> : new Set(trends.map((row) => row.sourceType)).size}
          </p>
        </div>
        <div className="glass glass-lift rounded-3xl p-4 sm:p-5">
          <p className="text-sm text-slate-500">{tr(lang, "Total reports analyzed", "کل تجزیہ شدہ رپورٹس")}</p>
          <p className="mt-2 text-2xl font-bold">
            {loading && !trends.length ? <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/70" /> : trends.reduce((sum, row) => sum + row.reportCount, 0)}
          </p>
        </div>
      </div>

      {loading && !trends.length ? (
        <Panel title={tr(lang, "Loading Water Sources…", "پانی کے ذرائع لوڈ ہو رہے ہیں…")} description={tr(lang, "Fetching area-wise source counts and AI recommendations.", "علاقے کے لحاظ سے ذرائع کی تعداد اور AI سفارشات حاصل کی جا رہی ہیں۔")}>
          <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
        </Panel>
      ) : error ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          {error}
        </p>
      ) : activeIntel && activeArea ? (
        <Panel
          title={`${tr(lang, "Area Spotlight", "علاقے کی تفصیل")}: ${activeArea}`}
          description={tr(lang, "Select an area below to inspect its exact water source counts and see which source is most beneficial for residents vs farmers.", "نیچے علاقہ منتخب کریں اور جانیں کہ رہائشیوں اور کسانوں کے لیے کون سا ذریعہ سب سے بہتر ہے۔")}
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <label className="w-full max-w-sm text-xs font-semibold text-slate-600">
              {tr(lang, "Select Area", "علاقہ منتخب کریں")}
              <select
                value={activeArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-xs outline-none focus:border-teal-500 dark:border-white/20 dark:bg-[#0f172a] dark:text-white"
              >
                {areaNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <span className="inline-flex items-center gap-2 self-end rounded-full bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 sm:mb-0.5">
              <Sparkles size={14} />
              {activeIntel.totalReports} {tr(lang, `total source reports in ${activeArea}`, `کل رپورٹس (${activeArea})`)}
            </span>
          </div>

          {/* 50/50 Hero Recommendation Cards right under Select Area */}
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            {activeIntel.householdBest && (
              <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-800">
                    <Home size={16} className="shrink-0" />
                    {tr(lang, "Best for Household / Domestic", "گھریلو استعمال کے لیے بہترین")}
                  </span>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 shadow-sm">
                    {activeIntel.householdBest.riskLabel}
                  </span>
                </div>
                <p className="mt-3 text-xl font-bold text-slate-900">
                  {activeIntel.householdBest.sourceType}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-slate-700">
                  {activeIntel.householdBest.reason}
                </p>
                {activeIntel.householdBest.caution && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                    {activeIntel.householdBest.caution}
                  </p>
                )}
              </div>
            )}

            {activeIntel.irrigationBest && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-800">
                    <Tractor size={16} className="shrink-0" />
                    {tr(lang, "Best for Farmer / Irrigation", "کسان / آبپاشی کے لیے بہترین")}
                  </span>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-800 shadow-sm">
                    {activeIntel.irrigationBest.averageDepthM !== null
                      ? `${formatDepthMetersAndFeet(activeIntel.irrigationBest.averageDepthM)} avg`
                      : "Tracked"}
                  </span>
                </div>
                <p className="mt-3 text-xl font-bold text-slate-900">
                  {activeIntel.irrigationBest.sourceType}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-slate-700">
                  {activeIntel.irrigationBest.reason}
                </p>
                {activeIntel.irrigationBest.caution && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                    {activeIntel.irrigationBest.caution}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Exact Source Type Counts for Selected Area */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {activeIntel.sourceBreakdown.map((item) => {
              const badge =
                item.riskLabel === "High concern"
                  ? "bg-red-50 text-red-700"
                  : item.riskLabel === "Moderate concern"
                    ? "bg-amber-50 text-amber-800"
                    : item.riskLabel === "Normal"
                      ? "bg-teal-50 text-teal-700"
                      : "bg-slate-100 text-slate-600";
              return (
                <div
                  key={item.sourceType}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
                      <Droplets size={15} className="text-teal-600" />
                      {item.sourceType}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
                      {item.riskLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {item.reportCount}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      {item.reportCount === 1 ? tr(lang, "report", "رپورٹ") : tr(lang, "reports", "رپورٹس")}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Avg depth:{" "}
                    <strong>
                      {item.averageDepthM !== null
                        ? formatDepthMetersAndFeet(item.averageDepthM)
                        : "—"}
                    </strong>
                  </p>
                </div>
              );
            })}
          </div>

          {/* Charts for Selected Area */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <h4 className="mb-3 text-sm font-bold text-slate-800">
                {tr(lang, `Source Count Comparison in ${activeArea}`, `${activeArea} میں ذرائع کی تعداد کا موازنہ`)}
              </h4>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={activeIntel.sourceBreakdown}
                    margin={{ top: 8, right: 28, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="sourceType" padding={{ left: 10, right: 16 }} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip separator=": " formatter={(value) => [`${value} reports`, "Count"]} />
                    <Bar dataKey="reportCount" fill="#0d9488" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <h4 className="mb-3 text-sm font-bold text-slate-800">
                {tr(lang, "Monthly Depth by Source Type (m / ft)", "ذریعہ کی قسم کے لحاظ سے ماہانہ گہرائی (میٹر / فٹ)")}
              </h4>
              <div className="h-60 w-full">
                {activeMonthlyChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={activeMonthlyChartData}
                      margin={{ top: 8, right: 20, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        minTickGap={36}
                        tickFormatter={(ts) => {
                          const d = new Date(Number(ts));
                          return Number.isNaN(d.getTime()) ? String(ts) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                        }}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                      />
                      <YAxis width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip
                        separator=": "
                        labelFormatter={(_lbl, payload) => String(payload?.[0]?.payload?.month ?? "")}
                        formatter={(value, name) => [formatDepthMetersAndFeet(Number(value)), name]}
                      />
                      <Legend />
                      {activeIntel.sourceBreakdown.map((s, idx) => (
                        <Line
                          key={s.sourceType}
                          type="monotone"
                          dataKey={s.sourceType}
                          name={s.sourceType}
                          connectNulls
                          dot
                          stroke={colors[idx % colors.length]}
                          strokeWidth={2.5}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    No dated depth readings available for this area yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {/* All Areas Directory */}
      <Panel
        title={tr(lang, "All Areas Directory", "تمام علاقوں کی ڈائریکٹری")}
        description={tr(lang, "Showing the top 3 areas by report volume by default. Click any area chip, search, or expand all areas to inspect its source breakdown above.", "رپورٹس کی تعداد کے لحاظ سے ٹاپ 3 علاقے دکھائے جا رہے ہیں۔ تفصیل دیکھنے کے لیے کسی بھی علاقے پر کلک یا تلاش کریں۔")}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={17} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder={tr(lang, "Search area or source…", "علاقہ یا ذریعہ تلاش کریں…")}
            />
          </label>
          {filteredAreas.length > 3 && !query.trim() && dominantFilter === "all" ? (
            <button
              type="button"
              onClick={() => setShowAllAreas((prev) => !prev)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-xs transition hover:border-teal-500 hover:text-teal-700 dark:border-white/20 dark:bg-[#0f172a] dark:text-white dark:hover:border-teal-400 dark:hover:text-teal-300"
            >
              {showAllAreas ? tr(lang, "Show top 3 areas", "ٹاپ 3 علاقے دکھائیں") : tr(lang, `Show all ${filteredAreas.length} areas`, `تمام ${filteredAreas.length} علاقے دکھائیں`)}
            </button>
          ) : null}
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {([
            ["all", tr(lang, "All", "تمام")],
            ["Tube well", tr(lang, "Tube well dominant", "ٹیوب ویل زیادہ")],
            ["Borehole", tr(lang, "Borehole dominant", "بورویل زیادہ")],
          ] as const).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setDominantFilter(val)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                dominantFilter === val
                  ? "bg-teal-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-teal-300 dark:border-white/20 dark:bg-[#0f172a] dark:text-white/90 dark:hover:border-teal-400"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {(() => {
          const domFiltered = dominantFilter === "all"
            ? filteredAreas
            : filteredAreas.filter(([area]) => recommendAreaWaterSources(trends, area).sourceBreakdown[0]?.sourceType === dominantFilter);
          return domFiltered.length ? (
          <>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {domFiltered.map(([area]) => {
                const isSelected = area === activeArea;
                return (
                  <button
                    key={`chip-${area}`}
                    type="button"
                    onClick={() => setSelectedArea(area)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      isSelected
                        ? "bg-teal-600 text-white shadow-sm"
                        : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-teal-300 hover:bg-teal-50"
                    }`}
                  >
                    {area}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(query.trim() || showAllAreas || dominantFilter !== "all"
                ? domFiltered
                : [...domFiltered]
                    .sort(
                      ([, rowsA], [, rowsB]) =>
                        rowsB.reduce((sum, r) => sum + r.reportCount, 0) -
                        rowsA.reduce((sum, r) => sum + r.reportCount, 0)
                    )
                    .slice(0, 3)
              ).map(([area]) => {
                const intel = recommendAreaWaterSources(trends, area);
                const isSelected = area === activeArea;
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setSelectedArea(area)}
                    className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
                      isSelected
                        ? "border-teal-500 bg-teal-50/40 ring-1 ring-teal-500"
                        : "border-slate-200 bg-white hover:border-teal-300"
                    }`}
                  >
                  <div className="flex w-full items-center justify-between gap-2">
                    <p className="font-bold text-slate-900">{area}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {intel.totalReports} reports
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {intel.sourceBreakdown.map((s) => (
                      <span
                        key={s.sourceType}
                        className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                      >
                        {s.sourceType}: <strong>{s.reportCount}</strong>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 w-full space-y-1 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
                    {intel.householdBest && (
                      <p>
                        <strong className="text-teal-800">Household:</strong>{" "}
                        {intel.householdBest.sourceType}
                      </p>
                    )}
                    {intel.irrigationBest && (
                      <p>
                        <strong className="text-blue-800">Farmer:</strong>{" "}
                        {intel.irrigationBest.sourceType}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
            <AlertTriangle size={16} className="text-amber-500" />
            <span>No area source summaries match your search yet.</span>
          </div>
        );
        })()}
      </Panel>
    </>
  );
}
