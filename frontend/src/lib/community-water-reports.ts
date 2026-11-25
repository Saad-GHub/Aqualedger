import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeAreaName } from "@/lib/depth-analytics";

export type CommunityWaterReport = { id: string; reportCode?: string; aggregateCount?: number; labMeasurementCount?: number; awaitingReviewCount?: number; reporterName?: string; address: string; areaName?: string; sourceType?: string; depth?: string; sampleDate?: string; concern?: string; status: string; measurements: Record<string, string>; areaKey?: string; riskLevel?: string; verificationState?: string; latitude?: number | null; longitude?: number | null; locationAccuracyM?: number | null; locationCapturedAt?: string | null; locationConsent?: boolean; sourceId?: string; sourceCode?: string; sourceLabel?: string; createdBy?: string };
export type TrackedWaterSource = { id: string; code: string; label: string; areaName: string; address: string; sourceType: string };
export type CommunityWaterAreaRisk = { areaKey: string; reportCount: number; normalCount: number; moderateCount: number; highCount: number; incompleteCount: number; assessedCount: number; weightedScore: number | null; riskLevel: string };export type PublicAreaSourceTrend = { areaKey: string; cityName: string; sourceType: string; sampleMonth: string | null; sampleDay: string | null; reportCount: number; averageDepthM: number | null; normalCount: number; moderateCount: number; highCount: number; incompleteCount: number; weightedRiskScore: number | null; labMeasurementCount: number; awaitingReviewCount: number };
export type NewCommunityWaterReport = Omit<CommunityWaterReport, "id" | "status">;
const UPDATED_EVENT = "aqualedger-community-reports-updated";
let client: SupabaseClient | null = null;
export function getSupabaseBrowserClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase URL or publishable key is missing from .env.local.");
  client = createClient(url, key);
  return client;
}

const columns: Record<string, string> = { "pH": "ph", TDS: "tds_mg_l", Turbidity: "turbidity_ntu", Conductivity: "conductivity_us_cm", Hardness: "hardness_mg_l", Chloride: "chloride_mg_l", Nitrate: "nitrate_mg_l", Fluoride: "fluoride_mg_l", Arsenic: "arsenic_ug_l", "E. coli": "ecoli_result" };
const SUPABASE_PAGE_SIZE = 1000;
const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };
let reportsCache: CacheEntry<CommunityWaterReport[]> | null = null;
let reportsInFlight: Promise<CommunityWaterReport[]> | null = null;
let areaRisksCache: CacheEntry<CommunityWaterAreaRisk[]> | null = null;
let areaRisksInFlight: Promise<CommunityWaterAreaRisk[]> | null = null;
let publicTrendsCache: CacheEntry<PublicAreaSourceTrend[]> | null = null;
let publicTrendsInFlight: Promise<PublicAreaSourceTrend[]> | null = null;

function invalidateReadCaches() {
  reportsCache = null;
  reportsInFlight = null;
  areaRisksCache = null;
  areaRisksInFlight = null;
  publicTrendsCache = null;
  publicTrendsInFlight = null;
}

type PageResult<T> = { data: T[] | null; count?: number | null; error: { code?: string; message: string } | null };

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>
): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const first = await fetchPage(0, SUPABASE_PAGE_SIZE - 1, true);
  if (first.error) return { data: [], error: first.error };
  const firstBatch = first.data ?? [];
  if (firstBatch.length < SUPABASE_PAGE_SIZE) {
    return { data: firstBatch, error: null };
  }

  const totalCount = typeof first.count === "number" ? first.count : null;
  if (totalCount !== null && totalCount > SUPABASE_PAGE_SIZE) {
    const remainingStarts: number[] = [];
    for (let from = SUPABASE_PAGE_SIZE; from < totalCount; from += SUPABASE_PAGE_SIZE) {
      remainingStarts.push(from);
    }
    const restResults = await Promise.all(
      remainingStarts.map((from) => fetchPage(from, from + SUPABASE_PAGE_SIZE - 1, false))
    );
    const all = [...firstBatch];
    for (const res of restResults) {
      if (res.error) return { data: all, error: res.error };
      if (res.data) all.push(...res.data);
    }
    return { data: all, error: null };
  }

  const all = [...firstBatch];
  for (let from = SUPABASE_PAGE_SIZE; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1, false);
    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

function mapReportRow(row: Record<string, unknown>): CommunityWaterReport {
  const rawArea = (row.area_name as string | null) ?? undefined;
  const rawKey = (row.area_key as string | null) ?? undefined;
  const rawAddress = String(row.street_address || row.address || "");
  const normalizedArea = normalizeAreaName(rawKey || rawArea, rawAddress);
  return {
    id: String(row.id ?? ""),
    reportCode: (row.report_code as string | null) ?? undefined,
    reporterName: (row.reporter_name as string | null) ?? undefined,
    address: rawAddress,
    areaName: rawArea ? normalizedArea : undefined,
    sourceType: (row.source_type as string | null) ?? undefined,
    depth: row.source_depth_m == null ? "" : String(row.source_depth_m),
    sampleDate: (row.sample_date as string | null) ?? undefined,
    concern: (row.main_concern as string | null) ?? undefined,
    status: String(row.review_status ?? "received"),
    areaKey: normalizedArea,
    riskLevel: (row.risk_level as string | null) ?? undefined,
    verificationState: (row.verification_state as string | null) ?? undefined,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    locationAccuracyM: row.location_accuracy_m == null ? null : Number(row.location_accuracy_m),
    locationCapturedAt: (row.location_captured_at as string | null) ?? null,
    locationConsent: Boolean(row.location_consent ?? false),
    sourceId: (row.source_id as string | null) ?? undefined,
    sourceCode: (row.source_code as string | null) ?? undefined,
    sourceLabel: (row.source_label as string | null) ?? undefined,
    createdBy: (row.created_by as string | null) ?? undefined,
    measurements: Object.fromEntries(Object.entries(columns).map(([name, field]) => [name, String(row[field] ?? "")])),
  };
}

export async function readCommunityWaterReports(): Promise<CommunityWaterReport[]> {
  if (reportsCache && reportsCache.expiresAt > Date.now()) {
    return reportsCache.value;
  }
  if (reportsInFlight) return reportsInFlight;

  reportsInFlight = (async () => {
    const supabase = getSupabaseBrowserClient();
    let { data, error } = await fetchAllPages((from, to, withCount) =>
      supabase
        .from("water_report_risk_analysis")
        .select("*", withCount ? { count: "exact" } : undefined)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    );
    if (error && ["PGRST205", "42P01"].includes(error.code ?? "")) {
      // Keep existing reports visible until the user runs the optional SQL views for database screening.
      ({ data, error } = await fetchAllPages((from, to, withCount) =>
        supabase
          .from("water_reports")
          .select("*", withCount ? { count: "exact" } : undefined)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
      ));
    }
    if (error) throw error;
    const seen = new Set<string>();
    const mapped = data
      .filter((row) => {
        const id = String(row.id ?? "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((row) => mapReportRow(row as Record<string, unknown>));
    reportsCache = { value: mapped, expiresAt: Date.now() + CACHE_TTL_MS };
    return mapped;
  })().finally(() => {
    reportsInFlight = null;
  });

  return reportsInFlight;
}

export async function readMyCommunityWaterReports(): Promise<CommunityWaterReport[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Sign in to view your reports.");
  const userId = authData.user.id;

  let { data, error } = await fetchAllPages((from, to, withCount) =>
    supabase
      .from("water_report_risk_analysis")
      .select("*", withCount ? { count: "exact" } : undefined)
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (error && ["PGRST205", "42P01"].includes(error.code ?? "")) {
    ({ data, error } = await fetchAllPages((from, to, withCount) =>
      supabase
        .from("water_reports")
        .select("*", withCount ? { count: "exact" } : undefined)
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ));
  }
  if (error) throw error;
  const seen = new Set<string>();
  return data
    .filter((row) => {
      const id = String(row.id ?? "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((row) => mapReportRow(row as Record<string, unknown>));
}

export async function readMyTrackedWaterSources(): Promise<TrackedWaterSource[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user?.email_confirmed_at) return [];
  const { data, error } = await fetchAllPages((from, to, withCount) =>
    supabase
      .from("water_reports")
      .select("source_id, source_code, source_label, area_name, street_address, address, source_type, created_at", withCount ? { count: "exact" } : undefined)
      .eq("created_by", authData.user!.id)
      .not("source_id", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (error) throw error;
  const sources = new Map<string, TrackedWaterSource>();
  for (const row of data) if (row.source_id && !sources.has(row.source_id)) sources.set(row.source_id, { id: row.source_id, code: row.source_code ?? `SRC-${String(row.source_id).slice(0, 8).toUpperCase()}`, label: row.source_label ?? "Tracked source", areaName: normalizeAreaName(row.area_name, row.street_address ?? row.address), address: row.street_address ?? row.address ?? "", sourceType: row.source_type ?? "Tube well" });
  return [...sources.values()];
}

export async function readCommunityWaterAreaRisks(): Promise<CommunityWaterAreaRisk[]> {
  if (areaRisksCache && areaRisksCache.expiresAt > Date.now()) {
    return areaRisksCache.value;
  }
  if (areaRisksInFlight) return areaRisksInFlight;

  areaRisksInFlight = (async () => {
    const { data, error } = await fetchAllPages((from, to, withCount) =>
      getSupabaseBrowserClient()
        .from("water_area_risk_summary")
        .select("*", withCount ? { count: "exact" } : undefined)
        .order("area_key")
        .range(from, to)
    );
    if (error) throw error;
    const mapped = data.map((row) => ({ areaKey: row.area_key, reportCount: Number(row.report_count), normalCount: Number(row.normal_count), moderateCount: Number(row.moderate_count), highCount: Number(row.high_count), incompleteCount: Number(row.incomplete_count), assessedCount: Number(row.assessed_count), weightedScore: row.weighted_score === null ? null : Number(row.weighted_score), riskLevel: row.area_risk_level }));
    areaRisksCache = { value: mapped, expiresAt: Date.now() + CACHE_TTL_MS };
    return mapped;
  })().finally(() => {
    areaRisksInFlight = null;
  });

  return areaRisksInFlight;
}

// The public trends view aggregates every report with many regexes, so one
// query for the whole view exceeds Supabase's 3s anon statement timeout.
// A filter on area_key lets Postgres aggregate only that slice (~0.2-1.3s each),
// so the view is read in A-Z chunks plus one chunk for everything else.
const PUBLIC_TREND_CHUNK_CONCURRENCY = 6;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Supabase view row, same as other .select("*") reads
type PublicTrendRow = Record<string, any>;
type ChunkResult = { data: PublicTrendRow[]; error: { code?: string; message: string } | null };

async function fetchPublicTrendRowsInChunks(): Promise<ChunkResult> {
  const supabase = getSupabaseBrowserClient();
  const chunks: Array<() => PromiseLike<PageResult<PublicTrendRow>>> = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => () =>
      supabase.from("water_public_area_source_trends").select("*").like("area_key", `${letter}%`)
    ),
    () => supabase.from("water_public_area_source_trends").select("*").or("area_key.is.null,area_key.not.match.^[A-Z]"),
  ];

  const results: PublicTrendRow[][] = new Array(chunks.length);
  let firstError: ChunkResult["error"] = null;
  let next = 0;
  const worker = async () => {
    while (next < chunks.length && !firstError) {
      const index = next++;
      let res = await chunks[index]();
      if (res.error) res = await chunks[index](); // one retry for a transient timeout
      if (res.error) {
        firstError = res.error;
        return;
      }
      results[index] = res.data ?? [];
    }
  };
  await Promise.all(Array.from({ length: PUBLIC_TREND_CHUNK_CONCURRENCY }, worker));
  if (firstError) return { data: [], error: firstError };

  const text = (v: unknown) => (v == null ? "" : String(v));
  const rows = results.flat().sort(
    (a, b) =>
      text(a.area_key).localeCompare(text(b.area_key)) ||
      text(a.source_type).localeCompare(text(b.source_type)) ||
      text(a.sample_month).localeCompare(text(b.sample_month))
  );
  return { data: rows, error: null };
}

export async function readPublicAreaSourceTrends(): Promise<PublicAreaSourceTrend[]> {
  if (publicTrendsCache && publicTrendsCache.expiresAt > Date.now()) {
    return publicTrendsCache.value;
  }
  if (publicTrendsInFlight) return publicTrendsInFlight;

  publicTrendsInFlight = (async () => {
    const { data, error } = await fetchPublicTrendRowsInChunks();
    if (!error) {
      const merged = new Map<string, PublicAreaSourceTrend & { depthSum: number; depthCount: number }>();
      for (const row of data) {
        const areaKey = normalizeAreaName(row.area_key, row.city_name);
        const sourceType = row.source_type || "Unspecified source";
        const sampleMonth = row.sample_month ?? null;
        const sampleDay = row.sample_day ?? null;
        const key = `${areaKey}|${sourceType}|${sampleMonth ?? ""}|${sampleDay ?? ""}`;
        const existing = merged.get(key) ?? {
          areaKey,
          cityName: areaKey.split(",")[0]?.trim() || row.city_name,
          sourceType,
          sampleMonth,
          sampleDay,
          reportCount: 0,
          averageDepthM: null,
          normalCount: 0,
          moderateCount: 0,
          highCount: 0,
          incompleteCount: 0,
          weightedRiskScore: null,
          labMeasurementCount: 0,
          awaitingReviewCount: 0,
          depthSum: 0,
          depthCount: 0,
        };
        const count = Number(row.report_count);
        existing.reportCount += count;
        if (row.average_depth_m !== null) {
          existing.depthSum += Number(row.average_depth_m) * count;
          existing.depthCount += count;
        }
        existing.normalCount += Number(row.normal_count);
        existing.moderateCount += Number(row.moderate_count);
        existing.highCount += Number(row.high_count);
        existing.incompleteCount += Number(row.incomplete_count);
        existing.labMeasurementCount += Number(row.lab_measurement_count ?? 0);
        existing.awaitingReviewCount += Number(row.awaiting_review_count ?? 0);
        merged.set(key, existing);
      }
      const mapped = [...merged.values()].map((item) => {
        const assessed = item.normalCount + item.moderateCount + item.highCount;
        return {
          areaKey: item.areaKey,
          cityName: item.cityName,
          sourceType: item.sourceType,
          sampleMonth: item.sampleMonth,
          sampleDay: item.sampleDay,
          reportCount: item.reportCount,
          averageDepthM: item.depthCount ? Number((item.depthSum / item.depthCount).toFixed(2)) : null,
          normalCount: item.normalCount,
          moderateCount: item.moderateCount,
          highCount: item.highCount,
          incompleteCount: item.incompleteCount,
          weightedRiskScore: assessed ? Number(((item.normalCount * 0.5 + item.moderateCount + item.highCount * 2) / assessed).toFixed(2)) : null,
          labMeasurementCount: item.labMeasurementCount,
          awaitingReviewCount: item.awaitingReviewCount,
        };
      });
      publicTrendsCache = { value: mapped, expiresAt: Date.now() + CACHE_TTL_MS };
      return mapped;
    }

    // Fallback: if the SQL view is not created yet, aggregate from water_reports directly for authenticated/admin sessions
    const reports = await readCommunityWaterReports();
    const groups = new Map<string, { areaKey: string; cityName: string; sourceType: string; sampleMonth: string | null; sampleDay: string | null; reportCount: number; depthSum: number; depthCount: number; normalCount: number; moderateCount: number; highCount: number; incompleteCount: number; labMeasurementCount: number; awaitingReviewCount: number }>();
    for (const r of reports) {
      const areaKey = normalizeAreaName(r.areaName || r.areaKey, r.address);
      const cityName = areaKey.split(",")[0]?.trim() || "Pakistan";
      const sourceType = r.sourceType?.trim() || "Unspecified source";
      const sampleDay = r.sampleDate && /^\d{4}-\d{2}-\d{2}$/.test(r.sampleDate) ? r.sampleDate : null;
      const sampleMonth = sampleDay ? `${sampleDay.slice(0, 7)}-01` : null;
      const key = `${areaKey}|${sourceType}|${sampleDay ?? ""}`;
      const g = groups.get(key) ?? { areaKey, cityName, sourceType, sampleMonth, sampleDay, reportCount: 0, depthSum: 0, depthCount: 0, normalCount: 0, moderateCount: 0, highCount: 0, incompleteCount: 0, labMeasurementCount: 0, awaitingReviewCount: 0 };
      g.reportCount += 1;
      const depth = r.depth ? Number.parseFloat(r.depth) : Number.NaN;
      if (Number.isFinite(depth)) { g.depthSum += depth; g.depthCount += 1; }
      if (r.riskLevel === "High concern") g.highCount += 1;
      else if (r.riskLevel === "Moderate concern") g.moderateCount += 1;
      else if (r.riskLevel === "Normal") g.normalCount += 1;
      else g.incompleteCount += 1;
      g.labMeasurementCount += Object.values(r.measurements).filter((v) => v.trim() !== "").length;
      if (r.status === "received" || r.status === "under_review") g.awaitingReviewCount += 1;
      groups.set(key, g);
    }
    const fallback = [...groups.values()].map((g) => {
      const assessed = g.normalCount + g.moderateCount + g.highCount;
      return {
        areaKey: g.areaKey,
        cityName: g.cityName,
        sourceType: g.sourceType,
        sampleMonth: g.sampleMonth,
        sampleDay: g.sampleDay,
        reportCount: g.reportCount,
        averageDepthM: g.depthCount ? Number((g.depthSum / g.depthCount).toFixed(2)) : null,
        normalCount: g.normalCount,
        moderateCount: g.moderateCount,
        highCount: g.highCount,
        incompleteCount: g.incompleteCount,
        weightedRiskScore: assessed ? Number(((g.normalCount * 0.5 + g.moderateCount + g.highCount * 2) / assessed).toFixed(2)) : null,
        labMeasurementCount: g.labMeasurementCount,
        awaitingReviewCount: g.awaitingReviewCount,
      };
    });
    publicTrendsCache = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
    return fallback;
  })().finally(() => {
    publicTrendsInFlight = null;
  });

  return publicTrendsInFlight;
}
export async function submitCommunityWaterReport(report: NewCommunityWaterReport) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user?.email_confirmed_at) throw new Error("Verify your email with the one-time code before submitting.");
  const id = crypto.randomUUID();
  const streetAddress = report.address.trim();
  const areaName = normalizeAreaName(report.areaName, streetAddress);
  const sourceId = report.sourceId ?? crypto.randomUUID();
  const sourceCode = report.sourceCode ?? "SRC-PENDING";
  const sourceLabel = report.sourceLabel?.trim() ?? "";
  if (!sourceLabel) throw new Error("Enter a name for this water source so future monthly readings can be linked to it.");
  const row: Record<string, string | number | boolean | null> = { id, created_by: authData.user.id, source_id: sourceId, source_code: sourceCode, source_label: sourceLabel, reporter_name: report.reporterName ?? "", address: [streetAddress, areaName].filter(Boolean).join(", "), street_address: streetAddress, area_name: areaName, source_type: report.sourceType ?? "", source_depth_m: Number(report.depth), sample_date: report.sampleDate ?? "", main_concern: report.concern ?? "", review_status: "under_review", location_consent: Boolean(report.locationConsent), latitude: report.latitude ?? null, longitude: report.longitude ?? null, location_accuracy_m: report.locationAccuracyM ?? null, location_captured_at: report.locationCapturedAt ?? null };
  for (const [name, field] of Object.entries(columns)) {
    const raw = (report.measurements[name] ?? "").trim();
    if (!raw) {
      row[field] = null;
    } else if (name === "E. coli") {
      row[field] = raw;
    } else {
      const parsed = Number(raw);
      row[field] = Number.isFinite(parsed) ? parsed : null;
    }
  }
  const { data: inserted, error } = await supabase
    .from("water_reports")
    .insert(row)
    .select("id, source_id, source_code, source_label")
    .single();
  if (error) throw error;
  invalidateReadCaches();
  return {
    id: inserted?.id ?? id,
    sourceId: inserted?.source_id ?? sourceId,
    sourceCode: inserted?.source_code ?? sourceCode,
    sourceLabel: inserted?.source_label ?? sourceLabel,
  };
}
export type ReportReviewStatus = "received" | "under_review" | "verified" | "rejected";
export async function updateCommunityReportStatus(id: string, status: ReportReviewStatus) {
  const { error } = await getSupabaseBrowserClient().from("water_reports").update({ review_status: status }).eq("id", id);
  if (error) throw error;
  notifyCommunityWaterReportsUpdated();
}
export function notifyCommunityWaterReportsUpdated() {
  invalidateReadCaches();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(UPDATED_EVENT));
}
export function subscribeToCommunityWaterReports(callback: () => void) { if (typeof window === "undefined") return () => {}; window.addEventListener(UPDATED_EVENT, callback); return () => window.removeEventListener(UPDATED_EVENT, callback); }
