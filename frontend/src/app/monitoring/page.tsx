"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  ShieldAlert,
  Waves,
} from "lucide-react";
import { AdminOnly, PageIntro, Panel } from "@/components/aqualedger/app-shell";
import { DepthGauge } from "@/components/aqualedger/depth-gauge";
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

      {/* Needs Attention (moved from Overview) */}
      {!isInitialLoading && criticalAreas.length > 0 && (
        <section aria-labelledby="attention-title" className="glass rounded-3xl p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="attention-title" className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                <AlertTriangle size={17} className="text-red-600" aria-hidden="true" />
                {tr(lang, "Needs attention", "توجہ طلب علاقے")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                {tr(
                  lang,
                  `${criticalAreas.length} critical areas, deepest water table first`,
                  `${criticalAreas.length} تشویشناک علاقے، سب سے گہرا پانی پہلے`
                )}
              </p>
            </div>
            <Link
              href="/map?severity=critical"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-teal-700 hover:underline"
            >
              {tr(lang, "View on map", "نقشے پر دیکھیں")}
              <ChevronRight size={15} aria-hidden="true" className="rtl:rotate-180" />
            </Link>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {[...criticalAreas]
              .sort((a, b) => (b.averageDepthM ?? -1) - (a.averageDepthM ?? -1))
              .slice(0, 6)
              .map((area) => (
                <li key={area.areaKey}>
                  <Link
                    href={`/forecast?area=${encodeURIComponent(area.areaKey)}`}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 transition hover:border-teal-600/40 hover:bg-teal-50"
                  >
                    <DepthGauge depthM={area.averageDepthM} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {translateAreaUr(lang, area.areaKey)}
                      </span>
                      <span className="font-data mt-0.5 block whitespace-nowrap text-[13px] text-slate-600">
                        {area.averageDepthM !== null
                          ? translateDepthUnitsUr(lang, formatDepthMetersAndFeet(area.averageDepthM))
                          : "—"}
                      </span>
                    </span>
                    <span className="aqua-chip bg-red-50 text-red-700">
                      <AlertTriangle size={12} aria-hidden="true" />
                      {tr(lang, "Critical", "تشویشناک")}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

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

        <Panel
          title={tr(lang, "Pakistan Coverage", "پاکستان کوریج")}
          description={tr(lang, "Geographic view of reported wells and district depth heatmaps.", "رپورٹ شدہ کنوؤں اور اضلاع کا نقشہ۔")}
          className="flex flex-col"
        >
          <Link
            href="/map"
            className="flex min-h-56 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-teal-200 bg-teal-50/70 p-6 text-center transition hover:bg-teal-100/70"
          >
            <Waves size={42} className="text-teal-600" />
            <p className="mt-3 font-semibold text-slate-700">
              {tr(lang, "Open Groundwater Map", "زمینی پانی کا نقشہ کھولیں")}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              {tr(lang, "Browse reported source locations, census depth, and observation wells.", "رپورٹ شدہ مقامات، گہرائی اور مشاہداتی کنویں نقشے پر دیکھیں۔")}
            </p>
          </Link>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
            <div>
              <p className="text-slate-400">{tr(lang, "Areas covered", "شامل علاقے")}</p>
              <p className="mt-0.5 font-bold text-slate-800">{attentionAreas.length}</p>
            </div>
            <div>
              <p className="text-slate-400">{tr(lang, "Total submissions", "کل رپورٹس")}</p>
              <p className="mt-0.5 font-bold text-teal-700">{reports.length}</p>
            </div>
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
