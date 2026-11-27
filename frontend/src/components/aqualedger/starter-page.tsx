"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, MapPin, Search, SlidersHorizontal, Plus, X } from "lucide-react";
import { PageIntro, Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import { notifyCommunityWaterReportsUpdated, readCommunityWaterReports, readMyCommunityWaterReports, readMyTrackedWaterSources, subscribeToCommunityWaterReports, submitCommunityWaterReport, type CommunityWaterReport, type TrackedWaterSource } from "@/lib/community-water-reports";
import { extractAreaFromAddress, feetToMeters, formatDepthMetersAndFeet, hasAreaAndProvince, metersToFeet, normalizeAreaName, PREDEFINED_PAKISTAN_AREAS } from "@/lib/depth-analytics";
import { buildReportCodes } from "@/lib/report-display-codes";
import { DepthForecast } from "@/components/aqualedger/depth-forecast";
import { SourceDepthForecast } from "@/components/aqualedger/source-depth-forecast";
import { depthM } from "@/lib/units";

type PageKey = "map" | "sources" | "monitoring" | "quality" | "reports" | "settings";
function reportAreaLabel(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const cityAliases = ["islamabad", "ict", "karachi", "lahore", "peshawar", "quetta", "multan", "faisalabad", "rawalpindi", "hyderabad", "sialkot", "gujranwala", "bahawalpur", "sukkur"];
  const cityIndex = parts.findIndex((part) => cityAliases.includes(part.toLowerCase()));
  const city = cityIndex >= 0 ? (parts[cityIndex].toLowerCase() === "ict" ? "Islamabad" : parts[cityIndex]) : parts.at(-2) ?? "Pakistan";
  const provinceNames = ["punjab", "sindh", "kpk", "khyber pakhtunkhwa", "balochistan", "ict"];
  const localityParts = (cityIndex >= 0 ? parts.slice(0, cityIndex) : parts.slice(0, -1)).filter((part) => !provinceNames.includes(part.toLowerCase()));
  const locality = localityParts.join(", ") || city;
  return `${locality}, ${city}`;
}
const config: Record<PageKey, { title: string; description: string; subtitle: string; columns: string[]; records: string[][] }> = {
  map: { title: "Groundwater Map", description: "Review locations included in community water reports.", subtitle: "Reported locations", columns: ["Location", "Area", "Source type", "Status"], records: [] },
  sources: { title: "Water Sources", description: "Search water sources recorded in community reports.", subtitle: "Reported sources", columns: ["Source / report", "Location", "Depth", "Review status"], records: [] },
  monitoring: { title: "Monitoring Data", description: "Track sampling dates, groundwater depth, and source records over time.", subtitle: "Monitoring timeline", columns: ["Report ID", "Sample date", "Area", "Source / depth", "Concern"], records: [] },
  quality: { title: "Depth & Source Reports", description: "Review groundwater depth readings and source records across monitored areas.", subtitle: "Depth & source records", columns: ["Report ID", "Address", "Source / depth", "Sample date", "Concern"], records: [] },
  reports: { title: "Log Reading & Submissions", description: "Submit groundwater depth readings and view every entry recorded in your workspace.", subtitle: "Submitted readings", columns: ["Report", "Area", "Source", "Depth", "Sample date", "Concern"], records: [] },
  settings: { title: "Settings", description: "Manage notification preferences for this browser.", subtitle: "Notification preferences", columns: [], records: [] },
};

export function StarterPage({ page }: { page: PageKey }) {
  const data = config[page];
  const { isAdmin, isSignedIn, emailVerified, currentEmail } = useAquaRole();
  const lang = useLanguage();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All records");
  const [tablePage, setTablePage] = useState(1);
  const TABLE_PAGE_SIZE = 50;
  const [selectedRecord, setSelectedRecord] = useState<string[] | null>(null);
  const [communityReports, setCommunityReports] = useState<CommunityWaterReport[]>([]);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [reportName, setReportName] = useState("");
  const [gpsConsent, setGpsConsent] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<{ latitude: number; longitude: number; accuracy: number; capturedAt: string } | null>(null);
  const [gpsMessage, setGpsMessage] = useState("");
  const [reportAddress, setReportAddress] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceSelection, setSourceSelection] = useState("new");
  const [trackedSources, setTrackedSources] = useState<TrackedWaterSource[]>([]);
  const [sourceType, setSourceType] = useState("Tube well");
  const [sourceDepth, setSourceDepth] = useState("");
  const [depthUnit, setDepthUnit] = useState<"m" | "ft">("m");
  const [sampleDate, setSampleDate] = useState("");
  const [reportConcern, setReportConcern] = useState("Seasonal checking");
  const [notifications, setNotifications] = useState(true);
  const [riskAlerts, setRiskAlerts] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [defaultHorizon, setDefaultHorizon] = useState("6");
  const [settingsStatus, setSettingsStatus] = useState("");
  const reportCodes = useMemo(() => buildReportCodes(communityReports), [communityReports]);
  const selectedTrackedSource = trackedSources.find((source) => source.id === sourceSelection);
  // Match what the user typed against the area directory: "lahore" → "Lahore, Punjab".
  function resolveArea(raw: string) {
    const typed = raw.trim();
    if (!typed || hasAreaAndProvince(typed)) return typed;
    const lower = typed.toLowerCase();
    return (
      PREDEFINED_PAKISTAN_AREAS.find((area) => area.toLowerCase().startsWith(`${lower},`)) ??
      PREDEFINED_PAKISTAN_AREAS.find((area) => area.toLowerCase().split(",")[0].trim() === lower) ??
      typed
    );
  }
  function resetReadingForm() {
    setReportName("");
    setReportAddress("");
    setSourceLabel("");
    setSourceSelection("new");
    setSourceType("Tube well");
    setSourceDepth("");
    setDepthUnit("m");
    setSampleDate("");
    setReportConcern("Seasonal checking");
    setGpsConsent(false);
    setGpsPosition(null);
    setGpsMessage("");
    setSubmitError("");
  }
  // Bring any save error into view (it sits at the bottom of a long form, easy to miss on phones).
  useEffect(() => {
    if (submitError) document.getElementById("log-reading-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [submitError]);
  function captureGps() {
    setGpsMessage("");
    if (!navigator.geolocation) { setGpsMessage("This browser does not support location. Enter your address manually."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      setGpsPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() });
      setGpsMessage(`Location captured (about ${Math.round(position.coords.accuracy)} m accuracy).`);
    }, (error) => setGpsMessage(error.code === error.PERMISSION_DENIED ? "Location permission was denied. You can still submit using the typed address." : "Could not get location. Check device location settings or continue with the typed address."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }
  useEffect(() => {
    const refreshReports = () => {
      const loader = page === "reports" && !isAdmin ? readMyCommunityWaterReports : readCommunityWaterReports;
      void loader().then((reports) => {
        setCommunityReports(reports);
        setLoadError("");
        const reportId = page === "reports" ? new URLSearchParams(window.location.search).get("report") : null;
        const match = reportId ? reports.find((report) => report.id === reportId) : undefined;
        if (match) {
          const row = [match.reportCode ?? match.id, normalizeAreaName(match.areaName, match.address), match.sourceType ?? "Water source", match.depth ? formatDepthMetersAndFeet(match.depth) : "—", match.sampleDate ?? "—", match.concern ?? "Depth reading"];
          setSelectedRecord(row);
        }
      }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Could not load saved reports."));
    };

    if (page !== "reports" || isAdmin || isSignedIn) refreshReports();
    const unsubscribe = page !== "reports" || isAdmin || isSignedIn ? subscribeToCommunityWaterReports(refreshReports) : () => {};
    if (page === "reports" && isSignedIn && emailVerified) {
      void readMyTrackedWaterSources().then(setTrackedSources).catch(() => {});
    }
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    const openNewForm = page === "reports" && params.get("new") === "1";
    queueMicrotask(() => {
      if (source) setQuery(source);
      if (openNewForm) setReportFormOpen(true);
      if (page === "settings") {
        setNotifications(localStorage.getItem("aqualedger-notifications") !== "off");
        setRiskAlerts(localStorage.getItem("aqualedger-risk-alerts") !== "off");
        setAutoSync(localStorage.getItem("aqualedger-auto-sync") !== "off");
        setDefaultHorizon(localStorage.getItem("aqualedger-default-horizon") || "6");
      }
    });
    return unsubscribe;
  }, [page, isAdmin, isSignedIn, emailVerified]);
  const reportRow = (report: CommunityWaterReport) => {
    const code = reportCodes.get(report.id) ?? report.id;
    const area = normalizeAreaName(report.areaName, report.address);
    const sourceDepthLabel = `${report.sourceType ?? "Water source"}${report.depth ? ` · ${formatDepthMetersAndFeet(report.depth)}` : ""}`;
    if (page === "monitoring") return [code, report.sampleDate ?? "Date not entered", area, sourceDepthLabel, report.concern ?? "Depth reading"];
    return [code, report.address, sourceDepthLabel, report.sampleDate ?? "—", report.concern ?? "Depth reading"];
  };
  const allRecords = page === "reports" ? communityReports.map((report) => [reportCodes.get(report.id) ?? report.id, normalizeAreaName(report.areaName, report.address), report.sourceType ?? "Water source", report.depth ? formatDepthMetersAndFeet(report.depth) : "—", report.sampleDate ?? "—", report.concern ?? "Depth reading"])
    : page === "sources" ? communityReports.map((report) => [`${report.sourceType ?? "Water source"} · ${reportCodes.get(report.id) ?? report.id}`, normalizeAreaName(report.areaName, report.address), report.depth ? formatDepthMetersAndFeet(report.depth) : "Not provided", report.sampleDate ?? "—"])
    : page === "map" ? communityReports.map((report) => [reportCodes.get(report.id) ?? report.id, normalizeAreaName(report.areaName, report.address), report.address, report.sourceType ?? "Water source", report.sampleDate ?? "—"])
    : page === "monitoring" || page === "quality" ? communityReports.map(reportRow)
    : data.records;
  const parsedDepths = communityReports.map((r) => Number.parseFloat(r.depth ?? "")).filter(Number.isFinite);
  const avgDepthLabel = parsedDepths.length ? formatDepthMetersAndFeet(parsedDepths.reduce((s, v) => s + v, 0) / parsedDepths.length) : "—";
  const areaCount = new Set(communityReports.map((r) => normalizeAreaName(r.areaName, r.address))).size;
  const pageStats: [string, string, string][] = page === "map" ? [["Reported locations", String(new Set(communityReports.map((report) => report.address)).size), "Distinct submitted addresses"], ["Water sources", String(new Set(communityReports.map((report) => `${report.sourceType}|${report.address}`)).size), "Distinct type and location pairs"], ["Average depth", avgDepthLabel, "Across all readings"]]
    : page === "sources" ? [["Listed sources", String(new Set(communityReports.map((report) => `${report.sourceType}|${report.address}`)).size), "Distinct type and location pairs"], ["Community reports", String(communityReports.length), "Saved submissions"], ["Monitored areas", String(areaCount), "Distinct districts / areas"]]
    : page === "monitoring" ? [["Water reports", String(communityReports.length), "Depth submissions"], ["Monitored areas", String(areaCount), "Districts & localities"], ["Average depth", avgDepthLabel, "Mean depth below ground"]]
    : page === "quality" ? [["Depth reports", String(communityReports.length), "Saved depth readings"], ["Monitored areas", String(areaCount), "Districts & localities"], ["Average depth", avgDepthLabel, "Mean depth below ground"]]
    : page === "reports" ? [["My / total readings", String(communityReports.length), "Saved in Supabase"], ["Monitored areas", String(areaCount), "Districts & localities"], ["Average depth", avgDepthLabel, "Mean depth below ground"]]
    : [];
  const rows = useMemo(() => {
    const filterValue = (row: string[]) => page === "reports" ? row[2] : row[row.length - 1];
    return allRecords.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase()) && (filter === "All records" || (page === "reports" || page === "monitoring" || page === "quality" ? row.slice(2).some((value) => value.toLowerCase().includes(filter.toLowerCase())) : filterValue(row).toLowerCase().includes(filter.toLowerCase()))));
  }, [allRecords, filter, query, page]);
  const sourceAreaGroups = useMemo(() => {
    const groups = new Map<string, CommunityWaterReport[]>();
    communityReports.filter((report) => `${report.id} ${report.address} ${report.sourceType ?? ""} ${report.depth ?? ""} ${report.sampleDate ?? ""}`.toLowerCase().includes(query.toLowerCase())).forEach((report) => {
      const area = normalizeAreaName(report.areaName, report.address);
      groups.set(area, [...(groups.get(area) ?? []), report]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [communityReports, query]);
  const filterOptions = [...new Set(page === "reports" ? allRecords.flatMap((row) => [row[2], row[5]]) : page === "monitoring" || page === "quality" ? allRecords.flatMap((row) => [row[4]]) : allRecords.map((row) => row[row.length - 1]))];
  const sourceName = (row: string[]) => page === "sources" ? (row[0].includes(" · ") ? row[0].split(" · ").at(-1)! : row[0]) : page === "map" ? row[0] : row[1];
  const openRecord = (row: string[]) => { setSelectedRecord(row); };
  const expandedReport = selectedRecord ? communityReports.find((report) => report.id === selectedRecord[0] || reportCodes.get(report.id) === selectedRecord[0]) : undefined;
  const selectedReport = selectedRecord ? communityReports.find((report) => report.id === selectedRecord[0] || reportCodes.get(report.id) === selectedRecord[0]) : undefined;
  return <>
    <PageIntro title={page === "reports" && !isAdmin ? tr(lang, "Log a Water Depth Reading", "پانی کی گہرائی کی ریڈنگ درج کریں") : data.title} description={page === "reports" && !isAdmin ? tr(lang, "Record a 3-month groundwater depth reading for your water source to update AI depth forecasts.", "AI پیشگوئی اپڈیٹ کرنے کے لیے اپنے پانی کے ذریعے کی 3 ماہ کی گہرائی درج کریں۔") : data.description} />
    {(page !== "reports" || isAdmin) && <div className="aqua-stats grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{pageStats.map(([label, value, note]) => <div key={label} className="glass glass-lift rounded-3xl p-4 sm:p-5"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div>)}</div>}
    {page === "quality" && <><DepthForecast reports={communityReports}/><SourceDepthForecast reports={communityReports}/></>}
    {page === "sources" && <Panel title="Water sources by area" description="Each area groups its reported sources. Expand an area to see each source and the report it came from.">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Search size={17} className="text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search areas, source types, or reports..."/></label><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"><Filter size={16} className="text-slate-400"/><select value={filter} onChange={(event) => setFilter(event.target.value)} className="bg-transparent outline-none"><option>All records</option>{filterOptions.map((option) => <option key={option}>{option}</option>)}</select></label><button onClick={() => { setQuery(""); setFilter("All records"); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><SlidersHorizontal size={16}/>Reset</button></div>
      {loadError ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{loadError}</p> : sourceAreaGroups.length ? <div className="grid gap-4 xl:grid-cols-2">{sourceAreaGroups.map(([area, areaReports]) => {
        const counts = new Map<string, number>();
        areaReports.forEach((report) => { const source = report.sourceType?.trim() || "Type not provided"; counts.set(source, (counts.get(source) ?? 0) + 1); });
        return <details key={area} className="group rounded-xl border border-slate-200 bg-white p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><p className="font-semibold text-slate-800">{area}</p><p className="mt-1 text-xs text-slate-500">{areaReports.length} report{areaReports.length === 1 ? "" : "s"} · {counts.size} source type{counts.size === 1 ? "" : "s"}</p></div><span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{areaReports.length} source report{areaReports.length === 1 ? "" : "s"}</span></summary><div className="mt-4 border-t border-slate-100 pt-4"><p className="mb-3 text-xs text-slate-500">Sources in this area · expand a source type to see only its reports.</p><div className="grid gap-3 sm:grid-cols-2">{[...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, count]) => {
          const sourceReports = areaReports.filter((report) => (report.sourceType?.trim() || "Type not provided") === source);
          return <details key={source} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-700">{source}</span><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-700">{count} report{count === 1 ? "" : "s"}</span></summary><div className="mt-3 space-y-2 border-t border-slate-200 pt-3">{sourceReports.map((report) => <div key={report.id} className="rounded-md border border-slate-200 bg-white p-3"><Link href={`/reports?report=${encodeURIComponent(report.id)}`} className="text-sm font-semibold text-teal-800 hover:underline">Report {reportCodes.get(report.id) ?? report.id}</Link><p className="mt-1 text-xs text-slate-500">{report.address} · {report.depth ? `${formatDepthMetersAndFeet(report.depth)} depth` : "Depth not provided"}</p><p className="mt-1 text-xs text-slate-500">{report.sampleDate || "Date not provided"} · {report.status}</p></div>)}</div></details>;
        })}</div></div></details>;
      })}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">{communityReports.length ? "No sources match your search or filter." : "No reported water sources yet."}</p>}
    </Panel>}
    {page === "map" && <Panel title="Reported locations" description="Addresses entered in submitted water reports. Map coordinates are not collected yet.">{allRecords.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{allRecords.map((row, index) => <button key={communityReports[index]?.id ?? `${row[0]}-${index}`} onClick={() => openRecord(row)} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-teal-300 hover:bg-teal-50/40"><MapPin size={18} className="mt-0.5 text-teal-600"/><span><span className="block text-sm font-semibold text-slate-700">{row[0]}</span><span className="mt-1 block text-xs text-slate-500">{row[1]} · {row[2]}</span></span></button>)}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No submitted reports include a location yet.</p>}</Panel>}
    {page === "settings" && (
      <div className="space-y-6">
        <Panel
          title="Notification controls"
          description="Live preferences for the admin notification bell and high-concern groundwater alerts. Changes apply immediately in this browser."
        >
          {settingsStatus && (
            <p role="status" className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-800">
              {settingsStatus}
            </p>
          )}
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
            <span>
              <span className="block text-sm font-semibold">Header bell &amp; reading notifications</span>
              <span className="mt-1 block text-xs text-slate-500">
                Enable or pause live alerts in the top notification bell.
              </span>
            </span>
            <input
              aria-label="Header bell notifications"
              type="checkbox"
              checked={notifications}
              onChange={(event) => {
                const next = event.target.checked;
                setNotifications(next);
                localStorage.setItem("aqualedger-notifications", next ? "on" : "off");
                window.dispatchEvent(new Event("aqualedger-settings-updated"));
                setSettingsStatus(next ? "Header notifications enabled." : "Header notifications paused.");
              }}
              className="h-4 w-4 accent-teal-600"
            />
          </label>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
            <span>
              <span className="block text-sm font-semibold">High-concern risk alerts</span>
              <span className="mt-1 block text-xs text-slate-500">
                Highlight critical groundwater drops and high-concern readings in red inside the notification bell.
              </span>
            </span>
            <input
              aria-label="High risk alerts"
              type="checkbox"
              checked={riskAlerts}
              onChange={(event) => {
                const next = event.target.checked;
                setRiskAlerts(next);
                localStorage.setItem("aqualedger-risk-alerts", next ? "on" : "off");
                window.dispatchEvent(new Event("aqualedger-settings-updated"));
                setSettingsStatus(next ? "High-concern risk alerts enabled." : "High-concern risk alerts muted.");
              }}
              className="h-4 w-4 accent-teal-600"
            />
          </label>
        </Panel>

        <Panel
          title="Admin workspace preferences"
          description="Configure live dataset sync, default AI forecast horizon, and quick access to data management."
        >
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
            <span>
              <span className="block text-sm font-semibold">Auto-sync incoming reports</span>
              <span className="mt-1 block text-xs text-slate-500">
                Automatically refresh dashboards when new community readings are logged.
              </span>
            </span>
            <input
              aria-label="Auto-sync incoming reports"
              type="checkbox"
              checked={autoSync}
              onChange={(event) => {
                const next = event.target.checked;
                setAutoSync(next);
                localStorage.setItem("aqualedger-auto-sync", next ? "on" : "off");
                setSettingsStatus(next ? "Auto-sync enabled." : "Auto-sync disabled.");
              }}
              className="h-4 w-4 accent-teal-600"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-100 p-4">
            <div>
              <p className="text-sm font-semibold">Default AI forecast horizon</p>
              <p className="mt-1 text-xs text-slate-500">
                Preferred projection window for admin review sessions.
              </p>
            </div>
            <select
              aria-label="Default AI forecast horizon"
              value={defaultHorizon}
              onChange={(event) => {
                const next = event.target.value;
                setDefaultHorizon(next);
                localStorage.setItem("aqualedger-default-horizon", next);
                setSettingsStatus(`Default forecast horizon set to ${next} months.`);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
            >
              <option value="3">3 months</option>
              <option value="6">6 months</option>
              <option value="12">12 months (1 year)</option>
              <option value="36">36 months (3 years)</option>
              <option value="60">60 months (5 years)</option>
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/data-management"
                className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Open Data Management →
              </Link>
              <Link
                href="/reports"
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Community Reports
              </Link>
            </div>
            <button
              type="button"
              onClick={() => {
                setNotifications(true);
                setRiskAlerts(true);
                setAutoSync(true);
                setDefaultHorizon("6");
                localStorage.setItem("aqualedger-notifications", "on");
                localStorage.setItem("aqualedger-risk-alerts", "on");
                localStorage.setItem("aqualedger-auto-sync", "on");
                localStorage.setItem("aqualedger-default-horizon", "6");
                window.dispatchEvent(new Event("aqualedger-settings-updated"));
                setSettingsStatus("All admin preferences reset to defaults.");
              }}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Reset defaults
            </button>
          </div>
        </Panel>
      </div>
    )}
    {page === "reports" && <Panel title={isAdmin ? tr(lang, "Log a water depth reading", "پانی کی گہرائی کی ریڈنگ درج کریں") : tr(lang, "Log a 3-Month Water Depth Reading", "3 ماہ کی پانی کی گہرائی درج کریں")} description={tr(lang, "Sign in with your email and password (or create and verify a new account once). Log your water depth every 3 months to update your AI depth predictions and area trends.", "اپنے ای میل سے سائن ان کریں اور ہر 3 ماہ بعد گہرائی کی ریڈنگ درج کر کے AI پیشگوئی اپڈیٹ کریں۔")}>{submitSuccess && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800"><span>{submitSuccess}</span><Link href="/my-sources" className="font-semibold underline">{tr(lang, "View My Sources & AI Prediction →", "میرے ذرائع اور AI پیشگوئی دیکھیں ←")}</Link></div>}{!isSignedIn ? <div className="flex flex-wrap items-center gap-3"><Link href="/login?role=user" className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">{tr(lang, "Sign in with Email OTP", "ای میل OTP سے سائن ان کریں")}</Link><Link href="/my-sources?demo=1" className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-100">{tr(lang, "Continue as Demo Farmer →", "ڈیمو کسان کے طور پر جاری رکھیں ←")}</Link><Link href="/signup" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">{tr(lang, "Create account", "اکاؤنٹ بنائیں")}</Link></div> : <><div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-teal-50 p-3 text-xs text-teal-800"><span>{tr(lang, "Signed in as", "سائن ان")}: <strong>{currentEmail}</strong> · {tr(lang, "verified account", "تصدیق شدہ اکاؤنٹ")}</span><Link href="/my-sources" className="font-semibold underline">{tr(lang, "My Sources & Forecast", "میرے ذرائع اور پیشگوئی")}</Link></div><button onClick={() => setReportFormOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><Plus size={16}/>{reportFormOpen ? tr(lang, "Close form", "فارم بند کریں") : tr(lang, "New water depth reading", "نئی ریڈنگ درج کریں")}</button></>}{reportFormOpen && isSignedIn && <form noValidate className="mt-4 space-y-5 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:p-5" onSubmit={async (event) => { event.preventDefault(); const errs: Record<string, string> = {}; if (!reportName.trim()) errs.name = "Please enter your name."; if (!selectedTrackedSource && !sourceLabel.trim()) errs.sourceLabel = "Please enter a source name (e.g. Home tube well)."; if (!reportAddress.trim()) errs.address = "Please enter your location with City, Province."; else if (!hasAreaAndProvince(reportAddress)) errs.address = "Include both City and Province (e.g. Model Town, Bahawalpur, Punjab)."; const parsedDepth = Number.parseFloat(sourceDepth); if (!sourceDepth || !Number.isFinite(parsedDepth) || parsedDepth <= 0) errs.depth = "Enter a valid positive water depth."; if (!sampleDate) errs.sampleDate = "Please select the reading date."; setFieldErrors(errs); if (!emailVerified) { setSubmitError("Your account email must be verified before saving."); return; } if (Object.keys(errs).length > 0) { setSubmitError("Please fix the highlighted fields below."); return; } const depthInMeters = (depthUnit === "ft" ? feetToMeters(parsedDepth) : parsedDepth).toFixed(2); const canonicalArea = extractAreaFromAddress(reportAddress); setIsSubmitting(true); setSubmitError(""); setSubmitSuccess(""); try { const submission = await submitCommunityWaterReport({ reporterName: reportName.trim(), address: reportAddress.trim(), areaName: canonicalArea, sourceType, sourceId: selectedTrackedSource?.id, sourceCode: selectedTrackedSource?.code, sourceLabel: selectedTrackedSource?.label ?? sourceLabel.trim(), depth: depthInMeters, sampleDate, concern: reportConcern, measurements: {}, locationConsent: gpsConsent, latitude: gpsConsent ? gpsPosition?.latitude ?? null : null, longitude: gpsConsent ? gpsPosition?.longitude ?? null : null, locationAccuracyM: gpsConsent ? gpsPosition?.accuracy ?? null : null, locationCapturedAt: gpsConsent ? gpsPosition?.capturedAt ?? null : null }); const { id, sourceId, sourceCode, sourceLabel: savedSourceLabel } = submission; const submitted = { id, sourceId, sourceCode, sourceLabel: savedSourceLabel, reporterName: reportName.trim(), address: reportAddress.trim(), areaName: canonicalArea, areaKey: canonicalArea, sourceType, depth: depthInMeters, sampleDate, concern: reportConcern, status: "under_review", measurements: {} }; const reportCode = buildReportCodes([submitted, ...communityReports]).get(id) ?? "new report"; setCommunityReports((current) => [submitted, ...current]); setTrackedSources((current) => current.some((source) => source.id === sourceId) ? current : [{ id: sourceId, code: sourceCode, label: savedSourceLabel, areaName: canonicalArea, address: reportAddress.trim(), sourceType }, ...current]); setSubmitSuccess(`Reading ${reportCode} saved for ${sourceCode} (${savedSourceLabel}). Your AI depth prediction and area comparison are updated.`); notifyCommunityWaterReportsUpdated(); setReportName(""); setReportAddress(""); setSourceLabel(""); setSourceSelection("new"); setGpsConsent(false); setGpsPosition(null); setGpsMessage(""); setSourceDepth(""); setDepthUnit("m"); setSampleDate(""); setReportConcern("Seasonal checking"); setFieldErrors({}); setReportFormOpen(false); } catch (error) { const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error); const code = error && typeof error === "object" && "code" in error ? ` [${String(error.code)}]` : ""; setSubmitError(`Report could not be saved${code}: ${detail}`); } finally { setIsSubmitting(false); } }}>
      <div className="rounded-xl border border-teal-100 bg-white p-4"><h4 className="text-sm font-bold text-slate-800">{tr(lang, "Account verified", "اکاؤنٹ تصدیق شدہ")}</h4><p className="mt-1 text-xs text-slate-500">This reading will be saved under {currentEmail} and linked to your personal My Sources dashboard.</p><label className="mt-3 block max-w-sm text-xs font-semibold text-slate-600">{tr(lang, "Your name", "آپ کا نام")}<input value={reportName} onChange={(event) => { setReportName(event.target.value); setFieldErrors((f) => ({ ...f, name: "" })); }} placeholder={tr(lang, "Your name", "آپ کا نام")} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"/>{fieldErrors.name && <span className="mt-1 block text-[11px] font-medium text-red-600">{fieldErrors.name}</span>}</label></div>
      <div><h4 className="text-sm font-bold text-slate-800">{tr(lang, "Water source & depth reading", "پانی کا ذریعہ اور گہرائی کی ریڈنگ")}</h4><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">{tr(lang, "Track a source", "سورس منتخب کریں")}<select value={sourceSelection} onChange={(event) => { const value = event.target.value; const existing = trackedSources.find((source) => source.id === value); setSourceSelection(value); if (existing) { setSourceLabel(existing.label); setReportAddress(existing.address || existing.areaName); setSourceType(existing.sourceType); } else { setSourceLabel(""); setReportAddress(""); setSourceType("Tube well"); } }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option value="new">{tr(lang, "Create a new source ID", "نیا سورس آئی ڈی بنائیں")}</option>{trackedSources.map((source) => <option key={source.id} value={source.id}>{source.code} · {source.label} · {source.areaName}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">{tr(lang, "Source name / label", "سورس کا نام")}<input readOnly={Boolean(selectedTrackedSource)} value={sourceLabel} onChange={(event) => { setSourceLabel(event.target.value); setFieldErrors((f) => ({ ...f, sourceLabel: "" })); }} placeholder="e.g. Home tube well" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-teal-500 read-only:bg-slate-100"/>{fieldErrors.sourceLabel && <span className="mt-1 block text-[11px] font-medium text-red-600">{fieldErrors.sourceLabel}</span>}</label><label className="text-xs font-semibold text-slate-600 sm:col-span-2">{tr(lang, "Location / Address (include City, Province)", "مقام / مکمل پتہ (شہر اور صوبہ شامل کریں)")}<input list="aqualedger-predefined-areas" value={reportAddress} onChange={(event) => { setReportAddress(event.target.value); setFieldErrors((f) => ({ ...f, address: "" })); }} readOnly={Boolean(selectedTrackedSource)} placeholder="e.g. Model Town B, Bahawalpur, Punjab (or select a City, Province)" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-teal-500 read-only:bg-slate-100"/>{fieldErrors.address && <span className="mt-1 block text-[11px] font-medium text-red-600">{fieldErrors.address}</span>}<datalist id="aqualedger-predefined-areas">{PREDEFINED_PAKISTAN_AREAS.map((area) => <option key={area} value={area} />)}</datalist></label><label className="text-xs font-semibold text-slate-600">{tr(lang, "Water source type", "پانی کے ذریعے کی قسم")}<select value={sourceType} disabled={Boolean(selectedTrackedSource)} onChange={(event) => setSourceType(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option>Tube well</option><option>Hand pump</option><option>Community well</option><option>Borehole</option><option>Spring</option><option>Other</option></select></label><label className="text-xs font-semibold text-slate-600">{tr(lang, "Water depth below ground", "زمین سے پانی کی گہرائی")}<div className="mt-1 flex gap-2"><input type="number" min="0" step="0.1" value={sourceDepth} onChange={(event) => { setSourceDepth(event.target.value); setFieldErrors((f) => ({ ...f, depth: "" })); }} placeholder={depthUnit === "m" ? "e.g. 42.5 m" : "e.g. 139.4 ft"} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-teal-500"/><select aria-label="Depth unit" value={depthUnit} onChange={(event) => { const next = event.target.value as "m" | "ft"; if (next !== depthUnit) { const num = Number.parseFloat(sourceDepth); if (Number.isFinite(num) && num > 0) { setSourceDepth(next === "ft" ? metersToFeet(num).toFixed(1) : feetToMeters(num).toFixed(2)); } setDepthUnit(next); } }} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700"><option value="m">Meters (m)</option><option value="ft">Feet (ft)</option></select></div>{fieldErrors.depth && <span className="mt-1 block text-[11px] font-medium text-red-600">{fieldErrors.depth}</span>}{sourceDepth && Number.isFinite(Number.parseFloat(sourceDepth)) && Number.parseFloat(sourceDepth) > 0 && <span className="mt-1 block text-[11px] font-normal text-teal-700">{depthUnit === "m" ? `= ${metersToFeet(Number.parseFloat(sourceDepth)).toFixed(1)} ft` : `= ${feetToMeters(Number.parseFloat(sourceDepth)).toFixed(2)} m (stored in meters)`}</span>}</label><label className="text-xs font-semibold text-slate-600">{tr(lang, "Reading / sample date", "ریڈنگ کی تاریخ")}<input type="date" value={sampleDate} onChange={(event) => { setSampleDate(event.target.value); setFieldErrors((f) => ({ ...f, sampleDate: "" })); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-teal-500"/>{fieldErrors.sampleDate && <span className="mt-1 block text-[11px] font-medium text-red-600">{fieldErrors.sampleDate}</span>}</label><label className="text-xs font-semibold text-slate-600">{tr(lang, "Main purpose / concern", "بنیادی مقصد / مسئلہ")}<select value={reportConcern} onChange={(event) => setReportConcern(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option>Seasonal checking</option><option>Low water level</option><option>Dry well</option><option>Supply interruption</option></select></label></div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="text-sm font-bold text-slate-800">Location pin (optional)</h4><p className="mt-1 text-xs text-slate-500">Your typed address is still required. GPS coordinates are attached only if you consent and capture them.</p><label className="mt-3 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={gpsConsent} onChange={(event) => { setGpsConsent(event.target.checked); setGpsMessage(""); if (!event.target.checked) setGpsPosition(null); }} className="mt-0.5 accent-teal-700"/><span>I agree to share this report’s device location to help place it on the map.</span></label>{gpsConsent && <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={captureGps} className="inline-flex items-center gap-2 rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-800"><MapPin size={16}/>Use my current location</button>{gpsPosition && <span className="text-xs text-slate-500">{gpsPosition.latitude.toFixed(5)}, {gpsPosition.longitude.toFixed(5)} · ±{Math.round(gpsPosition.accuracy)} m</span>}</div>}{gpsMessage && <p role="status" className="mt-2 text-xs text-slate-600">{gpsMessage}</p>}</div>
      {submitError && <p id="log-reading-error" role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center"><button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5">{isSubmitting ? tr(lang, "Saving…", "محفوظ ہو رہا ہے…") : tr(lang, "Submit & See Updated Forecast", "محفوظ کریں اور پیشگوئی دیکھیں")}</button><button type="button" onClick={resetReadingForm} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:py-2.5"><SlidersHorizontal size={15}/>{tr(lang, "Reset form", "فارم صاف کریں")}</button></div>
    </form>}</Panel>}
    {page === "reports" && selectedRecord && selectedReport && <Panel title={`Water report ${reportCodes.get(selectedReport.id) ?? selectedReport.id}`} description="Submitted water source and depth details."><div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Reporter", selectedReport.reporterName], ["Area", selectedReport.areaName || reportAreaLabel(selectedReport.address)], ["Full address", selectedReport.address], ["Tracked source", selectedReport.sourceCode ? `${selectedReport.sourceCode} · ${selectedReport.sourceLabel ?? ""}` : undefined], ["Source type", selectedReport.sourceType], ["Source depth", selectedReport.depth ? formatDepthMetersAndFeet(selectedReport.depth) : undefined], ["Sample date", selectedReport.sampleDate], ["GPS location", selectedReport.latitude != null && selectedReport.longitude != null ? `${selectedReport.latitude.toFixed(5)}, ${selectedReport.longitude.toFixed(5)}${selectedReport.locationAccuracyM == null ? "" : ` (±${Math.round(selectedReport.locationAccuracyM)} m)`}` : "Not shared"], ["Concern", selectedReport.concern]].filter((item) => item[1]).map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>)}</div><button onClick={() => setSelectedRecord(null)} className="mt-2 rounded-lg px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">Close details</button></Panel>}
    {selectedRecord && ["map", "sources"].includes(page) && <Panel title={`Selected location: ${sourceName(selectedRecord)}`} description="Details from the selected community report."><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex flex-wrap gap-2">{selectedRecord.map((value, index) => <span key={`${value}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{data.columns[index]}: <strong className="text-slate-800">{value}</strong></span>)}</div><button onClick={() => setSelectedRecord(null)} aria-label="Close selected location" className="self-start rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={17}/></button></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/monitoring?source=${encodeURIComponent(sourceName(selectedRecord))}`} className="rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">View monitoring readings →</Link></div></Panel>}
    {page !== "settings" && page !== "sources" && (page !== "reports" || isSignedIn || isAdmin) && <Panel title={page === "reports" && !isAdmin ? tr(lang, "My Submitted Readings", "میری جمع کرائی گئی ریڈنگز") : data.subtitle} description={page === "monitoring" ? tr(lang, "Readings are organized by sampling date and area. Select a row to inspect source and depth details.", "ریڈنگز تاریخ اور علاقے کے لحاظ سے ترتیب دی گئی ہیں۔ تفصیل دیکھنے کے لیے کسی قطار پر کلک کریں۔") : page === "reports" && !isAdmin ? tr(lang, "Every reading you have submitted appears here. Click any row to view its details.", "آپ کی جمع کرائی گئی تمام ریڈنگز یہاں موجود ہیں۔ تفصیل دیکھنے کے لیے کسی قطار پر کلک کریں۔") : tr(lang, "Records shown here come from submitted depth readings.", "یہ ریکارڈ جمع کرائی گئی گہرائی کی ریڈنگز پر مبنی ہیں۔")}> 
      <div className="mb-4 flex flex-col gap-3 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Search size={17} className="text-slate-400"/><input value={query} onChange={(event) => { setQuery(event.target.value); setTablePage(1); }} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder={tr(lang, `Search ${data.title.toLowerCase()}...`, "تلاش کریں...")}/></label><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"><Filter size={16} className="text-slate-400"/><select value={filter} onChange={(event) => { setFilter(event.target.value); setTablePage(1); }} className="bg-transparent outline-none"><option value="All records">{tr(lang, "All records", "تمام ریکارڈ")}</option>{filterOptions.map((option) => <option key={option}>{option}</option>)}</select></label><button onClick={() => { setQuery(""); setFilter("All records"); setTablePage(1); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><SlidersHorizontal size={16}/>{tr(lang, "Reset", "ری سیٹ")}</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-140 text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs text-slate-400">{data.columns.map((column) => <th key={column} className="pb-3 font-medium">{column}</th>)}</tr></thead><tbody>{rows.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE).map((row) => { const recordIndex = allRecords.indexOf(row); const recordKey = communityReports[recordIndex]?.id ?? `${row[0]}-${recordIndex}`; const isExpanded = selectedRecord?.[0] === row[0]; return <Fragment key={recordKey}><tr onClick={() => { if (page === "reports") { setSelectedRecord(row); } else if (page === "monitoring" || page === "quality") setSelectedRecord(isExpanded ? null : row); else if (["map", "sources"].includes(page)) openRecord(row); }} aria-expanded={page === "monitoring" || page === "quality" || page === "reports" ? isExpanded : undefined} className={`border-b border-slate-50 last:border-0 ${["map", "sources", "monitoring", "quality", "reports"].includes(page) ? "cursor-pointer hover:bg-teal-50/50" : ""}`}>{row.map((cell, index) => <td key={`${row[0]}-${index}`} className={`py-4 ${index === 0 ? "font-semibold text-slate-700" : "text-slate-500"}`}>{cell}</td>)}</tr>{isExpanded && (page === "monitoring" || page === "quality") && <tr className="border-b border-teal-100"><td colSpan={data.columns.length} className="bg-teal-50/30 p-4"><div className="rounded-xl border border-teal-100 bg-white p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-slate-800">{expandedReport ? `Depth report · ${reportCodes.get(expandedReport.id) ?? expandedReport.id}` : `Report · ${row[0]}`}</h4><p className="mt-1 text-xs text-slate-500">{expandedReport ? "Water source and depth details" : "No report details are available for this row."}</p></div>{expandedReport && <Link href="/reports" className="text-sm font-semibold text-teal-700 hover:underline">Open community report →</Link>}</div>{expandedReport ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[["Reporter", expandedReport.reporterName], ["Address", expandedReport.address], ["Source type", expandedReport.sourceType], ["Source depth", expandedReport.depth ? formatDepthMetersAndFeet(expandedReport.depth) : undefined], ["Sample date", expandedReport.sampleDate], ["Concern", expandedReport.concern]].filter((item) => item[1]).map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>)}</div> : <p className="text-sm text-slate-500">No saved report details are available for this row.</p>}</div></td></tr>}</Fragment>; })}</tbody></table>{rows.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No matching records. Try changing your search or filter.</p>}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <span>{loadError ? <span className="text-amber-700">{loadError} <Link href="/login" className="font-semibold underline">Admin sign in</Link></span> : `Showing ${rows.length ? (tablePage - 1) * TABLE_PAGE_SIZE + 1 : 0}–${Math.min(tablePage * TABLE_PAGE_SIZE, rows.length)} of ${rows.length} matching (${allRecords.length} total).`}</span>
        {rows.length > TABLE_PAGE_SIZE && (
          <div className="flex items-center gap-2">
            <button type="button" disabled={tablePage <= 1} onClick={() => setTablePage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">{tr(lang, "Previous", "پچھلا")}</button>
            <span className="font-semibold text-slate-600">{tr(lang, `Page ${tablePage} of ${Math.ceil(rows.length / TABLE_PAGE_SIZE)}`, `صفحہ ${tablePage} از ${Math.ceil(rows.length / TABLE_PAGE_SIZE)}`)}</span>
            <button type="button" disabled={tablePage >= Math.ceil(rows.length / TABLE_PAGE_SIZE)} onClick={() => setTablePage((p) => Math.min(Math.ceil(rows.length / TABLE_PAGE_SIZE), p + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">{tr(lang, "Next", "اگلا")}</button>
          </div>
        )}
      </div>
    </Panel>}
  </>;
}






