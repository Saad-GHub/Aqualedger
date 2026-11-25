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
import {
  readPublicAreaSourceTrends,
  type PublicAreaSourceTrend,
} from "@/lib/community-water-reports";
import { meanDepth, recommendAreaWaterSources } from "@/lib/depth-analytics";

const colors = ["#0d9488", "#2563eb", "#f59e0b", "#7c3aed", "#e11d48", "#0891b2"];

export function PublicWaterSources() {
  const [trends, setTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedArea, setSelectedArea] = useState("");

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
      );
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
      .map(([month, series]) =>
        Object.fromEntries([
          ["month", month],
          ...[...series.entries()].map(([source, total]) => [
            source,
            meanDepth(total.depthTotal, total.readings) ?? 0,
          ]),
        ]) as Record<string, string | number>
      )
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
        eyebrow="Area Water Source Intelligence"
        title="Water Sources & Smart Recommendations"
        description="Select any area to see its exact source counts (boreholes, tube wells, hand pumps) and automatic recommendations for Household vs Farmer / Irrigation use."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Areas with reports</p>
          <p className="mt-2 text-2xl font-bold">{areaNames.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Source categories</p>
          <p className="mt-2 text-2xl font-bold">
            {new Set(trends.map((row) => row.sourceType)).size}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total reports analyzed</p>
          <p className="mt-2 text-2xl font-bold">
            {trends.reduce((sum, row) => sum + row.reportCount, 0)}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          {error}
        </p>
      ) : activeIntel && activeArea ? (
        <Panel
          title={`Area Spotlight: ${activeArea}`}
          description="Select an area below to inspect its exact water source counts and see which source is most beneficial for residents vs farmers."
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <label className="w-full max-w-sm text-xs font-semibold text-slate-600">
              Select Area
              <select
                value={activeArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
              >
                {areaNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
              <Sparkles size={14} />
              {activeIntel.totalReports} total source reports in {activeArea}
            </span>
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
                      report{item.reportCount === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Avg depth:{" "}
                    <strong>
                      {item.averageDepthM !== null
                        ? `${item.averageDepthM.toFixed(1)} m`
                        : "—"}
                    </strong>
                  </p>
                </div>
              );
            })}
          </div>

          {/* Beneficial Source Recommendations: Household vs Farmer */}
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            {activeIntel.householdBest && (
              <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-800">
                    <Home size={16} />
                    Best for Aam User / Household
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 shadow-sm">
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
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-800">
                    <Tractor size={16} />
                    Best for Farmer / Irrigation
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-800 shadow-sm">
                    {activeIntel.irrigationBest.averageDepthM !== null
                      ? `${activeIntel.irrigationBest.averageDepthM.toFixed(1)} m avg`
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

          {/* Charts for Selected Area */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <h4 className="mb-3 text-sm font-bold text-slate-800">
                Source Count Comparison in {activeArea}
              </h4>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={activeIntel.sourceBreakdown}
                    margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="sourceType" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip formatter={(value) => [`${value} reports`, "Count"]} />
                    <Bar dataKey="reportCount" fill="#0d9488" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <h4 className="mb-3 text-sm font-bold text-slate-800">
                Monthly Depth by Source Type (m)
              </h4>
              <div className="h-60 w-full">
                {activeMonthlyChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={activeMonthlyChartData}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis unit=" m" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip formatter={(value, name) => [`${value} m`, name]} />
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
        title="All Areas Directory"
        description="Search or click any area card to load its full source breakdown and recommendations above."
      >
        <label className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search size={17} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search areas or source types (e.g. Chakwal, Tube well, Borehole)…"
          />
        </label>

        {filteredAreas.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAreas.map(([area]) => {
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
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
            <AlertTriangle size={16} className="text-amber-500" />
            <span>No area source summaries match your search yet.</span>
          </div>
        )}
      </Panel>
    </>
  );
}
