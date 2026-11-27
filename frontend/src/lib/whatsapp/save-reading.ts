// Saves a WhatsApp depth reading into Supabase water_reports, like the website form does.
// Needs a server-only key, so it is off unless both env vars below are set.
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readPublicAreaSourceTrends } from "@/lib/community-water-reports";
import { checkSubmissionAnomaly } from "@/lib/depth-analytics";
import type { SourceType } from "@/lib/whatsapp/understand";

export type ReadingToSave = {
  phone: string;
  areaName: string;
  depthM: number;
  sourceType: SourceType | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type SaveResult =
  | { status: "saved"; id: string; sourceCode: string | null }
  | { status: "rejected"; reason: string }
  | { status: "disabled" }
  | { status: "test" };

export function savingEnabled() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.WHATSAPP_REPORTER_USER_ID && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * The same phone + district always gives the same source id, so monthly readings link up
 * on the website without the phone number itself being stored anywhere.
 */
function stableSourceId(phone: string, areaName: string, sourceType: string) {
  const salt = process.env.WHATSAPP_APP_SECRET || "aqualedger-whatsapp";
  const hex = createHash("sha256").update(`${salt}|${phone}|${areaName}|${sourceType}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function todayInPakistan() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

export async function saveReading(reading: ReadingToSave, options: { dryRun: boolean }): Promise<SaveResult> {
  try {
    const trends = await readPublicAreaSourceTrends();
    const anomaly = checkSubmissionAnomaly(reading.depthM, trends, reading.areaName);
    if (anomaly) return { status: "rejected", reason: anomaly };
  } catch {
    // The anomaly guard is a best-effort check; the admin still reviews every report.
  }
  if (options.dryRun) return { status: "test" };
  if (!savingEnabled()) return { status: "disabled" };

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sourceType = reading.sourceType ?? "Tube well";
  const hasLocation = reading.latitude != null && reading.longitude != null;
  const row = {
    id: randomUUID(),
    created_by: process.env.WHATSAPP_REPORTER_USER_ID,
    source_id: stableSourceId(reading.phone, reading.areaName, sourceType),
    source_code: "SRC-PENDING",
    source_label: `WhatsApp ${sourceType}`,
    reporter_name: "WhatsApp reporter",
    address: reading.areaName,
    street_address: "",
    area_name: reading.areaName,
    source_type: sourceType,
    source_depth_m: Number(reading.depthM.toFixed(2)),
    sample_date: todayInPakistan(),
    main_concern: "Reported via WhatsApp",
    review_status: "under_review",
    location_consent: hasLocation,
    latitude: hasLocation ? reading.latitude : null,
    longitude: hasLocation ? reading.longitude : null,
    location_accuracy_m: null,
    location_captured_at: hasLocation ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase.from("water_reports").insert(row).select("id, source_code").single();
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return { status: "saved", id: String(data?.id ?? row.id), sourceCode: (data?.source_code as string | null) ?? null };
}
