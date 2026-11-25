"use client";

import { Activity, AlertTriangle, Droplets, Gauge, MapPin, ShieldCheck, Waves, Sparkles, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import { useEffect, useMemo, useState } from "react";
import { readCommunityWaterAreaRisks, readCommunityWaterReports, readPublicAreaSourceTrends, subscribeToCommunityWaterReports, type CommunityWaterAreaRisk, type CommunityWaterReport, type PublicAreaSourceTrend } from "@/lib/community-water-reports";
import { buildReportCodes } from "@/lib/report-display-codes";
import { formatAxisDepthMetersAndFeet, formatDepthMetersAndFeet, meanDepth } from "@/lib/depth-analytics";
import { AreaDepthInfographicStrip } from "@/components/aqualedger/depth-infographics";
import waterLevelByYear from "@/data/punjab-water-level-by-year.json";
import { StatValue } from "@/components/aqualedger/animated-number";
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
  const [communityReports, setCommunityReports] = useState<CommunityWaterReport[]>([]);
  const [publicTrends, setPublicTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [areaRiskSummaries, setAreaRiskSummaries] = useState<CommunityWaterAreaRisk[]>([]);
  const [reportLoadError, setReportLoadError] = useState("");
  const [areaRiskSetupError, setAreaRiskSetupError] = useState("");
  const [trendInterval, setTrendInterval] = useState<"day" | "month" | "year">("month");
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
      }).catch(() => { setCommunityReports([]); setAreaRiskSummaries([]); setAreaRiskSetupError("Run supabase/public-area-source-trends.sql in Supabase to load public dashboard summaries."); }); };
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
      });
    };
    refresh();
    return subscribeToCommunityWaterReports(refresh);
  }, [isAdmin, authReady]);
  const depthValues = communityReports.map((r) => numeric(r.depth)).filter((v): v is number => v !== null);
  const avgDepthStr = depthValues.length ? formatDepthMetersAndFeet(depthValues.reduce((s, v) => s + v, 0) / depthValues.length) : "—";
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
  const dashboardStats = [
    { title: "Reported Sources", value: String(new Set(communityReports.map((report) => `${report.sourceType ?? ""}|${report.areaKey ?? report.address}`)).size), icon: Droplets, note: "Unique source and address pairs", tone: "bg-sky-50 text-sky-600 ring-sky-100" },
    { title: "Depth Readings", value: String(communityReports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)), icon: ShieldCheck, note: "Saved in Supabase", tone: "bg-teal-50 text-teal-600 ring-teal-100" },
    { title: "Average Depth", value: avgDepthStr, icon: Activity, note: "Mean depth below ground", tone: "bg-violet-50 text-violet-600 ring-violet-100" },
    { title: "Monitored Areas", value: String(areaRisks.length), icon: AlertTriangle, note: `${highCount} critical · ${moderateCount} moderate`, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
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
  const trendData = Object.entries(trendGroups).sort(([a], [b]) => a.localeCompare(b)).map(([period, values]) => ({ period, averageDepth: meanDepth(values.total, values.count) ?? 0, readings: values.count }));
  const sources = recentReports.map((report) => ({ id: report.id, name: report.sourceType ?? "Water source", location: report.address, level: report.depth ? formatDepthMetersAndFeet(report.depth) : "—", status: report.status, color: "text-teal-700 bg-teal-50" }));

  return <>
    <section className="aqua-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-8">
      <svg aria-hidden="true" viewBox="0 0 1200 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-16 w-full text-white/[0.06]"><path fill="currentColor" d="M0 60 C 200 10 400 110 600 60 S 1000 10 1200 60 V120 H0Z"/><path fill="currentColor" d="M0 80 C 250 40 450 120 700 80 S 1050 40 1200 85 V120 H0Z"/></svg>
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-2xl"><p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-teal-100"><MapPin size={13}/>Pakistan · community groundwater network</p><h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{isAdmin ? "Welcome back, Admin" : "Groundwater Overview"}</h1><p className="mt-3 text-sm leading-6 text-slate-200/90 sm:text-base">Live groundwater depth trends from community readings and long-term monitoring wells across Pakistan.</p></div>
        <div className="flex flex-wrap gap-3"><Link href="/map" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-teal-50"><MapPin size={16} className="text-teal-600"/>Explore the map</Link><Link href="/forecast" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"><TrendingUp size={16}/>AI Depth Forecast</Link><Link href="/reports" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"><Droplets size={16}/>{isAdmin ? "Review readings" : "Log a reading"}</Link></div>
      </div>
    </section>
    <div className="aqua-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{dashboardStats.map((stat) => <div key={stat.title} className="glass glass-lift group rounded-3xl p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><p className="text-[13px] font-medium leading-5 text-slate-500 sm:text-sm">{stat.title}</p><div className={`rounded-2xl p-2.5 ring-1 transition duration-300 group-hover:scale-110 ${stat.tone}`}><stat.icon size={19}/></div></div><p className="tabular font-display mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-[32px]"><StatValue value={stat.value} /></p><p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>{stat.note}</p></div>)}</div>
    <Panel title="Groundwater Depth Trends" description="Reported source depth below ground, grouped by sample day, month or year"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="glass relative inline-flex rounded-2xl p-1" aria-label="Trend time interval">{(["day", "month", "year"] as const).map((interval) => <button key={interval} type="button" aria-pressed={trendInterval === interval} onClick={() => setTrendInterval(interval)} className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold capitalize transition duration-300 ${trendInterval === interval ? "bg-teal-500 text-white shadow-[0_6px_16px_-6px_rgb(20_184_166/0.8)]" : "text-slate-500 hover:text-slate-800"}`}>{interval === "day" ? "Days" : interval === "month" ? "Months" : "Years"}</button>)}</div><span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700">{trendData.reduce((sum, item) => sum + item.readings, 0)} readings · {trendData.length} {trendInterval === "day" ? "days" : trendInterval === "month" ? "months" : "years"}</span></div>{trendData.length ? <><div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="depthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14b8a6" stopOpacity={0.28}/><stop offset="100%" stopColor="#14b8a6" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(period) => trendInterval === "day" ? period.slice(5) : period}/><YAxis width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}/><Tooltip cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} formatter={(value, _name, item) => [`${formatDepthMetersAndFeet(Number(value))} average depth · ${item.payload.readings} reading${item.payload.readings === 1 ? "" : "s"}`, "Source depth"]} labelFormatter={(label) => `${trendInterval === "day" ? "Day" : trendInterval === "month" ? "Month" : "Year"}: ${label}`}/><Area key={trendInterval} type="monotone" dataKey="averageDepth" name="Average depth" stroke="#14b8a6" strokeWidth={2.5} fill="url(#depthFill)" dot={false} activeDot={{ r: 6, fill: "#14b8a6", stroke: "white", strokeWidth: 2 }} animationDuration={1400} animationEasing="ease-out"/></AreaChart></ResponsiveContainer></div><p className={`mt-3 rounded-lg p-3 text-xs leading-5 ${trendData.length < 2 ? "bg-amber-50 text-amber-800" : "text-slate-400"}`}>{trendData.length < 2 ? `Only ${trendData.length} ${trendInterval === "day" ? "day" : trendInterval === "month" ? "month" : "year"} with readings so far. A trend line needs readings across at least 2 different ${trendInterval === "day" ? "days" : trendInterval === "month" ? "months" : "years"}; the current point is the average of ${trendData[0].readings} report readings.` : "Hover over the line to inspect a reading. Each point is the period average; different locations and source types may not be directly comparable."}</p></> : <div className="flex h-80 items-center justify-center rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No reports with both a source depth and sample date to show in this view.</div>}</Panel>
    <AreaDepthInfographicStrip trends={publicTrends} aside={
      <Panel title="Groundwater Status Overview" description="Area-level groundwater status across monitored districts"><div className="mb-4 flex items-center justify-between"><span className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700"><Sparkles size={15}/>Depth &amp; trend monitoring</span><Gauge className="text-teal-600" size={21}/></div>{areaRiskSetupError ? <p className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">{areaRiskSetupError}</p> : <div className="space-y-4">{[{ label: "High concern", value: highCount, color: "bg-red-500" }, { label: "Moderate concern", value: moderateCount, color: "bg-amber-400" }, { label: "Normal", value: normalCount, color: "bg-emerald-500" }, { label: "Areas monitored", value: areaRisks.length, color: "bg-teal-500" }].map((item) => <div key={item.label}><div className="mb-2 flex justify-between text-sm"><span className="text-slate-600">{item.label}</span><span className="font-semibold">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`aqua-grow h-full rounded-full ${item.color}`} style={{ width: `${areaRisks.length ? Math.min(100, item.value / areaRisks.length * 100) : 0}%` }}/></div></div>)}</div>}<div className="mt-5 rounded-2xl bg-teal-50 p-3 text-xs leading-5 text-teal-800"><AlertTriangle size={16} className="mb-1"/>Summaries reflect submitted groundwater depth readings and historical monitoring records.</div></Panel>
    } />
    <Panel title="Long-term water level in Punjab" description={`Typical October depth to water across ${wellSummary.wells.toLocaleString()} observation wells, by year. Only years with 200 or more measured wells are shown.`}>
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={waterLevelByYear.years} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="punjabFill" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28}/><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}/><YAxis reversed width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}/><Tooltip formatter={(value, _name, item) => [`${formatDepthMetersAndFeet(Number(value), 2)} typical depth · ${item.payload.wells} wells measured`, "Depth to water"]} labelFormatter={(label) => `October ${label}`}/><Area type="monotone" dataKey="medianDepthM" stroke="#0284c7" strokeWidth={2.5} fill="url(#punjabFill)" dot={false} activeDot={{ r: 5, fill: "#0284c7", stroke: "white", strokeWidth: 2 }} animationDuration={1600} animationEasing="ease-out"/></AreaChart></ResponsiveContainer></div>
        <div className="space-y-3">
          <div className="rounded-xl bg-red-50 p-4"><p className="tabular text-3xl font-semibold tracking-tight text-red-700">{deepeningShare}%</p><p className="mt-1 text-xs leading-5 text-red-800/80">of {wellSummary.trendWells.toLocaleString()} wells with a trend show the water table getting deeper</p></div>
          <div className="rounded-xl bg-sky-50 p-4"><p className="tabular text-3xl font-semibold tracking-tight text-sky-700">{(wellSummary.medianTrendMPerYear * 100).toFixed(1)} cm</p><p className="mt-1 text-xs leading-5 text-sky-800/80">median drop in the water table per year, per well</p></div>
          <Link href="/map" className="block text-xs font-semibold text-teal-700 hover:underline">Explore every well on the map →</Link>
        </div>
      </div>
    </Panel>
    {isAdmin && <Panel title="Latest Community Water Reports" description="Reports loaded from the AquaLedger database."><div className="mb-4 flex justify-end"><Link href="/reports" className="text-sm font-semibold text-teal-700 hover:text-teal-800">Open all reports →</Link></div>{reportLoadError ? <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-800">{reportLoadError} <Link href="/login" className="font-semibold underline">Admin sign in</Link></p> : recentReports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="pb-3 font-medium">Report</th><th className="pb-3 font-medium">Address</th><th className="pb-3 font-medium">Source / depth</th><th className="pb-3 font-medium">Sample date</th></tr></thead><tbody>{recentReports.map((report) => <tr key={report.id} className="border-b border-slate-50 last:border-0"><td className="py-4"><Link href="/reports" className="font-semibold text-teal-700 hover:underline">{reportCodes.get(report.id) ?? report.id}</Link><span className="block text-xs text-slate-400">{report.reporterName}</span></td><td className="py-4 text-slate-600">{report.address}</td><td className="py-4 text-slate-600">{report.sourceType ?? "—"}{report.depth ? ` · ${formatDepthMetersAndFeet(report.depth)}` : ""}</td><td className="py-4 text-slate-500">{report.sampleDate ?? "—"}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No community water reports have been submitted yet. <Link href="/reports" className="font-semibold text-teal-700 hover:underline">Submit the first report.</Link></p>}</Panel>}
    {isAdmin && <div className="grid gap-6 xl:grid-cols-3"><Panel title="Recent Reported Sources" description="Source details from submitted Supabase reports" className="xl:col-span-2"><div className="mb-4 flex justify-end"><Link href="/sources" className="text-sm font-semibold text-teal-700 hover:text-teal-800">View all sources →</Link></div>{sources.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="pb-3 font-medium">Source</th><th className="pb-3 font-medium">Location</th><th className="pb-3 font-medium">Depth</th><th className="pb-3 font-medium">Status</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id} className="border-b border-slate-50 last:border-0"><td className="py-4 font-semibold text-slate-700">{source.name}</td><td className="py-4 text-slate-500">{source.location}</td><td className="py-4 font-medium">{source.level}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${source.color}`}>{source.status}</span></td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No reported sources yet. <Link href="/reports" className="font-semibold text-teal-700 hover:underline">Submit a water report.</Link></p>}</Panel><Panel title="Pakistan Coverage"><Link href="/map" className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-teal-200 bg-teal-50/70 p-5 text-center transition hover:bg-teal-100/70"><Waves size={38} className="text-teal-600"/><p className="mt-3 font-semibold text-slate-700">Open Groundwater Map</p><p className="mt-1 text-xs leading-5 text-slate-500">Browse reported source locations.</p></Link><div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>Map interface</span><span className="font-semibold text-teal-700">{communityReports.length} submissions</span></div></Panel></div>}
  </>;
}


