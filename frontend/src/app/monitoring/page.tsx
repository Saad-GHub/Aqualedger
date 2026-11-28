"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock,
  MapPin,
  ShieldAlert,
  TrendingDown,
  Waves,
} from "lucide-react";
import { AdminOnly, PageIntro, Panel } from "@/components/aqualedger/app-shell";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import {
  readCommunityWaterReports,
  readPublicAreaSourceTrends,
  subscribeToCommunityWaterReports,
  type CommunityWaterReport,
  type PublicAreaSourceTrend,
} from "@/lib/community-water-reports";
import {
  aggregateMonthlyDepths,
  computeAreaDepthBenchmark,
  evaluateSourceCondition,
  forecastDepthForHorizon,
  formatDepthMetersAndFeet,
  type DepthForecastInput,
} from "@/lib/depth-analytics";
import {
  translateAreaUr,
  translateConditionUr,
  translateDepthUnitsUr,
  translateSourceTypeUr,
  translateStatusUr,
} from "@/lib/urdu-translations";

type AttentionArea = {
  areaKey: string;
  averageDepthM: number | null;
  totalReports: number;
  slopePerYearM: number | null;
  projectedDepthM: number | null;
  conditionLabel: "Critical" | "Moderate" | "Normal";
  conditionTone: "red" | "amber" | "teal";
  highConcernCount: number;
};

function MonitoringDashboard() {
  const lang = useLanguage();
  const [reports, setReports] = useState<CommunityWaterReport[]>([]);
  const [publicTrends, setPublicTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attentionFilter, setAttentionFilter] = useState<"critical" | "all_flagged">("critical");

  useEffect(() => {
    const refresh = () => {
      void Promise.allSettled([
        readCommunityWaterReports(),
        readPublicAreaSourceTrends(),
      ])
        .then(([reportsRes, trendsRes]) => {
          if (reportsRes.status === "fulfilled") {
            setReports(reportsRes.value);
            setError("");
          } else {
            setError("Could not load monitoring reports.");
          }
          if (trendsRes.status === "fulfilled") {
            setPublicTrends(trendsRes.value);
          }
        })
        .finally(() => setLoading(false));
    };
    refresh();
    return subscribeToCommunityWaterReports(refresh);
  }, []);

  const attentionAreas = useMemo<AttentionArea[]>(() => {
    const areaNames = [...new Set(publicTrends.map((r) => r.areaKey))].sort((a, b) =>
      a.localeCompare(b)
    );
    return areaNames
      .map((areaKey) => {
        const benchmark = computeAreaDepthBenchmark(publicTrends, areaKey);
        const rows = publicTrends.filter((r) => r.areaKey === areaKey);
        const inputs: DepthForecastInput[] = rows
          .filter((r) => r.averageDepthM !== null)
          .map((r) => ({
            areaKey: r.areaKey,
            address: r.areaKey,
            sourceType: r.sourceType,
            depth: String(r.averageDepthM),
            sampleDate: r.sampleDay ?? r.sampleMonth ?? undefined,
          }));
        const monthly = aggregateMonthlyDepths(inputs, areaKey, "All sources");
        const areaAvgDepth = benchmark.averageDepthM ?? monthly.at(-1)?.depth ?? null;
        const projection = forecastDepthForHorizon(monthly, 6, areaAvgDepth);
        const highCount = rows.reduce((s, r) => s + r.highCount, 0);
        const modCount = rows.reduce((s, r) => s + r.moderateCount, 0);
        const condition = evaluateSourceCondition({
          currentDepthM: areaAvgDepth,
          projectedDepthM: projection?.projectedDepth ?? null,
          projectedChangeM: projection?.projectedChange ?? null,
          slopePerMonth: projection?.slopePerMonth ?? null,
          areaBenchmark: benchmark,
          riskLevel: highCount > 0 ? "High concern" : modCount > 0 ? "Moderate concern" : "Normal",
        });

        return {
          areaKey,
          averageDepthM: areaAvgDepth,
          totalReports: benchmark.totalReports,
          slopePerYearM: projection ? projection.slopePerMonth * 12 : null,
          projectedDepthM: projection?.projectedDepth ?? null,
          conditionLabel: condition.conditionLabel,
          conditionTone: condition.conditionTone,
          highConcernCount: highCount,
        };
      })
      .sort((a, b) => {
        const rank = (c: AttentionArea["conditionLabel"]) =>
          c === "Critical" ? 0 : c === "Moderate" ? 1 : 2;
        if (rank(a.conditionLabel) !== rank(b.conditionLabel)) {
          return rank(a.conditionLabel) - rank(b.conditionLabel);
        }
        return (b.averageDepthM ?? 0) - (a.averageDepthM ?? 0);
      });
  }, [publicTrends]);

  const criticalAreas = useMemo(
    () => attentionAreas.filter((a) => a.conditionLabel === "Critical"),
    [attentionAreas]
  );
  const moderateAreas = useMemo(
    () => attentionAreas.filter((a) => a.conditionLabel === "Moderate"),
    [attentionAreas]
  );
  const visibleAttention =
    attentionFilter === "critical"
      ? criticalAreas
      : attentionAreas.filter((a) => a.conditionLabel !== "Normal");

  const pendingReviewCount = useMemo(
    () => reports.filter((r) => r.status === "under_review").length,
    [reports]
  );

  const recentSources = useMemo(
    () =>
      reports.slice(0, 6).map((report) => ({
        id: report.id,
        name: report.sourceType ?? "Water source",
        location: report.address,
        level: report.depth ? formatDepthMetersAndFeet(report.depth) : "—",
        status: report.status,
      })),
    [reports]
  );

  const isInitialLoading = loading && publicTrends.length === 0 && reports.length === 0;

  return (
    <>
      <PageIntro
        eyebrow={tr(lang, "Admin Monitoring Hub", "ایڈمن مانیٹرنگ مرکز")}
        title={tr(lang, "Monitoring Data & Area Alerts", "مانیٹرنگ ڈیٹا اور علاقائی الرٹس")}
        description={tr(
          lang,
          "Monitor critical groundwater areas needing attention, recent source coverage, and system-wide health. Use Community Reports to review or moderate individual submissions.",
          "توجہ طلب تشویشناک علاقوں، حالیہ ذرائع اور پاکستان بھر کی کوریج کی نگرانی کریں۔ انفرادی رپورٹس کی تصدیق کے لیے کمیونٹی رپورٹس استعمال کریں۔"
        )}
        action={
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 self-start rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {tr(lang, "Review Community Reports", "کمیونٹی رپورٹس چیک کریں")}
            <ArrowRight size={15} />
          </Link>
        }
      />

      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </p>
      )}

      {/* Monitoring KPI Strip */}
      <div className="aqua-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="glass glass-lift rounded-3xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-500">
              {tr(lang, "Need Attention", "توجہ طلب علاقے")}
            </p>
            <span className="rounded-xl bg-red-50 p-2 text-red-600">
              <AlertTriangle size={18} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-red-700">
            {isInitialLoading ? (
              <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/70" />
            ) : (
              criticalAreas.length
            )}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {tr(lang, "Critical groundwater areas", "تشویشناک زیرِ زمین پانی والے علاقے")}
          </p>
        </div>

        <div className="glass glass-lift rounded-3xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-500">
              {tr(lang, "Moderate Watch", "درمیانی نگرانی")}
            </p>
            <span className="rounded-xl bg-amber-50 p-2 text-amber-700">
              <ShieldAlert size={18} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-amber-700">
            {isInitialLoading ? (
              <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/70" />
            ) : (
              moderateAreas.length
            )}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {tr(lang, "Areas on moderate alert", "درمیانے خطرے والے علاقے")}
          </p>
        </div>

        <Link href="/reports" className="block">
          <div className="glass glass-lift h-full rounded-3xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-500">
                {tr(lang, "Pending Review", "جائزے کے منتظر")}
              </p>
              <span className="rounded-xl bg-sky-50 p-2 text-sky-700">
                <Clock size={18} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">
              {isInitialLoading ? (
                <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/70" />
              ) : (
                pendingReviewCount
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {tr(lang, "Open Community Reports →", "کمیونٹی رپورٹس کھولیں ←")}
            </p>
          </div>
        </Link>

        <div className="glass glass-lift rounded-3xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-500">
              {tr(lang, "Monitored Areas", "نگرانی شدہ علاقے")}
            </p>
            <span className="rounded-xl bg-teal-50 p-2 text-teal-700">
              <Activity size={18} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {isInitialLoading ? (
              <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/70" />
            ) : (
              attentionAreas.length
            )}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {tr(lang, "Districts & localities", "اضلاع اور علاقے")}
          </p>
        </div>
      </div>

      {/* Need Attention Grid (Admin-only, moved from Overview) */}
      <Panel
        title={tr(lang, "Need Attention · Critical Areas", "توجہ طلب · تشویشناک علاقے")}
        description={tr(
          lang,
          "Districts with critical groundwater depth (≥18 m), rapid decline, or high-concern readings requiring administrative action.",
          "18 میٹر یا اس سے زیادہ گہرائی، تیز کمی یا شدید خطرے والی رپورٹس کے حامل علاقے جن پر فوری توجہ درکار ہے۔"
        )}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setAttentionFilter("critical")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                attentionFilter === "critical"
                  ? "bg-red-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tr(lang, `Critical (${criticalAreas.length})`, `تشویشناک (${criticalAreas.length})`)}
            </button>
            <button
              type="button"
              onClick={() => setAttentionFilter("all_flagged")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                attentionFilter === "all_flagged"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tr(
                lang,
                `Critical + Moderate (${criticalAreas.length + moderateAreas.length})`,
                `تشویشناک + درمیانہ (${criticalAreas.length + moderateAreas.length})`
              )}
            </button>
          </div>
          <Link
            href="/map?severity=critical"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline"
          >
            <MapPin size={14} />
            {tr(lang, "View critical areas on map →", "نقشے پر تشویشناک علاقے دیکھیں ←")}
          </Link>
        </div>

        {isInitialLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : visibleAttention.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            {tr(lang, "No areas currently match this attention filter.", "فی الحال اس فلٹر میں کوئی تشویشناک علاقہ نہیں۔")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleAttention.map((area) => {
              const isCritical = area.conditionLabel === "Critical";
              return (
                <Link
                  key={area.areaKey}
                  href={`/forecast?area=${encodeURIComponent(area.areaKey)}`}
                  className={`group flex flex-col justify-between rounded-2xl border p-4 transition hover:shadow-md ${
                    isCritical
                      ? "border-red-200 bg-red-50/50 hover:border-red-300"
                      : "border-amber-200 bg-amber-50/50 hover:border-amber-300"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-slate-900">
                        {translateAreaUr(lang, area.areaKey)}
                      </h4>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          isCritical
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        <TrendingDown size={12} />
                        {translateConditionUr(lang, area.conditionLabel)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">{tr(lang, "Avg Depth", "اوسط گہرائی")}</p>
                        <p className="mt-0.5 font-bold text-slate-900">
                          {area.averageDepthM !== null
                            ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(area.averageDepthM))
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">{tr(lang, "6-Mo Forecast", "6 ماہ کی پیشگوئی")}</p>
                        <p className="mt-0.5 font-bold text-blue-700">
                          {area.projectedDepthM !== null
                            ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(area.projectedDepthM))
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5 text-[11px] text-slate-600">
                    <span>
                      {area.totalReports} {tr(lang, "reports", "رپورٹس")}
                      {area.slopePerYearM !== null
                        ? ` · ${area.slopePerYearM > 0 ? "+" : ""}${area.slopePerYearM.toFixed(2)} ${tr(lang, "m/yr", "میٹر/سال")}`
                        : ""}
                    </span>
                    <span className="font-semibold text-teal-700 group-hover:underline">
                      {tr(lang, "Inspect →", "تفصیل ←")}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Recent Reported Sources & Pakistan Coverage (moved from Overview) */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          title={tr(lang, "Recent Reported Sources", "حالیہ رپورٹ شدہ ذرائع")}
          description={tr(lang, "Latest source types and depths recorded in Supabase", "ڈیٹا بیس میں درج ہونے والے حالیہ آبی ذرائع")}
          className="xl:col-span-2"
        >
          <div className="mb-4 flex justify-end">
            <Link href="/sources" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
              {tr(lang, "View all sources →", "تمام ذرائع دیکھیں ←")}
            </Link>
          </div>
          {recentSources.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="pb-3 font-medium">{tr(lang, "Source", "ذریعہ")}</th>
                    <th className="pb-3 font-medium">{tr(lang, "Location", "مقام")}</th>
                    <th className="pb-3 font-medium">{tr(lang, "Depth", "گہرائی")}</th>
                    <th className="pb-3 font-medium">{tr(lang, "Status", "حیثیت")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSources.map((source) => (
                    <tr key={source.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-3.5 font-semibold text-slate-700">
                        {translateSourceTypeUr(lang, source.name)}
                      </td>
                      <td className="py-3.5 text-slate-500">
                        {translateAreaUr(lang, source.location)}
                      </td>
                      <td className="py-3.5 font-medium">
                        {translateDepthUnitsUr(lang, source.level)}
                      </td>
                      <td className="py-3.5">
                        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold capitalize text-teal-700">
                          {translateStatusUr(lang, source.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
              {tr(lang, "No reported sources yet.", "ابھی کوئی ذریعہ درج نہیں ہوا۔")}
            </p>
          )}
        </Panel>

        <Panel title={tr(lang, "Pakistan Coverage", "پاکستان کوریج")}>
          <Link
            href="/map"
            className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-teal-200 bg-teal-50/70 p-5 text-center transition hover:bg-teal-100/70"
          >
            <Waves size={38} className="text-teal-600" />
            <p className="mt-3 font-semibold text-slate-700">
              {tr(lang, "Open Groundwater Map", "زمینی پانی کا نقشہ کھولیں")}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {tr(lang, "Browse reported source locations.", "رپورٹ شدہ مقامات نقشے پر دیکھیں۔")}
            </p>
          </Link>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>{tr(lang, "Map interface", "نقشہ انٹرفیس")}</span>
            <span className="font-semibold text-teal-700">
              {reports.length} {tr(lang, "submissions", "رپورٹس")}
            </span>
          </div>
        </Panel>
      </div>
    </>
  );
}

export default function MonitoringPage() {
  return (
    <AdminOnly>
      <MonitoringDashboard />
    </AdminOnly>
  );
}
