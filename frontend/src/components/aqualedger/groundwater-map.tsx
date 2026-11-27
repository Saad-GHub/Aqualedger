"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CircleDot, Layers3, LocateFixed, MapPin, Maximize2, Minus, Plus, User, Waves, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageIntro, Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import { tr, useLanguage } from "@/components/aqualedger/language-toggle";
import { useTheme } from "@/components/aqualedger/theme-toggle";
import {
  readCommunityWaterReports,
  readMyCommunityWaterReports,
  readPublicAreaSourceTrends,
  subscribeToCommunityWaterReports,
  type CommunityWaterReport,
  type PublicAreaSourceTrend,
} from "@/lib/community-water-reports";
import { computeAreaConditions, normalizeAreaName, type AreaConditionLabel } from "@/lib/depth-analytics";
import { asFeet, asMetres, depthFt, depthM } from "@/lib/units";

// "Critical / Moderate / Normal" level used by the filter pills, applied to every layer:
// community reports use the area's depth-trend condition (same as the Depth Forecast page),
// wells use their long-term trend, and census districts use their water-table depth.
const LEVEL_BINS: Record<Exclude<RiskFilter, "all">, { wells: number[]; census: number[] }> = {
  high: { wells: [4], census: [3, 4] },
  moderate: { wells: [3], census: [2] },
  normal: { wells: [0, 1, 2], census: [0, 1] },
};
const conditionRisk: Record<AreaConditionLabel, string> = {
  Critical: "High concern",
  Moderate: "Moderate concern",
  Normal: "Normal",
};
import { screenWaterReport } from "@/lib/water-risk-screening";
import { buildReportCodes } from "@/lib/report-display-codes";
import { buildPakistanRegionsGeoJson } from "@/lib/pakistan-regions-geojson";
import { formatAxisDepthMetersAndFeet, formatDepthMetersAndFeet } from "@/lib/depth-analytics";

type Position = [number, number];
type MapFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: Position };
  properties: Record<string, string | number>;
};
type MapData = { type: "FeatureCollection"; features: MapFeature[] };
type AreaSelection = {
  key: string;
  name: string;
  city: string;
  reportCount: number;
  risk: number;
};
type RiskFilter = "all" | "high" | "moderate" | "normal";

// ---- Area shading: community report status, or the Mouza Census 2020 district layers ----
type ShadeMode = "status" | "depth" | "brackish" | "off";
type CensusMode = Extract<ShadeMode, "depth" | "brackish">;
type CensusDistrict = { name: string; province?: string; censusDistricts?: string; mouzas?: number; medianDepthFt?: number; p75DepthFt?: number; brackishPct?: number };
type CensusFeature = { properties: CensusDistrict; geometry: { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] } };
type ObservationWell = { id: string; lon: number; lat: number; trend: number | null; n: number; firstYear: number; lastYear: number; firstDepth: number; lastDepth: number; series: [number, number][] };
type MyLocation = { position: Position; accuracyM: number; place: string | null; district: CensusDistrict | null; nearestWell: { well: ObservationWell; km: number } | null };
type PlaceName = { name: string; km: number };
type WellPlace = { place: PlaceName | null; district: CensusDistrict | null };

const CENSUS_DATA_URL = "/data/pakistan-groundwater-census-2020.geojson";
const WELLS_DATA_URL = "/data/pakistan-observation-wells.json";
const PAKISTAN_CENTER: Position = [69.3451, 30.3753];
const PAKISTAN_ZOOM = 4.8;
// Pakistan's outline (incl. Gilgit-Baltistan and AJK). The map opens fitted to this
// box on any screen size, and cannot be panned far outside the wider limit.
const PAKISTAN_BOUNDS: [[number, number], [number, number]] = [[60.85, 23.6], [77.85, 37.1]];
const MAP_LIMIT_BOUNDS: [[number, number], [number, number]] = [[48, 14], [92, 46]];
// On wide screens the legend sits on the right (over India), so Pakistan is fitted into
// the space to its left; on phones the legend is folded away and Pakistan fills the box.
const fitPadding = (el: HTMLElement) =>
  el.clientWidth >= 820
    ? { top: 32, bottom: 32, left: 32, right: Math.min(380, Math.round(el.clientWidth * 0.36)) }
    : el.clientWidth < 640
      ? 14
      : 36;

// Linear water-level trend in metres per year: positive means the water table is getting deeper.
const wellTrendSteps: [number, string, string][] = [[-Infinity, "#1d4ed8", "Rising > 20 cm/yr · 8 in"], [-0.2, "#60a5fa", "Rising 5–20 cm/yr · 2–8 in"], [-0.05, "#cbd5e1", "Stable (±5 cm/yr · 2 in)"], [0.05, "#f87171", "Falling 5–20 cm/yr · 2–8 in"], [0.2, "#b91c1c", "Falling > 20 cm/yr · 8 in"]];
const wellCircleColor = ["case", ["==", ["get", "trend"], null], "#94a3b8", ["step", ["get", "trend"], wellTrendSteps[0][1], ...wellTrendSteps.slice(1).flatMap(([bound, color]) => [bound, color])]];

// District colour ramps for the Mouza Census 2020 layer: [lower bound, colour, legend label].
const censusScales: Record<CensusMode, { property: keyof CensusDistrict; title: string; steps: [number, string, string][] }> = {
  depth: { property: "medianDepthFt", title: "Median water table depth", steps: [[0, "#fef9c3", "< 50 ft · 15 m"], [50, "#fde047", "50–100 ft · 15–30 m"], [100, "#fb923c", "100–200 ft · 30–61 m"], [200, "#ef4444", "200–400 ft · 61–122 m"], [400, "#991b1b", "400+ ft · 122+ m"]] },
  brackish: { property: "brackishPct", title: "Mouzas with brackish groundwater", steps: [[0, "#ede9fe", "< 5%"], [5, "#c4b5fd", "5–15%"], [15, "#a78bfa", "15–30%"], [30, "#7c3aed", "30–50%"], [50, "#4c1d95", "50%+"]] },
};
const censusFillColor = (mode: CensusMode) => {
  const { property, steps } = censusScales[mode];
  return ["case", ["has", property], ["step", ["get", property], steps[0][1], ...steps.slice(1).flatMap(([bound, color]) => [bound, color])], "#e2e8f0"];
};
const shadeModes: [ShadeMode, string][] = [["depth", "Water table depth"], ["brackish", "Brackish water"], ["status", "Report status"], ["off", "Off"]];

function pointInRing([x, y]: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
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
const wellTrendText = (trend: number | null) => trend == null ? "Too few readings for a trend" : Math.abs(trend) < 0.05 ? "Roughly stable" : `${trend > 0 ? "Falling" : "Rising"} ${Math.abs(trend * 100).toFixed(0)} cm per year`;

/** Range filter for the legend bins a viewer has switched on; `null` shows everything. */
function binFilter(property: string, steps: [number, string, string][], selected: number[]) {
  if (!selected.length) return null;
  return ["all", ["!=", ["get", property], null], ["any", ...selected.map((index) => ["all", [">=", ["to-number", ["get", property], 0], steps[index][0] === -Infinity ? -1e9 : steps[index][0]], ["<", ["to-number", ["get", property], 0], steps[index + 1]?.[0] ?? 1e9]])]];
}

const cityLocations: { name: string; aliases: string[]; position: Position; quick?: boolean }[] = [
  { name: "Islamabad", aliases: ["islamabad", "ict"], position: [73.0551, 33.6844], quick: true },
  { name: "Rawalpindi", aliases: ["rawalpindi", "pindi"], position: [73.0479, 33.5651], quick: true },
  { name: "Lahore", aliases: ["lahore"], position: [74.3587, 31.5204], quick: true },
  { name: "Faisalabad", aliases: ["faisalabad"], position: [73.0791, 31.418], quick: true },
  { name: "Multan", aliases: ["multan"], position: [71.5249, 30.1575], quick: true },
  { name: "Karachi", aliases: ["karachi"], position: [67.0011, 24.8607], quick: true },
  { name: "Peshawar", aliases: ["peshawar"], position: [71.5249, 34.0151], quick: true },
  { name: "Quetta", aliases: ["quetta"], position: [66.975, 30.1798], quick: true },
  { name: "Hyderabad", aliases: ["hyderabad"], position: [68.3578, 25.396] },
  { name: "Sialkot", aliases: ["sialkot"], position: [74.5361, 32.4945] },
  { name: "Gujranwala", aliases: ["gujranwala"], position: [74.1871, 32.1877] },
  { name: "Bahawalpur", aliases: ["bahawalpur"], position: [71.6833, 29.3956] },
  { name: "Sukkur", aliases: ["sukkur"], position: [68.8574, 27.7052] },
  { name: "Abbottabad", aliases: ["abbottabad"], position: [73.2215, 34.1688] },
  { name: "Sargodha", aliases: ["sargodha"], position: [72.6711, 32.0836] },
  { name: "Gujrat", aliases: ["gujrat"], position: [74.0789, 32.5731] },
  { name: "Gilgit", aliases: ["gilgit"], position: [74.308, 35.9208] },
  { name: "Skardu", aliases: ["skardu"], position: [75.6333, 35.2971] },
  { name: "Muzaffarabad", aliases: ["muzaffarabad"], position: [73.4711, 34.37] },
  { name: "Mirpur", aliases: ["mirpur"], position: [73.7517, 33.1478] },
  { name: "Okara", aliases: ["okara", "depalpur", "renala khurd"], position: [73.4458, 30.81] },
  { name: "Chakwal", aliases: ["chakwal", "tala gang"], position: [72.8531, 32.9328] },
  { name: "Sahiwal", aliases: ["sahiwal", "chichawatni"], position: [73.1066, 30.6682] },
  { name: "Vehari", aliases: ["vehari", "burewala", "mailsi"], position: [72.3528, 30.0445] },
  { name: "Pakpattan", aliases: ["pakpattan", "arif wala"], position: [73.3866, 30.3431] },
  { name: "Khanewal", aliases: ["khanewal", "mian channu", "kabirwala", "jahanian"], position: [71.932, 30.3017] },
  { name: "Lodhran", aliases: ["lodhran", "dunyapur", "kahror pacca"], position: [71.6333, 29.5333] },
  { name: "Jhang", aliases: ["jhang", "shorkot", "athara hazari", "ahmadpur sial"], position: [72.3181, 31.2681] },
  { name: "Chiniot", aliases: ["chiniot", "lalian", "bhawana"], position: [72.9789, 31.72] },
  { name: "Toba Tek Singh", aliases: ["toba tek singh", "gojra", "kamalia", "pir mahal"], position: [72.4827, 30.9713] },
  { name: "Hafizabad", aliases: ["hafizabad", "pindi bhattian"], position: [73.6889, 32.0711] },
  { name: "Khushab", aliases: ["khushab", "quaidabad", "noorpur"], position: [72.3525, 32.2967] },
  { name: "Mianwali", aliases: ["mianwali", "piplan"], position: [71.5436, 32.5775] },
  { name: "Bhakkar", aliases: ["bhakkar", "kalur kot"], position: [71.0657, 31.6253] },
  { name: "Leiah", aliases: ["leiah", "layyah", "karor lal esan", "choubara"], position: [70.939, 30.9613] },
  { name: "Muzaffargarh", aliases: ["muzaffargarh", "kot addu", "alipur", "jatoi"], position: [71.1938, 30.0703] },
  { name: "Rajanpur", aliases: ["rajanpur", "jampur", "rojhan"], position: [70.3297, 29.1035] },
  { name: "Bahawalnagar", aliases: ["bahawalnagar", "chishtian"], position: [73.2536, 29.9987] },
  { name: "Rahim Yar Khan", aliases: ["rahim yar khan", "rahimyar", "sadiqabad", "khanpur", "liaqatpur"], position: [70.2952, 28.4202] },
  { name: "Dera Ghazi Khan", aliases: ["dera ghazi khan", "dg khan"], position: [70.6348, 30.0561] },
  { name: "Mandi Bahauddin", aliases: ["mandi bahauddin", "malakwal", "phalia"], position: [73.4809, 32.5861] },
  { name: "Narowal", aliases: ["narowal", "shakargarh", "zafarwal"], position: [74.8747, 32.1014] },
  { name: "Kasur", aliases: ["kasur", "pattoki", "chunian", "kot radha kishen"], position: [74.4467, 31.1156] },
  { name: "Sheikhupura", aliases: ["sheikhupura", "muridke", "ferozewala", "sharak pur", "safdarabad"], position: [73.985, 31.7131] },
  { name: "Nankana Sahib", aliases: ["nankana sahib", "shah kot", "sangla hill"], position: [73.7065, 31.4492] },
  { name: "Jhelum", aliases: ["jhelum"], position: [73.7264, 32.9425] },
  { name: "Ghotki", aliases: ["ghotki", "ubauro"], position: [69.3156, 28.006] },
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
  const city = cityLocations.find((item) =>
    item.aliases.some((alias) => new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, "i").test(address))
  );
  const cityName = city?.name ?? "Pakistan";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const locality =
    parts.find(
      (part) =>
        !city?.aliases.includes(part.toLowerCase()) &&
        !["punjab", "sindh", "kpk", "khyber pakhtunkhwa", "balochistan", "ict"].includes(
          part.toLowerCase()
        )
    ) ?? address;
  const areaKey = `${locality}, ${cityName}`;
  const areaOffset = hashPosition(areaKey, 0.075);
  const reportOffset = hashPosition(report.id, 0.012);
  const center = city?.position ?? PAKISTAN_CENTER;
  const hasGps =
    report.latitude != null &&
    report.longitude != null &&
    Number.isFinite(report.latitude) &&
    Number.isFinite(report.longitude);
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
  return level === "High concern"
    ? 2
    : level === "Moderate concern"
      ? 1
      : level === "Normal"
        ? 0.5
        : 0.2;
}

function matchesRiskFilter(report: CommunityWaterReport, filter: RiskFilter) {
  if (filter === "all") return true;
  const score = riskScore(report);
  if (filter === "high") return score >= 1.5;
  if (filter === "moderate") return score >= 0.75 && score < 1.5;
  return score < 0.75;
}

function makeFeatures(
  reports: CommunityWaterReport[],
  zoom: number,
  reportCodes: Map<string, string>
): MapData {
  const level = zoom < 6.2 ? "city" : zoom < 10.5 ? "area" : "report";
  if (level === "report") {
    return {
      type: "FeatureCollection",
      features: reports.map((report) => {
        const location = locationFor(report);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: location.reportPosition },
          properties: {
            id: report.id,
            key: report.id,
            label: report.aggregateCount
              ? `${report.sourceType ?? "Source"} · ${report.sampleDate?.slice(0, 7) ?? "all dates"}`
              : report.sourceLabel || reportCodes.get(report.id) || report.id.slice(0, 8),
            city: location.city,
            count: report.aggregateCount ?? 1,
            depth: report.depth ? formatDepthMetersAndFeet(report.depth) : "—",
            score: riskScore(report),
            risk: report.riskLevel ?? screenWaterReport(report).riskLevel,
          },
        };
      }),
    };
  }

  const groups = new Map<
    string,
    { name: string; city: string; position: Position; reports: CommunityWaterReport[] }
  >();
  reports.forEach((report) => {
    const location = locationFor(report);
    const key = level === "city" ? location.city : location.areaKey;
    const name = level === "city" ? location.city : location.locality;
    const position = level === "city" ? location.cityPosition : location.areaPosition;
    const existing = groups.get(key);
    if (existing) existing.reports.push(report);
    else groups.set(key, { name, city: location.city, position, reports: [report] });
  });

  return {
    type: "FeatureCollection",
    features: [...groups.entries()].map(([key, group]) => {
      const totalReports = group.reports.reduce(
        (sum, report) => sum + (report.aggregateCount ?? 1),
        0
      );
      const score =
        group.reports.reduce(
          (sum, report) => sum + riskScore(report) * (report.aggregateCount ?? 1),
          0
        ) / Math.max(1, totalReports);
      const depthValues = group.reports
        .map((r) => Number.parseFloat(r.depth ?? ""))
        .filter(Number.isFinite);
      const avgDepth = depthValues.length
        ? formatDepthMetersAndFeet(depthValues.reduce((a, b) => a + b, 0) / depthValues.length)
        : "—";
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: group.position },
        properties: {
          key,
          label: group.name,
          city: group.city,
          count: totalReports,
          depth: avgDepth,
          score,
          risk:
            score >= 1.5
              ? "High concern"
              : score >= 0.75
                ? "Moderate concern"
                : "Normal",
        },
      };
    }),
  };
}

// One heat point per report (not grouped), tagged with its risk band so each band
// gets its own heatmap layer and colour. Aggregated rows count as many reports,
// on a log scale so one busy area does not drown out everything else.
const HEAT_BANDS = ["normal", "moderate", "high"] as const;
type HeatBand = (typeof HEAT_BANDS)[number];
const HEAT_COLORS: Record<HeatBand, string[]> = {
  normal: ["rgba(13,148,136,0)", "rgba(45,212,191,0.35)", "rgba(20,184,166,0.6)", "rgba(13,148,136,0.8)"],
  moderate: ["rgba(245,158,11,0)", "rgba(252,211,77,0.45)", "rgba(245,158,11,0.7)", "rgba(217,119,6,0.88)"],
  high: ["rgba(220,38,38,0)", "rgba(248,113,113,0.55)", "rgba(220,38,38,0.8)", "rgba(153,27,27,0.95)"],
};

function heatBand(score: number): HeatBand {
  return score >= 1.5 ? "high" : score >= 0.75 ? "moderate" : "normal";
}

function makeHeatFeatures(reports: CommunityWaterReport[]): MapData {
  return {
    type: "FeatureCollection",
    features: reports.map((report) => {
      const count = report.aggregateCount ?? 1;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: locationFor(report).reportPosition },
        properties: {
          band: heatBand(riskScore(report)),
          weight: Math.min(1, Math.log10(count + 1) / Math.log10(51)),
        },
      };
    }),
  } as MapData;
}

// With the heatmap on, the large grouped report circles stay hidden until the
// user zooms in close, so they no longer cover wells and district shading.
const REPORT_DOTS_MIN_ZOOM_WITH_HEAT = 8.5;

function applyHeatmapVisibility(map: import("maplibre-gl").Map, on: boolean) {
  HEAT_BANDS.forEach((band) => {
    if (map.getLayer(`risk-heat-${band}`)) map.setLayoutProperty(`risk-heat-${band}`, "visibility", on ? "visible" : "none");
  });
  if (map.getLayer("risk-points")) map.setLayerZoomRange("risk-points", on ? REPORT_DOTS_MIN_ZOOM_WITH_HEAT : 0, 24);
  if (map.getLayer("risk-labels")) map.setLayerZoomRange("risk-labels", on ? REPORT_DOTS_MIN_ZOOM_WITH_HEAT : 3, 12);
}

export function GroundwaterMap() {
  const lang = useLanguage();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const userMovedMapRef = useRef(false);
  const [reports, setReports] = useState<CommunityWaterReport[]>([]);
  const [myReports, setMyReports] = useState<CommunityWaterReport[]>([]);
  const [mySourcesOnly, setMySourcesOnly] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [publicTrends, setPublicTrends] = useState<PublicAreaSourceTrend[]>([]);
  const [shadeMode, setShadeMode] = useState<ShadeMode>("depth");
  const [heatmapOn, setHeatmapOn] = useState(true);
  const { isAdmin, isSignedIn, authReady } = useAquaRole();
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [selection, setSelection] = useState<AreaSelection | null>(null);

  // Census 2020 districts and observation wells
  const censusFeaturesRef = useRef<CensusFeature[]>([]);
  const [censusDistricts, setCensusDistricts] = useState<CensusDistrict[]>([]);
  const [hoverDistrict, setHoverDistrict] = useState<CensusDistrict | null>(null);
  const [censusBins, setCensusBins] = useState<number[]>([]);
  const [wellsOn, setWellsOn] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const [activeCity, setActiveCity] = useState("All Pakistan");
  const wellsById = useRef(new Map<string, ObservationWell>());
  const [wellCount, setWellCount] = useState(0);
  const [wellBins, setWellBins] = useState<number[]>([]);
  const [hoverWell, setHoverWell] = useState<ObservationWell | null>(null);
  const [selectedWell, setSelectedWellState] = useState<ObservationWell | null>(null);
  const [hoverPlace, setHoverPlace] = useState<WellPlace>({ place: null, district: null });
  const [selectedPlace, setSelectedPlace] = useState<WellPlace>({ place: null, district: null });
  const [myLocation, setMyLocation] = useState<MyLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  // Both only read refs and state setters, so they are stable for the map's one-time event handlers.
  const describeWell = useCallback((well: ObservationWell): WellPlace => ({ place: mapRef.current ? nearestPlace(mapRef.current, [well.lon, well.lat]) : null, district: districtAt([well.lon, well.lat], censusFeaturesRef.current) }), []);
  const setSelectedWell = useCallback((well: ObservationWell | null) => { setSelectedWellState(well); if (well) setSelectedPlace(describeWell(well)); }, [describeWell]);
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const binsActive = censusBins.length + wellBins.length > 0;

  const shadeModeRef = useRef(shadeMode);
  const heatmapOnRef = useRef(heatmapOn);
  const wellsOnRef = useRef(wellsOn);
  useEffect(() => {
    shadeModeRef.current = shadeMode;
  }, [shadeMode]);
  useEffect(() => {
    heatmapOnRef.current = heatmapOn;
  }, [heatmapOn]);
  useEffect(() => {
    wellsOnRef.current = wellsOn;
  }, [wellsOn]);

  useEffect(() => {
    const sev = new URLSearchParams(window.location.search).get("severity")?.toLowerCase();
    if (sev === "critical" || sev === "high") queueMicrotask(() => setRiskFilter("high"));
    else if (sev === "moderate") queueMicrotask(() => setRiskFilter("moderate"));
    else if (sev === "normal") queueMicrotask(() => setRiskFilter("normal"));
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const refresh = () => {
      void readPublicAreaSourceTrends().then(setPublicTrends).catch(() => {});
      if (isAdmin) {
        void readCommunityWaterReports()
          .then((items) => {
            setReports(items);
            setLoadError("");
          })
          .catch((error: unknown) =>
            setLoadError(
              error instanceof Error ? error.message : "Could not load community reports."
            )
          )
          .finally(() => setLoading(false));
        return;
      }
      void readPublicAreaSourceTrends()
        .then((items) => {
          setReports(
            items.map((row, index) => ({
              id: `${row.areaKey}|${row.sourceType}|${row.sampleMonth ?? index}`,
              address: row.areaKey,
              sourceType: row.sourceType,
              depth: row.averageDepthM === null ? "" : String(row.averageDepthM),
              sampleDate: row.sampleMonth ?? undefined,
              status: "aggregated",
              measurements: {},
              aggregateCount: row.reportCount,
              riskLevel:
                row.weightedRiskScore === null
                  ? "Incomplete"
                  : row.weightedRiskScore >= 1.5
                    ? "High concern"
                    : row.weightedRiskScore >= 0.75
                      ? "Moderate concern"
                      : "Normal",
            }))
          );
          setLoadError("");
        })
        .catch(() =>
          setLoadError(
            "Public groundwater summaries are not connected yet. Run supabase/reset-and-renew-schema.sql in Supabase."
          )
        )
        .finally(() => setLoading(false));

      if (isSignedIn) {
        void readMyCommunityWaterReports()
          .then(setMyReports)
          .catch(() => {});
      } else {
        setMyReports([]);
      }
    };
    refresh();
    return isAdmin ? subscribeToCommunityWaterReports(refresh) : () => {};
  }, [isAdmin, isSignedIn, authReady]);

  // Each report carries its area's depth-trend condition, so the level pills, heat colours,
  // dots and region status all follow the same Normal / Moderate / Critical as the forecast page.
  const areaConditions = useMemo(() => computeAreaConditions(publicTrends), [publicTrends]);
  const activeBaseReports = useMemo(() => {
    const base = mySourcesOnly && isSignedIn && !isAdmin ? myReports : reports;
    if (!areaConditions.size) return base;
    return base.map((report) => {
      const condition =
        areaConditions.get(report.areaKey ?? "") ??
        areaConditions.get(report.address) ??
        areaConditions.get(normalizeAreaName(report.areaName, report.address));
      if (!condition) return report;
      const lab = report.riskLevel;
      const worst =
        lab === "High concern" || condition === "Critical"
          ? "High concern"
          : lab === "Moderate concern" || condition === "Moderate"
            ? "Moderate concern"
            : conditionRisk[condition];
      return { ...report, riskLevel: worst };
    });
  }, [mySourcesOnly, isSignedIn, isAdmin, myReports, reports, areaConditions]);
  const effectiveCensusBins = riskFilter === "all" ? censusBins : LEVEL_BINS[riskFilter].census;
  const effectiveWellBins = riskFilter === "all" ? wellBins : LEVEL_BINS[riskFilter].wells;

  const visibleReports = useMemo(
    () => activeBaseReports.filter((report) => matchesRiskFilter(report, riskFilter)),
    [activeBaseReports, riskFilter]
  );

  const regionsGeoJson = useMemo(
    () => buildPakistanRegionsGeoJson(visibleReports, riskScore),
    [visibleReports]
  );

  const reportCodes = useMemo(() => buildReportCodes(visibleReports), [visibleReports]);
  const visibleReportsRef = useRef(visibleReports);
  const reportCodesRef = useRef(reportCodes);
  const regionsGeoJsonRef = useRef(regionsGeoJson);

  useEffect(() => {
    visibleReportsRef.current = visibleReports;
    reportCodesRef.current = reportCodes;
    regionsGeoJsonRef.current = regionsGeoJson;
  }, [visibleReports, reportCodes, regionsGeoJson]);

  const selectedReports = useMemo(() => {
    if (!selection) return [];
    return visibleReports.filter((report) => {
      if (report.id === selection.key) return true;
      const location = locationFor(report);
      return selection.key === location.city
        ? location.city === selection.city
        : location.areaKey === selection.key;
    });
  }, [visibleReports, selection]);

  // The map is rebuilt with a matching basemap whenever the theme changes; all
  // data layers are re-added from refs in the "load" handler below.
  const theme = useTheme();
  useEffect(() => {
    if (!theme || !mapContainer.current || mapRef.current) return;
    let disposed = false;
    let map: import("maplibre-gl").Map | null = null;
    void import("maplibre-gl")
      .then((maplibregl) => {
        if (disposed || !mapContainer.current) return;
        maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
        userMovedMapRef.current = false;
        map = new maplibregl.Map({
          container: mapContainer.current,
          style: theme === "dark" ? "https://tiles.openfreemap.org/styles/dark" : "https://tiles.openfreemap.org/styles/liberty",
          bounds: PAKISTAN_BOUNDS,
          fitBoundsOptions: { padding: fitPadding(mapContainer.current) },
          maxBounds: MAP_LIMIT_BOUNDS,
          minZoom: 3,
          maxZoom: 16,
          attributionControl: false,
          // Page scrolling never moves the map: Ctrl/⌘ + scroll on desktop, two fingers on phones.
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        mapRef.current = map;

        // Keep the whole of Pakistan in view when the box resizes (rotation, sidebar,
        // window resize) until the user moves the map themselves.
        map.on("movestart", (event) => {
          if ((event as { originalEvent?: Event }).originalEvent) userMovedMapRef.current = true;
        });
        map.on("resize", () => {
          if (!map || userMovedMapRef.current || !mapContainer.current) return;
          map.fitBounds(PAKISTAN_BOUNDS, { padding: fitPadding(mapContainer.current), duration: 0 });
        });
        map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
        });

        map.on("load", () => {
          if (!map) return;
          const initialMode = shadeModeRef.current;
          const geojson = (id: string) => map?.getSource(id) as import("maplibre-gl").GeoJSONSource | undefined;

          // 1. Mouza Census 2020 district shading (water table depth / brackish water)
          map.addSource("census-districts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          const censusVisibility = initialMode === "depth" || initialMode === "brackish" ? "visible" : "none";
          map.addLayer({ id: "census-fill", type: "fill", source: "census-districts", layout: { visibility: censusVisibility }, paint: { "fill-color": censusFillColor(initialMode === "brackish" ? "brackish" : "depth") as never, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.72, 9, 0.45] } });
          map.addLayer({ id: "census-outline", type: "line", source: "census-districts", layout: { visibility: censusVisibility }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 9, 1.6], "line-opacity": 0.85 } });
          void fetch(CENSUS_DATA_URL)
            .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
            .then((data: { features: CensusFeature[] }) => {
              geojson("census-districts")?.setData(data as never);
              censusFeaturesRef.current = data.features;
              setCensusDistricts(data.features.map((feature) => feature.properties));
            })
            .catch(() => setMapError("Mouza Census 2020 district data could not load."));
          map.on("mousemove", "census-fill", (event) => setHoverDistrict((event.features?.[0]?.properties as CensusDistrict | undefined) ?? null));
          map.on("mouseleave", "census-fill", () => setHoverDistrict(null));

          // 2. Pakistan region status from community reports
          map.addSource("pakistan-regions", {
            type: "geojson",
            data: regionsGeoJsonRef.current as never,
          });
          const regionVisibility = initialMode === "status" ? "visible" : "none";
          map.addLayer({
            id: "region-fills",
            type: "fill",
            source: "pakistan-regions",
            layout: { visibility: regionVisibility },
            paint: {
              "fill-color": [
                "match",
                ["get", "status"],
                "Critical",
                "#dc2626",
                "Moderate",
                "#f59e0b",
                "Normal",
                "#0d9488",
                "#94a3b8",
              ],
              "fill-opacity": [
                "match",
                ["get", "status"],
                "No data",
                0.22,
                0.48,
              ],
            },
          });
          map.addLayer({
            id: "region-borders",
            type: "line",
            source: "pakistan-regions",
            layout: { visibility: regionVisibility },
            paint: {
              "line-color": "#ffffff",
              "line-width": 1.6,
              "line-opacity": 0.9,
            },
          });

          // 3. Observation wells with their long-term trend
          map.addSource("observation-wells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          const wellVisibility = wellsOnRef.current ? "visible" : "none";
          map.addLayer({ id: "observation-wells", type: "circle", source: "observation-wells", layout: { visibility: wellVisibility }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.2, 7, 4, 11, 7], "circle-color": wellCircleColor as never, "circle-stroke-color": "#ffffff", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 9, 1.2], "circle-opacity": 0.9 } });
          map.addLayer({ id: "observation-well-labels", type: "symbol", source: "observation-wells", minzoom: 10.5, layout: { visibility: wellVisibility, "text-field": ["get", "coords"], "text-font": ["Noto Sans Regular"], "text-size": 10.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true }, paint: { "text-color": "#0c4a6e", "text-halo-color": "#ffffff", "text-halo-width": 1.6 } });
          void fetch(WELLS_DATA_URL)
            .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
            .then((data: { sites: ObservationWell[] }) => {
              wellsById.current = new Map(data.sites.map((site) => [site.id, site]));
              setWellCount(data.sites.length);
              geojson("observation-wells")?.setData({ type: "FeatureCollection", features: data.sites.map((site) => ({ type: "Feature", geometry: { type: "Point", coordinates: [site.lon, site.lat] }, properties: { id: site.id, trend: site.trend, coords: `${site.lat.toFixed(4)}°N, ${site.lon.toFixed(4)}°E` } })) } as never);
            })
            .catch(() => setMapError("Observation well data could not load."));
          const wellAt = (event: { features?: { properties: Record<string, unknown> }[] }) => wellsById.current.get(String(event.features?.[0]?.properties.id ?? "")) ?? null;
          let hoveredId = "";
          map.on("mousemove", "observation-wells", (event) => {
            const well = wellAt(event);
            if (map) map.getCanvas().style.cursor = "pointer";
            if (!well || well.id === hoveredId) return;
            hoveredId = well.id;
            setHoverWell(well);
            setHoverPlace(describeWell(well));
          });
          map.on("mouseleave", "observation-wells", () => {
            hoveredId = "";
            setHoverWell(null);
            if (map) map.getCanvas().style.cursor = "";
          });
          map.on("click", "observation-wells", (event) => {
            setSelectedWell(wellAt(event));
            window.setTimeout(() => document.getElementById("well-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
          });

          // 4. Community report heatmap + dots
          map.addSource("water-reports", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            promoteId: "key",
          });
          // Heatmap per risk band, drawn under the wells so wells stay visible on top.
          map.addSource("water-reports-heat", { type: "geojson", data: makeHeatFeatures(visibleReportsRef.current) as never });
          HEAT_BANDS.forEach((band) => {
            const [c0, c1, c2, c3] = HEAT_COLORS[band];
            map?.addLayer(
              {
                id: `risk-heat-${band}`,
                type: "heatmap",
                source: "water-reports-heat",
                filter: ["==", ["get", "band"], band],
                layout: { visibility: heatmapOnRef.current ? "visible" : "none" },
                paint: {
                  "heatmap-weight": ["get", "weight"],
                  "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, band === "high" ? 1.4 : 0.9, 10, band === "high" ? 3 : 2],
                  "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, band === "high" ? 16 : 12, 8, 22, 12, 34],
                  "heatmap-opacity": 0.85,
                  "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, c0, 0.25, c1, 0.6, c2, 1, c3],
                },
              },
              map.getLayer("observation-wells") ? "observation-wells" : undefined
            );
          });
          map.addLayer({
            id: "risk-points",
            type: "circle",
            source: "water-reports",
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                ["interpolate", ["linear"], ["get", "count"], 1, 4, 50, 9],
                10,
                ["interpolate", ["linear"], ["get", "count"], 1, 5, 50, 10],
              ],
              "circle-color": ["step", ["get", "score"], "#0d9488", 0.75, "#f59e0b", 1.5, "#dc2626"],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
              "circle-opacity": 0.9,
            },
          });
          map.addLayer({
            id: "risk-labels",
            type: "symbol",
            source: "water-reports",
            minzoom: 3,
            maxzoom: 12,
            layout: {
              "text-field": ["concat", ["get", "label"], " · ", ["to-string", ["get", "count"]]],
              // The liberty style only serves Noto Sans; the default font would leave labels blank.
              "text-font": ["Noto Sans Regular"],
              "text-size": 12,
              "text-offset": [0, 1.4],
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#0f172a",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.6,
            },
          });

          applyHeatmapVisibility(map, heatmapOnRef.current);

          // 5. "My location" marker
          map.addSource("my-location", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({ id: "my-location-halo", type: "circle", source: "my-location", paint: { "circle-radius": 20, "circle-color": "#3b82f6", "circle-opacity": 0.18, "circle-stroke-color": "#3b82f6", "circle-stroke-width": 1, "circle-stroke-opacity": 0.4 } });
          map.addLayer({ id: "my-location-dot", type: "circle", source: "my-location", paint: { "circle-radius": 7, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });

          const setMapData = () => {
            geojson("water-reports")?.setData(
              makeFeatures(
                visibleReportsRef.current,
                map?.getZoom() ?? PAKISTAN_ZOOM,
                reportCodesRef.current
              ) as never
            );
          };
          setMapData();
          map.on("zoomend", setMapData);

          map.on("click", "risk-points", (event) => {
            const properties = event.features?.[0]?.properties;
            if (!properties) return;
            const key = String(properties.key ?? properties.city ?? "");
            const name = String(properties.label ?? "Reported location");
            setSelection({
              key,
              name,
              city: String(properties.city ?? name),
              reportCount: Number(properties.count ?? 1),
              risk: Number(properties.score ?? 0),
            });
            if (map && map.getZoom() < 10.5) {
              userMovedMapRef.current = true;
              map.easeTo({
                center: event.lngLat,
                zoom: Math.min(11, map.getZoom() + 2.2),
                duration: 500,
              });
            }
          });

          // Hover popup for dots
          map.on("mouseenter", "risk-points", (event) => {
            if (!map) return;
            map.getCanvas().style.cursor = "pointer";
            const feature = event.features?.[0];
            const props = feature?.properties;
            if (!props || feature.geometry.type !== "Point") return;
            const coords = feature.geometry.coordinates.slice() as [number, number];
            popup
              .setLngLat(coords)
              .setHTML(
                `<div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.4">
                  <strong>${String(props.label ?? "Location")}</strong><br/>
                  <span>${String(props.count ?? 1)} reports received · Avg depth: ${String(props.depth ?? "—")}</span><br/>
                  <span style="color:#0f766e;font-weight:600">${String(props.risk ?? "")}</span>
                </div>`
              )
              .addTo(map);
          });

          map.on("mouseleave", "risk-points", () => {
            if (map) map.getCanvas().style.cursor = "";
            popup.remove();
          });

          // Hover popup for region polygons when not hovering a dot
          map.on("mousemove", "region-fills", (event) => {
            if (!map) return;
            const dotHits = map.queryRenderedFeatures(event.point, { layers: ["risk-points"] });
            if (dotHits.length > 0) return;
            const props = event.features?.[0]?.properties;
            if (!props) return;
            const count = Number(props.reportCount ?? 0);
            const depthText = props.avgDepthM != null && props.avgDepthM !== "null" ? formatDepthMetersAndFeet(Number(props.avgDepthM)) : "—";
            popup
              .setLngLat(event.lngLat)
              .setHTML(
                `<div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.4">
                  <strong>${String(props.name ?? "Region")}</strong> <span style="color:#64748b">(${String(props.province ?? "")})</span><br/>
                  <span>Status: <strong>${String(props.status ?? "No data")}</strong></span><br/>
                  <span>${count > 0 ? `${count} reports · Avg depth: ${depthText}` : "No data received yet"}</span>
                </div>`
              )
              .addTo(map);
          });

          map.on("mouseleave", "region-fills", () => {
            popup.remove();
          });

          map.on("error", (event) => {
            if (event.error?.message?.includes("style") || event.error?.message?.includes("fetch")) {
              setMapError(
                "Map tiles could not load. Check the internet connection and try reloading."
              );
            }
          });
        });
      })
      .catch((error: unknown) =>
        setMapError(
          error instanceof Error
            ? `Interactive map error: ${error.message}`
            : "Interactive map could not be started in this browser."
        )
      );
    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [describeWell, setSelectedWell, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const reportSource = map.getSource("water-reports") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    reportSource?.setData(makeFeatures(visibleReports, map.getZoom(), reportCodes) as never);
    (map.getSource("water-reports-heat") as import("maplibre-gl").GeoJSONSource | undefined)?.setData(
      makeHeatFeatures(visibleReports) as never
    );

    const regionSource = map.getSource("pakistan-regions") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    regionSource?.setData(regionsGeoJson as never);
  }, [visibleReports, reportCodes, regionsGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    applyHeatmapVisibility(map, heatmapOn);
  }, [heatmapOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("region-fills") || !map.getLayer("census-fill")) return;
    const regions = shadeMode === "status" ? "visible" : "none";
    const census = shadeMode === "depth" || shadeMode === "brackish" ? "visible" : "none";
    map.setLayoutProperty("region-fills", "visibility", regions);
    map.setLayoutProperty("region-borders", "visibility", regions);
    map.setLayoutProperty("census-fill", "visibility", census);
    map.setLayoutProperty("census-outline", "visibility", census);
    if (shadeMode === "depth" || shadeMode === "brackish") {
      map.setPaintProperty("census-fill", "fill-color", censusFillColor(shadeMode) as never);
      const { property, steps } = censusScales[shadeMode];
      const filter = binFilter(property, steps, effectiveCensusBins) as never;
      map.setFilter("census-fill", filter);
      map.setFilter("census-outline", filter);
    }
  }, [shadeMode, effectiveCensusBins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("observation-wells")) return;
    const visibility = wellsOn ? "visible" : "none";
    map.setLayoutProperty("observation-wells", "visibility", visibility);
    map.setLayoutProperty("observation-well-labels", "visibility", visibility);
    const filter = binFilter("trend", wellTrendSteps, effectiveWellBins) as never;
    map.setFilter("observation-wells", filter);
    map.setFilter("observation-well-labels", filter);
  }, [wellsOn, effectiveWellBins]);

  function showMyLocation() {
    if (!("geolocation" in navigator)) { setLocateError("This browser cannot share its location."); return; }
    setLocating(true);
    setLocateError("");
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
      userMovedMapRef.current = true;
      map.flyTo({ center: position, zoom: 11, duration: 1200 });
    }, (error) => {
      setLocating(false);
      setLocateError(error.code === error.PERMISSION_DENIED ? "Location permission was blocked. Allow location for this site in the browser, then try again." : "Your location could not be found. Try again outdoors or with Wi-Fi turned on.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  function clearMyLocation() {
    setMyLocation(null);
    (mapRef.current?.getSource("my-location") as import("maplibre-gl").GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] } as never);
  }

  const censusRankings = useMemo(() => {
    const top = (property: "medianDepthFt" | "brackishPct") => censusDistricts.filter((district) => district[property] != null && (district.mouzas ?? 0) >= 40).sort((a, b) => (b[property] ?? 0) - (a[property] ?? 0)).slice(0, 5);
    return { deepest: top("medianDepthFt"), brackish: top("brackishPct"), mouzas: censusDistricts.reduce((sum, district) => sum + (district.mouzas ?? 0), 0) };
  }, [censusDistricts]);
  const activeScale = shadeMode === "depth" || shadeMode === "brackish" ? censusScales[shadeMode] : null;

  const riskColor = (score: number) =>
    score >= 1.5
      ? "text-red-700 bg-red-50"
      : score >= 0.75
        ? "text-amber-700 bg-amber-50"
        : "text-teal-700 bg-teal-50";
  const riskText = (score: number) =>
    score >= 1.5 ? "Critical" : score >= 0.75 ? "Moderate" : "Normal";

  const selectedDepthValues = selectedReports
    .map((r) => Number.parseFloat(r.depth ?? ""))
    .filter(Number.isFinite);
  const selectedAvgDepth = selectedDepthValues.length
    ? (selectedDepthValues.reduce((a, b) => a + b, 0) / selectedDepthValues.length).toFixed(1)
    : null;

  const regionsWithData = regionsGeoJson.features.filter(
    (f) => f.properties.reportCount > 0
  ).length;

  const resetView = () => {
    userMovedMapRef.current = false;
    if (mapRef.current && mapContainer.current) {
      mapRef.current.fitBounds(PAKISTAN_BOUNDS, { padding: fitPadding(mapContainer.current), duration: 900 });
    }
    setSelection(null);
  };

  const legendButton = (on: boolean, anyOn: boolean) =>
    `flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left transition ${
      on
        ? "bg-slate-900/5 font-semibold text-slate-900"
        : anyOn
          ? "text-slate-400 hover:text-slate-700"
          : "text-slate-600 hover:bg-slate-900/5"
    }`;

  return (
    <>
      <PageIntro
        title={tr(lang, "Groundwater Trend & Risk Map", "زمینی پانی کے رجحانات اور خطرات کا نقشہ")}
        description={tr(
          lang,
          "District water table depth and brackish groundwater from the Mouza Census 2020, long-term trends at observation wells, and community reports on top as dots and a live heatmap.",
          "موضع مردم شماری 2020 سے ضلعی پانی کی گہرائی اور کھارا پن، مشاہداتی کنوؤں کے طویل مدتی رجحانات، اور کمیونٹی رپورٹس کا لائیو ہیٹ میپ۔"
        )}
      />
      {/* Compact single-row stat strip so the Map fits immediately above the fold */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div>
            <span className="text-slate-500">{tr(lang, "Reports", "رپورٹس")}: </span>
            <strong className="tabular text-slate-900 dark:text-slate-100">
              {loading && !reports.length ? "…" : visibleReports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{tr(lang, "Regions", "علاقے")}: </span>
            <strong className="tabular text-slate-900 dark:text-slate-100">
              {loading && !reports.length ? "…" : `${regionsWithData} / ${regionsGeoJson.features.length}`}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{tr(lang, "Critical", "تشویشناک")}: </span>
            <strong className="tabular text-red-600 dark:text-red-400">
              {loading && !reports.length ? "…" : visibleReports.filter((report) => riskScore(report) >= 1.5).length}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">{tr(lang, "Wells", "کنویں")}: </span>
            <strong className="tabular text-sky-700 dark:text-sky-300">
              {wellCount ? wellCount.toLocaleString() : "…"}
            </strong>
            {censusRankings.mouzas > 0 && (
              <span className="ml-1 hidden text-slate-400 sm:inline">({censusRankings.mouzas.toLocaleString()} {tr(lang, "mouzas", "موضع")})</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={showMyLocation}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
        >
          <LocateFixed size={14} />
          {locating ? tr(lang, "Locating…", "مقام تلاش ہو رہا ہے…") : tr(lang, "My Location", "میرا مقام")}
        </button>
      </div>

      <Panel
        title={tr(lang, "Pakistan Groundwater Heatmap & Regional Status", "پاکستان گراؤنڈ واٹر ہیٹ میپ اور علاقائی صورتحال")}
        description={tr(
          lang,
          "Shade districts by census water table depth, brackish water, or community report status. Dots mark exact areas where reports were received.",
          "اضلاع کو پانی کی گہرائی، کھارے پن یا کمیونٹی رپورٹس کی صورتحال کے لحاظ سے دیکھیں۔"
        )}
      >
        {/* Quick City Jump */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={activeCity === "All Pakistan"}
            onClick={() => {
              setActiveCity("All Pakistan");
              resetView();
            }}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              activeCity === "All Pakistan"
                ? "border-teal-600 bg-teal-600 text-white shadow-xs"
                : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800"
            }`}
          >
            {tr(lang, "All Pakistan", "پورا پاکستان")}
          </button>
          {cityLocations
            .filter((c) => c.quick)
            .map((city) => {
              const isActive = activeCity === city.name;
              return (
                <button
                  key={city.name}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    setActiveCity(city.name);
                    userMovedMapRef.current = true;
                    mapRef.current?.flyTo({ center: city.position, zoom: 9.2 });
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? "border-teal-600 bg-teal-600 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800"
                  }`}
                >
                  {city.name}
                </button>
              );
            })}
        </div>

        {/* Area shading + layer toggles */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Layers3 size={15} />
              {tr(lang, "Shade by", "رنگ کی بنیاد")}
            </span>
            <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Area shading">
              {shadeModes.map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={shadeMode === mode}
                  onClick={() => {
                    setShadeMode(mode);
                    setCensusBins([]);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    shadeMode === mode ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isSignedIn && !isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setMySourcesOnly((v) => !v);
                  setSelection(null);
                }}
                aria-pressed={mySourcesOnly}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                  mySourcesOnly
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <User size={14} />
                {mySourcesOnly ? "My sources only" : "All public areas"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setHeatmapOn((current) => !current)}
              aria-pressed={heatmapOn}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                heatmapOn
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              <Activity size={15} />
              {heatmapOn ? tr(lang, "Heatmap on", "ہیٹ میپ آن") : tr(lang, "Heatmap off", "ہیٹ میپ آف")}
            </button>
            <button
              type="button"
              onClick={() => setWellsOn((current) => !current)}
              aria-pressed={wellsOn}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                wellsOn ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600"
              }`}
            >
              <CircleDot size={15} />
              {wellsOn ? tr(lang, "Wells on", "کنویں آن") : tr(lang, "Wells off", "کنویں آف")}
            </button>
            <button
              aria-label="Zoom in"
              onClick={() => mapRef.current?.zoomIn()}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            >
              <Plus size={17} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => mapRef.current?.zoomOut()}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            >
              <Minus size={17} />
            </button>
            <button
              aria-label="Reset Pakistan view"
              title="Show all of Pakistan"
              onClick={resetView}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            >
              <Maximize2 size={17} />
            </button>
            <button
              type="button"
              onClick={showMyLocation}
              disabled={locating}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <LocateFixed size={15} className={locating ? "animate-pulse" : ""} />
              {locating ? "Finding you…" : "My location"}
            </button>
          </div>
        </div>

        {/* Risk Filter Pills */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              { id: "all", label: tr(lang, "All levels", "تمام سطحیں"), dot: "bg-slate-400", style: "bg-slate-100 text-slate-700" },
              { id: "high", label: tr(lang, "Critical", "تشویشناک"), dot: "bg-red-500", style: "bg-red-50 text-red-700" },
              { id: "moderate", label: tr(lang, "Moderate", "درمیانہ"), dot: "bg-amber-500", style: "bg-amber-50 text-amber-800" },
              { id: "normal", label: tr(lang, "Normal", "معمول"), dot: "bg-teal-600", style: "bg-teal-50 text-teal-700" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRiskFilter(item.id)}
              aria-pressed={riskFilter === item.id}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold transition ${
                riskFilter === item.id
                  ? `${item.style} ring-2 ring-slate-400/50`
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${item.dot}`} />
              {item.label}
            </button>
          ))}
          {binsActive && (
            <button
              type="button"
              onClick={() => {
                setCensusBins([]);
                setWellBins([]);
              }}
              className="ml-1 font-semibold text-teal-700 hover:underline"
            >
              Clear legend filters
            </button>
          )}
        </div>

        {loadError && (
          <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            {loadError}
          </p>
        )}
        <div className="@container relative">
          <div
            ref={mapContainer}
            className="h-[60svh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-[68vh] sm:min-h-110"
            aria-label="Interactive groundwater risk and trend map of Pakistan"
          />

          {/* Compact collapsible legend toggle so Balochistan/Karachi stay unobstructed by default. */}
          {(shadeMode !== "off" || wellsOn || heatmapOn) && (
            <button
              type="button"
              onClick={() => setLegendOpen((open) => !open)}
              aria-expanded={legendOpen}
              className="glass-strong absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
            >
              {legendOpen ? <X size={14} /> : <Layers3 size={14} />}
              {legendOpen ? "Hide legend" : "Legend"}
            </button>
          )}

          {/* Floating legend (bottom-left). Census and well entries are filter buttons. */}
          {(shadeMode !== "off" || wellsOn || heatmapOn) && (
            <div className={`${legendOpen ? "flex" : "hidden"} glass-strong pointer-events-auto absolute bottom-14 left-3 right-3 z-10 max-h-[calc(100%-4.5rem)] flex-col gap-3 overflow-y-auto rounded-2xl p-3 text-xs sm:right-auto sm:flex-row @min-[820px]:w-[min(22rem,38%)] @min-[820px]:flex-col`}>
              {shadeMode === "status" && (
                <div>
                  <p className="mb-1.5 font-semibold text-slate-700">Region status</p>
                  <div className="space-y-1.5 text-slate-700">
                    {[
                      ["bg-red-600/80", "Critical"],
                      ["bg-amber-500/80", "Moderate"],
                      ["bg-teal-600/80", "Normal"],
                      ["bg-slate-400/50", "No data received"],
                    ].map(([color, label]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-sm ${color}`} />
                        <span>{label}</span>
                      </div>
                    ))}
                    <div className="mt-1.5 flex items-center gap-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
                      <span className="h-2.5 w-2.5 rounded-full border border-white bg-teal-600 shadow-sm" />
                      <span>Dots = received reports</span>
                    </div>
                  </div>
                </div>
              )}
              {activeScale && (
                <div role="group" aria-label={`Filter districts by ${activeScale.title.toLowerCase()}`}>
                  <p className="mb-1.5 font-semibold text-slate-700">{activeScale.title}</p>
                  <div className="space-y-0.5">
                    {activeScale.steps.map(([, color, label], index) => {
                      const on = effectiveCensusBins.includes(index);
                      return (
                        <button key={label} type="button" aria-pressed={on} onClick={() => { if (riskFilter !== "all") { setRiskFilter("all"); setCensusBins([index]); } else setCensusBins((current) => toggle(current, index)); }} className={legendButton(on, effectiveCensusBins.length > 0)}>
                          <span className={`h-3 w-5 rounded-sm ring-1 ring-black/5 ${effectiveCensusBins.length && !on ? "opacity-40" : ""}`} style={{ background: color }} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  
                </div>
              )}
              {wellsOn && (
                <div role="group" aria-label="Filter wells by trend" className={shadeMode !== "off" ? "sm:border-l sm:border-slate-200 sm:pl-3" : ""}>
                  <p className="mb-1.5 font-semibold text-slate-700">Observation well trend</p>
                  <div className="space-y-0.5">
                    {wellTrendSteps.map(([, color, label], index) => {
                      const on = effectiveWellBins.includes(index);
                      return (
                        <button key={label} type="button" aria-pressed={on} onClick={() => { if (riskFilter !== "all") { setRiskFilter("all"); setWellBins([index]); } else setWellBins((current) => toggle(current, index)); }} className={legendButton(on, effectiveWellBins.length > 0)}>
                          <span className={`h-3 w-3 rounded-full ring-1 ring-black/5 ${effectiveWellBins.length && !on ? "opacity-40" : ""}`} style={{ background: color }} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-400">{wellCount.toLocaleString()} wells · click one for history</p>
                </div>
              )}
              {heatmapOn && (
                <div className="sm:border-l sm:border-slate-200 sm:pl-3">
                  <p className="mb-1.5 font-semibold text-slate-700">Community report heat</p>
                  <div className="space-y-1.5">
                    {(
                      [
                        ["high", "Critical"],
                        ["moderate", "Moderate"],
                        ["normal", "Normal / no lab data"],
                      ] as const
                    ).map(([band, label]) => (
                      <div key={band} className="flex items-center gap-2 px-1.5">
                        <span className="h-3 w-5 rounded-full" style={{ background: `radial-gradient(circle, ${HEAT_COLORS[band][3]} 0%, ${HEAT_COLORS[band][1]} 60%, transparent 100%)` }} />
                        {label}
                      </div>
                    ))}
                  </div>
                  
                </div>
              )}
            </div>
          )}

          {locateError && (
            <p role="alert" className="absolute left-1/2 top-3 z-10 w-[min(92%,26rem)] -translate-x-1/2 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-800 shadow-sm">
              {locateError}
            </p>
          )}

          {hoverWell && wellsOn && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 w-64 rounded-2xl border border-white/60 bg-white/95 p-3.5 shadow-lg backdrop-blur @min-[820px]:left-3! @min-[820px]:right-auto!">
              <p className="flex items-start gap-1.5 text-sm font-semibold text-slate-900"><MapPin size={15} className="mt-0.5 shrink-0 text-sky-600" />{placeTitle(hoverPlace)}</p>
              {placeSubtitle(hoverPlace) && <p className="mt-0.5 text-[11px] text-slate-500">{placeSubtitle(hoverPlace)}</p>}
              <p className="tabular mt-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700">{formatCoordinates(hoverWell.lat, hoverWell.lon)}</p>
              <p className="mt-1.5 text-[11px] text-slate-500">Well {hoverWell.id} · {hoverWell.n} readings · {hoverWell.firstYear}–{hoverWell.lastYear} · click for history</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-sky-50 p-2"><dt className="text-sky-700/80">Depth {hoverWell.firstYear}</dt><dd className="tabular mt-0.5 text-sm font-semibold text-sky-800">{formatDepthMetersAndFeet(hoverWell.firstDepth, 2)}</dd></div>
                <div className="rounded-lg bg-sky-50 p-2"><dt className="text-sky-700/80">Depth {hoverWell.lastYear}</dt><dd className="tabular mt-0.5 text-sm font-semibold text-sky-800">{formatDepthMetersAndFeet(hoverWell.lastDepth, 2)}</dd></div>
              </dl>
              <p className={`mt-2 text-xs font-semibold ${hoverWell.trend != null && hoverWell.trend >= 0.05 ? "text-red-700" : hoverWell.trend != null && hoverWell.trend <= -0.05 ? "text-blue-700" : "text-slate-600"}`}>{wellTrendText(hoverWell.trend)}</p>
            </div>
          )}

          {!hoverWell && hoverDistrict && activeScale && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 w-64 rounded-2xl border border-white/60 bg-white/95 p-3.5 shadow-lg backdrop-blur @min-[820px]:left-3! @min-[820px]:right-auto!">
              <p className="text-sm font-semibold text-slate-900">{hoverDistrict.name}</p>
              <p className="text-[11px] text-slate-500">{hoverDistrict.province}{hoverDistrict.censusDistricts && hoverDistrict.censusDistricts !== hoverDistrict.name ? ` · includes ${hoverDistrict.censusDistricts}` : ""}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-orange-50 p-2"><dt className="text-orange-700/80">Median depth</dt><dd className="tabular mt-0.5 text-base font-semibold text-orange-800">{hoverDistrict.medianDepthFt != null ? <>{hoverDistrict.medianDepthFt} ft<span className="ml-1 text-[11px] font-medium text-orange-700/70">{asMetres(hoverDistrict.medianDepthFt)}</span></> : "—"}</dd></div>
                <div className="rounded-lg bg-violet-50 p-2"><dt className="text-violet-700/80">Brackish</dt><dd className="tabular mt-0.5 text-base font-semibold text-violet-800">{hoverDistrict.brackishPct != null ? `${hoverDistrict.brackishPct}%` : "—"}</dd></div>
              </dl>
              <p className="mt-2 text-[11px] text-slate-500">{hoverDistrict.mouzas?.toLocaleString() ?? 0} mouzas surveyed{hoverDistrict.p75DepthFt != null ? ` · 1 in 4 deeper than ${depthFt(hoverDistrict.p75DepthFt)}` : ""}</p>
            </div>
          )}
        </div>

        {mapError && (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {mapError}
          </p>
        )}
      </Panel>

      {myLocation && (
        <Panel
          title={myLocation.place ? `You are near ${myLocation.place}` : myLocation.district ? `You are in ${myLocation.district.name}` : "Your location"}
          description={`${myLocation.district ? `${myLocation.district.name} district, ${myLocation.district.province}` : "Outside the mapped districts"} · ${myLocation.position[1].toFixed(5)}°N, ${myLocation.position[0].toFixed(5)}°E · accurate to about ${Math.round(myLocation.accuracyM)} m`}
        >
          <div className="mb-4 flex items-start gap-2">
            <p className="text-xs leading-5 text-slate-500">Your location is used only in this browser to centre the map and look up the figures below. It is not saved or sent anywhere.</p>
            <button onClick={clearMyLocation} aria-label="Clear my location" className="ml-auto shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><X size={15} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-orange-200/70 bg-orange-50 p-4 dark:border-teal-500/30 dark:bg-slate-900"><p className="text-xs font-medium text-orange-800 dark:text-teal-300">Median water table depth</p><p className="tabular mt-1 text-2xl font-semibold text-orange-900 dark:text-slate-100">{myLocation.district?.medianDepthFt != null ? depthFt(myLocation.district.medianDepthFt) : "—"}</p><p className="mt-1 text-[11px] text-orange-800/80 dark:text-slate-300">{myLocation.district ? `Across ${myLocation.district.mouzas?.toLocaleString()} mouzas in the district` : "No census data here"}</p></div>
            <div className="rounded-xl border border-violet-200/70 bg-violet-50 p-4 dark:border-purple-400/30 dark:bg-slate-900"><p className="text-xs font-medium text-violet-800 dark:text-purple-200">Brackish groundwater</p><p className="tabular mt-1 text-2xl font-semibold text-violet-900 dark:text-purple-100">{myLocation.district?.brackishPct != null ? `${myLocation.district.brackishPct}%` : "—"}</p><p className="mt-1 text-[11px] text-violet-800/80 dark:text-purple-200/80">of mouzas report salty underground water</p></div>
            <button type="button" disabled={!myLocation.nearestWell} onClick={() => { if (!myLocation.nearestWell) return; setSelectedWell(myLocation.nearestWell.well); mapRef.current?.flyTo({ center: [myLocation.nearestWell.well.lon, myLocation.nearestWell.well.lat], zoom: 12 }); }} className="rounded-xl border border-sky-200/70 bg-sky-50 p-4 text-left transition hover:bg-sky-100 disabled:hover:bg-sky-50 dark:border-sky-400/30 dark:bg-slate-900 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900"><p className="text-xs font-medium text-sky-800 dark:text-sky-200">Nearest observation well</p><p className="tabular mt-1 text-2xl font-semibold text-sky-900 dark:text-sky-100">{myLocation.nearestWell ? `${myLocation.nearestWell.km < 10 ? myLocation.nearestWell.km.toFixed(1) : Math.round(myLocation.nearestWell.km)} km` : "—"}</p><p className="mt-1 text-[11px] text-sky-800/80 dark:text-sky-200/80">{myLocation.nearestWell ? `${myLocation.nearestWell.well.id} · ${wellTrendText(myLocation.nearestWell.well.trend).toLowerCase()} · open history` : "No monitoring wells loaded"}</p></button>
          </div>
          <Link href="/forecast" className="mt-4 inline-block text-xs font-semibold text-teal-700 hover:underline">Open the depth forecast for your area →</Link>
        </Panel>
      )}

      {selectedWell && (
        <div id="well-details" className="scroll-mt-24">
          <Panel title={placeTitle(selectedPlace)} description={[placeSubtitle(selectedPlace), `Observation well ${selectedWell.id}`, `${selectedWell.n} October readings from ${selectedWell.firstYear} to ${selectedWell.lastYear}`].filter(Boolean).join(" · ")}>
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <MapPin size={16} className="text-sky-600" />
              <span className="tabular font-mono text-sm text-slate-800">{formatCoordinates(selectedWell.lat, selectedWell.lon)}</span>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(`${selectedWell.lat.toFixed(6)}, ${selectedWell.lon.toFixed(6)}`)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Copy</button>
              <a href={googleMapsUrl(selectedWell.lat, selectedWell.lon)} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Open in Google Maps ↗</a>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${selectedWell.trend != null && selectedWell.trend >= 0.05 ? "bg-red-50 text-red-700" : selectedWell.trend != null && selectedWell.trend <= -0.05 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{wellTrendText(selectedWell.trend)}</span>
              <span className="text-xs text-slate-500">Depth to water went from {formatDepthMetersAndFeet(selectedWell.firstDepth, 2)} to {formatDepthMetersAndFeet(selectedWell.lastDepth, 2)}</span>
              <button onClick={() => setSelectedWell(null)} aria-label="Close well history" className="ml-auto rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><X size={15} /></button>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selectedWell.series.map(([year, depth]) => ({ year, depth }))} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="wellFill" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                  <YAxis reversed width={78} tickFormatter={(v) => formatAxisDepthMetersAndFeet(Number(v))} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${formatDepthMetersAndFeet(Number(value), 2)} below ground`, "Depth to water"]} labelFormatter={(label) => `October ${label}`} />
                  <Area type="linear" dataKey="depth" stroke="#0284c7" strokeWidth={2.5} fill="url(#wellFill)" dot={{ r: 2.5, fill: "#0284c7" }} activeDot={{ r: 5, fill: "#0284c7", stroke: "white", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Depth is measured downward from the ground, so a line moving down the chart means the water table is getting deeper.</p>
          </Panel>
        </div>
      )}

      {selection && (
        <Panel
          title={`${selection.name}${selection.city !== selection.name ? ` · ${selection.city}` : ""}`}
          description={`${selectedReports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)} reports summarized at this zoom level`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${riskColor(selection.risk)}`}>
                {riskText(selection.risk)} area average
              </span>
              {selectedAvgDepth && (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  Avg depth: {formatDepthMetersAndFeet(selectedAvgDepth)}
                </span>
              )}
              <span className="text-xs text-slate-500">
                {selectedReports.filter((report) => riskScore(report) >= 1.5).length} critical ·{" "}
                {selectedReports.filter((report) => riskScore(report) >= 0.75 && riskScore(report) < 1.5).length}{" "}
                moderate · {selectedReports.filter((report) => riskScore(report) < 0.75).length} normal
              </span>
            </div>
            <Link href="/forecast" className="text-xs font-semibold text-teal-700 hover:underline">
              Open Universal Area Forecast →
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selectedReports.map((report) => {
              const score = riskScore(report);
              return (
                <div key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {report.aggregateCount
                        ? `${report.sourceType} · ${report.sampleDate?.slice(0, 7) ?? "All dates"}`
                        : `${reportCodes.get(report.id) ?? report.id} · ${report.sourceLabel || report.address}`}
                    </p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${riskColor(score)}`}>
                      {riskText(score)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {report.sourceType || "Source type not provided"}
                    {report.depth ? ` · ${formatDepthMetersAndFeet(report.depth)} deep` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {report.aggregateCount
                      ? `${report.aggregateCount} reports received · average depth ${report.depth ? formatDepthMetersAndFeet(report.depth) : "—"}`
                      : `${report.sampleDate || "No test date"} · ${report.status}`}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

          {censusDistricts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={tr(lang, "Deepest water tables", "سب سے گہری پانی کی سطح")} description={tr(lang, `Click any district to fly to it on the map · ${censusRankings.mouzas.toLocaleString()} mouzas surveyed`, `نقشے پر دیکھنے کے لیے کسی بھی ضلع پر کلک کریں · ${censusRankings.mouzas.toLocaleString()} مواضعات کا سروے`)}>
            <ol className="space-y-2">
              {censusRankings.deepest.map((district, index) => (
                <li key={district.name}>
                  <button
                    type="button"
                    onClick={() => {
                      const feat = censusFeaturesRef.current.find((f) => f.properties.name === district.name);
                      const ring = feat?.geometry.type === "Polygon" ? feat.geometry.coordinates[0] : feat?.geometry.type === "MultiPolygon" ? feat.geometry.coordinates[0]?.[0] : undefined;
                      if (ring?.length) {
                        const center = ring.reduce<[number, number]>(([ax, ay], [x, y]) => [ax + x / ring.length, ay + y / ring.length], [0, 0]);
                        userMovedMapRef.current = true;
                        setHoverDistrict(district);
                        mapRef.current?.flyTo({ center, zoom: 8.5 });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-left transition hover:border-red-300 hover:bg-red-50/40 dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xs font-bold text-red-700">{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{district.name}</span><span className="block text-xs text-slate-500">{district.province} · {district.mouzas} {tr(lang, "mouzas", "مواضعات")}</span></span>
                    <span className="tabular text-sm font-semibold text-red-700 dark:text-red-400">{depthFt(district.medianDepthFt)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title={tr(lang, "Most brackish groundwater", "سب سے زیادہ کھارا زیرِ زمین پانی")} description={tr(lang, "Click any district to fly to it on the map", "نقشے پر دیکھنے کے لیے کسی بھی ضلع پر کلک کریں")}>
            <ol className="space-y-2">
              {censusRankings.brackish.map((district, index) => (
                <li key={district.name}>
                  <button
                    type="button"
                    onClick={() => {
                      const feat = censusFeaturesRef.current.find((f) => f.properties.name === district.name);
                      const ring = feat?.geometry.type === "Polygon" ? feat.geometry.coordinates[0] : feat?.geometry.type === "MultiPolygon" ? feat.geometry.coordinates[0]?.[0] : undefined;
                      if (ring?.length) {
                        const center = ring.reduce<[number, number]>(([ax, ay], [x, y]) => [ax + x / ring.length, ay + y / ring.length], [0, 0]);
                        userMovedMapRef.current = true;
                        setHoverDistrict(district);
                        setShadeMode("brackish");
                        mapRef.current?.flyTo({ center, zoom: 8.5 });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-left transition hover:border-violet-300 hover:bg-violet-50/40 dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-violet-700">{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{district.name}</span><span className="block text-xs text-slate-500">{district.province} · {district.mouzas} mouzas</span></span>
                    <span className="tabular text-sm font-semibold text-violet-700 dark:text-purple-300">{district.brackishPct}%</span>
                  </button>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      )}

      {!selection && visibleReports.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-xs text-teal-800">
          <Waves size={16} />
          <span>
            Hover over any district, well or dot for live stats, or click a dot or well to expand its details.
          </span>
          <Activity size={16} className="ml-auto shrink-0" />
        </div>
      )}
    </>
  );
}
