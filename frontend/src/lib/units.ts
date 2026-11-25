// Depth unit helpers: show metres and feet together so either reader can follow.
export const METRES_PER_FOOT = 0.3048;

export const feetToMetres = (ft: number) => ft * METRES_PER_FOOT;
export const metresToFeet = (m: number) => m / METRES_PER_FOOT;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** 18.04 → "18.0 m · 59 ft" (metres first). */
export function depthM(metres: number | null | undefined, digits = 1) {
  if (!isNumber(metres)) return "—";
  return `${metres.toFixed(digits)} m · ${Math.round(metresToFeet(metres)).toLocaleString()} ft`;
}

/** 130 → "130 ft · 39.6 m" (feet first, for census figures recorded in feet). */
export function depthFt(feet: number | null | undefined) {
  if (!isNumber(feet)) return "—";
  return `${Math.round(feet).toLocaleString()} ft · ${feetToMetres(feet).toFixed(1)} m`;
}

/** Just the converted part: metres → "59 ft". */
export const asFeet = (metres: number | null | undefined) =>
  isNumber(metres) ? `${Math.round(metresToFeet(metres)).toLocaleString()} ft` : "";

/** Just the converted part: feet → "39.6 m". */
export const asMetres = (feet: number | null | undefined) =>
  isNumber(feet) ? `${feetToMetres(feet).toFixed(1)} m` : "";

/** Rate in metres/year → "0.27 m/yr · 0.9 ft/yr". */
export function rateM(metresPerYear: number | null | undefined, digits = 2) {
  if (!isNumber(metresPerYear)) return "—";
  const sign = metresPerYear > 0 ? "+" : "";
  return `${sign}${metresPerYear.toFixed(digits)} m/yr · ${sign}${metresToFeet(metresPerYear).toFixed(1)} ft/yr`;
}
