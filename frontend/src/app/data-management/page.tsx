"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileJson,
  MapPin,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { AdminOnly, PageIntro, Panel } from "@/components/aqualedger/app-shell";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import {
  deleteWaterReportsByIds,
  notifyCommunityWaterReportsUpdated,
  readCommunityWaterReports,
  updateCommunityReportStatus,
  type CommunityWaterReport,
  type ReportReviewStatus,
} from "@/lib/community-water-reports";
import {
  translateAreaUr,
  translateConcernUr,
  translateDepthUnitsUr,
  translateSourceTypeUr,
} from "@/lib/urdu-translations";
import {
  detectAreaDepthAnomalies,
  formatDepthMetersAndFeet,
  hasAreaAndProvince,
  normalizeAreaName,
  PREDEFINED_PAKISTAN_AREAS,
} from "@/lib/depth-analytics";
import { buildReportCodes } from "@/lib/report-display-codes";

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function DataManagementPage() {
  const [reports, setReports] = useState<CommunityWaterReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [cleanStatus, setCleanStatus] = useState("");
  const [selectedArea, setSelectedArea] = useState("All areas");
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState("");

  const loadDataset = () => {
    setLoading(true);
    void readCommunityWaterReports()
      .then((rows) => {
        setReports(rows);
        setError("");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load dataset.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    void readCommunityWaterReports()
      .then((rows) => {
        if (!active) return;
        setReports(rows);
        setError("");
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load dataset.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const reportCodes = useMemo(() => buildReportCodes(reports), [reports]);
  const pendingReports = useMemo(
    () => reports.filter((report) => report.status === "under_review"),
    [reports]
  );

  const handlePendingStatus = async (report: CommunityWaterReport, nextStatus: ReportReviewStatus) => {
    const code = reportCodes.get(report.id) ?? report.id.slice(0, 8);
    setModeratingId(report.id);
    setReviewMessage("");
    try {
      await updateCommunityReportStatus(report.id, nextStatus);
      setReports((current) =>
        current.map((item) => (item.id === report.id ? { ...item, status: nextStatus } : item))
      );
      notifyCommunityWaterReportsUpdated();
      setReviewMessage(
        nextStatus === "verified"
          ? `${code} approved and verified.`
          : `${code} marked as ${nextStatus.replaceAll("_", " ")}.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update report status.");
    } finally {
      setModeratingId(null);
    }
  };

  const handlePendingDelete = async (report: CommunityWaterReport) => {
    const code = reportCodes.get(report.id) ?? report.id.slice(0, 8);
    setModeratingId(report.id);
    setReviewMessage("");
    try {
      await deleteWaterReportsByIds([report.id]);
      setReports((current) => current.filter((item) => item.id !== report.id));
      notifyCommunityWaterReportsUpdated();
      setReviewMessage(`Deleted pending report ${code}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete report.");
    } finally {
      setModeratingId(null);
    }
  };
  const predefinedSet = useMemo(() => new Set(PREDEFINED_PAKISTAN_AREAS), []);

  const audit = useMemo(() => {
    const areas = new Map<string, number>();
    const unmappedAreas: { id: string; code: string; area: string; address: string }[] = [];
    const seenKeys = new Map<string, string>();
    const duplicates: { id: string; code: string; area: string; date: string; depth: string }[] = [];
    let missingGps = 0;

    const activeReports = reports.filter((r) => r.status !== "rejected");
    const excludedReports = reports
      .filter((r) => r.status === "rejected")
      .map((r) => ({
        id: r.id,
        code: reportCodes.get(r.id) ?? r.id,
        area: normalizeAreaName(r.areaName || r.areaKey, r.address),
        depth: r.depth ?? "",
        date: r.sampleDate ?? "",
      }));

    for (const report of activeReports) {
      const area = normalizeAreaName(report.areaName || report.areaKey, report.address);
      const code = reportCodes.get(report.id) ?? report.id;
      areas.set(area, (areas.get(area) ?? 0) + 1);

      if (!predefinedSet.has(area) || !hasAreaAndProvince(area)) {
        unmappedAreas.push({ id: report.id, code, area, address: report.address });
      }

      if (report.latitude == null || report.longitude == null) {
        missingGps += 1;
      }

      const dedupeKey = `${report.sourceId || area}|${report.sampleDate || ""}|${report.depth || ""}|${report.sourceType || ""}`;
      if (report.sampleDate && report.depth) {
        if (seenKeys.has(dedupeKey)) {
          duplicates.push({
            id: report.id,
            code,
            area,
            date: report.sampleDate,
            depth: report.depth,
          });
        } else {
          seenKeys.set(dedupeKey, code);
        }
      }
    }

    const outliers = detectAreaDepthAnomalies(activeReports).map((a) => ({
      ...a,
      code: reportCodes.get(a.id) ?? a.id,
    }));

    return {
      areaList: [...areas.entries()].sort(([a], [b]) => a.localeCompare(b)),
      unmappedAreas,
      outliers,
      duplicates,
      excludedReports,
      missingGps,
    };
  }, [predefinedSet, reportCodes, reports]);

  const exportRows = useMemo(() => {
    if (selectedArea === "All areas") return reports;
    return reports.filter(
      (report) =>
        normalizeAreaName(report.areaName || report.areaKey, report.address) === selectedArea
    );
  }, [reports, selectedArea]);

  const handleExportCsv = () => {
    const header = [
      "Report Code",
      "Canonical Area",
      "Address",
      "Source Type",
      "Depth (m)",
      "Sample Date",
      "Concern",
      "Latitude",
      "Longitude",
    ].join(",");
    const lines = exportRows.map((report) =>
      [
        reportCodes.get(report.id) ?? report.id,
        normalizeAreaName(report.areaName || report.areaKey, report.address),
        report.address,
        report.sourceType ?? "",
        report.depth ?? "",
        report.sampleDate ?? "",
        report.concern ?? "",
        report.latitude ?? "",
        report.longitude ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
    const slug = selectedArea === "All areas" ? "all-areas" : selectedArea.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadTextFile(`aqualedger-dataset-${slug}.csv`, [header, ...lines].join("\n"), "text/csv;charset=utf-8");
  };

  const handleExportJson = () => {
    const payload = exportRows.map((report) => ({
      code: reportCodes.get(report.id) ?? report.id,
      area: normalizeAreaName(report.areaName || report.areaKey, report.address),
      address: report.address,
      sourceType: report.sourceType ?? null,
      depthM: report.depth ? Number(report.depth) : null,
      sampleDate: report.sampleDate ?? null,
      concern: report.concern ?? null,
      latitude: report.latitude ?? null,
      longitude: report.longitude ?? null,
    }));
    const slug = selectedArea === "All areas" ? "all-areas" : selectedArea.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadTextFile(`aqualedger-dataset-${slug}.json`, JSON.stringify(payload, null, 2), "application/json");
  };

  const lang = useLanguage();
  return (
    <AdminOnly>
      <PageIntro
        eyebrow={tr(lang, "Admin Dataset Toolkit", "ایڈمن ڈیٹا سیٹ ٹول کٹ")}
        title={tr(lang, "Data Management & Quality Audit", "ڈیٹا مینجمنٹ اور کوالٹی آڈٹ")}
        description={tr(
          lang,
          "Inspect area normalization health, detect duplicate or outlier depth readings, and export cleaned datasets in CSV or JSON.",
          "علاقوں کے ڈیٹا کی صحت جانچیں، ڈپلیکیٹ یا غیر معمولی گہرائی کی ریڈنگز پکڑیں، اور صاف ڈیٹا CSV یا JSON میں ڈاؤن لوڈ کریں۔"
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{tr(lang, "Total records audited", "کل آڈٹ شدہ ریکارڈز")}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {loading && reports.length === 0 ? <span className="inline-block h-7 w-16 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-200" /> : reports.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">{loading && reports.length === 0 ? tr(lang, "Loading…", "لوڈ ہو رہا ہے…") : tr(lang, `Across ${audit.areaList.length} canonical areas`, `${audit.areaList.length} علاقوں میں`)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{tr(lang, "Unmapped / custom areas", "غیر نقشہ شدہ علاقے")}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {loading && reports.length === 0 ? <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-200" /> : audit.unmappedAreas.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">{tr(lang, `Outside ${PREDEFINED_PAKISTAN_AREAS.length} predefined districts`, `${PREDEFINED_PAKISTAN_AREAS.length} طے شدہ اضلاع سے باہر`)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{tr(lang, "Potential duplicates & outliers", "ممکنہ ڈپلیکیٹ اور غیر معمولی ریڈنگز")}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {loading && reports.length === 0 ? <span className="inline-block h-7 w-14 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-200" /> : audit.duplicates.length + audit.outliers.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {loading && reports.length === 0 ? tr(lang, "Scanning…", "اسکین ہو رہا ہے…") : `${audit.duplicates.length} ${tr(lang, "duplicate", "ڈپلیکیٹ")} · ${audit.outliers.length} ${tr(lang, "depth outliers", "غیر معمولی گہرائی")}`}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{tr(lang, "Records without GPS", "بغیر GPS ریکارڈز")}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {loading && reports.length === 0 ? <span className="inline-block h-7 w-16 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-200" /> : audit.missingGps}
          </p>
          <p className="mt-1 text-xs text-slate-400">{tr(lang, "Address-only submissions", "صرف پتہ والی رپورٹس")}</p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      <div id="pending-reviews" className="scroll-mt-24">
        <Panel
          title={tr(lang, `Pending Reviews (${pendingReports.length})`, `جائزے کے منتظر رپورٹس (${pendingReports.length})`)}
          description={tr(
            lang,
            "Only reports awaiting admin approval appear here. Approve, reject, or remove submissions.",
            "یہاں صرف وہ رپورٹس دکھائی جا رہی ہیں جن کی منظوری باقی ہے۔ منظور، مسترد یا حذف کریں۔"
          )}
        >
          {reviewMessage && (
            <p role="status" className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-800">
              {reviewMessage}
            </p>
          )}
          {loading && reports.length === 0 ? (
            <div className="space-y-2.5 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : pendingReports.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
              <CheckCircle2 size={18} />
              <span>{tr(lang, "All caught up — no pending reports awaiting review.", "کوئی زیرِ التواء رپورٹ باقی نہیں۔")}</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="pb-3 font-medium">{tr(lang, "Report", "رپورٹ")}</th>
                    <th className="pb-3 font-medium">{tr(lang, "Area / Address", "علاقہ / پتہ")}</th>
                    <th className="pb-3 font-medium">{tr(lang, "Source / Depth", "ذریعہ / گہرائی")}</th>
                    <th className="pb-3 font-medium">{tr(lang, "Date", "تاریخ")}</th>
                    <th className="pb-3 font-medium">{tr(lang, "Concern", "مسئلہ")}</th>
                    <th className="pb-3 text-end font-medium">{tr(lang, "Action", "عمل")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingReports.map((report) => {
                    const code = reportCodes.get(report.id) ?? report.id.slice(0, 8);
                    return (
                      <tr key={report.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-3.5 font-semibold text-teal-700">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock size={13} className="text-sky-600" />
                            {code}
                          </span>
                          {report.reporterName && (
                            <span className="block text-xs font-normal text-slate-400">{report.reporterName}</span>
                          )}
                        </td>
                        <td className="py-3.5 text-slate-600">
                          {translateAreaUr(lang, report.areaName || report.address)}
                        </td>
                        <td className="py-3.5 text-slate-700">
                          {translateSourceTypeUr(lang, report.sourceType ?? "Water source")}
                          {report.depth ? ` · ${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(report.depth))}` : ""}
                        </td>
                        <td className="py-3.5 text-slate-500">{report.sampleDate ?? "—"}</td>
                        <td className="py-3.5 text-slate-500">
                          {report.concern ? translateConcernUr(lang, report.concern) : "—"}
                        </td>
                        <td className="py-3.5 text-end">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={moderatingId === report.id}
                              onClick={() => void handlePendingStatus(report, "verified")}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} />
                              {tr(lang, "Approve", "منظور کریں")}
                            </button>
                            <button
                              type="button"
                              disabled={moderatingId === report.id}
                              onClick={() => void handlePendingStatus(report, "rejected")}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                              <XCircle size={13} />
                              {tr(lang, "Reject", "مسترد کریں")}
                            </button>
                            <button
                              type="button"
                              disabled={moderatingId === report.id}
                              onClick={() => void handlePendingDelete(report)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              <Trash2 size={13} />
                              {tr(lang, "Delete", "حذف کریں")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title={tr(lang, "Export Cleaned Dataset", "صاف شدہ ڈیٹا سیٹ ڈاؤن لوڈ کریں")}
        description={tr(lang, "Download normalized records (with canonical City, Province names) for research, backups, or external GIS tools.", "تحقیق، بیک اپ یا GIS ٹولز کے لیے صاف شدہ ریکارڈز ڈاؤن لوڈ کریں۔")}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="w-full max-w-sm text-xs font-semibold text-slate-600">
            {tr(lang, "Filter export by area", "علاقے کے لحاظ سے فلٹر کریں")}
            <select
              value={selectedArea}
              onChange={(event) => setSelectedArea(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option value="All areas">{tr(lang, "All areas", "تمام علاقے")} ({reports.length})</option>
              {audit.areaList.map(([area, count]) => (
                <option key={area} value={area}>
                  {area} ({count})
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadDataset}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              {tr(lang, "Refresh audit", "آڈٹ ریفریش کریں")}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!exportRows.length}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={15} />
              Export CSV ({exportRows.length})
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              disabled={!exportRows.length}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-white/20 dark:bg-[#0c1b1f] dark:text-white dark:hover:bg-white/10"
            >
              <FileJson size={15} />
              Export JSON ({exportRows.length})
            </button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          className="min-w-0 overflow-hidden"
          title={tr(lang, "Area Normalization Audit", "علاقوں کی نارملائزیشن آڈٹ")}
          description={tr(lang, "Records whose area name is outside the predefined City, Province directory.", "ایسے ریکارڈز جن کا علاقہ طے شدہ فہرست سے باہر ہے۔")}
        >
          {audit.unmappedAreas.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
              <CheckCircle2 size={18} />
              <span>{tr(lang, "All records map cleanly to predefined City, Province areas.", "تمام ریکارڈز طے شدہ علاقوں سے درست طور پر منسلک ہیں۔")}</span>
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto pr-3">
              {audit.unmappedAreas.slice(0, 20).map((item) => (
                <li key={item.id} className="flex flex-col gap-1.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-800">
                      {item.code} · {item.area}
                    </p>
                    <p className="break-words text-xs text-slate-500">{item.address}</p>
                  </div>
                  <Link
                    href={`/reports?report=${encodeURIComponent(item.id)}`}
                    className="w-fit shrink-0 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    {tr(lang, "Inspect", "معائنہ کریں")} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          className="min-w-0 overflow-hidden"
          title={tr(lang, "AI Anomaly & Duplicate Inspector", "AI غیر معمولی اور ڈپلیکیٹ انسپکٹر")}
          description={tr(lang, "Detects extreme outliers vs each area's median/MAD, physical limits (<= 0 or > 300 m), and repeated readings.", "ہر علاقے کے اوسط سے ہٹ کر غیر معمولی اور ڈپلیکیٹ ریڈنگز کی نشاندہی کرتا ہے۔")}
        >
          {cleanStatus && (
            <p role="status" className="mb-3 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800">
              {cleanStatus}
            </p>
          )}
          {(audit.outliers.length > 0 || audit.duplicates.length > 0) && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs">
              <span className="font-medium text-amber-900">
                {tr(
                  lang,
                  `AI detected ${audit.outliers.length} outlier(s) and ${audit.duplicates.length} duplicate(s). Exclude them from public data (reversible via Inspect / Approve).`,
                  `AI نے ${audit.outliers.length} غیر معمولی اور ${audit.duplicates.length} ڈپلیکیٹ رپورٹس پکڑی ہیں۔ انہیں عوامی ڈیٹا سے خارج کریں (منظور کر کے واپس لایا جا سکتا ہے)۔`
                )}
              </span>
              <button
                type="button"
                disabled={cleaning}
                onClick={async () => {
                  setCleaning(true);
                  setCleanStatus("");
                  setError("");
                  try {
                    const ids = [...new Set([...audit.outliers.map((o) => o.id), ...audit.duplicates.map((d) => d.id)])];
                    await Promise.all(ids.map((id) => updateCommunityReportStatus(id, "rejected")));
                    setReports((prev) =>
                      prev.map((r) => (ids.includes(r.id) ? { ...r, status: "rejected" } : r))
                    );
                    notifyCommunityWaterReportsUpdated();
                    setCleanStatus(
                      tr(
                        lang,
                        `Excluded ${ids.length} flagged report(s) from dashboards and averages. Use Inspect or Approve to restore any report.`,
                        `${ids.length} رپورٹس کو عوامی ڈیٹا سے خارج کر دیا گیا۔ واپس لانے کے لیے معائنہ یا منظور کریں۔`
                      )
                    );
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : "Could not exclude flagged reports.");
                  } finally {
                    setCleaning(false);
                  }
                }}
                className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {cleaning
                  ? tr(lang, "Excluding…", "خارج ہو رہا ہے…")
                  : tr(
                      lang,
                      `Exclude Flagged (${new Set([...audit.outliers.map((o) => o.id), ...audit.duplicates.map((d) => d.id)]).size})`,
                      `نشان زدہ خارج کریں (${new Set([...audit.outliers.map((o) => o.id), ...audit.duplicates.map((d) => d.id)]).size})`
                    )}
              </button>
            </div>
          )}
          {audit.duplicates.length === 0 && audit.outliers.length === 0 && audit.excludedReports.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
              <Database size={18} />
              <span>{tr(lang, "No duplicate submissions or depth outliers detected.", "کوئی ڈپلیکیٹ یا غیر معمولی گہرائی کی رپورٹ نہیں ملی۔")}</span>
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto pr-3">
              {audit.outliers.slice(0, 10).map((item) => (
                <li key={`out-${item.id}`} className="flex flex-col gap-1.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
                    <span className="break-words text-xs leading-5 sm:text-sm">
                      <strong>{item.code}</strong> · {translateAreaUr(lang, item.area)} ({translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.depth))} — {item.reason})
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={moderatingId === item.id}
                      onClick={() => {
                        const target = reports.find((r) => r.id === item.id);
                        if (target) void handlePendingStatus(target, "rejected");
                      }}
                      className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {tr(lang, "Exclude", "خارج کریں")}
                    </button>
                    <Link
                      href={`/reports?report=${encodeURIComponent(item.id)}`}
                      className="w-fit shrink-0 text-xs font-semibold text-teal-700 hover:underline"
                    >
                      {tr(lang, "Inspect", "معائنہ کریں")} →
                    </Link>
                  </div>
                </li>
              ))}
              {audit.duplicates.slice(0, 10).map((item) => (
                <li key={`dup-${item.id}`} className="flex flex-col gap-1.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <MapPin size={15} className="mt-0.5 shrink-0 text-amber-600" />
                    <span className="break-words text-xs leading-5 sm:text-sm">
                      <strong>{item.code}</strong> · {translateAreaUr(lang, item.area)} ({translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.depth))} on {item.date})
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={moderatingId === item.id}
                      onClick={() => {
                        const target = reports.find((r) => r.id === item.id);
                        if (target) void handlePendingStatus(target, "rejected");
                      }}
                      className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {tr(lang, "Exclude", "خارج کریں")}
                    </button>
                    <Link
                      href={`/reports?report=${encodeURIComponent(item.id)}`}
                      className="w-fit shrink-0 text-xs font-semibold text-teal-700 hover:underline"
                    >
                      {tr(lang, "Inspect", "معائنہ کریں")} →
                    </Link>
                  </div>
                </li>
              ))}
              {audit.excludedReports.slice(0, 15).map((item) => (
                <li key={`exc-${item.id}`} className="flex flex-col gap-1.5 bg-slate-50/70 py-2.5 px-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <XCircle size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="break-words text-xs leading-5 text-slate-600 sm:text-sm">
                      <strong className="text-slate-800">{item.code}</strong> · {translateAreaUr(lang, item.area)}
                      {item.depth ? ` (${translateDepthUnitsUr(lang, formatDepthMetersAndFeet(item.depth))})` : ""}
                      {" · "}
                      <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {tr(lang, "Excluded", "خارج شدہ")}
                      </span>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={moderatingId === item.id}
                      onClick={() => {
                        const target = reports.find((r) => r.id === item.id);
                        if (target) void handlePendingStatus(target, "verified");
                      }}
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {tr(lang, "Approve & Restore", "منظور کر کے بحال کریں")}
                    </button>
                    <Link
                      href={`/reports?report=${encodeURIComponent(item.id)}`}
                      className="w-fit shrink-0 text-xs font-semibold text-teal-700 hover:underline"
                    >
                      {tr(lang, "Inspect", "معائنہ کریں")} →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminOnly>
  );
}
