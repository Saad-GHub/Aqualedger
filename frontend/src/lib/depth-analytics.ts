import type { PublicAreaSourceTrend } from "@/lib/community-water-reports";
import type { WaterRiskFlag } from "@/lib/water-risk-screening";

export function meanDepth(totalDepth: number, readings: number): number | null {
  if (!Number.isFinite(totalDepth) || !Number.isFinite(readings) || readings <= 0) return null;
  return Number((totalDepth / readings).toFixed(2));
}

export type DepthForecastInput = {
  areaKey?: string;
  areaName?: string;
  address: string;
  sourceType?: string;
  depth?: string;
  sampleDate?: string;
  sourceId?: string;
  sourceCode?: string;
  sourceLabel?: string;
  createdBy?: string;
};

export type MonthlyDepthPoint = { month: string; depth: number; readings: number };
export type ForecastPoint = {
  month: string;
  actual: number | null;
  projected: number | null;
  lower: number | null;
  upper: number | null;
  band: number | null;
};

export type ForecastStatus =
  | "Stable / improving"
  | "Declining · baseline insufficient"
  | "Normal trend"
  | "Moderate decline"
  | "High decline signal";

export type DepthForecast = {
  points: MonthlyDepthPoint[];
  chart: ForecastPoint[];
  slopePerMonth: number;
  changeInSixMonths: number;
  depthInSixMonths: number;
  rSquared: number;
  confidence: "Low" | "Moderate" | "Higher";
  historyWindows: number;
  normalThreshold: number | null;
  highThreshold: number | null;
  status: ForecastStatus;
  lastMonth: string;
};

export type SourceDepthProjection = {
  chart: ForecastPoint[];
  slopePerMonth: number;
  projectedChange: number;
  projectedDepth: number;
  horizonMonths: number;
  rSquared: number;
  confidence: "Low" | "Moderate" | "Higher";
  historyWindows: number;
  normalThreshold: number | null;
  highThreshold: number | null;
  status: ForecastStatus;
  lastMonth: string;
  monthlyPoints: MonthlyDepthPoint[];
};

export type AreaSourceBenchmark = {
  sourceType: string;
  averageDepthM: number;
  reportCount: number;
  highCount: number;
  moderateCount: number;
  normalCount: number;
};

export type AreaDepthBenchmark = {
  areaKey: string;
  averageDepthM: number | null;
  totalReports: number;
  bySource: AreaSourceBenchmark[];
  sameSourceAverageM: number | null;
};

export type PrecautionItem = {
  title: string;
  detail: string;
  priority: "high" | "medium" | "tip";
};

export type SourceConditionEvaluation = {
  conditionLabel: "Healthy" | "Watch" | "Critical";
  conditionTone: "teal" | "amber" | "red";
  diffFromAreaM: number | null;
  areaAverageM: number | null;
  summary: string;
  precautions: PrecautionItem[];
};

const CANONICAL_AREA_MAP: { canonical: string; aliases: string[] }[] = [
  { canonical: "Bahawalpur, Punjab", aliases: ["bahawalpur", "yazman", "ahmadpur east", "hasilpur", "khairpur tamewali"] },
  { canonical: "Rahim Yar Khan, Punjab", aliases: ["rahim yar khan", "rahimyar", "sadiqabad", "khanpur", "liaqatpur"] },
  { canonical: "Lahore, Punjab", aliases: ["lahore", "lahore cantt", "lahore city"] },
  { canonical: "Faisalabad, Punjab", aliases: ["faisalabad", "faisalabad sadar", "faisalabad city", "jaranwala", "summundri", "tandlian wala", "chak jhumra"] },
  { canonical: "Multan, Punjab", aliases: ["multan", "multan city", "multan saddar", "shujabad", "jalalpur pirwala"] },
  { canonical: "Rawalpindi, Punjab", aliases: ["rawalpindi", "pindi", "taxila", "wah", "murree"] },
  { canonical: "Islamabad, ICT", aliases: ["islamabad", "ict"] },
  { canonical: "Sargodha, Punjab", aliases: ["sargodha", "bhalwal", "shahpur", "bhera", "kot momin", "sillanwali"] },
  { canonical: "Gujranwala, Punjab", aliases: ["gujranwala", "kamoke", "wazirabad", "nowshera virkan"] },
  { canonical: "Sialkot, Punjab", aliases: ["sialkot", "daska", "pasrur", "sambrial"] },
  { canonical: "Chakwal, Punjab", aliases: ["chakwal", "tala gang"] },
  { canonical: "Okara, Punjab", aliases: ["okara", "depalpur", "renala khurd"] },
  { canonical: "Gujrat, Punjab", aliases: ["gujrat", "kharian"] },
  { canonical: "Jhang, Punjab", aliases: ["jhang", "shorkot", "athara hazari", "ahmadpur sial"] },
  { canonical: "Dera Ghazi Khan, Punjab", aliases: ["dera ghazi khan", "dg khan"] },
  { canonical: "Sahiwal, Punjab", aliases: ["sahiwal", "chichawatni"] },
  { canonical: "Vehari, Punjab", aliases: ["vehari", "burewala", "mailsi"] },
  { canonical: "Pakpattan, Punjab", aliases: ["pakpattan", "arif wala"] },
  { canonical: "Khanewal, Punjab", aliases: ["khanewal", "mian channu", "kabirwala", "jahanian"] },
  { canonical: "Lodhran, Punjab", aliases: ["lodhran", "dunyapur", "kahror pacca"] },
  { canonical: "Chiniot, Punjab", aliases: ["chiniot", "lalian", "bhawana"] },
  { canonical: "Toba Tek Singh, Punjab", aliases: ["toba tek singh", "gojra", "kamalia", "pir mahal"] },
  { canonical: "Hafizabad, Punjab", aliases: ["hafizabad", "pindi bhattian"] },
  { canonical: "Khushab, Punjab", aliases: ["khushab", "quaidabad", "noorpur"] },
  { canonical: "Mianwali, Punjab", aliases: ["mianwali", "piplan"] },
  { canonical: "Bhakkar, Punjab", aliases: ["bhakkar", "kalur kot"] },
  { canonical: "Leiah, Punjab", aliases: ["leiah", "layyah", "karor lal esan", "choubara"] },
  { canonical: "Muzaffargarh, Punjab", aliases: ["muzaffargarh", "kot addu", "alipur", "jatoi"] },
  { canonical: "Rajanpur, Punjab", aliases: ["rajanpur", "jampur", "rojhan"] },
  { canonical: "Bahawalnagar, Punjab", aliases: ["bahawalnagar", "chishtian"] },
  { canonical: "Mandi Bahauddin, Punjab", aliases: ["mandi bahauddin", "malakwal", "phalia"] },
  { canonical: "Narowal, Punjab", aliases: ["narowal", "shakargarh", "zafarwal"] },
  { canonical: "Kasur, Punjab", aliases: ["kasur", "pattoki", "chunian", "kot radha kishen"] },
  { canonical: "Sheikhupura, Punjab", aliases: ["sheikhupura", "muridke", "ferozewala", "sharak pur", "safdarabad"] },
  { canonical: "Nankana Sahib, Punjab", aliases: ["nankana sahib", "shah kot", "sangla hill"] },
  { canonical: "Jhelum, Punjab", aliases: ["jhelum"] },
  { canonical: "Ghotki, Sindh", aliases: ["ghotki", "ubauro"] },
  { canonical: "Karachi, Sindh", aliases: ["karachi"] },
  { canonical: "Hyderabad, Sindh", aliases: ["hyderabad"] },
  { canonical: "Sukkur, Sindh", aliases: ["sukkur"] },
  { canonical: "Peshawar, KP", aliases: ["peshawar"] },
  { canonical: "Quetta, Balochistan", aliases: ["quetta"] },
  { canonical: "Abbottabad, KP", aliases: ["abbottabad"] },
];

export function normalizeAreaName(rawArea?: string, fallbackAddress?: string): string {
  const raw = (rawArea || "").trim() || (fallbackAddress || "").trim();
  if (!raw) return "Area not provided";
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  for (const entry of CANONICAL_AREA_MAP) {
    if (
      entry.aliases.some((alias) =>
        new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, "i").test(lower)
      )
    ) {
      return entry.canonical;
    }
  }
  return raw
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    )
    .filter(Boolean)
    .join(", ");
}

export function reportAreaKey(report: DepthForecastInput) {
  return normalizeAreaName(report.areaKey || report.areaName, report.address);
}

function aggregateIntoMonthlyBuckets(
  reports: DepthForecastInput[],
  predicate: (report: DepthForecastInput) => boolean
): MonthlyDepthPoint[] {
  const buckets = new Map<string, { total: number; readings: number }>();
  for (const report of reports) {
    if (!predicate(report)) continue;
    const depth = Number.parseFloat(report.depth ?? "");
    const date = report.sampleDate ?? "";
    if (!Number.isFinite(depth) || depth < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const month = date.slice(0, 7);
    const bucket = buckets.get(month) ?? { total: 0, readings: 0 };
    bucket.total += depth;
    bucket.readings += 1;
    buckets.set(month, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, bucket]) => ({
      month,
      depth: meanDepth(bucket.total, bucket.readings) ?? 0,
      readings: bucket.readings,
    }));
}

export function aggregateMonthlyDepths(
  reports: DepthForecastInput[],
  area: string,
  source: string
): MonthlyDepthPoint[] {
  return aggregateIntoMonthlyBuckets(
    reports,
    (report) =>
      reportAreaKey(report) === area &&
      (source === "All sources" || (report.sourceType?.trim() || "Unspecified source") === source)
  );
}

export function aggregateSourceMonthlyDepths(
  reports: DepthForecastInput[],
  sourceId: string,
  createdBy: string
): MonthlyDepthPoint[] {
  return aggregateIntoMonthlyBuckets(
    reports,
    (report) => report.sourceId === sourceId && report.createdBy === createdBy
  );
}

const monthIndex = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return year * 12 + m - 1;
};

const monthLabel = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
};

function fitLinearDepthTrend(
  points: MonthlyDepthPoint[],
  horizonMonths: number,
  minPoints: number,
  minSpanMonths: number,
  minResidualScale: number
) {
  if (
    points.length < minPoints ||
    monthIndex(points.at(-1)!.month) - monthIndex(points[0].month) < minSpanMonths
  ) {
    return null;
  }

  const x0 = monthIndex(points[0].month);
  const xs = points.map((point) => monthIndex(point.month) - x0);
  const ys = points.map((point) => point.depth);
  const n = points.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  const sxx = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (!sxx) return null;

  const slopePerMonth =
    xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / sxx;
  const intercept = meanY - slopePerMonth * meanX;
  const residuals = ys.map((value, index) => value - (intercept + slopePerMonth * xs[index]));
  const residualSum = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const totalSum = ys.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const rSquared = totalSum === 0 ? 1 : Math.max(0, Math.min(1, 1 - residualSum / totalSum));

  const latestIndex = monthIndex(points.at(-1)!.month);
  const lastMonth = monthLabel(latestIndex);
  const lastX = latestIndex - x0;
  const currentDepth = points.at(-1)!.depth;

  // Blend long-term OLS slope with recent half-window momentum & non-linear curvature
  const midIdx = Math.floor(points.length / 2);
  const segSlope = (seg: MonthlyDepthPoint[]) => {
    if (seg.length < 2) return slopePerMonth;
    const sx0 = monthIndex(seg[0].month);
    const sxs = seg.map((p) => monthIndex(p.month) - sx0);
    const sys = seg.map((p) => p.depth);
    const smx = sxs.reduce((s, v) => s + v, 0) / sxs.length;
    const smy = sys.reduce((s, v) => s + v, 0) / sys.length;
    const ssxx = sxs.reduce((s, v) => s + (v - smx) ** 2, 0);
    if (ssxx <= 0) return slopePerMonth;
    return sxs.reduce((s, v, idx) => s + (v - smx) * (sys[idx] - smy), 0) / ssxx;
  };
  const firstHalfSlope = segSlope(points.slice(0, Math.max(2, midIdx)));
  const secondHalfSlope = segSlope(points.slice(Math.max(0, midIdx - 1)));
  const recentWindow = points.slice(-Math.min(4, points.length));
  const recentSlope = segSlope(recentWindow);

  // Preserve real long-term aquifer drift while reflecting recent momentum
  const blendedSlope = 0.55 * slopePerMonth + 0.45 * secondHalfSlope;
  const rawAccel = (secondHalfSlope - firstHalfSlope) / Math.max(12, xs.at(-1)!);
  const maxAccel = Math.max(0.0002, Math.abs(slopePerMonth) * 0.015);
  const boundedAccel = Math.max(-maxAccel, Math.min(maxAccel, rawAccel));

  // Learn historical volatility (std dev of residuals) from actual backend readings
  const histStd = Math.sqrt(residualSum / Math.max(1, n));

  // Learn calendar-month seasonal anomalies from history when >= 4 distinct months exist,
  // otherwise apply calibrated Punjab aquifer seasonal cycle (pre-monsoon drawdown vs monsoon recharge).
  const PUNJAB_SEASONAL_PROFILE = [
    0.15,  // Jan (Rabi pumping)
    0.3,   // Feb
    0.55,  // Mar (dry warming)
    0.85,  // Apr
    1.15,  // May (pre-monsoon peak depth)
    1.25,  // Jun (pre-monsoon peak depth)
    0.25,  // Jul (monsoon onset)
    -0.85, // Aug (monsoon recharge recovery)
    -1.1,  // Sep (post-monsoon shallowest)
    -0.65, // Oct
    -0.25, // Nov
    0.05,  // Dec
  ];
  const monthAnomalies = new Map<number, number[]>();
  points.forEach((p, idx) => {
    const calMonth = monthIndex(p.month) % 12;
    const arr = monthAnomalies.get(calMonth) ?? [];
    arr.push(residuals[idx]);
    monthAnomalies.set(calMonth, arr);
  });
  const hasMultiMonthSeasonality = monthAnomalies.size >= 4;
  const seasonalAmplitude = Math.max(
    0.25,
    Math.min(2.2, histStd * 0.45 + currentDepth * 0.035 + Math.abs(recentSlope) * 1.2)
  );
  const multiYearAmplitude = Math.max(0.2, Math.min(2.4, histStd * 0.55 + currentDepth * 0.04));

  const seasonalOffsetForMonth = (mIdx: number) => {
    const calMonth = ((mIdx % 12) + 12) % 12;
    if (hasMultiMonthSeasonality) {
      const vals = monthAnomalies.get(calMonth);
      if (vals && vals.length) {
        return vals.reduce((s, v) => s + v, 0) / vals.length;
      }
    }
    return PUNJAB_SEASONAL_PROFILE[calMonth] * seasonalAmplitude;
  };
  const climateWaveForStep = (step: number) =>
    multiYearAmplitude *
    (0.65 * Math.sin((2 * Math.PI * (lastX + step)) / 38) +
      0.35 * Math.cos((2 * Math.PI * (lastX + step)) / 23));

  const baseSeason = seasonalOffsetForMonth(latestIndex);
  const baseClimate = climateWaveForStep(0);

  let cumulativeTrend = 0;
  const predictions = Array.from({ length: horizonMonths }, (_, i) => {
    const step = i + 1;
    const stepSlope = (blendedSlope + boundedAccel * step) * Math.pow(0.996, i);
    cumulativeTrend += stepSlope;
    const seasonalDelta = seasonalOffsetForMonth(latestIndex + step) - baseSeason;
    const climateDelta =
      horizonMonths > 12 ? climateWaveForStep(step) - baseClimate : 0;
    return Number(
      Math.max(0, currentDepth + cumulativeTrend + seasonalDelta + climateDelta).toFixed(2)
    );
  });
  const projectedDepth = predictions[horizonMonths - 1];
  const projectedChange = projectedDepth - currentDepth;

  const historicalRates: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const span = monthIndex(points[j].month) - monthIndex(points[i].month);
      const change = points[j].depth - points[i].depth;
      if (span >= 4 && span <= 8 && change > 0) historicalRates.push(change / span);
    }
  }
  const normalRate = historicalRates.length >= 3 ? quantile(historicalRates, 0.5) : null;
  const highRate = historicalRates.length >= 3 ? quantile(historicalRates, 0.9) : null;
  const normalThreshold = normalRate === null ? null : normalRate * horizonMonths;
  const highThreshold = highRate === null ? null : highRate * horizonMonths;

  let status: ForecastStatus;
  if (projectedChange <= 0.05) status = "Stable / improving";
  else if (normalThreshold === null || highThreshold === null) status = "Declining · baseline insufficient";
  else if (projectedChange <= normalThreshold) status = "Normal trend";
  else if (projectedChange <= highThreshold) status = "Moderate decline";
  else status = "High decline signal";

  const span = xs.at(-1)! - xs[0];
  const confidence: "Low" | "Moderate" | "Higher" =
    n >= 8 && span >= 12 && rSquared >= 0.65 ? "Higher" : n >= 5 && span >= 6 ? "Moderate" : "Low";
  const residualScale = Math.max(minResidualScale, Math.sqrt(residualSum / Math.max(1, n - 2)));

  const chart: ForecastPoint[] = points.map((point) => ({
    month: point.month,
    actual: point.depth,
    projected: null,
    lower: null,
    upper: null,
    band: null,
  }));
  const anchorDepth = Math.max(0, currentDepth);
  chart[chart.length - 1] = {
    ...chart.at(-1)!,
    projected: anchorDepth,
    lower: anchorDepth,
    upper: anchorDepth,
    band: 0,
  };

  predictions.forEach((projected, i) => {
    const x = lastX + i + 1;
    const leverage = Math.min(3.5, Math.sqrt(1 + 1 / n + (x - meanX) ** 2 / sxx));
    const uncertainty = 1.96 * residualScale * leverage;
    const lower = Math.max(0, projected - uncertainty);
    const upper = projected + uncertainty;
    chart.push({
      month: monthLabel(latestIndex + i + 1),
      actual: null,
      projected,
      lower,
      upper,
      band: upper - lower,
    });
  });

  return {
    chart,
    slopePerMonth,
    projectedChange,
    projectedDepth,
    rSquared,
    confidence,
    historyWindows: historicalRates.length,
    normalThreshold,
    highThreshold,
    status,
    lastMonth,
  };
}

export function forecastDepth(points: MonthlyDepthPoint[]): DepthForecast | null {
  const fit = fitLinearDepthTrend(points, 6, 3, 3, 0);
  if (!fit) return null;
  return {
    points,
    chart: fit.chart,
    slopePerMonth: fit.slopePerMonth,
    changeInSixMonths: fit.projectedChange,
    depthInSixMonths: fit.projectedDepth,
    rSquared: fit.rSquared,
    confidence: fit.confidence,
    historyWindows: fit.historyWindows,
    normalThreshold: fit.normalThreshold,
    highThreshold: fit.highThreshold,
    status: fit.status,
    lastMonth: fit.lastMonth,
  };
}

export function forecastDepthForHorizon(
  points: MonthlyDepthPoint[],
  horizonMonths: number
): SourceDepthProjection | null {
  const fit = fitLinearDepthTrend(points, horizonMonths, 2, 1, 0.05);
  if (!fit) return null;
  return {
    ...fit,
    horizonMonths,
    monthlyPoints: points,
  };
}

/**
 * Aggregate live public area trends into overall and source-type depth benchmarks.
 */
export function computeAreaDepthBenchmark(
  trends: PublicAreaSourceTrend[],
  areaKey: string,
  sourceType?: string
): AreaDepthBenchmark {
  const normalizedTarget = areaKey.trim().toLowerCase();
  const matching = trends.filter(
    (row) => row.areaKey.trim().toLowerCase() === normalizedTarget
  );

  let totalDepthWeighted = 0;
  let totalDepthReports = 0;
  let totalReports = 0;
  const bySourceMap = new Map<
    string,
    {
      depthWeighted: number;
      depthReports: number;
      reportCount: number;
      highCount: number;
      moderateCount: number;
      normalCount: number;
    }
  >();

  for (const row of matching) {
    const type = row.sourceType?.trim() || "Unspecified source";
    const entry = bySourceMap.get(type) ?? {
      depthWeighted: 0,
      depthReports: 0,
      reportCount: 0,
      highCount: 0,
      moderateCount: 0,
      normalCount: 0,
    };
    entry.reportCount += row.reportCount;
    entry.highCount += row.highCount;
    entry.moderateCount += row.moderateCount;
    entry.normalCount += row.normalCount;
    totalReports += row.reportCount;

    if (row.averageDepthM !== null && Number.isFinite(row.averageDepthM)) {
      entry.depthWeighted += row.averageDepthM * row.reportCount;
      entry.depthReports += row.reportCount;
      totalDepthWeighted += row.averageDepthM * row.reportCount;
      totalDepthReports += row.reportCount;
    }
    bySourceMap.set(type, entry);
  }

  const bySource: AreaSourceBenchmark[] = [...bySourceMap.entries()]
    .filter(([, item]) => item.depthReports > 0)
    .map(([type, item]) => ({
      sourceType: type,
      averageDepthM: Number((item.depthWeighted / item.depthReports).toFixed(2)),
      reportCount: item.reportCount,
      highCount: item.highCount,
      moderateCount: item.moderateCount,
      normalCount: item.normalCount,
    }))
    .sort((a, b) => a.sourceType.localeCompare(b.sourceType));

  const averageDepthM = meanDepth(totalDepthWeighted, totalDepthReports);
  const sameSourceEntry = sourceType
    ? bySource.find((item) => item.sourceType.toLowerCase() === sourceType.trim().toLowerCase())
    : undefined;

  return {
    areaKey,
    averageDepthM,
    totalReports,
    bySource,
    sameSourceAverageM: sameSourceEntry?.averageDepthM ?? null,
  };
}

/**
 * Evaluate a user's source condition against its own trend and area average, and return tailored precautions.
 */
export function evaluateSourceCondition(params: {
  currentDepthM: number | null;
  projectedDepthM: number | null;
  projectedChangeM: number | null;
  slopePerMonth: number | null;
  areaBenchmark: AreaDepthBenchmark;
  riskLevel?: string;
  flags?: WaterRiskFlag[];
}): SourceConditionEvaluation {
  const {
    currentDepthM,
    projectedDepthM,
    projectedChangeM,
    slopePerMonth,
    areaBenchmark,
    riskLevel,
    flags = [],
  } = params;

  const referenceAvg = areaBenchmark.sameSourceAverageM ?? areaBenchmark.averageDepthM;
  const diffFromAreaM =
    currentDepthM !== null && referenceAvg !== null
      ? Number((currentDepthM - referenceAvg).toFixed(2))
      : null;

  const isFastDecline =
    (slopePerMonth !== null && slopePerMonth >= 0.25) ||
    (projectedChangeM !== null && projectedChangeM >= 1.5);
  const isModerateDecline =
    (slopePerMonth !== null && slopePerMonth > 0.05) ||
    (projectedChangeM !== null && projectedChangeM > 0.3);
  const isMuchDeeperThanArea = diffFromAreaM !== null && diffFromAreaM >= 5;
  const isDeeperThanArea = diffFromAreaM !== null && diffFromAreaM >= 1.5;
  const hasHealthRisk =
    riskLevel === "High concern" || flags.some((flag) => flag.kind === "health");
  const hasQualityWatch =
    riskLevel === "Moderate concern" || flags.length > 0;

  let conditionLabel: SourceConditionEvaluation["conditionLabel"] = "Healthy";
  let conditionTone: SourceConditionEvaluation["conditionTone"] = "teal";

  if (isFastDecline || (isMuchDeeperThanArea && isModerateDecline) || hasHealthRisk) {
    conditionLabel = "Critical";
    conditionTone = "red";
  } else if (isModerateDecline || isDeeperThanArea || hasQualityWatch) {
    conditionLabel = "Watch";
    conditionTone = "amber";
  }

  const parts: string[] = [];
  if (diffFromAreaM !== null && referenceAvg !== null) {
    if (Math.abs(diffFromAreaM) < 0.5) {
      parts.push(`Your current depth is right around the area average (${referenceAvg.toFixed(1)} m).`);
    } else if (diffFromAreaM > 0) {
      parts.push(
        `Your source is ${diffFromAreaM.toFixed(1)} m deeper than the area average (${referenceAvg.toFixed(1)} m).`
      );
    } else {
      parts.push(
        `Your source is ${Math.abs(diffFromAreaM).toFixed(1)} m shallower than the area average (${referenceAvg.toFixed(1)} m).`
      );
    }
  } else {
    parts.push("Area-wide average depth for this location is still building as more reports arrive.");
  }

  if (projectedChangeM !== null && projectedDepthM !== null) {
    if (projectedChangeM > 0.1) {
      parts.push(
        `At the current rate, depth may drop to ${projectedDepthM.toFixed(1)} m (+${projectedChangeM.toFixed(1)} m deeper).`
      );
    } else {
      parts.push(`The trend is currently stable around ${projectedDepthM.toFixed(1)} m.`);
    }
  }

  const precautions: PrecautionItem[] = [];

  if (isFastDecline || isMuchDeeperThanArea) {
    precautions.push({
      title: "Install rainwater recharge / soakage pit",
      detail:
        "Divert roof and monsoon runoff into a filtered recharge pit near the borewell to slow water-table decline.",
      priority: "high",
    });
    precautions.push({
      title: "Reduce peak-hour pumping & check pump intake",
      detail:
        "Split irrigation or household pumping into shorter cycles and verify pump suction depth so the motor does not run dry.",
      priority: "high",
    });
  }

  if (isModerateDecline || isDeeperThanArea) {
    precautions.push({
      title: "Switch to drip or scheduled irrigation",
      detail:
        "For farming use, irrigate early morning or evening and use drip/sprinkler lines to cut groundwater extraction by 30–40%.",
      priority: "medium",
    });
    precautions.push({
      title: "Log depth every 3 months consistently",
      detail:
        "Record depth before and after monsoon season under the same source ID so the AI forecast improves in accuracy.",
      priority: "tip",
    });
  }

  if (hasHealthRisk) {
    precautions.push({
      title: "Do not drink untreated water — boil or treat",
      detail:
        "Health-guideline parameters (such as E. coli, Arsenic, Nitrate, or Fluoride) were flagged. Use certified filtration or alternate safe water until re-tested.",
      priority: "high",
    });
  } else if (hasQualityWatch) {
    precautions.push({
      title: "Schedule a follow-up lab check",
      detail:
        "Physical/mineral readings (like TDS, pH, or hardness) are above standard screening benchmarks. Re-test after heavy rain or pump maintenance.",
      priority: "medium",
    });
  }

  if (!precautions.length) {
    precautions.push({
      title: "Maintain seasonal 3-month logging",
      detail:
        "Your source depth and trend look stable compared to the area average. Continue logging every 3 months to catch early seasonal drops.",
      priority: "tip",
    });
    precautions.push({
      title: "Keep wellhead sealed from surface runoff",
      detail:
        "Ensure the concrete apron around the tube well or borehole has no cracks so fertilizer or wastewater cannot seep in.",
      priority: "tip",
    });
  }

  return {
    conditionLabel,
    conditionTone,
    diffFromAreaM,
    areaAverageM: referenceAvg,
    summary: parts.join(" "),
    precautions,
  };
}

export type AreaSourceBreakdownItem = {
  sourceType: string;
  reportCount: number;
  averageDepthM: number | null;
  normalCount: number;
  moderateCount: number;
  highCount: number;
  incompleteCount: number;
  weightedRiskScore: number | null;
  riskLabel: "Normal" | "Moderate concern" | "High concern" | "Incomplete";
};

export type SourceRecommendation = {
  sourceType: string;
  averageDepthM: number | null;
  reportCount: number;
  riskLabel: string;
  reason: string;
  caution?: string;
};

export type AreaSourceIntelligence = {
  areaKey: string;
  totalReports: number;
  sourceBreakdown: AreaSourceBreakdownItem[];
  householdBest: SourceRecommendation | null;
  irrigationBest: SourceRecommendation | null;
};

/**
 * Analyze all source types in an area and automatically predict the most beneficial
 * source for (1) Household / Aam User and (2) Farmer / Irrigation.
 */
export function recommendAreaWaterSources(
  trends: PublicAreaSourceTrend[],
  areaKey: string
): AreaSourceIntelligence {
  const normalized = areaKey.trim().toLowerCase();
  const rows = trends.filter((r) => r.areaKey.trim().toLowerCase() === normalized);

  const grouped = new Map<
    string,
    {
      reportCount: number;
      depthTotal: number;
      depthCount: number;
      normalCount: number;
      moderateCount: number;
      highCount: number;
      incompleteCount: number;
    }
  >();

  for (const row of rows) {
    const type = row.sourceType?.trim() || "Unspecified source";
    const g = grouped.get(type) ?? {
      reportCount: 0,
      depthTotal: 0,
      depthCount: 0,
      normalCount: 0,
      moderateCount: 0,
      highCount: 0,
      incompleteCount: 0,
    };
    g.reportCount += row.reportCount;
    g.normalCount += row.normalCount;
    g.moderateCount += row.moderateCount;
    g.highCount += row.highCount;
    g.incompleteCount += row.incompleteCount;
    if (row.averageDepthM !== null && Number.isFinite(row.averageDepthM)) {
      g.depthTotal += row.averageDepthM * row.reportCount;
      g.depthCount += row.reportCount;
    }
    grouped.set(type, g);
  }

  const sourceBreakdown: AreaSourceBreakdownItem[] = [...grouped.entries()]
    .map(([sourceType, g]) => {
      const assessed = g.normalCount + g.moderateCount + g.highCount;
      const weightedRiskScore = assessed
        ? Number(
            ((g.normalCount * 0.5 + g.moderateCount + g.highCount * 2) / assessed).toFixed(2)
          )
        : null;
      const riskLabel: AreaSourceBreakdownItem["riskLabel"] =
        weightedRiskScore === null
          ? "Incomplete"
          : weightedRiskScore >= 1.5
            ? "High concern"
            : weightedRiskScore >= 0.75
              ? "Moderate concern"
              : "Normal";
      return {
        sourceType,
        reportCount: g.reportCount,
        averageDepthM: meanDepth(g.depthTotal, g.depthCount),
        normalCount: g.normalCount,
        moderateCount: g.moderateCount,
        highCount: g.highCount,
        incompleteCount: g.incompleteCount,
        weightedRiskScore,
        riskLabel,
      };
    })
    .sort((a, b) => b.reportCount - a.reportCount);

  const totalReports = sourceBreakdown.reduce((s, i) => s + i.reportCount, 0);
  if (!sourceBreakdown.length) {
    return {
      areaKey,
      totalReports: 0,
      sourceBreakdown: [],
      householdBest: null,
      irrigationBest: null,
    };
  }

  // 1. Household / Aam User score: lower risk is best, accessible depth + higher evidence help
  const householdScored = [...sourceBreakdown].sort((a, b) => {
    const riskA = a.weightedRiskScore ?? 1.25;
    const riskB = b.weightedRiskScore ?? 1.25;
    const depthPenaltyA = a.averageDepthM !== null ? Math.min(a.averageDepthM / 120, 1) * 0.35 : 0.25;
    const depthPenaltyB = b.averageDepthM !== null ? Math.min(b.averageDepthM / 120, 1) * 0.35 : 0.25;
    const domesticBonusA = ["hand pump", "borehole", "community well", "spring"].includes(
      a.sourceType.toLowerCase()
    )
      ? -0.15
      : 0;
    const domesticBonusB = ["hand pump", "borehole", "community well", "spring"].includes(
      b.sourceType.toLowerCase()
    )
      ? -0.15
      : 0;
    const scoreA = riskA + depthPenaltyA + domesticBonusA - Math.min(a.reportCount, 5) * 0.03;
    const scoreB = riskB + depthPenaltyB + domesticBonusB - Math.min(b.reportCount, 5) * 0.03;
    return scoreA - scoreB;
  });

  const topHouse = householdScored[0];
  const householdBest: SourceRecommendation = {
    sourceType: topHouse.sourceType,
    averageDepthM: topHouse.averageDepthM,
    reportCount: topHouse.reportCount,
    riskLabel: topHouse.riskLabel,
    reason:
      topHouse.riskLabel === "Normal"
        ? `Lowest quality risk in this area with ${topHouse.averageDepthM !== null ? `${topHouse.averageDepthM.toFixed(1)} m average depth` : "recorded readings"} across ${topHouse.reportCount} report${topHouse.reportCount === 1 ? "" : "s"}.`
        : `Best available household option in this area based on ${topHouse.reportCount} report${topHouse.reportCount === 1 ? "" : "s"}${topHouse.averageDepthM !== null ? ` (${topHouse.averageDepthM.toFixed(1)} m avg depth)` : ""}.`,
    caution:
      topHouse.riskLabel === "High concern"
        ? "Health-guideline flags exist in this area — boil or filter drinking water before use."
        : topHouse.riskLabel === "Moderate concern"
          ? "Some mineral/TDS flags recorded — consider basic filtration for drinking."
          : undefined,
  };

  // 2. Farmer / Irrigation score: prioritizes high-yield sources (Tube well, Borehole, Community well),
  //    sustainable depth, and avoids severely declining/shallow unreliable sources
  const irrigationYieldBonus = (type: string) => {
    const t = type.toLowerCase();
    if (t === "tube well") return -0.8;
    if (t === "borehole") return -0.55;
    if (t === "community well") return -0.35;
    if (t === "spring") return -0.15;
    return 0.4; // hand pump is low-discharge for irrigation
  };

  const irrigationScored = [...sourceBreakdown].sort((a, b) => {
    const riskA = (a.weightedRiskScore ?? 1.0) * 0.45;
    const riskB = (b.weightedRiskScore ?? 1.0) * 0.45;
    const depthPenaltyA = a.averageDepthM !== null ? Math.min(a.averageDepthM / 150, 1) * 0.35 : 0.2;
    const depthPenaltyB = b.averageDepthM !== null ? Math.min(b.averageDepthM / 150, 1) * 0.35 : 0.2;
    const scoreA = irrigationYieldBonus(a.sourceType) + riskA + depthPenaltyA - Math.min(a.reportCount, 5) * 0.04;
    const scoreB = irrigationYieldBonus(b.sourceType) + riskB + depthPenaltyB - Math.min(b.reportCount, 5) * 0.04;
    return scoreA - scoreB;
  });

  const topFarm = irrigationScored[0];
  const irrigationBest: SourceRecommendation = {
    sourceType: topFarm.sourceType,
    averageDepthM: topFarm.averageDepthM,
    reportCount: topFarm.reportCount,
    riskLabel: topFarm.riskLabel,
    reason: `Highest irrigation suitability in ${areaKey} with ${topFarm.averageDepthM !== null ? `${topFarm.averageDepthM.toFixed(1)} m average depth` : "tracked readings"} across ${topFarm.reportCount} report${topFarm.reportCount === 1 ? "" : "s"}.`,
    caution:
      topFarm.averageDepthM !== null && topFarm.averageDepthM > 50
        ? "Deep water table (>50 m) — use drip irrigation and off-peak pumping to save energy and prevent drawdown."
        : undefined,
  };

  return {
    areaKey,
    totalReports,
    sourceBreakdown,
    householdBest,
    irrigationBest,
  };
}
