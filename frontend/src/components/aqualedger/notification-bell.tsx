"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, Clock } from "lucide-react";
import { readCommunityWaterReports, subscribeToCommunityWaterReports, type CommunityWaterReport } from "@/lib/community-water-reports";
import { screenWaterReport } from "@/lib/water-risk-screening";
import { buildReportCodes } from "@/lib/report-display-codes";

const AWAITING = new Set(["received", "under_review"]);
const riskAlertsEnabled = () => { try { return localStorage.getItem("aqualedger-risk-alerts") !== "off"; } catch { return true; } };

/** Admin header bell: reports still waiting for review, with high-concern results listed first. */
export function NotificationBell() {
  const [reports, setReports] = useState<CommunityWaterReport[]>([]);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [showRiskAlerts, setShowRiskAlerts] = useState(true);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = () => { setShowRiskAlerts(riskAlertsEnabled()); readCommunityWaterReports().then((items) => { if (active) { setReports(items); setLoadError(""); } }).catch(() => { if (active) setLoadError("Could not load notifications."); }); };
    load();
    const unsubscribe = subscribeToCommunityWaterReports(load);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const codes = useMemo(() => buildReportCodes(reports), [reports]);
  const items = useMemo(() => reports.filter((report) => AWAITING.has(report.status)).map((report) => ({ report, highConcern: screenWaterReport(report).riskLevel === "High concern" })).sort((a, b) => Number(b.highConcern) - Number(a.highConcern)), [reports]);
  const highCount = showRiskAlerts ? items.filter((item) => item.highConcern).length : 0;

  return <div ref={wrapper} className="relative">
    <button aria-label={`Notifications: ${items.length} awaiting review`} aria-expanded={open} onClick={() => { setShowRiskAlerts(riskAlertsEnabled()); setOpen((value) => !value); }} className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"><Bell size={19}/>{items.length > 0 && <span className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${highCount ? "bg-red-600" : "bg-teal-600"}`}>{items.length > 99 ? "99+" : items.length}</span>}</button>
    {open && <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-lg">
      <div className="border-b border-slate-100 px-4 py-3"><p className="text-sm font-semibold">Notifications</p><p className="mt-0.5 text-xs text-slate-500">{items.length} report{items.length === 1 ? "" : "s"} awaiting review{highCount ? ` · ${highCount} high concern` : ""}</p></div>
      {loadError ? <p className="px-4 py-6 text-sm text-red-700">{loadError}</p> : items.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">All caught up. No reports are waiting for review.</p> : <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">{items.slice(0, 8).map(({ report, highConcern }) => { const alert = highConcern && showRiskAlerts; return <li key={report.id}><Link href="/reports" onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-slate-50"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${alert ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>{alert ? <AlertTriangle size={16}/> : <Clock size={16}/>}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{codes.get(report.id)} · {report.areaName || report.address}</span><span className="mt-0.5 block text-xs text-slate-500">{alert ? "High concern result, " : ""}{report.status === "received" ? "received" : "under review"}{report.sampleDate ? ` · sampled ${report.sampleDate}` : ""}</span></span></Link></li>; })}</ul>}
      <Link href="/reports" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-teal-700 hover:bg-teal-50">Review community reports</Link>
    </div>}
  </div>;
}
