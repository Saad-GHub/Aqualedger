import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>
): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

export async function readCommunityWaterReports(): Promise<CommunityWaterReport[]> {
  const supabase = getSupabaseBrowserClient();
  let { data, error } = await fetchAllPages((from, to) =>
    supabase.from("water_report_risk_analysis").select("*").order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to)
  );
  if (error && ["PGRST205", "42P01"].includes(error.code ?? "")) {
    // Keep existing reports visible until the user runs the optional SQL views for database screening.
    ({ data, error } = await fetchAllPages((from, to) =>
      supabase.from("water_reports").select("*").order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to)
    ));
  }
  if (error) throw error;
  const seen = new Set<string>();
  const uniqueRows = data.filter((row) => {
    const id = String(row.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return uniqueRows.map((row) => ({ id: row.id, reportCode: row.report_code ?? undefined, reporterName: row.reporter_name, address: row.street_address || row.address, areaName: row.area_name ?? undefined, sourceType: row.source_type, depth: row.source_depth_m == null ? "" : String(row.source_depth_m), sampleDate: row.sample_date ?? undefined, concern: row.main_concern, status: row.review_status, areaKey: row.area_key, riskLevel: row.risk_level, verificationState: row.verification_state, latitude: row.latitude == null ? null : Number(row.latitude), longitude: row.longitude == null ? null : Number(row.longitude), locationAccuracyM: row.location_accuracy_m == null ? null : Number(row.location_accuracy_m), locationCapturedAt: row.location_captured_at ?? null, locationConsent: row.location_consent ?? false, sourceId: row.source_id ?? undefined, sourceCode: row.source_code ?? undefined, sourceLabel: row.source_label ?? undefined, createdBy: row.created_by ?? undefined, measurements: Object.fromEntries(Object.entries(columns).map(([name, field]) => [name, String(row[field] ?? "")])) }));
}
export async function readMyCommunityWaterReports(): Promise<CommunityWaterReport[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Sign in to view your reports.");
  const reports = await readCommunityWaterReports();
  return reports.filter((report) => report.createdBy === authData.user.id);
}
export async function readMyTrackedWaterSources(): Promise<TrackedWaterSource[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user?.email_confirmed_at) return [];
  const { data, error } = await fetchAllPages((from, to) =>
    supabase.from("water_reports").select("source_id, source_code, source_label, area_name, street_address, address, source_type, created_at").eq("created_by", authData.user!.id).not("source_id", "is", null).order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to)
  );
  if (error) throw error;
  const sources = new Map<string, TrackedWaterSource>();
  for (const row of data) if (row.source_id && !sources.has(row.source_id)) sources.set(row.source_id, { id: row.source_id, code: row.source_code ?? `SRC-${String(row.source_id).slice(0, 8).toUpperCase()}`, label: row.source_label ?? "Tracked source", areaName: row.area_name ?? "", address: row.street_address ?? row.address ?? "", sourceType: row.source_type ?? "Tube well" });
  return [...sources.values()];
}
export async function readCommunityWaterAreaRisks(): Promise<CommunityWaterAreaRisk[]> {
  const { data, error } = await fetchAllPages((from, to) =>
    getSupabaseBrowserClient().from("water_area_risk_summary").select("*").order("area_key").range(from, to)
  );
  if (error) throw error;
  return data.map((row) => ({ areaKey: row.area_key, reportCount: Number(row.report_count), normalCount: Number(row.normal_count), moderateCount: Number(row.moderate_count), highCount: Number(row.high_count), incompleteCount: Number(row.incomplete_count), assessedCount: Number(row.assessed_count), weightedScore: row.weighted_score === null ? null : Number(row.weighted_score), riskLevel: row.area_risk_level }));
}
export async function readPublicAreaSourceTrends(): Promise<PublicAreaSourceTrend[]> {
  const { data, error } = await fetchAllPages((from, to) =>
    getSupabaseBrowserClient().from("water_public_area_source_trends").select("*").order("area_key").order("source_type").order("sample_month").range(from, to)
  );
  if (!error) {
    return data.map((row) => ({ areaKey: row.area_key, cityName: row.city_name, sourceType: row.source_type, sampleMonth: row.sample_month ?? null, sampleDay: row.sample_day ?? null, reportCount: Number(row.report_count), averageDepthM: row.average_depth_m === null ? null : Number(row.average_depth_m), normalCount: Number(row.normal_count), moderateCount: Number(row.moderate_count), highCount: Number(row.high_count), incompleteCount: Number(row.incomplete_count), weightedRiskScore: row.weighted_risk_score === null ? null : Number(row.weighted_risk_score), labMeasurementCount: Number(row.lab_measurement_count ?? 0), awaitingReviewCount: Number(row.awaiting_review_count ?? 0) }));
  }

  // Fallback: if the SQL view is not created yet, aggregate from water_reports directly for authenticated/admin sessions
  const reports = await readCommunityWaterReports();
  const groups = new Map<string, { areaKey: string; cityName: string; sourceType: string; sampleMonth: string | null; sampleDay: string | null; reportCount: number; depthSum: number; depthCount: number; normalCount: number; moderateCount: number; highCount: number; incompleteCount: number; labMeasurementCount: number; awaitingReviewCount: number }>();
  for (const r of reports) {
    const areaKey = (r.areaName?.trim() || r.areaKey?.trim() || r.address || "Other areas").trim();
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
  return [...groups.values()].map((g) => {
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
}
export async function submitCommunityWaterReport(report: NewCommunityWaterReport) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user?.email_confirmed_at) throw new Error("Verify your email with the one-time code before submitting.");
  const id = crypto.randomUUID();
  const areaName = report.areaName?.trim() ?? "";
  const streetAddress = report.address.trim();
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
export function notifyCommunityWaterReportsUpdated() { if (typeof window !== "undefined") window.dispatchEvent(new Event(UPDATED_EVENT)); }
export function subscribeToCommunityWaterReports(callback: () => void) { if (typeof window === "undefined") return () => {}; window.addEventListener(UPDATED_EVENT, callback); return () => window.removeEventListener(UPDATED_EVENT, callback); }
