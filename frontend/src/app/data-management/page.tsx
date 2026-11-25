"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { AdminOnly, PageIntro, Panel } from "@/components/aqualedger/app-shell";
import {
  readCommunityWaterReports,
  type CommunityWaterReport,
} from "@/lib/community-water-reports";
import {
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
  const [selectedArea, setSelectedArea] = useState("All areas");

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
  const predefinedSet = useMemo(() => new Set(PREDEFINED_PAKISTAN_AREAS), []);

  const audit = useMemo(() => {
    const areas = new Map<string, number>();
    const unmappedAreas: { id: string; code: string; area: string; address: string }[] = [];
    const outliers: { id: string; code: string; area: string; depth: number; reason: string }[] = [];
    const seenKeys = new Map<string, string>();
    const duplicates: { id: string; code: string; area: string; date: string; depth: string }[] = [];
    let missingGps = 0;

    for (const report of reports) {
      const area = normalizeAreaName(report.areaName || report.areaKey, report.address);
      const code = reportCodes.get(report.id) ?? report.id;
      areas.set(area, (areas.get(area) ?? 0) + 1);

      if (!predefinedSet.has(area) || !hasAreaAndProvince(area)) {
        unmappedAreas.push({ id: report.id, code, area, address: report.address });
      }

      if (report.latitude == null || report.longitude == null) {
        missingGps += 1;
      }

      const depthNum = Number(report.depth);
      if (report.depth && (!Number.isFinite(depthNum) || depthNum <= 0 || depthNum > 300)) {
        outliers.push({
          id: report.id,
          code,
          area,
          depth: depthNum,
          reason: depthNum <= 0 ? "Non-positive depth" : "Extreme depth (> 300 m)",
        });
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

    return {
      areaList: [...areas.entries()].sort(([a], [b]) => a.localeCompare(b)),
      unmappedAreas,
      outliers,
      duplicates,
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

  return (
    <AdminOnly>
      <PageIntro
        eyebrow="Admin Dataset Toolkit"
        title="Data Management & Quality Audit"
        description="Inspect area normalization health, detect duplicate or outlier depth readings, and export cleaned datasets in CSV or JSON."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total records audited</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{reports.length}</p>
          <p className="mt-1 text-xs text-slate-400">Across {audit.areaList.length} canonical areas</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Unmapped / custom areas</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{audit.unmappedAreas.length}</p>
          <p className="mt-1 text-xs text-slate-400">Outside {PREDEFINED_PAKISTAN_AREAS.length} predefined districts</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Potential duplicates &amp; outliers</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {audit.duplicates.length + audit.outliers.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {audit.duplicates.length} duplicate · {audit.outliers.length} depth outliers
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Records without GPS</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{audit.missingGps}</p>
          <p className="mt-1 text-xs text-slate-400">Address-only submissions</p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      <Panel
        title="Export Cleaned Dataset"
        description="Download normalized records (with canonical City, Province names) for research, backups, or external GIS tools."
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="w-full max-w-sm text-xs font-semibold text-slate-600">
            Filter export by area
            <select
              value={selectedArea}
              onChange={(event) => setSelectedArea(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
            >
              <option value="All areas">All areas ({reports.length} records)</option>
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
              Refresh audit
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!exportRows.length}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              <Download size={15} />
              Export CSV ({exportRows.length})
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              disabled={!exportRows.length}
              className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
            >
              <FileJson size={15} />
              Export JSON
            </button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Area Normalization Audit"
          description="Records whose area name is outside the predefined City, Province directory."
        >
          {audit.unmappedAreas.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
              <CheckCircle2 size={18} />
              <span>All records map cleanly to predefined City, Province areas.</span>
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {audit.unmappedAreas.slice(0, 20).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">
                      {item.code} · {item.area}
                    </p>
                    <p className="truncate text-xs text-slate-500">{item.address}</p>
                  </div>
                  <Link
                    href={`/reports?report=${encodeURIComponent(item.id)}`}
                    className="shrink-0 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Inspect
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Duplicate & Outlier Inspector"
          description="Repeated readings on the same date/depth or extreme depth values (> 300 m or <= 0 m)."
        >
          {audit.duplicates.length === 0 && audit.outliers.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-800">
              <Database size={18} />
              <span>No duplicate submissions or depth outliers detected.</span>
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {audit.outliers.slice(0, 10).map((item) => (
                <li key={`out-${item.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle size={15} className="shrink-0 text-red-600" />
                    <span className="truncate">
                      <strong>{item.code}</strong> · {item.area} ({item.depth} m — {item.reason})
                    </span>
                  </div>
                  <Link
                    href={`/reports?report=${encodeURIComponent(item.id)}`}
                    className="shrink-0 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Inspect
                  </Link>
                </li>
              ))}
              {audit.duplicates.slice(0, 10).map((item) => (
                <li key={`dup-${item.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={15} className="shrink-0 text-amber-600" />
                    <span className="truncate">
                      <strong>{item.code}</strong> · {item.area} ({item.depth} m on {item.date})
                    </span>
                  </div>
                  <Link
                    href={`/reports?report=${encodeURIComponent(item.id)}`}
                    className="shrink-0 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Inspect
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminOnly>
  );
}
