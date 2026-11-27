import districtData from "@/data/district-intelligence.json";
import graceProvinceData from "@/data/grace-tws-by-province.json";

export type CityWaterQuality = {
  city: string;
  samples: number | null;
  pctSafe: number | null;
  pctUnsafe: number | null;
  contaminants: string | null;
};

export type DistrictIntelligence = {
  district: string;
  province: string;
  population2025: number | null;
  medianDepthFt: number | null;
  brackishPct: number | null;
  stressScore: number | null;
  stressComponents: number | null;
  graceTrendCmYr: number | null;
  graceChangeCm: number | null;
  graceLatestCm: number | null;
  graceStatus: string | null;
  normalRainMm: number | null;
  rainVsNormalPct: number | null;
  tubewellsTotal: number | null;
  twElectric: number | null;
  twDiesel: number | null;
  electricSharePct: number | null;
  dieselSharePct: number | null;
  peoplePerTubewell: number | null;
  arsenicSamples: number | null;
  arsenicPctOver10: number | null;
  arsenicPctOver50: number | null;
  ecoliPctHousehold: number | null;
  safelyManagedPct: number | null;
  citySafePct: number | null;
  censusMotorPumpPct: number | null;
  censusTapWaterPct: number | null;
  aqueductStressLabel: string | null;
  aqueductStressScore: number | null;
  aqueductDroughtScore: number | null;
  pctIrrigatedGroundwater: number | null;
  flood2022Pct: number | null;
  insarSubsidenceCmYr: number | null;
  cities: CityWaterQuality[];
};

const DISTRICTS = districtData as Record<string, DistrictIntelligence>;

export const GRACE_PROVINCE_SERIES = graceProvinceData as unknown as Record<string, [string, number][]>;

const ALIASES: Record<string, string> = {
  islamabad: "Islamabad Capital Territory",
  ict: "Islamabad Capital Territory",
  "islamabad capital territory": "Islamabad Capital Territory",
  sheikhupura: "Sheikhpura",
  sheikhpura: "Sheikhpura",
  "nankana sahib": "Sheikhpura",
  leiah: "Layyah",
  layyah: "Layyah",
  chiniot: "Jhang",
  "dg khan": "Dera Ghazi Khan",
  "dera ghazi khan": "Dera Ghazi Khan",
  "rahim yar khan": "Rahim Yar Khan",
  rahimyar: "Rahim Yar Khan",
  pindi: "Rawalpindi",
  rawalpindi: "Rawalpindi",
};

/** Match an AquaLedger areaKey or address ("Lahore, Punjab") to a canonical district profile. */
export function findDistrictIntelligence(areaOrAddress?: string | null): DistrictIntelligence | null {
  if (!areaOrAddress) return null;
  const parts = areaOrAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const lower = part.toLowerCase();
    const aliasHit = ALIASES[lower];
    if (aliasHit && DISTRICTS[aliasHit]) return DISTRICTS[aliasHit];
    const direct = Object.keys(DISTRICTS).find((k) => k.toLowerCase() === lower);
    if (direct) return DISTRICTS[direct];
  }

  const fullLower = areaOrAddress.toLowerCase();
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (fullLower.includes(alias) && DISTRICTS[target]) return DISTRICTS[target];
  }
  for (const key of Object.keys(DISTRICTS)) {
    if (fullLower.includes(key.toLowerCase())) return DISTRICTS[key];
  }
  return null;
}
