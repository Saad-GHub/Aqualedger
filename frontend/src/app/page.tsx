"use client";

import { Activity, AlertTriangle, Droplets, Gauge, MapPin, ShieldCheck, Waves, Sparkles, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import { useEffect, useMemo, useState } from "react";
import { readCommunityWaterAreaRisks, readCommunityWaterReports, readPublicAreaSourceTrends, subscribeToCommunityWaterReports, type CommunityWaterAreaRisk, type CommunityWaterReport, type PublicAreaSourceTrend } from "@/lib/community-water-reports";
import { buildReportCodes } from "@/lib/report-display-codes";
import { formatAxisDepthMetersAndFeet, formatDepthMetersAndFeet, meanDepth } from "@/lib/depth-analytics";
import { SourceTypeDepthPanel, TopAreasDepthPanel } from "@/components/aqualedger/depth-infographics";
import waterLevelByYear from "@/data/punjab-water-level-by-year.json";
import { GRACE_PROVINCE_SERIES } from "@/lib/district-intelligence";
import { StatValue } from "@/components/aqualedger/animated-number";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import { depthM } from "@/lib/units";

const wellSummary = waterLevelByYear.summary;
const deepeningShare = Math.round((wellSummary.deepening / wellSummary.trendWells) * 100);

const numeric = (value?: string) => { const parsed = Number.parseFloat(value ?? ""); return Number.isFinite(parsed) ? parsed : null; };
const areaFor = (address: string) => {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "Area not provided";
  const regions = /^(punjab|sindh|khyber pakhtunkhwa|kpk|balochistan|ict|islamabad capital territory|azad jammu and kashmir|ajk|gilgit[- ]baltistan)$/i;
  const hasRegion = regions.test(parts.at(-1) ?? "");
  const localityParts = hasRegion ? parts.slice(Math.max(0, parts.length - 3), -1) : parts.slice(-2);
  return (localityParts.length ? localityParts : parts).join(", ") || "Area not provided";
};
export default function Home() {
  const { isAdmin, authReady } = useAquaRole();
  const lang = useLanguage();
  const [communityReports, setCommunityReports] = useState<CommunityWaterReport[]>([]);
  const [publicTrends, setPublicTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [areaRiskSummaries, setAreaRiskSummaries] = useState<CommunityWaterAreaRisk[]>([]);
  const [reportLoadError, setReportLoadError] = useState("");
  const [areaRiskSetupError, setAreaRiskSetupError] = useState("");
  const [trendInterval, setTrendInterval] = useState<"day" | "month" | "year">("month");
  const [graceProvince, setGraceProvince] = useState<string>("Pakistan");
  const [loading, setLoading] = useState(true);
  const reportCodes = useMemo(() => buildReportCodes(communityReports), [communityReports]);
  useEffect(() => {
    if (!authReady) return;
    if (!isAdmin) {
      const refreshPublic = () => { void readPublicAreaSourceTrends().then((items) => {
        setPublicTrends(items);
        const reports = items.map((row, index): CommunityWaterReport => ({ id: `${row.areaKey}|${row.sourceType}|${row.sampleMonth ?? index}`, address: row.areaKey, areaKey: row.areaKey, sourceType: row.sourceType, depth: row.averageDepthM === null ? "" : String(row.averageDepthM), sampleDate: row.sampleDay ?? row.sampleMonth ?? undefined, status: "aggregated", measurements: {}, aggregateCount: row.reportCount, labMeasurementCount: row.labMeasurementCount, awaitingReviewCount: row.awaitingReviewCount, riskLevel: row.weightedRiskScore === null ? "Incomplete" : row.weightedRiskScore >= 1.5 ? "High concern" : row.weightedRiskScore >= 0.75 ? "Moderate concern" : "Normal" }));
        setCommunityReports(reports);
        const groups = new Map<string, CommunityWaterAreaRisk>();
        const depthSums = new Map<string, { sum: number; count: number }>();
        items.forEach((row) => {
          const key = row.areaKey.toLocaleLowerCase();
          const summary = groups.get(key) ?? { areaKey: row.areaKey, reportCount: 0, normalCount: 0, moderateCount: 0, highCount: 0, incompleteCount: 0, assessedCount: 0, weightedScore: null, riskLevel: "Normal" };
          summary.reportCount += row.reportCount;
          if (row.averageDepthM !== null) {
            const d = depthSums.get(key) ?? { sum: 0, count: 0 };
            d.sum += row.averageDepthM * row.reportCount;
            d.count += row.reportCount;
            depthSums.set(key, d);
            if (row.averageDepthM >= 18) summary.highCount += row.reportCount;
            else if (row.averageDepthM >= 10) summary.moderateCount += row.reportCount;
            else summary.normalCount += row.reportCount;
          } else {
            summary.incompleteCount += row.reportCount;
          }
          const avg = depthSums.get(key)?.count ? depthSums.get(key)!.sum / depthSums.get(key)!.count : null;
          summary.assessedCount = summary.normalCount + summary.moderateCount + summary.highCount;
          summary.weightedScore = avg !== null ? Number(avg.toFixed(2)) : null;
          summary.riskLevel = avg === null ? "Incomplete" : avg >= 18 ? "High concern" : avg >= 10 ? "Moderate concern" : "Normal";
          groups.set(key, summary);
        });
        setAreaRiskSummaries([...groups.values()]); setReportLoadError(""); setAreaRiskSetupError("");
      }).catch(() => { setCommunityReports([]); setAreaRiskSummaries([]); setAreaRiskSetupError("Run supabase/public-area-source-trends.sql in Supabase to load public dashboard summaries."); }).finally(() => setLoading(false)); };
      refreshPublic();
      return subscribeToCommunityWaterReports(refreshPublic);
    }
    const refresh = () => {
      void readPublicAreaSourceTrends().then(setPublicTrends).catch(() => {});
      void Promise.allSettled([readCommunityWaterReports(), readCommunityWaterAreaRisks()]).then(([reportsResult, summaryResult]) => {
        if (reportsResult.status === "fulfilled") { setCommunityReports(reportsResult.value); setReportLoadError(""); }
        else setReportLoadError("Sign in as the admin to view saved reports.");
        if (summaryResult.status === "fulfilled") { setAreaRiskSummaries(summaryResult.value); setAreaRiskSetupError(""); }
        else { setAreaRiskSummaries([]); setAreaRiskSetupError("Run supabase/area-risk-aggregation.sql in Supabase to enable weighted area tags. Your reports remain saved."); }
      }).finally(() => setLoading(false));
    };
    refresh();
    return subscribeToCommunityWaterReports(refresh);
  }, [isAdmin, authReady]);
  const { depthWeightedSum, depthWeightedCount } = communityReports.reduce(
    (acc, r) => {
      const val = numeric(r.depth);
      if (val === null) return acc;
      const w = r.aggregateCount ?? 1;
      acc.depthWeightedSum += val * w;
      acc.depthWeightedCount += w;
      return acc;
    },
    { depthWeightedSum: 0, depthWeightedCount: 0 }
  );
  const avgDepthStr = depthWeightedCount ? formatDepthMetersAndFeet(depthWeightedSum / depthWeightedCount) : "—";
  const areaSummariesByKey = new Map(areaRiskSummaries.map((summary) => [summary.areaKey.toLocaleLowerCase(), summary]));
  const groupedReports = communityReports.reduce<Record<string, CommunityWaterReport[]>>((groups, report) => { const key = (report.areaKey || areaFor(report.address)).toLocaleLowerCase(); (groups[key] ??= []).push(report); return groups; }, {});
  const areaRisks = Object.entries(groupedReports).map(([key, reports]) => {
    const summary = areaSummariesByKey.get(key);
    const areaDepths = reports.map((r) => numeric(r.depth)).filter((v): v is number => v !== null);
    const areaAvgDepth = areaDepths.length ? areaDepths.reduce((s, v) => s + v, 0) / areaDepths.length : null;
    const category = areaAvgDepth !== null
      ? (areaAvgDepth >= 18 ? "High concern" : areaAvgDepth >= 10 ? "Moderate concern" : "Normal")
      : (summary?.riskLevel ?? "Normal");
    const color = category === "High concern" ? "bg-red-50 text-red-700" : category === "Moderate concern" ? "bg-amber-50 text-amber-700" : category === "Normal" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600";
    return { area: summary?.areaKey ?? reports[0].areaKey ?? areaFor(reports[0].address), reports, avgDepth: areaAvgDepth, category, color };
  });
  const highCount = areaRisks.filter((area) => area.category === "High concern").length;
  const moderateCount = areaRisks.filter((area) => area.category === "Moderate concern").length;
  const normalCount = areaRisks.filter((area) => area.category === "Normal").length;
  const isInitialLoading = loading && communityReports.length === 0;
  const dashboardStats = [
    { id: "sources", title: tr(lang, "Reported Sources", "رپورٹ شدہ ذرائع"), value: isInitialLoading ? "" : String(new Set(communityReports.map((report) => `${report.sourceType ?? ""}|${report.areaKey ?? report.address}`)).size), icon: Droplets, note: tr(lang, "Unique source and address pairs", "منفرد ذرائع اور مقامات"), tone: "bg-sky-50 text-sky-600 ring-sky-100" },
    { id: "readings", title: tr(lang, "Depth Readings", "گہرائی کی ریڈنگز"), value: isInitialLoading ? "" : String(communityReports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)), icon: ShieldCheck, note: tr(lang, "Saved in Supabase", "ڈیٹا بیس میں محفوظ"), tone: "bg-teal-50 text-teal-600 ring-teal-100" },
    { id: "avg-depth", title: tr(lang, "Average Depth", "اوسط گہرائی"), value: isInitialLoading ? "" : avgDepthStr, icon: Activity, note: tr(lang, "Mean depth below ground", "زمین کے نیچے اوسط سطح"), tone: "bg-violet-50 text-violet-600 ring-violet-100" },
    { id: "critical", title: tr(lang, "Critical Areas", "تشویشناک علاقے"), value: isInitialLoading ? "" : `${highCount} / ${areaRisks.length}`, icon: AlertTriangle, note: isInitialLoading ? tr(lang, "Loading districts…", "اضلاع لوڈ ہو رہے ہیں…") : tr(lang, `${moderateCount} moderate · Click to view map`, `${moderateCount} درمیانے · نقشہ دیکھنے کے لیے کلک کریں`), tone: "bg-red-50 text-red-600 ring-red-100", href: "/map?severity=critical" },
  ];
  const recentReports = communityReports.slice(0, 4);
  const trendGroups = communityReports.reduce<Record<string, { total: number; count: number }>>((groups, report) => {
    const depth = numeric(report.depth);
    const date = report.sampleDate ?? "";
    if (depth === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return groups;
    const period = trendInterval === "day" ? date : trendInterval === "month" ? date.slice(0, 7) : date.slice(0, 4);
    const group = groups[period] ??= { total: 0, count: 0 };
    group.total += depth * (report.aggregateCount ?? 1);
    group.count += report.aggregateCount ?? 1;
    return groups;
  }, {});
  const trendData = Object.entries(trendGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => {
      const iso = trendInterval === "day" ? `${period}T00:00:00` : trendInterval === "month" ? `${period}-01T00:00:00` : `${period}-01-01T00:00:00`;
      const ts = new Date(iso).getTime();
      return {
        period,
        ts: Number.isFinite(ts) ? ts : 0,
        averageDepth: meanDepth(values.total, values.count) ?? 0,
        readings: values.count,
      };
    });
  const sources = recentReports.map((report) => ({ id: report.id, name: report.sourceType ?? "Water source", location: report.address, level: report.depth ? formatDepthMetersAndFeet(report.depth) : "—", status: report.status, color: "text-teal-700 bg-teal-50" }));

  return <>
    <section className="aqua-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-8">
      <svg aria-hidden="true" viewBox="0 0 1200 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-16 w-full text-white/[0.06]"><path fill="currentColor" d="M0 60 C 200 10 400 110 600 60 S 1000 10 1200 60 V120 H0Z"/><path fill="currentColor" d="M0 80 C 250 40 450 120 700 80 S 1050 40 1200 85 V120 H0Z"/></svg>
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-2xl"><p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-teal-100"><MapPin size={13}/>{tr(lang, "Pakistan · community groundwater network", "پاکستان · کمیونٹی گراؤنڈ واٹر نیٹ ورک")}</p><h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{isAdmin ? tr(lang, "Welcome back, Admin", "خوش آمدید، ایڈمن") : tr(lang, "Groundwater Overview", "زمینی پانی کا جائزہ")}</h1><p className="mt-3 text-sm leading-6 text-slate-200/90 sm:text-base">{tr(lang, "Live groundwater depth trends from community readings and long-term monitoring wells across Pakistan.", "پاکستان بھر سے کمیونٹی ریڈنگز اور طویل مدتی مشاہداتی کنوؤں سے زمینی پانی کی گہرائی کے لائیو رجحانات۔")}</p></div>
        <div className="flex flex-wrap gap-3"><Link href="/reports?new=1" className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500"><Droplets size={16}/>+ {tr(lang, "Log Water Reading", "ریڈنگ درج کریں")}</Link><Link href="/map" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"><MapPin size={16}/>{tr(lang, "Explore Map", "نقشہ دیکھیں")}</Link><Link href="/forecast" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"><TrendingUp size={16}/>{tr(lang, "AI Forecast", "AI پیشگوئی")}</Link></div>
      </div>
    </section>
    <div className="aqua-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{dashboardStats.map((stat) => { const card = <div className="glass glass-lift group h-full rounded-3xl p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><p className="text-[13px] font-medium leading-5 text-slate-500 sm:text-sm">{stat.title}</p><div className={`rounded-2xl p-2.5 ring-1 transition duration-300 group-hover:scale-110 ${stat.tone}`}><stat.icon size={19}/></div></div><p className="tabular font-display mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-[32px]">{isInitialLoading ? <span className="inline-block h-7 w-20 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/70" /> : <StatValue value={stat.value} />}</p><p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"/>{stat.note}</p></div>; return "href" in stat && stat.href ? <Link key={stat.id} href={stat.href} className="block">{card}</Link> : <div key={stat.id}>{card}</div>; })}</div>
    <Panel title={tr(lang, "Groundwater Depth Trends", "زمینی پانی کی گہرائی کے رجحانات")} description={tr(lang, "Reported source depth below ground, grouped by sample day, month or year", "دن، مہینے یا سال کے حساب سے زمین کے نیچے پانی کی اوسط گہرائی")}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="glass relative inline-flex rounded-2xl p-1" aria-label="Trend time interval">{(["day", "month", "year"] as const).map((interval) => <button key={interval} type="button" aria-pressed={trendInterval === interval} onClick={() => setTrendInterval(interval)} className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold capitalize transition duration-300 ${trendInterval === interval ? "bg-teal-600 text-white shadow-[0_6px_16px_-6px_rgb(20_184_166/0.8)]" : "text-slate-600 hover:text-slate-900 dark:text-white/80 dark:hover:text-white"}`}>{interval === "day" ? tr(lang, "Days", "دن") : interval === "month" ? tr(lang, "Months", "مہینے") : tr(lang, "Years", "سال")}</button>)}</div><span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700">{isInitialLoading ? tr(lang, "Loading…", "لوڈ ہو رہا ہے…") : tr(lang, `${trendData.reduce((sum, item) => sum + item.readings, 0)} readings · ${trendData.length} ${trendInterval === "day" ? "days" : trendInterval === "month" ? "months" : "years"}`, `${trendData.reduce((sum, item) => sum + item.readings, 0)} ریڈنگز · ${trendData.length} ${trendInterval === "day" ? "دن" : trendInterval === "month" ? "مہینے" : "سال"}`)}</span></div>{isInitialLoading ? <div className="h-80 animate-pulse rounded-2xl bg-slate-100" /> : trendData.length ? <><div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}><defs><linearGradient id="depthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14b8a6" stopOpacity={0.28}/><stop offset="100%" stopColor="#14b8a6" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} height={28} minTickGap={48} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(ts) => { const d = new Date(Number(ts)); if (Number.isNaN(d.getTime())) return String(ts); if (trendInterval === "year") return String(d.getFullYear()); if (trendInterval === "month") return d.toLocaleDateString("en-US", { month: "short", year: "numeric" }); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }}/><YAxis width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}/><Tooltip separator=": " cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} formatter={(value, _name, item) => [`${formatDepthMetersAndFeet(Number(value))} average depth · ${item.payload.readings} reading${item.payload.readings === 1 ? "" : "s"}`, tr(lang, "Source depth", "ذریعہ کی گہرائی")]} labelFormatter={(_label, payload) => { const p = payload?.[0]?.payload?.period; return `${trendInterval === "day" ? tr(lang, "Day", "دن") : trendInterval === "month" ? tr(lang, "Month", "مہینہ") : tr(lang, "Year", "سال")}: ${p ?? ""}`; }}/><Area key={trendInterval} type="monotone" dataKey="averageDepth" name={tr(lang, "Average depth", "اوسط گہرائی")} stroke="#14b8a6" strokeWidth={2.5} fill="url(#depthFill)" dot={false} activeDot={{ r: 6, fill: "#14b8a6", stroke: "white", strokeWidth: 2 }} animationDuration={1400} animationEasing="ease-out"/></AreaChart></ResponsiveContainer></div><p className={`mt-3 rounded-lg p-3 text-xs leading-5 ${trendData.length < 2 ? "bg-amber-50 text-amber-800" : "text-slate-400"}`}>{trendData.length < 2 ? tr(lang, `Only ${trendData.length} ${trendInterval} with readings so far. A trend line needs at least 2 different periods.`, `اب تک صرف ${trendData.length} مدت کی ریڈنگز ہیں۔ رجحان کی لائن کے لیے کم از کم 2 مختلف ادوار درکار ہیں۔`) : tr(lang, "Hover over the line to inspect a reading. Each point is the period average; different locations and source types may not be directly comparable.", "ریڈنگ دیکھنے کے لیے لائن پر ہوور کریں۔ ہر نقطہ اس مدت کی اوسط کو ظاہر کرتا ہے۔")}</p></> : <div className="flex h-80 items-center justify-center rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">{tr(lang, "No reports with both a source depth and sample date to show in this view.", "اس ویو میں دکھانے کے لیے گہرائی اور تاریخ والی کوئی رپورٹ موجود نہیں۔")}</div>}</Panel>
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-3">
        <SourceTypeDepthPanel trends={publicTrends} />
      </div>
      <Panel className="xl:col-span-2" title={tr(lang, "Groundwater Status Overview", "زمینی پانی کی صورتحال کا جائزہ")} description={tr(lang, "Area-level groundwater status across monitored districts", "نگرانی شدہ اضلاع میں زمینی پانی کی سطح")}><div className="mb-4 flex items-center justify-between"><span className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700"><Sparkles size={15}/>{tr(lang, "Depth & trend monitoring", "گہرائی اور رجحان کی نگرانی")}</span><Gauge className="text-teal-600" size={21}/></div>{areaRiskSetupError ? <p className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">{areaRiskSetupError}</p> : <div className="space-y-4">{[{ label: tr(lang, "High concern", "شدید تشویشناک"), value: highCount, color: "bg-red-500" }, { label: tr(lang, "Moderate concern", "درمیانی تشویش"), value: moderateCount, color: "bg-amber-400" }, { label: tr(lang, "Normal", "معمول کے مطابق"), value: normalCount, color: "bg-emerald-500" }, { label: tr(lang, "Areas monitored", "نگرانی شدہ علاقے"), value: areaRisks.length, color: "bg-teal-500" }].map((item) => <div key={item.label}><div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-600">{item.label}</span><span className="font-semibold">{isInitialLoading ? "…" : item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`aqua-grow h-full rounded-full ${item.color}`} style={{ width: `${areaRisks.length ? Math.min(100, item.value / areaRisks.length * 100) : 0}%` }}/></div></div>)}</div>}<div className="mt-5 rounded-2xl bg-teal-50 p-3 text-xs leading-5 text-teal-800"><AlertTriangle size={16} className="mb-1"/>{tr(lang, "Summaries reflect submitted groundwater depth readings and historical monitoring records.", "خلاصے جمع کرائی گئی گہرائی کی ریڈنگز اور تاریخی ریکارڈ پر مبنی ہیں۔")}</div></Panel>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <TopAreasDepthPanel trends={publicTrends} />
      <Panel title={tr(lang, "Long-term water level in Punjab", "پنجاب میں پانی کی طویل مدتی سطح")} description={tr(lang, `Typical October depth to water across ${wellSummary.wells.toLocaleString()} observation wells (1979–2010).`, `پنجاب کے ${wellSummary.wells.toLocaleString()} مشاہداتی کنوؤں میں اکتوبر کی اوسط گہرائی (1979–2010)۔`)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            {tr(lang, `${wellSummary.wells.toLocaleString()} Observation Wells · ${deepeningShare}% Falling`, `${wellSummary.wells.toLocaleString()} مشاہداتی کنویں · ${deepeningShare}% میں کمی`)}
          </span>
          <span className="text-xs font-semibold text-sky-700">
            {tr(lang, `${(wellSummary.medianTrendMPerYear * 100).toFixed(1)} cm/yr median drop`, `${(wellSummary.medianTrendMPerYear * 100).toFixed(1)} سینٹی میٹر/سال اوسط کمی`)}
          </span>
        </div>
        <div className="h-68 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={waterLevelByYear.years} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}><defs><linearGradient id="punjabFill" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28}/><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="year" height={28} minTickGap={20} interval="preserveStartEnd" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}/><YAxis reversed width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}/><Tooltip formatter={(value, _name, item) => [`${formatDepthMetersAndFeet(Number(value), 2)} · ${item.payload.wells} ${tr(lang, "wells", "کنویں")}`, tr(lang, "Depth to water", "پانی کی گہرائی")]} labelFormatter={(label) => `${tr(lang, "October", "اکتوبر")} ${label}`}/><Area type="monotone" dataKey="medianDepthM" stroke="#0284c7" strokeWidth={2.5} fill="url(#punjabFill)" dot={false} activeDot={{ r: 5, fill: "#0284c7", stroke: "white", strokeWidth: 2 }} animationDuration={1600} animationEasing="ease-out"/></AreaChart></ResponsiveContainer></div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>{tr(lang, "Moving down = deeper water", "نیچے جانا = پانی مزید گہرا ہونا")}</span>
          <Link href="/map" className="font-semibold text-teal-700 hover:underline">{tr(lang, "Explore every well on the map →", "نقشے پر تمام کنویں دیکھیں ←")}</Link>
        </div>
      </Panel>
    </div>
    {(() => {
      const graceProvinces = ["Pakistan", "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan"];
      const rawSeries = GRACE_PROVINCE_SERIES[graceProvince] ?? [];
      const chartData = rawSeries.map(([month, cm]) => ({ month, cm }));
      const latest = chartData.at(-1);
      const earlySlice = chartData.filter((d) => d.month >= "2003-01" && d.month <= "2005-12");
      const recentSlice = chartData.filter((d) => d.month >= "2023-01" && d.month <= "2025-12");
      const earlyAvg = earlySlice.length ? earlySlice.reduce((s, d) => s + d.cm, 0) / earlySlice.length : null;
      const recentAvg = recentSlice.length ? recentSlice.reduce((s, d) => s + d.cm, 0) / recentSlice.length : null;
      const netChange = earlyAvg !== null && recentAvg !== null ? recentAvg - earlyAvg : null;
      return (
        <Panel
          title={tr(lang, "Satellite Water Storage Trend (GRACE 2002–2026)", "سیٹلائٹ پانی ذخیرہ رجحان (GRACE 2002–2026)")}
          description={tr(lang, "Monthly terrestrial water storage anomaly (cm) from GFZ GRACE/GRACE-FO satellites, extending Pakistan's groundwater record up to August 2026.", "GFZ GRACE سیٹلائٹس سے ماہانہ زمینی پانی ذخیرہ کی تبدیلی (سینٹی میٹر)، اگست 2026 تک کا ریکارڈ۔")}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="glass inline-flex flex-wrap rounded-2xl p-1" role="group" aria-label="Province selector">
              {graceProvinces.map((prov) => (
                <button
                  key={prov}
                  type="button"
                  aria-pressed={graceProvince === prov}
                  onClick={() => setGraceProvince(prov)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${graceProvince === prov ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 dark:text-white/80 dark:hover:text-white"}`}
                >
                  {prov === "Khyber Pakhtunkhwa" ? "KP" : prov}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {netChange !== null && (
                <span className={`rounded-full px-3 py-1 font-semibold ${netChange < -2 ? "bg-red-50 text-red-700" : netChange > 2 ? "bg-sky-50 text-sky-700" : "bg-teal-50 text-teal-700"}`}>
                  {netChange >= 0 ? `+${netChange.toFixed(1)}` : netChange.toFixed(1)} cm (2003–05 → 2023–25)
                </span>
              )}
              {latest && (
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-white/10 dark:text-white/90">
                  {latest.month}: {latest.cm >= 0 ? `+${latest.cm}` : latest.cm} cm
                </span>
              )}
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="graceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="month" minTickGap={48} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis width={54} tickFormatter={(v) => `${v} cm`} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)} cm`, "Water storage anomaly"]} labelFormatter={(label) => `Month: ${label}`} />
                <Area type="monotone" dataKey="cm" stroke="#0d9488" strokeWidth={2} fill="url(#graceFill)" dot={false} activeDot={{ r: 5, fill: "#0d9488", stroke: "white", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      );
    })()}
    {isAdmin && <Panel title="Latest Community Water Reports" description="Reports loaded from the AquaLedger database."><div className="mb-4 flex justify-end"><Link href="/reports" className="text-sm font-semibold text-teal-700 hover:text-teal-800">Open all reports →</Link></div>{reportLoadError ? <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-800">{reportLoadError} <Link href="/login" className="font-semibold underline">Admin sign in</Link></p> : recentReports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="pb-3 font-medium">Report</th><th className="pb-3 font-medium">Address</th><th className="pb-3 font-medium">Source / depth</th><th className="pb-3 font-medium">Sample date</th></tr></thead><tbody>{recentReports.map((report) => <tr key={report.id} className="border-b border-slate-50 last:border-0"><td className="py-4"><Link href="/reports" className="font-semibold text-teal-700 hover:underline">{reportCodes.get(report.id) ?? report.id}</Link><span className="block text-xs text-slate-400">{report.reporterName}</span></td><td className="py-4 text-slate-600">{report.address}</td><td className="py-4 text-slate-600">{report.sourceType ?? "—"}{report.depth ? ` · ${formatDepthMetersAndFeet(report.depth)}` : ""}</td><td className="py-4 text-slate-500">{report.sampleDate ?? "—"}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No community water reports have been submitted yet. <Link href="/reports" className="font-semibold text-teal-700 hover:underline">Submit the first report.</Link></p>}</Panel>}
    {isAdmin && <div className="grid gap-6 xl:grid-cols-3"><Panel title="Recent Reported Sources" description="Source details from submitted Supabase reports" className="xl:col-span-2"><div className="mb-4 flex justify-end"><Link href="/sources" className="text-sm font-semibold text-teal-700 hover:text-teal-800">View all sources →</Link></div>{sources.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="pb-3 font-medium">Source</th><th className="pb-3 font-medium">Location</th><th className="pb-3 font-medium">Depth</th><th className="pb-3 font-medium">Status</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id} className="border-b border-slate-50 last:border-0"><td className="py-4 font-semibold text-slate-700">{source.name}</td><td className="py-4 text-slate-500">{source.location}</td><td className="py-4 font-medium">{source.level}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${source.color}`}>{source.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No reported sources yet. <Link href="/reports" className="font-semibold text-teal-700 hover:underline">Submit a water report.</Link></p>}</Panel><Panel title="Pakistan Coverage"><Link href="/map" className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-teal-200 bg-teal-50/70 p-5 text-center transition hover:bg-teal-100/70"><Waves size={38} className="text-teal-600"/><p className="mt-3 font-semibold text-slate-700">Open Groundwater Map</p><p className="mt-1 text-xs leading-5 text-slate-500">Browse reported source locations.</p></Link><div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>Map interface</span><span className="font-semibold text-teal-700">{communityReports.length} submissions</span></div></Panel></div>}
  </>;
}


