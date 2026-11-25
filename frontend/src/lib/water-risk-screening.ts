import type { CommunityWaterReport } from "@/lib/community-water-reports";

export type WaterRiskFlag = { label: string; detail: string; kind: "health" | "screening" };

const numeric = (value?: string) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
};

export function screenWaterReport(report: CommunityWaterReport) {
  const values = report.measurements;
  const flags: WaterRiskFlag[] = [];
  const hasValue = (value?: string) => Boolean(value?.trim() && !["null", "undefined"].includes(value.trim().toLowerCase()));
  const check = (name: string, comparator: (value: number) => boolean, detail: (value: number) => string, kind: WaterRiskFlag["kind"] = "screening") => {
    const value = numeric(values[name]);
    if (value !== null && comparator(value)) flags.push({ label: name, detail: detail(value), kind });
  };

  const ecoli = (values["E. coli"] ?? "").trim().toLowerCase();
  if (ecoli && !["not detected", "absent", "negative", "0", "none"].includes(ecoli) && !ecoli.includes("not detected")) {
    flags.push({ label: "E. coli", detail: `Reported result: ${values["E. coli"]} (should not be detected in a 100 mL sample)`, kind: "health" });
  }
  check("Arsenic", (value) => value > 10, (value) => `${value} µg/L exceeds the 10 µg/L guideline`, "health");
  check("Nitrate", (value) => value > 50, (value) => `${value} mg/L exceeds the 50 mg/L guideline`, "health");
  check("Fluoride", (value) => value > 1.5, (value) => `${value} mg/L exceeds the 1.5 mg/L guideline`, "health");
  check("pH", (value) => value < 6.5 || value > 8.5, (value) => `${value} is outside the usual 6.5–8.5 screening range`);
  check("TDS", (value) => value >= 1000, (value) => `${value} mg/L meets or exceeds the Pakistan <1,000 mg/L standard`);
  check("Turbidity", (value) => value >= 5, (value) => `${value} NTU meets or exceeds the Pakistan <5 NTU standard`);
  check("Hardness", (value) => value >= 500, (value) => `${value} mg/L meets or exceeds the Pakistan <500 mg/L standard`);
  check("Chloride", (value) => value >= 250, (value) => `${value} mg/L meets or exceeds the Pakistan <250 mg/L standard`);

  const measured = Object.values(values).filter(hasValue).length;
  const required: [string, string | undefined][] = [
    ["Reporter name", report.reporterName], ["Address", report.address], ["Source type", report.sourceType],
    ["Source depth", report.depth], ["Sample date", report.sampleDate],
    ...Object.keys(values).map((name): [string, string | undefined] => [name, values[name]]),
  ];
  const missingFields = required.filter(([, value]) => !hasValue(value)).map(([name]) => name);
  const category = flags.some((flag) => flag.kind === "health")
    ? "High concern"
    : flags.length
      ? "Review needed"
      : measured === 10
        ? "No configured flags"
        : "Needs data";
  const riskLevel = flags.some((flag) => flag.kind === "health") ? "High concern" : flags.length ? "Moderate concern" : missingFields.length ? "Incomplete" : "Normal";
  const verificationState = missingFields.length ? "Incomplete" : report.status === "verified" ? "Verified" : "Not verified";
  return { flags, measured, missingFields, category, riskLevel, verificationState };
}

export function waterRiskLabel(category: string) {
  if (category === "High concern") return "High concern";
  if (category === "Review needed") return "Review needed";
  if (category === "No configured flags") return "Normal";
  return "Incomplete results";
}
