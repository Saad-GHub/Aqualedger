"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  BrainCircuit,
  CheckCircle2,
  Download,
  Droplets,
  Info,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  CircleAlert,
  LineChart as LineChartIcon,
  ListChecks,
  Table2,
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
import { StatValue } from "@/components/aqualedger/animated-number";
import { tr, translatePrecaution, useLanguage } from "@/components/aqualedger/language-toggle";
import {
  translateAreaUr,
  translateConditionUr,
  translateConfidenceUr,
  translateDepthUnitsUr,
  translateSourceTypeUr,
} from "@/lib/urdu-translations";
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
  formatAxisDepthMetersAndFeet,
  formatDepthMetersAndFeet,
  meanDepth,
  normalizeAreaName,
  type DepthForecastInput,
} from "@/lib/depth-analytics";
import { screenWaterReport } from "@/lib/water-risk-screening";
import { findDistrictIntelligence } from "@/lib/district-intelligence";

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
  const lang = useLanguage();
  const values = [currentDepthM, projectedDepthM, areaAverageM].filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );
  const maxDepth = Math.max(20, ...values.map((v) => Math.ceil(v * 1.25 / 10) * 10));
  const pct = (depth: number | null) =>
    depth === null ? null : Math.min(88, Math.max(14, (depth / maxDepth) * 78 + 10));

  const rawAreaPct = pct(areaAverageM);
  const rawCurrentPct = pct(currentDepthM);
  const rawProjectedPct = pct(projectedDepthM);

  // Guarantee >= 20% vertical spacing between any two depth pills so labels never collide.
  const slots = [
    rawAreaPct !== null ? { key: "area", pct: rawAreaPct } : null,
    rawCurrentPct !== null ? { key: "current", pct: rawCurrentPct } : null,
    rawProjectedPct !== null ? { key: "projected", pct: rawProjectedPct } : null,
  ]
    .filter((s): s is { key: string; pct: number } => s !== null)
    .sort((a, b) => a.pct - b.pct);

  for (let i = 1; i < slots.length; i++) {
    if (slots[i].pct - slots[i - 1].pct < 20) {
      slots[i].pct = slots[i - 1].pct + 20;
    }
  }
  const maxSlot = slots.at(-1)?.pct ?? 0;
  if (maxSlot > 86) {
    const shift = maxSlot - 86;
    for (let i = slots.length - 1; i >= 0; i--) {
      slots[i].pct = Math.max(12, slots[i].pct - shift);
      if (i < slots.length - 1 && slots[i + 1].pct - slots[i].pct < 20) {
        slots[i].pct = Math.max(12, slots[i + 1].pct - 20);
      }
    }
  }
  const slotPct = (key: string, fallback: number | null) =>
    slots.find((s) => s.key === key)?.pct ?? fallback;

  const areaPct = rawAreaPct;
  const currentPct = rawCurrentPct;
  const projectedPct = rawProjectedPct;
  const areaLabelPct = slotPct("area", areaPct);
  const currentLabelPct = slotPct("current", currentPct);
  const projectedLabelPct = slotPct("projected", projectedPct);

  return (
    <div className="rounded-2xl border border-slate-200 bg-linear-to-b from-emerald-50/40 via-amber-50/30 to-cyan-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">
            {tr(lang, "Well Depth Cross-Section", "کنویں کی گہرائی کا خاکہ")}
          </p>
          <p className="text-xs text-slate-500">{sourceLabel}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm dark:bg-[#0c1b1f] dark:text-white/90">
          {tr(lang, "Scale", "پیمانہ")}: 0 – {maxDepth} m · {asFeet(maxDepth)}
        </span>
      </div>

      <div className="relative h-64 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Ground surface */}
        <div className="absolute inset-x-0 top-0 flex h-7 items-center justify-between border-b-2 border-emerald-500 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800 dark:border-emerald-400/70 dark:bg-emerald-500/15 dark:text-emerald-300">
          <span>{tr(lang, "Ground Level (0 m)", "زمینی سطح (0 میٹر)")}</span>
          <span>{tr(lang, "Surface", "سطح")}</span>
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
              className="absolute inset-x-0 bottom-0 bg-linear-to-b from-cyan-400/70 to-teal-600/80 transition-all"
              style={{ top: `${currentPct}%` }}
            />
          )}
        </div>

        {/* Area Average Marker & Pill (Left) */}
        {areaPct !== null && areaAverageM !== null && (
          <>
            <div
              className="absolute inset-x-3 border-t-2 border-dashed border-slate-500 dark:border-slate-400"
              style={{ top: `${areaPct}%` }}
            />
            <span
              style={{ top: `${areaLabelPct}%` }}
              className="absolute left-3 z-10 inline-flex -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0b1f3a] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm ring-1 ring-white/20"
            >
              {tr(lang, "Area Avg", "علاقائی اوسط")}: {depthM(areaAverageM)}
            </span>
          </>
        )}

        {/* Current Depth Marker & Pill (Left) */}
        {currentPct !== null && currentDepthM !== null && (
          <>
            <div
              className="absolute inset-x-3 border-t-2 border-teal-600"
              style={{ top: `${currentPct}%` }}
            />
            <span
              style={{ top: `${currentLabelPct}%` }}
              className="absolute left-3 z-20 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0d9488] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
            >
              {tr(lang, "Current", "موجودہ")}: {depthM(currentDepthM)}
            </span>
          </>
        )}

        {/* Projected Depth Marker & Pill (Right) */}
        {projectedPct !== null && projectedDepthM !== null && (
          <>
            <div
              className="absolute inset-x-3 border-t-2 border-dotted border-blue-600"
              style={{ top: `${projectedPct}%` }}
            />
            <span
              style={{ top: `${projectedLabelPct}%` }}
              className="absolute right-3 z-30 -translate-y-1/2 whitespace-nowrap rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
            >
              +{formatHorizonLabel(horizonMonths)} {tr(lang, "Forecast", "پیشگوئی")}: {depthM(projectedDepthM)}
            </span>
          </>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center text-[11px]">
        <div className="rounded-lg border border-slate-200/70 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-[#0c1b1f]">
          <span className="block text-[10px] text-slate-500 dark:text-white/70">{tr(lang, "Area Avg", "علاقائی اوسط")}</span>
          <strong className="text-slate-900 dark:text-white">{areaAverageM !== null ? depthM(areaAverageM) : "—"}</strong>
        </div>
        <div className="rounded-lg border border-teal-200/70 bg-white px-2 py-1.5 dark:border-teal-500/30 dark:bg-[#0c1b1f]">
          <span className="block text-[10px] text-teal-700 dark:text-teal-300">{tr(lang, "Current", "موجودہ")}</span>
          <strong className="text-teal-800 dark:text-white">{currentDepthM !== null ? depthM(currentDepthM) : "—"}</strong>
        </div>
        <div className="rounded-lg border border-blue-200/70 bg-white px-2 py-1.5 dark:border-blue-500/30 dark:bg-[#0c1b1f]">
          <span className="block text-[10px] text-blue-700 dark:text-sky-300">+{formatHorizonLabel(horizonMonths)}</span>
          <strong className="text-blue-700 dark:text-white">{projectedDepthM !== null ? depthM(projectedDepthM) : "—"}</strong>
        </div>
      </div>
    </div>
  );
}

export function TopAreasDepthPanel({ trends }: { trends: PublicAreaSourceTrend[] }) {
  const router = useRouter();
  const lang = useLanguage();
  const areaBars = useMemo(() => {
    const groups = new Map<string, { total: number; count: number }>();
    for (const row of trends) {
      if (row.averageDepthM === null) continue;
      const g = groups.get(row.areaKey) ?? { total: 0, count: 0 };
      g.total += row.averageDepthM * row.reportCount;
      g.count += row.reportCount;
      groups.set(row.areaKey, g);
    }
    return [...groups.entries()]
      .map(([area, g]) => ({
        area: (() => {
          const short = translateAreaUr(lang, area.split(",")[0].trim());
          return short.length > 14 ? `${short.slice(0, 13)}…` : short;
        })(),
        fullArea: translateAreaUr(lang, area),
        rawArea: area,
        averageDepthM: meanDepth(g.total, g.count) ?? 0,
        reports: g.count,
      }))
      .sort((a, b) => b.averageDepthM - a.averageDepthM)
      .slice(0, 10);
  }, [trends, lang]);

  return (
    <Panel
      title={tr(lang, "Average Depth by Area (Top 10)", "علاقے کے لحاظ سے اوسط گہرائی (ٹاپ 10)")}
      description={tr(lang, "Click any bar to open that area's full AI depth forecast and precautions.", "کسی بھی بار پر کلک کر کے اس علاقے کی مکمل AI پیشگوئی اور حفاظتی تدابیر دیکھیں۔")}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          <MapPin size={13} />
          {tr(lang, "Click a bar → Forecast", "بار پر کلک کریں ← پیشگوئی")}
        </span>
        <Link href="/forecast" className="text-xs font-semibold text-teal-700 hover:underline">
          {tr(lang, "View all areas →", "تمام علاقے دیکھیں ←")}
        </Link>
      </div>
      {areaBars.length ? (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={areaBars} layout="vertical" margin={{ top: 4, right: 20, left: 6, bottom: 4 }} barCategoryGap="22%">
              <defs>
                <linearGradient id="areaBarFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0f766e" />
                  <stop offset="100%" stopColor="#2dd4bf" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" horizontal={false} />
              <XAxis type="number" ticks={[0, 15, 30, 45, 60]} domain={[0, "dataMax"]} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="area" width={105} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, _name, item) => [`${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(Number(value)))} · ${item.payload.reports} ${tr(lang, "reports", "رپورٹس")}`, tr(lang, "Area average depth", "علاقے کی اوسط گہرائی")]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullArea ?? tr(lang, "Area", "علاقہ")}
              />
              <Bar
                dataKey="averageDepthM"
                fill="url(#areaBarFill)"
                radius={[4, 10, 10, 4]}
                className="cursor-pointer"
                onClick={(barData) => {
                  const rawArea = (barData as unknown as { rawArea?: string; payload?: { rawArea?: string } })?.rawArea
                    ?? (barData as unknown as { payload?: { rawArea?: string } })?.payload?.rawArea;
                  if (rawArea) router.push(`/forecast?area=${encodeURIComponent(rawArea)}`);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
      )}
    </Panel>
  );
}

export function SourceTypeDepthPanel({ trends }: { trends: PublicAreaSourceTrend[] }) {
  const lang = useLanguage();
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
        sourceType: translateSourceTypeUr(lang, sourceType),
        averageDepthM: meanDepth(g.total, g.count) ?? 0,
        reports: g.count,
      }))
      .sort((a, b) => b.averageDepthM - a.averageDepthM);
  }, [trends, lang]);

  return (
    <Panel
      title={tr(lang, "Average Depth by Source Type", "ذریعہ کی قسم کے لحاظ سے اوسط گہرائی")}
      description={tr(lang, "How deep each kind of water source reaches, averaged across all submitted reports.", "تمام جمع شدہ رپورٹس کے مطابق ہر قسم کے آبی ذریعے کی اوسط گہرائی۔")}
      className="h-full"
    >
      {sourceBars.length ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sourceBars} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap="26%">
              <defs>
                <linearGradient id="sourceBarFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" horizontal={false} />
              <XAxis type="number" ticks={[0, 15, 30, 45, 60]} domain={[0, "dataMax"]} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="sourceType" width={115} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value, _name, item) => [`${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(Number(value)))} · ${item.payload.reports} ${tr(lang, "reports", "رپورٹس")}`, tr(lang, "Average depth", "اوسط گہرائی")]} />
              <Bar dataKey="averageDepthM" fill="url(#sourceBarFill)" radius={[4, 10, 10, 4]} animationDuration={1200} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      )}
    </Panel>
  );
}

export function SourceTypeDepthSummary({ trends }: { trends: PublicAreaSourceTrend[] }) {
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
      .sort((a, b) => b.averageDepthM - a.averageDepthM)
      .slice(0, 4);
  }, [trends]);

  if (!sourceBars.length) return null;
  const maxDepth = Math.max(1, ...sourceBars.map((s) => s.averageDepthM));

  return (
    <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-200">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Average Depth by Source Type
      </p>
      <div className="space-y-2.5">
        {sourceBars.map((item) => (
          <div key={item.sourceType} className="text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700 dark:text-slate-700">
                {item.sourceType} <span className="text-slate-400">({item.reports})</span>
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-700">
                {formatDepthMetersAndFeet(item.averageDepthM)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${Math.min(100, (item.averageDepthM / maxDepth) * 100)}%` }}
              />
            </div>
          </div>
        ))}
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
  const lang = useLanguage();
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
          const short = translateAreaUr(lang, area.split(",")[0].trim());
          return short.length > 14 ? `${short.slice(0, 13)}…` : short;
        })(),
        fullArea: translateAreaUr(lang, area),
        rawArea: area,
        averageDepthM: meanDepth(g.total, g.count) ?? 0,
        reports: g.count,
      }))
      .sort((a, b) => b.averageDepthM - a.averageDepthM)
      .slice(0, 10);
  }, [trends, lang]);

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
        sourceType: translateSourceTypeUr(lang, sourceType),
        averageDepthM: meanDepth(g.total, g.count) ?? 0,
        reports: g.count,
      }))
      .sort((a, b) => b.averageDepthM - a.averageDepthM);
  }, [trends, lang]);

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
              <YAxis width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, _name, item) => [`${formatDepthMetersAndFeet(Number(value))} · ${item.payload.reports} reports`, "Area average depth"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullArea ?? "Area"}
              />
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
                <XAxis type="number" ticks={[0, 15, 30, 45, 60]} domain={[0, "dataMax"]} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="sourceType" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, _name, item) => [`${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(Number(value)))} · ${item.payload.reports} ${tr(lang, "reports", "رپورٹس")}`, tr(lang, "Average depth", "اوسط گہرائی")]} />
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
  const lang = useLanguage();
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

  const districtIntel = useMemo(
    () => (activeArea ? findDistrictIntelligence(activeArea) : null),
    [activeArea]
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
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-cyan-50/60 p-5 shadow-sm dark:border-indigo-500/30 dark:bg-none dark:bg-[#0c1b1f]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200">
              <Sparkles size={13} /> {tr(lang, "Personal Well Workspace", "ذاتی کنویں کا ورک اسپیس")}
            </span>
            <h3 className="mt-2 text-lg font-bold text-slate-900">
              {activeSource
                ? `${activeSource.code} · ${translateSourceTypeUr(lang, activeSource.label)}`
                : tr(lang, "Area-Based Water Depth Prediction & Benchmark", "علاقے کی بنیاد پر پانی کی گہرائی کی پیشگوئی اور معیار")}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {activeSource
                ? tr(lang, "Personal timeline, AI forecast, neighborhood benchmark comparison, and tailored well precautions.", "ذاتی ٹائم لائن، AI پیشگوئی، علاقائی اوسط سے موازنہ اور حفاظتی تدابیر۔")
                : tr(lang, "Explore live groundwater depth trends by area and source type. Sign in to track your own well every 3 months.", "علاقے اور ذریعے کے لحاظ سے پانی کی گہرائی کے رجحانات دیکھیں۔ اپنے کنویں کو ٹریک کرنے کے لیے سائن ان کریں۔")}
            </p>
          </div>
          {condition.diffFromAreaM !== null && (
            <div className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-end shadow-sm">
              <p className="text-[11px] font-medium text-slate-500">{tr(lang, "Vs. Area Average", "علاقائی اوسط سے موازنہ")}</p>
              <p className={`text-base font-bold ${condition.diffFromAreaM > 0.5 ? "text-red-600" : condition.diffFromAreaM < -0.5 ? "text-emerald-600" : "text-indigo-700"}`}>
                {condition.diffFromAreaM > 0
                  ? `+${translateDepthUnitsUr(lang, depthM(condition.diffFromAreaM))} ${tr(lang, "deeper", "زیادہ گہرا")}`
                  : `${translateDepthUnitsUr(lang, depthM(Math.abs(condition.diffFromAreaM)))} ${tr(lang, "shallower", "کم گہرا")}`}
              </p>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {trackedSources.length > 0 ? (
            <label className="text-xs font-semibold text-slate-600 lg:col-span-2">
              {tr(lang, "Your Tracked Source", "آپ کا ٹریک شدہ ذریعہ")}
              <select
                value={activeSource?.key ?? ""}
                onChange={(e) => setSelectedSourceKey(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
              >
                {trackedSources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.code} · {translateSourceTypeUr(lang, s.label)} ({translateSourceTypeUr(lang, s.sourceType)} · {translateAreaUr(lang, s.areaKey)})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="text-xs font-semibold text-slate-600">
                {tr(lang, "Select Area", "علاقہ منتخب کریں")}
                <select
                  value={activeArea}
                  onChange={(e) => setSelectedAreaKey(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
                  disabled={!publicAreaNames.length}
                >
                  {!publicAreaNames.length && <option value="">{tr(lang, "No area data yet", "ابھی علاقائی ڈیٹا موجود نہیں")}</option>}
                  {publicAreaNames.map((name) => (
                    <option key={name} value={name}>
                      {translateAreaUr(lang, name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                {tr(lang, "Source Type", "ذریعہ کی قسم")}
                <select
                  value={selectedAreaSource}
                  onChange={(e) => setSelectedAreaSource(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
                >
                  <option value="All sources">{tr(lang, "All sources", "تمام ذرائع")}</option>
                  {areaBenchmark.bySource.map((s) => (
                    <option key={s.sourceType} value={s.sourceType}>{translateSourceTypeUr(lang, s.sourceType)}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="text-xs font-semibold text-slate-600">
            {tr(lang, "Prediction Horizon", "پیشگوئی کی مدت")}
            <select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option value={3}>{tr(lang, "Next 3 months", "اگلے 3 ماہ")}</option>
              <option value={6}>{tr(lang, "Next 6 months", "اگلے 6 ماہ")}</option>
              <option value={12}>{tr(lang, "Next 12 months", "اگلے 12 ماہ")}</option>
              <option value={36}>{tr(lang, "Next 3 years (36 mo)", "اگلے 3 سال (36 ماہ)")}</option>
              <option value={60}>{tr(lang, "Next 5 years (60 mo)", "اگلے 5 سال (60 ماہ)")}</option>
              <option value={84}>{tr(lang, "Next 7 years (84 mo)", "اگلے 7 سال (84 ماہ)")}</option>
            </select>
          </label>

          <div className="flex items-end">
            <Link
              href={isSignedIn ? "/reports" : "/login?role=user"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus size={16} />
              {isSignedIn ? tr(lang, "Log 3-Month Reading", "3 ماہ کی ریڈنگ درج کریں") : tr(lang, "Sign in to Track", "ٹریک کرنے کے لیے سائن ان کریں")}
            </Link>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">{tr(lang, "Current Depth", "موجودہ گہرائی")}</p>
            <p className="mt-1.5 text-xl font-bold text-slate-900">
              {currentDepthM !== null ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(currentDepthM)) : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {activeSource ? `${translateSourceTypeUr(lang, activeSource.sourceType)} · ${activeSource.reports.length} ${tr(lang, "readings", "ریڈنگز")}` : translateAreaUr(lang, activeArea) || tr(lang, "Area", "علاقہ")}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">{tr(lang, "AI Projected", "AI متوقع گہرائی")} ({formatHorizonLabel(horizon)})</p>
            <p className="mt-1.5 text-xl font-bold text-blue-700">
              {projection ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(projection.projectedDepth)) : tr(lang, "Need 2+ months", "2+ ماہ درکار")}
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
                  {translateDepthUnitsUr(lang, formatDepthMetersAndFeet(projection.projectedChange, 2))} · {translateConfidenceUr(lang, projection.confidence)} {tr(lang, "conf.", "اعتماد")}
                </>
              ) : (
                tr(lang, "Add readings across 2+ months", "کم از کم 2 مختلف مہینوں کی ریڈنگز درج کریں")
              )}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs text-slate-500">{tr(lang, "Area Average Depth", "علاقائی اوسط گہرائی")}</p>
            <p className="mt-1.5 text-xl font-bold text-slate-900">
              {condition.areaAverageM !== null ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(condition.areaAverageM)) : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {areaBenchmark.totalReports} {tr(lang, `reports in ${activeArea || "area"}`, `رپورٹس (${translateAreaUr(lang, activeArea) || "علاقہ"})`)}
            </p>
          </div>

          <div className={`rounded-xl border p-4 ${toneBadge}`}>
            <p className="text-xs font-medium opacity-80">{tr(lang, "Source Condition", "ذریعے کی صورتحال")}</p>
            <p className="mt-1.5 text-2xl font-bold">{translateConditionUr(lang, condition.conditionLabel)}</p>
            <p className="mt-1 text-xs opacity-90">
              {condition.diffFromAreaM !== null
                ? `${condition.diffFromAreaM >= 0 ? "+" : ""}${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(condition.diffFromAreaM))} ${tr(lang, "vs area avg", "بمقابلہ علاقائی اوسط")}`
                : tr(lang, "Based on available trend", "دستیاب رجحان کی بنیاد پر")}
            </p>
          </div>
        </div>

        {districtIntel && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-xs dark:border-white/15 dark:bg-[#0c1b1f]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-700">
              <strong className="text-slate-900 dark:text-white">{translateAreaUr(lang, districtIntel.district)} {tr(lang, "Baseline:", "بنیادی ڈیٹا:")}</strong>
              {districtIntel.stressScore !== null && (
                <span>{tr(lang, "Stress", "آبی دباؤ")} <strong>{Math.round(districtIntel.stressScore)}/100</strong></span>
              )}
              {districtIntel.graceTrendCmYr !== null && (
                <span>GRACE 2002–26 <strong>{districtIntel.graceTrendCmYr > 0 ? "+" : ""}{districtIntel.graceTrendCmYr} {tr(lang, "cm/yr", "سینٹی میٹر/سال")}</strong></span>
              )}
              {districtIntel.rainVsNormalPct !== null && (
                <span>{tr(lang, "Rainfall", "بارش")} <strong>{districtIntel.rainVsNormalPct >= 0 ? "+" : ""}{districtIntel.rainVsNormalPct}% {tr(lang, "vs normal", "معمول کے مقابلے")}</strong></span>
              )}
              {districtIntel.arsenicPctOver10 !== null && (
                <span className={districtIntel.arsenicPctOver10 >= 15 ? "font-semibold text-red-700 dark:text-red-400" : ""}>
                  {tr(lang, "Arsenic >10 µg/L:", "آرسینک >10 µg/L:")} <strong>{districtIntel.arsenicPctOver10}%</strong>
                </span>
              )}
              {districtIntel.ecoliPctHousehold !== null && (
                <span className={districtIntel.ecoliPctHousehold >= 30 ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>
                  E. coli: <strong>{districtIntel.ecoliPctHousehold}%</strong>
                </span>
              )}
            </div>
            {((districtIntel.arsenicPctOver10 ?? 0) >= 15 || (districtIntel.ecoliPctHousehold ?? 0) >= 30) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                <ShieldAlert size={13} />
                {tr(lang, "Test/filter drinking water in this district", "اس ضلع میں پینے کا پانی ٹیسٹ/فلٹر کریں")}
              </span>
            )}
          </div>
        )}
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
              ? `${translateSourceTypeUr(lang, activeSource.label)} (${translateSourceTypeUr(lang, activeSource.sourceType)})`
              : `${translateAreaUr(lang, activeArea) || tr(lang, "Area", "علاقہ")} · ${translateSourceTypeUr(lang, selectedAreaSource)}`
          }
        />

        <Panel
          title={tr(lang, "AI Trend & Depth Timeline", "AI رجحان اور گہرائی کی ٹائم لائن")}
          description={tr(lang, "Historical depth readings (e.g., every 3 months) and fitted AI linear projection with uncertainty band.", "تاریخی گہرائی کی ریڈنگز اور AI پیشگوئی کی لکیر۔")}
          className="xl:col-span-2"
        >
          {projection ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 font-semibold text-teal-800">
                  <BrainCircuit size={14} />
                  {projection.status} · {Math.abs(projection.slopePerMonth * 12).toFixed(2)} {tr(lang, "m/yr", "میٹر/سال")} · {metresToFeet(Math.abs(projection.slopePerMonth * 12)).toFixed(1)} {tr(lang, "ft/yr", "فٹ/سال")}
                </span>
                <span>
                  R² {projection.rSquared.toFixed(2)} · {projection.monthlyPoints.length} {tr(lang, "readings", "ریڈنگز")}
                  {projection.monthlyPoints.length >= 2
                    ? ` · ${Math.max(1, (Number(projection.monthlyPoints.at(-1)!.month.slice(0, 4)) - Number(projection.monthlyPoints[0].month.slice(0, 4))) * 12 + (Number(projection.monthlyPoints.at(-1)!.month.slice(5, 7)) - Number(projection.monthlyPoints[0].month.slice(5, 7))))} ${tr(lang, "mo span", "ماہ کا دورانیہ")}`
                    : ""}
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={projection.chart}
                    margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" minTickGap={28} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis reversed width={78} domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin - 1)), (dataMax: number) => Math.ceil(dataMax + 1)]} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip
                      formatter={(value, name) =>
                        value == null
                          ? ["—", name]
                          : [translateDepthUnitsUr(lang, formatDepthMetersAndFeet(Number(value), 2)), name === "actual" ? tr(lang, "Recorded", "درج شدہ") : tr(lang, "AI Projected", "AI پیشگوئی")]
                      }
                    />
                    <ReferenceLine x={projection.lastMonth} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Area dataKey="lower" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} activeDot={false} />
                    <Area dataKey="band" stackId="band" stroke="none" fill="#38bdf8" fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name={tr(lang, "Recorded", "درج شدہ")}
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={projection.monthlyPoints.length <= 24 ? { r: 3.5, fill: "#0d9488" } : false}
                      activeDot={{ r: 5, fill: "#0d9488" }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="projected"
                      name={tr(lang, "AI Projected", "AI پیشگوئی")}
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
                {tr(lang, "At least 2 readings from different months are needed for AI prediction", "AI پیشگوئی کے لیے کم از کم 2 مختلف مہینوں کی ریڈنگز درکار ہیں")}
              </p>
              <p className="mt-1 max-w-md text-xs leading-5 text-slate-600">
                {activeSource
                  ? tr(lang, `Currently found ${activeSource.reports.length} reading(s) across ${activeMonthly.length} distinct month(s) for ${activeSource.code} (${activeSource.label}). If you logged multiple readings in the same month or under different source IDs, add readings across 2+ different months under the same source ID.`, `فی الحال ${activeSource.code} کے لیے ${activeMonthly.length} مختلف مہینے میں ${activeSource.reports.length} ریڈنگز ملی ہیں۔ AI پیشگوئی کے لیے اسی سورس آئی ڈی میں کم از کم 2 مختلف مہینوں کی ریڈنگز درج کریں۔`)
                  : tr(lang, "Log your water depth every 3 months under the same source ID. Once 2+ distinct months are recorded, the trend line and future depth prediction will appear here automatically.", "ہر 3 ماہ بعد اسی سورس آئی ڈی کے تحت گہرائی درج کریں۔ 2 مختلف مہینوں کے بعد پیشگوئی خودکار ظاہر ہو جائے گی۔")}
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* Location-Based Source Comparison & Precautions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={`${tr(lang, "Area Benchmark by Source Type", "ذریعے کی قسم کے لحاظ سے علاقائی معیار")} · ${translateAreaUr(lang, activeArea) || tr(lang, "Area", "علاقہ")}`}
          description={tr(lang, "Average depth by water source type compared against the overall area baseline.", "مجموعی علاقائی اوسط کے مقابلے میں ہر قسم کے آبی ذریعے کی اوسط گہرائی۔")}
        >
          {areaBenchmark.bySource.length ? (
            <div className="space-y-4">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={areaBenchmark.bySource.map((s) => ({ ...s, displaySourceType: translateSourceTypeUr(lang, s.sourceType) }))} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="displaySourceType" tick={{ fontSize: 11, fill: "#475569" }} />
                    <YAxis width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} domain={[0, "auto"]} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip
                      formatter={(value, _name, item) => [
                        `${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(Number(value), 2))} · ${item.payload.reportCount} ${tr(lang, "reports", "رپورٹس")}`,
                        tr(lang, "Average depth", "اوسط گہرائی"),
                      ]}
                    />
                    {areaBenchmark.averageDepthM !== null && (
                      <ReferenceLine
                        y={areaBenchmark.averageDepthM}
                        stroke="#6366f1"
                        strokeDasharray="4 4"
                        label={{
                          value: `${tr(lang, "Area Avg", "علاقائی اوسط")} ${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(areaBenchmark.averageDepthM))}`,
                          position: "top",
                          fill: "#6366f1",
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
                          <p className="font-semibold text-slate-800">{translateSourceTypeUr(lang, item.sourceType)}</p>
                          <p className="text-slate-500">{item.reportCount} {tr(lang, "reports", "رپورٹس")}</p>
                        </div>
                      </div>
                      <span className="font-bold text-indigo-700">{translateDepthUnitsUr(lang, depthM(item.averageDepthM))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
              {tr(lang, "No area source depth benchmarks available for this location yet.", "اس مقام کے لیے ابھی علاقائی ذرائع کا معیار دستیاب نہیں۔")}
            </div>
          )}
        </Panel>

        <Panel
          title={tr(lang, "Condition Summary & Recommended Precautions", "صورتحال کا خلاصہ اور حفاظتی تدابیر")}
          description={tr(lang, "Practical steps based on your water depth trend, area average, and quality flags.", "آپ کے پانی کی گہرائی، علاقائی اوسط اور خطرے کی علامات پر مبنی عملی اقدامات۔")}
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
            {condition.precautions.map((item) => {
              const translated = translatePrecaution(lang, item.title, item.detail);
              return (
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
                    {translated.title}
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
                    {item.priority === "high" ? tr(lang, "Urgent", "فوری") : item.priority === "medium" ? tr(lang, "Precaution", "احتیاط") : tr(lang, "Tip", "مشورہ")}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">{translated.detail}</p>
              </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function UniversalAreaDepthForecast({
  publicTrends,
  isSignedIn,
  loading = false,
}: {
  publicTrends: PublicAreaSourceTrend[];
  isSignedIn: boolean;
  loading?: boolean;
}) {
  const lang = useLanguage();
  const [horizon, setHorizon] = useState(6);
  const [selectedAreaKey, setSelectedAreaKey] = useState("");
  const [selectedSourceType, setSelectedSourceType] = useState("All sources");
  const [areaSearch, setAreaSearch] = useState("");
  const [areaSort, setAreaSort] = useState<"alpha" | "deepest" | "falling" | "critical">("alpha");
  const [showHowAiWorks, setShowHowAiWorks] = useState(false);
  // The page is split into three views (Forecast · Sources & actions · All areas) instead of one long scroll.
  const [section, setSection] = useState<"forecast" | "actions" | "areas">("forecast");
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (fromHash === "actions" || fromHash === "areas" || fromHash === "forecast") queueMicrotask(() => setSection(fromHash));
  }, []);
  const openSection = (next: "forecast" | "actions" | "areas") => {
    setSection(next);
    try {
      history.replaceState(null, "", next === "forecast" ? window.location.pathname + window.location.search : `#${next}`);
    } catch {
      // ignore
    }
  };
  const [areaAlertSaved, setAreaAlertSaved] = useState(false);

  useEffect(() => {
    const areaParam = new URLSearchParams(window.location.search).get("area");
    if (areaParam) {
      queueMicrotask(() => setSelectedAreaKey(areaParam));
    }
  }, []);

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
      const areaAvgDepth = benchmark.averageDepthM ?? monthly.at(-1)?.depth ?? null;
      const projection = forecastDepthForHorizon(monthly, horizon, areaAvgDepth);
      const rowsForArea = publicTrends.filter((row) => row.areaKey === areaKey);
      const totalHigh = rowsForArea.reduce((s, r) => s + r.highCount, 0);
      const totalMod = rowsForArea.reduce((s, r) => s + r.moderateCount, 0);
      const areaRiskLevel =
        totalHigh > 0 ? "High concern" : totalMod > 0 ? "Moderate concern" : "Normal";
      const condition = evaluateSourceCondition({
        currentDepthM: areaAvgDepth,
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
        latestDepth: areaAvgDepth,
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

  const currentDepthM =
    selectedSourceType === "All sources"
      ? (activeBenchmark.averageDepthM ?? areaMonthly.at(-1)?.depth ?? null)
      : (activeBenchmark.sameSourceAverageM ?? areaMonthly.at(-1)?.depth ?? activeBenchmark.averageDepthM);

  const projection = useMemo(
    () => forecastDepthForHorizon(areaMonthly, horizon, currentDepthM, selectedSourceType),
    [areaMonthly, horizon, currentDepthM, selectedSourceType]
  );

  const filteredReportCount =
    selectedSourceType === "All sources"
      ? activeBenchmark.totalReports
      : (activeBenchmark.bySource.find((s) => s.sourceType === selectedSourceType)?.reportCount ?? 0);

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

  const filteredDirectory = useMemo(() => {
    const q = areaSearch.trim().toLowerCase();
    let list = areaSummaries.filter((item) =>
      !q || item.areaKey.toLowerCase().includes(q)
    );
    if (areaSort === "critical") {
      list = list.filter((item) => item.condition.conditionLabel === "Critical");
    }
    return [...list].sort((a, b) => {
      if (areaSort === "deepest") return (b.latestDepth ?? -1) - (a.latestDepth ?? -1);
      if (areaSort === "falling") {
        return (b.projection?.slopePerMonth ?? -99) - (a.projection?.slopePerMonth ?? -99);
      }
      return a.areaKey.localeCompare(b.areaKey);
    });
  }, [areaSummaries, areaSearch, areaSort]);

  const exportAreaCsv = () => {
    if (!activeArea || !projection) return;
    const header = "Month,Observed Depth (m),Projected Depth (m),Lower 95% (m),Upper 95% (m)\n";
    const rows = projection.chart
      .map((pt) => `${pt.month},${pt.actual ?? ""},${pt.projected ?? ""},${pt.lower?.toFixed(2) ?? ""},${pt.upper?.toFixed(2) ?? ""}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aqualedger-forecast-${activeArea.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${horizon}mo.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Control Bar */}
      <div className="glass-strong rounded-2xl p-3.5 shadow-sm sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto] lg:items-end">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-700">
            {tr(lang, "Select Area", "علاقہ منتخب کریں")} ({areaSummaries.length})
            <select
              value={activeArea}
              onChange={(e) => {
                setSelectedAreaKey(e.target.value);
                setSelectedSourceType("All sources");
                setAreaAlertSaved(false);
              }}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-white/20 dark:bg-[#0c1b1f] dark:text-white"
              disabled={!areaSummaries.length}
            >
              {loading && !areaSummaries.length && <option value="">{tr(lang, "Loading areas…", "علاقے لوڈ ہو رہے ہیں…")}</option>}
              {!loading && !areaSummaries.length && <option value="">{tr(lang, "No area data", "کوئی علاقائی ڈیٹا نہیں")}</option>}
              {areaSummaries.map((a) => (
                <option key={a.areaKey} value={a.areaKey}>
                  {translateAreaUr(lang, a.areaKey)} ({a.benchmark.totalReports} {tr(lang, "reports", "رپورٹس")})
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-600 dark:text-slate-700">
            {tr(lang, "Source Type", "ذریعہ کی قسم")}
            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-white/20 dark:bg-[#0c1b1f] dark:text-white"
            >
              <option value="All sources">{tr(lang, "All sources", "تمام ذرائع")}</option>
              {activeBenchmark.bySource.map((s) => (
                <option key={s.sourceType} value={s.sourceType}>{translateSourceTypeUr(lang, s.sourceType)}</option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-700">
              {tr(lang, "Forecast Horizon", "پیشگوئی کی مدت")}
            </p>
            <div className="flex w-full gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/20 dark:bg-[#0c1b1f] lg:inline-flex lg:w-auto" role="group" aria-label="Forecast horizon">
              {([
                [3, "3M"],
                [6, "6M"],
                [12, "1Y"],
                [36, "3Y"],
                [60, "5Y"],
                [84, "7Y"],
              ] as const).map(([months, label]) => (
                <button
                  key={months}
                  type="button"
                  aria-pressed={horizon === months}
                  onClick={() => setHorizon(months)}
                  className={`font-data min-h-9 flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition lg:flex-none ${
                    horizon === months
                      ? "bg-teal-600 text-white shadow-xs"
                      : "text-slate-700 hover:bg-white hover:text-slate-900 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div role="tablist" aria-label={tr(lang, "Forecast sections", "پیشگوئی کے حصے")} className="glass flex gap-1 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          ["forecast", LineChartIcon, tr(lang, "Forecast", "پیشگوئی"), tr(lang, "Forecast", "پیشگوئی")],
          ["actions", ListChecks, tr(lang, "Sources & actions", "ذرائع اور اقدامات"), tr(lang, "Actions", "اقدامات")],
          ["areas", Table2, tr(lang, `All areas (${areaSummaries.length})`, `تمام علاقے (${areaSummaries.length})`), tr(lang, `Areas (${areaSummaries.length})`, `علاقے (${areaSummaries.length})`)],
        ] as const).map(([id, Icon, label, shortLabel]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={section === id}
            aria-controls={`panel-${id}`}
            onClick={() => openSection(id)}
            className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold transition sm:gap-2 sm:px-3.5 sm:text-sm ${
              section === id ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon size={16} aria-hidden="true" className="shrink-0" />
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* 2. Main Hero Grid (35% Cross-Section + Confidence | 65% AI Trend Chart + KPIs) */}
      {section === "forecast" && <div id="panel-forecast" role="tabpanel" aria-labelledby="tab-forecast" className="grid gap-6 xl:grid-cols-[minmax(0,35%)_minmax(0,65%)]">
        <div className="space-y-4">
          <WellCrossSectionInfographic
            currentDepthM={currentDepthM ?? null}
            projectedDepthM={projection?.projectedDepth ?? null}
            areaAverageM={
              selectedSourceType === "All sources"
                ? activeBenchmark.averageDepthM
                : (currentDepthM ?? activeBenchmark.averageDepthM)
            }
            horizonMonths={horizon}
            sourceLabel={`${activeArea ? translateAreaUr(lang, activeArea) : tr(lang, "Area", "علاقہ")} · ${translateSourceTypeUr(lang, selectedSourceType)}`}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                <BrainCircuit size={14} />
                {tr(lang, "Confidence", "اعتماد")}: {translateConfidenceUr(lang, projection?.confidence ?? "Low")} ({filteredReportCount} {tr(lang, "reports", "رپورٹس")})
                {projection?.backtestMaeM != null ? ` · MAE ±${projection.backtestMaeM.toFixed(2)} ${tr(lang, "m", "میٹر")}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setShowHowAiWorks((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-teal-700"
              >
                <Info size={14} />
                {tr(lang, "How AI Predicts", "AI کیسے پیشگوئی کرتا ہے")}
              </button>
            </div>

            {showHowAiWorks && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                {tr(
                  lang,
                  "Uses OLS regression blended with recent momentum, Empirical-Bayes shrinkage for sparse histories, calibrated seasonal monsoon/dry cycles, and a 95% residual standard-error confidence band.",
                  "حالیہ رجحان کے ساتھ OLS ریگریشن، کم ڈیٹا کے لیے Empirical-Bayes ایڈجسٹمنٹ، مون سون/خشک موسم کے چکر، اور 95% اعتماد کی حد استعمال کرتا ہے۔"
                )}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportAreaCsv}
                disabled={!projection}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:border-teal-500 hover:text-teal-700 disabled:opacity-50"
              >
                <Download size={14} />
                {tr(lang, "Export Area CSV", "علاقائی CSV ڈاؤن لوڈ کریں")}
              </button>
              <Link
                href={isSignedIn ? "/my-sources" : "/login?role=user"}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                {isSignedIn ? tr(lang, "My Sources →", "میرے ذرائع ←") : tr(lang, "Personal Forecast", "ذاتی پیشگوئی")}
              </Link>
            </div>
          </div>
        </div>

        <Panel
          title={`${tr(lang, "Area-Wide AI Depth Trend", "علاقائی AI گہرائی کا رجحان")} · ${activeArea ? translateAreaUr(lang, activeArea) : tr(lang, "Select an Area", "علاقہ منتخب کریں")}`}
          description={tr(lang, "Combined monthly average depth from all users in this area and projected trajectory.", "اس علاقے کے تمام صارفین سے حاصل شدہ ماہانہ اوسط گہرائی اور متوقع رجحان۔")}
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs text-slate-500">{tr(lang, "Area Average Depth", "علاقائی اوسط گہرائی")}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {currentDepthM !== null && currentDepthM !== undefined ? <StatValue value={formatDepthMetersAndFeet(currentDepthM)} /> : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {filteredReportCount} {tr(lang, filteredReportCount === 1 ? "report" : "reports", "رپورٹس")} · {selectedSourceType}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs text-slate-500">{tr(lang, "AI Projected", "AI متوقع گہرائی")} ({formatHorizonLabel(horizon)})</p>
              <p className="mt-1 text-lg font-bold text-blue-700 dark:text-sky-300">
                {projection ? <StatValue value={formatDepthMetersAndFeet(projection.projectedDepth)} /> : tr(lang, "Need 2+ months", "2+ ماہ درکار")}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                {projection ? (
                  <>
                    {projection.projectedChange > 0.05 ? (
                      <ArrowDownRight size={13} className="text-red-600" />
                    ) : (
                      <ArrowUpRight size={13} className="text-emerald-600" />
                    )}
                    {projection.projectedChange >= 0 ? "+" : ""}
                    {formatDepthMetersAndFeet(projection.projectedChange, 2)}
                  </>
                ) : (
                  tr(lang, "Needs 2+ months", "2+ ماہ کا ڈیٹا درکار ہے")
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs text-slate-500">{tr(lang, "Trend Status", "رجحان کی کیفیت")}</p>
              <p className="mt-1 text-base font-bold text-slate-900">
                {projection ? projection.status : tr(lang, "Baseline building", "بنیاد بن رہی ہے")}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {projection ? `${projection.slopePerMonth > 0 ? "+" : ""}${formatDepthMetersAndFeet(projection.slopePerMonth * 12, 2)}/yr` : tr(lang, "Awaiting dates", "تاریخوں کا انتظار")}
              </p>
            </div>

            <div className={`rounded-xl border p-3.5 ${toneBadge}`}>
              <p className="text-xs font-medium opacity-80">{tr(lang, "Area Condition", "علاقے کی حالت")}</p>
              <p className="mt-1 text-lg font-bold">{condition.conditionLabel}</p>
              <p className="mt-0.5 text-[11px] opacity-90">
                {activeHigh} {tr(lang, "high", "شدید")} · {activeMod} {tr(lang, "moderate flags", "درمیانے الرٹ")}
              </p>
            </div>
          </div>

          {loading && !publicTrends.length ? (
            <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ) : projection ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projection.chart} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="month" minTickGap={28} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis reversed width={78} domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin - 1)), (dataMax: number) => Math.ceil(dataMax + 1)]} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    formatter={(value, name) =>
                      value == null
                        ? ["—", name]
                        : [translateDepthUnitsUr(lang, formatDepthMetersAndFeet(Number(value), 2)), name === "Area Average" || name === "actual" ? tr(lang, "Area Average", "علاقائی اوسط") : tr(lang, "AI Projected", "AI پیشگوئی")]
                    }
                  />
                  <ReferenceLine x={projection.lastMonth} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Area dataKey="lower" stackId="u-band" stroke="none" fill="transparent" tooltipType="none" isAnimationActive={false} activeDot={false} />
                  <Area dataKey="band" stackId="u-band" stroke="none" fill="#38bdf8" fillOpacity={0.16} tooltipType="none" isAnimationActive={false} activeDot={false} />
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
      </div>}

      {/* 3. Source Breakdown & Actionable Precautions (2 Columns) */}
      {section === "actions" && <div id="panel-actions" role="tabpanel" aria-labelledby="tab-actions" className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={`${tr(lang, "Source-Type Breakdown", "ذرائع کی اقسام کا تجزیہ")} · ${activeArea || tr(lang, "Area", "علاقہ")}`}
          description={tr(lang, "Average groundwater depth by source type across all community reports in this area.", "اس علاقے کی تمام کمیونٹی رپورٹس میں ذریعہ کے لحاظ سے اوسط گہرائی۔")}
        >
          {activeBenchmark.bySource.length ? (
            <div className="space-y-4">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeBenchmark.bySource} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="sourceType" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip formatter={(value) => [formatDepthMetersAndFeet(Number(value)), "Area average depth"]} />
                    <Bar dataKey="averageDepthM" fill="#0d9488" radius={[6, 6, 0, 0]} />
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
                    <span className="font-bold text-teal-700">{formatDepthMetersAndFeet(item.averageDepthM)}</span>
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
          title={tr(lang, "Area Action Plan & Precautions", "علاقائی لائحہ عمل اور حفاظتی تدابیر")}
          description={tr(lang, "Recommended interventions for communities, farmers, and water organizations in this area.", "اس علاقے کے رہائشیوں، کسانوں اور واٹر اداروں کے لیے تجویز کردہ اقدامات۔")}
        >
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (activeArea) {
                  try {
                    localStorage.setItem(`aqualedger-alert-${activeArea}`, "on");
                  } catch {
                    // ignore
                  }
                  setAreaAlertSaved(true);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                areaAlertSaved
                  ? "bg-teal-50 text-teal-800 border border-teal-200"
                  : "bg-slate-900 text-white hover:bg-slate-700"
              }`}
            >
              <BellRing size={14} />
              {areaAlertSaved ? `Alerts enabled for ${activeArea}` : "Get Area Alerts"}
            </button>
          </div>
          <div className="space-y-3">
            {condition.precautions.map((item) => {
              const translated = translatePrecaution(lang, item.title, item.detail);
              const tag =
                item.priority === "high"
                  ? tr(lang, "Urgent", "فوری")
                  : item.title.toLowerCase().includes("irrigation") || item.title.toLowerCase().includes("drip")
                    ? tr(lang, "Irrigation", "آبپاشی")
                    : tr(lang, "Monitoring", "نگرانی");
              return (
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
                      {translated.title}
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
                      {tag}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{translated.detail}</p>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>}

      {/* 4. All Areas Directory / Comparison Table (At Bottom) */}
      {section === "areas" && <div id="panel-areas" role="tabpanel" aria-labelledby="tab-areas">
      <Panel
        title={tr(lang, "All Areas Trend & Criticality Overview", "تمام علاقوں کے رجحانات اور خطرے کی فہرست")}
        description={tr(lang, "Search or sort all monitored areas across Pakistan. Click any area to open its forecast.", "پاکستان بھر کے نگرانی شدہ علاقے تلاش یا ترتیب دیں۔ کسی علاقے کی پیشگوئی دیکھنے کے لیے اس پر کلک کریں۔")}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <input
              value={areaSearch}
              onChange={(e) => setAreaSearch(e.target.value)}
              placeholder={tr(lang, "Search area (e.g. Bahawalpur, Quetta)…", "علاقہ تلاش کریں (مثلاً بہاولپور، کوئٹہ)…")}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select
            aria-label="Sort areas"
            value={areaSort}
            onChange={(e) => setAreaSort(e.target.value as typeof areaSort)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-white/20 dark:bg-[#0c1b1f] dark:text-white"
          >
            <option value="alpha">{tr(lang, "Sort: A – Z", "ترتیب: A – Z")}</option>
            <option value="deepest">{tr(lang, "Sort: Deepest first", "ترتیب: سب سے گہرا پہلے")}</option>
            <option value="falling">{tr(lang, "Sort: Fastest falling", "ترتیب: تیزی سے گرتی سطح")}</option>
            <option value="critical">{tr(lang, "Filter: Critical only", "فلٹر: صرف تشویشناک")}</option>
          </select>
        </div>

        {loading && areaSummaries.length === 0 ? (
          <div className="space-y-2.5 py-2">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filteredDirectory.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
            {tr(lang, "No areas match your search or filter.", "آپ کی تلاش یا فلٹر سے کوئی علاقہ نہیں ملا۔")}
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {filteredDirectory.map((item) => {
                const selected = item.areaKey === activeArea;
                const pillClass =
                  item.condition.conditionTone === "red"
                    ? "bg-red-50 text-red-700"
                    : item.condition.conditionTone === "amber"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-teal-50 text-teal-700";
                return (
                  <button
                    key={`card-${item.areaKey}`}
                    type="button"
                    onClick={() => {
                      setSelectedAreaKey(item.areaKey);
                      setSelectedSourceType("All sources");
                      openSection("forecast");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`w-full rounded-2xl border p-4 text-start transition ${
                      selected
                        ? "border-teal-500 bg-teal-50/40 ring-1 ring-teal-500 dark:bg-teal-950/35"
                        : "border-slate-200 bg-white hover:border-teal-300 dark:border-slate-200 dark:bg-[#0c1b1f] dark:hover:border-teal-500"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-700">{translateAreaUr(lang, item.areaKey)}</p>
                        <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-700">
                          {item.benchmark.totalReports} {tr(lang, "reports", "رپورٹس")}
                        </p>
                      </div>
                      <span className={`aqua-chip shrink-0 ${pillClass}`}>
                        {item.condition.conditionTone === "red" ? <AlertTriangle size={12} aria-hidden="true" /> : item.condition.conditionTone === "amber" ? <CircleAlert size={12} aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                        {translateConditionUr(lang, item.condition.conditionLabel)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 text-xs dark:border-slate-200">
                      <div>
                        <p className="font-medium text-slate-600 dark:text-slate-700">{tr(lang, "Area Avg Depth", "علاقائی اوسط گہرائی")}</p>
                        <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                          {item.latestDepth !== null ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.latestDepth)) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-600 dark:text-slate-700">+{formatHorizonLabel(horizon)} {tr(lang, "Forecast", "پیشگوئی")}</p>
                        <p className="mt-0.5 font-semibold text-blue-700 dark:text-sky-300">
                          {item.projection ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.projection.projectedDepth)) : tr(lang, "Need 2+ mo", "2+ ماہ درکار")}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-slate-600 dark:text-slate-700">
                      {tr(lang, "Trend rate:", "رجحان کی شرح:")}{" "}
                      {item.projection
                        ? `${item.projection.slopePerMonth > 0 ? "+" : ""}${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.projection.slopePerMonth * 12, 2))}/${tr(lang, "yr", "سال")}`
                        : "—"}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-160 text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="px-3 pb-3 font-medium">{tr(lang, "Area / Location", "علاقہ / مقام")}</th>
                    <th className="px-3 pb-3 font-medium">{tr(lang, "Total Reports", "کل رپورٹس")}</th>
                    <th className="px-3 pb-3 font-medium">{tr(lang, "Area Avg Depth", "علاقائی اوسط گہرائی")}</th>
                    <th className="px-3 pb-3 font-medium">+{formatHorizonLabel(horizon)} {tr(lang, "Forecast", "پیشگوئی")}</th>
                    <th className="px-3 pb-3 font-medium">{tr(lang, "Trend Rate", "رجحان کی شرح")}</th>
                    <th className="px-3 pb-3 font-medium">{tr(lang, "Area Condition", "علاقے کی صورتحال")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDirectory.map((item) => {
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
                          openSection("forecast");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        data-selected={selected || undefined}
                        className="aqua-row cursor-pointer border-b border-slate-200/60 last:border-0"
                      >
                        <td className="px-3 py-3.5 font-semibold text-slate-800">{translateAreaUr(lang, item.areaKey)}</td>
                        <td className="font-data px-3 py-3.5 text-slate-600">{item.benchmark.totalReports}</td>
                        <td className="font-data whitespace-nowrap px-3 py-3.5 font-semibold text-slate-800">
                          {item.latestDepth !== null ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.latestDepth)) : "—"}
                        </td>
                        <td className="font-data whitespace-nowrap px-3 py-3.5 font-semibold text-blue-700">
                          {item.projection ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.projection.projectedDepth)) : tr(lang, "Need 2+ mo", "2+ ماہ درکار")}
                        </td>
                        <td className="font-data whitespace-nowrap px-3 py-3.5 text-xs text-slate-500">
                          {item.projection
                            ? `${item.projection.slopePerMonth > 0 ? "+" : ""}${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.projection.slopePerMonth * 12, 2))}/${tr(lang, "yr", "سال")}`
                            : "—"}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className={`aqua-chip ${pillClass}`}>
                            {item.condition.conditionTone === "red" ? <AlertTriangle size={12} aria-hidden="true" /> : item.condition.conditionTone === "amber" ? <CircleAlert size={12} aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                            {translateConditionUr(lang, item.condition.conditionLabel)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
      </div>}
    </div>
  );
}

