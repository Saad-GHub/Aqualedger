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
export type ForecastPoint = { month: string; actual: number | null; projected: number | null; lower: number | null; upper: number | null; band: number | null };
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
  status: "Stable / improving" | "Declining · baseline insufficient" | "Normal trend" | "Moderate decline" | "High decline signal";
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
  status: "Stable / improving" | "Declining · baseline insufficient" | "Normal trend" | "Moderate decline" | "High decline signal";
  lastMonth: string;
  monthlyPoints: MonthlyDepthPoint[];
};

export function reportAreaKey(report: DepthForecastInput) {
  return report.areaKey?.trim() || report.areaName?.trim() || report.address.trim() || "Area not provided";
}

export function aggregateMonthlyDepths(reports: DepthForecastInput[], area: string, source: string): MonthlyDepthPoint[] {
  const buckets = new Map<string, { total: number; readings: number }>();
  for (const report of reports) {
    const depth = Number.parseFloat(report.depth ?? "");
    const date = report.sampleDate ?? "";
    if (reportAreaKey(report) !== area || (source !== "All sources" && (report.sourceType?.trim() || "Unspecified source") !== source)) continue;
    if (!Number.isFinite(depth) || depth < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const month = date.slice(0, 7);
    const bucket = buckets.get(month) ?? { total: 0, readings: 0 };
    bucket.total += depth;
    bucket.readings += 1;
    buckets.set(month, bucket);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, bucket]) => ({ month, depth: meanDepth(bucket.total, bucket.readings) ?? 0, readings: bucket.readings }));
}

export function aggregateSourceMonthlyDepths(reports: DepthForecastInput[], sourceId: string, createdBy: string): MonthlyDepthPoint[] {
  const buckets = new Map<string, { total: number; readings: number }>();
  for (const report of reports) {
    const depth = Number.parseFloat(report.depth ?? "");
    const date = report.sampleDate ?? "";
    if (report.sourceId !== sourceId || report.createdBy !== createdBy) continue;
    if (!Number.isFinite(depth) || depth < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const month = date.slice(0, 7);
    const bucket = buckets.get(month) ?? { total: 0, readings: 0 };
    bucket.total += depth;
    bucket.readings += 1;
    buckets.set(month, bucket);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, bucket]) => ({ month, depth: meanDepth(bucket.total, bucket.readings) ?? 0, readings: bucket.readings }));
}

const monthIndex = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return year * 12 + m - 1;
};
const monthLabel = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
};

export function forecastDepth(points: MonthlyDepthPoint[]): DepthForecast | null {
  if (points.length < 3 || monthIndex(points.at(-1)!.month) - monthIndex(points[0].month) < 3) return null;
  const x0 = monthIndex(points[0].month);
  const xs = points.map((point) => monthIndex(point.month) - x0);
  const ys = points.map((point) => point.depth);
  const n = points.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  const sxx = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (!sxx) return null;
  const slopePerMonth = xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / sxx;
  const intercept = meanY - slopePerMonth * meanX;
  const residuals = ys.map((value, index) => value - (intercept + slopePerMonth * xs[index]));
  const residualSum = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const totalSum = ys.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const rSquared = totalSum === 0 ? 1 : Math.max(0, Math.min(1, 1 - residualSum / totalSum));
  const latestIndex = monthIndex(points.at(-1)!.month);
  const lastMonth = monthLabel(latestIndex);
  const lastX = latestIndex - x0;
  const currentDepth = points.at(-1)!.depth;
  const predictions = Array.from({ length: 6 }, (_, i) => Math.max(0, intercept + slopePerMonth * (lastX + i + 1)));
  const depthInSixMonths = predictions[5];
  const changeInSixMonths = depthInSixMonths - currentDepth;
  const historicalChanges: number[] = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const span = monthIndex(points[j].month) - monthIndex(points[i].month);
    if (span >= 4 && span <= 8) historicalChanges.push(points[j].depth - points[i].depth);
  }
  const historicalDeclines = historicalChanges.filter((change) => change > 0);
  const normalThreshold = historicalDeclines.length >= 3 ? quantile(historicalDeclines, 0.5) : null;
  const highThreshold = historicalDeclines.length >= 3 ? quantile(historicalDeclines, 0.9) : null;
  let status: DepthForecast["status"];
  if (changeInSixMonths <= 0.05) status = "Stable / improving";
  else if (normalThreshold === null || highThreshold === null) status = "Declining · baseline insufficient";
  else if (changeInSixMonths <= normalThreshold) status = "Normal trend";
  else if (changeInSixMonths <= highThreshold) status = "Moderate decline";
  else status = "High decline signal";
  const span = xs.at(-1)! - xs[0];
  const confidence: DepthForecast["confidence"] = n >= 8 && span >= 12 && rSquared >= 0.65 ? "Higher" : n >= 5 && span >= 6 ? "Moderate" : "Low";
  const residualScale = Math.sqrt(residualSum / Math.max(1, n - 2));
  const chart: ForecastPoint[] = points.map((point) => ({ month: point.month, actual: point.depth, projected: null, lower: null, upper: null, band: null }));
  const fittedAtLast = Math.max(0, intercept + slopePerMonth * lastX);
  chart[chart.length - 1] = { ...chart.at(-1)!, projected: fittedAtLast, lower: fittedAtLast, upper: fittedAtLast, band: 0 };
  predictions.forEach((projected, i) => {
    const x = lastX + i + 1;
    const leverage = Math.sqrt(1 + 1 / n + ((x - meanX) ** 2 / sxx));
    const uncertainty = 1.96 * residualScale * leverage;
    const lower = Math.max(0, projected - uncertainty);
    const upper = projected + uncertainty;
    chart.push({ month: monthLabel(latestIndex + i + 1), actual: null, projected, lower, upper, band: upper - lower });
  });
  return { points, chart, slopePerMonth, changeInSixMonths, depthInSixMonths, rSquared, confidence, historyWindows: historicalDeclines.length, normalThreshold, highThreshold, status, lastMonth };
}

// Separate per-source projection. The existing area/source-category forecast above remains unchanged.
export function forecastDepthForHorizon(points: MonthlyDepthPoint[], horizonMonths: number): SourceDepthProjection | null {
  if (points.length < 2 || monthIndex(points.at(-1)!.month) - monthIndex(points[0].month) < 1) return null;
  const x0 = monthIndex(points[0].month);
  const xs = points.map((point) => monthIndex(point.month) - x0);
  const ys = points.map((point) => point.depth);
  const n = points.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  const sxx = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (!sxx) return null;
  const slopePerMonth = xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / sxx;
  const intercept = meanY - slopePerMonth * meanX;
  const residuals = ys.map((value, index) => value - (intercept + slopePerMonth * xs[index]));
  const residualSum = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const totalSum = ys.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const rSquared = totalSum === 0 ? 1 : Math.max(0, Math.min(1, 1 - residualSum / totalSum));
  const latestIndex = monthIndex(points.at(-1)!.month);
  const lastMonth = monthLabel(latestIndex);
  const lastX = latestIndex - x0;
  const currentDepth = points.at(-1)!.depth;
  const projectedDepth = Math.max(0, intercept + slopePerMonth * (lastX + horizonMonths));
  const projectedChange = projectedDepth - currentDepth;
  const historicalRates: number[] = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const span = monthIndex(points[j].month) - monthIndex(points[i].month);
    const change = points[j].depth - points[i].depth;
    if (span >= 4 && span <= 8 && change > 0) historicalRates.push(change / span);
  }
  const normalRate = historicalRates.length >= 3 ? quantile(historicalRates, 0.5) : null;
  const highRate = historicalRates.length >= 3 ? quantile(historicalRates, 0.9) : null;
  const normalThreshold = normalRate === null ? null : normalRate * horizonMonths;
  const highThreshold = highRate === null ? null : highRate * horizonMonths;
  let status: SourceDepthProjection["status"];
  if (projectedChange <= 0.05) status = "Stable / improving";
  else if (normalThreshold === null || highThreshold === null) status = "Declining · baseline insufficient";
  else if (projectedChange <= normalThreshold) status = "Normal trend";
  else if (projectedChange <= highThreshold) status = "Moderate decline";
  else status = "High decline signal";
  const span = xs.at(-1)! - xs[0];
  const confidence: SourceDepthProjection["confidence"] = n >= 8 && span >= 12 && rSquared >= 0.65 ? "Higher" : n >= 5 && span >= 6 ? "Moderate" : "Low";
  const residualScale = Math.max(0.05, Math.sqrt(residualSum / Math.max(1, n - 2)));
  const chart: ForecastPoint[] = points.map((point) => ({ month: point.month, actual: point.depth, projected: null, lower: null, upper: null, band: null }));
  const fittedAtLast = Math.max(0, intercept + slopePerMonth * lastX);
  chart[chart.length - 1] = { ...chart.at(-1)!, projected: fittedAtLast, lower: fittedAtLast, upper: fittedAtLast, band: 0 };
  for (let i = 0; i < horizonMonths; i++) {
    const x = lastX + i + 1;
    const projected = Math.max(0, intercept + slopePerMonth * x);
    const uncertainty = 1.96 * residualScale * Math.sqrt(1 + 1 / n + ((x - meanX) ** 2 / sxx));
    const lower = Math.max(0, projected - uncertainty);
    const upper = projected + uncertainty;
    chart.push({ month: monthLabel(latestIndex + i + 1), actual: null, projected, lower, upper, band: upper - lower });
  }
  return { chart, slopePerMonth, projectedChange, projectedDepth, horizonMonths, rSquared, confidence, historyWindows: historicalRates.length, normalThreshold, highThreshold, status, lastMonth, monthlyPoints: points };
}
