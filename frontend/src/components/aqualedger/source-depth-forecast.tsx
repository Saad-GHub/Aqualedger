"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Droplets, TrendingDown, TrendingUp } from "lucide-react";
import { Area, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "@/components/aqualedger/app-shell";
import { aggregateSourceMonthlyDepths, forecastDepthForHorizon, reportAreaKey, type DepthForecastInput } from "@/lib/depth-analytics";

const statusStyles: Record<string, string> = {
  "Stable / improving": "bg-emerald-50 text-emerald-700",
  "Normal trend": "bg-teal-50 text-teal-700",
  "Moderate decline": "bg-amber-50 text-amber-800",
  "High decline signal": "bg-red-50 text-red-700",
  "Declining · baseline insufficient": "bg-slate-100 text-slate-700",
};

export function SourceDepthForecast({ reports }: { reports: DepthForecastInput[] }) {
  const [sourceKey, setSourceKey] = useState("");
  const [horizon, setHorizon] = useState(6);
  const sources = useMemo(() => {
    const unique = new Map<string, { key: string; id: string; owner: string; code: string; label: string; area: string; type: string; count: number }>();
    reports.filter((report) => report.sourceId && report.createdBy).forEach((report) => {
      const owner = report.createdBy!;
      const id = report.sourceId!;
      const key = `${owner}:${id}`;
      const source = unique.get(key) ?? { key, id, owner, code: report.sourceCode || `SRC-${id.slice(0, 8).toUpperCase()}`, label: report.sourceLabel || "Tracked source", area: reportAreaKey(report), type: report.sourceType || "Water source", count: 0 };
      source.count += 1;
      unique.set(key, source);
    });
    return [...unique.values()].sort((a, b) => a.area.localeCompare(b.area) || a.label.localeCompare(b.label));
  }, [reports]);
  const selected = sources.find((source) => source.key === sourceKey) ?? sources[0];
  const monthly = useMemo(() => selected ? aggregateSourceMonthlyDepths(reports, selected.id, selected.owner) : [], [reports, selected]);
  const forecast = useMemo(() => forecastDepthForHorizon(monthly, horizon), [horizon, monthly]);
  const style = forecast ? statusStyles[forecast.status] : "bg-slate-100 text-slate-600";
  const isDeclining = forecast ? forecast.projectedChange > 0.05 : false;
  const reportCount = forecast?.monthlyPoints.reduce((sum, point) => sum + point.readings, 0) ?? 0;

  return <Panel title="Per-source depth forecast" description="Separate from the area trend above. Each line follows repeated reports for the same tracked source and account.">
    {!sources.length ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6"><div className="flex items-start gap-3"><Droplets className="mt-0.5 shrink-0 text-teal-600" size={20}/><div><p className="font-semibold text-slate-800">No tracked source history yet</p><p className="mt-1 text-sm leading-6 text-slate-500">When submitting a report, create a named source once (for example, “Home borehole”). For its next monthly report, select that same source ID. This section will then forecast that source independently.</p></div></div></div>
      : <>
        <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]"><label className="text-xs font-semibold text-slate-600">Tracked water source<select value={selected?.key ?? ""} onChange={(event) => setSourceKey(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">{sources.map((source) => <option key={source.key} value={source.key}>{source.code} · {source.label} · {source.area}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Forecast horizon<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option></select></label></div>
        {!forecast ? <div className="flex min-h-56 flex-col items-center justify-center rounded-xl bg-slate-50 p-6 text-center"><AlertTriangle className="mb-2 text-amber-600" size={22}/><p className="font-semibold text-slate-700">Need two reports from different months</p><p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">Submit another dated depth reading for {selected?.code}. Two distinct months give an initial, low-confidence projection; three or more readings improve the trend estimate.</p></div>
          : <>
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Source / area</p><p className="mt-2 font-semibold text-slate-900">{selected?.code} · {selected?.label}</p><p className="mt-1 text-xs text-slate-400">{selected?.area} · {selected?.type}</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Latest monthly average</p><p className="mt-2 text-2xl font-bold text-slate-900">{monthly.at(-1)?.depth.toFixed(2)} m</p><p className="mt-1 text-xs text-slate-400">{forecast.lastMonth} · {reportCount} reports</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Projected after {horizon} months</p><p className="mt-2 text-2xl font-bold text-slate-900">{forecast.projectedDepth.toFixed(2)} m</p><p className="mt-1 text-xs text-slate-400">Change {forecast.projectedChange >= 0 ? "+" : ""}{forecast.projectedChange.toFixed(2)} m</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Source trend</p><span className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${style}`}>{forecast.status}</span><p className="mt-1 text-xs text-slate-400">Confidence: {forecast.confidence} · {Math.abs(forecast.slopePerMonth * 12).toFixed(2)} m/year</p></div>
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)]"><div><div className="mb-2 flex items-center gap-2 text-xs text-slate-500"><span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">Source-specific trend model</span><span>Depth below ground · metres</span></div><div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={forecast.chart} margin={{ top: 12, right: 15, left: 5, bottom: 4 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}/><YAxis reversed unit=" m" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}/><Tooltip cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} formatter={(value, name) => value == null ? ["—", name] : [`${Number(value).toFixed(2)} m`, name === "actual" ? "Observed monthly average" : name === "projected" ? "Projected depth" : name]} labelFormatter={(label) => `Month: ${label}`}/><ReferenceLine x={forecast.lastMonth} stroke="#94a3b8" strokeDasharray="3 3"/><Area dataKey="lower" stackId="source-confidence" stroke="none" fill="transparent" isAnimationActive={false}/><Area dataKey="band" stackId="source-confidence" stroke="none" fill="#bfdbfe" fillOpacity={0.55} isAnimationActive={false}/><Line type="linear" dataKey="actual" name="Observed monthly average" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3, fill: "#0d9488" }} connectNulls/><Line type="linear" dataKey="projected" name="Projected depth" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3, fill: "#2563eb" }} connectNulls/></LineChart></ResponsiveContainer></div><p className="mt-2 text-[11px] leading-5 text-slate-400">The dashed line is the selected source&apos;s projection. The shaded range visualizes model uncertainty, not a guaranteed interval.</p></div>
              <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-slate-800">{isDeclining ? <TrendingDown className="text-red-600" size={19}/> : <TrendingUp className="text-emerald-600" size={19}/>}<h4 className="font-semibold">Source forecast details</h4></div><p className="mt-3 text-sm leading-6 text-slate-600">{isDeclining ? `Depth is projected to increase by ${forecast.projectedChange.toFixed(2)} m over ${horizon} months, if the historical trend continues.` : "The fitted trend does not project a deeper water level over this horizon. Keep recording monthly readings."}</p><div className="mt-4 space-y-2 rounded-lg bg-white p-3 text-xs text-slate-600"><p><strong>Monthly periods:</strong> {forecast.monthlyPoints.length}</p><p><strong>Reports used:</strong> {reportCount}</p><p><strong>Trend fit:</strong> R² {forecast.rSquared.toFixed(2)}</p><p><strong>Historical decline windows:</strong> {forecast.historyWindows}</p>{forecast.normalThreshold !== null && forecast.highThreshold !== null && <p><strong>Local comparison:</strong> typical {forecast.normalThreshold.toFixed(2)} m · high signal above {forecast.highThreshold.toFixed(2)} m</p>}</div>{forecast.monthlyPoints.length === 2 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">Only two monthly points are available. This is an initial straight-line estimate with low confidence; it cannot establish a reliable danger level.</p>}<p className="mt-3 text-[11px] leading-5 text-amber-800">A decline signal is not a certified danger depth or drinking-water safety result. Pump intake, aquifer, pumping, rainfall and recharge data are not included; seasonal groundwater changes can alter the trend.</p></aside>
            </div>
            <details className="mt-5 rounded-lg border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-semibold text-teal-800">View monthly inputs and projection values</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[460px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-slate-400"><th className="py-2">Month</th><th className="py-2">Observed average</th><th className="py-2">Reports</th><th className="py-2">Projection</th></tr></thead><tbody>{forecast.monthlyPoints.map((point) => <tr key={`actual-${point.month}`} className="border-b border-slate-50"><td className="py-2">{point.month}</td><td className="py-2">{point.depth.toFixed(2)} m</td><td className="py-2">{point.readings}</td><td className="py-2">—</td></tr>)}{forecast.chart.slice(-horizon).map((point) => <tr key={`forecast-${point.month}`} className="border-b border-slate-50 text-blue-700"><td className="py-2">{point.month}</td><td className="py-2">—</td><td className="py-2">—</td><td className="py-2">{point.projected?.toFixed(2)} m <span className="text-slate-400">(range {point.lower?.toFixed(2)}–{point.upper?.toFixed(2)} m)</span></td></tr>)}</tbody></table></div></details>
          </>}
      </>}
  </Panel>;
}
