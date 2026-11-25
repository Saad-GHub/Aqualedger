"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Droplets,
  MapPin,
  Plus,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DepthBarTooltip, DepthTrendTooltip } from "@/components/aqualedger/chart-tooltip";
import { asFeet, depthM, metresToFeet, rateM } from "@/lib/units";
import { Panel } from "@/components/aqualedger/app-shell";
import type {
  CommunityWaterReport,
  PublicAreaSourceTrend,
} from "@/lib/community-water-reports";
import {
  aggregateMonthlyDepths,
  aggregateSourceMonthlyDepths,
  computeAreaDepthBenchmark,
  evaluateSourceCondition,
  forecastDepthForHorizon,
  meanDepth,
  normalizeAreaName,
  type DepthForecastInput,
} from "@/lib/depth-analytics";
import { screenWaterReport } from "@/lib/water-risk-screening";

function formatHorizonLabel(months: number) {
  if (months >= 12 && months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "12 mo" : `${years} yr`;
  }
  return `${months} mo`;
}

function WellCrossSectionInfographic({
  currentDepthM,
  projectedDepthM,
  areaAverageM,
  horizonMonths,
  sourceLabel,
}: {
  currentDepthM: number | null;
  projectedDepthM: number | null;
  areaAverageM: number | null;
  horizonMonths: number;
  sourceLabel: string;
}) {
  const values = [currentDepthM, projectedDepthM, areaAverageM].filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );
  const maxDepth = Math.max(20, ...values.map((v) => Math.ceil(v * 1.25 / 10) * 10));
  const pct = (depth: number | null) =>
    depth === null ? null : Math.min(92, Math.max(10, (depth / maxDepth) * 86 + 6));

  const currentPct = pct(currentDepthM);
  const projectedPct = pct(projectedDepthM);
  const areaPct = pct(areaAverageM);

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-emerald-50/40 via-amber-50/30 to-cyan-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">
            Well Depth Cross-Section
          </p>
          <p className="text-xs text-slate-500">{sourceLabel}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
          Scale: 0 – {maxDepth} m · {asFeet(maxDepth)}
        </span>
      </div>

      <div className="relative h-64 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Ground surface */}
        <div className="absolute inset-x-0 top-0 flex h-7 items-center justify-between border-b-2 border-emerald-500 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800 dark:border-emerald-400/70 dark:bg-emerald-500/15 dark:text-emerald-300">
          <span>Ground Level (0 m)</span>
          <span>Surface</span>
        </div>

        {/* Soil strata background */}
        <div
          className="absolute inset-x-0 top-7 bottom-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(245,158,11,0.06) 0%, rgba(14,116,144,0.08) 55%, rgba(13,148,136,0.22) 100%)",
          }}
        />

        {/* Borehole shaft in center */}
        <div className="absolute top-7 bottom-4 left-1/2 w-10 -translate-x-1/2 border-x-2 border-slate-300 bg-slate-100/70 dark:border-white/15 dark:bg-white/5">
          {currentPct !== null && (
            <div
              className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-cyan-400/70 to-teal-600/80 transition-all"
              style={{ top: `${currentPct}%` }}
            />
          )}
        </div>

        {/* Area Average Marker */}
        {areaPct !== null && areaAverageM !== null && (
          <div
            className="absolute inset-x-3 border-t-2 border-dashed border-slate-500 dark:border-slate-400"
            style={{ top: `${areaPct}%` }}
          >
            <span className="absolute left-0 inline-flex -translate-y-1/2 rounded-md bg-[#0b1f3a] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm ring-1 ring-white/20">
              Area Avg: {depthM(areaAverageM)}
            </span>
          </div>
        )}

        {/* Current Depth Marker */}
        {currentPct !== null && currentDepthM !== null && (
          <div
            className="absolute inset-x-3 border-t-2 border-teal-600"
            style={{ top: `${currentPct}%` }}
          >
            <span className="absolute right-0 translate-y-1 rounded-md bg-[#0d9488] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
              Current: {depthM(currentDepthM)}
            </span>
          </div>
        )}

        {/* Projected Depth Marker */}
        {projectedPct !== null && projectedDepthM !== null && (
          <div
            className="absolute inset-x-3 border-t-2 border-dotted border-blue-600"
            style={{ top: `${projectedPct}%` }}
          >
            <span className="absolute right-0 -translate-y-[calc(100%+3px)] rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
              +{formatHorizonLabel(horizonMonths)} Forecast: {depthM(projectedDepthM)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AreaDepthInfographicStrip({
  trends,
  aside,
}: {
  trends: PublicAreaSourceTrend[];
  /** Optional card shown beside the source-type chart (e.g. the risk overview). */
  aside?: React.ReactNode;
}) {
  const areaBars = useMemo(() => {
    const groups = new Map<
      string,
      { total: number; count: number; high: number; moderate: number; normal: number }
    >();
    for (const row of trends) {
      if (row.averageDepthM === null) continue;
      const g = groups.get(row.areaKey) ?? {
        total: 0,
        count: 0,
        high: 0,
        moderate: 0,
        normal: 0,
      };
      g.total += row.averageDepthM * row.reportCount;
      g.count += row.reportCount;
      g.high += row.highCount;
      g.moderate += row.moderateCount;
      g.normal += row.normalCount;
      groups.set(row.areaKey, g);
    }
    return [...groups.entries()]
      .map(([area, g]) => ({
        area: (() => {
          const short = area.split(",")[0].trim();
          return short.length > 14 ? `${short.slice(0, 13)}…` : short;
        })(),
        fullArea: area,
        averageDepthM: meanDepth(g.total, g.count) ?? 0,
        reports: g.count,
      }))
      .sort((a, b) => b.averageDepthM - a.averageDepthM)
      .slice(0, 10);
  }, [trends]);

  const sourceBars = useMemo(() => {
    const groups = new Map<string, { total: number; count: number }>();
    for (const row of trends) {
      if (row.averageDepthM === null) continue;
      const type = row.sourceType || "Unspecified";
      const g = groups.get(type) ?? { total: 0, count: 0 };
      g.total += row.averageDepthM * row.reportCount;
      g.count += row.reportCount;
      groups.set(type, g);
    }
    return [...groups.entries()]
      .map(([sourceType, g]) => ({
        sourceType,
        averageDepthM: meanDepth(g.total, g.count) ?? 0,
        reports: g.count,
      }))
      .sort((a, b) => b.averageDepthM - a.averageDepthM);
  }, [trends]);

  if (!areaBars.length && !sourceBars.length) return aside ? <>{aside}</> : null;

  return (
    <>
      {/* Each chart gets its own card so every bar and label has room. */}
      <Panel
        title="Average Depth by Area"
        description={`The ${areaBars.length} deepest reporting areas, from live community reports. Hover a bar for the full area name.`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <MapPin size={14} />
            Live community depth intelligence
          </span>
          <Link
            href="/forecast"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
          >
            Open AI Depth Forecast & Precautions →
          </Link>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={areaBars} margin={{ top: 8, right: 12, left: 0, bottom: 8 }} barCategoryGap="22%">
              <defs>
                <linearGradient id="areaBarFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="area" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
              <YAxis unit=" m" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <Tooltip content={<DepthBarTooltip titleKey="fullArea" countKey="reports" valueLabel="Area average depth" />} />
              <Bar dataKey="averageDepthM" fill="url(#areaBarFill)" radius={[10, 10, 4, 4]} animationDuration={1300} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-5">
        <Panel
          title="Average Depth by Source Type"
          description="How deep each kind of water source reaches, averaged over every report."
          className="xl:col-span-3"
        >
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceBars} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap="28%">
                <defs>
                  <linearGradient id="sourceBarFill" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#1e3a8a" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} />
                <XAxis type="number" unit=" m" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="sourceType" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<DepthBarTooltip countKey="reports" color="#38bdf8" />} />
                <Bar dataKey="averageDepthM" fill="url(#sourceBarFill)" radius={[4, 10, 10, 4]} animationDuration={1300} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        {aside && <div className="xl:col-span-2 [&>section]:h-full">{aside}</div>}
      </div>
    </>
  );
}

export function FarmerDepthWorkspace({
  myReports,
  publicTrends,
  isSignedIn,
}: {
  myReports: CommunityWaterReport[];
  publicTrends: PublicAreaSourceTrend[];
  isSignedIn: boolean;
}) {
  const [horizon, setHorizon] = useState(6);
  const [selectedSourceKey, setSelectedSourceKey] = useState("");
  const [selectedAreaKey, setSelectedAreaKey] = useState("");
  const [selectedAreaSource, setSelectedAreaSource] = useState("All sources");

  const trackedSources = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        sourceId: string;
        owner: string;
        code: string;
        label: string;
        areaKey: string;
        sourceType: string;
        reports: CommunityWaterReport[];
      }
    >();
    for (const report of myReports) {
      if (!report.sourceId || !report.createdBy) continue;
      const key = `${report.createdBy}:${report.sourceId}`;
      const existing = map.get(key) ?? {
        key,
        sourceId: report.sourceId,
        owner: report.createdBy,
        code: report.sourceCode ?? `SRC-${report.sourceId.slice(0, 8).toUpperCase()}`,
        label: report.sourceLabel ?? "Tracked source",
        areaKey: normalizeAreaName(report.areaKey || report.areaName, report.address),
        sourceType: report.sourceType || "Tube well",
        reports: [],
      };
      existing.reports.push(report);
      map.set(key, existing);
    }
    return [...map.values()];
  }, [myReports]);

  const activeSource =
    trackedSources.find((s) => s.key === selectedSourceKey) ?? trackedSources[0];

  const publicAreaNames = useMemo(
    () =>
      [...new Set(publicTrends.map((row) => row.areaKey))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [publicTrends]
  );

  const activeArea =
    activeSource?.areaKey ||
    (publicAreaNames.includes(selectedAreaKey)
      ? selectedAreaKey
      : publicAreaNames[0] ?? "");

  const areaBenchmark = useMemo(
    () =>
      computeAreaDepthBenchmark(
        publicTrends,
        activeArea,
        activeSource?.sourceType
      ),
    [publicTrends, activeArea, activeSource?.sourceType]
  );

  // Personal source forecast if signed in with tracked source, otherwise public area forecast
  const sourceMonthly = useMemo(() => {
    if (!activeSource) return [];
    return aggregateSourceMonthlyDepths(
      myReports,
      activeSource.sourceId,
      activeSource.owner
    );
  }, [activeSource, myReports]);

  const areaAsInputs: DepthForecastInput[] = useMemo(
    () =>
      publicTrends
        .filter((row) => row.areaKey === activeArea && row.averageDepthM !== null)
        .map((row) => ({
          areaKey: row.areaKey,
          address: row.areaKey,
          sourceType: row.sourceType,
          depth: String(row.averageDepthM),
          sampleDate: row.sampleDay ?? row.sampleMonth ?? undefined,
        })),
    [publicTrends, activeArea]
  );

  const areaMonthly = useMemo(
    () => aggregateMonthlyDepths(areaAsInputs, activeArea, selectedAreaSource),
    [areaAsInputs, activeArea, selectedAreaSource]
  );

  const activeMonthly = activeSource ? sourceMonthly : areaMonthly;
  const projection = useMemo(
    () => forecastDepthForHorizon(activeMonthly, horizon),
    [activeMonthly, horizon]
  );

  const latestReport = activeSource?.reports[0];
  const latestScreening = latestReport ? screenWaterReport(latestReport) : undefined;
  const currentDepthM =
    activeMonthly.at(-1)?.depth ??
    (latestReport?.depth ? Number.parseFloat(latestReport.depth) : null) ??
    areaBenchmark.averageDepthM;

  const condition = useMemo(
    () =>
      evaluateSourceCondition({
        currentDepthM: Number.isFinite(currentDepthM) ? currentDepthM : null,
        projectedDepthM: projection?.projectedDepth ?? null,
        projectedChangeM: projection?.projectedChange ?? null,
        slopePerMonth: projection?.slopePerMonth ?? null,
        areaBenchmark,
        riskLevel: latestReport?.riskLevel ?? latestScreening?.riskLevel,
        flags: latestScreening?.flags,
      }),
    [
      currentDepthM,
      projection,
      areaBenchmark,
      latestReport?.riskLevel,
      latestScreening,
    ]
  );

  const toneBadge =
    condition.conditionTone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : condition.conditionTone === "amber"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-teal-50 text-teal-800 border-teal-200";

  return (
    <div className="space-y-6">
      {/* Controls & Selection */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-cyan-50/60 p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold text-indigo-800">
              <Sparkles size={13} /> Personal Well Workspace
            </span>
            <h3 className="mt-2 text-lg font-bold text-slate-900">
              {activeSource
                ? `${activeSource.code} · ${activeSource.label}`
                : "Area-Based Water Depth Prediction & Benchmark"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {activeSource
                ? "Personal timeline, AI forecast, neighborhood benchmark comparison, and tailored well precautions."
                : "Explore live groundwater depth trends by area and source type. Sign in with Email OTP to track your own well every 3 months."}
            </p>
          </div>
          {condition.diffFromAreaM !== null && (
            <div className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-right shadow-sm">
              <p className="text-[11px] font-medium text-slate-500">Vs. Area Average</p>
              <p className={`text-base font-bold ${condition.diffFromAreaM > 0.5 ? "text-red-600" : condition.diffFromAreaM < -0.5 ? "text-emerald-600" : "text-indigo-700"}`}>
                {condition.diffFromAreaM > 0 ? `+${depthM(condition.diffFromAreaM)} deeper` : `${depthM(Math.abs(condition.diffFromAreaM))} shallower`}
              </p>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {trackedSources.length > 0 ? (
            <label className="text-xs font-semibold text-slate-600 lg:col-span-2">
              Your Tracked Source
              <select
                value={activeSource?.key ?? ""}
                onChange={(e) => setSelectedSourceKey(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
              >
                {trackedSources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.code} · {s.label} ({s.sourceType} · {s.areaKey})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="text-xs font-semibold text-slate-600">
                Select Area
                <select
                  value={activeArea}
                  onChange={(e) => setSelectedAreaKey(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
                  disabled={!publicAreaNames.length}
                >
                  {!publicAreaNames.length && <option value="">No area data yet</option>}
                  {publicAreaNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Source Type
                <select
                  value={selectedAreaSource}
                  onChange={(e) => setSelectedAreaSource(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
                >
                  <option>All sources</option>
                  {areaBenchmark.bySource.map((s) => (
                    <option key={s.sourceType}>{s.sourceType}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="text-xs font-semibold text-slate-600">
            Prediction Horizon
            <select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option value={3}>Next 3 months</option>
              <option value={6}>Next 6 months</option>
              <option value={12}>Next 12 months</option>
              <option value={36}>Next 3 years (36 mo)</option>
              <option value={60}>Next 5 years (60 mo)</option>
              <option value={84}>Next 7 years (84 mo)</option>
            </select>
          </label>

          <div className="flex items-end">
            <Link
              href={isSignedIn ? "/reports" : "/login?role=user"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus size={16} />
              {isSignedIn ? "Log 3-Month Reading" : "Sign in to Track"}
            </Link>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">Current Depth</p>
            <p className="mt-1.5 text-2xl font-bold text-slate-900">
              {currentDepthM !== null ? `${depthM(currentDepthM)}` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {activeSource ? `${activeSource.sourceType} · ${activeSource.reports.length} readings` : activeArea || "Area"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">AI Projected ({formatHorizonLabel(horizon)})</p>
            <p className="mt-1.5 text-2xl font-bold text-blue-700">
              {projection ? `${depthM(projection.projectedDepth)}` : "Need 2+ months"}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              {projection ? (
                <>
                  {projection.projectedChange > 0.05 ? (
                    <ArrowDownRight size={14} className="text-red-600" />
                  ) : (
                    <ArrowUpRight size={14} className="text-emerald-600" />
                  )}
                  {projection.projectedChange >= 0 ? "+" : ""}
                  {projection.projectedChange.toFixed(2)} m · {metresToFeet(projection.projectedChange).toFixed(1)} ft · {projection.confidence} conf.
                </>
              ) : (
                "Add readings across 2+ months"
              )}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">Area Average Depth</p>
            <p className="mt-1.5 text-2xl font-bold text-slate-900">
              {condition.areaAverageM !== null ? `${depthM(condition.areaAverageM)}` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {areaBenchmark.totalReports} reports in {activeArea || "area"}
            </p>
          </div>

          <div className={`rounded-xl border p-4 ${toneBadge}`}>
            <p className="text-xs font-medium opacity-80">Source Condition</p>
            <p className="mt-1.5 text-2xl font-bold">{condition.conditionLabel}</p>
            <p className="mt-1 text-xs opacity-90">
              {condition.diffFromAreaM !== null
                ? `${condition.diffFromAreaM >= 0 ? "+" : ""}${depthM(condition.diffFromAreaM)} vs area avg`
                : "Based on available trend"}
            </p>
          </div>
        </div>
      </div>

      {/* Main Infographic + AI Forecast Grid */}
      <div className="grid gap-6 xl:grid-cols-3">
        <WellCrossSectionInfographic
          currentDepthM={currentDepthM}
          projectedDepthM={projection?.projectedDepth ?? null}
          areaAverageM={condition.areaAverageM}
          horizonMonths={horizon}
          sourceLabel={
            activeSource
              ? `${activeSource.label} (${activeSource.sourceType})`
              : `${activeArea || "Area"} · ${selectedAreaSource}`
          }
        />

        <Panel
          title="AI Trend & Depth Timeline"
          description="Historical depth readings (e.g., every 3 months) and fitted AI linear projection with uncertainty band."
          className="xl:col-span-2"
        >
          {projection ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 font-semibold text-teal-800">
                  <BrainCircuit size={14} />
                  {projection.status} · {Math.abs(projection.slopePerMonth * 12).toFixed(2)} m/yr · {metresToFeet(Math.abs(projection.slopePerMonth * 12)).toFixed(1)} ft/yr
                </span>
                <span>R² {projection.rSquared.toFixed(2)} · {projection.monthlyPoints.length} months of history</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={projection.chart}
                    margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" minTickGap={28} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis reversed domain={["auto", "auto"]} unit=" m" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip
                      content={<DepthTrendTooltip actualLabel="Recorded" lastMonth={projection.lastMonth} />}
                      cursor={{ stroke: "#14b8a6", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                    />
                    <ReferenceLine x={projection.lastMonth} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Area dataKey="lower" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
                    <Area dataKey="band" stackId="band" stroke="none" fill="#38bdf8" fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Recorded"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={projection.monthlyPoints.length <= 24 ? { r: 3.5, fill: "#0d9488" } : false}
                      activeDot={{ r: 5, fill: "#0d9488" }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="projected"
                      name="AI Projected"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={horizon <= 12 ? { r: 3.5, fill: "#2563eb" } : false}
                      activeDot={{ r: 5, fill: "#2563eb" }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl bg-indigo-50/50 p-6 text-center">
              <AlertTriangle size={24} className="mb-2 text-amber-600" />
              <p className="font-semibold text-slate-800">
                At least 2 readings from different months are needed for AI prediction
              </p>
              <p className="mt-1 max-w-md text-xs leading-5 text-slate-600">
                {activeSource
                  ? `Currently found ${activeSource.reports.length} reading(s) across ${activeMonthly.length} distinct month(s) for ${activeSource.code} (${activeSource.label}). If you logged multiple readings in the same month or under different source IDs, add readings across 2+ different months under the same source ID.`
                  : "Log your water depth every 3 months under the same source ID. Once 2+ distinct months are recorded, the trend line and future depth prediction will appear here automatically."}
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* Location-Based Source Comparison & Precautions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={`Area Benchmark by Source Type · ${activeArea || "Area"}`}
          description="Average depth by water source type compared against the overall area baseline."
        >
          {areaBenchmark.bySource.length ? (
            <div className="space-y-4">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={areaBenchmark.bySource} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="sourceType" tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis unit=" m" domain={[0, "auto"]} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip content={<DepthBarTooltip countKey="reportCount" />} />
                    {areaBenchmark.averageDepthM !== null && (
                      <ReferenceLine
                        y={areaBenchmark.averageDepthM}
                        stroke="#6366f1"
                        strokeDasharray="4 4"
                        label={{
                          value: `Area Avg ${depthM(areaBenchmark.averageDepthM)}`,
                          position: "insideTopRight",
                          fill: "#4338ca",
                          fontSize: 11,
                        }}
                      />
                    )}
                    <Bar dataKey="averageDepthM" barSize={42} radius={[8, 8, 0, 0]}>
                      {areaBenchmark.bySource.map((entry, idx) => {
                        const palette = ["#4f46e5", "#0d9488", "#0284c7", "#d97706", "#059669"];
                        return <Cell key={entry.sourceType} fill={palette[idx % palette.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {areaBenchmark.bySource.map((item, idx) => {
                  const palette = ["bg-indigo-600", "bg-teal-600", "bg-sky-600", "bg-amber-600", "bg-emerald-600"];
                  return (
                    <div
                      key={item.sourceType}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${palette[idx % palette.length]}`} />
                        <div>
                          <p className="font-semibold text-slate-800">{item.sourceType}</p>
                          <p className="text-slate-500">{item.reportCount} reports</p>
                        </div>
                      </div>
                      <span className="font-bold text-indigo-700">{depthM(item.averageDepthM)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
              No area source depth benchmarks available for this location yet.
            </div>
          )}
        </Panel>

        <Panel
          title="Condition Summary & Recommended Precautions"
          description="Practical steps based on your water depth trend, area average, and quality flags."
        >
          <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3.5 text-sm ${toneBadge}`}>
            {condition.conditionTone === "red" ? (
              <TrendingDown size={20} className="mt-0.5 shrink-0" />
            ) : condition.conditionTone === "amber" ? (
              <ShieldAlert size={20} className="mt-0.5 shrink-0" />
            ) : (
              <TrendingUp size={20} className="mt-0.5 shrink-0" />
            )}
            <p className="leading-6">{condition.summary}</p>
          </div>

          <div className="space-y-3">
            {condition.precautions.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-slate-200 bg-white p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {item.priority === "high" ? (
                      <AlertTriangle size={15} className="text-red-600" />
                    ) : item.priority === "medium" ? (
                      <Droplets size={15} className="text-amber-600" />
                    ) : (
                      <CheckCircle2 size={15} className="text-teal-600" />
                    )}
                    {item.title}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      item.priority === "high"
                        ? "bg-red-50 text-red-700"
                        : item.priority === "medium"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-teal-50 text-teal-700"
                    }`}
                  >
                    {item.priority === "high" ? "Urgent" : item.priority === "medium" ? "Precaution" : "Tip"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function UniversalAreaDepthForecast({
  publicTrends,
  isSignedIn,
}: {
  publicTrends: PublicAreaSourceTrend[];
  isSignedIn: boolean;
}) {
  const [horizon, setHorizon] = useState(6);
  const [selectedAreaKey, setSelectedAreaKey] = useState("");
  const [selectedSourceType, setSelectedSourceType] = useState("All sources");

  const areaSummaries = useMemo(() => {
    const areaNames = [...new Set(publicTrends.map((row) => row.areaKey))].sort((a, b) =>
      a.localeCompare(b)
    );

    return areaNames.map((areaKey) => {
      const benchmark = computeAreaDepthBenchmark(publicTrends, areaKey);
      const inputs: DepthForecastInput[] = publicTrends
        .filter((row) => row.areaKey === areaKey && row.averageDepthM !== null)
        .map((row) => ({
          areaKey: row.areaKey,
          address: row.areaKey,
          sourceType: row.sourceType,
          depth: String(row.averageDepthM),
          sampleDate: row.sampleDay ?? row.sampleMonth ?? undefined,
        }));
      const monthly = aggregateMonthlyDepths(inputs, areaKey, "All sources");
      const projection = forecastDepthForHorizon(monthly, horizon);
      const rowsForArea = publicTrends.filter((row) => row.areaKey === areaKey);
      const totalHigh = rowsForArea.reduce((s, r) => s + r.highCount, 0);
      const totalMod = rowsForArea.reduce((s, r) => s + r.moderateCount, 0);
      const areaRiskLevel =
        totalHigh > 0 ? "High concern" : totalMod > 0 ? "Moderate concern" : "Normal";
      const condition = evaluateSourceCondition({
        currentDepthM: monthly.at(-1)?.depth ?? benchmark.averageDepthM,
        projectedDepthM: projection?.projectedDepth ?? null,
        projectedChangeM: projection?.projectedChange ?? null,
        slopePerMonth: projection?.slopePerMonth ?? null,
        areaBenchmark: benchmark,
        riskLevel: areaRiskLevel,
      });

      return {
        areaKey,
        benchmark,
        projection,
        condition,
        latestDepth: monthly.at(-1)?.depth ?? benchmark.averageDepthM,
      };
    });
  }, [publicTrends, horizon]);

  const activeArea =
    areaSummaries.some((a) => a.areaKey === selectedAreaKey)
      ? selectedAreaKey
      : areaSummaries[0]?.areaKey ?? "";

  const activeBenchmark = useMemo(
    () =>
      computeAreaDepthBenchmark(
        publicTrends,
        activeArea,
        selectedSourceType === "All sources" ? undefined : selectedSourceType
      ),
    [publicTrends, activeArea, selectedSourceType]
  );

  const areaInputs: DepthForecastInput[] = useMemo(
    () =>
      publicTrends
        .filter((row) => row.areaKey === activeArea && row.averageDepthM !== null)
        .map((row) => ({
          areaKey: row.areaKey,
          address: row.areaKey,
          sourceType: row.sourceType,
          depth: String(row.averageDepthM),
          sampleDate: row.sampleDay ?? row.sampleMonth ?? undefined,
        })),
    [publicTrends, activeArea]
  );

  const areaMonthly = useMemo(
    () => aggregateMonthlyDepths(areaInputs, activeArea, selectedSourceType),
    [areaInputs, activeArea, selectedSourceType]
  );

  const projection = useMemo(
    () => forecastDepthForHorizon(areaMonthly, horizon),
    [areaMonthly, horizon]
  );

  const currentDepthM =
    areaMonthly.at(-1)?.depth ??
    (selectedSourceType === "All sources"
      ? activeBenchmark.averageDepthM
      : activeBenchmark.sameSourceAverageM ?? activeBenchmark.averageDepthM);

  const activeRows = publicTrends.filter((r) => r.areaKey === activeArea);
  const activeHigh = activeRows.reduce((s, r) => s + r.highCount, 0);
  const activeMod = activeRows.reduce((s, r) => s + r.moderateCount, 0);
  const activeRiskLevel =
    activeHigh > 0 ? "High concern" : activeMod > 0 ? "Moderate concern" : "Normal";

  const condition = useMemo(
    () =>
      evaluateSourceCondition({
        currentDepthM: currentDepthM ?? null,
        projectedDepthM: projection?.projectedDepth ?? null,
        projectedChangeM: projection?.projectedChange ?? null,
        slopePerMonth: projection?.slopePerMonth ?? null,
        areaBenchmark: activeBenchmark,
        riskLevel: activeRiskLevel,
      }),
    [currentDepthM, projection, activeBenchmark, activeRiskLevel]
  );

  const toneBadge =
    condition.conditionTone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : condition.conditionTone === "amber"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-teal-50 text-teal-800 border-teal-200";

  return (
    <div className="space-y-6">
      {/* Area Criticality Directory for Organizations & Public */}
      <Panel
        title="All Areas Trend & Criticality Overview"
        description="Aggregated from every user's reports across Pakistan. Click any area to inspect its detailed depth trend, source averages, and precautions."
      >
        {areaSummaries.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
            No area depth summaries available yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="pb-3 pl-3 font-medium">Area / Location</th>
                  <th className="pb-3 font-medium">Total Reports</th>
                  <th className="pb-3 font-medium">Area Avg Depth</th>
                  <th className="pb-3 font-medium">+{formatHorizonLabel(horizon)} Forecast</th>
                  <th className="pb-3 font-medium">Trend Rate</th>
                  <th className="pb-3 font-medium">Area Condition</th>
                </tr>
              </thead>
              <tbody>
                {areaSummaries.map((item) => {
                  const selected = item.areaKey === activeArea;
                  const pillClass =
                    item.condition.conditionTone === "red"
                      ? "bg-red-50 text-red-700"
                      : item.condition.conditionTone === "amber"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-teal-50 text-teal-700";
                  return (
                    <tr
                      key={item.areaKey}
                      onClick={() => {
                        setSelectedAreaKey(item.areaKey);
                        setSelectedSourceType("All sources");
                      }}
                      data-selected={selected || undefined}
                      className="aqua-row cursor-pointer border-b border-slate-200/60 last:border-0"
                    >
                      <td className="py-3.5 font-semibold text-slate-800">{item.areaKey}</td>
                      <td className="py-3.5 text-slate-600">{item.benchmark.totalReports}</td>
                      <td className="py-3.5 font-semibold text-slate-800">
                        {item.latestDepth !== null ? `${depthM(item.latestDepth)}` : "—"}
                      </td>
                      <td className="py-3.5 font-semibold text-blue-700">
                        {item.projection ? `${depthM(item.projection.projectedDepth)}` : "Need 2+ mo"}
                      </td>
                      <td className="py-3.5 text-xs text-slate-500">
                        {item.projection
                          ? rateM(item.projection.slopePerMonth * 12)
                          : "—"}
                      </td>
                      <td className="py-3.5">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass}`}>
                          {item.condition.conditionLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Selected Area Controls + KPIs */}
      <Panel
        title={`Area Intelligence: ${activeArea || "Select an Area"}`}
        description="Combined average and AI trend across all submitted sources in this area."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Area / Location
            <select
              value={activeArea}
              onChange={(e) => {
                setSelectedAreaKey(e.target.value);
                setSelectedSourceType("All sources");
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
              disabled={!areaSummaries.length}
            >
              {!areaSummaries.length && <option value="">No area data</option>}
              {areaSummaries.map((a) => (
                <option key={a.areaKey} value={a.areaKey}>
                  {a.areaKey} ({a.benchmark.totalReports} reports)
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-600">
            Source Type Filter
            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option>All sources</option>
              {activeBenchmark.bySource.map((s) => (
                <option key={s.sourceType}>{s.sourceType}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-600">
            Forecast Horizon
            <select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option value={3}>Next 3 months</option>
              <option value={6}>Next 6 months</option>
              <option value={12}>Next 12 months</option>
              <option value={36}>Next 3 years (36 mo)</option>
              <option value={60}>Next 5 years (60 mo)</option>
              <option value={84}>Next 7 years (84 mo)</option>
            </select>
          </label>

          <div className="flex items-end">
            <Link
              href={isSignedIn ? "/my-sources" : "/login?role=user"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              {isSignedIn ? "Open My Personal Sources →" : "Sign in for Personal Forecast"}
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">Area Average Depth</p>
            <p className="mt-1.5 text-2xl font-bold text-slate-900">
              {currentDepthM !== null && currentDepthM !== undefined ? `${depthM(currentDepthM)}` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {activeBenchmark.totalReports} total reports · {selectedSourceType}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">AI Projected ({formatHorizonLabel(horizon)})</p>
            <p className="mt-1.5 text-2xl font-bold text-blue-700">
              {projection ? `${depthM(projection.projectedDepth)}` : "Need 2+ months"}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              {projection ? (
                <>
                  {projection.projectedChange > 0.05 ? (
                    <ArrowDownRight size={14} className="text-red-600" />
                  ) : (
                    <ArrowUpRight size={14} className="text-emerald-600" />
                  )}
                  {projection.projectedChange >= 0 ? "+" : ""}
                  {projection.projectedChange.toFixed(2)} m · {metresToFeet(projection.projectedChange).toFixed(1)} ft · {projection.confidence} conf.
                </>
              ) : (
                "Needs readings across 2+ months"
              )}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">Trend Status</p>
            <p className="mt-1.5 text-lg font-bold text-slate-900">
              {projection ? projection.status : "Baseline building"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {projection ? `${Math.abs(projection.slopePerMonth * 12).toFixed(2)} m/yr · ${metresToFeet(Math.abs(projection.slopePerMonth * 12)).toFixed(1)} ft/yr rate` : "Awaiting more dates"}
            </p>
          </div>

          <div className={`rounded-xl border p-4 ${toneBadge}`}>
            <p className="text-xs font-medium opacity-80">Area Condition</p>
            <p className="mt-1.5 text-2xl font-bold">{condition.conditionLabel}</p>
            <p className="mt-1 text-xs opacity-90">
              {activeHigh} high · {activeMod} moderate flags
            </p>
          </div>
        </div>
      </Panel>

      {/* Infographic + Chart */}
      <div className="grid gap-6 xl:grid-cols-3">
        <WellCrossSectionInfographic
          currentDepthM={currentDepthM ?? null}
          projectedDepthM={projection?.projectedDepth ?? null}
          areaAverageM={activeBenchmark.averageDepthM}
          horizonMonths={horizon}
          sourceLabel={`${activeArea || "Area"} · ${selectedSourceType}`}
        />

        <Panel
          title="Area-Wide AI Depth Trend"
          description="Combined monthly average depth from all users in this area and projected trajectory."
          className="xl:col-span-2"
        >
          {projection ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projection.chart} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="month" minTickGap={28} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis reversed domain={["auto", "auto"]} unit=" m" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    content={<DepthTrendTooltip actualLabel="Area average" lastMonth={projection.lastMonth} />}
                    cursor={{ stroke: "#14b8a6", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                  />
                  <ReferenceLine x={projection.lastMonth} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Area dataKey="lower" stackId="u-band" stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
                  <Area dataKey="band" stackId="u-band" stroke="none" fill="#38bdf8" fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
                  <Line type="monotone" dataKey="actual" name="Area Average" stroke="#0d9488" strokeWidth={2.5} dot={projection.monthlyPoints.length <= 24 ? { r: 3.5, fill: "#0d9488" } : false} activeDot={{ r: 5, fill: "#0d9488" }} connectNulls />
                  <Line type="monotone" dataKey="projected" name="AI Projected" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="6 4" dot={horizon <= 12 ? { r: 3.5, fill: "#2563eb" } : false} activeDot={{ r: 5, fill: "#2563eb" }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl bg-slate-50 p-6 text-center">
              <AlertTriangle size={24} className="mb-2 text-amber-600" />
              <p className="font-semibold text-slate-800">
                Need readings across 2+ months for this area to project a trend
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* Source Breakdown & Area Precautions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={`Source-Type Breakdown · ${activeArea || "Area"}`}
          description="Average groundwater depth by source type across all community reports in this area."
        >
          {activeBenchmark.bySource.length ? (
            <div className="space-y-4">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeBenchmark.bySource} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="sourceType" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis unit=" m" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip content={<DepthBarTooltip countKey="reportCount" valueLabel="Area average depth" />} />
                    <Bar dataKey="averageDepthM" fill="#0d9488" radius={[8, 8, 0, 0]} animationDuration={1100} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeBenchmark.bySource.map((item) => (
                  <div key={item.sourceType} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{item.sourceType}</p>
                      <p className="text-slate-500">{item.reportCount} reports</p>
                    </div>
                    <span className="font-bold text-teal-700">{depthM(item.averageDepthM)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
              No source-type depth data available for this area yet.
            </div>
          )}
        </Panel>

        <Panel
          title="Area Action Plan & Precautions"
          description="Recommended interventions for communities, farmers, and water organizations in this area."
        >
          <div className="space-y-3">
            {condition.precautions.map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {item.priority === "high" ? (
                      <AlertTriangle size={15} className="text-red-600" />
                    ) : item.priority === "medium" ? (
                      <Droplets size={15} className="text-amber-600" />
                    ) : (
                      <CheckCircle2 size={15} className="text-teal-600" />
                    )}
                    {item.title}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      item.priority === "high"
                        ? "bg-red-50 text-red-700"
                        : item.priority === "medium"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-teal-50 text-teal-700"
                    }`}
                  >
                    {item.priority === "high" ? "Urgent" : item.priority === "medium" ? "Precaution" : "Tip"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

