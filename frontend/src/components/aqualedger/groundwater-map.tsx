"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CircleDot, Layers3, LocateFixed, MapPin, Maximize2, Minus, Plus, Waves, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageIntro, Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import { readCommunityWaterReports, readPublicAreaSourceTrends, subscribeToCommunityWaterReports, type CommunityWaterReport } from "@/lib/community-water-reports";
import { screenWaterReport } from "@/lib/water-risk-screening";
import { buildReportCodes } from "@/lib/report-display-codes";

type Position = [number, number];
type MapFeature = { type: "Feature"; geometry: { type: "Point"; coordinates: Position }; properties: Record<string, string | number> };
type MapData = { type: "FeatureCollection"; features: MapFeature[] };
type AreaSelection = { key: string; name: string; city: string; reportCount: number; risk: number };
type CensusMode = "depth" | "brackish" | "off";
type CensusDistrict = { name: string; province?: string; censusDistricts?: string; mouzas?: number; medianDepthFt?: number; p75DepthFt?: number; brackishPct?: number };

type ObservationWell = { id: string; lon: number; lat: number; trend: number | null; n: number; firstYear: number; lastYear: number; firstDepth: number; lastDepth: number; series: [number, number][] };

const CENSUS_DATA_URL = "/data/pakistan-groundwater-census-2020.geojson";
const WELLS_DATA_URL = "/data/pakistan-observation-wells.json";
// Linear water-level trend in metres per year: positive means the water table is getting deeper.
const wellTrendSteps: [number, string, string][] = [[-Infinity, "#1d4ed8", "Rising > 20 cm/yr"], [-0.2, "#60a5fa", "Rising 5–20 cm/yr"], [-0.05, "#cbd5e1", "Stable (±5 cm/yr)"], [0.05, "#f87171", "Falling 5–20 cm/yr"], [0.2, "#b91c1c", "Falling > 20 cm/yr"]];
const wellCircleColor = ["case", ["==", ["get", "trend"], null], "#94a3b8", ["step", ["get", "trend"], wellTrendSteps[0][1], ...wellTrendSteps.slice(1).flatMap(([bound, color]) => [bound, color])]];
type CensusFeature = { properties: CensusDistrict; geometry: { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] } };
type MyLocation = { position: Position; accuracyM: number; place: string | null; district: CensusDistrict | null; nearestWell: { well: ObservationWell; km: number } | null };
type RiskCategory = "High concern" | "Moderate concern" | "Normal";
const riskCategories: { value: RiskCategory; label: string; chip: string; dot: string }[] = [
  { value: "High concern", label: "High concern", chip: "bg-red-50 text-red-700 ring-red-300", dot: "bg-red-500" },
  { value: "Moderate concern", label: "Moderate", chip: "bg-amber-50 text-amber-700 ring-amber-300", dot: "bg-amber-500" },
  { value: "Normal", label: "Normal", chip: "bg-teal-50 text-teal-700 ring-teal-300", dot: "bg-teal-600" },
];

function pointInRing([x, y]: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The census district whose boundary contains a GPS point, if any. */
function districtAt(point: Position, features: CensusFeature[]) {
  const inPolygon = (rings: Position[][]) => pointInRing(point, rings[0]) && !rings.slice(1).some((hole) => pointInRing(point, hole));
  return features.find(({ geometry }) => geometry.type === "Polygon" ? inPolygon(geometry.coordinates) : geometry.coordinates.some(inPolygon))?.properties ?? null;
}

function distanceKm([lon1, lat1]: Position, [lon2, lat2]: Position) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

type PlaceName = { name: string; km: number };
type WellPlace = { place: PlaceName | null; district: CensusDistrict | null };
const SETTLEMENT_CLASSES = new Set(["city", "town", "village", "hamlet", "suburb", "neighbourhood", "quarter", "locality", "isolated_dwelling"]);

/** Nearest named settlement in the basemap tiles already loaded, so no location is sent to another service. */
function nearestPlace(map: import("maplibre-gl").Map, position: Position): PlaceName | null {
  let best: PlaceName | null = null;
  for (const feature of map.querySourceFeatures("openmaptiles", { sourceLayer: "place" })) {
    if (feature.geometry.type !== "Point" || !SETTLEMENT_CLASSES.has(String(feature.properties.class))) continue;
    const name = feature.properties["name:en"] || feature.properties.name_en || feature.properties["name:latin"] || feature.properties.name;
    if (!name) continue;
    const km = distanceKm(position, feature.geometry.coordinates as Position);
    if (!best || km < best.km) best = { name: String(name), km };
  }
  return best;
}

const formatCoordinates = (lat: number, lon: number) => `${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`;
const googleMapsUrl = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
const placeTitle = ({ place, district }: WellPlace) => place && place.km < 1 ? place.name : place && place.km < 15 ? `Near ${place.name}` : district ? `${district.name} district` : "Unnamed location";
const placeSubtitle = ({ place, district }: WellPlace) => [place && place.km >= 1 && place.km < 15 ? `${place.km.toFixed(1)} km from ${place.name}` : null, district ? `${district.name}, ${district.province}` : null].filter(Boolean).join(" · ");

/** Range filter for the legend bins a viewer has switched on; `null` shows everything. */
function binFilter(property: string, steps: [number, string, string][], selected: number[]) {
  if (!selected.length) return null;
  return ["all", ["!=", ["get", property], null], ["any", ...selected.map((index) => ["all", [">=", ["to-number", ["get", property], 0], steps[index][0] === -Infinity ? -1e9 : steps[index][0]], ["<", ["to-number", ["get", property], 0], steps[index + 1]?.[0] ?? 1e9]])]];
}

const wellTrendText = (trend: number | null) => trend == null ? "Too few readings for a trend" : Math.abs(trend) < 0.05 ? "Roughly stable" : `${trend > 0 ? "Falling" : "Rising"} ${Math.abs(trend * 100).toFixed(0)} cm per year`;
// District colour ramps for the Mouza Census 2020 layer: [lower bound, colour, legend label].
const censusScales: Record<Exclude<CensusMode, "off">, { property: keyof CensusDistrict; title: string; steps: [number, string, string][] }> = {
  depth: { property: "medianDepthFt", title: "Median water table depth", steps: [[0, "#fef9c3", "< 50 ft"], [50, "#fde047", "50–100 ft"], [100, "#fb923c", "100–200 ft"], [200, "#ef4444", "200–400 ft"], [400, "#991b1b", "400+ ft"]] },
  brackish: { property: "brackishPct", title: "Mouzas with brackish groundwater", steps: [[0, "#ede9fe", "< 5%"], [5, "#c4b5fd", "5–15%"], [15, "#a78bfa", "15–30%"], [30, "#7c3aed", "30–50%"], [50, "#4c1d95", "50%+"]] },
};
const censusFillColor = (mode: Exclude<CensusMode, "off">) => {
  const { property, steps } = censusScales[mode];
  return ["case", ["has", property], ["step", ["get", property], steps[0][1], ...steps.slice(1).flatMap(([bound, color]) => [bound, color])], "#e2e8f0"];
};

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

const hasGps = (report: CommunityWaterReport) => report.latitude != null && report.longitude != null && Number.isFinite(report.latitude) && Number.isFinite(report.longitude);
const riskCategoryOf = (report: CommunityWaterReport): RiskCategory => { const score = riskScore(report); return score >= 1.5 ? "High concern" : score >= 0.75 ? "Moderate concern" : "Normal"; };

/** Like locationFor, but a GPS report with no recognised city in its address is named after the district it falls in. */
function placeOf(report: CommunityWaterReport, districts: CensusFeature[]) {
  const location = locationFor(report);
  if (location.city !== "Pakistan" || !hasGps(report)) return location;
  const city = districtAt(location.reportPosition, districts)?.name ?? "Pakistan";
  return { ...location, city, areaKey: `${location.locality}, ${city}` };
}

function makeFeatures(reports: CommunityWaterReport[], zoom: number, reportCodes: Map<string, string>, districts: CensusFeature[] = []): MapData {
  const level = zoom < 6.2 ? "city" : zoom < 10.5 ? "area" : "report";
  if (level === "report") return { type: "FeatureCollection", features: reports.map((report) => {
    const location = placeOf(report, districts);
    const label = report.aggregateCount ? `${report.sourceType ?? "Source"} · ${report.sampleDate?.slice(0, 7) ?? "all dates"}` : `${reportCodes.get(report.id) ?? report.id.slice(0, 8)} · ${location.locality}`;
    return { type: "Feature", geometry: { type: "Point", coordinates: location.reportPosition }, properties: { id: report.id, key: report.id, label, city: location.city, count: report.aggregateCount ?? 1, score: riskScore(report), risk: report.riskLevel ?? screenWaterReport(report).riskLevel, gps: hasGps(report) ? 1 : 0 } };
  }) };

  const groups = new Map<string, { name: string; city: string; position: Position; reports: CommunityWaterReport[] }>();
  reports.forEach((report) => {
    const location = placeOf(report, districts);
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
    // Centre the bubble on the real GPS readings when the group has any, instead of the approximate address spot.
    const located = group.reports.filter(hasGps);
    const position: Position = located.length ? [located.reduce((sum, report) => sum + report.longitude!, 0) / located.length, located.reduce((sum, report) => sum + report.latitude!, 0) / located.length] : group.position;
    return { type: "Feature", geometry: { type: "Point", coordinates: position }, properties: { key, label: group.name, city: group.city, count: totalReports, score, risk: score >= 1.5 ? "High concern" : score >= 0.75 ? "Moderate concern" : "Normal", gps: located.length ? 1 : 0 } };
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
  const [censusMode, setCensusMode] = useState<CensusMode>("depth");
  const censusModeRef = useRef(censusMode);
  const [censusDistricts, setCensusDistricts] = useState<CensusDistrict[]>([]);
  const [hoverDistrict, setHoverDistrict] = useState<CensusDistrict | null>(null);
  const [wellsOn, setWellsOn] = useState(true);
  const wellsOnRef = useRef(wellsOn);
  const wellsById = useRef(new Map<string, ObservationWell>());
  const [wellCount, setWellCount] = useState(0);
  const [hoverWell, setHoverWell] = useState<ObservationWell | null>(null);
  const [selectedWell, setSelectedWellState] = useState<ObservationWell | null>(null);
  const [hoverPlace, setHoverPlace] = useState<WellPlace>({ place: null, district: null });
  const [selectedPlace, setSelectedPlace] = useState<WellPlace>({ place: null, district: null });
  // Both only read refs and state setters, so they are stable for the map's one-time event handlers.
  const describeWell = useCallback((well: ObservationWell): WellPlace => ({ place: mapRef.current ? nearestPlace(mapRef.current, [well.lon, well.lat]) : null, district: districtAt([well.lon, well.lat], censusFeaturesRef.current) }), []);
  const setSelectedWell = useCallback((well: ObservationWell | null) => { setSelectedWellState(well); if (well) setSelectedPlace(describeWell(well)); }, [describeWell]);
  const censusFeaturesRef = useRef<CensusFeature[]>([]);
  const [censusFeatures, setCensusFeatures] = useState<CensusFeature[]>([]);
  const [riskFilter, setRiskFilter] = useState<RiskCategory[]>([]);
  const [censusBins, setCensusBins] = useState<number[]>([]);
  const [wellBins, setWellBins] = useState<number[]>([]);
  const [myLocation, setMyLocation] = useState<MyLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const filteredReports = useMemo(() => riskFilter.length ? reports.filter((report) => riskFilter.includes(riskCategoryOf(report))) : reports, [reports, riskFilter]);
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const filtersActive = riskFilter.length + censusBins.length + wellBins.length > 0;
  useEffect(() => {
    wellsOnRef.current = wellsOn;
  }, [wellsOn]);
  useEffect(() => {
    reportsRef.current = filteredReports;
  }, [filteredReports]);
  useEffect(() => {
    censusModeRef.current = censusMode;
  }, [censusMode]);
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
    return filteredReports.filter((report) => {
      if (report.id === selection.key) return true;
      const location = placeOf(report, censusFeatures);
      return selection.key === location.city ? location.city === selection.city : location.areaKey === selection.key;
    });
  }, [filteredReports, selection, censusFeatures]);

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
      const setMapData = () => {
        const source = map?.getSource("water-reports") as import("maplibre-gl").GeoJSONSource | undefined;
        source?.setData(makeFeatures(reportsRef.current, map?.getZoom() ?? 4.4, buildReportCodes(reportsRef.current), censusFeaturesRef.current) as never);
      };
      map!.on("load", () => {
        if (!map) return;
        map.addSource("census-districts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        const initialMode = censusModeRef.current === "off" ? "depth" : censusModeRef.current;
        map.addLayer({ id: "census-fill", type: "fill", source: "census-districts", layout: { visibility: censusModeRef.current === "off" ? "none" : "visible" }, paint: { "fill-color": censusFillColor(initialMode) as never, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.72, 9, 0.45] } });
        map.addLayer({ id: "census-outline", type: "line", source: "census-districts", layout: { visibility: censusModeRef.current === "off" ? "none" : "visible" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 9, 1.6], "line-opacity": 0.85 } });
        void fetch(CENSUS_DATA_URL).then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json(); }).then((data: { features: CensusFeature[] }) => {
          (map?.getSource("census-districts") as import("maplibre-gl").GeoJSONSource | undefined)?.setData(data as never);
          censusFeaturesRef.current = data.features;
          setCensusFeatures(data.features);
          setCensusDistricts(data.features.map((feature) => feature.properties));
          setMapData();
        }).catch(() => setMapError("Mouza Census 2020 district data could not load."));
        map.on("mousemove", "census-fill", (event) => setHoverDistrict((event.features?.[0]?.properties as CensusDistrict | undefined) ?? null));
        map.on("mouseleave", "census-fill", () => setHoverDistrict(null));
        map.addSource("observation-wells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "observation-wells", type: "circle", source: "observation-wells", layout: { visibility: wellsOnRef.current ? "visible" : "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.2, 7, 4, 11, 7], "circle-color": wellCircleColor as never, "circle-stroke-color": "#ffffff", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 9, 1.2], "circle-opacity": 0.9 } });
        void fetch(WELLS_DATA_URL).then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json(); }).then((data: { sites: ObservationWell[] }) => {
          wellsById.current = new Map(data.sites.map((site) => [site.id, site]));
          setWellCount(data.sites.length);
          (map?.getSource("observation-wells") as import("maplibre-gl").GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: data.sites.map((site) => ({ type: "Feature", geometry: { type: "Point", coordinates: [site.lon, site.lat] }, properties: { id: site.id, trend: site.trend, coords: `${site.lat.toFixed(4)}°N, ${site.lon.toFixed(4)}°E` } })) } as never);
        }).catch(() => setMapError("Observation well data could not load."));
        const wellAt = (event: { features?: { properties: Record<string, unknown> }[] }) => wellsById.current.get(String(event.features?.[0]?.properties.id ?? "")) ?? null;
        map.addLayer({ id: "observation-well-labels", type: "symbol", source: "observation-wells", minzoom: 10.5, layout: { visibility: wellsOnRef.current ? "visible" : "none", "text-field": ["get", "coords"], "text-font": ["Noto Sans Regular"], "text-size": 10.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true }, paint: { "text-color": "#0c4a6e", "text-halo-color": "#ffffff", "text-halo-width": 1.6 } });
        let hoveredId = "";
        map.on("mousemove", "observation-wells", (event) => {
          const well = wellAt(event);
          if (map) map.getCanvas().style.cursor = "pointer";
          if (!well || well.id === hoveredId) return;
          hoveredId = well.id;
          setHoverWell(well);
          setHoverPlace(describeWell(well));
        });
        map.on("mouseleave", "observation-wells", () => { hoveredId = ""; });
        map.on("mouseleave", "observation-wells", () => { setHoverWell(null); if (map) map.getCanvas().style.cursor = ""; });
        map.on("click", "observation-wells", (event) => {
          setSelectedWell(wellAt(event));
          window.setTimeout(() => document.getElementById("well-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
        });
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
        map.addLayer({ id: "risk-labels", type: "symbol", source: "water-reports", minzoom: 3, maxzoom: 11, layout: { "text-field": ["concat", ["get", "label"], " · ", ["to-string", ["get", "count"]]], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-offset": [0, 1.4], "text-allow-overlap": false }, paint: { "text-color": "#1e293b", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
        map.addSource("my-location", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "my-location-halo", type: "circle", source: "my-location", paint: { "circle-radius": 20, "circle-color": "#3b82f6", "circle-opacity": 0.18, "circle-stroke-color": "#3b82f6", "circle-stroke-width": 1, "circle-stroke-opacity": 0.4 } });
        map.addLayer({ id: "my-location-dot", type: "circle", source: "my-location", paint: { "circle-radius": 7, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
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
  }, [describeWell, setSelectedWell]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource("water-reports") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData(makeFeatures(filteredReports, map.getZoom(), reportCodes, censusFeatures) as never);
  }, [filteredReports, reportCodes, censusFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("risk-heat")) return;
    map.setLayoutProperty("risk-heat", "visibility", heatmapOn ? "visible" : "none");
  }, [heatmapOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("census-fill")) return;
    const visibility = censusMode === "off" ? "none" : "visible";
    map.setLayoutProperty("census-fill", "visibility", visibility);
    map.setLayoutProperty("census-outline", "visibility", visibility);
    if (censusMode !== "off") map.setPaintProperty("census-fill", "fill-color", censusFillColor(censusMode) as never);
  }, [censusMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("observation-wells")) return;
    map.setLayoutProperty("observation-wells", "visibility", wellsOn ? "visible" : "none");
    map.setLayoutProperty("observation-well-labels", "visibility", wellsOn ? "visible" : "none");
  }, [wellsOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("census-fill") || censusMode === "off") return;
    const filter = binFilter(censusScales[censusMode].property, censusScales[censusMode].steps, censusBins) as never;
    map.setFilter("census-fill", filter);
    map.setFilter("census-outline", filter);
  }, [censusMode, censusBins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("observation-wells")) return;
    map.setFilter("observation-wells", binFilter("trend", wellTrendSteps, wellBins) as never);
    map.setFilter("observation-well-labels", binFilter("trend", wellTrendSteps, wellBins) as never);
  }, [wellBins]);

  function showMyLocation() {
    if (!("geolocation" in navigator)) { setLocateError("This browser cannot share its location."); return; }
    setLocating(true); setLocateError("");
    navigator.geolocation.getCurrentPosition((result) => {
      const position: Position = [result.coords.longitude, result.coords.latitude];
      const map = mapRef.current;
      (map?.getSource("my-location") as import("maplibre-gl").GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: position }, properties: {} }] } as never);
      let nearestWell: MyLocation["nearestWell"] = null;
      for (const well of wellsById.current.values()) { const km = distanceKm(position, [well.lon, well.lat]); if (!nearestWell || km < nearestWell.km) nearestWell = { well, km }; }
      setMyLocation({ position, accuracyM: result.coords.accuracy, place: null, district: districtAt(position, censusFeaturesRef.current), nearestWell });
      setLocating(false);
      if (!map) return;
      // Name the spot from the basemap's own place labels, so the location never leaves the browser.
      map.once("idle", () => {
        const nearest = nearestPlace(map, position);
        setMyLocation((current) => current && current.position === position ? { ...current, place: nearest && nearest.km < 15 ? nearest.name : null } : current);
      });
      map.flyTo({ center: position, zoom: 11, duration: 1200 });
    }, (error) => {
      setLocating(false);
      setLocateError(error.code === error.PERMISSION_DENIED ? "Location permission was blocked. Allow location for this site in the browser, then try again." : "Your location could not be found. Try again outdoors or with Wi-Fi turned on.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  const censusRankings = useMemo(() => {
    const top = (property: "medianDepthFt" | "brackishPct") => censusDistricts.filter((district) => district[property] != null && (district.mouzas ?? 0) >= 40).sort((a, b) => (b[property] ?? 0) - (a[property] ?? 0)).slice(0, 5);
    return { deepest: top("medianDepthFt"), brackish: top("brackishPct"), mouzas: censusDistricts.reduce((sum, district) => sum + (district.mouzas ?? 0), 0) };
  }, [censusDistricts]);
  const activeScale = censusMode === "off" ? null : censusScales[censusMode];

  const riskColor = (score: number) => score >= 1.5 ? "text-red-700 bg-red-50" : score >= 0.75 ? "text-amber-700 bg-amber-50" : "text-teal-700 bg-teal-50";
  const riskText = (score: number) => score >= 1.5 ? "High concern" : score >= 0.75 ? "Moderate concern" : "Normal";

  return <>
    <PageIntro title="Groundwater Map" description="District-level water table depth and brackish groundwater from the Mouza Census 2020, with community reports on top. Zoom from city summaries into reported areas and individual samples." />
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Water reports</p><p className="mt-2 text-2xl font-bold text-slate-900">{reports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)}</p><p className="mt-1 text-xs text-slate-400">Community submitted</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">Reported areas</p><p className="mt-2 text-2xl font-bold text-slate-900">{new Set(reports.map((report) => locationFor(report).areaKey)).size}</p><p className="mt-1 text-xs text-slate-400">Grouped from entered addresses</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">High concern reports</p><p className="mt-2 text-2xl font-bold text-red-600">{reports.filter((report) => riskScore(report) >= 1.5).length}</p><p className="mt-1 text-xs text-slate-400">Rules-based screening flags</p></div>
    </div>
    <Panel title="Pakistan groundwater heatmap" description="Districts are shaded from the Mouza Census 2020. Bubbles summarize community reports by city, then area, then individual report.">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3"><div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Census 2020 layer">{([["depth", "Water table depth"], ["brackish", "Brackish water"], ["off", "Off"]] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={censusMode === mode} onClick={() => { setCensusMode(mode); setCensusBins([]); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${censusMode === mode ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>)}</div><div className="flex flex-wrap items-center gap-2 text-xs text-slate-600" role="group" aria-label="Show reports by risk">{riskCategories.map((category) => { const on = riskFilter.includes(category.value); return <button key={category.value} type="button" aria-pressed={on} onClick={() => setRiskFilter((current) => toggle(current, category.value))} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 transition ${category.chip} ${on ? "font-semibold ring-2" : riskFilter.length ? "opacity-45 hover:opacity-100" : "hover:ring-1"}`}><span className={`h-2 w-2 rounded-full ${category.dot}`}/>{category.label}</button>; })}</div>{filtersActive && <button type="button" onClick={() => { setRiskFilter([]); setCensusBins([]); setWellBins([]); }} className="text-xs font-semibold text-teal-700 hover:underline">Show all</button>}</div>
        <div className="flex items-center gap-2"><button onClick={() => setHeatmapOn((current) => !current)} aria-pressed={heatmapOn} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${heatmapOn ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}><Layers3 size={15}/>{heatmapOn ? "Report heat on" : "Report heat off"}</button><button onClick={() => setWellsOn((current) => !current)} aria-pressed={wellsOn} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${wellsOn ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600"}`}><CircleDot size={15}/>{wellsOn ? "Wells on" : "Wells off"}</button><button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Plus size={17}/></button><button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Minus size={17}/></button><button aria-label="Reset Pakistan view" title="Show all of Pakistan" onClick={() => { mapRef.current?.flyTo({ center: [69.3451, 30.3753], zoom: 4.4 }); setSelection(null); }} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Maximize2 size={17}/></button><button onClick={showMyLocation} disabled={locating} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"><LocateFixed size={15} className={locating ? "animate-pulse" : ""}/>{locating ? "Finding you…" : "My location"}</button></div>
      </div>
      {loadError && <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{loadError}</p>}
      <div className="relative">
        <div ref={mapContainer} className="h-[68vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" aria-label="Interactive groundwater heatmap of Pakistan" />
        {(activeScale || wellsOn) && <div className="absolute bottom-3 left-3 flex flex-col gap-3 rounded-xl border border-white/60 bg-white/90 p-3 text-xs shadow-sm backdrop-blur sm:flex-row">{activeScale && <div role="group" aria-label={`Filter districts by ${activeScale.title.toLowerCase()}`}><p className="mb-1.5 font-semibold text-slate-700">{activeScale.title}</p><div className="space-y-0.5">{activeScale.steps.map(([, color, label], index) => { const on = censusBins.includes(index); return <button key={label} type="button" aria-pressed={on} onClick={() => setCensusBins((current) => toggle(current, index))} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left transition ${on ? "bg-slate-900/5 font-semibold text-slate-900" : censusBins.length ? "text-slate-400 hover:text-slate-700" : "text-slate-600 hover:bg-slate-900/5"}`}><span className={`h-3 w-5 rounded-sm ring-1 ring-black/5 ${censusBins.length && !on ? "opacity-40" : ""}`} style={{ background: color }}/>{label}</button>; })}</div><p className="mt-1.5 text-[10px] text-slate-400">Click to show only those districts</p></div>}{wellsOn && <div role="group" aria-label="Filter wells by trend" className={activeScale ? "sm:border-l sm:border-slate-200 sm:pl-3" : ""}><p className="mb-1.5 font-semibold text-slate-700">Observation well trend</p><div className="space-y-0.5">{wellTrendSteps.map(([, color, label], index) => { const on = wellBins.includes(index); return <button key={label} type="button" aria-pressed={on} onClick={() => setWellBins((current) => toggle(current, index))} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left transition ${on ? "bg-slate-900/5 font-semibold text-slate-900" : wellBins.length ? "text-slate-400 hover:text-slate-700" : "text-slate-600 hover:bg-slate-900/5"}`}><span className={`h-3 w-3 rounded-full ring-1 ring-black/5 ${wellBins.length && !on ? "opacity-40" : ""}`} style={{ background: color }}/>{label}</button>; })}</div><p className="mt-1.5 text-[10px] text-slate-400">{wellCount.toLocaleString()} wells · click one for history</p></div>}</div>}
        {locateError && <p role="alert" className="absolute left-1/2 top-3 w-[min(92%,26rem)] -translate-x-1/2 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-800 shadow-sm">{locateError}</p>}
        {hoverWell && wellsOn && <div className="pointer-events-none absolute right-3 top-3 w-64 rounded-xl border border-white/60 bg-white/95 p-3.5 shadow-lg backdrop-blur"><p className="flex items-start gap-1.5 text-sm font-semibold text-slate-900"><MapPin size={15} className="mt-0.5 shrink-0 text-sky-600"/>{placeTitle(hoverPlace)}</p>{placeSubtitle(hoverPlace) && <p className="mt-0.5 text-[11px] text-slate-500">{placeSubtitle(hoverPlace)}</p>}<p className="tabular mt-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700">{formatCoordinates(hoverWell.lat, hoverWell.lon)}</p><p className="mt-1.5 text-[11px] text-slate-500">Well {hoverWell.id} · {hoverWell.n} readings · {hoverWell.firstYear}–{hoverWell.lastYear} · click for Google Maps link</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-sky-50 p-2"><dt className="text-sky-700/80">Depth {hoverWell.firstYear}</dt><dd className="tabular mt-0.5 text-base font-semibold text-sky-800">{hoverWell.firstDepth} m</dd></div><div className="rounded-lg bg-sky-50 p-2"><dt className="text-sky-700/80">Depth {hoverWell.lastYear}</dt><dd className="tabular mt-0.5 text-base font-semibold text-sky-800">{hoverWell.lastDepth} m</dd></div></dl><p className={`mt-2 text-xs font-semibold ${hoverWell.trend != null && hoverWell.trend >= 0.05 ? "text-red-700" : hoverWell.trend != null && hoverWell.trend <= -0.05 ? "text-blue-700" : "text-slate-600"}`}>{wellTrendText(hoverWell.trend)}</p></div>}
        {!hoverWell && hoverDistrict && censusMode !== "off" && <div className="pointer-events-none absolute right-3 top-3 w-64 rounded-xl border border-white/60 bg-white/95 p-3.5 shadow-lg backdrop-blur"><p className="text-sm font-semibold text-slate-900">{hoverDistrict.name}</p><p className="text-[11px] text-slate-500">{hoverDistrict.province}{hoverDistrict.censusDistricts && hoverDistrict.censusDistricts !== hoverDistrict.name ? ` · includes ${hoverDistrict.censusDistricts}` : ""}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-orange-50 p-2"><dt className="text-orange-700/80">Median depth</dt><dd className="tabular mt-0.5 text-base font-semibold text-orange-800">{hoverDistrict.medianDepthFt != null ? `${hoverDistrict.medianDepthFt} ft` : "—"}</dd></div><div className="rounded-lg bg-violet-50 p-2"><dt className="text-violet-700/80">Brackish</dt><dd className="tabular mt-0.5 text-base font-semibold text-violet-800">{hoverDistrict.brackishPct != null ? `${hoverDistrict.brackishPct}%` : "—"}</dd></div></dl><p className="mt-2 text-[11px] text-slate-500">{hoverDistrict.mouzas?.toLocaleString() ?? 0} mouzas surveyed{hoverDistrict.p75DepthFt != null ? ` · 1 in 4 deeper than ${hoverDistrict.p75DepthFt} ft` : ""}</p></div>}
      </div>
      {mapError && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{mapError}</p>}
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><MapPin size={14} className="mt-0.5 shrink-0"/>District shading uses the Pakistan Bureau of Statistics Mouza Census 2020: the median reported water table depth, and the share of mouzas reporting brackish underground water. Districts created after 2019 are merged into the district they were carved from. Observation wells show the October depth to water recorded at each monitoring site and its long-term linear trend. Community reports with consented GPS use their recorded coordinates; others are placed approximately from the entered address. Nothing on this map certifies water safety.</p>
    </Panel>
    {myLocation && <Panel title={myLocation.place ? `You are near ${myLocation.place}` : myLocation.district ? `You are in ${myLocation.district.name}` : "Your location"} description={`${myLocation.district ? `${myLocation.district.name} district, ${myLocation.district.province}` : "Outside the mapped districts"} · ${myLocation.position[1].toFixed(5)}°N, ${myLocation.position[0].toFixed(5)}°E · accurate to about ${Math.round(myLocation.accuracyM)} m`}>
      <div className="mb-4 flex items-start gap-2"><p className="text-xs leading-5 text-slate-500">Your location is used only in this browser to centre the map and look up the figures below. It is not saved or sent anywhere.</p><button onClick={() => { setMyLocation(null); (mapRef.current?.getSource("my-location") as import("maplibre-gl").GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] } as never); }} aria-label="Clear my location" className="ml-auto shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><X size={15}/></button></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-orange-50 p-4"><p className="text-xs text-orange-700/80">Median water table depth</p><p className="tabular mt-1 text-2xl font-semibold text-orange-800">{myLocation.district?.medianDepthFt != null ? `${myLocation.district.medianDepthFt} ft` : "—"}</p><p className="mt-1 text-[11px] text-orange-800/70">{myLocation.district ? `Across ${myLocation.district.mouzas?.toLocaleString()} mouzas in the district` : "No census data here"}</p></div>
        <div className="rounded-xl bg-violet-50 p-4"><p className="text-xs text-violet-700/80">Brackish groundwater</p><p className="tabular mt-1 text-2xl font-semibold text-violet-800">{myLocation.district?.brackishPct != null ? `${myLocation.district.brackishPct}%` : "—"}</p><p className="mt-1 text-[11px] text-violet-800/70">of mouzas report salty underground water</p></div>
        <button type="button" disabled={!myLocation.nearestWell} onClick={() => { if (!myLocation.nearestWell) return; setSelectedWell(myLocation.nearestWell.well); mapRef.current?.flyTo({ center: [myLocation.nearestWell.well.lon, myLocation.nearestWell.well.lat], zoom: 12 }); }} className="rounded-xl bg-sky-50 p-4 text-left transition hover:bg-sky-100 disabled:hover:bg-sky-50"><p className="text-xs text-sky-700/80">Nearest observation well</p><p className="tabular mt-1 text-2xl font-semibold text-sky-800">{myLocation.nearestWell ? `${myLocation.nearestWell.km < 10 ? myLocation.nearestWell.km.toFixed(1) : Math.round(myLocation.nearestWell.km)} km` : "—"}</p><p className="mt-1 text-[11px] text-sky-800/70">{myLocation.nearestWell ? `${myLocation.nearestWell.well.id} · ${wellTrendText(myLocation.nearestWell.well.trend).toLowerCase()} · open history` : "No monitoring wells loaded"}</p></button>
      </div>
    </Panel>}
    {selectedWell && <div id="well-details" className="scroll-mt-24"><Panel title={placeTitle(selectedPlace)} description={[placeSubtitle(selectedPlace), `Observation well ${selectedWell.id}`, `${selectedWell.n} October readings from ${selectedWell.firstYear} to ${selectedWell.lastYear}`].filter(Boolean).join(" · ")}>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"><MapPin size={16} className="text-sky-600"/><span className="tabular font-mono text-sm text-slate-800">{formatCoordinates(selectedWell.lat, selectedWell.lon)}</span><button type="button" onClick={() => void navigator.clipboard?.writeText(`${selectedWell.lat.toFixed(6)}, ${selectedWell.lon.toFixed(6)}`)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Copy</button><a href={googleMapsUrl(selectedWell.lat, selectedWell.lon)} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Open in Google Maps ↗</a></div>
      <div className="mb-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${selectedWell.trend != null && selectedWell.trend >= 0.05 ? "bg-red-50 text-red-700" : selectedWell.trend != null && selectedWell.trend <= -0.05 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{wellTrendText(selectedWell.trend)}</span><span className="text-xs text-slate-500">Depth to water went from {selectedWell.firstDepth} m to {selectedWell.lastDepth} m</span><button onClick={() => setSelectedWell(null)} aria-label="Close well history" className="ml-auto rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><X size={15}/></button></div>
      <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={selectedWell.series.map(([year, depth]) => ({ year, depth }))} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="wellFill" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3}/><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false}/><YAxis reversed unit=" m" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }}/><Tooltip formatter={(value) => [`${value} m below ground`, "Depth to water"]} labelFormatter={(label) => `October ${label}`}/><Area type="linear" dataKey="depth" stroke="#0284c7" strokeWidth={2.5} fill="url(#wellFill)" dot={{ r: 2.5, fill: "#0284c7" }} activeDot={{ r: 5, fill: "#0284c7", stroke: "white", strokeWidth: 2 }}/></AreaChart></ResponsiveContainer></div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Depth is measured downward from the ground, so a line moving down the chart means the water table is getting deeper.</p>
    </Panel></div>}
    {censusDistricts.length > 0 && <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Deepest water tables" description={`Median reported depth by district · ${censusRankings.mouzas.toLocaleString()} mouzas surveyed`}><ol className="space-y-2">{censusRankings.deepest.map((district, index) => <li key={district.name} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"><span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xs font-bold text-red-700">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{district.name}</span><span className="block text-xs text-slate-500">{district.province} · {district.mouzas} mouzas</span></span><span className="tabular text-sm font-semibold text-red-700">{district.medianDepthFt} ft</span></li>)}</ol></Panel>
      <Panel title="Most brackish groundwater" description="Share of mouzas reporting brackish underground water"><ol className="space-y-2">{censusRankings.brackish.map((district, index) => <li key={district.name} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"><span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-violet-700">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{district.name}</span><span className="block text-xs text-slate-500">{district.province} · {district.mouzas} mouzas</span></span><span className="tabular text-sm font-semibold text-violet-700">{district.brackishPct}%</span></li>)}</ol></Panel>
    </div>}
    {selection && <Panel title={`${selection.name}${selection.city !== selection.name ? ` · ${selection.city}` : ""}`} description={`${selectedReports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)} reports summarized at this zoom level`}>
      <div className="mb-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${riskColor(selection.risk)}`}>{riskText(selection.risk)} area average</span><span className="text-xs text-slate-500">{selectedReports.filter((report) => riskScore(report) >= 1.5).length} high · {selectedReports.filter((report) => riskScore(report) >= 0.75 && riskScore(report) < 1.5).length} moderate · {selectedReports.filter((report) => riskScore(report) < 0.75).length} normal</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{selectedReports.map((report) => { const score = riskScore(report); return <div key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{report.aggregateCount ? `${report.sourceType} · ${report.sampleDate?.slice(0, 7) ?? "All dates"}` : `${reportCodes.get(report.id) ?? report.id} · ${report.address}`}</p><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${riskColor(score)}`}>{riskText(score)}</span></div><p className="mt-2 text-xs text-slate-500">{report.sourceType || "Source type not provided"}{report.depth ? ` · ${report.depth} m deep` : ""}</p><p className="mt-1 text-xs text-slate-500">{report.aggregateCount ? `${report.aggregateCount} reports summarized · average depth ${report.depth || "—"} m` : `${report.sampleDate || "No test date"} · ${report.status}`}</p></div>; })}</div>
    </Panel>}
    {!selection && reports.length > 0 && <div className="flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-xs text-teal-800"><Waves size={16}/><span>Select a city or area bubble to expand its report summary. Zoom in further to inspect individual reports.</span><Activity size={16} className="ml-auto shrink-0"/></div>}
  </>;
}
