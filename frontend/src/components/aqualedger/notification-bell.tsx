"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, BellOff, Droplets } from "lucide-react";
import {
  readCommunityWaterReports,
  subscribeToCommunityWaterReports,
  type CommunityWaterReport,
} from "@/lib/community-water-reports";
import { normalizeAreaName } from "@/lib/depth-analytics";
import { screenWaterReport } from "@/lib/water-risk-screening";
import { buildReportCodes } from "@/lib/report-display-codes";
import { depthM } from "@/lib/units";

const notificationsEnabled = () => {
  try {
    return localStorage.getItem("aqualedger-notifications") !== "off";
  } catch {
    return true;
  }
};

const riskAlertsEnabled = () => {
  try {
    return localStorage.getItem("aqualedger-risk-alerts") !== "off";
  } catch {
    return true;
  }
};

/** Admin header bell: AI-detected high-concern readings and recent depth submissions. */
export function NotificationBell() {
  const [reports, setReports] = useState<CommunityWaterReport[]>([]);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [bellsOn, setBellsOn] = useState(true);
  const [showRiskAlerts, setShowRiskAlerts] = useState(true);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const syncPrefs = () => {
      setBellsOn(notificationsEnabled());
      setShowRiskAlerts(riskAlertsEnabled());
    };
    const load = () => {
      syncPrefs();
      readCommunityWaterReports()
        .then((items) => {
          if (active) {
            setReports(items);
            setLoadError("");
          }
        })
        .catch(() => {
          if (active) setLoadError("Could not load notifications.");
        });
    };
    load();
    const unsubscribe = subscribeToCommunityWaterReports(load);
    window.addEventListener("aqualedger-settings-updated", syncPrefs);
    window.addEventListener("storage", syncPrefs);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("aqualedger-settings-updated", syncPrefs);
      window.removeEventListener("storage", syncPrefs);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !wrapper.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const codes = useMemo(() => buildReportCodes(reports), [reports]);
  const items = useMemo(() => {
    if (!bellsOn) return [];
    return reports
      .slice(0, 40)
      .map((report) => {
        const screening = screenWaterReport(report);
        return {
          report,
          highConcern: screening.riskLevel === "High concern",
          moderateConcern: screening.riskLevel === "Moderate concern",
        };
      })
      .filter((item) => (showRiskAlerts ? item.highConcern || item.moderateConcern : true))
      .sort((a, b) => Number(b.highConcern) - Number(a.highConcern));
  }, [bellsOn, reports, showRiskAlerts]);

  const highCount = showRiskAlerts ? items.filter((item) => item.highConcern).length : 0;

  return (
    <div ref={wrapper} className="relative">
      <button
        aria-label={
          bellsOn
            ? `Notifications: ${items.length} recent alerts`
            : "Notifications paused"
        }
        aria-expanded={open}
        onClick={() => {
          setBellsOn(notificationsEnabled());
          setShowRiskAlerts(riskAlertsEnabled());
          setOpen((value) => !value);
        }}
        className="glass relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600"
      >
        {bellsOn ? <Bell size={19} /> : <BellOff size={19} className="text-slate-400" />}
        {bellsOn && items.length > 0 && (
          <span
            className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              highCount ? "bg-red-600" : "bg-teal-600"
            }`}
          >
            {items.length > 99 ? "99+" : items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="aqua-popover absolute right-0 z-40 mt-3 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg">

          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {!bellsOn
                ? "Notifications are turned off in Settings."
                : `${items.length} AI alert${items.length === 1 ? "" : "s"}${
                    highCount ? ` · ${highCount} high concern` : ""
                  }`}
            </p>
          </div>
          {!bellsOn ? (
            <div className="px-4 py-5 text-sm text-slate-500">
              <p>Bell &amp; risk notifications are currently paused.</p>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="mt-2 inline-block text-xs font-semibold text-teal-700 hover:underline"
              >
                Enable in Admin Settings →
              </Link>
            </div>
          ) : loadError ? (
            <p className="px-4 py-6 text-sm text-red-700">{loadError}</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              All clear. No flagged groundwater alerts right now.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {items.slice(0, 8).map(({ report, highConcern }) => {
                const alert = highConcern && showRiskAlerts;
                return (
                  <li key={report.id}>
                    <Link
                      href={`/reports?report=${encodeURIComponent(report.id)}`}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          alert ? "bg-red-50 text-red-600" : "bg-teal-50 text-teal-700"
                        }`}
                      >
                        {alert ? <AlertTriangle size={16} /> : <Droplets size={16} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {codes.get(report.id)} · {normalizeAreaName(report.areaName, report.address)}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {alert ? "High concern signal · " : "Reading logged · "}
                          {report.depth ? `${depthM(Number(report.depth))}` : "depth n/a"}
                          {report.sampleDate ? ` · ${report.sampleDate}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs font-semibold">
            <Link
              href="/reports"
              onClick={() => setOpen(false)}
              className="text-teal-700 hover:underline"
            >
              View all reports
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-slate-800 hover:underline"
            >
              Notification settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
