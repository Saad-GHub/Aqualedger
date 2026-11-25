import type { CommunityWaterReport } from "@/lib/community-water-reports";

export type RegionFeature = {
  type: "Feature";
  id: string;
  properties: {
    regionId: string;
    name: string;
    province: string;
    aliases: string[];
    reportCount: number;
    avgDepthM: number | null;
    score: number;
    status: "Critical" | "Moderate" | "Normal" | "No data";
  };
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
};

type BaseRegion = {
  regionId: string;
  name: string;
  province: string;
  aliases: string[];
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number };
  ring: [number, number][];
};

const BASE_REGIONS: BaseRegion[] = [
  {
    regionId: "ict-potohar",
    name: "Islamabad & Potohar",
    province: "ICT / North Punjab",
    aliases: ["islamabad", "ict", "rawalpindi", "pindi", "chakwal", "tala gang", "attock", "jhelum", "murree", "taxila", "wah"],
    bounds: { minLng: 71.8, maxLng: 74.1, minLat: 32.7, maxLat: 34.0 },
    ring: [
      [71.8, 33.8],
      [73.1, 34.0],
      [73.8, 33.9],
      [74.1, 33.1],
      [73.7, 32.7],
      [72.2, 32.7],
      [71.8, 33.2],
      [71.8, 33.8],
    ],
  },
  {
    regionId: "punjab-central",
    name: "Central Punjab",
    province: "Punjab",
    aliases: ["lahore", "faisalabad", "sialkot", "gujranwala", "sargodha", "gujrat", "okara", "kasur", "sheikhupura", "jhang", "sahiwal", "narowal", "mandi bahauddin", "chiniot", "lalian", "bhawana", "toba tek singh", "gojra", "kamalia", "pir mahal", "hafizabad", "pindi bhattian", "khushab", "quaidabad", "noorpur", "mianwali", "piplan", "bhakkar", "kalur kot", "nankana sahib", "shah kot", "sangla hill", "pattoki", "chunian", "kot radha kishen", "muridke", "ferozewala", "sharak pur", "safdarabad", "daska", "pasrur", "sambrial", "wazirabad", "kamoke", "nowshera virkan", "zafarwal", "shakargarh", "phalia", "malakwal", "bhalwal", "shahpur", "bhera", "kot momin", "sillanwali", "chichawatni", "renala khurd", "depalpur", "shorkot", "athara hazari", "ahmadpur sial", "tandlian wala", "summundri", "jaranwala", "chak jhumra", "kharian"],
    bounds: { minLng: 71.2, maxLng: 75.3, minLat: 30.6, maxLat: 32.7 },
    ring: [
      [71.4, 32.7],
      [73.7, 32.7],
      [74.6, 32.6],
      [75.3, 32.2],
      [74.7, 31.1],
      [73.8, 30.6],
      [71.8, 30.6],
      [71.2, 31.6],
      [71.4, 32.7],
    ],
  },
  {
    regionId: "punjab-south",
    name: "South Punjab",
    province: "Punjab",
    aliases: ["multan", "bahawalpur", "rahim yar khan", "rahimyar", "dera ghazi khan", "dg khan", "dera", "muzaffargarh", "vehari", "lodhran", "khanewal", "rajanpur", "layyah", "leiah", "pakpattan", "bahawalnagar", "burewala", "arif wala", "mian channu", "kabirwala", "jahanian", "mailsi", "dunyapur", "kahror pacca", "yazman", "liaqatpur", "sadiqabad", "khanpur", "ahmadpur east", "hasilpur", "khairpur tamewali", "kot addu", "alipur", "jatoi", "jampur", "rojhan", "chishtian", "karor lal esan", "choubara", "shujabad", "jalalpur pirwala"],
    bounds: { minLng: 69.8, maxLng: 73.8, minLat: 27.8, maxLat: 30.6 },
    ring: [
      [70.3, 30.6],
      [73.8, 30.6],
      [73.3, 29.7],
      [72.2, 28.4],
      [70.8, 27.8],
      [69.8, 28.4],
      [69.9, 29.8],
      [70.3, 30.6],
    ],
  },
  {
    regionId: "sindh-north",
    name: "North & Central Sindh",
    province: "Sindh",
    aliases: ["sukkur", "larkana", "jacobabad", "khairpur", "nawabshah", "shaheed benazirabad", "dadu", "shikarpur", "ghotki", "ubauro", "kashmore", "naushahro feroze"],
    bounds: { minLng: 67.3, maxLng: 70.6, minLat: 25.8, maxLat: 28.4 },
    ring: [
      [67.5, 28.1],
      [69.8, 28.4],
      [70.6, 27.4],
      [70.3, 25.9],
      [67.6, 25.8],
      [67.3, 26.8],
      [67.5, 28.1],
    ],
  },
  {
    regionId: "sindh-south",
    name: "Karachi & South Sindh",
    province: "Sindh",
    aliases: ["karachi", "hyderabad", "thatta", "badin", "mirpurkhas", "umerkot", "tharparkar", "jamshoro", "matiari", "tando"],
    bounds: { minLng: 66.6, maxLng: 71.1, minLat: 23.7, maxLat: 25.8 },
    ring: [
      [66.7, 25.4],
      [67.6, 25.8],
      [70.3, 25.9],
      [71.1, 24.7],
      [69.4, 23.8],
      [67.4, 23.9],
      [66.6, 24.9],
      [66.7, 25.4],
    ],
  },
  {
    regionId: "kp-north",
    name: "North KP & Peshawar",
    province: "Khyber Pakhtunkhwa",
    aliases: ["peshawar", "mardan", "abbottabad", "swat", "mingora", "nowshera", "charsadda", "swabi", "mansehra", "haripur", "chitral", "dir", "malakand"],
    bounds: { minLng: 70.6, maxLng: 73.8, minLat: 33.6, maxLat: 36.8 },
    ring: [
      [71.2, 36.8],
      [73.2, 36.4],
      [73.8, 35.1],
      [73.5, 34.0],
      [73.1, 34.0],
      [71.8, 33.8],
      [70.8, 33.7],
      [70.6, 34.8],
      [71.2, 36.8],
    ],
  },
  {
    regionId: "kp-south",
    name: "South KP",
    province: "Khyber Pakhtunkhwa",
    aliases: ["kohat", "bannu", "di khan", "dera ismail khan", "lakki marwat", "karak", "waziristan", "kurram", "tank", "hangu"],
    bounds: { minLng: 69.5, maxLng: 71.8, minLat: 31.3, maxLat: 33.7 },
    ring: [
      [70.0, 33.7],
      [71.8, 33.7],
      [71.4, 32.6],
      [71.2, 31.6],
      [70.3, 31.3],
      [69.5, 32.3],
      [70.0, 33.7],
    ],
  },
  {
    regionId: "balochistan-north",
    name: "North Balochistan & Quetta",
    province: "Balochistan",
    aliases: ["quetta", "zhob", "loralai", "ziarat", "pishin", "chaman", "sibi", "qila saifullah", "mastung", "nushki"],
    bounds: { minLng: 65.5, maxLng: 70.3, minLat: 29.2, maxLat: 32.0 },
    ring: [
      [66.2, 31.1],
      [69.5, 32.0],
      [70.3, 31.3],
      [69.9, 29.8],
      [68.4, 29.2],
      [65.5, 29.4],
      [65.8, 30.4],
      [66.2, 31.1],
    ],
  },
  {
    regionId: "balochistan-south",
    name: "South & West Balochistan",
    province: "Balochistan",
    aliases: ["gwadar", "turbat", "khuzdar", "kalat", "lasbela", "hub", "panjgur", "chagai", "dalbandin", "makran", "awadan", "ormara"],
    bounds: { minLng: 61.0, maxLng: 67.5, minLat: 25.0, maxLat: 29.4 },
    ring: [
      [61.5, 29.2],
      [65.5, 29.4],
      [67.5, 28.1],
      [67.3, 26.8],
      [66.7, 25.4],
      [64.5, 25.2],
      [61.6, 25.1],
      [61.0, 27.2],
      [61.5, 29.2],
    ],
  },
  {
    regionId: "ajk",
    name: "Azad Jammu & Kashmir",
    province: "AJK",
    aliases: ["muzaffarabad", "mirpur", "kotli", "rawalkot", "bhimber", "bagh", "ajk", "azad kashmir"],
    bounds: { minLng: 73.3, maxLng: 75.1, minLat: 32.8, maxLat: 35.1 },
    ring: [
      [73.5, 35.0],
      [74.7, 34.8],
      [75.1, 33.7],
      [74.2, 32.8],
      [73.7, 32.8],
      [73.4, 33.9],
      [73.5, 35.0],
    ],
  },
  {
    regionId: "gilgit-baltistan",
    name: "Gilgit-Baltistan",
    province: "Gilgit-Baltistan",
    aliases: ["gilgit", "skardu", "hunza", "diamer", "chilas", "ghizer", "astore", "ghanche", "baltistan"],
    bounds: { minLng: 72.5, maxLng: 77.5, minLat: 34.9, maxLat: 37.1 },
    ring: [
      [72.6, 36.9],
      [75.4, 37.1],
      [77.4, 35.6],
      [76.2, 34.9],
      [73.8, 35.0],
      [72.9, 35.6],
      [72.6, 36.9],
    ],
  },
];

export function matchReportToRegionId(report: CommunityWaterReport): string | null {
  if (
    report.latitude != null &&
    report.longitude != null &&
    Number.isFinite(report.latitude) &&
    Number.isFinite(report.longitude)
  ) {
    const byBounds = BASE_REGIONS.find(
      (r) =>
        report.longitude! >= r.bounds.minLng &&
        report.longitude! <= r.bounds.maxLng &&
        report.latitude! >= r.bounds.minLat &&
        report.latitude! <= r.bounds.maxLat
    );
    if (byBounds) return byBounds.regionId;
  }

  const text = `${report.areaKey ?? ""} ${report.areaName ?? ""} ${report.address ?? ""}`.toLowerCase();
  for (const region of BASE_REGIONS) {
    if (
      region.aliases.some((alias) =>
        new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, "i").test(text)
      )
    ) {
      return region.regionId;
    }
  }
  return null;
}

export function buildPakistanRegionsGeoJson(
  reports: CommunityWaterReport[],
  riskScoreFn: (report: CommunityWaterReport) => number
) {
  const buckets = new Map<
    string,
    { count: number; scoreWeighted: number; depthWeighted: number; depthCount: number }
  >();

  for (const report of reports) {
    const regionId = matchReportToRegionId(report);
    if (!regionId) continue;
    const weight = report.aggregateCount ?? 1;
    const score = riskScoreFn(report);
    const depth = Number.parseFloat(report.depth ?? "");
    const b = buckets.get(regionId) ?? {
      count: 0,
      scoreWeighted: 0,
      depthWeighted: 0,
      depthCount: 0,
    };
    b.count += weight;
    b.scoreWeighted += score * weight;
    if (Number.isFinite(depth) && depth >= 0) {
      b.depthWeighted += depth * weight;
      b.depthCount += weight;
    }
    buckets.set(regionId, b);
  }

  const features: RegionFeature[] = BASE_REGIONS.map((region) => {
    const stats = buckets.get(region.regionId);
    const reportCount = stats?.count ?? 0;
    const avgScore = reportCount > 0 ? stats!.scoreWeighted / reportCount : 0;
    const avgDepthM =
      stats && stats.depthCount > 0
        ? Number((stats.depthWeighted / stats.depthCount).toFixed(1))
        : null;
    const status: RegionFeature["properties"]["status"] =
      reportCount === 0
        ? "No data"
        : avgScore >= 1.5
          ? "Critical"
          : avgScore >= 0.75
            ? "Moderate"
            : "Normal";

    return {
      type: "Feature",
      id: region.regionId,
      properties: {
        regionId: region.regionId,
        name: region.name,
        province: region.province,
        aliases: region.aliases,
        reportCount,
        avgDepthM,
        score: avgScore,
        status,
      },
      geometry: {
        type: "Polygon",
        coordinates: [region.ring],
      },
    };
  });

  return {
    type: "FeatureCollection" as const,
    features,
  };
}
