"use client";

import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Droplets, Gauge, MapPin, ShieldCheck, Waves, Sparkles } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { PageIntro, Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import { useEffect, useMemo, useState } from "react";
import { readCommunityWaterAreaRisks, readCommunityWaterReports, readPublicAreaSourceTrends, subscribeToCommunityWaterReports, type CommunityWaterAreaRisk, type CommunityWaterReport, type PublicAreaSourceTrend } from "@/lib/community-water-reports";
import { screenWaterReport } from "@/lib/water-risk-screening";
import { buildReportCodes } from "@/lib/report-display-codes";
import { meanDepth } from "@/lib/depth-analytics";
import { AreaDepthInfographicStrip } from "@/components/aqualedger/depth-infographics";

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
  const avgDepthStr = depthValues.length ? `${(depthValues.reduce((s, v) => s + v, 0) / depthValues.length).toFixed(1)} m` : "—";
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
    { title: "Reported Sources", value: String(new Set(communityReports.map((report) => `${report.sourceType ?? ""}|${report.areaKey ?? report.address}`)).size), change: "Live", icon: Droplets, note: "Unique source and address pairs" },
    { title: "Depth Readings", value: String(communityReports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)), change: "Live", icon: ShieldCheck, note: "Saved in Supabase" },
    { title: "Average Depth", value: avgDepthStr, change: "Live", icon: Activity, note: "Mean depth below ground" },
    { title: "Monitored Areas", value: String(areaRisks.length), change: "Live", icon: AlertTriangle, note: `${highCount} critical · ${moderateCount} moderate` },
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
  const sources = recentReports.map((report) => ({ id: report.id, name: report.sourceType ?? "Water source", location: report.address, level: report.depth ? `${report.depth} m` : "—", status: report.status, color: "text-teal-700 bg-teal-50" }));

  return <>
    <PageIntro title={isAdmin ? "Welcome back, Admin" : "Groundwater Overview"} description="Here’s what’s happening with groundwater today." action={<div className="flex flex-wrap items-center gap-2 self-start"><Link href="/forecast" className="rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800">AI Depth Forecast →</Link><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><MapPin size={16} className="text-teal-600"/>Pakistan</div></div>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{dashboardStats.map((stat) => <div key={stat.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{stat.title}</p><div className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><stat.icon size={20}/></div></div><p className="mt-4 text-3xl font-bold tracking-tight">{stat.value}</p><div className="mt-2 flex items-center gap-1 text-xs">{stat.change.startsWith("-") ? <ArrowDownRight size={15} className="text-emerald-600"/> : <ArrowUpRight size={15} className="text-emerald-600"/>}<span className="font-semibold text-emerald-700">{stat.change}</span><span className="text-slate-400">{stat.note}</span></div></div>)}</div>
    <div className="grid gap-6 xl:grid-cols-3">
      <Panel title="Groundwater Depth Trends" description="Reported source depth below ground, grouped by sample day, month or year" className="xl:col-span-2"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="Trend time interval">{(["day", "month", "year"] as const).map((interval) => <button key={interval} type="button" aria-pressed={trendInterval === interval} onClick={() => setTrendInterval(interval)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${trendInterval === interval ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{interval === "day" ? "Days" : interval === "month" ? "Months" : "Years"}</button>)}</div><span className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700">{trendData.reduce((sum, item) => sum + item.readings, 0)} readings · {trendData.length} {trendInterval === "day" ? "days" : trendInterval === "month" ? "months" : "years"}</span></div>{trendData.length ? <><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(period) => trendInterval === "day" ? period.slice(5) : period}/><YAxis unit=" m" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }}/><Tooltip cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} formatter={(value, _name, item) => [`${value} m average depth · ${item.payload.readings} reading${item.payload.readings === 1 ? "" : "s"}`, "Source depth"]} labelFormatter={(label) => `${trendInterval === "day" ? "Day" : trendInterval === "month" ? "Month" : "Year"}: ${label}`}/><Line type="linear" dataKey="averageDepth" name="Average depth" stroke="#0d9488" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#0d9488", stroke: "white", strokeWidth: 2 }}/></LineChart></ResponsiveContainer></div><p className={`mt-3 rounded-lg p-3 text-xs leading-5 ${trendData.length < 2 ? "bg-amber-50 text-amber-800" : "text-slate-400"}`}>{trendData.length < 2 ? `Only ${trendData.length} ${trendInterval === "day" ? "day" : trendInterval === "month" ? "month" : "year"} with readings so far. A trend line needs readings across at least 2 different ${trendInterval === "day" ? "days" : trendInterval === "month" ? "months" : "years"}; the current point is the average of ${trendData[0].readings} report readings.` : "Hover over the line to inspect a reading. Each point is the period average; different locations and source types may not be directly comparable."}</p></> : <div className="flex h-64 items-center justify-center rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">No reports with both a source depth and sample date to show in this view.</div>}</Panel>
      <Panel title="Groundwater Status Overview" description="Area-level groundwater status across monitored districts"><div className="mb-4 flex items-center justify-between"><span className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700"><Sparkles size={15}/>Depth &amp; trend monitoring</span><Gauge className="text-teal-600" size={21}/></div>{areaRiskSetupError ? <p className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">{areaRiskSetupError}</p> : <div className="space-y-4">{[{ label: "High concern", value: highCount, color: "bg-red-500" }, { label: "Moderate concern", value: moderateCount, color: "bg-amber-400" }, { label: "Normal", value: normalCount, color: "bg-emerald-500" }, { label: "Areas monitored", value: areaRisks.length, color: "bg-teal-500" }].map((item) => <div key={item.label}><div className="mb-2 flex justify-between text-sm"><span className="text-slate-600">{item.label}</span><span className="font-semibold">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${areaRisks.length ? Math.min(100, item.value / areaRisks.length * 100) : 0}%` }}/></div></div>)}</div>}<div className="mt-5 rounded-xl bg-teal-50 p-3 text-xs leading-5 text-teal-800"><AlertTriangle size={16} className="mb-1"/>Summaries reflect submitted groundwater depth readings and historical monitoring records.</div></Panel>
    </div>
    <AreaDepthInfographicStrip trends={publicTrends} />
    {isAdmin && <Panel title="Latest Community Water Reports" description="Reports loaded from the AquaLedger database."><div className="mb-4 flex justify-end"><Link href="/reports" className="text-sm font-semibold text-teal-700 hover:text-teal-800">Open all reports →</Link></div>{reportLoadError ? <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-800">{reportLoadError} <Link href="/login" className="font-semibold underline">Admin sign in</Link></p> : recentReports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="pb-3 font-medium">Report</th><th className="pb-3 font-medium">Address</th><th className="pb-3 font-medium">Source / depth</th><th className="pb-3 font-medium">Sample date</th></tr></thead><tbody>{recentReports.map((report) => <tr key={report.id} className="border-b border-slate-50 last:border-0"><td className="py-4"><Link href="/reports" className="font-semibold text-teal-700 hover:underline">{reportCodes.get(report.id) ?? report.id}</Link><span className="block text-xs text-slate-400">{report.reporterName}</span></td><td className="py-4 text-slate-600">{report.address}</td><td className="py-4 text-slate-600">{report.sourceType ?? "—"}{report.depth ? ` · ${report.depth} m` : ""}</td><td className="py-4 text-slate-500">{report.sampleDate ?? "—"}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No community water reports have been submitted yet. <Link href="/reports" className="font-semibold text-teal-700 hover:underline">Submit the first report.</Link></p>}</Panel>}
    {isAdmin && <div className="grid gap-6 xl:grid-cols-3"><Panel title="Recent Reported Sources" description="Source details from submitted Supabase reports" className="xl:col-span-2"><div className="mb-4 flex justify-end"><Link href="/sources" className="text-sm font-semibold text-teal-700 hover:text-teal-800">View all sources →</Link></div>{sources.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs text-slate-400"><th className="pb-3 font-medium">Source</th><th className="pb-3 font-medium">Location</th><th className="pb-3 font-medium">Depth</th><th className="pb-3 font-medium">Status</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id} className="border-b border-slate-50 last:border-0"><td className="py-4 font-semibold text-slate-700">{source.name}</td><td className="py-4 text-slate-500">{source.location}</td><td className="py-4 font-medium">{source.level}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${source.color}`}>{source.status}</span></td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No reported sources yet. <Link href="/reports" className="font-semibold text-teal-700 hover:underline">Submit a water report.</Link></p>}</Panel><Panel title="Pakistan Coverage"><Link href="/map" className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-teal-200 bg-teal-50/70 p-5 text-center transition hover:bg-teal-100/70"><Waves size={38} className="text-teal-600"/><p className="mt-3 font-semibold text-slate-700">Open Groundwater Map</p><p className="mt-1 text-xs leading-5 text-slate-500">Browse reported source locations.</p></Link><div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>Map interface</span><span className="font-semibold text-teal-700">{communityReports.length} submissions</span></div></Panel></div>}
  </>;
}


