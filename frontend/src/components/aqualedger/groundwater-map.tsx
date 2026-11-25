"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Layers3, LocateFixed, MapPin, Minus, Plus, User, Waves } from "lucide-react";
import { PageIntro, Panel, useAquaRole } from "@/components/aqualedger/app-shell";
import {
  readCommunityWaterReports,
  readMyCommunityWaterReports,
  readPublicAreaSourceTrends,
  subscribeToCommunityWaterReports,
  type CommunityWaterReport,
} from "@/lib/community-water-reports";
import { screenWaterReport } from "@/lib/water-risk-screening";
import { buildReportCodes } from "@/lib/report-display-codes";
import { buildPakistanRegionsGeoJson } from "@/lib/pakistan-regions-geojson";

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
  const center = city?.position ?? ([69.3451, 30.3753] as Position);
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
            depth: report.depth ? `${report.depth} m` : "—",
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
        ? `${(depthValues.reduce((a, b) => a + b, 0) / depthValues.length).toFixed(1)} m`
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

export function GroundwaterMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [reports, setReports] = useState<CommunityWaterReport[]>([]);
  const [myReports, setMyReports] = useState<CommunityWaterReport[]>([]);
  const [mySourcesOnly, setMySourcesOnly] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [zonesOn, setZonesOn] = useState(true);
  const [heatmapOn, setHeatmapOn] = useState(true);
  const { isAdmin, isSignedIn, authReady } = useAquaRole();
  const [loadError, setLoadError] = useState("");
  const [mapError, setMapError] = useState("");
  const [selection, setSelection] = useState<AreaSelection | null>(null);

  const zonesOnRef = useRef(zonesOn);
  const heatmapOnRef = useRef(heatmapOn);
  useEffect(() => {
    zonesOnRef.current = zonesOn;
  }, [zonesOn]);
  useEffect(() => {
    heatmapOnRef.current = heatmapOn;
  }, [heatmapOn]);

  useEffect(() => {
    if (!authReady) return;
    const refresh = () => {
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
          );
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
        );

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

  const activeBaseReports = useMemo(
    () => (mySourcesOnly && isSignedIn && !isAdmin ? myReports : reports),
    [mySourcesOnly, isSignedIn, isAdmin, myReports, reports]
  );

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

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    let disposed = false;
    let map: import("maplibre-gl").Map | null = null;
    void import("maplibre-gl")
      .then((maplibregl) => {
        if (disposed || !mapContainer.current) return;
        maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
        map = new maplibregl.Map({
          container: mapContainer.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [69.3451, 30.3753],
          zoom: 4.8,
          minZoom: 3,
          maxZoom: 16,
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
        });

        map.on("load", () => {
          if (!map) return;

          // 1. Pakistan Region Choropleth Source & Layers
          map.addSource("pakistan-regions", {
            type: "geojson",
            data: regionsGeoJsonRef.current as never,
          });
          map.addLayer({
            id: "region-fills",
            type: "fill",
            source: "pakistan-regions",
            layout: { visibility: zonesOnRef.current ? "visible" : "none" },
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
            layout: { visibility: zonesOnRef.current ? "visible" : "none" },
            paint: {
              "line-color": "#ffffff",
              "line-width": 1.6,
              "line-opacity": 0.9,
            },
          });

          // 2. Heatmap + Dots Source & Layers
          map.addSource("water-reports", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            promoteId: "key",
          });
          map.addLayer({
            id: "risk-heat",
            type: "heatmap",
            source: "water-reports",
            maxzoom: 10.5,
            layout: { visibility: heatmapOnRef.current ? "visible" : "none" },
            paint: {
              "heatmap-weight": ["interpolate", ["linear"], ["get", "score"], 0, 0.1, 0.5, 0.25, 1, 0.6, 2, 1],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 9, 2.2],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 24, 10, 48],
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.82, 10.5, 0],
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(20,184,166,0)",
                0.2,
                "#5eead4",
                0.45,
                "#facc15",
                0.7,
                "#fb923c",
                1,
                "#dc2626",
              ],
            },
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
                ["interpolate", ["linear"], ["get", "count"], 1, 7, 20, 18],
                10,
                ["interpolate", ["linear"], ["get", "count"], 1, 6, 20, 14],
              ],
              "circle-color": ["step", ["get", "score"], "#0d9488", 0.75, "#f59e0b", 1.5, "#dc2626"],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2.2,
              "circle-opacity": 0.95,
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

          const setMapData = () => {
            const source = map?.getSource("water-reports") as
              | import("maplibre-gl").GeoJSONSource
              | undefined;
            source?.setData(
              makeFeatures(
                visibleReportsRef.current,
                map?.getZoom() ?? 4.8,
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
            const depthText = props.avgDepthM != null && props.avgDepthM !== "null" ? `${props.avgDepthM} m` : "—";
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
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const reportSource = map.getSource("water-reports") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    reportSource?.setData(makeFeatures(visibleReports, map.getZoom(), reportCodes) as never);

    const regionSource = map.getSource("pakistan-regions") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    regionSource?.setData(regionsGeoJson as never);
  }, [visibleReports, reportCodes, regionsGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("risk-heat")) return;
    map.setLayoutProperty("risk-heat", "visibility", heatmapOn ? "visible" : "none");
  }, [heatmapOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("region-fills")) return;
    const vis = zonesOn ? "visible" : "none";
    map.setLayoutProperty("region-fills", "visibility", vis);
    map.setLayoutProperty("region-borders", "visibility", vis);
  }, [zonesOn]);

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

  return (
    <>
      <PageIntro
        title="Groundwater Trend & Risk Map"
        description="Shaded Pakistan regions show Critical, Moderate, Normal, or No Data status. Dots mark exact locations where reports were received, paired with a live heatmap."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Reports received</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {visibleReports.reduce((sum, report) => sum + (report.aggregateCount ?? 1), 0)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {mySourcesOnly ? "Your personal sources" : "Shown as dots on map"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Regions with data</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {regionsWithData} / {regionsGeoJson.features.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">Shaded across Pakistan</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Critical points</p>
          <p className="mt-2 text-2xl font-bold text-red-600">
            {visibleReports.filter((report) => riskScore(report) >= 1.5).length}
          </p>
          <p className="mt-1 text-xs text-slate-400">High-concern screening flags</p>
        </div>
      </div>

      <Panel
        title="Pakistan Groundwater Heatmap & Regional Status"
        description="Highlighted regions show groundwater condition; dots mark exact areas where data has been received."
      >
        {/* Quick City Jump + Layer Toggles */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                mapRef.current?.flyTo({ center: [69.3451, 30.3753], zoom: 4.8 });
                setSelection(null);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              All Pakistan
            </button>
            {cityLocations
              .filter((c) => c.quick)
              .map((city) => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => {
                    mapRef.current?.flyTo({ center: city.position, zoom: 9.2 });
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-800"
                >
                  {city.name}
                </button>
              ))}
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
              onClick={() => setZonesOn((current) => !current)}
              aria-pressed={zonesOn}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                zonesOn
                  ? "border-teal-200 bg-teal-50 text-teal-800"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              <Layers3 size={15} />
              {zonesOn ? "Region shading on" : "Region shading off"}
            </button>
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
              {heatmapOn ? "Heatmap on" : "Heatmap off"}
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
              onClick={() => {
                mapRef.current?.flyTo({ center: [69.3451, 30.3753], zoom: 4.8 });
                setSelection(null);
              }}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            >
              <LocateFixed size={17} />
            </button>
          </div>
        </div>

        {/* Risk Filter Pills */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              { id: "all", label: "All levels", dot: "bg-slate-400", style: "bg-slate-100 text-slate-700" },
              { id: "high", label: "Critical", dot: "bg-red-500", style: "bg-red-50 text-red-700" },
              { id: "moderate", label: "Moderate", dot: "bg-amber-500", style: "bg-amber-50 text-amber-800" },
              { id: "normal", label: "Normal", dot: "bg-teal-600", style: "bg-teal-50 text-teal-700" },
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
        </div>

        {loadError ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            {loadError}
          </p>
        ) : (
          <div className="relative">
            <div
              ref={mapContainer}
              className="h-[68vh] min-h-[440px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              aria-label="Interactive groundwater risk and trend map of Pakistan"
            />

            {/* Floating Legend Card (Bottom-Left, like reference map) */}
            <div className="pointer-events-auto absolute bottom-3 left-3 z-10 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-md backdrop-blur">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Region &amp; Trend Status
              </p>
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-red-600/80" />
                  <span>Critical</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-amber-500/80" />
                  <span>Moderate</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-teal-600/80" />
                  <span>Normal</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-slate-400/50" />
                  <span>No data received</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full border border-white bg-teal-600 shadow-sm" />
                  <span>Dots = received reports</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {mapError && (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {mapError}
          </p>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          Shaded regions summarize groundwater status across Pakistan; dots show exact areas where community reports were received. Consented GPS coordinates are used when available.
        </p>
      </Panel>

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
                  Avg depth: {selectedAvgDepth} m
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
                    {report.depth ? ` · ${report.depth} m deep` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {report.aggregateCount
                      ? `${report.aggregateCount} reports received · average depth ${report.depth || "—"} m`
                      : `${report.sampleDate || "No test date"} · ${report.status}`}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {!selection && visibleReports.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-xs text-teal-800">
          <Waves size={16} />
          <span>
            Hover over any shaded region or dot for live stats, or click a dot to expand its report details.
          </span>
          <Activity size={16} className="ml-auto shrink-0" />
        </div>
      )}
    </>
  );
}
