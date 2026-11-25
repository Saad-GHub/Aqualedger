"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageIntro, Panel } from "@/components/aqualedger/app-shell";
import { readPublicAreaSourceTrends, type PublicAreaSourceTrend } from "@/lib/community-water-reports";
import { meanDepth } from "@/lib/depth-analytics";

const colors = ["#0d9488", "#2563eb", "#f59e0b", "#7c3aed", "#e11d48", "#0891b2"];
export function PublicWaterSources() {
  const [trends, setTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { void readPublicAreaSourceTrends().then((items) => { setTrends(items); setError(""); }).catch(() => setError("Public area trends are not connected yet. Run supabase/public-area-source-trends.sql in the Supabase SQL Editor.")); }, []);
  const areas = useMemo(() => {
    const groups = new Map<string, PublicAreaSourceTrend[]>();
    trends.filter((row) => `${row.areaKey} ${row.sourceType} ${row.cityName}`.toLowerCase().includes(query.toLowerCase())).forEach((row) => groups.set(row.areaKey, [...(groups.get(row.areaKey) ?? []), row]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [query, trends]);
  return <>
    <PageIntro eyebrow="Public area summaries" title="Water Sources by Area" description="Explore monthly source and groundwater-depth trends for each reported area. Values are aggregated; individual reports and personal details stay private." />
    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Areas with reports</p><p className="mt-2 text-2xl font-bold">{new Set(trends.map((row) => row.areaKey)).size}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Source categories</p><p className="mt-2 text-2xl font-bold">{new Set(trends.map((row) => row.sourceType)).size}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Reports summarized</p><p className="mt-2 text-2xl font-bold">{trends.reduce((sum, row) => sum + row.reportCount, 0)}</p></div></div>
    <Panel title="Area source trends" description="Open an area to compare its source types over time. Lines show average reported source depth by month.">
      <label className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Search size={17} className="text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search areas or source types…"/></label>
      {error ? <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">{error}</p> : areas.length ? <div className="grid gap-4 xl:grid-cols-2">{areas.map(([area, rows]) => {
        const sources = [...new Set(rows.map((row) => row.sourceType))].sort();
        const reportCount = rows.reduce((sum, row) => sum + row.reportCount, 0);
        const assessed = rows.reduce((sum, row) => sum + row.normalCount + row.moderateCount + row.highCount, 0);
        const riskScore = assessed ? rows.reduce((sum, row) => sum + row.normalCount * 0.5 + row.moderateCount + row.highCount * 2, 0) / assessed : null;
        const risk = riskScore === null ? "Incomplete" : riskScore >= 1.5 ? "High concern" : riskScore >= 0.75 ? "Moderate concern" : "Normal";        const riskStyle = risk === "High concern" ? "bg-red-50 text-red-700" : risk === "Moderate concern" ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-700";
        const monthlyTotals = new Map<string, Map<string, { depthTotal: number; readings: number }>>();
        rows.forEach((row) => {
          if (!row.sampleMonth || row.averageDepthM === null) return;
          const month = row.sampleMonth.slice(0, 7);
          const series = monthlyTotals.get(month) ?? new Map<string, { depthTotal: number; readings: number }>();
          const total = series.get(row.sourceType) ?? { depthTotal: 0, readings: 0 };
          total.depthTotal += row.averageDepthM * row.reportCount;
          total.readings += row.reportCount;
          series.set(row.sourceType, total);
          monthlyTotals.set(month, series);
        });
        const chartData = [...monthlyTotals.entries()].map(([month, series]) => Object.fromEntries([
          ["month", month],
          ...[...series.entries()].map(([source, total]) => [source, meanDepth(total.depthTotal, total.readings) ?? 0]),
        ]) as Record<string, string | number>).sort((a, b) => String(a.month).localeCompare(String(b.month)));        const sourceCounts = new Map<string, number>(); rows.forEach((row) => sourceCounts.set(row.sourceType, (sourceCounts.get(row.sourceType) ?? 0) + row.reportCount));
        return <details key={area} className="group rounded-xl border border-slate-200 bg-white p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><p className="font-semibold text-slate-800">{area}</p><p className="mt-1 text-xs text-slate-500">{reportCount} reports · {sources.length} source types</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${riskStyle}`}>{risk}</span></summary><div className="mt-4 border-t border-slate-100 pt-4"><div className="mb-3 flex flex-wrap gap-2">{sources.map((source) => <span key={source} className="rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-700">{source} · {sourceCounts.get(source) ?? 0}</span>)}</div><div className="h-72 w-full">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4"/><XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }}/><YAxis unit=" m" tick={{ fontSize: 11, fill: "#64748b" }}/><Tooltip formatter={(value, name) => [`${value} m`, name]} contentStyle={{ borderRadius: 12, borderColor: "#dbe3ee" }}/><Legend/>{sources.map((source, index) => <Line key={source} type="monotone" dataKey={source} name={source} connectNulls dot activeDot={{ r: 5 }} stroke={colors[index % colors.length]} strokeWidth={2.5}/>)}</LineChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">No dated depth readings are available for this area yet.</div>}</div><div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>Area risk is a summary of submitted results, not a drinking-water safety certificate. Compare source types and dates when interpreting trends.</div></div></details>;
      })}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No public source summaries are available yet.</p>}
    </Panel>
  </>;
}
