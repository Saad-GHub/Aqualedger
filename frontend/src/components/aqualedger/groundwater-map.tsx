"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Layers3, LocateFixed, MapPin, Minus, Plus, Waves } from "lucide-react";
import { PageIntro, Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import { readCommunityWaterReports, readPublicAreaSourceTrends, subscribeToCommunityWaterReports, type CommunityWaterReport } from "@/lib/community-water-reports";
import { screenWaterReport } from "@/lib/water-risk-screening";
import { buildReportCodes } from "@/lib/report-display-codes";

type Position = [number, number];
type MapFeature = { type: "Feature"; geometry: { type: "Point"; coordinates: Position }; properties: Record<string, string | number> };
type MapData = { type: "FeatureCollection"; features: MapFeature[] };
type AreaSelection = { key: string; name: string; city: string; reportCount: number; risk: number };

const cityLocations: { name: string; aliases: string[]; position: Position }[] = [
  { name: "Islamabad", aliases: ["islamabad", "ict"], position: [73.0551, 33.6844] },
  { name: "Rawalpindi", aliases: ["rawalpindi", "pindi"], position: [73.0479, 33.5651] },
  { name: "Lahore", aliases: ["lahore"], position: [74.3587, 31.5204] },
  { name: "Faisalabad", aliases: ["faisalabad"], position: [73.0791, 31.418] },
  { name: "Multan", aliases: ["multan"], position: [71.5249, 30.1575] },
  { name: "Karachi", aliases: ["karachi"], position: [67.0011, 24.8607] },
  { name: "Peshawar", aliases: ["peshawar"], position: [71.5249, 34.0151] },
  { name: "Quetta", aliases: ["quetta"], position: [66.975, 30.1798] },
  { name: "Hyderabad", aliases: ["hyderabad"], position: [68.3578, 25.396] },
  { name: "Sialkot", aliases: ["sialkot"], position: [74.5361, 32.4945] },
  { name: "Gujranwala", aliases: ["gujranwala"], position: [74.1871, 32.1877] },
  { name: "Bahawalpur", aliases: ["bahawalpur"], position: [71.6833, 29.3956] },
  { name: "Sukkur", aliases: ["sukkur"], position: [68.8574, 27.7052] },
];

function hashPosition(value: string, radius: number): Position {
  let hash = 0;
  for (const char of value.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
  const distance = radius * (0.35 + (Math.abs(hash >> 8) % 65) / 100);
  return [Math.cos(angle) * distance, Math.sin(angle) * distance];
}

function locationFor(report: CommunityWaterReport) {
  const address = report.address.trim();
  const city = cityLocations.find((item) => item.aliases.some((alias) => new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, "i").test(address)));
  const cityName = city?.name ?? "Pakistan";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const locality = parts.find((part) => !city?.aliases.includes(part.toLowerCase()) && !["punjab", "sindh", "kpk", "khyber pakhtunkhwa", "balochistan", "ict"].includes(part.toLowerCase())) ?? address;
  const areaKey = `${locality}, ${cityName}`;
  const areaOffset = hashPosition(areaKey, 0.075);
  const reportOffset = hashPosition(report.id, 0.012);
  const center = city?.position ?? [69.3451, 30.3753] as Position;
  const hasGps = report.latitude != null && report.longitude != null && Number.isFinite(report.latitude) && Number.isFinite(report.longitude);
  const reportPosition: Position = hasGps
    ? [report.longitude!, report.latitude!]
    : [center[0] + areaOffset[0] + reportOffset[0], center[1] + areaOffset[1] + reportOffset[1]];
  return {
    city: cityName,
    locality,
    areaKey,
    cityPosition: center,
    areaPosition: [center[0] + areaOffset[0], center[1] + areaOffset[1]] as Position,
    reportPosition,
  };
}

function riskScore(report: CommunityWaterReport) {
  const level = report.riskLevel ?? screenWaterReport(report).riskLevel;
  return level === "High concern" ? 2 : level === "Moderate concern" ? 1 : level === "Normal" ? 0.5 : 0.2;
}

function makeFeatures(reports: CommunityWaterReport[], zoom: number, reportCodes: Map<string, string>): MapData {
  const level = zoom < 6.2 ? "city" : zoom < 10.5 ? "area" : "report";
  if (level === "report") return { type: "FeatureCollection", features: reports.map((report) => {
    const location = locationFor(report);
    return { type: "Feature", geometry: { type: "Point", coordinates: location.reportPosition }, properties: { id: report.id, key: report.id, label: report.aggregateCount ? `${report.sourceType ?? "Source"} · ${report.sampleDate?.slice(0, 7) ?? "all dates"}` : reportCodes.get(report.id) ?? report.id.slice(0, 8), city: location.city, count: report.aggregateCount ?? 1, score: riskScore(report), risk: report.riskLevel ?? screenWaterReport(report).riskLevel } };
  }) };

  const groups = new Map<string, { name: string; city: string; position: Position; reports: CommunityWaterReport[] }>();
  reports.forEach((report) => {
    const location = locationFor(report);
    const key = level === "city" ? location.city : location.areaKey;
    const name = level === "city" ? location.city : location.locality;
    const position = level === "city" ? location.cityPosition : location.areaPosition;
    const existing = groups.get(key);
    if (existing) existing.reports.push(report);
    else groups.set(key, { name, city: location.city, position, reports: [report] });
  });

  return { type: "FeatureCollection", features: [...groups.entries()].map(([key, group]) => {
    const totalReports = group.reports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0);
    const score = group.reports.reduce((sum, report) => sum + riskScore(report) * (report.aggregateCount ?? 1), 0) / Math.max(1, totalReports);
    return { type: "Feature", geometry: { type: "Point", coordinates: group.position }, properties: { key, label: group.name, city: group.city, count: totalReports, score, risk: score >= 1.5 ? "High concern" : score >= 0.75 ? "Moderate concern" : "Normal" } };
  }) };
}

export function GroundwaterMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [reports, setReports] = useState<CommunityWaterReport[]>([]);
  const { isAdmin, authReady } = useAquaRole();
  const reportCodes = useMemo(() => buildReportCodes(reports), [reports]);
  const reportsRef = useRef(reports);
  const [loadError, setLoadError] = useState("");
  const [mapError, setMapError] = useState("");
  const [heatmapOn, setHeatmapOn] = useState(true);
  const heatmapOnRef = useRef(heatmapOn);
  const [selection, setSelection] = useState<AreaSelection | null>(null);
  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);
  useEffect(() => {
    heatmapOnRef.current = heatmapOn;
  }, [heatmapOn]);

  useEffect(() => {
    if (!authReady) return;
    const refresh = () => {
      if (isAdmin) {
        void readCommunityWaterReports().then((items) => { setReports(items); setLoadError(""); }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Could not load community reports."));
        return;
      }
      void readPublicAreaSourceTrends().then((items) => {
        setReports(items.map((row, index) => ({ id: `${row.areaKey}|${row.sourceType}|${row.sampleMonth ?? index}`, address: row.areaKey, sourceType: row.sourceType, depth: row.averageDepthM === null ? "" : String(row.averageDepthM), sampleDate: row.sampleMonth ?? undefined, status: "aggregated", measurements: {}, aggregateCount: row.reportCount, riskLevel: row.weightedRiskScore === null ? "Incomplete" : row.weightedRiskScore >= 1.5 ? "High concern" : row.weightedRiskScore >= 0.75 ? "Moderate concern" : "Normal" })));
        setLoadError("");
      }).catch(() => setLoadError("Public groundwater summaries are not connected yet. Run supabase/public-area-source-trends.sql in Supabase."));
    };
    refresh();
    return isAdmin ? subscribeToCommunityWaterReports(refresh) : () => {};
  }, [isAdmin, authReady]);
  const selectedReports = useMemo(() => {
    if (!selection) return [];
    return reports.filter((report) => {
      if (report.id === selection.key) return true;
      const location = locationFor(report);
      return selection.key === location.city ? location.city === selection.city : location.areaKey === selection.key;
    });
  }, [reports, selection]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    let disposed = false;
    let map: import("maplibre-gl").Map | null = null;
    void import("maplibre-gl").then((maplibregl) => {
      if (disposed || !mapContainer.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({ container: mapContainer.current, style: "https://tiles.openfreemap.org/styles/liberty", center: [69.3451, 30.3753], zoom: 4.4, minZoom: 3, maxZoom: 16, attributionControl: false });
      mapRef.current = map;
      map!.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map!.on("load", () => {
        if (!map) return;
        map.addSource("water-reports", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "key" });
        map.addLayer({ id: "risk-heat", type: "heatmap", source: "water-reports", maxzoom: 10.5, layout: { visibility: heatmapOnRef.current ? "visible" : "none" }, paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "score"], 0, 0.1, 0.5, 0.25, 1, 0.6, 2, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 9, 2.2],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 24, 10, 48],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.85, 10.5, 0],
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(20,184,166,0)", 0.2, "#5eead4", 0.45, "#facc15", 0.7, "#fb923c", 1, "#dc2626"],
        } });
        map.addLayer({ id: "risk-points", type: "circle", source: "water-reports", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["interpolate", ["linear"], ["get", "count"], 1, 9, 20, 22], 10, ["interpolate", ["linear"], ["get", "count"], 1, 7, 20, 16]],
          "circle-color": ["step", ["get", "score"], "#0d9488", 0.75, "#f59e0b", 1.5, "#dc2626"],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.9,
        } });
        map.addLayer({ id: "risk-labels", type: "symbol", source: "water-reports", minzoom: 3, maxzoom: 11, layout: { "text-field": ["concat", ["get", "label"], " · ", ["to-string", ["get", "count"]]], "text-size": 12, "text-offset": [0, 1.4], "text-allow-overlap": false }, paint: { "text-color": "#1e293b", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
        const setMapData = () => {
          const source = map?.getSource("water-reports") as import("maplibre-gl").GeoJSONSource | undefined;
          source?.setData(makeFeatures(reportsRef.current, map?.getZoom() ?? 4.4, buildReportCodes(reportsRef.current)) as never);
        };
        setMapData();
        map.on("zoomend", setMapData);
        map.on("click", "risk-points", (event) => {
          const properties = event.features?.[0]?.properties;
          if (!properties) return;
          const key = String(properties.key ?? properties.city ?? "");
          const name = String(properties.label ?? "Reported location");
          setSelection({ key, name, city: String(properties.city ?? name), reportCount: Number(properties.count ?? 1), risk: Number(properties.score ?? 0) });
          if (map && map.getZoom() < 10.5) map.easeTo({ center: event.lngLat, zoom: Math.min(11, map.getZoom() + 2.2), duration: 500 });
        });
        map.on("mouseenter", "risk-points", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "risk-points", () => { if (map) map.getCanvas().style.cursor = ""; });
        map.on("error", (event) => { if (event.error?.message?.includes("style") || event.error?.message?.includes("fetch")) setMapError("Map tiles could not load. Check the internet connection and try reloading."); });
      });
    }).catch((error: unknown) => setMapError(error instanceof Error ? `Interactive map error: ${error.message}` : "Interactive map could not be started in this browser."));
    return () => { disposed = true; map?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource("water-reports") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData(makeFeatures(reports, map.getZoom(), reportCodes) as never);
  }, [reports, reportCodes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("risk-heat")) return;
    map.setLayoutProperty("risk-heat", "visibility", heatmapOn ? "visible" : "none");
  }, [heatmapOn]);

  const riskColor = (score: number) => score >= 1.5 ? "text-red-700 bg-red-50" : score >= 0.75 ? "text-amber-700 bg-amber-50" : "text-teal-700 bg-teal-50";
  const riskText = (score: number) => score >= 1.5 ? "High concern" : score >= 0.75 ? "Moderate concern" : "Normal";

  return <>
    <PageIntro title="Groundwater Map" description="Explore community reports across Pakistan. Zoom from city summaries into reported areas and individual samples." />
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Water reports</p><p className="mt-2 text-2xl font-bold text-slate-900">{reports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)}</p><p className="mt-1 text-xs text-slate-400">Community submitted</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Reported areas</p><p className="mt-2 text-2xl font-bold text-slate-900">{new Set(reports.map((report) => locationFor(report).areaKey)).size}</p><p className="mt-1 text-xs text-slate-400">Grouped from entered addresses</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">High concern reports</p><p className="mt-2 text-2xl font-bold text-red-600">{reports.filter((report) => riskScore(report) >= 1.5).length}</p><p className="mt-1 text-xs text-slate-400">Rules-based screening flags</p></div>
    </div>
    <Panel title="Pakistan groundwater activity" description="Pan and zoom the map. Bubbles summarize cities, then areas, then individual reports.">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1.5 text-red-700"><span className="h-2 w-2 rounded-full bg-red-500"/>High concern</span><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5 text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500"/>Moderate</span><span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1.5 text-teal-700"><span className="h-2 w-2 rounded-full bg-teal-600"/>Normal</span></div>
        <div className="flex items-center gap-2"><button onClick={() => setHeatmapOn((current) => !current)} aria-pressed={heatmapOn} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${heatmapOn ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}><Layers3 size={15}/>{heatmapOn ? "Heatmap on" : "Heatmap off"}</button><button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Plus size={17}/></button><button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Minus size={17}/></button><button aria-label="Reset Pakistan view" onClick={() => { mapRef.current?.flyTo({ center: [69.3451, 30.3753], zoom: 4.4 }); setSelection(null); }} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><LocateFixed size={17}/></button></div>
      </div>
      {loadError ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{loadError}</p> : <div ref={mapContainer} className="h-[68vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" aria-label="Interactive groundwater risk map of Pakistan" />}
      {mapError && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{mapError}</p>}
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><MapPin size={14} className="mt-0.5 shrink-0"/>Individual reports with consented GPS use their recorded coordinates; public summaries and reports without GPS use approximate placements derived from the entered address. Heat intensity summarizes reported locations and screening categories, and does not certify water safety.</p>
    </Panel>
    {selection && <Panel title={`${selection.name}${selection.city !== selection.name ? ` · ${selection.city}` : ""}`} description={`${selectedReports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)} reports summarized at this zoom level`}>
      <div className="mb-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${riskColor(selection.risk)}`}>{riskText(selection.risk)} area average</span><span className="text-xs text-slate-500">{selectedReports.filter((report) => riskScore(report) >= 1.5).length} high · {selectedReports.filter((report) => riskScore(report) >= 0.75 && riskScore(report) < 1.5).length} moderate · {selectedReports.filter((report) => riskScore(report) < 0.75).length} normal</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{selectedReports.map((report) => { const score = riskScore(report); return <div key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{report.aggregateCount ? `${report.sourceType} · ${report.sampleDate?.slice(0, 7) ?? "All dates"}` : `${reportCodes.get(report.id) ?? report.id} · ${report.address}`}</p><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${riskColor(score)}`}>{riskText(score)}</span></div><p className="mt-2 text-xs text-slate-500">{report.sourceType || "Source type not provided"}{report.depth ? ` · ${report.depth} m deep` : ""}</p><p className="mt-1 text-xs text-slate-500">{report.aggregateCount ? `${report.aggregateCount} reports summarized · average depth ${report.depth || "—"} m` : `${report.sampleDate || "No test date"} · ${report.status}`}</p></div>; })}</div>
    </Panel>}
    {!selection && reports.length > 0 && <div className="flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-xs text-teal-800"><Waves size={16}/><span>Select a city or area bubble to expand its report summary. Zoom in further to inspect individual reports.</span><Activity size={16} className="ml-auto shrink-0"/></div>}
  </>;
}
