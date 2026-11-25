import type { CommunityWaterReport } from "@/lib/community-water-reports";

const CITY_CODES: Record<string, string> = {
  islamabad: "ISB", ict: "ISB", karachi: "KHI", lahore: "LHR", peshawar: "PSH",
  quetta: "QTA", multan: "MUL", faisalabad: "FSD", rawalpindi: "RWP", pindi: "RWP",
  hyderabad: "HYD", sialkot: "SKT", gujranwala: "GRW", bahawalpur: "BWP", sukkur: "SKR",
  abbottabad: "ATD", murree: "MUR", sargodha: "SGD", jhang: "JHG", gujrat: "GRT",
  okara: "OKR", kasur: "KSR", sheikhupura: "SKP", rahimyar: "RYK", dera: "DGI",
  gilgit: "GIL", skardu: "KDU", muzaffarabad: "MZD", mirpur: "MIR",
};
const NON_CITY = new Set(["pakistan", "punjab", "sindh", "kpk", "khyber pakhtunkhwa", "balochistan", "ict", "islamabad capital territory", "ajk", "azad jammu and kashmir", "gilgit baltistan"]);

export function cityCodeForAddress(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  for (const [city, code] of Object.entries(CITY_CODES).sort(([a], [b]) => b.length - a.length)) {
    if (new RegExp(`\\b${city}\\b`, "i").test(address)) return code;
  }
  const candidate = [...parts].reverse().map((part) => part.toLowerCase()).find((part) => !NON_CITY.has(part) && !/^\d/.test(part));
  return candidate ? candidate.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "PAK" : "PAK";
}

/** Assign stable readable labels when reports are supplied newest first. */
export function buildReportCodes(reports: CommunityWaterReport[]) {
  const counters = new Map<string, number>();
  const codes = new Map<string, string>();
  for (let index = reports.length - 1; index >= 0; index--) {
    const report = reports[index];
    const prefix = cityCodeForAddress(report.address);
    if (report.reportCode) {
      codes.set(report.id, report.reportCode);
      const assignedNumber = Number(report.reportCode.split("-").at(-1));
      if (Number.isFinite(assignedNumber)) counters.set(prefix, Math.max(counters.get(prefix) ?? 0, assignedNumber));
      continue;
    }
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    codes.set(report.id, `${prefix}-${next}`);
  }  return codes;
}
